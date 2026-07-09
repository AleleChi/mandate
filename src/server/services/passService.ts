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
