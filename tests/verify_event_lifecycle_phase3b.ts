import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execute, query, queryOne } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import { getCurrentEvent, getCurrentEventId, setCurrentEvent } from '../src/server/services/eventService';
import volunteerRouter from '../src/server/routes/volunteer';
import { dutyRouter } from '../src/server/routes/duty';

// Helper to simulate express request/response on an express router
function createMockReqRes(router: any, options: {
  method: string;
  url: string;
  token?: string;
  body?: any;
  params?: any;
  headers?: any;
  query?: any;
  baseUrl?: string;
}) {
  const headers = { ...(options.headers || {}) };
  if (options.token) {
    headers['authorization'] = `Bearer ${options.token}`;
  }

  const req: any = {
    method: options.method,
    url: options.url,
    originalUrl: `${options.baseUrl || '/api/volunteer'}${options.url}`,
    baseUrl: options.baseUrl || '/api/volunteer',
    path: options.url.split('?')[0],
    body: options.body || {},
    params: options.params || {},
    headers: headers,
    query: options.query || {}
  };

  let statusCode = 200;
  let responseData: any = null;
  let ended = false;

  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      responseData = data;
      ended = true;
      return res;
    },
    send(data: any) {
      responseData = data;
      ended = true;
      return res;
    }
  };

  const executeHandler = async (): Promise<{ status: number; body: any }> => {
    return new Promise((resolve, reject) => {
      router(req, res, (err: any) => {
        if (err) return reject(err);
        resolve({ status: statusCode, body: responseData });
      });
      const checkDone = setInterval(() => {
        if (ended) {
          clearInterval(checkDone);
          resolve({ status: statusCode, body: responseData });
        }
      }, 10);
      setTimeout(() => {
        clearInterval(checkDone);
        resolve({ status: statusCode, body: responseData });
      }, 4000);
    });
  };

  return { req, res, executeHandler };
}

async function runPhase3bTests() {
  console.log('=== STARTING EVENT LIFECYCLE PHASE 3B VERIFICATION ===\n');

  const ts = Date.now();
  const eventAId = `test-ga-a-${ts}`;
  const eventBId = `test-ga-b-${ts}`;
  const now = new Date().toISOString();

  // Save original current event
  const origCurrent = await queryOne<{ id: string }>("SELECT id FROM events WHERE status = 'current'");
  const originalCurrentId = origCurrent ? origCurrent.id : 'event-ga-2026';

  // Test identifiers
  const volUserId = `user-vol-${ts}`;
  const volProfileId = `vol-profile-${ts}`;

  const parentAUserId = `user-parent-a-${ts}`;
  const parentAProfileId = `parent-profile-a-${ts}`;
  const childAId = `child-a-${ts}`;
  const entryAId = `entry-a-${ts}`;
  const passAId = `pass-a-${ts}`;

  const parentBUserId = `user-parent-b-${ts}`;
  const parentBProfileId = `parent-profile-b-${ts}`;
  const childBId = `child-b-${ts}`;
  const entryBId = `entry-b-${ts}`;
  const passBId = `pass-b-${ts}`;

  const locationAId = `loc-a-${ts}`;
  const locationBId = `loc-b-${ts}`;

  let passedTests = 0;
  let totalTests = 0;

  async function testStep(name: string, fn: () => Promise<void>) {
    totalTests++;
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passedTests++;
    } catch (err: any) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${err.message}`);
      throw err;
    }
  }

  try {
    // ------------------------------------------------------------------------
    // SETUP: Insert isolated test events
    // ------------------------------------------------------------------------
    await execute(`
      INSERT INTO events (id, title, section_name, location, starts_at, ends_at, status, created_at, updated_at)
      VALUES (?, 'GA 2026 Test Alpha', 'Children', 'Auditorium A', '2026-08-01', '2026-08-03', 'upcoming', ?, ?)
    `, [eventAId, now, now]);

    await execute(`
      INSERT INTO events (id, title, section_name, location, starts_at, ends_at, status, created_at, updated_at)
      VALUES (?, 'GA 2027 Test Beta', 'Children', 'Auditorium B', '2027-08-01', '2027-08-03', 'upcoming', ?, ?)
    `, [eventBId, now, now]);

    // Locations for Event A and Event B
    await execute(`
      INSERT INTO event_locations (id, event_id, name, short_name, location_type, is_active, created_at, updated_at)
      VALUES (?, ?, 'Grace Hall A', 'Grace A', 'room', 1, ?, ?)
    `, [locationAId, eventAId, now, now]);

    await execute(`
      INSERT INTO event_locations (id, event_id, name, short_name, location_type, is_active, created_at, updated_at)
      VALUES (?, ?, 'Faith Hall B', 'Faith B', 'room', 1, ?, ?)
    `, [locationBId, eventBId, now, now]);

    // Volunteer (global identity)
    const volEmail = `vol.tester.${ts}@test.com`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 1, 'active', ?, ?)
    `, [volUserId, volEmail, now, now]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Volunteer Vicky', '08099999999', '08099999999', 'ushers', 'approved', ?, ?)
    `, [volProfileId, volUserId, now, now]);

    const volToken = generateToken(volUserId);

    // Setup Parent A & Child A (only in Event A)
    const parentAEmail = `parent.a.${ts}@test.com`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', 1, 'active', ?, ?)
    `, [parentAUserId, parentAEmail, now, now]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, email, created_at, updated_at)
      VALUES (?, ?, 'Parent Alpha', '08011111111', ?, ?, ?)
    `, [parentAProfileId, parentAUserId, parentAEmail, now, now]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child Alpha', 'female', '2020-01-01', 'Preschool', ?, ?)
    `, [childAId, parentAProfileId, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', ?, ?)
    `, [entryAId, eventAId, childAId, now, now]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, 'PASS-A-001', 'hash-a', 'active', ?, ?, ?)
    `, [passAId, entryAId, now, now, now]);

    // Setup Parent B & Child B (only in Event B)
    const parentBEmail = `parent.b.${ts}@test.com`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', 1, 'active', ?, ?)
    `, [parentBUserId, parentBEmail, now, now]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, email, created_at, updated_at)
      VALUES (?, ?, 'Parent Beta', '08022222222', ?, ?, ?)
    `, [parentBProfileId, parentBUserId, parentBEmail, now, now]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child Beta', 'male', '2019-05-05', 'Ages 4-6', ?, ?)
    `, [childBId, parentBProfileId, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', ?, ?)
    `, [entryBId, eventBId, childBId, now, now]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, 'PASS-B-002', 'hash-b', 'active', ?, ?, ?)
    `, [passBId, entryBId, now, now, now]);

    // Volunteer duty assignment in Event A to Location A
    const assignAId = `assign-a-${ts}`;
    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, responsibility_key, starts_at, ends_at, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'ushers', ?, ?, 'scheduled', ?, ?)
    `, [assignAId, eventAId, volUserId, locationAId, now, now, now, now]);

    // ------------------------------------------------------------------------
    // TEST SUITE
    // ------------------------------------------------------------------------

    // Test 1: Static Code Audit - volunteer.ts has 0 hardcoded events
    await testStep('volunteer.ts has ZERO occurrences of REAL_EVENT_ID', async () => {
      const volContent = fs.readFileSync(path.join(process.cwd(), 'src/server/routes/volunteer.ts'), 'utf8');
      assert.strictEqual(volContent.includes('REAL_EVENT_ID'), false, 'Found REAL_EVENT_ID in volunteer.ts');
    });

    await testStep('volunteer.ts has ZERO occurrences of event-ga-2026', async () => {
      const volContent = fs.readFileSync(path.join(process.cwd(), 'src/server/routes/volunteer.ts'), 'utf8');
      assert.strictEqual(volContent.includes('event-ga-2026'), false, 'Found event-ga-2026 in volunteer.ts');
    });

    // Test 2: Event A Current -> Volunteer Child Listing Isolation
    await testStep('Event A current -> Volunteer sees Child A and NOT Child B', async () => {
      await setCurrentEvent(eventAId);
      const curr = await getCurrentEvent();
      assert.strictEqual(curr?.id, eventAId);

      const { executeHandler } = createMockReqRes(volunteerRouter, {
        method: 'GET',
        url: '/children',
        token: volToken
      });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      const items = res.body.items || res.body.children || [];
      assert(Array.isArray(items), 'Expected items array');

      const childIds = items.map((c: any) => c.childId || c.child_id || c.id);
      assert(childIds.includes(childAId), 'Volunteer should see Child A in Event A');
      assert(!childIds.includes(childBId), 'Volunteer should NOT see Child B in Event A');
    });

    // Test 3: Event A Current -> Child Search Isolation
    await testStep('Event A current -> Search finds Child A, search Child B yields 0', async () => {
      // Search by Child A name
      const { executeHandler: searchA } = createMockReqRes(volunteerRouter, {
        method: 'GET',
        url: '/children/search?q=Alpha',
        query: { q: 'Alpha' },
        token: volToken
      });
      const resA = await searchA();
      assert.strictEqual(resA.status, 200);
      const namesA = (resA.body || []).map((c: any) => c.childName || c.full_name);
      assert(namesA.some((n: string) => n && n.includes('Alpha')), 'Child Alpha should appear in Event A search');

      // Search by Child B name
      const { executeHandler: searchB } = createMockReqRes(volunteerRouter, {
        method: 'GET',
        url: '/children/search?q=Beta',
        query: { q: 'Beta' },
        token: volToken
      });
      const resB = await searchB();
      assert.strictEqual(resB.status, 200);
      const namesB = (resB.body || []).map((c: any) => c.childName || c.full_name);
      assert(!namesB.some((n: string) => n && n.includes('Beta')), 'Child Beta MUST NOT appear in Event A search');

      // Search by Parent B phone
      const { executeHandler: searchPhoneB } = createMockReqRes(volunteerRouter, {
        method: 'GET',
        url: '/children/search?q=08022222222',
        query: { q: '08022222222' },
        token: volToken
      });
      const resPhoneB = await searchPhoneB();
      assert.strictEqual(resPhoneB.status, 200);
      assert.strictEqual((resPhoneB.body || []).length, 0, 'Parent B phone search must return 0 in Event A');
    });

    // Test 4: Event A Current -> Child Details (/children/:childId)
    await testStep('Event A current -> /children/:id access isolated to Event A child', async () => {
      // Access Child A
      const { executeHandler: getA } = createMockReqRes(volunteerRouter, {
        method: 'GET',
        url: `/children/${childAId}`,
        params: { childId: childAId },
        token: volToken
      });
      const resA = await getA();
      assert.strictEqual(resA.status, 200);
      assert(resA.body.success, 'Expected success accessing Child A in Event A');

      // Access Child B (registered in Event B only)
      const { executeHandler: getB } = createMockReqRes(volunteerRouter, {
        method: 'GET',
        url: `/children/${childBId}`,
        params: { childId: childBId },
        token: volToken
      });
      const resB = await getB();
      assert.strictEqual(resB.status, 404, 'Child B must return 404 in Event A');
    });

    // Test 5: Switch Current Event to Event B -> Isolation Inversion
    await testStep('Switch to Event B -> Volunteer sees Child B and NOT Child A', async () => {
      await setCurrentEvent(eventBId);
      const curr = await getCurrentEvent();
      assert.strictEqual(curr?.id, eventBId);

      const { executeHandler } = createMockReqRes(volunteerRouter, {
        method: 'GET',
        url: '/children',
        token: volToken
      });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);

      const items = res.body.items || res.body.children || [];
      const childIds = items.map((c: any) => c.childId || c.child_id || c.id);
      assert(childIds.includes(childBId), 'Volunteer should see Child B in Event B');
      assert(!childIds.includes(childAId), 'Volunteer must NOT see Child A in Event B');
    });

    // Test 6: Event B Current -> Search Isolation Inversion
    await testStep('Event B current -> Search finds Child B, Child A is hidden', async () => {
      const { executeHandler: searchA } = createMockReqRes(volunteerRouter, {
        method: 'GET',
        url: '/children/search?q=Alpha',
        query: { q: 'Alpha' },
        token: volToken
      });
      const resA = await searchA();
      assert.strictEqual(resA.status, 200);
      const namesA = (resA.body || []).map((c: any) => c.childName || c.full_name);
      assert(!namesA.some((n: string) => n && n.includes('Alpha')), 'Child Alpha MUST NOT appear in Event B search');

      const { executeHandler: searchB } = createMockReqRes(volunteerRouter, {
        method: 'GET',
        url: '/children/search?q=Beta',
        query: { q: 'Beta' },
        token: volToken
      });
      const resB = await searchB();
      assert.strictEqual(resB.status, 200);
      const namesB = (resB.body || []).map((c: any) => c.childName || c.full_name);
      assert(namesB.some((n: string) => n && n.includes('Beta')), 'Child Beta should appear in Event B search');
    });

    // Test 7: Event B Current -> Check-in Isolation
    await testStep('Event B current -> Reject Child A check-in, Accept Child B check-in', async () => {
      // Try checking in Child A (registered for Event A only)
      const { executeHandler: checkInA } = createMockReqRes(volunteerRouter, {
        method: 'POST',
        url: '/check-in',
        body: {
          childEventEntryId: entryAId,
          ageConfirmationAcknowledged: true
        },
        token: volToken
      });
      const resA = await checkInA();
      assert(resA.status === 400 || resA.status === 404, `Child A check-in must be rejected when Event B is current. Status: ${resA.status}`);

      // Check in Child B
      const { executeHandler: checkInB } = createMockReqRes(volunteerRouter, {
        method: 'POST',
        url: '/check-in',
        body: {
          childEventEntryId: entryBId,
          ageConfirmationAcknowledged: true
        },
        token: volToken
      });
      const resB = await checkInB();
      assert.strictEqual(resB.status, 200, `Child B check-in should succeed. Error: ${JSON.stringify(resB.body)}`);

      // Verify check-in updated child_event_entries under current event B
      const entryRecord = await queryOne<{ event_id: string; status: string }>(
        'SELECT event_id, status FROM child_event_entries WHERE id = ?',
        [entryBId]
      );
      assert.strictEqual(entryRecord?.event_id, eventBId, 'Entry record must be associated with current Event B');
      assert.strictEqual(entryRecord?.status, 'checked_in', 'Entry status must be checked_in');
    });

    // Test 8: Event Duty Isolation - Assignments & Location Scoping
    await testStep('Event Duty Scoping -> Volunteer assignment in Event A is hidden in Event B', async () => {
      // Event B is current. Volunteer has an assignment in Event A, but none in Event B.
      const { executeHandler: getAssign } = createMockReqRes(dutyRouter, {
        method: 'GET',
        url: '/current-assignment',
        baseUrl: '/api/duty',
        token: volToken
      });
      const res = await getAssign();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.assignment, null, 'Volunteer should have NO assignment in Event B (Event A assignment does not leak)');

      // Location resolution in Event B should be null (Grace Hall A is Event A)
      const { executeHandler: getLoc } = createMockReqRes(dutyRouter, {
        method: 'GET',
        url: '/current-location',
        baseUrl: '/api/duty',
        token: volToken
      });
      const locRes = await getLoc();
      assert.strictEqual(locRes.status, 200);
      assert.strictEqual(locRes.body.presence, null, 'Volunteer should have NO duty location in Event B');
    });

    // Test 9: Event Duty - Adding Assignment in Event B shows only Event B assignment
    await testStep('Event Duty -> Assignment in Event B displays correctly', async () => {
      const assignBId = `assign-b-${ts}`;
      await execute(`
        INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, responsibility_key, starts_at, ends_at, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'ushers', ?, ?, 'scheduled', ?, ?)
      `, [assignBId, eventBId, volUserId, locationBId, now, now, now, now]);

      const { executeHandler: getAssign } = createMockReqRes(dutyRouter, {
        method: 'GET',
        url: '/current-assignment',
        baseUrl: '/api/duty',
        token: volToken
      });
      const res = await getAssign();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.assignment?.id, assignBId, 'Volunteer should see Event B assignment');
      assert.strictEqual(res.body.assignment?.assigned_location_id, locationBId, 'Assignment location must be Location B');
    });

    // Test 10: Care Alert Scoping - Safety Alerts use current event
    await testStep('Safety Alert Scoping -> Alert uses Event B and rejects linking Child A', async () => {
      // Attempt to raise alert with Child A (registered in Event A only)
      const { executeHandler: createAlertA } = createMockReqRes(volunteerRouter, {
        method: 'POST',
        url: '/safety-alerts',
        body: {
          childId: childAId,
          category: 'child_care',
          severity: 'important',
          structuredDetails: { specific_needs: 'Restroom assistance' },
          locationLabel: 'Faith Hall B',
          message: 'Test care issue'
        },
        token: volToken
      });
      const resA = await createAlertA();
      assert.strictEqual(resA.status, 400, 'Raising safety alert linking Child A in Event B must be rejected');

      // Raise alert with Child B
      const { executeHandler: createAlertB } = createMockReqRes(volunteerRouter, {
        method: 'POST',
        url: '/safety-alerts',
        body: {
          childId: childBId,
          category: 'child_care',
          severity: 'important',
          structuredDetails: { specific_needs: 'Restroom assistance' },
          locationLabel: 'Faith Hall B',
          message: 'Test care issue for Child B'
        },
        token: volToken
      });
      const resB = await createAlertB();
      assert.strictEqual(resB.status, 200, `Alert for Child B should succeed. Error: ${JSON.stringify(resB.body)}`);
      assert(resB.body.alertId, 'Alert ID should be returned');

      // Verify alert in DB belongs to Event B
      const alertRow = await queryOne<{ event_id: string }>(
        'SELECT event_id FROM event_safety_alerts WHERE id = ?',
        [resB.body.alertId]
      );
      assert.strictEqual(alertRow?.event_id, eventBId, 'Safety alert must be stored with event_id = Event B');
    });

    // Test 11: No Current Event Handled Safely
    await testStep('No Current Event -> Handled safely without 500 or fallback', async () => {
      // Set all test events to upcoming (temporarily deactivate all current)
      await execute("UPDATE events SET status = 'upcoming' WHERE status = 'current'");

      const noCurrent = await getCurrentEvent();
      assert.strictEqual(noCurrent, null, 'Verified no event is current');

      // /children should return safe empty list or safe response
      const { executeHandler: getChildren } = createMockReqRes(volunteerRouter, {
        method: 'GET',
        url: '/children',
        token: volToken
      });
      const resChildren = await getChildren();
      assert(resChildren.status === 200 || resChildren.status === 400, `Expected 200 or 400, got ${resChildren.status}`);
      if (resChildren.status === 200) {
        const items = resChildren.body.items || resChildren.body.children || [];
        assert.deepStrictEqual(items, [], 'Should return empty children array when no event is current');
      }

      // /current-assignment should return assignment: null
      const { executeHandler: getAssign } = createMockReqRes(dutyRouter, {
        method: 'GET',
        url: '/current-assignment',
        baseUrl: '/api/duty',
        token: volToken
      });
      const resAssign = await getAssign();
      assert.strictEqual(resAssign.status, 200);
      assert.strictEqual(resAssign.body.assignment, null, 'Assignment must be null when no event is current');
    });

  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP: Always restore original current event and remove test records
    // ------------------------------------------------------------------------
    console.log('\n--- CLEANING UP TEST DATA ---');
    try {
      await setCurrentEvent(originalCurrentId);
      console.log(`Restored original current event: ${originalCurrentId}`);
    } catch (e: any) {
      console.error('Failed to restore original current event:', e.message);
    }

    try {
      await execute('DELETE FROM attendance_records WHERE child_event_entry_id IN (?, ?)', [entryAId, entryBId]);
      await execute('DELETE FROM event_safety_alerts WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM notifications WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM event_duty_assignments WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM event_duty_location_presence WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM event_duty_devices WHERE user_id = ?', [volUserId]);
      await execute('DELETE FROM event_passes WHERE child_event_entry_id IN (?, ?)', [entryAId, entryBId]);
      await execute('DELETE FROM child_event_entries WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM children WHERE id IN (?, ?)', [childAId, childBId]);
      await execute('DELETE FROM parent_profiles WHERE id IN (?, ?)', [parentAProfileId, parentBProfileId]);
      await execute('DELETE FROM volunteer_profiles WHERE id = ?', [volProfileId]);
      await execute('DELETE FROM user_duty_status WHERE user_id = ?', [volUserId]);
      await execute('DELETE FROM users WHERE id IN (?, ?, ?)', [volUserId, parentAUserId, parentBUserId]);
      await execute('DELETE FROM event_locations WHERE id IN (?, ?)', [locationAId, locationBId]);
      await execute('DELETE FROM events WHERE id IN (?, ?)', [eventAId, eventBId]);
      console.log('Cleanup completed successfully.');
    } catch (cleanErr: any) {
      console.error('Error during cleanup:', cleanErr.message);
    }
  }

  console.log(`\n=== PHASE 3B VERIFICATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase3bTests().catch((err) => {
  console.error('Fatal error in Phase 3B verification:', err);
  process.exit(1);
});
