import crypto from 'crypto';
import { execute, query, queryOne } from '../../../db';
import { AutomationSeverity, PHASE3B_AUTOMATION_RULES } from './ruleModel';
import { EventSignalType } from './signals';

const dbUrl = process.env.DATABASE_URL;
const isPostgres = !!(dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')));

export interface EventAutomationRecord {
  id: string;
  event_id: string;
  rule_id: string;
  signal_type: EventSignalType;
  fingerprint: string;
  title: string;
  summary: string;
  description: string | null;
  severity: AutomationSeverity;
  status: 'active' | 'resolved' | 'acknowledged' | 'dismissed';
  entity_type: string | null;
  entity_id: string | null;
  payload_json: string;
  proposed_action_key: string | null;
  proposed_action_payload: string | null;
  action_target_route: string | null;
  action_target_label: string | null;
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
  cooldown_until: string | null;
  material_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventAutomationSettingRecord {
  id: string;
  event_id: string;
  rule_id: string;
  is_enabled: number;
  cooldown_minutes: number;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Checks whether the Event Automations schema tables exist and are ready.
 * Completely read-only: does NOT execute any DDL.
 */
export async function isAutomationSchemaReady(): Promise<boolean> {
  try {
    await queryOne('SELECT 1 FROM event_automations LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Initializes database tables for Event Automations.
 *
 * PRODUCTION SAFETY RULE:
 * Render/production application startup (PostgreSQL) MUST NOT create or alter schema.
 * Production assumes migration 007_event_automations_neon.sql has already been applied.
 * No boot-time DDL is executed when targeting PostgreSQL.
 *
 * LOCAL DEVELOPMENT:
 * Local SQLite development retains safe local schema bootstrap.
 */
export async function initAutomationSchema(): Promise<boolean> {
  if (isPostgres) {
    // PRODUCTION POSTGRESQL: Verify schema presence without executing ANY DDL
    const ready = await isAutomationSchemaReady();
    if (!ready) {
      console.warn(
        '[Automations] Production schema missing: event_automations / event_automation_settings. ' +
        'Run docs/migrations/007_event_automations_neon.sql via scripts/run-event-automations-migration.ts.'
      );
      return false;
    }
    return true;
  }

  // LOCAL SQLITE INITIALIZATION (Development only)
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS event_automations (
        id VARCHAR(64) PRIMARY KEY,
        event_id VARCHAR(64) NOT NULL,
        rule_id VARCHAR(64) NOT NULL,
        signal_type TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        description TEXT,
        severity VARCHAR(32) NOT NULL DEFAULT 'attention',
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        entity_type VARCHAR(64),
        entity_id VARCHAR(64),
        payload_json TEXT NOT NULL,
        proposed_action_key VARCHAR(64),
        proposed_action_payload TEXT,
        action_target_route VARCHAR(64),
        action_target_label VARCHAR(64),
        first_detected_at TEXT NOT NULL,
        last_detected_at TEXT NOT NULL,
        resolved_at TEXT,
        acknowledged_at TEXT,
        cooldown_until TEXT,
        material_hash VARCHAR(64),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    await execute(`
      CREATE TABLE IF NOT EXISTS event_automation_settings (
        id VARCHAR(64) PRIMARY KEY,
        event_id VARCHAR(64) NOT NULL,
        rule_id VARCHAR(64) NOT NULL,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        cooldown_minutes INTEGER NOT NULL DEFAULT 60,
        updated_at TEXT NOT NULL,
        updated_by VARCHAR(64),
        UNIQUE(event_id, rule_id)
      );
    `);

    try {
      await execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_event_automations_fingerprint 
        ON event_automations(event_id, fingerprint);
      `);
    } catch {
      // Index may already exist
    }

    try {
      await execute(`
        CREATE INDEX IF NOT EXISTS idx_event_automations_status 
        ON event_automations(event_id, status);
      `);
    } catch {
      // Index may already exist
    }

    return true;
  } catch (err) {
    console.error('[Automations] Local SQLite bootstrap error:', err);
    return false;
  }
}

/**
 * Generates a deterministic material hash for condition change detection.
 */
export function computeMaterialHash(data: any): string {
  if (data && typeof data === 'object') {
    const copy = { ...data };
    delete copy.detectedAt;
    delete copy.detected_at;
    const serialized = JSON.stringify(copy);
    return crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 16);
  }
  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

/**
 * Retrieves active or resolved automations for a specific event.
 * Strict current event isolation: ONLY returns records for the provided eventId.
 */
export async function getAutomationsForEvent(
  eventId: string,
  options?: {
    status?: 'active' | 'resolved' | 'all';
    includeSafety?: boolean;
    limit?: number;
  }
): Promise<EventAutomationRecord[]> {
  const statusFilter = options?.status || 'active';
  const includeSafety = options?.includeSafety ?? false;
  const limit = Math.min(options?.limit || 50, 100);

  let sql = 'SELECT * FROM event_automations WHERE event_id = ?';
  const params: any[] = [eventId];

  if (statusFilter === 'active') {
    sql += " AND status IN ('active', 'acknowledged')";
  } else if (statusFilter === 'resolved') {
    sql += " AND status = 'resolved'";
  }

  if (!includeSafety) {
    sql += " AND signal_type != 'SAFETY_ITEM_OPEN'";
  }

  sql += ' ORDER BY CASE severity WHEN \'urgent\' THEN 1 WHEN \'attention\' THEN 2 ELSE 3 END, last_detected_at DESC LIMIT ?';
  params.push(limit);

  try {
    return await query<EventAutomationRecord>(sql, params);
  } catch (err: any) {
    if (err?.message?.includes('no such table') || err?.message?.includes('does not exist')) {
      return [];
    }
    throw err;
  }
}

/**
 * Retrieves a single automation by ID with event bounding.
 */
export async function getAutomationById(
  id: string,
  eventId?: string
): Promise<EventAutomationRecord | null> {
  try {
    if (eventId) {
      return await queryOne<EventAutomationRecord>(
        'SELECT * FROM event_automations WHERE id = ? AND event_id = ?',
        [id, eventId]
      );
    }
    return await queryOne<EventAutomationRecord>(
      'SELECT * FROM event_automations WHERE id = ?',
      [id]
    );
  } catch (err: any) {
    if (err?.message?.includes('no such table') || err?.message?.includes('does not exist')) {
      return null;
    }
    throw err;
  }
}

/**
 * Retrieves automation settings for an event.
 */
export async function getAutomationSettingsForEvent(
  eventId: string
): Promise<Map<string, boolean>> {
  try {
    const rows = await query<EventAutomationSettingRecord>(
      'SELECT rule_id, is_enabled FROM event_automation_settings WHERE event_id = ?',
      [eventId]
    );
    const map = new Map<string, boolean>();
    for (const r of rows) {
      map.set(r.rule_id, r.is_enabled === 1);
    }
    return map;
  } catch (err: any) {
    if (err?.message?.includes('no such table') || err?.message?.includes('does not exist')) {
      return new Map<string, boolean>();
    }
    throw err;
  }
}

/**
 * Updates or persists a rule setting for an event.
 */
export async function setAutomationRuleEnabled(
  eventId: string,
  ruleId: string,
  isEnabled: boolean,
  userId?: string
): Promise<boolean> {
  // Safety rule is mandatory and cannot be disabled
  const ruleDef = PHASE3B_AUTOMATION_RULES.find(r => r.id === ruleId || r.ruleKey === ruleId);
  if (ruleDef?.isMandatory && !isEnabled) {
    return false; // Forbidden to disable mandatory safety rule
  }

  const nowIso = new Date().toISOString();
  const existing = await queryOne<EventAutomationSettingRecord>(
    'SELECT id FROM event_automation_settings WHERE event_id = ? AND rule_id = ?',
    [eventId, ruleId]
  );

  if (existing) {
    await execute(
      'UPDATE event_automation_settings SET is_enabled = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      [isEnabled ? 1 : 0, nowIso, userId || null, existing.id]
    );
  } else {
    const id = `eas_${crypto.randomUUID()}`;
    await execute(
      'INSERT INTO event_automation_settings (id, event_id, rule_id, is_enabled, cooldown_minutes, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, eventId, ruleId, isEnabled ? 1 : 0, ruleDef?.defaultCooldownMinutes || 60, nowIso, userId || null]
    );
  }
  return true;
}

export interface AutomationUpsertInput {
  eventId: string;
  ruleId: string;
  signalType: EventSignalType;
  fingerprint: string;
  title: string;
  summary: string;
  description?: string;
  severity: AutomationSeverity;
  entityType?: string;
  entityId?: string;
  payload: any;
  proposedActionKey?: string;
  proposedActionPayload?: string;
  actionTargetRoute?: string;
  actionTargetLabel?: string;
  cooldownMinutes?: number;
}

/**
 * Upserts a detected automation signal into the database with deduplication,
 * cooldown enforcement, and material change detection.
 */
export async function upsertAutomation(
  input: AutomationUpsertInput
): Promise<{ record: EventAutomationRecord; isNew: boolean; reopened: boolean }> {
  const nowIso = new Date().toISOString();
  const materialHash = computeMaterialHash(input.payload);
  const payloadJson = JSON.stringify(input.payload);

  const existing = await queryOne<EventAutomationRecord>(
    'SELECT * FROM event_automations WHERE event_id = ? AND fingerprint = ?',
    [input.eventId, input.fingerprint]
  );

  if (!existing) {
    // New automation detected
    const id = `auto_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await execute(
      `INSERT INTO event_automations (
        id, event_id, rule_id, signal_type, fingerprint, title, summary, description,
        severity, status, entity_type, entity_id, payload_json, proposed_action_key,
        proposed_action_payload, action_target_route, action_target_label,
        first_detected_at, last_detected_at, resolved_at, acknowledged_at,
        cooldown_until, material_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
      [
        id,
        input.eventId,
        input.ruleId,
        input.signalType,
        input.fingerprint,
        input.title,
        input.summary,
        input.description || null,
        input.severity,
        'active',
        input.entityType || null,
        input.entityId || null,
        payloadJson,
        input.proposedActionKey || null,
        input.proposedActionPayload || null,
        input.actionTargetRoute || null,
        input.actionTargetLabel || null,
        nowIso, // first_detected_at
        nowIso, // last_detected_at
        materialHash,
        nowIso,
        nowIso
      ]
    );

    const created = await queryOne<EventAutomationRecord>(
      'SELECT * FROM event_automations WHERE id = ?',
      [id]
    );
    return { record: created!, isNew: true, reopened: false };
  }

  // Record already exists: evaluate state transitions
  const isCooldownActive = existing.cooldown_until && new Date(existing.cooldown_until).getTime() > Date.now();
  const materiallyChanged = existing.material_hash !== materialHash;

  let newStatus = existing.status;
  let reopened = false;

  if (existing.status === 'resolved') {
    // Condition reappeared: reopen it
    newStatus = 'active';
    reopened = true;
  } else if (existing.status === 'acknowledged' || existing.status === 'dismissed') {
    if (materiallyChanged) {
      // Condition materially worsened/changed: break cooldown and reactivate
      newStatus = 'active';
      reopened = true;
    } else if (!isCooldownActive) {
      // Cooldown expired: reactivate
      newStatus = 'active';
    }
  }

  // Update existing record (deduplicated update)
  await execute(
    `UPDATE event_automations SET
      rule_id = ?,
      signal_type = ?,
      title = ?,
      summary = ?,
      description = ?,
      severity = ?,
      status = ?,
      entity_type = ?,
      entity_id = ?,
      payload_json = ?,
      proposed_action_key = ?,
      proposed_action_payload = ?,
      action_target_route = ?,
      action_target_label = ?,
      last_detected_at = ?,
      resolved_at = CASE WHEN status = 'resolved' AND ? != 'resolved' THEN NULL ELSE resolved_at END,
      material_hash = ?,
      updated_at = ?
    WHERE id = ?`,
    [
      input.ruleId,
      input.signalType,
      input.title,
      input.summary,
      input.description || null,
      input.severity,
      newStatus,
      input.entityType || null,
      input.entityId || null,
      payloadJson,
      input.proposedActionKey || null,
      input.proposedActionPayload || null,
      input.actionTargetRoute || null,
      input.actionTargetLabel || null,
      nowIso,
      newStatus,
      materialHash,
      nowIso,
      existing.id
    ]
  );

  const updated = await queryOne<EventAutomationRecord>(
    'SELECT * FROM event_automations WHERE id = ?',
    [existing.id]
  );
  return { record: updated!, isNew: false, reopened };
}

/**
 * Automatically marks active automations as 'resolved' when their condition
 * is no longer detected during the current evaluation cycle.
 */
export async function autoResolveMissingAutomations(
  eventId: string,
  activeFingerprints: string[]
): Promise<number> {
  const nowIso = new Date().toISOString();

  // Find all active or acknowledged automations for this event
  const activeRecords = await query<EventAutomationRecord>(
    "SELECT id, fingerprint FROM event_automations WHERE event_id = ? AND status IN ('active', 'acknowledged')",
    [eventId]
  );

  const activeSet = new Set(activeFingerprints);
  const toResolve = activeRecords.filter(r => !activeSet.has(r.fingerprint));

  if (toResolve.length === 0) {
    return 0;
  }

  for (const record of toResolve) {
    await execute(
      "UPDATE event_automations SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?",
      [nowIso, nowIso, record.id]
    );
  }

  return toResolve.length;
}

/**
 * Acknowledges an automation item with a cooldown window.
 */
export async function acknowledgeAutomation(
  id: string,
  eventId: string,
  cooldownMinutes: number = 60
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60000).toISOString();

  const res = await execute(
    `UPDATE event_automations 
     SET status = 'acknowledged', acknowledged_at = ?, cooldown_until = ?, updated_at = ?
     WHERE id = ? AND event_id = ?`,
    [nowIso, cooldownUntil, nowIso, id, eventId]
  );
  return (res as any)?.changes > 0 || (res as any)?.rowCount > 0;
}

/**
 * Dismisses an automation item with a cooldown window.
 */
export async function dismissAutomation(
  id: string,
  eventId: string,
  cooldownMinutes: number = 120
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60000).toISOString();

  const res = await execute(
    `UPDATE event_automations 
     SET status = 'dismissed', cooldown_until = ?, updated_at = ?
     WHERE id = ? AND event_id = ?`,
    [cooldownUntil, nowIso, id, eventId]
  );
  return (res as any)?.changes > 0 || (res as any)?.rowCount > 0;
}
