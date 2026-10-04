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
  getWristbandInventory,
  previewBulkImportWristbands,
  executeBulkImportWristbands,
  generateNextWristbandCodes,
  getWristbandsForPrint,
  verifyWristbandTag,
  resolveEventChildIdentifier,
  WristbandDomainError
} from '../src/server/services/wristbandService';

async function runTgaPhase4aWristbandInventoryTests() {
  console.log('================================================================');
  console.log('TGA 2026 — PHASE 4A VERIFICATION TEST SUITE');
  console.log('Bulk Wristband Inventory, Import, Prep & Print Batch');
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
  const testEvent1Id = `ev-4a-1-${testRunId}`;
  const testEvent2Id = `ev-4a-2-${testRunId}`;

  // Test Users
  const adminUserId = `usr-admin-4a-${testRunId}`;
  const superAdminUserId = `usr-super-4a-${testRunId}`;
  const volunteerUserId = `usr-vol-4a-${testRunId}`;

  const adminToken = generateToken(adminUserId);
  const superAdminToken = generateToken(superAdminUserId);
  const volunteerToken = generateToken(volunteerUserId);

  // Test Children & Entries
  const child1Id = `ch-4a-1-${testRunId}`;
  const entry1Id = `ent-4a-1-${testRunId}`;
  const pass1Ref = `KOI-2026-4A1${testRunId.slice(-3)}`;

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
    `, [adminUserId, `admin-4a-${testRunId}@tga-test.org`, nowIso, nowIso, superAdminUserId, `super-4a-${testRunId}@tga-test.org`, nowIso, nowIso, volunteerUserId, `volunteer-4a-${testRunId}@tga-test.org`, nowIso, nowIso]);

    // Parent profile
    const parentProfileId = `pp-4a-${testRunId}`;
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Grace Vane', '07700900111', ?, ?)
    `, [parentProfileId, adminUserId, nowIso, nowIso]);

    // Seed Child & Entry for assignment testing
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Eleanor Vane', 'female', '2016-04-12', 10, 'Ages 9 to 11', ?, ?)
    `, [child1Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [entry1Id, child1Id, testEvent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, 'hash-4a', 'active', ?, ?, ?)
    `, [`pass-4a-1-${testRunId}`, entry1Id, pass1Ref, nowIso, nowIso, nowIso]);

    // Seed initial wristbands in Event 1:
    // band1: available -> will bind to entry1
    const band1 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: '04:4A:01:01',
      wristbandCode: 'WB-4A0001',
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });

    // Bind band1 to Child 1 so it becomes 'active'
    await bindWristbandToChild({
      eventId: testEvent1Id,
      childEventEntryId: entry1Id,
      wristbandId: band1.id,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });

    // band2: available
    await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: '04:4A:01:02',
      wristbandCode: 'WB-4A0002',
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });

    // band3: available
    await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: '04:4A:01:03',
      wristbandCode: 'WB-4A0003',
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });

    // band4: lost
    const bandLost = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: '04:4A:01:04',
      wristbandCode: 'WB-4A0004',
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    await execute("UPDATE wristbands SET status = 'lost' WHERE id = ?", [bandLost.id]);

    // band5: damaged
    const bandDamaged = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: '04:4A:01:05',
      wristbandCode: 'WB-4A0005',
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    await execute("UPDATE wristbands SET status = 'damaged' WHERE id = ?", [bandDamaged.id]);

    // bandEvent2 in Event 2 (for cross-event isolation)
    await provisionWristband({
      eventId: testEvent2Id,
      nfcUid: '04:4A:02:99',
      wristbandCode: 'WB-4AEV2',
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });

    console.log('--- INVENTORY LIST & FILTER SCENARIOS ---');

    // Scenario 1: inventory list event-scoped
    const resInv1 = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands/inventory`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const dataInv1 = await resInv1.json();
    assert.strictEqual(resInv1.status, 200);
    assert.strictEqual(dataInv1.success, true);
    assert.ok(dataInv1.wristbands.length >= 5);
    assert.ok(dataInv1.wristbands.every((w: any) => w.eventId === testEvent1Id));
    passedScenarios++;
    console.log('  [PASS] Scenario 1: inventory list event-scoped');

    // Scenario 2: available filter
    const resAvail = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands/inventory?status=available`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const dataAvail = await resAvail.json();
    assert.strictEqual(resAvail.status, 200);
    assert.ok(dataAvail.wristbands.length >= 2);
    assert.ok(dataAvail.wristbands.every((w: any) => w.status === 'available'));
    passedScenarios++;
    console.log('  [PASS] Scenario 2: available filter');

    // Scenario 3: active filter
    const resActive = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands/inventory?status=active`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const dataActive = await resActive.json();
    assert.strictEqual(resActive.status, 200);
    assert.strictEqual(dataActive.wristbands.length, 1);
    assert.strictEqual(dataActive.wristbands[0].wristbandCode, 'WB-4A0001');
    assert.strictEqual(dataActive.wristbands[0].assignmentState, 'active');
    assert.strictEqual(dataActive.wristbands[0].assignedChild.childName, 'Eleanor Vane');
    passedScenarios++;
    console.log('  [PASS] Scenario 3: active filter');

    // Scenario 4: search WB code
    const resSearchCode = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands/inventory?q=WB-4A0002`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const dataSearchCode = await resSearchCode.json();
    assert.strictEqual(resSearchCode.status, 200);
    assert.strictEqual(dataSearchCode.wristbands.length, 1);
    assert.strictEqual(dataSearchCode.wristbands[0].wristbandCode, 'WB-4A0002');
    passedScenarios++;
    console.log('  [PASS] Scenario 4: search WB code');

    // Scenario 5: search normalized NFC UID
    const resSearchNfc = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands/inventory?q=04:4a:01:03`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const dataSearchNfc = await resSearchNfc.json();
    assert.strictEqual(resSearchNfc.status, 200);
    assert.strictEqual(dataSearchNfc.wristbands.length, 1);
    assert.strictEqual(dataSearchNfc.wristbands[0].wristbandCode, 'WB-4A0003');
    passedScenarios++;
    console.log('  [PASS] Scenario 5: search normalized NFC UID');

    // Scenario 6: wrong-event inventory isolated
    const hasEvent2Bands = dataInv1.wristbands.some((w: any) => w.wristbandCode === 'WB-4AEV2');
    assert.strictEqual(hasEvent2Bands, false);
    passedScenarios++;
    console.log('  [PASS] Scenario 6: wrong-event inventory isolated');

    console.log('\n--- BULK IMPORT SCENARIOS ---');

    // Scenario 7: valid UID import
    const validCsv = `nfc_uid\n04:4A:10:01\n04:4A:10:02\n04:4A:10:03`;
    const resImport1 = await executeBulkImportWristbands({
      eventId: testEvent1Id,
      csvText: validCsv,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    assert.strictEqual(resImport1.success, true);
    assert.strictEqual(resImport1.importedCount, 3);
    assert.strictEqual(resImport1.skippedCount, 0);
    passedScenarios++;
    console.log('  [PASS] Scenario 7: valid UID import');

    // Scenario 8: normalization applied
    const checkBand = await queryOne<{ nfc_uid: string }>(
      'SELECT nfc_uid FROM wristbands WHERE event_id = ? AND nfc_uid = ?',
      [testEvent1Id, '044A1001']
    );
    assert.ok(checkBand, 'NFC UID must be normalized to uppercase canonical without colons');
    passedScenarios++;
    console.log('  [PASS] Scenario 8: normalization applied');

    // Scenario 9: malformed UID rejected
    const malformedCsv = `nfc_uid\nINVALID_TAG_XYZ\n04:4A:10:04`;
    const resPreviewMalformed = await previewBulkImportWristbands({
      eventId: testEvent1Id,
      csvText: malformedCsv,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    assert.strictEqual(resPreviewMalformed.summary.malformedCount, 1);
    assert.strictEqual(resPreviewMalformed.summary.validCount, 1);
    const malformedRow = resPreviewMalformed.rows.find((r) => r.status === 'malformed');
    assert.ok(malformedRow);
    assert.strictEqual(malformedRow.rawNfcUid, 'INVALID_TAG_XYZ');
    passedScenarios++;
    console.log('  [PASS] Scenario 9: malformed UID rejected');

    // Scenario 10: duplicate in same file detected
    const dupCsv = `nfc_uid\n04:4A:20:01\n04:4A:20:01`;
    const resPreviewDup = await previewBulkImportWristbands({
      eventId: testEvent1Id,
      csvText: dupCsv,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    assert.strictEqual(resPreviewDup.summary.duplicateInFileCount, 1);
    assert.strictEqual(resPreviewDup.summary.validCount, 1);
    assert.strictEqual(resPreviewDup.rows[1].status, 'duplicate_in_file');
    passedScenarios++;
    console.log('  [PASS] Scenario 10: duplicate in same file detected');

    // Scenario 11: existing event UID detected
    const existingCsv = `nfc_uid\n04:4A:01:01`; // already in Event 1
    const resPreviewExisting = await previewBulkImportWristbands({
      eventId: testEvent1Id,
      csvText: existingCsv,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    assert.strictEqual(resPreviewExisting.summary.alreadyExistingCount, 1);
    assert.strictEqual(resPreviewExisting.summary.validCount, 0);
    assert.strictEqual(resPreviewExisting.rows[0].status, 'already_exists');
    passedScenarios++;
    console.log('  [PASS] Scenario 11: existing event UID detected');

    // Scenario 12: same UID different event follows existing event-scoped model
    // 04:4A:02:99 is registered in Event 2, should be valid for Event 1
    const crossEventCsv = `nfc_uid\n04:4A:02:99`;
    const resPreviewCross = await previewBulkImportWristbands({
      eventId: testEvent1Id,
      csvText: crossEventCsv,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    assert.strictEqual(resPreviewCross.summary.validCount, 1);
    assert.strictEqual(resPreviewCross.summary.alreadyExistingCount, 0);
    passedScenarios++;
    console.log('  [PASS] Scenario 12: same UID different event follows existing event-scoped model');

    // Scenario 13: generated WB codes unique
    const multiCsv = `nfc_uid\n04:4A:30:01\n04:4A:30:02\n04:4A:30:03\n04:4A:30:04\n04:4A:30:05`;
    const resImportMulti = await executeBulkImportWristbands({
      eventId: testEvent1Id,
      csvText: multiCsv,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    assert.strictEqual(resImportMulti.importedCount, 5);
    const codes = resImportMulti.wristbands.map((w) => w.wristbandCode);
    const uniqueCodes = new Set(codes);
    assert.strictEqual(uniqueCodes.size, 5);
    assert.ok(codes.every((c) => /^WB-\d{6}$/.test(c)));
    passedScenarios++;
    console.log('  [PASS] Scenario 13: generated WB codes unique');

    // Scenario 14: bulk codes concurrency safe
    const batchCodes = await generateNextWristbandCodes(testEvent1Id, 10);
    assert.strictEqual(batchCodes.length, 10);
    assert.strictEqual(new Set(batchCodes).size, 10);
    passedScenarios++;
    console.log('  [PASS] Scenario 14: bulk codes concurrency safe');

    // Scenario 15: no child PII required
    const tableColumns = await query<{ name: string }>('PRAGMA table_info(wristbands)');
    const colNames = tableColumns.map((c) => c.name.toLowerCase());
    assert.strictEqual(colNames.includes('child_name'), false);
    assert.strictEqual(colNames.includes('first_name'), false);
    assert.strictEqual(colNames.includes('parent_phone'), false);
    passedScenarios++;
    console.log('  [PASS] Scenario 15: no child PII required');

    // Scenario 16: preview does not mutate database
    const countBefore = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM wristbands WHERE event_id = ?',
      [testEvent1Id]
    );
    await previewBulkImportWristbands({
      eventId: testEvent1Id,
      csvText: `nfc_uid\n04:4A:40:01\n04:4A:40:02`,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    const countAfter = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM wristbands WHERE event_id = ?',
      [testEvent1Id]
    );
    assert.strictEqual(countBefore?.count, countAfter?.count, 'Preview must NOT insert records into database');
    passedScenarios++;
    console.log('  [PASS] Scenario 16: preview does not mutate database');

    // Scenario 17: confirm import performs mutation
    await executeBulkImportWristbands({
      eventId: testEvent1Id,
      csvText: `nfc_uid\n04:4A:40:01\n04:4A:40:02`,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    const countFinal = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM wristbands WHERE event_id = ?',
      [testEvent1Id]
    );
    assert.strictEqual((countFinal?.count || 0) - (countBefore?.count || 0), 2);
    passedScenarios++;
    console.log('  [PASS] Scenario 17: confirm import performs mutation');

    console.log('\n--- SCAN-TO-PROVISION SCENARIOS ---');

    // Scenario 18: scan-to-provision one band
    const resScan1 = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ nfcUid: '04:4A:50:01' })
    });
    const dataScan1 = await resScan1.json();
    assert.strictEqual(resScan1.status, 201);
    assert.strictEqual(dataScan1.success, true);
    assert.ok(dataScan1.wristband.wristband_code);
    assert.strictEqual(dataScan1.wristband.nfc_uid, '044A5001');
    passedScenarios++;
    console.log('  [PASS] Scenario 18: scan-to-provision one band');

    // Scenario 19: subsequent scan immediately ready
    const resScan2 = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ nfcUid: '04:4A:50:02' })
    });
    const dataScan2 = await resScan2.json();
    assert.strictEqual(resScan2.status, 201);
    assert.notStrictEqual(dataScan1.wristband.wristband_code, dataScan2.wristband.wristband_code);
    passedScenarios++;
    console.log('  [PASS] Scenario 19: subsequent scan immediately ready');

    // Scenario 20: duplicate scan safely rejected
    const resScanDup = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ nfcUid: '04:4A:50:01' })
    });
    assert.strictEqual(resScanDup.status, 409);
    passedScenarios++;
    console.log('  [PASS] Scenario 20: duplicate scan safely rejected');

    console.log('\n--- PRINT BATCH SCENARIOS ---');

    // Scenario 21: print item uses WB code
    const resPrintBatch = await getWristbandsForPrint({
      eventId: testEvent1Id,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    assert.ok(resPrintBatch.items.length > 0);
    assert.ok(resPrintBatch.items.every((item) => typeof item.wristbandCode === 'string' && item.wristbandCode.length > 0));
    passedScenarios++;
    console.log('  [PASS] Scenario 21: print item uses WB code');

    // Scenario 22: machine-readable value contains WB code
    assert.ok(resPrintBatch.items.every((item) => item.qrValue === item.wristbandCode));
    passedScenarios++;
    console.log('  [PASS] Scenario 22: machine-readable value contains WB code');

    // Scenario 23: no child PII in printable output
    const printProps = Object.keys(resPrintBatch.items[0]);
    assert.strictEqual(printProps.includes('childName'), false);
    assert.strictEqual(printProps.includes('parentPhone'), false);
    assert.strictEqual(printProps.includes('medicalNotes'), false);
    passedScenarios++;
    console.log('  [PASS] Scenario 23: no child PII in printable output');

    // Scenario 24: event identifier optional/safe
    assert.ok(resPrintBatch.items.every((item) => Boolean(item.eventName)));
    passedScenarios++;
    console.log('  [PASS] Scenario 24: event identifier optional/safe');

    // Scenario 25: batch/range selection works
    const resRangePrint = await getWristbandsForPrint({
      eventId: testEvent1Id,
      rangeStart: 'WB-4A0001',
      rangeEnd: 'WB-4A0003',
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    assert.strictEqual(resRangePrint.items.length, 3);
    assert.deepStrictEqual(
      resRangePrint.items.map((i) => i.wristbandCode),
      ['WB-4A0001', 'WB-4A0002', 'WB-4A0003']
    );
    passedScenarios++;
    console.log('  [PASS] Scenario 25: batch/range selection works');

    console.log('\n--- AUTHORIZATION SCENARIOS ---');

    // Scenario 26: Admin allowed
    const resAuthAdmin = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands/inventory`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(resAuthAdmin.status, 200);
    passedScenarios++;
    console.log('  [PASS] Scenario 26: Admin allowed');

    // Scenario 27: Super Admin allowed
    const resAuthSuper = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands/inventory`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    assert.strictEqual(resAuthSuper.status, 200);
    passedScenarios++;
    console.log('  [PASS] Scenario 27: Super Admin allowed');

    // Scenario 28: unauthorized volunteer blocked
    const resAuthVol = await fetch(`${baseUrl}/api/admin/events/${testEvent1Id}/wristbands/inventory`, {
      headers: { Authorization: `Bearer ${volunteerToken}` }
    });
    assert.strictEqual(resAuthVol.status, 403);
    passedScenarios++;
    console.log('  [PASS] Scenario 28: unauthorized volunteer blocked');

    console.log('\n--- REGRESSION & INTEGRATION SCENARIOS ---');

    // Scenario 29: Phase 3C unified check-in resolver integration intact
    const resResolveWb = await resolveEventChildIdentifier(testEvent1Id, 'WB-4A0001');
    assert.strictEqual(resResolveWb.success, true);
    assert.strictEqual(resResolveWb.childEventEntryId, entry1Id);
    passedScenarios++;
    console.log('  [PASS] Scenario 29: Phase 3C remains green');

    // Scenario 30: unified resolver remains green for QR/Pass
    const resResolvePass = await resolveEventChildIdentifier(testEvent1Id, pass1Ref);
    assert.strictEqual(resResolvePass.success, true);
    assert.strictEqual(resResolvePass.childEventEntryId, entry1Id);
    passedScenarios++;
    console.log('  [PASS] Scenario 30: unified resolver remains green');

    // Scenario 31: existing check-in remains unchanged
    // Perform check-in through volunteer route
    const checkinToken = generateToken(adminUserId);
    const resCheckIn = await fetch(`${baseUrl}/api/volunteer/check-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${checkinToken}`
      },
      body: JSON.stringify({
        childEventEntryId: entry1Id,
        eventId: testEvent1Id
      })
    });
    const dataCheckIn = await resCheckIn.json();
    assert.strictEqual(resCheckIn.status, 200);
    assert.strictEqual(dataCheckIn.success, true);
    passedScenarios++;
    console.log('  [PASS] Scenario 31: existing check-in remains unchanged');

    console.log('\n================================================================');
    console.log(`ALL ${passedScenarios}/31 PHASE 4A SCENARIOS PASSED SUCCESSFULLY`);
    console.log('================================================================\n');

    server.close();
    process.exit(0);
  } catch (err: any) {
    server.close();
    console.error('\n[TEST FAILURE]:', err);
    process.exit(1);
  }
}

runTgaPhase4aWristbandInventoryTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
