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

export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'meta' as const;

  private getCredentials() {
    return {
      accessToken: process.env.META_WHATSAPP_ACCESS_TOKEN || '',
      phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID || '',
      appSecret: process.env.META_APP_SECRET || '',
      webhookVerifyToken: process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN || ''
    };
  }

  async sendTemplate(params: SendTemplateParams): Promise<ProviderSendResult> {
    const { accessToken, phoneNumberId } = this.getCredentials();

    if (!accessToken || !phoneNumberId) {
      return {
        success: false,
        provider: this.name,
        status: 'failed',
        error: 'Meta WhatsApp credentials (META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID) are unconfigured.'
      };
    }

    const recipient = params.to.replace(/^\+/, '');

    const payload = {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'template',
      template: {
        name: params.templateName,
        language: {
          code: params.templateLanguage || 'en_US'
        },
        components: [
          {
            type: 'body',
            parameters: params.parameters
          }
        ]
      }
    };

    try {
      const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const resJson = await response.json() as any;

      if (!response.ok) {
        return {
          success: false,
          provider: this.name,
          status: 'failed',
          error: resJson.error?.message || `Meta Cloud API error: HTTP ${response.status}`,
          rawResponse: resJson
        };
      }

      const messageId = resJson.messages?.[0]?.id;
      return {
        success: true,
        provider: this.name,
        messageId,
        status: 'queued',
        rawResponse: resJson
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        status: 'failed',
        error: err?.message || 'Network exception connecting to Meta Cloud API.'
      };
    }
  }

  async sendSessionMessage(params: SendSessionMessageParams): Promise<ProviderSendResult> {
    const { accessToken, phoneNumberId } = this.getCredentials();

    if (!accessToken || !phoneNumberId) {
      return {
        success: false,
        provider: this.name,
        status: 'failed',
        error: 'Meta WhatsApp credentials are not configured.'
      };
    }

    const recipient = params.to.replace(/^\+/, '');

    const payload = {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'text',
      text: {
        preview_url: false,
        body: params.body
      }
    };

    try {
      const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const resJson = await response.json() as any;

      if (!response.ok) {
        return {
          success: false,
          provider: this.name,
          status: 'failed',
          error: resJson.error?.message || `Meta Cloud API session dispatch failed`,
          rawResponse: resJson
        };
      }

      const messageId = resJson.messages?.[0]?.id;
      return {
        success: true,
        provider: this.name,
        messageId,
        status: 'sent',
        rawResponse: resJson
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        status: 'failed',
        error: err?.message || 'Network error sending Meta session message.'
      };
    }
  }

  verifyWebhookSignature(context: WebhookVerificationContext): boolean {
    const { appSecret } = this.getCredentials();
    if (!appSecret) {
      console.warn('[Meta Webhook] META_APP_SECRET is not configured.');
      return false;
    }

    const hubSig = context.headers['x-hub-signature-256'];
    if (!hubSig || typeof hubSig !== 'string' || !hubSig.startsWith('sha256=')) {
      return false;
    }

    const signature = hubSig.substring(7);
    const rawBody = typeof context.rawBody === 'string'
      ? Buffer.from(context.rawBody, 'utf-8')
      : Buffer.isBuffer(context.rawBody)
      ? context.rawBody
      : Buffer.from(JSON.stringify(context.body || {}), 'utf-8');

    const hmac = crypto.createHmac('sha256', appSecret);
    hmac.update(rawBody);
    const expectedSig = hmac.digest('hex');

    try {
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expectedSig, 'hex');
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  parseInbound(body: any): InboundWhatsAppMessage | null {
    try {
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const message = change?.value?.messages?.[0];

      if (!message || !message.id || !message.from) {
        return null;
      }

      return {
        provider: this.name,
        messageId: message.id,
        from: message.from,
        body: message.text?.body || message.button?.text || '',
        timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
        rawPayload: body
      };
    } catch {
      return null;
    }
  }

  parseStatus(body: any): WhatsAppStatusUpdate | null {
    try {
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const statusObj = change?.value?.statuses?.[0];

      if (!statusObj || !statusObj.id) {
        return null;
      }

      const statusStr = String(statusObj.status).toLowerCase();
      let normalizedStatus: 'sent' | 'delivered' | 'read' | 'failed' = 'sent';

      if (statusStr === 'delivered') normalizedStatus = 'delivered';
      else if (statusStr === 'read') normalizedStatus = 'read';
      else if (statusStr === 'failed') normalizedStatus = 'failed';
      else normalizedStatus = 'sent';

      const errorDetail = statusObj.errors?.[0];

      return {
        provider: this.name,
        messageId: statusObj.id,
        status: normalizedStatus,
        timestamp: statusObj.timestamp ? new Date(Number(statusObj.timestamp) * 1000).toISOString() : new Date().toISOString(),
        recipientPhone: statusObj.recipient_id,
        errorCode: errorDetail?.code ? String(errorDetail.code) : undefined,
        errorMessage: errorDetail?.title || errorDetail?.message,
        rawPayload: body
      };
    } catch {
      return null;
    }
  }
}
