import crypto from 'crypto';
import { query, queryOne, execute } from '../db';
import { sendEmail } from './email';
import { extractFirstName } from './whatsapp/personalization';
import { getCurrentEventId } from './eventService';
import { buildPublicAppUrl } from '../utils/urlHelper';

export interface AutomaticEmailResult {
  sent: boolean;
  messageId?: string;
  reason?: string;
}

/**
 * Formats an ISO string or Date into Nigerian date (e.g. "November 21, 2026")
 * strictly using the Africa/Lagos (WAT, UTC+1) timezone.
 */
export function formatNigerianDate(isoOrDateStr?: string | Date | null): string {
  if (!isoOrDateStr) {
    isoOrDateStr = new Date();
  }
  const d = typeof isoOrDateStr === 'string' ? new Date(isoOrDateStr) : isoOrDateStr;
  if (isNaN(d.getTime())) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Lagos',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date());
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Lagos',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(d);
}

/**
 * Formats an ISO string or Date into Nigerian time (e.g. "10:15 AM")
 * strictly using the Africa/Lagos (WAT, UTC+1) timezone.
 */
export function formatNigerianTime(isoOrDateStr?: string | Date | null): string {
  if (!isoOrDateStr) {
    isoOrDateStr = new Date();
  }
  const d = typeof isoOrDateStr === 'string' ? new Date(isoOrDateStr) : isoOrDateStr;
  if (isNaN(d.getTime())) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Lagos',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date());
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Lagos',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(d);
}

/**
 * Wraps content in the official Koinonia branded responsive email layout.
 */
export function wrapNotificationHtml(options: {
  title: string;
  bodyHtml: string;
  actionButton?: { label: string; url: string };
}): string {
  const buttonHtml = options.actionButton ? `
    <div style="margin: 28px 0; text-align: center;">
      <a href="${options.actionButton.url}" style="background-color: #C59B27; color: #18181B; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; font-size: 15px;">
        ${options.actionButton.label}
      </a>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FAF8F4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181B; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #FAF8F4; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #FFFFFF; border: 1px solid #EAE8E1; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <!-- Top Accent Bar (Antique Gold) -->
          <tr>
            <td style="background-color: #C59B27; height: 3px; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px 16px 32px; border-bottom: 1px solid #FAF8F4;">
              <h1 style="margin: 0; font-size: 18px; font-weight: 600; color: #18181B; letter-spacing: -0.01em;">
                Koinonia Children &amp; Teens
              </h1>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 28px 32px; font-size: 15px; line-height: 1.6; color: #27272A;">
              ${options.bodyHtml}
              ${buttonHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #FAFAFA; border-top: 1px solid #EAE8E1; font-size: 12px; color: #71717A; text-align: center;">
              Koinonia Children &amp; Teens &bull; The General Assembly 2026
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Dispatches an automated Check-In confirmation email to the child's registered parent.
 *
 * Requirements:
 * - Triggered ONLY after check-in has genuinely succeeded
 * - Uses saved checked_in_at timestamp
 * - Formats exact check-in date & time in WAT (Africa/Lagos)
 * - Safe & non-blocking: never fails volunteer check-in if Resend is temporarily unavailable
 * - Deduplicated: idempotent per childEventEntryId + event + 'check_in'
 */
export async function dispatchCheckInEmailNotification(params: {
  childEventEntryId: string;
  eventId?: string | null;
  checkInTime?: string | null;
}): Promise<AutomaticEmailResult> {
  try {
    const { childEventEntryId } = params;
    if (!childEventEntryId) {
      return { sent: false, reason: 'Missing childEventEntryId' };
    }

    const entry = await queryOne<any>(`
      SELECT e.*, c.id as child_id, c.full_name as child_name,
             p.id as parent_id, p.full_name as parent_name,
             COALESCE(p.email, u.email) as parent_email,
             COALESCE(ev.title, 'The General Assembly 2026') as event_title
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN events ev ON ev.id = e.event_id
      WHERE e.id = ?
    `, [childEventEntryId]);

    if (!entry) {
      return { sent: false, reason: 'Child event entry not found' };
    }

    if (!entry.checked_in_at && !params.checkInTime) {
      return { sent: false, reason: 'Child has not been checked in' };
    }

    const parentEmail = (entry.parent_email || '').trim().toLowerCase();
    if (!parentEmail || !parentEmail.includes('@')) {
      return { sent: false, reason: 'Parent registered email address not found' };
    }

    const eventId = params.eventId || entry.event_id || (await getCurrentEventId()) || 'event-ga-2026';
    const idempotencyKey = `email:checkin:${eventId}:${childEventEntryId}`;

    // Deduplication check: check if already queued, sent, or delivered
    const existingLog = await queryOne<any>(`
      SELECT id, status, provider_message_id FROM email_delivery_logs
      WHERE (idempotency_key = ? OR (child_event_entry_id = ? AND notification_type = 'check_in'))
        AND status IN ('queued', 'sending', 'sent', 'delivered')
    `, [idempotencyKey, childEventEntryId]);

    if (existingLog) {
      return { sent: false, reason: 'Check-in confirmation email already sent or queued' };
    }

    const parentFirstName = extractFirstName(entry.parent_name) || 'Parent';
    const childFullName = entry.child_name || 'Your child';
    const effectiveCheckInTime = params.checkInTime || entry.checked_in_at;
    const checkInDate = formatNigerianDate(effectiveCheckInTime);
    const checkInTime = formatNigerianTime(effectiveCheckInTime);

    const subject = 'Check-In Confirmation – The General Assembly 2026';

    const textBody = `Hello ${parentFirstName},

This is to confirm that ${childFullName} has been successfully checked in for the Children & Teens session of The General Assembly 2026.

Date: ${checkInDate}
Check-in Time: ${checkInTime} WAT

Thank you for entrusting your child to our care.

Koinonia Children & Teens Team`;

    const innerHtml = `
      <p style="margin-top: 0;">Hello ${parentFirstName},</p>
      <p>This is to confirm that <strong>${childFullName}</strong> has been successfully checked in for the Children &amp; Teens session of The General Assembly 2026.</p>
      <table style="margin: 20px 0; border-collapse: collapse; width: 100%; background-color: #F9F9F8; border-radius: 6px; border: 1px solid #EAE8E1;">
        <tr>
          <td style="padding: 10px 14px; font-size: 14px; color: #52525B; width: 130px;"><strong>Date:</strong></td>
          <td style="padding: 10px 14px; font-size: 14px; color: #18181B;">${checkInDate}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-size: 14px; color: #52525B;"><strong>Check-in Time:</strong></td>
          <td style="padding: 10px 14px; font-size: 14px; color: #18181B;"><strong>${checkInTime} WAT</strong></td>
        </tr>
      </table>
      <p>Thank you for entrusting your child to our care.</p>
      <p style="margin-bottom: 0;">Koinonia Children &amp; Teens Team</p>
    `;

    const htmlBody = wrapNotificationHtml({
      title: subject,
      bodyHtml: innerHtml
    });

    const logId = `edl-chk-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Persist intended notification first
    try {
      await execute(`
        INSERT INTO email_delivery_logs (
          id, notification_type, child_event_entry_id, child_id, event_id,
          parent_profile_id, user_id, recipient_email, subject, body,
          status, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)
      `, [
        logId,
        'check_in',
        childEventEntryId,
        entry.child_id,
        eventId,
        entry.parent_id || null,
        entry.user_id || null,
        parentEmail,
        subject,
        textBody,
        idempotencyKey,
        now,
        now
      ]);
    } catch (insertErr: any) {
      if (insertErr?.code === '23505' || insertErr?.message?.includes('UNIQUE') || insertErr?.message?.includes('unique')) {
        return { sent: false, reason: 'Check-in email already recorded by concurrent process' };
      }
      throw insertErr;
    }

    // Attempt delivery via Resend
    try {
      await execute(`UPDATE email_delivery_logs SET status = 'sending', updated_at = ? WHERE id = ?`, [new Date().toISOString(), logId]);

      const result = await sendEmail({
        to: parentEmail,
        subject,
        html: htmlBody,
        text: textBody,
        idempotencyKey
      });

      if (result.success) {
        const sentNow = new Date().toISOString();
        await execute(`
          UPDATE email_delivery_logs
          SET status = 'sent', provider = 'resend', provider_message_id = ?, sent_at = ?, updated_at = ?
          WHERE id = ?
        `, [result.id || null, sentNow, sentNow, logId]);
        return { sent: true, messageId: result.id };
      } else {
        const failedNow = new Date().toISOString();
        await execute(`
          UPDATE email_delivery_logs
          SET status = 'failed', provider = 'resend', error_message = ?, failed_at = ?, updated_at = ?
          WHERE id = ?
        `, [result.error || 'Resend rejected email', failedNow, failedNow, logId]);
        return { sent: false, reason: result.error };
      }
    } catch (sendErr: any) {
      const failedNow = new Date().toISOString();
      await execute(`
        UPDATE email_delivery_logs
        SET status = 'failed', provider = 'resend', error_message = ?, failed_at = ?, updated_at = ?
        WHERE id = ?
      `, [sendErr?.message || 'Email delivery exception', failedNow, failedNow, logId]).catch(() => {});
      return { sent: false, reason: sendErr?.message || 'Email delivery exception' };
    }
  } catch (err: any) {
    console.error('[dispatchCheckInEmailNotification] error:', err);
    return { sent: false, reason: err?.message || 'Internal check-in email dispatch error' };
  }
}

/**
 * Dispatches an automated Checkout / Pickup confirmation email to the child's registered parent.
 *
 * Requirements:
 * - Triggered ONLY after checkout / pickup has genuinely succeeded
 * - Uses actual picked_up_at timestamp
 * - Formats exact checkout date & time in WAT (Africa/Lagos)
 * - Safe & non-blocking: never fails volunteer checkout if Resend is temporarily unavailable
 * - Deduplicated: idempotent per childEventEntryId + event + 'checkout'
 */
export async function dispatchPickupEmailNotification(params: {
  childEventEntryId: string;
  eventId?: string | null;
  pickupTime?: string | null;
  pickupPersonName?: string | null;
}): Promise<AutomaticEmailResult> {
  try {
    const { childEventEntryId } = params;
    if (!childEventEntryId) {
      return { sent: false, reason: 'Missing childEventEntryId' };
    }

    const entry = await queryOne<any>(`
      SELECT e.*, c.id as child_id, c.full_name as child_name,
             p.id as parent_id, p.full_name as parent_name,
             COALESCE(p.email, u.email) as parent_email,
             COALESCE(ev.title, 'The General Assembly 2026') as event_title
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN events ev ON ev.id = e.event_id
      WHERE e.id = ?
    `, [childEventEntryId]);

    if (!entry) {
      return { sent: false, reason: 'Child event entry not found' };
    }

    if (!entry.picked_up_at && !params.pickupTime) {
      return { sent: false, reason: 'Child has not been picked up or checked out' };
    }

    const parentEmail = (entry.parent_email || '').trim().toLowerCase();
    if (!parentEmail || !parentEmail.includes('@')) {
      return { sent: false, reason: 'Parent registered email address not found' };
    }

    const eventId = params.eventId || entry.event_id || (await getCurrentEventId()) || 'event-ga-2026';
    const idempotencyKey = `email:checkout:${eventId}:${childEventEntryId}`;

    // Deduplication check: check if already queued, sent, or delivered
    const existingLog = await queryOne<any>(`
      SELECT id, status, provider_message_id FROM email_delivery_logs
      WHERE (idempotency_key = ? OR (child_event_entry_id = ? AND notification_type = 'check_out'))
        AND status IN ('queued', 'sending', 'sent', 'delivered')
    `, [idempotencyKey, childEventEntryId]);

    if (existingLog) {
      return { sent: false, reason: 'Checkout confirmation email already sent or queued' };
    }

    const parentFirstName = extractFirstName(entry.parent_name) || 'Parent';
    const childFullName = entry.child_name || 'Your child';
    const effectivePickupTime = params.pickupTime || entry.picked_up_at;
    const checkoutDate = formatNigerianDate(effectivePickupTime);
    const checkoutTime = formatNigerianTime(effectivePickupTime);

    const subject = 'Checkout Confirmation – The General Assembly 2026';

    const textBody = `Hello ${parentFirstName},

This is to confirm that ${childFullName} has been successfully checked out of the Children & Teens session of The General Assembly 2026.

Date: ${checkoutDate}
Checkout Time: ${checkoutTime} WAT

Your child has been released to an approved pickup person.

Koinonia Children & Teens Team`;

    const innerHtml = `
      <p style="margin-top: 0;">Hello ${parentFirstName},</p>
      <p>This is to confirm that <strong>${childFullName}</strong> has been successfully checked out of the Children &amp; Teens session of The General Assembly 2026.</p>
      <table style="margin: 20px 0; border-collapse: collapse; width: 100%; background-color: #F9F9F8; border-radius: 6px; border: 1px solid #EAE8E1;">
        <tr>
          <td style="padding: 10px 14px; font-size: 14px; color: #52525B; width: 130px;"><strong>Date:</strong></td>
          <td style="padding: 10px 14px; font-size: 14px; color: #18181B;">${checkoutDate}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-size: 14px; color: #52525B;"><strong>Checkout Time:</strong></td>
          <td style="padding: 10px 14px; font-size: 14px; color: #18181B;"><strong>${checkoutTime} WAT</strong></td>
        </tr>
      </table>
      <p>Your child has been released to an approved pickup person.</p>
      <p style="margin-bottom: 0;">Koinonia Children &amp; Teens Team</p>
    `;

    const htmlBody = wrapNotificationHtml({
      title: subject,
      bodyHtml: innerHtml
    });

    const logId = `edl-pku-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Persist intended notification first
    try {
      await execute(`
        INSERT INTO email_delivery_logs (
          id, notification_type, child_event_entry_id, child_id, event_id,
          parent_profile_id, user_id, recipient_email, subject, body,
          status, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)
      `, [
        logId,
        'check_out',
        childEventEntryId,
        entry.child_id,
        eventId,
        entry.parent_id || null,
        entry.user_id || null,
        parentEmail,
        subject,
        textBody,
        idempotencyKey,
        now,
        now
      ]);
    } catch (insertErr: any) {
      if (insertErr?.code === '23505' || insertErr?.message?.includes('UNIQUE') || insertErr?.message?.includes('unique')) {
        return { sent: false, reason: 'Checkout email already recorded by concurrent process' };
      }
      throw insertErr;
    }

    // Attempt delivery via Resend
    try {
      await execute(`UPDATE email_delivery_logs SET status = 'sending', updated_at = ? WHERE id = ?`, [new Date().toISOString(), logId]);

      const result = await sendEmail({
        to: parentEmail,
        subject,
        html: htmlBody,
        text: textBody,
        idempotencyKey
      });

      if (result.success) {
        const sentNow = new Date().toISOString();
        await execute(`
          UPDATE email_delivery_logs
          SET status = 'sent', provider = 'resend', provider_message_id = ?, sent_at = ?, updated_at = ?
          WHERE id = ?
        `, [result.id || null, sentNow, sentNow, logId]);
        return { sent: true, messageId: result.id };
      } else {
        const failedNow = new Date().toISOString();
        await execute(`
          UPDATE email_delivery_logs
          SET status = 'failed', provider = 'resend', error_message = ?, failed_at = ?, updated_at = ?
          WHERE id = ?
        `, [result.error || 'Resend rejected email', failedNow, failedNow, logId]);
        return { sent: false, reason: result.error };
      }
    } catch (sendErr: any) {
      const failedNow = new Date().toISOString();
      await execute(`
        UPDATE email_delivery_logs
        SET status = 'failed', provider = 'resend', error_message = ?, failed_at = ?, updated_at = ?
        WHERE id = ?
      `, [sendErr?.message || 'Email delivery exception', failedNow, failedNow, logId]).catch(() => {});
      return { sent: false, reason: sendErr?.message || 'Email delivery exception' };
    }
  } catch (err: any) {
    console.error('[dispatchPickupEmailNotification] error:', err);
    return { sent: false, reason: err?.message || 'Internal checkout email dispatch error' };
  }
}

/**
 * Dispatches an automated Pass-Revocation email to the child's registered parent.
 *
 * Requirements:
 * - Triggered whenever an active pass is successfully revoked by an authorized admin action
 * - Formats exact revocation date & time in WAT (Africa/Lagos)
 * - Includes link to Children & Teens Portal
 * - Safe & non-blocking: never fails pass revocation if Resend is temporarily unavailable
 * - Deduplicated: idempotent per childEventEntryId + passId + 'pass_revoked'
 */
export async function dispatchPassRevokedEmailNotification(params: {
  childEventEntryId: string;
  eventId?: string | null;
  revocationTime?: string | null;
  passId?: string | null;
  reason?: string | null;
}): Promise<AutomaticEmailResult> {
  try {
    const { childEventEntryId } = params;
    if (!childEventEntryId) {
      return { sent: false, reason: 'Missing childEventEntryId' };
    }

    const entry = await queryOne<any>(`
      SELECT e.*, c.id as child_id, c.full_name as child_name,
             p.id as parent_id, p.full_name as parent_name,
             COALESCE(p.email, u.email) as parent_email,
             COALESCE(ev.title, 'The General Assembly 2026') as event_title
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN events ev ON ev.id = e.event_id
      WHERE e.id = ?
    `, [childEventEntryId]);

    if (!entry) {
      return { sent: false, reason: 'Child event entry not found' };
    }

    const parentEmail = (entry.parent_email || '').trim().toLowerCase();
    if (!parentEmail || !parentEmail.includes('@')) {
      return { sent: false, reason: 'Parent registered email address not found' };
    }

    const eventId = params.eventId || entry.event_id || (await getCurrentEventId()) || 'event-ga-2026';
    const passIdentifier = params.passId || 'active';
    const idempotencyKey = `email:pass_revoked:${eventId}:${childEventEntryId}:${passIdentifier}`;

    // Deduplication check: check if already queued, sent, or delivered for this pass
    const existingLog = await queryOne<any>(`
      SELECT id, status, provider_message_id FROM email_delivery_logs
      WHERE (idempotency_key = ? OR (child_event_entry_id = ? AND notification_type = 'pass_revoked' AND idempotency_key = ?))
        AND status IN ('queued', 'sending', 'sent', 'delivered')
    `, [idempotencyKey, childEventEntryId, idempotencyKey]);

    if (existingLog) {
      return { sent: false, reason: 'Pass revocation email already sent or queued' };
    }

    const parentFirstName = extractFirstName(entry.parent_name) || 'Parent';
    const childFullName = entry.child_name || 'Your child';
    const effectiveRevocationTime = params.revocationTime || new Date().toISOString();
    const revocationDate = formatNigerianDate(effectiveRevocationTime);
    const revocationTime = formatNigerianTime(effectiveRevocationTime);

    const subject = "Important Update – Your Child's Event Pass";
    const portalUrl = 'https://kgachildren.koinoniageneralassembly.com/';

    const textBody = `Hello ${parentFirstName},

We are writing to inform you that the event pass issued to ${childFullName} for The General Assembly 2026 has been revoked.

Date: ${revocationDate}
Time: ${revocationTime} WAT

The previously issued pass is no longer valid and cannot be used for check-in.

Please log in to the Children & Teens Portal to review your child's current status.

Children & Teens Portal:
${portalUrl}

If you believe this was done in error, please contact the Children & Teens administration team.

Koinonia Children & Teens Team`;

    const innerHtml = `
      <p style="margin-top: 0;">Hello ${parentFirstName},</p>
      <p>We are writing to inform you that the event pass issued to <strong>${childFullName}</strong> for The General Assembly 2026 has been revoked.</p>
      <table style="margin: 20px 0; border-collapse: collapse; width: 100%; background-color: #F9F9F8; border-radius: 6px; border: 1px solid #EAE8E1;">
        <tr>
          <td style="padding: 10px 14px; font-size: 14px; color: #52525B; width: 130px;"><strong>Date:</strong></td>
          <td style="padding: 10px 14px; font-size: 14px; color: #18181B;">${revocationDate}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-size: 14px; color: #52525B;"><strong>Time:</strong></td>
          <td style="padding: 10px 14px; font-size: 14px; color: #18181B;"><strong>${revocationTime} WAT</strong></td>
        </tr>
      </table>
      <p>The previously issued pass is no longer valid and cannot be used for check-in.</p>
      <p>Please log in to the Children &amp; Teens Portal to review your child's current status.</p>
      <p>If you believe this was done in error, please contact the Children &amp; Teens administration team.</p>
      <p style="margin-bottom: 0;">Koinonia Children &amp; Teens Team</p>
    `;

    const htmlBody = wrapNotificationHtml({
      title: subject,
      bodyHtml: innerHtml,
      actionButton: {
        label: 'Open Children & Teens Portal',
        url: portalUrl
      }
    });

    const logId = `edl-rvk-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Persist intended notification first
    try {
      await execute(`
        INSERT INTO email_delivery_logs (
          id, notification_type, child_event_entry_id, child_id, event_id,
          parent_profile_id, user_id, recipient_email, subject, body,
          status, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)
      `, [
        logId,
        'pass_revoked',
        childEventEntryId,
        entry.child_id,
        eventId,
        entry.parent_id || null,
        entry.user_id || null,
        parentEmail,
        subject,
        textBody,
        idempotencyKey,
        now,
        now
      ]);
    } catch (insertErr: any) {
      if (insertErr?.code === '23505' || insertErr?.message?.includes('UNIQUE') || insertErr?.message?.includes('unique')) {
        return { sent: false, reason: 'Pass revocation email already recorded by concurrent process' };
      }
      throw insertErr;
    }

    // Attempt delivery via Resend
    try {
      await execute(`UPDATE email_delivery_logs SET status = 'sending', updated_at = ? WHERE id = ?`, [new Date().toISOString(), logId]);

      const result = await sendEmail({
        to: parentEmail,
        subject,
        html: htmlBody,
        text: textBody,
        idempotencyKey
      });

      if (result.success) {
        const sentNow = new Date().toISOString();
        await execute(`
          UPDATE email_delivery_logs
          SET status = 'sent', provider = 'resend', provider_message_id = ?, sent_at = ?, updated_at = ?
          WHERE id = ?
        `, [result.id || null, sentNow, sentNow, logId]);
        return { sent: true, messageId: result.id };
      } else {
        const failedNow = new Date().toISOString();
        await execute(`
          UPDATE email_delivery_logs
          SET status = 'failed', provider = 'resend', error_message = ?, failed_at = ?, updated_at = ?
          WHERE id = ?
        `, [result.error || 'Resend rejected email', failedNow, failedNow, logId]);
        return { sent: false, reason: result.error };
      }
    } catch (sendErr: any) {
      const failedNow = new Date().toISOString();
      await execute(`
        UPDATE email_delivery_logs
        SET status = 'failed', provider = 'resend', error_message = ?, failed_at = ?, updated_at = ?
        WHERE id = ?
      `, [sendErr?.message || 'Email delivery exception', failedNow, failedNow, logId]).catch(() => {});
      return { sent: false, reason: sendErr?.message || 'Email delivery exception' };
    }
  } catch (err: any) {
    console.error('[dispatchPassRevokedEmailNotification] error:', err);
    return { sent: false, reason: err?.message || 'Internal pass revocation email dispatch error' };
  }
}

/**
 * Resumes and safely delivers any automatic notifications that were interrupted
 * (e.g. during a server restart) or left in 'queued' or 'sending' status.
 */
export async function resumePendingAutomaticEmailNotifications(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  try {
    const pendingLogs = await query<any>(`
      SELECT id, notification_type, recipient_email, subject, body, idempotency_key, status
      FROM email_delivery_logs
      WHERE notification_type IS NOT NULL
        AND status IN ('queued', 'sending')
      ORDER BY created_at ASC
      LIMIT 50
    `);

    if (!pendingLogs || pendingLogs.length === 0) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    console.log(`[AutoEmailRecovery] Found ${pendingLogs.length} pending automatic notifications to resume.`);
    let sentCount = 0;
    let failedCount = 0;

    for (const log of pendingLogs) {
      try {
        await execute(`UPDATE email_delivery_logs SET status = 'sending', updated_at = ? WHERE id = ?`, [new Date().toISOString(), log.id]);

        const result = await sendEmail({
          to: log.recipient_email,
          subject: log.subject,
          text: log.body,
          html: wrapNotificationHtml({
            title: log.subject,
            bodyHtml: `<pre style="font-family: inherit; white-space: pre-wrap; margin: 0;">${log.body}</pre>`
          }),
          idempotencyKey: log.idempotency_key
        });

        if (result.success) {
          const sentNow = new Date().toISOString();
          await execute(`
            UPDATE email_delivery_logs
            SET status = 'sent', provider = 'resend', provider_message_id = ?, sent_at = ?, updated_at = ?
            WHERE id = ?
          `, [result.id || null, sentNow, sentNow, log.id]);
          sentCount++;
        } else {
          const failedNow = new Date().toISOString();
          await execute(`
            UPDATE email_delivery_logs
            SET status = 'failed', provider = 'resend', error_message = ?, failed_at = ?, updated_at = ?
            WHERE id = ?
          `, [result.error || 'Resend rejected resumed email', failedNow, failedNow, log.id]);
          failedCount++;
        }
      } catch (logErr: any) {
        failedCount++;
        console.error(`[AutoEmailRecovery] Failed to deliver log ${log.id}:`, logErr);
      }
    }

    return { processed: pendingLogs.length, sent: sentCount, failed: failedCount };
  } catch (err) {
    console.error('[resumePendingAutomaticEmailNotifications] error:', err);
    return { processed: 0, sent: 0, failed: 0 };
  }
}
