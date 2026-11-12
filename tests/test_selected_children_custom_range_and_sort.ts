/**
 * tests/test_selected_children_custom_range_and_sort.ts
 *
 * Dedicated regression suite for Selected Children Custom Age Range & Sorting (Scenarios A–L).
 * Uses an isolated temporary SQLite database in os.tmpdir(). Never touches production records.
 *
 * Run: npx tsx tests/test_selected_children_custom_range_and_sort.ts
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import assert from 'node:assert/strict';
import express from 'express';

const tempDbPath = path.join(os.tmpdir(), `koinonia-range-sort-test-${Date.now()}.sqlite`);

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
    console.error(`    ${err.stack || err.message}`);
    failures.push(name);
    failedCount++;
  }
}

async function main() {
  console.log('\n=== SELECTED CHILDREN CUSTOM AGE RANGE & SORTING SUITE (A–L) ===\n');

  process.env.TEST_SQLITE_PATH = tempDbPath;
  delete process.env.DATABASE_URL;

  const { execute } = await import('../src/server/db');
  const { generateToken } = await import('../src/server/auth');
  const { issuePassForChild } = await import('../src/server/services/passService');
  const { getSelectedChildrenReportData } = await import('../src/server/services/selectedChildrenReportService');
  const adminRoutes = (await import('../src/server/routes/admin')).default;
  const reportsRoutes = (await import('../src/server/routes/reports')).default;

  const testEventId = `ev-range-sort-${Date.now()}`;
  const eventStartsAt = '2026-11-21T08:00:00Z';
  const now = new Date().toISOString();

  await execute(`UPDATE events SET status = 'archived' WHERE id = 'event-ga-2026'`);
  await execute(`
    INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
    VALUES (?, 'The General Assembly 2026', 'current', ?, '2026-11-22T18:00:00Z', ?, ?)
  `, [testEventId, eventStartsAt, now, now]);

  const testUserId = `parent-user-${crypto.randomUUID()}`;
  const testParentId = `parent-prof-${crypto.randomUUID()}`;
  await execute(`
    INSERT INTO users (id, email, role, created_at, updated_at)
    VALUES (?, ?, 'parent', ?, ?)
  `, [testUserId, `parent_range_${Date.now()}@koinonia.test`, now, now]);
  await execute(`
    INSERT INTO parent_profiles (id, user_id, full_name, phone_number, email, created_at, updated_at)
    VALUES (?, ?, 'Zebra Parent Guardian', '+2348099911122', 'zebra.parent@koinonia.test', ?, ?)
  `, [testParentId, testUserId, now, now]);

  const adminUserId = `admin-user-${crypto.randomUUID()}`;
  await execute(`
    INSERT INTO users (id, email, role, created_at, updated_at)
    VALUES (?, ?, 'admin', ?, ?)
  `, [adminUserId, `admin_range_${Date.now()}@koinonia.test`, now, now]);
  const adminToken = generateToken(adminUserId);

  const app = express();
  app.use(express.json());
  app.use('/api/admin/reports', reportsRoutes);
  app.use('/api/admin', adminRoutes);

  let server: any;
  let baseUrl = '';
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const port = (server.address() as any).port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  async function seedChild(opts: {
    fullName: string;
    dob: string;
    staleCalculatedAge?: number;
    status: string;
    gender?: string;
    withPass?: boolean;
    medicalInfo?: string;
  }) {
    const childId = `child-${crypto.randomUUID()}`;
    const entryId = `entry-${crypto.randomUUID()}`;
    const photoId = `photo-${crypto.randomUUID()}`;
    await execute(`
      INSERT INTO children (
        id, parent_profile_id, full_name, date_of_birth, calculated_age, gender, photo_file_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      childId,
      testParentId,
      opts.fullName,
      opts.dob,
      opts.staleCalculatedAge ?? null,
      opts.gender || 'female',
      photoId,
      now,
      now
    ]);

    await execute(`
      INSERT INTO child_event_entries (
        id, child_id, event_id, status, has_medical_notes, medical_notes, submitted_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      entryId,
      childId,
      testEventId,
      opts.status,
      opts.medicalInfo ? 1 : 0,
      opts.medicalInfo || null,
      now,
      now,
      now
    ]);

    if (opts.withPass) {
      await issuePassForChild({ childId, eventId: testEventId });
    }
    return { childId, entryId };
  }

  try {
    // Seed Ages 2 & 3 (should be excluded from 4–14!)
    await seedChild({ fullName: 'Aaron BabyTwo', dob: '2024-03-01', status: 'pass_ready', gender: 'male', withPass: true });
    await seedChild({ fullName: 'Beth ToddlerThree', dob: '2023-03-01', status: 'checked_in', gender: 'female', withPass: true });
    // Event-date Age 3 turning 4 AFTER event date (2022-11-22) with stale calculated_age=4 -> MUST BE Age 3, excluded from 4–14
    await seedChild({
      fullName: 'Caleb TurnsFourAfterEvent',
      dob: '2022-11-22',
      staleCalculatedAge: 4,
      status: 'pass_ready',
      withPass: true
    });

    // Event-date Age 4 turning 4 ON event date (2022-11-21) with stale calculated_age=3 -> MUST BE Age 4, included in 4–14!
    await seedChild({
      fullName: 'Adanna BirthdayFour',
      dob: '2022-11-21',
      staleCalculatedAge: 3,
      status: 'pass_ready',
      withPass: true
    });

    // 13-year-old Abigail MUST appear before 4-year-old Blessing (alphabetical precedence!)
    await seedChild({ fullName: 'Abigail ElderThirteen', dob: '2013-02-10', status: 'selected', gender: 'female' });
    await seedChild({ fullName: 'Blessing YoungFour', dob: '2022-04-10', status: 'pass_ready', gender: 'female', withPass: true, medicalInfo: 'SECRET_RANGE_MED_NOTE' });
    await seedChild({ fullName: 'Chiamaka PickedUpSeven', dob: '2019-06-05', status: 'picked_up', gender: 'female', withPass: true });
    await seedChild({ fullName: 'Daniel MiddleNine', dob: '2017-01-15', status: 'inside', gender: 'male', withPass: true });
    await seedChild({ fullName: 'Esther Twelve', dob: '2014-05-12', status: 'pass_ready', gender: 'female', withPass: true });
    await seedChild({ fullName: 'Zainab Fourteen', dob: '2012-03-20', status: 'checked_in', gender: 'female', withPass: true });

    // Non-selected statuses in Ages 4–14 -> MUST be excluded
    await seedChild({ fullName: 'Excluded UnderReviewEight', dob: '2018-04-01', status: 'under_review' });
    await seedChild({ fullName: 'Excluded WaitingTen', dob: '2016-04-01', status: 'waiting_list' });
    await seedChild({ fullName: 'Excluded NotSelectedEleven', dob: '2015-04-01', status: 'not_selected' });
    await seedChild({ fullName: 'Excluded WithdrawnSix', dob: '2020-04-01', status: 'withdrawn' });
    await seedChild({ fullName: 'Excluded DraftFive', dob: '2021-04-01', status: 'draft' });

    // Seed 26 extra Ages 4–14 selected records so 4–14 total = 33 (> pageSize 25!)
    for (let i = 1; i <= 26; i++) {
      const age = 4 + (i % 11); // 4..14
      const birthYear = 2026 - age;
      await seedChild({
        fullName: `Koinonia Member ${String(i).padStart(2, '0')}`,
        dob: `${birthYear}-06-10`,
        status: 'pass_ready',
        gender: i % 2 === 0 ? 'female' : 'male',
        withPass: true
      });
    }

    // A: All selected + name A–Z
    await runTest('A: All selected children + sort=name_asc returns complete selected population A–Z', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&sort=name_asc&pageSize=100`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.pagination.totalRecords, 36); // 3 under-4 + 33 in 4–14
      const names = data.children.map((c: any) => c.fullName);
      assert.equal(names[0], 'Aaron BabyTwo');
      assert.equal(names[1], 'Abigail ElderThirteen');
      assert.equal(names[names.length - 1], 'Zainab Fourteen');
      for (let i = 1; i < names.length; i++) {
        assert.ok(names[i - 1].toLowerCase().localeCompare(names[i].toLowerCase(), 'en', { sensitivity: 'base' }) <= 0);
      }
    });

    // B: Ages 4–14 + name A–Z
    await runTest('B: minAge=4&maxAge=14&sort=name_asc excludes ages 2–3 and returns all 4–14 in A–Z order', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&minAge=4&maxAge=14&sort=name_asc&pageSize=100`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.pagination.totalRecords, 33);
      assert.ok(data.children.every((c: any) => c.age >= 4 && c.age <= 14));
      const names = data.children.map((c: any) => c.fullName);
      assert.ok(!names.includes('Aaron BabyTwo'));
      assert.ok(!names.includes('Beth ToddlerThree'));
      assert.ok(!names.includes('Caleb TurnsFourAfterEvent'));
      // 13-year-old Abigail precedes 4-year-old Blessing
      assert.ok(names.indexOf('Abigail ElderThirteen') < names.indexOf('Blessing YoungFour'));
      assert.equal(names[0], 'Abigail ElderThirteen');
      assert.equal(names[names.length - 1], 'Zainab Fourteen');
    });

    // C: Ages 7–12 + name A–Z
    await runTest('C: minAge=7&maxAge=12&sort=name_asc filters strictly ages 7..12 A–Z', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&minAge=7&maxAge=12&sort=name_asc&pageSize=100`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.ok(data.children.length > 0);
      assert.ok(data.children.every((c: any) => c.age >= 7 && c.age <= 12));
      const names = data.children.map((c: any) => c.fullName);
      assert.ok(names.includes('Chiamaka PickedUpSeven'));
      assert.ok(names.includes('Daniel MiddleNine'));
      assert.ok(names.includes('Esther Twelve'));
      assert.ok(!names.includes('Abigail ElderThirteen'));
      assert.ok(!names.includes('Blessing YoungFour'));
      assert.ok(!names.includes('Zainab Fourteen'));
    });

    // D: Single-age custom range 4–4 works
    await runTest('D: Single-age custom range minAge=4&maxAge=4 works', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&minAge=4&maxAge=4&sort=name_asc&pageSize=100`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.ok(data.children.length >= 2);
      assert.ok(data.children.every((c: any) => c.age === 4));
      assert.ok(data.children.some((c: any) => c.fullName === 'Blessing YoungFour'));
    });

    // E: Invalid 14–4 rejected
    await runTest('E: Invalid range minAge=14&maxAge=4 and invalid sort are rejected with HTTP 400', async () => {
      const resInv = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&minAge=14&maxAge=4`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(resInv.status, 400);

      const resBounds = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&minAge=1&maxAge=14`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(resBounds.status, 400);

      const resSort = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&sort=invalid_sort`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(resSort.status, 400);
    });

    // F: Range uses event-date age
    await runTest('F: Range uses canonical event-date age instead of stale calculated_age', async () => {
      const data = await getSelectedChildrenReportData({
        eventId: testEventId,
        minAge: 4,
        maxAge: 14,
        sort: 'name_asc',
        pageSize: 100
      });
      const names = data.filtered.map((c) => c.fullName);
      assert.ok(names.includes('Adanna BirthdayFour'), 'Child turning 4 on event date must be included in 4–14');
      assert.ok(!names.includes('Caleb TurnsFourAfterEvent'), 'Child turning 4 after event date must be Age 3 and excluded from 4–14');
    });

    // G: Under-review / non-selected excluded
    await runTest('G: Under-review, waiting-list, not-selected, withdrawn, and draft children are excluded', async () => {
      const data = await getSelectedChildrenReportData({
        eventId: testEventId,
        minAge: 4,
        maxAge: 14,
        pageSize: 100
      });
      const names = data.filtered.map((c) => c.fullName);
      for (const excluded of [
        'Excluded UnderReviewEight',
        'Excluded WaitingTen',
        'Excluded NotSelectedEleven',
        'Excluded WithdrawnSix',
        'Excluded DraftFive'
      ]) {
        assert.ok(!names.includes(excluded), `Excluded child ${excluded} must not appear`);
      }
    });

    // H: Picked-up selected child included
    await runTest('H: Picked-up selected child remains included in range report', async () => {
      const data = await getSelectedChildrenReportData({
        eventId: testEventId,
        minAge: 4,
        maxAge: 14,
        pageSize: 100
      });
      const picked = data.filtered.find((c) => c.fullName === 'Chiamaka PickedUpSeven');
      assert.ok(picked, 'Picked-up child must remain included');
      assert.equal(picked.attendanceStatus, 'picked_up');
    });

    // I: Pagination preserves global order (+ Z-A, age_asc, age_desc checks)
    await runTest('I: Pagination preserves global server-side sort order with zero duplicates', async () => {
      const page1Res = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&minAge=4&maxAge=14&sort=name_asc&page=1&pageSize=25`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const page2Res = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&minAge=4&maxAge=14&sort=name_asc&page=2&pageSize=25`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const p1: any = await page1Res.json();
      const p2: any = await page2Res.json();
      assert.equal(p1.pagination.totalRecords, 33);
      assert.equal(p1.children.length, 25);
      assert.equal(p2.children.length, 8);

      const combined = [...p1.children, ...p2.children];
      const uniqueIds = new Set(combined.map((c: any) => c.childId));
      assert.equal(uniqueIds.size, 33);

      const combinedNames = combined.map((c: any) => c.fullName);
      assert.equal(combinedNames[0], 'Abigail ElderThirteen');
      assert.equal(combinedNames[combinedNames.length - 1], 'Zainab Fourteen');

      // Check age_asc and name_desc server sorting
      const descData = await getSelectedChildrenReportData({ eventId: testEventId, minAge: 4, maxAge: 14, sort: 'name_desc', pageSize: 100 });
      assert.equal(descData.filtered[0].fullName, 'Zainab Fourteen');
      assert.equal(descData.filtered[descData.filtered.length - 1].fullName, 'Abigail ElderThirteen');

      const ageDesc = await getSelectedChildrenReportData({ eventId: testEventId, minAge: 4, maxAge: 14, sort: 'age_desc', pageSize: 100 });
      assert.ok(ageDesc.filtered[0].age >= ageDesc.filtered[ageDesc.filtered.length - 1].age);
    });

    // J: PDF Ages 4–14 contains all matching records in A–Z order
    await runTest('J: PDF Ages 4–14 contains all 33 matching records in A–Z order across pages', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-pdf?eventId=${testEventId}&minAge=4&maxAge=14&sort=name_asc`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      assert.ok((res.headers.get('content-type') || '').includes('application/pdf'));
      assert.ok((res.headers.get('content-disposition') || '').includes('Ages-4-14.pdf'));

      const buf = Buffer.from(await res.arrayBuffer());
      const pdfText = buf.toString('latin1');
      assert.ok(pdfText.startsWith('%PDF'));
      assert.ok(pdfText.includes('SELECTED CHILDREN'));
      assert.ok(pdfText.includes('Alphabetical Register'));
      assert.ok(pdfText.includes('Total selected children: 33'));
      // Page 1 child AND Page 2 tail child must both be present in PDF!
      assert.ok(pdfText.includes('Abigail ElderThirteen'));
      assert.ok(pdfText.includes('Blessing YoungFour'));
      assert.ok(pdfText.includes('Zainab Fourteen'));
      assert.ok(pdfText.includes('Koinonia Member 26'));
      assert.ok(!pdfText.includes('Aaron BabyTwo'));
      assert.ok(!pdfText.includes('Excluded UnderReviewEight'));
      assert.ok(pdfText.indexOf('Abigail ElderThirteen') < pdfText.indexOf('Blessing YoungFour'));
      assert.ok(pdfText.indexOf('Blessing YoungFour') < pdfText.indexOf('Zainab Fourteen'));
    });

    // K: Alphabetical name-list PDF contains only requested range & excludes sensitive fields
    await runTest('K: Alphabetical name-list PDF contains requested range in A–Z order without phone/medical details', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-pdf?eventId=${testEventId}&minAge=4&maxAge=14&sort=name_asc&variant=name_list`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      assert.ok((res.headers.get('content-disposition') || '').includes('Ages-4-14-Name-List.pdf'));

      const buf = Buffer.from(await res.arrayBuffer());
      const pdfText = buf.toString('latin1');
      assert.ok(pdfText.startsWith('%PDF'));
      assert.ok(pdfText.includes('ALPHABETICAL NAME LIST'));
      assert.ok(pdfText.includes('Abigail ElderThirteen'));
      assert.ok(pdfText.includes('Zainab Fourteen'));
      assert.ok(!pdfText.includes('Aaron BabyTwo'));
      assert.ok(!pdfText.includes('+2348099911122'), 'Name list must exclude parent phone');
      assert.ok(!pdfText.includes('zebra.parent@koinonia.test'), 'Name list must exclude parent email');
      assert.ok(!pdfText.includes('SECRET_RANGE_MED_NOTE'), 'Name list must exclude medical notes');
    });

    // L: CSV matches same range/order and columns
    await runTest('L: CSV export matches Ages 4–14 population in A–Z order', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-csv?eventId=${testEventId}&minAge=4&maxAge=14&sort=name_asc`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      assert.ok((res.headers.get('content-disposition') || '').includes('selected-children-ages-4-14.csv'));

      const csv = await res.text();
      const lines = csv.trim().split('\n');
      assert.equal(lines.length, 34, '1 header + 33 data rows');
      assert.ok(lines[0].startsWith('No.,Child Name,Age,Age Group,Gender,Parent / Guardian,Parent Phone,Pass Status,Attendance'));
      assert.ok(lines[1].includes('"1","Abigail ElderThirteen","13 yrs","13–14"'));
      assert.ok(lines[lines.length - 1].includes('"33","Zainab Fourteen","14 yrs","13–14"'));
      assert.ok(!csv.includes('Aaron BabyTwo'));
      assert.ok(!csv.includes('SECRET_RANGE_MED_NOTE'));
    });
  } finally {
    server.close();
    try {
      for (const suffix of ['', '-wal', '-shm']) {
        const f = `${tempDbPath}${suffix}`;
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    } catch {}
  }

  console.log('\n-------------------------------------------------------------');
  console.log(`Results: ${passedCount} passed, ${failedCount} failed.`);
  if (failures.length > 0) {
    process.exit(1);
  }
  console.log('ALL CUSTOM AGE RANGE & SORTING SCENARIOS (A–L) PASSED!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

