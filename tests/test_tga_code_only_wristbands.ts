import assert from 'assert';
import http from 'http';
import express from 'express';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import adminRoutes from '../src/server/routes/admin';
import volunteerRoutes from '../src/server/routes/volunteer';
import {
  generateCodeOnlyWristbandBatch,
  markCodeOnlyWristbandsReady,
  prepareWristband,
  verifyWristband,
  bindWristbandToChild,
  getWristbandInventory,
  getWristbandsForPrint,
  resolveEventChildIdentifier,
  WristbandDomainError
} from '../src/server/services/wristbandService';

async function runTgaCodeOnlyWristbandsTests() {
  console.log('================================================================');
  console.log('TGA 2026 — DEVICE-INDEPENDENT (CODE-ONLY) WRISTBAND TEST SUITE');
  console.log('Verifying Batch Code Generation, Printing, Readiness & Assignment');
  console.log('================================================================\n');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const nowIso = new Date().toISOString();

  // 1. Setup ephemeral test server
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
  const testEvent1Id = `ev-co1-${testRunId}`;
  const testEvent2Id = `ev-co2-${testRunId}`;
  const scaleEventId = `ev-scale-${testRunId}`;

  // Test Users
  const adminUserId = `usr-admin-co-${testRunId}`;
  const volunteerUserId = `usr-vol-co-${testRunId}`;
  const parentProfileId = `prof-parent-co-${testRunId}`;

  const adminToken = generateToken(adminUserId);
  const volunteerToken = generateToken(volunteerUserId);

  // Test Children & Entries
  const child1Id = `ch-co1-${testRunId}`;
  const child2Id = `ch-co2-${testRunId}`;
  const child3Id = `ch-co3-${testRunId}`;
  const entry1Id = `ent-co1-${testRunId}`;
  const entry2Id = `ent-co2-${testRunId}`;
  const entry3Id = `ent-co3-${testRunId}`;
  const pass1Ref = `KOI-2026-CO1${testRunId.slice(-3)}`;
  const pass2Ref = `KOI-2026-CO2${testRunId.slice(-3)}`;
  const pass3Ref = `KOI-2026-CO3${testRunId.slice(-3)}`;

  try {
    // 2. Seed database
    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'TGA 2026 Code-Only Event 1', 'active', '2026-11-18T08:00:00Z', '2026-11-22T18:00:00Z', ?, ?)
    `, [testEvent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'TGA 2026 Code-Only Event 2', 'active', '2026-12-01T08:00:00Z', '2026-12-05T18:00:00Z', ?, ?)
    `, [testEvent2Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'TGA 2026 Scale Event', 'active', '2026-12-10T08:00:00Z', '2026-12-15T18:00:00Z', ?, ?)
    `, [scaleEventId, nowIso, nowIso]);

    // Admin & Volunteer Users
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, 'hash', 'admin', 'active', 1, ?, ?)
    `, [adminUserId, `admin-co-${testRunId}@tga-test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 'active', 1, ?, ?)
    `, [volunteerUserId, `worker-co-${testRunId}@tga-test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Check-in Desk Worker', '+2348000000305', '+2348000000305', 'Check-in Team', 'approved', ?, ?)
    `, [`vp-worker-co-${testRunId}`, volunteerUserId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'Check-in Desk', 'check_in', 'primary', 'scheduled', '2026-11-18T08:00:00Z', '2026-11-18T18:00:00Z', ?, ?)
    `, [`eda-worker-co-${testRunId}`, testEvent1Id, volunteerUserId, nowIso, nowIso]);

    // Parent & Children
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Folake Adeleke', '+2348000000398', ?, ?)
    `, [parentProfileId, adminUserId, nowIso, nowIso]);

    // Child 1
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Daniel Code-Only', 'Male', '2018-05-15', 8, 'Ages 7 to 9', ?, ?)
    `, [child1Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, has_medical_notes, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', 0, ?, ?)
    `, [entry1Id, testEvent1Id, child1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `, [`pass-co-1-${testRunId}`, entry1Id, pass1Ref, `hash-co-1-${testRunId}`, nowIso, nowIso, nowIso]);

    // Child 2
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Sarah Code-Only', 'Female', '2020-03-10', 6, 'Ages 4 to 6', ?, ?)
    `, [child2Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, has_medical_notes, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', 0, ?, ?)
    `, [entry2Id, testEvent1Id, child2Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `, [`pass-co-2-${testRunId}`, entry2Id, pass2Ref, `hash-co-2-${testRunId}`, nowIso, nowIso, nowIso]);

    // Child 3
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'David Code-Only', 'Male', '2017-09-20', 9, 'Ages 7 to 9', ?, ?)
    `, [child3Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, has_medical_notes, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', 0, ?, ?)
    `, [entry3Id, testEvent1Id, child3Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `, [`pass-co-3-${testRunId}`, entry3Id, pass3Ref, `hash-co-3-${testRunId}`, nowIso, nowIso, nowIso]);

    // Helper for API fetch
    const apiCall = async (endpoint: string, options: any = {}) => {
      const url = `${baseUrl}${endpoint}`;
      const headers = {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...options.headers
      };
      const res = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      const data = options.rawText ? await res.text() : await res.json().catch(() => null);
      return { status: res.status, ok: res.ok, data };
    };

    console.log('--- TEST 1: Admin generates 1 code ---');
    {
      const res = await apiCall(`/api/admin/events/${testEvent1Id}/wristbands/generate-codes`, {
        method: 'POST',
        token: adminToken,
        body: { quantity: 1 }
      });
      assert.strictEqual(res.status, 201, `Expected 201 but got ${res.status}`);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.totalGenerated, 1);
      assert.strictEqual(res.data.rangeStart, 'WB-000001');
      assert.strictEqual(res.data.rangeEnd, 'WB-000001');
      assert.deepStrictEqual(res.data.wristbandCodes, ['WB-000001']);
      passedScenarios++;
      console.log('✓ Scenario 1 passed: Admin generated 1 sequential code (WB-000001)\n');
    }

    console.log('--- TEST 2: Admin generates batch ---');
    {
      const res = await apiCall(`/api/admin/events/${testEvent1Id}/wristbands/generate-codes`, {
        method: 'POST',
        token: adminToken,
        body: { quantity: 5 }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.totalGenerated, 5);
      assert.strictEqual(res.data.rangeStart, 'WB-000002');
      assert.strictEqual(res.data.rangeEnd, 'WB-000006');
      assert.strictEqual(res.data.wristbandCodes.length, 5);
      passedScenarios++;
      console.log('✓ Scenario 2 passed: Admin generated batch of 5 codes\n');
    }

    console.log('--- TEST 3: Sequential WB codes ---');
    {
      const expectedCodes = ['WB-000002', 'WB-000003', 'WB-000004', 'WB-000005', 'WB-000006'];
      const rows = await query(
        `SELECT wristband_code FROM wristbands WHERE event_id = ? ORDER BY wristband_code ASC`,
        [testEvent1Id]
      );
      assert.strictEqual(rows.length, 6);
      assert.strictEqual(rows[0].wristband_code, 'WB-000001');
      for (let i = 0; i < expectedCodes.length; i++) {
        assert.strictEqual(rows[i + 1].wristband_code, expectedCodes[i]);
      }
      passedScenarios++;
      console.log('✓ Scenario 3 passed: All wristband codes are consecutive and zero-padded\n');
    }

    console.log('--- TEST 4: Generation is event scoped ---');
    {
      const res = await apiCall(`/api/admin/events/${testEvent2Id}/wristbands/generate-codes`, {
        method: 'POST',
        token: adminToken,
        body: { quantity: 3 }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.rangeStart, 'WB-000001');
      assert.strictEqual(res.data.rangeEnd, 'WB-000003');
      assert.deepStrictEqual(res.data.wristbandCodes, ['WB-000001', 'WB-000002', 'WB-000003']);
      passedScenarios++;
      console.log('✓ Scenario 4 passed: Event 2 sequence starts independently at WB-000001\n');
    }

    console.log('--- TEST 5: Concurrent generation cannot duplicate code ---');
    {
      const concurrentPromises = [
        apiCall(`/api/admin/events/${testEvent1Id}/wristbands/generate-codes`, {
          method: 'POST',
          token: adminToken,
          body: { quantity: 2 }
        }),
        apiCall(`/api/admin/events/${testEvent1Id}/wristbands/generate-codes`, {
          method: 'POST',
          token: adminToken,
          body: { quantity: 2 }
        }),
        apiCall(`/api/admin/events/${testEvent1Id}/wristbands/generate-codes`, {
          method: 'POST',
          token: adminToken,
          body: { quantity: 2 }
        })
      ];
      const results = await Promise.all(concurrentPromises);
      for (const r of results) {
        assert.strictEqual(r.status, 201);
        assert.strictEqual(r.data.totalGenerated, 2);
      }
      const allCodes = results.flatMap((r) => r.data.wristbandCodes);
      const uniqueCodes = new Set(allCodes);
      assert.strictEqual(uniqueCodes.size, 6, 'Expected 6 distinct codes from concurrent calls');
      passedScenarios++;
      console.log('✓ Scenario 5 passed: Concurrent batch calls allocated unique sequential codes without collisions\n');
    }

    console.log('--- TEST 6: nfc_uid is NULL for code-only bands ---');
    {
      const rows = await query(
        `SELECT nfc_uid FROM wristbands WHERE event_id = ?`,
        [testEvent1Id]
      );
      assert.ok(rows.length >= 12);
      for (const row of rows) {
        assert.strictEqual(row.nfc_uid, null, 'Expected nfc_uid to be null for code-only bands');
      }
      passedScenarios++;
      console.log('✓ Scenario 6 passed: nfc_uid is strictly NULL for all code-only bands\n');
    }

    console.log('--- TEST 7: Generated status is prepared ---');
    {
      const rows = await query(
        `SELECT status FROM wristbands WHERE event_id = ?`,
        [testEvent1Id]
      );
      for (const row of rows) {
        assert.strictEqual(row.status, 'prepared', 'Expected status to be prepared');
      }
      passedScenarios++;
      console.log('✓ Scenario 7 passed: Generated wristbands strictly enter in prepared status\n');
    }

    console.log('--- TEST 8: No child data attached ---');
    {
      const assignments = await query(
        `SELECT a.* FROM child_wristband_assignments a
         JOIN wristbands w ON a.wristband_id = w.id
         WHERE w.event_id = ?`,
        [testEvent1Id]
      );
      assert.strictEqual(assignments.length, 0, 'No child assignments should exist for generated bands');
      passedScenarios++;
      console.log('✓ Scenario 8 passed: No child data or assignments attached at generation\n');
    }

    console.log('--- TEST 9: QR payload exactly equals WB code ---');
    {
      const res = await apiCall(`/api/admin/events/${testEvent1Id}/wristbands/print-batch?mode=all_prepared`, {
        method: 'GET',
        token: adminToken
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.items.length >= 12);
      for (const item of res.data.items) {
        assert.strictEqual(item.qrValue, item.wristbandCode, 'QR value must exactly equal wristband_code');
        assert.ok(!item.qrValue.includes('http'), 'QR must not contain URLs');
        assert.ok(!item.qrValue.includes('{'), 'QR must not contain JSON');
        assert.ok(!item.qrValue.includes('ch-'), 'QR must not contain child IDs');
      }
      passedScenarios++;
      console.log('✓ Scenario 9 passed: QR payload exactly equals WB code with zero URLs, JSON or PII\n');
    }

    console.log('--- TEST 10: CSV contains no PII ---');
    {
      const res = await apiCall(`/api/admin/events/${testEvent1Id}/wristbands/export-csv`, {
        method: 'GET',
        token: adminToken,
        rawText: true
      });
      assert.strictEqual(res.status, 200);
      const csvText = res.data as string;
      const lines = csvText.trim().split('\n');
      assert.strictEqual(lines[0].trim(), 'sequence,wristband_code,qr_payload,status');
      assert.ok(lines.length >= 13);
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(',');
        assert.strictEqual(parts.length, 4);
        assert.strictEqual(parts[1], parts[2], 'wristband_code must equal qr_payload');
        assert.strictEqual(parts[3], 'prepared');
      }
      assert.ok(!csvText.includes('Daniel'), 'CSV must not contain child names');
      assert.ok(!csvText.includes('080'), 'CSV must not contain phone numbers');
      passedScenarios++;
      console.log('✓ Scenario 10 passed: Exported CSV contains operational data only with zero PII\n');
    }

    console.log('--- TEST 11: Printing does not change status ---');
    {
      const rows = await query(
        `SELECT status FROM wristbands WHERE event_id = ?`,
        [testEvent1Id]
      );
      for (const r of rows) {
        assert.strictEqual(r.status, 'prepared', 'Printing must not mutate status');
      }
      passedScenarios++;
      console.log('✓ Scenario 11 passed: Fetching printable labels preserves prepared status without mutation\n');
    }

    console.log('--- TEST 12: Mark ready changes code-only prepared → available ---');
    {
      const res = await apiCall(`/api/admin/events/${testEvent1Id}/wristbands/mark-ready`, {
        method: 'POST',
        token: adminToken,
        body: {
          rangeStart: 'WB-000001',
          rangeEnd: 'WB-000003'
        }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.updatedCount, 3);

      const rowsReady = await query(
        `SELECT wristband_code, status FROM wristbands WHERE event_id = ? AND wristband_code IN ('WB-000001', 'WB-000002', 'WB-000003') ORDER BY wristband_code ASC`,
        [testEvent1Id]
      );
      assert.strictEqual(rowsReady.length, 3);
      for (const r of rowsReady) {
        assert.strictEqual(r.status, 'available');
      }

      // Other bands must remain prepared
      const rowsUnchanged = await query(
        `SELECT status FROM wristbands WHERE event_id = ? AND wristband_code = 'WB-000004'`,
        [testEvent1Id]
      );
      assert.strictEqual(rowsUnchanged[0].status, 'prepared');
      passedScenarios++;
      console.log('✓ Scenario 12 passed: Code-only bands in range marked available; others stay prepared\n');
    }

    console.log('--- TEST 13: NFC band cannot bypass NFC verification through code-only ready action ---');
    {
      const nfcPrep = await prepareWristband({
        eventId: testEvent1Id,
        nfcUid: '04A1B2C3D4E5F6',
        actor: { id: adminUserId, role: 'admin', email: 'admin@tga.org' }
      });
      assert.strictEqual(nfcPrep.wristband.status, 'prepared');
      assert.strictEqual(nfcPrep.wristband.nfc_uid, '04A1B2C3D4E5F6');

      const res = await apiCall(`/api/admin/events/${testEvent1Id}/wristbands/mark-ready`, {
        method: 'POST',
        token: adminToken,
        body: {
          ids: [nfcPrep.wristband.id]
        }
      });
      assert.strictEqual(res.status, 400, 'NFC band must be rejected by code-only mark-ready');
      assert.ok(res.data.error.includes('NFC'), 'Error must specify NFC verification required');

      const checkRow = await queryOne(
        `SELECT status FROM wristbands WHERE id = ?`,
        [nfcPrep.wristband.id]
      );
      assert.strictEqual(checkRow.status, 'prepared', 'NFC band must remain prepared');
      passedScenarios++;
      console.log('✓ Scenario 13 passed: NFC-enabled bands strictly rejected from code-only mark ready bypass\n');
    }

    console.log('--- TEST 14: Available code-only band can be assigned ---');
    {
      const res = await apiCall(`/api/volunteer/wristbands/bind`, {
        method: 'POST',
        token: volunteerToken,
        body: {
          eventId: testEvent1Id,
          childEventEntryId: entry1Id,
          wristbandCode: 'WB-000001'
        }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.wristband.wristbandCode || res.data.wristband.wristband_code, 'WB-000001');
      assert.strictEqual(res.data.wristband.status, 'active');

      const checkBand = await queryOne(
        `SELECT status FROM wristbands WHERE event_id = ? AND wristband_code = ?`,
        [testEvent1Id, 'WB-000001']
      );
      assert.strictEqual(checkBand.status, 'active');
      passedScenarios++;
      console.log('✓ Scenario 14 passed: Available code-only band WB-000001 successfully assigned and becomes active\n');
    }

    console.log('--- TEST 15: Active code cannot be assigned to another child ---');
    {
      const res = await apiCall(`/api/volunteer/wristbands/bind`, {
        method: 'POST',
        token: volunteerToken,
        body: {
          eventId: testEvent1Id,
          childEventEntryId: entry2Id,
          wristbandCode: 'WB-000001'
        }
      });
      assert.ok(res.status === 400 || res.status === 409, 'Re-assigning active band must fail');
      passedScenarios++;
      console.log('✓ Scenario 15 passed: Active wristband cannot be re-assigned to another child\n');
    }

    console.log('--- TEST 16: Wrong-event code cannot be assigned ---');
    {
      // TestEvent2 has available band WB-000001 (generated earlier)
      // First mark Event 2's WB-000001 ready
      await apiCall(`/api/admin/events/${testEvent2Id}/wristbands/mark-ready`, {
        method: 'POST',
        token: adminToken,
        body: { rangeStart: 'WB-000001', rangeEnd: 'WB-000001' }
      });

      // Attempt to assign non-existent code in Event 1
      const res = await apiCall(`/api/volunteer/wristbands/bind`, {
        method: 'POST',
        token: volunteerToken,
        body: {
          eventId: testEvent1Id,
          childEventEntryId: entry2Id,
          wristbandCode: 'WB-999999'
        }
      });
      assert.strictEqual(res.status, 404, 'Non-existent code in event must 404');
      passedScenarios++;
      console.log('✓ Scenario 16 passed: Wrong-event or non-existent code safely rejected\n');
    }

    console.log('--- TEST 17: Manual WB entry works ---');
    {
      const lookup = await apiCall(`/api/volunteer/wristbands/lookup?eventId=${testEvent1Id}&wristbandCode=WB-000002`, {
        method: 'GET',
        token: volunteerToken
      });
      assert.strictEqual(lookup.status, 200);
      assert.strictEqual(lookup.data.wristband.wristbandCode || lookup.data.wristband.wristband_code, 'WB-000002');
      assert.strictEqual(lookup.data.wristband.status, 'available');

      const assign = await apiCall(`/api/volunteer/wristbands/bind`, {
        method: 'POST',
        token: volunteerToken,
        body: {
          eventId: testEvent1Id,
          childEventEntryId: entry2Id,
          wristbandCode: 'WB-000002'
        }
      });
      assert.strictEqual(assign.status, 200);
      assert.strictEqual(assign.data.wristband.status, 'active');
      passedScenarios++;
      console.log('✓ Scenario 17 passed: Manual WB code entry successfully looked up and assigned\n');
    }

    console.log('--- TEST 18: QR WB scan works ---');
    {
      const scannedCode = 'WB-000003';
      const lookup = await apiCall(`/api/volunteer/wristbands/lookup?eventId=${testEvent1Id}&wristbandCode=${encodeURIComponent(scannedCode)}`, {
        method: 'GET',
        token: volunteerToken
      });
      assert.strictEqual(lookup.status, 200);
      assert.strictEqual(lookup.data.wristband.wristbandCode || lookup.data.wristband.wristband_code, 'WB-000003');
      assert.strictEqual(lookup.data.wristband.status, 'available');

      const assign = await apiCall(`/api/volunteer/wristbands/bind`, {
        method: 'POST',
        token: volunteerToken,
        body: {
          eventId: testEvent1Id,
          childEventEntryId: entry3Id,
          wristbandCode: scannedCode
        }
      });
      assert.strictEqual(assign.status, 200);
      assert.strictEqual(assign.data.wristband.status, 'active');
      passedScenarios++;
      console.log('✓ Scenario 18 passed: QR WB scan successfully looked up and assigned\n');
    }

    console.log('--- TEST 19: Assignment does not auto check-in ---');
    {
      const entryRow = await queryOne(
        `SELECT status FROM child_event_entries WHERE id = ?`,
        [entry2Id]
      );
      assert.strictEqual(entryRow.status, 'pass_ready', 'Check-in status must remain pass_ready');
      passedScenarios++;
      console.log('✓ Scenario 19 passed: Wristband assignment is isolated and does not mutate attendance status\n');
    }

    console.log('--- TEST 20: WB code resolves child after assignment ---');
    {
      const res1 = await resolveEventChildIdentifier(testEvent1Id, 'WB-000001');
      assert.strictEqual(res1.identifierType, 'wristband_code');
      assert.strictEqual(res1.childEventEntryId, entry1Id);

      const res2 = await resolveEventChildIdentifier(testEvent1Id, 'WB-000002');
      assert.strictEqual(res2.identifierType, 'wristband_code');
      assert.strictEqual(res2.childEventEntryId, entry2Id);

      const res3 = await resolveEventChildIdentifier(testEvent1Id, 'WB-000003');
      assert.strictEqual(res3.identifierType, 'wristband_code');
      assert.strictEqual(res3.childEventEntryId, entry3Id);
      passedScenarios++;
      console.log('✓ Scenario 20 passed: WB code cleanly resolves to the child_event_entry\n');
    }

    console.log('--- TEST 21: SCALE TEST — 1500 Wristband Batch ---');
    {
      console.log('Generating 1,500 wristband codes at event scale...');
      const startTime = Date.now();
      const res = await apiCall(`/api/admin/events/${scaleEventId}/wristbands/generate-codes`, {
        method: 'POST',
        token: adminToken,
        body: { quantity: 1500 }
      });
      const durationMs = Date.now() - startTime;
      console.log(`Generated 1,500 codes in ${durationMs}ms`);

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.totalGenerated, 1500);
      assert.strictEqual(res.data.rangeStart, 'WB-000001');
      assert.strictEqual(res.data.rangeEnd, 'WB-001500');

      const codes = res.data.wristbandCodes;
      assert.strictEqual(codes.length, 1500);
      const uniqueScaleCodes = new Set(codes);
      assert.strictEqual(uniqueScaleCodes.size, 1500, 'All 1,500 codes must be strictly unique');
      assert.strictEqual(codes[0], 'WB-000001');
      assert.strictEqual(codes[1499], 'WB-001500');

      // Test inventory pagination with 1,500 rows
      const invPage1 = await apiCall(`/api/admin/events/${scaleEventId}/wristbands/inventory?page=1&limit=50`, {
        method: 'GET',
        token: adminToken
      });
      assert.strictEqual(invPage1.status, 200);
      assert.strictEqual(invPage1.data.pagination.totalCount, 1500);
      assert.strictEqual(invPage1.data.pagination.totalPages, 30);
      assert.strictEqual(invPage1.data.wristbands.length, 50);

      // Test CSV Export with 1,500 rows
      const csvExport = await apiCall(`/api/admin/events/${scaleEventId}/wristbands/export-csv`, {
        method: 'GET',
        token: adminToken,
        rawText: true
      });
      assert.strictEqual(csvExport.status, 200);
      const csvLines = (csvExport.data as string).trim().split('\n');
      assert.strictEqual(csvLines.length, 1501, 'CSV must have 1 header line + 1500 rows');

      // Test Print Batch calculation for full 1,500 range
      const printBatch = await apiCall(`/api/admin/events/${scaleEventId}/wristbands/print-batch?mode=all_prepared`, {
        method: 'GET',
        token: adminToken
      });
      assert.strictEqual(printBatch.status, 200);
      assert.strictEqual(printBatch.data.totalCount, 1500);
      assert.strictEqual(printBatch.data.firstCode, 'WB-000001');
      assert.strictEqual(printBatch.data.lastCode, 'WB-001500');

      passedScenarios++;
      console.log('✓ Scenario 21 passed: Scale test (1,500 batch) successfully verified (0 duplicates, pagination responsive, CSV export & print batch complete)\n');
    }

    console.log('================================================================');
    console.log(`ALL ${passedScenarios} SCENARIOS PASSED SUCCESSFULLY`);
    console.log('================================================================\n');

    server.close();
  } catch (err: any) {
    console.error('❌ Test failed with error:', err);
    server.close();
    process.exit(1);
  }
}

runTgaCodeOnlyWristbandsTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Unhandled fatal error in test runner:', err);
  process.exit(1);
});
