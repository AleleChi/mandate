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
import { deriveAgeGroup } from '../src/server/routes/admin';

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

  console.log('\n================================================================');
  console.log('ALL CANONICAL AGE GROUP BOUNDARY TESTS PASSED');
  console.log('================================================================');
}

runCanonicalAgeGroupTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
