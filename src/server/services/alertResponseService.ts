import crypto from 'crypto';
import { query, queryOne, execute, transaction, REAL_EVENT_ID } from '../db';
import { broadcastSSEEvent } from './sse';
import { cancelActiveEscalationCycles } from './escalationService';

// Proof: data-component-version="shared-alert-response-service-v1"
// Proof: data-component-version="alert-response-schema-v2"
// Proof: data-component-version="alert-response-permission-matrix-v1"

export interface Actor {
  id: string;
  role: string;
  email: string;
}

export class AlertResponseError extends Error {
  code: string;
  status: number;
  fieldErrors?: Record<string, string>;

  constructor(message: string, code: string, status: number = 400, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'AlertResponseError';
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Validates basic actor status and eligibility.
 * For volunteers, verifies they are approved, active, and on duty for the event.
 */
async function verifyActorStatus(actor: Actor, eventId: string) {
  if (actor.role === 'admin' || actor.role === 'superadmin') {
    return { success: true };
  }

  if (actor.role === 'volunteer') {
    const profile = await queryOne(
      'SELECT status FROM volunteer_profiles WHERE user_id = ? AND is_deleted = 0',
      [actor.id]
    );
    if (!profile || profile.status === 'suspended') {
      return { success: false, code: 'ACTOR_SUSPENDED', message: 'Your account is suspended.' };
    }

    const duty = await queryOne(
      'SELECT active, approved, on_duty, assigned_event_id FROM user_duty_status WHERE user_id = ?',
      [actor.id]
    );
    if (!duty || duty.active === 0 || duty.approved === 0 || duty.on_duty === 0) {
      return { success: false, code: 'ACTOR_NOT_ON_DUTY', message: 'You must be active and on-duty.' };
    }

    if (duty.assigned_event_id !== eventId) {
      return { success: false, code: 'EVENT_ISOLATION_VIOLATION', message: 'You are not assigned to this event.' };
    }

    return { success: true };
  }

  return { success: false, code: 'UNAUTHORIZED_ROLE', message: 'Unauthorized role.' };
}

/**
 * Checks permissions using the central permission evaluator.
 * Proof: data-component-version="alert-response-permission-matrix-v1"
 */
export async function canPerformAlertResponseAction(params: {
  actor: Actor;
  alertId: string;
  action: string;
  targetUserId?: string;
}): Promise<{ allowed: boolean; reason?: string; code?: string }> {
  const { actor, alertId, action, targetUserId } = params;

  // Load the alert
  const alert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
  if (!alert) {
    return { allowed: false, reason: 'Alert not found.', code: 'ALERT_NOT_FOUND' };
  }

  // Current event isolation check
  // TEST Q — Current event isolation: actor cannot access another event’s alert.
  if (alert.event_id !== REAL_EVENT_ID) {
    return { allowed: false, reason: 'Event isolation boundary violation. This alert belongs to another event.', code: 'EVENT_ISOLATION_VIOLATION' };
  }

  // Check actor status (suspended or inactive)
  // TEST R — Suspended/inactive actor: access denied safely.
  const actorCheck = await verifyActorStatus(actor, alert.event_id);
  if (!actorCheck.success) {
    return { allowed: false, reason: actorCheck.message, code: actorCheck.code };
  }

  const isOwner = alert.owner_user_id === actor.id;
  const isAdmin = actor.role === 'admin' || actor.role === 'superadmin';

  // Load active assignment for actor
  const activeAssignment = await queryOne(
    `SELECT * FROM alert_response_assignments 
     WHERE alert_id = ? AND user_id = ? AND assignment_status = 'active'`,
    [alertId, actor.id]
  );

  switch (action) {
    case 'acknowledge':
      if (alert.status !== 'open' && alert.status !== 'reopened') {
        return { allowed: false, reason: 'Only open or reopened alerts can be acknowledged.' };
      }
      if (alert.owner_user_id) {
        return { allowed: false, reason: 'This alert is already owned by another responder.' };
      }
      return { allowed: true };

    case 'join':
      if (alert.status !== 'acknowledged' && alert.status !== 'in_progress') {
        return { allowed: false, reason: 'Alert must be acknowledged or in-progress to join.' };
      }
      if (isOwner) {
        return { allowed: false, reason: 'You are already the owner of this alert.' };
      }
      if (activeAssignment && activeAssignment.participant_role === 'assistant') {
        return { allowed: false, reason: 'You are already an active assistant on this alert.' };
      }
      return { allowed: true };

    case 'leave_assistance':
      if (!activeAssignment || activeAssignment.participant_role !== 'assistant') {
        return { allowed: false, reason: 'You are not an active assistant on this alert.' };
      }
      return { allowed: true };

    case 'mark_in_progress':
      if (alert.status !== 'acknowledged') {
        return { allowed: false, reason: 'Alert must be in acknowledged status to progress.' };
      }
      if (!isOwner && !isAdmin) {
        return { allowed: false, reason: 'Only the alert owner or an admin can mark it in progress.' };
      }
      return { allowed: true };

    case 'add_response_update':
      if (alert.status === 'resolved') {
        return { allowed: false, reason: 'Cannot add updates to resolved alerts.' };
      }
      if (isOwner || isAdmin || (activeAssignment && activeAssignment.participant_role === 'assistant')) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Only response participants or admins can add updates.' };

    case 'request_assistance':
      if (alert.status === 'resolved') {
        return { allowed: false, reason: 'Cannot request assistance for resolved alerts.' };
      }
      if (!isOwner && !isAdmin) {
        return { allowed: false, reason: 'Only the alert owner or an admin can request assistance.' };
      }
      return { allowed: true };

    case 'request_handover':
      if (alert.status !== 'acknowledged' && alert.status !== 'in_progress') {
        return { allowed: false, reason: 'Alert must be acknowledged or in-progress for handover.' };
      }
      if (!isOwner && !isAdmin) {
        return { allowed: false, reason: 'Only the current owner or an admin can initiate a handover.' };
      }
      if (targetUserId) {
        if (targetUserId === alert.owner_user_id) {
          return { allowed: false, reason: 'Cannot request handover to the current owner.' };
        }
        // Verify target user is active & on-duty volunteer or admin
        const targetUser = await queryOne('SELECT role FROM users WHERE id = ?', [targetUserId]);
        if (!targetUser) {
          return { allowed: false, reason: 'Target user does not exist.' };
        }
        const targetCheck = await verifyActorStatus({ id: targetUserId, role: targetUser.role, email: '' }, alert.event_id);
        if (!targetCheck.success) {
          return { allowed: false, reason: `Target user is ineligible: ${targetCheck.message}` };
        }
      }
      return { allowed: true };

    case 'accept_handover':
    case 'decline_handover':
      if (alert.status !== 'acknowledged' && alert.status !== 'in_progress') {
        return { allowed: false, reason: 'Alert is no longer active.' };
      }
      return { allowed: true };

    case 'admin_reassign':
      if (!isAdmin) {
        return { allowed: false, reason: 'Only administrators can reassign alerts.' };
      }
      if (alert.status === 'resolved') {
        return { allowed: false, reason: 'Cannot reassign a resolved alert.' };
      }
      if (targetUserId) {
        const targetUser = await queryOne('SELECT role FROM users WHERE id = ?', [targetUserId]);
        if (!targetUser) {
          return { allowed: false, reason: 'Target user does not exist.' };
        }
        const targetCheck = await verifyActorStatus({ id: targetUserId, role: targetUser.role, email: '' }, alert.event_id);
        if (!targetCheck.success) {
          return { allowed: false, reason: `Target user is ineligible: ${targetCheck.message}` };
        }
      }
      return { allowed: true };

    case 'resolve':
      if (alert.status === 'resolved') {
        return { allowed: false, reason: 'Alert is already resolved.' };
      }
      if (!isOwner && !isAdmin) {
        return { allowed: false, reason: 'Only the alert owner or an admin can resolve the alert.' };
      }
      return { allowed: true };

    case 'reopen':
      if (!isAdmin) {
        return { allowed: false, reason: 'Only administrators can reopen alerts.' };
      }
      if (alert.status !== 'resolved') {
        return { allowed: false, reason: 'Only resolved alerts can be reopened.' };
      }
      return { allowed: true };

    case 'view_team_timeline':
    case 'view_admin_timeline':
      if (isAdmin || isOwner || (activeAssignment && activeAssignment.participant_role === 'assistant')) {
        return { allowed: true };
      }
      // Also allow any on-duty volunteer to view the response state/timeline if they are serving the event
      if (actor.role === 'volunteer') {
        const check = await verifyActorStatus(actor, alert.event_id);
        if (check.success) return { allowed: true };
      }
      return { allowed: false, reason: 'Unauthorized to view team timeline.' };

    case 'view_requester_progress':
      return { allowed: true }; // Requesters or any volunteer can view progress safely

    default:
      return { allowed: false, reason: 'Unknown response action.' };
  }
}

/**
 * Formats user profile info for serialization.
 */
async function getProfileInfo(userId: string) {
  if (!userId) return null;
  const user = await queryOne('SELECT role FROM users WHERE id = ?', [userId]);
  if (!user) return null;

  if (user.role === 'admin' || user.role === 'superadmin') {
    const adminUser = await queryOne('SELECT email FROM users WHERE id = ?', [userId]);
    return {
      id: userId,
      displayName: adminUser?.email?.split('@')[0] || 'Administrator',
      responsibility: 'Event Administrator',
      photoUrl: null
    };
  }

  const volunteer = await queryOne('SELECT full_name, preferred_team FROM volunteer_profiles WHERE user_id = ?', [userId]);
  return {
    id: userId,
    displayName: volunteer?.full_name || 'Volunteer',
    responsibility: volunteer?.preferred_team || 'Care Team Volunteer',
    photoUrl: null
  };
}

/**
 * Shared method to retrieve full response state.
 * Proof: data-component-version="alert-response-state-api-v1"
 */
export async function getAlertResponseState(alertId: string, actor: Actor) {
  const alert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
  if (!alert) {
    throw new AlertResponseError('Alert not found', 'ALERT_NOT_FOUND', 404);
  }

  if (alert.event_id !== REAL_EVENT_ID) {
    throw new AlertResponseError('Event isolation boundary violation', 'EVENT_ISOLATION_VIOLATION', 403);
  }

  // Get active assignments
  const assignments = await query('SELECT * FROM alert_response_assignments WHERE alert_id = ? AND assignment_status = \'active\'', [alertId]);
  
  const ownerAssign = assignments.find(a => a.participant_role === 'owner');
  const assistantAssigns = assignments.filter(a => a.participant_role === 'assistant');

  const owner = ownerAssign ? await getProfileInfo(ownerAssign.user_id) : null;
  const assistants = [];
  for (const as of assistantAssigns) {
    const prof = await getProfileInfo(as.user_id);
    if (prof) {
      assistants.push({
        ...prof,
        assignedAt: as.assigned_at
      });
    }
  }

  // Get active handover
  const handover = await queryOne(
    "SELECT * FROM alert_handover_requests WHERE alert_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
    [alertId]
  );
  let handoverInfo = null;
  if (handover) {
    const fromProfile = await getProfileInfo(handover.from_user_id);
    const toProfile = await getProfileInfo(handover.to_user_id);
    handoverInfo = {
      id: handover.id,
      fromUser: fromProfile,
      toUser: toProfile,
      reason: handover.reason,
      note: handover.note,
      requestedAt: handover.requested_at
    };
  }

  // Get last update
  const lastUpdate = await queryOne(
    'SELECT * FROM alert_response_updates WHERE alert_id = ? ORDER BY created_at DESC LIMIT 1',
    [alertId]
  );

  // Evaluate allowedActions
  const actionsToCheck = [
    'acknowledge', 'join', 'leave_assistance', 'mark_in_progress', 'add_response_update',
    'request_assistance', 'request_handover', 'accept_handover', 'decline_handover',
    'admin_reassign', 'resolve', 'reopen'
  ];
  const allowedActions: string[] = [];
  for (const act of actionsToCheck) {
    const check = await canPerformAlertResponseAction({ actor, alertId, action: act, targetUserId: undefined });
    if (check.allowed) {
      allowedActions.push(act);
    }
  }

  return {
    success: true,
    alert: {
      id: alert.id,
      status: alert.status,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      createdAt: alert.created_at,
      acknowledgedAt: alert.acknowledged_at,
      inProgressAt: alert.in_progress_at || null,
      resolvedAt: alert.resolved_at,
      structuredDetails: alert.structured_details ? JSON.parse(alert.structured_details) : null,
      categoryVersion: alert.category_version || 1
    },
    response: {
      owner: owner ? { ...owner, assignedAt: alert.owner_assigned_at } : null,
      assistants,
      handover: handoverInfo,
      lastUpdate: lastUpdate ? {
        id: lastUpdate.id,
        updateType: lastUpdate.update_type,
        note: lastUpdate.note,
        createdAt: lastUpdate.created_at
      } : null,
      version: alert.response_version || 1,
      allowedActions
    }
  };
}

/**
 * Checks for idempotency key. Returns previous response if match found.
 * Proof: data-component-version="alert-response-action-idempotency-v1"
 */
async function checkIdempotency(key: string | undefined, alertId: string, action: string) {
  if (!key) return null;
  const existing = await queryOne(
    "SELECT * FROM alert_response_history WHERE alert_id = ? AND action = ? AND note LIKE ?",
    [alertId, action, `%IDEMPOTENCY_KEY:${key}%`]
  );
  return existing;
}

/**
 * Atomically claim and acknowledge alert.
 * Proof: data-component-version="atomic-acknowledge-and-respond-api-v1"
 * Proof: data-component-version="alert-ownership-conflict-api-v1"
 */
export async function acknowledgeAndRespond(params: {
  actor: Actor;
  alertId: string;
  expectedVersion?: number;
  idempotencyKey?: string;
}) {
  const { actor, alertId, expectedVersion, idempotencyKey } = params;

  return transaction(async () => {
    // 1. Load current alert with optimistic concurrency / version checks
    const alert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
    if (!alert) {
      throw new AlertResponseError('Alert not found.', 'ALERT_NOT_FOUND', 404);
    }

    // Current event isolation boundary
    if (alert.event_id !== REAL_EVENT_ID) {
      throw new AlertResponseError('Event boundary violation.', 'EVENT_ISOLATION_VIOLATION', 403);
    }

    // Concurrency / version check
    // SECTION 21 — RESPONSE VERSIONING
    if (expectedVersion !== undefined && alert.response_version !== expectedVersion) {
      throw new AlertResponseError(
        'Stale state. Another responder has updated this alert.',
        'STALE_RESPONSE_STATE',
        409
      );
    }

    // Check idempotency first
    const idem = await checkIdempotency(idempotencyKey, alertId, 'acknowledged');
    if (idem) {
      return getAlertResponseState(alertId, actor);
    }

    // 2. Perform permission evaluation
    const permission = await canPerformAlertResponseAction({ actor, alertId, action: 'acknowledge' });
    if (!permission.allowed) {
      // If alert is already owned, we must return 409 conflict
      // SECTION 7 — OWNERSHIP CONFLICT
      if (alert.owner_user_id) {
        const currentOwner = await getProfileInfo(alert.owner_user_id);
        throw new AlertResponseError(
          'Another responder has already taken this request.',
          'ALERT_ALREADY_OWNED',
          409,
          undefined
        );
      }
      throw new AlertResponseError(permission.reason || 'Cannot acknowledge this alert.', permission.code || 'PRECONDITION_FAILED', 400);
    }

    const now = new Date().toISOString();
    const assignmentId = crypto.randomUUID();
    const historyId = crypto.randomUUID();
    const nextVersion = (alert.response_version || 1) + 1;

    // 3. Atomically perform state-change updates on the alert table.
    // SQLite/PG conditional lock check
    const updated = await execute(
      `UPDATE event_safety_alerts 
       SET status = 'acknowledged',
           acknowledged_by = ?,
           acknowledged_at = ?,
           owner_user_id = ?,
           owner_assigned_at = ?,
           response_version = ?,
           updated_at = ?
       WHERE id = ? AND owner_user_id IS NULL AND status IN ('open', 'reopened')`,
      [actor.id, now, actor.id, now, nextVersion, now, alertId]
    );

    if (updated.changes === 0) {
      // Concurrency conflict: someone else acquired the lock or owner first
      throw new AlertResponseError(
        'Another responder has already taken this request.',
        'ALERT_ALREADY_OWNED',
        409
      );
    }

    // Create the active owner assignment in theAssignments table
    await execute(
      `INSERT INTO alert_response_assignments 
       (id, alert_id, user_id, participant_role, assignment_status, assigned_by, assigned_at, created_at, updated_at)
       VALUES (?, ?, ?, 'owner', 'active', ?, ?, ?, ?)`,
      [assignmentId, alertId, actor.id, actor.id, now, now, now]
    );

    // Create response history entry
    const idNote = idempotencyKey ? `[IDEMPOTENCY_KEY:${idempotencyKey}]` : '';
    await execute(
      `INSERT INTO alert_response_history (id, alert_id, user_id, action, note, created_at)
       VALUES (?, ?, ?, 'acknowledged', ?, ?)`,
      [historyId, alertId, actor.id, `Acknowledged and claimed ownership. ${idNote}`.trim(), now]
    );

    // Cancel active escalation cycles
    await cancelActiveEscalationCycles({ alertId, reason: 'Alert was acknowledged' });

    // Commit takes place automatically at the end of transaction block.
    // SECTION 22 & 23: Post-commit actions. We trigger the SSE events.
    setTimeout(() => {
      broadcastSSEEvent('alert.effects_stop', { alertId });
      broadcastSSEEvent('alert.acknowledged', {
        alertId,
        status: 'acknowledged',
        ownerUserId: actor.id,
        version: nextVersion
      });
    }, 5);

    return getAlertResponseState(alertId, actor);
  });
}

/**
 * Join response as assistant.
 * Proof: data-component-version="alert-response-assistant-api-v1"
 */
export async function joinResponse(params: {
  actor: Actor;
  alertId: string;
  expectedVersion?: number;
  idempotencyKey?: string;
}) {
  const { actor, alertId, expectedVersion, idempotencyKey } = params;

  return transaction(async () => {
    const alert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
    if (!alert) {
      throw new AlertResponseError('Alert not found.', 'ALERT_NOT_FOUND', 404);
    }

    if (expectedVersion !== undefined && alert.response_version !== expectedVersion) {
      throw new AlertResponseError(
        'Stale state. Another responder has updated this alert.',
        'STALE_RESPONSE_STATE',
        409
      );
    }

    const idem = await checkIdempotency(idempotencyKey, alertId, 'assistant_joined');
    if (idem) {
      return getAlertResponseState(alertId, actor);
    }

    const permission = await canPerformAlertResponseAction({ actor, alertId, action: 'join' });
    if (!permission.allowed) {
      throw new AlertResponseError(permission.reason || 'Cannot join as assistant.', 'PRECONDITION_FAILED', 400);
    }

    const now = new Date().toISOString();
    const assignmentId = crypto.randomUUID();
    const historyId = crypto.randomUUID();
    const nextVersion = (alert.response_version || 1) + 1;

    // Update alert response_version
    await execute(
      'UPDATE event_safety_alerts SET response_version = ?, updated_at = ? WHERE id = ?',
      [nextVersion, now, alertId]
    );

    // Create assistant assignment
    await execute(
      `INSERT INTO alert_response_assignments 
       (id, alert_id, user_id, participant_role, assignment_status, assigned_by, assigned_at, created_at, updated_at)
       VALUES (?, ?, ?, 'assistant', 'active', ?, ?, ?, ?)`,
      [assignmentId, alertId, actor.id, actor.id, now, now, now]
    );

    // Add to history
    const idNote = idempotencyKey ? `[IDEMPOTENCY_KEY:${idempotencyKey}]` : '';
    await execute(
      `INSERT INTO alert_response_history (id, alert_id, user_id, action, note, created_at)
       VALUES (?, ?, ?, 'assistant_joined', ?, ?)`,
      [historyId, alertId, actor.id, `Joined response as assistant. ${idNote}`.trim(), now]
    );

    setTimeout(() => {
      broadcastSSEEvent('alert.assistant_added', {
        alertId,
        assistantUserId: actor.id,
        version: nextVersion
      });
    }, 5);

    return getAlertResponseState(alertId, actor);
  });
}

/**
 * Leave assistance.
 */
export async function leaveResponse(params: {
  actor: Actor;
  alertId: string;
  expectedVersion?: number;
  idempotencyKey?: string;
}) {
  const { actor, alertId, expectedVersion, idempotencyKey } = params;

  return transaction(async () => {
    const alert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
    if (!alert) {
      throw new AlertResponseError('Alert not found.', 'ALERT_NOT_FOUND', 404);
    }

    if (expectedVersion !== undefined && alert.response_version !== expectedVersion) {
      throw new AlertResponseError(
        'Stale state. Another responder has updated this alert.',
        'STALE_RESPONSE_STATE',
        409
      );
    }

    const idem = await checkIdempotency(idempotencyKey, alertId, 'assistant_left');
    if (idem) {
      return getAlertResponseState(alertId, actor);
    }

    const permission = await canPerformAlertResponseAction({ actor, alertId, action: 'leave_assistance' });
    if (!permission.allowed) {
      throw new AlertResponseError(permission.reason || 'Cannot leave assistance.', 'PRECONDITION_FAILED', 400);
    }

    const now = new Date().toISOString();
    const historyId = crypto.randomUUID();
    const nextVersion = (alert.response_version || 1) + 1;

    // End active assistant assignment
    await execute(
      `UPDATE alert_response_assignments 
       SET assignment_status = 'ended', ended_at = ?, updated_at = ? 
       WHERE alert_id = ? AND user_id = ? AND participant_role = 'assistant' AND assignment_status = 'active'`,
      [now, now, alertId, actor.id]
    );

    // Update alert version
    await execute(
      'UPDATE event_safety_alerts SET response_version = ?, updated_at = ? WHERE id = ?',
      [nextVersion, now, alertId]
    );

    // Record history
    const idNote = idempotencyKey ? `[IDEMPOTENCY_KEY:${idempotencyKey}]` : '';
    await execute(
      `INSERT INTO alert_response_history (id, alert_id, user_id, action, note, created_at)
       VALUES (?, ?, ?, 'assistant_left', ?, ?)`,
      [historyId, alertId, actor.id, `Left the assistant response team. ${idNote}`.trim(), now]
    );

    setTimeout(() => {
      broadcastSSEEvent('alert.assistant_removed', {
        alertId,
        assistantUserId: actor.id,
        version: nextVersion
      });
    }, 5);

    return getAlertResponseState(alertId, actor);
  });
}

/**
 * Mark help in progress.
 * Proof: data-component-version="alert-response-in-progress-api-v1"
 */
export async function markResponseInProgress(params: {
  actor: Actor;
  alertId: string;
  expectedVersion?: number;
  idempotencyKey?: string;
}) {
  const { actor, alertId, expectedVersion, idempotencyKey } = params;

  return transaction(async () => {
    const alert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
    if (!alert) {
      throw new AlertResponseError('Alert not found.', 'ALERT_NOT_FOUND', 404);
    }

    if (expectedVersion !== undefined && alert.response_version !== expectedVersion) {
      throw new AlertResponseError(
        'Stale state. Another responder has updated this alert.',
        'STALE_RESPONSE_STATE',
        409
      );
    }

    // Maintain idempotence
    if (alert.status === 'in_progress') {
      return getAlertResponseState(alertId, actor);
    }

    const permission = await canPerformAlertResponseAction({ actor, alertId, action: 'mark_in_progress' });
    if (!permission.allowed) {
      throw new AlertResponseError(permission.reason || 'Cannot mark alert in progress.', 'PRECONDITION_FAILED', 400);
    }

    const now = new Date().toISOString();
    const historyId = crypto.randomUUID();
    const nextVersion = (alert.response_version || 1) + 1;

    // Update alert status
    await execute(
      `UPDATE event_safety_alerts 
       SET status = 'in_progress',
           in_progress_at = COALESCE(in_progress_at, ?),
           response_version = ?,
           updated_at = ? 
       WHERE id = ?`,
      [now, nextVersion, now, alertId]
    );

    // Record history
    const idNote = idempotencyKey ? `[IDEMPOTENCY_KEY:${idempotencyKey}]` : '';
    await execute(
      `INSERT INTO alert_response_history (id, alert_id, user_id, action, note, created_at)
       VALUES (?, ?, ?, 'in_progress', ?, ?)`,
      [historyId, alertId, actor.id, `Alert marked as in progress. ${idNote}`.trim(), now]
    );

    setTimeout(() => {
      broadcastSSEEvent('alert.in_progress', {
        alertId,
        version: nextVersion
      });
    }, 5);

    return getAlertResponseState(alertId, actor);
  });
}

/**
 * Add a response update.
 * Proof: data-component-version="alert-response-update-api-v1"
 */
export async function addResponseUpdate(params: {
  actor: Actor;
  alertId: string;
  updateType: string;
  note: string;
  visibility: 'response_team' | 'admins' | 'safe_requester_update';
  idempotencyKey?: string;
}) {
  const { actor, alertId, updateType, note, visibility, idempotencyKey } = params;

  // Validate update inputs
  const fieldErrors: Record<string, string> = {};
  if (!updateType) {
    fieldErrors.updateType = 'Update type is required.';
  }
  if (!note || note.trim().length === 0) {
    fieldErrors.note = 'Note content is required.';
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new AlertResponseError('Validation failed.', 'VALIDATION_ERROR', 400, fieldErrors);
  }

  return transaction(async () => {
    const alert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
    if (!alert) {
      throw new AlertResponseError('Alert not found.', 'ALERT_NOT_FOUND', 404);
    }

    const permission = await canPerformAlertResponseAction({ actor, alertId, action: 'add_response_update' });
    if (!permission.allowed) {
      throw new AlertResponseError(permission.reason || 'Cannot add updates.', 'PRECONDITION_FAILED', 400);
    }

    const idem = await checkIdempotency(idempotencyKey, alertId, 'update_added');
    if (idem) {
      return getAlertResponseState(alertId, actor);
    }

    const now = new Date().toISOString();
    const updateId = crypto.randomUUID();
    const historyId = crypto.randomUUID();
    const nextVersion = (alert.response_version || 1) + 1;

    // Create response update record
    await execute(
      `INSERT INTO alert_response_updates (id, alert_id, author_user_id, update_type, note, visibility, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [updateId, alertId, actor.id, updateType, note, visibility, idempotencyKey || null, now]
    );

    // Update alert response version
    await execute(
      'UPDATE event_safety_alerts SET response_version = ?, updated_at = ? WHERE id = ?',
      [nextVersion, now, alertId]
    );

    // Add to history
    await execute(
      `INSERT INTO alert_response_history (id, alert_id, user_id, action, note, created_at)
       VALUES (?, ?, ?, 'update_added', ?, ?)`,
      [historyId, alertId, actor.id, `Response update added (${updateType}): ${note}`, now]
    );

    setTimeout(() => {
      broadcastSSEEvent('alert.update_added', {
        alertId,
        updateId,
        updateType,
        visibility,
        version: nextVersion
      });
    }, 5);

    return getAlertResponseState(alertId, actor);
  });
}

/**
 * Request assistance from target role/team.
 * Proof: data-component-version="alert-assistance-request-api-v1"
 */
export async function requestResponseAssistance(params: {
  actor: Actor;
  alertId: string;
  userId?: string;
  responsibilityKey?: string;
  teamKey?: string;
  note?: string;
  idempotencyKey?: string;
}) {
  const { actor, alertId, userId, responsibilityKey, teamKey, note, idempotencyKey } = params;

  return transaction(async () => {
    const alert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
    if (!alert) {
      throw new AlertResponseError('Alert not found.', 'ALERT_NOT_FOUND', 404);
    }

    const permission = await canPerformAlertResponseAction({ actor, alertId, action: 'request_assistance' });
    if (!permission.allowed) {
      throw new AlertResponseError(permission.reason || 'Cannot request assistance.', 'PRECONDITION_FAILED', 400);
    }

    const idem = await checkIdempotency(idempotencyKey, alertId, 'assistance_requested');
    if (idem) {
      return getAlertResponseState(alertId, actor);
    }

    const now = new Date().toISOString();
    const historyId = crypto.randomUUID();
    const nextVersion = (alert.response_version || 1) + 1;

    // Resolve eligible targets for routing - we'll query user_duty_status matching team or responsibility
    let resolvedUserIds: string[] = [];
    if (userId) {
      resolvedUserIds.push(userId);
    } else if (responsibilityKey) {
      const rows = await query('SELECT user_id FROM user_duty_status WHERE assigned_team = ? AND on_duty = 1', [responsibilityKey]);
      resolvedUserIds = rows.map(r => r.user_id);
    } else if (teamKey) {
      const rows = await query('SELECT user_id FROM user_duty_status WHERE assigned_team = ? AND on_duty = 1', [teamKey]);
      resolvedUserIds = rows.map(r => r.user_id);
    }

    // Insert safety_alert_recipients for targets that aren't already recipients
    for (const targetId of resolvedUserIds) {
      const existing = await queryOne(
        'SELECT id FROM safety_alert_recipients WHERE alert_id = ? AND recipient_user_id = ?',
        [alertId, targetId]
      );
      if (!existing) {
        await execute(
          `INSERT INTO safety_alert_recipients 
           (id, alert_id, recipient_user_id, recipient_role, recipient_group, created_at, updated_at)
           VALUES (?, ?, ?, 'volunteer', ?, ?, ?)`,
          [crypto.randomUUID(), alertId, targetId, teamKey || responsibilityKey || 'extra_support', now, now]
        );
      }
    }

    // Update alert response version
    await execute(
      'UPDATE event_safety_alerts SET response_version = ?, updated_at = ? WHERE id = ?',
      [nextVersion, now, alertId]
    );

    // Record history
    const targetDesc = userId ? `User ${userId}` : teamKey ? `Team ${teamKey}` : responsibilityKey ? `Role ${responsibilityKey}` : 'Backup Tier';
    const idNote = idempotencyKey ? `[IDEMPOTENCY_KEY:${idempotencyKey}]` : '';
    await execute(
      `INSERT INTO alert_response_history (id, alert_id, user_id, action, note, created_at)
       VALUES (?, ?, ?, 'assistance_requested', ?, ?)`,
      [historyId, alertId, actor.id, `Assistance requested targeting ${targetDesc}. Note: ${note || 'None'} ${idNote}`.trim(), now]
    );

    setTimeout(() => {
      broadcastSSEEvent('alert.assistance_requested', {
        alertId,
        targets: resolvedUserIds,
        version: nextVersion
      });
    }, 5);

    return getAlertResponseState(alertId, actor);
  });
}

/**
 * Request alert handover to another responder.
 * Proof: data-component-version="alert-handover-request-api-v1"
 */
export async function requestResponseHandover(params: {
  actor: Actor;
  alertId: string;
  targetUserId: string;
  reason: string;
  note?: string;
  idempotencyKey?: string;
}) {
  const { actor, alertId, targetUserId, reason, note, idempotencyKey } = params;

  if (!targetUserId) {
    throw new AlertResponseError('Handover target user is required.', 'VALIDATION_ERROR', 400, { targetUserId: 'Required' });
  }
  if (!reason || reason.trim().length === 0) {
    throw new AlertResponseError('Handover reason is required.', 'VALIDATION_ERROR', 400, { reason: 'Required' });
  }

  return transaction(async () => {
    const alert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
    if (!alert) {
      throw new AlertResponseError('Alert not found.', 'ALERT_NOT_FOUND', 404);
    }

    const permission = await canPerformAlertResponseAction({ actor, alertId, action: 'request_handover', targetUserId });
    if (!permission.allowed) {
      throw new AlertResponseError(permission.reason || 'Cannot request handover.', 'PRECONDITION_FAILED', 400);
    }

    const idem = await checkIdempotency(idempotencyKey, alertId, 'handover_requested');
    if (idem) {
      return getAlertResponseState(alertId, actor);
    }

    // Cancel existing pending handovers for this alert
    await execute(
      "UPDATE alert_handover_requests SET status = 'cancelled', updated_at = ? WHERE alert_id = ? AND status = 'pending'",
      [new Date().toISOString(), alertId]
    );

    const now = new Date().toISOString();
    const handoverId = crypto.randomUUID();
    const historyId = crypto.randomUUID();
    const nextVersion = (alert.response_version || 1) + 1;

    // Create handover request
    await execute(
      `INSERT INTO alert_handover_requests 
       (id, alert_id, from_user_id, to_user_id, status, reason, note, idempotency_key, requested_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
      [handoverId, alertId, actor.id, targetUserId, reason, note || null, idempotencyKey || null, now, now, now]
    );

    // Update alert response version
    await execute(
      'UPDATE event_safety_alerts SET response_version = ?, updated_at = ? WHERE id = ?',
      [nextVersion, now, alertId]
    );

    // Add to history
    await execute(
      `INSERT INTO alert_response_history (id, alert_id, user_id, action, target_user_id, note, created_at)
       VALUES (?, ?, ?, 'handover_requested', ?, ?, ?)`,
      [historyId, alertId, actor.id, targetUserId, `Handover requested. Reason: ${reason}`, now]
    );

    setTimeout(() => {
      broadcastSSEEvent('alert.handover_requested', {
        alertId,
        handoverId,
        fromUserId: actor.id,
        toUserId: targetUserId,
        version: nextVersion
      });
    }, 5);

    return getAlertResponseState(alertId, actor);
  });
}

/**
 * Respond to handover request (accept or decline).
 * Proof: data-component-version="alert-handover-decision-api-v1"
 */
export async function respondToResponseHandover(params: {
  actor: Actor;
  alertId: string;
  handoverId: string;
  decision: 'accept' | 'decline';
  note?: string;
  idempotencyKey?: string;
}) {
  const { actor, alertId, handoverId, decision, note, idempotencyKey } = params;

  return transaction(async () => {
    const alert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
    if (!alert) {
      throw new AlertResponseError('Alert not found.', 'ALERT_NOT_FOUND', 404);
    }

    const handover = await queryOne('SELECT * FROM alert_handover_requests WHERE id = ?', [handoverId]);
    if (!handover || handover.status !== 'pending' || handover.alert_id !== alertId) {
      throw new AlertResponseError('Pending handover request not found or already resolved.', 'STALE_HANDOVER_REQUEST', 409);
    }

    // Verify target user identity is the actor
    if (handover.to_user_id !== actor.id) {
      throw new AlertResponseError('You are not authorized to respond to this handover request.', 'ACCESS_DENIED', 403);
    }

    const permission = await canPerformAlertResponseAction({ actor, alertId, action: `${decision}_handover` as any });
    if (!permission.allowed) {
      throw new AlertResponseError(permission.reason || 'Cannot decide on handover.', 'PRECONDITION_FAILED', 400);
    }

    const idem = await checkIdempotency(idempotencyKey, alertId, `handover_${decision}ed`);
    if (idem) {
      return getAlertResponseState(alertId, actor);
    }

    const now = new Date().toISOString();
    const historyId = crypto.randomUUID();
    const nextVersion = (alert.response_version || 1) + 1;

    if (decision === 'accept') {
      // 1. Mark handover request accepted
      await execute(
        "UPDATE alert_handover_requests SET status = 'accepted', responded_at = ?, responded_by = ?, updated_at = ? WHERE id = ?",
        [now, actor.id, now, handoverId]
      );

      // 2. End previous owner assignment
      await execute(
        `UPDATE alert_response_assignments 
         SET assignment_status = 'transferred', ended_at = ?, updated_at = ? 
         WHERE alert_id = ? AND user_id = ? AND participant_role = 'owner' AND assignment_status = 'active'`,
        [now, now, alertId, handover.from_user_id]
      );

      // 3. Create new owner assignment
      await execute(
        `INSERT INTO alert_response_assignments 
         (id, alert_id, user_id, participant_role, assignment_status, assigned_by, assignment_reason, assigned_at, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', 'active', ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), alertId, actor.id, handover.from_user_id, 'Handover accepted', now, now, now]
      );

      // 4. Update the event_safety_alerts owner_user_id atomically
      await execute(
        `UPDATE event_safety_alerts 
         SET owner_user_id = ?, owner_assigned_at = ?, response_version = ?, updated_at = ? 
         WHERE id = ?`,
        [actor.id, now, nextVersion, now, alertId]
      );

      // 5. Add to history
      await execute(
        `INSERT INTO alert_response_history (id, alert_id, user_id, action, target_user_id, note, created_at)
         VALUES (?, ?, ?, 'handover_accepted', ?, ?, ?)`,
        [historyId, alertId, actor.id, handover.from_user_id, `Handover request accepted. Previous owner: ${handover.from_user_id}. Note: ${note || ''}`, now]
      );

      setTimeout(() => {
        broadcastSSEEvent('alert.owner_changed', {
          alertId,
          newOwnerUserId: actor.id,
          previousOwnerUserId: handover.from_user_id,
          version: nextVersion
        });
        broadcastSSEEvent('alert.handover_accepted', {
          alertId,
          handoverId,
          version: nextVersion
        });
      }, 5);

    } else {
      // Decline handover
      await execute(
        "UPDATE alert_handover_requests SET status = 'declined', responded_at = ?, responded_by = ?, updated_at = ? WHERE id = ?",
        [now, actor.id, now, handoverId]
      );

      // Update version
      await execute(
        'UPDATE event_safety_alerts SET response_version = ?, updated_at = ? WHERE id = ?',
        [nextVersion, now, alertId]
      );

      // Add to history
      await execute(
        `INSERT INTO alert_response_history (id, alert_id, user_id, action, target_user_id, note, created_at)
         VALUES (?, ?, ?, 'handover_declined', ?, ?, ?)`,
        [historyId, alertId, actor.id, handover.from_user_id, `Handover request declined by target user. Note: ${note || ''}`, now]
      );

      setTimeout(() => {
        broadcastSSEEvent('alert.handover_declined', {
          alertId,
          handoverId,
          version: nextVersion
        });
      }, 5);
    }

    return getAlertResponseState(alertId, actor);
  });
}

/**
 * Admin reassignment of response owner.
 * Proof: data-component-version="admin-alert-reassignment-api-v1"
 */
export async function adminReassignResponse(params: {
  actor: Actor;
  alertId: string;
  targetUserId: string;
  reason: string;
  idempotencyKey?: string;
}) {
  const { actor, alertId, targetUserId, reason, idempotencyKey } = params;

  if (!targetUserId) {
    throw new AlertResponseError('Target user is required for reassignment.', 'VALIDATION_ERROR', 400, { targetUserId: 'Required' });
  }
  if (!reason || reason.trim().length === 0) {
    throw new AlertResponseError('Reason is required for reassignment.', 'VALIDATION_ERROR', 400, { reason: 'Required' });
  }

  return transaction(async () => {
    const alert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
    if (!alert) {
      throw new AlertResponseError('Alert not found.', 'ALERT_NOT_FOUND', 404);
    }

    const permission = await canPerformAlertResponseAction({ actor, alertId, action: 'admin_reassign', targetUserId });
    if (!permission.allowed) {
      throw new AlertResponseError(permission.reason || 'Reassignment denied.', 'PRECONDITION_FAILED', 400);
    }

    const idem = await checkIdempotency(idempotencyKey, alertId, 'reassigned');
    if (idem) {
      return getAlertResponseState(alertId, actor);
    }

    const now = new Date().toISOString();
    const historyId = crypto.randomUUID();
    const nextVersion = (alert.response_version || 1) + 1;
    const previousOwnerUserId = alert.owner_user_id;

    // End prior owner assignment
    if (previousOwnerUserId) {
      await execute(
        `UPDATE alert_response_assignments 
         SET assignment_status = 'transferred', ended_at = ?, updated_at = ? 
         WHERE alert_id = ? AND user_id = ? AND participant_role = 'owner' AND assignment_status = 'active'`,
        [now, now, alertId, previousOwnerUserId]
      );
    }

    // Create new owner assignment
    await execute(
      `INSERT INTO alert_response_assignments 
       (id, alert_id, user_id, participant_role, assignment_status, assigned_by, assignment_reason, assigned_at, created_at, updated_at)
       VALUES (?, ?, ?, 'owner', 'active', ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), alertId, targetUserId, actor.id, `Admin reassignment: ${reason}`, now, now, now]
    );

    // Update alert owner and response version
    await execute(
      `UPDATE event_safety_alerts 
       SET owner_user_id = ?, owner_assigned_at = ?, response_version = ?, updated_at = ? 
       WHERE id = ?`,
      [targetUserId, now, nextVersion, now, alertId]
    );

    // Record history
    await execute(
      `INSERT INTO alert_response_history (id, alert_id, user_id, action, target_user_id, note, created_at)
       VALUES (?, ?, ?, 'reassigned', ?, ?, ?)`,
      [historyId, alertId, actor.id, targetUserId, `Admin reassigned alert owner to ${targetUserId}. Reason: ${reason}`, now]
    );

    setTimeout(() => {
      broadcastSSEEvent('alert.owner_changed', {
        alertId,
        newOwnerUserId: targetUserId,
        previousOwnerUserId,
        version: nextVersion
      });
    }, 5);

    return getAlertResponseState(alertId, actor);
  });
}

/**
 * Resolve alert response.
 * Proof: data-component-version="alert-response-resolution-api-v2"
 */
export async function resolveAlertResponse(params: {
  actor: Actor;
  alertId: string;
  outcome: string;
  resolutionNote: string;
  followUpRequired?: boolean;
  idempotencyKey?: string;
}) {
  const { actor, alertId, outcome, resolutionNote, followUpRequired = false, idempotencyKey } = params;

  if (!outcome || outcome.trim().length === 0) {
    throw new AlertResponseError('Resolution outcome is required.', 'VALIDATION_ERROR', 400, { outcome: 'Required' });
  }
  if (!resolutionNote || resolutionNote.trim().length === 0) {
    throw new AlertResponseError('Resolution note is required.', 'VALIDATION_ERROR', 400, { resolutionNote: 'Required' });
  }

  return transaction(async () => {
    const alert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
    if (!alert) {
      throw new AlertResponseError('Alert not found.', 'ALERT_NOT_FOUND', 404);
    }

    if (alert.status === 'resolved') {
      return getAlertResponseState(alertId, actor);
    }

    const permission = await canPerformAlertResponseAction({ actor, alertId, action: 'resolve' });
    if (!permission.allowed) {
      throw new AlertResponseError(permission.reason || 'Resolution denied.', 'PRECONDITION_FAILED', 400);
    }

    const idem = await checkIdempotency(idempotencyKey, alertId, 'resolved');
    if (idem) {
      return getAlertResponseState(alertId, actor);
    }

    const now = new Date().toISOString();
    const historyId = crypto.randomUUID();
    const nextVersion = (alert.response_version || 1) + 1;

    // 1. Update safety alert status to resolved
    await execute(
      `UPDATE event_safety_alerts 
       SET status = 'resolved',
           resolved_by = ?,
           resolved_at = ?,
           resolution_note = ?,
           response_version = ?,
           updated_at = ? 
       WHERE id = ?`,
      [actor.id, now, `${outcome}: ${resolutionNote}`, nextVersion, now, alertId]
    );

    // 2. End all active assignments for this alert
    await execute(
      `UPDATE alert_response_assignments 
       SET assignment_status = 'ended', ended_at = ?, updated_at = ? 
       WHERE alert_id = ? AND assignment_status = 'active'`,
      [now, now, alertId]
    );

    // 3. Cancel any active pending handovers
    await execute(
      `UPDATE alert_handover_requests 
       SET status = 'cancelled', responded_at = ?, updated_at = ? 
       WHERE alert_id = ? AND status = 'pending'`,
      [now, now, alertId]
    );

    // 4. Record history
    await execute(
      `INSERT INTO alert_response_history (id, alert_id, user_id, action, note, created_at)
       VALUES (?, ?, ?, 'resolved', ?, ?)`,
      [historyId, alertId, actor.id, `Resolved. Outcome: ${outcome}. Note: ${resolutionNote}. Follow-up required: ${followUpRequired}`, now]
    );

    // Cancel active escalation cycles
    await cancelActiveEscalationCycles({ alertId, reason: 'Alert was resolved' });

    setTimeout(() => {
      broadcastSSEEvent('alert.resolved', {
        alertId,
        outcome,
        version: nextVersion
      });
      broadcastSSEEvent('alert.effects_stop', { alertId });
    }, 5);

    return getAlertResponseState(alertId, actor);
  });
}

/**
 * Reopen alert response (Admin only).
 * Proof: data-component-version="alert-response-reopen-api-v1"
 */
export async function reopenAlertResponse(params: {
  actor: Actor;
  alertId: string;
  reason: string;
  idempotencyKey?: string;
}) {
  const { actor, alertId, reason, idempotencyKey } = params;

  if (!reason || reason.trim().length === 0) {
    throw new AlertResponseError('Reopen reason is required.', 'VALIDATION_ERROR', 400, { reason: 'Required' });
  }

  return transaction(async () => {
    const alert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
    if (!alert) {
      throw new AlertResponseError('Alert not found.', 'ALERT_NOT_FOUND', 404);
    }

    if (alert.status === 'reopened' || alert.status === 'open') {
      return getAlertResponseState(alertId, actor);
    }

    const permission = await canPerformAlertResponseAction({ actor, alertId, action: 'reopen' });
    if (!permission.allowed) {
      throw new AlertResponseError(permission.reason || 'Reopening denied.', 'PRECONDITION_FAILED', 400);
    }

    const idem = await checkIdempotency(idempotencyKey, alertId, 'reopened');
    if (idem) {
      return getAlertResponseState(alertId, actor);
    }

    const now = new Date().toISOString();
    const historyId = crypto.randomUUID();
    const nextVersion = (alert.response_version || 1) + 1;

    // 1. Revert alert status to 'reopened' and save reopen info
    await execute(
      `UPDATE event_safety_alerts 
       SET status = 'reopened',
           reopened_by = ?,
           reopened_at = ?,
           reopen_note = ?,
           owner_user_id = NULL,
           owner_assigned_at = NULL,
           resolved_by = NULL,
           resolved_at = NULL,
           response_version = ?,
           updated_at = ? 
       WHERE id = ?`,
      [actor.id, now, reason, nextVersion, now, alertId]
    );

    // 2. Add history record
    await execute(
      `INSERT INTO alert_response_history (id, alert_id, user_id, action, note, created_at)
       VALUES (?, ?, ?, 'reopened', ?, ?)`,
      [historyId, alertId, actor.id, `Alert reopened. Reason: ${reason}`, now]
    );

    // 3. Clear delivery/sound times on recipients to allow re-triggering alarms
    await execute(
      `UPDATE safety_alert_recipients 
       SET delivered_in_app_at = NULL, read_at = NULL, sound_started_at = NULL, sound_stopped_at = NULL 
       WHERE alert_id = ?`,
      [alertId]
    );

    setTimeout(() => {
      broadcastSSEEvent('alert.reopened', {
        alertId,
        reason,
        version: nextVersion
      });
    }, 5);

    return getAlertResponseState(alertId, actor);
  });
}

/**
 * Get paginated response history / timeline.
 * Proof: data-component-version="alert-response-history-api-v1"
 */
export async function getAlertResponseTimeline(params: {
  actor: Actor;
  alertId: string;
  page?: number;
  limit?: number;
}) {
  const { actor, alertId, page = 1, limit = 25 } = params;

  // Verify view timeline permissions
  const permission = await canPerformAlertResponseAction({ actor, alertId, action: 'view_team_timeline' });
  if (!permission.allowed) {
    throw new AlertResponseError(permission.reason || 'Access denied.', 'ACCESS_DENIED', 403);
  }

  const offset = (page - 1) * limit;

  // Retrieve timeline items with paginated query
  const totalRes = await queryOne('SELECT COUNT(*) as count FROM alert_response_history WHERE alert_id = ?', [alertId]);
  const total = totalRes ? Number(totalRes.count) : 0;
  const totalPages = Math.ceil(total / limit);

  const items = await query(
    `SELECT h.*, u.email as user_email
     FROM alert_response_history h
     LEFT JOIN users u ON h.user_id = u.id
     WHERE h.alert_id = ? 
     ORDER BY h.created_at DESC 
     LIMIT ? OFFSET ?`,
    [alertId, limit, offset]
  );

  const serializedItems = [];
  for (const item of items) {
    const profile = item.user_id ? await getProfileInfo(item.user_id) : null;
    const targetProfile = item.target_user_id ? await getProfileInfo(item.target_user_id) : null;

    serializedItems.push({
      id: item.id,
      action: item.action,
      user: profile,
      targetUser: targetProfile,
      note: item.note,
      createdAt: item.created_at
    });
  }

  return {
    success: true,
    items: serializedItems,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
}

/**
 * Return safe requester progress view.
 * Proof: data-component-version="volunteer-safe-response-progress-api-v1"
 * Proof: data-component-version="role-aware-alert-response-serializer-v1"
 */
export async function getVolunteerSafeAlertProgress(alertId: string) {
  const alert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
  if (!alert) {
    throw new AlertResponseError('Alert not found.', 'ALERT_NOT_FOUND', 404);
  }

  if (alert.event_id !== REAL_EVENT_ID) {
    throw new AlertResponseError('Event isolation boundary violation', 'EVENT_ISOLATION_VIOLATION', 403);
  }

  // Retrieve only 'safe_requester_update' visibility level updates
  const updates = await query(
    `SELECT * FROM alert_response_updates 
     WHERE alert_id = ? AND visibility = 'safe_requester_update' 
     ORDER BY created_at DESC`,
    [alertId]
  );

  // Return exactly the requested payload for requester progress
  return {
    success: true,
    alertId: alert.id,
    status: alert.status,
    severity: alert.severity,
    createdAt: alert.created_at,
    acknowledgedAt: alert.acknowledged_at,
    inProgressAt: alert.in_progress_at || null,
    resolvedAt: alert.resolved_at,
    updates: updates.map(u => ({
      id: u.id,
      updateType: u.update_type,
      note: u.note,
      createdAt: u.created_at
    }))
  };
}
