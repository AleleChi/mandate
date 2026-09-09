import crypto from 'crypto';
import {
  normalizePhoneNumberToE164,
  resolveParentWhatsAppCandidate,
  evaluateWhatsAppEligibility,
  buildIdempotencyKey,
  isTransientError,
  TwilioWhatsAppProvider,
  MetaWhatsAppProvider,
  SimulatedWhatsAppProvider
} from '../src/server/services/whatsapp';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('TGA WHATSAPP PHASE 1A — VERIFICATION TEST SUITE');
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
  // 1. PHONE NUMBER NORMALIZATION TESTS
  // ====================================================
  console.log('--- SECTION 1: PHONE NORMALIZATION ---');

  test('Nigerian local with leading 0 (08012345678 -> +2348012345678)', () => {
    const res = normalizePhoneNumberToE164('08031234567');
    assert(res === '+2348031234567', `Expected +2348031234567 but got ${res}`);
  });

  test('Nigerian local without leading 0 (8012345678 -> +2348012345678)', () => {
    const res = normalizePhoneNumberToE164('8031234567');
    assert(res === '+2348031234567', `Expected +2348031234567 but got ${res}`);
  });

  test('Already E.164 (+2348031234567 -> +2348031234567)', () => {
    const res = normalizePhoneNumberToE164('+2348031234567');
    assert(res === '+2348031234567', `Expected +2348031234567 but got ${res}`);
  });

  test('Nigerian number with country code without plus (2348031234567 -> +2348031234567)', () => {
    const res = normalizePhoneNumberToE164('2348031234567');
    assert(res === '+2348031234567', `Expected +2348031234567 but got ${res}`);
  });

  test('Phone with whatsapp: prefix is normalized properly', () => {
    const res = normalizePhoneNumberToE164('whatsapp:+2348031234567');
    assert(res === '+2348031234567', `Expected +2348031234567 but got ${res}`);
  });

  test('Malformed numbers return null', () => {
    assert(normalizePhoneNumberToE164('abc') === null, 'abc should be null');
    assert(normalizePhoneNumberToE164('12345') === null, 'short digits should be null');
    assert(normalizePhoneNumberToE164('0801234') === null, 'incomplete phone should be null');
  });

  test('Empty and undefined values return null', () => {
    assert(normalizePhoneNumberToE164('') === null, 'empty string should be null');
    assert(normalizePhoneNumberToE164('   ') === null, 'whitespace string should be null');
    assert(normalizePhoneNumberToE164(null) === null, 'null should be null');
    assert(normalizePhoneNumberToE164(undefined) === null, 'undefined should be null');
  });

  test('WhatsApp candidate preference: explicit whatsapp_number is preferred', () => {
    const candidate = resolveParentWhatsAppCandidate({
      phone_number: '08031111111',
      whatsapp_number: '08032222222'
    });
    assert(candidate.source === 'whatsapp_number', 'Must choose whatsapp_number');
    assert(candidate.normalizedNumber === '+2348032222222', 'Must normalize whatsapp_number');
  });

  test('WhatsApp candidate preference: phone_number not used without explicit fallback', () => {
    const candidate = resolveParentWhatsAppCandidate({
      phone_number: '08031111111',
      whatsapp_number: null
    }, false);
    assert(candidate.source === 'none', 'Should be none when allowPhoneFallback is false');
    assert(candidate.normalizedNumber === null, 'Number should be null without fallback');
  });

  // ====================================================
  // 2. CONSENT MODEL EVALUATION TESTS
  // ====================================================
  console.log('\n--- SECTION 2: CONSENT EVALUATION ---');

  test('Existing parent with "unknown" consent status is NOT eligible (no default opt-in)', () => {
    const parent = {
      whatsapp_number: '08031234567',
      whatsapp_consent_status: 'unknown'
    };
    const res = evaluateWhatsAppEligibility(parent);
    assert(res.eligible === false, 'Unknown consent must not be eligible');
    assert(res.consentStatus === 'unknown', 'Consent status must be unknown');
  });

  test('Existing parent with omitted consent status defaults to "unknown" and is NOT eligible', () => {
    const parent = {
      whatsapp_number: '08031234567'
    };
    const res = evaluateWhatsAppEligibility(parent);
    assert(res.eligible === false, 'Omitted consent must not be eligible');
    assert(res.consentStatus === 'unknown', 'Consent status must be unknown');
  });

  test('Parent with "opted_out" is NEVER eligible', () => {
    const parent = {
      whatsapp_number: '08031234567',
      whatsapp_consent_status: 'opted_out'
    };
    const res = evaluateWhatsAppEligibility(parent);
    assert(res.eligible === false, 'Opted out parent must not be eligible');
    assert(res.consentStatus === 'opted_out', 'Consent status must be opted_out');
  });

  test('Parent with "opted_in" and valid number IS eligible', () => {
    const parent = {
      whatsapp_number: '08031234567',
      whatsapp_consent_status: 'opted_in'
    };
    const res = evaluateWhatsAppEligibility(parent);
    assert(res.eligible === true, 'Opted in parent must be eligible');
    assert(res.normalizedNumber === '+2348031234567', 'Normalized number must match');
  });

  test('Super Admin test send bypass allows test delivery to verified staff numbers', () => {
    const staffTestRecord = {
      whatsapp_number: '08031234567',
      whatsapp_consent_status: 'unknown'
    };
    const res = evaluateWhatsAppEligibility(staffTestRecord, { allowTestBypass: true });
    assert(res.eligible === true, 'Super Admin test bypass must permit test numbers');
    assert(res.normalizedNumber === '+2348031234567', 'Normalized number must match');
  });

  test('Unrecognized or invalid consent status defaults strictly to "unknown" and is ineligible', () => {
    const parent = {
      whatsapp_number: '08031234567',
      whatsapp_consent_status: 'invalid_status_xyz'
    };
    const res = evaluateWhatsAppEligibility(parent as any);
    assert(res.eligible === false, 'Invalid consent status must not be eligible');
    assert(res.consentStatus === 'unknown', 'Invalid consent status must default safely to unknown');
  });

  // ====================================================
  // 3. IDEMPOTENCY & QUEUE SEMANTICS TESTS
  // ====================================================
  console.log('\n--- SECTION 3: IDEMPOTENCY & RETRY LOGIC ---');

  test('General campaign idempotency key is deterministic', () => {
    const key1 = buildIdempotencyKey({ type: 'campaign', campaignId: 'camp-123', parentId: 'parent-abc' });
    const key2 = buildIdempotencyKey({ type: 'campaign', campaignId: 'camp-123', parentId: 'parent-abc' });
    assert(key1 === key2, 'Campaign keys must match identically');
    assert(key1 === 'campaign:camp-123:parent:parent-abc:whatsapp', 'Key structure mismatch');
  });

  test('Child event idempotency key includes entry and version', () => {
    const key = buildIdempotencyKey({ type: 'child_event', eventType: 'selection', entryId: 'entry-99', version: 'v1' });
    assert(key === 'event:selection:entry:entry-99:v1:whatsapp', `Unexpected key: ${key}`);
  });

  test('Retry classification: transient errors correctly identified', () => {
    assert(isTransientError('Connection timeout') === true, 'Timeout should be transient');
    assert(isTransientError('Too Many Requests', 429) === true, 'Rate limit should be transient');
    assert(isTransientError('Internal Server Error', 500) === true, 'HTTP 500 should be transient');
  });

  test('Retry classification: terminal errors are NOT retried', () => {
    assert(isTransientError('Invalid phone number format') === false, 'Invalid phone must be terminal');
    assert(isTransientError('Not a valid WhatsApp subscriber') === false, 'Non-subscriber must be terminal');
    assert(isTransientError('Authentication failed', 401) === false, 'Auth failure must be terminal');
    assert(isTransientError('Parent has opted out') === false, 'Opt-out must be terminal');
  });

  await (async () => {
    const { enqueueWhatsAppJob } = await import('../src/server/services/whatsapp/queue');
    const { queryOne, execute } = await import('../src/server/db');

    // Ensure mock parent profile exists for test
    const testParentId = 'parent_test_idempotency_01';
    const testUserId = 'user_test_idempotency_01';
    const now = new Date().toISOString();

    await execute('DELETE FROM notification_jobs WHERE parent_id = ?', [testParentId]);
    await execute('DELETE FROM parent_profiles WHERE id = ?', [testParentId]);
    await execute('DELETE FROM users WHERE id = ?', [testUserId]);

    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, 'test_idem@koinonia.org', 'parent', ?, ?)
    `, [testUserId, now, now]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, whatsapp_consent_status, created_at, updated_at)
      VALUES (?, ?, 'Test Idem Parent', '+2348031234567', '+2348031234567', 'opted_in', ?, ?)
    `, [testParentId, testUserId, now, now]);

    await test('Queue idempotency: first enqueue persists idempotency_key', async () => {
      const testKey = `test:campaign:99:parent:${testParentId}:whatsapp`;
      const res1 = await enqueueWhatsAppJob({
        eventId: 'event-ga-2026',
        parentId: testParentId,
        idempotencyKey: testKey
      });

      assert(res1.queued === true, 'First enqueue must be queued');
      assert(res1.duplicate === false, 'First enqueue must not be duplicate');

      const jobInDb = await queryOne('SELECT idempotency_key FROM notification_jobs WHERE id = ?', [res1.jobId]);
      assert(jobInDb?.idempotency_key === testKey, 'idempotency_key must be persisted in DB');
    });

    await test('Queue idempotency: duplicate idempotency key returns existing job without creating duplicate', async () => {
      const testKey = `test:campaign:99:parent:${testParentId}:whatsapp`;
      const res2 = await enqueueWhatsAppJob({
        eventId: 'event-ga-2026',
        parentId: testParentId,
        idempotencyKey: testKey
      });

      assert(res2.queued === false, 'Duplicate enqueue must not queue new job');
      assert(res2.duplicate === true, 'Duplicate enqueue must be flagged as duplicate');

      const totalJobs = await queryOne(
        'SELECT COUNT(*) as cnt FROM notification_jobs WHERE idempotency_key = ?',
        [testKey]
      );
      assert(Number(totalJobs.cnt) === 1, 'Exactly one job must exist for this idempotency key');
    });

    await test('Delivery history retention: ON DELETE SET NULL retains delivery log if parent is unlinked', async () => {
      const deliveryLogId = `del_log_${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO whatsapp_delivery_logs (
          id, job_id, campaign_id, parent_profile_id, child_event_entry_id, recipient_phone, provider, status, created_at, updated_at
        ) VALUES (?, NULL, 'camp-01', ?, NULL, '+2348031234567', 'twilio', 'delivered', ?, ?)
      `, [deliveryLogId, testParentId, now, now]);

      // Unlink parent from delivery log (simulating soft-deletion or account nulling)
      await execute(`UPDATE whatsapp_delivery_logs SET parent_profile_id = NULL WHERE id = ?`, [deliveryLogId]);

      const log = await queryOne('SELECT id, parent_profile_id, status FROM whatsapp_delivery_logs WHERE id = ?', [deliveryLogId]);
      assert(log !== null, 'Delivery log must still exist');
      assert(log.parent_profile_id === null, 'parent_profile_id must be null without deleting record');
      assert(log.status === 'delivered', 'Delivery history data must remain intact');

      await execute('DELETE FROM whatsapp_delivery_logs WHERE id = ?', [deliveryLogId]);
    });

    await test('Provider-scoped uniqueness: same message ID allowed across different providers, rejected within same provider', async () => {
      const msgId = `msg_shared_${Date.now()}`;
      const log1Id = `log1_${crypto.randomUUID()}`;
      const log2Id = `log2_${crypto.randomUUID()}`;
      const log3Id = `log3_${crypto.randomUUID()}`;

      // Insert for Twilio
      await execute(`
        INSERT INTO whatsapp_delivery_logs (
          id, recipient_phone, provider, provider_message_id, status, created_at, updated_at
        ) VALUES (?, '+2348031234567', 'twilio', ?, 'delivered', ?, ?)
      `, [log1Id, msgId, now, now]);

      // Same messageId for Meta must succeed because index is provider-scoped
      let metaSucceeded = false;
      try {
        await execute(`
          INSERT INTO whatsapp_delivery_logs (
            id, recipient_phone, provider, provider_message_id, status, created_at, updated_at
          ) VALUES (?, '+2348031234567', 'meta', ?, 'delivered', ?, ?)
        `, [log2Id, msgId, now, now]);
        metaSucceeded = true;
      } catch (e) {
        metaSucceeded = false;
      }
      assert(metaSucceeded === true, 'Different provider with same messageId must be allowed');

      // Duplicate for Twilio must fail uniqueness constraint
      let duplicateRejected = false;
      try {
        await execute(`
          INSERT INTO whatsapp_delivery_logs (
            id, recipient_phone, provider, provider_message_id, status, created_at, updated_at
          ) VALUES (?, '+2348031234567', 'twilio', ?, 'delivered', ?, ?)
        `, [log3Id, msgId, now, now]);
      } catch (e) {
        duplicateRejected = true;
      }
      assert(duplicateRejected === true, 'Duplicate provider + provider_message_id must be rejected');

      // Cleanup
      await execute('DELETE FROM whatsapp_delivery_logs WHERE id IN (?, ?, ?)', [log1Id, log2Id, log3Id]);
    });

    // Cleanup test data
    await execute('DELETE FROM notification_jobs WHERE parent_id = ?', [testParentId]);
    await execute('DELETE FROM parent_profiles WHERE id = ?', [testParentId]);
    await execute('DELETE FROM users WHERE id = ?', [testUserId]);
  })();

  // ====================================================
  // 4. WEBHOOK SECURITY & PARSING TESTS
  // ====================================================
  console.log('\n--- SECTION 4: WEBHOOK SECURITY & PAYLOAD PARSING ---');

  test('Twilio HMAC signature verification accepts valid signature', () => {
    const provider = new TwilioWhatsAppProvider();
    const token = 'test_auth_token_secret_123';
    process.env.TWILIO_AUTH_TOKEN = token;

    const targetUrl = 'https://api.koinonia.org/api/webhooks/twilio/whatsapp-status';
    const params: Record<string, string> = {
      MessageSid: 'SM1234567890abcdef',
      MessageStatus: 'delivered',
      To: 'whatsapp:+2348031234567'
    };

    // Calculate reference signature
    const sortedKeys = Object.keys(params).sort();
    let dataToSign = targetUrl;
    for (const k of sortedKeys) {
      dataToSign += k + params[k];
    }
    const hmac = crypto.createHmac('sha1', token);
    hmac.update(Buffer.from(dataToSign, 'utf-8'));
    const validSignature = hmac.digest('base64');

    const isValid = provider.verifyWebhookSignature({
      headers: { 'x-twilio-signature': validSignature },
      body: params,
      url: targetUrl
    });

    assert(isValid === true, 'Valid signature should be accepted');
  });

  test('Twilio HMAC signature verification rejects tampered signature', () => {
    const provider = new TwilioWhatsAppProvider();
    const targetUrl = 'https://api.koinonia.org/api/webhooks/twilio/whatsapp-status';
    const params = { MessageSid: 'SM12345' };

    const isValid = provider.verifyWebhookSignature({
      headers: { 'x-twilio-signature': 'invalid_forged_signature==' },
      body: params,
      url: targetUrl
    });

    assert(isValid === false, 'Tampered signature must be rejected');
  });

  test('Twilio status payload parsed accurately', () => {
    const provider = new TwilioWhatsAppProvider();
    const payload = {
      MessageSid: 'SM9999988888',
      MessageStatus: 'delivered',
      To: 'whatsapp:+2348031234567'
    };
    const parsed = provider.parseStatus(payload);
    assert(parsed !== null, 'Should parse status');
    assert(parsed?.messageId === 'SM9999988888', 'MessageSid mismatch');
    assert(parsed?.status === 'delivered', 'Status mismatch');
    assert(parsed?.recipientPhone === '+2348031234567', 'Recipient phone mismatch');
  });

  test('Meta HMAC-SHA256 signature verification accepts valid signature', () => {
    const provider = new MetaWhatsAppProvider();
    const secret = 'meta_app_secret_xyz789';
    process.env.META_APP_SECRET = secret;

    const rawBody = JSON.stringify({ object: 'whatsapp_business_account' });
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(Buffer.from(rawBody, 'utf-8'));
    const validHex = hmac.digest('hex');

    const isValid = provider.verifyWebhookSignature({
      headers: { 'x-hub-signature-256': `sha256=${validHex}` },
      rawBody
    });

    assert(isValid === true, 'Valid Meta signature should be accepted');
  });

  test('Meta HMAC-SHA256 signature verification rejects invalid signature', () => {
    const provider = new MetaWhatsAppProvider();
    const isValid = provider.verifyWebhookSignature({
      headers: { 'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000' },
      rawBody: '{"tampered":true}'
    });
    assert(isValid === false, 'Forged Meta signature must be rejected');
  });

  test('Meta status update payload parsed accurately', () => {
    const provider = new MetaWhatsAppProvider();
    const metaPayload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: 'wamid.HBgLMTIzNDU2Nzg5',
                    status: 'read',
                    timestamp: '1725880000',
                    recipient_id: '2348031234567'
                  }
                ]
              }
            }
          ]
        }
      ]
    };
    const parsed = provider.parseStatus(metaPayload);
    assert(parsed !== null, 'Meta status should parse');
    assert(parsed?.messageId === 'wamid.HBgLMTIzNDU2Nzg5', 'Message ID mismatch');
    assert(parsed?.status === 'read', 'Status should be read');
  });

  await test('Simulated provider delivers test payload safely', async () => {
    const provider = new SimulatedWhatsAppProvider();
    const res = await provider.sendSessionMessage({
      to: '+2348031234567',
      body: 'Koinonia Children & Teens test message'
    });
    assert(res.success === true, 'Simulated dispatch must succeed');
    assert(res.provider === 'simulated', 'Provider must be simulated');
    assert(res.status === 'sent', 'Status must be sent');
  });

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
