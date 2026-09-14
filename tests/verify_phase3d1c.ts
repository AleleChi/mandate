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
  console.log('=== PHASE 3D1C VERIFICATION: ADMIN ATTENTION ITEMS & SAFETY ALERTS ===\n');

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
  const eventAId = `test-evt-3d1c-a-${crypto.randomUUID().slice(0, 8)}`;
  const eventBId = `test-evt-3d1c-b-${crypto.randomUUID().slice(0, 8)}`;

  // Parents
  const parentAUserId = `user-a-${crypto.randomUUID()}`;
  const parentBUserId = `user-b-${crypto.randomUUID()}`;
  const parentAId = `parent-a-${crypto.randomUUID().slice(0, 8)}`;
  const parentBId = `parent-b-${crypto.randomUUID().slice(0, 8)}`;

  // Children
  const childAId = `child-a-${crypto.randomUUID().slice(0, 8)}`;
  const childBId = `child-b-${crypto.randomUUID().slice(0, 8)}`;
  const childA2Id = `child-a2-${crypto.randomUUID().slice(0, 8)}`;

  // Entries
  const entryAId = `entry-a-${crypto.randomUUID().slice(0, 8)}`;
  const entryA2Id = `entry-a2-${crypto.randomUUID().slice(0, 8)}`;
  const entryBId = `entry-b-${crypto.randomUUID().slice(0, 8)}`;

  // Attention items
  const attItemAId = `att-a-${crypto.randomUUID().slice(0, 8)}`;
  const attItemBId = `att-b-${crypto.randomUUID().slice(0, 8)}`;

  // Safety alerts
  const alertAId = `alert-a-${crypto.randomUUID().slice(0, 8)}`;
  const alertBId = `alert-b-${crypto.randomUUID().slice(0, 8)}`;

  try {
    // 1. Seed Events
    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Test Event A 3D1C', 'upcoming', '2027-05-01T09:00:00Z', '2027-05-01T17:00:00Z', ?, ?)
    `, [eventAId, nowStr, nowStr]);

    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Test Event B 3D1C', 'upcoming', '2027-06-01T09:00:00Z', '2027-06-01T17:00:00Z', ?, ?)
    `, [eventBId, nowStr, nowStr]);

    // 2. Seed Parents & Children
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES (?, 'parenta3d1c@test.internal', 'dummyhash', 'parent', 1, ?, ?),
             (?, 'parentb3d1c@test.internal', 'dummyhash', 'parent', 1, ?, ?)
    `, [parentAUserId, nowStr, nowStr, parentBUserId, nowStr, nowStr]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Parent A Alice', 'parenta3d1c@test.internal', '+2348000001111', ?, ?),
             (?, ?, 'Parent B Bob', 'parentb3d1c@test.internal', '+2348000002222', ?, ?)
    `, [parentAId, parentAUserId, nowStr, nowStr, parentBId, parentBUserId, nowStr, nowStr]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, age_group, calculated_age, created_at, updated_at)
      VALUES (?, ?, 'Child A Abby', '2020-01-10', 'female', 'Ages 4-6', 6, ?, ?),
             (?, ?, 'Child A2 Aaron', '2019-02-12', 'male', 'Ages 7-9', 7, ?, ?),
             (?, ?, 'Child B Ben', '2018-05-15', 'male', 'Ages 7-9', 8, ?, ?)
    `, [childAId, parentAId, nowStr, nowStr, childA2Id, parentAId, nowStr, nowStr, childBId, parentBId, nowStr, nowStr]);

    // 3. Seed Entries: Child A in Event A (checked_in, medical notes), Child A2 in Event A, Child B in Event B
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, checked_in_at, has_medical_notes, medical_notes, created_at, updated_at)
      VALUES (?, ?, ?, 'checked_in', ?, ?, 1, 'Asthma inhaler required', ?, ?),
             (?, ?, ?, 'selected', ?, NULL, 0, NULL, ?, ?),
             (?, ?, ?, 'selected', ?, NULL, 0, NULL, ?, ?)
    `, [
      entryAId, childAId, eventAId, nowStr, nowStr, nowStr, nowStr,
      entryA2Id, childA2Id, eventAId, nowStr, nowStr, nowStr,
      entryBId, childBId, eventBId, nowStr, nowStr, nowStr
    ]);

    // 4. Seed Attention Items: Item A in Event A, Item B in Event B
    await execute(`
      INSERT INTO child_attention_items (id, event_id, child_id, type, title, description, status, priority, source, created_by, assigned_role, created_at, updated_at)
      VALUES (?, ?, ?, 'registration', 'Alpha Attention', 'Age review needed for child A', 'open', 'high', 'auto', ?, 'admin', ?, ?),
             (?, ?, ?, 'registration', 'Beta Attention', 'Missing photo for child B', 'open', 'medium', 'auto', ?, 'admin', ?, ?)
    `, [
      attItemAId, eventAId, childAId, adminUserId, nowStr, nowStr,
      attItemBId, eventBId, childBId, adminUserId, nowStr, nowStr
    ]);

    // 5. Seed Safety Alerts: Alert A in Event A, Alert B in Event B
    await execute(`
      INSERT INTO event_safety_alerts (id, event_id, child_id, child_event_entry_id, raised_by_user_id, raised_by_role, severity, status, category, title, message, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'admin', 'urgent', 'open', 'MEDICAL', 'Safety Alert A', 'Abby needs medical assistance', ?, ?),
             (?, ?, ?, ?, ?, 'admin', 'urgent', 'open', 'SECURITY', 'Safety Alert B', 'Ben was seen near the exit', ?, ?)
    `, [
      alertAId, eventAId, childAId, entryAId, adminUserId, nowStr, nowStr,
      alertBId, eventBId, childBId, entryBId, adminUserId, nowStr, nowStr
    ]);

    console.log('Test fixtures created successfully.\n');

    // =========================================================================
    // VERIFICATION 1: Event A Current
    // =========================================================================
    console.log('--- TEST GROUP 1: Event A is Current ---');
    await setCurrentEvent(eventAId);
    assert.strictEqual(await getCurrentEventId(), eventAId, 'Event A must be set to current');

    // 1.1 GET /attention-items returns Event A only
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/attention-items', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200, `attention-items status ${res.status}`);
      const items: any[] = Array.isArray(res.body) ? res.body : res.body.items || [];
      const hasA = items.some((i: any) => i.id === attItemAId);
      const hasB = items.some((i: any) => i.id === attItemBId);
      assert(hasA, 'Attention item A must appear in Event A');
      assert(!hasB, 'Attention item B must NOT appear in Event A');
      console.log('  [PASS] 1.1 GET /attention-items returns Event A items only');
    }

    // 1.2 GET /safety-alerts returns Event A only
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/safety-alerts', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200, `safety-alerts status ${res.status}`);
      const alerts: any[] = Array.isArray(res.body) ? res.body : res.body.alerts || [];
      const hasA = alerts.some((a: any) => a.id === alertAId);
      const hasB = alerts.some((a: any) => a.id === alertBId);
      assert(hasA, 'Safety Alert A must appear in Event A');
      assert(!hasB, 'Safety Alert B must NOT appear in Event A');
      console.log('  [PASS] 1.2 GET /safety-alerts returns Event A alerts only');
    }

    // 1.3 GET /updates/summary counts Event A open alerts
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/updates/summary', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.summary.openAlerts >= 1, 'Event A open alerts must be counted');
      console.log('  [PASS] 1.3 GET /updates/summary counts Event A open alerts');
    }

    // =========================================================================
    // VERIFICATION 2: Event B Current
    // =========================================================================
    console.log('\n--- TEST GROUP 2: Event B is Current ---');
    await setCurrentEvent(eventBId);
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Event B must be set to current');

    // 2.1 GET /attention-items returns Event B only
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/attention-items', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      const items: any[] = Array.isArray(res.body) ? res.body : res.body.items || [];
      const hasA = items.some((i: any) => i.id === attItemAId);
      const hasB = items.some((i: any) => i.id === attItemBId);
      assert(hasB, 'Attention item B must appear in Event B');
      assert(!hasA, 'Attention item A must NOT appear in Event B');
      console.log('  [PASS] 2.1 GET /attention-items returns Event B items only');
    }

    // 2.2 GET /safety-alerts returns Event B only
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/safety-alerts', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      const alerts: any[] = Array.isArray(res.body) ? res.body : res.body.alerts || [];
      const hasA = alerts.some((a: any) => a.id === alertAId);
      const hasB = alerts.some((a: any) => a.id === alertBId);
      assert(hasB, 'Safety Alert B must appear in Event B');
      assert(!hasA, 'Safety Alert A must NOT appear in Event B');
      console.log('  [PASS] 2.2 GET /safety-alerts returns Event B alerts only');
    }

    // 2.3 GET /updates/summary counts Event B open alerts
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/updates/summary', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.summary.openAlerts >= 1, 'Event B open alerts must be counted');
      console.log('  [PASS] 2.3 GET /updates/summary counts Event B open alerts');
    }

    // =========================================================================
    // VERIFICATION 3: Historical explicit queries (?eventId=A) while B is current
    // =========================================================================
    console.log('\n--- TEST GROUP 3: Historical Queries while Event B remains Current ---');
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Pre-condition: Event B is current');

    // 3.1 GET /attention-items?eventId=A returns Event A items
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/attention-items?eventId=${eventAId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      const items: any[] = Array.isArray(res.body) ? res.body : res.body.items || [];
      assert(items.some((i: any) => i.id === attItemAId), 'Historical query must return Item A');
      assert(!items.some((i: any) => i.id === attItemBId), 'Historical query must NOT return Item B');
      assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must remain Event B');
      console.log('  [PASS] 3.1 GET /attention-items?eventId=A returns Event A items without altering current event');
    }

    // 3.2 GET /safety-alerts?eventId=A returns Event A alerts
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/safety-alerts?eventId=${eventAId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      const alerts: any[] = Array.isArray(res.body) ? res.body : res.body.alerts || [];
      assert(alerts.some((a: any) => a.id === alertAId), 'Historical query must return Alert A');
      assert(!alerts.some((a: any) => a.id === alertBId), 'Historical query must NOT return Alert B');
      assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must remain Event B');
      console.log('  [PASS] 3.2 GET /safety-alerts?eventId=A returns Event A alerts without altering current event');
    }

    // 3.3 GET /updates/summary?eventId=A counts Event A open alerts
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/updates/summary?eventId=${eventAId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.summary.openAlerts >= 1);
      assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must remain Event B');
      console.log('  [PASS] 3.3 GET /updates/summary?eventId=A returns Event A summary without altering current event');
    }

    // =========================================================================
    // VERIFICATION 4: Critical Existing-Record Test (Alert A accessed while B is current)
    // =========================================================================
    console.log('\n--- TEST GROUP 4: Critical Existing-Record Scoping (alert.event_id) ---');
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Pre-condition: Event B is current');

    // 4.1 GET /safety-alerts/:alertAId uses Alert A's stored event_id, not current Event B
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/safety-alerts/${alertAId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200, `alert detail status ${res.status}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.alert.id, alertAId);

      // Child context must come from Event A
      assert(res.body.child, 'Child context must be resolved');
      assert.strictEqual(res.body.child.id, childAId, 'Child ID must match Child A');
      assert.strictEqual(res.body.child.status, 'checked_in', 'Child entry status must be checked_in from Event A');

      // Parent context
      assert(res.body.parent, 'Parent context must be resolved');
      assert.strictEqual(res.body.parent.fullName, 'Parent A Alice', 'Parent must match Parent A');

      // Care summary from Event A
      assert(res.body.careSummary, 'Care summary must be resolved');
      assert.strictEqual(res.body.careSummary.hasMedicalNote, true, 'Medical notes flag from Event A must be preserved');
      assert(res.body.careSummary.shortSummary.includes('Asthma'), 'Asthma note from Event A must be present');

      assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must still be Event B');
      console.log('  [PASS] 4.1 GET /safety-alerts/:id resolves Event A context for Alert A while B is current');
    }

    // 4.2 POST /safety-alerts/:alertAId/link-child uses alert.event_id for child_event_entries
    {
      const loggedMessages: string[] = [];
      const origLog = console.log;
      console.log = (...args: any[]) => {
        loggedMessages.push(args.map(a => String(a)).join(' '));
        origLog(...args);
      };

      try {
        // Link Child A2 (in Event A) to Alert A
        const { executeHandler } = createMockReqRes(adminRouter, {
          method: 'POST',
          url: `/safety-alerts/${alertAId}/link-child`,
          body: { childId: childA2Id, reason: 'Test link child' },
          token: adminToken
        });
        const res = await executeHandler();
        assert.strictEqual(res.status, 200, `link-child status ${res.status}: ${JSON.stringify(res.body)}`);
        assert.strictEqual(res.body.success, true);

        // Verify in DB that child_event_entry_id was set to entryA2Id (from Event A)
        const updatedAlert = await queryOne('SELECT child_id, child_event_entry_id, event_id FROM event_safety_alerts WHERE id = ?', [alertAId]);
        assert.strictEqual(updatedAlert.child_id, childA2Id);
        assert.strictEqual(updatedAlert.child_event_entry_id, entryA2Id, 'child_event_entry_id must be entryA2Id from Event A');
        assert.strictEqual(updatedAlert.event_id, eventAId, 'alert event_id must remain Event A');

        // Verify SSE broadcast used alert.event_id (eventAId), not current Event B or REAL_EVENT_ID
        const hasSseLog = loggedMessages.some(m => m.includes(`[SSE] Broadcasting event of type "${eventAId}"`));
        assert(hasSseLog, `SSE broadcast for link-child must target Event A channel (${eventAId}). Logs: ${JSON.stringify(loggedMessages)}`);

        origLog('  [PASS] 4.2 link-child uses alert.event_id for child_event_entries and SSE');
      } finally {
        console.log = origLog;
      }
    }

    // 4.3 POST /safety-alerts/:alertAId/contact-attempt uses alert.event_id
    {
      const loggedMessages: string[] = [];
      const origLog = console.log;
      console.log = (...args: any[]) => {
        loggedMessages.push(args.map(a => String(a)).join(' '));
        origLog(...args);
      };

      try {
        const { executeHandler } = createMockReqRes(adminRouter, {
          method: 'POST',
          url: `/safety-alerts/${alertAId}/contact-attempt`,
          body: {
            contactType: 'phone_call',
            contactReference: '+2348000001111',
            outcome: 'parent_answered',
            safeNote: 'Spoke with mother'
          },
          token: adminToken
        });
        const res = await executeHandler();
        assert.strictEqual(res.status, 200, `contact-attempt status ${res.status}: ${JSON.stringify(res.body)}`);
        assert.strictEqual(res.body.success, true);

        // Verify child_contact_attempts recorded with alert.event_id
        const attempt = await queryOne('SELECT event_id, child_id FROM child_contact_attempts WHERE alert_id = ?', [alertAId]);
        assert(attempt, 'Contact attempt record must exist in DB');
        assert.strictEqual(attempt.event_id, eventAId, `Contact attempt must use alert.event_id (${eventAId}), got ${attempt.event_id}`);

        // Verify SSE broadcast targeted alert.event_id (eventAId)
        const hasSseLog = loggedMessages.some(m => m.includes(`[SSE] Broadcasting event of type "${eventAId}"`));
        assert(hasSseLog, `SSE broadcast for contact-attempt must target Event A channel (${eventAId}). Logs: ${JSON.stringify(loggedMessages)}`);

        origLog('  [PASS] 4.3 contact-attempt records alert.event_id and broadcasts on alert.event_id channel');
      } finally {
        console.log = origLog;
      }
    }

    // =========================================================================
    // VERIFICATION 5: No Current Event Scenario
    // =========================================================================
    console.log('\n--- TEST GROUP 5: No Current Event Scenario ---');
    await execute("UPDATE events SET status = 'upcoming' WHERE status = 'current'");
    assert.strictEqual(await getCurrentEventId(), null, 'Pre-condition: No current event in DB');

    // 5.1 GET /attention-items returns empty array safely
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/attention-items', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      const items = Array.isArray(res.body) ? res.body : res.body.items;
      assert.deepStrictEqual(items, [], 'attention-items must return [] when no current event');
      console.log('  [PASS] 5.1 GET /attention-items returns [] when no current event (no 2026 fallback)');
    }

    // 5.2 GET /safety-alerts returns empty array safely
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/safety-alerts', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      const alerts = Array.isArray(res.body) ? res.body : res.body.alerts;
      assert.deepStrictEqual(alerts, [], 'safety-alerts must return [] when no current event');
      console.log('  [PASS] 5.2 GET /safety-alerts returns [] when no current event (no 2026 fallback)');
    }

    // 5.3 GET /updates/summary returns openAlerts: 0 safely
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/updates/summary', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.summary.openAlerts, 0, 'openAlerts must be 0 when no current event');
      console.log('  [PASS] 5.3 GET /updates/summary returns openAlerts: 0 when no current event');
    }

    // 5.4 GET /safety-alerts/:alertAId STILL resolves Alert A with Event A context!
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: `/safety-alerts/${alertAId}`, token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.alert.id, alertAId);
      assert.strictEqual(res.body.parent.fullName, 'Parent A Alice');
      console.log('  [PASS] 5.4 GET /safety-alerts/:id works independently of current event');
    }

    // =========================================================================
    // VERIFICATION 6: Explicit Invalid Event ID Handling
    // =========================================================================
    console.log('\n--- TEST GROUP 6: Explicit Invalid Event ID returns 404 ---');
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/attention-items?eventId=non-existent-event-999', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 404);
      console.log('  [PASS] 6.1 GET /attention-items with non-existent eventId returns 404');
    }
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/safety-alerts?eventId=non-existent-event-999', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 404);
      console.log('  [PASS] 6.2 GET /safety-alerts with non-existent eventId returns 404');
    }
    {
      const { executeHandler } = createMockReqRes(adminRouter, { method: 'GET', url: '/updates/summary?eventId=non-existent-event-999', token: adminToken });
      const res = await executeHandler();
      assert.strictEqual(res.status, 404);
      console.log('  [PASS] 6.3 GET /updates/summary with non-existent eventId returns 404');
    }

    console.log('\n=== ALL PHASE 3D1C VERIFICATION TESTS PASSED SUCCESSFULLY ===');
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
      await execute('DELETE FROM child_contact_attempts WHERE alert_id IN (?, ?)', [alertAId, alertBId]);
      await execute('DELETE FROM alert_response_history WHERE alert_id IN (?, ?)', [alertAId, alertBId]);
      await execute('DELETE FROM alert_child_link_history WHERE alert_id IN (?, ?)', [alertAId, alertBId]);
      await execute('DELETE FROM safety_alert_recipients WHERE alert_id IN (?, ?)', [alertAId, alertBId]);
      await execute('DELETE FROM event_safety_alerts WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM child_attention_items WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM child_event_entries WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM children WHERE id IN (?, ?, ?)', [childAId, childA2Id, childBId]);
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
  console.error('\nFatal error in Phase 3D1C verification:', err);
  process.exit(1);
});
