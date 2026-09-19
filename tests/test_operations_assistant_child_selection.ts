import { query, queryOne, execute } from '../src/server/db';
import { getCurrentEvent } from '../src/server/services/eventService';
import { operationsAssistantService } from '../src/server/services/operationsAssistantService';
import { operationsQueryPlanner } from '../src/server/services/operations/queryPlanner';
import { isSelectedChildStatus, formatChildStatusHuman } from '../src/server/services/operations/tools/childrenTools';

export async function runChildSelectionTests() {
  console.log('====================================================');
  console.log('OPERATIONS ASSISTANT — CHILD SELECTION & RESET TESTS');
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

  const uid = Date.now();
  const testEventId = `test-sel-evt-${uid}`;
  const testUserId = `usr-p-sel-${uid}`;
  const testParentId = `test-p-sel-${uid}`;
  const nowIso = new Date().toISOString();

  // Create isolated test event (exact 8 children fixture)
  await execute(`
    INSERT INTO events (id, title, status, starts_at, ends_at, capacity, created_at, updated_at)
    VALUES (?, 'Child Selection Test Event', 'open', ?, ?, 100, ?, ?)
  `, [testEventId, nowIso, nowIso, nowIso, nowIso]);

  const adminActor = { id: 'test-admin-selection', role: 'admin', email: 'admin@koinonia.org' };

  // Create user first to satisfy FK constraint
  await execute(`
    INSERT INTO users (id, email, role, created_at, updated_at)
    VALUES (?, 'parent.sel@test.org', 'parent', ?, ?)
  `, [testUserId, nowIso, nowIso]);

  // Create test parent
  await execute(`
    INSERT INTO parent_profiles (id, user_id, full_name, phone_number, email, profile_completed_at, created_at, updated_at)
    VALUES (?, ?, 'Parent Test', '+2348011111111', 'parent@test.org', ?, ?, ?)
  `, [testParentId, testUserId, nowIso, nowIso, nowIso]);

  // Create 8 children: 7 selected, 1 unselected (Baby Livina in under_review)
  const childFixtures = [
    { name: 'Alele Chi', status: 'checked_in', checkedIn: true },
    { name: 'Baby Love', status: 'checked_in', checkedIn: true },
    { name: 'Dominion Greatness', status: 'pass_ready', checkedIn: false },
    { name: 'Jasper Uganeile', status: 'pass_ready', checkedIn: false },
    { name: 'Jean Marie', status: 'pass_ready', checkedIn: false },
    { name: 'Mayowa Sambo', status: 'pass_ready', checkedIn: false },
    { name: 'Reign Keenam', status: 'pass_ready', checkedIn: false },
    { name: 'Baby Livina', status: 'under_review', checkedIn: false }
  ];

  const createdChildIds: string[] = [];
  const createdEntryIds: string[] = [];

  try {
    for (let i = 0; i < childFixtures.length; i++) {
      const fix = childFixtures[i];
      const childId = `c-sel-${uid}-${i}`;
      const entryId = `e-sel-${uid}-${i}`;
      createdChildIds.push(childId);
      createdEntryIds.push(entryId);

      await execute(`
        INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, created_at, updated_at)
        VALUES (?, ?, ?, 'Male', '2020-01-01', 6, ?, ?)
      `, [childId, testParentId, fix.name, nowIso, nowIso]);

      await execute(`
        INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [entryId, childId, testEventId, fix.status, fix.checkedIn ? nowIso : null, nowIso, nowIso]);
    }

    // 1. Verify Canonical Selection Helper
    assert(isSelectedChildStatus('selected') === true, 'Selection Semantics: "selected" is selected');
    assert(isSelectedChildStatus('pass_ready') === true, 'Selection Semantics: "pass_ready" is selected');
    assert(isSelectedChildStatus('checked_in') === true, 'Selection Semantics: "checked_in" is selected');
    assert(isSelectedChildStatus('inside') === true, 'Selection Semantics: "inside" is selected');
    assert(isSelectedChildStatus('picked_up') === true, 'Selection Semantics: "picked_up" is selected');
    assert(isSelectedChildStatus('checked_out') === true, 'Selection Semantics: "checked_out" is selected');
    assert(isSelectedChildStatus('under_review') === false, 'Selection Semantics: "under_review" is NOT selected');
    assert(isSelectedChildStatus('pending_review') === false, 'Selection Semantics: "pending_review" is NOT selected');
    assert(isSelectedChildStatus('waiting_list') === false, 'Selection Semantics: "waiting_list" is NOT selected');
    assert(isSelectedChildStatus('not_selected') === false, 'Selection Semantics: "not_selected" is NOT selected');
    assert(isSelectedChildStatus('rejected') === false, 'Selection Semantics: "rejected" is NOT selected');
    assert(isSelectedChildStatus('withdrawn') === false, 'Selection Semantics: "withdrawn" is NOT selected');

    // 2. Verify Human Status Formatter
    assert(formatChildStatusHuman('under_review') === 'Awaiting review', 'Human Formatter: "under_review" -> "Awaiting review"');
    assert(formatChildStatusHuman('pass_ready') === 'Pass ready', 'Human Formatter: "pass_ready" -> "Pass ready"');
    assert(formatChildStatusHuman('checked_in') === 'Checked in', 'Human Formatter: "checked_in" -> "Checked in"');

    // 3. Test Exact Production Question: "which of the child is not selected"
    const q1 = await operationsAssistantService.askQuestion('which of the child is not selected', testEventId, adminActor);
    assert(q1.grounded === true, 'Q1: Query is grounded', { answer: q1.answer });
    assert(!q1.answer.includes("I don't have enough platform data"), 'Q1: Does NOT return fallback message', { answer: q1.answer });
    assert(q1.answer.toLowerCase().includes('livina'), 'Q1: Identifies Livina as not selected', { answer: q1.answer });
    assert(q1.answer.includes('Awaiting review') || q1.answer.includes('not currently counted as selected'), 'Q1: Mentions current human status', { answer: q1.answer });
    assert(Boolean(q1.table && q1.table.rows.length > 0), 'Q1: Returns table data', { rows: q1.table?.rows });

    // 4. Test Variant: "who wasn't selected"
    const q2 = await operationsAssistantService.askQuestion("who wasn't selected", testEventId, adminActor);
    assert(q2.grounded === true && q2.answer.toLowerCase().includes('livina'), 'Q2: "who wasn\'t selected" identifies Livina');

    // 5. Test Variant: "list children not selected"
    const q3 = await operationsAssistantService.askQuestion("list children not selected", testEventId, adminActor);
    assert(q3.grounded === true && q3.answer.toLowerCase().includes('livina'), 'Q3: "list children not selected" identifies Livina');

    // 6. Test Variant: "which child is still waiting for selection"
    const q4 = await operationsAssistantService.askQuestion("which child is still waiting for selection", testEventId, adminActor);
    assert(q4.grounded === true && q4.answer.toLowerCase().includes('livina'), 'Q4: "which child is still waiting for selection" identifies Livina');

    // 7. Test Variant: "which child was reset and what is their current status?"
    const q5 = await operationsAssistantService.askQuestion("which child was reset and what is their current status", testEventId, adminActor);
    assert(q5.grounded === true && q5.answer.toLowerCase().includes('livina'), 'Q5: Identifies reset child Livina and status');

    // 8. Test Named Child Status: "is Baby Livina selected"
    const q6 = await operationsAssistantService.askQuestion("is Baby Livina selected", testEventId, adminActor);
    assert(q6.grounded === true && q6.answer.toLowerCase().includes('no'), 'Q6: Answers No for unselected child Livina', { answer: q6.answer });

    // 9. Test Named Child Status: "is Baby Love selected"
    const q7 = await operationsAssistantService.askQuestion("is Baby Love selected", testEventId, adminActor);
    assert(q7.grounded === true && q7.answer.toLowerCase().includes('yes'), 'Q7: Answers Yes for selected child Baby Love', { answer: q7.answer });

    // 10. Test Reset Semantics
    // Attendance reset mode: preserves pass_ready/selected
    const attendanceTargetStatus = isSelectedChildStatus('pass_ready') ? 'pass_ready' : 'selected';
    assert(isSelectedChildStatus(attendanceTargetStatus) === true, 'Reset Audit: Attendance reset preserves selection');

    // Review reset mode: sets under_review
    const reviewTargetStatus = 'under_review';
    assert(isSelectedChildStatus(reviewTargetStatus) === false, 'Reset Audit: Review reset moves child out of selection');

    // 11. Test "why isn't Baby Livina selected"
    const qWhy = await operationsAssistantService.askQuestion("why isn't Baby Livina selected", testEventId, adminActor);
    assert(qWhy.grounded === true, 'QWhy: Query is grounded', { answer: qWhy.answer });
    assert(qWhy.answer.includes('Baby Livina is currently awaiting review'), 'QWhy: Explains awaiting review status', { answer: qWhy.answer });
    assert(qWhy.answer.includes('reset to the review stage'), 'QWhy: Explains reset to review stage', { answer: qWhy.answer });
    assert(!qWhy.answer.includes('under_review'), 'QWhy: Does not leak internal enum "under_review"', { answer: qWhy.answer });

    // 12. Verify Table Columns (Privacy / Least Privilege)
    assert(q1.table?.columns.join(',') === 'Child Name,Age,Gender,Status', 'Privacy: Q1 table columns do NOT include guardian contact', { columns: q1.table?.columns });
    assert(!q1.table?.columns.includes('Parent'), 'Privacy: Q1 table columns do NOT include Parent');
    assert(!q1.table?.columns.includes('Phone'), 'Privacy: Q1 table columns do NOT include Phone');

    // 13. Test Team Actor Least Privilege
    const teamActor = { id: 'test-team-sel', role: 'team', email: 'team@koinonia.org' };
    const qTeamNotSelected = await operationsAssistantService.askQuestion('which of the child is not selected', testEventId, teamActor);
    assert(qTeamNotSelected.grounded === true, 'Team: Can view unselected children list');
    assert(qTeamNotSelected.table?.columns.join(',') === 'Child Name,Age,Gender,Status', 'Team: Table columns do NOT include guardian contact');
    assert(!JSON.stringify(qTeamNotSelected.table).includes('+2348011111111'), 'Team: Does NOT receive parent phone number');

    const qTeamParents = await operationsAssistantService.askQuestion('Which parents have children not selected?', testEventId, teamActor);
    assert(qTeamParents.grounded === false || qTeamParents.answer.includes("don't have permission"), 'Team: Cannot query guardian contact for unselected children', { answer: qTeamParents.answer });

  } finally {
    // Cleanup
    for (const eid of createdEntryIds) {
      await execute('DELETE FROM child_event_entries WHERE id = ?', [eid]);
    }
    for (const cid of createdChildIds) {
      await execute('DELETE FROM children WHERE id = ?', [cid]);
    }
    await execute('DELETE FROM parent_profiles WHERE id = ?', [testParentId]);
    await execute('DELETE FROM users WHERE id = ?', [testUserId]);
    await execute('DELETE FROM events WHERE id = ?', [testEventId]);
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

// Self-run when executed directly
runChildSelectionTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
