import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Client } = pg;

dotenv.config();
const localEnvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
}

const dbUrl = process.env.DATABASE_URL;

async function runDevMigration() {
  if (!dbUrl || (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://'))) {
    console.log('No PostgreSQL DATABASE_URL detected in .env.local. (Currently using SQLite).');
    console.log('To migrate a Neon dev branch, set DATABASE_URL in .env.local first.');
    return;
  }

  const parsed = new URL(dbUrl);
  const host = parsed.hostname.toLowerCase();

  console.log('Verifying target database:');
  console.log('Engine: PostgreSQL');
  console.log('Host:', parsed.hostname);
  console.log('Database:', parsed.pathname.replace(/^\//, ''));

  // Safety check
  if (host.includes('production') || host.includes('prod-main')) {
    console.error('CRITICAL SAFETY STOP: Host appears to be production. Aborting migration.');
    process.exit(1);
  }

  const migrationFile = path.resolve(process.cwd(), 'docs/migrations/001_landing_gallery_items_neon.sql');
  if (!fs.existsSync(migrationFile)) {
    console.error('Migration file not found at', migrationFile);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationFile, 'utf-8');

  console.log('Connecting to development database...');
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    console.log('Executing idempotent migration against dev database...');
    await client.query(sql);
    console.log('Migration completed successfully on development database!');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await client.end();
  }
}

runDevMigration();
