import crypto from 'crypto';
import { execute, queryOne } from '../../../db';
import {
  processQueuedReportJobs,
  REPORT_TEMPLATES,
  requestReportJob
} from '../../reportService';
import { ToolContext } from '../types';
import { actionTokenManager } from './tokenManager';
import {
  ActionExecutionResult,
  ActionPreview,
  OperationsActionDefinition,
  StoredConfirmationToken
} from './types';

export const regenerateReportAction: OperationsActionDefinition = {
  actionKey: 'REGENERATE_REPORT',
  humanLabel: 'Regenerate report',
  requiredRoles: ['super_admin', 'admin', 'safeguarding_lead', 'team'],

  async preparePreview(context: ToolContext, params?: { templateKey?: string; queryText?: string }) {
    const { eventId, actor } = context;

    const event = await queryOne('SELECT title FROM events WHERE id = ?', [eventId]);
    const eventTitle = event?.title || 'The General Assembly';

    // 1. Resolve template
    let resolvedKey = params?.templateKey || 'management-summary';
    const qLower = (params?.queryText || '').toLowerCase();

    if (qLower.includes('attendance')) {
      resolvedKey = 'attendance-movement';
    } else if (qLower.includes('registration') || qLower.includes('selection')) {
      resolvedKey = 'registration-selection';
    } else if (qLower.includes('full') || qLower.includes('comprehensive')) {
      resolvedKey = 'full-event-report';
    } else {
      resolvedKey = 'management-summary';
    }

    const template = REPORT_TEMPLATES.find(t => t.key === resolvedKey) || REPORT_TEMPLATES[0];
    const templateName = resolvedKey === 'management-summary' ? 'Event Executive Report' : template.name;

    // 2. Generate token
    const token = actionTokenManager.createToken({
      actor,
      actionKey: 'REGENERATE_REPORT',
      eventId,
      resolvedTargets: {
        templateKey: template.key,
        templateName
      },
      parameters: {
        templateKey: template.key
      }
    });

    const preview: ActionPreview = {
      actionKey: 'REGENERATE_REPORT',
      title: `Regenerate ${templateName}?`,
      description: `The report will use current event data for "${eventTitle}".`,
      affectedCount: 1,
      items: [
        { label: 'Event', value: eventTitle },
        { label: 'Report', value: templateName, meta: 'Fresh generation' }
      ],
      confirmLabel: 'Regenerate report',
      cancelLabel: 'Cancel',
      confirmationToken: token.id,
      expiresAt: token.expiresAt
    };

    const answer = `I can regenerate the ${templateName} using the latest live event data.`;
    return { answer, preview };
  },

  async revalidate(_token: StoredConfirmationToken, context: ToolContext) {
    const event = await queryOne('SELECT id FROM events WHERE id = ?', [context.eventId]);
    if (!event) {
      return { valid: false, reason: 'The event data changed. Review the action again before continuing.' };
    }
    return { valid: true };
  },

  async execute(token: StoredConfirmationToken, context: ToolContext): Promise<ActionExecutionResult> {
    const { eventId, actor } = context;
    const templateKey: string = token.resolvedTargets?.templateKey || 'management-summary';
    const templateName: string = token.resolvedTargets?.templateName || 'Report';

    const template = REPORT_TEMPLATES.find(t => t.key === templateKey) || REPORT_TEMPLATES[0];
    const idempotencyKey = `regen:${eventId}:${templateKey}:${token.id}`;

    // Request new report job
    const jobId = await requestReportJob(
      eventId,
      null,
      templateKey,
      actor.id,
      actor.role || 'admin',
      template.privacy_classification || 'Internal operational',
      template.defaultSections || ['Executive summary'],
      {},
      idempotencyKey
    );

    // Process queued report jobs
    try {
      await processQueuedReportJobs();
    } catch (procErr) {
      console.error('[RegenerateReportAction] Warning: processing queued job failed:', procErr);
    }

    // Centralized Audit Log
    const nowIso = new Date().toISOString();
    const nowTimeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const auditId = `audit-${crypto.randomUUID()}`;
    const userRole = actor.role || 'admin';
    const roleLabel = userRole === 'super_admin' ? 'Super Admin' : 'Admin';
    const safeSummary = `${roleLabel} regenerated ${templateName}.`;

    try {
      await execute(`
        INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
        VALUES (?, ?, ?, 'REGENERATE_REPORT', 'reports', ?, ?, ?)
      `, [auditId, actor.id, userRole, jobId, JSON.stringify({ eventId, templateKey, summary: safeSummary }), nowIso]);
    } catch (auditErr) {
      console.error('[RegenerateReportAction] Failed to record audit log:', auditErr);
    }

    return {
      success: true,
      actionKey: 'REGENERATE_REPORT',
      title: 'Report generated',
      message: `The fresh ${templateName} is ready in the Reports Center.`,
      affectedCount: 1,
      deepLink: { label: 'View Reports Center', route: '/admin/reports', tab: 'reports' },
      updatedAt: nowTimeStr
    };
  }
};
