import express from 'express';
import http from 'http';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken, hashPassword } from '../src/server/auth';
import adminRoutes from '../src/server/routes/admin';
import parentRoutes from '../src/server/routes/parent';

async function runTests() {
  console.log('================================================================');
  console.log('TEST SUITE: ADMIN READ-PATH ENTRY-ID & PICKUP / PASS RESOLUTION');
  console.log('SCENARIOS A THROUGH F');
  console.log('================================================================');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const now = new Date();
  const nowIso = now.toISOString();

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api/parent', parentRoutes);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const results: Record<string, boolean> = {};

  // Fixture IDs
  const eventId = `ev-admin-test-${testRunId}`;
  const adminUserId = `usr-admin-${testRunId}`;
  const parentUserId = `usr-parent-${testRunId}`;
  const parentProfileId = `prof-parent-${testRunId}`;

  const childAId = `child-a-${testRunId}`;
  const childUnregisteredId = `child-unreg-${testRunId}`;
  const entryAId = `entry-a-${testRunId}`;
  const passAId = `pass-a-${testRunId}`;
  const passRefA = `KOI-2026-ADM${testRunId.slice(-4).toUpperCase()}`;
  const mediaPhotoId = `media-pickup-${testRunId}`;
  const mediaUpdatedPhotoId = `media-upd-${testRunId}`;

  let previousCurrentEvents: any[] = [];

  try {
    // 1. Isolate active event
    previousCurrentEvents = await query("SELECT id FROM events WHERE status = 'current'");
    await execute("UPDATE events SET status = 'archived' WHERE status = 'current'");

    await execute(`
      INSERT INTO events (id, title, status, allow_multiple_children, allow_save_and_continue, created_at, updated_at)
      VALUES (?, 'Admin Resolution Test Event', 'current', 1, 1, ?, ?)
    `, [eventId, nowIso, nowIso]);

    // 2. Setup media files
    await execute(`
      INSERT INTO media_files (id, file_type, file_url, storage_key, secure_url, optimized_url, created_at)
      VALUES (?, 'pickup_person_photo', 'https://res.cloudinary.com/test/pickup.jpg', ?, 'https://res.cloudinary.com/test/pickup.jpg', 'https://res.cloudinary.com/test/pickup_opt.jpg', ?)
    `, [mediaPhotoId, `key-pickup-${testRunId}`, nowIso]);

    await execute(`
      INSERT INTO media_files (id, file_type, file_url, storage_key, secure_url, optimized_url, created_at)
      VALUES (?, 'pickup_person_photo', 'https://res.cloudinary.com/test/updated.jpg', ?, 'https://res.cloudinary.com/test/updated.jpg', 'https://res.cloudinary.com/test/updated_opt.jpg', ?)
    `, [mediaUpdatedPhotoId, `key-upd-${testRunId}`, nowIso]);

    // 3. Setup Admin User
    const pwHash = await hashPassword('AdminPass123!');
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 'active', ?, ?)
    `, [adminUserId, `admin_${testRunId}@example.com`, pwHash, nowIso, nowIso]);
    const adminToken = generateToken(adminUserId);

    // 4. Setup Parent User
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, ?, 'parent', 'active', ?, ?)
    `, [parentUserId, `parent_${testRunId}@example.com`, pwHash, nowIso, nowIso]);
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, country, country_iso, created_at, updated_at)
      VALUES (?, ?, 'Primary Parent', '+2348011110000', '+2348011110000', 'Nigeria', 'NG', ?, ?)
    `, [parentProfileId, parentUserId, nowIso, nowIso]);
    const parentToken = generateToken(parentUserId);

    // 5. Setup Child A with Entry, Pickup Person, and Event Pass
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, calculated_age, age_group, relationship_to_child, created_at, updated_at)
      VALUES (?, ?, 'Bethertrade Test', '2012-05-15', 'Female', 14, 'Teens Chapel', 'Parent', ?, ?)
    `, [childAId, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, has_medical_notes, medical_notes, needs_extra_support, support_notes, school_class, school_name, checked_in_at, created_at, updated_at)
      VALUES (?, ?, ?, 'checked_in', 0, '', 0, '', 'Grade 9', 'Starlight Academy', ?, ?, ?)
    `, [entryAId, childAId, eventId, nowIso, nowIso, nowIso]);

    await execute(`
      INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, whatsapp_number, photo_file_id, approved_by_parent, created_at, updated_at)
      VALUES (?, ?, 'other_person', 'This is a test user', 'Father', '+2348011112222', '+2348011112222', ?, 1, ?, ?)
    `, [`pp-a-${testRunId}`, entryAId, mediaPhotoId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, 'testpasshash123', 'active', ?, ?, ?)
    `, [passAId, entryAId, passRefA, nowIso, nowIso, nowIso]);

    // 6. Setup Unregistered Child (Child with no child_event_entries)
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, calculated_age, age_group, relationship_to_child, created_at, updated_at)
      VALUES (?, ?, 'Unregistered Child', '2016-03-20', 'Male', 10, 'Ages 9-11', 'Parent', ?, ?)
    `, [childUnregisteredId, parentProfileId, nowIso, nowIso]);

    // ========================================================================
    // SCENARIO A: Called with entry ID -> returns pickup person and pass
    // ========================================================================
    console.log('\n[SCENARIO A] Called with entry ID -> returns pickup person & pass');
    const resA = await fetch(`${baseUrl}/api/admin/applications/${entryAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const bodyA = await resA.json();

    const passA =
      resA.status === 200 &&
      bodyA.success === true &&
      Array.isArray(bodyA.application?.pickupPeople) &&
      bodyA.application.pickupPeople.length > 0 &&
      bodyA.application.pickupPeople[0].fullName === 'This is a test user' &&
      bodyA.application.pickupPeople[0].relationship === 'Father' &&
      bodyA.application.pickupPeople[0].phone === '+2348011112222' &&
      bodyA.application.hasPass === true &&
      bodyA.application.passReference === passRefA;

    results['A_entry_id_lookup'] = passA;
    console.log(`  -> Status: ${resA.status}, pickupPeople: ${bodyA.application?.pickupPeople?.length}, name: ${bodyA.application?.pickupPeople?.[0]?.fullName}, hasPass: ${bodyA.application?.hasPass}`);
    console.log(`  -> RESULT: ${passA ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // SCENARIO B: Called with child ID (/api/admin/applications/<childId>?eventId=<event>) -> returns same pickup person
    // ========================================================================
    console.log('\n[SCENARIO B] Called with child ID -> returns same pickup person & pass');
    const resB = await fetch(`${baseUrl}/api/admin/applications/${childAId}?eventId=${eventId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const bodyB = await resB.json();

    const passB =
      resB.status === 200 &&
      bodyB.success === true &&
      Array.isArray(bodyB.application?.pickupPeople) &&
      bodyB.application.pickupPeople.length > 0 &&
      bodyB.application.pickupPeople[0].fullName === 'This is a test user' &&
      bodyB.application.pickupPeople[0].relationship === 'Father' &&
      bodyB.application.pickupPeople[0].phone === '+2348011112222' &&
      bodyB.application.pickupPeople[0].photoUrl === 'https://res.cloudinary.com/test/pickup_opt.jpg' &&
      bodyB.application.hasPass === true &&
      bodyB.application.passReference === passRefA;

    results['B_child_id_lookup'] = passB;
    console.log(`  -> Status: ${resB.status}, pickupPeople: ${bodyB.application?.pickupPeople?.length}, name: ${bodyB.application?.pickupPeople?.[0]?.fullName}, photoUrl: ${bodyB.application?.pickupPeople?.[0]?.photoUrl}`);
    console.log(`  -> RESULT: ${passB ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // SCENARIO C: Pass lookup with child ID -> resolves existing pass (hasPass = true, passReference = existing reference, no pass mutation)
    // ========================================================================
    console.log('\n[SCENARIO C] Pass lookup with child ID -> resolves existing pass, no mutation');
    const passCountBeforeC = await queryOne('SELECT COUNT(*) as count FROM event_passes WHERE child_event_entry_id = ?', [entryAId]);
    
    const resC = await fetch(`${baseUrl}/api/admin/applications/${childAId}?eventId=${eventId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const bodyC = await resC.json();
    const passCountAfterC = await queryOne('SELECT COUNT(*) as count FROM event_passes WHERE child_event_entry_id = ?', [entryAId]);

    const passC =
      resC.status === 200 &&
      bodyC.application?.hasPass === true &&
      bodyC.application?.passReference === passRefA &&
      bodyC.application?.passStatus === 'active' &&
      Number(passCountBeforeC.count) === 1 &&
      Number(passCountAfterC.count) === 1;

    results['C_pass_lookup_child_id'] = passC;
    console.log(`  -> hasPass: ${bodyC.application?.hasPass}, passReference: ${bodyC.application?.passReference}, passCountBefore: ${passCountBeforeC.count}, passCountAfter: ${passCountAfterC.count}`);
    console.log(`  -> RESULT: ${passC ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // SCENARIO D: No event entry (app.entry_id === null) -> pickupPeople = [], hasPass = false, no error or fake entry
    // ========================================================================
    console.log('\n[SCENARIO D] No event entry -> pickupPeople = [], hasPass = false, no fake entries');
    const entryCountBeforeD = await queryOne('SELECT COUNT(*) as count FROM child_event_entries WHERE child_id = ?', [childUnregisteredId]);
    const passCountBeforeD = await queryOne('SELECT COUNT(*) as count FROM event_passes');

    const resD = await fetch(`${baseUrl}/api/admin/applications/${childUnregisteredId}?eventId=${eventId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const bodyD = await resD.json();

    const entryCountAfterD = await queryOne('SELECT COUNT(*) as count FROM child_event_entries WHERE child_id = ?', [childUnregisteredId]);
    const passCountAfterD = await queryOne('SELECT COUNT(*) as count FROM event_passes');

    const passD =
      resD.status === 200 &&
      bodyD.success === true &&
      bodyD.application?.hasEntry === false &&
      Array.isArray(bodyD.application?.pickupPeople) &&
      bodyD.application.pickupPeople.length === 0 &&
      bodyD.application?.hasPass === false &&
      bodyD.application?.passReference === undefined &&
      Number(entryCountBeforeD.count) === 0 &&
      Number(entryCountAfterD.count) === 0 &&
      Number(passCountBeforeD.count) === Number(passCountAfterD.count);

    results['D_no_entry_safe_defaults'] = passD;
    console.log(`  -> Status: ${resD.status}, hasEntry: ${bodyD.application?.hasEntry}, pickupPeople.length: ${bodyD.application?.pickupPeople?.length}, hasPass: ${bodyD.application?.hasPass}`);
    console.log(`  -> RESULT: ${passD ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // SCENARIO E: Updated pickup from parent flow -> Admin lookup immediately reflects newest values
    // ========================================================================
    console.log('\n[SCENARIO E] Updated pickup from parent flow -> Admin lookup reflects newest values');
    // Parent updates pickup person
    const resUpdate = await fetch(`${baseUrl}/api/parent/children/${childAId}/pickup`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentToken}`
      },
      body: JSON.stringify({
        pickupType: 'other_person',
        pickupPersonFullName: 'Newly Authorized Uncle Bob',
        pickupPersonRelationship: 'Uncle',
        pickupPersonPhone: '+2348099998888',
        pickupPersonWhatsApp: '+2348099998888',
        pickupPersonPhotoFileId: mediaUpdatedPhotoId,
        approvedByParent: true
      })
    });
    const bodyUpdate = await resUpdate.json();

    // Now Admin requests child detail via child ID
    const resE = await fetch(`${baseUrl}/api/admin/applications/${childAId}?eventId=${eventId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const bodyE = await resE.json();
    const cacheControlHeader = resE.headers.get('cache-control') || '';

    const firstPickupE = bodyE.application?.pickupPeople?.[0];
    const passE =
      resUpdate.status === 200 &&
      bodyUpdate.success === true &&
      resE.status === 200 &&
      bodyE.success === true &&
      firstPickupE?.fullName === 'Newly Authorized Uncle Bob' &&
      firstPickupE?.relationship === 'Uncle' &&
      firstPickupE?.phone === '+2348099998888' &&
      firstPickupE?.photoUrl === 'https://res.cloudinary.com/test/updated_opt.jpg' &&
      cacheControlHeader.includes('no-store');

    results['E_parent_update_immediate_admin_reflection'] = passE;
    console.log(`  -> Parent update status: ${resUpdate.status}, Admin sees fullName: ${firstPickupE?.fullName}, rel: ${firstPickupE?.relationship}, Cache-Control: ${cacheControlHeader}`);
    console.log(`  -> RESULT: ${passE ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // SCENARIO F: No state mutation during GET call
    // ========================================================================
    console.log('\n[SCENARIO F] No state mutation during GET calls');
    const countTable = async (tbl: string) => Number((await queryOne(`SELECT COUNT(*) as count FROM ${tbl}`)).count);

    const countsBefore = {
      children: await countTable('children'),
      child_event_entries: await countTable('child_event_entries'),
      pickup_people: await countTable('pickup_people'),
      event_passes: await countTable('event_passes'),
      audit_logs: await countTable('audit_logs'),
      messages: await countTable('messages'),
      whatsapp_delivery_logs: await countTable('whatsapp_delivery_logs')
    };

    // Run multiple GET requests
    await fetch(`${baseUrl}/api/admin/applications/${entryAId}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    await fetch(`${baseUrl}/api/admin/applications/${childAId}?eventId=${eventId}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    await fetch(`${baseUrl}/api/admin/applications/${childUnregisteredId}?eventId=${eventId}`, { headers: { Authorization: `Bearer ${adminToken}` } });

    const countsAfter = {
      children: await countTable('children'),
      child_event_entries: await countTable('child_event_entries'),
      pickup_people: await countTable('pickup_people'),
      event_passes: await countTable('event_passes'),
      audit_logs: await countTable('audit_logs'),
      messages: await countTable('messages'),
      whatsapp_delivery_logs: await countTable('whatsapp_delivery_logs')
    };

    let passF = true;
    for (const key of Object.keys(countsBefore) as (keyof typeof countsBefore)[]) {
      if (countsBefore[key] !== countsAfter[key]) {
        console.error(`  -> Mismatch on table ${key}: before ${countsBefore[key]}, after ${countsAfter[key]}`);
        passF = false;
      }
    }

    results['F_no_state_mutation_during_get'] = passF;
    console.log(`  -> Before: ${JSON.stringify(countsBefore)}`);
    console.log(`  -> After:  ${JSON.stringify(countsAfter)}`);
    console.log(`  -> RESULT: ${passF ? 'PASS' : 'FAIL'}`);

  } catch (err: any) {
    console.error('Test suite error:', err);
  } finally {
    // Teardown test fixtures
    try {
      await execute('DELETE FROM pickup_people WHERE child_event_entry_id = ?', [entryAId]);
      await execute('DELETE FROM event_passes WHERE child_event_entry_id = ?', [entryAId]);
      await execute('DELETE FROM child_event_entries WHERE id = ?', [entryAId]);
      await execute('DELETE FROM children WHERE id IN (?, ?)', [childAId, childUnregisteredId]);
      await execute('DELETE FROM parent_profiles WHERE id = ?', [parentProfileId]);
      await execute('DELETE FROM users WHERE id IN (?, ?)', [adminUserId, parentUserId]);
      await execute('DELETE FROM media_files WHERE id IN (?, ?)', [mediaPhotoId, mediaUpdatedPhotoId]);
      await execute('DELETE FROM events WHERE id = ?', [eventId]);

      // Restore previous current event if any
      if (previousCurrentEvents.length > 0) {
        for (const ev of previousCurrentEvents) {
          await execute("UPDATE events SET status = 'current' WHERE id = ?", [ev.id]);
        }
      }
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }

    server.close();
  }

  console.log('\n================================================================');
  console.log('SUMMARY RESULTS:');
  console.log('================================================================');
  let allPass = true;
  for (const [k, v] of Object.entries(results)) {
    console.log(`${k.padEnd(45)}: ${v ? 'PASS' : 'FAIL'}`);
    if (!v) allPass = false;
  }
  console.log('================================================================');
  console.log(`OVERALL: ${allPass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  console.log('================================================================');

  if (!allPass) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
