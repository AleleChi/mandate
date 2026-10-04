-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 014_international_whatsapp_neon.sql
-- Target Database: PostgreSQL / Neon (Production)
-- Purpose: Additive idempotent schema for Parent International WhatsApp Foundation:
--          - Add country_iso VARCHAR(2) NULL to parent_profiles
--          - Add whatsapp_country_iso VARCHAR(2) NULL to parent_profiles
--          - Strictly safe for existing rows, does not modify existing data or consent
-- Status: PREPARED FOR REVIEW (DO NOT EXECUTE AUTOMATICALLY)
-- ==============================================================================

BEGIN;

-- Add country_iso and whatsapp_country_iso to parent_profiles
ALTER TABLE parent_profiles
  ADD COLUMN IF NOT EXISTS country_iso VARCHAR(2) NULL;

ALTER TABLE parent_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_country_iso VARCHAR(2) NULL;

COMMIT;
