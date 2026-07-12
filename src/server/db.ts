import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import pg from 'pg';
import crypto from 'crypto';
const { Pool } = pg;

let sqliteDb: Database.Database | null = null;
let isPostgres = false;
let pgPool: any = null;
let pgInitPromise: Promise<void> | null = null;

export const REAL_EVENT_ID = 'event-ga-2026';

export function getDb() {
  if (sqliteDb || pgPool) return { query, queryOne, execute, transaction, REAL_EVENT_ID };

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
    isPostgres = true;
    try {
      pgPool = new Pool({ connectionString: dbUrl });
      pgInitPromise = initPostgresSchema(pgPool).catch((e) => {
        console.error('Error during initPostgresSchema:', e);
      });
    } catch (e) {
      console.error('Failed to initialize PostgreSQL pool, falling back to SQLite', e);
      isPostgres = false;
    }
  }

  if (!isPostgres) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'koinonia-dev.sqlite');
    try {
      sqliteDb = new Database(dbPath, { timeout: 10000 });
      sqliteDb.pragma('journal_mode = WAL');
      sqliteDb.pragma('foreign_keys = ON');
      initSqliteSchema(sqliteDb);
    } catch (e) {
      console.error('Database corruption or open error detected, rebuilding SQLite:', e);
      if (sqliteDb) {
        try {
          sqliteDb.close();
        } catch (_) {}
        sqliteDb = null;
      }
      // Backup corrupted files
      const timestamp = Date.now();
      const filesToMove = [
        'koinonia-dev.sqlite',
        'koinonia-dev.sqlite-shm',
        'koinonia-dev.sqlite-wal'
      ];
      for (const f of filesToMove) {
        const fullPath = path.join(dataDir, f);
        if (fs.existsSync(fullPath)) {
          try {
            fs.renameSync(fullPath, `${fullPath}.corrupt-${timestamp}`);
          } catch (renameErr) {
            console.error(`Failed to rename corrupt file ${f}:`, renameErr);
            try {
              fs.unlinkSync(fullPath);
            } catch (_) {}
          }
        }
      }
      // Re-initialize a fresh database
      sqliteDb = new Database(dbPath, { timeout: 10000 });
      sqliteDb.pragma('journal_mode = WAL');
      sqliteDb.pragma('foreign_keys = ON');
      initSqliteSchema(sqliteDb);
    }
  }

  return { query, queryOne, execute, transaction, REAL_EVENT_ID };
}

function convertPlaceholders(sql: string): string {
  let idx = 1;
  return sql.replace(/\?/g, () => `$${idx++}`);
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const db = getDb();
  if (isPostgres && pgPool) {
    if (pgInitPromise) await pgInitPromise;
    const pgSql = convertPlaceholders(sql);
    const res = await pgPool.query(pgSql, params);
    return res.rows;
  } else if (sqliteDb) {
    const stmt = sqliteDb.prepare(sql);
    return stmt.all(...params) as T[];
  }
  return [];
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function execute(sql: string, params: any[] = []): Promise<{ changes: number }> {
  const db = getDb();
  if (isPostgres && pgPool) {
    if (pgInitPromise) await pgInitPromise;
    const pgSql = convertPlaceholders(sql);
    const res = await pgPool.query(pgSql, params);
    return { changes: res.rowCount || 0 };
  } else if (sqliteDb) {
    const stmt = sqliteDb.prepare(sql);
    const info = stmt.run(...params);
    return { changes: info.changes };
  }
  return { changes: 0 };
}

let sqliteTxQueue = Promise.resolve();

export async function transaction<T>(fn: () => Promise<T> | T): Promise<T> {
  getDb();
  if (isPostgres && pgPool) {
    if (pgInitPromise) await pgInitPromise;
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const res = await fn();
      await client.query('COMMIT');
      return res;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } else if (sqliteDb) {
    let resolveRef!: (val: T) => void;
    let rejectRef!: (err: any) => void;
    const returnPromise = new Promise<T>((resolve, reject) => {
      resolveRef = resolve;
      rejectRef = reject;
    });

    sqliteTxQueue = sqliteTxQueue.then(async () => {
      const alreadyInTransaction = sqliteDb!.inTransaction;
      if (alreadyInTransaction) {
        try {
          const res = await fn();
          resolveRef(res);
        } catch (e) {
          rejectRef(e);
        }
        return;
      }
      try {
        sqliteDb!.prepare('BEGIN').run();
        const res = await fn();
        sqliteDb!.prepare('COMMIT').run();
        resolveRef(res);
      } catch (e) {
        try {
          sqliteDb!.prepare('ROLLBACK').run();
        } catch (_) {}
        rejectRef(e);
      }
    }).catch(() => {
      // Allow chain to continue safely
    });

    return returnPromise;
  }
  throw new Error('Database not initialized');
}

function initSqliteSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'parent',
      email_verified INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS parent_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT,
      phone_number TEXT,
      whatsapp_number TEXT,
      email TEXT,
      home_address TEXT,
      preferred_contact TEXT,
      is_koinonia_worker INTEGER DEFAULT 0,
      department TEXT,
      photo_file_id TEXT,
      profile_completed_at TEXT,
      country TEXT,
      state_region TEXT,
      city TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      section_name TEXT,
      theme TEXT,
      scripture TEXT,
      starts_at TEXT,
      ends_at TEXT,
      daily_start_time TEXT,
      daily_end_time TEXT,
      location TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS children (
      id TEXT PRIMARY KEY,
      parent_profile_id TEXT NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      gender TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      calculated_age INTEGER,
      age_group TEXT,
      relationship_to_child TEXT,
      photo_file_id TEXT,
      needs_age_review INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS child_event_entries (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'incomplete',
      school_class TEXT,
      school_name TEXT,
      previous_children_programme TEXT,
      note_to_team TEXT,
      has_medical_notes INTEGER DEFAULT 0,
      medical_notes TEXT,
      needs_extra_support INTEGER DEFAULT 0,
      support_notes TEXT,
      information_confirmed INTEGER DEFAULT 0,
      details_confirmed INTEGER DEFAULT 0,
      submitted_at TEXT,
      reviewed_at TEXT,
      decision_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(child_id, event_id)
    );

    CREATE TABLE IF NOT EXISTS pickup_people (
      id TEXT PRIMARY KEY,
      child_event_entry_id TEXT REFERENCES child_event_entries(id) ON DELETE CASCADE,
      pickup_type TEXT NOT NULL,
      full_name TEXT,
      relationship_to_child TEXT,
      phone_number TEXT,
      whatsapp_number TEXT,
      photo_file_id TEXT,
      approved_by_parent INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_passes (
      id TEXT PRIMARY KEY,
      child_event_entry_id TEXT UNIQUE NOT NULL REFERENCES child_event_entries(id) ON DELETE CASCADE,
      pass_reference TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      issued_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_files (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      provider TEXT DEFAULT 'cloudinary',
      file_type TEXT,
      public_id TEXT,
      secure_url TEXT,
      resource_type TEXT,
      mime_type TEXT,
      file_size INTEGER,
      width INTEGER,
      height INTEGER,
      duration REAL,
      folder TEXT,
      file_url TEXT NOT NULL,
      storage_key TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      token_type TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_parent_profiles_user_id ON parent_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_children_parent_id ON children(parent_profile_id);
    CREATE INDEX IF NOT EXISTS idx_children_full_name_nocase ON children(full_name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_parent_profiles_full_name_nocase ON parent_profiles(full_name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_parent_profiles_phone ON parent_profiles(phone_number);
    CREATE INDEX IF NOT EXISTS idx_entries_child_id ON child_event_entries(child_id);
    CREATE INDEX IF NOT EXISTS idx_entries_event_id ON child_event_entries(event_id);
    CREATE INDEX IF NOT EXISTS idx_entries_event_child ON child_event_entries(event_id, child_id);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);

    CREATE TABLE IF NOT EXISTS event_notification_rules (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      trigger_offset_minutes INTEGER NOT NULL DEFAULT 0,
      channel TEXT NOT NULL,
      audience TEXT NOT NULL,
      title TEXT NOT NULL,
      message_template TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_jobs (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      rule_id TEXT REFERENCES event_notification_rules(id) ON DELETE CASCADE,
      parent_id TEXT NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
      child_id TEXT REFERENCES children(id) ON DELETE SET NULL,
      channel TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(rule_id, parent_id, child_id, scheduled_for)
    );

    CREATE TABLE IF NOT EXISTS parent_notifications (
      id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
      event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
      child_id TEXT REFERENCES children(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT,
      audience_role TEXT,
      audience_scope TEXT,
      event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
      child_id TEXT REFERENCES children(id) ON DELETE SET NULL,
      parent_id TEXT REFERENCES parent_profiles(id) ON DELETE SET NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      visible_to_event_team INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      priority TEXT,
      channel TEXT,
      metadata_json TEXT
    );

    CREATE TABLE IF NOT EXISTS notification_reads (
      id TEXT PRIMARY KEY,
      notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_archives (
      id TEXT PRIMARY KEY,
      notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      archived_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      role TEXT,
      sound_enabled INTEGER DEFAULT 1,
      push_enabled INTEGER DEFAULT 0,
      email_enabled INTEGER DEFAULT 1,
      urgent_sound_profile TEXT DEFAULT 'emergency',
      urgent_volume_boost TEXT DEFAULT 'standard',
      repeat_urgent_alerts INTEGER DEFAULT 1,
      spoken_alerts_enabled INTEGER DEFAULT 0,
      spoken_alert_mode TEXT DEFAULT 'private',
      spoken_alert_repeats INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status_sched ON notification_jobs(status, scheduled_for);
    CREATE INDEX IF NOT EXISTS idx_jobs_parent ON notification_jobs(parent_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_event ON notification_jobs(event_id);
    CREATE INDEX IF NOT EXISTS idx_parent_notif_unread ON parent_notifications(parent_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_rules_event_active ON event_notification_rules(event_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(audience_role);
    CREATE INDEX IF NOT EXISTS idx_notifications_parent ON notifications(parent_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_event ON notifications(event_id);
    CREATE INDEX IF NOT EXISTS idx_notification_reads_unread ON notification_reads(user_id, notification_id);

    CREATE TABLE IF NOT EXISTS volunteer_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      photo_file_id TEXT,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      is_koinonia_worker INTEGER DEFAULT 0,
      department TEXT,
      preferred_team TEXT NOT NULL,
      serving_experience INTEGER DEFAULT 0,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending_review',
      approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      approved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_volunteer_user_id ON volunteer_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_volunteer_status ON volunteer_profiles(status);
    CREATE INDEX IF NOT EXISTS idx_volunteer_pref_team ON volunteer_profiles(preferred_team);

    CREATE TABLE IF NOT EXISTS volunteer_event_reports (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      volunteer_profile_id TEXT NOT NULL REFERENCES volunteer_profiles(id) ON DELETE CASCADE,
      report_notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_report_notes (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      report_type TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(event_id, report_type)
    );

    CREATE TABLE IF NOT EXISTS admin_message_drafts (
      id TEXT PRIMARY KEY,
      recipient_group TEXT NOT NULL,
      message_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_message_logs (
      id TEXT PRIMARY KEY,
      recipient_group TEXT NOT NULL,
      message_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      recipients_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_message_settings (
      id TEXT PRIMARY KEY,
      sender_name TEXT,
      reply_to_email TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_general_settings (
      id TEXT PRIMARY KEY,
      parent_registration_enabled INTEGER DEFAULT 1,
      parent_login_enabled INTEGER DEFAULT 1,
      required_child_photo INTEGER DEFAULT 1,
      required_parent_photo INTEGER DEFAULT 1,
      required_medical_notes INTEGER DEFAULT 0,
      required_pickup_person INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_footer_settings (
      id TEXT PRIMARY KEY,
      copyright_year INTEGER DEFAULT 2025,
      copyright_text TEXT DEFAULT 'Koinonia Children and Teens. All rights reserved.',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_parent_notes (
      id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
      admin_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      admin_name TEXT,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_landing_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT,
      value_type TEXT NOT NULL DEFAULT 'text',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_age_groups (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      min_age INTEGER NOT NULL,
      max_age INTEGER NOT NULL,
      capacity INTEGER NOT NULL,
      manual_review INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_media_settings (
      id TEXT PRIMARY KEY,
      slot TEXT UNIQUE NOT NULL,
      url TEXT NOT NULL,
      thumbnail_url TEXT,
      width INTEGER,
      height INTEGER,
      mime_type TEXT,
      size INTEGER,
      uploaded_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS child_attention_items (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal',
      source TEXT,
      created_by TEXT,
      assigned_role TEXT,
      resolved_by TEXT,
      resolved_at TEXT,
      resolution_note TEXT,
      escalated_to_admin INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(child_id, event_id, type)
    );

    CREATE TABLE IF NOT EXISTS event_safety_alerts (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      child_id TEXT REFERENCES children(id) ON DELETE SET NULL,
      child_event_entry_id TEXT REFERENCES child_event_entries(id) ON DELETE SET NULL,
      pass_id TEXT REFERENCES event_passes(id) ON DELETE SET NULL,
      raised_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      raised_by_role TEXT NOT NULL,
      severity TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      location_label TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      acknowledged_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      acknowledged_at TEXT,
      resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TEXT,
      resolution_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      owner_assigned_at TEXT,
      in_progress_at TEXT,
      reopened_at TEXT,
      reopened_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      reopen_note TEXT,
      response_version INTEGER DEFAULT 1,
      structured_details TEXT,
      category_version INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS safety_alert_recipients (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
      recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_role TEXT NOT NULL,
      recipient_group TEXT,
      delivered_in_app_at TEXT,
      push_sent_at TEXT,
      push_status TEXT,
      read_at TEXT,
      sound_started_at TEXT,
      sound_stopped_at TEXT,
      acknowledged_visibility_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(alert_id, recipient_user_id)
    );

    CREATE TABLE IF NOT EXISTS user_duty_status (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      active INTEGER DEFAULT 1,
      approved INTEGER DEFAULT 1,
      on_duty INTEGER DEFAULT 1,
      alert_enabled INTEGER DEFAULT 1,
      assigned_event_id TEXT,
      assigned_team TEXT,
      shift_start TEXT,
      shift_end TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_duty_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      event_id TEXT NOT NULL,
      device_label TEXT NOT NULL,
      app_generated_device_id TEXT UNIQUE NOT NULL,
      push_subscription_id TEXT,
      sound_enabled INTEGER DEFAULT 1,
      voice_enabled INTEGER DEFAULT 1,
      vibration_enabled INTEGER DEFAULT 1,
      live_connection_status TEXT DEFAULT 'disconnected',
      readiness_status TEXT DEFAULT 'unknown',
      readiness_checked_at TEXT,
      duty_started_at TEXT,
      duty_ended_at TEXT,
      last_seen_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_readiness_logs (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      device_id TEXT NOT NULL,
      readiness_status TEXT NOT NULL,
      critical_passed INTEGER NOT NULL,
      sound_ready INTEGER NOT NULL,
      push_ready INTEGER NOT NULL,
      voice_ready INTEGER NOT NULL,
      vibration_supported INTEGER NOT NULL,
      live_connection_state TEXT NOT NULL,
      event_sync_age INTEGER,
      check_timestamp TEXT NOT NULL,
      duty_started_at TEXT,
      duty_ended_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_passkeys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      credential_id TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER DEFAULT 0,
      device_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_duty_assignments (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      responsibility_key TEXT NOT NULL,
      team_key TEXT,
      assignment_level TEXT DEFAULT 'primary',
      status TEXT DEFAULT 'scheduled',
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      temporarily_unavailable_at TEXT,
      expected_return_at TEXT,
      note TEXT,
      assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_routing_rules (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      category_key TEXT NOT NULL,
      severity_key TEXT NOT NULL,
      location_scope TEXT,
      team_scope TEXT,
      requires_acknowledgement INTEGER DEFAULT 1,
      escalation_delay_seconds INTEGER DEFAULT 30,
      is_active INTEGER DEFAULT 1,
      effective_from TEXT,
      effective_until TEXT,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_routing_recipients (
      id TEXT PRIMARY KEY,
      routing_rule_id TEXT NOT NULL REFERENCES alert_routing_rules(id) ON DELETE CASCADE,
      recipient_type TEXT NOT NULL,
      responsibility_key TEXT,
      team_key TEXT,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      delivery_tier TEXT NOT NULL DEFAULT 'primary',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_recipient_snapshots (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assignment_id TEXT,
      routing_rule_id TEXT,
      tier TEXT NOT NULL DEFAULT 'primary',
      eligibility_status TEXT NOT NULL,
      exclusion_reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_device_deliveries (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
      recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      duty_device_id TEXT NOT NULL REFERENCES event_duty_devices(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      delivery_status TEXT DEFAULT 'pending',
      attempted_at TEXT,
      delivered_at TEXT,
      acknowledged_at TEXT,
      failure_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_routing_change_history (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_response_history (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_response_assignments (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      participant_role TEXT NOT NULL,
      assignment_status TEXT NOT NULL,
      assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      assignment_reason TEXT,
      assigned_at TEXT NOT NULL,
      accepted_at TEXT,
      ended_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(alert_id, user_id, participant_role)
    );

    CREATE TABLE IF NOT EXISTS alert_response_updates (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
      author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      update_type TEXT NOT NULL,
      note TEXT,
      visibility TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_handover_requests (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
      from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      note TEXT,
      idempotency_key TEXT UNIQUE,
      requested_at TEXT NOT NULL,
      responded_at TEXT,
      responded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Run safe column migrations for existing SQLite databases
  const sqliteCols = [
    "provider TEXT DEFAULT 'cloudinary'",
    "public_id TEXT",
    "secure_url TEXT",
    "resource_type TEXT",
    "width INTEGER",
    "height INTEGER",
    "duration REAL",
    "folder TEXT"
  ];
  for (const col of sqliteCols) {
    try {
      db.exec(`ALTER TABLE media_files ADD COLUMN ${col};`);
    } catch (e) {
      // Column likely already exists
    }
  }

  const sqliteEventCols = [
    "event_start_at TEXT",
    "event_end_at TEXT",
    "check_in_opens_at TEXT",
    "check_in_closes_at TEXT",
    "pickup_starts_at TEXT",
    "pickup_reminder_at TEXT",
    "timezone TEXT DEFAULT 'Africa/Lagos'",
    "parent_access_opens_at TEXT",
    "parent_access_closes_at TEXT",
    "parents_can_create_account INTEGER DEFAULT 1",
    "allow_multiple_children INTEGER DEFAULT 1",
    "allow_save_and_continue INTEGER DEFAULT 1",
    "allow_edit_after_submission INTEGER DEFAULT 0",
    "created_by TEXT",
    "updated_by TEXT",
    "archived_at TEXT",
    "description TEXT"
  ];
  for (const col of sqliteEventCols) {
    try {
      db.exec(`ALTER TABLE events ADD COLUMN ${col};`);
    } catch (e) {
      // Column likely already exists
    }
  }

  try {
    db.exec(`ALTER TABLE parent_profiles ADD COLUMN country TEXT;`);
  } catch (e) {
    // Column likely already exists
  }

  try {
    db.exec(`ALTER TABLE parent_profiles ADD COLUMN state_region TEXT;`);
  } catch (e) {
    // Column likely already exists
  }

  try {
    db.exec(`ALTER TABLE parent_profiles ADD COLUMN city TEXT;`);
  } catch (e) {
    // Column likely already exists
  }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;`);
  } catch (e) {
    // Column likely already exists
  }

  try {
    db.exec(`ALTER TABLE auth_tokens ADD COLUMN used_at TEXT;`);
  } catch (e) {
    // Column likely already exists
  }

  try {
    db.exec(`ALTER TABLE child_event_entries ADD COLUMN withdrawn_at TEXT;`);
  } catch (e) {
    // Column likely already exists
  }

  try {
    db.exec(`ALTER TABLE child_event_entries ADD COLUMN checked_in_at TEXT;`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE child_event_entries ADD COLUMN checked_in_by TEXT;`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE child_event_entries ADD COLUMN picked_up_at TEXT;`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE child_event_entries ADD COLUMN picked_up_by TEXT;`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE child_event_entries ADD COLUMN pickup_person_id TEXT;`);
  } catch (e) {}

  // Soft delete columns for parent_profiles in SQLite
  const sqliteParentSoftDeleteCols = [
    "is_deleted INTEGER DEFAULT 0",
    "deleted_at TEXT",
    "deleted_by TEXT",
    "delete_reason TEXT",
    "restored_at TEXT",
    "restored_by TEXT",
    "permanently_deleted_at TEXT",
    "permanently_deleted_by TEXT",
    "permanent_delete_reason TEXT",
    "anonymized_at TEXT"
  ];
  for (const col of sqliteParentSoftDeleteCols) {
    try {
      db.exec(`ALTER TABLE parent_profiles ADD COLUMN ${col};`);
    } catch (e) {}
  }

  // Soft delete columns for volunteer_profiles in SQLite
  const sqliteVolSoftDeleteCols = [
    "is_deleted INTEGER DEFAULT 0",
    "deleted_at TEXT",
    "deleted_by TEXT",
    "delete_reason TEXT",
    "restored_at TEXT",
    "restored_by TEXT",
    "permanently_deleted_at TEXT",
    "permanently_deleted_by TEXT",
    "permanent_delete_reason TEXT",
    "anonymized_at TEXT"
  ];
  for (const col of sqliteVolSoftDeleteCols) {
    try {
      db.exec(`ALTER TABLE volunteer_profiles ADD COLUMN ${col};`);
    } catch (e) {}
  }

  // Soft delete columns for children and child_event_entries in SQLite
  const sqliteChildSoftDeleteCols = [
    "is_deleted INTEGER DEFAULT 0",
    "deleted_at TEXT",
    "deleted_by TEXT",
    "delete_reason TEXT",
    "restored_at TEXT",
    "restored_by TEXT"
  ];
  for (const col of sqliteChildSoftDeleteCols) {
    try {
      db.exec(`ALTER TABLE children ADD COLUMN ${col};`);
    } catch (e) {}
    try {
      db.exec(`ALTER TABLE child_event_entries ADD COLUMN ${col};`);
    } catch (e) {}
  }

  // Migrate notification_preferences for audio settings (SQLite)
  const sqliteNotifPrefCols = [
    { name: 'urgent_sound_profile', type: 'TEXT DEFAULT \'emergency\'' },
    { name: 'urgent_volume_boost', type: 'TEXT DEFAULT \'standard\'' },
    { name: 'repeat_urgent_alerts', type: 'INTEGER DEFAULT 1' },
    { name: 'spoken_alerts_enabled', type: 'INTEGER DEFAULT 0' },
    { name: 'spoken_alert_mode', type: 'TEXT DEFAULT \'private\'' },
    { name: 'spoken_alert_repeats', type: 'INTEGER DEFAULT 1' }
  ];
  for (const col of sqliteNotifPrefCols) {
    try {
      db.exec(`ALTER TABLE notification_preferences ADD COLUMN ${col.name} ${col.type};`);
    } catch (e) {}
  }

  try {
    db.exec(`ALTER TABLE event_safety_alerts ADD COLUMN idempotency_key TEXT;`);
  } catch (e) {}
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_event_safety_alerts_idempotency ON event_safety_alerts(idempotency_key);`);
  } catch (e) {}

  const sqliteAlertNewCols = [
    "owner_user_id TEXT",
    "owner_assigned_at TEXT",
    "in_progress_at TEXT",
    "reopened_at TEXT",
    "reopened_by TEXT",
    "reopen_note TEXT",
    "response_version INTEGER DEFAULT 1",
    "structured_details TEXT",
    "category_version INTEGER DEFAULT 1"
  ];
  for (const col of sqliteAlertNewCols) {
    try {
      db.exec(`ALTER TABLE event_safety_alerts ADD COLUMN ${col};`);
    } catch (e) {}
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS alert_response_history (
        id TEXT PRIMARY KEY,
        alert_id TEXT NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        note TEXT,
        created_at TEXT NOT NULL
      );
    `);
  } catch (e) {}

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS alert_response_assignments (
        id TEXT PRIMARY KEY,
        alert_id TEXT NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        participant_role TEXT NOT NULL,
        assignment_status TEXT NOT NULL,
        assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        assignment_reason TEXT,
        assigned_at TEXT NOT NULL,
        accepted_at TEXT,
        ended_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(alert_id, user_id, participant_role)
      );
    `);
  } catch (e) {}

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS alert_response_updates (
        id TEXT PRIMARY KEY,
        alert_id TEXT NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        update_type TEXT NOT NULL,
        note TEXT,
        visibility TEXT NOT NULL,
        idempotency_key TEXT UNIQUE,
        created_at TEXT NOT NULL
      );
    `);
  } catch (e) {}

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS alert_handover_requests (
        id TEXT PRIMARY KEY,
        alert_id TEXT NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        reason TEXT NOT NULL,
        note TEXT,
        idempotency_key TEXT UNIQUE,
        requested_at TEXT NOT NULL,
        responded_at TEXT,
        responded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attendance_records (
        id TEXT PRIMARY KEY,
        child_event_entry_id TEXT NOT NULL REFERENCES child_event_entries(id) ON DELETE CASCADE,
        action_type TEXT NOT NULL,
        action_time TEXT NOT NULL,
        staff_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        verified_pickup_person_id TEXT REFERENCES pickup_people(id) ON DELETE SET NULL,
        gate_location TEXT,
        sync_source TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS offline_sync_records (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        staff_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_identifier TEXT NOT NULL,
        sync_type TEXT NOT NULL,
        record_count INTEGER NOT NULL,
        payload_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        error_summary TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attendance_entry_id ON attendance_records(child_event_entry_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_action_type ON attendance_records(action_type);
      CREATE INDEX IF NOT EXISTS idx_attendance_action_time ON attendance_records(action_time);
      CREATE INDEX IF NOT EXISTS idx_offline_sync_event ON offline_sync_records(event_id);
      CREATE INDEX IF NOT EXISTS idx_offline_sync_status ON offline_sync_records(status);
    `);
  } catch (e) {}

  // Phase 6 Event Locations (SQLite)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS event_locations (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        parent_location_id TEXT REFERENCES event_locations(id) ON DELETE SET NULL,
        location_type TEXT NOT NULL,
        name TEXT NOT NULL,
        short_name TEXT,
        description TEXT,
        instructions TEXT,
        capacity INTEGER,
        age_group_key TEXT,
        team_key TEXT,
        emergency_label TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        archived_at TEXT,
        archived_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  } catch (e) {}

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS event_location_codes (
        id TEXT PRIMARY KEY,
        event_location_id TEXT NOT NULL REFERENCES event_locations(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        token_version INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        generated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        generated_at TEXT NOT NULL,
        rotated_at TEXT,
        disabled_at TEXT,
        expires_at TEXT
      );
    `);
  } catch (e) {}

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS event_duty_location_presence (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        duty_device_id TEXT REFERENCES event_duty_devices(id) ON DELETE SET NULL,
        event_location_id TEXT NOT NULL REFERENCES event_locations(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        updated_at TEXT NOT NULL
      );
    `);
  } catch (e) {}

  // Phase 7: Child Emergency Summary tables (SQLite)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS alert_child_context_snapshots (
        id TEXT PRIMARY KEY,
        alert_id TEXT NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        child_id TEXT REFERENCES children(id) ON DELETE SET NULL,
        context_type TEXT,
        display_name_snapshot TEXT,
        preferred_name_snapshot TEXT,
        age_group_snapshot TEXT,
        assigned_room_snapshot TEXT,
        photo_reference_snapshot TEXT,
        event_status_snapshot TEXT,
        safety_summary_snapshot TEXT,
        snapshot_version INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_alert_child_snapshots_alert ON alert_child_context_snapshots(alert_id);`);
  } catch (e) {
    console.error('Error creating alert_child_context_snapshots in SQLite:', e);
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS child_summary_access_logs (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        alert_id TEXT REFERENCES event_safety_alerts(id) ON DELETE SET NULL,
        child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        access_profile TEXT NOT NULL,
        accessed_section TEXT NOT NULL,
        access_reason TEXT,
        created_at TEXT NOT NULL
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_child_summary_access_child_time ON child_summary_access_logs(child_id, created_at);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_child_summary_access_alert_time ON child_summary_access_logs(alert_id, created_at);`);
  } catch (e) {
    console.error('Error creating child_summary_access_logs in SQLite:', e);
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS alert_child_link_history (
        id TEXT PRIMARY KEY,
        alert_id TEXT NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        previous_child_id TEXT REFERENCES children(id) ON DELETE SET NULL,
        new_child_id TEXT REFERENCES children(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        reason TEXT NOT NULL,
        changed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_alert_child_link_hist_alert_time ON alert_child_link_history(alert_id, created_at);`);
  } catch (e) {
    console.error('Error creating alert_child_link_history in SQLite:', e);
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS child_contact_attempts (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        alert_id TEXT NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        contact_type TEXT NOT NULL,
        contact_reference TEXT NOT NULL,
        outcome TEXT NOT NULL,
        safe_note TEXT,
        attempted_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        attempted_at TEXT NOT NULL
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_child_contact_attempts_alert_time ON child_contact_attempts(alert_id, attempted_at);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_child_event_entries_event_child ON child_event_entries(event_id, child_id);`);
  } catch (e) {
    console.error('Error creating child_contact_attempts in SQLite:', e);
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS incident_records (
        id TEXT PRIMARY KEY,
        alert_id TEXT UNIQUE NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        creator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'draft',
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        structured_data TEXT NOT NULL,
        parent_contact TEXT,
        first_aid TEXT,
        security TEXT,
        follow_up_actions TEXT,
        change_requests TEXT,
        closure_checklist TEXT,
        version INTEGER DEFAULT 1 NOT NULL,
        idempotency_key TEXT UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_incident_records_alert ON incident_records(alert_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_incident_records_event ON incident_records(event_id);`);
  } catch (e) {
    console.error('Error creating incident_records in SQLite:', e);
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS incident_history (
        id TEXT PRIMARY KEY,
        incident_id TEXT NOT NULL REFERENCES incident_records(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        note TEXT,
        state_snapshot TEXT,
        created_at TEXT NOT NULL
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_incident_history_incident ON incident_history(incident_id);`);
  } catch (e) {
    console.error('Error creating incident_history in SQLite:', e);
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS escalation_policies (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        policy_scope TEXT NOT NULL,
        severity TEXT,
        category_key TEXT,
        location_id TEXT REFERENCES event_locations(id) ON DELETE SET NULL,
        location_type TEXT,
        condition_key TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER DEFAULT 1,
        created_by TEXT,
        updated_by TEXT,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS escalation_policy_steps (
        id TEXT PRIMARY KEY,
        policy_id TEXT NOT NULL REFERENCES escalation_policies(id) ON DELETE CASCADE,
        step_order INTEGER NOT NULL,
        wait_seconds INTEGER NOT NULL,
        target_type TEXT NOT NULL,
        target_user_id TEXT,
        target_responsibility_key TEXT,
        target_team_key TEXT,
        target_supervisory_level TEXT,
        channels TEXT NOT NULL,
        repeat_effect TEXT,
        maximum_attempts INTEGER DEFAULT 1,
        cooldown_seconds INTEGER DEFAULT 60,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS escalation_cycles (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        subject_type TEXT NOT NULL,
        alert_id TEXT REFERENCES event_safety_alerts(id) ON DELETE SET NULL,
        incident_id TEXT REFERENCES incident_records(id) ON DELETE SET NULL,
        follow_up_id TEXT,
        policy_id TEXT REFERENCES escalation_policies(id) ON DELETE SET NULL,
        condition_key TEXT NOT NULL,
        cycle_number INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'scheduled',
        current_step_order INTEGER NOT NULL DEFAULT 0,
        next_due_at TEXT,
        started_at TEXT NOT NULL,
        stopped_at TEXT,
        stop_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS escalation_executions (
        id TEXT PRIMARY KEY,
        cycle_id TEXT NOT NULL REFERENCES escalation_cycles(id) ON DELETE CASCADE,
        policy_step_id TEXT REFERENCES escalation_policy_steps(id) ON DELETE SET NULL,
        execution_key TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled',
        scheduled_for TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        attempt_count INTEGER DEFAULT 0,
        retry_at TEXT,
        failure_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS escalation_deliveries (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL REFERENCES escalation_executions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        duty_device_id TEXT,
        channel TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempted_at TEXT,
        delivered_at TEXT,
        failure_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS escalation_history (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        cycle_id TEXT REFERENCES escalation_cycles(id) ON DELETE SET NULL,
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        action_type TEXT NOT NULL,
        safe_summary TEXT NOT NULL,
        protected_metadata TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scheduler_leases (
        id TEXT PRIMARY KEY,
        leased_by TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_escalation_policies_event ON escalation_policies(event_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_escalation_cycles_due ON escalation_cycles(status, next_due_at);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_escalation_executions_due ON escalation_executions(status, scheduled_for);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_escalation_history_cycle ON escalation_history(cycle_id);`);
  } catch (e) {
    console.error('Error creating escalation tables in SQLite:', e);
  }

  // Safe column additions for Phase 6 in SQLite
  const sqlitePhase6Cols = [
    { table: 'event_duty_assignments', col: 'assigned_location_id TEXT' },
    { table: 'event_safety_alerts', col: 'location_id TEXT' },
    { table: 'event_safety_alerts', col: 'location_path_snapshot TEXT' },
    { table: 'event_safety_alerts', col: 'location_detail TEXT' },
    { table: 'event_safety_alerts', col: 'location_source TEXT' },
    { table: 'event_safety_alerts', col: 'original_location_id TEXT' },
    { table: 'alert_routing_rules', col: 'location_id TEXT' },
    { table: 'alert_routing_rules', col: 'location_type_scope TEXT' },
    { table: 'alert_routing_rules', col: 'include_sub_locations INTEGER DEFAULT 0' }
  ];
  for (const item of sqlitePhase6Cols) {
    try {
      db.exec(`ALTER TABLE ${item.table} ADD COLUMN ${item.col};`);
    } catch (e) {}
  }

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_event_locations_event_active ON event_locations(event_id, is_active);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_event_locations_parent ON event_locations(parent_location_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_event_duty_location_presence_user ON event_duty_location_presence(user_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_event_duty_location_presence_loc ON event_duty_location_presence(event_location_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_event_location_codes_hash ON event_location_codes(token_hash);`);
  } catch (e) {}

  // Seed real approved event
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO events (
      id, title, section_name, theme, scripture, starts_at, ends_at,
      daily_start_time, daily_end_time, location, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    REAL_EVENT_ID,
    'The General Assembly',
    'Children and Teens',
    'More Than Conquerors',
    'Romans 8:37',
    '2026-11-18',
    '2026-11-22',
    '9:00 AM',
    '7:00 PM',
    'Koinonia Global Auditorium & Children Pavilion, Abuja',
    'current',
    now,
    now
  );

  // Safely migrate existing databases for consistency
  db.prepare("UPDATE events SET title = 'The General Assembly', section_name = 'Children and Teens' WHERE id = ? AND title = 'Children and Teens'").run(REAL_EVENT_ID);
  db.prepare("UPDATE events SET status = 'current' WHERE id = ? AND status IN ('open', 'active')").run(REAL_EVENT_ID);

  db.prepare(`
    INSERT OR IGNORE INTO admin_general_settings (
      id, parent_registration_enabled, parent_login_enabled, required_child_photo, required_parent_photo,
      required_medical_notes, required_pickup_person, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'primary_general_settings',
    1,
    1,
    1,
    1,
    0,
    1,
    now,
    now
  );

  db.prepare(`
    INSERT OR IGNORE INTO admin_footer_settings (
      id, copyright_year, copyright_text, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    'primary_footer_settings',
    2025,
    'Koinonia Children and Teens. All rights reserved.',
    now,
    now
  );

  // Run SQLite migration/alters to add status to users if it doesn't exist
  try {
    db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';");
  } catch (_) {}

  // Check if users table is empty and auto-seed development data
  const userCountResult = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCountResult && userCountResult.count === 0) {
    console.log('[SQLite Seeder] Database is empty. Seeding development accounts...');
    
    const hash = (p: string) => {
      const s = crypto.randomBytes(16).toString('hex');
      const d = crypto.scryptSync(p, s, 64).toString('hex');
      return `${s}:${d}`;
    };
    const hashedPassword = hash('Password123!');

    // 1. Admin Account
    const adminUserId = 'admin-user-id-2026';
    const adminProfileId = 'admin-profile-id-2026';
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(adminUserId, 'admin@koinonia.org', hashedPassword, 'super_admin', now, now);

    db.prepare(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, whatsapp_number, home_address, preferred_contact, is_koinonia_worker, country, state_region, city, photo_file_id, profile_completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
    `).run(adminProfileId, adminUserId, 'Super Admin', 'admin@koinonia.org', '+2348031234567', '+2348031234567', 'Koinonia Global Headquarters, Abuja', 'WhatsApp', 'Nigeria', 'FCT', 'Abuja', 'photo-parent-default', now, now, now);

    db.prepare(`
      INSERT INTO user_duty_status (id, user_id, active, approved, on_duty, alert_enabled, assigned_event_id, assigned_team, created_at, updated_at)
      VALUES (?, ?, 1, 1, 1, 1, ?, 'Admins', ?, ?)
    `).run('duty-admin-2026', adminUserId, REAL_EVENT_ID, now, now);

    // Seed 9 additional admins to make it 10 admins total
    for (let i = 1; i <= 9; i++) {
      const extraAdminUserId = `admin-user-id-2026-${i}`;
      const extraAdminProfileId = `admin-profile-id-2026-${i}`;
      const email = `admin${i}@koinonia.org`;
      
      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 'admin', 1, ?, ?)
      `).run(extraAdminUserId, email, hashedPassword, now, now);

      db.prepare(`
        INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, whatsapp_number, home_address, preferred_contact, is_koinonia_worker, country, state_region, city, photo_file_id, profile_completed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        extraAdminProfileId, 
        extraAdminUserId, 
        `Admin Specialist ${i}`, 
        email, 
        `+234803123456${i}`, 
        `+234803123456${i}`, 
        'Koinonia Headquarters', 
        'WhatsApp', 
        'Nigeria', 
        'FCT', 
        'Abuja', 
        'photo-parent-default', 
        now, 
        now, 
        now
      );

      db.prepare(`
        INSERT INTO user_duty_status (id, user_id, active, approved, on_duty, alert_enabled, assigned_event_id, assigned_team, created_at, updated_at)
        VALUES (?, ?, 1, 1, 1, 1, ?, 'Admins', ?, ?)
      `).run(`duty-admin-${i}`, extraAdminUserId, REAL_EVENT_ID, now, now);
    }

    // 2. Parent Account
    const parentUserId = 'parent-user-id-2026';
    const parentProfileId = 'parent-profile-id-2026';
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(parentUserId, 'parent@koinonia.org', hashedPassword, 'parent', now, now);

    db.prepare(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, whatsapp_number, home_address, preferred_contact, is_koinonia_worker, country, state_region, city, photo_file_id, profile_completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      parentProfileId, 
      parentUserId, 
      'Adebayo Omikunle', 
      'parent@koinonia.org', 
      '+2348099990001', 
      '+2348099990001', 
      '12 Mandate Street, Garki', 
      'WhatsApp', 
      'Nigeria', 
      'FCT', 
      'Abuja', 
      'photo-parent-default', 
      now, 
      now, 
      now
    );

    // 3. Children Profiles
    const child1Id = 'child-1-id-2026';
    const child2Id = 'child-2-id-2026';
    db.prepare(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, photo_file_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(child1Id, parentProfileId, 'Grace Omikunle', 'Female', '2018-06-15', 7, 'Ages 7 to 9', 'Parent', 'photo-child-1', now, now);

    db.prepare(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, photo_file_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(child2Id, parentProfileId, 'Samuel Omikunle', 'Male', '2021-04-10', 4, 'Ages 4 to 6', 'Parent', 'photo-child-2', now, now);

    // 4. Child Event Entries
    const entry1Id = 'entry-1-id-2026';
    const entry2Id = 'entry-2-id-2026';
    db.prepare(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, school_class, school_name, previous_children_programme, note_to_team, has_medical_notes, medical_notes, needs_extra_support, support_notes, information_confirmed, details_confirmed, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 1, 1, ?, ?, ?)
    `).run(entry1Id, child1Id, REAL_EVENT_ID, 'under_review', 'Primary 2', 'Lighthouse Academy', 'No', 'Grace is excited to learn!', '', '', now, now, now);

    db.prepare(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, school_class, school_name, previous_children_programme, note_to_team, has_medical_notes, medical_notes, needs_extra_support, support_notes, information_confirmed, details_confirmed, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 1, 1, ?, ?, ?)
    `).run(entry2Id, child2Id, REAL_EVENT_ID, 'pass_ready', 'Nursery 2', 'Lighthouse Academy', 'No', 'Samuel can be shy at first.', '', '', now, now, now);

    // 5. Event Passes (for child 2 since they are pass_ready)
    db.prepare(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('pass-2-id-2026', entry2Id, 'K-2026-OMIKUNLE-SAMUEL', 'mock-pass-hash-2026', 'active', now, now, now);

    // 6. Pickup People
    db.prepare(`
      INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, whatsapp_number, photo_file_id, approved_by_parent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run('pickup-1-id-2026', entry1Id, 'designated_pickup', 'Olusola Omikunle', 'Uncle', '+2348039998888', '+2348039998888', 'photo-pickup-1', now, now);

    db.prepare(`
      INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, whatsapp_number, photo_file_id, approved_by_parent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run('pickup-2-id-2026', entry2Id, 'designated_pickup', 'Olusola Omikunle', 'Uncle', '+2348039998888', '+2348039998888', 'photo-pickup-1', now, now);

    // 7. Volunteer Account
    const volunteerUserId = 'volunteer-user-id-2026';
    const volunteerProfileId = 'volunteer-profile-id-2026';
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(volunteerUserId, 'volunteer@koinonia.org', hashedPassword, 'volunteer', now, now);

    db.prepare(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, serving_experience, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(volunteerProfileId, volunteerUserId, 'Sarah Volunteer', '+2348011112222', '+2348011112222', 'Ages 7-9 Team', 2, 'active', now, now);

    console.log('[SQLite Seeder] Successfully seeded all development accounts.');
  }
}

async function initPostgresSchema(pool: any) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        role VARCHAR(64) NOT NULL DEFAULT 'parent',
        email_verified INTEGER DEFAULT 0,
        status VARCHAR(64) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS parent_profiles (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        full_name VARCHAR(255),
        phone_number VARCHAR(128),
        whatsapp_number VARCHAR(128),
        email VARCHAR(255),
        home_address TEXT,
        preferred_contact VARCHAR(64),
        is_koinonia_worker INTEGER DEFAULT 0,
        department VARCHAR(255),
        photo_file_id VARCHAR(64),
        profile_completed_at TIMESTAMP,
        country VARCHAR(255),
        state_region VARCHAR(255),
        city VARCHAR(255),
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        section_name VARCHAR(255),
        theme VARCHAR(255),
        scripture VARCHAR(255),
        starts_at VARCHAR(64),
        ends_at VARCHAR(64),
        daily_start_time VARCHAR(64),
        daily_end_time VARCHAR(64),
        location TEXT,
        status VARCHAR(64) DEFAULT 'open',
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS children (
        id VARCHAR(64) PRIMARY KEY,
        parent_profile_id VARCHAR(64) NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
        full_name VARCHAR(255) NOT NULL,
        gender VARCHAR(64) NOT NULL,
        date_of_birth VARCHAR(64) NOT NULL,
        calculated_age INTEGER,
        age_group VARCHAR(128),
        relationship_to_child VARCHAR(128),
        photo_file_id VARCHAR(255),
        needs_age_review INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS child_event_entries (
        id VARCHAR(64) PRIMARY KEY,
        child_id VARCHAR(64) NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        status VARCHAR(64) DEFAULT 'incomplete',
        school_class VARCHAR(128),
        school_name VARCHAR(255),
        previous_children_programme VARCHAR(255),
        note_to_team TEXT,
        has_medical_notes INTEGER DEFAULT 0,
        medical_notes TEXT,
        needs_extra_support INTEGER DEFAULT 0,
        support_notes TEXT,
        information_confirmed INTEGER DEFAULT 0,
        details_confirmed INTEGER DEFAULT 0,
        submitted_at TIMESTAMP,
        reviewed_at TIMESTAMP,
        decision_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        UNIQUE(child_id, event_id)
      );

      CREATE TABLE IF NOT EXISTS pickup_people (
        id VARCHAR(64) PRIMARY KEY,
        child_event_entry_id VARCHAR(64) REFERENCES child_event_entries(id) ON DELETE CASCADE,
        pickup_type VARCHAR(64) NOT NULL,
        full_name VARCHAR(255),
        relationship_to_child VARCHAR(128),
        phone_number VARCHAR(128),
        whatsapp_number VARCHAR(128),
        photo_file_id VARCHAR(255),
        approved_by_parent INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS event_passes (
        id VARCHAR(64) PRIMARY KEY,
        child_event_entry_id VARCHAR(64) UNIQUE NOT NULL REFERENCES child_event_entries(id) ON DELETE CASCADE,
        pass_reference VARCHAR(128) UNIQUE NOT NULL,
        pass_hash VARCHAR(255) NOT NULL,
        status VARCHAR(64) DEFAULT 'active',
        issued_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS media_files (
        id VARCHAR(64) PRIMARY KEY,
        owner_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        provider VARCHAR(64) DEFAULT 'cloudinary',
        file_type VARCHAR(64),
        public_id VARCHAR(255),
        secure_url TEXT,
        resource_type VARCHAR(64),
        mime_type VARCHAR(128),
        file_size INTEGER,
        width INTEGER,
        height INTEGER,
        duration DOUBLE PRECISION,
        folder VARCHAR(255),
        file_url TEXT NOT NULL,
        storage_key VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_tokens (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL UNIQUE,
        token_type VARCHAR(64) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_parent_profiles_user_id ON parent_profiles(user_id);
      CREATE INDEX IF NOT EXISTS idx_children_parent_id ON children(parent_profile_id);
      CREATE INDEX IF NOT EXISTS idx_children_full_name_lower ON children(lower(full_name));
      CREATE INDEX IF NOT EXISTS idx_parent_profiles_full_name_lower ON parent_profiles(lower(full_name));
      CREATE INDEX IF NOT EXISTS idx_parent_profiles_phone ON parent_profiles(phone_number);
      CREATE INDEX IF NOT EXISTS idx_entries_child_id ON child_event_entries(child_id);
      CREATE INDEX IF NOT EXISTS idx_entries_event_id ON child_event_entries(event_id);
      CREATE INDEX IF NOT EXISTS idx_entries_event_child ON child_event_entries(event_id, child_id);
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);

      CREATE TABLE IF NOT EXISTS event_notification_rules (
        id VARCHAR(64) PRIMARY KEY,
        event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        trigger_type VARCHAR(64) NOT NULL,
        trigger_offset_minutes INTEGER NOT NULL DEFAULT 0,
        channel VARCHAR(64) NOT NULL,
        audience VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message_template TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notification_jobs (
        id VARCHAR(64) PRIMARY KEY,
        event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        rule_id VARCHAR(64) REFERENCES event_notification_rules(id) ON DELETE CASCADE,
        parent_id VARCHAR(64) NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
        child_id VARCHAR(64) REFERENCES children(id) ON DELETE SET NULL,
        channel VARCHAR(64) NOT NULL,
        scheduled_for VARCHAR(64) NOT NULL,
        status VARCHAR(64) NOT NULL DEFAULT 'pending',
        sent_at TIMESTAMP,
        failure_reason TEXT,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        UNIQUE(rule_id, parent_id, child_id, scheduled_for)
      );

      CREATE TABLE IF NOT EXISTS parent_notifications (
        id VARCHAR(64) PRIMARY KEY,
        parent_id VARCHAR(64) NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
        event_id VARCHAR(64) REFERENCES events(id) ON DELETE CASCADE,
        child_id VARCHAR(64) REFERENCES children(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        read_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(64),
        audience_role VARCHAR(64),
        audience_scope VARCHAR(128),
        event_id VARCHAR(64) REFERENCES events(id) ON DELETE SET NULL,
        child_id VARCHAR(64) REFERENCES children(id) ON DELETE SET NULL,
        parent_id VARCHAR(64) REFERENCES parent_profiles(id) ON DELETE SET NULL,
        created_by_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        visible_to_event_team INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL,
        expires_at TIMESTAMP,
        priority VARCHAR(64),
        channel VARCHAR(64),
        metadata_json TEXT
      );

      CREATE TABLE IF NOT EXISTS notification_reads (
        id VARCHAR(64) PRIMARY KEY,
        notification_id VARCHAR(64) NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        read_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notification_archives (
        id VARCHAR(64) PRIMARY KEY,
        notification_id VARCHAR(64) NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        archived_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(64),
        sound_enabled INTEGER DEFAULT 1,
        push_enabled INTEGER DEFAULT 0,
        email_enabled INTEGER DEFAULT 1,
        urgent_sound_profile VARCHAR(64) DEFAULT 'emergency',
        urgent_volume_boost VARCHAR(64) DEFAULT 'standard',
        repeat_urgent_alerts INTEGER DEFAULT 1,
        spoken_alerts_enabled INTEGER DEFAULT 0,
        spoken_alert_mode VARCHAR(64) DEFAULT 'private',
        spoken_alert_repeats INTEGER DEFAULT 1,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status_sched ON notification_jobs(status, scheduled_for);
      CREATE INDEX IF NOT EXISTS idx_jobs_parent ON notification_jobs(parent_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_event ON notification_jobs(event_id);
      CREATE INDEX IF NOT EXISTS idx_parent_notif_unread ON parent_notifications(parent_id, read_at);
      CREATE INDEX IF NOT EXISTS idx_rules_event_active ON event_notification_rules(event_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(audience_role);
      CREATE INDEX IF NOT EXISTS idx_notifications_parent ON notifications(parent_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_event ON notifications(event_id);
      CREATE INDEX IF NOT EXISTS idx_notification_reads_unread ON notification_reads(user_id, notification_id);

      CREATE TABLE IF NOT EXISTS volunteer_profiles (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        photo_file_id VARCHAR(64),
        full_name VARCHAR(255) NOT NULL,
        phone VARCHAR(128) NOT NULL,
        whatsapp VARCHAR(128) NOT NULL,
        is_koinonia_worker INTEGER DEFAULT 0,
        department VARCHAR(255),
        preferred_team VARCHAR(255) NOT NULL,
        serving_experience INTEGER DEFAULT 0,
        note TEXT,
        status VARCHAR(64) NOT NULL DEFAULT 'pending_review',
        approved_by_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        approved_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_volunteer_user_id ON volunteer_profiles(user_id);
      CREATE INDEX IF NOT EXISTS idx_volunteer_status ON volunteer_profiles(status);
      CREATE INDEX IF NOT EXISTS idx_volunteer_pref_team ON volunteer_profiles(preferred_team);

      CREATE TABLE IF NOT EXISTS volunteer_event_reports (
        id VARCHAR(64) PRIMARY KEY,
        event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        volunteer_profile_id VARCHAR(64) NOT NULL REFERENCES volunteer_profiles(id) ON DELETE CASCADE,
        report_notes TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_report_notes (
        id VARCHAR(64) PRIMARY KEY,
        event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        report_type VARCHAR(64) NOT NULL,
        notes TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        CONSTRAINT unique_event_report_type UNIQUE(event_id, report_type)
      );

      CREATE TABLE IF NOT EXISTS admin_message_drafts (
        id VARCHAR(64) PRIMARY KEY,
        recipient_group VARCHAR(64) NOT NULL,
        message_type VARCHAR(64) NOT NULL,
        channel VARCHAR(32) NOT NULL,
        subject TEXT,
        body TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_message_logs (
        id VARCHAR(64) PRIMARY KEY,
        recipient_group VARCHAR(64) NOT NULL,
        message_type VARCHAR(64) NOT NULL,
        channel VARCHAR(32) NOT NULL,
        subject TEXT,
        body TEXT NOT NULL,
        recipients_count INTEGER NOT NULL,
        status VARCHAR(32) NOT NULL,
        created_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_message_settings (
        id VARCHAR(64) PRIMARY KEY,
        sender_name VARCHAR(255),
        reply_to_email VARCHAR(255),
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_general_settings (
        id VARCHAR(64) PRIMARY KEY,
        parent_registration_enabled INTEGER DEFAULT 1,
        parent_login_enabled INTEGER DEFAULT 1,
        required_child_photo INTEGER DEFAULT 1,
        required_parent_photo INTEGER DEFAULT 1,
        required_medical_notes INTEGER DEFAULT 0,
        required_pickup_person INTEGER DEFAULT 1,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_footer_settings (
        id VARCHAR(64) PRIMARY KEY,
        copyright_year INTEGER DEFAULT 2025,
        copyright_text VARCHAR(255) DEFAULT 'Koinonia Children and Teens. All rights reserved.',
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_parent_notes (
        id VARCHAR(64) PRIMARY KEY,
        parent_id VARCHAR(64) NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
        admin_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        admin_name VARCHAR(255),
        note TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_landing_settings (
        setting_key VARCHAR(255) PRIMARY KEY,
        setting_value TEXT,
        value_type VARCHAR(64) NOT NULL DEFAULT 'text',
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS event_age_groups (
        id VARCHAR(64) PRIMARY KEY,
        event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        label VARCHAR(255) NOT NULL,
        min_age INTEGER NOT NULL,
        max_age INTEGER NOT NULL,
        capacity INTEGER NOT NULL,
        manual_review INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_media_settings (
        id VARCHAR(64) PRIMARY KEY,
        slot VARCHAR(128) UNIQUE NOT NULL,
        url TEXT NOT NULL,
        thumbnail_url TEXT,
        width INTEGER,
        height INTEGER,
        mime_type VARCHAR(128),
        size INTEGER,
        uploaded_by VARCHAR(64),
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS child_attention_items (
        id VARCHAR(255) PRIMARY KEY,
        child_id VARCHAR(64) NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        type VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(64) NOT NULL DEFAULT 'open',
        priority VARCHAR(64) NOT NULL DEFAULT 'normal',
        source VARCHAR(128),
        created_by VARCHAR(128),
        assigned_role VARCHAR(128),
        resolved_by VARCHAR(128),
        resolved_at TIMESTAMP,
        resolution_note TEXT,
        escalated_to_admin INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        UNIQUE(child_id, event_id, type)
      );

      CREATE TABLE IF NOT EXISTS event_safety_alerts (
        id VARCHAR(255) PRIMARY KEY,
        event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        child_id VARCHAR(64) REFERENCES children(id) ON DELETE SET NULL,
        child_event_entry_id VARCHAR(64) REFERENCES child_event_entries(id) ON DELETE SET NULL,
        pass_id VARCHAR(64) REFERENCES event_passes(id) ON DELETE SET NULL,
        raised_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        raised_by_role VARCHAR(64) NOT NULL,
        severity VARCHAR(64) NOT NULL,
        category VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        location_label VARCHAR(255),
        status VARCHAR(64) NOT NULL DEFAULT 'open',
        acknowledged_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        acknowledged_at TIMESTAMP,
        resolved_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        resolved_at TIMESTAMP,
        resolution_note TEXT,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        idempotency_key VARCHAR(255) UNIQUE,
        owner_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        owner_assigned_at TIMESTAMP,
        in_progress_at TIMESTAMP,
        reopened_at TIMESTAMP,
        reopened_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        reopen_note TEXT,
        response_version INTEGER DEFAULT 1,
        structured_details TEXT,
        category_version INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS safety_alert_recipients (
        id VARCHAR(255) PRIMARY KEY,
        alert_id VARCHAR(255) NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        recipient_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_role VARCHAR(64) NOT NULL,
        recipient_group VARCHAR(64),
        delivered_in_app_at TIMESTAMP,
        push_sent_at TIMESTAMP,
        push_status VARCHAR(64),
        read_at TIMESTAMP,
        sound_started_at TIMESTAMP,
        sound_stopped_at TIMESTAMP,
        acknowledged_visibility_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        UNIQUE(alert_id, recipient_user_id)
      );

      CREATE TABLE IF NOT EXISTS user_duty_status (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        active INTEGER DEFAULT 1,
        approved INTEGER DEFAULT 1,
        on_duty INTEGER DEFAULT 1,
        alert_enabled INTEGER DEFAULT 1,
        assigned_event_id VARCHAR(255),
        assigned_team VARCHAR(255),
        shift_start VARCHAR(255),
        shift_end VARCHAR(255),
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS event_duty_devices (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(255) NOT NULL,
        event_id VARCHAR(255) NOT NULL,
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

      CREATE TABLE IF NOT EXISTS device_readiness_logs (
        id VARCHAR(255) PRIMARY KEY,
        event_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        role VARCHAR(255) NOT NULL,
        device_id VARCHAR(255) NOT NULL,
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

      CREATE TABLE IF NOT EXISTS user_passkeys (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(64) NOT NULL,
        credential_id TEXT UNIQUE NOT NULL,
        public_key TEXT NOT NULL,
        counter INTEGER DEFAULT 0,
        device_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL,
        last_used_at TIMESTAMP,
        revoked_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64),
        user_role VARCHAR(64),
        action VARCHAR(255) NOT NULL,
        target_type VARCHAR(128),
        target_id VARCHAR(128),
        details TEXT,
        timestamp TIMESTAMP NOT NULL
      );

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
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

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
        created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        updated_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

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

      CREATE TABLE IF NOT EXISTS alert_recipient_snapshots (
        id VARCHAR(255) PRIMARY KEY,
        alert_id VARCHAR(255) NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assignment_id VARCHAR(255),
        routing_rule_id VARCHAR(255),
        tier VARCHAR(255) NOT NULL DEFAULT 'primary',
        eligibility_status VARCHAR(255) NOT NULL,
        exclusion_reason VARCHAR(255),
        created_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alert_device_deliveries (
        id VARCHAR(255) PRIMARY KEY,
        alert_id VARCHAR(255) NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        recipient_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        duty_device_id VARCHAR(255) NOT NULL REFERENCES event_duty_devices(id) ON DELETE CASCADE,
        channel VARCHAR(255) NOT NULL,
        delivery_status VARCHAR(255) DEFAULT 'pending',
        attempted_at VARCHAR(255),
        delivered_at VARCHAR(255),
        acknowledged_at VARCHAR(255),
        failure_code VARCHAR(255),
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS event_routing_change_history (
        id VARCHAR(255) PRIMARY KEY,
        event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action VARCHAR(255) NOT NULL,
        target_type VARCHAR(255) NOT NULL,
        target_id VARCHAR(255),
        details TEXT,
        created_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alert_response_history (
        id VARCHAR(255) PRIMARY KEY,
        alert_id VARCHAR(255) NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(255) NOT NULL,
        target_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        note TEXT,
        created_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alert_response_assignments (
        id VARCHAR(255) PRIMARY KEY,
        alert_id VARCHAR(255) NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        participant_role VARCHAR(255) NOT NULL,
        assignment_status VARCHAR(255) NOT NULL,
        assigned_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        assignment_reason TEXT,
        assigned_at TIMESTAMP NOT NULL,
        accepted_at TIMESTAMP,
        ended_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        UNIQUE(alert_id, user_id, participant_role)
      );

      CREATE TABLE IF NOT EXISTS alert_response_updates (
        id VARCHAR(255) PRIMARY KEY,
        alert_id VARCHAR(255) NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        author_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        update_type VARCHAR(255) NOT NULL,
        note TEXT,
        visibility VARCHAR(255) NOT NULL,
        idempotency_key VARCHAR(255) UNIQUE,
        created_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alert_handover_requests (
        id VARCHAR(255) PRIMARY KEY,
        alert_id VARCHAR(255) NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
        from_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(255) NOT NULL,
        reason TEXT NOT NULL,
        note TEXT,
        idempotency_key VARCHAR(255) UNIQUE,
        requested_at TIMESTAMP NOT NULL,
        responded_at TIMESTAMP,
        responded_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attendance_records (
        id VARCHAR(255) PRIMARY KEY,
        child_event_entry_id VARCHAR(255) NOT NULL REFERENCES child_event_entries(id) ON DELETE CASCADE,
        action_type VARCHAR(255) NOT NULL,
        action_time TIMESTAMP NOT NULL,
        staff_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        verified_pickup_person_id VARCHAR(255) REFERENCES pickup_people(id) ON DELETE SET NULL,
        gate_location VARCHAR(255),
        sync_source VARCHAR(255) NOT NULL,
        idempotency_key VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS offline_sync_records (
        id VARCHAR(255) PRIMARY KEY,
        event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        staff_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_identifier VARCHAR(255) NOT NULL,
        sync_type VARCHAR(255) NOT NULL,
        record_count INTEGER NOT NULL,
        payload_hash VARCHAR(255) NOT NULL,
        status VARCHAR(255) NOT NULL,
        error_summary TEXT,
        created_at TIMESTAMP NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attendance_entry_id ON attendance_records(child_event_entry_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_action_type ON attendance_records(action_type);
      CREATE INDEX IF NOT EXISTS idx_attendance_action_time ON attendance_records(action_time);
      CREATE INDEX IF NOT EXISTS idx_offline_sync_event ON offline_sync_records(event_id);
      CREATE INDEX IF NOT EXISTS idx_offline_sync_status ON offline_sync_records(status);
    `);

    // Safe migration for column length extension
    try {
      await pool.query('ALTER TABLE child_attention_items ALTER COLUMN id TYPE VARCHAR(255)');
    } catch (err) {
      // Ignore if column doesn't exist yet or migration is not required
    }

    const pgCols = [
      "provider VARCHAR(64) DEFAULT 'cloudinary'",
      "public_id VARCHAR(255)",
      "secure_url TEXT",
      "resource_type VARCHAR(64)",
      "width INTEGER",
      "height INTEGER",
      "duration DOUBLE PRECISION",
      "folder VARCHAR(255)"
    ];
    for (const col of pgCols) {
      try {
        const parts = col.split(' ');
        const colName = parts[0];
        const colDef = parts.slice(1).join(' ');
        await pool.query(`ALTER TABLE media_files ADD COLUMN IF NOT EXISTS ${colName} ${colDef};`);
      } catch (e) {
        // Ignore column addition error if any
      }
    }

    const pgEventCols = [
      "event_start_at VARCHAR(64)",
      "event_end_at VARCHAR(64)",
      "check_in_opens_at VARCHAR(64)",
      "check_in_closes_at VARCHAR(64)",
      "pickup_starts_at VARCHAR(64)",
      "pickup_reminder_at VARCHAR(64)",
      "timezone VARCHAR(64) DEFAULT 'Africa/Lagos'",
      "parent_access_opens_at VARCHAR(64)",
      "parent_access_closes_at VARCHAR(64)",
      "parents_can_create_account INTEGER DEFAULT 1",
      "allow_multiple_children INTEGER DEFAULT 1",
      "allow_save_and_continue INTEGER DEFAULT 1",
      "allow_edit_after_submission INTEGER DEFAULT 0",
      "created_by VARCHAR(64)",
      "updated_by VARCHAR(64)",
      "archived_at VARCHAR(64)",
      "description VARCHAR(1000)"
    ];
    for (const col of pgEventCols) {
      try {
        const parts = col.split(' ');
        const colName = parts[0];
        const colDef = parts.slice(1).join(' ');
        await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS ${colName} ${colDef};`);
      } catch (e) {
        // Ignore column addition error if any
      }
    }

    try {
      await pool.query(`ALTER TABLE parent_profiles ADD COLUMN IF NOT EXISTS country VARCHAR(255);`);
    } catch (e) {}

    try {
      await pool.query(`ALTER TABLE parent_profiles ADD COLUMN IF NOT EXISTS state_region VARCHAR(255);`);
    } catch (e) {}

    try {
      await pool.query(`ALTER TABLE parent_profiles ADD COLUMN IF NOT EXISTS city VARCHAR(255);`);
    } catch (e) {}

    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified INTEGER DEFAULT 0;`);
    } catch (e) {}

    try {
      await pool.query(`ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS used_at TIMESTAMP;`);
    } catch (e) {}

    try {
      await pool.query(`ALTER TABLE child_event_entries ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMP;`);
    } catch (e) {}

    try {
      await pool.query(`ALTER TABLE child_event_entries ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP;`);
    } catch (e) {}

    try {
      await pool.query(`ALTER TABLE child_event_entries ADD COLUMN IF NOT EXISTS checked_in_by VARCHAR(255);`);
    } catch (e) {}

    try {
      await pool.query(`ALTER TABLE child_event_entries ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP;`);
    } catch (e) {}

    try {
      await pool.query(`ALTER TABLE child_event_entries ADD COLUMN IF NOT EXISTS picked_up_by VARCHAR(255);`);
    } catch (e) {}

    try {
      await pool.query(`ALTER TABLE child_event_entries ADD COLUMN IF NOT EXISTS pickup_person_id VARCHAR(255);`);
    } catch (e) {}

    // Soft delete columns for parent_profiles in Postgres
    const pgParentSoftDeleteCols = [
      "is_deleted INTEGER DEFAULT 0",
      "deleted_at TIMESTAMP",
      "deleted_by VARCHAR(64)",
      "delete_reason TEXT",
      "restored_at TIMESTAMP",
      "restored_by VARCHAR(64)",
      "permanently_deleted_at TIMESTAMP",
      "permanently_deleted_by VARCHAR(64)",
      "permanent_delete_reason TEXT",
      "anonymized_at TIMESTAMP"
    ];
    for (const col of pgParentSoftDeleteCols) {
      try {
        const parts = col.split(' ');
        const colName = parts[0];
        const colDef = parts.slice(1).join(' ');
        await pool.query(`ALTER TABLE parent_profiles ADD COLUMN IF NOT EXISTS ${colName} ${colDef};`);
      } catch (e) {}
    }

    // Soft delete columns for volunteer_profiles in Postgres
    const pgVolSoftDeleteCols = [
      "is_deleted INTEGER DEFAULT 0",
      "deleted_at TIMESTAMP",
      "deleted_by VARCHAR(64)",
      "delete_reason TEXT",
      "restored_at TIMESTAMP",
      "restored_by VARCHAR(64)",
      "permanently_deleted_at TIMESTAMP",
      "permanently_deleted_by VARCHAR(64)",
      "permanent_delete_reason TEXT",
      "anonymized_at TIMESTAMP"
    ];
    for (const col of pgVolSoftDeleteCols) {
      try {
        const parts = col.split(' ');
        const colName = parts[0];
        const colDef = parts.slice(1).join(' ');
        await pool.query(`ALTER TABLE volunteer_profiles ADD COLUMN IF NOT EXISTS ${colName} ${colDef};`);
      } catch (e) {}
    }

    // Soft delete columns for children and child_event_entries in Postgres
    const pgChildSoftDeleteCols = [
      "is_deleted INTEGER DEFAULT 0",
      "deleted_at TIMESTAMP",
      "deleted_by VARCHAR(64)",
      "delete_reason TEXT",
      "restored_at TIMESTAMP",
      "restored_by VARCHAR(64)"
    ];
    for (const col of pgChildSoftDeleteCols) {
      try {
        const parts = col.split(' ');
        const colName = parts[0];
        const colDef = parts.slice(1).join(' ');
        await pool.query(`ALTER TABLE children ADD COLUMN IF NOT EXISTS ${colName} ${colDef};`);
      } catch (e) {}
      try {
        const parts = col.split(' ');
        const colName = parts[0];
        const colDef = parts.slice(1).join(' ');
        await pool.query(`ALTER TABLE child_event_entries ADD COLUMN IF NOT EXISTS ${colName} ${colDef};`);
      } catch (e) {}
    }

    // Migrate notification_preferences for audio settings (Postgres)
    const pgNotifPrefCols = [
      'urgent_sound_profile VARCHAR(64) DEFAULT \'emergency\'',
      'urgent_volume_boost VARCHAR(64) DEFAULT \'standard\'',
      'repeat_urgent_alerts INTEGER DEFAULT 1',
      'spoken_alerts_enabled INTEGER DEFAULT 0',
      'spoken_alert_mode VARCHAR(64) DEFAULT \'private\'',
      'spoken_alert_repeats INTEGER DEFAULT 1'
    ];
    for (const col of pgNotifPrefCols) {
      try {
        const parts = col.split(' ');
        const colName = parts[0];
        const colDef = parts.slice(1).join(' ');
        await pool.query(`ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS ${colName} ${colDef};`);
      } catch (e) {}
    }

    try {
      await pool.query(`ALTER TABLE event_safety_alerts ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);`);
    } catch (e) {}
    try {
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_event_safety_alerts_idempotency ON event_safety_alerts(idempotency_key);`);
    } catch (e) {}

    const pgAlertNewCols = [
      "owner_user_id VARCHAR(255)",
      "owner_assigned_at TIMESTAMP",
      "in_progress_at TIMESTAMP",
      "reopened_at TIMESTAMP",
      "reopened_by VARCHAR(255)",
      "reopen_note TEXT",
      "response_version INTEGER DEFAULT 1",
      "structured_details TEXT",
      "category_version INTEGER DEFAULT 1"
    ];
    for (const col of pgAlertNewCols) {
      try {
        const parts = col.split(' ');
        const colName = parts[0];
        const colDef = parts.slice(1).join(' ');
        await pool.query(`ALTER TABLE event_safety_alerts ADD COLUMN IF NOT EXISTS ${colName} ${colDef};`);
      } catch (e) {}
    }

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS alert_response_history (
          id VARCHAR(255) PRIMARY KEY,
          alert_id VARCHAR(255) NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
          user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
          action VARCHAR(255) NOT NULL,
          target_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
          note TEXT,
          created_at TIMESTAMP NOT NULL
        );
      `);
    } catch (e) {}

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS alert_response_assignments (
          id VARCHAR(255) PRIMARY KEY,
          alert_id VARCHAR(255) NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
          user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          participant_role VARCHAR(255) NOT NULL,
          assignment_status VARCHAR(255) NOT NULL,
          assigned_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
          assignment_reason TEXT,
          assigned_at TIMESTAMP NOT NULL,
          accepted_at TIMESTAMP,
          ended_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL,
          UNIQUE(alert_id, user_id, participant_role)
        );
      `);
    } catch (e) {}

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS alert_response_updates (
          id VARCHAR(255) PRIMARY KEY,
          alert_id VARCHAR(255) NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
          author_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          update_type VARCHAR(255) NOT NULL,
          note TEXT,
          visibility VARCHAR(255) NOT NULL,
          idempotency_key VARCHAR(255) UNIQUE,
          created_at TIMESTAMP NOT NULL
        );
      `);
    } catch (e) {}

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS alert_handover_requests (
          id VARCHAR(255) PRIMARY KEY,
          alert_id VARCHAR(255) NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
          from_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          to_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status VARCHAR(255) NOT NULL,
          reason TEXT NOT NULL,
          note TEXT,
          idempotency_key VARCHAR(255) UNIQUE,
          requested_at TIMESTAMP NOT NULL,
          responded_at TIMESTAMP,
          responded_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        );
      `);
    } catch (e) {}

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS attendance_records (
          id VARCHAR(255) PRIMARY KEY,
          child_event_entry_id VARCHAR(255) NOT NULL REFERENCES child_event_entries(id) ON DELETE CASCADE,
          action_type VARCHAR(255) NOT NULL,
          action_time TIMESTAMP NOT NULL,
          staff_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          verified_pickup_person_id VARCHAR(255) REFERENCES pickup_people(id) ON DELETE SET NULL,
          gate_location VARCHAR(255),
          sync_source VARCHAR(255) NOT NULL,
          idempotency_key VARCHAR(255) UNIQUE NOT NULL,
          created_at TIMESTAMP NOT NULL
        );
      `);
    } catch (e) {}

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS offline_sync_records (
          id VARCHAR(255) PRIMARY KEY,
          event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          staff_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          device_identifier VARCHAR(255) NOT NULL,
          sync_type VARCHAR(255) NOT NULL,
          record_count INTEGER NOT NULL,
          payload_hash VARCHAR(255) NOT NULL,
          status VARCHAR(255) NOT NULL,
          error_summary TEXT,
          created_at TIMESTAMP NOT NULL
        );
      `);
    } catch (e) {}

    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_attendance_entry_id ON attendance_records(child_event_entry_id);
        CREATE INDEX IF NOT EXISTS idx_attendance_action_type ON attendance_records(action_type);
        CREATE INDEX IF NOT EXISTS idx_attendance_action_time ON attendance_records(action_time);
        CREATE INDEX IF NOT EXISTS idx_offline_sync_event ON offline_sync_records(event_id);
        CREATE INDEX IF NOT EXISTS idx_offline_sync_status ON offline_sync_records(status);
      `);
    } catch (e) {}

    // Phase 6 Event Locations (Postgres)
    try {
      await pool.query(`
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
      `);
    } catch (e) {}

    try {
      await pool.query(`
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
      `);
    } catch (e) {}

    try {
      await pool.query(`
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
      `);
    } catch (e) {}

    // Phase 7: Child Emergency Summary tables (Postgres)
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS alert_child_context_snapshots (
          id VARCHAR(255) PRIMARY KEY,
          alert_id VARCHAR(255) NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
          child_id VARCHAR(255) REFERENCES children(id) ON DELETE SET NULL,
          context_type VARCHAR(255),
          display_name_snapshot VARCHAR(255),
          preferred_name_snapshot VARCHAR(255),
          age_group_snapshot VARCHAR(255),
          assigned_room_snapshot VARCHAR(255),
          photo_reference_snapshot VARCHAR(255),
          event_status_snapshot VARCHAR(255),
          safety_summary_snapshot TEXT,
          snapshot_version INTEGER DEFAULT 1,
          created_at TIMESTAMP NOT NULL
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_alert_child_snapshots_alert ON alert_child_context_snapshots(alert_id);`);
    } catch (e) {
      console.error('Error creating alert_child_context_snapshots in Postgres:', e);
    }

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS child_summary_access_logs (
          id VARCHAR(255) PRIMARY KEY,
          event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          alert_id VARCHAR(255) REFERENCES event_safety_alerts(id) ON DELETE SET NULL,
          child_id VARCHAR(255) NOT NULL REFERENCES children(id) ON DELETE CASCADE,
          actor_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          access_profile VARCHAR(255) NOT NULL,
          accessed_section VARCHAR(255) NOT NULL,
          access_reason VARCHAR(500),
          created_at TIMESTAMP NOT NULL
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_child_summary_access_child_time ON child_summary_access_logs(child_id, created_at);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_child_summary_access_alert_time ON child_summary_access_logs(alert_id, created_at);`);
    } catch (e) {
      console.error('Error creating child_summary_access_logs in Postgres:', e);
    }

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS alert_child_link_history (
          id VARCHAR(255) PRIMARY KEY,
          alert_id VARCHAR(255) NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
          previous_child_id VARCHAR(255) REFERENCES children(id) ON DELETE SET NULL,
          new_child_id VARCHAR(255) REFERENCES children(id) ON DELETE SET NULL,
          action VARCHAR(255) NOT NULL,
          reason VARCHAR(500) NOT NULL,
          changed_by VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP NOT NULL
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_alert_child_link_hist_alert_time ON alert_child_link_history(alert_id, created_at);`);
    } catch (e) {
      console.error('Error creating alert_child_link_history in Postgres:', e);
    }

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS child_contact_attempts (
          id VARCHAR(255) PRIMARY KEY,
          event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          alert_id VARCHAR(255) NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
          child_id VARCHAR(255) NOT NULL REFERENCES children(id) ON DELETE CASCADE,
          contact_type VARCHAR(255) NOT NULL,
          contact_reference VARCHAR(255) NOT NULL,
          outcome VARCHAR(255) NOT NULL,
          safe_note TEXT,
          attempted_by VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          attempted_at TIMESTAMP NOT NULL
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_child_contact_attempts_alert_time ON child_contact_attempts(alert_id, attempted_at);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_child_event_entries_event_child ON child_event_entries(event_id, child_id);`);
    } catch (e) {
      console.error('Error creating child_contact_attempts in Postgres:', e);
    }

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS incident_records (
          id VARCHAR(255) PRIMARY KEY,
          alert_id VARCHAR(255) UNIQUE NOT NULL REFERENCES event_safety_alerts(id) ON DELETE CASCADE,
          event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          creator_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status VARCHAR(64) NOT NULL DEFAULT 'draft',
          category VARCHAR(64) NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          structured_data TEXT NOT NULL,
          parent_contact TEXT,
          first_aid TEXT,
          security TEXT,
          follow_up_actions TEXT,
          change_requests TEXT,
          closure_checklist TEXT,
          version INTEGER DEFAULT 1 NOT NULL,
          idempotency_key VARCHAR(255) UNIQUE,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_incident_records_alert ON incident_records(alert_id);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_incident_records_event ON incident_records(event_id);`);
    } catch (e) {
      console.error('Error creating incident_records in Postgres:', e);
    }

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS incident_history (
          id VARCHAR(255) PRIMARY KEY,
          incident_id VARCHAR(255) NOT NULL REFERENCES incident_records(id) ON DELETE CASCADE,
          user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          action VARCHAR(64) NOT NULL,
          note TEXT,
          state_snapshot TEXT,
          created_at TIMESTAMP NOT NULL
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_incident_history_incident ON incident_history(incident_id);`);
    } catch (e) {
      console.error('Error creating incident_history in Postgres:', e);
    }

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS escalation_policies (
          id VARCHAR(255) PRIMARY KEY,
          event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          policy_scope VARCHAR(255) NOT NULL,
          severity VARCHAR(64),
          category_key VARCHAR(64),
          location_id VARCHAR(255) REFERENCES event_locations(id) ON DELETE SET NULL,
          location_type VARCHAR(64),
          condition_key VARCHAR(128) NOT NULL,
          priority INTEGER NOT NULL DEFAULT 0,
          is_enabled INTEGER DEFAULT 1,
          created_by VARCHAR(255),
          updated_by VARCHAR(255),
          archived_at VARCHAR(64),
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        );

        CREATE TABLE IF NOT EXISTS escalation_policy_steps (
          id VARCHAR(255) PRIMARY KEY,
          policy_id VARCHAR(255) NOT NULL REFERENCES escalation_policies(id) ON DELETE CASCADE,
          step_order INTEGER NOT NULL,
          wait_seconds INTEGER NOT NULL,
          target_type VARCHAR(64) NOT NULL,
          target_user_id VARCHAR(255),
          target_responsibility_key VARCHAR(128),
          target_team_key VARCHAR(128),
          target_supervisory_level VARCHAR(128),
          channels VARCHAR(255) NOT NULL,
          repeat_effect VARCHAR(128),
          maximum_attempts INTEGER DEFAULT 1,
          cooldown_seconds INTEGER DEFAULT 60,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        );

        CREATE TABLE IF NOT EXISTS escalation_cycles (
          id VARCHAR(255) PRIMARY KEY,
          event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          subject_type VARCHAR(64) NOT NULL,
          alert_id VARCHAR(255) REFERENCES event_safety_alerts(id) ON DELETE SET NULL,
          incident_id VARCHAR(255) REFERENCES incident_records(id) ON DELETE SET NULL,
          follow_up_id VARCHAR(255),
          policy_id VARCHAR(255) REFERENCES escalation_policies(id) ON DELETE SET NULL,
          condition_key VARCHAR(128) NOT NULL,
          cycle_number INTEGER NOT NULL DEFAULT 1,
          status VARCHAR(64) NOT NULL DEFAULT 'scheduled',
          current_step_order INTEGER NOT NULL DEFAULT 0,
          next_due_at TIMESTAMP,
          started_at TIMESTAMP NOT NULL,
          stopped_at TIMESTAMP,
          stop_reason TEXT,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        );

        CREATE TABLE IF NOT EXISTS escalation_executions (
          id VARCHAR(255) PRIMARY KEY,
          cycle_id VARCHAR(255) NOT NULL REFERENCES escalation_cycles(id) ON DELETE CASCADE,
          policy_step_id VARCHAR(255) REFERENCES escalation_policy_steps(id) ON DELETE SET NULL,
          execution_key VARCHAR(255) UNIQUE NOT NULL,
          status VARCHAR(64) NOT NULL DEFAULT 'scheduled',
          scheduled_for TIMESTAMP NOT NULL,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          attempt_count INTEGER DEFAULT 0,
          retry_at TIMESTAMP,
          failure_code VARCHAR(128),
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        );

        CREATE TABLE IF NOT EXISTS escalation_deliveries (
          id VARCHAR(255) PRIMARY KEY,
          execution_id VARCHAR(255) NOT NULL REFERENCES escalation_executions(id) ON DELETE CASCADE,
          user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          duty_device_id VARCHAR(255),
          channel VARCHAR(64) NOT NULL,
          status VARCHAR(64) NOT NULL DEFAULT 'pending',
          attempted_at TIMESTAMP,
          delivered_at TIMESTAMP,
          failure_code VARCHAR(128),
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        );

        CREATE TABLE IF NOT EXISTS escalation_history (
          id VARCHAR(255) PRIMARY KEY,
          event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          cycle_id VARCHAR(255) REFERENCES escalation_cycles(id) ON DELETE SET NULL,
          actor_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
          action_type VARCHAR(128) NOT NULL,
          safe_summary TEXT NOT NULL,
          protected_metadata TEXT,
          created_at TIMESTAMP NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scheduler_leases (
          id VARCHAR(255) PRIMARY KEY,
          leased_by VARCHAR(255) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_escalation_policies_event ON escalation_policies(event_id);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_escalation_cycles_due ON escalation_cycles(status, next_due_at);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_escalation_executions_due ON escalation_executions(status, scheduled_for);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_escalation_history_cycle ON escalation_history(cycle_id);`);
    } catch (e) {
      console.error('Error creating escalation tables in Postgres:', e);
    }

    // Safe column additions for Phase 6 in Postgres
    const pgPhase6Cols = [
      { table: 'event_duty_assignments', colName: 'assigned_location_id', colDef: 'VARCHAR(255)' },
      { table: 'event_safety_alerts', colName: 'location_id', colDef: 'VARCHAR(255)' },
      { table: 'event_safety_alerts', colName: 'location_path_snapshot', colDef: 'VARCHAR(500)' },
      { table: 'event_safety_alerts', colName: 'location_detail', colDef: 'TEXT' },
      { table: 'event_safety_alerts', colName: 'location_source', colDef: 'VARCHAR(64)' },
      { table: 'event_safety_alerts', colName: 'original_location_id', colDef: 'VARCHAR(255)' },
      { table: 'alert_routing_rules', colName: 'location_id', colDef: 'VARCHAR(255)' },
      { table: 'alert_routing_rules', colName: 'location_type_scope', colDef: 'VARCHAR(64)' },
      { table: 'alert_routing_rules', colName: 'include_sub_locations', colDef: 'INTEGER DEFAULT 0' }
    ];
    for (const item of pgPhase6Cols) {
      try {
        await pool.query(`ALTER TABLE ${item.table} ADD COLUMN IF NOT EXISTS ${item.colName} ${item.colDef};`);
      } catch (e) {}
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_locations_event_active ON event_locations(event_id, is_active);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_locations_parent ON event_locations(parent_location_id);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_duty_location_presence_user ON event_duty_location_presence(user_id);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_duty_location_presence_loc ON event_duty_location_presence(event_location_id);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_location_codes_hash ON event_location_codes(token_hash);`);
    } catch (e) {}

    const now = new Date().toISOString();
    await pool.query(`
      INSERT INTO events (
        id, title, section_name, theme, scripture, starts_at, ends_at,
        daily_start_time, daily_end_time, location, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO NOTHING
    `, [
      REAL_EVENT_ID,
      'The General Assembly',
      'Children and Teens',
      'More Than Conquerors',
      'Romans 8:37',
      '2026-11-18',
      '2026-11-22',
      '9:00 AM',
      '7:00 PM',
      'Koinonia Global Auditorium & Children Pavilion, Abuja',
      'current',
      now,
      now
    ]);

    // Safely migrate existing databases for consistency
    await pool.query("UPDATE events SET title = 'The General Assembly', section_name = 'Children and Teens' WHERE id = $1 AND title = 'Children and Teens'", [REAL_EVENT_ID]);
    await pool.query("UPDATE events SET status = 'current' WHERE id = $1 AND status IN ('open', 'active')", [REAL_EVENT_ID]);

    await pool.query(`
      INSERT INTO admin_general_settings (
        id, parent_registration_enabled, parent_login_enabled, required_child_photo, required_parent_photo,
        required_medical_notes, required_pickup_person, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING
    `, [
      'primary_general_settings',
      1,
      1,
      1,
      1,
      0,
      1,
      now,
      now
    ]);

    await pool.query(`
      INSERT INTO admin_footer_settings (
        id, copyright_year, copyright_text, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING
    `, [
      'primary_footer_settings',
      2025,
      'Koinonia Children and Teens. All rights reserved.',
      now,
      now
    ]);

    // Ensure PostgreSQL users table has status column
    try {
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(64) DEFAULT 'active';");
    } catch (_) {}

    // Check if users table is empty and auto-seed development data
    const userCountResult = await pool.query('SELECT COUNT(*) as count FROM users');
    const userCount = parseInt(userCountResult.rows[0].count, 10);
    if (userCount === 0) {
      console.log('[PostgreSQL Seeder] Database is empty. Seeding development accounts...');
      
      const hash = (p: string) => {
        const s = crypto.randomBytes(16).toString('hex');
        const d = crypto.scryptSync(p, s, 64).toString('hex');
        return `${s}:${d}`;
      };
      const hashedPassword = hash('Password123!');

      // 1. Admin Account
      const adminUserId = 'admin-user-id-2026';
      const adminProfileId = 'admin-profile-id-2026';
      await pool.query(`
        INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 1, $5, $6)
      `, [adminUserId, 'admin@koinonia.org', hashedPassword, 'super_admin', now, now]);

      await pool.query(`
        INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, whatsapp_number, home_address, preferred_contact, is_koinonia_worker, country, state_region, city, photo_file_id, profile_completed_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, $13, $14, $15)
      `, [adminProfileId, adminUserId, 'Super Admin', 'admin@koinonia.org', '+2348031234567', '+2348031234567', 'Koinonia Global Headquarters, Abuja', 'WhatsApp', 'Nigeria', 'FCT', 'Abuja', 'photo-parent-default', now, now, now]);

      await pool.query(`
        INSERT INTO user_duty_status (id, user_id, active, approved, on_duty, alert_enabled, assigned_event_id, assigned_team, created_at, updated_at)
        VALUES ($1, $2, 1, 1, 1, 1, $3, 'Admins', $4, $5)
      `, ['duty-admin-2026', adminUserId, REAL_EVENT_ID, now, now]);

      // Seed 9 additional admins to make it 10 admins total
      for (let i = 1; i <= 9; i++) {
        const extraAdminUserId = `admin-user-id-2026-${i}`;
        const extraAdminProfileId = `admin-profile-id-2026-${i}`;
        const email = `admin${i}@koinonia.org`;
        
        await pool.query(`
          INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
          VALUES ($1, $2, $3, 'admin', 1, $4, $5)
        `, [extraAdminUserId, email, hashedPassword, now, now]);

        await pool.query(`
          INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, whatsapp_number, home_address, preferred_contact, is_koinonia_worker, country, state_region, city, photo_file_id, profile_completed_at, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, $11, $12, $13, $14, $15)
        `, [
          extraAdminProfileId, 
          extraAdminUserId, 
          `Admin Specialist ${i}`, 
          email, 
          `+234803123456${i}`, 
          `+234803123456${i}`, 
          'Koinonia Headquarters', 
          'WhatsApp', 
          'Nigeria', 
          'FCT', 
          'Abuja', 
          'photo-parent-default', 
          now, 
          now, 
          now
        ]);

        await pool.query(`
          INSERT INTO user_duty_status (id, user_id, active, approved, on_duty, alert_enabled, assigned_event_id, assigned_team, created_at, updated_at)
          VALUES ($1, $2, 1, 1, 1, 1, $3, 'Admins', $4, $5)
        `, [`duty-admin-${i}`, extraAdminUserId, REAL_EVENT_ID, now, now]);
      }

      // 2. Parent Account
      const parentUserId = 'parent-user-id-2026';
      const parentProfileId = 'parent-profile-id-2026';
      await pool.query(`
        INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 1, $5, $6)
      `, [parentUserId, 'parent@koinonia.org', hashedPassword, 'parent', now, now]);

      await pool.query(`
        INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, whatsapp_number, home_address, preferred_contact, is_koinonia_worker, country, state_region, city, photo_file_id, profile_completed_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, $13, $14, $15)
      `, [
        parentProfileId, 
        parentUserId, 
        'Adebayo Omikunle', 
        'parent@koinonia.org', 
        '+2348099990001', 
        '+2348099990001', 
        '12 Mandate Street, Garki', 
        'WhatsApp', 
        'Nigeria', 
        'FCT', 
        'Abuja', 
        'photo-parent-default', 
        now, 
        now, 
        now
      ]);

      // 3. Children Profiles
      const child1Id = 'child-1-id-2026';
      const child2Id = 'child-2-id-2026';
      await pool.query(`
        INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, photo_file_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [child1Id, parentProfileId, 'Grace Omikunle', 'Female', '2018-06-15', 7, 'Ages 7 to 9', 'Parent', 'photo-child-1', now, now]);

      await pool.query(`
        INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, photo_file_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [child2Id, parentProfileId, 'Samuel Omikunle', 'Male', '2021-04-10', 4, 'Ages 4 to 6', 'Parent', 'photo-child-2', now, now]);

      // 4. Child Event Entries
      const entry1Id = 'entry-1-id-2026';
      const entry2Id = 'entry-2-id-2026';
      await pool.query(`
        INSERT INTO child_event_entries (id, child_id, event_id, status, school_class, school_name, previous_children_programme, note_to_team, has_medical_notes, medical_notes, needs_extra_support, support_notes, information_confirmed, details_confirmed, submitted_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, 0, $10, 1, 1, $11, $12, $13)
      `, [entry1Id, child1Id, REAL_EVENT_ID, 'under_review', 'Primary 2', 'Lighthouse Academy', 'No', 'Grace is excited to learn!', '', '', now, now, now]);

      await pool.query(`
        INSERT INTO child_event_entries (id, child_id, event_id, status, school_class, school_name, previous_children_programme, note_to_team, has_medical_notes, medical_notes, needs_extra_support, support_notes, information_confirmed, details_confirmed, submitted_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, 0, $10, 1, 1, $11, $12, $13)
      `, [entry2Id, child2Id, REAL_EVENT_ID, 'pass_ready', 'Nursery 2', 'Lighthouse Academy', 'No', 'Samuel can be shy at first.', '', '', now, now, now]);

      // 5. Event Passes (for child 2 since they are pass_ready)
      await pool.query(`
        INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, ['pass-2-id-2026', entry2Id, 'K-2026-OMIKUNLE-SAMUEL', 'mock-pass-hash-2026', 'active', now, now, now]);

      // 6. Pickup People
      await pool.query(`
        INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, whatsapp_number, photo_file_id, approved_by_parent, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10)
      `, ['pickup-1-id-2026', entry1Id, 'designated_pickup', 'Olusola Omikunle', 'Uncle', '+2348039998888', '+2348039998888', 'photo-pickup-1', now, now]);

      await pool.query(`
        INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, whatsapp_number, photo_file_id, approved_by_parent, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10)
      `, ['pickup-2-id-2026', entry2Id, 'designated_pickup', 'Olusola Omikunle', 'Uncle', '+2348039998888', '+2348039998888', 'photo-pickup-1', now, now]);

      // 7. Volunteer Account
      const volunteerUserId = 'volunteer-user-id-2026';
      const volunteerProfileId = 'volunteer-profile-id-2026';
      await pool.query(`
        INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 1, $5, $6)
      `, [volunteerUserId, 'volunteer@koinonia.org', hashedPassword, 'volunteer', now, now]);

      await pool.query(`
        INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, serving_experience, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [volunteerProfileId, volunteerUserId, 'Sarah Volunteer', '+2348011112222', '+2348011112222', 'Ages 7-9 Team', 2, 'active', now, now]);

      console.log('[PostgreSQL Seeder] Successfully seeded all development accounts.');
    }
  } catch (err) {
    console.error('PostgreSQL schema initialization error:', err);
  }
}

