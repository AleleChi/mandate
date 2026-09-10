import crypto from 'crypto';
import express from 'express';
import { query, queryOne, execute } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import adminRoutes from '../src/server/routes/admin';
import notificationRoutes from '../src/server/routes/notifications';
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

  // Setup express test server for admin and notification routes
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api/notifications', notificationRoutes);

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
