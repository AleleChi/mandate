-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 010_wristband_sequence_and_idempotency_neon.sql
-- Target Database: PostgreSQL / Neon (Production)
-- Purpose: Additive idempotent schema for TGA 2026 Phase 2A NFC Wristband API:
--          - Create event_wristband_sequences table for concurrency-safe event-scoped sequence code generation (WB-000001)
--          - Create wristband_binding_idempotency table for atomic binding retry safety across process restarts
--          - Create supporting operational indexes and foreign keys
-- Status: PREPARED FOR REVIEW (DO NOT EXECUTE AUTOMATICALLY)
-- ==============================================================================

BEGIN;

-- 1. Event Wristband Code Sequence Table
-- Guarantees atomic, event-scoped sequence allocation without SELECT MAX concurrency races
CREATE TABLE IF NOT EXISTS event_wristband_sequences (
  event_id VARCHAR(64) PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  next_seq INTEGER NOT NULL DEFAULT 1
);

-- 2. Wristband Binding Idempotency Table
-- Stores binding response payload and key associations to ensure safe retries across process restarts
CREATE TABLE IF NOT EXISTS wristband_binding_idempotency (
  idempotency_key VARCHAR(128) PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  child_event_entry_id VARCHAR(64) NOT NULL,
  wristband_id VARCHAR(64) NOT NULL REFERENCES wristbands(id) ON DELETE CASCADE,
  response_payload TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);

-- Supporting lookup index for event-scoped idempotency queries and cleanup
CREATE INDEX IF NOT EXISTS idx_wb_binding_idempotency_event
ON wristband_binding_idempotency(event_id);

COMMIT;
