import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execute, query, queryOne } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import { getCurrentEvent, getCurrentEventId, setCurrentEvent } from '../src/server/services/eventService';
import parentRouter from '../src/server/routes/parent';

// Helper to simulate express request/response on express router
function createMockReqRes(options: {
  method: string;
  url: string;
  token?: string;
  body?: any;
  params?: any;
  headers?: any;
}) {
  const headers = { ...(options.headers || {}) };
  if (options.token) {
    headers['authorization'] = `Bearer ${options.token}`;
  }

  const req: any = {
    method: options.method,
    url: options.url,
    originalUrl: `/api/parent${options.url}`,
    baseUrl: '/api/parent',
    path: options.url,
    body: options.body || {},
    params: options.params || {},
    headers: headers,
    query: {}
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
      parentRouter(req, res, (err: any) => {
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

async function runPhase3aTests() {
  console.log('=== STARTING EVENT LIFECYCLE PHASE 3A VERIFICATION ===\n');

  const ts = Date.now();
  const event2026Id = `test-ga-2026-${ts}`;
  const event2027Id = `test-ga-2027-${ts}`;
  const now = new Date().toISOString();

  // Save original current event
  const origCurrent = await queryOne<{ id: string }>("SELECT id FROM events WHERE status = 'current'");
  const originalCurrentId = origCurrent ? origCurrent.id : 'event-ga-2026';

  // Test identifiers
  const userAId = `user-parent-a-${ts}`;
  const profileAId = `parent-profile-a-${ts}`;
  const userBId = `user-parent-b-${ts}`;
  const profileBId = `parent-profile-b-${ts}`;

  const childLoveId = `child-love-${ts}`;
  const childLivinaId = `child-livina-${ts}`;
  const childBId = `child-b-${ts}`;

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
      VALUES (?, 'The General Assembly 2026', 'Children', 'Main Auditorium', '2026-08-01', '2026-08-03', 'upcoming', ?, ?)
    `, [event2026Id, now, now]);

    await execute(`
      INSERT INTO events (id, title, section_name, location, starts_at, ends_at, status, created_at, updated_at)
      VALUES (?, 'The General Assembly 2027', 'Children', 'Grand Auditorium', '2027-08-01', '2027-08-03', 'upcoming', ?, ?)
    `, [event2027Id, now, now]);

    // Setup Parent A
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
      VALUES (?, 'parent.a@test.com', 'hash', 'parent', 1, 'active', ?, ?)
    `, [userAId, now, now]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, email, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'Parent Alpha', '08011111111', '08011111111', 'parent.a@test.com', 'media-parent-a', ?, ?)
    `, [profileAId, userAId, now, now]);

    // Setup Parent B
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
      VALUES (?, 'parent.b@test.com', 'hash', 'parent', 1, 'active', ?, ?)
    `, [userBId, now, now]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, email, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'Parent Beta', '08022222222', '08022222222', 'parent.b@test.com', 'media-parent-b', ?, ?)
    `, [profileBId, userBId, now, now]);

    // Setup Child Love (Parent A)
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'Baby Love', 'Female', '2024-01-01', 2, 'Under 4', 'Daughter', 'media-child-love', ?, ?)
    `, [childLoveId, profileAId, now, now]);

    // Setup Child Livina (Parent A)
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'Baby Livina', 'Female', '2020-05-15', 6, 'Ages 4 to 6', 'Daughter', 'media-child-livina', ?, ?)
    `, [childLivinaId, profileAId, now, now]);

    // Setup Child B (Parent B)
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'Beta Junior', 'Male', '2021-02-10', 5, 'Ages 4 to 6', 'Son', 'media-child-b', ?, ?)
    `, [childBId, profileBId, now, now]);

    // Make 2026 the initial current event
    await setCurrentEvent(event2026Id);

    // Baby Love had 2026 entry with status 'selected' and an active pass
    const entryLove2026Id = `entry-love-2026-${ts}`;
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, school_class, school_name, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', 'Nursery 1', 'Faith Academy', ?, ?, ?)
    `, [entryLove2026Id, childLoveId, event2026Id, now, now, now]);

    const passLove2026Id = `pass-love-2026-${ts}`;
    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, 'KOI-2026-TESTLOVE', 'hash2026', 'active', ?, ?, ?)
    `, [passLove2026Id, entryLove2026Id, now, now, now]);

    // Generate tokens for test auth
    const tokenA = generateToken(userAId);
    const tokenB = generateToken(userBId);

    // ------------------------------------------------------------------------
    // TEST A: STATIC AUDIT - ZERO REAL_EVENT_ID IN PARENT OPERATIONAL CODE
    // ------------------------------------------------------------------------
    await testStep('TEST A: Static audit confirms no REAL_EVENT_ID or hardcoded event ID in parent.ts', async () => {
      const parentSource = fs.readFileSync(path.join(process.cwd(), 'src/server/routes/parent.ts'), 'utf-8');
      assert.strictEqual(parentSource.includes('REAL_EVENT_ID'), false, 'parent.ts must not contain REAL_EVENT_ID');
      assert.strictEqual(parentSource.includes('event-ga-2026'), false, 'parent.ts must not contain hardcoded event-ga-2026');
      assert.strictEqual(parentSource.includes('getCurrentEvent'), true, 'parent.ts must use getCurrentEvent');
      assert.strictEqual(parentSource.includes('getCurrentEventId'), true, 'parent.ts must use getCurrentEventId');
    });

    // ------------------------------------------------------------------------
    // TEST B: EXISTING CHILD IDENTITY PERSISTS ON NEW EVENT (2027),
    // BUT OPERATIONAL PARTICIPATION (SELECTION, PASS) DOES NOT LEAK
    // ------------------------------------------------------------------------
    await testStep('TEST B: Existing child on new event shows identity but NOT registered for 2027', async () => {
      // Switch current event to 2027
      await setCurrentEvent(event2027Id);

      const current = await getCurrentEvent();
      assert.strictEqual(current?.id, event2027Id, 'Current event must be 2027');

      // Call GET /home
      const { executeHandler: execHome } = createMockReqRes({
        method: 'GET',
        url: '/home',
        token: tokenA
      });
      const homeRes = await execHome();
      assert.strictEqual(homeRes.status, 200);
      assert.strictEqual(homeRes.body.activeEvent.id, event2027Id);

      const babyLoveInList = homeRes.body.childrenList.find((c: any) => c.id === childLoveId);
      assert.ok(babyLoveInList, 'Baby Love identity must persist in parent childrenList');
      assert.strictEqual(babyLoveInList.name, 'Baby Love');
      assert.strictEqual(babyLoveInList.registeredForCurrentEvent, false, 'Baby Love must NOT be registered for 2027');
      assert.strictEqual(babyLoveInList.status, 'Not registered', 'Baby Love status must be "Not registered" for 2027');
      assert.strictEqual(babyLoveInList.statusNote, 'Not registered for this event');
      assert.strictEqual(babyLoveInList.passReference, undefined, '2026 pass reference must NOT leak into 2027');
      assert.strictEqual(babyLoveInList.pass, undefined, '2026 pass object must NOT leak into 2027');

      // Pass count for 2027 must be 0
      assert.strictEqual(homeRes.body.passReadyCount, 0, 'Pass ready count for 2027 must be 0');

      // Call GET /passes for 2027
      const { executeHandler: execPasses } = createMockReqRes({
        method: 'GET',
        url: '/passes',
        token: tokenA
      });
      const passesRes = await execPasses();
      assert.strictEqual(passesRes.status, 200);
      assert.strictEqual(passesRes.body.passes.length, 0, 'No passes must be returned for 2027');
    });

    // ------------------------------------------------------------------------
    // TEST C: REGISTER EXISTING CHILD FOR 2027 CREATES NEW ENTRY ROW
    // HISTORICAL 2026 ROW REMAINS UNTOUCHED
    // ------------------------------------------------------------------------
    await testStep('TEST C: Registering Baby Love for 2027 creates new child_event_entries row; 2026 row untouched', async () => {
      const draftPayload = {
        id: childLoveId,
        childDetails: {
          fullName: 'Baby Love',
          gender: 'Female',
          dateOfBirth: '2024-01-01',
          relationshipToChild: 'Daughter',
          photo: 'media-child-love'
        },
        schoolAndAgeGroup: {
          schoolClass: 'Nursery 2',
          schoolName: 'Faith Academy Junior',
          previousChildrenProgramme: 'Yes',
          noteToTeam: 'Allergic to peanuts'
        },
        healthAndSupport: {
          hasMedicalNotes: 'Yes',
          medicalNotes: 'Peanut allergy',
          needsExtraSupport: 'No',
          supportNotes: '',
          informationConfirmed: true
        },
        pickup: {
          pickupType: 'parent',
          pickupPersonFullName: 'Parent Alpha',
          pickupPersonRelationship: 'Mother',
          pickupPersonPhone: '08011111111',
          approvedByParent: true
        }
      };

      const { executeHandler: execDraft } = createMockReqRes({
        method: 'POST',
        url: '/children/draft',
        body: draftPayload,
        token: tokenA
      });
      const draftRes = await execDraft();
      assert.strictEqual(draftRes.status, 201);
      assert.strictEqual(draftRes.body.registeredForCurrentEvent, true);
      assert.strictEqual(draftRes.body.currentEventId, event2027Id);

      // Submit application for review
      const { executeHandler: execSubmit } = createMockReqRes({
        method: 'POST',
        url: `/children/${childLoveId}/submit`,
        body: draftPayload,
        params: { childId: childLoveId },
        token: tokenA
      });
      const submitRes = await execSubmit();
      if (submitRes.status !== 200) {
        console.error('Submit error details:', submitRes.body);
      }
      assert.strictEqual(submitRes.status, 200);
      assert.ok(submitRes.body.status === 'under_review' || submitRes.body.status === 'Under review');

      // Verify in DB: exactly TWO rows exist for Baby Love: one for 2026, one for 2027
      const allEntries = await query<any>('SELECT * FROM child_event_entries WHERE child_id = ? ORDER BY event_id ASC', [childLoveId]);
      assert.strictEqual(allEntries.length, 2, 'Baby Love must have exactly 2 entry rows (2026 and 2027)');

      const row2026 = allEntries.find((r: any) => r.event_id === event2026Id);
      const row2027 = allEntries.find((r: any) => r.event_id === event2027Id);

      assert.ok(row2026, '2026 entry must exist');
      assert.strictEqual(row2026.status, 'selected', '2026 status must remain "selected"');
      assert.strictEqual(row2026.school_class, 'Nursery 1', '2026 school class must be untouched');

      assert.ok(row2027, '2027 entry must exist');
      assert.strictEqual(row2027.status, 'under_review', '2027 status must be "under_review"');
      assert.strictEqual(row2027.school_class, 'Nursery 2', '2027 school class must be "Nursery 2"');
    });

    // ------------------------------------------------------------------------
    // TEST D: DUPLICATE REGISTRATION PREVENTION
    // ------------------------------------------------------------------------
    await testStep('TEST D: Submitting Baby Love again for 2027 does not duplicate row', async () => {
      const { executeHandler: execResubmit } = createMockReqRes({
        method: 'POST',
        url: `/children/${childLoveId}/submit`,
        body: { id: childLoveId },
        params: { childId: childLoveId },
        token: tokenA
      });
      const resubmitRes = await execResubmit();
      assert.strictEqual(resubmitRes.status, 200);

      const entries2027 = await query('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childLoveId, event2027Id]);
      assert.strictEqual(entries2027.length, 1, 'Exactly one entry for 2027 must exist');
    });

    // ------------------------------------------------------------------------
    // TEST E: MULTI-CHILD INDEPENDENT STATE
    // ------------------------------------------------------------------------
    await testStep('TEST E: Baby Love is under_review in 2027, Baby Livina is Not registered; no state leakage', async () => {
      const { executeHandler: execChildren } = createMockReqRes({
        method: 'GET',
        url: '/children',
        token: tokenA
      });
      const childrenRes = await execChildren();
      assert.strictEqual(childrenRes.status, 200);

      const love = childrenRes.body.find((c: any) => c.id === childLoveId);
      const livina = childrenRes.body.find((c: any) => c.id === childLivinaId);

      assert.strictEqual(love.status, 'Under review');
      assert.strictEqual(love.registeredForCurrentEvent, true);

      assert.strictEqual(livina.status, 'Not registered');
      assert.strictEqual(livina.registeredForCurrentEvent, false);
      assert.strictEqual(livina.statusNote, 'Not registered for this event');
    });

    // ------------------------------------------------------------------------
    // TEST F: NO CURRENT EVENT - SAFE CLEAN HANDLING (NO SILENT GUESSING)
    // ------------------------------------------------------------------------
    await testStep('TEST F: When no current event exists, endpoints handle cleanly without fallback to 2026/latest/open', async () => {
      // Temporarily set all events to status = 'upcoming'
      await execute("UPDATE events SET status = 'upcoming'");

      const noCurr = await getCurrentEvent();
      assert.strictEqual(noCurr, null, 'No event should be current');

      // GET /home must return activeEvent: null and safe message
      const { executeHandler: execNoEventHome } = createMockReqRes({
        method: 'GET',
        url: '/home',
        token: tokenA
      });
      const homeRes = await execNoEventHome();
      assert.strictEqual(homeRes.status, 200);
      assert.strictEqual(homeRes.body.activeEvent, null);
      assert.strictEqual(homeRes.body.message, 'No event is currently open for registration.');
      assert.strictEqual(homeRes.body.passReadyCount, 0);

      // Attempting to save draft must fail cleanly with 400 NO_CURRENT_EVENT
      const { executeHandler: execNoEventDraft } = createMockReqRes({
        method: 'POST',
        url: '/children/draft',
        body: { childDetails: { fullName: 'Baby Without Event' } },
        token: tokenA
      });
      const draftRes = await execNoEventDraft();
      assert.strictEqual(draftRes.status, 400);
      assert.strictEqual(draftRes.body.code, 'NO_CURRENT_EVENT');

      // Attempting to submit must fail cleanly with 400 NO_CURRENT_EVENT
      const { executeHandler: execNoEventSubmit } = createMockReqRes({
        method: 'POST',
        url: `/children/${childLoveId}/submit`,
        body: {},
        params: { childId: childLoveId },
        token: tokenA
      });
      const submitRes = await execNoEventSubmit();
      assert.strictEqual(submitRes.status, 400);
      assert.strictEqual(submitRes.body.code, 'NO_CURRENT_EVENT');

      // Attempting to fetch pass must fail cleanly with 400
      const { executeHandler: execNoEventPass } = createMockReqRes({
        method: 'GET',
        url: `/children/${childLoveId}/pass`,
        params: { childId: childLoveId },
        token: tokenA
      });
      const passRes = await execNoEventPass();
      assert.strictEqual(passRes.status, 400);

      // Restore 2027 as current
      await setCurrentEvent(event2027Id);
    });

    // ------------------------------------------------------------------------
    // TEST G: AUTHORIZATION - PARENT OWNERSHIP ENFORCED
    // ------------------------------------------------------------------------
    await testStep('TEST G: Parent A cannot access or register Parent B\'s child', async () => {
      // Parent A tries to submit Child B (belongs to Parent B)
      const { executeHandler: execUnauthorizedSubmit } = createMockReqRes({
        method: 'POST',
        url: `/children/${childBId}/submit`,
        body: {},
        params: { childId: childBId },
        token: tokenA
      });
      const authRes = await execUnauthorizedSubmit();
      assert.strictEqual(authRes.status, 403, 'Must return 403 Forbidden');

      // Parent A tries to get status of Child B
      const { executeHandler: execUnauthorizedStatus } = createMockReqRes({
        method: 'GET',
        url: `/children/${childBId}/status`,
        params: { childId: childBId },
        token: tokenA
      });
      const statusRes = await execUnauthorizedStatus();
      assert.strictEqual(statusRes.status, 403, 'Must return 403 Forbidden');
    });

    // ------------------------------------------------------------------------
    // TEST H: NOTIFICATIONS CREATED USE CURRENT EVENT (2027) CONTEXT
    // ------------------------------------------------------------------------
    await testStep('TEST H: Parent & Admin notifications created during 2027 registration reference 2027 event ID', async () => {
      const parentNotifs = await query<any>(
        'SELECT * FROM parent_notifications WHERE parent_id = ? AND child_id = ? ORDER BY created_at DESC',
        [profileAId, childLoveId]
      );
      assert.ok(parentNotifs.length > 0, 'Parent notification must exist');
      assert.strictEqual(parentNotifs[0].event_id, event2027Id, 'Parent notification event_id must be 2027 event ID');

      const generalNotifs = await query<any>(
        'SELECT * FROM notifications WHERE child_id = ? ORDER BY created_at DESC',
        [childLoveId]
      );
      assert.ok(generalNotifs.length > 0, 'General notification must exist');
      assert.strictEqual(generalNotifs[0].event_id, event2027Id, 'General notification event_id must be 2027 event ID');
    });

    console.log(`\n=== ALL PHASE 3A TESTS PASSED (${passedTests}/${totalTests}) ===\n`);
  } finally {
    // ------------------------------------------------------------------------
    // TEARDOWN: Clean up test data and restore production current event
    // ------------------------------------------------------------------------
    console.log('Cleaning up test data and restoring environment...');
    await execute('DELETE FROM pickup_people WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE child_id IN (?, ?, ?))', [childLoveId, childLivinaId, childBId]);
    await execute('DELETE FROM event_passes WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE child_id IN (?, ?, ?))', [childLoveId, childLivinaId, childBId]);
    await execute('DELETE FROM child_event_entries WHERE child_id IN (?, ?, ?)', [childLoveId, childLivinaId, childBId]);
    await execute('DELETE FROM parent_notifications WHERE parent_id IN (?, ?)', [profileAId, profileBId]);
    await execute('DELETE FROM notifications WHERE child_id IN (?, ?, ?)', [childLoveId, childLivinaId, childBId]);
    await execute('DELETE FROM children WHERE id IN (?, ?, ?)', [childLoveId, childLivinaId, childBId]);
    await execute('DELETE FROM parent_profiles WHERE id IN (?, ?)', [profileAId, profileBId]);
    await execute('DELETE FROM users WHERE id IN (?, ?)', [userAId, userBId]);
    await execute('DELETE FROM events WHERE id IN (?, ?)', [event2026Id, event2027Id]);

    // Restore original current event
    await setCurrentEvent(originalCurrentId);
    console.log(`Restored original current event: ${originalCurrentId}`);
  }
}

runPhase3aTests().catch(err => {
  console.error('Fatal error in Phase 3A verification:', err);
  process.exit(1);
});
