import { query, queryOne } from '../../../db';
import { getEventById } from '../../eventService';
import { OperationalTool, ToolContext, ToolFilter, ToolResult } from '../types';

export const getRecentOperationalActivityTool: OperationalTool = {
  name: 'getRecentOperationalActivity',
  description: 'Retrieves real timestamped operational changes and actions from database records for a specified timeframe',
  category: 'system',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    let cutoffIso: string;
    const now = Date.now();

    if (filters?.timeframe === 'last_hour') {
      cutoffIso = new Date(now - 60 * 60 * 1000).toISOString();
    } else if (filters?.timeframe === 'past_2_hours') {
      cutoffIso = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    } else if (filters?.timeframe === 'today') {
      cutoffIso = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
    } else if (filters?.dateFrom) {
      cutoffIso = filters.dateFrom;
    } else {
      // Default: last 24 hours
      cutoffIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    }

    const [childEntries, passes, presence, alerts] = await Promise.all([
      query(`
        SELECT 
          c.full_name as name,
          e.status,
          e.updated_at,
          'child_status' as type
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        WHERE e.event_id = ? AND e.updated_at >= ?
        ORDER BY e.updated_at DESC
        LIMIT 15
      `, [context.eventId, cutoffIso]),
      query(`
        SELECT 
          c.full_name as name,
          p.issued_at,
          'pass_issued' as type
        FROM event_passes p
        JOIN child_event_entries e ON p.child_event_entry_id = e.id
        JOIN children c ON c.id = e.child_id
        WHERE e.event_id = ? AND p.issued_at >= ?
        ORDER BY p.issued_at DESC
        LIMIT 10
      `, [context.eventId, cutoffIso]),
      query(`
        SELECT 
          vp.full_name as name,
          el.name as location_name,
          p.started_at,
          'duty_reported' as type
        FROM event_duty_location_presence p
        JOIN volunteer_profiles vp ON vp.user_id = p.user_id
        LEFT JOIN event_locations el ON el.id = p.event_location_id
        WHERE p.event_id = ? AND p.started_at >= ?
        ORDER BY p.started_at DESC
        LIMIT 10
      `, [context.eventId, cutoffIso]),
      query(`
        SELECT 
          title,
          severity,
          created_at,
          'safety_alert' as type
        FROM event_safety_alerts
        WHERE event_id = ? AND created_at >= ?
        ORDER BY created_at DESC
        LIMIT 10
      `, [context.eventId, cutoffIso])
    ]);

    const activityList: Array<{
      time: string;
      description: string;
      category: string;
    }> = [];

    for (const ce of childEntries) {
      let desc = `${ce.name} registration updated`;
      if (ce.status === 'checked_in') desc = `${ce.name} checked in`;
      else if (ce.status === 'picked_up') desc = `${ce.name} picked up`;
      else if (ce.status === 'selected') desc = `${ce.name} selected for admission`;
      else if (ce.status === 'under_review') desc = `${ce.name} submitted for review`;
      activityList.push({ time: ce.updated_at, description: desc, category: 'Children' });
    }

    for (const p of passes) {
      activityList.push({ time: p.issued_at, description: `Digital pass issued for ${p.name}`, category: 'Passes' });
    }

    for (const pr of presence) {
      activityList.push({ time: pr.started_at, description: `${pr.name} reported for duty at ${pr.location_name || 'duty post'}`, category: 'Duty' });
    }

    for (const a of alerts) {
      activityList.push({ time: a.created_at, description: `Safety notice raised: ${a.title} (${a.severity})`, category: 'Safety' });
    }

    // Sort descending by time
    activityList.sort((a, b) => b.time.localeCompare(a.time));

    return {
      success: true,
      authorized: true,
      toolName: 'getRecentOperationalActivity',
      totalCount: activityList.length,
      displayedCount: activityList.length,
      data: {
        timeframe: filters?.timeframe || 'custom',
        cutoffIso,
        activities: activityList
      }
    };
  }
};

export const getConfigurationGapsTool: OperationalTool = {
  name: 'getConfigurationGaps',
  description: 'Identifies missing event configuration parameters, unstaffed locations, or unconfigured capacities',
  category: 'system',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const event = await getEventById(context.eventId);
    const gaps: string[] = [];

    if (!event) {
      return { success: false, authorized: true, toolName: 'getConfigurationGaps', error: 'Event not found' };
    }

    if (!event.capacity || event.capacity <= 0) {
      gaps.push('Event child capacity is not configured.');
    }
    if (!event.volunteer_registration_closes_at) {
      gaps.push('Volunteer registration deadline is missing.');
    }
    if (!event.parent_access_closes_at) {
      gaps.push('Parent registration deadline is missing.');
    }

    const unassignedLocs = await query(`
      SELECT el.name FROM event_locations el
      WHERE el.event_id = ? AND el.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM event_duty_assignments a 
          WHERE a.assigned_location_id = el.id AND a.status != 'cancelled'
        )
    `, [context.eventId]);

    for (const loc of unassignedLocs) {
      gaps.push(`Location "${loc.name}" has 0 assigned volunteers.`);
    }

    return {
      success: true,
      authorized: true,
      toolName: 'getConfigurationGaps',
      data: {
        eventId: context.eventId,
        gapsCount: gaps.length,
        gaps
      }
    };
  }
};

export const systemTools: OperationalTool[] = [
  getRecentOperationalActivityTool,
  getConfigurationGapsTool
];
