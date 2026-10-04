-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 013_wristbands_nullable_nfc_uid_neon.sql
-- Target Database: PostgreSQL / Neon (Production)
-- Purpose: Additive idempotent schema for TGA 2026 Device-Independent Wristband Production:
--          - Allow wristbands.nfc_uid to be NULL for code-only wristbands
--          - Preserve unique index on (event_id, nfc_uid) for non-null NFC values
--          - Strictly safe for existing NFC rows, does not modify existing data
-- Status: PREPARED FOR REVIEW (DO NOT EXECUTE AUTOMATICALLY)
-- ==============================================================================

BEGIN;

-- 1. Safely alter wristbands.nfc_uid column to allow NULL for code-only wristbands
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wristbands' AND column_name = 'nfc_uid' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE wristbands ALTER COLUMN nfc_uid DROP NOT NULL;
  END IF;
END $$;

COMMIT;
