import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { getCurrentEventId } from '../src/server/services/eventService';
import { generateToken } from '../src/server/auth';
import { dutyRouter } from '../src/server/routes/duty';

async function runAssignedLocationTests() {
  console.log('================================================================');
  console.log('STARTING VOLUNTEER ASSIGNED LOCATION ENFORCEMENT VERIFICATION   ');
  console.log('================================================================');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const now = new Date().toISOString();

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/duty', dutyRouter);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const currentEventId = await getCurrentEventId();
  if (!currentEventId) {
    throw new Error('No current event found in database.');
  }

  // Generate test IDs
  const userAId = `user-a-${testRunId}`;
  const userBId = `user-b-${testRunId}`;
  const userUnassignedId = `user-unassigned-${testRunId}`;

  const locAId = `loc-a-${testRunId}`;
  const locBId = `loc-b-${testRunId}`;

  const tokenA = `token-a-${testRunId}`;
  const tokenB = `token-b-${testRunId}`;

  const otherEventId = `other-event-${testRunId}`;
  const otherEventLocId = `loc-other-ev-${testRunId}`;
  const otherEventToken = `token-other-ev-${testRunId}`;
  const userOtherEventOnlyId = `user-otherev-${testRunId}`;

  let passed = 0;
  const total = 6;

  try {
    // 1. Insert test users
    await execute(`
      INSERT INTO users (id, email, role, status, created_at, updated_at)
      VALUES (?, ?, 'volunteer', 'active', ?, ?)
    `, [userAId, `vol-a-${testRunId}@example.com`, now, now]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Volunteer A', '+2348000000001', '+2348000000001', 'Care', 'approved', ?, ?)
    `, [`vp-a-${testRunId}`, userAId, now, now]);

    await execute(`
      INSERT INTO users (id, email, role, status, created_at, updated_at)
      VALUES (?, ?, 'volunteer', 'active', ?, ?)
    `, [userBId, `vol-b-${testRunId}@example.com`, now, now]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Volunteer B', '+2348000000002', '+2348000000002', 'Safety', 'approved', ?, ?)
    `, [`vp-b-${testRunId}`, userBId, now, now]);

    await execute(`
      INSERT INTO users (id, email, role, status, created_at, updated_at)
      VALUES (?, ?, 'volunteer', 'active', ?, ?)
    `, [userUnassignedId, `vol-none-${testRunId}@example.com`, now, now]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Volunteer Unassigned', '+2348000000003', '+2348000000003', 'Care', 'approved', ?, ?)
    `, [`vp-none-${testRunId}`, userUnassignedId, now, now]);

    await execute(`
      INSERT INTO users (id, email, role, status, created_at, updated_at)
      VALUES (?, ?, 'volunteer', 'active', ?, ?)
    `, [userOtherEventOnlyId, `vol-otherev-${testRunId}@example.com`, now, now]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Volunteer Other Ev', '+2348000000004', '+2348000000004', 'Care', 'approved', ?, ?)
    `, [`vp-otherev-${testRunId}`, userOtherEventOnlyId, now, now]);

    // 2. Insert test locations in current event
    await execute(`
      INSERT INTO event_locations (id, event_id, name, location_type, age_group_key, capacity, is_active, created_at, updated_at)
      VALUES (?, ?, 'Grace Hall Primary', 'room', 'Ages 4 to 6', 40, 1, ?, ?)
    `, [locAId, currentEventId, now, now]);

    await execute(`
      INSERT INTO event_locations (id, event_id, name, location_type, age_group_key, capacity, is_active, created_at, updated_at)
      VALUES (?, ?, 'Main Auditorium Pavilion', 'hall', 'All Ages', 200, 1, ?, ?)
    `, [locBId, currentEventId, now, now]);

    // 3. Insert location codes
    await execute(`
      INSERT INTO event_location_codes (id, event_location_id, token_hash, is_active, generated_at)
      VALUES (?, ?, ?, 1, ?)
    `, [`code-a-${testRunId}`, locAId, tokenA, now]);

    await execute(`
      INSERT INTO event_location_codes (id, event_location_id, token_hash, is_active, generated_at)
      VALUES (?, ?, ?, 1, ?)
    `, [`code-b-${testRunId}`, locBId, tokenB, now]);

    // 4. Insert assignment for Volunteer A -> Location A in current event
    const assignAId = `assign-a-${testRunId}`;
    await execute(`
      INSERT INTO event_duty_assignments (
        id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, assigned_by, assigned_location_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'room_support', 'care', 'primary', 'scheduled', '2026-09-17T18:00:00.000Z', '2026-09-17T20:00:00.000Z', ?, ?, ?, ?)
    `, [assignAId, currentEventId, userAId, userAId, locAId, now, now]);

    // 5. Insert assignment for Volunteer B -> Location B in current event
    const assignBId = `assign-b-${testRunId}`;
    await execute(`
      INSERT INTO event_duty_assignments (
        id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, assigned_by, assigned_location_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'lead_monitor', 'safety', 'primary', 'scheduled', '2026-09-17T18:00:00.000Z', '2026-09-17T20:00:00.000Z', ?, ?, ?, ?)
    `, [assignBId, currentEventId, userBId, userAId, locBId, now, now]);

    // 6. Setup other event + location + assignment for Volunteer Other Event Only
    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'Historical Event', 'closed', ?, ?)
    `, [otherEventId, now, now]);

    await execute(`
      INSERT INTO event_locations (id, event_id, name, location_type, is_active, created_at, updated_at)
      VALUES (?, ?, 'Old Youth Hall', 'room', 1, ?, ?)
    `, [otherEventLocId, otherEventId, now, now]);

    await execute(`
      INSERT INTO event_location_codes (id, event_location_id, token_hash, is_active, generated_at)
      VALUES (?, ?, ?, 1, ?)
    `, [`code-otherev-${testRunId}`, otherEventLocId, otherEventToken, now]);

    await execute(`
      INSERT INTO event_duty_assignments (
        id, event_id, user_id, responsibility_key, status, starts_at, ends_at, assigned_by, assigned_location_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'room_support', 'scheduled', '2026-09-17T18:00:00.000Z', '2026-09-17T20:00:00.000Z', ?, ?, ?, ?)
    `, [`assign-otherev-${testRunId}`, otherEventId, userOtherEventOnlyId, userAId, otherEventLocId, now, now]);

    // Create auth tokens
    const authHeaderA = `Bearer ${generateToken(userAId)}`;
    const authHeaderB = `Bearer ${generateToken(userBId)}`;
    const authHeaderUnassigned = `Bearer ${generateToken(userUnassignedId)}`;
    const authHeaderOtherEvOnly = `Bearer ${generateToken(userOtherEventOnlyId)}`;

    // -----------------------------------------------------------------
    // TEST A: Volunteer A scans assigned Location A -> Allowed, presence created
    // -----------------------------------------------------------------
    console.log('\n[Test A] Volunteer A assigned to Location A scans Location A...');
    // Check verify token endpoint
    const resA = await fetch(`${baseUrl}/api/duty/location-code/${tokenA}`, {
      headers: { Authorization: authHeaderA }
    });
    const dataA = await resA.json();
    if (dataA.state !== 'assigned_here_not_present') {
      throw new Error(`Expected state 'assigned_here_not_present', got '${dataA.state}'`);
    }

    // Now Report for duty
    const postResA = await fetch(`${baseUrl}/api/duty/current-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeaderA
      },
      body: JSON.stringify({
        locationId: locAId,
        scannedToken: tokenA,
        source: 'scanned'
      })
    });
    const postDataA = await postResA.json();
    if (!postResA.ok || !postDataA.success || !postDataA.presence) {
      throw new Error(`Expected successful presence creation, got status ${postResA.status}: ${JSON.stringify(postDataA)}`);
    }

    // Verify presence row in DB
    const dbPresA = await queryOne('SELECT * FROM event_duty_location_presence WHERE user_id = ? AND event_location_id = ? AND ended_at IS NULL', [userAId, locAId]);
    if (!dbPresA) {
      throw new Error('Presence record was not found in database for User A at Location A.');
    }
    console.log('✅ Test A Passed: Presence created successfully for assigned Location A.');
    passed++;

    // -----------------------------------------------------------------
    // TEST B: Same volunteer scans A again -> already-present, no duplicate
    // -----------------------------------------------------------------
    console.log('\n[Test B] Volunteer A scans Location A again (Idempotency check)...');
    const verifyAgainA = await fetch(`${baseUrl}/api/duty/location-code/${tokenA}`, {
      headers: { Authorization: authHeaderA }
    });
    const dataAgainA = await verifyAgainA.json();
    if (dataAgainA.state !== 'assigned_here_present') {
      throw new Error(`Expected state 'assigned_here_present', got '${dataAgainA.state}'`);
    }

    const postAgainA = await fetch(`${baseUrl}/api/duty/current-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeaderA
      },
      body: JSON.stringify({
        locationId: locAId,
        scannedToken: tokenA,
        source: 'scanned'
      })
    });
    const postAgainDataA = await postAgainA.json();
    if (!postAgainA.ok || !postAgainDataA.success || !postAgainDataA.alreadyPresent) {
      throw new Error(`Expected alreadyPresent: true, got ${JSON.stringify(postAgainDataA)}`);
    }

    const presCountA = await queryOne('SELECT COUNT(*) as count FROM event_duty_location_presence WHERE user_id = ? AND event_location_id = ? AND ended_at IS NULL', [userAId, locAId]);
    if (Number(presCountA.count) !== 1) {
      throw new Error(`Expected exactly 1 active presence record, got ${presCountA.count}`);
    }
    console.log('✅ Test B Passed: Repeated scan returned alreadyPresent with no duplicate presence rows.');
    passed++;

    // -----------------------------------------------------------------
    // TEST C: Volunteer A (assigned to Location A) scans Location B -> Blocked
    // -----------------------------------------------------------------
    console.log('\n[Test C] Volunteer A (assigned Location A) scans Location B...');
    const verifyWrongLoc = await fetch(`${baseUrl}/api/duty/location-code/${tokenB}`, {
      headers: { Authorization: authHeaderA }
    });
    const dataWrongLoc = await verifyWrongLoc.json();
    if (dataWrongLoc.state !== 'assigned_elsewhere') {
      throw new Error(`Expected state 'assigned_elsewhere', got '${dataWrongLoc.state}'`);
    }
    if (dataWrongLoc.assignedLocationName !== 'Grace Hall Primary') {
      throw new Error(`Expected assignedLocationName 'Grace Hall Primary', got '${dataWrongLoc.assignedLocationName}'`);
    }

    // Try to force POST to wrong location
    const postWrongLoc = await fetch(`${baseUrl}/api/duty/current-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeaderA
      },
      body: JSON.stringify({
        locationId: locBId,
        scannedToken: tokenB,
        source: 'scanned'
      })
    });
    const postWrongData = await postWrongLoc.json();
    if (postWrongLoc.status !== 403 || postWrongData.error !== 'assigned_elsewhere') {
      throw new Error(`Expected 403 assigned_elsewhere, got ${postWrongLoc.status}: ${JSON.stringify(postWrongData)}`);
    }

    // Verify NO presence at Location B
    const dbPresBForUserA = await queryOne('SELECT * FROM event_duty_location_presence WHERE user_id = ? AND event_location_id = ?', [userAId, locBId]);
    if (dbPresBForUserA) {
      throw new Error('Presence record unexpectedly created at Location B for User A!');
    }
    console.log('✅ Test C Passed: Reporting at wrong location was safely blocked with 403 assigned_elsewhere.');
    passed++;

    // -----------------------------------------------------------------
    // TEST D: Volunteer with no assignment scans Location A -> Blocked
    // -----------------------------------------------------------------
    console.log('\n[Test D] Volunteer with no assignment scans Location A...');
    const verifyUnassigned = await fetch(`${baseUrl}/api/duty/location-code/${tokenA}`, {
      headers: { Authorization: authHeaderUnassigned }
    });
    const dataUnassigned = await verifyUnassigned.json();
    if (dataUnassigned.state !== 'no_assignment') {
      throw new Error(`Expected state 'no_assignment', got '${dataUnassigned.state}'`);
    }

    const postUnassigned = await fetch(`${baseUrl}/api/duty/current-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeaderUnassigned
      },
      body: JSON.stringify({
        locationId: locAId,
        scannedToken: tokenA,
        source: 'scanned'
      })
    });
    const postUnassignedData = await postUnassigned.json();
    if (postUnassigned.status !== 403 || postUnassignedData.error !== 'no_assignment') {
      throw new Error(`Expected 403 no_assignment, got ${postUnassigned.status}: ${JSON.stringify(postUnassignedData)}`);
    }
    if (postUnassignedData.message !== "You don't have a duty location assigned yet.") {
      throw new Error(`Expected message "You don't have a duty location assigned yet.", got "${postUnassignedData.message}"`);
    }

    // Verify NO presence created
    const presUnassigned = await queryOne('SELECT * FROM event_duty_location_presence WHERE user_id = ?', [userUnassignedId]);
    if (presUnassigned) {
      throw new Error('Presence record unexpectedly created for unassigned user!');
    }
    console.log('✅ Test D Passed: Unassigned volunteer blocked with 403 no_assignment.');
    passed++;

    // -----------------------------------------------------------------
    // TEST E: Volunteer assigned in Event A only, scans in Event B -> Blocked
    // -----------------------------------------------------------------
    console.log('\n[Test E] Event isolation: Volunteer assigned only in other event scans current event QR...');
    const postOtherEvUser = await fetch(`${baseUrl}/api/duty/current-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeaderOtherEvOnly
      },
      body: JSON.stringify({
        locationId: locAId,
        scannedToken: tokenA,
        source: 'scanned'
      })
    });
    const postOtherEvData = await postOtherEvUser.json();
    if (postOtherEvUser.status !== 403 || postOtherEvData.error !== 'no_assignment') {
      throw new Error(`Expected 403 no_assignment for user assigned only in other event, got ${postOtherEvUser.status}: ${JSON.stringify(postOtherEvData)}`);
    }
    console.log('✅ Test E Passed: Other event assignment does not authorize current event duty.');
    passed++;

    // -----------------------------------------------------------------
    // TEST F: Invalid / mismatched location request -> Safe 4xx, never 500
    // -----------------------------------------------------------------
    console.log('\n[Test F] Invalid / non-existent location ID request...');
    const postInvalidLoc = await fetch(`${baseUrl}/api/duty/current-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeaderA
      },
      body: JSON.stringify({
        locationId: `non-existent-loc-${testRunId}`,
        source: 'selected'
      })
    });
    const postInvalidData = await postInvalidLoc.json();
    if (postInvalidLoc.status !== 400 || postInvalidData.success !== false) {
      throw new Error(`Expected 400 with success: false for invalid location, got ${postInvalidLoc.status}: ${JSON.stringify(postInvalidData)}`);
    }
    console.log('✅ Test F Passed: Invalid location returns safe 400 error, never 500.');
    passed++;

    console.log('\n================================================================');
    console.log(`ALL TESTS PASSED (${passed}/${total})`);
    console.log('================================================================');
  } catch (err) {
    console.error('\n❌ Test failed with error:', err);
    failed = true;
  } finally {
    // Teardown / Cleanup test records
    console.log('\nCleaning up test records from database...');
    await execute('DELETE FROM event_duty_location_presence WHERE user_id IN (?, ?, ?, ?)', [userAId, userBId, userUnassignedId, userOtherEventOnlyId]);
    await execute('DELETE FROM event_duty_assignments WHERE user_id IN (?, ?, ?, ?)', [userAId, userBId, userUnassignedId, userOtherEventOnlyId]);
    await execute('DELETE FROM event_location_codes WHERE token_hash IN (?, ?, ?)', [tokenA, tokenB, otherEventToken]);
    await execute('DELETE FROM event_locations WHERE id IN (?, ?, ?)', [locAId, locBId, otherEventLocId]);
    await execute('DELETE FROM events WHERE id = ?', [otherEventId]);
    await execute('DELETE FROM volunteer_profiles WHERE user_id IN (?, ?, ?, ?)', [userAId, userBId, userUnassignedId, userOtherEventOnlyId]);
    await execute('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [userAId, userBId, userUnassignedId, userOtherEventOnlyId]);

    server.close();
    process.exit(failed ? 1 : 0);
  }
}

let failed = false;
runAssignedLocationTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
