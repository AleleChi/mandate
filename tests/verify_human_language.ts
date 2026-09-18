import { query, queryOne, execute } from '../src/server/db';
import { getCurrentEvent } from '../src/server/services/eventService';
import { operationsAssistantService } from '../src/server/services/operationsAssistantService';

export async function runHumanLanguageVerification() {
  console.log('====================================================');
  console.log('OPERATIONS ASSISTANT — USER-FACING HUMAN LANGUAGE CHECK');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`, detail ? JSON.stringify(detail) : '');
      failed++;
    }
  }

  // Forbidden technical terms in user-facing answers, titles, sources, or labels
  const FORBIDDEN_PATTERNS: { name: string; regex: RegExp }[] = [
    { name: 'Multi-Tool', regex: /\bmulti[- ]tool\b/i },
    { name: 'Synthesis', regex: /\boperations synthesis\b|\bsynthesis\b/i },
    { name: 'Query Planner', regex: /\bquery planner\b|\bplanner\b/i },
    { name: 'Tool Registry', regex: /\btool registry\b/i },
    { name: 'Tool execution', regex: /\btool execution\b|\btool chain\b|\bsource tool\b/i },
    { name: 'SQL', regex: /\bsql\b/i },
    { name: 'Database / DB', regex: /\bdatabase\b|\bdb\b/i },
    { name: 'API / Endpoint', regex: /\bapi endpoint\b|\bendpoint\b|\broute\b/i },
    { name: 'Internal IDs', regex: /\bevent_id\b|\buser_id\b|\bchild_id\b|\bvolunteer_id\b|\blocation_id\b/i },
    { name: 'HTTP / Status Code', regex: /\bhttp\b|\bstatus code\b|\b500\b/i },
    { name: 'JSON / Schema', regex: /\bjson\b|\bschema\b/i },
    { name: 'TypeError / Stack trace', regex: /\btypeerror\b|\bstack trace\b/i },
    { name: 'Recordset / Result set', regex: /\brecordset\b|\bresult set\b|\bpayload\b/i },
    { name: 'Service layer / resolver', regex: /\bservice layer\b|\bresolver\b|\bhandler\b/i },
    { name: 'Internal terms', regex: /\bcanonical\b|\bcurrent_event\b/i },
    { name: 'Parenthesized plurals notice(s)', regex: /\bnotices?\([a-z]\)/i },
    { name: 'Parenthesized plurals cycle(s)', regex: /\bcycles?\([a-z]\)/i },
    { name: 'Parenthesized plurals child(ren)', regex: /\bchild\(ren\)/i },
    { name: 'Parenthesized plurals volunteer(s)', regex: /\bvolunteers?\([a-z]\)/i },
    { name: 'Parenthesized plurals item(s)', regex: /\bitems?\([a-z]\)/i },
    { name: 'Raw double-zero', regex: /\b00\b/ },
    { name: 'Engineering section CORE OPERATIONS SNAPSHOT', regex: /core operations snapshot/i },
    { name: 'Engineering section Duty Staffing', regex: /duty staffing/i }
  ];

  function scanForForbiddenTerms(content: string, contextLabel: string): boolean {
    let clean = true;
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.regex.test(content)) {
        console.error(`  [VIOLATION] Found forbidden pattern "${pattern.name}" in ${contextLabel}: "${content}"`);
        clean = false;
      }
    }
    return clean;
  }

  // 1. Resolve canonical current event
  const currentEvent = await getCurrentEvent();
  assert(Boolean(currentEvent && currentEvent.id), 'Event Resolution: Canonical current event resolves', {
    title: currentEvent?.title,
    id: currentEvent?.id
  });
  const currentEventId = currentEvent!.id;

  const adminActor = { id: 'test-admin-1', role: 'admin', email: 'admin@koinonia.org' };
  const superAdminActor = { id: 'test-admin-super', role: 'super_admin', email: 'super@koinonia.org' };

  const uid = Date.now();
  const testLocationId = `test-loc-grace-${uid}`;
  const testUserId1 = `test-usr-duty1-${uid}`;
  const testVolunteerProfileId1 = `test-vp1-${uid}`;
  const assignmentId1 = `test-asgn-1-${uid}`;
  const presenceId1 = `test-pres-1-${uid}`;

  const nowIso = new Date().toISOString();
  const past30m = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const endsIso = new Date(Date.now() + 4 * 3600 * 1000).toISOString();

  try {
    // Controlled fixture setup
    await execute(`
      INSERT INTO event_locations (id, event_id, location_type, name, short_name, volunteer_capacity, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, 'hall', 'Grace Hall', 'Grace', 5, 1, 10, ?, ?)
    `, [testLocationId, currentEventId, nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'volunteer', ?, ?)
    `, [testUserId1, `grace.volunteer.${uid}@koinonia.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Grace Helper', '+2348000000001', '+2348000000001', 'Ushering', 'approved', ?, ?)
    `, [testVolunteerProfileId1, testUserId1, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Team Lead', 'assigned', ?, ?, ?, ?)
    `, [assignmentId1, currentEventId, testUserId1, testLocationId, nowIso, endsIso, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_duty_location_presence (id, event_id, user_id, event_location_id, source, started_at, updated_at)
      VALUES (?, ?, ?, ?, 'qr_scan', ?, ?)
    `, [presenceId1, currentEventId, testUserId1, testLocationId, past30m, past30m]);

    // =============================================================
    // TEST EXACT 8 REQUIRED USER CASES + 1 UNSUPPORTED + 1 ERROR
    // =============================================================

    console.log('\n--- 1. EXACT REQUIRED QUESTIONS ---');

    // Case 1: "Give me an event summary."
    const q1 = await operationsAssistantService.processOperationalQuery(
      'Give me an event summary.',
      currentEventId,
      adminActor
    );
    console.log(`   Event Summary Answer: "${q1.answer}"`);
    console.log(`   Event Summary Source: "${q1.provenance?.source}"`);
    assert(scanForForbiddenTerms(q1.answer, 'Event Summary answer'), 'Case 1: Event summary answer contains no forbidden terms');
    assert(scanForForbiddenTerms(q1.provenance?.source || '', 'Event Summary source'), 'Case 1: Event summary source is human-readable');
    if (q1.breakdown?.title) {
      assert(scanForForbiddenTerms(q1.breakdown.title, 'Event Summary breakdown title'), 'Case 1: Event summary breakdown title is human-readable');
    }

    // Case 2: "List volunteers currently on duty."
    const q2 = await operationsAssistantService.processOperationalQuery(
      'List volunteers currently on duty.',
      currentEventId,
      adminActor
    );
    console.log(`   Volunteers on duty Answer: "${q2.answer}"`);
    assert(scanForForbiddenTerms(q2.answer, 'Volunteers on duty answer'), 'Case 2: Volunteers on duty answer contains no forbidden terms');
    assert(scanForForbiddenTerms(q2.provenance?.source || '', 'Volunteers on duty source'), 'Case 2: Volunteers on duty source is human-readable');

    // Case 3: "Who is assigned to Grace Hall?"
    const q3 = await operationsAssistantService.processOperationalQuery(
      'Who is assigned to Grace Hall?',
      currentEventId,
      adminActor
    );
    console.log(`   Grace Hall Answer: "${q3.answer}"`);
    assert(scanForForbiddenTerms(q3.answer, 'Grace Hall answer'), 'Case 3: Grace Hall answer contains no forbidden terms');
    assert(scanForForbiddenTerms(q3.provenance?.source || '', 'Grace Hall source'), 'Case 3: Grace Hall source is human-readable');

    // Case 4: "Which volunteers haven't reported?"
    const q4 = await operationsAssistantService.processOperationalQuery(
      "Which volunteers haven't reported?",
      currentEventId,
      adminActor
    );
    console.log(`   Absent volunteers Answer: "${q4.answer}"`);
    assert(scanForForbiddenTerms(q4.answer, 'Absent volunteers answer'), 'Case 4: Absent volunteers answer contains no forbidden terms');
    assert(scanForForbiddenTerms(q4.provenance?.source || '', 'Absent volunteers source'), 'Case 4: Absent volunteers source is human-readable');

    // Case 5: "How many children are checked in?"
    const q5 = await operationsAssistantService.processOperationalQuery(
      'How many children are checked in?',
      currentEventId,
      adminActor
    );
    console.log(`   Checked in children Answer: "${q5.answer}"`);
    assert(scanForForbiddenTerms(q5.answer, 'Checked in children answer'), 'Case 5: Checked in children answer contains no forbidden terms');
    assert(scanForForbiddenTerms(q5.provenance?.source || '', 'Checked in children source'), 'Case 5: Checked in children source is human-readable');

    // Case 6: "List selected children without passes."
    const q6 = await operationsAssistantService.processOperationalQuery(
      'List selected children without passes.',
      currentEventId,
      adminActor
    );
    console.log(`   Children without passes Answer: "${q6.answer}"`);
    assert(scanForForbiddenTerms(q6.answer, 'Children without passes answer'), 'Case 6: Children without passes answer contains no forbidden terms');
    assert(scanForForbiddenTerms(q6.provenance?.source || '', 'Children without passes source'), 'Case 6: Children without passes source is human-readable');

    // Case 7: "Show unresolved escalations."
    const q7 = await operationsAssistantService.processOperationalQuery(
      'Show unresolved escalations.',
      currentEventId,
      superAdminActor
    );
    console.log(`   Escalations Answer: "${q7.answer}"`);
    assert(scanForForbiddenTerms(q7.answer, 'Escalations answer'), 'Case 7: Escalations answer contains no forbidden terms');
    assert(scanForForbiddenTerms(q7.provenance?.source || '', 'Escalations source'), 'Case 7: Escalations source is human-readable');

    // Case 8: "What changed in the last hour?"
    const q8 = await operationsAssistantService.processOperationalQuery(
      'What changed in the last hour?',
      currentEventId,
      adminActor
    );
    console.log(`   Recent activity Answer: "${q8.answer}"`);
    assert(scanForForbiddenTerms(q8.answer, 'Recent activity answer'), 'Case 8: Recent activity answer contains no forbidden terms');
    assert(scanForForbiddenTerms(q8.provenance?.source || '', 'Recent activity source'), 'Case 8: Recent activity source is human-readable');

    // Case 9: Ask one unsupported question
    console.log('\n--- 2. UNSUPPORTED QUERY ---');
    const qUnsupported = await operationsAssistantService.processOperationalQuery(
      'Tell me who will win the next election.',
      currentEventId,
      adminActor
    );
    console.log(`   Unsupported Answer: "${qUnsupported.answer}"`);
    assert(scanForForbiddenTerms(qUnsupported.answer, 'Unsupported answer'), 'Case 9: Unsupported question contains no forbidden terms');
    assert(
      qUnsupported.answer === "I don't have enough platform data to answer that yet.",
      'Case 9: Unsupported question returns plain human fallback'
    );

    // Case 10: Force one safe application error
    console.log('\n--- 3. SAFE ERROR STATE ---');
    const qError = await operationsAssistantService.processOperationalQuery(
      'What is the event status?',
      'non-existent-event-id-999999',
      adminActor
    );
    console.log(`   Safe Error Answer: "${qError.answer}"`);
    assert(scanForForbiddenTerms(qError.answer, 'Error answer'), 'Case 10: Safe error answer contains no forbidden terms');
    assert(
      !qError.answer.includes('TypeError') &&
      !qError.answer.includes('SQL') &&
      !qError.answer.includes('500') &&
      !qError.answer.includes('stack trace'),
      'Case 10: Zero technical error leaks in safe error state'
    );

    // =============================================================
    // BROAD DOMAIN COVERAGE AUDIT
    // =============================================================
    console.log('\n--- 4. BROAD DOMAIN COVERAGE AUDIT ---');

    // Applications & Children
    const qChildren = await operationsAssistantService.processOperationalQuery(
      'How many children are selected?',
      currentEventId,
      adminActor
    );
    assert(scanForForbiddenTerms(qChildren.answer, 'Children count answer'), 'Coverage: Children answer clean');
    assert(scanForForbiddenTerms(qChildren.provenance?.source || '', 'Children source'), 'Coverage: Children source clean');

    // Parent Registration Window
    const qParent = await operationsAssistantService.processOperationalQuery(
      'Is registration still open?',
      currentEventId,
      adminActor
    );
    assert(scanForForbiddenTerms(qParent.answer, 'Parent registration answer'), 'Coverage: Parent registration answer clean');

    // Applications Review
    const qApps = await operationsAssistantService.processOperationalQuery(
      'How many applications are under review?',
      currentEventId,
      adminActor
    );
    assert(scanForForbiddenTerms(qApps.answer, 'Applications under review answer'), 'Coverage: Applications review answer clean');

    // Attendance Picked Up
    const qAttendance = await operationsAssistantService.processOperationalQuery(
      'How many children have been picked up?',
      currentEventId,
      adminActor
    );
    assert(scanForForbiddenTerms(qAttendance.answer, 'Picked up answer'), 'Coverage: Attendance picked up clean');

    // Volunteer Unassigned
    const qVolUnassigned = await operationsAssistantService.processOperationalQuery(
      'How many approved volunteers are not assigned?',
      currentEventId,
      adminActor
    );
    assert(scanForForbiddenTerms(qVolUnassigned.answer, 'Unassigned volunteers answer'), 'Coverage: Volunteers unassigned clean');

    // Duty Understaffed Locations
    const qDutyUnderstaffed = await operationsAssistantService.processOperationalQuery(
      'Which duty locations need more people?',
      currentEventId,
      adminActor
    );
    assert(scanForForbiddenTerms(qDutyUnderstaffed.answer, 'Understaffed locations answer'), 'Coverage: Duty understaffed locations clean');

    // Reports Generated Today
    const qReports = await operationsAssistantService.processOperationalQuery(
      'What reports were generated today?',
      currentEventId,
      adminActor
    );
    assert(scanForForbiddenTerms(qReports.answer, 'Reports today answer'), 'Coverage: Reports answer clean');

    // Age Group Capacity
    const qAgeGroup = await operationsAssistantService.processOperationalQuery(
      'Which age group has the highest registration?',
      currentEventId,
      adminActor
    );
    assert(scanForForbiddenTerms(qAgeGroup.answer, 'Age group capacity answer'), 'Coverage: Age group capacity clean');
    if (qAgeGroup.breakdown?.title) {
      assert(scanForForbiddenTerms(qAgeGroup.breakdown.title, 'Age group breakdown title'), 'Coverage: Age group breakdown title clean');
    }

  } finally {
    // Clean up test fixtures
    console.log('\n--- CLEANING UP TEST FIXTURES ---');
    await execute('DELETE FROM event_duty_location_presence WHERE id = ?', [presenceId1]);
    await execute('DELETE FROM event_duty_assignments WHERE id = ?', [assignmentId1]);
    await execute('DELETE FROM volunteer_profiles WHERE id = ?', [testVolunteerProfileId1]);
    await execute('DELETE FROM users WHERE id = ?', [testUserId1]);
    await execute('DELETE FROM event_locations WHERE id = ?', [testLocationId]);
    console.log('Cleanup completed successfully.');
  }

  console.log('\n====================================================');
  console.log(`HUMAN LANGUAGE VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    throw new Error(`Human language verification failed with ${failed} failure(s).`);
  }
}

runHumanLanguageVerification()
  .then(() => {
    console.log('All human language checks passed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
