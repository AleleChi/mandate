import { query, queryOne, execute, transaction } from '../src/server/db';
import { getChildSummaryStats } from '../src/server/services/childSummaryService';
import { calculateAgeOnDate, CANONICAL_GA_EVENT_DATE } from '../src/server/services/eligibilityService';
import { deriveAgeGroup } from '../src/server/routes/admin';

async function runAttendanceIntegrityTests() {
  console.log('================================================================');
  console.log('KOINONIA ATTENDANCE DATA-INTEGRITY & RECONCILIATION TEST SUITE');
  console.log('================================================================\n');

  const EVENT_ID = 'event-ga-2026';
  const OTHER_EVENT_ID = 'other-test-event-999';

  // 1. Cleanup any previous test fixtures
  await execute("DELETE FROM child_event_entries WHERE id LIKE 'att-fix-%'");
  await execute("DELETE FROM children WHERE id LIKE 'att-child-%'");
  await execute("DELETE FROM parent_profiles WHERE id LIKE 'att-parent-%'");
  await execute("DELETE FROM users WHERE id LIKE 'att-user-%'");
  await execute("DELETE FROM events WHERE id = ?", [OTHER_EVENT_ID]);

  // Insert other test event
  await execute(`
    INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
    VALUES (?, 'Other Non-Current Event', 'archived', '2026-10-01', '2026-10-02', datetime('now'), datetime('now'))
  `, [OTHER_EVENT_ID]);

  // Insert a test parent user & profile
  await execute(`
    INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
    VALUES ('att-user-1', 'att_parent@example.com', 'hash', 'parent', datetime('now'), datetime('now'))
  `);
  await execute(`
    INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
    VALUES ('att-parent-1', 'att-user-1', 'David TestParent', '+2348011112222', datetime('now'), datetime('now'))
  `);

  console.log('--- INSERTING FIXTURES A THROUGH K ---');

  // Fixture A: Selected/expected child, never arrived (age 5, 4–6 Years)
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
    VALUES ('att-child-A', 'att-parent-1', 'Child A Selected', 'female', '2021-06-15', datetime('now'), datetime('now'))
  `);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, details_confirmed, created_at, updated_at)
    VALUES ('att-fix-A', 'att-child-A', ?, 'selected', datetime('now'), 1, datetime('now'), datetime('now'))
  `, [EVENT_ID]);

  // Fixture B: Checked-in child (age 8, 7–9 Years)
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
    VALUES ('att-child-B', 'att-parent-1', 'Child B CheckedIn', 'male', '2018-05-10', datetime('now'), datetime('now'))
  `);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, submitted_at, details_confirmed, created_at, updated_at)
    VALUES ('att-fix-B', 'att-child-B', ?, 'checked_in', '2026-11-21T09:15:00Z', datetime('now'), 1, datetime('now'), datetime('now'))
  `, [EVENT_ID]);

  // Fixture C: Child currently inside (age 11, 10–12 Years)
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
    VALUES ('att-child-C', 'att-parent-1', 'Child C Inside', 'female', '2015-08-20', datetime('now'), datetime('now'))
  `);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, submitted_at, details_confirmed, created_at, updated_at)
    VALUES ('att-fix-C', 'att-child-C', ?, 'inside', '2026-11-21T09:30:00Z', datetime('now'), 1, datetime('now'), datetime('now'))
  `, [EVENT_ID]);

  // Fixture D: Picked-up child (age 3, Early Years)
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
    VALUES ('att-child-D', 'att-parent-1', 'Child D PickedUp', 'male', '2023-04-12', datetime('now'), datetime('now'))
  `);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, picked_up_at, submitted_at, details_confirmed, created_at, updated_at)
    VALUES ('att-fix-D', 'att-child-D', ?, 'picked_up', '2026-11-21T09:00:00Z', '2026-11-21T12:00:00Z', datetime('now'), 1, datetime('now'), datetime('now'))
  `, [EVENT_ID]);

  // Fixture E: Needs-attention child with care notes (age 6, 4–6 Years, pass_ready)
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
    VALUES ('att-child-E', 'att-parent-1', 'Child E NeedsAttn', 'female', '2020-03-01', datetime('now'), datetime('now'))
  `);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, has_medical_notes, medical_notes, submitted_at, details_confirmed, created_at, updated_at)
    VALUES ('att-fix-E', 'att-child-E', ?, 'pass_ready', 1, 'Inhaler in backpack', datetime('now'), 1, datetime('now'), datetime('now'))
  `, [EVENT_ID]);

  // Fixture F: Incomplete draft (MUST BE EXCLUDED FROM ATTENDANCE)
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
    VALUES ('att-child-F', 'att-parent-1', 'Child F Draft', 'male', '2020-01-01', datetime('now'), datetime('now'))
  `);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, details_confirmed, created_at, updated_at)
    VALUES ('att-fix-F', 'att-child-F', ?, 'incomplete', NULL, 0, datetime('now'), datetime('now'))
  `, [EVENT_ID]);

  // Fixture G: Rejected / Not selected child (MUST BE EXCLUDED FROM ATTENDANCE)
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
    VALUES ('att-child-G', 'att-parent-1', 'Child G Rejected', 'female', '2019-01-01', datetime('now'), datetime('now'))
  `);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, details_confirmed, created_at, updated_at)
    VALUES ('att-fix-G', 'att-child-G', ?, 'not_selected', datetime('now'), 1, datetime('now'), datetime('now'))
  `, [EVENT_ID]);

  // Fixture H: Child from another event (MUST BE EXCLUDED FROM ATTENDANCE)
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
    VALUES ('att-child-H', 'att-parent-1', 'Child H OtherEvent', 'male', '2019-05-01', datetime('now'), datetime('now'))
  `);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, details_confirmed, created_at, updated_at)
    VALUES ('att-fix-H', 'att-child-H', ?, 'selected', datetime('now'), 1, datetime('now'), datetime('now'))
  `, [OTHER_EVENT_ID]);

  // Fixture I: Age 2 on 2026-11-21 (DOB 2024-11-21, Early Years)
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
    VALUES ('att-child-I', 'att-parent-1', 'Child I Age2', 'female', '2024-11-21', datetime('now'), datetime('now'))
  `);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, details_confirmed, created_at, updated_at)
    VALUES ('att-fix-I', 'att-child-I', ?, 'selected', datetime('now'), 1, datetime('now'), datetime('now'))
  `, [EVENT_ID]);

  // Fixture J: Age 14 on 2026-11-21 (DOB 2012-11-21, 13–14 Years / Teens)
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
    VALUES ('att-child-J', 'att-parent-1', 'Child J Age14', 'male', '2012-11-21', datetime('now'), datetime('now'))
  `);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, details_confirmed, created_at, updated_at)
    VALUES ('att-fix-J', 'att-child-J', ?, 'selected', datetime('now'), 1, datetime('now'), datetime('now'))
  `, [EVENT_ID]);

  // Fixture K: Age 15 on 2026-11-21 (DOB 2011-11-21, under_review, ineligible, not selected)
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
    VALUES ('att-child-K', 'att-parent-1', 'Child K Ineligible', 'female', '2011-11-21', datetime('now'), datetime('now'))
  `);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, details_confirmed, created_at, updated_at)
    VALUES ('att-fix-K', 'att-child-K', ?, 'under_review', datetime('now'), 1, datetime('now'), datetime('now'))
  `, [EVENT_ID]);

  console.log('✅ Fixtures A through K inserted successfully.\n');

  // 2. RUN INDEPENDENT DIRECT DB COUNTS
  console.log('--- INDEPENDENT DIRECT DB ATTENDANCE QUERIES ---');
  const dbExpectedRes = await queryOne(`
    SELECT COUNT(*) as count
    FROM child_event_entries e
    JOIN children c ON c.id = e.child_id
    WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
      AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
  `, [EVENT_ID]);
  const dbExpected = dbExpectedRes?.count || 0;

  const dbCheckedInRes = await queryOne(`
    SELECT COUNT(*) as count
    FROM child_event_entries e
    JOIN children c ON c.id = e.child_id
    WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
      AND (e.status IN ('checked_in', 'inside', 'picked_up') OR e.checked_in_at IS NOT NULL)
  `, [EVENT_ID]);
  const dbCheckedIn = dbCheckedInRes?.count || 0;

  const dbInsideRes = await queryOne(`
    SELECT COUNT(*) as count
    FROM child_event_entries e
    JOIN children c ON c.id = e.child_id
    WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
      AND ((e.status IN ('checked_in', 'inside') OR e.checked_in_at IS NOT NULL) AND e.status != 'picked_up' AND e.picked_up_at IS NULL)
  `, [EVENT_ID]);
  const dbInside = dbInsideRes?.count || 0;

  const dbPickedUpRes = await queryOne(`
    SELECT COUNT(*) as count
    FROM child_event_entries e
    JOIN children c ON c.id = e.child_id
    WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
      AND (e.status = 'picked_up' OR e.picked_up_at IS NOT NULL)
  `, [EVENT_ID]);
  const dbPickedUp = dbPickedUpRes?.count || 0;

  const dbNotArrivedRes = await queryOne(`
    SELECT COUNT(*) as count
    FROM child_event_entries e
    JOIN children c ON c.id = e.child_id
    WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
      AND (e.status IN ('selected', 'pass_ready') AND e.checked_in_at IS NULL)
  `, [EVENT_ID]);
  const dbNotArrived = dbNotArrivedRes?.count || 0;

  const dbNeedsAttentionRes = await queryOne(`
    SELECT COUNT(*) as count
    FROM child_event_entries e
    JOIN children c ON c.id = e.child_id
    WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
      AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
      AND (e.has_medical_notes = 1 OR e.needs_extra_support = 1 OR c.needs_age_review = 1)
  `, [EVENT_ID]);
  const dbNeedsAttention = dbNeedsAttentionRes?.count || 0;

  console.log(`Direct DB Expected:        ${dbExpected}`);
  console.log(`Direct DB Checked in:      ${dbCheckedIn}`);
  console.log(`Direct DB Inside:          ${dbInside}`);
  console.log(`Direct DB Picked up:       ${dbPickedUp}`);
  console.log(`Direct DB Not arrived:     ${dbNotArrived}`);
  console.log(`Direct DB Needs attention: ${dbNeedsAttention}\n`);

  // 3. RUN BACKEND SERVICE STATS
  console.log('--- BACKEND SUMMARY SERVICE STATS ---');
  const serviceStats = await getChildSummaryStats(EVENT_ID);
  const apiExpected = serviceStats.selected;
  const apiCheckedIn = serviceStats.checkedIn;
  const apiInside = serviceStats.inside;
  const apiPickedUp = serviceStats.pickedUp;
  const apiNotArrived = Math.max(0, serviceStats.selected - serviceStats.checkedIn);
  const apiNeedsAttention = serviceStats.needsAttention;

  console.log(`API Expected:        ${apiExpected} | DB: ${dbExpected} | MATCH: ${apiExpected === dbExpected ? 'YES' : 'NO'}`);
  console.log(`API Checked in:      ${apiCheckedIn} | DB: ${dbCheckedIn} | MATCH: ${apiCheckedIn === dbCheckedIn ? 'YES' : 'NO'}`);
  console.log(`API Inside:          ${apiInside} | DB: ${dbInside} | MATCH: ${apiInside === dbInside ? 'YES' : 'NO'}`);
  console.log(`API Picked up:       ${apiPickedUp} | DB: ${dbPickedUp} | MATCH: ${apiPickedUp === dbPickedUp ? 'YES' : 'NO'}`);
  console.log(`API Not arrived:     ${apiNotArrived} | DB: ${dbNotArrived} | MATCH: ${apiNotArrived === dbNotArrived ? 'YES' : 'NO'}`);
  console.log(`API Needs attention: ${apiNeedsAttention} | DB: ${dbNeedsAttention} | MATCH: ${apiNeedsAttention === dbNeedsAttention ? 'YES' : 'NO'}\n`);

  if (apiExpected !== dbExpected || apiCheckedIn !== dbCheckedIn || apiInside !== dbInside || apiPickedUp !== dbPickedUp || apiNotArrived !== dbNotArrived || apiNeedsAttention !== dbNeedsAttention) {
    throw new Error('FAILED: Mismatch between API statistics and direct DB counts!');
  }

  // 4. MATHEMATICAL RECONCILIATION CHECKS
  console.log('--- RECONCILIATION PROOF ---');
  const sumInsidePickedUp = apiInside + apiPickedUp;
  console.log(`inside (${apiInside}) + pickedUp (${apiPickedUp}) = ${sumInsidePickedUp} === checkedIn (${apiCheckedIn}) -> ${sumInsidePickedUp === apiCheckedIn ? 'YES' : 'NO'}`);
  if (sumInsidePickedUp !== apiCheckedIn) {
    throw new Error(`Reconciliation failure: inside + pickedUp (${sumInsidePickedUp}) != checkedIn (${apiCheckedIn})`);
  }

  const sumNotArrivedCheckedIn = apiNotArrived + apiCheckedIn;
  console.log(`notArrived (${apiNotArrived}) + checkedIn (${apiCheckedIn}) = ${sumNotArrivedCheckedIn} === expected (${apiExpected}) -> ${sumNotArrivedCheckedIn === apiExpected ? 'YES' : 'NO'}`);
  if (sumNotArrivedCheckedIn !== apiExpected) {
    throw new Error(`Reconciliation failure: notArrived + checkedIn (${sumNotArrivedCheckedIn}) != expected (${apiExpected})`);
  }

  // 5. AGE GROUP BREAKDOWN RECONCILIATION
  console.log('\n--- AGE GROUP ATTENDANCE BREAKDOWN ---');
  const canonicalCohorts = [
    { key: 'Early Years', label: 'Early Years', min: 2, max: 3 },
    { key: '4–6 Years', label: '4–6 Years', min: 4, max: 6 },
    { key: '7–9 Years', label: '7–9 Years', min: 7, max: 9 },
    { key: '10–12 Years', label: '10–12 Years', min: 10, max: 12 },
    { key: '13–14 Years', label: '13–14 Years', min: 13, max: 14 }
  ];

  const allExpectedEntries = await query(`
    SELECT
      e.id,
      e.status,
      e.checked_in_at,
      e.picked_up_at,
      c.date_of_birth,
      c.calculated_age,
      c.age_group
    FROM child_event_entries e
    JOIN children c ON c.id = e.child_id
    WHERE e.event_id = ?
      AND (e.is_deleted = 0 OR e.is_deleted IS NULL)
      AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
      AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
  `, [EVENT_ID]);

  const ageGroupsMap = new Map<string, any>();
  for (const c of canonicalCohorts) {
    ageGroupsMap.set(c.key, {
      ageGroup: c.label,
      expected: 0,
      checkedIn: 0,
      inside: 0,
      pickedUp: 0,
      notArrived: 0
    });
  }

  for (const entry of allExpectedEntries) {
    let age = calculateAgeOnDate(entry.date_of_birth, CANONICAL_GA_EVENT_DATE);
    if (age === null && entry.calculated_age !== null && entry.calculated_age !== undefined) {
      age = Number(entry.calculated_age);
    }
    const safeAge = age !== null && age !== undefined ? age : -1;
    let cohort = canonicalCohorts.find(c => safeAge >= c.min && safeAge <= c.max);
    const cohortKey = cohort ? cohort.key : (safeAge < 2 ? canonicalCohorts[0].key : canonicalCohorts[canonicalCohorts.length - 1].key);
    const grp = ageGroupsMap.get(cohortKey);

    grp.expected++;
    const isPickedUp = entry.status === 'picked_up' || Boolean(entry.picked_up_at);
    const isInside = !isPickedUp && (entry.status === 'inside' || entry.status === 'checked_in' || Boolean(entry.checked_in_at));

    if (isPickedUp) {
      grp.checkedIn++;
      grp.pickedUp++;
    } else if (isInside) {
      grp.checkedIn++;
      grp.inside++;
    } else {
      grp.notArrived++;
    }
  }

  let totalAgeExpected = 0;
  let totalAgeCheckedIn = 0;
  let totalAgeInside = 0;
  let totalAgePickedUp = 0;
  let totalAgeNotArrived = 0;

  for (const [key, grp] of ageGroupsMap.entries()) {
    console.log(`[${grp.ageGroup}] Expected: ${grp.expected}, CheckedIn: ${grp.checkedIn}, Inside: ${grp.inside}, PickedUp: ${grp.pickedUp}, NotArrived: ${grp.notArrived}`);
    totalAgeExpected += grp.expected;
    totalAgeCheckedIn += grp.checkedIn;
    totalAgeInside += grp.inside;
    totalAgePickedUp += grp.pickedUp;
    totalAgeNotArrived += grp.notArrived;
  }

  console.log(`\nAge Table Sum Expected:    ${totalAgeExpected} === Global Expected (${apiExpected}) -> ${totalAgeExpected === apiExpected ? 'YES' : 'NO'}`);
  console.log(`Age Table Sum Checked In:  ${totalAgeCheckedIn} === Global Checked In (${apiCheckedIn}) -> ${totalAgeCheckedIn === apiCheckedIn ? 'YES' : 'NO'}`);
  console.log(`Age Table Sum Inside:      ${totalAgeInside} === Global Inside (${apiInside}) -> ${totalAgeInside === apiInside ? 'YES' : 'NO'}`);
  console.log(`Age Table Sum Picked Up:   ${totalAgePickedUp} === Global Picked Up (${apiPickedUp}) -> ${totalAgePickedUp === apiPickedUp ? 'YES' : 'NO'}`);
  console.log(`Age Table Sum Not Arrived: ${totalAgeNotArrived} === Global Not Arrived (${apiNotArrived}) -> ${totalAgeNotArrived === apiNotArrived ? 'YES' : 'NO'}`);

  if (totalAgeExpected !== apiExpected || totalAgeCheckedIn !== apiCheckedIn || totalAgeInside !== apiInside || totalAgePickedUp !== apiPickedUp || totalAgeNotArrived !== apiNotArrived) {
    throw new Error('FAILED: Age table column sums do not reconcile with global headline stats!');
  }

  // 6. POPULATION FILTERING VERIFICATION
  console.log('\n--- VERIFYING POPULATION EXCLUSIONS ---');
  const allEntriesInAttendance = allExpectedEntries.map(e => e.id);
  console.log(`Fixture F (incomplete draft) excluded: ${!allEntriesInAttendance.includes('att-fix-F') ? 'YES' : 'NO'}`);
  console.log(`Fixture G (not_selected / rejected) excluded: ${!allEntriesInAttendance.includes('att-fix-G') ? 'YES' : 'NO'}`);
  console.log(`Fixture H (other event) excluded: ${!allEntriesInAttendance.includes('att-fix-H') ? 'YES' : 'NO'}`);
  console.log(`Fixture K (age 15 ineligible under_review) excluded: ${!allEntriesInAttendance.includes('att-fix-K') ? 'YES' : 'NO'}`);

  if (allEntriesInAttendance.includes('att-fix-F') || allEntriesInAttendance.includes('att-fix-G') || allEntriesInAttendance.includes('att-fix-H') || allEntriesInAttendance.includes('att-fix-K')) {
    throw new Error('FAILED: Non-expected/ineligible entries leaked into Attendance population!');
  }

  // Clean up test fixtures
  await execute("DELETE FROM child_event_entries WHERE id LIKE 'att-fix-%'");
  await execute("DELETE FROM children WHERE id LIKE 'att-child-%'");
  await execute("DELETE FROM parent_profiles WHERE id LIKE 'att-parent-%'");
  await execute("DELETE FROM users WHERE id LIKE 'att-user-%'");
  await execute("DELETE FROM events WHERE id = ?", [OTHER_EVENT_ID]);

  console.log('\n================================================================');
  console.log('🎉 ALL ATTENDANCE INTEGRITY AND RECONCILIATION CHECKS PASSED (100%)');
  console.log('================================================================');
}

runAttendanceIntegrityTests().catch(err => {
  console.error('\n❌ ATTENDANCE TEST FAILURE:', err);
  process.exit(1);
});
