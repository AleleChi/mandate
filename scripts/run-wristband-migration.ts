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
  console.log('KOINONIA NFC WRISTBAND FOUNDATION DATABASE MIGRATION RUNNER');
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
  console.log('  Migration:       docs/migrations/009_nfc_wristband_foundation_neon.sql');
  console.log('  Environment:     production\n');

  const migrationPath = path.resolve(process.cwd(), 'docs/migrations/009_nfc_wristband_foundation_neon.sql');
  if (!fs.existsSync(migrationPath)) {
    console.error(`SAFETY STOP: Migration file not found at ${migrationPath}`);
    process.exit(1);
  }
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  const client = new Client({
    connectionString: dbUrl,
    ssl: isSsl ? { rejectUnauthorized: false } : undefined
  });

  try {
    await client.connect();
    console.log('Connected to target database successfully.\n');

    console.log('Executing migration SQL...');
    await client.query(migrationSql);
    console.log('Migration executed successfully.\n');

    // Verification check
    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('wristbands', 'child_wristband_assignments')
      ORDER BY table_name;
    `);

    console.log('Verification: tables created:');
    tableCheck.rows.forEach(r => {
      console.log(`  - ${r.table_name}`);
    });

    if (tableCheck.rows.length === 2) {
      console.log('\nSUCCESS: Both wristbands and child_wristband_assignments exist.');
    } else {
      console.warn('\nWARNING: Could not verify all tables. Please inspect manually.');
    }
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runProductionMigration();
