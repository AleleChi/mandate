-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 012_wristband_preparation_state_neon.sql
-- Target Database: PostgreSQL / Neon (Production)
-- Purpose: Additive idempotent schema for TGA 2026 Phase 4B1 Wristband Preparation State:
--          - Update check constraint on wristbands.status to include 'prepared'
--          - Valid statuses: 'prepared', 'available', 'active', 'lost', 'damaged', 'decommissioned'
--          - Guarded, safe for existing rows, does not modify data
-- Status: PREPARED FOR REVIEW (DO NOT EXECUTE AUTOMATICALLY)
-- ==============================================================================

BEGIN;

-- 1. Safely update CHECK constraint on wristbands.status
DO $$
BEGIN
  -- Only proceed if wristbands table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'wristbands'
  ) THEN
    -- Drop existing status check constraint if present (guarded)
    ALTER TABLE wristbands DROP CONSTRAINT IF EXISTS wristbands_status_check;

    -- Add updated constraint including 'prepared'
    ALTER TABLE wristbands ADD CONSTRAINT wristbands_status_check
      CHECK (status IN ('prepared', 'available', 'active', 'lost', 'damaged', 'decommissioned'));
  END IF;
END $$;

COMMIT;
