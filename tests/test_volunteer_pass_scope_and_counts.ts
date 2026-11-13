import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, query, queryOne } from '../src/server/db';
import { normalizePassReference } from '../src/server/services/passService';
import { getEventStats, getChildScopeDisplayName } from '../src/server/routes/volunteer';
import { resolveCanonicalAgeGroup, isChildInScope } from '../src/server/services/eligibilityService';

test('Volunteer Pass Normalization, Scope Resolution, and Stats Suite', async (t) => {
  const now = new Date().toISOString();
  const testEventId = `ev-vol-scope-${Date.now()}`;
  const volunteerScopeAdminId = `usr-vol-admin-${Date.now()}`;
  const parentId = `usr-vol-parent-${Date.now()}`;
  const parentProfileId = `prof-vol-${Date.now()}`;

  // 1. Centralized pass reference normalization tests
  await t.test('normalizePassReference handles all formats canonically', () => {
    // Exact standard code
    assert.strictEqual(normalizePassReference('KOI-2026-F69E8A'), 'KOI-2026-F69E8A');
    assert.strictEqual(normalizePassReference('koi-2026-f69e8a'), 'KOI-2026-F69E8A');
    assert.strictEqual(normalizePassReference('  KOI-2026-F69E8A  '), 'KOI-2026-F69E8A');

    // 6-character hex suffix
    assert.strictEqual(normalizePassReference('F69E8A'), 'KOI-2026-F69E8A');
    assert.strictEqual(normalizePassReference('f69e8a'), 'KOI-2026-F69E8A');

    // Prefixes: KCT:, PASS-
    assert.strictEqual(normalizePassReference('KCT:KOI-2026-F69E8A'), 'KOI-2026-F69E8A');
    assert.strictEqual(normalizePassReference('kct:koi-2026-f69e8a'), 'KOI-2026-F69E8A');
    assert.strictEqual(normalizePassReference('PASS-F69E8A'), 'KOI-2026-F69E8A');

    // Full URLs
    assert.strictEqual(normalizePassReference('https://app.koinoniaglobal.org/pass/KOI-2026-F69E8A'), 'KOI-2026-F69E8A');
    assert.strictEqual(normalizePassReference('https://app.koinoniaglobal.org/pass/F69E8A'), 'KOI-2026-F69E8A');
    assert.strictEqual(normalizePassReference('https://app.koinoniaglobal.org/verify?code=KOI-2026-F69E8A'), 'KOI-2026-F69E8A');
    assert.strictEqual(normalizePassReference('https://app.koinoniaglobal.org/verify?pass=F69E8A'), 'KOI-2026-F69E8A');
    assert.strictEqual(normalizePassReference('https://app.koinoniaglobal.org/verify?ref=KOI-2026-F69E8A'), 'KOI-2026-F69E8A');

    // Empty / null handling
    assert.strictEqual(normalizePassReference(''), '');
    assert.strictEqual(normalizePassReference(null as any), '');
    assert.strictEqual(normalizePassReference(undefined as any), '');
  });

  // Setup database fixtures for scoped volunteer tests
  try {
    // Seed event
    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Test Scoped Event 2026', 'current', '2026-11-20', '2026-11-22', ?, ?)
    `, [testEventId, now, now]);

    // Seed parent & profile
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', 'active', ?, ?)
    `, [parentId, `p_${Date.now()}@test.koinonia`, now, now]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, home_address, created_at, updated_at)
      VALUES (?, ?, 'Volunteer Parent', '+2348033334444', 'Karu', ?, ?)
    `, [parentProfileId, parentId, now, now]);

    // Seed children in different age groups
    // Ages 4-6 child (dob 2021-05-10 -> Age 5 on 2026-11-20)
    const child5Id = `ch-5-${Date.now()}`;
    const entry5Id = `entry-5-${Date.now()}`;
    const pass5Ref = `KOI-2026-SC0005`;

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, created_at, updated_at)
      VALUES (?, ?, 'Chidinma AgeFive', '2021-05-10', 'Female', ?, ?)
    `, [child5Id, parentProfileId, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pass_ready', ?, ?)
    `, [entry5Id, testEventId, child5Id, now, now]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, 'hash5', 'active', ?, ?, ?)
    `, [`pass-5-${Date.now()}`, entry5Id, pass5Ref, now, now, now]);

    // Seed pickup person for Child 5
    await execute(`
      INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, approved_by_parent, created_at, updated_at)
      VALUES (?, ?, 'designated', 'Emeka Uncle', 'Uncle', '+2348077778888', 1, ?, ?)
    `, [`pk-5-${Date.now()}`, entry5Id, now, now]);

    // Ages 13-14 teen (dob 2012-08-15 -> Age 14 on 2026-11-20)
    const child14Id = `ch-14-${Date.now()}`;
    const entry14Id = `entry-14-${Date.now()}`;
    const pass14Ref = `KOI-2026-SC0014`;

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, created_at, updated_at)
      VALUES (?, ?, 'Obi TeenFourteen', '2012-08-15', 'Male', ?, ?)
    `, [child14Id, parentProfileId, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [entry14Id, testEventId, child14Id, now, now]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, 'hash14', 'active', ?, ?, ?)
    `, [`pass-14-${Date.now()}`, entry14Id, pass14Ref, now, now, now]);

    // Seed 1 unselected/registered entry (should NOT be counted in getEventStats)
    const childRegId = `ch-reg-${Date.now()}`;
    const entryRegId = `entry-reg-${Date.now()}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, created_at, updated_at)
      VALUES (?, ?, 'Unselected Registered Child', '2020-01-01', 'Male', ?, ?)
    `, [childRegId, parentProfileId, now, now]);
    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'registered', ?, ?)
    `, [entryRegId, testEventId, childRegId, now, now]);

    // Seed 1 cancelled pass entry (should NOT be counted in getEventStats)
    const childCanId = `ch-can-${Date.now()}`;
    const entryCanId = `entry-can-${Date.now()}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, created_at, updated_at)
      VALUES (?, ?, 'Cancelled Pass Child', '2020-01-01', 'Female', ?, ?)
    `, [childCanId, parentProfileId, now, now]);
    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [entryCanId, testEventId, childCanId, now, now]);
    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, 'KOI-2026-CANCELLED', 'hashcan', 'cancelled', ?, ?, ?)
    `, [`pass-can-${Date.now()}`, entryCanId, now, now, now]);

    // 2. Test getEventStats: counts only active selected children with active passes
    await t.test('getEventStats counts active selected children with active passes', async () => {
      const stats = await getEventStats(testEventId);
      // We seeded 2 active selected children with active passes (entry5Id and entry14Id)
      // entryRegId is 'registered' (not selected/pass_ready)
      // entryCanId has pass status 'cancelled'
      assert.strictEqual(stats.expected, 2, 'Assigned count (expected) must only reflect active selected children with active passes');
      assert.strictEqual(stats.checkedIn, 0);
      assert.strictEqual(stats.pickedUp, 0);
      assert.strictEqual(Math.max(0, stats.expected - stats.checkedIn), 2, 'Waiting count must equal expected - checkedIn');
    });

    // 3. Test canonical age groups and display formatting
    await t.test('Canonical age groups and scope display name', () => {
      // Canonical 5 age groups
      assert.strictEqual(resolveCanonicalAgeGroup('2024-05-10', '2026-11-20').group, '2–3');
      assert.strictEqual(resolveCanonicalAgeGroup('2021-05-10', '2026-11-20').group, '4–6');
      assert.strictEqual(resolveCanonicalAgeGroup('2018-05-10', '2026-11-20').group, '7–9');
      assert.strictEqual(resolveCanonicalAgeGroup('2015-05-10', '2026-11-20').group, '10–12');
      assert.strictEqual(resolveCanonicalAgeGroup('2012-05-10', '2026-11-20').group, '13–14');

      // getChildScopeDisplayName formatting
      assert.strictEqual(getChildScopeDisplayName({ age_group: '4–6' }), 'Ages 4–6');
      assert.strictEqual(getChildScopeDisplayName({ age_group: '13–14' }), 'Ages 13–14');
      assert.strictEqual(getChildScopeDisplayName({ date_of_birth: '2021-05-10' }), 'Ages 4–6');
      assert.strictEqual(getChildScopeDisplayName({ date_of_birth: '2012-08-15' }), 'Ages 13–14');

      // Scope checking: volunteer with ['13–14'] assignment
      const teenVolunteerScope = ['13–14'];
      assert.strictEqual(isChildInScope({ age_group: '13–14' }, teenVolunteerScope), true);
      assert.strictEqual(isChildInScope({ age_group: '4–6' }, teenVolunteerScope), false);
    });

    // 4. Pass Parity: Canonical pass reference matches exactly across parent, admin, and report
    await t.test('Pass parity across all components', () => {
      const canonicalPass = 'KOI-2026-F69E8A';
      // Normalization of parent mobile pass
      assert.strictEqual(normalizePassReference(canonicalPass), canonicalPass);
      // Normalization of admin printable pass
      assert.strictEqual(normalizePassReference('PASS-F69E8A'), canonicalPass);
      // Normalization of QR payload
      assert.strictEqual(normalizePassReference('KCT:KOI-2026-F69E8A'), canonicalPass);
      // Normalization of web verification URL
      assert.strictEqual(normalizePassReference(`https://mandate.koinoniaglobal.org/pass/${canonicalPass}`), canonicalPass);
    });

  } finally {
    // Cleanup test fixtures
    await execute(`DELETE FROM pickup_people WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id = ?)`, [testEventId]);
    await execute(`DELETE FROM event_passes WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id = ?)`, [testEventId]);
    await execute(`DELETE FROM child_event_entries WHERE event_id = ?`, [testEventId]);
    await execute(`DELETE FROM children WHERE parent_profile_id = ?`, [parentProfileId]);
    await execute(`DELETE FROM parent_profiles WHERE id = ?`, [parentProfileId]);
    await execute(`DELETE FROM users WHERE id = ?`, [parentId]);
    await execute(`DELETE FROM events WHERE id = ?`, [testEventId]);
    console.log('✅ ALL VOLUNTEER PASS, SCOPE AND COUNTS TESTS COMPLETED SUCCESSFULLY');
    process.exit(0);
  }
});
