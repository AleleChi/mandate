import crypto from 'crypto';
import { execute, query, queryOne } from '../src/server/db';
import {
  createAnnouncement,
  listAdminAnnouncements,
  listParentAnnouncements,
  getParentAnnouncementUnreadCount,
  markParentAnnouncementRead,
  listVolunteerAnnouncements,
  getVolunteerAnnouncementUnreadCount,
  markVolunteerAnnouncementRead
} from '../src/server/services/announcementService';
import {
  createThread,
  listThreads,
  getThread,
  appendMessage,
  markThreadRead
} from '../src/server/services/messageService';
import { isAuthoritativeIncomplete } from '../src/server/services/applicationReminderService';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`[PASS] ${msg}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('PHASE G — BROADCASTS & ANNOUNCEMENTS TEST SUITE');
  console.log('====================================================\n');

  // ==========================================================================
  // SECTION 1: AUTHORITATIVE INCOMPLETE PREDICATE VERIFICATION
  // ==========================================================================
  console.log('--- 1. Authoritative Incomplete Predicate Check ---');
  assert(
    isAuthoritativeIncomplete({ status: 'draft', submitted_at: null, details_confirmed: 0, is_deleted: 0 }) === true,
    'Predicate: draft application qualifies'
  );
  assert(
    isAuthoritativeIncomplete({ status: 'incomplete', submitted_at: null, details_confirmed: 0, is_deleted: 0 }) === true,
    'Predicate: incomplete application qualifies'
  );
  assert(
    isAuthoritativeIncomplete({ status: 'under_review', submitted_at: '2026-10-01T10:00:00Z', details_confirmed: 0, is_deleted: 0 }) === false,
    'Predicate: under_review does NOT qualify'
  );
  assert(
    isAuthoritativeIncomplete({ status: 'selected', submitted_at: '2026-10-01T10:00:00Z', details_confirmed: 0, is_deleted: 0 }) === false,
    'Predicate: selected does NOT qualify'
  );
  assert(
    isAuthoritativeIncomplete({ status: 'rejected', submitted_at: '2026-10-01T10:00:00Z', details_confirmed: 0, is_deleted: 0 }) === false,
    'Predicate: rejected does NOT qualify'
  );
  assert(
    isAuthoritativeIncomplete({ status: 'draft', submitted_at: '2026-10-01T10:00:00Z', details_confirmed: 0, is_deleted: 0 }) === false,
    'Predicate: submitted draft does NOT qualify'
  );
  assert(
    isAuthoritativeIncomplete({ status: 'draft', submitted_at: null, details_confirmed: 1, is_deleted: 0 }) === false,
    'Predicate: details_confirmed=1 does NOT qualify'
  );
  assert(
    isAuthoritativeIncomplete({ status: 'draft', submitted_at: null, details_confirmed: 0, is_deleted: 1 }) === false,
    'Predicate: soft-deleted draft does NOT qualify'
  );

  const now = new Date().toISOString();
  const runId = Date.now().toString().slice(-6);

  // Setup Test Users & Profiles
  console.log('\n--- 2. Setup Test Data ---');
  const adminId = `adm-${runId}`;
  const parent1Id = `usr-p1-${runId}`;
  const parent2Id = `usr-p2-${runId}`;
  const vol1Id = `usr-v1-${runId}`;
  const vol2Id = `usr-v2-${runId}`;

  await execute(`
    INSERT OR REPLACE INTO users (id, email, password_hash, role, status, created_at, updated_at)
    VALUES (?, 'admin@test.com', 'hash', 'admin', 'active', ?, ?)
  `, [adminId, now, now]);

  await execute(`
    INSERT OR REPLACE INTO users (id, email, password_hash, role, status, created_at, updated_at)
    VALUES (?, 'parent1@test.com', 'hash', 'parent', 'active', ?, ?)
  `, [parent1Id, now, now]);

  await execute(`
    INSERT OR REPLACE INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
    VALUES (?, ?, 'Parent One', 'parent1@test.com', '1234567890', ?, ?)
  `, [`pp-${parent1Id}`, parent1Id, now, now]);

  await execute(`
    INSERT OR REPLACE INTO users (id, email, password_hash, role, status, created_at, updated_at)
    VALUES (?, 'parent2@test.com', 'hash', 'parent', 'active', ?, ?)
  `, [parent2Id, now, now]);

  await execute(`
    INSERT OR REPLACE INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
    VALUES (?, ?, 'Parent Two', 'parent2@test.com', '1234567891', ?, ?)
  `, [`pp-${parent2Id}`, parent2Id, now, now]);

  await execute(`
    INSERT OR REPLACE INTO users (id, email, password_hash, role, status, created_at, updated_at)
    VALUES (?, 'vol1@test.com', 'hash', 'volunteer', 'active', ?, ?)
  `, [vol1Id, now, now]);

  await execute(`
    INSERT OR REPLACE INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, created_at, updated_at)
    VALUES (?, ?, 'Volunteer One', '1234567892', '1234567892', 'Ushering', ?, ?)
  `, [`vp-${vol1Id}`, vol1Id, now, now]);

  await execute(`
    INSERT OR REPLACE INTO users (id, email, password_hash, role, status, created_at, updated_at)
    VALUES (?, 'vol2@test.com', 'hash', 'volunteer', 'active', ?, ?)
  `, [vol2Id, now, now]);

  await execute(`
    INSERT OR REPLACE INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, created_at, updated_at)
    VALUES (?, ?, 'Volunteer Two', '1234567893', '1234567893', 'Security', ?, ?)
  `, [`vp-${vol2Id}`, vol2Id, now, now]);

  // Clean any leftover test announcements
  await execute(`DELETE FROM announcement_reads WHERE announcement_id LIKE 'anc-%'`);
  await execute(`DELETE FROM announcements WHERE id LIKE 'anc-%'`);

  // ==========================================================================
  // SECTION 2: ADMIN ANNOUNCEMENT CREATION
  // ==========================================================================
  console.log('\n--- 3. Announcement Creation & Validation ---');

  // Test 1: Admin creates everyone announcement
  const resEveryone = await createAnnouncement({
    adminUserId: adminId,
    adminRole: 'admin',
    title: 'General Gate Opening Notice',
    body: 'Gates open at 7:30 AM tomorrow for everyone.',
    audienceType: 'everyone'
  });
  const ancEveryone = resEveryone.announcement;
  assert(Boolean(ancEveryone?.id), 'Everyone announcement created successfully');
  assert(ancEveryone.audience_type === 'everyone', 'Everyone audience saved correctly');

  // Test 2: Admin creates all_parents announcement
  const resParents = await createAnnouncement({
    adminUserId: adminId,
    adminRole: 'admin',
    title: 'Parent Arrival Briefing',
    body: 'Parents please drop off children at West Gate Entrance.',
    audienceType: 'all_parents'
  });
  const ancParents = resParents.announcement;
  assert(Boolean(ancParents?.id), 'All_parents announcement created successfully');
  assert(ancParents.audience_type === 'all_parents', 'All_parents audience saved correctly');

  // Test 3: Admin creates all_volunteers announcement
  const resVolunteers = await createAnnouncement({
    adminUserId: adminId,
    adminRole: 'admin',
    title: 'Morning Volunteer Muster',
    body: 'All volunteers assemble in Conference Hall B by 6:45 AM.',
    audienceType: 'all_volunteers'
  });
  const ancVolunteers = resVolunteers.announcement;
  assert(Boolean(ancVolunteers?.id), 'All_volunteers announcement created successfully');
  assert(ancVolunteers.audience_type === 'all_volunteers', 'All_volunteers audience saved correctly');

  // Test 4: Admin creates targeted parent announcement (Parent 1)
  const resTargetP1 = await createAnnouncement({
    adminUserId: adminId,
    adminRole: 'admin',
    title: 'Special Accommodation Update for Parent 1',
    body: 'We have reserved front seating for your child.',
    audienceType: 'selected_parent',
    targetUserId: parent1Id
  });
  const ancTargetP1 = resTargetP1.announcement;
  assert(Boolean(ancTargetP1?.id), 'Selected parent announcement created');
  assert(ancTargetP1.target_user_id === parent1Id, 'Targeted user ID matches Parent 1');

  // Test 5: Admin creates targeted volunteer announcement (Volunteer 1)
  const resTargetV1 = await createAnnouncement({
    adminUserId: adminId,
    adminRole: 'admin',
    title: 'Badge Station Reassignment for Vol 1',
    body: 'You have been assigned Lead Rover for Sector 3.',
    audienceType: 'selected_volunteer',
    targetUserId: vol1Id
  });
  const ancTargetV1 = resTargetV1.announcement;
  assert(Boolean(ancTargetV1?.id), 'Selected volunteer announcement created');
  assert(ancTargetV1.target_user_id === vol1Id, 'Targeted user ID matches Vol 1');

  // Test 6: Non-admin creation rejected
  try {
    await createAnnouncement({
      adminUserId: parent1Id,
      adminRole: 'parent',
      title: 'Hacked announcement',
      body: 'Should fail',
      audienceType: 'everyone'
    });
    assert(false, 'Should have failed with non-admin role');
  } catch (err: any) {
    assert(err.message.includes('Only admins'), 'Non-admin announcement creation rejected with 403');
  }

  // Test 7: Missing target_user_id rejected
  try {
    await createAnnouncement({
      adminUserId: adminId,
      adminRole: 'admin',
      title: 'Missing target',
      body: 'Body',
      audienceType: 'selected_parent'
      // missing targetUserId
    });
    assert(false, 'Should have failed without targetUserId');
  } catch (err: any) {
    assert(err.message.includes('recipient is required'), 'Validation correctly rejected missing targetUserId');
  }

  // Test 8: Invalid audience rejected
  try {
    await createAnnouncement({
      adminUserId: adminId,
      adminRole: 'admin',
      title: 'Bad audience',
      body: 'Body',
      audienceType: 'invalid_audience' as any
    });
    assert(false, 'Should have failed with invalid audience');
  } catch (err: any) {
    assert(err.message.includes('Invalid audience'), 'Validation correctly rejected invalid audience');
  }

  // ==========================================================================
  // SECTION 3: AUDIENCE ISOLATION
  // ==========================================================================
  console.log('\n--- 4. Audience Isolation Checks ---');

  // Parent 1 List: Must see everyone, all_parents, and targetP1 (3 total)
  const p1Res = await listParentAnnouncements({ parentUserId: parent1Id, limit: 50 });
  const p1List = p1Res.announcements;
  const p1Ids = p1List.map(a => a.id);
  assert(p1List.length === 3, `Parent 1 sees exactly 3 announcements (got ${p1List.length})`);
  assert(p1Ids.includes(ancEveryone.id), 'Parent 1 sees everyone announcement');
  assert(p1Ids.includes(ancParents.id), 'Parent 1 sees all_parents announcement');
  assert(p1Ids.includes(ancTargetP1.id), 'Parent 1 sees targeted announcement');
  assert(!p1Ids.includes(ancVolunteers.id), 'Parent 1 CANNOT see all_volunteers announcement');
  assert(!p1Ids.includes(ancTargetV1.id), 'Parent 1 CANNOT see volunteer-targeted announcement');

  // Parent 2 List: Must see everyone, all_parents (2 total). MUST NOT see targetP1
  const p2Res = await listParentAnnouncements({ parentUserId: parent2Id, limit: 50 });
  const p2List = p2Res.announcements;
  const p2Ids = p2List.map(a => a.id);
  assert(p2List.length === 2, `Parent 2 sees exactly 2 announcements (got ${p2List.length})`);
  assert(p2Ids.includes(ancEveryone.id), 'Parent 2 sees everyone announcement');
  assert(p2Ids.includes(ancParents.id), 'Parent 2 sees all_parents announcement');
  assert(!p2Ids.includes(ancTargetP1.id), 'Parent 2 CANNOT see Parent 1 targeted announcement');
  assert(!p2Ids.includes(ancVolunteers.id), 'Parent 2 CANNOT see all_volunteers announcement');

  // Volunteer 1 List: Must see everyone, all_volunteers, and targetV1 (3 total)
  const v1Res = await listVolunteerAnnouncements({ volunteerUserId: vol1Id, limit: 50 });
  const v1List = v1Res.announcements;
  const v1Ids = v1List.map(a => a.id);
  assert(v1List.length === 3, `Volunteer 1 sees exactly 3 announcements (got ${v1List.length})`);
  assert(v1Ids.includes(ancEveryone.id), 'Volunteer 1 sees everyone announcement');
  assert(v1Ids.includes(ancVolunteers.id), 'Volunteer 1 sees all_volunteers announcement');
  assert(v1Ids.includes(ancTargetV1.id), 'Volunteer 1 sees targeted announcement');
  assert(!v1Ids.includes(ancParents.id), 'Volunteer 1 CANNOT see all_parents announcement');
  assert(!v1Ids.includes(ancTargetP1.id), 'Volunteer 1 CANNOT see parent-targeted announcement');

  // Volunteer 2 List: Must see everyone, all_volunteers (2 total). MUST NOT see targetV1
  const v2Res = await listVolunteerAnnouncements({ volunteerUserId: vol2Id, limit: 50 });
  const v2List = v2Res.announcements;
  const v2Ids = v2List.map(a => a.id);
  assert(v2List.length === 2, `Volunteer 2 sees exactly 2 announcements (got ${v2List.length})`);
  assert(v2Ids.includes(ancEveryone.id), 'Volunteer 2 sees everyone announcement');
  assert(v2Ids.includes(ancVolunteers.id), 'Volunteer 2 sees all_volunteers announcement');
  assert(!v2Ids.includes(ancTargetV1.id), 'Volunteer 2 CANNOT see Volunteer 1 targeted announcement');
  assert(!v2Ids.includes(ancParents.id), 'Volunteer 2 CANNOT see all_parents announcement');

  // Admin List: Sees all 5 announcements
  const adminRes = await listAdminAnnouncements({ limit: 50 });
  assert(adminRes.announcements.length >= 5, `Admin sees all created announcements (got ${adminRes.announcements.length})`);

  // ==========================================================================
  // SECTION 4: UNREAD COUNT & MARK READ ISOLATION
  // ==========================================================================
  console.log('\n--- 5. Unread Count & Mark Read Tracking ---');

  // Check initial unread counts
  let p1Unread = (await getParentAnnouncementUnreadCount({ parentUserId: parent1Id })).unreadCount;
  let p2Unread = (await getParentAnnouncementUnreadCount({ parentUserId: parent2Id })).unreadCount;
  let v1Unread = (await getVolunteerAnnouncementUnreadCount({ volunteerUserId: vol1Id })).unreadCount;

  assert(p1Unread === 3, `Parent 1 initial unread count is 3 (got ${p1Unread})`);
  assert(p2Unread === 2, `Parent 2 initial unread count is 2 (got ${p2Unread})`);
  assert(v1Unread === 3, `Volunteer 1 initial unread count is 3 (got ${v1Unread})`);

  // Parent 1 marks ancEveryone read
  await markParentAnnouncementRead({ id: ancEveryone.id, parentUserId: parent1Id });
  p1Unread = (await getParentAnnouncementUnreadCount({ parentUserId: parent1Id })).unreadCount;
  assert(p1Unread === 2, `Parent 1 unread count dropped to 2 (got ${p1Unread})`);

  // Verify Parent 2 is STILL unread for ancEveryone (read state isolation!)
  p2Unread = (await getParentAnnouncementUnreadCount({ parentUserId: parent2Id })).unreadCount;
  assert(p2Unread === 2, `Parent 2 unread count remains 2 (isolated from Parent 1 read action)`);

  // Verify list reflects is_read flag
  const p1ListAfter = (await listParentAnnouncements({ parentUserId: parent1Id, limit: 50 })).announcements;
  const p1EveryoneItem = p1ListAfter.find(a => a.id === ancEveryone.id);
  assert(p1EveryoneItem?.is_read === true, 'Parent 1 list shows is_read = true for read announcement');

  const p2ListAfter = (await listParentAnnouncements({ parentUserId: parent2Id, limit: 50 })).announcements;
  const p2EveryoneItem = p2ListAfter.find(a => a.id === ancEveryone.id);
  assert(p2EveryoneItem?.is_read === false, 'Parent 2 list shows is_read = false for same announcement');

  // Volunteer 1 marks ancTargetV1 read
  await markVolunteerAnnouncementRead({ id: ancTargetV1.id, volunteerUserId: vol1Id });
  v1Unread = (await getVolunteerAnnouncementUnreadCount({ volunteerUserId: vol1Id })).unreadCount;
  assert(v1Unread === 2, `Volunteer 1 unread count dropped to 2 (got ${v1Unread})`);

  // ==========================================================================
  // SECTION 5: REGRESSION TESTING (SUPPORT THREADS STILL OPERATE FLAWLESSLY)
  // ==========================================================================
  console.log('\n--- 6. Regression: Direct Messaging Continues Operating ---');

  // Parent support thread creation & reply
  const parentThreadRes = await createThread({
    creatorUserId: parent1Id,
    creatorRole: 'parent',
    category: 'general_support',
    subject: 'Question regarding arrival times',
    body: 'Hello, can we arrive 10 minutes early?'
  });
  const parentThread = parentThreadRes.thread;
  assert(Boolean(parentThread?.id), 'Parent direct support thread created successfully');

  // Admin reply
  const adminMsgRes = await appendMessage({
    threadId: parentThread.id,
    senderUserId: adminId,
    senderRole: 'admin',
    body: 'Yes, 10 minutes early is fine.'
  });
  assert(Boolean(adminMsgRes?.message?.id), 'Admin replied to Parent support thread');

  // Parent marks thread read
  await markThreadRead({ threadId: parentThread.id, userId: parent1Id });
  const pThreads = await listThreads({ userId: parent1Id, role: 'parent' });
  assert(pThreads.threads.length >= 1, 'Parent can list direct support threads');

  // Volunteer support thread creation & reply
  const volThreadRes = await createThread({
    creatorUserId: vol1Id,
    creatorRole: 'volunteer',
    category: 'duty_support',
    subject: 'Question about duty post rotation',
    body: 'When is the second rover shift starting?'
  });
  const volThread = volThreadRes.thread;
  assert(Boolean(volThread?.id), 'Volunteer direct support thread created successfully');

  const vThreads = await listThreads({ userId: vol1Id, role: 'volunteer' });
  assert(vThreads.threads.length >= 1, 'Volunteer can list direct support threads');

  console.log('\n====================================================');
  console.log('ALL PHASE G BROADCAST & REGRESSION TESTS PASSED!');
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
