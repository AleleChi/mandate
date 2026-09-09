import { Router, Request, Response } from 'express';
import { execute } from '../db';
import crypto from 'crypto';
import { getWhatsAppProvider } from '../services/whatsapp';
import { TwilioWhatsAppProvider } from '../services/whatsapp/twilioProvider';
import { MetaWhatsAppProvider } from '../services/whatsapp/metaProvider';

const router = Router();

// Helper to construct request full URL for signature verification
function getRequestFullUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  return `${proto}://${host}${req.originalUrl || req.baseUrl + req.path}`;
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

    if (statusUpdate.status === 'failed') {
      console.warn(`[Twilio WhatsApp Delivery Failed] SID: ${statusUpdate.messageId} failed (Code: ${statusUpdate.errorCode || 'Unknown'}).`);
      const notifId = `notif-${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO notifications (
          id, title, message, type, audience_role, audience_scope, created_at, priority, channel, metadata_json
        ) VALUES (?, ?, ?, 'delivery_failed', 'admin', 'all', ?, 'high', 'in-app', ?)
      `, [
        notifId,
        'WhatsApp delivery failed',
        `WhatsApp delivery job failed (Error Code: ${statusUpdate.errorCode || 'Unknown'}).`,
        new Date().toISOString(),
        JSON.stringify({
          messageId: statusUpdate.messageId,
          errorCode: statusUpdate.errorCode,
          provider: 'twilio'
        })
      ]);
    }

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
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Error handling Meta WhatsApp webhook:', err);
    return res.status(500).json({ error: err.message || 'Meta webhook processing failed.' });
  }
});

export default router;
