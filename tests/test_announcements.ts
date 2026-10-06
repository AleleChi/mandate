import crypto from 'crypto';
import { execute, query, queryOne } from '../src/server/db';
import {
  createAnnouncement,
  listAdminAnnouncements,
  getAdminAnnouncement,
  searchAnnouncementRecipients,
  listParentAnnouncements,
  getParentAnnouncement,
  getParentAnnouncementUnreadCount,
  markParentAnnouncementRead,
  listVolunteerAnnouncements,
  getVolunteerAnnouncement,
  getVolunteerAnnouncementUnreadCount,
  markVolunteerAnnouncementRead
} from '../src/server/services/announcementService';
import { MessageDomainError } from '../src/server/services/messageService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failed++;
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`[PASS] ${msg}`);
  passed++;
}

async function runTests() {
  console.log('====================================================');
  console.log('KOINONIA MESSAGING — PHASE G: ANNOUNCEMENTS TEST SUITE');
  console.log('====================================================\n');

  const now = new Date().toISOString();
  const runId = Date.now().toString().slice(-6);
  const eventId = `test-evt-anc-${runId}`;

  // 1. Setup Test Event
  console.log('[Setup] Inserting test event...');
  await execute(`
    INSERT OR REPLACE INTO events (id, title, starts_at, ends_at, status, created_at, updated_at)
    VALUES (?, 'Test Event Phase G', '2026-10-01T10:00:00Z', '2026-10-01T18:00:00Z', 'active', ?, ?)
  `, [eventId, now, now]);

  // Clean test tables
  await execute(`DELETE FROM announcement_reads WHERE announcement_id LIKE 'anc-%'`);
  await execute(`DELETE FROM announcements WHERE id LIKE 'anc-%'`);

  // 2. Setup Test Users
  console.log('[Setup] Creating test users & profiles...');
  const parent1Id = `usr-p1-anc-${runId}`;
  const parent1ProfileId = `prof-p1-anc-${runId}`;
  const parent2Id = `usr-p2-anc-${runId}`;
  const parent2ProfileId = `prof-p2-anc-${runId}`;

  const vol1Id = `usr-v1-anc-${runId}`;
  const vol1ProfileId = `prof-v1-anc-${runId}`;
  const vol2Id = `usr-v2-anc-${runId}`;
  const vol2ProfileId = `prof-v2-anc-${runId}`;

  const adminId = `usr-adm-anc-${runId}`;
  const superAdminId = `usr-sadm-anc-${runId}`;
  const teamId = `usr-team-anc-${runId}`;

  // Insert Users
  await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'hash', 'parent', ?, ?)`, [parent1Id, `p1_${runId}@test.com`, now, now]);
  await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'hash', 'parent', ?, ?)`, [parent2Id, `p2_${runId}@test.com`, now, now]);
  await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'hash', 'volunteer', ?, ?)`, [vol1Id, `v1_${runId}@test.com`, now, now]);
  await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'hash', 'volunteer', ?, ?)`, [vol2Id, `v2_${runId}@test.com`, now, now]);
  await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'hash', 'admin', ?, ?)`, [adminId, `adm_${runId}@test.com`, now, now]);
  await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'hash', 'super_admin', ?, ?)`, [superAdminId, `sadm_${runId}@test.com`, now, now]);
  await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'hash', 'team', ?, ?)`, [teamId, `team_${runId}@test.com`, now, now]);

  // Insert Parent Profiles
  await execute(`INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, is_koinonia_worker, created_at, updated_at) VALUES (?, ?, 'Parent One', ?, '08011111111', 0, ?, ?)`, [parent1ProfileId, parent1Id, `p1_${runId}@test.com`, now, now]);
  await execute(`INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, is_koinonia_worker, created_at, updated_at) VALUES (?, ?, 'Parent Two', ?, '08022222222', 0, ?, ?)`, [parent2ProfileId, parent2Id, `p2_${runId}@test.com`, now, now]);

  // Insert Volunteer Profiles
  await execute(`INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, serving_experience, status, created_at, updated_at) VALUES (?, ?, 'Volunteer One', '08033333333', '08033333333', 'Media Team', 2, 'approved', ?, ?)`, [vol1ProfileId, vol1Id, now, now]);
  await execute(`INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, serving_experience, status, created_at, updated_at) VALUES (?, ?, 'Volunteer Two', '08044444444', '08044444444', 'Check-in Team', 1, 'approved', ?, ?)`, [vol2ProfileId, vol2Id, now, now]);

  // ==========================================================================
  // SECTION 1: ADMIN AUTHORIZATION & PERMISSIONS
  // ==========================================================================
  console.log('\n--- SECTION 1: ADMIN AUTHORIZATION & PERMISSIONS ---');

  // Admin can publish
  const adminRes = await createAnnouncement({
    title: 'Welcome Parents and Volunteers',
    body: 'We are delighted to welcome everyone to Koinonia 2026.',
    audienceType: 'everyone',
    adminUserId: adminId,
    adminRole: 'admin',
    eventId
  });
  assert(adminRes.success === true, 'Admin can publish announcement');
  assert(Boolean(adminRes.announcement.published_at), 'Published announcement has published_at timestamp');

  // Super Admin can publish
  const superAdminRes = await createAnnouncement({
    title: 'Super Admin Notice',
    body: 'Notice from super admin.',
    audienceType: 'all_parents',
    adminUserId: superAdminId,
    adminRole: 'super_admin',
    eventId
  });
  assert(superAdminRes.success === true, 'Super admin can publish announcement');

  // Team denied
  try {
    await createAnnouncement({
      title: 'Unauthorized announcement',
      body: 'Body',
      audienceType: 'everyone',
      adminUserId: teamId,
      adminRole: 'team',
      eventId
    });
    assert(false, 'Team user must be rejected with 403');
  } catch (err: any) {
    assert(err.statusCode === 403, 'Team user rejected with 403 status code');
  }

  // Parent denied
  try {
    await createAnnouncement({
      title: 'Parent Broadcast',
      body: 'Body',
      audienceType: 'everyone',
      adminUserId: parent1Id,
      adminRole: 'parent',
      eventId
    });
    assert(false, 'Parent user must be rejected with 403');
  } catch (err: any) {
    assert(err.statusCode === 403, 'Parent user rejected with 403 status code');
  }

  // Volunteer denied
  try {
    await createAnnouncement({
      title: 'Volunteer Broadcast',
      body: 'Body',
      audienceType: 'everyone',
      adminUserId: vol1Id,
      adminRole: 'volunteer',
      eventId
    });
    assert(false, 'Volunteer user must be rejected with 403');
  } catch (err: any) {
    assert(err.statusCode === 403, 'Volunteer user rejected with 403 status code');
  }

  // ==========================================================================
  // SECTION 2: AUDIENCE RESOLUTION & VISIBILITY
  // ==========================================================================
  console.log('\n--- SECTION 2: AUDIENCE RESOLUTION & VISIBILITY ---');

  // Create an announcement for all_volunteers
  const volAnnRes = await createAnnouncement({
    title: 'Volunteer Briefing 08:00 AM',
    body: 'All volunteers must report to the Main Hall by 8am on Saturday.',
    audienceType: 'all_volunteers',
    adminUserId: adminId,
    adminRole: 'admin',
    eventId
  });
  assert(volAnnRes.success === true, 'Created all_volunteers announcement');

  // Create an announcement for selected_parent (parent1)
  const selParentRes = await createAnnouncement({
    title: 'Special Note for Parent 1',
    body: 'Important individual note regarding your schedule.',
    audienceType: 'selected_parent',
    targetUserId: parent1Id,
    adminUserId: adminId,
    adminRole: 'admin',
    eventId
  });
  assert(selParentRes.success === true, 'Created selected_parent announcement');

  // Create an announcement for selected_volunteer (vol1)
  const selVolRes = await createAnnouncement({
    title: 'Duty Assignment for Vol 1',
    body: 'You have been assigned as Team Lead for Zone 3.',
    audienceType: 'selected_volunteer',
    targetUserId: vol1Id,
    adminUserId: adminId,
    adminRole: 'admin',
    eventId
  });
  assert(selVolRes.success === true, 'Created selected_volunteer announcement');

  // Query Parent 1
  const p1List = await listParentAnnouncements({ parentUserId: parent1Id });
  const p1Titles = p1List.announcements.map(a => a.title);
  assert(p1Titles.includes('Welcome Parents and Volunteers'), 'Parent 1 sees "everyone" announcement');
  assert(p1Titles.includes('Super Admin Notice'), 'Parent 1 sees "all_parents" announcement');
  assert(p1Titles.includes('Special Note for Parent 1'), 'Parent 1 sees targeted "selected_parent" announcement');
  assert(!p1Titles.includes('Volunteer Briefing 08:00 AM'), 'Parent 1 does NOT see "all_volunteers" announcement');
  assert(!p1Titles.includes('Duty Assignment for Vol 1'), 'Parent 1 does NOT see "selected_volunteer" announcement');

  // Query Parent 2
  const p2List = await listParentAnnouncements({ parentUserId: parent2Id });
  const p2Titles = p2List.announcements.map(a => a.title);
  assert(p2Titles.includes('Welcome Parents and Volunteers'), 'Parent 2 sees "everyone" announcement');
  assert(p2Titles.includes('Super Admin Notice'), 'Parent 2 sees "all_parents" announcement');
  assert(!p2Titles.includes('Special Note for Parent 1'), 'Parent 2 does NOT see targeted note for Parent 1');
  assert(!p2Titles.includes('Volunteer Briefing 08:00 AM'), 'Parent 2 does NOT see "all_volunteers" announcement');

  // Query Volunteer 1
  const v1List = await listVolunteerAnnouncements({ volunteerUserId: vol1Id });
  const v1Titles = v1List.announcements.map(a => a.title);
  assert(v1Titles.includes('Welcome Parents and Volunteers'), 'Volunteer 1 sees "everyone" announcement');
  assert(v1Titles.includes('Volunteer Briefing 08:00 AM'), 'Volunteer 1 sees "all_volunteers" announcement');
  assert(v1Titles.includes('Duty Assignment for Vol 1'), 'Volunteer 1 sees targeted "selected_volunteer" announcement');
  assert(!v1Titles.includes('Super Admin Notice'), 'Volunteer 1 does NOT see "all_parents" announcement');
  assert(!v1Titles.includes('Special Note for Parent 1'), 'Volunteer 1 does NOT see "selected_parent" announcement');

  // Query Volunteer 2
  const v2List = await listVolunteerAnnouncements({ volunteerUserId: vol2Id });
  const v2Titles = v2List.announcements.map(a => a.title);
  assert(v2Titles.includes('Welcome Parents and Volunteers'), 'Volunteer 2 sees "everyone" announcement');
  assert(v2Titles.includes('Volunteer Briefing 08:00 AM'), 'Volunteer 2 sees "all_volunteers" announcement');
  assert(!v2Titles.includes('Duty Assignment for Vol 1'), 'Volunteer 2 does NOT see targeted note for Volunteer 1');
  assert(!v2Titles.includes('Super Admin Notice'), 'Volunteer 2 does NOT see "all_parents" announcement');

  // ==========================================================================
  // SECTION 3: PRIVACY & DIRECT GET ISOLATION
  // ==========================================================================
  console.log('\n--- SECTION 3: PRIVACY & DIRECT GET ISOLATION ---');

  // Parent 2 attempts to fetch Parent 1's selected announcement by ID
  try {
    await getParentAnnouncement({ id: selParentRes.announcement.id, parentUserId: parent2Id });
    assert(false, 'Parent 2 should not be able to get Parent 1 selected announcement');
  } catch (err: any) {
    assert(err.statusCode === 404, 'Parent 2 getting Parent 1 announcement returns 404');
  }

  // Volunteer 2 attempts to fetch Volunteer 1's selected announcement by ID
  try {
    await getVolunteerAnnouncement({ id: selVolRes.announcement.id, volunteerUserId: vol2Id });
    assert(false, 'Volunteer 2 should not be able to get Volunteer 1 selected announcement');
  } catch (err: any) {
    assert(err.statusCode === 404, 'Volunteer 2 getting Volunteer 1 announcement returns 404');
  }

  // Parent 1 attempts to fetch Volunteer-only announcement
  try {
    await getParentAnnouncement({ id: volAnnRes.announcement.id, parentUserId: parent1Id });
    assert(false, 'Parent 1 should not be able to get Volunteer announcement');
  } catch (err: any) {
    assert(err.statusCode === 404, 'Parent 1 getting Volunteer announcement returns 404');
  }

  // Volunteer 1 attempts to fetch Parent-only announcement
  try {
    await getVolunteerAnnouncement({ id: superAdminRes.announcement.id, volunteerUserId: vol1Id });
    assert(false, 'Volunteer 1 should not be able to get Parent announcement');
  } catch (err: any) {
    assert(err.statusCode === 404, 'Volunteer 1 getting Parent announcement returns 404');
  }

  // Verify recipient payloads do not expose recipient user IDs or other sensitive fields
  const p1Item = p1List.announcements[0];
  assert(p1Item.target_user_id === undefined, 'Recipient announcement item does not expose target_user_id');
  assert(p1Item.created_by_user_id === undefined, 'Recipient announcement item does not expose created_by_user_id');

  // ==========================================================================
  // SECTION 4: READ STATE & UNREAD COUNTS
  // ==========================================================================
  console.log('\n--- SECTION 4: READ STATE & UNREAD COUNTS ---');

  // Parent 1 unread count initially
  const initialP1Unread = await getParentAnnouncementUnreadCount({ parentUserId: parent1Id });
  assert(initialP1Unread.unreadCount === 3, `Parent 1 initially has 3 unread announcements (got ${initialP1Unread.unreadCount})`);

  // Parent 2 unread count initially
  const initialP2Unread = await getParentAnnouncementUnreadCount({ parentUserId: parent2Id });
  assert(initialP2Unread.unreadCount === 2, `Parent 2 initially has 2 unread announcements (got ${initialP2Unread.unreadCount})`);

  // Parent 1 marks one announcement as read
  const markRes1 = await markParentAnnouncementRead({ id: selParentRes.announcement.id, parentUserId: parent1Id });
  assert(markRes1.success === true, 'Parent 1 marked announcement as read');

  // Check unread count drops by 1
  const afterMarkP1Unread = await getParentAnnouncementUnreadCount({ parentUserId: parent1Id });
  assert(afterMarkP1Unread.unreadCount === 2, 'Parent 1 unread count decreased to 2');

  // Check Parent 2 unread count is unchanged
  const afterMarkP2Unread = await getParentAnnouncementUnreadCount({ parentUserId: parent2Id });
  assert(afterMarkP2Unread.unreadCount === 2, 'Parent 2 unread count remained 2');

  // Idempotent: mark read again
  const markRes2 = await markParentAnnouncementRead({ id: selParentRes.announcement.id, parentUserId: parent1Id });
  assert(markRes2.success === true, 'Repeat mark read succeeds idempotently');
  const idempotentP1Unread = await getParentAnnouncementUnreadCount({ parentUserId: parent1Id });
  assert(idempotentP1Unread.unreadCount === 2, 'Unread count remains 2 after duplicate mark read');

  // Check single item returned has is_read = true
  const p1Detail = await getParentAnnouncement({ id: selParentRes.announcement.id, parentUserId: parent1Id });
  assert(p1Detail.announcement.is_read === true, 'Single item returns is_read = true');
  assert(Boolean(p1Detail.announcement.read_at), 'Single item returns read_at timestamp');

  // Volunteer 1 marks announcement as read
  const v1UnreadBefore = await getVolunteerAnnouncementUnreadCount({ volunteerUserId: vol1Id });
  assert(v1UnreadBefore.unreadCount === 3, `Volunteer 1 has 3 unread announcements (got ${v1UnreadBefore.unreadCount})`);

  await markVolunteerAnnouncementRead({ id: selVolRes.announcement.id, volunteerUserId: vol1Id });
  const v1UnreadAfter = await getVolunteerAnnouncementUnreadCount({ volunteerUserId: vol1Id });
  assert(v1UnreadAfter.unreadCount === 2, 'Volunteer 1 unread count decreased to 2');

  // Admin query shows total_reads
  const adminAnnDetail = await getAdminAnnouncement(selParentRes.announcement.id);
  assert(adminAnnDetail.announcement.total_reads === 1, 'Admin announcement detail shows total_reads = 1');
  assert(adminAnnDetail.announcement.target_parent_name === 'Parent One', 'Admin announcement detail resolves target parent name');

  // ==========================================================================
  // SECTION 5: CONTENT VALIDATION & AUDIENCE CONSTRAINTS
  // ==========================================================================
  console.log('\n--- SECTION 5: CONTENT VALIDATION & AUDIENCE CONSTRAINTS ---');

  // Empty title rejected
  try {
    await createAnnouncement({
      title: '   ',
      body: 'Some valid body text.',
      audienceType: 'everyone',
      adminUserId: adminId,
      adminRole: 'admin',
      eventId
    });
    assert(false, 'Empty title must be rejected');
  } catch (err: any) {
    assert(err.code === 'MESSAGE_SUBJECT_REQUIRED', 'Empty title rejected with MESSAGE_SUBJECT_REQUIRED');
  }

  // Empty body rejected
  try {
    await createAnnouncement({
      title: 'Valid Title',
      body: '   ',
      audienceType: 'everyone',
      adminUserId: adminId,
      adminRole: 'admin',
      eventId
    });
    assert(false, 'Empty body must be rejected');
  } catch (err: any) {
    assert(err.code === 'MESSAGE_BODY_REQUIRED', 'Empty body rejected with MESSAGE_BODY_REQUIRED');
  }

  // Title too long (> 120 chars)
  try {
    await createAnnouncement({
      title: 'A'.repeat(121),
      body: 'Some valid body text.',
      audienceType: 'everyone',
      adminUserId: adminId,
      adminRole: 'admin',
      eventId
    });
    assert(false, 'Title > 120 chars must be rejected');
  } catch (err: any) {
    assert(err.code === 'MESSAGE_SUBJECT_TOO_LONG', 'Title > 120 chars rejected with MESSAGE_SUBJECT_TOO_LONG');
  }

  // Body too long (> 5000 chars)
  try {
    await createAnnouncement({
      title: 'Valid Title',
      body: 'B'.repeat(5001),
      audienceType: 'everyone',
      adminUserId: adminId,
      adminRole: 'admin',
      eventId
    });
    assert(false, 'Body > 5000 chars must be rejected');
  } catch (err: any) {
    assert(err.code === 'MESSAGE_BODY_TOO_LONG', 'Body > 5000 chars rejected with MESSAGE_BODY_TOO_LONG');
  }

  // Arbitrary audience rejected
  try {
    await createAnnouncement({
      title: 'Valid Title',
      body: 'Valid Body',
      audienceType: 'parents_under_review' as any,
      adminUserId: adminId,
      adminRole: 'admin',
      eventId
    });
    assert(false, 'Arbitrary audience must be rejected');
  } catch (err: any) {
    assert(err.code === 'ANNOUNCEMENT_INVALID_AUDIENCE', 'Arbitrary audience rejected with ANNOUNCEMENT_INVALID_AUDIENCE');
  }

  // Selected parent without targetUserId rejected
  try {
    await createAnnouncement({
      title: 'Valid Title',
      body: 'Valid Body',
      audienceType: 'selected_parent',
      targetUserId: '',
      adminUserId: adminId,
      adminRole: 'admin',
      eventId
    });
    assert(false, 'Missing target user for selected_parent must be rejected');
  } catch (err: any) {
    assert(err.code === 'ANNOUNCEMENT_TARGET_USER_REQUIRED', 'Missing target user rejected with ANNOUNCEMENT_TARGET_USER_REQUIRED');
  }

  // Selected parent with volunteer user rejected
  try {
    await createAnnouncement({
      title: 'Valid Title',
      body: 'Valid Body',
      audienceType: 'selected_parent',
      targetUserId: vol1Id,
      adminUserId: adminId,
      adminRole: 'admin',
      eventId
    });
    assert(false, 'Volunteer user for selected_parent must be rejected');
  } catch (err: any) {
    assert(err.code === 'ANNOUNCEMENT_TARGET_NOT_PARENT', 'Volunteer target for selected_parent rejected with ANNOUNCEMENT_TARGET_NOT_PARENT');
  }

  // Selected volunteer with parent user rejected
  try {
    await createAnnouncement({
      title: 'Valid Title',
      body: 'Valid Body',
      audienceType: 'selected_volunteer',
      targetUserId: parent1Id,
      adminUserId: adminId,
      adminRole: 'admin',
      eventId
    });
    assert(false, 'Parent user for selected_volunteer must be rejected');
  } catch (err: any) {
    assert(err.code === 'ANNOUNCEMENT_TARGET_NOT_VOLUNTEER', 'Parent target for selected_volunteer rejected with ANNOUNCEMENT_TARGET_NOT_VOLUNTEER');
  }

  // HTML sanitization
  const htmlRes = await createAnnouncement({
    title: '<b>Notice</b> with <script>alert(1)</script> HTML',
    body: '<p>This is a <strong>sanitized</strong> broadcast message.</p>',
    audienceType: 'everyone',
    adminUserId: adminId,
    adminRole: 'admin',
    eventId
  });
  assert(htmlRes.announcement.title === 'Notice with alert(1) HTML', `HTML in title stripped: "${htmlRes.announcement.title}"`);
  assert(htmlRes.announcement.body === 'This is a sanitized broadcast message.', `HTML in body stripped: "${htmlRes.announcement.body}"`);

  // ==========================================================================
  // SECTION 6: AUDIT LOG VERIFICATION
  // ==========================================================================
  console.log('\n--- SECTION 6: AUDIT LOG VERIFICATION ---');

  const auditRow = await queryOne(`
    SELECT * FROM audit_logs
    WHERE target_id = ? AND action = 'ADMIN_ANNOUNCEMENT_PUBLISHED'
  `, [htmlRes.announcement.id]);
  assert(Boolean(auditRow), 'Audit log entry created for ADMIN_ANNOUNCEMENT_PUBLISHED');
  assert(auditRow.target_type === 'announcement', 'Audit log target_type is announcement');

  const parsedDetails = JSON.parse(auditRow.details);
  assert(parsedDetails.announcementId === htmlRes.announcement.id, 'Audit details include announcementId');
  assert(parsedDetails.audienceType === 'everyone', 'Audit details include audienceType');
  assert(parsedDetails.body === undefined, 'Announcement body text is strictly EXCLUDED from audit details');
  assert(parsedDetails.title === undefined, 'Announcement title is EXCLUDED from audit details');

  // ==========================================================================
  // SECTION 7: RECIPIENT SEARCH / CANDIDATE SELECTOR
  // ==========================================================================
  console.log('\n--- SECTION 7: RECIPIENT SEARCH / CANDIDATE SELECTOR ---');

  const parentRecipients = await searchAnnouncementRecipients('parent', `p1_${runId}`);
  assert(parentRecipients.recipients.length >= 1, 'Search parents found matching candidate');
  const foundP1 = parentRecipients.recipients.find(r => r.id === parent1Id);
  assert(Boolean(foundP1), 'Candidate with parent1Id found');
  assert(foundP1?.name === 'Parent One', 'Candidate returns full_name');
  assert(foundP1?.email === `p1_${runId}@test.com`, 'Candidate returns email');
  assert((parentRecipients.recipients[0] as any).password_hash === undefined, 'Candidate does NOT expose password_hash');
  assert((parentRecipients.recipients[0] as any).children === undefined, 'Candidate does NOT expose child records');

  const volRecipients = await searchAnnouncementRecipients('volunteer', `v1_${runId}`);
  assert(volRecipients.recipients.length >= 1, 'Search volunteers found matching candidate');
  const foundV1 = volRecipients.recipients.find(r => r.id === vol1Id);
  assert(Boolean(foundV1), 'Volunteer candidate found');
  assert(foundV1?.name === 'Volunteer One', 'Volunteer candidate returns full_name');

  console.log('\n====================================================');
  console.log(`ALL TESTS PASSED! (${passed} assertions, ${failed} failures)`);
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
