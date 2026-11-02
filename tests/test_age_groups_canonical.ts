import assert from 'assert';
import {
  resolveCanonicalAgeGroup,
  calculateAgeOnDate,
  getDobCutoffsForEvent,
  CANONICAL_PROGRAMME_AGE_GROUPS,
  CANONICAL_GA_EVENT_DATE,
  CANONICAL_MIN_AGE,
  CANONICAL_MAX_AGE
} from '../src/server/services/eligibilityService';
import {
  deriveAgeGroup,
  isChildInAgeGroup,
  normalizeAgeGroupLabelToRange,
  validateChildSelectionCapacity
} from '../src/server/routes/admin';
import { execute, queryOne } from '../src/server/db';
import crypto from 'crypto';

async function runCanonicalAgeGroupTests() {
  console.log('================================================================');
  console.log('CANONICAL AGE GROUPS & BOUNDARY RESOLVER TEST SUITE');
  console.log('================================================================\n');

  const EVENT_DATE = '2026-11-21';

  // 1. Exact Boundary Tests as required by Section 16 of specification
  console.log('--- TEST 1: Canonical Age Group Boundaries on Event Date (2026-11-21) ---');

  // Age 1: Born 2025-11-21 -> exactly 1 year old -> Out of range ('Age review needed')
  const age1Res = resolveCanonicalAgeGroup('2025-11-21', EVENT_DATE);
  assert.strictEqual(age1Res.age, 1, 'DOB 2025-11-21 should be age 1');
  assert.strictEqual(age1Res.isOutOfRange, true, 'Age 1 must be out of range');
  assert.strictEqual(age1Res.group, null, 'Age 1 group key must be null');
  assert.strictEqual(age1Res.label, 'Age review needed', 'Age 1 label must be "Age review needed"');
  console.log('  ✓ Age 1 -> Out of range (Age review needed)');

  // Exactly 2: Born 2024-11-21 -> exactly 2 years old -> '2–3'
  const age2Res = resolveCanonicalAgeGroup('2024-11-21', EVENT_DATE);
  assert.strictEqual(age2Res.age, 2, 'DOB 2024-11-21 should be age 2');
  assert.strictEqual(age2Res.isOutOfRange, false);
  assert.strictEqual(age2Res.group, '2–3');
  assert.strictEqual(age2Res.label, '2–3');
  console.log('  ✓ Exactly 2 -> 2–3');

  // Age 3: Born 2023-11-21 -> exactly 3 years old -> '2–3'
  const age3Res = resolveCanonicalAgeGroup('2023-11-21', EVENT_DATE);
  assert.strictEqual(age3Res.age, 3, 'DOB 2023-11-21 should be age 3');
  assert.strictEqual(age3Res.isOutOfRange, false);
  assert.strictEqual(age3Res.group, '2–3');
  assert.strictEqual(age3Res.label, '2–3');
  console.log('  ✓ Age 3 -> 2–3');

  // Age 4: Born 2022-11-21 -> exactly 4 years old -> '4–6'
  const age4Res = resolveCanonicalAgeGroup('2022-11-21', EVENT_DATE);
  assert.strictEqual(age4Res.age, 4, 'DOB 2022-11-21 should be age 4');
  assert.strictEqual(age4Res.isOutOfRange, false);
  assert.strictEqual(age4Res.group, '4–6');
  assert.strictEqual(age4Res.label, '4–6');
  console.log('  ✓ Age 4 -> 4–6');

  // Age 6: Born 2020-11-21 -> exactly 6 years old -> '4–6'
  const age6Res = resolveCanonicalAgeGroup('2020-11-21', EVENT_DATE);
  assert.strictEqual(age6Res.age, 6, 'DOB 2020-11-21 should be age 6');
  assert.strictEqual(age6Res.isOutOfRange, false);
  assert.strictEqual(age6Res.group, '4–6');
  assert.strictEqual(age6Res.label, '4–6');
  console.log('  ✓ Age 6 -> 4–6');

  // Age 7: Born 2019-11-21 -> exactly 7 years old -> '7–9'
  const age7Res = resolveCanonicalAgeGroup('2019-11-21', EVENT_DATE);
  assert.strictEqual(age7Res.age, 7, 'DOB 2019-11-21 should be age 7');
  assert.strictEqual(age7Res.isOutOfRange, false);
  assert.strictEqual(age7Res.group, '7–9');
  assert.strictEqual(age7Res.label, '7–9');
  console.log('  ✓ Age 7 -> 7–9');

  // Age 9: Born 2017-11-21 -> exactly 9 years old -> '7–9'
  const age9Res = resolveCanonicalAgeGroup('2017-11-21', EVENT_DATE);
  assert.strictEqual(age9Res.age, 9, 'DOB 2017-11-21 should be age 9');
  assert.strictEqual(age9Res.isOutOfRange, false);
  assert.strictEqual(age9Res.group, '7–9');
  assert.strictEqual(age9Res.label, '7–9');
  console.log('  ✓ Age 9 -> 7–9');

  // Age 10: Born 2016-11-21 -> exactly 10 years old -> '10–12'
  const age10Res = resolveCanonicalAgeGroup('2016-11-21', EVENT_DATE);
  assert.strictEqual(age10Res.age, 10, 'DOB 2016-11-21 should be age 10');
  assert.strictEqual(age10Res.isOutOfRange, false);
  assert.strictEqual(age10Res.group, '10–12');
  assert.strictEqual(age10Res.label, '10–12');
  console.log('  ✓ Age 10 -> 10–12');

  // Age 12: Born 2014-11-21 -> exactly 12 years old -> '10–12'
  const age12Res = resolveCanonicalAgeGroup('2014-11-21', EVENT_DATE);
  assert.strictEqual(age12Res.age, 12, 'DOB 2014-11-21 should be age 12');
  assert.strictEqual(age12Res.isOutOfRange, false);
  assert.strictEqual(age12Res.group, '10–12');
  assert.strictEqual(age12Res.label, '10–12');
  console.log('  ✓ Age 12 -> 10–12');

  // Age 13: Born 2013-11-21 -> exactly 13 years old -> '13–14'
  const age13Res = resolveCanonicalAgeGroup('2013-11-21', EVENT_DATE);
  assert.strictEqual(age13Res.age, 13, 'DOB 2013-11-21 should be age 13');
  assert.strictEqual(age13Res.isOutOfRange, false);
  assert.strictEqual(age13Res.group, '13–14');
  assert.strictEqual(age13Res.label, '13–14');
  console.log('  ✓ Age 13 -> 13–14');

  // Exactly 14: Born 2012-11-21 -> exactly 14 years old -> '13–14'
  const age14Res = resolveCanonicalAgeGroup('2012-11-21', EVENT_DATE);
  assert.strictEqual(age14Res.age, 14, 'DOB 2012-11-21 should be age 14');
  assert.strictEqual(age14Res.isOutOfRange, false);
  assert.strictEqual(age14Res.group, '13–14');
  assert.strictEqual(age14Res.label, '13–14');
  console.log('  ✓ Exactly 14 -> 13–14');

  // Age 15: Born 2011-11-21 -> exactly 15 years old -> Out of range
  const age15Res = resolveCanonicalAgeGroup('2011-11-21', EVENT_DATE);
  assert.strictEqual(age15Res.age, 15, 'DOB 2011-11-21 should be age 15');
  assert.strictEqual(age15Res.isOutOfRange, true, 'Age 15 must be out of range');
  assert.strictEqual(age15Res.group, null);
  assert.strictEqual(age15Res.label, 'Age review needed');
  console.log('  ✓ Age 15 -> Out of range (Age review needed)');

  // 2. Birthday Day Boundary Tests (Day before / Day of / Day after)
  console.log('\n--- TEST 2: Birthday Day Boundary Precision ---');

  // Born 2024-11-20 (day before 2nd birthday): turns 2 on 2026-11-20, so on event day 2026-11-21 is 2 -> '2–3'
  const bdayBefore2 = resolveCanonicalAgeGroup('2024-11-20', EVENT_DATE);
  assert.strictEqual(bdayBefore2.age, 2);
  assert.strictEqual(bdayBefore2.group, '2–3');

  // Born 2024-11-22 (day after 2nd birthday): turns 2 on 2026-11-22, so on event day 2026-11-21 is still 1 -> Out of range
  const bdayAfter2 = resolveCanonicalAgeGroup('2024-11-22', EVENT_DATE);
  assert.strictEqual(bdayAfter2.age, 1);
  assert.strictEqual(bdayAfter2.isOutOfRange, true);
  assert.strictEqual(bdayAfter2.group, null);
  console.log('  ✓ Child born 2024-11-22 is age 1 on 2026-11-21 -> correctly out of range');

  // Born 2012-11-22 (day after 14th birthday): turns 14 on 2026-11-22, so on event day 2026-11-21 is 13 -> '13–14'
  const bdayBefore14 = resolveCanonicalAgeGroup('2012-11-22', EVENT_DATE);
  assert.strictEqual(bdayBefore14.age, 13);
  assert.strictEqual(bdayBefore14.group, '13–14');

  // Born 2011-11-20 (day before 15th birthday): turns 15 on 2026-11-20, so on event day 2026-11-21 is 15 -> Out of range
  const bdayTurned15 = resolveCanonicalAgeGroup('2011-11-20', EVENT_DATE);
  assert.strictEqual(bdayTurned15.age, 15);
  assert.strictEqual(bdayTurned15.isOutOfRange, true);
  console.log('  ✓ Child born 2011-11-20 turns 15 before event -> correctly out of range');

  // 3. Integer and Number Inputs
  console.log('\n--- TEST 3: Numeric Age Inputs ---');
  assert.strictEqual(resolveCanonicalAgeGroup(2).group, '2–3');
  assert.strictEqual(resolveCanonicalAgeGroup(3).group, '2–3');
  assert.strictEqual(resolveCanonicalAgeGroup(4).group, '4–6');
  assert.strictEqual(resolveCanonicalAgeGroup(6).group, '4–6');
  assert.strictEqual(resolveCanonicalAgeGroup(7).group, '7–9');
  assert.strictEqual(resolveCanonicalAgeGroup(9).group, '7–9');
  assert.strictEqual(resolveCanonicalAgeGroup(10).group, '10–12');
  assert.strictEqual(resolveCanonicalAgeGroup(12).group, '10–12');
  assert.strictEqual(resolveCanonicalAgeGroup(13).group, '13–14');
  assert.strictEqual(resolveCanonicalAgeGroup(14).group, '13–14');
  assert.strictEqual(resolveCanonicalAgeGroup(1).isOutOfRange, true);
  assert.strictEqual(resolveCanonicalAgeGroup(15).isOutOfRange, true);
  assert.strictEqual(resolveCanonicalAgeGroup(null).isOutOfRange, true);
  assert.strictEqual(resolveCanonicalAgeGroup('').isOutOfRange, true);
  console.log('  ✓ All numeric inputs match canonical expectations');

  // 4. deriveAgeGroup Adapter Compatibility
  console.log('\n--- TEST 4: deriveAgeGroup Adapter Compatibility ---');
  assert.strictEqual(deriveAgeGroup(2), '2–3');
  assert.strictEqual(deriveAgeGroup(5), '4–6');
  assert.strictEqual(deriveAgeGroup(8), '7–9');
  assert.strictEqual(deriveAgeGroup(11), '10–12');
  assert.strictEqual(deriveAgeGroup(14), '13–14');
  assert.strictEqual(deriveAgeGroup(1), 'Age review needed');
  assert.strictEqual(deriveAgeGroup(15), 'Age review needed');
  assert.strictEqual(deriveAgeGroup(null), 'Age review needed');
  console.log('  ✓ deriveAgeGroup delegates authoritatively to canonical resolver');

  // 5. Portable SQL Cutoffs helper
  console.log('\n--- TEST 5: Portable Cutoffs Computation ---');
  const cutoffs = getDobCutoffsForEvent('2026-11-21', 2, 14);
  assert.strictEqual(cutoffs.minAgeDobCutoff, '2024-11-21');
  assert.strictEqual(cutoffs.maxAgeDobCutoff, '2011-11-21');
  console.log(`  ✓ minAgeDobCutoff: ${cutoffs.minAgeDobCutoff}, maxAgeDobCutoff: ${cutoffs.maxAgeDobCutoff}`);

  // Test lexicographical comparison:
  // Age 1 child (DOB 2025-05-01): 2025-05-01 > 2024-11-21 -> TRUE (out of range / attention)
  assert.strictEqual('2025-05-01' > cutoffs.minAgeDobCutoff, true);
  // Age 2 child (DOB 2024-05-01): between 2011-11-21 and 2024-11-21 -> FALSE (valid)
  assert.strictEqual('2024-05-01' > cutoffs.minAgeDobCutoff, false);
  assert.strictEqual('2024-05-01' <= cutoffs.maxAgeDobCutoff, false);
  // Age 15 child (DOB 2011-05-01): 2011-05-01 <= 2011-11-21 -> TRUE (out of range / attention)
  assert.strictEqual('2011-05-01' <= cutoffs.maxAgeDobCutoff, true);
  console.log('  ✓ Lexicographical SQL string comparisons are mathematically sound');

  // 6. Capacity Age-Group Matching & Selection Validation (Cases A-F)
  console.log('\n--- TEST 6: Capacity Age-Group Matching & Selection Validation (Cases A-F) ---');

  // Case A: Child age 10 / stored age_group 'Ages 10'
  // Configured groups: Ages 1 -> 1-3, Ages 10 -> 10-12
  const faithChild = {
    id: `child-faith-${Date.now()}`,
    full_name: 'Faith Ariyo',
    date_of_birth: '2016-09-19',
    calculated_age: 10,
    age_group: 'Ages 10'
  };

  const groupAges1 = { id: 'ag-1', label: 'Ages 1', min_age: 1, max_age: 3, capacity: 50 };
  const groupAges10 = { id: 'ag-10', label: 'Ages 10', min_age: 10, max_age: 12, capacity: 293 };

  assert.strictEqual(
    isChildInAgeGroup(faithChild, groupAges1, EVENT_DATE),
    false,
    'Case A: 10-year-old child must NEVER match Ages 1 (1–3)'
  );
  assert.strictEqual(
    isChildInAgeGroup(faithChild, groupAges10, EVENT_DATE),
    true,
    'Case A: 10-year-old child must match Ages 10 (10–12)'
  );

  // Exact-label fallback check (no DOB, only stored age_group 'Ages 10')
  const faithFallback = { age_group: 'Ages 10' };
  assert.strictEqual(
    isChildInAgeGroup(faithFallback, groupAges1, EVENT_DATE),
    false,
    'Case A (fallback): "Ages 10" label must never match "Ages 1"'
  );
  assert.strictEqual(
    isChildInAgeGroup(faithFallback, groupAges10, EVENT_DATE),
    true,
    'Case A (fallback): "Ages 10" label must match "Ages 10" (10–12)'
  );
  console.log('  ✓ Case A passed: Age 10 / "Ages 10" matches ONLY 10–12 and never 1–3');

  // Database-backed setup for Case B & C
  const testCapEventId = `ev-cap-${Date.now()}`;
  await execute(`
    INSERT INTO events (id, title, status, capacity, starts_at, ends_at, created_at, updated_at)
    VALUES (?, 'Capacity Test Event', 'open', 1000, ?, ?, datetime('now'), datetime('now'))
  `, [testCapEventId, EVENT_DATE, EVENT_DATE]);

  await execute(`
    INSERT INTO event_age_groups (id, event_id, label, min_age, max_age, capacity, manual_review, sort_order, created_at, updated_at)
    VALUES (?, ?, 'Ages 1', 1, 3, 1, 0, 1, datetime('now'), datetime('now')),
           (?, ?, 'Ages 10', 10, 12, 293, 0, 2, datetime('now'), datetime('now'))
  `, [`ag-1-${Date.now()}`, testCapEventId, `ag-10-${Date.now()}`, testCapEventId]);

  // Seed 1 selected child in Ages 1 (making Ages 1 FULL: 1 of 1 selected)
  const parentRow = await queryOne('SELECT id FROM parent_profiles LIMIT 1');
  const parentId = parentRow ? parentRow.id : `parent-${Date.now()}`;

  const toddlerId = `child-toddler-${Date.now()}`;
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
    VALUES (?, ?, 'Toddler Full', 'female', '2023-11-21', 3, 'Ages 1', datetime('now'), datetime('now'))
  `, [toddlerId, parentId]);
  await execute(`
    INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'selected', datetime('now'), datetime('now'))
  `, [`entry-toddler-${Date.now()}`, testCapEventId, toddlerId]);

  // Seed the 10-year-old child in database
  const child10DbId = `child-10-${Date.now()}`;
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
    VALUES (?, ?, 'Faith Ariyo Test', 'female', '2016-09-19', 10, 'Ages 10', datetime('now'), datetime('now'))
  `, [child10DbId, parentId]);
  await execute(`
    INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'submitted', datetime('now'), datetime('now'))
  `, [`entry-10-${Date.now()}`, testCapEventId, child10DbId]);

  // Case B: Ages 1 is full, but 10–12 has remaining capacity. Approving 10-year-old MUST SUCCEED.
  const capCheckB = await validateChildSelectionCapacity(testCapEventId, child10DbId, 'submitted');
  assert.strictEqual(capCheckB.allowed, true, 'Case B: Approving 10-year-old must succeed even when Ages 1 is full');
  console.log('  ✓ Case B passed: Approval of 10-year-old succeeds when Ages 1 is full but 10–12 has capacity');

  // Case C: 10–12 is actually full.
  // Seed an existing selected 10-year-old child in 10–12 and set capacity = 1
  const existing10Id = `child-ex10-${Date.now()}`;
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
    VALUES (?, ?, 'Existing 10 Child', 'female', '2016-01-15', 10, 'Ages 10', datetime('now'), datetime('now'))
  `, [existing10Id, parentId]);
  await execute(`
    INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'selected', datetime('now'), datetime('now'))
  `, [`entry-ex10-${Date.now()}`, testCapEventId, existing10Id]);

  await execute(`
    UPDATE event_age_groups SET capacity = 1 WHERE event_id = ? AND min_age = 10
  `, [testCapEventId]);

  const capCheckC = await validateChildSelectionCapacity(testCapEventId, child10DbId, 'submitted');
  assert.strictEqual(capCheckC.allowed, false, 'Case C: Must be blocked when 10–12 is actually full');
  assert.ok(
    capCheckC.error && capCheckC.error.includes('The 10–12 age group has reached its capacity (1 of 1 places selected).'),
    `Case C: Expected clear canonical error message, got: "${capCheckC.error}"`
  );
  console.log(`  ✓ Case C passed: Correct error message emitted: "${capCheckC.error}"`);

  // Case D: Age 13 -> Expected canonical group: 13–14
  const caseDAge13 = resolveCanonicalAgeGroup(13, EVENT_DATE);
  assert.strictEqual(caseDAge13.group, '13–14', 'Case D: Age 13 must resolve to 13–14');
  console.log('  ✓ Case D passed: Age 13 resolves to canonical 13–14');

  // Case E: Age 14 -> Expected canonical group: 13–14
  const caseEAge14 = resolveCanonicalAgeGroup(14, EVENT_DATE);
  assert.strictEqual(caseEAge14.group, '13–14', 'Case E: Age 14 must resolve to 13–14');
  console.log('  ✓ Case E passed: Age 14 resolves to canonical 13–14');

  // Case F: Age 1 -> Expected: outside current 2–14 programme eligibility
  const age1ResF = resolveCanonicalAgeGroup(1, EVENT_DATE);
  assert.strictEqual(age1ResF.isOutOfRange, true, 'Case F: Age 1 must be out of range');
  assert.strictEqual(age1ResF.group, null, 'Case F: Age 1 canonical group must be null');
  assert.strictEqual(age1ResF.label, 'Age review needed', 'Case F: Age 1 label must be "Age review needed"');
  console.log('  ✓ Case F passed: Age 1 is outside 2–14 programme eligibility');

  console.log('\n================================================================');
  console.log('ALL CANONICAL AGE GROUP BOUNDARY & CAPACITY TESTS PASSED');
  console.log('================================================================');
}

runCanonicalAgeGroupTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
