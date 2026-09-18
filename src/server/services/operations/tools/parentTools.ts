import { query, queryOne } from '../../../db';
import { OperationalTool, ToolContext, ToolFilter, ToolResult } from '../types';

export const getParentSummaryTool: OperationalTool = {
  name: 'getParentSummary',
  description: 'Returns count of parents with children participating in the current event',
  category: 'parents',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const [totalParentsRes, completedRes] = await Promise.all([
      queryOne(`
        SELECT COUNT(DISTINCT p.id) as count
        FROM parent_profiles p
        JOIN children c ON c.parent_profile_id = p.id
        JOIN child_event_entries e ON e.child_id = c.id
        WHERE e.event_id = ? AND COALESCE(e.is_deleted, 0) = 0
      `, [context.eventId]),
      queryOne(`
        SELECT COUNT(DISTINCT p.id) as count
        FROM parent_profiles p
        JOIN children c ON c.parent_profile_id = p.id
        JOIN child_event_entries e ON e.child_id = c.id
        WHERE e.event_id = ? AND p.profile_completed_at IS NOT NULL AND COALESCE(e.is_deleted, 0) = 0
      `, [context.eventId])
    ]);

    const totalParents = totalParentsRes?.count || 0;
    const completedProfiles = completedRes?.count || 0;
    const incompleteProfiles = Math.max(0, totalParents - completedProfiles);

    return {
      success: true,
      authorized: true,
      toolName: 'getParentSummary',
      data: {
        eventId: context.eventId,
        totalParents,
        completedProfiles,
        incompleteProfiles
      }
    };
  }
};

export const listParentsTool: OperationalTool = {
  name: 'listParents',
  description: 'Lists parents associated with children registered for this event',
  category: 'parents',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const offset = filters?.offset || 0;

    let sql = `
      SELECT 
        p.id as parent_id,
        p.full_name,
        p.email,
        p.phone_number,
        p.whatsapp_number,
        p.profile_completed_at IS NOT NULL as is_profile_complete,
        COUNT(e.id) as children_in_event
      FROM parent_profiles p
      JOIN children c ON c.parent_profile_id = p.id
      JOIN child_event_entries e ON e.child_id = c.id
      WHERE e.event_id = ? AND COALESCE(e.is_deleted, 0) = 0
    `;
    const params: any[] = [context.eventId];

    if (filters?.search) {
      sql += ` AND (p.full_name LIKE ? OR p.email LIKE ? OR p.phone_number LIKE ?)`;
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }

    sql += ` GROUP BY p.id`;

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY p.full_name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(sql, params);

    return {
      success: true,
      authorized: true,
      toolName: 'listParents',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listParentsWithIncompleteApplicationsTool: OperationalTool = {
  name: 'listParentsWithIncompleteApplications',
  description: 'Lists parents whose children have applications still pending review or whose profile is incomplete',
  category: 'parents',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const rows = await query(`
      SELECT DISTINCT
        p.id as parent_id,
        p.full_name,
        p.phone_number,
        p.email,
        p.profile_completed_at IS NOT NULL as is_profile_complete,
        COUNT(e.id) as pending_applications_count
      FROM parent_profiles p
      JOIN children c ON c.parent_profile_id = p.id
      JOIN child_event_entries e ON e.child_id = c.id
      WHERE e.event_id = ? AND (e.status IN ('pending_review', 'under_review') OR p.profile_completed_at IS NULL)
        AND COALESCE(e.is_deleted, 0) = 0
      GROUP BY p.id
      ORDER BY p.full_name ASC
      LIMIT ?
    `, [context.eventId, limit]);

    return {
      success: true,
      authorized: true,
      toolName: 'listParentsWithIncompleteApplications',
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const parentTools: OperationalTool[] = [
  getParentSummaryTool,
  listParentsTool,
  listParentsWithIncompleteApplicationsTool
];
