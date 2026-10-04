import { query, queryOne } from '../../../db';
import { OperationalTool, ToolContext, ToolFilter, ToolResult } from '../types';

export const getAttendanceSummaryTool: OperationalTool = {
  name: 'getAttendanceSummary',
  description: 'Returns real-time attendance statistics: expected children, checked in, currently inside, and picked up',
  category: 'attendance',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const [selectedRes, checkedInRes, insideRes, pickedUpRes] = await Promise.all([
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out') AND COALESCE(is_deleted, 0) = 0", [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'checked_in' AND COALESCE(is_deleted, 0) = 0", [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'inside' AND COALESCE(is_deleted, 0) = 0", [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('picked_up', 'checked_out') AND COALESCE(is_deleted, 0) = 0", [context.eventId])
    ]);

    const expected = selectedRes?.count || 0;
    const checkedInDirect = checkedInRes?.count || 0;
    const inside = insideRes?.count || 0;
    const pickedUp = pickedUpRes?.count || 0;
    const totalCheckedIn = checkedInDirect + inside + pickedUp; // Total children who arrived
    const currentlyInside = checkedInDirect + inside; // Total currently on site
    const notArrivedYet = Math.max(0, expected - totalCheckedIn);
    const attendancePercentage = expected > 0 ? Math.round((totalCheckedIn / expected) * 100) : 0;

    return {
      success: true,
      authorized: true,
      toolName: 'getAttendanceSummary',
      data: {
        eventId: context.eventId,
        expected,
        checkedIn: totalCheckedIn,
        currentlyInside,
        pickedUp,
        notArrivedYet,
        attendancePercentage
      }
    };
  }
};

export const getAttendanceByAgeGroupTool: OperationalTool = {
  name: 'getAttendanceByAgeGroup',
  description: 'Calculates attendance figures broken down by event age group',
  category: 'attendance',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const ageGroups = await query(
      'SELECT id, label, min_age, max_age FROM event_age_groups WHERE event_id = ? ORDER BY sort_order ASC, min_age ASC',
      [context.eventId]
    );

    const children = await query(`
      SELECT c.calculated_age, c.date_of_birth, e.status
      FROM children c
      JOIN child_event_entries e ON c.id = e.child_id
      WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out')
        AND COALESCE(c.is_deleted, 0) = 0 AND COALESCE(e.is_deleted, 0) = 0
    `, [context.eventId]);

    const results = (ageGroups || []).map((ag: any) => {
      const minAge = ag.min_age ?? 0;
      const maxAge = ag.max_age ?? 999;

      const groupChildren = children.filter((c: any) => {
        let age: number | null = null;
        if (typeof c.calculated_age === 'number' && !isNaN(c.calculated_age)) {
          age = c.calculated_age;
        } else if (c.date_of_birth) {
          const dob = new Date(c.date_of_birth);
          if (!isNaN(dob.getTime())) {
            age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          }
        }
        if (age === null) return false;
        return age >= minAge && age <= maxAge;
      });

      const expected = groupChildren.length;
      const checkedIn = groupChildren.filter((c: any) => ['checked_in', 'inside', 'picked_up', 'checked_out'].includes(c.status)).length;
      const inside = groupChildren.filter((c: any) => ['checked_in', 'inside'].includes(c.status)).length;
      const pickedUp = groupChildren.filter((c: any) => ['picked_up', 'checked_out'].includes(c.status)).length;
      const rate = expected > 0 ? Math.round((checkedIn / expected) * 100) : 0;

      return {
        id: ag.id,
        label: ag.label,
        expected,
        checkedIn,
        inside,
        pickedUp,
        attendanceRate: rate
      };
    });

    return {
      success: true,
      authorized: true,
      toolName: 'getAttendanceByAgeGroup',
      data: results
    };
  }
};

export const getRecentCheckInsTool: OperationalTool = {
  name: 'getRecentCheckIns',
  description: 'Lists the most recent child check-ins with timestamps',
  category: 'attendance',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const rows = await query(`
      SELECT 
        c.id as child_id,
        COALESCE(c.full_name, c.first_name || ' ' || c.last_name) as child_name,
        COALESCE(c.calculated_age, 0) as age,
        e.checked_in_at,
        e.status
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND e.checked_in_at IS NOT NULL AND COALESCE(e.is_deleted, 0) = 0
      ORDER BY e.checked_in_at DESC
      LIMIT ?
    `, [context.eventId, limit]);

    return {
      success: true,
      authorized: true,
      toolName: 'getRecentCheckIns',
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const getRecentPickupsTool: OperationalTool = {
  name: 'getRecentPickups',
  description: 'Lists the most recent child pickups with timestamps',
  category: 'attendance',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const rows = await query(`
      SELECT 
        c.id as child_id,
        COALESCE(c.full_name, c.first_name || ' ' || c.last_name) as child_name,
        COALESCE(c.calculated_age, 0) as age,
        e.picked_up_at,
        e.status
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND e.picked_up_at IS NOT NULL AND COALESCE(e.is_deleted, 0) = 0
      ORDER BY e.picked_up_at DESC
      LIMIT ?
    `, [context.eventId, limit]);

    return {
      success: true,
      authorized: true,
      toolName: 'getRecentPickups',
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const getAttendanceTimelineTool: OperationalTool = {
  name: 'getAttendanceTimeline',
  description: 'Aggregates check-ins and pickups into chronological hourly buckets',
  category: 'attendance',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const rows = await query(`
      SELECT checked_in_at, picked_up_at
      FROM child_event_entries
      WHERE event_id = ? AND (checked_in_at IS NOT NULL OR picked_up_at IS NOT NULL)
        AND COALESCE(is_deleted, 0) = 0
    `, [context.eventId]);

    const hourlyBuckets: Record<string, { hour: string; checkIns: number; pickups: number }> = {};

    for (const r of rows) {
      if (r.checked_in_at) {
        const hour = r.checked_in_at.slice(0, 13) + ':00';
        if (!hourlyBuckets[hour]) hourlyBuckets[hour] = { hour, checkIns: 0, pickups: 0 };
        hourlyBuckets[hour].checkIns++;
      }
      if (r.picked_up_at) {
        const hour = r.picked_up_at.slice(0, 13) + ':00';
        if (!hourlyBuckets[hour]) hourlyBuckets[hour] = { hour, checkIns: 0, pickups: 0 };
        hourlyBuckets[hour].pickups++;
      }
    }

    const sortedTimeline = Object.values(hourlyBuckets).sort((a, b) => a.hour.localeCompare(b.hour));

    return {
      success: true,
      authorized: true,
      toolName: 'getAttendanceTimeline',
      data: sortedTimeline
    };
  }
};

export const attendanceTools: OperationalTool[] = [
  getAttendanceSummaryTool,
  getAttendanceByAgeGroupTool,
  getRecentCheckInsTool,
  getRecentPickupsTool,
  getAttendanceTimelineTool
];
