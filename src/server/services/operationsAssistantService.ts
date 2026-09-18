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

export interface GroundedQueryResult {
  answer: string;
  grounded: boolean;
  intent: string;
  data?: any;
  suggestedQuestions?: string[];
}

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
   * Grounded Natural Language Operational Query Engine
   * Classifies user intent -> executes approved deterministic tool -> returns factual response.
   * If intent is unknown or data is insufficient, returns exact fallback message without hallucination.
   */
  async processOperationalQuery(question: string, eventId?: string): Promise<GroundedQueryResult> {
    const raw = (question || '').trim().toLowerCase();
    const event = await this.resolveTargetEvent(eventId);

    if (!event) {
      return {
        answer: "I don't have enough event data to answer that yet.",
        grounded: false,
        intent: 'no_active_event'
      };
    }

    const eid = event.id;

    // 1. "How many children are selected?" / "selected children"
    if (
      !raw.includes('pass') &&
      ((raw.includes('how many') && raw.includes('selected')) ||
        raw.includes('children selected') ||
        raw.includes('selected count') ||
        raw.includes('number of selected'))
    ) {
      const selection = await this.getSelectionSummary(eid);
      const reg = await this.getRegistrationSummary(eid);
      return {
        answer: `There are ${selection.selectedCount} children selected for "${event.title}" (out of ${reg.total} total registrations).`,
        grounded: true,
        intent: 'selected_children_count',
        data: selection,
        suggestedQuestions: [
          'How many selected children do not have passes?',
          'Which age group is closest to capacity?',
          'How many places are remaining?'
        ]
      };
    }

    // 2. "Which age group is closest to capacity?" / "age group near capacity"
    if (
      raw.includes('closest to capacity') ||
      raw.includes('closest to full') ||
      raw.includes('near capacity') ||
      raw.includes('age group capacity') ||
      raw.includes('which age group')
    ) {
      const groups = await this.getAgeGroupCapacitySummary(eid);
      if (groups.length === 0) {
        return {
          answer: 'No age groups are currently configured for this event.',
          grounded: true,
          intent: 'age_group_capacity',
          data: []
        };
      }

      const sorted = [...groups].sort((a, b) => b.percentageFilled - a.percentageFilled);
      const closest = sorted[0];

      const breakdown = sorted
        .slice(0, 3)
        .map((g) => `${g.label}: ${g.percentageFilled}% (${g.selectedCount}/${g.capacity})`)
        .join(' · ');

      return {
        answer: `${closest.label} is closest to capacity at ${closest.percentageFilled}% (${closest.selectedCount} of ${closest.capacity} spaces selected). Overview: ${breakdown}.`,
        grounded: true,
        intent: 'age_group_capacity',
        data: sorted,
        suggestedQuestions: [
          'How many places are remaining?',
          'How many children are selected?',
          'Is registration still open?'
        ]
      };
    }

    // 3. "How many volunteers are currently on duty?" / "volunteers on duty"
    if (
      (raw.includes('how many') && raw.includes('volunteers') && (raw.includes('on duty') || raw.includes('duty'))) ||
      raw.includes('volunteers on duty') ||
      raw.includes('active volunteers') ||
      raw.includes('who is on duty')
    ) {
      const vol = await this.getVolunteerSummary(eid);
      return {
        answer: `${vol.volunteersOnDuty} volunteer${vol.volunteersOnDuty === 1 ? ' is' : 's are'} currently active on duty. ${vol.volunteersAssigned} total volunteers have scheduled duty assignments for this event.`,
        grounded: true,
        intent: 'volunteers_on_duty',
        data: vol,
        suggestedQuestions: [
          'Which locations need more volunteers?',
          'How many locations are understaffed?',
          'Is the event ready?'
        ]
      };
    }

    // 4. "Which locations need more volunteers?" / "understaffed locations"
    if (
      raw.includes('need more volunteers') ||
      raw.includes('understaffed') ||
      raw.includes('need volunteers') ||
      raw.includes('lacking volunteers') ||
      raw.includes('locations needing volunteers')
    ) {
      const coverage = await this.getDutyCoverage(eid);
      const needing = coverage.locations.filter((l) => l.isUnderstaffed || l.hasNoVolunteers);

      if (needing.length === 0) {
        return {
          answer: `All ${coverage.totalLocations} active duty locations currently meet their volunteer staffing targets.`,
          grounded: true,
          intent: 'locations_needing_volunteers',
          data: coverage,
          suggestedQuestions: ['How many volunteers are currently on duty?', 'Is the event ready?']
        };
      }

      const list = needing
        .map((l) => `${l.name} (${l.assignedVolunteersCount} assigned, target is ${l.targetVolunteerCapacity || 1})`)
        .join(', ');

      return {
        answer: `${needing.length} location${needing.length === 1 ? ' needs' : 's need'} more volunteers: ${list}.`,
        grounded: true,
        intent: 'locations_needing_volunteers',
        data: needing,
        suggestedQuestions: ['How many volunteers are currently on duty?', 'Is the event ready?']
      };
    }

    // 5. "How many selected children do not have passes?" / "without passes" / "passes not ready"
    if (
      (raw.includes('pass') && (
        raw.includes('not have') ||
        raw.includes('without') ||
        raw.includes('no pass') ||
        raw.includes('need pass') ||
        raw.includes('not ready') ||
        raw.includes('missing') ||
        raw.includes('selected')
      )) ||
      raw.includes('missing passes') ||
      raw.includes('passes ready')
    ) {
      const passes = await this.getPassReadiness(eid);
      if (passes.selectedWithoutPasses === 0) {
        return {
          answer: `All ${passes.totalSelected} selected children have active passes ready.`,
          grounded: true,
          intent: 'selected_children_without_passes',
          data: passes,
          suggestedQuestions: ['How many children are selected?', 'Is the event ready?']
        };
      }

      return {
        answer: `${passes.selectedWithoutPasses} selected children do not have ready passes yet (${passes.readyPasses} of ${passes.totalSelected} passes generated).`,
        grounded: true,
        intent: 'selected_children_without_passes',
        data: passes,
        suggestedQuestions: ['How many children are selected?', 'Is the event ready?']
      };
    }

    // 6. "What changed today?" / "recent activity"
    if (raw.includes('what changed today') || raw.includes('activity today') || raw.includes('changes today')) {
      const todayPrefix = new Date().toISOString().slice(0, 10);
      const [todayRegRes, todayPassRes, todayAlertRes] = await Promise.all([
        queryOne(
          'SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND created_at LIKE ? AND COALESCE(is_deleted, 0) = 0',
          [eid, `${todayPrefix}%`]
        ),
        queryOne(
          `SELECT COUNT(*) as count FROM event_passes p
           JOIN child_event_entries e ON p.child_event_entry_id = e.id
           WHERE e.event_id = ? AND p.issued_at LIKE ?`,
          [eid, `${todayPrefix}%`]
        ),
        queryOne(
          'SELECT COUNT(*) as count FROM event_safety_alerts WHERE event_id = ? AND created_at LIKE ?',
          [eid, `${todayPrefix}%`]
        )
      ]);

      const todayReg = todayRegRes?.count || 0;
      const todayPass = todayPassRes?.count || 0;
      const todayAlert = todayAlertRes?.count || 0;

      return {
        answer: `Today: ${todayReg} child registration${todayReg === 1 ? ' was' : 's were'} recorded, ${todayPass} pass${todayPass === 1 ? ' was' : 'es were'} issued, and ${todayAlert} safety alert${todayAlert === 1 ? ' was' : 's were'} created.`,
        grounded: true,
        intent: 'what_changed_today',
        data: { todayReg, todayPass, todayAlert, date: todayPrefix },
        suggestedQuestions: ['How many children are selected?', 'Is registration still open?']
      };
    }

    // 7. "Is registration still open?" / "registration deadline" / "when does registration close"
    if (
      raw.includes('registration open') ||
      raw.includes('registration still open') ||
      raw.includes('registration close') ||
      raw.includes('when does registration')
    ) {
      const reg = await this.getRegistrationSummary(eid);
      if (reg.isRegistrationClosed) {
        return {
          answer: `Registration is currently closed. It closed on ${new Date(reg.closingDate!).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
          grounded: true,
          intent: 'registration_status',
          data: reg
        };
      }

      if (reg.closingDate) {
        const d = new Date(reg.closingDate);
        return {
          answer: `Parent registration is currently open and scheduled to close on ${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
          grounded: true,
          intent: 'registration_status',
          data: reg,
          suggestedQuestions: ['How many places are remaining?', 'How many children are selected?']
        };
      }

      return {
        answer: 'Parent registration is currently open, but no closing deadline is set in the event configuration.',
        grounded: true,
        intent: 'registration_status',
        data: reg
      };
    }

    // 8. "How many places are remaining?" / "capacity remaining"
    if (
      raw.includes('places remaining') ||
      raw.includes('places are remaining') ||
      raw.includes('remaining capacity') ||
      raw.includes('remaining spaces')
    ) {
      const reg = await this.getRegistrationSummary(eid);
      if (reg.capacity === null) {
        return {
          answer: 'Event child capacity is not currently configured, so places remaining cannot be determined.',
          grounded: true,
          intent: 'event_capacity_remaining',
          data: reg
        };
      }

      return {
        answer: `There are ${reg.placesRemaining} places remaining for "${event.title}" (${reg.selected} of ${reg.capacity} capacity filled).`,
        grounded: true,
        intent: 'event_capacity_remaining',
        data: reg,
        suggestedQuestions: ['Which age group is closest to capacity?', 'How many children are selected?']
      };
    }

    // 9. "Are there any open safety notices?" / "safety alerts"
    if (
      raw.includes('safety notice') ||
      raw.includes('safety alerts') ||
      raw.includes('open alerts') ||
      raw.includes('escalations')
    ) {
      const safety = await this.getSafetySummary(eid);
      const escalations = await this.getOpenEscalations(eid);

      if (safety.totalSafetyNotices === 0 && escalations.activeCycles === 0) {
        return {
          answer: 'There are currently 0 open safety notices and 0 active escalation cycles.',
          grounded: true,
          intent: 'safety_summary',
          data: { safety, escalations }
        };
      }

      return {
        answer: `There ${safety.totalSafetyNotices === 1 ? 'is' : 'are'} ${safety.totalSafetyNotices} open safety notice${safety.totalSafetyNotices === 1 ? '' : 's'} (${safety.openAlerts} alert${safety.openAlerts === 1 ? '' : 's'}, ${safety.openIncidents} incident${safety.openIncidents === 1 ? '' : 's'}) and ${escalations.activeCycles} active escalation cycle${escalations.activeCycles === 1 ? '' : 's'}.`,
        grounded: true,
        intent: 'safety_summary',
        data: { safety, escalations }
      };
    }

    // 10. "Is the event ready?" / "readiness status"
    if (raw.includes('is the event ready') || raw.includes('event readiness') || raw.includes('are we ready')) {
      const readiness = await this.getEventReadiness(eid);
      const reasons = readiness.readinessReasons.length > 0
        ? ` Items needing resolution: ${readiness.readinessReasons.join('; ')}.`
        : ' All criteria are satisfied.';

      return {
        answer: `Event readiness status is ${readiness.readinessStatus}.${reasons}`,
        grounded: true,
        intent: 'event_readiness_status',
        data: readiness,
        suggestedQuestions: [
          'Which locations need more volunteers?',
          'How many selected children do not have passes?'
        ]
      };
    }

    // Fallback for unsupported or ambiguous questions: ZERO HALLUCINATION
    return {
      answer: "I don't have enough event data to answer that yet.",
      grounded: false,
      intent: 'unsupported_query',
      suggestedQuestions: [
        'How many children are selected?',
        'Which age group is closest to capacity?',
        'How many volunteers are currently on duty?',
        'Which locations need more volunteers?',
        'How many selected children do not have passes?',
        'What changed today?',
        'Is registration still open?'
      ]
    };
  }
}

export const operationsAssistantService = new OperationsAssistantService();
