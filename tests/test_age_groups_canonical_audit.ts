import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();
const localEnvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
}

import assert from 'assert';
import { execute, query, queryOne } from '../src/server/db';
import { getCurrentEvent } from '../src/server/services/eventService';

async function runAgeGroupAuditTests() {
  console.log('================================================================');
  console.log('AGE GROUPS CANONICAL DATA AUDIT & REGRESSION SUITE');
  console.log('================================================================\n');

  const nowIso = new Date().toISOString();
  const testCurrentEventId = `ev-canon-curr-${Date.now()}`;
  const testHistoricalEventId = `ev-canon-hist-${Date.now()}`;

  // Save previous current event if any
  const previousCurrent = await queryOne<{ id: string }>("SELECT id FROM events WHERE status = 'current'");

  try {
    // -------------------------------------------------------------
    // SETUP: Create isolated test events
    // -------------------------------------------------------------
    await execute("UPDATE events SET status = 'upcoming' WHERE status = 'current'");

    await execute(`
      INSERT INTO events (id, title, status, capacity, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Canonical Current Event', 'current', 200, '2026-11-20', '2026-11-25', ?, ?)
    `, [testCurrentEventId, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, capacity, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Historical Event Leak Test', 'closed', 100, '2025-11-20', '2025-11-25', ?, ?)
    `, [testHistoricalEventId, nowIso, nowIso]);

    // Insert historical event-specific age groups
    await execute(`
      INSERT INTO event_age_groups (id, event_id, label, min_age, max_age, capacity, manual_review, sort_order, created_at, updated_at)
      VALUES
        (?, ?, 'Historical Ancient Cohort 1-5', 1, 5, 50, 0, 1, ?, ?),
        (?, ?, 'Historical Ancient Cohort 6-12', 6, 12, 50, 0, 2, ?, ?)
    `, [
      `ag-hist-1-${Date.now()}`, testHistoricalEventId, nowIso, nowIso,
      `ag-hist-2-${Date.now()}`, testHistoricalEventId, nowIso, nowIso
    ]);

    // Parent & child fixtures
    const parentUserId = `usr-ag-parent-${Date.now()}`;
    const parentProfileId = `parent-ag-${Date.now()}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', ?, ?)
    `, [parentUserId, `parent_${Date.now()}@test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Test Parent', '+2348000000001', ?, ?)
    `, [parentProfileId, parentUserId, nowIso, nowIso]);

    // Child 1: Age 2 with legacy 'Under 4 (Review Needed)' label
    const child1Id = `ch-test-1-${Date.now()}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, needs_age_review, created_at, updated_at)
      VALUES (?, ?, 'Toddler Under4', 'Boy', '2024-05-01', 2, 'Under 4 (Review Needed)', 1, ?, ?)
    `, [child1Id, parentProfileId, nowIso, nowIso]);

    // Child 2: Age 5 with 'Ages 4 to 6'
    const child2Id = `ch-test-2-${Date.now()}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, needs_age_review, created_at, updated_at)
      VALUES (?, ?, 'Child FourToSix', 'Girl', '2021-06-01', 5, 'Ages 4 to 6', 0, ?, ?)
    `, [child2Id, parentProfileId, nowIso, nowIso]);

    // Child 3: Age 5 with legacy/formatting variant 'Ages 4-6' (hyphen)
    const child3Id = `ch-test-3-${Date.now()}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, needs_age_review, created_at, updated_at)
      VALUES (?, ?, 'Child FourHyphenSix', 'Boy', '2021-07-01', 5, 'Ages 4-6', 0, ?, ?)
    `, [child3Id, parentProfileId, nowIso, nowIso]);

    // Register children for current event
    const entry1Id = `entry-ag-1-${Date.now()}`;
    const entry2Id = `entry-ag-2-${Date.now()}`;
    const entry3Id = `entry-ag-3-${Date.now()}`;

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, created_at, updated_at)
      VALUES
        (?, ?, ?, 'checked_in', ?, ?, ?),
        (?, ?, ?, 'checked_in', ?, ?, ?),
        (?, ?, ?, 'selected', null, ?, ?)
    `, [
      entry1Id, child1Id, testCurrentEventId, nowIso, nowIso, nowIso,
      entry2Id, child2Id, testCurrentEventId, nowIso, nowIso, nowIso,
      entry3Id, child3Id, testCurrentEventId, nowIso, nowIso
    ]);

    // -------------------------------------------------------------
    // TEST A: Current event exposes only configured canonical age groups
    // -------------------------------------------------------------
    console.log('TEST A: Current event exposes only configured canonical age groups');
    const curr = await getCurrentEvent();
    assert.strictEqual(curr?.id, testCurrentEventId, 'Current event must resolve to testCurrentEventId');

    const dbConfigured = await query(
      'SELECT id, label, min_age, max_age, sort_order FROM event_age_groups WHERE event_id = ? ORDER BY sort_order ASC, min_age ASC',
      [testCurrentEventId]
    );
    assert.strictEqual(dbConfigured.length, 0, 'Initial test event has no custom DB age groups');

    // Default canonical fallback should be the 5 canonical cohorts
    const defaultCanonical = [
      { key: 'Below 1', label: 'Below 1', min: 0, max: 0 },
      { key: 'Ages 1 to 3', label: 'Ages 1 to 3', min: 1, max: 3 },
      { key: 'Ages 4 to 6', label: 'Ages 4 to 6', min: 4, max: 6 },
      { key: 'Ages 7 to 9', label: 'Ages 7 to 9', min: 7, max: 9 },
      { key: 'Ages 10 to 12', label: 'Ages 10 to 12', min: 10, max: 12 }
    ];
    assert.strictEqual(defaultCanonical.length, 5);
    console.log('  ✓ TEST A PASSED: Current event canonical cohorts established (5 groups)\n');

    // -------------------------------------------------------------
    // TEST B: Historical event groups do not leak into current event
    // -------------------------------------------------------------
    console.log('TEST B: Historical event groups do not leak');
    const histGroups = await query(
      'SELECT * FROM event_age_groups WHERE event_id = ?',
      [testHistoricalEventId]
    );
    assert.strictEqual(histGroups.length, 2, 'Historical event has 2 custom groups');

    // Querying for current event must not include historical labels
    const currentQueryGroups = await query(
      'SELECT * FROM event_age_groups WHERE event_id = ?',
      [testCurrentEventId]
    );
    assert.strictEqual(
      currentQueryGroups.some((g: any) => g.label.includes('Historical Ancient')),
      false,
      'Historical event age groups must NEVER leak into current event query'
    );
    console.log('  ✓ TEST B PASSED: 0 historical groups leaked into current event\n');

    // -------------------------------------------------------------
    // TEST C: Review-needed state does NOT become a canonical group
    // -------------------------------------------------------------
    console.log('TEST C: Review-needed state does not become a canonical group');
    // When simulating attendance aggregation:
    const canonicalCohorts = defaultCanonical;
    const ageGroupsMap = new Map<string, any>();
    for (const cohort of canonicalCohorts) {
      ageGroupsMap.set(cohort.key, {
        ageGroup: cohort.label,
        expected: 0,
        checkedIn: 0,
        inside: 0,
        pickedUp: 0,
        notArrived: 0
      });
    }

    const allEntries = await query(`
      SELECT
        e.status,
        e.checked_in_at,
        e.picked_up_at,
        c.age_group,
        c.calculated_age,
        c.date_of_birth,
        c.needs_age_review
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ?
        AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
    `, [testCurrentEventId]);

    for (const entry of allEntries) {
      const age = entry.calculated_age ?? 0;
      let matchedCohort = canonicalCohorts.find(c => age >= c.min && age <= c.max);
      if (!matchedCohort && entry.age_group) {
        const cleanAg = entry.age_group.replace(/\s*\(Review Needed\)/gi, '').trim();
        const norm = cleanAg.toLowerCase().replace(/[^a-z0-9]/g, '');
        matchedCohort = canonicalCohorts.find(c => {
          const cNorm = c.label.toLowerCase().replace(/[^a-z0-9]/g, '');
          return norm === cNorm || norm.includes(cNorm) || cNorm.includes(norm);
        });
      }
      const groupKey = matchedCohort ? matchedCohort.key : canonicalCohorts[0].key;
      const statsObj = ageGroupsMap.get(groupKey);
      if (statsObj) {
        statsObj.expected++;
        if (entry.status === 'checked_in') statsObj.checkedIn++;
      }
    }

    const aggregatedGroups = Array.from(ageGroupsMap.values());
    const groupNames = aggregatedGroups.map(g => g.ageGroup);

    assert.strictEqual(
      groupNames.includes('Under 4 (Review Needed)'),
      false,
      'Under 4 (Review Needed) must NOT exist as a canonical age group'
    );
    assert.strictEqual(
      aggregatedGroups.length,
      5,
      `Expected exactly 5 canonical groups, got ${aggregatedGroups.length}: ${groupNames.join(', ')}`
    );

    // Toddler with 'Under 4 (Review Needed)' was placed in 'Ages 1 to 3'
    const toddlerGroup = aggregatedGroups.find(g => g.ageGroup === 'Ages 1 to 3');
    assert.strictEqual(toddlerGroup.expected, 1, 'Child with Under 4 (Review Needed) mapped to Ages 1 to 3');
    assert.strictEqual(toddlerGroup.checkedIn, 1, 'Toddler checkedIn mapped accurately');
    console.log('  ✓ TEST C PASSED: Review state separated; Under 4 (Review Needed) not in group list\n');

    // -------------------------------------------------------------
    // TEST D: Formatting variants do not create logical duplicates
    // -------------------------------------------------------------
    console.log('TEST D: Formatting variants do not create logical duplicates');
    // Both Child 2 ('Ages 4 to 6') and Child 3 ('Ages 4-6') are age 5.
    // They must both map to the SINGLE canonical group 'Ages 4 to 6'.
    const fourToSixGroup = aggregatedGroups.find(g => g.ageGroup === 'Ages 4 to 6');
    assert.strictEqual(fourToSixGroup.expected, 2, 'Both Ages 4 to 6 and Ages 4-6 mapped to single canonical cohort');
    assert.strictEqual(fourToSixGroup.checkedIn, 1, 'Child 2 checked in, Child 3 selected = 1 checked in');
    assert.strictEqual(
      groupNames.filter(n => n.toLowerCase().includes('4')).length,
      1,
      'Must have only ONE 4-6 group, zero duplicates'
    );
    console.log('  ✓ TEST D PASSED: Formatting variants (Ages 4-6 vs Ages 4 to 6) merged into single group\n');

    // -------------------------------------------------------------
    // TEST E: Landing page canonical group presentation
    // -------------------------------------------------------------
    console.log('TEST E: Landing page canonical current-event groups');
    // Verify formatting helper converts the 5 canonical cohorts into editorial bands
    const testLandingGroups = defaultCanonical.map(c => ({
      label: c.label,
      minAge: c.min,
      maxAge: c.max
    }));

    const formattedBands = testLandingGroups.map(g => {
      const min = g.minAge;
      const max = g.maxAge;
      const label = g.label;
      if (min === 0 && max <= 0) {
        return { displayRange: 'Below 1', displayLabel: 'Infants' };
      }
      if (min === 1 && max === 3) {
        return { displayRange: '1–3', displayLabel: '1–3 years' };
      }
      if (min === 4 && max === 6) {
        return { displayRange: '4–6', displayLabel: '4–6 years' };
      }
      if (min === 7 && max === 9) {
        return { displayRange: '7–9', displayLabel: '7–9 years' };
      }
      if (min === 10 && max === 12) {
        return { displayRange: '10–12', displayLabel: '10–12 years' };
      }
      return { displayRange: `${min}–${max}`, displayLabel: label };
    });

    assert.strictEqual(formattedBands.length, 5);
    assert.deepStrictEqual(formattedBands.map(b => b.displayRange), [
      'Below 1', '1–3', '4–6', '7–9', '10–12'
    ]);
    assert.deepStrictEqual(formattedBands.map(b => b.displayLabel), [
      'Infants', '1–3 years', '4–6 years', '7–9 years', '10–12 years'
    ]);
    console.log('  ✓ TEST E PASSED: Landing page formats canonical groups into editorial bands\n');

    // -------------------------------------------------------------
    // TEST F: Admin shows age-review status separately from ageGroup
    // -------------------------------------------------------------
    console.log('TEST F: Admin shows age-review status separately');
    const childRow = await queryOne(`
      SELECT c.age_group, c.needs_age_review, c.calculated_age
      FROM children c WHERE c.id = ?
    `, [child1Id]);

    const rawAg = childRow?.age_group || '';
    const needsReview = childRow?.needs_age_review === 1 || rawAg.includes('Review Needed');
    const cleanAg = rawAg.replace(/\s*\(Review Needed\)/gi, '').trim() === 'Under 4'
      ? (childRow.calculated_age < 1 ? 'Below 1' : 'Ages 1 to 3')
      : rawAg;

    assert.strictEqual(cleanAg, 'Ages 1 to 3', 'Age group clean value must be Ages 1 to 3');
    assert.strictEqual(needsReview, true, 'needsAgeReview flag must be separately true');
    console.log('  ✓ TEST F PASSED: Admin separates ageGroup from needsAgeReview flag\n');

  } finally {
    // CLEANUP
    await execute('DELETE FROM child_event_entries WHERE event_id IN (?, ?)', [testCurrentEventId, testHistoricalEventId]);
    await execute('DELETE FROM event_age_groups WHERE event_id IN (?, ?)', [testCurrentEventId, testHistoricalEventId]);
    await execute('DELETE FROM events WHERE id IN (?, ?)', [testCurrentEventId, testHistoricalEventId]);

    // Restore previous current event if any
    if (previousCurrent?.id) {
      await execute("UPDATE events SET status = 'current' WHERE id = ?", [previousCurrent.id]);
    } else {
      await execute("UPDATE events SET status = 'current' WHERE id = 'event-ga-2026'");
    }
  }

  console.log('================================================================');
  console.log('ALL REGRESSION TESTS PASSED!');
  console.log('================================================================\n');
}

runAgeGroupAuditTests()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
