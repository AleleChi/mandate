import { query, queryOne, execute } from '../db';

/**
 * Proof of concept and standard identifier:
 * data-component-version="event-operations-service-v1"
 * data-component-version="authoritative-operations-data-sources-v1"
 * data-component-version="operations-data-confidence-v1"
 * data-component-version="operations-priority-policy-v1"
 */

export interface ActivityFilter {
  type?: 'all' | 'attendance' | 'volunteers' | 'locations' | 'safety' | 'responses' | 'incidents' | 'follow_ups';
  page?: number;
  limit?: number;
}

export interface OperationsOverviewOptions {
  profile?: 'admin' | 'team_lead' | 'first_aid' | 'security' | 'pickup' | 'safeguarding';
}

export class EventOperationsService {
  /**
   * Main function to retrieve live event operations overview.
   */
  async getEventOperationsOverview(eventId: string, options: OperationsOverviewOptions = {}) {
    // 1. Fetch Event
    const event = await queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!event) {
      return {
        event: null,
        attendance: null,
        volunteers: null,
        devices: null,
        locations: null,
        alerts: [],
        responses: null,
        incidents: null,
        escalations: null,
        priorityItems: [],
        freshness: {
          lastConfirmedAt: new Date().toISOString(),
          message: 'No active event operations',
          confidence: 'Confirmed'
        }
      };
    }

    const eventTimezone = event.timezone || 'UTC';
    const nowStr = new Date().toISOString();

    // 2. Fetch Aggregated Metrics (Authoritative Data Sources)
    const [
      attendance,
      volunteers,
      devices,
      locationsCoverage,
      alerts,
      responses,
      incidents,
      escalations,
      priorityItems
    ] = await Promise.all([
      this.getAttendanceSummary(eventId).catch(err => {
        console.error('getAttendanceSummary failed:', err);
        return { registered: 0, checkedIn: 0, released: 0, notCheckedIn: 0, pickupInProgress: 0, statusNeedingConfirmation: 0, error: true };
      }),
      this.getVolunteerDutySummary(eventId).catch(err => {
        console.error('getVolunteerDutySummary failed:', err);
        return { approvedVolunteers: 0, onDuty: 0, temporarilyUnavailable: 0, onBreak: 0, dutyEnded: 0, coverageGaps: 0, error: true };
      }),
      this.getDeviceReadinessSummary(eventId).catch(err => {
        console.error('getDeviceReadinessSummary failed:', err);
        return { ready: 0, limited: 0, attention: 0, noPush: 0, soundNotUnlocked: 0, error: true };
      }),
      this.getLocationCoverageSummary(eventId).catch(err => {
        console.error('getLocationCoverageSummary failed:', err);
        return { covered: 0, backupOnly: 0, limited: 0, uncovered: 0, capacityWarnings: 0, locations: [], error: true };
      }),
      this.getActiveAlertSummary(eventId).catch(err => {
        console.error('getActiveAlertSummary failed:', err);
        const fallbackAlerts: any = [];
        fallbackAlerts.error = true;
        return fallbackAlerts;
      }),
      this.getResponseCoordinationSummary(eventId).catch(err => {
        console.error('getResponseCoordinationSummary failed:', err);
        return { unacknowledged: 0, inProgress: 0, pendingHandovers: 0, assistanceRequests: 0, error: true };
      }),
      this.getIncidentSummary(eventId).catch(err => {
        console.error('getIncidentSummary failed:', err);
        return { draft: 0, waitingReview: 0, underReview: 0, changesRequested: 0, closed: 0, error: true };
      }),
      this.getEscalationSummary(eventId).catch(err => {
        console.error('getEscalationSummary failed:', err);
        return { activeCycles: 0, backupNotificationsSent: 0, deliveryCoverageIssues: 0, error: true };
      }),
      this.getPriorityAttentionItems(eventId).catch(err => {
        console.error('getPriorityAttentionItems failed:', err);
        const fallbackPriority: any = [];
        fallbackPriority.error = true;
        return fallbackPriority;
      })
    ]);

    // Grouping the result
    const rawResult = {
      success: true,
      event: {
        id: event.id,
        name: event.name,
        status: event.status || 'active',
        startedAt: event.created_at || nowStr,
        timezone: eventTimezone,
        lastUpdatedAt: nowStr
      },
      attendance,
      volunteers,
      devices,
      locations: locationsCoverage,
      alerts,
      responses,
      incidents,
      escalations,
      priorityItems,
      freshness: {
        lastConfirmedAt: nowStr,
        message: 'Last updated just now',
        confidence: 'Confirmed'
      }
    };

    // 3. Serialize based on Role-Aware access profile (Section 35)
    const profile = options.profile || 'admin';
    return this.serializeOverviewForProfile(rawResult, profile);
  }

  /**
   * Section 8 - Attendance and child flow
   */
  private async getAttendanceSummary(eventId: string) {
    // Count child entries
    const [totalRes, checkedInRes, releasedRes, underReviewRes] = await Promise.all([
      queryOne('SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ?', [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('checked_in', 'inside')`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('picked_up', 'checked_out')`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('under_review', 'pending_review')`, [eventId])
    ]);

    const registered = totalRes?.count || 0;
    const checkedIn = checkedInRes?.count || 0;
    const released = releasedRes?.count || 0;
    const underReview = underReviewRes?.count || 0;
    const notCheckedIn = Math.max(0, registered - checkedIn - released);

    // Active pickup alerts
    const activePickupAlerts = await queryOne(`
      SELECT COUNT(*) as count FROM event_safety_alerts 
      WHERE event_id = ? AND category = 'pickup_issue' AND status != 'resolved'
    `, [eventId]);

    return {
      registered,
      checkedIn,
      released,
      notCheckedIn,
      pickupInProgress: activePickupAlerts?.count || 0,
      statusNeedingConfirmation: underReview,
      confidenceWording: 'Confirmed from current event check-in records.'
    };
  }

  /**
   * Section 9 - Volunteer duty summary
   */
  private async getVolunteerDutySummary(eventId: string) {
    // Query event team / duty
    const [totalApproved, activeDuty, unavailableRes, onBreakRes] = await Promise.all([
      queryOne(`SELECT COUNT(*) as count FROM user_duty_status WHERE approved = 1`),
      queryOne(`SELECT COUNT(*) as count FROM user_duty_status WHERE on_duty = 1 AND assigned_event_id = ?`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM event_duty_assignments WHERE event_id = ? AND status = 'temporarily_unavailable'`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM event_duty_assignments WHERE event_id = ? AND status = 'on_break'`, [eventId])
    ]);

    const approvedVolunteers = totalApproved?.count || 0;
    const onDuty = activeDuty?.count || 0;
    const temporarilyUnavailable = unavailableRes?.count || 0;
    const onBreak = onBreakRes?.count || 0;

    // Gaps (unassigned critical roles)
    const gapsRes = await queryOne(`
      SELECT COUNT(*) as count FROM event_locations 
      WHERE event_id = ? AND is_active = 1 AND id NOT IN (
        SELECT DISTINCT event_location_id FROM event_duty_location_presence WHERE event_id = ? AND ended_at IS NULL
      )
    `, [eventId, eventId]);

    return {
      approvedVolunteers,
      onDuty,
      temporarilyUnavailable,
      onBreak,
      dutyEnded: Math.max(0, approvedVolunteers - onDuty - temporarilyUnavailable),
      coverageGaps: gapsRes?.count || 0,
      confidenceWording: 'Based on active duty sign-ins and assignments.'
    };
  }

  /**
   * Section 10 - Device readiness summary
   */
  private async getDeviceReadinessSummary(eventId: string) {
    const [readyRes, limitedRes, attentionRes, noPushRes, soundMutedRes] = await Promise.all([
      queryOne(`SELECT COUNT(*) as count FROM event_duty_devices WHERE readiness_status = 'ready' AND event_id = ?`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM event_duty_devices WHERE readiness_status = 'limited' AND event_id = ?`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM event_duty_devices WHERE readiness_status = 'attention' AND event_id = ?`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM event_duty_devices WHERE (push_subscription_id IS NULL OR push_subscription_id = '') AND event_id = ?`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM event_duty_devices WHERE sound_enabled = 0 AND event_id = ?`, [eventId])
    ]);

    return {
      ready: readyRes?.count || 0,
      limited: limitedRes?.count || 0,
      attention: attentionRes?.count || 0,
      noPush: noPushRes?.count || 0,
      soundNotUnlocked: soundMutedRes?.count || 0,
      confidenceWording: 'Device needs attention? Review Device Readiness for detailed metrics.'
    };
  }

  /**
   * Section 11 - Location coverage overview
   */
  private async getLocationCoverageSummary(eventId: string) {
    const locations = await query('SELECT * FROM event_locations WHERE event_id = ? AND is_active = 1', [eventId]);
    const assignments = await query('SELECT * FROM event_duty_assignments WHERE event_id = ? AND status != \'cancelled\'', [eventId]);
    const activeDuty = await query('SELECT * FROM user_duty_status WHERE on_duty = 1 AND assigned_event_id = ?', [eventId]);
    
    const onDutyUserIds = new Set(activeDuty.map((u: any) => u.user_id));

    let covered = 0;
    let backupOnly = 0;
    let limited = 0;
    let uncovered = 0;
    let capacityWarnings = 0;

    const coverageDetails = [];

    for (const loc of locations) {
      const locAssignments = assignments.filter((a: any) => a.responsibility_key === loc.team_key || a.responsibility_key === loc.age_group_key);
      const activePrimary = locAssignments.filter((a: any) => a.assignment_level === 'primary' && onDutyUserIds.has(a.user_id));
      const activeBackup = locAssignments.filter((a: any) => a.assignment_level === 'backup' && onDutyUserIds.has(a.user_id));

      let status = 'Uncovered';
      if (activePrimary.length > 0) {
        status = 'Covered';
        covered++;
      } else if (activeBackup.length > 0) {
        status = 'Backup-only';
        backupOnly++;
      } else {
        uncovered++;
      }

      // Check capacity warning (Section 32)
      // Count checked-in children who are in this location's age group
      const checkedInInGroup = await queryOne(`
        SELECT COUNT(*) as count FROM child_event_entries cee
        JOIN children c ON cee.child_id = c.id
        WHERE cee.event_id = ? AND cee.status IN ('checked_in', 'inside') AND c.age_group = ?
      `, [eventId, loc.age_group_key]);

      const childCount = checkedInInGroup?.count || 0;
      const isOverCapacity = loc.capacity && childCount > loc.capacity;
      if (isOverCapacity) {
        capacityWarnings++;
      }

      coverageDetails.push({
        id: loc.id,
        name: loc.name,
        shortName: loc.short_name || loc.name,
        status,
        capacity: loc.capacity || 0,
        assignedChildren: childCount,
        isOverCapacity
      });
    }

    return {
      covered,
      backupOnly,
      limited,
      uncovered,
      capacityWarnings,
      locations: coverageDetails,
      confidenceWording: 'Based on assigned and check-in records.'
    };
  }

  /**
   * Section 12 - Active safety requests
   */
  private async getActiveAlertSummary(eventId: string) {
    const alerts = await query(`
      SELECT id, severity, category, status, title, location_label, created_at, owner_user_id, reopened_at
      FROM event_safety_alerts
      WHERE event_id = ? AND status != 'resolved'
      ORDER BY 
        CASE 
          WHEN severity = 'urgent' AND status = 'open' THEN 1
          WHEN severity = 'urgent' AND status = 'acknowledged' THEN 2
          WHEN severity = 'important' AND status = 'open' THEN 3
          WHEN severity = 'normal' AND status = 'open' THEN 4
          ELSE 5
        END ASC, created_at DESC
    `, [eventId]);

    // Populate assistant count
    const enrichedAlerts = await Promise.all(alerts.map(async (a: any) => {
      const assistantsRes = await queryOne('SELECT COUNT(*) as count FROM alert_response_assignments WHERE alert_id = ? AND assignment_status = \'active\'', [a.id]);
      const handoversRes = await queryOne('SELECT COUNT(*) as count FROM alert_handover_requests WHERE alert_id = ? AND status = \'pending\'', [a.id]);
      
      let ownerName = 'Unassigned';
      if (a.owner_user_id) {
        const u = await queryOne(`
          SELECT full_name FROM (
            SELECT full_name FROM volunteer_profiles WHERE user_id = ?
            UNION ALL
            SELECT full_name FROM parent_profiles WHERE user_id = ?
          ) as names LIMIT 1
        `, [a.owner_user_id, a.owner_user_id]);
        if (u) ownerName = u.full_name;
      }

      return {
        id: a.id,
        severity: a.severity,
        category: a.category,
        title: a.title,
        location: a.location_label || 'Unknown',
        status: a.status,
        createdAt: a.created_at,
        reopenedAt: a.reopened_at,
        ownerName,
        assistantCount: assistantsRes?.count || 0,
        hasPendingHandover: (handoversRes?.count || 0) > 0
      };
    }));

    return enrichedAlerts;
  }

  /**
   * Section 13 - Response coordination summary
   */
  private async getResponseCoordinationSummary(eventId: string) {
    const [unacknowledged, progressRes, handoversRes, assistanceRes] = await Promise.all([
      queryOne(`SELECT COUNT(*) as count FROM event_safety_alerts WHERE event_id = ? AND status = 'open'`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM event_safety_alerts WHERE event_id = ? AND status = 'acknowledged'`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM alert_handover_requests WHERE status = 'pending'`),
      queryOne(`SELECT COUNT(*) as count FROM event_safety_alerts WHERE event_id = ? AND status = 'open' AND category = 'location_support'`, [eventId])
    ]);

    return {
      unacknowledged: unacknowledged?.count || 0,
      inProgress: progressRes?.count || 0,
      pendingHandovers: handoversRes?.count || 0,
      assistanceRequests: assistanceRes?.count || 0
    };
  }

  /**
   * Section 14 - Incident record summary
   */
  private async getIncidentSummary(eventId: string) {
    const [draftRes, submittedRes, revisionRes, closedRes] = await Promise.all([
      queryOne(`SELECT COUNT(*) as count FROM incident_records WHERE event_id = ? AND status = 'draft'`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM incident_records WHERE event_id = ? AND status = 'submitted'`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM incident_records WHERE event_id = ? AND status = 'needs_revision'`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM incident_records WHERE event_id = ? AND status = 'closed'`, [eventId])
    ]);

    return {
      draft: draftRes?.count || 0,
      waitingReview: submittedRes?.count || 0,
      underReview: submittedRes?.count || 0,
      changesRequested: revisionRes?.count || 0,
      closed: closedRes?.count || 0,
      safeguardingReviewRequired: 0 // Count or flag if needed
    };
  }

  /**
   * Section 15 - Escalation and response protection
   */
  private async getEscalationSummary(eventId: string) {
    const [activeCyclesRes, backupNotifiedRes, failuresRes] = await Promise.all([
      queryOne(`SELECT COUNT(*) as count FROM escalation_cycles WHERE event_id = ? AND status IN ('scheduled', 'processing', 'open')`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM escalation_deliveries d JOIN escalation_executions e ON d.execution_id = e.id JOIN escalation_cycles c ON e.cycle_id = c.id WHERE c.event_id = ? AND d.status = 'delivered'`, [eventId]),
      queryOne(`SELECT COUNT(*) as count FROM escalation_deliveries d JOIN escalation_executions e ON d.execution_id = e.id JOIN escalation_cycles c ON e.cycle_id = c.id WHERE c.event_id = ? AND d.status = 'failed'`, [eventId])
    ]);

    return {
      activeCycles: activeCyclesRes?.count || 0,
      backupNotificationsSent: backupNotifiedRes?.count || 0,
      deliveryCoverageIssues: failuresRes?.count || 0
    };
  }

  /**
   * Section 16 - Priority attention items (Priority policy)
   */
  private async getPriorityAttentionItems(eventId: string) {
    const priorityItems: any[] = [];

    // 1. Unacknowledged Urgent alerts
    const urgentUnack = await query(`
      SELECT id, title, location_label, created_at FROM event_safety_alerts
      WHERE event_id = ? AND status = 'open' AND severity = 'urgent'
    `, [eventId]);
    for (const a of urgentUnack) {
      priorityItems.push({
        id: `alert-unack-${a.id}`,
        title: 'Urgent safety request awaiting acknowledgement',
        description: `${a.title} at ${a.location_label || 'Unknown Location'}.`,
        urgency: 'high',
        location: a.location_label || 'Unknown',
        action: 'Open response',
        actionRoute: `/admin/alerts?id=${a.id}`
      });
    }

    // 2. Location coverage gaps
    const locations = await query('SELECT id, name, team_key, capacity FROM event_locations WHERE event_id = ? AND is_active = 1', [eventId]);
    const assignments = await query('SELECT * FROM event_duty_assignments WHERE event_id = ? AND status != \'cancelled\'', [eventId]);
    const activeDuty = await query('SELECT * FROM user_duty_status WHERE on_duty = 1 AND assigned_event_id = ?', [eventId]);
    const onDutyUserIds = new Set(activeDuty.map((u: any) => u.user_id));

    for (const loc of locations) {
      const locAssignments = assignments.filter((a: any) => a.responsibility_key === loc.team_key);
      const activePrimary = locAssignments.filter((a: any) => a.assignment_level === 'primary' && onDutyUserIds.has(a.user_id));
      const activeBackup = locAssignments.filter((a: any) => a.assignment_level === 'backup' && onDutyUserIds.has(a.user_id));

      if (activePrimary.length === 0 && activeBackup.length > 0) {
        priorityItems.push({
          id: `cov-backup-${loc.id}`,
          title: 'Room coverage needs attention',
          description: `${loc.name} currently has backup-only response coverage.`,
          urgency: 'medium',
          location: loc.name,
          action: 'Review coverage',
          actionRoute: `/admin/duty?tab=coverage`
        });
      } else if (activePrimary.length === 0 && activeBackup.length === 0) {
        priorityItems.push({
          id: `cov-none-${loc.id}`,
          title: 'Critical coverage gap detected',
          description: `${loc.name} has no primary or backup responder on duty.`,
          urgency: 'high',
          location: loc.name,
          action: 'Assign responder',
          actionRoute: `/admin/duty?tab=assignments`
        });
      }

      // 3. Overcapacity
      const checkedInInGroup = await queryOne(`
        SELECT COUNT(*) as count FROM child_event_entries cee
        JOIN children c ON cee.child_id = c.id
        WHERE cee.event_id = ? AND cee.status IN ('checked_in', 'inside') AND c.age_group = ?
      `, [eventId, loc.age_group_key]);
      const count = checkedInInGroup?.count || 0;
      if (loc.capacity && count > loc.capacity) {
        priorityItems.push({
          id: `cap-over-${loc.id}`,
          title: 'Location capacity limit exceeded',
          description: `${loc.name} has ${count} children, exceeding its planned capacity of ${loc.capacity}.`,
          urgency: 'medium',
          location: loc.name,
          action: 'Review load',
          actionRoute: `/admin/locations`
        });
      }
    }

    // 4. Overdue Incident Follow-ups
    const incidents = await query('SELECT id, title, follow_up_actions FROM incident_records WHERE event_id = ? AND status != \'closed\'', [eventId]);
    const now = new Date();
    for (const inc of incidents) {
      const followUps = JSON.parse(inc.follow_up_actions || '[]');
      for (const f of followUps) {
        if (!f.completed && f.dueDate && new Date(f.dueDate) < now) {
          priorityItems.push({
            id: `fup-over-${inc.id}-${f.id || Math.random()}`,
            title: 'Incident follow-up action overdue',
            description: `Follow-up "${f.action}" is overdue for incident "${inc.title}".`,
            urgency: 'medium',
            location: 'Incident Management',
            action: 'Open follow-up',
            actionRoute: `/admin/incidents?id=${inc.id}`
          });
        }
      }
    }

    return priorityItems;
  }

  /**
   * Section 18 & 19 - Recent event activity with server-side pagination
   */
  async getRecentOperationalActivity(eventId: string, filter: ActivityFilter = {}) {
    const page = filter.page || 1;
    const limit = filter.limit || 10;
    const offset = (page - 1) * limit;

    const activities: any[] = [];

    // Let's query several log sources safely
    const [checkins, alerts, escalations, incidents] = await Promise.all([
      query(`
        SELECT id, child_id, status, checked_in_at, picked_up_at, updated_at
        FROM child_event_entries
        WHERE event_id = ? AND status IN ('checked_in', 'inside', 'picked_up', 'checked_out')
        ORDER BY updated_at DESC LIMIT 50
      `, [eventId]),
      query(`
        SELECT id, title, severity, category, status, created_at, acknowledged_at, resolved_at
        FROM event_safety_alerts
        WHERE event_id = ?
        ORDER BY created_at DESC LIMIT 50
      `, [eventId]),
      query(`
        SELECT id, action_type, safe_summary, created_at
        FROM escalation_history
        WHERE event_id = ?
        ORDER BY created_at DESC LIMIT 50
      `, [eventId]),
      query(`
        SELECT id, title, status, created_at, updated_at
        FROM incident_records
        WHERE event_id = ?
        ORDER BY updated_at DESC LIMIT 50
      `, [eventId])
    ]);

    // Map each to standard activity format (omit private child details)
    for (const c of checkins) {
      const isRelease = c.status === 'picked_up' || c.status === 'checked_out';
      activities.push({
        id: `checkin-${c.id}-${isRelease ? 'release' : 'checkin'}`,
        category: 'attendance',
        title: isRelease ? 'Child released from event' : 'Child checked in successfully',
        description: isRelease ? 'Secure child release process completed.' : 'Attendance check-in completed.',
        timestamp: isRelease ? (c.picked_up_at || c.updated_at) : (c.checked_in_at || c.updated_at)
      });
    }

    for (const a of alerts) {
      activities.push({
        id: `alert-raised-${a.id}`,
        category: 'safety',
        title: `Safety request raised (${a.severity})`,
        description: `"${a.title}" raised in category ${a.category}. Current status: ${a.status}.`,
        timestamp: a.created_at
      });
      if (a.acknowledged_at) {
        activities.push({
          id: `alert-ack-${a.id}`,
          category: 'responses',
          title: `Safety request acknowledged`,
          description: `"${a.title}" has been claimed by a responder.`,
          timestamp: a.acknowledged_at
        });
      }
      if (a.resolved_at) {
        activities.push({
          id: `alert-res-${a.id}`,
          category: 'responses',
          title: `Safety request resolved`,
          description: `"${a.title}" has been marked resolved.`,
          timestamp: a.resolved_at
        });
      }
    }

    for (const esc of escalations) {
      activities.push({
        id: `escalation-${esc.id}`,
        category: 'follow_ups',
        title: `Response protection triggered`,
        description: esc.safe_summary,
        timestamp: esc.created_at
      });
    }

    for (const inc of incidents) {
      activities.push({
        id: `incident-${inc.id}-${inc.status}`,
        category: 'incidents',
        title: `Incident record state changed`,
        description: `Incident "${inc.title}" status is now ${inc.status}.`,
        timestamp: inc.updated_at || inc.created_at
      });
    }

    // Filter by type
    let filtered = activities;
    if (filter.type && filter.type !== 'all') {
      filtered = activities.filter(a => a.category === filter.type);
    }

    // Sort descending by timestamp
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Paginate
    const paginated = filtered.slice(offset, offset + limit);

    return {
      success: true,
      data: paginated,
      totalCount: filtered.length,
      page,
      limit
    };
  }

  /**
   * Section 35 - Role-Aware Serializers
   */
  private serializeOverviewForProfile(raw: any, profile: string) {
    if (profile === 'admin' || profile === 'super_admin') {
      return raw;
    }

    const serialized = { ...raw };

    if (profile === 'first_aid') {
      // First Aid: omit safeguarding/pickup details and non-medical stats
      serialized.attendance = {
        registered: raw.attendance.registered,
        checkedIn: raw.attendance.checkedIn,
        confidenceWording: raw.attendance.confidenceWording
      };
      // Keep only medical/first aid alerts
      serialized.alerts = raw.alerts.filter((a: any) => a.category === 'medical_support');
      serialized.priorityItems = raw.priorityItems.filter((p: any) => p.urgency === 'high' || p.location.toLowerCase().includes('aid') || p.title.toLowerCase().includes('aid'));
      delete serialized.escalations;
      delete serialized.volunteers;
    } else if (profile === 'security') {
      // Security: omit medical and detailed child profile stats
      serialized.attendance = {
        registered: raw.attendance.registered,
        checkedIn: raw.attendance.checkedIn,
        released: raw.attendance.released,
        confidenceWording: raw.attendance.confidenceWording
      };
      serialized.alerts = raw.alerts.filter((a: any) => a.category === 'security_concern' || a.category === 'pickup_issue');
      serialized.priorityItems = raw.priorityItems.filter((p: any) => p.title.toLowerCase().includes('security') || p.title.toLowerCase().includes('coverage'));
      delete serialized.escalations;
    } else if (profile === 'pickup') {
      // Pickup lead
      serialized.attendance = {
        registered: raw.attendance.registered,
        checkedIn: raw.attendance.checkedIn,
        released: raw.attendance.released,
        pickupInProgress: raw.attendance.pickupInProgress,
        confidenceWording: raw.attendance.confidenceWording
      };
      serialized.alerts = raw.alerts.filter((a: any) => a.category === 'pickup_issue' || a.category === 'pass_issue');
      serialized.priorityItems = raw.priorityItems.filter((p: any) => p.title.toLowerCase().includes('pickup') || p.title.toLowerCase().includes('pass'));
      delete serialized.escalations;
      delete serialized.volunteers;
    } else if (profile === 'safeguarding') {
      // Safeguarding: only keep incident and attention stats
      serialized.alerts = [];
      serialized.priorityItems = raw.priorityItems.filter((p: any) => p.title.toLowerCase().includes('incident') || p.title.toLowerCase().includes('overdue'));
    } else if (profile === 'team_lead') {
      // Team lead: scoped info
      serialized.alerts = raw.alerts.filter((a: any) => a.category === 'location_support' || a.category === 'other');
      serialized.priorityItems = raw.priorityItems.filter((p: any) => p.urgency !== 'high');
      delete serialized.escalations;
    }

    return serialized;
  }
}

export const eventOperationsService = new EventOperationsService();
