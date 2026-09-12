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

// ---------------------------------------------------------------------------
// Dynamic snapshot: columns are discovered at runtime via information_schema.
// Stringify a value consistently for comparison (handles Date objects from pg).
// ---------------------------------------------------------------------------

// Stringify a value consistently for comparison (handles Date objects from pg)
function canonicalize(v: unknown): string {
  if (v === null || v === undefined) return '__NULL__';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

async function runProductionMigration() {
  console.log('===================================================================');
  console.log('KOINONIA VOLUNTEER COMMUNICATION PRODUCTION MIGRATION RUNNER');
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

  // Print sanitized target database info (NEVER print password/credentials)
  console.log('Target Database Details:');
  console.log('  Database engine: PostgreSQL');
  console.log(`  Host:            ${host}`);
  console.log(`  Database:        ${dbName}`);
  console.log(`  SSL enabled:     ${isSsl ? 'YES' : 'NO'}`);
  console.log('  Migration:       docs/migrations/004_volunteer_communication_neon.sql');
  console.log('  Environment:     production\n');

  // 4. Verify migration file exists
  const migrationPath = path.resolve(process.cwd(), 'docs/migrations/004_volunteer_communication_neon.sql');
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
    // 6. PRE-FLIGHT: Baseline row counts (all four tables + delivery logs)
    // -------------------------------------------------------------------------
    console.log('--- PRE-FLIGHT VERIFICATION ---');
    const baselineCountsRes = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM users)              AS user_count,
        (SELECT COUNT(*) FROM parent_profiles)    AS parent_count,
        (SELECT COUNT(*) FROM volunteer_profiles) AS volunteer_count,
        (SELECT COUNT(*) FROM notification_jobs)  AS job_count;
    `);
    const baseline = baselineCountsRes.rows[0];
    const baselineUserCount      = Number(baseline.user_count);
    const baselineParentCount    = Number(baseline.parent_count);
    const baselineVolunteerCount = Number(baseline.volunteer_count);
    const baselineJobCount       = Number(baseline.job_count);

    console.log(`  Baseline users:               ${baselineUserCount}`);
    console.log(`  Baseline parent_profiles:     ${baselineParentCount}`);
    console.log(`  Baseline volunteer_profiles:  ${baselineVolunteerCount}`);
    console.log(`  Baseline notification_jobs:   ${baselineJobCount}`);

    // Check if whatsapp_delivery_logs table exists
    const waTableCheckRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'whatsapp_delivery_logs';
    `);
    const waTableExists = waTableCheckRes.rows.length > 0;
    let baselineWaDeliveryCount: number | null = null;
    if (waTableExists) {
      const waCountRes = await client.query(`SELECT COUNT(*) as count FROM whatsapp_delivery_logs;`);
      baselineWaDeliveryCount = Number(waCountRes.rows[0].count);
      console.log(`  Baseline whatsapp_delivery_logs: ${baselineWaDeliveryCount}`);
    }

    // -------------------------------------------------------------------------
    // 7. PRE-FLIGHT: First-run detection (volunteer consent columns)
    // -------------------------------------------------------------------------
    const preColCheckRes = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'volunteer_profiles'
        AND column_name = 'whatsapp_consent_status';
    `);
    const isFirstRun = preColCheckRes.rows.length === 0;
    console.log(`  Migration execution mode:     ${isFirstRun ? 'FIRST RUN (new columns)' : 'RERUN (idempotent verify)'}`);

    // -------------------------------------------------------------------------
    // 7b. PRE-FLIGHT: Detect whether user_id already exists in notification_jobs
    //     and whatsapp_delivery_logs BEFORE this migration runs.
    //     This determines which user_id assertions are safe on rerun.
    // -------------------------------------------------------------------------
    const preJobUserIdColRes = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'notification_jobs'
        AND column_name  = 'user_id';
    `);
    const isFirstRunUserId = preJobUserIdColRes.rows.length === 0;

    let isFirstRunWaUserId = true;
    if (waTableExists) {
      const preWaUserIdColRes = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'whatsapp_delivery_logs'
          AND column_name  = 'user_id';
      `);
      isFirstRunWaUserId = preWaUserIdColRes.rows.length === 0;
    }

    console.log(`  notification_jobs.user_id:    ${isFirstRunUserId ? 'FIRST RUN (column new)' : 'RERUN (column existed)'}`);
    console.log(`  whatsapp_delivery_logs.user_id: ${waTableExists ? (isFirstRunWaUserId ? 'FIRST RUN (column new)' : 'RERUN (column existed)') : 'TABLE NOT PRESENT'}\n`);

    // -------------------------------------------------------------------------
    // 8. PRE-FLIGHT: Snapshot all existing notification_jobs rows.
    //    Discovers columns via information_schema (adapts to schema variance).
    //
    //    FIRST RUN: user_id does not yet exist — exclude from snapshot.
    //    RERUN:     user_id already exists — INCLUDE it so we can verify that
    //               null-parent volunteer-only jobs preserve their pre-existing
    //               user_id and are not silently overwritten.
    // -------------------------------------------------------------------------
    console.log('  Taking pre-migration snapshot of notification_jobs...');

    // On first run, exclude user_id (it doesn't exist yet).
    // On rerun, include user_id so the field loop can compare null-parent rows.
    const existingColsRes = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'notification_jobs'
        AND ($1 OR column_name != 'user_id')
      ORDER BY ordinal_position;
    `, [!isFirstRunUserId]); // true = include user_id; false = exclude
    const existingCols = existingColsRes.rows.map((r: { column_name: string }) => r.column_name);
    const snapshotCols = existingCols.join(', ');

    const preSnapshotRes = await client.query(
      `SELECT ${snapshotCols} FROM notification_jobs ORDER BY id;`
    );
    const preSnapshot: Record<string, Record<string, unknown>> = {};
    const preIds: Set<string> = new Set();

    for (const row of preSnapshotRes.rows) {
      const id = String(row.id);
      preSnapshot[id] = row;
      preIds.add(id);
    }
    console.log(`  Snapshot captured: ${preIds.size} notification_jobs row(s) (cols: ${existingCols.length}, includes user_id: ${!isFirstRunUserId}).\n`);

    // -------------------------------------------------------------------------
    // 8b. PRE-FLIGHT: Snapshot all existing whatsapp_delivery_logs rows (if table exists).
    //     Discovers columns via information_schema (adapts to schema variance).
    //
    //     FIRST RUN: user_id does not yet exist — exclude from snapshot.
    //     RERUN:     user_id already exists — INCLUDE it so we can verify that
    //                null-parent volunteer delivery records preserve their pre-existing
    //                user_id and are not silently overwritten.
    //
    //     PRIVACY: Recipient phone numbers and provider messages are captured
    //              for in-memory comparison only and are NEVER logged or printed.
    // -------------------------------------------------------------------------
    let waExistingCols: string[] = [];
    const preWaSnapshot: Record<string, Record<string, unknown>> = {};
    const preWaIds: Set<string> = new Set();

    if (waTableExists) {
      console.log('  Taking pre-migration snapshot of whatsapp_delivery_logs...');
      const existingWaColsRes = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'whatsapp_delivery_logs'
          AND ($1 OR column_name != 'user_id')
        ORDER BY ordinal_position;
      `, [!isFirstRunWaUserId]);
      waExistingCols = existingWaColsRes.rows.map((r: { column_name: string }) => r.column_name);
      const waSnapshotCols = waExistingCols.join(', ');

      const preWaSnapshotRes = await client.query(
        `SELECT ${waSnapshotCols} FROM whatsapp_delivery_logs ORDER BY id;`
      );
      for (const row of preWaSnapshotRes.rows) {
        const id = String(row.id);
        preWaSnapshot[id] = row;
        preWaIds.add(id);
      }
      console.log(`  Snapshot captured: ${preWaIds.size} whatsapp_delivery_logs row(s) (cols: ${waExistingCols.length}, includes user_id: ${!isFirstRunWaUserId}).\n`);
    }

    // -------------------------------------------------------------------------
    // 9. EXECUTE MIGRATION INSIDE CONTROLLED TRANSACTION
    // -------------------------------------------------------------------------
    console.log('--- EXECUTING MIGRATION TRANSACTION ---');
    await client.query('BEGIN');

    // Strip the SQL file's own BEGIN/COMMIT — the runner owns the transaction
    const sanitizedSql = migrationSql
      .replace(/^\s*BEGIN\s*;/im, '')
      .replace(/^\s*COMMIT\s*;/im, '');

    await client.query(sanitizedSql);
    console.log('  Migration SQL executed successfully inside transaction.\n');

    // -------------------------------------------------------------------------
    // 10. POST-FLIGHT VERIFICATION (all inside the open transaction)
    // -------------------------------------------------------------------------
    console.log('--- POST-FLIGHT VERIFICATION ---');

    // Verification A: Volunteer profile consent columns exist (4/4)
    const volColsRes = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'volunteer_profiles'
        AND column_name IN (
          'whatsapp_consent_status',
          'whatsapp_consent_at',
          'whatsapp_opt_out_at',
          'whatsapp_consent_source'
        );
    `);
    if (volColsRes.rows.length < 4) {
      throw new Error(`Volunteer consent columns verification failed. Expected 4 columns, found ${volColsRes.rows.length}.`);
    }
    console.log('  [PASS] Volunteer profile consent columns exist (4/4).');

    // Verification B: CHECK constraint on volunteer_profiles
    const checkConstraintRes = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'volunteer_profiles'::regclass
        AND conname = 'chk_volunteer_profiles_whatsapp_consent_status';
    `);
    if (checkConstraintRes.rows.length === 0) {
      throw new Error('CHECK constraint chk_volunteer_profiles_whatsapp_consent_status missing on volunteer_profiles.');
    }
    console.log('  [PASS] Volunteer WhatsApp consent status CHECK constraint verified.');

    // Verification C: Consent values integrity — first-run vs rerun
    if (isFirstRun) {
      const nonUnknownRes = await client.query(`
        SELECT COUNT(*) as count
        FROM volunteer_profiles
        WHERE whatsapp_consent_status != 'unknown';
      `);
      if (Number(nonUnknownRes.rows[0].count) > 0) {
        throw new Error(`First-run consent safety violated: found ${nonUnknownRes.rows[0].count} volunteers with non-unknown consent.`);
      }
      console.log('  [PASS] First run: All existing volunteers default safely to "unknown".');
    } else {
      const invalidStatusRes = await client.query(`
        SELECT COUNT(*) as count
        FROM volunteer_profiles
        WHERE whatsapp_consent_status NOT IN ('unknown', 'opted_in', 'opted_out');
      `);
      if (Number(invalidStatusRes.rows[0].count) > 0) {
        throw new Error(`Invalid volunteer consent statuses found: ${invalidStatusRes.rows[0].count}`);
      }
      console.log('  [PASS] Rerun: Existing volunteer consent statuses preserved without corruption.');
    }

    // Verification D: notification_jobs.user_id column & FK exist
    const jobUserIdRes = await client.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notification_jobs'
        AND column_name = 'user_id';
    `);
    if (jobUserIdRes.rows.length === 0) {
      throw new Error('user_id column missing on notification_jobs.');
    }
    console.log('  [PASS] notification_jobs.user_id column exists.');

    // Verification E: parent_id nullability on notification_jobs
    const parentIdRes = await client.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notification_jobs'
        AND column_name = 'parent_id';
    `);
    if (parentIdRes.rows.length === 0 || parentIdRes.rows[0].is_nullable !== 'YES') {
      throw new Error('notification_jobs.parent_id is not nullable. Volunteer communications would fail.');
    }
    console.log('  [PASS] notification_jobs.parent_id is nullable (volunteer-only jobs supported).');

    // -------------------------------------------------------------------------
    // Verification F: ALL FOUR TABLE ROW COUNTS match baseline exactly
    // -------------------------------------------------------------------------
    const postCountsRes = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM users)              AS user_count,
        (SELECT COUNT(*) FROM parent_profiles)    AS parent_count,
        (SELECT COUNT(*) FROM volunteer_profiles) AS volunteer_count,
        (SELECT COUNT(*) FROM notification_jobs)  AS job_count;
    `);
    const post = postCountsRes.rows[0];
    const postUserCount      = Number(post.user_count);
    const postParentCount    = Number(post.parent_count);
    const postVolunteerCount = Number(post.volunteer_count);
    const postJobCount       = Number(post.job_count);

    if (postUserCount !== baselineUserCount) {
      throw new Error(
        `Row count mismatch on users: before=${baselineUserCount}, after=${postUserCount}.`
      );
    }
    console.log(`  [PASS] users row count preserved (${postUserCount} rows).`);

    if (postParentCount !== baselineParentCount) {
      throw new Error(
        `Row count mismatch on parent_profiles: before=${baselineParentCount}, after=${postParentCount}.`
      );
    }
    console.log(`  [PASS] parent_profiles row count preserved (${postParentCount} rows).`);

    if (postVolunteerCount !== baselineVolunteerCount) {
      throw new Error(
        `Row count mismatch on volunteer_profiles: before=${baselineVolunteerCount}, after=${postVolunteerCount}.`
      );
    }
    console.log(`  [PASS] volunteer_profiles row count preserved (${postVolunteerCount} rows).`);

    if (postJobCount !== baselineJobCount) {
      throw new Error(
        `Row count mismatch on notification_jobs: before=${baselineJobCount}, after=${postJobCount}.`
      );
    }
    console.log(`  [PASS] notification_jobs row count preserved (${postJobCount} rows).`);

    if (waTableExists && baselineWaDeliveryCount !== null) {
      const postWaCountsRes = await client.query(`
        SELECT COUNT(*) AS wa_count FROM whatsapp_delivery_logs;
      `);
      const postWaDeliveryCount = Number(postWaCountsRes.rows[0].wa_count);
      if (postWaDeliveryCount !== baselineWaDeliveryCount) {
        throw new Error(
          `Row count mismatch on whatsapp_delivery_logs: before=${baselineWaDeliveryCount}, after=${postWaDeliveryCount}.`
        );
      }
      console.log(`  [PASS] whatsapp_delivery_logs row count preserved (${postWaDeliveryCount} rows).`);
    }

    // -------------------------------------------------------------------------
    // Verification G: Post-migration snapshot — ID set must be identical.
    //    Uses same snapshotCols as pre-snapshot (includes user_id on rerun).
    // -------------------------------------------------------------------------
    const postSnapshotRes = await client.query(
      `SELECT ${snapshotCols} FROM notification_jobs ORDER BY id;`
    );
    const postSnapshot: Record<string, Record<string, unknown>> = {};
    const postIds: Set<string> = new Set();

    for (const row of postSnapshotRes.rows) {
      const id = String(row.id);
      postSnapshot[id] = row;
      postIds.add(id);
    }

    // Missing IDs (rows deleted by migration — must never happen)
    const missingIds = [...preIds].filter(id => !postIds.has(id));
    if (missingIds.length > 0) {
      throw new Error(
        `notification_jobs rows DELETED by migration. Missing IDs: ${missingIds.slice(0, 10).join(', ')}` +
        (missingIds.length > 10 ? ` ... and ${missingIds.length - 10} more` : '')
      );
    }

    // Extra IDs (rows inserted by migration — must never happen)
    const extraIds = [...postIds].filter(id => !preIds.has(id));
    if (extraIds.length > 0) {
      throw new Error(
        `notification_jobs rows INSERTED by migration. Extra IDs: ${extraIds.slice(0, 10).join(', ')}` +
        (extraIds.length > 10 ? ` ... and ${extraIds.length - 10} more` : '')
      );
    }
    console.log(`  [PASS] notification_jobs ID set preserved (${preIds.size} IDs, no missing, no extra).`);

    // -------------------------------------------------------------------------
    // Verification H: Field-by-field comparison.
    //
    // FIRST RUN (isFirstRunUserId = true):
    //   user_id was not in the pre-snapshot (column didn't exist) — skip entirely
    //   in the field loop. Its post-migration state is checked separately below.
    //
    // RERUN (isFirstRunUserId = false):
    //   user_id IS in the pre-snapshot. Apply per-row rules:
    //   - Rows with parent_id IS NOT NULL:
    //     If pre.user_id was already populated: do NOT silently rewrite it.
    //     If pre.user_id was NULL: allow deterministic Parent backfill.
    //   - Rows with parent_id IS NULL: post.user_id MUST equal pre.user_id.
    //     Volunteer-only jobs (pre.user_id = volunteer id) are preserved.
    //     Historical orphan rows (pre.user_id = NULL) stay NULL.
    //     Any unexpected rewrite → throw → ROLLBACK.
    // -------------------------------------------------------------------------
    const fieldMismatches: string[] = [];

    for (const id of preIds) {
      const preRow  = preSnapshot[id];
      const postRow = postSnapshot[id];
      const hasParent = preRow['parent_id'] !== null && preRow['parent_id'] !== undefined;

      for (const col of existingCols) {
        if (col === 'user_id') {
          if (isFirstRunUserId) {
            // Column was absent pre-migration; not in snapshot — nothing to compare.
            continue;
          }
          if (hasParent) {
            // Parent-linked row: if user_id was already populated, verify NOT rewritten
            const preVal  = canonicalize(preRow[col]);
            const postVal = canonicalize(postRow[col]);
            if (preVal !== '__NULL__' && preVal !== postVal) {
              fieldMismatches.push(
                `  Row id=${id}, column=user_id (parent-linked job): was already populated [${preVal}] but changed to [${postVal}] — must not silently rewrite populated user_id`
              );
            }
            continue;
          }
          // Null-parent row on rerun: post.user_id must equal pre.user_id exactly.
          // This preserves legitimate volunteer-only jobs and historical NULL rows.
          const preVal  = canonicalize(preRow[col]);
          const postVal = canonicalize(postRow[col]);
          if (preVal !== postVal) {
            fieldMismatches.push(
              `  Row id=${id}, column=user_id (null-parent): was [${preVal}] now [${postVal}] — rerun must not rewrite volunteer-only user_id`
            );
          }
          continue;
        }

        // All other columns: must be completely unchanged.
        const preVal  = canonicalize(preRow[col]);
        const postVal = canonicalize(postRow[col]);
        if (preVal !== postVal) {
          fieldMismatches.push(
            `  Row id=${id}, column=${col}: was [${preVal}] now [${postVal}]`
          );
        }
      }
    }

    if (fieldMismatches.length > 0) {
      const sample = fieldMismatches.slice(0, 5).join('\n');
      const extra  = fieldMismatches.length > 5
        ? `\n  ... and ${fieldMismatches.length - 5} more mismatch(es)` : '';
      throw new Error(
        `notification_jobs field integrity violated.\n${sample}${extra}`
      );
    }
    console.log(`  [PASS] notification_jobs field integrity: all ${preIds.size} row(s) verified (user_id rules: ${isFirstRunUserId ? 'first-run' : 'rerun'}).`);

    // -------------------------------------------------------------------------
    // Verification I: Parent-job backfill correctness.
    //   For every job where parent_id IS NOT NULL:
    //     notification_jobs.user_id must equal parent_profiles.user_id.
    //   No other derivation is permitted.
    // -------------------------------------------------------------------------
    const unmatchedJobsRes = await client.query(`
      SELECT COUNT(*) as count
      FROM notification_jobs nj
      JOIN parent_profiles pp ON pp.id = nj.parent_id
      WHERE nj.user_id IS DISTINCT FROM pp.user_id;
    `);
    if (Number(unmatchedJobsRes.rows[0].count) > 0) {
      throw new Error(
        `Backfill verification failed: ${unmatchedJobsRes.rows[0].count} parent job(s) have mismatched or missing user_id.`
      );
    }
    console.log('  [PASS] Parent notification jobs backfilled with canonical user_id (100% match).');

    // -------------------------------------------------------------------------
    // Verification I-b: Null-parent job user_id safety.
    //
    // FIRST RUN: The migration SQL only backfills from parent_profiles.
    //   No null-parent row should have received a user_id.
    //   Any non-NULL user_id on a null-parent row → accidental write → ROLLBACK.
    //
    // RERUN: null-parent rows may legitimately have user_id set (volunteer-only
    //   jobs created after Phase 2A went live). These are valid — do not throw.
    //   Their user_id preservation is already guaranteed by Verification H above.
    // -------------------------------------------------------------------------
    if (isFirstRunUserId) {
      const orphanBackfillRes = await client.query(`
        SELECT COUNT(*) as count
        FROM notification_jobs
        WHERE parent_id IS NULL
          AND user_id IS NOT NULL;
      `);
      if (Number(orphanBackfillRes.rows[0].count) > 0) {
        throw new Error(
          `First-run backfill safety violated: ${orphanBackfillRes.rows[0].count} job(s) with parent_id=NULL were unexpectedly assigned user_id. ` +
          `The migration SQL must only backfill from parent_profiles.`
        );
      }
      console.log('  [PASS] First run: null-parent jobs correctly have user_id=NULL (no accidental assignment).');
    } else {
      // Rerun: null-parent + user_id IS NOT NULL = valid volunteer-only job.
      // user_id preservation for these rows was verified in Verification H.
      const volunteerOnlyJobCount = await client.query(`
        SELECT COUNT(*) as count FROM notification_jobs WHERE parent_id IS NULL AND user_id IS NOT NULL;
      `);
      console.log(`  [PASS] Rerun: ${volunteerOnlyJobCount.rows[0].count} null-parent job(s) with user_id preserved (volunteer-only jobs are valid).`);
    }

    // -------------------------------------------------------------------------
    // Verification J: whatsapp_delivery_logs hardening & user_id verification
    // -------------------------------------------------------------------------

    // J-0: Post-migration snapshot and field integrity (if table exists)
    if (waTableExists) {
      const waSnapshotCols = waExistingCols.join(', ');
      const postWaSnapshotRes = await client.query(
        `SELECT ${waSnapshotCols} FROM whatsapp_delivery_logs ORDER BY id;`
      );
      const postWaSnapshot: Record<string, Record<string, unknown>> = {};
      const postWaIds: Set<string> = new Set();

      for (const row of postWaSnapshotRes.rows) {
        const id = String(row.id);
        postWaSnapshot[id] = row;
        postWaIds.add(id);
      }

      // Missing IDs (rows deleted by migration — must never happen)
      const waMissingIds = [...preWaIds].filter(id => !postWaIds.has(id));
      if (waMissingIds.length > 0) {
        throw new Error(
          `whatsapp_delivery_logs rows DELETED by migration. Missing IDs: ${waMissingIds.slice(0, 10).join(', ')}` +
          (waMissingIds.length > 10 ? ` ... and ${waMissingIds.length - 10} more` : '')
        );
      }

      // Extra IDs (rows inserted by migration — must never happen)
      const waExtraIds = [...postWaIds].filter(id => !preWaIds.has(id));
      if (waExtraIds.length > 0) {
        throw new Error(
          `whatsapp_delivery_logs rows INSERTED by migration. Extra IDs: ${waExtraIds.slice(0, 10).join(', ')}` +
          (waExtraIds.length > 10 ? ` ... and ${waExtraIds.length - 10} more` : '')
        );
      }
      console.log(`  [PASS] whatsapp_delivery_logs ID set preserved (${preWaIds.size} IDs, no missing, no extra).`);

      // Field-by-field comparison for whatsapp_delivery_logs
      // SENSITIVITY: Never print recipient phone numbers, provider secrets, or message contents
      const waFieldMismatches: string[] = [];

      for (const id of preWaIds) {
        const preRow  = preWaSnapshot[id];
        const postRow = postWaSnapshot[id];
        const hasParent = preRow['parent_profile_id'] !== null && preRow['parent_profile_id'] !== undefined;

        for (const col of waExistingCols) {
          if (col === 'user_id') {
            if (isFirstRunWaUserId) {
              // Column was absent pre-migration; not in snapshot — nothing to compare
              continue;
            }
            if (hasParent) {
              // Parent-linked delivery log: if user_id was already populated, verify NOT rewritten
              const preVal  = canonicalize(preRow[col]);
              const postVal = canonicalize(postRow[col]);
              if (preVal !== '__NULL__' && preVal !== postVal) {
                waFieldMismatches.push(
                  `  Row id=${id}, column=user_id (parent-linked delivery log): was already populated [${preVal}] but changed to [${postVal}] — must not silently rewrite populated user_id`
                );
              }
              continue;
            }
            // Null-parent delivery log on rerun: post.user_id must equal pre.user_id exactly
            const preVal  = canonicalize(preRow[col]);
            const postVal = canonicalize(postRow[col]);
            if (preVal !== postVal) {
              waFieldMismatches.push(
                `  Row id=${id}, column=user_id (null-parent delivery log): was [${preVal}] now [${postVal}] — rerun must not rewrite volunteer-only user_id`
              );
            }
            continue;
          }

          // All other columns: must be completely unchanged
          const preVal  = canonicalize(preRow[col]);
          const postVal = canonicalize(postRow[col]);
          if (preVal !== postVal) {
            // NEVER print sensitive recipient_phone in logs/output
            if (col === 'recipient_phone') {
              waFieldMismatches.push(
                `  Row id=${id}, column=recipient_phone: value modified (sanitized: phone values must never be modified by migration)`
              );
            } else {
              waFieldMismatches.push(
                `  Row id=${id}, column=${col}: was [${preVal}] now [${postVal}]`
              );
            }
          }
        }
      }

      if (waFieldMismatches.length > 0) {
        const sample = waFieldMismatches.slice(0, 5).join('\n');
        const extra  = waFieldMismatches.length > 5
          ? `\n  ... and ${waFieldMismatches.length - 5} more mismatch(es)` : '';
        throw new Error(
          `whatsapp_delivery_logs field integrity violated.\n${sample}${extra}`
        );
      }
      console.log(`  [PASS] whatsapp_delivery_logs field integrity: all ${preWaIds.size} row(s) verified (user_id rules: ${isFirstRunWaUserId ? 'first-run' : 'rerun'}).`);
    }

    // J-1: Column must exist after migration
    const waUserIdColRes = await client.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'whatsapp_delivery_logs'
        AND column_name  = 'user_id';
    `);
    if (waUserIdColRes.rows.length === 0) {
      throw new Error('whatsapp_delivery_logs.user_id column missing after migration.');
    }
    console.log('  [PASS] whatsapp_delivery_logs.user_id column exists.');

    // J-2: Rows with parent_profile_id must have user_id = parent_profiles.user_id
    const waMismatchRes = await client.query(`
      SELECT COUNT(*) as count
      FROM whatsapp_delivery_logs wdl
      JOIN parent_profiles pp ON pp.id = wdl.parent_profile_id
      WHERE wdl.user_id IS DISTINCT FROM pp.user_id;
    `);
    if (Number(waMismatchRes.rows[0].count) > 0) {
      throw new Error(
        `whatsapp_delivery_logs backfill failed: ${waMismatchRes.rows[0].count} parent-linked log(s) have mismatched or missing user_id.`
      );
    }
    console.log('  [PASS] whatsapp_delivery_logs parent-linked rows backfilled with canonical user_id (100% match).');

    // J-3: Rows without parent_profile_id
    //   FIRST RUN: must have user_id = NULL (no other derivation exists yet).
    //   RERUN: may have a pre-existing non-NULL user_id (e.g. volunteer-only
    //          delivery logged after Phase 2A). The backfill SQL uses
    //          AND wdl.user_id IS NULL so pre-existing values are untouched.
    if (isFirstRunWaUserId) {
      const waOrphanRes = await client.query(`
        SELECT COUNT(*) as count
        FROM whatsapp_delivery_logs
        WHERE parent_profile_id IS NULL
          AND user_id IS NOT NULL;
      `);
      if (Number(waOrphanRes.rows[0].count) > 0) {
        throw new Error(
          `First-run backfill safety violated on whatsapp_delivery_logs: ` +
          `${waOrphanRes.rows[0].count} log(s) with parent_profile_id=NULL were unexpectedly assigned user_id.`
        );
      }
      console.log('  [PASS] First run: whatsapp_delivery_logs null-parent rows correctly have user_id=NULL.');
    } else {
      // Rerun: null-parent + user_id IS NOT NULL = valid volunteer-only delivery log.
      const waVolunteerLogs = await client.query(`
        SELECT COUNT(*) as count FROM whatsapp_delivery_logs WHERE parent_profile_id IS NULL AND user_id IS NOT NULL;
      `);
      console.log(`  [PASS] Rerun: ${waVolunteerLogs.rows[0].count} null-parent whatsapp_delivery_logs row(s) with user_id preserved.`);
    }

    // -------------------------------------------------------------------------
    // 11. COMMIT — only reached if every verification above passed
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
