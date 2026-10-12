/**
 * Comprehensive Zoho CPaaS WhatsApp Provider Test Suite
 * Tests all requirements from Section 14:
 * - missing provider defaults to Twilio
 * - blank provider defaults to Twilio
 * - explicit Twilio uses Twilio
 * - explicit Zoho uses Zoho
 * - invalid provider performs zero calls
 * - correct endpoint
 * - correct Authorization header format
 * - API key never leaks into error output
 * - from/to E.164
 * - template_key request
 * - template_alias request
 * - merge_info
 * - stable client_reference
 * - successful acceptance maps to queued
 * - message_id captured
 * - 400 normalized
 * - 401 normalized
 * - 429 normalized
 * - Retry-After captured if supplied
 * - 500 normalized
 * - timeout normalized
 * - zero provider-level retry after timeout
 * - malformed phone blocked before network call
 * - missing template mapping blocked before network call
 *
 * Plus:
 * - getMessageStatus log endpoint & state mapping
 * - webhook HMAC-SHA256 verification (fails closed when unconfigured)
 * - readiness reporting with twilioConfigured, zohoConfigured, activeProvider
 *
 * All HTTP requests are strictly mocked. ZERO real external network calls.
 */

import crypto from 'crypto';
import {
  ZohoWhatsAppProvider,
  DEFAULT_ZOHO_WHATSAPP_API_URL,
  isZohoWhatsAppConfigured,
  resolveZohoTemplateConfig,
  parseTemplateValue
} from '../src/server/services/whatsapp/zohoProvider';
import {
  getWhatsAppProvider,
  resolveWhatsAppProviderName,
  resetWhatsAppProviderCache,
  getWhatsAppProviderReadiness
} from '../src/server/services/whatsapp';
import { sendWhatsApp } from '../src/server/services/notifications';
import { evaluateWhatsAppEligibility } from '../src/server/services/whatsapp/consent';
import { getDb, execute, queryOne } from '../src/server/db';
import { handleDeliveryStatusUpdate, canTransitionStatus } from '../src/server/routes/webhooks';

interface MockFetchCall {
  url: string;
  options: any;
}

let mockFetchCalls: MockFetchCall[] = [];
let mockFetchResponse: {
  status: number;
  headers?: Record<string, string>;
  json?: any;
  text?: string;
  shouldHang?: boolean;
} = {
  status: 200,
  json: { message_id: 'wa_msg_zoho_test_123', request_id: 'req_zoho_456' }
};

const originalFetch = global.fetch;

function setupMockFetch() {
  mockFetchCalls = [];
  global.fetch = (async (url: any, options: any) => {
    mockFetchCalls.push({ url: String(url), options });

    if (mockFetchResponse.shouldHang) {
      return new Promise((_, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    }

    const headersMap = new Map<string, string>();
    if (mockFetchResponse.headers) {
      for (const [k, v] of Object.entries(mockFetchResponse.headers)) {
        headersMap.set(k.toLowerCase(), v);
      }
    }

    return {
      status: mockFetchResponse.status,
      ok: mockFetchResponse.status >= 200 && mockFetchResponse.status < 300,
      headers: {
        get: (h: string) => headersMap.get(h.toLowerCase()) || null
      },
      text: async () => mockFetchResponse.text || JSON.stringify(mockFetchResponse.json || {}),
      json: async () => mockFetchResponse.json || {}
    } as any;
  }) as any;
}

function restoreFetch() {
  global.fetch = originalFetch;
}

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }
  passedTests++;
  console.log(`  ✓ ${message}`);
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('ZOHO CPAAS WHATSAPP PROVIDER — VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  setupMockFetch();
  const originalEnv = { ...process.env };

  const FAKE_ZOHO_KEY = 'zoho_cpaas_secret_api_key_xyz987654321';
  const FAKE_ZOHO_FROM = '+2348039999999';
  const FAKE_TEMPLATE_KEY = '7f8a9b0c-1234-5678-9abc-def012345678';
  const FAKE_TEMPLATE_ALIAS = 'parent_review_notice';

  try {
    // ----------------------------------------------------
    // SECTION 1: PROVIDER SELECTION & SAFE DEFAULTS
    // ----------------------------------------------------
    console.log('--- SECTION 1: PROVIDER SELECTION & SAFE DEFAULTS ---');

    // Test 1: missing provider defaults to Twilio
    delete process.env.WHATSAPP_PROVIDER;
    resetWhatsAppProviderCache();
    assert(
      resolveWhatsAppProviderName() === 'twilio',
      'Missing WHATSAPP_PROVIDER resolves to twilio'
    );

    process.env.NODE_ENV = 'production';
    resetWhatsAppProviderCache();
    const providerMissing = getWhatsAppProvider();
    assert(
      providerMissing.name === 'twilio',
      'In production, missing WHATSAPP_PROVIDER instantiates Twilio provider'
    );

    // Test 2: blank provider defaults to Twilio
    process.env.WHATSAPP_PROVIDER = '   ';
    resetWhatsAppProviderCache();
    assert(
      resolveWhatsAppProviderName() === 'twilio',
      'Blank WHATSAPP_PROVIDER resolves to twilio'
    );
    const providerBlank = getWhatsAppProvider();
    assert(
      providerBlank.name === 'twilio',
      'In production, blank WHATSAPP_PROVIDER instantiates Twilio provider'
    );

    // Test 3: explicit Twilio uses Twilio
    process.env.WHATSAPP_PROVIDER = 'twilio';
    resetWhatsAppProviderCache();
    assert(
      resolveWhatsAppProviderName() === 'twilio',
      'Explicit WHATSAPP_PROVIDER=twilio resolves to twilio'
    );
    const providerTwilio = getWhatsAppProvider();
    assert(
      providerTwilio.name === 'twilio',
      'Explicit WHATSAPP_PROVIDER=twilio instantiates Twilio provider'
    );

    // Test 4: explicit Zoho uses Zoho
    process.env.WHATSAPP_PROVIDER = 'zoho';
    resetWhatsAppProviderCache();
    assert(
      resolveWhatsAppProviderName() === 'zoho',
      'Explicit WHATSAPP_PROVIDER=zoho resolves to zoho'
    );
    const providerZoho = getWhatsAppProvider();
    assert(
      providerZoho.name === 'zoho',
      'Explicit WHATSAPP_PROVIDER=zoho instantiates Zoho provider'
    );

    // Test 5: invalid provider performs zero calls
    process.env.WHATSAPP_PROVIDER = 'unsupported_vendor';
    resetWhatsAppProviderCache();
    mockFetchCalls = [];
    assert(
      resolveWhatsAppProviderName() === 'unsupported',
      'Unsupported WHATSAPP_PROVIDER resolves to unsupported'
    );
    const providerInvalid = getWhatsAppProvider();
    const invalidResult = await providerInvalid.sendSessionMessage({
      to: '+2348012345678',
      body: 'Should never send'
    });
    assert(
      !invalidResult.success && invalidResult.status === 'failed',
      'Unsupported provider fails closed with status=failed'
    );
    assert(
      mockFetchCalls.length === 0,
      'Unsupported provider performs ZERO network calls'
    );

    // ----------------------------------------------------
    // SECTION 2: ZOHO API CONTRACT & CREDENTIAL SECURITY
    // ----------------------------------------------------
    console.log('\n--- SECTION 2: ZOHO API CONTRACT & CREDENTIAL SECURITY ---');

    process.env.NODE_ENV = 'production';
    process.env.WHATSAPP_PROVIDER = 'zoho';
    process.env.ZOHO_WHATSAPP_API_URL = DEFAULT_ZOHO_WHATSAPP_API_URL;
    process.env.ZOHO_WHATSAPP_API_KEY = FAKE_ZOHO_KEY;
    process.env.ZOHO_WHATSAPP_FROM = FAKE_ZOHO_FROM;
    process.env.ZOHO_WHATSAPP_TIMEOUT_MS = '10000';
    process.env.ZOHO_WA_DEFAULT_TEMPLATE = `alias:${FAKE_TEMPLATE_ALIAS}`;
    resetWhatsAppProviderCache();

    const zohoProvider = new ZohoWhatsAppProvider();

    // Test 6: correct endpoint
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 200,
      json: { message_id: 'wa_zoho_1001', request_id: 'req_1001', client_reference: 'ref_1001' }
    };
    await zohoProvider.sendSessionMessage({
      to: '+2348012345678',
      body: 'Test payload',
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    assert(
      mockFetchCalls.length === 1 && mockFetchCalls[0].url === 'https://cpaas.zoho.com/v1.1/whatsapp',
      'Dispatches to correct endpoint: https://cpaas.zoho.com/v1.1/whatsapp'
    );

    // Test 7: correct Authorization header format
    const authHeader = mockFetchCalls[0].options.headers['Authorization'];
    const contentType = mockFetchCalls[0].options.headers['Content-Type'];
    assert(
      authHeader === `Zoho-enczapikey ${FAKE_ZOHO_KEY}`,
      'Correct Authorization header format: Zoho-enczapikey <KEY>'
    );
    assert(
      contentType === 'application/json',
      'Correct Content-Type header: application/json'
    );

    // Test 8: API key never leaks into error output
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 400,
      json: {
        message: `Invalid request with secret ${FAKE_ZOHO_KEY} included in debug`,
        error: 'BAD_REQUEST'
      }
    };
    const leakResult = await zohoProvider.sendSessionMessage({
      to: '+2348012345678',
      body: 'Test leak',
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    assert(
      !leakResult.success,
      'Error response correctly marks success=false'
    );
    assert(
      !leakResult.error?.includes(FAKE_ZOHO_KEY),
      'API key NEVER leaks into error string (properly sanitized/redacted)'
    );

    // Test 8b: Missing API key fails closed before network call
    delete process.env.ZOHO_WHATSAPP_API_KEY;
    mockFetchCalls = [];
    const missingKeyRes = await zohoProvider.sendSessionMessage({
      to: '+2348012345678',
      body: 'Test missing key',
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    assert(
      missingKeyRes.success === false && missingKeyRes.error?.includes('API key'),
      'Missing API key returns failed result with diagnostic error'
    );
    assert(
      mockFetchCalls.length === 0,
      'Missing API key blocked before ANY network call is dispatched'
    );

    // Test 8c: Missing sender number fails closed before network call
    process.env.ZOHO_WHATSAPP_API_KEY = FAKE_ZOHO_KEY;
    delete process.env.ZOHO_WHATSAPP_FROM;
    mockFetchCalls = [];
    const missingFromRes = await zohoProvider.sendSessionMessage({
      to: '+2348012345678',
      body: 'Test missing sender',
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    assert(
      missingFromRes.success === false && missingFromRes.error?.includes('sender number'),
      'Missing sender number returns failed result with diagnostic error'
    );
    assert(
      mockFetchCalls.length === 0,
      'Missing sender number blocked before ANY network call is dispatched'
    );

    // Test 8d: Invalid sender number fails closed before network call
    process.env.ZOHO_WHATSAPP_FROM = 'invalid-sender-phone';
    mockFetchCalls = [];
    const invalidFromRes = await zohoProvider.sendSessionMessage({
      to: '+2348012345678',
      body: 'Test invalid sender',
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    assert(
      invalidFromRes.success === false && invalidFromRes.error?.includes('Invalid sender phone number'),
      'Invalid sender number returns failed result with normalization error'
    );
    assert(
      mockFetchCalls.length === 0,
      'Invalid sender number blocked before ANY network call is dispatched'
    );

    // Restore sender and key
    process.env.ZOHO_WHATSAPP_API_KEY = FAKE_ZOHO_KEY;
    process.env.ZOHO_WHATSAPP_FROM = FAKE_ZOHO_FROM;

    // ----------------------------------------------------
    // SECTION 3: PHONE NORMALIZATION & TEMPLATE CONTRACT
    // ----------------------------------------------------
    console.log('\n--- SECTION 3: PHONE NORMALIZATION & TEMPLATE CONTRACT ---');

    // Test 9: from/to E.164 normalization
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 200,
      json: { message_id: 'wa_norm_1', request_id: 'req_norm_1' }
    };
    await zohoProvider.sendSessionMessage({
      to: '08012345678', // Nigerian local format without +234
      body: 'Test normalization',
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    const parsedBody1 = JSON.parse(mockFetchCalls[0].options.body);
    assert(
      parsedBody1.to === '+2348012345678',
      'Recipient normalized to E.164 (+2348012345678)'
    );
    assert(
      parsedBody1.from === '+2348039999999',
      'Sender normalized to E.164 (+2348039999999)'
    );

    // Test 10: template_key request (strictly ONE of key or alias)
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 200,
      json: { message_id: 'wa_tk_1', request_id: 'req_tk_1' }
    };
    await zohoProvider.sendTemplate({
      to: '+2348012345678',
      templateKey: FAKE_TEMPLATE_KEY
    });
    const parsedBodyKey = JSON.parse(mockFetchCalls[0].options.body);
    assert(
      parsedBodyKey.template_key === FAKE_TEMPLATE_KEY && parsedBodyKey.template_alias === undefined,
      'Template key request includes template_key and excludes template_alias'
    );

    // Test 11: template_alias request (strictly ONE of key or alias)
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 200,
      json: { message_id: 'wa_ta_1', request_id: 'req_ta_1' }
    };
    await zohoProvider.sendTemplate({
      to: '+2348012345678',
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    const parsedBodyAlias = JSON.parse(mockFetchCalls[0].options.body);
    assert(
      parsedBodyAlias.template_alias === FAKE_TEMPLATE_ALIAS && parsedBodyAlias.template_key === undefined,
      'Template alias request includes template_alias and excludes template_key'
    );

    // Test 11b: both template selectors present -> reject
    mockFetchCalls = [];
    const bothTemplatesRes = await zohoProvider.sendTemplate({
      to: '+2348012345678',
      templateKey: FAKE_TEMPLATE_KEY,
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    assert(
      bothTemplatesRes.success === false && bothTemplatesRes.error?.includes('Cannot specify both'),
      'Specifying both templateKey and templateAlias is rejected'
    );
    assert(
      mockFetchCalls.length === 0,
      'Both template selectors error blocked before ANY network call is dispatched'
    );

    // Template identifier parsing safety
    const parsedKeyPrefix = parseTemplateValue('key:1ba7d8d0-b680-11f1-91b5-d2a30e0412c2');
    assert(
      parsedKeyPrefix.templateKey === '1ba7d8d0-b680-11f1-91b5-d2a30e0412c2' && parsedKeyPrefix.templateAlias === undefined,
      'key:<uuid> explicitly resolves to templateKey'
    );

    const parsedAliasPrefix = parseTemplateValue('alias:parent_registration_ack');
    assert(
      parsedAliasPrefix.templateAlias === 'parent_registration_ack' && parsedAliasPrefix.templateKey === undefined,
      'alias:<name> explicitly resolves to templateAlias'
    );

    const parsedBareUUID = parseTemplateValue('1ba7d8d0-b680-11f1-91b5-d2a30e0412c2');
    assert(
      parsedBareUUID.templateKey === '1ba7d8d0-b680-11f1-91b5-d2a30e0412c2' && parsedBareUUID.templateAlias === undefined,
      'Bare documented UUID maps to templateKey'
    );

    const parsedBareAlias = parseTemplateValue('parent_registration_ack');
    assert(
      parsedBareAlias.templateAlias === 'parent_registration_ack' && parsedBareAlias.templateKey === undefined,
      'Bare string maps to templateAlias'
    );

    const parsed32Hex = parseTemplateValue('0123456789abcdef0123456789abcdef');
    assert(
      parsed32Hex.templateAlias === '0123456789abcdef0123456789abcdef' && parsed32Hex.templateKey === undefined,
      'Arbitrary 32-hex string maps to templateAlias (NOT inferred as templateKey)'
    );

    // Test 12: merge_info
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 200,
      json: { message_id: 'wa_mi_1', request_id: 'req_mi_1' }
    };
    await zohoProvider.sendTemplate({
      to: '+2348012345678',
      templateAlias: FAKE_TEMPLATE_ALIAS,
      mergeInfo: { parent_name: 'Brother John', child_name: 'Grace' }
    });
    const parsedBodyMerge = JSON.parse(mockFetchCalls[0].options.body);
    assert(
      parsedBodyMerge.merge_info?.parent_name === 'Brother John' &&
      parsedBodyMerge.merge_info?.child_name === 'Grace',
      'merge_info correctly constructed with key-value map'
    );

    // Test 13: stable client_reference capped at 100 characters
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 200,
      json: { message_id: 'wa_cr_1', request_id: 'req_cr_1' }
    };
    const longRef = 'delivery-job-uuid-1234567890-koinonia-children-parent-ack-' + 'a'.repeat(80);
    await zohoProvider.sendTemplate({
      to: '+2348012345678',
      templateAlias: FAKE_TEMPLATE_ALIAS,
      clientReference: longRef
    });
    const parsedBodyRef = JSON.parse(mockFetchCalls[0].options.body);
    assert(
      parsedBodyRef.client_reference !== undefined && parsedBodyRef.client_reference.length <= 100,
      'client_reference included and capped at 100 characters'
    );
    assert(
      parsedBodyRef.client_reference === longRef.slice(0, 100),
      'client_reference accurately retains stable prefix identifier'
    );

    // ----------------------------------------------------
    // SECTION 4: RESPONSE HANDLING & NORMALIZED STATES
    // ----------------------------------------------------
    console.log('\n--- SECTION 4: RESPONSE HANDLING & NORMALIZED STATES ---');

    // Test 14: exact official Zoho response acceptance maps to queued
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 200,
      json: {
        data: {
          code: 'MSG_101',
          message_id: '1ba7d8d0-b680-11f1-91b5-d2a30e0412c2',
          message: 'Message queued',
          request_id: '2d6f.14350939.wa1.example'
        },
        status: 'success'
      }
    };
    const acceptRes = await zohoProvider.sendSessionMessage({
      to: '+2348012345678',
      body: 'Queued test',
      templateAlias: FAKE_TEMPLATE_ALIAS,
      clientReference: 'stable-client-ref-123'
    });
    assert(
      acceptRes.success === true && acceptRes.status === 'queued',
      'Successful acceptance maps strictly to status="queued" (NOT marked delivered)'
    );

    // Test 15: message_id and request_id captured from exact official response
    assert(
      acceptRes.messageId === '1ba7d8d0-b680-11f1-91b5-d2a30e0412c2',
      'messageId matches exact official response data.message_id ("1ba7d8d0-b680-11f1-91b5-d2a30e0412c2")'
    );
    assert(
      acceptRes.requestId === '2d6f.14350939.wa1.example',
      'requestId matches exact official response data.request_id ("2d6f.14350939.wa1.example")'
    );
    assert(
      acceptRes.clientReference === 'stable-client-ref-123',
      'clientReference matches original stable client_reference'
    );

    // Test 15b: HTTP 200 with empty data returns normalized failure
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 200,
      json: {
        status: 'success',
        data: {}
      }
    };
    const emptyDataRes = await zohoProvider.sendSessionMessage({
      to: '+2348012345678',
      body: 'Missing message id test',
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    assert(
      emptyDataRes.success === false && emptyDataRes.status === 'failed',
      'HTTP 200 with empty data envelope returns normalized failure (NOT queued success)'
    );
    assert(
      emptyDataRes.error?.includes('missing required message_id') || emptyDataRes.error !== undefined,
      'Failure returns normalized provider-response error'
    );

    // Test 16: 400 normalized
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 400,
      json: { message: 'Invalid parameter value', code: 'INVALID_DATA' }
    };
    const err400 = await zohoProvider.sendSessionMessage({
      to: '+2348012345678',
      body: 'Bad request test',
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    assert(
      !err400.success && err400.status === 'failed' && (err400.error?.includes('Invalid parameter') ?? false),
      'HTTP 400 normalized to status="failed" with clear error message'
    );

    // Test 17: 401 normalized
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 401,
      json: { message: 'Unauthorized' }
    };
    const err401 = await zohoProvider.sendSessionMessage({
      to: '+2348012345678',
      body: 'Auth test',
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    assert(
      !err401.success && err401.status === 'failed' && (err401.error?.includes('401') ?? false),
      'HTTP 401 normalized to configuration error indicating invalid credentials'
    );

    // Test 18: 429 normalized
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 429,
      headers: { 'Retry-After': '25' },
      json: { message: 'Rate limit exceeded' }
    };
    const err429 = await zohoProvider.sendSessionMessage({
      to: '+2348012345678',
      body: 'Rate limit test',
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    assert(
      !err429.success && err429.status === 'failed' && (err429.error?.includes('429') ?? false),
      'HTTP 429 normalized to rate limit failure'
    );

    // Test 19: Retry-After captured if supplied
    assert(
      err429.retryAfter === 25,
      'Retry-After header value (25s) is captured and parsed as integer'
    );

    // Test 20: 500 normalized
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 500,
      json: { message: 'Internal Server Error' }
    };
    const err500 = await zohoProvider.sendSessionMessage({
      to: '+2348012345678',
      body: 'Server error test',
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    assert(
      !err500.success && err500.status === 'failed' && (err500.error?.includes('500') ?? false),
      'HTTP 500 normalized to service unavailable error'
    );

    // ----------------------------------------------------
    // SECTION 5: TIMEOUT, RETRIES & PRE-NETWORK GUARDS
    // ----------------------------------------------------
    console.log('\n--- SECTION 5: TIMEOUT, RETRIES & PRE-NETWORK GUARDS ---');

    // Test 21: timeout normalized
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 200,
      shouldHang: true
    };
    process.env.ZOHO_WHATSAPP_TIMEOUT_MS = '50'; // fast timeout for test
    const timeoutProvider = new ZohoWhatsAppProvider();
    const timeoutRes = await timeoutProvider.sendSessionMessage({
      to: '+2348012345678',
      body: 'Timeout test',
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    assert(
      !timeoutRes.success && timeoutRes.status === 'failed' && (timeoutRes.error?.toLowerCase().includes('timed out') ?? false),
      'Timeout normalized via AbortController with diagnostic error'
    );

    // Test 22: zero provider-level retry after timeout
    assert(
      mockFetchCalls.length === 1,
      'Zero provider-level retry after timeout (preserves external queue retry safety)'
    );

    // Reset timeout
    process.env.ZOHO_WHATSAPP_TIMEOUT_MS = '10000';
    mockFetchResponse = { status: 200, json: { message_id: 'wa_ok' } };

    // Test 23: malformed phone blocked before network call
    mockFetchCalls = [];
    const badPhoneRes = await zohoProvider.sendSessionMessage({
      to: 'invalid-not-a-number',
      body: 'Bad phone test',
      templateAlias: FAKE_TEMPLATE_ALIAS
    });
    assert(
      !badPhoneRes.success && (badPhoneRes.error?.includes('Invalid recipient') ?? false),
      'Malformed phone number is rejected'
    );
    assert(
      mockFetchCalls.length === 0,
      'Malformed phone blocked before ANY network call is dispatched'
    );

    // Test 24: missing template mapping blocked before network call
    delete process.env.ZOHO_WA_DEFAULT_TEMPLATE;
    delete process.env.ZOHO_WA_TEMPLATE_BROADCAST;
    mockFetchCalls = [];
    const unconfiguredTemplateRes = await zohoProvider.sendSessionMessage({
      to: '+2348012345678',
      body: 'No template test'
      // no templateKey, no templateAlias, and no matching env var
    });
    assert(
      !unconfiguredTemplateRes.success && unconfiguredTemplateRes.error === 'ZOHO_TEMPLATE_NOT_CONFIGURED',
      'Missing template mapping fails explicitly with ZOHO_TEMPLATE_NOT_CONFIGURED'
    );
    assert(
      mockFetchCalls.length === 0,
      'Missing template mapping blocked before ANY network call is dispatched'
    );

    // ----------------------------------------------------
    // SECTION 6: STATUS LOOKUP & WEBHOOK SECURITY
    // ----------------------------------------------------
    console.log('\n--- SECTION 6: STATUS LOOKUP & WEBHOOK SECURITY ---');

    process.env.ZOHO_WA_DEFAULT_TEMPLATE = `alias:${FAKE_TEMPLATE_ALIAS}`;

    // Test 25: getMessageStatus querying GET /logs/{message_id}
    mockFetchCalls = [];
    mockFetchResponse = {
      status: 200,
      json: {
        data: [{
          message_id: 'wa_lookup_789',
          delivery_status: 'delivered',
          to: '+2348012345678'
        }]
      }
    };
    const statusResult = await zohoProvider.getMessageStatus('wa_lookup_789');
    assert(
      mockFetchCalls.length === 1 && mockFetchCalls[0].url.includes('/logs/wa_lookup_789'),
      'getMessageStatus queries GET https://cpaas.zoho.com/v1.1/whatsapp/logs/{message_id}'
    );
    assert(
      statusResult?.status === 'delivered',
      'Zoho status "delivered" correctly mapped to application status "delivered"'
    );

    // Test 26: State mappings
    const testCases: Array<{ zohoState: string; expectedState: string }> = [
      { zohoState: 'delivered', expectedState: 'delivered' },
      { zohoState: 'read', expectedState: 'read' },
      { zohoState: 'sent', expectedState: 'sent' },
      { zohoState: 'processed', expectedState: 'sent' },
      { zohoState: 'undelivered', expectedState: 'failed' },
      { zohoState: 'failed', expectedState: 'failed' },
      { zohoState: 'process_failed', expectedState: 'failed' }
    ];
    for (const tc of testCases) {
      const parsed = zohoProvider.parseStatus({ message_id: 'm1', status: tc.zohoState });
      assert(
        parsed?.status === tc.expectedState,
        `Zoho state "${tc.zohoState}" correctly mapped to "${tc.expectedState}"`
      );
    }

    // Test 27: Official Zoho CPaaS Webhook Signature Verification (producer-signature)
    const WEBHOOK_SECRET = 'zoho_webhook_signing_secret_sec_555';
    process.env.ZOHO_WHATSAPP_WEBHOOK_SECRET = WEBHOOK_SECRET;

    function buildProducerSignature(
      payload: string,
      secret: string,
      opts: {
        ts?: number | string;
        algorithm?: string;
        urlEncodeSig?: boolean;
        tamperSig?: boolean;
        useUrlEncodedBody?: boolean;
      } = {}
    ): { header: string; rawBody: string } {
      const ts = opts.ts !== undefined ? opts.ts : Date.now();
      const alg = opts.algorithm !== undefined ? opts.algorithm : 'HmacSHA256';

      let rawBody = payload;
      let dataToSign = payload;

      if (opts.useUrlEncodedBody) {
        rawBody = `data=${encodeURIComponent(payload)}`;
        dataToSign = payload;
      }

      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(dataToSign, 'utf-8');
      let sig = hmac.digest('base64');

      if (opts.tamperSig) {
        sig = Buffer.from('invalid_tampered_signature_bytes_32!').toString('base64');
      }

      if (opts.urlEncodeSig) {
        sig = encodeURIComponent(sig);
      }

      const header = `ts=${ts};s=${sig};s-algorithm=${alg}`;
      return { header, rawBody };
    }

    const testPayloadJson = JSON.stringify({ message_id: 'm_wh_1', status: 'delivered' });

    // 1. Valid producer-signature
    const validSigData = buildProducerSignature(testPayloadJson, WEBHOOK_SECRET);
    assert(
      zohoProvider.verifyWebhookSignature({
        headers: { 'producer-signature': validSigData.header },
        rawBody: validSigData.rawBody
      }) === true,
      'Valid producer-signature accepted'
    );

    // 2. Malformed producer-signature header
    assert(
      zohoProvider.verifyWebhookSignature({
        headers: { 'producer-signature': 'malformed-header-without-semicolons-or-equal-signs' },
        rawBody: testPayloadJson
      }) === false,
      'Malformed producer-signature header rejected'
    );

    // 3. Missing ts
    assert(
      zohoProvider.verifyWebhookSignature({
        headers: { 'producer-signature': 's=abc123;s-algorithm=HmacSHA256' },
        rawBody: testPayloadJson
      }) === false,
      'Header missing ts rejected'
    );

    // 4. Missing s
    assert(
      zohoProvider.verifyWebhookSignature({
        headers: { 'producer-signature': `ts=${Date.now()};s-algorithm=HmacSHA256` },
        rawBody: testPayloadJson
      }) === false,
      'Header missing s rejected'
    );

    // 5. Missing s-algorithm
    assert(
      zohoProvider.verifyWebhookSignature({
        headers: { 'producer-signature': `ts=${Date.now()};s=abc123` },
        rawBody: testPayloadJson
      }) === false,
      'Header missing s-algorithm rejected'
    );

    // 6. Unsupported algorithm
    const badAlgData = buildProducerSignature(testPayloadJson, WEBHOOK_SECRET, { algorithm: 'HmacSHA512' });
    assert(
      zohoProvider.verifyWebhookSignature({
        headers: { 'producer-signature': badAlgData.header },
        rawBody: badAlgData.rawBody
      }) === false,
      'Unsupported algorithm rejected'
    );

    // 7. Stale timestamp (older than max age of 5 minutes)
    const staleTimeData = buildProducerSignature(testPayloadJson, WEBHOOK_SECRET, { ts: Date.now() - 600000 });
    assert(
      zohoProvider.verifyWebhookSignature({
        headers: { 'producer-signature': staleTimeData.header },
        rawBody: staleTimeData.rawBody
      }) === false,
      'Stale timestamp older than allowed max age rejected'
    );

    // 8. Future timestamp outside allowed clock skew (more than 1 minute into future)
    const futureTimeData = buildProducerSignature(testPayloadJson, WEBHOOK_SECRET, { ts: Date.now() + 180000 });
    assert(
      zohoProvider.verifyWebhookSignature({
        headers: { 'producer-signature': futureTimeData.header },
        rawBody: futureTimeData.rawBody
      }) === false,
      'Future timestamp outside allowed clock skew rejected'
    );

    // 9. Bad Base64 signature
    assert(
      zohoProvider.verifyWebhookSignature({
        headers: { 'producer-signature': `ts=${Date.now()};s=!!!not_valid_base64!!!;s-algorithm=HmacSHA256` },
        rawBody: testPayloadJson
      }) === false,
      'Bad Base64 signature rejected'
    );

    // 10. Invalid HMAC
    const tamperedData = buildProducerSignature(testPayloadJson, WEBHOOK_SECRET, { tamperSig: true });
    assert(
      zohoProvider.verifyWebhookSignature({
        headers: { 'producer-signature': tamperedData.header },
        rawBody: tamperedData.rawBody
      }) === false,
      'Invalid HMAC signature rejected'
    );

    // 11. URL-encoded signature value
    const urlEncSigData = buildProducerSignature(testPayloadJson, WEBHOOK_SECRET, { urlEncodeSig: true });
    assert(
      zohoProvider.verifyWebhookSignature({
        headers: { 'producer-signature': urlEncSigData.header },
        rawBody: urlEncSigData.rawBody
      }) === true,
      'URL-encoded signature value correctly decoded and accepted'
    );

    // 12. Body mutation causes validation failure
    assert(
      zohoProvider.verifyWebhookSignature({
        headers: { 'producer-signature': validSigData.header },
        rawBody: validSigData.rawBody + 'tampered'
      }) === false,
      'Body mutation causes signature validation failure'
    );

    // 13. Valid official-style URL-encoded body (data=<urlencoded>) succeeds
    const officialBodyData = buildProducerSignature(testPayloadJson, WEBHOOK_SECRET, { useUrlEncodedBody: true });
    assert(
      zohoProvider.verifyWebhookSignature({
        headers: { 'producer-signature': officialBodyData.header },
        rawBody: officialBodyData.rawBody
      }) === true,
      'Valid official-style encoded body (data=<url-encoded>) succeeds'
    );

    // 14. Missing webhook secret fails closed
    delete process.env.ZOHO_WHATSAPP_WEBHOOK_SECRET;
    assert(
      zohoProvider.verifyWebhookSignature({
        headers: { 'producer-signature': validSigData.header },
        rawBody: validSigData.rawBody
      }) === false,
      'Missing webhook secret fails closed (rejects verification)'
    );

    // ----------------------------------------------------
    // SECTION 6B: STATUS SEMANTICS & PROGRESSION MATRIX
    // ----------------------------------------------------
    console.log('\n--- SECTION 6B: STATUS SEMANTICS & PROGRESSION MATRIX ---');

    // Unit tests for canTransitionStatus matrix
    assert(canTransitionStatus('queued', 'sent') === true, 'queued -> sent: allowed');
    assert(canTransitionStatus('sent', 'delivered') === true, 'sent -> delivered: allowed');
    assert(canTransitionStatus('delivered', 'read') === true, 'delivered -> read: allowed');

    assert(canTransitionStatus('read', 'delivered') === false, 'read -> delivered: ignored');
    assert(canTransitionStatus('read', 'sent') === false, 'read -> sent: ignored');
    assert(canTransitionStatus('delivered', 'sent') === false, 'delivered -> sent: ignored');

    assert(canTransitionStatus('read', 'failed') === false, 'read -> failed: ignored');
    assert(canTransitionStatus('read', 'undelivered') === false, 'read -> undelivered: ignored');
    assert(canTransitionStatus('read', 'process_failed') === false, 'read -> process_failed: ignored');

    assert(canTransitionStatus('delivered', 'failed') === false, 'delivered -> failed: ignored');
    assert(canTransitionStatus('delivered', 'undelivered') === false, 'delivered -> undelivered: ignored');
    assert(canTransitionStatus('delivered', 'process_failed') === false, 'delivered -> process_failed: ignored');

    assert(canTransitionStatus('queued', 'failed') === true, 'queued -> failed: allowed');
    assert(canTransitionStatus('sent', 'failed') === true, 'sent -> failed: allowed');

    assert(canTransitionStatus('delivered', 'delivered') === true, 'same status delivered twice: idempotent');
    assert(canTransitionStatus('read', 'read') === true, 'same status read twice: idempotent');
    assert(canTransitionStatus('sent', 'sent') === true, 'same status sent twice: idempotent');

    // Database Integration: handleDeliveryStatusUpdate progression & failure safety
    getDb();

    const uniqueMsgId = `zoho_test_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const testPhone = '+2348019998887';

    // Seed initial delivery log with status 'sent'
    await execute(`
      INSERT INTO whatsapp_delivery_logs (
        id, provider, provider_message_id, recipient_phone, status, sent_at, created_at, updated_at
      ) VALUES (?, 'zoho', ?, ?, 'sent', ?, ?, ?)
    `, [
      `log_${uniqueMsgId}`,
      uniqueMsgId,
      testPhone,
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString()
    ]);

    // Test: Delivery webhook updates status to delivered
    await handleDeliveryStatusUpdate({
      provider: 'zoho',
      messageId: uniqueMsgId,
      status: 'delivered',
      recipientPhone: testPhone,
      timestamp: new Date().toISOString()
    });

    let currentLog = await queryOne(`SELECT status FROM whatsapp_delivery_logs WHERE provider = 'zoho' AND provider_message_id = ?`, [uniqueMsgId]);
    assert(
      currentLog?.status === 'delivered',
      'Webhook callback successfully progresses status from "sent" to "delivered"'
    );

    // Test: Duplicate webhook safely handled (idempotent, status remains delivered)
    await handleDeliveryStatusUpdate({
      provider: 'zoho',
      messageId: uniqueMsgId,
      status: 'delivered',
      recipientPhone: testPhone,
      timestamp: new Date().toISOString()
    });
    currentLog = await queryOne(`SELECT status FROM whatsapp_delivery_logs WHERE provider = 'zoho' AND provider_message_id = ?`, [uniqueMsgId]);
    assert(
      currentLog?.status === 'delivered',
      'Duplicate webhook callback safely handled without error (remains "delivered")'
    );

    // Test: Read status webhook updates status to read
    await handleDeliveryStatusUpdate({
      provider: 'zoho',
      messageId: uniqueMsgId,
      status: 'read',
      recipientPhone: testPhone,
      timestamp: new Date().toISOString()
    });
    currentLog = await queryOne(`SELECT status FROM whatsapp_delivery_logs WHERE provider = 'zoho' AND provider_message_id = ?`, [uniqueMsgId]);
    assert(
      currentLog?.status === 'read',
      'Webhook callback successfully progresses status from "delivered" to "read"'
    );

    // Test: Out-of-order 'delivered' does not regress status from 'read'
    await handleDeliveryStatusUpdate({
      provider: 'zoho',
      messageId: uniqueMsgId,
      status: 'delivered',
      recipientPhone: testPhone,
      timestamp: new Date().toISOString()
    });
    currentLog = await queryOne(`SELECT status FROM whatsapp_delivery_logs WHERE provider = 'zoho' AND provider_message_id = ?`, [uniqueMsgId]);
    assert(
      currentLog?.status === 'read',
      'Out-of-order "delivered" callback does NOT regress status back from "read"'
    );

    // Test: Out-of-order 'sent' does not regress status from 'read'
    await handleDeliveryStatusUpdate({
      provider: 'zoho',
      messageId: uniqueMsgId,
      status: 'sent',
      recipientPhone: testPhone,
      timestamp: new Date().toISOString()
    });
    currentLog = await queryOne(`SELECT status FROM whatsapp_delivery_logs WHERE provider = 'zoho' AND provider_message_id = ?`, [uniqueMsgId]);
    assert(
      currentLog?.status === 'read',
      'Out-of-order "sent" callback does NOT regress status back from "read"'
    );

    // Test: Late failure arriving after 'read' does NOT overwrite 'read'
    await handleDeliveryStatusUpdate({
      provider: 'zoho',
      messageId: uniqueMsgId,
      status: 'failed',
      recipientPhone: testPhone,
      errorMessage: 'Late failure callback',
      timestamp: new Date().toISOString()
    });
    currentLog = await queryOne(`SELECT status FROM whatsapp_delivery_logs WHERE provider = 'zoho' AND provider_message_id = ?`, [uniqueMsgId]);
    assert(
      currentLog?.status === 'read',
      'Late "failed" callback does NOT regress or overwrite confirmed "read" status'
    );

    // Test: Late failure arriving after 'delivered' does NOT overwrite 'delivered'
    const delivMsgId = `zoho_deliv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await execute(`
      INSERT INTO whatsapp_delivery_logs (
        id, provider, provider_message_id, recipient_phone, status, delivered_at, created_at, updated_at
      ) VALUES (?, 'zoho', ?, ?, 'delivered', ?, ?, ?)
    `, [
      `log_${delivMsgId}`,
      delivMsgId,
      testPhone,
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString()
    ]);

    await handleDeliveryStatusUpdate({
      provider: 'zoho',
      messageId: delivMsgId,
      status: 'failed',
      recipientPhone: testPhone,
      errorMessage: 'Late failure after delivered',
      timestamp: new Date().toISOString()
    });
    const delivLog = await queryOne(`SELECT status FROM whatsapp_delivery_logs WHERE provider = 'zoho' AND provider_message_id = ?`, [delivMsgId]);
    assert(
      delivLog?.status === 'delivered',
      'Late "failed" callback does NOT regress or overwrite confirmed "delivered" status'
    );

    // ----------------------------------------------------
    // SECTION 7: READINESS REPORTING & SECRETS PRIVACY
    // ----------------------------------------------------
    console.log('\n--- SECTION 7: READINESS REPORTING & SECRETS PRIVACY ---');

    // Test 28: Readiness check reflects Zoho and Twilio configuration
    process.env.WHATSAPP_PROVIDER = 'zoho';
    process.env.ZOHO_WHATSAPP_API_KEY = FAKE_ZOHO_KEY;
    process.env.ZOHO_WHATSAPP_FROM = FAKE_ZOHO_FROM;
    process.env.ZOHO_WA_DEFAULT_TEMPLATE = `alias:${FAKE_TEMPLATE_ALIAS}`;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;

    const readiness1 = getWhatsAppProviderReadiness();
    assert(
      readiness1.zohoConfigured === true,
      'Readiness reports zohoConfigured=true when key, from, and template are set'
    );
    assert(
      readiness1.twilioConfigured === false,
      'Readiness reports twilioConfigured=false when Twilio env vars are missing'
    );
    assert(
      readiness1.activeProvider === 'zoho',
      'Readiness reports activeProvider="zoho"'
    );
    assert(
      !JSON.stringify(readiness1).includes(FAKE_ZOHO_KEY),
      'Readiness report NEVER prints secret values'
    );

    // Test notifications.ts integration
    mockFetchCalls = [];
    mockFetchResponse = { status: 200, json: { message_id: 'wa_notif_1', request_id: 'req_n_1' } };
    const notifSendResult = await sendWhatsApp('+2348012345678', 'Hello via notifications');
    assert(
      notifSendResult.success === true && notifSendResult.messageSid === 'wa_notif_1',
      'sendWhatsApp successfully routes through Zoho when WHATSAPP_PROVIDER=zoho'
    );

    // ----------------------------------------------------
    // SECTION 8: RECIPIENT CONSENT ENFORCEMENT
    // ----------------------------------------------------
    console.log('\n--- SECTION 8: RECIPIENT CONSENT ENFORCEMENT ---');

    // Test 29: Parent consent checks
    const unknownParent = evaluateWhatsAppEligibility({
      whatsapp_consent_status: 'unknown',
      whatsapp_number: '+2348012345678'
    });
    assert(
      unknownParent.eligible === false && (unknownParent.reason?.includes('unknown') ?? false),
      'Parent with unknown consent status is blocked prior to dispatch'
    );

    const optedOutParent = evaluateWhatsAppEligibility({
      whatsapp_consent_status: 'opted_out',
      whatsapp_number: '+2348012345678'
    });
    assert(
      optedOutParent.eligible === false && (optedOutParent.reason?.includes('opted out') ?? false),
      'Parent with opted_out consent status is blocked prior to dispatch'
    );

    const optedInParent = evaluateWhatsAppEligibility({
      whatsapp_consent_status: 'opted_in',
      whatsapp_number: '+2348012345678'
    });
    assert(
      optedInParent.eligible === true && optedInParent.normalizedNumber === '+2348012345678',
      'Parent with opted_in consent status is eligible for WhatsApp delivery'
    );

    // ----------------------------------------------------
    // SECTION 9: ALL 15 APPLICATION INTENTS TEMPLATE MAPPINGS
    // ----------------------------------------------------
    console.log('\n--- SECTION 9: ALL 15 APPLICATION INTENTS TEMPLATE MAPPINGS ---');

    const expectedIntents = [
      'registration_ack',
      'registration_acknowledgement',
      'review_decision',
      'return_to_draft',
      'completion_reminder',
      'inquiry_reply',
      'volunteer_reply',
      'duty_reminder',
      'pickup_reminder',
      'checkin_opening',
      'broadcast',
      'manual_broadcast',
      'escalation',
      'test',
      'super_admin_test'
    ];

    // Set mock env vars for all intents
    process.env.ZOHO_WA_TEMPLATE_REGISTRATION_ACK = 'alias:reg_ack_tpl';
    process.env.ZOHO_WA_TEMPLATE_REVIEW_DECISION = 'alias:review_decision_tpl';
    process.env.ZOHO_WA_TEMPLATE_RETURN_TO_DRAFT = 'alias:return_to_draft_tpl';
    process.env.ZOHO_WA_TEMPLATE_COMPLETION_REMINDER = 'alias:completion_reminder_tpl';
    process.env.ZOHO_WA_TEMPLATE_INQUIRY_REPLY = 'alias:inquiry_reply_tpl';
    process.env.ZOHO_WA_TEMPLATE_VOLUNTEER_REPLY = 'alias:volunteer_reply_tpl';
    process.env.ZOHO_WA_TEMPLATE_DUTY_REMINDER = 'alias:duty_reminder_tpl';
    process.env.ZOHO_WA_TEMPLATE_PICKUP_REMINDER = 'alias:pickup_reminder_tpl';
    process.env.ZOHO_WA_TEMPLATE_CHECKIN_OPENING = 'alias:checkin_opening_tpl';
    process.env.ZOHO_WA_TEMPLATE_BROADCAST = 'alias:broadcast_tpl';
    process.env.ZOHO_WA_TEMPLATE_ESCALATION = 'alias:escalation_tpl';
    process.env.ZOHO_WA_TEMPLATE_TEST = 'alias:test_tpl';

    for (const intent of expectedIntents) {
      const resolved = resolveZohoTemplateConfig(intent);
      assert(
        resolved !== null && (resolved.templateKey !== undefined || resolved.templateAlias !== undefined),
        `Intent "${intent}" successfully resolves to configured template alias or key`
      );
    }

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passedTests} passed, 0 failed out of ${totalTests} assertions`);
    console.log('====================================================\n');
    process.exit(0);
  } finally {
    restoreFetch();
    process.env = originalEnv;
    resetWhatsAppProviderCache();
  }
}

runTestSuite().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
