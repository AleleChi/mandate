import { query, queryOne } from '../../../db';
import { getEventById } from '../../eventService';
import { OperationalTool, ToolContext, ToolFilter, ToolResult } from '../types';

export const getRegistrationSummaryTool: OperationalTool = {
  name: 'getRegistrationSummary',
  description: 'Retrieves total child registrations, review status breakdown, and overall capacity numbers',
  category: 'registrations',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const event = await getEventById(context.eventId);
    const [totalRes, underReviewRes, selectedRes, declinedRes] = await Promise.all([
      queryOne('SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND COALESCE(is_deleted, 0) = 0', [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('under_review', 'pending_review') AND COALESCE(is_deleted, 0) = 0", [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out') AND COALESCE(is_deleted, 0) = 0", [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('declined', 'cancelled', 'removed') AND COALESCE(is_deleted, 0) = 0", [context.eventId])
    ]);

    const total = totalRes?.count || 0;
    const underReview = underReviewRes?.count || 0;
    const selected = selectedRes?.count || 0;
    const declined = declinedRes?.count || 0;
    const capacity = event?.capacity && event.capacity > 0 ? event.capacity : null;
    const placesRemaining = capacity !== null ? Math.max(0, capacity - selected) : null;

    return {
      success: true,
      authorized: true,
      toolName: 'getRegistrationSummary',
      data: {
        eventId: context.eventId,
        total,
        underReview,
        selected,
        declined,
        capacity,
        placesRemaining
      }
    };
  }
};

export const listApplicationsTool: OperationalTool = {
  name: 'listApplications',
  description: 'Lists child applications with optional filtering by status, age group, or search term (bounded limit)',
  category: 'registrations',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const offset = filters?.offset || 0;

    let sql = `
      SELECT 
        e.id as entry_id,
        e.child_id,
        c.full_name as child_name,
        COALESCE(c.calculated_age, 0) as age,
        c.gender,
        e.status,
        e.created_at as submitted_at,
        p.full_name as parent_name,
        p.phone_number as parent_phone
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ? AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
    `;
    const params: any[] = [context.eventId];

    if (filters?.status) {
      sql += ` AND e.status = ?`;
      params.push(filters.status);
    }

    if (filters?.search) {
      sql += ` AND (c.full_name LIKE ? OR p.full_name LIKE ?)`;
      const s = `%${filters.search}%`;
      params.push(s, s);
    }

    // Count total
    const countSql = `SELECT COUNT(*) as total FROM (${sql}) sub`;
    const countRes = await queryOne(countSql, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY e.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(sql, params);

    return {
      success: true,
      authorized: true,
      toolName: 'listApplications',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const getApplicationStatusBreakdownTool: OperationalTool = {
  name: 'getApplicationStatusBreakdown',
  description: 'Returns distribution count of applications grouped by their review/admission status',
  category: 'registrations',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const rows = await query(`
      SELECT e.status, COUNT(*) as count
      FROM child_event_entries e
      WHERE e.event_id = ? AND COALESCE(e.is_deleted, 0) = 0
      GROUP BY e.status
    `, [context.eventId]);

    const breakdown: Record<string, number> = {};
    for (const r of rows) {
      breakdown[r.status] = r.count;
    }

    return {
      success: true,
      authorized: true,
      toolName: 'getApplicationStatusBreakdown',
      data: breakdown
    };
  }
};

export const getAgeGroupRegistrationSummaryTool: OperationalTool = {
  name: 'getAgeGroupRegistrationSummary',
  description: 'Calculates registration, selection, and capacity statistics for each configured age group',
  category: 'registrations',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const ageGroups = await query(
      'SELECT id, label, min_age, max_age, capacity FROM event_age_groups WHERE event_id = ? ORDER BY sort_order ASC, min_age ASC',
      [context.eventId]
    );

    if (!ageGroups || ageGroups.length === 0) {
      return { success: true, authorized: true, toolName: 'getAgeGroupRegistrationSummary', data: [] };
    }

    const childrenData = await query(`
      SELECT c.calculated_age, c.date_of_birth, e.status
      FROM children c
      JOIN child_event_entries e ON c.id = e.child_id
      WHERE e.event_id = ? AND COALESCE(c.is_deleted, 0) = 0 AND COALESCE(e.is_deleted, 0) = 0
    `, [context.eventId]);

    const results = ageGroups.map((g: any) => {
      const minAge = g.min_age ?? 0;
      const maxAge = g.max_age ?? 999;
      const capacity = g.capacity || 0;

      const matching = childrenData.filter((c: any) => {
        let age: number | null = null;
        if (typeof c.calculated_age === 'number' && !isNaN(c.calculated_age)) {
          age = c.calculated_age;
        } else if (c.date_of_birth) {
          const dob = new Date(c.date_of_birth);
          if (!isNaN(dob.getTime())) {
            const diff = Date.now() - dob.getTime();
            age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
          }
        }
        if (age === null) return false;
        return age >= minAge && age <= maxAge;
      });

      const registeredCount = matching.length;
      const selectedCount = matching.filter((c: any) =>
        ['selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out'].includes(c.status)
      ).length;
      const percentageFilled = capacity > 0 ? Math.round((selectedCount / capacity) * 100) : 0;
      const remaining = capacity > 0 ? Math.max(0, capacity - selectedCount) : 0;

      return {
        id: g.id,
        label: g.label,
        minAge,
        maxAge,
        capacity,
        registeredCount,
        selectedCount,
        percentageFilled,
        remaining,
        isNearCapacity: capacity > 0 && percentageFilled >= 90 && percentageFilled < 100,
        isAtOrOverCapacity: capacity > 0 && percentageFilled >= 100
      };
    });

    return {
      success: true,
      authorized: true,
      toolName: 'getAgeGroupRegistrationSummary',
      data: results
    };
  }
};

export const listIncompleteApplicationsTool: OperationalTool = {
  name: 'listIncompleteApplications',
  description: 'Lists applications pending administrative review or with incomplete parent registration',
  category: 'registrations',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const rows = await query(`
      SELECT 
        e.id as entry_id,
        c.full_name as child_name,
        e.status,
        e.created_at as submitted_at,
        p.full_name as parent_name,
        p.phone_number as parent_phone
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ? AND e.status IN ('pending_review', 'under_review')
        AND COALESCE(e.is_deleted, 0) = 0
      ORDER BY e.created_at ASC
      LIMIT ?
    `, [context.eventId, limit]);

    return {
      success: true,
      authorized: true,
      toolName: 'listIncompleteApplications',
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const registrationTools: OperationalTool[] = [
  getRegistrationSummaryTool,
  listApplicationsTool,
  getApplicationStatusBreakdownTool,
  getAgeGroupRegistrationSummaryTool,
  listIncompleteApplicationsTool
];
