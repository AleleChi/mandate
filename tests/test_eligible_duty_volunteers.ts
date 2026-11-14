/**
 * tests/test_eligible_duty_volunteers.ts
 *
 * Automated regression test suite for Event Duty eligible-team-members pipeline
 * and duty assignment workflows (Mandate Section 27, Tests 1–10).
 *
 * Run: npx tsx tests/test_eligible_duty_volunteers.ts
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
  console.log('EVENT DUTY ELIGIBLE TEAM MEMBERS REGRESSION TEST SUITE');
  console.log('================================================================\n');

  // Setup test Express app with admin duty routes
  const app = express();
  app.use(express.json());
  app.use('/api/admin/duty', adminDutyRouter);
  app.use('/api/admin', adminRoutes);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const runId = `test_${Date.now()}`;
  const testEventId = `event-ga-test-${runId}`;
  const otherEventId = `event-other-test-${runId}`;
  const nowIso = new Date().toISOString();
  const shiftStart = new Date(Date.now() + 3600000).toISOString();
  const shiftEnd = new Date(Date.now() + 7200000).toISOString();

  // Admin user for making authenticated calls
  const adminUserId = `admin_${runId}`;
  const adminToken = generateToken(adminUserId);

  try {
    // 0. Seed test events and admin user
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
      VALUES (?, ?, 'hash123', 'super_admin', 1, 'active', ?, ?)
    `, [adminUserId, `${adminUserId}@koinonia.test`, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, timezone, created_at, updated_at)
      VALUES (?, 'GA Test Event', 'current', '2026-11-21', '2026-11-22', 'Africa/Lagos', ?, ?)
    `, [testEventId, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, timezone, created_at, updated_at)
      VALUES (?, 'Other Test Event', 'upcoming', '2026-12-01', '2026-12-02', 'Africa/Lagos', ?, ?)
    `, [otherEventId, nowIso, nowIso]);

    // Seed test location
    const testLocationId = `loc_${runId}`;
    await execute(`
      INSERT INTO event_locations (id, event_id, name, location_type, is_active, created_at, updated_at)
      VALUES (?, ?, 'Main Pavilion Test', 'general', 1, ?, ?)
    `, [testLocationId, testEventId, nowIso, nowIso]);

    // Helper to create volunteer fixture
    async function createVolunteer(opts: {
      userId: string;
      email: string;
      fullName: string;
      phone: string;
      userRole?: string;
      userStatus?: string;
      passwordHash?: string;
      volStatus?: string;
      isDeleted?: number;
      isKoinoniaWorker?: number;
    }) {
      const uRole = opts.userRole || 'volunteer';
      const uStatus = opts.userStatus || 'active';
      const pwHash = opts.passwordHash || 'pwd_hash';
      const vStatus = opts.volStatus || 'approved';
      const isDel = opts.isDeleted ?? 0;
      const isWorker = opts.isKoinoniaWorker ?? 0;

      await execute(`
        INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `, [opts.userId, opts.email, pwHash, uRole, uStatus, nowIso, nowIso]);

      await execute(`
        INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, is_deleted, is_koinonia_worker, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'General Team', ?, ?, ?, ?, ?)
      `, [`vp_${opts.userId}`, opts.userId, opts.fullName, opts.phone, opts.phone, vStatus, isDel, isWorker, nowIso, nowIso]);
    }

    // -------------------------------------------------------------------------
    // Test 1 — Active volunteer: active volunteer, no assignment => INCLUDED
    // -------------------------------------------------------------------------
    const vol1Id = `vol1_${runId}`;
    await createVolunteer({
      userId: vol1Id,
      email: `vol1_${runId}@koinonia.test`,
      fullName: 'Alice Active Volunteer',
      phone: '+2348011111111'
    });

    await runTest('Test 1: Active volunteer with no assignment is INCLUDED', async () => {
      const res = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(body.success === true, 'Expected success: true');
      const found = (body.items || []).find((m: any) => m.id === vol1Id || m.user_id === vol1Id);
      assert(!!found, 'Expected active volunteer Alice to be in eligible items');
      assert(found.full_name === 'Alice Active Volunteer', 'Expected matching full name');
    });

    // -------------------------------------------------------------------------
    // Test 2 — Active Staff-classified volunteer: is_koinonia_worker = 1 => INCLUDED
    // -------------------------------------------------------------------------
    const vol2Id = `vol2_${runId}`;
    await createVolunteer({
      userId: vol2Id,
      email: `vol2_${runId}@koinonia.test`,
      fullName: 'Bob Staff Worker',
      phone: '+2348022222222',
      isKoinoniaWorker: 1
    });

    await runTest('Test 2: Active staff-classified volunteer (is_koinonia_worker=1) is INCLUDED', async () => {
      const res = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const body = await res.json();
      const found = (body.items || []).find((m: any) => m.id === vol2Id || m.user_id === vol2Id);
      assert(!!found, 'Expected staff volunteer Bob to be included');
      assert(found.is_koinonia_worker === 1 || found.is_koinonia_worker === true, 'Expected is_koinonia_worker = 1');
    });

    // -------------------------------------------------------------------------
    // Test 3 — Pending invitation: password_hash = 'invited_pending' => EXCLUDED
    // -------------------------------------------------------------------------
    const vol3Id = `vol3_${runId}`;
    await createVolunteer({
      userId: vol3Id,
      email: `vol3_${runId}@koinonia.test`,
      fullName: 'Charlie Pending Invite',
      phone: '+2348033333333',
      passwordHash: 'invited_pending'
    });

    await runTest('Test 3: Pending invitation account is EXCLUDED from eligible picker', async () => {
      const res = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const body = await res.json();
      const found = (body.items || []).find((m: any) => m.id === vol3Id || m.user_id === vol3Id);
      assert(!found, 'Expected pending invitation user Charlie to be EXCLUDED');
    });

    // -------------------------------------------------------------------------
    // Test 4 — Inactive/deactivated user status: => EXCLUDED
    // -------------------------------------------------------------------------
    const vol4Id = `vol4_${runId}`;
    await createVolunteer({
      userId: vol4Id,
      email: `vol4_${runId}@koinonia.test`,
      fullName: 'David Inactive User',
      phone: '+2348044444444',
      userStatus: 'inactive'
    });

    const vol4RevokedId = `vol4rev_${runId}`;
    await createVolunteer({
      userId: vol4RevokedId,
      email: `vol4rev_${runId}@koinonia.test`,
      fullName: 'Daisy Revoked User',
      phone: '+2348044444445',
      userStatus: 'revoked'
    });

    await runTest('Test 4: Inactive and revoked accounts are EXCLUDED', async () => {
      const res = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const body = await res.json();
      const foundInactive = (body.items || []).find((m: any) => m.id === vol4Id || m.user_id === vol4Id);
      const foundRevoked = (body.items || []).find((m: any) => m.id === vol4RevokedId || m.user_id === vol4RevokedId);
      assert(!foundInactive, 'Expected inactive user David to be EXCLUDED');
      assert(!foundRevoked, 'Expected revoked user Daisy to be EXCLUDED');
    });

    // -------------------------------------------------------------------------
    // Test 5 — Active assignment exists: non-cancelled assignment => EXCLUDED from picker
    // -------------------------------------------------------------------------
    const vol5Id = `vol5_${runId}`;
    await createVolunteer({
      userId: vol5Id,
      email: `vol5_${runId}@koinonia.test`,
      fullName: 'Eve Assigned Volunteer',
      phone: '+2348055555555'
    });

    // Assign Eve to testEventId
    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'Room Operator', 'scheduled', ?, ?, ?, ?)
    `, [`asgn_${vol5Id}`, testEventId, vol5Id, shiftStart, shiftEnd, nowIso, nowIso]);

    await runTest('Test 5: Volunteer with active assignment for event is EXCLUDED from new assignment picker', async () => {
      const res = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const body = await res.json();
      const found = (body.items || []).find((m: any) => m.id === vol5Id || m.user_id === vol5Id);
      assert(!found, 'Expected already assigned volunteer Eve to be EXCLUDED from new-assignment picker');

      // But when includeAssigned=true is passed, Eve should be present
      const resAll = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members?includeAssigned=true`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const bodyAll = await resAll.json();
      const foundAll = (bodyAll.items || []).find((m: any) => m.id === vol5Id || m.user_id === vol5Id);
      assert(!!foundAll, 'Expected Eve to be returned when includeAssigned=true');
      assert(Number(foundAll.active_assignments_count) >= 1, 'Expected active_assignments_count >= 1');
    });

    // -------------------------------------------------------------------------
    // Test 6 — Cancelled historical assignment => INCLUDED
    // -------------------------------------------------------------------------
    const vol6Id = `vol6_${runId}`;
    await createVolunteer({
      userId: vol6Id,
      email: `vol6_${runId}@koinonia.test`,
      fullName: 'Frank Cancelled Past Assignment',
      phone: '+2348066666666'
    });

    // Add cancelled assignment
    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'Room Operator', 'cancelled', ?, ?, ?, ?)
    `, [`asgn_canc_${vol6Id}`, testEventId, vol6Id, shiftStart, shiftEnd, nowIso, nowIso]);

    await runTest('Test 6: Volunteer with only cancelled assignment remains INCLUDED', async () => {
      const res = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const body = await res.json();
      const found = (body.items || []).find((m: any) => m.id === vol6Id || m.user_id === vol6Id);
      assert(!!found, 'Expected volunteer Frank with cancelled assignment to be INCLUDED');
    });

    // -------------------------------------------------------------------------
    // Test 7 — Different event assignment => INCLUDED for current event
    // -------------------------------------------------------------------------
    const vol7Id = `vol7_${runId}`;
    await createVolunteer({
      userId: vol7Id,
      email: `vol7_${runId}@koinonia.test`,
      fullName: 'Grace Other Event Assigned',
      phone: '+2348077777777'
    });

    // Assign Grace to otherEventId
    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'Room Operator', 'on_duty', ?, ?, ?, ?)
    `, [`asgn_other_${vol7Id}`, otherEventId, vol7Id, shiftStart, shiftEnd, nowIso, nowIso]);

    await runTest('Test 7: Assignment for another event does NOT exclude volunteer from current event', async () => {
      const res = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const body = await res.json();
      const found = (body.items || []).find((m: any) => m.id === vol7Id || m.user_id === vol7Id);
      assert(!!found, 'Expected Grace (assigned only to other event) to be INCLUDED for current event');
    });

    // -------------------------------------------------------------------------
    // Test 8 — Search by name, email, phone returns correct active volunteer
    // -------------------------------------------------------------------------
    const vol8Id = `vol8_${runId}`;
    const vol8Phone = `88${runId.slice(-6)}`;
    await createVolunteer({
      userId: vol8Id,
      email: `searchtarget_${runId}@koinonia.test`,
      fullName: `Hannah_${runId} Search Target`,
      phone: `+234${vol8Phone}`
    });

    await runTest('Test 8: Search by name, email, or phone returns exact match', async () => {
      // 8a: Search by unique name
      const resName = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members?query=Hannah_${runId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const bodyName = await resName.json();
      assert(bodyName.items.length === 1, `Expected 1 match for Hannah_${runId}, got ${bodyName.items.length}`);
      assert(bodyName.items[0].id === vol8Id, 'Expected matching user id for Hannah');

      // 8b: Search by email
      const resEmail = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members?query=searchtarget_${runId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const bodyEmail = await resEmail.json();
      assert(bodyEmail.items.length === 1, `Expected 1 match for email, got ${bodyEmail.items.length}`);
      assert(bodyEmail.items[0].id === vol8Id, 'Expected matching user id for email search');

      // 8c: Search by phone
      const resPhone = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members?query=${vol8Phone}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const bodyPhone = await resPhone.json();
      assert(bodyPhone.items.length === 1, `Expected 1 match for phone, got ${bodyPhone.items.length}`);
      assert(bodyPhone.items[0].id === vol8Id, 'Expected matching user id for phone search');
    });

    // -------------------------------------------------------------------------
    // Test 9 — Pagination / large dataset: proves picker does not truncate at 25
    // -------------------------------------------------------------------------
    await runTest('Test 9: Large dataset retrieval respects limit > 25 and does not truncate', async () => {
      // Seed 30 batch volunteers
      for (let i = 1; i <= 30; i++) {
        const bId = `batch_${i}_${runId}`;
        await createVolunteer({
          userId: bId,
          email: `batch_${i}_${runId}@koinonia.test`,
          fullName: `Batch Volunteer ${String(i).padStart(2, '0')}`,
          phone: `+234800000${String(i).padStart(4, '0')}`
        });
      }

      // Query with default limit (should return all seeded unassigned volunteers > 25)
      const res = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/eligible-team-members`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const body = await res.json();
      assert(body.items.length >= 30, `Expected at least 30 volunteers, got ${body.items.length}`);
      assert(body.pagination.total >= 30, `Expected total >= 30, got ${body.pagination.total}`);
    });

    // -------------------------------------------------------------------------
    // Test 10 — Assignment persistence: volunteer, location, age groups, role, shift
    // -------------------------------------------------------------------------
    const vol10Id = `vol10_${runId}`;
    await createVolunteer({
      userId: vol10Id,
      email: `vol10_${runId}@koinonia.test`,
      fullName: 'Isaac Assignment Verify',
      phone: '+2348099991111'
    });

    await runTest('Test 10: Assignment persistence (location, canonical age groups, role, shift window)', async () => {
      // Create assignment via POST
      const postRes = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/duty-assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          userId: vol10Id,
          responsibilityKey: 'Room Operator',
          teamKey: 'general_response',
          assignmentLevel: 'primary',
          status: 'scheduled',
          assignedLocationId: testLocationId,
          assignedAgeGroups: ['Ages 4–6', 'Ages 7–9', '13–14'],
          startsAt: shiftStart,
          endsAt: shiftEnd,
          note: 'Assigned during regression suite verification'
        })
      });

      assert(postRes.status === 200, `Expected 200 on create assignment, got ${postRes.status}`);
      const postBody = await postRes.json();
      assert(postBody.success === true, 'Expected POST success = true');

      // Query back via GET duty-assignments
      const getRes = await fetch(`${baseUrl}/api/admin/duty/events/${testEventId}/duty-assignments?query=Isaac`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert(getRes.status === 200, `Expected 200 on get assignments, got ${getRes.status}`);
      const getBody = await getRes.json();
      const saved = (getBody.assignments || getBody.items || []).find((a: any) => a.user_id === vol10Id);
      assert(!!saved, 'Expected to find saved assignment for Isaac');

      // Verify fields
      assert(saved.responsibility_key === 'Room Operator', `Expected Room Operator, got ${saved.responsibility_key}`);
      assert(saved.assigned_location_id === testLocationId, `Expected location ${testLocationId}, got ${saved.assigned_location_id}`);
      assert(saved.assigned_location_name === 'Main Pavilion Test', `Expected location name Main Pavilion Test, got ${saved.assigned_location_name}`);

      // Verify canonical age groups persisted
      const groups = saved.assignedAgeGroups;
      assert(Array.isArray(groups), 'Expected assignedAgeGroups to be an array');
      assert(groups.includes('4–6'), 'Expected group 4–6');
      assert(groups.includes('7–9'), 'Expected group 7–9');
      assert(groups.includes('13–14'), 'Expected group 13–14');

      // Verify shift window
      assert(new Date(saved.starts_at).getTime() === new Date(shiftStart).getTime(), 'Expected starts_at match');
      assert(new Date(saved.ends_at).getTime() === new Date(shiftEnd).getTime(), 'Expected ends_at match');
    });

  } finally {
    server.close();
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('----------------------------------------------------------------\n');

  if (failedCount > 0) {
    console.error('Failed tests:', failures);
    process.exit(1);
  } else {
    console.log('ALL 10 REGRESSION TESTS PASSED SUCCESSFULLY.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
