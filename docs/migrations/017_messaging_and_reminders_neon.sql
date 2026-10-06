-- ==============================================================================
-- KOINONIA PRODUCTION DATABASE MIGRATION
-- Migration: 017_messaging_and_reminders_neon.sql
-- Target Database: PostgreSQL / Neon (Production)
-- Purpose: Additive idempotent schema for Koinonia Messaging & Reminders:
--          - message_threads (Parent/Volunteer <-> Admin support threads & application reminders)
--          - message_thread_participants (Thread membership and read state)
--          - messages (Thread messages, semantic types, action links)
--          - announcements (Admin broadcast announcements)
--          - announcement_reads (Per-user read tracking for announcements)
-- Status: PREPARED FOR REVIEW (DO NOT EXECUTE AUTOMATICALLY)
-- ==============================================================================

BEGIN;

-- 1. Message Threads
CREATE TABLE IF NOT EXISTS message_threads (
  id TEXT PRIMARY KEY,
  event_id TEXT NULL REFERENCES events(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  linked_child_id TEXT NULL REFERENCES children(id) ON DELETE SET NULL,
  linked_entry_id TEXT NULL REFERENCES child_event_entries(id) ON DELETE SET NULL,
  created_by_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  last_message_at TEXT NOT NULL,
  last_message_preview TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_message_threads_event ON message_threads(event_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_child ON message_threads(linked_child_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_entry ON message_threads(linked_entry_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_last_msg ON message_threads(last_message_at DESC);

-- 2. Thread Participants
CREATE TABLE IF NOT EXISTS message_thread_participants (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  last_read_at TEXT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_participants_user ON message_thread_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_thread_participants_thread ON message_thread_participants(thread_id);

-- 3. Messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'standard',
  body TEXT NOT NULL,
  action_type TEXT NULL,
  action_payload_json TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_type_created ON messages(message_type, created_at DESC);

-- 4. Announcements (Broadcasts)
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  event_id TEXT NULL REFERENCES events(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience_type TEXT NOT NULL,
  target_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_audience ON announcements(audience_type, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_target_user ON announcements(target_user_id);

-- 5. Announcement Reads
CREATE TABLE IF NOT EXISTS announcement_reads (
  id TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reads_user ON announcement_reads(user_id);

COMMIT;
