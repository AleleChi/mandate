import crypto from 'crypto';
import express, { Request, Response } from 'express';
import { execute, query, queryOne, withTransaction } from '../src/server/db';
import {
  createThread,
  listThreads,
  getThread,
  getThreadMessages,
  appendMessage,
  markThreadRead,
  resolveThread,
  reopenThread,
  getUnreadCount,
  MessageDomainError
} from '../src/server/services/messageService';
import {
  parentMessagesRouter,
  volunteerMessagesRouter,
  adminMessagesRouter
} from '../src/server/routes/messages';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`[PASS] ${msg}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('KOINONIA MESSAGING CORE — PHASE B TEST SUITE');
  console.log('====================================================\n');

  const now = new Date().toISOString();
  const runId = Date.now().toString().slice(-6);
  const eventId = `test-evt-${runId}`;

  // 1. Setup Test Event
  console.log('[Setup] Inserting test event...');
  await execute(`
    INSERT OR REPLACE INTO events (id, title, starts_at, ends_at, status, created_at, updated_at)
    VALUES (?, 'Test Event Phase B', '2026-10-01T10:00:00Z', '2026-10-01T18:00:00Z', 'active', ?, ?)
  `, [eventId, now, now]);

  // Clean test tables
  await execute(`DELETE FROM messages WHERE thread_id LIKE 'thrd-%'`);
  await execute(`DELETE FROM message_thread_participants WHERE thread_id LIKE 'thrd-%'`);
  await execute(`DELETE FROM message_threads WHERE id LIKE 'thrd-%'`);
  await execute(`DELETE FROM audit_logs WHERE target_id LIKE 'thrd-%'`);

  // 2. Setup Test Users
  console.log('[Setup] Creating test users & profiles...');
  const parent1Id = `usr-p1-${runId}`;
  const parent1ProfileId = `prof-p1-${runId}`;
  const parent2Id = `usr-p2-${runId}`;
  const parent2ProfileId = `prof-p2-${runId}`;

  const vol1Id = `usr-v1-${runId}`;
  const vol1ProfileId = `prof-v1-${runId}`;
  const vol2Id = `usr-v2-${runId}`;
  const vol2ProfileId = `prof-v2-${runId}`;

  const adminId = `usr-adm-${runId}`;
  const superAdminId = `usr-sadm-${runId}`;
  const teamId = `usr-team-${runId}`;

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
  await execute(`INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, created_at, updated_at) VALUES (?, ?, 'Volunteer One', '08033333333', '08033333333', 'Ushering', ?, ?)`, [vol1ProfileId, vol1Id, now, now]);
  await execute(`INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, created_at, updated_at) VALUES (?, ?, 'Volunteer Two', '08044444444', '08044444444', 'Security', ?, ?)`, [vol2ProfileId, vol2Id, now, now]);

  // Insert Children & Event Entries
  const child1Id = `ch-1-${runId}`;
  const entry1Id = `ent-1-${runId}`;
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, created_at, updated_at)
    VALUES (?, ?, 'Child One', 'Male', '2018-01-01', 8, 'Ages 7 to 9', 'Father', ?, ?)
  `, [child1Id, parent1ProfileId, now, now]);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'incomplete', ?, ?)
  `, [entry1Id, child1Id, eventId, now, now]);

  const child2Id = `ch-2-${runId}`;
  const entry2Id = `ent-2-${runId}`;
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, created_at, updated_at)
    VALUES (?, ?, 'Child Two', 'Female', '2019-05-01', 7, 'Ages 7 to 9', 'Mother', ?, ?)
  `, [child2Id, parent2ProfileId, now, now]);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'incomplete', ?, ?)
  `, [entry2Id, child2Id, eventId, now, now]);

  // ==========================================================================
  // TEST SECTION 1: THREAD CREATION
  // ==========================================================================
  console.log('\n--- SECTION 1: THREAD CREATION ---');

  // 1.1 Parent creates general support thread
  const pThread1 = await createThread({
    eventId,
    category: 'general_support',
    subject: 'Need help with registration venue',
    body: 'Hello admin, what time do doors open on Sunday?',
    creatorUserId: parent1Id,
    creatorRole: 'parent',
    parentProfileId: parent1ProfileId
  });

  assert(pThread1.thread.id.startsWith('thrd-'), 'Thread ID starts with thrd-');
  assert(pThread1.thread.category === 'general_support', 'Thread category matches');
  assert(pThread1.thread.status === 'open', 'Thread status is open');
  assert(pThread1.message.body === 'Hello admin, what time do doors open on Sunday?', 'Initial message body saved');
  assert(pThread1.message.sender_user_id === parent1Id, 'Initial message sender matches');
  assert(pThread1.message.sender_role === 'parent', 'Initial message sender role matches');

  // Verify participant row
  const p1Part = await queryOne('SELECT * FROM message_thread_participants WHERE thread_id = ? AND user_id = ?', [pThread1.thread.id, parent1Id]);
  assert(!!p1Part, 'Parent is recorded as thread participant');
  assert(p1Part.role === 'parent', 'Participant role is parent');

  // 1.2 Volunteer creates duty support thread
  const vThread1 = await createThread({
    eventId,
    category: 'duty_support',
    subject: 'Ushering shift swap request',
    body: 'Hello team, I need to request a swap for morning shift.',
    creatorUserId: vol1Id,
    creatorRole: 'volunteer'
  });

  assert(vThread1.thread.id.startsWith('thrd-'), 'Volunteer thread ID generated');
  assert(vThread1.thread.category === 'duty_support', 'Volunteer category matches');
  const v1Part = await queryOne('SELECT * FROM message_thread_participants WHERE thread_id = ? AND user_id = ?', [vThread1.thread.id, vol1Id]);
  assert(!!v1Part, 'Volunteer recorded as thread participant');

  // 1.3 Parent creates child_application thread with valid ownership
  const pChildThread = await createThread({
    eventId,
    category: 'child_application',
    subject: 'Question on Child One medical info',
    body: 'Can I add an allergy note after submitting?',
    creatorUserId: parent1Id,
    creatorRole: 'parent',
    parentProfileId: parent1ProfileId,
    linkedChildId: child1Id,
    linkedEntryId: entry1Id
  });
  assert(pChildThread.thread.linked_child_id === child1Id, 'Child ID linked properly');
  assert(pChildThread.thread.linked_entry_id === entry1Id, 'Entry ID linked properly');

  // 1.4 Duplicate prevention for child_application thread on same entry
  const pChildThreadDup = await createThread({
    eventId,
    category: 'child_application',
    subject: 'Second question on Child One medical info',
    body: 'Another message for the same application.',
    creatorUserId: parent1Id,
    creatorRole: 'parent',
    parentProfileId: parent1ProfileId,
    linkedChildId: child1Id,
    linkedEntryId: entry1Id
  });
  assert(pChildThreadDup.thread.id === pChildThread.thread.id, 'Duplicate child_application thread reused existing open thread');
  assert(pChildThreadDup.isExisting === true, 'Response indicates thread was reused');

  // 1.5 Rapid double-tap protection for generic thread
  const pRapidDup = await createThread({
    eventId,
    category: 'general_support',
    subject: 'Need help with registration venue',
    body: 'Hello admin, what time do doors open on Sunday?',
    creatorUserId: parent1Id,
    creatorRole: 'parent',
    parentProfileId: parent1ProfileId
  });
  assert(pRapidDup.thread.id === pThread1.thread.id, 'Rapid identical thread request reused open thread');
  assert(pRapidDup.isExisting === true, 'Response indicates rapid duplicate thread was reused');

  // 1.6 Transaction rollback on failure: test that failures leave no orphan thread
  let rollbackErrorCaught = false;
  try {
    // Pass an invalid body (e.g. whitespace only) that would fail validation inside createThread
    await createThread({
      eventId,
      category: 'general_support',
      subject: 'Valid Subject',
      body: '    ', // empty after trim -> fails body validation
      creatorUserId: parent1Id,
      creatorRole: 'parent',
      parentProfileId: parent1ProfileId
    });
  } catch (err: any) {
    rollbackErrorCaught = true;
    assert(err.code === 'MESSAGE_BODY_REQUIRED', 'Validation caught empty body');
  }
  assert(rollbackErrorCaught, 'Rollback error was caught');
  const orphanCheck = await queryOne('SELECT * FROM message_threads WHERE subject = ?', ['Valid Subject']);
  assert(!orphanCheck, 'No orphan thread record persisted after validation error');

  // ==========================================================================
  // TEST SECTION 2: PARENT ISOLATION
  // ==========================================================================
  console.log('\n--- SECTION 2: PARENT ISOLATION ---');

  // 2.1 Parent 1 can list own threads
  const p1List = await listThreads({ userId: parent1Id, role: 'parent' });
  assert(p1List.threads.length >= 2, 'Parent 1 can list own threads');
  const p1ThreadIds = p1List.threads.map(t => t.id);
  assert(p1ThreadIds.includes(pThread1.thread.id), 'Parent 1 list contains thread 1');
  assert(!p1ThreadIds.includes(vThread1.thread.id), 'Parent 1 list does NOT contain volunteer thread');

  // 2.2 Parent 1 can open own thread
  const p1OpenOwn = await getThread({ threadId: pThread1.thread.id, userId: parent1Id, role: 'parent' });
  assert(p1OpenOwn.thread.id === pThread1.thread.id, 'Parent 1 successfully opens own thread');

  // 2.3 Parent 2 creates a thread
  const p2Thread = await createThread({
    eventId,
    category: 'general_support',
    subject: 'Parent Two support question',
    body: 'Question from Parent Two.',
    creatorUserId: parent2Id,
    creatorRole: 'parent',
    parentProfileId: parent2ProfileId
  });

  // 2.4 Parent 1 CANNOT open Parent 2's thread (Fail closed with 404 / MESSAGE_THREAD_NOT_FOUND)
  let p1CrossOpenFailed = false;
  try {
    await getThread({ threadId: p2Thread.thread.id, userId: parent1Id, role: 'parent' });
  } catch (err: any) {
    p1CrossOpenFailed = true;
    assert(err.code === 'MESSAGE_THREAD_NOT_FOUND', 'Cross-parent thread access returns NOT_FOUND (safe 404)');
    assert(err.statusCode === 404, 'Status code is 404');
  }
  assert(p1CrossOpenFailed, 'Parent 1 blocked from opening Parent 2 thread');

  // 2.5 Parent 1 CANNOT open Volunteer thread
  let p1VolunteerOpenFailed = false;
  try {
    await getThread({ threadId: vThread1.thread.id, userId: parent1Id, role: 'parent' });
  } catch (err: any) {
    p1VolunteerOpenFailed = true;
    assert(err.code === 'MESSAGE_THREAD_NOT_FOUND', 'Parent access to Volunteer thread returns NOT_FOUND');
  }
  assert(p1VolunteerOpenFailed, 'Parent 1 blocked from opening Volunteer thread');

  // 2.6 Parent 1 CANNOT spoof child ownership (tries to link Child 2 belonging to Parent 2)
  let spoofChildFailed = false;
  try {
    await createThread({
      eventId,
      category: 'child_application',
      subject: 'Trying to access Child Two',
      body: 'Should be rejected',
      creatorUserId: parent1Id,
      creatorRole: 'parent',
      parentProfileId: parent1ProfileId,
      linkedChildId: child2Id,
      linkedEntryId: entry2Id
    });
  } catch (err: any) {
    spoofChildFailed = true;
    assert(err.code === 'MESSAGE_CHILD_FORBIDDEN', 'Spoofed child ownership rejected with MESSAGE_CHILD_FORBIDDEN');
    assert(err.statusCode === 403, 'Status code is 403');
  }
  assert(spoofChildFailed, 'Foreign child ownership rejected');

  // 2.7 Parent 1 CANNOT provide mismatched linkedEntryId
  let mismatchedEntryFailed = false;
  try {
    await createThread({
      eventId,
      category: 'child_application',
      subject: 'Mismatched entry',
      body: 'Should be rejected',
      creatorUserId: parent1Id,
      creatorRole: 'parent',
      parentProfileId: parent1ProfileId,
      linkedChildId: child1Id,
      linkedEntryId: entry2Id // entry2 belongs to child2!
    });
  } catch (err: any) {
    mismatchedEntryFailed = true;
    assert(err.code === 'MESSAGE_CHILD_FORBIDDEN', 'Mismatched child/entry rejected with MESSAGE_CHILD_FORBIDDEN');
  }
  assert(mismatchedEntryFailed, 'Mismatched entry rejected');

  // 2.8 Parent CANNOT use volunteer categories (e.g. duty_support)
  let parentBadCatFailed = false;
  try {
    await createThread({
      eventId,
      category: 'duty_support',
      subject: 'Parent trying duty support',
      body: 'Should fail',
      creatorUserId: parent1Id,
      creatorRole: 'parent',
      parentProfileId: parent1ProfileId
    });
  } catch (err: any) {
    parentBadCatFailed = true;
    assert(err.code === 'MESSAGE_CATEGORY_INVALID', 'Parent blocked from using volunteer category');
  }
  assert(parentBadCatFailed, 'Parent volunteer category rejected');

  // ==========================================================================
  // TEST SECTION 3: VOLUNTEER ISOLATION
  // ==========================================================================
  console.log('\n--- SECTION 3: VOLUNTEER ISOLATION ---');

  // 3.1 Volunteer 1 can list own threads
  const v1List = await listThreads({ userId: vol1Id, role: 'volunteer' });
  assert(v1List.threads.length >= 1, 'Volunteer 1 can list own threads');
  assert(v1List.threads[0].id === vThread1.thread.id, 'Volunteer 1 list has correct thread');

  // 3.2 Volunteer 2 creates a thread
  const v2Thread = await createThread({
    eventId,
    category: 'training_support',
    subject: 'Volunteer 2 training question',
    body: 'Training material inquiry.',
    creatorUserId: vol2Id,
    creatorRole: 'volunteer'
  });

  // 3.3 Volunteer 1 CANNOT open Volunteer 2 thread
  let v1CrossOpenFailed = false;
  try {
    await getThread({ threadId: v2Thread.thread.id, userId: vol1Id, role: 'volunteer' });
  } catch (err: any) {
    v1CrossOpenFailed = true;
    assert(err.code === 'MESSAGE_THREAD_NOT_FOUND', 'Volunteer 1 blocked from Volunteer 2 thread');
  }
  assert(v1CrossOpenFailed, 'Cross-volunteer thread access prevented');

  // 3.4 Volunteer 1 CANNOT open Parent thread
  let v1ParentOpenFailed = false;
  try {
    await getThread({ threadId: pThread1.thread.id, userId: vol1Id, role: 'volunteer' });
  } catch (err: any) {
    v1ParentOpenFailed = true;
    assert(err.code === 'MESSAGE_THREAD_NOT_FOUND', 'Volunteer blocked from Parent thread');
  }
  assert(v1ParentOpenFailed, 'Volunteer blocked from Parent thread');

  // 3.5 Volunteer CANNOT link child data or use child_application category
  let volChildCatFailed = false;
  try {
    await createThread({
      eventId,
      category: 'child_application',
      subject: 'Volunteer asking child info',
      body: 'Should fail',
      creatorUserId: vol1Id,
      creatorRole: 'volunteer'
    });
  } catch (err: any) {
    volChildCatFailed = true;
    assert(err.code === 'MESSAGE_CATEGORY_INVALID', 'Volunteer cannot use child_application category');
  }
  assert(volChildCatFailed, 'Volunteer child category rejected');

  // ==========================================================================
  // TEST SECTION 4: ADMIN AUTHORIZATION & ACTIONS
  // ==========================================================================
  console.log('\n--- SECTION 4: ADMIN AUTHORIZATION & ACTIONS ---');

  // 4.1 Admin can list all direct threads
  const admList = await listThreads({ userId: adminId, role: 'admin' });
  const allIds = admList.threads.map(t => t.id);
  assert(allIds.includes(pThread1.thread.id), 'Admin sees Parent 1 thread');
  assert(allIds.includes(p2Thread.thread.id), 'Admin sees Parent 2 thread');
  assert(allIds.includes(vThread1.thread.id), 'Admin sees Volunteer 1 thread');
  assert(allIds.includes(v2Thread.thread.id), 'Admin sees Volunteer 2 thread');

  // 4.2 Super Admin can list all direct threads
  const sadmList = await listThreads({ userId: superAdminId, role: 'super_admin' });
  assert(sadmList.threads.length === admList.threads.length, 'Super Admin sees all direct threads');

  // 4.3 Admin can open Parent thread and Volunteer thread
  const admOpenParent = await getThread({ threadId: pThread1.thread.id, userId: adminId, role: 'admin' });
  assert(admOpenParent.thread.id === pThread1.thread.id, 'Admin opens Parent thread');
  const admOpenVol = await getThread({ threadId: vThread1.thread.id, userId: adminId, role: 'admin' });
  assert(admOpenVol.thread.id === vThread1.thread.id, 'Admin opens Volunteer thread');

  // 4.4 Admin replies to Parent thread
  const admReply = await appendMessage({
    threadId: pThread1.thread.id,
    senderUserId: adminId,
    senderRole: 'admin',
    body: 'Doors open at 8:30 AM for registration check-in.'
  });
  assert(admReply.message.sender_user_id === adminId, 'Admin message sender recorded');
  assert(admReply.message.sender_role === 'admin', 'Admin message role recorded');

  // Verify Admin participant row was created on reply
  const admPart = await queryOne('SELECT * FROM message_thread_participants WHERE thread_id = ? AND user_id = ?', [pThread1.thread.id, adminId]);
  assert(!!admPart, 'Admin registered as participant upon sending reply');
  assert(admPart.role === 'admin', 'Participant role is admin');

  // Verify Audit Log for ADMIN_MESSAGE_SENT
  const auditRow = await queryOne('SELECT * FROM audit_logs WHERE action = ? AND target_id = ? ORDER BY timestamp DESC LIMIT 1', ['ADMIN_MESSAGE_SENT', pThread1.thread.id]);
  assert(!!auditRow, 'ADMIN_MESSAGE_SENT audit log recorded');
  assert(auditRow.user_id === adminId, 'Audit log user_id is admin');
  assert(!auditRow.details.includes('Doors open at 8:30 AM'), 'CRITICAL: Message body EXCLUDED from audit details');

  // 4.5 Admin resolves thread
  const resolved = await resolveThread({
    threadId: pThread1.thread.id,
    adminUserId: adminId,
    adminRole: 'admin'
  });
  assert(resolved.thread.status === 'resolved', 'Thread status changed to resolved');

  // Verify Audit Log for THREAD_RESOLVED
  const resolveAudit = await queryOne('SELECT * FROM audit_logs WHERE action = ? AND target_id = ?', ['THREAD_RESOLVED', pThread1.thread.id]);
  assert(!!resolveAudit, 'THREAD_RESOLVED audit log recorded');

  // 4.6 Parent CANNOT send to resolved thread
  let sendToResolvedBlocked = false;
  try {
    await appendMessage({
      threadId: pThread1.thread.id,
      senderUserId: parent1Id,
      senderRole: 'parent',
      body: 'Can I ask one more thing?'
    });
  } catch (err: any) {
    sendToResolvedBlocked = true;
    assert(err.code === 'MESSAGE_THREAD_RESOLVED', 'Send to resolved thread blocked with MESSAGE_THREAD_RESOLVED');
    assert(err.statusCode === 409, 'Conflict status code 409 returned');
  }
  assert(sendToResolvedBlocked, 'Ordinary user cannot send into resolved thread');

  // 4.7 Admin reopens thread
  const reopened = await reopenThread({
    threadId: pThread1.thread.id,
    adminUserId: adminId,
    adminRole: 'admin'
  });
  assert(reopened.thread.status === 'open', 'Thread status successfully reopened');

  // Verify Audit Log for THREAD_REOPENED
  const reopenAudit = await queryOne('SELECT * FROM audit_logs WHERE action = ? AND target_id = ?', ['THREAD_REOPENED', pThread1.thread.id]);
  assert(!!reopenAudit, 'THREAD_REOPENED audit log recorded');

  // Parent can now send again
  const pFollowup = await appendMessage({
    threadId: pThread1.thread.id,
    senderUserId: parent1Id,
    senderRole: 'parent',
    body: 'Thank you for reopening, will parking be available?'
  });
  assert(pFollowup.message.body === 'Thank you for reopening, will parking be available?', 'Parent successfully sends after reopen');

  // 4.8 Non-admin (Parent/Volunteer) CANNOT resolve or reopen thread
  let parentResolveFailed = false;
  try {
    await resolveThread({ threadId: pThread1.thread.id, adminUserId: parent1Id, adminRole: 'parent' });
  } catch (err: any) {
    parentResolveFailed = true;
    assert(err.code === 'MESSAGE_THREAD_FORBIDDEN', 'Parent cannot resolve thread');
  }
  assert(parentResolveFailed, 'Non-admin resolve blocked');

  // ==========================================================================
  // TEST SECTION 5: MESSAGES VALIDATION & SANITIZATION
  // ==========================================================================
  console.log('\n--- SECTION 5: MESSAGES VALIDATION & SANITIZATION ---');

  // 5.1 Empty body rejected
  let emptyBodyFailed = false;
  try {
    await appendMessage({ threadId: pThread1.thread.id, senderUserId: parent1Id, senderRole: 'parent', body: '   ' });
  } catch (err: any) {
    emptyBodyFailed = true;
    assert(err.code === 'MESSAGE_BODY_REQUIRED', 'Empty body rejected');
  }
  assert(emptyBodyFailed, 'Empty message body blocked');

  // 5.2 Body > 5000 chars rejected
  let longBodyFailed = false;
  try {
    const hugeBody = 'A'.repeat(5001);
    await appendMessage({ threadId: pThread1.thread.id, senderUserId: parent1Id, senderRole: 'parent', body: hugeBody });
  } catch (err: any) {
    longBodyFailed = true;
    assert(err.code === 'MESSAGE_BODY_TOO_LONG', 'Long body rejected');
  }
  assert(longBodyFailed, 'Long message body blocked');

  // 5.3 Subject > 120 chars rejected
  let longSubjFailed = false;
  try {
    await createThread({
      eventId,
      category: 'general_support',
      subject: 'X'.repeat(121),
      body: 'Valid message',
      creatorUserId: parent1Id,
      creatorRole: 'parent',
      parentProfileId: parent1ProfileId
    });
  } catch (err: any) {
    longSubjFailed = true;
    assert(err.code === 'MESSAGE_SUBJECT_TOO_LONG', 'Long subject rejected');
  }
  assert(longSubjFailed, 'Long subject blocked');

  // 5.4 Plain text stored (HTML tags stripped)
  const xssTest = await appendMessage({
    threadId: pThread1.thread.id,
    senderUserId: parent1Id,
    senderRole: 'parent',
    body: '<b>Bold</b> and <script>alert("xss")</script>plain text'
  });
  assert(xssTest.message.body === 'Bold and alert("xss")plain text', 'HTML tags stripped cleanly from message body');

  // 5.5 Last message preview updated cleanly
  const updatedThread = await queryOne('SELECT * FROM message_threads WHERE id = ?', [pThread1.thread.id]);
  assert(updatedThread.last_message_preview === 'Bold and alert("xss")plain text', 'Thread preview normalized and updated');
  assert(!!updatedThread.last_message_at, 'Thread last_message_at updated');

  // ==========================================================================
  // TEST SECTION 6: READ STATE & UNREAD COUNTS
  // ==========================================================================
  console.log('\n--- SECTION 6: READ STATE & UNREAD COUNTS ---');

  // Test setup: Admin sends a new message to vThread1
  await appendMessage({
    threadId: vThread1.thread.id,
    senderUserId: adminId,
    senderRole: 'admin',
    body: 'Shift swap approved for Sunday.'
  });

  // Volunteer 1 has not read the admin reply yet
  const v1UnreadBefore = await getUnreadCount({ userId: vol1Id, role: 'volunteer' });
  assert(v1UnreadBefore.unreadMessageCount >= 1, 'Volunteer 1 has unread messages from admin');
  assert(v1UnreadBefore.unreadThreadCount >= 1, 'Volunteer 1 has unread thread count');

  // Volunteer 1 marks thread as read
  const v1ReadRes = await markThreadRead({ threadId: vThread1.thread.id, userId: vol1Id, role: 'volunteer' });
  assert(v1ReadRes.markedRead === true, 'markThreadRead returned success');

  // Verify only Volunteer 1's participant row was updated
  const v1PartAfter = await queryOne('SELECT * FROM message_thread_participants WHERE thread_id = ? AND user_id = ?', [vThread1.thread.id, vol1Id]);
  assert(!!v1PartAfter.last_read_at, 'Volunteer 1 last_read_at was updated');

  // Volunteer 1 unread count drops
  const v1UnreadAfter = await getUnreadCount({ userId: vol1Id, role: 'volunteer' });
  assert(v1UnreadAfter.unreadMessageCount === 0, 'Volunteer 1 unread message count dropped to 0');
  assert(v1UnreadAfter.unreadThreadCount === 0, 'Volunteer 1 unread thread count dropped to 0');

  // ==========================================================================
  // TEST SECTION 7: PAGINATION & ORDERING
  // ==========================================================================
  console.log('\n--- SECTION 7: PAGINATION & ORDERING ---');

  // Admin lists threads with limit = 2
  const pagedList = await listThreads({ userId: adminId, role: 'admin', page: 1, limit: 2 });
  assert(pagedList.threads.length === 2, 'Page size limit = 2 enforced');
  assert(pagedList.pagination.totalCount >= 4, 'Total count reflects all threads');
  assert(pagedList.pagination.totalPages >= 2, 'Total pages calculated accurately');
  assert(pagedList.pagination.hasMore === true, 'hasMore is true for page 1');

  // Ordering check: the most recently active thread should be first
  const t0 = new Date(pagedList.threads[0].last_message_at).getTime();
  const t1 = new Date(pagedList.threads[1].last_message_at).getTime();
  assert(t0 >= t1, 'Threads ordered by last_message_at DESC');

  // Messages in thread chronological order
  const msgList = await getThreadMessages({ threadId: pThread1.thread.id, userId: parent1Id, role: 'parent', page: 1, limit: 50 });
  for (let i = 1; i < msgList.messages.length; i++) {
    const prev = new Date(msgList.messages[i - 1].created_at).getTime();
    const curr = new Date(msgList.messages[i].created_at).getTime();
    assert(curr >= prev, `Message ${i} is in chronological order`);
  }

  // ==========================================================================
  // TEST SECTION 8: EXPRESS ROUTE INTEGRATION & ROLE ISOLATION
  // ==========================================================================
  console.log('\n--- SECTION 8: EXPRESS ROUTE INTEGRATION & ROLE GUARDS ---');

  const app = express();
  app.use(express.json());

  // Mount routers
  app.use('/api/parent/messages', parentMessagesRouter);
  app.use('/api/volunteer/messages', volunteerMessagesRouter);
  app.use('/api/admin/messages', adminMessagesRouter);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Helper for authenticated requests
  const { generateToken } = await import('../src/server/auth');
  const parent1Token = generateToken(parent1Id);
  const volunteer1Token = generateToken(vol1Id);
  const adminToken = generateToken(adminId);
  const teamToken = generateToken(teamId);

  // 8.1 Unauthenticated request returns 401
  const resNoAuth = await fetch(`${baseUrl}/api/parent/messages`);
  assert(resNoAuth.status === 401, 'Unauthenticated request receives 401');

  // 8.2 Volunteer calling Parent endpoint returns 403
  const resVolToParent = await fetch(`${baseUrl}/api/parent/messages`, {
    headers: { Authorization: `Bearer ${volunteer1Token}` }
  });
  assert(resVolToParent.status === 403, 'Volunteer calling parent endpoint receives 403');

  // 8.3 Parent calling Volunteer endpoint returns 403
  const resParentToVol = await fetch(`${baseUrl}/api/volunteer/messages`, {
    headers: { Authorization: `Bearer ${parent1Token}` }
  });
  assert(resParentToVol.status === 403, 'Parent calling volunteer endpoint receives 403');

  // 8.4 Team role calling Admin endpoint returns 403
  const resTeamToAdmin = await fetch(`${baseUrl}/api/admin/messages/unread-count`, {
    headers: { Authorization: `Bearer ${teamToken}` }
  });
  assert(resTeamToAdmin.status === 403, 'Team role calling admin messaging endpoint is rejected with 403');

  // 8.5 Parent lists own threads via HTTP
  const resParentList = await fetch(`${baseUrl}/api/parent/messages`, {
    headers: { Authorization: `Bearer ${parent1Token}` }
  });
  assert(resParentList.status === 200, 'Parent lists threads successfully (200)');
  const parentJson = await resParentList.json();
  assert(parentJson.success === true, 'Parent list response has success: true');
  assert(Array.isArray(parentJson.threads), 'Parent response contains threads array');
  assert(resParentList.headers.get('cache-control')?.includes('no-store') === true, 'Cache-control header contains no-store');

  // 8.6 Parent unread-count endpoint
  const resParentUnread = await fetch(`${baseUrl}/api/parent/messages/unread-count`, {
    headers: { Authorization: `Bearer ${parent1Token}` }
  });
  assert(resParentUnread.status === 200, 'Parent unread-count returns 200');
  const parentUnreadJson = await resParentUnread.json();
  assert(parentUnreadJson.success === true, 'Parent unread has success: true');
  assert(typeof parentUnreadJson.unreadThreadCount === 'number', 'unreadThreadCount is a number');

  // 8.7 Admin reads thread via HTTP
  const resAdminGet = await fetch(`${baseUrl}/api/admin/messages/${pThread1.thread.id}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(resAdminGet.status === 200, 'Admin reads thread via HTTP (200)');

  // 8.8 Admin resolves thread via HTTP POST /:threadId/resolve
  const resAdminResolve = await fetch(`${baseUrl}/api/admin/messages/${pThread1.thread.id}/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(resAdminResolve.status === 200, 'Admin resolves thread via HTTP POST (200)');
  const resolveJson = await resAdminResolve.json();
  assert(resolveJson.thread.status === 'resolved', 'HTTP resolve returned resolved status');

  // 8.9 Parent attempt to reply to resolved thread via HTTP POST returns 409
  const resParentPostResolved = await fetch(`${baseUrl}/api/parent/messages/${pThread1.thread.id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${parent1Token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body: 'Will this work?' })
  });
  assert(resParentPostResolved.status === 409, 'Parent replying to resolved thread receives 409');
  const conflictJson = await resParentPostResolved.json();
  assert(conflictJson.code === 'MESSAGE_THREAD_RESOLVED', 'Error code is MESSAGE_THREAD_RESOLVED');

  // 8.10 Admin reopens thread via HTTP PATCH /:threadId/reopen
  const resAdminReopen = await fetch(`${baseUrl}/api/admin/messages/${pThread1.thread.id}/reopen`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(resAdminReopen.status === 200, 'Admin reopens thread via HTTP PATCH (200)');

  server.close();

  console.log('\n====================================================');
  console.log('🎉 ALL MESSAGING CORE TESTS PASSED WITH 100% SUCCESS!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST RUNNER FAILED WITH ERROR:', err);
  process.exit(1);
});
