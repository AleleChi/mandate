export interface ZeptoMailSendOptions {
  to: string;
  recipientName?: string;
  subject: string;
  html?: string;
  text?: string;
  fromName?: string;
  fromAddress?: string;
  replyTo?: string;
}

export interface ZeptoMailSendResult {
  success: boolean;
  provider: 'zeptomail';
  id?: string;
  error?: string;
  retryAfter?: number;
}

/**
 * Standard ZeptoMail Send API endpoint (can be overridden via ZEPTOMAIL_API_URL for regional routing)
 */
export const DEFAULT_ZEPTOMAIL_API_URL = 'https://api.zeptomail.com/v1.1/email';

/**
 * Bounded server-side timeout in milliseconds (10 seconds).
 */
export const ZEPTOMAIL_TIMEOUT_MS = 10000;

/**
 * Verifies whether ZeptoMail environment variables are configured.
 */
export function isZeptoMailConfigured(): boolean {
  const token = process.env.ZEPTOMAIL_SEND_TOKEN;
  const from = process.env.EMAIL_FROM_ADDRESS || process.env.MAIL_FROM_ADDRESS;
  return Boolean(token && token.trim().length > 0 && from && from.trim().length > 0);
}

/**
 * Formats the ZeptoMail Authorization header.
 * Ensures the prefix 'Zoho-enczapikey ' is applied exactly once.
 */
export function formatZeptoAuthHeader(token: string): string {
  const clean = (token || '').trim();
  if (clean.toLowerCase().startsWith('zoho-enczapikey ')) {
    return clean;
  }
  return `Zoho-enczapikey ${clean}`;
}

/**
 * Adapter for sending transactional emails via Zoho ZeptoMail Send API.
 * Uses native fetch with a bounded 10-second timeout, handles HTTP 429 safely,
 * and never leaks API tokens or sensitive headers.
 */
export async function sendZeptoMailEmail(options: ZeptoMailSendOptions): Promise<ZeptoMailSendResult> {
  const sendToken = process.env.ZEPTOMAIL_SEND_TOKEN;
  if (!sendToken || !sendToken.trim()) {
    console.warn('[ZeptoMail] Notice: ZEPTOMAIL_SEND_TOKEN is not configured on server.');
    return {
      success: false,
      provider: 'zeptomail',
      error: 'Email provider not configured'
    };
  }

  const fromAddress = options.fromAddress || process.env.EMAIL_FROM_ADDRESS || process.env.MAIL_FROM_ADDRESS;
  const fromName = options.fromName || process.env.EMAIL_FROM_NAME || process.env.MAIL_FROM_NAME || 'Koinonia Children & Teens';
  const replyTo = options.replyTo || process.env.EMAIL_REPLY_TO;

  if (!fromAddress) {
    console.error('[ZeptoMail] Neither EMAIL_FROM_ADDRESS nor MAIL_FROM_ADDRESS is configured.');
    return {
      success: false,
      provider: 'zeptomail',
      error: 'Email sender address not configured'
    };
  }

  const apiUrl = process.env.ZEPTOMAIL_API_URL?.trim() || DEFAULT_ZEPTOMAIL_API_URL;
  const authHeader = formatZeptoAuthHeader(sendToken);

  const payload: Record<string, any> = {
    from: {
      address: fromAddress,
      name: fromName
    },
    to: [
      {
        email_address: {
          address: options.to,
          name: options.recipientName || options.to
        }
      }
    ],
    subject: options.subject,
    htmlbody: options.html || options.text || options.subject
  };

  if (options.text) {
    payload.textbody = options.text;
  }

  if (replyTo && replyTo.trim()) {
    payload.reply_to = [
      {
        address: replyTo.trim(),
        name: fromName
      }
    ];
  }

  const timeoutMs = parseInt(process.env.ZEPTOMAIL_TIMEOUT_MS || '', 10) || ZEPTOMAIL_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Handle HTTP 429 Rate Limiting safely
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
      console.warn(`[ZeptoMail] Provider rate limit exceeded (HTTP 429). Retry-After: ${retryAfterHeader || 'not specified'}`);
      return {
        success: false,
        provider: 'zeptomail',
        error: 'Email provider rate limit exceeded. Please try again later.',
        retryAfter: isNaN(retryAfterSeconds as number) ? undefined : retryAfterSeconds
      };
    }

    const responseText = await response.text();
    let json: any = null;
    try {
      json = JSON.parse(responseText);
    } catch {
      // Non-JSON response
    }

    if (!response.ok) {
      const errorMsg = json?.data?.message || json?.message || `HTTP ${response.status} from provider`;
      console.error(`[ZeptoMail] Dispatch failed { status: ${response.status}, error: "${errorMsg}" }`);
      return {
        success: false,
        provider: 'zeptomail',
        error: response.status === 401 || response.status === 403
          ? 'Email provider authentication failed'
          : errorMsg
      };
    }

    const messageId = json?.request_id || (Array.isArray(json?.data) && json.data[0]?.message) || `zm_${Date.now()}`;
    console.log(`[ZeptoMail] Dispatch succeeded { messageId: "${messageId}" }`);
    return {
      success: true,
      provider: 'zeptomail',
      id: messageId
    };
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      console.error(`[ZeptoMail] Request timed out after ${ZEPTOMAIL_TIMEOUT_MS}ms`);
      return {
        success: false,
        provider: 'zeptomail',
        error: `Email provider request timed out after ${ZEPTOMAIL_TIMEOUT_MS / 1000}s`
      };
    }

    console.error(`[ZeptoMail] Dispatch error: ${err?.message || 'Unknown network error'}`);
    return {
      success: false,
      provider: 'zeptomail',
      error: 'We could not send the email right now. Please try again.'
    };
  }
}
