import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execute, query, queryOne } from '../src/server/db';
import {
  getCurrentEvent,
  getCurrentEventId,
  setCurrentEvent
} from '../src/server/services/eventService';
import {
  processQueuedWhatsAppJobs,
  SimulatedWhatsAppProvider,
  resetWhatsAppProviderCache,
  SendSessionMessageParams
} from '../src/server/services/whatsapp';

class RecordingWhatsAppProvider extends SimulatedWhatsAppProvider {
  public sentMessages: SendSessionMessageParams[] = [];

  override async sendSessionMessage(params: SendSessionMessageParams) {
    this.sentMessages.push(params);
    return super.sendSessionMessage(params);
  }

  clear() {
    this.sentMessages = [];
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('PHASE 3D2C2: WHATSAPP WORKER EVENT ISOLATION SUITE');
  console.log('====================================================\n');

  const initialCurrentEvent = await getCurrentEvent();
  console.log('Initial Current Event:', initialCurrentEvent?.id, `(${initialCurrentEvent?.title})`);
  assert(initialCurrentEvent !== null, 'Initial current event must exist');
  const initialCurrentEventId = initialCurrentEvent.id;

  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdParentIds: string[] = [];
  const createdVolunteerProfileIds: string[] = [];
  const createdChildIds: string[] = [];
  const createdEntryIds: string[] = [];
  const createdRuleIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdAssignmentIds: string[] = [];
  const createdJobIds: string[] = [];

  const suffix = Date.now().toString();
  const eventAId = `test-phase3d2c2-event-a-${suffix}`;
  const eventBId = `test-phase3d2c2-event-b-${suffix}`;

  const recordingProvider = new RecordingWhatsAppProvider();
  resetWhatsAppProviderCache(recordingProvider);

  try {
    // 0. Temporarily allow NULL event_id on notification_jobs for SQLite testing
    await execute('PRAGMA foreign_keys = OFF');
    await execute(`
      CREATE TABLE IF NOT EXISTS notification_jobs_phase3d2c2 (
        id TEXT PRIMARY KEY,
        event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
        rule_id TEXT REFERENCES event_notification_rules(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES parent_profiles(id) ON DELETE CASCADE,
        child_id TEXT REFERENCES children(id) ON DELETE SET NULL,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        channel TEXT NOT NULL,
        scheduled_for TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        idempotency_key TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        processing_started_at TEXT,
        last_error TEXT,
        sent_at TEXT,
        failure_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(rule_id, parent_id, child_id, scheduled_for)
      )
    `);
    await execute('INSERT INTO notification_jobs_phase3d2c2 SELECT * FROM notification_jobs');
    await execute('DROP TABLE notification_jobs');
    await execute('ALTER TABLE notification_jobs_phase3d2c2 RENAME TO notification_jobs');
    await execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_jobs_idempotency_key ON notification_jobs(idempotency_key) WHERE idempotency_key IS NOT NULL');
    await execute('PRAGMA foreign_keys = ON');

    // 1. Create Event A and Event B
    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'Test Event Alpha', 'upcoming', datetime('now'), datetime('now'))
    `, [eventAId]);
    createdEventIds.push(eventAId);

    await execute(`
      INSERT INTO events (id, title, status, created_at, updated_at)
      VALUES (?, 'Test Event Beta', 'upcoming', datetime('now'), datetime('now'))
    `, [eventBId]);
    createdEventIds.push(eventBId);

    // 2. Create Parent Profile & Child
    const parentUserId = `user_p_${suffix}`;
    const parentProfileId = `profile_p_${suffix}`;
    const parentPhone = '+2348011223344';

    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', datetime('now'), datetime('now'))
    `, [parentUserId, `parent_${suffix}@example.com`]);
    createdUserIds.push(parentUserId);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, email, whatsapp_consent_status, created_at, updated_at)
      VALUES (?, ?, 'Parent Test Alpha', ?, ?, ?, 'opted_in', datetime('now'), datetime('now'))
    `, [parentProfileId, parentUserId, parentPhone, parentPhone, `parent_${suffix}@example.com`]);
    createdParentIds.push(parentProfileId);

    const childId = `child_${suffix}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, created_at, updated_at)
      VALUES (?, ?, 'Child Tested', '2017-01-01', 'female', datetime('now'), datetime('now'))
    `, [childId, parentProfileId]);
    createdChildIds.push(childId);

    // Child entry in Event A vs Child entry in Event B
    const entryAId = `entry_a_${suffix}`;
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, 'checked_in', 0, datetime('now'), datetime('now'))
    `, [entryAId, childId, eventAId]);
    createdEntryIds.push(entryAId);

    const entryBId = `entry_b_${suffix}`;
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, 'waiting_list', 0, datetime('now'), datetime('now'))
    `, [entryBId, childId, eventBId]);
    createdEntryIds.push(entryBId);

    // 3. Create Volunteer User & Profile with duty locations in Event A and Event B
    const volunteerUserId = `user_v_${suffix}`;
    const volunteerProfileId = `profile_v_${suffix}`;
    const volunteerPhone = '+2348055667788';

    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'volunteer', datetime('now'), datetime('now'))
    `, [volunteerUserId, `volunteer_${suffix}@example.com`]);
    createdUserIds.push(volunteerUserId);

    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, whatsapp_consent_status, created_at, updated_at)
      VALUES (?, ?, 'Volunteer Alpha', ?, ?, 'Team Alpha', 'active', 'opted_in', datetime('now'), datetime('now'))
    `, [volunteerProfileId, volunteerUserId, volunteerPhone, volunteerPhone]);
    createdVolunteerProfileIds.push(volunteerProfileId);

    // Location & Assignment for Event A
    const locAId = `loc_a_${suffix}`;
    await execute(`
      INSERT INTO event_locations (id, event_id, name, location_type, team_key, is_active, created_at, updated_at)
      VALUES (?, ?, 'Zone Alpha Main Hall', 'room', 'Team Alpha', 1, datetime('now'), datetime('now'))
    `, [locAId, eventAId]);
    createdLocationIds.push(locAId);

    const assignAId = `assign_a_${suffix}`;
    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, team_key, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Team Alpha', 'usher', 'on_duty', datetime('now'), datetime('now', '+1 hour'), datetime('now'), datetime('now'))
    `, [assignAId, eventAId, volunteerUserId, locAId]);
    createdAssignmentIds.push(assignAId);

    // Location & Assignment for Event B
    const locBId = `loc_b_${suffix}`;
    await execute(`
      INSERT INTO event_locations (id, event_id, name, location_type, team_key, is_active, created_at, updated_at)
      VALUES (?, ?, 'Zone Beta Overflow Tent', 'tent', 'Team Beta', 1, datetime('now'), datetime('now'))
    `, [locBId, eventBId]);
    createdLocationIds.push(locBId);

    const assignBId = `assign_b_${suffix}`;
    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, team_key, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Team Beta', 'coordinator', 'on_duty', datetime('now'), datetime('now', '+1 hour'), datetime('now'), datetime('now'))
    `, [assignBId, eventBId, volunteerUserId, locBId]);
    createdAssignmentIds.push(assignBId);

    // Notification rule for volunteer placeholder verification
    const ruleId = `rule_v_${suffix}`;
    await execute(`
      INSERT INTO event_notification_rules (id, event_id, name, trigger_type, channel, audience, title, message_template, is_active, created_at, updated_at)
      VALUES (?, ?, 'Duty Rule', 'manual_broadcast', 'whatsapp', 'volunteers', 'Duty Assignment', 'Report to {location} on {team}.', 1, datetime('now'), datetime('now'))
    `, [ruleId, eventAId]);
    createdRuleIds.push(ruleId);

    // =========================================================================
    // TEST 1 — CHILD
    // Same child has different child_event_entries in A and B.
    // Queue job: event_id=A. Switch TEST current to B before processing.
    // Verify: A child entry is used, B event-specific data is not used.
    // =========================================================================
    console.log('--- TEST 1: CHILD EVENT ISOLATION ---');
    const job1Id = `job_child_${suffix}`;
    await execute(`
      INSERT INTO notification_jobs (
        id, event_id, parent_id, child_id, channel, scheduled_for, status, idempotency_key, attempt_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'whatsapp', datetime('now'), 'pending', ?, 0, datetime('now'), datetime('now'))
    `, [job1Id, eventAId, parentProfileId, childId, `idemp_child_${suffix}`]);
    createdJobIds.push(job1Id);

    // Switch TEST current to Event B before worker runs
    await setCurrentEvent(eventBId);
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event must be Event B');

    recordingProvider.clear();
    const result1 = await processQueuedWhatsAppJobs();
    assert(result1.processed >= 1, 'Worker must process job 1');

    const job1Row = await queryOne('SELECT status FROM notification_jobs WHERE id = ?', [job1Id]);
    assert.strictEqual(job1Row?.status, 'sent', 'Job 1 must be completed');

    const deliveryLog1 = await queryOne(
      'SELECT child_event_entry_id FROM whatsapp_delivery_logs WHERE job_id = ?',
      [job1Id]
    );
    assert(deliveryLog1, 'Delivery log must exist for job 1');
    assert.strictEqual(
      deliveryLog1.child_event_entry_id,
      entryAId,
      `Child entry must be Event A entry (${entryAId}), got ${deliveryLog1.child_event_entry_id}`
    );
    assert.notStrictEqual(
      deliveryLog1.child_event_entry_id,
      entryBId,
      'Must NOT use Event B child entry'
    );
    console.log('  ✓ Stored Event A child job resolved Event A entry while Event B was current');

    // =========================================================================
    // TEST 2 — VOLUNTEER
    // Volunteer has different duty/location context in A and B.
    // Queue job: event_id=A. Switch current to B.
    // Verify: A duty/location is used, B duty/location does not leak.
    // =========================================================================
    console.log('\n--- TEST 2: VOLUNTEER DUTY ISOLATION ---');
    const job2Id = `job_vol_${suffix}`;
    await execute(`
      INSERT INTO notification_jobs (
        id, event_id, user_id, rule_id, channel, scheduled_for, status, idempotency_key, attempt_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'whatsapp', datetime('now'), 'pending', ?, 0, datetime('now'), datetime('now'))
    `, [job2Id, eventAId, volunteerUserId, ruleId, `idemp_vol_${suffix}`]);
    createdJobIds.push(job2Id);

    // Current event is still Event B
    assert.strictEqual(await getCurrentEventId(), eventBId, 'Current event is Event B');

    recordingProvider.clear();
    const result2 = await processQueuedWhatsAppJobs();
    assert(result2.processed >= 1, 'Worker must process job 2');

    const job2Row = await queryOne('SELECT status FROM notification_jobs WHERE id = ?', [job2Id]);
    assert.strictEqual(job2Row?.status, 'sent', 'Job 2 must be completed');

    assert(recordingProvider.sentMessages.length >= 1, 'Provider must have dispatched volunteer message');
    const sentVolMsg = recordingProvider.sentMessages[0].body;
    console.log('  Dispatched message:', sentVolMsg);
    assert(
      sentVolMsg.includes('Zone Alpha Main Hall'),
      `Message must contain Event A location (Zone Alpha Main Hall). Got: "${sentVolMsg}"`
    );
    assert(
      sentVolMsg.includes('Team Alpha'),
      `Message must contain Event A team (Team Alpha). Got: "${sentVolMsg}"`
    );
    assert(
      !sentVolMsg.includes('Zone Beta Overflow Tent'),
      'Message must NOT leak Event B location'
    );
    assert(
      !sentVolMsg.includes('Team Beta'),
      'Message must NOT leak Event B team'
    );
    console.log('  ✓ Stored Event A volunteer job used Event A duty/location; zero Event B leakage');

    // =========================================================================
    // TEST 3 — EVENTLESS
    // Queue job: event_id=NULL
    // Verify: no 2026 substituted, no child lookup with 2026, no duty lookup with 2026, global processing safe.
    // =========================================================================
    console.log('\n--- TEST 3: EVENTLESS JOB PROCESSING ---');
    const job3Id = `job_eventless_${suffix}`;
    await execute(`
      INSERT INTO notification_jobs (
        id, event_id, parent_id, child_id, channel, scheduled_for, status, idempotency_key, attempt_count, created_at, updated_at
      ) VALUES (?, NULL, ?, ?, 'whatsapp', datetime('now'), 'pending', ?, 0, datetime('now'), datetime('now'))
    `, [job3Id, parentProfileId, childId, `idemp_eventless_${suffix}`]);
    createdJobIds.push(job3Id);

    recordingProvider.clear();
    const result3 = await processQueuedWhatsAppJobs();
    assert(result3.processed >= 1, 'Worker must process eventless job');

    const job3Row = await queryOne('SELECT status, event_id FROM notification_jobs WHERE id = ?', [job3Id]);
    assert.strictEqual(job3Row?.status, 'sent', 'Job 3 must be completed');
    assert.strictEqual(job3Row?.event_id, null, 'Job 3 event_id must remain NULL, not replaced with 2026');

    const deliveryLog3 = await queryOne(
      'SELECT child_event_entry_id FROM whatsapp_delivery_logs WHERE job_id = ?',
      [job3Id]
    );
    assert(deliveryLog3, 'Delivery log must exist for job 3');
    assert.strictEqual(
      deliveryLog3.child_event_entry_id,
      null,
      'Eventless job must have NULL child_event_entry_id without substituting 2026'
    );

    // Eventless volunteer job: duty lookup safely skipped, no 2026 substitution
    const job3VolId = `job_eventless_vol_${suffix}`;
    await execute(`
      INSERT INTO notification_jobs (
        id, event_id, user_id, rule_id, channel, scheduled_for, status, idempotency_key, attempt_count, created_at, updated_at
      ) VALUES (?, NULL, ?, ?, 'whatsapp', datetime('now'), 'pending', ?, 0, datetime('now'), datetime('now'))
    `, [job3VolId, volunteerUserId, ruleId, `idemp_eventless_vol_${suffix}`]);
    createdJobIds.push(job3VolId);

    recordingProvider.clear();
    const result3Vol = await processQueuedWhatsAppJobs();
    assert(result3Vol.processed >= 1, 'Worker must process eventless volunteer job');

    const job3VolRow = await queryOne('SELECT status, event_id FROM notification_jobs WHERE id = ?', [job3VolId]);
    assert.strictEqual(job3VolRow?.status, 'sent', 'Eventless volunteer job must complete');
    assert.strictEqual(job3VolRow?.event_id, null, 'Eventless volunteer job must remain NULL event_id');

    assert(recordingProvider.sentMessages.length >= 1, 'Provider must have dispatched eventless volunteer message');
    const sentEventlessVolMsg = recordingProvider.sentMessages[0].body;
    assert(
      !sentEventlessVolMsg.includes('event-ga-2026'),
      'Must not substitute event-ga-2026'
    );
    console.log('  ✓ Eventless jobs processed safely; no 2026 substitution, enrichment skipped cleanly');

    // =========================================================================
    // TEST 4 — NO CURRENT
    // Remove TEST current event.
    // Verify: stored Event A job still uses A; eventless job still invents no event.
    // =========================================================================
    console.log('\n--- TEST 4: NO CURRENT EVENT SCENARIO ---');
    await execute("UPDATE events SET status = 'upcoming' WHERE status = 'current'");
    assert.strictEqual(await getCurrentEventId(), null, 'There must be NO current event in system');

    // Stored Event A job while NO current event exists
    const job4AId = `job_no_curr_a_${suffix}`;
    await execute(`
      INSERT INTO notification_jobs (
        id, event_id, parent_id, child_id, channel, scheduled_for, status, idempotency_key, attempt_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'whatsapp', datetime('now'), 'pending', ?, 0, datetime('now'), datetime('now'))
    `, [job4AId, eventAId, parentProfileId, childId, `idemp_no_curr_a_${suffix}`]);
    createdJobIds.push(job4AId);

    // Eventless job while NO current event exists
    const job4NullId = `job_no_curr_null_${suffix}`;
    await execute(`
      INSERT INTO notification_jobs (
        id, event_id, parent_id, child_id, channel, scheduled_for, status, idempotency_key, attempt_count, created_at, updated_at
      ) VALUES (?, NULL, ?, ?, 'whatsapp', datetime('now'), 'pending', ?, 0, datetime('now'), datetime('now'))
    `, [job4NullId, parentProfileId, childId, `idemp_no_curr_null_${suffix}`]);
    createdJobIds.push(job4NullId);

    recordingProvider.clear();
    const result4 = await processQueuedWhatsAppJobs();
    assert(result4.processed >= 2, 'Worker must process both jobs with no current event');

    const deliveryLog4A = await queryOne(
      'SELECT child_event_entry_id FROM whatsapp_delivery_logs WHERE job_id = ?',
      [job4AId]
    );
    assert.strictEqual(
      deliveryLog4A?.child_event_entry_id,
      entryAId,
      'Stored Event A job must still use Event A child entry with no current event'
    );

    const deliveryLog4Null = await queryOne(
      'SELECT child_event_entry_id FROM whatsapp_delivery_logs WHERE job_id = ?',
      [job4NullId]
    );
    assert.strictEqual(
      deliveryLog4Null?.child_event_entry_id,
      null,
      'Eventless job must have null child entry with no current event'
    );
    console.log('  ✓ No current event: stored Event A job uses Event A; eventless job invents no event');

    // =========================================================================
    // TEST 5 — STATIC AUDIT
    // worker.ts contains no runtime event-ga-2026 or REAL_EVENT_ID
    // =========================================================================
    console.log('\n--- TEST 5: STATIC AUDIT OF worker.ts ---');
    const workerPath = path.resolve(process.cwd(), 'src/server/services/whatsapp/worker.ts');
    const workerCode = fs.readFileSync(workerPath, 'utf8');

    assert(
      !workerCode.includes('event-ga-2026'),
      'worker.ts must not contain "event-ga-2026"'
    );
    assert(
      !workerCode.includes('REAL_EVENT_ID'),
      'worker.ts must not contain "REAL_EVENT_ID"'
    );
    console.log('  ✓ worker.ts static audit passed: 0 occurrences of event-ga-2026 and REAL_EVENT_ID');

    console.log('\n====================================================');
    console.log('ALL 5 PHASE 3D2C2 TESTS PASSED SUCCESSFULLY');
    console.log('====================================================');
  } finally {
    // Teardown: Clean up created fixtures
    if (createdJobIds.length > 0) {
      const placeholders = createdJobIds.map(() => '?').join(',');
      await execute(`DELETE FROM whatsapp_delivery_logs WHERE job_id IN (${placeholders})`, createdJobIds);
      await execute(`DELETE FROM notification_jobs WHERE id IN (${placeholders})`, createdJobIds);
    }
    if (createdRuleIds.length > 0) {
      const placeholders = createdRuleIds.map(() => '?').join(',');
      await execute(`DELETE FROM event_notification_rules WHERE id IN (${placeholders})`, createdRuleIds);
    }
    if (createdAssignmentIds.length > 0) {
      const placeholders = createdAssignmentIds.map(() => '?').join(',');
      await execute(`DELETE FROM event_duty_assignments WHERE id IN (${placeholders})`, createdAssignmentIds);
    }
    if (createdLocationIds.length > 0) {
      const placeholders = createdLocationIds.map(() => '?').join(',');
      await execute(`DELETE FROM event_locations WHERE id IN (${placeholders})`, createdLocationIds);
    }
    if (createdEntryIds.length > 0) {
      const placeholders = createdEntryIds.map(() => '?').join(',');
      await execute(`DELETE FROM child_event_entries WHERE id IN (${placeholders})`, createdEntryIds);
    }
    if (createdChildIds.length > 0) {
      const placeholders = createdChildIds.map(() => '?').join(',');
      await execute(`DELETE FROM children WHERE id IN (${placeholders})`, createdChildIds);
    }
    if (createdVolunteerProfileIds.length > 0) {
      const placeholders = createdVolunteerProfileIds.map(() => '?').join(',');
      await execute(`DELETE FROM volunteer_profiles WHERE id IN (${placeholders})`, createdVolunteerProfileIds);
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

    // Restore notification_jobs table schema (with NOT NULL constraint)
    try {
      await execute('PRAGMA foreign_keys = OFF');
      await execute(`
        CREATE TABLE IF NOT EXISTS notification_jobs_restore (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          rule_id TEXT REFERENCES event_notification_rules(id) ON DELETE CASCADE,
          parent_id TEXT REFERENCES parent_profiles(id) ON DELETE CASCADE,
          child_id TEXT REFERENCES children(id) ON DELETE SET NULL,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          channel TEXT NOT NULL,
          scheduled_for TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          idempotency_key TEXT,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          next_attempt_at TEXT,
          processing_started_at TEXT,
          last_error TEXT,
          sent_at TEXT,
          failure_reason TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(rule_id, parent_id, child_id, scheduled_for)
        )
      `);
      await execute('INSERT INTO notification_jobs_restore SELECT * FROM notification_jobs');
      await execute('DROP TABLE notification_jobs');
      await execute('ALTER TABLE notification_jobs_restore RENAME TO notification_jobs');
      await execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_jobs_idempotency_key ON notification_jobs(idempotency_key) WHERE idempotency_key IS NOT NULL');
      await execute('PRAGMA foreign_keys = ON');
    } catch (restoreErr) {
      console.error('Failed to restore notification_jobs table schema:', restoreErr);
    }

    // Restore original current event
    await setCurrentEvent(initialCurrentEventId);
    const restoredCurrent = await getCurrentEvent();
    console.log('\nRestored current event to:', restoredCurrent?.id, `(${restoredCurrent?.title})`);

    // Reset WhatsApp provider cache
    resetWhatsAppProviderCache(null);
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ PHASE 3D2C2 VERIFICATION FAILED:', err);
    process.exit(1);
  });
