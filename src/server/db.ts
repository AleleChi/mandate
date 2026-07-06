import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import pg from 'pg';
const { Pool } = pg;

let sqliteDb: Database.Database | null = null;
let isPostgres = false;
let pgPool: any = null;
let pgInitPromise: Promise<void> | null = null;

const REAL_EVENT_ID = 'event-ga-2026';

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
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    initSqliteSchema(sqliteDb);
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

  // Seed real approved event
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO events (
      id, title, section_name, theme, scripture, starts_at, ends_at,
      daily_start_time, daily_end_time, location, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    REAL_EVENT_ID,
    'Children and Teens',
    'The General Assembly',
    'More Than Conquerors',
    'Romans 8:37',
    '2026-11-18',
    '2026-11-22',
    '9:00 AM',
    '7:00 PM',
    'Koinonia Global Auditorium & Children Pavilion, Abuja',
    'open',
    now,
    now
  );
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
    `);

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

    const now = new Date().toISOString();
    await pool.query(`
      INSERT INTO events (
        id, title, section_name, theme, scripture, starts_at, ends_at,
        daily_start_time, daily_end_time, location, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO NOTHING
    `, [
      REAL_EVENT_ID,
      'Children and Teens',
      'The General Assembly',
      'More Than Conquerors',
      'Romans 8:37',
      '2026-11-18',
      '2026-11-22',
      '9:00 AM',
      '7:00 PM',
      'Koinonia Global Auditorium & Children Pavilion, Abuja',
      'open',
      now,
      now
    ]);
  } catch (err) {
    console.error('PostgreSQL schema initialization error:', err);
  }
}

