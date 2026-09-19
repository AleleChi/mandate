import { automationsRouter } from '../src/server/routes/admin/automations';
import { execute, query, queryOne } from '../src/server/db';
import { getCurrentEvent } from '../src/server/services/eventService';
import {
  evaluateCurrentEventAutomations,
  getAutomationEngineHealth
} from '../src/server/services/operations/automation/automationEngine';
import {
  getAutomationsForEvent,
  getAutomationSettingsForEvent,
  setAutomationRuleEnabled,
  upsertAutomation
} from '../src/server/services/operations/automation/automationPersistence';
import { PHASE3B_AUTOMATION_RULES } from '../src/server/services/operations/automation/ruleModel';

async function simulateRequest(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  user?: { id: string; email: string; role: string },
  body: any = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const req: any = {
      method,
      url: path,
      path,
      user,
      body,
      query: {},
      params: {},
      headers: user ? { authorization: 'Bearer test-token' } : {}
    };

    let statusCode = 200;
    const res: any = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(data: any) {
        resolve({ status: statusCode, body: data });
      },
      send(data: any) {
        resolve({ status: statusCode, body: data });
      }
    };

    let matchedLayer: any = null;
    if (path === '/settings' && method === 'GET') {
      matchedLayer = automationsRouter.stack.find(
        (s: any) => s.route?.path === '/settings' && s.route.methods?.get
      );
    } else if (path === '/settings' && (method === 'POST' || method === 'PATCH')) {
      matchedLayer = automationsRouter.stack.find(
        (s: any) => s.route?.path === '/settings' && (s.route.methods?.post || s.route.methods?.patch)
      );
    }

    if (!matchedLayer || !matchedLayer.route) {
      return resolve({ status: 404, body: { error: 'Route not found in test harness' } });
    }

    const middlewares = matchedLayer.route.stack.map((l: any) => l.handle);
    let idx = 0;
    function next(err?: any) {
      if (err) return res.status(500).json({ error: String(err) });
      if (idx >= middlewares.length) return;
      const fn = middlewares[idx++];
      if (fn.name === 'authMiddleware') {
        return next();
      }
      try {
        fn(req, res, next);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    }
    next();
  });
}

export async function runEventWatchSettingsTests() {
  console.log('================================================================');
  console.log('OPERATIONS AUTOMATION — PHASE 3C SETTINGS & RULE CONTROLS TESTS');
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

  const now = Date.now();
  const nowIso = new Date().toISOString();
  const originalCurrent = await getCurrentEvent();

  const testEventId = `test-settings-evt-${now}`;
  const testEventBId = `test-settings-b-${now}`;

  try {
    // -----------------------------------------------------------------
    // SETUP FIXTURE EVENT
    // -----------------------------------------------------------------
    await execute(
      `INSERT INTO events (id, title, status, starts_at, ends_at, parent_access_closes_at, capacity, created_at, updated_at)
       VALUES (?, 'Settings Test Event', 'draft', ?, ?, ?, 100, ?, ?)`,
      [
        testEventId,
        new Date(now + 12 * 3600 * 1000).toISOString(),
        new Date(now + 24 * 3600 * 1000).toISOString(),
        new Date(now + 12 * 3600 * 1000).toISOString(), // triggers REGISTRATION_CLOSING_SOON
        nowIso,
        nowIso
      ]
    );

    await execute(
      `INSERT INTO events (id, title, status, starts_at, ends_at, capacity, created_at, updated_at)
       VALUES (?, 'Settings Test Event B', 'draft', ?, ?, 50, ?, ?)`,
      [
        testEventBId,
        new Date(now + 48 * 3600 * 1000).toISOString(),
        new Date(now + 60 * 3600 * 1000).toISOString(),
        nowIso,
        nowIso
      ]
    );

    if (originalCurrent) {
      await execute("UPDATE events SET status = 'completed' WHERE id = ?", [originalCurrent.id]);
    }
    await execute("UPDATE events SET status = 'current' WHERE id = ?", [testEventId]);

    // -----------------------------------------------------------------
    // 1. AUTHORIZATION TESTS
    // -----------------------------------------------------------------
    // super_admin: can view settings and update
    const superAdminRes = await simulateRequest('GET', '/settings', {
      id: 'super-admin-user',
      email: 'super@koinonia.org',
      role: 'super_admin'
    });
    assert(
      superAdminRes.status === 200 && superAdminRes.body.success,
      'Auth: super_admin can view settings'
    );

    const superAdminUpdate = await simulateRequest(
      'PATCH',
      '/settings',
      { id: 'super-admin-user', email: 'super@koinonia.org', role: 'super_admin' },
      { ruleId: 'rule_registration_closing_soon', isEnabled: false }
    );
    assert(
      superAdminUpdate.status === 200 && superAdminUpdate.body.success,
      'Auth: super_admin can update settings'
    );

    // admin: can view settings and update
    const adminRes = await simulateRequest('GET', '/settings', {
      id: 'admin-user',
      email: 'admin@koinonia.org',
      role: 'admin'
    });
    assert(
      adminRes.status === 200 && adminRes.body.success,
      'Auth: admin can view settings'
    );

    const adminUpdate = await simulateRequest(
      'PATCH',
      '/settings',
      { id: 'admin-user', email: 'admin@koinonia.org', role: 'admin' },
      { ruleId: 'rule_pass_not_ready', isEnabled: false }
    );
    assert(
      adminUpdate.status === 200 && adminUpdate.body.success,
      'Auth: admin can update settings'
    );

    // team: can view settings, but CANNOT update
    const teamRes = await simulateRequest('GET', '/settings', {
      id: 'team-user',
      email: 'team@koinonia.org',
      role: 'team'
    });
    assert(
      teamRes.status === 200 && teamRes.body.success,
      'Auth: team can view settings'
    );

    const teamUpdate = await simulateRequest(
      'PATCH',
      '/settings',
      { id: 'team-user', email: 'team@koinonia.org', role: 'team' },
      { ruleId: 'rule_registration_closing_soon', isEnabled: true }
    );
    assert(
      teamUpdate.status === 403,
      'Auth: team CANNOT update settings (HTTP 403 denied)'
    );

    // volunteer: denied GET and PATCH
    const volGet = await simulateRequest('GET', '/settings', {
      id: 'vol-user',
      email: 'vol@koinonia.org',
      role: 'volunteer'
    });
    const volPatch = await simulateRequest(
      'PATCH',
      '/settings',
      { id: 'vol-user', email: 'vol@koinonia.org', role: 'volunteer' },
      { ruleId: 'rule_registration_closing_soon', isEnabled: true }
    );
    assert(
      volGet.status === 403 && volPatch.status === 403,
      'Auth: volunteer is denied on all settings endpoints (HTTP 403)'
    );

    // parent: denied GET and PATCH
    const parentGet = await simulateRequest('GET', '/settings', {
      id: 'parent-user',
      email: 'parent@koinonia.org',
      role: 'parent'
    });
    const parentPatch = await simulateRequest(
      'PATCH',
      '/settings',
      { id: 'parent-user', email: 'parent@koinonia.org', role: 'parent' },
      { ruleId: 'rule_registration_closing_soon', isEnabled: true }
    );
    assert(
      parentGet.status === 403 && parentPatch.status === 403,
      'Auth: parent is denied on all settings endpoints (HTTP 403)'
    );

    // -----------------------------------------------------------------
    // 2. MANDATORY SAFETY RULE PROTECTION
    // -----------------------------------------------------------------
    const safetyAttempt = await simulateRequest(
      'PATCH',
      '/settings',
      { id: 'admin-user', email: 'admin@koinonia.org', role: 'admin' },
      { ruleId: 'rule_safety_item_open', isEnabled: false }
    );
    assert(
      safetyAttempt.status === 400 && safetyAttempt.body.error?.includes('Mandatory'),
      'Safety: Mandatory safety rule cannot be disabled'
    );

    // -----------------------------------------------------------------
    // 3. RULE DISABLE BEHAVIOR & HISTORY PRESERVATION
    // -----------------------------------------------------------------
    // Re-enable registration rule first
    await setAutomationRuleEnabled(testEventId, 'rule_registration_closing_soon', true);

    // First evaluation: condition is detected
    await evaluateCurrentEventAutomations(testEventId);
    const initialItems = await getAutomationsForEvent(testEventId, { status: 'active' });
    const initialReg = initialItems.find(i => i.signal_type === 'REGISTRATION_CLOSING_SOON');
    assert(Boolean(initialReg), 'Rule Behavior: Condition detected while rule is enabled');

    // Disable registration rule
    await setAutomationRuleEnabled(testEventId, 'rule_registration_closing_soon', false);

    // Evaluate again
    await evaluateCurrentEventAutomations(testEventId);

    // Check that historical record is NOT deleted
    const itemsAfterDisable = await query<any>(
      "SELECT * FROM event_automations WHERE event_id = ? AND signal_type = 'REGISTRATION_CLOSING_SOON'",
      [testEventId]
    );
    assert(
      itemsAfterDisable.length > 0,
      'Rule Behavior: History preserved - disabling rule does NOT delete historical records'
    );

    // -----------------------------------------------------------------
    // 4. RE-ENABLE BEHAVIOR
    // -----------------------------------------------------------------
    await setAutomationRuleEnabled(testEventId, 'rule_registration_closing_soon', true);
    await evaluateCurrentEventAutomations(testEventId);

    const itemsAfterReenable = await getAutomationsForEvent(testEventId, { status: 'active' });
    const reenabledReg = itemsAfterReenable.find(i => i.signal_type === 'REGISTRATION_CLOSING_SOON');
    assert(
      Boolean(reenabledReg),
      'Rule Behavior: Re-enabling rule detects current condition again'
    );

    // -----------------------------------------------------------------
    // 5. PER-EVENT SETTINGS ISOLATION
    // -----------------------------------------------------------------
    // Event A has rule_pass_not_ready = false (disabled earlier by adminUpdate)
    // Event B should have default rule_pass_not_ready = true (independent)
    const settingsA = await getAutomationSettingsForEvent(testEventId);
    const settingsB = await getAutomationSettingsForEvent(testEventBId);

    assert(
      settingsA.get('rule_pass_not_ready') === false && !settingsB.has('rule_pass_not_ready'),
      'Isolation: Event A settings do NOT leak to or affect Event B'
    );

    // -----------------------------------------------------------------
    // 6. AUTOMATIC RESOLUTION TEST
    // -----------------------------------------------------------------
    // Currently parent_access_closes_at closes in 12h -> REGISTRATION_CLOSING_SOON
    // Move deadline 10 days into future -> condition resolved
    const farFuture = new Date(now + 10 * 24 * 3600 * 1000).toISOString();
    await execute('UPDATE events SET parent_access_closes_at = ? WHERE id = ?', [farFuture, testEventId]);

    const evalRes = await evaluateCurrentEventAutomations(testEventId);
    assert(evalRes.resolvedItemsCount > 0, 'Auto-Resolution: Engine reports resolved items');

    const activeAfterFix = await getAutomationsForEvent(testEventId, { status: 'active' });
    const resolvedAfterFix = await getAutomationsForEvent(testEventId, { status: 'resolved' });

    assert(
      !activeAfterFix.some(i => i.signal_type === 'REGISTRATION_CLOSING_SOON') &&
      resolvedAfterFix.some(i => i.signal_type === 'REGISTRATION_CLOSING_SOON'),
      'Auto-Resolution: Item automatically marked resolved when condition clears without manual admin intervention'
    );

  } finally {
    // Clean up test events and restore original current event
    await execute('DELETE FROM event_automations WHERE event_id IN (?, ?)', [testEventId, testEventBId]);
    await execute('DELETE FROM event_automation_settings WHERE event_id IN (?, ?)', [testEventId, testEventBId]);
    await execute('DELETE FROM events WHERE id IN (?, ?)', [testEventId, testEventBId]);

    if (originalCurrent) {
      await execute("UPDATE events SET status = 'current' WHERE id = ?", [originalCurrent.id]);
    }
  }

  console.log('\n================================================================');
  console.log(`SETTINGS TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`Automation settings test suite failed with ${failed} failure(s).`);
  }
}

// Auto-run if executed directly via tsx
if (process.argv[1]?.endsWith('test_event_watch_settings.ts')) {
  runEventWatchSettingsTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
