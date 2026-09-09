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
  console.log('================================================================');
  console.log('KOINONIA WHATSAPP DELIVERY PRODUCTION DATABASE MIGRATION RUNNER');
  console.log('================================================================\n');

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

  // Print sanitized target database info (NEVER print password)
  console.log('Target Database Details:');
  console.log('  Database engine: PostgreSQL');
  console.log(`  Host:            ${host}`);
  console.log(`  Database:        ${dbName}`);
  console.log(`  SSL enabled:     ${isSsl ? 'YES' : 'NO'}`);
  console.log('  Migration:       docs/migrations/003_whatsapp_delivery_neon.sql');
  console.log('  Environment:     production\n');

  // 4. Verify migration file exists
  const migrationPath = path.resolve(process.cwd(), 'docs/migrations/003_whatsapp_delivery_neon.sql');
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

    // 6. Pre-flight Check: Record baseline counts and verify tables
    console.log('--- PRE-FLIGHT VERIFICATION ---');
    const baselineCountsRes = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM parent_profiles) AS parent_count,
        (SELECT COUNT(*) FROM children) AS child_count,
        (SELECT COUNT(*) FROM child_event_entries) AS entry_count,
        (SELECT COUNT(*) FROM notification_jobs) AS job_count;
    `);
    const baseline = baselineCountsRes.rows[0];
    console.log(`  Baseline parent_profiles:    ${baseline.parent_count}`);
    console.log(`  Baseline children:           ${baseline.child_count}`);
    console.log(`  Baseline child_event_entries:${baseline.entry_count}`);
    console.log(`  Baseline notification_jobs:  ${baseline.job_count}\n`);

    const tableCheckRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'whatsapp_delivery_logs';
    `);

    const tableExists = tableCheckRes.rows.length > 0;
    if (tableExists) {
      console.log('Pre-flight: whatsapp_delivery_logs table already exists. Migration will run additively.');
    } else {
      console.log('Pre-flight: whatsapp_delivery_logs table not found. Will be created.');
    }

    // 7. Execute migration inside safe transaction
    console.log('\nApplying migration DDL (docs/migrations/003_whatsapp_delivery_neon.sql)...');
    await client.query(migrationSql);
    console.log('Migration executed successfully.\n');

    // 8. Post-migration verification
    console.log('--- POST-MIGRATION VERIFICATION ---');

    // 8a. Verify parent_profiles consent columns
    const parentColsRes = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'parent_profiles'
        AND column_name IN ('whatsapp_consent_status', 'whatsapp_consent_at', 'whatsapp_opt_out_at', 'whatsapp_consent_source')
      ORDER BY column_name;
    `);
    console.log('1. parent_profiles consent columns:');
    for (const row of parentColsRes.rows) {
      console.log(`   ✓ ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default})`);
    }

    // 8b. Verify parent_profiles CHECK constraint
    const checkConstraintRes = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as condef
      FROM pg_constraint
      WHERE conrelid = 'parent_profiles'::regclass
        AND conname = 'chk_parent_profiles_whatsapp_consent_status';
    `);
    if (checkConstraintRes.rows.length > 0) {
      console.log(`   ✓ CHECK constraint active: ${checkConstraintRes.rows[0].condef}`);
    } else {
      console.error('   ✗ ERROR: chk_parent_profiles_whatsapp_consent_status CHECK constraint missing!');
      process.exit(1);
    }

    // 8c. Verify notification_jobs columns
    const jobColsRes = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'notification_jobs'
        AND column_name IN ('idempotency_key', 'attempt_count', 'next_attempt_at', 'processing_started_at', 'last_error')
      ORDER BY column_name;
    `);
    console.log('\n2. notification_jobs retry & idempotency columns:');
    for (const row of jobColsRes.rows) {
      console.log(`   ✓ ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default})`);
    }

    // 8d. Verify whatsapp_delivery_logs table structure
    const deliveryTableRes = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'whatsapp_delivery_logs'
      ORDER BY ordinal_position;
    `);
    console.log(`\n3. whatsapp_delivery_logs table (${deliveryTableRes.rows.length} columns):`);
    for (const row of deliveryTableRes.rows) {
      console.log(`   ✓ ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
    }

    // 8e. Verify indexes exist
    const indexRes = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND indexname IN (
        'idx_notification_jobs_idempotency_key',
        'idx_whatsapp_delivery_provider_msg',
        'idx_wa_delivery_parent',
        'idx_wa_delivery_status',
        'idx_wa_delivery_job_id',
        'idx_wa_delivery_entry_id'
      )
      ORDER BY indexname;
    `);
    console.log(`\n4. Verified Indexes (${indexRes.rows.length} of 6 expected):`);
    for (const row of indexRes.rows) {
      console.log(`   ✓ ${row.indexname}`);
    }
    if (indexRes.rows.length < 6) {
      console.error(`   ✗ ERROR: Expected 6 indexes, found ${indexRes.rows.length}`);
      process.exit(1);
    }

    // 8f. Verify data integrity: row counts must not change
    const postCountsRes = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM parent_profiles) AS parent_count,
        (SELECT COUNT(*) FROM children) AS child_count,
        (SELECT COUNT(*) FROM child_event_entries) AS entry_count,
        (SELECT COUNT(*) FROM notification_jobs) AS job_count;
    `);
    const post = postCountsRes.rows[0];
    console.log('\n5. Data Integrity & Row Preservation Check:');
    console.log(`   parent_profiles:     ${post.parent_count} (pre: ${baseline.parent_count})`);
    console.log(`   children:            ${post.child_count} (pre: ${baseline.child_count})`);
    console.log(`   child_event_entries: ${post.entry_count} (pre: ${baseline.entry_count})`);
    console.log(`   notification_jobs:   ${post.job_count} (pre: ${baseline.job_count})`);

    if (
      post.parent_count !== baseline.parent_count ||
      post.child_count !== baseline.child_count ||
      post.entry_count !== baseline.entry_count ||
      post.job_count !== baseline.job_count
    ) {
      console.error('   ✗ CRITICAL INTEGRITY FAILURE: Row counts changed during migration!');
      process.exit(1);
    }

    // 8g. Verify existing parents remain 'unknown' (NO unconsented opt-ins)
    const nonUnknownRes = await client.query(`
      SELECT COUNT(*) as non_unknown
      FROM parent_profiles
      WHERE whatsapp_consent_status != 'unknown';
    `);
    console.log(`\n6. Consent Default Check: Non-unknown parent consent records: ${nonUnknownRes.rows[0].non_unknown} (expected 0)`);
    if (Number(nonUnknownRes.rows[0].non_unknown) !== 0) {
      console.error('   ✗ ERROR: Existing parents were mutated with non-unknown consent!');
      process.exit(1);
    }

    console.log('\n================================================================');
    console.log('PRODUCTION MIGRATION COMPLETED & FULLY VERIFIED SUCCESSFULLY');
    console.log('================================================================');
  } catch (err: any) {
    console.error('\nCRITICAL MIGRATION ERROR:', err);
    try {
      await client.query('ROLLBACK;');
    } catch (_) {}
    process.exit(1);
  } finally {
    await client.end();
  }
}

runProductionMigration().catch((err) => {
  console.error('Fatal error running migration runner:', err);
  process.exit(1);
});
