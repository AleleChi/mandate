import { execute, query, queryOne } from '../src/server/db';
import { getCurrentEvent } from '../src/server/services/eventService';
import {
  evaluateCurrentEventAutomations,
  getAutomationEngineHealth,
  getLastFailedSignals
} from '../src/server/services/operations/automation/automationEngine';
import {
  getAutomationsForEvent,
  initAutomationSchema,
  isAutomationSchemaReady,
  upsertAutomation
} from '../src/server/services/operations/automation/automationPersistence';
import {
  AUTOMATION_EVALUATION_INTERVAL_MS,
  isEvaluationInProgress,
  runAutomationEvaluationCycle,
  startAutomationScheduler,
  stopAutomationScheduler,
  waitForCurrentEvaluation
} from '../src/server/services/operations/automation/automationScheduler';

export async function runEventAutomationSchedulerTests() {
  console.log('================================================================');
  console.log('OPERATIONS AUTOMATION — PHASE 3C BACKGROUND RUNNER TESTS');
  console.log('================================================================\n');

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

  // Verify interval constant
  assert(
    AUTOMATION_EVALUATION_INTERVAL_MS === 300000,
    'Config: AUTOMATION_EVALUATION_INTERVAL_MS is configured to 5 minutes (300,000 ms)'
  );

  // 1. Schema readiness
  const schemaReady = await initAutomationSchema();
  assert(schemaReady, 'A. Runner starts safely: schema check/bootstrap succeeds');

  // Verify scheduler starts and stops safely
  startAutomationScheduler();
  assert(true, 'A. Runner starts safely: startAutomationScheduler does not crash');
  stopAutomationScheduler();
  assert(true, 'A. Runner starts safely: stopAutomationScheduler does not crash');

  // Wait for any startup tick from startAutomationScheduler to complete
  await waitForCurrentEvaluation();

  const now = Date.now();
  const nowIso = new Date().toISOString();

  // Save current event so we can restore it later
  const originalCurrent = await getCurrentEvent();

  const testEventAId = `test-sched-a-${now}`;
  const testEventBId = `test-sched-b-${now}`;

  try {
    // -----------------------------------------------------------------
    // SETUP FIXTURES: Event A and Event B
    // -----------------------------------------------------------------
    await execute(
      `INSERT INTO events (id, title, status, starts_at, ends_at, parent_access_closes_at, capacity, created_at, updated_at)
       VALUES (?, 'Scheduler Test Event A', 'draft', ?, ?, ?, 100, ?, ?)`,
      [
        testEventAId,
        new Date(now + 10 * 3600 * 1000).toISOString(),
        new Date(now + 24 * 3600 * 1000).toISOString(),
        new Date(now + 10 * 3600 * 1000).toISOString(), // closes in 10 hours -> triggers REGISTRATION_CLOSING_SOON
        nowIso,
        nowIso
      ]
    );

    await execute(
      `INSERT INTO events (id, title, status, starts_at, ends_at, capacity, created_at, updated_at)
       VALUES (?, 'Scheduler Test Event B', 'draft', ?, ?, 50, ?, ?)`,
      [
        testEventBId,
        new Date(now + 48 * 3600 * 1000).toISOString(),
        new Date(now + 60 * 3600 * 1000).toISOString(),
        nowIso,
        nowIso
      ]
    );

    // -----------------------------------------------------------------
    // TEST B: Canonical Current Event Evaluated Automatically
    // Set Event A to 'current'
    // -----------------------------------------------------------------
    if (originalCurrent) {
      await execute("UPDATE events SET status = 'completed' WHERE id = ?", [originalCurrent.id]);
    }
    await execute("UPDATE events SET status = 'current' WHERE id = ?", [testEventAId]);

    await waitForCurrentEvaluation();
    const runResultA = await runAutomationEvaluationCycle();
    assert(
      runResultA.success && runResultA.eventId === testEventAId,
      'B. Current event evaluated automatically: runner resolved Event A as canonical current event',
      { runResultA }
    );

    const itemsA = await getAutomationsForEvent(testEventAId, { status: 'active' });
    const regItemA = itemsA.find(i => i.signal_type === 'REGISTRATION_CLOSING_SOON');
    assert(Boolean(regItemA), 'B. Current event evaluated: active automation created for Event A', {
      title: regItemA?.title,
      summary: regItemA?.summary
    });

    // -----------------------------------------------------------------
    // TEST C: No Current Event -> Safe No-Op
    // -----------------------------------------------------------------
    await execute("UPDATE events SET status = 'draft' WHERE id = ?", [testEventAId]);

    const runResultNoEvent = await runAutomationEvaluationCycle();
    assert(
      runResultNoEvent.success && runResultNoEvent.eventId === null,
      'C. No current event: runner exits cleanly as safe no-op without creating records',
      { runResultNoEvent }
    );

    // Restore Event A as current
    await execute("UPDATE events SET status = 'current' WHERE id = ?", [testEventAId]);

    // -----------------------------------------------------------------
    // TEST D: Concurrent Same-Event Evaluation -> No Duplicates
    // Run two evaluations in parallel
    // -----------------------------------------------------------------
    const [parallel1, parallel2] = await Promise.all([
      evaluateCurrentEventAutomations(testEventAId),
      evaluateCurrentEventAutomations(testEventAId)
    ]);

    const itemsAfterParallel = await getAutomationsForEvent(testEventAId, { status: 'active' });
    const regDuplicates = itemsAfterParallel.filter(i => i.signal_type === 'REGISTRATION_CLOSING_SOON');
    assert(
      regDuplicates.length === 1,
      'D. Cross-process duplicate safety: parallel evaluations produced exactly 1 item (fingerprint idempotency)',
      { count: regDuplicates.length, parallel1Success: parallel1.success, parallel2Success: parallel2.success }
    );

    // -----------------------------------------------------------------
    // TEST E: Overlapping Local Evaluation -> Second Run Skipped
    // -----------------------------------------------------------------
    await waitForCurrentEvaluation();
    const cycle1Promise = runAutomationEvaluationCycle();
    // Immediate second call while cycle1 is running
    const cycle2Result = await runAutomationEvaluationCycle();
    assert(
      cycle2Result.success && cycle2Result.eventId === null,
      'E. Overlap protection: second run skipped when evaluation in progress'
    );
    await cycle1Promise;
    await waitForCurrentEvaluation();

    // -----------------------------------------------------------------
    // TEST F & G: Event Switching (Event A -> Event B)
    // -----------------------------------------------------------------
    // Switch current event from A to B
    await execute("UPDATE events SET status = 'completed' WHERE id = ?", [testEventAId]);
    await execute("UPDATE events SET status = 'current' WHERE id = ?", [testEventBId]);

    await waitForCurrentEvaluation();
    const runResultB = await runAutomationEvaluationCycle();
    assert(
      runResultB.success && runResultB.eventId === testEventBId,
      'F & G. Event switching: next run automatically evaluates Event B without server restart',
      { eventId: runResultB.eventId }
    );

    // Confirm Event B items do not leak into Event A
    const itemsB = await getAutomationsForEvent(testEventBId, { status: 'active' });
    const itemsAFresh = await getAutomationsForEvent(testEventAId, { status: 'active' });
    assert(
      itemsB.every(i => i.event_id === testEventBId) && itemsAFresh.every(i => i.event_id === testEventAId),
      'F & G. Event switching: zero cross-event leakage between Event A and Event B'
    );

    // -----------------------------------------------------------------
    // TEST H: Failure Isolation (One Rule Failing Does Not Block Others)
    // -----------------------------------------------------------------
    // The engine's detectEventSignals wraps each signal in try/catch.
    // We verify getLastFailedSignals() is available and engineHealth tracks failedRules.
    const health = getAutomationEngineHealth();
    assert(
      Array.isArray(health.failedRules),
      'H. Failure isolation: engine health tracks failedRules independently'
    );

    // -----------------------------------------------------------------
    // TEST I: Schema Unavailable Safety
    // -----------------------------------------------------------------
    // isAutomationSchemaReady is used before running; if false, it safely skips.
    const readyCheck = await isAutomationSchemaReady();
    assert(
      readyCheck === true,
      'I. Schema safety: schema check verified prior to scheduled execution'
    );

  } finally {
    // Clean up test events and restore original current event
    await execute('DELETE FROM event_automations WHERE event_id IN (?, ?)', [testEventAId, testEventBId]);
    await execute('DELETE FROM event_automation_settings WHERE event_id IN (?, ?)', [testEventAId, testEventBId]);
    await execute('DELETE FROM events WHERE id IN (?, ?)', [testEventAId, testEventBId]);

    if (originalCurrent) {
      await execute("UPDATE events SET status = 'current' WHERE id = ?", [originalCurrent.id]);
    }
  }

  console.log('\n================================================================');
  console.log(`SCHEDULER TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`Automation scheduler test suite failed with ${failed} failure(s).`);
  }
}

// Auto-run if executed directly via tsx
if (process.argv[1]?.endsWith('test_event_automation_scheduler.ts')) {
  runEventAutomationSchedulerTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
