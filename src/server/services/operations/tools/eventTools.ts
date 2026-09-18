import { query, queryOne } from '../../../db';
import { getEventById } from '../../eventService';
import { OperationalTool, ToolContext, ToolFilter, ToolResult } from '../types';

export const getCurrentEventSummaryTool: OperationalTool = {
  name: 'getCurrentEventSummary',
  description: 'Retrieves current event title, operational status, capacity, and core counts',
  category: 'event',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const event = await getEventById(context.eventId);
    if (!event) {
      return { success: false, authorized: true, toolName: 'getCurrentEventSummary', error: 'Event not found' };
    }

    const [regCount, selectedCount, locCount] = await Promise.all([
      queryOne('SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND COALESCE(is_deleted, 0) = 0', [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out') AND COALESCE(is_deleted, 0) = 0", [context.eventId]),
      queryOne('SELECT COUNT(*) as count FROM event_locations WHERE event_id = ? AND is_active = 1', [context.eventId])
    ]);

    const capacity = event.capacity && event.capacity > 0 ? event.capacity : null;
    const selected = selectedCount?.count || 0;
    const placesRemaining = capacity !== null ? Math.max(0, capacity - selected) : null;

    return {
      success: true,
      authorized: true,
      toolName: 'getCurrentEventSummary',
      data: {
        id: event.id,
        title: event.title,
        status: event.status,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        capacity,
        selected,
        placesRemaining,
        registrations: regCount?.count || 0,
        activeLocations: locCount?.count || 0,
        registrationClosesAt: event.parent_access_closes_at || null,
        volunteerRegistrationClosesAt: event.volunteer_registration_closes_at || null
      }
    };
  }
};

export const getEventConfigurationTool: OperationalTool = {
  name: 'getEventConfiguration',
  description: 'Retrieves complete event configuration, deadlines, age group configs, and active locations',
  category: 'event',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const event = await getEventById(context.eventId);
    if (!event) {
      return { success: false, authorized: true, toolName: 'getEventConfiguration', error: 'Event not found' };
    }

    const [ageGroups, locations] = await Promise.all([
      query('SELECT id, label, min_age, max_age, capacity FROM event_age_groups WHERE event_id = ? ORDER BY sort_order ASC, min_age ASC', [context.eventId]),
      query('SELECT id, name, short_name, volunteer_capacity FROM event_locations WHERE event_id = ? AND is_active = 1 ORDER BY sort_order ASC, name ASC', [context.eventId])
    ]);

    return {
      success: true,
      authorized: true,
      toolName: 'getEventConfiguration',
      data: {
        id: event.id,
        title: event.title,
        status: event.status,
        capacity: event.capacity || null,
        parentAccessClosesAt: event.parent_access_closes_at || null,
        volunteerRegistrationClosesAt: event.volunteer_registration_closes_at || null,
        ageGroups: ageGroups || [],
        locations: locations || []
      }
    };
  }
};

export const getRegistrationWindowTool: OperationalTool = {
  name: 'getRegistrationWindow',
  description: 'Retrieves registration window open/close dates and urgency status',
  category: 'event',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const event = await getEventById(context.eventId);
    if (!event) {
      return { success: false, authorized: true, toolName: 'getRegistrationWindow', error: 'Event not found' };
    }

    const parentClosesAt = event.parent_access_closes_at || null;
    const volunteerClosesAt = event.volunteer_registration_closes_at || null;

    let isParentRegistrationClosed = false;
    let isParentRegistrationClosingSoon = false;

    if (parentClosesAt) {
      const closingTime = new Date(parentClosesAt).getTime();
      const diffMs = closingTime - Date.now();
      if (diffMs <= 0) {
        isParentRegistrationClosed = true;
      } else if (diffMs < 24 * 60 * 60 * 1000) {
        isParentRegistrationClosingSoon = true;
      }
    }

    let isVolunteerRegistrationClosed = false;
    if (volunteerClosesAt) {
      const closingTime = new Date(volunteerClosesAt).getTime();
      if (closingTime <= Date.now()) {
        isVolunteerRegistrationClosed = true;
      }
    }

    return {
      success: true,
      authorized: true,
      toolName: 'getRegistrationWindow',
      data: {
        eventId: event.id,
        parentClosesAt,
        volunteerClosesAt,
        isParentRegistrationClosed,
        isParentRegistrationClosingSoon,
        isVolunteerRegistrationClosed
      }
    };
  }
};

export const getEventCapacityTool: OperationalTool = {
  name: 'getEventCapacity',
  description: 'Retrieves total event child capacity, selected count, and places remaining',
  category: 'event',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const event = await getEventById(context.eventId);
    if (!event) {
      return { success: false, authorized: true, toolName: 'getEventCapacity', error: 'Event not found' };
    }

    const selectedRes = await queryOne(
      "SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out') AND COALESCE(is_deleted, 0) = 0",
      [context.eventId]
    );

    const capacity = event.capacity && event.capacity > 0 ? event.capacity : null;
    const selected = selectedRes?.count || 0;
    const placesRemaining = capacity !== null ? Math.max(0, capacity - selected) : null;
    const percentageFilled = capacity && capacity > 0 ? Math.round((selected / capacity) * 100) : null;

    return {
      success: true,
      authorized: true,
      toolName: 'getEventCapacity',
      data: {
        eventId: event.id,
        capacity,
        selected,
        placesRemaining,
        percentageFilled
      }
    };
  }
};

export const eventTools: OperationalTool[] = [
  getCurrentEventSummaryTool,
  getEventConfigurationTool,
  getRegistrationWindowTool,
  getEventCapacityTool
];
