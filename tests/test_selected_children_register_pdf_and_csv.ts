import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { query, queryOne, execute } from '../src/server/db';
import { handleSelectedChildrenReport, renderSelectedChildrenPdf, renderSelectedChildrenCsv, getSelectedChildrenPdfFilename, getSelectedChildrenCsvFilename } from '../src/server/services/selectedChildrenReportService';
import { validatePassForScan, getPassForChild, getPassesForParent } from '../src/server/services/passService';
import { CANONICAL_GA_EVENT_DATE } from '../src/server/services/eligibilityService';

test('Selected Children Register PDF & CSV Suite (Requirements 1–34)', async (t) => {
  const now = new Date().toISOString();
  const testEventId = `ev-reg-test-${Date.now()}`;
  const adminId = `usr-admin-${Date.now()}`;
  const parentId = `usr-parent-${Date.now()}`;
  const parentProfileId = `prof-${Date.now()}`;

  // Clean up any test passes from prior test runs
  await execute(`DELETE FROM event_passes WHERE pass_reference LIKE 'KOI-2026-%'`);

  // 1. Seed test event
  await execute(`
    INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
    VALUES (?, ?, 'current', '2026-11-20', '2026-11-22', ?, ?)
  `, [testEventId, 'The General Assembly 2026', now, now]);

  // 2. Seed Admin & Parent users
  await execute(`
    INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
    VALUES (?, ?, 'hashed', 'admin', 'active', ?, ?)
  `, [adminId, `admin_${Date.now()}@koinonia.test`, now, now]);

  await execute(`
    INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
    VALUES (?, ?, 'hashed', 'parent', 'active', ?, ?)
  `, [parentId, `parent_${Date.now()}@koinonia.test`, now, now]);

  await execute(`
    INSERT INTO parent_profiles (id, user_id, full_name, phone_number, home_address, created_at, updated_at)
    VALUES (?, ?, 'Grace Chukwu', '+2348011223344', 'Abuja', ?, ?)
  `, [parentProfileId, parentId, now, now]);

  // Helper to seed child + entry + pass
  const seedChildWithPass = async (opts: {
    fullName: string;
    dob: string;
    passRef?: string;
    gender?: string;
    status?: string;
  }) => {
    const childId = `ch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entryId = `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const status = opts.status || 'pass_ready';
    const gender = opts.gender || 'Female';

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [childId, parentProfileId, opts.fullName, opts.dob, gender, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [entryId, testEventId, childId, status, now, now]);

    let passId = null;
    if (opts.passRef) {
      passId = `pass-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await execute(`
        INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
      `, [passId, entryId, opts.passRef, `hash-${opts.passRef}`, now, now, now]);
    }

    return { childId, entryId, passId, passRef: opts.passRef };
  };

  // Seed Canonical Fixture Child (Requirement 23 & 24)
  // "Child: Bethertrade, pass_reference = KOI-2026-F69E8A"
  const bethertrade = await seedChildWithPass({
    fullName: 'Bethertrade',
    dob: '2022-03-15', // Age 4 on 2026-11-20
    passRef: 'KOI-2026-F69E8A',
    gender: 'Female',
    status: 'pass_ready'
  });

  // Seed children across Age 2 through Age 14
  // Seed Age 2
  await seedChildWithPass({ fullName: 'Ada BabyTwo', dob: '2024-05-10', passRef: 'KOI-2026-AGE2-A' });
  await seedChildWithPass({ fullName: 'Blessing BabyTwo', dob: '2024-02-12', passRef: 'KOI-2026-AGE2-B' });

  // Seed Age 3
  await seedChildWithPass({ fullName: 'Chidi Three', dob: '2023-08-10', passRef: 'KOI-2026-AGE3-A' });

  // Seed Age 4
  await seedChildWithPass({ fullName: 'Abigail YoungFour', dob: '2022-07-20', passRef: 'KOI-2026-AGE4-A' });

  // Seed Age 5 with Missing Pass (Requirement 21)
  const missingPassChild = await seedChildWithPass({
    fullName: 'David FiveNoPass',
    dob: '2021-04-10',
    status: 'selected' // No pass row inserted!
  });

  // Seed Age 14
  await seedChildWithPass({ fullName: 'Zainab Fourteen', dob: '2012-01-15', passRef: 'KOI-2026-AGE14-A' });
  await seedChildWithPass({ fullName: 'Aaron Fourteen', dob: '2012-06-11', passRef: 'KOI-2026-AGE14-B' });

  // Express test server for API tests
  const app = express();
  app.use(express.json());
  app.get('/api/admin/reports/selected-children', (req: any, res: any) => {
    req.user = { id: adminId, role: 'admin' };
    return handleSelectedChildrenReport(req, res, 'json');
  });
  app.get('/api/admin/reports/selected-children/export-pdf', (req: any, res: any) => {
    req.user = { id: adminId, role: 'admin' };
    return handleSelectedChildrenReport(req, res, 'pdf');
  });
  app.get('/api/admin/reports/selected-children/export-csv', (req: any, res: any) => {
    req.user = { id: adminId, role: 'admin' };
    return handleSelectedChildrenReport(req, res, 'csv');
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // ===================== TEST CASES =====================

  // Test 1: Parent, Admin, and Report QR Payload Parity (Requirement 23)
  await t.test('Test 1: Parent, Admin, and Report QR payload character-for-character parity', async () => {
    // 1. Parent Pass API resolver
    const parentPasses = await getPassesForParent(parentProfileId, testEventId);
    const parentPass = parentPasses.passes.find((p: any) => p.childId === bethertrade.childId);
    assert.ok(parentPass, 'Parent pass must exist');
    assert.strictEqual(parentPass.passCode, 'KOI-2026-F69E8A');
    assert.strictEqual(parentPass.qrPayload, 'KOI-2026-F69E8A');

    // Also verify getPassForChild raw pass row
    const rawPass = await getPassForChild(bethertrade.childId, testEventId);
    assert.ok(rawPass, 'Raw pass must exist');
    assert.strictEqual(rawPass.pass_reference, 'KOI-2026-F69E8A');

    // 2. Report data resolver
    const res = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}`);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    const bethRecord = data.children.find((c: any) => c.childId === bethertrade.childId);
    assert.ok(bethRecord, 'Bethertrade must be present in report data');
    assert.strictEqual(bethRecord.passReference, 'KOI-2026-F69E8A');

    // Character-for-character match
    assert.strictEqual(parentPass.qrPayload, bethRecord.passReference);
  });

  // Test 2: Scanner Parity Test (Requirement 24)
  await t.test('Test 2: Report QR payload validates identically in volunteer scanner resolver', async () => {
    const reportQrPayload = 'KOI-2026-F69E8A';
    const scanResult = await validatePassForScan(reportQrPayload, testEventId);
    assert.strictEqual(scanResult.valid, true, 'Scanner must accept report QR payload');
    assert.strictEqual(scanResult.entry?.child_id, bethertrade.childId);
    assert.strictEqual(scanResult.entry?.id, bethertrade.entryId);
    assert.strictEqual(scanResult.pass?.pass_reference, 'KOI-2026-F69E8A');
  });

  // Test 3: Reconciled First-Page Age Summary Table (Requirements 17 & 18)
  await t.test('Test 3: First-page age summary reconciles with total selected population', async () => {
    const res = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}`);
    const data: any = await res.json();

    // Verify summary counts
    assert.ok(data.ageBreakdown, 'Age breakdown must exist');
    let sumOfExactAges = 0;
    for (const group of data.ageBreakdown) {
      if (Array.isArray(group.ages)) {
        for (const exact of group.ages) {
          sumOfExactAges += exact.selected;
        }
      }
    }
    assert.strictEqual(sumOfExactAges, data.summary.totalSelected, 'Sum of exact age counts must equal totalSelected');
  });

  // Test 4: PDF Exact Age Section Separation & In-Section A-Z Sorting (Requirements 1, 2, 6, 7)
  await t.test('Test 4: PDF generates exact-age sections with A-Z sorting within each age', async () => {
    const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-pdf?eventId=${testEventId}`);
    assert.strictEqual(res.status, 200);
    assert.ok((res.headers.get('content-type') || '').includes('application/pdf'));

    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.toString('latin1').startsWith('%PDF'), 'Must be valid PDF');
    const pdfText = buf.toString('latin1');

    // Administrative header check (Requirement 5)
    assert.ok(pdfText.includes('KOINONIA CHILDREN & TEENS'));
    assert.ok(pdfText.includes('SELECTED CHILDREN REGISTER'));
    assert.ok(pdfText.includes('EXACT AGE BREAKDOWN'));

    // Age section headers (Requirement 6)
    assert.ok(pdfText.includes('AGE 2'));
    assert.ok(pdfText.includes('AGE 4'));
    assert.ok(pdfText.includes('AGE 14'));

    // Section ordering: Age 2 section precedes Age 4 section, which precedes Age 14
    assert.ok(pdfText.indexOf('AGE 2') < pdfText.indexOf('AGE 4'));
    assert.ok(pdfText.indexOf('AGE 4') < pdfText.indexOf('AGE 14'));

    // In-section A-Z sorting: Within Age 14, 'Aaron Fourteen' precedes 'Zainab Fourteen'
    assert.ok(pdfText.indexOf('Aaron Fourteen') < pdfText.indexOf('Zainab Fourteen'));

    // Within Age 2, 'Ada BabyTwo' precedes 'Blessing BabyTwo'
    assert.ok(pdfText.indexOf('Ada BabyTwo') < pdfText.indexOf('Blessing BabyTwo'));
  });

  // Test 5: Child Without Pass Handling (Requirement 21)
  await t.test('Test 5: Selected child without pass shows "PASS NOT AVAILABLE" without mutating database', async () => {
    const countBefore = await queryOne('SELECT COUNT(*) as cnt FROM event_passes');

    const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-pdf?eventId=${testEventId}`);
    assert.strictEqual(res.status, 200);

    const buf = Buffer.from(await res.arrayBuffer());
    const pdfText = buf.toString('latin1');
    assert.ok(pdfText.includes('David FiveNoPass'), 'Child without pass must be included');
    assert.ok(pdfText.includes('PASS NOT AVAILABLE'), 'PASS NOT AVAILABLE label must be displayed');

    const countAfter = await queryOne('SELECT COUNT(*) as cnt FROM event_passes');
    assert.strictEqual(Number(countBefore.cnt), Number(countAfter.cnt), 'Report generation must NOT create passes');
  });

  // Test 6: CSV Structure and Age Separation (Requirements 25 & 26)
  await t.test('Test 6: CSV contains 10 required columns, sorted Age ASC, Child Name ASC', async () => {
    const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-csv?eventId=${testEventId}`);
    assert.strictEqual(res.status, 200);

    const csv = await res.text();
    const lines = csv.trim().split('\n');

    // Header check
    assert.strictEqual(
      lines[0],
      'Age,No.,Child Name,Gender,Age Group,Parent / Guardian,Parent Phone,Pass Code,Pass Status,Attendance'
    );

    // Verify first data line is Age 2
    assert.ok(lines[1].startsWith('"2",'), 'First row must be Age 2');
    assert.ok(lines[1].includes('"Ada BabyTwo"'), 'Ada BabyTwo must be first in Age 2');

    // Verify Age 14 is at the bottom
    const lastLine = lines[lines.length - 1];
    assert.ok(lastLine.startsWith('"14",'), 'Last row must be Age 14');
    assert.ok(lastLine.includes('"Zainab Fourteen"'), 'Zainab Fourteen must be last in Age 14');

    // Verify Pass Code column contains canonical pass code
    assert.ok(csv.includes('"KOI-2026-F69E8A"'));
  });

  // Test 7: Filenames (Requirements 32 & 33)
  await t.test('Test 7: Filename format complies with TGA-2026 convention', () => {
    // Default range
    const pdfDefault = getSelectedChildrenPdfFilename('The General Assembly 2026');
    assert.strictEqual(pdfDefault, 'TGA-2026-Selected-Children-QR-Register-Ages-2-to-14.pdf');

    const csvDefault = getSelectedChildrenCsvFilename('The General Assembly 2026');
    assert.strictEqual(csvDefault, 'TGA-2026-Selected-Children-Ages-2-to-14.csv');

    // Custom range 4..14
    const pdfCustom = getSelectedChildrenPdfFilename('The General Assembly 2026', undefined, null, 4, 14);
    assert.strictEqual(pdfCustom, 'TGA-2026-Selected-Children-QR-Register-Ages-4-to-14.pdf');

    const csvCustom = getSelectedChildrenCsvFilename('The General Assembly 2026', undefined, null, 4, 14);
    assert.strictEqual(csvCustom, 'TGA-2026-Selected-Children-Ages-4-to-14.csv');

    // Exact age 2
    const pdfExact = getSelectedChildrenPdfFilename('The General Assembly 2026', undefined, 2);
    assert.strictEqual(pdfExact, 'TGA-2026-Selected-Children-QR-Register-Age-2.pdf');

    const csvExact = getSelectedChildrenCsvFilename('The General Assembly 2026', undefined, 2);
    assert.strictEqual(csvExact, 'TGA-2026-Selected-Children-Age-2.csv');
  });

  // Test 8: Large Register Simulation (1,500 children) (Requirement 31)
  await t.test('Test 8: Large register simulation (1,500 records) generates successfully with zero pass mutations', async () => {
    const passesCountBefore = await queryOne('SELECT COUNT(*) as cnt FROM event_passes');

    // Generate mock dataset of 1,500 records
    const largeMockRecords: any[] = [];
    for (let i = 0; i < 1500; i++) {
      const age = 2 + (i % 13); // ages 2..14
      largeMockRecords.push({
        childId: `large-ch-${i}`,
        eventEntryId: `large-entry-${i}`,
        fullName: `Mock Child ${String(i).padStart(4, '0')}`,
        photoUrl: null,
        dateOfBirth: `20${26 - age}-05-01`,
        age,
        ageGroup: age <= 3 ? '2–3' : age <= 6 ? '4–6' : age <= 9 ? '7–9' : age <= 12 ? '10–12' : '13–14',
        gender: i % 2 === 0 ? 'Female' : 'Male',
        parent: {
          id: `p-${i}`,
          fullName: `Parent ${i}`,
          phone: `+234800000${String(i).padStart(4, '0')}`,
          email: `parent${i}@mock.test`
        },
        pickupPerson: {
          fullName: `Pickup Person ${i}`,
          relationship: 'Guardian',
          phone: `+234800000${String(i).padStart(4, '0')}`,
          isPrimaryParent: false
        },
        passStatus: 'pass_ready',
        attendanceStatus: 'not_arrived',
        passReference: `KOI-2026-LARGE-${i}`
      });
    }

    const t0 = Date.now();
    const pdfBuffer = await renderSelectedChildrenPdf({
      event: { id: testEventId, title: 'The General Assembly 2026', starts_at: '2026-11-20' },
      summary: {
        totalSelected: 1500,
        passReady: 1500,
        missingPass: 0,
        checkedIn: 0,
        inside: 0,
        pickedUp: 0
      },
      ageGroups: [],
      ageBreakdown: [],
      filtered: largeMockRecords,
      pagination: {
        page: 1,
        pageSize: 1500,
        totalRecords: 1500,
        totalPages: 1,
        paginatedChildren: largeMockRecords
      },
      filters: {
        search: '',
        ageGroup: '',
        exactAge: null,
        minAge: 2,
        maxAge: 14,
        sort: 'name_asc',
        passStatus: '',
        attendanceStatus: '',
        gender: ''
      }
    });

    const elapsed = Date.now() - t0;
    assert.ok(pdfBuffer.length > 50000, 'PDF buffer must be non-empty');
    assert.ok(pdfBuffer.toString('latin1').startsWith('%PDF'), 'Output must be valid PDF');
    console.log(`Large register (1,500 children) generated in ${elapsed} ms, size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    const passesCountAfter = await queryOne('SELECT COUNT(*) as cnt FROM event_passes');
    assert.strictEqual(Number(passesCountBefore.cnt), Number(passesCountAfter.cnt), 'Large register generation made ZERO pass mutations');
  });

  // Test 9: Authorised Pickup Update Test (Requirement 28)
  await t.test('Test 9: Updated authorised pickup person appears in PDF instead of original parent', async () => {
    // Seed a child with designated pickup person Sarah Connor (Aunt)
    const childWithPickup = await seedChildWithPass({
      fullName: 'John Connor',
      dob: '2020-05-15', // Age 6
      passRef: 'KOI-2026-PICKUP-TEST'
    });

    const pickupId = `pk-${Date.now()}`;
    await execute(`
      INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, approved_by_parent, created_at, updated_at)
      VALUES (?, ?, 'designated', 'Sarah Connor', 'Aunt', '+2348099887766', 1, ?, ?)
    `, [pickupId, childWithPickup.entryId, now, now]);

    const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-pdf?eventId=${testEventId}`);
    assert.strictEqual(res.status, 200);

    const buf = Buffer.from(await res.arrayBuffer());
    const pdfText = buf.toString('latin1');

    assert.ok(pdfText.includes('JOHN CONNOR'), 'Child name must appear in register');
    assert.ok(pdfText.includes('Sarah Connor'), 'Updated pickup person name must appear in register');
    assert.ok(pdfText.includes('Aunt'), 'Updated pickup relationship must appear in register');
  });

  server.close();
});
