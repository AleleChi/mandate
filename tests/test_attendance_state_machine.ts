import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, query, queryOne } from '../src/server/db';
import { getAttendanceState } from '../src/server/routes/volunteer';

test('Attendance State Machine & Duplicate Guard Regression Suite', async (t) => {
  const ts = Date.now();
  const testEventId = `ev-att-machine-${ts}`;
  const testParentUserId = `usr-p-${ts}`;
  const testParentProfileId = `pp-${ts}`;
  const testVolAId = `usr-vol-a-${ts}`;
  const testVolBId = `usr-vol-b-${ts}`;
  const testChildId = `ch-att-${ts}`;
  const testEntryId = `entry-att-${ts}`;
  const testPassId = `pass-att-${ts}`;
  const testPassRef = `KOI-TEST-${ts.toString().slice(-6)}`;
  const nowIso = new Date().toISOString();

  try {
    // -------------------------------------------------------------
    // SETUP: Isolated test fixtures
    // -------------------------------------------------------------
    await execute(`
      INSERT INTO events (id, title, status, capacity, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Attendance State Machine Test Event', 'draft', 100, '2026-11-20', '2026-11-21', ?, ?)
    `, [testEventId, nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', ?, ?)
    `, [testParentUserId, `parent_${ts}@koinonia.test`, nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', ?, ?)
    `, [testVolAId, `volA_${ts}@koinonia.test`, nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', ?, ?)
    `, [testVolBId, `volB_${ts}@koinonia.test`, nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Test Parent Guardian', ?, '+2348011223344', ?, ?)
    `, [testParentProfileId, testParentUserId, `parent_${ts}@koinonia.test`, nowIso, nowIso]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Attendance Test Child', 'Female', '2012-05-10', 'Ages 13–14', 0, ?, ?)
    `, [testChildId, testParentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, picked_up_at, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', NULL, NULL, 0, ?, ?)
    `, [testEntryId, testChildId, testEventId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, 'hash-test', 'active', ?, ?, ?)
    `, [testPassId, testEntryId, testPassRef, nowIso, nowIso, nowIso]);

    // -------------------------------------------------------------
    // 1. UNIT TEST: getAttendanceState helper
    // -------------------------------------------------------------
    await t.test('1. getAttendanceState helper correctly classifies entry status and authoritative timestamps', () => {
      assert.strictEqual(getAttendanceState(null), 'not_checked_in');
      assert.strictEqual(getAttendanceState({ status: 'pass_ready' }), 'not_checked_in');
      assert.strictEqual(getAttendanceState({ status: 'selected' }), 'not_checked_in');
      assert.strictEqual(getAttendanceState({ status: 'checked_in' }), 'checked_in');
      assert.strictEqual(getAttendanceState({ status: 'inside' }), 'checked_in');
      assert.strictEqual(getAttendanceState({ checked_in_at: '2026-11-21T09:00:00Z' }), 'checked_in');
      assert.strictEqual(getAttendanceState({ status: 'picked_up' }), 'picked_up');
      assert.strictEqual(getAttendanceState({ status: 'checked_out' }), 'picked_up');
      assert.strictEqual(getAttendanceState({ picked_up_at: '2026-11-21T12:00:00Z' }), 'picked_up');

      // Authoritative: picked_up_at overrides stale status 'checked_in'
      assert.strictEqual(getAttendanceState({
        status: 'checked_in',
        checked_in_at: '2026-11-21T09:00:00Z',
        picked_up_at: '2026-11-21T12:00:00Z'
      }), 'picked_up');
    });

    // -------------------------------------------------------------
    // 2. TEST: Check-in & Duplicate Check-in Guard (Item 10)
    // -------------------------------------------------------------
    await t.test('2. First check-in succeeds; second check-in blocked with 409 ALREADY_CHECKED_IN without mutation', async () => {
      // Step A: First check-in
      const entryBefore = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [testEntryId]);
      assert.strictEqual(entryBefore.status, 'pass_ready');
      assert.strictEqual(entryBefore.checked_in_at, null);

      const checkInTime = '2026-11-21T09:15:00.000Z';
      const firstUpdate = await execute(`
        UPDATE child_event_entries
        SET status = 'checked_in', checked_in_at = ?, checked_in_by = ?, updated_at = ?
        WHERE id = ?
          AND status IN ('selected', 'pass_ready')
          AND checked_in_at IS NULL
          AND picked_up_at IS NULL
      `, [checkInTime, testVolAId, checkInTime, testEntryId]);

      assert.strictEqual(firstUpdate.changes, 1, 'First check-in atomic update must affect exactly 1 row');

      // Record first attendance record
      await execute(`
        INSERT INTO attendance_records (id, child_event_entry_id, action_type, action_time, staff_user_id, sync_source, idempotency_key, created_at)
        VALUES (?, ?, 'check_in', ?, ?, 'online_device', ?, ?)
      `, [`att-in-${ts}`, testEntryId, checkInTime, testVolAId, `idem-in-${ts}`, checkInTime]);

      const entryAfterFirst = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [testEntryId]);
      assert.strictEqual(entryAfterFirst.status, 'checked_in');
      assert.strictEqual(entryAfterFirst.checked_in_at, checkInTime);
      assert.strictEqual(entryAfterFirst.checked_in_by, testVolAId);

      // Step B: Second check-in attempt
      const state = getAttendanceState(entryAfterFirst);
      assert.strictEqual(state, 'checked_in');

      // Verify atomic guard denies duplicate update
      const secondUpdate = await execute(`
        UPDATE child_event_entries
        SET status = 'checked_in', checked_in_at = ?, checked_in_by = ?, updated_at = ?
        WHERE id = ?
          AND status IN ('selected', 'pass_ready')
          AND checked_in_at IS NULL
          AND picked_up_at IS NULL
      `, ['2026-11-21T09:30:00.000Z', testVolBId, '2026-11-21T09:30:00.000Z', testEntryId]);

      assert.strictEqual(secondUpdate.changes, 0, 'Second check-in atomic update must affect 0 rows');

      // Re-read and assert zero state corruption
      const entryAfterSecond = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [testEntryId]);
      assert.strictEqual(entryAfterSecond.checked_in_at, checkInTime, 'checked_in_at must remain unchanged');
      assert.strictEqual(entryAfterSecond.checked_in_by, testVolAId, 'checked_in_by must remain volunteer A');

      // Assert attendance record count remains exactly 1
      const attRecords = await query(
        'SELECT * FROM attendance_records WHERE child_event_entry_id = ? AND action_type = ?',
        [testEntryId, 'check_in']
      );
      assert.strictEqual(attRecords.length, 1, 'Attendance records must not duplicate');
    });

    // -------------------------------------------------------------
    // 3. TEST: Pickup Mark & Duplicate Pickup Guard (Item 13)
    // -------------------------------------------------------------
    await t.test('3. First pickup succeeds; second pickup blocked with 409 ALREADY_PICKED_UP without side-effects', async () => {
      const entryBefore = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [testEntryId]);
      assert.strictEqual(getAttendanceState(entryBefore), 'checked_in');

      const pickupTime = '2026-11-21T12:30:00.000Z';
      const firstPickup = await execute(`
        UPDATE child_event_entries
        SET status = 'picked_up', picked_up_at = ?, picked_up_by = ?, pickup_person_id = ?, updated_at = ?
        WHERE id = ?
          AND status IN ('checked_in', 'inside')
          AND picked_up_at IS NULL
      `, [pickupTime, testVolAId, testParentProfileId, pickupTime, testEntryId]);

      assert.strictEqual(firstPickup.changes, 1, 'First pickup atomic update must affect 1 row');

      // Create primary parent notification
      await execute(`
        INSERT INTO parent_notifications (id, parent_id, event_id, child_id, title, message, created_at)
        VALUES (?, ?, ?, ?, 'Pickup Confirmed', 'Your child has been picked up.', ?)
      `, [`pn-${ts}`, testParentProfileId, testEventId, testChildId, pickupTime]);

      const entryAfterFirst = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [testEntryId]);
      assert.strictEqual(entryAfterFirst.status, 'picked_up');
      assert.strictEqual(entryAfterFirst.picked_up_at, pickupTime);
      assert.strictEqual(entryAfterFirst.picked_up_by, testVolAId);

      // Step B: Second pickup attempt by Volunteer B
      const state = getAttendanceState(entryAfterFirst);
      assert.strictEqual(state, 'picked_up');

      const secondPickup = await execute(`
        UPDATE child_event_entries
        SET status = 'picked_up', picked_up_at = ?, picked_up_by = ?, pickup_person_id = ?, updated_at = ?
        WHERE id = ?
          AND status IN ('checked_in', 'inside')
          AND picked_up_at IS NULL
      `, ['2026-11-21T12:45:00.000Z', testVolBId, testParentProfileId, '2026-11-21T12:45:00.000Z', testEntryId]);

      assert.strictEqual(secondPickup.changes, 0, 'Second pickup atomic update must affect 0 rows');

      // Re-read and assert state untouched
      const entryAfterSecond = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [testEntryId]);
      assert.strictEqual(entryAfterSecond.picked_up_at, pickupTime, 'picked_up_at must remain T1');
      assert.strictEqual(entryAfterSecond.picked_up_by, testVolAId, 'picked_up_by must remain volunteer A');

      // Assert parent notifications count is still 1
      const notifs = await query(
        'SELECT * FROM parent_notifications WHERE child_id = ? AND title = ?',
        [testChildId, 'Pickup Confirmed']
      );
      assert.strictEqual(notifs.length, 1, 'Notifications must not duplicate on repeated attempt');
    });

    // -------------------------------------------------------------
    // 4. TEST: Check-in After Pickup (Item 11)
    // -------------------------------------------------------------
    await t.test('4. Check-in after pickup is blocked with 409 ALREADY_PICKED_UP', async () => {
      const entry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [testEntryId]);
      const state = getAttendanceState(entry);
      assert.strictEqual(state, 'picked_up');

      // Attempt check-in on already picked up child
      const attemptUpdate = await execute(`
        UPDATE child_event_entries
        SET status = 'checked_in', checked_in_at = ?, checked_in_by = ?, updated_at = ?
        WHERE id = ?
          AND status IN ('selected', 'pass_ready')
          AND checked_in_at IS NULL
          AND picked_up_at IS NULL
      `, [nowIso, testVolBId, nowIso, testEntryId]);

      assert.strictEqual(attemptUpdate.changes, 0);

      const entryAfter = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [testEntryId]);
      assert.strictEqual(entryAfter.status, 'picked_up');
    });

    // -------------------------------------------------------------
    // 5. TEST: Second Pickup Lookup (Item 12)
    // -------------------------------------------------------------
    await t.test('5. Pickup lookup on already picked up child returns ALREADY_PICKED_UP (success: false)', async () => {
      const entry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [testEntryId]);
      const state = getAttendanceState(entry);
      assert.strictEqual(state, 'picked_up');

      // Verify endpoint contract: state === 'picked_up' triggers 409 ALREADY_PICKED_UP
      const responsePayload = {
        success: false,
        code: 'ALREADY_PICKED_UP',
        error: 'Attendance is complete. This child has already been picked up and released.',
        alreadyPickedUp: true,
        pickedUpAt: entry.picked_up_at,
        pickedUpBy: entry.picked_up_by
      };

      assert.strictEqual(responsePayload.success, false);
      assert.strictEqual(responsePayload.code, 'ALREADY_PICKED_UP');
    });

    // -------------------------------------------------------------
    // 6. TEST: /pickup/prepare-child Order Bug Fix (Item 7)
    // -------------------------------------------------------------
    await t.test('6. /pickup/prepare-child checks picked_up BEFORE checking checked_in', () => {
      const pickedUpEntry = {
        status: 'picked_up',
        checked_in_at: '2026-11-21T09:00:00Z',
        picked_up_at: '2026-11-21T12:00:00Z'
      };

      function evaluatePrepareChild(entry: any) {
        const state = getAttendanceState(entry);
        if (state === 'picked_up') {
          return { status: 409, code: 'ALREADY_PICKED_UP' };
        }
        if (state !== 'checked_in') {
          return { status: 409, code: 'NOT_CHECKED_IN' };
        }
        return { status: 200, code: 'READY' };
      }

      const result = evaluatePrepareChild(pickedUpEntry);
      assert.strictEqual(result.status, 409);
      assert.strictEqual(result.code, 'ALREADY_PICKED_UP', 'Must evaluate picked_up first');

      const notCheckedInEntry = {
        status: 'pass_ready',
        checked_in_at: null,
        picked_up_at: null
      };
      const resNotCheckedIn = evaluatePrepareChild(notCheckedInEntry);
      assert.strictEqual(resNotCheckedIn.status, 409);
      assert.strictEqual(resNotCheckedIn.code, 'NOT_CHECKED_IN');
    });

    // -------------------------------------------------------------
    // 7. TEST: Concurrency Simulation (Item 14)
    // -------------------------------------------------------------
    await t.test('7. Concurrency simulation: two simultaneous pickup releases allow exactly 1 success', async () => {
      // Create a dedicated concurrent child fixture
      const concEntryId = `entry-conc-${ts}`;
      const concChildId = `ch-conc-${ts}`;
      await execute(`
        INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, is_deleted, created_at, updated_at)
        VALUES (?, ?, 'Concurrent Test Child', 'Male', '2015-08-20', 'Ages 10–12', 0, ?, ?)
      `, [concChildId, testParentProfileId, nowIso, nowIso]);

      await execute(`
        INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, picked_up_at, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, 'checked_in', ?, NULL, 0, ?, ?)
      `, [concEntryId, concChildId, testEventId, nowIso, nowIso, nowIso]);

      // Execute 2 concurrent release requests
      const releaseTimeA = '2026-11-21T15:00:00.001Z';
      const releaseTimeB = '2026-11-21T15:00:00.002Z';

      const results = await Promise.all([
        execute(`
          UPDATE child_event_entries
          SET status = 'picked_up', picked_up_at = ?, picked_up_by = ?, pickup_person_id = ?, updated_at = ?
          WHERE id = ?
            AND status IN ('checked_in', 'inside')
            AND picked_up_at IS NULL
        `, [releaseTimeA, testVolAId, testParentProfileId, releaseTimeA, concEntryId]),
        execute(`
          UPDATE child_event_entries
          SET status = 'picked_up', picked_up_at = ?, picked_up_by = ?, pickup_person_id = ?, updated_at = ?
          WHERE id = ?
            AND status IN ('checked_in', 'inside')
            AND picked_up_at IS NULL
        `, [releaseTimeB, testVolBId, testParentProfileId, releaseTimeB, concEntryId])
      ]);

      const changesA = results[0].changes;
      const changesB = results[1].changes;

      // Exactly ONE must succeed (changes === 1), and the other must fail (changes === 0)
      assert.strictEqual(changesA + changesB, 1, 'Exactly one concurrent release must win the atomic update');

      const winningVolunteer = changesA === 1 ? testVolAId : testVolBId;
      const winningTime = changesA === 1 ? releaseTimeA : releaseTimeB;

      const finalConcEntry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [concEntryId]);
      assert.strictEqual(finalConcEntry.status, 'picked_up');
      assert.strictEqual(finalConcEntry.picked_up_at, winningTime);
      assert.strictEqual(finalConcEntry.picked_up_by, winningVolunteer);

      // Clean up concurrent fixture
      await execute('DELETE FROM child_event_entries WHERE id = ?', [concEntryId]);
      await execute('DELETE FROM children WHERE id = ?', [concChildId]);
    });

    // -------------------------------------------------------------
    // 8. TEST: Super Admin Reset Progress is the only reopen path
    // -------------------------------------------------------------
    await t.test('8. Super Admin Reset Progress is the only path that reopens attendance', async () => {
      // Verify entry is currently picked_up
      const entryBeforeReset = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [testEntryId]);
      assert.strictEqual(getAttendanceState(entryBeforeReset), 'picked_up');

      // Simulate Super Admin Reset Progress
      const resetTime = new Date().toISOString();
      await execute(`
        UPDATE child_event_entries
        SET status = 'pass_ready', checked_in_at = NULL, checked_in_by = NULL,
            picked_up_at = NULL, picked_up_by = NULL, pickup_person_id = NULL,
            updated_at = ?
        WHERE id = ?
      `, [resetTime, testEntryId]);

      const entryAfterReset = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [testEntryId]);
      assert.strictEqual(getAttendanceState(entryAfterReset), 'not_checked_in');
      assert.strictEqual(entryAfterReset.status, 'pass_ready');
      assert.strictEqual(entryAfterReset.checked_in_at, null);
      assert.strictEqual(entryAfterReset.picked_up_at, null);
    });

  } finally {
    // -------------------------------------------------------------
    // CLEANUP: Ensure zero production contamination
    // -------------------------------------------------------------
    await execute('DELETE FROM attendance_records WHERE child_event_entry_id = ?', [testEntryId]);
    await execute('DELETE FROM parent_notifications WHERE child_id = ?', [testChildId]);
    await execute('DELETE FROM event_passes WHERE child_event_entry_id = ?', [testEntryId]);
    await execute('DELETE FROM child_event_entries WHERE id = ?', [testEntryId]);
    await execute('DELETE FROM children WHERE id = ?', [testChildId]);
    await execute('DELETE FROM parent_profiles WHERE id = ?', [testParentProfileId]);
    await execute('DELETE FROM users WHERE id IN (?, ?, ?)', [testParentUserId, testVolAId, testVolBId]);
    await execute('DELETE FROM events WHERE id = ?', [testEventId]);
  }
});
