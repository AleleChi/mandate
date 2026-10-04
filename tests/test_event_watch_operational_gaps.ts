import { execute, query, queryOne } from '../src/server/db';
import {
  detectEventSignals,
  evaluateCurrentEventAutomations
} from '../src/server/services/operations/automation/automationEngine';
import {
  getAutomationsForEvent,
  initAutomationSchema,
  setAutomationRuleEnabled
} from '../src/server/services/operations/automation/automationPersistence';
import { NO_AUTONOMOUS_EXECUTION, PHASE3B_AUTOMATION_RULES } from '../src/server/services/operations/automation/ruleModel';

export async function runEventWatchOperationalGapsTests() {
  console.log('====================================================');
  console.log('EVENT WATCH — OPERATIONAL GAPS & GROUPING TESTS');
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

  await initAutomationSchema();

  const uid = Date.now();
  const testEventId = `test-gap-evt-${uid}`;
  const nowIso = new Date().toISOString();

  const testParent1Id = `tp-gap-1-${uid}`;
  const testChild1Id = `tc-gap-1-${uid}`;
  const testChild2Id = `tc-gap-2-${uid}`;
  const testEntry1Id = `te-gap-1-${uid}`;
  const testEntry2Id = `te-gap-2-${uid}`;
  const testVol1Id = `tv-gap-1-${uid}`;
  const testVol2Id = `tv-gap-2-${uid}`;
  const testUser1Id = `tu-gap-1-${uid}`;
  const testUser2Id = `tu-gap-2-${uid}`;
  const testParentUserId = `usr-p-gap-${uid}`;

  try {
    // 1. Create test event with configured capacity = 100
    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, capacity, created_at, updated_at)
      VALUES (?, 'Event Watch Gap Test', 'draft', ?, ?, 100, ?, ?)
    `, [testEventId, nowIso, nowIso, nowIso, nowIso]);

    // 2. Create parent user and parent profile with incomplete profile (no phone, no profile_completed_at)
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'parent', ?, ?)
    `, [testParentUserId, `incomplete.${uid}@gap.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, email, profile_completed_at, created_at, updated_at)
      VALUES (?, ?, 'Incomplete Guardian', NULL, ?, NULL, ?, ?)
    `, [testParent1Id, testParentUserId, `incomplete.${uid}@gap.org`, nowIso, nowIso]);

    // 3. Create 2 selected children missing pickup info
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, created_at, updated_at)
      VALUES (?, ?, 'Child Gap 1', 'Male', '2019-01-01', 7, ?, ?),
             (?, ?, 'Child Gap 2', 'Female', '2020-02-02', 6, ?, ?)
    `, [testChild1Id, testParent1Id, nowIso, nowIso, testChild2Id, testParent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?),
             (?, ?, ?, 'selected', ?, ?)
    `, [testEntry1Id, testChild1Id, testEventId, nowIso, nowIso, testEntry2Id, testChild2Id, testEventId, nowIso, nowIso]);

    // 4. Create 2 approved volunteers without duty assignment
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'volunteer', ?, ?), (?, ?, 'volunteer', ?, ?)
    `, [testUser1Id, `u1.${uid}@gap.org`, nowIso, nowIso, testUser2Id, `u2.${uid}@gap.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Volunteer Gap 1', '+2348055555551', '+2348055555551', 'Ushering', 'approved', ?, ?),
             (?, ?, 'Volunteer Gap 2', '+2348055555552', '+2348055555552', 'Technical', 'approved', ?, ?)
    `, [testVol1Id, testUser1Id, nowIso, nowIso, testVol2Id, testUser2Id, nowIso, nowIso]);

    // -------------------------------------------------------------
    // TEST 1: Signal Detection
    // -------------------------------------------------------------
    const signals = await detectEventSignals(testEventId);

    const unassignedSignal = signals.find(s => s.signal === 'APPROVED_VOLUNTEER_UNASSIGNED') as any;
    assert(Boolean(unassignedSignal), 'Signal Detection: APPROVED_VOLUNTEER_UNASSIGNED detected');
    assert(unassignedSignal?.unassignedCount >= 2, 'Signal Detection: Correct unassigned count', { count: unassignedSignal?.unassignedCount });

    const pickupSignal = signals.find(s => s.signal === 'PICKUP_INFORMATION_INCOMPLETE') as any;
    assert(Boolean(pickupSignal), 'Signal Detection: PICKUP_INFORMATION_INCOMPLETE detected');
    assert(pickupSignal?.incompleteCount === 2, 'Signal Detection: Correct missing pickup count', { count: pickupSignal?.incompleteCount });

    const guardianSignal = signals.find(s => s.signal === 'GUARDIAN_INFORMATION_INCOMPLETE') as any;
    assert(Boolean(guardianSignal), 'Signal Detection: GUARDIAN_INFORMATION_INCOMPLETE detected');

    const capacitySignal = signals.find(s => s.signal === 'SELECTION_CAPACITY_STATUS') as any;
    assert(!capacitySignal, 'Signal Detection: SELECTION_CAPACITY_STATUS not triggered when under capacity without pending reviews');

    // -------------------------------------------------------------
    // TEST 2: Grouped Presentation & Deduplication (Single item per condition, NOT 1 per child/volunteer)
    // -------------------------------------------------------------
    const evalRes = await evaluateCurrentEventAutomations(testEventId);
    assert(evalRes.success, 'Evaluation: Evaluator runs successfully on test event');

    const activeItems = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });

    // Grouping: Check that only 1 item exists for APPROVED_VOLUNTEER_UNASSIGNED
    const volItems = activeItems.filter(i => i.signal_type === 'APPROVED_VOLUNTEER_UNASSIGNED');
    assert(volItems.length === 1, 'Grouping: Exactly 1 item created for unassigned volunteers (not one per volunteer)', { count: volItems.length });
    assert(volItems[0].title.includes('approved volunteer'), 'Grouping: Title is human and grouped', { title: volItems[0].title });

    // Grouping: Check that only 1 item exists for PICKUP_INFORMATION_INCOMPLETE
    const pickupItems = activeItems.filter(i => i.signal_type === 'PICKUP_INFORMATION_INCOMPLETE');
    assert(pickupItems.length === 1, 'Grouping: Exactly 1 item created for pickup information (not one per child)', { count: pickupItems.length });
    assert(pickupItems[0].title.includes('children are missing pickup information'), 'Grouping: Pickup title matches count', { title: pickupItems[0].title });

    // Grouping: Check that only 1 item exists for GUARDIAN_INFORMATION_INCOMPLETE
    const guardianItems = activeItems.filter(i => i.signal_type === 'GUARDIAN_INFORMATION_INCOMPLETE');
    assert(guardianItems.length === 1, 'Grouping: Exactly 1 item created for guardian information', { count: guardianItems.length });

    // -------------------------------------------------------------
    // TEST 3: Auto-Resolution
    // -------------------------------------------------------------
    // Fix pickup info for both children
    await execute(`
      INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, created_at, updated_at)
      VALUES ('pp-gap-1', ?, 'parent', 'Fixed Pickup 1', 'Father', '+2348011111111', ?, ?),
             ('pp-gap-2', ?, 'parent', 'Fixed Pickup 2', 'Mother', '+2348022222222', ?, ?)
    `, [testEntry1Id, nowIso, nowIso, testEntry2Id, nowIso, nowIso]);

    // Re-evaluate
    const evalRes2 = await evaluateCurrentEventAutomations(testEventId);
    assert(evalRes2.success, 'Auto-Resolution: Second evaluation runs successfully');

    const updatedActiveItems = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });
    const remainingPickup = updatedActiveItems.filter(i => i.signal_type === 'PICKUP_INFORMATION_INCOMPLETE');
    assert(remainingPickup.length === 0, 'Auto-Resolution: PICKUP_INFORMATION_INCOMPLETE auto-resolved after condition fixed');

    // -------------------------------------------------------------
    // TEST 4: Rule Disable / Enable
    // -------------------------------------------------------------
    await setAutomationRuleEnabled(testEventId, 'rule_approved_volunteer_unassigned', false);
    const evalRes3 = await evaluateCurrentEventAutomations(testEventId);
    assert(evalRes3.success, 'Rule Disable: Evaluation runs with disabled rule');

    const itemsAfterDisable = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });
    // Since rule was disabled, it should either be auto-resolved or excluded
    const activeVolAfterDisable = itemsAfterDisable.filter(i => i.signal_type === 'APPROVED_VOLUNTEER_UNASSIGNED');
    assert(activeVolAfterDisable.length === 0, 'Rule Disable: Disabled rule does not produce active item');

    // Re-enable rule
    await setAutomationRuleEnabled(testEventId, 'rule_approved_volunteer_unassigned', true);

    // -------------------------------------------------------------
    // TEST 5: No Autonomous Fixes
    // -------------------------------------------------------------
    assert(NO_AUTONOMOUS_EXECUTION === true, 'Safety Guardrail: NO_AUTONOMOUS_EXECUTION is strictly true');

    // -------------------------------------------------------------
    // TEST 6: Selection Capacity Regression (Section 8)
    // -------------------------------------------------------------
    const capTestEventId = `test-cap-evt-${uid}`;
    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, capacity, created_at, updated_at)
      VALUES (?, 'Capacity Regression Event', 'draft', ?, ?, 8, ?, ?)
    `, [capTestEventId, nowIso, nowIso, nowIso, nowIso]);

    // Create 11 distinct children for capacity testing
    for (let i = 0; i <= 10; i++) {
      await execute(`
        INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, created_at, updated_at)
        VALUES (?, ?, ?, 'Male', '2020-01-01', 6, ?, ?)
      `, [`cap-c-${uid}-${i}`, testParent1Id, `Cap Child ${i}`, nowIso, nowIso]);
    }

    // Case 1: capacity = 8, selected = 7, awaiting review = 1 -> no over-capacity warning
    for (let i = 0; i < 7; i++) {
      await execute(`
        INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
        VALUES (?, ?, ?, 'selected', ?, ?)
      `, [`cap-e-${uid}-${i}`, `cap-c-${uid}-${i}`, capTestEventId, nowIso, nowIso]);
    }
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'under_review', ?, ?)
    `, [`cap-e-${uid}-rev1`, `cap-c-${uid}-7`, capTestEventId, nowIso, nowIso]);

    let capSignals = await detectEventSignals(capTestEventId);
    assert(!capSignals.some(s => s.signal === 'SELECTION_CAPACITY_STATUS'), 'Capacity: capacity=8, selected=7, awaiting=1 -> no signal');

    // Case 2: capacity = 8, selected = 8, awaiting review = 0 -> no Needs attention item merely because capacity is full
    await execute(`UPDATE child_event_entries SET status = 'selected' WHERE id = ?`, [`cap-e-${uid}-rev1`]);
    capSignals = await detectEventSignals(capTestEventId);
    assert(!capSignals.some(s => s.signal === 'SELECTION_CAPACITY_STATUS'), 'Capacity: capacity=8, selected=8, awaiting=0 -> no Needs attention item merely because capacity is full');

    // Case 3: capacity = 8, selected = 8, awaiting review = 2 -> actionable capacity/review item
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'under_review', ?, ?), (?, ?, ?, 'pending_review', ?, ?)
    `, [`cap-e-${uid}-rev2`, `cap-c-${uid}-8`, capTestEventId, nowIso, nowIso, `cap-e-${uid}-rev3`, `cap-c-${uid}-9`, capTestEventId, nowIso, nowIso]);

    capSignals = await detectEventSignals(capTestEventId);
    const pendingSignal = capSignals.find(s => s.signal === 'SELECTION_CAPACITY_STATUS') as any;
    assert(Boolean(pendingSignal), 'Capacity: capacity=8, selected=8, awaiting=2 -> detected actionable signal');
    assert(pendingSignal?.condition === 'capacity_reached_with_pending_reviews', 'Capacity: condition is capacity_reached_with_pending_reviews');
    assert(pendingSignal?.awaitingReviewCount === 2, 'Capacity: awaitingReviewCount is 2');

    // Case 4: capacity = 8, selected = 9 -> actionable over-capacity item
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [`cap-e-${uid}-over9`, `cap-c-${uid}-10`, capTestEventId, nowIso, nowIso]);

    capSignals = await detectEventSignals(capTestEventId);
    const overSignal = capSignals.find(s => s.signal === 'SELECTION_CAPACITY_STATUS') as any;
    assert(Boolean(overSignal), 'Capacity: capacity=8, selected=9 -> detected over-capacity signal');
    assert(overSignal?.condition === 'over_capacity', 'Capacity: condition is over_capacity');
    assert(overSignal?.overCapacityCount === 1, 'Capacity: overCapacityCount is 1');

    // Test Auto-resolution on capacity event
    const capEval1 = await evaluateCurrentEventAutomations(capTestEventId);
    assert(capEval1.success, 'Capacity: Evaluator runs on capTestEventId');
    const capActive1 = await getAutomationsForEvent(capTestEventId, { status: 'active', includeSafety: true });
    assert(capActive1.some(i => i.signal_type === 'SELECTION_CAPACITY_STATUS'), 'Capacity: Active item created for over-capacity');

    // Fix over-capacity: delete the 9th entry and pending reviews, capacity 8 selected 8 -> auto-resolves
    await execute(`DELETE FROM child_event_entries WHERE id IN (?, ?, ?)`, [`cap-e-${uid}-over9`, `cap-e-${uid}-rev2`, `cap-e-${uid}-rev3`]);
    const capEval2 = await evaluateCurrentEventAutomations(capTestEventId);
    assert(capEval2.success, 'Capacity: Re-evaluator runs after condition cleared');
    const capActive2 = await getAutomationsForEvent(capTestEventId, { status: 'active', includeSafety: true });
    assert(!capActive2.some(i => i.signal_type === 'SELECTION_CAPACITY_STATUS'), 'Capacity: Auto-resolved after condition cleared');

  } finally {
    // Cleanup
    await execute('DELETE FROM pickup_people WHERE id IN (?, ?)', ['pp-gap-1', 'pp-gap-2']);
    await execute('DELETE FROM child_event_entries WHERE id IN (?, ?) OR event_id LIKE ?', [testEntry1Id, testEntry2Id, `%${uid}%`]);
    await execute('DELETE FROM children WHERE id IN (?, ?)', [testChild1Id, testChild2Id]);
    await execute('DELETE FROM parent_profiles WHERE id = ?', [testParent1Id]);
    await execute('DELETE FROM volunteer_profiles WHERE id IN (?, ?)', [testVol1Id, testVol2Id]);
    await execute('DELETE FROM users WHERE id IN (?, ?, ?)', [testUser1Id, testUser2Id, testParentUserId]);
    await execute('DELETE FROM event_automations WHERE event_id = ? OR event_id LIKE ?', [testEventId, `%${uid}%`]);
    await execute('DELETE FROM event_automation_settings WHERE event_id = ? OR event_id LIKE ?', [testEventId, `%${uid}%`]);
    await execute('DELETE FROM events WHERE id = ? OR id LIKE ?', [testEventId, `%${uid}%`]);
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

// Self-run when executed directly
runEventWatchOperationalGapsTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
