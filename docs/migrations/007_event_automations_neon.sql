-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 007_event_automations_neon.sql
-- Target Database: PostgreSQL / Neon (Production)
-- Purpose: Additive idempotent schema for Phase 3B Event Automations:
--          - Create event_automations table
--          - Create idx_event_automations_fingerprint unique index
--          - Create idx_event_automations_status index
--          - Create event_automation_settings table
-- Status: PREPARED FOR REVIEW (DO NOT EXECUTE AUTOMATICALLY)
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS event_automations (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL,
  rule_id VARCHAR(64) NOT NULL,
  signal_type VARCHAR(64) NOT NULL,
  fingerprint VARCHAR(128) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  description TEXT,
  severity VARCHAR(32) NOT NULL DEFAULT 'information',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  entity_type VARCHAR(64),
  entity_id VARCHAR(64),
  payload_json TEXT,
  proposed_action_key VARCHAR(64),
  proposed_action_payload TEXT,
  action_target_route VARCHAR(64),
  action_target_label VARCHAR(64),
  first_detected_at TIMESTAMP NOT NULL,
  last_detected_at TIMESTAMP NOT NULL,
  resolved_at TIMESTAMP,
  acknowledged_at TIMESTAMP,
  cooldown_until TIMESTAMP,
  material_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_automations_fingerprint
ON event_automations(event_id, fingerprint);

CREATE INDEX IF NOT EXISTS idx_event_automations_status
ON event_automations(event_id, status);

CREATE TABLE IF NOT EXISTS event_automation_settings (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL,
  rule_id VARCHAR(64) NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMP NOT NULL,
  updated_by VARCHAR(64),
  UNIQUE(event_id, rule_id)
);

COMMIT;
