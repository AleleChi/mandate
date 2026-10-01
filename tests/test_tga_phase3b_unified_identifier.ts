import assert from 'assert';
import http from 'http';
import express from 'express';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import adminRoutes from '../src/server/routes/admin';
import volunteerRoutes from '../src/server/routes/volunteer';
import {
  provisionWristband,
  bindWristbandToChild,
  replaceWristband,
  updateWristbandStatus,
  resolveEventChildIdentifier,
  WristbandDomainError
} from '../src/server/services/wristbandService';

async function runTgaPhase3bUnifiedIdentifierTests() {
  console.log('================================================================');
  console.log('TGA 2026 — PHASE 3B VERIFICATION TEST SUITE');
  console.log('Unified Child Identifier Resolver Backend & Integration Contract');
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

  // Test IDs
  const testEvent1Id = `ev-3b-1-${testRunId}`;
  const testEvent2Id = `ev-3b-2-${testRunId}`;

  const adminUserId = `usr-admin-3b-${testRunId}`;
  const checkInWorkerUserId = `usr-worker-3b-${testRunId}`;
  const unauthVolUserId = `usr-unauth-3b-${testRunId}`;

  const child1Id = `ch-3b-1-${testRunId}`;
  const child2Id = `ch-3b-2-${testRunId}`;
  const child3Id = `ch-3b-3-${testRunId}`;
  const child4Id = `ch-3b-4-${testRunId}`;
  const child5Id = `ch-3b-5-${testRunId}`;
  const childEvent2Id = `ch-3b-ev2-${testRunId}`;

  const entry1Id = `ent-3b-1-${testRunId}`;
  const entry2Id = `ent-3b-2-${testRunId}`;
  const entry3Id = `ent-3b-3-${testRunId}`;
  const entry4Id = `ent-3b-4-${testRunId}`;
  const entry5Id = `ent-3b-5-${testRunId}`;
  const entryEvent2Id = `ent-3b-ev2-${testRunId}`;

  const pass1Ref = `KOI-2026-3B1${testRunId.slice(-3)}`;
  const pass2Ref = `KOI-2026-3B2${testRunId.slice(-3)}`;
  const pass3Ref = `KOI-2026-3B3${testRunId.slice(-3)}`;
  const pass4Ref = `KOI-2026-3B4${testRunId.slice(-3)}`;
  const pass5Ref = `KOI-2026-3B5${testRunId.slice(-3)}`;
  const passEvent2Ref = `KOI-2026-3BEV2${testRunId.slice(-2)}`;

  let band1: any;
  let bandUnassigned: any;
  let bandLost: any;
  let bandDamaged: any;
  let bandDecom: any;
  let bandOld3: any;
  let bandRep3: any;
  let band4: any;
  let band5: any;
  let bandEvent2: any;

  const priorCurrentEvents = await query<{ id: string }>("SELECT id FROM events WHERE status = 'current'");
  await execute("UPDATE events SET status = 'upcoming' WHERE status = 'current'");

  try {
    // -----------------------------------------------------------------
    // FIXTURE SETUP
    // -----------------------------------------------------------------
    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'TGA 2026 Resolution Event 1', 'current', ?, ?)
    `, [testEvent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'TGA 2026 Resolution Event 2', 'upcoming', ?, ?)
    `, [testEvent2Id, nowIso, nowIso]);

    // Users
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'admin', 'active', ?, ?)
    `, [adminUserId, `admin-3b-${testRunId}@tga-test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 'active', ?, ?)
    `, [checkInWorkerUserId, `worker-3b-${testRunId}@tga-test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 'active', ?, ?)
    `, [unauthVolUserId, `unauth-3b-${testRunId}@tga-test.org`, nowIso, nowIso]);

    // Profiles & Duty
    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Check-in Desk Worker', '08011112222', '08011112222', 'check_in', 'approved', ?, ?)
    `, [`vprof-worker-${testRunId}`, checkInWorkerUserId, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Hospitality Volunteer', '08033334444', '08033334444', 'hospitality', 'approved', ?, ?)
    `, [`vprof-unauth-${testRunId}`, unauthVolUserId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_duty_assignments (
        id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'check_in_desk', 'check_in', 'primary', 'scheduled', '2026-11-18T08:00:00Z', '2026-11-18T18:00:00Z', ?, ?)
    `, [`duty-worker-${testRunId}`, testEvent1Id, checkInWorkerUserId, nowIso, nowIso]);

    // Parent
    const parentId = `p-3b-${testRunId}`;
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Grace Parent', '08012345678', ?, ?)
    `, [parentId, adminUserId, nowIso, nowIso]);

    // Children & Entries
    const childrenSetup = [
      { cId: child1Id, eId: entry1Id, pRef: pass1Ref, evId: testEvent1Id, name: 'Toby Fox' },
      { cId: child2Id, eId: entry2Id, pRef: pass2Ref, evId: testEvent1Id, name: 'Alice Smith' },
      { cId: child3Id, eId: entry3Id, pRef: pass3Ref, evId: testEvent1Id, name: 'Bob Jones' },
      { cId: child4Id, eId: entry4Id, pRef: pass4Ref, evId: testEvent1Id, name: 'Charlie Day' },
      { cId: child5Id, eId: entry5Id, pRef: pass5Ref, evId: testEvent1Id, name: 'Diana Prince' },
      { cId: childEvent2Id, eId: entryEvent2Id, pRef: passEvent2Ref, evId: testEvent2Id, name: 'Cross Child' },
    ];

    for (const c of childrenSetup) {
      await execute(`
        INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
        VALUES (?, ?, ?, 'Male', '2018-05-15', 8, 'Ages 7 to 9', ?, ?)
      `, [c.cId, parentId, c.name, nowIso, nowIso]);

      await execute(`
        INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
        VALUES (?, ?, ?, 'pass_ready', ?, ?)
      `, [c.eId, c.evId, c.cId, nowIso, nowIso]);

      await execute(`
        INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
      `, [`pass-${c.cId}`, c.eId, c.pRef, `hash-${c.cId}`, nowIso, nowIso, nowIso]);
    }

    // Wristbands Provisioning
    band1 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:3B:01:${testRunId.slice(-2)}`,
      actor: { id: adminUserId, role: 'admin' }
    });

    bandUnassigned = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:3B:02:${testRunId.slice(-2)}`,
      actor: { id: adminUserId, role: 'admin' }
    });

    bandLost = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:3B:03:${testRunId.slice(-2)}`,
      actor: { id: adminUserId, role: 'admin' }
    });
    await updateWristbandStatus(bandLost.id, 'lost');

    bandDamaged = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:3B:04:${testRunId.slice(-2)}`,
      actor: { id: adminUserId, role: 'admin' }
    });
    await updateWristbandStatus(bandDamaged.id, 'damaged');

    bandDecom = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:3B:05:${testRunId.slice(-2)}`,
      actor: { id: adminUserId, role: 'admin' }
    });
    await updateWristbandStatus(bandDecom.id, 'decommissioned');

    bandOld3 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:3B:33:${testRunId.slice(-2)}`,
      actor: { id: adminUserId, role: 'admin' }
    });

    bandRep3 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:3B:34:${testRunId.slice(-2)}`,
      actor: { id: adminUserId, role: 'admin' }
    });

    band4 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:3B:44:${testRunId.slice(-2)}`,
      actor: { id: adminUserId, role: 'admin' }
    });

    band5 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:3B:55:${testRunId.slice(-2)}`,
      actor: { id: adminUserId, role: 'admin' }
    });

    bandEvent2 = await provisionWristband({
      eventId: testEvent2Id,
      nfcUid: `04:3B:99:${testRunId.slice(-2)}`,
      wristbandCode: `WB-EV2-${testRunId}`,
      actor: { id: adminUserId, role: 'admin' }
    });

    // Bind band1 to entry1Id
    await bindWristbandToChild({
      eventId: testEvent1Id,
      childEventEntryId: entry1Id,
      wristbandId: band1.id,
      actor: { id: checkInWorkerUserId, role: 'volunteer' }
    });

    // Bind bandOld3 to entry3Id
    await bindWristbandToChild({
      eventId: testEvent1Id,
      childEventEntryId: entry3Id,
      wristbandId: bandOld3.id,
      actor: { id: checkInWorkerUserId, role: 'volunteer' }
    });

    // Replace bandOld3 with bandRep3 (requires admin or check-in lead)
    await replaceWristband({
      eventId: testEvent1Id,
      childEventEntryId: entry3Id,
      currentWristbandId: bandOld3.id,
      replacementWristbandId: bandRep3.id,
      reason: 'lost',
      actor: { id: adminUserId, role: 'admin' }
    });

    // Bind band4 to entry4Id
    await bindWristbandToChild({
      eventId: testEvent1Id,
      childEventEntryId: entry4Id,
      wristbandId: band4.id,
      actor: { id: checkInWorkerUserId, role: 'volunteer' }
    });

    // Bind band5 to entry5Id
    await bindWristbandToChild({
      eventId: testEvent1Id,
      childEventEntryId: entry5Id,
      wristbandId: band5.id,
      actor: { id: checkInWorkerUserId, role: 'volunteer' }
    });

    const checkInWorkerToken = generateToken(checkInWorkerUserId);

    // =================================================================
    // SCENARIOS EXECUTION
    // =================================================================

    console.log('--- RESOLUTION IDENTIFIER CORE SCENARIOS ---');

    // Scenario 1: valid pass resolves child
    const res1 = await resolveEventChildIdentifier(testEvent1Id, pass1Ref);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.identifierType, 'pass');
    assert.strictEqual(res1.childEventEntryId, entry1Id);
    assert.strictEqual(res1.eventId, testEvent1Id);
    passedScenarios++;
    console.log('  [PASS] Scenario 1: valid pass resolves child');

    // Scenario 2: valid wristband code resolves same child
    const res2 = await resolveEventChildIdentifier(testEvent1Id, band1.wristband_code);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.identifierType, 'wristband_code');
    assert.strictEqual(res2.childEventEntryId, entry1Id);
    assert.strictEqual(res2.wristbandId, band1.id);
    passedScenarios++;
    console.log('  [PASS] Scenario 2: valid wristband code resolves same child');

    // Scenario 3: valid NFC UID resolves same child
    const res3 = await resolveEventChildIdentifier(testEvent1Id, band1.nfc_uid);
    assert.strictEqual(res3.success, true);
    assert.strictEqual(res3.identifierType, 'nfc_uid');
    assert.strictEqual(res3.childEventEntryId, entry1Id);
    assert.strictEqual(res3.wristbandId, band1.id);
    passedScenarios++;
    console.log('  [PASS] Scenario 3: valid NFC UID resolves same child');

    // Scenario 4: all three return same child_event_entry_id
    assert.strictEqual(res1.childEventEntryId, res2.childEventEntryId);
    assert.strictEqual(res2.childEventEntryId, res3.childEventEntryId);
    assert.strictEqual(res1.childEventEntryId, entry1Id);
    passedScenarios++;
    console.log('  [PASS] Scenario 4: all three return same child_event_entry_id');

    console.log('\n--- EVENT ISOLATION SCENARIOS ---');

    // Scenario 5: wrong-event pass rejected
    try {
      await resolveEventChildIdentifier(testEvent1Id, passEvent2Ref);
      assert.fail('Pass from Event 2 must not resolve in Event 1');
    } catch (err: any) {
      assert(err instanceof WristbandDomainError);
      assert.strictEqual(err.code, 'WRONG_EVENT');
      passedScenarios++;
      console.log('  [PASS] Scenario 5: wrong-event pass rejected');
    }

    // Scenario 6: wrong-event wristband code rejected
    try {
      await resolveEventChildIdentifier(testEvent1Id, bandEvent2.wristband_code);
      assert.fail('Wristband code from Event 2 must not resolve in Event 1');
    } catch (err: any) {
      assert(err instanceof WristbandDomainError);
      assert.strictEqual(err.code, 'WRONG_EVENT');
      passedScenarios++;
      console.log('  [PASS] Scenario 6: wrong-event wristband code rejected');
    }

    // Scenario 7: wrong-event NFC rejected
    try {
      await resolveEventChildIdentifier(testEvent1Id, bandEvent2.nfc_uid);
      assert.fail('NFC from Event 2 must not resolve in Event 1');
    } catch (err: any) {
      assert(err instanceof WristbandDomainError);
      assert.strictEqual(err.code, 'WRONG_EVENT');
      passedScenarios++;
      console.log('  [PASS] Scenario 7: wrong-event NFC rejected');
    }

    console.log('\n--- INVENTORY STATUS & LIFECYCLE SCENARIOS ---');

    // Scenario 8: unassigned wristband returns controlled state (WRISTBAND_UNASSIGNED)
    try {
      await resolveEventChildIdentifier(testEvent1Id, bandUnassigned.wristband_code);
      assert.fail('Unassigned wristband code must not resolve child');
    } catch (err: any) {
      assert(err instanceof WristbandDomainError);
      assert.strictEqual(err.code, 'WRISTBAND_UNASSIGNED');
      passedScenarios++;
      console.log('  [PASS] Scenario 8: unassigned wristband returns controlled state');
    }

    // Scenario 9: lost wristband does not resolve active child
    try {
      await resolveEventChildIdentifier(testEvent1Id, bandLost.wristband_code);
      assert.fail('Lost wristband must not resolve child');
    } catch (err: any) {
      assert(err instanceof WristbandDomainError);
      assert.strictEqual(err.code, 'WRISTBAND_LOST');
      passedScenarios++;
      console.log('  [PASS] Scenario 9: lost wristband does not resolve active child');
    }

    // Scenario 10: damaged wristband does not resolve active child
    try {
      await resolveEventChildIdentifier(testEvent1Id, bandDamaged.wristband_code);
      assert.fail('Damaged wristband must not resolve child');
    } catch (err: any) {
      assert(err instanceof WristbandDomainError);
      assert.strictEqual(err.code, 'WRISTBAND_DAMAGED');
      passedScenarios++;
      console.log('  [PASS] Scenario 10: damaged wristband does not resolve active child');
    }

    // Scenario 11: decommissioned wristband does not resolve active child
    try {
      await resolveEventChildIdentifier(testEvent1Id, bandDecom.wristband_code);
      assert.fail('Decommissioned wristband must not resolve child');
    } catch (err: any) {
      assert(err instanceof WristbandDomainError);
      assert.strictEqual(err.code, 'WRISTBAND_DECOMMISSIONED');
      passedScenarios++;
      console.log('  [PASS] Scenario 11: decommissioned wristband does not resolve active child');
    }

    // Scenario 12: replaced old band no longer resolves child
    try {
      await resolveEventChildIdentifier(testEvent1Id, bandOld3.nfc_uid);
      assert.fail('Replaced old wristband must not resolve child');
    } catch (err: any) {
      assert(err instanceof WristbandDomainError);
      assert(err.code === 'WRISTBAND_LOST' || err.code === 'WRISTBAND_UNASSIGNED');
      passedScenarios++;
      console.log('  [PASS] Scenario 12: replaced old band no longer resolves child');
    }

    // Scenario 13: replacement band resolves child
    const res13 = await resolveEventChildIdentifier(testEvent1Id, bandRep3.nfc_uid);
    assert.strictEqual(res13.success, true);
    assert.strictEqual(res13.childEventEntryId, entry3Id);
    assert.strictEqual(res13.wristbandId, bandRep3.id);
    passedScenarios++;
    console.log('  [PASS] Scenario 13: replacement band resolves child');

    console.log('\n--- SANITIZATION & UNKNOWN IDENTIFIER SCENARIOS ---');

    // Scenario 14: malformed NFC rejected
    try {
      await resolveEventChildIdentifier(testEvent1Id, '123-XYZ', { identifierType: 'nfc_uid' });
      assert.fail('Malformed NFC must be rejected');
    } catch (err: any) {
      assert(err instanceof WristbandDomainError);
      assert.strictEqual(err.code, 'INVALID_NFC_UID');
      passedScenarios++;
      console.log('  [PASS] Scenario 14: malformed NFC rejected');
    }

    // Scenario 15: unknown identifier rejected
    try {
      await resolveEventChildIdentifier(testEvent1Id, 'TOTALLY_RANDOM_UNKNOWN_999');
      assert.fail('Unknown identifier must be rejected');
    } catch (err: any) {
      assert(err instanceof WristbandDomainError);
      assert.strictEqual(err.code, 'IDENTIFIER_NOT_FOUND');
      passedScenarios++;
      console.log('  [PASS] Scenario 15: unknown identifier rejected');
    }

    console.log('\n--- BACKWARD COMPATIBILITY & CHECK-IN REUSE SCENARIOS ---');

    // Scenario 16: existing pass lookup still works
    const resPassLookup = await fetch(`${baseUrl}/api/volunteer/pass/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${checkInWorkerToken}`
      },
      body: JSON.stringify({ passReference: pass1Ref })
    });
    assert.strictEqual(resPassLookup.status, 200);
    const dataPassLookup = await resPassLookup.json();
    assert.strictEqual(dataPassLookup.success, true);
    assert.strictEqual(dataPassLookup.child.entryId, entry1Id);
    assert.strictEqual(dataPassLookup.child.fullName, 'Toby Fox');
    passedScenarios++;
    console.log('  [PASS] Scenario 16: existing pass lookup still works');

    // Scenario 17: existing check-in still works after pass resolution
    // 1. Resolve child entry via pass
    const resolvedPass = await resolveEventChildIdentifier(testEvent1Id, pass1Ref);
    assert.strictEqual(resolvedPass.childEventEntryId, entry1Id);
    // 2. Consume resolved childEventEntryId in existing /check-in endpoint
    const resCheckInPass = await fetch(`${baseUrl}/api/volunteer/check-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${checkInWorkerToken}`
      },
      body: JSON.stringify({ childEventEntryId: resolvedPass.childEventEntryId })
    });
    assert.strictEqual(resCheckInPass.status, 200);
    const dataCheckInPass = await resCheckInPass.json();
    assert.strictEqual(dataCheckInPass.success, true);
    assert.strictEqual(dataCheckInPass.child.entryStatus, 'checked_in');
    passedScenarios++;
    console.log('  [PASS] Scenario 17: existing check-in still works after pass resolution');

    // Scenario 18: existing check-in still works after wristband-code resolution
    // 1. Resolve child entry via wristband code
    const resolvedCode = await resolveEventChildIdentifier(testEvent1Id, band4.wristband_code);
    assert.strictEqual(resolvedCode.childEventEntryId, entry4Id);
    // 2. Consume resolved childEventEntryId in existing /check-in endpoint
    const resCheckInCode = await fetch(`${baseUrl}/api/volunteer/check-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${checkInWorkerToken}`
      },
      body: JSON.stringify({ childEventEntryId: resolvedCode.childEventEntryId })
    });
    assert.strictEqual(resCheckInCode.status, 200);
    const dataCheckInCode = await resCheckInCode.json();
    assert.strictEqual(dataCheckInCode.success, true);
    assert.strictEqual(dataCheckInCode.child.entryStatus, 'checked_in');
    passedScenarios++;
    console.log('  [PASS] Scenario 18: existing check-in still works after wristband-code resolution');

    // Scenario 19: existing check-in still works after NFC resolution
    // 1. Resolve child entry via NFC UID
    const resolvedNfc = await resolveEventChildIdentifier(testEvent1Id, band5.nfc_uid);
    assert.strictEqual(resolvedNfc.childEventEntryId, entry5Id);
    // 2. Consume resolved childEventEntryId in existing /check-in endpoint
    const resCheckInNfc = await fetch(`${baseUrl}/api/volunteer/check-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${checkInWorkerToken}`
      },
      body: JSON.stringify({ childEventEntryId: resolvedNfc.childEventEntryId })
    });
    assert.strictEqual(resCheckInNfc.status, 200);
    const dataCheckInNfc = await resCheckInNfc.json();
    assert.strictEqual(dataCheckInNfc.success, true);
    assert.strictEqual(dataCheckInNfc.child.entryStatus, 'checked_in');
    passedScenarios++;
    console.log('  [PASS] Scenario 19: existing check-in still works after NFC resolution');

    // Scenario 20: already-checked-in child resolves without duplicate attendance
    // Child 1 was checked in during scenario 17.
    // 1. Resolver still successfully resolves already-checked-in child
    const resAlreadyCheckedInResolve = await resolveEventChildIdentifier(testEvent1Id, band1.nfc_uid);
    assert.strictEqual(resAlreadyCheckedInResolve.success, true);
    assert.strictEqual(resAlreadyCheckedInResolve.childEventEntryId, entry1Id);
    assert.strictEqual(resAlreadyCheckedInResolve.childStatus, 'checked_in');

    // 2. Check current attendance record count
    const initialAttendanceRows = await query(
      'SELECT id FROM attendance_records WHERE child_event_entry_id = ?',
      [entry1Id]
    );
    assert.strictEqual(initialAttendanceRows.length, 1, 'Child should have exactly 1 attendance record');

    // 3. Re-invoke check-in with resolved entry id
    const resSecondCheckIn = await fetch(`${baseUrl}/api/volunteer/check-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${checkInWorkerToken}`
      },
      body: JSON.stringify({ childEventEntryId: resAlreadyCheckedInResolve.childEventEntryId })
    });
    assert.strictEqual(resSecondCheckIn.status, 200);
    const dataSecondCheckIn = await resSecondCheckIn.json();
    assert.strictEqual(dataSecondCheckIn.success, true);
    assert.strictEqual(dataSecondCheckIn.alreadyCheckedIn, true);

    // 4. Verify NO second attendance record was created
    const finalAttendanceRows = await query(
      'SELECT id FROM attendance_records WHERE child_event_entry_id = ?',
      [entry1Id]
    );
    assert.strictEqual(finalAttendanceRows.length, 1, 'Attendance records must remain exactly 1');
    passedScenarios++;
    console.log('  [PASS] Scenario 20: already-checked-in child resolves without duplicate attendance');

    console.log('\n================================================================');
    console.log(`ALL ${passedScenarios}/20 PHASE 3B SCENARIOS PASSED SUCCESSFULLY`);
    console.log('================================================================\n');

  } finally {
    // Restore current event
    await execute("UPDATE events SET status = 'upcoming' WHERE id IN (?, ?)", [testEvent1Id, testEvent2Id]);
    if (priorCurrentEvents && priorCurrentEvents.length > 0) {
      await execute("UPDATE events SET status = 'current' WHERE id = ?", [priorCurrentEvents[0].id]);
    }
    server.close();
  }
}

runTgaPhase3bUnifiedIdentifierTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[FAIL] Phase 3B Test Suite Failed:\n', err);
    process.exit(1);
  });
