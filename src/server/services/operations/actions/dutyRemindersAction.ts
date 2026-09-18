import crypto from 'crypto';
import { execute, query, queryOne } from '../../../db';
import { normalizePhoneNumberToE164 } from '../../../utils/phone';
import { getWhatsAppProvider } from '../../whatsapp';
import { formatNumber, formatPlural } from '../presentation';
import { ToolContext } from '../types';
import { getVolunteersNotReportedForDuty } from '../tools/dutyTools';
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

    // 2. Evaluate communication eligibility per volunteer
    const recipients: ActionRecipient[] = [];
    let eligibleCount = 0;
    let ineligibleCount = 0;
    const locationCounts: Record<string, number> = {};

    for (const row of missingRows) {
      const locName = row.location_name || row.duty_location || 'Assigned Location';
      locationCounts[locName] = (locationCounts[locName] || 0) + 1;

      const rawPhone = row.whatsapp || row.phone;
      const normalized = normalizePhoneNumberToE164(rawPhone);
      const consent = (row.whatsapp_consent_status || 'unknown').toLowerCase();

      let eligible = false;
      let ineligibilityReason: string | undefined;

      if (!normalized) {
        ineligibilityReason = 'No valid phone number';
      } else if (consent === 'opted_out') {
        ineligibilityReason = 'Opted out of WhatsApp';
      } else if (consent !== 'opted_in') {
        ineligibilityReason = 'No WhatsApp opt-in on file';
      } else {
        eligible = true;
      }

      if (eligible) {
        eligibleCount++;
      } else {
        ineligibleCount++;
      }

      recipients.push({
        id: row.user_id,
        name: row.full_name || row.name || 'Volunteer',
        locationName: locName,
        responsibility: row.responsibility || row.responsibility_key,
        channel: eligible ? 'whatsapp' : 'none',
        eligible,
        ineligibilityReason,
        phone: normalized || undefined
      });
    }

    // 3. Location breakdown items
    const items = Object.entries(locationCounts).map(([loc, count]) => ({
      label: loc,
      value: count,
      meta: `${count} missing`
    }));

    // 4. Warnings
    const warnings: string[] = [];
    if (ineligibleCount > 0) {
      warnings.push(
        ineligibleCount === 1
          ? '1 volunteer cannot receive WhatsApp messages.'
          : `${formatNumber(ineligibleCount)} volunteers cannot receive WhatsApp messages.`
      );
    }

    // 5. Generate confirmation token bound to targets
    const targetUserIds = missingRows.map((r: any) => r.user_id);
    const eligibleUserIds = recipients.filter(r => r.eligible).map(r => r.id);

    const token = actionTokenManager.createToken({
      actor,
      actionKey: 'SEND_DUTY_REMINDERS',
      eventId,
      resolvedTargets: {
        allTargetUserIds: targetUserIds,
        eligibleUserIds,
        locationCounts
      },
      parameters: params
    });

    const answer = `${formatNumber(missingRows.length)} assigned volunteer${missingRows.length === 1 ? ' has' : 's have'} not reported for duty.`;

    const preview: ActionPreview = {
      actionKey: 'SEND_DUTY_REMINDERS',
      title: 'Send duty reminders',
      description: `Send reminders to ${formatNumber(eligibleCount)} eligible volunteer${eligibleCount === 1 ? '' : 's'}.`,
      affectedCount: eligibleCount,
      recipients: recipients.slice(0, 15),
      items,
      warnings,
      confirmLabel: 'Send reminders',
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

    return { valid: true };
  },

  async execute(token: StoredConfirmationToken, context: ToolContext): Promise<ActionExecutionResult> {
    const { eventId, actor } = context;
    const eligibleUserIds: string[] = token.resolvedTargets?.eligibleUserIds || [];

    const event = await queryOne('SELECT title FROM events WHERE id = ?', [eventId]);
    const eventTitle = event?.title || 'Current Event';
    const provider = getWhatsAppProvider();
    const nowIso = new Date().toISOString();

    let sentCount = 0;
    const nowTimeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    for (const userId of eligibleUserIds) {
      try {
        const vol = await queryOne(`
          SELECT 
            vp.full_name,
            vp.phone,
            vp.whatsapp,
            COALESCE(el.name, 'your assigned location') as location_name
          FROM event_duty_assignments eda
          LEFT JOIN event_locations el ON eda.assigned_location_id = el.id
          JOIN volunteer_profiles vp ON eda.user_id = vp.user_id
          WHERE eda.event_id = ? AND eda.user_id = ? AND eda.status NOT IN ('cancelled', 'ended')
          LIMIT 1
        `, [eventId, userId]);

        if (!vol) continue;

        const rawPhone = vol.whatsapp || vol.phone;
        const normalized = normalizePhoneNumberToE164(rawPhone);
        if (!normalized) continue;

        const rawFirst = (vol.full_name || '').trim().split(/\s+/)[0] || 'Volunteer';
        const locName = vol.location_name || 'your assigned location';

        const messageBody = `Hi ${rawFirst}, this is a reminder for your assigned duty at ${locName} for "${eventTitle}". Please check in with your team coordinator or scan in upon arrival.`;

        // Dispatch via WhatsApp provider
        await provider.sendSessionMessage({
          to: normalized,
          body: messageBody
        });

        // Enqueue / log in notification_jobs for traceability
        const idempotencyKey = `duty_reminder:${eventId}:${userId}:${token.id}`;
        const jobId = `job-${crypto.randomUUID()}`;
        try {
          await execute(`
            INSERT INTO notification_jobs (
              id, event_id, user_id, channel, status, idempotency_key, created_at, updated_at
            ) VALUES (?, ?, ?, 'whatsapp', 'completed', ?, ?, ?)
          `, [jobId, eventId, userId, idempotencyKey, nowIso, nowIso]);
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
      `, [auditId, actor.id, userRole, eventId, JSON.stringify({ eventId, sentCount, summary: safeSummary }), nowIso]);
    } catch (auditErr) {
      console.error('[DutyRemindersAction] Failed to record audit log:', auditErr);
    }

    return {
      success: true,
      actionKey: 'SEND_DUTY_REMINDERS',
      title: 'Reminders sent',
      message: `${formatNumber(sentCount)} volunteer${sentCount === 1 ? ' was' : 's were'} contacted.`,
      affectedCount: sentCount,
      deepLink: { label: 'Open Event Duty', route: '/admin/operations', tab: 'operations' },
      updatedAt: nowTimeStr
    };
  }
};
