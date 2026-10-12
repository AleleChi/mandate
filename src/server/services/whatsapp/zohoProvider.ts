import crypto from 'crypto';
import {
  WhatsAppProvider,
  SendTemplateParams,
  SendSessionMessageParams,
  ProviderSendResult,
  WebhookVerificationContext,
  InboundWhatsAppMessage,
  WhatsAppStatusUpdate
} from './types';
import { normalizePhoneNumberToE164 } from '../../utils/phone';

export const DEFAULT_ZOHO_WHATSAPP_API_URL = 'https://cpaas.zoho.com/v1.1/whatsapp';
export const DEFAULT_ZOHO_WHATSAPP_TIMEOUT_MS = 10000;

/**
 * Strips secret values from error messages to prevent credential leakage.
 */
function sanitizeSecret(text: string, secret?: string): string {
  if (!text) return '';
  let result = text;
  if (secret && secret.length > 4) {
    result = result.split(secret).join('[REDACTED]');
  }
  return result;
}

/**
 * Resolved template configuration.
 * Strictly uses either template_key OR template_alias, never both.
 */
export interface ResolvedZohoTemplate {
  templateKey?: string;
  templateAlias?: string;
}

/**
 * Resolves configured template key or alias for a given intent or template name.
 */
export function resolveZohoTemplateConfig(intentOrName?: string): ResolvedZohoTemplate | null {
  if (!intentOrName) {
    const defaultVal = process.env.ZOHO_WA_DEFAULT_TEMPLATE?.trim();
    if (defaultVal) return parseTemplateValue(defaultVal);
    return null;
  }

  const clean = intentOrName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

  // Intent-specific environment variable lookups
  const intentMap: Record<string, string | undefined> = {
    registration_ack: process.env.ZOHO_WA_TEMPLATE_REGISTRATION_ACK,
    registration_acknowledgement: process.env.ZOHO_WA_TEMPLATE_REGISTRATION_ACK,
    review_decision: process.env.ZOHO_WA_TEMPLATE_REVIEW_DECISION,
    return_to_draft: process.env.ZOHO_WA_TEMPLATE_RETURN_TO_DRAFT,
    completion_reminder: process.env.ZOHO_WA_TEMPLATE_COMPLETION_REMINDER,
    inquiry_reply: process.env.ZOHO_WA_TEMPLATE_INQUIRY_REPLY,
    volunteer_reply: process.env.ZOHO_WA_TEMPLATE_VOLUNTEER_REPLY,
    duty_reminder: process.env.ZOHO_WA_TEMPLATE_DUTY_REMINDER,
    pickup_reminder: process.env.ZOHO_WA_TEMPLATE_PICKUP_REMINDER,
    checkin_opening: process.env.ZOHO_WA_TEMPLATE_CHECKIN_OPENING,
    broadcast: process.env.ZOHO_WA_TEMPLATE_BROADCAST,
    manual_broadcast: process.env.ZOHO_WA_TEMPLATE_BROADCAST,
    escalation: process.env.ZOHO_WA_TEMPLATE_ESCALATION,
    super_admin_test: process.env.ZOHO_WA_TEMPLATE_TEST,
    test: process.env.ZOHO_WA_TEMPLATE_TEST
  };

  const matchedEnv = intentMap[clean] || process.env[`ZOHO_WA_TEMPLATE_${clean.toUpperCase()}`];
  if (matchedEnv?.trim()) {
    return parseTemplateValue(matchedEnv.trim());
  }

  // Fallback to default template if configured
  const fallback = process.env.ZOHO_WA_DEFAULT_TEMPLATE?.trim();
  if (fallback) {
    return parseTemplateValue(fallback);
  }

  return null;
}

/**
 * Parses a template identifier string into either templateKey or templateAlias.
 * - Explicit prefix "key:<id>" -> templateKey
 * - Explicit prefix "alias:<name>" -> templateAlias
 * - 32-char hex / UUID format -> templateKey
 * - Otherwise -> templateAlias
 */
export function parseTemplateValue(val: string): ResolvedZohoTemplate {
  const trimmed = val.trim();
  if (trimmed.toLowerCase().startsWith('key:')) {
    return { templateKey: trimmed.substring(4).trim() };
  }
  if (trimmed.toLowerCase().startsWith('alias:')) {
    return { templateAlias: trimmed.substring(6).trim() };
  }
  // Documented standard UUID format maps to template_key
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return { templateKey: trimmed };
  }
  // Ordinary string maps to template_alias
  return { templateAlias: trimmed };
}

/**
 * Checks whether Zoho CPaaS WhatsApp is fully configured for outbound messaging.
 * Requires:
 * 1. ZOHO_WHATSAPP_API_KEY
 * 2. ZOHO_WHATSAPP_FROM
 * 3. At least one template configuration (e.g. default or intent-specific)
 */
export function isZohoWhatsAppConfigured(): boolean {
  const hasKey = !!process.env.ZOHO_WHATSAPP_API_KEY?.trim();
  const hasFrom = !!process.env.ZOHO_WHATSAPP_FROM?.trim();
  const hasTemplate = !!(
    process.env.ZOHO_WA_DEFAULT_TEMPLATE?.trim() ||
    process.env.ZOHO_WA_TEMPLATE_REGISTRATION_ACK?.trim() ||
    process.env.ZOHO_WA_TEMPLATE_BROADCAST?.trim() ||
    process.env.ZOHO_WA_TEMPLATE_TEST?.trim() ||
    process.env.ZOHO_WA_TEMPLATE_REVIEW_DECISION?.trim()
  );
  return hasKey && hasFrom && hasTemplate;
}

export class ZohoWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'zoho' as const;

  private getConfig() {
    const rawTimeout = process.env.ZOHO_WHATSAPP_TIMEOUT_MS;
    const timeoutMs = rawTimeout ? parseInt(rawTimeout, 10) : DEFAULT_ZOHO_WHATSAPP_TIMEOUT_MS;

    return {
      apiUrl: process.env.ZOHO_WHATSAPP_API_URL?.trim() || DEFAULT_ZOHO_WHATSAPP_API_URL,
      apiKey: process.env.ZOHO_WHATSAPP_API_KEY?.trim() || '',
      from: process.env.ZOHO_WHATSAPP_FROM?.trim() || '',
      timeoutMs: isNaN(timeoutMs) || timeoutMs <= 0 ? DEFAULT_ZOHO_WHATSAPP_TIMEOUT_MS : timeoutMs,
      webhookSecret: process.env.ZOHO_WHATSAPP_WEBHOOK_SECRET?.trim() || ''
    };
  }

  /**
   * Internal dispatcher for Zoho CPaaS WhatsApp POST API.
   * Enforces:
   * - E.164 normalization on both from and to numbers.
   * - Exactly ONE of template_key or template_alias.
   * - Configurable timeout via AbortController.
   * - ZERO automatic HTTP retries inside the adapter.
   * - Client reference max 100 characters.
   * - No secret leakage in error output.
   */
  private async dispatchZohoMessage(params: {
    to: string;
    from?: string;
    templateKey?: string;
    templateAlias?: string;
    mergeInfo?: Record<string, string>;
    clientReference?: string;
    intent?: string;
    bodyFallback?: string;
  }): Promise<ProviderSendResult> {
    const config = this.getConfig();

    // 1. Verify credentials present
    if (!config.apiKey) {
      return {
        success: false,
        provider: this.name,
        status: 'failed',
        error: 'Zoho CPaaS WhatsApp API key (ZOHO_WHATSAPP_API_KEY) is unconfigured.'
      };
    }

    const rawFrom = params.from || config.from;
    if (!rawFrom) {
      return {
        success: false,
        provider: this.name,
        status: 'failed',
        error: 'Zoho CPaaS WhatsApp sender number (ZOHO_WHATSAPP_FROM) is unconfigured.'
      };
    }

    // 2. Normalize recipient and sender numbers to canonical E.164
    const normalizedTo = normalizePhoneNumberToE164(params.to);
    if (!normalizedTo) {
      return {
        success: false,
        provider: this.name,
        status: 'failed',
        error: 'Invalid recipient phone number: must be in international E.164 format.'
      };
    }

    const normalizedFrom = normalizePhoneNumberToE164(rawFrom);
    if (!normalizedFrom) {
      return {
        success: false,
        provider: this.name,
        status: 'failed',
        error: 'Invalid sender phone number: must be in international E.164 format.'
      };
    }

    // 3. Resolve template key or alias (strictly ONE, never both)
    if (params.templateKey && params.templateAlias) {
      return {
        success: false,
        provider: this.name,
        status: 'failed',
        error: 'Cannot specify both templateKey and templateAlias. Exactly one template selector must be provided.'
      };
    }

    let templateKey = params.templateKey?.trim();
    let templateAlias = params.templateAlias?.trim();

    if (!templateKey && !templateAlias) {
      const resolved = resolveZohoTemplateConfig(params.intent);
      if (resolved) {
        templateKey = resolved.templateKey;
        templateAlias = resolved.templateAlias;
      }
    }

    if (templateKey && templateAlias) {
      return {
        success: false,
        provider: this.name,
        status: 'failed',
        error: 'Cannot specify both templateKey and templateAlias. Exactly one template selector must be provided.'
      };
    }

    if (!templateKey && !templateAlias) {
      return {
        success: false,
        provider: this.name,
        status: 'failed',
        error: 'ZOHO_TEMPLATE_NOT_CONFIGURED'
      };
    }

    // 4. Stable client_reference (maximum 100 characters)
    let clientRef: string | undefined = undefined;
    if (params.clientReference?.trim()) {
      clientRef = params.clientReference.trim().slice(0, 100);
    }

    // 5. Construct payload
    const payload: Record<string, any> = {
      from: normalizedFrom,
      to: normalizedTo
    };

    if (templateKey) {
      payload.template_key = templateKey;
    } else if (templateAlias) {
      payload.template_alias = templateAlias;
    }

    if (params.mergeInfo && Object.keys(params.mergeInfo).length > 0) {
      payload.merge_info = params.mergeInfo;
    } else if (params.bodyFallback) {
      payload.merge_info = { '1': params.bodyFallback };
    }

    if (clientRef) {
      payload.client_reference = clientRef;
    }

    // 6. Network dispatch with AbortController timeout (no automatic retries)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-enczapikey ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timer);

      let resJson: any = null;
      try {
        resJson = await response.json();
      } catch {
        resJson = null;
      }

      if (!response.ok) {
        let errMsg = resJson?.message || resJson?.error || `Zoho dispatch failed with HTTP ${response.status}`;

        if (response.status === 401) {
          errMsg = 'Zoho authentication failed (HTTP 401). Verify ZOHO_WHATSAPP_API_KEY in server configuration.';
        } else if (response.status === 429) {
          errMsg = 'Zoho rate limit exceeded (HTTP 429).';
        } else if (response.status >= 500) {
          errMsg = `Zoho service unavailable (HTTP ${response.status}).`;
        }

        // Parse Retry-After header if supplied
        let retryAfter: number | undefined = undefined;
        const retryHeader = response.headers?.get?.('retry-after');
        if (retryHeader) {
          const parsed = parseInt(retryHeader, 10);
          if (!isNaN(parsed) && parsed > 0) {
            retryAfter = parsed;
          }
        }

        return {
          success: false,
          provider: this.name,
          status: 'failed',
          error: sanitizeSecret(errMsg, config.apiKey),
          retryAfter,
          rawResponse: resJson
        };
      }

      // Primary extraction from official Zoho response envelope: response.data.message_id & response.data.request_id
      const dataObj = (resJson && typeof resJson.data === 'object' && !Array.isArray(resJson.data))
        ? resJson.data
        : (Array.isArray(resJson?.data) ? resJson.data[0] : resJson?.data);

      const messageId = String(
        dataObj?.message_id ||
        resJson?.message_id ||
        resJson?.id ||
        ''
      ).trim() || undefined;

      const requestId = String(
        dataObj?.request_id ||
        resJson?.request_id ||
        ''
      ).trim() || undefined;

      // A 200 response without a usable data.message_id should NOT be treated as a fully successful provider send.
      if (!messageId) {
        const errMsg = dataObj?.message || resJson?.message || 'Zoho CPaaS response missing required message_id';
        return {
          success: false,
          provider: this.name,
          status: 'failed',
          error: sanitizeSecret(errMsg, config.apiKey),
          rawResponse: resJson
        };
      }

      // Successful acceptance from Zoho means QUEUED / ACCEPTED, NOT delivered
      return {
        success: true,
        provider: this.name,
        messageId,
        requestId,
        clientReference: clientRef,
        status: 'queued',
        rawResponse: resJson
      };
    } catch (err: any) {
      clearTimeout(timer);

      if (err?.name === 'AbortError') {
        return {
          success: false,
          provider: this.name,
          status: 'failed',
          error: `Zoho WhatsApp request timed out after ${config.timeoutMs}ms.`
        };
      }

      const errMsg = sanitizeSecret(err?.message || 'Network exception connecting to Zoho CPaaS.', config.apiKey);
      return {
        success: false,
        provider: this.name,
        status: 'failed',
        error: errMsg
      };
    }
  }

  /**
   * Sends an approved template message.
   */
  async sendTemplate(params: SendTemplateParams): Promise<ProviderSendResult> {
    let mergeInfo = params.mergeInfo;

    // Convert parameter list into merge_info map if not explicitly supplied
    if (!mergeInfo && params.parameters && params.parameters.length > 0) {
      mergeInfo = {};
      params.parameters.forEach((param, idx) => {
        mergeInfo![String(idx + 1)] = param.text || '';
      });
    }

    return this.dispatchZohoMessage({
      to: params.to,
      templateKey: params.templateKey,
      templateAlias: params.templateAlias || params.templateName,
      mergeInfo,
      clientReference: params.clientReference || params.idempotencyKey,
      intent: params.templateName
    });
  }

  /**
   * Sends a session or transactional message through Zoho.
   * Resolves template from intent or idempotency key context.
   */
  async sendSessionMessage(params: SendSessionMessageParams): Promise<ProviderSendResult> {
    let intent = params.intent;

    // Infer intent from idempotencyKey prefix if not explicitly passed
    if (!intent && params.idempotencyKey) {
      if (params.idempotencyKey.startsWith('registration_ack:') || params.idempotencyKey.includes('registration_ack')) {
        intent = 'registration_ack';
      } else if (params.idempotencyKey.startsWith('duty_reminder:')) {
        intent = 'duty_reminder';
      } else if (params.idempotencyKey.startsWith('test:')) {
        intent = 'test';
      } else if (params.idempotencyKey.startsWith('campaign:')) {
        intent = 'broadcast';
      }
    }

    return this.dispatchZohoMessage({
      to: params.to,
      templateKey: params.templateKey,
      templateAlias: params.templateAlias,
      mergeInfo: params.mergeInfo,
      clientReference: params.clientReference || params.idempotencyKey,
      intent: intent || 'broadcast',
      bodyFallback: params.body
    });
  }

  /**
   * Queries Zoho message delivery status via GET https://cpaas.zoho.com/v1.1/whatsapp/logs/{message_id}.
   */
  async getMessageStatus(messageId: string): Promise<WhatsAppStatusUpdate | null> {
    if (!messageId?.trim()) return null;

    const config = this.getConfig();
    if (!config.apiKey) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const url = `${config.apiUrl}/logs/${encodeURIComponent(messageId.trim())}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Zoho-enczapikey ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!response.ok) return null;
      const resJson = await response.json() as any;

      return this.parseStatus(resJson);
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  /**
   * Cryptographically verifies inbound webhook signature against current Zoho CPaaS contract.
   *
   * Official Header: producer-signature
   * Format: ts=<timestamp>;s=<base64-url-encoded-signature>;s-algorithm=HmacSHA256
   *
   * Signature calculation (Zoho reference validator):
   * 1. URL-decodes incoming request body
   * 2. Splits on the first '='
   * 3. Signs the data value (after first '=')
   * 4. Computes HMAC-SHA256 using configured Authentication Key (webhookSecret)
   * 5. Compares Base64 decoded signature using constant-time timingSafeEqual
   *
   * Timestamp & Replay Validation:
   * - Bounded freshness check: now - ts <= maxAgeMs (default 300000ms / 5 min)
   * - Clock-skew guard: ts - now <= 60000ms (1 min)
   *
   * Fails closed on any error, missing field, or mismatch. Never logs secrets or payloads.
   */
  verifyWebhookSignature(context: WebhookVerificationContext): boolean {
    const { webhookSecret } = this.getConfig();
    if (!webhookSecret) {
      return false;
    }

    const headerVal = (
      context.headers['producer-signature'] ||
      context.headers['Producer-Signature']
    );

    if (!headerVal || typeof headerVal !== 'string') {
      return false;
    }

    // Parse header fields safely
    const fields: Record<string, string> = {};
    const parts = headerVal.split(';');
    for (const part of parts) {
      const trimmed = part.trim();
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        fields[key] = val;
      }
    }

    const tsStr = fields['ts'];
    const sStr = fields['s'];
    const algStr = fields['s-algorithm'];

    // Require all three fields
    if (!tsStr || !sStr || !algStr) {
      return false;
    }

    // Supported algorithm check (strict)
    if (algStr !== 'HmacSHA256') {
      return false;
    }

    // Timestamp & replay freshness check
    const tsNum = Number(tsStr);
    if (!Number.isFinite(tsNum) || tsNum <= 0) {
      return false;
    }

    const tsMs = tsNum < 1e11 ? tsNum * 1000 : tsNum;
    const now = Date.now();
    const maxAgeMs = Number(process.env.ZOHO_WHATSAPP_WEBHOOK_MAX_AGE_MS) || 300000; // 5 minutes default
    const clockSkewAllowanceMs = 60000; // 1 minute allowed into the future

    if (now - tsMs > maxAgeMs) {
      return false; // Stale timestamp / replay rejection
    }

    if (tsMs - now > clockSkewAllowanceMs) {
      return false; // Future timestamp outside allowed clock skew
    }

    // Extract raw payload string
    let rawPayload = '';
    if (context.rawBody) {
      rawPayload = typeof context.rawBody === 'string' ? context.rawBody : context.rawBody.toString('utf-8');
    } else if (context.body) {
      rawPayload = typeof context.body === 'string' ? context.body : JSON.stringify(context.body);
    }

    if (!rawPayload) {
      return false;
    }

    // Zoho reference format:
    // URL-decode the incoming request body, then split on first '='
    let decodedBody = '';
    try {
      decodedBody = decodeURIComponent(rawPayload.replace(/\+/g, '%20'));
    } catch {
      decodedBody = rawPayload;
    }

    const firstEq = decodedBody.indexOf('=');
    const dataToSign = firstEq !== -1 ? decodedBody.substring(firstEq + 1) : decodedBody;

    if (!dataToSign) {
      return false;
    }

    // Compute HMAC-SHA256 using configured secret
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(dataToSign, 'utf-8');
    const computedDigest = hmac.digest(); // 32 bytes

    // Parse received signature (handling URL encoding and base64/base64url)
    let cleanSig = sStr;
    try {
      cleanSig = decodeURIComponent(sStr);
    } catch {
      // retain sStr
    }

    try {
      // Normalize base64url to standard base64 with padding
      const normalizedBase64 = cleanSig.replace(/-/g, '+').replace(/_/g, '/');
      const padLen = (4 - (normalizedBase64.length % 4)) % 4;
      const paddedBase64 = normalizedBase64 + '='.repeat(padLen);
      const receivedBuffer = Buffer.from(paddedBase64, 'base64');

      if (receivedBuffer.length !== computedDigest.length) {
        return false;
      }

      return crypto.timingSafeEqual(receivedBuffer, computedDigest);
    } catch {
      return false;
    }
  }

  parseInbound(body: any): InboundWhatsAppMessage | null {
    if (!body) return null;
    const msg = body.message || body.data || body;
    const from = msg.from || msg.sender;
    const text = msg.text?.body || msg.body || msg.content;
    const messageId = msg.message_id || msg.id || body.message_id;

    if (!from || !messageId) return null;

    return {
      provider: this.name,
      messageId: String(messageId),
      from: String(from).replace(/^whatsapp:/, '').trim(),
      body: String(text || '').trim(),
      timestamp: new Date().toISOString(),
      rawPayload: body
    };
  }

  /**
   * Maps Zoho CPaaS states (sent, delivered, read, undelivered, failed, processed, process_failed)
   * into the application's existing delivery-state model: 'sent' | 'delivered' | 'read' | 'failed'.
   */
  parseStatus(body: any): WhatsAppStatusUpdate | null {
    if (!body) return null;
    const data = (body && typeof body.data === 'object' && !Array.isArray(body.data))
      ? body.data
      : (Array.isArray(body?.data) ? body.data[0] : (body?.data || body));
    const messageId = data?.message_id || data?.id || body?.message_id;
    if (!messageId) return null;

    const rawStatus = String(data.status || data.delivery_status || '').toLowerCase().trim();
    let normalizedStatus: 'sent' | 'delivered' | 'read' | 'failed' = 'sent';

    if (rawStatus === 'delivered') {
      normalizedStatus = 'delivered';
    } else if (rawStatus === 'read') {
      normalizedStatus = 'read';
    } else if (
      rawStatus === 'undelivered' ||
      rawStatus === 'failed' ||
      rawStatus === 'process_failed' ||
      rawStatus === 'rejected'
    ) {
      normalizedStatus = 'failed';
    } else if (
      rawStatus === 'sent' ||
      rawStatus === 'processed' ||
      rawStatus === 'queued' ||
      rawStatus === 'accepted'
    ) {
      normalizedStatus = 'sent';
    }

    const recipientPhone = data.to || data.recipient || undefined;
    const errorCode = data.error_code || data.code ? String(data.error_code || data.code) : undefined;
    const errorMessage = data.error_message || data.error || data.reason ? String(data.error_message || data.error || data.reason) : undefined;

    return {
      provider: this.name,
      messageId: String(messageId),
      status: normalizedStatus,
      timestamp: new Date().toISOString(),
      recipientPhone: recipientPhone ? String(recipientPhone).replace(/^whatsapp:/, '').trim() : undefined,
      errorCode,
      errorMessage,
      rawPayload: body
    };
  }
}
