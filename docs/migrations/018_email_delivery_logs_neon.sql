-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 018_email_delivery_logs_neon.sql
-- Target Database: PostgreSQL / Neon (Production)
-- Purpose: Additive idempotent schema for Email Delivery Logs:
--          - Dedicated per-recipient email_delivery_logs table
--          - Event, parent, user and campaign tracking
--          - Idempotent and channel-isolated from WhatsApp logs
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS email_delivery_logs (
  id VARCHAR(64) PRIMARY KEY,
  campaign_id VARCHAR(64),
  event_id VARCHAR(64) REFERENCES events(id) ON DELETE SET NULL,
  parent_profile_id VARCHAR(64) REFERENCES parent_profiles(id) ON DELETE SET NULL,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  recipient_email VARCHAR(255) NOT NULL,
  subject TEXT,
  provider VARCHAR(64),
  provider_message_id VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  error_message TEXT,
  sent_at TIMESTAMP,
  failed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_parent ON email_delivery_logs(parent_profile_id);
CREATE INDEX IF NOT EXISTS idx_email_delivery_event ON email_delivery_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_email_delivery_status ON email_delivery_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_delivery_campaign ON email_delivery_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_delivery_email ON email_delivery_logs(recipient_email);

COMMIT;
