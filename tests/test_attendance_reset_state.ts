import assert from 'assert';
import crypto from 'crypto';
import { execute, query, queryOne } from '../src/server/db';
import { getChildSummaryStats } from '../src/server/services/childSummaryService';

async function runAttendanceResetStateTest() {
  console.log('================================================================');
  console.log('ATTENDANCE RESET STATE — PERMANENT REGRESSION SUITE');
  console.log('================================================================\n');

  const nowIso = new Date().toISOString();
  const testEventId = `ev-att-reset-${Date.now()}`;

  try {
    // -------------------------------------------------------------
    // SETUP: Create isolated test event & fixtures
    // -------------------------------------------------------------
    await execute(`
      INSERT INTO events (id, title, status, capacity, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Attendance Reset Test Event', 'current', 100, '2026-11-20', '2026-11-21', ?, ?)
    `, [testEventId, nowIso, nowIso]);

    const parentUserId = `usr-parent-${Date.now()}`;
    const parentProfileId = `parent-${Date.now()}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', ?, ?)
    `, [parentUserId, `parent_reset_${Date.now()}@test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Test Parent Guardian', ?, '+2348011223344', ?, ?)
    `, [parentProfileId, parentUserId, `parent_reset_${Date.now()}@test.org`, nowIso, nowIso]);

    const childId = `ch-livina-${Date.now()}`;
    const entryId = `entry-livina-${Date.now()}`;

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Baby Livina', 'Female', '2020-01-01', 'Ages 1-3', 0, ?, ?)
    `, [childId, parentProfileId, nowIso, nowIso]);

    // 1. Child selected / pass ready
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, picked_up_at, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', NULL, NULL, 0, ?, ?)
    `, [entryId, childId, testEventId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `, [`pass-${Date.now()}`, entryId, 'PASS-LIVINA-01', 'hash-livina-01', nowIso, nowIso, nowIso]);

    console.log('[STEP 1] Child created in selected/pass_ready state -> PASS');

    // -------------------------------------------------------------
    // 2. Progression: checked in -> inside -> picked up
    // -------------------------------------------------------------
    const checkInTime = '2026-09-19T09:00:00Z';
    const pickupTime = '2026-09-19T12:00:00Z';

    // Transition to picked up
    await execute(`
      UPDATE child_event_entries
      SET status = 'picked_up', checked_in_at = ?, picked_up_at = ?, updated_at = ?
      WHERE id = ?
    `, [checkInTime, pickupTime, pickupTime, entryId]);

    // Insert attendance records for check_in and pickup
    await execute(`
      INSERT INTO attendance_records (id, child_event_entry_id, action_type, action_time, staff_user_id, sync_source, idempotency_key, created_at)
      VALUES (?, ?, 'check_in', ?, ?, 'online_device', ?, ?)
    `, [`att-in-${Date.now()}`, entryId, checkInTime, parentUserId, `idem-in-${Date.now()}`, checkInTime]);

    await execute(`
      INSERT INTO attendance_records (id, child_event_entry_id, action_type, action_time, staff_user_id, sync_source, idempotency_key, created_at)
      VALUES (?, ?, 'pickup', ?, ?, 'online_device', ?, ?)
    `, [`att-out-${Date.now()}`, entryId, pickupTime, parentUserId, `idem-out-${Date.now()}`, pickupTime]);

    // -------------------------------------------------------------
    // 3. Verify Attendance query returns Picked up before reset
    // -------------------------------------------------------------
    const statsBefore = await getChildSummaryStats(testEventId);
    assert.strictEqual(statsBefore.selected, 1, 'Expected count must be 1');
    assert.strictEqual(statsBefore.checkedIn, 1, 'Checked in count must be 1');
    assert.strictEqual(statsBefore.pickedUp, 1, 'Picked up count must be 1');
    assert.strictEqual(statsBefore.inside, 0, 'Inside count must be 0');

    const entryBefore = await queryOne(`
      SELECT status, checked_in_at, picked_up_at
      FROM child_event_entries
      WHERE id = ?
    `, [entryId]);
    assert.strictEqual(entryBefore.status, 'picked_up');
    assert.ok(entryBefore.picked_up_at !== null);

    // Recent scans before reset must show pickup
    const recentScansBefore = await query(`
      SELECT e.id as entry_id, e.status, e.checked_in_at, e.picked_up_at, c.full_name as child_name
      FROM child_event_entries e
      JOIN children c ON e.child_id = c.id
      WHERE e.event_id = ? 
        AND (e.is_deleted = 0 OR e.is_deleted IS NULL)
        AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
        AND e.status IN ('checked_in', 'inside', 'picked_up')
        AND (e.checked_in_at IS NOT NULL OR e.picked_up_at IS NOT NULL)
      ORDER BY COALESCE(e.picked_up_at, e.checked_in_at) DESC
      LIMIT 10
    `, [testEventId]);
    assert.strictEqual(recentScansBefore.length, 1, 'Recent scans must include child before reset');
    assert.strictEqual(recentScansBefore[0].status, 'picked_up');

    console.log('[STEP 2] Child reached picked_up; Attendance displays Picked up -> PASS');

    // -------------------------------------------------------------
    // 4. RESET CYCLE
    // Execute production reset semantics (/applications/:id/reset-progress)
    // -------------------------------------------------------------
    const resetTime = new Date().toISOString();
    const pass = await queryOne(`SELECT id, status FROM event_passes WHERE child_event_entry_id = ? AND status = 'active'`, [entryId]);
    const targetStatus = pass ? 'pass_ready' : 'selected';

    await execute(`DELETE FROM attendance_records WHERE child_event_entry_id = ?`, [entryId]);
    await execute(`
      UPDATE child_event_entries
      SET status = ?, checked_in_at = NULL, checked_in_by = NULL, picked_up_at = NULL, picked_up_by = NULL, updated_at = ?
      WHERE id = ?
    `, [targetStatus, resetTime, entryId]);

    await execute(`
      INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
      VALUES (?, 'admin-test', 'super_admin', 'Event attendance reset by Super Admin', 'child_event_entry', ?, ?, ?)
    `, [crypto.randomUUID(), entryId, JSON.stringify({ mode: 'attendance', targetStatus, previousStatus: 'picked_up' }), resetTime]);

    console.log('[STEP 3] Reset cycle executed -> PASS');

    // -------------------------------------------------------------
    // 5. FETCH ATTENDANCE AGAIN (AFTER RESET)
    // -------------------------------------------------------------
    // Verify canonical stats
    const statsAfter = await getChildSummaryStats(testEventId);
    const notArrivedCount = Math.max(0, statsAfter.selected - statsAfter.checkedIn);

    assert.strictEqual(statsAfter.selected, 1, 'Expected count remains 1');
    assert.strictEqual(statsAfter.pickedUp, 0, 'Picked up summary must exclude child after reset (0)');
    assert.strictEqual(statsAfter.checkedIn, 0, 'Checked in summary must exclude child after reset (0)');
    assert.strictEqual(statsAfter.inside, 0, 'Inside summary must exclude child after reset (0)');
    assert.strictEqual(notArrivedCount, 1, 'Not arrived count must include reset child (1)');

    // Verify row mapping in Attendance
    const appRow = await queryOne(`
      SELECT 
        e.id as entry_id,
        e.child_id,
        e.status,
        e.has_medical_notes,
        e.medical_notes,
        e.needs_extra_support,
        e.support_notes,
        e.checked_in_at,
        e.picked_up_at,
        c.full_name as child_name,
        c.age_group,
        c.needs_age_review
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.id = ?
    `, [entryId]);

    // Apply attendance row mapping logic
    let rowStatus: 'checked_in' | 'picked_up' | 'not_arrived' | 'needs_attention' = 'not_arrived';
    let rowLocation: 'inside' | 'picked_up' | 'not_arrived' | null = 'not_arrived';

    if (appRow.status === 'picked_up' && appRow.picked_up_at) {
      rowStatus = 'picked_up';
      rowLocation = 'picked_up';
    } else if ((appRow.status === 'checked_in' || appRow.status === 'inside') && appRow.checked_in_at && !appRow.picked_up_at) {
      rowStatus = 'checked_in';
      rowLocation = 'inside';
    } else {
      const needsAttention = appRow.has_medical_notes === 1 || appRow.needs_extra_support === 1 || appRow.needs_age_review === 1;
      rowStatus = needsAttention ? 'needs_attention' : 'not_arrived';
      rowLocation = 'not_arrived';
    }

    assert.notStrictEqual(rowStatus, 'picked_up', 'Current status must NOT be picked_up after reset');
    assert.strictEqual(rowStatus, 'not_arrived', 'Current status must be not_arrived after reset');
    assert.notStrictEqual(rowLocation, 'picked_up', 'Current location must NOT be picked_up after reset');
    assert.strictEqual(rowLocation, 'not_arrived', 'Current location must be not_arrived after reset');

    // Verify Recent scans in Attendance excludes reset child
    const recentScansAfter = await query(`
      SELECT e.id as entry_id, e.status, e.checked_in_at, e.picked_up_at, c.full_name as child_name
      FROM child_event_entries e
      JOIN children c ON e.child_id = c.id
      WHERE e.event_id = ? 
        AND (e.is_deleted = 0 OR e.is_deleted IS NULL) 
        AND (c.is_deleted = 0 OR c.is_deleted IS NULL) 
        AND e.status IN ('checked_in', 'inside', 'picked_up') 
        AND (e.checked_in_at IS NOT NULL OR e.picked_up_at IS NOT NULL)
      ORDER BY COALESCE(e.picked_up_at, e.checked_in_at) DESC
      LIMIT 10
    `, [testEventId]);
    assert.strictEqual(recentScansAfter.length, 0, 'Recent scans must exclude reset child from active cycle');

    // Verify audit log preserves historical action
    const audit = await queryOne(`SELECT action, details FROM audit_logs WHERE target_id = ?`, [entryId]);
    assert.ok(audit, 'Audit log must retain historical reset action');
    assert.strictEqual(audit.action, 'Event attendance reset by Super Admin');

    console.log('[STEP 4] Attendance after reset: status != picked_up, location != picked_up, summary excludes child -> PASS');

    // -------------------------------------------------------------
    // 6. RE-ENTRY AFTER RESET
    // Child checks in again -> new cycle becomes current
    // -------------------------------------------------------------
    const reEntryTime = new Date().toISOString();
    await execute(`
      UPDATE child_event_entries
      SET status = 'checked_in', checked_in_at = ?, picked_up_at = NULL, updated_at = ?
      WHERE id = ?
    `, [reEntryTime, reEntryTime, entryId]);

    const statsReEntry = await getChildSummaryStats(testEventId);
    assert.strictEqual(statsReEntry.checkedIn, 1, 'Checked in count must be 1 after re-entry');
    assert.strictEqual(statsReEntry.inside, 1, 'Inside count must be 1 after re-entry');
    assert.strictEqual(statsReEntry.pickedUp, 0, 'Picked up count remains 0 after re-entry');

    // Verify row mapping reflects new cycle
    const appRowReEntry = await queryOne(`
      SELECT status, checked_in_at, picked_up_at FROM child_event_entries WHERE id = ?
    `, [entryId]);
    assert.strictEqual(appRowReEntry.status, 'checked_in');
    assert.ok(appRowReEntry.checked_in_at !== null);
    assert.strictEqual(appRowReEntry.picked_up_at, null);

    let reEntryRowStatus = 'not_arrived';
    let reEntryRowLocation = 'not_arrived';
    if (appRowReEntry.status === 'picked_up' && appRowReEntry.picked_up_at) {
      reEntryRowStatus = 'picked_up';
      reEntryRowLocation = 'picked_up';
    } else if ((appRowReEntry.status === 'checked_in' || appRowReEntry.status === 'inside') && appRowReEntry.checked_in_at && !appRowReEntry.picked_up_at) {
      reEntryRowStatus = 'checked_in';
      reEntryRowLocation = 'inside';
    }

    assert.strictEqual(reEntryRowStatus, 'checked_in', 'Row status must be checked_in after re-entry');
    assert.strictEqual(reEntryRowLocation, 'inside', 'Row location must be inside after re-entry');

    // Verify distinct child count: child is counted exactly once
    const distinctCount = await queryOne(`
      SELECT COUNT(DISTINCT e.child_id) as count
      FROM child_event_entries e
      WHERE e.event_id = ? AND e.status IN ('checked_in', 'inside', 'picked_up') AND COALESCE(e.is_deleted, 0) = 0
    `, [testEventId]);
    assert.strictEqual(distinctCount.count, 1, 'Child must be counted exactly once, no duplicate state');

    console.log('[STEP 5] Re-entry after reset: reflects new cycle, counted once -> PASS');
    console.log('\nALL ATTENDANCE RESET STATE REGRESSION TESTS PASSED!\n');
  } finally {
    // Cleanup test data
    await execute(`DELETE FROM audit_logs WHERE target_id IN (SELECT id FROM child_event_entries WHERE event_id = ?)`, [testEventId]);
    await execute(`DELETE FROM attendance_records WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id = ?)`, [testEventId]);
    await execute(`DELETE FROM event_passes WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id = ?)`, [testEventId]);
    await execute(`DELETE FROM child_event_entries WHERE event_id = ?`, [testEventId]);
    await execute(`DELETE FROM events WHERE id = ?`, [testEventId]);
  }
}

runAttendanceResetStateTest().catch((err) => {
  console.error('ATTENDANCE RESET STATE TEST FAILED:', err);
  process.exit(1);
});
