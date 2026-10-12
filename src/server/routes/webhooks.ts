import express, { Router, Request, Response } from 'express';
import { execute, queryOne } from '../db';
import crypto from 'crypto';
import { getWhatsAppProvider, logWhatsAppDelivery, WhatsAppStatusUpdate } from '../services/whatsapp';
import { TwilioWhatsAppProvider } from '../services/whatsapp/twilioProvider';
import { MetaWhatsAppProvider } from '../services/whatsapp/metaProvider';
import { ZohoWhatsAppProvider } from '../services/whatsapp/zohoProvider';

const router = Router();

// Helper to construct request full URL for signature verification
function getRequestFullUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  return `${proto}://${host}${req.originalUrl || req.baseUrl + req.path}`;
}

/**
 * Evaluates whether an incoming delivery status transition is valid according to
 * WhatsApp message lifecycle guarantees.
 *
 * Rules:
 * 1. queued -> sent -> delivered -> read
 * 2. Failure states (failed, undelivered, process_failed) may transition from queued or sent.
 * 3. Once delivered or read, subsequent failure or regress statuses are strictly BLOCKED.
 * 4. Duplicate same-status transitions are idempotent (allowed).
 */
export function canTransitionStatus(currentStatus: string, incomingStatus: string): boolean {
  const normCurrent = currentStatus.toLowerCase().trim();
  const normIncoming = incomingStatus.toLowerCase().trim();

  // 1. Same-status is idempotent
  if (normCurrent === normIncoming) {
    return true;
  }

  // 2. Terminal state: 'read' cannot regress to ANY previous or failure state
  if (normCurrent === 'read') {
    return false;
  }

  // 3. 'delivered' can only advance to 'read'.
  // Explicitly blocks: sent, queued, failed, undelivered, process_failed
  if (normCurrent === 'delivered') {
    return normIncoming === 'read';
  }

  // 4. 'failed' (or undelivered) cannot regress back to queued or sent
  if (normCurrent === 'failed' || normCurrent === 'undelivered' || normCurrent === 'process_failed') {
    return false;
  }

  // 5. 'sent' can advance to 'delivered', 'read', or fail
  if (normCurrent === 'sent') {
    return (
      normIncoming === 'delivered' ||
      normIncoming === 'read' ||
      normIncoming === 'failed' ||
      normIncoming === 'undelivered' ||
      normIncoming === 'process_failed'
    );
  }

  // 6. 'queued' can transition to sent, delivered, read, or failed
  if (normCurrent === 'queued') {
    return (
      normIncoming === 'sent' ||
      normIncoming === 'delivered' ||
      normIncoming === 'read' ||
      normIncoming === 'failed' ||
      normIncoming === 'undelivered' ||
      normIncoming === 'process_failed'
    );
  }

  return true;
}

/**
 * Common idempotent handler for delivery status callbacks from providers.
 * Updates whatsapp_delivery_logs and linked notification_jobs.
 */
export async function handleDeliveryStatusUpdate(statusUpdate: WhatsAppStatusUpdate): Promise<void> {
  const now = statusUpdate.timestamp || new Date().toISOString();

  // 1. Locate matching log entry by provider + provider_message_id
  const existingLog = await queryOne(`
    SELECT id, job_id, status FROM whatsapp_delivery_logs
    WHERE provider = ? AND provider_message_id = ?
  `, [statusUpdate.provider, statusUpdate.messageId]);

  if (existingLog) {
    // Progression safeguard: don't regress status or overwrite confirmed delivered/read with failure
    if (!canTransitionStatus(existingLog.status, statusUpdate.status)) {
      return;
    }

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

// ==========================================
// 3. ZOHO WHATSAPP CPAAS WEBHOOKS
// ==========================================

// POST /api/webhooks/zoho/whatsapp
// Receives inbound messages and delivery status events from Zoho CPaaS
router.post('/zoho/whatsapp', express.raw({ type: '*/*', limit: '10mb' }), async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const zohoProvider = new ZohoWhatsAppProvider();

    const rawBodyBuffer = Buffer.isBuffer(req.body) ? req.body : (req as any).rawBody;
    const rawBodyString = rawBodyBuffer ? rawBodyBuffer.toString('utf-8') : (typeof req.body === 'string' ? req.body : undefined);

    // Verify signature in production or if secret is configured
    if (process.env.ZOHO_WHATSAPP_WEBHOOK_SECRET || process.env.NODE_ENV === 'production') {
      const isValid = zohoProvider.verifyWebhookSignature({
        headers: req.headers,
        body: req.body,
        rawBody: rawBodyBuffer || rawBodyString
      });

      if (!isValid) {
        console.warn('[Zoho Webhook] Rejected: Invalid webhook signature.');
        return res.status(403).json({ error: 'Invalid webhook signature.' });
      }
    }

    // Safely extract and decode payload whether received as Buffer, URL-encoded string, or JSON
    let payloadToProcess = req.body;
    if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
      const bodyStr = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : req.body;
      let decodedStr = bodyStr;
      try {
        decodedStr = decodeURIComponent(bodyStr.replace(/\+/g, '%20'));
      } catch {
        decodedStr = bodyStr;
      }
      const firstEq = decodedStr.indexOf('=');
      const candidateStr = firstEq !== -1 ? decodedStr.substring(firstEq + 1) : decodedStr;
      try {
        payloadToProcess = JSON.parse(candidateStr);
      } catch {
        try {
          payloadToProcess = JSON.parse(decodedStr);
        } catch {
          payloadToProcess = candidateStr;
        }
      }
    } else if (req.body && typeof req.body === 'object' && typeof req.body.data === 'string') {
      try {
        payloadToProcess = JSON.parse(req.body.data);
      } catch {
        payloadToProcess = req.body;
      }
    }

    // 1. Process inbound user reply if present
    const inbound = zohoProvider.parseInbound(payloadToProcess);
    if (inbound && inbound.from && inbound.body) {
      console.log(`[Zoho Inbound WhatsApp] Message received. ID: ${inbound.messageId}`);

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
        JSON.stringify({ messageId: inbound.messageId, provider: 'zoho' })
      ]);
    }

    // 2. Process delivery/read/failure status updates via common monotonic handler
    const statusUpdate = zohoProvider.parseStatus(payloadToProcess);
    if (statusUpdate) {
      console.log(`[Zoho WhatsApp Status] ID: ${statusUpdate.messageId}, Status: ${statusUpdate.status}`);
      await handleDeliveryStatusUpdate(statusUpdate);
      return res.status(200).json({ success: true, messageId: statusUpdate.messageId, status: statusUpdate.status });
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Error handling Zoho WhatsApp webhook:', err);
    return res.status(500).json({ error: err.message || 'Zoho webhook processing failed.' });
  }
});

export default router;
