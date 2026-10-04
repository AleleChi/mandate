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

export const listChildrenMissingPickupInfoTool: OperationalTool = {
  name: 'listChildrenMissingPickupInfo',
  description: 'Lists selected children who are missing authorized pickup person information or contact details',
  category: 'parents',
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
        p.phone_number as parent_phone,
        pp.full_name as pickup_person_name,
        pp.phone_number as pickup_phone,
        pp.relationship_to_child as pickup_relationship
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      LEFT JOIN pickup_people pp ON pp.child_event_entry_id = e.id
      WHERE e.event_id = ?
        AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out')
        AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
        AND (
          pp.id IS NULL
          OR pp.full_name IS NULL
          OR pp.full_name = ''
          OR pp.phone_number IS NULL
          OR pp.phone_number = ''
        )
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

    return {
      success: true,
      authorized: true,
      toolName: 'listChildrenMissingPickupInfo',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listChildrenMissingPickupPhotosTool: OperationalTool = {
  name: 'listChildrenMissingPickupPhotos',
  description: 'Lists selected children whose assigned pickup person is missing a verification photo',
  category: 'parents',
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
        p.phone_number as parent_phone,
        pp.full_name as pickup_person_name,
        pp.relationship_to_child as pickup_relationship
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      JOIN pickup_people pp ON pp.child_event_entry_id = e.id
      WHERE e.event_id = ?
        AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out')
        AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
        AND (pp.photo_file_id IS NULL OR pp.photo_file_id = '')
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

    return {
      success: true,
      authorized: true,
      toolName: 'listChildrenMissingPickupPhotos',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listParentsWithMultipleChildrenTool: OperationalTool = {
  name: 'listParentsWithMultipleChildren',
  description: 'Lists parents who have more than one child registered for the current event',
  category: 'parents',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const offset = filters?.offset || 0;

    let sql = `
      SELECT
        p.id as parent_id,
        p.full_name as parent_name,
        p.phone_number,
        p.email,
        COUNT(e.id) as child_count
      FROM parent_profiles p
      JOIN children c ON c.parent_profile_id = p.id
      JOIN child_event_entries e ON e.child_id = c.id
      WHERE e.event_id = ? AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
      GROUP BY p.id, p.full_name, p.phone_number, p.email
      HAVING COUNT(e.id) > 1
    `;
    const params: any[] = [context.eventId];

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY child_count DESC, p.full_name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(sql, params);

    return {
      success: true,
      authorized: true,
      toolName: 'listParentsWithMultipleChildren',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listParentsWithChildrenInsideTool: OperationalTool = {
  name: 'listParentsWithChildrenInside',
  description: 'Lists parents whose children are currently inside the venue',
  category: 'parents',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const offset = filters?.offset || 0;

    let sql = `
      SELECT DISTINCT
        p.id as parent_id,
        p.full_name as parent_name,
        p.phone_number as parent_phone,
        c.full_name as child_name,
        e.status,
        e.checked_in_at
      FROM parent_profiles p
      JOIN children c ON c.parent_profile_id = p.id
      JOIN child_event_entries e ON e.child_id = c.id
      WHERE e.event_id = ?
        AND e.status IN ('checked_in', 'inside')
        AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
    `;
    const params: any[] = [context.eventId];

    if (filters?.search) {
      sql += ` AND (c.full_name LIKE ? OR p.full_name LIKE ?)`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY e.checked_in_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(sql, params);

    return {
      success: true,
      authorized: true,
      toolName: 'listParentsWithChildrenInside',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listChildrenMissingGuardianInfoTool: OperationalTool = {
  name: 'listChildrenMissingGuardianInfo',
  description: 'Lists children whose parent/guardian profile is incomplete (missing phone, full name, or profile completion)',
  category: 'parents',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const offset = filters?.offset || 0;

    let sql = `
      SELECT
        c.id as child_id,
        c.full_name as child_name,
        COALESCE(c.calculated_age, 0) as age,
        e.status,
        p.id as parent_id,
        p.full_name as parent_name,
        p.phone_number as parent_phone,
        p.email as parent_email,
        p.profile_completed_at IS NOT NULL as is_profile_complete
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ?
        AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
        AND (
          p.id IS NULL
          OR p.profile_completed_at IS NULL
          OR p.phone_number IS NULL
          OR p.phone_number = ''
          OR p.full_name IS NULL
          OR p.full_name = ''
        )
    `;
    const params: any[] = [context.eventId];

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY c.full_name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(sql, params);

    return {
      success: true,
      authorized: true,
      toolName: 'listChildrenMissingGuardianInfo',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listChildrenWithOutstandingConsentTool: OperationalTool = {
  name: 'listChildrenWithOutstandingConsent',
  description: 'Lists children who have outstanding consent or confirmation requirements',
  category: 'parents',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const offset = filters?.offset || 0;

    let sql = `
      SELECT
        c.id as child_id,
        c.full_name as child_name,
        COALESCE(c.calculated_age, 0) as age,
        e.status,
        e.information_confirmed,
        e.details_confirmed,
        p.full_name as parent_name,
        p.phone_number as parent_phone,
        p.whatsapp_consent_status
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ?
        AND COALESCE(e.is_deleted, 0) = 0 AND COALESCE(c.is_deleted, 0) = 0
        AND (
          COALESCE(e.information_confirmed, 0) = 0
          OR COALESCE(e.details_confirmed, 0) = 0
          OR p.whatsapp_consent_status = 'unknown'
        )
    `;
    const params: any[] = [context.eventId];

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY c.full_name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(sql, params);

    return {
      success: true,
      authorized: true,
      toolName: 'listChildrenWithOutstandingConsent',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const parentTools: OperationalTool[] = [
  getParentSummaryTool,
  listParentsTool,
  listParentsWithIncompleteApplicationsTool,
  listChildrenMissingPickupInfoTool,
  listChildrenMissingPickupPhotosTool,
  listParentsWithMultipleChildrenTool,
  listParentsWithChildrenInsideTool,
  listChildrenMissingGuardianInfoTool,
  listChildrenWithOutstandingConsentTool
];
