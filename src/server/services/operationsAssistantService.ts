import { query, queryOne } from '../db';
import { getCurrentEvent, getCurrentEventId, getEventById, EventRow } from './eventService';

export type ReadinessCategory = 'READY' | 'NEEDS ATTENTION' | 'NOT READY';
export type AttentionSeverity = 'info' | 'attention' | 'urgent';

export interface AttentionItem {
  id: string;
  title: string;
  explanation: string;
  severity: AttentionSeverity;
  count?: number;
  actionLabel: string;
  actionRoute: string;
  actionTab: string;
}

export interface AgeGroupCapacityItem {
  id: string;
  label: string;
  minAge: number;
  maxAge: number;
  capacity: number;
  selectedCount: number;
  percentageFilled: number;
  isNearCapacity: boolean; // >= 90%
  isAtOrOverCapacity: boolean; // >= 100%
}

export interface DutyLocationCoverageItem {
  id: string;
  name: string;
  shortName?: string;
  targetVolunteerCapacity: number;
  assignedVolunteersCount: number;
  activePresenceCount: number;
  isUnderstaffed: boolean;
  hasNoVolunteers: boolean;
}

export interface EventReadinessReport {
  event: {
    id: string;
    title: string;
    status: string;
    startsAt?: string;
    endsAt?: string;
    capacity: number | null;
    placesRemaining: number | null;
    registrationClosesAt: string | null;
    volunteerRegistrationClosesAt: string | null;
  } | null;
  readinessStatus: ReadinessCategory;
  readinessReasons: string[];
  metrics: {
    registrations: number;
    selectedChildren: number;
    eventChildCapacity: number | null;
    placesRemaining: number | null;
    checkedIn: number;
    pickedUp: number;
    approvedVolunteers: number;
    volunteersAssigned: number;
    volunteersOnDuty: number;
    dutyLocations: number;
    locationsBelowTarget: number;
    selectedChildrenWithoutPasses: number;
    openSafetyNotices: number;
    unresolvedEscalations: number;
    registrationClosingDate: string | null;
  };
  needsAttention: AttentionItem[];
  automationTriggers: string[];
  lastUpdated: string;
}

import { operationsQueryPlanner } from './operations/queryPlanner';
import { operationsActionRegistry, ActionExecutionResult } from './operations/actions';
import type { GroundedQueryResult } from './operations/types';

export type { GroundedQueryResult, ActionExecutionResult };

export class OperationsAssistantService {
  /**
   * Resolves the target event strictly: uses eventId if provided and valid,
   * otherwise resolves exclusively via getCurrentEvent().
   * NEVER falls back to arbitrary latest date or non-active events.
   */
  async resolveTargetEvent(eventId?: string): Promise<EventRow | null> {
    if (eventId && eventId.trim() !== '') {
      return await getEventById(eventId.trim());
    }
    return await getCurrentEvent();
  }

  /**
   * 1. Registration Summary for an event
   */
  async getRegistrationSummary(eventId: string) {
    const event = await getEventById(eventId);
    const [totalRes, underReviewRes, selectedRes, declinedRes] = await Promise.all([
      queryOne('SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND COALESCE(is_deleted, 0) = 0', [eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('under_review', 'pending_review') AND COALESCE(is_deleted, 0) = 0", [eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out') AND COALESCE(is_deleted, 0) = 0", [eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('declined', 'cancelled', 'removed') AND COALESCE(is_deleted, 0) = 0", [eventId])
    ]);

    const total = totalRes?.count || 0;
    const underReview = underReviewRes?.count || 0;
    const selected = selectedRes?.count || 0;
    const declined = declinedRes?.count || 0;
    const capacity = (event?.capacity && event.capacity > 0) ? event.capacity : null;
    const placesRemaining = capacity !== null ? Math.max(0, capacity - selected) : null;

    const closingDate = event?.parent_access_closes_at || null;
    let isClosingSoon = false;
    let isRegistrationClosed = false;

    if (closingDate) {
      const closingTime = new Date(closingDate).getTime();
      const diffMs = closingTime - Date.now();
      if (diffMs <= 0) {
        isRegistrationClosed = true;
      } else if (diffMs < 24 * 60 * 60 * 1000) {
        isClosingSoon = true;
      }
    }

    return {
      eventId,
      total,
      underReview,
      selected,
      declined,
      capacity,
      placesRemaining,
      closingDate,
      isClosingSoon,
      isRegistrationClosed
    };
  }

  /**
   * 2. Selection Summary
   */
  async getSelectionSummary(eventId: string) {
    const [selectedRes, pendingRes] = await Promise.all([
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out') AND COALESCE(is_deleted, 0) = 0", [eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('under_review', 'pending_review') AND COALESCE(is_deleted, 0) = 0", [eventId])
    ]);

    const selectedCount = selectedRes?.count || 0;
    const pendingReviewCount = pendingRes?.count || 0;

    return {
      eventId,
      selectedCount,
      pendingReviewCount
    };
  }

  /**
   * 3. Age Group Capacity Summary
   */
  async getAgeGroupCapacitySummary(eventId: string): Promise<AgeGroupCapacityItem[]> {
    const ageGroups = await query(
      'SELECT id, label, min_age, max_age, capacity FROM event_age_groups WHERE event_id = ? ORDER BY sort_order ASC, min_age ASC',
      [eventId]
    );

    if (!ageGroups || ageGroups.length === 0) {
      return [];
    }

    const childrenData = await query(`
      SELECT c.calculated_age, c.date_of_birth, c.age_group, e.status
      FROM children c
      JOIN child_event_entries e ON c.id = e.child_id
      WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out')
        AND COALESCE(c.is_deleted, 0) = 0 AND COALESCE(e.is_deleted, 0) = 0
    `, [eventId]);

    return ageGroups.map((g: any) => {
      const minAge = g.min_age ?? 0;
      const maxAge = g.max_age ?? 999;
      const capacity = g.capacity || 0;

      const matchingChildren = childrenData.filter((c: any) => {
        let age: number | null = null;
        if (typeof c.calculated_age === 'number' && !isNaN(c.calculated_age)) {
          age = c.calculated_age;
        } else if (c.date_of_birth) {
          const dob = new Date(c.date_of_birth);
          if (!isNaN(dob.getTime())) {
            const ageDiff = Date.now() - dob.getTime();
            age = Math.floor(ageDiff / (365.25 * 24 * 60 * 60 * 1000));
          }
        }
        if (age === null) return false;
        return age >= minAge && age <= maxAge;
      });

      const selectedCount = matchingChildren.length;
      const percentageFilled = capacity > 0 ? Math.round((selectedCount / capacity) * 100) : 0;

      return {
        id: g.id,
        label: g.label,
        minAge,
        maxAge,
        capacity,
        selectedCount,
        percentageFilled,
        isNearCapacity: capacity > 0 && percentageFilled >= 90 && percentageFilled < 100,
        isAtOrOverCapacity: capacity > 0 && percentageFilled >= 100
      };
    });
  }

  /**
   * 4. Attendance Summary
   */
  async getAttendanceSummary(eventId: string) {
    const [checkedInRes, pickedUpRes, insideRes] = await Promise.all([
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'checked_in' AND COALESCE(is_deleted, 0) = 0", [eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('picked_up', 'checked_out') AND COALESCE(is_deleted, 0) = 0", [eventId]),
      queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'inside' AND COALESCE(is_deleted, 0) = 0", [eventId])
    ]);

    const checkedIn = checkedInRes?.count || 0;
    const pickedUp = pickedUpRes?.count || 0;
    const inside = insideRes?.count || 0;

    return {
      eventId,
      checkedIn: checkedIn + inside,
      pickedUp,
      inside
    };
  }

  /**
   * 5. Volunteer Summary
   */
  async getVolunteerSummary(eventId: string) {
    const [approvedRes, assignedRes, onDutyRes] = await Promise.all([
      queryOne("SELECT COUNT(*) as count FROM volunteer_profiles WHERE status IN ('approved', 'active')"),
      queryOne("SELECT COUNT(DISTINCT user_id) as count FROM event_duty_assignments WHERE event_id = ? AND status != 'cancelled'", [eventId]),
      queryOne("SELECT COUNT(*) as count FROM user_duty_status WHERE on_duty = 1 AND assigned_event_id = ?", [eventId])
    ]);

    const approvedVolunteers = approvedRes?.count || 0;
    const volunteersAssigned = assignedRes?.count || 0;
    const volunteersOnDuty = onDutyRes?.count || 0;

    return {
      eventId,
      approvedVolunteers,
      volunteersAssigned,
      volunteersOnDuty
    };
  }

  /**
   * 6. Duty Coverage & Location Staffing
   */
  async getDutyCoverage(eventId: string): Promise<{
    locations: DutyLocationCoverageItem[];
    totalLocations: number;
    understaffedCount: number;
    unassignedCount: number;
    volunteersWithoutPresenceCount: number;
  }> {
    const locations = await query(
      'SELECT id, name, short_name, volunteer_capacity FROM event_locations WHERE event_id = ? AND is_active = 1 ORDER BY sort_order ASC, name ASC',
      [eventId]
    );

    const assignments = await query(
      'SELECT id, user_id, assigned_location_id, responsibility_key, team_key FROM event_duty_assignments WHERE event_id = ? AND status != \'cancelled\'',
      [eventId]
    );

    const activePresence = await query(
      'SELECT DISTINCT user_id, event_location_id FROM event_duty_location_presence WHERE event_id = ? AND ended_at IS NULL',
      [eventId]
    );

    const assignedUserIds = new Set<string>();
    const presentUserIds = new Set<string>(activePresence.map((p: any) => p.user_id));

    let understaffedCount = 0;
    let unassignedCount = 0;

    const locationItems: DutyLocationCoverageItem[] = locations.map((loc: any) => {
      const targetVolunteerCapacity = loc.volunteer_capacity || 0;

      // Match assignments directly by assigned_location_id, or fallback by responsibility_key
      const locAssignments = assignments.filter(
        (a: any) => a.assigned_location_id === loc.id || a.responsibility_key === loc.id
      );

      locAssignments.forEach((a: any) => assignedUserIds.add(a.user_id));

      const assignedVolunteersCount = locAssignments.length;

      const locPresence = activePresence.filter((p: any) => p.event_location_id === loc.id);
      const activePresenceCount = locPresence.length;

      const isUnderstaffed = targetVolunteerCapacity > 0 && assignedVolunteersCount < targetVolunteerCapacity;
      const hasNoVolunteers = assignedVolunteersCount === 0;

      if (isUnderstaffed) understaffedCount++;
      if (hasNoVolunteers) unassignedCount++;

      return {
        id: loc.id,
        name: loc.name,
        shortName: loc.short_name || loc.name,
        targetVolunteerCapacity,
        assignedVolunteersCount,
        activePresenceCount,
        isUnderstaffed,
        hasNoVolunteers
      };
    });

    // Count assigned volunteers who have no active check-in/presence
    let volunteersWithoutPresenceCount = 0;
    assignedUserIds.forEach((uid) => {
      if (!presentUserIds.has(uid)) {
        volunteersWithoutPresenceCount++;
      }
    });

    return {
      locations: locationItems,
      totalLocations: locations.length,
      understaffedCount,
      unassignedCount,
      volunteersWithoutPresenceCount
    };
  }

  /**
   * 7. Pass Readiness
   */
  async getPassReadiness(eventId: string) {
    const [selectedTotalRes, withoutPassRes] = await Promise.all([
      queryOne(
        "SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out') AND COALESCE(is_deleted, 0) = 0",
        [eventId]
      ),
      queryOne(`
        SELECT COUNT(*) as count FROM child_event_entries e
        WHERE e.event_id = ? AND e.status = 'selected' AND COALESCE(e.is_deleted, 0) = 0
          AND NOT EXISTS (
            SELECT 1 FROM event_passes p 
            WHERE p.child_event_entry_id = e.id AND p.status = 'active'
          )
      `, [eventId])
    ]);

    const totalSelected = selectedTotalRes?.count || 0;
    const selectedWithoutPasses = withoutPassRes?.count || 0;
    const readyPasses = Math.max(0, totalSelected - selectedWithoutPasses);

    return {
      eventId,
      totalSelected,
      readyPasses,
      selectedWithoutPasses
    };
  }

  /**
   * 8. Safety Summary
   */
  async getSafetySummary(eventId: string) {
    const [openAlertsRes, urgentAlertsRes, openIncidentsRes] = await Promise.all([
      queryOne("SELECT COUNT(*) as count FROM event_safety_alerts WHERE event_id = ? AND status != 'resolved'", [eventId]),
      queryOne("SELECT COUNT(*) as count FROM event_safety_alerts WHERE event_id = ? AND status != 'resolved' AND severity = 'urgent'", [eventId]),
      queryOne("SELECT COUNT(*) as count FROM incident_records WHERE event_id = ? AND status != 'closed'", [eventId])
    ]);

    const openAlerts = openAlertsRes?.count || 0;
    const urgentAlerts = urgentAlertsRes?.count || 0;
    const openIncidents = openIncidentsRes?.count || 0;
    const totalSafetyNotices = openAlerts + openIncidents;

    return {
      eventId,
      openAlerts,
      urgentAlerts,
      openIncidents,
      totalSafetyNotices
    };
  }

  /**
   * 9. Open Escalations
   */
  async getOpenEscalations(eventId: string) {
    const cyclesRes = await queryOne(
      "SELECT COUNT(*) as count FROM escalation_cycles WHERE event_id = ? AND status IN ('scheduled', 'processing', 'open')",
      [eventId]
    );

    const activeCycles = cyclesRes?.count || 0;
    return {
      eventId,
      activeCycles
    };
  }

  /**
   * 10. Event Configuration Gaps
   */
  async getEventConfigurationGaps(eventId: string) {
    const event = await getEventById(eventId);
    const gaps: string[] = [];

    if (!event) {
      return ['Event record not found in system.'];
    }

    if (!event.capacity || event.capacity <= 0) {
      gaps.push('Event child capacity is not configured.');
    }

    if (!event.volunteer_registration_closes_at) {
      gaps.push('No volunteer registration deadline configured.');
    }

    if (!event.parent_access_closes_at) {
      gaps.push('No parent registration closing deadline configured.');
    }

    return gaps;
  }

  /**
   * Combined Event Readiness Evaluation & Deterministic Attention Item Generation
   */
  async getEventReadiness(eventId: string): Promise<EventReadinessReport> {
    const event = await getEventById(eventId);
    const nowIso = new Date().toISOString();

    if (!event) {
      return {
        event: null,
        readinessStatus: 'NOT READY',
        readinessReasons: ['No active event selected.'],
        metrics: {
          registrations: 0,
          selectedChildren: 0,
          eventChildCapacity: null,
          placesRemaining: null,
          checkedIn: 0,
          pickedUp: 0,
          approvedVolunteers: 0,
          volunteersAssigned: 0,
          volunteersOnDuty: 0,
          dutyLocations: 0,
          locationsBelowTarget: 0,
          selectedChildrenWithoutPasses: 0,
          openSafetyNotices: 0,
          unresolvedEscalations: 0,
          registrationClosingDate: null
        },
        needsAttention: [],
        automationTriggers: [],
        lastUpdated: nowIso
      };
    }

    const [
      registrationSummary,
      selectionSummary,
      ageGroupSummary,
      attendanceSummary,
      volunteerSummary,
      dutyCoverage,
      passReadiness,
      safetySummary,
      escalationsSummary,
      configGaps
    ] = await Promise.all([
      this.getRegistrationSummary(eventId),
      this.getSelectionSummary(eventId),
      this.getAgeGroupCapacitySummary(eventId),
      this.getAttendanceSummary(eventId),
      this.getVolunteerSummary(eventId),
      this.getDutyCoverage(eventId),
      this.getPassReadiness(eventId),
      this.getSafetySummary(eventId),
      this.getOpenEscalations(eventId),
      this.getEventConfigurationGaps(eventId)
    ]);

    const attentionItems: AttentionItem[] = [];
    const automationTriggers: string[] = [];
    const readinessReasons: string[] = [];

    // Deterministic Rule 1: Registration closing in less than 24 hours
    if (registrationSummary.isClosingSoon) {
      attentionItems.push({
        id: 'reg-closing-soon',
        title: 'Parent registration closing soon',
        explanation: 'Registration closes in less than 24 hours. Review final incoming registrations.',
        severity: 'attention',
        actionLabel: 'Review registrations',
        actionRoute: '/admin/applications',
        actionTab: 'applications'
      });
      automationTriggers.push('REGISTRATION_NEAR_CLOSING');
    }

    // Deterministic Rule 2: Age groups near or at capacity (>= 90%)
    for (const ag of ageGroupSummary) {
      if (ag.isAtOrOverCapacity) {
        attentionItems.push({
          id: `ag-at-capacity-${ag.id}`,
          title: `${ag.label} reached capacity`,
          explanation: `${ag.selectedCount} children selected out of ${ag.capacity} spaces (${ag.percentageFilled}% filled).`,
          severity: 'attention',
          count: ag.selectedCount,
          actionLabel: 'Review capacity',
          actionRoute: '/admin/events',
          actionTab: 'events'
        });
        automationTriggers.push('AGE_GROUP_NEAR_CAPACITY');
      } else if (ag.isNearCapacity) {
        attentionItems.push({
          id: `ag-near-capacity-${ag.id}`,
          title: `${ag.label} nearing capacity`,
          explanation: `${ag.selectedCount} of ${ag.capacity} spaces selected (${ag.percentageFilled}% filled).`,
          severity: 'info',
          count: ag.selectedCount,
          actionLabel: 'View age groups',
          actionRoute: '/admin/events',
          actionTab: 'events'
        });
        automationTriggers.push('AGE_GROUP_NEAR_CAPACITY');
      }
    }

    // Deterministic Rule 3: Selected children without passes
    if (passReadiness.selectedWithoutPasses > 0) {
      attentionItems.push({
        id: 'selected-without-passes',
        title: `${passReadiness.selectedWithoutPasses} selected children need passes`,
        explanation: `${passReadiness.selectedWithoutPasses} children have been selected but do not have active digital passes issued.`,
        severity: 'attention',
        count: passReadiness.selectedWithoutPasses,
        actionLabel: 'Open children list',
        actionRoute: '/admin/children',
        actionTab: 'children'
      });
      automationTriggers.push('PASS_NOT_READY');
      readinessReasons.push(`${passReadiness.selectedWithoutPasses} selected children do not have passes`);
    }

    // Deterministic Rule 4: Duty locations with no assigned volunteers
    const unassignedLocations = dutyCoverage.locations.filter((l) => l.hasNoVolunteers);
    for (const loc of unassignedLocations) {
      attentionItems.push({
        id: `loc-unassigned-${loc.id}`,
        title: `${loc.name} has no assigned volunteers`,
        explanation: `0 volunteers assigned to this active location (target is ${loc.targetVolunteerCapacity || 1}).`,
        severity: 'urgent',
        actionLabel: 'Assign volunteers',
        actionRoute: '/admin/operations',
        actionTab: 'operations'
      });
      readinessReasons.push(`${loc.name} has no assigned volunteers`);
    }

    // Deterministic Rule 5: Duty locations understaffed
    const understaffedWithSome = dutyCoverage.locations.filter((l) => l.isUnderstaffed && !l.hasNoVolunteers);
    for (const loc of understaffedWithSome) {
      attentionItems.push({
        id: `loc-understaffed-${loc.id}`,
        title: `${loc.name} needs volunteers`,
        explanation: `${loc.assignedVolunteersCount} volunteers assigned. Volunteer capacity target is ${loc.targetVolunteerCapacity}.`,
        severity: 'attention',
        count: loc.assignedVolunteersCount,
        actionLabel: 'Open Event Duty',
        actionRoute: '/admin/operations',
        actionTab: 'operations'
      });
      automationTriggers.push('LOCATION_UNDERSTAFFED');
      readinessReasons.push(`${loc.name} is understaffed (${loc.assignedVolunteersCount}/${loc.targetVolunteerCapacity})`);
    }

    // Deterministic Rule 6: Volunteer assigned but no report-for-duty presence
    if (dutyCoverage.volunteersWithoutPresenceCount > 0 && volunteerSummary.volunteersOnDuty > 0) {
      attentionItems.push({
        id: 'volunteers-no-presence',
        title: `${dutyCoverage.volunteersWithoutPresenceCount} assigned volunteers not on duty`,
        explanation: `${dutyCoverage.volunteersWithoutPresenceCount} volunteers have duty assignments but have not checked in on-site.`,
        severity: 'info',
        count: dutyCoverage.volunteersWithoutPresenceCount,
        actionLabel: 'View Event Duty',
        actionRoute: '/admin/operations',
        actionTab: 'operations'
      });
      automationTriggers.push('VOLUNTEER_NO_SHOW');
    }

    // Deterministic Rule 7: Open incident / safety notices
    if (safetySummary.totalSafetyNotices > 0) {
      const isUrgent = safetySummary.urgentAlerts > 0;
      attentionItems.push({
        id: 'safety-notices-open',
        title: `${safetySummary.totalSafetyNotices} open safety notice${safetySummary.totalSafetyNotices > 1 ? 's' : ''}`,
        explanation: `${safetySummary.openAlerts} active care alert${safetySummary.openAlerts === 1 ? '' : 's'} and ${safetySummary.openIncidents} open incident record${safetySummary.openIncidents === 1 ? '' : 's'}.`,
        severity: isUrgent ? 'urgent' : 'attention',
        count: safetySummary.totalSafetyNotices,
        actionLabel: 'Review incidents',
        actionRoute: '/admin/incidents',
        actionTab: 'incidents'
      });
      automationTriggers.push('SAFETY_ITEM_OPEN');
      readinessReasons.push(
        `${safetySummary.totalSafetyNotices} safety notice${safetySummary.totalSafetyNotices > 1 ? 's remain' : ' remains'} open`
      );
    }

    // Deterministic Rule 8: Unresolved escalations
    if (escalationsSummary.activeCycles > 0) {
      attentionItems.push({
        id: 'unresolved-escalations',
        title: `${escalationsSummary.activeCycles} active escalation cycle${escalationsSummary.activeCycles > 1 ? 's' : ''}`,
        explanation: 'Automated guardian escalations are currently processing or pending response.',
        severity: 'urgent',
        count: escalationsSummary.activeCycles,
        actionLabel: 'View escalations',
        actionRoute: '/admin/escalations',
        actionTab: 'escalations'
      });
      readinessReasons.push(`${escalationsSummary.activeCycles} unresolved escalation cycle${escalationsSummary.activeCycles > 1 ? 's' : ''}`);
    }

    // Deterministic Rule 9: Configuration gaps
    for (const gap of configGaps) {
      attentionItems.push({
        id: `config-gap-${gap.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        title: 'Event configuration gap',
        explanation: gap,
        severity: 'attention',
        actionLabel: 'Edit event',
        actionRoute: '/admin/events',
        actionTab: 'events'
      });
      readinessReasons.push(gap);
    }

    // Evaluate Readiness Status Category based on transparent rules
    let readinessStatus: ReadinessCategory = 'READY';

    const hasCriticalBlockers =
      !event.capacity ||
      event.capacity <= 0 ||
      escalationsSummary.activeCycles > 0 ||
      safetySummary.urgentAlerts > 0 ||
      dutyCoverage.unassignedCount > 0;

    if (hasCriticalBlockers) {
      readinessStatus = 'NOT READY';
    } else if (readinessReasons.length > 0 || attentionItems.some((i) => i.severity === 'attention')) {
      readinessStatus = 'NEEDS ATTENTION';
    }

    return {
      event: {
        id: event.id,
        title: event.title,
        status: event.status,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        capacity: registrationSummary.capacity,
        placesRemaining: registrationSummary.placesRemaining,
        registrationClosesAt: event.parent_access_closes_at || null,
        volunteerRegistrationClosesAt: event.volunteer_registration_closes_at || null
      },
      readinessStatus,
      readinessReasons,
      metrics: {
        registrations: registrationSummary.total,
        selectedChildren: selectionSummary.selectedCount,
        eventChildCapacity: registrationSummary.capacity,
        placesRemaining: registrationSummary.placesRemaining,
        checkedIn: attendanceSummary.checkedIn,
        pickedUp: attendanceSummary.pickedUp,
        approvedVolunteers: volunteerSummary.approvedVolunteers,
        volunteersAssigned: volunteerSummary.volunteersAssigned,
        volunteersOnDuty: volunteerSummary.volunteersOnDuty,
        dutyLocations: dutyCoverage.totalLocations,
        locationsBelowTarget: dutyCoverage.understaffedCount,
        selectedChildrenWithoutPasses: passReadiness.selectedWithoutPasses,
        openSafetyNotices: safetySummary.totalSafetyNotices,
        unresolvedEscalations: escalationsSummary.activeCycles,
        registrationClosingDate: event.parent_access_closes_at || null
      },
      needsAttention: attentionItems,
      automationTriggers,
      lastUpdated: nowIso
    };
  }

  /**
   * Grounded Natural Language Operational Query Engine (Phase 2)
   * Dispatches queries to the OperationsQueryPlanner with live tools and role-based permissions.
   */
  async processOperationalQuery(
    question: string,
    eventId?: string,
    actor?: any
  ): Promise<GroundedQueryResult> {
    try {
      const event = await this.resolveTargetEvent(eventId);

      if (!event) {
        return {
          answer: "I don't have enough event data to answer that yet.",
          grounded: false,
          intent: 'no_active_event'
        };
      }

      const defaultActor = actor || { id: 'admin-actor', role: 'admin' };
      return await operationsQueryPlanner.planAndExecute(question, event.id, defaultActor);
    } catch (err: any) {
      console.error('Error in processOperationalQuery:', err);
      return {
        answer: "We couldn't get that information right now. Please try again.",
        grounded: false,
        intent: 'error'
      };
    }
  }

  /**
   * Confirms and executes an approved operation with revalidation, authorization, and audit logging (Phase 3A).
   */
  async confirmAction(
    confirmationToken: string,
    eventId?: string,
    actor?: any
  ): Promise<ActionExecutionResult> {
    const event = await this.resolveTargetEvent(eventId);
    if (!event) {
      return {
        success: false,
        actionKey: 'SEND_DUTY_REMINDERS',
        title: 'Action Failed',
        message: "We couldn't resolve the active event for this action.",
        affectedCount: 0,
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        error: 'No active event'
      };
    }

    const defaultActor = actor || { id: 'admin-actor', role: 'admin' };
    return await operationsActionRegistry.confirmAction(confirmationToken, defaultActor, event.id);
  }

  /**
   * Cancels a pending proposed operation.
   */
  cancelAction(confirmationToken: string, actor?: any) {
    const defaultActor = actor || { id: 'admin-actor', role: 'admin' };
    return operationsActionRegistry.cancelAction(confirmationToken, defaultActor);
  }
}

export const operationsAssistantService = new OperationsAssistantService();
