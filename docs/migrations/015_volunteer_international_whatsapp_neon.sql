-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 015_volunteer_international_whatsapp_neon.sql
-- Target Database: PostgreSQL / Neon (Production)
-- Purpose: Additive idempotent schema for Volunteer International WhatsApp Foundation:
--          - Add whatsapp_country_iso VARCHAR(2) NULL to volunteer_profiles
--          - Strictly safe for existing rows, does not modify existing data or consent
-- Status: PREPARED FOR REVIEW (DO NOT EXECUTE AUTOMATICALLY)
-- ==============================================================================

BEGIN;

ALTER TABLE volunteer_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_country_iso VARCHAR(2) NULL;

COMMIT;
