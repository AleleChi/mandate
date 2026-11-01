import { query, queryOne, execute } from '../../db';
import { evaluateWhatsAppEligibility } from './consent';
import { extractFirstName, buildMergeInfo } from './personalization';
import { logWhatsAppDelivery } from './worker';
import { sendWhatsApp } from '../notifications';

export interface AttendanceNotificationResult {
  sent: boolean;
  reason?: string;
  messageId?: string;
}

/**
 * Formats a timestamp into clean local time (e.g. "9:15 AM").
 */
function formatNotificationTime(isoOrDateStr?: string | null): string {
  if (!isoOrDateStr) {
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  try {
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) {
      return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch (_) {
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  }
}

/**
 * Dispatches an automated WhatsApp confirmation to the parent after
 * a child has been successfully checked in.
 *
 * Enforces:
 * - Parent WhatsApp opt-in consent
 * - Valid phone number
 * - Idempotency per child + event + 'child_checked_in'
 * - Fail-safe non-blocking execution (never throws or breaks attendance)
 */
export async function dispatchCheckInWhatsAppNotification(params: {
  childEventEntryId: string;
  eventId?: string | null;
  checkInTime?: string;
}): Promise<AttendanceNotificationResult> {
  try {
    const { childEventEntryId } = params;
    if (!childEventEntryId) {
      return { sent: false, reason: 'Missing childEventEntryId' };
    }

    const entry = await queryOne<any>(`
      SELECT e.*, c.id as canonical_child_id, c.full_name as child_name,
             p.id as parent_id, p.full_name as parent_name, p.phone_number as parent_phone,
             p.whatsapp_number as parent_whatsapp, p.whatsapp_consent_status, p.preferred_contact
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
      WHERE e.id = ?
    `, [childEventEntryId]);

    if (!entry) {
      return { sent: false, reason: 'Child event entry not found' };
    }

    if (!entry.parent_id) {
      return { sent: false, reason: 'Parent profile not linked to child' };
    }

    const eventId = params.eventId || entry.event_id || 'current';

    // Idempotency check: only send one check-in confirmation per child entry + event
    const idempotencyKey = `wa:checkin:${eventId}:${childEventEntryId}`;

    const existingLog = await queryOne<any>(`
      SELECT id, status FROM whatsapp_delivery_logs
      WHERE child_event_entry_id = ? 
        AND (template_name = 'koinonia_child_checked_in' OR error_code = ? OR provider_message_id = ?)
        AND status IN ('queued', 'sent', 'delivered', 'read')
    `, [childEventEntryId, idempotencyKey, idempotencyKey]);

    if (existingLog) {
      return { sent: false, reason: 'Check-in confirmation already sent' };
    }

    // Check parent WhatsApp consent & eligibility
    const parentConsent = {
      id: entry.parent_id,
      phone_number: entry.parent_phone,
      whatsapp_number: entry.parent_whatsapp,
      whatsapp_consent_status: entry.whatsapp_consent_status,
      preferred_contact: entry.preferred_contact
    };

    const eligibility = evaluateWhatsAppEligibility(parentConsent);
    if (!eligibility.eligible || !eligibility.normalizedNumber) {
      return { sent: false, reason: eligibility.reason || 'Parent not eligible for WhatsApp' };
    }

    // Personalization
    const parentFirstName = extractFirstName(entry.parent_name) || 'Parent';
    const childFirstName = extractFirstName(entry.child_name) || 'Child';
    const checkinTimeStr = formatNotificationTime(params.checkInTime || entry.checked_in_at);

    const mergeInfo = buildMergeInfo({
      parentFirstName,
      childFirstName,
      customMergeInfo: {
        checkin_time: checkinTimeStr,
        check_in_time: checkinTimeStr
      }
    });

    const fallbackBody = `Hi ${parentFirstName}, ${childFirstName} has been checked in successfully for the Koinonia General Assembly Children's Session.\n\nCheck-in time: ${checkinTimeStr}.\n\nWe will continue to keep you updated during the session.`;

    const result = await sendWhatsApp(
      eligibility.normalizedNumber,
      fallbackBody,
      {
        intent: 'child_checked_in',
        mergeInfo,
        idempotencyKey,
        parentFirstName,
        childFirstName
      }
    );

    // Record delivery attempt in audit log
    await logWhatsAppDelivery({
      childEventEntryId,
      parentProfileId: entry.parent_id,
      recipientPhone: eligibility.normalizedNumber,
      provider: process.env.WHATSAPP_PROVIDER || 'zoho',
      providerMessageId: result.messageSid || idempotencyKey,
      templateName: 'koinonia_child_checked_in',
      status: result.success ? 'sent' : 'failed',
      errorCode: result.success ? idempotencyKey : (result.error || 'SEND_FAILED'),
      errorMessage: result.error,
      sentAt: result.success ? new Date().toISOString() : null,
      failedAt: !result.success ? new Date().toISOString() : null
    }).catch(err => console.error('[dispatchCheckInWhatsAppNotification] log failure:', err));

    return {
      sent: result.success,
      messageId: result.messageSid,
      reason: result.error
    };
  } catch (err: any) {
    console.error('[dispatchCheckInWhatsAppNotification] error:', err);
    return { sent: false, reason: err?.message || 'Check-in notification error' };
  }
}

/**
 * Dispatches an automated WhatsApp confirmation to the parent after
 * a child has been successfully picked up / checked out.
 *
 * Enforces:
 * - Parent WhatsApp opt-in consent
 * - Valid phone number
 * - Idempotency per child + event + 'child_picked_up'
 * - Fail-safe non-blocking execution (never throws or breaks attendance)
 */
export async function dispatchPickupWhatsAppNotification(params: {
  childEventEntryId: string;
  eventId?: string | null;
  pickupTime?: string;
  pickupPersonName?: string | null;
}): Promise<AttendanceNotificationResult> {
  try {
    const { childEventEntryId } = params;
    if (!childEventEntryId) {
      return { sent: false, reason: 'Missing childEventEntryId' };
    }

    const entry = await queryOne<any>(`
      SELECT e.*, c.id as canonical_child_id, c.full_name as child_name,
             p.id as parent_id, p.full_name as parent_name, p.phone_number as parent_phone,
             p.whatsapp_number as parent_whatsapp, p.whatsapp_consent_status, p.preferred_contact
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
      WHERE e.id = ?
    `, [childEventEntryId]);

    if (!entry) {
      return { sent: false, reason: 'Child event entry not found' };
    }

    if (!entry.parent_id) {
      return { sent: false, reason: 'Parent profile not linked to child' };
    }

    const eventId = params.eventId || entry.event_id || 'current';

    // Idempotency check: only send one pickup confirmation per child entry + event
    const idempotencyKey = `wa:pickup:${eventId}:${childEventEntryId}`;

    const existingLog = await queryOne<any>(`
      SELECT id, status FROM whatsapp_delivery_logs
      WHERE child_event_entry_id = ? 
        AND (template_name = 'koinonia_child_picked_up' OR error_code = ? OR provider_message_id = ?)
        AND status IN ('queued', 'sent', 'delivered', 'read')
    `, [childEventEntryId, idempotencyKey, idempotencyKey]);

    if (existingLog) {
      return { sent: false, reason: 'Pickup confirmation already sent' };
    }

    // Check parent WhatsApp consent & eligibility
    const parentConsent = {
      id: entry.parent_id,
      phone_number: entry.parent_phone,
      whatsapp_number: entry.parent_whatsapp,
      whatsapp_consent_status: entry.whatsapp_consent_status,
      preferred_contact: entry.preferred_contact
    };

    const eligibility = evaluateWhatsAppEligibility(parentConsent);
    if (!eligibility.eligible || !eligibility.normalizedNumber) {
      return { sent: false, reason: eligibility.reason || 'Parent not eligible for WhatsApp' };
    }

    // Personalization
    const parentFirstName = extractFirstName(entry.parent_name) || 'Parent';
    const childFirstName = extractFirstName(entry.child_name) || 'Child';
    const pickupTimeStr = formatNotificationTime(params.pickupTime || entry.picked_up_at);

    let pickupPersonFirst = '';
    if (params.pickupPersonName) {
      pickupPersonFirst = extractFirstName(params.pickupPersonName);
    } else if (entry.pickup_person_id) {
      const pRow = await queryOne<any>('SELECT full_name FROM pickup_people WHERE id = ?', [entry.pickup_person_id]);
      if (pRow?.full_name) {
        pickupPersonFirst = extractFirstName(pRow.full_name);
      }
    }

    const customMerge: Record<string, string> = {
      pickup_time: pickupTimeStr,
      pick_up_time: pickupTimeStr
    };
    if (pickupPersonFirst) {
      customMerge.pickup_person_name = pickupPersonFirst;
      customMerge.pickup_by = pickupPersonFirst;
    }

    const mergeInfo = buildMergeInfo({
      parentFirstName,
      childFirstName,
      customMergeInfo: customMerge
    });

    let fallbackBody = `Hi ${parentFirstName}, ${childFirstName} has been successfully checked out from the Koinonia General Assembly Children's Session.\n\nPickup time: ${pickupTimeStr}.\n\nThank you.`;
    if (pickupPersonFirst) {
      fallbackBody = `Hi ${parentFirstName}, ${childFirstName} was successfully picked up by ${pickupPersonFirst} at ${pickupTimeStr}.\n\nThank you.`;
    }

    const result = await sendWhatsApp(
      eligibility.normalizedNumber,
      fallbackBody,
      {
        intent: 'child_picked_up',
        mergeInfo,
        idempotencyKey,
        parentFirstName,
        childFirstName
      }
    );

    // Record delivery attempt in audit log
    await logWhatsAppDelivery({
      childEventEntryId,
      parentProfileId: entry.parent_id,
      recipientPhone: eligibility.normalizedNumber,
      provider: process.env.WHATSAPP_PROVIDER || 'zoho',
      providerMessageId: result.messageSid || idempotencyKey,
      templateName: 'koinonia_child_picked_up',
      status: result.success ? 'sent' : 'failed',
      errorCode: result.success ? idempotencyKey : (result.error || 'SEND_FAILED'),
      errorMessage: result.error,
      sentAt: result.success ? new Date().toISOString() : null,
      failedAt: !result.success ? new Date().toISOString() : null
    }).catch(err => console.error('[dispatchPickupWhatsAppNotification] log failure:', err));

    return {
      sent: result.success,
      messageId: result.messageSid,
      reason: result.error
    };
  } catch (err: any) {
    console.error('[dispatchPickupWhatsAppNotification] error:', err);
    return { sent: false, reason: err?.message || 'Pickup notification error' };
  }
}
