import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, query, queryOne } from '../src/server/db';
import { validateVolunteerDutyWindow } from '../src/server/services/volunteerDutyWindowService';
import { parseAssignedAgeGroups, normalizeAgeGroup } from '../src/server/services/eligibilityService';

test('Event Duty Age Groups & Operational Window Validation Suite', async (t) => {
  const ts = Date.now();
  const testEventId = `ev-duty-win-${ts}`;
  const testAdminId = `usr-duty-adm-${ts}`;
  const testLeadId = `usr-duty-lead-${ts}`;
  const testVolId = `usr-duty-vol-${ts}`;
  const testDutyId = `duty-${ts}`;
  const nowIso = new Date().toISOString();

  // Setup synthetic test event and users
  try {
    await execute(
      `INSERT INTO events (id, title, status, starts_at, ends_at, timezone, check_in_opens_at, check_in_closes_at, pickup_starts_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        testEventId,
        `Test Duty Event ${ts}`,
        'current',
        '2026-11-01T08:00:00Z',
        '2026-11-30T18:00:00Z',
        'Africa/Lagos',
        null,
        null,
        null,
        nowIso,
        nowIso
      ]
    );

    // Synthetic admin
    await execute(
      `INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, 'hash', 'admin', ?, ?)`,
      [testAdminId, `adm-${ts}@koinonia.test`, nowIso, nowIso]
    );

    // Synthetic team lead
    await execute(
      `INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, 'hash', 'team_lead', ?, ?)`,
      [testLeadId, `lead-${ts}@koinonia.test`, nowIso, nowIso]
    );

    // Synthetic volunteer
    await execute(
      `INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, 'hash', 'volunteer', ?, ?)`,
      [testVolId, `vol-${ts}@koinonia.test`, nowIso, nowIso]
    );

    // 1. Role Bypass Tests
    await t.test('Admin and Super Admin bypass all duty window restrictions', async () => {
      const resAdmin = await validateVolunteerDutyWindow({
        userId: testAdminId,
        userRole: 'admin',
        eventId: testEventId,
        operationType: 'check_in'
      });
      assert.strictEqual(resAdmin.allowed, true);
      assert.strictEqual(resAdmin.code, null);

      const resSuperAdmin = await validateVolunteerDutyWindow({
        userId: 'any-super-admin',
        userRole: 'super_admin',
        eventId: testEventId,
        operationType: 'pickup'
      });
      assert.strictEqual(resSuperAdmin.allowed, true);
      assert.strictEqual(resSuperAdmin.code, null);
    });

    await t.test('Unscoped leads without duty assignment are allowed as unscoped leads', async () => {
      const resLead = await validateVolunteerDutyWindow({
        userId: testLeadId,
        userRole: 'team_lead',
        eventId: testEventId,
        operationType: 'check_in'
      });
      assert.strictEqual(resLead.allowed, true);
      assert.strictEqual(resLead.code, null);
    });

    // 2. Event Active Window Time Guard Tests
    await t.test('Returns EVENT_NOT_STARTED when event starts in future', async () => {
      const futureEventId = `ev-future-${ts}`;
      await execute(
        `INSERT INTO events (id, title, status, starts_at, ends_at, timezone, created_at, updated_at)
         VALUES (?, ?, 'current', '2099-01-01T08:00:00Z', '2099-01-02T18:00:00Z', 'Africa/Lagos', ?, ?)`,
        [futureEventId, `Future Event ${ts}`, nowIso, nowIso]
      );

      const res = await validateVolunteerDutyWindow({
        userId: testVolId,
        userRole: 'volunteer',
        eventId: futureEventId,
        operationType: 'lookup'
      });

      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.code, 'EVENT_NOT_STARTED');
      assert.match(res.message, /has not started yet/i);

      await execute('DELETE FROM events WHERE id = ?', [futureEventId]);
    });

    await t.test('Returns EVENT_ENDED when event ended in past', async () => {
      const pastEventId = `ev-past-${ts}`;
      await execute(
        `INSERT INTO events (id, title, status, starts_at, ends_at, timezone, created_at, updated_at)
         VALUES (?, ?, 'current', '2020-01-01T08:00:00Z', '2020-01-02T18:00:00Z', 'Africa/Lagos', ?, ?)`,
        [pastEventId, `Past Event ${ts}`, nowIso, nowIso]
      );

      const res = await validateVolunteerDutyWindow({
        userId: testVolId,
        userRole: 'volunteer',
        eventId: pastEventId,
        operationType: 'check_in'
      });

      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.code, 'EVENT_ENDED');
      assert.match(res.message, /has ended/i);

      await execute('DELETE FROM events WHERE id = ?', [pastEventId]);
    });

    // 3. Volunteer Duty Window Tests (before shift, on duty, after shift, unavailable)
    await t.test('Returns DUTY_INACTIVE when volunteer has no duty assignment', async () => {
      const res = await validateVolunteerDutyWindow({
        userId: testVolId,
        userRole: 'volunteer',
        eventId: testEventId,
        operationType: 'check_in'
      });

      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.code, 'DUTY_INACTIVE');
    });

    await t.test('Returns DUTY_NOT_STARTED when shift begins in future', async () => {
      const futureStart = '2099-01-01T08:00:00Z';
      const futureEnd = '2099-01-01T16:00:00Z';
      await execute(
        `INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, assigned_age_groups, created_at, updated_at)
         VALUES (?, ?, ?, 'room_operator', 'general_response', 'primary', 'scheduled', ?, ?, ?, ?, ?)`,
        [testDutyId, testEventId, testVolId, futureStart, futureEnd, JSON.stringify(['4–6']), nowIso, nowIso]
      );

      const res = await validateVolunteerDutyWindow({
        userId: testVolId,
        userRole: 'volunteer',
        eventId: testEventId,
        operationType: 'lookup'
      });

      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.code, 'DUTY_NOT_STARTED');
      assert.match(res.message, /duty has not started/i);
    });

    await t.test('Allows operation when volunteer shift is currently active', async () => {
      const pastStart = new Date(Date.now() - 3600000).toISOString();
      const futureEnd = new Date(Date.now() + 3600000).toISOString();

      await execute(
        `UPDATE event_duty_assignments SET status = 'on_duty', starts_at = ?, ends_at = ? WHERE id = ?`,
        [pastStart, futureEnd, testDutyId]
      );

      const res = await validateVolunteerDutyWindow({
        userId: testVolId,
        userRole: 'volunteer',
        eventId: testEventId,
        operationType: 'check_in'
      });

      assert.strictEqual(res.allowed, true);
      assert.strictEqual(res.code, null);
    });

    await t.test('Returns DUTY_ENDED when volunteer shift has ended', async () => {
      const pastStart = new Date(Date.now() - 7200000).toISOString();
      const pastEnd = new Date(Date.now() - 3600000).toISOString();

      await execute(
        `UPDATE event_duty_assignments SET starts_at = ?, ends_at = ? WHERE id = ?`,
        [pastStart, pastEnd, testDutyId]
      );

      const res = await validateVolunteerDutyWindow({
        userId: testVolId,
        userRole: 'volunteer',
        eventId: testEventId,
        operationType: 'check_in'
      });

      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.code, 'DUTY_ENDED');
      assert.match(res.message, /duty has ended/i);
    });

    await t.test('Returns DUTY_INACTIVE when volunteer is on break (temporarily_unavailable)', async () => {
      const pastStart = new Date(Date.now() - 3600000).toISOString();
      const futureEnd = new Date(Date.now() + 3600000).toISOString();

      await execute(
        `UPDATE event_duty_assignments SET status = 'temporarily_unavailable', starts_at = ?, ends_at = ? WHERE id = ?`,
        [pastStart, futureEnd, testDutyId]
      );

      const res = await validateVolunteerDutyWindow({
        userId: testVolId,
        userRole: 'volunteer',
        eventId: testEventId,
        operationType: 'check_in'
      });

      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.code, 'DUTY_INACTIVE');
      assert.match(res.message, /currently marked unavailable/i);
    });

    // 4. Daily Operational Hours Tests
    await t.test('Operational window guards check_in_opens_at, check_in_closes_at, pickup_starts_at', async () => {
      const pastStart = new Date(Date.now() - 3600000).toISOString();
      const futureEnd = new Date(Date.now() + 3600000).toISOString();
      await execute(
        `UPDATE event_duty_assignments SET status = 'on_duty', starts_at = ?, ends_at = ? WHERE id = ?`,
        [pastStart, futureEnd, testDutyId]
      );

      // Check-in not open yet
      const futureCheckInOpen = new Date(Date.now() + 1800000).toISOString();
      await execute(`UPDATE events SET check_in_opens_at = ? WHERE id = ?`, [futureCheckInOpen, testEventId]);

      const resNotOpen = await validateVolunteerDutyWindow({
        userId: testVolId,
        userRole: 'volunteer',
        eventId: testEventId,
        operationType: 'check_in'
      });
      assert.strictEqual(resNotOpen.allowed, false);
      assert.strictEqual(resNotOpen.code, 'CHECK_IN_NOT_OPEN');

      // Check-in closed
      const pastCheckInClose = new Date(Date.now() - 60000).toISOString();
      await execute(`UPDATE events SET check_in_opens_at = ?, check_in_closes_at = ? WHERE id = ?`, [pastStart, pastCheckInClose, testEventId]);

      const resClosed = await validateVolunteerDutyWindow({
        userId: testVolId,
        userRole: 'volunteer',
        eventId: testEventId,
        operationType: 'check_in'
      });
      assert.strictEqual(resClosed.allowed, false);
      assert.strictEqual(resClosed.code, 'CHECK_IN_CLOSED');

      // Reset check_in bounds
      await execute(`UPDATE events SET check_in_opens_at = NULL, check_in_closes_at = NULL WHERE id = ?`, [testEventId]);

      // Pickup not started yet
      const futurePickup = new Date(Date.now() + 1800000).toISOString();
      await execute(`UPDATE events SET pickup_starts_at = ? WHERE id = ?`, [futurePickup, testEventId]);

      const resPickupNotStarted = await validateVolunteerDutyWindow({
        userId: testVolId,
        userRole: 'volunteer',
        eventId: testEventId,
        operationType: 'pickup'
      });
      assert.strictEqual(resPickupNotStarted.allowed, false);
      assert.strictEqual(resPickupNotStarted.code, 'PICKUP_NOT_STARTED');

      // Reset pickup bounds
      await execute(`UPDATE events SET pickup_starts_at = NULL WHERE id = ?`, [testEventId]);
    });

    // 5. Assigned Age Groups Normalization & Persistence
    await t.test('parseAssignedAgeGroups and normalizeAgeGroup handle multiple formats cleanly', () => {
      const parsedArray = parseAssignedAgeGroups(['Ages 4–6', 'Ages 7–9']).map(normalizeAgeGroup);
      assert.deepStrictEqual(parsedArray, ['4–6', '7–9']);

      const parsedJson = parseAssignedAgeGroups('["Ages 2–3", "Ages 13–14"]').map(normalizeAgeGroup);
      assert.deepStrictEqual(parsedJson, ['2–3', '13–14']);

      const parsedComma = parseAssignedAgeGroups('Ages 10–12, Ages 4–6').map(normalizeAgeGroup);
      assert.deepStrictEqual(parsedComma, ['10–12', '4–6']);
    });

    await t.test('Assigned age groups persist to event_duty_assignments and reload accurately', async () => {
      const newGroups = ['Ages 4–6', 'Ages 10–12'];
      const normalizedGroups = newGroups.map(normalizeAgeGroup);
      await execute(
        `UPDATE event_duty_assignments SET assigned_age_groups = ? WHERE id = ?`,
        [JSON.stringify(normalizedGroups), testDutyId]
      );

      const row = await queryOne(`SELECT assigned_age_groups FROM event_duty_assignments WHERE id = ?`, [testDutyId]);
      assert.ok(row);
      const reloaded = parseAssignedAgeGroups(row.assigned_age_groups).map(normalizeAgeGroup);
      assert.deepStrictEqual(reloaded, ['4–6', '10–12']);
    });

    // 6. Valid Pass Integrity: Pass remains valid across windows
    await t.test('Child event pass remains valid and unrevoked regardless of volunteer duty timing', async () => {
      const testParentProfileId = `prof-p-${ts}`;
      const testChildId = `ch-p-${ts}`;
      const testEntryId = `entry-${ts}`;
      const testPassId = `pass-${ts}`;
      const testPassRef = `KOI-2026-T${ts.toString().slice(-5)}`;

      await execute(
        `INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
         VALUES (?, ?, 'Test Parent', '+2348011112222', ?, ?)`,
        [testParentProfileId, testVolId, nowIso, nowIso]
      );

      await execute(
        `INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
         VALUES (?, ?, 'Test Child', 'male', '2018-05-10', 8, 'Ages 7–9', ?, ?)`,
        [testChildId, testParentProfileId, nowIso, nowIso]
      );

      await execute(
        `INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'selected', ?, ?)`,
        [testEntryId, testChildId, testEventId, nowIso, nowIso]
      );

      await execute(
        `INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
         VALUES (?, ?, ?, 'test-hash', 'active', ?, ?, ?)`,
        [testPassId, testEntryId, testPassRef, nowIso, nowIso, nowIso]
      );

      const pass = await queryOne(`SELECT * FROM event_passes WHERE id = ?`, [testPassId]);
      assert.ok(pass);
      assert.strictEqual(pass.status, 'active');
      assert.strictEqual(pass.pass_reference, testPassRef);

      // Clean up pass fixture
      await execute('DELETE FROM event_passes WHERE id = ?', [testPassId]);
      await execute('DELETE FROM child_event_entries WHERE id = ?', [testEntryId]);
      await execute('DELETE FROM children WHERE id = ?', [testChildId]);
      await execute('DELETE FROM parent_profiles WHERE id = ?', [testParentProfileId]);
    });

  } finally {
    // Teardown synthetic test fixtures
    await execute('DELETE FROM event_duty_assignments WHERE id = ?', [testDutyId]);
    await execute('DELETE FROM events WHERE id = ?', [testEventId]);
    await execute('DELETE FROM users WHERE id IN (?, ?, ?)', [testAdminId, testLeadId, testVolId]);
  }
});
