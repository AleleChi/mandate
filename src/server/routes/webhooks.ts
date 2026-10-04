import { Router, Request, Response } from 'express';
import { execute, queryOne } from '../db';
import crypto from 'crypto';
import { getWhatsAppProvider, logWhatsAppDelivery, WhatsAppStatusUpdate } from '../services/whatsapp';
import { TwilioWhatsAppProvider } from '../services/whatsapp/twilioProvider';
import { MetaWhatsAppProvider } from '../services/whatsapp/metaProvider';

const router = Router();

// Helper to construct request full URL for signature verification
function getRequestFullUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  return `${proto}://${host}${req.originalUrl || req.baseUrl + req.path}`;
}

/**
 * Common idempotent handler for delivery status callbacks from providers.
 * Updates whatsapp_delivery_logs and linked notification_jobs.
 */
async function handleDeliveryStatusUpdate(statusUpdate: WhatsAppStatusUpdate): Promise<void> {
  const now = statusUpdate.timestamp || new Date().toISOString();

  // 1. Locate matching log entry by provider + provider_message_id
  const existingLog = await queryOne(`
    SELECT id, job_id, status FROM whatsapp_delivery_logs
    WHERE provider = ? AND provider_message_id = ?
  `, [statusUpdate.provider, statusUpdate.messageId]);

  if (existingLog) {
    const statusRanks: Record<string, number> = {
      queued: 1,
      sent: 2,
      delivered: 3,
      read: 4,
      failed: 5
    };

    const currentRank = statusRanks[existingLog.status] || 0;
    const incomingRank = statusRanks[statusUpdate.status] || 0;

    // Progression safeguard: don't regress status (e.g. read back to delivered)
    if (statusUpdate.status === 'failed' || incomingRank >= currentRank) {
      const sentAt = statusUpdate.status === 'sent' ? now : undefined;
      const deliveredAt = statusUpdate.status === 'delivered' ? now : undefined;
      const readAt = statusUpdate.status === 'read' ? now : undefined;
      const failedAt = statusUpdate.status === 'failed' ? now : undefined;

      await execute(`
        UPDATE whatsapp_delivery_logs SET
          status = ?,
          error_code = COALESCE(?, error_code),
          error_message = COALESCE(?, error_message),
          sent_at = COALESCE(?, sent_at),
          delivered_at = COALESCE(?, delivered_at),
          read_at = COALESCE(?, read_at),
          failed_at = COALESCE(?, failed_at),
          updated_at = ?
        WHERE id = ?
      `, [
        statusUpdate.status,
        statusUpdate.errorCode || null,
        statusUpdate.errorMessage || null,
        sentAt || null,
        deliveredAt || null,
        readAt || null,
        failedAt || null,
        now,
        existingLog.id
      ]);
    }

    // 2. If linked to notification_jobs, update job status
    if (existingLog.job_id) {
      if (statusUpdate.status === 'delivered' || statusUpdate.status === 'read') {
        await execute(`
          UPDATE notification_jobs
          SET status = 'delivered', updated_at = ?
          WHERE id = ? AND status != 'failed'
        `, [now, existingLog.job_id]);
      } else if (statusUpdate.status === 'failed') {
        await execute(`
          UPDATE notification_jobs
          SET status = 'failed',
              failure_reason = ?,
              last_error = ?,
              updated_at = ?
          WHERE id = ?
        `, [
          statusUpdate.errorMessage || 'Provider delivery failed',
          statusUpdate.errorMessage || 'Provider delivery failed',
          now,
          existingLog.job_id
        ]);
      }
    }
  } else {
    // If not found (e.g. test send or out-of-order callback), insert into whatsapp_delivery_logs
    await logWhatsAppDelivery({
      recipientPhone: statusUpdate.recipientPhone || 'unknown',
      provider: statusUpdate.provider,
      providerMessageId: statusUpdate.messageId,
      status: statusUpdate.status,
      errorCode: statusUpdate.errorCode,
      errorMessage: statusUpdate.errorMessage,
      sentAt: statusUpdate.status === 'sent' ? now : null,
      deliveredAt: statusUpdate.status === 'delivered' ? now : null,
      readAt: statusUpdate.status === 'read' ? now : null,
      failedAt: statusUpdate.status === 'failed' ? now : null
    });
  }

  // 3. Admin alert on delivery failure
  if (statusUpdate.status === 'failed') {
    const notifId = `notif-${crypto.randomUUID()}`;
    await execute(`
      INSERT INTO notifications (
        id, title, message, type, audience_role, audience_scope, created_at, priority, channel, metadata_json
      ) VALUES (?, ?, ?, 'delivery_failed', 'admin', 'all', ?, 'high', 'in-app', ?)
    `, [
      notifId,
      'WhatsApp delivery failed',
      `WhatsApp delivery failed for ${statusUpdate.recipientPhone || 'recipient'} (Code: ${statusUpdate.errorCode || 'Unknown'}).`,
      now,
      JSON.stringify({
        messageId: statusUpdate.messageId,
        errorCode: statusUpdate.errorCode,
        provider: statusUpdate.provider
      })
    ]);
  }
}

// ==========================================
// 1. TWILIO WHATSAPP WEBHOOKS
// ==========================================

// POST /api/webhooks/twilio/whatsapp
// Receives inbound messages from users via Twilio
router.post('/twilio/whatsapp', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const twilioProvider = new TwilioWhatsAppProvider();

    // Verify signature in production if credentials are set
    if (process.env.TWILIO_AUTH_TOKEN && process.env.NODE_ENV !== 'test') {
      const fullUrl = getRequestFullUrl(req);
      const isValid = twilioProvider.verifyWebhookSignature({
        headers: req.headers,
        body: req.body,
        url: fullUrl
      });

      if (!isValid) {
        console.warn('[Twilio Inbound Webhook] Rejected: Invalid X-Twilio-Signature.');
        return res.status(403).json({ error: 'Invalid webhook signature.' });
      }
    }

    const inbound = twilioProvider.parseInbound(req.body);
    if (inbound && inbound.from && inbound.body) {
      console.log(`[Twilio Inbound WhatsApp] Message received. SID: ${inbound.messageId}`);

      // SAFEGUARD: Inbound WhatsApp messages must NOT mutate child, pickup, or attendance records.
      // Log as in-app notification for administrative awareness only.
      const notifId = `notif-${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO notifications (
          id, title, message, type, audience_role, audience_scope, created_at, priority, channel, metadata_json
        ) VALUES (?, ?, ?, 'incoming_reply', 'admin', 'all', ?, 'normal', 'in-app', ?)
      `, [
        notifId,
        'Incoming WhatsApp reply',
        `New WhatsApp message received: "${inbound.body.substring(0, 60)}${inbound.body.length > 60 ? '...' : ''}"`,
        new Date().toISOString(),
        JSON.stringify({ messageId: inbound.messageId, provider: 'twilio' })
      ]);
    }

    // Respond with empty TwiML (required by Twilio)
    res.header('Content-Type', 'text/xml');
    return res.send('<Response></Response>');
  } catch (err: any) {
    console.error('Error handling Twilio inbound webhook:', err);
    return res.status(500).json({ error: err.message || 'Webhook processing failed.' });
  }
});

// POST /api/webhooks/twilio/whatsapp-status
// Receives status updates (sent, delivered, read, failed) from Twilio
router.post('/twilio/whatsapp-status', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const twilioProvider = new TwilioWhatsAppProvider();

    // Verify signature in production if credentials are set
    if (process.env.TWILIO_AUTH_TOKEN && process.env.NODE_ENV !== 'test') {
      const fullUrl = getRequestFullUrl(req);
      const isValid = twilioProvider.verifyWebhookSignature({
        headers: req.headers,
        body: req.body,
        url: fullUrl
      });

      if (!isValid) {
        console.warn('[Twilio Status Webhook] Rejected: Invalid X-Twilio-Signature.');
        return res.status(403).json({ error: 'Invalid webhook signature.' });
      }
    }

    const statusUpdate = twilioProvider.parseStatus(req.body);
    if (!statusUpdate) {
      return res.status(200).json({ received: true, status: 'ignored_empty' });
    }

    console.log(`[Twilio WhatsApp Status] SID: ${statusUpdate.messageId}, Status: ${statusUpdate.status}, Error: ${statusUpdate.errorCode || 'None'}`);

    await handleDeliveryStatusUpdate(statusUpdate);

    return res.status(200).json({ success: true, messageId: statusUpdate.messageId, status: statusUpdate.status });
  } catch (err: any) {
    console.error('Error handling Twilio status webhook:', err);
    return res.status(500).json({ error: err.message || 'Webhook processing failed.' });
  }
});

// ==========================================
// 2. META WHATSAPP CLOUD API WEBHOOKS
// ==========================================

// GET /api/webhooks/meta/whatsapp
// Handles Meta webhook verification handshake
router.get('/meta/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    console.log('[Meta Webhook Verified] Successfully validated webhook verify token.');
    return res.status(200).send(challenge);
  }

  return res.status(403).send('Verification token mismatch.');
});

// POST /api/webhooks/meta/whatsapp
// Receives inbound messages and status events from Meta Cloud API
router.post('/meta/whatsapp', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const metaProvider = new MetaWhatsAppProvider();

    if (process.env.META_APP_SECRET && process.env.NODE_ENV !== 'test') {
      const isValid = metaProvider.verifyWebhookSignature({
        headers: req.headers,
        body: req.body
      });

      if (!isValid) {
        console.warn('[Meta Webhook] Rejected: Invalid X-Hub-Signature-256.');
        return res.status(403).json({ error: 'Invalid Meta signature.' });
      }
    }

    const inbound = metaProvider.parseInbound(req.body);
    if (inbound && inbound.from && inbound.body) {
      console.log(`[Meta Inbound WhatsApp] Message received. ID: ${inbound.messageId}`);

      const notifId = `notif-${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO notifications (
          id, title, message, type, audience_role, audience_scope, created_at, priority, channel, metadata_json
        ) VALUES (?, ?, ?, 'incoming_reply', 'admin', 'all', ?, 'normal', 'in-app', ?)
      `, [
        notifId,
        'Incoming WhatsApp reply',
        `New WhatsApp message received: "${inbound.body.substring(0, 60)}${inbound.body.length > 60 ? '...' : ''}"`,
        new Date().toISOString(),
        JSON.stringify({ messageId: inbound.messageId, provider: 'meta' })
      ]);
    }

    const statusUpdate = metaProvider.parseStatus(req.body);
    if (statusUpdate) {
      console.log(`[Meta WhatsApp Status] ID: ${statusUpdate.messageId}, Status: ${statusUpdate.status}`);
      await handleDeliveryStatusUpdate(statusUpdate);
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Error handling Meta WhatsApp webhook:', err);
    return res.status(500).json({ error: err.message || 'Meta webhook processing failed.' });
  }
});

export default router;
