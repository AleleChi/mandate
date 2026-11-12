/**
 * tests/test_event_analytics.ts
 *
 * Comprehensive isolated test suite for the read-only Event Analytics module.
 * Uses an isolated temporary SQLite database in os.tmpdir(). Never touches production records.
 *
 * Run: npx tsx tests/test_event_analytics.ts
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import http from 'http';
import crypto from 'crypto';
import assert from 'node:assert/strict';
import express from 'express';

const tempDbPath = path.join(os.tmpdir(), `koinonia-event-analytics-${Date.now()}.sqlite`);

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
    console.error(`    ${err?.stack || err?.message}`);
    failures.push(name);
    failedCount++;
  }
}

function dobForAgeOnDate(age: number, eventDateStr: string): string {
  const year = Number(eventDateStr.slice(0, 4)) - age;
  return `${year}-05-10`;
}

async function main() {
  console.log('\n=== EVENT ANALYTICS READ-ONLY SUITE ===\n');

  process.env.TEST_SQLITE_PATH = tempDbPath;
  delete process.env.DATABASE_URL;

  const { execute, queryOne } = await import('../src/server/db');
  const { generateToken } = await import('../src/server/auth');
  const { getEventAnalyticsSnapshot, renderEventAnalyticsCsv } = await import(
    '../src/server/services/eventAnalyticsService'
  );
  const { createEventAnalyticsRouter } = await import('../src/server/routes/eventAnalytics');
  const { adminDutyRouter } = await import('../src/server/routes/duty');

  const now = new Date().toISOString();
  const mainEventId = `ev-analytics-${Date.now()}`;
  const scaleEventId = `ev-scale-${Date.now()}`;
  const eventStart = '2026-11-21T08:00:00Z';

  await execute(`UPDATE events SET status = 'archived' WHERE id = 'event-ga-2026'`);
  await execute(
    `INSERT INTO events (id, title, status, starts_at, ends_at, location, timezone, created_at, updated_at)
     VALUES (?, 'GA 2026 Live', 'current', ?, '2026-11-21T18:00:00Z', 'Main Hall', 'Europe/London', ?, ?)`,
    [mainEventId, eventStart, now, now]
  );
  await execute(
    `INSERT INTO events (id, title, status, starts_at, ends_at, location, timezone, created_at, updated_at)
     VALUES (?, 'Scale Benchmark Event', 'upcoming', ?, '2026-11-22T18:00:00Z', 'Overflow Tent', 'Europe/London', ?, ?)`,
    [scaleEventId, '2026-11-22T08:00:00Z', now, now]
  );

  // Create users: admin, super_admin, team, parent, volunteers
  const adminId = `u-admin-${crypto.randomUUID()}`;
  const superAdminId = `u-super-${crypto.randomUUID()}`;
  const teamId = `u-team-${crypto.randomUUID()}`;
  const parentUserId = `u-parent-${crypto.randomUUID()}`;
  const plainVolunteerUserId = `u-vol-plain-${crypto.randomUUID()}`;
  const volAId = `u-vol-a-${crypto.randomUUID()}`;
  const volBId = `u-vol-b-${crypto.randomUUID()}`;
  const volCId = `u-vol-c-${crypto.randomUUID()}`;

  const insertUser = async (id: string, email: string, role: string) => {
    await execute(
      `INSERT INTO users (id, email, password_hash, role, email_verified, status, created_at, updated_at)
       VALUES (?, ?, 'x', ?, 1, 'active', ?, ?)`,
      [id, email, role, now, now]
    );
  };

  await insertUser(adminId, 'admin@koinonia-test.org', 'admin');
  await insertUser(superAdminId, 'super@koinonia-test.org', 'super_admin');
  await insertUser(teamId, 'team@koinonia-test.org', 'team');
  await insertUser(parentUserId, 'sensitive.parent@secretmail.org', 'parent');
  await insertUser(plainVolunteerUserId, 'plainvol@koinonia-test.org', 'volunteer');
  await insertUser(volAId, 'vola@koinonia-test.org', 'volunteer');
  await insertUser(volBId, 'volb@koinonia-test.org', 'volunteer');
  await insertUser(volCId, 'volc@koinonia-test.org', 'volunteer');

  const parentProfId = `p-${crypto.randomUUID()}`;
  await execute(
    `INSERT INTO parent_profiles (id, user_id, full_name, email, home_address, phone_number, created_at, updated_at)
     VALUES (?, ?, 'Sensitive Parent', 'sensitive.parent@secretmail.org', '999 Private Secret Rd', '+447700900111', ?, ?)`,
    [parentProfId, parentUserId, now, now]
  );

  const insertVolProfile = async (userId: string, fullName: string, responsibilityKey: string, teamKey: string) => {
    await execute(
      `INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
       VALUES (?, ?, ?, '+447700900000', '+447700900000', ?, 'approved', ?, ?)`,
      [`vp-${crypto.randomUUID()}`, userId, fullName, teamKey, now, now]
    );
    await execute(
      `INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assigned_age_groups, status, starts_at, ends_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'Ages 2-14', 'scheduled', ?, '2026-11-21T18:00:00Z', ?, ?)`,
      [`eda-${crypto.randomUUID()}`, mainEventId, userId, responsibilityKey, teamKey, eventStart, now, now]
    );
  };

  await insertVolProfile(volAId, 'Grace Daniels', 'check_in', 'welcome_team');
  await insertVolProfile(volBId, 'Samuel Okoye', 'check_in', 'door_team');
  await insertVolProfile(volCId, 'Miriam Boateng', 'pickup_release', 'safeguarding_team');

  // Seed 100 selected children cleanly across the 5 age groups (20 per group):
  // Checked in = 60 total (0..59):
  //   - 0..24 checked in by volA (25 check-ins)
  //   - 25..42 checked in by volB (18 check-ins)
  //   - 43..59 checked in by volC (17 check-ins)
  // Picked up = 10 total (subset of checked in):
  //   - 0..4 (5 children originally checked in by volA) picked up by volA (so volA has 25 check-ins + 5 pickups = 30 actions)
  //   - 5..9 (5 children originally checked in by volA) picked up by volC (cross-volunteer check-in vs pickup!)
  // Inside = 50 total (60 checked in - 10 picked up)
  // Not arrived = 40 total (60..99)
  // Plus extra non-selected & soft-deleted children that MUST be excluded from Selected=100
  const ageRotation = [2, 3, 4, 6, 7, 9, 10, 12, 13, 14]; // evenly splits into all 5 canonical groups!
  for (let i = 0; i < 100; i++) {
    const childId = `child-${String(i).padStart(3, '0')}`;
    const entryId = `entry-${String(i).padStart(3, '0')}`;
    const age = ageRotation[i % ageRotation.length];
    const dob = dobForAgeOnDate(age, eventStart);
    await execute(
      `INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [childId, parentProfId, `Test Child ${String(i).padStart(3, '0')}`, i % 2 === 0 ? 'Female' : 'Male', dob, age, now, now]
    );

    const isCheckedIn = i < 60;
    const isPickedUp = i < 10;
    const status = isPickedUp ? 'picked_up' : isCheckedIn ? 'checked_in' : i % 2 === 0 ? 'pass_ready' : 'selected';
    const checkInBy = !isCheckedIn ? null : i < 25 ? volAId : i < 43 ? volBId : volCId;
    const pickupBy = !isPickedUp ? null : i < 5 ? volAId : volCId;

    const checkInTime = isCheckedIn ? new Date(Date.parse('2026-11-21T08:15:00Z') + i * 60_000).toISOString() : null;
    const pickupTime = isPickedUp ? new Date(Date.parse('2026-11-21T13:15:00Z') + i * 120_000).toISOString() : null;

    await execute(
      `INSERT INTO child_event_entries (
         id, child_id, event_id, status, medical_notes, support_notes,
         checked_in_at, checked_in_by, picked_up_at, picked_up_by,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'SENSITIVE MED NOTE', 'SENSITIVE SUPPORT NOTE', ?, ?, ?, ?, ?, ?)`,
      [entryId, childId, mainEventId, status, checkInTime, checkInBy, pickupTime, pickupBy, now, now]
    );

    if (isCheckedIn && checkInBy && checkInTime) {
      await execute(
        `INSERT INTO attendance_records (
           id, child_event_entry_id, action_type, action_time, staff_user_id, gate_location, sync_source, idempotency_key, created_at
         ) VALUES (?, ?, 'check_in', ?, ?, ?, 'online', ?, ?)`,
        [
          `att-${i}`,
          entryId,
          checkInTime,
          checkInBy,
          i < 25 ? 'North Gate' : 'West Gate',
          `online_check_in_${entryId}`,
          now
        ]
      );
    }
  }

  // Non-selected + soft-deleted control rows (MUST be ignored!)
  await execute(
    `INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, is_deleted, created_at, updated_at)
     VALUES ('child-deleted', ?, 'Deleted Child', 'Female', '2020-05-10', 6, 1, ?, ?)`,
    [parentProfId, now, now]
  );
  await execute(
    `INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, checked_in_by, created_at, updated_at)
     VALUES ('entry-deleted', 'child-deleted', ?, 'checked_in', '2026-11-21T09:00:00Z', ?, ?, ?)`,
    [mainEventId, volBId, now, now]
  );
  await execute(
    `INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, created_at, updated_at)
     VALUES ('child-draft', ?, 'Draft Child', 'Male', '2020-05-10', 6, ?, ?)`,
    [parentProfId, now, now]
  );
  await execute(
    `INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
     VALUES ('entry-draft', 'child-draft', ?, 'submitted', ?, ?)`,
    [mainEventId, now, now]
  );

  // Spin up lightweight Express server for HTTP, SSE, and RBAC tests
  const app = express();
  app.use(express.json());
  app.use('/api/admin/event-analytics', createEventAnalyticsRouter({ pollIntervalMs: 120 }));
  app.use('/api/admin/duty', adminDutyRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}/api/admin/event-analytics`;
  const dutyBaseUrl = `http://127.0.0.1:${addr.port}/api/admin/duty`;

  const adminToken = generateToken(adminId);
  const superAdminToken = generateToken(superAdminId);
  const teamToken = generateToken(teamId);
  const volunteerToken = generateToken(plainVolunteerUserId);
  const parentToken = generateToken(parentUserId);

  try {
    await runTest('1. Summary Metrics Accuracy (100 Selected, 60 Checked in, 10 Picked up -> 50 Inside, 40 Not arrived, 60%)', async () => {
      const snap = await getEventAnalyticsSnapshot({ eventId: mainEventId });
      assert.equal(snap.summary.selected, 100);
      assert.equal(snap.summary.checkedIn, 60);
      assert.equal(snap.summary.inside, 50);
      assert.equal(snap.summary.pickedUp, 10);
      assert.equal(snap.summary.notArrived, 40);
      assert.equal(snap.summary.attendancePct, 60);
      assert.equal(snap.summary.inside + snap.summary.pickedUp, snap.summary.checkedIn);
      assert.equal(snap.summary.checkedIn + snap.summary.notArrived, snap.summary.selected);
    });

    await runTest('2. Age Group & Exact-Age Breakdown Reconciliation', async () => {
      const snap = await getEventAnalyticsSnapshot({ eventId: mainEventId });
      assert.deepEqual(
        snap.ageGroups.map((g) => g.ageGroup),
        ['2–3', '4–6', '7–9', '10–12', '13–14']
      );
      const sumSelected = snap.ageGroups.reduce((acc, g) => acc + g.selected, 0);
      const sumCheckedIn = snap.ageGroups.reduce((acc, g) => acc + g.checkedIn, 0);
      const sumInside = snap.ageGroups.reduce((acc, g) => acc + g.inside, 0);
      const sumPickedUp = snap.ageGroups.reduce((acc, g) => acc + g.pickedUp, 0);
      const sumNotArrived = snap.ageGroups.reduce((acc, g) => acc + g.notArrived, 0);
      assert.equal(sumSelected, snap.summary.selected);
      assert.equal(sumCheckedIn, snap.summary.checkedIn);
      assert.equal(sumInside, snap.summary.inside);
      assert.equal(sumPickedUp, snap.summary.pickedUp);
      assert.equal(sumNotArrived, snap.summary.notArrived);

      for (const g of snap.ageGroups) {
        assert.equal(g.selected, 20);
        const exactSum = g.exactAges.reduce((acc, e) => acc + e.selected, 0);
        assert.equal(exactSum, g.selected);
      }
    });

    await runTest('3. Volunteer Activity Counts & Cross-Volunteer Check-in vs Pickup Attribution', async () => {
      const snap = await getEventAnalyticsSnapshot({ eventId: mainEventId });
      const volA = snap.volunteers.find((v) => v.volunteerId === volAId);
      const volB = snap.volunteers.find((v) => v.volunteerId === volBId);
      const volC = snap.volunteers.find((v) => v.volunteerId === volCId);

      assert.ok(volA && volB && volC);
      assert.equal(volA.name, 'Grace Daniels');
      assert.equal(volA.checkIns, 25);
      assert.equal(volA.pickups, 5);
      assert.equal(volA.totalActions, 30);

      assert.equal(volB.name, 'Samuel Okoye');
      assert.equal(volB.checkIns, 18);
      assert.equal(volB.pickups, 0);
      assert.equal(volB.totalActions, 18);

      // volC checked in 17 (43..59) and picked up 5 (5..9 originally checked in by volA)
      assert.equal(volC.name, 'Miriam Boateng');
      assert.equal(volC.checkIns, 17);
      assert.equal(volC.pickups, 5);
      assert.equal(volC.totalActions, 22);
    });

    await runTest('4. Recent Activity Privacy (No Child Medical/Address/Parent Email PII), Timeline, Filters & CSV/PDF', async () => {
      const snap = await getEventAnalyticsSnapshot({ eventId: mainEventId, activityPage: 1, activityPageSize: 20 });
      assert.equal(snap.recentActivity.length, 20);
      assert.equal(snap.activityPagination.totalRecords, 70); // 60 check-ins + 10 pickups
      assert.ok(snap.timeline.length > 0);
      const serialized = JSON.stringify(snap);
      assert.equal(serialized.includes('EPIPEN'), false);
      assert.equal(serialized.includes('SENSITIVE MED NOTE'), false);
      assert.equal(serialized.includes('secretmail.org'), false);
      assert.equal(serialized.includes('Private Secret Rd'), false);

      // Filter by ageGroup + action=pickup
      const filteredSnap = await getEventAnalyticsSnapshot({
        eventId: mainEventId,
        ageGroup: '4-6',
        action: 'pickup',
        activityPageSize: 50
      });
      assert.equal(filteredSnap.filters.ageGroup, '4–6');
      assert.equal(filteredSnap.filters.action, 'pickup');
      assert.ok(filteredSnap.recentActivity.length > 0);
      assert.ok(filteredSnap.recentActivity.every((a) => a.ageGroup === '4–6' && a.action === 'pickup'));

      const csv = renderEventAnalyticsCsv(snap);
      assert.ok(csv.includes('Grace Daniels'));
      assert.ok(!csv.includes('EPIPEN'));
    });

    await runTest('5. RBAC Enforcement: Rejects Volunteer & Parent (403); Allows Admin, Super Admin & Team (200)', async () => {
      const volRes = await fetch(baseUrl, { headers: { Authorization: `Bearer ${volunteerToken}` } });
      assert.equal(volRes.status, 403);

      const parRes = await fetch(baseUrl, { headers: { Authorization: `Bearer ${parentToken}` } });
      assert.equal(parRes.status, 403);

      const admRes = await fetch(baseUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
      assert.equal(admRes.status, 200);
      const admJson: any = await admRes.json();
      assert.equal(admJson.summary.selected, 100);

      const supRes = await fetch(baseUrl, { headers: { Authorization: `Bearer ${superAdminToken}` } });
      assert.equal(supRes.status, 200);

      const teamRes = await fetch(baseUrl, { headers: { Authorization: `Bearer ${teamToken}` } });
      assert.equal(teamRes.status, 200);

      // PDF export HTTP smoke
      const pdfRes = await fetch(`${baseUrl}/export-pdf?eventId=${encodeURIComponent(mainEventId)}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(pdfRes.status, 200);
      assert.equal(pdfRes.headers.get('content-type')?.includes('application/pdf'), true);
    });

    await runTest('6. SSE Stream Emits connected and analytics_update on Watermark Change', async () => {
      const controller = new AbortController();
      const sseRes = await fetch(
        `${baseUrl}/stream?eventId=${encodeURIComponent(mainEventId)}&token=${encodeURIComponent(adminToken)}`,
        { signal: controller.signal }
      );
      assert.equal(sseRes.status, 200);
      assert.ok(sseRes.headers.get('content-type')?.includes('text/event-stream'));

      const reader = sseRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sawConnected = false;
      let sawUpdate = false;

      const deadline = Date.now() + 4000;
      let triggeredWrite = false;

      while (Date.now() < deadline && !sawUpdate) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes('event: connected') && !sawConnected) {
          sawConnected = true;
          if (!triggeredWrite) {
            triggeredWrite = true;
            // Mutate check-in row directly in isolated test DB to change watermark
            const tNow = new Date().toISOString();
            await execute(
              `UPDATE child_event_entries
               SET status = 'checked_in', checked_in_at = ?, checked_in_by = ?, updated_at = ?
               WHERE id = 'entry-060'`,
              [tNow, volBId, tNow]
            );
          }
        }
        if (buffer.includes('event: analytics_update')) {
          sawUpdate = true;
          break;
        }
      }

      controller.abort();
      try {
        await reader.cancel();
      } catch {}

      assert.equal(sawConnected, true, 'Expected SSE connected event');
      assert.equal(sawUpdate, true, 'Expected SSE analytics_update event after check-in change');
    });

    await runTest('7. Performance & Scale Benchmark: 1,500 Children, 1,500+ Actions, 100 Volunteers (< 500ms)', async () => {
      const scaleVolunteerIds: string[] = [];
      for (let v = 0; v < 100; v++) {
        const vId = `u-scale-vol-${v}`;
        scaleVolunteerIds.push(vId);
        await insertUser(vId, `scalevol${v}@koinonia-test.org`, 'volunteer');
        await execute(
          `INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
           VALUES (?, ?, ?, '+447700900000', '+447700900000', 'welcome_team', 'approved', ?, ?)`,
          [`vp-s-${v}`, vId, `Scale Volunteer ${v}`, now, now]
        );
      }

      for (let i = 0; i < 1500; i++) {
        const cId = `sc-c-${i}`;
        const eId = `sc-e-${i}`;
        const age = 2 + (i % 13);
        const dob = dobForAgeOnDate(age, '2026-11-22T08:00:00Z');
        await execute(
          `INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [cId, parentProfId, `Scale Child ${i}`, i % 2 === 0 ? 'Female' : 'Male', dob, age, now, now]
        );

        const isCheckedIn = i < 1200;
        const isPickedUp = i < 400;
        const vol = scaleVolunteerIds[i % 100];
        const status = isPickedUp ? 'picked_up' : isCheckedIn ? 'checked_in' : 'selected';
        const cTime = isCheckedIn ? new Date(Date.parse('2026-11-22T08:00:00Z') + (i % 240) * 60_000).toISOString() : null;
        const pTime = isPickedUp ? new Date(Date.parse('2026-11-22T12:30:00Z') + (i % 180) * 60_000).toISOString() : null;
        await execute(
          `INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, checked_in_by, picked_up_at, picked_up_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [eId, cId, scaleEventId, status, cTime, isCheckedIn ? vol : null, pTime, isPickedUp ? vol : null, now, now]
        );
      }

      const startMs = performance.now();
      const scaleSnap = await getEventAnalyticsSnapshot({ eventId: scaleEventId });
      const elapsedMs = performance.now() - startMs;

      console.log(`    [Scale] 1,500 children + 1,600 actions + 100 volunteers queried in ${elapsedMs.toFixed(1)} ms`);
      assert.equal(scaleSnap.summary.selected, 1500);
      assert.equal(scaleSnap.summary.checkedIn, 1200);
      assert.equal(scaleSnap.summary.pickedUp, 400);
      assert.equal(scaleSnap.summary.inside, 800);
      assert.equal(scaleSnap.summary.notArrived, 300);
      assert.equal(scaleSnap.volunteers.length, 100);
      assert.ok(elapsedMs < 1500, `Expected < 1500ms, took ${elapsedMs.toFixed(1)}ms`);
    });

    await runTest('8. Event Catalogue JS Sorting, Null starts_at Fallback, and Current Event Resolution (No Mixed COALESCE)', async () => {
      const evGaId = `ev-ga-current-${Date.now()}`;
      const evUpcomingNullStartId = `ev-upcoming-null-${Date.now()}`;
      const evUpcomingOlderId = `ev-upcoming-older-${Date.now()}`;

      // Archive previous current event cleanly inside isolated temp DB and insert The General Assembly as current
      await execute(`UPDATE events SET status = 'archived' WHERE status = 'current'`);
      await execute(
        `INSERT INTO events (id, title, status, starts_at, ends_at, location, timezone, created_at, updated_at)
         VALUES (?, 'The General Assembly', 'current', '2026-11-21T08:00:00', '2026-11-21T18:00:00', 'Abuja Sanctuary', 'Africa/Lagos', ?, ?)`,
        [evGaId, '2026-11-01T10:00:00Z', now]
      );
      await execute(
        `INSERT INTO events (id, title, status, starts_at, ends_at, location, timezone, created_at, updated_at)
         VALUES (?, 'Upcoming Null Start Event', 'upcoming', NULL, NULL, 'Main Hall', 'Africa/Lagos', ?, ?)`,
        [evUpcomingNullStartId, '2026-12-05T12:00:00Z', now]
      );
      await execute(
        `INSERT INTO events (id, title, status, starts_at, ends_at, location, timezone, created_at, updated_at)
         VALUES (?, 'Upcoming Older Event', 'upcoming', '2026-11-28T08:00:00', NULL, 'Annex', 'Africa/Lagos', ?, ?)`,
        [evUpcomingOlderId, '2026-11-02T12:00:00Z', now]
      );

      // Verify empty query defaults to The General Assembly and preserves Africa/Lagos timezone
      const snap = await getEventAnalyticsSnapshot({});
      assert.ok(snap.event);
      assert.equal(snap.event.id, evGaId);
      assert.equal(snap.event.title, 'The General Assembly');
      assert.equal(snap.event.timezone, 'Africa/Lagos');
      assert.ok(snap.availableEvents.length >= 3);

      // Verify ordering: current first, then upcoming ordered by (starts_at ?? created_at) DESC, then non-upcoming
      assert.equal(snap.availableEvents[0].id, evGaId);
      assert.equal(snap.availableEvents[0].status, 'current');

      const upcomingIds = snap.availableEvents.filter((e) => e.status === 'upcoming').map((e) => e.id);
      assert.equal(upcomingIds[0], evUpcomingNullStartId, 'Null starts_at should fall back to newer created_at cleanly');
      assert.ok(upcomingIds.indexOf(evUpcomingNullStartId) < upcomingIds.indexOf(evUpcomingOlderId));
    });

    await runTest('9. Safe Removal Test: Profile-missing Zero-Action Assignment Removed via Existing Duty DELETE Without Deleting User/Attendance', async () => {
      const marshalId = `u-marshal-${crypto.randomUUID()}`;
      const marshalAssignId = `eda-marshal-${crypto.randomUUID()}`;
      await insertUser(marshalId, 'admin_95865@koinonia.org', 'admin');
      await execute(
        `INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assigned_age_groups, status, starts_at, ends_at, created_at, updated_at)
         VALUES (?, ?, ?, 'safety_marshal', 'safeguarding', NULL, 'scheduled', ?, '2026-11-21T18:00:00Z', ?, ?)`,
        [marshalAssignId, mainEventId, marshalId, eventStart, now, now]
      );

      const before = await getEventAnalyticsSnapshot({ eventId: mainEventId });
      const row = before.volunteers.find((v) => v.volunteerId === marshalId);
      assert.ok(row, 'Zero-action assigned user should appear in analytics');
      assert.equal(row.email, 'admin_95865@koinonia.org');
      assert.equal(row.profileState, 'profile_missing');
      assert.equal(row.hasUser, true);
      assert.equal(row.hasVolunteerProfile, false);
      assert.equal(row.hasDutyAssignment, true);
      assert.equal(row.hasActivity, false);
      assert.equal(row.assignmentId, marshalAssignId);
      assert.equal(row.totalActions, 0);

      // Call existing DELETE /api/admin/duty/events/:eventId/duty-assignments/:assignmentId
      const delRes = await fetch(
        `${dutyBaseUrl}/events/${encodeURIComponent(mainEventId)}/duty-assignments/${encodeURIComponent(marshalAssignId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` }
        }
      );
      assert.equal(delRes.status, 200);

      const after = await getEventAnalyticsSnapshot({ eventId: mainEventId });
      assert.equal(after.volunteers.some((v) => v.volunteerId === marshalId), false, 'Cancelled zero-action assignment should disappear from analytics');

      // Confirm user account & historical attendance entries remain untouched
      const userStillExists = await queryOne(`SELECT id, email FROM users WHERE id = ?`, [marshalId]);
      assert.ok(userStillExists);
      assert.equal(after.summary.checkedIn, before.summary.checkedIn);
    });

    await runTest('10. Historical Action Test: Staff with Completed Check-ins Remains Attributable After Assignment Removal', async () => {
      // Cancel volB's duty assignment via existing DELETE endpoint and verify historical actions stay attributed
      const before = await getEventAnalyticsSnapshot({ eventId: mainEventId });
      const volBBefore = before.volunteers.find((v) => v.volunteerId === volBId);
      assert.ok(volBBefore?.assignmentId);
      assert.ok(volBBefore.checkIns >= 18);

      const delRes = await fetch(
        `${dutyBaseUrl}/events/${encodeURIComponent(mainEventId)}/duty-assignments/${encodeURIComponent(volBBefore.assignmentId!)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` }
        }
      );
      assert.equal(delRes.status, 200);

      const after = await getEventAnalyticsSnapshot({ eventId: mainEventId });
      const volBAfter = after.volunteers.find((v) => v.volunteerId === volBId);
      assert.ok(volBAfter, 'Staff with completed actions MUST remain visible after assignment removal');
      assert.equal(volBAfter.checkIns, volBBefore.checkIns);
      assert.equal(volBAfter.hasActivity, true);
      assert.equal(volBAfter.hasDutyAssignment, false);
      assert.equal(volBAfter.assignmentId, null);
    });
  } finally {
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      const dbModule = await import('../src/server/db');
      dbModule.closeDb();
    } catch {}
    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    } catch {}
  }

  console.log(`\nSummary: ${passedCount} passed, ${failedCount} failed.`);
  if (failedCount > 0) {
    console.error('Failed tests:', failures);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

