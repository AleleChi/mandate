import assert from 'assert';
import crypto from 'crypto';
import express from 'express';
import { execute, query, queryOne } from '../src/server/db';
import adminRoutes from '../src/server/routes/admin';
import parentRoutes from '../src/server/routes/parent';
import { hashPassword, generateToken } from '../src/server/auth';

let passed = 0;
let failed = 0;

function report(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  [FAIL] ${msg}`);
    failed++;
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  [PASS] ${msg}`);
  passed++;
}

async function runTests() {
  console.log('======================================================================');
  console.log('TEST SUITE: EVENT SAVE & VENUE VISIBILITY TOGGLE INTEGRATION');
  console.log('======================================================================\n');

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api/parent', parentRoutes);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const runId = Date.now().toString();
  const testSuffix = runId.slice(-6);
  const testEventId = `ev-edit-${testSuffix}`;
  const adminUserId = `admin-edit-${testSuffix}`;
  const parent1UserId = `p1-edit-${testSuffix}`;
  const parent1ProfileId = `prof1-edit-${testSuffix}`;
  const child1Id = `c1-edit-${testSuffix}`;

  const parent2UserId = `p2-edit-${testSuffix}`;
  const parent2ProfileId = `prof2-edit-${testSuffix}`;
  const child2Id = `c2-edit-${testSuffix}`;

  try {
    const nowIso = new Date().toISOString();

    // 1. Setup Admin
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'super_admin', 'active', 1, ?, ?)
    `, [adminUserId, `admin_${testSuffix}@koinonia.test`, hashPassword('AdminPass123!'), nowIso, nowIso]);

    const adminToken = generateToken(adminUserId);
    const adminHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    };

    // 2. Setup Target Event with default venue visibility 0
    await execute(`
      INSERT INTO events (
        id, title, section_name, location, starts_at, ends_at,
        daily_start_time, daily_end_time, status, venue_visible_to_selected_parents,
        created_at, updated_at
      ) VALUES (
        ?, 'The General Assembly 2026', 'Children and Teens',
        'Hillside Event Centre, Mabushi by Ministers Hill', '2026-11-21', '2026-11-22',
        '08:00', '13:00', 'published', 0,
        ?, ?
      )
    `, [testEventId, nowIso, nowIso]);

    // 3. Setup Parents and Children
    // Parent 1: Child is SELECTED
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'parent', 'active', 1, ?, ?)
    `, [parent1UserId, `parent1_${testSuffix}@koinonia.test`, hashPassword('ParentPass123!'), nowIso, nowIso]);
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Pastor Emmanuel', '+2348030000001', ?, ?)
    `, [parent1ProfileId, parent1UserId, nowIso, nowIso]);
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES (?, ?, 'Josiah Emmanuel', 'male', '2019-05-15', ?, ?)
    `, [child1Id, parent1ProfileId, nowIso, nowIso]);
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', 0, ?, ?)
    `, [`entry-1-${testSuffix}`, child1Id, testEventId, nowIso, nowIso]);

    // Parent 2: Child is UNDER_REVIEW (Not selected)
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'parent', 'active', 1, ?, ?)
    `, [parent2UserId, `parent2_${testSuffix}@koinonia.test`, hashPassword('ParentPass123!'), nowIso, nowIso]);
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Brother Joshua', '+2348030000002', ?, ?)
    `, [parent2ProfileId, parent2UserId, nowIso, nowIso]);
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES (?, ?, 'Rebekah Joshua', 'female', '2020-03-20', ?, ?)
    `, [child2Id, parent2ProfileId, nowIso, nowIso]);
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, 'under_review', 0, ?, ?)
    `, [`entry-2-${testSuffix}`, child2Id, testEventId, nowIso, nowIso]);

    const parent1Token = generateToken(parent1UserId);
    const parent2Token = generateToken(parent2UserId);

    // 4. Setup Event Age Groups
    const initialGroups = [
      { id: `grp-1-${testSuffix}`, label: 'Ages 1–3', minAge: 1, maxAge: 3, capacity: 150 },
      { id: `grp-2-${testSuffix}`, label: 'Ages 4–6', minAge: 4, maxAge: 6, capacity: 400 },
      { id: `grp-3-${testSuffix}`, label: 'Ages 7–9', minAge: 7, maxAge: 9, capacity: 400 },
      { id: `grp-4-${testSuffix}`, label: 'Ages 10–12', minAge: 10, maxAge: 12, capacity: 400 }
    ];

    for (let i = 0; i < initialGroups.length; i++) {
      const g = initialGroups[i];
      await execute(`
        INSERT INTO event_age_groups (
          id, event_id, label, min_age, max_age, capacity, manual_review, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `, [g.id, testEventId, g.label, g.minAge, g.maxAge, g.capacity, i, nowIso, nowIso]);
    }

    console.log('[Phase 1] Verify Initial State');
    const initEv = await queryOne('SELECT * FROM events WHERE id = ?', [testEventId]);
    report(initEv.venue_visible_to_selected_parents === 0, 'Initial venue visibility is 0 (OFF)');
    report(initEv.starts_at === '2026-11-21', 'Event date is 2026-11-21');
    report(initEv.daily_start_time === '08:00', 'Daily start time is 08:00');
    report(initEv.daily_end_time === '13:00', 'Daily end time is 13:00');

    console.log('\n[Phase 2] Test POST /api/admin/events/:eventId/venue-visibility Toggle ON');
    const toggleOnRes = await fetch(`${baseUrl}/api/admin/events/${testEventId}/venue-visibility`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ visible: true })
    });
    report(toggleOnRes.status === 200, `Toggle ON returns 200 OK (status: ${toggleOnRes.status})`);
    const toggleOnData = await toggleOnRes.json();
    report(toggleOnData.success === true, 'Toggle ON response success is true');
    report(toggleOnData.showVenueToSelectedParents === true, 'Response showVenueToSelectedParents is true');
    report(Boolean(toggleOnData.releasedAt), 'Response contains releasedAt timestamp');

    const evAfterToggleOn = await queryOne('SELECT * FROM events WHERE id = ?', [testEventId]);
    report(evAfterToggleOn.venue_visible_to_selected_parents === 1, 'Database venue_visible_to_selected_parents is now 1');
    report(Boolean(evAfterToggleOn.venue_visibility_released_at), 'Database venue_visibility_released_at is populated');
    report(evAfterToggleOn.venue_visibility_released_by === adminUserId, 'Database venue_visibility_released_by matches admin user id');

    // Check audit log
    const auditOn = await queryOne("SELECT * FROM audit_logs WHERE target_id = ? AND action = 'Update Event Venue Visibility' ORDER BY timestamp DESC", [testEventId]);
    report(Boolean(auditOn), 'Audit log entry recorded for Toggle ON');
    const auditDetailsOn = JSON.parse(auditOn.details);
    report(auditDetailsOn.newValue === true, 'Audit log details show newValue === true');

    console.log('\n[Phase 3] Test Parent Portal Venue Access While Toggle is ON');
    // Parent 1 (Selected): Can see venue address
    const p1AccessOn = await fetch(`${baseUrl}/api/parent/events/${testEventId}/venue-access`, {
      headers: { 'Authorization': `Bearer ${parent1Token}` }
    });
    const p1AccessOnData = await p1AccessOn.json();
    report(p1AccessOnData.success === true, 'Parent 1 venue access call succeeded');
    report(p1AccessOnData.eligible === true, 'Parent 1 is eligible');
    report(p1AccessOnData.venueReleased === true, 'Parent 1 venueReleased is true');
    report(p1AccessOnData.venueAddress === 'Hillside Event Centre, Mabushi by Ministers Hill', 'Parent 1 sees full venue address');

    // Parent 2 (Not Selected): CANNOT see venue address even when toggle is ON
    const p2AccessOn = await fetch(`${baseUrl}/api/parent/events/${testEventId}/venue-access`, {
      headers: { 'Authorization': `Bearer ${parent2Token}` }
    });
    const p2AccessOnData = await p2AccessOn.json();
    report(p2AccessOnData.eligible === false, 'Parent 2 is not eligible');
    report(p2AccessOnData.venueReleased === false, 'Parent 2 venueReleased is false');
    report(!p2AccessOnData.venueAddress, 'Parent 2 venueAddress is NOT exposed');

    console.log('\n[Phase 4] Test POST /api/admin/events/:eventId/venue-visibility Toggle OFF');
    const toggleOffRes = await fetch(`${baseUrl}/api/admin/events/${testEventId}/venue-visibility`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ visible: false })
    });
    report(toggleOffRes.status === 200, `Toggle OFF returns 200 OK (status: ${toggleOffRes.status})`);
    const toggleOffData = await toggleOffRes.json();
    report(toggleOffData.showVenueToSelectedParents === false, 'Toggle OFF response showVenueToSelectedParents is false');

    const evAfterToggleOff = await queryOne('SELECT * FROM events WHERE id = ?', [testEventId]);
    report(evAfterToggleOff.venue_visible_to_selected_parents === 0, 'Database venue_visible_to_selected_parents is now 0');

    // Parent 1 (Selected): Now sees venue pending message, NOT address
    const p1AccessOff = await fetch(`${baseUrl}/api/parent/events/${testEventId}/venue-access`, {
      headers: { 'Authorization': `Bearer ${parent1Token}` }
    });
    const p1AccessOffData = await p1AccessOff.json();
    report(p1AccessOffData.venueReleased === false, 'Parent 1 venueReleased is now false');
    report(p1AccessOffData.venueAddress === null, 'Parent 1 venueAddress is redacted');

    console.log('\n[Phase 5] Test PATCH /api/admin/events/:eventId Venue-Only Edit (Preserving Age Groups)');
    const updatedLocation = 'Hillside Event Centre, Mabushi by Ministers Hill, Abuja FCT';
    const patchRes = await fetch(`${baseUrl}/api/admin/events/${testEventId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'The General Assembly 2026',
        sectionName: 'Children and Teens',
        location: updatedLocation,
        startsAt: '2026-11-21',
        endsAt: '2026-11-22',
        dailyStartTime: '08:00',
        dailyEndTime: '13:00',
        showVenueToSelectedParents: false,
        ageGroups: initialGroups
      })
    });
    report(patchRes.status === 200, `PATCH event returns 200 OK (status: ${patchRes.status})`);
    const patchData = await patchRes.json();
    report(patchData.success === true, 'PATCH response success is true');

    const evAfterPatch = await queryOne('SELECT * FROM events WHERE id = ?', [testEventId]);
    report(evAfterPatch.location === updatedLocation, 'Event location updated in DB');
    report(evAfterPatch.starts_at === '2026-11-21', 'Starts at remains 2026-11-21');
    report(evAfterPatch.ends_at === '2026-11-22', 'Ends at remains 2026-11-22');
    report(evAfterPatch.venue_visible_to_selected_parents === 0, 'Venue visibility preserved as 0');

    // CRITICAL MANDATE CHECK: Verify all age groups preserved with original IDs
    const groupsAfterPatch = await query('SELECT * FROM event_age_groups WHERE event_id = ? ORDER BY sort_order ASC', [testEventId]);
    report(groupsAfterPatch.length === initialGroups.length, `Age groups count is unchanged (${groupsAfterPatch.length})`);
    for (let i = 0; i < initialGroups.length; i++) {
      report(groupsAfterPatch[i].id === initialGroups[i].id, `Age group ${i} retained exact original ID: ${groupsAfterPatch[i].id}`);
      report(groupsAfterPatch[i].label === initialGroups[i].label, `Age group ${i} label preserved`);
    }

    console.log('\n[Phase 6] Test PATCH /api/admin/events/:eventId with Venue Visibility Toggle in Edit Form');
    const patchToggleOnRes = await fetch(`${baseUrl}/api/admin/events/${testEventId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        location: updatedLocation,
        showVenueToSelectedParents: true,
        ageGroups: initialGroups
      })
    });
    report(patchToggleOnRes.status === 200, `PATCH with venue toggle returns 200 OK (status: ${patchToggleOnRes.status})`);
    const evAfterPatchToggle = await queryOne('SELECT * FROM events WHERE id = ?', [testEventId]);
    report(evAfterPatchToggle.venue_visible_to_selected_parents === 1, 'Venue visibility updated to 1 via PATCH');
    report(Boolean(evAfterPatchToggle.venue_visibility_released_at), 'Released timestamp set via PATCH');

    console.log('\n[Phase 7] Test PATCH with Age Group Modifications (Preserving existing IDs & adding new)');
    const modifiedGroups = [
      { id: initialGroups[0].id, label: 'Ages 1–3', minAge: 1, maxAge: 3, capacity: 180 }, // changed cap
      { id: initialGroups[1].id, label: 'Ages 4–6', minAge: 4, maxAge: 6, capacity: 400 },
      { id: initialGroups[2].id, label: 'Ages 7–9', minAge: 7, maxAge: 9, capacity: 400 },
      { id: initialGroups[3].id, label: 'Ages 10–12', minAge: 10, maxAge: 12, capacity: 400 },
      { label: 'Ages 13–14', minAge: 13, maxAge: 14, capacity: 250 } // new group
    ];
    const patchAgeGroupsRes = await fetch(`${baseUrl}/api/admin/events/${testEventId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        ageGroups: modifiedGroups
      })
    });
    report(patchAgeGroupsRes.status === 200, 'PATCH with modified age groups returns 200 OK');

    const groupsAfterMod = await query('SELECT * FROM event_age_groups WHERE event_id = ? ORDER BY sort_order ASC', [testEventId]);
    report(groupsAfterMod.length === 5, 'Group count increased from 4 to 5');
    report(groupsAfterMod[0].id === initialGroups[0].id, 'Existing group 0 retained its ID');
    report(Number(groupsAfterMod[0].capacity) === 180, 'Existing group 0 updated its capacity to 180');
    report(groupsAfterMod[4].label === 'Ages 13–14', 'New group inserted with label Ages 13–14');
    report(groupsAfterMod[4].id.startsWith('group-'), 'New group has generated ID');

    console.log(`\n======================================================================`);
    console.log(`ALL INTEGRATION TESTS PASSED: ${passed} passed, ${failed} failed.`);
    console.log(`======================================================================\n`);
  } finally {
    server.close();
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('\nTest Suite Failed:', err);
  process.exit(1);
});
