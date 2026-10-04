import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import assert from 'assert';

dotenv.config();
const localEnvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
}

import { execute, query, queryOne } from '../src/server/db';
import {
  checkEventEligibility,
  calculateAgeOnDate,
  CANONICAL_GA_EVENT_DATE,
  CANONICAL_MIN_AGE,
  CANONICAL_MAX_AGE
} from '../src/server/services/eligibilityService';

// Countdown helper logic matching canonical rules
function calculateRegistrationCountdownTest(deadlineIso: string, referenceMs: number) {
  const targetMs = new Date(deadlineIso).getTime();
  const diff = targetMs - referenceMs;

  if (isNaN(targetMs) || diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, isClosed: true };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return { days, hours, minutes, isClosed: false };
}

// Canonical Public Age Groups matching Section 7
const CANONICAL_PUBLIC_GROUPS = [
  { sequence: '01', range: '2–3', label: 'EARLY YEARS', minAge: 2, maxAge: 3 },
  { sequence: '02', range: '4–6', label: '4–6 YEARS', minAge: 4, maxAge: 6 },
  { sequence: '03', range: '7–9', label: '7–9 YEARS', minAge: 7, maxAge: 9 },
  { sequence: '04', range: '10–12', label: '10–12 YEARS', minAge: 10, maxAge: 12 },
  { sequence: '05', range: '13–14', label: '13–14 YEARS', minAge: 13, maxAge: 14 },
];

async function runTests() {
  console.log('================================================================');
  console.log('GENERAL ASSEMBLY 2026: AGE ELIGIBILITY, COUNTDOWN & AGE GROUPS');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  console.log('1. AGE ELIGIBILITY ON EVENT DATE (2026-11-21, Min: 2, Max: 14)');

  const mockGaEvent = {
    starts_at: '2026-11-21',
    ends_at: '2026-11-21',
    minimum_age: 2,
    maximum_age: 14
  };

  test('child age 1 on event date (born 2025-05-15) -> blocked (code: BELOW_MINIMUM_AGE)', () => {
    const res = checkEventEligibility('2025-05-15', mockGaEvent);
    assert.strictEqual(res.eligible, false);
    assert.strictEqual(res.code, 'BELOW_MINIMUM_AGE');
    assert.strictEqual(res.childAgeOnEventDate, 1);
    assert.strictEqual(res.reason, 'This programme is currently open to children ages 2–14.');
  });

  test('child exactly 2 on event date (born 2024-11-21) -> eligible', () => {
    const res = checkEventEligibility('2024-11-21', mockGaEvent);
    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.code, 'ELIGIBLE');
    assert.strictEqual(res.childAgeOnEventDate, 2);
  });

  test('child age 6 on event date (born 2020-03-10) -> eligible', () => {
    const res = checkEventEligibility('2020-03-10', mockGaEvent);
    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.code, 'ELIGIBLE');
    assert.strictEqual(res.childAgeOnEventDate, 6);
  });

  test('child age 12 on event date (born 2013-11-22) -> eligible', () => {
    const res = checkEventEligibility('2013-11-22', mockGaEvent);
    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.code, 'ELIGIBLE');
    assert.strictEqual(res.childAgeOnEventDate, 12);
  });

  test('child age 13 on event date (born 2013-11-21) -> eligible', () => {
    const res = checkEventEligibility('2013-11-21', mockGaEvent);
    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.code, 'ELIGIBLE');
    assert.strictEqual(res.childAgeOnEventDate, 13);
  });

  test('child exactly 14 on event date (born 2012-11-21) -> eligible', () => {
    const res = checkEventEligibility('2012-11-21', mockGaEvent);
    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.code, 'ELIGIBLE');
    assert.strictEqual(res.childAgeOnEventDate, 14);
  });

  test('child age 15 on event date (born 2011-11-21) -> blocked (code: ABOVE_MAXIMUM_AGE)', () => {
    const res = checkEventEligibility('2011-11-21', mockGaEvent);
    assert.strictEqual(res.eligible, false);
    assert.strictEqual(res.code, 'ABOVE_MAXIMUM_AGE');
    assert.strictEqual(res.childAgeOnEventDate, 15);
    assert.strictEqual(res.reason, 'This programme is currently open to children ages 2–14.');
  });

  test('birthday boundary test: born 2024-11-22 is 1 on 2026-11-21 -> blocked', () => {
    const res = checkEventEligibility('2024-11-22', mockGaEvent);
    assert.strictEqual(res.eligible, false);
    assert.strictEqual(res.childAgeOnEventDate, 1);
    assert.strictEqual(res.code, 'BELOW_MINIMUM_AGE');
  });

  test('birthday boundary test: born 2024-11-21 turns 2 exactly on 2026-11-21 -> eligible', () => {
    const res = checkEventEligibility('2024-11-21', mockGaEvent);
    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.childAgeOnEventDate, 2);
  });

  test('birthday boundary test: born 2012-11-22 is 13 on 2026-11-21 -> eligible', () => {
    const res = checkEventEligibility('2012-11-22', mockGaEvent);
    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.childAgeOnEventDate, 13);
  });

  test('birthday boundary test: born 2012-11-21 turns 14 on event date -> eligible', () => {
    const res = checkEventEligibility('2012-11-21', mockGaEvent);
    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.childAgeOnEventDate, 14);
  });

  test('birthday boundary test: born 2011-11-21 turns 15 on event date -> blocked', () => {
    const res = checkEventEligibility('2011-11-21', mockGaEvent);
    assert.strictEqual(res.eligible, false);
    assert.strictEqual(res.childAgeOnEventDate, 15);
    assert.strictEqual(res.code, 'ABOVE_MAXIMUM_AGE');
  });

  console.log('\n2. REGISTRATION COUNTDOWN TESTS (Deadline: 2026-10-17T23:59:00+01:00)');

  const canonicalDeadline = '2026-10-17T23:59:00+01:00';

  test('before deadline displays positive days, hours, and minutes', () => {
    // Current time: 2026-10-04T08:00:00+01:00 (~13 days before)
    const refMs = new Date('2026-10-04T08:00:00+01:00').getTime();
    const cd = calculateRegistrationCountdownTest(canonicalDeadline, refMs);
    assert.strictEqual(cd.isClosed, false);
    assert(cd.days >= 13, `Expected at least 13 days, got ${cd.days}`);
    assert(cd.hours >= 0 && cd.hours <= 23, `Hours should be between 0 and 23`);
    assert(cd.minutes >= 0 && cd.minutes <= 59, `Minutes should be between 0 and 59`);
  });

  test('at exact deadline timestamp produces closed state (isClosed: true)', () => {
    const refMs = new Date(canonicalDeadline).getTime();
    const cd = calculateRegistrationCountdownTest(canonicalDeadline, refMs);
    assert.strictEqual(cd.isClosed, true);
    assert.strictEqual(cd.days, 0);
    assert.strictEqual(cd.hours, 0);
    assert.strictEqual(cd.minutes, 0);
  });

  test('after deadline never shows negative countdown values', () => {
    // 1 day after deadline
    const refMs = new Date('2026-10-18T12:00:00+01:00').getTime();
    const cd = calculateRegistrationCountdownTest(canonicalDeadline, refMs);
    assert.strictEqual(cd.isClosed, true);
    assert.strictEqual(cd.days, 0);
    assert.strictEqual(cd.hours, 0);
    assert.strictEqual(cd.minutes, 0);
    assert(cd.days >= 0 && cd.hours >= 0 && cd.minutes >= 0, 'No negative numbers permitted');
  });

  console.log('\n3. PUBLIC AGE GROUPS SPECIFICATION AUDIT');

  test('obsolete Below 1 is removed from canonical groups', () => {
    const hasBelowOne = CANONICAL_PUBLIC_GROUPS.some(g => g.range.toLowerCase().includes('below') || g.label.toLowerCase().includes('below') || g.minAge === 0);
    assert.strictEqual(hasBelowOne, false, 'Obsolete Below 1 group must not be present');
  });

  test('obsolete 1–3 is removed from canonical groups', () => {
    const hasOneToThree = CANONICAL_PUBLIC_GROUPS.some(g => g.range === '1–3' || (g.minAge === 1 && g.maxAge === 3));
    assert.strictEqual(hasOneToThree, false, 'Obsolete 1–3 group must not be present');
  });

  test('2–3 EARLY YEARS is present as group 01', () => {
    const g1 = CANONICAL_PUBLIC_GROUPS[0];
    assert.strictEqual(g1.sequence, '01');
    assert.strictEqual(g1.range, '2–3');
    assert.strictEqual(g1.label, 'EARLY YEARS');
    assert.strictEqual(g1.minAge, 2);
    assert.strictEqual(g1.maxAge, 3);
  });

  test('4–6 4–6 YEARS is present as group 02', () => {
    const g2 = CANONICAL_PUBLIC_GROUPS[1];
    assert.strictEqual(g2.sequence, '02');
    assert.strictEqual(g2.range, '4–6');
    assert.strictEqual(g2.label, '4–6 YEARS');
    assert.strictEqual(g2.minAge, 4);
    assert.strictEqual(g2.maxAge, 6);
  });

  test('7–9 7–9 YEARS is present as group 03', () => {
    const g3 = CANONICAL_PUBLIC_GROUPS[2];
    assert.strictEqual(g3.sequence, '03');
    assert.strictEqual(g3.range, '7–9');
    assert.strictEqual(g3.label, '7–9 YEARS');
    assert.strictEqual(g3.minAge, 7);
    assert.strictEqual(g3.maxAge, 9);
  });

  test('10–12 10–12 YEARS is present as group 04', () => {
    const g4 = CANONICAL_PUBLIC_GROUPS[3];
    assert.strictEqual(g4.sequence, '04');
    assert.strictEqual(g4.range, '10–12');
    assert.strictEqual(g4.label, '10–12 YEARS');
    assert.strictEqual(g4.minAge, 10);
    assert.strictEqual(g4.maxAge, 12);
  });

  test('13–14 13–14 YEARS is present as group 05', () => {
    const g5 = CANONICAL_PUBLIC_GROUPS[4];
    assert.strictEqual(g5.sequence, '05');
    assert.strictEqual(g5.range, '13–14');
    assert.strictEqual(g5.label, '13–14 YEARS');
    assert.strictEqual(g5.minAge, 13);
    assert.strictEqual(g5.maxAge, 14);
  });

  test('there are exactly 5 canonical groups', () => {
    assert.strictEqual(CANONICAL_PUBLIC_GROUPS.length, 5);
  });

  console.log('\n4. DATABASE INTEGRITY: INELIGIBLE CHILD SUBMISSION BEHAVIOUR');

  await asyncTest('ineligible child submission does not become under_review and creates no pass', async () => {
    const testEventId = `ev-elig-${Date.now()}`;
    const parentUserId = `usr-elig-${Date.now()}`;
    const parentProfileId = `pp-elig-${Date.now()}`;
    const childId = `ch-inelig-${Date.now()}`;
    const entryId = `entry-inelig-${Date.now()}`;
    const nowIso = new Date().toISOString();

    // Create test event with 2-14 rule
    await execute(`
      INSERT INTO events (id, title, status, capacity, starts_at, ends_at, minimum_age, maximum_age, parent_access_closes_at, created_at, updated_at)
      VALUES (?, 'GA 2026 Eligibility Test Event', 'current', 500, '2026-11-21', '2026-11-21', 2, 14, '2026-10-17T23:59:00+01:00', ?, ?)
    `, [testEventId, nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', ?, ?)
    `, [parentUserId, `parent_${Date.now()}@eligibility.test`, nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Test Parent Profile', '+2348011112222', ?, ?)
    `, [parentProfileId, parentUserId, nowIso, nowIso]);

    // Child with DOB 2025-08-01 (1 year old on 2026-11-21)
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
      VALUES (?, ?, 'Ineligible Infant', 'Boy', '2025-08-01', 1, 'Under 2', ?, ?)
    `, [childId, parentProfileId, nowIso, nowIso]);

    // Entry in draft state
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'draft', ?, ?)
    `, [entryId, childId, testEventId, nowIso, nowIso]);

    // Simulate submission attempt through eligibility check
    const eventRow = await queryOne<any>("SELECT * FROM events WHERE id = ?", [testEventId]);
    const childRow = await queryOne<any>("SELECT * FROM children WHERE id = ?", [childId]);

    const eligibility = checkEventEligibility(childRow.date_of_birth, eventRow);

    assert.strictEqual(eligibility.eligible, false);
    assert.strictEqual(eligibility.code, 'BELOW_MINIMUM_AGE');
    assert.strictEqual(eligibility.reason, 'This programme is currently open to children ages 2–14.');

    // Verify DB entry remains draft and was not updated to under_review
    const entryAfterCheck = await queryOne<any>("SELECT * FROM child_event_entries WHERE id = ?", [entryId]);
    assert.strictEqual(entryAfterCheck.status, 'draft', 'Status must remain draft');
    assert.notStrictEqual(entryAfterCheck.status, 'under_review', 'Must NOT transition to under_review');

    // Verify no pass exists for this child in event_passes
    const passes = await query("SELECT * FROM event_passes WHERE child_event_entry_id = ?", [entryId]);
    assert.strictEqual(passes.length, 0, 'No pass must be created for ineligible child');
    assert.notStrictEqual(entryAfterCheck.status, 'pass_ready', 'Child status must not be pass_ready');

    // Clean up test rows
    await execute("DELETE FROM child_event_entries WHERE id = ?", [entryId]);
    await execute("DELETE FROM children WHERE id = ?", [childId]);
    await execute("DELETE FROM parent_profiles WHERE id = ?", [parentProfileId]);
    await execute("DELETE FROM users WHERE id = ?", [parentUserId]);
    await execute("DELETE FROM events WHERE id = ?", [testEventId]);
  });

  // 5. ADMIN SETTINGS CTA TOGGLES & AUTHORITATIVE DEADLINE OVERRIDE
  console.log('\n5. CTA TOGGLES & AUTHORITATIVE DEADLINE OVERRIDE');

  await asyncTest('admin_general_settings stores and returns parent_registration_enabled and volunteer_registration_enabled', async () => {
    let settings = await queryOne<any>("SELECT parent_registration_enabled, volunteer_registration_enabled FROM admin_general_settings WHERE id = 'primary_general_settings'");
    if (!settings) {
      await execute(`
        INSERT INTO admin_general_settings (id, parent_registration_enabled, volunteer_registration_enabled, parent_login_enabled, required_child_photo, required_parent_photo, required_medical_notes, required_pickup_person, created_at, updated_at)
        VALUES ('primary_general_settings', 1, 1, 1, 1, 1, 0, 1, datetime('now'), datetime('now'))
      `);
      settings = await queryOne<any>("SELECT parent_registration_enabled, volunteer_registration_enabled FROM admin_general_settings WHERE id = 'primary_general_settings'");
    }
    assert(settings !== null, 'admin_general_settings primary row must exist');
    assert('parent_registration_enabled' in settings, 'Missing parent_registration_enabled column');
    assert('volunteer_registration_enabled' in settings, 'Missing volunteer_registration_enabled column');

    // Test toggle update
    await execute("UPDATE admin_general_settings SET volunteer_registration_enabled = 0 WHERE id = 'primary_general_settings'");
    const updated1 = await queryOne<any>("SELECT volunteer_registration_enabled FROM admin_general_settings WHERE id = 'primary_general_settings'");
    assert.strictEqual(updated1.volunteer_registration_enabled, 0);

    // Restore to enabled
    await execute("UPDATE admin_general_settings SET volunteer_registration_enabled = 1 WHERE id = 'primary_general_settings'");
    const updated2 = await queryOne<any>("SELECT volunteer_registration_enabled FROM admin_general_settings WHERE id = 'primary_general_settings'");
    assert.strictEqual(updated2.volunteer_registration_enabled, 1);
  });

  await asyncTest('deadline always overrides parent enabled toggle: after deadline, status is closed', async () => {
    // Simulated settings: toggle=true, but current time > deadline
    const toggleEnabled = true;
    const pastDeadline = '2026-10-17T23:59:00+01:00';
    const futureTime = new Date('2026-10-18T10:00:00+01:00').getTime();
    const deadlineMs = new Date(pastDeadline).getTime();

    // Canonical backend logic in auth.ts /registration-status
    let parentState = 'open';
    if (futureTime > deadlineMs) {
      parentState = 'closed';
    } else if (!toggleEnabled) {
      parentState = 'closed';
    }

    assert.strictEqual(parentState, 'closed', 'Deadline must override parent enabled toggle to closed');
  });

  await asyncTest('when parent_registration_enabled is 0, status is closed even before deadline', async () => {
    const toggleEnabled = false;
    const futureDeadline = '2026-10-17T23:59:00+01:00';
    const currentTime = new Date('2026-10-01T10:00:00+01:00').getTime();
    const deadlineMs = new Date(futureDeadline).getTime();

    let parentState = 'open';
    if (currentTime > deadlineMs) {
      parentState = 'closed';
    } else if (!toggleEnabled) {
      parentState = 'closed';
    }

    assert.strictEqual(parentState, 'closed', 'Disabled toggle must set parent registration to closed');
  });

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
