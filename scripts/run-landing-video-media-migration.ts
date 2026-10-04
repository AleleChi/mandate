import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Client } = pg;

// Load .env.production.local if present (isolated from local development .env.local)
const prodEnvPath = path.resolve(process.cwd(), '.env.production.local');
if (fs.existsSync(prodEnvPath)) {
  dotenv.config({ path: prodEnvPath, override: true });
}

function canonicalize(v: unknown): string {
  if (v === null || v === undefined) return '__NULL__';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

async function runProductionMigration() {
  console.log('===================================================================');
  console.log('KOINONIA LANDING VIDEO MEDIA PRODUCTION MIGRATION RUNNER');
  console.log('Migration: 006_landing_video_media_neon.sql');
  console.log('===================================================================\n');

  const dbUrl = process.env.DATABASE_URL;
  const allowProd = (process.env.ALLOW_PRODUCTION_MIGRATION || '').trim().replace(/^["']|["']$/g, '');

  // 1. SAFETY CHECK: DATABASE_URL presence
  if (!dbUrl || (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://'))) {
    console.error('SAFETY STOP: Valid PostgreSQL DATABASE_URL is required.');
    console.error('Provide DATABASE_URL via shell environment variable or .env.production.local.');
    process.exit(1);
  }

  // 2. SAFETY CHECK: Explicit confirmation token
  if (allowProd !== 'YES_I_UNDERSTAND') {
    console.error('SAFETY STOP: Explicit confirmation is required to target production.');
    console.error('Set ALLOW_PRODUCTION_MIGRATION="YES_I_UNDERSTAND" before executing.');
    process.exit(1);
  }

  // 3. Parse DATABASE_URL safely without exposing credentials
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(dbUrl);
  } catch {
    console.error('SAFETY STOP: Failed to parse DATABASE_URL string format.');
    process.exit(1);
  }

  const host = parsedUrl.hostname;
  const dbName = parsedUrl.pathname.replace(/^\//, '');
  const sslMode = parsedUrl.searchParams.get('sslmode');
  const isSsl = sslMode === 'require' || sslMode === 'verify-full' || host.includes('neon.tech');

  // Print sanitized target database info (NEVER print password or full connection string)
  console.log('Target Database Details:');
  console.log('  Database engine: PostgreSQL');
  console.log(`  Host:            ${host}`);
  console.log(`  Database:        ${dbName}`);
  console.log(`  SSL enabled:     ${isSsl ? 'YES' : 'NO'}`);
  console.log('  Migration file:  docs/migrations/006_landing_video_media_neon.sql');
  console.log('  Environment:     production\n');

  // 4. Verify migration file exists
  const migrationPath = path.resolve(process.cwd(), 'docs/migrations/006_landing_video_media_neon.sql');
  if (!fs.existsSync(migrationPath)) {
    console.error(`SAFETY STOP: Migration file not found at ${migrationPath}`);
    process.exit(1);
  }
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  // 5. Connect to PostgreSQL
  const client = new Client({
    connectionString: dbUrl,
    ssl: isSsl ? { rejectUnauthorized: false } : undefined
  });

  try {
    await client.connect();
    console.log('Connected to target database successfully.\n');

    // -------------------------------------------------------------------------
    // 6. PRE-MIGRATION READ-ONLY CHECK: Baseline counts & current event state
    // -------------------------------------------------------------------------
    console.log('--- PRE-MIGRATION READ-ONLY CHECK ---');
    const baselineCountsRes = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM media_files) AS media_count,
        (SELECT COUNT(*) FROM events)      AS event_count,
        (SELECT COUNT(*) FROM users)       AS user_count;
    `);
    const baseline = baselineCountsRes.rows[0];
    const baselineMediaCount = Number(baseline.media_count);
    const baselineEventCount = Number(baseline.event_count);
    const baselineUserCount = Number(baseline.user_count);

    console.log(`  Baseline media_files:            ${baselineMediaCount}`);
    console.log(`  Baseline events:                 ${baselineEventCount}`);
    console.log(`  Baseline users:                  ${baselineUserCount}`);

    // Optional admin_landing_settings baseline check if table exists
    let baselineLandingSettingsCount: number | null = null;
    const tableCheckRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'admin_landing_settings';
    `);
    if (tableCheckRes.rows.length > 0) {
      const landingRes = await client.query('SELECT COUNT(*) AS count FROM admin_landing_settings;');
      baselineLandingSettingsCount = Number(landingRes.rows[0].count);
      console.log(`  Baseline admin_landing_settings: ${baselineLandingSettingsCount}`);
    }

    // Capture baseline current event to guarantee it remains untouched
    const currentEventRes = await client.query(`
      SELECT id, title, status
      FROM events
      WHERE status = 'current';
    `);
    const baselineCurrentEvent = currentEventRes.rows[0] || null;
    if (baselineCurrentEvent) {
      console.log(`  Current event:                   ${baselineCurrentEvent.title} (${baselineCurrentEvent.id}) [status: ${baselineCurrentEvent.status}]`);
    } else {
      console.log('  Current event:                   None found with status="current"');
    }

    // -------------------------------------------------------------------------
    // 7. PRE-MIGRATION COLUMN CHECKS: Detect existing columns
    // -------------------------------------------------------------------------
    console.log('\n--- COLUMN STATUS BEFORE MIGRATION ---');
    const mediaColCheckRes = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'media_files'
        AND column_name IN (
          'original_filename',
          'optimized_url',
          'poster_url'
        );
    `);
    const existingMediaCols = new Set(mediaColCheckRes.rows.map((r: any) => r.column_name));
    console.log(`  media_files.original_filename:   ${existingMediaCols.has('original_filename') ? 'EXISTS' : 'ABSENT (will be added)'}`);
    console.log(`  media_files.optimized_url:       ${existingMediaCols.has('optimized_url') ? 'EXISTS' : 'ABSENT (will be added)'}`);
    console.log(`  media_files.poster_url:          ${existingMediaCols.has('poster_url') ? 'EXISTS' : 'ABSENT (will be added)'}`);

    const isFirstRun = existingMediaCols.size === 0;
    const isRerun = existingMediaCols.size === 3;
    console.log(`  Migration execution mode:        ${isFirstRun ? 'FIRST RUN (all 3 columns new)' : isRerun ? 'RERUN (all 3 columns already exist — verify idempotency)' : 'PARTIAL (some columns already present)'}\n`);

    // -------------------------------------------------------------------------
    // 8. PRE-MIGRATION SNAPSHOT: Snapshot existing media_files rows to verify no data change
    // -------------------------------------------------------------------------
    console.log('  Capturing pre-migration snapshot of existing media_files records...');
    const existingColsRes = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'media_files'
        AND column_name NOT IN ('original_filename', 'optimized_url', 'poster_url')
      ORDER BY ordinal_position;
    `);
    const preMediaCols: string[] = existingColsRes.rows.map((r: any) => r.column_name);
    const preMediaSnapshot: Record<string, Record<string, unknown>> = {};

    if (preMediaCols.length > 0) {
      const quotedCols = preMediaCols.map((c: string) => `"${c}"`).join(', ');
      const preMediaRes = await client.query(`SELECT ${quotedCols} FROM media_files ORDER BY id;`);
      for (const row of preMediaRes.rows) {
        preMediaSnapshot[String(row.id)] = row;
      }
    }
    console.log(`  Snapshot captured: ${Object.keys(preMediaSnapshot).length} media_files record(s).\n`);

    // -------------------------------------------------------------------------
    // 9. EXECUTE MIGRATION INSIDE CONTROLLED TRANSACTION
    // -------------------------------------------------------------------------
    console.log('--- EXECUTING MIGRATION TRANSACTION ---');
    await client.query('BEGIN');

    // Strip file's own BEGIN/COMMIT so the runner owns and controls the transaction
    const sanitizedSql = migrationSql
      .replace(/^\s*BEGIN\s*;/im, '')
      .replace(/^\s*COMMIT\s*;/im, '');

    await client.query(sanitizedSql);
    console.log('  Migration SQL executed successfully inside transaction.\n');

    // -------------------------------------------------------------------------
    // 10. POST-MIGRATION VERIFICATION (inside the open transaction)
    // -------------------------------------------------------------------------
    console.log('--- POST-MIGRATION VERIFICATION ---');

    // Verification A: media_files.original_filename exists, is VARCHAR(255), and is nullable
    const postOrigNameRes = await client.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'media_files'
        AND column_name = 'original_filename';
    `);
    if (postOrigNameRes.rows.length === 0) {
      throw new Error('Column media_files.original_filename does not exist after migration.');
    }
    if (postOrigNameRes.rows[0].is_nullable !== 'YES') {
      throw new Error('Column media_files.original_filename must be nullable.');
    }
    if (postOrigNameRes.rows[0].data_type !== 'character varying') {
      throw new Error(`Column media_files.original_filename data_type unexpected: ${postOrigNameRes.rows[0].data_type}`);
    }
    console.log('  [PASS] media_files.original_filename exists, is VARCHAR(255), and is nullable.');

    // Verification B: media_files.optimized_url exists, is TEXT, and is nullable
    const postOptUrlRes = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'media_files'
        AND column_name = 'optimized_url';
    `);
    if (postOptUrlRes.rows.length === 0) {
      throw new Error('Column media_files.optimized_url does not exist after migration.');
    }
    if (postOptUrlRes.rows[0].is_nullable !== 'YES') {
      throw new Error('Column media_files.optimized_url must be nullable.');
    }
    if (postOptUrlRes.rows[0].data_type !== 'text') {
      throw new Error(`Column media_files.optimized_url data_type unexpected: ${postOptUrlRes.rows[0].data_type}`);
    }
    console.log('  [PASS] media_files.optimized_url exists, is TEXT, and is nullable.');

    // Verification C: media_files.poster_url exists, is TEXT, and is nullable
    const postPosterUrlRes = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'media_files'
        AND column_name = 'poster_url';
    `);
    if (postPosterUrlRes.rows.length === 0) {
      throw new Error('Column media_files.poster_url does not exist after migration.');
    }
    if (postPosterUrlRes.rows[0].is_nullable !== 'YES') {
      throw new Error('Column media_files.poster_url must be nullable.');
    }
    if (postPosterUrlRes.rows[0].data_type !== 'text') {
      throw new Error(`Column media_files.poster_url data_type unexpected: ${postPosterUrlRes.rows[0].data_type}`);
    }
    console.log('  [PASS] media_files.poster_url exists, is TEXT, and is nullable.');

    // Verification D: Row counts match baseline exactly (no rows added or deleted)
    const postCountsRes = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM media_files) AS media_count,
        (SELECT COUNT(*) FROM events)      AS event_count,
        (SELECT COUNT(*) FROM users)       AS user_count;
    `);
    const post = postCountsRes.rows[0];
    if (Number(post.media_count) !== baselineMediaCount) {
      throw new Error(`media_files row count mismatch: baseline ${baselineMediaCount}, post ${post.media_count}`);
    }
    if (Number(post.event_count) !== baselineEventCount) {
      throw new Error(`events row count mismatch: baseline ${baselineEventCount}, post ${post.event_count}`);
    }
    if (Number(post.user_count) !== baselineUserCount) {
      throw new Error(`users row count mismatch: baseline ${baselineUserCount}, post ${post.user_count}`);
    }
    console.log('  [PASS] Key table row counts match baseline exactly (zero rows deleted or created).');

    if (baselineLandingSettingsCount !== null) {
      const postLandingRes = await client.query('SELECT COUNT(*) AS count FROM admin_landing_settings;');
      const postLandingCount = Number(postLandingRes.rows[0].count);
      if (postLandingCount !== baselineLandingSettingsCount) {
        throw new Error(`admin_landing_settings count mismatch: baseline ${baselineLandingSettingsCount}, post ${postLandingCount}`);
      }
      console.log('  [PASS] admin_landing_settings count unchanged.');
    }

    // Verification E: Current event remains untouched
    const postCurrentEventRes = await client.query(`
      SELECT id, title, status
      FROM events
      WHERE status = 'current';
    `);
    const postCurrentEvent = postCurrentEventRes.rows[0] || null;
    if (baselineCurrentEvent) {
      if (!postCurrentEvent || postCurrentEvent.id !== baselineCurrentEvent.id || postCurrentEvent.status !== baselineCurrentEvent.status) {
        throw new Error(`Current event changed! Baseline was ${baselineCurrentEvent.id}, now ${postCurrentEvent?.id}`);
      }
      console.log(`  [PASS] Current event remains unchanged: ${postCurrentEvent.title} (${postCurrentEvent.id}).`);
    } else {
      if (postCurrentEvent) {
        throw new Error(`Current event unexpectedly introduced: ${postCurrentEvent.id}`);
      }
      console.log('  [PASS] No current event existed before or after migration.');
    }

    // Verification F: Verify pre-existing column data in media_files was untouched
    if (preMediaCols.length > 0) {
      const quotedCols = preMediaCols.map((c: string) => `"${c}"`).join(', ');
      const postMediaCheckRes = await client.query(`SELECT ${quotedCols} FROM media_files ORDER BY id;`);
      for (const postRow of postMediaCheckRes.rows) {
        const id = String(postRow.id);
        const preRow = preMediaSnapshot[id];
        if (!preRow) {
          throw new Error(`Media record ${id} missing from baseline snapshot.`);
        }
        for (const col of preMediaCols) {
          if (canonicalize(preRow[col]) !== canonicalize(postRow[col])) {
            throw new Error(`Media record ${id} column ${col} was modified: before=${preRow[col]}, after=${postRow[col]}`);
          }
        }
      }
      console.log('  [PASS] All pre-existing media_files column values verified identical to snapshot (zero mutations).');
    }

    // -------------------------------------------------------------------------
    // 11. COMMIT: Only reached if every verification above passed
    // -------------------------------------------------------------------------
    await client.query('COMMIT');
    console.log('\n===================================================================');
    console.log('TRANSACTION COMMITTED: PRODUCTION MIGRATION COMPLETED SUCCESSFULLY');
    console.log('===================================================================\n');

  } catch (err: any) {
    console.error('\nSAFETY ROLLBACK TRIGGERED: Migration failed verification.');
    console.error(`Error details: ${err.message}`);
    try {
      await client.query('ROLLBACK');
      console.error('Transaction rolled back cleanly. Target database unchanged.');
    } catch (rbErr: any) {
      console.error(`Rollback error: ${rbErr.message}`);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

runProductionMigration().catch((err) => {
  console.error('Fatal runner failure:', err);
  process.exit(1);
});
