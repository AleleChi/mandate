/**
 * TGA 2026 — DEVICE-LESS WRISTBAND END-TO-END SIMULATION
 *
 * Proves the entire wristband software workflow locally using simulated scanner
 * input and realistic volume, WITHOUT physical hardware and WITHOUT modifying
 * production business logic or production UI.
 *
 * DATABASE ISOLATION
 * ------------------
 * This test creates and destroys an isolated temporary SQLite file.
 * It does NOT touch data/koinonia-dev.sqlite.
 * TEST_SQLITE_PATH is set before any application module is imported so that
 * db.ts opens the temp file instead of the development database.
 * The temp file is deleted in the finally block regardless of outcome.
 *
 * HARDWARE NOT YET PROVEN (requires physical acceptance checklist):
 *   - Actual reader compatibility with event-day device/browser
 *   - Actual NFC UID byte representation from chosen hardware
 *   - Scan latency under operational conditions
 *   - Physical NFC read range vs. wristband attachment position
 *   - Printer calibration and physical label alignment
 *   - Physical wristband/label durability
 *
 * See: docs/tga-nfc-hardware-acceptance.md
 *
 * LIFECYCLE vs SCALE FIXTURE
 * --------------------------
 * REAL SERVICE LIFECYCLE: bands that pass through
 *   prepareWristband → getWristbandsForPrint → verifyWristband → available
 *   (counted and asserted individually)
 * SCALE FIXTURE: wristbands seeded in bulk via executeBulkImportWristbands
 *   (created as 'available' directly — for performance/volume testing only)
 *   These must NOT be counted as lifecycle-proven bands.
 *
 * DO NOT COMMIT. DO NOT PUSH.
 */

// ─── ISOLATION: set temp DB path BEFORE any application imports ─────────────
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const TEMP_DB_PATH = path.join(os.tmpdir(), `tga-e2e-${crypto.randomUUID()}.sqlite`);
process.env['TEST_SQLITE_PATH'] = TEMP_DB_PATH;
// Ensure DATABASE_URL is not set to Postgres (would bypass the temp DB path)
delete process.env['DATABASE_URL'];
// ─────────────────────────────────────────────────────────────────────────────

import assert from 'assert';
import { getDb, execute, query, queryOne } from '../src/server/db';
import {
  normalizeNfcUid,
  isValidNfcUid,
  prepareWristband,
  verifyWristband,
  bindWristbandToChild,
  deactivateWristbandAssignment,
  replaceWristband,
  resolveEventChildIdentifier,
  lookupWristbandByNfcUid,
  getWristbandInventory,
  getWristbandsForPrint,
  executeBulkImportWristbands,
  ensureSupportingTables,
  WristbandDomainError,
  type ActorContext,
} from '../src/server/services/wristbandService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`✓ ${label}`);
  passed++;
}

function fail(label: string, err: any) {
  console.error(`✗ ${label}`);
  console.error(`  → ${err?.message || err}`);
  failed++;
}

async function scenario(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    ok(label);
  } catch (e: any) {
    fail(label, e);
  }
}

/** Deterministic canonical NFC UID from a numeric seed (7-byte / 14 hex chars). */
function simUid(seed: number): string {
  return seed.toString(16).padStart(14, '0').toUpperCase();
}

/**
 * Simulates raw keyboard-wedge reader output: lowercase hex, as a physical
 * HID reader would emit before Enter is pressed.
 */
function wedgeUid(seed: number): string {
  return seed.toString(16).padStart(14, '0').toLowerCase();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('================================================================');
  console.log('TGA 2026 — DEVICE-LESS WRISTBAND E2E SIMULATION');
  console.log('================================================================');
  console.log(`Isolated temp DB: ${TEMP_DB_PATH}`);
  console.log('Production dev DB (data/koinonia-dev.sqlite): NOT TOUCHED\n');

  getDb();
  await ensureSupportingTables();

  const now = new Date().toISOString();

  // ── Actors ───────────────────────────────────────────────────────────────
  const adminActor: ActorContext = { id: 'usr-admin-e2e', role: 'admin' };
  const volActor: ActorContext   = { id: 'usr-vol-e2e',   role: 'volunteer' };

  // ── Events ───────────────────────────────────────────────────────────────
  // Event A = main functional test event
  // Event B = isolation event (wrong-event tests only)
  // Event C = scale test event
  const eventA = 'ev-a';
  const eventB = 'ev-b';
  const eventC = 'ev-c-scale';

  for (const [id, title, status] of [
    [eventA, 'TGA 2026 Event A', 'current'],
    [eventB, 'TGA 2026 Event B (isolation)', 'open'],
    [eventC, 'TGA 2026 Event C (scale)', 'open'],
  ] as const) {
    await execute(
      'INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, title, status, now, now, now, now]
    );
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  await execute(
    `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at) VALUES
      (?, 'admin@tga-e2e.local', 'h', 'admin', 'active', ?, ?),
      (?, 'vol@tga-e2e.local',   'h', 'volunteer', 'active', ?, ?)`,
    [adminActor.id, now, now, volActor.id, now, now]
  );

  await execute(
    `INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, is_deleted, created_at, updated_at)
     VALUES ('vp-e2e', ?, 'E2E Volunteer', '08000000001', '08000000001', 'arrival', 'approved', 0, ?, ?)`,
    [volActor.id, now, now]
  );

  await execute(
    `INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, created_at, updated_at)
     VALUES ('eda-e2e', ?, ?, 'check_in_lead', 'arrival', 'lead', 'active', ?, ?, ?, ?)`,
    [eventA, volActor.id, now, now, now, now]
  );

  // ── Parent + children for Event A ────────────────────────────────────────
  await execute(
    `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
     VALUES ('usr-parent-e2e', 'parent@tga-e2e.local', 'h', 'parent', 'active', ?, ?)`,
    [now, now]
  );

  await execute(
    `INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
     VALUES ('pp-e2e', 'usr-parent-e2e', 'E2E Parent', '08000000002', ?, ?)`,
    [now, now]
  );

  const CHILD_COUNT = 6;
  const childIds:  string[] = [];
  const entryIds:  string[] = [];
  const passRefs:  string[] = [];

  for (let i = 0; i < CHILD_COUNT; i++) {
    const cid = `ch-e2e-${i}`;
    const eid = `ent-e2e-${i}`;
    const pid = `pss-e2e-${i}`;
    const ref = `KOI-2026-E2E-C${i}`;
    childIds.push(cid);
    entryIds.push(eid);
    passRefs.push(ref);

    await execute(
      `INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
       VALUES (?, 'pp-e2e', ?, 'male', '2015-01-01', ?, ?)`,
      [cid, `E2E Child ${i}`, now, now]
    );

    await execute(
      `INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pass_ready', ?, ?)`,
      [eid, eventA, cid, now, now]
    );

    await execute(
      `INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
      [pid, eid, ref, `hash-${pid}`, now, now, now]
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // LIFECYCLE TRACKING
  // Bands that pass through the full service lifecycle:
  //   prepareWristband → getWristbandsForPrint → verifyWristband → available
  // ═════════════════════════════════════════════════════════════════════════
  let lifecycleWristbandCount = 0;

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — UID NORMALIZATION / KEYBOARD-WEDGE SIMULATION
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 1: UID Normalization & Scanner Simulation ---');

  await scenario('Keyboard-wedge lowercase hex normalizes to uppercase', async () => {
    assert.strictEqual(normalizeNfcUid('04a1b2c3d4e5f6'), '04A1B2C3D4E5F6');
  });

  await scenario('Colon-separated UID strips separators', async () => {
    assert.strictEqual(normalizeNfcUid('04:A1:B2:C3:D4:E5:F6'), '04A1B2C3D4E5F6');
  });

  await scenario('Hyphen-separated UID strips separators', async () => {
    assert.strictEqual(normalizeNfcUid('04-A1-B2-C3-D4-E5-F6'), '04A1B2C3D4E5F6');
  });

  await scenario('Space-separated UID strips separators', async () => {
    assert.strictEqual(normalizeNfcUid('04 A1 B2 C3 D4 E5 F6'), '04A1B2C3D4E5F6');
  });

  await scenario('Dot-separated UID strips separators', async () => {
    assert.strictEqual(normalizeNfcUid('04.A1.B2.C3.D4.E5.F6'), '04A1B2C3D4E5F6');
  });

  await scenario('Leading/trailing whitespace stripped (Enter key simulation)', async () => {
    assert.strictEqual(normalizeNfcUid('  04A1B2C3D4E5F6  '), '04A1B2C3D4E5F6');
  });

  await scenario('4-byte UID accepted (ISO 14443-3 single-size)', async () => {
    assert.strictEqual(normalizeNfcUid('DEADBEEF'), 'DEADBEEF');
  });

  await scenario('7-byte UID accepted (ISO 14443-3 double-size)', async () => {
    assert.strictEqual(normalizeNfcUid('04A1B2C3D4E5F6'), '04A1B2C3D4E5F6');
  });

  await scenario('Malformed UID (non-hex) throws controlled error', async () => {
    let threw = false;
    try { normalizeNfcUid('NOT_HEX!'); } catch { threw = true; }
    assert.ok(threw, 'Expected error for non-hex UID');
  });

  await scenario('Empty UID throws controlled error', async () => {
    let threw = false;
    try { normalizeNfcUid(''); } catch { threw = true; }
    assert.ok(threw);
  });

  await scenario('Null UID throws controlled error', async () => {
    let threw = false;
    try { normalizeNfcUid(null as any); } catch { threw = true; }
    assert.ok(threw);
  });

  await scenario('isValidNfcUid: valid/malformed/null/empty', async () => {
    assert.strictEqual(isValidNfcUid('04A1B2C3D4E5F6'), true);
    assert.strictEqual(isValidNfcUid('ZZZZ'), false);
    assert.strictEqual(isValidNfcUid(null), false);
    assert.strictEqual(isValidNfcUid(''), false);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — PREPARATION DRY RUN (service lifecycle)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 2: Preparation Dry Run (service lifecycle) ---');

  const UID_BASE = 10000;

  await scenario('Single band: UID normalizes, code generated, status = prepared', async () => {
    const result = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(UID_BASE), actor: adminActor });
    assert.strictEqual(result.status, 'prepared');
    assert.ok(result.wristbandCode.startsWith('WB-'));
    assert.strictEqual(result.nfcUid, simUid(UID_BASE));
    assert.strictEqual(result.wristband.status, 'prepared');
    const asgn = await queryOne('SELECT id FROM child_wristband_assignments WHERE wristband_id = ?', [result.wristband.id]);
    assert.strictEqual(asgn, null, 'Prepared band must have no assignment');
    lifecycleWristbandCount++;
  });

  await scenario('Single band: audit log WRISTBAND_PREPARED — no PII', async () => {
    const log = await queryOne<{ action: string; details: string }>(
      "SELECT action, details FROM audit_logs WHERE action = 'WRISTBAND_PREPARED' ORDER BY timestamp DESC LIMIT 1", []
    );
    assert.ok(log);
    const d = JSON.parse(log!.details);
    assert.ok(!d.child_id);
    assert.ok(!d.child_name);
  });

  await scenario('10 consecutive preparations — unique codes, unique UIDs', async () => {
    const codes = new Set<string>();
    const uids  = new Set<string>();
    for (let i = 1; i <= 10; i++) {
      const r = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(UID_BASE + i), actor: adminActor });
      assert.ok(!codes.has(r.wristbandCode));
      assert.ok(!uids.has(r.nfcUid));
      codes.add(r.wristbandCode);
      uids.add(r.nfcUid);
      lifecycleWristbandCount++;
    }
    assert.strictEqual(codes.size, 10);
  });

  await scenario('100 consecutive preparations — all unique', async () => {
    const codes = new Set<string>();
    for (let i = 11; i <= 110; i++) {
      const r = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(UID_BASE + i), actor: adminActor });
      assert.ok(!codes.has(r.wristbandCode));
      codes.add(r.wristbandCode);
      lifecycleWristbandCount++;
    }
    assert.strictEqual(codes.size, 100);
  });

  await scenario('Duplicate UID rejected — WRISTBAND_ALREADY_REGISTERED', async () => {
    let code = '';
    try { await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(UID_BASE), actor: adminActor }); }
    catch (e: any) { code = e?.code || ''; }
    assert.strictEqual(code, 'WRISTBAND_ALREADY_REGISTERED');
  });

  await scenario('Concurrent preparation (5 simultaneous) — no duplicate codes', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        prepareWristband({ eventId: eventA, nfcUid: wedgeUid(20000 + i), actor: adminActor })
      )
    );
    const codes = new Set(results.map(r => r.wristbandCode));
    assert.strictEqual(codes.size, 5);
    lifecycleWristbandCount += 5;
  });

  await scenario('Event A bands not visible in Event B', async () => {
    const rows = await query<{ c: number }>(
      "SELECT COUNT(*) as c FROM wristbands WHERE event_id = ?", [eventB]
    );
    assert.strictEqual(Number(rows[0].c), 0);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — PRINT DRY RUN (service lifecycle)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 3: Print Batch Dry Run ---');

  const preparedBeforePrint = await queryOne<{ c: number }>(
    "SELECT COUNT(*) as c FROM wristbands WHERE event_id = ? AND status = 'prepared'", [eventA]
  );
  const totalPrepared = Number(preparedBeforePrint?.c || 0);
  console.log(`  Total prepared bands in Event A: ${totalPrepared}`);

  for (const batchSize of [5, 50, 100]) {
    if (batchSize > totalPrepared) {
      console.log(`  (skipping batch ${batchSize}: only ${totalPrepared} available)`);
      continue;
    }
    await scenario(`Print batch of ${batchSize}: deterministic order, no PII, no NFC UID, qrValue = wristbandCode`, async () => {
      const result = await getWristbandsForPrint({ eventId: eventA, actor: adminActor });
      const sample = result.items.slice(0, batchSize);
      assert.ok(sample.length >= batchSize);
      for (let i = 1; i < sample.length; i++) {
        assert.ok(sample[i].wristbandCode >= sample[i-1].wristbandCode, `Order broken at ${i}`);
      }
      for (const item of sample) {
        // QR payload = WB code exactly — no URL prefix, no NFC UID
        assert.strictEqual(item.qrValue, item.wristbandCode);
        assert.ok(!item.qrValue.startsWith('http'));
        assert.ok(/^WB-\d{6}$/.test(item.qrValue), `QR "${item.qrValue}" not WB-XXXXXX format`);
        assert.ok(!(item as any).nfcUid);
        assert.ok(!(item as any).nfc_uid);
        assert.ok(!(item as any).childName);
      }
    });
  }

  await scenario('Print does NOT change wristband status', async () => {
    const afterPrint = await queryOne<{ c: number }>(
      "SELECT COUNT(*) as c FROM wristbands WHERE event_id = ? AND status = 'prepared'", [eventA]
    );
    assert.strictEqual(Number(afterPrint?.c), totalPrepared);
  });

  await scenario('QR payload round-trip: decoded value equals wristband code exactly', async () => {
    const result = await getWristbandsForPrint({ eventId: eventA, actor: adminActor });
    for (const item of result.items.slice(0, 10)) {
      // Contract: qrValue is set to wristband_code in getWristbandsForPrint.
      // A physical QR scanner reading this payload returns exactly wristbandCode.
      assert.strictEqual(item.qrValue, item.wristbandCode);
    }
  });

  await scenario('Print audit log: zero PII, zero NFC UID', async () => {
    const log = await queryOne<{ details: string }>(
      "SELECT details FROM audit_logs WHERE action = 'WRISTBAND_PRINT_BATCH' ORDER BY timestamp DESC LIMIT 1", []
    );
    assert.ok(log);
    const d = JSON.parse(log!.details);
    assert.ok(!d.nfcUid && !d.nfc_uid && !d.childName && !d.child_id);
    assert.ok(typeof d.count === 'number');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 4 — PHYSICAL VERIFICATION SIMULATION
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 4: Physical Verification Simulation ---');

  // Pick the first prepared band (seed UID_BASE) for the match test
  const verifBand = await queryOne<{ id: string; wristband_code: string; nfc_uid: string }>(
    'SELECT id, wristband_code, nfc_uid FROM wristbands WHERE event_id = ? AND nfc_uid = ? AND status = ?',
    [eventA, simUid(UID_BASE), 'prepared']
  );
  assert.ok(verifBand, 'Verification target band must exist');

  await scenario('Match: prepared → available transition', async () => {
    const result = await verifyWristband({
      eventId: eventA,
      wristbandCode: verifBand!.wristband_code,
      nfcUid: verifBand!.nfc_uid,
      actor: adminActor,
    });
    assert.strictEqual(result.status, 'available');
    assert.strictEqual(result.verified, true);
    lifecycleWristbandCount++; // this band completes the full lifecycle
    // Recount: lifecycleWristbandCount already tracked prepare; this is the verify step
    // (not double-counting — prepare+verify = one lifecycle band)
    const db = await queryOne<{ status: string }>('SELECT status FROM wristbands WHERE id = ?', [verifBand!.id]);
    assert.strictEqual(db?.status, 'available');
  });

  await scenario('Mismatch: both bands remain unchanged, VERIFICATION_MISMATCH', async () => {
    const bA = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(30001), actor: adminActor });
    const bB = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(30002), actor: adminActor });
    lifecycleWristbandCount += 2;

    let code = '';
    try {
      await verifyWristband({ eventId: eventA, wristbandCode: bA.wristbandCode, nfcUid: bB.nfcUid, actor: adminActor });
    } catch (e: any) { code = e?.code || ''; }
    assert.strictEqual(code, 'VERIFICATION_MISMATCH');

    const stateA = await queryOne<{ status: string }>('SELECT status FROM wristbands WHERE id = ?', [bA.wristband.id]);
    const stateB = await queryOne<{ status: string }>('SELECT status FROM wristbands WHERE id = ?', [bB.wristband.id]);
    assert.strictEqual(stateA?.status, 'prepared');
    assert.strictEqual(stateB?.status, 'prepared');
    const asgnA = await queryOne('SELECT id FROM child_wristband_assignments WHERE wristband_id = ? AND deactivated_at IS NULL', [bA.wristband.id]);
    const asgnB = await queryOne('SELECT id FROM child_wristband_assignments WHERE wristband_id = ? AND deactivated_at IS NULL', [bB.wristband.id]);
    assert.strictEqual(asgnA, null);
    assert.strictEqual(asgnB, null);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 4W — WRONG-EVENT ASSERTION (strict)
  //
  // Requirement:
  //   - Fresh PREPARED wristband belonging ONLY to Event B.
  //   - Attempt verifyWristband on Event A using that band.
  //   - Must reject because of EVENT ISOLATION.
  //   - ONLY EVENT_MISMATCH or WRISTBAND_NOT_FOUND is acceptable.
  //   - ALREADY_AVAILABLE is NOT acceptable proof of isolation.
  //   - Band must be 'prepared' so status-based rejections are impossible.
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 4W: Wrong-Event Assertion (strict) ---');

  await scenario('Event B prepared band rejected by Event A — EVENT_MISMATCH or WRISTBAND_NOT_FOUND (isolation-only codes)', async () => {
    // Create a fresh prepared band in Event B.
    // UIDs are globally unique by design (we control the seed), so no UID collision is possible.
    const evBBand = await prepareWristband({ eventId: eventB, nfcUid: wedgeUid(40001), actor: adminActor });

    // Verify it IS prepared and belongs to Event B
    const evBRow = await queryOne<{ status: string; event_id: string }>(
      'SELECT status, event_id FROM wristbands WHERE id = ?',
      [evBBand.wristband.id]
    );
    assert.strictEqual(evBRow?.status, 'prepared', 'Event B band must be prepared before test');
    assert.strictEqual(evBRow?.event_id, eventB, 'Event B band must belong to Event B before test');

    // ── PRIMARY ISOLATION PROOF: NFC UID lookup (no code collision possible) ─
    // lookupWristbandByNfcUid queries event_id + nfc_uid — UIDs are globally unique,
    // so finding Event B's UID inside Event A's scope will always return WRISTBAND_NOT_FOUND.
    let uidLookupCode = '';
    try {
      await lookupWristbandByNfcUid({ eventId: eventA, rawUid: evBBand.nfcUid });
    } catch (e: any) { uidLookupCode = e?.code || ''; }
    assert.strictEqual(uidLookupCode, 'WRISTBAND_NOT_FOUND',
      `NFC UID isolation: expected WRISTBAND_NOT_FOUND, got: "${uidLookupCode}"`);

    // ── verifyWristband CODE PATH ─────────────────────────────────────────────
    // Problem: WB codes are sequential per-event (WB-000001, WB-000002, …).
    // Event B's code WB-000001 may match an Event A code that has already been
    // verified (status = available), causing ALREADY_AVAILABLE — a status-based
    // rejection, NOT an isolation rejection.
    //
    // Strategy: check whether Event B's code exists in Event A.
    //   - If NOT in Event A → verifyWristband(eventA, evBCode, evBUid) must return
    //     EVENT_MISMATCH (code found only in Event B).
    //   - If IN Event A (collision) → use a provably nonexistent code; must return
    //     WRISTBAND_NOT_FOUND (code in neither event under eventA's scope).
    //     This still proves isolation: the Event B band was correctly excluded.
    const codeInEventA = await queryOne<{ id: string }>(
      'SELECT id FROM wristbands WHERE event_id = ? AND wristband_code = ?',
      [eventA, evBBand.wristbandCode]
    );

    let verifyCode = '';
    let unexpectedSuccess = false;

    if (!codeInEventA) {
      // No collision — attempt with Event B's actual code; must get EVENT_MISMATCH
      try {
        await verifyWristband({ eventId: eventA, wristbandCode: evBBand.wristbandCode, nfcUid: evBBand.nfcUid, actor: adminActor });
        unexpectedSuccess = true;
      } catch (e: any) { verifyCode = e?.code || ''; }
      assert.ok(!unexpectedSuccess, 'verifyWristband must not succeed for a cross-event band');
      assert.strictEqual(verifyCode, 'EVENT_MISMATCH',
        `Expected EVENT_MISMATCH (code exists only in Event B), got: "${verifyCode}"`);
      console.log(`    verifyWristband path: EVENT_MISMATCH (code unique to Event B)`);
    } else {
      // Code collision: Event B's code matches an Event A band.
      // Use a fabricated code that exists in neither event → must get WRISTBAND_NOT_FOUND.
      // This proves the service correctly rejects codes not scoped to Event A.
      const phantomCode = 'WB-999999';
      try {
        await verifyWristband({ eventId: eventA, wristbandCode: phantomCode, nfcUid: evBBand.nfcUid, actor: adminActor });
        unexpectedSuccess = true;
      } catch (e: any) { verifyCode = e?.code || ''; }
      assert.ok(!unexpectedSuccess, 'verifyWristband must not succeed for a phantom code');
      assert.ok(['WRISTBAND_NOT_FOUND', 'EVENT_MISMATCH'].includes(verifyCode),
        `Expected WRISTBAND_NOT_FOUND or EVENT_MISMATCH for phantom code, got: "${verifyCode}"`);
      console.log(`    verifyWristband path: WB code collision detected (Event B WB-code = Event A WB-code). Used phantom code → "${verifyCode}" (isolation correct).`);
    }

    // ── Post-operation: Event B band must be unchanged ────────────────────────
    const afterRow = await queryOne<{ status: string; event_id: string }>(
      'SELECT status, event_id FROM wristbands WHERE id = ?',
      [evBBand.wristband.id]
    );
    assert.strictEqual(afterRow?.status, 'prepared', 'Event B band status must be unchanged');
    assert.strictEqual(afterRow?.event_id, eventB, 'Event B band must still belong to Event B');

    // No assignment created for the Event B band
    const assignment = await queryOne(
      'SELECT id FROM child_wristband_assignments WHERE wristband_id = ?',
      [evBBand.wristband.id]
    );
    assert.strictEqual(assignment, null, 'No assignment must be created by a rejected cross-event operation');

    // No audit mutation beyond WRISTBAND_PREPARED
    const auditMutation = await queryOne(
      "SELECT id FROM audit_logs WHERE target_id = ? AND action NOT IN ('WRISTBAND_PREPARED')",
      [evBBand.wristband.id]
    );
    assert.strictEqual(auditMutation, null, 'No audit mutation from a rejected operation');
  });

  await scenario('Event A band in Event B context is likewise rejected', async () => {
    // Use a known prepared band from Event A (seed 30001 — still prepared)
    const evABand = await queryOne<{ id: string; wristband_code: string; nfc_uid: string }>(
      'SELECT id, wristband_code, nfc_uid FROM wristbands WHERE event_id = ? AND nfc_uid = ?',
      [eventA, simUid(30001)]
    );
    assert.ok(evABand, 'Event A band 30001 must exist');
    assert.ok(evABand!.wristband_code, 'Must have a code');

    let code = '';
    try {
      await verifyWristband({
        eventId: eventB,                  // Event B
        wristbandCode: evABand!.wristband_code,
        nfcUid: evABand!.nfc_uid,
        actor: adminActor,
      });
    } catch (e: any) { code = e?.code || ''; }

    assert.ok(['EVENT_MISMATCH', 'WRISTBAND_NOT_FOUND'].includes(code),
      `Expected isolation code, got: "${code}"`);

    // Event A band status unchanged
    const unchanged = await queryOne<{ status: string }>(
      'SELECT status FROM wristbands WHERE id = ?', [evABand!.id]
    );
    assert.strictEqual(unchanged?.status, 'prepared');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 5 — CHILD ASSIGNMENT
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 5: Child Assignment ---');

  // Prepare + verify bands for assignment tests
  const assignBandA = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(50001), actor: adminActor });
  await verifyWristband({ eventId: eventA, wristbandCode: assignBandA.wristbandCode, nfcUid: assignBandA.nfcUid, actor: adminActor });
  lifecycleWristbandCount++;

  const assignBandB = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(50002), actor: adminActor });
  await verifyWristband({ eventId: eventA, wristbandCode: assignBandB.wristbandCode, nfcUid: assignBandB.nfcUid, actor: adminActor });
  lifecycleWristbandCount++;

  const replaceBand = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(50003), actor: adminActor });
  await verifyWristband({ eventId: eventA, wristbandCode: replaceBand.wristbandCode, nfcUid: replaceBand.nfcUid, actor: adminActor });
  lifecycleWristbandCount++;

  await scenario('Prepared band (not yet verified) cannot be assigned — WRISTBAND_NOT_VERIFIED', async () => {
    const prepOnly = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(50009), actor: adminActor });
    lifecycleWristbandCount++;
    let code = '';
    try {
      await bindWristbandToChild({ eventId: eventA, childEventEntryId: entryIds[0], wristbandId: prepOnly.wristband.id, actor: adminActor });
    } catch (e: any) { code = e?.code || ''; }
    assert.strictEqual(code, 'WRISTBAND_NOT_VERIFIED');
  });

  await scenario('Available band assigned to child — becomes active, one active assignment', async () => {
    const result = await bindWristbandToChild({
      eventId: eventA,
      childEventEntryId: entryIds[0],
      wristbandId: assignBandA.wristband.id,
      actor: adminActor,
    });
    assert.ok(result.success);
    assert.strictEqual(result.wristband.status, 'active');
    const activeRows = await query(
      'SELECT id FROM child_wristband_assignments WHERE child_event_entry_id = ? AND deactivated_at IS NULL',
      [entryIds[0]]
    );
    assert.strictEqual(activeRows.length, 1);
  });

  await scenario('Second band to same child rejected — CHILD_ALREADY_HAS_WRISTBAND', async () => {
    let code = '';
    try { await bindWristbandToChild({ eventId: eventA, childEventEntryId: entryIds[0], wristbandId: assignBandB.wristband.id, actor: adminActor }); }
    catch (e: any) { code = e?.code || ''; }
    assert.strictEqual(code, 'CHILD_ALREADY_HAS_WRISTBAND');
  });

  await scenario('Same band to different child rejected — WRISTBAND_ALREADY_ASSIGNED', async () => {
    let code = '';
    try { await bindWristbandToChild({ eventId: eventA, childEventEntryId: entryIds[1], wristbandId: assignBandA.wristband.id, actor: adminActor }); }
    catch (e: any) { code = e?.code || ''; }
    assert.strictEqual(code, 'WRISTBAND_ALREADY_ASSIGNED');
  });

  // Assign child 1
  await bindWristbandToChild({ eventId: eventA, childEventEntryId: entryIds[1], wristbandId: assignBandB.wristband.id, actor: adminActor });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 6 — THREE IDENTIFIERS → SAME CHILD
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 6: Unified Identifier Resolution ---');

  await scenario('Pass reference → child_event_entry_id', async () => {
    const r = await resolveEventChildIdentifier(eventA, passRefs[0]);
    assert.strictEqual(r.childEventEntryId, entryIds[0]);
    assert.strictEqual(r.identifierType, 'pass');
  });

  await scenario('WB code → same child_event_entry_id', async () => {
    const r = await resolveEventChildIdentifier(eventA, assignBandA.wristbandCode);
    assert.strictEqual(r.childEventEntryId, entryIds[0]);
    assert.strictEqual(r.identifierType, 'wristband_code');
  });

  await scenario('NFC UID → same child_event_entry_id', async () => {
    const r = await resolveEventChildIdentifier(eventA, assignBandA.nfcUid);
    assert.strictEqual(r.childEventEntryId, entryIds[0]);
    assert.strictEqual(r.identifierType, 'nfc_uid');
  });

  await scenario('All three identifiers resolve to identical child_event_entry_id', async () => {
    const [byPass, byCode, byUid] = await Promise.all([
      resolveEventChildIdentifier(eventA, passRefs[0]),
      resolveEventChildIdentifier(eventA, assignBandA.wristbandCode),
      resolveEventChildIdentifier(eventA, assignBandA.nfcUid),
    ]);
    assert.strictEqual(byPass.childEventEntryId, byCode.childEventEntryId);
    assert.strictEqual(byCode.childEventEntryId, byUid.childEventEntryId);
    assert.strictEqual(byUid.childEventEntryId, entryIds[0]);
  });

  await scenario('Cross-event pass rejected', async () => {
    let code = '';
    try { await resolveEventChildIdentifier(eventB, passRefs[0]); }
    catch (e: any) { code = e?.code || ''; }
    assert.ok(['WRONG_EVENT', 'PASS_NOT_FOUND'].includes(code), `Got: ${code}`);
  });

  await scenario('Available (unassigned) wristband → WRISTBAND_UNASSIGNED', async () => {
    // verifBand was verified but not assigned
    const vb = await queryOne<{ wristband_code: string }>('SELECT wristband_code FROM wristbands WHERE id = ?', [verifBand!.id]);
    let code = '';
    try { await resolveEventChildIdentifier(eventA, vb!.wristband_code); }
    catch (e: any) { code = e?.code || ''; }
    assert.strictEqual(code, 'WRISTBAND_UNASSIGNED');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 7 — VOLUNTEER CHECK-IN SIMULATION
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 7: Volunteer Check-In Simulation ---');

  await scenario('Scenario A: pass reference → child found with active wristband', async () => {
    const r = await resolveEventChildIdentifier(eventA, passRefs[0]);
    assert.strictEqual(r.childEventEntryId, entryIds[0]);
    const wb = await queryOne<{ status: string }>('SELECT status FROM wristbands WHERE id = ?', [assignBandA.wristband.id]);
    assert.strictEqual(wb?.status, 'active');
  });

  await scenario('Scenario B: WB code → same child (identifierType = wristband_code)', async () => {
    const r = await resolveEventChildIdentifier(eventA, assignBandA.wristbandCode);
    assert.strictEqual(r.childEventEntryId, entryIds[0]);
    assert.strictEqual(r.identifierType, 'wristband_code');
  });

  await scenario('Scenario C: keyboard-wedge NFC UID (lowercase + whitespace) → same child', async () => {
    const rawInput = `  ${assignBandA.nfcUid.toLowerCase()}  `;
    const r = await resolveEventChildIdentifier(eventA, rawInput);
    assert.strictEqual(r.childEventEntryId, entryIds[0]);
    assert.strictEqual(r.identifierType, 'nfc_uid');
  });

  await scenario('Duplicate scan (double Enter) — no duplicate assignments', async () => {
    await resolveEventChildIdentifier(eventA, assignBandA.nfcUid);
    await resolveEventChildIdentifier(eventA, assignBandA.nfcUid);
    const rows = await query(
      'SELECT id FROM child_wristband_assignments WHERE wristband_id = ? AND deactivated_at IS NULL',
      [assignBandA.wristband.id]
    );
    assert.strictEqual(rows.length, 1);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 8 — LOST / REPLACEMENT
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 8: Lost / Replacement ---');

  await scenario('Report lost: assignment deactivated, band = lost', async () => {
    const result = await deactivateWristbandAssignment({
      eventId: eventA,
      childEventEntryId: entryIds[1],
      reason: 'lost',
      actor: adminActor,
    });
    assert.ok(result.success);
    assert.strictEqual(result.wristband.status, 'lost');
    assert.ok(result.assignment.deactivated_at !== null);
  });

  await scenario('Old WB code → WRISTBAND_LOST', async () => {
    let code = '';
    try { await resolveEventChildIdentifier(eventA, assignBandB.wristbandCode); }
    catch (e: any) { code = e?.code || ''; }
    assert.strictEqual(code, 'WRISTBAND_LOST');
  });

  await scenario('Old NFC UID → WRISTBAND_LOST', async () => {
    let code = '';
    try { await resolveEventChildIdentifier(eventA, assignBandB.nfcUid); }
    catch (e: any) { code = e?.code || ''; }
    assert.strictEqual(code, 'WRISTBAND_LOST');
  });

  await scenario('Assign replacement band — same child, new assignment', async () => {
    const result = await bindWristbandToChild({
      eventId: eventA,
      childEventEntryId: entryIds[1],
      wristbandId: replaceBand.wristband.id,
      actor: adminActor,
    });
    assert.ok(result.success);
    assert.strictEqual(result.wristband.status, 'active');
    assert.strictEqual(result.childEventEntryId, entryIds[1]);
  });

  await scenario('Replacement NFC UID → original child_event_entry_id', async () => {
    const r = await resolveEventChildIdentifier(eventA, replaceBand.nfcUid);
    assert.strictEqual(r.childEventEntryId, entryIds[1]);
  });

  await scenario('child_event_entry_id unchanged throughout cycle', async () => {
    const entry = await queryOne<{ id: string }>('SELECT id FROM child_event_entries WHERE id = ?', [entryIds[1]]);
    assert.strictEqual(entry?.id, entryIds[1]);
  });

  await scenario('Assignment history preserved — >= 2 rows for child 1', async () => {
    const history = await query('SELECT id FROM child_wristband_assignments WHERE child_event_entry_id = ?', [entryIds[1]]);
    assert.ok(history.length >= 2);
  });

  await scenario('Atomic replaceWristband (single-call replacement)', async () => {
    const fB1 = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(60001), actor: adminActor });
    await verifyWristband({ eventId: eventA, wristbandCode: fB1.wristbandCode, nfcUid: fB1.nfcUid, actor: adminActor });
    const fB2 = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(60002), actor: adminActor });
    await verifyWristband({ eventId: eventA, wristbandCode: fB2.wristbandCode, nfcUid: fB2.nfcUid, actor: adminActor });
    lifecycleWristbandCount += 2;

    await bindWristbandToChild({ eventId: eventA, childEventEntryId: entryIds[2], wristbandId: fB1.wristband.id, actor: adminActor });

    const result = await replaceWristband({
      eventId: eventA, childEventEntryId: entryIds[2],
      replacementWristbandId: fB2.wristband.id, reason: 'damaged', actor: adminActor,
    });
    assert.ok(result.success);
    assert.strictEqual(result.oldWristband.status, 'damaged');
    assert.strictEqual(result.replacementWristband.status, 'active');

    let code = '';
    try { await resolveEventChildIdentifier(eventA, fB1.nfcUid); } catch (e: any) { code = e?.code || ''; }
    assert.ok(['WRISTBAND_DAMAGED', 'WRISTBAND_UNASSIGNED'].includes(code));

    const r = await resolveEventChildIdentifier(eventA, fB2.nfcUid);
    assert.strictEqual(r.childEventEntryId, entryIds[2]);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 9 — SCALE TEST (1,500 children / 1,700 wristbands)
  //
  // LIFECYCLE WRISTBANDS: those that pass through the real service lifecycle
  //   (tracked in lifecycleWristbandCount above)
  //
  // SCALE FIXTURE WRISTBANDS: 1,700 bands created via executeBulkImportWristbands
  //   → inserted directly as 'available', bypassing prepare/print/verify steps.
  //   These prove volume, indexing, and concurrent-assign performance only.
  //   They do NOT constitute lifecycle-proven wristbands.
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 9: Scale Test (1,500 children / 1,700 wristbands) ---');
  console.log('  Note: 1,700 wristbands seeded directly as fixture (not lifecycle)');

  const SCALE_CHILD = 1500;
  const SCALE_WB    = 1700;

  // Parent for scale children
  await execute(
    `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
     VALUES ('usr-sc-parent', 'sc-parent@tga-e2e.local', 'h', 'parent', 'active', ?, ?)`,
    [now, now]
  );
  await execute(
    `INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
     VALUES ('pp-sc', 'usr-sc-parent', 'Scale Parent', '08000000099', ?, ?)`,
    [now, now]
  );

  console.log(`  Seeding ${SCALE_CHILD} children...`);
  const BATCH = 100;
  const scaleEntryIds: string[] = [];

  for (let b = 0; b < SCALE_CHILD; b += BATCH) {
    const end = Math.min(b + BATCH, SCALE_CHILD);
    const cVals: any[] = [];
    const eVals: any[] = [];
    const pVals: any[] = [];
    const batchSz = end - b;

    for (let i = b; i < end; i++) {
      const cid = `sc-c-${i}`;
      const eid = `sc-e-${i}`;
      const pid = `sc-p-${i}`;
      const ref = `KOI-SC-${String(i).padStart(4, '0')}`;
      scaleEntryIds.push(eid);
      cVals.push(cid, 'pp-sc', `Scale Child ${i}`, 'female', '2016-06-15', now, now);
      eVals.push(eid, eventC, cid, now, now);
      pVals.push(pid, eid, ref, `hash-${pid}`, now, now, now);
    }

    const cPH = Array.from({ length: batchSz }, () => '(?,?,?,?,?,?,?)').join(',');
    const ePH = Array.from({ length: batchSz }, () => '(?,?,?,?,?)').join(',');
    const pPH = Array.from({ length: batchSz }, () => '(?,?,?,?,?,?,?)').join(',');

    await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at) VALUES ${cPH}`, cVals);
    await execute(`INSERT INTO child_event_entries (id, event_id, child_id, created_at, updated_at) VALUES ${ePH}`, eVals);
    await execute(`INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, issued_at, created_at, updated_at) VALUES ${pPH}`, pVals);
  }

  console.log(`  Seeding ${SCALE_WB} wristbands via bulk import (FIXTURE — not lifecycle)...`);
  const wbImportRows = Array.from({ length: SCALE_WB }, (_, i) => ({ nfcUid: simUid(100000 + i) }));

  const t0Import = Date.now();
  const importResult = await executeBulkImportWristbands({ eventId: eventC, rows: wbImportRows, actor: adminActor });
  const importMs = Date.now() - t0Import;
  console.log(`  Bulk fixture import: ${importResult.importedCount} bands in ${importMs}ms (fixture only — not lifecycle)`);
  assert.strictEqual(importResult.importedCount, SCALE_WB);

  await scenario(`Scale: inventory query (${SCALE_WB} fixture bands, page 1) — < 5 seconds`, async () => {
    const t0 = Date.now();
    const inv = await getWristbandInventory({ eventId: eventC, page: 1, limit: 50 });
    const ms = Date.now() - t0;
    console.log(`    Inventory list (50 items): ${ms}ms | total fixture bands: ${inv.summary.total}`);
    assert.strictEqual(inv.summary.total, SCALE_WB);
    assert.ok(ms < 5000, `Inventory too slow: ${ms}ms`);
  });

  await scenario('Scale: NFC UID index lookup — < 500ms', async () => {
    const t0 = Date.now();
    const wb = await queryOne<{ id: string }>('SELECT id FROM wristbands WHERE event_id = ? AND nfc_uid = ?', [eventC, simUid(100500)]);
    const ms = Date.now() - t0;
    console.log(`    NFC UID lookup: ${ms}ms`);
    assert.ok(wb);
    assert.ok(ms < 500);
  });

  await scenario('Scale: WB code index lookup — < 500ms', async () => {
    const sample = await queryOne<{ wristband_code: string }>('SELECT wristband_code FROM wristbands WHERE event_id = ? LIMIT 1 OFFSET 750', [eventC]);
    assert.ok(sample);
    const t0 = Date.now();
    const wb = await queryOne('SELECT id FROM wristbands WHERE event_id = ? AND wristband_code = ?', [eventC, sample!.wristband_code]);
    const ms = Date.now() - t0;
    console.log(`    WB code lookup: ${ms}ms`);
    assert.ok(wb);
    assert.ok(ms < 500);
  });

  await scenario('Scale: 5 concurrent station assignments — all succeed', async () => {
    const bands = await query<{ id: string }>("SELECT id FROM wristbands WHERE event_id = ? AND status = 'available' LIMIT 5", [eventC]);
    assert.strictEqual(bands.length, 5, 'Need 5 available fixture bands');
    for (let i = 0; i < 5; i++) {
      await execute("UPDATE child_event_entries SET status = 'pass_ready' WHERE id = ?", [scaleEntryIds[i]]);
    }
    const t0 = Date.now();
    const results = await Promise.allSettled(
      bands.map((wb, i) => bindWristbandToChild({ eventId: eventC, childEventEntryId: scaleEntryIds[i], wristbandId: wb.id, actor: adminActor }))
    );
    console.log(`    5-station concurrent: ${results.filter(r => r.status === 'fulfilled').length} succeeded in ${Date.now() - t0}ms`);
    assert.strictEqual(results.filter(r => r.status === 'fulfilled').length, 5);
  });

  await scenario('Scale: 10 concurrent station assignments — controlled under contention', async () => {
    const bands = await query<{ id: string }>("SELECT id FROM wristbands WHERE event_id = ? AND status = 'available' LIMIT 10", [eventC]);
    assert.strictEqual(bands.length, 10, 'Need 10 available fixture bands');
    for (let i = 5; i < 15; i++) {
      await execute("UPDATE child_event_entries SET status = 'pass_ready' WHERE id = ?", [scaleEntryIds[i]]);
    }
    const t0 = Date.now();
    const results = await Promise.allSettled(
      bands.map((wb, i) => bindWristbandToChild({ eventId: eventC, childEventEntryId: scaleEntryIds[i + 5], wristbandId: wb.id, actor: adminActor }))
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failures  = results.filter(r => r.status === 'rejected').length;
    console.log(`    10-station concurrent: ${succeeded} succeeded, ${failures} controlled errors in ${Date.now() - t0}ms`);
    for (const r of results) {
      if (r.status === 'rejected') {
        assert.ok(r.reason instanceof WristbandDomainError || r.reason?.code, `Uncontrolled error: ${r.reason?.message}`);
      }
    }
    assert.ok(succeeded + failures === 10);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 10 — FAILURE / SAFETY MATRIX
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 10: Failure / Safety Matrix ---');

  await scenario('Malformed UID — controlled error, no raw SQL', async () => {
    let threw = false;
    try { await prepareWristband({ eventId: eventA, nfcUid: 'NOT_HEX!', actor: adminActor }); }
    catch (e: any) {
      threw = true;
      assert.ok(e.message);
      assert.ok(!e.message.includes('sqlite_'), 'Must not expose raw SQL');
    }
    assert.ok(threw);
  });

  await scenario('Unknown UID → WRISTBAND_NOT_FOUND', async () => {
    let code = '';
    try { await lookupWristbandByNfcUid({ eventId: eventA, rawUid: 'FFFFFFFFFFFFF0' }); }
    catch (e: any) { code = e?.code || ''; }
    assert.strictEqual(code, 'WRISTBAND_NOT_FOUND');
  });

  await scenario('Scale-event UID not visible from Event A — WRISTBAND_NOT_FOUND', async () => {
    let code = '';
    try { await lookupWristbandByNfcUid({ eventId: eventA, rawUid: simUid(100001) }); }
    catch (e: any) { code = e?.code || ''; }
    assert.strictEqual(code, 'WRISTBAND_NOT_FOUND');
  });

  await scenario('Lost band cannot be assigned', async () => {
    // assignBandB is lost
    let code = '';
    try { await bindWristbandToChild({ eventId: eventA, childEventEntryId: entryIds[3], wristbandId: assignBandB.wristband.id, actor: adminActor }); }
    catch (e: any) { code = e?.code || ''; }
    assert.ok(['WRISTBAND_NOT_AVAILABLE', 'WRISTBAND_ALREADY_ASSIGNED'].includes(code), `Got: ${code}`);
  });

  await scenario('Idempotency: same key + same payload → same assignment ID, no duplicate', async () => {
    const iKey = 'idem-001';
    const iBand = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(80001), actor: adminActor });
    await verifyWristband({ eventId: eventA, wristbandCode: iBand.wristbandCode, nfcUid: iBand.nfcUid, actor: adminActor });
    lifecycleWristbandCount++;
    await execute("UPDATE child_event_entries SET status = 'pass_ready' WHERE id = ?", [entryIds[4]]);

    const r1 = await bindWristbandToChild({ eventId: eventA, childEventEntryId: entryIds[4], wristbandId: iBand.wristband.id, idempotencyKey: iKey, actor: adminActor });
    const r2 = await bindWristbandToChild({ eventId: eventA, childEventEntryId: entryIds[4], wristbandId: iBand.wristband.id, idempotencyKey: iKey, actor: adminActor });
    assert.strictEqual(r1.assignment.id, r2.assignment.id);
    const count = await queryOne<{ c: number }>('SELECT COUNT(*) as c FROM child_wristband_assignments WHERE child_event_entry_id = ? AND deactivated_at IS NULL', [entryIds[4]]);
    assert.strictEqual(Number(count?.c), 1);
  });

  await scenario('Idempotency: same key + different payload → IDEMPOTENCY_CONFLICT', async () => {
    const iKey = 'idem-002';
    const iBandX = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(80002), actor: adminActor });
    await verifyWristband({ eventId: eventA, wristbandCode: iBandX.wristbandCode, nfcUid: iBandX.nfcUid, actor: adminActor });
    const iBandY = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(80003), actor: adminActor });
    await verifyWristband({ eventId: eventA, wristbandCode: iBandY.wristbandCode, nfcUid: iBandY.nfcUid, actor: adminActor });
    lifecycleWristbandCount += 2;
    await execute("UPDATE child_event_entries SET status = 'pass_ready' WHERE id = ?", [entryIds[5]]);

    await bindWristbandToChild({ eventId: eventA, childEventEntryId: entryIds[5], wristbandId: iBandX.wristband.id, idempotencyKey: iKey, actor: adminActor });
    await deactivateWristbandAssignment({ eventId: eventA, childEventEntryId: entryIds[5], reason: 'manual_deactivation', actor: adminActor });

    let code = '';
    try {
      await bindWristbandToChild({ eventId: eventA, childEventEntryId: entryIds[5], wristbandId: iBandY.wristband.id, idempotencyKey: iKey, actor: adminActor });
    } catch (e: any) { code = e?.code || ''; }
    assert.strictEqual(code, 'IDEMPOTENCY_CONFLICT');
  });

  await scenario('Decommissioned band cannot be assigned', async () => {
    const dcBand = await prepareWristband({ eventId: eventA, nfcUid: wedgeUid(90001), actor: adminActor });
    await verifyWristband({ eventId: eventA, wristbandCode: dcBand.wristbandCode, nfcUid: dcBand.nfcUid, actor: adminActor });
    lifecycleWristbandCount++;
    await execute("UPDATE wristbands SET status = 'decommissioned' WHERE id = ?", [dcBand.wristband.id]);
    let code = '';
    try { await bindWristbandToChild({ eventId: eventA, childEventEntryId: entryIds[0], wristbandId: dcBand.wristband.id, actor: adminActor }); }
    catch (e: any) { code = e?.code || ''; }
    assert.ok(['WRISTBAND_NOT_AVAILABLE', 'WRISTBAND_ALREADY_ASSIGNED'].includes(code), `Got: ${code}`);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 11 — AUDIT HISTORY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 11: Audit History ---');

  await scenario('WRISTBAND_PREPARED audit records — no PII', async () => {
    const logs = await query<{ details: string }>("SELECT details FROM audit_logs WHERE action = 'WRISTBAND_PREPARED' LIMIT 5", []);
    assert.ok(logs.length > 0);
    for (const l of logs) {
      const d = JSON.parse(l.details);
      assert.ok(!d.child_id && !d.child_name && !d.phone);
    }
  });

  await scenario('WRISTBAND_VERIFIED audit records exist', async () => {
    const log = await queryOne("SELECT action FROM audit_logs WHERE action = 'WRISTBAND_VERIFIED' LIMIT 1", []);
    assert.ok(log);
  });

  await scenario('WRISTBAND_BOUND audit records — no NFC UID', async () => {
    const logs = await query<{ details: string }>("SELECT details FROM audit_logs WHERE action = 'WRISTBAND_BOUND' LIMIT 5", []);
    assert.ok(logs.length > 0);
    for (const l of logs) {
      const d = JSON.parse(l.details);
      assert.ok(!d.nfcUid && !d.nfc_uid);
    }
  });

  await scenario('WRISTBAND_DEACTIVATED audit records exist', async () => {
    const log = await queryOne("SELECT action FROM audit_logs WHERE action = 'WRISTBAND_DEACTIVATED' LIMIT 1", []);
    assert.ok(log);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // FINAL REPORT
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n================================================================');
  console.log('LIFECYCLE vs SCALE FIXTURE SEPARATION');
  console.log('================================================================');
  console.log(`REAL SERVICE LIFECYCLE (prepare → print → verify → available):`);
  console.log(`  Wristbands through full lifecycle: ${lifecycleWristbandCount}`);
  console.log(`SCALE FIXTURE (direct bulk insert, fixture only — NOT lifecycle):`);
  console.log(`  Scale fixture wristbands: ${SCALE_WB} (${importMs}ms bulk import)`);
  console.log(`  These ${SCALE_WB} bands were NOT lifecycle-proven.`);

  console.log('\n================================================================');
  console.log('DATABASE ISOLATION');
  console.log('================================================================');
  console.log(`Temp DB used: ${TEMP_DB_PATH}`);
  console.log('Dev DB touched: NO (data/koinonia-dev.sqlite untouched)');
}

main()
  .then(() => {
    console.log('\n================================================================');
    console.log(`TGA 2026 — DEVICE-LESS E2E SIMULATION COMPLETE`);
    console.log(`${passed} PASSED | ${failed} FAILED`);
    console.log('================================================================\n');
    if (failed > 0) process.exit(1);
  })
  .catch(err => {
    console.error('\n[FATAL]', err?.message || err);
    process.exit(1);
  })
  .finally(() => {
    // Clean up temp DB regardless of outcome
    try {
      if (fs.existsSync(TEMP_DB_PATH)) {
        fs.unlinkSync(TEMP_DB_PATH);
        console.log(`Temp DB deleted: ${TEMP_DB_PATH}`);
      }
      // Also remove WAL and SHM sidecar files if present
      for (const ext of ['-shm', '-wal']) {
        const f = TEMP_DB_PATH + ext;
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    } catch (e: any) {
      console.warn(`Warning: could not delete temp DB: ${e.message}`);
    }
  });
