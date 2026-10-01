import assert from 'node:assert';
import {
  assertCanProvisionWristband,
  assertCanBindWristband,
  assertCanManageWristbandReplacements,
  WristbandDomainError
} from '../src/server/services/wristbandService';
import { isValidRoute, getInitialRoute } from '../src/utils/router';
import { query, queryOne, execute } from '../src/server/db';

async function runTests() {
  console.log('=== TGA 2026 PRE-RELEASE CORRECTIONS TEST SUITE ===\n');
  let passed = 0;

  // ----------------------------------------------------
  // 1. RBAC & SUPER_ADMIN CANONICAL ROLE VERIFICATION
  // ----------------------------------------------------
  console.log('--- 1. RBAC & CANONICAL SUPER_ADMIN TESTS ---');

  const adminActor = { id: 'usr-admin-test', role: 'admin' };
  const superAdminActor = { id: 'usr-super-test', role: 'super_admin' };
  const volunteerActor = { id: 'usr-vol-test', role: 'volunteer' };
  const nonCanonicalActor = { id: 'usr-old-test', role: 'superadmin' };

  // 1.1 assertCanProvisionWristband
  // Admin allowed
  assert.doesNotThrow(() => assertCanProvisionWristband(adminActor));
  console.log('  [PASS] assertCanProvisionWristband: Admin allowed');
  passed++;

  // Super Admin allowed
  assert.doesNotThrow(() => assertCanProvisionWristband(superAdminActor));
  console.log('  [PASS] assertCanProvisionWristband: Super Admin (super_admin) allowed');
  passed++;

  // Ordinary Volunteer blocked with 403
  assert.throws(
    () => assertCanProvisionWristband(volunteerActor),
    (err: any) => err instanceof WristbandDomainError && err.status === 403
  );
  console.log('  [PASS] assertCanProvisionWristband: Ordinary volunteer blocked (403)');
  passed++;

  // Non-canonical 'superadmin' blocked with 403
  assert.throws(
    () => assertCanProvisionWristband(nonCanonicalActor),
    (err: any) => err instanceof WristbandDomainError && err.status === 403
  );
  console.log('  [PASS] assertCanProvisionWristband: Non-canonical "superadmin" blocked (403)');
  passed++;

  // 1.2 assertCanBindWristband
  // Admin allowed (synchronous return without DB call)
  await assert.doesNotReject(async () => await assertCanBindWristband(adminActor, 'ev-any'));
  console.log('  [PASS] assertCanBindWristband: Admin allowed');
  passed++;

  // Super Admin allowed (synchronous return without DB call)
  await assert.doesNotReject(async () => await assertCanBindWristband(superAdminActor, 'ev-any'));
  console.log('  [PASS] assertCanBindWristband: Super Admin (super_admin) allowed');
  passed++;

  // 1.3 assertCanManageWristbandReplacements
  // Admin allowed
  await assert.doesNotReject(async () => await assertCanManageWristbandReplacements(adminActor, 'ev-any'));
  console.log('  [PASS] assertCanManageWristbandReplacements: Admin allowed');
  passed++;

  // Super Admin allowed
  await assert.doesNotReject(async () => await assertCanManageWristbandReplacements(superAdminActor, 'ev-any'));
  console.log('  [PASS] assertCanManageWristbandReplacements: Super Admin (super_admin) allowed');
  passed++;

  // Ordinary Volunteer blocked with 403
  await assert.rejects(
    async () => await assertCanManageWristbandReplacements(volunteerActor, 'ev-any'),
    (err: any) => err instanceof WristbandDomainError && err.status === 403
  );
  console.log('  [PASS] assertCanManageWristbandReplacements: Ordinary volunteer blocked (403)');
  passed++;

  // ----------------------------------------------------
  // 2. SQLITE SCHEMA PARITY & ELIGIBILITY VERIFICATION
  // ----------------------------------------------------
  console.log('\n--- 2. SQLITE EVENT ELIGIBILITY PARITY TESTS ---');

  // PRAGMA table_info to inspect SQLite columns
  const tableInfo = await query<{ cid: number; name: string; type: string; notnull: number; dflt_value: any }>(
    "PRAGMA table_info(events)"
  );

  const minAgeCol = tableInfo.find(c => c.name === 'minimum_age');
  const maxAgeCol = tableInfo.find(c => c.name === 'maximum_age');

  assert.ok(minAgeCol, 'events.minimum_age must exist in SQLite schema');
  assert.strictEqual(minAgeCol.notnull, 0, 'events.minimum_age must be nullable');
  console.log('  [PASS] events.minimum_age exists and is nullable (INTEGER, notnull=0)');
  passed++;

  assert.ok(maxAgeCol, 'events.maximum_age must exist in SQLite schema');
  assert.strictEqual(maxAgeCol.notnull, 0, 'events.maximum_age must be nullable');
  console.log('  [PASS] events.maximum_age exists and is nullable (INTEGER, notnull=0)');
  passed++;

  // Historical event unrestricted when NULL
  const testEventId = `ev-parity-${Date.now()}`;
  const nowIso = new Date().toISOString();
  await execute(
    `INSERT INTO events (id, title, status, minimum_age, maximum_age, created_at, updated_at)
     VALUES (?, 'Eligibility Parity Event', 'open', NULL, NULL, ?, ?)`,
    [testEventId, nowIso, nowIso]
  );

  const inserted = await queryOne<{ minimum_age: number | null; maximum_age: number | null }>(
    'SELECT minimum_age, maximum_age FROM events WHERE id = ?',
    [testEventId]
  );
  assert.strictEqual(inserted?.minimum_age, null, 'NULL minimum_age preserved');
  assert.strictEqual(inserted?.maximum_age, null, 'NULL maximum_age preserved');
  console.log('  [PASS] Historical/unrestricted events preserve NULL minimum_age and maximum_age');
  passed++;

  // Clean up test event
  await execute('DELETE FROM events WHERE id = ?', [testEventId]);

  // ----------------------------------------------------
  // 3. ROUTING & DUPLICATE HASH PREVENTION VERIFICATION
  // ----------------------------------------------------
  console.log('\n--- 3. ROUTING & DUPLICATE HASH PREVENTION TESTS ---');

  // Test isValidRoute
  assert.strictEqual(isValidRoute('/parent/home'), true);
  assert.strictEqual(isValidRoute('/admin/wristbands'), true);
  assert.strictEqual(isValidRoute('/admin/wristbands/inventory'), true);
  assert.strictEqual(isValidRoute('/volunteer/event'), true);
  assert.strictEqual(isValidRoute('/volunteer/wristbands'), true);
  assert.strictEqual(isValidRoute('/parent/status/child-123'), true);
  assert.strictEqual(isValidRoute('/invalid/garbage/route'), false);
  console.log('  [PASS] isValidRoute correctly validates clean routes including /admin/wristbands/inventory');
  passed++;

  // Test getInitialRoute behavior in Node (simulating window.location)
  // Clean pathname
  (global as any).window = {
    location: {
      pathname: '/parent/home',
      hash: '',
      search: ''
    }
  };
  assert.strictEqual(getInitialRoute(), '/parent/home');
  console.log('  [PASS] Clean pathname produces /parent/home without hash');
  passed++;

  // Duplicate path + hash in URL
  (global as any).window = {
    location: {
      pathname: '/parent/home',
      hash: '#/parent/home',
      search: ''
    }
  };
  assert.strictEqual(getInitialRoute(), '/parent/home');
  console.log('  [PASS] Duplicate path + hash (/parent/home#/parent/home) resolves cleanly to /parent/home');
  passed++;

  // Legacy hash route (/#/parent/home)
  (global as any).window = {
    location: {
      pathname: '/',
      hash: '#/parent/home',
      search: ''
    }
  };
  assert.strictEqual(getInitialRoute(), '/parent/home');
  console.log('  [PASS] Legacy hash route (/#/parent/home) resolves cleanly to /parent/home');
  passed++;

  // Admin wristbands clean route
  (global as any).window = {
    location: {
      pathname: '/admin/wristbands',
      hash: '',
      search: ''
    }
  };
  assert.strictEqual(getInitialRoute(), '/admin/wristbands');
  console.log('  [PASS] /admin/wristbands clean route preserved');
  passed++;

  // Admin wristbands inventory clean route
  (global as any).window = {
    location: {
      pathname: '/admin/wristbands/inventory',
      hash: '',
      search: ''
    }
  };
  assert.strictEqual(getInitialRoute(), '/admin/wristbands/inventory');
  console.log('  [PASS] /admin/wristbands/inventory clean route preserved');
  passed++;

  // Volunteer clean route
  (global as any).window = {
    location: {
      pathname: '/volunteer/wristbands',
      hash: '',
      search: ''
    }
  };
  assert.strictEqual(getInitialRoute(), '/volunteer/wristbands');
  console.log('  [PASS] /volunteer/wristbands clean route preserved');
  passed++;

  delete (global as any).window;

  console.log(`\n=== ALL ${passed}/${passed} PRE-RELEASE CORRECTION TESTS PASSED ===`);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
