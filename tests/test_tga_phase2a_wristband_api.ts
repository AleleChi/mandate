import assert from 'assert';
import http from 'http';
import express from 'express';
import crypto from 'crypto';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import adminRoutes from '../src/server/routes/admin';
import volunteerRoutes from '../src/server/routes/volunteer';

async function runTgaPhase2aWristbandApiTests() {
  console.log('================================================================');
  console.log('TGA 2026 — PHASE 2A REGRESSION TEST SUITE');
  console.log('NFC Backend Inventory + Lookup + Binding API');
  console.log('================================================================\n');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const nowIso = new Date().toISOString();

  // 1. Setup ephemeral test server
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api/volunteer', volunteerRoutes);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let passedScenarios = 0;

  // Test identifiers
  const testEvent1Id = `ev-2a-1-${testRunId}`;
  const testEvent2Id = `ev-2a-2-${testRunId}`;
  const inactiveEventId = `ev-2a-inact-${testRunId}`;

  const adminUserId = `usr-admin-${testRunId}`;
  const superAdminUserId = `usr-super-${testRunId}`;
  const checkInWorkerUserId = `usr-worker-${testRunId}`;
  const normalVolUserId = `usr-normvol-${testRunId}`;
  const unauthorizedVolUserId = `usr-unauthvol-${testRunId}`;
  const parentUserId = `usr-parent-${testRunId}`;
  const parentProfileId = `prof-parent-${testRunId}`;

  const child1Id = `ch-2a-1-${testRunId}`;
  const child2Id = `ch-2a-2-${testRunId}`;
  const child3Id = `ch-2a-3-${testRunId}`;
  const child4Id = `ch-2a-4-${testRunId}`;
  const childIneligibleId = `ch-2a-inelig-${testRunId}`;
  const childEvent2Id = `ch-2a-ev2-${testRunId}`;

  const entry1Id = `ent-2a-1-${testRunId}`;
  const entry2Id = `ent-2a-2-${testRunId}`;
  const entry3Id = `ent-2a-3-${testRunId}`;
  const entry4Id = `ent-2a-4-${testRunId}`;
  const entryIneligibleId = `ent-2a-inelig-${testRunId}`;
  const entryEvent2Id = `ent-2a-ev2-${testRunId}`;

  try {
    // -----------------------------------------------------------------
    // PRE-CLEANUP: Clean any leftover test records from prior runs
    // -----------------------------------------------------------------
    try {
      await execute("DELETE FROM wristband_binding_idempotency WHERE event_id LIKE 'ev-2a-%'");
      await execute("DELETE FROM child_wristband_assignments WHERE event_id LIKE 'ev-2a-%'");
      await execute("DELETE FROM wristbands WHERE event_id LIKE 'ev-2a-%'");
      await execute("DELETE FROM event_wristband_sequences WHERE event_id LIKE 'ev-2a-%'");
      await execute("DELETE FROM event_duty_assignments WHERE event_id LIKE 'ev-2a-%'");
      await execute("DELETE FROM child_event_entries WHERE event_id LIKE 'ev-2a-%'");
      await execute("DELETE FROM users WHERE email LIKE '%@tga-test.org'");
      await execute("DELETE FROM events WHERE id LIKE 'ev-2a-%'");
    } catch (_) {}

    // -----------------------------------------------------------------
    // FIXTURE SETUP
    // -----------------------------------------------------------------
    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'TGA 2026 Event 1', 'open', ?, ?)
    `, [testEvent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'TGA 2026 Event 2', 'upcoming', ?, ?)
    `, [testEvent2Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'Inactive Event', 'archived', ?, ?)
    `, [inactiveEventId, nowIso, nowIso]);

    // Users
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'admin', 'active', ?, ?)
    `, [adminUserId, `admin-2a-${testRunId}@tga-test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'super_admin', 'active', ?, ?)
    `, [superAdminUserId, `super-2a-${testRunId}@tga-test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 'active', ?, ?)
    `, [checkInWorkerUserId, `worker-2a-${testRunId}@tga-test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Checkin Worker', '+2348000000010', '+2348000000010', 'Check-in Team', 'approved', ?, ?)
    `, [`vp-worker-${testRunId}`, checkInWorkerUserId, nowIso, nowIso]);

    // Check-in duty assignment for check-in worker on testEvent1Id
    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'Gate/Check-in Lead', 'check_in', 'primary', 'scheduled', '2026-11-18T08:00:00Z', '2026-11-18T18:00:00Z', ?, ?)
    `, [`eda-worker-${testRunId}`, testEvent1Id, checkInWorkerUserId, nowIso, nowIso]);

    // Normal volunteer (approved profile, but unassigned)
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 'active', ?, ?)
    `, [normalVolUserId, `normvol-2a-${testRunId}@tga-test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Normal Volunteer', '+2348000000011', '+2348000000011', 'General', 'approved', ?, ?)
    `, [`vp-norm-${testRunId}`, normalVolUserId, nowIso, nowIso]);

    // Unauthorized volunteer (assigned only to Event 2)
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 'active', ?, ?)
    `, [unauthorizedVolUserId, `unauthvol-2a-${testRunId}@tga-test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Other Event Vol', '+2348000000012', '+2348000000012', 'General', 'approved', ?, ?)
    `, [`vp-unauth-${testRunId}`, unauthorizedVolUserId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'Room Support', 'care', 'primary', 'scheduled', '2026-11-18T08:00:00Z', '2026-11-18T18:00:00Z', ?, ?)
    `, [`eda-unauth-${testRunId}`, testEvent2Id, unauthorizedVolUserId, nowIso, nowIso]);

    // Parent & Children
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', 'active', ?, ?)
    `, [parentUserId, `parent-2a-${testRunId}@tga-test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Parent 2A', '+2348000000020', ?, ?)
    `, [parentProfileId, parentUserId, nowIso, nowIso]);

    // Children
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child One 2A', 'Female', '2019-01-01', 7, 'Ages 7 to 9', ?, ?)
    `, [child1Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child Two 2A', 'Male', '2021-01-01', 5, 'Ages 4 to 6', ?, ?)
    `, [child2Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child Three 2A', 'Female', '2019-05-01', 7, 'Ages 7 to 9', ?, ?)
    `, [child3Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child Four 2A', 'Male', '2020-03-01', 6, 'Ages 4 to 6', ?, ?)
    `, [child4Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child Ineligible 2A', 'Female', '2022-01-01', 4, 'Ages 4 to 6', ?, ?)
    `, [childIneligibleId, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child Event2 2A', 'Female', '2019-01-01', 7, 'Ages 7 to 9', ?, ?)
    `, [childEvent2Id, parentProfileId, nowIso, nowIso]);

    // Child event entries with various lifecycle statuses
    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', ?, ?)
    `, [entry1Id, testEvent1Id, child1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [entry2Id, testEvent1Id, child2Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'checked_in', ?, ?)
    `, [entry3Id, testEvent1Id, child3Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', ?, ?)
    `, [entry4Id, testEvent1Id, child4Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'under_review', ?, ?)
    `, [entryIneligibleId, testEvent1Id, childIneligibleId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', ?, ?)
    `, [entryEvent2Id, testEvent2Id, childEvent2Id, nowIso, nowIso]);

    // Auth Tokens
    const adminToken = generateToken(adminUserId);
    const superAdminToken = generateToken(superAdminUserId);
    const checkInWorkerToken = generateToken(checkInWorkerUserId);
    const normalVolToken = generateToken(normalVolUserId);
    const unauthorizedVolToken = generateToken(unauthorizedVolUserId);

    console.log('--- PROVISIONING SCENARIOS ---');

    // Scenario 1: Admin provisions valid wristband -> PASS
    const res1 = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        nfcUid: '04:A1:B2:C1',
        wristbandCode: 'WB-000001'
      })
    });
    assert.strictEqual(res1.status, 201, 'Admin provisioning should return 201 Created');
    const data1 = await res1.json();
    assert.strictEqual(data1.success, true);
    assert.strictEqual(data1.wristband.nfc_uid, '04A1B2C1');
    assert.strictEqual(data1.wristband.wristband_code, 'WB-000001');
    assert.strictEqual(data1.wristband.status, 'available');
    assert.strictEqual(data1.wristband.event_id, testEvent1Id);
    passedScenarios++;
    console.log('  [PASS] Scenario 1: Admin provisions valid wristband');

    // Scenario 2: Super Admin provisions -> PASS
    const res2 = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        nfcUid: '04:A1:B2:C2',
        wristbandCode: 'WB-000002'
      })
    });
    assert.strictEqual(res2.status, 201, 'Super Admin provisioning should return 201 Created');
    const data2 = await res2.json();
    assert.strictEqual(data2.success, true);
    assert.strictEqual(data2.wristband.wristband_code, 'WB-000002');
    passedScenarios++;
    console.log('  [PASS] Scenario 2: Super Admin provisions valid wristband');

    // Scenario 3: normal volunteer provision attempt -> BLOCKED (403)
    const res3 = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${normalVolToken}`
      },
      body: JSON.stringify({
        nfcUid: '04:A1:B2:C3'
      })
    });
    assert.strictEqual(res3.status, 403, 'Normal volunteer must be blocked from provisioning');
    const data3 = await res3.json();
    assert.strictEqual(data3.code, 'FORBIDDEN');
    passedScenarios++;
    console.log('  [PASS] Scenario 3: normal volunteer provision attempt blocked');

    // Scenario 4: malformed NFC UID -> REJECTED (400)
    const res4 = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        nfcUid: '04A1ZZC3' // non-hex character 'Z'
      })
    });
    assert.strictEqual(res4.status, 400, 'Malformed NFC UID must be rejected');
    const data4 = await res4.json();
    assert.strictEqual(data4.code, 'INVALID_NFC_UID');
    passedScenarios++;
    console.log('  [PASS] Scenario 4: malformed NFC UID rejected');

    // Scenario 5: duplicate UID same event -> REJECTED (409)
    const res5 = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        nfcUid: '04-a1-b2-c1' // same canonical UID as Scenario 1
      })
    });
    assert.strictEqual(res5.status, 409, 'Duplicate NFC UID in same event must be rejected');
    const data5 = await res5.json();
    assert.strictEqual(data5.code, 'WRISTBAND_ALREADY_REGISTERED');
    passedScenarios++;
    console.log('  [PASS] Scenario 5: duplicate UID in same event rejected');

    // Scenario 6: same UID different event -> ALLOWED (201)
    const res6 = await fetch(`${baseUrl}/api/admin/events/${testEvent2Id}/wristbands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        nfcUid: '04:A1:B2:C1' // same physical UID, but in Event 2
      })
    });
    assert.strictEqual(res6.status, 201, 'Same NFC UID must be allowed in different event context');
    const data6 = await res6.json();
    assert.strictEqual(data6.wristband.event_id, testEvent2Id);
    assert.strictEqual(data6.wristband.nfc_uid, '04A1B2C1');
    passedScenarios++;
    console.log('  [PASS] Scenario 6: same UID in different event allowed');

    // Scenario 7: wristband code unique under concurrent provisioning
    const concurrentUids = [
      '04:C0:00:01',
      '04:C0:00:02',
      '04:C0:00:03',
      '04:C0:00:04',
      '04:C0:00:05'
    ];
    const concurrentResponses = await Promise.all(
      concurrentUids.map(uid =>
        fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`
          },
          body: JSON.stringify({ nfcUid: uid }) // automatic code generation
        })
      )
    );
    for (const r of concurrentResponses) {
      assert.strictEqual(r.status, 201, 'Concurrent provision should succeed');
    }
    const concurrentBodies = await Promise.all(concurrentResponses.map(r => r.json()));
    const generatedCodes = concurrentBodies.map(b => b.wristband.wristband_code);
    const uniqueCodesSet = new Set(generatedCodes);
    assert.strictEqual(uniqueCodesSet.size, 5, 'All concurrent auto-generated codes must be strictly distinct');
    passedScenarios++;
    console.log('  [PASS] Scenario 7: wristband code unique under concurrent provisioning');

    console.log('\n--- LOOKUP SCENARIOS ---');

    // Scenario 8: event-scoped lookup succeeds
    const res8 = await fetch(`${baseUrl}/api/volunteer/wristbands/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${checkInWorkerToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        nfcUid: '04:A1:B2:C1'
      })
    });
    assert.strictEqual(res8.status, 200, 'Valid event-scoped lookup should succeed');
    const data8 = await res8.json();
    assert.strictEqual(data8.success, true);
    assert.strictEqual(data8.wristband.wristbandCode, 'WB-000001');
    assert.strictEqual(data8.wristband.status, 'available');
    assert.strictEqual(data8.wristband.isAssigned, false);
    // Verify response is strictly PII-free
    assert.strictEqual(data8.wristband.childName, undefined);
    assert.strictEqual(data8.wristband.parentName, undefined);
    assert.strictEqual(data8.wristband.medicalNotes, undefined);
    passedScenarios++;
    console.log('  [PASS] Scenario 8: event-scoped lookup succeeds (PII-free)');

    // Scenario 9: wrong-event lookup returns not found
    const res9 = await fetch(`${baseUrl}/api/volunteer/wristbands/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${checkInWorkerToken}`
      },
      body: JSON.stringify({
        eventId: testEvent2Id, // asking Event 2 for a band that only exists in Event 1
        nfcUid: '04:C0:00:01'
      })
    });
    assert.strictEqual(res9.status, 404, 'Lookup in wrong event context must return 404');
    const data9 = await res9.json();
    assert.strictEqual(data9.code, 'WRISTBAND_NOT_FOUND');
    passedScenarios++;
    console.log('  [PASS] Scenario 9: wrong-event lookup returns not found');

    // Scenario 10: malformed UID rejected
    const res10 = await fetch(`${baseUrl}/api/volunteer/wristbands/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${checkInWorkerToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        nfcUid: '123-XYZ'
      })
    });
    assert.strictEqual(res10.status, 400, 'Malformed UID in lookup must return 400');
    const data10 = await res10.json();
    assert.strictEqual(data10.code, 'INVALID_NFC_UID');
    passedScenarios++;
    console.log('  [PASS] Scenario 10: malformed UID rejected in lookup');

    // Scenario 11: no global UID lookup path exists (missing event context rejected)
    const res11 = await fetch(`${baseUrl}/api/volunteer/wristbands/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${checkInWorkerToken}`
      },
      body: JSON.stringify({
        nfcUid: '04:A1:B2:C1' // omitted eventId
      })
    });
    assert.strictEqual(res11.status, 400, 'Lookup without event context must be rejected');
    const data11 = await res11.json();
    assert.strictEqual(data11.code, 'EVENT_REQUIRED');
    passedScenarios++;
    console.log('  [PASS] Scenario 11: no global UID lookup path exists');

    console.log('\n--- BINDING SCENARIOS ---');

    // Scenario 12: authorized check-in worker binds available band
    const res12 = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${checkInWorkerToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry1Id,
        wristbandId: data1.wristband.id
      })
    });
    assert.strictEqual(res12.status, 200, 'Authorized check-in worker binding should succeed');
    const data12 = await res12.json();
    assert.strictEqual(data12.success, true);
    assert.strictEqual(data12.assignment.child_event_entry_id, entry1Id);
    assert.strictEqual(data12.assignment.wristband_id, data1.wristband.id);
    assert.strictEqual(data12.wristband.status, 'active');
    passedScenarios++;
    console.log('  [PASS] Scenario 12: authorized check-in worker binds available band');

    // Scenario 13: Admin binds available band
    const res13 = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry2Id,
        wristbandId: data2.wristband.id
      })
    });
    assert.strictEqual(res13.status, 200, 'Admin binding should succeed');
    const data13 = await res13.json();
    assert.strictEqual(data13.success, true);
    assert.strictEqual(data13.wristband.status, 'active');
    passedScenarios++;
    console.log('  [PASS] Scenario 13: Admin binds available band');

    // Scenario 14: unauthorized volunteer blocked
    const res14 = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${unauthorizedVolToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry4Id,
        wristbandId: concurrentBodies[0].wristband.id
      })
    });
    assert.strictEqual(res14.status, 403, 'Unauthorized volunteer must be blocked with 403');
    const data14 = await res14.json();
    assert.strictEqual(data14.code, 'FORBIDDEN');
    passedScenarios++;
    console.log('  [PASS] Scenario 14: unauthorized volunteer blocked');

    // Scenario 15: cross-event child/band rejected
    // Try to bind Event 2 child to Event 1 wristband
    const res15 = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entryEvent2Id, // belongs to Event 2
        wristbandId: concurrentBodies[0].wristband.id // belongs to Event 1
      })
    });
    assert.strictEqual(res15.status, 400, 'Cross-event binding must be rejected');
    const data15 = await res15.json();
    assert.strictEqual(data15.code, 'EVENT_MISMATCH');
    passedScenarios++;
    console.log('  [PASS] Scenario 15: cross-event child/band rejected');

    // Scenario 16: child already has active band rejected
    const res16 = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry1Id, // already has wb1
        wristbandId: concurrentBodies[0].wristband.id
      })
    });
    assert.strictEqual(res16.status, 409, 'Child with active band must be rejected');
    const data16 = await res16.json();
    assert.strictEqual(data16.code, 'CHILD_ALREADY_HAS_WRISTBAND');
    passedScenarios++;
    console.log('  [PASS] Scenario 16: child already has active band rejected');

    // Scenario 17: band already assigned rejected
    const res17 = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry4Id, // needs band
        wristbandId: data1.wristband.id // wb1, already assigned to entry1
      })
    });
    assert.strictEqual(res17.status, 409, 'Band already assigned must be rejected');
    const data17 = await res17.json();
    assert.strictEqual(data17.code, 'WRISTBAND_ALREADY_ASSIGNED');
    passedScenarios++;
    console.log('  [PASS] Scenario 17: band already assigned rejected');

    // Scenario 18: unavailable/lost/damaged/decommissioned band rejected
    // Update concurrentBodies[1] wristband to 'lost'
    await execute('UPDATE wristbands SET status = ? WHERE id = ?', ['lost', concurrentBodies[1].wristband.id]);
    const res18 = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry4Id,
        wristbandId: concurrentBodies[1].wristband.id
      })
    });
    assert.strictEqual(res18.status, 400, 'Lost/unavailable band must be rejected');
    const data18 = await res18.json();
    assert.strictEqual(data18.code, 'WRISTBAND_NOT_AVAILABLE');
    passedScenarios++;
    console.log('  [PASS] Scenario 18: unavailable/lost/damaged band rejected');

    // Scenario 19: ineligible child lifecycle state rejected
    const res19 = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entryIneligibleId, // status = 'under_review'
        wristbandId: concurrentBodies[2].wristband.id
      })
    });
    assert.strictEqual(res19.status, 400, 'Ineligible child lifecycle state must be rejected');
    const data19 = await res19.json();
    assert.strictEqual(data19.code, 'CHILD_NOT_ELIGIBLE_FOR_BINDING');
    passedScenarios++;
    console.log('  [PASS] Scenario 19: ineligible child lifecycle state rejected');

    // Scenario 20: successful binding creates exactly one assignment
    const assignCountRow = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM child_wristband_assignments WHERE child_event_entry_id = ?',
      [entry1Id]
    );
    assert.strictEqual(assignCountRow?.count, 1, 'Child entry 1 must have exactly 1 assignment row');
    passedScenarios++;
    console.log('  [PASS] Scenario 20: successful binding creates exactly one assignment');

    // Scenario 21: wristband status becomes active
    const wb1Updated = await queryOne<{ status: string }>(
      'SELECT status FROM wristbands WHERE id = ?',
      [data1.wristband.id]
    );
    assert.strictEqual(wb1Updated?.status, 'active', 'Wristband status must transition to active');
    passedScenarios++;
    console.log('  [PASS] Scenario 21: wristband status becomes active');

    // Scenario 22: database race same child/two bands allows only one
    const raceChildEntryId = entry3Id; // checked_in child, currently unassigned
    const wbRaceA = concurrentBodies[3].wristband;
    const wbRaceB = concurrentBodies[4].wristband;

    const raceResultsChild = await Promise.allSettled([
      fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ eventId: testEvent1Id, childEventEntryId: raceChildEntryId, wristbandId: wbRaceA.id })
      }),
      fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ eventId: testEvent1Id, childEventEntryId: raceChildEntryId, wristbandId: wbRaceB.id })
      })
    ]);

    const resRaceChild1 = (raceResultsChild[0] as PromiseFulfilledResult<globalThis.Response>).value;
    const resRaceChild2 = (raceResultsChild[1] as PromiseFulfilledResult<globalThis.Response>).value;

    const statusCodesChild = [resRaceChild1.status, resRaceChild2.status].sort();
    assert.deepStrictEqual(statusCodesChild, [200, 409], 'Exactly one binding should succeed with 200, other rejected with 409');
    passedScenarios++;
    console.log('  [PASS] Scenario 22: database race same child/two bands allows only one');

    // Scenario 23: database race same band/two children allows only one
    // Provision new available band for this race test
    const wbSharedRes = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ nfcUid: '04:D0:00:99' })
    });
    const wbShared = (await wbSharedRes.json()).wristband;

    // Use entry4Id and newly created entry5Id
    const child5Id = `ch-2a-5-${testRunId}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child Five 2A', 'Male', '2020-03-01', 6, 'Ages 4 to 6', ?, ?)
    `, [child5Id, parentProfileId, nowIso, nowIso]);

    const entry5Id = `ent-2a-5-${testRunId}`;
    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', ?, ?)
    `, [entry5Id, testEvent1Id, child5Id, nowIso, nowIso]);

    const raceResultsBand = await Promise.allSettled([
      fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ eventId: testEvent1Id, childEventEntryId: entry4Id, wristbandId: wbShared.id })
      }),
      fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ eventId: testEvent1Id, childEventEntryId: entry5Id, wristbandId: wbShared.id })
      })
    ]);

    const resRaceBand1 = (raceResultsBand[0] as PromiseFulfilledResult<globalThis.Response>).value;
    const resRaceBand2 = (raceResultsBand[1] as PromiseFulfilledResult<globalThis.Response>).value;

    const statusCodesBand = [resRaceBand1.status, resRaceBand2.status].sort();
    assert.deepStrictEqual(statusCodesBand, [200, 409], 'Exactly one binding should succeed with 200, other rejected with 409');
    passedScenarios++;
    console.log('  [PASS] Scenario 23: database race same band/two children allows only one');

    console.log('\n--- IDEMPOTENCY SCENARIOS ---');

    // Scenario 24: same idempotency key retry returns same binding
    const idempotencyTestKey = `idem-key-${testRunId}`;
    // Create new child & entry & new band for clean idempotency test
    const childIdemId = `ch-2a-idem-${testRunId}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child Idem 2A', 'Female', '2019-01-01', 7, 'Ages 7 to 9', ?, ?)
    `, [childIdemId, parentProfileId, nowIso, nowIso]);

    const entryIdemId = `ent-2a-idem-${testRunId}`;
    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', ?, ?)
    `, [entryIdemId, testEvent1Id, childIdemId, nowIso, nowIso]);

    const wbIdemRes = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ nfcUid: '04:E0:00:01' })
    });
    const wbIdem = (await wbIdemRes.json()).wristband;

    const res24a = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${checkInWorkerToken}` },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entryIdemId,
        wristbandId: wbIdem.id,
        idempotencyKey: idempotencyTestKey
      })
    });
    assert.strictEqual(res24a.status, 200, 'First call with idempotencyKey should succeed');
    const data24a = await res24a.json();

    // Retry with SAME key and SAME payload
    const res24b = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${checkInWorkerToken}` },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entryIdemId,
        wristbandId: wbIdem.id,
        idempotencyKey: idempotencyTestKey
      })
    });
    assert.strictEqual(res24b.status, 200, 'Retry with same idempotency key must return 200');
    const data24b = await res24b.json();
    assert.strictEqual(data24b.assignment.id, data24a.assignment.id, 'Idempotent retry must return original assignment');
    passedScenarios++;
    console.log('  [PASS] Scenario 24: same idempotency key retry returns same binding');

    // Scenario 25: retry creates no second assignment
    const idemAssignCount = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM child_wristband_assignments WHERE child_event_entry_id = ?',
      [entryIdemId]
    );
    assert.strictEqual(idemAssignCount?.count, 1, 'Retry must not create a duplicate assignment row');
    passedScenarios++;
    console.log('  [PASS] Scenario 25: retry creates no second assignment');

    // Scenario 26: same key with different payload rejected (409)
    const res26 = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${checkInWorkerToken}` },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry2Id, // different child entry!
        wristbandId: wbIdem.id,
        idempotencyKey: idempotencyTestKey
      })
    });
    assert.strictEqual(res26.status, 409, 'Reusing idempotency key for different payload must return 409');
    const data26 = await res26.json();
    assert.strictEqual(data26.code, 'IDEMPOTENCY_CONFLICT');
    passedScenarios++;
    console.log('  [PASS] Scenario 26: same key with different payload rejected');

    console.log('\n--- AUDIT SCENARIOS ---');

    // Scenario 27: provision action audited
    const provisionAudit = await queryOne<any>(
      "SELECT * FROM audit_logs WHERE action = 'WRISTBAND_PROVISIONED' AND target_id = ?",
      [data1.wristband.id]
    );
    assert.ok(provisionAudit, 'WRISTBAND_PROVISIONED audit log must exist');
    assert.strictEqual(provisionAudit.user_id, adminUserId);
    assert.strictEqual(provisionAudit.target_type, 'wristband');
    const provDetails = JSON.parse(provisionAudit.details);
    assert.strictEqual(provDetails.eventId, testEvent1Id);
    assert.strictEqual(provDetails.nfcUid, '04A1B2C1');
    passedScenarios++;
    console.log('  [PASS] Scenario 27: provision action audited');

    // Scenario 28: bind action audited
    const bindAudit = await queryOne<any>(
      "SELECT * FROM audit_logs WHERE action = 'WRISTBAND_BOUND' AND target_id = ?",
      [data12.assignment.id]
    );
    assert.ok(bindAudit, 'WRISTBAND_BOUND audit log must exist');
    assert.strictEqual(bindAudit.user_id, checkInWorkerUserId);
    assert.strictEqual(bindAudit.target_type, 'child_wristband_assignment');
    const bindDetails = JSON.parse(bindAudit.details);
    assert.strictEqual(bindDetails.eventId, testEvent1Id);
    assert.strictEqual(bindDetails.childEventEntryId, entry1Id);
    assert.strictEqual(bindDetails.wristbandId, data1.wristband.id);
    passedScenarios++;
    console.log('  [PASS] Scenario 28: bind action audited');

    console.log('\n================================================================');
    console.log(`ALL ${passedScenarios}/28 PHASE 2A REGRESSION SCENARIOS PASSED SUCCESSFULLY`);
    console.log('================================================================\n');

  } finally {
    // Teardown test server
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Clean up test data
    try {
      await execute('DELETE FROM wristband_binding_idempotency WHERE event_id IN (?, ?)', [testEvent1Id, testEvent2Id]);
      await execute('DELETE FROM child_wristband_assignments WHERE event_id IN (?, ?)', [testEvent1Id, testEvent2Id]);
      await execute('DELETE FROM wristbands WHERE event_id IN (?, ?)', [testEvent1Id, testEvent2Id]);
      await execute('DELETE FROM event_wristband_sequences WHERE event_id IN (?, ?)', [testEvent1Id, testEvent2Id]);
      await execute('DELETE FROM event_duty_assignments WHERE event_id IN (?, ?)', [testEvent1Id, testEvent2Id]);
      await execute('DELETE FROM child_event_entries WHERE event_id IN (?, ?)', [testEvent1Id, testEvent2Id]);
      await execute('DELETE FROM children WHERE parent_profile_id = ?', [parentProfileId]);
      await execute('DELETE FROM parent_profiles WHERE id = ?', [parentProfileId]);
      await execute('DELETE FROM volunteer_profiles WHERE user_id IN (?, ?, ?)', [checkInWorkerUserId, normalVolUserId, unauthorizedVolUserId]);
      await execute('DELETE FROM users WHERE id IN (?, ?, ?, ?, ?, ?)', [
        adminUserId, superAdminUserId, checkInWorkerUserId, normalVolUserId, unauthorizedVolUserId, parentUserId
      ]);
      await execute('DELETE FROM events WHERE id IN (?, ?, ?)', [testEvent1Id, testEvent2Id, inactiveEventId]);
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }
  }
}

runTgaPhase2aWristbandApiTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[FATAL TEST FAILURE]:', err);
    process.exit(1);
  });
