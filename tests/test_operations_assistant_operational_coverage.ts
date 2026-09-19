import { query, queryOne, execute } from '../src/server/db';
import { getCurrentEvent } from '../src/server/services/eventService';
import { operationsAssistantService } from '../src/server/services/operationsAssistantService';

export async function runOperationalCoverageTests() {
  console.log('====================================================');
  console.log('OPERATIONS ASSISTANT — OPERATIONAL COVERAGE TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`, detail ? JSON.stringify(detail) : '');
      failed++;
    }
  }

  const uid = Date.now();
  const nowIso = new Date().toISOString();
  const eventId = `test-cov-evt-${uid}`;

  const adminActor = { id: 'test-admin-cov', role: 'admin', email: 'admin@koinonia.org' };
  const teamActor = { id: 'test-team-cov', role: 'team', email: 'team@koinonia.org' };
  const volunteerActor = { id: 'test-vol-cov', role: 'volunteer', email: 'volunteer@koinonia.org' };
  const parentActor = { id: 'test-parent-cov', role: 'parent', email: 'parent@koinonia.org' };

  // Test Fixtures
  const testParent1Id = `tp1-${uid}`;
  const testParent2Id = `tp2-${uid}`;
  const testParentUser1Id = `usr-p1-${uid}`;
  const testParentUser2Id = `usr-p2-${uid}`;
  const testChild1Id = `tc1-${uid}`;
  const testChild2Id = `tc2-${uid}`;
  const testChild3Id = `tc3-${uid}`;
  const testChild4Id = `tc4-${uid}`;
  const testEntry1Id = `te1-${uid}`;
  const testEntry2Id = `te2-${uid}`;
  const testEntry3Id = `te3-${uid}`;
  const testEntry4Id = `te4-${uid}`;
  const testPickup1Id = `tpp1-${uid}`;
  const testLocationId = `tloc-${uid}`;
  const testUserId1 = `tusr1-${uid}`;
  const testUserId2 = `tusr2-${uid}`;
  const testVol1Id = `tvol1-${uid}`;
  const testVol2Id = `tvol2-${uid}`;
  const testAsgnId1 = `tasgn1-${uid}`;
  const testPresId1 = `tpres1-${uid}`;

  try {
    // 0. Create isolated test event
    await execute(`
      INSERT INTO events (id, title, status, starts_at, ends_at, capacity, created_at, updated_at)
      VALUES (?, 'Operational Coverage Test Event', 'draft', ?, ?, 100, ?, ?)
    `, [eventId, nowIso, nowIso, nowIso, nowIso]);

    // 1. Setup Parent Users and Profiles
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'parent', ?, ?), (?, ?, 'parent', ?, ?)
    `, [testParentUser1Id, `parent1.${uid}@test.org`, nowIso, nowIso, testParentUser2Id, `parent2.${uid}@test.org`, nowIso, nowIso]);

    // Parent 1 (Complete profile, 2 children)
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, email, profile_completed_at, whatsapp_consent_status, created_at, updated_at)
      VALUES (?, ?, 'Grace Parent', '+2348022222222', 'grace@parent.org', ?, 'opted_in', ?, ?)
    `, [testParent1Id, testParentUser1Id, nowIso, nowIso, nowIso]);

    // Setup Parent 2 (Incomplete profile: missing phone, profile_completed_at is null)
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, email, profile_completed_at, whatsapp_consent_status, created_at, updated_at)
      VALUES (?, ?, 'Incomplete Parent', NULL, 'incomplete@parent.org', NULL, 'unknown', ?, ?)
    `, [testParent2Id, testParentUser2Id, nowIso, nowIso]);

    // 2. Setup Children
    // Child 1: Inside, has pickup person with photo
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, created_at, updated_at)
      VALUES (?, ?, 'Inside Child', 'Female', '2019-05-10', 7, ?, ?)
    `, [testChild1Id, testParent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, information_confirmed, details_confirmed, created_at, updated_at)
      VALUES (?, ?, ?, 'inside', ?, 1, 1, ?, ?)
    `, [testEntry1Id, testChild1Id, eventId, nowIso, nowIso, nowIso]);

    await execute(`
      INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'parent', 'Grace Parent', 'Mother', '+2348022222222', 'photo-123', ?, ?)
    `, [testPickup1Id, testEntry1Id, nowIso, nowIso]);

    // Child 2: Selected, but NO pickup person, has medical notes
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, created_at, updated_at)
      VALUES (?, ?, 'Attention Child', 'Male', '2018-03-15', 8, ?, ?)
    `, [testChild2Id, testParent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, has_medical_notes, medical_notes, information_confirmed, details_confirmed, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', 1, 'Asthma inhaler required', 1, 1, ?, ?)
    `, [testEntry2Id, testChild2Id, eventId, nowIso, nowIso]);

    // Child 3: Parent 2 child, awaiting review, outstanding consent
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, created_at, updated_at)
      VALUES (?, ?, 'Awaiting Review Child', 'Male', '2021-01-01', 5, ?, ?)
    `, [testChild3Id, testParent2Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, information_confirmed, details_confirmed, created_at, updated_at)
      VALUES (?, ?, ?, 'under_review', 0, 0, ?, ?)
    `, [testEntry3Id, testChild3Id, eventId, nowIso, nowIso]);

    // Child 4: Picked up Child (checked in, then picked up)
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, created_at, updated_at)
      VALUES (?, ?, 'Picked Up Child', 'Female', '2019-01-01', 7, ?, ?)
    `, [testChild4Id, testParent1Id, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, picked_up_at, information_confirmed, details_confirmed, created_at, updated_at)
      VALUES (?, ?, ?, 'picked_up', ?, ?, 1, 1, ?, ?)
    `, [testEntry4Id, testChild4Id, eventId, nowIso, nowIso, nowIso, nowIso]);

    await execute(`
      INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'parent', 'Grace Parent', 'Mother', '+2348022222222', 'photo-picked-up', ?, ?)
    `, [`tpp4-${uid}`, testEntry4Id, nowIso, nowIso]);

    // 3. Setup Volunteer Fixtures
    // Volunteer 1: Approved, Assigned to Location, On duty
    // Volunteer 2: Approved, Unassigned
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'volunteer', ?, ?), (?, ?, 'volunteer', ?, ?)
    `, [testUserId1, `v1.${uid}@test.org`, nowIso, nowIso, testUserId2, `v2.${uid}@test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Assigned Vol', '+2348033333331', '+2348033333331', 'Ushering', 'approved', ?, ?),
             (?, ?, 'Unassigned Vol', '+2348033333332', '+2348033333332', 'Technical', 'approved', ?, ?)
    `, [testVol1Id, testUserId1, nowIso, nowIso, testVol2Id, testUserId2, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_locations (id, event_id, location_type, name, short_name, volunteer_capacity, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, 'hall', 'Test Location', 'TL', 4, 1, 1, ?, ?)
    `, [testLocationId, eventId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Lead', 'assigned', ?, ?, ?, ?)
    `, [testAsgnId1, eventId, testUserId1, testLocationId, nowIso, nowIso, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_duty_location_presence (id, event_id, user_id, event_location_id, source, started_at, updated_at)
      VALUES (?, ?, ?, ?, 'qr_scan', ?, ?)
    `, [testPresId1, eventId, testUserId1, testLocationId, nowIso, nowIso]);

    // =============================================================
    // TEST CHILD OPERATIONAL COVERAGE
    // =============================================================

    // 1. "which children are still awaiting review"
    const rReview = await operationsAssistantService.askQuestion('which children are still awaiting review', eventId, adminActor);
    assert(rReview.grounded === true && rReview.answer.includes('Awaiting Review Child'), 'Child Coverage: awaiting review identifies Child 3');

    // 2. "which children have not arrived"
    const rNotArrived = await operationsAssistantService.askQuestion('which children have not arrived', eventId, adminActor);
    assert(rNotArrived.grounded === true && rNotArrived.answer.includes('Attention Child'), 'Child Coverage: not arrived identifies Child 2');

    // 3. "which children are inside" / "who is inside right now"
    const rInside = await operationsAssistantService.askQuestion('which children are inside', eventId, adminActor);
    assert(rInside.grounded === true && rInside.answer.includes('Inside Child'), 'Child Coverage: children inside identifies Child 1');
    assert(!rInside.answer.includes('Picked Up Child'), 'Child Coverage: picked up child is NOT inside');

    const rWhoInside = await operationsAssistantService.askQuestion('who is inside right now', eventId, adminActor);
    assert(rWhoInside.grounded === true && rWhoInside.answer.includes('Inside Child') && !rWhoInside.answer.includes('Picked Up Child'), 'Child Coverage: who is inside right now identifies only inside child');

    // 4. "which children need attention"
    const rAttention = await operationsAssistantService.askQuestion('which children need attention', eventId, adminActor);
    assert(rAttention.grounded === true && rAttention.answer.includes('Attention Child'), 'Child Coverage: children needing attention identifies Child 2');

    // =============================================================
    // TEST PARENT OPERATIONAL COVERAGE
    // =============================================================

    // 5. "Which children are missing pickup information?"
    const rMissingPickup = await operationsAssistantService.askQuestion('Which children are missing pickup information?', eventId, adminActor);
    assert(rMissingPickup.grounded === true && rMissingPickup.answer.includes('Attention Child'), 'Parent Coverage: missing pickup info identifies Child 2');

    // 6. "Which parents have more than one registered child?"
    const rMultiChild = await operationsAssistantService.askQuestion('Which parents have more than one registered child?', eventId, adminActor);
    assert(rMultiChild.grounded === true && rMultiChild.answer.includes('Grace Parent'), 'Parent Coverage: parents with multiple children identifies Grace Parent');

    // 7. "Which parent has a child currently inside?"
    const rParentInside = await operationsAssistantService.askQuestion('Which parent has a child currently inside?', eventId, adminActor);
    assert(rParentInside.grounded === true && rParentInside.answer.includes('Grace Parent'), 'Parent Coverage: parent of child inside identifies Grace Parent');

    // 8. "Which children have incomplete guardian information?"
    const rIncompleteGuardian = await operationsAssistantService.askQuestion('Which children have incomplete guardian information?', eventId, adminActor);
    assert(rIncompleteGuardian.grounded === true && rIncompleteGuardian.answer.includes('Awaiting Review Child'), 'Parent Coverage: incomplete guardian identifies Child 3');

    // 9. "Which children have outstanding consent requirements?"
    const rConsent = await operationsAssistantService.askQuestion('Which children have outstanding consent requirements?', eventId, adminActor);
    assert(rConsent.grounded === true && rConsent.answer.includes('Awaiting Review Child'), 'Parent Coverage: outstanding consent identifies Child 3');

    // 10. "Which children are ready for pickup?"
    const rReadyPickup = await operationsAssistantService.askQuestion('Which children are ready for pickup?', eventId, adminActor);
    assert(rReadyPickup.grounded === true && rReadyPickup.answer.includes('Inside Child'), 'Parent Coverage: ready for pickup identifies Inside Child');
    assert(!rReadyPickup.answer.includes('Picked Up Child'), 'Parent Coverage: picked up child is NOT ready for pickup');
    assert(rReadyPickup.answer.includes('currently inside and has not been picked up'), 'Parent Coverage: truthful answer phrasing used');

    // =============================================================
    // TEST VOLUNTEER OPERATIONAL COVERAGE
    // =============================================================

    // 11. "Which approved volunteers are unassigned?"
    const rUnassignedVol = await operationsAssistantService.askQuestion('Which approved volunteers are unassigned?', eventId, adminActor);
    assert(rUnassignedVol.grounded === true && (rUnassignedVol.table?.totalCount! >= 1 || rUnassignedVol.answer.includes('approved volunteer')), 'Volunteer Coverage: unassigned volunteers identifies unassigned volunteers');

    // 12. "Who is currently on duty?"
    const rOnDuty = await operationsAssistantService.askQuestion('Who is currently on duty?', eventId, adminActor);
    assert(rOnDuty.grounded === true && rOnDuty.answer.includes('Assigned Vol'), 'Volunteer Coverage: on duty identifies Volunteer 1');

    // 13. "How many volunteers are approved / assigned / on duty?"
    const rVolCounts = await operationsAssistantService.askQuestion('how many volunteers are approved', eventId, adminActor);
    assert(rVolCounts.grounded === true && rVolCounts.answer.includes('approved'), 'Volunteer Coverage: volunteer counts returns summary');

    // =============================================================
    // TEST PERMISSIONS
    // =============================================================

    // 14. Admin permitted
    assert(rReview.grounded === true, 'Permissions: Admin is permitted');

    // 15. Team permitted for operational view
    const rTeam = await operationsAssistantService.askQuestion('which children have not arrived', eventId, teamActor);
    assert(rTeam.grounded === true, 'Permissions: Team role is permitted for operational queries');

    // 16. Volunteer denied
    try {
      const rVolDenied = await operationsAssistantService.askQuestion('which of the child is not selected', eventId, volunteerActor);
      assert(!rVolDenied.grounded || rVolDenied.answer.includes("don't have permission") || rVolDenied.intent === 'unauthorized', 'Permissions: Volunteer role is denied');
    } catch {
      assert(true, 'Permissions: Volunteer role is denied (error thrown)');
    }

    // 17. Parent denied
    try {
      const rParentDenied = await operationsAssistantService.askQuestion('which of the child is not selected', eventId, parentActor);
      assert(!rParentDenied.grounded || rParentDenied.answer.includes("don't have permission") || rParentDenied.intent === 'unauthorized', 'Permissions: Parent role is denied');
    } catch {
      assert(true, 'Permissions: Parent role is denied (error thrown)');
    }

  } finally {
    // Cleanup
    await execute('DELETE FROM event_duty_location_presence WHERE id = ?', [testPresId1]);
    await execute('DELETE FROM event_duty_assignments WHERE id = ?', [testAsgnId1]);
    await execute('DELETE FROM event_locations WHERE id = ?', [testLocationId]);
    await execute('DELETE FROM volunteer_profiles WHERE id IN (?, ?)', [testVol1Id, testVol2Id]);
    await execute('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [testUserId1, testUserId2, testParentUser1Id, testParentUser2Id]);

    await execute('DELETE FROM pickup_people WHERE id IN (?, ?)', [testPickup1Id, `tpp4-${uid}`]);
    await execute('DELETE FROM child_event_entries WHERE id IN (?, ?, ?, ?)', [testEntry1Id, testEntry2Id, testEntry3Id, testEntry4Id]);
    await execute('DELETE FROM children WHERE id IN (?, ?, ?, ?)', [testChild1Id, testChild2Id, testChild3Id, testChild4Id]);
    await execute('DELETE FROM parent_profiles WHERE id IN (?, ?)', [testParent1Id, testParent2Id]);
    await execute('DELETE FROM events WHERE id = ?', [eventId]);
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

// Self-run when executed directly
runOperationalCoverageTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
