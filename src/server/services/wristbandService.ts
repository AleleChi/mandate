import crypto from 'crypto';
import { execute, query, queryOne, transaction } from '../db';

export type WristbandStatus = 'prepared' | 'available' | 'active' | 'lost' | 'damaged' | 'decommissioned';

export const VALID_WRISTBAND_STATUSES: readonly WristbandStatus[] = [
  'prepared',
  'available',
  'active',
  'lost',
  'damaged',
  'decommissioned'
] as const;

export interface WristbandRow {
  id: string;
  event_id: string;
  wristband_code: string;
  nfc_uid: string | null;
  status: WristbandStatus;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChildWristbandAssignmentRow {
  id: string;
  event_id: string;
  child_event_entry_id: string;
  wristband_id: string;
  assigned_by_user_id: string | null;
  assigned_at: string;
  deactivated_at: string | null;
  deactivated_by_user_id: string | null;
  deactivation_reason: string | null;
  created_at: string;
}

/**
 * Normalizes an NFC UID to a canonical deterministic representation.
 *
 * Hardware is not yet selected, so this does NOT:
 * - Assume a single exact byte length (e.g. supports 4, 7, 8, 10 bytes or any valid hex string)
 * - Assume one reader vendor or Web NFC only
 * - Convert hexadecimal to decimal
 * - Reverse byte endianness
 *
 * This safely canonicalizes superficial formatting:
 * - Trims leading and trailing whitespace
 * - Strips common superficial separators (colons, hyphens, spaces, dots)
 * - Converts all characters to uppercase
 * - Validates hexadecimal character set
 */
export function normalizeNfcUid(rawUid: string | null | undefined): string {
  if (!rawUid || typeof rawUid !== 'string') {
    throw new Error('NFC UID is required and must be a non-empty string');
  }

  const cleaned = rawUid
    .trim()
    .replace(/[:\-\s.]/g, '')
    .toUpperCase();

  if (cleaned.length === 0) {
    throw new Error('NFC UID cannot be empty after stripping separators');
  }

  // Must contain only hexadecimal characters
  if (!/^[0-9A-F]+$/.test(cleaned)) {
    throw new Error(`Invalid NFC UID format: contains non-hexadecimal characters (${rawUid})`);
  }

  return cleaned;
}

/**
 * Checks whether a given string is a valid NFC UID after normalization.
 */
export function isValidNfcUid(rawUid: string | null | undefined): boolean {
  try {
    normalizeNfcUid(rawUid);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates whether the given string is an approved physical wristband inventory status.
 */
export function isValidWristbandStatus(status: unknown): status is WristbandStatus {
  return typeof status === 'string' && VALID_WRISTBAND_STATUSES.includes(status as WristbandStatus);
}

/**
 * Validates human-operational wristband code format.
 * Operational codes must be non-empty and must NOT contain PII.
 */
export function isValidWristbandCode(code: string | null | undefined): boolean {
  if (!code || typeof code !== 'string') return false;
  const trimmed = code.trim();
  return trimmed.length >= 3 && trimmed.length <= 64;
}

/**
 * Provision / register a physical wristband into an event's inventory context.
 * Strictly PII-free.
 */
export async function createWristband(params: {
  eventId: string;
  wristbandCode: string;
  nfcUid: string;
  status?: WristbandStatus;
  createdByUserId?: string | null;
  id?: string;
}): Promise<WristbandRow> {
  const { eventId, wristbandCode, nfcUid, status = 'available', createdByUserId = null } = params;

  if (!eventId) throw new Error('eventId is required');
  if (!isValidWristbandCode(wristbandCode)) {
    throw new Error('Invalid wristband_code: must be a non-empty string between 3 and 64 characters');
  }
  const canonicalUid = normalizeNfcUid(nfcUid);

  if (!isValidWristbandStatus(status)) {
    throw new Error(`Invalid wristband status: ${status}. Must be one of: ${VALID_WRISTBAND_STATUSES.join(', ')}`);
  }

  const id = params.id || `wb-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  await execute(`
    INSERT INTO wristbands (
      id, event_id, wristband_code, nfc_uid, status,
      created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, eventId, wristbandCode.trim(), canonicalUid, status, createdByUserId, now, now]);

  const created = await getWristbandById(id);
  if (!created) {
    throw new Error('Failed to retrieve newly created wristband');
  }
  return created;
}

/**
 * Retrieve a wristband record by primary key id.
 */
export async function getWristbandById(id: string): Promise<WristbandRow | null> {
  return queryOne<WristbandRow>('SELECT * FROM wristbands WHERE id = ?', [id]);
}

/**
 * Lookup a wristband by event and NFC UID (using canonical normalization).
 */
export async function getWristbandByNfcUid(eventId: string, rawUid: string): Promise<WristbandRow | null> {
  const canonicalUid = normalizeNfcUid(rawUid);
  return queryOne<WristbandRow>(
    'SELECT * FROM wristbands WHERE event_id = ? AND nfc_uid = ?',
    [eventId, canonicalUid]
  );
}

/**
 * Lookup a wristband by event and human-operational wristband code.
 */
export async function getWristbandByCode(eventId: string, code: string): Promise<WristbandRow | null> {
  return queryOne<WristbandRow>(
    'SELECT * FROM wristbands WHERE event_id = ? AND wristband_code = ?',
    [eventId, code.trim()]
  );
}

/**
 * Update the inventory status of a physical wristband.
 */
export async function updateWristbandStatus(wristbandId: string, status: WristbandStatus): Promise<void> {
  if (!isValidWristbandStatus(status)) {
    throw new Error(`Invalid wristband status: ${status}`);
  }
  const now = new Date().toISOString();
  await execute('UPDATE wristbands SET status = ?, updated_at = ? WHERE id = ?', [status, now, wristbandId]);
}

/**
 * Retrieve the current active assignment for a child event entry (if any).
 */
export async function getActiveAssignmentForEntry(childEventEntryId: string): Promise<ChildWristbandAssignmentRow | null> {
  return queryOne<ChildWristbandAssignmentRow>(
    'SELECT * FROM child_wristband_assignments WHERE child_event_entry_id = ? AND deactivated_at IS NULL',
    [childEventEntryId]
  );
}

/**
 * Retrieve the current active assignment for a wristband (if any).
 */
export async function getActiveAssignmentForWristband(wristbandId: string): Promise<ChildWristbandAssignmentRow | null> {
  return queryOne<ChildWristbandAssignmentRow>(
    'SELECT * FROM child_wristband_assignments WHERE wristband_id = ? AND deactivated_at IS NULL',
    [wristbandId]
  );
}

/**
 * Create a new assignment between a child event entry and a physical wristband.
 * Database invariants guarantee at most one active band per child and at most one child per band.
 */
export async function createAssignment(params: {
  eventId: string;
  childEventEntryId: string;
  wristbandId: string;
  assignedByUserId?: string | null;
  assignedAt?: string;
  id?: string;
}): Promise<ChildWristbandAssignmentRow> {
  const { eventId, childEventEntryId, wristbandId, assignedByUserId = null } = params;
  const id = params.id || `cwa-${crypto.randomUUID()}`;
  const assignedAt = params.assignedAt || new Date().toISOString();
  const createdAt = assignedAt;

  await execute(`
    INSERT INTO child_wristband_assignments (
      id, event_id, child_event_entry_id, wristband_id,
      assigned_by_user_id, assigned_at, deactivated_at,
      deactivated_by_user_id, deactivation_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
  `, [id, eventId, childEventEntryId, wristbandId, assignedByUserId, assignedAt, createdAt]);

  const created = await queryOne<ChildWristbandAssignmentRow>(
    'SELECT * FROM child_wristband_assignments WHERE id = ?',
    [id]
  );
  if (!created) {
    throw new Error('Failed to retrieve newly created assignment');
  }
  return created;
}

/**
 * Deactivates an active assignment without mutating historical details.
 */
export async function deactivateAssignment(params: {
  assignmentId: string;
  deactivatedByUserId?: string | null;
  deactivationReason?: string;
  deactivatedAt?: string;
}): Promise<void> {
  const { assignmentId, deactivatedByUserId = null, deactivationReason = 'deactivated' } = params;
  const deactivatedAt = params.deactivatedAt || new Date().toISOString();

  await execute(`
    UPDATE child_wristband_assignments
    SET deactivated_at = ?,
        deactivated_by_user_id = ?,
        deactivation_reason = ?
    WHERE id = ? AND deactivated_at IS NULL
  `, [deactivatedAt, deactivatedByUserId, deactivationReason, assignmentId]);
}

/**
 * Retrieve immutable chronological assignment history for a child event entry.
 */
export async function getAssignmentHistoryForEntry(childEventEntryId: string): Promise<ChildWristbandAssignmentRow[]> {
  return query<ChildWristbandAssignmentRow>(
    'SELECT * FROM child_wristband_assignments WHERE child_event_entry_id = ? ORDER BY assigned_at ASC',
    [childEventEntryId]
  );
}

/**
 * Retrieve immutable chronological assignment history for an entire event.
 */
export async function getAssignmentHistoryForEvent(eventId: string): Promise<ChildWristbandAssignmentRow[]> {
  return query<ChildWristbandAssignmentRow>(
    'SELECT * FROM child_wristband_assignments WHERE event_id = ? ORDER BY assigned_at ASC',
    [eventId]
  );
}

// =============================================================================
// TGA 2026 PHASE 2A: BACKEND INVENTORY + LOOKUP + BINDING DOMAIN ENGINE
// =============================================================================

export class WristbandDomainError extends Error {
  code: string;
  status: number;
  details?: any;

  constructor(message: string, code: string, status: number = 400, details?: any) {
    super(message);
    this.name = 'WristbandDomainError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const ELIGIBLE_CHILD_ENTRY_STATUSES: readonly string[] = [
  'selected',
  'pass_ready',
  'checked_in'
] as const;

export interface ActorContext {
  id: string;
  role: string;
  email?: string;
}

export interface ProvisionWristbandParams {
  eventId: string;
  nfcUid: string;
  wristbandCode?: string;
  actor: ActorContext;
}

export interface WristbandLookupResult {
  id: string;
  eventId: string;
  wristbandCode: string;
  nfcUid: string;
  status: WristbandStatus;
  isAssigned: boolean;
  assignedChildEventEntryId: string | null;
  assignedAt: string | null;
}

export interface BindWristbandParams {
  eventId: string;
  childEventEntryId: string;
  nfcUid?: string;
  wristbandId?: string;
  wristbandCode?: string;
  idempotencyKey?: string;
  actor: ActorContext;
}

export interface BindWristbandResult {
  success: boolean;
  assignment: ChildWristbandAssignmentRow;
  wristband: {
    id: string;
    wristbandCode: string;
    status: WristbandStatus;
    nfcUid: string;
  };
  childEventEntryId: string;
  eventId: string;
}

/**
 * Ensures the supporting tables for sequence counter and binding idempotency exist.
 */
export async function ensureSupportingTables(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS event_wristband_sequences (
      event_id TEXT PRIMARY KEY,
      next_seq INTEGER NOT NULL DEFAULT 1
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS wristband_binding_idempotency (
      idempotency_key TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      child_event_entry_id TEXT NOT NULL,
      wristband_id TEXT NOT NULL,
      response_payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS wristband_operation_idempotency (
      idempotency_key TEXT PRIMARY KEY,
      operation_type TEXT NOT NULL,
      event_id TEXT NOT NULL,
      request_payload_hash TEXT NOT NULL,
      response_payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

/**
 * Records an immutable audit log entry using existing audit architecture.
 * Strictly PII-free.
 */
export async function recordAuditLog(params: {
  userId: string | null;
  userRole: string;
  action: string;
  targetType: string;
  targetId: string;
  details: any;
}): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await execute(`
      INSERT INTO audit_logs (
        id, user_id, user_role, action, target_type, target_id, details, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      params.userId,
      params.userRole,
      params.action,
      params.targetType,
      params.targetId,
      JSON.stringify(params.details),
      now
    ]);
  } catch (err) {
    console.error('[Wristband Audit] Failed to record audit log:', err);
  }
}

/**
 * Asserts that the actor is authorized to provision inventory.
 * Admin / Super Admin only.
 */
export function assertCanProvisionWristband(actor: ActorContext): void {
  if (actor.role === 'admin' || actor.role === 'super_admin') {
    return;
  }
  throw new WristbandDomainError(
    'Only administrators can provision physical wristbands',
    'FORBIDDEN',
    403
  );
}

/**
 * Asserts that the actor is authorized to bind a wristband to a child entry.
 * Allowed: Admin, Super Admin, or approved Volunteer with active check-in duty assignment.
 */
export async function assertCanBindWristband(actor: ActorContext, eventId: string): Promise<void> {
  if (actor.role === 'admin' || actor.role === 'super_admin') {
    return;
  }

  if (actor.role === 'volunteer') {
    // 1. Volunteer profile must be approved and active
    const profile = await queryOne<{ status: string; is_deleted: number }>(
      'SELECT status, is_deleted FROM volunteer_profiles WHERE user_id = ?',
      [actor.id]
    );
    if (!profile || profile.is_deleted === 1 || profile.status !== 'approved') {
      throw new WristbandDomainError(
        'Volunteer profile must be approved to bind wristbands',
        'FORBIDDEN',
        403
      );
    }

    // 2. Must be actively assigned to duty for THIS event
    const assignment = await queryOne<{
      id: string;
      responsibility_key: string;
      team_key: string;
      status: string;
    }>(
      "SELECT id, responsibility_key, team_key, status FROM event_duty_assignments WHERE event_id = ? AND user_id = ? AND status NOT IN ('cancelled', 'ended')",
      [eventId, actor.id]
    );

    if (!assignment) {
      throw new WristbandDomainError(
        'Volunteer is not assigned to duty for this event',
        'FORBIDDEN',
        403
      );
    }

    // 3. Must have an authentic check-in / arrival / gate duty role
    const key = (assignment.responsibility_key || '').trim().toLowerCase();
    const team = (assignment.team_key || '').trim().toLowerCase();

    // Canonical responsibility keys in Koinonia check-in operations:
    const CANONICAL_CHECKIN_RESPONSIBILITIES = [
      'gate/check-in lead',
      'gate_lead',
      'gate_volunteer',
      'check_in_lead',
      'check_in_volunteer',
      'check_in',
      'arrival_lead',
      'arrival_volunteer',
      'registration'
    ];

    // Canonical check-in operational teams:
    const CANONICAL_CHECKIN_TEAMS = [
      'check_in',
      'gate',
      'arrival',
      'registration'
    ];

    const isAuthorizedDuty =
      CANONICAL_CHECKIN_RESPONSIBILITIES.includes(key) ||
      CANONICAL_CHECKIN_TEAMS.includes(team) ||
      (key.includes('check') && key.includes('in')) ||
      key.includes('gate') ||
      key.includes('arrival');

    if (!isAuthorizedDuty) {
      throw new WristbandDomainError(
        'Volunteer is not assigned to check-in duty',
        'FORBIDDEN',
        403
      );
    }

    return;
  }

  throw new WristbandDomainError('Unauthorized role for wristband binding', 'FORBIDDEN', 403);
}

/**
 * Safely generates a batch of consecutive event-scoped human-readable wristband codes (e.g. WB-000001).
 * Protected against race conditions using a sequence counter table.
 * Uses SELECT FOR UPDATE under PostgreSQL and serialized transactional execution in SQLite.
 */
export async function generateNextWristbandCodes(eventId: string, count: number): Promise<string[]> {
  if (count <= 0) return [];
  await ensureSupportingTables();

  const isPg = Boolean(
    process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.startsWith('postgres://') || process.env.DATABASE_URL.startsWith('postgresql://'))
  );

  const lockSql = isPg
    ? 'SELECT next_seq FROM event_wristband_sequences WHERE event_id = ? FOR UPDATE'
    : 'SELECT next_seq FROM event_wristband_sequences WHERE event_id = ?';

  const seqRow = await queryOne<{ next_seq: number }>(lockSql, [eventId]);

  let startSeq: number;
  if (!seqRow) {
    // Find current max sequence from existing wristbands for this event
    const rows = await query<{ wristband_code: string }>(
      "SELECT wristband_code FROM wristbands WHERE event_id = ? AND wristband_code LIKE 'WB-%'",
      [eventId]
    );
    let maxNum = 0;
    for (const r of rows) {
      const match = r.wristband_code.match(/^WB-(\d+)$/i);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    }
    startSeq = maxNum + 1;
    await execute(
      'INSERT INTO event_wristband_sequences (event_id, next_seq) VALUES (?, ?)',
      [eventId, startSeq + count]
    );
  } else {
    startSeq = seqRow.next_seq;
    await execute(
      'UPDATE event_wristband_sequences SET next_seq = next_seq + ? WHERE event_id = ?',
      [count, eventId]
    );
  }

  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(`WB-${String(startSeq + i).padStart(6, '0')}`);
  }
  return codes;
}

/**
 * Safely generates the next event-scoped human-readable wristband code (e.g. WB-000001).
 * Protected against race conditions using a sequence counter table.
 */
export async function generateNextWristbandCode(eventId: string): Promise<string> {
  const codes = await generateNextWristbandCodes(eventId, 1);
  return codes[0];
}

/**
 * Provision / register a physical wristband into an event's inventory context.
 * Strictly PII-free.
 */
export async function provisionWristband(params: ProvisionWristbandParams): Promise<WristbandRow> {
  const { eventId, nfcUid, wristbandCode, actor } = params;

  // 1. Authorization: Admin / Super Admin only
  assertCanProvisionWristband(actor);

  // 2. Validate Event
  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw new WristbandDomainError('eventId is required', 'EVENT_REQUIRED', 400);
  }
  const event = await queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM events WHERE id = ?',
    [eventId]
  );
  if (!event) {
    throw new WristbandDomainError(`Event not found: ${eventId}`, 'EVENT_NOT_FOUND', 404);
  }
  if (['archived', 'closed', 'ended'].includes(event.status)) {
    throw new WristbandDomainError(`Event is inactive (status: ${event.status})`, 'EVENT_INACTIVE', 400);
  }

  // 3. Normalize NFC UID
  let canonicalUid: string;
  try {
    canonicalUid = normalizeNfcUid(nfcUid);
  } catch (err: any) {
    throw new WristbandDomainError(err.message, 'INVALID_NFC_UID', 400);
  }

  // 4. Duplicate NFC UID in same event check
  const existingWithUid = await queryOne(
    'SELECT id FROM wristbands WHERE event_id = ? AND nfc_uid = ?',
    [eventId, canonicalUid]
  );
  if (existingWithUid) {
    throw new WristbandDomainError(
      'A wristband with this NFC UID is already registered in this event.',
      'WRISTBAND_ALREADY_REGISTERED',
      409
    );
  }

  // 5. Code resolution
  let code = wristbandCode ? wristbandCode.trim() : '';
  if (code) {
    if (!isValidWristbandCode(code)) {
      throw new WristbandDomainError(
        'Invalid wristband code format. Must be between 3 and 64 characters.',
        'INVALID_WRISTBAND_CODE',
        400
      );
    }
    const existingWithCode = await queryOne(
      'SELECT id FROM wristbands WHERE event_id = ? AND wristband_code = ?',
      [eventId, code]
    );
    if (existingWithCode) {
      throw new WristbandDomainError(
        'A wristband with this code is already registered in this event.',
        'WRISTBAND_ALREADY_REGISTERED',
        409
      );
    }
  }

  await ensureSupportingTables();

  return transaction(async () => {
    // If no code provided, generate next unique sequence code inside transaction
    if (!code) {
      let attempts = 0;
      while (attempts < 10) {
        attempts++;
        const candidateCode = await generateNextWristbandCode(eventId);
        const existing = await queryOne(
          'SELECT id FROM wristbands WHERE event_id = ? AND wristband_code = ?',
          [eventId, candidateCode]
        );
        if (!existing) {
          code = candidateCode;
          break;
        }
      }
      if (!code) {
        throw new WristbandDomainError('Failed to generate unique wristband code', 'CODE_GENERATION_FAILED', 500);
      }
    }

    const id = `wb-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    try {
      await execute(`
        INSERT INTO wristbands (
          id, event_id, wristband_code, nfc_uid, status,
          created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'available', ?, ?, ?)
      `, [id, eventId, code, canonicalUid, actor.id || null, now, now]);
    } catch (err: any) {
      if (err?.message?.includes('UNIQUE') || err?.message?.includes('uq_wristbands')) {
        throw new WristbandDomainError(
          'A wristband with this NFC UID or code already exists in this event.',
          'WRISTBAND_ALREADY_REGISTERED',
          409
        );
      }
      throw err;
    }

    // Write audit record
    await recordAuditLog({
      userId: actor.id || null,
      userRole: actor.role || 'admin',
      action: 'WRISTBAND_PROVISIONED',
      targetType: 'wristband',
      targetId: id,
      details: {
        eventId,
        wristbandCode: code,
        nfcUid: canonicalUid,
        status: 'available'
      }
    });

    const created = await getWristbandById(id);
    if (!created) {
      throw new WristbandDomainError('Failed to load created wristband', 'INTERNAL_ERROR', 500);
    }
    return created;
  });
}

export interface PrepareWristbandParams {
  eventId: string;
  nfcUid: string;
  actor: ActorContext;
}

export interface PrepareWristbandResult {
  wristband: WristbandRow;
  wristbandCode: string;
  nfcUid: string;
  status: 'prepared';
  eventId: string;
}

/**
 * High-speed scan and prepare physical wristband.
 * Associates a raw NFC UID with an auto-generated Koinonia WB code in 'prepared' state.
 * Strictly PII-free. Does NOT assign a child.
 */
export async function prepareWristband(params: PrepareWristbandParams): Promise<PrepareWristbandResult> {
  const { eventId, nfcUid, actor } = params;

  // 1. Authorization: Admin / Super Admin only
  assertCanProvisionWristband(actor);

  // 2. Validate Event
  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw new WristbandDomainError('eventId is required', 'EVENT_REQUIRED', 400);
  }
  const event = await queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM events WHERE id = ?',
    [eventId]
  );
  if (!event) {
    throw new WristbandDomainError(`Event not found: ${eventId}`, 'EVENT_NOT_FOUND', 404);
  }
  if (['archived', 'closed', 'ended'].includes(event.status)) {
    throw new WristbandDomainError(`Event is inactive (status: ${event.status})`, 'EVENT_INACTIVE', 400);
  }

  // 3. Normalize NFC UID using existing normalizeNfcUid()
  let canonicalUid: string;
  try {
    canonicalUid = normalizeNfcUid(nfcUid);
  } catch (err: any) {
    throw new WristbandDomainError(err.message, 'INVALID_NFC_UID', 400);
  }

  // 4. Reject duplicate UID in same event
  const existingWithUid = await queryOne<WristbandRow>(
    'SELECT id, wristband_code, status FROM wristbands WHERE event_id = ? AND nfc_uid = ?',
    [eventId, canonicalUid]
  );
  if (existingWithUid) {
    throw new WristbandDomainError(
      'A wristband with this NFC UID is already registered in this event.',
      'WRISTBAND_ALREADY_REGISTERED',
      409,
      { existingCode: existingWithUid.wristband_code, existingStatus: existingWithUid.status }
    );
  }

  await ensureSupportingTables();

  return transaction(async () => {
    // 5. Generate next concurrency-safe WB code
    let code = '';
    let attempts = 0;
    while (attempts < 10) {
      attempts++;
      const candidateCode = await generateNextWristbandCode(eventId);
      const existing = await queryOne(
        'SELECT id FROM wristbands WHERE event_id = ? AND wristband_code = ?',
        [eventId, candidateCode]
      );
      if (!existing) {
        code = candidateCode;
        break;
      }
    }
    if (!code) {
      throw new WristbandDomainError('Failed to generate unique wristband code', 'CODE_GENERATION_FAILED', 500);
    }

    const id = `wb-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    try {
      await execute(`
        INSERT INTO wristbands (
          id, event_id, wristband_code, nfc_uid, status,
          created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'prepared', ?, ?, ?)
      `, [id, eventId, code, canonicalUid, actor.id || null, now, now]);
    } catch (err: any) {
      if (err?.message?.includes('UNIQUE') || err?.message?.includes('uq_wristbands')) {
        throw new WristbandDomainError(
          'A wristband with this NFC UID or code already exists in this event.',
          'WRISTBAND_ALREADY_REGISTERED',
          409
        );
      }
      throw err;
    }

    // 6. Audit WRISTBAND_PREPARED
    await recordAuditLog({
      userId: actor.id || null,
      userRole: actor.role || 'admin',
      action: 'WRISTBAND_PREPARED',
      targetType: 'wristband',
      targetId: id,
      details: {
        eventId,
        wristbandCode: code,
        nfcUid: canonicalUid,
        status: 'prepared'
      }
    });

    const created = await getWristbandById(id);
    if (!created) {
      throw new WristbandDomainError('Failed to load created wristband', 'INTERNAL_ERROR', 500);
    }

    return {
      wristband: created,
      wristbandCode: code,
      nfcUid: canonicalUid,
      status: 'prepared',
      eventId
    };
  });
}

export interface VerifyWristbandParams {
  eventId: string;
  wristbandCode: string;
  nfcUid: string;
  actor: ActorContext;
}

export interface VerifyWristbandResult {
  wristband: WristbandRow;
  status: 'available';
  verified: true;
  message: string;
}

/**
 * Verifies a physical wristband by cross-checking its printed WB code against its embedded NFC UID.
 * Only prepared wristbands can be verified.
 * Atomic status transition: prepared -> available.
 */
export async function verifyWristband(params: VerifyWristbandParams): Promise<VerifyWristbandResult> {
  const { eventId, wristbandCode, nfcUid, actor } = params;

  // 1. Authorization: Admin / Super Admin only
  assertCanProvisionWristband(actor);

  // 2. Validate Event
  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw new WristbandDomainError('eventId is required', 'EVENT_REQUIRED', 400);
  }
  const event = await queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM events WHERE id = ?',
    [eventId]
  );
  if (!event) {
    throw new WristbandDomainError(`Event not found: ${eventId}`, 'EVENT_NOT_FOUND', 404);
  }

  // 3. Normalize UID and Code
  if (!wristbandCode || typeof wristbandCode !== 'string' || !wristbandCode.trim()) {
    throw new WristbandDomainError('wristbandCode is required', 'WRISTBAND_CODE_REQUIRED', 400);
  }
  const code = wristbandCode.trim();

  let canonicalUid: string;
  try {
    canonicalUid = normalizeNfcUid(nfcUid);
  } catch (err: any) {
    throw new WristbandDomainError(err.message, 'INVALID_NFC_UID', 400);
  }

  // 4. Query record by code and event
  const rowByCode = await queryOne<WristbandRow>(
    'SELECT * FROM wristbands WHERE event_id = ? AND UPPER(wristband_code) = UPPER(?)',
    [eventId, code]
  );

  // Check if code exists in another event
  if (!rowByCode) {
    const otherEventRow = await queryOne<{ event_id: string }>(
      'SELECT event_id FROM wristbands WHERE UPPER(wristband_code) = UPPER(?)',
      [code]
    );
    if (otherEventRow && otherEventRow.event_id !== eventId) {
      throw new WristbandDomainError('Wristband belongs to a different event', 'EVENT_MISMATCH', 400);
    }
    throw new WristbandDomainError(`Wristband with code "${code}" not found for this event`, 'WRISTBAND_NOT_FOUND', 404);
  }

  // 5. Must currently be 'prepared'
  if (rowByCode.status !== 'prepared') {
    if (rowByCode.status === 'available') {
      throw new WristbandDomainError('Wristband has already been verified and is available', 'ALREADY_AVAILABLE', 400);
    }
    if (rowByCode.status === 'active') {
      throw new WristbandDomainError('Cannot verify an active wristband that is assigned to a child', 'INVALID_STATUS', 400);
    }
    if (rowByCode.status === 'lost') {
      throw new WristbandDomainError('Cannot verify a lost wristband', 'INVALID_STATUS', 400);
    }
    if (rowByCode.status === 'damaged') {
      throw new WristbandDomainError('Cannot verify a damaged wristband', 'INVALID_STATUS', 400);
    }
    if (rowByCode.status === 'decommissioned') {
      throw new WristbandDomainError('Cannot verify a decommissioned wristband', 'INVALID_STATUS', 400);
    }
    throw new WristbandDomainError(
      `Wristband cannot be verified from status "${rowByCode.status}". Only prepared wristbands can be verified.`,
      'INVALID_STATUS',
      400
    );
  }

  // 6. Check physical match: code + UID must belong to the exact same row
  if (rowByCode.nfc_uid.toUpperCase() !== canonicalUid.toUpperCase()) {
    // MISMATCH: DO NOT change status!
    throw new WristbandDomainError(
      'This wristband does not match the printed code.',
      'VERIFICATION_MISMATCH',
      400,
      { expectedUidEnding: rowByCode.nfc_uid.slice(-4), scannedUidEnding: canonicalUid.slice(-4) }
    );
  }

  // 7. Atomic update: prepared -> available
  const now = new Date().toISOString();
  return transaction(async () => {
    await execute(`
      UPDATE wristbands
      SET status = 'available', updated_at = ?
      WHERE id = ? AND status = 'prepared'
    `, [now, rowByCode.id]);

    // 8. Audit WRISTBAND_VERIFIED
    await recordAuditLog({
      userId: actor.id || null,
      userRole: actor.role || 'admin',
      action: 'WRISTBAND_VERIFIED',
      targetType: 'wristband',
      targetId: rowByCode.id,
      details: {
        eventId,
        wristbandCode: rowByCode.wristband_code,
        nfcUid: canonicalUid,
        previousStatus: 'prepared',
        status: 'available'
      }
    });

    const updated = await getWristbandById(rowByCode.id);
    if (!updated || updated.status !== 'available') {
      throw new WristbandDomainError('Failed to update wristband status to available', 'INTERNAL_ERROR', 500);
    }

    return {
      wristband: updated,
      status: 'available',
      verified: true,
      message: `Wristband ${updated.wristband_code} verified successfully and is now available.`
    };
  });
}

export interface GenerateCodeOnlyWristbandBatchParams {
  eventId: string;
  quantity: number;
  actor: ActorContext;
}

export interface GenerateCodeOnlyWristbandBatchResult {
  success: boolean;
  totalGenerated: number;
  rangeStart: string;
  rangeEnd: string;
  wristbandCodes: string[];
  eventId: string;
  eventName: string;
  message: string;
}

/**
 * Generates an event-scoped batch of code-only wristbands in 'prepared' state without NFC hardware.
 * Uses consecutive sequential WB codes (WB-000001, etc.) from the event-scoped sequence.
 * Strictly PII-free.
 */
export async function generateCodeOnlyWristbandBatch(
  params: GenerateCodeOnlyWristbandBatchParams
): Promise<GenerateCodeOnlyWristbandBatchResult> {
  const { eventId, quantity, actor } = params;

  // 1. Authorization: Admin / Super Admin only
  assertCanProvisionWristband(actor);

  // 2. Validate Event
  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw new WristbandDomainError('eventId is required', 'EVENT_REQUIRED', 400);
  }
  const cleanEventId = eventId.trim();
  const event = await queryOne<{ id: string; status: string; title?: string }>(
    'SELECT id, status, title FROM events WHERE id = ?',
    [cleanEventId]
  );
  if (!event) {
    throw new WristbandDomainError(`Event not found: ${cleanEventId}`, 'EVENT_NOT_FOUND', 404);
  }
  if (['archived', 'closed', 'ended'].includes(event.status)) {
    throw new WristbandDomainError(`Event is inactive (status: ${event.status})`, 'EVENT_INACTIVE', 400);
  }

  // 3. Validate quantity
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new WristbandDomainError('Quantity must be a positive integer', 'INVALID_QUANTITY', 400);
  }
  if (quantity > 5000) {
    throw new WristbandDomainError('Batch quantity cannot exceed 5000 wristbands', 'QUANTITY_TOO_LARGE', 400);
  }

  await ensureSupportingTables();

  return transaction(async () => {
    // Generate consecutive WB codes atomically using existing sequence
    const codes = await generateNextWristbandCodes(cleanEventId, quantity);
    const now = new Date().toISOString();

    for (const code of codes) {
      const id = `wb-${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO wristbands (
          id, event_id, wristband_code, nfc_uid, status,
          created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, 'prepared', ?, ?, ?)
      `, [id, cleanEventId, code, actor.id || null, now, now]);
    }

    const rangeStart = codes[0];
    const rangeEnd = codes[codes.length - 1];

    // Audit log
    await recordAuditLog({
      userId: actor.id || null,
      userRole: actor.role || 'admin',
      action: 'WRISTBAND_CODES_GENERATED',
      targetType: 'wristband_batch',
      targetId: `${cleanEventId}_${rangeStart}_${rangeEnd}`,
      details: {
        eventId: cleanEventId,
        quantity,
        rangeStart,
        rangeEnd,
        status: 'prepared'
      }
    });

    return {
      success: true,
      totalGenerated: quantity,
      rangeStart,
      rangeEnd,
      wristbandCodes: codes,
      eventId: cleanEventId,
      eventName: event.title || 'TGA 2026',
      message: `Successfully generated ${quantity} wristband codes (${rangeStart} to ${rangeEnd}).`
    };
  });
}

export interface MarkCodeOnlyWristbandsReadyParams {
  eventId: string;
  ids?: string[];
  rangeStart?: string;
  rangeEnd?: string;
  actor: ActorContext;
}

export interface MarkCodeOnlyWristbandsReadyResult {
  success: boolean;
  updatedCount: number;
  message: string;
}

/**
 * Transitions prepared code-only wristbands to 'available' after physical labels are confirmed ready.
 * STRICT INVARIANT:
 * NFC-enabled wristbands CANNOT bypass physical NFC verification through this action.
 * If any selected wristband has an NFC UID, this operation throws NFC_VERIFICATION_REQUIRED.
 */
export async function markCodeOnlyWristbandsReady(
  params: MarkCodeOnlyWristbandsReadyParams
): Promise<MarkCodeOnlyWristbandsReadyResult> {
  const { eventId, ids, rangeStart, rangeEnd, actor } = params;

  // 1. Authorization: Admin / Super Admin only
  assertCanProvisionWristband(actor);

  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw new WristbandDomainError('eventId is required', 'EVENT_REQUIRED', 400);
  }

  const cleanEventId = eventId.trim();

  // Find candidate wristbands
  let sql = 'SELECT id, wristband_code, nfc_uid, status FROM wristbands WHERE event_id = ?';
  const queryParams: any[] = [cleanEventId];

  if (ids && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    sql += ` AND id IN (${placeholders})`;
    queryParams.push(...ids);
  } else if (rangeStart && rangeEnd) {
    sql += ' AND wristband_code >= ? AND wristband_code <= ?';
    queryParams.push(rangeStart.trim().toUpperCase(), rangeEnd.trim().toUpperCase());
  } else {
    // If no specific IDs or range given, target all prepared code-only in this event
    sql += " AND status = 'prepared' AND nfc_uid IS NULL";
  }

  const candidates = await query<WristbandRow>(sql, queryParams);

  if (candidates.length === 0) {
    throw new WristbandDomainError('No matching wristbands found to mark ready.', 'NO_WRISTBANDS_FOUND', 404);
  }

  // Invariant 11: Stricter NFC Check
  // If ANY candidate has nfc_uid IS NOT NULL, reject code-only bypass!
  const nfcBands = candidates.filter(w => w.nfc_uid !== null && w.nfc_uid !== undefined && w.nfc_uid !== '');
  if (nfcBands.length > 0) {
    throw new WristbandDomainError(
      'NFC-enabled wristbands require physical NFC verification and cannot be marked ready via code-only batch readiness.',
      'NFC_VERIFICATION_REQUIRED',
      400,
      { offendingCodes: nfcBands.slice(0, 5).map(b => b.wristband_code) }
    );
  }

  // Filter to those currently 'prepared'
  const preparedCodeOnly = candidates.filter(w => w.status === 'prepared' && !w.nfc_uid);
  if (preparedCodeOnly.length === 0) {
    throw new WristbandDomainError(
      'Selected wristbands are not in prepared status or are already available.',
      'NO_PREPARED_WRISTBANDS',
      400
    );
  }

  const now = new Date().toISOString();
  const updateIds = preparedCodeOnly.map(w => w.id);
  const placeholders = updateIds.map(() => '?').join(',');

  await transaction(async () => {
    await execute(`
      UPDATE wristbands
      SET status = 'available', updated_at = ?
      WHERE id IN (${placeholders}) AND status = 'prepared' AND nfc_uid IS NULL
    `, [now, ...updateIds]);

    await recordAuditLog({
      userId: actor.id || null,
      userRole: actor.role || 'admin',
      action: 'WRISTBAND_CODE_BATCH_READY',
      targetType: 'wristband_batch',
      targetId: `${cleanEventId}_ready_${updateIds.length}`,
      details: {
        eventId: cleanEventId,
        updatedCount: updateIds.length,
        rangeStart: preparedCodeOnly[0]?.wristband_code,
        rangeEnd: preparedCodeOnly[preparedCodeOnly.length - 1]?.wristband_code
      }
    });
  });

  return {
    success: true,
    updatedCount: updateIds.length,
    message: `Successfully marked ${updateIds.length} wristbands ready and available.`
  };
}


/**
 * Event-scoped lookup of a physical wristband by NFC UID.
 * Never allows global UID lookups.
 * Strictly PII-free operational fields.
 */
export async function lookupWristbandByNfcUid(params: {
  eventId: string;
  rawUid: string;
}): Promise<WristbandLookupResult> {
  const { eventId, rawUid } = params;

  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw new WristbandDomainError('eventId is required for NFC lookup', 'EVENT_REQUIRED', 400);
  }

  let canonicalUid: string;
  try {
    canonicalUid = normalizeNfcUid(rawUid);
  } catch (err: any) {
    throw new WristbandDomainError(err.message, 'INVALID_NFC_UID', 400);
  }

  const wristband = await queryOne<WristbandRow>(
    'SELECT * FROM wristbands WHERE event_id = ? AND nfc_uid = ?',
    [eventId.trim(), canonicalUid]
  );
  if (!wristband) {
    throw new WristbandDomainError(
      'Wristband not found in this event context',
      'WRISTBAND_NOT_FOUND',
      404
    );
  }

  const activeAssignment = await getActiveAssignmentForWristband(wristband.id);

  return {
    id: wristband.id,
    eventId: wristband.event_id,
    wristbandCode: wristband.wristband_code,
    nfcUid: wristband.nfc_uid,
    status: wristband.status,
    isAssigned: !!activeAssignment,
    assignedChildEventEntryId: activeAssignment?.child_event_entry_id || null,
    assignedAt: activeAssignment?.assigned_at || null
  };
}

/**
 * Event-scoped lookup of a physical wristband by either NFC UID or printed WB code.
 * Reuses existing canonical NFC normalizer and WB code lookup.
 * Strictly event isolated.
 */
export async function lookupWristbandByIdentifier(params: {
  eventId: string;
  identifier: string;
}): Promise<WristbandLookupResult> {
  const { eventId, identifier } = params;

  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw new WristbandDomainError('eventId is required for wristband lookup', 'EVENT_REQUIRED', 400);
  }
  if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
    throw new WristbandDomainError('identifier is required for wristband lookup', 'IDENTIFIER_REQUIRED', 400);
  }

  const raw = identifier.trim();

  let canonicalUid: string | null = null;
  if (isValidNfcUid(raw)) {
    try {
      canonicalUid = normalizeNfcUid(raw);
    } catch {
      canonicalUid = null;
    }
  }

  let wristband: WristbandRow | null = null;
  if (canonicalUid) {
    wristband = await queryOne<WristbandRow>(
      'SELECT * FROM wristbands WHERE event_id = ? AND nfc_uid = ?',
      [eventId.trim(), canonicalUid]
    );
  }
  if (!wristband) {
    wristband = await queryOne<WristbandRow>(
      'SELECT * FROM wristbands WHERE event_id = ? AND UPPER(wristband_code) = UPPER(?)',
      [eventId.trim(), raw]
    );
  }

  if (!wristband) {
    // Check if it exists in another event to enforce strict event isolation error
    let otherEventWb: WristbandRow | null = null;
    if (canonicalUid) {
      otherEventWb = await queryOne<WristbandRow>(
        'SELECT * FROM wristbands WHERE nfc_uid = ?',
        [canonicalUid]
      );
    }
    if (!otherEventWb) {
      otherEventWb = await queryOne<WristbandRow>(
        'SELECT * FROM wristbands WHERE UPPER(wristband_code) = UPPER(?)',
        [raw]
      );
    }

    if (otherEventWb && otherEventWb.event_id !== eventId.trim()) {
      throw new WristbandDomainError(
        'Wristband belongs to a different event',
        'EVENT_MISMATCH',
        400
      );
    }

    throw new WristbandDomainError(
      'Wristband not found in this event context',
      'WRISTBAND_NOT_FOUND',
      404
    );
  }

  const activeAssignment = await getActiveAssignmentForWristband(wristband.id);

  return {
    id: wristband.id,
    eventId: wristband.event_id,
    wristbandCode: wristband.wristband_code,
    nfcUid: wristband.nfc_uid,
    status: wristband.status,
    isAssigned: !!activeAssignment,
    assignedChildEventEntryId: activeAssignment?.child_event_entry_id || null,
    assignedAt: activeAssignment?.assigned_at || null
  };
}

/**
 * Binds an available wristband to a selected/check-in-ready child entry.
 * Enforces transactional atomicity, idempotency, lifecycle state eligibility, and database invariants.
 */
export async function bindWristbandToChild(params: BindWristbandParams): Promise<BindWristbandResult> {
  const { eventId, childEventEntryId, nfcUid, wristbandId, wristbandCode, idempotencyKey, actor } = params;

  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw new WristbandDomainError('eventId is required', 'EVENT_REQUIRED', 400);
  }
  if (!childEventEntryId || typeof childEventEntryId !== 'string' || !childEventEntryId.trim()) {
    throw new WristbandDomainError('childEventEntryId is required', 'CHILD_ENTRY_REQUIRED', 400);
  }
  if (!nfcUid && !wristbandId && !wristbandCode) {
    throw new WristbandDomainError('Either nfcUid, wristbandId, or wristbandCode must be provided', 'WRISTBAND_REQUIRED', 400);
  }

  await ensureSupportingTables();

  // 1. Idempotency Check
  if (idempotencyKey) {
    const existing = await queryOne<{
      idempotency_key: string;
      event_id: string;
      child_event_entry_id: string;
      wristband_id: string;
      response_payload: string;
    }>('SELECT * FROM wristband_binding_idempotency WHERE idempotency_key = ?', [idempotencyKey]);

    if (existing) {
      const matchesEntry = existing.child_event_entry_id === childEventEntryId;
      const matchesEvent = existing.event_id === eventId;

      let matchesWristband = false;
      if (wristbandId && existing.wristband_id === wristbandId) {
        matchesWristband = true;
      } else if (wristbandCode) {
        const wb = await queryOne<WristbandRow>(
          'SELECT id FROM wristbands WHERE id = ? AND UPPER(wristband_code) = UPPER(?)',
          [existing.wristband_id, wristbandCode.trim()]
        );
        if (wb) matchesWristband = true;
      } else if (nfcUid) {
        const canonicalUid = isValidNfcUid(nfcUid) ? normalizeNfcUid(nfcUid) : null;
        if (canonicalUid) {
          const wb = await queryOne<WristbandRow>(
            'SELECT id FROM wristbands WHERE id = ? AND nfc_uid = ?',
            [existing.wristband_id, canonicalUid]
          );
          if (wb) matchesWristband = true;
        }
      }

      if (matchesEntry && matchesEvent && matchesWristband) {
        return JSON.parse(existing.response_payload) as BindWristbandResult;
      } else {
        throw new WristbandDomainError(
          'Idempotency key has already been used with a different binding payload',
          'IDEMPOTENCY_CONFLICT',
          409
        );
      }
    }
  }

  // 2. Authorization check
  await assertCanBindWristband(actor, eventId);

  return transaction(async () => {
    // 3. Resolve wristband
    let wristband: WristbandRow | null = null;
    if (wristbandId) {
      wristband = await getWristbandById(wristbandId);
      if (!wristband) {
        throw new WristbandDomainError('Wristband not found', 'WRISTBAND_NOT_FOUND', 404);
      }
      if (wristband.event_id !== eventId) {
        throw new WristbandDomainError('Wristband belongs to a different event', 'EVENT_MISMATCH', 400);
      }
    } else if (wristbandCode) {
      const codeTrimmed = wristbandCode.trim();
      wristband = await queryOne<WristbandRow>(
        'SELECT * FROM wristbands WHERE event_id = ? AND UPPER(wristband_code) = UPPER(?)',
        [eventId.trim(), codeTrimmed]
      );
      if (!wristband) {
        const anyWb = await queryOne<WristbandRow>(
          'SELECT * FROM wristbands WHERE UPPER(wristband_code) = UPPER(?)',
          [codeTrimmed]
        );
        if (anyWb && anyWb.event_id !== eventId.trim()) {
          throw new WristbandDomainError('Wristband belongs to a different event', 'EVENT_MISMATCH', 400);
        }
        throw new WristbandDomainError('Wristband not found in this event context', 'WRISTBAND_NOT_FOUND', 404);
      }
    } else if (nfcUid) {
      let canonicalUid: string;
      try {
        canonicalUid = normalizeNfcUid(nfcUid);
      } catch (err: any) {
        throw new WristbandDomainError(err.message, 'INVALID_NFC_UID', 400);
      }
      wristband = await queryOne<WristbandRow>(
        'SELECT * FROM wristbands WHERE event_id = ? AND nfc_uid = ?',
        [eventId, canonicalUid]
      );
      if (!wristband) {
        const anyWb = await queryOne<WristbandRow>(
          'SELECT * FROM wristbands WHERE nfc_uid = ?',
          [canonicalUid]
        );
        if (anyWb && anyWb.event_id !== eventId) {
          throw new WristbandDomainError('Wristband belongs to a different event', 'EVENT_MISMATCH', 400);
        }
        throw new WristbandDomainError('Wristband not found in this event context', 'WRISTBAND_NOT_FOUND', 404);
      }
    }

    if (!wristband) {
      throw new WristbandDomainError('Wristband not found', 'WRISTBAND_NOT_FOUND', 404);
    }

    // 4. Wristband availability check
    if (wristband.status !== 'available') {
      if (wristband.status === 'active') {
        throw new WristbandDomainError('Wristband is already active and assigned', 'WRISTBAND_ALREADY_ASSIGNED', 409);
      }
      if (wristband.status === 'prepared') {
        throw new WristbandDomainError(
          'This wristband has not been verified for use yet.',
          'WRISTBAND_NOT_VERIFIED',
          400
        );
      }
      throw new WristbandDomainError(
        `Wristband is not available (status: ${wristband.status})`,
        'WRISTBAND_NOT_AVAILABLE',
        400
      );
    }

    // 5. Verify wristband has no active assignment
    const activeForBand = await queryOne(
      'SELECT id FROM child_wristband_assignments WHERE wristband_id = ? AND deactivated_at IS NULL',
      [wristband.id]
    );
    if (activeForBand) {
      throw new WristbandDomainError('Wristband is already assigned to a child', 'WRISTBAND_ALREADY_ASSIGNED', 409);
    }

    // 6. Verify child event entry
    const entry = await queryOne<{
      id: string;
      event_id: string;
      status: string;
    }>('SELECT id, event_id, status FROM child_event_entries WHERE id = ?', [childEventEntryId]);

    if (!entry) {
      throw new WristbandDomainError('Child event entry not found', 'CHILD_ENTRY_NOT_FOUND', 404);
    }
    if (entry.event_id !== eventId) {
      throw new WristbandDomainError('Child entry belongs to a different event context', 'EVENT_MISMATCH', 400);
    }

    // 7. Verify child entry lifecycle status
    if (!ELIGIBLE_CHILD_ENTRY_STATUSES.includes(entry.status)) {
      throw new WristbandDomainError(
        `Child entry is not eligible for wristband binding (current status: "${entry.status}")`,
        'CHILD_NOT_ELIGIBLE_FOR_BINDING',
        400
      );
    }

    // 8. Verify child does not already have an active assignment
    const activeForEntry = await queryOne(
      'SELECT id FROM child_wristband_assignments WHERE child_event_entry_id = ? AND deactivated_at IS NULL',
      [childEventEntryId]
    );
    if (activeForEntry) {
      throw new WristbandDomainError('Child already has an active wristband assigned', 'CHILD_ALREADY_HAS_WRISTBAND', 409);
    }

    // 9. Atomic assignment creation
    const assignmentId = `cwa-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    try {
      await execute(`
        INSERT INTO child_wristband_assignments (
          id, event_id, child_event_entry_id, wristband_id,
          assigned_by_user_id, assigned_at, deactivated_at,
          deactivated_by_user_id, deactivation_reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
      `, [assignmentId, eventId, childEventEntryId, wristband.id, actor.id || null, now, now]);
    } catch (dbErr: any) {
      const msg = dbErr?.message || '';
      if (msg.includes('idx_active_assignment_entry') || msg.includes('child_event_entry_id')) {
        throw new WristbandDomainError('Child already has an active wristband assigned', 'CHILD_ALREADY_HAS_WRISTBAND', 409);
      }
      if (msg.includes('idx_active_assignment_wristband') || msg.includes('wristband_id')) {
        throw new WristbandDomainError('Wristband is already assigned to a child', 'WRISTBAND_ALREADY_ASSIGNED', 409);
      }
      if (msg.includes('FOREIGN KEY') || msg.includes('REFERENCES')) {
        throw new WristbandDomainError('Cross-event assignment rejected by database constraint', 'EVENT_MISMATCH', 400);
      }
      throw dbErr;
    }

    // 10. Update wristband status to 'active'
    await execute('UPDATE wristbands SET status = ?, updated_at = ? WHERE id = ?', ['active', now, wristband.id]);

    // 11. Write audit log
    await recordAuditLog({
      userId: actor.id || null,
      userRole: actor.role || 'volunteer',
      action: 'WRISTBAND_BOUND',
      targetType: 'child_wristband_assignment',
      targetId: assignmentId,
      details: {
        eventId,
        wristbandId: wristband.id,
        wristbandCode: wristband.wristband_code,
        childEventEntryId,
        assignedAt: now
      }
    });

    const assignment = await queryOne<ChildWristbandAssignmentRow>(
      'SELECT * FROM child_wristband_assignments WHERE id = ?',
      [assignmentId]
    );

    const result: BindWristbandResult = {
      success: true,
      assignment: assignment!,
      wristband: {
        id: wristband.id,
        wristbandCode: wristband.wristband_code,
        status: 'active',
        nfcUid: wristband.nfc_uid
      },
      childEventEntryId,
      eventId
    };

    // 12. Record idempotency if key was provided
    if (idempotencyKey) {
      try {
        await execute(`
          INSERT INTO wristband_binding_idempotency (
            idempotency_key, event_id, child_event_entry_id, wristband_id, response_payload, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [idempotencyKey, eventId, childEventEntryId, wristband.id, JSON.stringify(result), now]);
      } catch (idemErr: any) {
        console.warn('[Wristband Idempotency] Concurrent idempotency write detected:', idemErr?.message || idemErr);
      }
    }

    return result;
  });
}

// =============================================================================
// TGA 2026 PHASE 2B: WRISTBAND DEACTIVATION + REPLACEMENT DOMAIN ENGINE
// =============================================================================

export type DeactivationReason = 'lost' | 'damaged' | 'manual_deactivation' | 'decommissioned';

export const VALID_DEACTIVATION_REASONS: readonly DeactivationReason[] = [
  'lost',
  'damaged',
  'manual_deactivation',
  'decommissioned'
] as const;

export type ReplacementReason = 'lost' | 'damaged';

export const VALID_REPLACEMENT_REASONS: readonly ReplacementReason[] = [
  'lost',
  'damaged'
] as const;

export interface DeactivateWristbandParams {
  eventId: string;
  childEventEntryId?: string;
  wristbandId?: string;
  nfcUid?: string;
  assignmentId?: string;
  reason: DeactivationReason;
  resultingWristbandStatus?: WristbandStatus;
  idempotencyKey?: string;
  actor: ActorContext;
}

export interface DeactivateWristbandResult {
  success: boolean;
  assignment: ChildWristbandAssignmentRow;
  wristband: {
    id: string;
    wristbandCode: string;
    status: WristbandStatus;
    nfcUid: string;
  };
  deactivatedAt: string;
}

export interface ReplaceWristbandParams {
  eventId: string;
  childEventEntryId: string;
  currentWristbandId?: string;
  currentNfcUid?: string;
  replacementWristbandId?: string;
  replacementNfcUid?: string;
  reason: ReplacementReason;
  idempotencyKey?: string;
  actor: ActorContext;
}

export interface ReplaceWristbandResult {
  success: boolean;
  deactivatedAssignment: ChildWristbandAssignmentRow;
  newAssignment: ChildWristbandAssignmentRow;
  oldWristband: {
    id: string;
    wristbandCode: string;
    status: WristbandStatus;
    nfcUid: string;
  };
  replacementWristband: {
    id: string;
    wristbandCode: string;
    status: WristbandStatus;
    nfcUid: string;
  };
  childEventEntryId: string;
  eventId: string;
}

function hashOperationPayload(payload: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Asserts that the actor is authorized to replace or deactivate a wristband.
 * Allowed: Admin / Super Admin, or approved Volunteer assigned to active duty with a check-in LEAD role.
 */
export async function assertCanManageWristbandReplacements(actor: ActorContext, eventId: string): Promise<void> {
  if (actor.role === 'admin' || actor.role === 'super_admin') {
    return;
  }

  if (actor.role === 'volunteer') {
    const profile = await queryOne<{ status: string; is_deleted: number }>(
      'SELECT status, is_deleted FROM volunteer_profiles WHERE user_id = ?',
      [actor.id]
    );
    if (!profile || profile.is_deleted === 1 || profile.status !== 'approved') {
      throw new WristbandDomainError(
        'Volunteer profile must be approved to replace wristbands',
        'FORBIDDEN',
        403
      );
    }

    const assignment = await queryOne<{
      id: string;
      responsibility_key: string;
      team_key: string;
      status: string;
    }>(
      "SELECT id, responsibility_key, team_key, status FROM event_duty_assignments WHERE event_id = ? AND user_id = ? AND status NOT IN ('cancelled', 'ended')",
      [eventId, actor.id]
    );

    if (!assignment) {
      throw new WristbandDomainError(
        'Volunteer is not assigned to duty for this event',
        'FORBIDDEN',
        403
      );
    }

    const key = (assignment.responsibility_key || '').trim().toLowerCase();

    // Check-in lead responsibilities (higher privilege than ordinary check-in volunteer):
    const CANONICAL_LEAD_RESPONSIBILITIES = [
      'gate/check-in lead',
      'gate_lead',
      'check_in_lead',
      'arrival_lead',
      'registration_lead',
      'registration'
    ];

    const isAuthorizedLead =
      CANONICAL_LEAD_RESPONSIBILITIES.includes(key) ||
      (key.includes('lead') && (key.includes('gate') || key.includes('check') || key.includes('arrival')));

    if (!isAuthorizedLead) {
      throw new WristbandDomainError(
        'Only check-in leads or administrators can replace or deactivate wristbands',
        'FORBIDDEN',
        403
      );
    }

    return;
  }

  throw new WristbandDomainError('Unauthorized role for wristband replacement', 'FORBIDDEN', 403);
}

/**
 * Deactivates an active wristband assignment, transitions wristband inventory status,
 * preserves immutable assignment history, and writes an audit log.
 */
export async function deactivateWristbandAssignment(params: DeactivateWristbandParams): Promise<DeactivateWristbandResult> {
  const { eventId, childEventEntryId, wristbandId, nfcUid, assignmentId, reason, resultingWristbandStatus, idempotencyKey, actor } = params;

  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw new WristbandDomainError('eventId is required', 'EVENT_REQUIRED', 400);
  }

  if (!VALID_DEACTIVATION_REASONS.includes(reason)) {
    throw new WristbandDomainError(
      `Invalid deactivation reason. Must be one of: ${VALID_DEACTIVATION_REASONS.join(', ')}`,
      'INVALID_DEACTIVATION_REASON',
      400
    );
  }

  // Derive resulting wristband status and validate transition safety
  let targetStatus: WristbandStatus;
  if (resultingWristbandStatus) {
    if (!VALID_WRISTBAND_STATUSES.includes(resultingWristbandStatus)) {
      throw new WristbandDomainError(`Invalid resulting wristband status: ${resultingWristbandStatus}`, 'INVALID_STATUS_TRANSITION', 400);
    }
    if ((reason === 'lost' || reason === 'damaged') && resultingWristbandStatus === 'available') {
      throw new WristbandDomainError(`Lost or damaged wristband cannot transition to available status`, 'INVALID_STATUS_TRANSITION', 400);
    }
    if (reason === 'decommissioned' && resultingWristbandStatus !== 'decommissioned') {
      throw new WristbandDomainError(`Decommissioned reason must transition to decommissioned status`, 'INVALID_STATUS_TRANSITION', 400);
    }
    targetStatus = resultingWristbandStatus;
  } else {
    if (reason === 'lost') targetStatus = 'lost';
    else if (reason === 'damaged') targetStatus = 'damaged';
    else if (reason === 'decommissioned') targetStatus = 'decommissioned';
    else targetStatus = 'available';
  }

  await ensureSupportingTables();

  // Idempotency check
  const normalizedUid = nfcUid && isValidNfcUid(nfcUid) ? normalizeNfcUid(nfcUid) : (nfcUid || null);
  const currentHash = hashOperationPayload({
    eventId,
    childEventEntryId: childEventEntryId || null,
    assignmentId: assignmentId || null,
    wristbandId: wristbandId || null,
    nfcUid: normalizedUid,
    reason,
    targetStatus
  });

  if (idempotencyKey) {
    const existing = await queryOne<{
      idempotency_key: string;
      operation_type: string;
      event_id: string;
      request_payload_hash: string;
      response_payload: string;
    }>('SELECT * FROM wristband_operation_idempotency WHERE idempotency_key = ?', [idempotencyKey]);

    if (existing) {
      if (existing.operation_type === 'deactivate' && existing.request_payload_hash === currentHash) {
        return JSON.parse(existing.response_payload) as DeactivateWristbandResult;
      }
      throw new WristbandDomainError(
        'Idempotency key has already been used with a different deactivation payload',
        'IDEMPOTENCY_CONFLICT',
        409
      );
    }
  }

  await assertCanManageWristbandReplacements(actor, eventId);

  return transaction(async () => {
    // 1. Verify Event
    const event = await queryOne<{ id: string; status: string }>(
      'SELECT id, status FROM events WHERE id = ?',
      [eventId]
    );
    if (!event) {
      throw new WristbandDomainError(`Event not found: ${eventId}`, 'EVENT_NOT_FOUND', 404);
    }
    if (['archived', 'closed', 'ended'].includes(event.status)) {
      throw new WristbandDomainError(`Event is inactive (status: ${event.status})`, 'EVENT_INACTIVE', 400);
    }

    // 2. Resolve target assignment
    let assignment: ChildWristbandAssignmentRow | null = null;
    if (assignmentId) {
      assignment = await queryOne<ChildWristbandAssignmentRow>(
        'SELECT * FROM child_wristband_assignments WHERE id = ?',
        [assignmentId]
      );
    } else if (childEventEntryId) {
      assignment = await queryOne<ChildWristbandAssignmentRow>(
        'SELECT * FROM child_wristband_assignments WHERE child_event_entry_id = ? AND deactivated_at IS NULL',
        [childEventEntryId]
      );
    } else if (wristbandId) {
      assignment = await queryOne<ChildWristbandAssignmentRow>(
        'SELECT * FROM child_wristband_assignments WHERE wristband_id = ? AND deactivated_at IS NULL',
        [wristbandId]
      );
    } else if (nfcUid) {
      let canonicalUid: string;
      try {
        canonicalUid = normalizeNfcUid(nfcUid);
      } catch (err: any) {
        throw new WristbandDomainError(err.message, 'INVALID_NFC_UID', 400);
      }
      const wb = await queryOne<WristbandRow>(
        'SELECT id FROM wristbands WHERE event_id = ? AND nfc_uid = ?',
        [eventId, canonicalUid]
      );
      if (!wb) {
        throw new WristbandDomainError('Wristband not found in this event context', 'WRISTBAND_NOT_FOUND', 404);
      }
      assignment = await queryOne<ChildWristbandAssignmentRow>(
        'SELECT * FROM child_wristband_assignments WHERE wristband_id = ? AND deactivated_at IS NULL',
        [wb.id]
      );
    } else {
      throw new WristbandDomainError('Either assignmentId, childEventEntryId, wristbandId, or nfcUid must be provided', 'TARGET_REQUIRED', 400);
    }

    if (!assignment) {
      throw new WristbandDomainError('Active wristband assignment not found', 'ACTIVE_ASSIGNMENT_NOT_FOUND', 404);
    }
    if (assignment.event_id !== eventId) {
      throw new WristbandDomainError('Assignment belongs to a different event context', 'EVENT_MISMATCH', 400);
    }
    if (assignment.deactivated_at !== null) {
      throw new WristbandDomainError('Assignment is already deactivated and cannot be deactivated again', 'ASSIGNMENT_ALREADY_INACTIVE', 400);
    }

    const wristband = await queryOne<WristbandRow>(
      'SELECT * FROM wristbands WHERE id = ?',
      [assignment.wristband_id]
    );
    if (!wristband) {
      throw new WristbandDomainError('Physical wristband record not found', 'WRISTBAND_NOT_FOUND', 404);
    }

    const now = new Date().toISOString();

    // 3. Deactivate assignment
    await execute(`
      UPDATE child_wristband_assignments
      SET deactivated_at = ?,
          deactivated_by_user_id = ?,
          deactivation_reason = ?
      WHERE id = ? AND deactivated_at IS NULL
    `, [now, actor.id || null, reason, assignment.id]);

    // 4. Update wristband status
    await execute(`
      UPDATE wristbands
      SET status = ?,
          updated_at = ?
      WHERE id = ?
    `, [targetStatus, now, assignment.wristband_id]);

    // 5. Write audit log
    await recordAuditLog({
      userId: actor.id || null,
      userRole: actor.role || 'volunteer',
      action: 'WRISTBAND_DEACTIVATED',
      targetType: 'child_wristband_assignment',
      targetId: assignment.id,
      details: {
        eventId,
        childEventEntryId: assignment.child_event_entry_id,
        wristbandId: assignment.wristband_id,
        wristbandCode: wristband.wristband_code,
        reason,
        resultingWristbandStatus: targetStatus,
        deactivatedAt: now
      }
    });

    const updatedAssignment = (await queryOne<ChildWristbandAssignmentRow>(
      'SELECT * FROM child_wristband_assignments WHERE id = ?',
      [assignment.id]
    ))!;

    const updatedWristband = (await queryOne<WristbandRow>(
      'SELECT * FROM wristbands WHERE id = ?',
      [assignment.wristband_id]
    ))!;

    const result: DeactivateWristbandResult = {
      success: true,
      assignment: updatedAssignment,
      wristband: {
        id: updatedWristband.id,
        wristbandCode: updatedWristband.wristband_code,
        status: updatedWristband.status,
        nfcUid: updatedWristband.nfc_uid
      },
      deactivatedAt: now
    };

    if (idempotencyKey) {
      try {
        await execute(`
          INSERT INTO wristband_operation_idempotency (
            idempotency_key, operation_type, event_id, request_payload_hash, response_payload, created_at
          ) VALUES (?, 'deactivate', ?, ?, ?, ?)
        `, [idempotencyKey, eventId, currentHash, JSON.stringify(result), now]);
      } catch (_) {}
    }

    return result;
  });
}

/**
 * Replaces an active child wristband assignment atomically:
 * 1. Verifies child entry and event consistency.
 * 2. Fetches active assignment and verifies current wristband match (safeguarding check).
 * 3. Resolves and validates replacement wristband (must be available in same event).
 * 4. Atomically deactivates old assignment, marks old band lost/damaged,
 *    creates new assignment, and marks replacement band active.
 * 5. Writes audit trail and records idempotency.
 */
export async function replaceWristband(params: ReplaceWristbandParams): Promise<ReplaceWristbandResult> {
  const { eventId, childEventEntryId, currentWristbandId, currentNfcUid, replacementWristbandId, replacementNfcUid, reason, idempotencyKey, actor } = params;

  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw new WristbandDomainError('eventId is required', 'EVENT_REQUIRED', 400);
  }
  if (!childEventEntryId || typeof childEventEntryId !== 'string' || !childEventEntryId.trim()) {
    throw new WristbandDomainError('childEventEntryId is required', 'CHILD_ENTRY_REQUIRED', 400);
  }
  if (!VALID_REPLACEMENT_REASONS.includes(reason)) {
    throw new WristbandDomainError('Invalid replacement reason. Must be "lost" or "damaged"', 'INVALID_REPLACEMENT_REASON', 400);
  }
  if (!replacementWristbandId && !replacementNfcUid) {
    throw new WristbandDomainError('Either replacementWristbandId or replacementNfcUid must be provided', 'REPLACEMENT_WRISTBAND_REQUIRED', 400);
  }

  await ensureSupportingTables();

  const normalizedCurUid = currentNfcUid && isValidNfcUid(currentNfcUid) ? normalizeNfcUid(currentNfcUid) : (currentNfcUid || null);
  const normalizedRepUid = replacementNfcUid && isValidNfcUid(replacementNfcUid) ? normalizeNfcUid(replacementNfcUid) : (replacementNfcUid || null);

  const currentHash = hashOperationPayload({
    eventId,
    childEventEntryId,
    currentWristbandId: currentWristbandId || null,
    currentNfcUid: normalizedCurUid,
    replacementWristbandId: replacementWristbandId || null,
    replacementNfcUid: normalizedRepUid,
    reason
  });

  if (idempotencyKey) {
    const existing = await queryOne<{
      idempotency_key: string;
      operation_type: string;
      event_id: string;
      request_payload_hash: string;
      response_payload: string;
    }>('SELECT * FROM wristband_operation_idempotency WHERE idempotency_key = ?', [idempotencyKey]);

    if (existing) {
      if (existing.operation_type === 'replace' && existing.request_payload_hash === currentHash) {
        return JSON.parse(existing.response_payload) as ReplaceWristbandResult;
      }
      throw new WristbandDomainError(
        'Idempotency key has already been used with a different replacement payload',
        'IDEMPOTENCY_CONFLICT',
        409
      );
    }
  }

  await assertCanManageWristbandReplacements(actor, eventId);

  return transaction(async () => {
    // 1. Verify Event
    const event = await queryOne<{ id: string; status: string }>(
      'SELECT id, status FROM events WHERE id = ?',
      [eventId]
    );
    if (!event) {
      throw new WristbandDomainError(`Event not found: ${eventId}`, 'EVENT_NOT_FOUND', 404);
    }
    if (['archived', 'closed', 'ended'].includes(event.status)) {
      throw new WristbandDomainError(`Event is inactive (status: ${event.status})`, 'EVENT_INACTIVE', 400);
    }

    // 2. Verify Child Event Entry
    const entry = await queryOne<{ id: string; event_id: string; status: string }>(
      'SELECT id, event_id, status FROM child_event_entries WHERE id = ?',
      [childEventEntryId]
    );
    if (!entry) {
      throw new WristbandDomainError('Child event entry not found', 'CHILD_ENTRY_NOT_FOUND', 404);
    }
    if (entry.event_id !== eventId) {
      throw new WristbandDomainError('Child entry belongs to a different event context', 'EVENT_MISMATCH', 400);
    }

    // 3. Fetch Active Assignment
    const activeAssignment = await queryOne<ChildWristbandAssignmentRow>(
      'SELECT * FROM child_wristband_assignments WHERE child_event_entry_id = ? AND deactivated_at IS NULL',
      [childEventEntryId]
    );
    if (!activeAssignment) {
      throw new WristbandDomainError('No active wristband assignment found for this child', 'ACTIVE_ASSIGNMENT_NOT_FOUND', 404);
    }

    // 4. Fetch Current Wristband Record
    const currentWristband = await queryOne<WristbandRow>(
      'SELECT * FROM wristbands WHERE id = ?',
      [activeAssignment.wristband_id]
    );
    if (!currentWristband) {
      throw new WristbandDomainError('Current assigned wristband not found in inventory', 'WRISTBAND_NOT_FOUND', 404);
    }

    // 5. Safeguarding check: Current wristband match
    if (currentWristbandId && currentWristband.id !== currentWristbandId) {
      throw new WristbandDomainError(
        'Current wristband ID does not match active child assignment',
        'WRISTBAND_ASSIGNMENT_MISMATCH',
        409
      );
    }
    if (currentNfcUid) {
      let curUid: string;
      try {
        curUid = normalizeNfcUid(currentNfcUid);
      } catch (err: any) {
        throw new WristbandDomainError(err.message, 'INVALID_NFC_UID', 400);
      }
      if (currentWristband.nfc_uid !== curUid) {
        throw new WristbandDomainError(
          'Current NFC UID does not match active child assignment',
          'WRISTBAND_ASSIGNMENT_MISMATCH',
          409
        );
      }
    }

    // 6. Resolve Replacement Wristband
    let replacementWb: WristbandRow | null = null;
    if (replacementWristbandId) {
      replacementWb = await getWristbandById(replacementWristbandId);
      if (!replacementWb) {
        throw new WristbandDomainError('Replacement wristband not found in inventory', 'WRISTBAND_NOT_FOUND', 404);
      }
    } else if (replacementNfcUid) {
      let repUid: string;
      try {
        repUid = normalizeNfcUid(replacementNfcUid);
      } catch (err: any) {
        throw new WristbandDomainError(err.message, 'INVALID_NFC_UID', 400);
      }
      replacementWb = await getWristbandByNfcUid(eventId, repUid);
      if (!replacementWb) {
        throw new WristbandDomainError('Replacement wristband not found in inventory for this event', 'WRISTBAND_NOT_FOUND', 404);
      }
    }

    if (!replacementWb) {
      throw new WristbandDomainError('Replacement wristband not found', 'WRISTBAND_NOT_FOUND', 404);
    }

    // 7. Validate Replacement Wristband
    if (replacementWb.event_id !== eventId) {
      throw new WristbandDomainError('Replacement wristband belongs to a different event', 'EVENT_MISMATCH', 400);
    }
    if (replacementWb.id === currentWristband.id) {
      throw new WristbandDomainError(
        'Replacement wristband cannot be the same wristband currently assigned',
        'REPLACEMENT_SAME_WRISTBAND',
        400
      );
    }
    if (replacementWb.status !== 'available') {
      if (replacementWb.status === 'active') {
        throw new WristbandDomainError('Replacement wristband is already assigned to a child', 'WRISTBAND_ALREADY_ASSIGNED', 409);
      }
      if (replacementWb.status === 'prepared') {
        throw new WristbandDomainError(
          'This wristband has not been verified for use yet.',
          'WRISTBAND_NOT_VERIFIED',
          400
        );
      }
      throw new WristbandDomainError(
        `Replacement wristband is not available (status: "${replacementWb.status}")`,
        'WRISTBAND_NOT_AVAILABLE',
        400
      );
    }

    const activeForReplacement = await queryOne(
      'SELECT id FROM child_wristband_assignments WHERE wristband_id = ? AND deactivated_at IS NULL',
      [replacementWb.id]
    );
    if (activeForReplacement) {
      throw new WristbandDomainError('Replacement wristband is already assigned to a child', 'WRISTBAND_ALREADY_ASSIGNED', 409);
    }

    const now = new Date().toISOString();
    const newAssignmentId = `cwa-${crypto.randomUUID()}`;

    // 8. Atomic mutation:
    // A. Deactivate old assignment
    await execute(`
      UPDATE child_wristband_assignments
      SET deactivated_at = ?,
          deactivated_by_user_id = ?,
          deactivation_reason = ?
      WHERE id = ? AND deactivated_at IS NULL
    `, [now, actor.id || null, reason, activeAssignment.id]);

    // B. Mark old wristband lost / damaged
    await execute(`
      UPDATE wristbands
      SET status = ?,
          updated_at = ?
      WHERE id = ?
    `, [reason, now, currentWristband.id]);

    // C. Create new assignment
    try {
      await execute(`
        INSERT INTO child_wristband_assignments (
          id, event_id, child_event_entry_id, wristband_id,
          assigned_by_user_id, assigned_at, deactivated_at,
          deactivated_by_user_id, deactivation_reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
      `, [newAssignmentId, eventId, childEventEntryId, replacementWb.id, actor.id || null, now, now]);
    } catch (dbErr: any) {
      const msg = dbErr?.message || '';
      if (msg.includes('idx_active_assignment_entry') || msg.includes('child_event_entry_id')) {
        throw new WristbandDomainError('Child already has an active wristband assigned', 'CHILD_ALREADY_HAS_WRISTBAND', 409);
      }
      if (msg.includes('idx_active_assignment_wristband') || msg.includes('wristband_id')) {
        throw new WristbandDomainError('Replacement wristband is already assigned to a child', 'WRISTBAND_ALREADY_ASSIGNED', 409);
      }
      if (msg.includes('FOREIGN KEY') || msg.includes('REFERENCES')) {
        throw new WristbandDomainError('Cross-event assignment rejected by database constraint', 'EVENT_MISMATCH', 400);
      }
      throw dbErr;
    }

    // D. Mark replacement wristband active
    await execute(`
      UPDATE wristbands
      SET status = 'active',
          updated_at = ?
      WHERE id = ?
    `, [now, replacementWb.id]);

    // E. Audit logging
    await recordAuditLog({
      userId: actor.id || null,
      userRole: actor.role || 'volunteer',
      action: 'WRISTBAND_DEACTIVATED',
      targetType: 'child_wristband_assignment',
      targetId: activeAssignment.id,
      details: {
        eventId,
        childEventEntryId,
        wristbandId: currentWristband.id,
        wristbandCode: currentWristband.wristband_code,
        reason,
        resultingWristbandStatus: reason,
        replacedByWristbandId: replacementWb.id,
        deactivatedAt: now
      }
    });

    await recordAuditLog({
      userId: actor.id || null,
      userRole: actor.role || 'volunteer',
      action: 'WRISTBAND_REPLACED',
      targetType: 'child_wristband_assignment',
      targetId: newAssignmentId,
      details: {
        eventId,
        childEventEntryId,
        oldWristbandId: currentWristband.id,
        oldWristbandCode: currentWristband.wristband_code,
        newWristbandId: replacementWb.id,
        newWristbandCode: replacementWb.wristband_code,
        reason,
        timestamp: now
      }
    });

    const deactivatedAssignment = (await queryOne<ChildWristbandAssignmentRow>(
      'SELECT * FROM child_wristband_assignments WHERE id = ?',
      [activeAssignment.id]
    ))!;

    const newAssignment = (await queryOne<ChildWristbandAssignmentRow>(
      'SELECT * FROM child_wristband_assignments WHERE id = ?',
      [newAssignmentId]
    ))!;

    const result: ReplaceWristbandResult = {
      success: true,
      deactivatedAssignment,
      newAssignment,
      oldWristband: {
        id: currentWristband.id,
        wristbandCode: currentWristband.wristband_code,
        status: reason,
        nfcUid: currentWristband.nfc_uid
      },
      replacementWristband: {
        id: replacementWb.id,
        wristbandCode: replacementWb.wristband_code,
        status: 'active',
        nfcUid: replacementWb.nfc_uid
      },
      childEventEntryId,
      eventId
    };

    if (idempotencyKey) {
      try {
        await execute(`
          INSERT INTO wristband_operation_idempotency (
            idempotency_key, operation_type, event_id, request_payload_hash, response_payload, created_at
          ) VALUES (?, 'replace', ?, ?, ?, ?)
        `, [idempotencyKey, eventId, currentHash, JSON.stringify(result), now]);
      } catch (_) {}
    }

    return result;
  });
}

// =============================================================================
// TGA 2026 PHASE 3B: UNIFIED CHILD IDENTIFIER RESOLVER
// =============================================================================

export type ResolvedIdentifierType = 'pass' | 'wristband_code' | 'nfc_uid';

export interface ResolvedChildIdentifier {
  success: true;
  identifierType: ResolvedIdentifierType;
  childEventEntryId: string;
  eventId: string;
  sourceReference: string;
  wristbandId?: string;
  wristbandCode?: string;
  childStatus?: string;
}

export interface ResolveChildIdentifierOptions {
  identifierType?: ResolvedIdentifierType;
  throwOnError?: boolean;
}

/**
 * Resolves a scan-based or operational child identifier (Pass Reference,
 * Wristband Code, or NFC UID) to its canonical child_event_entry_id within
 * the required event context.
 *
 * Invariants:
 * - Strictly event-scoped: identifiers belonging to other events are rejected.
 * - Unassigned wristbands return WRISTBAND_UNASSIGNED controlled state.
 * - Lost, damaged, or decommissioned wristbands do not resolve active children.
 * - Replaced old wristbands do not continue resolving the child.
 * - All lookups utilize dedicated unique indexes.
 * - Resolution is strictly a read operation; no state is mutated.
 */
export async function resolveEventChildIdentifier(
  eventId: string,
  rawIdentifier: string,
  options: ResolveChildIdentifierOptions = { throwOnError: true }
): Promise<ResolvedChildIdentifier> {
  const fail = (message: string, code: string, status: number = 400, details?: any): never => {
    throw new WristbandDomainError(message, code, status, details);
  };

  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    return fail('eventId is required for child identifier resolution', 'EVENT_ID_REQUIRED', 400);
  }
  const targetEventId = eventId.trim();

  if (!rawIdentifier || typeof rawIdentifier !== 'string' || !rawIdentifier.trim()) {
    return fail('identifier is required and must be a non-empty string', 'INVALID_IDENTIFIER', 400);
  }
  const trimmedId = rawIdentifier.trim();

  // Helper: Resolve Pass Reference
  const resolvePass = async (passCandidate: string): Promise<ResolvedChildIdentifier> => {
    let cleanRef = passCandidate.toUpperCase();
    if (cleanRef.startsWith('KCT:')) {
      cleanRef = cleanRef.substring(4);
    }
    if (cleanRef.startsWith('PASS-')) {
      cleanRef = cleanRef.replace('PASS-', 'KOI-2026-');
    } else if (!cleanRef.startsWith('KOI-2026-') && cleanRef.length === 6 && /^[0-9A-Z]+$/.test(cleanRef)) {
      cleanRef = `KOI-2026-${cleanRef}`;
    }

    const passRow = await queryOne<{
      id: string;
      child_event_entry_id: string;
      pass_reference: string;
      status: string;
      event_id: string;
      entry_status: string;
    }>(`
      SELECT ep.id, ep.child_event_entry_id, ep.pass_reference, ep.status, e.event_id, e.status as entry_status
      FROM event_passes ep
      JOIN child_event_entries e ON ep.child_event_entry_id = e.id
      WHERE (ep.pass_reference = ? OR ep.pass_reference = ? OR ep.id = ?)
        AND e.event_id = ?
    `, [cleanRef, passCandidate, passCandidate, targetEventId]);

    if (!passRow) {
      // Check if it exists for ANY event to provide event isolation error
      const otherRow = await queryOne<{ event_id: string }>(`
        SELECT e.event_id
        FROM event_passes ep
        JOIN child_event_entries e ON ep.child_event_entry_id = e.id
        WHERE ep.pass_reference = ? OR ep.pass_reference = ? OR ep.id = ?
      `, [cleanRef, passCandidate, passCandidate]);

      if (otherRow && otherRow.event_id !== targetEventId) {
        return fail('Event pass belongs to a different event', 'WRONG_EVENT', 400);
      }

      return fail(`Event pass with reference "${passCandidate}" not found`, 'PASS_NOT_FOUND', 404);
    }

    if (passRow.status === 'revoked' || passRow.status === 'inactive') {
      return fail('This pass has been revoked or is inactive', 'PASS_REVOKED', 400);
    }

    return {
      success: true,
      identifierType: 'pass',
      childEventEntryId: passRow.child_event_entry_id,
      eventId: targetEventId,
      sourceReference: passRow.pass_reference,
      childStatus: passRow.entry_status
    };
  };

  // Helper: Resolve Wristband Code
  const resolveWristbandCode = async (codeCandidate: string): Promise<ResolvedChildIdentifier> => {
    const code = codeCandidate.trim();
    const eventWb = await queryOne<WristbandRow>(
      'SELECT * FROM wristbands WHERE event_id = ? AND UPPER(wristband_code) = UPPER(?)',
      [targetEventId, code]
    );

    if (!eventWb) {
      const otherWb = await queryOne<{ event_id: string }>(
        'SELECT event_id FROM wristbands WHERE UPPER(wristband_code) = UPPER(?)',
        [code]
      );
      if (otherWb && otherWb.event_id !== targetEventId) {
        return fail('Wristband belongs to a different event', 'WRONG_EVENT', 400);
      }
      return fail(`Wristband with code "${code}" not found`, 'WRISTBAND_NOT_FOUND', 404);
    }

    if (eventWb.status === 'lost') {
      return fail('Wristband is marked as lost', 'WRISTBAND_LOST', 400);
    }
    if (eventWb.status === 'damaged') {
      return fail('Wristband is marked as damaged', 'WRISTBAND_DAMAGED', 400);
    }
    if (eventWb.status === 'decommissioned') {
      return fail('Wristband is decommissioned', 'WRISTBAND_DECOMMISSIONED', 400);
    }
    if (eventWb.status === 'prepared') {
      return fail('This wristband has not been verified for use yet', 'WRISTBAND_NOT_VERIFIED', 400);
    }
    if (eventWb.status === 'available') {
      return fail('Wristband has not been assigned to a child', 'WRISTBAND_UNASSIGNED', 400);
    }

    const assignment = await getActiveAssignmentForWristband(eventWb.id);
    if (!assignment) {
      return fail('Wristband has no active assignment', 'WRISTBAND_UNASSIGNED', 400);
    }

    const entry = await queryOne<{ id: string; status: string; event_id: string }>(
      'SELECT id, status, event_id FROM child_event_entries WHERE id = ?',
      [assignment.child_event_entry_id]
    );

    if (!entry || entry.event_id !== targetEventId) {
      return fail('Assigned child entry not found for this event', 'ENTRY_NOT_FOUND', 404);
    }

    return {
      success: true,
      identifierType: 'wristband_code',
      childEventEntryId: assignment.child_event_entry_id,
      eventId: targetEventId,
      sourceReference: eventWb.wristband_code,
      wristbandId: eventWb.id,
      wristbandCode: eventWb.wristband_code,
      childStatus: entry.status
    };
  };

  // Helper: Resolve NFC UID
  const resolveNfcUid = async (uidCandidate: string): Promise<ResolvedChildIdentifier> => {
    let canonicalUid: string;
    try {
      let toClean = uidCandidate.trim();
      if (toClean.toUpperCase().startsWith('NFC:')) {
        toClean = toClean.substring(4);
      }
      canonicalUid = normalizeNfcUid(toClean);
    } catch (err: any) {
      return fail(
        err?.message || 'Invalid NFC UID format',
        'INVALID_NFC_UID',
        400
      );
    }

    const eventWb = await queryOne<WristbandRow>(
      'SELECT * FROM wristbands WHERE event_id = ? AND nfc_uid = ?',
      [targetEventId, canonicalUid]
    );

    if (!eventWb) {
      const otherWb = await queryOne<{ event_id: string }>(
        'SELECT event_id FROM wristbands WHERE nfc_uid = ?',
        [canonicalUid]
      );
      if (otherWb && otherWb.event_id !== targetEventId) {
        return fail('NFC wristband belongs to a different event', 'WRONG_EVENT', 400);
      }
      return fail(`NFC wristband with UID "${canonicalUid}" not found`, 'WRISTBAND_NOT_FOUND', 404);
    }

    if (eventWb.status === 'lost') {
      return fail('Wristband is marked as lost', 'WRISTBAND_LOST', 400);
    }
    if (eventWb.status === 'damaged') {
      return fail('Wristband is marked as damaged', 'WRISTBAND_DAMAGED', 400);
    }
    if (eventWb.status === 'decommissioned') {
      return fail('Wristband is decommissioned', 'WRISTBAND_DECOMMISSIONED', 400);
    }
    if (eventWb.status === 'prepared') {
      return fail('This wristband has not been verified for use yet', 'WRISTBAND_NOT_VERIFIED', 400);
    }
    if (eventWb.status === 'available') {
      return fail('Wristband has not been assigned to a child', 'WRISTBAND_UNASSIGNED', 400);
    }

    const assignment = await getActiveAssignmentForWristband(eventWb.id);
    if (!assignment) {
      return fail('Wristband has no active assignment', 'WRISTBAND_UNASSIGNED', 400);
    }

    const entry = await queryOne<{ id: string; status: string; event_id: string }>(
      'SELECT id, status, event_id FROM child_event_entries WHERE id = ?',
      [assignment.child_event_entry_id]
    );

    if (!entry || entry.event_id !== targetEventId) {
      return fail('Assigned child entry not found for this event', 'ENTRY_NOT_FOUND', 404);
    }

    return {
      success: true,
      identifierType: 'nfc_uid',
      childEventEntryId: assignment.child_event_entry_id,
      eventId: targetEventId,
      sourceReference: canonicalUid,
      wristbandId: eventWb.id,
      wristbandCode: eventWb.wristband_code,
      childStatus: entry.status
    };
  };

  // --- DISPATCHER ---
  if (options?.identifierType === 'pass') {
    return resolvePass(trimmedId);
  }
  if (options?.identifierType === 'wristband_code') {
    return resolveWristbandCode(trimmedId);
  }
  if (options?.identifierType === 'nfc_uid') {
    return resolveNfcUid(trimmedId);
  }

  const upper = trimmedId.toUpperCase();

  // 1. Explicit pass prefix
  if (upper.startsWith('KOI-') || upper.startsWith('KCT:') || upper.startsWith('PASS-')) {
    return resolvePass(trimmedId);
  }

  // 2. Explicit wristband code prefix
  if (upper.startsWith('WB-') || upper.startsWith('WB_')) {
    return resolveWristbandCode(trimmedId);
  }

  // 3. Explicit NFC prefix or formatted NFC string (with colons)
  if (upper.startsWith('NFC:') || trimmedId.includes(':')) {
    return resolveNfcUid(trimmedId);
  }

  // 4. Ambiguous string: check if it matches an event pass (e.g. 6-char pass reference)
  try {
    return await resolvePass(trimmedId);
  } catch (err: any) {
    if (err instanceof WristbandDomainError && (err.code === 'PASS_REVOKED' || err.code === 'WRONG_EVENT')) {
      throw err;
    }
  }

  // 5. Ambiguous string: check if it's a valid hex NFC UID that exists in wristbands
  if (isValidNfcUid(trimmedId)) {
    try {
      return await resolveNfcUid(trimmedId);
    } catch (err: any) {
      if (err instanceof WristbandDomainError && err.code !== 'WRISTBAND_NOT_FOUND') {
        throw err;
      }
    }
  }

  // 6. Ambiguous string: check if it exists as a wristband code
  try {
    return await resolveWristbandCode(trimmedId);
  } catch (err: any) {
    if (err instanceof WristbandDomainError && err.code !== 'WRISTBAND_NOT_FOUND') {
      throw err;
    }
  }

  // 7. Not recognized or found
  return fail(`Unknown or unrecognized child identifier "${trimmedId}"`, 'IDENTIFIER_NOT_FOUND', 404);
}

// =============================================================================
// TGA 2026 PHASE 4A: BULK WRISTBAND INVENTORY, IMPORT & PRINT PREPARATION
// =============================================================================

export interface WristbandInventorySummary {
  total: number;
  prepared: number;
  available: number;
  active: number;
  lost: number;
  damaged: number;
  decommissioned: number;
}

export interface WristbandInventoryItem {
  id: string;
  eventId: string;
  wristbandCode: string;
  nfcUid: string;
  status: WristbandStatus;
  createdAt: string;
  updatedAt: string;
  assignmentState: 'unassigned' | 'active';
  assignedChild?: {
    childEventEntryId: string;
    childName: string;
    roomName?: string | null;
  } | null;
}

export interface WristbandInventoryResult {
  summary: WristbandInventorySummary;
  wristbands: WristbandInventoryItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface BulkImportRowInput {
  nfcUid: string;
  wristbandCode?: string;
}

export interface BulkImportPreviewRow {
  rowNumber: number;
  rawNfcUid: string;
  normalizedNfcUid: string | null;
  wristbandCode: string | null;
  status: 'valid' | 'malformed' | 'duplicate_in_file' | 'already_exists';
  errorReason?: string;
}

export interface BulkImportPreviewResult {
  summary: {
    totalRows: number;
    validCount: number;
    malformedCount: number;
    duplicateInFileCount: number;
    alreadyExistingCount: number;
  };
  rows: BulkImportPreviewRow[];
}

export interface BulkImportExecuteResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  wristbands: Array<{
    id: string;
    wristbandCode: string;
    nfcUid: string;
    status: WristbandStatus;
  }>;
  errors: Array<{
    rowNumber: number;
    rawNfcUid: string;
    reason: string;
  }>;
}

export interface WristbandPrintItem {
  id: string;
  wristbandCode: string;
  qrValue: string;
  eventName: string;
  status: string;
  sequenceIndex?: number;
  totalInBatch?: number;
}

/**
 * Parses raw CSV text into a structured list of wristband input rows.
 * Resilient to headers (nfc_uid, tag_id, uid, wristband_code, code) or headerless data.
 */
export function parseCsvWristbands(csvText: string): BulkImportRowInput[] {
  if (!csvText || typeof csvText !== 'string') return [];
  const cleaned = csvText.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const delim = firstLine.includes('\t') ? '\t' : (firstLine.includes(';') ? ';' : ',');

  const headerParts = firstLine.split(delim).map(s => s.trim().toLowerCase().replace(/['"]/g, ''));
  let nfcIndex = -1;
  let codeIndex = -1;

  for (let i = 0; i < headerParts.length; i++) {
    const h = headerParts[i];
    if (['nfc_uid', 'nfc', 'uid', 'tag_id', 'tag', 'nfc uid', 'nfc id', 'tag id', 'tag uid'].includes(h)) {
      nfcIndex = i;
    } else if (['wristband_code', 'code', 'wristband', 'wb_code', 'wristband code'].includes(h)) {
      codeIndex = i;
    }
  }

  const startLineIndex = nfcIndex !== -1 ? 1 : 0;
  if (nfcIndex === -1) {
    nfcIndex = 0;
    if (firstLine.split(delim).length > 1) {
      codeIndex = 1;
    }
  }

  const rows: BulkImportRowInput[] = [];
  for (let i = startLineIndex; i < lines.length; i++) {
    const rawCols = lines[i].split(delim).map(s => s.trim().replace(/^["']|["']$/g, ''));
    const rawNfc = rawCols[nfcIndex] || '';
    const rawCode = codeIndex !== -1 ? (rawCols[codeIndex] || undefined) : undefined;
    if (rawNfc || rawCode) {
      rows.push({
        nfcUid: rawNfc,
        wristbandCode: rawCode && rawCode.trim() ? rawCode.trim() : undefined
      });
    }
  }
  return rows;
}

/**
 * Previews bulk import of wristband UIDs without mutating the database.
 * Detects malformed UIDs, in-file duplicates, and pre-existing tags in current event.
 */
export async function previewBulkImportWristbands(params: {
  eventId: string;
  rows?: BulkImportRowInput[];
  csvText?: string;
  actor: ActorContext;
}): Promise<BulkImportPreviewResult> {
  const { eventId, actor } = params;
  assertCanProvisionWristband(actor);

  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw new WristbandDomainError('eventId is required', 'EVENT_REQUIRED', 400);
  }
  const event = await queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM events WHERE id = ?',
    [eventId]
  );
  if (!event) {
    throw new WristbandDomainError(`Event not found: ${eventId}`, 'EVENT_NOT_FOUND', 404);
  }

  let inputRows = params.rows || [];
  if (params.csvText) {
    inputRows = parseCsvWristbands(params.csvText);
  }

  const previewRows: BulkImportPreviewRow[] = [];
  const seenNfcInFile = new Set<string>();
  const seenCodeInFile = new Set<string>();

  let validCount = 0;
  let malformedCount = 0;
  let duplicateInFileCount = 0;
  let alreadyExistingCount = 0;

  for (let i = 0; i < inputRows.length; i++) {
    const rowNum = i + 1;
    const rawNfc = (inputRows[i].nfcUid || '').trim();
    const rawCode = inputRows[i].wristbandCode ? inputRows[i].wristbandCode!.trim().toUpperCase() : null;

    let canonicalNfc: string | null = null;
    try {
      canonicalNfc = normalizeNfcUid(rawNfc);
    } catch (err: any) {
      malformedCount++;
      previewRows.push({
        rowNumber: rowNum,
        rawNfcUid: rawNfc,
        normalizedNfcUid: null,
        wristbandCode: rawCode,
        status: 'malformed',
        errorReason: err.message || 'Invalid NFC UID'
      });
      continue;
    }

    if (seenNfcInFile.has(canonicalNfc)) {
      duplicateInFileCount++;
      previewRows.push({
        rowNumber: rowNum,
        rawNfcUid: rawNfc,
        normalizedNfcUid: canonicalNfc,
        wristbandCode: rawCode,
        status: 'duplicate_in_file',
        errorReason: `Duplicate NFC tag in file (${canonicalNfc})`
      });
      continue;
    }
    seenNfcInFile.add(canonicalNfc);

    const existingNfc = await queryOne<{ id: string; wristband_code: string }>(
      'SELECT id, wristband_code FROM wristbands WHERE event_id = ? AND nfc_uid = ?',
      [eventId, canonicalNfc]
    );
    if (existingNfc) {
      alreadyExistingCount++;
      previewRows.push({
        rowNumber: rowNum,
        rawNfcUid: rawNfc,
        normalizedNfcUid: canonicalNfc,
        wristbandCode: rawCode || existingNfc.wristband_code,
        status: 'already_exists',
        errorReason: `NFC tag already registered in this event as ${existingNfc.wristband_code}`
      });
      continue;
    }

    if (rawCode) {
      if (!isValidWristbandCode(rawCode)) {
        malformedCount++;
        previewRows.push({
          rowNumber: rowNum,
          rawNfcUid: rawNfc,
          normalizedNfcUid: canonicalNfc,
          wristbandCode: rawCode,
          status: 'malformed',
          errorReason: `Invalid wristband code format "${rawCode}"`
        });
        continue;
      }

      if (seenCodeInFile.has(rawCode)) {
        duplicateInFileCount++;
        previewRows.push({
          rowNumber: rowNum,
          rawNfcUid: rawNfc,
          normalizedNfcUid: canonicalNfc,
          wristbandCode: rawCode,
          status: 'duplicate_in_file',
          errorReason: `Duplicate wristband code in file (${rawCode})`
        });
        continue;
      }
      seenCodeInFile.add(rawCode);

      const existingCode = await queryOne<{ id: string }>(
        'SELECT id FROM wristbands WHERE event_id = ? AND wristband_code = ?',
        [eventId, rawCode]
      );
      if (existingCode) {
        alreadyExistingCount++;
        previewRows.push({
          rowNumber: rowNum,
          rawNfcUid: rawNfc,
          normalizedNfcUid: canonicalNfc,
          wristbandCode: rawCode,
          status: 'already_exists',
          errorReason: `Wristband code ${rawCode} already registered in this event`
        });
        continue;
      }
    }

    validCount++;
    previewRows.push({
      rowNumber: rowNum,
      rawNfcUid: rawNfc,
      normalizedNfcUid: canonicalNfc,
      wristbandCode: rawCode,
      status: 'valid'
    });
  }

  return {
    summary: {
      totalRows: inputRows.length,
      validCount,
      malformedCount,
      duplicateInFileCount,
      alreadyExistingCount
    },
    rows: previewRows
  };
}

/**
 * Confirms and executes bulk import of wristband UIDs inside a transaction.
 */
export async function executeBulkImportWristbands(params: {
  eventId: string;
  rows?: BulkImportRowInput[];
  csvText?: string;
  actor: ActorContext;
  skipErrors?: boolean;
}): Promise<BulkImportExecuteResult> {
  const { eventId, actor, skipErrors = true } = params;
  assertCanProvisionWristband(actor);

  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw new WristbandDomainError('eventId is required', 'EVENT_REQUIRED', 400);
  }
  const event = await queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM events WHERE id = ?',
    [eventId]
  );
  if (!event) {
    throw new WristbandDomainError(`Event not found: ${eventId}`, 'EVENT_NOT_FOUND', 404);
  }
  if (['archived', 'closed', 'ended'].includes(event.status)) {
    throw new WristbandDomainError(`Event is inactive (status: ${event.status})`, 'EVENT_INACTIVE', 400);
  }

  const preview = await previewBulkImportWristbands({
    eventId,
    rows: params.rows,
    csvText: params.csvText,
    actor
  });

  const validRows = preview.rows.filter(r => r.status === 'valid');
  const rejectedRows = preview.rows.filter(r => r.status !== 'valid');

  if (validRows.length === 0) {
    return {
      success: false,
      importedCount: 0,
      skippedCount: rejectedRows.length,
      wristbands: [],
      errors: rejectedRows.map(r => ({
        rowNumber: r.rowNumber,
        rawNfcUid: r.rawNfcUid,
        reason: r.errorReason || 'Row validation failed'
      }))
    };
  }

  if (!skipErrors && rejectedRows.length > 0) {
    throw new WristbandDomainError(
      `Batch contains ${rejectedRows.length} invalid rows. Import cancelled.`,
      'BATCH_VALIDATION_FAILED',
      400,
      { errors: rejectedRows }
    );
  }

  const rowsNeedingCode = validRows.filter(r => !r.wristbandCode);
  const generatedCodes = await generateNextWristbandCodes(eventId, rowsNeedingCode.length);

  let genIdx = 0;
  const rowsWithAssignedCodes: Array<{
    rowNumber: number;
    normalizedNfcUid: string;
    wristbandCode: string;
  }> = [];

  for (const row of validRows) {
    let finalCode = row.wristbandCode;
    if (!finalCode) {
      finalCode = generatedCodes[genIdx++];
    }
    rowsWithAssignedCodes.push({
      rowNumber: row.rowNumber,
      normalizedNfcUid: row.normalizedNfcUid!,
      wristbandCode: finalCode
    });
  }

  return transaction(async () => {
    const now = new Date().toISOString();
    const createdWristbands: Array<{
      id: string;
      wristbandCode: string;
      nfcUid: string;
      status: WristbandStatus;
    }> = [];

    for (const row of rowsWithAssignedCodes) {
      const id = `wb-${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO wristbands (
          id, event_id, wristband_code, nfc_uid, status,
          created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'available', ?, ?, ?)
      `, [id, eventId, row.wristbandCode, row.normalizedNfcUid, actor.id || null, now, now]);

      createdWristbands.push({
        id,
        wristbandCode: row.wristbandCode,
        nfcUid: row.normalizedNfcUid,
        status: 'available'
      });
    }

    await recordAuditLog({
      userId: actor.id || null,
      userRole: actor.role || 'admin',
      action: 'WRISTBAND_BULK_PROVISIONED',
      targetType: 'wristband_batch',
      targetId: eventId,
      details: {
        eventId,
        importedCount: createdWristbands.length,
        skippedCount: rejectedRows.length,
        totalRows: preview.rows.length
      }
    });

    return {
      success: true,
      importedCount: createdWristbands.length,
      skippedCount: rejectedRows.length,
      wristbands: createdWristbands,
      errors: rejectedRows.map(r => ({
        rowNumber: r.rowNumber,
        rawNfcUid: r.rawNfcUid,
        reason: r.errorReason || 'Row validation failed'
      }))
    };
  });
}

/**
 * Retrieves wristbands formatted for printable batch generation.
 * Contains human code, QR value (identical to WB code), and event name. Strictly PII-free.
 * Only 'prepared' wristbands are included in normal batches.
 * 'active', 'lost', 'damaged', 'decommissioned' are strictly excluded.
 * Deterministic ordering by wristband_code ASC.
 */
export async function getWristbandsForPrint(params: {
  eventId: string;
  ids?: string[];
  rangeStart?: string;
  rangeEnd?: string;
  status?: string;
  isReprint?: boolean;
  actor: ActorContext;
}): Promise<{
  items: WristbandPrintItem[];
  totalCount: number;
  firstCode: string | null;
  lastCode: string | null;
  eventName: string;
}> {
  const { eventId, ids, rangeStart, rangeEnd, status, isReprint, actor } = params;
  assertCanProvisionWristband(actor);

  if (!eventId) {
    throw new WristbandDomainError('eventId is required', 'EVENT_REQUIRED', 400);
  }

  const event = await queryOne<{ id: string; title?: string }>(
    'SELECT id, title FROM events WHERE id = ?',
    [eventId]
  );
  if (!event) {
    throw new WristbandDomainError(`Event not found: ${eventId}`, 'EVENT_NOT_FOUND', 404);
  }
  const eventName = event.title || 'TGA 2026';

  let sql = 'SELECT id, wristband_code, status FROM wristbands WHERE event_id = ?';
  const queryParams: any[] = [eventId];

  if (ids && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    sql += ` AND id IN (${placeholders})`;
    queryParams.push(...ids);
  } else if (rangeStart && rangeEnd) {
    sql += ' AND wristband_code >= ? AND wristband_code <= ?';
    queryParams.push(rangeStart.trim().toUpperCase(), rangeEnd.trim().toUpperCase());
  }

  // Lifecycle status safety:
  // Normal print batches strictly operate on 'prepared' wristbands.
  // Reprint allows 'prepared' and 'available'.
  // 'active', 'lost', 'damaged', 'decommissioned' are never included.
  if (isReprint) {
    if (status && (status === 'prepared' || status === 'available')) {
      sql += ' AND status = ?';
      queryParams.push(status);
    } else {
      sql += " AND status IN ('prepared', 'available')";
    }
  } else if (status === 'prepared') {
    sql += " AND status = 'prepared'";
  } else if (status === 'available') {
    sql += " AND status = 'available'";
  } else if (rangeStart && rangeEnd) {
    // Range query without explicit status (legacy Phase 4A): exclude inactive/damaged
    sql += " AND status NOT IN ('lost', 'damaged', 'decommissioned')";
  } else {
    // Normal print batch: strictly operates on 'prepared' wristbands.
    // If the event has prepared wristbands, strictly select 'prepared'.
    // If an older event has 0 prepared wristbands (legacy / Phase 4A inventory), fallback to available.
    const hasPrepared = await queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM wristbands WHERE event_id = ? AND status = 'prepared'",
      [eventId]
    );
    if (hasPrepared && Number(hasPrepared.count) > 0) {
      sql += " AND status = 'prepared'";
    } else {
      sql += " AND status = 'available'";
    }
  }

  // Deterministic order preservation
  sql += ' ORDER BY wristband_code ASC';

  const rows = await query<{
    id: string;
    wristband_code: string;
    status: WristbandStatus;
  }>(sql, queryParams);

  const totalCount = rows.length;
  const items: WristbandPrintItem[] = rows.map((r, index) => ({
    id: r.id,
    wristbandCode: r.wristband_code,
    qrValue: r.wristband_code,
    eventName,
    status: r.status,
    sequenceIndex: index + 1,
    totalInBatch: totalCount
  }));

  const firstCode = items.length > 0 ? items[0].wristbandCode : null;
  const lastCode = items.length > 0 ? items[items.length - 1].wristbandCode : null;

  // Record audit log for print batch generation (strictly zero PII)
  if (items.length > 0) {
    await recordAuditLog({
      userId: actor.id || null,
      userRole: actor.role || 'admin',
      action: 'WRISTBAND_PRINT_BATCH',
      targetType: 'wristband_batch',
      targetId: eventId,
      details: {
        eventId,
        count: totalCount,
        firstCode,
        lastCode,
        isReprint: !!isReprint,
        timestamp: new Date().toISOString()
      }
    });
  }

  return {
    items,
    totalCount,
    firstCode,
    lastCode,
    eventName
  };
}

/**
 * Rapid tag verification before packaging.
 * Scans physical NFC tag to display associated WB code and verify inventory state.
 * Strictly read-only; does NOT assign any child.
 */
export async function verifyWristbandTag(params: {
  eventId: string;
  nfcUid: string;
  actor: ActorContext;
}): Promise<{
  success: boolean;
  wristband?: {
    id: string;
    wristbandCode: string;
    status: WristbandStatus;
    nfcUid: string;
    createdAt: string;
  };
  error?: string;
}> {
  const { eventId, nfcUid, actor } = params;
  assertCanProvisionWristband(actor);

  if (!eventId) {
    throw new WristbandDomainError('eventId is required', 'EVENT_REQUIRED', 400);
  }

  let canonicalUid: string;
  try {
    canonicalUid = normalizeNfcUid(nfcUid);
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Invalid NFC UID'
    };
  }

  const row = await queryOne<{
    id: string;
    wristband_code: string;
    status: WristbandStatus;
    nfc_uid: string;
    created_at: string;
  }>(
    'SELECT id, wristband_code, status, nfc_uid, created_at FROM wristbands WHERE event_id = ? AND nfc_uid = ?',
    [eventId, canonicalUid]
  );

  if (!row) {
    return {
      success: false,
      error: 'This NFC tag is not registered in this event.'
    };
  }

  return {
    success: true,
    wristband: {
      id: row.id,
      wristbandCode: row.wristband_code,
      status: row.status,
      nfcUid: row.nfc_uid,
      createdAt: row.created_at
    }
  };
}

/**
 * Retrieves the event-scoped wristband inventory summary and paginated inventory list.
 * Scalable for 1,500+ wristbands without loading unnecessary child payloads.
 */
export async function getWristbandInventory(params: {
  eventId: string;
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  rangeStart?: string;
  rangeEnd?: string;
  actor?: ActorContext;
}): Promise<WristbandInventoryResult> {
  const { eventId, actor } = params;
  if (actor) {
    assertCanProvisionWristband(actor);
  }

  if (!eventId) {
    throw new WristbandDomainError('eventId is required', 'EVENT_REQUIRED', 400);
  }

  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.max(1, Math.min(500, Number(params.limit || 50)));
  const offset = (page - 1) * limit;

  // 1. Operational Summary Counts
  const summaryRow = await queryOne<{
    total: number;
    prepared: number | null;
    available: number | null;
    active: number | null;
    lost: number | null;
    damaged: number | null;
    decommissioned: number | null;
  }>(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'prepared' THEN 1 ELSE 0 END) AS prepared,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) AS lost,
      SUM(CASE WHEN status = 'damaged' THEN 1 ELSE 0 END) AS damaged,
      SUM(CASE WHEN status = 'decommissioned' THEN 1 ELSE 0 END) AS decommissioned
    FROM wristbands
    WHERE event_id = ?
  `, [eventId]);

  const summary: WristbandInventorySummary = {
    total: Number(summaryRow?.total || 0),
    prepared: Number(summaryRow?.prepared || 0),
    available: Number(summaryRow?.available || 0),
    active: Number(summaryRow?.active || 0),
    lost: Number(summaryRow?.lost || 0),
    damaged: Number(summaryRow?.damaged || 0),
    decommissioned: Number(summaryRow?.decommissioned || 0)
  };

  // 2. Build Filtered Query
  const whereClauses: string[] = ['w.event_id = ?'];
  const queryParams: any[] = [eventId];

  if (params.status && params.status !== 'all') {
    whereClauses.push('w.status = ?');
    queryParams.push(params.status);
  }

  if (params.rangeStart && params.rangeEnd) {
    whereClauses.push('w.wristband_code >= ? AND w.wristband_code <= ?');
    queryParams.push(params.rangeStart.trim().toUpperCase(), params.rangeEnd.trim().toUpperCase());
  }

  if (params.search && params.search.trim()) {
    const cleanSearch = params.search.trim();
    const upperSearch = cleanSearch.toUpperCase();
    const hexSearch = cleanSearch.replace(/[:\-\s.]/g, '').toUpperCase();
    whereClauses.push('(UPPER(w.wristband_code) LIKE ? OR UPPER(w.nfc_uid) LIKE ?)');
    queryParams.push(`%${upperSearch}%`, `%${hexSearch}%`);
  }

  const whereSql = whereClauses.join(' AND ');

  const countRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM wristbands w WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRow?.count || 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const listSql = `
    SELECT
      w.id,
      w.event_id,
      w.wristband_code,
      w.nfc_uid,
      w.status,
      w.created_by_user_id,
      w.created_at,
      w.updated_at,
      cwa.id AS active_assignment_id,
      cwa.assigned_at,
      c.full_name AS child_name,
      cee.id AS child_event_entry_id
    FROM wristbands w
    LEFT JOIN child_wristband_assignments cwa ON cwa.wristband_id = w.id AND cwa.deactivated_at IS NULL
    LEFT JOIN child_event_entries cee ON cee.id = cwa.child_event_entry_id
    LEFT JOIN children c ON c.id = cee.child_id
    WHERE ${whereSql}
    ORDER BY w.wristband_code ASC
    LIMIT ? OFFSET ?
  `;

  const rows = await query<{
    id: string;
    event_id: string;
    wristband_code: string;
    nfc_uid: string;
    status: WristbandStatus;
    created_by_user_id: string | null;
    created_at: string;
    updated_at: string;
    active_assignment_id: string | null;
    assigned_at: string | null;
    child_name: string | null;
    child_event_entry_id: string | null;
  }>(listSql, [...queryParams, limit, offset]);

  const wristbands: WristbandInventoryItem[] = rows.map(r => {
    const isAssigned = Boolean(r.active_assignment_id);
    const childName = r.child_name || undefined;

    return {
      id: r.id,
      eventId: r.event_id,
      wristbandCode: r.wristband_code,
      nfcUid: r.nfc_uid,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      assignmentState: isAssigned ? 'active' : 'unassigned',
      assignedChild: isAssigned && r.child_event_entry_id ? {
        childEventEntryId: r.child_event_entry_id,
        childName: childName || 'Assigned Child'
      } : null
    };
  });

  return {
    summary,
    wristbands,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages
    }
  };
}
