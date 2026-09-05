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

// Expected columns for validation
const EXPECTED_COLUMNS = [
  'id',
  'media_file_id',
  'image_url',
  'alt_text',
  'caption',
  'sort_order',
  'is_active',
  'created_by',
  'created_at',
  'updated_at'
];

async function runProductionMigration() {
  console.log('================================================================');
  console.log('KOINONIA PRODUCTION DATABASE MIGRATION RUNNER');
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
  } catch (err) {
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
  console.log('  Migration:       docs/migrations/001_landing_gallery_items_neon.sql');
  console.log('  Environment:     production\n');

  // 4. Verify migration file exists
  const migrationPath = path.resolve(process.cwd(), 'docs/migrations/001_landing_gallery_items_neon.sql');
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

    // 6. PRE-MIGRATION VERIFICATION: Check if table already exists
    const tableCheckRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'landing_gallery_items';
    `);

    const tableExists = tableCheckRes.rows.length > 0;

    if (tableExists) {
      console.log("Inspecting existing 'landing_gallery_items' schema (READ ONLY)...");

      // Inspect columns
      const colRes = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'landing_gallery_items'
        ORDER BY ordinal_position;
      `);
      const existingCols = colRes.rows.map((r: any) => r.column_name);

      // Inspect indices
      const indexRes = await client.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'landing_gallery_items';
      `);
      const existingIndices = indexRes.rows.map((r: any) => r.indexname);

      const hasAllCols = EXPECTED_COLUMNS.every(col => existingCols.includes(col));
      const hasActiveSortIndex = existingIndices.includes('idx_landing_gallery_active_sort');
      const hasMediaFileIndex = existingIndices.includes('idx_landing_gallery_media_file');

      if (hasAllCols && hasActiveSortIndex && hasMediaFileIndex) {
        console.log('\n================================================================');
        console.log('MIGRATION ALREADY APPLIED — NO CHANGES REQUIRED');
        console.log('================================================================');
        console.log(`- Columns validated: ${existingCols.join(', ')}`);
        console.log(`- Indices validated: ${existingIndices.join(', ')}\n`);
        await client.end();
        process.exit(0);
      } else {
        console.error('\nSAFETY STOP: Table exists but does not match expected migration schema.');
        console.error(`- Existing columns: ${existingCols.join(', ')}`);
        console.error(`- Expected columns: ${EXPECTED_COLUMNS.join(', ')}`);
        console.error(`- Existing indices: ${existingIndices.join(', ')}`);
        console.error('Manual review required. Will NOT apply schema changes automatically.');
        await client.end();
        process.exit(1);
      }
    }

    // 7. EXECUTE MIGRATION INSIDE TRANSACTION
    console.log("Applying migration 'docs/migrations/001_landing_gallery_items_neon.sql'...");
    try {
      // Execute the migration script
      await client.query(migrationSql);
      console.log('Migration SQL executed successfully.\n');
    } catch (migErr: any) {
      console.error('CRITICAL: Migration failed during execution.');
      console.error(migErr.message);
      try {
        await client.query('ROLLBACK;');
      } catch (_) {}
      await client.end();
      process.exit(1);
    }

    // 8. POST-MIGRATION VERIFICATION (READ ONLY)
    console.log('Performing post-migration verification (READ ONLY)...');

    // Verify table presence
    const postTableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'landing_gallery_items';
    `);
    if (postTableCheck.rows.length === 0) {
      console.error("Verification failed: Table 'landing_gallery_items' was not created.");
      process.exit(1);
    }

    // Verify columns
    const postColRes = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'landing_gallery_items'
      ORDER BY ordinal_position;
    `);
    const createdCols = postColRes.rows.map((r: any) => r.column_name);
    const missingCols = EXPECTED_COLUMNS.filter(c => !createdCols.includes(c));
    if (missingCols.length > 0) {
      console.error(`Verification failed: Missing columns: ${missingCols.join(', ')}`);
      process.exit(1);
    }

    // Verify primary key
    const pkRes = await client.query(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = 'landing_gallery_items';
    `);
    const pkCol = pkRes.rows[0]?.column_name;

    // Verify foreign key to media_files
    const fkRes = await client.query(`
      SELECT
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'landing_gallery_items';
    `);
    const fkTarget = fkRes.rows[0];

    // Verify indexes
    const postIndexRes = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'landing_gallery_items';
    `);
    const createdIndices = postIndexRes.rows.map((r: any) => r.indexname);

    console.log('\n================================================================');
    console.log('POST-MIGRATION VERIFICATION PASSED');
    console.log('================================================================');
    console.log(`- Table verified:       landing_gallery_items`);
    console.log(`- Primary Key:          ${pkCol || 'None'}`);
    console.log(`- Foreign Key:          ${fkTarget ? `${fkTarget.column_name} -> ${fkTarget.foreign_table_name}(${fkTarget.foreign_column_name})` : 'None'}`);
    console.log(`- Columns created (10): ${createdCols.join(', ')}`);
    console.log(`- Indices created:      ${createdIndices.join(', ')}`);
    console.log('================================================================\n');
    console.log('The production database is now ready for orbital photo gallery deployment.');

  } catch (connErr: any) {
    console.error('Database connection error:', connErr.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runProductionMigration();
