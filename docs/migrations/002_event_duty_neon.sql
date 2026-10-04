-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 002_event_duty_neon.sql
-- Target: Neon PostgreSQL (Production)
-- Purpose: Complete idempotent schema for Event Duty Module:
--          - Devices & Readiness Tracking
--          - Team Duty Assignments & Shifts
--          - Event Locations (Rooms, Zones, Gates, Check-in / Pickup points)
--          - Location Scannable Codes & Active Presence
--          - Alert Routing Rules & Recipients
-- ==============================================================================

BEGIN;

-- 1. Event Duty Devices
CREATE TABLE IF NOT EXISTS event_duty_devices (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(255) NOT NULL,
  event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  device_label VARCHAR(255) NOT NULL,
  app_generated_device_id VARCHAR(255) UNIQUE NOT NULL,
  push_subscription_id VARCHAR(255),
  sound_enabled INTEGER DEFAULT 1,
  voice_enabled INTEGER DEFAULT 1,
  vibration_enabled INTEGER DEFAULT 1,
  live_connection_status VARCHAR(255) DEFAULT 'disconnected',
  readiness_status VARCHAR(255) DEFAULT 'unknown',
  readiness_checked_at TIMESTAMP,
  duty_started_at TIMESTAMP,
  duty_ended_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

-- 2. Device Readiness Logs
CREATE TABLE IF NOT EXISTS device_readiness_logs (
  id VARCHAR(255) PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(255) NOT NULL,
  device_id VARCHAR(255) NOT NULL REFERENCES event_duty_devices(id) ON DELETE CASCADE,
  readiness_status VARCHAR(255) NOT NULL,
  critical_passed INTEGER NOT NULL,
  sound_ready INTEGER NOT NULL,
  push_ready INTEGER NOT NULL,
  voice_ready INTEGER NOT NULL,
  vibration_supported INTEGER NOT NULL,
  live_connection_state VARCHAR(255) NOT NULL,
  event_sync_age INTEGER,
  check_timestamp TIMESTAMP NOT NULL,
  duty_started_at TIMESTAMP,
  duty_ended_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL
);

-- 3. Event Locations (Rooms, Zones, Gates, Check-in / Pickup points)
CREATE TABLE IF NOT EXISTS event_locations (
  id VARCHAR(255) PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  parent_location_id VARCHAR(255) REFERENCES event_locations(id) ON DELETE SET NULL,
  location_type VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  short_name VARCHAR(255),
  description TEXT,
  instructions TEXT,
  capacity INTEGER,
  age_group_key VARCHAR(255),
  team_key VARCHAR(255),
  emergency_label VARCHAR(255),
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  archived_at TIMESTAMP,
  archived_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  updated_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

-- 4. Event Location Codes (Scannable QR Tokens)
CREATE TABLE IF NOT EXISTS event_location_codes (
  id VARCHAR(255) PRIMARY KEY,
  event_location_id VARCHAR(255) NOT NULL REFERENCES event_locations(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  token_version INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  generated_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMP NOT NULL,
  rotated_at TIMESTAMP,
  disabled_at TIMESTAMP,
  expires_at TIMESTAMP
);

-- 5. Event Duty Assignments
CREATE TABLE IF NOT EXISTS event_duty_assignments (
  id VARCHAR(255) PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  responsibility_key VARCHAR(255) NOT NULL,
  team_key VARCHAR(255),
  assignment_level VARCHAR(255) DEFAULT 'primary',
  status VARCHAR(255) DEFAULT 'scheduled',
  starts_at VARCHAR(255) NOT NULL,
  ends_at VARCHAR(255) NOT NULL,
  temporarily_unavailable_at VARCHAR(255),
  expected_return_at VARCHAR(255),
  note TEXT,
  assigned_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  assigned_location_id VARCHAR(255) REFERENCES event_locations(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

-- Ensure assigned_location_id exists if event_duty_assignments was created earlier
ALTER TABLE event_duty_assignments ADD COLUMN IF NOT EXISTS assigned_location_id VARCHAR(255);

-- 6. Event Duty Location Presence (Live Responders at Locations)
CREATE TABLE IF NOT EXISTS event_duty_location_presence (
  id VARCHAR(255) PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duty_device_id VARCHAR(255) REFERENCES event_duty_devices(id) ON DELETE SET NULL,
  event_location_id VARCHAR(255) NOT NULL REFERENCES event_locations(id) ON DELETE CASCADE,
  source VARCHAR(255) NOT NULL,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL
);

-- 7. Alert Routing Rules
CREATE TABLE IF NOT EXISTS alert_routing_rules (
  id VARCHAR(255) PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_key VARCHAR(255) NOT NULL,
  severity_key VARCHAR(255) NOT NULL,
  location_scope VARCHAR(255),
  team_scope VARCHAR(255),
  requires_acknowledgement INTEGER DEFAULT 1,
  escalation_delay_seconds INTEGER DEFAULT 30,
  is_active INTEGER DEFAULT 1,
  effective_from VARCHAR(255),
  effective_until VARCHAR(255),
  location_id VARCHAR(255),
  location_type_scope VARCHAR(64),
  include_sub_locations INTEGER DEFAULT 0,
  created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  updated_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

ALTER TABLE alert_routing_rules ADD COLUMN IF NOT EXISTS location_id VARCHAR(255);
ALTER TABLE alert_routing_rules ADD COLUMN IF NOT EXISTS location_type_scope VARCHAR(64);
ALTER TABLE alert_routing_rules ADD COLUMN IF NOT EXISTS include_sub_locations INTEGER DEFAULT 0;

-- 8. Alert Routing Recipients
CREATE TABLE IF NOT EXISTS alert_routing_recipients (
  id VARCHAR(255) PRIMARY KEY,
  routing_rule_id VARCHAR(255) NOT NULL REFERENCES alert_routing_rules(id) ON DELETE CASCADE,
  recipient_type VARCHAR(255) NOT NULL,
  responsibility_key VARCHAR(255),
  team_key VARCHAR(255),
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  delivery_tier VARCHAR(255) NOT NULL DEFAULT 'primary',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL
);

-- 9. Event Routing Change History
CREATE TABLE IF NOT EXISTS event_routing_change_history (
  id VARCHAR(255) PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  target_type VARCHAR(255) NOT NULL,
  target_id VARCHAR(255) NOT NULL,
  details TEXT,
  created_at TIMESTAMP NOT NULL
);

-- 10. Indexes for Performance and Foreign Key Lookups
CREATE INDEX IF NOT EXISTS idx_event_duty_devices_user_event ON event_duty_devices(user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_event_duty_assignments_event ON event_duty_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_duty_assignments_user ON event_duty_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_event_locations_event_active ON event_locations(event_id, is_active);
CREATE INDEX IF NOT EXISTS idx_event_locations_parent ON event_locations(parent_location_id);
CREATE INDEX IF NOT EXISTS idx_event_location_codes_hash ON event_location_codes(token_hash);
CREATE INDEX IF NOT EXISTS idx_event_duty_location_presence_user ON event_duty_location_presence(user_id);
CREATE INDEX IF NOT EXISTS idx_event_duty_location_presence_loc ON event_duty_location_presence(event_location_id);
CREATE INDEX IF NOT EXISTS idx_alert_routing_rules_event ON alert_routing_rules(event_id);
CREATE INDEX IF NOT EXISTS idx_alert_routing_recipients_rule ON alert_routing_recipients(routing_rule_id);

COMMIT;
