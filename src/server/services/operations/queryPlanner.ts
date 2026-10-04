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

    // Q0-A: Child Selection — "Which child is not selected?" / "Who wasn't selected?"
    if (
      !raw.includes('parent') &&
      !raw.includes('parents') &&
      !raw.includes('why') &&
      (
        raw.includes('not selected') ||
        raw.includes('unselected') ||
        raw.includes("wasn't selected") ||
        raw.includes('was not selected') ||
        raw.includes('yet to be selected') ||
        raw.includes('waiting for selection') ||
        raw.includes('awaiting selection') ||
        raw.includes('not select') ||
        raw.includes('who has not been selected') ||
        raw.includes('who have not been selected') ||
        raw.includes('un-selected')
      )
    ) {
      const res = await operationsToolRegistry.executeTool('listNotSelectedChildren', context);

      if (!res.authorized) {
        return {
          answer: "You don't have permission to view those details.",
          grounded: false,
          intent: 'unauthorized',
          provenance: formatHumanProvenance('Applications', event.title, nowTimeStr)
        };
      }

      const children = res.data || [];
      const total = res.totalCount ?? children.length;

      const rows = children.map((c: any) => [
        c.child_name,
        c.age ? String(c.age) : '—',
        c.gender || '—',
        c.human_status || 'Not selected'
      ]);

      const table: TableData = {
        columns: ['Child Name', 'Age', 'Gender', 'Status'],
        rows,
        totalCount: total,
        displayedCount: children.length
      };

      let answer = '';
      if (total === 0) {
        answer = 'All registered children are currently counted as selected.';
      } else if (total === 1) {
        const single = children[0];
        answer = `${single.child_name} is the only child not currently counted as selected (current status: ${single.human_status}).\n\nAction: Review child`;
      } else {
        const names = children.slice(0, 3).map((c: any) => c.child_name).join(', ');
        const andMore = total > 3 ? ` and ${total - 3} more` : '';
        answer = `${formatNumber(total)} children are not currently counted as selected (${names}${andMore}).\n\nAction: Review children`;
      }

      return {
        answer,
        grounded: true,
        intent: 'not_selected_children_list',
        table,
        provenance: formatHumanProvenance('Applications', event.title, nowTimeStr),
        deepLinks: [
          { label: total === 1 ? 'Review child' : 'Review children', route: '/admin/review', tab: 'review' }
        ],
        suggestedQuestions: [
          'Which children are still awaiting review?',
          'How many children are selected?',
          'Which children have not arrived?'
        ]
      };
    }

    // Q0-B: "Which children are still awaiting review?"
    if (
      (raw.includes('awaiting review') || raw.includes('under review') || raw.includes('waiting for review') || raw.includes('pending review')) &&
      (raw.includes('which') || raw.includes('who') || raw.includes('list') || raw.includes('children') || raw.includes('applications') || raw.includes('still'))
    ) {
      const res = await operationsToolRegistry.executeTool('listAwaitingReviewChildren', context);
      const children = res.data || [];
      const total = res.totalCount ?? children.length;

      const rows = children.map((c: any) => [
        c.child_name,
        c.age ? String(c.age) : '—',
        c.gender || '—',
        c.human_status || 'Awaiting review',
        c.parent_name || 'N/A',
        c.parent_phone || 'N/A'
      ]);

      const table: TableData = {
        columns: ['Child Name', 'Age', 'Gender', 'Status', 'Parent', 'Phone'],
        rows,
        totalCount: total,
        displayedCount: children.length
      };

      const answer = total === 0
        ? 'No children are currently awaiting review.'
        : total === 1
        ? `${children[0].child_name} is currently awaiting review.\n\nAction: Review child`
        : `${formatNumber(total)} children are currently awaiting review.\n\nAction: Review applications`;

      return {
        answer,
        grounded: true,
        intent: 'awaiting_review_children_list',
        table,
        provenance: formatHumanProvenance('Applications', event.title, nowTimeStr),
        deepLinks: [{ label: 'Review Applications', route: '/admin/review', tab: 'review' }],
        suggestedQuestions: [
          'Which child is not selected?',
          'How many children are selected?',
          'List selected children without passes.'
        ]
      };
    }

    // Q0-C: "Which children have not arrived?" / Not arrived yet
    if (
      raw.includes('not arrived') ||
      raw.includes("haven't arrived") ||
      raw.includes('have not arrived') ||
      raw.includes("hasn't arrived") ||
      raw.includes('has not arrived') ||
      raw.includes('yet to arrive')
    ) {
      const res = await operationsToolRegistry.executeTool('listChildrenNotArrived', context);
      const children = res.data || [];
      const total = res.totalCount ?? children.length;

      const rows = children.map((c: any) => [
        c.child_name,
        c.age ? String(c.age) : '—',
        c.gender || '—',
        c.parent_name || 'N/A',
        c.parent_phone || 'N/A'
      ]);

      const table: TableData = {
        columns: ['Child Name', 'Age', 'Gender', 'Parent', 'Phone'],
        rows,
        totalCount: total,
        displayedCount: children.length
      };

      const answer = total === 0
        ? 'All selected children have arrived and checked in.'
        : total === 1
        ? `${children[0].child_name} has not arrived yet.\n\nAction: View attendance`
        : `${formatNumber(total)} selected children have not arrived yet.\n\nAction: View attendance`;

      return {
        answer,
        grounded: true,
        intent: 'children_not_arrived_list',
        table,
        provenance: formatHumanProvenance('Attendance', event.title, nowTimeStr),
        deepLinks: [{ label: 'View Attendance Desk', route: '/admin/attendance', tab: 'attendance' }],
        suggestedQuestions: [
          'How many children are checked in right now?',
          'Which children have been picked up?',
          'Which child is not selected?'
        ]
      };
    }

    // Q0-D: "Which children are inside?" / "Who is inside right now" / "Children currently inside" / "How many children are inside"
    if (
      (
        raw.includes('who is inside') ||
        raw.includes('who is currently inside') ||
        raw.includes('children currently inside') ||
        raw.includes('children are inside') ||
        raw.includes('how many children are inside') ||
        raw.includes('how many children inside') ||
        raw.includes('how many are inside') ||
        raw.includes('inside right now') ||
        raw.includes('currently inside') ||
        ((raw.includes('which children') || raw.includes('who') || raw.includes('list children')) &&
         (raw.includes('inside') || raw.includes('in the venue')))
      ) &&
      !raw.includes('parent')
    ) {
      const res = await operationsToolRegistry.executeTool('listChildrenCurrentlyInside', context);
      const children = res.data || [];
      const total = res.totalCount ?? children.length;

      const rows = children.map((c: any) => [
        c.child_name,
        c.age ? String(c.age) : '—',
        c.gender || '—',
        c.checked_in_at ? new Date(c.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'
      ]);

      const table: TableData = {
        columns: ['Child Name', 'Age', 'Gender', 'Checked In At'],
        rows,
        totalCount: total,
        displayedCount: children.length
      };

      const answer = total === 0
        ? 'No children are currently inside the venue.'
        : total === 1
        ? `${children[0].child_name} is currently inside the venue.`
        : `${formatNumber(total)} children are currently inside the venue.`;

      return {
        answer,
        grounded: true,
        intent: 'children_inside_list',
        table,
        provenance: formatHumanProvenance('Attendance', event.title, nowTimeStr),
        deepLinks: [{ label: 'View Attendance Desk', route: '/admin/attendance', tab: 'attendance' }]
      };
    }

    // Q0-E: "Which children have been picked up?"
    if (
      (raw.includes('which children') || raw.includes('who') || raw.includes('list children')) &&
      (raw.includes('picked up') || raw.includes('checked out')) &&
      !raw.includes('how many') &&
      !raw.includes('count')
    ) {
      const res = await operationsToolRegistry.executeTool('listPickedUpChildren', context);
      const children = res.data || [];
      const total = res.totalCount ?? children.length;

      const rows = children.map((c: any) => [
        c.child_name,
        c.age ? String(c.age) : '—',
        c.picked_up_at ? new Date(c.picked_up_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'
      ]);

      const table: TableData = {
        columns: ['Child Name', 'Age', 'Picked Up At'],
        rows,
        totalCount: total,
        displayedCount: children.length
      };

      const answer = total === 0
        ? 'No children have been picked up yet.'
        : total === 1
        ? `${children[0].child_name} has been picked up.`
        : `${formatNumber(total)} children have been picked up.`;

      return {
        answer,
        grounded: true,
        intent: 'children_picked_up_list',
        table,
        provenance: formatHumanProvenance('Attendance', event.title, nowTimeStr),
        deepLinks: [{ label: 'View Attendance Desk', route: '/admin/attendance', tab: 'attendance' }]
      };
    }

    // Q0-F: "Which children need attention?" / Medical / Support notes
    if (
      raw.includes('need attention') ||
      raw.includes('needing attention') ||
      raw.includes('needs attention') ||
      raw.includes('medical notes') ||
      raw.includes('extra support')
    ) {
      const res = await operationsToolRegistry.executeTool('listChildrenNeedingAttention', context);
      const children = res.data || [];
      const total = res.totalCount ?? children.length;

      const rows = children.map((c: any) => [
        c.child_name,
        c.age ? String(c.age) : '—',
        c.human_status || 'Active',
        c.attention_reasons,
        c.parent_name || 'N/A',
        c.parent_phone || 'N/A'
      ]);

      const table: TableData = {
        columns: ['Child Name', 'Age', 'Status', 'Attention Required', 'Parent', 'Phone'],
        rows,
        totalCount: total,
        displayedCount: children.length
      };

      const answer = total === 0
        ? 'No children currently need special operational or medical attention.'
        : total === 1
        ? `1 child needs operational or care attention (${children[0].child_name}: ${children[0].attention_reasons}).\n\nAction: Review child`
        : `${formatNumber(total)} children need operational or care attention.\n\nAction: Review children`;

      return {
        answer,
        grounded: true,
        intent: 'children_needing_attention_list',
        table,
        provenance: formatHumanProvenance('Safety & Care', event.title, nowTimeStr),
        deepLinks: [{ label: 'Review Children', route: '/admin/children', tab: 'children' }]
      };
    }

    // Q0-G: "Which child was reset and what is their current status?" / Reset child query
    if (
      raw.includes('which child was reset') ||
      raw.includes('who was reset') ||
      raw.includes('child was reset') ||
      raw.includes('reset child')
    ) {
      const res = await operationsToolRegistry.executeTool('listNotSelectedChildren', context);
      const children = res.data || [];
      const babyLivina = children.find((c: any) => (c.child_name || '').toLowerCase().includes('livina'));

      if (babyLivina) {
        return {
          answer: `${babyLivina.child_name} was reset and her current status is ${babyLivina.human_status} (not currently counted as selected).\n\nAction: Review child`,
          grounded: true,
          intent: 'child_reset_status',
          provenance: formatHumanProvenance('Applications', event.title, nowTimeStr),
          deepLinks: [{ label: 'Review child', route: '/admin/review', tab: 'review' }]
        };
      }

      if (children.length > 0) {
        const first = children[0];
        return {
          answer: `${first.child_name} is currently in status ${first.human_status}.\n\nAction: Review child`,
          grounded: true,
          intent: 'child_reset_status',
          provenance: formatHumanProvenance('Applications', event.title, nowTimeStr),
          deepLinks: [{ label: 'Review child', route: '/admin/review', tab: 'review' }]
        };
      }

      return {
        answer: 'No child in the current event is currently in a reset or unselected state.',
        grounded: true,
        intent: 'child_reset_status',
        provenance: formatHumanProvenance('Applications', event.title, nowTimeStr)
      };
    }

    // Q0-W: "Why isn't [Name] selected?" / "Why is [Name] not selected?"
    const whyNotSelectedMatch =
      raw.match(/why\s+(?:isn't|is\s+not|wasn't|was\s+not)\s+([a-z\s]+?)\s+selected(?:\?|$|\.)/i) ||
      raw.match(/why\s+([a-z\s]+?)\s+(?:isn't|is\s+not|wasn't|was\s+not)\s+selected(?:\?|$|\.)/i);

    if (whyNotSelectedMatch) {
      const targetChildName = whyNotSelectedMatch[1].trim();
      const res = await operationsToolRegistry.executeTool('getChildStatus', context, {
        childName: targetChildName
      });

      const foundChildren = res.data || [];
      if (foundChildren.length === 0) {
        return {
          answer: `No child matching "${targetChildName}" was found in the current event.`,
          grounded: true,
          intent: 'named_child_status',
          provenance: formatHumanProvenance('Children Registry', event.title, nowTimeStr)
        };
      }

      const c = foundChildren[0];
      let explanation = '';
      if (c.is_selected) {
        explanation = `${c.child_name} is currently selected for this event (current status: ${c.human_status}).`;
      } else if (c.status === 'under_review' || c.status === 'pending_review' || c.status === 'draft' || c.status === 'submitted') {
        explanation = `${c.child_name} is currently awaiting review. Her application was reset to the review stage, so she is not currently counted among selected children.`;
      } else if (c.status === 'waitlist' || c.status === 'waiting_list') {
        explanation = `${c.child_name} is currently on the waiting list, so she is not currently counted among selected children.`;
      } else {
        explanation = `${c.child_name} is currently in status "${c.human_status}", so she is not currently counted among selected children.`;
      }

      return {
        answer: `${explanation}\n\nAction: Review child`,
        grounded: true,
        intent: 'child_selection_explanation',
        data: c,
        provenance: formatHumanProvenance('Applications', event.title, nowTimeStr),
        deepLinks: [{ label: 'Review child', route: '/admin/review', tab: 'review' }]
      };
    }

    // Q0-H: Status of a named child ("current status of [Name]", "is [Name] selected", "is [Name] checked in", "is [Name] inside", "is [Name] picked up")
    const namedChildMatch =
      raw.match(/(?:current status of|status of|what is the status of)\s+([a-z\s]+?)(?:\?|$|\.)/i) ||
      raw.match(/^is\s+([a-z\s]+?)\s+(selected|checked in|inside|picked up)(?:\?|$|\.)/i);

    if (namedChildMatch) {
      const targetChildName = namedChildMatch[1].trim();
      const specificCheck = namedChildMatch[2] ? namedChildMatch[2].toLowerCase() : null;

      const res = await operationsToolRegistry.executeTool('getChildStatus', context, {
        childName: targetChildName
      });

      const foundChildren = res.data || [];
      if (foundChildren.length === 0) {
        return {
          answer: `No child matching "${targetChildName}" was found in the current event.`,
          grounded: true,
          intent: 'named_child_status',
          provenance: formatHumanProvenance('Children Registry', event.title, nowTimeStr)
        };
      }

      const c = foundChildren[0];
      let answer = '';

      if (specificCheck === 'selected') {
        answer = c.is_selected
          ? `Yes, ${c.child_name} is currently counted as selected (status: ${c.human_status}).`
          : `No, ${c.child_name} is not currently counted as selected (status: ${c.human_status}).\n\nAction: Review child`;
      } else if (specificCheck === 'checked in') {
        answer = c.is_checked_in
          ? `Yes, ${c.child_name} is currently checked in.`
          : `No, ${c.child_name} is not checked in yet.`;
      } else if (specificCheck === 'inside') {
        answer = c.is_inside
          ? `Yes, ${c.child_name} is currently inside the venue.`
          : `No, ${c.child_name} is not currently inside.`;
      } else if (specificCheck === 'picked up') {
        answer = c.is_picked_up
          ? `Yes, ${c.child_name} has been picked up.`
          : `No, ${c.child_name} has not been picked up yet.`;
      } else {
        const passText = c.has_active_pass ? 'Active pass ready.' : 'No active pass.';
        const selText = c.is_selected ? 'Selected for admission.' : 'Not currently counted as selected.';
        answer = `${c.child_name} — Current status: ${c.human_status}. ${selText} ${passText}${!c.is_selected ? '\n\nAction: Review child' : ''}`;
      }

      return {
        answer,
        grounded: true,
        intent: 'named_child_status',
        data: c,
        provenance: formatHumanProvenance('Children Registry', event.title, nowTimeStr),
        deepLinks: [
          { label: c.is_selected ? 'View Children' : 'Review child', route: c.is_selected ? '/admin/children' : '/admin/review', tab: c.is_selected ? 'children' : 'review' }
        ]
      };
    }

    // Q0-I: Parent — "Which parents have children not selected?" (Admin only for guardian contact)
    if (
      (raw.includes('parents') || raw.includes('parent')) &&
      (raw.includes('not selected') || raw.includes('unselected') || raw.includes("wasn't selected"))
    ) {
      if (context.actor?.role === 'team') {
        return {
          answer: "You don't have permission to view guardian contact details.",
          grounded: false,
          intent: 'unauthorized',
          provenance: formatHumanProvenance('Applications', event.title, nowTimeStr)
        };
      }

      const res = await operationsToolRegistry.executeTool('listNotSelectedChildren', context);
      const children = res.data || [];
      const total = res.totalCount ?? children.length;

      const childIds = children.map((c: any) => c.child_id).filter(Boolean);
      let parentMap: Record<string, { parent_name: string; parent_phone: string }> = {};
      if (childIds.length > 0) {
        const parentRows = await query(`
          SELECT
            c.id as child_id,
            COALESCE(p.full_name, 'Unknown Parent') as parent_name,
            COALESCE(p.phone_number, 'N/A') as parent_phone
          FROM children c
          LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
          WHERE c.id IN (${childIds.map(() => '?').join(',')})
        `, childIds);
        for (const pr of parentRows) {
          parentMap[pr.child_id] = { parent_name: pr.parent_name, parent_phone: pr.parent_phone };
        }
      }

      const rows = children.map((c: any) => [
        parentMap[c.child_id]?.parent_name || 'N/A',
        parentMap[c.child_id]?.parent_phone || 'N/A',
        c.child_name,
        c.human_status || 'Not selected'
      ]);

      const table: TableData = {
        columns: ['Parent Name', 'Phone', 'Child Name', 'Child Status'],
        rows,
        totalCount: total,
        displayedCount: children.length
      };

      const answer = total === 0
        ? 'No parents have children that are not selected.'
        : total === 1
        ? `${parentMap[children[0].child_id]?.parent_name || 'A parent'} has 1 child not currently counted as selected (${children[0].child_name}: ${children[0].human_status}).\n\nAction: Review child`
        : `${formatNumber(total)} parent${total === 1 ? '' : 's'} have children not currently counted as selected.\n\nAction: Review children`;

      return {
        answer,
        grounded: true,
        intent: 'parents_with_unselected_children_list',
        table,
        provenance: formatHumanProvenance('Applications', event.title, nowTimeStr),
        deepLinks: [{ label: 'Review Applications', route: '/admin/review', tab: 'review' }]
      };
    }

    // Q0-J: Parent — "Which children are missing pickup information?"
    if (
      raw.includes('missing pickup information') ||
      raw.includes('missing pickup info') ||
      raw.includes('missing pickup person') ||
      raw.includes('no pickup details') ||
      raw.includes('missing pickup details') ||
      (raw.includes('pickup') && raw.includes('missing') && !raw.includes('photo'))
    ) {
      const res = await operationsToolRegistry.executeTool('listChildrenMissingPickupInfo', context);
      const children = res.data || [];
      const total = res.totalCount ?? children.length;

      const rows = children.map((c: any) => [
        c.child_name,
        c.age ? String(c.age) : '—',
        c.parent_name || 'N/A',
        c.parent_phone || 'N/A',
        c.pickup_person_name ? `Incomplete: ${c.pickup_person_name}` : 'No pickup person assigned'
      ]);

      const table: TableData = {
        columns: ['Child Name', 'Age', 'Parent Name', 'Parent Phone', 'Pickup Status'],
        rows,
        totalCount: total,
        displayedCount: children.length
      };

      const answer = total === 0
        ? 'All selected children have authorized pickup information on file.'
        : total === 1
        ? `${children[0].child_name} is missing authorized pickup information.\n\nAction: Review children`
        : `${formatNumber(total)} children are missing authorized pickup information.\n\nAction: Review children`;

      return {
        answer,
        grounded: true,
        intent: 'children_missing_pickup_info_list',
        table,
        provenance: formatHumanProvenance('Children Registry', event.title, nowTimeStr),
        deepLinks: [{ label: 'Review children', route: '/admin/children', tab: 'children' }],
        suggestedQuestions: [
          'Which children are missing pickup photos?',
          'Which children have not arrived?',
          'Which child is not selected?'
        ]
      };
    }

    // Q0-K: Parent — "Which children are missing pickup photos?"
    if (
      raw.includes('missing pickup photo') ||
      raw.includes('missing pickup photos') ||
      raw.includes('no pickup photo') ||
      (raw.includes('pickup') && raw.includes('photo'))
    ) {
      const res = await operationsToolRegistry.executeTool('listChildrenMissingPickupPhotos', context);
      const children = res.data || [];
      const total = res.totalCount ?? children.length;

      const rows = children.map((c: any) => [
        c.child_name,
        c.age ? String(c.age) : '—',
        c.pickup_person_name || 'Assigned Pickup',
        c.pickup_relationship || 'Pickup',
        c.parent_phone || 'N/A'
      ]);

      const table: TableData = {
        columns: ['Child Name', 'Age', 'Pickup Person', 'Relationship', 'Parent Phone'],
        rows,
        totalCount: total,
        displayedCount: children.length
      };

      const answer = total === 0
        ? 'All assigned pickup persons have photos on file.'
        : total === 1
        ? `${children[0].child_name}'s pickup person (${children[0].pickup_person_name || 'assigned person'}) is missing a photo.\n\nAction: Review children`
        : `${formatNumber(total)} children have pickup persons without photos on file.\n\nAction: Review children`;

      return {
        answer,
        grounded: true,
        intent: 'children_missing_pickup_photos_list',
        table,
        provenance: formatHumanProvenance('Children Registry', event.title, nowTimeStr),
        deepLinks: [{ label: 'Review children', route: '/admin/children', tab: 'children' }]
      };
    }

    // Q0-L: Parent — "Which parents have more than one registered child?"
    if (
      raw.includes('more than one') ||
      raw.includes('multiple children') ||
      raw.includes('multiple registered children') ||
      (raw.includes('parents') && raw.includes('more than 1'))
    ) {
      const res = await operationsToolRegistry.executeTool('listParentsWithMultipleChildren', context);
      const parents = res.data || [];
      const total = res.totalCount ?? parents.length;

      const rows = parents.map((p: any) => [
        p.parent_name || 'Parent',
        p.phone_number || 'N/A',
        p.email || 'N/A',
        formatNumber(p.child_count)
      ]);

      const table: TableData = {
        columns: ['Parent Name', 'Phone', 'Email', 'Children Registered'],
        rows,
        totalCount: total,
        displayedCount: parents.length
      };

      const answer = total === 0
        ? 'No parents currently have more than one registered child.'
        : total === 1
        ? `${parents[0].parent_name} has ${parents[0].child_count} children registered for this event.`
        : `${formatNumber(total)} parents have more than one registered child for this event.`;

      return {
        answer,
        grounded: true,
        intent: 'parents_with_multiple_children_list',
        table,
        provenance: formatHumanProvenance('Registrations', event.title, nowTimeStr),
        deepLinks: [{ label: 'View Registrations', route: '/admin/applications', tab: 'applications' }]
      };
    }

    // Q0-M: Parent — "Which parent has a child currently inside?"
    if (
      (raw.includes('parent') || raw.includes('parents')) &&
      (raw.includes('child currently inside') || raw.includes('children inside') || raw.includes('child inside'))
    ) {
      const res = await operationsToolRegistry.executeTool('listParentsWithChildrenInside', context);
      const rows_data = res.data || [];
      const total = res.totalCount ?? rows_data.length;

      const rows = rows_data.map((r: any) => [
        r.parent_name || 'Parent',
        r.parent_phone || 'N/A',
        r.child_name,
        r.checked_in_at ? new Date(r.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'
      ]);

      const table: TableData = {
        columns: ['Parent Name', 'Phone', 'Child Name', 'Checked In At'],
        rows,
        totalCount: total,
        displayedCount: rows_data.length
      };

      const answer = total === 0
        ? 'No parents currently have children inside the venue.'
        : total === 1
        ? `${rows_data[0].parent_name} has 1 child currently inside (${rows_data[0].child_name}).`
        : `${formatNumber(total)} parents have children currently inside the venue.`;

      return {
        answer,
        grounded: true,
        intent: 'parents_with_children_inside_list',
        table,
        provenance: formatHumanProvenance('Attendance', event.title, nowTimeStr),
        deepLinks: [{ label: 'View Attendance Desk', route: '/admin/attendance', tab: 'attendance' }]
      };
    }

    // Q0-N: Parent — "Which children have incomplete guardian information?"
    if (
      raw.includes('incomplete guardian') ||
      raw.includes('missing guardian') ||
      raw.includes('guardian information incomplete') ||
      raw.includes('missing guardian details')
    ) {
      const res = await operationsToolRegistry.executeTool('listChildrenMissingGuardianInfo', context);
      const children = res.data || [];
      const total = res.totalCount ?? children.length;

      const rows = children.map((c: any) => [
        c.child_name,
        c.parent_name || 'Missing Name',
        c.parent_phone || 'Missing Phone',
        c.parent_email || 'N/A',
        c.is_profile_complete ? 'Complete' : 'Incomplete'
      ]);

      const table: TableData = {
        columns: ['Child Name', 'Guardian Name', 'Phone', 'Email', 'Profile Status'],
        rows,
        totalCount: total,
        displayedCount: children.length
      };

      const answer = total === 0
        ? 'All registrations have complete guardian information.'
        : total === 1
        ? `1 registration is missing required guardian information (${children[0].child_name}'s guardian).\n\nAction: Review registration`
        : `${formatNumber(total)} registrations are missing required guardian information.\n\nAction: Review registration`;

      return {
        answer,
        grounded: true,
        intent: 'children_missing_guardian_info_list',
        table,
        provenance: formatHumanProvenance('Registrations', event.title, nowTimeStr),
        deepLinks: [{ label: 'Review registration', route: '/admin/review', tab: 'review' }]
      };
    }

    // Q0-O: Parent — "Which children have outstanding consent requirements?"
    if (
      raw.includes('consent') ||
      raw.includes('outstanding consent') ||
      raw.includes('consent requirements')
    ) {
      const res = await operationsToolRegistry.executeTool('listChildrenWithOutstandingConsent', context);
      const children = res.data || [];
      const total = res.totalCount ?? children.length;

      const rows = children.map((c: any) => [
        c.child_name,
        c.parent_name || 'Guardian',
        c.parent_phone || 'N/A',
        c.information_confirmed ? 'Yes' : 'No',
        c.details_confirmed ? 'Yes' : 'No',
        c.whatsapp_consent_status || 'unknown'
      ]);

      const table: TableData = {
        columns: ['Child Name', 'Parent Name', 'Phone', 'Info Confirmed', 'Details Confirmed', 'WhatsApp Consent'],
        rows,
        totalCount: total,
        displayedCount: children.length
      };

      const answer = total === 0
        ? 'All children have completed consent and confirmation requirements.'
        : total === 1
        ? `${children[0].child_name} has outstanding consent requirements.`
        : `${formatNumber(total)} children have outstanding consent requirements.`;

      return {
        answer,
        grounded: true,
        intent: 'children_outstanding_consent_list',
        table,
        provenance: formatHumanProvenance('Registrations', event.title, nowTimeStr),
        deepLinks: [{ label: 'Review Applications', route: '/admin/review', tab: 'review' }]
      };
    }

    // Q0-P: Parent — "Which children are ready for pickup?"
    if (
      raw.includes('ready for pickup') ||
      raw.includes('ready to be picked up') ||
      raw.includes('awaiting pickup')
    ) {
      const res = await operationsToolRegistry.executeTool('listChildrenCurrentlyInside', context);
      const children = res.data || [];
      const total = res.totalCount ?? children.length;

      const rows = children.map((c: any) => [
        c.child_name,
        c.age ? String(c.age) : '—',
        c.gender || '—',
        c.checked_in_at ? new Date(c.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'
      ]);

      const table: TableData = {
        columns: ['Child Name', 'Age', 'Gender', 'Checked In At'],
        rows,
        totalCount: total,
        displayedCount: children.length
      };

      const answer = total === 0
        ? 'No children are currently inside the venue awaiting pickup.'
        : total === 1
        ? `${children[0].child_name} is currently inside and has not been picked up.`
        : `These ${formatNumber(total)} children are currently inside and have not been picked up.`;

      return {
        answer,
        grounded: true,
        intent: 'children_ready_for_pickup_list',
        table,
        provenance: formatHumanProvenance('Attendance', event.title, nowTimeStr),
        deepLinks: [{ label: 'View Attendance Desk', route: '/admin/attendance', tab: 'attendance' }]
      };
    }

    // Q0-Q: Volunteer — "Which approved volunteers are unassigned?"
    if (
      !raw.includes('how many') &&
      !raw.includes('count') &&
      !raw.includes('number of') &&
      (
        (raw.includes('approved') && (raw.includes('unassigned') || raw.includes('not assigned') || raw.includes('without assignment'))) ||
        raw === 'which approved volunteers are unassigned' ||
        raw === 'which approved volunteers are not assigned?' ||
        raw === 'who is unassigned'
      )
    ) {
      const res = await operationsToolRegistry.executeTool('listUnassignedVolunteers', context);
      const volunteers = res.data || [];
      const total = res.totalCount ?? volunteers.length;

      const rows = volunteers.map((v: any) => [
        v.full_name || v.name,
        v.phone || 'N/A',
        v.preferred_team || 'General',
        'Approved'
      ]);

      const table: TableData = {
        columns: ['Name', 'Phone', 'Preferred Team', 'Status'],
        rows,
        totalCount: total,
        displayedCount: volunteers.length
      };

      const answer = total === 0
        ? 'All approved volunteers have been assigned to duty posts.'
        : total === 1
        ? `1 approved volunteer has not been assigned (${volunteers[0].full_name || volunteers[0].name}).\n\nAction: View volunteers`
        : `${formatNumber(total)} approved volunteers have not been assigned to a duty post.\n\nAction: View volunteers`;

      return {
        answer,
        grounded: true,
        intent: 'approved_unassigned_volunteers_list',
        table,
        provenance: formatHumanProvenance('Volunteer Management', event.title, nowTimeStr),
        deepLinks: [{ label: 'View volunteers', route: '/admin/operations', tab: 'operations' }]
      };
    }

    // Q0-R: Volunteer — "Who reported today but is no longer on duty?"
    if (
      raw.includes('no longer on duty') ||
      raw.includes('reported off duty') ||
      raw.includes('reported today but') ||
      raw.includes('checked out of duty')
    ) {
      const res = await operationsToolRegistry.executeTool('listVolunteersReportedOffDuty', context);
      const volunteers = res.data || [];
      const total = res.totalCount ?? volunteers.length;

      const rows = volunteers.map((v: any) => [
        v.name,
        v.last_location,
        v.reported_at ? new Date(v.reported_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
        v.off_duty_at ? new Date(v.off_duty_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'
      ]);

      const table: TableData = {
        columns: ['Name', 'Last Location', 'Reported At', 'Ended At'],
        rows,
        totalCount: total,
        displayedCount: volunteers.length
      };

      const answer = total === 0
        ? 'No volunteers have reported off duty today.'
        : total === 1
        ? `${volunteers[0].name} reported today but is no longer on duty.`
        : `${formatNumber(total)} volunteers reported today but are no longer on duty.`;

      return {
        answer,
        grounded: true,
        intent: 'volunteers_reported_off_duty_list',
        table,
        provenance: formatHumanProvenance('Event Duty', event.title, nowTimeStr),
        deepLinks: [{ label: 'View Event Duty', route: '/admin/operations', tab: 'operations' }]
      };
    }

    // Q0-S: Volunteer — "Which volunteers changed locations?"
    if (
      raw.includes('changed locations') ||
      raw.includes('changed duty location') ||
      raw.includes('moved locations')
    ) {
      const res = await operationsToolRegistry.executeTool('listVolunteersChangedLocations', context);
      const volunteers = res.data || [];
      const total = res.totalCount ?? volunteers.length;

      const rows = volunteers.map((v: any) => [
        v.name,
        formatNumber(v.location_count)
      ]);

      const table: TableData = {
        columns: ['Name', 'Distinct Locations Checked Into'],
        rows,
        totalCount: total,
        displayedCount: volunteers.length
      };

      const answer = total === 0
        ? 'No volunteers have changed duty locations during this event.'
        : total === 1
        ? `${volunteers[0].name} checked into ${volunteers[0].location_count} different locations.`
        : `${formatNumber(total)} volunteers have checked into more than one duty location.`;

      return {
        answer,
        grounded: true,
        intent: 'volunteers_changed_locations_list',
        table,
        provenance: formatHumanProvenance('Event Duty', event.title, nowTimeStr),
        deepLinks: [{ label: 'View Event Duty', route: '/admin/operations', tab: 'operations' }]
      };
    }

    // Q0-T: Volunteer — "Which teams have no active volunteer?"
    if (
      raw.includes('teams have no active') ||
      raw.includes('locations with no active') ||
      raw.includes('locations with no volunteers') ||
      raw.includes('unstaffed teams') ||
      raw.includes('unstaffed locations')
    ) {
      const res = await operationsToolRegistry.executeTool('listTeamsWithoutActiveVolunteers', context);
      const locations = res.data || [];
      const total = res.totalCount ?? locations.length;

      const rows = locations.map((l: any) => [
        l.location,
        formatNumber(l.targetVolunteerCapacity),
        formatNumber(l.assigned),
        '0 on duty'
      ]);

      const table: TableData = {
        columns: ['Location', 'Target Capacity', 'Assigned', 'On Duty'],
        rows,
        totalCount: total,
        displayedCount: locations.length
      };

      const answer = total === 0
        ? 'All duty locations currently have active volunteers on duty.'
        : total === 1
        ? `${locations[0].location} currently has no active volunteer on duty.\n\nAction: View duty`
        : `${formatNumber(total)} duty locations currently have no active volunteers on duty.\n\nAction: View duty`;

      return {
        answer,
        grounded: true,
        intent: 'unstaffed_teams_list',
        table,
        provenance: formatHumanProvenance('Event Duty', event.title, nowTimeStr),
        deepLinks: [{ label: 'View duty', route: '/admin/operations', tab: 'operations' }]
      };
    }

    // Q0-U: Volunteer — "Which volunteers have duplicate active duty presence?"
    if (
      raw.includes('duplicate') &&
      (raw.includes('duty') || raw.includes('presence') || raw.includes('volunteer'))
    ) {
      const res = await operationsToolRegistry.executeTool('listVolunteersWithDuplicatePresence', context);
      const volunteers = res.data || [];
      const total = res.totalCount ?? volunteers.length;

      const rows = volunteers.map((v: any) => [
        v.name,
        formatNumber(v.active_sessions_count)
      ]);

      const table: TableData = {
        columns: ['Name', 'Active Sessions'],
        rows,
        totalCount: total,
        displayedCount: volunteers.length
      };

      const answer = total === 0
        ? 'No volunteers have duplicate active duty presence.'
        : total === 1
        ? `${volunteers[0].name} has ${volunteers[0].active_sessions_count} concurrent active presence sessions.\n\nAction: View duty`
        : `${formatNumber(total)} volunteers have duplicate active duty presence sessions.\n\nAction: View duty`;

      return {
        answer,
        grounded: true,
        intent: 'volunteers_duplicate_presence_list',
        table,
        provenance: formatHumanProvenance('Event Duty', event.title, nowTimeStr),
        deepLinks: [{ label: 'View duty', route: '/admin/operations', tab: 'operations' }]
      };
    }

    // Q0-V: Volunteer — "How many volunteers are approved / assigned / on duty?"
    if (
      (raw.includes('how many volunteers') && (raw.includes('approved') || raw.includes('assigned') || raw.includes('on duty'))) ||
      raw === 'volunteer counts' ||
      raw === 'how many volunteers are approved' ||
      raw === 'how many volunteers are on duty'
    ) {
      const res = await operationsToolRegistry.executeTool('getVolunteerSummary', context);
      const data = res.data;

      const answer = `Volunteer overview: ${formatNumber(data.approvedVolunteers)} approved, ${formatNumber(data.volunteersAssigned)} assigned to current event, and ${formatNumber(data.volunteersOnDuty)} currently active on duty.`;

      return {
        answer,
        grounded: true,
        intent: 'volunteer_counts_summary',
        data,
        provenance: formatHumanProvenance('Volunteer Management', event.title, nowTimeStr),
        deepLinks: [{ label: 'View Event Duty', route: '/admin/operations', tab: 'operations' }]
      };
    }

    // Q1: "List volunteers currently on duty" / "Who is currently on duty?"
    if (
      (raw.includes('on duty') && (raw.includes('who') || raw.includes('list') || raw.includes('volunteers') || raw.includes('currently on duty'))) ||
      raw === 'volunteers on duty' ||
      raw === 'list volunteers on duty' ||
      raw === 'list the volunteers currently on duty.' ||
      raw === 'who is on duty' ||
      raw === 'who is currently on duty?' ||
      raw === 'who is currently on duty'
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
      let answer = '';
      if (total === 0) {
        answer = 'No volunteers are currently on duty for this event.';
      } else if (total === 1) {
        const v = volunteers[0];
        answer = `${v.name} is currently active on duty (${v.duty_location}: ${v.responsibility}).`;
      } else {
        const names = volunteers.slice(0, 3).map((v: any) => v.name).join(', ');
        const andMore = total > 3 ? ` and ${total - 3} more` : '';
        answer = `${formatNumber(total)} volunteers are currently active on duty (${names}${andMore})${limitNote}.`;
      }

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
      const answer = event.capacity && event.capacity > 0
        ? `${formatNumber(data.selected)} of ${formatNumber(event.capacity)} available places have been selected (out of ${formatNumber(data.total)} total registrations).`
        : `There are ${formatNumber(data.selected)} children selected for admission to "${event.title}" (out of ${formatNumber(data.total)} total registrations).`;
      return {
        answer,
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
    const isOperationalQuery =
      raw.includes('child') ||
      raw.includes('children') ||
      raw.includes('parent') ||
      raw.includes('volunteer') ||
      raw.includes('duty') ||
      raw.includes('pass') ||
      raw.includes('attendance') ||
      raw.includes('report') ||
      raw.includes('event') ||
      raw.includes('location') ||
      raw.includes('guardian') ||
      raw.includes('pickup') ||
      raw.includes('registration') ||
      raw.includes('check in') ||
      raw.includes('pick up') ||
      raw.includes('status');

    return {
      answer: isOperationalQuery
        ? "I can't check that from the current event data available to me yet."
        : "I don't have enough platform data to answer that yet.",
      grounded: false,
      intent: 'unsupported_query',
      suggestedQuestions: [
        'Which child is not selected?',
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
