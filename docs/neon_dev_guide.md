# Neon Development Database & Gallery Testing Guide

This guide describes how to safely test the **Orbital Photo Gallery** against a real PostgreSQL environment on **Neon** without touching or modifying the production Neon database.

---

## CRITICAL SAFETY RULES

> [!CAUTION]
> **NEVER** run migrations, DDL statements, or test scripts against the production Neon database.
> **NEVER** commit connection strings containing database passwords to Git.
> All local credentials must reside **ONLY** in `.env.local`, which is strictly ignored by Git.

---

## Step 1: Create a Neon Development Branch

1. Log into your [Neon Console](https://console.neon.tech/).
2. Select your project.
3. Under the **Branches** tab, click **New Branch**.
4. Set the branch name (e.g., `dev` or `gallery-testing`).
5. Choose whether to branch from `main` or create an empty schema.
6. Click **Create Branch**.

---

## Step 2: Copy the Development Connection String

1. In the Neon Console for your new branch, locate the **Connection Details** pane.
2. Select **Connection string** (choose Node.js or psql format).
3. Ensure the connection string points to your **development** endpoint (e.g. `ep-quiet-breeze-xxxx.us-east-2.aws.neon.tech`), NOT the production endpoint.
4. Copy the connection string:
   ```text
   postgresql://[user]:[password]@[dev-endpoint].neon.tech/neondb?sslmode=require
   ```

---

## Step 3: Configure `.env.local`

1. Open `.env.local` in your project root (this file is git-ignored).
2. Paste the development database URL:
   ```env
   DATABASE_URL="postgresql://[user]:[password]@[dev-endpoint].neon.tech/neondb?sslmode=require"
   ```
3. Save the file.
4. Run the verification script to confirm your dev connection without exposing secrets:
   ```bash
   npx tsx scripts/verify-db-env.ts
   ```
   **Verify output:**
   - `Database engine detected: PostgreSQL`
   - `Database host/domain: [your-dev-endpoint].neon.tech`
   - Confirm the domain corresponds to your dev branch, NOT production.

---

## Step 4: Run the Gallery Migration Against Your DEV DB Only

The idempotent migration script is located at:
`docs/migrations/001_landing_gallery_items_neon.sql`

You can run this migration safely using **Option A (Neon SQL Editor)** or **Option B (Command line)**:

### Option A: Via Neon Console SQL Editor (Recommended)
1. In the Neon Console, switch the active branch selector at the top to your **development branch**.
2. Open the **SQL Editor** tab.
3. Paste the contents of `docs/migrations/001_landing_gallery_items_neon.sql`.
4. Click **Run**.

### Option B: Via Local Safe Script
Run our safe dev migration runner:
```bash
npx tsx scripts/run-dev-migration.ts
```
*(This script verifies that `DATABASE_URL` is configured and refuses to run if the database host contains production markers).*

---

## Step 5: Verify Table Creation

In the Neon SQL Editor (or psql), execute:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'landing_gallery_items'
ORDER BY ordinal_position;
```
Verify the columns: `id`, `media_file_id`, `image_url`, `alt_text`, `caption`, `sort_order`, `is_active`, `created_by`, `created_at`, `updated_at`.

---

## Step 6: Start Application & Test Locally

1. Start the full-stack dev server:
   ```bash
   npm run dev
   ```
2. Navigate to `http://localhost:3000/admin/landing`.
3. Log in with admin credentials.
4. Click the **Orbital Photo Gallery** tab.
5. Upload photos, adjust alt text, change order, and toggle Live/Draft status.
6. Open `http://localhost:3000/` in an incognito window to verify public orbital rotation and Lightbox display.
