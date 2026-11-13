import crypto from 'crypto';
import { query, queryOne, execute, transaction } from '../db';
import { getCurrentEventId } from './eventService';

interface IssuePassParams {
  childId: string;
  eventId?: string;
  parentId?: string;
  issuedBy?: string;
}

/**
 * Issues a unique event pass for a child if they are selected/approved
 * and have the required data (such as photo).
 */
export async function issuePassForChild({
  childId,
  eventId,
  parentId,
  issuedBy
}: IssuePassParams) {
  const child = await queryOne('SELECT * FROM children WHERE id = ?', [childId]);
  if (!child) {
    throw new Error('Child not found');
  }

  let entry = null;
  if (eventId) {
    // 1. exact child + supplied event
    entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, eventId]);
  } else {
    // 2. current event only when eventId is genuinely absent
    const currentEventId = await getCurrentEventId();
    if (currentEventId) {
      entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, currentEventId]);
    }
    // 3. avoid loose/latest-entry fallback in approval flows where an explicit event is known
    if (!entry) {
      entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? ORDER BY created_at DESC LIMIT 1', [childId]);
    }
  }

  if (!entry) {
    throw new Error('Child event registration not found');
  }

  if (entry.status === 'incomplete' || entry.status === 'draft') {
    throw new Error('Cannot issue event pass for an incomplete application draft');
  }

  // Validate required photo exists in DB for child
  if (!child.photo_file_id || String(child.photo_file_id).trim() === '') {
    throw new Error('Missing required child photo for pass generation');
  }

  // A. Check for ANY existing pass for this child_event_entry_id
  const existingPass = await queryOne('SELECT * FROM event_passes WHERE child_event_entry_id = ? LIMIT 1', [entry.id]);

  let eventYear = '2026';
  const eventRecord = await queryOne('SELECT starts_at FROM events WHERE id = ?', [entry.event_id]);
  if (eventRecord?.starts_at) {
    const y = new Date(eventRecord.starts_at).getFullYear();
    if (!isNaN(y)) eventYear = String(y);
  } else if (entry.event_id) {
    const match = String(entry.event_id).match(/\d{4}/);
    if (match) eventYear = match[0];
  }

  const now = new Date().toISOString();

  // B. Existing active pass: return it unchanged without creating another pass
  if (existingPass) {
    if (existingPass.status === 'active') {
      if (entry.status === 'selected') {
        await execute(`
          UPDATE child_event_entries
          SET status = 'pass_ready', updated_at = ?
          WHERE id = ?
        `, [now, entry.id]);
      }
      return existingPass;
    }

    // C. Existing inactive/revoked pass: reuse the same database row
    const passRef = `KOI-${eventYear}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const passHash = crypto.randomBytes(16).toString('hex');

    await execute(`
      UPDATE event_passes
      SET pass_reference = ?, pass_hash = ?, status = 'active', revoked_at = NULL, issued_at = ?, updated_at = ?
      WHERE id = ?
    `, [passRef, passHash, now, now, existingPass.id]);

    if (!['checked_in', 'inside', 'picked_up', 'checked_out'].includes(entry.status)) {
      await execute(`
        UPDATE child_event_entries
        SET status = 'pass_ready', updated_at = ?
        WHERE id = ?
      `, [now, entry.id]);
    }

    const updatedPass = await queryOne('SELECT * FROM event_passes WHERE id = ?', [existingPass.id]);
    return updatedPass;
  }

  // D. No pass exists: only then INSERT a new pass
  const passId = crypto.randomUUID();
  const passRef = `KOI-${eventYear}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const passHash = crypto.randomBytes(16).toString('hex');

  await execute(`
    INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
  `, [passId, entry.id, passRef, passHash, now, now, now]);

  if (!['checked_in', 'inside', 'picked_up', 'checked_out'].includes(entry.status)) {
    await execute(`
      UPDATE child_event_entries
      SET status = 'pass_ready', updated_at = ?
      WHERE id = ?
    `, [now, entry.id]);
  }

  const newPass = await queryOne('SELECT * FROM event_passes WHERE id = ?', [passId]);
  return newPass;
}

/**
 * Gets the active pass for a child event registration
 */
export async function getPassForChild(childId: string, eventId?: string) {
  let entry = null;
  if (eventId) {
    entry = await queryOne('SELECT id FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, eventId]);
  } else {
    const targetEventId = await getCurrentEventId();
    if (targetEventId) {
      entry = await queryOne('SELECT id FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, targetEventId]);
    }
    if (!entry) {
      entry = await queryOne('SELECT id FROM child_event_entries WHERE child_id = ? ORDER BY created_at DESC LIMIT 1', [childId]);
    }
  }
  if (!entry) return null;
  return await queryOne('SELECT * FROM event_passes WHERE child_event_entry_id = ? AND status = ?', [entry.id, 'active']);
}

/**
 * Optimized and memory-safe lookup for parent passes.
 * Returns both ready and pending passes.
 */
export async function getPassesForParent(parentId: string, eventId?: string) {
  const targetEventId = eventId || (await getCurrentEventId());
  if (!targetEventId) {
    return {
      passes: [],
      pending: []
    };
  }

  const currentEvent = await queryOne('SELECT id, title FROM events WHERE id = ?', [targetEventId]);
  const eventName = currentEvent?.title || 'Koinonia Event';

  // Query only essential columns for parent children
  const children = await query('SELECT id, full_name, photo_file_id FROM children WHERE parent_profile_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)', [parentId]);
  
  const passesList = [];
  const pendingList = [];

  for (const c of children) {
    const entry = await queryOne('SELECT id, status FROM child_event_entries WHERE child_id = ? AND event_id = ?', [c.id, targetEventId]);
    if (!entry) continue;

    const pass = await queryOne('SELECT id, pass_reference, issued_at, status FROM event_passes WHERE child_event_entry_id = ? AND status = ?', [entry.id, 'active']);
    if (pass) {
      passesList.push({
        id: pass.id,
        childId: c.id,
        childName: c.full_name,
        eventName,
        status: 'ready',
        passCode: pass.pass_reference,
        qrPayload: pass.pass_reference,
        issuedAt: pass.issued_at
      });
    } else if (entry.status === 'pass_ready' || entry.status === 'selected') {
      pendingList.push({
        childId: c.id,
        childName: c.full_name,
        eventName,
        status: 'pending'
      });
    }
  }

  return {
    passes: passesList,
    pending: pendingList
  };
}

/**
 * Revokes a pass and puts the child back to review_reopened status
 */
export async function revokePassForChild(childId: string, eventId?: string, reason?: string, adminId?: string) {
  const targetEventId = eventId || (await getCurrentEventId());
  if (!targetEventId) {
    throw new Error('Registration not found');
  }

  const entry = await queryOne('SELECT id FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, targetEventId]);
  if (!entry) {
    throw new Error('Registration not found');
  }

  const pass = await queryOne('SELECT id FROM event_passes WHERE child_event_entry_id = ? AND status = ?', [entry.id, 'active']);
  if (!pass) {
    throw new Error('Active pass not found');
  }

  const now = new Date().toISOString();
  await execute(`
    UPDATE event_passes
    SET status = 'revoked', revoked_at = ?, updated_at = ?
    WHERE id = ?
  `, [now, now, pass.id]);

  await execute(`
    UPDATE child_event_entries
    SET status = 'review_reopened', updated_at = ?
    WHERE id = ?
  `, [now, entry.id]);

  return { success: true };
}

/**
 * Securely validates an incoming scanned pass barcode or pass code.
 */
export async function validatePassForScan(passCode: string, expectedEventId?: string | null) {
  const cleanRef = String(passCode).trim().toUpperCase();
  const pass = await queryOne('SELECT * FROM event_passes WHERE pass_reference = ? OR id = ?', [cleanRef, passCode]);
  if (!pass) {
    return { valid: false, reason: 'missing_pass' };
  }

  if (pass.status !== 'active') {
    return { valid: false, reason: 'inactive_pass' };
  }

  const entry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [pass.child_event_entry_id]);
  if (!entry) {
    return { valid: false, reason: 'missing_registration' };
  }

  // Cross-event validation: check against expected or current event
  const targetEventId = expectedEventId !== undefined ? expectedEventId : (await getCurrentEventId());
  if (targetEventId && entry.event_id !== targetEventId) {
    return {
      valid: false,
      reason: 'wrong_event',
      message: 'This pass belongs to a different event.'
    };
  }

  const allowedStatuses = ['pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out'];
  if (!allowedStatuses.includes(entry.status)) {
    return { valid: false, reason: 'invalid_status' };
  }

  const child = await queryOne('SELECT * FROM children WHERE id = ?', [entry.child_id]);
  if (!child) {
    return { valid: false, reason: 'missing_child' };
  }

  return {
    valid: true,
    pass,
    entry,
    child
  };
}

/**
 * Retrieves a pass by pass ID for administrative/history inspection.
 */
export async function getPassById(passId: string) {
  return await queryOne(`
    SELECT p.*, e.event_id, e.child_id
    FROM event_passes p
    JOIN child_event_entries e ON p.child_event_entry_id = e.id
    WHERE p.id = ?
  `, [passId]);
}

/**
 * Retrieves an active pass by child_event_entry_id for administrative/history inspection.
 */
export async function getPassByEntryId(entryId: string) {
  return await queryOne('SELECT * FROM event_passes WHERE child_event_entry_id = ? AND status = ?', [entryId, 'active']);
}

const SECRET_KEY = process.env.JWT_SECRET || 'koinonia-secret-key-default-2026';

// In-memory cache for active pass authorizations (parentProfileId:childId -> expiresAt)
const activePassAuthorizations = new Map<string, number>();
// In-memory cache for parent revocation timestamps (parentProfileId -> revokedAt)
const revokedParentTimestamps = new Map<string, number>();

function getPassTokenHash(parentProfileId: string, childId: string): string {
  return crypto.createHash('sha256').update(`child_pass_auth:${parentProfileId}:${childId}`).digest('hex');
}

/**
 * Authorizes short-lived pass access for a specific child under a parent.
 * Default lifetime: 15 minutes (900,000 ms).
 * Backed by both HMAC-SHA256 signature and persistent DB storage in `auth_tokens`
 * to survive server/Render process restarts without requiring schema migrations.
 */
export async function authorizeChildPass(
  parentProfileId: string,
  childId: string,
  ttlMs: number = 15 * 60 * 1000,
  userId?: string
): Promise<{ passToken: string; expiresAt: number }> {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const key = `${parentProfileId}:${childId}`;
  if (expiresAt > now) {
    activePassAuthorizations.set(key, expiresAt);
  }

  const payload = Buffer.from(JSON.stringify({
    parentProfileId,
    childId,
    iat: now,
    exp: expiresAt,
    nonce: crypto.randomUUID()
  })).toString('base64url');

  const signature = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('base64url');
  const passToken = `${payload}.${signature}`;

  // Persist to existing auth_tokens table for durability across Render restarts
  try {
    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const parent = await queryOne('SELECT user_id FROM parent_profiles WHERE id = ?', [parentProfileId]);
      resolvedUserId = parent?.user_id;
    }
    if (resolvedUserId && expiresAt > now) {
      const tokenHash = getPassTokenHash(parentProfileId, childId);
      const nowIso = new Date(now).toISOString();
      const expIso = new Date(expiresAt).toISOString();

      await execute('DELETE FROM auth_tokens WHERE token_hash = ?', [tokenHash]);
      await execute(`
        INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
        VALUES (?, ?, ?, 'child_pass_authorization', ?, ?)
      `, [crypto.randomUUID(), resolvedUserId, tokenHash, expIso, nowIso]);
    }
  } catch (err) {
    console.warn('[PassAuth] Error persisting pass authorization to auth_tokens:', err);
  }

  return { passToken, expiresAt };
}

/**
 * Verifies if pass access is currently authorized for a given child under a parent.
 * Validates:
 * 1. Fast in-memory cache (if present and unexpired)
 * 2. Cryptographic HMAC token (if provided in header/param)
 * 3. Persistent auth_tokens record in DB (survives Render restarts)
 */
export async function isChildPassAuthorized(
  parentProfileId: string,
  childId: string,
  passToken?: string
): Promise<boolean> {
  const key = `${parentProfileId}:${childId}`;
  const now = Date.now();

  // 1. Check in-memory store
  const memoryExpiresAt = activePassAuthorizations.get(key);
  if (memoryExpiresAt) {
    if (now < memoryExpiresAt) {
      return true;
    }
    activePassAuthorizations.delete(key);
  }

  // 2. Check signed token fallback
  if (passToken && typeof passToken === 'string') {
    try {
      const [payload, sig] = passToken.split('.');
      if (payload && sig) {
        const expectedSig = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('base64url');
        if (sig === expectedSig) {
          const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
          if (data.parentProfileId === parentProfileId && data.childId === childId && now < data.exp) {
            const revokedAt = revokedParentTimestamps.get(parentProfileId);
            if (!revokedAt || !data.iat || data.iat > revokedAt) {
              activePassAuthorizations.set(key, data.exp);
              return true;
            }
          }
        }
      }
    } catch {
      // Fall through to DB check
    }
  }

  // 3. Persistent DB check in existing auth_tokens table
  try {
    const tokenHash = getPassTokenHash(parentProfileId, childId);
    const dbToken = await queryOne(`
      SELECT expires_at, used_at FROM auth_tokens
      WHERE token_hash = ? AND token_type = 'child_pass_authorization'
    `, [tokenHash]);

    if (dbToken && !dbToken.used_at) {
      const dbExpTime = new Date(dbToken.expires_at).getTime();
      if (now < dbExpTime) {
        activePassAuthorizations.set(key, dbExpTime);
        return true;
      } else {
        await execute('DELETE FROM auth_tokens WHERE token_hash = ?', [tokenHash]);
      }
    }
  } catch (err) {
    console.warn('[PassAuth] Error verifying pass authorization from auth_tokens:', err);
  }

  return false;
}

export async function revokeChildPassAuthorizations(parentProfileId: string, childId?: string): Promise<void> {
  if (childId) {
    activePassAuthorizations.delete(`${parentProfileId}:${childId}`);
    try {
      const tokenHash = getPassTokenHash(parentProfileId, childId);
      const nowIso = new Date().toISOString();
      await execute("UPDATE auth_tokens SET used_at = 'revoked', revoked_at = ? WHERE token_hash = ?", [nowIso, tokenHash]);
    } catch {}
  } else {
    revokedParentTimestamps.set(parentProfileId, Date.now());
    for (const key of Array.from(activePassAuthorizations.keys())) {
      if (key.startsWith(`${parentProfileId}:`)) {
        activePassAuthorizations.delete(key);
      }
    }
    try {
      const parent = await queryOne('SELECT user_id FROM parent_profiles WHERE id = ?', [parentProfileId]);
      if (parent?.user_id) {
        const nowIso = new Date().toISOString();
        await execute(`
          UPDATE auth_tokens SET used_at = 'revoked', revoked_at = ?
          WHERE user_id = ? AND token_type = 'child_pass_authorization' AND used_at IS NULL
        `, [nowIso, parent.user_id]);
      }
    } catch {}
  }
}

/**
 * Test helper to simulate process memory reset (e.g. Render restart).
 */
export function _clearInMemoryPassCache(): void {
  activePassAuthorizations.clear();
  revokedParentTimestamps.clear();
}

/**
 * Centralized, canonical pass reference normalizer.
 * Supports:
 * - KOI-2026-F69E8A
 * - F69E8A (6-hex character short form)
 * - KCT:KOI-2026-F69E8A or KCT:F69E8A
 * - PASS-F69E8A
 * - URLs containing /pass/, ?code=, ?pass=, ?ref=, ?token=
 * Returns canonical format: KOI-2026-XXXXXX (or original uppercase string if unrecognized).
 */
export function normalizePassReference(input: string | null | undefined): string {
  if (!input) return '';
  let str = String(input).trim();
  if (!str) return '';

  // 1. URL extraction
  if (str.includes('/pass/')) {
    str = str.split('/pass/')[1]?.split('?')[0]?.replace(/\/$/, '') || str;
  }
  if (str.includes('code=')) {
    str = str.split('code=')[1]?.split('&')[0] || str;
  } else if (str.includes('pass=')) {
    str = str.split('pass=')[1]?.split('&')[0] || str;
  } else if (str.includes('ref=')) {
    str = str.split('ref=')[1]?.split('&')[0] || str;
  } else if (str.includes('token=')) {
    str = str.split('token=')[1]?.split('&')[0] || str;
  }

  // URL decode if percent-encoded
  try {
    str = decodeURIComponent(str);
  } catch {}

  str = str.trim().toUpperCase();

  // Strip known prefixes
  if (str.startsWith('KCT:')) {
    str = str.substring(4).trim();
  }
  if (str.startsWith('PASS-')) {
    str = str.substring(5).trim();
    if (!str.startsWith('KOI-2026-') && /^[0-9A-F]{6}$/i.test(str)) {
      str = `KOI-2026-${str}`;
    }
    return str;
  }

  // 6-character hex short reference (e.g. F69E8A -> KOI-2026-F69E8A)
  if (!str.startsWith('KOI-2026-') && /^[0-9A-F]{6}$/i.test(str)) {
    str = `KOI-2026-${str}`;
  }

  return str;
}
