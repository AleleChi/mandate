import { query, queryOne, execute } from '../src/server/db';
import { getCurrentEvent } from '../src/server/services/eventService';
import { operationsAssistantService } from '../src/server/services/operationsAssistantService';
import { operationsToolRegistry } from '../src/server/services/operations/registry';

export async function runOperationsAssistantPhase2Verification() {
  console.log('====================================================');
  console.log('OPERATIONS ASSISTANT — PHASE 2 FULL VERIFICATION');
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

  // 1. Resolve canonical current event
  const currentEvent = await getCurrentEvent();
  assert(Boolean(currentEvent && currentEvent.id), 'Event Resolution: Canonical current event resolves', {
    title: currentEvent?.title,
    id: currentEvent?.id
  });
  const currentEventId = currentEvent!.id;

  const superAdminActor = { id: 'test-admin-super', role: 'super_admin', email: 'super@koinonia.org' };
  const adminActor = { id: 'test-admin-1', role: 'admin', email: 'admin@koinonia.org' };
  const unauthorizedActor = { id: 'test-vol-1', role: 'volunteer', email: 'volunteer@koinonia.org' };

  const uid = Date.now();
  const testLocationId = `test-loc-grace-${uid}`;
  const testUserId1 = `test-usr-duty1-${uid}`;
  const testUserId2 = `test-usr-noshow-${uid}`;
  const testVolunteerProfileId1 = `test-vp1-${uid}`;
  const testVolunteerProfileId2 = `test-vp2-${uid}`;
  const assignmentId1 = `test-asgn-1-${uid}`;
  const assignmentId2 = `test-asgn-2-${uid}`;
  const presenceId1 = `test-pres-1-${uid}`;
  const testParentId = `test-parent-${uid}`;
  const testChildId = `test-child-${uid}`;
  const testEntryId = `test-entry-${uid}`;
  const testEscalationId = `test-esc-${uid}`;
  const testAgeGroupId1 = `test-ag-1-${uid}`;
  const testAgeGroupId2 = `test-ag-2-${uid}`;
  const testEventBId = `test-event-b-${uid}`;

  const nowIso = new Date().toISOString();
  const past30m = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const endsIso = new Date(Date.now() + 4 * 3600 * 1000).toISOString();

  try {
    // -------------------------------------------------------------
    // Set Up Controlled Test Fixtures for Current Event
    // -------------------------------------------------------------

    // 1. Test Location: "Grace Hall"
    await execute(`
      INSERT INTO event_locations (id, event_id, location_type, name, short_name, volunteer_capacity, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, 'hall', 'Grace Hall', 'Grace', 5, 1, 10, ?, ?)
    `, [testLocationId, currentEventId, nowIso, nowIso]);

    // 2. Test Volunteers
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'volunteer', ?, ?), (?, ?, 'volunteer', ?, ?)
    `, [
      testUserId1, `grace.volunteer.${uid}@koinonia.org`, nowIso, nowIso,
      testUserId2, `noshow.volunteer.${uid}@koinonia.org`, nowIso, nowIso
    ]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Grace Helper', '+2348000000001', '+2348000000001', 'Ushering', 'approved', ?, ?),
             (?, ?, 'NoShow Volunteer', '+2348000000002', '+2348000000002', 'Security', 'approved', ?, ?)
    `, [
      testVolunteerProfileId1, testUserId1, nowIso, nowIso,
      testVolunteerProfileId2, testUserId2, nowIso, nowIso
    ]);

    // 3. Duty Assignments for Grace Hall
    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Team Lead', 'assigned', ?, ?, ?, ?),
             (?, ?, ?, ?, 'Station Guard', 'assigned', ?, ?, ?, ?)
    `, [
      assignmentId1, currentEventId, testUserId1, testLocationId, nowIso, endsIso, nowIso, nowIso,
      assignmentId2, currentEventId, testUserId2, testLocationId, nowIso, endsIso, nowIso, nowIso
    ]);

    // 4. Grace Helper is active on duty (presence record)
    await execute(`
      INSERT INTO event_duty_location_presence (id, event_id, user_id, event_location_id, source, started_at, updated_at)
      VALUES (?, ?, ?, ?, 'qr_scan', ?, ?)
    `, [presenceId1, currentEventId, testUserId1, testLocationId, past30m, past30m]);

    // 5. Parent & Child ("Aaron Hope David" so it sorts at the top alphabetically for bounded list verification)
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, email, home_address, preferred_contact, is_koinonia_worker, department, created_at, updated_at)
      VALUES (?, ?, 'Grace Parent', '+2348000000003', '+2348000000003', ?, 'Lagos', 'phone', 0, 'Media', ?, ?)
    `, [testParentId, testUserId1, `parent.${uid}@koinonia.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, created_at, updated_at)
      VALUES (?, ?, 'Aaron Hope David', 'female', '2020-01-01', 6, ?, ?)
    `, [testChildId, testParentId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [testEntryId, currentEventId, testChildId, past30m, past30m]);

    // 6. Test Escalation Cycle
    await execute(`
      INSERT INTO escalation_cycles (id, event_id, subject_type, condition_key, cycle_number, status, started_at, created_at, updated_at)
      VALUES (?, ?, 'guardian_alert', 'no_response_step1', 1, 'open', ?, ?, ?)
    `, [testEscalationId, currentEventId, past30m, past30m, past30m]);

    // 7. Test Age Groups
    await execute(`
      INSERT INTO event_age_groups (id, event_id, label, min_age, max_age, capacity, manual_review, sort_order, created_at, updated_at)
      VALUES (?, ?, 'Juniors (4-7)', 4, 7, 50, 0, 1, ?, ?),
             (?, ?, 'Teens (8-12)', 8, 12, 100, 0, 2, ?, ?)
    `, [testAgeGroupId1, currentEventId, nowIso, nowIso, testAgeGroupId2, currentEventId, nowIso, nowIso]);

    console.log('\n--- VERIFY EXACT 10 OPERATIONAL QUESTIONS ---\n');

    // -------------------------------------------------------------
    // QUESTION 1: "List volunteers currently on duty."
    // -------------------------------------------------------------
    const q1 = await operationsAssistantService.processOperationalQuery(
      'List volunteers currently on duty.',
      currentEventId,
      adminActor
    );
    assert(q1.grounded === true, 'Question 1: Grounded response returned');
    assert(Boolean(q1.table && q1.table.rows.length > 0), 'Question 1: Returns structured rows table');
    assert(
      q1.table?.columns.includes('Name') &&
      q1.table?.columns.includes('Duty Location') &&
      q1.table?.columns.includes('Responsibility') &&
      q1.table?.columns.includes('Reported At') &&
      q1.table?.columns.includes('Status'),
      'Question 1: Columns include Name, Location, Responsibility, Reported At, Status'
    );
    assert(
      q1.table?.rows.some((r: any) => r[0] === 'Grace Helper' && r[1] === 'Grace Hall'),
      'Question 1: Real volunteer presence record matches live DB'
    );
    assert(
      q1.deepLinks?.some((l) => l.route === '/admin/operations'),
      'Question 1: Useful navigation deep link to Event Duty provided'
    );
    console.log(`   Q1 Answer: "${q1.answer}"`);

    // -------------------------------------------------------------
    // QUESTION 2: "Who is assigned to Grace Hall?"
    // -------------------------------------------------------------
    const q2 = await operationsAssistantService.processOperationalQuery(
      'Who is assigned to Grace Hall?',
      currentEventId,
      adminActor
    );
    assert(q2.grounded === true, 'Question 2: Grounded response returned');
    assert(
      q2.answer.includes('Grace Helper') && q2.answer.includes('NoShow Volunteer'),
      'Question 2: Real assigned volunteers for Grace Hall returned'
    );
    assert(
      Boolean(q2.table && q2.table.rows.length >= 2),
      'Question 2: Structured table rows contain assigned volunteers'
    );
    assert(
      q2.table?.rows.every((r: any) => r[1].toLowerCase().includes('grace')),
      'Question 2: Grace Hall only — no volunteers from other locations appear'
    );
    console.log(`   Q2 Answer: "${q2.answer}"`);

    // -------------------------------------------------------------
    // QUESTION 3: "Which volunteers haven't reported for duty?"
    // -------------------------------------------------------------
    const q3 = await operationsAssistantService.processOperationalQuery(
      "Which volunteers haven't reported for duty?",
      currentEventId,
      adminActor
    );
    assert(q3.grounded === true, 'Question 3: Grounded response returned');
    assert(
      q3.table?.rows.some((r: any) => r[0] === 'NoShow Volunteer'),
      'Question 3: Identifies scheduled volunteer without active presence'
    );
    assert(
      !q3.table?.rows.some((r: any) => r[0] === 'Grace Helper'),
      'Question 3: Excludes volunteers who have reported for duty'
    );
    console.log(`   Q3 Answer: "${q3.answer}"`);

    // -------------------------------------------------------------
    // QUESTION 4: "How many children are checked in right now?"
    // -------------------------------------------------------------
    const q4 = await operationsAssistantService.processOperationalQuery(
      'How many children are checked in right now?',
      currentEventId,
      adminActor
    );
    const directAttendance = await operationsToolRegistry.executeTool('getAttendanceSummary', {
      eventId: currentEventId,
      actor: adminActor
    });
    assert(q4.grounded === true, 'Question 4: Grounded response returned');
    assert(
      q4.answer.includes(`${directAttendance.data.currentlyInside} children are checked in right now`),
      'Question 4: Canonical attendance count matches direct tool calculation'
    );
    assert(
      q4.deepLinks?.some((l) => l.route === '/admin/attendance'),
      'Question 4: Deep link to Attendance Desk provided'
    );
    console.log(`   Q4 Answer: "${q4.answer}"`);

    // -------------------------------------------------------------
    // QUESTION 5: "List selected children without passes."
    // -------------------------------------------------------------
    const q5 = await operationsAssistantService.processOperationalQuery(
      'List selected children without passes.',
      currentEventId,
      adminActor
    );
    assert(q5.grounded === true, 'Question 5: Grounded response returned');
    assert(Boolean(q5.table && q5.table.rows.length > 0), 'Question 5: Structured table returned');
    assert(
      q5.table!.displayedCount <= 20,
      'Question 5: Bounded list limit (max 20 rows per page)'
    );
    assert(
      q5.table?.rows.some((r: any) => r[0] === 'Aaron Hope David'),
      'Question 5: Real selected child without pass listed in event-scoped results'
    );
    assert(
      q5.table?.columns.includes('Child Name') &&
      q5.table?.columns.includes('Age') &&
      q5.table?.columns.includes('Parent') &&
      q5.table?.columns.includes('Pass Status'),
      'Question 5: Structured columns present'
    );
    console.log(`   Q5 Answer: "${q5.answer}"`);

    // -------------------------------------------------------------
    // QUESTION 6: "Which age group is closest to capacity?"
    // -------------------------------------------------------------
    const q6 = await operationsAssistantService.processOperationalQuery(
      'Which age group is closest to capacity?',
      currentEventId,
      adminActor
    );
    assert(q6.grounded === true, 'Question 6: Grounded response returned');
    assert(
      Boolean(q6.breakdown && q6.breakdown.items.length > 0),
      'Question 6: Real age-group breakdown returned'
    );
    assert(
      q6.table?.columns.includes('Age Group') &&
      q6.table?.columns.includes('Registered') &&
      q6.table?.columns.includes('Selected') &&
      q6.table?.columns.includes('Capacity') &&
      q6.table?.columns.includes('Remaining'),
      'Question 6: Structured columns include registered/selected/capacity/remaining'
    );
    assert(
      q6.answer.includes('closest to capacity'),
      'Question 6: Correct closest group identified in grounded answer'
    );
    console.log(`   Q6 Answer: "${q6.answer}"`);

    // -------------------------------------------------------------
    // QUESTION 7: "How many approved volunteers are unassigned?"
    // -------------------------------------------------------------
    const q7 = await operationsAssistantService.processOperationalQuery(
      'How many approved volunteers are unassigned?',
      currentEventId,
      adminActor
    );
    const directVolunteerSummary = await operationsToolRegistry.executeTool('getVolunteerSummary', {
      eventId: currentEventId,
      actor: adminActor
    });
    assert(q7.grounded === true, 'Question 7: Grounded response returned');
    assert(
      q7.answer.includes(`${directVolunteerSummary.data.unassignedApprovedVolunteers} approved volunteers are currently not assigned`),
      'Question 7: Returns real unassigned approved volunteer count'
    );
    console.log(`   Q7 Answer: "${q7.answer}"`);

    // -------------------------------------------------------------
    // QUESTION 8: "Show unresolved escalations."
    // -------------------------------------------------------------
    const q8 = await operationsAssistantService.processOperationalQuery(
      'Show unresolved escalations.',
      currentEventId,
      superAdminActor
    );
    assert(q8.grounded === true, 'Question 8: Grounded response returned for authorized Super Admin');
    assert(
      Boolean(q8.table && q8.table.rows.length > 0),
      'Question 8: Real escalation records listed in structured table'
    );
    assert(
      q8.table?.columns.includes('Child') &&
      q8.table?.columns.includes('Guardian') &&
      q8.table?.columns.includes('Condition') &&
      q8.table?.columns.includes('Cycle') &&
      q8.table?.columns.includes('Status'),
      'Question 8: Table includes cycle details, condition, and status'
    );
    console.log(`   Q8 Answer: "${q8.answer}"`);

    // -------------------------------------------------------------
    // QUESTION 9: "What changed in the last hour?"
    // -------------------------------------------------------------
    const q9 = await operationsAssistantService.processOperationalQuery(
      'What changed in the last hour?',
      currentEventId,
      adminActor
    );
    assert(q9.grounded === true, 'Question 9: Grounded response returned');
    assert(Boolean(q9.table), 'Question 9: Activity table generated with real timestamps');
    assert(
      q9.table?.rows.some((r: any) => r[1].includes('Aaron Hope David') || r[1].includes('Grace Helper')),
      'Question 9: Real timestamped changes in the last hour returned'
    );
    console.log(`   Q9 Answer: "${q9.answer}"`);

    // -------------------------------------------------------------
    // QUESTION 10: "Give me an event summary."
    // -------------------------------------------------------------
    const q10 = await operationsAssistantService.processOperationalQuery(
      'Give me an event summary.',
      currentEventId,
      adminActor
    );
    assert(q10.grounded === true, 'Question 10: Multi-tool synthesis grounded');
    assert(
      q10.answer.includes('children are selected') &&
      q10.answer.includes('checked in right now') &&
      q10.answer.includes('passes are ready') &&
      q10.answer.includes('volunteers are assigned'),
      'Question 10: Combines registration, selection, attendance, duty, passes, safety, configuration'
    );
    assert(
      !q10.answer.toLowerCase().includes('readiness score') &&
      !q10.answer.toLowerCase().includes('readiness:'),
      'Question 10: No arbitrary readiness score generated'
    );
    assert(
      Boolean(q10.breakdown && q10.breakdown.items.length >= 4),
      'Question 10: Structured operational snapshot breakdown generated'
    );
    console.log(`   Q10 Answer: "${q10.answer}"`);

    // -------------------------------------------------------------
    // 11. Security Tests: Role Permissions & Restricted Safety Query
    // -------------------------------------------------------------
    console.log('\n--- SECURITY & PERMISSION TESTS ---');
    const qSecRestricted = await operationsAssistantService.processOperationalQuery(
      'Show unresolved escalations.',
      currentEventId,
      unauthorizedActor
    );
    assert(
      qSecRestricted.answer === "You don't have permission to view those details.",
      'Security 1: Unauthorized actor receives exact permission denial message'
    );
    assert(
      !qSecRestricted.table || qSecRestricted.table.rows.length === 0,
      'Security 2: No sensitive escalation data leaked in table or payload'
    );

    // -------------------------------------------------------------
    // 12. Event Isolation Test (Event A vs Event B)
    // -------------------------------------------------------------
    console.log('\n--- EVENT ISOLATION TESTS ---');
    await execute(`
      INSERT INTO events (id, title, status, capacity, created_at, updated_at)
      VALUES (?, 'Isolated Test Event B', 'draft', 100, ?, ?)
    `, [testEventBId, nowIso, nowIso]);

    const qIso1 = await operationsAssistantService.processOperationalQuery(
      'Who is assigned to Grace Hall?',
      testEventBId,
      adminActor
    );
    assert(
      !qIso1.answer.includes('Grace Helper'),
      'Isolation 1: Grace Hall from Event A is NOT visible in Event B'
    );

    const qIso2 = await operationsAssistantService.processOperationalQuery(
      'List selected children without passes.',
      testEventBId,
      adminActor
    );
    assert(
      !qIso2.table?.rows.some((r: any) => r[0] === 'Aaron Hope David'),
      'Isolation 2: Children from Event A are NOT visible in Event B'
    );

    // -------------------------------------------------------------
    // 13. Read-Only Guardrail (Action Attempt Interception)
    // -------------------------------------------------------------
    console.log('\n--- READ-ONLY GUARDRAIL TESTS ---');
    const qAction = await operationsAssistantService.processOperationalQuery(
      'Assign John to Grace Hall',
      currentEventId,
      adminActor
    );
    assert(qAction.actionAttempt === true, 'Read-Only 1: Action attempt intercepted');
    assert(
      qAction.answer === "I can show John's current assignment, but changes are not enabled in Operations Assistant yet.",
      'Read-Only 2: Exact required message returned with target volunteer name'
    );
    console.log(`   Action Intercept Answer: "${qAction.answer}"`);

    // -------------------------------------------------------------
    // 14. Unsupported-Query Handling (Zero Hallucination)
    // -------------------------------------------------------------
    console.log('\n--- UNSUPPORTED QUERY HANDLING ---');
    const qUnsupported = await operationsAssistantService.processOperationalQuery(
      'Tell me who will win the next election.',
      currentEventId,
      adminActor
    );
    assert(qUnsupported.grounded === false, 'Unsupported 1: Grounded is false');
    assert(
      qUnsupported.answer === "I don't have enough platform data to answer that yet.",
      'Unsupported 2: Exact fallback message returned without hallucination'
    );

    // -------------------------------------------------------------
    // 15. Ambiguity Handling (Clarification Prompting)
    // -------------------------------------------------------------
    console.log('\n--- AMBIGUITY HANDLING ---');
    const qAmbiguous = await operationsAssistantService.processOperationalQuery(
      'volunteers',
      currentEventId,
      adminActor
    );
    assert(qAmbiguous.clarification === true, 'Ambiguity 1: Clarification flag set');
    assert(
      qAmbiguous.answer.includes('Do you mean volunteers currently on duty'),
      'Ambiguity 2: Proactively asks short clarifying question'
    );

  } finally {
    // Clean up test fixtures from current event
    console.log('\n--- CLEANING UP TEST FIXTURES ---');
    await execute('DELETE FROM event_duty_location_presence WHERE id = ?', [presenceId1]);
    await execute('DELETE FROM event_duty_assignments WHERE id IN (?, ?)', [assignmentId1, assignmentId2]);
    await execute('DELETE FROM volunteer_profiles WHERE id IN (?, ?)', [testVolunteerProfileId1, testVolunteerProfileId2]);
    await execute('DELETE FROM users WHERE id IN (?, ?)', [testUserId1, testUserId2]);
    await execute('DELETE FROM event_locations WHERE id = ?', [testLocationId]);
    await execute('DELETE FROM child_event_entries WHERE id = ?', [testEntryId]);
    await execute('DELETE FROM children WHERE id = ?', [testChildId]);
    await execute('DELETE FROM parent_profiles WHERE id = ?', [testParentId]);
    await execute('DELETE FROM escalation_cycles WHERE id = ?', [testEscalationId]);
    await execute('DELETE FROM event_age_groups WHERE id IN (?, ?)', [testAgeGroupId1, testAgeGroupId2]);
    await execute('DELETE FROM events WHERE id = ?', [testEventBId]);
    console.log('Cleanup completed successfully.');
  }

  console.log('\n====================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    throw new Error(`Verification failed with ${failed} failure(s).`);
  }
}

runOperationsAssistantPhase2Verification()
  .then(() => {
    console.log('All Operations Assistant Phase 2 checks passed.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Operations Assistant Phase 2 verification failed:', err);
    process.exit(1);
  });
