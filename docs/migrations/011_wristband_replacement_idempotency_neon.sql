-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 011_wristband_replacement_idempotency_neon.sql
-- Target Database: PostgreSQL / Neon (Production)
-- Purpose: Additive idempotent schema for TGA 2026 Phase 2B NFC Wristband Operations:
--          - Create wristband_operation_idempotency table for atomic deactivation and
--            replacement retry safety across process restarts
-- Status: PREPARED FOR REVIEW (DO NOT EXECUTE AUTOMATICALLY)
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS wristband_operation_idempotency (
  idempotency_key VARCHAR(128) PRIMARY KEY,
  operation_type VARCHAR(32) NOT NULL,
  event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  request_payload_hash VARCHAR(64) NOT NULL,
  response_payload TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wb_op_idempotency_event
ON wristband_operation_idempotency(event_id);

CREATE INDEX IF NOT EXISTS idx_wb_op_idempotency_type
ON wristband_operation_idempotency(operation_type);

COMMIT;
