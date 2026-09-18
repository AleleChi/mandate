import crypto from 'crypto';
import { execute, query, queryOne } from '../../../db';
import { formatNumber } from '../presentation';
import { ToolContext } from '../types';
import { actionTokenManager } from './tokenManager';
import {
  ActionExecutionResult,
  ActionPreview,
  OperationsActionDefinition,
  StoredConfirmationToken
} from './types';

export const createOperationsAlertAction: OperationsActionDefinition = {
  actionKey: 'CREATE_ADMIN_OPERATIONS_ALERT',
  humanLabel: 'Create operations alert',
  requiredRoles: ['super_admin', 'admin', 'safeguarding_lead', 'team'],

  async preparePreview(context: ToolContext, _params?: any) {
    const { eventId, actor } = context;

    // 1. Query live active locations and their current assigned / active presence
    const locations = await query(`
      SELECT 
        el.id,
        el.name,
        el.short_name,
        el.volunteer_capacity,
        COUNT(DISTINCT eda.user_id) as assigned_count,
        (
          SELECT COUNT(DISTINCT edlp.user_id)
          FROM event_duty_location_presence edlp
          WHERE edlp.event_location_id = el.id AND edlp.event_id = ?
        ) as on_duty_count
      FROM event_locations el
      LEFT JOIN event_duty_assignments eda 
        ON el.id = eda.assigned_location_id 
        AND eda.event_id = ?
        AND eda.status = 'assigned'
      WHERE el.event_id = ? AND el.is_active = 1
      GROUP BY el.id
      ORDER BY el.sort_order ASC, el.name ASC
    `, [eventId, eventId, eventId]);

    const understaffed = locations
      .map((l: any) => {
        const capacity = l.volunteer_capacity || 1;
        const assigned = l.assigned_count || 0;
        const onDuty = l.on_duty_count || 0;
        const gap = Math.max(0, capacity - assigned);
        return {
          id: l.id,
          name: l.name,
          capacity,
          assigned,
          onDuty,
          gap
        };
      })
      .filter((l: any) => l.gap > 0);

    if (understaffed.length === 0) {
      return {
        answer: 'All active duty locations currently meet their volunteer staffing targets.',
        preview: {
          actionKey: 'CREATE_ADMIN_OPERATIONS_ALERT',
          title: 'Create operations alert',
          description: 'No alert needed. All duty locations are adequately staffed.',
          affectedCount: 0,
          confirmLabel: 'Create alert',
          cancelLabel: 'Cancel',
          confirmationToken: '',
          expiresAt: new Date().toISOString()
        }
      };
    }

    const items = understaffed.map((l: any) => ({
      label: l.name,
      value: `${l.assigned} of ${l.capacity} assigned`,
      meta: `Gap: ${l.gap}`
    }));

    const token = actionTokenManager.createToken({
      actor,
      actionKey: 'CREATE_ADMIN_OPERATIONS_ALERT',
      eventId,
      resolvedTargets: {
        understaffedLocations: understaffed
      }
    });

    const count = understaffed.length;
    const answer = `${formatNumber(count)} duty location${count === 1 ? ' needs' : 's need'} more volunteers.`;

    const preview: ActionPreview = {
      actionKey: 'CREATE_ADMIN_OPERATIONS_ALERT',
      title: 'Create operations alert?',
      description: `${formatNumber(count)} location${count === 1 ? ' needs' : 's need'} more volunteers:`,
      affectedCount: count,
      items,
      confirmLabel: 'Create alert',
      cancelLabel: 'Cancel',
      confirmationToken: token.id,
      expiresAt: token.expiresAt
    };

    return { answer, preview };
  },

  async revalidate(token: StoredConfirmationToken, context: ToolContext) {
    const { eventId } = context;
    const previousTargetIds: string[] = (token.resolvedTargets?.understaffedLocations || []).map((l: any) => l.id);

    if (previousTargetIds.length === 0) return { valid: true };

    const placeholders = previousTargetIds.map(() => '?').join(',');
    const currentLocations = await query(`
      SELECT 
        el.id,
        el.volunteer_capacity,
        COUNT(DISTINCT eda.user_id) as assigned_count
      FROM event_locations el
      LEFT JOIN event_duty_assignments eda 
        ON el.id = eda.assigned_location_id 
        AND eda.event_id = ?
        AND eda.status = 'assigned'
      WHERE el.id IN (${placeholders}) AND el.event_id = ?
      GROUP BY el.id
    `, [eventId, ...previousTargetIds, eventId]);

    // Check if any location is no longer understaffed
    let stillUnderstaffed = 0;
    for (const loc of currentLocations) {
      const cap = loc.volunteer_capacity || 1;
      const assigned = loc.assigned_count || 0;
      if (assigned < cap) {
        stillUnderstaffed++;
      }
    }

    if (stillUnderstaffed === 0) {
      return {
        valid: false,
        reason: 'Staffing levels have changed. Review current coverage before creating an alert.'
      };
    }

    return { valid: true };
  },

  async execute(token: StoredConfirmationToken, context: ToolContext): Promise<ActionExecutionResult> {
    const { eventId, actor } = context;
    const locations: any[] = token.resolvedTargets?.understaffedLocations || [];
    const count = locations.length;

    const summaryList = locations.map((l: any) => `${l.name} (${l.assigned}/${l.capacity})`).join(', ');
    const alertId = `alert-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();
    const nowTimeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const actorRow = await queryOne('SELECT id FROM users WHERE id = ?', [actor.id]);
    let raisedByUserId = actor.id;
    if (!actorRow) {
      const fallbackAdmin = await queryOne("SELECT id FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1");
      if (fallbackAdmin) {
        raisedByUserId = fallbackAdmin.id;
      }
    }

    // Insert operational internal admin safety alert
    await execute(`
      INSERT INTO event_safety_alerts (
        id, event_id, child_id, child_event_entry_id, raised_by_user_id, raised_by_role,
        severity, category, title, message, status, created_at, updated_at
      ) VALUES (?, ?, NULL, NULL, ?, ?, 'important', 'operations', ?, ?, 'open', ?, ?)
    `, [
      alertId,
      eventId,
      raisedByUserId,
      actor.role || 'admin',
      `Staffing Alert: ${count} understaffed location${count === 1 ? '' : 's'}`,
      `Volunteer coverage is below target for ${summaryList}. Immediate staffing coordination recommended.`,
      nowIso,
      nowIso
    ]);

    // Centralized Audit Log
    const auditId = `audit-${crypto.randomUUID()}`;
    const userRole = actor.role || 'admin';
    const roleLabel = userRole === 'super_admin' ? 'Super Admin' : 'Admin';
    const safeSummary = `${roleLabel} created an operations alert for ${count} understaffed location${count === 1 ? '' : 's'}.`;

    try {
      await execute(`
        INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
        VALUES (?, ?, ?, 'CREATE_ADMIN_OPERATIONS_ALERT', 'safety_alerts', ?, ?, ?)
      `, [auditId, actor.id, userRole, alertId, JSON.stringify({ eventId, understaffedCount: count, summary: safeSummary }), nowIso]);
    } catch (auditErr) {
      console.error('[CreateOperationsAlertAction] Failed to record audit log:', auditErr);
    }

    return {
      success: true,
      actionKey: 'CREATE_ADMIN_OPERATIONS_ALERT',
      title: 'Alert created',
      message: `Operations alert logged for ${formatNumber(count)} understaffed location${count === 1 ? '' : 's'}.`,
      affectedCount: count,
      deepLink: { label: 'View Incident Desk', route: '/admin/escalations', tab: 'escalations' },
      updatedAt: nowTimeStr
    };
  }
};
