import assert from 'assert';
import http from 'http';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import adminRoutes from '../src/server/routes/admin';
import volunteerRoutes from '../src/server/routes/volunteer';
import {
  prepareWristband,
  verifyWristband,
  provisionWristband,
  bindWristbandToChild,
  getWristbandInventory,
  getWristbandsForPrint,
  resolveEventChildIdentifier,
  WristbandDomainError
} from '../src/server/services/wristbandService';

async function runTgaPhase4b2WristbandPrintingTests() {
  console.log('================================================================');
  console.log('TGA 2026 — PHASE 4B2 VERIFICATION TEST SUITE');
  console.log('Print Batch + Print Preview Only');
  console.log('================================================================\n');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const nowIso = new Date().toISOString();

  // Setup ephemeral test server
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api/volunteer', volunteerRoutes);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let passedScenarios = 0;

  // Test Event IDs
  const testEvent1Id = `ev-4b2-1-${testRunId}`;
  const testEvent2Id = `ev-4b2-2-${testRunId}`;

  // Test Users
  const adminUserId = `usr-admin-4b2-${testRunId}`;
  const volunteerUserId = `usr-vol-4b2-${testRunId}`;

  const adminToken = generateToken(adminUserId);
  const volunteerToken = generateToken(volunteerUserId);

  // Test Children & Entries
  const child1Id = `ch-4b2-1-${testRunId}`;
  const entry1Id = `ent-4b2-1-${testRunId}`;
  const pass1Ref = `KOI-2026-4B2${testRunId.slice(-3)}`;
  const child2Id = `ch-4b2-2-${testRunId}`;
  const entry2Id = `ent-4b2-2-${testRunId}`;
  const pass2Ref = `KOI-2026-4B2B${testRunId.slice(-3)}`;

  try {
    // -------------------------------------------------------------------------
    // SEED TEST DATA
    // -------------------------------------------------------------------------
    // Demote prior current events
    await execute("UPDATE events SET status = 'archived' WHERE status = 'current'");

    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'TGA 2026 Annual Conference', 'current', ?, ?, ?, ?)
    `, [testEvent1Id, nowIso, nowIso, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'TGA 2026 Other Event', 'open', ?, ?, ?, ?)
    `, [testEvent2Id, nowIso, nowIso, nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES
        (?, ?, 'hashed_pw', 'admin', 'active', ?, ?),
        (?, ?, 'hashed_pw', 'volunteer', 'active', ?, ?)
    `, [adminUserId, `admin-4b2-${testRunId}@tga-test.org`, nowIso, nowIso, volunteerUserId, `volunteer-4b2-${testRunId}@tga-test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Volunteer 4B2', '08012345679', '08012345679', 'arrival', 'approved', 0, ?, ?)
    `, [`vp-4b2-${testRunId}`, volunteerUserId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'check_in', 'arrival', 'lead', 'active', ?, ?, ?, ?)
    `, [`eda-4b2-${testRunId}`, testEvent1Id, volunteerUserId, nowIso, nowIso, nowIso, nowIso]);

    const parentProfileId = `pp-4b2-${testRunId}`;
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Grace Parent', '08012345678', ?, ?)
    `, [parentProfileId, adminUserId, nowIso, nowIso]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'David Testchild', 'male', '2018-05-15', 8, 'Ages 6 to 8', ?, ?)
    `, [child1Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [entry1Id, child1Id, testEvent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, 'hash-4b2-1', 'active', ?, ?, ?)
    `, [`pass-4b2-1-${testRunId}`, entry1Id, pass1Ref, nowIso, nowIso, nowIso]);

    const adminActor = { id: adminUserId, role: 'admin', email: `admin-4b2-${testRunId}@example.com` };

    // -------------------------------------------------------------------------
    // PREPARE TEST WRISTBANDS IN EVENT 1
    // -------------------------------------------------------------------------
    // 5 prepared wristbands
    const prep1 = await prepareWristband({ eventId: testEvent1Id, nfcUid: `044B2001${testRunId}`, actor: adminActor });
    const prep2 = await prepareWristband({ eventId: testEvent1Id, nfcUid: `044B2002${testRunId}`, actor: adminActor });
    const prep3 = await prepareWristband({ eventId: testEvent1Id, nfcUid: `044B2003${testRunId}`, actor: adminActor });
    const prep4 = await prepareWristband({ eventId: testEvent1Id, nfcUid: `044B2004${testRunId}`, actor: adminActor });
    const prep5 = await prepareWristband({ eventId: testEvent1Id, nfcUid: `044B2005${testRunId}`, actor: adminActor });

    // 1 prepared wristband in Event 2 (for event isolation check)
    const prepEv2 = await prepareWristband({ eventId: testEvent2Id, nfcUid: `044B2EE2${testRunId}`, actor: adminActor });

    // 1 available band in Event 1 (directly provisioned as available)
    const avail1 = await provisionWristband({ eventId: testEvent1Id, nfcUid: `044B2AA1${testRunId}`, actor: adminActor });

    // 1 active (assigned) band in Event 1
    const activeProvision = await provisionWristband({ eventId: testEvent1Id, nfcUid: `044B2AC1${testRunId}`, actor: adminActor });
    await bindWristbandToChild({
      eventId: testEvent1Id,
      childEventEntryId: entry1Id,
      wristbandId: activeProvision.id,
      actor: adminActor
    });

    // 1 lost band in Event 1
    const lostProvision = await provisionWristband({ eventId: testEvent1Id, nfcUid: `044B2105${testRunId}`, actor: adminActor });
    await execute("UPDATE wristbands SET status = 'lost' WHERE id = ?", [lostProvision.id]);

    // 1 damaged band in Event 1
    const damagedProvision = await provisionWristband({ eventId: testEvent1Id, nfcUid: `044B2DA1${testRunId}`, actor: adminActor });
    await execute("UPDATE wristbands SET status = 'damaged' WHERE id = ?", [damagedProvision.id]);

    // 1 decommissioned band in Event 1
    const decommProvision = await provisionWristband({ eventId: testEvent1Id, nfcUid: `044B2DC1${testRunId}`, actor: adminActor });
    await execute("UPDATE wristbands SET status = 'decommissioned' WHERE id = ?", [decommProvision.id]);

    // Helper for HTTP requests
    async function apiRequest(path: string, options: { method?: string; body?: any; token?: string } = {}) {
      const res = await fetch(`${baseUrl}${path}`, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      const data = await res.json();
      return { status: res.status, data };
    }

    // =========================================================================
    // 1. Prepared wristbands selectable
    // =========================================================================
    {
      const res = await apiRequest(`/api/admin/events/${testEvent1Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: {
          ids: [prep1.wristband.id, prep2.wristband.id]
        }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.items.length, 2);
      assert.strictEqual(res.data.items[0].id, prep1.wristband.id);
      assert.strictEqual(res.data.items[1].id, prep2.wristband.id);
      passedScenarios++;
      console.log('✓ Scenario 1: Prepared wristbands are selectable by ID');
    }

    // =========================================================================
    // 2. Non-prepared excluded from normal print batch
    // =========================================================================
    {
      // Attempt to include available, active, lost, damaged, decommissioned in normal print batch
      const mixedIds = [
        prep1.wristband.id,
        avail1.id,
        activeProvision.id,
        lostProvision.id,
        damagedProvision.id,
        decommProvision.id
      ];

      const res = await apiRequest(`/api/admin/events/${testEvent1Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: { ids: mixedIds }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      // ONLY the prepared band (prep1) must be included! All non-prepared must be excluded.
      assert.strictEqual(res.data.items.length, 1);
      assert.strictEqual(res.data.items[0].id, prep1.wristband.id);
      assert.strictEqual(res.data.items[0].status, 'prepared');
      passedScenarios++;
      console.log('✓ Scenario 2: Non-prepared wristbands strictly excluded from normal print batch');
    }

    // =========================================================================
    // 3. Select page works
    // =========================================================================
    {
      const pageIds = [prep2.wristband.id, prep3.wristband.id, prep4.wristband.id];
      const res = await apiRequest(`/api/admin/events/${testEvent1Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: { ids: pageIds }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.items.length, 3);
      const returnedIds = res.data.items.map((i: any) => i.id);
      assert.deepStrictEqual(returnedIds.sort(), pageIds.sort());
      passedScenarios++;
      console.log('✓ Scenario 3: Page selection returns exactly page prepared items');
    }

    // =========================================================================
    // 4. Prepared range selection works
    // =========================================================================
    {
      const res = await apiRequest(`/api/admin/events/${testEvent1Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: {
          rangeStart: prep1.wristband.wristband_code,
          rangeEnd: prep3.wristband.wristband_code
        }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.items.length, 3);
      assert.strictEqual(res.data.firstCode, prep1.wristband.wristband_code);
      assert.strictEqual(res.data.lastCode, prep3.wristband.wristband_code);
      passedScenarios++;
      console.log('✓ Scenario 4: Prepared range selection works seamlessly');
    }

    // =========================================================================
    // 5. Event isolation enforced
    // =========================================================================
    {
      // Requesting Event 2 items while querying Event 1 returns empty or only Event 1 items
      const res = await apiRequest(`/api/admin/events/${testEvent1Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: { ids: [prepEv2.wristband.id] }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.items.length, 0);

      // Querying all prepared in Event 2 returns only Event 2's prepared band
      const resEv2 = await apiRequest(`/api/admin/events/${testEvent2Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: {}
      });
      assert.strictEqual(resEv2.status, 200);
      assert.strictEqual(resEv2.data.items.length, 1);
      assert.strictEqual(resEv2.data.items[0].id, prepEv2.wristband.id);
      passedScenarios++;
      console.log('✓ Scenario 5: Event isolation strictly enforced across print batches');
    }

    // =========================================================================
    // 6. Print preview contains correct count
    // =========================================================================
    {
      const res = await apiRequest(`/api/admin/events/${testEvent1Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: {} // all prepared in event 1
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.totalCount, 5);
      assert.strictEqual(res.data.items.length, 5);
      assert.strictEqual(res.data.firstCode, prep1.wristband.wristband_code);
      assert.strictEqual(res.data.lastCode, prep5.wristband.wristband_code);
      passedScenarios++;
      console.log('✓ Scenario 6: Print preview metadata contains exact batch count and boundaries');
    }

    // =========================================================================
    // 7. WB code appears in label
    // =========================================================================
    {
      const res = await apiRequest(`/api/admin/events/${testEvent1Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: { ids: [prep1.wristband.id] }
      });
      assert.strictEqual(res.status, 200);
      const item = res.data.items[0];
      assert.strictEqual(item.wristbandCode, prep1.wristband.wristband_code);
      assert.match(item.wristbandCode, /^WB-\d{6}$/);
      passedScenarios++;
      console.log('✓ Scenario 7: Standard WB code prominently formatted in printable item');
    }

    // =========================================================================
    // 8. QR payload equals WB code exactly
    // =========================================================================
    {
      const res = await apiRequest(`/api/admin/events/${testEvent1Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: { ids: [prep1.wristband.id] }
      });
      assert.strictEqual(res.status, 200);
      const item = res.data.items[0];
      assert.strictEqual(item.qrValue, prep1.wristband.wristband_code);
      assert.strictEqual(item.qrValue, item.wristbandCode);
      assert.doesNotMatch(item.qrValue, /^https?:\/\//);
      passedScenarios++;
      console.log('✓ Scenario 8: QR payload strictly equals human WB code without wrapping');
    }

    // =========================================================================
    // 9. No child PII in printable output
    // =========================================================================
    {
      const res = await apiRequest(`/api/admin/events/${testEvent1Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: {}
      });
      assert.strictEqual(res.status, 200);
      for (const item of res.data.items) {
        assert.strictEqual((item as any).childId, undefined);
        assert.strictEqual((item as any).childName, undefined);
        assert.strictEqual((item as any).parentName, undefined);
        assert.strictEqual((item as any).phone, undefined);
        assert.strictEqual((item as any).dob, undefined);
        assert.strictEqual((item as any).medical, undefined);
        assert.strictEqual((item as any).guardian, undefined);
      }
      passedScenarios++;
      console.log('✓ Scenario 9: Strictly zero child or parent PII in printable payload');
    }

    // =========================================================================
    // 10. No NFC UID printed
    // =========================================================================
    {
      const res = await apiRequest(`/api/admin/events/${testEvent1Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: {}
      });
      assert.strictEqual(res.status, 200);
      for (const item of res.data.items) {
        assert.strictEqual((item as any).nfcUid, undefined);
        assert.strictEqual((item as any).nfc_uid, undefined);
      }
      passedScenarios++;
      console.log('✓ Scenario 10: Physical hardware NFC UID is never exposed in printable item');
    }

    // =========================================================================
    // 11. No authentication token printed
    // =========================================================================
    {
      const res = await apiRequest(`/api/admin/events/${testEvent1Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: {}
      });
      assert.strictEqual(res.status, 200);
      for (const item of res.data.items) {
        assert.strictEqual((item as any).token, undefined);
        assert.strictEqual((item as any).jwt, undefined);
        assert.strictEqual((item as any).auth, undefined);
      }
      passedScenarios++;
      console.log('✓ Scenario 11: No security tokens or session identifiers in print payload');
    }

    // =========================================================================
    // 12. Print action does not change status
    // =========================================================================
    {
      const beforeRow = await queryOne<{ status: string }>(
        'SELECT status FROM wristbands WHERE id = ?',
        [prep1.wristband.id]
      );
      assert.strictEqual(beforeRow?.status, 'prepared');

      // Generate print batch
      await apiRequest(`/api/admin/events/${testEvent1Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: { ids: [prep1.wristband.id] }
      });

      const afterRow = await queryOne<{ status: string }>(
        'SELECT status FROM wristbands WHERE id = ?',
        [prep1.wristband.id]
      );
      assert.strictEqual(afterRow?.status, 'prepared');
      passedScenarios++;
      console.log('✓ Scenario 12: Generating print batch does NOT modify wristband status');
    }

    // =========================================================================
    // 13. Prepared remains prepared after print
    // =========================================================================
    {
      const allRows = await query<{ id: string; status: string }>(
        "SELECT id, status FROM wristbands WHERE event_id = ? AND status = 'prepared'",
        [testEvent1Id]
      );
      assert.strictEqual(allRows.length, 5);
      for (const r of allRows) {
        assert.strictEqual(r.status, 'prepared');
      }
      passedScenarios++;
      console.log('✓ Scenario 13: All prepared wristbands remain prepared after print batch');
    }

    // =========================================================================
    // 14. Reprint creates no new wristband
    // =========================================================================
    {
      const countBefore = await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM wristbands WHERE event_id = ?',
        [testEvent1Id]
      );

      // Reprint single prepared wristband
      const reprintRes = await apiRequest(`/api/admin/events/${testEvent1Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: {
          ids: [prep1.wristband.id],
          isReprint: true
        }
      });
      assert.strictEqual(reprintRes.status, 200);
      assert.strictEqual(reprintRes.data.items.length, 1);
      assert.strictEqual(reprintRes.data.items[0].wristbandCode, prep1.wristband.wristband_code);

      const countAfter = await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM wristbands WHERE event_id = ?',
        [testEvent1Id]
      );
      assert.strictEqual(countAfter?.count, countBefore?.count);
      passedScenarios++;
      console.log('✓ Scenario 14: Reprint preserves existing record and creates NO duplicates');
    }

    // =========================================================================
    // 15. Deterministic print order
    // =========================================================================
    {
      const res = await apiRequest(`/api/admin/events/${testEvent1Id}/wristbands/print-batch`, {
        method: 'POST',
        token: adminToken,
        body: {}
      });
      assert.strictEqual(res.status, 200);
      const codes = res.data.items.map((i: any) => i.wristbandCode);
      const sortedCodes = [...codes].sort();
      assert.deepStrictEqual(codes, sortedCodes);

      // Check sequence index ordering
      for (let i = 0; i < res.data.items.length; i++) {
        assert.strictEqual(res.data.items[i].sequenceIndex, i + 1);
        assert.strictEqual(res.data.items[i].totalInBatch, res.data.items.length);
      }
      passedScenarios++;
      console.log('✓ Scenario 15: Deterministic physical sequence order (1 of N) strictly preserved');
    }

    // =========================================================================
    // 16. Browser print stylesheet hides Admin chrome
    // =========================================================================
    {
      const cssPath = path.join(process.cwd(), 'src/index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');
      assert.ok(cssContent.includes('@media print'), 'index.css must include @media print');

      const componentPath = path.join(process.cwd(), 'src/components/wristbands/WristbandInventoryWorkspace.tsx');
      const componentContent = fs.readFileSync(componentPath, 'utf8');
      assert.ok(componentContent.includes('@media print'), 'Workspace component must include @media print isolation');
      assert.ok(componentContent.includes('header, nav, aside'), 'Print styles must hide header, nav, aside');
      assert.ok(componentContent.includes('print:hidden'), 'Workspace chrome must use print:hidden');
      passedScenarios++;
      console.log('✓ Scenario 16: Browser print rules strictly hide admin navigation and chrome');
    }

    // =========================================================================
    // 17. Print output stays light in Admin dark mode
    // =========================================================================
    {
      const componentPath = path.join(process.cwd(), 'src/components/wristbands/WristbandInventoryWorkspace.tsx');
      const componentContent = fs.readFileSync(componentPath, 'utf8');
      assert.ok(componentContent.includes('background: #FFFFFF !important') || componentContent.includes('background-color: #FFFFFF !important'));
      assert.ok(componentContent.includes('color: #000000 !important'));
      assert.ok(componentContent.includes('color-scheme: light !important'));
      assert.ok(componentContent.includes('print:bg-white'));
      assert.ok(componentContent.includes('print:text-black'));
      passedScenarios++;
      console.log('✓ Scenario 17: Print output enforces pure light theme even when Admin is in dark mode');
    }

    // =========================================================================
    // 18. Existing physical verification remains unchanged
    // =========================================================================
    {
      const verifyRes = await verifyWristband({
        eventId: testEvent1Id,
        wristbandCode: prep1.wristband.wristband_code,
        nfcUid: prep1.wristband.nfc_uid,
        actor: adminActor
      });
      assert.strictEqual(verifyRes.verified, true);
      assert.strictEqual(verifyRes.status, 'available');
      assert.strictEqual(verifyRes.wristband.status, 'available');
      passedScenarios++;
      console.log('✓ Scenario 18: Physical verification operates identically without disturbance');
    }

    // =========================================================================
    // 19. Verified band can still become available
    // =========================================================================
    {
      const checkRow = await queryOne<{ status: string }>(
        'SELECT status FROM wristbands WHERE id = ?',
        [prep1.wristband.id]
      );
      assert.strictEqual(checkRow?.status, 'available');
      passedScenarios++;
      console.log('✓ Scenario 19: Authoritative transition prepared → available confirmed');
    }

    // =========================================================================
    // 20. Existing assignment remains unchanged
    // =========================================================================
    {
      const parentProfileId = `pp-4b2-${testRunId}`;
      await execute(
        `INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
         VALUES (?, ?, 'Sarah Testchild', 'female', '2019-08-20', 7, 'Ages 6 to 8', ?, ?)`,
        [child2Id, parentProfileId, nowIso, nowIso]
      );

      await execute(`
        INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
        VALUES (?, ?, ?, 'selected', ?, ?)
      `, [entry2Id, child2Id, testEvent1Id, nowIso, nowIso]);

      await execute(`
        INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
        VALUES (?, ?, ?, 'hash-4b2-2', 'active', ?, ?, ?)
      `, [`pass-4b2-2-${testRunId}`, entry2Id, pass2Ref, nowIso, nowIso, nowIso]);

      const bindRes = await bindWristbandToChild({
        eventId: testEvent1Id,
        childEventEntryId: entry2Id,
        wristbandId: prep1.wristband.id,
        actor: adminActor
      });

      assert.strictEqual(bindRes.success, true);
      assert.strictEqual(bindRes.wristband.status, 'active');
      passedScenarios++;
      console.log('✓ Scenario 20: Verified band successfully bound to child without disturbance');
    }

    // =========================================================================
    // 21. Volunteer check-in remains unchanged
    // =========================================================================
    {
      const resolveRes = await resolveEventChildIdentifier(
        testEvent1Id,
        prep1.wristband.wristband_code
      );
      assert.strictEqual(resolveRes.success, true);
      assert.strictEqual(resolveRes.identifierType, 'wristband_code');
      assert.strictEqual(resolveRes.childEventEntryId, entry2Id);
      assert.strictEqual(resolveRes.wristbandCode, prep1.wristband.wristband_code);
      passedScenarios++;
      console.log('✓ Scenario 21: Volunteer desk resolution by wristband code fully operational');
    }

    // Audit Log Check
    const auditLogs = await query<{ action: string; details: string }>(
      "SELECT action, details FROM audit_logs WHERE action = 'WRISTBAND_PRINT_BATCH'",
      []
    );
    assert.ok(auditLogs.length > 0, 'Audit log WRISTBAND_PRINT_BATCH must be recorded');
    const lastAudit = JSON.parse(auditLogs[auditLogs.length - 1].details);
    assert.strictEqual(lastAudit.eventId, testEvent1Id);
    assert.strictEqual(typeof lastAudit.count, 'number');
    assert.strictEqual((lastAudit as any).childName, undefined);
    assert.strictEqual((lastAudit as any).nfcUid, undefined);
    console.log('✓ Audit verification: WRISTBAND_PRINT_BATCH recorded with zero PII and zero NFC UID');

    console.log('\n================================================================');
    console.log(`ALL ${passedScenarios} OF 21 SCENARIOS PASSED SUCCESSFULLY.`);
    console.log('TGA PHASE 4B2: PRINT BATCH + PRINT PREVIEW VALIDATION COMPLETE.');
    console.log('================================================================\n');

  } finally {
    server.close();
  }
}

runTgaPhase4b2WristbandPrintingTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
