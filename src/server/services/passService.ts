import crypto from 'crypto';
import { query, queryOne, execute, transaction, REAL_EVENT_ID } from '../db';

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
  eventId = REAL_EVENT_ID,
  parentId,
  issuedBy
}: IssuePassParams) {
  const child = await queryOne('SELECT * FROM children WHERE id = ?', [childId]);
  if (!child) {
    throw new Error('Child not found');
  }

  const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, eventId]);
  if (!entry) {
    throw new Error('Child event registration not found');
  }

  // Check if active pass already exists
  const existingPass = await queryOne('SELECT * FROM event_passes WHERE child_event_entry_id = ? AND status = ?', [entry.id, 'active']);
  if (existingPass) {
    return existingPass;
  }

  // Validate required photo exists in DB for child
  if (!child.photo_file_id || String(child.photo_file_id).trim() === '') {
    throw new Error('Missing required child photo for pass generation');
  }

  const passId = crypto.randomUUID();
  const passRef = `KOI-2026-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const passHash = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();

  await execute(`
    INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
  `, [passId, entry.id, passRef, passHash, now, now, now]);

  // Update entry status to 'pass_ready'
  await execute(`
    UPDATE child_event_entries
    SET status = 'pass_ready', updated_at = ?
    WHERE id = ?
  `, [now, entry.id]);

  const newPass = await queryOne('SELECT * FROM event_passes WHERE id = ?', [passId]);
  return newPass;
}

/**
 * Gets the active pass for a child event registration
 */
export async function getPassForChild(childId: string, eventId: string = REAL_EVENT_ID) {
  const entry = await queryOne('SELECT id FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, eventId]);
  if (!entry) return null;
  return await queryOne('SELECT * FROM event_passes WHERE child_event_entry_id = ? AND status = ?', [entry.id, 'active']);
}

/**
 * Optimized and memory-safe lookup for parent passes.
 * Returns both ready and pending passes.
 */
export async function getPassesForParent(parentId: string, eventId: string = REAL_EVENT_ID) {
  // Query only essential columns for parent children
  const children = await query('SELECT id, full_name, photo_file_id FROM children WHERE parent_profile_id = ?', [parentId]);
  
  const passesList = [];
  const pendingList = [];

  for (const c of children) {
    const entry = await queryOne('SELECT id, status FROM child_event_entries WHERE child_id = ? AND event_id = ?', [c.id, eventId]);
    if (!entry) continue;

    if (entry.status === 'pass_ready') {
      const pass = await queryOne('SELECT id, pass_reference, issued_at, status FROM event_passes WHERE child_event_entry_id = ? AND status = ?', [entry.id, 'active']);
      if (pass) {
        passesList.push({
          id: pass.id,
          childId: c.id,
          childName: c.full_name,
          eventName: 'Koinonia Children and Teens Event 2026',
          status: 'ready',
          passCode: pass.pass_reference,
          qrPayload: pass.pass_reference,
          issuedAt: pass.issued_at
        });
      } else {
        pendingList.push({
          childId: c.id,
          childName: c.full_name,
          eventName: 'Koinonia Children and Teens Event 2026',
          status: 'pending'
        });
      }
    } else if (entry.status === 'selected') {
      pendingList.push({
        childId: c.id,
        childName: c.full_name,
        eventName: 'Koinonia Children and Teens Event 2026',
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
export async function revokePassForChild(childId: string, eventId: string = REAL_EVENT_ID, reason: string, adminId: string) {
  const entry = await queryOne('SELECT id FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, eventId]);
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
export async function validatePassForScan(passCode: string) {
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
