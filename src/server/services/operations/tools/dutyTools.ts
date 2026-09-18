import { query, queryOne } from '../../../db';
import { OperationalTool, ToolContext, ToolFilter, ToolResult } from '../types';

export const getDutySummaryTool: OperationalTool = {
  name: 'getDutySummary',
  description: 'Returns operational duty summary: active locations, assigned volunteers, currently on duty, understaffed locations, and no-shows',
  category: 'duty',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const locations = await query(
      'SELECT id, name, short_name, volunteer_capacity FROM event_locations WHERE event_id = ? AND is_active = 1 ORDER BY sort_order ASC',
      [context.eventId]
    );

    const assignments = await query(
      "SELECT id, user_id, assigned_location_id, responsibility_key FROM event_duty_assignments WHERE event_id = ? AND status != 'cancelled'",
      [context.eventId]
    );

    const activePresence = await query(
      'SELECT DISTINCT user_id, event_location_id FROM event_duty_location_presence WHERE event_id = ? AND ended_at IS NULL',
      [context.eventId]
    );

    const assignedUserIds = new Set<string>(assignments.map((a: any) => a.user_id));
    const presentUserIds = new Set<string>(activePresence.map((p: any) => p.user_id));

    let understaffedLocationsCount = 0;
    let unstaffedLocationsCount = 0;
    let totalTargetCapacity = 0;

    for (const loc of locations) {
      const target = loc.volunteer_capacity || 0;
      totalTargetCapacity += target;

      const locAssignments = assignments.filter(
        (a: any) => a.assigned_location_id === loc.id || a.responsibility_key === loc.id
      );

      if (locAssignments.length === 0) {
        unstaffedLocationsCount++;
      }
      if (target > 0 && locAssignments.length < target) {
        understaffedLocationsCount++;
      }
    }

    let noShowCount = 0;
    assignedUserIds.forEach((uid) => {
      if (!presentUserIds.has(uid)) {
        noShowCount++;
      }
    });

    return {
      success: true,
      authorized: true,
      toolName: 'getDutySummary',
      data: {
        eventId: context.eventId,
        totalLocations: locations.length,
        totalTargetCapacity,
        totalAssigned: assignedUserIds.size,
        totalOnDuty: presentUserIds.size,
        understaffedLocationsCount,
        unstaffedLocationsCount,
        noShowCount
      }
    };
  }
};

export const listVolunteersOnDutyTool: OperationalTool = {
  name: 'listVolunteersOnDuty',
  description: 'Lists all volunteers currently active on duty with location, responsibility, and reported time',
  category: 'duty',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);

    let sql = `
      SELECT DISTINCT
        vp.id as volunteer_id,
        vp.user_id,
        vp.full_name as name,
        COALESCE(el.name, 'Floating / Mobile') as duty_location,
        COALESCE(a.responsibility_key, 'General Duty') as responsibility,
        p.started_at as reported_at,
        'On duty' as status
      FROM event_duty_location_presence p
      JOIN volunteer_profiles vp ON vp.user_id = p.user_id
      LEFT JOIN event_locations el ON el.id = p.event_location_id
      LEFT JOIN event_duty_assignments a ON a.user_id = p.user_id AND a.event_id = p.event_id AND a.status != 'cancelled'
      WHERE p.event_id = ? AND p.ended_at IS NULL
    `;
    const params: any[] = [context.eventId];

    if (filters?.locationId) {
      sql += ` AND p.event_location_id = ?`;
      params.push(filters.locationId);
    } else if (filters?.locationName) {
      sql += ` AND (LOWER(el.name) = LOWER(?) OR LOWER(COALESCE(el.short_name, '')) = LOWER(?))`;
      params.push(filters.locationName, filters.locationName);
    }

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY p.started_at DESC LIMIT ?`;
    params.push(limit);

    const rows = await query(sql, params);

    return {
      success: true,
      authorized: true,
      toolName: 'listVolunteersOnDuty',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listAssignedVolunteersTool: OperationalTool = {
  name: 'listAssignedVolunteers',
  description: 'Lists volunteers assigned to the current event, optionally filtered by duty location',
  category: 'duty',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);

    let sql = `
      SELECT DISTINCT
        vp.id as volunteer_id,
        vp.user_id,
        vp.full_name as name,
        COALESCE(el.name, 'Unspecified Location') as duty_location,
        COALESCE(a.responsibility_key, 'General Duty') as responsibility,
        a.status as assignment_status,
        EXISTS(
          SELECT 1 FROM event_duty_location_presence p 
          WHERE p.user_id = a.user_id AND p.event_id = a.event_id AND p.ended_at IS NULL
        ) as is_currently_present
      FROM event_duty_assignments a
      JOIN volunteer_profiles vp ON vp.user_id = a.user_id
      LEFT JOIN event_locations el ON el.id = a.assigned_location_id
      WHERE a.event_id = ? AND a.status != 'cancelled'
    `;
    const params: any[] = [context.eventId];

    if (filters?.locationId) {
      sql += ` AND a.assigned_location_id = ?`;
      params.push(filters.locationId);
    } else if (filters?.locationName) {
      sql += ` AND (LOWER(el.name) = LOWER(?) OR LOWER(COALESCE(el.short_name, '')) = LOWER(?))`;
      params.push(filters.locationName, filters.locationName);
    }

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY vp.full_name ASC LIMIT ?`;
    params.push(limit);

    const rows = await query(sql, params);

    return {
      success: true,
      authorized: true,
      toolName: 'listAssignedVolunteers',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listLateOrNoShowVolunteersTool: OperationalTool = {
  name: 'listLateOrNoShowVolunteers',
  description: 'Lists volunteers with scheduled duty assignments who have not checked in on-site',
  category: 'duty',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);

    let sql = `
      SELECT DISTINCT
        vp.id as volunteer_id,
        vp.user_id,
        vp.full_name as name,
        vp.phone,
        COALESCE(el.name, 'Unspecified Location') as duty_location,
        COALESCE(a.responsibility_key, 'General Duty') as responsibility,
        'Not checked in' as status
      FROM event_duty_assignments a
      JOIN volunteer_profiles vp ON vp.user_id = a.user_id
      LEFT JOIN event_locations el ON el.id = a.assigned_location_id
      WHERE a.event_id = ? AND a.status != 'cancelled'
        AND NOT EXISTS (
          SELECT 1 FROM event_duty_location_presence p 
          WHERE p.user_id = a.user_id AND p.event_id = a.event_id AND p.ended_at IS NULL
        )
    `;
    const params: any[] = [context.eventId];

    if (filters?.locationName) {
      sql += ` AND (el.name LIKE ? OR el.short_name LIKE ?)`;
      params.push(`%${filters.locationName}%`, `%${filters.locationName}%`);
    }

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const totalCount = countRes?.total || 0;

    sql += ` ORDER BY vp.full_name ASC LIMIT ?`;
    params.push(limit);

    const rows = await query(sql, params);

    return {
      success: true,
      authorized: true,
      toolName: 'listLateOrNoShowVolunteers',
      totalCount,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listDutyLocationsTool: OperationalTool = {
  name: 'listDutyLocations',
  description: 'Lists all active duty locations with volunteer capacity, assigned volunteers, and on-duty counts',
  category: 'duty',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const locations = await query(
      'SELECT id, name, short_name, volunteer_capacity FROM event_locations WHERE event_id = ? AND is_active = 1 ORDER BY sort_order ASC, name ASC',
      [context.eventId]
    );

    const assignments = await query(
      "SELECT id, user_id, assigned_location_id, responsibility_key FROM event_duty_assignments WHERE event_id = ? AND status != 'cancelled'",
      [context.eventId]
    );

    const activePresence = await query(
      'SELECT DISTINCT user_id, event_location_id FROM event_duty_location_presence WHERE event_id = ? AND ended_at IS NULL',
      [context.eventId]
    );

    const data = locations.map((loc: any) => {
      const target = loc.volunteer_capacity || 0;
      const assigned = assignments.filter((a: any) => a.assigned_location_id === loc.id || a.responsibility_key === loc.id).length;
      const onDuty = activePresence.filter((p: any) => p.event_location_id === loc.id).length;
      const gap = Math.max(0, target - assigned);
      let staffingStatus = 'Fully Staffed';
      if (assigned === 0) staffingStatus = 'Unstaffed';
      else if (assigned < target) staffingStatus = 'Understaffed';

      return {
        id: loc.id,
        location: loc.name,
        shortName: loc.short_name,
        targetVolunteerCapacity: target,
        assigned,
        onDuty,
        gap,
        status: staffingStatus
      };
    });

    return {
      success: true,
      authorized: true,
      toolName: 'listDutyLocations',
      displayedCount: data.length,
      data
    };
  }
};

export const getDutyLocationCoverageTool: OperationalTool = {
  name: 'getDutyLocationCoverage',
  description: 'Retrieves coverage details for a specific location by name or ID',
  category: 'duty',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const locName = filters?.locationName || '';
    const locId = filters?.locationId || '';

    let loc: any = null;
    if (locId) {
      loc = await queryOne('SELECT * FROM event_locations WHERE id = ? AND event_id = ?', [locId, context.eventId]);
    } else if (locName) {
      loc = await queryOne(
        'SELECT * FROM event_locations WHERE event_id = ? AND (name LIKE ? OR short_name LIKE ?) LIMIT 1',
        [context.eventId, `%${locName}%`, `%${locName}%`]
      );
    }

    if (!loc) {
      return {
        success: false,
        authorized: true,
        toolName: 'getDutyLocationCoverage',
        error: `Location "${locName || locId}" not found for this event.`
      };
    }

    const assignments = await query(`
      SELECT vp.full_name as name, a.responsibility_key
      FROM event_duty_assignments a
      JOIN volunteer_profiles vp ON vp.user_id = a.user_id
      WHERE a.event_id = ? AND (a.assigned_location_id = ? OR a.responsibility_key = ?) AND a.status != 'cancelled'
    `, [context.eventId, loc.id, loc.id]);

    const present = await query(`
      SELECT vp.full_name as name, p.started_at
      FROM event_duty_location_presence p
      JOIN volunteer_profiles vp ON vp.user_id = p.user_id
      WHERE p.event_id = ? AND p.event_location_id = ? AND p.ended_at IS NULL
    `, [context.eventId, loc.id]);

    const target = loc.volunteer_capacity || 0;
    const assignedCount = assignments.length;
    const onDutyCount = present.length;
    const gap = Math.max(0, target - assignedCount);

    return {
      success: true,
      authorized: true,
      toolName: 'getDutyLocationCoverage',
      data: {
        id: loc.id,
        location: loc.name,
        targetVolunteerCapacity: target,
        assignedCount,
        onDutyCount,
        gap,
        isUnderstaffed: target > 0 && assignedCount < target,
        assignedVolunteers: assignments.map((a: any) => a.name),
        presentVolunteers: present.map((p: any) => p.name)
      }
    };
  }
};

export const listUnderstaffedLocationsTool: OperationalTool = {
  name: 'listUnderstaffedLocations',
  description: 'Lists active locations that have fewer assigned or present volunteers than their capacity target',
  category: 'duty',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const allLocationsRes = await listDutyLocationsTool.execute(context);
    const understaffed = (allLocationsRes.data || []).filter((l: any) => l.gap > 0 || l.assigned < l.targetVolunteerCapacity);

    return {
      success: true,
      authorized: true,
      toolName: 'listUnderstaffedLocations',
      displayedCount: understaffed.length,
      data: understaffed
    };
  }
};

export const dutyTools: OperationalTool[] = [
  getDutySummaryTool,
  listVolunteersOnDutyTool,
  listAssignedVolunteersTool,
  listLateOrNoShowVolunteersTool,
  listDutyLocationsTool,
  getDutyLocationCoverageTool,
  listUnderstaffedLocationsTool
];
