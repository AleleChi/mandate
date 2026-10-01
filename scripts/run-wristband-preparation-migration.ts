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
  console.log('KOINONIA WRISTBAND PREPARATION STATE MIGRATION RUNNER');
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

  console.log('Target Database Details:');
  console.log('  Database engine: PostgreSQL');
  console.log(`  Host:            ${host}`);
  console.log(`  Database:        ${dbName}`);
  console.log(`  SSL enabled:     ${isSsl ? 'YES' : 'NO'}`);
  console.log('  Migration:       docs/migrations/012_wristband_preparation_state_neon.sql');
  console.log('  Environment:     production\n');

  const migrationPath = path.resolve(process.cwd(), 'docs/migrations/012_wristband_preparation_state_neon.sql');
  if (!fs.existsSync(migrationPath)) {
    console.error(`SAFETY STOP: Migration file not found at ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');

  const client = new Client({
    connectionString: dbUrl,
    ssl: isSsl ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('Connecting to production database...');
    await client.connect();
    console.log('Connected successfully. Executing migration 012...\n');

    await client.query(sql);

    console.log('================================================================');
    console.log('MIGRATION 012 COMPLETED SUCCESSFULLY');
    console.log('wristbands.status CHECK constraint updated to include "prepared"');
    console.log('================================================================');
  } catch (err: any) {
    console.error('\nMIGRATION FAILED:');
    console.error(err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runProductionMigration();
