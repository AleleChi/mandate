import { queryOne } from '../db';
import { getCurrentEvent, getEventById } from './eventService';
import { normalizeAgeGroup } from './eligibilityService';

export interface DutyWindowValidationOptions {
  userId?: string;
  userRole?: string;
  eventId?: string;
  operationType?: 'check_in' | 'pickup' | 'lookup' | 'general';
}

export interface DutyWindowValidationResult {
  allowed: boolean;
  code:
    | 'EVENT_NOT_STARTED'
    | 'EVENT_ENDED'
    | 'DUTY_NOT_STARTED'
    | 'DUTY_ENDED'
    | 'DUTY_INACTIVE'
    | 'CHECK_IN_NOT_OPEN'
    | 'CHECK_IN_CLOSED'
    | 'PICKUP_NOT_STARTED'
    | null;
  message: string;
  eventStartsAt?: string;
  eventEndsAt?: string;
  dutyStartsAt?: string;
  dutyEndsAt?: string;
  testingAccessActive?: boolean;
  testingAccessExpiresAt?: string | null;
}

export interface EventTestOverrideStatus {
  active: boolean;
  enabled: boolean;
  expiresAt: string | null;
  enabledBy: string | null;
  enabledAt: string | null;
  eventId: string | null;
}

export async function getEventOperationsTestOverrideStatus(eventId?: string): Promise<EventTestOverrideStatus> {
  let event: any = null;
  if (eventId) {
    event = await getEventById(eventId);
  }
  if (!event) {
    event = await getCurrentEvent();
  }
  if (!event) {
    return {
      active: false,
      enabled: false,
      expiresAt: null,
      enabledBy: null,
      enabledAt: null,
      eventId: null
    };
  }

  const enabled = Number(event.operations_test_override_enabled) === 1;
  const expiresAt = event.operations_test_override_expires_at ? String(event.operations_test_override_expires_at) : null;
  const enabledBy = event.operations_test_override_enabled_by ? String(event.operations_test_override_enabled_by) : null;
  const enabledAt = event.operations_test_override_enabled_at ? String(event.operations_test_override_enabled_at) : null;

  if (!enabled) {
    return {
      active: false,
      enabled: false,
      expiresAt,
      enabledBy,
      enabledAt,
      eventId: event.id
    };
  }

  // If enabled, check if expiresAt has passed
  if (expiresAt) {
    const expiresMs = parseBoundTimestamp(expiresAt, true);
    if (expiresMs !== null && Date.now() >= expiresMs) {
      return {
        active: false,
        enabled: true,
        expiresAt,
        enabledBy,
        enabledAt,
        eventId: event.id
      };
    }
  }

  return {
    active: true,
    enabled: true,
    expiresAt,
    enabledBy,
    enabledAt,
    eventId: event.id
  };
}

export async function isEventOperationsTestOverrideActive(eventId?: string): Promise<boolean> {
  const status = await getEventOperationsTestOverrideStatus(eventId);
  return status.active;
}

export function parseBoundTimestamp(val: string | null | undefined, isEnd: boolean = false): number | null {
  if (!val) return null;
  const trimmed = String(val).trim();
  if (!trimmed) return null;

  // Pure date YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(isEnd ? `${trimmed}T23:59:59.999Z` : `${trimmed}T00:00:00.000Z`);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d.getTime();
}

export function formatTimeInTz(isoString: string, timeZone?: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timeZone || 'Africa/Lagos'
    });
  } catch {
    return isoString;
  }
}

export function formatDateInTz(isoString: string, timeZone?: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: timeZone || 'Africa/Lagos'
    });
  } catch {
    return isoString;
  }
}

/**
 * Central Time-Guard Helper for Event & Volunteer Duty Windows.
 * Validates:
 * 1. Event Active Window (starts_at, ends_at)
 * 2. Volunteer Duty Window (starts_at, ends_at, status)
 * 3. Daily Operational Hours (check_in_opens_at, check_in_closes_at, pickup_starts_at)
 */
export async function validateVolunteerDutyWindow(
  options: DutyWindowValidationOptions
): Promise<DutyWindowValidationResult> {
  const { userId, userRole, eventId, operationType = 'general' } = options;

  // 1. Role Exemption: Admins and Super Admins are exempt from duty window restrictions (Section 27)
  const normRole = (userRole || '').toLowerCase().trim();
  if (normRole === 'admin' || normRole === 'super_admin') {
    return {
      allowed: true,
      code: null,
      message: ''
    };
  }

  // 2. Resolve Event
  let event: any = null;
  if (eventId) {
    event = await getEventById(eventId);
  }
  if (!event) {
    event = await getCurrentEvent();
  }
  if (!event) {
    return {
      allowed: false,
      code: 'DUTY_INACTIVE',
      message: 'No current event is available.'
    };
  }

  const nowMs = Date.now();
  const tz = event.timezone || 'Africa/Lagos';

  // Check Event Operations Test Override
  const testOverrideStatus = await getEventOperationsTestOverrideStatus(event.id);
  const testOverrideActive = testOverrideStatus.active;

  // 3. Event Window Validation (Section 14, 16, 17) - Bypassed during test override
  if (!testOverrideActive) {
    if (event.starts_at) {
      const eventStartMs = parseBoundTimestamp(event.starts_at, false);
      if (eventStartMs !== null && nowMs < eventStartMs) {
        const datePart = formatDateInTz(event.starts_at, tz);
        const timePart = formatTimeInTz(event.starts_at, tz);
        return {
          allowed: false,
          code: 'EVENT_NOT_STARTED',
          message: `This event has not started yet. Begins ${datePart} · ${timePart}.`,
          eventStartsAt: event.starts_at,
          eventEndsAt: event.ends_at,
          testingAccessActive: false
        };
      }
    }

    if (event.ends_at) {
      const eventEndMs = parseBoundTimestamp(event.ends_at, true);
      if (eventEndMs !== null && nowMs > eventEndMs) {
        return {
          allowed: false,
          code: 'EVENT_ENDED',
          message: 'This event has ended. Check-in and pickup are no longer available.',
          eventStartsAt: event.starts_at,
          eventEndsAt: event.ends_at,
          testingAccessActive: false
        };
      }
    }

    // 4. Operational Window Bounds if configured (Section 21) - Bypassed during test override
    if (operationType === 'check_in') {
      if (event.check_in_opens_at) {
        const opensMs = parseBoundTimestamp(event.check_in_opens_at, false);
        if (opensMs !== null && nowMs < opensMs) {
          const timePart = formatTimeInTz(event.check_in_opens_at, tz);
          return {
            allowed: false,
            code: 'CHECK_IN_NOT_OPEN',
            message: `Check-in is not open yet. Check-in opens at ${timePart}.`,
            testingAccessActive: false
          };
        }
      }
      if (event.check_in_closes_at) {
        const closesMs = parseBoundTimestamp(event.check_in_closes_at, true);
        if (closesMs !== null && nowMs > closesMs) {
          const timePart = formatTimeInTz(event.check_in_closes_at, tz);
          return {
            allowed: false,
            code: 'CHECK_IN_CLOSED',
            message: `Check-in has closed for this event (${timePart}).`,
            testingAccessActive: false
          };
        }
      }
    } else if (operationType === 'pickup') {
      if (event.pickup_starts_at) {
        const pickupStartMs = parseBoundTimestamp(event.pickup_starts_at, false);
        if (pickupStartMs !== null && nowMs < pickupStartMs) {
          const timePart = formatTimeInTz(event.pickup_starts_at, tz);
          return {
            allowed: false,
            code: 'PICKUP_NOT_STARTED',
            message: `Pickup has not started yet. Pickup begins at ${timePart}.`,
            testingAccessActive: false
          };
        }
      }
    }
  }

  // 5. Volunteer Duty Window Validation (Sections 14, 18, 19, 20)
  if (userId) {
    // Check if user is an unscoped lead/staff without duty constraints (Section 28)
    const isUnscopedLeadRole = ['team', 'team_lead', 'lead', 'staff'].includes(normRole);

    const assignment = await queryOne(`
      SELECT id, status, starts_at, ends_at, responsibility_key, assigned_location_id, assigned_age_groups
      FROM event_duty_assignments
      WHERE event_id = ? AND user_id = ?
      ORDER BY 
        CASE WHEN status = 'on_duty' THEN 1
             WHEN status = 'scheduled' THEN 2
             WHEN status = 'temporarily_unavailable' THEN 3
             ELSE 4 END,
        starts_at ASC
      LIMIT 1
    `, [event.id, userId]);

    if (!assignment) {
      // If user is a lead/staff with no specific assignment, preserve unscoped behavior
      if (isUnscopedLeadRole) {
        return {
          allowed: true,
          code: null,
          message: '',
          eventStartsAt: event.starts_at,
          eventEndsAt: event.ends_at,
          testingAccessActive: testOverrideActive,
          testingAccessExpiresAt: testOverrideStatus.expiresAt
        };
      }

      return {
        allowed: false,
        code: 'DUTY_INACTIVE',
        message: 'You do not have an active duty assignment for this event.',
        eventStartsAt: event.starts_at,
        eventEndsAt: event.ends_at,
        testingAccessActive: testOverrideActive,
        testingAccessExpiresAt: testOverrideStatus.expiresAt
      };
    }

    // Check Assignment Status (Section 20) - Always enforced, even with test override
    const assignmentStatus = (assignment.status || '').toLowerCase().trim();
    if (assignmentStatus === 'temporarily_unavailable') {
      return {
        allowed: false,
        code: 'DUTY_INACTIVE',
        message: 'You are currently marked unavailable. Return to duty before processing children.',
        dutyStartsAt: assignment.starts_at,
        dutyEndsAt: assignment.ends_at,
        testingAccessActive: testOverrideActive,
        testingAccessExpiresAt: testOverrideStatus.expiresAt
      };
    }

    if (assignmentStatus === 'cancelled' || assignmentStatus === 'ended') {
      return {
        allowed: false,
        code: 'DUTY_INACTIVE',
        message: 'Your duty assignment is currently inactive.',
        dutyStartsAt: assignment.starts_at,
        dutyEndsAt: assignment.ends_at,
        testingAccessActive: testOverrideActive,
        testingAccessExpiresAt: testOverrideStatus.expiresAt
      };
    }

    // Check Duty Start & End Time (Sections 18, 19) - Bypassed during test override
    if (!testOverrideActive) {
      if (assignment.starts_at) {
        const dutyStartMs = parseBoundTimestamp(assignment.starts_at, false);
        if (dutyStartMs !== null && nowMs < dutyStartMs) {
          const timePart = formatTimeInTz(assignment.starts_at, tz);
          return {
            allowed: false,
            code: 'DUTY_NOT_STARTED',
            message: `Your duty has not started. Your assignment begins at ${timePart}. Check-in and pickup will be available when your duty starts.`,
            dutyStartsAt: assignment.starts_at,
            dutyEndsAt: assignment.ends_at,
            eventStartsAt: event.starts_at,
            eventEndsAt: event.ends_at,
            testingAccessActive: false
          };
        }
      }

      if (assignment.ends_at) {
        const dutyEndMs = parseBoundTimestamp(assignment.ends_at, true);
        if (dutyEndMs !== null && nowMs > dutyEndMs) {
          const timePart = formatTimeInTz(assignment.ends_at, tz);
          return {
            allowed: false,
            code: 'DUTY_ENDED',
            message: `Your duty has ended. Your assigned shift ended at ${timePart}. Contact an event lead if your duty needs to be extended.`,
            dutyStartsAt: assignment.starts_at,
            dutyEndsAt: assignment.ends_at,
            eventStartsAt: event.starts_at,
            eventEndsAt: event.ends_at,
            testingAccessActive: false
          };
        }
      }
    }

    return {
      allowed: true,
      code: null,
      message: '',
      dutyStartsAt: assignment.starts_at,
      dutyEndsAt: assignment.ends_at,
      eventStartsAt: event.starts_at,
      eventEndsAt: event.ends_at,
      testingAccessActive: testOverrideActive,
      testingAccessExpiresAt: testOverrideStatus.expiresAt
    };
  }

  return {
    allowed: true,
    code: null,
    message: '',
    eventStartsAt: event.starts_at,
    eventEndsAt: event.ends_at,
    testingAccessActive: testOverrideActive,
    testingAccessExpiresAt: testOverrideStatus.expiresAt
  };
}

