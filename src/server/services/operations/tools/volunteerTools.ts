import { query, queryOne } from '../../../db';
import { OperationalTool, ToolContext, ToolFilter, ToolResult } from '../types';

export const getVolunteerSummaryTool: OperationalTool = {
  name: 'getVolunteerSummary',
  description: 'Returns total approved volunteers, number assigned to current event, number on duty, and unassigned count',
  category: 'volunteers',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const [approvedRes, assignedRes, onDutyRes] = await Promise.all([
      queryOne("SELECT COUNT(*) as count FROM volunteer_profiles WHERE status IN ('approved', 'active')"),
      queryOne("SELECT COUNT(DISTINCT user_id) as count FROM event_duty_assignments WHERE event_id = ? AND status != 'cancelled'", [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM user_duty_status WHERE on_duty = 1 AND assigned_event_id = ?", [context.eventId])
    ]);

    const approvedVolunteers = approvedRes?.count || 0;
    const volunteersAssigned = assignedRes?.count || 0;
    const volunteersOnDuty = onDutyRes?.count || 0;
    const unassignedApprovedVolunteers = Math.max(0, approvedVolunteers - volunteersAssigned);

    return {
      success: true,
      authorized: true,
      toolName: 'getVolunteerSummary',
      data: {
        eventId: context.eventId,
        approvedVolunteers,
        volunteersAssigned,
        volunteersOnDuty,
        unassignedApprovedVolunteers
      }
    };
  }
};

export const listApprovedVolunteersTool: OperationalTool = {
  name: 'listApprovedVolunteers',
  description: 'Lists all approved volunteers with contact and assignment information',
  category: 'volunteers',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const offset = filters?.offset || 0;

    let sql = `
      SELECT 
        vp.id as volunteer_id,
        vp.user_id,
        vp.full_name,
        vp.phone,
        vp.preferred_team,
        vp.status,
        EXISTS(
          SELECT 1 FROM event_duty_assignments a 
          WHERE a.user_id = vp.user_id AND a.event_id = ? AND a.status != 'cancelled'
        ) as is_assigned
      FROM volunteer_profiles vp
      WHERE vp.status IN ('approved', 'active')
    `;
    const params: any[] = [context.eventId];

    if (filters?.search) {
      sql += ` AND (vp.full_name LIKE ? OR vp.phone LIKE ? OR vp.preferred_team LIKE ?)`;
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY vp.full_name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(sql, params);

    return {
      success: true,
      authorized: true,
      toolName: 'listApprovedVolunteers',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listUnassignedVolunteersTool: OperationalTool = {
  name: 'listUnassignedVolunteers',
  description: 'Lists approved volunteers who have no scheduled duty assignments for the current event',
  category: 'volunteers',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const offset = filters?.offset || 0;

    let sql = `
      SELECT 
        vp.id as volunteer_id,
        vp.user_id,
        vp.full_name,
        vp.phone,
        vp.preferred_team,
        vp.status
      FROM volunteer_profiles vp
      WHERE vp.status IN ('approved', 'active')
        AND NOT EXISTS (
          SELECT 1 FROM event_duty_assignments a 
          WHERE a.user_id = vp.user_id AND a.event_id = ? AND a.status != 'cancelled'
        )
    `;
    const params: any[] = [context.eventId];

    if (filters?.search) {
      sql += ` AND (vp.full_name LIKE ? OR vp.phone LIKE ? OR vp.preferred_team LIKE ?)`;
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY vp.full_name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(sql, params);

    return {
      success: true,
      authorized: true,
      toolName: 'listUnassignedVolunteers',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listVolunteersByStatusTool: OperationalTool = {
  name: 'listVolunteersByStatus',
  description: 'Lists volunteers filtered by status (pending, approved, active, etc.)',
  category: 'volunteers',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const targetStatus = filters?.status || 'pending';

    const rows = await query(`
      SELECT 
        vp.id as volunteer_id,
        vp.user_id,
        vp.full_name,
        vp.phone,
        vp.preferred_team,
        vp.status,
        vp.created_at
      FROM volunteer_profiles vp
      WHERE vp.status = ?
      ORDER BY vp.created_at DESC
      LIMIT ?
    `, [targetStatus, limit]);

    const countRes = await queryOne(
      'SELECT COUNT(*) as total FROM volunteer_profiles WHERE status = ?',
      [targetStatus]
    );

    return {
      success: true,
      authorized: true,
      toolName: 'listVolunteersByStatus',
      totalCount: countRes?.total || 0,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const volunteerTools: OperationalTool[] = [
  getVolunteerSummaryTool,
  listApprovedVolunteersTool,
  listUnassignedVolunteersTool,
  listVolunteersByStatusTool
];
