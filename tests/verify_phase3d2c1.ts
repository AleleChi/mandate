import assert from 'assert';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import { execute, query, queryOne } from '../src/server/db';
import authRouter, { enqueueRegistrationAck } from '../src/server/routes/auth';
import {
  getChildSummaryStats,
  getChildSummaryForRecord,
  getChildEntrySummary,
  resolveChildSummaryEventId
} from '../src/server/services/childSummaryService';
import {
  getCurrentEvent,
  getCurrentEventId,
  setCurrentEvent,
  getEventById
} from '../src/server/services/eventService';
import { setCustomMxResolver } from '../src/server/utils/validation';

async function runTests() {
  console.log('====================================================');
  console.log('PHASE 3D2C1: AUTH WHATSAPP ACK + CHILD SUMMARY SAFETY');
  console.log('====================================================\n');

  // Verify initial database state
  const initialCurrentEvent = await getCurrentEvent();
  console.log('Initial Current Event:', initialCurrentEvent?.id, `(${initialCurrentEvent?.title})`);
  assert(initialCurrentEvent !== null, 'Initial current event must exist');
  const initialCurrentEventId = initialCurrentEvent.id;

  // Track created fixtures for thorough cleanup
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdParentIds: string[] = [];
  const createdChildIds: string[] = [];
  const createdEntryIds: string[] = [];
  const createdJobIds: string[] = [];

  // Setup deterministic MX resolver mock to bypass live DNS queries in test
  setCustomMxResolver(async (domain: string) => {
    return [{ exchange: `mail.${domain}`, priority: 10 }];
  });

  // Setup test Express server for auth router
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function callRegister(body: any): Promise<{ status: number; body: any }> {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return { status: res.status, body: data };
  }

  const suffix = Date.now().toString();
  const eventAId = `test-phase3d2c1-event-a-${suffix}`;
  const eventBId = `test-phase3d2c1-event-b-${suffix}`;

  try {
    // 1. Create Event A and Event B
    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'Test Event A', 'upcoming', datetime('now'), datetime('now'))
    `, [eventAId]);
    createdEventIds.push(eventAId);

    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'Test Event B', 'upcoming', datetime('now'), datetime('now'))
    `, [eventBId]);
    createdEventIds.push(eventBId);

    // =========================================================================
    // PART 1: AUTH WHATSAPP ACK TESTS
    // =========================================================================
    console.log('--- TEST GROUP 1: AUTH WHATSAPP ACK ---');

    // 1.1 Event A Current: registration without explicit event uses A, ack uses A
    console.log('1.1: Event A Current -> registration without explicit event uses A');
    await setCurrentEvent(eventAId);
    assert.strictEqual(await getCurrentEventId(), eventAId, 'Event A must be current');

    const emailA = `parent_ack_a_${suffix}@testdomain.org`;
    const phoneA = '+2348011111111';
    const regResA = await callRegister({
      email: emailA,
      password: 'Password123!',
      fullName: 'Parent Test Alpha',
      phone: phoneA,
      whatsapp: phoneA,
      whatsappConsent: true
    });
    assert.strictEqual(regResA.status, 201, `Registration A should succeed: ${JSON.stringify(regResA.body)}`);
    createdUserIds.push(regResA.body.user.id);
    createdParentIds.push(regResA.body.profile.id);

    const jobA = await queryOne(
      'SELECT id, event_id, parent_id, channel, status FROM notification_jobs WHERE parent_id = ?',
      [regResA.body.profile.id]
    );
    assert(jobA, 'WhatsApp acknowledgement job must be queued for Parent A');
    createdJobIds.push(jobA.id);
    assert.strictEqual(jobA.event_id, eventAId, 'Acknowledgement job must reference Event A');
    assert.notStrictEqual(jobA.event_id, 'event-ga-2026', 'Must NOT fallback to event-ga-2026');
    console.log('  ✓ Registration and Ack correctly bound to Event A');

    // 1.2 Event B Current: registration without explicit event uses B, ack uses B
    console.log('1.2: Event B Current -> registration without explicit event uses B');
    await setCurrentEvent(eventBId);
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Event B must be current');

    const emailB = `parent_ack_b_${suffix}@testdomain.org`;
    const phoneB = '+2348022222222';
    const regResB = await callRegister({
      email: emailB,
      password: 'Password123!',
      fullName: 'Parent Test Beta',
      phone: phoneB,
      whatsapp: phoneB,
      whatsappConsent: true
    });
    assert.strictEqual(regResB.status, 201, `Registration B should succeed: ${JSON.stringify(regResB.body)}`);
    createdUserIds.push(regResB.body.user.id);
    createdParentIds.push(regResB.body.profile.id);

    const jobB = await queryOne(
      'SELECT id, event_id, parent_id, channel, status FROM notification_jobs WHERE parent_id = ?',
      [regResB.body.profile.id]
    );
    assert(jobB, 'WhatsApp acknowledgement job must be queued for Parent B');
    createdJobIds.push(jobB.id);
    assert.strictEqual(jobB.event_id, eventBId, 'Acknowledgement job must reference Event B');
    assert.notStrictEqual(jobB.event_id, 'event-ga-2026', 'Must NOT fallback to event-ga-2026');
    console.log('  ✓ Registration and Ack correctly bound to Event B');

    // 1.3 While B Current: explicit Event A registration uses A, ack still uses A, current remains B
    console.log('1.3: While B Current -> explicit Event A registration uses A and current remains B');
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Event B must be current before registration');

    const emailExplicit = `parent_explicit_${suffix}@testdomain.org`;
    const phoneExplicit = '+2348033333333';
    const regResExplicit = await callRegister({
      email: emailExplicit,
      password: 'Password123!',
      fullName: 'Parent Test Explicit',
      phone: phoneExplicit,
      whatsapp: phoneExplicit,
      whatsappConsent: true,
      eventId: eventAId
    });
    assert.strictEqual(regResExplicit.status, 201, `Explicit registration should succeed: ${JSON.stringify(regResExplicit.body)}`);
    createdUserIds.push(regResExplicit.body.user.id);
    createdParentIds.push(regResExplicit.body.profile.id);

    const jobExplicit = await queryOne(
      'SELECT id, event_id, parent_id, channel, status FROM notification_jobs WHERE parent_id = ?',
      [regResExplicit.body.profile.id]
    );
    assert(jobExplicit, 'WhatsApp acknowledgement job must be queued for explicit registration');
    createdJobIds.push(jobExplicit.id);
    assert.strictEqual(jobExplicit.event_id, eventAId, 'Acknowledgement job must reference explicit Event A');
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must remain Event B');
    console.log('  ✓ Explicit registration Ack correctly bound to Event A; current remains B');

    // 1.4 Critical Consistency Test:
    // Resolve/create registration context in Event A, then switch test current to Event B before ack processing
    console.log('1.4: Critical consistency: Event A registration with concurrent switch to Event B preserves Event A');
    await setCurrentEvent(eventAId);
    assert.strictEqual(await getCurrentEventId(), eventAId, 'Event A is current during registration context resolution');

    const consistencyRegEventId = await getCurrentEventId();
    assert(consistencyRegEventId === eventAId, 'Resolved registration event context must be Event A');
    const consistencyParentId = `profile_consistency_${suffix}`;
    const consistencyUserId = `user_consistency_${suffix}`;

    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'fake_hash', 'parent', datetime('now'), datetime('now'))
    `, [consistencyUserId, `parent_consistency_${suffix}@testdomain.org`]);
    createdUserIds.push(consistencyUserId);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, email, created_at, updated_at)
      VALUES (?, ?, 'Parent Consistency', '+2348055555555', '+2348055555555', ?, datetime('now'), datetime('now'))
    `, [consistencyParentId, consistencyUserId, `parent_consistency_${suffix}@testdomain.org`]);
    createdParentIds.push(consistencyParentId);

    // Switch TEST current to Event B before acknowledgement processing
    await setCurrentEvent(eventBId);
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Switched current to Event B');

    // Process acknowledgement with the registration's resolved event context
    await enqueueRegistrationAck({
      eventId: consistencyRegEventId,
      parentId: consistencyParentId,
      userId: consistencyUserId
    });

    const jobConsistency = await queryOne(
      'SELECT id, event_id, parent_id FROM notification_jobs WHERE parent_id = ?',
      [consistencyParentId]
    );
    assert(jobConsistency, 'Consistency ack job must be enqueued');
    createdJobIds.push(jobConsistency.id);
    assert.strictEqual(
      jobConsistency.event_id,
      eventAId,
      'Ack must reference Event A from registration context, not Event B which became current'
    );
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event is still Event B');
    console.log('  ✓ Acknowledgement preserved Event A registration context despite current event switch');

    // 1.5 No Current Event: registration succeeds, ack skipped safely (no 2026 fallback)
    console.log('1.5: No Current Event -> registration succeeds, acknowledgement skipped safely');
    await execute("UPDATE events SET status = 'upcoming' WHERE status = 'current'");
    assert.strictEqual(await getCurrentEventId(), null, 'There must be NO current event');

    const emailNoCurrent = `parent_nocurrent_${suffix}@testdomain.org`;
    const phoneNoCurrent = '+2348044444444';
    const regResNoCurrent = await callRegister({
      email: emailNoCurrent,
      password: 'Password123!',
      fullName: 'Parent Test NoCurrent',
      phone: phoneNoCurrent,
      whatsapp: phoneNoCurrent,
      whatsappConsent: true
    });
    assert.strictEqual(regResNoCurrent.status, 201, 'Registration should succeed without current event');
    createdUserIds.push(regResNoCurrent.body.user.id);
    createdParentIds.push(regResNoCurrent.body.profile.id);

    const jobNoCurrent = await queryOne(
      'SELECT id, event_id FROM notification_jobs WHERE parent_id = ?',
      [regResNoCurrent.body.profile.id]
    );
    assert.strictEqual(jobNoCurrent, null, 'No WhatsApp acknowledgement job must be queued when no current event');
    console.log('  ✓ No current event handled safely: ack skipped, zero jobs created, no 2026 fallback');

    // =========================================================================
    // PART 2: CHILD SUMMARY SERVICE TESTS
    // =========================================================================
    console.log('\n--- TEST GROUP 2: CHILD SUMMARY SERVICE ---');

    // Seed one child with different operational states in Event A and Event B
    const testChildId = `child_test_phase3d2c1_${suffix}`;
    const testParentProfileId = createdParentIds[0];
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, needs_age_review, created_at, updated_at)
      VALUES (?, ?, 'Test Child One', '2018-05-10', 'female', 0, datetime('now'), datetime('now'))
    `, [testChildId, testParentProfileId]);
    createdChildIds.push(testChildId);

    // Event A entry: checked_in / inside, with medical notes
    const entryAId = `entry_a_${suffix}`;
    await execute(`
      INSERT INTO child_event_entries (
        id, child_id, event_id, status, has_medical_notes, needs_extra_support, is_deleted, created_at, updated_at
      ) VALUES (?, ?, ?, 'inside', 1, 0, 0, datetime('now'), datetime('now'))
    `, [entryAId, testChildId, eventAId]);
    createdEntryIds.push(entryAId);

    // Event B entry: waiting_list, no medical notes
    const entryBId = `entry_b_${suffix}`;
    await execute(`
      INSERT INTO child_event_entries (
        id, child_id, event_id, status, has_medical_notes, needs_extra_support, is_deleted, created_at, updated_at
      ) VALUES (?, ?, ?, 'waiting_list', 0, 0, 0, datetime('now'), datetime('now'))
    `, [entryBId, testChildId, eventBId]);
    createdEntryIds.push(entryBId);

    // 2.1 Event A Current: live summary uses Event A only
    console.log('2.1: Event A Current -> live summary uses A only');
    await setCurrentEvent(eventAId);
    assert.strictEqual(await getCurrentEventId(), eventAId);

    const summaryLiveA = await getChildSummaryStats();
    assert.strictEqual(summaryLiveA.totalChildren, 1, 'Event A must have exactly 1 child entry');
    assert.strictEqual(summaryLiveA.inside, 1, 'Event A inside count must be 1');
    assert.strictEqual(summaryLiveA.waitingList, 0, 'Event A must NOT see Event B waiting list');
    assert.strictEqual(summaryLiveA.needsAttention, 1, 'Event A has_medical_notes must count towards needsAttention');

    const recordLiveA = await getChildSummaryForRecord(testChildId);
    assert(recordLiveA !== null, 'Record summary for A must exist');
    assert.strictEqual(recordLiveA.eventId, eventAId);
    assert.strictEqual(recordLiveA.inside, true);
    assert.strictEqual(recordLiveA.hasMedicalNotes, true);
    console.log('  ✓ Live summary with Event A current correctly isolated to Event A');

    // 2.2 Event B Current: live summary uses Event B only
    console.log('2.2: Event B Current -> live summary uses B only');
    await setCurrentEvent(eventBId);
    assert.strictEqual(await getCurrentEventId(), eventBId);

    const summaryLiveB = await getChildSummaryStats();
    assert.strictEqual(summaryLiveB.totalChildren, 1, 'Event B must have exactly 1 child entry');
    assert.strictEqual(summaryLiveB.inside, 0, 'Event B must NOT leak Event A inside count');
    assert.strictEqual(summaryLiveB.waitingList, 1, 'Event B waiting list count must be 1');
    assert.strictEqual(summaryLiveB.needsAttention, 0, 'Event B has no medical notes');

    const recordLiveB = await getChildSummaryForRecord(testChildId);
    assert(recordLiveB !== null, 'Record summary for B must exist');
    assert.strictEqual(recordLiveB.eventId, eventBId);
    assert.strictEqual(recordLiveB.inside, false);
    assert.strictEqual(recordLiveB.status, 'waiting_list');
    assert.strictEqual(recordLiveB.hasMedicalNotes, false);
    console.log('  ✓ Live summary with Event B current correctly isolated to Event B');

    // 2.3 While B Current: explicit eventId=A gives Event A summary; current remains B
    console.log('2.3: While B Current -> explicit eventId=A gives A summary; current remains B');
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Event B is current');

    const summaryExplicitA = await getChildSummaryStats(eventAId);
    assert.strictEqual(summaryExplicitA.totalChildren, 1);
    assert.strictEqual(summaryExplicitA.inside, 1);
    assert.strictEqual(summaryExplicitA.waitingList, 0);

    const recordExplicitA = await getChildSummaryForRecord(testChildId, eventAId);
    assert(recordExplicitA !== null);
    assert.strictEqual(recordExplicitA.eventId, eventAId);
    assert.strictEqual(recordExplicitA.inside, true);
    assert.strictEqual(recordExplicitA.status, 'inside');

    assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must still be Event B');
    console.log('  ✓ Explicit eventId=A gives Event A summary while Event B remains current');

    // 2.4 Existing Event A record: stored event context remains A while B is current
    console.log('2.4: Existing Event A record -> stored event context preserved; no leakage into Event B');
    const storedEntryA = await queryOne(
      'SELECT id, child_id, event_id, status FROM child_event_entries WHERE id = ?',
      [entryAId]
    );
    assert(storedEntryA, 'Stored entry A must exist');
    assert.strictEqual(storedEntryA.event_id, eventAId, 'Stored event_id must remain Event A');

    // Generate summary tied to stored record object
    const summaryFromRecord = await getChildSummaryStats({ event_id: storedEntryA.event_id });
    assert.strictEqual(summaryFromRecord.inside, 1);
    assert.strictEqual(summaryFromRecord.waitingList, 0);

    const entrySummary = await getChildEntrySummary(storedEntryA);
    assert(entrySummary !== null);
    assert.strictEqual(entrySummary.eventId, eventAId);
    assert.strictEqual(entrySummary.inside, true);
    assert.strictEqual(entrySummary.hasMedicalNotes, true);

    // Verify Event B summary has zero leaked Event A operational data
    const currentBSummary = await getChildSummaryStats();
    assert.strictEqual(currentBSummary.inside, 0, 'Event B summary must have 0 inside');
    assert.strictEqual(currentBSummary.checkedIn, 0, 'Event B summary must have 0 checkedIn');
    assert.strictEqual(currentBSummary.pickedUp, 0, 'Event B summary must have 0 pickedUp');
    console.log('  ✓ Existing record event_id preserved; zero cross-event leakage');

    // 2.5 No Current Event: returns safe zeroed stats, no 2026/open/active/latest fallback
    console.log('2.5: No Current Event -> returns safe zeroed stats without fallback');
    await execute("UPDATE events SET status = 'upcoming' WHERE status = 'current'");
    assert.strictEqual(await getCurrentEventId(), null, 'There must be NO current event');

    const noCurrentStats = await getChildSummaryStats();
    assert.deepStrictEqual(noCurrentStats, {
      totalChildren: 0,
      selected: 0,
      checkedIn: 0,
      inside: 0,
      pickedUp: 0,
      removed: 0,
      needsAttention: 0,
      underReview: 0,
      waitingList: 0,
      notSelected: 0
    }, 'No-current stats must be all zeros');

    const noCurrentRecord = await getChildSummaryForRecord(testChildId);
    assert.strictEqual(noCurrentRecord, null, 'No-current record summary must be null');

    const invalidEventStats = await getChildSummaryStats('non-existent-event-id');
    assert.deepStrictEqual(invalidEventStats, {
      totalChildren: 0,
      selected: 0,
      checkedIn: 0,
      inside: 0,
      pickedUp: 0,
      removed: 0,
      needsAttention: 0,
      underReview: 0,
      waitingList: 0,
      notSelected: 0
    }, 'Invalid explicit event must return safe zeroed stats without falling back to current or 2026');

    console.log('  ✓ No-current and invalid-event return safe zeroed stats without any fallback');

    console.log('\n====================================================');
    console.log('ALL PHASE 3D2C1 ASSERTIONS PASSED');
    console.log('====================================================');
  } finally {
    // Teardown: close server
    server.close();

    // Reset custom MX resolver
    setCustomMxResolver(null);

    // Clean up created fixtures
    if (createdJobIds.length > 0) {
      const placeholders = createdJobIds.map(() => '?').join(',');
      await execute(`DELETE FROM notification_jobs WHERE id IN (${placeholders})`, createdJobIds);
    }
    if (createdEntryIds.length > 0) {
      const placeholders = createdEntryIds.map(() => '?').join(',');
      await execute(`DELETE FROM child_event_entries WHERE id IN (${placeholders})`, createdEntryIds);
    }
    if (createdChildIds.length > 0) {
      const placeholders = createdChildIds.map(() => '?').join(',');
      await execute(`DELETE FROM children WHERE id IN (${placeholders})`, createdChildIds);
    }
    if (createdParentIds.length > 0) {
      const placeholders = createdParentIds.map(() => '?').join(',');
      await execute(`DELETE FROM parent_profiles WHERE id IN (${placeholders})`, createdParentIds);
    }
    if (createdUserIds.length > 0) {
      const placeholders = createdUserIds.map(() => '?').join(',');
      await execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds);
    }
    if (createdEventIds.length > 0) {
      const placeholders = createdEventIds.map(() => '?').join(',');
      await execute(`DELETE FROM events WHERE id IN (${placeholders})`, createdEventIds);
    }

    // Restore original current event
    await setCurrentEvent(initialCurrentEventId);
    const restoredCurrent = await getCurrentEvent();
    console.log('\nRestored current event to:', restoredCurrent?.id, `(${restoredCurrent?.title})`);
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ PHASE 3D2C1 VERIFICATION FAILED:', err);
    process.exit(1);
  });
