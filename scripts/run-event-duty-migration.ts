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

const EXPECTED_TABLES = [
  'event_duty_devices',
  'device_readiness_logs',
  'event_locations',
  'event_location_codes',
  'event_duty_assignments',
  'event_duty_location_presence',
  'alert_routing_rules',
  'alert_routing_recipients',
  'event_routing_change_history'
];

async function runProductionMigration() {
  console.log('================================================================');
  console.log('KOINONIA EVENT DUTY PRODUCTION DATABASE MIGRATION RUNNER');
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

  // Print sanitized target database info
  console.log('Target Database Details:');
  console.log('  Database engine: PostgreSQL');
  console.log(`  Host:            ${host}`);
  console.log(`  Database:        ${dbName}`);
  console.log(`  SSL enabled:     ${isSsl ? 'YES' : 'NO'}`);
  console.log('  Migration:       docs/migrations/002_event_duty_neon.sql');
  console.log('  Environment:     production\n');

  // 4. Verify migration file exists
  const migrationPath = path.resolve(process.cwd(), 'docs/migrations/002_event_duty_neon.sql');
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

    console.log('Checking existing tables...');
    const tableCheckRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    const existing = new Set(tableCheckRes.rows.map(r => r.table_name));

    for (const t of EXPECTED_TABLES) {
      console.log(`  Table [${t}]: ${existing.has(t) ? 'ALREADY EXISTS' : 'WILL BE CREATED'}`);
    }

    console.log('\nApplying migration within a single transaction...');
    await client.query(migrationSql);
    console.log('Migration executed successfully.\n');

    // Verification
    console.log('Verifying migrated tables and columns...');
    const postCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    const postExisting = new Set(postCheck.rows.map(r => r.table_name));

    let allOk = true;
    for (const t of EXPECTED_TABLES) {
      const exists = postExisting.has(t);
      console.log(`  Verification [${t}]: ${exists ? 'OK' : 'MISSING'}`);
      if (!exists) allOk = false;
    }

    // Verify assigned_location_id column
    const colCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'event_duty_assignments' AND column_name = 'assigned_location_id';
    `);
    const hasAssignedLoc = colCheck.rows.length > 0;
    console.log(`  Verification [event_duty_assignments.assigned_location_id]: ${hasAssignedLoc ? 'OK' : 'MISSING'}`);
    if (!hasAssignedLoc) allOk = false;

    if (allOk) {
      console.log('\n================================================================');
      console.log('MIGRATION COMPLETE: All Event Duty schema verified in production.');
      console.log('================================================================\n');
    } else {
      console.error('\nWARNING: Some objects could not be verified.');
      process.exit(1);
    }

  } catch (err: any) {
    console.error('MIGRATION FAILED:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runProductionMigration();
