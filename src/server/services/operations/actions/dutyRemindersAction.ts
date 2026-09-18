import crypto from 'crypto';
import { execute, query, queryOne } from '../../../db';
import { normalizePhoneNumberToE164 } from '../../../utils/phone';
import { sendEmail } from '../../email';
import { sendWebPush } from '../../push';
import { getWhatsAppProvider } from '../../whatsapp';
import { formatNumber, formatPlural } from '../presentation';
import { ToolContext } from '../types';
import { getVolunteersNotReportedForDuty } from '../tools/dutyTools';
import { resolveVolunteerCommunicationChannel } from './communicationResolver';
import { actionTokenManager } from './tokenManager';
import {
  ActionExecutionResult,
  ActionPreview,
  ActionRecipient,
  OperationsActionDefinition,
  StoredConfirmationToken
} from './types';

export const sendDutyRemindersAction: OperationsActionDefinition = {
  actionKey: 'SEND_DUTY_REMINDERS',
  humanLabel: 'Send duty reminders',
  requiredRoles: ['super_admin', 'admin', 'safeguarding_lead', 'team'],

  async preparePreview(context: ToolContext, params?: { locationId?: string; locationName?: string }) {
    const { eventId, actor } = context;

    const event = await queryOne('SELECT title FROM events WHERE id = ?', [eventId]);
    const eventTitle = event?.title || 'Current Event';

    // 1. Fetch missing/no-show volunteers via canonical resolver
    const { totalCount, volunteers: missingRows } = await getVolunteersNotReportedForDuty(eventId, {
      locationId: params?.locationId,
      locationName: params?.locationName
    });

    if (missingRows.length === 0) {
      return {
        answer: 'Everyone assigned to duty has reported for duty. No reminders are needed.',
        preview: undefined
      };
    }

    // 2. Evaluate communication channel eligibility per volunteer using canonical resolver
    const recipients: ActionRecipient[] = [];
    let eligibleCount = 0;
    let ineligibleCount = 0;
    const locationCounts: Record<string, number> = {};
    const recipientChannels: Record<string, string> = {};

    for (const row of missingRows) {
      const locName = row.location_name || row.duty_location || 'Assigned Location';
      locationCounts[locName] = (locationCounts[locName] || 0) + 1;

      const res = await resolveVolunteerCommunicationChannel({
        userId: row.user_id,
        displayName: row.full_name || row.name || 'Volunteer',
        phone: row.phone,
        whatsapp: row.whatsapp,
        whatsappConsentStatus: row.whatsapp_consent_status
      });

      if (res.contactEligible) {
        eligibleCount++;
        recipientChannels[row.user_id] = res.selectedChannel;
      } else {
        ineligibleCount++;
      }

      recipients.push({
        id: row.user_id,
        name: row.full_name || row.name || 'Volunteer',
        locationName: locName,
        responsibility: row.responsibility || row.responsibility_key,
        channel: res.selectedChannel,
        eligible: res.contactEligible,
        ineligibilityReason: res.reasonIfUnavailable,
        phone: res.selectedChannel === 'whatsapp' ? res.destination : undefined,
        email: res.selectedChannel === 'email' ? res.destination : undefined,
        preferredChannel: res.preferredChannel
      });
    }

    // Zero eligible recipients guard (Requirement 12)
    if (eligibleCount === 0) {
      const countStr = formatNumber(missingRows.length);
      const volPhrase = missingRows.length === 1 ? 'assigned volunteer has' : 'assigned volunteers have';
      const followUp = missingRows.length === 1
        ? 'That volunteer does not currently have an available communication channel.'
        : 'Those volunteers do not currently have an available communication channel.';
      return {
        answer: `${countStr} ${volPhrase} not reported for duty. ${followUp}`,
        preview: undefined
      };
    }

    // 3. Location breakdown items
    const items = Object.entries(locationCounts).map(([loc, count]) => ({
      label: loc,
      value: count,
      meta: `${count} missing`
    }));

    // 4. Warnings (Transparent reporting of unavailable channels)
    const warnings: string[] = [];
    if (ineligibleCount > 0) {
      const waIneligible = recipients.filter(r => !r.eligible && (r.channel === 'none' || r.preferredChannel === 'whatsapp')).length;
      if (waIneligible > 0) {
        warnings.push(
          waIneligible === 1
            ? '1 volunteer cannot receive WhatsApp messages.'
            : `${formatNumber(waIneligible)} volunteers cannot receive WhatsApp messages.`
        );
      } else {
        warnings.push(
          ineligibleCount === 1
            ? '1 volunteer cannot receive reminders on available channels.'
            : `${formatNumber(ineligibleCount)} volunteers cannot receive reminders on available channels.`
        );
      }
    }

    // 5. Generate confirmation token bound to targets and resolved channels
    const targetUserIds = missingRows.map((r: any) => r.user_id);
    const eligibleUserIds = recipients.filter(r => r.eligible).map(r => r.id);

    const token = actionTokenManager.createToken({
      actor,
      actionKey: 'SEND_DUTY_REMINDERS',
      eventId,
      resolvedTargets: {
        allTargetUserIds: targetUserIds,
        eligibleUserIds,
        recipientChannels,
        locationCounts
      },
      parameters: params
    });

    const answer = `${formatNumber(missingRows.length)} assigned volunteer${missingRows.length === 1 ? ' has' : 's have'} not reported for duty.`;

    const confirmLabel = eligibleCount === 1 ? 'Send reminder' : `Send ${formatNumber(eligibleCount)} reminders`;

    const preview: ActionPreview = {
      actionKey: 'SEND_DUTY_REMINDERS',
      title: 'Send duty reminders',
      description: `Send reminders to ${formatNumber(eligibleCount)} eligible volunteer${eligibleCount === 1 ? '' : 's'}.`,
      affectedCount: eligibleCount,
      totalTargetsCount: missingRows.length,
      unavailableCount: ineligibleCount,
      recipients: recipients.slice(0, 20),
      items,
      warnings,
      confirmLabel,
      cancelLabel: 'Cancel',
      confirmationToken: token.id,
      expiresAt: token.expiresAt
    };

    return { answer, preview };
  },

  async revalidate(token: StoredConfirmationToken, context: ToolContext) {
    const { eventId } = context;
    const targets: string[] = token.resolvedTargets?.allTargetUserIds || [];

    if (targets.length === 0) {
      return { valid: true };
    }

    // Check if any previously missing volunteer has reported for duty
    const placeholders = targets.map(() => '?').join(',');
    const reportedNow = await query(`
      SELECT DISTINCT user_id 
      FROM event_duty_location_presence 
      WHERE event_id = ? AND ended_at IS NULL AND user_id IN (${placeholders})
    `, [eventId, ...targets]);

    if (reportedNow.length > 0) {
      return {
        valid: false,
        reason: 'The duty status changed. Review the updated recipients before sending.'
      };
    }

    // Revalidate communication eligibility for targets
    const prevChannels: Record<string, string> = token.resolvedTargets?.recipientChannels || {};
    const eligibleIds: string[] = token.resolvedTargets?.eligibleUserIds || [];

    for (const uId of eligibleIds) {
      const vol = await queryOne(`
        SELECT full_name, phone, whatsapp, whatsapp_consent_status
        FROM volunteer_profiles WHERE user_id = ?
      `, [uId]);

      if (vol) {
        const res = await resolveVolunteerCommunicationChannel({
          userId: uId,
          displayName: vol.full_name,
          phone: vol.phone,
          whatsapp: vol.whatsapp,
          whatsappConsentStatus: vol.whatsapp_consent_status
        });

        if (!res.contactEligible || (prevChannels[uId] && res.selectedChannel !== prevChannels[uId])) {
          return {
            valid: false,
            reason: 'The volunteer communication preferences changed. Review the updated action before sending.'
          };
        }
      }
    }

    return { valid: true };
  },

  async execute(token: StoredConfirmationToken, context: ToolContext): Promise<ActionExecutionResult> {
    const { eventId, actor } = context;
    const eligibleUserIds: string[] = token.resolvedTargets?.eligibleUserIds || [];
    const targetChannels: Record<string, string> = token.resolvedTargets?.recipientChannels || {};

    const event = await queryOne('SELECT title FROM events WHERE id = ?', [eventId]);
    const eventTitle = event?.title || 'Current Event';
    const waProvider = getWhatsAppProvider();
    const nowIso = new Date().toISOString();

    let sentCount = 0;
    const sentByChannel: Record<string, number> = {};
    const nowTimeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    for (const userId of eligibleUserIds) {
      try {
        const vol = await queryOne(`
          SELECT 
            vp.full_name,
            vp.phone,
            vp.whatsapp,
            u.email,
            COALESCE(el.name, 'your assigned location') as location_name
          FROM event_duty_assignments eda
          LEFT JOIN event_locations el ON eda.assigned_location_id = el.id
          JOIN volunteer_profiles vp ON eda.user_id = vp.user_id
          LEFT JOIN users u ON u.id = eda.user_id
          WHERE eda.event_id = ? AND eda.user_id = ? AND eda.status NOT IN ('cancelled', 'ended')
          LIMIT 1
        `, [eventId, userId]);

        if (!vol) continue;

        const rawFirst = (vol.full_name || '').trim().split(/\s+/)[0] || 'Volunteer';
        const locName = vol.location_name || 'your assigned location';
        const messageBody = `Hi ${rawFirst}, this is a reminder for your assigned duty at ${locName} for "${eventTitle}". Please check in with your team coordinator or scan in upon arrival.`;

        const channel = targetChannels[userId] || 'whatsapp';

        if (channel === 'whatsapp') {
          const rawPhone = vol.whatsapp || vol.phone;
          const normalized = normalizePhoneNumberToE164(rawPhone);
          if (!normalized) continue;

          await waProvider.sendSessionMessage({
            to: normalized,
            body: messageBody
          });

          sentByChannel.whatsapp = (sentByChannel.whatsapp || 0) + 1;
        } else if (channel === 'email') {
          const toEmail = (vol.email || '').trim();
          if (!toEmail) continue;

          await sendEmail({
            to: toEmail,
            subject: `Duty Reminder: ${eventTitle}`,
            text: messageBody
          });

          sentByChannel.email = (sentByChannel.email || 0) + 1;
        } else if (channel === 'push') {
          await sendWebPush(userId, {
            title: 'Duty Reminder',
            body: messageBody
          });

          sentByChannel.push = (sentByChannel.push || 0) + 1;
        } else {
          continue;
        }

        // Enqueue / log in notification_jobs for traceability
        const idempotencyKey = `duty_reminder:${eventId}:${userId}:${token.id}`;
        const jobId = `job-${crypto.randomUUID()}`;
        try {
          await execute(`
            INSERT INTO notification_jobs (
              id, event_id, user_id, channel, status, idempotency_key, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?)
          `, [jobId, eventId, userId, channel, idempotencyKey, nowIso, nowIso]);
        } catch (_) {
          // Idempotency constraint gracefully handles duplicates
        }

        sentCount++;
      } catch (sendErr) {
        console.error(`[DutyRemindersAction] Error sending to user ${userId}:`, sendErr);
      }
    }

    // Centralized Audit Log
    const auditId = `audit-${crypto.randomUUID()}`;
    const userRole = actor.role || 'admin';
    const roleLabel = userRole === 'super_admin' ? 'Super Admin' : 'Admin';
    const safeSummary = `${roleLabel} sent duty reminders to ${sentCount} volunteer${sentCount === 1 ? '' : 's'}.`;

    try {
      await execute(`
        INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
        VALUES (?, ?, ?, 'SEND_DUTY_REMINDERS', 'volunteers', ?, ?, ?)
      `, [auditId, actor.id, userRole, eventId, JSON.stringify({ eventId, sentCount, sentByChannel, summary: safeSummary }), nowIso]);
    } catch (auditErr) {
      console.error('[DutyRemindersAction] Failed to record audit log:', auditErr);
    }

    let message = `${formatNumber(sentCount)} volunteer${sentCount === 1 ? ' was' : 's were'} contacted.`;
    const channelParts: string[] = [];
    if (sentByChannel.whatsapp) channelParts.push(`${sentByChannel.whatsapp} via WhatsApp`);
    if (sentByChannel.email) channelParts.push(`${sentByChannel.email} via Email`);
    if (sentByChannel.push) channelParts.push(`${sentByChannel.push} via Push`);
    if (channelParts.length > 1) {
      message += ` (${channelParts.join(' • ')})`;
    }

    return {
      success: true,
      actionKey: 'SEND_DUTY_REMINDERS',
      title: 'Reminders sent',
      message,
      affectedCount: sentCount,
      channelBreakdown: sentByChannel,
      deepLink: { label: 'Open Event Duty', route: '/admin/operations', tab: 'operations' },
      updatedAt: nowTimeStr
    };
  }
};
