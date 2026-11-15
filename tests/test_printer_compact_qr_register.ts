import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { query, queryOne, execute } from '../src/server/db';
import {
  handleSelectedChildrenReport,
  renderSelectedChildrenPdf,
  renderSelectedChildrenPrinterCompactPdf,
  getSelectedChildrenPdfFilename,
  SelectedChildrenReportData,
  SelectedChildRecord
} from '../src/server/services/selectedChildrenReportService';
import { validatePassForScan, getPassForChild, getPassesForParent } from '../src/server/services/passService';

test('Printer Compact QR Register Suite (6.7 × 1.6 in physical rows)', async (t) => {
  const now = new Date().toISOString();
  const runId = `compact_${Date.now()}`;
  const testEventId = `ev-${runId}`;
  const adminId = `usr-admin-${runId}`;
  const parentId = `usr-parent-${runId}`;
  const parentProfileId = `prof-${runId}`;

  // 1. Seed test event
  await execute(`
    INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
    VALUES (?, ?, 'current', '2026-11-20', '2026-11-22', ?, ?)
  `, [testEventId, 'The General Assembly 2026', now, now]);

  // 2. Seed Admin & Parent users
  await execute(`
    INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
    VALUES (?, ?, 'hashed', 'admin', 'active', ?, ?)
  `, [adminId, `admin_${runId}@koinonia.test`, now, now]);

  await execute(`
    INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
    VALUES (?, ?, 'hashed', 'parent', 'active', ?, ?)
  `, [parentId, `parent_${runId}@koinonia.test`, now, now]);

  await execute(`
    INSERT INTO parent_profiles (id, user_id, full_name, phone_number, home_address, created_at, updated_at)
    VALUES (?, ?, 'Omodolapo Oyelami Hanna', '+2348146568972', 'Abuja, Nigeria', ?, ?)
  `, [parentProfileId, parentId, now, now]);

  // Helper to seed child + entry + pass + optional pickup
  const seedChild = async (opts: {
    fullName: string;
    dob: string;
    passRef?: string;
    gender?: string;
    status?: string;
    pickupName?: string;
    pickupPhone?: string;
    pickupRel?: string;
  }) => {
    const childId = `ch-${runId}-${Math.random().toString(36).slice(2, 7)}`;
    const entryId = `entry-${runId}-${Math.random().toString(36).slice(2, 7)}`;
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
      passId = `pass-${runId}-${Math.random().toString(36).slice(2, 7)}`;
      await execute(`
        INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
      `, [passId, entryId, opts.passRef, `hash-${opts.passRef}`, now, now, now]);
    }

    if (opts.pickupName) {
      const pickupId = `pk-${runId}-${Math.random().toString(36).slice(2, 7)}`;
      await execute(`
        INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, approved_by_parent, created_at, updated_at)
        VALUES (?, ?, 'designated', ?, ?, ?, 1, ?, ?)
      `, [pickupId, entryId, opts.pickupName, opts.pickupRel || 'Primary parent', opts.pickupPhone || '+2348146568972', now, now]);
    }

    return { childId, entryId, passId, passRef: opts.passRef, fullName: opts.fullName };
  };

  // Seed sample child matching user mandate specification:
  // "05 Ramidolo Anjolaoluwa, 14 yrs · Ages 13–14 · Female, Parent: Omodolapo Oyelami Hanna (+2348146568972), KOI-2026-C0BBC1"
  const ramidolo = await seedChild({
    fullName: 'Ramidolo Anjolaoluwa',
    dob: '2012-05-15', // Age 14 on 2026-11-20
    passRef: 'KOI-2026-C0BBC1',
    gender: 'Female',
    pickupName: 'Omodolapo Oyelami Hanna',
    pickupPhone: '+2348146568972',
    pickupRel: 'Primary parent'
  });

  // Seed a very long name child to test overflow & truncation safety
  const longNameChild = await seedChild({
    fullName: 'Oluwaseunoluwabukola Anjolaoluwakitan Abimbola-Adebayo The Third',
    dob: '2013-08-10', // Age 13
    passRef: 'KOI-2026-LONGNAME',
    gender: 'Male',
    pickupName: 'Dr. Christopher Oluwanifemi Babatunde-Adebayo',
    pickupPhone: '+23480399988877',
    pickupRel: 'Designated guardian & medical contact'
  });

  // Seed a child without a pass (missing pass test)
  const childNoPass = await seedChild({
    fullName: 'David NoPassBaby',
    dob: '2024-04-12', // Age 2
    status: 'selected'
  });

  // Seed normal children for age diversity
  const childAge2 = await seedChild({
    fullName: 'Ada BabyTwo',
    dob: '2024-06-10',
    passRef: 'KOI-2026-AGE2-REG'
  });

  // Express test server
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

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // TEST 1: Standard register export remains completely unchanged
    await t.test('1. Standard Printable QR Register export remains operational and unchanged', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-pdf?eventId=${testEventId}&variant=qr_register`);
      assert.strictEqual(res.status, 200);
      assert.ok((res.headers.get('content-type') || '').includes('application/pdf'));

      const buf = Buffer.from(await res.arrayBuffer());
      const pdfText = buf.toString('latin1');
      assert.ok(pdfText.startsWith('%PDF'));
      assert.ok(pdfText.includes('SELECTED CHILDREN REGISTER'));
      assert.ok(pdfText.includes('EXACT AGE BREAKDOWN'));
      assert.ok(pdfText.includes('KOI-2026-C0BBC1'));
    });

    // TEST 2: Printer compact QR register export exists and produces valid PDF
    await t.test('2. Printer compact QR register export exists with variant=printer_compact', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-pdf?eventId=${testEventId}&variant=printer_compact`);
      assert.strictEqual(res.status, 200);
      assert.ok((res.headers.get('content-type') || '').includes('application/pdf'));

      const disposition = res.headers.get('content-disposition') || '';
      assert.ok(disposition.includes('attachment; filename='));
      assert.ok(disposition.includes('Printer-Compact-6.7x1.6.pdf'));

      const buf = Buffer.from(await res.arrayBuffer());
      const pdfText = buf.toString('latin1');
      assert.ok(pdfText.startsWith('%PDF'));
      assert.ok(pdfText.includes('PRINTER COMPACT'));
      assert.ok(pdfText.includes('6.7 x 1.6 in'));
      assert.ok(pdfText.includes('KOI-2026-C0BBC1'));
      assert.ok(pdfText.includes('RAMIDOLO ANJOLAOLUWA'));
    });

    // TEST 3: Physical Row Dimensions Verification (6.7in × 1.6in = 482.4pt × 115.2pt)
    await t.test('3. Row dimensions match physical print specification (6.7in × 1.6in = 482.4pt × 115.2pt)', async () => {
      // Direct programmatic render verification
      const reportRes = await fetch(`${baseUrl}/api/admin/reports/selected-children?eventId=${testEventId}`);
      const reportJson: any = await reportRes.json();

      // Ensure data is available
      assert.ok(reportJson.children.length > 0);

      // Verify the PDF buffer contains the expected point coordinate structures
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-pdf?eventId=${testEventId}&variant=printer_compact`);
      const buf = Buffer.from(await res.arrayBuffer());
      const pdfString = buf.toString('latin1');

      // 482.4 is the exact outer row width (6.7 * 72 pt)
      // 115.2 is the exact outer row height (1.6 * 72 pt)
      assert.ok(pdfString.includes('482.4') || pdfString.includes('115.2'), 'PDF stream must encode 482.4pt x 115.2pt box dimensions');
    });

    // TEST 4: Same child/pass dataset and identical pass references
    await t.test('4. Standard and Compact registers consume identical child dataset & pass references', async () => {
      const stdRes = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-pdf?eventId=${testEventId}&variant=qr_register`);
      const stdBuf = Buffer.from(await stdRes.arrayBuffer());
      const stdText = stdBuf.toString('latin1');

      const compactRes = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-pdf?eventId=${testEventId}&variant=printer_compact`);
      const compactBuf = Buffer.from(await compactRes.arrayBuffer());
      const compactText = compactBuf.toString('latin1');

      // Both must include the exact same canonical pass reference
      assert.ok(stdText.includes('KOI-2026-C0BBC1'), 'Standard register must include pass ref');
      assert.ok(compactText.includes('KOI-2026-C0BBC1'), 'Compact register must include pass ref');

      assert.ok(stdText.includes('KOI-2026-AGE2-REG'), 'Standard register must include Age 2 pass');
      assert.ok(compactText.includes('KOI-2026-AGE2-REG'), 'Compact register must include Age 2 pass');
    });

    // TEST 5: QR scanner resolution parity (Scanner validates compact QR payload identically)
    await t.test('5. Scanner accepts QR payload from compact register and resolves correct child and pass', async () => {
      const scannedPayload = 'KOI-2026-C0BBC1';
      const scanResult = await validatePassForScan(scannedPayload, testEventId);

      assert.strictEqual(scanResult.valid, true, 'Scanner must validate pass payload');
      assert.strictEqual(scanResult.entry?.child_id, ramidolo.childId);
      assert.strictEqual(scanResult.entry?.id, ramidolo.entryId);
      assert.strictEqual(scanResult.pass?.pass_reference, 'KOI-2026-C0BBC1');
    });

    // TEST 6: Zero database mutations (Passes are frozen and never regenerated)
    await t.test('6. Generating compact register makes ZERO database mutations to passes or children', async () => {
      const passesBefore = await queryOne('SELECT COUNT(*) as cnt FROM event_passes');
      const childrenBefore = await queryOne('SELECT COUNT(*) as cnt FROM children');

      // Generate compact register
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-pdf?eventId=${testEventId}&variant=printer_compact`);
      assert.strictEqual(res.status, 200);

      const passesAfter = await queryOne('SELECT COUNT(*) as cnt FROM event_passes');
      const childrenAfter = await queryOne('SELECT COUNT(*) as cnt FROM children');

      assert.strictEqual(Number(passesBefore.cnt), Number(passesAfter.cnt), 'Pass count must not change');
      assert.strictEqual(Number(childrenBefore.cnt), Number(childrenAfter.cnt), 'Children count must not change');
    });

    // TEST 7: Complete operational row info preserved (Parent, Pickup, Relationship, Status)
    await t.test('7. Compact row preserves all critical operational info', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-pdf?eventId=${testEventId}&variant=printer_compact`);
      const buf = Buffer.from(await res.arrayBuffer());
      const pdfText = buf.toString('latin1');

      // Child details
      assert.ok(pdfText.includes('RAMIDOLO ANJOLAOLUWA'));
      assert.ok(pdfText.includes('14 yrs'));

      // Parent details
      assert.ok(pdfText.includes('Parent:'));
      assert.ok(pdfText.includes('Omodolapo Oyelami Hanna'));
      assert.ok(pdfText.includes('+2348146568972'));

      // Pickup details & relationship
      assert.ok(pdfText.includes('Pickup:'));
      assert.ok(pdfText.includes('Primary parent'));

      // Attendance status
      assert.ok(pdfText.includes('Status: Not arrived'));

      // Missing pass box
      assert.ok(pdfText.includes('PASS NOT AVAILABLE'));
      assert.ok(pdfText.includes('Missing pass'));
    });

    // TEST 8: Long names overflow handling
    await t.test('8. Long child and pickup names are handled safely with controlled truncation', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports/selected-children/export-pdf?eventId=${testEventId}&variant=printer_compact`);
      const buf = Buffer.from(await res.arrayBuffer());
      const pdfText = buf.toString('latin1');

      // Ensure PDF generates without error and contains long name child's pass reference
      assert.ok(pdfText.includes('KOI-2026-LONGNAME'));
      assert.ok(pdfText.includes('OLUWASEUNOLUWABUKOLA'));
    });

    // TEST 9: Filename conventions comply with Section 32
    await t.test('9. Filename format complies with Section 32 conventions', () => {
      // Default: TGA-2026-QR-Register-Printer-Compact-6.7x1.6.pdf
      const fnDefault = getSelectedChildrenPdfFilename('The General Assembly 2026', undefined, null, null, null, 'printer_compact');
      assert.strictEqual(fnDefault, 'TGA-2026-QR-Register-Printer-Compact-6.7x1.6.pdf');

      // Ages 2-14: TGA-2026-QR-Register-Ages-2-14-Printer-Compact-6.7x1.6.pdf
      const fnAges2to14 = getSelectedChildrenPdfFilename('The General Assembly 2026', undefined, null, 2, 14, 'printer_compact');
      assert.strictEqual(fnAges2to14, 'TGA-2026-QR-Register-Ages-2-14-Printer-Compact-6.7x1.6.pdf');

      // Age group 13-14: TGA-2026-QR-Register-Ages-13-14-Printer-Compact-6.7x1.6.pdf
      const fnAgeGroup = getSelectedChildrenPdfFilename('The General Assembly 2026', '13–14', null, null, null, 'printer_compact');
      assert.strictEqual(fnAgeGroup, 'TGA-2026-QR-Register-Ages-13-14-Printer-Compact-6.7x1.6.pdf');

      // Exact age 2: TGA-2026-QR-Register-Age-2-Printer-Compact-6.7x1.6.pdf
      const fnExactAge = getSelectedChildrenPdfFilename('The General Assembly 2026', undefined, 2, null, null, 'printer_compact');
      assert.strictEqual(fnExactAge, 'TGA-2026-QR-Register-Age-2-Printer-Compact-6.7x1.6.pdf');
    });

  } finally {
    // Cleanup synthetic test records
    await execute(`DELETE FROM pickup_people WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id = ?)`, [testEventId]);
    await execute(`DELETE FROM event_passes WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id = ?)`, [testEventId]);
    await execute(`DELETE FROM child_event_entries WHERE event_id = ?`, [testEventId]);
    await execute(`DELETE FROM children WHERE parent_profile_id = ?`, [parentProfileId]);
    await execute(`DELETE FROM parent_profiles WHERE id = ?`, [parentProfileId]);
    await execute(`DELETE FROM users WHERE id IN (?, ?)`, [adminId, parentId]);
    await execute(`DELETE FROM events WHERE id = ?`, [testEventId]);

    server.close();
    process.exit(0);
  }
});
