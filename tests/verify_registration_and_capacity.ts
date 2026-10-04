import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken, hashPassword } from '../src/server/auth';
import authRoutes from '../src/server/routes/auth';
import parentRoutes from '../src/server/routes/parent';
import volunteerRoutes from '../src/server/routes/volunteer';
import adminRoutes from '../src/server/routes/admin';
import { dutyRouter, adminDutyRouter } from '../src/server/routes/duty';
import { setCustomMxResolver } from '../src/server/utils/validation';

async function runTests() {
  setCustomMxResolver(async () => [{ exchange: 'mail.test.com', priority: 10 }]);
  console.log('================================================================');
  console.log('STARTING REGISTRATION DEADLINES & CAPACITY VERIFICATION TESTS    ');
  console.log('================================================================');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const now = new Date();
  const nowIso = now.toISOString();

  // Useful date offsets
  const pastIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const deepPastIso = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const futureIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const farFutureIso = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/parent', parentRoutes);
  app.use('/api/volunteer', volunteerRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/admin/duty', adminDutyRouter);
  app.use('/api/duty', dutyRouter);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const results: Record<string, boolean> = {};

  try {
    // Admin user for admin routes
    const adminUserId = `admin-${testRunId}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 'active', 1, ?, ?)
    `, [adminUserId, `admin-${testRunId}@test.org`, hashPassword('AdminPass123!'), nowIso, nowIso]);
    const adminToken = generateToken(adminUserId);

    // =================================================================
    // SETUP EVENTS: Event A and Event B
    // =================================================================
    const eventAId = `event-a-${testRunId}`;
    const eventBId = `event-b-${testRunId}`;

    await execute(`
      INSERT INTO events (
        id, title, section_name, location, starts_at, ends_at,
        daily_start_time, daily_end_time, status,
        parent_access_opens_at, parent_access_closes_at,
        volunteer_registration_opens_at, volunteer_registration_closes_at,
        capacity, parents_can_create_account, allow_multiple_children,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, ?, ?, ?, ?, 1, 1, ?, ?)
    `, [
      eventAId, 'Event A - Capacity & Windows', 'Children & Teens', 'Hall A',
      futureIso, farFutureIso, '09:00', '17:00',
      futureIso, farFutureIso, // Initially before open
      futureIso, farFutureIso,
      3, // Capacity 3
      nowIso, nowIso
    ]);

    await execute(`
      INSERT INTO events (
        id, title, section_name, location, starts_at, ends_at,
        daily_start_time, daily_end_time, status,
        parent_access_opens_at, parent_access_closes_at,
        volunteer_registration_opens_at, volunteer_registration_closes_at,
        capacity, parents_can_create_account, allow_multiple_children,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, ?, ?, ?, ?, 1, 1, ?, ?)
    `, [
      eventBId, 'Event B - Independent Capacity', 'Children & Teens', 'Hall B',
      futureIso, farFutureIso, '09:00', '17:00',
      pastIso, futureIso, // Open window
      pastIso, futureIso,
      5, // Capacity 5
      nowIso, nowIso
    ]);

    const prevCurrentEvent = await queryOne("SELECT id FROM events WHERE status = 'current'");
    await execute("UPDATE events SET status = 'upcoming' WHERE status = 'current'");
    await execute("UPDATE events SET status = 'current' WHERE id = ?", [eventAId]);

    // =================================================================
    // PARENT TESTS (A through E)
    // =================================================================
    console.log('\n--- Running Parent Window Tests ---');

    // A. Before open -> blocked
    // Event A parent window opens in future
    const resA = await fetch(`${baseUrl}/api/auth/create-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `parent-before-${testRunId}@test.com`,
        password: 'Password123!',
        fullName: 'Parent Before',
        phone: '08011112222',
        eventId: eventAId
      })
    });
    const dataA = await resA.json();
    console.log('A. Parent Before Open:', resA.status, dataA.message);
    results['A'] = resA.status === 403 && dataA.message === 'Registration for this event is not open yet.';

    // B. During window -> allowed
    // Update Event A window to be open now
    await execute(`
      UPDATE events SET parent_access_opens_at = ?, parent_access_closes_at = ? WHERE id = ?
    `, [pastIso, futureIso, eventAId]);

    const resB = await fetch(`${baseUrl}/api/auth/create-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `parent-during-${testRunId}@test.com`,
        password: 'Password123!',
        fullName: 'Parent During',
        phone: '08022223333',
        eventId: eventAId
      })
    });
    const dataB = await resB.json();
    console.log('B. Parent During Window:', resB.status, dataB.user?.email);
    results['B'] = (resB.status === 200 || resB.status === 201) && Boolean(dataB.token);
    const parentBToken = dataB.token;
    const parentBUserId = dataB.user?.id;

    // Verify parent can also save child draft and submit during window
    let childBId = `child-b-${testRunId}`;
    const draftResB = await fetch(`${baseUrl}/api/parent/children/draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${parentBToken}`
      },
      body: JSON.stringify({
        id: childBId,
        childDetails: {
          fullName: 'Child During One',
          gender: 'Male',
          dateOfBirth: '2018-05-10',
          relationshipToChild: 'Parent'
        },
        schoolAndAgeGroup: {
          schoolClass: 'Primary 2',
          schoolName: 'Grace Academy'
        },
        healthAndSupport: {
          hasMedicalNotes: 'No'
        },
        pickup: {
          pickupType: 'Parent',
          pickupPersonFullName: 'Parent During',
          pickupPersonRelationship: 'Parent',
          pickupPersonPhone: '08022223333',
          approvedByParent: true
        }
      })
    });
    const draftDataB = await draftResB.json();
    console.log('B. Child draft saved:', draftResB.status, draftDataB.fullName);

    // C. After close -> blocked
    // Update Event A window to be closed
    await execute(`
      UPDATE events SET parent_access_opens_at = ?, parent_access_closes_at = ? WHERE id = ?
    `, [deepPastIso, pastIso, eventAId]);

    const resC = await fetch(`${baseUrl}/api/auth/create-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `parent-after-${testRunId}@test.com`,
        password: 'Password123!',
        fullName: 'Parent After',
        phone: '08033334444',
        eventId: eventAId
      })
    });
    const dataC = await resC.json();
    console.log('C. Parent After Close:', resC.status, dataC.message);
    results['C'] = resC.status === 403 && dataC.message === 'Registration for this event has closed.';

    // Also check that a new child draft for closed event is blocked
    const childDraftAfterRes = await fetch(`${baseUrl}/api/parent/children/draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${parentBToken}`
      },
      body: JSON.stringify({
        id: `child-new-after-${testRunId}`,
        childDetails: {
          fullName: 'Child Blocked After',
          gender: 'Female',
          dateOfBirth: '2019-01-01',
          relationshipToChild: 'Parent'
        }
      })
    });
    const childDraftAfterData = await childDraftAfterRes.json();
    console.log('C2. Child Draft After Close:', childDraftAfterRes.status, childDraftAfterData.message);
    if (childDraftAfterRes.status !== 403 || childDraftAfterData.message !== 'Registration for this event has closed.') {
      results['C'] = false;
    }

    // D. Existing Parent sign-in after close -> allowed
    // First make sure the parent's email is verified so standard sign-in passes
    await execute('UPDATE users SET email_verified = 1 WHERE id = ?', [parentBUserId]);

    const resD = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `parent-during-${testRunId}@test.com`,
        password: 'Password123!'
      })
    });
    const dataD = await resD.json();
    console.log('D. Existing Parent Sign-In After Close:', resD.status, Boolean(dataD.token));
    results['D'] = resD.status === 200 && Boolean(dataD.token);

    // E. Existing child/status/pass after close -> accessible
    const resE = await fetch(`${baseUrl}/api/parent/children`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${parentBToken}` }
    });
    const dataE = await resE.json();
    results['E'] = resE.status === 200 && Array.isArray(dataE) && dataE.some((c: any) => c.name === 'Child During One' || c.draftData?.fullName === 'Child During One');

    // =================================================================
    // VOLUNTEER TESTS (F through J)
    // =================================================================
    console.log('\n--- Running Volunteer Window Tests ---');

    // Reset Event A volunteer window to future
    await execute(`
      UPDATE events SET volunteer_registration_opens_at = ?, volunteer_registration_closes_at = ? WHERE id = ?
    `, [futureIso, farFutureIso, eventAId]);

    // Create a mock media file for volunteer photo requirement
    const mediaPhotoId = `media-vol-${testRunId}`;
    await execute(`
      INSERT INTO media_files (id, file_type, mime_type, file_size, secure_url, file_url, storage_key, created_at)
      VALUES (?, 'volunteer_profile_photo', 'image/jpeg', 1234, 'https://example.com/photo.jpg', 'https://example.com/photo.jpg', ?, ?)
    `, [mediaPhotoId, `mock-key-${testRunId}`, nowIso]);

    // F. Before volunteer window -> application blocked
    const resF = await fetch(`${baseUrl}/api/volunteer/create-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Volunteer Before',
        email: `vol-before-${testRunId}@test.com`,
        password: 'Password123!',
        phone: '08044445555',
        preferredTeam: 'Teaching',
        photoFileId: mediaPhotoId,
        eventId: eventAId
      })
    });
    const dataF = await resF.json();
    console.log('F. Volunteer Before Open:', resF.status, dataF.message);
    results['F'] = resF.status === 403 && dataF.message === 'Volunteer registration for this event is not open yet.';

    // G. During window -> application allowed
    await execute(`
      UPDATE events SET volunteer_registration_opens_at = ?, volunteer_registration_closes_at = ? WHERE id = ?
    `, [pastIso, futureIso, eventAId]);

    const resG = await fetch(`${baseUrl}/api/volunteer/create-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Volunteer During',
        email: `vol-during-${testRunId}@test.com`,
        password: 'Password123!',
        phone: '08055556666',
        preferredTeam: 'Media',
        photoFileId: mediaPhotoId,
        eventId: eventAId
      })
    });
    const dataG = await resG.json();
    console.log('G. Volunteer During Window:', resG.status, dataG.user?.email);
    results['G'] = (resG.status === 200 || resG.status === 201) && Boolean(dataG.user?.id);
    const volGUserId = dataG.user?.id;

    // H. After close -> new application blocked
    await execute(`
      UPDATE events SET volunteer_registration_opens_at = ?, volunteer_registration_closes_at = ? WHERE id = ?
    `, [deepPastIso, pastIso, eventAId]);

    const resH = await fetch(`${baseUrl}/api/volunteer/create-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Volunteer After',
        email: `vol-after-${testRunId}@test.com`,
        password: 'Password123!',
        phone: '08066667777',
        preferredTeam: 'Logistics',
        photoFileId: mediaPhotoId,
        eventId: eventAId
      })
    });
    const dataH = await resH.json();
    console.log('H. Volunteer After Close:', resH.status, dataH.message);
    results['H'] = resH.status === 403 && dataH.message === 'Volunteer registration for this event has closed.';

    // I. Approved volunteer sign-in after close -> allowed
    // Approve volunteer G and verify email
    await execute('UPDATE users SET email_verified = 1 WHERE id = ?', [volGUserId]);
    await execute("UPDATE volunteer_profiles SET status = 'approved' WHERE user_id = ?", [volGUserId]);

    const resI = await fetch(`${baseUrl}/api/volunteer/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `vol-during-${testRunId}@test.com`,
        password: 'Password123!'
      })
    });
    const dataI = await resI.json();
    console.log('I. Approved Volunteer Sign-In After Close:', resI.status, Boolean(dataI.token));
    results['I'] = resI.status === 200 && Boolean(dataI.token);

    // J. Duty/QR after close -> allowed
    // Create an assignment, location, and QR code for volunteer G
    const locDutyId = `loc-duty-${testRunId}`;
    await execute(`
      INSERT INTO event_locations (id, event_id, name, location_type, capacity, volunteer_capacity, is_active, created_at, updated_at)
      VALUES (?, ?, 'Grace Hall Volunteer', 'room', 50, 10, 1, ?, ?)
    `, [locDutyId, eventAId, nowIso, nowIso]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'room_support', 'scheduled', ?, ?, ?, ?)
    `, [`assign-${testRunId}`, eventAId, volGUserId, locDutyId, pastIso, futureIso, nowIso, nowIso]);

    const tokenDuty = `loc_code_duty_${testRunId}`;
    await execute(`
      INSERT INTO event_location_codes (id, event_location_id, token_hash, is_active, generated_at)
      VALUES (?, ?, ?, 1, ?)
    `, [`code-${testRunId}-duty`, locDutyId, tokenDuty, nowIso]);

    // 1. QR scan resolves assigned location
    const resJ = await fetch(`${baseUrl}/api/duty/location-code/${tokenDuty}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${dataI.token}` }
    });
    const dataJ = await resJ.json();
    console.log('J. Volunteer QR Scan After Close:', resJ.status, dataJ.state, dataJ.location?.name);

    // 2. Report for duty at assigned location
    const resReport = await fetch(`${baseUrl}/api/duty/current-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dataI.token}`
      },
      body: JSON.stringify({
        locationId: locDutyId,
        scannedToken: tokenDuty,
        source: 'scanned'
      })
    });
    const dataReport = await resReport.json();
    console.log('J. Volunteer Report for Duty After Close:', resReport.status, dataReport.success);

    results['J'] = resJ.status === 200 &&
      dataJ.success === true &&
      dataJ.location?.name === 'Grace Hall Volunteer' &&
      resReport.status === 200 &&
      dataReport.success === true;

    // =================================================================
    // EVENT CAPACITY TESTS (K through M)
    // =================================================================
    console.log('\n--- Running Event Capacity Tests ---');

    // Re-open Event A parent window with capacity = 3
    await execute(`
      UPDATE events SET parent_access_opens_at = ?, parent_access_closes_at = ?, capacity = 3 WHERE id = ?
    `, [pastIso, futureIso, eventAId]);

    // Ensure Event A currently has exactly 2 registrations (we already have Child During One)
    // Add 2nd child
    const child2Id = `child-cap-2-${testRunId}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES (?, (SELECT id FROM parent_profiles WHERE user_id = ?), 'Child Two', 'Male', '2017-01-01', ?, ?)
    `, [child2Id, parentBUserId, nowIso, nowIso]);
    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [`entry-2-${testRunId}`, eventAId, child2Id, nowIso, nowIso]);

    // K. Capacity 3 with 2 registered -> one more allowed (the 3rd)
    const child3Id = `child-cap-3-${testRunId}`;
    const resK = await fetch(`${baseUrl}/api/parent/children/draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${parentBToken}`
      },
      body: JSON.stringify({
        id: child3Id,
        childDetails: {
          fullName: 'Child Three (3rd allowed)',
          gender: 'Female',
          dateOfBirth: '2016-04-05',
          relationshipToChild: 'Parent'
        }
      })
    });
    const dataK = await resK.json();
    const fullNameK = dataK.childDetails?.fullName || dataK.fullName;
    console.log('K. Capacity 3 with 2 registered -> 3rd allowed:', resK.status, fullNameK);
    results['K'] = resK.status === 201 && (fullNameK === 'Child Three (3rd allowed)' || dataK.id === child3Id);

    // L. Capacity reached (3/3) -> next registration blocked
    const child4Id = `child-cap-4-${testRunId}`;
    const resL = await fetch(`${baseUrl}/api/parent/children/draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${parentBToken}`
      },
      body: JSON.stringify({
        id: child4Id,
        childDetails: {
          fullName: 'Child Four (should be blocked)',
          gender: 'Male',
          dateOfBirth: '2015-08-08',
          relationshipToChild: 'Parent'
        }
      })
    });
    const dataL = await resL.json();
    console.log('L. Capacity reached -> 4th blocked:', resL.status, dataL.message);
    results['L'] = resL.status === 403 && dataL.message === 'Registration is full for this event.';

    // Also verify new parent account creation is blocked when event capacity is full
    const resLAccount = await fetch(`${baseUrl}/api/auth/create-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `parent-full-${testRunId}@test.com`,
        password: 'Password123!',
        fullName: 'Parent Full Event',
        phone: '08077778888',
        eventId: eventAId
      })
    });
    const dataLAccount = await resLAccount.json();
    console.log('L2. New parent account blocked when event full:', resLAccount.status, dataLAccount.message);
    if (resLAccount.status !== 403 || dataLAccount.message !== 'Registration is full for this event.') {
      results['L'] = false;
    }

    // M. Event A full must NOT make Event B full
    // Event B capacity is 5, currently 0 registered
    const resM = await fetch(`${baseUrl}/api/auth/create-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `parent-eventb-${testRunId}@test.com`,
        password: 'Password123!',
        fullName: 'Parent Event B',
        phone: '08088889999',
        eventId: eventBId
      })
    });
    const dataM = await resM.json();
    console.log('M. Event A full does not block Event B:', resM.status, dataM.user?.email);
    results['M'] = (resM.status === 201 || resM.status === 200) && Boolean(dataM.token);

    // =================================================================
    // LOCATION CAPACITY TESTS (N through P)
    // =================================================================
    console.log('\n--- Running Location Capacity Tests ---');

    // N. Capacity saves and reloads correctly
    const resN = await fetch(`${baseUrl}/api/admin/events/${eventAId}/locations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: 'Grace Hall Primary',
        type: 'room',
        capacity: 40,             // Child capacity
        volunteerCapacity: 2,     // Volunteer capacity limit: 2
        ageGroupKey: 'Ages 4 to 6'
      })
    });
    const dataN = await resN.json();
    const locNId = dataN.location?.id || dataN.locationId;
    console.log('N. Location created:', resN.status, locNId, dataN.location?.capacity, dataN.location?.volunteerCapacity);

    // Reload single location
    const resNReload = await fetch(`${baseUrl}/api/admin/events/${eventAId}/locations/${locNId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const dataNReload = await resNReload.json();
    console.log('N. Location reloaded:', resNReload.status, dataNReload.location?.capacity, dataNReload.location?.volunteerCapacity);
    results['N'] = resNReload.status === 200 &&
      dataNReload.location?.capacity === 40 &&
      dataNReload.location?.volunteerCapacity === 2;

    // O. Correct capacity shown per location in list
    const resO = await fetch(`${baseUrl}/api/admin/events/${eventAId}/locations`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const dataO = await resO.json();
    const locInList = (dataO.locations || []).find((l: any) => l.id === locNId);
    console.log('O. Location in list:', !!locInList, locInList?.capacity, locInList?.volunteerCapacity, locInList?.assignedCount);
    results['O'] = Boolean(locInList) &&
      locInList.capacity === 40 &&
      locInList.volunteerCapacity === 2 &&
      locInList.assignedCount === 0;

    // P. Configured limit cannot be exceeded according to the field's actual meaning
    // volunteerCapacity is 2. Let's create 3 volunteers and attempt to assign all 3 to locNId.
    const vol1UserId = `vol1-${testRunId}`;
    const vol2UserId = `vol2-${testRunId}`;
    const vol3UserId = `vol3-${testRunId}`;

    for (const [idx, vId] of [vol1UserId, vol2UserId, vol3UserId].entries()) {
      await execute(`
        INSERT INTO users (id, email, role, status, email_verified, created_at, updated_at)
        VALUES (?, ?, 'volunteer', 'active', 1, ?, ?)
      `, [vId, `staff-${idx}-${testRunId}@test.org`, nowIso, nowIso]);
      await execute(`
        INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
        VALUES (?, ?, ?, '+2348000000000', '+2348000000000', 'Room Support', 'approved', ?, ?)
      `, [`vp-${idx}-${testRunId}`, vId, `Staff ${idx}`, nowIso, nowIso]);
    }

    // Assign 1st volunteer -> should succeed
    const resP1 = await fetch(`${baseUrl}/api/admin/duty/events/${eventAId}/duty-assignments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userId: vol1UserId,
        responsibilityKey: 'room_support',
        assignedLocationId: locNId,
        startsAt: pastIso,
        endsAt: futureIso
      })
    });
    const dataP1 = await resP1.json();
    console.log('P1. Assign 1st volunteer (limit 2):', resP1.status, dataP1.success);

    // Assign 2nd volunteer -> should succeed (now 2/2)
    const resP2 = await fetch(`${baseUrl}/api/admin/duty/events/${eventAId}/duty-assignments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userId: vol2UserId,
        responsibilityKey: 'room_support',
        assignedLocationId: locNId,
        startsAt: pastIso,
        endsAt: futureIso
      })
    });
    const dataP2 = await resP2.json();
    console.log('P2. Assign 2nd volunteer (limit 2):', resP2.status, dataP2.success);

    // Assign 3rd volunteer -> MUST BE BLOCKED (exceeds volunteerCapacity = 2)
    const resP3 = await fetch(`${baseUrl}/api/admin/duty/events/${eventAId}/duty-assignments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userId: vol3UserId,
        responsibilityKey: 'room_support',
        assignedLocationId: locNId,
        startsAt: pastIso,
        endsAt: futureIso
      })
    });
    const dataP3 = await resP3.json();
    console.log('P3. Assign 3rd volunteer beyond limit:', resP3.status, dataP3.error);
    results['P'] = resP1.status === 200 &&
      resP2.status === 200 &&
      resP3.status === 400 &&
      typeof dataP3.error === 'string' &&
      dataP3.error.includes('Location capacity reached') &&
      dataP3.error.includes('2');

    // Restore previous current event if needed
    if (prevCurrentEvent) {
      await execute("UPDATE events SET status = 'upcoming' WHERE id = ?", [eventAId]);
      await execute("UPDATE events SET status = 'current' WHERE id = ?", [prevCurrentEvent.id]);
    }

  } finally {
    server.close();
  }

  // Summary
  console.log('\n================================================================');
  console.log('TEST SUMMARY:');
  console.log('================================================================');
  let allPass = true;
  for (const key of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']) {
    const pass = results[key] === true;
    if (!pass) allPass = false;
    console.log(`Scenario ${key}: ${pass ? 'PASS' : 'FAIL'}`);
  }

  console.log('================================================================');
  console.log(`OVERALL: ${allPass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  console.log('================================================================');

  if (!allPass) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
