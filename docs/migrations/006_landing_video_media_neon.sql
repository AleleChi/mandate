-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 006_landing_video_media_neon.sql
-- Target Database: PostgreSQL / Neon (Production)
-- Purpose: Additive idempotent schema for Landing Video Media Assets:
--          - Add original_filename VARCHAR(255) on media_files
--          - Add optimized_url TEXT on media_files
--          - Add poster_url TEXT on media_files
-- Status: PREPARED FOR REVIEW (DO NOT EXECUTE AUTOMATICALLY)
-- ==============================================================================

BEGIN;

ALTER TABLE media_files
ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255);

ALTER TABLE media_files
ADD COLUMN IF NOT EXISTS optimized_url TEXT;

ALTER TABLE media_files
ADD COLUMN IF NOT EXISTS poster_url TEXT;

COMMIT;
