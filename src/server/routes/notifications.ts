import { Router, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne, execute } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../auth';

const router = Router();
router.use(authMiddleware);

// GET /api/notifications
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const userId = req.user?.id;
    const parentProfileId = req.parentProfile?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let activeRole = (req.query.role as string) || req.user?.role || 'parent';
    // Safety guard: if they request volunteer/staff notifications, verify they are authorized
    if ((activeRole === 'volunteer' || activeRole === 'staff') && !req.volunteerProfile && !['admin', 'super_admin'].includes(req.user?.role || '')) {
      activeRole = 'parent'; // Fallback to parent
    }

    let notifications: any[] = [];

    if (activeRole === 'admin' || activeRole === 'super_admin') {
      // Admins can see ALL notifications
      notifications = await query('SELECT * FROM notifications ORDER BY created_at DESC');
    } else if (activeRole === 'staff') {
      // Staff can see: staff, volunteer, all, or announcements with visible_to_event_team = 1
      notifications = await query(`
        SELECT * FROM notifications 
        WHERE audience_role IN ('staff', 'volunteer', 'all')
           OR visible_to_event_team = 1
        ORDER BY created_at DESC
      `);
    } else if (activeRole === 'volunteer') {
      // Volunteers can see: volunteer, all, or announcements with visible_to_event_team = 1
      notifications = await query(`
        SELECT * FROM notifications 
        WHERE audience_role IN ('volunteer', 'all')
           OR visible_to_event_team = 1
        ORDER BY created_at DESC
      `);
    } else {
      // Parents can see:
      // - broad announcements (audience_role = 'parent' or 'all', and both parent_id and child_id are NULL)
      // - notifications specifically for this parent (parent_id = parentProfileId)
      // - notifications specifically for their children (child_id in their child list)
      let childIds: string[] = [];
      if (parentProfileId) {
        const children = await query('SELECT id FROM children WHERE parent_profile_id = ?', [parentProfileId]);
        childIds = children.map((c: any) => c.id);
      }

      let queryStr = `
        SELECT * FROM notifications 
        WHERE (
          (parent_id IS NULL AND child_id IS NULL AND (audience_role IN ('parent', 'all') OR audience_role IS NULL))
      `;
      const params: any[] = [];

      if (parentProfileId) {
        queryStr += ` OR parent_id = ?`;
        params.push(parentProfileId);
      }

      if (childIds.length > 0) {
        const placeholders = childIds.map(() => '?').join(',');
        queryStr += ` OR child_id IN (${placeholders})`;
        params.push(...childIds);
      }

      queryStr += ` ) ORDER BY created_at DESC`;
      notifications = await query(queryStr, params);
    }

    // Check which notifications have been read
    const reads = await query('SELECT notification_id FROM notification_reads WHERE user_id = ?', [userId]);
    const readSet = new Set(reads.map((r: any) => r.notification_id));

    // Map response with read status
    const result = notifications.map((n: any) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type || 'info',
      audienceRole: n.audience_role,
      audienceScope: n.audience_scope,
      eventId: n.event_id,
      childId: n.child_id,
      parentId: n.parent_id,
      createdByUserId: n.created_by_user_id,
      visibleToEventTeam: Boolean(n.visible_to_event_team),
      createdAt: n.created_at,
      expiresAt: n.expires_at,
      priority: n.priority || 'normal',
      channel: n.channel || 'in-app',
      metadata: n.metadata_json ? JSON.parse(n.metadata_json) : null,
      isRead: readSet.has(n.id)
    }));

    const unreadOnly = req.query.unread === 'true';
    const finalResult = unreadOnly ? result.filter(n => !n.isRead) : result;

    return res.json({ notifications: finalResult });
  } catch (err: any) {
    console.error('Error fetching notifications:', err);
    return res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
});

// POST /api/notifications/:id/read
router.post('/:id/read', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const userId = req.user?.id;
    const notificationId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const notification = await queryOne('SELECT * FROM notifications WHERE id = ?', [notificationId]);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const alreadyRead = await queryOne(
      'SELECT id FROM notification_reads WHERE user_id = ? AND notification_id = ?',
      [userId, notificationId]
    );

    if (!alreadyRead) {
      const readId = `read-${crypto.randomUUID()}`;
      await execute(
        'INSERT INTO notification_reads (id, notification_id, user_id, read_at, created_at) VALUES (?, ?, ?, ?, ?)',
        [readId, notificationId, userId, new Date().toISOString(), new Date().toISOString()]
      );
    }

    return res.json({ success: true, message: 'Notification marked as read' });
  } catch (err: any) {
    console.error('Error marking notification as read:', err);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// POST /api/notifications/push/subscribe
router.post('/push/subscribe', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { endpoint, keys } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Invalid push subscription details' });
    }

    const subscriptionId = `sub-${crypto.randomUUID()}`;
    const userAgent = req.headers['user-agent'] || null;

    const existing = await queryOne(
      'SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
      [userId, endpoint]
    );

    if (!existing) {
      await execute(`
        INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        subscriptionId,
        userId,
        endpoint,
        keys.p256dh,
        keys.auth,
        userAgent,
        new Date().toISOString()
      ]);
    }

    return res.status(201).json({ success: true, message: 'Push subscription saved successfully' });
  } catch (err: any) {
    console.error('Error saving push subscription:', err);
    return res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

// POST /api/notifications/admin/notifications
router.post('/admin/notifications', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const role = req.user?.role;
    const creatorId = req.user?.id;

    if (role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access only' });
    }

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

    // Backward compatibility: write to parent_notifications
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

    return res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      notificationId
    });
  } catch (err: any) {
    console.error('Error creating admin notification:', err);
    return res.status(500).json({ error: 'Failed to create notification' });
  }
});

// POST /api/notifications/admin/notifications/test
router.post('/admin/notifications/test', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const role = req.user?.role;
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access only' });
    }

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

    return res.json({
      success: true,
      message: 'Test notification broadcasted successfully',
      notificationId
    });
  } catch (err: any) {
    console.error('Error creating test notification:', err);
    return res.status(500).json({ error: 'Failed to dispatch test notification' });
  }
});

export default router;
