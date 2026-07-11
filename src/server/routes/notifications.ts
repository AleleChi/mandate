import { Router, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne, execute, REAL_EVENT_ID } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { getVapidPublicKey } from '../services/push';
import { addSSEClient } from '../services/sse';

const router = Router();
router.use(authMiddleware);

// GET /api/notifications/stream (Server-Sent Events)
router.get('/stream', (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const role = req.user?.role;
  if (!userId || (role !== 'admin' && role !== 'super_admin' && role !== 'team')) {
    return res.status(403).json({ error: 'Access denied: Admin/Team role required' });
  }
  addSSEClient(userId, role, res);
});

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
      // Admins see notifications meant for admins/staff/volunteers/team/all or null,
      // filtering out self-triggered actions unless they are care alerts/failures.
      const rawNotifs = await query(`
        SELECT * FROM notifications 
        WHERE (audience_role IN ('admin', 'super_admin', 'staff', 'volunteer', 'team', 'all') OR audience_role IS NULL)
          AND (created_by_user_id IS NULL OR created_by_user_id != ?)
        ORDER BY created_at DESC
      `, [userId]);
      notifications = rawNotifs.map((n: any) => ({
        id: `notifications:${n.id}`,
        rawId: n.id,
        source: 'notifications',
        title: n.title,
        message: n.message,
        type: n.type || 'info',
        audience_role: n.audience_role,
        audience_scope: n.audience_scope,
        event_id: n.event_id,
        child_id: n.child_id,
        parent_id: n.parent_id,
        created_by_user_id: n.created_by_user_id,
        visible_to_event_team: n.visible_to_event_team,
        created_at: n.created_at,
        expires_at: n.expires_at,
        priority: n.priority || 'normal',
        channel: n.channel || 'in-app',
        metadata_json: n.metadata_json,
        read_at: null
      }));
    } else if (activeRole === 'staff') {
      // Staff can see: staff, volunteer, all, or announcements with visible_to_event_team = 1
      const rawNotifs = await query(`
        SELECT * FROM notifications 
        WHERE audience_role IN ('staff', 'volunteer', 'all')
           OR visible_to_event_team = 1
        ORDER BY created_at DESC
      `);
      notifications = rawNotifs.map((n: any) => ({
        id: `notifications:${n.id}`,
        rawId: n.id,
        source: 'notifications',
        title: n.title,
        message: n.message,
        type: n.type || 'info',
        audience_role: n.audience_role,
        audience_scope: n.audience_scope,
        event_id: n.event_id,
        child_id: n.child_id,
        parent_id: n.parent_id,
        created_by_user_id: n.created_by_user_id,
        visible_to_event_team: n.visible_to_event_team,
        created_at: n.created_at,
        expires_at: n.expires_at,
        priority: n.priority || 'normal',
        channel: n.channel || 'in-app',
        metadata_json: n.metadata_json,
        read_at: null
      }));
    } else if (activeRole === 'volunteer') {
      // Volunteers can see: volunteer, all, or announcements with visible_to_event_team = 1
      const rawNotifs = await query(`
        SELECT * FROM notifications 
        WHERE audience_role IN ('volunteer', 'all')
           OR visible_to_event_team = 1
        ORDER BY created_at DESC
      `);
      notifications = rawNotifs.map((n: any) => ({
        id: `notifications:${n.id}`,
        rawId: n.id,
        source: 'notifications',
        title: n.title,
        message: n.message,
        type: n.type || 'info',
        audience_role: n.audience_role,
        audience_scope: n.audience_scope,
        event_id: n.event_id,
        child_id: n.child_id,
        parent_id: n.parent_id,
        created_by_user_id: n.created_by_user_id,
        visible_to_event_team: n.visible_to_event_team,
        created_at: n.created_at,
        expires_at: n.expires_at,
        priority: n.priority || 'normal',
        channel: n.channel || 'in-app',
        metadata_json: n.metadata_json,
        read_at: null
      }));
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
      const rawNotifs = await query(queryStr, params);

      const mappedGeneral = rawNotifs.map((n: any) => ({
        id: `notifications:${n.id}`,
        rawId: n.id,
        source: 'notifications',
        title: n.title,
        message: n.message,
        type: n.type || 'info',
        audience_role: n.audience_role,
        audience_scope: n.audience_scope,
        event_id: n.event_id,
        child_id: n.child_id,
        parent_id: n.parent_id,
        created_by_user_id: n.created_by_user_id,
        visible_to_event_team: n.visible_to_event_team,
        created_at: n.created_at,
        expires_at: n.expires_at,
        priority: n.priority || 'normal',
        channel: n.channel || 'in-app',
        metadata_json: n.metadata_json,
        read_at: null
      }));

      let mappedParentNotifs: any[] = [];
      if (parentProfileId) {
        const parentNotifs = await query(
          'SELECT * FROM parent_notifications WHERE parent_id = ? ORDER BY created_at DESC',
          [parentProfileId]
        );
        mappedParentNotifs = parentNotifs.map((pn: any) => ({
          id: `parent_notifications:${pn.id}`,
          rawId: pn.id,
          source: 'parent_notifications',
          title: pn.title,
          message: pn.message,
          type: 'info',
          audience_role: 'parent',
          audience_scope: 'individual',
          event_id: pn.event_id,
          child_id: pn.child_id,
          parent_id: pn.parent_id,
          created_by_user_id: null,
          visible_to_event_team: 0,
          created_at: pn.created_at,
          expires_at: null,
          priority: 'normal',
          channel: 'in-app',
          metadata_json: null,
          read_at: pn.read_at
        }));
      }

      const merged = [...mappedGeneral, ...mappedParentNotifs].sort((a: any, b: any) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      // Deduplicate: If same title and message, keep parent_notifications version if available
      const seenKeys = new Set<string>();
      const deduplicated: any[] = [];
      for (const item of merged) {
        const key = `${item.title.trim().toLowerCase()}|${item.message.trim().toLowerCase()}|${item.child_id || ''}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          deduplicated.push(item);
        } else {
          if (item.source === 'parent_notifications') {
            const idx = deduplicated.findIndex(d => 
              d.title.trim().toLowerCase() === item.title.trim().toLowerCase() &&
              d.message.trim().toLowerCase() === item.message.trim().toLowerCase() &&
              (d.child_id || '') === (item.child_id || '')
            );
            if (idx !== -1 && deduplicated[idx].source === 'notifications') {
              deduplicated[idx] = item;
            }
          }
        }
      }
      notifications = deduplicated;
    }

    // Check which notifications have been read
    const reads = await query('SELECT notification_id FROM notification_reads WHERE user_id = ?', [userId]);
    const readSet = new Set(reads.map((r: any) => r.notification_id));

    // Map response with read status
    const result = notifications.map((n: any) => {
      const isRead = n.source === 'parent_notifications'
        ? Boolean(n.read_at)
        : readSet.has(n.rawId);

      const readAt = n.source === 'parent_notifications'
        ? n.read_at
        : (readSet.has(n.rawId) ? n.created_at : null);

      return {
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
        isRead,
        readAt
      };
    });

    const unreadOnly = req.query.unread === 'true';
    const finalResult = unreadOnly ? result.filter(n => !n.isRead) : result;

    return res.json({ notifications: finalResult });
  } catch (err: any) {
    console.error('Error fetching notifications:', err);
    return res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
});

// POST /api/notifications/read-all
router.post('/read-all', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const userId = req.user?.id;
    const parentProfileId = req.parentProfile?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date().toISOString();

    if (parentProfileId) {
      await execute(
        'UPDATE parent_notifications SET read_at = ? WHERE parent_id = ? AND read_at IS NULL',
        [now, parentProfileId]
      );
    }

    let activeRole = (req.query.role as string) || req.user?.role || 'parent';
    if ((activeRole === 'volunteer' || activeRole === 'staff') && !req.volunteerProfile && !['admin', 'super_admin'].includes(req.user?.role || '')) {
      activeRole = 'parent';
    }

    let notifications: any[] = [];
    if (activeRole === 'admin' || activeRole === 'super_admin') {
      notifications = await query('SELECT id FROM notifications');
    } else if (activeRole === 'staff') {
      notifications = await query(`
        SELECT id FROM notifications 
        WHERE audience_role IN ('staff', 'volunteer', 'all') OR visible_to_event_team = 1
      `);
    } else if (activeRole === 'volunteer') {
      notifications = await query(`
        SELECT id FROM notifications 
        WHERE audience_role IN ('volunteer', 'all') OR visible_to_event_team = 1
      `);
    } else {
      let childIds: string[] = [];
      if (parentProfileId) {
        const children = await query('SELECT id FROM children WHERE parent_profile_id = ?', [parentProfileId]);
        childIds = children.map((c: any) => c.id);
      }

      let queryStr = `
        SELECT id FROM notifications 
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

      queryStr += ` )`;
      notifications = await query(queryStr, params);
    }

    const reads = await query('SELECT notification_id FROM notification_reads WHERE user_id = ?', [userId]);
    const readSet = new Set(reads.map((r: any) => r.notification_id));

    for (const n of notifications) {
      if (!readSet.has(n.id)) {
        const readId = `read-${crypto.randomUUID()}`;
        await execute(
          'INSERT INTO notification_reads (id, notification_id, user_id, read_at, created_at) VALUES (?, ?, ?, ?, ?)',
          [readId, n.id, userId, now, now]
        );
      }
    }

    return res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err: any) {
    console.error('Error marking all notifications as read:', err);
    return res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// POST /api/notifications/:id/read
router.post('/:id/read', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const userId = req.user?.id;
    const parentProfileId = req.parentProfile?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let rawId = req.params.id;
    let source = '';

    if (rawId.includes(':')) {
      const parts = rawId.split(':');
      source = parts[0];
      rawId = parts.slice(1).join(':');
    }

    if (source === 'parent_notifications' || rawId.startsWith('pnotif-')) {
      if (!parentProfileId) {
        return res.status(403).json({ error: 'Unauthorized: Parent profile required' });
      }
      const parentNotif = await queryOne(
        'SELECT * FROM parent_notifications WHERE id = ? AND parent_id = ?',
        [rawId, parentProfileId]
      );
      if (parentNotif) {
        const now = new Date().toISOString();
        await execute(
          'UPDATE parent_notifications SET read_at = ? WHERE id = ? AND parent_id = ?',
          [now, rawId, parentProfileId]
        );
        return res.json({ success: true, message: 'Notification marked as read' });
      }
      return res.json({ success: false, message: 'This update is no longer available.' });
    }

    const notification = await queryOne('SELECT * FROM notifications WHERE id = ?', [rawId]);
    if (!notification) {
      if (parentProfileId) {
        const parentNotif = await queryOne(
          'SELECT * FROM parent_notifications WHERE id = ? AND parent_id = ?',
          [rawId, parentProfileId]
        );
        if (parentNotif) {
          const now = new Date().toISOString();
          await execute(
            'UPDATE parent_notifications SET read_at = ? WHERE id = ? AND parent_id = ?',
            [now, rawId, parentProfileId]
          );
          return res.json({ success: true, message: 'Notification marked as read' });
        }
      }
      return res.json({ success: false, message: 'This update is no longer available.' });
    }

    if (req.user?.role === 'parent' && parentProfileId) {
      if (notification.parent_id && notification.parent_id !== parentProfileId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      if (notification.child_id) {
        const ownsChild = await queryOne('SELECT id FROM children WHERE id = ? AND parent_profile_id = ?', [notification.child_id, parentProfileId]);
        if (!ownsChild) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
      }
    }

    const alreadyRead = await queryOne(
      'SELECT id FROM notification_reads WHERE user_id = ? AND notification_id = ?',
      [userId, rawId]
    );

    if (!alreadyRead) {
      const readId = `read-${crypto.randomUUID()}`;
      await execute(
        'INSERT INTO notification_reads (id, notification_id, user_id, read_at, created_at) VALUES (?, ?, ?, ?, ?)',
        [readId, rawId, userId, new Date().toISOString(), new Date().toISOString()]
      );
    }

    return res.json({ success: true, message: 'Notification marked as read' });
  } catch (err: any) {
    console.error('Error marking notification as read:', err);
    return res.json({ success: false, message: 'We could not update your notification. Please try again.' });
  }
});

// GET /api/notifications/push/vapid-key
router.get('/push/vapid-key', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const key = getVapidPublicKey();
    return res.json({ publicKey: key });
  } catch (err) {
    console.error('Error fetching VAPID public key:', err);
    return res.status(500).json({ error: 'Failed to retrieve VAPID key' });
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

// GET /api/notifications/preferences
router.get('/preferences', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pref = await queryOne('SELECT * FROM notification_preferences WHERE user_id = ?', [userId]);
    if (!pref) {
      return res.json({
        soundEnabled: true,
        pushEnabled: false,
        emailEnabled: true,
        urgentSoundProfile: 'emergency',
        urgentVolumeBoost: 'standard',
        repeatUrgentAlerts: true,
        spokenAlertsEnabled: false,
        spokenAlertMode: 'private',
        spokenAlertRepeats: true
      });
    }

    return res.json({
      soundEnabled: pref.sound_enabled === 1,
      pushEnabled: pref.push_enabled === 1,
      emailEnabled: pref.email_enabled === 1,
      urgentSoundProfile: pref.urgent_sound_profile || 'emergency',
      urgentVolumeBoost: pref.urgent_volume_boost || 'standard',
      repeatUrgentAlerts: pref.repeat_urgent_alerts === 1,
      spokenAlertsEnabled: pref.spoken_alerts_enabled === 1,
      spokenAlertMode: pref.spoken_alert_mode || 'private',
      spokenAlertRepeats: pref.spoken_alert_repeats === 1
    });
  } catch (err: any) {
    console.error('Error fetching notification preferences:', err);
    return res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// PATCH /api/notifications/preferences
router.patch('/preferences', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      soundEnabled,
      pushEnabled,
      emailEnabled,
      urgentSoundProfile,
      urgentVolumeBoost,
      repeatUrgentAlerts,
      spokenAlertsEnabled,
      spokenAlertMode,
      spokenAlertRepeats
    } = req.body;
    const now = new Date().toISOString();

    const existing = await queryOne('SELECT user_id FROM notification_preferences WHERE user_id = ?', [userId]);

    if (existing) {
      const updates: string[] = [];
      const params: any[] = [];

      if (soundEnabled !== undefined) {
        updates.push('sound_enabled = ?');
        params.push(soundEnabled ? 1 : 0);
      }
      if (pushEnabled !== undefined) {
        updates.push('push_enabled = ?');
        params.push(pushEnabled ? 1 : 0);
      }
      if (emailEnabled !== undefined) {
        updates.push('email_enabled = ?');
        params.push(emailEnabled ? 1 : 0);
      }
      if (urgentSoundProfile !== undefined) {
        updates.push('urgent_sound_profile = ?');
        params.push(urgentSoundProfile);
      }
      if (urgentVolumeBoost !== undefined) {
        updates.push('urgent_volume_boost = ?');
        params.push(urgentVolumeBoost);
      }
      if (repeatUrgentAlerts !== undefined) {
        updates.push('repeat_urgent_alerts = ?');
        params.push(repeatUrgentAlerts ? 1 : 0);
      }
      if (spokenAlertsEnabled !== undefined) {
        updates.push('spoken_alerts_enabled = ?');
        params.push(spokenAlertsEnabled ? 1 : 0);
      }
      if (spokenAlertMode !== undefined) {
        updates.push('spoken_alert_mode = ?');
        params.push(spokenAlertMode);
      }
      if (spokenAlertRepeats !== undefined) {
        updates.push('spoken_alert_repeats = ?');
        params.push(spokenAlertRepeats ? 1 : 0);
      }

      if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(now);
        params.push(userId);

        await execute(`
          UPDATE notification_preferences
          SET ${updates.join(', ')}
          WHERE user_id = ?
        `, params);
      }
    } else {
      const se = soundEnabled !== undefined ? (soundEnabled ? 1 : 0) : 1;
      const pe = pushEnabled !== undefined ? (pushEnabled ? 1 : 0) : 0;
      const ee = emailEnabled !== undefined ? (emailEnabled ? 1 : 0) : 1;
      const usp = urgentSoundProfile !== undefined ? urgentSoundProfile : 'emergency';
      const uvb = urgentVolumeBoost !== undefined ? urgentVolumeBoost : 'standard';
      const rua = repeatUrgentAlerts !== undefined ? (repeatUrgentAlerts ? 1 : 0) : 1;
      const sae = spokenAlertsEnabled !== undefined ? (spokenAlertsEnabled ? 1 : 0) : 0;
      const sam = spokenAlertMode !== undefined ? spokenAlertMode : 'private';
      const sar = spokenAlertRepeats !== undefined ? (spokenAlertRepeats ? 1 : 0) : 1;
      const role = req.user?.role || 'parent';

      await execute(`
        INSERT INTO notification_preferences (
          user_id, role, sound_enabled, push_enabled, email_enabled,
          urgent_sound_profile, urgent_volume_boost, repeat_urgent_alerts,
          spoken_alerts_enabled, spoken_alert_mode, spoken_alert_repeats,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, role, se, pe, ee, usp, uvb, rua, sae, sam, sar, now, now]);
    }

    const updated = await queryOne('SELECT * FROM notification_preferences WHERE user_id = ?', [userId]);
    return res.json({
      soundEnabled: updated.sound_enabled === 1,
      pushEnabled: updated.push_enabled === 1,
      emailEnabled: updated.email_enabled === 1,
      urgentSoundProfile: updated.urgent_sound_profile || 'emergency',
      urgentVolumeBoost: updated.urgent_volume_boost || 'standard',
      repeatUrgentAlerts: updated.repeat_urgent_alerts === 1,
      spokenAlertsEnabled: updated.spoken_alerts_enabled === 1,
      spokenAlertMode: updated.spoken_alert_mode || 'private',
      spokenAlertRepeats: updated.spoken_alert_repeats === 1,
      _metadata: {
        'data-component-version': 'alert-audio-preference-map-v2'
      }
    });
  } catch (err: any) {
    console.error('Error updating notification preferences:', err);
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// POST /api/notifications/push/unsubscribe
router.post('/push/unsubscribe', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }
    await execute('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [userId, endpoint]);
    return res.json({ success: true, message: 'Push subscription removed successfully' });
  } catch (err: any) {
    console.error('Error unsubscribing from push:', err);
    return res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// GET /api/notifications/admin/updates
router.get('/admin/updates', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    if (!userId || (role !== 'admin' && role !== 'super_admin')) {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }

    const limit = parseInt(req.query.limit as string) || 25;
    const page = parseInt(req.query.page as string) || 1;
    const offset = (page - 1) * limit;

    const statusFilter = (req.query.status as string) || 'all'; // all, unread, read, open, acknowledged, resolved, archived
    const typeFilter = (req.query.type as string) || 'all';
    const senderRoleFilter = (req.query.senderRole as string) || 'all';
    const priorityFilter = (req.query.priority as string) || 'all';
    const searchQuery = (req.query.search as string || '').trim().toLowerCase();
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;

    // We build the query dynamically
    let queryStr = `
      SELECT n.* FROM notifications n
      WHERE (n.audience_role IN ('admin', 'super_admin', 'staff', 'volunteer', 'team', 'all') OR n.audience_role IS NULL)
    `;
    const params: any[] = [];

    // Archive filter
    if (statusFilter === 'archived') {
      queryStr += ` AND n.id IN (SELECT notification_id FROM notification_archives WHERE user_id = ?)`;
      params.push(userId);
    } else {
      queryStr += ` AND n.id NOT IN (SELECT notification_id FROM notification_archives WHERE user_id = ?)`;
      params.push(userId);
    }

    // Read/Unread filters
    if (statusFilter === 'unread') {
      queryStr += ` AND n.id NOT IN (SELECT notification_id FROM notification_reads WHERE user_id = ?)`;
      params.push(userId);
    } else if (statusFilter === 'read') {
      queryStr += ` AND n.id IN (SELECT notification_id FROM notification_reads WHERE user_id = ?)`;
      params.push(userId);
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      queryStr += ` AND n.priority = ?`;
      params.push(priorityFilter);
    }

    // Type filter
    if (typeFilter !== 'all') {
      queryStr += ` AND n.type = ?`;
      params.push(typeFilter);
    }

    // For date filters
    if (dateFrom) {
      queryStr += ` AND n.created_at >= ?`;
      params.push(dateFrom);
    }
    if (dateTo) {
      queryStr += ` AND n.created_at <= ?`;
      params.push(dateTo);
    }

    // Query execution
    const rawNotifs = await query(queryStr, params);

    // Let's map each raw notification and populate metadata, sender, related entity status
    let mapped = [];
    for (const n of rawNotifs) {
      // 1. Check read status
      const readRow = await queryOne('SELECT read_at FROM notification_reads WHERE user_id = ? AND notification_id = ?', [userId, n.id]);
      const isRead = !!readRow;
      const readAt = readRow ? readRow.read_at : null;

      // 2. Check archived status
      const archiveRow = await queryOne('SELECT archived_at FROM notification_archives WHERE user_id = ? AND notification_id = ?', [userId, n.id]);
      const isArchived = !!archiveRow;
      const archivedAt = archiveRow ? archiveRow.archived_at : null;

      // Parse metadata_json
      let metadata: any = null;
      if (n.metadata_json) {
        try {
          metadata = JSON.parse(n.metadata_json);
        } catch (_) {}
      }

      // 3. Sender info
      let senderName = 'System';
      let senderRole = 'System';
      if (n.created_by_user_id) {
        const u = await queryOne('SELECT email, role FROM users WHERE id = ?', [n.created_by_user_id]);
        if (u) {
          senderRole = u.role === 'super_admin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : u.role === 'staff' ? 'Care Lead' : 'Parent';
          senderName = u.email ? u.email.split('@')[0] : 'Admin';
          // Check if volunteer
          const vol = await queryOne('SELECT full_name FROM volunteer_profiles WHERE user_id = ?', [n.created_by_user_id]);
          if (vol) {
            senderName = vol.full_name;
            senderRole = 'Volunteer';
          } else {
            // Check if parent
            const par = await queryOne('SELECT full_name FROM parent_profiles WHERE user_id = ?', [n.created_by_user_id]);
            if (par) {
              senderName = par.full_name;
              senderRole = 'Parent';
            }
          }
        }
      }

      // Filter by sender role if requested
      if (senderRoleFilter !== 'all') {
        const sRoleLower = senderRole.toLowerCase();
        const filterLower = senderRoleFilter.toLowerCase();
        if (sRoleLower !== filterLower && !sRoleLower.includes(filterLower) && !filterLower.includes(sRoleLower)) {
          continue; // Skip
        }
      }

      // 4. Action status & delivery status
      let actionStatus = 'n/a';
      let relatedItemTitle = '';
      if (n.type === 'safety_alert' || n.type === 'escalation') {
        const alertId = metadata?.safetyAlertId || metadata?.safety_alert_id || metadata?.alertId || n.id;
        const alertObj = await queryOne('SELECT status, title FROM event_safety_alerts WHERE id = ?', [alertId]);
        if (alertObj) {
          actionStatus = alertObj.status; // open, acknowledged, resolved
          relatedItemTitle = alertObj.title;
        } else {
          // Check child attention items
          const attId = metadata?.attentionItemId || metadata?.attention_item_id || n.id;
          const attObj = await queryOne('SELECT status, title FROM child_attention_items WHERE id = ?', [attId]);
          if (attObj) {
            actionStatus = attObj.status; // open, resolved
            relatedItemTitle = attObj.title;
          }
        }
      }

      // Filter by open/acknowledged/resolved if statusFilter is specific
      if (['open', 'acknowledged', 'resolved'].includes(statusFilter)) {
        if (actionStatus !== statusFilter) {
          continue; // Skip
        }
      }

      // 5. Related child/event
      let childName = null;
      if (n.child_id) {
        const child = await queryOne('SELECT full_name FROM children WHERE id = ?', [n.child_id]);
        childName = child ? child.full_name : null;
      }

      // 6. Search filter
      if (searchQuery) {
        const titleMatch = (n.title || '').toLowerCase().includes(searchQuery);
        const messageMatch = (n.message || '').toLowerCase().includes(searchQuery);
        const childMatch = childName ? childName.toLowerCase().includes(searchQuery) : false;
        const senderMatch = senderName.toLowerCase().includes(searchQuery);
        const typeMatch = (n.type || '').toLowerCase().includes(searchQuery);
        if (!titleMatch && !messageMatch && !childMatch && !senderMatch && !typeMatch) {
          continue; // Skip
        }
      }

      mapped.push({
        id: `notifications:${n.id}`,
        rawId: n.id,
        title: n.title,
        bodyPreview: n.message ? (n.message.length > 80 ? n.message.substring(0, 80) + '...' : n.message) : '',
        bodyFull: n.message,
        type: n.type || 'info',
        priority: n.priority || 'normal',
        senderUserId: n.created_by_user_id,
        senderName,
        senderRole,
        recipientRole: n.audience_role || 'All',
        relatedChildId: n.child_id,
        relatedChildName: childName,
        relatedEventId: n.event_id,
        targetUrl: n.target_url,
        readAt,
        isRead,
        isArchived,
        archivedAt,
        deliveryStatus: 'delivered', // in-app delivery is confirmed
        actionStatus,
        createdAt: n.created_at,
        metadata
      });
    }

    // Sort: newest first
    mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Paginate in memory
    const totalCount = mapped.length;
    const paginated = mapped.slice(offset, offset + limit);

    return res.json({
      updates: paginated,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit)
      }
    });

  } catch (err: any) {
    console.error('Error fetching admin updates center:', err);
    return res.status(500).json({ error: 'Failed to retrieve messages and updates' });
  }
});

// GET /api/notifications/admin/updates/summary
router.get('/admin/updates/summary', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    if (!userId || (role !== 'admin' && role !== 'super_admin')) {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }

    // 1. Fetch all notifications matching audience roles
    const rawNotifs = await query(`
      SELECT n.* FROM notifications n
      WHERE (n.audience_role IN ('admin', 'super_admin', 'staff', 'volunteer', 'team', 'all') OR n.audience_role IS NULL)
    `, []);

    // Query open safety alerts directly from the database table for perfect, independent stats integrity
    const openAlertsRow = await queryOne(`
      SELECT COUNT(*) as cnt FROM event_safety_alerts WHERE status = 'open' AND event_id = ?
    `, [REAL_EVENT_ID]);
    const openAlerts = openAlertsRow ? openAlertsRow.cnt : 0;

    let total = 0;
    let unread = 0;
    let read = 0;
    let urgent = 0;
    let important = 0;
    let resolved = 0;
    let acknowledged = 0;
    let archived = 0;
    let deliveryIssues = 0;

    for (const n of rawNotifs) {
      // Check archived status
      const archiveRow = await queryOne('SELECT archived_at FROM notification_archives WHERE user_id = ? AND notification_id = ?', [userId, n.id]);
      const isArchived = !!archiveRow;

      if (isArchived) {
        archived++;
        continue; // Exclude archived items from standard active lists
      }

      // Check read status
      const readRow = await queryOne('SELECT read_at FROM notification_reads WHERE user_id = ? AND notification_id = ?', [userId, n.id]);
      const isRead = !!readRow;

      if (isRead) {
        read++;
      } else {
        unread++;
      }

      // Parse metadata_json to look up actionStatus
      let metadata: any = null;
      if (n.metadata_json) {
        try {
          metadata = JSON.parse(n.metadata_json);
        } catch (_) {}
      }

      let actionStatus = 'n/a';
      if (n.type === 'safety_alert' || n.type === 'escalation') {
        const alertId = metadata?.safetyAlertId || metadata?.safety_alert_id || metadata?.alertId || n.id;
        const alertObj = await queryOne('SELECT status FROM event_safety_alerts WHERE id = ?', [alertId]);
        if (alertObj) {
          actionStatus = alertObj.status; // open, acknowledged, resolved
        } else {
          const attId = metadata?.attentionItemId || metadata?.attention_item_id || n.id;
          const attObj = await queryOne('SELECT status FROM child_attention_items WHERE id = ?', [attId]);
          if (attObj) {
            actionStatus = attObj.status; // open, resolved
          }
        }
      }

      total++;

      if (n.priority === 'urgent' || n.priority === 'high') {
        urgent++;
      }

      if (n.priority === 'important') {
        important++;
      }

      if (actionStatus === 'resolved') {
        resolved++;
      }

      if (actionStatus === 'acknowledged') {
        acknowledged++;
      }

      if (n.type === 'delivery_issue' || n.type === 'failed') {
        deliveryIssues++;
      }
    }

    return res.json({
      success: true,
      summary: {
        total,
        unread,
        read,
        openAlerts,
        urgent,
        important,
        resolved,
        acknowledged,
        archived,
        deliveryIssues
      }
    });

  } catch (err: any) {
    console.error('Error fetching admin updates summary:', err);
    return res.status(500).json({ error: 'Failed to retrieve updates summary' });
  }
});

// POST /api/notifications/admin/updates/:updateId/read
router.post('/admin/updates/:updateId/read', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let rawId = req.params.updateId;
    if (rawId.includes(':')) {
      rawId = rawId.split(':')[1];
    }

    const alreadyRead = await queryOne('SELECT id FROM notification_reads WHERE user_id = ? AND notification_id = ?', [userId, rawId]);
    if (!alreadyRead) {
      const readId = `read-${crypto.randomUUID()}`;
      await execute(
        'INSERT INTO notification_reads (id, notification_id, user_id, read_at, created_at) VALUES (?, ?, ?, ?, ?)',
        [readId, rawId, userId, new Date().toISOString(), new Date().toISOString()]
      );
    }
    return res.json({ success: true, message: 'Updated successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// POST /api/notifications/admin/updates/:updateId/unread
router.post('/admin/updates/:updateId/unread', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let rawId = req.params.updateId;
    if (rawId.includes(':')) {
      rawId = rawId.split(':')[1];
    }

    await execute('DELETE FROM notification_reads WHERE user_id = ? AND notification_id = ?', [userId, rawId]);
    return res.json({ success: true, message: 'Updated successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark as unread' });
  }
});

// POST /api/notifications/admin/updates/:updateId/archive
router.post('/admin/updates/:updateId/archive', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let rawId = req.params.updateId;
    if (rawId.includes(':')) {
      rawId = rawId.split(':')[1];
    }

    const alreadyArchived = await queryOne('SELECT id FROM notification_archives WHERE user_id = ? AND notification_id = ?', [userId, rawId]);
    if (!alreadyArchived) {
      const archiveId = `archive-${crypto.randomUUID()}`;
      await execute(
        'INSERT INTO notification_archives (id, notification_id, user_id, archived_at, created_at) VALUES (?, ?, ?, ?, ?)',
        [archiveId, rawId, userId, new Date().toISOString(), new Date().toISOString()]
      );
    }
    return res.json({ success: true, message: 'Archived successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to archive update' });
  }
});

// POST /api/notifications/admin/updates/:updateId/unarchive
router.post('/admin/updates/:updateId/unarchive', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let rawId = req.params.updateId;
    if (rawId.includes(':')) {
      rawId = rawId.split(':')[1];
    }

    await execute('DELETE FROM notification_archives WHERE user_id = ? AND notification_id = ?', [userId, rawId]);
    return res.json({ success: true, message: 'Unarchived successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to unarchive update' });
  }
});

// POST /api/notifications/admin/updates/read-all
router.post('/admin/updates/read-all', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const now = new Date().toISOString();
    // Get all admin notifications that are not yet read
    const rawNotifs = await query(`
      SELECT id FROM notifications 
      WHERE (audience_role IN ('admin', 'super_admin', 'staff', 'volunteer', 'team', 'all') OR audience_role IS NULL)
        AND id NOT IN (SELECT notification_id FROM notification_reads WHERE user_id = ?)
    `, [userId]);

    for (const n of rawNotifs) {
      const readId = `read-${crypto.randomUUID()}`;
      await execute(
        'INSERT INTO notification_reads (id, notification_id, user_id, read_at, created_at) VALUES (?, ?, ?, ?, ?)',
        [readId, n.id, userId, now, now]
      );
    }

    return res.json({ success: true, message: 'All updates marked as read.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// POST /api/notifications/push/unsubscribe

export default router;
