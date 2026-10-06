import assert from 'assert';
import {
  resolveCanonicalAgeGroup,
  CANONICAL_PROGRAMME_AGE_GROUPS,
  CANONICAL_GA_EVENT_DATE,
  CANONICAL_MIN_AGE,
  CANONICAL_MAX_AGE
} from '../src/server/services/eligibilityService';

/**
 * Pure simulation of the Attendance aggregation logic from /api/admin/attendance
 */
function aggregateAttendance(
  entries: Array<{
    id: string;
    eventId: string;
    dob?: string | null;
    age?: number | null;
    status: 'selected' | 'pass_ready' | 'checked_in' | 'inside' | 'picked_up' | 'waiting_list' | 'under_review';
    checked_in_at?: string | null;
    picked_up_at?: string | null;
    has_medical_notes?: number;
    needs_extra_support?: number;
    needs_age_review?: number;
    is_deleted?: number;
  }>,
  targetEventId: string,
  eventDate: string = CANONICAL_GA_EVENT_DATE
) {
  // Filter scoped to target event, not deleted, and valid lifecycle statuses
  const validLifecycleStatuses = ['selected', 'pass_ready', 'checked_in', 'inside', 'picked_up'];
  const scopedEntries = entries.filter(e => 
    e.eventId === targetEventId && 
    (e.is_deleted === 0 || !e.is_deleted) &&
    validLifecycleStatuses.includes(e.status)
  );

  const ageGroupsMap = new Map<string, {
    ageGroup: string;
    expected: number;
    checkedIn: number;
    inside: number;
    pickedUp: number;
    notArrived: number;
  }>();

  for (const cohort of CANONICAL_PROGRAMME_AGE_GROUPS) {
    ageGroupsMap.set(cohort.key, {
      ageGroup: cohort.label,
      expected: 0,
      checkedIn: 0,
      inside: 0,
      pickedUp: 0,
      notArrived: 0
    });
  }

  let totalAttentionCount = 0;
  const outOfRangeEntries: any[] = [];

  for (const entry of scopedEntries) {
    const ageRes = resolveCanonicalAgeGroup(entry.dob ?? entry.age, eventDate);
    const isAttention = entry.has_medical_notes === 1 || entry.needs_extra_support === 1 || entry.needs_age_review === 1 || ageRes.isOutOfRange;
    if (isAttention) {
      totalAttentionCount++;
    }

    // Exclude out-of-range child from valid 2–14 age-group aggregation so they do not distort totals
    if (ageRes.isOutOfRange || !ageRes.group) {
      outOfRangeEntries.push({ entry, ageRes });
      continue;
    }

    const statsObj = ageGroupsMap.get(ageRes.group);
    if (statsObj) {
      statsObj.expected++;
      const isPickedUp = entry.status === 'picked_up' || Boolean(entry.picked_up_at);
      const isInside = !isPickedUp && (entry.status === 'inside' || entry.status === 'checked_in' || Boolean(entry.checked_in_at));

      if (isPickedUp) {
        statsObj.checkedIn++;
        statsObj.pickedUp++;
      } else if (isInside) {
        statsObj.checkedIn++;
        statsObj.inside++;
      } else {
        statsObj.notArrived++;
      }
    }
  }

  const ageGroups = Array.from(ageGroupsMap.values());
  const sumExpected = ageGroups.reduce((acc, curr) => acc + curr.expected, 0);
  const sumCheckedIn = ageGroups.reduce((acc, curr) => acc + curr.checkedIn, 0);
  const sumInside = ageGroups.reduce((acc, curr) => acc + curr.inside, 0);
  const sumPickedUp = ageGroups.reduce((acc, curr) => acc + curr.pickedUp, 0);
  const sumNotArrived = ageGroups.reduce((acc, curr) => acc + curr.notArrived, 0);

  return {
    stats: {
      expected: sumExpected,
      checkedIn: sumCheckedIn,
      inside: sumInside,
      pickedUp: sumPickedUp,
      notArrived: sumNotArrived,
      needsAttention: totalAttentionCount
    },
    ageGroups,
    outOfRangeCount: outOfRangeEntries.length
  };
}

async function runAttendanceAggregationTests() {
  console.log('================================================================');
  console.log('ATTENDANCE LIVE AGGREGATION LOCAL FIXTURE TEST SUITE');
  console.log('================================================================\n');

  const TARGET_EVENT = 'event-ga-2026';
  const OTHER_EVENT = 'event-ga-2025';

  // Create local fixtures spanning all 5 groups and multiple statuses
  const fixtures: any[] = [
    // Group 2–3 (Ages 2-3)
    { id: 'c1', eventId: TARGET_EVENT, dob: '2024-05-10', status: 'selected' }, // age 2, not arrived
    { id: 'c2', eventId: TARGET_EVENT, dob: '2023-08-15', status: 'checked_in', checked_in_at: '2026-11-21T09:00:00Z' }, // age 3, inside
    { id: 'c3', eventId: TARGET_EVENT, dob: '2023-11-20', status: 'picked_up', checked_in_at: '2026-11-21T09:00:00Z', picked_up_at: '2026-11-21T12:00:00Z' }, // age 3, picked up

    // Group 4–6 (Ages 4-6)
    { id: 'c4', eventId: TARGET_EVENT, dob: '2022-01-15', status: 'inside', checked_in_at: '2026-11-21T09:10:00Z' }, // age 4, inside
    { id: 'c5', eventId: TARGET_EVENT, dob: '2021-06-20', status: 'pass_ready' }, // age 5, not arrived
    { id: 'c6', eventId: TARGET_EVENT, dob: '2020-11-21', status: 'picked_up', checked_in_at: '2026-11-21T09:00:00Z', picked_up_at: '2026-11-21T13:00:00Z' }, // age 6, picked up

    // Group 7–9 (Ages 7-9)
    { id: 'c7', eventId: TARGET_EVENT, dob: '2019-03-12', status: 'selected' }, // age 7, not arrived
    { id: 'c8', eventId: TARGET_EVENT, dob: '2018-07-22', status: 'checked_in', checked_in_at: '2026-11-21T09:15:00Z' }, // age 8, inside

    // Group 10–12 (Ages 10-12)
    { id: 'c9', eventId: TARGET_EVENT, dob: '2016-04-05', status: 'inside', checked_in_at: '2026-11-21T09:20:00Z' }, // age 10, inside
    { id: 'c10', eventId: TARGET_EVENT, dob: '2014-11-21', status: 'picked_up', checked_in_at: '2026-11-21T09:00:00Z', picked_up_at: '2026-11-21T14:00:00Z' }, // age 12, picked up

    // Group 13–14 (Ages 13-14)
    { id: 'c11', eventId: TARGET_EVENT, dob: '2013-09-10', status: 'selected' }, // age 13, not arrived
    { id: 'c12', eventId: TARGET_EVENT, dob: '2012-11-21', status: 'inside', checked_in_at: '2026-11-21T09:30:00Z' }, // age 14, inside

    // OUT-OF-RANGE CHILDREN (Must be excluded from group counts and totals!)
    { id: 'c-infant', eventId: TARGET_EVENT, dob: '2025-06-01', status: 'selected', needs_age_review: 1 }, // age 1 (out of range < 2)
    { id: 'c-overage', eventId: TARGET_EVENT, dob: '2010-01-01', status: 'selected', needs_age_review: 1 }, // age 16 (out of range > 14)

    // OTHER EVENT CHILDREN (Must be excluded by event scope filter!)
    { id: 'c-other-event', eventId: OTHER_EVENT, dob: '2022-01-01', status: 'inside' },

    // UNACCEPTED/WAITING LIST CHILDREN (Must not be counted in expected attendance)
    { id: 'c-waitlist', eventId: TARGET_EVENT, dob: '2022-01-01', status: 'waiting_list' },
    { id: 'c-under-review', eventId: TARGET_EVENT, dob: '2022-01-01', status: 'under_review' }
  ];

  console.log('--- TEST 1: Canonical Aggregation Breakdown ---');
  const result = aggregateAttendance(fixtures, TARGET_EVENT);

  console.log('Result Stats:', result.stats);
  console.log('Result Age Groups:', result.ageGroups);

  // Group 2–3 verification: 3 children (1 not arrived, 1 inside, 1 picked up)
  const g23 = result.ageGroups.find(g => g.ageGroup === '2–3');
  assert(g23, 'Group 2–3 must exist');
  assert.strictEqual(g23.expected, 3);
  assert.strictEqual(g23.inside, 1);
  assert.strictEqual(g23.pickedUp, 1);
  assert.strictEqual(g23.checkedIn, 2); // inside + picked up
  assert.strictEqual(g23.notArrived, 1);
  console.log('  ✓ Group 2–3 counts accurate');

  // Group 4–6 verification: 3 children (1 inside, 1 not arrived, 1 picked up)
  const g46 = result.ageGroups.find(g => g.ageGroup === '4–6');
  assert(g46, 'Group 4–6 must exist');
  assert.strictEqual(g46.expected, 3);
  assert.strictEqual(g46.inside, 1);
  assert.strictEqual(g46.pickedUp, 1);
  assert.strictEqual(g46.checkedIn, 2);
  assert.strictEqual(g46.notArrived, 1);
  console.log('  ✓ Group 4–6 counts accurate');

  // Group 7–9 verification: 2 children (1 not arrived, 1 inside)
  const g79 = result.ageGroups.find(g => g.ageGroup === '7–9');
  assert(g79, 'Group 7–9 must exist');
  assert.strictEqual(g79.expected, 2);
  assert.strictEqual(g79.inside, 1);
  assert.strictEqual(g79.pickedUp, 0);
  assert.strictEqual(g79.checkedIn, 1);
  assert.strictEqual(g79.notArrived, 1);
  console.log('  ✓ Group 7–9 counts accurate');

  // Group 10–12 verification: 2 children (1 inside, 1 picked up)
  const g1012 = result.ageGroups.find(g => g.ageGroup === '10–12');
  assert(g1012, 'Group 10–12 must exist');
  assert.strictEqual(g1012.expected, 2);
  assert.strictEqual(g1012.inside, 1);
  assert.strictEqual(g1012.pickedUp, 1);
  assert.strictEqual(g1012.checkedIn, 2);
  assert.strictEqual(g1012.notArrived, 0);
  console.log('  ✓ Group 10–12 counts accurate');

  // Group 13–14 verification: 2 children (1 not arrived, 1 inside)
  const g1314 = result.ageGroups.find(g => g.ageGroup === '13–14');
  assert(g1314, 'Group 13–14 must exist');
  assert.strictEqual(g1314.expected, 2);
  assert.strictEqual(g1314.inside, 1);
  assert.strictEqual(g1314.pickedUp, 0);
  assert.strictEqual(g1314.checkedIn, 1);
  assert.strictEqual(g1314.notArrived, 1);
  console.log('  ✓ Group 13–14 counts accurate');

  console.log('\n--- TEST 2: Mathematical Invariants Check ---');
  // Total valid children in fixtures: 3 + 3 + 2 + 2 + 2 = 12
  const totalValidExpected = 12;
  const totalCheckedIn = 8;
  const totalInside = 5;
  const totalPickedUp = 3;
  const totalNotArrived = 4;

  assert.strictEqual(result.stats.expected, totalValidExpected, 'Total expected must equal 12');
  assert.strictEqual(result.stats.checkedIn, totalCheckedIn, 'Total checked in must equal 8');
  assert.strictEqual(result.stats.inside, totalInside, 'Total inside must equal 5');
  assert.strictEqual(result.stats.pickedUp, totalPickedUp, 'Total picked up must equal 3');
  assert.strictEqual(result.stats.notArrived, totalNotArrived, 'Total not arrived must equal 4');

  // sum(groups) = total invariant
  const sumExpected = result.ageGroups.reduce((acc, curr) => acc + curr.expected, 0);
  const sumCheckedIn = result.ageGroups.reduce((acc, curr) => acc + curr.checkedIn, 0);
  const sumInside = result.ageGroups.reduce((acc, curr) => acc + curr.inside, 0);
  const sumPickedUp = result.ageGroups.reduce((acc, curr) => acc + curr.pickedUp, 0);
  const sumNotArrived = result.ageGroups.reduce((acc, curr) => acc + curr.notArrived, 0);

  assert.strictEqual(sumExpected, result.stats.expected, 'sum(groups.expected) must equal stats.expected');
  assert.strictEqual(sumCheckedIn, result.stats.checkedIn, 'sum(groups.checkedIn) must equal stats.checkedIn');
  assert.strictEqual(sumInside, result.stats.inside, 'sum(groups.inside) must equal stats.inside');
  assert.strictEqual(sumPickedUp, result.stats.pickedUp, 'sum(groups.pickedUp) must equal stats.pickedUp');
  assert.strictEqual(sumNotArrived, result.stats.notArrived, 'sum(groups.notArrived) must equal stats.notArrived');
  assert.strictEqual(sumCheckedIn + sumNotArrived, sumExpected, 'checkedIn + notArrived must equal expected');
  assert.strictEqual(sumInside + sumPickedUp, sumCheckedIn, 'inside + pickedUp must equal checkedIn');
  console.log('  ✓ Mathematical sum invariants verified 100%');

  console.log('\n--- TEST 3: Out-of-Range Children Isolation ---');
  assert.strictEqual(result.outOfRangeCount, 2, '2 out of range children identified');
  // Verify out of range children did not corrupt total expected:
  // If they were counted, total expected would be 14 instead of 12!
  assert.strictEqual(result.stats.expected, 12, 'Out of range children excluded from expected total');
  // Verify out of range children are included in needsAttention:
  assert(result.stats.needsAttention >= 2, 'Needs attention must flag out of range children');
  console.log('  ✓ Out-of-range children properly isolated from group counts and flagged for attention');

  console.log('\n================================================================');
  console.log('ALL ATTENDANCE AGGREGATION TESTS PASSED');
  console.log('================================================================');
}

runAttendanceAggregationTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
