-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 016_admin_registration_toggle_neon.sql
-- Target Database: PostgreSQL / Neon (Production)
-- Purpose: Additive idempotent schema for Admin Registration Toggle:
--          - Add volunteer_registration_enabled INTEGER DEFAULT 1 to admin_general_settings
--          - Backwards compatible: defaults enabled (1) for existing and new rows
-- Status: PREPARED FOR REVIEW (DO NOT EXECUTE AUTOMATICALLY)
-- ==============================================================================

BEGIN;

ALTER TABLE admin_general_settings
  ADD COLUMN IF NOT EXISTS volunteer_registration_enabled INTEGER DEFAULT 1;

COMMIT;
