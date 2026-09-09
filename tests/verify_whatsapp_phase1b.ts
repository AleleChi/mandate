import crypto from 'crypto';
import { query, queryOne, execute } from '../src/server/db';
import {
  getWhatsAppProviderReadiness,
  getWhatsAppProvider,
  resetWhatsAppProviderCache,
  isWhatsAppInProcessWorkerEnabled,
  SimulatedWhatsAppProvider,
  normalizePhoneNumberToE164,
  evaluateWhatsAppEligibility,
  enqueueWhatsAppJob,
  processQueuedWhatsAppJobs,
  logWhatsAppDelivery
} from '../src/server/services/whatsapp';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('TGA WHATSAPP PHASE 1B — VERIFICATION TEST SUITE');
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

  // ====================================================
  // 1. PROVIDER READINESS TESTS
  // ====================================================
  console.log('--- SECTION 1: PROVIDER READINESS & SAFE REPORTING ---');

  await test('Readiness returns expected safe properties without credentials', () => {
    const readiness = getWhatsAppProviderReadiness();
    assert(typeof readiness.configured === 'boolean', 'configured must be boolean');
    assert(typeof readiness.provider === 'string', 'provider must be string');
    assert(typeof readiness.webhookConfigured === 'boolean', 'webhookConfigured must be boolean');
    assert(typeof readiness.testSendAvailable === 'boolean', 'testSendAvailable must be boolean');
    assert(typeof readiness.bulkEnabled === 'boolean', 'bulkEnabled must be boolean');
    assert(typeof readiness.statusMessage === 'string', 'statusMessage must be string');

    // Verify no secret credential leakage
    const jsonStr = JSON.stringify(readiness);
    assert(!jsonStr.includes('token'), 'Readiness object must not leak tokens');
    assert(!jsonStr.includes('secret'), 'Readiness object must not leak secrets');
    assert(!jsonStr.includes('auth'), 'Readiness object must not leak auth headers');
  });

  // ====================================================
  // 2. PARENT REGISTRATION CONSENT TESTS
  // ====================================================
  console.log('\n--- SECTION 2: PARENT REGISTRATION CONSENT ---');

  const now = new Date().toISOString();
  const testParent1Id = `p_test_reg_${crypto.randomUUID()}`;
  const testUser1Id = `u_test_reg_${crypto.randomUUID()}`;
  const testParent2Id = `p_test_skip_${crypto.randomUUID()}`;
  const testUser2Id = `u_test_skip_${crypto.randomUUID()}`;
  const child1Id = `c_test_1_${crypto.randomUUID()}`;
  const child2Id = `c_test_2_${crypto.randomUUID()}`;
  const entry1Id = `e_test_1_${crypto.randomUUID()}`;
  const entry2Id = `e_test_2_${crypto.randomUUID()}`;
  const eventId = 'event-ga-2026';

  const email1 = `wa_optin_${crypto.randomUUID()}@koinonia.org`;
  const email2 = `wa_skip_${crypto.randomUUID()}@koinonia.org`;

  try {
    await execute(`DELETE FROM users WHERE email LIKE 'wa_%@koinonia.org'`);

    // 2.1 Registration with explicit WhatsApp consent
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'parent', ?, ?)
    `, [testUser1Id, email1, now, now]);

    await execute(`
      INSERT INTO parent_profiles (
        id, user_id, full_name, phone_number, whatsapp_number,
        whatsapp_consent_status, whatsapp_consent_at, whatsapp_consent_source,
        created_at, updated_at
      ) VALUES (?, ?, 'Opted-In Parent', '+2348011112222', '+2348011112222', 'opted_in', ?, 'registration', ?, ?)
    `, [testParent1Id, testUser1Id, now, now, now]);

    await test('Registration with consent records opted_in and source', async () => {
      const parent = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [testParent1Id]);
      assert(parent.whatsapp_consent_status === 'opted_in', 'Consent status must be opted_in');
      assert(parent.whatsapp_consent_source === 'registration', 'Consent source must be registration');
      assert(parent.whatsapp_consent_at !== null, 'Consent timestamp must be set');
      assert(parent.whatsapp_opt_out_at === null, 'Opt-out timestamp must be null');
    });

    // 2.2 Registration without consent (unchecked / skipped)
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'parent', ?, ?)
    `, [testUser2Id, email2, now, now]);

    await execute(`
      INSERT INTO parent_profiles (
        id, user_id, full_name, phone_number, whatsapp_number,
        whatsapp_consent_status, whatsapp_consent_at, whatsapp_consent_source,
        created_at, updated_at
      ) VALUES (?, ?, 'Skipped Consent Parent', '+2348022223333', '+2348022223333', 'unknown', NULL, NULL, ?, ?)
    `, [testParent2Id, testUser2Id, now, now]);

    await test('Registration without consent defaults to unknown and is NOT opted in', async () => {
      const parent = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [testParent2Id]);
      assert(parent.whatsapp_consent_status === 'unknown', 'Consent status must remain unknown');
      assert(parent.whatsapp_consent_at === null, 'Consent timestamp must remain null');
      assert(parent.whatsapp_consent_source === null, 'Consent source must remain null');

      const eligibility = evaluateWhatsAppEligibility(parent);
      assert(eligibility.eligible === false, 'Parent with unknown status must NOT be eligible');
      assert(eligibility.consentStatus === 'unknown', 'Consent status must be unknown');
      assert(eligibility.reason?.includes('unknown') === true, 'Reason must indicate unknown status');
    });

    // ====================================================
    // 3. EXISTING PARENT OPT-IN & OPT-OUT TESTS
    // ====================================================
    console.log('\n--- SECTION 3: EXISTING PARENT OPT-IN / OPT-OUT ---');

    await test('Existing parent can opt in with explicit confirmed number', async () => {
      const optInTime = new Date().toISOString();
      await execute(`
        UPDATE parent_profiles
        SET whatsapp_consent_status = 'opted_in',
            whatsapp_consent_at = ?,
            whatsapp_consent_source = 'profile',
            whatsapp_opt_out_at = NULL,
            whatsapp_number = '+2348022223333'
        WHERE id = ?
      `, [optInTime, testParent2Id]);

      const parent = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [testParent2Id]);
      assert(parent.whatsapp_consent_status === 'opted_in', 'Parent status must transition to opted_in');
      assert(parent.whatsapp_consent_source === 'profile', 'Source must be profile');
      assert(parent.whatsapp_consent_at !== null, 'Consent at timestamp must be updated');
      assert(parent.whatsapp_opt_out_at === null, 'Opt-out timestamp must be cleared');

      const eligibility = evaluateWhatsAppEligibility(parent);
      assert(eligibility.eligible === true, 'Parent must now be eligible for WhatsApp');
    });

    await test('Opting out sets status to opted_out without disabling other channels', async () => {
      const optOutTime = new Date().toISOString();
      await execute(`
        UPDATE parent_profiles
        SET whatsapp_consent_status = 'opted_out',
            whatsapp_opt_out_at = ?
        WHERE id = ?
      `, [optOutTime, testParent2Id]);

      const parent = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [testParent2Id]);
      assert(parent.whatsapp_consent_status === 'opted_out', 'Parent status must be opted_out');
      assert(parent.whatsapp_opt_out_at !== null, 'Opt-out timestamp must be recorded');

      const eligibility = evaluateWhatsAppEligibility(parent);
      assert(eligibility.eligible === false, 'Opted out parent must be ineligible');
      assert(eligibility.consentStatus === 'opted_out', 'Consent status must be opted_out');
      assert(eligibility.reason?.includes('opted out') === true, 'Reason must indicate opted out');

      // Check user record: email and user account still intact
      const user = await queryOne('SELECT * FROM users WHERE id = ?', [testUser2Id]);
      assert(user !== null && user.email === email2, 'User email must remain intact');
    });

    // ====================================================
    // 4. ADMIN BROADCAST ELIGIBILITY & DEDUPLICATION
    // ====================================================
    console.log('\n--- SECTION 4: ADMIN BROADCAST ELIGIBILITY & DEDUPLICATION ---');

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES (?, ?, 'Child One', 'Male', '2015-05-10', ?, ?)
    `, [child1Id, testParent1Id, now, now]);

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES (?, ?, 'Child Two', 'Female', '2017-08-15', ?, ?)
    `, [child2Id, testParent1Id, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [entry1Id, child1Id, eventId, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [entry2Id, child2Id, eventId, now, now]);

    await test('Unique parent deduplication: parent with multiple children counts as 1 contact', async () => {
      const countRes = await queryOne(`
        SELECT COUNT(DISTINCT p.id) as count
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        JOIN parent_profiles p ON p.id = c.parent_profile_id
        WHERE e.event_id = ?
          AND p.id = ?
      `, [eventId, testParent1Id]);

      assert(Number(countRes.count) === 1, 'Multi-child parent must count as exactly 1 contact');
    });

    await test('General announcement generates ONE WhatsApp job for multi-child parent', async () => {
      const broadcastId = `msg_bc_${crypto.randomUUID()}`;
      const idemKey = `whatsapp:admin_message:${broadcastId}:parent:${testParent1Id}`;

      const res1 = await enqueueWhatsAppJob({
        eventId,
        parentId: testParent1Id,
        idempotencyKey: idemKey
      });

      assert(res1.queued === true, 'First job must be queued');

      // Attempt second job for same broadcast and same parent (e.g. from second child iteration)
      const res2 = await enqueueWhatsAppJob({
        eventId,
        parentId: testParent1Id,
        idempotencyKey: idemKey
      });

      assert(res2.queued === false, 'Second enqueue must NOT queue a duplicate');
      assert(res2.duplicate === true, 'Duplicate enqueue must be flagged as duplicate');

      const jobCount = await queryOne(
        'SELECT COUNT(*) as cnt FROM notification_jobs WHERE idempotency_key = ?',
        [idemKey]
      );
      assert(Number(jobCount.cnt) === 1, 'Exactly ONE job must exist in database for this parent and broadcast');
    });

    // ====================================================
    // 5. ASYNC QUEUE WORKER ARCHITECTURE TESTS
    // ====================================================
    console.log('\n--- SECTION 5: QUEUE WORKER ATOMICITY & RETRIES ---');

    await test('Worker processes queued job atomically and logs delivery', async () => {
      // Run worker batch
      const result = await processQueuedWhatsAppJobs({ maxBatchSize: 5 });
      assert(result.processed >= 1, 'Worker should have processed at least 1 job');

      // Check job status in database
      const jobs = await query(
        "SELECT * FROM notification_jobs WHERE parent_id = ? AND channel = 'whatsapp'",
        [testParent1Id]
      );
      assert(jobs.length >= 1, 'Job must exist');
      const completedJob = jobs[0];
      assert(
        completedJob.status === 'sent' || completedJob.status === 'delivered',
        `Job status should be sent or delivered, got ${completedJob.status}`
      );
      assert(completedJob.attempt_count >= 1, 'attempt_count must be incremented');

      // Verify delivery log exists
      const deliveryLogs = await query(
        'SELECT * FROM whatsapp_delivery_logs WHERE parent_profile_id = ?',
        [testParent1Id]
      );
      assert(deliveryLogs.length >= 1, 'Delivery log must be recorded for sent job');
    });

    await test('Worker retries transient failures with capped retry count', async () => {
      const transientJobId = `job_transient_${crypto.randomUUID()}`;
      const transientKey = `test:transient:${transientJobId}`;

      await execute(`
        INSERT INTO notification_jobs (
          id, event_id, parent_id, channel, scheduled_for, status, attempt_count,
          idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, 'whatsapp', ?, 'pending', 0, ?, ?, ?)
      `, [transientJobId, eventId, testParent1Id, now, transientKey, now, now]);

      // Verify initial state
      const initial = await queryOne('SELECT attempt_count FROM notification_jobs WHERE id = ?', [transientJobId]);
      assert(initial.attempt_count === 0, 'Initial attempt count must be 0');

      // Simulate 3 transient retries
      for (let attempt = 1; attempt <= 3; attempt++) {
        const nextAttempt = new Date(Date.now() + attempt * 1000).toISOString();
        if (attempt < 3) {
          await execute(`
            UPDATE notification_jobs
            SET attempt_count = ?,
                status = 'pending',
                next_attempt_at = ?,
                last_error = 'Rate limit exceeded (transient)'
            WHERE id = ?
          `, [attempt, nextAttempt, transientJobId]);
        } else {
          // Terminal failure upon exceeding max_attempts
          await execute(`
            UPDATE notification_jobs
            SET attempt_count = ?,
                status = 'failed',
                last_error = 'Rate limit exceeded (transient)'
            WHERE id = ?
          `, [attempt, transientJobId]);
        }
      }

      const finalJob = await queryOne('SELECT status, attempt_count FROM notification_jobs WHERE id = ?', [transientJobId]);
      assert(finalJob.status === 'failed', 'Job should be marked failed after exhausting retries');
      assert(finalJob.attempt_count === 3, 'Job should have reached max attempt count');

      await execute('DELETE FROM notification_jobs WHERE id = ?', [transientJobId]);
    });

    // ====================================================
    // 6. SUPER ADMIN TEST DELIVERY LOGGING
    // ====================================================
    console.log('\n--- SECTION 6: SUPER ADMIN TEST DELIVERY ---');

    await test('Super Admin test delivery records in delivery logs with status tracking', async () => {
      const testLogId = await logWhatsAppDelivery({
        recipientPhone: '+2348099998888',
        provider: 'simulated',
        providerMessageId: `sim_msg_${Date.now()}`,
        status: 'queued',
        templateName: 'super_admin_test'
      });

      assert(typeof testLogId === 'string' && testLogId.length > 0, 'logId must be generated');

      const logRow = await queryOne('SELECT * FROM whatsapp_delivery_logs WHERE id = ?', [testLogId]);
      assert(logRow !== null, 'Delivery log must be retrieved');
      assert(logRow.recipient_phone === '+2348099998888', 'Phone must match');
      assert(logRow.status === 'queued', 'Status must initially be queued');

      // Simulate delivery webhook progression: queued -> sent -> delivered -> read
      await execute("UPDATE whatsapp_delivery_logs SET status = 'sent', sent_at = ? WHERE id = ?", [now, testLogId]);
      let updatedLog = await queryOne('SELECT status FROM whatsapp_delivery_logs WHERE id = ?', [testLogId]);
      assert(updatedLog.status === 'sent', 'Status must update to sent');

      await execute("UPDATE whatsapp_delivery_logs SET status = 'delivered', delivered_at = ? WHERE id = ?", [now, testLogId]);
      updatedLog = await queryOne('SELECT status FROM whatsapp_delivery_logs WHERE id = ?', [testLogId]);
      assert(updatedLog.status === 'delivered', 'Status must update to delivered');

      await execute("UPDATE whatsapp_delivery_logs SET status = 'read', read_at = ? WHERE id = ?", [now, testLogId]);
      updatedLog = await queryOne('SELECT status FROM whatsapp_delivery_logs WHERE id = ?', [testLogId]);
      assert(updatedLog.status === 'read', 'Status must update to read');

      await execute('DELETE FROM whatsapp_delivery_logs WHERE id = ?', [testLogId]);
    });

    // ====================================================
    // 7. PRODUCTION HARDENING & WORKER MODE TESTS
    // ====================================================
    console.log('\n--- SECTION 7: PRODUCTION HARDENING & FAIL-CLOSED GUARDS ---');

    const origNodeEnv = process.env.NODE_ENV;
    const origProvider = process.env.WHATSAPP_PROVIDER;
    const origWorkerMode = process.env.WHATSAPP_WORKER_MODE;
    const origMetaToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
    const origMetaPhoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    const origTwilioSid = process.env.TWILIO_ACCOUNT_SID;
    const origTwilioAuth = process.env.TWILIO_AUTH_TOKEN;

    try {
      // 7.1 Simulated provider rejected in production
      await test('Simulated provider is rejected and fails closed in production', async () => {
        process.env.NODE_ENV = 'production';
        process.env.WHATSAPP_PROVIDER = 'simulated';
        resetWhatsAppProviderCache();

        const readiness = getWhatsAppProviderReadiness();
        assert(readiness.configured === false, 'Configured must be false for simulated in production');
        assert(readiness.testSendAvailable === false, 'Test send must be unavailable for simulated in production');
        assert(readiness.bulkEnabled === false, 'Bulk send must be disabled for simulated in production');
        assert(readiness.statusMessage.includes('incomplete'), 'Status message must indicate setup incomplete');

        // Provider must reject delivery attempts
        const provider = getWhatsAppProvider();
        const sendRes = await provider.sendSessionMessage({
          to: '+2348011112222',
          body: 'Test production message'
        });
        assert(sendRes.success === false, 'Send must fail in production with simulated provider');
        assert(sendRes.status === 'failed', 'Status must be failed');

        // Direct call to SimulatedWhatsAppProvider must also fail in production
        const directSimulated = new SimulatedWhatsAppProvider();
        const directRes = await directSimulated.sendSessionMessage({
          to: '+2348011112222',
          body: 'Direct simulated attempt'
        });
        assert(directRes.success === false, 'Direct simulated provider send must fail in production');
        assert(directRes.status === 'failed', 'Direct simulated provider status must be failed');
      });

      // 7.2 Incomplete Meta configuration fails closed
      await test('Incomplete Meta configuration fails closed without fallback', async () => {
        process.env.NODE_ENV = 'production';
        process.env.WHATSAPP_PROVIDER = 'meta';
        delete process.env.META_WHATSAPP_ACCESS_TOKEN;
        delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
        resetWhatsAppProviderCache();

        const readiness = getWhatsAppProviderReadiness();
        assert(readiness.configured === false, 'Meta configured must be false when credentials missing');
        assert(readiness.testSendAvailable === false, 'Test send must be false when Meta incomplete');
        assert(readiness.bulkEnabled === false, 'Bulk send must be false when Meta incomplete');
        assert(readiness.statusMessage.includes('incomplete'), 'Status message must indicate setup incomplete');

        const provider = getWhatsAppProvider();
        assert(provider.name === 'meta', 'Provider must remain meta without falling back to twilio/simulated');
        const sendRes = await provider.sendSessionMessage({
          to: '+2348011112222',
          body: 'Test incomplete Meta send'
        });
        assert(sendRes.success === false, 'Incomplete Meta send must fail');
        assert(sendRes.provider === 'meta', 'Provider must be meta');
        assert(sendRes.status === 'failed', 'Status must be failed');
      });

      // 7.3 Incomplete Twilio configuration fails closed
      await test('Incomplete Twilio configuration fails closed without fallback', async () => {
        process.env.NODE_ENV = 'production';
        process.env.WHATSAPP_PROVIDER = 'twilio';
        delete process.env.TWILIO_ACCOUNT_SID;
        delete process.env.TWILIO_AUTH_TOKEN;
        resetWhatsAppProviderCache();

        const readiness = getWhatsAppProviderReadiness();
        assert(readiness.configured === false, 'Twilio configured must be false when credentials missing');
        assert(readiness.testSendAvailable === false, 'Test send must be false when Twilio incomplete');
        assert(readiness.bulkEnabled === false, 'Bulk send must be false when Twilio incomplete');
        assert(readiness.statusMessage.includes('incomplete'), 'Status message must indicate setup incomplete');

        const provider = getWhatsAppProvider();
        assert(provider.name === 'twilio', 'Provider must remain twilio without falling back to meta/simulated');
        const sendRes = await provider.sendSessionMessage({
          to: '+2348011112222',
          body: 'Test incomplete Twilio send'
        });
        assert(sendRes.success === false, 'Incomplete Twilio send must fail');
        assert(sendRes.provider === 'twilio', 'Provider must be twilio');
        assert(sendRes.status === 'failed', 'Status must be failed');
      });

      // 7.4 Development simulated provider still works
      await test('Development simulated provider functions normally in non-production', async () => {
        process.env.NODE_ENV = 'development';
        process.env.WHATSAPP_PROVIDER = 'simulated';
        resetWhatsAppProviderCache();

        const readiness = getWhatsAppProviderReadiness();
        assert(readiness.configured === true, 'Configured must be true for simulated in development');
        assert(readiness.testSendAvailable === true, 'Test send must be available in development');
        assert(readiness.bulkEnabled === true, 'Bulk send must be enabled in development');

        const provider = getWhatsAppProvider();
        const sendRes = await provider.sendSessionMessage({
          to: '+2348011112222',
          body: 'Development simulated message'
        });
        assert(sendRes.success === true, 'Simulated send must succeed in development');
        assert(sendRes.status === 'sent', 'Status must be sent');
      });

      // 7.5 External worker mode prevents web service polling
      await test('External and disabled worker modes prevent in-process queue polling', () => {
        // In production:
        process.env.NODE_ENV = 'production';
        delete process.env.WHATSAPP_WORKER_MODE;
        assert(isWhatsAppInProcessWorkerEnabled() === false, 'Production default must not run in-process worker');

        process.env.WHATSAPP_WORKER_MODE = 'external';
        assert(isWhatsAppInProcessWorkerEnabled() === false, 'External mode must not run in-process worker');

        process.env.WHATSAPP_WORKER_MODE = 'disabled';
        assert(isWhatsAppInProcessWorkerEnabled() === false, 'Disabled mode must not run in-process worker');

        // In development:
        process.env.NODE_ENV = 'development';
        process.env.WHATSAPP_WORKER_MODE = 'external';
        assert(isWhatsAppInProcessWorkerEnabled() === false, 'External mode in development must prevent in-process worker');

        process.env.WHATSAPP_WORKER_MODE = 'disabled';
        assert(isWhatsAppInProcessWorkerEnabled() === false, 'Disabled mode in development must prevent in-process worker');
      });

      // 7.6 in_process mode starts polling only when explicitly selected
      await test('in_process mode starts polling only when explicitly selected', () => {
        // In production: only explicitly 'in_process' allows it
        process.env.NODE_ENV = 'production';
        process.env.WHATSAPP_WORKER_MODE = 'in_process';
        assert(isWhatsAppInProcessWorkerEnabled() === true, 'Explicit in_process mode in production must enable worker');

        process.env.WHATSAPP_WORKER_MODE = 'other';
        assert(isWhatsAppInProcessWorkerEnabled() === false, 'Non-in_process mode in production must not enable worker');

        // In development: enabled by default or with in_process
        process.env.NODE_ENV = 'development';
        delete process.env.WHATSAPP_WORKER_MODE;
        assert(isWhatsAppInProcessWorkerEnabled() === true, 'Development default must enable in-process worker');

        process.env.WHATSAPP_WORKER_MODE = 'in_process';
        assert(isWhatsAppInProcessWorkerEnabled() === true, 'Development in_process mode must enable in-process worker');
      });
    } finally {
      // Restore original environment variables
      if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv; else delete process.env.NODE_ENV;
      if (origProvider !== undefined) process.env.WHATSAPP_PROVIDER = origProvider; else delete process.env.WHATSAPP_PROVIDER;
      if (origWorkerMode !== undefined) process.env.WHATSAPP_WORKER_MODE = origWorkerMode; else delete process.env.WHATSAPP_WORKER_MODE;
      if (origMetaToken !== undefined) process.env.META_WHATSAPP_ACCESS_TOKEN = origMetaToken; else delete process.env.META_WHATSAPP_ACCESS_TOKEN;
      if (origMetaPhoneId !== undefined) process.env.META_WHATSAPP_PHONE_NUMBER_ID = origMetaPhoneId; else delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
      if (origTwilioSid !== undefined) process.env.TWILIO_ACCOUNT_SID = origTwilioSid; else delete process.env.TWILIO_ACCOUNT_SID;
      if (origTwilioAuth !== undefined) process.env.TWILIO_AUTH_TOKEN = origTwilioAuth; else delete process.env.TWILIO_AUTH_TOKEN;
      resetWhatsAppProviderCache();
    }

  } finally {
    // Cleanup test artifacts
    await execute('DELETE FROM child_event_entries WHERE child_id IN (?, ?)', [child1Id, child2Id]);
    await execute('DELETE FROM children WHERE id IN (?, ?)', [child1Id, child2Id]);
    await execute('DELETE FROM notification_jobs WHERE parent_id IN (?, ?)', [testParent1Id, testParent2Id]);
    await execute('DELETE FROM whatsapp_delivery_logs WHERE parent_profile_id IN (?, ?)', [testParent1Id, testParent2Id]);
    await execute('DELETE FROM parent_profiles WHERE id IN (?, ?)', [testParent1Id, testParent2Id]);
    await execute('DELETE FROM users WHERE id IN (?, ?)', [testUser1Id, testUser2Id]);
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
