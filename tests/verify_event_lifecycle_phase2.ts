import { execute, query, queryOne } from '../src/server/db';
import { getCurrentEvent, getCurrentEventId, getEventById, setCurrentEvent } from '../src/server/services/eventService';

async function runTests() {
  console.log('=== STARTING EVENT LIFECYCLE PHASE 2 VERIFICATION ===\n');

  const ts = Date.now();
  const evAId = `test-phase2-a-${ts}`;
  const evBId = `test-phase2-b-${ts}`;
  const evCId = `test-phase2-c-${ts}`;
  const evDId = `test-phase2-d-${ts}`;
  const now = new Date().toISOString();

  // Capture original current event so we restore it cleanly in teardown
  const origCurrent = await queryOne<{ id: string }>("SELECT id FROM events WHERE status = 'current'");
  const originalCurrentId = origCurrent ? origCurrent.id : 'event-ga-2026';

  try {
    // ------------------------------------------------------------------------
    // SETUP: Insert isolated test events as 'upcoming' / 'open' / 'active'
    // ------------------------------------------------------------------------
    await execute(`
      INSERT INTO events (id, title, section_name, location, starts_at, ends_at, daily_start_time, daily_end_time, status, created_at, updated_at)
      VALUES (?, ?, 'Children', 'Auditorium', '2026-08-01', '2026-08-03', '09:00', '17:00', 'upcoming', ?, ?)
    `, [evAId, 'Test Event A (Initial)', now, now]);

    await execute(`
      INSERT INTO events (id, title, section_name, location, starts_at, ends_at, daily_start_time, daily_end_time, status, created_at, updated_at)
      VALUES (?, ?, 'Children', 'Hall 2', '2026-09-01', '2026-09-03', '09:00', '17:00', 'upcoming', ?, ?)
    `, [evBId, 'Test Event B (Upcoming)', now, now]);

    await execute(`
      INSERT INTO events (id, title, section_name, location, starts_at, ends_at, daily_start_time, daily_end_time, status, created_at, updated_at)
      VALUES (?, ?, 'Children', 'Hall 3', '2026-10-01', '2026-10-03', '09:00', '17:00', 'open', ?, ?)
    `, [evCId, 'Test Event C (Legacy Open)', now, now]);

    await execute(`
      INSERT INTO events (id, title, section_name, location, starts_at, ends_at, daily_start_time, daily_end_time, status, created_at, updated_at)
      VALUES (?, ?, 'Children', 'Hall 4', '2026-11-01', '2026-11-03', '09:00', '17:00', 'active', ?, ?)
    `, [evDId, 'Test Event D (Legacy Active)', now, now]);

    // Use atomic switch to make evA the current event
    await setCurrentEvent(evAId);

    // ------------------------------------------------------------------------
    // TEST 1: CANONICAL RESOLVER
    // ------------------------------------------------------------------------
    console.log('[Test 1] Verifying canonical getCurrentEvent and getCurrentEventId...');

    // A is currently 'current'
    const currEv = await getCurrentEvent();
    const currEvId = await getCurrentEventId();

    if (!currEv || currEv.id !== evAId) {
      throw new Error(`FAIL: Expected current event to be ${evAId}, got ${currEv?.id} (${currEv?.title})`);
    }
    if (currEvId !== evAId) {
      throw new Error(`FAIL: Expected current event ID to be ${evAId}, got ${currEvId}`);
    }
    if (currEv.status !== 'current') {
      throw new Error(`FAIL: Expected status 'current', got ${currEv.status}`);
    }
    console.log('✅ PASS: Canonical resolver returns single event with status = "current".');

    // Verify open, active, and upcoming events are NEVER returned as current
    // Temporarily demote evA to upcoming to verify strict null behavior (no fallback!)
    await execute("UPDATE events SET status = 'upcoming' WHERE id = ?", [evAId]);

    const nullCurrent = await getCurrentEvent();
    const nullCurrentId = await getCurrentEventId();

    if (nullCurrent !== null) {
      throw new Error(`FAIL: Canonical resolver fallback detected! Expected null when no event is 'current', but got ${nullCurrent.id} (${nullCurrent.status})`);
    }
    if (nullCurrentId !== null) {
      throw new Error(`FAIL: Expected null current ID, got ${nullCurrentId}`);
    }
    console.log('✅ PASS: Canonical resolver returns null cleanly when no event is "current" (NO fallback to open/active/upcoming/latest).');

    // Restore evA to current via setCurrentEvent
    await setCurrentEvent(evAId);

    // ------------------------------------------------------------------------
    // TEST 2: GET BY ID HELPER
    // ------------------------------------------------------------------------
    console.log('\n[Test 2] Verifying getEventById helper...');
    const fetchedA = await getEventById(evAId);
    const fetchedB = await getEventById(evBId);
    const fetchedNonExistent = await getEventById('non-existent-event-id-999');

    if (!fetchedA || fetchedA.id !== evAId || fetchedA.status !== 'current') {
      throw new Error('FAIL: getEventById failed for Event A');
    }
    if (!fetchedB || fetchedB.id !== evBId || fetchedB.status !== 'upcoming') {
      throw new Error('FAIL: getEventById failed for Event B');
    }
    if (fetchedNonExistent !== null) {
      throw new Error('FAIL: getEventById must return null for non-existent event');
    }
    console.log('✅ PASS: getEventById retrieves events by ID without mixing view context with active state.');

    // ------------------------------------------------------------------------
    // TEST 3: ATOMIC MAKE CURRENT SWITCH
    // ------------------------------------------------------------------------
    console.log('\n[Test 3] Verifying atomic Make current switch (Event A -> Event B)...');

    const switchResult = await setCurrentEvent(evBId);

    if (!switchResult.success) {
      throw new Error('FAIL: setCurrentEvent did not report success');
    }
    if (switchResult.currentEvent.id !== evBId || switchResult.currentEvent.status !== 'current') {
      throw new Error(`FAIL: Expected Event B to be current, got ${JSON.stringify(switchResult.currentEvent)}`);
    }
    if (switchResult.previousEventId !== evAId) {
      throw new Error(`FAIL: Expected previousEventId to be ${evAId}, got ${switchResult.previousEventId}`);
    }

    // Verify DB state
    const evAAfter = await queryOne('SELECT * FROM events WHERE id = ?', [evAId]);
    const evBAfter = await queryOne('SELECT * FROM events WHERE id = ?', [evBId]);

    if (evAAfter.status !== 'upcoming') {
      throw new Error(`FAIL: Expected Event A to become 'upcoming', got ${evAAfter.status}`);
    }
    if (evBAfter.status !== 'current') {
      throw new Error(`FAIL: Expected Event B to become 'current', got ${evBAfter.status}`);
    }

    // Verify exactly one current event in entire database
    const allCurrentRows = await query("SELECT id FROM events WHERE status = 'current'");
    if (allCurrentRows.length !== 1 || allCurrentRows[0].id !== evBId) {
      throw new Error(`FAIL: Database does not have exactly 1 current event! Found: ${JSON.stringify(allCurrentRows)}`);
    }
    console.log('✅ PASS: Atomic switch made Event B current, demoted Event A to "upcoming", exactly 1 current event exists.');

    // ------------------------------------------------------------------------
    // TEST 4: LEGACY STATE CLEANUP DURING SWITCH
    // Current + Open + Active states present before switch
    // ------------------------------------------------------------------------
    console.log('\n[Test 4] Verifying atomic switch cleans up legacy open/active aliases...');

    // Re-verify that evC is 'open' and evD is 'active'
    await execute("UPDATE events SET status = 'open' WHERE id = ?", [evCId]);
    await execute("UPDATE events SET status = 'active' WHERE id = ?", [evDId]);

    // Now make Event C the current event
    const switchLegacy = await setCurrentEvent(evCId);

    if (switchLegacy.currentEvent.id !== evCId) {
      throw new Error('FAIL: Target Event C did not become current');
    }

    const cState = await queryOne('SELECT status FROM events WHERE id = ?', [evCId]);
    const dState = await queryOne('SELECT status FROM events WHERE id = ?', [evDId]);
    const bState = await queryOne('SELECT status FROM events WHERE id = ?', [evBId]);

    if (cState.status !== 'current') {
      throw new Error(`FAIL: Event C must be 'current', got ${cState.status}`);
    }
    if (dState.status === 'active' || dState.status === 'current') {
      throw new Error(`FAIL: Legacy 'active' row must be deactivated, got ${dState.status}`);
    }
    if (bState.status !== 'upcoming') {
      throw new Error(`FAIL: Previous current Event B must be 'upcoming', got ${bState.status}`);
    }

    const currentCheck = await query("SELECT id FROM events WHERE status = 'current'");
    if (currentCheck.length !== 1 || currentCheck[0].id !== evCId) {
      throw new Error(`FAIL: Expected exactly 1 current event (${evCId}), got ${JSON.stringify(currentCheck)}`);
    }
    console.log('✅ PASS: Legacy "open" and "active" aliases were safely neutralized to "upcoming" without multiple current rows.');

    // ------------------------------------------------------------------------
    // TEST 5: TRANSACTION ROLLBACK ON FAILURE
    // ------------------------------------------------------------------------
    console.log('\n[Test 5] Verifying transaction rollback on failure (non-existent event)...');
    try {
      await setCurrentEvent('non-existent-fail-id');
      throw new Error('FAIL: Expected setCurrentEvent to fail for non-existent event');
    } catch (err: any) {
      if (err.message.includes('FAIL: Expected')) throw err;
      console.log('   Expected error caught:', err.message);
    }

    // Verify Event C is STILL the current event and no corruption occurred
    const checkAfterRollback = await getCurrentEvent();
    if (!checkAfterRollback || checkAfterRollback.id !== evCId) {
      throw new Error(`FAIL: Rollback failed, Event C should still be current, but got ${checkAfterRollback?.id}`);
    }
    console.log('✅ PASS: Transaction rolled back cleanly upon error; current event remained intact.');

    // ------------------------------------------------------------------------
    // TEST 6: CONCURRENCY SAFETY
    // Competing Make current calls cannot leave multiple current rows
    // ------------------------------------------------------------------------
    console.log('\n[Test 6] Verifying concurrency safety with competing switches...');
    // Fire two competing switches nearly simultaneously (switch to evA vs switch to evB)
    const [res1, res2] = await Promise.allSettled([
      setCurrentEvent(evAId),
      setCurrentEvent(evBId)
    ]);

    console.log(`   Concurrent execution results: res1=${res1.status}, res2=${res2.status}`);

    const finalCurrent = await query("SELECT id, title, status FROM events WHERE status = 'current'");
    if (finalCurrent.length !== 1) {
      throw new Error(`CONCURRENCY VIOLATION: Expected exactly 1 current event, found ${finalCurrent.length}: ${JSON.stringify(finalCurrent)}`);
    }
    console.log(`✅ PASS: Concurrency safe. Exactly ONE current event persisted: ${finalCurrent[0].id} (${finalCurrent[0].title}).`);

    // ------------------------------------------------------------------------
    // TEST 7: VIEWING REGRESSION
    // ------------------------------------------------------------------------
    console.log('\n[Test 7] Verifying viewing Upcoming / Draft / Past does not change current event...');
    const winnerId = finalCurrent[0].id;

    // Simulate reading various events
    await getEventById(evAId);
    await getEventById(evBId);
    await getEventById(evCId);
    await getEventById(evDId);

    const checkAfterView = await getCurrentEvent();
    if (!checkAfterView || checkAfterView.id !== winnerId) {
      throw new Error(`FAIL: Viewing events altered the current event! Expected ${winnerId}, got ${checkAfterView?.id}`);
    }
    console.log('✅ PASS: Viewing events does not alter current event.');

  } finally {
    // ------------------------------------------------------------------------
    // TEARDOWN: Clean up temporary test records & restore production current
    // ------------------------------------------------------------------------
    await execute("DELETE FROM events WHERE id IN (?, ?, ?, ?)", [evAId, evBId, evCId, evDId]);
    await execute("UPDATE events SET status = 'current' WHERE id = ?", [originalCurrentId]);
    console.log('\n✅ Teardown complete: Temporary test records deleted, production current event restored.');
  }

  console.log('\n=== ALL PHASE 2 EVENT LIFECYCLE TESTS PASSED SUCCESSFULLY ===');
}

runTests().catch(err => {
  console.error('\n❌ Phase 2 Verification Failed:', err);
  process.exit(1);
});
