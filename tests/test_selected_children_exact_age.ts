/**
 * tests/test_selected_children_exact_age.ts
 *
 * Dedicated regression suite for Selected Children Exact-Age Reporting (Scenarios A–K).
 * Runs completely isolated using a temporary SQLite database in os.tmpdir().
 * Never modifies any production or local dev event/child records.
 *
 * Run: npx tsx tests/test_selected_children_exact_age.ts
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import assert from 'node:assert/strict';
import express from 'express';

const tempDbPath = path.join(os.tmpdir(), `koinonia-exact-age-test-${Date.now()}.sqlite`);

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
  console.log('\n=== SELECTED CHILDREN EXACT-AGE REPORTING SUITE (A–K) ===\n');

  // Set isolated temp SQLite path BEFORE importing any backend modules (prevents ESM hoisting leaks)
  process.env.TEST_SQLITE_PATH = tempDbPath;
  delete process.env.DATABASE_URL;

  const { execute } = await import('../src/server/db');
  const { generateToken } = await import('../src/server/auth');
  const { issuePassForChild } = await import('../src/server/services/passService');
  const { getSelectedChildrenReportData } = await import('../src/server/services/selectedChildrenReportService');
  const adminRoutes = (await import('../src/server/routes/admin')).default;
  const reportsRoutes = (await import('../src/server/routes/reports')).default;

  const testEventId = `ev-exact-age-${Date.now()}`;
  const eventStartsAt = '2026-11-21T08:00:00Z'; // Canonical event date: 2026-11-21
  const now = new Date().toISOString();

  // In this isolated temp DB, ensure only our test event is seeded as test target
  await execute(`UPDATE events SET status = 'archived' WHERE id = 'event-ga-2026'`);
  await execute(`
    INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
    VALUES (?, 'The General Assembly 2026', 'current', ?, '2026-11-22T18:00:00Z', ?, ?)
  `, [testEventId, eventStartsAt, now, now]);

  // Seed Parent & Admin
  const testUserId = `parent-user-${crypto.randomUUID()}`;
  const testParentId = `parent-prof-${crypto.randomUUID()}`;
  await execute(`
    INSERT INTO users (id, email, role, created_at, updated_at)
    VALUES (?, ?, 'parent', ?, ?)
  `, [testUserId, `parent_exact_${Date.now()}@koinonia.test`, now, now]);
  await execute(`
    INSERT INTO parent_profiles (id, user_id, full_name, phone_number, email, created_at, updated_at)
    VALUES (?, ?, 'Grace Emmanuel', '+2348099988877', 'grace.emmanuel@koinonia.test', ?, ?)
  `, [testParentId, testUserId, now, now]);

  const adminUserId = `admin-user-${crypto.randomUUID()}`;
  await execute(`
    INSERT INTO users (id, email, role, created_at, updated_at)
    VALUES (?, ?, 'admin', ?, ?)
  `, [adminUserId, `admin_exact_${Date.now()}@koinonia.test`, now, now]);
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
    // -----------------------------------------------------------------------
    // Fixture Seeding covering all ages (2..14), statuses, and edge dates:
    // Event date: 2026-11-21
    // -----------------------------------------------------------------------
    // Age 2 fixtures (total = 3 selected):
    // 1. Turned 2 well before event
    await seedChild({
      fullName: 'Adaeze AgeTwo',
      dob: '2024-06-15',
      status: 'pass_ready',
      gender: 'female',
      withPass: true,
      medicalInfo: 'SECRET_ASTHMA_NOTE'
    });
    // 2. Turns 3 the day AFTER event (2023-11-22) + stale calculated_age=3 -> MUST be Age 2 on event date! (Scenario K)
    await seedChild({
      fullName: 'Ben TomorrowThree',
      dob: '2023-11-22',
      staleCalculatedAge: 3,
      status: 'selected',
      gender: 'male'
    });
    // 3. Picked-up Age 2 child -> MUST remain included (Scenario F)
    await seedChild({
      fullName: 'Chidi PickedUpTwo',
      dob: '2024-01-10',
      status: 'picked_up',
      gender: 'male',
      withPass: true
    });

    // Under-review Age 2 child -> MUST be excluded (Scenario E)
    await seedChild({
      fullName: 'Excluded UnderReviewTwo',
      dob: '2024-04-10',
      status: 'under_review',
      gender: 'female'
    });
    // Waiting list / withdrawn / not_selected / draft / incomplete Age 2 -> MUST be excluded
    await seedChild({ fullName: 'Excluded WaitingTwo', dob: '2024-05-01', status: 'waiting_list' });
    await seedChild({ fullName: 'Excluded NotSelectedTwo', dob: '2024-05-02', status: 'not_selected' });
    await seedChild({ fullName: 'Excluded WithdrawnTwo', dob: '2024-05-03', status: 'withdrawn' });
    await seedChild({ fullName: 'Excluded DraftTwo', dob: '2024-05-04', status: 'draft' });
    await seedChild({ fullName: 'Excluded IncompleteTwo', dob: '2024-05-05', status: 'incomplete' });

    // Age 3 fixtures (total = 2 selected):
    // 1. Turns 3 ON event date (2023-11-21) + stale calculated_age=2 -> MUST be Age 3! (Scenario K)
    await seedChild({
      fullName: 'Daniel Emmanuel BirthdayThree',
      dob: '2023-11-21',
      staleCalculatedAge: 2,
      status: 'checked_in',
      gender: 'male',
      withPass: true
    });
    // 2. Normal Age 3 child without "Emmanuel" in name (Scenario J)
    await seedChild({
      fullName: 'Esther RegularThree',
      dob: '2023-03-10',
      status: 'inside',
      gender: 'female',
      withPass: true
    });

    // Age 4 fixtures (30 selected children for pagination Scenario I):
    for (let i = 1; i <= 30; i++) {
      await seedChild({
        fullName: `FourYearOld Child ${String(i).padStart(2, '0')}`,
        dob: '2022-05-15',
        status: i % 2 === 0 ? 'pass_ready' : 'selected',
        gender: i % 2 === 0 ? 'female' : 'male',
        withPass: i % 2 === 0
      });
    }

    // Remaining exact ages 5..14 (1 selected child each for full reconciliation verification)
    for (let age = 5; age <= 14; age++) {
      const birthYear = 2026 - age;
      await seedChild({
        fullName: `ExactAge ${age} Child`,
        dob: `${birthYear}-04-12`,
        status: 'pass_ready',
        gender: age % 2 === 0 ? 'female' : 'male',
        withPass: true
      });
    }

    // =======================================================================
    // TEST SCENARIOS A THROUGH K
    // =======================================================================

    // Scenario A: Age-group total equals sum of exact ages
    await runTest('Scenario A: Age-group total equals sum of exact ages across all canonical buckets', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);
      assert.ok(Array.isArray(data.ageBreakdown), 'ageBreakdown must be returned as an array');

      let totalFromBreakdown = 0;
      for (const group of data.ageBreakdown) {
        assert.ok(Array.isArray(group.ages), `Group ${group.ageGroup} must include exact-age array`);
        const sumAgesSelected = group.ages.reduce((acc: number, a: any) => acc + a.selected, 0);
        const sumAgesPassReady = group.ages.reduce((acc: number, a: any) => acc + a.passReady, 0);
        const sumAgesMissingPass = group.ages.reduce((acc: number, a: any) => acc + a.missingPass, 0);

        assert.equal(sumAgesSelected, group.selected, `Group ${group.ageGroup}: sum(exactAges.selected) must equal group.selected`);
        assert.equal(sumAgesPassReady, group.passReady, `Group ${group.ageGroup}: sum(exactAges.passReady) must equal group.passReady`);
        assert.equal(sumAgesMissingPass, group.missingPass, `Group ${group.ageGroup}: sum(exactAges.missingPass) must equal group.missingPass`);
        totalFromBreakdown += group.selected;
      }
      assert.equal(totalFromBreakdown, data.summary.totalSelected, 'Total across ageBreakdown must equal summary.totalSelected');

      const group23 = data.ageBreakdown.find((g: any) => g.ageGroup === '2–3');
      assert.ok(group23, '2–3 bucket must exist');
      assert.equal(group23.selected, 5, 'Ages 2–3 must total 5 (3 Age 2 + 2 Age 3)');
      assert.equal(group23.ages.find((a: any) => a.age === 2)?.selected, 3);
      assert.equal(group23.ages.find((a: any) => a.age === 3)?.selected, 2);

      const group46 = data.ageBreakdown.find((g: any) => g.ageGroup === '4–6');
      assert.equal(group46.selected, 32, 'Ages 4–6 must total 32 (30 Age 4 + 1 Age 5 + 1 Age 6)');
    });

    // Scenario B: Exact Age 2 returns only age-2 selected children
    await runTest('Scenario B: exactAge=2 returns only age-2 selected children', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&ageGroup=2-3&exactAge=2&pageSize=50`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.pagination.totalRecords, 3);
      assert.equal(data.children.length, 3);
      for (const c of data.children) {
        assert.equal(c.age, 2, `Child ${c.fullName} must be exact age 2`);
      }
      const names = data.children.map((c: any) => c.fullName);
      assert.ok(names.includes('Adaeze AgeTwo'));
      assert.ok(names.includes('Ben TomorrowThree'));
      assert.ok(names.includes('Chidi PickedUpTwo'));
    });

    // Scenario C: Exact Age 3 returns only age-3 selected children
    await runTest('Scenario C: exactAge=3 returns only age-3 selected children', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&ageGroup=2-3&exactAge=3&pageSize=50`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.pagination.totalRecords, 2);
      assert.equal(data.children.length, 2);
      for (const c of data.children) {
        assert.equal(c.age, 3);
      }
    });

    // Scenario D: Other exact ages (Age 4..14) return only matching exact age
    await runTest('Scenario D: Exact ages 4 through 14 return only matching exact-age selected children', async () => {
      const res4 = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&exactAge=4&pageSize=50`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const data4: any = await res4.json();
      assert.equal(data4.pagination.totalRecords, 30);
      assert.ok(data4.children.every((c: any) => c.age === 4));

      for (let age = 5; age <= 14; age++) {
        const resA = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&exactAge=${age}`, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert.equal(resA.status, 200);
        const dataA: any = await resA.json();
        assert.equal(dataA.pagination.totalRecords, 1, `Age ${age} must return 1 child`);
        assert.equal(dataA.children[0].age, age);
        assert.equal(dataA.children[0].fullName, `ExactAge ${age} Child`);
      }
    });

    // Scenario E: Under-review / non-selected children of matching age are excluded
    await runTest('Scenario E: Under-review, waiting-list, not-selected, draft, incomplete, withdrawn children are excluded', async () => {
      const report = await getSelectedChildrenReportData({ eventId: testEventId, exactAge: 2, pageSize: 100 });
      const names = report.filtered.map((c) => c.fullName);
      assert.ok(!names.includes('Excluded UnderReviewTwo'));
      assert.ok(!names.includes('Excluded WaitingTwo'));
      assert.ok(!names.includes('Excluded NotSelectedTwo'));
      assert.ok(!names.includes('Excluded WithdrawnTwo'));
      assert.ok(!names.includes('Excluded DraftTwo'));
      assert.ok(!names.includes('Excluded IncompleteTwo'));
    });

    // Scenario F: Picked-up selected child remains included
    await runTest('Scenario F: Picked-up selected child remains included in exact-age counts and list', async () => {
      const report = await getSelectedChildrenReportData({ eventId: testEventId, exactAge: 2, pageSize: 100 });
      const pickedUpChild = report.filtered.find((c) => c.fullName === 'Chidi PickedUpTwo');
      assert.ok(pickedUpChild, 'Picked-up child must be present in exact-age report');
      assert.equal(pickedUpChild.attendanceStatus, 'picked_up');
    });

    // Scenario G: Exact-age PDF contains only requested age, proper title and headers
    await runTest('Scenario G: Exact-age PDF returns valid PDF containing only requested exact age', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-pdf?eventId=${testEventId}&ageGroup=2-3&exactAge=2`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const ct = res.headers.get('content-type') || '';
      assert.ok(ct.includes('application/pdf'), `Expected application/pdf, got ${ct}`);

      const disp = res.headers.get('content-disposition') || '';
      assert.ok(disp.includes('Age-2.pdf'), `Expected Age-2.pdf filename in header, got ${disp}`);

      const buf = Buffer.from(await res.arrayBuffer());
      assert.ok(buf.slice(0, 4).toString('ascii') === '%PDF', 'Output must begin with %PDF');

      const pdfText = buf.toString('latin1');
      assert.ok(pdfText.includes('KOINONIA CHILDREN & TEENS'), 'PDF header must include ministry branding');
      assert.ok(pdfText.includes('SELECTED CHILDREN'), 'PDF title must include SELECTED CHILDREN');
      assert.ok(pdfText.includes('AGE 2'), 'PDF title must include AGE 2');
      assert.ok(pdfText.includes('Adaeze AgeTwo'), 'PDF must contain Age 2 child');
      assert.ok(pdfText.includes('Ben TomorrowThree'), 'PDF must contain Event-date Age 2 child');
      assert.ok(!pdfText.includes('Esther RegularThree'), 'Age 2 PDF must NOT contain Age 3 child');
      assert.ok(!pdfText.includes('Excluded UnderReviewTwo'), 'Age 2 PDF must NOT contain under-review child');
      assert.ok(!pdfText.includes('FourYearOld Child 01'), 'Age 2 PDF must NOT contain Age 4 child');
    });

    // Scenario H: Exact-age CSV contains only requested age and excludes sensitive medical data
    await runTest('Scenario H: Exact-age CSV contains only requested exact age and excludes medical data', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-csv?eventId=${testEventId}&exactAge=2`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const ct = res.headers.get('content-type') || '';
      assert.ok(ct.includes('text/csv'));

      const csv = await res.text();
      const lines = csv.trim().split('\n');
      assert.equal(lines.length, 4, 'CSV must have 1 header row + 3 Age 2 data rows');
      assert.ok(csv.includes('Adaeze AgeTwo'));
      assert.ok(csv.includes('Ben TomorrowThree'));
      assert.ok(csv.includes('Chidi PickedUpTwo'));
      assert.ok(!csv.includes('Esther RegularThree'), 'CSV for Age 2 must exclude Age 3');
      assert.ok(!csv.includes('SECRET_ASTHMA_NOTE'), 'CSV must NOT include sensitive medical data');
    });

    // Scenario I: Pagination preserves exactAge
    await runTest('Scenario I: Pagination preserves exactAge across pages', async () => {
      const resPage1 = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&exactAge=4&page=1&pageSize=25`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const data1: any = await resPage1.json();
      assert.equal(data1.pagination.page, 1);
      assert.equal(data1.pagination.pageSize, 25);
      assert.equal(data1.pagination.totalRecords, 30);
      assert.equal(data1.pagination.totalPages, 2);
      assert.equal(data1.children.length, 25);
      assert.ok(data1.children.every((c: any) => c.age === 4));

      const resPage2 = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&exactAge=4&page=2&pageSize=25`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const data2: any = await resPage2.json();
      assert.equal(data2.pagination.page, 2);
      assert.equal(data2.pagination.totalRecords, 30);
      assert.equal(data2.children.length, 5);
      assert.ok(data2.children.every((c: any) => c.age === 4));

      const ids1 = new Set(data1.children.map((c: any) => c.childId));
      for (const c of data2.children) {
        assert.ok(!ids1.has(c.childId), 'Page 2 items must not duplicate Page 1 items');
      }
    });

    // Scenario J: Search + exactAge works together
    await runTest('Scenario J: Search + exactAge filter combination works properly', async () => {
      // 1. Search parent surname ("Emmanuel"): matches ONLY Age 3 children (excludes Age 2, Age 4..14 siblings)
      const resParentSearch = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&exactAge=3&search=Emmanuel`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(resParentSearch.status, 200);
      const dataParentSearch: any = await resParentSearch.json();
      assert.equal(dataParentSearch.pagination.totalRecords, 2);
      assert.ok(dataParentSearch.children.every((c: any) => c.age === 3));

      // 2. Search child name ("BirthdayThree"): narrows Age 3 down to the single matching child
      const resChildSearch = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&exactAge=3&search=BirthdayThree`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(resChildSearch.status, 200);
      const dataChildSearch: any = await resChildSearch.json();
      assert.equal(dataChildSearch.pagination.totalRecords, 1);
      assert.equal(dataChildSearch.children[0].fullName, 'Daniel Emmanuel BirthdayThree');
      assert.equal(dataChildSearch.children[0].age, 3);
    });

    // Scenario K: Event-date age calculation overrides stale calculated_age
    await runTest('Scenario K: Event-date DOB calculation determines age on event starts_at even with stale calculated_age', async () => {
      const reportAge2 = await getSelectedChildrenReportData({ eventId: testEventId, exactAge: 2 });
      const ben = reportAge2.filtered.find((c) => c.fullName === 'Ben TomorrowThree');
      assert.ok(ben, 'Child turning 3 after event must resolve as Age 2');
      assert.equal(ben.age, 2);
      assert.equal(ben.ageGroup, '2–3');

      const reportAge3 = await getSelectedChildrenReportData({ eventId: testEventId, exactAge: 3 });
      const daniel = reportAge3.filtered.find((c) => c.fullName === 'Daniel Emmanuel BirthdayThree');
      assert.ok(daniel, 'Child turning 3 on event date must resolve as Age 3');
      assert.equal(daniel.age, 3);
      assert.equal(daniel.ageGroup, '2–3');
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
    console.error('Failed scenarios:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('ALL SELECTED CHILDREN EXACT-AGE SCENARIOS (A–K) PASSED!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
