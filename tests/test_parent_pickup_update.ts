import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken, hashPassword } from '../src/server/auth';
import parentRoutes from '../src/server/routes/parent';
import volunteerRoutes from '../src/server/routes/volunteer';

async function runTests() {
  console.log('================================================================');
  console.log('TEST SUITE: PARENT PICKUP-PERSON-ONLY EDIT WORKFLOW');
  console.log('FOCUSED 10-POINT REGRESSION MATRIX (A THROUGH J)');
  console.log('================================================================');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const now = new Date();
  const nowIso = now.toISOString();

  const app = express();
  app.use(express.json());
  app.use('/api/parent', parentRoutes);
  app.use('/api/volunteer', volunteerRoutes);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const results: Record<string, boolean> = {};

  // Unique IDs for fixtures
  const eventId = `ev-pickup-test-${testRunId}`;
  const parentAUserId = `usr-parent-a-${testRunId}`;
  const parentAProfileId = `prof-parent-a-${testRunId}`;
  const parentBUserId = `usr-parent-b-${testRunId}`;
  const parentBProfileId = `prof-parent-b-${testRunId}`;
  const volunteerUserId = `usr-vol-${testRunId}`;
  const volunteerProfileId = `prof-vol-${testRunId}`;

  const childAId = `child-a-${testRunId}`;
  const childBId = `child-b-${testRunId}`;
  const entryAId = `entry-a-${testRunId}`;
  const entryBId = `entry-b-${testRunId}`;
  const passAId = `pass-a-${testRunId}`;
  const passRefA = `KOI-2026-T${testRunId.slice(-4).toUpperCase()}`;

  const mediaParentPhotoId = `media-p-${testRunId}`;
  const mediaOtherPhotoId = `media-o-${testRunId}`;

  // Previous current events to restore
  let previousCurrentEvents: any[] = [];

  try {
    // 1. Isolate active event
    previousCurrentEvents = await query("SELECT id FROM events WHERE status = 'current'");
    await execute("UPDATE events SET status = 'archived' WHERE status = 'current'");

    await execute(`
      INSERT INTO events (id, title, status, allow_multiple_children, allow_save_and_continue, created_at, updated_at)
      VALUES (?, 'Pickup Workflow Test Event', 'current', 1, 1, ?, ?)
    `, [eventId, nowIso, nowIso]);

    // 2. Setup media files (media_files table requires file_url and storage_key)
    await execute(`
      INSERT INTO media_files (id, file_type, file_url, storage_key, secure_url, created_at)
      VALUES (?, 'parent_profile_photo', 'https://res.cloudinary.com/test/parent.jpg', ?, 'https://res.cloudinary.com/test/parent.jpg', ?)
    `, [mediaParentPhotoId, `key-p-${testRunId}`, nowIso]);

    await execute(`
      INSERT INTO media_files (id, file_type, file_url, storage_key, secure_url, created_at)
      VALUES (?, 'pickup_person_photo', 'https://res.cloudinary.com/test/other.jpg', ?, 'https://res.cloudinary.com/test/other.jpg', ?)
    `, [mediaOtherPhotoId, `key-o-${testRunId}`, nowIso]);

    // 3. Setup Parent A (Bethertrade Test)
    const pwHash = await hashPassword('TestPass123!');
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, ?, 'parent', 'active', ?, ?)
    `, [parentAUserId, `parent_a_${testRunId}@example.com`, pwHash, nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, country, country_iso, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'Bethertrade Test', '+2348011111111', '+2348011111111', 'Nigeria', 'NG', ?, ?, ?)
    `, [parentAProfileId, parentAUserId, mediaParentPhotoId, nowIso, nowIso]);

    // 4. Setup Parent B (Unauthorized intruder)
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, ?, 'parent', 'active', ?, ?)
    `, [parentBUserId, `parent_b_${testRunId}@example.com`, pwHash, nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, country, country_iso, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'Malicious Parent', '+2348022222222', '+2348022222222', 'Nigeria', 'NG', ?, ?, ?)
    `, [parentBProfileId, parentBUserId, mediaParentPhotoId, nowIso, nowIso]);

    // 5. Setup Staff/Volunteer for pickup verification
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, ?, 'staff', 'active', ?, ?)
    `, [volunteerUserId, `volunteer_${testRunId}@example.com`, pwHash, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
      VALUES (?, ?, 'Volunteer Worker', '+2348033333333', '+2348033333333', 'Security', 'approved', ?, ?)
    `, [volunteerProfileId, volunteerUserId, nowIso, nowIso]);

    // Tokens
    const parentAToken = generateToken(parentAUserId);
    const parentBToken = generateToken(parentBUserId);
    const volunteerToken = generateToken(volunteerUserId);

    // 6. Setup Child A (Bethertrade · 14 yrs)
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, calculated_age, age_group, relationship_to_child, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'Bethertrade Child', '2012-05-15', 'Female', 14, 'Teens Chapel', 'Parent', ?, ?, ?)
    `, [childAId, parentAProfileId, mediaParentPhotoId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, has_medical_notes, medical_notes, needs_extra_support, support_notes, school_class, school_name, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', 1, 'Asthma medication needed', 0, '', 'Grade 9', 'Starlight Academy', ?, ?)
    `, [entryAId, childAId, eventId, nowIso, nowIso]);

    await execute(`
      INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, whatsapp_number, photo_file_id, approved_by_parent, created_at, updated_at)
      VALUES (?, ?, 'parent', 'Bethertrade Test', 'Parent', '+2348011111111', '+2348011111111', ?, 1, ?, ?)
    `, [`pp-a-${testRunId}`, entryAId, mediaParentPhotoId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, 'testpasshash123', 'active', ?, ?, ?)
    `, [passAId, entryAId, passRefA, nowIso, nowIso, nowIso]);

    // Setup Child B
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, calculated_age, age_group, relationship_to_child, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'Child Beta', '2015-08-10', 'Male', 11, 'Pre-Teens Hall', 'Parent', ?, ?, ?)
    `, [childBId, parentBProfileId, mediaParentPhotoId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [entryBId, childBId, eventId, nowIso, nowIso]);

    // ========================================================================
    // TEST A — selected: Parent can update pickup person
    // ========================================================================
    console.log('\n[TEST A] Selected child -> Parent can change pickup person to other_person');
    const resA = await fetch(`${baseUrl}/api/parent/children/${childAId}/pickup`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentAToken}`
      },
      body: JSON.stringify({
        pickupType: 'other_person',
        pickupPersonFullName: 'Aunt Sarah Connor',
        pickupPersonRelationship: 'Aunt',
        pickupPersonPhone: '+2348099887766',
        pickupPersonWhatsApp: '+2348099887766',
        pickupPersonPhotoFileId: mediaOtherPhotoId,
        approvedByParent: true
      })
    });

    const bodyA = await resA.json();
    const pickupRowA = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entryAId]);
    results['A_selected_update_succeeds'] =
      resA.status === 200 &&
      bodyA.success === true &&
      pickupRowA?.pickup_type === 'other_person' &&
      pickupRowA?.full_name === 'Aunt Sarah Connor' &&
      pickupRowA?.relationship_to_child === 'Aunt' &&
      pickupRowA?.photo_file_id === mediaOtherPhotoId;

    console.log(`  -> Status: ${resA.status}, Success: ${bodyA.success}`);
    console.log(`  -> DB Pickup: ${pickupRowA?.full_name} (${pickupRowA?.pickup_type})`);
    console.log(`  -> Result: ${results['A_selected_update_succeeds'] ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // TEST B — pass_ready: Update succeeds
    // ========================================================================
    console.log('\n[TEST B] Pass-ready child -> Update succeeds');
    await execute("UPDATE child_event_entries SET status = 'pass_ready' WHERE id = ?", [entryAId]);

    const resB = await fetch(`${baseUrl}/api/parent/children/${childAId}/pickup`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentAToken}`
      },
      body: JSON.stringify({
        pickupType: 'parent',
        approvedByParent: true
      })
    });

    const bodyB = await resB.json();
    const pickupRowB = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entryAId]);
    results['B_pass_ready_update_succeeds'] =
      resB.status === 200 &&
      bodyB.success === true &&
      pickupRowB?.pickup_type === 'parent' &&
      pickupRowB?.full_name === 'Bethertrade Test' &&
      pickupRowB?.photo_file_id === mediaParentPhotoId;

    console.log(`  -> Status: ${resB.status}, Pickup returned to primary parent: ${pickupRowB?.full_name}`);
    console.log(`  -> Result: ${results['B_pass_ready_update_succeeds'] ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // TEST C — checked_in: Update succeeds
    // ========================================================================
    console.log('\n[TEST C] Checked-in child -> Update succeeds');
    await execute("UPDATE child_event_entries SET status = 'checked_in', checked_in_at = ? WHERE id = ?", [nowIso, entryAId]);

    const resC = await fetch(`${baseUrl}/api/parent/children/${childAId}/pickup`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentAToken}`
      },
      body: JSON.stringify({
        pickupType: 'other_person',
        pickupPersonFullName: 'Uncle David Banner',
        pickupPersonRelationship: 'Uncle',
        pickupPersonPhone: '+2348055443322',
        pickupPersonPhotoFileId: mediaOtherPhotoId,
        approvedByParent: true
      })
    });

    const bodyC = await resC.json();
    const pickupRowC = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entryAId]);
    results['C_checked_in_update_succeeds'] =
      resC.status === 200 &&
      bodyC.success === true &&
      pickupRowC?.full_name === 'Uncle David Banner';

    console.log(`  -> Status: ${resC.status}, Updated pickup while checked_in: ${pickupRowC?.full_name}`);
    console.log(`  -> Result: ${results['C_checked_in_update_succeeds'] ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // TEST D — inside: Update succeeds
    // ========================================================================
    console.log('\n[TEST D] Inside child -> Update succeeds');
    await execute("UPDATE child_event_entries SET status = 'inside' WHERE id = ?", [entryAId]);

    const resD = await fetch(`${baseUrl}/api/parent/children/${childAId}/pickup`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentAToken}`
      },
      body: JSON.stringify({
        pickupType: 'parent',
        approvedByParent: true
      })
    });

    const bodyD = await resD.json();
    const pickupRowD = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entryAId]);
    results['D_inside_update_succeeds'] =
      resD.status === 200 &&
      bodyD.success === true &&
      pickupRowD?.pickup_type === 'parent';

    console.log(`  -> Status: ${resD.status}, Updated pickup while inside: ${pickupRowD?.full_name}`);
    console.log(`  -> Result: ${results['D_inside_update_succeeds'] ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // TEST E — picked_up: Update rejected
    // ========================================================================
    console.log('\n[TEST E] Picked-up child -> Update rejected with PICKUP_ALREADY_COMPLETED');
    await execute("UPDATE child_event_entries SET status = 'picked_up', picked_up_at = ? WHERE id = ?", [nowIso, entryAId]);

    const resE = await fetch(`${baseUrl}/api/parent/children/${childAId}/pickup`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentAToken}`
      },
      body: JSON.stringify({
        pickupType: 'other_person',
        pickupPersonFullName: 'Late Stranger',
        pickupPersonRelationship: 'Stranger',
        pickupPersonPhone: '+2348011223344',
        pickupPersonPhotoFileId: mediaOtherPhotoId,
        approvedByParent: true
      })
    });

    const bodyE = await resE.json();
    results['E_picked_up_rejected'] =
      resE.status === 400 &&
      bodyE.code === 'PICKUP_ALREADY_COMPLETED' &&
      bodyE.message.includes('released');

    console.log(`  -> Status: ${resE.status}, Code: ${bodyE.code}, Message: ${bodyE.message}`);
    console.log(`  -> Result: ${results['E_picked_up_rejected'] ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // TEST F — ownership: Parent B cannot update Parent A's child
    // ========================================================================
    console.log('\n[TEST F] Ownership -> Parent B cannot update Parent A child');
    // Set entry back to selected for testing authorization isolation
    await execute("UPDATE child_event_entries SET status = 'selected', picked_up_at = NULL WHERE id = ?", [entryAId]);

    const resF = await fetch(`${baseUrl}/api/parent/children/${childAId}/pickup`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentBToken}`
      },
      body: JSON.stringify({
        pickupType: 'other_person',
        pickupPersonFullName: 'Intruder Impostor',
        pickupPersonRelationship: 'Intruder',
        pickupPersonPhone: '+2348099999999',
        pickupPersonPhotoFileId: mediaOtherPhotoId,
        approvedByParent: true
      })
    });

    const bodyF = await resF.json();
    results['F_ownership_enforced_403'] = resF.status === 403;

    console.log(`  -> Status: ${resF.status}, Error: ${bodyF.error}`);
    console.log(`  -> Result: ${results['F_ownership_enforced_403'] ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // TEST G — child data immutable: Child identity, DOB, health, status unchanged
    // ========================================================================
    console.log('\n[TEST G] Child data immutability verification');
    // First perform a valid update as Parent A
    await fetch(`${baseUrl}/api/parent/children/${childAId}/pickup`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentAToken}`
      },
      body: JSON.stringify({
        pickupType: 'other_person',
        pickupPersonFullName: 'Authorized Guardian Two',
        pickupPersonRelationship: 'Guardian',
        pickupPersonPhone: '+2348077665544',
        pickupPersonPhotoFileId: mediaOtherPhotoId,
        approvedByParent: true
      })
    });

    const checkChild = await queryOne('SELECT * FROM children WHERE id = ?', [childAId]);
    const checkEntry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entryAId]);

    results['G_child_data_immutable'] =
      checkChild?.full_name === 'Bethertrade Child' &&
      checkChild?.date_of_birth === '2012-05-15' &&
      checkChild?.gender === 'Female' &&
      checkChild?.calculated_age === 14 &&
      checkChild?.relationship_to_child === 'Parent' &&
      checkEntry?.status === 'selected' &&
      checkEntry?.has_medical_notes === 1 &&
      checkEntry?.medical_notes === 'Asthma medication needed' &&
      checkEntry?.school_name === 'Starlight Academy';

    console.log(`  -> Child Name: ${checkChild?.full_name}, DOB: ${checkChild?.date_of_birth}`);
    console.log(`  -> Medical: ${checkEntry?.medical_notes}, Status: ${checkEntry?.status}`);
    console.log(`  -> Result: ${results['G_child_data_immutable'] ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // TEST H — pass consistency: Pass reference unchanged, pass view displays new pickup
    // ========================================================================
    console.log('\n[TEST H] Pass consistency -> Pass reference unchanged, pass view displays new pickup');
    const passRowH = await queryOne('SELECT * FROM event_passes WHERE child_event_entry_id = ?', [entryAId]);

    const resPass = await fetch(`${baseUrl}/api/parent/children/${childAId}/pass`, {
      headers: { Authorization: `Bearer ${parentAToken}` }
    });
    const passBody = await resPass.json();

    results['H_pass_consistency'] =
      passRowH?.pass_reference === passRefA &&
      passBody.passReference === passRefA &&
      passBody.child?.draftData?.pickup?.pickupPersonFullName === 'Authorized Guardian Two' &&
      passBody.child?.draftData?.pickup?.pickupType === 'other_person';

    console.log(`  -> Original Pass Ref: ${passRefA}, DB Pass Ref: ${passRowH?.pass_reference}, API Pass Ref: ${passBody.passReference}`);
    console.log(`  -> Pass Authorised Pickup Name: ${passBody.child?.draftData?.pickup?.pickupPersonFullName}`);
    console.log(`  -> Result: ${results['H_pass_consistency'] ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // TEST I — volunteer: Volunteer pickup lookup displays updated pickup details
    // ========================================================================
    console.log('\n[TEST I] Volunteer lookup displays updated pickup details');
    // For pickup release verification, the child is checked in
    await execute("UPDATE child_event_entries SET status = 'checked_in', checked_in_at = ? WHERE id = ?", [nowIso, entryAId]);

    const resVol = await fetch(`${baseUrl}/api/volunteer/pickup/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${volunteerToken}`
      },
      body: JSON.stringify({ passCode: passRefA })
    });
    const volBody = await resVol.json();

    const volPickupAuth = volBody?.child?.authorizedPickup?.[0] || volBody?.authorizedPickup?.[0];
    results['I_volunteer_pickup_consistency'] =
      resVol.status === 200 &&
      volPickupAuth?.fullName === 'Authorized Guardian Two' &&
      volPickupAuth?.relationship === 'Guardian' &&
      volPickupAuth?.phone === '+2348077665544';

    console.log(`  -> Volunteer Scan Status: ${resVol.status}`);
    console.log(`  -> Volunteer Response:`, volBody);
    console.log(`  -> Volunteer Lookup Authorized Pickup: ${volPickupAuth?.fullName} (${volPickupAuth?.relationship})`);
    console.log(`  -> Result: ${results['I_volunteer_pickup_consistency'] ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // TEST J — audit: Successful update creates pickup authorization audit entry
    // ========================================================================
    console.log('\n[TEST J] Audit log recorded for pickup authorization change');
    const auditRow = await queryOne(
      "SELECT * FROM audit_logs WHERE action = 'parent_pickup_authorization_updated' AND target_id = ? ORDER BY timestamp DESC LIMIT 1",
      [entryAId]
    );

    let auditDetails: any = null;
    if (auditRow?.details) {
      try {
        auditDetails = JSON.parse(auditRow.details);
      } catch (e) {}
    }

    results['J_audit_logging'] =
      Boolean(auditRow) &&
      auditRow.user_role === 'parent' &&
      auditDetails?.childId === childAId &&
      auditDetails?.childEventEntryId === entryAId &&
      auditDetails?.newPickupType === 'other_person' &&
      auditDetails?.newPickupPersonName === 'Authorized Guardian Two';

    console.log(`  -> Audit Log Action: ${auditRow?.action}`);
    console.log(`  -> Audit Log Details:`, auditDetails);
    console.log(`  -> Result: ${results['J_audit_logging'] ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('\n================================================================');
    console.log('SUMMARY RESULTS:');
    let allPassed = true;
    for (const [key, passed] of Object.entries(results)) {
      console.log(`  ${passed ? '✓' : '✗'} ${key}: ${passed ? 'PASS' : 'FAIL'}`);
      if (!passed) allPassed = false;
    }
    console.log('================================================================');
    if (!allPassed) {
      throw new Error('Some regression tests failed.');
    }
  } finally {
    // Clean up test server and test fixtures
    server.close();

    console.log('\nCleaning up test fixtures...');
    await execute('DELETE FROM audit_logs WHERE target_id IN (?, ?)', [entryAId, entryBId]);
    await execute('DELETE FROM event_passes WHERE id = ?', [passAId]);
    await execute('DELETE FROM pickup_people WHERE child_event_entry_id IN (?, ?)', [entryAId, entryBId]);
    await execute('DELETE FROM child_event_entries WHERE id IN (?, ?)', [entryAId, entryBId]);
    await execute('DELETE FROM children WHERE id IN (?, ?)', [childAId, childBId]);
    await execute('DELETE FROM parent_profiles WHERE id IN (?, ?)', [parentAProfileId, parentBProfileId]);
    await execute('DELETE FROM volunteer_profiles WHERE id = ?', [volunteerProfileId]);
    await execute('DELETE FROM users WHERE id IN (?, ?, ?)', [parentAUserId, parentBUserId, volunteerUserId]);
    await execute('DELETE FROM media_files WHERE id IN (?, ?)', [mediaParentPhotoId, mediaOtherPhotoId]);
    await execute('DELETE FROM events WHERE id = ?', [eventId]);

    if (previousCurrentEvents.length > 0) {
      for (const ev of previousCurrentEvents) {
        await execute("UPDATE events SET status = 'current' WHERE id = ?", [ev.id]);
      }
    }
    console.log('Test fixtures cleaned up successfully.\n');
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
