import { Router, Request, Response } from 'express';

const router = Router();

// POST /api/webhooks/twilio/whatsapp
// Receives inbound messages from users
router.post('/twilio/whatsapp', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const { From, Body, MessageSid } = req.body;
    console.log(`[Twilio Inbound WhatsApp Webhook] From: ${From}, Body: "${Body}", MessageSid: ${MessageSid}`);

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
router.post('/twilio/whatsapp-status', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const { MessageSid, MessageStatus, ErrorCode, To } = req.body;
    console.log(`[Twilio Status Webhook] SID: ${MessageSid}, Status: ${MessageStatus}, ErrorCode: ${ErrorCode || 'None'}, To: ${To}`);

    // If a status delivery failed, log it or handle it
    if (MessageStatus === 'failed') {
      console.warn(`[Twilio WhatsApp Status] Delivery to ${To} failed with Twilio Error Code: ${ErrorCode}`);
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Error handling Twilio status webhook:', err);
    return res.status(500).json({ error: err.message || 'Webhook processing failed.' });
  }
});

export default router;
