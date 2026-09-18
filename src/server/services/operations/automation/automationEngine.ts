import { query, queryOne } from '../../../db';
import { getCurrentEvent, getEventById } from '../../eventService';
import { getVolunteersNotReportedForDuty } from '../tools/dutyTools';
import {
  autoResolveMissingAutomations,
  AutomationUpsertInput,
  getAutomationSettingsForEvent,
  initAutomationSchema,
  upsertAutomation
} from './automationPersistence';
import {
  AutomationRuleDefinition,
  AutomationSeverity,
  PHASE3B_AUTOMATION_RULES
} from './ruleModel';
import {
  ConfigurationGapSignal,
  EventSignal,
  EventStartingSoonSignal,
  LocationUnderstaffedSignal,
  PassNotReadySignal,
  RegistrationClosingSoonSignal,
  ReportExpiredSignal,
  SafetyItemOpenSignal,
  VolunteerNoShowSignal,
  VolunteerRegistrationClosingSoonSignal
} from './signals';

export interface AutomationEngineHealth {
  lastEvaluationAt: string | null;
  lastEvaluationDurationMs: number;
  rulesEvaluatedCount: number;
  signalsDetectedCount: number;
  newItemsCount: number;
  resolvedItemsCount: number;
  lastError: string | null;
}

const engineHealth: AutomationEngineHealth = {
  lastEvaluationAt: null,
  lastEvaluationDurationMs: 0,
  rulesEvaluatedCount: 0,
  signalsDetectedCount: 0,
  newItemsCount: 0,
  resolvedItemsCount: 0,
  lastError: null
};

export function getAutomationEngineHealth(): AutomationEngineHealth {
  return { ...engineHealth };
}

/**
 * Evaluates all 9 deterministic signals for a given event ID.
 * All queries are bounded by eventId (no cross-event leaks, no N+1).
 */
export async function detectEventSignals(eventId: string): Promise<EventSignal[]> {
  const event = await getEventById(eventId);
  if (!event) {
    return [];
  }

  const detectedSignals: EventSignal[] = [];
  const now = Date.now();
  const nowIso = new Date().toISOString();
  const oneDayMs = 24 * 60 * 60 * 1000;

  // 1. REGISTRATION_CLOSING_SOON
  if (event.parent_access_closes_at) {
    const parentClosesAtTime = new Date(event.parent_access_closes_at).getTime();
    const diffMs = parentClosesAtTime - now;
    // Check if open (not closed in the past) and closing within 24 hours
    if (diffMs > 0 && diffMs <= oneDayMs) {
      const regCountRes = await queryOne(
        'SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND COALESCE(is_deleted, 0) = 0',
        [eventId]
      );
      const regSignal: RegistrationClosingSoonSignal = {
        signal: 'REGISTRATION_CLOSING_SOON',
        eventId,
        closesAt: event.parent_access_closes_at,
        hoursRemaining: Math.max(1, Math.round(diffMs / 3600000)),
        currentRegistrations: regCountRes?.count || 0,
        detectedAt: nowIso
      };
      detectedSignals.push(regSignal);
    }
  }

  // 2. VOLUNTEER_REGISTRATION_CLOSING_SOON
  if (event.volunteer_registration_closes_at) {
    const volClosesAtTime = new Date(event.volunteer_registration_closes_at).getTime();
    const diffMs = volClosesAtTime - now;
    if (diffMs > 0 && diffMs <= oneDayMs) {
      const approvedVolRes = await queryOne(
        "SELECT COUNT(*) as count FROM volunteer_profiles WHERE status = 'approved'",
        []
      );
      const volSignal: VolunteerRegistrationClosingSoonSignal = {
        signal: 'VOLUNTEER_REGISTRATION_CLOSING_SOON',
        eventId,
        closesAt: event.volunteer_registration_closes_at,
        hoursRemaining: Math.max(1, Math.round(diffMs / 3600000)),
        currentApproved: approvedVolRes?.count || 0,
        detectedAt: nowIso
      };
      detectedSignals.push(volSignal);
    }
  }

  // 3. LOCATION_UNDERSTAFFED
  const locations = await query(
    'SELECT id, name, short_name, volunteer_capacity FROM event_locations WHERE event_id = ? AND is_active = 1',
    [eventId]
  );
  const assignments = await query(
    "SELECT assigned_location_id, responsibility_key, user_id FROM event_duty_assignments WHERE event_id = ? AND status NOT IN ('cancelled', 'ended')",
    [eventId]
  );

  for (const loc of locations) {
    const target = loc.volunteer_capacity || 0;
    if (target > 0) {
      const locAssignments = assignments.filter(
        (a: any) => a.assigned_location_id === loc.id || a.responsibility_key === loc.id
      );
      const assignedCount = locAssignments.length;
      if (assignedCount < target) {
        const gap = target - assignedCount;
        const understaffedSignal: LocationUnderstaffedSignal = {
          signal: 'LOCATION_UNDERSTAFFED',
          eventId,
          locationId: loc.id,
          locationName: loc.name,
          assigned: assignedCount,
          assignedCount,
          required: target,
          requiredCount: target,
          gap,
          detectedAt: nowIso
        };
        detectedSignals.push(understaffedSignal);
      }
    }
  }

  // 4. VOLUNTEER_NO_SHOW (Canonical no-show resolver, respecting reporting time)
  const notReportedResult = await getVolunteersNotReportedForDuty(eventId);
  if (notReportedResult.volunteers.length > 0) {
    // Fetch duty schedule start times for not-reported volunteers in a single query
    const userIds = notReportedResult.volunteers.map(v => v.user_id);
    const placeholders = userIds.map(() => '?').join(',');
    const assignmentTimes = await query(
      `SELECT user_id, starts_at FROM event_duty_assignments 
       WHERE event_id = ? AND user_id IN (${placeholders}) AND status NOT IN ('cancelled', 'ended')`,
      [eventId, ...userIds]
    );
    const startMap = new Map<string, string>();
    for (const at of assignmentTimes) {
      if (at.starts_at) {
        startMap.set(at.user_id, at.starts_at);
      }
    }

    for (const vol of notReportedResult.volunteers) {
      const scheduledStart = startMap.get(vol.user_id) || null;
      let hasReliableReportingTime = false;
      let minutesLate = 0;

      if (scheduledStart) {
        const startTime = new Date(scheduledStart).getTime();
        if (!isNaN(startTime)) {
          hasReliableReportingTime = true;
          // STRICT RULE: Only flag as no-show if scheduled start has passed!
          if (now > startTime) {
            minutesLate = Math.max(1, Math.round((now - startTime) / 60000));
            const noShowSignal: VolunteerNoShowSignal = {
              signal: 'VOLUNTEER_NO_SHOW',
              eventId,
              userId: vol.user_id,
              volunteerName: vol.full_name || vol.name,
              assignedLocationId: vol.assigned_location_id || '',
              locationName: vol.location_name || vol.duty_location || 'Duty post',
              scheduledStart,
              hasReliableReportingTime: true,
              minutesLate,
              detectedAt: nowIso
            };
            detectedSignals.push(noShowSignal);
          }
          // If now <= startTime: volunteer is NOT late yet; do NOT flag premature lateness
        } else {
          // Scheduled start is not a valid date string (e.g. 'TBD'): do not fabricate lateness
          const notOnDutySignal: VolunteerNoShowSignal = {
            signal: 'VOLUNTEER_NO_SHOW',
            eventId,
            userId: vol.user_id,
            volunteerName: vol.full_name || vol.name,
            assignedLocationId: vol.assigned_location_id || '',
            locationName: vol.location_name || vol.duty_location || 'Duty post',
            scheduledStart: null,
            hasReliableReportingTime: false,
            minutesLate: 0,
            detectedAt: nowIso
          };
          detectedSignals.push(notOnDutySignal);
        }
      } else {
        // No reliable expected reporting time: report "Assigned but not currently on duty"
        const notOnDutySignal: VolunteerNoShowSignal = {
          signal: 'VOLUNTEER_NO_SHOW',
          eventId,
          userId: vol.user_id,
          volunteerName: vol.full_name || vol.name,
          assignedLocationId: vol.assigned_location_id || '',
          locationName: vol.location_name || vol.duty_location || 'Duty post',
          scheduledStart: null,
          hasReliableReportingTime: false,
          minutesLate: 0,
          detectedAt: nowIso
        };
        detectedSignals.push(notOnDutySignal);
      }
    }
  }

  // 5. PASS_NOT_READY
  const [selectedRes, withoutPassRes] = await Promise.all([
    queryOne(
      "SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready') AND COALESCE(is_deleted, 0) = 0",
      [eventId]
    ),
    queryOne(
      `SELECT COUNT(*) as count FROM child_event_entries e
       WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready') AND COALESCE(e.is_deleted, 0) = 0
         AND NOT EXISTS (
           SELECT 1 FROM event_passes p 
           WHERE p.child_event_entry_id = e.id AND p.status = 'active'
         )`,
      [eventId]
    )
  ]);
  const selectedCount = selectedRes?.count || 0;
  const withoutPassCount = withoutPassRes?.count || 0;
  if (withoutPassCount > 0) {
    const passSignal: PassNotReadySignal = {
      signal: 'PASS_NOT_READY',
      eventId,
      selectedCount,
      missingPassCount: withoutPassCount,
      withoutPassCount,
      detectedAt: nowIso
    };
    detectedSignals.push(passSignal);
  }

  // 6. REPORT_EXPIRED
  const expiredReports = await query(
    `SELECT gr.id, COALESCE(rj.template_key, rj.report_name, 'operational') as report_type, gr.expires_at 
     FROM generated_reports gr
     JOIN report_jobs rj ON gr.report_job_id = rj.id
     WHERE rj.event_id = ? AND gr.expires_at IS NOT NULL AND gr.expires_at < ?`,
    [eventId, nowIso]
  );
  for (const rep of expiredReports) {
    const repSignal: ReportExpiredSignal = {
      signal: 'REPORT_EXPIRED',
      eventId,
      reportId: rep.id,
      reportType: rep.report_type || 'operational',
      expiredAt: rep.expires_at,
      detectedAt: nowIso
    };
    detectedSignals.push(repSignal);
  }

  // 7. EVENT_STARTING_SOON
  const eventStart = (event as any).event_start_at || event.starts_at;
  if (eventStart) {
    const startTime = new Date(eventStart).getTime();
    const diffMs = startTime - now;
    if (diffMs > 0 && diffMs <= oneDayMs) {
      const eventStartingSignal: EventStartingSoonSignal = {
        signal: 'EVENT_STARTING_SOON',
        eventId,
        startsAt: eventStart,
        hoursRemaining: Math.max(1, Math.round(diffMs / 3600000)),
        detectedAt: nowIso
      };
      detectedSignals.push(eventStartingSignal);
    }
  }


  // 8. SAFETY_ITEM_OPEN
  const [openAlertsRes, urgentAlertsRes, openIncidentsRes, activeCyclesRes] = await Promise.all([
    queryOne("SELECT COUNT(*) as count FROM event_safety_alerts WHERE event_id = ? AND status != 'resolved'", [eventId]),
    queryOne("SELECT COUNT(*) as count FROM event_safety_alerts WHERE event_id = ? AND status != 'resolved' AND severity = 'urgent'", [eventId]),
    queryOne("SELECT COUNT(*) as count FROM incident_records WHERE event_id = ? AND status != 'closed'", [eventId]),
    queryOne("SELECT COUNT(*) as count FROM escalation_cycles WHERE event_id = ? AND status IN ('scheduled', 'processing', 'open')", [eventId])
  ]);
  const openAlerts = parseInt(String(openAlertsRes?.count || '0'), 10) || 0;
  const urgentAlerts = parseInt(String(urgentAlertsRes?.count || '0'), 10) || 0;
  const openIncidents = parseInt(String(openIncidentsRes?.count || '0'), 10) || 0;
  const activeEscalations = parseInt(String(activeCyclesRes?.count || '0'), 10) || 0;
  const totalOpenNotices = openAlerts + openIncidents + activeEscalations;

  if (totalOpenNotices > 0) {
    const safetySignal: SafetyItemOpenSignal = {
      signal: 'SAFETY_ITEM_OPEN',
      eventId,
      openAlertsCount: openAlerts,
      openIncidentsCount: openIncidents,
      activeEscalationsCount: activeEscalations,
      totalOpenNotices,
      severity: urgentAlerts > 0 || activeEscalations > 0 ? 'urgent' : 'attention',
      detectedAt: nowIso
    };
    detectedSignals.push(safetySignal);
  }

  // 9. CONFIGURATION_GAP
  const [ageGroupsCountRes, activeLocationsCountRes] = await Promise.all([
    queryOne('SELECT COUNT(*) as count FROM event_age_groups WHERE event_id = ?', [eventId]),
    queryOne('SELECT COUNT(*) as count FROM event_locations WHERE event_id = ? AND is_active = 1', [eventId])
  ]);
  const ageGroupsCount = parseInt(String(ageGroupsCountRes?.count || '0'), 10) || 0;
  const activeLocationsCount = parseInt(String(activeLocationsCountRes?.count || '0'), 10) || 0;

  if (activeLocationsCount === 0) {
    detectedSignals.push({
      signal: 'CONFIGURATION_GAP',
      eventId,
      gapType: 'no_locations',
      title: 'No active duty locations configured',
      details: 'Configure duty posts for team assignments.',
      detectedAt: nowIso
    });
  }

  if (ageGroupsCount === 0) {
    detectedSignals.push({
      signal: 'CONFIGURATION_GAP',
      eventId,
      gapType: 'no_age_groups',
      title: 'No age groups configured',
      details: 'Configure child age groups and capacities.',
      detectedAt: nowIso
    });
  }

  if (!event.capacity || event.capacity <= 0) {
    detectedSignals.push({
      signal: 'CONFIGURATION_GAP',
      eventId,
      gapType: 'missing_capacity',
      title: 'Event child capacity is not set',
      details: 'Set the maximum capacity for attendance control.',
      detectedAt: nowIso
    });
  }

  if (!event.volunteer_registration_closes_at) {
    detectedSignals.push({
      signal: 'CONFIGURATION_GAP',
      eventId,
      gapType: 'missing_volunteer_registration_deadline',
      title: 'Volunteer registration needs a closing date',
      details: 'Set when volunteer registration should close.',
      detectedAt: nowIso
    });
  }

  return detectedSignals;
}

/**
 * Helper to format date in restrained editorial style
 */
function formatRestrainedDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoString;
  }
}

function formatHumanExpectedTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const now = new Date();
    const isSameDay = d.getFullYear() === now.getFullYear() &&
                      d.getMonth() === now.getMonth() &&
                      d.getDate() === now.getDate();

    const timeStr = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    if (isSameDay) {
      return `Expected at ${timeStr}`;
    }

    const dateStr = d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short'
    });
    return `Expected ${dateStr} at ${timeStr}`;
  } catch {
    return isoString;
  }
}

/**
 * Transforms a factual event signal into an automation item definition.
 */
export function buildAutomationItemFromSignal(
  signal: EventSignal,
  rule: AutomationRuleDefinition
): AutomationUpsertInput {
  const eventId = signal.eventId;

  switch (signal.signal) {
    case 'LOCATION_UNDERSTAFFED': {
      const isUrgent = signal.assignedCount === 0;
      return {
        eventId,
        ruleId: rule.id,
        signalType: 'LOCATION_UNDERSTAFFED',
        fingerprint: `${eventId}:LOCATION_UNDERSTAFFED:${signal.locationId}`,
        title: `${signal.locationName} needs volunteers`,
        summary: `${signal.assignedCount} assigned of ${signal.requiredCount}`,
        description: `${signal.gap} ${signal.gap === 1 ? 'volunteer needed' : 'volunteers needed'} to meet required staffing for ${signal.locationName}.`,
        severity: isUrgent ? 'urgent' : 'attention',
        entityType: 'location',
        entityId: signal.locationId,
        payload: signal,
        proposedActionKey: rule.proposedAction?.actionKey,
        actionTargetRoute: rule.actionTargetRoute,
        actionTargetLabel: rule.actionTargetLabel,
        cooldownMinutes: rule.defaultCooldownMinutes
      };
    }

    case 'VOLUNTEER_NO_SHOW': {
      const isUrgent = signal.minutesLate >= 30;
      let title = `${signal.volunteerName} has not reported for duty`;
      let summary = `${signal.locationName} · Scheduled reporting time passed`;
      if (signal.hasReliableReportingTime && signal.scheduledStart) {
        summary = `${signal.locationName} · ${formatHumanExpectedTime(signal.scheduledStart)}`;
      } else {
        title = `${signal.volunteerName} assigned but not currently on duty`;
        summary = `${signal.locationName} · Not checked in on site`;
      }

      return {
        eventId,
        ruleId: rule.id,
        signalType: 'VOLUNTEER_NO_SHOW',
        fingerprint: `${eventId}:VOLUNTEER_NO_SHOW:${signal.userId}`,
        title,
        summary,
        description: `Volunteer is assigned to ${signal.locationName} but has no active duty check-in recorded.`,
        severity: isUrgent ? 'urgent' : signal.hasReliableReportingTime ? 'attention' : 'information',
        entityType: 'volunteer',
        entityId: signal.userId,
        payload: signal,
        proposedActionKey: rule.proposedAction?.actionKey,
        actionTargetRoute: rule.actionTargetRoute,
        actionTargetLabel: 'Review reminder →',
        cooldownMinutes: rule.defaultCooldownMinutes
      };
    }

    case 'REGISTRATION_CLOSING_SOON': {
      const isUrgent = signal.hoursRemaining <= 2;
      return {
        eventId,
        ruleId: rule.id,
        signalType: 'REGISTRATION_CLOSING_SOON',
        fingerprint: `${eventId}:REGISTRATION_CLOSING_SOON:window`,
        title: signal.hoursRemaining <= 1 ? 'Registration closes in less than an hour' : 'Registration closes soon',
        summary: `Closes ${formatRestrainedDate(signal.closesAt)} · ${signal.currentRegistrations} submitted`,
        description: `Parent registration window closes in ${signal.hoursRemaining} hours.`,
        severity: isUrgent ? 'urgent' : 'attention',
        entityType: 'event',
        entityId: eventId,
        payload: signal,
        actionTargetRoute: rule.actionTargetRoute,
        actionTargetLabel: rule.actionTargetLabel,
        cooldownMinutes: rule.defaultCooldownMinutes
      };
    }

    case 'VOLUNTEER_REGISTRATION_CLOSING_SOON': {
      const isUrgent = signal.hoursRemaining <= 2;
      return {
        eventId,
        ruleId: rule.id,
        signalType: 'VOLUNTEER_REGISTRATION_CLOSING_SOON',
        fingerprint: `${eventId}:VOLUNTEER_REGISTRATION_CLOSING_SOON:window`,
        title: signal.hoursRemaining <= 1 ? 'Volunteer registration closes soon' : 'Volunteer registration closes tomorrow',
        summary: `Closes ${formatRestrainedDate(signal.closesAt)}`,
        description: `Volunteer registration window closes in ${signal.hoursRemaining} hours.`,
        severity: isUrgent ? 'urgent' : 'attention',
        entityType: 'event',
        entityId: eventId,
        payload: signal,
        actionTargetRoute: rule.actionTargetRoute,
        actionTargetLabel: rule.actionTargetLabel,
        cooldownMinutes: rule.defaultCooldownMinutes
      };
    }

    case 'PASS_NOT_READY': {
      return {
        eventId,
        ruleId: rule.id,
        signalType: 'PASS_NOT_READY',
        fingerprint: `${eventId}:PASS_NOT_READY:summary`,
        title: `${signal.withoutPassCount} selected ${signal.withoutPassCount === 1 ? 'child still needs a pass' : 'children still need passes'}`,
        summary: `${signal.selectedCount - signal.withoutPassCount} of ${signal.selectedCount} passes generated`,
        description: `Digital entry passes have not yet been generated for ${signal.withoutPassCount} selected attendees.`,
        severity: 'attention',
        entityType: 'pass',
        entityId: 'summary',
        payload: signal,
        actionTargetRoute: rule.actionTargetRoute,
        actionTargetLabel: rule.actionTargetLabel,
        cooldownMinutes: rule.defaultCooldownMinutes
      };
    }

    case 'REPORT_EXPIRED': {
      return {
        eventId,
        ruleId: rule.id,
        signalType: 'REPORT_EXPIRED',
        fingerprint: `${eventId}:REPORT_EXPIRED:${signal.reportId}`,
        title: 'A report download is no longer available',
        summary: `Expired ${formatRestrainedDate(signal.expiredAt)}`,
        description: `Download token expired for ${signal.reportType} report.`,
        severity: 'information',
        entityType: 'report',
        entityId: signal.reportId,
        payload: signal,
        proposedActionKey: rule.proposedAction?.actionKey,
        actionTargetRoute: rule.actionTargetRoute,
        actionTargetLabel: 'Open Reports →',
        cooldownMinutes: rule.defaultCooldownMinutes
      };
    }

    case 'EVENT_STARTING_SOON': {
      return {
        eventId,
        ruleId: rule.id,
        signalType: 'EVENT_STARTING_SOON',
        fingerprint: `${eventId}:EVENT_STARTING_SOON:event`,
        title: signal.hoursRemaining <= 1 ? 'Event starts in less than an hour' : 'Event starts tomorrow',
        summary: `Starts ${formatRestrainedDate(signal.startsAt)}`,
        description: `The event begins in ${signal.hoursRemaining} hours. Check location readiness and attendance flow.`,
        severity: 'information',
        entityType: 'event',
        entityId: eventId,
        payload: signal,
        actionTargetRoute: rule.actionTargetRoute,
        actionTargetLabel: rule.actionTargetLabel,
        cooldownMinutes: rule.defaultCooldownMinutes
      };
    }

    case 'SAFETY_ITEM_OPEN': {
      const count = parseInt(String(signal.totalOpenNotices || '0'), 10) || 0;
      const title = count === 1 ? '1 safety item needs attention' : `${count} safety items need attention`;
      const alerts = parseInt(String(signal.openAlertsCount || '0'), 10) || 0;
      const incidents = parseInt(String(signal.openIncidentsCount || '0'), 10) || 0;
      const escalations = parseInt(String(signal.activeEscalationsCount || '0'), 10) || 0;
      const parts: string[] = [];
      if (alerts > 0) parts.push(`${alerts} ${alerts === 1 ? 'alert' : 'alerts'}`);
      if (incidents > 0) parts.push(`${incidents} ${incidents === 1 ? 'incident' : 'incidents'}`);
      if (escalations > 0) parts.push(`${escalations} ${escalations === 1 ? 'escalation' : 'escalations'}`);
      const summary = parts.length > 0 ? parts.join(' · ') : 'Unresolved safety notices';

      return {
        eventId,
        ruleId: rule.id,
        signalType: 'SAFETY_ITEM_OPEN',
        fingerprint: `${eventId}:SAFETY_ITEM_OPEN:summary`,
        title,
        summary,
        description: 'Unresolved safeguarding items require human review and escalation response.',
        severity: signal.severity,
        entityType: 'safety',
        entityId: 'summary',
        payload: signal,
        actionTargetRoute: rule.actionTargetRoute,
        actionTargetLabel: 'Review safety →',
        cooldownMinutes: rule.defaultCooldownMinutes
      };
    }

    case 'CONFIGURATION_GAP': {
      return {
        eventId,
        ruleId: rule.id,
        signalType: 'CONFIGURATION_GAP',
        fingerprint: `${eventId}:CONFIGURATION_GAP:${signal.gapType}`,
        title: signal.title,
        summary: signal.details,
        description: signal.details,
        severity: 'attention',
        entityType: 'event',
        entityId: signal.gapType,
        payload: signal,
        actionTargetRoute: rule.actionTargetRoute,
        actionTargetLabel: rule.actionTargetLabel,
        cooldownMinutes: rule.defaultCooldownMinutes
      };
    }
  }
}

export interface AutomationEvaluationResult {
  success: boolean;
  eventId: string | null;
  signalsDetectedCount: number;
  newItemsCount: number;
  resolvedItemsCount: number;
  durationMs: number;
  error?: string;
}

/**
 * Runs a complete deterministic evaluation cycle for the canonical CURRENT EVENT.
 * 1. Resolves canonical current event (no open/active fallback).
 * 2. Evaluates all 9 signals.
 * 3. Deduplicates and updates active items.
 * 4. Resolves stale automation items whose factual condition disappeared.
 */
export async function evaluateCurrentEventAutomations(
  targetEventId?: string
): Promise<AutomationEvaluationResult> {
  const startTime = Date.now();
  try {
    // Check if schema is ready (SQLite bootstraps locally; PostgreSQL expects migration 007)
    const isReady = await initAutomationSchema();
    if (!isReady) {
      return {
        success: false,
        eventId: targetEventId || null,
        signalsDetectedCount: 0,
        newItemsCount: 0,
        resolvedItemsCount: 0,
        durationMs: Date.now() - startTime,
        error: 'Automation schema missing'
      };
    }

    // 1. Resolve canonical current event
    const event = targetEventId ? await getEventById(targetEventId) : await getCurrentEvent();
    if (!event) {
      const durationMs = Date.now() - startTime;
      engineHealth.lastEvaluationAt = new Date().toISOString();
      engineHealth.lastEvaluationDurationMs = durationMs;
      engineHealth.rulesEvaluatedCount = 0;
      engineHealth.signalsDetectedCount = 0;
      return {
        success: true,
        eventId: null,
        signalsDetectedCount: 0,
        newItemsCount: 0,
        resolvedItemsCount: 0,
        durationMs
      };
    }

    const eventId = event.id;

    // 2. Fetch event rule settings
    const settingsMap = await getAutomationSettingsForEvent(eventId);

    // 3. Detect factual signals bounded to eventId
    const signals = await detectEventSignals(eventId);

    const activeFingerprints: string[] = [];
    let newItemsCount = 0;

    // 4. Map signals to rules and persist with deduplication
    for (const signal of signals) {
      const rule = PHASE3B_AUTOMATION_RULES.find(r => r.triggerSignal === signal.signal);
      if (!rule) continue;

      // Check if disabled by Admin (unless mandatory like safety)
      const isEnabled = settingsMap.has(rule.id) ? settingsMap.get(rule.id)! : rule.isEnabled;
      if (!isEnabled && !rule.isMandatory) {
        continue;
      }

      const input = buildAutomationItemFromSignal(signal, rule);
      activeFingerprints.push(input.fingerprint);

      const upsertResult = await upsertAutomation(input);
      if (upsertResult.isNew || upsertResult.reopened) {
        newItemsCount++;
      }
    }

    // 5. Auto-resolve missing conditions
    const resolvedItemsCount = await autoResolveMissingAutomations(eventId, activeFingerprints);

    const durationMs = Date.now() - startTime;

    // Update internal health
    engineHealth.lastEvaluationAt = new Date().toISOString();
    engineHealth.lastEvaluationDurationMs = durationMs;
    engineHealth.rulesEvaluatedCount = PHASE3B_AUTOMATION_RULES.length;
    engineHealth.signalsDetectedCount = signals.length;
    engineHealth.newItemsCount = newItemsCount;
    engineHealth.resolvedItemsCount = resolvedItemsCount;
    engineHealth.lastError = null;

    return {
      success: true,
      eventId,
      signalsDetectedCount: signals.length,
      newItemsCount,
      resolvedItemsCount,
      durationMs
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error('[AutomationEngine] Error during automation evaluation:', err);
    engineHealth.lastEvaluationAt = new Date().toISOString();
    engineHealth.lastEvaluationDurationMs = durationMs;
    engineHealth.lastError = err?.message || 'Evaluation error';
    return {
      success: false,
      eventId: targetEventId || null,
      signalsDetectedCount: 0,
      newItemsCount: 0,
      resolvedItemsCount: 0,
      durationMs,
      error: err?.message
    };
  }
}
