import { execute, query, queryOne } from '../src/server/db';
import {
  resolveVolunteerCommunicationChannel,
  isWhatsAppProviderAvailable,
  isEmailProviderAvailable,
  isPushProviderAvailable,
  isSmsProviderAvailable
} from '../src/server/services/operations/actions/communicationResolver';
import { sendDutyRemindersAction } from '../src/server/services/operations/actions/dutyRemindersAction';
import { operationsActionRegistry } from '../src/server/services/operations/actions';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    throw new Error(msg);
  }
  console.log(`[PASS] ${msg}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('COMMUNICATION CHANNEL RESOLVER & MODAL TEST SUITE');
  console.log('====================================================\n');

  const now = new Date().toISOString();
  const eventId = 'test-event-comm-modal';
  const actor = { id: 'test-admin-comm', role: 'admin', email: 'admin@koinonia.org' };

  // Setup test event
  await execute(`
    INSERT OR REPLACE INTO events (id, title, starts_at, ends_at, status, created_at, updated_at)
    VALUES (?, 'Test Comm Event', '2026-09-18T10:00:00Z', '2026-09-18T18:00:00Z', 'active', ?, ?)
  `, [eventId, now, now]);

  await execute(`
    INSERT OR REPLACE INTO event_locations (id, event_id, name, location_type, volunteer_capacity, is_active, created_at, updated_at)
    VALUES ('loc-comm-test', ?, 'Main Chapel', 'room', 10, 1, ?, ?)
  `, [eventId, now, now]);

  // Clean test data
  await execute(`DELETE FROM notification_jobs WHERE event_id = ?`, [eventId]);
  await execute(`DELETE FROM event_duty_location_presence WHERE event_id = ?`, [eventId]);
  await execute(`DELETE FROM event_duty_assignments WHERE event_id = ?`, [eventId]);
  await execute(`DELETE FROM notification_preferences WHERE user_id LIKE 'test-comm-%'`);
  await execute(`DELETE FROM push_subscriptions WHERE user_id LIKE 'test-comm-%'`);
  await execute(`DELETE FROM parent_profiles WHERE user_id LIKE 'test-comm-%'`);
  await execute(`DELETE FROM volunteer_profiles WHERE user_id LIKE 'test-comm-%'`);
  await execute(`DELETE FROM users WHERE id LIKE 'test-comm-%'`);

  // Provider checks
  assert(isWhatsAppProviderAvailable() === true, 'WhatsApp provider is available');
  assert(isSmsProviderAvailable() === false, 'SMS provider is NOT available (correct existing architecture)');

  // Helper to create test user & volunteer
  async function createVolunteerUser(id: string, name: string, phone: string, consent: string, email?: string) {
    await execute(`INSERT INTO users (id, email, role, created_at, updated_at) VALUES (?, ?, 'volunteer', ?, ?)`, [id, email || `${id}@test.org`, now, now]);
    await execute(`
      INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, whatsapp_consent_status, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Ushering', ?, 0, ?, ?)
    `, [`vp-${id}`, id, name, phone, phone, consent, now, now]);
  }

  // --- CASE A: not reported, WhatsApp enabled and consented ---
  console.log('\n--- CASE A: WhatsApp enabled and consented ---');
  await createVolunteerUser('test-comm-case-a', 'Volunteer A', '+2348011111111', 'opted_in');
  const resA = await resolveVolunteerCommunicationChannel({
    userId: 'test-comm-case-a',
    displayName: 'Volunteer A',
    phone: '+2348011111111',
    whatsappConsentStatus: 'opted_in'
  });
  assert(resA.contactEligible === true, 'Case A: contact is eligible');
  assert(resA.selectedChannel === 'whatsapp', 'Case A: selectedChannel is whatsapp');
  assert(Boolean(resA.destination), 'Case A: destination phone exists');

  // --- CASE B: WhatsApp disabled, another existing supported channel enabled (e.g. push) ---
  console.log('\n--- CASE B: WhatsApp disabled, another channel enabled ---');
  await createVolunteerUser('test-comm-case-b', 'Volunteer B', '+2348022222222', 'opted_out');
  // Enable push for Volunteer B
  await execute(`
    INSERT INTO notification_preferences (user_id, role, push_enabled, email_enabled, sound_enabled, created_at, updated_at)
    VALUES ('test-comm-case-b', 'volunteer', 1, 0, 1, ?, ?)
  `, [now, now]);
  await execute(`
    INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
    VALUES ('sub-case-b', 'test-comm-case-b', 'https://fcm.googleapis.com/fcm/send/case-b', 'p256dh-key', 'auth-key', ?)
  `, [now]);

  const resB = await resolveVolunteerCommunicationChannel({
    userId: 'test-comm-case-b',
    displayName: 'Volunteer B',
    phone: '+2348022222222',
    whatsappConsentStatus: 'opted_out'
  });
  assert(resB.contactEligible === true, 'Case B: contact is eligible via enabled push');
  assert(resB.selectedChannel === 'push', 'Case B: selectedChannel is push (not whatsapp)');

  // --- CASE C: multiple channels enabled, existing preferred channel configured ---
  console.log('\n--- CASE C: multiple channels enabled, preferred channel configured ---');
  await createVolunteerUser('test-comm-case-c', 'Volunteer C', '+2348033333333', 'opted_in', 'volc@test.org');
  // Enable push as well
  await execute(`
    INSERT INTO notification_preferences (user_id, role, push_enabled, email_enabled, sound_enabled, created_at, updated_at)
    VALUES ('test-comm-case-c', 'volunteer', 1, 0, 1, ?, ?)
  `, [now, now]);
  await execute(`
    INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
    VALUES ('sub-case-c', 'test-comm-case-c', 'https://fcm.googleapis.com/fcm/send/case-c', 'p256dh-key', 'auth-key', ?)
  `, [now]);
  // Set preferred_contact to Push in linked parent profile (dual-role preference)
  await execute(`
    INSERT INTO parent_profiles (id, user_id, full_name, preferred_contact, created_at, updated_at)
    VALUES ('pp-case-c', 'test-comm-case-c', 'Volunteer C', 'push', ?, ?)
  `, [now, now]);

  const resC = await resolveVolunteerCommunicationChannel({
    userId: 'test-comm-case-c',
    displayName: 'Volunteer C',
    phone: '+2348033333333',
    whatsappConsentStatus: 'opted_in'
  });
  assert(resC.contactEligible === true, 'Case C: contact is eligible');
  assert(resC.selectedChannel === 'push', 'Case C: preferred channel (push) selected over default WhatsApp');

  // --- CASE D: Phone exists, WhatsApp consent disabled (unknown or opted_out) ---
  console.log('\n--- CASE D: Phone exists, WhatsApp consent disabled ---');
  await createVolunteerUser('test-comm-case-d', 'Volunteer D', '+2348044444444', 'unknown');
  const resD = await resolveVolunteerCommunicationChannel({
    userId: 'test-comm-case-d',
    displayName: 'Volunteer D',
    phone: '+2348044444444',
    whatsappConsentStatus: 'unknown'
  });
  assert(resD.contactEligible === false, 'Case D: contact is NOT eligible merely because phone exists');
  assert(resD.selectedChannel === 'none', 'Case D: selectedChannel is none');
  assert(resD.reasonIfUnavailable?.includes('opt-in') || resD.reasonIfUnavailable?.includes('WhatsApp'), 'Case D: clear reason provided');

  // --- CASE E: No supported enabled channel ---
  console.log('\n--- CASE E: No supported enabled channel ---');
  await createVolunteerUser('test-comm-case-e', 'Volunteer E', '', 'unknown');
  const resE = await resolveVolunteerCommunicationChannel({
    userId: 'test-comm-case-e',
    displayName: 'Volunteer E',
    phone: '',
    whatsappConsentStatus: 'unknown'
  });
  assert(resE.contactEligible === false, 'Case E: contact is NOT eligible');
  assert(resE.selectedChannel === 'none', 'Case E: selectedChannel is none');

  // --- CASE F: 3 not reported, 2 eligible, 1 unavailable ---
  console.log('\n--- CASE F: 3 not reported, 2 eligible, 1 unavailable ---');
  // Assign Volunteer A (eligible, WhatsApp), Volunteer B (eligible, Push), Volunteer D (unavailable, unknown consent)
  await execute(`
    INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, starts_at, ends_at, status, responsibility_key, created_at, updated_at)
    VALUES ('asgn-case-a', ?, 'test-comm-case-a', 'loc-comm-test', '2026-09-18T10:00:00Z', '2026-09-18T18:00:00Z', 'scheduled', 'Lead', ?, ?),
           ('asgn-case-b', ?, 'test-comm-case-b', 'loc-comm-test', '2026-09-18T10:00:00Z', '2026-09-18T18:00:00Z', 'scheduled', 'Monitor', ?, ?),
           ('asgn-case-d', ?, 'test-comm-case-d', 'loc-comm-test', '2026-09-18T10:00:00Z', '2026-09-18T18:00:00Z', 'scheduled', 'Support', ?, ?)
  `, [eventId, now, now, eventId, now, now, eventId, now, now]);

  const previewF = await sendDutyRemindersAction.preparePreview({ eventId, actor });
  assert(Boolean(previewF.preview), 'Case F: preview exists');
  assert(previewF.preview?.totalTargetsCount === 3, 'Case F: 3 not reported');
  assert(previewF.preview?.affectedCount === 2, 'Case F: 2 eligible for reminder');
  assert(previewF.preview?.unavailableCount === 1, 'Case F: 1 unavailable');
  assert(previewF.preview?.confirmLabel === 'Send 2 reminders', 'Case F: confirmLabel is "Send 2 reminders"');
  assert(Boolean(previewF.preview?.confirmationToken), 'Case F: token generated');

  // Verify recipient channels in preview
  const recA = previewF.preview?.recipients?.find(r => r.id === 'test-comm-case-a');
  const recB = previewF.preview?.recipients?.find(r => r.id === 'test-comm-case-b');
  const recD = previewF.preview?.recipients?.find(r => r.id === 'test-comm-case-d');
  assert(recA?.channel === 'whatsapp' && recA?.eligible === true, 'Case F: Recipient A channel is WhatsApp');
  assert(recB?.channel === 'push' && recB?.eligible === true, 'Case F: Recipient B channel is Push');
  assert(recD?.channel === 'none' && recD?.eligible === false, 'Case F: Recipient D is unavailable');

  // --- CASE G: 0 eligible (1 not reported, 0 eligible) ---
  console.log('\n--- CASE G: 1 not reported, 0 eligible ---');
  await execute(`DELETE FROM event_duty_assignments WHERE id IN ('asgn-case-a', 'asgn-case-b')`);
  const previewG = await sendDutyRemindersAction.preparePreview({ eventId, actor });
  assert(previewG.preview === undefined, 'Case G: preview is undefined');
  assert(previewG.answer.includes('1 assigned volunteer has not reported for duty'), 'Case G: answer states 1 volunteer not reported');
  assert(previewG.answer.includes('does not currently have an available communication channel'), 'Case G: follow-up explains no channel available');

  // --- CASE H: Modal Cancel (clears preview client-side, performs no write) ---
  console.log('\n--- CASE H: Modal Cancel simulation ---');
  // Re-add assignment A for execution test
  await execute(`
    INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, starts_at, ends_at, status, responsibility_key, created_at, updated_at)
    VALUES ('asgn-case-a', ?, 'test-comm-case-a', 'loc-comm-test', '2026-09-18T10:00:00Z', '2026-09-18T18:00:00Z', 'scheduled', 'Lead', ?, ?)
  `, [eventId, now, now]);
  const previewH = await sendDutyRemindersAction.preparePreview({ eventId, actor });
  assert(Boolean(previewH.preview?.confirmationToken), 'Case H: preview token exists');
  // Client-side cancel simulation: token is not executed, no jobs written
  const jobsCountH = await queryOne('SELECT COUNT(*) as c FROM notification_jobs WHERE event_id = ?', [eventId]);
  assert(Number(jobsCountH?.c || 0) === 0, 'Case H: zero notifications written on cancel');

  // --- CASE I: Confirm executes once with mixed existing providers ---
  console.log('\n--- CASE I: Confirm execution with mixed providers ---');
  // Add Volunteer B (push) as well
  await execute(`
    INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, starts_at, ends_at, status, responsibility_key, created_at, updated_at)
    VALUES ('asgn-case-b', ?, 'test-comm-case-b', 'loc-comm-test', '2026-09-18T10:00:00Z', '2026-09-18T18:00:00Z', 'scheduled', 'Monitor', ?, ?)
  `, [eventId, now, now]);

  const previewI = await sendDutyRemindersAction.preparePreview({ eventId, actor });
  const tokenI = previewI.preview!.confirmationToken;
  assert(previewI.preview?.affectedCount === 2, 'Case I: 2 affected volunteers');

  const execRes = await operationsActionRegistry.confirmAction(tokenI, actor, eventId);
  assert(execRes.success === true, 'Case I: confirmation succeeded');
  assert(execRes.affectedCount === 2, 'Case I: 2 volunteers contacted');
  assert(Boolean(execRes.channelBreakdown?.whatsapp === 1 && execRes.channelBreakdown?.push === 1), 'Case I: mixed channels tracked (1 whatsapp, 1 push)');

  // Verify single-use idempotency
  const execResDup = await operationsActionRegistry.confirmAction(tokenI, actor, eventId);
  assert(execResDup.success === false, 'Case I: second confirmation rejected by idempotency');

  // Cleanup
  await execute(`DELETE FROM notification_jobs WHERE event_id = ?`, [eventId]);
  await execute(`DELETE FROM event_duty_location_presence WHERE event_id = ?`, [eventId]);
  await execute(`DELETE FROM event_duty_assignments WHERE event_id = ?`, [eventId]);
  await execute(`DELETE FROM notification_preferences WHERE user_id LIKE 'test-comm-%'`);
  await execute(`DELETE FROM push_subscriptions WHERE user_id LIKE 'test-comm-%'`);
  await execute(`DELETE FROM parent_profiles WHERE user_id LIKE 'test-comm-%'`);
  await execute(`DELETE FROM volunteer_profiles WHERE user_id LIKE 'test-comm-%'`);
  await execute(`DELETE FROM users WHERE id LIKE 'test-comm-%'`);
  await execute(`DELETE FROM event_locations WHERE id = 'loc-comm-test'`);
  await execute(`DELETE FROM events WHERE id = ?`, [eventId]);

  console.log('\n====================================================');
  console.log('ALL CASE A THROUGH I TESTS PASSED CLEANLY!');
  console.log('====================================================');
}

runTests().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
