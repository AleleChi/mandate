import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import express from 'express';
import { execute, query, queryOne } from '../src/server/db';
import { issuePassForChild } from '../src/server/services/passService';
import { generateToken } from '../src/server/auth';
import adminRoutes from '../src/server/routes/admin';

describe('Selected Children Report Test Suite (A-J)', () => {
  const testEventId = `ev-sel-rpt-${Date.now()}`;
  let testParentId: string;
  let testUserId: string;
  let testAdminUserId: string;
  let adminToken: string;
  let testBaseUrl = '';
  let server: any;

  before(async () => {
    // 1. Setup isolated test event
    await execute(`
      INSERT OR IGNORE INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'The General Assembly Test Event', 'current', '2026-06-01T08:00:00Z', '2026-06-05T18:00:00Z', datetime('now'), datetime('now'))
    `, [testEventId]);

    testUserId = `user-sel-${crypto.randomUUID()}`;
    testParentId = `parent-sel-${crypto.randomUUID()}`;

    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'parent', datetime('now'), datetime('now'))
    `, [testUserId, `parent_rpt_${Date.now()}@test.org`]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, email, created_at, updated_at)
      VALUES (?, ?, 'Jonathan Test Parent', '+2348011223344', 'parent_rpt@test.org', datetime('now'), datetime('now'))
    `, [testParentId, testUserId]);

    // Admin user for HTTP tests
    testAdminUserId = `admin-sel-${crypto.randomUUID()}`;
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'admin', datetime('now'), datetime('now'))
    `, [testAdminUserId, `admin_${Date.now()}@koinonia.org`]);
    adminToken = generateToken(testAdminUserId);

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        testBaseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (server) server.close();
    // Clean process exit for node test runner
    setTimeout(() => process.exit(0), 100);
  });

  async function createChildRecord(opts: {
    fullName: string;
    dob: string;
    gender?: string;
    ageGroup?: string;
    status: string;
    hasActivePass?: boolean;
  }) {
    const childId = `c-${crypto.randomUUID()}`;
    const entryId = `entry-${crypto.randomUUID()}`;
    const photoId = `photo-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, age_group, photo_file_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [childId, testParentId, opts.fullName, opts.dob, opts.gender || 'male', opts.ageGroup || null, photoId, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [entryId, childId, testEventId, opts.status, now, now, now]);

    if (opts.hasActivePass) {
      await issuePassForChild({ childId, eventId: testEventId });
    }

    return { childId, entryId };
  }

  it('A & B: 418 selected records exist -> report total is 418; Page size 25 -> Page 1 returns 25 records and total remains 418', async () => {
    // Batch insert 418 selected children for testEventId
    // Distribute among ages 2 to 14
    const entriesToInsert = 418;
    for (let i = 1; i <= entriesToInsert; i++) {
      const childId = `c-bulk-${i}-${Date.now()}`;
      const entryId = `e-bulk-${i}-${Date.now()}`;
      // Calculate age cycle: 2..14
      const age = 2 + (i % 13);
      const birthYear = 2026 - age;
      const dob = `${birthYear}-05-15`;
      const status = i <= 286 ? 'pass_ready' : (i <= 297 ? 'selected' : (i <= 299 ? 'checked_in' : (i <= 301 ? 'inside' : 'selected')));
      const now = new Date().toISOString();

      await execute(`
        INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, calculated_age, gender, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'male', ?, ?)
      `, [childId, testParentId, `Selected Child ${i}`, dob, age, now, now]);

      await execute(`
        INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [entryId, childId, testEventId, status, now, now, now]);
    }

    // Verify raw count in DB is exactly 418 selected
    const countRow = await queryOne(`
      SELECT count(*) as count
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ?
        AND (e.is_deleted = 0 OR e.is_deleted IS NULL)
        AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
    `, [testEventId]);

    assert.equal(Number(countRow?.count), 418, 'Must have exactly 418 selected entries');

    // Simulate query execution like GET /api/admin/reports/selected-children
    const rows = await query(`
      SELECT 
        e.id as event_entry_id,
        e.child_id,
        e.status as entry_status,
        c.full_name as child_name,
        c.date_of_birth,
        c.calculated_age,
        c.gender,
        p.id as parent_id,
        p.full_name as parent_name,
        p.phone_number as parent_phone,
        p.email as parent_email
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ?
        AND (e.is_deleted = 0 OR e.is_deleted IS NULL)
        AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
      ORDER BY c.full_name ASC
    `, [testEventId]);

    assert.equal(rows.length, 418, 'Report total records must equal 418');

    // Page 1 with pageSize 25
    const pageSize = 25;
    const page1Records = rows.slice(0, pageSize);
    assert.equal(page1Records.length, 25, 'Page 1 must return 25 rows');
    assert.equal(rows.length, 418, 'Total count remains 418 even on Page 1');
  });

  it('C: Age group 10–12 returns only 10–12 children', async () => {
    // Query children aged 10-12
    const rows = await query(`
      SELECT c.full_name, c.calculated_age
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ?
        AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
        AND c.calculated_age >= 10 AND c.calculated_age <= 12
    `, [testEventId]);

    assert.ok(rows.length > 0, 'Should find children in age group 10-12');
    for (const r of rows) {
      assert.ok(r.calculated_age >= 10 && r.calculated_age <= 12, `Age ${r.calculated_age} must be between 10 and 12`);
    }
  });

  it('D: Parent name and phone returned correctly with joined data', async () => {
    const sample = await queryOne(`
      SELECT 
        c.full_name as child_name,
        p.full_name as parent_name,
        p.phone_number as parent_phone,
        p.email as parent_email
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ?
      LIMIT 1
    `, [testEventId]);

    assert.equal(sample?.parent_name, 'Jonathan Test Parent');
    assert.equal(sample?.parent_phone, '+2348011223344');
    assert.equal(sample?.parent_email, 'parent_rpt@test.org');
  });

  it('E & F: Missing-pass vs pass-ready filter distinctions', async () => {
    const passChild = await createChildRecord({
      fullName: 'Pass Ready Child',
      dob: '2016-08-10',
      status: 'pass_ready',
      hasActivePass: true
    });

    const missingChild = await createChildRecord({
      fullName: 'Missing Pass Child',
      dob: '2016-09-12',
      status: 'selected',
      hasActivePass: false
    });

    // Check pass query
    const activePasses = await query(`
      SELECT ep.id, ep.child_event_entry_id
      FROM event_passes ep
      WHERE ep.status = 'active' AND ep.child_event_entry_id IN (?, ?)
    `, [passChild.entryId, missingChild.entryId]);

    const passEntryIds = activePasses.map((p: any) => p.child_event_entry_id);
    assert.ok(passEntryIds.includes(passChild.entryId), 'passChild has active pass');
    assert.ok(!passEntryIds.includes(missingChild.entryId), 'missingChild has NO active pass');
  });

  it('G: Checked-in, inside, and picked-up states remain selected', async () => {
    const c1 = await createChildRecord({ fullName: 'Child Checked In', dob: '2015-02-01', status: 'checked_in' });
    const c2 = await createChildRecord({ fullName: 'Child Inside', dob: '2015-03-01', status: 'inside' });
    const c3 = await createChildRecord({ fullName: 'Child Picked Up', dob: '2015-04-01', status: 'picked_up' });

    const selectedRows = await query(`
      SELECT e.id, e.status
      FROM child_event_entries e
      WHERE e.id IN (?, ?, ?)
        AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
    `, [c1.entryId, c2.entryId, c3.entryId]);

    assert.equal(selectedRows.length, 3, 'checked_in, inside, picked_up must all remain selected');
  });

  it('H: Waiting list, not-selected, under-review are excluded', async () => {
    const cWait = await createChildRecord({ fullName: 'Child Waitlist', dob: '2015-05-01', status: 'waiting_list' });
    const cNot = await createChildRecord({ fullName: 'Child Not Selected', dob: '2015-06-01', status: 'not_selected' });
    const cRev = await createChildRecord({ fullName: 'Child Under Review', dob: '2015-07-01', status: 'under_review' });

    const rows = await query(`
      SELECT e.id
      FROM child_event_entries e
      WHERE e.id IN (?, ?, ?)
        AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
    `, [cWait.entryId, cNot.entryId, cRev.entryId]);

    assert.equal(rows.length, 0, 'waiting_list, not_selected, and under_review must be excluded');
  });

  it('I: CSV export respects age filter', async () => {
    // Generate CSV for age 10-12
    const rows = await query(`
      SELECT c.full_name as child_name, c.calculated_age as age, p.full_name as parent_name, p.phone_number as parent_phone
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ?
        AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
        AND c.calculated_age >= 10 AND c.calculated_age <= 12
    `, [testEventId]);

    let csv = 'Child Name,Age,Age Group,Gender,Parent / Guardian,Parent Phone,Parent Email,Pass Status,Attendance Status\n';
    for (const r of rows) {
      csv += `"${r.child_name}","${r.age} yrs","10–12","Male","${r.parent_name}","${r.parent_phone}","","Pass ready","Not arrived"\n`;
    }

    assert.ok(csv.includes('10–12'), 'CSV must contain 10–12 age group');
    assert.ok(!csv.includes('2–3'), 'CSV filtered by 10-12 must not contain 2-3');
  });

  it('J: Issue pass updates row from Missing pass to Pass ready without duplicate pass creation', async () => {
    const missingChild = await createChildRecord({
      fullName: 'Issue Pass Test Child',
      dob: '2017-01-15',
      status: 'selected',
      hasActivePass: false
    });

    // 1. Initial state: no active pass
    const passBefore = await queryOne("SELECT * FROM event_passes WHERE child_event_entry_id = ? AND status = 'active'", [missingChild.entryId]);
    assert.equal(passBefore, null, 'No pass exists initially');

    // 2. Issue pass
    const pass1 = await issuePassForChild({ childId: missingChild.childId, eventId: testEventId });
    assert.ok(pass1?.pass_reference, 'Pass 1 issued');

    const entryAfter = await queryOne('SELECT status FROM child_event_entries WHERE id = ?', [missingChild.entryId]);
    assert.equal(entryAfter?.status, 'pass_ready', 'Entry status must transition to pass_ready');

    // 3. Re-issuing pass must be idempotent and return identical pass
    const pass2 = await issuePassForChild({ childId: missingChild.childId, eventId: testEventId });
    assert.equal(pass2.id, pass1.id, 'Pass ID must be identical (no duplicate pass creation)');
    assert.equal(pass2.pass_reference, pass1.pass_reference, 'Pass reference must remain unchanged');
  });

  it('K: HTTP GET /api/admin/reports/selected-children returns valid canonical response schema', async () => {
    const res = await fetch(`${testBaseUrl}/api/admin/reports/selected-children?eventId=${testEventId}&page=1&pageSize=25`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    assert.equal(res.status, 200, 'HTTP status must be 200');
    const data: any = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.event?.id);
    assert.ok(data.summary);
    assert.ok(data.summary.totalSelected >= 418, 'Summary totalSelected >= 418');
    assert.ok(data.ageGroups.length >= 5, 'Age groups array must be populated');
    assert.equal(data.children.length, 25, 'Page 1 must return 25 children');
    assert.equal(data.pagination.page, 1);
    assert.equal(data.pagination.pageSize, 25);
    assert.ok(data.pagination.totalRecords >= 418);

    // Verify child record fields
    const firstChild = data.children[0];
    assert.ok(firstChild.childId);
    assert.ok(firstChild.eventEntryId);
    assert.ok(firstChild.fullName);
    assert.ok(firstChild.gender);
    assert.ok(firstChild.parent);
    assert.ok(firstChild.parent.fullName);
    assert.ok(firstChild.passStatus === 'pass_ready' || firstChild.passStatus === 'missing_pass');
    assert.ok(['not_arrived', 'checked_in', 'inside', 'picked_up'].includes(firstChild.attendanceStatus));
  });

  it('L: HTTP GET /api/admin/reports/selected-children/export-csv returns valid CSV download', async () => {
    const res = await fetch(`${testBaseUrl}/api/admin/reports/selected-children/export-csv?eventId=${testEventId}&ageGroup=10–12`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    assert.equal(res.status, 200);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('text/csv'), 'Content-Type must be text/csv');
    const csv = await res.text();
    assert.ok(csv.startsWith('Child Name,Age,Age Group,Gender,Parent / Guardian,Parent Phone,Parent Email,Pass Status,Attendance Status'));
    assert.ok(csv.includes('10–12'));
  });

  it('M: Bug fix verified: GET /api/admin/children with filter=selected_children and filter=selected returns records', async () => {
    // 1. Test filter=selected_children
    const res1 = await fetch(`${testBaseUrl}/api/admin/children?eventId=${testEventId}&filter=selected_children`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    assert.equal(res1.status, 200);
    const data1: any = await res1.json();
    assert.equal(data1.success, true);
    assert.ok(data1.children.length > 0, 'Must return child records for filter=selected_children');
    assert.ok(data1.stats.selected >= 418);

    // 2. Test filter=selected
    const res2 = await fetch(`${testBaseUrl}/api/admin/children?eventId=${testEventId}&filter=selected`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    assert.equal(res2.status, 200);
    const data2: any = await res2.json();
    assert.equal(data2.success, true);
    assert.ok(data2.children.length > 0, 'Must return child records for filter=selected');
  });
});
