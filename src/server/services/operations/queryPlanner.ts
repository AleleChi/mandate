import { query } from '../../db';
import { getEventById } from '../eventService';
import { operationsToolRegistry } from './registry';
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
    // 1. Action Attempt Interception (Strict Read-Only Enforcement)
    // -------------------------------------------------------------
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
          provenance: {
            source: 'Operational Policy · Read-Only Guardrail',
            updatedAt: nowTimeStr
          },
          suggestedQuestions: [
            `Who is assigned to Grace Hall?`,
            'List the volunteers currently on duty.',
            'Which duty locations need more people?'
          ]
        };
      }

      return {
        answer: 'Action requests are not enabled in Operations Assistant yet. All operations in Phase 2 are strictly read-only.',
        grounded: true,
        intent: 'action_attempt',
        actionAttempt: true,
        provenance: {
          source: 'Operational Policy · Read-Only Guardrail',
          updatedAt: nowTimeStr
        }
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

      const limitNote = total > volunteers.length ? ` (showing ${volunteers.length} of ${total})` : '';
      const answer = total === 0
        ? 'There are currently 0 volunteers on duty for this event.'
        : `${total} volunteer${total === 1 ? ' is' : 's are'} currently active on duty${limitNote}.`;

      return {
        answer,
        grounded: true,
        intent: 'volunteers_on_duty_list',
        table,
        provenance: {
          source: 'Event Duty · Current Event',
          updatedAt: nowTimeStr
        },
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
        : `${total} volunteer${total === 1 ? ' is' : 's are'} assigned to ${matchedLocation.name}: ${names}.`;

      return {
        answer,
        grounded: true,
        intent: 'volunteers_assigned_to_location',
        table,
        provenance: {
          source: `Event Duty · ${matchedLocation.name}`,
          updatedAt: nowTimeStr
        },
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
        ? 'All scheduled volunteers have checked in and reported for duty.'
        : `${total} assigned volunteer${total === 1 ? '' : 's'} have not reported for duty yet.`;

      return {
        answer,
        grounded: true,
        intent: 'volunteers_no_show_list',
        table,
        provenance: {
          source: 'Event Duty · Presence Tracking',
          updatedAt: nowTimeStr
        },
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

      const answer = `${data.currentlyInside} children are checked in right now (${data.checkedIn} total arrivals, ${data.pickedUp} picked up).`;

      return {
        answer,
        grounded: true,
        intent: 'attendance_checked_in_count',
        data,
        provenance: {
          source: 'Attendance Desk · Current Event',
          updatedAt: nowTimeStr
        },
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
        : `${total} selected child${total === 1 ? ' does' : 'ren do'} not have passes yet.`;

      return {
        answer,
        grounded: true,
        intent: 'selected_children_without_passes_list',
        table,
        provenance: {
          source: 'Pass Issuance · Current Event',
          updatedAt: nowTimeStr
        },
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
          provenance: {
            source: 'Event Configuration · Age Groups',
            updatedAt: nowTimeStr
          }
        };
      }

      const sorted = [...groups].sort((a, b) => b.percentageFilled - a.percentageFilled);
      const closest = sorted[0];

      const breakdown = {
        title: 'Age Group Capacity Breakdown',
        items: sorted.map((g: any) => ({
          label: g.label,
          primary: `${g.selectedCount} / ${g.capacity} spaces`,
          secondary: `${g.percentageFilled}%`,
          meta: `${g.remaining} remaining`
        }))
      };

      const table: TableData = {
        columns: ['Age Group', 'Registered', 'Selected', 'Capacity', 'Remaining', 'Filled %'],
        rows: sorted.map((g: any) => [
          g.label,
          g.registeredCount,
          g.selectedCount,
          g.capacity,
          g.remaining,
          `${g.percentageFilled}%`
        ])
      };

      const answer = `${closest.label} is closest to capacity at ${closest.percentageFilled}% (${closest.selectedCount} of ${closest.capacity} spaces selected).`;

      return {
        answer,
        grounded: true,
        intent: 'age_group_capacity',
        breakdown,
        table,
        provenance: {
          source: 'Event Configuration · Age Groups',
          updatedAt: nowTimeStr
        },
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

      const answer = `${data.unassignedApprovedVolunteers} approved volunteers are currently not assigned to any duty post for this event (${data.volunteersAssigned} assigned out of ${data.approvedVolunteers} total approved).`;

      return {
        answer,
        grounded: true,
        intent: 'volunteers_unassigned_count',
        data,
        provenance: {
          source: 'Volunteer Management · Current Event',
          updatedAt: nowTimeStr
        },
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
          provenance: {
            source: 'Authorization Guard · Safety Desk',
            updatedAt: nowTimeStr
          }
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
        ? 'There are currently 0 active or unresolved escalation cycles.'
        : `There ${total === 1 ? 'is' : 'are'} ${total} active escalation cycle${total === 1 ? '' : 's'} awaiting resolution.`;

      return {
        answer,
        grounded: true,
        intent: 'escalations_unresolved_list',
        table,
        provenance: {
          source: 'Safety Escalation Desk · Live Feed',
          updatedAt: nowTimeStr
        },
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
        : `${activities.length} operational record${activities.length === 1 ? ' was' : 's were'} logged in the ${timeframeLabel}.`;

      return {
        answer,
        grounded: true,
        intent: 'recent_activity',
        table,
        provenance: {
          source: 'Operational Audit Log · Current Event',
          updatedAt: nowTimeStr
        },
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
          provenance: {
            source: 'Event Duty · Staffing Plan',
            updatedAt: nowTimeStr
          },
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
      const answer = `${locations.length} duty location${locations.length === 1 ? ' needs' : 's need'} more volunteers: ${names}.`;

      return {
        answer,
        grounded: true,
        intent: 'understaffed_locations_list',
        table,
        provenance: {
          source: 'Event Duty · Staffing Plan',
          updatedAt: nowTimeStr
        },
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

      const safetyClause = safetyRes.authorized
        ? `${safety.totalSafetyNotices || 0} open safety notice(s) and ${safety.activeEscalationCycles || 0} active escalation cycle(s).`
        : 'Safety details restricted.';

      const answer = `Registration is open for "${ev.title || event.title}". ${reg.selected || 0} children are selected (${reg.total || 0} total registrations). ${att.currentlyInside || 0} children are checked in right now (${att.checkedIn || 0} total arrivals). ${pass.activePasses || 0} digital passes are ready. ${duty.totalAssigned || 0} volunteers are assigned (${duty.totalOnDuty || 0} currently on duty across ${duty.totalLocations || 0} locations). ${safetyClause}`;

      return {
        answer,
        grounded: true,
        intent: 'event_summary',
        provenance: {
          source: 'Multi-Tool Operations Synthesis · Current Event',
          updatedAt: nowTimeStr
        },
        breakdown: {
          title: 'Core Operations Snapshot',
          items: [
            { label: 'Registrations', primary: reg.total || 0, secondary: `${reg.selected || 0} selected` },
            { label: 'Attendance', primary: `${att.currentlyInside || 0} checked in`, secondary: `${att.checkedIn || 0} arrivals` },
            { label: 'Passes Ready', primary: pass.activePasses || 0, secondary: `${pass.selectedWithoutPasses || 0} missing` },
            { label: 'Duty Staffing', primary: `${duty.totalOnDuty || 0} on duty`, secondary: `${duty.totalAssigned || 0} assigned` },
            { label: 'Safety Notices', primary: safety.totalSafetyNotices || 0, secondary: `${safety.activeEscalationCycles || 0} escalations` }
          ]
        },
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
      return {
        answer: `${data.pickedUp} children have been picked up from the event so far.`,
        grounded: true,
        intent: 'attendance_picked_up_count',
        data,
        provenance: {
          source: 'Attendance Desk · Current Event',
          updatedAt: nowTimeStr
        },
        deepLinks: [{ label: 'View Attendance Desk', route: '/admin/attendance', tab: 'attendance' }]
      };
    }

    // Q14: "How many children are selected?"
    if (raw.includes('how many') && raw.includes('selected')) {
      const res = await operationsToolRegistry.executeTool('getChildrenSummary', context);
      const data = res.data;
      return {
        answer: `There are ${data.selected} children selected for admission to "${event.title}" (out of ${data.total} total registrations).`,
        grounded: true,
        intent: 'selected_children_count',
        data,
        provenance: {
          source: 'Child Admissions · Current Event',
          updatedAt: nowTimeStr
        },
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
          provenance: { source: 'Event Configuration', updatedAt: nowTimeStr }
        };
      }
      if (data.parentClosesAt) {
        const d = new Date(data.parentClosesAt);
        return {
          answer: `Parent registration is open and scheduled to close on ${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
          grounded: true,
          intent: 'registration_window',
          data,
          provenance: { source: 'Event Configuration', updatedAt: nowTimeStr }
        };
      }
      return {
        answer: 'Parent registration is currently open, and no closing deadline is configured.',
        grounded: true,
        intent: 'registration_window',
        data,
        provenance: { source: 'Event Configuration', updatedAt: nowTimeStr }
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
          provenance: { source: 'Reporting Engine', updatedAt: nowTimeStr }
        };
      }

      const rows = reports.map((r: any) => [
        r.report_type,
        r.format,
        r.status,
        new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      ]);

      return {
        answer: `${reports.length} report${reports.length === 1 ? ' was' : 's were'} generated today.`,
        grounded: true,
        intent: 'reports_today',
        table: {
          columns: ['Report Type', 'Format', 'Status', 'Generated At'],
          rows
        },
        provenance: { source: 'Reporting Engine', updatedAt: nowTimeStr },
        deepLinks: [{ label: 'View Reports Center', route: '/admin/reports', tab: 'reports' }]
      };
    }

    // Q17: "How many applications are under review?"
    if (raw.includes('applications') && (raw.includes('under review') || raw.includes('pending'))) {
      const res = await operationsToolRegistry.executeTool('getRegistrationSummary', context);
      const data = res.data;
      return {
        answer: `There are ${data.underReview} applications currently awaiting review.`,
        grounded: true,
        intent: 'applications_under_review',
        data,
        provenance: { source: 'Review Board · Current Event', updatedAt: nowTimeStr },
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
