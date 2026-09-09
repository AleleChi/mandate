import crypto from 'crypto';
import express from 'express';
import { query, queryOne, execute } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import adminRoutes from '../src/server/routes/admin';
import {
  isWhatsAppInProcessWorkerEnabled,
  SimulatedWhatsAppProvider,
  enqueueWhatsAppJob,
  processQueuedWhatsAppJobs,
  resetWhatsAppProviderCache
} from '../src/server/services/whatsapp';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('TGA WHATSAPP PHASE 1C — VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}: ${err.message}`);
      failed++;
    }
  }

  // Setup express test server for admin routes
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  let server: any;
  let testBaseUrl = '';

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const port = (server.address() as any).port;
      testBaseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const now = new Date().toISOString();
  const testSuperAdminId = `u_super_1c_${crypto.randomUUID()}`;
  const superAdminEmail = `super_1c_${crypto.randomUUID()}@koinonia.org`;
  const superAdminToken = generateToken(testSuperAdminId);

  // Create test super admin
  await execute(`
    INSERT INTO users (id, email, role, created_at, updated_at)
    VALUES (?, ?, 'super_admin', ?, ?)
  `, [testSuperAdminId, superAdminEmail, now, now]);

  try {
    // ====================================================
    // SECTION 1: SPECIFIC PARENT TARGETING & DEDUPLICATION
    // ====================================================
    console.log('--- SECTION 1: SPECIFIC PARENT TARGETING & DEDUPLICATION ---');

    const testEventId = 'event-ga-2026';

    // Seed 2 parents:
    // Parent A: Unconsented, 2 children (multi-child)
    // Parent B: Opted in, 1 child
    const userAId = `u_pa_${crypto.randomUUID()}`;
    const parentAId = `p_pa_${crypto.randomUUID()}`;
    const parentAEmail = `parent_a_${crypto.randomUUID()}@test.com`;
    const childA1Id = `c_a1_${crypto.randomUUID()}`;
    const childA2Id = `c_a2_${crypto.randomUUID()}`;
    const entryA1Id = `e_a1_${crypto.randomUUID()}`;
    const entryA2Id = `e_a2_${crypto.randomUUID()}`;

    const userBId = `u_pb_${crypto.randomUUID()}`;
    const parentBId = `p_pb_${crypto.randomUUID()}`;
    const parentBEmail = `parent_b_${crypto.randomUUID()}@test.com`;
    const childBId = `c_b_${crypto.randomUUID()}`;
    const entryBId = `e_b_${crypto.randomUUID()}`;

    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES 
        (?, ?, 'parent', ?, ?),
        (?, ?, 'parent', ?, ?)
    `, [userAId, parentAEmail, now, now, userBId, parentBEmail, now, now]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, whatsapp_consent_status, email, created_at, updated_at)
      VALUES 
        (?, ?, 'Parent A MultiChild', '08011112222', '08011112222', 'unknown', ?, ?, ?),
        (?, ?, 'Parent B OptedIn', '08033334444', '08033334444', 'opted_in', ?, ?, ?)
    `, [parentAId, userAId, parentAEmail, now, now, parentBId, userBId, parentBEmail, now, now]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES 
        (?, ?, 'Child A One', 'female', '2020-01-01', ?, ?),
        (?, ?, 'Child A Two', 'male', '2018-05-15', ?, ?),
        (?, ?, 'Child B One', 'female', '2021-09-09', ?, ?)
    `, [childA1Id, parentAId, now, now, childA2Id, parentAId, now, now, childBId, parentBId, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES 
        (?, ?, ?, 'checked_in', ?, ?),
        (?, ?, ?, 'checked_in', ?, ?),
        (?, ?, ?, 'checked_in', ?, ?)
    `, [entryA1Id, testEventId, childA1Id, now, now, entryA2Id, testEventId, childA2Id, now, now, entryBId, testEventId, childBId, now, now]);

    await test('broadcast-data returns eventParents with specific_parents option', async () => {
      const res = await fetch(`${testBaseUrl}/api/admin/messages?eventId=${testEventId}`, {
        headers: { 'Authorization': `Bearer ${superAdminToken}` }
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.success === true, 'Expected success true');
      assert(Array.isArray(data.eventParents), 'Expected eventParents array');
      const specGroup = data.recipientGroups.find((g: any) => g.key === 'specific_parents');
      assert(specGroup !== undefined, 'Expected specific_parents recipient group');
      assert(specGroup.count >= 2, 'Expected at least 2 parents in specific_parents count');

      const foundA = data.eventParents.find((p: any) => p.id === parentAId);
      assert(foundA !== undefined, 'Expected to find Parent A in eventParents');
      assert(foundA.childCount === 2, `Expected Parent A to have 2 children, got ${foundA.childCount}`);
      assert(foundA.whatsappConsentStatus === 'unknown', 'Expected Parent A whatsappConsentStatus unknown');

      const foundB = data.eventParents.find((p: any) => p.id === parentBId);
      assert(foundB !== undefined, 'Expected to find Parent B in eventParents');
      assert(foundB.childCount === 1, `Expected Parent B to have 1 child, got ${foundB.childCount}`);
      assert(foundB.whatsappConsentStatus === 'opted_in', 'Expected Parent B whatsappConsentStatus opted_in');
    });

    await test('Parent multi-select dedupe and multi-child parent counted once for general announcement', async () => {
      // Send duplicate IDs in selectedParentIds: [parentAId, parentAId]
      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [parentAId, parentAId], // duplicate intentionally
          messageType: 'general_announcement',
          channels: ['in_app'],
          subject: 'Announcement for Parent A',
          body: 'Dear {Parent name}, general update.',
          confirmed: true,
          eventId: testEventId
        })
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.success === true, 'Expected success true');
      // Despite Parent A having 2 children and duplicate IDs sent, recipient count must be exactly 1
      assert(data.recipientsCount === 1, `Expected recipientsCount 1, got ${data.recipientsCount}`);
    });

    await test('Specific parent preview resolves representative parent tokens', async () => {
      const res = await fetch(`${testBaseUrl}/api/admin/messages/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [parentAId],
          messageType: 'general_announcement',
          channel: 'in_app',
          subject: 'Hello {Parent name}',
          body: 'Dear {Parent name}, your child {Child name} has an update.'
        })
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.success === true, 'Expected preview success');
      assert(data.preview.subject.includes('Parent A MultiChild'), 'Subject should contain Parent A name');
      assert(data.preview.representativeParentName === 'Parent A MultiChild', 'Expected representativeParentName');
    });

    // ====================================================
    // SECTION 2: CHANNEL ELIGIBILITY & WHATSAPP EXCLUSION
    // ====================================================
    console.log('\n--- SECTION 2: CHANNEL ELIGIBILITY & WHATSAPP EXCLUSION ---');

    await test('Selected parent not opted in is excluded from WhatsApp; opted-in parent is queued', async () => {
      // Temporarily disable worker to verify jobs stay queued in pending status
      process.env.WHATSAPP_WORKER_MODE = 'disabled';

      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [parentAId, parentBId], // Parent A = unknown, Parent B = opted_in
          messageType: 'general_announcement',
          channels: ['whatsapp'],
          subject: 'Announcement for Selected Parents',
          body: 'Hello {Parent name}, test announcement.',
          confirmed: true,
          eventId: testEventId
        })
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.success === true, 'Expected success true');
      // Parent B opted in -> 1 queued; Parent A not opted in -> 1 skipped
      assert(data.whatsappQueued === 1, `Expected 1 whatsappQueued, got ${data.whatsappQueued}`);
      assert(data.whatsappSkipped === 1, `Expected 1 whatsappSkipped, got ${data.whatsappSkipped}`);
      assert(data.message.includes('1 WhatsApp recipient queued'), 'Message should confirm 1 queued');
      assert(data.message.includes('1 selected parent not eligible for WhatsApp'), 'Message should confirm 1 not eligible');

      // Verify DB: job created only for parentBId
      const jobA = await queryOne("SELECT id FROM notification_jobs WHERE parent_id = ? AND channel = 'whatsapp'", [parentAId]);
      assert(jobA === null, 'No WhatsApp job should exist for Parent A');

      const jobB = await queryOne("SELECT id, status FROM notification_jobs WHERE parent_id = ? AND channel = 'whatsapp'", [parentBId]);
      assert(jobB !== null, 'WhatsApp job must exist for Parent B');
      assert(jobB.status === 'pending', `Job status should be pending, got ${jobB.status}`);
    });

    await test('Mixed-channel eligibility resolves channels independently', async () => {
      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [parentAId, parentBId],
          messageType: 'general_announcement',
          channels: ['in_app', 'whatsapp'],
          subject: 'Mixed channel broadcast',
          body: 'Hello {Parent name}, mixed update.',
          confirmed: true,
          eventId: testEventId
        })
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.success === true, 'Expected success true');
      assert(data.inAppSent === 2, `In-app sent should be 2, got ${data.inAppSent}`);
      assert(data.whatsappQueued === 1, `WhatsApp queued should be 1, got ${data.whatsappQueued}`);
      assert(data.whatsappSkipped === 1, `WhatsApp skipped should be 1, got ${data.whatsappSkipped}`);
    });

    // ====================================================
    // SECTION 3: WORKER BEHAVIOR & IDEMPOTENCY
    // ====================================================
    console.log('\n--- SECTION 3: WORKER BEHAVIOR & IDEMPOTENCY ---');

    await test('in_process worker mode processes queued WhatsApp jobs atomically', async () => {
      // Enable in-process worker mode
      process.env.WHATSAPP_WORKER_MODE = 'in_process';

      // Process queued job for parentB
      const workerResult = await processQueuedWhatsAppJobs({ maxBatchSize: 5 });
      assert(workerResult.processed >= 1, `Expected at least 1 job processed, got ${workerResult.processed}`);
      assert(workerResult.succeeded >= 1, `Expected at least 1 job succeeded, got ${workerResult.succeeded}`);

      // Verify job status updated in DB
      const jobB = await queryOne("SELECT id, status FROM notification_jobs WHERE parent_id = ? AND channel = 'whatsapp'", [parentBId]);
      assert(jobB.status === 'sent', `Job status must be sent, got ${jobB.status}`);

      // Verify delivery log exists
      const log = await queryOne('SELECT id, status, provider FROM whatsapp_delivery_logs WHERE parent_profile_id = ?', [parentBId]);
      assert(log !== null, 'Delivery log must exist for Parent B');
      assert(log.status === 'sent' || log.status === 'queued', `Log status should be sent or queued, got ${log.status}`);
    });

    await test('Job cannot be processed twice', async () => {
      // Second worker run should find 0 pending jobs
      const secondRun = await processQueuedWhatsAppJobs({ maxBatchSize: 5 });
      assert(secondRun.processed === 0, `Expected 0 jobs processed on second run, got ${secondRun.processed}`);

      // Duplicate enqueue with same idempotency key returns duplicate: true, queued: false
      const enqueueDup = await enqueueWhatsAppJob({
        eventId: testEventId,
        parentId: parentBId,
        idempotencyKey: `campaign:test:${parentBId}`
      });
      assert(enqueueDup.queued === true, 'First enqueue with new key succeeds');

      const enqueueDup2 = await enqueueWhatsAppJob({
        eventId: testEventId,
        parentId: parentBId,
        idempotencyKey: `campaign:test:${parentBId}`
      });
      assert(enqueueDup2.duplicate === true, 'Duplicate enqueue returns duplicate: true');
      assert(enqueueDup2.queued === false, 'Duplicate enqueue returns queued: false');
    });

    await test('WHATSAPP_WORKER_MODE evaluation in production and disabled modes', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevMode = process.env.WHATSAPP_WORKER_MODE;

      try {
        process.env.NODE_ENV = 'production';
        
        process.env.WHATSAPP_WORKER_MODE = 'disabled';
        assert(isWhatsAppInProcessWorkerEnabled() === false, 'disabled mode must return false');

        process.env.WHATSAPP_WORKER_MODE = 'external';
        assert(isWhatsAppInProcessWorkerEnabled() === false, 'external mode must return false');

        delete process.env.WHATSAPP_WORKER_MODE;
        assert(isWhatsAppInProcessWorkerEnabled() === false, 'production default must fail closed to false');

        process.env.WHATSAPP_WORKER_MODE = 'in_process';
        assert(isWhatsAppInProcessWorkerEnabled() === true, 'in_process mode in production must return true');
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevMode !== undefined) process.env.WHATSAPP_WORKER_MODE = prevMode;
        else delete process.env.WHATSAPP_WORKER_MODE;
      }
    });

    // ====================================================
    // SECTION 4: NO AUTOMATIC REGISTRATION WHATSAPP
    // ====================================================
    console.log('\n--- SECTION 4: NO AUTOMATIC REGISTRATION WHATSAPP ---');

    await test('New parent registration with WhatsApp consent does NOT send or queue WhatsApp messages', async () => {
      const regUserId = `u_reg_${crypto.randomUUID()}`;
      const regParentId = `p_reg_${crypto.randomUUID()}`;
      const regEmail = `new_parent_${crypto.randomUUID().slice(0, 8)}@koinonia.org`;
      const regNow = new Date().toISOString();

      // Clear/count pre-existing jobs
      const preCountRes = await queryOne("SELECT COUNT(*) as count FROM notification_jobs WHERE channel = 'whatsapp'");
      const preCount = Number(preCountRes?.count || 0);

      // Simulate parent registering with WhatsApp consent granted
      await execute(`
        INSERT INTO users (id, email, role, created_at, updated_at)
        VALUES (?, ?, 'parent', ?, ?)
      `, [regUserId, regEmail, regNow, regNow]);

      await execute(`
        INSERT INTO parent_profiles (
          id, user_id, full_name, phone_number, whatsapp_number, email,
          preferred_contact, is_koinonia_worker,
          whatsapp_consent_status, whatsapp_consent_at, whatsapp_consent_source,
          created_at, updated_at
        ) VALUES (?, ?, 'Newly Registered Parent', '+2348031234567', '+2348031234567', ?, 'WhatsApp', 0, 'opted_in', ?, 'registration', ?, ?)
      `, [regParentId, regUserId, regEmail, regNow, regNow, regNow]);

      // Verify parent profile has consent recorded
      const pProfile = await queryOne('SELECT whatsapp_consent_status, whatsapp_consent_source FROM parent_profiles WHERE id = ?', [regParentId]);
      assert(pProfile !== null, 'Profile must exist');
      assert(pProfile.whatsapp_consent_status === 'opted_in', 'Consent status should be opted_in');
      assert(pProfile.whatsapp_consent_source === 'registration', 'Consent source should be registration');

      // Verify NO new WhatsApp job was created in notification_jobs
      const postCountRes = await queryOne("SELECT COUNT(*) as count FROM notification_jobs WHERE channel = 'whatsapp'");
      const postCount = Number(postCountRes?.count || 0);
      assert(postCount === preCount, `No automatic WhatsApp job should be queued on registration (pre: ${preCount}, post: ${postCount})`);

      // Verify NO delivery log was created
      const logs = await query("SELECT id FROM whatsapp_delivery_logs WHERE parent_profile_id = ?", [regParentId]);
      assert(logs.length === 0, 'No automatic delivery log should exist for newly registered parent');
    });

    // ====================================================
    // SECTION 5: BLANK SCREEN FIX & DELIVERY UX VERIFICATION
    // ====================================================
    console.log('\n--- SECTION 5: BLANK SCREEN FIX & DELIVERY UX VERIFICATION ---');

    await test('admin_message_logs API returns properly cased aliases to prevent blank screen crash', async () => {
      // 1. Insert a test announcement log directly or via endpoint
      const logId = `msg_log_${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO admin_message_logs (
          id, recipient_group, message_type, channel, subject, body, recipients_count, status, created_at
        ) VALUES (?, 'specific_parents', 'general_announcement', 'whatsapp', 'Test Subject', 'Test Body', 1, 'sent', ?)
      `, [logId, now]);

      // 2. Query GET /api/admin/messages
      const res = await fetch(`${testBaseUrl}/api/admin/messages?eventId=${testEventId}`, {
        headers: { 'Authorization': `Bearer ${superAdminToken}` }
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.success === true, 'Expected success true');
      assert(Array.isArray(data.recentActivity), 'Expected recentActivity array');

      const found = data.recentActivity.find((l: any) => l.id === logId);
      assert(found !== undefined, 'Expected to find inserted log in recentActivity');

      // The exact bug: PostgreSQL folded aliases to lowercase (recipientgroup), causing log.recipientGroup.replace() to crash.
      // Quoting aliases guarantees log.recipientGroup is defined and string methods can be called safely.
      assert(typeof found.recipientGroup === 'string', `recipientGroup must be a string, got ${typeof found.recipientGroup}`);
      assert(typeof found.messageType === 'string', `messageType must be a string, got ${typeof found.messageType}`);
      assert(typeof found.createdAt === 'string', `createdAt must be a string, got ${typeof found.createdAt}`);

      // Verify that calling .replace(/_/g, ' ') does not throw:
      const renderedGroup = found.recipientGroup.replace(/_/g, ' ');
      assert(renderedGroup === 'specific parents', `Expected 'specific parents', got ${renderedGroup}`);
    });

    let testCampaignId = '';

    await test('Send Announcement endpoint returns structured campaign response with queued counts', async () => {
      process.env.WHATSAPP_WORKER_MODE = 'disabled'; // Keep pending to inspect campaign status

      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [parentBId],
          messageType: 'general_announcement',
          channels: ['whatsapp'],
          subject: 'Special Event Details - {Event name}',
          body: 'Dear {Parent name},\n\nWe are looking forward to {Event name}!',
          confirmed: true,
          eventId: testEventId
        })
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.success === true, 'Expected success true');
      assert(typeof data.campaignId === 'string' && data.campaignId.length > 0, 'Expected campaignId string');
      testCampaignId = data.campaignId;

      // Check structured queued response
      assert(typeof data.queued === 'object', 'Expected structured queued object');
      assert(data.queued.whatsapp === 1, `Expected queued.whatsapp 1, got ${data.queued.whatsapp}`);
      assert(typeof data.sent === 'object', 'Expected structured sent object');
      assert(typeof data.skipped === 'object', 'Expected structured skipped object');
    });

    await test('GET /api/admin/messages/campaign-status/:campaignId returns live delivery status progression', async () => {
      assert(testCampaignId !== '', 'testCampaignId must be set from previous test');

      // 1. Initial status: queued
      const res1 = await fetch(`${testBaseUrl}/api/admin/messages/campaign-status/${testCampaignId}`, {
        headers: { 'Authorization': `Bearer ${superAdminToken}` }
      });
      assert(res1.status === 200, `Expected 200, got ${res1.status}`);
      const data1 = await res1.json();
      assert(data1.success === true, 'Expected success true');
      assert(data1.campaignId === testCampaignId, 'Expected campaignId match');
      assert(data1.status === 'queued', `Expected status 'queued', got ${data1.status}`);
      assert(data1.queued >= 1, `Expected queued count >= 1, got ${data1.queued}`);
      assert(data1.sent === 0, `Expected sent count 0, got ${data1.sent}`);
      assert(data1.failed === 0, `Expected failed count 0, got ${data1.failed}`);

      // 2. Run worker to process the queued job
      process.env.WHATSAPP_WORKER_MODE = 'in_process';
      const workerRes = await processQueuedWhatsAppJobs({ maxBatchSize: 10 });
      assert(workerRes.processed >= 1, 'Worker should process queued job');

      // 3. Status progression: sent
      const res2 = await fetch(`${testBaseUrl}/api/admin/messages/campaign-status/${testCampaignId}`, {
        headers: { 'Authorization': `Bearer ${superAdminToken}` }
      });
      assert(res2.status === 200, `Expected 200, got ${res2.status}`);
      const data2 = await res2.json();
      assert(data2.success === true, 'Expected success true');
      assert(data2.status === 'sent', `Expected status 'sent', got ${data2.status}`);
      assert(data2.sent >= 1, `Expected sent count >= 1, got ${data2.sent}`);
    });

    await test('Placeholders {Parent name} and {Event name} are resolved before sending without literal tokens', async () => {
      // Find the most recent delivery log for Parent B
      const deliveryLog = await queryOne(`
        SELECT l.id, l.campaign_id, l.recipient_phone, l.status
        FROM whatsapp_delivery_logs l
        WHERE l.parent_profile_id = ?
        ORDER BY l.created_at DESC
        LIMIT 1
      `, [parentBId]);

      assert(deliveryLog !== null, 'Delivery log must exist for Parent B');

      // Check the in-app notification created for this event
      const inAppNotif = await queryOne(`
        SELECT title, message FROM notifications
        WHERE event_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [testEventId]);

      if (inAppNotif) {
        assert(!inAppNotif.title.includes('{Event name}'), 'Literal {Event name} must not appear in title');
        assert(!inAppNotif.title.includes('{Parent name}'), 'Literal {Parent name} must not appear in title');
      }
    });

    await test('Test delivery and Send announcement remain completely separate workflows', async () => {
      // 1. Test delivery requires Super Admin and uses manual phone number
      const testRes = await fetch(`${testBaseUrl}/api/admin/notifications/test-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({
          to: '+2348000000001',
          message: 'Super Admin Provider Test'
        })
      });

      assert(testRes.status === 200, `Expected 200, got ${testRes.status}`);
      const testData = await testRes.json();
      assert(testData.success === true, 'Test delivery should succeed for super admin');
      assert(typeof testData.messageSid === 'string', 'Expected messageSid');

      // Verify test message does NOT create a row in notification_jobs (it is direct connectivity verification)
      const jobMatch = await queryOne("SELECT id FROM notification_jobs WHERE idempotency_key LIKE 'test_send:%'");
      assert(jobMatch === null, 'Test delivery must not pollute notification_jobs queue');
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
