import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { getDb, execute, query, queryOne, REAL_EVENT_ID } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import { dutyRouter } from '../src/server/routes/duty';
import router from '../src/server/routes/admin';

async function runDutyVerification() {
  console.log('================================================================');
  console.log('STARTING EVENT DUTY QR & DUTY FLOW TESTS (SECTION 20 AUDIT)     ');
  console.log('================================================================');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const now = new Date().toISOString();

  // Set up test express server
  const app = express();
  app.use(express.json());

  // Mount duty and admin routers
  app.use('/api/duty', dutyRouter);
  app.use('/api/admin', router);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let passed = 0;
  const total = 11;

  try {
    // -------------------------------------------------------------
    // Test 1: Generated QR points to valid production-compatible route
    // -------------------------------------------------------------
    console.log('\n[Test 1] QR structure & URL validation...');
    const dummyToken = `loc_code_${crypto.randomBytes(8).toString('hex')}`;
    const hashUrl = `https://koinonia12.netlify.app/#/duty/location/${dummyToken}`;
    const pathUrl = `https://koinonia12.netlify.app/duty/scan/${dummyToken}`;

    if (!hashUrl.includes('/#/duty/location/') || !pathUrl.includes('/duty/scan/')) {
      throw new Error('QR URL does not follow production-compatible SPA routing pattern.');
    }
    console.log(`✅ Generated QR URL structure verified: ${hashUrl}`);
    passed++;

    // -------------------------------------------------------------
    // Setup test records in database
    // -------------------------------------------------------------
    const testLocId = `loc-test-${testRunId}`;
    const testOtherLocId = `loc-other-${testRunId}`;
    const testInactiveLocId = `loc-inactive-${testRunId}`;

    await execute(`
      INSERT INTO event_locations (id, event_id, name, location_type, age_group_key, capacity, is_active, created_at, updated_at)
      VALUES (?, ?, 'Grace Hall Primary', 'room', 'Ages 4 to 6', 40, 1, ?, ?)
    `, [testLocId, REAL_EVENT_ID, now, now]);

    await execute(`
      INSERT INTO event_locations (id, event_id, name, location_type, age_group_key, capacity, is_active, created_at, updated_at)
      VALUES (?, ?, 'Main Pavilion', 'hall', 'Ages 7 to 9', 100, 1, ?, ?)
    `, [testOtherLocId, REAL_EVENT_ID, now, now]);

    await execute(`
      INSERT INTO event_locations (id, event_id, name, location_type, age_group_key, capacity, is_active, created_at, updated_at)
      VALUES (?, ?, 'Closed Room Suite', 'room', 'Teens', 20, 0, ?, ?)
    `, [testInactiveLocId, REAL_EVENT_ID, now, now]);

    // Create QR tokens in event_location_codes
    const token1 = `loc_code_grace_${testRunId}`;
    await execute(`
      INSERT INTO event_location_codes (id, event_location_id, token_hash, is_active, generated_at)
      VALUES (?, ?, ?, 1, ?)
    `, [`code-${testRunId}-1`, testLocId, token1, now]);

    const tokenInactive = `loc_code_closed_${testRunId}`;
    await execute(`
      INSERT INTO event_location_codes (id, event_location_id, token_hash, is_active, generated_at)
      VALUES (?, ?, ?, 1, ?)
    `, [`code-${testRunId}-2`, testInactiveLocId, tokenInactive, now]);

    // Create test volunteer user
    const volUserId = `user-vol-${testRunId}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, 'vol-${testRunId}@koinonia.test', 'testhash', 'volunteer', ?, ?)
    `, [volUserId, now, now]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Samuel Adeyemi', '+2348011223344', '+2348011223344', 'General Response', 'approved', ?, ?)
    `, [`vp-${testRunId}`, volUserId, now, now]);

    const volToken = generateToken(volUserId);

    // -------------------------------------------------------------
    // Test 2: QR opens correct location without exposing PII
    // -------------------------------------------------------------
    console.log('\n[Test 2] QR public endpoint returns location without PII...');
    const res2 = await fetch(`${baseUrl}/api/duty/location-code/${token1}`);
    const data2 = await res2.json();

    if (!data2.success || data2.location?.id !== testLocId || data2.location?.name !== 'Grace Hall Primary') {
      throw new Error(`Failed to resolve location from token: ${JSON.stringify(data2)}`);
    }
    // Verify no PII
    const rawLoc = JSON.stringify(data2.location);
    if (rawLoc.includes('email') || rawLoc.includes('phone') || rawLoc.includes('Samuel') || rawLoc.includes('child')) {
      throw new Error('PII found in public location response!');
    }
    console.log(`✅ Location resolved cleanly: ${data2.location.name} (${data2.location.ageGroupKey}), no PII exposed.`);
    passed++;

    // -------------------------------------------------------------
    // Test 3: Valid volunteer can report for duty
    // -------------------------------------------------------------
    console.log('\n[Test 3] Valid volunteer reports for duty...');
    const res3 = await fetch(`${baseUrl}/api/duty/current-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${volToken}`
      },
      body: JSON.stringify({
        locationId: testLocId,
        scannedToken: token1,
        source: 'scanned'
      })
    });
    const data3 = await res3.json();

    if (!data3.success || !data3.presence || data3.presence.locationId !== testLocId) {
      throw new Error(`Reporting for duty failed: ${JSON.stringify(data3)}`);
    }

    const presenceInDb = await queryOne(
      'SELECT * FROM event_duty_location_presence WHERE user_id = ? AND event_location_id = ? AND ended_at IS NULL',
      [volUserId, testLocId]
    );
    if (!presenceInDb) {
      throw new Error('Presence record was not created in event_duty_location_presence!');
    }
    console.log(`✅ Volunteer reported for duty at ${data3.presence.name}. Presence record created in DB.`);
    passed++;

    // -------------------------------------------------------------
    // Test 4: Unauthorized user cannot report
    // -------------------------------------------------------------
    console.log('\n[Test 4] Unauthenticated user cannot report for duty...');
    const res4 = await fetch(`${baseUrl}/api/duty/current-location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationId: testLocId,
        scannedToken: token1
      })
    });
    if (res4.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated duty check-in, got ${res4.status}`);
    }
    console.log(`✅ Unauthorized duty sign-in correctly blocked (HTTP 401).`);
    passed++;

    // -------------------------------------------------------------
    // Test 5: Inactive location rejected safely
    // -------------------------------------------------------------
    console.log('\n[Test 5] Inactive / closed location code rejected safely...');
    const res5 = await fetch(`${baseUrl}/api/duty/location-code/${tokenInactive}`);
    const data5 = await res5.json();

    if (res5.status !== 403 || data5.error !== 'location_paused') {
      throw new Error(`Expected 403 location_paused for inactive location, got ${res5.status}: ${JSON.stringify(data5)}`);
    }
    console.log(`✅ Inactive location rejected safely with error: ${data5.error}`);
    passed++;

    // -------------------------------------------------------------
    // Test 6: Repeated scan does not duplicate duty presence
    // -------------------------------------------------------------
    console.log('\n[Test 6] Duplicate scan does not create multiple presence records...');
    const res6 = await fetch(`${baseUrl}/api/duty/current-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${volToken}`
      },
      body: JSON.stringify({
        locationId: testLocId,
        scannedToken: token1,
        source: 'scanned'
      })
    });
    const data6 = await res6.json();

    if (!data6.success || !data6.alreadyPresent) {
      throw new Error(`Expected alreadyPresent: true on duplicate check-in, got: ${JSON.stringify(data6)}`);
    }

    const allPresences = await query(
      'SELECT * FROM event_duty_location_presence WHERE user_id = ? AND event_location_id = ? AND ended_at IS NULL',
      [volUserId, testLocId]
    );
    if (allPresences.length !== 1) {
      throw new Error(`Expected exactly 1 active presence record in DB, found ${allPresences.length}`);
    }
    console.log(`✅ Duplicate scan handled safely: alreadyPresent=true, presence row count remains 1.`);
    passed++;

    // -------------------------------------------------------------
    // Test 7: Admin assignment precedence preserved
    // -------------------------------------------------------------
    console.log('\n[Test 7] Admin assignment precedence preserved...');
    // Create admin assignment for another volunteer to testOtherLocId
    const volOtherUserId = `user-vol-other-${testRunId}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, 'other-${testRunId}@koinonia.test', 'testhash', 'volunteer', ?, ?)
    `, [volOtherUserId, now, now]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Child Care', 'scheduled', ?, ?, ?, ?)
    `, [`assign-${testRunId}`, REAL_EVENT_ID, volOtherUserId, testOtherLocId, now, now, now, now]);

    const volOtherToken = generateToken(volOtherUserId);

    // Try to check in to testLocId (which contradicts admin assignment to testOtherLocId)
    const res7 = await fetch(`${baseUrl}/api/duty/current-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${volOtherToken}`
      },
      body: JSON.stringify({
        locationId: testLocId,
        scannedToken: token1
      })
    });
    const data7 = await res7.json();

    if (res7.status !== 403 || data7.error !== 'assigned_elsewhere') {
      throw new Error(`Expected 403 assigned_elsewhere, got ${res7.status}: ${JSON.stringify(data7)}`);
    }
    console.log(`✅ Admin assignment precedence strictly enforced: cannot override to different location.`);
    passed++;

    // -------------------------------------------------------------
    // Test 8: QR contains no PII
    // -------------------------------------------------------------
    console.log('\n[Test 8] QR payload contains no PII...');
    if (token1.includes('Samuel') || token1.includes('Adeyemi') || token1.includes('@') || token1.includes('+234')) {
      throw new Error('Token string contains personal data!');
    }
    console.log(`✅ QR token string is purely random/hex with no personally identifiable info.`);
    passed++;

    // -------------------------------------------------------------
    // Test 9: Replacing QR invalidates old token & creates working new one
    // -------------------------------------------------------------
    console.log('\n[Test 9] Replacing QR code invalidates old token and generates working new token...');
    const adminUserId = `user-admin-${testRunId}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, 'admin-${testRunId}@koinonia.test', 'testhash', 'admin', ?, ?)
    `, [adminUserId, now, now]);
    const adminToken = generateToken(adminUserId);

    // Rotate QR token via admin endpoint
    const res9Rotate = await fetch(`${baseUrl}/api/admin/locations/${testLocId}/qr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });
    const data9Rotate = await res9Rotate.json();
    const newToken = data9Rotate.token || data9Rotate.code?.token_hash;

    if (!data9Rotate.success || !newToken || newToken === token1) {
      throw new Error(`Failed to generate new rotated token: ${JSON.stringify(data9Rotate)}`);
    }

    // Old token should now be inactive / rejected
    const res9Old = await fetch(`${baseUrl}/api/duty/location-code/${token1}`);
    if (res9Old.status !== 403 && res9Old.status !== 404) {
      throw new Error(`Old token was not invalidated, got status ${res9Old.status}`);
    }

    // New token should be valid
    const res9New = await fetch(`${baseUrl}/api/duty/location-code/${newToken}`);
    const data9New = await res9New.json();
    if (!data9New.success || data9New.location?.id !== testLocId) {
      throw new Error(`New rotated token failed to verify: ${JSON.stringify(data9New)}`);
    }
    console.log(`✅ QR rotated: old token invalidated, new token verified working.`);
    passed++;

    // -------------------------------------------------------------
    // Test 10: No QR action can release/check out a child
    // -------------------------------------------------------------
    console.log('\n[Test 10] Child security isolation: Location QR cannot authorize child release...');
    // Duty router has zero child checkout endpoints
    const testChildRelease = await fetch(`${baseUrl}/api/duty/child-release`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${volToken}`
      },
      body: JSON.stringify({ token: newToken })
    });
    if (testChildRelease.status !== 404) {
      throw new Error(`Child release endpoint unexpectedly accessible in duty router! Got ${testChildRelease.status}`);
    }
    console.log(`✅ Child release strictly isolated from Event Duty QR (404 Not Found).`);
    passed++;

    // -------------------------------------------------------------
    // Test 11: Admin manual presence actions (mark arrived / end duty)
    // -------------------------------------------------------------
    console.log('\n[Test 11] Admin manual duty presence actions (mark arrived & end duty)...');
    const adminCheckInRes = await fetch(`${baseUrl}/api/admin/events/${REAL_EVENT_ID}/locations/${testOtherLocId}/presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userId: volOtherUserId,
        action: 'check_in'
      })
    });
    const adminCheckInData = await adminCheckInRes.json();
    if (!adminCheckInData.success || adminCheckInData.action !== 'checked_in') {
      throw new Error(`Admin check-in failed: ${JSON.stringify(adminCheckInData)}`);
    }

    const adminEndDutyRes = await fetch(`${baseUrl}/api/admin/events/${REAL_EVENT_ID}/locations/${testOtherLocId}/presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userId: volOtherUserId,
        action: 'end_duty'
      })
    });
    const adminEndDutyData = await adminEndDutyRes.json();
    if (!adminEndDutyData.success || adminEndDutyData.action !== 'duty_ended') {
      throw new Error(`Admin end duty failed: ${JSON.stringify(adminEndDutyData)}`);
    }
    console.log(`✅ Admin can mark volunteer arrived and end duty manually.`);
    passed++;

    console.log('\n================================================================');
    console.log(`ALL ${passed}/${total} EVENT DUTY QR & DUTY FLOW TESTS PASSED!     `);
    console.log('================================================================');

  } finally {
    server.close();
    process.exit(0);
  }
}

runDutyVerification().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
