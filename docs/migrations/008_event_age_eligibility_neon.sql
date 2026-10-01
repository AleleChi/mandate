-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 008_event_age_eligibility_neon.sql
-- Target: Neon PostgreSQL (Production)
-- Purpose: Additive idempotent schema for Event-Level Age Eligibility
--          - Add minimum_age on events (nullable integer)
--          - Add maximum_age on events (nullable integer)
-- ==============================================================================

BEGIN;

-- 1. Add minimum_age and maximum_age on events table
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS minimum_age INTEGER NULL,
  ADD COLUMN IF NOT EXISTS maximum_age INTEGER NULL;

COMMIT;
