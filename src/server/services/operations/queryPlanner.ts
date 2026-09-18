import { query } from '../../db';
import { getEventById } from '../eventService';
import {
  buildHumanEventSummary,
  formatHumanProvenance,
  formatNumber,
  formatPlural
} from './presentation';
import { operationsToolRegistry } from './registry';
import { operationsActionRegistry } from './actions';
import { GroundedQueryResult, TableData, ToolActor, ToolContext, ToolFilter } from './types';

export class OperationsQueryPlanner {
  /**
   * Plans and processes a natural-language operational question against live platform tools.
   */
  public async planAndExecute(
    question: string,
    eventId: string,
    actor: ToolActor
  ): Promise<GroundedQueryResult> {
    const raw = (question || '').trim().toLowerCase();
    const event = await getEventById(eventId);

    if (!event) {
      return {
        answer: "I don't have enough event data to answer that yet.",
        grounded: false,
        intent: 'no_active_event'
      };
    }

    const context: ToolContext = {
      eventId,
      actor: actor || { id: 'anonymous', role: 'admin' }
    };

    const nowTimeStr = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });

    // -------------------------------------------------------------
    // 1. Phase 3A Confirmed Actions (Human Preview Generation)
    // -------------------------------------------------------------

    // Action A: "Remind volunteers who haven't reported." / "Send a reminder to the volunteers missing from Grace Hall."
    if (
      raw.includes('remind') ||
      raw.includes('send reminder') ||
      raw.includes('send reminders') ||
      raw.includes('send a reminder')
    ) {
      const locMatch = question.match(/(?:missing from|assigned to|volunteers at|volunteers in|working in|coverage for|for)\s+([A-Za-z0-9\s]+?)(?:\?|$|\.|\b(?:today|now|right now|currently)\b)/i);
      const candidateLocName = locMatch ? locMatch[1].trim() : undefined;

      const res = await operationsActionRegistry.prepareActionPreview('SEND_DUTY_REMINDERS', context, {
        locationName: candidateLocName
      });

      return {
        answer: res.answer,
        grounded: true,
        intent: 'action_preview_duty_reminders',
        actionPreview: res.preview,
        provenance: formatHumanProvenance('Event Duty', event.title, nowTimeStr)
      };
    }

    // Action B: "Regenerate the attendance report." / "Create a fresh Event Executive report."
    if (
      (raw.includes('regenerate') || raw.includes('create a fresh') || raw.includes('re-generate') || raw.includes('generate fresh')) &&
      (raw.includes('report') || raw.includes('executive') || raw.includes('attendance'))
    ) {
      const res = await operationsActionRegistry.prepareActionPreview('REGENERATE_REPORT', context, {
        queryText: raw
      });

      return {
        answer: res.answer,
        grounded: true,
        intent: 'action_preview_regenerate_report',
        actionPreview: res.preview,
        provenance: formatHumanProvenance('Reports', event.title, nowTimeStr)
      };
    }

    // Action C: "Alert Admin about understaffed locations."
    if (
      (raw.includes('alert') || raw.includes('create alert') || raw.includes('send alert') || raw.includes('notify admin')) &&
      (raw.includes('understaffed') || raw.includes('staffing') || raw.includes('need more people') || raw.includes('shortage'))
    ) {
      const res = await operationsActionRegistry.prepareActionPreview('CREATE_ADMIN_OPERATIONS_ALERT', context);

      return {
        answer: res.answer,
        grounded: true,
        intent: 'action_preview_operations_alert',
        actionPreview: res.preview,
        provenance: formatHumanProvenance('Event Duty', event.title, nowTimeStr)
      };
    }

    // -------------------------------------------------------------
    // 2. Action Attempt Interception & Explicit Guardrails (Section 3)
    // -------------------------------------------------------------
    if (raw.includes('delete') || raw.includes('remove parent') || raw.includes('remove child')) {
      return {
        answer: 'Deletion actions are not permitted through Operations Assistant.',
        grounded: true,
        intent: 'forbidden_action',
        actionAttempt: true,
        provenance: formatHumanProvenance(null, event.title, nowTimeStr)
      };
    }

    if (raw.includes('resolve incident') || raw.includes('resolve this incident') || raw.includes('close incident') || raw.includes('resolve safety')) {
      return {
        answer: 'Incident resolution actions are not permitted through Operations Assistant.',
        grounded: true,
        intent: 'forbidden_action',
        actionAttempt: true,
        provenance: formatHumanProvenance('Safety', event.title, nowTimeStr)
      };
    }

    const isActionAttempt =
      /^(assign|delete|remove|update|create|add|modify|change|set|cancel|check\s*in|pick\s*up|mark|approve|reject)\b/i.test(
        raw
      ) ||
      raw.startsWith('can you assign') ||
      raw.startsWith('please assign') ||
      raw.startsWith('can you add') ||
      raw.startsWith('please delete');

    if (isActionAttempt) {
      const targetNameMatch = question.match(
        /(?:assign|update|remove|check in|mark)\s+([A-Za-z]+(?:\s+(?!to\b|at\b|in\b|into\b|for\b|from\b|as\b)[A-Za-z]+)?)/i
      );
      const targetName = targetNameMatch ? targetNameMatch[1].trim() : null;

      if (targetName) {
        return {
          answer: `I can show ${targetName}'s current assignment, but changes are not enabled in Operations Assistant yet.`,
          grounded: true,
          intent: 'action_attempt',
          actionAttempt: true,
          provenance: formatHumanProvenance(null, event.title, nowTimeStr),
          suggestedQuestions: [
            'Who is assigned to Grace Hall?',
            'List the volunteers currently on duty.',
            'Which duty locations need more people?'
          ]
        };
      }

      return {
        answer: 'Action requests are not enabled in Operations Assistant yet. All operations are currently view-only.',
        grounded: true,
        intent: 'action_attempt',
        actionAttempt: true,
        provenance: formatHumanProvenance(null, event.title, nowTimeStr)
      };
    }

    // -------------------------------------------------------------
    // 2. Ambiguity Detection (Clarification Required)
    // -------------------------------------------------------------
    if (
      raw === 'volunteers' ||
      raw === 'volunteer duty' ||
      raw === 'who is working' ||
      raw === 'show volunteers'
    ) {
      return {
        answer: 'Do you mean volunteers currently on duty or volunteers assigned for duty?',
        grounded: true,
        intent: 'clarification_needed',
        clarification: true,
        provenance: formatHumanProvenance('Event Duty', event.title, nowTimeStr),
        suggestedQuestions: [
          'List the volunteers currently on duty.',
          'List assigned volunteers.',
          'Which volunteers haven\'t reported for duty?'
        ]
      };
    }

    // -------------------------------------------------------------
    // 3. Dynamic Location Extraction & Safe Ambiguity Handling
    // -------------------------------------------------------------
    const activeLocations = await query(
      'SELECT id, name, short_name FROM event_locations WHERE event_id = ? AND is_active = 1',
      [eventId]
    );

    let matchedLocation: { id: string; name: string } | null = null;
    let locationClarificationNeeded = false;
    let ambiguousLocations: { id: string; name: string }[] = [];

    // Extract potential location phrase from question if present
    const locationPattern = /(?:assigned to|volunteers at|volunteers in|working in|coverage for|who is at|who is in)\s+([a-z0-9\s]+?)(?:\?|$|\.|\b(?:today|now|right now|currently)\b)/i;
    const locMatch = raw.match(locationPattern);
    const candidatePhrase = locMatch ? locMatch[1].trim() : null;

    const matchedList: { id: string; name: string; exact: boolean }[] = [];

    for (const loc of activeLocations || []) {
      const locName = (loc.name || '').toLowerCase();
      const shortName = (loc.short_name || '').toLowerCase();

      if (candidatePhrase) {
        if (locName === candidatePhrase || (shortName && shortName === candidatePhrase)) {
          matchedList.push({ id: loc.id, name: loc.name, exact: true });
        } else if (
          locName.startsWith(candidatePhrase) ||
          (candidatePhrase.length >= 4 && locName.includes(candidatePhrase)) ||
          raw.includes(locName) ||
          (shortName && raw.includes(shortName))
        ) {
          matchedList.push({ id: loc.id, name: loc.name, exact: false });
        }
      } else {
        if (
          raw.includes(locName) ||
          (shortName && raw.includes(shortName))
        ) {
          matchedList.push({ id: loc.id, name: loc.name, exact: true });
        }
      }
    }

    if (matchedList.length === 1) {
      matchedLocation = matchedList[0];
    } else if (matchedList.length > 1) {
      const exacts = matchedList.filter(m => m.exact);
      if (exacts.length === 1) {
        matchedLocation = exacts[0];
      } else {
        locationClarificationNeeded = true;
        ambiguousLocations = matchedList;
      }
    }

    if (
      locationClarificationNeeded &&
      (raw.includes('who is assigned') || raw.includes('assigned to') || raw.includes('volunteers at'))
    ) {
      const choices = ambiguousLocations.map(l => l.name).slice(0, 3).join(' or ');
      return {
        answer: `Which location did you mean: ${choices}?`,
        grounded: true,
        intent: 'clarification_needed',
        clarification: true,
        suggestedQuestions: ambiguousLocations.slice(0, 3).map(l => `Who is assigned to ${l.name}?`)
      };
    }

    // -------------------------------------------------------------
    // 4. Intent Routing & Tool Execution
    // -------------------------------------------------------------

    // Q1: "List volunteers currently on duty"
    if (
      (raw.includes('volunteers') && (raw.includes('currently on duty') || (raw.includes('on duty') && (raw.includes('list') || raw.includes('who'))))) ||
      raw === 'volunteers on duty' ||
      raw === 'list volunteers on duty' ||
      raw === 'list the volunteers currently on duty.'
    ) {
      const res = await operationsToolRegistry.executeTool('listVolunteersOnDuty', context);
      const volunteers = res.data || [];
      const total = res.totalCount ?? volunteers.length;

      const rows = volunteers.map((v: any) => [
        v.name,
        v.duty_location,
        v.responsibility,
        v.reported_at ? new Date(v.reported_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
        v.status
      ]);

      const table: TableData = {
        columns: ['Name', 'Duty Location', 'Responsibility', 'Reported At', 'Status'],
        rows,
        totalCount: total,
        displayedCount: volunteers.length
      };

      const limitNote = total > volunteers.length ? ` (showing ${volunteers.length} of ${formatNumber(total)})` : '';
      const answer = total === 0
        ? 'No volunteers are currently on duty for this event.'
        : `${formatNumber(total)} volunteer${total === 1 ? ' is' : 's are'} currently active on duty${limitNote}.`;

      return {
        answer,
        grounded: true,
        intent: 'volunteers_on_duty_list',
        table,
        provenance: formatHumanProvenance('Event Duty', event.title, nowTimeStr),
        deepLinks: [{ label: 'Open Event Duty', route: '/admin/operations', tab: 'operations' }],
        suggestedQuestions: [
          'Which volunteers haven\'t reported for duty?',
          'Which duty locations need more people?',
          'How many children are checked in right now?'
        ]
      };
    }

    // Q2: "Who is assigned to Grace Hall?" / Location Assigned Volunteers
    if (
      matchedLocation &&
      (raw.includes('who is assigned') || raw.includes('assigned to') || raw.includes('volunteers at') || raw.includes('assigned volunteers'))
    ) {
      const res = await operationsToolRegistry.executeTool('listAssignedVolunteers', context, {
        locationId: matchedLocation.id,
        locationName: matchedLocation.name
      });

      const volunteers = res.data || [];
      const total = res.totalCount ?? volunteers.length;

      const rows = volunteers.map((v: any) => [
        v.name,
        v.duty_location,
        v.responsibility,
        v.is_currently_present ? 'Present' : 'Not on site'
      ]);

      const table: TableData = {
        columns: ['Name', 'Duty Location', 'Responsibility', 'Presence'],
        rows,
        totalCount: total,
        displayedCount: volunteers.length
      };

      const names = volunteers.map((v: any) => v.name).join(', ');
      const answer = total === 0
        ? `No volunteers are currently assigned to ${matchedLocation.name}.`
        : `${formatNumber(total)} volunteer${total === 1 ? ' is' : 's are'} assigned to ${matchedLocation.name}: ${names}.`;

      return {
        answer,
        grounded: true,
        intent: 'volunteers_assigned_to_location',
        table,
        provenance: formatHumanProvenance('Event Duty', matchedLocation.name, nowTimeStr),
        deepLinks: [{ label: 'View Event Duty', route: '/admin/operations', tab: 'operations' }],
        suggestedQuestions: [
          'Which volunteers haven\'t reported for duty?',
          'Which duty locations need more people?',
          'List the volunteers currently on duty.'
        ]
      };
    }

    // Q3: "Which volunteers haven't reported for duty?"
    if (
      raw.includes('haven\'t reported') ||
      raw.includes('have not reported') ||
      raw.includes('not reported for duty') ||
      raw.includes('no show') ||
      raw.includes('absent volunteers') ||
      raw.includes('missing volunteers')
    ) {
      const res = await operationsToolRegistry.executeTool('listLateOrNoShowVolunteers', context);
      const volunteers = res.data || [];
      const total = res.totalCount ?? volunteers.length;

      const rows = volunteers.map((v: any) => [
        v.name,
        v.duty_location,
        v.responsibility,
        v.phone || 'N/A',
        v.status
      ]);

      const table: TableData = {
        columns: ['Name', 'Assigned Location', 'Responsibility', 'Phone', 'Status'],
        rows,
        totalCount: total,
        displayedCount: volunteers.length
      };

      const answer = total === 0
        ? 'Everyone assigned for duty has reported.'
        : `${formatNumber(total)} assigned volunteer${total === 1 ? '' : 's'} ${total === 1 ? 'has' : 'have'} not reported for duty yet.`;

      return {
        answer,
        grounded: true,
        intent: 'volunteers_no_show_list',
        table,
        provenance: formatHumanProvenance('Event Duty', event.title, nowTimeStr),
        deepLinks: [{ label: 'View Event Duty', route: '/admin/operations', tab: 'operations' }],
        suggestedQuestions: [
          'List the volunteers currently on duty.',
          'Which duty locations need more people?',
          'How many approved volunteers are not assigned?'
        ]
      };
    }

    // Q4: "How many children are checked in right now?" / Checked-in Count
    if (
      (raw.includes('how many') && raw.includes('checked in')) ||
      raw.includes('checked in right now') ||
      raw.includes('children checked in') ||
      raw.includes('current check-in count')
    ) {
      const res = await operationsToolRegistry.executeTool('getAttendanceSummary', context);
      const data = res.data;

      const answer = data.currentlyInside === 0
        ? 'No children are checked in right now.'
        : `${formatNumber(data.currentlyInside)} children are checked in right now (${formatNumber(data.checkedIn)} total arrivals, ${formatNumber(data.pickedUp)} picked up).`;

      return {
        answer,
        grounded: true,
        intent: 'attendance_checked_in_count',
        data,
        provenance: formatHumanProvenance('Attendance', event.title, nowTimeStr),
        deepLinks: [{ label: 'Open Attendance Desk', route: '/admin/attendance', tab: 'attendance' }],
        suggestedQuestions: [
          'How many children have been picked up?',
          'List selected children without passes.',
          'Which age group has the highest registration?'
        ]
      };
    }

    // Q5: "List selected children without passes."
    if (
      (raw.includes('pass') && (raw.includes('without') || raw.includes('missing') || raw.includes('need') || raw.includes('no pass'))) ||
      raw === 'list selected children without passes.' ||
      raw === 'list selected children without passes'
    ) {
      const res = await operationsToolRegistry.executeTool('listSelectedChildrenWithoutPasses', context);
      const children = res.data || [];
      const total = res.totalCount ?? children.length;

      const rows = children.map((c: any) => [
        c.child_name,
        c.age,
        c.gender || '—',
        c.parent_name || 'N/A',
        c.parent_phone || 'N/A',
        'Pass required'
      ]);

      const table: TableData = {
        columns: ['Child Name', 'Age', 'Gender', 'Parent', 'Phone', 'Pass Status'],
        rows,
        totalCount: total,
        displayedCount: children.length
      };

      const answer = total === 0
        ? 'All selected children have active passes issued.'
        : `${formatNumber(total)} selected child${total === 1 ? ' does' : 'ren do'} not have passes yet.`;

      return {
        answer,
        grounded: true,
        intent: 'selected_children_without_passes_list',
        table,
        provenance: formatHumanProvenance('Passes', event.title, nowTimeStr),
        deepLinks: [{ label: 'Open Children Registry', route: '/admin/children', tab: 'children' }],
        suggestedQuestions: [
          'How many children are selected?',
          'How many children are checked in right now?',
          'Which age group has the highest registration?'
        ]
      };
    }

    // Q6: "Which age group is closest to capacity?" / "Which age group has the highest registration?"
    if (
      raw.includes('closest to capacity') ||
      raw.includes('highest registration') ||
      raw.includes('age group capacity') ||
      raw.includes('near capacity') ||
      raw.includes('closest to full') ||
      raw.includes('distribution by age group')
    ) {
      const res = await operationsToolRegistry.executeTool('getAgeGroupRegistrationSummary', context);
      const groups = res.data || [];

      if (groups.length === 0) {
        return {
          answer: 'No age groups are currently configured for this event.',
          grounded: true,
          intent: 'age_group_capacity',
          provenance: formatHumanProvenance('Configuration', event.title, nowTimeStr)
        };
      }

      const sorted = [...groups].sort((a, b) => b.percentageFilled - a.percentageFilled);
      const closest = sorted[0];

      const breakdown = {
        title: 'Age group capacity',
        items: sorted.map((g: any) => ({
          label: g.label,
          primary: `${formatNumber(g.selectedCount)} / ${formatNumber(g.capacity)} spaces`,
          secondary: `${g.percentageFilled}%`,
          meta: `${formatNumber(g.remaining)} remaining`
        }))
      };

      const table: TableData = {
        columns: ['Age Group', 'Registered', 'Selected', 'Capacity', 'Remaining', 'Filled'],
        rows: sorted.map((g: any) => [
          g.label,
          formatNumber(g.registeredCount),
          formatNumber(g.selectedCount),
          formatNumber(g.capacity),
          formatNumber(g.remaining),
          `${g.percentageFilled}%`
        ])
      };

      const answer = `${closest.label} is closest to capacity at ${closest.percentageFilled}% (${formatNumber(closest.selectedCount)} of ${formatNumber(closest.capacity)} spaces selected).`;

      return {
        answer,
        grounded: true,
        intent: 'age_group_capacity',
        breakdown,
        table,
        provenance: formatHumanProvenance('Configuration', event.title, nowTimeStr),
        deepLinks: [{ label: 'Configure Age Groups', route: '/admin/events', tab: 'events' }],
        suggestedQuestions: [
          'How many children are selected?',
          'How many places are remaining?',
          'Is registration still open?'
        ]
      };
    }

    // Q7: "How many approved volunteers are not assigned?"
    if (
      raw.includes('not assigned') ||
      raw.includes('unassigned') ||
      raw.includes('approved volunteers without assignment')
    ) {
      const res = await operationsToolRegistry.executeTool('getVolunteerSummary', context);
      const data = res.data;

      const answer = data.unassignedApprovedVolunteers === 0
        ? 'All approved volunteers have been assigned to duty posts.'
        : `${formatNumber(data.unassignedApprovedVolunteers)} approved volunteers are currently not assigned to any duty post for this event (${formatNumber(data.volunteersAssigned)} assigned out of ${formatNumber(data.approvedVolunteers)} total approved).`;

      return {
        answer,
        grounded: true,
        intent: 'volunteers_unassigned_count',
        data,
        provenance: formatHumanProvenance('Volunteer Management', event.title, nowTimeStr),
        deepLinks: [{ label: 'Assign Volunteers in Event Duty', route: '/admin/operations', tab: 'operations' }],
        suggestedQuestions: [
          'Which duty locations need more people?',
          'List the volunteers currently on duty.',
          'Which volunteers haven\'t reported for duty?'
        ]
      };
    }

    // Q8: "Show unresolved escalations."
    if (
      raw.includes('escalation') ||
      raw.includes('show unresolved escalations') ||
      raw.includes('active escalations')
    ) {
      const res = await operationsToolRegistry.executeTool('listUnresolvedEscalations', context);

      if (!res.authorized) {
        return {
          answer: "You don't have permission to view those details.",
          grounded: true,
          intent: 'escalations_unresolved_list',
          provenance: formatHumanProvenance('Safety', event.title, nowTimeStr)
        };
      }

      const escalations = res.data || [];
      const total = res.totalCount ?? escalations.length;

      const rows = escalations.map((e: any) => [
        e.child_name,
        e.guardian_name,
        e.condition_key,
        `Cycle ${e.cycle_number}`,
        e.status,
        new Date(e.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      ]);

      const table: TableData = {
        columns: ['Child', 'Guardian', 'Condition', 'Cycle', 'Status', 'Started At'],
        rows,
        totalCount: total,
        displayedCount: escalations.length
      };

      const answer = total === 0
        ? 'No active escalations.'
        : total === 1
        ? 'There is 1 active escalation awaiting resolution.'
        : `There are ${formatNumber(total)} active escalations awaiting resolution.`;

      return {
        answer,
        grounded: true,
        intent: 'escalations_unresolved_list',
        table,
        provenance: formatHumanProvenance('Safety', event.title, nowTimeStr),
        deepLinks: [{ label: 'View Incident Desk', route: '/admin/escalations', tab: 'escalations' }],
        suggestedQuestions: [
          'Are there any open safety notices?',
          'How many children are checked in right now?',
          'Give me an event summary.'
        ]
      };
    }

    // Q9: "What changed in the last hour?" / "What changed today?" / Recent activity
    if (
      raw.includes('what changed') ||
      raw.includes('recent activity') ||
      raw.includes('changes in the last') ||
      raw.includes('activity in the last')
    ) {
      let timeframe = 'today';
      let timeframeLabel = 'today';

      if (raw.includes('last hour') || raw.includes('past hour') || raw.includes('in the last hour')) {
        timeframe = 'last_hour';
        timeframeLabel = 'last hour';
      } else if (raw.includes('past 2 hours') || raw.includes('last 2 hours')) {
        timeframe = 'past_2_hours';
        timeframeLabel = 'past 2 hours';
      }

      const res = await operationsToolRegistry.executeTool('getRecentOperationalActivity', context, {
        timeframe
      });

      const activities = res.data?.activities || [];

      const rows = activities.slice(0, 10).map((a: any) => [
        new Date(a.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        a.description,
        a.category
      ]);

      const table: TableData = {
        columns: ['Time', 'Action', 'Category'],
        rows,
        totalCount: activities.length,
        displayedCount: rows.length
      };

      const answer = activities.length === 0
        ? `No operational changes recorded in the ${timeframeLabel}.`
        : activities.length === 1
        ? `1 operational record was logged in the ${timeframeLabel}.`
        : `${formatNumber(activities.length)} operational records were logged in the ${timeframeLabel}.`;

      return {
        answer,
        grounded: true,
        intent: 'recent_activity',
        table,
        provenance: formatHumanProvenance('Activity', event.title, nowTimeStr),
        deepLinks: [{ label: 'View Admin Overview', route: '/admin', tab: 'overview' }],
        suggestedQuestions: [
          'How many children are checked in right now?',
          'List the volunteers currently on duty.',
          'Give me an event summary.'
        ]
      };
    }

    // Q11: "Which duty locations need more people?" / "understaffed locations"
    if (
      raw.includes('need more people') ||
      raw.includes('need volunteers') ||
      raw.includes('understaffed') ||
      raw.includes('locations needing')
    ) {
      const res = await operationsToolRegistry.executeTool('listUnderstaffedLocations', context);
      const locations = res.data || [];

      if (locations.length === 0) {
        return {
          answer: 'All active duty locations currently meet their volunteer staffing targets.',
          grounded: true,
          intent: 'understaffed_locations_list',
          provenance: formatHumanProvenance('Event Duty', event.title, nowTimeStr),
          suggestedQuestions: [
            'List the volunteers currently on duty.',
            'Which volunteers haven\'t reported for duty?'
          ]
        };
      }

      const rows = locations.map((l: any) => [
        l.location,
        l.assigned,
        l.onDuty,
        l.targetVolunteerCapacity,
        l.gap
      ]);

      const table: TableData = {
        columns: ['Location', 'Assigned', 'On Duty', 'Target Capacity', 'Gap'],
        rows,
        totalCount: locations.length,
        displayedCount: locations.length
      };

      const names = locations.map((l: any) => `${l.location} (gap: ${l.gap})`).join(', ');
      const answer = `${formatNumber(locations.length)} duty location${locations.length === 1 ? ' needs' : 's need'} more volunteers: ${names}.`;

      return {
        answer,
        grounded: true,
        intent: 'understaffed_locations_list',
        table,
        provenance: formatHumanProvenance('Event Duty', event.title, nowTimeStr),
        deepLinks: [{ label: 'Assign Duty Locations', route: '/admin/operations', tab: 'operations' }],
        suggestedQuestions: [
          'How many approved volunteers are not assigned?',
          'List the volunteers currently on duty.',
          'Which volunteers haven\'t reported for duty?'
        ]
      };
    }

    // Q12: Multi-Tool Comprehensive Event Summary / "Are we ready for the event?"
    if (
      raw.includes('event summary') ||
      raw.includes('are we ready') ||
      raw.includes('ready for the event') ||
      raw.includes('how is the event going')
    ) {
      const [eventSumRes, regRes, attRes, passRes, dutyRes, safetyRes] = await Promise.all([
        operationsToolRegistry.executeTool('getCurrentEventSummary', context),
        operationsToolRegistry.executeTool('getRegistrationSummary', context),
        operationsToolRegistry.executeTool('getAttendanceSummary', context),
        operationsToolRegistry.executeTool('getPassSummary', context),
        operationsToolRegistry.executeTool('getDutySummary', context),
        operationsToolRegistry.executeTool('getSafetySummary', context)
      ]);

      const ev = eventSumRes.data || {};
      const reg = regRes.data || {};
      const att = attRes.data || {};
      const pass = passRes.data || {};
      const duty = dutyRes.data || {};
      const safety = safetyRes.data || {};

      const humanSummary = buildHumanEventSummary({
        eventTitle: ev.title || event.title,
        regTotal: reg.total || 0,
        regSelected: reg.selected || 0,
        checkedIn: att.currentlyInside || 0,
        arrivals: att.checkedIn || 0,
        passesReady: pass.activePasses || 0,
        volunteersAssigned: duty.totalAssigned || 0,
        volunteersOnDuty: duty.totalOnDuty || 0,
        locationsCount: duty.totalLocations || 0,
        openSafetyNotices: safety.totalSafetyNotices || 0,
        activeEscalations: safety.activeEscalationCycles || 0,
        safetyAuthorized: Boolean(safetyRes.authorized),
        updatedAt: nowTimeStr
      });

      return {
        answer: humanSummary.answer,
        grounded: true,
        intent: 'event_summary',
        provenance: humanSummary.provenance,
        breakdown: humanSummary.breakdown,
        deepLinks: [
          { label: 'Event Duty', route: '/admin/operations', tab: 'operations' },
          { label: 'Attendance', route: '/admin/attendance', tab: 'attendance' }
        ],
        suggestedQuestions: [
          'Which duty locations need more people?',
          'Which age group is closest to capacity?',
          'How many children are checked in right now?'
        ]
      };
    }

    // Q13: "How many children have been picked up?"
    if (raw.includes('picked up') && (raw.includes('how many') || raw.includes('count'))) {
      const res = await operationsToolRegistry.executeTool('getAttendanceSummary', context);
      const data = res.data;
      const answer = data.pickedUp === 0
        ? 'No children have been picked up from the event yet.'
        : data.pickedUp === 1
        ? '1 child has been picked up from the event so far.'
        : `${formatNumber(data.pickedUp)} children have been picked up from the event so far.`;

      return {
        answer,
        grounded: true,
        intent: 'attendance_picked_up_count',
        data,
        provenance: formatHumanProvenance('Attendance', event.title, nowTimeStr),
        deepLinks: [{ label: 'View Attendance Desk', route: '/admin/attendance', tab: 'attendance' }]
      };
    }

    // Q14: "How many children are selected?"
    if (raw.includes('how many') && raw.includes('selected')) {
      const res = await operationsToolRegistry.executeTool('getChildrenSummary', context);
      const data = res.data;
      return {
        answer: `There are ${formatNumber(data.selected)} children selected for admission to "${event.title}" (out of ${formatNumber(data.total)} total registrations).`,
        grounded: true,
        intent: 'selected_children_count',
        data,
        provenance: formatHumanProvenance('Applications', event.title, nowTimeStr),
        deepLinks: [{ label: 'Open Applications', route: '/admin/applications', tab: 'applications' }]
      };
    }

    // Q15: "Is registration still open?" / "when does registration close?"
    if (raw.includes('registration open') || raw.includes('registration close') || raw.includes('when does registration')) {
      const res = await operationsToolRegistry.executeTool('getRegistrationWindow', context);
      const data = res.data;
      if (data.isParentRegistrationClosed) {
        return {
          answer: `Parent registration is currently closed. It closed on ${new Date(data.parentClosesAt).toLocaleDateString()}.`,
          grounded: true,
          intent: 'registration_window',
          data,
          provenance: formatHumanProvenance('Configuration', event.title, nowTimeStr)
        };
      }
      if (data.parentClosesAt) {
        const d = new Date(data.parentClosesAt);
        return {
          answer: `Parent registration is open and scheduled to close on ${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
          grounded: true,
          intent: 'registration_window',
          data,
          provenance: formatHumanProvenance('Configuration', event.title, nowTimeStr)
        };
      }
      return {
        answer: 'Parent registration is currently open, and no closing deadline is configured.',
        grounded: true,
        intent: 'registration_window',
        data,
        provenance: formatHumanProvenance('Configuration', event.title, nowTimeStr)
      };
    }

    // Q16: "What reports were generated today?"
    if (raw.includes('reports') && (raw.includes('today') || raw.includes('recent'))) {
      const res = await operationsToolRegistry.executeTool('listReportsGeneratedToday', context);
      const reports = res.data || [];

      if (reports.length === 0) {
        return {
          answer: 'No reports have been generated today for this event.',
          grounded: true,
          intent: 'reports_today',
          provenance: formatHumanProvenance('Reports', event.title, nowTimeStr)
        };
      }

      const rows = reports.map((r: any) => [
        r.report_type,
        r.format,
        r.status,
        new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      ]);

      return {
        answer: formatPlural(reports.length, 'report was generated today.', 'reports were generated today.'),
        grounded: true,
        intent: 'reports_today',
        table: {
          columns: ['Report Type', 'Format', 'Status', 'Generated At'],
          rows
        },
        provenance: formatHumanProvenance('Reports', event.title, nowTimeStr),
        deepLinks: [{ label: 'View Reports Center', route: '/admin/reports', tab: 'reports' }]
      };
    }

    // Q17: "How many applications are under review?"
    if (raw.includes('applications') && (raw.includes('under review') || raw.includes('pending'))) {
      const res = await operationsToolRegistry.executeTool('getRegistrationSummary', context);
      const data = res.data;
      return {
        answer: data.underReview === 0
          ? 'No applications are currently awaiting review.'
          : data.underReview === 1
          ? '1 application is currently awaiting review.'
          : `There are ${formatNumber(data.underReview)} applications currently awaiting review.`,
        grounded: true,
        intent: 'applications_under_review',
        data,
        provenance: formatHumanProvenance('Applications', event.title, nowTimeStr),
        deepLinks: [{ label: 'Review Applications', route: '/admin/review', tab: 'review' }]
      };
    }

    // -------------------------------------------------------------
    // Fallback: ZERO HALLUCINATION for Out-Of-Domain Questions
    // (e.g., "Tell me who will win the next election.")
    // -------------------------------------------------------------
    return {
      answer: "I don't have enough platform data to answer that yet.",
      grounded: false,
      intent: 'unsupported_query',
      suggestedQuestions: [
        'List the volunteers currently on duty.',
        'Which duty locations need more people?',
        'How many children are checked in right now?',
        'Which age group has the highest registration?',
        'Show unresolved escalations.',
        'What changed in the last hour?'
      ]
    };
  }
}

export const operationsQueryPlanner = new OperationsQueryPlanner();
