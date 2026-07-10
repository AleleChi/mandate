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
    const trx = sqliteDb.transaction(() => {
      return fn();
    });
    return trx();
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
    CREATE INDEX IF NOT EXISTS idx_entries_child_id ON child_event_entries(child_id);
    CREATE INDEX IF NOT EXISTS idx_entries_event_id ON child_event_entries(event_id);
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
      updated_at TEXT NOT NULL
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
      CREATE INDEX IF NOT EXISTS idx_entries_child_id ON child_event_entries(child_id);
      CREATE INDEX IF NOT EXISTS idx_entries_event_id ON child_event_entries(event_id);
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
        updated_at TIMESTAMP NOT NULL
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

