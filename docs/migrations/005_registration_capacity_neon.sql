-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 005_registration_capacity_neon.sql
-- Target: Neon PostgreSQL (Production)
-- Purpose: Additive idempotent schema for Registration Deadlines & Event/Location Capacity:
--          - Add volunteer_registration_opens_at on events
--          - Add volunteer_registration_closes_at on events
--          - Add capacity on events (maximum child registrations)
--          - Add volunteer_capacity on event_locations (volunteer staffing limit)
-- ==============================================================================

BEGIN;

-- 1. Registration Windows & Total Event Capacity on events table
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS volunteer_registration_opens_at VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS volunteer_registration_closes_at VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS capacity INTEGER NULL;

-- 2. Volunteer Staffing Capacity on event_locations table
ALTER TABLE event_locations
  ADD COLUMN IF NOT EXISTS volunteer_capacity INTEGER NULL;

COMMIT;
