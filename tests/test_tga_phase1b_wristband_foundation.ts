import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import assert from 'assert';

dotenv.config();
const localEnvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
}

import { execute, query, queryOne } from '../src/server/db';
import {
  normalizeNfcUid,
  isValidNfcUid,
  isValidWristbandStatus,
  createWristband,
  getWristbandById,
  getWristbandByNfcUid,
  getWristbandByCode,
  createAssignment,
  deactivateAssignment,
  getActiveAssignmentForEntry,
  getActiveAssignmentForWristband,
  getAssignmentHistoryForEntry,
  getAssignmentHistoryForEvent,
  VALID_WRISTBAND_STATUSES
} from '../src/server/services/wristbandService';

async function runTgaPhase1bWristbandFoundationTests() {
  console.log('================================================================');
  console.log('TGA 2026 — PHASE 1B REGRESSION TEST SUITE');
  console.log('NFC Wristband Data & Domain Foundation');
  console.log('================================================================\n');

  const nowIso = new Date().toISOString();
  const testEvent1Id = `ev-tga-wb1-${Date.now()}`;
  const testEvent2Id = `ev-tga-wb2-${Date.now()}`;

  let parentUserId: string | null = null;
  let parentProfileId: string | null = null;
  let child1Id: string | null = null;
  let child2Id: string | null = null;
  let childEvent2Id: string | null = null;
  let entry1Id: string | null = null;
  let entry2Id: string | null = null;
  let entryEvent2Id: string | null = null;

  let passedScenarios = 0;

  try {
    // -------------------------------------------------------------
    // FIXTURE SETUP: Create two events, parent, and children entries
    // -------------------------------------------------------------
    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'TGA 2026 Event 1', 'current', ?, ?)
    `, [testEvent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'TGA 2026 Event 2', 'upcoming', ?, ?)
    `, [testEvent2Id, nowIso, nowIso]);

    parentUserId = `usr-wb-${Date.now()}`;
    parentProfileId = `prof-wb-${Date.now()}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', ?, ?)
    `, [parentUserId, `parent_${Date.now()}@tga-test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Parent One', '+2348000000001', ?, ?)
    `, [parentProfileId, parentUserId, nowIso, nowIso]);

    child1Id = `ch-wb1-${Date.now()}`;
    child2Id = `ch-wb2-${Date.now()}`;
    childEvent2Id = `ch-wb3-${Date.now()}`;

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child One', 'Female', '2019-01-01', 7, 'Ages 7 to 9', ?, ?)
    `, [child1Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child Two', 'Male', '2021-01-01', 5, 'Ages 4 to 6', ?, ?)
    `, [child2Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Child Event2', 'Female', '2019-06-01', 7, 'Ages 7 to 9', ?, ?)
    `, [childEvent2Id, parentProfileId, nowIso, nowIso]);

    entry1Id = `ent-wb1-${Date.now()}`;
    entry2Id = `ent-wb2-${Date.now()}`;
    entryEvent2Id = `ent-wb-ev2-${Date.now()}`;

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', ?, ?)
    `, [entry1Id, child1Id, testEvent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', ?, ?)
    `, [entry2Id, child2Id, testEvent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', ?, ?)
    `, [entryEvent2Id, childEvent2Id, testEvent2Id, nowIso, nowIso]);

    console.log('--- INVENTORY & PHYSICAL RECORD SCENARIOS ---');

    // Scenario 1: create wristband for event
    const wb1 = await createWristband({
      eventId: testEvent1Id,
      wristbandCode: 'WB-001001',
      nfcUid: '04:A1:B2:C3',
      status: 'available',
      createdByUserId: parentUserId
    });
    assert.ok(wb1, 'Wristband should be created');
    assert.strictEqual(wb1.event_id, testEvent1Id);
    assert.strictEqual(wb1.wristband_code, 'WB-001001');
    assert.strictEqual(wb1.nfc_uid, '04A1B2C3'); // Normalized to uppercase without colons
    assert.strictEqual(wb1.status, 'available');
    passedScenarios++;
    console.log('  [PASS] Scenario 1: create wristband for event');

    // Scenario 2: duplicate wristband_code in same event rejected
    let dupCodeFailed = false;
    try {
      await createWristband({
        eventId: testEvent1Id,
        wristbandCode: 'WB-001001', // same code
        nfcUid: '04:A1:B2:C4',      // different UID
        status: 'available'
      });
    } catch {
      dupCodeFailed = true;
    }
    assert.strictEqual(dupCodeFailed, true, 'Duplicate wristband_code in same event must be rejected');
    passedScenarios++;
    console.log('  [PASS] Scenario 2: duplicate wristband_code in same event rejected');

    // Scenario 3: duplicate NFC UID in same event rejected
    let dupUidFailed = false;
    try {
      await createWristband({
        eventId: testEvent1Id,
        wristbandCode: 'WB-001002', // different code
        nfcUid: '04-a1-b2-c3',      // same canonical UID 04A1B2C3
        status: 'available'
      });
    } catch {
      dupUidFailed = true;
    }
    assert.strictEqual(dupUidFailed, true, 'Duplicate NFC UID in same event must be rejected');
    passedScenarios++;
    console.log('  [PASS] Scenario 3: duplicate NFC UID in same event rejected');

    // Scenario 4: same physical-format UID normalization deterministic
    const variants = [
      '04:A1:B2:C3',
      '04-a1-b2-c3',
      '04 A1 B2 C3',
      '04a1b2c3',
      ' 04:a1:b2:c3 '
    ];
    const normalizedVariants = variants.map(v => normalizeNfcUid(v));
    const allMatch = normalizedVariants.every(v => v === '04A1B2C3');
    assert.strictEqual(allMatch, true, 'All UID physical format variations must normalize to 04A1B2C3');
    passedScenarios++;
    console.log('  [PASS] Scenario 4: same physical-format UID normalization deterministic');

    // Scenario 5: same wristband code allowed in another event (event-scoped design)
    const wbEvent2 = await createWristband({
      eventId: testEvent2Id,
      wristbandCode: 'WB-001001', // same code as Event 1
      nfcUid: '04:EE:FF:01',
      status: 'available'
    });
    assert.ok(wbEvent2, 'Same wristband code should be allowed in another event context');
    assert.strictEqual(wbEvent2.event_id, testEvent2Id);
    assert.strictEqual(wbEvent2.wristband_code, 'WB-001001');
    passedScenarios++;
    console.log('  [PASS] Scenario 5: same wristband code allowed in another event');

    // Scenario 6: same NFC UID across events behaves according to selected event-scoped design
    const wbEvent2SameUid = await createWristband({
      eventId: testEvent2Id,
      wristbandCode: 'WB-002002',
      nfcUid: '04:A1:B2:C3', // same UID as Event 1, but in Event 2
      status: 'available'
    });
    assert.ok(wbEvent2SameUid, 'Same NFC UID allowed across different event inventories');
    assert.strictEqual(wbEvent2SameUid.event_id, testEvent2Id);
    assert.strictEqual(wbEvent2SameUid.nfc_uid, '04A1B2C3');
    passedScenarios++;
    console.log('  [PASS] Scenario 6: same NFC UID across events behaves according to event-scoped design');

    console.log('\n--- ASSIGNMENT & DATABASE INVARIANT SCENARIOS ---');

    // Scenario 7: one child entry can have one active assignment
    const wb2 = await createWristband({
      eventId: testEvent1Id,
      wristbandCode: 'WB-001002',
      nfcUid: '04:B2:C3:D4',
      status: 'available'
    });
    const wb3 = await createWristband({
      eventId: testEvent1Id,
      wristbandCode: 'WB-001003',
      nfcUid: '04:C3:D4:E5',
      status: 'available'
    });

    const assign1 = await createAssignment({
      eventId: testEvent1Id,
      childEventEntryId: entry1Id,
      wristbandId: wb1.id,
      assignedByUserId: parentUserId
    });
    assert.ok(assign1, 'First active assignment must succeed');
    assert.strictEqual(assign1.child_event_entry_id, entry1Id);
    assert.strictEqual(assign1.wristband_id, wb1.id);
    assert.strictEqual(assign1.deactivated_at, null);

    const activeForEntry1 = await getActiveAssignmentForEntry(entry1Id);
    assert.strictEqual(activeForEntry1?.id, assign1.id);
    passedScenarios++;
    console.log('  [PASS] Scenario 7: one child entry can have one active assignment');

    // Scenario 8: second active wristband for same child rejected
    let secondActiveForChildFailed = false;
    try {
      await createAssignment({
        eventId: testEvent1Id,
        childEventEntryId: entry1Id, // same child entry
        wristbandId: wb2.id          // different wristband
      });
    } catch {
      secondActiveForChildFailed = true;
    }
    assert.strictEqual(secondActiveForChildFailed, true, 'Second active wristband for same child entry must be rejected by partial unique index');
    passedScenarios++;
    console.log('  [PASS] Scenario 8: second active wristband for same child rejected');

    // Scenario 9: one wristband cannot be actively assigned to two children
    let secondActiveForBandFailed = false;
    try {
      await createAssignment({
        eventId: testEvent1Id,
        childEventEntryId: entry2Id, // different child entry
        wristbandId: wb1.id          // same wristband (already active on entry 1)
      });
    } catch {
      secondActiveForBandFailed = true;
    }
    assert.strictEqual(secondActiveForBandFailed, true, 'One wristband cannot be actively assigned to two children');
    passedScenarios++;
    console.log('  [PASS] Scenario 9: one wristband cannot be actively assigned to two children');

    // Scenario 10: deactivated assignment remains in history
    const deactTime = new Date().toISOString();
    await deactivateAssignment({
      assignmentId: assign1.id,
      deactivatedByUserId: parentUserId,
      deactivationReason: 'lost',
      deactivatedAt: deactTime
    });

    const refreshedAssign1 = await queryOne<any>(
      'SELECT * FROM child_wristband_assignments WHERE id = ?',
      [assign1.id]
    );
    assert.ok(refreshedAssign1, 'Deactivated assignment must remain in database');
    assert.strictEqual(refreshedAssign1.deactivated_at, deactTime);
    assert.strictEqual(refreshedAssign1.deactivation_reason, 'lost');

    const activeAfterDeact = await getActiveAssignmentForEntry(entry1Id);
    assert.strictEqual(activeAfterDeact, null, 'No active assignment should exist for child after deactivation');
    passedScenarios++;
    console.log('  [PASS] Scenario 10: deactivated assignment remains in history');

    // Scenario 11: child may receive a new assignment after old one deactivated
    const assign2 = await createAssignment({
      eventId: testEvent1Id,
      childEventEntryId: entry1Id, // same child entry
      wristbandId: wb2.id          // replacement wristband
    });
    assert.ok(assign2, 'Reassignment after deactivation must succeed');
    assert.strictEqual(assign2.child_event_entry_id, entry1Id);
    assert.strictEqual(assign2.wristband_id, wb2.id);
    assert.strictEqual(assign2.deactivated_at, null);

    const newActive = await getActiveAssignmentForEntry(entry1Id);
    assert.strictEqual(newActive?.id, assign2.id);
    passedScenarios++;
    console.log('  [PASS] Scenario 11: child may receive a new assignment after old one deactivated');

    // Scenario 12: old assignment row remains unchanged
    const oldAssignCheck = await queryOne<any>(
      'SELECT * FROM child_wristband_assignments WHERE id = ?',
      [assign1.id]
    );
    assert.strictEqual(oldAssignCheck.wristband_id, wb1.id, 'Old assignment wristband_id must NOT be mutated');
    assert.strictEqual(oldAssignCheck.deactivation_reason, 'lost');
    passedScenarios++;
    console.log('  [PASS] Scenario 12: old assignment row remains unchanged');

    // Scenario 13: cross-event child/wristband assignment rejected
    let crossEventFailed = false;
    try {
      // Try to assign Event 2 wristband to Event 1 assignment row
      await execute(`
        INSERT INTO child_wristband_assignments (
          id, event_id, child_event_entry_id, wristband_id, assigned_at, created_at
        ) VALUES ('cwa-illegal-cross', ?, ?, ?, ?, ?)
      `, [testEvent1Id, entry1Id, wbEvent2.id, nowIso, nowIso]); // wbEvent2 is in testEvent2Id!
    } catch {
      crossEventFailed = true;
    }
    assert.strictEqual(crossEventFailed, true, 'Cross-event wristband assignment must fail foreign key constraint');

    let crossEventEntryFailed = false;
    try {
      // Try to assign Event 2 child entry to Event 1 assignment row
      await execute(`
        INSERT INTO child_wristband_assignments (
          id, event_id, child_event_entry_id, wristband_id, assigned_at, created_at
        ) VALUES ('cwa-illegal-cross-entry', ?, ?, ?, ?, ?)
      `, [testEvent1Id, entryEvent2Id, wb3.id, nowIso, nowIso]); // entryEvent2Id is in testEvent2Id!
    } catch {
      crossEventEntryFailed = true;
    }
    assert.strictEqual(crossEventEntryFailed, true, 'Cross-event child entry assignment must fail foreign key constraint');
    passedScenarios++;
    console.log('  [PASS] Scenario 13: cross-event child/wristband assignment rejected by database');

    console.log('\n--- STATUS & PRIVACY REVIEW SCENARIOS ---');

    // Scenario 14: available/active inventory statuses valid
    assert.strictEqual(isValidWristbandStatus('available'), true);
    assert.strictEqual(isValidWristbandStatus('active'), true);
    assert.strictEqual(isValidWristbandStatus('lost'), true);
    assert.strictEqual(isValidWristbandStatus('damaged'), true);
    assert.strictEqual(isValidWristbandStatus('decommissioned'), true);

    const wbActive = await createWristband({
      eventId: testEvent1Id,
      wristbandCode: 'WB-001004',
      nfcUid: '04:D4:E5:F6',
      status: 'active'
    });
    assert.strictEqual(wbActive.status, 'active');
    passedScenarios++;
    console.log('  [PASS] Scenario 14: available/active inventory statuses valid');

    // Scenario 15: invalid status rejected
    assert.strictEqual(isValidWristbandStatus('unregistered'), false);
    assert.strictEqual(isValidWristbandStatus('magic'), false);

    let invalidStatusRejected = false;
    try {
      await createWristband({
        eventId: testEvent1Id,
        wristbandCode: 'WB-001005',
        nfcUid: '04:E5:F6:07',
        status: 'invalid_status' as any
      });
    } catch {
      invalidStatusRejected = true;
    }
    assert.strictEqual(invalidStatusRejected, true, 'Invalid wristband status must be rejected');

    let dbCheckConstraintRejected = false;
    try {
      await execute(`
        INSERT INTO wristbands (id, event_id, wristband_code, nfc_uid, status, created_at, updated_at)
        VALUES ('wb-invalid-status', ?, 'WB-BAD', '04E5F607', 'hacked_status', ?, ?)
      `, [testEvent1Id, nowIso, nowIso]);
    } catch {
      dbCheckConstraintRejected = true;
    }
    assert.strictEqual(dbCheckConstraintRejected, true, 'Database CHECK constraint must reject invalid status');
    passedScenarios++;
    console.log('  [PASS] Scenario 15: invalid status rejected');

    // Scenario 16: no PII required/stored in wristband entity
    const wbColumns = await query<any>("PRAGMA table_info('wristbands')");
    const piiFields = ['name', 'full_name', 'phone', 'dob', 'date_of_birth', 'medical', 'allergy', 'pickup', 'photo', 'guardian', 'email'];
    for (const col of wbColumns) {
      const colNameLower = col.name.toLowerCase();
      for (const pii of piiFields) {
        assert.ok(
          !colNameLower.includes(pii),
          `Wristbands table must not contain PII field: found ${col.name}`
        );
      }
    }
    const assignColumns = await query<any>("PRAGMA table_info('child_wristband_assignments')");
    for (const col of assignColumns) {
      const colNameLower = col.name.toLowerCase();
      for (const pii of piiFields) {
        assert.ok(
          !colNameLower.includes(pii),
          `child_wristband_assignments table must not contain PII field: found ${col.name}`
        );
      }
    }
    passedScenarios++;
    console.log('  [PASS] Scenario 16: no PII required/stored in wristband entity');

    // Scenario 17: event deletion/FK behavior does not orphan unsafe records
    const tempEventId = `ev-temp-del-${Date.now()}`;
    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'Temp Event', 'closed', ?, ?)
    `, [tempEventId, nowIso, nowIso]);

    const tempChildId = `ch-temp-${Date.now()}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES (?, ?, 'Temp Child', 'Male', '2019-01-01', ?, ?)
    `, [tempChildId, parentProfileId, nowIso, nowIso]);

    const tempEntryId = `ent-temp-${Date.now()}`;
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', ?, ?)
    `, [tempEntryId, tempChildId, tempEventId, nowIso, nowIso]);

    const tempWb = await createWristband({
      eventId: tempEventId,
      wristbandCode: 'WB-TEMP-01',
      nfcUid: '04:11:22:33',
      status: 'available'
    });

    await createAssignment({
      eventId: tempEventId,
      childEventEntryId: tempEntryId,
      wristbandId: tempWb.id
    });

    // Delete the event
    await execute('DELETE FROM events WHERE id = ?', [tempEventId]);

    const orphanedWb = await query('SELECT * FROM wristbands WHERE event_id = ?', [tempEventId]);
    const orphanedAssign = await query('SELECT * FROM child_wristband_assignments WHERE event_id = ?', [tempEventId]);
    assert.strictEqual(orphanedWb.length, 0, 'Wristbands must cascade on event deletion');
    assert.strictEqual(orphanedAssign.length, 0, 'Assignments must cascade on event deletion');
    await execute('DELETE FROM children WHERE id = ?', [tempChildId]);
    passedScenarios++;
    console.log('  [PASS] Scenario 17: event deletion/FK behavior cascades and does not orphan records');

    // Scenario 18: assignment history query returns chronological chain
    const history = await getAssignmentHistoryForEntry(entry1Id);
    assert.strictEqual(history.length, 2, 'Should have 2 historical assignment rows for entry 1');
    assert.strictEqual(history[0].wristband_id, wb1.id, 'First assignment should be first in chain');
    assert.strictEqual(history[0].deactivation_reason, 'lost');
    assert.strictEqual(history[1].wristband_id, wb2.id, 'Second assignment should be second in chain');
    assert.strictEqual(history[1].deactivated_at, null);
    passedScenarios++;
    console.log('  [PASS] Scenario 18: assignment history query returns chronological chain');

    console.log(`\n================================================================`);
    console.log(`ALL ${passedScenarios}/18 REGRESSION SCENARIOS PASSED SUCCESSFULLY`);
    console.log(`================================================================\n`);

  } finally {
    // -------------------------------------------------------------
    // CLEANUP FIXTURES
    // -------------------------------------------------------------
    try {
      await execute('DELETE FROM child_wristband_assignments WHERE event_id IN (?, ?)', [testEvent1Id, testEvent2Id]);
      await execute('DELETE FROM wristbands WHERE event_id IN (?, ?)', [testEvent1Id, testEvent2Id]);
      await execute('DELETE FROM child_event_entries WHERE event_id IN (?, ?)', [testEvent1Id, testEvent2Id]);
      if (child1Id || child2Id || childEvent2Id) {
        await execute('DELETE FROM children WHERE id IN (?, ?, ?)', [child1Id || '', child2Id || '', childEvent2Id || '']);
      }
      if (parentProfileId) {
        await execute('DELETE FROM parent_profiles WHERE id = ?', [parentProfileId]);
      }
      if (parentUserId) {
        await execute('DELETE FROM users WHERE id = ?', [parentUserId]);
      }
      await execute('DELETE FROM events WHERE id IN (?, ?)', [testEvent1Id, testEvent2Id]);
    } catch (cleanErr) {
      console.error('Cleanup warning:', cleanErr);
    }
  }
}

runTgaPhase1bWristbandFoundationTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
