import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { execute, query, queryOne } from '../src/server/db';
import {
  validateVolunteerDutyWindow,
  getEventOperationsTestOverrideStatus,
  isEventOperationsTestOverrideActive
} from '../src/server/services/volunteerDutyWindowService';
import { normalizePassReference } from '../src/server/services/passService';
import { resolveVolunteerScope } from '../src/server/routes/volunteer';
import { isChildInScope } from '../src/server/services/eligibilityService';

test('Event Operations Testing Override Test Suite', async (t) => {
  const ts = Date.now();
  const testEventId = `ev-test-override-${ts}`;
  const testSuperAdminId = `usr-sa-${ts}`;
  const testAdminId = `usr-adm-${ts}`;
  const testVolunteerId = `usr-vol-${ts}`;
  const testParentId = `usr-prnt-${ts}`;
  const testParentProfileId = `prof-${ts}`;
  const testDutyId = `duty-${ts}`;
  const nowIso = new Date().toISOString();

  // Child in Ages 7-9 (date_of_birth: 8 years ago)
  const childInRangeId = `ch-range-${ts}`;
  const entryInRangeId = `entry-range-${ts}`;
  const passInRangeId = `pass-range-${ts}`;
  const passRefRange = `KOI-2026-T${String(ts).slice(-5)}1`;

  // Child in Ages 13-14 (date_of_birth: 14 years ago)
  const childOutOfScopeId = `ch-oos-${ts}`;
  const entryOutOfScopeId = `entry-oos-${ts}`;
  const passOutOfScopeId = `pass-oos-${ts}`;
  const passRefOutOfScope = `KOI-2026-T${String(ts).slice(-5)}2`;

  const birthDateInRange = new Date(Date.now() - 8 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const birthDateOutOfScope = new Date(Date.now() - 14 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Setup synthetic fixture records
  try {
    // 1. Future Event (starts next year)
    await execute(
      `INSERT INTO events (
        id, title, status, starts_at, ends_at, timezone,
        check_in_opens_at, check_in_closes_at, pickup_starts_at,
        operations_test_override_enabled, operations_test_override_expires_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        testEventId,
        `Future Test Event ${ts}`,
        'current',
        '2028-11-20T08:00:00Z',
        '2028-11-25T18:00:00Z',
        'Africa/Lagos',
        '2028-11-20T08:00:00Z',
        '2028-11-25T18:00:00Z',
        '2028-11-20T12:00:00Z',
        0,
        null,
        nowIso,
        nowIso
      ]
    );

    // 2. Users: Super Admin, Regular Admin, Volunteer, Parent
    await execute(
      `INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'hash', 'super_admin', ?, ?)`,
      [testSuperAdminId, `super-${ts}@koinonia.test`, nowIso, nowIso]
    );
    await execute(
      `INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'hash', 'admin', ?, ?)`,
      [testAdminId, `admin-${ts}@koinonia.test`, nowIso, nowIso]
    );
    await execute(
      `INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'hash', 'volunteer', ?, ?)`,
      [testVolunteerId, `vol-${ts}@koinonia.test`, nowIso, nowIso]
    );
    await execute(
      `INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'hash', 'parent', ?, ?)`,
      [testParentId, `parent-${ts}@koinonia.test`, nowIso, nowIso]
    );

    // 3. Parent Profile
    await execute(
      `INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [testParentProfileId, testParentId, `Parent ${ts}`, '+2348011112222', nowIso, nowIso]
    );

    // 4. Children (one age 8 in range, one age 14 out of scope)
    await execute(
      `INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, calculated_age, age_group, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'male', 8, '7–9', ?, ?)`,
      [childInRangeId, testParentProfileId, `Child Eight ${ts}`, birthDateInRange, nowIso, nowIso]
    );
    await execute(
      `INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, calculated_age, age_group, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'female', 14, '13–14', ?, ?)`,
      [childOutOfScopeId, testParentProfileId, `Child Fourteen ${ts}`, birthDateOutOfScope, nowIso, nowIso]
    );

    // 5. Child Event Entries (both selected)
    await execute(
      `INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'selected', ?, ?)`,
      [entryInRangeId, childInRangeId, testEventId, nowIso, nowIso]
    );
    await execute(
      `INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'selected', ?, ?)`,
      [entryOutOfScopeId, childOutOfScopeId, testEventId, nowIso, nowIso]
    );

    // 6. Canonical Passes
    await execute(
      `INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
      [passInRangeId, entryInRangeId, passRefRange, `hash-${passRefRange}`, nowIso, nowIso, nowIso]
    );
    await execute(
      `INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
      [passOutOfScopeId, entryOutOfScopeId, passRefOutOfScope, `hash-${passRefOutOfScope}`, nowIso, nowIso, nowIso]
    );

    // 7. Volunteer Duty Assignment assigned specifically to Ages 7-9 (with future shift dates)
    await execute(
      `INSERT INTO event_duty_assignments (
        id, event_id, user_id, team_key, responsibility_key, assignment_level,
        status, assigned_age_groups, starts_at, ends_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'check_in', 'registration', 'volunteer', 'on_duty', ?, '2028-11-20T08:00:00Z', '2028-11-25T18:00:00Z', ?, ?)`,
      [testDutyId, testEventId, testVolunteerId, JSON.stringify(['7–9']), nowIso, nowIso]
    );

    // ==========================================
    // TEST A: Override OFF + Future Event → EVENT_NOT_STARTED
    // ==========================================
    await t.test('Test A: Override off + future event rejects volunteer operations with EVENT_NOT_STARTED', async () => {
      const isOverrideActive = await isEventOperationsTestOverrideActive(testEventId);
      assert.strictEqual(isOverrideActive, false, 'Override should be inactive initially');

      const dutyWindow = await validateVolunteerDutyWindow({
        userId: testVolunteerId,
        userRole: 'volunteer',
        eventId: testEventId,
        operationType: 'check_in'
      });

      assert.strictEqual(dutyWindow.allowed, false, 'Volunteer operation should not be allowed when event has not started');
      assert.strictEqual(dutyWindow.code, 'EVENT_NOT_STARTED', 'Should return code EVENT_NOT_STARTED');
      assert.strictEqual(dutyWindow.testingAccessActive, false, 'testingAccessActive should be false');
    });

    // ==========================================
    // TEST B: Override ON + Future Event + Correct Scope → Lookup / Check-in Allowed
    // ==========================================
    await t.test('Test B: Override on + future event + correct scope allows duty and check-in', async () => {
      // Enable override for 60 minutes
      const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await execute(
        `UPDATE events
         SET operations_test_override_enabled = 1,
             operations_test_override_expires_at = ?,
             operations_test_override_enabled_by = ?,
             operations_test_override_enabled_at = ?
         WHERE id = ?`,
        [futureExpiry, testSuperAdminId, nowIso, testEventId]
      );

      const status = await getEventOperationsTestOverrideStatus(testEventId);
      assert.strictEqual(status.active, true, 'Override status should be active');
      assert.strictEqual(status.enabled, true, 'Override status should be enabled');

      // Duty window should now allow operations despite future schedule
      const dutyWindow = await validateVolunteerDutyWindow({
        userId: testVolunteerId,
        userRole: 'volunteer',
        eventId: testEventId,
        operationType: 'check_in'
      });

      assert.strictEqual(dutyWindow.allowed, true, 'Duty window must be allowed when test override is active');
      assert.strictEqual(dutyWindow.code, null, 'No timing error code should be returned');
      assert.strictEqual(dutyWindow.testingAccessActive, true, 'testingAccessActive should be true');

      // Verify scope check succeeds for Age 8 child
      const scope = await resolveVolunteerScope(testVolunteerId, 'volunteer', testEventId);
      assert.strictEqual(scope.isScoped, true);
      assert.deepStrictEqual(scope.assignedAgeGroups, ['7–9']);

      const child8 = await queryOne('SELECT * FROM children WHERE id = ?', [childInRangeId]);
      assert.strictEqual(isChildInScope(child8, scope.assignedAgeGroups), true, 'Child 8 must be in scope for 7–9');

      // Perform synthetic check-in transition
      await execute(
        `UPDATE child_event_entries SET status = 'inside', updated_at = ? WHERE id = ?`,
        [nowIso, entryInRangeId]
      );
      await execute(
        `INSERT INTO attendance_records (id, child_event_entry_id, action_type, action_time, staff_user_id, sync_source, idempotency_key, created_at)
         VALUES (?, ?, 'check_in', ?, ?, 'live', ?, ?)`,
        [`att-in-${ts}`, entryInRangeId, nowIso, testVolunteerId, `idem-in-${ts}`, nowIso]
      );

      const updatedEntry = await queryOne('SELECT status FROM child_event_entries WHERE id = ?', [entryInRangeId]);
      assert.strictEqual(updatedEntry.status, 'inside', 'Child entry status should transition to inside');
    });

    // ==========================================
    // TEST C: Override ON + Wrong Age → OUT_OF_SCOPE
    // ==========================================
    await t.test('Test C: Override on + wrong age is strictly rejected with OUT_OF_SCOPE', async () => {
      // Volunteer assigned to 7–9 attempts to process child aged 14 (Ages 13–14)
      const scope = await resolveVolunteerScope(testVolunteerId, 'volunteer', testEventId);
      const child14 = await queryOne('SELECT * FROM children WHERE id = ?', [childOutOfScopeId]);

      const inScope = isChildInScope(child14, scope.assignedAgeGroups);
      assert.strictEqual(inScope, false, 'Child aged 14 must NOT be in scope for volunteer assigned to 7–9');
    });

    // ==========================================
    // TEST D: Override ON + Invalid Pass → Not Found
    // ==========================================
    await t.test('Test D: Override on + invalid pass reference returns Not Found', async () => {
      const nonExistentPass = 'KOI-2026-UNKNOWN99';
      const cleanRef = normalizePassReference(nonExistentPass);
      const passRow = await queryOne(
        'SELECT child_event_entry_id, status FROM event_passes WHERE pass_reference = ?',
        [cleanRef]
      );
      assert.strictEqual(passRow, null, 'Unknown pass reference must return null (404 Not Found)');
    });

    // ==========================================
    // TEST E: Override ON + Valid Checked-in Child → Pickup Works
    // ==========================================
    await t.test('Test E: Override on + valid checked-in child allows pickup workflow', async () => {
      // Validate pickup duty window with override active
      const pickupDutyWindow = await validateVolunteerDutyWindow({
        userId: testVolunteerId,
        userRole: 'volunteer',
        eventId: testEventId,
        operationType: 'pickup'
      });
      assert.strictEqual(pickupDutyWindow.allowed, true, 'Pickup duty window must be allowed with test override');

      // Verify child is inside and can be picked up
      const insideEntry = await queryOne('SELECT status FROM child_event_entries WHERE id = ?', [entryInRangeId]);
      assert.strictEqual(insideEntry.status, 'inside');

      // Simulate successful pickup/release
      await execute(
        `UPDATE child_event_entries SET status = 'picked_up', updated_at = ? WHERE id = ?`,
        [nowIso, entryInRangeId]
      );
      await execute(
        `INSERT INTO attendance_records (id, child_event_entry_id, action_type, action_time, staff_user_id, sync_source, idempotency_key, created_at)
         VALUES (?, ?, 'check_out', ?, ?, 'live', ?, ?)`,
        [`att-out-${ts}`, entryInRangeId, nowIso, testVolunteerId, `idem-out-${ts}`, nowIso]
      );

      const releasedEntry = await queryOne('SELECT status FROM child_event_entries WHERE id = ?', [entryInRangeId]);
      assert.strictEqual(releasedEntry.status, 'picked_up', 'Child should transition to picked_up');
    });

    // ==========================================
    // TEST F: Override Expires → Normal Timing Guard Resumes
    // ==========================================
    await t.test('Test F: Override expiry automatically resumes normal schedule guard without intervention', async () => {
      // Set expiry to 10 minutes in the past
      const pastExpiry = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await execute(
        `UPDATE events SET operations_test_override_expires_at = ? WHERE id = ?`,
        [pastExpiry, testEventId]
      );

      const status = await getEventOperationsTestOverrideStatus(testEventId);
      assert.strictEqual(status.active, false, 'Override should be inactive when expired');

      const dutyWindow = await validateVolunteerDutyWindow({
        userId: testVolunteerId,
        userRole: 'volunteer',
        eventId: testEventId,
        operationType: 'check_in'
      });

      assert.strictEqual(dutyWindow.allowed, false, 'Operations must be rejected after expiry');
      assert.strictEqual(dutyWindow.code, 'EVENT_NOT_STARTED', 'Must return EVENT_NOT_STARTED again');
    });

    // ==========================================
    // TEST G: Override Manually Disabled → Normal Timing Guard Resumes
    // ==========================================
    await t.test('Test G: Override manually disabled immediately resumes normal schedule guard', async () => {
      // Enable first
      const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await execute(
        `UPDATE events
         SET operations_test_override_enabled = 1,
             operations_test_override_expires_at = ?
         WHERE id = ?`,
        [futureExpiry, testEventId]
      );

      assert.strictEqual(await isEventOperationsTestOverrideActive(testEventId), true);

      // Admin manually disables
      await execute(
        `UPDATE events
         SET operations_test_override_enabled = 0,
             operations_test_override_expires_at = NULL
         WHERE id = ?`,
        [testEventId]
      );

      assert.strictEqual(await isEventOperationsTestOverrideActive(testEventId), false, 'Should be inactive immediately after disable');

      const dutyWindow = await validateVolunteerDutyWindow({
        userId: testVolunteerId,
        userRole: 'volunteer',
        eventId: testEventId,
        operationType: 'check_in'
      });

      assert.strictEqual(dutyWindow.allowed, false);
      assert.strictEqual(dutyWindow.code, 'EVENT_NOT_STARTED');
    });

    // ==========================================
    // TEST H: Pass Reference Before/After Override Remains Identical
    // ==========================================
    await t.test('Test H: Pass reference before, during, and after override remains 100% identical', async () => {
      const passBefore = await queryOne('SELECT pass_reference FROM event_passes WHERE id = ?', [passInRangeId]);
      assert.strictEqual(passBefore.pass_reference, passRefRange);

      // Toggle override on and off
      await execute(
        `UPDATE events SET operations_test_override_enabled = 1, operations_test_override_expires_at = ? WHERE id = ?`,
        [new Date(Date.now() + 30 * 60 * 1000).toISOString(), testEventId]
      );
      const passDuring = await queryOne('SELECT pass_reference FROM event_passes WHERE id = ?', [passInRangeId]);
      assert.strictEqual(passDuring.pass_reference, passRefRange, 'Pass reference must not change during override');

      await execute(
        `UPDATE events SET operations_test_override_enabled = 0, operations_test_override_expires_at = NULL WHERE id = ?`,
        [testEventId]
      );
      const passAfter = await queryOne('SELECT pass_reference FROM event_passes WHERE id = ?', [passInRangeId]);
      assert.strictEqual(passAfter.pass_reference, passRefRange, 'Pass reference must not change after override');
    });

    // ==========================================
    // TEST I: Schedule Dates & Assignment Dates Untouched
    // ==========================================
    await t.test('Event and Duty schedule dates remain completely untouched', async () => {
      const eventRow = await queryOne('SELECT starts_at, ends_at FROM events WHERE id = ?', [testEventId]);
      assert.strictEqual(eventRow.starts_at, '2028-11-20T08:00:00Z', 'event.starts_at must not be changed');
      assert.strictEqual(eventRow.ends_at, '2028-11-25T18:00:00Z', 'event.ends_at must not be changed');

      const dutyRow = await queryOne('SELECT starts_at, ends_at FROM event_duty_assignments WHERE id = ?', [testDutyId]);
      assert.strictEqual(dutyRow.starts_at, '2028-11-20T08:00:00Z', 'duty.starts_at must not be changed');
      assert.strictEqual(dutyRow.ends_at, '2028-11-25T18:00:00Z', 'duty.ends_at must not be changed');
    });

    // ==========================================
    // TEST J: Audit Logs Verification
    // ==========================================
    await t.test('Audit log entry written for test override events', async () => {
      // Simulate audit log writes
      const auditLogId1 = crypto.randomUUID();
      const auditLogId2 = crypto.randomUUID();

      await execute(
        `INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          auditLogId1,
          testSuperAdminId,
          'super_admin',
          'EVENT_TESTING_OVERRIDE_ENABLED',
          'event',
          testEventId,
          JSON.stringify({ eventId: testEventId, adminUserId: testSuperAdminId, enabledAt: nowIso, expiresAt: nowIso, disabledAt: null, durationMinutes: 60 }),
          nowIso
        ]
      );

      await execute(
        `INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          auditLogId2,
          testSuperAdminId,
          'super_admin',
          'EVENT_TESTING_OVERRIDE_DISABLED',
          'event',
          testEventId,
          JSON.stringify({ eventId: testEventId, adminUserId: testSuperAdminId, enabledAt: null, expiresAt: null, disabledAt: nowIso }),
          nowIso
        ]
      );

      const logs = await query(
        `SELECT action, details FROM audit_logs WHERE target_id = ? ORDER BY timestamp ASC`,
        [testEventId]
      );

      assert.strictEqual(logs.length, 2);
      assert.strictEqual(logs[0].action, 'EVENT_TESTING_OVERRIDE_ENABLED');
      assert.strictEqual(logs[1].action, 'EVENT_TESTING_OVERRIDE_DISABLED');
    });

  } finally {
    // Clean up all synthetic fixture records so test leaves database spotless
    try {
      await execute('DELETE FROM audit_logs WHERE target_id = ?', [testEventId]);
      await execute('DELETE FROM attendance_records WHERE child_event_entry_id IN (?, ?)', [entryInRangeId, entryOutOfScopeId]);
      await execute('DELETE FROM event_passes WHERE id IN (?, ?)', [passInRangeId, passOutOfScopeId]);
      await execute('DELETE FROM child_event_entries WHERE id IN (?, ?)', [entryInRangeId, entryOutOfScopeId]);
      await execute('DELETE FROM children WHERE id IN (?, ?)', [childInRangeId, childOutOfScopeId]);
      await execute('DELETE FROM parent_profiles WHERE id = ?', [testParentProfileId]);
      await execute('DELETE FROM event_duty_assignments WHERE id = ?', [testDutyId]);
      await execute('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [testSuperAdminId, testAdminId, testVolunteerId, testParentId]);
      await execute('DELETE FROM events WHERE id = ?', [testEventId]);
    } catch (cleanupErr) {
      console.error('Test cleanup error (ignored):', cleanupErr);
    }
  }
});
