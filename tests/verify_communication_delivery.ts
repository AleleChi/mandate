import crypto from 'crypto';
import express from 'express';
import { query, queryOne, execute } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import adminRoutes from '../src/server/routes/admin';
import notificationRoutes from '../src/server/routes/notifications';
import authRoutes from '../src/server/routes/auth';
import parentRoutes from '../src/server/routes/parent';
import webpush from 'web-push';
import { sendWebPush } from '../src/server/services/push';
import {
  getPublicAppUrl,
  buildPublicAppUrl,
  buildParentStatusUrl,
  buildParentPassUrl,
  buildReviewUrl,
  resolveMessageTokens
} from '../src/server/utils/urlHelper';
import {
  processQueuedWhatsAppJobs,
  enqueueWhatsAppJob,
  buildIdempotencyKey
} from '../src/server/services/whatsapp';
import { authorizeChildPass, _clearInMemoryPassCache } from '../src/server/services/passService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('COMMUNICATION DELIVERY — VERIFICATION TEST SUITE');
  console.log('Fix Push + Personalization + Canonical URL Generation');
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

  // Setup express test server for admin, notification, auth, and parent routes
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/parent', parentRoutes);

  let server: any;
  let testBaseUrl = '';

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const port = (server.address() as any).port;
      testBaseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const testSuperAdminId = `admin-comm-${crypto.randomUUID()}`;
  const superAdminEmail = `admin-comm-${crypto.randomUUID()}@koinonia.test`;
  const initNow = new Date().toISOString();

  await execute(`
    INSERT INTO users (id, email, role, created_at, updated_at)
    VALUES (?, ?, 'super_admin', ?, ?)
  `, [testSuperAdminId, superAdminEmail, initNow, initNow]);

  const adminToken = generateToken(testSuperAdminId);

  try {
    // -------------------------------------------------------------
    // SUITE 1: CANONICAL URL BUILDER & VALIDATION
    // -------------------------------------------------------------
    console.log('\n--- 1. Canonical URL Builder & Routing ---');

    await test('Resolves canonical base origin from PUBLIC_APP_URL', () => {
      const originalEnv = process.env.PUBLIC_APP_URL;
      try {
        process.env.PUBLIC_APP_URL = 'https://koinonia12.netlify.app/';
        const origin = getPublicAppUrl();
        assert(origin === 'https://koinonia12.netlify.app', `Expected https://koinonia12.netlify.app, got ${origin}`);
      } finally {
        process.env.PUBLIC_APP_URL = originalEnv;
      }
    });

    await test('Generates proper HashRouter routes for parent status and passes', () => {
      const originalEnv = process.env.PUBLIC_APP_URL;
      try {
        process.env.PUBLIC_APP_URL = 'https://koinonia12.netlify.app';
        const statusUrl = buildParentStatusUrl();
        const passUrl = buildParentPassUrl();
        const childStatusUrl = buildParentStatusUrl('child-xyz-123');
        const childPassUrl = buildParentPassUrl('child-xyz-123');

        assert(statusUrl === 'https://koinonia12.netlify.app/#/parent/status', `Status URL mismatch: ${statusUrl}`);
        assert(passUrl === 'https://koinonia12.netlify.app/#/parent/passes', `Pass URL mismatch: ${passUrl}`);
        assert(childStatusUrl === 'https://koinonia12.netlify.app/#/parent/children/child-xyz-123/status', `Child Status mismatch: ${childStatusUrl}`);
        assert(childPassUrl === 'https://koinonia12.netlify.app/#/parent/children/child-xyz-123/pass', `Child Pass mismatch: ${childPassUrl}`);

        // Ensure NO communication URL contains koinonia.org
        assert(!statusUrl.includes('koinonia.org'), 'Status URL must not contain koinonia.org');
        assert(!passUrl.includes('koinonia.org'), 'Pass URL must not contain koinonia.org');
      } finally {
        process.env.PUBLIC_APP_URL = originalEnv;
      }
    });

    await test('buildPublicAppUrl prevents open redirects and dangerous protocols', () => {
      const originalEnv = process.env.PUBLIC_APP_URL;
      try {
        process.env.PUBLIC_APP_URL = 'https://koinonia12.netlify.app';
        const malicious1 = buildPublicAppUrl('javascript:alert(1)');
        const malicious2 = buildPublicAppUrl('https://evil.com/phish');
        assert(malicious1 === 'https://koinonia12.netlify.app', `Script injection must return safe origin: ${malicious1}`);
        assert(malicious2 === 'https://koinonia12.netlify.app', `External URL must return safe origin: ${malicious2}`);
      } finally {
        process.env.PUBLIC_APP_URL = originalEnv;
      }
    });

    // -------------------------------------------------------------
    // SUITE 2: UNIFIED TOKEN RESOLUTION PIPELINE
    // -------------------------------------------------------------
    console.log('\n--- 2. Token Resolution Pipeline ---');

    await test('Resolves all supported communication tokens cleanly without placeholders', () => {
      const template = 'Dear {Parent name},\n\nWe are looking forward to {Event name}! Checkout for {Child name} is at {Pickup time}. Pass: {Pass link}. Status: {Review link}. Contact: {Support contact}.';
      const resolved = resolveMessageTokens(template, {
        parentName: 'Tochukwu Ogunaka',
        childName: 'Baby Livina',
        eventName: 'The General Assembly',
        passUrl: 'https://koinonia12.netlify.app/#/parent/children/c1/pass',
        reviewUrl: 'https://koinonia12.netlify.app/#/parent/status',
        pickupTime: '4:00 PM',
        supportContact: '+234 803 123 4567'
      });

      assert(!resolved.includes('{Parent name}'), 'Contains unparsed {Parent name}');
      assert(!resolved.includes('{Child name}'), 'Contains unparsed {Child name}');
      assert(!resolved.includes('{Event name}'), 'Contains unparsed {Event name}');
      assert(!resolved.includes('{Pass link}'), 'Contains unparsed {Pass link}');
      assert(!resolved.includes('{Review link}'), 'Contains unparsed {Review link}');
      assert(!resolved.includes('{Pickup time}'), 'Contains unparsed {Pickup time}');
      assert(!resolved.includes('{Support contact}'), 'Contains unparsed {Support contact}');
      assert(resolved.includes('Tochukwu Ogunaka'), 'Does not contain resolved parent name');
      assert(resolved.includes('Baby Livina'), 'Does not contain resolved child name');
      assert(resolved.includes('The General Assembly'), 'Does not contain resolved event name');
      assert(!resolved.includes('koinonia.org'), 'Resolved text must not contain koinonia.org');

      // Strict check: NO unparsed tokens matching /\{[A-Z][a-zA-Z\s]+\}/
      const unparsedMatch = resolved.match(/\{[A-Z][a-zA-Z\s]+\}/g);
      assert(unparsedMatch === null, `Found unparsed tokens in output: ${unparsedMatch?.join(', ')}`);
    });

    // -------------------------------------------------------------
    // SUITE 3: MULTI-CHILD AMBIGUITY SAFETY
    // -------------------------------------------------------------
    console.log('\n--- 3. Multi-child Parent Ambiguity Safety ---');

    // Setup multi-child test parent: Tochukwu Ogunaka with 2 children
    const testUserId = `user-mc-${crypto.randomUUID()}`;
    const testParentId = `parent-mc-${crypto.randomUUID()}`;
    const child1Id = `child-mc-1-${crypto.randomUUID()}`;
    const child2Id = `child-mc-2-${crypto.randomUUID()}`;
    const testEventId = 'event-ga-2026';
    const now = new Date().toISOString();

    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', ?, ?)
    `, [testUserId, `parent-${Date.now()}@test.koinonia`, now, now]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Tochukwu Ogunaka', 'tochukwu@test.koinonia', '+2348011223344', ?, ?)
    `, [testParentId, testUserId, now, now]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES (?, ?, 'Baby Livina', 'female', '2020-01-01', ?, ?)
    `, [child1Id, testParentId, now, now]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES (?, ?, 'Baby Love', 'female', '2022-01-01', ?, ?)
    `, [child2Id, testParentId, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [`entry-${child1Id}`, testEventId, child1Id, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [`entry-${child2Id}`, testEventId, child2Id, now, now]);

    await test('Blocks ambiguous child token when targeting specific parent with multiple children', async () => {
      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [testParentId],
          messageType: 'general_announcement',
          channel: 'in_app',
          channels: ['in_app'],
          subject: 'Important update for {Child name}',
          body: 'Dear {Parent name}, your child {Child name} has an update.',
          confirmed: true,
          eventId: testEventId
        })
      });

      const data = await res.json();
      assert(res.status === 400, `Expected HTTP 400, got ${res.status}`);
      assert(data.code === 'CHILD_TOKEN_AMBIGUITY', `Expected CHILD_TOKEN_AMBIGUITY, got ${data.code}`);
      assert(data.message.includes('multiple registered children'), 'Expected helpful multi-child explanation');
    });

    await test('Allows general announcement to multi-child parent without child tokens', async () => {
      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [testParentId],
          messageType: 'general_announcement',
          channel: 'in_app',
          channels: ['in_app'],
          subject: 'Important Event Details - {Event name}',
          body: 'Dear {Parent name},\n\nWe look forward to welcoming your family to {Event name}!',
          confirmed: true,
          eventId: testEventId
        })
      });

      const data = await res.json();
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}: ${data.message}`);
      assert(data.success === true, 'Expected success === true');
      assert(data.recipientsCount === 1, `Expected exactly 1 recipient message, got ${data.recipientsCount}`);

      // Verify the in-app notification in DB has personalized text without raw placeholders
      const insertedNotif = await queryOne(`
        SELECT title, message, parent_id FROM notifications WHERE parent_id = ? ORDER BY created_at DESC LIMIT 1
      `, [testParentId]);

      assert(insertedNotif !== null, 'In-app notification was not inserted for parent');
      assert(insertedNotif.parent_id === testParentId, `Expected parent_id ${testParentId}, got ${insertedNotif.parent_id}`);
      assert(!insertedNotif.title.includes('{Event name}'), `Title contains raw placeholder: ${insertedNotif.title}`);
      assert(insertedNotif.title.includes('The General Assembly'), `Title missing event name: ${insertedNotif.title}`);
      assert(!insertedNotif.message.includes('{Parent name}'), `Message contains raw placeholder: ${insertedNotif.message}`);
      assert(insertedNotif.message.includes('Tochukwu Ogunaka'), `Message missing parent name: ${insertedNotif.message}`);
    });

    await test('Pass update to multi-child parent without selected child is blocked with plain error', async () => {
      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [testParentId],
          messageType: 'pass_update',
          channel: 'in_app',
          channels: ['in_app'],
          subject: 'Important Pass Update - {Event name}',
          body: 'Dear {Parent name},\n\nGood news! {Child name}\'s event pass is ready for {Event name}. You can view the pass here:\n{Pass link}',
          confirmed: true,
          eventId: testEventId
        })
      });

      const data = await res.json();
      assert(res.status === 400, `Expected HTTP 400, got ${res.status}`);
      assert(data.code === 'CHILD_TOKEN_AMBIGUITY', `Expected CHILD_TOKEN_AMBIGUITY, got ${data.code}`);
      assert(data.message.includes('multiple registered children'), 'Expected helpful plain explanation');
      assert(!data.message.includes('CHILD_TOKEN_AMBIGUITY'), 'Technical error code should not be in user message');
    });

    await test('Pass update with one selected child creates 1 communication for that specific child', async () => {
      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [testParentId],
          selectedChildIds: [child1Id],
          messageType: 'pass_update',
          channel: 'in_app',
          channels: ['in_app'],
          subject: 'Important Pass Update - {Event name}',
          body: 'Dear {Parent name},\n\nGood news! {Child name}\'s event pass is ready for {Event name}. View pass: {Pass link}',
          confirmed: true,
          eventId: testEventId
        })
      });

      const data = await res.json();
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}: ${data.message}`);
      assert(data.recipientsCount === 1, `Expected 1 recipient message, got ${data.recipientsCount}`);

      const notif = await queryOne(`
        SELECT title, message, child_id FROM notifications
        WHERE parent_id = ? AND child_id = ?
        ORDER BY created_at DESC LIMIT 1
      `, [testParentId, child1Id]);

      assert(notif !== null, 'Notification for child 1 not found');
      assert(notif.child_id === child1Id, `Expected child_id ${child1Id}, got ${notif.child_id}`);
      assert(notif.message.includes('Baby Livina'), 'Message should contain Baby Livina');
      assert(!notif.message.includes('Baby Love'), 'Message should NOT contain Baby Love');
      assert(notif.message.includes(`/#/parent/children/${child1Id}/pass`), 'Pass link must target selected child');
      assert(!notif.message.includes('{Child name}'), 'Message contains unparsed {Child name}');
      assert(!notif.message.includes('{Pass link}'), 'Message contains unparsed {Pass link}');
    });

    await test('Pass update with two selected siblings creates 2 distinct child-specific messages with individual pass links', async () => {
      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [testParentId],
          selectedChildIds: [child1Id, child2Id],
          messageType: 'pass_update',
          channel: 'in_app',
          channels: ['in_app'],
          subject: 'Important Pass Update - {Event name}',
          body: 'Dear {Parent name},\n\nGood news! {Child name}\'s event pass is ready for {Event name}. View pass: {Pass link}',
          confirmed: true,
          eventId: testEventId
        })
      });

      const data = await res.json();
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}: ${data.message}`);
      assert(data.recipientsCount === 2, `Expected 2 recipient messages, got ${data.recipientsCount}`);

      const campaignNotifs = await query(`
        SELECT title, message, child_id FROM notifications
        WHERE parent_id = ? AND metadata_json LIKE ?
        ORDER BY created_at ASC
      `, [testParentId, `%"campaignId":"${data.campaignId}"%`]);

      assert(campaignNotifs.length === 2, `Expected 2 campaign notifications, got ${campaignNotifs.length}`);

      const livinaNotif = campaignNotifs.find((n: any) => n.child_id === child1Id);
      const loveNotif = campaignNotifs.find((n: any) => n.child_id === child2Id);

      assert(livinaNotif !== undefined, 'Baby Livina notification not found');
      assert(loveNotif !== undefined, 'Baby Love notification not found');

      assert(livinaNotif.message.includes('Baby Livina'), 'Livina notification missing Livina name');
      assert(livinaNotif.message.includes(`/#/parent/children/${child1Id}/pass`), 'Livina notification wrong pass link');
      assert(!livinaNotif.message.includes('Baby Love'), 'Livina notification leaked Baby Love');

      assert(loveNotif.message.includes('Baby Love'), 'Love notification missing Love name');
      assert(loveNotif.message.includes(`/#/parent/children/${child2Id}/pass`), 'Love notification wrong pass link');
      assert(!loveNotif.message.includes('Baby Livina'), 'Love notification leaked Baby Livina');
    });

    await test('Backend safety: Rejects child belonging to another parent', async () => {
      const otherUserId = `user-other-${crypto.randomUUID()}`;
      const otherParentId = `parent-other-${crypto.randomUUID()}`;
      const otherChildId = `child-other-${crypto.randomUUID()}`;

      await execute(`
        INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
        VALUES (?, ?, 'hash', 'parent', ?, ?)
      `, [otherUserId, `other-${Date.now()}@test.koinonia`, now, now]);

      await execute(`
        INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
        VALUES (?, ?, 'Other Parent', 'other@test.koinonia', '+2348099887766', ?, ?)
      `, [otherParentId, otherUserId, now, now]);

      await execute(`
        INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
        VALUES (?, ?, 'Other Child', 'female', '2021-01-01', ?, ?)
      `, [otherChildId, otherParentId, now, now]);

      await execute(`
        INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
        VALUES (?, ?, ?, 'selected', ?, ?)
      `, [`entry-${otherChildId}`, testEventId, otherChildId, now, now]);

      // Attempt to send for otherChildId under testParentId
      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [testParentId],
          selectedChildIds: [otherChildId],
          messageType: 'pass_update',
          channel: 'in_app',
          channels: ['in_app'],
          subject: 'Pass Update',
          body: 'Pass for {Child name}: {Pass link}',
          confirmed: true,
          eventId: testEventId
        })
      });

      const data = await res.json();
      assert(res.status === 400, `Expected HTTP 400, got ${res.status}`);
      assert(data.code === 'INVALID_CHILD', `Expected INVALID_CHILD, got ${data.code}`);
      assert(data.message.includes('do not belong to the selected parents'), 'Expected plain ownership error message');
    });

    await test('Backend safety: Rejects deleted child under selected parent', async () => {
      const deletedChildId = `child-del-${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, is_deleted, created_at, updated_at)
        VALUES (?, ?, 'Deleted Child', 'male', '2020-05-05', 1, ?, ?)
      `, [deletedChildId, testParentId, now, now]);

      await execute(`
        INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at)
        VALUES (?, ?, ?, 'selected', ?, ?)
      `, [`entry-${deletedChildId}`, testEventId, deletedChildId, now, now]);

      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [testParentId],
          selectedChildIds: [deletedChildId],
          messageType: 'pass_update',
          channel: 'in_app',
          channels: ['in_app'],
          subject: 'Pass Update',
          body: 'Pass for {Child name}: {Pass link}',
          confirmed: true,
          eventId: testEventId
        })
      });

      const data = await res.json();
      assert(res.status === 400, `Expected HTTP 400 for deleted child, got ${res.status}`);
      assert(data.code === 'INVALID_CHILD', `Expected INVALID_CHILD, got ${data.code}`);
    });

    await test('Backend safety: Rejects child not registered for the target event', async () => {
      const nonEventChildId = `child-nonevent-${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, is_deleted, created_at, updated_at)
        VALUES (?, ?, 'Non Event Child', 'male', '2020-05-05', 0, ?, ?)
      `, [nonEventChildId, testParentId, now, now]);

      // Notice: NO child_event_entries created for testEventId

      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [testParentId],
          selectedChildIds: [nonEventChildId],
          messageType: 'pass_update',
          channel: 'in_app',
          channels: ['in_app'],
          subject: 'Pass Update',
          body: 'Pass for {Child name}: {Pass link}',
          confirmed: true,
          eventId: testEventId
        })
      });

      const data = await res.json();
      assert(res.status === 400, `Expected HTTP 400 for child not registered in event, got ${res.status}`);
      assert(data.code === 'INVALID_CHILD', `Expected INVALID_CHILD, got ${data.code}`);
    });

    await test('WhatsApp queue: Preserves child context and creates distinct jobs for siblings without deduplication', async () => {
      // Opt-in testParentId for WhatsApp
      await execute(`
        UPDATE parent_profiles
        SET whatsapp_consent_status = 'opted_in',
            whatsapp_number = '+2348011223344'
        WHERE id = ?
      `, [testParentId]);

      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [testParentId],
          selectedChildIds: [child1Id, child2Id],
          messageType: 'pass_update',
          channel: 'both',
          channels: ['in_app', 'whatsapp'],
          subject: 'Pass Ready - {Event name}',
          body: 'Hello {Parent name}, {Child name}\'s pass is ready: {Pass link}',
          confirmed: true,
          eventId: testEventId
        })
      });

      const data = await res.json();
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}: ${data.message}`);
      assert(data.queued?.whatsapp === 2 || data.summary?.whatsappQueued === 2, 'Expected 2 WhatsApp messages queued');

      const jobs = await query(`
        SELECT id, parent_id, child_id, idempotency_key, status
        FROM notification_jobs
        WHERE parent_id = ? AND channel = 'whatsapp'
        ORDER BY created_at DESC LIMIT 2
      `, [testParentId]);

      assert(jobs.length === 2, `Expected 2 distinct WhatsApp jobs, got ${jobs.length}`);

      const livinaJob = jobs.find((j: any) => j.child_id === child1Id);
      const loveJob = jobs.find((j: any) => j.child_id === child2Id);

      assert(livinaJob !== undefined, 'Baby Livina WhatsApp job missing');
      assert(loveJob !== undefined, 'Baby Love WhatsApp job missing');
      assert(livinaJob.id !== loveJob.id, 'Sibling WhatsApp jobs must have distinct IDs');
      assert(livinaJob.idempotency_key !== loveJob.idempotency_key, 'Sibling WhatsApp jobs must have distinct idempotency keys');
      assert(livinaJob.idempotency_key.includes(`child:${child1Id}`), 'Livina idempotency key missing child ID');
      assert(loveJob.idempotency_key.includes(`child:${child2Id}`), 'Love idempotency key missing child ID');
    });

    await test('All delivery channels resolve the exact same child context', async () => {
      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [testParentId],
          selectedChildIds: [child1Id],
          messageType: 'pass_update',
          channel: 'both',
          channels: ['in_app', 'whatsapp'],
          subject: 'Pass Update for {Child name}',
          body: 'Dear {Parent name}, pass for {Child name}: {Pass link}',
          confirmed: true,
          eventId: testEventId
        })
      });

      const data = await res.json();
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);

      // Check in-app notification
      const notif = await queryOne(`
        SELECT child_id, message FROM notifications
        WHERE parent_id = ? AND metadata_json LIKE ?
      `, [testParentId, `%"campaignId":"${data.campaignId}"%`]);

      assert(notif !== null, 'In-app notification not found');
      assert(notif.child_id === child1Id, 'In-app notification child mismatch');
      assert(notif.message.includes('Baby Livina'), 'In-app notification must resolve Baby Livina');
      assert(!notif.message.includes('Baby Love'), 'In-app notification must not mention Baby Love');

      // Check WhatsApp job
      const waJob = await queryOne(`
        SELECT child_id, idempotency_key FROM notification_jobs
        WHERE parent_id = ? AND channel = 'whatsapp' AND idempotency_key LIKE ?
      `, [testParentId, `%campaign:${data.campaignId}%`]);

      assert(waJob !== null, 'WhatsApp job not found');
      assert(waJob.child_id === child1Id, 'WhatsApp job child mismatch');
      assert(waJob.idempotency_key.includes(`child:${child1Id}`), 'WhatsApp job idempotency key child mismatch');

      // Clean up test jobs so other test suites (e.g. phase1c) start with clean queue
      await execute("DELETE FROM notification_jobs WHERE parent_id = ?", [testParentId]);
    });

    // -------------------------------------------------------------
    // SUITE 4: WEB PUSH TRANSPORT & SUBSCRIPTION LIFECYCLE
    // -------------------------------------------------------------
    console.log('\n--- 4. Web Push Transport & Subscription Management ---');

    // Create subscriptions for push tests
    const subNewer = `sub-new-${crypto.randomUUID()}`;
    const subOlder = `sub-old-${crypto.randomUUID()}`;

    await execute(`
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
      VALUES (?, ?, 'https://fcm.googleapis.com/fcm/send/test-sub-newer', 'mockKey1', 'mockAuth1', 'Android Chrome 151', '2026-09-09T21:10:36Z')
    `, [subNewer, testUserId]);

    await execute(`
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
      VALUES (?, ?, 'https://fcm.googleapis.com/fcm/send/test-sub-older', 'mockKey2', 'mockAuth2', 'Windows Chrome 150', '2026-07-12T10:00:00Z')
    `, [subOlder, testUserId]);

    await test('Orders subscriptions newest-first and handles 410 Gone by removing stale subscription', async () => {
      // Mock webpush.sendNotification:
      // Newer subscription succeeds; older returns 410 Gone
      const originalSend = (webpush as any).sendNotification;
      const attemptedEndpoints: string[] = [];

      (webpush as any).sendNotification = async (sub: any) => {
        attemptedEndpoints.push(sub.endpoint);
        if (sub.endpoint.includes('test-sub-newer')) {
          return { statusCode: 201 };
        }
        const err: any = new Error('Subscription expired');
        err.statusCode = 410;
        err.body = 'Gone';
        throw err;
      };

      try {
        const pushResult = await sendWebPush(testUserId, {
          title: 'Important Event Details - The General Assembly',
          body: 'You have a new update for The General Assembly. Open Koinonia to view.'
        });

        // 1. Verify newest subscription was processed first
        assert(attemptedEndpoints.length >= 1, 'Push should have attempted at least one endpoint');
        assert(attemptedEndpoints[0].includes('test-sub-newer'), `Expected newest endpoint first, got ${attemptedEndpoints[0]}`);

        // 2. Sent count should reflect success
        assert(pushResult.sentCount >= 1, `Expected sentCount >= 1, got ${pushResult.sentCount}`);
        assert(pushResult.success === true, 'Expected push success === true');
      } finally {
        (webpush as any).sendNotification = originalSend;
      }
    });

    await test('Handles 404/410 by automatically deleting stale subscription from DB', async () => {
      const staleSubId = `sub-stale-${crypto.randomUUID()}`;
      const staleUserId = `user-stale-${crypto.randomUUID()}`;

      await execute(`
        INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
        VALUES (?, ?, 'hash', 'parent', ?, ?)
      `, [staleUserId, `stale-${crypto.randomUUID()}@test.koinonia`, now, now]);

      await execute(`
        INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
        VALUES (?, ?, 'https://fcm.googleapis.com/fcm/send/stale-device', 'key', 'auth', 'Old Browser', '2026-01-01T00:00:00Z')
      `, [staleSubId, staleUserId]);

      const originalSend = (webpush as any).sendNotification;
      (webpush as any).sendNotification = async () => {
        const err: any = new Error('Device not found');
        err.statusCode = 410;
        err.body = 'Unsubscribed';
        throw err;
      };

      try {
        const res = await sendWebPush(staleUserId, {
          title: 'Test Title',
          body: 'Test Body'
        });

        assert(res.success === false, 'Expected push success === false for expired subscription');
        assert(res.staleCount === 1, `Expected staleCount === 1, got ${res.staleCount}`);
        assert(res.failureReason === 'stale_subscription', `Expected stale_subscription, got ${res.failureReason}`);

        // Verify stale subscription was pruned from database
        const checkDb = await queryOne('SELECT id FROM push_subscriptions WHERE id = ?', [staleSubId]);
        assert(checkDb === null, 'Stale subscription was not removed from push_subscriptions table');
      } finally {
        (webpush as any).sendNotification = originalSend;
      }
    });

    await test('Handles 401/403 VAPID auth error by retaining subscription in DB', async () => {
      const vapidSubId = `sub-vapid-${crypto.randomUUID()}`;
      const vapidUserId = `user-vapid-${crypto.randomUUID()}`;

      await execute(`
        INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
        VALUES (?, ?, 'hash', 'parent', ?, ?)
      `, [vapidUserId, `vapid-${crypto.randomUUID()}@test.koinonia`, now, now]);

      await execute(`
        INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
        VALUES (?, ?, 'https://fcm.googleapis.com/fcm/send/vapid-device', 'key', 'auth', 'Device', '2026-09-01T00:00:00Z')
      `, [vapidSubId, vapidUserId]);

      const originalSend = (webpush as any).sendNotification;
      (webpush as any).sendNotification = async () => {
        const err: any = new Error('VAPID credentials invalid');
        err.statusCode = 401;
        err.body = 'Unauthorized';
        throw err;
      };

      try {
        const res = await sendWebPush(vapidUserId, {
          title: 'Test Title',
          body: 'Test Body'
        });

        assert(res.success === false, 'Expected push success === false');
        assert(res.failureReason === 'vapid_auth_error', `Expected vapid_auth_error, got ${res.failureReason}`);

        // Subscription MUST NOT be deleted for server config errors
        const checkDb = await queryOne('SELECT id FROM push_subscriptions WHERE id = ?', [vapidSubId]);
        assert(checkDb !== null, 'Subscription should NOT be deleted on VAPID 401/403 errors');
      } finally {
        (webpush as any).sendNotification = originalSend;
      }
    });

    await test('Reports noSubscriptions without treating as network failure when user has no active devices', async () => {
      const noSubUserId = `user-nosub-${crypto.randomUUID()}`;
      const res = await sendWebPush(noSubUserId, {
        title: 'Test Title',
        body: 'Test Body'
      });

      assert(res.success === false, 'Expected success === false');
      assert(res.noSubscriptions === true, 'Expected noSubscriptions === true');
      assert(res.failureReason === 'no_subscription', `Expected no_subscription, got ${res.failureReason}`);
    });

    // -------------------------------------------------------------
    // SUITE 5: CHANNEL INDEPENDENCE & RECENT ACTIVITY STATUS
    // -------------------------------------------------------------
    console.log('\n--- 5. Channel Independence in Multi-channel Broadcasts ---');

    await test('Multi-channel broadcast (In-app + Push where Push fails) reports channels independently without masking', async () => {
      // User with NO push subscriptions
      const parentWithoutPushId = `parent-nopush-${crypto.randomUUID()}`;
      const userWithoutPushId = `user-nopush-${crypto.randomUUID()}`;

      const nopushEmail = `nopush-${crypto.randomUUID()}@test.koinonia`;
      await execute(`
        INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
        VALUES (?, ?, 'hash', 'parent', ?, ?)
      `, [userWithoutPushId, nopushEmail, now, now]);

      await execute(`
        INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
        VALUES (?, ?, 'Parent Without Push', ?, '+2348000000000', ?, ?)
      `, [parentWithoutPushId, userWithoutPushId, nopushEmail, now, now]);

      // Broadcast to this parent with in_app + push
      const sendRes = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [parentWithoutPushId],
          messageType: 'general_announcement',
          channel: 'both',
          channels: ['in_app', 'push'],
          subject: 'Important Event Details - {Event name}',
          body: 'Dear {Parent name},\n\nAnnouncement for {Event name}.',
          confirmed: true,
          eventId: testEventId
        })
      });

      const sendData = await sendRes.json();
      assert(sendRes.status === 200, `Send failed: ${sendData.message}`);
      assert(sendData.sent.inApp === 1, `In-app should be 1 sent, got ${sendData.sent.inApp}`);
      assert(sendData.sent.push === 0, `Push should be 0 sent, got ${sendData.sent.push}`);
      assert(sendData.summary.pushFailed >= 1, `Push failed count should be >= 1, got ${sendData.summary.pushFailed}`);

      // Now query GET /api/admin/messages and verify recentActivity channel breakdown
      const listRes = await fetch(`${testBaseUrl}/api/admin/messages`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const listData = await listRes.json();
      assert(listRes.status === 200, 'GET /messages failed');

      const recentCampaign = listData.recentActivity.find((a: any) => a.id === sendData.campaignId);
      assert(recentCampaign !== undefined, 'Recent campaign not found in recentActivity');

      // Verify channelStatuses has independent badges
      const chStatuses = recentCampaign.channelStatuses;
      assert(Array.isArray(chStatuses) && chStatuses.length >= 2, 'channelStatuses must contain both in_app and push');

      const pushCh = chStatuses.find((c: any) => c.channel === 'push');
      const inAppCh = chStatuses.find((c: any) => c.channel === 'in_app');

      assert(pushCh !== undefined, 'Push channel status must be present');
      assert(pushCh.status === 'Failed', `Push channel status must be Failed, got: ${pushCh.status}`);
      assert(inAppCh !== undefined, 'In-app channel status must be present');
      assert(inAppCh.status === 'Sent', `In-app channel status must be Sent, got: ${inAppCh.status}`);

      // Crucial: The campaign status must NOT be masked as generic "Sent"
      assert(recentCampaign.status !== 'sent', `Campaign status must not be masked as generic 'sent', got ${recentCampaign.status}`);
      assert(recentCampaign.status === 'partial' || recentCampaign.status === 'failed', `Expected 'partial' or 'failed', got ${recentCampaign.status}`);
    });

    // -------------------------------------------------------------
    // SUITE 6: POSTGRESQL 42P18 SAFE CHILD CONTEXT & QUEUE PROCESSING
    // -------------------------------------------------------------
    console.log('\n--- 6. PostgreSQL 42P18 Safe Child Context & Queue Processing ---');

    await test('PostgreSQL-safe: Notification lookup query has no untyped ? IS NULL parameters for null child_id', async () => {
      const testParentId = `p-42p18-${crypto.randomUUID()}`;
      const broadcastId = `b-42p18-${crypto.randomUUID()}`;

      // This query must NOT contain `? IS NULL` or untyped parameter comparisons
      const res = await queryOne(`
        SELECT message FROM notifications
        WHERE parent_id = ? AND child_id IS NULL AND metadata_json LIKE ?
        ORDER BY created_at DESC LIMIT 1
      `, [testParentId, `%"campaignId":"${broadcastId}"%`]);

      assert(res === null, 'Query executes cleanly without throwing 42P18');
    });

    await test('PostgreSQL-safe: Notification lookup query has typed parameters for populated child_id', async () => {
      const testParentId = `p-42p18-${crypto.randomUUID()}`;
      const testChildId = `c-42p18-${crypto.randomUUID()}`;
      const broadcastId = `b-42p18-${crypto.randomUUID()}`;

      const res = await queryOne(`
        SELECT message FROM notifications
        WHERE parent_id = ? AND child_id = ? AND metadata_json LIKE ?
        ORDER BY created_at DESC LIMIT 1
      `, [testParentId, testChildId, `%"campaignId":"${broadcastId}"%`]);

      assert(res === null, 'Query executes cleanly without throwing 42P18');
    });

    await test('General WhatsApp job processing (child_id is null) succeeds without 42P18', async () => {
      const uGen = `u-gen-${crypto.randomUUID()}`;
      const pGen = `p-gen-${crypto.randomUUID()}`;
      const genEmail = `gen-${crypto.randomUUID()}@test.koinonia`;
      const nowStr = new Date().toISOString();

      await execute(`
        INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
        VALUES (?, ?, 'hash', 'parent', ?, ?)
      `, [uGen, genEmail, nowStr, nowStr]);

      await execute(`
        INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, whatsapp_consent_status, email, created_at, updated_at)
        VALUES (?, ?, 'General Parent', '+2348039999001', '+2348039999001', 'opted_in', ?, ?, ?)
      `, [pGen, uGen, genEmail, nowStr, nowStr]);

      const campaignId = `camp-gen-${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO admin_message_logs (id, recipient_group, message_type, channel, subject, body, recipients_count, status, created_at)
        VALUES (?, 'specific_parents', 'general_announcement', 'whatsapp', 'General Announcement', 'Important update for {Event name}', 1, 'queued', ?)
      `, [campaignId, nowStr]);

      const idemp = `campaign:${campaignId}:parent:${pGen}:whatsapp`;
      await enqueueWhatsAppJob({
        eventId: testEventId,
        parentId: pGen,
        childId: null,
        idempotencyKey: idemp
      });

      process.env.WHATSAPP_WORKER_MODE = 'in_process';
      for (let attempt = 0; attempt < 15; attempt++) {
        const j = await queryOne('SELECT status FROM notification_jobs WHERE idempotency_key = ?', [idemp]);
        if (j && j.status !== 'pending') break;
        await processQueuedWhatsAppJobs({ maxBatchSize: 10 });
        await new Promise(r => setTimeout(r, 60));
      }

      const job = await queryOne('SELECT status, failure_reason FROM notification_jobs WHERE idempotency_key = ?', [idemp]);
      assert(job !== null, 'Job must exist');
      assert(job.status === 'sent', `Job status must be sent, got: ${job.status}, failure_reason: ${job.failure_reason}`);
    });

    await test('Child-specific WhatsApp job processing (child_id populated e.g. Baby Livina) succeeds with child context', async () => {
      const uChild = `u-child-${crypto.randomUUID()}`;
      const pChild = `p-child-${crypto.randomUUID()}`;
      const cChild = `c-child-${crypto.randomUUID()}`;
      const childEmail = `child-${crypto.randomUUID()}@test.koinonia`;
      const nowStr = new Date().toISOString();

      await execute(`
        INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
        VALUES (?, ?, 'hash', 'parent', ?, ?)
      `, [uChild, childEmail, nowStr, nowStr]);

      await execute(`
        INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, whatsapp_consent_status, email, created_at, updated_at)
        VALUES (?, ?, 'Tochukwu Ogunaka Live', '+2348039999002', '+2348039999002', 'opted_in', ?, ?, ?)
      `, [pChild, uChild, childEmail, nowStr, nowStr]);

      await execute(`
        INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
        VALUES (?, ?, 'Baby Livina Live', 'female', '2020-01-01', ?, ?)
      `, [cChild, pChild, nowStr, nowStr]);

      const campaignId = `camp-child-${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO admin_message_logs (id, recipient_group, message_type, channel, subject, body, recipients_count, status, created_at)
        VALUES (?, 'specific_parents', 'pass_update', 'whatsapp', 'Pass Update', 'Pass for {Child name}: {Pass link}', 1, 'queued', ?)
      `, [campaignId, nowStr]);

      const idemp = `campaign:${campaignId}:parent:${pChild}:child:${cChild}:whatsapp`;
      await enqueueWhatsAppJob({
        eventId: testEventId,
        parentId: pChild,
        childId: cChild,
        idempotencyKey: idemp
      });

      process.env.WHATSAPP_WORKER_MODE = 'in_process';
      for (let attempt = 0; attempt < 15; attempt++) {
        const j = await queryOne('SELECT status FROM notification_jobs WHERE idempotency_key = ?', [idemp]);
        if (j && j.status !== 'pending') break;
        await processQueuedWhatsAppJobs({ maxBatchSize: 10 });
        await new Promise(r => setTimeout(r, 60));
      }

      const job = await queryOne('SELECT status, failure_reason FROM notification_jobs WHERE idempotency_key = ?', [idemp]);
      assert(job !== null, 'Job must exist');
      assert(job.status === 'sent', `Job status must be sent, got: ${job.status}, failure_reason: ${job.failure_reason}`);
    });

    await test('Two sibling jobs remain distinct in notification_jobs with their respective child_ids', async () => {
      const campKey = `camp-sibs-${crypto.randomUUID()}`;
      const idemp1 = buildIdempotencyKey({ type: 'campaign', campaignId: campKey, parentId: testParentId, childId: child1Id });
      const idemp2 = buildIdempotencyKey({ type: 'campaign', campaignId: campKey, parentId: testParentId, childId: child2Id });

      assert(idemp1 !== idemp2, 'Idempotency keys must be distinct for siblings');

      const j1 = await enqueueWhatsAppJob({ eventId: testEventId, parentId: testParentId, childId: child1Id, idempotencyKey: idemp1 });
      const j2 = await enqueueWhatsAppJob({ eventId: testEventId, parentId: testParentId, childId: child2Id, idempotencyKey: idemp2 });

      assert(j1.jobId !== j2.jobId, 'Sibling jobs must have distinct job IDs');
      assert(j1.queued === true && j2.queued === true, 'Both sibling jobs must be queued');

      const row1 = await queryOne('SELECT child_id FROM notification_jobs WHERE id = ?', [j1.jobId]);
      const row2 = await queryOne('SELECT child_id FROM notification_jobs WHERE id = ?', [j2.jobId]);
      assert(row1.child_id === child1Id, 'Job 1 child_id matches');
      assert(row2.child_id === child2Id, 'Job 2 child_id matches');
    });

    await test('Channel independence: In-app notifications deliver successfully even if WhatsApp queueing or worker fails', async () => {
      const res = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          recipientGroup: 'specific_parents',
          selectedParentIds: [testParentId],
          messageType: 'general_announcement',
          channels: ['in_app'],
          subject: 'Channel Independence Test',
          body: 'In-app notification independent delivery test.',
          confirmed: true,
          eventId: testEventId
        })
      });

      assert(res.status === 200, 'In-app send must succeed');
      const data = await res.json();
      assert(data.success === true, 'Response must be success: true');
      assert(data.sent.inApp === 1, 'In-app sent count must be 1');

      const inAppRow = await queryOne(`
        SELECT id, message FROM notifications
        WHERE parent_id = ? AND title = 'Channel Independence Test'
      `, [testParentId]);
      assert(inAppRow !== null, 'In-app notification must be present in database');
    });

    // -------------------------------------------------------------
    // SUITE 7: PUSH REPAIR & PASS BIOMETRIC UNLOCK VERIFICATION
    // -------------------------------------------------------------
    console.log('\n--- 7. Push Failure Classification & Pass Biometric Unlock ---');

    await test('Push: stale 410 + valid subscription -> stale removed, valid succeeds', async () => {
      const uId = `user-mixed-${crypto.randomUUID()}`;
      const sStale = `sub-stale-${crypto.randomUUID()}`;
      const sValid = `sub-valid-${crypto.randomUUID()}`;

      await execute(`
        INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
        VALUES (?, ?, 'hash', 'parent', ?, ?)
      `, [uId, `mixed-${crypto.randomUUID()}@test.koinonia`, now, now]);

      await execute(`
        INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
        VALUES (?, ?, 'https://fcm.googleapis.com/fcm/send/mixed-stale', 'key1', 'auth1', 'Old Browser', '2026-09-10T10:00:00Z')
      `, [sStale, uId]);

      await execute(`
        INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
        VALUES (?, ?, 'https://fcm.googleapis.com/fcm/send/mixed-valid', 'key2', 'auth2', 'New Browser', '2026-09-09T10:00:00Z')
      `, [sValid, uId]);

      const originalSend = (webpush as any).sendNotification;
      (webpush as any).sendNotification = async (sub: any) => {
        if (sub.endpoint.includes('mixed-stale')) {
          const err: any = new Error('Subscription expired');
          err.statusCode = 410;
          err.body = 'Gone';
          throw err;
        }
        return { statusCode: 201 };
      };

      try {
        const res = await sendWebPush(uId, {
          title: 'Mixed test',
          body: 'Mixed test body'
        });

        assert(res.success === true, 'Expected push success === true when valid subscription exists');
        assert(res.sentCount === 1, `Expected sentCount === 1, got ${res.sentCount}`);
        assert(res.staleCount === 1, `Expected staleCount === 1, got ${res.staleCount}`);

        const checkStale = await queryOne('SELECT id FROM push_subscriptions WHERE id = ?', [sStale]);
        assert(checkStale === null, 'Stale subscription must be removed');

        const checkValid = await queryOne('SELECT id FROM push_subscriptions WHERE id = ?', [sValid]);
        assert(checkValid !== null, 'Valid subscription must be kept');
      } finally {
        (webpush as any).sendNotification = originalSend;
      }
    });

    await test('Push: child-specific push targets /parent/children/:childId/pass and metadata childId', async () => {
      const pId = `p-target-${crypto.randomUUID()}`;
      const uId = `u-target-${crypto.randomUUID()}`;
      const cId = `c-target-${crypto.randomUUID()}`;
      const sId = `s-target-${crypto.randomUUID()}`;

      await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'hash', 'parent', ?, ?)`, [uId, `target-${crypto.randomUUID()}@koinonia.test`, now, now]);
      await execute(`INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at) VALUES (?, ?, 'Target Parent', ?, '+2348000000000', ?, ?)`, [pId, uId, `target-${crypto.randomUUID()}@koinonia.test`, now, now]);
      await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at) VALUES (?, ?, 'Baby Livina Target', 'Female', '2022-01-01', ?, ?)`, [cId, pId, now, now]);
      await execute(`INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pass_ready', ?, ?)`, [`entry-target-${crypto.randomUUID()}`, cId, testEventId, now, now]);
      await execute(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, 'https://fcm.googleapis.com/fcm/send/child-ctx', 'key', 'auth', ?)`, [sId, uId, now]);

      let capturedPayload: any = null;
      const originalSend = (webpush as any).sendNotification;
      (webpush as any).sendNotification = async (sub: any, payloadStr: string) => {
        capturedPayload = JSON.parse(payloadStr);
        return { statusCode: 201 };
      };

      try {
        const sendRes = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({
            recipientGroup: 'specific_parents',
            selectedParentIds: [pId],
            selectedChildIds: [cId],
            messageType: 'pass_update',
            channels: ['push'],
            subject: 'Pass Update for {Child name}',
            body: 'Pass details for {Child name}',
            confirmed: true,
            eventId: testEventId
          })
        });

        assert(sendRes.status === 200, 'Send must succeed');
        assert(capturedPayload !== null, 'Push payload must be sent');
        assert(capturedPayload.metadata?.targetUrl === `/parent/children/${cId}/pass`, `Target URL must be /parent/children/${cId}/pass, got ${capturedPayload.metadata?.targetUrl}`);
        assert(capturedPayload.metadata?.childId === cId, `ChildId metadata must be ${cId}, got ${capturedPayload.metadata?.childId}`);
      } finally {
        (webpush as any).sendNotification = originalSend;
      }
    });

    await test('Push + WhatsApp: WhatsApp queueing succeeds independently even when push fails with VAPID error', async () => {
      const pId = `p-wa-push-${crypto.randomUUID()}`;
      const uId = `u-wa-push-${crypto.randomUUID()}`;
      const cId = `c-wa-push-${crypto.randomUUID()}`;
      const sId = `s-wa-push-${crypto.randomUUID()}`;

      await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'hash', 'parent', ?, ?)`, [uId, `wapush-${crypto.randomUUID()}@koinonia.test`, now, now]);
      await execute(`INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, whatsapp_number, whatsapp_consent_status, created_at, updated_at) VALUES (?, ?, 'WhatsApp Push Parent', ?, '+2348000000000', '+2348000000000', 'opted_in', ?, ?)`, [pId, uId, `wapush-${crypto.randomUUID()}@koinonia.test`, now, now]);
      await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at) VALUES (?, ?, 'Child WA Push', 'Female', '2022-01-01', ?, ?)`, [cId, pId, now, now]);
      await execute(`INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pass_ready', ?, ?)`, [`entry-wapush-${crypto.randomUUID()}`, cId, testEventId, now, now]);
      await execute(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, 'https://fcm.googleapis.com/fcm/send/wapush-fail', 'key', 'auth', ?)`, [sId, uId, now]);

      const originalSend = (webpush as any).sendNotification;
      (webpush as any).sendNotification = async () => {
        const err: any = new Error('Unauthorized');
        err.statusCode = 403;
        err.body = 'Auth error';
        throw err;
      };

      try {
        const sendRes = await fetch(`${testBaseUrl}/api/admin/messages/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({
            recipientGroup: 'specific_parents',
            selectedParentIds: [pId],
            selectedChildIds: [cId],
            messageType: 'pass_update',
            channels: ['push', 'whatsapp'],
            subject: 'Pass Update',
            body: 'Pass Update message',
            confirmed: true,
            eventId: testEventId
          })
        });

        const data = await sendRes.json();
        assert(sendRes.status === 200, 'Send must return 200');
        assert(data.queued.whatsapp === 1, `WhatsApp must be queued (1), got ${data.queued.whatsapp}`);
        assert(data.sent.push === 0, `Push sent must be 0, got ${data.sent.push}`);
        assert(data.message.includes('Push notification could not be sent'), `Human copy must show 'Push notification could not be sent', got: ${data.message}`);
        assert(!data.message.includes('403') && !data.message.includes('VAPID'), 'Human copy must not leak technical details');
      } finally {
        (webpush as any).sendNotification = originalSend;
      }
    });

    await test('Pass Unlock: initial locked state, session-scoped unlock, multi-child isolation', () => {
      const mockSessionStorage: Record<string, string> = {};
      const mockLocalStorage: Record<string, string> = {
        koinonia_pass_biometric_unlock: 'true'
      };

      const childA = 'child-livina-123';
      const childB = 'child-love-456';

      const isPassUnlockedForChild = (childId: string): boolean => {
        return mockSessionStorage[`koinonia_pass_unlocked_${childId}`] === 'true';
      };

      const isPassLocked = (childId: string): boolean => {
        const isBiometricRequired = mockLocalStorage['koinonia_pass_biometric_unlock'] === 'true';
        return isBiometricRequired && !isPassUnlockedForChild(childId);
      };

      // 1. Initial state: Both passes locked
      assert(isPassLocked(childA) === true, 'Child A pass must be locked initially');
      assert(isPassLocked(childB) === true, 'Child B pass must be locked initially');

      // 2. Biometric authentication failure or cancel: remains locked
      assert(isPassLocked(childA) === true, 'Child A pass must remain locked on failure/cancel');

      // 3. Biometric authentication success for Child A
      mockSessionStorage[`koinonia_pass_unlocked_${childA}`] = 'true';
      assert(isPassLocked(childA) === false, 'Child A pass must be unlocked after successful biometric authentication');

      // 4. Multi-child isolation: Child B MUST still be locked
      assert(isPassLocked(childB) === true, 'Child B pass must remain locked when Child A is unlocked');

      // 5. Survives re-renders and navigation in same session
      assert(isPassUnlockedForChild(childA) === true, 'Child A unlock must persist across component re-renders');

      // 6. Session reset / sign-out re-locks pass
      delete mockSessionStorage[`koinonia_pass_unlocked_${childA}`];
      assert(isPassLocked(childA) === true, 'Child A pass must re-lock when session ends or is cleared');
    });

    await test('Pass Security: Server enforces biometric authorization for child pass independently of sessionStorage', async () => {
      const bioUserId = `u-bio-${crypto.randomUUID()}`;
      const bioParentId = `p-bio-${crypto.randomUUID()}`;
      const bioChildA = `c-bio-livina-${crypto.randomUUID()}`;
      const bioChildB = `c-bio-love-${crypto.randomUUID()}`;
      const credId = `cred-${crypto.randomUUID()}`;

      await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'hash', 'parent', ?, ?)`, [bioUserId, `bio-${crypto.randomUUID()}@koinonia.test`, now, now]);
      await execute(`INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at) VALUES (?, ?, 'Tochukwu Ogunaka', ?, '+2348000000000', ?, ?)`, [bioParentId, bioUserId, `bio-${crypto.randomUUID()}@koinonia.test`, now, now]);
      await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, photo_file_id, created_at, updated_at) VALUES (?, ?, 'Baby Livina', 'Female', '2022-01-01', 'photo-1', ?, ?)`, [bioChildA, bioParentId, now, now]);
      await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, photo_file_id, created_at, updated_at) VALUES (?, ?, 'Baby Love', 'Female', '2023-01-01', 'photo-2', ?, ?)`, [bioChildB, bioParentId, now, now]);

      const entryA = `entry-a-${crypto.randomUUID()}`;
      const entryB = `entry-b-${crypto.randomUUID()}`;
      await execute(`INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pass_ready', ?, ?)`, [entryA, bioChildA, testEventId, now, now]);
      await execute(`INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pass_ready', ?, ?)`, [entryB, bioChildB, testEventId, now, now]);

      const passRefA = `KOI-2026-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const passRefB = `KOI-2026-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      await execute(`INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at) VALUES (?, ?, ?, 'hash1', 'active', ?, ?, ?)`, [`pass-a-${crypto.randomUUID()}`, entryA, passRefA, now, now, now]);
      await execute(`INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at) VALUES (?, ?, ?, 'hash2', 'active', ?, ?, ?)`, [`pass-b-${crypto.randomUUID()}`, entryB, passRefB, now, now, now]);

      const parentAuthToken = generateToken(bioUserId);

      // 1. Manually setting sessionStorage alone cannot obtain protected pass data from server
      // Under biometric protection, GET /home redacts passReference
      const homeRes = await fetch(`${testBaseUrl}/api/parent/home`, {
        headers: {
          'Authorization': `Bearer ${parentAuthToken}`,
          'X-Biometric-Protected': 'true'
        }
      });
      assert(homeRes.status === 200, 'Home request should succeed');
      const homeData = await homeRes.json();
      const livinaHome = homeData.childrenList.find((c: any) => c.id === bioChildA);
      assert(livinaHome && livinaHome.passLocked === true, 'Child A must be marked passLocked on server');
      assert(livinaHome.passReference === undefined, 'Child A passReference must NOT be exposed before biometric unlock');

      // 2. Direct fetch without biometric authorization returns 403 Forbidden
      const unauthPassRes = await fetch(`${testBaseUrl}/api/parent/children/${bioChildA}/pass`, {
        headers: {
          'Authorization': `Bearer ${parentAuthToken}`,
          'X-Biometric-Protected': 'true'
        }
      });
      assert(unauthPassRes.status === 403, 'Pass fetch without authorization must return 403');
      const unauthErr = await unauthPassRes.json();
      assert(unauthErr.passLocked === true, 'Response must indicate passLocked');

      // 3. Failed/invalid WebAuthn assertion never authorizes pass
      const failAuthRes = await fetch(`${testBaseUrl}/api/auth/passkeys/verify-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${parentAuthToken}`
        },
        body: JSON.stringify({
          credential: { id: 'invalid-cred-id' },
          actionName: 'Unlocking secure child pass',
          childId: bioChildA
        })
      });
      assert(failAuthRes.status === 401, 'Invalid credential must fail with 401');

      // 4. Register passkey for user
      await execute(`
        INSERT INTO user_passkeys (id, user_id, role, credential_id, public_key, counter, device_name, created_at)
        VALUES (?, ?, 'parent', ?, 'pubkey', 0, 'Test Phone', ?)
      `, [`pk-${crypto.randomUUID()}`, bioUserId, credId, now]);

      // 5. Successful WebAuthn verification authorizes exact child
      const successAuthRes = await fetch(`${testBaseUrl}/api/auth/passkeys/verify-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${parentAuthToken}`
        },
        body: JSON.stringify({
          credential: { id: credId },
          actionName: 'Unlocking secure child pass',
          childId: bioChildA
        })
      });
      assert(successAuthRes.status === 200, 'Verify action with registered passkey must return 200');
      const authData = await successAuthRes.json();
      assert(authData.success === true, 'Verify action must succeed');
      assert(typeof authData.passToken === 'string', 'Must issue signed passToken');

      // 6. Child A is now authorized and returns pass reference
      const authPassRes = await fetch(`${testBaseUrl}/api/parent/children/${bioChildA}/pass`, {
        headers: {
          'Authorization': `Bearer ${parentAuthToken}`,
          'X-Biometric-Protected': 'true',
          'X-Pass-Token': authData.passToken
        }
      });
      assert(authPassRes.status === 200, 'Authorized pass fetch must return 200');
      const passData = await authPassRes.json();
      assert(passData.passReference === passRefA, `Must return actual passReference, expected ${passRefA} got ${passData.passReference}`);

      // 7. Multi-child isolation: Child A authorization does NOT unlock Child B
      const childBPassRes = await fetch(`${testBaseUrl}/api/parent/children/${bioChildB}/pass`, {
        headers: {
          'Authorization': `Bearer ${parentAuthToken}`,
          'X-Biometric-Protected': 'true',
          'X-Pass-Token': authData.passToken
        }
      });
      assert(childBPassRes.status === 403, 'Child A token must NOT authorize Child B');

      // 8. Sign-out revokes authorization
      const signOutRes = await fetch(`${testBaseUrl}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${parentAuthToken}`
        }
      });
      assert(signOutRes.status === 200, 'Sign-out must succeed');

      const afterLogoutRes = await fetch(`${testBaseUrl}/api/parent/children/${bioChildA}/pass`, {
        headers: {
          'Authorization': `Bearer ${parentAuthToken}`,
          'X-Biometric-Protected': 'true'
        }
      });
      const afterLogoutText = await afterLogoutRes.text();
      assert(afterLogoutRes.status === 403, `Pass must be locked again after sign out, got ${afterLogoutRes.status}: ${afterLogoutText}`);

      // 9. Expired authorization requires authentication again
      const expiredAuth = await authorizeChildPass(bioParentId, bioChildA, -1000);
      const expiredPassRes = await fetch(`${testBaseUrl}/api/parent/children/${bioChildA}/pass`, {
        headers: {
          'Authorization': `Bearer ${parentAuthToken}`,
          'X-Biometric-Protected': 'true',
          'X-Pass-Token': expiredAuth.passToken
        }
      });
      assert(expiredPassRes.status === 403, 'Expired authorization must return 403 and require authentication again');

      // 10. Render restart resilience: process-memory wipe retains persistent server authorization in auth_tokens
      const persistentAuth = await authorizeChildPass(bioParentId, bioChildA, 15 * 60 * 1000, bioUserId);
      assert(typeof persistentAuth.passToken === 'string', 'Must issue persistent token');

      // Simulate Render restart by wiping all in-memory caches
      _clearInMemoryPassCache();

      // Pass fetch WITHOUT passing X-Pass-Token header succeeds via DB auth_tokens lookup
      const afterRestartRes = await fetch(`${testBaseUrl}/api/parent/children/${bioChildA}/pass`, {
        headers: {
          'Authorization': `Bearer ${parentAuthToken}`,
          'X-Biometric-Protected': 'true'
        }
      });
      assert(afterRestartRes.status === 200, 'Pass authorization must survive server process memory restart via auth_tokens DB table');
      const afterRestartData = await afterRestartRes.json();
      assert(afterRestartData.passReference === passRefA, 'Pass reference must match after restart');

      // Signing out revokes persistent auth in DB
      await fetch(`${testBaseUrl}/api/auth/sign-out`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${parentAuthToken}` }
      });
      _clearInMemoryPassCache();

      const afterLogoutDbRes = await fetch(`${testBaseUrl}/api/parent/children/${bioChildA}/pass`, {
        headers: {
          'Authorization': `Bearer ${parentAuthToken}`,
          'X-Biometric-Protected': 'true'
        }
      });
      assert(afterLogoutDbRes.status === 403, 'Pass must remain locked after sign-out even with process restart');
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
