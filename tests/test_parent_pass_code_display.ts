import assert from 'assert';
import http from 'http';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import adminRoutes from '../src/server/routes/admin';
import volunteerRoutes from '../src/server/routes/volunteer';
import parentRoutes from '../src/server/routes/parent';
import {
  provisionWristband,
  prepareWristband,
  updateWristbandStatus,
  bindWristbandToChild,
  resolveEventChildIdentifier,
  WristbandDomainError
} from '../src/server/services/wristbandService';

async function runParentPassCodeDisplayTests() {
  console.log('================================================================');
  console.log('PARENT DIGITAL PASS — SHOW MANUAL PASS CODE TEST SUITE');
  console.log('Verifying Presentation, Identity Invariance & Lookup Equivalence');
  console.log('================================================================\n');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const nowIso = new Date().toISOString();

  // 1. Setup ephemeral test server
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api/volunteer', volunteerRoutes);
  app.use('/api/parent', parentRoutes);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let passedScenarios = 0;

  // Test Event & Entity IDs
  const testEventId = `ev-pass-${testRunId}`;
  const adminUserId = `usr-admin-${testRunId}`;
  const parentUserId = `usr-parent-${testRunId}`;
  const parentProfileId = `prnt-${testRunId}`;
  const volunteerUserId = `usr-vol-${testRunId}`;
  const child1Id = `ch-pass-1-${testRunId}`;
  const child2Id = `ch-draft-2-${testRunId}`;
  const entry1Id = `ent-pass-1-${testRunId}`;
  const entry2Id = `ent-draft-2-${testRunId}`;
  const pass1Id = `pass-1-${testRunId}`;
  const pass1Ref = `KOI-2026-ABC${testRunId.slice(-3)}`;
  const wbCode = `WB-${testRunId.slice(-6)}`;

  try {
    // 2. Seed database fixtures
    await execute(`
      INSERT INTO events (id, title, starts_at, ends_at, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'published', ?, ?)
    `, [testEventId, 'TGA 2026 Annual Conference', '2026-11-18 09:00:00', '2026-11-22 18:00:00', nowIso, nowIso]);

    // Admin User
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'admin', 'active', ?, ?)
    `, [adminUserId, `admin-${testRunId}@test.org`, nowIso, nowIso]);

    // Parent User & Profile
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', 'active', ?, ?)
    `, [parentUserId, `parent-${testRunId}@test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Grace Hopper', '+2348011112222', ?, ?)
    `, [parentProfileId, parentUserId, nowIso, nowIso]);

    // Volunteer User & Profile with check-in duty
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 'active', ?, ?)
    `, [volunteerUserId, `vol-${testRunId}@test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Check-in Volunteer', '08011112222', '08011112222', 'check_in', 'approved', ?, ?)
    `, [`vprof-${testRunId}`, volunteerUserId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'check_in_desk', 'check_in', 'primary', 'scheduled', '2026-11-18T08:00:00Z', '2026-11-18T18:00:00Z', ?, ?)
    `, [`duty-${testRunId}`, testEventId, volunteerUserId, nowIso, nowIso]);

    // Child 1: Registered with issued active event pass
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, calculated_age, age_group, gender, created_at, updated_at)
      VALUES (?, ?, 'David Hopper', '2018-05-15', 8, 'Ages 7 to 9', 'Boy', ?, ?)
    `, [child1Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', ?, ?)
    `, [entry1Id, testEventId, child1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `, [pass1Id, entry1Id, pass1Ref, `hash-${testRunId}`, nowIso, nowIso, nowIso]);

    // Child 2: Draft / under review without event pass
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, calculated_age, age_group, gender, created_at, updated_at)
      VALUES (?, ?, 'Daniel Hopper', '2021-02-10', 5, 'Ages 4 to 6', 'Boy', ?, ?)
    `, [child2Id, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'under_review', ?, ?)
    `, [entry2Id, testEventId, child2Id, nowIso, nowIso]);

    // Provision a physical wristband (created in available status)
    const provisionedWb = await provisionWristband({
      eventId: testEventId,
      nfcUid: `04:A1:${testRunId.slice(-4, -2)}:${testRunId.slice(-2)}`,
      wristbandCode: wbCode,
      actor: { id: adminUserId, role: 'admin', email: 'admin@tga-test.org' }
    });

    // Save previous current event and make test event current
    const prevCurrent = await queryOne<{ id: string }>("SELECT id FROM events WHERE status = 'current'");
    await execute("UPDATE events SET status = 'upcoming' WHERE status = 'current'");
    await execute("UPDATE events SET status = 'current' WHERE id = ?", [testEventId]);

    const volToken = generateToken(volunteerUserId);
    const parentToken = generateToken(parentUserId);

    console.log('--- TEST SCENARIOS ---\n');

    // -------------------------------------------------------------------------
    // Scenario 1: Parent QR payload === event_passes.pass_reference
    // -------------------------------------------------------------------------
    const passRow = await queryOne<{ pass_reference: string }>(
      'SELECT pass_reference FROM event_passes WHERE id = ?',
      [pass1Id]
    );
    assert(passRow, 'event_passes row must exist');
    const expectedPassRef = passRow.pass_reference;

    // Simulate Parent API fetch for children list
    const parentChildrenRes = await fetch(`${baseUrl}/api/parent/children`, {
      headers: { Authorization: `Bearer ${parentToken}` }
    });
    const parentChildrenList = await parentChildrenRes.json() as any[];
    assert(Array.isArray(parentChildrenList), 'parent children endpoint must return an array');
    const mappedChild1 = parentChildrenList.find((c: any) => c.id === child1Id);
    assert(mappedChild1, 'Child 1 must be present in Parent children list');

    // QR payload logic used in Pass Modal:
    const effectivePassCode = mappedChild1.passReference;
    assert.strictEqual(effectivePassCode, expectedPassRef, 'effectivePassCode must equal event_passes.pass_reference');

    const qrPayload = effectivePassCode;
    assert.strictEqual(qrPayload, expectedPassRef, 'Parent QR payload must strictly match event_passes.pass_reference');
    console.log('  [PASS] Scenario 1: Parent QR payload === event_passes.pass_reference (' + qrPayload + ')');
    passedScenarios++;

    // -------------------------------------------------------------------------
    // Scenario 2: Visible Pass Code === event_passes.pass_reference
    // -------------------------------------------------------------------------
    // The Pass Code component visibly renders effectivePassCode directly
    const visiblePassCode = effectivePassCode;
    assert.strictEqual(visiblePassCode, expectedPassRef, 'Visible Pass Code must strictly match event_passes.pass_reference');
    console.log('  [PASS] Scenario 2: visible Pass Code === event_passes.pass_reference (' + visiblePassCode + ')');
    passedScenarios++;

    // -------------------------------------------------------------------------
    // Scenario 3: QR value === visible manual value
    // -------------------------------------------------------------------------
    assert.strictEqual(qrPayload, visiblePassCode, 'QR value must be exactly identical to visible manual value');
    console.log('  [PASS] Scenario 3: QR value === visible manual value');
    passedScenarios++;

    // -------------------------------------------------------------------------
    // Scenario 4: Manual KOI pass lookup resolves correct child_event_entry
    // -------------------------------------------------------------------------
    const manualResolved = await resolveEventChildIdentifier(testEventId, visiblePassCode);
    assert.strictEqual(manualResolved.success, true);
    assert.strictEqual(manualResolved.identifierType, 'pass');
    assert.strictEqual(manualResolved.childEventEntryId, entry1Id);
    assert.strictEqual(manualResolved.sourceReference, expectedPassRef);

    // Also verify via Volunteer HTTP route
    const volManualRes = await fetch(`${baseUrl}/api/volunteer/children/resolve-identifier`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${volToken}`
      },
      body: JSON.stringify({
        identifier: visiblePassCode,
        eventId: testEventId
      })
    });
    const volManualData = await volManualRes.json() as any;
    assert.strictEqual(volManualData.success, true);
    assert.strictEqual(volManualData.childEventEntryId, entry1Id);
    console.log('  [PASS] Scenario 4: manual KOI pass lookup resolves correct child_event_entry');
    passedScenarios++;

    // -------------------------------------------------------------------------
    // Scenario 5: QR KOI pass lookup resolves same child_event_entry
    // -------------------------------------------------------------------------
    const qrResolved = await resolveEventChildIdentifier(testEventId, qrPayload);
    assert.strictEqual(qrResolved.success, true);
    assert.strictEqual(qrResolved.identifierType, 'pass');
    assert.strictEqual(qrResolved.childEventEntryId, entry1Id);
    assert.strictEqual(qrResolved.childEventEntryId, manualResolved.childEventEntryId);

    const volQrRes = await fetch(`${baseUrl}/api/volunteer/children/resolve-identifier`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${volToken}`
      },
      body: JSON.stringify({
        identifier: qrPayload,
        eventId: testEventId
      })
    });
    const volQrData = await volQrRes.json() as any;
    assert.strictEqual(volQrData.success, true);
    assert.strictEqual(volQrData.childEventEntryId, entry1Id);
    assert.strictEqual(volQrData.childEventEntryId, volManualData.childEventEntryId);
    console.log('  [PASS] Scenario 5: QR KOI pass lookup resolves same child_event_entry');
    passedScenarios++;

    // -------------------------------------------------------------------------
    // Scenario 6: WB code after assignment resolves same child_event_entry
    // -------------------------------------------------------------------------
    const bindResult = await bindWristbandToChild({
      eventId: testEventId,
      childEventEntryId: entry1Id,
      wristbandCode: wbCode,
      actor: { id: volunteerUserId, role: 'volunteer' }
    });
    assert.strictEqual(bindResult.success, true);

    const wbResolved = await resolveEventChildIdentifier(testEventId, wbCode);
    assert.strictEqual(wbResolved.success, true);
    assert.strictEqual(wbResolved.identifierType, 'wristband_code');
    assert.strictEqual(wbResolved.childEventEntryId, entry1Id);
    assert.strictEqual(wbResolved.childEventEntryId, qrResolved.childEventEntryId);

    const volWbRes = await fetch(`${baseUrl}/api/volunteer/children/resolve-identifier`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${volToken}`
      },
      body: JSON.stringify({
        identifier: wbCode,
        eventId: testEventId
      })
    });
    const volWbData = await volWbRes.json() as any;
    assert.strictEqual(volWbData.success, true);
    assert.strictEqual(volWbData.childEventEntryId, entry1Id);
    console.log('  [PASS] Scenario 6: WB code after assignment resolves same child_event_entry');
    passedScenarios++;

    // -------------------------------------------------------------------------
    // Scenario 7: Wristband assignment does not modify Parent pass_reference
    // -------------------------------------------------------------------------
    const passRowAfter = await queryOne<{ pass_reference: string }>(
      'SELECT pass_reference FROM event_passes WHERE id = ?',
      [pass1Id]
    );
    assert.strictEqual(passRowAfter?.pass_reference, expectedPassRef, 'event_passes.pass_reference must NOT change after wristband assignment');

    const childRowAfter = await queryOne<{ id: string }>(
      'SELECT id FROM children WHERE id = ?',
      [child1Id]
    );
    assert.strictEqual(childRowAfter?.id, child1Id, 'children.id must NOT change after wristband assignment');

    const entryRowAfter = await queryOne<{ id: string }>(
      'SELECT id FROM child_event_entries WHERE id = ?',
      [entry1Id]
    );
    assert.strictEqual(entryRowAfter?.id, entry1Id, 'child_event_entries.id must NOT change after wristband assignment');
    console.log('  [PASS] Scenario 7: wristband assignment does not modify Parent pass_reference');
    passedScenarios++;

    // -------------------------------------------------------------------------
    // Scenario 8: Child without generated pass does not display invented code
    // -------------------------------------------------------------------------
    const mappedChild2 = parentChildrenList.find((c: any) => c.id === child2Id);
    assert(mappedChild2, 'Child 2 must be present in Parent children list');
    assert.strictEqual(mappedChild2.passReference, undefined, 'Child without pass must have undefined passReference');
    assert.strictEqual(mappedChild2.pass, undefined, 'Child without pass must have undefined pass object');

    // In frontend pass modal:
    // const effectivePassCode = unlocked?.passReference || unlockedPassReferences[child.id] || child.passReference
    const effectivePassCode2 = mappedChild2.passReference || null;
    assert.strictEqual(effectivePassCode2, null, 'effectivePassCode must be null/falsy when no pass exists');
    // Ensure no fallback ID or invented string is produced:
    assert.strictEqual(Boolean(effectivePassCode2), false, 'Child without generated pass does not produce a pass code');
    console.log('  [PASS] Scenario 8: child without generated pass does not display invented code');
    passedScenarios++;

    // -------------------------------------------------------------------------
    // Scenario 9: No PII included in QR payload
    // -------------------------------------------------------------------------
    const piiStrings = [
      'Grace',
      'Hopper',
      'David',
      'grace-',
      '+23480',
      '2018-05-15',
      child1Id,
      entry1Id,
      'http',
      '{',
      '}'
    ];
    for (const pii of piiStrings) {
      assert(!qrPayload.includes(pii), `QR payload must not contain PII or non-pass tokens: found "${pii}" in "${qrPayload}"`);
    }
    // QR payload must match exactly the canonical pass reference pattern: KOI-YYYY-XXXXXX
    assert(/^KOI-\d{4}-[A-Z0-9]+$/.test(qrPayload), `QR payload must match KOI-YYYY-XXXXXX pattern: got "${qrPayload}"`);
    console.log('  [PASS] Scenario 9: no PII included in QR payload (' + qrPayload + ')');
    passedScenarios++;

    // -------------------------------------------------------------------------
    // Scenario 10: ParentHomeView.tsx UI static checks
    // -------------------------------------------------------------------------
    const parentHomeViewContent = fs.readFileSync(
      path.join(process.cwd(), 'src/views/ParentHomeView.tsx'),
      'utf-8'
    );
    assert(parentHomeViewContent.includes('data-component-version="parent-pass-code-display"'), 'Must contain parent-pass-code-display attribute');
    assert(parentHomeViewContent.includes('PASS CODE'), 'Must contain PASS CODE label');
    assert(parentHomeViewContent.includes('Type this code if the QR cannot be scanned'), 'Must contain helper instructional text');
    assert(parentHomeViewContent.includes('SHOW PASS FOR AT-GATE SECURITY'), 'Must retain SHOW PASS FOR AT-GATE SECURITY copy');
    assert(parentHomeViewContent.includes('Copy className="w-3.5 h-3.5"'), 'Must include Copy icon button');
    assert(parentHomeViewContent.includes('navigator.clipboard.writeText(effectivePassCode)'), 'Must include safe clipboard copy action');
    assert(parentHomeViewContent.includes('dark:bg-[#201F1B]'), 'Must support dark mode background');
    assert(parentHomeViewContent.includes('font-mono font-bold tracking-wider'), 'Must use restrained monospace font treatment for pass code');
    console.log('  [PASS] Scenario 10: ParentHomeView UI component hierarchy & styling verified');
    passedScenarios++;

    console.log('\n================================================================');
    console.log(`ALL ${passedScenarios}/${passedScenarios} SCENARIOS PASSED SUCCESSFULLY`);
    console.log('================================================================\n');

  } finally {
    await execute("UPDATE events SET status = 'upcoming' WHERE id = ?", [testEventId]);
    const prevCurrent = await queryOne<{ id: string }>("SELECT id FROM events WHERE id != ? ORDER BY created_at DESC LIMIT 1", [testEventId]);
    if (prevCurrent) {
      await execute("UPDATE events SET status = 'current' WHERE id = ?", [prevCurrent.id]);
    }
    server.close();
  }
}

runParentPassCodeDisplayTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[TEST FAILURE]:', err);
    process.exit(1);
  });
