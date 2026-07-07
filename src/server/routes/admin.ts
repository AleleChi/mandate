import { Router, Response, NextFunction } from 'express';
import { query, queryOne, execute } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { syncJobsForEvent, executeTestNotification, sendWhatsApp } from '../services/notifications';

const router = Router();

// Mount auth middleware for all admin routes
router.use(authMiddleware);

// Middleware to check if user is an admin or we are in development mode
function adminCheck(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'team' || process.env.NODE_ENV !== 'production')) {
    return next();
  }
  return res.status(403).json({ error: 'Access denied. Admin role required.' });
}

router.use(adminCheck);

// GET event details including scheduler fields
router.get('/events/:eventId', async (req: AuthenticatedRequest, res: Response) => {
  const { eventId } = req.params;
  const event = await queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  res.json({
    id: event.id,
    title: event.title,
    sectionName: event.section_name,
    theme: event.theme,
    scripture: event.scripture,
    location: event.location,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    dailyStartTime: event.daily_start_time,
    dailyEndTime: event.daily_end_time,
    eventStartAt: event.event_start_at || '',
    eventEndAt: event.event_end_at || '',
    checkInOpensAt: event.check_in_opens_at || '',
    checkInClosesAt: event.check_in_closes_at || '',
    pickupStartsAt: event.pickup_starts_at || '',
    pickupReminderAt: event.pickup_reminder_at || '',
    timezone: event.timezone || 'Africa/Lagos',
    status: event.status
  });
});

// UPDATE event details (saves ISO-8601 strings and triggers rule syncing)
router.put('/events/:eventId', async (req: AuthenticatedRequest, res: Response) => {
  const { eventId } = req.params;
  const {
    eventStartAt,
    eventEndAt,
    checkInOpensAt,
    checkInClosesAt,
    pickupStartsAt,
    pickupReminderAt,
    timezone
  } = req.body;

  const event = await queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const updatedTimezone = timezone || 'Africa/Lagos';

  await execute(`
    UPDATE events SET
      event_start_at = ?,
      event_end_at = ?,
      check_in_opens_at = ?,
      check_in_closes_at = ?,
      pickup_starts_at = ?,
      pickup_reminder_at = ?,
      timezone = ?,
      updated_at = ?
    WHERE id = ?
  `, [
    eventStartAt || null,
    eventEndAt || null,
    checkInOpensAt || null,
    checkInClosesAt || null,
    pickupStartsAt || null,
    pickupReminderAt || null,
    updatedTimezone,
    new Date().toISOString(),
    eventId
  ]);

  // Sync notification jobs immediately when times are updated
  try {
    await syncJobsForEvent(eventId);
  } catch (err: any) {
    console.error('[Admin API] Error syncing jobs after event update:', err);
  }

  res.json({
    success: true,
    message: 'Event notification settings updated successfully and jobs have been synchronized.'
  });
});

// GET all notification rules for an event
router.get('/events/:eventId/rules', async (req: AuthenticatedRequest, res: Response) => {
  const { eventId } = req.params;
  const rules = await query('SELECT * FROM event_notification_rules WHERE event_id = ? ORDER BY created_at ASC', [eventId]);
  res.json(rules);
});

// GET all notification jobs for an event (including sending history)
router.get('/events/:eventId/jobs', async (req: AuthenticatedRequest, res: Response) => {
  const { eventId } = req.params;
  const jobs = await query(`
    SELECT j.*, r.name as rule_name, r.channel, p.full_name as parent_name, p.email as parent_email
    FROM notification_jobs j
    LEFT JOIN event_notification_rules r ON r.id = j.rule_id
    LEFT JOIN parent_profiles p ON p.id = j.parent_id
    WHERE j.event_id = ?
    ORDER BY j.scheduled_for ASC, j.created_at DESC
  `, [eventId]);
  res.json(jobs);
});

// POST test notification rule directly to a selected email address
router.post('/events/:eventId/notifications/test', async (req: AuthenticatedRequest, res: Response) => {
  const { eventId } = req.params;
  const { ruleType, testEmail } = req.body;

  if (!ruleType || !testEmail) {
    return res.status(400).json({ error: 'Missing ruleType or testEmail in payload.' });
  }

  const result = await executeTestNotification({
    eventId,
    ruleType,
    testEmail
  });

  if (result.success) {
    res.json({ success: true, message: result.message });
  } else {
    res.status(500).json({ error: result.message });
  }
});

// POST manual notification
router.post('/notifications', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const creatorId = req.user?.id;
    const {
      title,
      message,
      type = 'info',
      audienceRole = 'parent',
      audienceScope = 'all',
      eventId = 'event-ga-2026',
      childId,
      parentId,
      priority = 'normal',
      channel = 'in-app',
      visibleToEventTeam = false,
      metadata
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const crypto = require('crypto');
    const notificationId = `notif-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    await execute(`
      INSERT INTO notifications (
        id, title, message, type, audience_role, audience_scope, event_id, child_id, parent_id,
        created_by_user_id, visible_to_event_team, created_at, priority, channel, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      notificationId,
      title,
      message,
      type,
      audienceRole,
      audienceScope,
      eventId || null,
      childId || null,
      parentId || null,
      creatorId,
      visibleToEventTeam ? 1 : 0,
      createdAt,
      priority,
      channel,
      metadata ? JSON.stringify(metadata) : null
    ]);

    // Backward compatibility with parent_notifications
    if (audienceRole === 'parent' || parentId) {
      const parentsToNotify: any[] = [];
      if (parentId) {
        parentsToNotify.push({ id: parentId });
      } else {
        const allParents = await query('SELECT id FROM parent_profiles');
        parentsToNotify.push(...allParents);
      }

      for (const parent of parentsToNotify) {
        const parentNotifId = `pnotif-${crypto.randomUUID()}`;
        await execute(`
          INSERT INTO parent_notifications (id, parent_id, event_id, child_id, title, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          parentNotifId,
          parent.id,
          eventId || null,
          childId || null,
          title,
          message,
          createdAt
        ]);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      notificationId
    });
  } catch (err: any) {
    console.error('Error creating admin notification:', err);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// POST test broadcast notification
router.post('/notifications/test', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const crypto = require('crypto');
    const notificationId = `testnotif-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    await execute(`
      INSERT INTO notifications (
        id, title, message, type, audience_role, audience_scope, created_at, priority, channel
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      notificationId,
      'System Test Notification',
      'This is a test notification generated by the administrator to verify the routing pipeline.',
      'info',
      'all',
      'broadcast',
      createdAt,
      'high',
      'in-app'
    ]);

    res.json({
      success: true,
      message: 'Test notification broadcasted successfully',
      notificationId
    });
  } catch (err: any) {
    console.error('Error creating test notification:', err);
    res.status(500).json({ error: 'Failed to dispatch test notification' });
  }
});

// POST test whatsapp message
router.post('/notifications/test-whatsapp', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: 'Recipient phone number ("to") and "message" are required.' });
    }

    const provider = process.env.WHATSAPP_PROVIDER || 'twilio';
    console.log(`[WhatsApp Test Endpoint] Dispatching via provider: ${provider} to: ${to}`);

    const result = await sendWhatsApp(to, message);

    if (result.success) {
      return res.json({
        success: true,
        message: 'WhatsApp message accepted by provider.',
        provider,
        messageSid: result.messageSid || 'simulated-sid'
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to send WhatsApp message via Twilio.',
        provider
      });
    }
  } catch (err: any) {
    console.error('Error in test-whatsapp endpoint:', err);
    res.status(500).json({ error: err.message || 'Failed to process WhatsApp test request.' });
  }
});

export default router;
