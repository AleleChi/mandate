import { Router, Request, Response } from 'express';
import { execute } from '../db';
import crypto from 'crypto';

const router = Router();

// POST /api/webhooks/twilio/whatsapp
// Receives inbound messages from users
router.post('/twilio/whatsapp', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const { From, Body, MessageSid } = req.body;
    console.log(`[Twilio Inbound WhatsApp Webhook] From: ${From}, Body: "${Body}", MessageSid: ${MessageSid}`);

    if (From && Body) {
      const notifId = `notif-${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO notifications (
          id, title, message, type, audience_role, audience_scope, created_at, priority, channel, metadata_json
        ) VALUES (?, ?, ?, 'incoming_reply', 'admin', 'all', ?, 'normal', 'in-app', ?)
      `, [
        notifId,
        'Incoming care reply',
        `New message from ${From}: "${Body.substring(0, 60)}${Body.length > 60 ? '...' : ''}"`,
        new Date().toISOString(),
        JSON.stringify({ from: From, body: Body, type: 'incoming_reply' })
      ]);
    }

    // Respond with empty TwiML (required/recommended by Twilio)
    res.header('Content-Type', 'text/xml');
    return res.send('<Response></Response>');
  } catch (err: any) {
    console.error('Error handling Twilio inbound webhook:', err);
    return res.status(500).json({ error: err.message || 'Webhook processing failed.' });
  }
});

// POST /api/webhooks/twilio/whatsapp-status
// Receives status updates (delivered, sent, read, failed, etc.)
router.post('/twilio/whatsapp-status', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const { MessageSid, MessageStatus, ErrorCode, To } = req.body;
    console.log(`[Twilio Status Webhook] SID: ${MessageSid}, Status: ${MessageStatus}, ErrorCode: ${ErrorCode || 'None'}, To: ${To}`);

    // If a status delivery failed, log it or handle it
    if (MessageStatus === 'failed') {
      console.warn(`[Twilio WhatsApp Status] Delivery to ${To} failed with Twilio Error Code: ${ErrorCode}`);
      const notifId = `notif-${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO notifications (
          id, title, message, type, audience_role, audience_scope, created_at, priority, channel, metadata_json
        ) VALUES (?, ?, ?, 'delivery_failed', 'admin', 'all', ?, 'high', 'in-app', ?)
      `, [
        notifId,
        'Message delivery failed',
        `WhatsApp delivery to ${To} failed (Error Code: ${ErrorCode || 'Unknown'}).`,
        new Date().toISOString(),
        JSON.stringify({ to: To, errorCode: ErrorCode, type: 'delivery_failed' })
      ]);
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Error handling Twilio status webhook:', err);
    return res.status(500).json({ error: err.message || 'Webhook processing failed.' });
  }
});

export default router;
