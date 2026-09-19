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
      queryOne("SELECT COUNT(DISTINCT user_id) as count FROM event_duty_location_presence WHERE event_id = ? AND ended_at IS NULL", [context.eventId])
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

export const listApprovedUnassignedVolunteersTool: OperationalTool = {
  name: 'listApprovedUnassignedVolunteers',
  description: 'Lists approved volunteers who have not been assigned to any duty post for the current event',
  category: 'volunteers',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    return listUnassignedVolunteersTool.execute(context, filters);
  }
};

export const listVolunteersReportedOffDutyTool: OperationalTool = {
  name: 'listVolunteersReportedOffDuty',
  description: 'Lists volunteers who reported for duty today but are no longer active on duty',
  category: 'volunteers',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);

    let sql = `
      SELECT DISTINCT
        vp.id as volunteer_id,
        vp.user_id,
        vp.full_name as name,
        COALESCE(el.name, 'Floating / Mobile') as last_location,
        p.started_at as reported_at,
        p.ended_at as off_duty_at
      FROM event_duty_location_presence p
      JOIN volunteer_profiles vp ON vp.user_id = p.user_id
      LEFT JOIN event_locations el ON el.id = p.event_location_id
      WHERE p.event_id = ?
        AND p.ended_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM event_duty_location_presence p2
          WHERE p2.user_id = p.user_id AND p2.event_id = p.event_id AND p2.ended_at IS NULL
        )
    `;
    const params: any[] = [context.eventId];

    if (filters?.search) {
      sql += ` AND (vp.full_name LIKE ? OR vp.phone LIKE ?)`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY p.ended_at DESC LIMIT ?`;
    params.push(limit);

    const rows = await query(sql, params);

    return {
      success: true,
      authorized: true,
      toolName: 'listVolunteersReportedOffDuty',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listVolunteersWithDuplicatePresenceTool: OperationalTool = {
  name: 'listVolunteersWithDuplicatePresence',
  description: 'Lists volunteers who currently have multiple concurrent active duty presence records',
  category: 'volunteers',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const rows = await query(`
      SELECT
        vp.id as volunteer_id,
        vp.user_id,
        vp.full_name as name,
        COUNT(p.id) as active_sessions_count
      FROM event_duty_location_presence p
      JOIN volunteer_profiles vp ON vp.user_id = p.user_id
      WHERE p.event_id = ? AND p.ended_at IS NULL
      GROUP BY vp.id, vp.user_id, vp.full_name
      HAVING COUNT(p.id) > 1
    `, [context.eventId]);

    return {
      success: true,
      authorized: true,
      toolName: 'listVolunteersWithDuplicatePresence',
      totalCount: rows.length,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listVolunteersChangedLocationsTool: OperationalTool = {
  name: 'listVolunteersChangedLocations',
  description: 'Lists volunteers who have checked into more than one duty location during the event',
  category: 'volunteers',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const rows = await query(`
      SELECT
        vp.id as volunteer_id,
        vp.user_id,
        vp.full_name as name,
        COUNT(DISTINCT p.event_location_id) as location_count
      FROM event_duty_location_presence p
      JOIN volunteer_profiles vp ON vp.user_id = p.user_id
      WHERE p.event_id = ?
      GROUP BY vp.id, vp.user_id, vp.full_name
      HAVING COUNT(DISTINCT p.event_location_id) > 1
    `, [context.eventId]);

    return {
      success: true,
      authorized: true,
      toolName: 'listVolunteersChangedLocations',
      totalCount: rows.length,
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
  listApprovedUnassignedVolunteersTool,
  listVolunteersReportedOffDutyTool,
  listVolunteersWithDuplicatePresenceTool,
  listVolunteersChangedLocationsTool,
  listVolunteersByStatusTool
];
