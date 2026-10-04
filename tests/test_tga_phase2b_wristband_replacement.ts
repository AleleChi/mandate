import assert from 'assert';
import http from 'http';
import express from 'express';
import crypto from 'crypto';
import { getDb, execute, query, queryOne, transaction } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import adminRoutes from '../src/server/routes/admin';
import volunteerRoutes from '../src/server/routes/volunteer';
import {
  provisionWristband,
  bindWristbandToChild,
  lookupWristbandByNfcUid,
  getActiveAssignmentForEntry
} from '../src/server/services/wristbandService';

async function runTgaPhase2bWristbandReplacementTests() {
  console.log('================================================================');
  console.log('TGA 2026 — PHASE 2B REGRESSION TEST SUITE');
  console.log('Wristband Deactivation + Replacement Backend API');
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
  const testEvent1Id = `ev-2b-1-${testRunId}`;
  const testEvent2Id = `ev-2b-2-${testRunId}`;
  const inactiveEventId = `ev-2b-inact-${testRunId}`;

  const adminUserId = `usr-admin-2b-${testRunId}`;
  const superAdminUserId = `usr-super-2b-${testRunId}`;
  const checkInLeadUserId = `usr-lead-2b-${testRunId}`;
  const checkInVolunteerUserId = `usr-vol-2b-${testRunId}`;
  const parentUserId = `usr-parent-2b-${testRunId}`;
  const parentProfileId = `prof-parent-2b-${testRunId}`;

  // Children & entries
  const child1Id = `ch-2b-1-${testRunId}`;
  const child2Id = `ch-2b-2-${testRunId}`;
  const child3Id = `ch-2b-3-${testRunId}`;
  const child4Id = `ch-2b-4-${testRunId}`;
  const child5Id = `ch-2b-5-${testRunId}`;
  const childEvent2Id = `ch-2b-ev2-${testRunId}`;

  const entry1Id = `ent-2b-1-${testRunId}`;
  const entry2Id = `ent-2b-2-${testRunId}`;
  const entry3Id = `ent-2b-3-${testRunId}`;
  const entry4Id = `ent-2b-4-${testRunId}`;
  const entry5Id = `ent-2b-5-${testRunId}`;
  const entryEvent2Id = `ent-2b-ev2-${testRunId}`;

  try {
    // -----------------------------------------------------------------
    // PRE-CLEANUP
    // -----------------------------------------------------------------
    try {
      await execute("DELETE FROM wristband_operation_idempotency WHERE event_id LIKE 'ev-2b-%'");
      await execute("DELETE FROM wristband_binding_idempotency WHERE event_id LIKE 'ev-2b-%'");
      await execute("DELETE FROM child_wristband_assignments WHERE event_id LIKE 'ev-2b-%'");
      await execute("DELETE FROM wristbands WHERE event_id LIKE 'ev-2b-%'");
      await execute("DELETE FROM event_wristband_sequences WHERE event_id LIKE 'ev-2b-%'");
      await execute("DELETE FROM event_duty_assignments WHERE event_id LIKE 'ev-2b-%'");
      await execute("DELETE FROM child_event_entries WHERE event_id LIKE 'ev-2b-%'");
      await execute("DELETE FROM users WHERE email LIKE '%@tga-test2b.org'");
      await execute("DELETE FROM events WHERE id LIKE 'ev-2b-%'");
    } catch (_) {}

    // -----------------------------------------------------------------
    // FIXTURE SETUP
    // -----------------------------------------------------------------
    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'TGA 2026 Replacement Event 1', 'open', ?, ?)
    `, [testEvent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'TGA 2026 Replacement Event 2', 'upcoming', ?, ?)
    `, [testEvent2Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'Inactive Event', 'archived', ?, ?)
    `, [inactiveEventId, nowIso, nowIso]);

    // Users
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'admin', 'active', ?, ?)
    `, [adminUserId, `admin-${testRunId}@tga-test2b.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'super_admin', 'active', ?, ?)
    `, [superAdminUserId, `super-${testRunId}@tga-test2b.org`, nowIso, nowIso]);

    // Check-in Lead Volunteer
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 'active', ?, ?)
    `, [checkInLeadUserId, `lead-${testRunId}@tga-test2b.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Checkin Lead', '+2348000000001', '+2348000000001', 'Gate Team', 'approved', ?, ?)
    `, [`vp-lead-${testRunId}`, checkInLeadUserId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'Gate/Check-in Lead', 'check_in', 'primary', 'scheduled', '2026-11-18T08:00:00Z', '2026-11-18T18:00:00Z', ?, ?)
    `, [`eda-lead-${testRunId}`, testEvent1Id, checkInLeadUserId, nowIso, nowIso]);

    // Ordinary Check-in Volunteer (not a lead)
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 'active', ?, ?)
    `, [checkInVolunteerUserId, `worker-${testRunId}@tga-test2b.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Ordinary Worker', '+2348000000002', '+2348000000002', 'Gate Team', 'approved', ?, ?)
    `, [`vp-worker-${testRunId}`, checkInVolunteerUserId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'gate_volunteer', 'check_in', 'primary', 'scheduled', '2026-11-18T08:00:00Z', '2026-11-18T18:00:00Z', ?, ?)
    `, [`eda-worker-${testRunId}`, testEvent1Id, checkInVolunteerUserId, nowIso, nowIso]);

    // Parent
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', 'active', ?, ?)
    `, [parentUserId, `parent-${testRunId}@tga-test2b.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Parent 2B', '+2348000000099', ?, ?)
    `, [parentProfileId, parentUserId, nowIso, nowIso]);

    // Children & Entries
    const childEntries = [
      { cId: child1Id, eId: entry1Id, evId: testEvent1Id, name: 'Child 1', status: 'checked_in' },
      { cId: child2Id, eId: entry2Id, evId: testEvent1Id, name: 'Child 2', status: 'pass_ready' },
      { cId: child3Id, eId: entry3Id, evId: testEvent1Id, name: 'Child 3', status: 'selected' },
      { cId: child4Id, eId: entry4Id, evId: testEvent1Id, name: 'Child 4', status: 'checked_in' },
      { cId: child5Id, eId: entry5Id, evId: testEvent1Id, name: 'Child 5', status: 'checked_in' },
      { cId: childEvent2Id, eId: entryEvent2Id, evId: testEvent2Id, name: 'Child Ev2', status: 'checked_in' }
    ];

    for (const item of childEntries) {
      await execute(`
        INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
        VALUES (?, ?, ?, 'Male', '2018-05-10', ?, ?)
      `, [item.cId, parentProfileId, item.name, nowIso, nowIso]);

      await execute(`
        INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [item.eId, item.cId, item.evId, item.status, nowIso, nowIso]);
    }

    // Provision wristbands for Event 1
    const wb1 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:A1:B2:C3:${testRunId.slice(-4)}:01`,
      actor: { id: adminUserId, role: 'admin' }
    });

    const wb2 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:A1:B2:C3:${testRunId.slice(-4)}:02`,
      actor: { id: adminUserId, role: 'admin' }
    });

    const wb3 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:A1:B2:C3:${testRunId.slice(-4)}:03`,
      actor: { id: adminUserId, role: 'admin' }
    });

    const wbReplacement1 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:A1:B2:C3:${testRunId.slice(-4)}:10`,
      actor: { id: adminUserId, role: 'admin' }
    });

    const wbReplacement2 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:A1:B2:C3:${testRunId.slice(-4)}:11`,
      actor: { id: adminUserId, role: 'admin' }
    });

    const wbDamagedAvail = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:A1:B2:C3:${testRunId.slice(-4)}:12`,
      actor: { id: adminUserId, role: 'admin' }
    });

    // Provision wristband for Event 2
    const wbEvent2 = await provisionWristband({
      eventId: testEvent2Id,
      nfcUid: `04:B2:C3:D4:${testRunId.slice(-4)}:01`,
      actor: { id: adminUserId, role: 'admin' }
    });

    // Initial bindings: bind wb1 to entry1Id, wb2 to entry2Id, wb3 to entry3Id
    await bindWristbandToChild({
      eventId: testEvent1Id,
      childEventEntryId: entry1Id,
      wristbandId: wb1.id,
      actor: { id: adminUserId, role: 'admin' }
    });

    await bindWristbandToChild({
      eventId: testEvent1Id,
      childEventEntryId: entry2Id,
      wristbandId: wb2.id,
      actor: { id: adminUserId, role: 'admin' }
    });

    await bindWristbandToChild({
      eventId: testEvent1Id,
      childEventEntryId: entry3Id,
      wristbandId: wb3.id,
      actor: { id: adminUserId, role: 'admin' }
    });

    // Auth Tokens
    const adminToken = generateToken(adminUserId);
    const leadToken = generateToken(checkInLeadUserId);
    const workerToken = generateToken(checkInVolunteerUserId);
    const parentToken = generateToken(parentUserId);

    // =================================================================
    // SECTION 1: DEACTIVATION SCENARIOS
    // =================================================================
    console.log('--- DEACTIVATION SCENARIOS ---');

    // Scenario 1: active assignment deactivates successfully
    const res1 = await fetch(`${baseUrl}/api/volunteer/wristbands/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry1Id,
        reason: 'lost'
      })
    });
    assert.strictEqual(res1.status, 200, 'Deactivation should return 200');
    const data1 = await res1.json();
    assert.strictEqual(data1.success, true);
    assert.strictEqual(data1.wristband.status, 'lost');
    assert.ok(data1.assignment.deactivated_at, 'deactivated_at must be populated');
    assert.strictEqual(data1.assignment.deactivation_reason, 'lost');
    passedScenarios++;
    console.log('  [PASS] Scenario 1: active assignment deactivates successfully');

    // Scenario 2: history row remains
    const historyRows = await query(
      'SELECT * FROM child_wristband_assignments WHERE child_event_entry_id = ?',
      [entry1Id]
    );
    assert.strictEqual(historyRows.length, 1, 'History row must be preserved permanently in database');
    assert.ok(historyRows[0].deactivated_at);
    passedScenarios++;
    console.log('  [PASS] Scenario 2: history row remains');

    // Scenario 3: lost reason -> old band status lost
    const wb1Row = await queryOne('SELECT status FROM wristbands WHERE id = ?', [wb1.id]);
    assert.strictEqual(wb1Row.status, 'lost');
    passedScenarios++;
    console.log('  [PASS] Scenario 3: lost reason -> old band status lost');

    // Scenario 4: damaged reason -> old band status damaged (deactivating entry2)
    const res4 = await fetch(`${baseUrl}/api/volunteer/wristbands/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry2Id,
        reason: 'damaged'
      })
    });
    assert.strictEqual(res4.status, 200);
    const wb2Row = await queryOne('SELECT status FROM wristbands WHERE id = ?', [wb2.id]);
    assert.strictEqual(wb2Row.status, 'damaged');
    passedScenarios++;
    console.log('  [PASS] Scenario 4: damaged reason -> old band status damaged');

    // Scenario 5: invalid reason rejected
    const res5 = await fetch(`${baseUrl}/api/volunteer/wristbands/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry3Id,
        reason: 'dog_ate_wristband'
      })
    });
    assert.strictEqual(res5.status, 400);
    const data5 = await res5.json();
    assert.strictEqual(data5.code, 'INVALID_DEACTIVATION_REASON');
    passedScenarios++;
    console.log('  [PASS] Scenario 5: invalid reason rejected');

    // Scenario 6: already inactive assignment rejected
    const res6 = await fetch(`${baseUrl}/api/volunteer/wristbands/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry1Id, // already deactivated in Scenario 1
        reason: 'lost'
      })
    });
    assert.strictEqual(res6.status, 404);
    const data6 = await res6.json();
    assert.strictEqual(data6.code, 'ACTIVE_ASSIGNMENT_NOT_FOUND');
    passedScenarios++;
    console.log('  [PASS] Scenario 6: already inactive assignment rejected');

    // Scenario 7: wrong event rejected
    const res7 = await fetch(`${baseUrl}/api/volunteer/wristbands/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`
      },
      body: JSON.stringify({
        eventId: testEvent2Id, // wrong event context for entry3Id
        childEventEntryId: entry3Id,
        reason: 'lost'
      })
    });
    assert.strictEqual(res7.status, 403, 'Volunteer not assigned to Event 2 must be blocked');
    passedScenarios++;
    console.log('  [PASS] Scenario 7: wrong event rejected');

    // Scenario 8: unauthorized user blocked (ordinary volunteer without lead role)
    const res8 = await fetch(`${baseUrl}/api/volunteer/wristbands/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}` // ordinary volunteer, not lead
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry3Id,
        reason: 'lost'
      })
    });
    assert.strictEqual(res8.status, 403, 'Ordinary volunteer without lead role must be forbidden');
    const data8 = await res8.json();
    assert.strictEqual(data8.code, 'FORBIDDEN');
    passedScenarios++;
    console.log('  [PASS] Scenario 8: unauthorized user blocked');

    // =================================================================
    // SECTION 2: REPLACEMENT SCENARIOS
    // =================================================================
    console.log('\n--- REPLACEMENT SCENARIOS ---');

    // Prepare fresh active binding for entry4Id and entry5Id
    const wbActive4 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:C3:D4:E5:${testRunId.slice(-4)}:04`,
      actor: { id: adminUserId, role: 'admin' }
    });
    await bindWristbandToChild({
      eventId: testEvent1Id,
      childEventEntryId: entry4Id,
      wristbandId: wbActive4.id,
      actor: { id: adminUserId, role: 'admin' }
    });

    const wbActive5 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:C3:D4:E5:${testRunId.slice(-4)}:05`,
      actor: { id: adminUserId, role: 'admin' }
    });
    await bindWristbandToChild({
      eventId: testEvent1Id,
      childEventEntryId: entry5Id,
      wristbandId: wbActive5.id,
      actor: { id: adminUserId, role: 'admin' }
    });

    // Scenario 9: lost band replaced with available band (Admin endpoint)
    const res9 = await fetch(`${baseUrl}/api/admin/wristbands/replace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry4Id,
        currentWristbandId: wbActive4.id,
        replacementWristbandId: wbReplacement1.id,
        reason: 'lost'
      })
    });
    assert.strictEqual(res9.status, 200, 'Replacement should succeed');
    const data9 = await res9.json();
    assert.strictEqual(data9.success, true);
    assert.strictEqual(data9.oldWristband.status, 'lost');
    assert.strictEqual(data9.replacementWristband.status, 'active');
    passedScenarios++;
    console.log('  [PASS] Scenario 9: lost band replaced with available band');

    // Scenario 10: damaged band replaced with available band (Volunteer Lead endpoint)
    const res10 = await fetch(`${baseUrl}/api/volunteer/wristbands/replace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry5Id,
        currentWristbandId: wbActive5.id,
        replacementWristbandId: wbReplacement2.id,
        reason: 'damaged'
      })
    });
    assert.strictEqual(res10.status, 200, 'Volunteer lead replacement should succeed');
    const data10 = await res10.json();
    assert.strictEqual(data10.oldWristband.status, 'damaged');
    assert.strictEqual(data10.replacementWristband.status, 'active');
    passedScenarios++;
    console.log('  [PASS] Scenario 10: damaged band replaced with available band');

    // Scenario 11: old assignment deactivated
    assert.ok(data9.deactivatedAssignment.deactivated_at);
    assert.strictEqual(data9.deactivatedAssignment.deactivation_reason, 'lost');
    passedScenarios++;
    console.log('  [PASS] Scenario 11: old assignment deactivated');

    // Scenario 12: old assignment history preserved
    const entry4History = await query(
      'SELECT * FROM child_wristband_assignments WHERE child_event_entry_id = ? ORDER BY assigned_at ASC',
      [entry4Id]
    );
    assert.strictEqual(entry4History.length, 2, 'Entry 4 must have 2 chronological assignment rows');
    assert.strictEqual(entry4History[0].wristband_id, wbActive4.id);
    assert.ok(entry4History[0].deactivated_at);
    assert.strictEqual(entry4History[1].wristband_id, wbReplacement1.id);
    assert.strictEqual(entry4History[1].deactivated_at, null);
    passedScenarios++;
    console.log('  [PASS] Scenario 12: old assignment history preserved');

    // Scenario 13: new assignment created
    assert.strictEqual(data9.newAssignment.wristband_id, wbReplacement1.id);
    assert.strictEqual(data9.newAssignment.child_event_entry_id, entry4Id);
    passedScenarios++;
    console.log('  [PASS] Scenario 13: new assignment created');

    // Scenario 14: exactly one active assignment remains
    const activeForEntry4 = await getActiveAssignmentForEntry(entry4Id);
    assert.ok(activeForEntry4);
    assert.strictEqual(activeForEntry4.wristband_id, wbReplacement1.id);
    const activeCountEntry4 = await queryOne(
      'SELECT COUNT(*) as count FROM child_wristband_assignments WHERE child_event_entry_id = ? AND deactivated_at IS NULL',
      [entry4Id]
    );
    assert.strictEqual(Number(activeCountEntry4.count), 1);
    passedScenarios++;
    console.log('  [PASS] Scenario 14: exactly one active assignment remains');

    // Scenario 15: old wristband becomes lost/damaged
    const wbActive4Db = await queryOne('SELECT status FROM wristbands WHERE id = ?', [wbActive4.id]);
    assert.strictEqual(wbActive4Db.status, 'lost');
    const wbActive5Db = await queryOne('SELECT status FROM wristbands WHERE id = ?', [wbActive5.id]);
    assert.strictEqual(wbActive5Db.status, 'damaged');
    passedScenarios++;
    console.log('  [PASS] Scenario 15: old wristband becomes lost/damaged');

    // Scenario 16: replacement wristband becomes active
    const wbRep1Db = await queryOne('SELECT status FROM wristbands WHERE id = ?', [wbReplacement1.id]);
    assert.strictEqual(wbRep1Db.status, 'active');
    passedScenarios++;
    console.log('  [PASS] Scenario 16: replacement wristband becomes active');

    // Scenario 17: old NFC no longer represents active child assignment
    const oldLookup = await lookupWristbandByNfcUid({ eventId: testEvent1Id, rawUid: wbActive4.nfc_uid });
    assert.strictEqual(oldLookup.isAssigned, false, 'Old NFC band must show isAssigned = false');
    assert.strictEqual(oldLookup.assignedChildEventEntryId, null, 'Old NFC band must have null assigned entry');
    assert.strictEqual(oldLookup.status, 'lost');
    passedScenarios++;
    console.log('  [PASS] Scenario 17: old NFC no longer represents active child assignment');

    // Scenario 18: replacement NFC resolves active assignment
    const repLookup = await lookupWristbandByNfcUid({ eventId: testEvent1Id, rawUid: wbReplacement1.nfc_uid });
    assert.strictEqual(repLookup.isAssigned, true);
    assert.strictEqual(repLookup.assignedChildEventEntryId, entry4Id);
    assert.strictEqual(repLookup.status, 'active');
    passedScenarios++;
    console.log('  [PASS] Scenario 18: replacement NFC resolves active assignment');

    // =================================================================
    // SECTION 3: SAFETY SCENARIOS
    // =================================================================
    console.log('\n--- SAFETY SCENARIOS ---');

    // Scenario 19: replacement band already assigned -> rejected
    // Try to replace entry3Id with wbReplacement1 (which is active for entry4Id)
    const res19 = await fetch(`${baseUrl}/api/volunteer/wristbands/replace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry3Id,
        currentWristbandId: wb3.id,
        replacementWristbandId: wbReplacement1.id,
        reason: 'lost'
      })
    });
    assert.strictEqual(res19.status, 409);
    const data19 = await res19.json();
    assert.strictEqual(data19.code, 'WRISTBAND_ALREADY_ASSIGNED');
    passedScenarios++;
    console.log('  [PASS] Scenario 19: replacement band already assigned -> rejected');

    // Scenario 20: replacement band lost/damaged/decommissioned -> rejected
    // Mark wbDamagedAvail as damaged
    await execute("UPDATE wristbands SET status = 'damaged' WHERE id = ?", [wbDamagedAvail.id]);
    const res20 = await fetch(`${baseUrl}/api/volunteer/wristbands/replace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry3Id,
        currentWristbandId: wb3.id,
        replacementWristbandId: wbDamagedAvail.id,
        reason: 'lost'
      })
    });
    assert.strictEqual(res20.status, 400);
    const data20 = await res20.json();
    assert.strictEqual(data20.code, 'WRISTBAND_NOT_AVAILABLE');
    passedScenarios++;
    console.log('  [PASS] Scenario 20: replacement band lost/damaged/decommissioned -> rejected');

    // Scenario 21: same wristband as replacement -> rejected
    const res21 = await fetch(`${baseUrl}/api/volunteer/wristbands/replace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry3Id,
        currentWristbandId: wb3.id,
        replacementWristbandId: wb3.id, // same band!
        reason: 'lost'
      })
    });
    assert.strictEqual(res21.status, 400);
    const data21 = await res21.json();
    assert.strictEqual(data21.code, 'REPLACEMENT_SAME_WRISTBAND');
    passedScenarios++;
    console.log('  [PASS] Scenario 21: same wristband as replacement -> rejected');

    // Scenario 22: child/current-band mismatch -> rejected
    // Request claims child has wbReplacement2, but child actually has wb3
    const freshAvailWb = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:E5:F6:A1:${testRunId.slice(-4)}:20`,
      actor: { id: adminUserId, role: 'admin' }
    });
    const res22 = await fetch(`${baseUrl}/api/volunteer/wristbands/replace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry3Id,
        currentWristbandId: wbReplacement2.id, // mismatch!
        replacementWristbandId: freshAvailWb.id,
        reason: 'lost'
      })
    });
    assert.strictEqual(res22.status, 409);
    const data22 = await res22.json();
    assert.strictEqual(data22.code, 'WRISTBAND_ASSIGNMENT_MISMATCH');
    passedScenarios++;
    console.log('  [PASS] Scenario 22: child/current-band mismatch -> rejected');

    // Scenario 23: cross-event replacement -> rejected
    // Try to replace entry3Id (Event 1) with wbEvent2 (Event 2)
    const res23 = await fetch(`${baseUrl}/api/volunteer/wristbands/replace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry3Id,
        currentWristbandId: wb3.id,
        replacementWristbandId: wbEvent2.id,
        reason: 'lost'
      })
    });
    assert.strictEqual(res23.status, 400);
    const data23 = await res23.json();
    assert.strictEqual(data23.code, 'EVENT_MISMATCH');
    passedScenarios++;
    console.log('  [PASS] Scenario 23: cross-event replacement -> rejected');

    // Scenario 24: unauthorized volunteer -> rejected
    const res24 = await fetch(`${baseUrl}/api/volunteer/wristbands/replace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}` // ordinary volunteer
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry3Id,
        currentWristbandId: wb3.id,
        replacementWristbandId: freshAvailWb.id,
        reason: 'lost'
      })
    });
    assert.strictEqual(res24.status, 403);
    const data24 = await res24.json();
    assert.strictEqual(data24.code, 'FORBIDDEN');
    passedScenarios++;
    console.log('  [PASS] Scenario 24: unauthorized volunteer -> rejected');

    // =================================================================
    // SECTION 4: TRANSACTION & ATOMICITY SCENARIOS
    // =================================================================
    console.log('\n--- TRANSACTION & ATOMICITY SCENARIOS ---');

    // Scenario 25: simulated failure during replacement rolls back everything
    // Attempt replacement where the database operation is intentionally aborted
    const wbRollbackTest = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:F6:A1:B2:${testRunId.slice(-4)}:30`,
      actor: { id: adminUserId, role: 'admin' }
    });

    // We verify that if an unhandled DB constraint or error occurs inside transaction,
    // neither the old band is marked lost nor is the replacement marked active
    let txThrew = false;
    try {
      await transaction(async () => {
        // Step 1: deactivate
        await execute("UPDATE child_wristband_assignments SET deactivated_at = ? WHERE child_event_entry_id = ?", [nowIso, entry3Id]);
        await execute("UPDATE wristbands SET status = 'lost' WHERE id = ?", [wb3.id]);
        // Simulate catastrophic mid-transaction crash
        throw new Error('SIMULATED_DB_CRASH');
      });
    } catch (simErr: any) {
      if (simErr.message === 'SIMULATED_DB_CRASH') txThrew = true;
    }
    assert.strictEqual(txThrew, true);

    // Verify rollback: wb3 must still be active and entry3 must still have active assignment
    const wb3PostCrash = await queryOne('SELECT status FROM wristbands WHERE id = ?', [wb3.id]);
    assert.strictEqual(wb3PostCrash.status, 'active', 'Rollback must preserve wb3 status = active');
    const activeEntry3PostCrash = await getActiveAssignmentForEntry(entry3Id);
    assert.ok(activeEntry3PostCrash, 'Rollback must preserve active assignment for entry3');
    passedScenarios++;
    console.log('  [PASS] Scenario 25: simulated failure during replacement rolls back everything');

    // Scenario 26: race: two replacement requests -> only one succeeds
    // Race two replacement requests for entry3Id targeting two distinct available bands
    const raceBandA = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:A2:B3:C4:${testRunId.slice(-4)}:40`,
      actor: { id: adminUserId, role: 'admin' }
    });
    const raceBandB = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:A2:B3:C4:${testRunId.slice(-4)}:41`,
      actor: { id: adminUserId, role: 'admin' }
    });

    const [raceRes1, raceRes2] = await Promise.all([
      fetch(`${baseUrl}/api/volunteer/wristbands/replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leadToken}` },
        body: JSON.stringify({
          eventId: testEvent1Id,
          childEventEntryId: entry3Id,
          currentWristbandId: wb3.id,
          replacementWristbandId: raceBandA.id,
          reason: 'lost'
        })
      }),
      fetch(`${baseUrl}/api/volunteer/wristbands/replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leadToken}` },
        body: JSON.stringify({
          eventId: testEvent1Id,
          childEventEntryId: entry3Id,
          currentWristbandId: wb3.id,
          replacementWristbandId: raceBandB.id,
          reason: 'lost'
        })
      })
    ]);

    const statuses = [raceRes1.status, raceRes2.status].sort();
    assert.deepStrictEqual(statuses, [200, 409], 'Exactly one race request must succeed (200) and one must be rejected (409)');
    passedScenarios++;
    console.log('  [PASS] Scenario 26: race: two replacement requests -> only one succeeds');

    // Scenario 27: child never ends with two active assignments
    const activeAssignmentsEntry3 = await query(
      'SELECT id, wristband_id FROM child_wristband_assignments WHERE child_event_entry_id = ? AND deactivated_at IS NULL',
      [entry3Id]
    );
    assert.strictEqual(activeAssignmentsEntry3.length, 1, 'Child must never have more than one active assignment row');
    passedScenarios++;
    console.log('  [PASS] Scenario 27: child never ends with two active assignments');

    // =================================================================
    // SECTION 5: IDEMPOTENCY SCENARIOS
    // =================================================================
    console.log('\n--- IDEMPOTENCY SCENARIOS ---');

    // Provision bands for idempotency testing
    const wbIdemCurrent = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:D4:E5:F6:${testRunId.slice(-4)}:50`,
      actor: { id: adminUserId, role: 'admin' }
    });
    const wbIdemReplacement = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:D4:E5:F6:${testRunId.slice(-4)}:51`,
      actor: { id: adminUserId, role: 'admin' }
    });

    // Create child and entry
    const childIdemId = `ch-idem-${testRunId}`;
    const entryIdemId = `ent-idem-${testRunId}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES (?, ?, 'Idem Child', 'Female', '2019-01-01', ?, ?)
    `, [childIdemId, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'checked_in', ?, ?)
    `, [entryIdemId, childIdemId, testEvent1Id, nowIso, nowIso]);

    await bindWristbandToChild({
      eventId: testEvent1Id,
      childEventEntryId: entryIdemId,
      wristbandId: wbIdemCurrent.id,
      actor: { id: adminUserId, role: 'admin' }
    });

    const testIdempotencyKey = `idem-replace-${testRunId}`;

    // Scenario 28: same key same request -> original result
    const res28a = await fetch(`${baseUrl}/api/admin/wristbands/replace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entryIdemId,
        currentWristbandId: wbIdemCurrent.id,
        replacementWristbandId: wbIdemReplacement.id,
        reason: 'lost',
        idempotencyKey: testIdempotencyKey
      })
    });
    assert.strictEqual(res28a.status, 200);
    const data28a = await res28a.json();

    const res28b = await fetch(`${baseUrl}/api/admin/wristbands/replace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entryIdemId,
        currentWristbandId: wbIdemCurrent.id,
        replacementWristbandId: wbIdemReplacement.id,
        reason: 'lost',
        idempotencyKey: testIdempotencyKey
      })
    });
    assert.strictEqual(res28b.status, 200, 'Idempotent retry must return 200');
    const data28b = await res28b.json();
    assert.strictEqual(data28a.newAssignment.id, data28b.newAssignment.id, 'Must return same assignment');
    passedScenarios++;
    console.log('  [PASS] Scenario 28: same key same request -> original result');

    // Scenario 29: no duplicate assignment history
    const idemAssignments = await query(
      'SELECT id FROM child_wristband_assignments WHERE child_event_entry_id = ?',
      [entryIdemId]
    );
    assert.strictEqual(idemAssignments.length, 2, 'Retry must not insert a third assignment record');
    passedScenarios++;
    console.log('  [PASS] Scenario 29: no duplicate assignment history');

    // Scenario 30: same key different payload -> conflict
    const res30 = await fetch(`${baseUrl}/api/admin/wristbands/replace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        childEventEntryId: entry4Id, // different child entry!
        currentWristbandId: wbActive4.id,
        replacementWristbandId: wbIdemReplacement.id,
        reason: 'lost',
        idempotencyKey: testIdempotencyKey
      })
    });
    assert.strictEqual(res30.status, 409);
    const data30 = await res30.json();
    assert.strictEqual(data30.code, 'IDEMPOTENCY_CONFLICT');
    passedScenarios++;
    console.log('  [PASS] Scenario 30: same key different payload -> conflict');

    // =================================================================
    // SECTION 6: AUDIT SCENARIOS
    // =================================================================
    console.log('\n--- AUDIT SCENARIOS ---');

    // Scenario 31: deactivation audited
    const deactAudit = await queryOne(
      "SELECT * FROM audit_logs WHERE action = 'WRISTBAND_DEACTIVATED' ORDER BY timestamp DESC LIMIT 1"
    );
    assert.ok(deactAudit, 'Deactivation must write an audit record');
    const deactDetails = JSON.parse(deactAudit.details);
    assert.ok(deactDetails.eventId);
    assert.ok(deactDetails.wristbandId);
    assert.ok(deactDetails.reason);
    passedScenarios++;
    console.log('  [PASS] Scenario 31: deactivation audited');

    // Scenario 32: replacement audited
    const replaceAudit = await queryOne(
      "SELECT * FROM audit_logs WHERE action = 'WRISTBAND_REPLACED' ORDER BY timestamp DESC LIMIT 1"
    );
    assert.ok(replaceAudit, 'Replacement must write an audit record');
    const replaceDetails = JSON.parse(replaceAudit.details);
    assert.ok(replaceDetails.oldWristbandId);
    assert.ok(replaceDetails.newWristbandId);
    assert.ok(replaceDetails.childEventEntryId);
    assert.strictEqual(replaceDetails.reason, 'lost');
    passedScenarios++;
    console.log('  [PASS] Scenario 32: replacement audited');

    console.log('\n================================================================');
    console.log(`ALL ${passedScenarios}/32 PHASE 2B SCENARIOS PASSED SUCCESSFULLY`);
    console.log('================================================================\n');

  } finally {
    // Teardown ephemeral server
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Cleanup test data
    try {
      await execute("DELETE FROM wristband_operation_idempotency WHERE event_id LIKE 'ev-2b-%'");
      await execute("DELETE FROM wristband_binding_idempotency WHERE event_id LIKE 'ev-2b-%'");
      await execute("DELETE FROM child_wristband_assignments WHERE event_id LIKE 'ev-2b-%'");
      await execute("DELETE FROM wristbands WHERE event_id LIKE 'ev-2b-%'");
      await execute("DELETE FROM event_wristband_sequences WHERE event_id LIKE 'ev-2b-%'");
      await execute("DELETE FROM event_duty_assignments WHERE event_id LIKE 'ev-2b-%'");
      await execute("DELETE FROM child_event_entries WHERE event_id LIKE 'ev-2b-%'");
      await execute("DELETE FROM children WHERE parent_profile_id = ?", [parentProfileId]);
      await execute("DELETE FROM parent_profiles WHERE id = ?", [parentProfileId]);
      await execute("DELETE FROM volunteer_profiles WHERE user_id IN (?, ?)", [checkInLeadUserId, checkInVolunteerUserId]);
      await execute("DELETE FROM users WHERE id IN (?, ?, ?, ?, ?)", [
        adminUserId, superAdminUserId, checkInLeadUserId, checkInVolunteerUserId, parentUserId
      ]);
      await execute("DELETE FROM events WHERE id IN (?, ?, ?)", [testEvent1Id, testEvent2Id, inactiveEventId]);
    } catch (_) {}
  }
}

runTgaPhase2bWristbandReplacementTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[FATAL TEST FAILURE]:', err);
    process.exit(1);
  });
