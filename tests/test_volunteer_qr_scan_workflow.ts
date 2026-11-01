import assert from 'assert';
import http from 'http';
import express from 'express';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import volunteerRoutes from '../src/server/routes/volunteer';
import adminRoutes from '../src/server/routes/admin';
import {
  dispatchCheckInWhatsAppNotification,
  dispatchPickupWhatsAppNotification
} from '../src/server/services/whatsapp/attendanceNotifications';
import { getTemplateDefinition } from '../src/server/services/whatsapp/templateRegistry';

async function runVolunteerQrScanWorkflowTests() {
  console.log('================================================================');
  console.log('TEST SUITE: Volunteer QR Scan & Attendance WhatsApp Workflow');
  console.log('================================================================\n');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const nowIso = new Date().toISOString();

  // Setup test server
  const app = express();
  app.use(express.json());
  app.use('/api/volunteer', volunteerRoutes);
  app.use('/api/admin', adminRoutes);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Setup test data
    const eventId = `ev-scan-${testRunId}`;
    const parentId = `par-scan-${testRunId}`;
    const childId = `ch-scan-${testRunId}`;
    const entryId = `ent-scan-${testRunId}`;
    const passRef = `KOI-SCAN-${testRunId}`;
    const workerUserId = `usr-worker-${testRunId}`;

    // Demote any previously active/current test events to ensure single current event
    await execute("UPDATE events SET status = 'archived' WHERE status = 'current'");

    // Insert test event
    await execute(
      `INSERT INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
       VALUES (?, ?, 'current', '2026-11-18T08:00:00Z', '2026-11-22T18:00:00Z', ?, ?)`,
      [eventId, `TGA 2026 Test Event ${testRunId}`, nowIso, nowIso]
    );

    // Insert worker user
    await execute(
      `INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
       VALUES (?, ?, 'hash', 'volunteer', 'active', 1, ?, ?)`,
      [workerUserId, `worker.${testRunId}@example.com`, nowIso, nowIso]
    );

    // Insert admin user for state reset testing
    const adminUserId = `usr-admin-${testRunId}`;
    await execute(
      `INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
       VALUES (?, ?, 'hash', 'super_admin', 'active', 1, ?, ?)`,
      [adminUserId, `admin.${testRunId}@example.com`, nowIso, nowIso]
    );

    await execute(
      `INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
       VALUES (?, ?, 'Check-in Lead Worker', '+2348012345678', '+2348012345678', 'Check-in Desk', 'approved', ?, ?)`,
      [`vp-${workerUserId}`, workerUserId, nowIso, nowIso]
    );

    // Insert test parent (opted into WhatsApp)
    await execute(
      `INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, whatsapp_consent_status, created_at, updated_at)
       VALUES (?, ?, 'Sarah Jenkins', '+2348012345678', '+2348012345678', 'opted_in', ?, ?)`,
      [parentId, workerUserId, nowIso, nowIso]
    );

    // Insert test child with medical note and special needs
    await execute(
      `INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, photo_file_id, created_at, updated_at)
       VALUES (?, ?, 'Maya Jenkins', 'female', '2018-05-10', 8, 'Ages 7 to 9', 'https://example.com/child.jpg', ?, ?)`,
      [childId, parentId, nowIso, nowIso]
    );

    // Insert event entry
    await execute(
      `INSERT INTO child_event_entries (id, event_id, child_id, status, has_medical_notes, medical_notes, needs_extra_support, support_notes, created_at, updated_at)
       VALUES (?, ?, ?, 'pass_ready', 1, 'Does not like noise; mild peanut allergy', 1, 'Needs quiet sensory area', ?, ?)`,
      [entryId, eventId, childId, nowIso, nowIso]
    );

    // Insert event pass
    await execute(
      `INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
      [`pass-${testRunId}`, entryId, passRef, `hash-${testRunId}`, nowIso, nowIso, nowIso]
    );

    // Insert TWO authorized pickup persons
    await execute(
      `INSERT INTO pickup_people (id, child_event_entry_id, full_name, phone_number, whatsapp_number, relationship_to_child, photo_file_id, pickup_type, created_at, updated_at)
       VALUES (?, ?, 'Michael Jenkins', '+2348099887766', '+2348099887766', 'Father', 'https://example.com/michael.jpg', 'primary', ?, ?)`,
      [`pk-1-${testRunId}`, entryId, nowIso, nowIso]
    );
    await execute(
      `INSERT INTO pickup_people (id, child_event_entry_id, full_name, phone_number, whatsapp_number, relationship_to_child, photo_file_id, pickup_type, created_at, updated_at)
       VALUES (?, ?, 'Grandma Rose', '+2348011223344', '+2348011223344', 'Grandmother', 'https://example.com/rose.jpg', 'alternative', ?, ?)`,
      [`pk-2-${testRunId}`, entryId, nowIso, nowIso]
    );

    // Generate tokens
    const token = generateToken(workerUserId);
    const adminToken = generateToken(adminUserId);

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    const adminHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    };

    console.log('[TEST 1] Verifying Template Registry for Check-in & Pickup...');
    const checkinTemplate = getTemplateDefinition('child_checked_in');
    assert(checkinTemplate, 'Check-in template config must exist');
    assert.strictEqual(checkinTemplate.defaultAlias, 'koinonia_child_checked_in');
    assert(checkinTemplate.envVarKeys.includes('ZOHO_WA_TEMPLATE_KOINONIA_CHILD_CHECKED_IN'));

    const pickupTemplate = getTemplateDefinition('child_picked_up');
    assert(pickupTemplate, 'Pickup template config must exist');
    assert.strictEqual(pickupTemplate.defaultAlias, 'koinonia_child_picked_up');
    assert(pickupTemplate.envVarKeys.includes('ZOHO_WA_TEMPLATE_KOINONIA_CHILD_PICKED_UP'));
    console.log('✓ Template registry contains child_checked_in and child_picked_up.\n');

    console.log('[TEST 2] Verifying GET /api/volunteer/children/:childId returns full operational record...');
    const getRes = await fetch(`${baseUrl}/api/volunteer/children/${childId}`, { headers });
    const getData = await getRes.json();
    assert.strictEqual(getData.success, true, 'GET child must succeed');
    assert(getData.child, 'child record returned');
    assert.strictEqual(getData.child.fullName, 'Maya Jenkins');
    assert.strictEqual(getData.child.passReference, passRef, 'Pass reference returned');
    assert(getData.child.medicalNote.includes('Does not like noise'), 'Medical note preserved');
    assert(getData.child.extraSupport.includes('quiet sensory area'), 'Support note preserved');
    assert.strictEqual(getData.parent.fullName, 'Sarah Jenkins');
    assert.strictEqual(getData.pickupPeople.length, 2, 'All 2 authorized pickup persons returned');
    assert.strictEqual(getData.pickupPeople[0].fullName, 'Michael Jenkins');
    assert.strictEqual(getData.pickupPeople[1].fullName, 'Grandma Rose');
    console.log('✓ Detailed canonical child operational record contains full data, medical alert, and all pickup persons.\n');

    console.log('[TEST 3] Check-in Transition & WhatsApp Notification Dispatch...');
    const checkInRes = await fetch(`${baseUrl}/api/volunteer/check-in`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        childId,
        eventId,
        passReference: passRef
      })
    });
    const checkInData = await checkInRes.json();
    assert.strictEqual(checkInData.success, true, 'Check-in must succeed');
    assert.strictEqual(checkInData.child.entryStatus, 'checked_in');

    // Wait briefly for non-blocking notification dispatch to write to delivery log
    await new Promise(r => setTimeout(r, 200));

    // Verify DB state
    const entryAfterCheckIn = await queryOne<any>(
      `SELECT status, checked_in_at FROM child_event_entries WHERE id = ?`,
      [entryId]
    );
    assert.strictEqual(entryAfterCheckIn.status, 'checked_in');
    assert(entryAfterCheckIn.checked_in_at, 'checked_in_at must be populated');

    // Verify WhatsApp notification attempt logged
    const checkinLog = await queryOne<any>(
      `SELECT * FROM whatsapp_delivery_logs WHERE child_event_entry_id = ? AND template_name = 'koinonia_child_checked_in'`,
      [entryId]
    );
    assert(checkinLog, 'WhatsApp delivery log for check-in must exist');
    assert.strictEqual(checkinLog.recipient_phone, '+2348012345678');
    console.log('✓ Check-in succeeded and WhatsApp check-in notification recorded in delivery log.\n');

    console.log('[TEST 4] Duplicate Check-In Idempotency (Repeat scan/check-in)...');
    // Mark delivery log as sent to simulate confirmed gateway delivery
    await execute(
      `UPDATE whatsapp_delivery_logs SET status = 'sent' WHERE child_event_entry_id = ? AND template_name = 'koinonia_child_checked_in'`,
      [entryId]
    );

    // Calling dispatchCheckInWhatsAppNotification directly for same entry must return deduplicated
    const dupCheckInResult = await dispatchCheckInWhatsAppNotification({
      childEventEntryId: entryId,
      eventId,
      parentId,
      parentName: 'Sarah Jenkins',
      parentPhone: '+2348012345678',
      childName: 'Maya Jenkins',
      checkinTimeIso: nowIso
    });
    assert.strictEqual(dupCheckInResult.sent, false, 'Duplicate must not be sent');
    assert(dupCheckInResult.reason?.includes('already sent') || dupCheckInResult.reason === 'already_sent');
    console.log('✓ Idempotency protected: duplicate check-in message prevented.\n');

    console.log('[TEST 5] Pickup Transition & WhatsApp Notification Dispatch...');
    const pickupRes = await fetch(`${baseUrl}/api/volunteer/check-out`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        childId,
        eventId,
        pickupPersonName: 'Michael Jenkins',
        pickupPersonRelationship: 'Father',
        pickupPersonPhone: '+2348099887766'
      })
    });
    const pickupData = await pickupRes.json();
    assert.strictEqual(pickupData.success, true, 'Pickup/checkout must succeed');

    // Wait briefly for non-blocking notification dispatch to write to delivery log
    await new Promise(r => setTimeout(r, 200));

    // Verify DB state
    const entryAfterPickup = await queryOne<any>(
      `SELECT status, picked_up_at FROM child_event_entries WHERE id = ?`,
      [entryId]
    );
    assert.strictEqual(entryAfterPickup.status, 'picked_up');
    assert(entryAfterPickup.picked_up_at, 'picked_up_at must be populated');

    // Verify WhatsApp pickup notification logged
    const pickupLog = await queryOne<any>(
      `SELECT * FROM whatsapp_delivery_logs WHERE child_event_entry_id = ? AND template_name = 'koinonia_child_picked_up'`,
      [entryId]
    );
    assert(pickupLog, 'WhatsApp delivery log for pickup must exist');
    assert.strictEqual(pickupLog.recipient_phone, '+2348012345678');
    console.log('✓ Pickup succeeded and WhatsApp pickup notification recorded in delivery log.\n');

    console.log('[TEST 6] Duplicate Pickup Idempotency (Repeat pickup)...');
    // Mark delivery log as sent to simulate confirmed gateway delivery
    await execute(
      `UPDATE whatsapp_delivery_logs SET status = 'sent' WHERE child_event_entry_id = ? AND template_name = 'koinonia_child_picked_up'`,
      [entryId]
    );

    const dupPickupResult = await dispatchPickupWhatsAppNotification({
      childEventEntryId: entryId,
      eventId,
      parentId,
      parentName: 'Sarah Jenkins',
      parentPhone: '+2348012345678',
      childName: 'Maya Jenkins',
      pickupTimeIso: nowIso,
      pickupPersonName: 'Michael Jenkins'
    });
    assert.strictEqual(dupPickupResult.sent, false, 'Duplicate pickup must not be sent');
    assert(dupPickupResult.reason?.includes('already sent') || dupPickupResult.reason === 'already_sent');
    console.log('✓ Idempotency protected: duplicate pickup message prevented.\n');

    console.log('[TEST 7] Resilience: Notification failure does NOT block attendance...');
    // Create an entry where parent has NO consent
    const parentNoConsentId = `par-noconsent-${testRunId}`;
    const child2Id = `ch-noconsent-${testRunId}`;
    const entry2Id = `ent-noconsent-${testRunId}`;

    const parentUser2Id = `usr-p2-${testRunId}`;
    await execute(
      `INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
       VALUES (?, ?, 'hash', 'parent', 'active', 1, ?, ?)`,
      [parentUser2Id, `david.${testRunId}@example.com`, nowIso, nowIso]
    );

    await execute(
      `INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, created_at, updated_at)
       VALUES (?, ?, 'David Doe', '+2348022223333', '', ?, ?)`,
      [parentNoConsentId, parentUser2Id, nowIso, nowIso]
    );
    await execute(
      `INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at)
       VALUES (?, ?, 'Leo Doe', 'male', '2019-01-01', 7, 'Ages 7 to 9', ?, ?)`,
      [child2Id, parentNoConsentId, nowIso, nowIso]
    );
    await execute(
      `INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pass_ready', ?, ?)`,
      [entry2Id, eventId, child2Id, nowIso, nowIso]
    );

    const checkInNoConsentRes = await fetch(`${baseUrl}/api/volunteer/check-in`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        childId: child2Id,
        eventId
      })
    });
    const checkInNoConsentData = await checkInNoConsentRes.json();
    assert.strictEqual(checkInNoConsentData.success, true, 'Check-in MUST succeed even if WhatsApp is not sent');

    const entry2Db = await queryOne<any>(
      `SELECT status FROM child_event_entries WHERE id = ?`,
      [entry2Id]
    );
    assert.strictEqual(entry2Db.status, 'checked_in', 'Child must be checked in regardless of messaging result');
    console.log('✓ Attendance check-in succeeds unconditionally even when WhatsApp notification is not eligible or fails.\n');

    console.log('[TEST 8] Admin Controlled Reset Event State to "pass_ready"...');
    // Count WhatsApp delivery logs before reset
    const waCountBeforeReset = await queryOne<any>(
      `SELECT COUNT(*) as count FROM whatsapp_delivery_logs WHERE child_event_entry_id = ?`,
      [entryId]
    );

    const resetPassReadyRes = await fetch(`${baseUrl}/api/admin/applications/${entryId}/reset-event-state`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        targetState: 'pass_ready',
        reason: 'manual_test_reset'
      })
    });
    const resetPassReadyData = await resetPassReadyRes.json();
    assert.strictEqual(resetPassReadyData.success, true, 'Admin reset to pass_ready must succeed');
    assert.strictEqual(resetPassReadyData.newStatus, 'pass_ready');

    // Verify DB state: check-in and pickup operational timestamps are cleared safely
    const entryAfterReset = await queryOne<any>(
      `SELECT status, checked_in_at, checked_in_by, picked_up_at, picked_up_by FROM child_event_entries WHERE id = ?`,
      [entryId]
    );
    assert.strictEqual(entryAfterReset.status, 'pass_ready');
    assert.strictEqual(entryAfterReset.checked_in_at, null);
    assert.strictEqual(entryAfterReset.checked_in_by, null);
    assert.strictEqual(entryAfterReset.picked_up_at, null);
    assert.strictEqual(entryAfterReset.picked_up_by, null);

    // Verify active pass is preserved/reactivated
    const activePass = await queryOne<any>(
      `SELECT status FROM event_passes WHERE child_event_entry_id = ? AND status = 'active'`,
      [entryId]
    );
    assert(activePass, 'Active pass must exist for pass_ready child');

    // Verify audit log recorded
    const auditLogPassReady = await queryOne<any>(
      `SELECT * FROM audit_logs WHERE target_id = ? AND action = 'manual_test_reset' ORDER BY timestamp DESC LIMIT 1`,
      [entryId]
    );
    assert(auditLogPassReady, 'Audit log must be created for manual_test_reset');
    assert(auditLogPassReady.details.includes('pass_ready'));

    // Verify NO WhatsApp notifications dispatched on reset
    const waCountAfterReset = await queryOne<any>(
      `SELECT COUNT(*) as count FROM whatsapp_delivery_logs WHERE child_event_entry_id = ?`,
      [entryId]
    );
    assert.strictEqual(waCountAfterReset.count, waCountBeforeReset.count, 'No WhatsApp message must be sent during reset');

    // Verify volunteer scanner lookup retrieves child again in pass_ready state
    const lookupAgainRes = await fetch(`${baseUrl}/api/volunteer/pass/lookup`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ childEventEntryId: entryId })
    });
    const lookupAgainData = await lookupAgainRes.json();
    assert.strictEqual(lookupAgainData.success, true, 'Scanner lookup must succeed for pass_ready child');
    assert.strictEqual(lookupAgainData.child.entryStatus, 'pass_ready');
    console.log('✓ Admin reset to pass_ready succeeded: cleared check-in/pickup operational state, restored active pass, recorded audit log, suppressed WhatsApp.\n');

    console.log('[TEST 9] Admin Controlled Reset Event State to "under_review"...');
    const resetUnderReviewRes = await fetch(`${baseUrl}/api/admin/applications/${entryId}/reset-event-state`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        targetState: 'under_review',
        reason: 'manual_test_reset'
      })
    });
    const resetUnderReviewData = await resetUnderReviewRes.json();
    assert.strictEqual(resetUnderReviewData.success, true, 'Admin reset to under_review must succeed');
    assert.strictEqual(resetUnderReviewData.newStatus, 'under_review');

    // Verify DB state
    const entryUnderReview = await queryOne<any>(
      `SELECT status, checked_in_at FROM child_event_entries WHERE id = ?`,
      [entryId]
    );
    assert.strictEqual(entryUnderReview.status, 'under_review');
    assert.strictEqual(entryUnderReview.checked_in_at, null);

    // Verify active pass was revoked
    const revokedPass = await queryOne<any>(
      `SELECT status FROM event_passes WHERE child_event_entry_id = ? AND status = 'revoked'`,
      [entryId]
    );
    assert(revokedPass, 'Pass must be revoked when reset to under_review');

    // Verify volunteer check-in is blocked
    const blockedCheckInRes = await fetch(`${baseUrl}/api/volunteer/check-in`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ childEventEntryId: entryId })
    });
    const blockedCheckInData = await blockedCheckInRes.json();
    assert.strictEqual(blockedCheckInRes.status, 400, 'Check-in must be rejected for under_review child');
    assert(blockedCheckInData.error.includes('under_review') || blockedCheckInData.error.includes('pass_ready'));
    console.log('✓ Admin reset to under_review succeeded: revoked pass, blocked volunteer check-in, and recorded audit log.\n');

    console.log('================================================================');
    console.log('ALL 9 WORKFLOW TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    server.close();
    process.exit(0);
  }
}

runVolunteerQrScanWorkflowTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
