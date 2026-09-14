import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execute, query, queryOne } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import { getCurrentEvent, getCurrentEventId, setCurrentEvent } from '../src/server/services/eventService';
import {
  issuePassForChild,
  getPassForChild,
  getPassesForParent,
  validatePassForScan,
  revokePassForChild,
  getPassById,
  getPassByEntryId
} from '../src/server/services/passService';
import {
  acknowledgeAndRespond,
  resolveAlertResponse,
  getAlertResponseState,
  canPerformAlertResponseAction
} from '../src/server/services/alertResponseService';
import jobsRouter from '../src/server/routes/jobs';

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
    originalUrl: `${options.baseUrl || '/api/jobs'}${options.url}`,
    baseUrl: options.baseUrl || '/api/jobs',
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
    },
    end() {
      ended = true;
      return res;
    }
  };

  return {
    req,
    res,
    executeHandler: async () => {
      return new Promise<{ status: number; body: any }>((resolve, reject) => {
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
    }
  };
}

async function runPhase3cTests() {
  console.log('=== EVENT LIFECYCLE PHASE 3C VERIFICATION SUITE ===\n');

  let passedTests = 0;
  let totalTests = 0;

  async function testStep(name: string, fn: () => Promise<void>) {
    totalTests++;
    process.stdout.write(`Test ${totalTests}: ${name} ... `);
    try {
      await fn();
      console.log('PASSED');
      passedTests++;
    } catch (err: any) {
      console.log('FAILED');
      console.error(err);
      throw err;
    }
  }

  // 1. Audit Source Code (Static Analysis)
  await testStep('Static Code Audit: 0 hardcoded REAL_EVENT_ID/event-ga-2026 in Phase 3C files', async () => {
    const filesToAudit = [
      'src/server/services/passService.ts',
      'src/server/routes/jobs.ts',
      'src/server/services/alertResponseService.ts'
    ];

    for (const relPath of filesToAudit) {
      const fullPath = path.resolve(relPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      assert(!content.includes('REAL_EVENT_ID'), `Found REAL_EVENT_ID in ${relPath}`);
      assert(!content.includes('event-ga-2026'), `Found event-ga-2026 in ${relPath}`);
    }

    const dutyPath = path.resolve('src/server/routes/duty.ts');
    const dutyContent = fs.readFileSync(dutyPath, 'utf-8');
    assert(!dutyContent.includes('REAL_EVENT_ID'), 'Found REAL_EVENT_ID in src/server/routes/duty.ts');
    assert(!dutyContent.includes('event-ga-2026'), 'Found event-ga-2026 in src/server/routes/duty.ts');
  });

  // Fetch and record original current event
  const originalCurrent = await getCurrentEvent();
  assert(originalCurrent, 'Current production event must exist before tests run');
  assert.strictEqual(originalCurrent.id, 'event-ga-2026', 'Original current event must be event-ga-2026');
  const originalCurrentId = originalCurrent.id;

  const testSuffix = crypto.randomBytes(4).toString('hex');
  const eventAId = `test-ev3c-a-${testSuffix}`;
  const eventBId = `test-ev3c-b-${testSuffix}`;

  const parentUserId = `usr-p3c-par-${testSuffix}`;
  const parentProfileId = `prof-p3c-par-${testSuffix}`;
  const childAId = `ch-p3c-a-${testSuffix}`;
  const childBId = `ch-p3c-b-${testSuffix}`;
  const entryAId = `entry-p3c-a-${testSuffix}`;
  const entryBId = `entry-p3c-b-${testSuffix}`;

  const volAUserId = `usr-p3c-vola-${testSuffix}`;
  const volBUserId = `usr-p3c-volb-${testSuffix}`;
  const volAProfileId = `prof-p3c-vola-${testSuffix}`;
  const volBProfileId = `prof-p3c-volb-${testSuffix}`;

  const alertAId = `alert-p3c-a-${testSuffix}`;
  const alertBId = `alert-p3c-b-${testSuffix}`;

  const now = new Date().toISOString();

  try {
    // Setup test events
    await execute(`
      INSERT INTO events (id, title, starts_at, ends_at, status, timezone, created_at, updated_at)
      VALUES (?, 'Assembly 2026 (Test A)', '2026-11-18', '2026-11-22', 'upcoming', 'Africa/Lagos', ?, ?)
    `, [eventAId, now, now]);

    await execute(`
      INSERT INTO events (id, title, starts_at, ends_at, status, timezone, created_at, updated_at)
      VALUES (?, 'Assembly 2027 (Test B)', '2027-11-18', '2027-11-22', 'upcoming', 'Africa/Lagos', ?, ?)
    `, [eventBId, now, now]);

    // Setup Parent
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'parent', ?, ?)
    `, [parentUserId, `parent-${testSuffix}@example.com`, now, now]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Parent ThreeC', '+2348000000001', ?, ?)
    `, [parentProfileId, parentUserId, now, now]);

    // Setup Children
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'Child Alpha', '2016-01-01', 'male', 'photo_alpha.jpg', ?, ?)
    `, [childAId, parentProfileId, now, now]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'Child Beta', '2017-02-02', 'female', 'photo_beta.jpg', ?, ?)
    `, [childBId, parentProfileId, now, now]);

    // Setup Event Entries: Child Alpha in Event A, Child Beta in Event B
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [entryAId, childAId, eventAId, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [entryBId, childBId, eventBId, now, now]);

    // Setup Volunteers for Event A and Event B
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'volunteer', ?, ?)
    `, [volAUserId, `vola-${testSuffix}@example.com`, now, now]);
    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Volunteer Alpha', '+2348000000002', '+2348000000002', 'First Aid Team', 'approved', ?, ?)
    `, [volAProfileId, volAUserId, now, now]);
    await execute(`
      INSERT INTO user_duty_status (user_id, active, approved, on_duty, assigned_event_id, created_at, updated_at)
      VALUES (?, 1, 1, 1, ?, ?, ?)
    `, [volAUserId, eventAId, now, now]);

    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'volunteer', ?, ?)
    `, [volBUserId, `volb-${testSuffix}@example.com`, now, now]);
    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Volunteer Beta', '+2348000000003', '+2348000000003', 'Security Lead', 'approved', ?, ?)
    `, [volBProfileId, volBUserId, now, now]);
    await execute(`
      INSERT INTO user_duty_status (user_id, active, approved, on_duty, assigned_event_id, created_at, updated_at)
      VALUES (?, 1, 1, 1, ?, ?, ?)
    `, [volBUserId, eventBId, now, now]);

    let passA: any = null;
    let passB: any = null;

    // 2. Pass Creation & Invariant Enforcement
    await testStep('Pass Creation: pass belongs to child event entry event_id', async () => {
      passA = await issuePassForChild({ childId: childAId, eventId: eventAId });
      assert(passA, 'Pass A should be created');
      assert.strictEqual(passA.child_event_entry_id, entryAId);
      assert(passA.pass_reference.startsWith('KOI-2026-'), `Pass reference should use 2026, got ${passA.pass_reference}`);

      passB = await issuePassForChild({ childId: childBId, eventId: eventBId });
      assert(passB, 'Pass B should be created');
      assert.strictEqual(passB.child_event_entry_id, entryBId);
      assert(passB.pass_reference.startsWith('KOI-2027-'), `Pass reference should use 2027, got ${passB.pass_reference}`);

      // Confirm DB state invariant
      const entryCheckA = await queryOne('SELECT event_id FROM child_event_entries WHERE id = ?', [passA.child_event_entry_id]);
      assert.strictEqual(entryCheckA.event_id, eventAId, 'Pass A entry must belong to Event A');

      const entryCheckB = await queryOne('SELECT event_id FROM child_event_entries WHERE id = ?', [passB.child_event_entry_id]);
      assert.strictEqual(entryCheckB.event_id, eventBId, 'Pass B entry must belong to Event B');
    });

    // 3. Cross-Event Pass Validation and Live Lookup
    await testStep('Cross-Event Pass Scan & Lookup with Event A current', async () => {
      await setCurrentEvent(eventAId);
      const currentEv = await getCurrentEvent();
      assert.strictEqual(currentEv?.id, eventAId);

      // Child A live lookup succeeds
      const passForChildA = await getPassForChild(childAId);
      assert(passForChildA, 'Child A pass should be found under Event A');
      assert.strictEqual(passForChildA.id, passA.id);

      // Child B live lookup is hidden/null (not registered in Event A)
      const passForChildB = await getPassForChild(childBId);
      assert.strictEqual(passForChildB, null, 'Child B pass must NOT appear under Event A');

      // Live scan validation: Pass A valid
      const scanA = await validatePassForScan(passA.pass_reference);
      assert.strictEqual(scanA.valid, true, 'Pass A scan must be valid under Event A');

      // Live scan validation: Pass B rejected as wrong_event
      const scanB = await validatePassForScan(passB.pass_reference);
      assert.strictEqual(scanB.valid, false, 'Pass B scan must be rejected under Event A');
      assert.strictEqual(scanB.reason, 'wrong_event');

      // Pass B must NOT have been deleted or revoked
      const passBCheck = await queryOne('SELECT * FROM event_passes WHERE id = ?', [passB.id]);
      assert(passBCheck, 'Pass B must still exist');
      assert.strictEqual(passBCheck.status, 'active', 'Pass B must remain active in storage');
    });

    await testStep('Cross-Event Pass Scan & Lookup with Event B current', async () => {
      await setCurrentEvent(eventBId);
      const currentEv = await getCurrentEvent();
      assert.strictEqual(currentEv?.id, eventBId);

      // Child B live lookup succeeds
      const passForChildB = await getPassForChild(childBId);
      assert(passForChildB, 'Child B pass should be found under Event B');
      assert.strictEqual(passForChildB.id, passB.id);

      // Child A live lookup is hidden/null
      const passForChildA = await getPassForChild(childAId);
      assert.strictEqual(passForChildA, null, 'Child A pass must NOT appear under Event B');

      // Live scan validation: Pass B valid
      const scanB = await validatePassForScan(passB.pass_reference);
      assert.strictEqual(scanB.valid, true, 'Pass B scan must be valid under Event B');

      // Live scan validation: Pass A rejected as wrong_event
      const scanA = await validatePassForScan(passA.pass_reference);
      assert.strictEqual(scanA.valid, false, 'Pass A scan must be rejected under Event B');
      assert.strictEqual(scanA.reason, 'wrong_event');
    });

    // 4. Historical Pass Lookup Preservation
    await testStep('Historical Pass Lookup: Old pass accessible explicitly', async () => {
      // Admin/history lookup by explicit eventId
      const historicalA = await getPassForChild(childAId, eventAId);
      assert(historicalA, 'Historical Pass A must be retrievable by explicit eventId');
      assert.strictEqual(historicalA.id, passA.id);

      // Admin lookup by pass ID
      const byPassId = await getPassById(passA.id);
      assert(byPassId, 'Pass A must be retrievable by pass ID');
      assert.strictEqual(byPassId.event_id, eventAId);

      // Admin lookup by entry ID
      const byEntryId = await getPassByEntryId(entryAId);
      assert(byEntryId, 'Pass A must be retrievable by entry ID');
      assert.strictEqual(byEntryId.id, passA.id);
    });

    // 5. Pass Generation Boundary (Multi-event registration for same child)
    await testStep('Pass Generation Boundary: New event creates independent pass', async () => {
      // Child A is currently only registered for Event A.
      // Event B is current. Parent views passes for Event B.
      const parentPassesB = await getPassesForParent(parentProfileId, eventBId);
      const foundAInB = parentPassesB.passes.find(p => p.childId === childAId);
      assert(!foundAInB, 'Child A 2026 pass must NOT leak into 2027 parent pass list');

      // Now register Child A for Event B as well
      const entryAInBId = `entry-p3c-ainb-${testSuffix}`;
      await execute(`
        INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
        VALUES (?, ?, ?, 'selected', ?, ?)
      `, [entryAInBId, childAId, eventBId, now, now]);

      // Issue pass for Child A under Event B
      const passA_B = await issuePassForChild({ childId: childAId, eventId: eventBId });
      assert(passA_B, 'New pass for Child A in Event B should be generated');
      assert.notStrictEqual(passA_B.id, passA.id, 'New pass must have distinct ID');
      assert.strictEqual(passA_B.child_event_entry_id, entryAInBId);
      assert(passA_B.pass_reference.startsWith('KOI-2027-'));

      // Both passes exist independently
      const passACheck = await queryOne('SELECT * FROM event_passes WHERE id = ?', [passA.id]);
      const passABCheck = await queryOne('SELECT * FROM event_passes WHERE id = ?', [passA_B.id]);
      assert(passACheck && passABCheck);
      assert.strictEqual(passACheck.child_event_entry_id, entryAId);
      assert.strictEqual(passABCheck.child_event_entry_id, entryAInBId);
    });

    // 6. Alert Event-Persistence Across Current Event Switch
    await testStep('Alert Event-Persistence: Alert A created under Event A retains event context', async () => {
      // Switch back to Event A current
      await setCurrentEvent(eventAId);

      // Create alert A under Event A
      await execute(`
        INSERT INTO event_safety_alerts (
          id, event_id, child_id, child_event_entry_id, raised_by_user_id, raised_by_role,
          severity, category, title, message, status, response_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'volunteer', 'urgent', 'medical_support', 'Test Alert A', 'Details', 'open', 1, ?, ?)
      `, [alertAId, eventAId, childAId, entryAId, volAUserId, now, now]);

      // Switch test current event to Event B
      await setCurrentEvent(eventBId);
      const currentEv = await getCurrentEvent();
      assert.strictEqual(currentEv?.id, eventBId, 'Event B is now current');

      // Actor volA (assigned to Event A) acknowledges Alert A
      const actorA = { id: volAUserId, role: 'volunteer', email: `vola-${testSuffix}@example.com` };
      const respState = await acknowledgeAndRespond({
        actor: actorA,
        alertId: alertAId
      });

      assert.strictEqual(respState.alert.status, 'acknowledged');
      assert.strictEqual(respState.response.owner?.id, volAUserId);

      // Check DB alert record: must still have event_id = eventAId
      const alertInDb = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertAId]);
      assert.strictEqual(alertInDb.event_id, eventAId, 'Alert A event_id must remain Event A after switch');
      assert.strictEqual(alertInDb.status, 'acknowledged');

      // Resolve Alert A by volA
      const resolveState = await resolveAlertResponse({
        actor: actorA,
        alertId: alertAId,
        outcome: 'resolved',
        resolutionNote: 'Issue resolved successfully on Event A'
      });
      assert.strictEqual(resolveState.alert.status, 'resolved');

      const alertResolvedInDb = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertAId]);
      assert.strictEqual(alertResolvedInDb.event_id, eventAId, 'Alert A must still be Event A when resolved');
      assert.strictEqual(alertResolvedInDb.status, 'resolved');
    });

    // 7. New Alert After Switch & Isolation
    await testStep('New Alert After Switch: Isolated to Event B and blocks Event A volunteer', async () => {
      // Event B is current
      await execute(`
        INSERT INTO event_safety_alerts (
          id, event_id, child_id, child_event_entry_id, raised_by_user_id, raised_by_role,
          severity, category, title, message, status, response_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'volunteer', 'urgent', 'security_concern', 'Test Alert B', 'Details', 'open', 1, ?, ?)
      `, [alertBId, eventBId, childBId, entryBId, volBUserId, now, now]);

      // Vol A (assigned to Event A) tries to acknowledge Alert B -> should fail
      const actorA = { id: volAUserId, role: 'volunteer', email: `vola-${testSuffix}@example.com` };
      try {
        await acknowledgeAndRespond({
          actor: actorA,
          alertId: alertBId
        });
        assert.fail('Volunteer assigned to Event A should not be allowed to claim Alert B');
      } catch (err: any) {
        assert.strictEqual(err.code, 'EVENT_ISOLATION_VIOLATION', `Expected EVENT_ISOLATION_VIOLATION, got ${err.code}`);
      }

      // Vol B (assigned to Event B) acknowledges Alert B -> should succeed
      const actorB = { id: volBUserId, role: 'volunteer', email: `volb-${testSuffix}@example.com` };
      const respB = await acknowledgeAndRespond({
        actor: actorB,
        alertId: alertBId
      });
      assert.strictEqual(respB.alert.status, 'acknowledged');
      assert.strictEqual(respB.response.owner?.id, volBUserId);

      const alertBInDb = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertBId]);
      assert.strictEqual(alertBInDb.event_id, eventBId);
    });

    // 8. Background Jobs: Explicit and current-event processing
    await testStep('Background Jobs: Processes explicit event and canonical current event safely', async () => {
      // Test /process-notifications route with JOB_SECRET
      const secret = process.env.JOB_SECRET || 'job-secret-default-2026';

      // 1. Without auth token -> 401
      const { executeHandler: unauthorizedJob } = createMockReqRes(jobsRouter, {
        method: 'POST',
        url: '/process-notifications'
      });
      const resUnauth = await unauthorizedJob();
      assert.strictEqual(resUnauth.status, 401);

      // 2. With auth token and explicit Event A
      const { executeHandler: runJobA } = createMockReqRes(jobsRouter, {
        method: 'POST',
        url: '/process-notifications',
        token: secret,
        body: { eventId: eventAId }
      });
      const resJobA = await runJobA();
      assert.strictEqual(resJobA.status, 200);
      assert.strictEqual(resJobA.body.success, true);
    });

    // 9. Safe Handling When No Event Is Current
    await testStep('No Current Event: Safe handling without 500 or fallback to 2026', async () => {
      // Deactivate all current events temporarily
      await execute("UPDATE events SET status = 'upcoming' WHERE status = 'current'");

      const noCurrent = await getCurrentEvent();
      assert.strictEqual(noCurrent, null, 'Verified no event is current');

      // Parent passes lookup returns empty safely
      const emptyParentPasses = await getPassesForParent(parentProfileId);
      assert.deepStrictEqual(emptyParentPasses, { passes: [], pending: [] });

      // Child pass lookup returns null safely
      const emptyChildPass = await getPassForChild(childAId);
      assert.strictEqual(emptyChildPass, null);

      // Job execution returns safe skip
      const secret = process.env.JOB_SECRET || 'job-secret-default-2026';
      const { executeHandler: runJobNoCurrent } = createMockReqRes(jobsRouter, {
        method: 'POST',
        url: '/process-notifications',
        token: secret
      });
      const resJob = await runJobNoCurrent();
      assert.strictEqual(resJob.status, 200);
      assert.strictEqual(resJob.body.success, true);
      assert.strictEqual(resJob.body.processed, 0);
      assert(resJob.body.message.includes('No current event'));
    });

  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP: Always restore original production current event and delete test data
    // ------------------------------------------------------------------------
    console.log('\n--- CLEANING UP TEST DATA ---');
    try {
      await setCurrentEvent(originalCurrentId);
      console.log(`Restored production current event: ${originalCurrentId}`);
    } catch (e: any) {
      console.error('Failed to restore original current event:', e.message);
    }

    try {
      await execute('DELETE FROM alert_response_updates WHERE alert_id IN (?, ?)', [alertAId, alertBId]);
      await execute('DELETE FROM alert_response_assignments WHERE alert_id IN (?, ?)', [alertAId, alertBId]);
      await execute('DELETE FROM event_safety_alerts WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM notifications WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM event_passes WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id IN (?, ?))', [eventAId, eventBId]);
      await execute('DELETE FROM child_event_entries WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM children WHERE id IN (?, ?)', [childAId, childBId]);
      await execute('DELETE FROM parent_profiles WHERE id = ?', [parentProfileId]);
      await execute('DELETE FROM volunteer_profiles WHERE id IN (?, ?)', [volAProfileId, volBProfileId]);
      await execute('DELETE FROM user_duty_status WHERE user_id IN (?, ?)', [volAUserId, volBUserId]);
      await execute('DELETE FROM users WHERE id IN (?, ?, ?)', [parentUserId, volAUserId, volBUserId]);
      await execute('DELETE FROM alert_routing_recipients WHERE routing_rule_id IN (SELECT id FROM alert_routing_rules WHERE event_id IN (?, ?))', [eventAId, eventBId]);
      await execute('DELETE FROM alert_routing_rules WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM event_notification_rules WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM events WHERE id IN (?, ?)', [eventAId, eventBId]);
      console.log('Cleanup completed successfully.');
    } catch (cleanErr: any) {
      console.error('Error during cleanup:', cleanErr.message);
    }
  }

  console.log(`\n=== PHASE 3C VERIFICATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase3cTests().catch(err => {
  console.error('Fatal error in Phase 3C verification:', err);
  process.exit(1);
});
