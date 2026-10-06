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

const REQUIRED_TABLES = [
  'message_threads',
  'message_thread_participants',
  'messages',
  'announcements',
  'announcement_reads'
];

async function run017Migration() {
  console.log('================================================================');
  console.log('KOINONIA PRODUCTION DATABASE MIGRATION RUNNER — MIGRATION 017');
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
  console.log('  Migration:       docs/migrations/017_messaging_and_reminders_neon.sql');
  console.log('  Environment:     production\n');

  const migrationPath = path.resolve(process.cwd(), 'docs/migrations/017_messaging_and_reminders_neon.sql');
  if (!fs.existsSync(migrationPath)) {
    console.error(`SAFETY STOP: Migration file not found at ${migrationPath}`);
    process.exit(1);
  }
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  // Preflight check: confirm no destructive SQL keywords
  const destructivePatterns = [/\bDROP\s+TABLE\b/i, /\bTRUNCATE\b/i, /\bDROP\s+COLUMN\b/i, /\bDELETE\s+FROM\b/i];
  for (const pattern of destructivePatterns) {
    if (pattern.test(migrationSql)) {
      console.error(`SAFETY STOP: Destructive SQL pattern detected (${pattern}). Aborting.`);
      process.exit(1);
    }
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: isSsl ? { rejectUnauthorized: false } : undefined
  });

  try {
    await client.connect();
    console.log('Connected to target database successfully.\n');

    console.log('Executing Migration 017 SQL...');
    await client.query(migrationSql);
    console.log('Migration SQL executed successfully.\n');

    // Verification: verify each table exists
    console.log('Verifying created tables in information_schema:');
    for (const table of REQUIRED_TABLES) {
      const res = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1;
      `, [table]);
      const exists = res.rows.length > 0;
      console.log(`  ${table}: ${exists ? 'EXISTS (YES)' : 'MISSING (NO)'}`);
      if (!exists) {
        throw new Error(`Migration verification failed: table ${table} not found after migration!`);
      }
    }

    console.log('\n================================================================');
    console.log('🎉 MIGRATION 017 COMPLETED AND VERIFIED SUCCESSFULLY!');
    console.log('================================================================');
  } catch (err: any) {
    console.error('Migration error:', err.message || err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run017Migration().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
