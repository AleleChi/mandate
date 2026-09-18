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

async function runProductionMigration() {
  console.log('===================================================================');
  console.log('KOINONIA EVENT AUTOMATIONS PRODUCTION MIGRATION RUNNER');
  console.log('Migration: 007_event_automations_neon.sql');
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
  console.log('  Migration file:  docs/migrations/007_event_automations_neon.sql');
  console.log('  Environment:     production\n');

  // 4. Verify migration file exists
  const migrationPath = path.resolve(process.cwd(), 'docs/migrations/007_event_automations_neon.sql');
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
    // 6. PRE-MIGRATION SNAPSHOT: Baseline counts & current event state
    // -------------------------------------------------------------------------
    console.log('--- PRE-MIGRATION READ-ONLY SNAPSHOT ---');

    // Capture baseline counts for critical operational tables
    const baselineCountsRes = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM events)                       AS event_count,
        (SELECT COUNT(*) FROM event_duty_assignments)       AS duty_count,
        (SELECT COUNT(*) FROM event_duty_location_presence) AS presence_count,
        (SELECT COUNT(*) FROM report_jobs)                  AS report_jobs_count,
        (SELECT COUNT(*) FROM generated_reports)            AS generated_reports_count,
        (SELECT COUNT(*) FROM notification_jobs)            AS notification_jobs_count;
    `);
    const baseline = baselineCountsRes.rows[0];
    const baselineEventCount = Number(baseline.event_count);
    const baselineDutyCount = Number(baseline.duty_count);
    const baselinePresenceCount = Number(baseline.presence_count);
    const baselineReportJobsCount = Number(baseline.report_jobs_count);
    const baselineGeneratedReportsCount = Number(baseline.generated_reports_count);
    const baselineNotificationJobsCount = Number(baseline.notification_jobs_count);

    console.log(`  Baseline events:                       ${baselineEventCount}`);
    console.log(`  Baseline event_duty_assignments:       ${baselineDutyCount}`);
    console.log(`  Baseline event_duty_location_presence: ${baselinePresenceCount}`);
    console.log(`  Baseline report_jobs:                  ${baselineReportJobsCount}`);
    console.log(`  Baseline generated_reports:            ${baselineGeneratedReportsCount}`);
    console.log(`  Baseline notification_jobs:            ${baselineNotificationJobsCount}`);

    // Capture baseline current event
    const currentEventRes = await client.query(`
      SELECT id, title, status
      FROM events
      WHERE status IN ('current', 'open', 'active')
      ORDER BY CASE status WHEN 'current' THEN 1 WHEN 'open' THEN 2 ELSE 3 END, starts_at ASC
      LIMIT 1;
    `);
    const baselineCurrentEvent = currentEventRes.rows[0] || null;
    if (baselineCurrentEvent) {
      console.log(`  Current event:                         ${baselineCurrentEvent.title} (${baselineCurrentEvent.id}) [status: ${baselineCurrentEvent.status}]`);
    } else {
      console.log('  Current event:                         None found');
    }

    // Check pre-existing automation tables
    const tableCheckRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('event_automations', 'event_automation_settings');
    `);
    const preExistingTables = new Set(tableCheckRes.rows.map((r: any) => r.table_name));
    const isFirstRun = preExistingTables.size === 0;
    const isRerun = preExistingTables.size === 2;

    console.log(`  event_automations table:               ${preExistingTables.has('event_automations') ? 'EXISTS' : 'ABSENT (will be created)'}`);
    console.log(`  event_automation_settings table:       ${preExistingTables.has('event_automation_settings') ? 'EXISTS' : 'ABSENT (will be created)'}`);
    console.log(`  Execution mode:                        ${isFirstRun ? 'FIRST RUN (new tables)' : isRerun ? 'RERUN (tables exist — idempotent verify)' : 'PARTIAL'}\n`);

    let preAutomationsCount = 0;
    let preSettingsCount = 0;
    if (preExistingTables.has('event_automations')) {
      const c = await client.query('SELECT COUNT(*) FROM event_automations');
      preAutomationsCount = Number(c.rows[0].count);
    }
    if (preExistingTables.has('event_automation_settings')) {
      const c = await client.query('SELECT COUNT(*) FROM event_automation_settings');
      preSettingsCount = Number(c.rows[0].count);
    }

    // -------------------------------------------------------------------------
    // 7. EXECUTE MIGRATION TRANSACTION
    // -------------------------------------------------------------------------
    console.log('--- EXECUTING MIGRATION TRANSACTION ---');
    await client.query('BEGIN');

    try {
      // Strip outer BEGIN/COMMIT from SQL file so runner owns transaction control
      const sanitizedSql = migrationSql
        .replace(/^\s*BEGIN\s*;/im, '')
        .replace(/^\s*COMMIT\s*;/im, '');

      await client.query(sanitizedSql);
      console.log('  Migration SQL executed successfully inside transaction.\n');

      // -------------------------------------------------------------------------
      // 8. POST-MIGRATION VERIFICATION (inside transaction before commit)
      // -------------------------------------------------------------------------
      console.log('--- TRANSACTION VERIFICATION ---');

      // Verify event_automations table exists
      const postAutoTable = await client.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'event_automations';
      `);
      if (postAutoTable.rows.length === 0) {
        throw new Error('Verification failed: event_automations table was not created.');
      }
      console.log('  [PASS] event_automations table exists.');

      // Verify event_automation_settings table exists
      const postSettingsTable = await client.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'event_automation_settings';
      `);
      if (postSettingsTable.rows.length === 0) {
        throw new Error('Verification failed: event_automation_settings table was not created.');
      }
      console.log('  [PASS] event_automation_settings table exists.');

      // Verify indexes exist
      const postIndexes = await client.query(`
        SELECT indexname FROM pg_indexes 
        WHERE schemaname = 'public' 
          AND tablename = 'event_automations' 
          AND indexname IN ('idx_event_automations_fingerprint', 'idx_event_automations_status');
      `);
      const foundIndexes = new Set(postIndexes.rows.map((r: any) => r.indexname));
      if (!foundIndexes.has('idx_event_automations_fingerprint')) {
        throw new Error('Verification failed: idx_event_automations_fingerprint index missing.');
      }
      console.log('  [PASS] idx_event_automations_fingerprint index exists.');

      if (!foundIndexes.has('idx_event_automations_status')) {
        throw new Error('Verification failed: idx_event_automations_status index missing.');
      }
      console.log('  [PASS] idx_event_automations_status index exists.');

      // COMMIT TRANSACTION
      await client.query('COMMIT');
      console.log('\n  TRANSACTION COMMITTED SUCCESSFULLY.\n');

    } catch (txErr) {
      await client.query('ROLLBACK');
      console.error('  TRANSACTION ROLLED BACK DUE TO ERROR:', txErr);
      throw txErr;
    }

    // -------------------------------------------------------------------------
    // 9. POST-MIGRATION SAFETY CHECK
    // -------------------------------------------------------------------------
    console.log('--- POST-MIGRATION DATA SAFETY CHECKS ---');

    const postCountsRes = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM events)                       AS event_count,
        (SELECT COUNT(*) FROM event_duty_assignments)       AS duty_count,
        (SELECT COUNT(*) FROM event_duty_location_presence) AS presence_count,
        (SELECT COUNT(*) FROM report_jobs)                  AS report_jobs_count,
        (SELECT COUNT(*) FROM generated_reports)            AS generated_reports_count,
        (SELECT COUNT(*) FROM notification_jobs)            AS notification_jobs_count,
        (SELECT COUNT(*) FROM event_automations)            AS automations_count,
        (SELECT COUNT(*) FROM event_automation_settings)    AS settings_count;
    `);
    const post = postCountsRes.rows[0];

    // Assert pre-existing counts unchanged
    if (Number(post.event_count) !== baselineEventCount) {
      throw new Error(`Data safety violation: events count changed from ${baselineEventCount} to ${post.event_count}`);
    }
    if (Number(post.duty_count) !== baselineDutyCount) {
      throw new Error(`Data safety violation: event_duty_assignments count changed from ${baselineDutyCount} to ${post.duty_count}`);
    }
    if (Number(post.presence_count) !== baselinePresenceCount) {
      throw new Error(`Data safety violation: event_duty_location_presence count changed from ${baselinePresenceCount} to ${post.presence_count}`);
    }
    if (Number(post.report_jobs_count) !== baselineReportJobsCount) {
      throw new Error(`Data safety violation: report_jobs count changed from ${baselineReportJobsCount} to ${post.report_jobs_count}`);
    }
    if (Number(post.generated_reports_count) !== baselineGeneratedReportsCount) {
      throw new Error(`Data safety violation: generated_reports count changed from ${baselineGeneratedReportsCount} to ${post.generated_reports_count}`);
    }
    if (Number(post.notification_jobs_count) !== baselineNotificationJobsCount) {
      throw new Error(`Data safety violation: notification_jobs count changed from ${baselineNotificationJobsCount} to ${post.notification_jobs_count}`);
    }
    console.log('  [PASS] All pre-existing operational table counts remain unchanged.');

    // Assert current event unchanged
    const postCurrentEventRes = await client.query(`
      SELECT id, title, status
      FROM events
      WHERE status IN ('current', 'open', 'active')
      ORDER BY CASE status WHEN 'current' THEN 1 WHEN 'open' THEN 2 ELSE 3 END, starts_at ASC
      LIMIT 1;
    `);
    const postCurrentEvent = postCurrentEventRes.rows[0] || null;
    if (baselineCurrentEvent) {
      if (!postCurrentEvent || postCurrentEvent.id !== baselineCurrentEvent.id) {
        throw new Error(`Data safety violation: current event changed from ${baselineCurrentEvent.id} to ${postCurrentEvent?.id}`);
      }
    }
    console.log('  [PASS] Current event remains unchanged.');

    // Assert zero fake automation rows were invented
    const postAutomationsCount = Number(post.automations_count);
    const postSettingsCount = Number(post.settings_count);
    if (postAutomationsCount !== preAutomationsCount) {
      throw new Error(`Data safety violation: migration invented fake event_automations rows (${postAutomationsCount} != ${preAutomationsCount}).`);
    }
    if (postSettingsCount !== preSettingsCount) {
      throw new Error(`Data safety violation: migration invented fake event_automation_settings rows (${postSettingsCount} != ${preSettingsCount}).`);
    }
    console.log('  [PASS] Zero fake automation or settings rows were invented by the migration.');
    console.log(`         event_automations rows: ${postAutomationsCount}`);
    console.log(`         event_automation_settings rows: ${postSettingsCount}\n`);

    console.log('===================================================================');
    console.log('MIGRATION 007 COMPLETED SUCCESSFULLY WITH ALL SAFETY CHECKS PASSED');
    console.log('===================================================================');

  } catch (err) {
    console.error('\nMIGRATION EXECUTION FAILED:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runProductionMigration();
