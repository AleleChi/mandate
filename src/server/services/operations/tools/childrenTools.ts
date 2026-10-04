import { query, queryOne } from '../../../db';
import { OperationalTool, ToolContext, ToolFilter, ToolResult } from '../types';

export const SELECTED_CHILD_STATUSES = [
  'selected',
  'pass_ready',
  'checked_in',
  'inside',
  'picked_up',
  'checked_out'
] as const;

export type SelectedChildStatus = (typeof SELECTED_CHILD_STATUSES)[number];

export function isSelectedChildStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (SELECTED_CHILD_STATUSES as readonly string[]).includes(status);
}

export function formatChildStatusHuman(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  switch (status.toLowerCase()) {
    case 'selected':
      return 'Selected';
    case 'pass_ready':
      return 'Pass ready';
    case 'checked_in':
      return 'Checked in';
    case 'inside':
      return 'Inside';
    case 'picked_up':
      return 'Picked up';
    case 'checked_out':
      return 'Checked out';
    case 'under_review':
    case 'pending_review':
      return 'Awaiting review';
    case 'waiting_list':
    case 'waitlist':
      return 'Waiting list';
    case 'not_selected':
    case 'rejected':
      return 'Not selected';
    case 'withdrawn':
      return 'Withdrawn';
    case 'submitted':
      return 'Submitted';
    case 'incomplete':
      return 'Incomplete';
    default:
      return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export const getChildrenSummaryTool: OperationalTool = {
  name: 'getChildrenSummary',
  description: 'Returns total children registered, selected count, not-selected count, checked-in count, and picked-up count',
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
    const notSelected = Math.max(0, total - selected);

    return {
      success: true,
      authorized: true,
      toolName: 'getChildrenSummary',
      data: {
        eventId: context.eventId,
        total,
        selected,
        notSelected,
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
  description: 'Lists children physically inside the venue right now (checked in and not picked up)',
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
        e.checked_in_at
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ?
        AND (
          (e.status IN ('checked_in', 'inside') AND e.picked_up_at IS NULL)
          OR (e.checked_in_at IS NOT NULL AND e.picked_up_at IS NULL AND e.status NOT IN ('picked_up', 'checked_out', 'declined', 'cancelled', 'removed'))
        )
        AND e.status NOT IN ('picked_up', 'checked_out')
        AND e.picked_up_at IS NULL
        AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
    `;
    const params: any[] = [context.eventId];

    if (filters?.search) {
      sql += ` AND c.full_name LIKE ?`;
      params.push(`%${filters.search}%`);
    }

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY e.checked_in_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(sql, params);

    return {
      success: true,
      authorized: true,
      toolName: 'listChildrenCurrentlyInside',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
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

export const listNotSelectedChildrenTool: OperationalTool = {
  name: 'listNotSelectedChildren',
  description: 'Lists registered children for the current event who are not counted as selected (e.g. awaiting review, waitlisted, not selected, or withdrawn)',
  category: 'children',
  requiredRoles: ['admin', 'super_admin', 'team'],
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const offset = filters?.offset || 0;

    let sql = `
      SELECT
        c.id as child_id,
        c.full_name as child_name,
        COALESCE(c.calculated_age, 0) as age,
        c.gender,
        e.status
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ?
        AND e.status NOT IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out')
        AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
    `;
    const params: any[] = [context.eventId];

    if (filters?.search) {
      sql += ` AND c.full_name LIKE ?`;
      params.push(`%${filters.search}%`);
    }

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY c.full_name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(sql, params);
    const formattedRows = rows.map((r: any) => ({
      ...r,
      human_status: formatChildStatusHuman(r.status)
    }));

    return {
      success: true,
      authorized: true,
      toolName: 'listNotSelectedChildren',
      totalCount,
      displayedCount: formattedRows.length,
      data: formattedRows
    };
  }
};

export const listAwaitingReviewChildrenTool: OperationalTool = {
  name: 'listAwaitingReviewChildren',
  description: 'Lists children whose applications are currently under review or pending review',
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
        p.full_name as parent_name,
        p.phone_number as parent_phone
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ?
        AND e.status IN ('under_review', 'pending_review')
        AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
    `;
    const params: any[] = [context.eventId];

    if (filters?.search) {
      sql += ` AND (c.full_name LIKE ? OR p.full_name LIKE ?)`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY c.full_name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(sql, params);
    const formattedRows = rows.map((r: any) => ({
      ...r,
      human_status: formatChildStatusHuman(r.status)
    }));

    return {
      success: true,
      authorized: true,
      toolName: 'listAwaitingReviewChildren',
      totalCount,
      displayedCount: formattedRows.length,
      data: formattedRows
    };
  }
};

export const listChildrenNotArrivedTool: OperationalTool = {
  name: 'listChildrenNotArrived',
  description: 'Lists selected children who have not yet checked in to the event',
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
        p.full_name as parent_name,
        p.phone_number as parent_phone
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ?
        AND e.status IN ('selected', 'pass_ready')
        AND e.checked_in_at IS NULL
        AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
    `;
    const params: any[] = [context.eventId];

    if (filters?.search) {
      sql += ` AND (c.full_name LIKE ? OR p.full_name LIKE ?)`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY c.full_name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(sql, params);
    const formattedRows = rows.map((r: any) => ({
      ...r,
      human_status: formatChildStatusHuman(r.status)
    }));

    return {
      success: true,
      authorized: true,
      toolName: 'listChildrenNotArrived',
      totalCount,
      displayedCount: formattedRows.length,
      data: formattedRows
    };
  }
};

export const listChildrenNeedingAttentionTool: OperationalTool = {
  name: 'listChildrenNeedingAttention',
  description: 'Lists children who need attention (medical notes, extra support, missing pass, or attendance state anomalies)',
  category: 'children',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const offset = filters?.offset || 0;

    const canViewSensitiveMedical = Boolean(
      context.actor?.role === 'super_admin' ||
      context.actor?.role === 'admin'
    );

    let sql = `
      SELECT
        c.id as child_id,
        c.full_name as child_name,
        COALESCE(c.calculated_age, 0) as age,
        c.gender,
        e.status,
        e.has_medical_notes,
        e.needs_extra_support,
        e.checked_in_at,
        e.picked_up_at,
        p.full_name as parent_name,
        p.phone_number as parent_phone,
        EXISTS(SELECT 1 FROM event_passes ep WHERE ep.child_event_entry_id = e.id AND ep.status = 'active') as has_active_pass
        ${canViewSensitiveMedical ? ', e.medical_notes, e.support_notes' : ''}
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ?
        AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
        AND (
          e.has_medical_notes = 1
          OR e.needs_extra_support = 1
          OR (e.status IN ('selected', 'pass_ready') AND NOT EXISTS (SELECT 1 FROM event_passes ep WHERE ep.child_event_entry_id = e.id AND ep.status = 'active'))
          OR (e.status IN ('picked_up', 'checked_out') AND e.checked_in_at IS NULL)
          OR (e.status = 'inside' AND e.checked_in_at IS NULL)
          OR (e.status IN ('checked_in', 'inside') AND e.picked_up_at IS NOT NULL)
        )
    `;
    const params: any[] = [context.eventId];

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY c.full_name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(sql, params);
    const formattedRows = rows.map((r: any) => {
      const issues: string[] = [];
      if (r.has_medical_notes) issues.push('Medical notes');
      if (r.needs_extra_support) issues.push('Extra support needed');
      if (!r.has_active_pass && (r.status === 'selected' || r.status === 'pass_ready')) issues.push('Missing pass');
      if (r.status === 'inside' && !r.checked_in_at) issues.push('Inside without check-in timestamp');
      if (r.picked_up_at && (r.status === 'checked_in' || r.status === 'inside')) issues.push('Picked up but marked inside');

      return {
        ...r,
        human_status: formatChildStatusHuman(r.status),
        attention_reasons: issues.join(', ') || 'Review required'
      };
    });

    return {
      success: true,
      authorized: true,
      toolName: 'listChildrenNeedingAttention',
      totalCount,
      displayedCount: formattedRows.length,
      data: formattedRows
    };
  }
};

export const getChildStatusTool: OperationalTool = {
  name: 'getChildStatus',
  description: 'Returns the current operational and selection status of a named child',
  category: 'children',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const searchName = (filters?.childName || filters?.search || '').trim();
    if (!searchName) {
      return {
        success: false,
        authorized: true,
        toolName: 'getChildStatus',
        error: 'A child name must be provided.'
      };
    }

    const rows = await query(`
      SELECT
        c.id as child_id,
        c.full_name as child_name,
        COALESCE(c.calculated_age, 0) as age,
        c.gender,
        e.status,
        e.checked_in_at,
        e.picked_up_at,
        p.full_name as parent_name,
        p.phone_number as parent_phone,
        EXISTS(SELECT 1 FROM event_passes ep WHERE ep.child_event_entry_id = e.id AND ep.status = 'active') as has_active_pass
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ?
        AND LOWER(c.full_name) LIKE LOWER(?)
        AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
      LIMIT 5
    `, [context.eventId, `%${searchName}%`]);

    if (!rows || rows.length === 0) {
      return {
        success: true,
        authorized: true,
        toolName: 'getChildStatus',
        totalCount: 0,
        displayedCount: 0,
        data: []
      };
    }

    const formatted = rows.map((r: any) => {
      const selected = isSelectedChildStatus(r.status);
      const checkedIn = Boolean(r.checked_in_at) || r.status === 'checked_in' || r.status === 'inside';
      const inside = r.status === 'inside' || (Boolean(r.checked_in_at) && !r.picked_up_at && r.status !== 'picked_up' && r.status !== 'checked_out');
      const pickedUp = Boolean(r.picked_up_at) || r.status === 'picked_up' || r.status === 'checked_out';

      return {
        child_id: r.child_id,
        child_name: r.child_name,
        age: r.age,
        gender: r.gender,
        status: r.status,
        human_status: formatChildStatusHuman(r.status),
        is_selected: selected,
        is_checked_in: checkedIn,
        is_inside: inside,
        is_picked_up: pickedUp,
        has_active_pass: Boolean(r.has_active_pass),
        checked_in_at: r.checked_in_at,
        picked_up_at: r.picked_up_at,
        parent_name: r.parent_name,
        parent_phone: r.parent_phone
      };
    });

    return {
      success: true,
      authorized: true,
      toolName: 'getChildStatus',
      totalCount: formatted.length,
      displayedCount: formatted.length,
      data: formatted
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
  listPickedUpChildrenTool,
  listNotSelectedChildrenTool,
  listAwaitingReviewChildrenTool,
  listChildrenNotArrivedTool,
  listChildrenNeedingAttentionTool,
  getChildStatusTool
];
