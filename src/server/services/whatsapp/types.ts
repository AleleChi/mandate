export type WhatsAppProviderName = 'twilio' | 'meta' | 'simulated';

export interface SendTemplateParams {
  to: string; // E.164 formatted phone number
  templateName: string;
  templateLanguage?: string;
  parameters: Array<{ type: 'text' | 'currency' | 'date_time'; text?: string }>;
  idempotencyKey?: string;
}

export interface SendSessionMessageParams {
  to: string; // E.164 formatted phone number
  body: string;
  idempotencyKey?: string;
}

export interface ProviderSendResult {
  success: boolean;
  provider: WhatsAppProviderName;
  messageId?: string;
  status: 'queued' | 'sent' | 'failed';
  error?: string;
  rawResponse?: any;
}

export interface WhatsAppStatusUpdate {
  provider: WhatsAppProviderName;
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp?: string;
  recipientPhone?: string;
  errorCode?: string;
  errorMessage?: string;
  rawPayload?: any;
}

export interface InboundWhatsAppMessage {
  provider: WhatsAppProviderName;
  messageId: string;
  from: string;
  body: string;
  timestamp?: string;
  rawPayload?: any;
}

export interface WebhookVerificationContext {
  headers: Record<string, any>;
  rawBody?: string | Buffer;
  body?: any;
  url?: string;
}

export interface WhatsAppProvider {
  readonly name: WhatsAppProviderName;

  /**
   * Sends an approved WhatsApp template message (Utility/Marketing).
   */
  sendTemplate(params: SendTemplateParams): Promise<ProviderSendResult>;

  /**
   * Sends a session text message (only permitted within active 24h customer service window).
   */
  sendSessionMessage(params: SendSessionMessageParams): Promise<ProviderSendResult>;

  /**
   * Cryptographically verifies inbound webhook signature.
   */
  verifyWebhookSignature(context: WebhookVerificationContext): boolean;

  /**
   * Parses an inbound message from provider webhook payload.
   */
  parseInbound(body: any): InboundWhatsAppMessage | null;

  /**
   * Parses a delivery status update from provider webhook payload.
   */
  parseStatus(body: any): WhatsAppStatusUpdate | null;
}
