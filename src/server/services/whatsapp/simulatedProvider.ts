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

export class SimulatedWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'simulated' as const;

  async sendTemplate(params: SendTemplateParams): Promise<ProviderSendResult> {
    console.log(`[Simulated WhatsApp Template] Template: ${params.templateName}`);
    return {
      success: true,
      provider: this.name,
      messageId: `sim_msg_${crypto.randomUUID()}`,
      status: 'sent'
    };
  }

  async sendSessionMessage(params: SendSessionMessageParams): Promise<ProviderSendResult> {
    console.log(`[Simulated WhatsApp Session] Dispatched: "${params.body}"`);
    return {
      success: true,
      provider: this.name,
      messageId: `sim_msg_${crypto.randomUUID()}`,
      status: 'sent'
    };
  }

  verifyWebhookSignature(_context: WebhookVerificationContext): boolean {
    // Simulated provider accepts all in development/testing mode
    return true;
  }

  parseInbound(body: any): InboundWhatsAppMessage | null {
    if (!body || !body.from || !body.body) return null;
    return {
      provider: this.name,
      messageId: body.messageId || `sim_in_${crypto.randomUUID()}`,
      from: body.from,
      body: body.body,
      timestamp: new Date().toISOString(),
      rawPayload: body
    };
  }

  parseStatus(body: any): WhatsAppStatusUpdate | null {
    if (!body || !body.messageId) return null;
    return {
      provider: this.name,
      messageId: body.messageId,
      status: body.status || 'delivered',
      timestamp: new Date().toISOString(),
      recipientPhone: body.recipientPhone,
      rawPayload: body
    };
  }
}
