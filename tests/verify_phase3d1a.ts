import assert from 'assert';
import crypto from 'crypto';
import { execute, query, queryOne } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import { setCurrentEvent, getCurrentEventId, getEventById } from '../src/server/services/eventService';
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
  console.log('=== PHASE 3D1A VERIFICATION: ADMIN APPLICATIONS, CHILDREN & ATTENDANCE ===\n');

  const initialCurrentEventId = await getCurrentEventId();
  console.log(`Initial current event: ${initialCurrentEventId}`);
  assert(initialCurrentEventId, 'A current event must initially exist');

  const adminUserId = `test-admin-${crypto.randomUUID()}`;
  const nowStr = new Date().toISOString();

  // Create mock admin user in DB
  await execute(`
    INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
    VALUES (?, ?, 'dummyhash', 'admin', 1, ?, ?)
  `, [adminUserId, `admin-${crypto.randomUUID()}@test.internal`, nowStr, nowStr]);

  const adminToken = generateToken(adminUserId);

  // Define unique IDs for Event A & Event B
  const eventAId = `test-evt-3d1a-a-${crypto.randomUUID().slice(0, 8)}`;
  const eventBId = `test-evt-3d1a-b-${crypto.randomUUID().slice(0, 8)}`;

  const parentAId = `parent-a-${crypto.randomUUID().slice(0, 8)}`;
  const parentBId = `parent-b-${crypto.randomUUID().slice(0, 8)}`;

  const childAId = `child-a-${crypto.randomUUID().slice(0, 8)}`;
  const childBId = `child-b-${crypto.randomUUID().slice(0, 8)}`;

  const entryAId = `entry-a-${crypto.randomUUID().slice(0, 8)}`;
  const entryBId = `entry-b-${crypto.randomUUID().slice(0, 8)}`;

  let createdChildIds: string[] = [];

  try {
    // 1. Create Event A and Event B
    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Test Event A 3D1A', 'upcoming', '2027-01-01T10:00:00Z', '2027-01-01T18:00:00Z', ?, ?)
    `, [eventAId, nowStr, nowStr]);

    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Test Event B 3D1A', 'upcoming', '2027-02-01T10:00:00Z', '2027-02-01T18:00:00Z', ?, ?)
    `, [eventBId, nowStr, nowStr]);

    // 2. Create Parent A and Parent B
    const parentAUserId = `user-a-${crypto.randomUUID()}`;
    const parentBUserId = `user-b-${crypto.randomUUID()}`;

    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES (?, 'alpha3d1a@test.internal', 'dummyhash', 'parent', 1, ?, ?)
    `, [parentAUserId, nowStr, nowStr]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES (?, 'beta3d1a@test.internal', 'dummyhash', 'parent', 1, ?, ?)
    `, [parentBUserId, nowStr, nowStr]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Parent Alpha 3D1A', 'alpha3d1a@test.internal', '+2348000000001', ?, ?)
    `, [parentAId, parentAUserId, nowStr, nowStr]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Parent Beta 3D1A', 'beta3d1a@test.internal', '+2348000000002', ?, ?)
    `, [parentBId, parentBUserId, nowStr, nowStr]);

    // 3. Create Child A (Event A) and Child B (Event B)
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child Alpha', '2019-03-15', 'female', 'Ages 4-6', ?, ?)
    `, [childAId, parentAId, nowStr, nowStr]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child Beta', '2016-08-20', 'male', 'Ages 7-9', ?, ?)
    `, [childBId, parentBId, nowStr, nowStr]);

    // 4. Create child_event_entries
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?, ?)
    `, [entryAId, childAId, eventAId, nowStr, nowStr, nowStr]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?, ?)
    `, [entryBId, childBId, eventBId, nowStr, nowStr, nowStr]);

    console.log('Test fixtures seeded successfully.\n');

    // =========================================================================
    // VERIFICATION 1: Event A Current
    // =========================================================================
    console.log('--- TEST GROUP 1: Event A is Current ---');
    await setCurrentEvent(eventAId);
    assert.strictEqual(await getCurrentEventId(), eventAId, 'Event A must be set to current');

    // 1.1 GET /applications returns A only
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/applications', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200, `applications status ${res.status}`);
      assert(res.body.success === true, 'applications success must be true');
      const apps: any[] = res.body.applications || [];
      const hasA = apps.some((a: any) => a.id === entryAId || a.childId === childAId);
      const hasB = apps.some((a: any) => a.id === entryBId || a.childId === childBId);
      assert(hasA, 'GET /applications must contain Event A entry when Event A is current');
      assert(!hasB, 'GET /applications must NOT contain Event B entry when Event A is current');
      console.log('✓ A current: applications returns A only');
    }

    // 1.2 GET /children returns A event state only
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/children', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200, `children status ${res.status}`);
      assert(res.body.success === true, 'children success must be true');
      const kids: any[] = res.body.children || [];
      const hasA = kids.some((c: any) => c.childId === childAId);
      const hasB = kids.some((c: any) => c.childId === childBId);
      assert(hasA, 'GET /children must contain Child A when Event A is current');
      assert(!hasB, 'GET /children must NOT contain Child B when Event A is current');
      console.log('✓ A current: children returns A event state only');
    }

    // 1.3 GET /attendance returns A only
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/attendance', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200, `attendance status ${res.status}`);
      const rows: any[] = res.body.rows || [];
      const hasA = rows.some((r: any) => r.childId === childAId);
      const hasB = rows.some((r: any) => r.childId === childBId);
      assert(hasA, 'GET /attendance must contain Child A when Event A is current');
      assert(!hasB, 'GET /attendance must NOT contain Child B when Event A is current');
      console.log('✓ A current: attendance returns A only');
    }

    // =========================================================================
    // VERIFICATION 2: Event B Current
    // =========================================================================
    console.log('\n--- TEST GROUP 2: Event B is Current ---');
    await setCurrentEvent(eventBId);
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Event B must be set to current');

    // 2.1 GET /applications returns B only
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/applications', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert(res.body.success === true);
      const apps: any[] = res.body.applications || [];
      const hasA = apps.some((a: any) => a.id === entryAId || a.childId === childAId);
      const hasB = apps.some((a: any) => a.id === entryBId || a.childId === childBId);
      assert(!hasA, 'GET /applications must NOT contain Event A entry when Event B is current');
      assert(hasB, 'GET /applications must contain Event B entry when Event B is current');
      console.log('✓ B current: applications returns B only');
    }

    // 2.2 GET /children returns B event state only
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/children', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert(res.body.success === true);
      const kids: any[] = res.body.children || [];
      const hasA = kids.some((c: any) => c.childId === childAId);
      const hasB = kids.some((c: any) => c.childId === childBId);
      assert(!hasA, 'GET /children must NOT contain Child A when Event B is current');
      assert(hasB, 'GET /children must contain Child B when Event B is current');
      console.log('✓ B current: children returns B event state only');
    }

    // 2.3 GET /attendance returns B only
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/attendance', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      const rows: any[] = res.body.rows || [];
      const hasA = rows.some((r: any) => r.childId === childAId);
      const hasB = rows.some((r: any) => r.childId === childBId);
      assert(!hasA, 'GET /attendance must NOT contain Child A when Event B is current');
      assert(hasB, 'GET /attendance must contain Child B when Event B is current');
      console.log('✓ B current: attendance returns B only');
    }

    // =========================================================================
    // VERIFICATION 3: While B current, explicit ?eventId=A returns A data
    // and DOES NOT change current event
    // =========================================================================
    console.log('\n--- TEST GROUP 3: Explicit ?eventId=A while B is current ---');

    // 3.1 GET /applications?eventId=A
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/applications?eventId=${eventAId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert(res.body.success === true);
      const apps: any[] = res.body.applications || [];
      const hasA = apps.some((a: any) => a.id === entryAId || a.childId === childAId);
      const hasB = apps.some((a: any) => a.id === entryBId || a.childId === childBId);
      assert(hasA, 'GET /applications?eventId=A must return Event A applications');
      assert(!hasB, 'GET /applications?eventId=A must NOT return Event B applications');
      assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must remain B after explicit query');
      console.log('✓ ?eventId=A on applications returns A only and does not change current event');
    }

    // 3.2 GET /children?eventId=A
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/children?eventId=${eventAId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert(res.body.success === true);
      const kids: any[] = res.body.children || [];
      const hasA = kids.some((c: any) => c.childId === childAId);
      const hasB = kids.some((c: any) => c.childId === childBId);
      assert(hasA, 'GET /children?eventId=A must return Child A');
      assert(!hasB, 'GET /children?eventId=A must NOT return Child B');
      assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must remain B after explicit query');
      console.log('✓ ?eventId=A on children returns A only and does not change current event');
    }

    // 3.3 GET /attendance?eventId=A
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/attendance?eventId=${eventAId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      const rows: any[] = res.body.rows || [];
      const hasA = rows.some((r: any) => r.childId === childAId);
      const hasB = rows.some((r: any) => r.childId === childBId);
      assert(hasA, 'GET /attendance?eventId=A must return Child A');
      assert(!hasB, 'GET /attendance?eventId=A must NOT return Child B');
      assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must remain B after explicit query');
      console.log('✓ ?eventId=A on attendance returns A only and does not change current event');
    }

    // =========================================================================
    // VERIFICATION 4: Admin-created child while B current gets:
    // child_event_entries.event_id = B
    // =========================================================================
    console.log('\n--- TEST GROUP 4: Admin Create Child & Parent ---');

    // 4.1 POST /children while B is current -> gets event_id = B
    {
      assert.strictEqual(await getCurrentEventId(), eventBId);
      const { executeHandler } = createMockReqRes(adminRouter, {
        method: 'POST',
        url: '/children',
        token: adminToken,
        body: {
          parentProfileId: parentBId,
          firstName: 'NewAdminChild',
          lastName: 'Beta',
          dateOfBirth: '2017-06-15',
          gender: 'female',
          ageGroup: 'Ages 7-9',
          registerForCurrentEvent: true
        }
      });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200, `POST /children status: ${res.status}, body: ${JSON.stringify(res.body)}`);
      assert(res.body.success === true, 'POST /children should return success=true');
      assert(res.body.childId, 'childId must be returned');
      createdChildIds.push(res.body.childId);

      // Verify in DB that the new child_event_entries record has event_id = B
      const entry = await queryOne(
        'SELECT * FROM child_event_entries WHERE child_id = ?',
        [res.body.childId]
      );
      assert(entry, 'child_event_entries must exist for admin-created child');
      assert.strictEqual(entry.event_id, eventBId, `Entry event_id must be B (${eventBId}), got ${entry.event_id}`);
      assert.notStrictEqual(entry.event_id, 'event-ga-2026', 'Must NOT force event-ga-2026');
      console.log('✓ POST /children while B is current scopes child_event_entries.event_id = B');
    }

    // 4.2 POST /children with explicit eventId = A while B is current -> gets event_id = A
    {
      assert.strictEqual(await getCurrentEventId(), eventBId);
      const { executeHandler } = createMockReqRes(adminRouter, {
        method: 'POST',
        url: '/children',
        token: adminToken,
        body: {
          parentProfileId: parentAId,
          firstName: 'ExplicitAChild',
          lastName: 'Alpha',
          dateOfBirth: '2018-02-10',
          gender: 'male',
          ageGroup: 'Ages 4-6',
          eventId: eventAId,
          registerForCurrentEvent: true
        }
      });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200, `POST /children explicit status: ${res.status}`);
      assert(res.body.success === true);
      assert(res.body.childId);
      createdChildIds.push(res.body.childId);

      const entry = await queryOne(
        'SELECT * FROM child_event_entries WHERE child_id = ?',
        [res.body.childId]
      );
      assert(entry, 'child_event_entries must exist');
      assert.strictEqual(entry.event_id, eventAId, `Explicit target event must be A (${eventAId}), got ${entry.event_id}`);
      assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must remain B');
      console.log('✓ POST /children with explicit eventId = A scopes child_event_entries.event_id = A without changing current event');
    }

    // 4.3 POST /parents with registerForCurrentEvent while B is current -> gets event_id = B
    {
      assert.strictEqual(await getCurrentEventId(), eventBId);
      const testParentEmail = `newparent-${crypto.randomUUID().slice(0, 8)}@test.internal`;
      const { executeHandler } = createMockReqRes(adminRouter, {
        method: 'POST',
        url: '/parents',
        token: adminToken,
        body: {
          firstName: 'NewParent',
          lastName: 'BetaFamily',
          email: testParentEmail,
          phone: '+2348000000099',
          childDetails: {
            firstName: 'ParentChildBeta',
            lastName: 'BetaFamily',
            dateOfBirth: '2019-11-20',
            gender: 'female',
            ageGroup: 'Ages 4-6',
            registerForCurrentEvent: true
          }
        }
      });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200, `POST /parents status: ${res.status}, body: ${JSON.stringify(res.body)}`);
      assert(res.body.success === true);
      assert(res.body.parentId);

      // Verify child created and scoped to event B
      const child = await queryOne('SELECT * FROM children WHERE parent_profile_id = ?', [res.body.parentId]);
      assert(child, 'Child must be created');
      createdChildIds.push(child.id);

      const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ?', [child.id]);
      assert(entry, 'child_event_entries must exist for parent child');
      assert.strictEqual(entry.event_id, eventBId, `Parent child entry must have event_id = B (${eventBId})`);
      assert.notStrictEqual(entry.event_id, 'event-ga-2026', 'Must NOT force event-ga-2026');
      console.log('✓ POST /parents while B is current scopes child_event_entries.event_id = B');
    }

    // =========================================================================
    // VERIFICATION 5: No-current-event safe behavior (no 2026 fallback)
    // =========================================================================
    console.log('\n--- TEST GROUP 5: No Current Event Scenario ---');
    // Set all current events status = 'upcoming' to simulate no current event
    await execute("UPDATE events SET status = 'upcoming' WHERE status = 'current'");
    assert.strictEqual(await getCurrentEventId(), null, 'There must be no current event');

    // 5.1 GET /applications with no current event returns clean safe response
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/applications', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.deepStrictEqual(res.body.applications, []);
      assert.strictEqual(res.body.pagination.total, 0);
      console.log('✓ No current event: GET /applications returns safe empty response without fallback');
    }

    // 5.2 GET /children with no current event returns clean safe response
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/children', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.deepStrictEqual(res.body.children, []);
      assert.strictEqual(res.body.stats.totalChildren, 0);
      console.log('✓ No current event: GET /children returns safe empty response without fallback');
    }

    // 5.3 GET /attendance with no current event returns clean safe response
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/attendance', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.deepStrictEqual(res.body.rows, []);
      assert.strictEqual(res.body.stats.expected, 0);
      console.log('✓ No current event: GET /attendance returns safe empty response without fallback');
    }

    // 5.4 POST /children with registerForCurrentEvent and no current event returns 400 clean error
    {
      const { executeHandler } = createMockReqRes(adminRouter, {
        method: 'POST',
        url: '/children',
        token: adminToken,
        body: {
          parentProfileId: parentBId,
          firstName: 'NoEventChild',
          lastName: 'Tester',
          registerForCurrentEvent: true
        }
      });
      const res = await executeHandler();
      assert.strictEqual(res.status, 400, 'Must return 400 when registering for non-existent current event');
      assert.strictEqual(res.body.success, false);
      assert(res.body.error.includes('No active or current event'));
      console.log('✓ No current event: POST /children returns clean 400 rejection without fallback');
    }

    // 5.5 POST /parents with registerForCurrentEvent and no current event returns 400 clean error
    {
      const { executeHandler } = createMockReqRes(adminRouter, {
        method: 'POST',
        url: '/parents',
        token: adminToken,
        body: {
          firstName: 'NoEventParent',
          lastName: 'Tester',
          email: `noevent-${crypto.randomUUID().slice(0, 8)}@test.internal`,
          childDetails: {
            firstName: 'NoEventKid',
            lastName: 'Tester',
            registerForCurrentEvent: true
          }
        }
      });
      const res = await executeHandler();
      assert.strictEqual(res.status, 400, 'Must return 400 when registering for non-existent current event');
      assert.strictEqual(res.body.success, false);
      assert(res.body.error.includes('No active or current event'));
      console.log('✓ No current event: POST /parents returns clean 400 rejection without fallback');
    }

    console.log('\n=== ALL PHASE 3D1A TESTS PASSED SUCCESSFULLY! ===\n');

  } finally {
    console.log('--- CLEANUP: Restoring initial current event & deleting test fixtures ---');
    // Restore current event
    await setCurrentEvent(initialCurrentEventId);
    const restoredEventId = await getCurrentEventId();
    console.log(`Restored current event: ${restoredEventId}`);
    assert.strictEqual(restoredEventId, initialCurrentEventId, `Current event must be restored to ${initialCurrentEventId}`);

    // Cleanup test data
    const allChildIds = [childAId, childBId, ...createdChildIds];
    for (const cid of allChildIds) {
      await execute('DELETE FROM event_passes WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE child_id = ?)', [cid]);
      await execute('DELETE FROM pickup_people WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE child_id = ?)', [cid]);
      await execute('DELETE FROM child_event_entries WHERE child_id = ?', [cid]);
      await execute('DELETE FROM children WHERE id = ?', [cid]);
    }
    await execute('DELETE FROM parent_profiles WHERE id IN (?, ?) OR email LIKE ?', [parentAId, parentBId, '%@test.internal']);
    await execute('DELETE FROM users WHERE id = ? OR email LIKE ?', [adminUserId, '%@test.internal']);
    await execute('DELETE FROM events WHERE id IN (?, ?)', [eventAId, eventBId]);
    await execute('DELETE FROM audit_logs WHERE user_id = ?', [adminUserId]);
    console.log('Cleanup completed successfully.');
  }
}

runTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ PHASE 3D1A VERIFICATION FAILED:', err);
  process.exit(1);
});
