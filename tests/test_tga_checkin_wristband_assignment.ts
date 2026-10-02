import assert from 'assert';
import http from 'http';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import adminRoutes from '../src/server/routes/admin';
import volunteerRoutes from '../src/server/routes/volunteer';
import {
  provisionWristband,
  prepareWristband,
  bindWristbandToChild,
  updateWristbandStatus,
  resolveEventChildIdentifier,
  WristbandDomainError
} from '../src/server/services/wristbandService';

async function runCheckInWristbandAssignmentTests() {
  console.log('================================================================');
  console.log('TGA 2026 — CHECK-IN WRISTBAND ASSIGNMENT INTEGRATION TEST SUITE');
  console.log('Verifying Available Wristband Binding in Volunteer Check-In Flow');
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

  // Test Event IDs
  const testEvent1Id = `ev-assign-1-${testRunId}`;
  const testEvent2Id = `ev-assign-2-${testRunId}`;

  // Test Users
  const adminUserId = `usr-admin-asg-${testRunId}`;
  const checkInWorkerUserId = `usr-worker-asg-${testRunId}`;

  // Test Children & Entries
  const child1Id = `ch-asg-1-${testRunId}`;
  const child2Id = `ch-asg-2-${testRunId}`;
  const entry1Id = `ent-asg-1-${testRunId}`;
  const entry2Id = `ent-asg-2-${testRunId}`;
  const pass1Ref = `KOI-2026-ASG1${testRunId.slice(-3)}`;
  const pass2Ref = `KOI-2026-ASG2${testRunId.slice(-3)}`;

  // Wristbands
  let bandAvailable1: any;
  let bandAvailable2: any;
  let bandPrepared: any;
  let bandActive: any;
  let bandLost: any;
  let bandDamaged: any;
  let bandDecom: any;
  let bandEvent2: any;

  try {
    // 2. Seed Test Database
    await execute("UPDATE events SET status = 'archived' WHERE status = 'current'");

    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'TGA 2026 Check-In Assignment Test Event', 'current', '2026-11-18T08:00:00Z', '2026-11-22T18:00:00Z', ?, ?)
    `, [testEvent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Other Event B Context', 'active', '2026-12-01T08:00:00Z', '2026-12-05T18:00:00Z', ?, ?)
    `, [testEvent2Id, nowIso, nowIso]);

    // Admin User
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, 'hash', 'admin', 'active', 1, ?, ?)
    `, [adminUserId, `admin-asg-${testRunId}@tga-test.org`, nowIso, nowIso]);

    // Authorized Check-In Volunteer
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 'active', 1, ?, ?)
    `, [checkInWorkerUserId, `worker-asg-${testRunId}@tga-test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Check-in Desk Worker', '+2348000000305', '+2348000000305', 'Check-in Team', 'approved', ?, ?)
    `, [`vp-worker-asg-${testRunId}`, checkInWorkerUserId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'Check-in Desk', 'check_in', 'primary', 'scheduled', '2026-11-18T08:00:00Z', '2026-11-18T18:00:00Z', ?, ?)
    `, [`eda-worker-asg-${testRunId}`, testEvent1Id, checkInWorkerUserId, nowIso, nowIso]);

    // Parent & Children
    const parentProfileId = `prof-parent-asg-${testRunId}`;
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Folake Adeleke', '+2348000000398', ?, ?)
    `, [parentProfileId, adminUserId, nowIso, nowIso]);

    // Child 1: Unassigned wristband, ready for check-in
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Daniel Omikunle', 'Male', '2018-05-15', 8, 'Ages 7 to 9', ?, ?)
    `, [child1Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, has_medical_notes, medical_notes, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', 0, NULL, ?, ?)
    `, [entry1Id, testEvent1Id, child1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `, [`pass-asg-1-${testRunId}`, entry1Id, pass1Ref, `hash-asg-1-${testRunId}`, nowIso, nowIso, nowIso]);

    // Child 2: Already Checked-In, no wristband yet
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Kehinde Omikunle', 'Female', '2020-03-10', 6, 'Ages 4 to 6', ?, ?)
    `, [child2Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, checked_in_at, created_at, updated_at)
      VALUES (?, ?, ?, 'checked_in', '2026-11-18T09:15:00Z', ?, ?)
    `, [entry2Id, testEvent1Id, child2Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `, [`pass-asg-2-${testRunId}`, entry2Id, pass2Ref, `hash-asg-2-${testRunId}`, nowIso, nowIso, nowIso]);

    // Seed Attendance record for Child 2 to test no-duplicate attendance on band assignment
    const attendanceRowId = `att-asg-2-${testRunId}`;
    await execute(`
      INSERT INTO attendance_records (id, child_event_entry_id, action_type, action_time, staff_user_id, sync_source, idempotency_key, created_at)
      VALUES (?, ?, 'check_in', '2026-11-18T09:15:00Z', ?, 'online', ?, ?)
    `, [attendanceRowId, entry2Id, checkInWorkerUserId, `seed_att_${entry2Id}`, nowIso]);

    // Provision Wristbands in Event 1
    bandAvailable1 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: '04:A1:01:01',
      wristbandCode: `WB-ASG001`,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });

    bandAvailable2 = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: '04:A1:01:02',
      wristbandCode: `WB-ASG002`,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });

    // Prepared (not available / not verified) wristband
    bandPrepared = await prepareWristband({
      eventId: testEvent1Id,
      nfcUid: '04:A1:01:03',
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });

    // Lost, Damaged, Decommissioned Wristbands
    bandLost = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: '04:A1:01:04',
      wristbandCode: `WB-ASG004`,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    await updateWristbandStatus(bandLost.id, 'lost');

    bandDamaged = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: '04:A1:01:05',
      wristbandCode: `WB-ASG005`,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    await updateWristbandStatus(bandDamaged.id, 'damaged');

    bandDecom = await provisionWristband({
      eventId: testEvent1Id,
      nfcUid: '04:A1:01:06',
      wristbandCode: `WB-ASG006`,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });
    await updateWristbandStatus(bandDecom.id, 'decommissioned');

    // Event 2 Wristband (for isolation test)
    bandEvent2 = await provisionWristband({
      eventId: testEvent2Id,
      nfcUid: '04:B2:01:01',
      wristbandCode: `WB-EV2001`,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });

    const workerToken = generateToken(checkInWorkerUserId);

    console.log('--- TEST SCENARIOS ---');

    // Scenario 1: resolved child with no band shows Assign wristband in UI
    {
      const dashboardFilePath = path.join(process.cwd(), 'src/views/VolunteerEventDashboardView.tsx');
      const dashboardContent = fs.readFileSync(dashboardFilePath, 'utf8');

      assert.ok(
        dashboardContent.includes('No wristband assigned'),
        'UI must contain "No wristband assigned" text for unassigned child'
      );
      assert.ok(
        dashboardContent.includes('Assign wristband'),
        'UI must contain "Assign wristband" action button'
      );
      passedScenarios++;
      console.log('  [PASS] Scenario 1: resolved child with no band shows Assign wristband');
    }

    // Scenario 2: WB code resolves existing available wristband
    {
      const res = await fetch(`${baseUrl}/api/volunteer/wristbands/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({ eventId: testEvent1Id, identifier: bandAvailable1.wristband_code })
      });
      assert.strictEqual(res.status, 200, 'WB code lookup should succeed');
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.wristband.wristbandCode, bandAvailable1.wristband_code);
      assert.strictEqual(data.wristband.status, 'available');
      assert.strictEqual(data.wristband.isAssigned, false);
      passedScenarios++;
      console.log('  [PASS] Scenario 2: WB code resolves existing available wristband');
    }

    // Scenario 3: NFC UID resolves same available wristband
    {
      const res = await fetch(`${baseUrl}/api/volunteer/wristbands/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({ eventId: testEvent1Id, identifier: bandAvailable1.nfc_uid })
      });
      assert.strictEqual(res.status, 200, 'NFC UID lookup should succeed');
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.wristband.id, bandAvailable1.id);
      assert.strictEqual(data.wristband.wristbandCode, bandAvailable1.wristband_code);
      passedScenarios++;
      console.log('  [PASS] Scenario 3: NFC UID resolves same available wristband');
    }

    // Scenario 4: no new wristband is generated during assignment
    const countBeforeBinding = (await query<{ count: number }>('SELECT COUNT(*) as count FROM wristbands'))[0].count;

    // Scenario 5: prepared wristband cannot be assigned
    {
      const res = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({
          eventId: testEvent1Id,
          childEventEntryId: entry1Id,
          wristbandId: bandPrepared.wristband?.id || bandPrepared.id
        })
      });
      assert.strictEqual(res.status, 400, 'Prepared band must not be bindable');
      const data = await res.json();
      assert.strictEqual(data.code, 'WRISTBAND_NOT_VERIFIED');
      assert.strictEqual(data.error, 'This wristband has not been verified for use yet.');
      passedScenarios++;
      console.log('  [PASS] Scenario 5: prepared wristband cannot be assigned');
    }

    // Scenario 6: active wristband cannot be assigned to second child
    {
      // First, bind bandAvailable2 to entry2Id
      const bindRes = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({
          eventId: testEvent1Id,
          childEventEntryId: entry2Id,
          wristbandId: bandAvailable2.id
        })
      });
      assert.strictEqual(bindRes.status, 200);

      // Now attempt to bind same bandAvailable2 to entry1Id
      const res = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({
          eventId: testEvent1Id,
          childEventEntryId: entry1Id,
          wristbandId: bandAvailable2.id
        })
      });
      assert.strictEqual(res.status, 409, 'Active band cannot be assigned to second child');
      const data = await res.json();
      assert.strictEqual(data.code, 'WRISTBAND_ALREADY_ASSIGNED');
      passedScenarios++;
      console.log('  [PASS] Scenario 6: active wristband cannot be assigned to second child');
    }

    // Scenario 7: lost cannot be assigned
    {
      const res = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({
          eventId: testEvent1Id,
          childEventEntryId: entry1Id,
          wristbandId: bandLost.id
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.code, 'WRISTBAND_NOT_AVAILABLE');
      passedScenarios++;
      console.log('  [PASS] Scenario 7: lost wristband cannot be assigned');
    }

    // Scenario 8: damaged cannot be assigned
    {
      const res = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({
          eventId: testEvent1Id,
          childEventEntryId: entry1Id,
          wristbandId: bandDamaged.id
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.code, 'WRISTBAND_NOT_AVAILABLE');
      passedScenarios++;
      console.log('  [PASS] Scenario 8: damaged wristband cannot be assigned');
    }

    // Scenario 9: decommissioned cannot be assigned
    {
      const res = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({
          eventId: testEvent1Id,
          childEventEntryId: entry1Id,
          wristbandId: bandDecom.id
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.code, 'WRISTBAND_NOT_AVAILABLE');
      passedScenarios++;
      console.log('  [PASS] Scenario 9: decommissioned wristband cannot be assigned');
    }

    // Scenario 10: wrong-event wristband is rejected
    {
      // Lookup check across events
      const lookupRes = await fetch(`${baseUrl}/api/volunteer/wristbands/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({ eventId: testEvent1Id, identifier: bandEvent2.wristband_code })
      });
      assert.ok([400, 404].includes(lookupRes.status), 'Cross-event lookup must be rejected');
      const lookupData = await lookupRes.json();
      assert.ok(['EVENT_MISMATCH', 'WRISTBAND_NOT_FOUND'].includes(lookupData.code));

      // Bind check across events
      const bindRes = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({
          eventId: testEvent1Id,
          childEventEntryId: entry1Id,
          wristbandId: bandEvent2.id
        })
      });
      assert.strictEqual(bindRes.status, 400, 'Cross-event bind must return 400');
      const bindData = await bindRes.json();
      assert.strictEqual(bindData.code, 'EVENT_MISMATCH');
      passedScenarios++;
      console.log('  [PASS] Scenario 10: wrong-event wristband is rejected');
    }

    // Scenario 11: confirmation required before bind
    {
      const dashboardFilePath = path.join(process.cwd(), 'src/views/VolunteerEventDashboardView.tsx');
      const dashboardContent = fs.readFileSync(dashboardFilePath, 'utf8');

      assert.ok(
        dashboardContent.includes('Confirm assignment'),
        'UI must require volunteer to explicitly click Confirm assignment'
      );
      assert.ok(
        dashboardContent.includes('stagedWristband'),
        'UI must stage resolved wristband before binding mutation'
      );
      passedScenarios++;
      console.log('  [PASS] Scenario 11: confirmation required before bind');
    }

    // Scenario 12: successful bind changes band to active
    // Scenario 13: successful bind links same child_event_entry
    // Scenario 14: assignment does not auto check-in
    // Scenario 16: duplicate Confirm is idempotent
    {
      const idemKey = `idem-test-bind-${entry1Id}-${bandAvailable1.id}`;

      // Call bind with bandAvailable1 to entry1Id
      const bindRes = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({
          eventId: testEvent1Id,
          childEventEntryId: entry1Id,
          wristbandId: bandAvailable1.id,
          wristbandCode: bandAvailable1.wristband_code,
          idempotencyKey: idemKey
        })
      });
      assert.strictEqual(bindRes.status, 200, 'Binding must succeed');
      const bindData = await bindRes.json();
      assert.strictEqual(bindData.success, true);
      assert.strictEqual(bindData.wristband.status, 'active');

      // Verify DB state for Scenario 12
      const updatedBand = await queryOne<any>('SELECT * FROM wristbands WHERE id = ?', [bandAvailable1.id]);
      assert.strictEqual(updatedBand?.status, 'active', 'Wristband status in DB must be active');
      passedScenarios++;
      console.log('  [PASS] Scenario 12: successful bind changes band to active');

      // Verify DB state for Scenario 13
      const activeAssignment = await queryOne<any>(
        'SELECT * FROM child_wristband_assignments WHERE wristband_id = ? AND deactivated_at IS NULL',
        [bandAvailable1.id]
      );
      assert.strictEqual(activeAssignment?.child_event_entry_id, entry1Id, 'Must link to child1 entry');
      passedScenarios++;
      console.log('  [PASS] Scenario 13: successful bind links same child_event_entry');

      // Verify Scenario 14: Assignment does not auto check-in
      const entry1AfterBind = await queryOne<any>('SELECT * FROM child_event_entries WHERE id = ?', [entry1Id]);
      assert.strictEqual(entry1AfterBind?.status, 'pass_ready', 'Child status must remain pass_ready (NOT checked in)');
      assert.strictEqual(entry1AfterBind?.checked_in_at, null, 'Child checked_in_at must remain null');

      const attendanceCountChild1 = (await query<{ count: number }>(
        'SELECT COUNT(*) as count FROM attendance_records WHERE child_event_entry_id = ?',
        [entry1Id]
      ))[0].count;
      assert.strictEqual(attendanceCountChild1, 0, 'No attendance record must be created by wristband assignment');
      passedScenarios++;
      console.log('  [PASS] Scenario 14: assignment does not auto check-in');

      // Scenario 16: duplicate Confirm is idempotent
      const duplicateBindRes = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({
          eventId: testEvent1Id,
          childEventEntryId: entry1Id,
          wristbandId: bandAvailable1.id,
          wristbandCode: bandAvailable1.wristband_code,
          idempotencyKey: idemKey
        })
      });
      assert.strictEqual(duplicateBindRes.status, 200, 'Duplicate call with same idempotency key must succeed (200)');
      const dupData = await duplicateBindRes.json();
      assert.strictEqual(dupData.success, true);

      const assignmentCount = (await query<{ count: number }>(
        'SELECT COUNT(*) as count FROM child_wristband_assignments WHERE wristband_id = ?',
        [bandAvailable1.id]
      ))[0].count;
      assert.strictEqual(assignmentCount, 1, 'Idempotency must prevent multiple assignment rows');
      passedScenarios++;
      console.log('  [PASS] Scenario 16: duplicate Confirm is idempotent');
    }

    // Verify Scenario 4: No new wristband generated
    {
      const countAfterBinding = (await query<{ count: number }>('SELECT COUNT(*) as count FROM wristbands'))[0].count;
      assert.strictEqual(countAfterBinding, countBeforeBinding, 'No new wristband rows must be created during check-in assignment');
      passedScenarios++;
      console.log('  [PASS] Scenario 4: no new wristband is generated during assignment');
    }

    // Scenario 15: checked-in child can receive a band without duplicate attendance
    {
      // Child 2 was already checked in (entry2Id). It was bound to bandAvailable2 in Scenario 6.
      // Check attendance rows for child 2
      const attendanceCountChild2 = (await query<{ count: number }>(
        'SELECT COUNT(*) as count FROM attendance_records WHERE child_event_entry_id = ?',
        [entry2Id]
      ))[0].count;
      assert.strictEqual(attendanceCountChild2, 1, 'Checked-in child must have exactly 1 attendance record, no duplicate');
      passedScenarios++;
      console.log('  [PASS] Scenario 15: checked-in child can receive a band without duplicate attendance');
    }

    // Scenario 17: child with active band does not receive second normal assignment
    {
      // Provision another available band
      const bandExtra = await provisionWristband({
        eventId: testEvent1Id,
        nfcUid: '04:A1:01:99',
        wristbandCode: `WB-ASG099`,
        actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
      });

      const res = await fetch(`${baseUrl}/api/volunteer/wristbands/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({
          eventId: testEvent1Id,
          childEventEntryId: entry1Id,
          wristbandId: bandExtra.id
        })
      });
      assert.strictEqual(res.status, 409, 'Child with active band cannot receive second normal assignment');
      const data = await res.json();
      assert.strictEqual(data.code, 'CHILD_ALREADY_HAS_WRISTBAND');
      passedScenarios++;
      console.log('  [PASS] Scenario 17: child with active band does not receive second normal assignment');
    }

    // Scenario 18: View record remains functional after assignment
    {
      const res = await fetch(`${baseUrl}/api/volunteer/pass/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({ childEventEntryId: entry1Id })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.child.id, child1Id);
      assert.strictEqual(data.child.activeWristband.wristbandCode, bandAvailable1.wristband_code);
      assert.strictEqual(data.child.activeWristband.status, 'active');
      passedScenarios++;
      console.log('  [PASS] Scenario 18: View record remains functional after assignment');
    }

    // Scenario 19: pass QR child identification still works
    {
      const res = await fetch(`${baseUrl}/api/volunteer/children/resolve-identifier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({ eventId: testEvent1Id, identifier: pass1Ref })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.identifierType, 'pass');
      assert.strictEqual(data.childEventEntryId, entry1Id);
      passedScenarios++;
      console.log('  [PASS] Scenario 19: pass QR child identification still works');
    }

    // Scenario 20: WB/NFC child identification still works after assignment
    {
      // Identify by WB code
      const resWb = await fetch(`${baseUrl}/api/volunteer/children/resolve-identifier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({ eventId: testEvent1Id, identifier: bandAvailable1.wristband_code })
      });
      assert.strictEqual(resWb.status, 200);
      const dataWb = await resWb.json();
      assert.strictEqual(dataWb.success, true);
      assert.strictEqual(dataWb.identifierType, 'wristband_code');
      assert.strictEqual(dataWb.childEventEntryId, entry1Id);

      // Identify by NFC UID
      const resNfc = await fetch(`${baseUrl}/api/volunteer/children/resolve-identifier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({ eventId: testEvent1Id, identifier: bandAvailable1.nfc_uid })
      });
      assert.strictEqual(resNfc.status, 200);
      const dataNfc = await resNfc.json();
      assert.strictEqual(dataNfc.success, true);
      assert.strictEqual(dataNfc.identifierType, 'nfc_uid');
      assert.strictEqual(dataNfc.childEventEntryId, entry1Id);
      passedScenarios++;
      console.log('  [PASS] Scenario 20: WB/NFC child identification still works after assignment');
    }

    console.log(`\n================================================================`);
    console.log(`ALL ${passedScenarios}/20 INTEGRATION SCENARIOS PASSED SUCCESSFULLY.`);
    console.log('================================================================\n');

  } finally {
    server.close();
  }
}

runCheckInWristbandAssignmentTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[FATAL] Test failed:', err);
    process.exit(1);
  });
