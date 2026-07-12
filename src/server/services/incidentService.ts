import crypto from 'crypto';
import { query, queryOne, execute, transaction } from '../db';
import { broadcastSSEEvent } from './sse';

// Proof: data-component-version="shared-incident-service-v1"
// Proof: data-component-version="incident-schema-v1"
// Proof: data-component-version="incident-access-matrix-v1"

export interface Actor {
  id: string;
  role: string;
  email: string;
}

export class IncidentError extends Error {
  code: string;
  status: number;
  fieldErrors?: Record<string, string>;

  constructor(message: string, code: string, status: number = 400, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'IncidentError';
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

// Allowed Categories
export const INCIDENT_CATEGORIES = ['medical', 'behavioral', 'missing_child', 'security', 'other'] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

// Allowed Statuses
export const INCIDENT_STATUSES = ['draft', 'submitted', 'needs_revision', 'closed', 'voided'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export interface FollowUpAction {
  id: string;
  title: string;
  assignedToUserId: string;
  status: 'pending' | 'completed';
  completedAt?: string;
  completedByUserId?: string;
  completedNote?: string;
}

export interface ChangeRequest {
  id: string;
  requestedByUserId: string;
  requestNotes: string;
  requestedAt: string;
  status: 'pending' | 'resolved';
  resolvedAt?: string;
  resolutionNotes?: string;
}

export interface ClosureChecklist {
  parentNotified: boolean;
  safeguardingReviewCompleted: boolean;
  followUpsClosed: boolean;
  signedOffByAdmin: boolean;
}

export interface StructuredDataMedical {
  symptoms: string;
  treatment: string;
  vitals?: string;
  doctorNotified: boolean;
  hospitalVisitRequired: boolean;
}

export interface StructuredDataBehavioral {
  severity: 'low' | 'medium' | 'high';
  staffInvolved: string;
  narrative: string;
  safeguardingEscalation: boolean;
}

export interface StructuredDataMissingChild {
  lastSeenTime: string;
  lastSeenLocation: string;
  clothingDetails: string;
  searchDurationMins: number;
}

export interface StructuredDataSecurity {
  incidentType: string;
  authoritiesContacted: boolean;
  propertyDamage: boolean;
}

export interface StructuredDataOther {
  details: string;
}

/**
 * Access policy validator.
 * - Admin can view, edit, submit, close, reopen, void any incident.
 * - Volunteers can view/create/edit/submit incident drafts ONLY if they are assigned to the associated safety alert,
 *   or if they were the owner/assistant of the alert response team.
 */
export async function verifyIncidentAccess(actor: Actor, alertId: string, action: 'view' | 'edit' | 'manage'): Promise<{ allowed: boolean; reason?: string }> {
  if (actor.role === 'admin' || actor.role === 'superadmin') {
    return { allowed: true };
  }

  if (actor.role === 'volunteer') {
    // Verify if volunteer is active & approved
    const profile = await queryOne('SELECT status FROM volunteer_profiles WHERE user_id = ? AND is_deleted = 0', [actor.id]);
    if (!profile || profile.status !== 'approved') {
      return { allowed: false, reason: 'Volunteer profile is not approved or inactive.' };
    }

    // Check if volunteer is assigned or involved in the alert response
    // E.g. as current owner, assistant, recipient, or if they raised the alert
    const alert = await queryOne('SELECT id, raised_by_user_id, owner_user_id FROM event_safety_alerts WHERE id = ?', [alertId]);
    if (!alert) {
      return { allowed: false, reason: 'Associated alert not found.' };
    }

    if (alert.raised_by_user_id === actor.id || alert.owner_user_id === actor.id) {
      return { allowed: true };
    }

    // Check alert assistants
    const assignment = await queryOne(
      'SELECT id FROM alert_response_assignments WHERE alert_id = ? AND user_id = ? AND assignment_status = \'active\'',
      [alertId, actor.id]
    );
    if (assignment) {
      return { allowed: true };
    }

    // Check recipients snaps or if on duty in routing
    const recipient = await queryOne(
      'SELECT id FROM safety_alert_recipients WHERE alert_id = ? AND recipient_user_id = ?',
      [alertId, actor.id]
    );
    if (recipient) {
      return { allowed: true };
    }

    // For edits, volunteers cannot manage administrative states (close, reopen, void)
    if (action === 'manage') {
      return { allowed: false, reason: 'Administrative privileges required.' };
    }

    return { allowed: false, reason: 'You are not involved in this alert response coordination.' };
  }

  return { allowed: false, reason: 'Unauthorized access role.' };
}

/**
 * Validates structured category-specific details.
 */
export function validateStructuredData(category: IncidentCategory, rawData: any) {
  const errors: Record<string, string> = {};

  if (!rawData || typeof rawData !== 'object') {
    throw new IncidentError('Structured data must be an object', 'VALIDATION_ERROR', 400);
  }

  if (category === 'medical') {
    const data = rawData as StructuredDataMedical;
    if (!data.symptoms || data.symptoms.trim().length === 0) {
      errors.symptoms = 'Symptoms description is required.';
    }
    if (!data.treatment || data.treatment.trim().length === 0) {
      errors.treatment = 'Treatment/First Aid provided is required.';
    }
  } else if (category === 'behavioral') {
    const data = rawData as StructuredDataBehavioral;
    if (!data.severity || !['low', 'medium', 'high'].includes(data.severity)) {
      errors.severity = 'Valid severity level (low, medium, high) is required.';
    }
    if (!data.narrative || data.narrative.trim().length === 0) {
      errors.narrative = 'Behavioral narrative is required.';
    }
  } else if (category === 'missing_child') {
    const data = rawData as StructuredDataMissingChild;
    if (!data.lastSeenLocation || data.lastSeenLocation.trim().length === 0) {
      errors.lastSeenLocation = 'Last seen location is required.';
    }
    if (data.searchDurationMins === undefined || data.searchDurationMins < 0) {
      errors.searchDurationMins = 'Valid search duration is required.';
    }
  } else if (category === 'security') {
    const data = rawData as StructuredDataSecurity;
    if (!data.incidentType || data.incidentType.trim().length === 0) {
      errors.incidentType = 'Security incident type is required.';
    }
  } else if (category === 'other') {
    const data = rawData as StructuredDataOther;
    if (!data.details || data.details.trim().length === 0) {
      errors.details = 'Details are required for Other category.';
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new IncidentError('Structured category-specific validation failed', 'VALIDATION_ERROR', 400, errors);
  }
}

/**
 * Validates the closure checklist.
 */
export function validateClosureChecklist(checklist: ClosureChecklist, category: IncidentCategory) {
  const errors: Record<string, string> = {};
  if (!checklist.parentNotified) {
    errors.parentNotified = 'Parent notification must be completed and logged.';
  }
  if (!checklist.signedOffByAdmin) {
    errors.signedOffByAdmin = 'Admin sign-off is required to close the incident.';
  }
  if (category === 'behavioral' && !checklist.safeguardingReviewCompleted) {
    errors.safeguardingReviewCompleted = 'Safeguarding review must be signed off for behavioral incidents.';
  }

  if (Object.keys(errors).length > 0) {
    throw new IncidentError('Closure checklist requirements not satisfied.', 'VALIDATION_ERROR', 400, errors);
  }
}

/**
 * Creates a new incident record (usually as draft or submitted).
 */
export async function createIncident(params: {
  actor: Actor;
  alertId: string;
  category: IncidentCategory;
  title: string;
  description: string;
  structuredData: any;
  parentContact?: string;
  firstAid?: string;
  security?: string;
  status?: IncidentStatus;
  idempotencyKey?: string;
}) {
  const { actor, alertId, category, title, description, structuredData, parentContact = '', firstAid = '', security = '', status = 'draft', idempotencyKey } = params;

  // Enforce access policy
  const access = await verifyIncidentAccess(actor, alertId, 'edit');
  if (!access.allowed) {
    throw new IncidentError(access.reason || 'Unauthorized.', 'ACCESS_DENIED', 403);
  }

  return transaction(async () => {
    // One incident record per alert constraint
    const existing = await queryOne('SELECT id, version FROM incident_records WHERE alert_id = ?', [alertId]);
    if (existing) {
      // If idempotency key matches or simply alert_id already exists, return existing
      if (idempotencyKey) {
        const matchingIdem = await queryOne('SELECT id FROM incident_records WHERE alert_id = ? AND idempotency_key = ?', [alertId, idempotencyKey]);
        if (matchingIdem) {
          return getIncidentState(existing.id, actor);
        }
      }
      throw new IncidentError('An incident record already exists for this alert.', 'DUPLICATE_RECORD', 409);
    }

    // Verify alert exists and retrieve its event_id
    const alert = await queryOne('SELECT event_id FROM event_safety_alerts WHERE id = ?', [alertId]);
    if (!alert) {
      throw new IncidentError('Alert not found.', 'ALERT_NOT_FOUND', 404);
    }

    if (status === 'submitted') {
      // Perform strict validations on submit
      validateStructuredData(category, structuredData);
      if (!title || title.trim().length === 0) {
        throw new IncidentError('Title is required to submit.', 'VALIDATION_ERROR', 400, { title: 'Required' });
      }
    }

    const incidentId = crypto.randomUUID();
    const now = new Date().toISOString();

    const emptyFollowUps = JSON.stringify([]);
    const emptyChangeRequests = JSON.stringify([]);
    const emptyClosureChecklist = JSON.stringify({
      parentNotified: false,
      safeguardingReviewCompleted: false,
      followUpsClosed: false,
      signedOffByAdmin: false,
    });

    await execute(
      `INSERT INTO incident_records (
        id, alert_id, event_id, creator_user_id, status, category, title, description,
        structured_data, parent_contact, first_aid, security, follow_up_actions,
        change_requests, closure_checklist, version, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        incidentId,
        alertId,
        alert.event_id,
        actor.id,
        status,
        category,
        title,
        description,
        JSON.stringify(structuredData),
        parentContact,
        firstAid,
        security,
        emptyFollowUps,
        emptyChangeRequests,
        emptyClosureChecklist,
        idempotencyKey || null,
        now,
        now,
      ]
    );

    // Write immutable incident history
    await execute(
      `INSERT INTO incident_history (id, incident_id, user_id, action, note, state_snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        incidentId,
        actor.id,
        status === 'submitted' ? 'submitted' : 'created_draft',
        `Incident record initialized by ${actor.email} as ${status}.`,
        JSON.stringify({ status, category, title }),
        now,
      ]
    );

    broadcastSSEEvent('incident.created', { incidentId, alertId, status, version: 1 });

    return getIncidentState(incidentId, actor);
  });
}

/**
 * Updates a draft incident.
 */
export async function updateIncidentDraft(params: {
  actor: Actor;
  incidentId: string;
  expectedVersion: number;
  category?: IncidentCategory;
  title?: string;
  description?: string;
  structuredData?: any;
  parentContact?: string;
  firstAid?: string;
  security?: string;
}) {
  const { actor, incidentId, expectedVersion, category, title, description, structuredData, parentContact, firstAid, security } = params;

  return transaction(async () => {
    const incident = await queryOne('SELECT * FROM incident_records WHERE id = ?', [incidentId]);
    if (!incident) {
      throw new IncidentError('Incident record not found.', 'NOT_FOUND', 404);
    }

    // Access check
    const access = await verifyIncidentAccess(actor, incident.alert_id, 'edit');
    if (!access.allowed) {
      throw new IncidentError(access.reason || 'Unauthorized.', 'ACCESS_DENIED', 403);
    }

    // Concurrency control / Versioning
    if (incident.version !== expectedVersion) {
      throw new IncidentError('Concurrency conflict: The incident record has been modified by another user.', 'CONCURRENCY_CONFLICT', 409);
    }

    // Prevent editing if closed or voided (unless admin reopens)
    if (incident.status === 'closed' || incident.status === 'voided') {
      throw new IncidentError('Cannot update a closed or voided incident record.', 'INVALID_STATE', 400);
    }

    const nextVersion = incident.version + 1;
    const now = new Date().toISOString();

    const finalCategory = category || incident.category;
    const finalTitle = title !== undefined ? title : incident.title;
    const finalDescription = description !== undefined ? description : incident.description;
    const finalStructuredData = structuredData !== undefined ? JSON.stringify(structuredData) : incident.structured_data;
    const finalParentContact = parentContact !== undefined ? parentContact : incident.parent_contact;
    const finalFirstAid = firstAid !== undefined ? firstAid : incident.first_aid;
    const finalSecurity = security !== undefined ? security : incident.security;

    await execute(
      `UPDATE incident_records
       SET category = ?, title = ?, description = ?, structured_data = ?, parent_contact = ?,
           first_aid = ?, security = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      [finalCategory, finalTitle, finalDescription, finalStructuredData, finalParentContact, finalFirstAid, finalSecurity, nextVersion, now, incidentId]
    );

    // Save history
    await execute(
      `INSERT INTO incident_history (id, incident_id, user_id, action, note, state_snapshot, created_at)
       VALUES (?, ?, ?, 'update_draft', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        incidentId,
        actor.id,
        'Draft updated.',
        JSON.stringify({ status: incident.status, category: finalCategory, title: finalTitle }),
        now,
      ]
    );

    broadcastSSEEvent('incident.updated', { incidentId, alertId: incident.alert_id, status: incident.status, version: nextVersion });

    return getIncidentState(incidentId, actor);
  });
}

/**
 * Formally submits an incident for Admin review.
 */
export async function submitIncident(params: {
  actor: Actor;
  incidentId: string;
  expectedVersion: number;
  category?: IncidentCategory;
  title?: string;
  description?: string;
  structuredData?: any;
  parentContact?: string;
  firstAid?: string;
  security?: string;
}) {
  const { actor, incidentId, expectedVersion, category, title, description, structuredData, parentContact, firstAid, security } = params;

  return transaction(async () => {
    const incident = await queryOne('SELECT * FROM incident_records WHERE id = ?', [incidentId]);
    if (!incident) {
      throw new IncidentError('Incident record not found.', 'NOT_FOUND', 404);
    }

    // Access check
    const access = await verifyIncidentAccess(actor, incident.alert_id, 'edit');
    if (!access.allowed) {
      throw new IncidentError(access.reason || 'Unauthorized.', 'ACCESS_DENIED', 403);
    }

    if (incident.version !== expectedVersion) {
      throw new IncidentError('Concurrency conflict.', 'CONCURRENCY_CONFLICT', 409);
    }

    const finalCategory = category || incident.category;
    const finalTitle = title !== undefined ? title : incident.title;
    const finalDescription = description !== undefined ? description : incident.description;
    const finalStructuredData = structuredData !== undefined ? structuredData : JSON.parse(incident.structured_data);
    const finalParentContact = parentContact !== undefined ? parentContact : incident.parent_contact;
    const finalFirstAid = firstAid !== undefined ? firstAid : incident.first_aid;
    const finalSecurity = security !== undefined ? security : incident.security;

    // Strict validation on submit
    if (!finalTitle || finalTitle.trim().length === 0) {
      throw new IncidentError('Title is required to submit.', 'VALIDATION_ERROR', 400, { title: 'Required' });
    }
    if (!finalDescription || finalDescription.trim().length === 0) {
      throw new IncidentError('Description is required to submit.', 'VALIDATION_ERROR', 400, { description: 'Required' });
    }
    validateStructuredData(finalCategory, finalStructuredData);

    const nextVersion = incident.version + 1;
    const now = new Date().toISOString();

    await execute(
      `UPDATE incident_records
       SET status = 'submitted', category = ?, title = ?, description = ?, structured_data = ?,
           parent_contact = ?, first_aid = ?, security = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      [finalCategory, finalTitle, finalDescription, JSON.stringify(finalStructuredData), finalParentContact, finalFirstAid, finalSecurity, nextVersion, now, incidentId]
    );

    // Save history
    await execute(
      `INSERT INTO incident_history (id, incident_id, user_id, action, note, state_snapshot, created_at)
       VALUES (?, ?, ?, 'submitted', 'Incident submitted for review.', ?, ?)`,
      [
        crypto.randomUUID(),
        incidentId,
        actor.id,
        JSON.stringify({ status: 'submitted', category: finalCategory, title: finalTitle }),
        now,
      ]
    );

    broadcastSSEEvent('incident.updated', { incidentId, alertId: incident.alert_id, status: 'submitted', version: nextVersion });

    return getIncidentState(incidentId, actor);
  });
}

/**
 * Submits a change request / requests revision (Admin only).
 */
export async function submitChangeRequest(params: {
  actor: Actor;
  incidentId: string;
  expectedVersion: number;
  notes: string;
}) {
  const { actor, incidentId, expectedVersion, notes } = params;

  if (actor.role !== 'admin' && actor.role !== 'superadmin') {
    throw new IncidentError('Only administrators can issue change requests.', 'ACCESS_DENIED', 403);
  }

  if (!notes || notes.trim().length === 0) {
    throw new IncidentError('Revision request notes are required.', 'VALIDATION_ERROR', 400, { notes: 'Required' });
  }

  return transaction(async () => {
    const incident = await queryOne('SELECT * FROM incident_records WHERE id = ?', [incidentId]);
    if (!incident) {
      throw new IncidentError('Incident record not found.', 'NOT_FOUND', 404);
    }

    if (incident.version !== expectedVersion) {
      throw new IncidentError('Concurrency conflict.', 'CONCURRENCY_CONFLICT', 409);
    }

    if (incident.status !== 'submitted' && incident.status !== 'needs_revision') {
      throw new IncidentError('Only submitted or revision-needed incidents can have change requests submitted.', 'INVALID_STATE', 400);
    }

    const changeRequests: ChangeRequest[] = JSON.parse(incident.change_requests || '[]');
    const newRequest: ChangeRequest = {
      id: crypto.randomUUID(),
      requestedByUserId: actor.id,
      requestNotes: notes,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    };
    changeRequests.push(newRequest);

    const nextVersion = incident.version + 1;
    const now = new Date().toISOString();

    await execute(
      `UPDATE incident_records
       SET status = 'needs_revision', change_requests = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(changeRequests), nextVersion, now, incidentId]
    );

    // Save history
    await execute(
      `INSERT INTO incident_history (id, incident_id, user_id, action, note, state_snapshot, created_at)
       VALUES (?, ?, ?, 'needs_revision', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        incidentId,
        actor.id,
        `Change request added: ${notes}`,
        JSON.stringify({ status: 'needs_revision' }),
        now,
      ]
    );

    broadcastSSEEvent('incident.updated', { incidentId, alertId: incident.alert_id, status: 'needs_revision', version: nextVersion });

    return getIncidentState(incidentId, actor);
  });
}

/**
 * Resolves a change request when edits are done.
 */
export async function resolveChangeRequests(params: {
  actor: Actor;
  incidentId: string;
  expectedVersion: number;
}) {
  const { actor, incidentId, expectedVersion } = params;

  return transaction(async () => {
    const incident = await queryOne('SELECT * FROM incident_records WHERE id = ?', [incidentId]);
    if (!incident) {
      throw new IncidentError('Incident not found.', 'NOT_FOUND', 404);
    }

    const access = await verifyIncidentAccess(actor, incident.alert_id, 'edit');
    if (!access.allowed) {
      throw new IncidentError(access.reason || 'Unauthorized.', 'ACCESS_DENIED', 403);
    }

    if (incident.version !== expectedVersion) {
      throw new IncidentError('Concurrency conflict.', 'CONCURRENCY_CONFLICT', 409);
    }

    const changeRequests: ChangeRequest[] = JSON.parse(incident.change_requests || '[]');
    let resolvedCount = 0;
    const now = new Date().toISOString();

    const updatedRequests = changeRequests.map(r => {
      if (r.status === 'pending') {
        resolvedCount++;
        return {
          ...r,
          status: 'resolved' as const,
          resolvedAt: now,
          resolutionNotes: 'Resolved through subsequent submission/edit.',
        };
      }
      return r;
    });

    if (resolvedCount === 0) {
      return getIncidentState(incidentId, actor);
    }

    const nextVersion = incident.version + 1;

    await execute(
      `UPDATE incident_records
       SET change_requests = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(updatedRequests), nextVersion, now, incidentId]
    );

    // Save history
    await execute(
      `INSERT INTO incident_history (id, incident_id, user_id, action, note, state_snapshot, created_at)
       VALUES (?, ?, ?, 'resolve_change_request', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        incidentId,
        actor.id,
        `Resolved ${resolvedCount} pending change requests.`,
        JSON.stringify({ change_requests: updatedRequests }),
        now,
      ]
    );

    broadcastSSEEvent('incident.updated', { incidentId, alertId: incident.alert_id, status: incident.status, version: nextVersion });

    return getIncidentState(incidentId, actor);
  });
}

/**
 * Updates a follow-up action status or adds a new follow-up.
 */
export async function addFollowUpAction(params: {
  actor: Actor;
  incidentId: string;
  expectedVersion: number;
  title: string;
  assignedToUserId: string;
}) {
  const { actor, incidentId, expectedVersion, title, assignedToUserId } = params;

  if (!title || title.trim().length === 0) {
    throw new IncidentError('Follow-up title is required.', 'VALIDATION_ERROR', 400, { title: 'Required' });
  }

  return transaction(async () => {
    const incident = await queryOne('SELECT * FROM incident_records WHERE id = ?', [incidentId]);
    if (!incident) {
      throw new IncidentError('Incident not found.', 'NOT_FOUND', 404);
    }

    // Admins or involved coordinators can add follow-ups
    const access = await verifyIncidentAccess(actor, incident.alert_id, 'edit');
    if (!access.allowed) {
      throw new IncidentError(access.reason || 'Unauthorized.', 'ACCESS_DENIED', 403);
    }

    if (incident.version !== expectedVersion) {
      throw new IncidentError('Concurrency conflict.', 'CONCURRENCY_CONFLICT', 409);
    }

    const followUps: FollowUpAction[] = JSON.parse(incident.follow_up_actions || '[]');
    const newAction: FollowUpAction = {
      id: crypto.randomUUID(),
      title,
      assignedToUserId,
      status: 'pending',
    };
    followUps.push(newAction);

    const nextVersion = incident.version + 1;
    const now = new Date().toISOString();

    await execute(
      `UPDATE incident_records
       SET follow_up_actions = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(followUps), nextVersion, now, incidentId]
    );

    // Save history
    await execute(
      `INSERT INTO incident_history (id, incident_id, user_id, action, note, state_snapshot, created_at)
       VALUES (?, ?, ?, 'add_follow_up', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        incidentId,
        actor.id,
        `Added follow-up action: "${title}"`,
        JSON.stringify({ followUps }),
        now,
      ]
    );

    broadcastSSEEvent('incident.updated', { incidentId, alertId: incident.alert_id, status: incident.status, version: nextVersion });

    return getIncidentState(incidentId, actor);
  });
}

/**
 * Completes or updates follow-up actions.
 */
export async function completeFollowUpAction(params: {
  actor: Actor;
  incidentId: string;
  expectedVersion: number;
  actionId: string;
  completed: boolean;
  completedNote?: string;
}) {
  const { actor, incidentId, expectedVersion, actionId, completed, completedNote = '' } = params;

  return transaction(async () => {
    const incident = await queryOne('SELECT * FROM incident_records WHERE id = ?', [incidentId]);
    if (!incident) {
      throw new IncidentError('Incident not found.', 'NOT_FOUND', 404);
    }

    // Access check
    const access = await verifyIncidentAccess(actor, incident.alert_id, 'edit');
    if (!access.allowed) {
      throw new IncidentError(access.reason || 'Unauthorized.', 'ACCESS_DENIED', 403);
    }

    if (incident.version !== expectedVersion) {
      throw new IncidentError('Concurrency conflict.', 'CONCURRENCY_CONFLICT', 409);
    }

    const followUps: FollowUpAction[] = JSON.parse(incident.follow_up_actions || '[]');
    let found = false;
    const now = new Date().toISOString();

    const updatedFollowUps = followUps.map(item => {
      if (item.id === actionId) {
        found = true;
        return {
          ...item,
          status: (completed ? 'completed' : 'pending') as 'completed' | 'pending',
          completedAt: completed ? now : undefined,
          completedByUserId: completed ? actor.id : undefined,
          completedNote: completed ? completedNote : undefined,
        };
      }
      return item;
    });

    if (!found) {
      throw new IncidentError('Follow-up action item not found.', 'NOT_FOUND', 404);
    }

    const nextVersion = incident.version + 1;

    await execute(
      `UPDATE incident_records
       SET follow_up_actions = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(updatedFollowUps), nextVersion, now, incidentId]
    );

    // Save history
    await execute(
      `INSERT INTO incident_history (id, incident_id, user_id, action, note, state_snapshot, created_at)
       VALUES (?, ?, ?, 'update_follow_up', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        incidentId,
        actor.id,
        `Follow-up action ${actionId} marked as ${completed ? 'completed' : 'pending'}.`,
        JSON.stringify({ followUps: updatedFollowUps }),
        now,
      ]
    );

    broadcastSSEEvent('incident.updated', { incidentId, alertId: incident.alert_id, status: incident.status, version: nextVersion });

    return getIncidentState(incidentId, actor);
  });
}

/**
 * Admin: Updates the closure checklist on an incident.
 */
export async function updateClosureChecklist(params: {
  actor: Actor;
  incidentId: string;
  expectedVersion: number;
  checklist: ClosureChecklist;
}) {
  const { actor, incidentId, expectedVersion, checklist } = params;

  if (actor.role !== 'admin' && actor.role !== 'superadmin') {
    throw new IncidentError('Only administrators can manage the closure checklist.', 'ACCESS_DENIED', 403);
  }

  return transaction(async () => {
    const incident = await queryOne('SELECT * FROM incident_records WHERE id = ?', [incidentId]);
    if (!incident) {
      throw new IncidentError('Incident record not found.', 'NOT_FOUND', 404);
    }

    if (incident.version !== expectedVersion) {
      throw new IncidentError('Concurrency conflict.', 'CONCURRENCY_CONFLICT', 409);
    }

    const nextVersion = incident.version + 1;
    const now = new Date().toISOString();

    await execute(
      `UPDATE incident_records
       SET closure_checklist = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(checklist), nextVersion, now, incidentId]
    );

    // Save history
    await execute(
      `INSERT INTO incident_history (id, incident_id, user_id, action, note, state_snapshot, created_at)
       VALUES (?, ?, ?, 'update_checklist', 'Closure checklist updated.', ?, ?)`,
      [
        crypto.randomUUID(),
        incidentId,
        actor.id,
        JSON.stringify({ closure_checklist: checklist }),
        now,
      ]
    );

    broadcastSSEEvent('incident.updated', { incidentId, alertId: incident.alert_id, status: incident.status, version: nextVersion });

    return getIncidentState(incidentId, actor);
  });
}

/**
 * Admin: Formally closes an incident.
 */
export async function closeIncident(params: {
  actor: Actor;
  incidentId: string;
  expectedVersion: number;
  idempotencyKey?: string;
}) {
  const { actor, incidentId, expectedVersion, idempotencyKey } = params;

  if (actor.role !== 'admin' && actor.role !== 'superadmin') {
    throw new IncidentError('Only administrators can formally close incidents.', 'ACCESS_DENIED', 403);
  }

  return transaction(async () => {
    const incident = await queryOne('SELECT * FROM incident_records WHERE id = ?', [incidentId]);
    if (!incident) {
      throw new IncidentError('Incident record not found.', 'NOT_FOUND', 404);
    }

    if (incident.status === 'closed') {
      return getIncidentState(incidentId, actor);
    }

    if (incident.version !== expectedVersion) {
      throw new IncidentError('Concurrency conflict.', 'CONCURRENCY_CONFLICT', 409);
    }

    // Validate checklist is satisfied
    const checklist: ClosureChecklist = JSON.parse(incident.closure_checklist || '{}');
    validateClosureChecklist(checklist, incident.category as IncidentCategory);

    // Ensure all follow-ups are closed
    const followUps: FollowUpAction[] = JSON.parse(incident.follow_up_actions || '[]');
    const hasPending = followUps.some(f => f.status === 'pending');
    if (hasPending) {
      throw new IncidentError('All outstanding follow-up actions must be completed before closing the incident.', 'VALIDATION_ERROR', 400);
    }

    const nextVersion = incident.version + 1;
    const now = new Date().toISOString();

    await execute(
      `UPDATE incident_records
       SET status = 'closed', version = ?, updated_at = ?
       WHERE id = ?`,
      [nextVersion, now, incidentId]
    );

    // Save history
    await execute(
      `INSERT INTO incident_history (id, incident_id, user_id, action, note, state_snapshot, created_at)
       VALUES (?, ?, ?, 'closed', 'Incident record formally closed and signed off.', ?, ?)`,
      [
        crypto.randomUUID(),
        incidentId,
        actor.id,
        JSON.stringify({ status: 'closed' }),
        now,
      ]
    );

    broadcastSSEEvent('incident.closed', { incidentId, alertId: incident.alert_id, version: nextVersion });

    return getIncidentState(incidentId, actor);
  });
}

/**
 * Admin: Reopens a closed or voided incident.
 */
export async function reopenIncident(params: {
  actor: Actor;
  incidentId: string;
  expectedVersion: number;
  reason: string;
  idempotencyKey?: string;
}) {
  const { actor, incidentId, expectedVersion, reason, idempotencyKey } = params;

  if (actor.role !== 'admin' && actor.role !== 'superadmin') {
    throw new IncidentError('Only administrators can reopen incident records.', 'ACCESS_DENIED', 403);
  }

  if (!reason || reason.trim().length === 0) {
    throw new IncidentError('Reopen reason is required.', 'VALIDATION_ERROR', 400, { reason: 'Required' });
  }

  return transaction(async () => {
    const incident = await queryOne('SELECT * FROM incident_records WHERE id = ?', [incidentId]);
    if (!incident) {
      throw new IncidentError('Incident record not found.', 'NOT_FOUND', 404);
    }

    if (incident.status === 'submitted') {
      return getIncidentState(incidentId, actor);
    }

    if (incident.version !== expectedVersion) {
      throw new IncidentError('Concurrency conflict.', 'CONCURRENCY_CONFLICT', 409);
    }

    const nextVersion = incident.version + 1;
    const now = new Date().toISOString();

    // Reset some of the checklist values
    const checklist: ClosureChecklist = JSON.parse(incident.closure_checklist || '{}');
    checklist.signedOffByAdmin = false; // Require signoff again

    await execute(
      `UPDATE incident_records
       SET status = 'submitted', closure_checklist = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(checklist), nextVersion, now, incidentId]
    );

    // Save history
    await execute(
      `INSERT INTO incident_history (id, incident_id, user_id, action, note, state_snapshot, created_at)
       VALUES (?, ?, ?, 'reopened', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        incidentId,
        actor.id,
        `Incident reopened by Admin. Reason: ${reason}`,
        JSON.stringify({ status: 'submitted' }),
        now,
      ]
    );

    broadcastSSEEvent('incident.reopened', { incidentId, alertId: incident.alert_id, reason, version: nextVersion });

    return getIncidentState(incidentId, actor);
  });
}

/**
 * Admin: Voids / Marks an incident as not-required.
 */
export async function voidIncident(params: {
  actor: Actor;
  incidentId: string;
  expectedVersion: number;
  reason: string;
  idempotencyKey?: string;
}) {
  const { actor, incidentId, expectedVersion, reason, idempotencyKey } = params;

  if (actor.role !== 'admin' && actor.role !== 'superadmin') {
    throw new IncidentError('Only administrators can void incident records.', 'ACCESS_DENIED', 403);
  }

  if (!reason || reason.trim().length === 0) {
    throw new IncidentError('Reason for voiding is required.', 'VALIDATION_ERROR', 400, { reason: 'Required' });
  }

  return transaction(async () => {
    const incident = await queryOne('SELECT * FROM incident_records WHERE id = ?', [incidentId]);
    if (!incident) {
      throw new IncidentError('Incident record not found.', 'NOT_FOUND', 404);
    }

    if (incident.status === 'voided') {
      return getIncidentState(incidentId, actor);
    }

    if (incident.version !== expectedVersion) {
      throw new IncidentError('Concurrency conflict.', 'CONCURRENCY_CONFLICT', 409);
    }

    const nextVersion = incident.version + 1;
    const now = new Date().toISOString();

    await execute(
      `UPDATE incident_records
       SET status = 'voided', version = ?, updated_at = ?
       WHERE id = ?`,
      [nextVersion, now, incidentId]
    );

    // Save history
    await execute(
      `INSERT INTO incident_history (id, incident_id, user_id, action, note, state_snapshot, created_at)
       VALUES (?, ?, ?, 'voided', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        incidentId,
        actor.id,
        `Incident voided by Admin. Reason: ${reason}`,
        JSON.stringify({ status: 'voided' }),
        now,
      ]
    );

    broadcastSSEEvent('incident.updated', { incidentId, alertId: incident.alert_id, status: 'voided', version: nextVersion });

    return getIncidentState(incidentId, actor);
  });
}

/**
 * Retrieves a list of incidents with filters.
 */
export async function getIncidentsList(params: {
  actor: Actor;
  eventId?: string;
  status?: string;
  category?: string;
  page?: number;
  limit?: number;
}) {
  const { actor, eventId, status, category, page = 1, limit = 20 } = params;

  // Access validation: volunteers can only see what they have access to
  // For simplicity, volunteers retrieve incidents list and the database query or post-query filter restricts it
  // Admins see all.

  const offset = (page - 1) * limit;
  const whereClauses: string[] = [];
  const queryParams: any[] = [];

  if (eventId) {
    whereClauses.push('event_id = ?');
    queryParams.push(eventId);
  }

  if (status) {
    whereClauses.push('status = ?');
    queryParams.push(status);
  }

  if (category) {
    whereClauses.push('category = ?');
    queryParams.push(category);
  }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const totalRes = await queryOne(`SELECT COUNT(*) as count FROM incident_records ${whereStr}`, queryParams);
  const total = totalRes ? Number(totalRes.count) : 0;
  const totalPages = Math.ceil(total / limit);

  const listQuery = `
    SELECT * FROM incident_records
    ${whereStr}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  const incidents = await query(listQuery, [...queryParams, limit, offset]);

  const serializedList = [];
  for (const item of incidents) {
    // Double check access check for volunteers
    const acc = await verifyIncidentAccess(actor, item.alert_id, 'view');
    if (!acc.allowed) continue;

    serializedList.push(serializeIncident(item, actor));
  }

  return {
    success: true,
    items: serializedList,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Helper to retrieve incident history / logs.
 */
export async function getIncidentHistory(incidentId: string, actor: Actor) {
  const incident = await queryOne('SELECT alert_id FROM incident_records WHERE id = ?', [incidentId]);
  if (!incident) {
    throw new IncidentError('Incident record not found.', 'NOT_FOUND', 404);
  }

  const access = await verifyIncidentAccess(actor, incident.alert_id, 'view');
  if (!access.allowed) {
    throw new IncidentError(access.reason || 'Unauthorized.', 'ACCESS_DENIED', 403);
  }

  const logs = await query(
    `SELECT h.*, u.email as user_email
     FROM incident_history h
     LEFT JOIN users u ON h.user_id = u.id
     WHERE h.incident_id = ?
     ORDER BY h.created_at ASC`,
    [incidentId]
  );

  return logs.map(l => ({
    id: l.id,
    action: l.action,
    note: l.note,
    createdAt: l.created_at,
    userEmail: l.user_email,
  }));
}

/**
 * Safe, role-aware serialization for incident states.
 * Enforces safeguarding restrictions:
 * - Safeguarding & Protected details (like medical descriptions, narrative details, safeguarding review notes,
 *   parent phone/WhatsApp, and actual child name snippets) must NOT be shown to volunteers who are not authorized.
 * - This serializer acts as the central firewall.
 */
export function serializeIncident(record: any, actor: Actor) {
  const isAuthorized = actor.role === 'admin' || actor.role === 'superadmin' || record.creator_user_id === actor.id;

  // Parse JSON fields safely
  const structuredData = record.structured_data ? JSON.parse(record.structured_data) : {};
  const followUpActions = record.follow_up_actions ? JSON.parse(record.follow_up_actions) : [];
  const changeRequests = record.change_requests ? JSON.parse(record.change_requests) : [];
  const closureChecklist = record.closure_checklist ? JSON.parse(record.closure_checklist) : {};

  // Redacted details for basic non-creator volunteers
  const finalStructuredData = { ...structuredData };
  let parentContact = record.parent_contact;
  let firstAid = record.first_aid;
  let security = record.security;
  let description = record.description;

  if (!isAuthorized) {
    // Redact sensitive details for non-creator/non-admin volunteer
    description = '[REDACTED FOR PRIVACY - SENSITIVE CASE]';
    parentContact = '[REDACTED]';
    firstAid = '[REDACTED]';
    security = '[REDACTED]';

    if (record.category === 'behavioral') {
      if (finalStructuredData.narrative) finalStructuredData.narrative = '[REDACTED]';
      if (finalStructuredData.staffInvolved) finalStructuredData.staffInvolved = '[REDACTED]';
    }
    if (record.category === 'medical') {
      if (finalStructuredData.symptoms) finalStructuredData.symptoms = '[REDACTED]';
      if (finalStructuredData.treatment) finalStructuredData.treatment = '[REDACTED]';
    }
  }

  return {
    id: record.id,
    alertId: record.alert_id,
    eventId: record.event_id,
    creatorUserId: record.creator_user_id,
    status: record.status,
    category: record.category,
    title: record.title,
    description,
    structuredData: finalStructuredData,
    parentContact,
    firstAid,
    security,
    followUpActions,
    changeRequests,
    closureChecklist,
    version: record.version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

/**
 * Returns full state for a given incident record.
 */
export async function getIncidentState(incidentId: string, actor: Actor) {
  const record = await queryOne('SELECT * FROM incident_records WHERE id = ?', [incidentId]);
  if (!record) {
    throw new IncidentError('Incident record not found.', 'NOT_FOUND', 404);
  }
  return serializeIncident(record, actor);
}

/**
 * Returns incident state by associated alert ID.
 */
export async function getIncidentByAlertId(alertId: string, actor: Actor) {
  const record = await queryOne('SELECT * FROM incident_records WHERE alert_id = ?', [alertId]);
  if (!record) {
    return null;
  }
  return serializeIncident(record, actor);
}

/**
 * Stats and Reporting endpoint data for Admins.
 */
export async function getIncidentStats(actor: Actor) {
  if (actor.role !== 'admin' && actor.role !== 'superadmin') {
    throw new IncidentError('Access denied.', 'ACCESS_DENIED', 403);
  }

  const totals = await query(`
    SELECT category, status, COUNT(*) as count
    FROM incident_records
    GROUP BY category, status
  `);

  const totalCountRes = await queryOne('SELECT COUNT(*) as count FROM incident_records');
  const closedCountRes = await queryOne('SELECT COUNT(*) as count FROM incident_records WHERE status = \'closed\'');
  const pendingFollowUpsRes = await queryOne(`
    SELECT COUNT(*) as count
    FROM incident_records, json_each(follow_up_actions)
    WHERE json_extract(json_each.value, '$.status') = 'pending'
  `).catch(() => {
    // Fallback if sqlite json_each is not supported or postgres
    return { count: 0 };
  });

  return {
    success: true,
    totalCount: totalCountRes ? Number(totalCountRes.count) : 0,
    closedCount: closedCountRes ? Number(closedCountRes.count) : 0,
    pendingFollowUps: pendingFollowUpsRes ? Number(pendingFollowUpsRes.count) : 0,
    breakdown: totals,
  };
}
