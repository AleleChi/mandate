import crypto from 'crypto';
import { execute, query, queryOne, transaction } from '../db';
import { validateBody, normalizeSingleLineText } from './messageService';
import { notifyCompletionReminderSent } from './messagingNotificationService';
import { evaluateWhatsAppEligibility } from './whatsapp/consent';
import { getWhatsAppProvider, getWhatsAppProviderReadiness, logWhatsAppDelivery } from './whatsapp';
import { evaluateApplicationNeedsAttention, REASON_LABELS } from './applicationNeedsAttentionService';
import { CANONICAL_GA_EVENT_DATE } from './eligibilityService';

export class ApplicationReminderError extends Error {
  code: string;
  statusCode: number;
  metadata?: any;

  constructor(code: string, message: string, statusCode = 400, metadata?: any) {
    super(message);
    this.name = 'ApplicationReminderError';
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;
  }
}

export const REMINDER_SUBJECT = "Complete your child's application";
export const CORRECTION_SUBJECT = "Action required for registration";
export const REMINDER_COOLDOWN_MINUTES = 60;
export const REMINDER_COOLDOWN_MS = REMINDER_COOLDOWN_MINUTES * 60 * 1000;

/**
 * Authoritative incomplete/draft predicate.
 * Must match the application integrity invariants enforced by the backend:
 * - status is 'incomplete' or 'draft'
 * - submitted_at is NULL
 * - details_confirmed is 0 or falsy
 * - not deleted
 */
export function isAuthoritativeIncomplete(entry: {
  status?: string | null;
  submitted_at?: string | null;
  details_confirmed?: number | boolean | null;
  is_deleted?: number | boolean | null;
}): boolean {
  if (!entry) return false;
  if (entry.is_deleted) return false;

  const status = (entry.status || '').trim().toLowerCase();
  const isDraftStatus = status === 'incomplete' || status === 'draft';
  const hasNoSubmission = !entry.submitted_at;
  const isDetailsUnconfirmed = !entry.details_confirmed || entry.details_confirmed === 0;

  return isDraftStatus && hasNoSubmission && isDetailsUnconfirmed;
}

/**
 * Formats canonical event registration deadline for safe presentation in reminder body.
 */
export function formatRegistrationDeadline(dateStr?: string | null): string {
  if (!dateStr) return '17 October 2026 at 11:59 PM';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getUTCDate();
    const month = d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
    const year = d.getUTCFullYear();
    const hours = d.getUTCHours();
    const minutes = d.getUTCMinutes();
    if (hours !== 0 || minutes !== 0) {
      const period = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours % 12 || 12;
      const minuteStr = minutes.toString().padStart(2, '0');
      return `${day} ${month} ${year} at ${hour12}:${minuteStr} ${period}`;
    }
    return `${day} ${month} ${year} at 11:59 PM`;
  } catch {
    return dateStr;
  }
}

/**
 * Generates privacy-safe WhatsApp nudge body.
 * Strictly excludes: DOB, medical details, internal IDs, pickup information, and sensitive child data.
 */
export function generateDefaultWhatsAppNudgeBody(params: {
  parentFirstName: string;
  childFirstName: string;
  formattedDeadline: string;
}): string {
  return `Hello ${params.parentFirstName},

${params.childFirstName}'s registration is still incomplete.

Please sign in to your Koinonia Parent account to complete the application before registration closes on ${params.formattedDeadline}.`;
}

export interface AuthoritativeEntryContext {
  entry: any;
  child: any;
  parentProfile: any;
  parentUser: any;
  event: any;
  parentFirstName: string;
  childFirstName: string;
  registrationClosesAt: string | null;
  formattedDeadline: string;
}

/**
 * Resolves authoritative application hierarchy:
 * child_event_entries -> child -> parent_profile -> parent users.id + event
 */
export async function resolveAuthoritativeEntryContext(entryId: string): Promise<AuthoritativeEntryContext> {
  const entry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entryId]);
  if (!entry || entry.is_deleted) {
    throw new ApplicationReminderError(
      'APPLICATION_REMINDER_NOT_FOUND',
      'Child application entry not found.',
      404
    );
  }

  const child = await queryOne('SELECT * FROM children WHERE id = ?', [entry.child_id]);
  if (!child || child.is_deleted) {
    throw new ApplicationReminderError(
      'APPLICATION_REMINDER_NOT_FOUND',
      'Associated child record not found.',
      404
    );
  }

  const parentProfile = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [child.parent_profile_id]);
  if (!parentProfile || parentProfile.is_deleted) {
    throw new ApplicationReminderError(
      'APPLICATION_REMINDER_PARENT_NOT_FOUND',
      'Associated parent profile not found.',
      404
    );
  }

  const parentUser = await queryOne('SELECT * FROM users WHERE id = ?', [parentProfile.user_id]);
  if (!parentUser || parentUser.role !== 'parent') {
    throw new ApplicationReminderError(
      'APPLICATION_REMINDER_PARENT_NOT_FOUND',
      'Associated parent user account not found.',
      404
    );
  }

  const event = await queryOne('SELECT * FROM events WHERE id = ?', [entry.event_id]);
  if (!event) {
    throw new ApplicationReminderError(
      'APPLICATION_REMINDER_NOT_FOUND',
      'Associated event not found.',
      404
    );
  }

  const parentFullName = (parentProfile.full_name || '').trim();
  const parentFirstName = parentFullName.split(/\s+/)[0] || 'Parent';

  const childFullName = (child.full_name || '').trim();
  const childFirstName = childFullName.split(/\s+/)[0] || 'Child';

  const registrationClosesAt = event.parent_access_closes_at || event.ends_at || null;
  const formattedDeadline = formatRegistrationDeadline(registrationClosesAt);

  return {
    entry,
    child,
    parentProfile,
    parentUser,
    event,
    parentFirstName,
    childFirstName,
    registrationClosesAt,
    formattedDeadline
  };
}

/**
 * Generates system-controlled default reminder body using authoritative context.
 * Internal IDs (DOB, entry ID, internal database keys) are strictly excluded from text.
 */
export function generateDefaultReminderBody(params: {
  parentFirstName: string;
  childFirstName: string;
  formattedDeadline: string;
}): string {
  return `Hello ${params.parentFirstName},

The registration for ${params.childFirstName} has not yet been completed.

Please sign in to your Parent account and complete the outstanding information before registration closes on ${params.formattedDeadline}.

An application is only submitted for review after all required information has been completed.`;
}

/**
 * Derives cooldown state for an application from durable messaging history.
 * Cooldown applies to reminder / correction messages for this entry within 60 minutes.
 */
export async function getReminderCooldownState(entryId: string, messageType?: string): Promise<{
  lastReminderSentAt: string | null;
  cooldownEndsAt: string | null;
  canSend: boolean;
}> {
  const whereType = messageType
    ? "AND m.message_type = ?"
    : "AND m.message_type IN ('application_completion_reminder', 'application_correction_required')";
  const params = messageType ? [entryId, messageType] : [entryId];

  const row = await queryOne(`
    SELECT m.created_at
    FROM messages m
    JOIN message_threads t ON t.id = m.thread_id
    WHERE t.linked_entry_id = ?
      ${whereType}
    ORDER BY m.created_at DESC
    LIMIT 1
  `, params);

  if (!row || !row.created_at) {
    return {
      lastReminderSentAt: null,
      cooldownEndsAt: null,
      canSend: true
    };
  }

  const lastSentTime = new Date(row.created_at).getTime();
  const cooldownEndTime = lastSentTime + REMINDER_COOLDOWN_MS;
  const nowTime = Date.now();

  const isInsideCooldown = nowTime < cooldownEndTime;

  return {
    lastReminderSentAt: new Date(lastSentTime).toISOString(),
    cooldownEndsAt: new Date(cooldownEndTime).toISOString(),
    canSend: !isInsideCooldown
  };
}

/**
 * Derives WhatsApp cooldown state for an application from whatsapp_delivery_logs history.
 * Prevents rapid accidental duplicate WhatsApp sends within 60 minutes.
 */
export async function getWhatsAppCooldownState(entryId: string): Promise<{
  lastSentAt: string | null;
  cooldownEndsAt: string | null;
  canSend: boolean;
}> {
  const row = await queryOne(`
    SELECT COALESCE(sent_at, created_at) as sent_at
    FROM whatsapp_delivery_logs
    WHERE child_event_entry_id = ?
      AND status IN ('sent', 'delivered', 'read', 'queued')
    ORDER BY COALESCE(sent_at, created_at) DESC
    LIMIT 1
  `, [entryId]);

  if (!row || !row.sent_at) {
    return {
      lastSentAt: null,
      cooldownEndsAt: null,
      canSend: true
    };
  }

  const lastSentTime = new Date(row.sent_at).getTime();
  const cooldownEndTime = lastSentTime + REMINDER_COOLDOWN_MS;
  const nowTime = Date.now();
  const isInsideCooldown = nowTime < cooldownEndTime;

  return {
    lastSentAt: new Date(lastSentTime).toISOString(),
    cooldownEndsAt: new Date(cooldownEndTime).toISOString(),
    canSend: !isInsideCooldown
  };
}

export interface PreviewCompletionReminderResult {
  eligible: boolean;
  workflow: 'incomplete' | 'correction';
  mode: 'incomplete' | 'correction';
  entryId: string;
  child: {
    id: string;
    firstName: string;
  };
  parent: {
    id: string;
    firstName: string;
  };
  subject: string;
  body: string;
  prefilledBody?: string;
  actionType: 'resume_application' | 'update_application_details';
  nextStepLabel: string;
  registrationClosesAt: string | null;
  lastReminderSentAt: string | null;
  cooldownEndsAt: string | null;
  canSend: boolean;
  threadId: string | null;
  reason?: string;
  missingSections?: string[];
  needsAttentionReasons?: string[];
  whatsapp: {
    eligible: boolean;
    reason?: string;
    phone: string | null;
    consentStatus: string;
    lastSentAt: string | null;
    cooldownEndsAt: string | null;
    canSend: boolean;
    defaultBody: string;
  };
}

/**
 * Previews completion or correction reminder context, prefilled body, cooldown states, and channel eligibility for Admin.
 */
export async function previewCompletionReminder(
  entryId: string,
  adminUser: { id: string; role: string }
): Promise<PreviewCompletionReminderResult> {
  if (!['admin', 'super_admin'].includes(adminUser.role)) {
    throw new ApplicationReminderError('FORBIDDEN', 'Admin or Super Admin access required.', 403);
  }

  const context = await resolveAuthoritativeEntryContext(entryId);
  const isIncomplete = isAuthoritativeIncomplete(context.entry);

  const pickups = await query('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entryId]);
  const needsAttentionCheck = evaluateApplicationNeedsAttention(
    {
      ...context.entry,
      ...context.child,
      child_name: context.child.full_name,
      parent_photo_file_id: context.parentProfile.photo_file_id
    },
    pickups,
    context.event.starts_at || CANONICAL_GA_EVENT_DATE
  );

  let eligible = false;
  let workflow: 'incomplete' | 'correction' = 'incomplete';
  let mode: 'incomplete' | 'correction' = 'incomplete';
  let subject = "Complete your child's application";
  let body = '';
  let actionType: 'resume_application' | 'update_application_details' = 'resume_application';
  let nextStepLabel = 'Continue application';
  let notEligibleReason: string | undefined = undefined;

  if (isIncomplete) {
    eligible = true;
    workflow = 'incomplete';
    mode = 'incomplete';
    subject = "Complete your child's application";
    actionType = 'resume_application';
    nextStepLabel = 'Continue application';
    body = `Hello ${context.parentFirstName},

${context.childFirstName}'s registration has not yet been completed.

Please sign in to your Parent account and complete the outstanding information before registration closes on ${context.formattedDeadline}.

The application will be submitted for review once all required information is complete.`;
  } else if (needsAttentionCheck.needsAttention) {
    eligible = true;
    workflow = 'correction';
    mode = 'correction';
    subject = `Action required for ${context.childFirstName}'s registration`;
    actionType = 'update_application_details';
    nextStepLabel = 'Update application details';

    let correctionBody = `Hello ${context.parentFirstName},

We need some additional information to complete ${context.childFirstName}'s registration for the General Assembly Children & Teens Session.

Please sign in to your Parent account and update the required information.`;

    if (needsAttentionCheck.reasons.includes('MISSING_PICKUP_PHOTO') || needsAttentionCheck.reasons.includes('INVALID_PICKUP_PHOTO')) {
      correctionBody += `\n\nA clear photo of the authorised pickup person is still required.`;
    }
    body = correctionBody;
  } else {
    eligible = false;
    workflow = 'incomplete';
    mode = 'incomplete';
    notEligibleReason = 'Application is complete and does not require attention or completion reminder.';
  }

  const cooldown = await getReminderCooldownState(entryId, isIncomplete ? 'application_completion_reminder' : 'application_correction_required');

  const existingThread = await queryOne(`
    SELECT id, status FROM message_threads
    WHERE event_id = ?
      AND linked_entry_id = ?
      AND category = 'child_application'
    ORDER BY created_at DESC
    LIMIT 1
  `, [context.event.id, entryId]);

  // Evaluate WhatsApp channel eligibility
  const waEligibility = evaluateWhatsAppEligibility(context.parentProfile);
  const providerReadiness = getWhatsAppProviderReadiness();
  const waCooldown = await getWhatsAppCooldownState(entryId);

  let waCanSend = false;
  let waReason: string | undefined = undefined;

  if (!providerReadiness.configured) {
    waReason = 'WhatsApp provider is not configured or unavailable.';
  } else if (!waEligibility.eligible) {
    waReason = 'WhatsApp updates are not enabled for this parent.';
  } else if (!waCooldown.canSend) {
    waReason = 'A WhatsApp reminder was recently sent. Cooldown active.';
  } else {
    waCanSend = true;
  }

  // Audit authoritative missing sections (no fake progress)
  const missingSections: string[] = [];
  if (!context.child.date_of_birth) {
    missingSections.push('Date of birth');
  }
  if (!pickups || pickups.length === 0) {
    missingSections.push('Authorised pickup person');
  } else if (needsAttentionCheck.reasons.includes('MISSING_PICKUP_PHOTO') || needsAttentionCheck.reasons.includes('INVALID_PICKUP_PHOTO')) {
    missingSections.push('Authorised pickup person photo');
  }
  if (!context.entry.details_confirmed || context.entry.details_confirmed === 0) {
    missingSections.push('Consent & confirmation of details');
  }

  const defaultWhatsAppBody = isIncomplete
    ? generateDefaultWhatsAppNudgeBody({
        parentFirstName: context.parentFirstName,
        childFirstName: context.childFirstName,
        formattedDeadline: context.formattedDeadline
      })
    : "Koinonia Children & Teens:\nThere is an update requiring your attention in your Parent account for the General Assembly registration. Please sign in to review it.";

  return {
    eligible,
    workflow,
    mode,
    entryId,
    child: {
      id: context.child.id,
      firstName: context.childFirstName
    },
    parent: {
      id: context.parentUser.id,
      firstName: context.parentFirstName
    },
    subject,
    body,
    prefilledBody: body,
    actionType,
    nextStepLabel,
    registrationClosesAt: context.registrationClosesAt,
    lastReminderSentAt: cooldown.lastReminderSentAt,
    cooldownEndsAt: cooldown.cooldownEndsAt,
    canSend: eligible && cooldown.canSend,
    threadId: existingThread?.id || null,
    reason: eligible ? undefined : notEligibleReason,
    missingSections,
    needsAttentionReasons: needsAttentionCheck.reasons,
    whatsapp: {
      eligible: waEligibility.eligible && providerReadiness.configured,
      reason: waReason,
      phone: waEligibility.normalizedNumber || null,
      consentStatus: waEligibility.consentStatus,
      lastSentAt: waCooldown.lastSentAt,
      cooldownEndsAt: waCooldown.cooldownEndsAt,
      canSend: eligible && waCanSend,
      defaultBody: defaultWhatsAppBody
    }
  };
}

export interface SendCompletionReminderParams {
  entryId: string;
  adminUserId: string;
  adminRole: string;
  customBody?: string;
  workflow?: 'incomplete' | 'correction';
}

export interface SendCompletionReminderResult {
  success: boolean;
  messageId: string;
  threadId: string;
  thread: any;
  message: any;
  cooldownEndsAt: string;
}

/**
 * Atomically checks eligibility, cooldown, creates or reuses thread,
 * appends completion reminder message, and logs audit record.
 */
export async function sendCompletionReminder(
  params: SendCompletionReminderParams
): Promise<SendCompletionReminderResult> {
  if (!['admin', 'super_admin'].includes(params.adminRole)) {
    throw new ApplicationReminderError('FORBIDDEN', 'Admin or Super Admin access required.', 403);
  }

  // 1. Resolve context
  const context = await resolveAuthoritativeEntryContext(params.entryId);
  const isIncomplete = isAuthoritativeIncomplete(context.entry);

  let needsAttentionCheck = { needsAttention: false, reasons: [] as string[] };
  if (params.workflow === 'correction') {
    if (isIncomplete) {
      throw new ApplicationReminderError(
        'APPLICATION_NOT_ACTIONABLE',
        'Application is an incomplete draft, not a submitted application requiring correction.',
        409
      );
    }
    const rawPickups = await query<any>(
      'SELECT * FROM pickup_people WHERE child_event_entry_id = ?',
      [params.entryId]
    );
    needsAttentionCheck = evaluateApplicationNeedsAttention(
      {
        ...context.entry,
        ...context.child,
        child_name: context.child.full_name,
        parent_name: context.parentProfile.full_name,
        parent_phone: context.parentProfile.phone_number,
        parent_photo_file_id: context.parentProfile.photo_file_id
      },
      rawPickups,
      CANONICAL_GA_EVENT_DATE
    );
    if (!needsAttentionCheck.needsAttention) {
      throw new ApplicationReminderError(
        'APPLICATION_NOT_ACTIONABLE',
        'Application has no outstanding missing information requiring correction.',
        409
      );
    }
  } else {
    // Default: incomplete draft completion reminder
    if (!isIncomplete) {
      throw new ApplicationReminderError(
        'APPLICATION_NOT_INCOMPLETE',
        'Application is not in an incomplete draft state. A completion reminder cannot be sent.',
        409
      );
    }
  }

  const messageType = isIncomplete ? 'application_completion_reminder' : 'application_correction_required';
  const actionType = isIncomplete ? 'resume_application' : 'update_application_details';
  const reminderSubject = isIncomplete
    ? REMINDER_SUBJECT
    : `Action required for ${context.childFirstName}'s registration`;

  // 2. Validate body (Admin may edit, or default is used)
  let messageBody: string;
  if (params.customBody !== undefined && params.customBody !== null) {
    messageBody = validateBody(params.customBody);
  } else if (isIncomplete) {
    messageBody = generateDefaultReminderBody({
      parentFirstName: context.parentFirstName,
      childFirstName: context.childFirstName,
      formattedDeadline: context.formattedDeadline
    });
  } else {
    const hasPickupPhotoIssue = needsAttentionCheck.reasons.some(r =>
      r === 'MISSING_PICKUP_PHOTO' || r === 'INVALID_PICKUP_PHOTO'
    );
    const pickupPhotoSentence = hasPickupPhotoIssue
      ? '\nA clear photo of the authorised pickup person is still required.'
      : '';
    messageBody = `Hello ${context.parentFirstName},\n\nWe need some additional information to complete ${context.childFirstName}'s registration for the General Assembly Children & Teens Session.\n\nPlease sign in to your Parent account and update the required information.${pickupPhotoSentence}\n\nThank you,\nKoinonia Registration Team`;
  }

  // 3. Atomic execution inside transaction
  return await transaction(async () => {
    // Re-check application state inside transaction to guard against stale composer
    const currentEntry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [params.entryId]);
    if (!currentEntry) {
      throw new ApplicationReminderError('APPLICATION_NOT_FOUND', 'Application entry not found.', 404);
    }
    const currentIsIncomplete = isAuthoritativeIncomplete(currentEntry);
    if (params.workflow === 'correction') {
      if (currentIsIncomplete) {
        throw new ApplicationReminderError(
          'APPLICATION_NOT_ACTIONABLE',
          'Application is an incomplete draft, not a submitted application requiring correction.',
          409
        );
      }
      const rawPickups = await query<any>(
        'SELECT * FROM pickup_people WHERE child_event_entry_id = ?',
        [params.entryId]
      );
      const currentNeedsAttn = evaluateApplicationNeedsAttention(
        {
          ...currentEntry,
          ...context.child,
          child_name: context.child.full_name,
          parent_name: context.parentProfile.full_name,
          parent_phone: context.parentProfile.phone_number,
          parent_photo_file_id: context.parentProfile.photo_file_id
        },
        rawPickups,
        CANONICAL_GA_EVENT_DATE
      );
      if (!currentNeedsAttn.needsAttention) {
        throw new ApplicationReminderError(
          'APPLICATION_NOT_ACTIONABLE',
          'Application is no longer requiring attention.',
          409
        );
      }
    } else {
      if (!currentIsIncomplete) {
        throw new ApplicationReminderError(
          'APPLICATION_NOT_INCOMPLETE',
          'Application is no longer in an incomplete draft state. A reminder cannot be sent.',
          409
        );
      }
    }

    // Cooldown check inside transaction
    const cooldown = await getReminderCooldownState(params.entryId, messageType);
    if (!cooldown.canSend) {
      throw new ApplicationReminderError(
        'APPLICATION_REMINDER_COOLDOWN',
        'A reminder was recently sent for this application. Please wait until cooldown expires.',
        409,
        {
          lastReminderSentAt: cooldown.lastReminderSentAt,
          cooldownEndsAt: cooldown.cooldownEndsAt
        }
      );
    }

    const now = new Date().toISOString();

    // 4. Thread resolution: search existing child_application thread for event + entry
    let thread = await queryOne(`
      SELECT * FROM message_threads
      WHERE event_id = ?
        AND linked_entry_id = ?
        AND category = 'child_application'
      ORDER BY created_at DESC
      LIMIT 1
    `, [context.event.id, params.entryId]);

    let threadId: string;

    if (thread) {
      threadId = thread.id;
      // Reopen if resolved per Section 18
      if (thread.status === 'resolved') {
        await execute(`
          UPDATE message_threads
          SET status = 'open', updated_at = ?
          WHERE id = ?
        `, [now, threadId]);

        try {
          await execute(`
            INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
            VALUES (?, ?, ?, 'THREAD_REOPENED', 'message_thread', ?, ?, ?)
          `, [
            `audit-${crypto.randomUUID()}`,
            params.adminUserId,
            params.adminRole,
            threadId,
            JSON.stringify({ threadId, previousStatus: 'resolved', newStatus: 'open', reason: isIncomplete ? 'completion_reminder' : 'correction_reminder' }),
            now
          ]);
        } catch (auditErr) {
          console.error('[applicationReminderService] Failed to record audit log for thread reopen:', auditErr);
        }
      }
    } else {
      // Create new thread
      threadId = `thrd-${crypto.randomUUID()}`;
      const preview = normalizeSingleLineText(messageBody).slice(0, 120);

      await execute(`
        INSERT INTO message_threads (
          id, event_id, category, subject, status, linked_child_id, linked_entry_id,
          created_by_user_id, last_message_at, last_message_preview, created_at, updated_at
        ) VALUES (?, ?, 'child_application', ?, 'open', ?, ?, ?, ?, ?, ?, ?)
      `, [
        threadId,
        context.event.id,
        reminderSubject,
        context.child.id,
        params.entryId,
        params.adminUserId,
        now,
        preview,
        now,
        now
      ]);

      // Participant 1: Parent
      await execute(`
        INSERT INTO message_thread_participants (
          id, thread_id, user_id, role, last_read_at, is_archived, created_at
        ) VALUES (?, ?, ?, 'parent', NULL, 0, ?)
      `, [`part-${crypto.randomUUID()}`, threadId, context.parentUser.id, now]);

      // Participant 2: Admin
      await execute(`
        INSERT INTO message_thread_participants (
          id, thread_id, user_id, role, last_read_at, is_archived, created_at
        ) VALUES (?, ?, ?, 'admin', ?, 0, ?)
      `, [`part-${crypto.randomUUID()}`, threadId, params.adminUserId, now, now]);
    }

    // Ensure Admin participant row exists on existing thread
    const adminParticipant = await queryOne(`
      SELECT id FROM message_thread_participants WHERE thread_id = ? AND user_id = ?
    `, [threadId, params.adminUserId]);

    if (!adminParticipant) {
      await execute(`
        INSERT INTO message_thread_participants (
          id, thread_id, user_id, role, last_read_at, is_archived, created_at
        ) VALUES (?, ?, ?, 'admin', ?, 0, ?)
      `, [`part-${crypto.randomUUID()}`, threadId, params.adminUserId, now, now]);
    } else {
      await execute(`
        UPDATE message_thread_participants SET last_read_at = ? WHERE id = ?
      `, [now, adminParticipant.id]);
    }

    // Ensure Parent participant row exists
    const parentParticipant = await queryOne(`
      SELECT id FROM message_thread_participants WHERE thread_id = ? AND user_id = ?
    `, [threadId, context.parentUser.id]);

    if (!parentParticipant) {
      await execute(`
        INSERT INTO message_thread_participants (
          id, thread_id, user_id, role, last_read_at, is_archived, created_at
        ) VALUES (?, ?, ?, 'parent', NULL, 0, ?)
      `, [`part-${crypto.randomUUID()}`, threadId, context.parentUser.id, now]);
    }

    // 5. Insert reminder message
    const messageId = `msg-${crypto.randomUUID()}`;
    const actionPayload = JSON.stringify({
      entryId: params.entryId,
      childId: context.child.id,
      reasons: isIncomplete ? undefined : needsAttentionCheck.reasons
    });

    await execute(`
      INSERT INTO messages (
        id, thread_id, sender_user_id, sender_role, message_type, body,
        action_type, action_payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      messageId,
      threadId,
      params.adminUserId,
      params.adminRole,
      messageType,
      messageBody,
      actionType,
      actionPayload,
      now,
      now
    ]);

    // 6. Update thread metadata
    const preview = normalizeSingleLineText(messageBody).slice(0, 120);
    await execute(`
      UPDATE message_threads
      SET last_message_at = ?,
          last_message_preview = ?,
          updated_at = ?
      WHERE id = ?
    `, [now, preview, now, threadId]);

    // 7. Audit log (Metadata only, NO message body)
    const auditAction = isIncomplete
      ? 'APPLICATION_COMPLETION_REMINDER_SENT'
      : 'APPLICATION_CORRECTION_REMINDER_SENT';

    try {
      await execute(`
        INSERT INTO audit_logs (
          id, user_id, user_role, action, target_type, target_id, details, timestamp
        ) VALUES (?, ?, ?, ?, 'child_event_entry', ?, ?, ?)
      `, [
        `audit-${crypto.randomUUID()}`,
        params.adminUserId,
        params.adminRole,
        auditAction,
        params.entryId,
        JSON.stringify({
          admin_id: params.adminUserId,
          parent_id: context.parentUser.id,
          child_id: context.child.id,
          entry_id: params.entryId,
          thread_id: threadId,
          message_id: messageId,
          event_id: context.event.id,
          message_type: messageType,
          reasons: isIncomplete ? undefined : needsAttentionCheck.reasons,
          timestamp: now
        }),
        now
      ]);
    } catch (auditErr) {
      console.error('[applicationReminderService] Failed to record audit log:', auditErr);
    }

    const insertedMessage = await queryOne('SELECT * FROM messages WHERE id = ?', [messageId]);
    const updatedThread = await queryOne('SELECT * FROM message_threads WHERE id = ?', [threadId]);

    // Trigger Phase H notification and SSE dispatch (non-blocking)
    notifyCompletionReminderSent({
      threadId,
      messageId,
      parentUserId: context.parentUser.id,
      parentProfileId: context.parentProfile.id,
      adminUserId: params.adminUserId,
      eventId: context.event.id
    }).catch(e => console.error('[sendCompletionReminder] Realtime dispatch error:', e));

    return {
      success: true,
      messageId,
      threadId,
      thread: updatedThread,
      message: insertedMessage,
      cooldownEndsAt: new Date(Date.now() + REMINDER_COOLDOWN_MS).toISOString()
    };
  });
}

export interface SendWhatsAppNudgeParams {
  entryId: string;
  adminUserId: string;
  adminRole: string;
  customBody?: string;
}

export interface SendWhatsAppNudgeResult {
  success: boolean;
  deliveryLogId: string;
  providerMessageId?: string;
  cooldownEndsAt: string;
}

/**
 * Dispatches an authoritative privacy-safe WhatsApp nudge to an opted-in Parent.
 * Never includes: DOB, medical details, internal IDs, pickup info, or sensitive child data.
 * Checks: isAuthoritativeIncomplete, parent consent = 'opted_in', E.164 phone, provider availability, and 60m cooldown.
 */
export async function sendWhatsAppNudge(
  params: SendWhatsAppNudgeParams
): Promise<SendWhatsAppNudgeResult> {
  if (!['admin', 'super_admin'].includes(params.adminRole)) {
    throw new ApplicationReminderError('FORBIDDEN', 'Admin or Super Admin access required.', 403);
  }

  const context = await resolveAuthoritativeEntryContext(params.entryId);
  const isIncomplete = isAuthoritativeIncomplete(context.entry);

  let needsAttentionCheck = { needsAttention: false, reasons: [] as string[] };
  if (!isIncomplete) {
    const rawPickups = await query<any>(
      'SELECT * FROM pickup_people WHERE child_id = ? AND event_id = ?',
      [context.child.id, context.event.id]
    );
    needsAttentionCheck = evaluateApplicationNeedsAttention(
      {
        ...context.entry,
        ...context.child,
        child_name: context.child.full_name,
        parent_name: context.parentProfile.full_name,
        parent_phone: context.parentProfile.phone_number,
        parent_photo_file_id: context.parentProfile.photo_file_id
      },
      rawPickups,
      CANONICAL_GA_EVENT_DATE
    );
    if (!needsAttentionCheck.needsAttention) {
      throw new ApplicationReminderError(
        'APPLICATION_NOT_ACTIONABLE',
        'Application is not in an incomplete draft state and has no outstanding missing information.',
        409
      );
    }
  }

  // 1. Verify consent & phone eligibility
  const eligibility = evaluateWhatsAppEligibility(context.parentProfile);
  if (!eligibility.eligible) {
    throw new ApplicationReminderError(
      'WHATSAPP_NOT_ELIGIBLE',
      eligibility.reason || 'Parent is not eligible for WhatsApp communication.',
      400
    );
  }

  // 2. Verify provider readiness
  const readiness = getWhatsAppProviderReadiness();
  if (!readiness.configured) {
    throw new ApplicationReminderError(
      'WHATSAPP_NOT_CONFIGURED',
      'WhatsApp provider is not configured or unavailable.',
      503
    );
  }

  // 3. Verify cooldown
  const cooldown = await getWhatsAppCooldownState(params.entryId);
  if (!cooldown.canSend) {
    throw new ApplicationReminderError(
      'WHATSAPP_COOLDOWN',
      'A WhatsApp reminder was recently sent for this application. Please wait until cooldown expires.',
      409,
      {
        lastSentAt: cooldown.lastSentAt,
        cooldownEndsAt: cooldown.cooldownEndsAt
      }
    );
  }

  // 4. Generate or validate privacy-safe body
  let nudgeBody: string;
  if (params.customBody) {
    nudgeBody = validateBody(params.customBody);
  } else if (isIncomplete) {
    nudgeBody = generateDefaultWhatsAppNudgeBody({
      parentFirstName: context.parentFirstName,
      childFirstName: context.childFirstName,
      formattedDeadline: context.formattedDeadline
    });
  } else {
    nudgeBody = "Koinonia Children & Teens:\nThere is an update requiring your attention in your Parent account for the General Assembly registration. Please sign in to review it.";
  }

  const provider = getWhatsAppProvider();
  const sendResult = await provider.sendSessionMessage({
    to: eligibility.normalizedNumber!,
    body: nudgeBody,
    idempotencyKey: `nudge:entry:${params.entryId}:${Date.now()}`
  });

  const now = new Date().toISOString();

  if (!sendResult.success) {
    const logId = await logWhatsAppDelivery({
      parentProfileId: context.parentProfile.id,
      childEventEntryId: params.entryId,
      userId: context.parentUser.id,
      recipientPhone: eligibility.normalizedNumber!,
      provider: provider.name,
      status: 'failed',
      errorCode: 'SEND_FAILED',
      errorMessage: sendResult.error || 'Failed to dispatch WhatsApp message',
      failedAt: now
    });

    throw new ApplicationReminderError(
      'WHATSAPP_DISPATCH_FAILED',
      sendResult.error || 'Failed to send WhatsApp message.',
      502,
      { deliveryLogId: logId }
    );
  }

  const logId = await logWhatsAppDelivery({
    parentProfileId: context.parentProfile.id,
    childEventEntryId: params.entryId,
    userId: context.parentUser.id,
    recipientPhone: eligibility.normalizedNumber!,
    provider: provider.name,
    providerMessageId: sendResult.messageId || null,
    status: 'sent',
    sentAt: now
  });

  // Audit log
  const auditAction = isIncomplete
    ? 'APPLICATION_COMPLETION_WHATSAPP_NUDGE_SENT'
    : 'APPLICATION_CORRECTION_WHATSAPP_NUDGE_SENT';

  try {
    await execute(`
      INSERT INTO audit_logs (
        id, user_id, user_role, action, target_type, target_id, details, timestamp
      ) VALUES (?, ?, ?, ?, 'child_event_entry', ?, ?, ?)
    `, [
      `audit-${crypto.randomUUID()}`,
      params.adminUserId,
      params.adminRole,
      auditAction,
      params.entryId,
      JSON.stringify({
        admin_id: params.adminUserId,
        parent_id: context.parentUser.id,
        child_id: context.child.id,
        entry_id: params.entryId,
        delivery_log_id: logId,
        provider: provider.name,
        recipient_phone: eligibility.normalizedNumber,
        is_incomplete: isIncomplete,
        timestamp: now
      }),
      now
    ]);
  } catch (auditErr) {
    console.error('[sendWhatsAppNudge] Failed to record audit log:', auditErr);
  }

  return {
    success: true,
    deliveryLogId: logId,
    providerMessageId: sendResult.messageId,
    cooldownEndsAt: new Date(Date.now() + REMINDER_COOLDOWN_MS).toISOString()
  };
}

export interface SendApplicationRecoveryReminderParams {
  entryId: string;
  adminUserId: string;
  adminRole: string;
  channel?: 'portal' | 'whatsapp' | 'both';
  customBody?: string;
  whatsappBody?: string;
}

export interface ChannelOperationResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  deliveryLogId?: string;
  providerMessageId?: string;
  status?: string;
  error?: string;
  cooldownEndsAt?: string;
}

export interface SendApplicationRecoveryReminderResult {
  success: boolean;
  channels: {
    portal?: ChannelOperationResult;
    whatsapp?: ChannelOperationResult;
  };
  lastReminderSentAt: string | null;
  lastWhatsAppSentAt: string | null;
  messageId?: string;
  threadId?: string;
  thread?: any;
  message?: any;
  cooldownEndsAt?: string;
}

/**
 * Unified application recovery reminder dispatcher supporting:
 * - Portal Message
 * - WhatsApp Nudge
 * - Both (dispatched as two independent operations with isolated success/failure tracking)
 */
export async function sendApplicationRecoveryReminder(
  params: SendApplicationRecoveryReminderParams
): Promise<SendApplicationRecoveryReminderResult> {
  const chosenChannel = params.channel || 'portal';
  const result: SendApplicationRecoveryReminderResult = {
    success: false,
    channels: {},
    lastReminderSentAt: null,
    lastWhatsAppSentAt: null
  };

  if (chosenChannel === 'portal' || chosenChannel === 'both') {
    try {
      const portalRes = await sendCompletionReminder({
        entryId: params.entryId,
        adminUserId: params.adminUserId,
        adminRole: params.adminRole,
        customBody: params.customBody
      });
      result.channels.portal = {
        success: true,
        messageId: portalRes.messageId,
        threadId: portalRes.threadId,
        cooldownEndsAt: portalRes.cooldownEndsAt
      };
      result.messageId = portalRes.messageId;
      result.threadId = portalRes.threadId;
      result.thread = portalRes.thread;
      result.message = portalRes.message;
      result.cooldownEndsAt = portalRes.cooldownEndsAt;
      result.lastReminderSentAt = new Date().toISOString();
    } catch (err: any) {
      result.channels.portal = {
        success: false,
        error: err.message || 'Failed to dispatch portal message'
      };
      if (chosenChannel === 'portal') {
        throw err;
      }
    }
  }

  if (chosenChannel === 'whatsapp' || chosenChannel === 'both') {
    try {
      const waRes = await sendWhatsAppNudge({
        entryId: params.entryId,
        adminUserId: params.adminUserId,
        adminRole: params.adminRole,
        customBody: params.whatsappBody
      });
      result.channels.whatsapp = {
        success: true,
        deliveryLogId: waRes.deliveryLogId,
        providerMessageId: waRes.providerMessageId,
        status: 'sent',
        cooldownEndsAt: waRes.cooldownEndsAt
      };
      result.lastWhatsAppSentAt = new Date().toISOString();
      if (chosenChannel === 'whatsapp') {
        result.cooldownEndsAt = waRes.cooldownEndsAt;
      }
    } catch (err: any) {
      result.channels.whatsapp = {
        success: false,
        error: err.message || 'Failed to dispatch WhatsApp nudge'
      };
      if (chosenChannel === 'whatsapp') {
        throw err;
      }
    }
  }

  if (chosenChannel === 'both') {
    result.success = Boolean(result.channels.portal?.success || result.channels.whatsapp?.success);
    if (!result.success) {
      const combinedError = [
        result.channels.portal?.error && `Portal: ${result.channels.portal.error}`,
        result.channels.whatsapp?.error && `WhatsApp: ${result.channels.whatsapp.error}`
      ].filter(Boolean).join('; ');
      throw new ApplicationReminderError(
        'RECOVERY_DISPATCH_FAILED',
        combinedError || 'Both reminder channels failed to dispatch.',
        500,
        { channels: result.channels }
      );
    }
  } else {
    result.success = true;
  }

  return result;
}
