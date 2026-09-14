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
  console.log('=== PHASE 3D1D VERIFICATION: ADMIN REPORTS ROUTES ONLY ===\n');

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
  const eventAId = `test-evt-3d1d-a-${crypto.randomUUID().slice(0, 8)}`;
  const eventBId = `test-evt-3d1d-b-${crypto.randomUUID().slice(0, 8)}`;

  // Parents
  const parentAUserId = `user-a-${crypto.randomUUID()}`;
  const parentBUserId = `user-b-${crypto.randomUUID()}`;
  const parentAId = `parent-a-${crypto.randomUUID().slice(0, 8)}`;
  const parentBId = `parent-b-${crypto.randomUUID().slice(0, 8)}`;

  // Children
  const childA1Id = `child-a1-${crypto.randomUUID().slice(0, 8)}`;
  const childA2Id = `child-a2-${crypto.randomUUID().slice(0, 8)}`;
  const childB1Id = `child-b1-${crypto.randomUUID().slice(0, 8)}`;
  const childB2Id = `child-b2-${crypto.randomUUID().slice(0, 8)}`;

  // Entries
  const entryA1Id = `entry-a1-${crypto.randomUUID().slice(0, 8)}`;
  const entryA2Id = `entry-a2-${crypto.randomUUID().slice(0, 8)}`;
  const entryB1Id = `entry-b1-${crypto.randomUUID().slice(0, 8)}`;
  const entryB2Id = `entry-b2-${crypto.randomUUID().slice(0, 8)}`;

  // Pickup person
  const pickupA1Id = `pickup-a1-${crypto.randomUUID().slice(0, 8)}`;

  try {
    // -------------------------------------------------------------------------
    // 1. SETUP TEST FIXTURES: Event A & Event B
    // -------------------------------------------------------------------------
    console.log('1. Setting up test fixtures for Event A & Event B...');

    await execute(`
      INSERT INTO events (id, title, section_name, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Event A Summit', 'Kids Track A', 'archived', '2026-05-10', '2026-05-12', ?, ?)
    `, [eventAId, nowStr, nowStr]);

    await execute(`
      INSERT INTO events (id, title, section_name, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Event B Conference', 'Youth Track B', 'archived', '2026-08-20', '2026-08-22', ?, ?)
    `, [eventBId, nowStr, nowStr]);

    // Parent A & B Users and Profiles
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES (?, 'parent-a@test.internal', 'hash', 'parent', 1, ?, ?),
             (?, 'parent-b@test.internal', 'hash', 'parent', 1, ?, ?)
    `, [parentAUserId, nowStr, nowStr, parentBUserId, nowStr, nowStr]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, email, created_at, updated_at)
      VALUES (?, ?, 'Parent A Alpha', '+2348011111111', 'parent-a@test.internal', ?, ?),
             (?, ?, 'Parent B Beta', '+2348022222222', 'parent-b@test.internal', ?, ?)
    `, [parentAId, parentAUserId, nowStr, nowStr, parentBId, parentBUserId, nowStr, nowStr]);

    // Children A1 (Age 5, Boy), A2 (Age 8, Girl)
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, calculated_age, age_group, gender, created_at, updated_at)
      VALUES (?, ?, 'Child A1 Alpha', '2021-05-10', 5, 'Ages 4 to 6', 'male', ?, ?),
             (?, ?, 'Child A2 Alpha', '2018-03-15', 8, 'Ages 7 to 9', 'female', ?, ?)
    `, [childA1Id, parentAId, nowStr, nowStr, childA2Id, parentAId, nowStr, nowStr]);

    // Children B1 (Age 2, Boy), B2 (Age 11, Girl)
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, calculated_age, age_group, gender, created_at, updated_at)
      VALUES (?, ?, 'Child B1 Beta', '2024-02-14', 2, 'Ages 1 to 3', 'male', ?, ?),
             (?, ?, 'Child B2 Beta', '2015-09-20', 11, 'Ages 10 to 12', 'female', ?, ?)
    `, [childB1Id, parentBId, nowStr, nowStr, childB2Id, parentBId, nowStr, nowStr]);

    // Entries for Event A:
    // A1: status = 'checked_in', has_medical_notes = 1 ('Asthma Inhaler Required')
    // A2: status = 'selected', absent
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, has_medical_notes, medical_notes, checked_in_at, created_at, updated_at)
      VALUES (?, ?, ?, 'checked_in', 1, 'Asthma Inhaler Required', ?, ?, ?),
             (?, ?, ?, 'selected', 0, NULL, NULL, ?, ?)
    `, [entryA1Id, childA1Id, eventAId, nowStr, nowStr, nowStr, entryA2Id, childA2Id, eventAId, nowStr, nowStr]);

    // Pickup person for A1
    await execute(`
      INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, phone_number, relationship_to_child, photo_file_id, approved_by_parent, created_at, updated_at)
      VALUES (?, ?, 'guardian', 'Pickup Guardian A', '+2348099999999', 'Uncle', 'photo_a1.jpg', 1, ?, ?)
    `, [pickupA1Id, entryA1Id, nowStr, nowStr]);

    // Entries for Event B:
    // B1: status = 'picked_up', needs_extra_support = 1 ('Speech Support')
    // B2: status = 'under_review'
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, needs_extra_support, support_notes, checked_in_at, picked_up_at, created_at, updated_at)
      VALUES (?, ?, ?, 'picked_up', 1, 'Speech Support Required', ?, ?, ?, ?),
             (?, ?, ?, 'under_review', 0, NULL, NULL, NULL, ?, ?)
    `, [entryB1Id, childB1Id, eventBId, nowStr, nowStr, nowStr, nowStr, entryB2Id, childB2Id, eventBId, nowStr, nowStr]);

    console.log('  [PASS] Test fixtures created successfully.');

    // -------------------------------------------------------------------------
    // 2. VERIFY EVENT A AS CURRENT
    // -------------------------------------------------------------------------
    console.log('\n2. Testing with Event A as CURRENT event...');
    await setCurrentEvent(eventAId);
    assert.strictEqual(await getCurrentEventId(), eventAId);

    // 2.1 GET /reports (default: end_of_event)
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/reports', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200, `GET /reports status should be 200, got ${res.status}`);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.event.id, eventAId);
      assert.strictEqual(res.body.event.name, 'Event A Summit');
      assert.strictEqual(res.body.metrics.totalRegistered, 2, 'Event A totalRegistered must be 2');
      assert.strictEqual(res.body.metrics.selected, 2, 'Event A selected must be 2 (selected + checked_in)');
      assert.strictEqual(res.body.metrics.checkedIn, 1, 'Event A checkedIn must be 1');
      assert.strictEqual(res.body.metrics.absent, 1, 'Event A absent must be 1');
      assert.strictEqual(res.body.metrics.pickedUp, 0, 'Event A pickedUp must be 0');
      assert.strictEqual(res.body.metrics.needsAttention, 1, 'Event A needsAttention must be 1 (A1 medical)');
      console.log('  [PASS] 2.1 GET /reports returns Event A data when A is current');
    }

    // 2.2 GET /reports/export (type=attendance)
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/reports/export?type=attendance', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert(typeof res.body === 'string');
      assert(res.body.includes('Child A1 Alpha'), 'Export must include Child A1 Alpha');
      assert(res.body.includes('Child A2 Alpha'), 'Export must include Child A2 Alpha');
      assert(!res.body.includes('Child B1 Beta'), 'Export must NOT leak Child B1 Beta');
      assert(!res.body.includes('Child B2 Beta'), 'Export must NOT leak Child B2 Beta');
      console.log('  [PASS] 2.2 GET /reports/export (attendance) returns Event A records only');
    }

    // 2.3 GET /reports/export (type=care_notes)
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/reports/export?type=care_notes', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert(res.body.includes('Asthma Inhaler Required'), 'Export must include Event A care notes');
      assert(!res.body.includes('Speech Support Required'), 'Export must NOT leak Event B care notes');
      console.log('  [PASS] 2.3 GET /reports/export (care_notes) returns Event A care notes only');
    }

    // 2.4 GET /reports/demographics
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/reports/demographics', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.eventId, eventAId);
      assert.strictEqual(res.body.summary.totalChildren, 2, 'Event A totalChildren in demographics must be 2');
      assert.strictEqual(res.body.summary.totalCheckedIn, 1, 'Event A totalCheckedIn in demographics must be 1');
      assert.strictEqual(res.body.summary.totalUnderReview, 0, 'Event A totalUnderReview in demographics must be 0');
      console.log('  [PASS] 2.4 GET /reports/demographics returns Event A demographics when A is current');
    }

    // -------------------------------------------------------------------------
    // 3. VERIFY EVENT B AS CURRENT
    // -------------------------------------------------------------------------
    console.log('\n3. Testing with Event B as CURRENT event...');
    await setCurrentEvent(eventBId);
    assert.strictEqual(await getCurrentEventId(), eventBId);

    // 3.1 GET /reports (default: end_of_event)
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/reports', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.event.id, eventBId);
      assert.strictEqual(res.body.event.name, 'Event B Conference');
      assert.strictEqual(res.body.metrics.totalRegistered, 2, 'Event B totalRegistered must be 2');
      assert.strictEqual(res.body.metrics.selected, 1, 'Event B selected must be 1 (B1 is picked_up)');
      assert.strictEqual(res.body.metrics.checkedIn, 1, 'Event B checkedIn must be 1 (B1 was checked in and picked up)');
      assert.strictEqual(res.body.metrics.pickedUp, 1, 'Event B pickedUp must be 1');
      assert.strictEqual(res.body.metrics.absent, 0, 'Event B absent must be 0');
      assert.strictEqual(res.body.metrics.needsAttention, 1, 'Event B needsAttention must be 1 (B1 support note)');
      console.log('  [PASS] 3.1 GET /reports returns Event B data when B is current');
    }

    // 3.2 GET /reports/export (type=attendance)
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/reports/export?type=attendance', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert(res.body.includes('Child B1 Beta'), 'Export must include Child B1 Beta');
      assert(!res.body.includes('Child A1 Alpha'), 'Export must NOT leak Child A1 Alpha');
      assert(!res.body.includes('Child A2 Alpha'), 'Export must NOT leak Child A2 Alpha');
      console.log('  [PASS] 3.2 GET /reports/export (attendance) returns Event B records only');
    }

    // 3.3 GET /reports/export (type=care_notes)
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/reports/export?type=care_notes', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert(res.body.includes('Speech Support Required'), 'Export must include Event B care notes');
      assert(!res.body.includes('Asthma Inhaler Required'), 'Export must NOT leak Event A care notes');
      console.log('  [PASS] 3.3 GET /reports/export (care_notes) returns Event B care notes only');
    }

    // 3.4 GET /reports/demographics
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/reports/demographics', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.eventId, eventBId);
      assert.strictEqual(res.body.summary.totalChildren, 2, 'Event B totalChildren in demographics must be 2');
      assert.strictEqual(res.body.summary.totalUnderReview, 1, 'Event B totalUnderReview in demographics must be 1');
      console.log('  [PASS] 3.4 GET /reports/demographics returns Event B demographics when B is current');
    }

    // -------------------------------------------------------------------------
    // 4. VERIFY HISTORICAL QUERY (?eventId=Event A) WHILE EVENT B IS CURRENT
    // -------------------------------------------------------------------------
    console.log('\n4. Testing historical queries for Event A while Event B remains current...');

    // 4.1 GET /reports?eventId=eventAId
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/reports?eventId=${eventAId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.event.id, eventAId);
      assert.strictEqual(res.body.metrics.totalRegistered, 2);
      assert.strictEqual(res.body.metrics.checkedIn, 1);
      assert.strictEqual(res.body.metrics.pickedUp, 0);
      console.log('  [PASS] 4.1 GET /reports?eventId=A returns historical Event A data');
    }

    // 4.2 GET /reports/export?eventId=eventAId&type=attendance
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/reports/export?eventId=${eventAId}&type=attendance`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert(res.body.includes('Child A1 Alpha'));
      assert(res.body.includes('Child A2 Alpha'));
      assert(!res.body.includes('Child B1 Beta'));
      console.log('  [PASS] 4.2 GET /reports/export?eventId=A returns historical Event A attendance');
    }

    // 4.3 GET /reports/export?eventId=eventAId&type=care_notes
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/reports/export?eventId=${eventAId}&type=care_notes`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert(res.body.includes('Asthma Inhaler Required'));
      assert(!res.body.includes('Speech Support Required'));
      console.log('  [PASS] 4.3 GET /reports/export?eventId=A returns historical Event A care notes');
    }

    // 4.4 GET /reports/demographics?eventId=eventAId
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/reports/demographics?eventId=${eventAId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.eventId, eventAId);
      assert.strictEqual(res.body.summary.totalChildren, 2);
      assert.strictEqual(res.body.summary.totalUnderReview, 0);
      console.log('  [PASS] 4.4 GET /reports/demographics?eventId=A returns historical Event A demographics');
    }

    // 4.5 Confirm current event remains Event B
    const currentAfterHistorical = await getCurrentEventId();
    assert.strictEqual(currentAfterHistorical, eventBId, 'Current event must remain Event B after querying Event A');
    console.log(`  [PASS] 4.5 Current event remained Event B (${currentAfterHistorical}) throughout historical queries`);

    // -------------------------------------------------------------------------
    // 5. VERIFY INVALID EXPLICIT EVENT ID RETURNS 404
    // -------------------------------------------------------------------------
    console.log('\n5. Testing invalid explicit event ID (404)...');
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/reports?eventId=non-existent-event-xyz', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 404);
      console.log('  [PASS] 5.1 GET /reports?eventId=invalid returns 404');
    }
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/reports/export?eventId=non-existent-event-xyz', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 404);
      console.log('  [PASS] 5.2 GET /reports/export?eventId=invalid returns 404');
    }
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/reports/demographics?eventId=non-existent-event-xyz', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 404);
      console.log('  [PASS] 5.3 GET /reports/demographics?eventId=invalid returns 404');
    }

    // -------------------------------------------------------------------------
    // 6. VERIFY NO-CURRENT-EVENT BEHAVIOR (NO 2026 FALLBACK)
    // -------------------------------------------------------------------------
    console.log('\n6. Testing no-current-event handling (no 2026 fallback)...');
    // Set all events to 'archived' temporarily
    await execute("UPDATE events SET status = 'archived' WHERE status = 'current'");
    const noCurrentId = await getCurrentEventId();
    assert.strictEqual(noCurrentId, null, 'Current event must be null');

    // 6.1 GET /reports without eventId and no current event -> safe response (404 error, no fallback)
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/reports', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 404, `Expected 404 when no current event, got ${res.status}`);
      assert.strictEqual(res.body.error, 'No active or specified event found for reports.');
      console.log('  [PASS] 6.1 GET /reports safely returns 404 when no current event exists');
    }

    // 6.2 GET /reports/export without eventId and no current event -> safe response (404 error, no fallback)
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/reports/export', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 404, `Expected 404 when no current event, got ${res.status}`);
      assert.strictEqual(res.body.error, 'No active or specified event found for export.');
      console.log('  [PASS] 6.2 GET /reports/export safely returns 404 when no current event exists');
    }

    // 6.3 GET /reports/demographics without eventId and no current event -> safe empty structure
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/reports/demographics', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200, `Expected 200 safe empty response for demographics, got ${res.status}`);
      assert.strictEqual(res.body.eventId, null);
      assert.strictEqual(res.body.summary.totalChildren, 0);
      assert.deepStrictEqual(res.body.groups, []);
      console.log('  [PASS] 6.3 GET /reports/demographics safely returns empty summary when no current event exists');
    }

    console.log('\n=== ALL PHASE 3D1D VERIFICATION TESTS PASSED SUCCESSFULLY ===');
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP: Restore initial current event and delete test data
    // -------------------------------------------------------------------------
    console.log('\n--- CLEANING UP TEST DATA ---');
    try {
      await setCurrentEvent(initialCurrentEventId);
      console.log(`Restored current event to: ${initialCurrentEventId}`);
    } catch (e: any) {
      console.error('Failed to restore initial current event:', e.message);
    }

    try {
      await execute('DELETE FROM pickup_people WHERE id = ?', [pickupA1Id]);
      await execute('DELETE FROM child_event_entries WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM children WHERE id IN (?, ?, ?, ?)', [childA1Id, childA2Id, childB1Id, childB2Id]);
      await execute('DELETE FROM parent_profiles WHERE id IN (?, ?)', [parentAId, parentBId]);
      await execute('DELETE FROM users WHERE id IN (?, ?, ?)', [parentAUserId, parentBUserId, adminUserId]);
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
  console.error('\nFatal error in Phase 3D1D verification:', err);
  process.exit(1);
});
