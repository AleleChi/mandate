-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 004_volunteer_communication_neon.sql
-- Target: Neon PostgreSQL (Production)
-- Purpose: Additive schema hardening for Volunteer Communication & Canonical Identity:
--          - Explicit WhatsApp consent tracking on volunteer_profiles
--          - Canonical user_id recipient on notification_jobs
--          - Make notification_jobs.parent_id nullable for volunteer-only jobs
--          - Backfill notification_jobs.user_id from parent_profiles
--          - Canonical user_id on whatsapp_delivery_logs
-- ==============================================================================

BEGIN;

-- 1. Explicit WhatsApp Consent Tracking on volunteer_profiles
ALTER TABLE volunteer_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_consent_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS whatsapp_consent_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_source VARCHAR(64) NULL;

-- Enforce allowed consent statuses via CHECK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_volunteer_profiles_whatsapp_consent_status'
  ) THEN
    ALTER TABLE volunteer_profiles
      ADD CONSTRAINT chk_volunteer_profiles_whatsapp_consent_status
      CHECK (whatsapp_consent_status IN ('unknown', 'opted_in', 'opted_out'));
  END IF;
END $$;

-- Query performance index for consent lookups
CREATE INDEX IF NOT EXISTS idx_volunteer_consent_status
  ON volunteer_profiles(whatsapp_consent_status);

-- 2. Canonical User Recipient on notification_jobs
ALTER TABLE notification_jobs
  ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL;

-- Make parent_id nullable so volunteer communications do not require a fake parent record
ALTER TABLE notification_jobs
  ALTER COLUMN parent_id DROP NOT NULL;

-- Performance index for canonical user lookups on notification_jobs
CREATE INDEX IF NOT EXISTS idx_notification_jobs_user_id
  ON notification_jobs(user_id);

-- Backfill user_id on existing parent notification_jobs
UPDATE notification_jobs nj
SET user_id = pp.user_id
FROM parent_profiles pp
WHERE nj.parent_id = pp.id
  AND nj.user_id IS NULL;

-- 3. Canonical User Recipient on whatsapp_delivery_logs (Additive)
ALTER TABLE whatsapp_delivery_logs
  ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_delivery_user_id
  ON whatsapp_delivery_logs(user_id);

-- Backfill user_id on existing parent delivery logs
UPDATE whatsapp_delivery_logs wdl
SET user_id = pp.user_id
FROM parent_profiles pp
WHERE wdl.parent_profile_id = pp.id
  AND wdl.user_id IS NULL;

COMMIT;
