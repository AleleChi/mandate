import { query, queryOne } from '../../../db';
import { OperationalTool, ToolContext, ToolFilter, ToolResult } from '../types';

export const getChildrenSummaryTool: OperationalTool = {
  name: 'getChildrenSummary',
  description: 'Returns total children registered, selected count, checked-in count, and picked-up count',
  category: 'children',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const [totalRes, selectedRes, checkedInRes, insideRes, pickedUpRes] = await Promise.all([
      queryOne('SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND COALESCE(is_deleted, 0) = 0', [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out') AND COALESCE(is_deleted, 0) = 0", [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'checked_in' AND COALESCE(is_deleted, 0) = 0", [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'inside' AND COALESCE(is_deleted, 0) = 0", [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('picked_up', 'checked_out') AND COALESCE(is_deleted, 0) = 0", [context.eventId])
    ]);

    const total = totalRes?.count || 0;
    const selected = selectedRes?.count || 0;
    const checkedInDirect = checkedInRes?.count || 0;
    const inside = insideRes?.count || 0;
    const pickedUp = pickedUpRes?.count || 0;
    const totalCheckedIn = checkedInDirect + inside + pickedUp;
    const currentlyOnSite = checkedInDirect + inside;

    return {
      success: true,
      authorized: true,
      toolName: 'getChildrenSummary',
      data: {
        eventId: context.eventId,
        total,
        selected,
        checkedIn: totalCheckedIn,
        inside: currentlyOnSite,
        pickedUp,
        notArrivedYet: Math.max(0, selected - totalCheckedIn)
      }
    };
  }
};

export const listChildrenTool: OperationalTool = {
  name: 'listChildren',
  description: 'Lists children in current event with operational fields (name, age, gender, status). Does not expose sensitive medical notes.',
  category: 'children',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const offset = filters?.offset || 0;

    let sql = `
      SELECT 
        c.id as child_id,
        c.full_name as child_name,
        COALESCE(c.calculated_age, 0) as age,
        c.gender,
        e.status,
        e.checked_in_at,
        e.picked_up_at,
        EXISTS(SELECT 1 FROM event_passes p WHERE p.child_event_entry_id = e.id AND p.status = 'active') as has_active_pass
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
    `;
    const params: any[] = [context.eventId];

    if (filters?.status) {
      sql += ` AND e.status = ?`;
      params.push(filters.status);
    }

    if (filters?.search) {
      sql += ` AND c.full_name LIKE ?`;
      const s = `%${filters.search}%`;
      params.push(s);
    }

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY c.full_name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(sql, params);

    return {
      success: true,
      authorized: true,
      toolName: 'listChildren',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listSelectedChildrenTool: OperationalTool = {
  name: 'listSelectedChildren',
  description: 'Lists children selected for admission to the current event',
  category: 'children',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const rows = await query(`
      SELECT 
        c.id as child_id,
        c.full_name as child_name,
        COALESCE(c.calculated_age, 0) as age,
        c.gender,
        e.status,
        EXISTS(SELECT 1 FROM event_passes p WHERE p.child_event_entry_id = e.id AND p.status = 'active') as has_active_pass
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out')
        AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
      ORDER BY c.full_name ASC
      LIMIT ?
    `, [context.eventId, limit]);

    const countRes = await queryOne(`
      SELECT COUNT(*) as total FROM child_event_entries e
      WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out')
        AND COALESCE(e.is_deleted, 0) = 0
    `, [context.eventId]);

    return {
      success: true,
      authorized: true,
      toolName: 'listSelectedChildren',
      totalCount: countRes?.total || 0,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listChildrenWithoutPassesTool: OperationalTool = {
  name: 'listChildrenWithoutPasses',
  description: 'Lists selected children for whom an active pass has not yet been generated',
  category: 'children',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const rows = await query(`
      SELECT 
        c.id as child_id,
        c.full_name as child_name,
        COALESCE(c.calculated_age, 0) as age,
        c.gender,
        e.status,
        p.full_name as parent_name,
        p.phone_number as parent_phone
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready')
        AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
        AND NOT EXISTS (
          SELECT 1 FROM event_passes ep 
          WHERE ep.child_event_entry_id = e.id AND ep.status = 'active'
        )
      ORDER BY c.full_name ASC
      LIMIT ?
    `, [context.eventId, limit]);

    const countRes = await queryOne(`
      SELECT COUNT(*) as total FROM child_event_entries e
      WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready')
        AND COALESCE(e.is_deleted, 0) = 0
        AND NOT EXISTS (
          SELECT 1 FROM event_passes ep 
          WHERE ep.child_event_entry_id = e.id AND ep.status = 'active'
        )
    `, [context.eventId]);

    return {
      success: true,
      authorized: true,
      toolName: 'listChildrenWithoutPasses',
      totalCount: countRes?.total || 0,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listCheckedInChildrenTool: OperationalTool = {
  name: 'listCheckedInChildren',
  description: 'Lists children who have checked in to the event and have not been picked up yet',
  category: 'children',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const rows = await query(`
      SELECT 
        c.id as child_id,
        c.full_name as child_name,
        COALESCE(c.calculated_age, 0) as age,
        c.gender,
        e.status,
        e.checked_in_at
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND e.status IN ('checked_in', 'inside')
        AND COALESCE(e.is_deleted, 0) = 0
      ORDER BY e.checked_in_at DESC
      LIMIT ?
    `, [context.eventId, limit]);

    const countRes = await queryOne(`
      SELECT COUNT(*) as total FROM child_event_entries e
      WHERE e.event_id = ? AND e.status IN ('checked_in', 'inside')
        AND COALESCE(e.is_deleted, 0) = 0
    `, [context.eventId]);

    return {
      success: true,
      authorized: true,
      toolName: 'listCheckedInChildren',
      totalCount: countRes?.total || 0,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listChildrenCurrentlyInsideTool: OperationalTool = {
  name: 'listChildrenCurrentlyInside',
  description: 'Lists children physically inside the venue right now',
  category: 'children',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    return listCheckedInChildrenTool.execute(context, filters);
  }
};

export const listPickedUpChildrenTool: OperationalTool = {
  name: 'listPickedUpChildren',
  description: 'Lists children who have already been picked up or checked out of the event',
  category: 'children',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const rows = await query(`
      SELECT 
        c.id as child_id,
        c.full_name as child_name,
        COALESCE(c.calculated_age, 0) as age,
        e.status,
        e.picked_up_at
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND e.status IN ('picked_up', 'checked_out')
        AND COALESCE(e.is_deleted, 0) = 0
      ORDER BY e.picked_up_at DESC
      LIMIT ?
    `, [context.eventId, limit]);

    const countRes = await queryOne(`
      SELECT COUNT(*) as total FROM child_event_entries e
      WHERE e.event_id = ? AND e.status IN ('picked_up', 'checked_out')
        AND COALESCE(e.is_deleted, 0) = 0
    `, [context.eventId]);

    return {
      success: true,
      authorized: true,
      toolName: 'listPickedUpChildren',
      totalCount: countRes?.total || 0,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const childrenTools: OperationalTool[] = [
  getChildrenSummaryTool,
  listChildrenTool,
  listSelectedChildrenTool,
  listChildrenWithoutPassesTool,
  listCheckedInChildrenTool,
  listChildrenCurrentlyInsideTool,
  listPickedUpChildrenTool
];
