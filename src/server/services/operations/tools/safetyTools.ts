import { query, queryOne } from '../../../db';
import { OperationalTool, ToolContext, ToolFilter, ToolResult } from '../types';

function isAuthorizedForSafety(role?: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

export const getSafetySummaryTool: OperationalTool = {
  name: 'getSafetySummary',
  description: 'Returns count of open safety alerts, urgent alerts, open incidents, and active escalation cycles',
  category: 'safety',
  requiredRoles: ['admin', 'super_admin'],
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    if (!isAuthorizedForSafety(context.actor.role)) {
      return {
        success: false,
        authorized: false,
        toolName: 'getSafetySummary',
        error: "You don't have permission to view those details."
      };
    }

    const [openAlertsRes, urgentAlertsRes, openIncidentsRes, activeCyclesRes] = await Promise.all([
      queryOne("SELECT COUNT(*) as count FROM event_safety_alerts WHERE event_id = ? AND status != 'resolved'", [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM event_safety_alerts WHERE event_id = ? AND status != 'resolved' AND severity = 'urgent'", [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM incident_records WHERE event_id = ? AND status != 'closed'", [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM escalation_cycles WHERE event_id = ? AND status IN ('scheduled', 'processing', 'open')", [context.eventId])
    ]);

    const openAlerts = openAlertsRes?.count || 0;
    const urgentAlerts = urgentAlertsRes?.count || 0;
    const openIncidents = openIncidentsRes?.count || 0;
    const totalSafetyNotices = openAlerts + openIncidents;
    const activeEscalationCycles = activeCyclesRes?.count || 0;

    return {
      success: true,
      authorized: true,
      toolName: 'getSafetySummary',
      data: {
        eventId: context.eventId,
        openAlerts,
        urgentAlerts,
        openIncidents,
        totalSafetyNotices,
        activeEscalationCycles
      }
    };
  }
};

export const listOpenSafetyNoticesTool: OperationalTool = {
  name: 'listOpenSafetyNotices',
  description: 'Lists open care alerts and incident records requiring resolution',
  category: 'safety',
  requiredRoles: ['admin', 'super_admin'],
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    if (!isAuthorizedForSafety(context.actor.role)) {
      return {
        success: false,
        authorized: false,
        toolName: 'listOpenSafetyNotices',
        error: "You don't have permission to view those details."
      };
    }

    const limit = Math.min(filters?.limit || 20, 50);

    const [alerts, incidents] = await Promise.all([
      query(`
        SELECT 
          id,
          title,
          severity,
          status,
          created_at,
          'Safety Alert' as notice_type
        FROM event_safety_alerts
        WHERE event_id = ? AND status != 'resolved'
        ORDER BY created_at DESC
        LIMIT ?
      `, [context.eventId, limit]),
      query(`
        SELECT 
          id,
          title,
          status,
          created_at,
          'Incident Record' as notice_type
        FROM incident_records
        WHERE event_id = ? AND status != 'closed'
        ORDER BY created_at DESC
        LIMIT ?
      `, [context.eventId, limit])
    ]);

    const combined = [...alerts, ...incidents].slice(0, limit);

    return {
      success: true,
      authorized: true,
      toolName: 'listOpenSafetyNotices',
      displayedCount: combined.length,
      data: combined
    };
  }
};

export const listUnresolvedEscalationsTool: OperationalTool = {
  name: 'listUnresolvedEscalations',
  description: 'Lists active guardian escalation cycles awaiting resolution',
  category: 'safety',
  requiredRoles: ['admin', 'super_admin'],
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    if (!isAuthorizedForSafety(context.actor.role)) {
      return {
        success: false,
        authorized: false,
        toolName: 'listUnresolvedEscalations',
        error: "You don't have permission to view those details."
      };
    }

    const limit = Math.min(filters?.limit || 20, 50);

    const rows = await query(`
      SELECT 
        ec.id as cycle_id,
        ec.condition_key,
        ec.cycle_number,
        ec.status,
        ec.started_at,
        COALESCE(c.full_name, 'Unknown Child') as child_name,
        COALESCE(p.full_name, 'Unknown Guardian') as guardian_name
      FROM escalation_cycles ec
      LEFT JOIN event_safety_alerts a ON a.id = ec.alert_id
      LEFT JOIN children c ON c.id = a.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE ec.event_id = ? AND ec.status IN ('scheduled', 'processing', 'open')
      ORDER BY ec.started_at DESC
      LIMIT ?
    `, [context.eventId, limit]);

    const countRes = await queryOne(`
      SELECT COUNT(*) as total FROM escalation_cycles
      WHERE event_id = ? AND status IN ('scheduled', 'processing', 'open')
    `, [context.eventId]);

    return {
      success: true,
      authorized: true,
      toolName: 'listUnresolvedEscalations',
      totalCount: countRes?.total || 0,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const safetyTools: OperationalTool[] = [
  getSafetySummaryTool,
  listOpenSafetyNoticesTool,
  listUnresolvedEscalationsTool
];
