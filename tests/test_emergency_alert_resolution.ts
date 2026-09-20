import { queryOne, query, execute } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import crypto from 'crypto';

const BASE_URL = process.env.TEST_SERVER_URL || 'http://127.0.0.1:3000';

async function setupTestAdminUser(): Promise<string> {
  const testAdminId = `usr_test_admin_${Date.now()}`;
  const now = new Date().toISOString();
  await execute(`
    INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
    VALUES (?, ?, 'hash', 'admin', ?, ?)
  `, [testAdminId, `admin_test_${Date.now()}@koinonia.test`, now, now]);
  return generateToken(testAdminId);
}

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log('\n==================================================');
  console.log('RUNNING EMERGENCY ALERT RESOLUTION REGRESSION SUITE');
  console.log('==================================================\n');

  const token = await setupTestAdminUser();
  const testRunId = Date.now().toString();
  const now = new Date().toISOString();

  // Test Alert A (for single resolution)
  const alertAId = `test_alert_single_${testRunId}`;
  await execute(`
    INSERT INTO event_safety_alerts (
      id, event_id, status, severity, category, title, message,
      raised_by_user_id, raised_by_role, created_at, updated_at
    ) VALUES (
      ?, 'event-ga-2026', 'open', 'urgent', 'medical', 'Single Test Alert', 'First aid test note',
      'admin-user-id-2026', 'admin', ?, ?
    )
  `, [alertAId, now, now]);

  // Test Alert B & C (for bulk resolution)
  const alertBId = `test_alert_bulk_b_${testRunId}`;
  const alertCId = `test_alert_bulk_c_${testRunId}`;
  await execute(`
    INSERT INTO event_safety_alerts (
      id, event_id, status, severity, category, title, message,
      raised_by_user_id, raised_by_role, created_at, updated_at
    ) VALUES (
      ?, 'event-ga-2026', 'open', 'urgent', 'care', 'Bulk Group Test 1', 'Group test message',
      'admin-user-id-2026', 'admin', ?, ?
    ), (
      ?, 'event-ga-2026', 'open', 'urgent', 'care', 'Bulk Group Test 2', 'Group test message',
      'admin-user-id-2026', 'admin', ?, ?
    )
  `, [alertBId, now, now, alertCId, now, now]);

  // ----------------------------------------------------
  // TEST 1: Active query returns test alert before resolve
  // ----------------------------------------------------
  console.log('\n[TEST 1] Active query returns active alerts before resolution');
  const getAlertsRes1 = await fetch(`${BASE_URL}/api/admin/safety-alerts`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const alertsData1 = await getAlertsRes1.json();
  const alertsList1 = Array.isArray(alertsData1) ? alertsData1 : alertsData1.alerts || [];
  const foundA = alertsList1.find((a: any) => a.id === alertAId);
  assert(foundA, 'Alert A found in GET /api/admin/safety-alerts');
  assert(foundA?.status === 'open', 'Alert A status is open before resolution');

  // ----------------------------------------------------
  // TEST 2: Single Resolution requires human note (Section 6 & K)
  // ----------------------------------------------------
  console.log('\n[TEST 2] Single resolution requires human note (empty note rejected)');
  const emptyNoteRes = await fetch(`${BASE_URL}/api/admin/safety-alerts/${alertAId}/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ note: '   ' })
  });
  assert(emptyNoteRes.status === 400, 'Empty resolution note returns HTTP 400');

  // ----------------------------------------------------
  // TEST 3: Authorized admin resolves single alert (Section A)
  // ----------------------------------------------------
  console.log('\n[TEST 3] Authorized admin resolves single alert successfully');
  const resolveARes = await fetch(`${BASE_URL}/api/admin/safety-alerts/${alertAId}/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ note: 'First aid rendered on site' })
  });
  assert(resolveARes.status === 200, 'Single resolve returns HTTP 200');
  const resolveAData = await resolveARes.json();
  assert(resolveAData.success === true, 'Response body indicates success: true');
  assert(resolveAData.alert?.status === 'resolved', 'Returned alert status is resolved');

  // Verify SQLite row
  const rowA = await queryOne('SELECT status, resolved_at, resolved_by, resolution_note FROM event_safety_alerts WHERE id = ?', [alertAId]);
  assert(rowA?.status === 'resolved', 'SQLite row status updated to resolved');
  assert(rowA?.resolved_at, 'SQLite row resolved_at timestamp populated');
  assert(rowA?.resolved_by, 'SQLite row resolved_by populated');
  assert(rowA?.resolution_note === 'First aid rendered on site', 'SQLite row resolution_note matches input');

  // ----------------------------------------------------
  // TEST 4: Second resolve is idempotent / handled safely
  // ----------------------------------------------------
  console.log('\n[TEST 4] Second resolve attempt returns already-resolved 409 safely');
  const secondResolveRes = await fetch(`${BASE_URL}/api/admin/safety-alerts/${alertAId}/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ note: 'Repeat attempt' })
  });
  assert(secondResolveRes.status === 409, 'Second resolve returns HTTP 409 conflict');
  const secondData = await secondResolveRes.json();
  assert(secondData.alreadyResolved === true, 'Response indicates alreadyResolved: true');

  // ----------------------------------------------------
  // TEST 5: Active query excludes resolved alert from active queue (Section H)
  // ----------------------------------------------------
  console.log('\n[TEST 5] Active query excludes resolved alert');
  const getAlertsRes2 = await fetch(`${BASE_URL}/api/admin/safety-alerts`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const alertsData2 = await getAlertsRes2.json();
  const alertsList2 = Array.isArray(alertsData2) ? alertsData2 : alertsData2.alerts || [];
  const alertAInActive = alertsList2.filter((a: any) => a.status !== 'resolved').some((a: any) => a.id === alertAId);
  assert(!alertAInActive, 'Resolved alert A is excluded from active alerts list');

  // ----------------------------------------------------
  // TEST 6: Unauthorized user rejected (Section D)
  // ----------------------------------------------------
  console.log('\n[TEST 6] Unauthorized requests rejected');
  const unauthRes = await fetch(`${BASE_URL}/api/admin/safety-alerts/bulk-resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      alertIds: [alertBId],
      resolutionNote: 'Unauthorized attempt'
    })
  });
  assert(unauthRes.status === 401 || unauthRes.status === 403, 'Unauthenticated bulk resolve rejected with 401/403');

  // ----------------------------------------------------
  // TEST 7: Bulk Acknowledge endpoint works (Section 5)
  // ----------------------------------------------------
  console.log('\n[TEST 7] Bulk acknowledge marks alerts as acknowledged');
  const bulkAckRes = await fetch(`${BASE_URL}/api/admin/safety-alerts/bulk-acknowledge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      alertIds: [alertBId, alertCId]
    })
  });
  assert(bulkAckRes.status === 200, 'Bulk acknowledge returns HTTP 200');
  const bulkAckData = await bulkAckRes.json();
  assert(bulkAckData.acknowledgedCount === 2, 'Acknowledged 2 alerts');

  const rowB_ack = await queryOne('SELECT status, acknowledged_at FROM event_safety_alerts WHERE id = ?', [alertBId]);
  assert(rowB_ack?.status === 'acknowledged', 'Alert B status updated to acknowledged');
  assert(rowB_ack?.acknowledged_at, 'Alert B acknowledged_at timestamp set');

  // ----------------------------------------------------
  // TEST 8: Bulk Resolution works with mixed already-resolved & non-existent (Sections B & C)
  // ----------------------------------------------------
  console.log('\n[TEST 8] Bulk resolution handles mixed list (active + already resolved + invalid ID)');
  const nonExistentId = `non_existent_alert_${testRunId}`;
  const bulkResolveRes = await fetch(`${BASE_URL}/api/admin/safety-alerts/bulk-resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      alertIds: [alertBId, alertCId, alertAId, nonExistentId],
      resolutionNote: 'Batch resolution of related safety test notifications',
      outcome: 'resolved_on_site'
    })
  });

  assert(bulkResolveRes.status === 200, 'Bulk resolve returns HTTP 200');
  const bulkResolveData = await bulkResolveRes.json();
  assert(bulkResolveData.resolvedCount === 2, 'Correctly resolved 2 un-resolved alerts (B & C)');
  assert(bulkResolveData.skippedCount === 1, 'Correctly skipped 1 already-resolved alert (A)');
  assert(bulkResolveData.failedCount === 1, 'Correctly reported 1 failed/missing alert (nonExistentId)');

  // ----------------------------------------------------
  // TEST 9: Historical rows preserved (Section 17 & F)
  // ----------------------------------------------------
  console.log('\n[TEST 9] Historical rows preserved in database');
  const finalRowB = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertBId]);
  const finalRowC = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertCId]);
  assert(finalRowB?.status === 'resolved', 'Historical row B status is resolved');
  assert(finalRowB?.resolved_at, 'Historical row B has resolved_at timestamp');
  assert(finalRowB?.resolved_by, 'Historical row B has resolved_by user ID');
  assert(finalRowB?.resolution_note?.includes('resolved_on_site'), 'Historical row B preserves resolution outcome');
  assert(finalRowC?.status === 'resolved', 'Historical row C status is resolved');

  console.log('\n==================================================');
  console.log('ALL EMERGENCY ALERT RESOLUTION TESTS PASSED! (9/9)');
  console.log('==================================================\n');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
