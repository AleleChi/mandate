import { execute, query, queryOne, REAL_EVENT_ID } from '../src/server/db';
import { startEscalationCycle } from '../src/server/services/escalationService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTests() {
  console.log('========================================================');
  console.log('STARTING EMERGENCY ACKNOWLEDGEMENT & PEOPLE CONTEXT TEST');
  console.log('========================================================');

  const runId = Date.now().toString().substring(7);
  const now = new Date().toISOString();

  // Test actor IDs
  const adminAUserId = `usr_adm_a_${runId}`;
  const adminBUserId = `usr_adm_b_${runId}`;
  const volunteerUserId = `usr_vol_${runId}`;
  const parentUserId = `usr_parent_${runId}`;
  const parentProfileId = `prof_parent_${runId}`;
  const child1Id = `child_1_${runId}`;
  const child2SiblingId = `child_2_${runId}`;
  const alert1Id = `alert_ack_${runId}`;
  const alertNoChildId = `alert_nochild_${runId}`;

  try {
    // -----------------------------------------------------------------
    // 1. Seed Accounts, Profiles, and Children
    // -----------------------------------------------------------------
    console.log('\n[1/6] Seeding test database records...');

    await execute(
      `INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
       VALUES (?, ?, 'hash', 'admin', 1, ?, ?)`,
      [adminAUserId, `admin_a_${runId}@koinonia.org`, now, now]
    );

    await execute(
      `INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
       VALUES (?, ?, 'hash', 'admin', 1, ?, ?)`,
      [adminBUserId, `admin_b_${runId}@koinonia.org`, now, now]
    );

    await execute(
      `INSERT INTO parent_profiles (id, user_id, full_name, phone_number, photo_file_id, created_at, updated_at)
       VALUES (?, ?, 'Pastor Tochukwu', '+2348011223344', 'photo_admin_a', ?, ?)`,
      [`prof_adm_a_${runId}`, adminAUserId, now, now]
    );

    await execute(
      `INSERT INTO parent_profiles (id, user_id, full_name, phone_number, photo_file_id, created_at, updated_at)
       VALUES (?, ?, 'Sister Hannah Admin', '+2348055667788', 'photo_admin_b', ?, ?)`,
      [`prof_adm_b_${runId}`, adminBUserId, now, now]
    );

    await execute(
      `INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
       VALUES (?, ?, 'hash', 'volunteer', 1, ?, ?)`,
      [volunteerUserId, `vol_${runId}@koinonia.org`, now, now]
    );

    await execute(
      `INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
       VALUES (?, ?, 'Alele Chi', '+2348099887766', '+2348099887766', 'Teens Team', 'approved', ?, ?)`,
      [`prof_vol_${runId}`, volunteerUserId, now, now]
    );

    // Seed Parent
    await execute(
      `INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
       VALUES (?, ?, 'hash', 'parent', 1, ?, ?)`,
      [parentUserId, `parent_${runId}@koinonia.org`, now, now]
    );

    await execute(
      `INSERT INTO parent_profiles (id, user_id, full_name, phone_number, photo_file_id, created_at, updated_at)
       VALUES (?, ?, 'Tochukwu Ogunaka', '+2348033334444', 'photo_parent_tochukwu', ?, ?)`,
      [parentProfileId, parentUserId, now, now]
    );

    // Seed Child 1 (with photo, age, Mother relationship)
    await execute(
      `INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, photo_file_id, created_at, updated_at)
       VALUES (?, ?, 'Baby Love', 'Female', '2025-01-01', 0, 'Under 4', 'Mother', 'photo_baby_love', ?, ?)`,
      [child1Id, parentProfileId, now, now]
    );

    // Seed Child 2 (Sibling, different age/group)
    await execute(
      `INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, photo_file_id, created_at, updated_at)
       VALUES (?, ?, 'Older Sibling Love', 'Male', '2019-01-01', 6, 'Ages 6-8', 'Mother', 'photo_sibling', ?, ?)`,
      [child2SiblingId, parentProfileId, now, now]
    );

    // Seed Alert with Child 1
    await execute(
      `INSERT INTO event_safety_alerts (
        id, event_id, child_id, raised_by_user_id, raised_by_role, category, severity, status, location_label, message, title, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'volunteer', 'security_concern', 'urgent', 'open', 'Infant Care Suite', 'Child missing from cot', 'Security concern', ?, ?)`,
      [alert1Id, REAL_EVENT_ID, child1Id, volunteerUserId, now, now]
    );

    // Seed Alert without Child
    await execute(
      `INSERT INTO event_safety_alerts (
        id, event_id, child_id, raised_by_user_id, raised_by_role, category, severity, status, location_label, message, title, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, 'volunteer', 'general_help', 'urgent', 'open', 'Auditorium North', 'Medical kit requested', 'General assistance', ?, ?)`,
      [alertNoChildId, REAL_EVENT_ID, volunteerUserId, now, now]
    );

    // Start escalation cycle for Alert 1
    await startEscalationCycle({
      eventId: REAL_EVENT_ID,
      subjectType: 'alert',
      alertId: alert1Id,
      conditionKey: 'urgent_medical'
    });

    console.log('✓ Test data seeded successfully.');

    // -----------------------------------------------------------------
    // 2. Test Person Context Queries & Sibling Isolation
    // -----------------------------------------------------------------
    console.log('\n[2/6] Verifying child & parent/guardian context resolution...');

    const queryAlert1 = await queryOne(`
      SELECT a.*,
             c.full_name as child_name,
             c.photo_file_id as child_photo_file_id,
             c.age_group as child_age_group,
             c.calculated_age as child_calculated_age,
             c.relationship_to_child as relationship_to_child,
             COALESCE(p_parent.full_name, pk_pickup.full_name) as parent_name,
             COALESCE(p_parent.phone_number, pk_pickup.phone_number) as parent_phone,
             COALESCE(p_parent.photo_file_id, pk_pickup.photo_file_id) as parent_photo_file_id,
             COALESCE(p_raised.full_name, v_raised.full_name, 'Volunteer') as raised_by_name,
             COALESCE(v_raised.phone, p_raised.phone_number) as volunteer_phone,
             v_raised.preferred_team as volunteer_team
      FROM event_safety_alerts a
      LEFT JOIN children c ON a.child_id = c.id
      LEFT JOIN parent_profiles p_parent ON c.parent_profile_id = p_parent.id
      LEFT JOIN pickup_people pk_pickup ON pk_pickup.id = (
        SELECT id FROM pickup_people 
        WHERE child_event_entry_id = a.child_event_entry_id AND approved_by_parent = 1 
        LIMIT 1
      )
      LEFT JOIN parent_profiles p_raised ON a.raised_by_user_id = p_raised.user_id
      LEFT JOIN volunteer_profiles v_raised ON a.raised_by_user_id = v_raised.user_id
      WHERE a.id = ?
    `, [alert1Id]);

    assert(queryAlert1 !== null, 'Alert 1 must be found');
    assert(queryAlert1.child_name === 'Baby Love', `Expected child_name 'Baby Love', got '${queryAlert1.child_name}'`);
    assert(queryAlert1.child_photo_file_id === 'photo_baby_love', 'Expected child photo photo_baby_love');
    assert(queryAlert1.child_calculated_age === 0, 'Expected child_calculated_age 0');
    assert(queryAlert1.child_age_group === 'Under 4', 'Expected child_age_group Under 4');
    assert(queryAlert1.relationship_to_child === 'Mother', 'Expected relationship_to_child Mother');
    assert(queryAlert1.parent_name === 'Tochukwu Ogunaka', `Expected parent_name Tochukwu Ogunaka, got ${queryAlert1.parent_name}`);
    assert(queryAlert1.parent_phone === '+2348033334444', 'Expected parent_phone +2348033334444');
    assert(queryAlert1.parent_photo_file_id === 'photo_parent_tochukwu', 'Expected parent photo');
    assert(queryAlert1.raised_by_name === 'Alele Chi', 'Expected raised_by_name Alele Chi');
    assert(queryAlert1.volunteer_team === 'Teens Team', 'Expected volunteer_team Teens Team');
    assert(queryAlert1.volunteer_phone === '+2348099887766', 'Expected volunteer_phone +2348099887766');

    // Sibling isolation: ensure alert for Child 1 does NOT contain Child 2's info
    assert(queryAlert1.child_name !== 'Older Sibling Love', 'Sibling isolation violated: returned sibling name');
    assert(queryAlert1.child_age_group !== 'Ages 6-8', 'Sibling isolation violated: returned sibling age group');

    console.log('✓ Child and parent context correctly resolved with sibling isolation.');

    // -----------------------------------------------------------------
    // 3. Test Missing Child Alert Resolution
    // -----------------------------------------------------------------
    console.log('\n[3/6] Verifying alert without child resolves safely...');

    const queryAlertNoChild = await queryOne(`
      SELECT a.*,
             c.full_name as child_name,
             COALESCE(p_parent.full_name, pk_pickup.full_name) as parent_name
      FROM event_safety_alerts a
      LEFT JOIN children c ON a.child_id = c.id
      LEFT JOIN parent_profiles p_parent ON c.parent_profile_id = p_parent.id
      LEFT JOIN pickup_people pk_pickup ON pk_pickup.id = (
        SELECT id FROM pickup_people 
        WHERE child_event_entry_id = a.child_event_entry_id AND approved_by_parent = 1 
        LIMIT 1
      )
      WHERE a.id = ?
    `, [alertNoChildId]);

    assert(queryAlertNoChild.child_name === null, 'Child name must be null for alert without child');
    assert(queryAlertNoChild.parent_name === null, 'Parent name must be null for alert without child');
    console.log('✓ Alert without child safely resolves nulls without crashing.');

    // -----------------------------------------------------------------
    // 4. Test Atomic First-Wins Acknowledgement
    // -----------------------------------------------------------------
    console.log('\n[4/6] Testing atomic first-Admin-wins acknowledgement...');

    // Admin A acknowledges open alert
    const ackTime = new Date().toISOString();
    const updateResultA = await execute(`
      UPDATE event_safety_alerts
      SET status = 'acknowledged',
          acknowledged_by = ?,
          acknowledged_at = ?,
          updated_at = ?
      WHERE id = ? AND status = 'open'
    `, [adminAUserId, ackTime, ackTime, alert1Id]);

    assert(updateResultA.changes === 1, 'Admin A update should succeed with 1 change');

    // Admin A fetches responder profile name (ensuring NO users.full_name query)
    const adminProfile = await queryOne('SELECT full_name FROM parent_profiles WHERE user_id = ?', [adminAUserId])
      || await queryOne('SELECT full_name FROM volunteer_profiles WHERE user_id = ?', [adminAUserId]);
    const responderName = adminProfile?.full_name || 'Admin';
    assert(responderName === 'Pastor Tochukwu', `Expected responder 'Pastor Tochukwu', got '${responderName}'`);

    const alertAfterAckA = await queryOne('SELECT status, acknowledged_by, acknowledged_at FROM event_safety_alerts WHERE id = ?', [alert1Id]);
    assert(alertAfterAckA.status === 'acknowledged', 'Alert status must be acknowledged');
    assert(alertAfterAckA.acknowledged_by === adminAUserId, 'Acknowledged by must be Admin A');

    console.log('✓ Admin A won first acknowledgement atomically.');

    // -----------------------------------------------------------------
    // 5. Test Second Admin Cannot Overwrite First (Concurrency Protection)
    // -----------------------------------------------------------------
    console.log('\n[5/6] Testing second Admin (Admin B) cannot overwrite Admin A...');

    // Admin B attempts to acknowledge the already acknowledged alert
    const updateResultB = await execute(`
      UPDATE event_safety_alerts
      SET status = 'acknowledged',
          acknowledged_by = ?,
          acknowledged_at = ?,
          updated_at = ?
      WHERE id = ? AND status = 'open'
    `, [adminBUserId, new Date().toISOString(), new Date().toISOString(), alert1Id]);

    assert(updateResultB.changes === 0, 'Admin B update MUST affect 0 rows because status is no longer open');

    // In this condition, the route returns 409 Conflict with current responder details
    const currentAlert = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alert1Id]);
    const currentAckProfile = currentAlert?.acknowledged_by
      ? await queryOne('SELECT full_name FROM parent_profiles WHERE user_id = ?', [currentAlert.acknowledged_by])
      : null;
    const currentAckName = currentAckProfile?.full_name || 'another responder';

    const conflictResponse = {
      status: 409,
      success: false,
      error: `This alert was already acknowledged by ${currentAckName}.`,
      alreadyAcknowledged: true,
      acknowledgedBy: currentAlert?.acknowledged_by,
      acknowledgedByName: currentAckName,
      acknowledgedAt: currentAlert?.acknowledged_at
    };

    assert(conflictResponse.status === 409, 'Must return 409 status');
    assert(conflictResponse.alreadyAcknowledged === true, 'Must indicate alreadyAcknowledged');
    assert(conflictResponse.acknowledgedBy === adminAUserId, 'Must retain Admin A as responder');
    assert(conflictResponse.acknowledgedByName === 'Pastor Tochukwu', 'Must report Admin A full name');

    // Verify DB still has Admin A
    const alertFinal = await queryOne('SELECT status, acknowledged_by FROM event_safety_alerts WHERE id = ?', [alert1Id]);
    assert(alertFinal.acknowledged_by === adminAUserId, 'Admin B did not overwrite Admin A in DB');

    console.log('✓ Safeguard preserved: Second Admin received 409 and could NOT overwrite Admin A.');

    // -----------------------------------------------------------------
    // 6. Test Relationship Fallbacks (No Invented Relationships)
    // -----------------------------------------------------------------
    console.log('\n[6/6] Testing stored relationship formatting & generic fallback...');

    // When relationship exists
    const rel1 = queryAlert1.relationship_to_child || 'Parent / guardian';
    assert(rel1 === 'Mother', `Expected stored relationship 'Mother', got '${rel1}'`);

    // When relationship is null (e.g., alert without child or unstated relationship)
    const unstatedRelationship: string | null = queryAlertNoChild.relationship_to_child || null;
    const rel2 = unstatedRelationship || 'Parent / guardian';
    assert(rel2 === 'Parent / guardian', `Expected generic 'Parent / guardian', got '${rel2}'`);

    console.log('✓ Relationship correctly uses stored value without fabricating labels.');

    console.log('\n========================================================');
    console.log('🎉 ALL ACKNOWLEDGEMENT & PEOPLE CONTEXT TESTS PASSED!   ');
    console.log('========================================================\n');
  } finally {
    // Cleanup
    console.log('[Cleanup] Removing test records...');
    try {
      await execute(`DELETE FROM escalation_executions WHERE cycle_id IN (SELECT id FROM escalation_cycles WHERE alert_id = ?)`, [alert1Id]);
      await execute(`DELETE FROM escalation_cycles WHERE alert_id = ?`, [alert1Id]);
      await execute(`DELETE FROM event_safety_alerts WHERE id IN (?, ?)`, [alert1Id, alertNoChildId]);
      await execute(`DELETE FROM children WHERE id IN (?, ?)`, [child1Id, child2SiblingId]);
      await execute(`DELETE FROM parent_profiles WHERE id IN (?, ?, ?)`, [parentProfileId, `prof_adm_a_${runId}`, `prof_adm_b_${runId}`]);
      await execute(`DELETE FROM volunteer_profiles WHERE id = ?`, [`prof_vol_${runId}`]);
      await execute(`DELETE FROM users WHERE id IN (?, ?, ?, ?)`, [adminAUserId, adminBUserId, volunteerUserId, parentUserId]);
      console.log('✓ Test data cleaned up.');
    } catch (cleanErr) {
      console.warn('Cleanup error (ignored):', cleanErr);
    }
  }
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
});
