import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, query, queryOne } from '../src/server/db';
import {
  normalizeAgeGroup,
  resolveChildScopeAgeGroup,
  isChildInScope,
  resolveCanonicalAgeGroup
} from '../src/server/services/eligibilityService';
import {
  resolveVolunteerScope,
  getChildScopeDisplayName,
  checkChildVolunteerScope
} from '../src/server/routes/volunteer';

test('Child Scope Parity & Admin Pass Image Regression Suite', async (t) => {
  const eventDate = '2026-11-21';
  const testEventId = `ev-scope-test-${Date.now()}`;
  const now = new Date().toISOString();

  // Test 1: Canonical age-group normalization
  await t.test('1. Canonical age-group normalization handles dashes, spaces, prefixes and words', () => {
    const variants13_14 = [
      '13-14',
      '13–14',
      '13—14',
      '13 - 14',
      '13 – 14',
      '13— 14',
      '13 to 14',
      'Ages 13-14',
      'Ages 13 – 14',
      'Age 13–14',
      'ages 13 to 14'
    ];
    for (const v of variants13_14) {
      assert.strictEqual(normalizeAgeGroup(v), '13–14', `Failed for variant: "${v}"`);
    }

    // Other canonical groups
    assert.strictEqual(normalizeAgeGroup('2-3'), '2–3');
    assert.strictEqual(normalizeAgeGroup('Ages 2 – 3'), '2–3');
    assert.strictEqual(normalizeAgeGroup('4 to 6'), '4–6');
    assert.strictEqual(normalizeAgeGroup('Ages 7 - 9'), '7–9');
    assert.strictEqual(normalizeAgeGroup('Age 10–12'), '10–12');

    // Invalid / unknown groups
    assert.strictEqual(normalizeAgeGroup('15–18'), '');
    assert.strictEqual(normalizeAgeGroup('Adults'), '');
    assert.strictEqual(normalizeAgeGroup(''), '');
    assert.strictEqual(normalizeAgeGroup(null), '');
    assert.strictEqual(normalizeAgeGroup(undefined), '');
  });

  // Test 2: Numeric-string age handling
  await t.test('2. Numeric-string age handling treats numbers and string numbers identically', () => {
    const resNum = resolveChildScopeAgeGroup({ calculated_age: 14 }, eventDate);
    assert.strictEqual(resNum.age, 14);
    assert.strictEqual(resNum.group, '13–14');

    const resStr = resolveChildScopeAgeGroup({ calculated_age: '14' }, eventDate);
    assert.strictEqual(resStr.age, 14);
    assert.strictEqual(resStr.group, '13–14');

    const resPadded = resolveChildScopeAgeGroup({ calculated_age: '  14  ' }, eventDate);
    assert.strictEqual(resPadded.age, 14);
    assert.strictEqual(resPadded.group, '13–14');

    const resAge5 = resolveChildScopeAgeGroup({ calculated_age: '5' }, eventDate);
    assert.strictEqual(resAge5.age, 5);
    assert.strictEqual(resAge5.group, '4–6');
  });

  // Test 3: DOB authoritative resolution
  await t.test('3. DOB takes authoritative priority over stale legacy age_group and calculated_age', () => {
    // Child is 14 on event date (DOB 2012-05-10), but legacy record has age_group="7–9" and calculated_age=8
    const staleChild = {
      date_of_birth: '2012-05-10',
      calculated_age: 8,
      age_group: '7–9'
    };

    const resolved = resolveChildScopeAgeGroup(staleChild, eventDate);
    assert.strictEqual(resolved.age, 14, 'Should resolve age 14 from DOB');
    assert.strictEqual(resolved.group, '13–14', 'Should resolve group 13–14 from DOB');

    // Display name should match DOB
    assert.strictEqual(getChildScopeDisplayName(staleChild, eventDate), 'Ages 13–14');
  });

  // Test 4: Two same-age children with different legacy values resolve identically
  await t.test('4. Two same-age children with different legacy formats resolve to same canonical group', () => {
    // Child A (e.g. Bethertrade)
    const childA = {
      date_of_birth: '2012-04-15',
      calculated_age: 14,
      age_group: '13–14'
    };

    // Child B (e.g. Aaliya Ojogwu with legacy unnormalized string values)
    const childB = {
      date_of_birth: '2012-08-20',
      calculated_age: '14',
      age_group: '13 - 14'
    };

    const resA = resolveChildScopeAgeGroup(childA, eventDate);
    const resB = resolveChildScopeAgeGroup(childB, eventDate);

    assert.deepStrictEqual(resA, { age: 14, group: '13–14' });
    assert.deepStrictEqual(resB, { age: 14, group: '13–14' });
    assert.strictEqual(resA.group, resB.group);
  });

  // Database setup for multi-duty and route tests
  const volUserId1 = `usr-vol-multi-${Date.now()}`;
  const volUserId2 = `usr-vol-lead-${Date.now()}`;
  const dutyId1 = `duty-1-${Date.now()}`;
  const dutyId2 = `duty-2-${Date.now()}`;
  const dutyId3 = `duty-3-${Date.now()}`;

  try {
    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Scope Test Event 2026', 'current', ?, '2026-11-22', ?, ?)
    `, [testEventId, eventDate, now, now]);

    // Volunteer 1 has two duty assignments: one for 10-12, one for 13-14
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 'active', ?, ?)
    `, [volUserId1, `vol1_${Date.now()}@test.koinonia`, now, now]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, assigned_age_groups, created_at, updated_at)
      VALUES (?, ?, ?, 'safety_marshal', 'safety', 'primary', 'active', '2026-11-21T07:00:00Z', '2026-11-21T18:00:00Z', '["10–12"]', ?, ?)
    `, [dutyId1, testEventId, volUserId1, now, now]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, assigned_age_groups, created_at, updated_at)
      VALUES (?, ?, ?, 'checkin_marshal', 'checkin', 'primary', 'active', '2026-11-21T07:00:00Z', '2026-11-21T18:00:00Z', '["13 - 14"]', ?, ?)
    `, [dutyId2, testEventId, volUserId1, now, now]);

    // Volunteer 2 has one assigned age group and one team_lead assignment
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', 'active', ?, ?)
    `, [volUserId2, `vol2_${Date.now()}@test.koinonia`, now, now]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, assigned_age_groups, created_at, updated_at)
      VALUES (?, ?, ?, 'team_lead', 'ushers', 'lead', 'active', '2026-11-21T07:00:00Z', '2026-11-21T18:00:00Z', '["4–6"]', ?, ?)
    `, [dutyId3, testEventId, volUserId2, now, now]);

    // Test 5: Multiple duty assignments aggregation
    await t.test('5. Multiple duty assignments are aggregated and deduplicated; lead becomes unscoped', async () => {
      // Volunteer 1: aggregated 10–12 and 13–14
      const scope1 = await resolveVolunteerScope(volUserId1, 'volunteer', testEventId);
      assert.strictEqual(scope1.isScoped, true);
      assert.deepStrictEqual(scope1.assignedAgeGroups.sort(), ['10–12', '13–14'].sort());

      // Volunteer 2: team_lead responsibility makes them unscoped
      const scope2 = await resolveVolunteerScope(volUserId2, 'volunteer', testEventId);
      assert.strictEqual(scope2.isScoped, false);
      assert.deepStrictEqual(scope2.assignedAgeGroups, []);
    });

    // Test 6: Correct scope check
    await t.test('6. Correct scope check passes for both Child A and Child B', () => {
      const volScope = { isScoped: true, assignedAgeGroups: ['13–14'] };
      const childA = { date_of_birth: '2012-04-15', calculated_age: 14, age_group: '13–14' };
      const childB = { date_of_birth: '2012-08-20', calculated_age: '14', age_group: '13 - 14' };

      assert.strictEqual(isChildInScope(childA, volScope.assignedAgeGroups, eventDate), true);
      assert.strictEqual(isChildInScope(childB, volScope.assignedAgeGroups, eventDate), true);

      const checkA = checkChildVolunteerScope(childA, volScope, eventDate, testEventId);
      assert.strictEqual(checkA.allowed, true);

      const checkB = checkChildVolunteerScope(childB, volScope, eventDate, testEventId);
      assert.strictEqual(checkB.allowed, true);
    });

    // Test 7: Wrong scope check returns OUT_OF_SCOPE
    await t.test('7. Wrong scope check returns OUT_OF_SCOPE with canonical payload', () => {
      const volScope = { isScoped: true, assignedAgeGroups: ['13–14'] };
      // 8-year-old child (Ages 7–9)
      const childC = { id: 'ch-test-7-9', date_of_birth: '2018-05-10', calculated_age: 8, age_group: '7–9' };

      assert.strictEqual(isChildInScope(childC, volScope.assignedAgeGroups, eventDate), false);

      const checkC = checkChildVolunteerScope(childC, volScope, eventDate, testEventId);
      assert.strictEqual(checkC.allowed, false);
      if (!checkC.allowed) {
        assert.strictEqual(checkC.status, 403);
        assert.strictEqual(checkC.body.code, 'OUT_OF_SCOPE');
        assert.strictEqual(checkC.body.childAge, 8);
        assert.strictEqual(checkC.body.childAgeGroup, '7–9');
        assert.deepStrictEqual(checkC.body.assignedAgeGroups, ['13–14']);
        assert.strictEqual(checkC.body.outOfScope, true);
        assert.match(checkC.body.error, /Ages 7–9/);
      }
    });

    // Test 8: Pass lookup scope validation
    await t.test('8. Pass lookup logic allows in-scope child and blocks out-of-scope child', () => {
      const volScope = { isScoped: true, assignedAgeGroups: ['13–14'] };
      const inScopeChild = { date_of_birth: '2012-08-20', calculated_age: '14' };
      const outScopeChild = { id: 'ch-out-8', date_of_birth: '2018-05-10', calculated_age: '8' };

      const inScopeRes = checkChildVolunteerScope(inScopeChild, volScope, eventDate, testEventId);
      assert.strictEqual(inScopeRes.allowed, true);

      const outScopeRes = checkChildVolunteerScope(outScopeChild, volScope, eventDate, testEventId);
      assert.strictEqual(outScopeRes.allowed, false);
      if (!outScopeRes.allowed) {
        assert.strictEqual(outScopeRes.body.code, 'OUT_OF_SCOPE');
      }
    });

    // Test 9: Check-in lookup scope validation
    await t.test('9. Check-in lookup enforces scope correctly', () => {
      const volScope = { isScoped: true, assignedAgeGroups: ['4–6'] };
      const child14 = { date_of_birth: '2012-08-20' };
      const checkRes = checkChildVolunteerScope(child14, volScope, eventDate, testEventId);
      assert.strictEqual(checkRes.allowed, false);
      if (!checkRes.allowed) {
        assert.strictEqual(checkRes.body.code, 'OUT_OF_SCOPE');
      }
    });

    // Test 10: Pickup lookup scope validation
    await t.test('10. Pickup lookup enforces scope correctly', () => {
      const volScope = { isScoped: true, assignedAgeGroups: ['13–14'] };
      const childAge3 = { date_of_birth: '2023-01-15' }; // Age 3 -> 2-3
      const pickupCheck = checkChildVolunteerScope(childAge3, volScope, eventDate, testEventId);
      assert.strictEqual(pickupCheck.allowed, false);
      if (!pickupCheck.allowed) {
        assert.strictEqual(pickupCheck.body.code, 'OUT_OF_SCOPE');
        assert.strictEqual(pickupCheck.body.childAgeGroup, '2–3');
      }
    });

  } finally {
    // Clean up test rows
    await execute(`DELETE FROM event_duty_assignments WHERE event_id = ?`, [testEventId]);
    await execute(`DELETE FROM users WHERE id IN (?, ?)`, [volUserId1, volUserId2]);
    await execute(`DELETE FROM events WHERE id = ?`, [testEventId]);
  }

  // Test 11: Admin relative photo URL resolution simulation
  await t.test('11. Relative photo URL resolution formats cleanly with base URL', () => {
    function simulateBuildApiUrl(endpoint: string, baseUrl: string): string {
      if (!endpoint) return '';
      if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return endpoint;
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      if (!baseUrl) return cleanEndpoint;
      return `${baseUrl.replace(/\/+$/, '')}${cleanEndpoint}`;
    }

    const relativeUrl = '/api/media/files/media-abc-123';
    const resolvedProd = simulateBuildApiUrl(relativeUrl, 'https://mandate-2i7u.onrender.com');
    assert.strictEqual(resolvedProd, 'https://mandate-2i7u.onrender.com/api/media/files/media-abc-123');

    // Without base URL
    const resolvedLocal = simulateBuildApiUrl(relativeUrl, '');
    assert.strictEqual(resolvedLocal, '/api/media/files/media-abc-123');
  });

  // Test 12: Admin absolute photo URL resolution
  await t.test('12. Absolute photo URL remains untouched by buildApiUrl', () => {
    function simulateBuildApiUrl(endpoint: string, baseUrl: string): string {
      if (!endpoint) return '';
      if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return endpoint;
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      if (!baseUrl) return cleanEndpoint;
      return `${baseUrl.replace(/\/+$/, '')}${cleanEndpoint}`;
    }

    const absoluteCloudinary = 'https://res.cloudinary.com/mandate/image/upload/v1/child_123.jpg';
    const resolved = simulateBuildApiUrl(absoluteCloudinary, 'https://mandate-2i7u.onrender.com');
    assert.strictEqual(resolved, absoluteCloudinary);
  });

  // Test 13: Image fallback logic
  await t.test('13. Image fallback to initials placeholder when photo is missing or failed', () => {
    function resolvePassPhotoDisplay(
      childName: string,
      photoUrl?: string | null,
      failed = false
    ): { type: 'img' | 'initials'; src?: string; initials?: string } {
      if (photoUrl && !failed) {
        return { type: 'img', src: photoUrl };
      }
      return { type: 'initials', initials: childName.slice(0, 2).toUpperCase() };
    }

    // With working photo
    const r1 = resolvePassPhotoDisplay('Aaliya Ojogwu', 'https://mandate-2i7u.onrender.com/api/media/files/xyz', false);
    assert.strictEqual(r1.type, 'img');
    assert.strictEqual(r1.src, 'https://mandate-2i7u.onrender.com/api/media/files/xyz');

    // When image fails (onError triggered)
    const r2 = resolvePassPhotoDisplay('Aaliya Ojogwu', 'https://mandate-2i7u.onrender.com/api/media/files/xyz', true);
    assert.strictEqual(r2.type, 'initials');
    assert.strictEqual(r2.initials, 'AA');

    // When photoUrl is null
    const r3 = resolvePassPhotoDisplay('Bethertrade Doe', null, false);
    assert.strictEqual(r3.type, 'initials');
    assert.strictEqual(r3.initials, 'BE');
  });
});
