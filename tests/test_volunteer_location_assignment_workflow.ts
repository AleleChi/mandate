/**
 * tests/test_volunteer_location_assignment_workflow.ts
 *
 * Automated regression test suite for Volunteer Location Assignment & Duty Management:
 * 1. Search with `query` and `search` parameters across full dataset (1000 limit).
 * 2. Exclusion diagnostics (already_assigned, invitation_pending, pending_approval, not_approved, inactive).
 * 3. Existing assignment payload returned for already_assigned volunteers.
 * 4. Duty assignment creation (POST) and update (PATCH) on `event_duty_assignments`.
 * 5. GET /api/admin/volunteers/:id returns active dutyAssignment with location details.
 * 6. GET /api/admin/events/:eventId/locations search matches ageGroupKey, teamKey, and description.
 * 7. Duplicate assignment protection.
 *
 * Run: cd worktrees/backend && npx tsx tests/test_volunteer_location_assignment_workflow.ts
 */

import assert from 'assert';
import express from 'express';
import { adminDutyRouter } from '../src/server/routes/duty';
import adminRoutes from '../src/server/routes/admin';
import { generateToken } from '../src/server/auth';
import { execute, queryOne, query } from '../src/server/db';

let passedCount = 0;
let failedCount = 0;
const failures: string[] = [];

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failures.push(name);
    failedCount++;
  }
}

async function main() {
  console.log('\n================================================================');
  console.log('VOLUNTEER LOCATION ASSIGNMENT & DUTY REGRESSION TEST SUITE');
  console.log('================================================================\n');

  const app = express();
  app.use(express.json());
  app.use('/api/admin/duty', adminDutyRouter);
  app.use('/api/admin', adminRoutes);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const runId = `vloc_${Date.now()}`;
  const testEventId = `event-vloc-test-${runId}`;
  const testLocationId1 = `loc-1-${runId}`;
  const testLocationId2 = `loc-2-${runId}`;
  const nowIso = new Date().toISOString();
  const shiftStart = new Date(Date.now() + 3600000).toISOString();
  const shiftEnd = new Date(Date.now() + 7200000).toISOString();

  // Admin user
  const adminUserId = `admin_${runId}`;
  const adminToken = generateToken(adminUserId);
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`
  };

  // Test volunteer users
  const eligibleVolId = `vol_elig_${runId}`;
  const assignedVolId = `vol_asgn_${runId}`;
  const pendingInviteVolId = `vol_invite_${runId}`;
  const pendingReviewVolId = `vol_rev_${runId}`;
  const notApprovedVolId = `vol_notapp_${runId}`;
  const inactiveVolId = `vol_inact_${runId}`;

  try {
    // Setup isolated test event and locations
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
      VALUES (?, ?, 'hash123', 'super_admin', 1, 'active', ?, ?)
    `, [adminUserId, `${adminUserId}@koinonia.test`, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, timezone, created_at, updated_at)
      VALUES (?, 'Location Assignment Test Event', 'current', '2026-11-21', '2026-11-22', 'Africa/Lagos', ?, ?)
    `, [testEventId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_locations (id, event_id, name, short_name, location_type, age_group_key, team_key, description, is_active, created_at, updated_at)
      VALUES (?, ?, 'Emerald Hall South', 'EHS', 'room', 'Ages 4–6', 'check_in', 'Main kindergarten hall checkin', 1, ?, ?)
    `, [testLocationId1, testEventId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_locations (id, event_id, name, short_name, location_type, age_group_key, team_key, description, is_active, created_at, updated_at)
      VALUES (?, ?, 'Sapphire Youth Lounge', 'SYL', 'zone', 'Ages 13–14', 'teens_ministry', 'Dedicated teen zone near gate 3', 1, ?, ?)
    `, [testLocationId2, testEventId, nowIso, nowIso]);

    // Setup Volunteers
    // 1. Eligible Volunteer (approved profile, active status)
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 1, 'active', ?, ?)
    `, [eligibleVolId, `eligible_${runId}@koinonia.test`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Chioma Nwosu', '+2348011112222', '+2348011112222', 'General assistance', 'approved', 0, ?, ?)
    `, [`vp_${eligibleVolId}`, eligibleVolId, nowIso, nowIso]);

    // 2. Already Assigned Volunteer
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 1, 'active', ?, ?)
    `, [assignedVolId, `assigned_${runId}@koinonia.test`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Amaka Okafor', '+2348022223333', '+2348022223333', 'General assistance', 'approved', 0, ?, ?)
    `, [`vp_${assignedVolId}`, assignedVolId, nowIso, nowIso]);

    const initialAssignmentId = `duty_init_${runId}`;
    await execute(`
      INSERT INTO event_duty_assignments (
        id, event_id, user_id, assigned_location_id, responsibility_key,
        starts_at, ends_at, status, assigned_age_groups, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'check_in_lead', ?, ?, 'scheduled', ?, ?, ?)
    `, [
      initialAssignmentId,
      testEventId,
      assignedVolId,
      testLocationId1,
      shiftStart,
      shiftEnd,
      JSON.stringify(['Ages 4–6']),
      nowIso,
      nowIso
    ]);

    // 3. Pending Setup / Invitation Pending Volunteer
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
      VALUES (?, ?, 'invited_pending', 'volunteer', 0, 'invited_pending', ?, ?)
    `, [pendingInviteVolId, `invite_${runId}@koinonia.test`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Blessing Eze', '+2348033334444', '+2348033334444', 'General assistance', 'pending', 0, ?, ?)
    `, [`vp_${pendingInviteVolId}`, pendingInviteVolId, nowIso, nowIso]);

    // 4. Pending Review Volunteer
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 1, 'active', ?, ?)
    `, [pendingReviewVolId, `review_${runId}@koinonia.test`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Damilola Ade', '+2348044445555', '+2348044445555', 'General assistance', 'pending', 0, ?, ?)
    `, [`vp_${pendingReviewVolId}`, pendingReviewVolId, nowIso, nowIso]);

    // 5. Not Approved Volunteer
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 1, 'active', ?, ?)
    `, [notApprovedVolId, `rejected_${runId}@koinonia.test`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Efe Oghenekaro', '+2348055556666', '+2348055556666', 'General assistance', 'rejected', 0, ?, ?)
    `, [`vp_${notApprovedVolId}`, notApprovedVolId, nowIso, nowIso]);

    // 6. Inactive Volunteer
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 1, 'inactive', ?, ?)
    `, [inactiveVolId, `inactive_${runId}@koinonia.test`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Funke Bakare', '+2348066667777', '+2348066667777', 'General assistance', 'approved', 0, ?, ?)
    `, [`vp_${inactiveVolId}`, inactiveVolId, nowIso, nowIso]);

    // -------------------------------------------------------------
    // TEST 1: API accepts ?query= parameter for volunteer search
    // -------------------------------------------------------------
    await runTest('API accepts ?query= parameter and returns eligible volunteer', async () => {
      const res = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members?query=Chioma`, {
        headers
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      const found = data.members.find((m: any) => m.userId === eligibleVolId);
      assert.ok(found, 'Should find Chioma using ?query= parameter');
      assert.strictEqual(found.fullName, 'Chioma Nwosu');
    });

    // -------------------------------------------------------------
    // TEST 2: API accepts ?search= parameter (frontend compatibility)
    // -------------------------------------------------------------
    await runTest('API accepts ?search= parameter and returns eligible volunteer', async () => {
      const res = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members?search=Nwosu`, {
        headers
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      const found = data.members.find((m: any) => m.userId === eligibleVolId);
      assert.ok(found, 'Should find Chioma using ?search= parameter');
    });

    // -------------------------------------------------------------
    // TEST 3: Search returns excluded volunteer with already_assigned & existingAssignment
    // -------------------------------------------------------------
    await runTest('Search returns excluded already_assigned volunteer with existingAssignment details', async () => {
      const res = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members?query=Amaka`, {
        headers
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.excluded), 'Response must include excluded list');
      const excluded = data.excluded.find((x: any) => x.userId === assignedVolId);
      assert.ok(excluded, 'Amaka should be present in excluded list');
      assert.strictEqual(excluded.reason, 'already_assigned');
      assert.ok(excluded.existingAssignment, 'Excluded record must have existingAssignment payload');
      assert.strictEqual(excluded.existingAssignment.id, initialAssignmentId);
      assert.strictEqual(excluded.existingAssignment.locationId, testLocationId1);
      assert.strictEqual(excluded.existingAssignment.locationName, 'Emerald Hall South');
    });

    // -------------------------------------------------------------
    // TEST 4: Search returns exclusion reasons for pending setup and review
    // -------------------------------------------------------------
    await runTest('Search returns accurate exclusion diagnostics for pending setup and review status', async () => {
      // 4a. Pending setup / invite
      const resInvite = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members?query=Blessing`, {
        headers
      });
      const dataInvite = await resInvite.json();
      const exInvite = dataInvite.excluded.find((x: any) => x.userId === pendingInviteVolId);
      assert.ok(exInvite, 'Blessing should be in excluded list');
      assert.strictEqual(exInvite.reason, 'invitation_pending');

      // 4b. Pending review
      const resRev = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members?query=Damilola`, {
        headers
      });
      const dataRev = await resRev.json();
      const exRev = dataRev.excluded.find((x: any) => x.userId === pendingReviewVolId);
      assert.ok(exRev, 'Damilola should be in excluded list');
      assert.strictEqual(exRev.reason, 'pending_approval');

      // 4c. Not approved
      const resNotApp = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members?query=Oghenekaro`, {
        headers
      });
      const dataNotApp = await resNotApp.json();
      const exNotApp = dataNotApp.excluded.find((x: any) => x.userId === notApprovedVolId);
      assert.ok(exNotApp, 'Efe should be in excluded list');
      assert.strictEqual(exNotApp.reason, 'not_approved');

      // 4d. Inactive account
      const resInact = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members?query=Bakare`, {
        headers
      });
      const dataInact = await resInact.json();
      const exInact = dataInact.excluded.find((x: any) => x.userId === inactiveVolId);
      assert.ok(exInact, 'Funke should be in excluded list');
      assert.strictEqual(exInact.reason, 'inactive');
    });

    // -------------------------------------------------------------
    // TEST 5: Assign volunteer to location via POST
    // -------------------------------------------------------------
    let newAssignmentId = '';
    await runTest('POST /events/:eventId/duty-assignments assigns volunteer to location', async () => {
      const payload = {
        userIds: [eligibleVolId],
        assignedLocationId: testLocationId2,
        responsibilityKey: 'scanner',
        status: 'scheduled',
        assignedAgeGroups: ['Ages 13–14'],
        startsAt: shiftStart,
        endsAt: shiftEnd,
        note: 'Assigned to teen lounge for verification'
      };

      const res = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/duty-assignments`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.count, 1);

      // Verify in DB
      const row = await queryOne<any>(`
        SELECT * FROM event_duty_assignments
        WHERE event_id = ? AND user_id = ? AND status = 'scheduled'
      `, [testEventId, eligibleVolId]);

      assert.ok(row, 'Duty assignment record must exist in DB');
      assert.strictEqual(row.assigned_location_id, testLocationId2);
      assert.strictEqual(row.responsibility_key, 'scanner');
      newAssignmentId = row.id;
    });

    // -------------------------------------------------------------
    // TEST 6: GET /api/admin/volunteers/:id returns dutyAssignment details
    // -------------------------------------------------------------
    await runTest('GET /api/admin/volunteers/:id returns assigned location and shift details', async () => {
      const res = await fetch(`${baseUrl}/api/admin/volunteers/${eligibleVolId}?eventId=${testEventId}`, {
        headers
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.volunteer, 'Must return volunteer profile');
      assert.ok(data.volunteer.dutyAssignment, 'Must return dutyAssignment object');
      assert.strictEqual(data.volunteer.dutyAssignment.id, newAssignmentId);
      assert.strictEqual(data.volunteer.dutyAssignment.locationId, testLocationId2);
      assert.strictEqual(data.volunteer.dutyAssignment.locationName, 'Sapphire Youth Lounge');
      assert.strictEqual(data.volunteer.dutyAssignment.locationShortName, 'SYL');
    });

    // -------------------------------------------------------------
    // TEST 7: Edit existing assignment via PATCH
    // -------------------------------------------------------------
    await runTest('PATCH /duty-assignments/:id updates location, age groups, and shift window', async () => {
      const updatedEnd = new Date(Date.now() + 10800000).toISOString();
      const patchPayload = {
        userId: eligibleVolId,
        assignedLocationId: testLocationId1,
        responsibilityKey: 'check_in_assistant',
        status: 'scheduled',
        assignedAgeGroups: ['Ages 4–6', 'Ages 7–9'],
        startsAt: shiftStart,
        endsAt: updatedEnd,
        note: 'Reassigned to Emerald Hall South'
      };

      const res = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/duty-assignments/${newAssignmentId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patchPayload)
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      // Verify updated assignment in DB
      const row = await queryOne<any>(`
        SELECT * FROM event_duty_assignments WHERE id = ?
      `, [newAssignmentId]);
      assert.strictEqual(row.assigned_location_id, testLocationId1);
      assert.strictEqual(row.responsibility_key, 'check_in_assistant');
      const ages = JSON.parse(row.assigned_age_groups);
      assert.deepStrictEqual(ages, ['4–6', '7–9']);
    });

    // -------------------------------------------------------------
    // TEST 8: GET /api/admin/events/:eventId/locations matches ageGroupKey & description
    // -------------------------------------------------------------
    await runTest('GET /api/admin/events/:eventId/locations filters by ageGroupKey, teamKey, and description', async () => {
      // 8a. Match by ageGroupKey 'Ages 4–6'
      const resAge = await fetch(`${baseUrl}/api/admin/events/${testEventId}/locations?search=4-6`, {
        headers
      });
      assert.strictEqual(resAge.status, 200);
      const dataAge = await resAge.json();
      assert.strictEqual(dataAge.success, true);
      const locAge = dataAge.locations.find((l: any) => l.id === testLocationId1);
      assert.ok(locAge, 'Should find Emerald Hall South when searching for age group "4-6"');

      // 8b. Match by description 'kindergarten'
      const resDesc = await fetch(`${baseUrl}/api/admin/events/${testEventId}/locations?search=kindergarten`, {
        headers
      });
      assert.strictEqual(resDesc.status, 200);
      const dataDesc = await resDesc.json();
      const locDesc = dataDesc.locations.find((l: any) => l.id === testLocationId1);
      assert.ok(locDesc, 'Should find location by description keyword "kindergarten"');

      // 8c. Match by teamKey 'teens_ministry'
      const resTeam = await fetch(`${baseUrl}/api/admin/events/${testEventId}/locations?search=teens_ministry`, {
        headers
      });
      assert.strictEqual(resTeam.status, 200);
      const dataTeam = await resTeam.json();
      const locTeam = dataTeam.locations.find((l: any) => l.id === testLocationId2);
      assert.ok(locTeam, 'Should find Sapphire Youth Lounge when searching teamKey');
    });

    // -------------------------------------------------------------
    // TEST 9: Duplicate assignment protection
    // -------------------------------------------------------------
    await runTest('Duplicate assignment prevention guards against assigning the same volunteer twice', async () => {
      const duplicatePayload = {
        userIds: [eligibleVolId],
        assignedLocationId: testLocationId2,
        responsibilityKey: 'floater',
        status: 'scheduled',
        assignedAgeGroups: ['Ages 4–6'],
        startsAt: shiftStart,
        endsAt: shiftEnd
      };

      const res = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/duty-assignments`, {
        method: 'POST',
        headers,
        body: JSON.stringify(duplicatePayload)
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      // Verify that duplicate protection updated the record in-place rather than creating a 2nd row
      const countRow = await queryOne<any>(`
        SELECT COUNT(*) as count FROM event_duty_assignments
        WHERE event_id = ? AND user_id = ? AND status NOT IN ('cancelled', 'ended')
      `, [testEventId, eligibleVolId]);
      assert.strictEqual(Number(countRow.count), 1, 'Duplicate protection must guarantee at most 1 active assignment per volunteer');
    });

  } finally {
    // Cleanup test records
    try {
      await execute(`DELETE FROM event_duty_assignments WHERE event_id = ?`, [testEventId]);
      await execute(`DELETE FROM event_locations WHERE event_id = ?`, [testEventId]);
      await execute(`DELETE FROM volunteer_profiles WHERE user_id IN (?, ?, ?, ?, ?, ?)`, [
        eligibleVolId, assignedVolId, pendingInviteVolId, pendingReviewVolId, notApprovedVolId, inactiveVolId
      ]);
      await execute(`DELETE FROM users WHERE id IN (?, ?, ?, ?, ?, ?, ?)`, [
        adminUserId, eligibleVolId, assignedVolId, pendingInviteVolId, pendingReviewVolId, notApprovedVolId, inactiveVolId
      ]);
      await execute(`DELETE FROM events WHERE id = ?`, [testEventId]);
    } catch (cleanupErr) {
      console.error('Test cleanup error:', cleanupErr);
    }

    server.close();
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`RESULTS: ${passedCount} passed, ${failedCount} failed`);
  console.log('----------------------------------------------------------------\n');

  if (failedCount > 0) {
    console.error('Failed tests:', failures);
    process.exit(1);
  } else {
    console.log('All Volunteer Location Assignment & Duty tests passed successfully!\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
