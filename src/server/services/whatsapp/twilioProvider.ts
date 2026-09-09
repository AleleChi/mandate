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

export class TwilioWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'twilio' as const;

  private getCredentials() {
    return {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      fromNumber: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'
    };
  }

  async sendTemplate(params: SendTemplateParams): Promise<ProviderSendResult> {
    // For Twilio, template parameters are mapped into the message body or Content SID
    const renderedBody = params.parameters.map(p => p.text || '').join(' ');
    return this.sendSessionMessage({
      to: params.to,
      body: renderedBody,
      idempotencyKey: params.idempotencyKey
    });
  }

  async sendSessionMessage(params: SendSessionMessageParams): Promise<ProviderSendResult> {
    const { accountSid, authToken, fromNumber } = this.getCredentials();

    if (!accountSid || !authToken) {
      return {
        success: false,
        provider: this.name,
        status: 'failed',
        error: 'Twilio credentials (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN) are unconfigured.'
      };
    }

    const formattedTo = params.to.startsWith('whatsapp:') ? params.to : `whatsapp:${params.to}`;
    const formattedFrom = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;

    try {
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const bodyParams = new URLSearchParams();
      bodyParams.append('To', formattedTo);
      bodyParams.append('From', formattedFrom);
      bodyParams.append('Body', params.body);

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyParams.toString()
      });

      const resJson = await response.json() as any;

      if (!response.ok) {
        let errMsg = resJson.message || `Twilio dispatch failed with HTTP ${response.status}`;
        if (resJson.code === 20003 || errMsg.trim().toLowerCase() === 'authenticate' || response.status === 401) {
          errMsg = 'Twilio authentication failed (Error 20003). Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in server configuration.';
        } else if (resJson.code) {
          errMsg = `Twilio error ${resJson.code}: ${errMsg}`;
        }
        return {
          success: false,
          provider: this.name,
          status: 'failed',
          error: errMsg,
          rawResponse: resJson
        };
      }

      return {
        success: true,
        provider: this.name,
        messageId: resJson.sid,
        status: resJson.status === 'queued' ? 'queued' : 'sent',
        rawResponse: resJson
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        status: 'failed',
        error: err?.message || 'Network exception connecting to Twilio.'
      };
    }
  }

  verifyWebhookSignature(context: WebhookVerificationContext): boolean {
    const { authToken } = this.getCredentials();
    if (!authToken) {
      console.warn('[Twilio Webhook] Validation failed: TWILIO_AUTH_TOKEN is not configured.');
      return false;
    }

    const signature = context.headers['x-twilio-signature'];
    if (!signature || typeof signature !== 'string') {
      return false;
    }

    // Determine target URL
    const url = context.url || '';
    if (!url) {
      return false;
    }

    // Sort parameters alphabetically
    const body = context.body || {};
    let dataToSign = url;
    const sortedKeys = Object.keys(body).sort();
    for (const key of sortedKeys) {
      dataToSign += key + body[key];
    }

    const hmac = crypto.createHmac('sha1', authToken);
    hmac.update(Buffer.from(dataToSign, 'utf-8'));
    const expectedSignature = hmac.digest('base64');

    try {
      const sigBuffer = Buffer.from(signature, 'utf-8');
      const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }
      return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  parseInbound(body: any): InboundWhatsAppMessage | null {
    if (!body || !body.MessageSid || !body.From) {
      return null;
    }

    let from = String(body.From).trim();
    if (from.startsWith('whatsapp:')) {
      from = from.replace(/^whatsapp:/, '');
    }

    return {
      provider: this.name,
      messageId: String(body.MessageSid),
      from,
      body: String(body.Body || '').trim(),
      timestamp: new Date().toISOString(),
      rawPayload: body
    };
  }

  parseStatus(body: any): WhatsAppStatusUpdate | null {
    if (!body || !body.MessageSid) {
      return null;
    }

    const statusStr = String(body.MessageStatus || '').toLowerCase();
    let normalizedStatus: 'sent' | 'delivered' | 'read' | 'failed' = 'sent';

    if (statusStr === 'delivered') {
      normalizedStatus = 'delivered';
    } else if (statusStr === 'read') {
      normalizedStatus = 'read';
    } else if (statusStr === 'failed' || statusStr === 'undelivered') {
      normalizedStatus = 'failed';
    } else if (statusStr === 'sent' || statusStr === 'queued' || statusStr === 'sending') {
      normalizedStatus = 'sent';
    }

    return {
      provider: this.name,
      messageId: String(body.MessageSid),
      status: normalizedStatus,
      timestamp: new Date().toISOString(),
      recipientPhone: body.To ? String(body.To).replace(/^whatsapp:/, '') : undefined,
      errorCode: body.ErrorCode ? String(body.ErrorCode) : undefined,
      errorMessage: body.ErrorMessage ? String(body.ErrorMessage) : undefined,
      rawPayload: body
    };
  }
}
