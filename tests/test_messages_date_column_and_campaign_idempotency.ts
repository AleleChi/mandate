import assert from 'assert';
import crypto from 'crypto';
import express from 'express';
import { execute, query, queryOne } from '../src/server/db';
import adminRoutes, { buildEmailCampaignKey } from '../src/server/routes/admin';
import { hashPassword, generateToken } from '../src/server/auth';
import { resolveMessageTokens } from '../src/server/utils/urlHelper';

async function runTests() {
  console.log('======================================================================');
  console.log('TEST SUITE: MESSAGES DATE COLUMN FIX & CAMPAIGN IDEMPOTENCY');
  console.log('======================================================================\n');

  process.env.EMAIL_PROVIDER = 'simulated';
  process.env.PUBLIC_APP_URL = 'http://localhost:5173';

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const runId = Date.now().toString();
  const testSuffix = runId.slice(-6);
  const testEventId = `ev-msg-${testSuffix}`;
  const testParent1Id = `p1-${testSuffix}`;
  const testParent2Id = `p2-${testSuffix}`;
  const testUser1Id = `u1-${testSuffix}`;
  const testUser2Id = `u2-${testSuffix}`;
  const testChild1Id = `c1-${testSuffix}`;
  const testChild2Id = `c2-${testSuffix}`;
  const adminUserId = `admin-msg-${testSuffix}`;

  try {
    // 1. Setup Admin User & Token
    const nowIso = new Date().toISOString();
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'super_admin', 'active', 1, ?, ?)
    `, [adminUserId, `admin_${testSuffix}@koinonia.test`, hashPassword('AdminTest123!'), nowIso, nowIso]);

    const adminToken = generateToken(adminUserId);
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    };

    // 2. Setup test event using standard schema (starts_at, ends_at)
    console.log('[Setup] Inserting test event with starts_at and ends_at...');
    await execute(`
      INSERT INTO events (
        id, title, starts_at, ends_at, location, venue_visible_to_selected_parents, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [testEventId, 'Test General Assembly 2026', '2026-11-20T09:00:00Z', '2026-11-20T17:00:00Z', 'Main Auditorium, Abuja']);

    // 3. Setup users, parent profiles, children, and entries
    await execute(`INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES (?, ?, 'parent', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [testUser1Id, `parent1_${testSuffix}@example.com`]);
    await execute(`INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES (?, ?, 'parent', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [testUser2Id, `parent2_${testSuffix}@example.com`]);

    await execute(`INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [
      testParent1Id, testUser1Id, 'Chidinma Okoye', '+2348011111111'
    ]);
    await execute(`INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [
      testParent2Id, testUser2Id, 'Emeka Nwosu', '+2348022222222'
    ]);

    await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at) VALUES (?, ?, ?, 'female', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [
      testChild1Id, testParent1Id, 'Somto Okoye', '2016-04-12'
    ]);
    await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at) VALUES (?, ?, ?, 'male', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [
      testChild2Id, testParent2Id, 'Kamsi Nwosu', '2018-08-20'
    ]);

    await execute(`INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at) VALUES (?, ?, ?, 'selected', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [
      `cee1-${testSuffix}`, testChild1Id, testEventId
    ]);
    await execute(`INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at) VALUES (?, ?, ?, 'selected', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [
      `cee2-${testSuffix}`, testChild2Id, testEventId
    ]);

    // --- TEST SECTION 1: DATABASE COLUMN VERIFICATION ---
    console.log('\n--- SUITE 1: DATABASE COLUMN VERIFICATION ---');
    const evRow = await queryOne('SELECT title, starts_at, ends_at, location, venue_visible_to_selected_parents FROM events WHERE id = ?', [testEventId]);
    assert(evRow, 'Event row should be found');
    assert.strictEqual(evRow.starts_at, '2026-11-20T09:00:00Z', 'starts_at column must match');
    assert.strictEqual(evRow.ends_at, '2026-11-20T17:00:00Z', 'ends_at column must match');
    console.log('[PASS] SELECT title, starts_at, ends_at FROM events executes successfully without column errors');

    // Test token resolution for {Event date}
    const resolvedBody = resolveMessageTokens('Welcome to {Event name} on {Event date} at {Venue name}!', {
      eventName: evRow.title,
      eventDate: '20th Nov 2026',
      venueName: 'Main Auditorium'
    });
    assert(resolvedBody.includes('20th Nov 2026'), 'Event date token must be resolved to 20th Nov 2026');
    assert(!resolvedBody.includes('{Event date}'), 'No unrendered {Event date} token should remain');
    console.log('[PASS] {Event date} token resolution formats cleanly: ' + resolvedBody);

    // --- TEST SECTION 2: HTTP GET /api/admin/messages ENDPOINT VERIFICATION ---
    console.log('\n--- SUITE 2: HTTP GET /api/admin/messages ENDPOINT ---');
    const getRes = await fetch(`${baseUrl}/api/admin/messages?eventId=${testEventId}`, {
      method: 'GET',
      headers: authHeaders
    });
    const getData = await getRes.json();
    assert.strictEqual(getRes.status, 200, `GET /api/admin/messages must return 200, got ${getRes.status}: ${JSON.stringify(getData)}`);
    assert(getData.success === true, 'GET /messages must return success: true');
    assert(getData.selectedParentsSummary, 'selectedParentsSummary must be returned');
    assert.strictEqual(getData.selectedParentsSummary.totalSelectedChildren, 2, 'totalSelectedChildren must be 2');
    assert.strictEqual(getData.selectedParentsSummary.totalEligibleParents, 2, 'totalEligibleParents must be 2');
    assert.strictEqual(getData.selectedParentsSummary.validEmailCount, 2, 'validEmailCount must be 2');
    assert.strictEqual(getData.selectedParentsSummary.missingEmailCount, 0, 'missingEmailCount must be 0');
    console.log('[PASS] GET /api/admin/messages loads cleanly without SQL errors and accurate audience metrics');

    // --- TEST SECTION 3: HTTP POST /api/admin/messages/preview VERIFICATION ---
    console.log('\n--- SUITE 3: HTTP POST /api/admin/messages/preview ENDPOINT ---');
    const previewRes = await fetch(`${baseUrl}/api/admin/messages/preview`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        eventId: testEventId,
        recipientGroup: 'selected_parents',
        messageType: 'general_announcement',
        channel: 'email',
        subject: 'Important Update on {Event date} - {Event name}',
        body: 'Dear {Parent name},\n\nWe look forward to welcoming {Selected child name(s)} to {Event name} on {Event date}!\nVenue: {Venue name}, {Venue address}.\n\nWarm regards,\nThe Koinonia Team'
      })
    });
    const previewData = await previewRes.json();
    assert.strictEqual(previewRes.status, 200, `POST /api/admin/messages/preview must return 200, got ${previewRes.status}: ${JSON.stringify(previewData)}`);
    assert(previewData.success === true, 'POST /preview must return success: true');
    assert(previewData.preview, 'preview object must be returned');
    assert(previewData.preview.body.includes('20th Nov 2026'), `Preview body must contain resolved event date (20th Nov 2026): ${previewData.preview.body}`);
    assert(previewData.preview.subject.includes('20th Nov 2026'), `Preview subject must contain resolved event date: ${previewData.preview.subject}`);
    assert(!previewData.preview.body.includes('{Event date}'), 'No unresolved {Event date} token in preview body');
    assert(!previewData.preview.subject.includes('{Event date}'), 'No unresolved {Event date} token in preview subject');
    console.log('[PASS] POST /preview resolves starts_at date tokens without any column error: ' + previewData.preview.subject);

    // --- TEST SECTION 4: HTTP POST /api/admin/messages/send CAMPAIGN 1 ---
    console.log('\n--- SUITE 4: CAMPAIGN 1 DISPATCH (PASS INSTRUCTIONS) ---');
    const camp1Subject = 'Child Pass Instructions - Test Event';
    const camp1Body = 'Dear {Parent name},\n\nHere are instructions for {Selected child name(s)}.\n\nWarm regards,\nThe Koinonia Team';

    const send1Res = await fetch(`${baseUrl}/api/admin/messages/send`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        eventId: testEventId,
        recipientGroup: 'selected_parents',
        messageType: 'general_announcement',
        channels: ['email'],
        subject: camp1Subject,
        body: camp1Body,
        confirmed: true
      })
    });
    const send1Data = await send1Res.json();
    assert.strictEqual(send1Res.status, 200, `Campaign 1 send must return 200: ${JSON.stringify(send1Data)}`);
    assert(send1Data.success === true, 'Campaign 1 send must be successful');
    assert.strictEqual(send1Data.emailSent, 2, `Campaign 1 must send 2 emails, got ${send1Data.emailSent}`);
    assert(send1Data.campaignKey, 'campaignKey must be returned');
    const camp1Key = send1Data.campaignKey;
    console.log(`[PASS] Campaign 1 sent 2 emails successfully (CampaignKey: ${camp1Key})`);

    // Verify delivery logs in DB
    const camp1DbLogs = await query('SELECT * FROM email_delivery_logs WHERE campaign_id = ? AND status = ?', [camp1Key, 'sent']);
    assert.strictEqual(camp1DbLogs.length, 2, '2 logs must be recorded for Campaign 1 in email_delivery_logs');
    console.log('[PASS] Campaign 1 delivery logs recorded in database with campaign_id');

    // --- TEST SECTION 5: RETRY CAMPAIGN 1 (IDEMPOTENCY VERIFICATION) ---
    console.log('\n--- SUITE 5: RETRY CAMPAIGN 1 (ZERO DUPLICATE DELIVERY) ---');
    const retry1Res = await fetch(`${baseUrl}/api/admin/messages/send`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        eventId: testEventId,
        recipientGroup: 'selected_parents',
        messageType: 'general_announcement',
        channels: ['email'],
        subject: camp1Subject,
        body: camp1Body,
        confirmed: true,
        campaignId: camp1Key
      })
    });
    const retry1Data = await retry1Res.json();
    assert.strictEqual(retry1Res.status, 200, 'Retry must return 200');
    assert.strictEqual(retry1Data.emailSent, 0, `Retry must skip both already-delivered parents (expected 0 sent, got ${retry1Data.emailSent})`);

    const camp1DbLogsAfterRetry = await query('SELECT * FROM email_delivery_logs WHERE campaign_id = ? AND status = ?', [camp1Key, 'sent']);
    assert.strictEqual(camp1DbLogsAfterRetry.length, 2, 'No duplicate delivery logs created on retry');
    console.log('[PASS] Retry of Campaign 1 safely skipped all already-delivered recipients (0 sent, 0 duplicates)');

    // --- TEST SECTION 6: CAMPAIGN 2 (SEPARATE VENUE/ARRIVAL ANNOUNCEMENT) ---
    console.log('\n--- SUITE 6: CAMPAIGN 2 DISPATCH (SEPARATE ANNOUNCEMENT) ---');
    const camp2Subject = 'Venue and Arrival Guidelines - Test Event';
    const camp2Body = 'Dear {Parent name},\n\nHere are venue details for {Event name}.\n\nWarm regards,\nThe Koinonia Team';

    const send2Res = await fetch(`${baseUrl}/api/admin/messages/send`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        eventId: testEventId,
        recipientGroup: 'selected_parents',
        messageType: 'general_announcement',
        channels: ['email'],
        subject: camp2Subject,
        body: camp2Body,
        confirmed: true
      })
    });
    const send2Data = await send2Res.json();
    assert.strictEqual(send2Res.status, 200, `Campaign 2 send must return 200: ${JSON.stringify(send2Data)}`);
    assert(send2Data.success === true, 'Campaign 2 send must be successful');
    assert.strictEqual(send2Data.emailSent, 2, `Campaign 2 must send to all 2 selected parents (got ${send2Data.emailSent})`);
    assert(send2Data.campaignKey !== camp1Key, 'Campaign 2 key must be distinct from Campaign 1 key');
    const camp2Key = send2Data.campaignKey;
    console.log(`[PASS] Campaign 2 delivered to both parents despite prior Campaign 1 delivery (CampaignKey: ${camp2Key})`);

    const camp2DbLogs = await query('SELECT * FROM email_delivery_logs WHERE campaign_id = ? AND status = ?', [camp2Key, 'sent']);
    assert.strictEqual(camp2DbLogs.length, 2, '2 logs must be recorded for Campaign 2 in email_delivery_logs');

    // Total logs for event must now be 4 (2 for Campaign 1, 2 for Campaign 2)
    const allEventLogs = await query('SELECT * FROM email_delivery_logs WHERE event_id = ?', [testEventId]);
    assert.strictEqual(allEventLogs.length, 4, 'All event logs must preserve both campaigns independently');
    console.log('[PASS] Full delivery histories preserved independently across both campaigns');

    // --- TEST SECTION 7: VENUE VISIBILITY RESTRICTION VERIFICATION ---
    console.log('\n--- SUITE 7: VENUE VISIBILITY RESTRICTION SAFETY GUARD ---');
    // Set venue visibility to OFF for testEventId
    await execute('UPDATE events SET venue_visible_to_selected_parents = 0 WHERE id = ?', [testEventId]);

    // Preview when visibility is OFF should show hidden venue placeholder
    const previewOffRes = await fetch(`${baseUrl}/api/admin/messages/preview`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        eventId: testEventId,
        recipientGroup: 'selected_parents',
        messageType: 'general_announcement',
        channel: 'email',
        subject: 'Venue Information',
        body: 'Venue is {Venue address}'
      })
    });
    const previewOffData = await previewOffRes.json();
    assert.strictEqual(previewOffRes.status, 200);
    assert(previewOffData.venueVisibilityOff === true, 'venueVisibilityOff must be true');
    assert(previewOffData.preview.body.includes('[Venue address hidden - Visibility is OFF]'), 'Preview must hide venue address while OFF');
    console.log('[PASS] Preview hides venue address while Venue Visibility is OFF');

    // Sending message with restricted token while visibility is OFF must be strictly BLOCKED (400)
    const blockSendRes = await fetch(`${baseUrl}/api/admin/messages/send`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        eventId: testEventId,
        recipientGroup: 'selected_parents',
        messageType: 'general_announcement',
        channels: ['email'],
        subject: 'Venue Details',
        body: 'Address is {Venue address}',
        confirmed: true
      })
    });
    const blockSendData = await blockSendRes.json();
    assert.strictEqual(blockSendRes.status, 400, 'Sending restricted venue token while visibility is OFF must return 400');
    assert(blockSendData.error.includes('while Venue Visibility is OFF'), 'Error message must explain venue visibility restriction');
    console.log('[PASS] Send blocked with 400 when restricted venue token is used while Venue Visibility is OFF');

    console.log('\n======================================================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! ZERO DEFECTS DETECTED.');
    console.log('======================================================================\n');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('\n[FAIL] Test suite encountered an error:', err);
    server.close();
    process.exit(1);
  }
}

runTests();
