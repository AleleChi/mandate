import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import http from 'http';
import { query, queryOne, execute } from '../src/server/db';
import authRouter from '../src/server/routes/auth';
import volunteerRouter from '../src/server/routes/volunteer';
import { setCustomMxResolver } from '../src/server/utils/validation';
import {
  enqueueWhatsAppJob,
  processQueuedWhatsAppJobs,
  resetWhatsAppProviderCache,
  SimulatedWhatsAppProvider
} from '../src/server/services/whatsapp';
import { ProviderSendResult, SendSessionMessageParams } from '../src/server/services/whatsapp/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runRegistrationCommunicationTests() {
  console.log('====================================================');
  console.log('REGISTRATION COMMUNICATION & MESSAGE STATUS POLISH');
  console.log('PRODUCTION-SAFE VERIFICATION SUITE');
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

  // Setup deterministic MX resolver mock - strictly isolates automated tests from live DNS/network
  setCustomMxResolver(async (domain: string) => {
    return [{ exchange: `mail.${domain}`, priority: 10 }];
  });

  // Ensure no external live email sending occurs during tests
  const prevResendKey = process.env.RESEND_API_KEY;
  const prevEmailProvider = process.env.EMAIL_PROVIDER;
  const prevMailFrom = process.env.MAIL_FROM_ADDRESS;
  delete process.env.RESEND_API_KEY;
  process.env.EMAIL_PROVIDER = 'simulated';
  process.env.MAIL_FROM_ADDRESS = 'noreply@koinonia.org';

  // Setup Recording WhatsApp Provider
  class RecordingWhatsAppProvider extends SimulatedWhatsAppProvider {
    sentMessages: Array<{ to: string; body: string }> = [];
    shouldFail = false;

    override async sendSessionMessage(params: SendSessionMessageParams): Promise<ProviderSendResult> {
      if (this.shouldFail) {
        return { success: false, provider: 'simulated', status: 'failed', error: 'Simulated provider network failure' };
      }
      this.sentMessages.push({ to: params.to, body: params.body });
      return super.sendSessionMessage(params);
    }

    clearHistory() {
      this.sentMessages = [];
    }

    getSentMessages() {
      return [...this.sentMessages];
    }
  }

  const simProvider = new RecordingWhatsAppProvider();
  simProvider.clearHistory();
  resetWhatsAppProviderCache(simProvider);

  // Setup in-memory Express server with auth and volunteer routers
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/volunteer', volunteerRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const testSuffix = Date.now().toString();

  // Create a placeholder media file for volunteer tests so photo validation passes
  const testPhotoId = `media_test_${testSuffix}`;
  await execute(`
    INSERT INTO media_files (
      id, owner_user_id, provider, file_type, public_id, secure_url, resource_type,
      mime_type, file_size, width, height, duration, folder, file_url, storage_key, created_at
    ) VALUES (?, NULL, 'local', 'volunteer_profile_photo', 'test_photo', 'https://example.com/photo.jpg', 'image', 'image/jpeg', 1024, 200, 200, NULL, 'test', 'https://example.com/photo.jpg', 'test_photo', ?)
  `, [testPhotoId, new Date().toISOString()]);

  try {
    // -------------------------------------------------------------
    // PART 1: PARENT REGISTRATION COMMUNICATION
    // -------------------------------------------------------------
    console.log('\n--- 1. PARENT REGISTRATION & WHATSAPP ACKNOWLEDGEMENT ---');

    let parentWithoutConsentEmail = `parent_noconsent_${testSuffix}@koinonia.org`;
    let parentWithoutConsentUserId = '';

    await test('Parent registration without WhatsApp consent succeeds but enqueues NO WhatsApp job', async () => {
      const res = await fetch(`${baseUrl}/api/auth/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Tunde Adebayo',
          email: parentWithoutConsentEmail,
          password: 'Password123!',
          phone: '+2348031234001',
          whatsapp: '+2348031234001',
          whatsappConsent: false
        })
      });

      assert(res.status === 201, `Expected 201 Created, got ${res.status}`);
      const data = await res.json();
      parentWithoutConsentUserId = data.user.id;

      // Verify user created
      const dbUser = await queryOne('SELECT id, email FROM users WHERE id = ?', [data.user.id]);
      assert(dbUser && dbUser.email === parentWithoutConsentEmail, 'User not in database');

      // Verify email verification token generated
      const tokenRow = await queryOne("SELECT id, token_hash FROM auth_tokens WHERE user_id = ? AND token_type = 'email_verification'", [data.user.id]);
      assert(Boolean(tokenRow), 'Email verification token not generated');

      // Verify NO WhatsApp job enqueued
      const waJob = await queryOne("SELECT id FROM notification_jobs WHERE user_id = ? AND channel = 'whatsapp'", [data.user.id]);
      assert(!waJob, 'WhatsApp job was unexpectedly enqueued without consent');
    });

    let parentPhoneOnlyEmail = `parent_phoneonly_${testSuffix}@koinonia.org`;
    await test('Parent registration with phone/WhatsApp number but no explicit consent does NOT imply consent', async () => {
      const res = await fetch(`${baseUrl}/api/auth/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Chidi Okonkwo',
          email: parentPhoneOnlyEmail,
          password: 'Password123!',
          phone: '+2348031234002',
          whatsapp: '+2348031234002'
          // whatsappConsent intentionally omitted
        })
      });

      assert(res.status === 201, `Expected 201 Created, got ${res.status}`);
      const data = await res.json();

      const profile = await queryOne('SELECT whatsapp_consent_status FROM parent_profiles WHERE user_id = ?', [data.user.id]);
      assert(profile.whatsapp_consent_status === 'unknown', `Consent status should be unknown, got ${profile.whatsapp_consent_status}`);

      const waJob = await queryOne("SELECT id FROM notification_jobs WHERE user_id = ? AND channel = 'whatsapp'", [data.user.id]);
      assert(!waJob, 'WhatsApp job was enqueued without explicit consent');
    });

    let parentWithConsentEmail = `parent_consent_${testSuffix}@koinonia.org`;
    let parentWithConsentUserId = '';
    let parentWithConsentProfileId = '';

    await test('Parent registration with explicit WhatsApp consent enqueues ONE transactional acknowledgement job', async () => {
      const res = await fetch(`${baseUrl}/api/auth/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Amara Nwosu',
          email: parentWithConsentEmail,
          password: 'Password123!',
          phone: '+2348031234003',
          whatsapp: '+2348031234003',
          whatsappConsent: true
        })
      });

      assert(res.status === 201, `Expected 201 Created, got ${res.status}`);
      const data = await res.json();
      parentWithConsentUserId = data.user.id;
      parentWithConsentProfileId = data.profile.id;

      // Check profile consent status
      const profile = await queryOne('SELECT whatsapp_consent_status, whatsapp_consent_source FROM parent_profiles WHERE id = ?', [parentWithConsentProfileId]);
      assert(profile.whatsapp_consent_status === 'opted_in', `Expected opted_in, got ${profile.whatsapp_consent_status}`);
      assert(profile.whatsapp_consent_source === 'registration', `Expected registration source, got ${profile.whatsapp_consent_source}`);

      // Check notification job enqueued
      const waJobs = await query("SELECT id, status, idempotency_key FROM notification_jobs WHERE parent_id = ? AND channel = 'whatsapp'", [parentWithConsentProfileId]);
      assert(waJobs.length === 1, `Expected exactly 1 WhatsApp job, got ${waJobs.length}`);
      assert(waJobs[0].idempotency_key === `registration_ack:parent:${parentWithConsentProfileId}`, `Unexpected idempotency key: ${waJobs[0].idempotency_key}`);
      assert(waJobs[0].status === 'pending', `Job should be pending, got ${waJobs[0].status}`);
    });

    await test('WhatsApp worker processes Parent registration acknowledgement with correct copy and zero tokens', async () => {
      // Clear simulation history
      simProvider.clearHistory();

      // Run worker to claim and process pending jobs
      const result = await processQueuedWhatsAppJobs({ maxBatchSize: 10 });
      assert(result.succeeded >= 1, `Worker should have succeeded on job, result: ${JSON.stringify(result)}`);

      // Verify SimulatedWhatsAppProvider received the message
      const history = simProvider.getSentMessages();
      const ackMsg = history.find(m => m.to === '+2348031234003');
      assert(Boolean(ackMsg), 'No message sent to parent phone +2348031234003');

      const body = ackMsg!.body;

      // Check role-appropriate personalized greeting
      assert(body.includes('Hi Amara,'), `Greeting should address Amara, got:\n${body}`);

      // Check message core text
      assert(body.includes('Your Koinonia Children & Teens registration has been received.'), 'Missing receipt text');
      assert(body.includes('We sent a verification link to your email address.'), 'Missing email notice');
      assert(body.includes('Please check your inbox, spam or junk folder and verify your email to continue.'), 'Missing inbox/spam advice');
      assert(body.includes('return to the sign-in page and request another verification email.'), 'Missing return advice');
      assert(body.includes('Koinonia Children & Teens'), 'Missing team sign-off');

      // CRITICAL SECURITY ASSERTION: zero verification tokens/links exposed in WhatsApp
      assert(!body.includes('token='), 'CRITICAL SECURITY BREACH: WhatsApp contains token parameter!');
      assert(!body.includes('/parent/verify-email'), 'CRITICAL SECURITY BREACH: WhatsApp contains direct verify link!');
      assert(!body.includes('auth_tokens'), 'Exposed internal database reference');
      assert(!body.includes('Twilio'), 'Exposed internal provider reference');

      // Check delivery log
      const deliveryLog = await queryOne('SELECT status, campaign_id, recipient_phone FROM whatsapp_delivery_logs WHERE parent_profile_id = ?', [parentWithConsentProfileId]);
      assert(Boolean(deliveryLog), 'Delivery log not created');
      assert(deliveryLog.status === 'sent', `Delivery log status expected sent, got ${deliveryLog.status}`);
      assert(deliveryLog.campaign_id === 'registration_acknowledgement', `Expected campaign_id registration_acknowledgement, got ${deliveryLog.campaign_id}`);
    });

    let parentWaFailEmail = `parent_wafail_${testSuffix}@koinonia.org`;
    await test('Parent registration succeeds even if WhatsApp provider or worker fails (non-blocking)', async () => {
      // Configure simProvider to simulate provider failure
      simProvider.shouldFail = true;

      const res = await fetch(`${baseUrl}/api/auth/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Emeka Eze',
          email: parentWaFailEmail,
          password: 'Password123!',
          phone: '+2348031234009',
          whatsapp: '+2348031234009',
          whatsappConsent: true
        })
      });

      assert(res.status === 201, `Expected 201 Created despite WhatsApp issue, got ${res.status}`);
      const data = await res.json();
      assert(Boolean(data.user?.id), 'User not created');
      assert(Boolean(data.profile?.id), 'Profile not created');

      // Verification token created
      const token = await queryOne("SELECT id FROM auth_tokens WHERE user_id = ? AND token_type = 'email_verification'", [data.user.id]);
      assert(Boolean(token), 'Email verification token must exist');

      // Process worker - provider will fail send
      await processQueuedWhatsAppJobs({ maxBatchSize: 10 });

      // Reset failure flag
      simProvider.shouldFail = false;

      // Registration account is still valid and intact
      const dbUser = await queryOne('SELECT id FROM users WHERE id = ?', [data.user.id]);
      assert(Boolean(dbUser), 'User must remain valid after WhatsApp failure');
    });

    // -------------------------------------------------------------
    // PART 2: VOLUNTEER REGISTRATION COMMUNICATION
    // -------------------------------------------------------------
    console.log('\n--- 2. VOLUNTEER REGISTRATION & WHATSAPP ACKNOWLEDGEMENT ---');

    let volWithoutConsentEmail = `vol_noconsent_${testSuffix}@koinonia.org`;
    let volWithoutConsentUserId = '';

    await test('Volunteer registration without WhatsApp consent succeeds but enqueues NO WhatsApp job', async () => {
      const res = await fetch(`${baseUrl}/api/volunteer/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Bimbo Adeleke',
          email: volWithoutConsentEmail,
          password: 'Password123!',
          phone: '+2348031234010',
          whatsapp: '+2348031234010',
          photoFileId: testPhotoId,
          preferredTeam: 'Check-in & Welcome',
          whatsappConsent: false
        })
      });

      assert(res.status === 201, `Expected 201 Created, got ${res.status}`);
      const data = await res.json();
      volWithoutConsentUserId = data.user.id;

      // Verify user created and email token created
      const dbUser = await queryOne('SELECT id, email FROM users WHERE id = ?', [data.user.id]);
      assert(dbUser && dbUser.email === volWithoutConsentEmail, 'Volunteer user not in database');

      const tokenRow = await queryOne("SELECT id FROM auth_tokens WHERE user_id = ? AND token_type = 'email_verification'", [data.user.id]);
      assert(Boolean(tokenRow), 'Volunteer verification token not generated');

      // Verify consent status is unknown and NO WhatsApp job enqueued
      const profile = await queryOne('SELECT whatsapp_consent_status FROM volunteer_profiles WHERE user_id = ?', [data.user.id]);
      assert(profile.whatsapp_consent_status === 'unknown', `Expected unknown consent, got ${profile.whatsapp_consent_status}`);

      const waJob = await queryOne("SELECT id FROM notification_jobs WHERE user_id = ? AND channel = 'whatsapp'", [data.user.id]);
      assert(!waJob, 'WhatsApp job was unexpectedly enqueued for volunteer without consent');
    });

    let volPhoneOnlyEmail = `vol_phoneonly_${testSuffix}@koinonia.org`;
    await test('Volunteer registration with phone/WhatsApp number but no explicit consent does NOT imply consent', async () => {
      const res = await fetch(`${baseUrl}/api/volunteer/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Kayode Alabi',
          email: volPhoneOnlyEmail,
          password: 'Password123!',
          phone: '+2348031234015',
          whatsapp: '+2348031234015',
          photoFileId: testPhotoId,
          preferredTeam: 'Media & Tech'
          // whatsappConsent intentionally omitted
        })
      });

      assert(res.status === 201, `Expected 201 Created, got ${res.status}`);
      const data = await res.json();

      const profile = await queryOne('SELECT whatsapp_consent_status FROM volunteer_profiles WHERE user_id = ?', [data.user.id]);
      assert(profile.whatsapp_consent_status === 'unknown', `Expected unknown consent, got ${profile.whatsapp_consent_status}`);

      const waJob = await queryOne("SELECT id FROM notification_jobs WHERE user_id = ? AND channel = 'whatsapp'", [data.user.id]);
      assert(!waJob, 'WhatsApp job was unexpectedly enqueued without explicit consent');
    });

    let volWithConsentEmail = `vol_consent_${testSuffix}@koinonia.org`;
    let volWithConsentUserId = '';

    await test('Volunteer registration with explicit WhatsApp consent enqueues ONE transactional acknowledgement job', async () => {
      const res = await fetch(`${baseUrl}/api/volunteer/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Chioma Alele',
          email: volWithConsentEmail,
          password: 'Password123!',
          phone: '+2348031234011',
          whatsapp: '+2348031234011',
          photoFileId: testPhotoId,
          preferredTeam: 'Security & Protocol',
          whatsappConsent: true
        })
      });

      assert(res.status === 201, `Expected 201 Created, got ${res.status}`);
      const data = await res.json();
      volWithConsentUserId = data.user.id;

      // Check volunteer profile consent columns
      const profile = await queryOne('SELECT whatsapp_consent_status, whatsapp_consent_source FROM volunteer_profiles WHERE user_id = ?', [volWithConsentUserId]);
      assert(profile.whatsapp_consent_status === 'opted_in', `Expected opted_in, got ${profile.whatsapp_consent_status}`);
      assert(profile.whatsapp_consent_source === 'registration', `Expected registration, got ${profile.whatsapp_consent_source}`);

      // Check notification job enqueued
      const waJobs = await query("SELECT id, status, idempotency_key FROM notification_jobs WHERE user_id = ? AND channel = 'whatsapp'", [volWithConsentUserId]);
      assert(waJobs.length === 1, `Expected exactly 1 WhatsApp job, got ${waJobs.length}`);
      assert(waJobs[0].idempotency_key === `registration_ack:volunteer:${volWithConsentUserId}`, `Unexpected idempotency key: ${waJobs[0].idempotency_key}`);
      assert(waJobs[0].status === 'pending', `Job should be pending, got ${waJobs[0].status}`);
    });

    await test('WhatsApp worker processes Volunteer registration acknowledgement with correct copy and zero tokens', async () => {
      simProvider.clearHistory();

      const result = await processQueuedWhatsAppJobs({ maxBatchSize: 10 });
      assert(result.succeeded >= 1, `Worker should have processed volunteer job, got: ${JSON.stringify(result)}`);

      const history = simProvider.getSentMessages();
      const ackMsg = history.find(m => m.to === '+2348031234011');
      assert(Boolean(ackMsg), 'No message sent to volunteer phone +2348031234011');

      const body = ackMsg!.body;
      assert(body.includes('Hi Chioma,'), `Greeting should address Chioma, got:\n${body}`);
      assert(body.includes('Your Koinonia Children & Teens registration has been received.'), 'Missing receipt text');
      assert(body.includes('We sent a verification link to your email address.'), 'Missing email notice');
      assert(body.includes('Please check your inbox, spam or junk folder and verify your email to continue.'), 'Missing inbox/spam advice');
      assert(body.includes('return to the sign-in page and request another verification email.'), 'Missing return advice');

      // CRITICAL SECURITY ASSERTION
      assert(!body.includes('token='), 'CRITICAL SECURITY BREACH: WhatsApp contains token parameter!');
      assert(!body.includes('/volunteer/verify-email'), 'CRITICAL SECURITY BREACH: WhatsApp contains direct verify link!');
    });

    let volWaFailEmail = `vol_wafail_${testSuffix}@koinonia.org`;
    await test('Volunteer registration succeeds even if WhatsApp provider or worker fails (non-blocking)', async () => {
      simProvider.shouldFail = true;

      const res = await fetch(`${baseUrl}/api/volunteer/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Ibrahim Danjuma',
          email: volWaFailEmail,
          password: 'Password123!',
          phone: '+2348031234019',
          whatsapp: '+2348031234019',
          photoFileId: testPhotoId,
          preferredTeam: 'Logistics',
          whatsappConsent: true
        })
      });

      assert(res.status === 201, `Expected 201 Created despite WhatsApp issue, got ${res.status}`);
      const data = await res.json();
      assert(Boolean(data.user?.id), 'User not created');
      assert(Boolean(data.profile?.id), 'Profile not created');

      // Verification token created
      const token = await queryOne("SELECT id FROM auth_tokens WHERE user_id = ? AND token_type = 'email_verification'", [data.user.id]);
      assert(Boolean(token), 'Email verification token must exist');

      await processQueuedWhatsAppJobs({ maxBatchSize: 10 });
      simProvider.shouldFail = false;

      const dbUser = await queryOne('SELECT id FROM users WHERE id = ?', [data.user.id]);
      assert(Boolean(dbUser), 'User must remain valid after WhatsApp failure');
    });

    // -------------------------------------------------------------
    // PART 2B: ROLE-SPECIFIC CONSENT ISOLATION & DUAL-ROLE SAFETY
    // -------------------------------------------------------------
    console.log('\n--- 2B. ROLE-SPECIFIC CONSENT ISOLATION ---');

    await test('Consent remains strictly role-specific between parent and volunteer profiles', async () => {
      // 1. Parent profile stores its own preference in parent_profiles.whatsapp_consent_status
      const parentProfile = await queryOne('SELECT whatsapp_consent_status, whatsapp_consent_source FROM parent_profiles WHERE id = ?', [parentWithConsentProfileId]);
      assert(parentProfile.whatsapp_consent_status === 'opted_in', 'Parent consent must be stored in parent_profiles');

      // 2. Volunteer profile stores its own preference in volunteer_profiles.whatsapp_consent_status
      const volProfile = await queryOne('SELECT whatsapp_consent_status, whatsapp_consent_source FROM volunteer_profiles WHERE user_id = ?', [volWithConsentUserId]);
      assert(volProfile.whatsapp_consent_status === 'opted_in', 'Volunteer consent must be stored in volunteer_profiles');

      // 3. Dual-role simulation: Create a volunteer profile for a parent user who opted in to parent WhatsApp,
      // but explicitly opt-out on volunteer side. The profiles MUST remain independent and not overwrite each other.
      const dualUserId = `u_dual_${testSuffix}`;
      const dualParentProfileId = `p_dual_${testSuffix}`;
      const dualVolProfileId = `v_dual_${testSuffix}`;

      await execute(`
        INSERT INTO users (id, email, role, created_at, updated_at)
        VALUES (?, 'dual_test_${testSuffix}@koinonia.org', 'parent', datetime('now'), datetime('now'))
      `, [dualUserId]);

      await execute(`
        INSERT INTO parent_profiles (
          id, user_id, full_name, phone_number, whatsapp_number, email,
          preferred_contact, is_koinonia_worker, whatsapp_consent_status, created_at, updated_at
        ) VALUES (?, ?, 'Dual User', '+2348031234099', '+2348031234099', 'dual_test_${testSuffix}@koinonia.org', 'WhatsApp', 0, 'opted_in', datetime('now'), datetime('now'))
      `, [dualParentProfileId, dualUserId]);

      await execute(`
        INSERT INTO volunteer_profiles (
          id, user_id, full_name, phone, whatsapp, preferred_team, whatsapp_consent_status, created_at, updated_at
        ) VALUES (?, ?, 'Dual User', '+2348031234099', '+2348031234099', 'Check-in & Welcome', 'opted_out', datetime('now'), datetime('now'))
      `, [dualVolProfileId, dualUserId]);

      const parentAfter = await queryOne('SELECT whatsapp_consent_status FROM parent_profiles WHERE id = ?', [dualParentProfileId]);
      const volAfter = await queryOne('SELECT whatsapp_consent_status FROM volunteer_profiles WHERE id = ?', [dualVolProfileId]);

      assert(parentAfter.whatsapp_consent_status === 'opted_in', 'Parent preference must remain opted_in');
      assert(volAfter.whatsapp_consent_status === 'opted_out', 'Volunteer preference must remain opted_out');

      // Clean up dual role test rows
      await execute('DELETE FROM volunteer_profiles WHERE id = ?', [dualVolProfileId]);
      await execute('DELETE FROM parent_profiles WHERE id = ?', [dualParentProfileId]);
      await execute('DELETE FROM users WHERE id = ?', [dualUserId]);
    });

    // -------------------------------------------------------------
    // PART 3: RESEND VERIFICATION & COOLDOWN TESTS
    // -------------------------------------------------------------
    console.log('\n--- 3. RESEND VERIFICATION & RATE-LIMIT COOLDOWN ---');

    await test('Parent resend verification works and enforces 60-second cooldown', async () => {
      // Set created_at to 70 seconds ago to allow clean test of 200 OK first
      await execute(`
        UPDATE auth_tokens SET created_at = ? WHERE user_id = ?
      `, [new Date(Date.now() - 70000).toISOString(), parentWithConsentUserId]);

      // First resend request should succeed
      const res1 = await fetch(`${baseUrl}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: parentWithConsentEmail })
      });

      assert(res1.status === 200, `Expected 200 OK on fresh resend, got ${res1.status}`);
      const data1 = await res1.json();
      assert(data1.success === true, 'Expected success: true');

      // Immediate second call MUST return 429 RESEND_COOLDOWN
      const res2 = await fetch(`${baseUrl}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: parentWithConsentEmail })
      });
      assert(res2.status === 429, `Expected 429 Cooldown on immediate second resend, got ${res2.status}`);
      const data2 = await res2.json();
      assert(data2.code === 'RESEND_COOLDOWN', `Expected code RESEND_COOLDOWN, got ${data2.code}`);
      assert(typeof data2.retryAfterSeconds === 'number', 'Missing retryAfterSeconds');
    });

    await test('Volunteer resend verification works and enforces 60-second cooldown', async () => {
      // Set created_at to 70 seconds ago to allow clean test of 200 OK first
      await execute(`
        UPDATE auth_tokens SET created_at = ? WHERE user_id = ?
      `, [new Date(Date.now() - 70000).toISOString(), volWithConsentUserId]);

      const res1 = await fetch(`${baseUrl}/api/volunteer/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: volWithConsentEmail })
      });

      assert(res1.status === 200, `Expected 200 OK on fresh resend, got ${res1.status}`);
      const data1 = await res1.json();
      assert(data1.success === true, 'Expected success: true');

      // Immediate second call MUST return 429 RESEND_COOLDOWN
      const res2 = await fetch(`${baseUrl}/api/volunteer/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: volWithConsentEmail })
      });

      assert(res2.status === 429, `Expected 429 Cooldown on immediate second resend, got ${res2.status}`);
      const data2 = await res2.json();
      assert(data2.code === 'RESEND_COOLDOWN', `Expected code RESEND_COOLDOWN, got ${data2.code}`);
      assert(typeof data2.retryAfterSeconds === 'number', 'Missing retryAfterSeconds');
    });

    // -------------------------------------------------------------
    // PART 4: UI VALIDATION (MESSAGE STATUS & SUCCESS SCREENS)
    // -------------------------------------------------------------
    console.log('\n--- 4. UI VALIDATION: MESSAGE STATUS POLISH & SUCCESS SCREENS ---');

    await test('AdminMessagesView contains NO status dots (●)', () => {
      const viewCode = fs.readFileSync('src/views/admin/AdminMessagesView.tsx', 'utf8');
      assert(!viewCode.includes('●'), 'AdminMessagesView.tsx still contains ● dot characters!');
      assert(!viewCode.includes('○'), 'AdminMessagesView.tsx still contains ○ dot characters!');
    });

    await test('AdminMessagesView uses softened status colors for Sent, Sending, and Failed', () => {
      const viewCode = fs.readFileSync('src/views/admin/AdminMessagesView.tsx', 'utf8');
      // Sent: soft emerald background with subtle border
      assert(viewCode.includes('text-emerald-800 bg-emerald-50/70 border border-emerald-200/50'), 'Missing soft emerald badge styling for Sent');
      // Sending: soft amber background with subtle border
      assert(viewCode.includes('text-amber-800 bg-amber-50/70 border border-amber-200/50'), 'Missing soft amber badge styling for Sending');
      // Failed: soft rose background with subtle border
      assert(viewCode.includes('text-rose-800 bg-rose-50/70 border border-rose-200/50'), 'Missing soft rose badge styling for Failed');
    });

    await test('CheckEmailView contains Spam/Junk guidance, resend action, and Use a different email', () => {
      const viewCode = fs.readFileSync('src/views/CheckEmailView.tsx', 'utf8');
      assert(viewCode.includes('Check your email'), 'Missing Check your email title');
      assert(viewCode.includes('Check your Spam, Junk or Promotions folder'), 'Missing Spam/Junk/Promotions guidance');
      assert(viewCode.includes('Resend verification email'), 'Missing Resend verification email button');
      assert(viewCode.includes('Use a different email'), 'Missing Use a different email secondary action');
    });

    await test('VolunteerVerifyEmailView contains Spam/Junk guidance, resend action, and Use a different email', () => {
      const viewCode = fs.readFileSync('src/views/VolunteerVerifyEmailView.tsx', 'utf8');
      assert(viewCode.includes('Check your email'), 'Missing Check your email title');
      assert(viewCode.includes('Check your Spam, Junk or Promotions folder'), 'Missing Spam/Junk/Promotions guidance');
      assert(viewCode.includes('Resend verification email'), 'Missing Resend verification email button');
      assert(viewCode.includes('Use a different email'), 'Missing Use a different email secondary action');
    });

    await test('Both registration views render explicit unchecked WhatsApp choice with exact copy', () => {
      const parentView = fs.readFileSync('src/views/CreateAccountView.tsx', 'utf8');
      assert(parentView.includes('Send me important registration and event updates on WhatsApp'), 'Parent view missing exact choice copy');
      assert(parentView.includes('You can turn this off later.'), 'Parent view missing supporting text');

      const volView = fs.readFileSync('src/views/VolunteerCreateAccountView.tsx', 'utf8');
      assert(volView.includes('Send me important registration and event updates on WhatsApp'), 'Volunteer view missing exact choice copy');
      assert(volView.includes('You can turn this off later.'), 'Volunteer view missing supporting text');
    });

  } finally {
    // Restore resolver to production
    setCustomMxResolver(null);

    // Restore env vars
    if (prevResendKey !== undefined) process.env.RESEND_API_KEY = prevResendKey;
    else delete process.env.RESEND_API_KEY;
    if (prevEmailProvider !== undefined) process.env.EMAIL_PROVIDER = prevEmailProvider;
    else delete process.env.EMAIL_PROVIDER;
    if (prevMailFrom !== undefined) process.env.MAIL_FROM_ADDRESS = prevMailFrom;
    else delete process.env.MAIL_FROM_ADDRESS;

    // Cleanup temporary photo record
    await execute('DELETE FROM media_files WHERE id = ?', [testPhotoId]);
    server.close();
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runRegistrationCommunicationTests().catch((err) => {
  console.error('Fatal error during test suite execution:', err);
  process.exit(1);
});
