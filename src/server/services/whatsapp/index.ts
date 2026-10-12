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
import { ZohoWhatsAppProvider, isZohoWhatsAppConfigured } from './zohoProvider';

export * from './types';
export * from './consent';
export * from './queue';
export * from './worker';
export { TwilioWhatsAppProvider } from './twilioProvider';
export { MetaWhatsAppProvider } from './metaProvider';
export { SimulatedWhatsAppProvider } from './simulatedProvider';
export { ZohoWhatsAppProvider, isZohoWhatsAppConfigured } from './zohoProvider';
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

export function resetWhatsAppProviderCache(override?: WhatsAppProvider | null): void {
  cachedProvider = override || null;
  cachedCacheKey = override ? 'custom-test' : null;
}

export function resolveWhatsAppProviderName(raw?: string): WhatsAppProviderName | 'unsupported' {
  const provider = (raw !== undefined ? raw : (process.env.WHATSAPP_PROVIDER || '')).trim().toLowerCase();
  if (!provider) {
    return 'twilio';
  }
  if (provider === 'twilio' || provider === 'zoho' || provider === 'meta') {
    return provider;
  }
  if (provider === 'simulated') {
    return 'simulated';
  }
  return 'unsupported';
}

export function getWhatsAppProvider(): WhatsAppProvider {
  const isProd = process.env.NODE_ENV === 'production';
  const rawProvider = (process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase();
  const cacheKey = `${isProd ? 'prod' : 'dev'}:${rawProvider}`;

  if (cachedProvider && (cachedCacheKey === 'custom-test' || cachedCacheKey === cacheKey)) {
    return cachedProvider;
  }

  if (isProd) {
    // Production: Safe default is strictly 'twilio' when missing or blank
    const effectiveProvider = !rawProvider ? 'twilio' : rawProvider;

    if (effectiveProvider === 'twilio') {
      cachedProvider = new TwilioWhatsAppProvider();
    } else if (effectiveProvider === 'zoho') {
      cachedProvider = new ZohoWhatsAppProvider();
    } else if (effectiveProvider === 'meta') {
      cachedProvider = new MetaWhatsAppProvider();
    } else {
      // Unsupported value -> normalized configuration failure -> ZERO provider network calls
      cachedProvider = new FailClosedWhatsAppProvider(
        effectiveProvider as WhatsAppProviderName,
        `WhatsApp setup incomplete: provider "${rawProvider}" is not supported. Supported production providers are: zoho, twilio, meta.`
      );
    }
  } else {
    // Non-production (development / test)
    if (rawProvider === 'twilio') {
      cachedProvider = new TwilioWhatsAppProvider();
    } else if (rawProvider === 'zoho') {
      cachedProvider = new ZohoWhatsAppProvider();
    } else if (rawProvider === 'meta') {
      cachedProvider = new MetaWhatsAppProvider();
    } else if (rawProvider === 'simulated') {
      cachedProvider = new SimulatedWhatsAppProvider();
    } else if (!rawProvider) {
      // Missing or blank in development: use Twilio if configured, else Simulated for zero-credential tests
      if (process.env.TWILIO_ACCOUNT_SID?.trim()) {
        cachedProvider = new TwilioWhatsAppProvider();
      } else {
        cachedProvider = new SimulatedWhatsAppProvider();
      }
    } else {
      // Unsupported value -> normalized configuration failure -> ZERO provider network calls
      cachedProvider = new FailClosedWhatsAppProvider(
        rawProvider as WhatsAppProviderName,
        `WhatsApp setup incomplete: provider "${rawProvider}" is not supported. Supported providers are: zoho, meta, twilio, simulated.`
      );
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
  isSandbox?: boolean;
  twilioConfigured: boolean;
  zohoConfigured: boolean;
  activeProvider: WhatsAppProviderName;
}

export function getWhatsAppProviderReadiness(): WhatsAppProviderReadiness {
  const isProd = process.env.NODE_ENV === 'production';
  const rawProvider = (process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase();
  const isSandbox = process.env.TWILIO_WHATSAPP_SANDBOX === 'true';

  // Twilio readiness
  const hasTwilioSid = !!process.env.TWILIO_ACCOUNT_SID?.trim();
  const hasTwilioAuth = !!process.env.TWILIO_AUTH_TOKEN?.trim();
  const twilioConfigured = hasTwilioSid && hasTwilioAuth;

  // Zoho readiness (requires API key, From number, and at least one template mapping)
  const zohoConfigured = isZohoWhatsAppConfigured();

  // Meta readiness
  const hasMetaToken = !!process.env.META_WHATSAPP_ACCESS_TOKEN?.trim();
  const hasMetaPhoneId = !!process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  const metaConfigured = hasMetaToken && hasMetaPhoneId;

  let effectiveProvider: WhatsAppProviderName = 'twilio';
  let configured = false;
  let webhookConfigured = false;
  let statusMessage = 'WhatsApp setup incomplete';

  if (isProd) {
    effectiveProvider = (!rawProvider ? 'twilio' : rawProvider) as WhatsAppProviderName;

    if (effectiveProvider === 'twilio') {
      configured = twilioConfigured;
      webhookConfigured = hasTwilioAuth;
      statusMessage = configured ? 'WhatsApp is ready' : 'WhatsApp setup incomplete: Twilio credentials missing';
    } else if (effectiveProvider === 'zoho') {
      configured = zohoConfigured;
      webhookConfigured = !!process.env.ZOHO_WHATSAPP_WEBHOOK_SECRET?.trim();
      statusMessage = configured ? 'WhatsApp is ready' : 'WhatsApp setup incomplete: Zoho CPaaS credentials or templates missing';
    } else if (effectiveProvider === 'meta') {
      configured = metaConfigured;
      webhookConfigured = !!process.env.META_APP_SECRET?.trim() && !!process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
      statusMessage = configured ? 'WhatsApp is ready' : 'WhatsApp setup incomplete: Meta credentials missing';
    } else {
      configured = false;
      webhookConfigured = false;
      statusMessage = `WhatsApp setup incomplete: provider "${rawProvider}" is not supported`;
    }
  } else {
    // Non-production
    if (rawProvider === 'twilio') {
      effectiveProvider = 'twilio';
      configured = twilioConfigured;
      webhookConfigured = hasTwilioAuth;
      statusMessage = configured ? 'WhatsApp is ready' : 'WhatsApp setup incomplete: Twilio credentials missing';
    } else if (rawProvider === 'zoho') {
      effectiveProvider = 'zoho';
      configured = zohoConfigured;
      webhookConfigured = !!process.env.ZOHO_WHATSAPP_WEBHOOK_SECRET?.trim();
      statusMessage = configured ? 'WhatsApp is ready' : 'WhatsApp setup incomplete: Zoho CPaaS credentials or templates missing';
    } else if (rawProvider === 'meta') {
      effectiveProvider = 'meta';
      configured = metaConfigured;
      webhookConfigured = !!process.env.META_APP_SECRET?.trim() && !!process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
      statusMessage = configured ? 'WhatsApp is ready' : 'WhatsApp setup incomplete: Meta credentials missing';
    } else if (rawProvider === 'simulated') {
      effectiveProvider = 'simulated';
      configured = true;
      webhookConfigured = true;
      statusMessage = 'WhatsApp is ready (simulated)';
    } else if (!rawProvider) {
      if (twilioConfigured) {
        effectiveProvider = 'twilio';
        configured = true;
        webhookConfigured = hasTwilioAuth;
        statusMessage = 'WhatsApp is ready';
      } else {
        effectiveProvider = 'simulated';
        configured = true;
        webhookConfigured = true;
        statusMessage = 'WhatsApp is ready (simulated)';
      }
    } else {
      effectiveProvider = rawProvider as WhatsAppProviderName;
      configured = false;
      webhookConfigured = false;
      statusMessage = `WhatsApp setup incomplete: provider "${rawProvider}" is not supported`;
    }
  }

  const testSendAvailable = configured;
  const bulkEnabled = configured;

  return {
    configured,
    provider: effectiveProvider,
    activeProvider: effectiveProvider,
    twilioConfigured,
    zohoConfigured,
    webhookConfigured,
    testSendAvailable,
    bulkEnabled,
    statusMessage,
    isSandbox
  };
}
