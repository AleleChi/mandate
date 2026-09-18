import { automationsRouter } from '../src/server/routes/admin/automations';
import { execute, query, queryOne } from '../src/server/db';
import { getCurrentEvent } from '../src/server/services/eventService';
import { upsertAutomation, getAutomationsForEvent } from '../src/server/services/operations/automation/automationPersistence';

/**
 * Permanent Regression Test: verify_automation_authorization.ts
 * 
 * Verifies role-based access control and safety isolation for Event Automation API routes:
 * 1. super_admin: Allowed, receives both operational and safety automations
 * 2. admin: Allowed, receives authorized operational and safety automations
 * 3. team: Allowed for non-safety operational items; safety details stripped; settings mutations and safety actions denied
 * 4. volunteer: Denied across all automation routes (HTTP 403)
 * 5. parent: Denied across all automation routes (HTTP 403)
 * 6. UI/API Consistency: Team role matches Overview UI (canViewSafety: false)
 * 7. Event Isolation: Cross-event records strictly isolated
 */

async function simulateRequest(
  method: 'GET' | 'POST',
  path: string,
  user?: { id: string; email: string; role: string },
  body: any = {},
  queryParams: any = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const req: any = {
      method,
      url: path,
      path,
      user,
      body,
      query: queryParams,
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

    // Find route handler by matching express router stack
    let matchedLayer: any = null;

    if (path === '/' && method === 'GET') {
      matchedLayer = automationsRouter.stack.find(s => s.route?.path === '/' && (s.route as any).methods?.get);
    } else if (path === '/settings' && method === 'GET') {
      matchedLayer = automationsRouter.stack.find(s => s.route?.path === '/settings' && (s.route as any).methods?.get);
    } else if (path === '/settings' && method === 'POST') {
      matchedLayer = automationsRouter.stack.find(s => s.route?.path === '/settings' && (s.route as any).methods?.post);
    } else if (path === '/prepare-action' && method === 'POST') {
      matchedLayer = automationsRouter.stack.find(s => s.route?.path === '/prepare-action' && (s.route as any).methods?.post);
    } else if (path.endsWith('/acknowledge') && method === 'POST') {
      req.params.id = path.split('/')[1];
      matchedLayer = automationsRouter.stack.find(s => s.route?.path === '/:id/acknowledge' && (s.route as any).methods?.post);
    } else if (path.endsWith('/dismiss') && method === 'POST') {
      req.params.id = path.split('/')[1];
      matchedLayer = automationsRouter.stack.find(s => s.route?.path === '/:id/dismiss' && (s.route as any).methods?.post);
    }

    if (!matchedLayer || !matchedLayer.route) {
      return resolve({ status: 404, body: { error: 'Route handler not found in test harness' } });
    }

    const middlewares = matchedLayer.route.stack.map((l: any) => l.handle);
    let idx = 0;
    function next(err?: any) {
      if (err) return res.status(500).json({ error: String(err) });
      if (idx >= middlewares.length) return;
      const fn = middlewares[idx++];
      // Simulated harness bypasses token decode since mock req.user is injected directly
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

export async function runAutomationAuthorizationTests() {
  console.log('================================================================');
  console.log('AUTOMATION AUTHORIZATION REGRESSION TEST SUITE');
  console.log('================================================================\n');

  const currentEvent = await getCurrentEvent();
  if (!currentEvent) {
    throw new Error('No current active event found in database.');
  }

  const otherEventId = `other-event-isolation-test-${Date.now()}`;
  const opFingerprint = `fp-op-auth-${Date.now()}`;
  const safetyFingerprint = `fp-safety-auth-${Date.now()}`;
  const isolatedFingerprint = `fp-isolated-auth-${Date.now()}`;

  let opAutomationId = '';
  let safetyAutomationId = '';
  let isolatedAutomationId = '';

  const results = {
    superAdminPass: false,
    adminPass: false,
    teamNonSafetyPass: false,
    teamSafetyDeniedPass: false,
    volunteerDeniedPass: false,
    parentDeniedPass: false,
    eventIsolationPass: false,
    fixtureCleanupPass: false
  };

  try {
    // -----------------------------------------------------------------
    // 1. SEED CONTROLLED FIXTURES
    // -----------------------------------------------------------------
    // A. Operational automation on current event
    const opUpsert = await upsertAutomation({
      eventId: currentEvent.id,
      ruleId: 'rule_registration_closing_soon',
      signalType: 'REGISTRATION_CLOSING_SOON',
      fingerprint: opFingerprint,
      title: 'Registration Closes Soon [Auth Test]',
      summary: 'Public registration closing reminder for authorization testing.',
      severity: 'attention',
      payload: { hoursRemaining: 18, currentRegistrations: 45 },
      actionTargetRoute: 'events',
      actionTargetLabel: 'View event'
    });
    opAutomationId = opUpsert.record.id;

    // B. Safety automation on current event
    const safetyUpsert = await upsertAutomation({
      eventId: currentEvent.id,
      ruleId: 'rule_safety_item_open',
      signalType: 'SAFETY_ITEM_OPEN',
      fingerprint: safetyFingerprint,
      title: 'Active Safety Notice [Auth Test]',
      summary: 'Sensitive care alert details requiring safeguarding authorization.',
      severity: 'urgent',
      payload: { openAlertsCount: 2, openIncidentsCount: 1, totalOpenNotices: 3, severity: 'urgent' },
      actionTargetRoute: 'incidents',
      actionTargetLabel: 'Review safety'
    });
    safetyAutomationId = safetyUpsert.record.id;

    // C. Operational automation on a different event to verify cross-event isolation
    const isolatedUpsert = await upsertAutomation({
      eventId: otherEventId,
      ruleId: 'rule_registration_closing_soon',
      signalType: 'REGISTRATION_CLOSING_SOON',
      fingerprint: isolatedFingerprint,
      title: 'Foreign Event Notice [Isolation Test]',
      summary: 'Belongs strictly to another event.',
      severity: 'attention',
      payload: { hoursRemaining: 2 },
      actionTargetRoute: 'events',
      actionTargetLabel: 'View foreign event'
    });
    isolatedAutomationId = isolatedUpsert.record.id;

    // Defined Mock Actors
    const superAdminUser = { id: 'usr-auth-super', email: 'super@test.org', role: 'super_admin' };
    const adminUser = { id: 'usr-auth-admin', email: 'admin@test.org', role: 'admin' };
    const teamUser = { id: 'usr-auth-team', email: 'team@test.org', role: 'team' };
    const volunteerUser = { id: 'usr-auth-vol', email: 'volunteer@test.org', role: 'volunteer' };
    const parentUser = { id: 'usr-auth-parent', email: 'parent@test.org', role: 'parent' };

    // -----------------------------------------------------------------
    // 2. ASSERTION 1: super_admin
    // -----------------------------------------------------------------
    const superRes = await simulateRequest('GET', '/', superAdminUser);
    const superSeesOp = superRes.body.active?.some((a: any) => a.id === opAutomationId);
    const superSeesSafety = superRes.body.active?.some((a: any) => a.id === safetyAutomationId);
    const superAckSafety = await simulateRequest('POST', `/${safetyAutomationId}/acknowledge`, superAdminUser);

    if (superRes.status === 200 && superSeesOp && superSeesSafety && superAckSafety.status === 200) {
      results.superAdminPass = true;
      console.log('✓ [PASS] super_admin: Full access to automation API and safety automation records.');
    } else {
      console.error('✗ [FAIL] super_admin authorization failed:', { status: superRes.status, superSeesOp, superSeesSafety, ackStatus: superAckSafety.status });
    }

    // -----------------------------------------------------------------
    // 3. ASSERTION 2: admin
    // -----------------------------------------------------------------
    const adminRes = await simulateRequest('GET', '/', adminUser);
    const adminSeesOp = adminRes.body.active?.some((a: any) => a.id === opAutomationId);
    const adminSeesSafety = adminRes.body.active?.some((a: any) => a.id === safetyAutomationId);
    const adminDismissSafety = await simulateRequest('POST', `/${safetyAutomationId}/dismiss`, adminUser);

    if (adminRes.status === 200 && adminSeesOp && adminSeesSafety && adminDismissSafety.status === 200) {
      results.adminPass = true;
      console.log('✓ [PASS] admin: Allowed for both operational automations and authorized safety details.');
    } else {
      console.error('✗ [FAIL] admin authorization failed:', { status: adminRes.status, adminSeesOp, adminSeesSafety, dismissStatus: adminDismissSafety.status });
    }

    // -----------------------------------------------------------------
    // 4. ASSERTION 3: team (Non-safety allowed, Safety details & Settings denied)
    // -----------------------------------------------------------------
    const teamRes = await simulateRequest('GET', '/', teamUser);
    const teamSeesOp = teamRes.body.active?.some((a: any) => a.id === opAutomationId);
    const teamSeesSafety = teamRes.body.active?.some((a: any) => a.id === safetyAutomationId);

    if (teamRes.status === 200 && teamSeesOp && !teamSeesSafety) {
      results.teamNonSafetyPass = true;
      console.log('✓ [PASS] team: Non-safety operational automations accessible matching Admin Overview.');
    } else {
      console.error('✗ [FAIL] team non-safety authorization failed:', { status: teamRes.status, teamSeesOp, teamSeesSafety });
    }

    // Team safety denial: Acknowledge, Dismiss, Settings, Action
    const teamAckSafetyRes = await simulateRequest('POST', `/${safetyAutomationId}/acknowledge`, teamUser);
    const teamDismissSafetyRes = await simulateRequest('POST', `/${safetyAutomationId}/dismiss`, teamUser);
    const teamSettingsRes = await simulateRequest('POST', '/settings', teamUser, { ruleId: 'rule_registration_closing_soon', isEnabled: false });
    const teamActionSafetyRes = await simulateRequest('POST', '/prepare-action', teamUser, { actionKey: 'CREATE_ADMIN_OPERATIONS_ALERT', automationId: safetyAutomationId });

    const teamDeniedSafety =
      teamAckSafetyRes.status === 403 &&
      teamDismissSafetyRes.status === 403 &&
      teamSettingsRes.status === 403 &&
      teamActionSafetyRes.status === 403;

    if (teamDeniedSafety && !teamSeesSafety) {
      results.teamSafetyDeniedPass = true;
      console.log('✓ [PASS] team: Safety details, safety mutations, and settings changes strictly denied (HTTP 403).');
    } else {
      console.error('✗ [FAIL] team safety denial failed:', {
        ackStatus: teamAckSafetyRes.status,
        dismissStatus: teamDismissSafetyRes.status,
        settingsStatus: teamSettingsRes.status,
        actionStatus: teamActionSafetyRes.status
      });
    }

    // -----------------------------------------------------------------
    // 5. ASSERTION 4: volunteer denied across all routes
    // -----------------------------------------------------------------
    const volGet = await simulateRequest('GET', '/', volunteerUser);
    const volAck = await simulateRequest('POST', `/${opAutomationId}/acknowledge`, volunteerUser);
    const volSettings = await simulateRequest('GET', '/settings', volunteerUser);

    if (volGet.status === 403 && volAck.status === 403 && volSettings.status === 403) {
      results.volunteerDeniedPass = true;
      console.log('✓ [PASS] volunteer: All Admin automation endpoints denied (HTTP 403).');
    } else {
      console.error('✗ [FAIL] volunteer denial failed:', { getStatus: volGet.status, ackStatus: volAck.status });
    }

    // -----------------------------------------------------------------
    // 6. ASSERTION 5: parent denied across all routes
    // -----------------------------------------------------------------
    const parentGet = await simulateRequest('GET', '/', parentUser);
    const parentAck = await simulateRequest('POST', `/${opAutomationId}/acknowledge`, parentUser);
    const parentSettings = await simulateRequest('GET', '/settings', parentUser);

    if (parentGet.status === 403 && parentAck.status === 403 && parentSettings.status === 403) {
      results.parentDeniedPass = true;
      console.log('✓ [PASS] parent: All Admin automation endpoints denied (HTTP 403).');
    } else {
      console.error('✗ [FAIL] parent denial failed:', { getStatus: parentGet.status, ackStatus: parentAck.status });
    }

    // -----------------------------------------------------------------
    // 7. ASSERTION 6: Event isolation
    // -----------------------------------------------------------------
    const currentList = await getAutomationsForEvent(currentEvent.id, { limit: 100 });
    const containsOtherEventRecord = currentList.some(r => r.id === isolatedAutomationId || r.event_id === otherEventId);

    // Also verify foreign event record cannot be acknowledged in current event context
    const crossAck = await simulateRequest('POST', `/${isolatedAutomationId}/acknowledge`, adminUser);

    if (!containsOtherEventRecord && crossAck.status === 404) {
      results.eventIsolationPass = true;
      console.log('✓ [PASS] Event isolation: Foreign event automations strictly excluded from current event responses.');
    } else {
      console.error('✗ [FAIL] Event isolation failed:', { containsOtherEventRecord, crossAckStatus: crossAck.status });
    }

  } finally {
    // -----------------------------------------------------------------
    // 8. FIXTURE CLEANUP
    // -----------------------------------------------------------------
    await execute(
      'DELETE FROM event_automations WHERE fingerprint IN (?, ?, ?)',
      [opFingerprint, safetyFingerprint, isolatedFingerprint]
    );
    await execute('DELETE FROM event_automations WHERE event_id = ?', [otherEventId]);

    const remaining = await query(
      'SELECT id FROM event_automations WHERE fingerprint IN (?, ?, ?)',
      [opFingerprint, safetyFingerprint, isolatedFingerprint]
    );

    if (remaining.length === 0) {
      results.fixtureCleanupPass = true;
      console.log('✓ [PASS] Fixture cleanup: All test automations and test event records cleaned up completely.');
    } else {
      console.error('✗ [FAIL] Fixture cleanup incomplete:', remaining);
    }
  }

  console.log('\n================================================================');
  console.log('REGRESSION SUITE COMPLETED');
  console.log('================================================================');

  const allPassed = Object.values(results).every(v => v === true);
  if (!allPassed) {
    throw new Error('One or more authorization regression checks failed.');
  }

  return results;
}

// Direct execution entrypoint
runAutomationAuthorizationTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Regression suite exited with error:', err);
    process.exit(1);
  });
