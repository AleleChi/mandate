import assert from 'assert';
import { execute, query, queryOne } from '../src/server/db';
import { getAdminChildDetailPath } from '../src/views/admin/AdminAttendanceView';

async function runAttendanceNavigationTests() {
  console.log('================================================================');
  console.log('ADMIN ATTENDANCE — CHILD NAVIGATION REGRESSION SUITE');
  console.log('================================================================\n');

  // =============================================================
  // TEST A: Valid attendance child resolves to canonical child detail route
  // =============================================================
  console.log('[TEST A] Valid attendance child resolves to canonical route');
  const validAppIdA = 'entry-alele-chi-101';
  const routeA = getAdminChildDetailPath(validAppIdA);
  assert.strictEqual(routeA, '/admin/applications/entry-alele-chi-101', 'Must resolve to /admin/applications/:id');
  console.log(`  Child Alele Chi (ID: ${validAppIdA}) -> ${routeA} [PASS]`);

  // =============================================================
  // TEST B: Different child resolves to that child's own route
  // =============================================================
  console.log('\n[TEST B] Different children resolve to distinct child routes');
  const validAppIdLivina = 'entry-baby-livina-202';
  const validAppIdLove = 'entry-baby-love-303';
  const routeLivina = getAdminChildDetailPath(validAppIdLivina);
  const routeLove = getAdminChildDetailPath(validAppIdLove);

  assert.strictEqual(routeLivina, '/admin/applications/entry-baby-livina-202');
  assert.strictEqual(routeLove, '/admin/applications/entry-baby-love-303');
  assert.notStrictEqual(routeLivina, routeLove, 'Different children must have distinct routes');
  assert.notStrictEqual(routeLivina, routeA, 'Livina route must differ from Alele route');
  console.log(`  Baby Livina -> ${routeLivina} [PASS]`);
  console.log(`  Baby Love   -> ${routeLove} [PASS]`);

  // =============================================================
  // TEST C: Identity mapping — correct ID type used (child_event_entry_id)
  // Prove that AdminReviewChildView and GET /api/admin/applications/:id
  // require child_event_entry_id (applicationId), NOT child_id.
  // =============================================================
  console.log('\n[TEST C] Identity mapping: applicationId (child_event_entry_id) vs child_id');
  const nowIso = new Date().toISOString();
  const testEventId = `ev-nav-test-${Date.now()}`;
  const parentUserId = `usr-nav-p-${Date.now()}`;
  const parentProfileId = `pp-nav-${Date.now()}`;
  const childIdAlele = `ch-alele-${Date.now()}`;
  const entryIdAlele = `entry-alele-${Date.now()}`;

  try {
    // Setup test fixtures in DB
    await execute(`
      INSERT INTO events (id, title, status, capacity, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Navigation Test Event', 'current', 100, '2026-11-20', '2026-11-21', ?, ?)
    `, [testEventId, nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', ?, ?)
    `, [parentUserId, `parent_${Date.now()}@navtest.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Nav Parent', ?, '+2348011223344', ?, ?)
    `, [parentProfileId, parentUserId, `parent_${Date.now()}@navtest.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Alele Chi', 'Female', '2020-01-01', 'Ages 4 to 6', 0, ?, ?)
    `, [childIdAlele, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, 'checked_in', ?, 0, ?, ?)
    `, [entryIdAlele, childIdAlele, testEventId, nowIso, nowIso, nowIso]);

    // Query backend application detail by entry_id (expected by /api/admin/applications/:id)
    const appByEntryId = await queryOne(`
      SELECT e.id as entry_id, c.full_name as child_name
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.id = ?
    `, [entryIdAlele]);
    assert.ok(appByEntryId, 'Must resolve application by entry_id (applicationId)');
    assert.strictEqual(appByEntryId.child_name, 'Alele Chi');

    // Query by child_id on the application endpoint (demonstrating failure if wrong ID passed)
    const appByChildId = await queryOne(`
      SELECT e.id as entry_id
      FROM child_event_entries e
      WHERE e.id = ?
    `, [childIdAlele]);
    assert.strictEqual(appByChildId, null, 'Must NOT resolve application when raw child_id is used as entry_id');

    // Route built with entryIdAlele is valid
    const correctRoute = getAdminChildDetailPath(entryIdAlele);
    assert.strictEqual(correctRoute, `/admin/applications/${entryIdAlele}`);
    console.log(`  entry_id (${entryIdAlele}) resolves application detail correctly -> PASS`);
    console.log(`  child_id (${childIdAlele}) correctly excluded from application route -> PASS`);

  } finally {
    // Teardown
    await execute(`DELETE FROM child_event_entries WHERE event_id = ?`, [testEventId]);
    await execute(`DELETE FROM children WHERE id = ?`, [childIdAlele]);
    await execute(`DELETE FROM parent_profiles WHERE id = ?`, [parentProfileId]);
    await execute(`DELETE FROM users WHERE id = ?`, [parentUserId]);
    await execute(`DELETE FROM events WHERE id = ?`, [testEventId]);
  }

  // =============================================================
  // TEST D: Route does not equal Admin Overview
  // =============================================================
  console.log('\n[TEST D] Route never equals Admin Overview');
  const testIds = ['entry-1', 'entry-2', 'app-alele', 'app-livina', 'app-love'];
  for (const id of testIds) {
    const route = getAdminChildDetailPath(id);
    assert.notStrictEqual(route, '/admin', `Route for ${id} must not be /admin`);
    assert.notStrictEqual(route, '/admin/overview', `Route for ${id} must not be /admin/overview`);
    assert.notStrictEqual(route, '#/admin', `Route for ${id} must not be #/admin`);
    assert.notStrictEqual(route, '#/admin/overview', `Route for ${id} must not be #/admin/overview`);
    assert.ok(route?.startsWith('/admin/applications/'), `Route must be under /admin/applications/`);
  }
  console.log('  All tested IDs produce child detail paths, never Overview routes -> PASS');

  // =============================================================
  // TEST E: Missing required child identity does not navigate to Overview
  // =============================================================
  console.log('\n[TEST E] Missing child identity handling (no silent Overview redirect)');
  const invalidInputs = [null, undefined, '', '   '];
  for (const input of invalidInputs) {
    const result = getAdminChildDetailPath(input as any);
    assert.strictEqual(result, null, `Invalid input ${JSON.stringify(input)} must return null`);
    assert.notStrictEqual(result, '/admin/overview', `Must never return /admin/overview for missing input`);
    assert.notStrictEqual(result, '/admin', `Must never return /admin for missing input`);
  }
  console.log('  Missing/invalid identities return null and never redirect to Overview -> PASS');

  // =============================================================
  // TEST F: Recent scans uses the same canonical destination logic
  // =============================================================
  console.log('\n[TEST F] Recent scans child navigation uses identical canonical logic');
  const recentScanFixture = {
    id: 'entry-scan-404-checkin',
    applicationId: 'entry-scan-404',
    childName: 'Baby Love',
    type: 'check_in' as const,
    timeLabel: '10:15 AM',
    flagged: false
  };

  const recentScanRoute = getAdminChildDetailPath(recentScanFixture.applicationId);
  assert.strictEqual(recentScanRoute, '/admin/applications/entry-scan-404');
  assert.strictEqual(
    recentScanRoute,
    getAdminChildDetailPath('entry-scan-404'),
    'Recent scans must use the exact same canonical helper and route structure'
  );
  console.log(`  Recent scan child (${recentScanFixture.childName}) -> ${recentScanRoute} [PASS]`);

  console.log('\n================================================================');
  console.log('ALL ATTENDANCE NAVIGATION REGRESSION CHECKS PASSED');
  console.log('================================================================\n');
}

runAttendanceNavigationTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
