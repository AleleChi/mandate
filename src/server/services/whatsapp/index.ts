import {
  WhatsAppProvider,
  WhatsAppProviderName,
  SendTemplateParams,
  SendSessionMessageParams,
  ProviderSendResult,
  WebhookVerificationContext,
  InboundWhatsAppMessage,
  WhatsAppStatusUpdate
} from './types';
import { TwilioWhatsAppProvider } from './twilioProvider';
import { MetaWhatsAppProvider } from './metaProvider';
import { SimulatedWhatsAppProvider } from './simulatedProvider';

export * from './types';
export * from './consent';
export * from './queue';
export * from './worker';
export { TwilioWhatsAppProvider } from './twilioProvider';
export { MetaWhatsAppProvider } from './metaProvider';
export { SimulatedWhatsAppProvider } from './simulatedProvider';
export { normalizePhoneNumberToE164, resolveParentWhatsAppCandidate } from '../../utils/phone';

/**
 * Strict fail-closed provider used in production when configuration is missing or invalid.
 * Always rejects delivery attempts with clear diagnostic error without exposing credentials.
 */
class FailClosedWhatsAppProvider implements WhatsAppProvider {
  readonly name: WhatsAppProviderName;
  private readonly reason: string;

  constructor(name: WhatsAppProviderName, reason: string) {
    this.name = name;
    this.reason = reason;
  }

  async sendTemplate(_params: SendTemplateParams): Promise<ProviderSendResult> {
    return {
      success: false,
      provider: this.name,
      status: 'failed',
      error: this.reason
    };
  }

  async sendSessionMessage(_params: SendSessionMessageParams): Promise<ProviderSendResult> {
    return {
      success: false,
      provider: this.name,
      status: 'failed',
      error: this.reason
    };
  }

  verifyWebhookSignature(_context: WebhookVerificationContext): boolean {
    return false;
  }

  parseInbound(_body: any): InboundWhatsAppMessage | null {
    return null;
  }

  parseStatus(_body: any): WhatsAppStatusUpdate | null {
    return null;
  }
}

let cachedProvider: WhatsAppProvider | null = null;
let cachedCacheKey: string | null = null;

export function resetWhatsAppProviderCache(): void {
  cachedProvider = null;
  cachedCacheKey = null;
}

export function getWhatsAppProvider(): WhatsAppProvider {
  const isProd = process.env.NODE_ENV === 'production';
  const rawProvider = (process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase();
  const cacheKey = `${isProd ? 'prod' : 'dev'}:${rawProvider}`;

  if (cachedProvider && cachedCacheKey === cacheKey) {
    return cachedProvider;
  }

  if (isProd) {
    if (rawProvider === 'meta') {
      cachedProvider = new MetaWhatsAppProvider();
    } else if (rawProvider === 'twilio') {
      cachedProvider = new TwilioWhatsAppProvider();
    } else {
      cachedProvider = new FailClosedWhatsAppProvider(
        (rawProvider || 'simulated') as WhatsAppProviderName,
        'WhatsApp setup incomplete: production requires explicit meta or twilio provider.'
      );
    }
  } else {
    if (rawProvider === 'twilio') {
      cachedProvider = new TwilioWhatsAppProvider();
    } else if (rawProvider === 'meta') {
      cachedProvider = new MetaWhatsAppProvider();
    } else {
      cachedProvider = new SimulatedWhatsAppProvider();
    }
  }

  cachedCacheKey = cacheKey;
  return cachedProvider;
}

export interface WhatsAppProviderReadiness {
  configured: boolean;
  provider: WhatsAppProviderName;
  webhookConfigured: boolean;
  testSendAvailable: boolean;
  bulkEnabled: boolean;
  statusMessage: string;
}

export function getWhatsAppProviderReadiness(): WhatsAppProviderReadiness {
  const isProd = process.env.NODE_ENV === 'production';
  const rawProvider = (process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase();
  const providerName = (rawProvider || (isProd ? 'meta' : 'simulated')) as WhatsAppProviderName;

  let configured = false;
  let webhookConfigured = false;
  let statusMessage = 'WhatsApp setup incomplete';

  if (isProd) {
    if (rawProvider !== 'meta' && rawProvider !== 'twilio') {
      return {
        configured: false,
        provider: (rawProvider || 'simulated') as WhatsAppProviderName,
        webhookConfigured: false,
        testSendAvailable: false,
        bulkEnabled: false,
        statusMessage: 'WhatsApp setup incomplete: production requires explicit meta or twilio provider'
      };
    }

    if (rawProvider === 'meta') {
      const hasToken = !!process.env.META_WHATSAPP_ACCESS_TOKEN?.trim();
      const hasPhoneId = !!process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
      configured = hasToken && hasPhoneId;
      webhookConfigured = !!process.env.META_APP_SECRET?.trim() && !!process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
      statusMessage = configured ? 'WhatsApp is ready' : 'WhatsApp setup incomplete: Meta credentials missing';
    } else if (rawProvider === 'twilio') {
      const hasSid = !!process.env.TWILIO_ACCOUNT_SID?.trim();
      const hasAuth = !!process.env.TWILIO_AUTH_TOKEN?.trim();
      configured = hasSid && hasAuth;
      webhookConfigured = hasAuth;
      statusMessage = configured ? 'WhatsApp is ready' : 'WhatsApp setup incomplete: Twilio credentials missing';
    }
  } else {
    // Non-production (development / testing)
    if (rawProvider === 'meta') {
      const hasToken = !!process.env.META_WHATSAPP_ACCESS_TOKEN?.trim();
      const hasPhoneId = !!process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
      configured = hasToken && hasPhoneId;
      webhookConfigured = !!process.env.META_APP_SECRET?.trim() && !!process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
      statusMessage = configured ? 'WhatsApp is ready' : 'WhatsApp setup incomplete: Meta credentials missing';
    } else if (rawProvider === 'twilio') {
      const hasSid = !!process.env.TWILIO_ACCOUNT_SID?.trim();
      const hasAuth = !!process.env.TWILIO_AUTH_TOKEN?.trim();
      configured = hasSid && hasAuth;
      webhookConfigured = hasAuth;
      statusMessage = configured ? 'WhatsApp is ready' : 'WhatsApp setup incomplete: Twilio credentials missing';
    } else {
      // Simulated provider allowed only in non-production
      configured = true;
      webhookConfigured = true;
      statusMessage = 'WhatsApp is ready (simulated)';
    }
  }

  const testSendAvailable = configured;
  const bulkEnabled = configured;

  return {
    configured,
    provider: providerName,
    webhookConfigured,
    testSendAvailable,
    bulkEnabled,
    statusMessage
  };
}
