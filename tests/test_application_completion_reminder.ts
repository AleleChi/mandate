import crypto from 'crypto';
import express from 'express';
import { execute, query, queryOne } from '../src/server/db';
import { generateToken, hashPassword } from '../src/server/auth';
import {
  isAuthoritativeIncomplete,
  resolveAuthoritativeEntryContext,
  previewCompletionReminder,
  sendCompletionReminder,
  REMINDER_SUBJECT,
  REMINDER_COOLDOWN_MS
} from '../src/server/services/applicationReminderService';
import { appendMessage } from '../src/server/services/messageService';
import { applicationRemindersRouter } from '../src/server/routes/applicationReminders';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`[PASS] ${msg}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('APPLICATION COMPLETION REMINDERS — PHASE C TEST SUITE');
  console.log('====================================================\n');

  const now = new Date().toISOString();
  const testRunId = Date.now().toString().slice(-6);
  const eventId = `ev-rem-${testRunId}`;

  // 1. Setup Test Event with parent_access_closes_at
  console.log('[Setup] Inserting test event...');
  await execute(`
    INSERT OR REPLACE INTO events (
      id, title, starts_at, ends_at, parent_access_closes_at, status, created_at, updated_at
    ) VALUES (?, 'Annual Camp 2026', '2026-10-20T10:00:00Z', '2026-10-25T18:00:00Z', '2026-10-17T23:59:59Z', 'current', ?, ?)
  `, [eventId, now, now]);

  // Clean test tables
  await execute(`DELETE FROM messages WHERE thread_id LIKE 'thrd-rem-%' OR sender_user_id LIKE 'usr-rem-%'`);
  await execute(`DELETE FROM message_thread_participants WHERE thread_id LIKE 'thrd-rem-%' OR user_id LIKE 'usr-rem-%'`);
  await execute(`DELETE FROM message_threads WHERE id LIKE 'thrd-rem-%' OR event_id = ?`, [eventId]);
  await execute(`DELETE FROM audit_logs WHERE target_id LIKE 'ent-rem-%' OR user_id LIKE 'usr-rem-%'`);

  // 2. Setup Test Users
  console.log('[Setup] Creating test users...');
  const parent1UserId = `usr-rem-p1-${testRunId}`;
  const parent1ProfileId = `prof-rem-p1-${testRunId}`;
  const parent2UserId = `usr-rem-p2-${testRunId}`;
  const parent2ProfileId = `prof-rem-p2-${testRunId}`;

  const adminUserId = `usr-rem-adm-${testRunId}`;
  const superAdminUserId = `usr-rem-sadm-${testRunId}`;
  const teamUserId = `usr-rem-team-${testRunId}`;
  const volUserId = `usr-rem-vol-${testRunId}`;

  const defaultHash = hashPassword('TestSecret123!');

  await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, 'parent', ?, ?)`, [parent1UserId, `p1_${testRunId}@rem.org`, defaultHash, now, now]);
  await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, 'parent', ?, ?)`, [parent2UserId, `p2_${testRunId}@rem.org`, defaultHash, now, now]);
  await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, 'admin', ?, ?)`, [adminUserId, `adm_${testRunId}@rem.org`, defaultHash, now, now]);
  await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, 'super_admin', ?, ?)`, [superAdminUserId, `sadm_${testRunId}@rem.org`, defaultHash, now, now]);
  await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, 'team', ?, ?)`, [teamUserId, `team_${testRunId}@rem.org`, defaultHash, now, now]);
  await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, 'volunteer', ?, ?)`, [volUserId, `vol_${testRunId}@rem.org`, defaultHash, now, now]);

  await execute(`
    INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
    VALUES (?, ?, 'Adewale Johnson', ?, '+2348011111111', ?, ?)
  `, [parent1ProfileId, parent1UserId, `p1_${testRunId}@rem.org`, now, now]);

  await execute(`
    INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
    VALUES (?, ?, 'Ngozi Okeke', ?, '+2348022222222', ?, ?)
  `, [parent2ProfileId, parent2UserId, `p2_${testRunId}@rem.org`, now, now]);

  // 3. Setup Test Children & Entries
  console.log('[Setup] Creating test children and application entries...');
  const child1Id = `ch-rem-1-${testRunId}`;
  const entry1Id = `ent-rem-1-${testRunId}`; // Authoritative incomplete draft
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, created_at, updated_at)
    VALUES (?, ?, 'Tobi Johnson', 'Male', '2017-04-12', 9, 'Ages 7 to 9', 'Father', ?, ?)
  `, [child1Id, parent1ProfileId, now, now]);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, details_confirmed, information_confirmed, submitted_at, created_at, updated_at)
    VALUES (?, ?, ?, 'incomplete', 0, 0, NULL, ?, ?)
  `, [entry1Id, child1Id, eventId, now, now]);

  // Media for valid complete entries
  const mfId = `media-rem-${testRunId}`;
  await execute(`INSERT INTO media_files (id, provider, file_type, public_id, secure_url, file_url, storage_key, resource_type, mime_type, file_size, created_at) VALUES (?, 'cloudinary', 'image', 'photo', 'https://res.cloudinary.com/demo/image/upload/v1/valid.jpg', 'https://res.cloudinary.com/demo/image/upload/v1/valid.jpg', ?, 'image', 'image/jpeg', 1000, ?)`,
    [mfId, `key-${testRunId}`, now]);
  await execute(`UPDATE parent_profiles SET photo_file_id = ? WHERE id = ?`, [mfId, parent1ProfileId]);

  // Entry 2: Complete Under Review
  const child2Id = `ch-rem-2-${testRunId}`;
  const entry2Id = `ent-rem-2-${testRunId}`;
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, photo_file_id, created_at, updated_at)
    VALUES (?, ?, 'Kelechi Johnson', 'Male', '2017-05-12', 9, 'Ages 7 to 9', 'Father', ?, ?, ?)
  `, [child2Id, parent1ProfileId, mfId, now, now]);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, details_confirmed, information_confirmed, school_class, submitted_at, created_at, updated_at)
    VALUES (?, ?, ?, 'under_review', 1, 1, 'Year 5', ?, ?, ?)
  `, [entry2Id, child2Id, eventId, now, now, now]);
  await execute(`
    INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, photo_file_id, approved_by_parent, created_at, updated_at)
    VALUES (?, ?, 'other', 'Uncle Chidi', 'Uncle', '+2348011111111', ?, 1, ?, ?)
  `, [`pk-rem-2-${testRunId}`, entry2Id, mfId, now, now]);

  // Entry 3: Approved / Selected
  const child3Id = `ch-rem-3-${testRunId}`;
  const entry3Id = `ent-rem-3-${testRunId}`;
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, created_at, updated_at)
    VALUES (?, ?, 'Amaka Johnson', 'Female', '2018-01-12', 8, 'Ages 7 to 9', 'Father', ?, ?)
  `, [child3Id, parent1ProfileId, now, now]);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, details_confirmed, information_confirmed, submitted_at, created_at, updated_at)
    VALUES (?, ?, ?, 'selected', 1, 1, ?, ?, ?)
  `, [entry3Id, child3Id, eventId, now, now, now]);

  // Entry 4: Rejected
  const child4Id = `ch-rem-4-${testRunId}`;
  const entry4Id = `ent-rem-4-${testRunId}`;
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, created_at, updated_at)
    VALUES (?, ?, 'Femi Johnson', 'Male', '2018-03-12', 8, 'Ages 7 to 9', 'Father', ?, ?)
  `, [child4Id, parent1ProfileId, now, now]);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, details_confirmed, information_confirmed, submitted_at, created_at, updated_at)
    VALUES (?, ?, ?, 'rejected', 1, 1, ?, ?, ?)
  `, [entry4Id, child4Id, eventId, now, now, now]);

  // Entry 5: status is 'incomplete' BUT submitted_at is set (invalid submission state)
  const child5Id = `ch-rem-5-${testRunId}`;
  const entry5Id = `ent-rem-5-${testRunId}`;
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, created_at, updated_at)
    VALUES (?, ?, 'Boma Johnson', 'Male', '2018-04-12', 8, 'Ages 7 to 9', 'Father', ?, ?)
  `, [child5Id, parent1ProfileId, now, now]);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, details_confirmed, information_confirmed, submitted_at, created_at, updated_at)
    VALUES (?, ?, ?, 'incomplete', 0, 0, ?, ?, ?)
  `, [entry5Id, child5Id, eventId, now, now, now]);

  // Entry 6: status is 'incomplete' BUT details_confirmed = 1
  const child6Id = `ch-rem-6-${testRunId}`;
  const entry6Id = `ent-rem-6-${testRunId}`;
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, created_at, updated_at)
    VALUES (?, ?, 'Zainab Johnson', 'Female', '2018-05-12', 8, 'Ages 7 to 9', 'Father', ?, ?)
  `, [child6Id, parent1ProfileId, now, now]);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, details_confirmed, information_confirmed, submitted_at, created_at, updated_at)
    VALUES (?, ?, ?, 'incomplete', 1, 1, NULL, ?, ?)
  `, [entry6Id, child6Id, eventId, now, now]);

  // Child 7 (Parent 2): Authoritative incomplete draft
  const child7Id = `ch-rem-7-${testRunId}`;
  const entry7Id = `ent-rem-7-${testRunId}`;
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, created_at, updated_at)
    VALUES (?, ?, 'Chidinma Okeke', 'Female', '2019-08-20', 7, 'Ages 7 to 9', 'Mother', ?, ?)
  `, [child7Id, parent2ProfileId, now, now]);
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, details_confirmed, information_confirmed, submitted_at, created_at, updated_at)
    VALUES (?, ?, ?, 'incomplete', 0, 0, NULL, ?, ?)
  `, [entry7Id, child7Id, eventId, now, now]);

  const initialChildrenCount = Number((await queryOne('SELECT COUNT(*) as c FROM children'))?.c || 0);
  const initialEntriesCount = Number((await queryOne('SELECT COUNT(*) as c FROM child_event_entries'))?.c || 0);
  const initialPassCount = Number((await queryOne('SELECT COUNT(*) as c FROM event_passes'))?.c || 0);

  // ==========================================================================
  // SECTION 1: AUTHORITATIVE INCOMPLETE PREDICATE & ELIGIBILITY
  // ==========================================================================
  console.log('\n--- SECTION 1: AUTHORITATIVE INCOMPLETE PREDICATE & ELIGIBILITY ---');

  const e1 = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entry1Id]);
  const e2 = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entry2Id]);
  const e3 = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entry3Id]);
  const e4 = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entry4Id]);
  const e5 = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entry5Id]);
  const e6 = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entry6Id]);

  assert(isAuthoritativeIncomplete(e1) === true, 'Incomplete draft entry is authoritative incomplete');
  assert(isAuthoritativeIncomplete(e2) === false, 'under_review entry is NOT incomplete');
  assert(isAuthoritativeIncomplete(e3) === false, 'selected entry is NOT incomplete');
  assert(isAuthoritativeIncomplete(e4) === false, 'rejected entry is NOT incomplete');
  assert(isAuthoritativeIncomplete(e5) === false, 'Entry with submitted_at set is NOT incomplete');
  assert(isAuthoritativeIncomplete(e6) === false, 'Entry with details_confirmed = 1 is NOT incomplete');
  assert(isAuthoritativeIncomplete({ ...e1, is_deleted: 1 }) === false, 'Soft-deleted entry is NOT incomplete');

  // Preview on non-incomplete entry reflects eligible: false, canSend: false
  const pNonIncomplete = await previewCompletionReminder(entry2Id, { id: adminUserId, role: 'admin' });
  console.log('pNonIncomplete result:', pNonIncomplete);
  assert(pNonIncomplete.eligible === false, 'Preview on under_review entry returns eligible: false');
  assert(pNonIncomplete.canSend === false, 'Preview on under_review entry returns canSend: false');
  assert(!!pNonIncomplete.reason, 'Reason provided for non-incomplete preview');

  // ==========================================================================
  // SECTION 2: CONTEXT RESOLUTION & SAFETY
  // ==========================================================================
  console.log('\n--- SECTION 2: CONTEXT RESOLUTION & SAFETY ---');

  const ctx = await resolveAuthoritativeEntryContext(entry1Id);
  assert(ctx.entry.id === entry1Id, 'Resolved correct entry ID');
  assert(ctx.child.id === child1Id, 'Resolved correct child ID');
  assert(ctx.childFirstName === 'Tobi', 'Resolved correct child first name');
  assert(ctx.parentUser.id === parent1UserId, 'Resolved correct Parent user ID');
  assert(ctx.parentFirstName === 'Adewale', 'Resolved correct Parent first name');
  assert(ctx.event.id === eventId, 'Resolved correct event ID');
  assert(ctx.formattedDeadline.includes('October 2026'), 'Formatted registration deadline contains October 2026');

  // Missing entry fails safely
  let missingEntryErrorCaught = false;
  try {
    await resolveAuthoritativeEntryContext('ent-non-existent');
  } catch (err: any) {
    missingEntryErrorCaught = true;
    assert(err.code === 'APPLICATION_REMINDER_NOT_FOUND', 'Missing entry throws APPLICATION_REMINDER_NOT_FOUND');
    assert(err.statusCode === 404, 'Status code is 404');
  }
  assert(missingEntryErrorCaught, 'Missing entry caught safely');

  // ==========================================================================
  // SECTION 3: PREVIEW ENDPOINT
  // ==========================================================================
  console.log('\n--- SECTION 3: PREVIEW ENDPOINT ---');

  const preview = await previewCompletionReminder(entry1Id, { id: adminUserId, role: 'admin' });
  assert(preview.eligible === true, 'Incomplete entry preview is eligible');
  assert(preview.canSend === true, 'Incomplete entry preview canSend is true initially');
  assert(preview.subject === REMINDER_SUBJECT, `Subject is exactly "${REMINDER_SUBJECT}"`);
  assert(preview.child.firstName === 'Tobi', 'Child first name matches');
  assert(preview.parent.firstName === 'Adewale', 'Parent first name matches');
  assert(preview.body.includes('Hello Adewale,'), 'Prefilled body greets parent by first name');
  assert(preview.body.includes("Tobi's registration has not yet been completed"), 'Prefilled body references child by first name');
  assert(preview.body.includes('before registration closes on 17 October 2026'), 'Prefilled body includes authoritative registration deadline');
  assert(!preview.body.includes(child1Id), 'Internal child ID NOT exposed in body copy');
  assert(!preview.body.includes(entry1Id), 'Internal entry ID NOT exposed in body copy');
  assert(!preview.body.includes(parent1UserId), 'Internal parent user ID NOT exposed in body copy');
  assert(preview.lastReminderSentAt === null, 'lastReminderSentAt is null initially');
  assert(preview.cooldownEndsAt === null, 'cooldownEndsAt is null initially');

  // ==========================================================================
  // SECTION 4: SENDING REMINDER & MESSAGE SEMANTICS
  // ==========================================================================
  console.log('\n--- SECTION 4: SENDING REMINDER & MESSAGE SEMANTICS ---');

  const sendResult = await sendCompletionReminder({
    entryId: entry1Id,
    adminUserId,
    adminRole: 'admin'
  });

  assert(sendResult.success === true, 'sendCompletionReminder returned success: true');
  assert(!!sendResult.messageId, 'messageId returned');
  assert(!!sendResult.threadId, 'threadId returned');

  // Verify message in database
  const savedMsg = await queryOne('SELECT * FROM messages WHERE id = ?', [sendResult.messageId]);
  assert(savedMsg.message_type === 'application_completion_reminder', 'message_type is exactly application_completion_reminder');
  assert(savedMsg.action_type === 'resume_application', 'action_type is exactly resume_application');
  assert(savedMsg.sender_user_id === adminUserId, 'sender_user_id is authenticated admin');
  assert(savedMsg.sender_role === 'admin', 'sender_role is admin');

  // Verify action payload
  const actionPayload = JSON.parse(savedMsg.action_payload_json);
  assert(actionPayload.entryId === entry1Id, 'Action payload points to EXISTING entry ID');
  assert(actionPayload.childId === child1Id, 'Action payload points to EXISTING child ID');
  assert(Object.keys(actionPayload).length === 2, 'Action payload contains strictly entryId and childId');

  // Verify thread record
  const savedThread = await queryOne('SELECT * FROM message_threads WHERE id = ?', [sendResult.threadId]);
  assert(savedThread.category === 'child_application', 'Thread category is child_application');
  assert(savedThread.linked_entry_id === entry1Id, 'Thread linked_entry_id matches');
  assert(savedThread.linked_child_id === child1Id, 'Thread linked_child_id matches');
  assert(savedThread.event_id === eventId, 'Thread event_id matches');
  assert(savedThread.status === 'open', 'Thread status is open');

  // Verify participants
  const participants = await query('SELECT * FROM message_thread_participants WHERE thread_id = ?', [sendResult.threadId]);
  const userIds = participants.map((p: any) => p.user_id);
  assert(userIds.includes(parent1UserId), 'Parent is thread participant');
  assert(userIds.includes(adminUserId), 'Admin is thread participant');

  // Super Admin sends reminder for entry 7 (Parent 2, Child 2)
  const sadmSendResult = await sendCompletionReminder({
    entryId: entry7Id,
    adminUserId: superAdminUserId,
    adminRole: 'super_admin'
  });
  assert(sadmSendResult.success === true, 'Super Admin sends reminder successfully');

  // ==========================================================================
  // SECTION 5: COOLDOWN ENFORCEMENT & IDEMPOTENCY
  // ==========================================================================
  console.log('\n--- SECTION 5: COOLDOWN ENFORCEMENT & IDEMPOTENCY ---');

  // Immediate second send on entry 1 MUST fail with 409 APPLICATION_REMINDER_COOLDOWN
  let cooldownCaught = false;
  try {
    await sendCompletionReminder({
      entryId: entry1Id,
      adminUserId,
      adminRole: 'admin'
    });
  } catch (err: any) {
    cooldownCaught = true;
    assert(err.code === 'APPLICATION_REMINDER_COOLDOWN', 'Accidental repeat send rejected with APPLICATION_REMINDER_COOLDOWN');
    assert(err.statusCode === 409, 'Conflict status code 409 returned');
    assert(!!err.metadata?.lastReminderSentAt, 'lastReminderSentAt returned in metadata');
    assert(!!err.metadata?.cooldownEndsAt, 'cooldownEndsAt returned in metadata');
  }
  assert(cooldownCaught, 'Cooldown prevented duplicate reminder');

  // Verify count of reminder messages for entry 1 is strictly 1
  const reminderMsgCount = await queryOne(`
    SELECT COUNT(*) as cnt
    FROM messages m
    JOIN message_threads t ON t.id = m.thread_id
    WHERE t.linked_entry_id = ?
      AND m.message_type = 'application_completion_reminder'
  `, [entry1Id]);
  assert(Number(reminderMsgCount.cnt) === 1, 'Exactly ONE reminder message exists for entry 1');

  // Preview reflects cooldown
  const previewInCooldown = await previewCompletionReminder(entry1Id, { id: adminUserId, role: 'admin' });
  assert(previewInCooldown.canSend === false, 'canSend is false while in cooldown');
  assert(!!previewInCooldown.lastReminderSentAt, 'lastReminderSentAt is present in preview');
  assert(!!previewInCooldown.cooldownEndsAt, 'cooldownEndsAt is present in preview');

  // Ordinary manual admin reply to thread is NOT blocked by reminder cooldown
  const manualReply = await appendMessage({
    threadId: sendResult.threadId,
    senderUserId: adminUserId,
    senderRole: 'admin',
    body: 'Please let us know if you need assistance filling out medical details.'
  });
  assert(!!manualReply.message, 'Manual admin message permitted regardless of reminder cooldown');

  // ==========================================================================
  // SECTION 6: THREAD REUSE & RESOLVED REOPEN
  // ==========================================================================
  console.log('\n--- SECTION 6: THREAD REUSE & RESOLVED REOPEN ---');

  // Simulate resolving thread, expiring cooldown artificially, and re-sending
  await execute("UPDATE message_threads SET status = 'resolved' WHERE id = ?", [sendResult.threadId]);
  const resolvedCheck = await queryOne('SELECT status FROM message_threads WHERE id = ?', [sendResult.threadId]);
  assert(resolvedCheck.status === 'resolved', 'Thread artificially marked resolved for test');

  // Artificially age the reminder message beyond 60 minutes
  const pastTime = new Date(Date.now() - (REMINDER_COOLDOWN_MS + 5000)).toISOString();
  await execute(`
    UPDATE messages
    SET created_at = ?
    WHERE id = ?
  `, [pastTime, sendResult.messageId]);

  // Send new reminder: should reopen existing resolved thread and NOT create a new thread
  const reopenSend = await sendCompletionReminder({
    entryId: entry1Id,
    adminUserId,
    adminRole: 'admin',
    customBody: 'Follow-up: registration deadline is approaching fast.'
  });
  assert(reopenSend.threadId === sendResult.threadId, 'Reopened existing thread rather than creating duplicate');
  const reopenedThread = await queryOne('SELECT status FROM message_threads WHERE id = ?', [sendResult.threadId]);
  assert(reopenedThread.status === 'open', 'Thread status automatically reopened to open');

  // Verify THREAD_REOPENED audit log
  const reopenAudit = await queryOne(`
    SELECT * FROM audit_logs
    WHERE action = 'THREAD_REOPENED' AND target_id = ?
    ORDER BY timestamp DESC LIMIT 1
  `, [sendResult.threadId]);
  assert(!!reopenAudit, 'THREAD_REOPENED audit log recorded upon completion reminder reopen');

  // ==========================================================================
  // SECTION 7: STALE COMPOSER GUARD (APPLICATION NO LONGER INCOMPLETE)
  // ==========================================================================
  console.log('\n--- SECTION 7: STALE COMPOSER GUARD ---');

  // Create new draft entry 8
  const child8Id = `ch-rem-8-${testRunId}`;
  const entry8Id = `ent-rem-8-${testRunId}`;
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, created_at, updated_at)
    VALUES (?, ?, 'Dayo Johnson', 'Male', '2016-02-10', 10, 'Ages 10 to 12', 'Father', ?, ?)
  `, [child8Id, parent1ProfileId, now, now]);

  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, details_confirmed, information_confirmed, submitted_at, created_at, updated_at)
    VALUES (?, ?, ?, 'incomplete', 0, 0, NULL, ?, ?)
  `, [entry8Id, child8Id, eventId, now, now]);

  // Preview shows eligible: true
  const p8 = await previewCompletionReminder(entry8Id, { id: adminUserId, role: 'admin' });
  assert(p8.eligible === true, 'Entry 8 eligible initially');

  // Parent submits application while Admin had composer open
  await execute(`
    UPDATE child_event_entries
    SET status = 'under_review', submitted_at = ?, details_confirmed = 1, information_confirmed = 1
    WHERE id = ?
  `, [now, entry8Id]);

  // Admin attempts to send -> rejected with 409 APPLICATION_NOT_INCOMPLETE
  let staleSendCaught = false;
  try {
    await sendCompletionReminder({
      entryId: entry8Id,
      adminUserId,
      adminRole: 'admin'
    });
  } catch (err: any) {
    staleSendCaught = true;
    assert(err.code === 'APPLICATION_NOT_INCOMPLETE', 'Stale reminder send rejected with APPLICATION_NOT_INCOMPLETE');
    assert(err.statusCode === 409, 'Status code is 409');
  }
  assert(staleSendCaught, 'Stale composer race prevented');

  // Confirm zero reminder messages created for entry 8
  const entry8Msg = await queryOne(`
    SELECT COUNT(*) as cnt FROM messages m
    JOIN message_threads t ON t.id = m.thread_id
    WHERE t.linked_entry_id = ?
  `, [entry8Id]);
  assert(Number(entry8Msg?.cnt || 0) === 0, 'Zero messages created for stale application');

  // ==========================================================================
  // SECTION 8: BODY VALIDATION & SANITIZATION
  // ==========================================================================
  console.log('\n--- SECTION 8: BODY VALIDATION & SANITIZATION ---');

  // Age the cooldown on entry 1 again to test validation
  await execute(`
    UPDATE messages SET created_at = ? WHERE thread_id = ?
  `, [pastTime, sendResult.threadId]);

  // Empty custom body rejected
  let emptyBodyCaught = false;
  try {
    await sendCompletionReminder({
      entryId: entry1Id,
      adminUserId,
      adminRole: 'admin',
      customBody: '   '
    });
  } catch (err: any) {
    emptyBodyCaught = true;
    assert(err.code === 'MESSAGE_BODY_REQUIRED', 'Empty custom body rejected with MESSAGE_BODY_REQUIRED');
  }
  assert(emptyBodyCaught, 'Empty custom body blocked');

  // Huge custom body > 5000 chars rejected
  let longBodyCaught = false;
  try {
    await sendCompletionReminder({
      entryId: entry1Id,
      adminUserId,
      adminRole: 'admin',
      customBody: 'A'.repeat(5001)
    });
  } catch (err: any) {
    longBodyCaught = true;
    assert(err.code === 'MESSAGE_BODY_TOO_LONG', 'Long custom body rejected with MESSAGE_BODY_TOO_LONG');
  }
  assert(longBodyCaught, 'Long custom body blocked');

  // Custom body with HTML tags: HTML is stripped to plain text
  const xssSend = await sendCompletionReminder({
    entryId: entry1Id,
    adminUserId,
    adminRole: 'admin',
    customBody: '<b>Urgent Reminder:</b> <script>alert("xss")</script>Please complete registration today.'
  });
  const xssMsg = await queryOne('SELECT body FROM messages WHERE id = ?', [xssSend.messageId]);
  assert(xssMsg.body === 'Urgent Reminder: alert("xss")Please complete registration today.', 'HTML stripped from custom reminder body');

  // ==========================================================================
  // SECTION 9: RESUME ACTION INTEGRITY & ZERO APPLICATION MUTATION
  // ==========================================================================
  console.log('\n--- SECTION 9: RESUME ACTION INTEGRITY & ZERO APPLICATION MUTATION ---');

  const finalChildrenCount = Number((await queryOne('SELECT COUNT(*) as c FROM children'))?.c || 0);
  const finalEntriesCount = Number((await queryOne('SELECT COUNT(*) as c FROM child_event_entries'))?.c || 0);
  const finalPassCount = Number((await queryOne('SELECT COUNT(*) as c FROM event_passes'))?.c || 0);

  // Note: Only entry 8 child was inserted during testing above (initial + 1)
  assert(finalChildrenCount === initialChildrenCount + 1, 'No unintended children created');
  assert(finalEntriesCount === initialEntriesCount + 1, 'No unintended application entries created');
  assert(finalPassCount === initialPassCount, 'Zero passes created (pass issuance untouched)');

  // Verify entry 1 draft status was untouched
  const finalEntry1 = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entry1Id]);
  assert(finalEntry1.status === 'incomplete', 'Application status remained incomplete');
  assert(finalEntry1.submitted_at === null, 'submitted_at remained null');
  assert(finalEntry1.details_confirmed === 0, 'details_confirmed remained 0');

  // ==========================================================================
  // SECTION 10: AUDIT LOGGING INTEGRITY
  // ==========================================================================
  console.log('\n--- SECTION 10: AUDIT LOGGING INTEGRITY ---');

  const auditLog = await queryOne(`
    SELECT * FROM audit_logs
    WHERE action = 'APPLICATION_COMPLETION_REMINDER_SENT' AND target_id = ?
    ORDER BY timestamp DESC LIMIT 1
  `, [entry1Id]);

  assert(!!auditLog, 'APPLICATION_COMPLETION_REMINDER_SENT audit log exists');
  assert(auditLog.user_id === adminUserId, 'Audit user_id is admin');
  assert(auditLog.user_role === 'admin', 'Audit user_role is admin');
  assert(auditLog.target_type === 'child_event_entry', 'Audit target_type is child_event_entry');

  const auditDetails = JSON.parse(auditLog.details);
  assert(auditDetails.admin_id === adminUserId, 'Audit details contains admin_id');
  assert(auditDetails.parent_id === parent1UserId, 'Audit details contains parent_id');
  assert(auditDetails.child_id === child1Id, 'Audit details contains child_id');
  assert(auditDetails.entry_id === entry1Id, 'Audit details contains entry_id');
  assert(auditDetails.event_id === eventId, 'Audit details contains event_id');
  assert(auditDetails.thread_id === sendResult.threadId, 'Audit details contains thread_id');
  assert(auditDetails.message_id !== undefined, 'Audit details contains message_id');
  assert(!auditLog.details.includes('Urgent Reminder'), 'CRITICAL: Message body EXCLUDED from audit details');

  // ==========================================================================
  // SECTION 11: HTTP ROUTE INTEGRATION & ROLE AUTHORIZATION
  // ==========================================================================
  console.log('\n--- SECTION 11: HTTP ROUTE INTEGRATION & ROLE GUARDS ---');

  const app = express();
  app.use(express.json());
  app.use('/api/admin/applications', applicationRemindersRouter);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const adminToken = generateToken(adminUserId);
  const teamToken = generateToken(teamUserId);
  const parentToken = generateToken(parent1UserId);
  const volToken = generateToken(volUserId);

  // 11.1 Unauthenticated request returns 401
  const resNoAuth = await fetch(`${baseUrl}/api/admin/applications/${entry1Id}/completion-reminder`);
  assert(resNoAuth.status === 401, 'Unauthenticated request receives 401');

  // 11.2 Team role receives 403
  const resTeam = await fetch(`${baseUrl}/api/admin/applications/${entry1Id}/completion-reminder`, {
    headers: { Authorization: `Bearer ${teamToken}` }
  });
  assert(resTeam.status === 403, 'Team role rejected with 403');

  // 11.3 Parent role receives 403
  const resParent = await fetch(`${baseUrl}/api/admin/applications/${entry1Id}/completion-reminder`, {
    headers: { Authorization: `Bearer ${parentToken}` }
  });
  assert(resParent.status === 403, 'Parent role rejected with 403');

  // 11.4 Volunteer role receives 403
  const resVol = await fetch(`${baseUrl}/api/admin/applications/${entry1Id}/completion-reminder`, {
    headers: { Authorization: `Bearer ${volToken}` }
  });
  assert(resVol.status === 403, 'Volunteer role rejected with 403');

  // 11.5 Admin gets preview successfully via HTTP
  const resAdminPreview = await fetch(`${baseUrl}/api/admin/applications/${entry1Id}/completion-reminder`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(resAdminPreview.status === 200, 'Admin preview returns 200');
  const previewJson = await resAdminPreview.json();
  assert(previewJson.success === true, 'Preview response has success: true');
  assert(previewJson.subject === REMINDER_SUBJECT, 'Preview subject matches');
  assert(resAdminPreview.headers.get('cache-control')?.includes('no-store') === true, 'Cache-control header contains no-store');

  // 11.6 Admin POST send via HTTP returns 409 due to cooldown
  const resAdminSend = await fetch(`${baseUrl}/api/admin/applications/${entry1Id}/completion-reminder`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body: 'Admin edited text' })
  });
  assert(resAdminSend.status === 409, 'Send while in cooldown returns 409 via HTTP');
  const sendErrJson = await resAdminSend.json();
  assert(sendErrJson.code === 'APPLICATION_REMINDER_COOLDOWN', 'HTTP response code is APPLICATION_REMINDER_COOLDOWN');

  server.close();
  await execute(`DELETE FROM events WHERE id LIKE 'ev-rem-%'`);

  console.log('\n====================================================');
  console.log('🎉 ALL APPLICATION COMPLETION REMINDER TESTS PASSED!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST RUNNER FAILED WITH ERROR:', err);
  process.exit(1);
});
