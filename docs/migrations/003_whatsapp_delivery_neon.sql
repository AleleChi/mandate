-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 003_whatsapp_delivery_neon.sql
-- Target: Neon PostgreSQL (Production)
-- Purpose: Complete idempotent additive schema for WhatsApp Delivery Foundation:
--          - Explicit WhatsApp consent tracking on parent_profiles
--          - Idempotency key and worker retry tracking on notification_jobs
--          - Dedicated per-recipient whatsapp_delivery_logs table
-- ==============================================================================

BEGIN;

-- 1. Explicit WhatsApp Consent Tracking on parent_profiles
ALTER TABLE parent_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_consent_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS whatsapp_consent_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_source VARCHAR(32) NULL;

-- Enforce allowed consent statuses via CHECK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_parent_profiles_whatsapp_consent_status'
  ) THEN
    ALTER TABLE parent_profiles
      ADD CONSTRAINT chk_parent_profiles_whatsapp_consent_status
      CHECK (whatsapp_consent_status IN ('unknown', 'opted_in', 'opted_out'));
  END IF;
END $$;

-- 2. Idempotency Key & Worker Retry State on notification_jobs
ALTER TABLE notification_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS last_error TEXT NULL;

-- Unique partial index for idempotency enforcement (allows NULL for legacy jobs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_jobs_idempotency_key
  ON notification_jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Dedicated Per-Recipient WhatsApp Delivery Tracking Table
CREATE TABLE IF NOT EXISTS whatsapp_delivery_logs (
  id VARCHAR(64) PRIMARY KEY,
  job_id VARCHAR(64) NULL REFERENCES notification_jobs(id) ON DELETE SET NULL,
  campaign_id VARCHAR(64) NULL,
  parent_profile_id VARCHAR(64) NULL REFERENCES parent_profiles(id) ON DELETE SET NULL,
  child_event_entry_id VARCHAR(64) NULL REFERENCES child_event_entries(id) ON DELETE SET NULL,
  recipient_phone VARCHAR(32) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_message_id VARCHAR(128) NULL,
  template_name VARCHAR(128) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  error_code VARCHAR(64) NULL,
  error_message TEXT NULL,
  sent_at TIMESTAMP NULL,
  delivered_at TIMESTAMP NULL,
  read_at TIMESTAMP NULL,
  failed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Drop legacy un-scoped index if exists from early draft
DROP INDEX IF EXISTS idx_wa_delivery_provider_msg_id;

-- Provider-scoped unique index for non-null provider_message_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_delivery_provider_msg
  ON whatsapp_delivery_logs(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Query performance indexes
CREATE INDEX IF NOT EXISTS idx_wa_delivery_parent
  ON whatsapp_delivery_logs(parent_profile_id);

CREATE INDEX IF NOT EXISTS idx_wa_delivery_status
  ON whatsapp_delivery_logs(status);

CREATE INDEX IF NOT EXISTS idx_wa_delivery_job_id
  ON whatsapp_delivery_logs(job_id);

CREATE INDEX IF NOT EXISTS idx_wa_delivery_entry_id
  ON whatsapp_delivery_logs(child_event_entry_id);

COMMIT;
