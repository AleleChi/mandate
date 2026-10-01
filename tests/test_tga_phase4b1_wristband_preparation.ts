import assert from 'assert';
import http from 'http';
import express from 'express';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import adminRoutes from '../src/server/routes/admin';
import volunteerRoutes from '../src/server/routes/volunteer';
import {
  prepareWristband,
  verifyWristband,
  provisionWristband,
  bindWristbandToChild,
  getWristbandInventory,
  resolveEventChildIdentifier,
  normalizeNfcUid,
  lookupWristbandByNfcUid,
  WristbandDomainError
} from '../src/server/services/wristbandService';

async function runTgaPhase4b1WristbandPreparationTests() {
  console.log('================================================================');
  console.log('TGA 2026 — PHASE 4B1 VERIFICATION TEST SUITE');
  console.log('Scan, Prepare + Physical Wristband Verification');
  console.log('================================================================\n');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const nowIso = new Date().toISOString();

  // Setup ephemeral test server
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

  // Test Event IDs
  const testEvent1Id = `ev-4b1-1-${testRunId}`;
  const testEvent2Id = `ev-4b1-2-${testRunId}`;

  // Test Users
  const adminUserId = `usr-admin-4b1-${testRunId}`;
  const superAdminUserId = `usr-super-4b1-${testRunId}`;
  const volunteerUserId = `usr-vol-4b1-${testRunId}`;

  const adminToken = generateToken(adminUserId);
  const superAdminToken = generateToken(superAdminUserId);
  const volunteerToken = generateToken(volunteerUserId);

  // Test Children & Entries
  const child1Id = `ch-4b1-1-${testRunId}`;
  const entry1Id = `ent-4b1-1-${testRunId}`;
  const pass1Ref = `KOI-2026-4B1${testRunId.slice(-3)}`;

  try {
    // Demote prior current events
    await execute("UPDATE events SET status = 'archived' WHERE status = 'current'");

    // Seed Events
    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'TGA 2026 Primary', 'current', ?, ?, ?, ?)
    `, [testEvent1Id, nowIso, nowIso, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Other Event 2', 'published', ?, ?, ?, ?)
    `, [testEvent2Id, nowIso, nowIso, nowIso, nowIso]);

    // Seed Users
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES
        (?, ?, 'hashed_pw', 'admin', 'active', ?, ?),
        (?, ?, 'hashed_pw', 'super_admin', 'active', ?, ?),
        (?, ?, 'hashed_pw', 'volunteer', 'active', ?, ?)
    `, [adminUserId, `admin-4b1-${testRunId}@tga-test.org`, nowIso, nowIso, superAdminUserId, `super-4b1-${testRunId}@tga-test.org`, nowIso, nowIso, volunteerUserId, `volunteer-4b1-${testRunId}@tga-test.org`, nowIso, nowIso]);

    // Seed Volunteer profile & active duty assignment for check-in
    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Faith Volunteer', '08012345679', '08012345679', 'arrival', 'approved', 0, ?, ?)
    `, [`vp-4b1-${testRunId}`, volunteerUserId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'check_in', 'arrival', 'lead', 'active', ?, ?, ?, ?)
    `, [`eda-4b1-${testRunId}`, testEvent1Id, volunteerUserId, nowIso, nowIso, nowIso, nowIso]);

    // Parent profile & child
    const parentProfileId = `pp-4b1-${testRunId}`;
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Grace Parent', '08012345678', ?, ?)
    `, [parentProfileId, adminUserId, nowIso, nowIso]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Daniel Omikunle', 'male', '2018-05-15', 8, 'Ages 6 to 8', ?, ?)
    `, [child1Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [entry1Id, child1Id, testEvent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, 'hash-4b1-1', 'active', ?, ?, ?)
    `, [`pass-4b1-1-${testRunId}`, entry1Id, pass1Ref, nowIso, nowIso, nowIso]);

    // Track test wristbands
    let band1Code = '';
    let band1Uid = `04:A1:B2:${testRunId.slice(0, 2)}:${testRunId.slice(2, 4)}:01`;

    // -------------------------------------------------------------------------
    // Scenario 1: scan valid NFC -> prepared band created
    // -------------------------------------------------------------------------
    console.log('[Scenario 1] Scan valid NFC -> prepared band created via POST /events/:eventId/wristbands/prepare');
    const prepRes = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands/prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ nfcUid: band1Uid })
    });
    const prepData = await prepRes.json();
    assert.strictEqual(prepRes.status, 201, `Expected status 201, got ${prepRes.status}`);
    assert.strictEqual(prepData.success, true);
    assert.ok(prepData.wristbandCode, 'Should return generated wristbandCode');
    assert.strictEqual(prepData.status, 'prepared');
    band1Code = prepData.wristbandCode;
    passedScenarios++;
    console.log(`  Passed! Generated code: ${band1Code}, status: ${prepData.status}\n`);

    // -------------------------------------------------------------------------
    // Scenario 2: WB code automatically generated in WB-XXXXXX format
    // -------------------------------------------------------------------------
    console.log('[Scenario 2] WB code automatically generated in WB-XXXXXX format');
    assert.match(band1Code, /^WB-\d{6}$/, `Code ${band1Code} should match WB-\\d{6}`);
    passedScenarios++;
    console.log(`  Passed! Format confirmed: ${band1Code}\n`);

    // -------------------------------------------------------------------------
    // Scenario 3: status = prepared in database
    // -------------------------------------------------------------------------
    console.log('[Scenario 3] Status = prepared in database');
    const row1 = await queryOne<{ status: string; nfc_uid: string }>(
      'SELECT status, nfc_uid FROM wristbands WHERE event_id = ? AND wristband_code = ?',
      [testEvent1Id, band1Code]
    );
    assert.ok(row1, 'Row must exist');
    assert.strictEqual(row1.status, 'prepared');
    passedScenarios++;
    console.log(`  Passed! Row status in DB: ${row1.status}\n`);

    // -------------------------------------------------------------------------
    // Scenario 4: duplicate UID same event rejected
    // -------------------------------------------------------------------------
    console.log('[Scenario 4] Duplicate UID in same event rejected');
    const dupRes = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands/prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ nfcUid: band1Uid })
    });
    const dupData = await dupRes.json();
    assert.strictEqual(dupRes.status, 409, `Expected 409, got ${dupRes.status}`);
    assert.strictEqual(dupData.code, 'WRISTBAND_ALREADY_REGISTERED');
    passedScenarios++;
    console.log(`  Passed! Duplicate rejected with 409: ${dupData.code}\n`);

    // -------------------------------------------------------------------------
    // Scenario 5: same UID in other event follows event-scoped model
    // -------------------------------------------------------------------------
    console.log('[Scenario 5] Same UID in other event follows event-scoped model');
    const otherEvRes = await fetch(`${baseUrl}/api/admin/events/${testEvent2Id}/wristbands/prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ nfcUid: band1Uid })
    });
    const otherEvData = await otherEvRes.json();
    assert.strictEqual(otherEvRes.status, 201, `Expected 201 in other event, got ${otherEvRes.status}`);
    assert.strictEqual(otherEvData.success, true);
    assert.strictEqual(otherEvData.status, 'prepared');
    assert.notStrictEqual(otherEvData.wristband.id, prepData.wristband.id);
    passedScenarios++;
    console.log(`  Passed! Same UID successfully scoped to Event 2 with status: ${otherEvData.status}\n`);

    // -------------------------------------------------------------------------
    // Scenario 6: malformed UID rejected
    // -------------------------------------------------------------------------
    console.log('[Scenario 6] Malformed UID rejected');
    const badUidRes = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands/prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ nfcUid: 'NOT-A-HEX-TAG-$$' })
    });
    const badUidData = await badUidRes.json();
    assert.strictEqual(badUidRes.status, 400, `Expected 400, got ${badUidRes.status}`);
    assert.strictEqual(badUidData.code, 'INVALID_NFC_UID');
    passedScenarios++;
    console.log(`  Passed! Malformed UID rejected with: ${badUidData.code}\n`);

    // -------------------------------------------------------------------------
    // Scenario 7: concurrent scans create unique WB codes
    // -------------------------------------------------------------------------
    console.log('[Scenario 7] Concurrent scans create unique WB codes');
    const concurrentUids = [
      `04:B1:01:${testRunId.slice(0, 2)}:10:01`,
      `04:B1:02:${testRunId.slice(0, 2)}:10:02`,
      `04:B1:03:${testRunId.slice(0, 2)}:10:03`,
      `04:B1:04:${testRunId.slice(0, 2)}:10:04`,
      `04:B1:05:${testRunId.slice(0, 2)}:10:05`
    ];
    const concurrentResults = await Promise.all(
      concurrentUids.map(uid =>
        prepareWristband({
          eventId: testEvent1Id,
          nfcUid: uid,
          actor: { id: adminUserId, role: 'admin' }
        })
      )
    );
    const codes = concurrentResults.map(r => r.wristbandCode);
    const uniqueCodes = new Set(codes);
    assert.strictEqual(uniqueCodes.size, 5, `Expected 5 unique codes, got ${uniqueCodes.size}`);
    codes.forEach(c => assert.match(c, /^WB-\d{6}$/));
    passedScenarios++;
    console.log(`  Passed! Generated 5 unique consecutive codes: ${codes.join(', ')}\n`);

    // -------------------------------------------------------------------------
    // Scenario 8: prepared band cannot be assigned to child
    // -------------------------------------------------------------------------
    console.log('[Scenario 8] Prepared band cannot be assigned to child');
    let assignError: any = null;
    try {
      await bindWristbandToChild({
        eventId: testEvent1Id,
        childEventEntryId: entry1Id,
        nfcUid: band1Uid,
        actor: { id: volunteerUserId, role: 'volunteer' }
      });
    } catch (err: any) {
      assignError = err;
    }
    assert.ok(assignError, 'Should throw error when assigning prepared band');
    assert.strictEqual(assignError.code, 'WRISTBAND_NOT_VERIFIED');
    assert.strictEqual(assignError.message, 'This wristband has not been verified for use yet.');
    passedScenarios++;
    console.log(`  Passed! Blocked with controlled error: "${assignError.message}" (${assignError.code})\n`);

    // -------------------------------------------------------------------------
    // Scenario 9: correct WB code + UID verification succeeds
    // -------------------------------------------------------------------------
    console.log('[Scenario 9] Correct WB code + UID verification succeeds via POST /api/admin/wristbands/verify');
    const verifyRes = await fetch(`${baseUrl}/api/admin/wristbands/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        wristbandCode: band1Code,
        nfcUid: band1Uid
      })
    });
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyRes.status, 200, `Expected 200, got ${verifyRes.status}`);
    assert.strictEqual(verifyData.success, true);
    assert.strictEqual(verifyData.verified, true);
    assert.strictEqual(verifyData.status, 'available');
    passedScenarios++;
    console.log(`  Passed! Verified successfully: ${verifyData.message}\n`);

    // -------------------------------------------------------------------------
    // Scenario 10: status prepared -> available in database
    // -------------------------------------------------------------------------
    console.log('[Scenario 10] Status prepared -> available in database');
    const row1Verified = await queryOne<{ status: string }>(
      'SELECT status FROM wristbands WHERE event_id = ? AND wristband_code = ?',
      [testEvent1Id, band1Code]
    );
    assert.strictEqual(row1Verified?.status, 'available', 'Status must be updated to available');
    passedScenarios++;
    console.log(`  Passed! Database status updated to: ${row1Verified?.status}\n`);

    // -------------------------------------------------------------------------
    // Prepare a second wristband for mismatch and invalid status tests
    // -------------------------------------------------------------------------
    const band2Uid = `04:C2:B3:${testRunId.slice(0, 2)}:20:02`;
    const prep2 = await prepareWristband({
      eventId: testEvent1Id,
      nfcUid: band2Uid,
      actor: { id: adminUserId, role: 'admin' }
    });
    const band2Code = prep2.wristbandCode;

    // -------------------------------------------------------------------------
    // Scenario 11: wrong UID mismatch rejected (status remains prepared)
    // -------------------------------------------------------------------------
    console.log('[Scenario 11] Wrong UID mismatch rejected (status remains prepared)');
    const mismatchRes = await fetch(`${baseUrl}/api/admin/wristbands/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        wristbandCode: band2Code,
        nfcUid: '04:99:99:99:99:99:99' // Different UID
      })
    });
    const mismatchData = await mismatchRes.json();
    assert.strictEqual(mismatchRes.status, 400);
    assert.strictEqual(mismatchData.code, 'VERIFICATION_MISMATCH');
    assert.strictEqual(mismatchData.error, 'This wristband does not match the printed code.');

    // Check database row: status MUST remain prepared!
    const row2Check = await queryOne<{ status: string }>(
      'SELECT status FROM wristbands WHERE event_id = ? AND wristband_code = ?',
      [testEvent1Id, band2Code]
    );
    assert.strictEqual(row2Check?.status, 'prepared', 'Status must remain prepared on mismatch');
    passedScenarios++;
    console.log(`  Passed! Mismatch correctly rejected: "${mismatchData.error}" and status remains "prepared"\n`);

    // -------------------------------------------------------------------------
    // Scenario 12: wrong WB code rejected
    // -------------------------------------------------------------------------
    console.log('[Scenario 12] Wrong WB code rejected');
    const wrongCodeRes = await fetch(`${baseUrl}/api/admin/wristbands/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        wristbandCode: 'WB-999999',
        nfcUid: band2Uid
      })
    });
    const wrongCodeData = await wrongCodeRes.json();
    assert.strictEqual(wrongCodeRes.status, 404);
    assert.strictEqual(wrongCodeData.code, 'WRISTBAND_NOT_FOUND');
    passedScenarios++;
    console.log(`  Passed! Non-existent code rejected: ${wrongCodeData.code}\n`);

    // -------------------------------------------------------------------------
    // Scenario 13: wrong event rejected
    // -------------------------------------------------------------------------
    console.log('[Scenario 13] Wrong event rejected');
    const wrongEventRes = await fetch(`${baseUrl}/api/admin/wristbands/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent2Id, // Passing Event 2 for a band created in Event 1
        wristbandCode: band2Code,
        nfcUid: band2Uid
      })
    });
    const wrongEventData = await wrongEventRes.json();
    assert.strictEqual(wrongEventRes.status, 400);
    assert.strictEqual(wrongEventData.code, 'EVENT_MISMATCH');
    passedScenarios++;
    console.log(`  Passed! Wrong event rejected: ${wrongEventData.code}\n`);

    // -------------------------------------------------------------------------
    // Scenario 14: active band cannot be verified
    // -------------------------------------------------------------------------
    console.log('[Scenario 14] Active band cannot be verified');
    // Bind band 1 (which is now available) to child
    await bindWristbandToChild({
      eventId: testEvent1Id,
      childEventEntryId: entry1Id,
      nfcUid: band1Uid,
      actor: { id: volunteerUserId, role: 'volunteer' }
    });
    // Now band 1 is active. Try verifying it again:
    let activeVerifyErr: any = null;
    try {
      await verifyWristband({
        eventId: testEvent1Id,
        wristbandCode: band1Code,
        nfcUid: band1Uid,
        actor: { id: adminUserId, role: 'admin' }
      });
    } catch (err: any) {
      activeVerifyErr = err;
    }
    assert.ok(activeVerifyErr);
    assert.strictEqual(activeVerifyErr.code, 'INVALID_STATUS');
    passedScenarios++;
    console.log(`  Passed! Active band verification rejected: ${activeVerifyErr.message}\n`);

    // -------------------------------------------------------------------------
    // Scenario 15: lost band cannot be verified
    // -------------------------------------------------------------------------
    console.log('[Scenario 15] Lost band cannot be verified');
    const lostBand = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:D3:01:${testRunId.slice(0, 2)}:30:01`,
      actor: { id: adminUserId, role: 'admin' }
    });
    await execute("UPDATE wristbands SET status = 'lost' WHERE id = ?", [lostBand.id]);
    let lostVerifyErr: any = null;
    try {
      await verifyWristband({
        eventId: testEvent1Id,
        wristbandCode: lostBand.wristband_code,
        nfcUid: lostBand.nfc_uid,
        actor: { id: adminUserId, role: 'admin' }
      });
    } catch (err: any) {
      lostVerifyErr = err;
    }
    assert.ok(lostVerifyErr);
    assert.strictEqual(lostVerifyErr.code, 'INVALID_STATUS');
    passedScenarios++;
    console.log(`  Passed! Lost band verification rejected: ${lostVerifyErr.message}\n`);

    // -------------------------------------------------------------------------
    // Scenario 16: damaged band cannot be verified
    // -------------------------------------------------------------------------
    console.log('[Scenario 16] Damaged band cannot be verified');
    const damagedBand = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:D3:02:${testRunId.slice(0, 2)}:30:02`,
      actor: { id: adminUserId, role: 'admin' }
    });
    await execute("UPDATE wristbands SET status = 'damaged' WHERE id = ?", [damagedBand.id]);
    let damagedVerifyErr: any = null;
    try {
      await verifyWristband({
        eventId: testEvent1Id,
        wristbandCode: damagedBand.wristband_code,
        nfcUid: damagedBand.nfc_uid,
        actor: { id: adminUserId, role: 'admin' }
      });
    } catch (err: any) {
      damagedVerifyErr = err;
    }
    assert.ok(damagedVerifyErr);
    assert.strictEqual(damagedVerifyErr.code, 'INVALID_STATUS');
    passedScenarios++;
    console.log(`  Passed! Damaged band verification rejected: ${damagedVerifyErr.message}\n`);

    // -------------------------------------------------------------------------
    // Scenario 17: decommissioned band cannot be verified
    // -------------------------------------------------------------------------
    console.log('[Scenario 17] Decommissioned band cannot be verified');
    const retiredBand = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:D3:03:${testRunId.slice(0, 2)}:30:03`,
      actor: { id: adminUserId, role: 'admin' }
    });
    await execute("UPDATE wristbands SET status = 'decommissioned' WHERE id = ?", [retiredBand.id]);
    let retiredVerifyErr: any = null;
    try {
      await verifyWristband({
        eventId: testEvent1Id,
        wristbandCode: retiredBand.wristband_code,
        nfcUid: retiredBand.nfc_uid,
        actor: { id: adminUserId, role: 'admin' }
      });
    } catch (err: any) {
      retiredVerifyErr = err;
    }
    assert.ok(retiredVerifyErr);
    assert.strictEqual(retiredVerifyErr.code, 'INVALID_STATUS');
    passedScenarios++;
    console.log(`  Passed! Decommissioned band verification rejected: ${retiredVerifyErr.message}\n`);

    // -------------------------------------------------------------------------
    // Scenario 18: preparation audited (WRISTBAND_PREPARED)
    // -------------------------------------------------------------------------
    console.log('[Scenario 18] Preparation audited (WRISTBAND_PREPARED)');
    const prepAudit = await queryOne<{ action: string; details: string; user_id: string }>(
      "SELECT action, details, user_id FROM audit_logs WHERE action = 'WRISTBAND_PREPARED' AND details LIKE ? ORDER BY timestamp DESC LIMIT 1",
      [`%${band2Code}%`]
    );
    assert.ok(prepAudit, 'Audit log for WRISTBAND_PREPARED must exist');
    const auditDetails = JSON.parse(prepAudit.details);
    assert.strictEqual(auditDetails.wristbandCode, band2Code);
    assert.strictEqual(auditDetails.status, 'prepared');
    assert.strictEqual(auditDetails.eventId, testEvent1Id);
    // Ensure no child PII
    assert.strictEqual(auditDetails.childName, undefined);
    assert.strictEqual(auditDetails.childId, undefined);
    passedScenarios++;
    console.log(`  Passed! WRISTBAND_PREPARED audit recorded with zero child PII\n`);

    // -------------------------------------------------------------------------
    // Scenario 19: verification audited (WRISTBAND_VERIFIED)
    // -------------------------------------------------------------------------
    console.log('[Scenario 19] Verification audited (WRISTBAND_VERIFIED)');
    const verifyAudit = await queryOne<{ action: string; details: string; user_id: string }>(
      "SELECT action, details, user_id FROM audit_logs WHERE action = 'WRISTBAND_VERIFIED' AND details LIKE ? ORDER BY timestamp DESC LIMIT 1",
      [`%${band1Code}%`]
    );
    assert.ok(verifyAudit, 'Audit log for WRISTBAND_VERIFIED must exist');
    const verDetails = JSON.parse(verifyAudit.details);
    assert.strictEqual(verDetails.wristbandCode, band1Code);
    assert.strictEqual(verDetails.previousStatus, 'prepared');
    assert.strictEqual(verDetails.status, 'available');
    assert.strictEqual(verDetails.eventId, testEvent1Id);
    passedScenarios++;
    console.log(`  Passed! WRISTBAND_VERIFIED audit recorded cleanly\n`);

    // -------------------------------------------------------------------------
    // Scenario 20: existing available bands remain unchanged
    // -------------------------------------------------------------------------
    console.log('[Scenario 20] Existing available bands remain unchanged');
    const preExistingBand = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: `04:E4:01:${testRunId.slice(0, 2)}:40:01`,
      actor: { id: adminUserId, role: 'admin' }
    });
    assert.strictEqual(preExistingBand.status, 'available');
    const checkPreExisting = await queryOne<{ status: string }>(
      'SELECT status FROM wristbands WHERE id = ?',
      [preExistingBand.id]
    );
    assert.strictEqual(checkPreExisting?.status, 'available');
    passedScenarios++;
    console.log(`  Passed! Available wristbands remain unaffected\n`);

    // -------------------------------------------------------------------------
    // Scenario 21: Phase 4A inventory still works with prepared summary & filters
    // -------------------------------------------------------------------------
    console.log('[Scenario 21] Phase 4A inventory still works with prepared summary & filters');
    const inv = await getWristbandInventory({
      eventId: testEvent1Id,
      actor: { id: adminUserId, role: 'admin' }
    });
    assert.ok(inv.summary.total > 0);
    assert.ok(typeof inv.summary.prepared === 'number');
    assert.ok(inv.summary.prepared >= 1, `Prepared count should be >= 1, got ${inv.summary.prepared}`);
    assert.ok(inv.summary.available >= 1, `Available count should be >= 1, got ${inv.summary.available}`);

    // Filter by prepared
    const preparedOnly = await getWristbandInventory({
      eventId: testEvent1Id,
      status: 'prepared',
      actor: { id: adminUserId, role: 'admin' }
    });
    assert.ok(preparedOnly.wristbands.length > 0);
    preparedOnly.wristbands.forEach(w => assert.strictEqual(w.status, 'prepared'));
    passedScenarios++;
    console.log(`  Passed! Inventory summary: Total=${inv.summary.total}, Prepared=${inv.summary.prepared}, Available=${inv.summary.available}\n`);

    // -------------------------------------------------------------------------
    // Scenario 22: existing assignment still works on available bands
    // -------------------------------------------------------------------------
    console.log('[Scenario 22] Existing assignment still works on available bands');
    // Verify band 2 so it becomes available
    await verifyWristband({
      eventId: testEvent1Id,
      wristbandCode: band2Code,
      nfcUid: band2Uid,
      actor: { id: adminUserId, role: 'admin' }
    });

    // Seed child 2
    const child2Id = `ch-4b1-2-${testRunId}`;
    const entry2Id = `ent-4b1-2-${testRunId}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Hannah Omikunle', 'female', '2020-03-10', 6, 'Ages 3 to 5', ?, ?)
    `, [child2Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [entry2Id, child2Id, testEvent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, 'hash-4b1-2', 'active', ?, ?, ?)
    `, [`pass-4b1-2-${testRunId}`, entry2Id, `KOI-2026-4B2${testRunId.slice(-3)}`, nowIso, nowIso, nowIso]);

    const assignResult = await bindWristbandToChild({
      eventId: testEvent1Id,
      childEventEntryId: entry2Id,
      nfcUid: band2Uid,
      actor: { id: volunteerUserId, role: 'volunteer' }
    });
    assert.strictEqual(assignResult.success, true);
    assert.strictEqual(assignResult.wristband.status, 'active');
    passedScenarios++;
    console.log(`  Passed! Newly verified available band assigned cleanly: status active\n`);

    // -------------------------------------------------------------------------
    // Scenario 23: existing volunteer check-in remains unchanged
    // -------------------------------------------------------------------------
    console.log('[Scenario 23] Existing volunteer check-in remains unchanged');
    // Resolving assigned active band 1 by NFC UID succeeds
    const resolveActive = await resolveEventChildIdentifier(testEvent1Id, band1Uid);
    assert.strictEqual(resolveActive.success, true);
    assert.strictEqual(resolveActive.childEventEntryId, entry1Id);
    assert.strictEqual(resolveActive.wristbandCode, band1Code);

    // Resolving a prepared band returns WRISTBAND_NOT_VERIFIED
    const band3Uid = `04:F5:01:${testRunId.slice(0, 2)}:50:01`;
    await prepareWristband({
      eventId: testEvent1Id,
      nfcUid: band3Uid,
      actor: { id: adminUserId, role: 'admin' }
    });
    let resolvePreparedErr: any = null;
    try {
      await resolveEventChildIdentifier(testEvent1Id, band3Uid);
    } catch (err: any) {
      resolvePreparedErr = err;
    }
    assert.ok(resolvePreparedErr);
    assert.strictEqual(resolvePreparedErr.code, 'WRISTBAND_NOT_VERIFIED');
    assert.strictEqual(resolvePreparedErr.message, 'This wristband has not been verified for use yet');
    passedScenarios++;
    console.log(`  Passed! Volunteer check-in resolution resolves active bands and safely protects unverified bands\n`);

    // -------------------------------------------------------------------------
    // Scenario 24: NFC UID length is hardware-neutral and uses canonical normalizer
    // -------------------------------------------------------------------------
    console.log('[Scenario 24] NFC UID length is hardware-neutral and uses canonical normalizer');
    // Test various hardware-neutral lengths: 4-byte (8 hex), 7-byte (14 hex), 10-byte (20 hex), arbitrary (6 hex)
    const neutralUids = [
      `A1B2C3${testRunId.slice(0, 2)}`, // 4-byte (8 hex)
      `04:A1:B2:${testRunId.slice(0, 2)}:C3:D4:E5`, // 7-byte (14 hex) with colons
      `04-A1-B2-${testRunId.slice(0, 2)}-C3-D4-E5-F6-07-08`, // 10-byte (20 hex) with hyphens
      `FA FB ${testRunId.slice(0, 2)}`, // 3-byte (6 hex) with spaces
      `01.02.03.${testRunId.slice(0, 2)}.05.06.07.08` // 8-byte (16 hex) with dots
    ];

    for (const rawUid of neutralUids) {
      const canonical = normalizeNfcUid(rawUid);
      const prepNeutral = await prepareWristband({
        eventId: testEvent1Id,
        nfcUid: rawUid,
        actor: { id: adminUserId, role: 'admin' }
      });
      assert.strictEqual(prepNeutral.nfcUid, canonical, `UID ${rawUid} should normalize to ${canonical}`);
      assert.strictEqual(prepNeutral.status, 'prepared');

      // Verify that lookupWristbandByNfcUid uses the exact same canonical normalization
      const lookupResult = await lookupWristbandByNfcUid({ eventId: testEvent1Id, rawUid });
      assert.strictEqual(lookupResult.nfcUid, canonical);
      assert.strictEqual(lookupResult.wristbandCode, prepNeutral.wristbandCode);
    }

    // Rejection of empty strings, whitespace, and non-hex characters
    for (const invalid of ['', '   ', '::::----....', 'NOT-HEX-TAG', '12345Z']) {
      let invErr: any = null;
      try {
        await prepareWristband({
          eventId: testEvent1Id,
          nfcUid: invalid,
          actor: { id: adminUserId, role: 'admin' }
        });
      } catch (err: any) {
        invErr = err;
      }
      assert.ok(invErr, `Should reject invalid UID "${invalid}"`);
      assert.strictEqual(invErr.code, 'INVALID_NFC_UID');
    }
    passedScenarios++;
    console.log(`  Passed! Hardware-neutral UIDs (8, 14, 20, 6, 16 hex chars) prepared, lookup verified, invalid rejected\n`);

    // -------------------------------------------------------------------------
    // Scenario 25: Verification mismatch never relinks, swaps, or creates records
    // -------------------------------------------------------------------------
    console.log('[Scenario 25] Verification mismatch never relinks, swaps, or creates records');
    const alphaUid = `04:AA:01:${testRunId.slice(0, 2)}:00:01`;
    const betaUid = `04:BB:02:${testRunId.slice(0, 2)}:00:02`;

    const prepAlpha = await prepareWristband({
      eventId: testEvent1Id,
      nfcUid: alphaUid,
      actor: { id: adminUserId, role: 'admin' }
    });
    const prepBeta = await prepareWristband({
      eventId: testEvent1Id,
      nfcUid: betaUid,
      actor: { id: adminUserId, role: 'admin' }
    });

    const countBeforeResult = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM wristbands WHERE event_id = ?',
      [testEvent1Id]
    );
    const countBefore = countBeforeResult?.count || 0;

    // Cross-verify: Alpha code with Beta UID (mismatch)
    const crossMismatchRes = await fetch(`${baseUrl}/api/admin/wristbands/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        eventId: testEvent1Id,
        wristbandCode: prepAlpha.wristbandCode,
        nfcUid: betaUid
      })
    });
    const crossMismatchData = await crossMismatchRes.json();
    assert.strictEqual(crossMismatchRes.status, 400);
    assert.strictEqual(crossMismatchData.code, 'VERIFICATION_MISMATCH');
    assert.strictEqual(crossMismatchData.error, 'This wristband does not match the printed code.');

    // Invariant checks:
    // 1. Total records in DB unchanged
    const countAfterResult = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM wristbands WHERE event_id = ?',
      [testEvent1Id]
    );
    assert.strictEqual(countAfterResult?.count, countBefore, 'Wristband count must not change on mismatch');

    // 2. Alpha row untouched
    const alphaRow = await queryOne<{ wristband_code: string; nfc_uid: string; status: string }>(
      'SELECT wristband_code, nfc_uid, status FROM wristbands WHERE id = ?',
      [prepAlpha.wristband.id]
    );
    assert.strictEqual(alphaRow?.wristband_code, prepAlpha.wristbandCode);
    assert.strictEqual(alphaRow?.nfc_uid, normalizeNfcUid(alphaUid));
    assert.strictEqual(alphaRow?.status, 'prepared', 'Alpha status must remain prepared');

    // 3. Beta row untouched
    const betaRow = await queryOne<{ wristband_code: string; nfc_uid: string; status: string }>(
      'SELECT wristband_code, nfc_uid, status FROM wristbands WHERE id = ?',
      [prepBeta.wristband.id]
    );
    assert.strictEqual(betaRow?.wristband_code, prepBeta.wristbandCode);
    assert.strictEqual(betaRow?.nfc_uid, normalizeNfcUid(betaUid));
    assert.strictEqual(betaRow?.status, 'prepared', 'Beta status must remain prepared');

    // 4. Neither band is available
    assert.notStrictEqual(alphaRow?.status, 'available');
    assert.notStrictEqual(betaRow?.status, 'available');

    passedScenarios++;
    console.log(`  Passed! Verification mismatch invariant holds: no records relinked, swapped, created, or marked available\n`);

    console.log('================================================================');
    console.log(`ALL ${passedScenarios} OF 25 PHASE 4B1 SCENARIOS PASSED SUCCESSFULLY`);
    console.log('================================================================');
  } catch (error) {
    console.error('\nTEST SUITE FAILED with error:');
    console.error(error);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
}

runTgaPhase4b1WristbandPreparationTests();
