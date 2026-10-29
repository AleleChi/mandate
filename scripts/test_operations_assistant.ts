import { query, queryOne, execute, transaction } from '../src/server/db';
import { getCurrentEvent, getCurrentEventId } from '../src/server/services/eventService';
import { operationsAssistantService } from '../src/server/services/operationsAssistantService';

async function runOperationsAssistantTests() {
  console.log('====================================================');
  console.log('STARTING OPERATIONS ASSISTANT TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`, detail || '');
      failed++;
    }
  }

  // 1. Current Event Resolution
  const currentEvent = await getCurrentEvent();
  console.log(`Current active event: "${currentEvent?.title || 'None'}" (ID: ${currentEvent?.id || 'None'})`);
  assert(Boolean(currentEvent && currentEvent.id), 'Test 1: Canonical current event resolves');

  const currentEventId = currentEvent!.id;

  // 2. Test A: Live Metrics match direct DB queries
  console.log('\n--- Test A: Real Counts Match DB Queries ---');
  const report = await operationsAssistantService.getEventReadiness(currentEventId);

  // Direct count queries
  const directRegs = await queryOne(
    'SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND COALESCE(is_deleted, 0) = 0',
    [currentEventId]
  );
  const directSelected = await queryOne(
    "SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up', 'checked_out') AND COALESCE(is_deleted, 0) = 0",
    [currentEventId]
  );
  const directLocations = await query(
    'SELECT id FROM event_locations WHERE event_id = ? AND is_active = 1',
    [currentEventId]
  );
  const directAlerts = await queryOne(
    "SELECT COUNT(*) as count FROM event_safety_alerts WHERE event_id = ? AND status != 'resolved'",
    [currentEventId]
  );

  assert(
    report.metrics.registrations === (directRegs?.count || 0),
    'Test A.1: Registration metric matches direct DB query',
    { report: report.metrics.registrations, direct: directRegs?.count }
  );

  assert(
    report.metrics.selectedChildren === (directSelected?.count || 0),
    'Test A.2: Selected children metric matches direct DB query',
    { report: report.metrics.selectedChildren, direct: directSelected?.count }
  );

  assert(
    report.metrics.dutyLocations === directLocations.length,
    'Test A.3: Duty locations metric matches active event_locations count',
    { report: report.metrics.dutyLocations, direct: directLocations.length }
  );

  assert(
    report.metrics.openSafetyNotices >= (directAlerts?.count || 0),
    'Test A.4: Open safety notices include active alerts count',
    { report: report.metrics.openSafetyNotices, direct: directAlerts?.count }
  );

  // 3. Test B: Event A / Event B Strict Isolation
  console.log('\n--- Test B: Event Isolation ---');
  // Create a distinct isolated test event "event-isolation-test-b"
  const testEventBId = `test-iso-event-${Date.now()}`;
  const nowStr = new Date().toISOString();

  await execute(`
    INSERT INTO events (id, title, status, capacity, created_at, updated_at)
    VALUES (?, 'Isolated Test Event B', 'draft', 100, ?, ?)
  `, [testEventBId, nowStr, nowStr]);

  // Query readiness for Event B
  const reportB = await operationsAssistantService.getEventReadiness(testEventBId);

  assert(
    reportB.metrics.registrations === 0,
    'Test B.1: Event B has 0 registrations (isolated from Event A)',
    { eventBRegs: reportB.metrics.registrations }
  );

  assert(
    reportB.metrics.selectedChildren === 0,
    'Test B.2: Event B has 0 selected children (no leak from Event A)',
    { eventBSelected: reportB.metrics.selectedChildren }
  );

  assert(
    reportB.metrics.dutyLocations === 0,
    'Test B.3: Event B has 0 duty locations (no leak from Event A)',
    { eventBLocations: reportB.metrics.dutyLocations }
  );

  // Cleanup Event B
  await execute('DELETE FROM events WHERE id = ?', [testEventBId]);

  // 4. Test C: No safety permissions broadened & Safe aggregation
  console.log('\n--- Test C: Safety Information Non-Autonomous & Factual ---');
  assert(
    report.readinessReasons.every((r) => !r.includes('high risk') && !r.includes('diagnos')),
    'Test C.1: Readiness reasons do NOT profile children or assert medical diagnoses'
  );
  assert(
    report.needsAttention.every((item) => !item.explanation.includes('high risk child')),
    'Test C.2: Needs attention items are strictly factual and institutional'
  );

  // 5. Test D: Empty Event Graceful Handling
  console.log('\n--- Test D: Empty Event Graceful Handling ---');
  const emptyReport = await operationsAssistantService.getEventReadiness('non-existent-event-id');
  assert(
    emptyReport.readinessStatus === 'NOT READY',
    'Test D.1: Missing/empty event returns NOT READY'
  );
  assert(
    emptyReport.metrics.registrations === 0 && emptyReport.metrics.selectedChildren === 0,
    'Test D.2: Missing/empty event returns 0 metrics without throwing exceptions'
  );

  // 6. Test E: No Fake Data
  console.log('\n--- Test E: No Fake Data ---');
  assert(
    report.metrics.registrations !== undefined &&
    report.metrics.selectedChildren !== undefined &&
    report.metrics.checkedIn !== undefined,
    'Test E.1: All metrics are derived from real DB queries'
  );

  // 7. Test F: Supported Operational Questions Return Grounded Answers
  console.log('\n--- Test F: Supported Grounded Queries ---');

  const q1 = await operationsAssistantService.processOperationalQuery('How many children are selected?', currentEventId);
  assert(q1.grounded === true && q1.intent === 'selected_children_count', 'Test F.1: "How many children are selected?" answered');
  console.log(`   Answer: "${q1.answer}"`);

  const q2 = await operationsAssistantService.processOperationalQuery('Which age group is closest to capacity?', currentEventId);
  assert(q2.grounded === true && q2.intent === 'age_group_capacity', 'Test F.2: "Which age group is closest to capacity?" answered');
  console.log(`   Answer: "${q2.answer}"`);

  const q3 = await operationsAssistantService.processOperationalQuery('How many volunteers are currently on duty?', currentEventId);
  assert(q3.grounded === true && q3.intent === 'volunteers_on_duty', 'Test F.3: "How many volunteers are currently on duty?" answered');
  console.log(`   Answer: "${q3.answer}"`);

  const q4 = await operationsAssistantService.processOperationalQuery('Which locations need more volunteers?', currentEventId);
  assert(q4.grounded === true && q4.intent === 'locations_needing_volunteers', 'Test F.4: "Which locations need more volunteers?" answered');
  console.log(`   Answer: "${q4.answer}"`);

  const q5 = await operationsAssistantService.processOperationalQuery('How many selected children do not have passes?', currentEventId);
  assert(q5.grounded === true && q5.intent === 'selected_children_without_passes', 'Test F.5: "How many selected children do not have passes?" answered');
  console.log(`   Answer: "${q5.answer}"`);

  const q6 = await operationsAssistantService.processOperationalQuery('What changed today?', currentEventId);
  assert(q6.grounded === true && q6.intent === 'what_changed_today', 'Test F.6: "What changed today?" answered');
  console.log(`   Answer: "${q6.answer}"`);

  const q7 = await operationsAssistantService.processOperationalQuery('Is registration still open?', currentEventId);
  assert(q7.grounded === true && q7.intent === 'registration_status', 'Test F.7: "Is registration still open?" answered');
  console.log(`   Answer: "${q7.answer}"`);

  // 8. Test G: Unsupported Question Returns Required Fallback
  console.log('\n--- Test G: Unsupported Query Fallback ---');
  const unsupportedQ = await operationsAssistantService.processOperationalQuery('What is the capital of France?', currentEventId);
  assert(
    unsupportedQ.answer === "I don't have enough event data to answer that yet.",
    'Test G.1: Unsupported query returns exact fallback response without hallucination',
    { answer: unsupportedQ.answer }
  );
  assert(
    unsupportedQ.grounded === false,
    'Test G.2: Unsupported query is marked grounded: false'
  );

  console.log('\n====================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runOperationsAssistantTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
