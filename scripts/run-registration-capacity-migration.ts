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
  console.log('KOINONIA REGISTRATION & CAPACITY PRODUCTION MIGRATION RUNNER');
  console.log('Migration: 005_registration_capacity_neon.sql');
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
  console.log('  Migration file:  docs/migrations/005_registration_capacity_neon.sql');
  console.log('  Environment:     production\n');

  // 4. Verify migration file exists
  const migrationPath = path.resolve(process.cwd(), 'docs/migrations/005_registration_capacity_neon.sql');
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
        (SELECT COUNT(*) FROM events)                 AS event_count,
        (SELECT COUNT(*) FROM event_locations)        AS location_count,
        (SELECT COUNT(*) FROM users)                  AS user_count,
        (SELECT COUNT(*) FROM children)               AS child_count,
        (SELECT COUNT(*) FROM child_event_entries)    AS entry_count,
        (SELECT COUNT(*) FROM event_duty_assignments) AS duty_count;
    `);
    const baseline = baselineCountsRes.rows[0];
    const baselineEventCount    = Number(baseline.event_count);
    const baselineLocationCount = Number(baseline.location_count);
    const baselineUserCount     = Number(baseline.user_count);
    const baselineChildCount    = Number(baseline.child_count);
    const baselineEntryCount    = Number(baseline.entry_count);
    const baselineDutyCount     = Number(baseline.duty_count);

    console.log(`  Baseline events:                 ${baselineEventCount}`);
    console.log(`  Baseline event_locations:        ${baselineLocationCount}`);
    console.log(`  Baseline users:                  ${baselineUserCount}`);
    console.log(`  Baseline children:               ${baselineChildCount}`);
    console.log(`  Baseline child_event_entries:    ${baselineEntryCount}`);
    console.log(`  Baseline event_duty_assignments: ${baselineDutyCount}`);

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

    // events columns
    const eventsColCheckRes = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'events'
        AND column_name IN (
          'volunteer_registration_opens_at',
          'volunteer_registration_closes_at',
          'capacity'
        );
    `);
    const existingEventCols = new Set(eventsColCheckRes.rows.map((r: any) => r.column_name));
    console.log(`  events.volunteer_registration_opens_at:  ${existingEventCols.has('volunteer_registration_opens_at') ? 'EXISTS' : 'ABSENT (will be added)'}`);
    console.log(`  events.volunteer_registration_closes_at: ${existingEventCols.has('volunteer_registration_closes_at') ? 'EXISTS' : 'ABSENT (will be added)'}`);
    console.log(`  events.capacity:                         ${existingEventCols.has('capacity') ? 'EXISTS' : 'ABSENT (will be added)'}`);

    // event_locations columns
    const locsColCheckRes = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'event_locations'
        AND column_name = 'volunteer_capacity';
    `);
    const existingLocCols = new Set(locsColCheckRes.rows.map((r: any) => r.column_name));
    console.log(`  event_locations.volunteer_capacity:      ${existingLocCols.has('volunteer_capacity') ? 'EXISTS' : 'ABSENT (will be added)'}`);

    const isFirstRun = existingEventCols.size === 0 && existingLocCols.size === 0;
    const isRerun = existingEventCols.size === 3 && existingLocCols.size === 1;
    console.log(`  Migration execution mode:                ${isFirstRun ? 'FIRST RUN (all 4 columns new)' : isRerun ? 'RERUN (all 4 columns already exist — verify idempotency)' : 'PARTIAL (some columns already present)'}\n`);

    // -------------------------------------------------------------------------
    // 8. PRE-MIGRATION SNAPSHOT: Snapshot existing rows to verify no data change
    // -------------------------------------------------------------------------
    console.log('  Capturing pre-migration snapshot of existing events and event_locations...');

    // Discover pre-existing columns on events (exclude new columns if not yet created)
    const existingEventsColsRes = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'events'
        AND column_name NOT IN ('volunteer_registration_opens_at', 'volunteer_registration_closes_at', 'capacity')
      ORDER BY ordinal_position;
    `);
    const preEventCols = existingEventsColsRes.rows.map((r: any) => r.column_name);
    const preEventSnapshotRes = await client.query(
      `SELECT ${preEventCols.join(', ')} FROM events ORDER BY id;`
    );
    const preEventSnapshot: Record<string, Record<string, unknown>> = {};
    for (const row of preEventSnapshotRes.rows) {
      preEventSnapshot[String(row.id)] = row;
    }

    // Discover pre-existing columns on event_locations (exclude volunteer_capacity if not yet created)
    const existingLocColsRes = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'event_locations'
        AND column_name != 'volunteer_capacity'
      ORDER BY ordinal_position;
    `);
    const preLocCols = existingLocColsRes.rows.map((r: any) => r.column_name);
    const preLocSnapshotRes = await client.query(
      `SELECT ${preLocCols.join(', ')} FROM event_locations ORDER BY id;`
    );
    const preLocSnapshot: Record<string, Record<string, unknown>> = {};
    for (const row of preLocSnapshotRes.rows) {
      preLocSnapshot[String(row.id)] = row;
    }

    console.log(`  Snapshot captured: ${Object.keys(preEventSnapshot).length} event(s), ${Object.keys(preLocSnapshot).length} location(s).\n`);

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

    // Verification A: events.volunteer_registration_opens_at exists and is nullable
    const postVolOpenRes = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'events'
        AND column_name = 'volunteer_registration_opens_at';
    `);
    if (postVolOpenRes.rows.length === 0) {
      throw new Error('Column events.volunteer_registration_opens_at does not exist after migration.');
    }
    if (postVolOpenRes.rows[0].is_nullable !== 'YES') {
      throw new Error('Column events.volunteer_registration_opens_at must be nullable.');
    }
    console.log('  [PASS] events.volunteer_registration_opens_at exists and is nullable.');

    // Verification B: events.volunteer_registration_closes_at exists and is nullable
    const postVolCloseRes = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'events'
        AND column_name = 'volunteer_registration_closes_at';
    `);
    if (postVolCloseRes.rows.length === 0) {
      throw new Error('Column events.volunteer_registration_closes_at does not exist after migration.');
    }
    if (postVolCloseRes.rows[0].is_nullable !== 'YES') {
      throw new Error('Column events.volunteer_registration_closes_at must be nullable.');
    }
    console.log('  [PASS] events.volunteer_registration_closes_at exists and is nullable.');

    // Verification C: events.capacity exists, is integer, and is nullable
    const postEventCapRes = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'events'
        AND column_name = 'capacity';
    `);
    if (postEventCapRes.rows.length === 0) {
      throw new Error('Column events.capacity does not exist after migration.');
    }
    if (postEventCapRes.rows[0].is_nullable !== 'YES') {
      throw new Error('Column events.capacity must be nullable.');
    }
    if (!['integer', 'smallint', 'bigint'].includes(postEventCapRes.rows[0].data_type)) {
      throw new Error(`Column events.capacity has unexpected type: ${postEventCapRes.rows[0].data_type}`);
    }
    console.log('  [PASS] events.capacity exists, is integer, and is nullable.');

    // Verification D: event_locations.volunteer_capacity exists, is integer, and is nullable
    const postLocVolCapRes = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'event_locations'
        AND column_name = 'volunteer_capacity';
    `);
    if (postLocVolCapRes.rows.length === 0) {
      throw new Error('Column event_locations.volunteer_capacity does not exist after migration.');
    }
    if (postLocVolCapRes.rows[0].is_nullable !== 'YES') {
      throw new Error('Column event_locations.volunteer_capacity must be nullable.');
    }
    if (!['integer', 'smallint', 'bigint'].includes(postLocVolCapRes.rows[0].data_type)) {
      throw new Error(`Column event_locations.volunteer_capacity has unexpected type: ${postLocVolCapRes.rows[0].data_type}`);
    }
    console.log('  [PASS] event_locations.volunteer_capacity exists, is integer, and is nullable.');

    // Verification E: Row counts match baseline exactly (no rows added or deleted)
    const postCountsRes = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM events)                 AS event_count,
        (SELECT COUNT(*) FROM event_locations)        AS location_count,
        (SELECT COUNT(*) FROM users)                  AS user_count,
        (SELECT COUNT(*) FROM children)               AS child_count,
        (SELECT COUNT(*) FROM child_event_entries)    AS entry_count,
        (SELECT COUNT(*) FROM event_duty_assignments) AS duty_count;
    `);
    const post = postCountsRes.rows[0];
    if (Number(post.event_count) !== baselineEventCount) {
      throw new Error(`Event row count mismatch: baseline ${baselineEventCount}, post ${post.event_count}`);
    }
    if (Number(post.location_count) !== baselineLocationCount) {
      throw new Error(`Location row count mismatch: baseline ${baselineLocationCount}, post ${post.location_count}`);
    }
    if (Number(post.user_count) !== baselineUserCount) {
      throw new Error(`User row count mismatch: baseline ${baselineUserCount}, post ${post.user_count}`);
    }
    if (Number(post.child_count) !== baselineChildCount) {
      throw new Error(`Child row count mismatch: baseline ${baselineChildCount}, post ${post.child_count}`);
    }
    if (Number(post.entry_count) !== baselineEntryCount) {
      throw new Error(`Entry row count mismatch: baseline ${baselineEntryCount}, post ${post.entry_count}`);
    }
    if (Number(post.duty_count) !== baselineDutyCount) {
      throw new Error(`Duty row count mismatch: baseline ${baselineDutyCount}, post ${post.duty_count}`);
    }
    console.log('  [PASS] All table row counts match baseline exactly (zero rows deleted or created).');

    // Verification F: Current event remains untouched
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

    // Verification G: Verify pre-existing column data in events and event_locations was untouched
    const postEventsCheckRes = await client.query(
      `SELECT ${preEventCols.join(', ')} FROM events ORDER BY id;`
    );
    for (const postRow of postEventsCheckRes.rows) {
      const id = String(postRow.id);
      const preRow = preEventSnapshot[id];
      if (!preRow) {
        throw new Error(`Event row ${id} missing from baseline snapshot.`);
      }
      for (const col of preEventCols) {
        if (canonicalize(preRow[col]) !== canonicalize(postRow[col])) {
          throw new Error(`Event ${id} column ${col} was modified: before=${preRow[col]}, after=${postRow[col]}`);
        }
      }
    }
    console.log('  [PASS] All pre-existing events column values verified identical to snapshot.');

    const postLocsCheckRes = await client.query(
      `SELECT ${preLocCols.join(', ')} FROM event_locations ORDER BY id;`
    );
    for (const postRow of postLocsCheckRes.rows) {
      const id = String(postRow.id);
      const preRow = preLocSnapshot[id];
      if (!preRow) {
        throw new Error(`Location row ${id} missing from baseline snapshot.`);
      }
      for (const col of preLocCols) {
        if (canonicalize(preRow[col]) !== canonicalize(postRow[col])) {
          throw new Error(`Location ${id} column ${col} was modified: before=${preRow[col]}, after=${postRow[col]}`);
        }
      }
    }
    console.log('  [PASS] All pre-existing event_locations column values verified identical to snapshot.');

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
