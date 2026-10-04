# Production Database Migration Guide: Orbital Photo Gallery

This guide describes the controlled, one-time execution procedure for applying the **Orbital Photo Gallery** database schema to the **LIVE Neon PostgreSQL production database**.

---

## CRITICAL SAFETY & ISOLATION PRINCIPLES

> [!CAUTION]
> **Strict Operational Guardrails:**
> - The live production migration runner (`scripts/run-production-migration.ts`) is completely decoupled from `npm run dev`, `server.ts`, and `initPostgresSchema()`.
> - The runner **NEVER** starts Express, Vite, background jobs, schedulers, or seeders.
> - The runner **NEVER** logs passwords or full connection strings.
> - The runner **REQUIRES** an explicit confirmation token: `ALLOW_PRODUCTION_MIGRATION="YES_I_UNDERSTAND"`.
> - The runner performs **READ-ONLY pre-flight introspection** before executing any DDL. If the table already matches the target schema, it reports `MIGRATION ALREADY APPLIED — NO CHANGES REQUIRED` and exits without making changes.
> - Normal local development (`npm run dev`) **DOES NOT** load production credentials; it remains strictly configured to use `.env.local` or local SQLite.

---

## Step 1: Pre-Migration Backup & Preparation

Before applying any schema modifications to production:

1. **Create a Neon Point-In-Time Snapshot / Branch:**
   - Log into the [Neon Console](https://console.neon.tech/).
   - Select your production project and primary branch (`main`).
   - Create a snapshot or branch (e.g., `backup-pre-gallery-migration-2026`).
2. **Obtain the Direct (Unpooled) Connection String:**
   - In Neon Console, locate the **Connection Details** for the production branch.
   - Choose the **Direct / Unpooled** connection format (recommended for DDL operations):
     ```text
     postgresql://[user]:[password]@[prod-endpoint].neon.tech/neondb?sslmode=require
     ```
3. **Verify the Migration SQL:**
   - Review the idempotent SQL file at [`docs/migrations/001_landing_gallery_items_neon.sql`](file:///c:/Users/alele/Desktop/mandate/docs/migrations/001_landing_gallery_items_neon.sql).

---

## Step 2: Choose Execution Approach

You can provide the production credentials using **Approach A (Temporary Shell Variables)** or **Approach B (Ignored File)**.

### Approach A: Temporary PowerShell Environment Variables (Recommended)

In your PowerShell terminal:

```powershell
# 1. Set the temporary production database connection URL
$env:DATABASE_URL="postgresql://[user]:[password]@[prod-endpoint].neon.tech/neondb?sslmode=require"

# 2. Set the mandatory explicit confirmation token
$env:ALLOW_PRODUCTION_MIGRATION="YES_I_UNDERSTAND"

# 3. Execute the dedicated migration runner
npm run migrate:production:gallery

# 4. Immediately clear credentials from the shell session
Remove-Item Env:DATABASE_URL
Remove-Item Env:ALLOW_PRODUCTION_MIGRATION
```

---

### Approach B: Ignored `.env.production.local` File

The migration runner is configured to load `.env.production.local` if present. This file is strictly ignored by Git.

1. Open or create `.env.production.local` in the project root:
   ```env
   DATABASE_URL="postgresql://[user]:[password]@[prod-endpoint].neon.tech/neondb?sslmode=require"
   ALLOW_PRODUCTION_MIGRATION="YES_I_UNDERSTAND"
   ```
2. Execute the dedicated migration runner:
   ```bash
   npm run migrate:production:gallery
   ```
3. Clear or delete `.env.production.local` after execution.

*(Note: `server.ts` and `npm run dev` do not load `.env.production.local`. They continue loading `.env.local` for local development).*

---

## Step 3: Migration Execution & What to Expect

When executed, the runner will:

1. **Verify environment guards**:
   - Check `DATABASE_URL` format.
   - Check `ALLOW_PRODUCTION_MIGRATION === 'YES_I_UNDERSTAND'`.
2. **Print sanitized target details** (no passwords shown):
   ```text
   Target Database Details:
     Database engine: PostgreSQL
     Host:            ep-xxxx.us-east-2.aws.neon.tech
     Database:        neondb
     SSL enabled:     YES
     Migration:       docs/migrations/001_landing_gallery_items_neon.sql
     Environment:     production
   ```
3. **Pre-flight Check (Read-Only)**:
   - Queries `information_schema.tables` and `information_schema.columns`.
   - If `landing_gallery_items` already exists with all 10 expected columns and indexes:
     Reports `MIGRATION ALREADY APPLIED — NO CHANGES REQUIRED` and exits cleanly with code 0.
4. **Transaction Execution**:
   - Runs `BEGIN; ... DDL ... COMMIT;` atomically.
   - If an error occurs, issues `ROLLBACK;` and exits with code 1.
5. **Post-Migration Verification (Read-Only)**:
   - Validates that `landing_gallery_items` exists.
   - Validates all 10 columns: `id`, `media_file_id`, `image_url`, `alt_text`, `caption`, `sort_order`, `is_active`, `created_by`, `created_at`, `updated_at`.
   - Validates primary key (`id`).
   - Validates foreign key (`media_file_id -> media_files(id)`).
   - Validates composite index `idx_landing_gallery_active_sort` and `idx_landing_gallery_media_file`.
   - Prints verification confirmation table.

---

## Pre-Migration Checklist

- [ ] Production backup or Neon snapshot created.
- [ ] Direct/unpooled Neon production connection string copied.
- [ ] Confirmed target database host corresponds to production Neon.
- [ ] Reviewed `docs/migrations/001_landing_gallery_items_neon.sql`.
- [ ] Prepared `ALLOW_PRODUCTION_MIGRATION="YES_I_UNDERSTAND"`.
- [ ] Verified local development server (`npm run dev`) is not running with production credentials.

---

## Post-Migration Checklist

- [ ] Output shows `POST-MIGRATION VERIFICATION PASSED`.
- [ ] Verified 10 columns created on `landing_gallery_items`.
- [ ] Verified foreign key to `media_files` exists.
- [ ] Verified indices `idx_landing_gallery_active_sort` and `idx_landing_gallery_media_file` exist.
- [ ] Cleared shell environment variables or emptied `.env.production.local`.
- [ ] Ready to proceed with production application deployment.
