import { query, queryOne } from '../../../db';
import { OperationalTool, ToolContext, ToolFilter, ToolResult } from '../types';

export const getPassSummaryTool: OperationalTool = {
  name: 'getPassSummary',
  description: 'Returns event pass readiness statistics: active passes, missing passes, and revoked passes',
  category: 'passes',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const [selectedRes, activePassesRes, withoutPassRes] = await Promise.all([
      queryOne(
        "SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out') AND COALESCE(is_deleted, 0) = 0",
        [context.eventId]
      ),
      queryOne(`
        SELECT COUNT(*) as count FROM event_passes p
        JOIN child_event_entries e ON p.child_event_entry_id = e.id
        WHERE e.event_id = ? AND p.status = 'active'
      `, [context.eventId]),
      queryOne(`
        SELECT COUNT(*) as count FROM child_event_entries e
        WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready') AND COALESCE(e.is_deleted, 0) = 0
          AND NOT EXISTS (
            SELECT 1 FROM event_passes p 
            WHERE p.child_event_entry_id = e.id AND p.status = 'active'
          )
      `, [context.eventId])
    ]);

    const totalSelected = selectedRes?.count || 0;
    const activePasses = activePassesRes?.count || 0;
    const selectedWithoutPasses = withoutPassRes?.count || 0;

    return {
      success: true,
      authorized: true,
      toolName: 'getPassSummary',
      data: {
        eventId: context.eventId,
        totalSelected,
        activePasses,
        selectedWithoutPasses
      }
    };
  }
};

export const listPassesByStatusTool: OperationalTool = {
  name: 'listPassesByStatus',
  description: 'Lists digital event passes filtered by status',
  category: 'passes',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const passStatus = filters?.status || 'active';

    const rows = await query(`
      SELECT 
        p.id as pass_id,
        p.pass_code,
        p.status,
        p.issued_at,
        COALESCE(c.full_name, c.first_name || ' ' || c.last_name) as child_name
      FROM event_passes p
      JOIN child_event_entries e ON p.child_event_entry_id = e.id
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND p.status = ?
      ORDER BY p.issued_at DESC
      LIMIT ?
    `, [context.eventId, passStatus, limit]);

    const countRes = await queryOne(`
      SELECT COUNT(*) as total FROM event_passes p
      JOIN child_event_entries e ON p.child_event_entry_id = e.id
      WHERE e.event_id = ? AND p.status = ?
    `, [context.eventId, passStatus]);

    return {
      success: true,
      authorized: true,
      toolName: 'listPassesByStatus',
      totalCount: countRes?.total || 0,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listSelectedChildrenWithoutPassesTool: OperationalTool = {
  name: 'listSelectedChildrenWithoutPasses',
  description: 'Lists selected children who still require an active digital pass',
  category: 'passes',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const rows = await query(`
      SELECT 
        c.id as child_id,
        c.full_name as child_name,
        COALESCE(c.calculated_age, 0) as age,
        e.status,
        p.full_name as parent_name,
        p.phone_number as parent_phone
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready')
        AND COALESCE(e.is_deleted, 0) = 0
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
      toolName: 'listSelectedChildrenWithoutPasses',
      totalCount: countRes?.total || 0,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const passTools: OperationalTool[] = [
  getPassSummaryTool,
  listPassesByStatusTool,
  listSelectedChildrenWithoutPassesTool
];
