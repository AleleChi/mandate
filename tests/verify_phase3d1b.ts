import assert from 'assert';
import crypto from 'crypto';
import { execute, query, queryOne } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import { setCurrentEvent, getCurrentEventId } from '../src/server/services/eventService';
import adminRouter from '../src/server/routes/admin';

// Helper to simulate express requests against adminRouter
function createMockReqRes(router: any, options: {
  method: string;
  url: string;
  body?: any;
  headers?: Record<string, string>;
  token?: string;
}) {
  const parsedUrl = new URL(options.url, 'http://localhost');
  const pathPart = parsedUrl.pathname;
  const parsedQuery: Record<string, string> = {};
  parsedUrl.searchParams.forEach((val, key) => {
    parsedQuery[key] = val;
  });

  const headersMap: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.headers || {})
  };
  if (options.token) {
    headersMap['authorization'] = `Bearer ${options.token}`;
  }

  const req: any = {
    method: options.method,
    url: options.url,
    originalUrl: `/api/admin${options.url}`,
    baseUrl: '/api/admin',
    path: pathPart,
    body: options.body || {},
    params: {},
    headers: headersMap,
    get: (name: string) => headersMap[name.toLowerCase()] || undefined,
    cookies: {},
    query: parsedQuery
  };

  let statusCode = 200;
  let responseData: any = null;
  let ended = false;

  const res: any = {
    statusCode,
    status(code: number) { statusCode = code; return res; },
    json(data: any) { responseData = data; ended = true; return res; },
    send(data: any) { responseData = data; ended = true; return res; },
    setHeader() { return res; },
    end() { ended = true; return res; },
    redirect() { ended = true; return res; }
  };

  return {
    req,
    res,
    executeHandler: (): Promise<{ status: number; body: any }> =>
      new Promise((resolve, reject) => {
        router(req, res, (err: any) => {
          if (err) return reject(err);
          resolve({ status: statusCode, body: responseData });
        });
        const interval = setInterval(() => {
          if (ended) { clearInterval(interval); resolve({ status: statusCode, body: responseData }); }
        }, 10);
        setTimeout(() => { clearInterval(interval); resolve({ status: statusCode, body: responseData }); }, 6000);
      })
  };
}

async function runTests() {
  console.log('=== PHASE 3D1B VERIFICATION: ADMIN OVERVIEW + PARENT DETAIL ONLY ===\n');

  const initialCurrentEventId = await getCurrentEventId();
  console.log(`Initial current event: ${initialCurrentEventId}`);
  assert.strictEqual(initialCurrentEventId, 'event-ga-2026', 'Initial current event must be event-ga-2026');

  const adminUserId = `test-admin-${crypto.randomUUID()}`;
  const nowStr = new Date().toISOString();

  // Create admin user in DB
  await execute(`
    INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
    VALUES (?, ?, 'dummyhash', 'admin', 1, ?, ?)
  `, [adminUserId, `admin-${crypto.randomUUID()}@test.internal`, nowStr, nowStr]);

  const adminToken = generateToken(adminUserId);

  // Define unique IDs for Event A & Event B
  const eventAId = `test-evt-3d1b-a-${crypto.randomUUID().slice(0, 8)}`;
  const eventBId = `test-evt-3d1b-b-${crypto.randomUUID().slice(0, 8)}`;

  // Parent P and Child X
  const parentPUserId = `user-p-${crypto.randomUUID()}`;
  const parentPId = `parent-p-${crypto.randomUUID().slice(0, 8)}`;
  const childXId = `child-x-${crypto.randomUUID().slice(0, 8)}`;
  const entryAId = `entry-a-x-${crypto.randomUUID().slice(0, 8)}`;

  try {
    // 1. Seed Event A and Event B
    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Test Event A 3D1B', 'upcoming', '2027-03-01T09:00:00Z', '2027-03-01T17:00:00Z', ?, ?)
    `, [eventAId, nowStr, nowStr]);

    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Test Event B 3D1B', 'upcoming', '2027-04-01T09:00:00Z', '2027-04-01T17:00:00Z', ?, ?)
    `, [eventBId, nowStr, nowStr]);

    // 2. Seed Parent P
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES (?, 'parentp3d1b@test.internal', 'dummyhash', 'parent', 1, ?, ?)
    `, [parentPUserId, nowStr, nowStr]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Parent P Peter', 'parentp3d1b@test.internal', '+2348000009999', ?, ?)
    `, [parentPId, parentPUserId, nowStr, nowStr]);

    // 3. Seed Child X (persistent child of Parent P)
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, age_group, calculated_age, created_at, updated_at)
      VALUES (?, ?, 'Child X Xavier', '2020-06-15', 'male', 'Ages 4-6', 6, ?, ?)
    `, [childXId, parentPId, nowStr, nowStr]);

    // 4. Seed Entry for Child X in Event A ONLY (status: checked_in)
    // In Event B, Child X has NO registration
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, checked_in_at, has_medical_notes, medical_notes, created_at, updated_at)
      VALUES (?, ?, ?, 'checked_in', ?, ?, 1, 'Peanut allergy', ?, ?)
    `, [entryAId, childXId, eventAId, nowStr, nowStr, nowStr, nowStr]);

    console.log('Test fixtures created successfully.\n');

    // =========================================================================
    // VERIFICATION 1: Event A is Current
    // =========================================================================
    console.log('--- TEST GROUP 1: Event A is Current ---');
    await setCurrentEvent(eventAId);
    assert.strictEqual(await getCurrentEventId(), eventAId, 'Event A must be set to current');

    // 1.1 GET /overview returns Event A metrics
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/overview', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200, `overview status ${res.status}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.success, true);
      assert(res.body.event !== null, 'event object must not be null');
      assert.strictEqual(res.body.event.id, eventAId, `event.id must match Event A (${eventAId})`);
      assert.strictEqual(res.body.metrics.checkedIn, 1, 'Event A must report exactly 1 checkedIn child');
      assert.strictEqual(res.body.attendance.checkedIn, 1, 'Event A attendance must report 1 checkedIn');
      assert(res.body.metrics.totalParents > 0, 'Global totalParents must be preserved');
      assert(res.body.metrics.totalChildren > 0, 'Global totalChildren must be preserved');
      const medItem = res.body.needsAttention.items.find((i: any) => i.id === 'medical');
      assert(medItem && medItem.count >= 1, 'Event A must report medical notes for Child X');
      console.log('  [PASS] 1.1 GET /overview scopes metrics to Event A correctly');
    }

    // 1.2 GET /parents/:id returns Child X with Event A participation
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/parents/${parentPId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200, `parents/:id status ${res.status}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.parent.id, parentPId, 'Parent persistent identity must be preserved');
      assert.strictEqual(res.body.parent.fullName, 'Parent P Peter');

      const kids = res.body.linkedChildren;
      assert(Array.isArray(kids) && kids.length >= 1, 'Child X must be in linkedChildren');
      const childX = kids.find((k: any) => k.id === childXId);
      assert(childX, 'Child X persistent identity must be present in linkedChildren');
      assert.strictEqual(childX.entryStatus, 'checked_in', 'Child X entryStatus must be checked_in for Event A');
      assert.strictEqual(childX.pickupStatus, 'checked_in', 'Child X pickupStatus must be checked_in for Event A');
      assert(childX.careFlags.includes('medical_issue'), 'Child X careFlags must include medical_issue');
      assert.strictEqual(childX.applicationId, entryAId, 'Child X applicationId must match Event A entry');

      assert.strictEqual(res.body.eventSummary.checkedIn, 1, 'Event summary checkedIn must be 1');
      console.log('  [PASS] 1.2 GET /parents/:id returns Child X with Event A participation');
    }

    // =========================================================================
    // VERIFICATION 2: Event B is Current
    // =========================================================================
    console.log('\n--- TEST GROUP 2: Event B is Current ---');
    await setCurrentEvent(eventBId);
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Event B must be set to current');

    // 2.1 GET /overview returns Event B metrics (0 check-ins, no leakage from Event A)
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/overview', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.event !== null);
      assert.strictEqual(res.body.event.id, eventBId, `event.id must match Event B (${eventBId})`);
      assert.strictEqual(res.body.metrics.checkedIn, 0, 'Event B must have 0 checkedIn (no leakage from Event A)');
      assert.strictEqual(res.body.attendance.checkedIn, 0, 'Event B attendance must have 0 checkedIn');
      assert.strictEqual(res.body.metrics.selected, 0, 'Event B must have 0 selected');
      assert.strictEqual(res.body.metrics.underReview, 0, 'Event B must have 0 underReview');
      const medItem = res.body.needsAttention.items.find((i: any) => i.id === 'medical');
      assert.strictEqual(medItem?.count, 0, 'Event B must report 0 medical notes (no leakage from Event A)');
      // Global metrics preserved
      assert(res.body.metrics.totalParents > 0, 'Global totalParents preserved in Event B');
      assert(res.body.metrics.totalChildren > 0, 'Global totalChildren preserved in Event B');
      console.log('  [PASS] 2.1 GET /overview scopes metrics strictly to Event B (no A leakage)');
    }

    // 2.2 GET /parents/:id returns Child X with NOT-REGISTERED state for Event B
    // Child X must NOT be hidden merely because they have no entry in Event B!
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/parents/${parentPId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.parent.id, parentPId, 'Parent persistent identity preserved in Event B context');

      const kids = res.body.linkedChildren;
      assert(Array.isArray(kids) && kids.length >= 1, 'Child X must NOT be hidden merely because not registered in Event B');
      const childX = kids.find((k: any) => k.id === childXId);
      assert(childX, 'Child X must still be visible');
      assert.strictEqual(childX.entryStatus, 'not_registered', 'Child X entryStatus must be not_registered for Event B');
      assert.strictEqual(childX.reviewStatus, 'not_registered', 'Child X reviewStatus must be not_registered for Event B');
      assert.strictEqual(childX.pickupStatus, 'not_arrived', 'Child X pickupStatus must be not_arrived for Event B');
      assert.strictEqual(childX.applicationId, null, 'Child X applicationId must be null for Event B');
      assert(!childX.careFlags.includes('medical_issue'), 'Event A medical notes must NOT leak into Event B');

      assert.strictEqual(res.body.eventSummary.checkedIn, 0, 'Event B eventSummary checkedIn must be 0');
      assert.strictEqual(res.body.eventSummary.selected, 0, 'Event B eventSummary selected must be 0');
      assert.strictEqual(res.body.eventSummary.childrenAdded, 1, 'eventSummary childrenAdded must still count child');
      console.log('  [PASS] 2.2 GET /parents/:id returns Child X with not-registered state for Event B');
    }

    // =========================================================================
    // VERIFICATION 3: Historical explicit query (?eventId=A) while B is current
    // =========================================================================
    console.log('\n--- TEST GROUP 3: Historical Queries while Event B remains Current ---');
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Pre-condition: Event B is current');

    // 3.1 GET /overview?eventId=A returns Event A metrics
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/overview?eventId=${eventAId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.event.id, eventAId, 'Overview must resolve historical Event A');
      assert.strictEqual(res.body.metrics.checkedIn, 1, 'Overview must return Event A check-in count (1)');
      assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must remain Event B after historical overview query');
      console.log('  [PASS] 3.1 GET /overview?eventId=A returns Event A historical metrics');
    }

    // 3.2 GET /parents/:id?eventId=A returns Child X with Event A participation
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/parents/${parentPId}?eventId=${eventAId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.parent.id, parentPId);

      const kids = res.body.linkedChildren;
      const childX = kids.find((k: any) => k.id === childXId);
      assert(childX, 'Child X must be visible in historical query');
      assert.strictEqual(childX.entryStatus, 'checked_in', 'Historical query must show Event A checked_in status');
      assert.strictEqual(childX.pickupStatus, 'checked_in');
      assert.strictEqual(childX.applicationId, entryAId);
      assert(childX.careFlags.includes('medical_issue'));
      assert.strictEqual(res.body.eventSummary.checkedIn, 1);

      assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must remain Event B after historical parent detail query');
      console.log('  [PASS] 3.2 GET /parents/:id?eventId=A returns Event A participation without altering current event');
    }

    // =========================================================================
    // VERIFICATION 4: No Current Event (Safe handling without 2026 fallback)
    // =========================================================================
    console.log('\n--- TEST GROUP 4: No Current Event Scenario ---');
    await execute("UPDATE events SET status = 'upcoming' WHERE status = 'current'");
    assert.strictEqual(await getCurrentEventId(), null, 'Pre-condition: No current event exists in DB');

    // 4.1 GET /overview returns safe response with event: null and 0 counts, no 2026 fallback
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/overview', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200, `overview without current event failed with status ${res.status}`);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.event, null, 'event must be null when no current event exists (no 2026 fallback!)');
      assert.strictEqual(res.body.metrics.checkedIn, 0);
      assert.strictEqual(res.body.metrics.selected, 0);
      assert.strictEqual(res.body.metrics.underReview, 0);
      assert.strictEqual(res.body.attendance.checkedIn, 0);
      assert.strictEqual(res.body.attendance.expected, 0);
      assert.deepStrictEqual(res.body.recentActivity, []);
      // Global persistent metrics must still be present and accurate
      assert(res.body.metrics.totalParents > 0, 'Global totalParents must still be reported');
      assert(res.body.metrics.totalChildren > 0, 'Global totalChildren must still be reported');
      console.log('  [PASS] 4.1 GET /overview safely returns event: null with 0 event metrics (no 2026 fallback)');
    }

    // 4.2 GET /parents/:id returns safe response with not_registered children, no 2026 fallback
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/parents/${parentPId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.parent.id, parentPId, 'Persistent parent identity preserved');
      const kids = res.body.linkedChildren;
      const childX = kids.find((k: any) => k.id === childXId);
      assert(childX, 'Child X must still be returned');
      assert.strictEqual(childX.entryStatus, 'not_registered', 'Child X must be not_registered when no current event');
      assert.strictEqual(childX.reviewStatus, 'not_registered');
      assert.strictEqual(childX.pickupStatus, 'not_arrived');
      assert.strictEqual(childX.applicationId, null);
      assert.strictEqual(res.body.eventSummary.checkedIn, 0);
      assert.strictEqual(res.body.eventSummary.selected, 0);
      console.log('  [PASS] 4.2 GET /parents/:id safely returns not_registered when no current event (no 2026 fallback)');
    }

    // =========================================================================
    // VERIFICATION 5: Explicit Invalid Event ID returns 404
    // =========================================================================
    console.log('\n--- TEST GROUP 5: Explicit Invalid Event ID Handling ---');
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/overview?eventId=non-existent-event-999', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 404, `Expected 404 for non-existent event, got ${res.status}`);
      console.log('  [PASS] 5.1 GET /overview with non-existent eventId returns 404');
    }
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/parents/${parentPId}?eventId=non-existent-event-999`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 404, `Expected 404 for non-existent event, got ${res.status}`);
      console.log('  [PASS] 5.2 GET /parents/:id with non-existent eventId returns 404');
    }

    console.log('\n=== ALL PHASE 3D1B VERIFICATION TESTS PASSED SUCCESSFULLY ===');
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP: Always restore initial current event and remove test fixtures
    // -------------------------------------------------------------------------
    console.log('\n--- CLEANING UP TEST DATA ---');
    try {
      await setCurrentEvent(initialCurrentEventId);
      console.log(`Restored current event to: ${initialCurrentEventId}`);
    } catch (e: any) {
      console.error('Failed to restore initial current event:', e.message);
    }

    try {
      await execute('DELETE FROM child_event_entries WHERE id = ?', [entryAId]);
      await execute('DELETE FROM children WHERE id = ?', [childXId]);
      await execute('DELETE FROM parent_profiles WHERE id = ?', [parentPId]);
      await execute('DELETE FROM users WHERE id IN (?, ?)', [parentPUserId, adminUserId]);
      await execute('DELETE FROM events WHERE id IN (?, ?)', [eventAId, eventBId]);
      console.log('Test fixtures cleaned up successfully.');
    } catch (e: any) {
      console.error('Failed to clean up test fixtures:', e.message);
    }

    const finalCurrentId = await getCurrentEventId();
    assert.strictEqual(finalCurrentId, 'event-ga-2026', 'Final current event must be event-ga-2026');
    console.log(`Final verified current event: ${finalCurrentId}`);
  }
}

runTests().catch(err => {
  console.error('\nFatal error in Phase 3D1B verification:', err);
  process.exit(1);
});
