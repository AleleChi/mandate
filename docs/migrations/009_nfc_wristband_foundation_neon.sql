-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 009_nfc_wristband_foundation_neon.sql
-- Target Database: PostgreSQL / Neon (Production)
-- Purpose: Additive idempotent schema for TGA 2026 Phase 1B NFC Wristband Foundation:
--          - Create supporting unique index on child_event_entries(id, event_id)
--          - Create wristbands inventory table (event-scoped, strictly PII-free)
--          - Create child_wristband_assignments table (immutable assignment history)
--          - Enforce invariants: at most one active wristband per child entry,
--            at most one active child per wristband via partial unique indexes
--          - Enforce event consistency via composite foreign keys
--          - Create operational lookup and audit indexes
-- Status: PREPARED FOR REVIEW (DO NOT EXECUTE AUTOMATICALLY)
-- ==============================================================================

BEGIN;

-- 1. Supporting unique index on child_event_entries to enable composite foreign key referencing (id, event_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_child_event_entries_id_event
ON child_event_entries(id, event_id);

-- 2. Physical wristband inventory entity (event-scoped, no PII)
CREATE TABLE IF NOT EXISTS wristbands (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  wristband_code VARCHAR(64) NOT NULL,
  nfc_uid VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'active', 'lost', 'damaged', 'decommissioned')),
  created_by_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  CONSTRAINT uq_wristbands_event_code UNIQUE (event_id, wristband_code),
  CONSTRAINT uq_wristbands_event_nfc UNIQUE (event_id, nfc_uid),
  CONSTRAINT uq_wristbands_id_event UNIQUE (id, event_id)
);

-- Index for event + inventory status queries
CREATE INDEX IF NOT EXISTS idx_wristbands_event_status
ON wristbands(event_id, status);

-- 3. Immutable child wristband assignment history table
CREATE TABLE IF NOT EXISTS child_wristband_assignments (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  child_event_entry_id VARCHAR(64) NOT NULL,
  wristband_id VARCHAR(64) NOT NULL,
  assigned_by_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP NOT NULL,
  deactivated_at TIMESTAMP,
  deactivated_by_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  deactivation_reason VARCHAR(64),
  created_at TIMESTAMP NOT NULL,
  CONSTRAINT fk_cw_assignments_entry_event
    FOREIGN KEY (child_event_entry_id, event_id)
    REFERENCES child_event_entries(id, event_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_cw_assignments_wristband_event
    FOREIGN KEY (wristband_id, event_id)
    REFERENCES wristbands(id, event_id)
    ON DELETE CASCADE
);

-- 4. Partial unique indexes enforcing core invariants:
-- Invariant A: One child event entry may have AT MOST ONE active wristband (deactivated_at IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_assignment_entry
ON child_wristband_assignments(child_event_entry_id)
WHERE deactivated_at IS NULL;

-- Invariant B: One wristband may be actively assigned to AT MOST ONE child (deactivated_at IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_assignment_wristband
ON child_wristband_assignments(wristband_id)
WHERE deactivated_at IS NULL;

-- 5. Operational history indexes
-- Assignment chronological audit history per child event entry
CREATE INDEX IF NOT EXISTS idx_assignments_child_entry_time
ON child_wristband_assignments(child_event_entry_id, assigned_at);

-- Assignment chronological audit history per event
CREATE INDEX IF NOT EXISTS idx_assignments_event_time
ON child_wristband_assignments(event_id, assigned_at);

COMMIT;
