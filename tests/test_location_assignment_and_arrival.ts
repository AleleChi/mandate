/**
 * tests/test_location_assignment_and_arrival.ts
 *
 * Automated regression test suite for Location-Centric Duty Assignment & Volunteer Arrival Pipeline:
 * 1. Location assignment with prefilled location and canonical age groups.
 * 2. Location coverage counts increment and assigned responders list updates.
 * 3. Bulk assignment of multiple volunteers to same location/age/role/shift.
 * 4. Age distinction: room 'All Ages' vs volunteer 'Ages 13–14'.
 * 5. Duplicate active assignment protection.
 * 6. Arrival succeeds when valid assignment + duty window open.
 * 7. Duplicate arrival returns alreadyPresent: true without creating duplicate presence.
 * 8. Mismatched location QR rejected with ASSIGNED_ELSEWHERE.
 * 9. Duty window closed returns proper operational codes (DUTY_NOT_STARTED, EVENT_NOT_STARTED).
 * 10. Unassigned location volunteer reporting for duty rejected with LOCATION_MISSING.
 *
 * Run: npx tsx tests/test_location_assignment_and_arrival.ts
 */

import assert from 'assert';
import express from 'express';
import { adminDutyRouter, dutyRouter } from '../src/server/routes/duty';
import adminRoutes from '../src/server/routes/admin';
import { generateToken } from '../src/server/auth';
import { execute, queryOne, query } from '../src/server/db';
import { getCurrentEventId, setCurrentEvent } from '../src/server/services/eventService';
import crypto from 'crypto';

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
  console.log('LOCATION-CENTRIC ASSIGNMENT & VOLUNTEER ARRIVAL REGRESSION TESTS');
  console.log('================================================================\n');

  const app = express();
  app.use(express.json());
  app.use('/api/admin/duty', adminDutyRouter);
  app.use('/api/admin', adminRoutes);
  app.use('/api/duty', dutyRouter);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const runId = `test_loc_${Date.now()}`;
  const testEventId = `event-ga-loc-${runId}`;
  const nowIso = new Date().toISOString();

  // Shift starting right now so window is open
  const openShiftStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const openShiftEnd = new Date(Date.now() + 4 * 3600 * 1000).toISOString();

  // Shift starting tomorrow so window is closed
  const futureShiftStart = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const futureShiftEnd = new Date(Date.now() + 28 * 3600 * 1000).toISOString();

  // Admin user
  const adminUserId = `admin_${runId}`;
  const adminToken = generateToken(adminUserId);

  // Volunteers
  const vol1Id = `vol1_${runId}`;
  const vol1Token = generateToken(vol1Id);

  const vol2Id = `vol2_${runId}`;
  const vol2Token = generateToken(vol2Id);

  const vol3Id = `vol3_${runId}`;
  const vol3Token = generateToken(vol3Id);

  // Locations
  const locAId = `loc_a_${runId}`;
  const locBId = `loc_b_${runId}`;

  // QR Token for Loc A & Loc B
  const locAToken = `loc_token_a_${runId}`;
  const locBToken = `loc_token_b_${runId}`;

  let originalEventId: string | null = null;

  try {
    // Clean up any lingering test events with 'current' status
    await execute("UPDATE events SET status = 'upcoming' WHERE id LIKE 'event-ga-test%' OR id LIKE 'ev-scan%' OR id LIKE 'event-ga-loc%'");
    originalEventId = await getCurrentEventId() || 'event-ga-2026';

    // 1. Seed test event
    await execute(
      `INSERT INTO events (id, title, status, starts_at, ends_at, timezone, created_at, updated_at)
       VALUES (?, ?, 'upcoming', ?, ?, 'Africa/Lagos', ?, ?)`,
      [testEventId, `Test Location Assignment Event ${runId}`, openShiftStart, openShiftEnd, nowIso, nowIso]
    );

    await setCurrentEvent(testEventId);

    // 2. Seed admin user
    await execute(
      `INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, 'hash', 'admin', ?, ?)`,
      [adminUserId, `admin.${runId}@test.local`, nowIso, nowIso]
    );

    // 3. Seed volunteer users & profiles
    for (const [vId, name, email] of [
      [vol1Id, 'Volunteer Alpha', `vol1.${runId}@test.local`],
      [vol2Id, 'Volunteer Beta', `vol2.${runId}@test.local`],
      [vol3Id, 'Volunteer Gamma', `vol3.${runId}@test.local`],
    ]) {
      await execute(
        `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
         VALUES (?, ?, 'hash', 'volunteer', 'active', ?, ?)`,
        [vId, email, nowIso, nowIso]
      );
      await execute(
        `INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
         VALUES (?, ?, ?, '+2348011112222', '+2348011112222', 'General Team', 'approved', ?, ?)`,
        [`vp_${vId}`, vId, name, nowIso, nowIso]
      );
    }

    // 4. Seed locations: Loc A ('All Ages') and Loc B ('Ages 7–9')
    await execute(
      `INSERT INTO event_locations (id, event_id, name, location_type, age_group_key, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, 'Upper Teens Hall', 'room', 'All Ages', 1, 1, ?, ?)`,
      [locAId, testEventId, nowIso, nowIso]
    );
    await execute(
      `INSERT INTO event_location_codes (id, event_location_id, token_hash, is_active, generated_at)
       VALUES (?, ?, ?, 1, ?)`,
      [`code_a_${runId}`, locAId, locAToken, nowIso]
    );

    await execute(
      `INSERT INTO event_locations (id, event_id, name, location_type, age_group_key, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, 'Junior Classroom', 'room', '7–9', 1, 2, ?, ?)`,
      [locBId, testEventId, nowIso, nowIso]
    );
    await execute(
      `INSERT INTO event_location_codes (id, event_location_id, token_hash, is_active, generated_at)
       VALUES (?, ?, ?, 1, ?)`,
      [`code_b_${runId}`, locBId, locBToken, nowIso]
    );

    // TEST 1: Location assignment with prefilled location and canonical age groups
    await runTest('1. Create duty assignment with prefilled location and canonical age groups', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${testEventId}/duty-assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          userId: vol1Id,
          assignedLocationId: locAId,
          responsibilityKey: 'Room Operator',
          assignedAgeGroups: ['Ages 13–14'],
          status: 'scheduled',
          startsAt: openShiftStart,
          endsAt: openShiftEnd,
          note: 'Location prefilled assignment test'
        })
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      assert.ok(body.assignmentId || body.assignmentIds?.[0], 'Expected assignmentId in response');
      const assignId = body.assignmentId || body.assignmentIds[0];

      // Verify in DB
      const dbRow = await queryOne<any>(
        `SELECT * FROM event_duty_assignments WHERE id = ?`,
        [assignId]
      );
      assert.ok(dbRow);
      assert.strictEqual(dbRow.assigned_location_id, locAId);
      assert.strictEqual(dbRow.responsibility_key, 'Room Operator');
    });

    // TEST 2: Location coverage counts increment and assigned responders list updates
    await runTest('2. Coverage endpoint reflects assigned volunteer and canonical age groups', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${testEventId}/locations/${locAId}/coverage`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      const assigned = body.coverage?.assignedResponders || [];
      assert.ok(assigned.length >= 1, `Expected at least 1 assigned responder, got ${assigned.length}`);

      const responder = assigned.find((r: any) => r.userId === vol1Id);
      assert.ok(responder, 'Expected vol1 in assignedResponders list');
      assert.strictEqual(responder.responsibilityKey, 'Room Operator');
      assert.ok(Array.isArray(responder.assignedAgeGroups), 'Expected assignedAgeGroups array');
      assert.ok(responder.assignedAgeGroups.includes('Ages 13–14') || responder.assignedAgeGroups.includes('13–14'));
    });

    // TEST 3: Bulk assignment of multiple volunteers to same location/age/role/shift
    await runTest('3. Bulk assignment assigns multiple volunteers in single request', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${testEventId}/duty-assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          userIds: [vol2Id, vol3Id],
          assignedLocationId: locAId,
          responsibilityKey: 'General Response',
          assignedAgeGroups: ['Ages 10–12', 'Ages 13–14'],
          status: 'scheduled',
          startsAt: openShiftStart,
          endsAt: openShiftEnd
        })
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.count, 2, 'Expected count of 2 assignments');

      // Verify both volunteers are now assigned to locA
      const rows = await query<any>(
        `SELECT user_id, assigned_location_id FROM event_duty_assignments
         WHERE event_id = ? AND user_id IN (?, ?)`,
        [testEventId, vol2Id, vol3Id]
      );
      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0].assigned_location_id, locAId);
      assert.strictEqual(rows[1].assigned_location_id, locAId);
    });

    // TEST 4: Age distinction: room 'All Ages' vs volunteer 'Ages 13–14'
    await runTest('4. Volunteer assigned age group preserved distinct from room age group', async () => {
      const res = await fetch(`${baseUrl}/api/duty/current-location`, {
        headers: {
          'Authorization': `Bearer ${vol1Token}`
        }
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      assert.ok(body.presence, 'Expected presence/assignment payload');

      // Room is 'All Ages', but volunteer is assigned 'Ages 13–14'
      assert.strictEqual(body.presence.locationAgeGroup, 'All Ages');
      assert.ok(body.presence.ageGroup.includes('13–14'), `Expected volunteer ageGroup to contain 13–14, got ${body.presence.ageGroup}`);
      assert.ok(body.presence.assignedAgeGroups.some((g: string) => g.includes('13–14')), 'Expected assignedAgeGroups to include 13–14');
    });

    // TEST 5: Duplicate active assignment protection
    await runTest('5. Duplicate active assignment updates existing record without corrupt duplicates', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${testEventId}/duty-assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          userId: vol1Id,
          assignedLocationId: locAId,
          responsibilityKey: 'Room Operator',
          assignedAgeGroups: ['Ages 13–14'],
          status: 'scheduled',
          startsAt: openShiftStart,
          endsAt: openShiftEnd
        })
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200);

      // Verify no duplicate active records
      const activeRows = await query<any>(
        `SELECT id FROM event_duty_assignments
         WHERE event_id = ? AND user_id = ? AND status != 'cancelled' AND status != 'ended'`,
        [testEventId, vol1Id]
      );
      assert.strictEqual(activeRows.length, 1, `Expected exactly 1 active assignment row, got ${activeRows.length}`);
    });

    // TEST 6: Arrival succeeds when valid assignment + duty window open
    await runTest('6. Volunteer reporting for duty succeeds and records presence', async () => {
      const res = await fetch(`${baseUrl}/api/duty/current-location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${vol1Token}`
        },
        body: JSON.stringify({
          locationId: locAId,
          source: 'manual'
        })
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      assert.ok(body.presence, 'Expected presence payload');
      assert.strictEqual(body.presence.isPresent, true);

      // Verify presence in DB
      const presence = await queryOne<any>(
        `SELECT * FROM event_duty_location_presence WHERE event_id = ? AND user_id = ?`,
        [testEventId, vol1Id]
      );
      assert.ok(presence, 'Expected presence record in database');
      assert.strictEqual(presence.event_location_id, locAId);

      // Verify assignment status is updated to on_duty
      const asRow = await queryOne<any>(
        `SELECT status FROM event_duty_assignments WHERE event_id = ? AND user_id = ?`,
        [testEventId, vol1Id]
      );
      assert.strictEqual(asRow.status, 'on_duty');
    });

    // TEST 7: Duplicate arrival returns alreadyPresent: true without creating duplicate presence
    await runTest('7. Duplicate arrival returns alreadyPresent: true idempotently', async () => {
      const res = await fetch(`${baseUrl}/api/duty/current-location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${vol1Token}`
        },
        body: JSON.stringify({
          locationId: locAId,
          source: 'manual'
        })
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.alreadyPresent, true);
      assert.ok(body.message.includes("already on duty"));

      // Verify still only 1 presence row in DB
      const presences = await query<any>(
        `SELECT id FROM event_duty_location_presence WHERE event_id = ? AND user_id = ?`,
        [testEventId, vol1Id]
      );
      assert.strictEqual(presences.length, 1);
    });

    // TEST 8: Mismatched location QR rejected with ASSIGNED_ELSEWHERE
    await runTest('8. Mismatched location QR rejected with ASSIGNED_ELSEWHERE', async () => {
      // vol2 is assigned to locA. Scanning locB token should fail
      const res = await fetch(`${baseUrl}/api/duty/current-location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${vol2Token}`
        },
        body: JSON.stringify({
          locationId: locBId,
          scannedToken: locBToken,
          source: 'scanned'
        })
      });

      const body = await res.json();
      assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.code, 'ASSIGNED_ELSEWHERE');
      assert.ok(body.message.includes('assigned to Upper Teens Hall'));
    });

    // TEST 9: Duty window closed returns proper operational codes (DUTY_NOT_STARTED)
    await runTest('9. Duty window closed returns DUTY_NOT_STARTED operational error', async () => {
      // Create a 4th volunteer with a future shift
      const vol4Id = `vol4_${runId}`;
      const vol4Token = generateToken(vol4Id);
      await execute(
        `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
         VALUES (?, ?, 'hash', 'volunteer', 'active', ?, ?)`,
        [vol4Id, `vol4.${runId}@test.local`, nowIso, nowIso]
      );
      await execute(
        `INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
         VALUES (?, ?, 'Volunteer Delta', '+2348011113333', '+2348011113333', 'General Team', 'approved', ?, ?)`,
        [`vp_${vol4Id}`, vol4Id, nowIso, nowIso]
      );
      // Assign to locA with future shift
      await execute(
        `INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, responsibility_key, team_key, assignment_level, status, assigned_age_groups, starts_at, ends_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'Room Operator', 'general_response', 'primary', 'scheduled', '["13–14"]', ?, ?, ?, ?)`,
        [`as4_${runId}`, testEventId, vol4Id, locAId, futureShiftStart, futureShiftEnd, nowIso, nowIso]
      );

      const res = await fetch(`${baseUrl}/api/duty/current-location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${vol4Token}`
        },
        body: JSON.stringify({
          locationId: locAId,
          source: 'manual'
        })
      });

      const body = await res.json();
      assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.code, 'DUTY_NOT_STARTED');
      const fullText = (body.message || body.error || '').toLowerCase();
      assert.ok(fullText.includes('not started') || fullText.includes('check-in'), `Unexpected message: ${body.message}`);
    });

    // TEST 10: Unassigned location volunteer reporting for duty rejected with LOCATION_MISSING
    await runTest('10. Unassigned location volunteer reporting for duty rejected with LOCATION_MISSING', async () => {
      // Create a 5th volunteer with an assignment where assigned_location_id is NULL
      const vol5Id = `vol5_${runId}`;
      const vol5Token = generateToken(vol5Id);
      await execute(
        `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
         VALUES (?, ?, 'hash', 'volunteer', 'active', ?, ?)`,
        [vol5Id, `vol5.${runId}@test.local`, nowIso, nowIso]
      );
      await execute(
        `INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
         VALUES (?, ?, 'Volunteer Epsilon', '+2348011114444', '+2348011114444', 'General Team', 'approved', ?, ?)`,
        [`vp_${vol5Id}`, vol5Id, nowIso, nowIso]
      );
      await execute(
        `INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, responsibility_key, team_key, assignment_level, status, assigned_age_groups, starts_at, ends_at, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'Room Operator', 'general_response', 'primary', 'scheduled', '["13–14"]', ?, ?, ?, ?)`,
        [`as5_${runId}`, testEventId, vol5Id, openShiftStart, openShiftEnd, nowIso, nowIso]
      );

      const res = await fetch(`${baseUrl}/api/duty/current-location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${vol5Token}`
        },
        body: JSON.stringify({
          locationId: locAId,
          source: 'manual'
        })
      });

      const body = await res.json();
      assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.code, 'LOCATION_MISSING');
      assert.ok(body.message.includes('does not have a duty location yet'));
    });

  } finally {
    // Cleanup synthetic test records
    console.log('\nCleaning up synthetic test data…');
    await execute(`DELETE FROM event_duty_location_presence WHERE event_id = ?`, [testEventId]);
    await execute(`DELETE FROM event_duty_assignments WHERE event_id = ?`, [testEventId]);
    await execute(`DELETE FROM event_location_codes WHERE event_location_id IN (?, ?)`, [locAId, locBId]);
    await execute(`DELETE FROM event_locations WHERE event_id = ?`, [testEventId]);
    await execute(`DELETE FROM volunteer_profiles WHERE user_id LIKE ?`, [`%${runId}%`]);
    await execute(`DELETE FROM users WHERE id LIKE ?`, [`%${runId}%`]);
    await execute(`DELETE FROM events WHERE id = ?`, [testEventId]);

    if (originalEventId) {
      try {
        await setCurrentEvent(originalEventId);
      } catch (e) {
        console.error('Error restoring original current event:', e);
      }
    }

    server.close();
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passedCount} passed, ${failedCount} failed`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    console.error('Failed tests:', failures);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
