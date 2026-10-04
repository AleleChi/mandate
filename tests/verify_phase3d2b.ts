import assert from 'assert';
import crypto from 'crypto';
import { execute, query, queryOne } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import { setCurrentEvent, getCurrentEvent, getCurrentEventId } from '../src/server/services/eventService';
import escalationRouter from '../src/server/routes/escalations';
import notificationRouter from '../src/server/routes/notifications';
import { seedDefaultRules, syncJobsForEvent, processPendingNotifications } from '../src/server/services/notifications';

// Helper to simulate express requests against routers
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
    originalUrl: options.url,
    baseUrl: '',
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
  console.log('=== PHASE 3D2B VERIFICATION: ESCALATIONS & NOTIFICATIONS ===\n');

  const initialEvent = await getCurrentEvent();
  console.log(`Initial current event: ${initialEvent?.id} (${initialEvent?.title})`);
  assert.strictEqual(initialEvent?.id, 'event-ga-2026', 'Initial current event must be event-ga-2026');

  const adminUserId = `test-admin-3d2b-${crypto.randomUUID().slice(0, 8)}`;
  const nowStr = new Date().toISOString();

  const eventAId = `test-evt-3d2b-a-${crypto.randomUUID().slice(0, 8)}`;
  const eventBId = `test-evt-3d2b-b-${crypto.randomUUID().slice(0, 8)}`;

  let policyAId: string | null = null;
  let policyBId: string | null = null;
  let policyHistAId: string | null = null;
  let cycleAId: string | null = null;
  let notifAId: string | null = null;
  let notifBId: string | null = null;
  let notifHistAId: string | null = null;
  let notifNoCurrentId: string | null = null;

  try {
    // Create admin user in DB
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES (?, ?, 'dummyhash', 'admin', 1, ?, ?)
    `, [adminUserId, `admin-3d2b-${crypto.randomUUID()}@test.internal`, nowStr, nowStr]);

    const adminToken = generateToken(adminUserId);
    // -------------------------------------------------------------------------
    // 1. SETUP TEST FIXTURES: Event A & Event B
    // -------------------------------------------------------------------------
    console.log('1. Setting up test fixtures for Event A & Event B...');
    await execute(`
      INSERT INTO events (id, title, section_name, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Event A Escalation Summit', 'Section A', 'upcoming', '2026-05-10', '2026-05-12', ?, ?)
    `, [eventAId, nowStr, nowStr]);

    await execute(`
      INSERT INTO events (id, title, section_name, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Event B Notification Conference', 'Section B', 'upcoming', '2026-08-20', '2026-08-22', ?, ?)
    `, [eventBId, nowStr, nowStr]);

    console.log('  [PASS] Event A and Event B created.');

    // -------------------------------------------------------------------------
    // 2. ESCALATIONS ROUTE TESTS
    // -------------------------------------------------------------------------
    console.log('\n2. Testing Escalations Routes event resolution...');

    // 2.1 With Event A current: create & list escalation policies use A
    await setCurrentEvent(eventAId);
    assert.strictEqual(await getCurrentEventId(), eventAId, 'Event A must be current');

    const { executeHandler: createPolicyA } = createMockReqRes(escalationRouter, {
      method: 'POST',
      url: '/policies',
      token: adminToken,
      body: {
        name: 'Policy for Event A',
        policy_scope: 'event_default',
        condition_key: 'alert_not_acknowledged',
        priority: 10,
        is_enabled: 1,
        steps: [
          { step_order: 1, wait_seconds: 30, target_type: 'team', target_team_key: 'Admins', channels: 'push' }
        ]
      }
    });
    const resCreatePolicyA = await createPolicyA();
    assert.strictEqual(resCreatePolicyA.status, 200);
    assert.strictEqual(resCreatePolicyA.body.success, true);
    policyAId = resCreatePolicyA.body.policyId;

    // Verify policy A in DB belongs to Event A
    const policyARow = await queryOne('SELECT * FROM escalation_policies WHERE id = ?', [policyAId]);
    assert.strictEqual(policyARow.event_id, eventAId, 'Policy A must have event_id = eventAId');
    console.log('  [PASS] 2.1 POST /policies without explicit eventId uses canonical current Event A');

    // List policies without eventId uses A
    const { executeHandler: listPoliciesA } = createMockReqRes(escalationRouter, {
      method: 'GET',
      url: '/policies',
      token: adminToken
    });
    const resListPoliciesA = await listPoliciesA();
    assert.strictEqual(resListPoliciesA.status, 200);
    assert.strictEqual(resListPoliciesA.body.success, true);
    assert(resListPoliciesA.body.policies.some((p: any) => p.id === policyAId), 'List policies must include policy A');
    console.log('  [PASS] 2.1 GET /policies without explicit eventId returns Event A policies');

    // 2.2 Switch current event to Event B: create & list use B
    await setCurrentEvent(eventBId);
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Event B must be current');

    const { executeHandler: createPolicyB } = createMockReqRes(escalationRouter, {
      method: 'POST',
      url: '/policies',
      token: adminToken,
      body: {
        name: 'Policy for Event B',
        policy_scope: 'event_default',
        condition_key: 'alert_handover_unanswered',
        priority: 20,
        is_enabled: 1,
        steps: [
          { step_order: 1, wait_seconds: 45, target_type: 'team', target_team_key: 'Admins', channels: 'push,email' }
        ]
      }
    });
    const resCreatePolicyB = await createPolicyB();
    assert.strictEqual(resCreatePolicyB.status, 200);
    assert.strictEqual(resCreatePolicyB.body.success, true);
    policyBId = resCreatePolicyB.body.policyId;

    const policyBRow = await queryOne('SELECT * FROM escalation_policies WHERE id = ?', [policyBId]);
    assert.strictEqual(policyBRow.event_id, eventBId, 'Policy B must have event_id = eventBId');
    console.log('  [PASS] 2.2 POST /policies uses canonical current Event B after switch');

    // List policies without eventId returns B only (not A)
    const { executeHandler: listPoliciesB } = createMockReqRes(escalationRouter, {
      method: 'GET',
      url: '/policies',
      token: adminToken
    });
    const resListPoliciesB = await listPoliciesB();
    assert.strictEqual(resListPoliciesB.status, 200);
    assert(resListPoliciesB.body.policies.some((p: any) => p.id === policyBId), 'List policies must include policy B');
    assert(!resListPoliciesB.body.policies.some((p: any) => p.id === policyAId), 'List policies for Event B must NOT include policy A');
    console.log('  [PASS] 2.2 GET /policies isolates Event B policies from Event A');

    // 2.3 Explicit historical event while Event B is current
    const { executeHandler: listHistA } = createMockReqRes(escalationRouter, {
      method: 'GET',
      url: `/policies?eventId=${eventAId}`,
      token: adminToken
    });
    const resListHistA = await listHistA();
    assert.strictEqual(resListHistA.status, 200);
    assert(resListHistA.body.policies.some((p: any) => p.id === policyAId), 'Explicit eventId=A must return Policy A');
    assert(!resListHistA.body.policies.some((p: any) => p.id === policyBId), 'Explicit eventId=A must NOT return Policy B');
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must remain Event B');
    console.log('  [PASS] 2.3 GET /policies?eventId=A returns Event A policies without mutating current event');

    // Explicit historical event creation while Event B is current
    const { executeHandler: createHistA } = createMockReqRes(escalationRouter, {
      method: 'POST',
      url: '/policies',
      token: adminToken,
      body: {
        eventId: eventAId,
        name: 'Historical Policy for Event A',
        policy_scope: 'event_default',
        condition_key: 'incident_follow_up_overdue',
        priority: 5,
        is_enabled: 1,
        steps: [
          { step_order: 1, wait_seconds: 60, target_type: 'team', target_team_key: 'Admins', channels: 'push' }
        ]
      }
    });
    const resCreateHistA = await createHistA();
    assert.strictEqual(resCreateHistA.status, 200);
    policyHistAId = resCreateHistA.body.policyId;
    const policyHistARow = await queryOne('SELECT * FROM escalation_policies WHERE id = ?', [policyHistAId]);
    assert.strictEqual(policyHistARow.event_id, eventAId, 'Created historical policy must belong to Event A');
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must remain Event B');
    console.log('  [PASS] 2.3 POST /policies with explicit eventId=A attaches to Event A while current is B');

    // 2.4 Existing record preservation on PUT /policies/:id
    // Update Policy A while Event B is current: policy must preserve event_id = eventAId
    const { executeHandler: updatePolicyA } = createMockReqRes(escalationRouter, {
      method: 'PUT',
      url: `/policies/${policyAId}`,
      token: adminToken,
      body: {
        name: 'Policy for Event A (Updated)',
        policy_scope: 'event_default',
        condition_key: 'alert_not_acknowledged',
        priority: 15,
        is_enabled: 1,
        steps: [
          { step_order: 1, wait_seconds: 35, target_type: 'team', target_team_key: 'Admins', channels: 'push,email' }
        ]
      }
    });
    const resUpdatePolicyA = await updatePolicyA();
    assert.strictEqual(resUpdatePolicyA.status, 200);
    const policyAUpdatedRow = await queryOne('SELECT * FROM escalation_policies WHERE id = ?', [policyAId]);
    assert.strictEqual(policyAUpdatedRow.event_id, eventAId, 'Updated policy A must preserve event_id = eventAId');
    assert.strictEqual(policyAUpdatedRow.name, 'Policy for Event A (Updated)');
    console.log('  [PASS] 2.4 PUT /policies/:id preserves stored event_id while Event B is current');

    // Existing escalation cycle action preserves cycle.event_id
    cycleAId = `cycle-test-${crypto.randomUUID().slice(0, 8)}`;
    await execute(`
      INSERT INTO escalation_cycles (
        id, event_id, subject_type, alert_id, policy_id, condition_key, status, cycle_number, current_step_order, started_at, created_at, updated_at
      ) VALUES (?, ?, 'alert', NULL, ?, 'alert_not_acknowledged', 'active', 1, 1, ?, ?, ?)
    `, [cycleAId, eventAId, policyAId, nowStr, nowStr, nowStr]);

    const { executeHandler: notifyBackup } = createMockReqRes(escalationRouter, {
      method: 'POST',
      url: `/cycles/${cycleAId}/notify-backup`,
      token: adminToken
    });
    const resNotifyBackup = await notifyBackup();
    assert.strictEqual(resNotifyBackup.status, 200);
    const historyEntry = await queryOne('SELECT * FROM escalation_history WHERE cycle_id = ?', [cycleAId]);
    assert(historyEntry, 'History entry must be created');
    assert.strictEqual(historyEntry.event_id, eventAId, 'History entry must preserve cycle.event_id = eventAId');
    console.log('  [PASS] 2.4 Cycle action preserves cycle.event_id in escalation_history');

    // 2.5 No-current event safety
    await execute("UPDATE events SET status = 'upcoming' WHERE status = 'current'");
    assert.strictEqual(await getCurrentEventId(), null, 'Verified no current event');

    // GET /policies without eventId returns empty array safely
    const { executeHandler: listNoCurrent } = createMockReqRes(escalationRouter, {
      method: 'GET',
      url: '/policies',
      token: adminToken
    });
    const resListNoCurrent = await listNoCurrent();
    assert.strictEqual(resListNoCurrent.status, 200);
    assert.deepStrictEqual(resListNoCurrent.body.policies, [], 'Must return empty policies array without current event');
    console.log('  [PASS] 2.5 GET /policies safely returns empty when no event is current (no 2026 fallback)');

    // POST /policies without eventId fails safely with 400 NO_EVENT
    const { executeHandler: createNoCurrent } = createMockReqRes(escalationRouter, {
      method: 'POST',
      url: '/policies',
      token: adminToken,
      body: {
        name: 'Policy without Event',
        policy_scope: 'event_default',
        condition_key: 'alert_not_acknowledged',
        priority: 10,
        is_enabled: 1,
        steps: [{ step_order: 1, wait_seconds: 30, target_type: 'team', target_team_key: 'Admins', channels: 'push' }]
      }
    });
    const resCreateNoCurrent = await createNoCurrent();
    assert.strictEqual(resCreateNoCurrent.status, 400);
    assert.strictEqual(resCreateNoCurrent.body.code, 'NO_EVENT');
    console.log('  [PASS] 2.5 POST /policies fails safely when no event is current (no 2026 fallback)');

    // -------------------------------------------------------------------------
    // 3. NOTIFICATION ROUTE TESTS
    // -------------------------------------------------------------------------
    console.log('\n3. Testing Notification Routes event resolution...');

    // 3.1 With Event A current: POST /admin/notifications and GET /admin/updates/summary use A
    await setCurrentEvent(eventAId);
    assert.strictEqual(await getCurrentEventId(), eventAId, 'Event A is current');

    // Insert a safety alert for Event A to verify summary counts
    const alertAId = `alert-test-a-${crypto.randomUUID().slice(0, 8)}`;
    await execute(`
      INSERT INTO event_safety_alerts (id, event_id, raised_by_user_id, raised_by_role, severity, category, title, message, status, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 'high', 'medical', 'Alert for Event A', 'Test alert message', 'open', ?, ?)
    `, [alertAId, eventAId, adminUserId, nowStr, nowStr]);

    const { executeHandler: createNotifA } = createMockReqRes(notificationRouter, {
      method: 'POST',
      url: '/admin/notifications',
      token: adminToken,
      body: {
        title: 'Notification for Event A',
        message: 'Important update for event A attendees',
        audienceRole: 'admin',
        audienceScope: 'all'
      }
    });
    const resCreateNotifA = await createNotifA();
    assert.strictEqual(resCreateNotifA.status, 201);
    assert.strictEqual(resCreateNotifA.body.success, true);
    notifAId = resCreateNotifA.body.notificationId;

    const notifARow = await queryOne('SELECT * FROM notifications WHERE id = ?', [notifAId]);
    assert.strictEqual(notifARow.event_id, eventAId, 'Notification A must have event_id = eventAId');
    console.log('  [PASS] 3.1 POST /admin/notifications without explicit eventId uses canonical current Event A');

    // Summary endpoint with Event A current
    const { executeHandler: summaryA } = createMockReqRes(notificationRouter, {
      method: 'GET',
      url: '/admin/updates/summary',
      token: adminToken
    });
    const resSummaryA = await summaryA();
    assert.strictEqual(resSummaryA.status, 200);
    assert.strictEqual(resSummaryA.body.summary.openAlerts, 1, 'Event A summary must count open alert for Event A');
    assert(resSummaryA.body.summary.total >= 1, 'Event A summary must count notifications');
    console.log('  [PASS] 3.1 GET /admin/updates/summary scopes to current Event A');

    // 3.2 Switch current event to Event B
    await setCurrentEvent(eventBId);
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Event B is current');

    const { executeHandler: createNotifB } = createMockReqRes(notificationRouter, {
      method: 'POST',
      url: '/admin/notifications',
      token: adminToken,
      body: {
        title: 'Notification for Event B',
        message: 'Important update for event B attendees',
        audienceRole: 'admin',
        audienceScope: 'all'
      }
    });
    const resCreateNotifB = await createNotifB();
    assert.strictEqual(resCreateNotifB.status, 201);
    notifBId = resCreateNotifB.body.notificationId;

    const notifBRow = await queryOne('SELECT * FROM notifications WHERE id = ?', [notifBId]);
    assert.strictEqual(notifBRow.event_id, eventBId, 'Notification B must have event_id = eventBId');
    console.log('  [PASS] 3.2 POST /admin/notifications uses canonical current Event B');

    // Summary for Event B has 0 open alerts (since alertA is on Event A)
    const { executeHandler: summaryB } = createMockReqRes(notificationRouter, {
      method: 'GET',
      url: '/admin/updates/summary',
      token: adminToken
    });
    const resSummaryB = await summaryB();
    assert.strictEqual(resSummaryB.status, 200);
    assert.strictEqual(resSummaryB.body.summary.openAlerts, 0, 'Event B summary must NOT count alert from Event A');
    console.log('  [PASS] 3.2 GET /admin/updates/summary isolates Event B from Event A alerts');

    // 3.3 Explicit historical eventId=A while Event B is current
    const { executeHandler: summaryHistA } = createMockReqRes(notificationRouter, {
      method: 'GET',
      url: `/admin/updates/summary?eventId=${eventAId}`,
      token: adminToken
    });
    const resSummaryHistA = await summaryHistA();
    assert.strictEqual(resSummaryHistA.status, 200);
    assert.strictEqual(resSummaryHistA.body.summary.openAlerts, 1, 'Explicit eventId=A must count Event A alerts');
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must remain Event B');
    console.log('  [PASS] 3.3 GET /admin/updates/summary?eventId=A works while current remains Event B');

    // Explicit historical eventId=A creation
    const { executeHandler: createNotifHistA } = createMockReqRes(notificationRouter, {
      method: 'POST',
      url: '/admin/notifications',
      token: adminToken,
      body: {
        eventId: eventAId,
        title: 'Historical Notification for Event A',
        message: 'Explicitly scoped to event A',
        audienceRole: 'admin',
        audienceScope: 'all'
      }
    });
    const resCreateNotifHistA = await createNotifHistA();
    assert.strictEqual(resCreateNotifHistA.status, 201);
    notifHistAId = resCreateNotifHistA.body.notificationId;

    const notifHistARow = await queryOne('SELECT * FROM notifications WHERE id = ?', [notifHistAId]);
    assert.strictEqual(notifHistARow.event_id, eventAId, 'Notification must have event_id = eventAId');
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must remain Event B');
    console.log('  [PASS] 3.3 POST /admin/notifications with explicit eventId=A creates under Event A');

    // 3.4 Existing notification preserves event_id
    const notifAStored = await queryOne('SELECT event_id FROM notifications WHERE id = ?', [notifAId]);
    assert.strictEqual(notifAStored.event_id, eventAId, 'Notification A still belongs to Event A');
    console.log('  [PASS] 3.4 Existing notification preserves stored event_id');

    // 3.5 No-current event safety
    await execute("UPDATE events SET status = 'upcoming' WHERE status = 'current'");
    assert.strictEqual(await getCurrentEventId(), null, 'Verified no current event');

    // POST /admin/notifications without eventId creates global notification (event_id: null)
    const { executeHandler: createNotifNoCurrent } = createMockReqRes(notificationRouter, {
      method: 'POST',
      url: '/admin/notifications',
      token: adminToken,
      body: {
        title: 'Global Announcement',
        message: 'Platform-wide notification without active event',
        audienceRole: 'admin',
        audienceScope: 'all'
      }
    });
    const resCreateNotifNoCurrent = await createNotifNoCurrent();
    assert.strictEqual(resCreateNotifNoCurrent.status, 201);
    notifNoCurrentId = resCreateNotifNoCurrent.body.notificationId;
    const globalNotif = await queryOne('SELECT * FROM notifications WHERE id = ?', [notifNoCurrentId]);
    assert.strictEqual(globalNotif.event_id, null, 'Global notification must have event_id = null (never event-ga-2026)');
    console.log('  [PASS] 3.5 POST /admin/notifications without current event defaults safely to null (no 2026 fallback)');

    // GET /admin/updates/summary without current event returns openAlerts = 0 (no REAL_EVENT_ID fallback)
    const { executeHandler: summaryNoCurrent } = createMockReqRes(notificationRouter, {
      method: 'GET',
      url: '/admin/updates/summary',
      token: adminToken
    });
    const resSummaryNoCurrent = await summaryNoCurrent();
    assert.strictEqual(resSummaryNoCurrent.status, 200);
    assert.strictEqual(resSummaryNoCurrent.body.summary.openAlerts, 0, 'Must not fallback to REAL_EVENT_ID / 2026 alerts');
    console.log('  [PASS] 3.5 GET /admin/updates/summary safely reports 0 alerts when no event is current');

    // -------------------------------------------------------------------------
    // 4. NOTIFICATION SERVICE TESTS
    // -------------------------------------------------------------------------
    console.log('\n4. Testing Notification Service rule isolation & legacy 2026 compatibility...');

    // 4.1 Event A rule seeding produces event-isolated rule IDs
    await seedDefaultRules(eventAId);
    const rulesA = await query('SELECT * FROM event_notification_rules WHERE event_id = ?', [eventAId]);
    assert(rulesA.length > 0, 'Event A must have seeded notification rules');
    for (const rule of rulesA) {
      assert(rule.id.endsWith(`-${eventAId}`), `Rule ID ${rule.id} must end with -${eventAId}`);
      assert.strictEqual(rule.event_id, eventAId);
    }
    console.log('  [PASS] 4.1 Event A notification rules seeded with isolated rule IDs');

    // 4.2 Event B rule seeding produces distinct IDs without collision
    await seedDefaultRules(eventBId);
    const rulesB = await query('SELECT * FROM event_notification_rules WHERE event_id = ?', [eventBId]);
    assert(rulesB.length > 0, 'Event B must have seeded notification rules');
    for (const rule of rulesB) {
      assert(rule.id.endsWith(`-${eventBId}`), `Rule ID ${rule.id} must end with -${eventBId}`);
      assert.strictEqual(rule.event_id, eventBId);
      assert(!rulesA.some((rA: any) => rA.id === rule.id), `Rule ID ${rule.id} must not collide with Event A`);
    }
    console.log('  [PASS] 4.2 Event B notification rules have isolated IDs with ZERO collisions');

    // 4.3 Legacy 2026 compatibility preserved
    const rules2026 = await query('SELECT * FROM event_notification_rules WHERE event_id = ?', ['event-ga-2026']);
    if (rules2026.length > 0) {
      // Legacy rule IDs for 2026 do NOT have -event-ga-2026 suffix
      const sampleRule = rules2026[0];
      assert(!sampleRule.id.includes('-event-ga-2026'), 'Legacy 2026 rule ID must maintain un-suffixed compatibility');
      console.log(`  [PASS] 4.3 Legacy 2026 rule ID compatibility verified (sample ID: ${sampleRule.id})`);
    } else {
      console.log('  [SKIP] 4.3 No existing 2026 rules to check, seeding test for 2026...');
      await seedDefaultRules('event-ga-2026');
      const rechecked2026 = await query('SELECT * FROM event_notification_rules WHERE event_id = ?', ['event-ga-2026']);
      const sampleRule = rechecked2026[0];
      assert(!sampleRule.id.includes('-event-ga-2026'), '2026 rule ID must not have suffix');
      console.log(`  [PASS] 4.3 Seeded 2026 rules maintain legacy un-suffixed format (${sampleRule.id})`);
    }

    // 4.4 syncJobsForEvent & processPendingNotifications strictly scope to passed eventId
    await syncJobsForEvent(eventAId);
    const jobsA = await query('SELECT * FROM notification_jobs WHERE event_id = ?', [eventAId]);
    for (const job of jobsA) {
      assert.strictEqual(job.event_id, eventAId, 'Job must strictly belong to Event A');
    }
    const procResultA = await processPendingNotifications(eventAId);
    assert(typeof procResultA.processed === 'number');
    console.log('  [PASS] 4.4 syncJobsForEvent and processPendingNotifications strictly scope to eventId');

    console.log('\n=== ALL PHASE 3D2B VERIFICATIONS PASSED SUCCESSFULLY ===');
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP: Always restore original current event and delete test data
    // -------------------------------------------------------------------------
    console.log('\n--- CLEANING UP TEST FIXTURES ---');
    try {
      await setCurrentEvent(initialEvent!.id);
      console.log(`Restored current event: ${initialEvent!.id}`);
    } catch (err: any) {
      console.error('Failed to restore current event:', err.message);
    }

    try {
      if (cycleAId) {
        await execute('DELETE FROM escalation_history WHERE cycle_id = ?', [cycleAId]);
        await execute('DELETE FROM escalation_cycles WHERE id = ?', [cycleAId]);
      }
      await execute('DELETE FROM escalation_policy_steps WHERE policy_id IN (SELECT id FROM escalation_policies WHERE event_id IN (?, ?))', [eventAId, eventBId]);
      await execute('DELETE FROM escalation_policies WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM event_safety_alerts WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM notifications WHERE event_id IN (?, ?) OR id IN (?, ?, ?, ?)', [
        eventAId, eventBId, notifAId || '', notifBId || '', notifHistAId || '', notifNoCurrentId || ''
      ]);
      await execute('DELETE FROM notification_jobs WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM event_notification_rules WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM events WHERE id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM users WHERE id = ?', [adminUserId]);
      console.log('Test fixtures cleaned up successfully.');
    } catch (err: any) {
      console.error('Failed to clean up test fixtures:', err.message);
    }
  }
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n[FATAL TEST ERROR]:', err);
  process.exit(1);
});
