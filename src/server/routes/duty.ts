import { Router, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne, execute, REAL_EVENT_ID } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { sendWebPush } from '../services/push';
import { broadcastSSEEvent } from '../services/sse';

const dutyRouter = Router();
dutyRouter.use(authMiddleware);

// GET /api/duty/readiness
dutyRouter.get('/readiness', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const dutyStatus = await queryOne('SELECT * FROM user_duty_status WHERE user_id = ?', [userId]);
    const devices = await query('SELECT * FROM event_duty_devices WHERE user_id = ? AND event_id = ?', [userId, REAL_EVENT_ID]);

    return res.json({
      success: true,
      dutyStatus: dutyStatus || { on_duty: 0, active: 1, approved: 1 },
      devices: devices || []
    });
  } catch (err: any) {
    console.error('Error in GET /api/duty/readiness:', err);
    return res.status(500).json({ error: 'An unexpected error occurred while fetching readiness details' });
  }
});

// POST /api/duty/readiness/check
dutyRouter.post('/readiness/check', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      appGeneratedDeviceId,
      deviceLabel,
      pushSubscriptionId,
      soundEnabled,
      voiceEnabled,
      vibrationEnabled,
      liveConnectionStatus,
      readinessStatus,
      criticalPassed,
      soundReady,
      pushReady,
      voiceReady,
      vibrationSupported,
      eventSyncAge
    } = req.body;

    if (!appGeneratedDeviceId) {
      return res.status(400).json({ error: 'Device identifier is required' });
    }

    const now = new Date().toISOString();
    const cleanLabel = (deviceLabel || 'Unnamed Device').trim().substring(0, 50);

    let device = await queryOne('SELECT * FROM event_duty_devices WHERE app_generated_device_id = ?', [appGeneratedDeviceId]);
    let deviceId = device?.id;

    if (device) {
      if (device.user_id !== userId) {
        return res.status(403).json({ error: 'Access denied for this device' });
      }

      await execute(`
        UPDATE event_duty_devices
        SET device_label = ?, role = ?, push_subscription_id = ?, sound_enabled = ?, voice_enabled = ?,
            vibration_enabled = ?, live_connection_status = ?, readiness_status = ?,
            readiness_checked_at = ?, last_seen_at = ?, updated_at = ?
        WHERE app_generated_device_id = ?
      `, [
        cleanLabel, req.user.role, pushSubscriptionId || null, soundEnabled ? 1 : 0, voiceEnabled ? 1 : 0, vibrationEnabled ? 1 : 0,
        liveConnectionStatus || 'disconnected', readinessStatus || 'unknown', now, now, now, appGeneratedDeviceId
      ]);
    } else {
      deviceId = `device-${crypto.randomBytes(8).toString('hex')}`;
      await execute(`
        INSERT INTO event_duty_devices (
          id, user_id, role, event_id, device_label, app_generated_device_id, push_subscription_id,
          sound_enabled, voice_enabled, vibration_enabled, live_connection_status, readiness_status,
          readiness_checked_at, last_seen_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        deviceId, userId, req.user.role, REAL_EVENT_ID, cleanLabel, appGeneratedDeviceId, pushSubscriptionId || null,
        soundEnabled ? 1 : 0, voiceEnabled ? 1 : 0, vibrationEnabled ? 1 : 0,
        liveConnectionStatus || 'disconnected', readinessStatus || 'unknown',
        now, now, now, now
      ]);
    }

    // Insert log entry for reporting (Section 19)
    const logId = `log-${crypto.randomBytes(8).toString('hex')}`;
    await execute(`
      INSERT INTO device_readiness_logs (
        id, event_id, user_id, role, device_id, readiness_status,
        critical_passed, sound_ready, push_ready, voice_ready, vibration_supported,
        live_connection_state, event_sync_age, check_timestamp, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      logId, REAL_EVENT_ID, userId, req.user.role, deviceId, readinessStatus || 'unknown',
      criticalPassed ? 1 : 0, soundReady ? 1 : 0, pushReady ? 1 : 0, voiceReady ? 1 : 0, vibrationSupported ? 1 : 0,
      liveConnectionStatus || 'disconnected', eventSyncAge || 0, now, now
    ]);

    return res.json({
      success: true,
      deviceId,
      message: 'Readiness check logged successfully'
    });
  } catch (err: any) {
    console.error('Error in POST /api/duty/readiness/check:', err);
    return res.status(500).json({ error: 'An unexpected error occurred while logging readiness check' });
  }
});

// POST /api/duty/start
dutyRouter.post('/start', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { appGeneratedDeviceId } = req.body;
    if (!appGeneratedDeviceId) {
      return res.status(400).json({ error: 'Device identifier is required' });
    }

    const now = new Date().toISOString();

    // 1. Update user_duty_status
    const existingStatus = await queryOne('SELECT * FROM user_duty_status WHERE user_id = ?', [userId]);
    if (existingStatus) {
      await execute(`
        UPDATE user_duty_status
        SET on_duty = 1, shift_start = ?, updated_at = ?
        WHERE user_id = ?
      `, [now, now, userId]);
    } else {
      const id = `duty-${crypto.randomBytes(8).toString('hex')}`;
      await execute(`
        INSERT INTO user_duty_status (
          id, user_id, active, approved, on_duty, alert_enabled, assigned_event_id, created_at, updated_at
        ) VALUES (?, ?, 1, 1, 1, 1, ?, ?, ?)
      `, [id, userId, REAL_EVENT_ID, now, now]);
    }

    // 2. Update event_duty_devices
    await execute(`
      UPDATE event_duty_devices
      SET duty_started_at = ?, duty_ended_at = NULL, last_seen_at = ?, updated_at = ?
      WHERE app_generated_device_id = ? AND user_id = ?
    `, [now, now, now, appGeneratedDeviceId, userId]);

    // Update matching event_duty_assignments to 'on_duty'
    await execute(`
      UPDATE event_duty_assignments
      SET status = 'on_duty', updated_at = ?
      WHERE user_id = ? AND event_id = ? AND status IN ('scheduled', 'available', 'temporarily_unavailable')
    `, [now, userId, REAL_EVENT_ID]);

    // Send Realtime SSE Update
    broadcastSSEEvent('duty_status_changed', { userId, onDuty: true });

    return res.json({
      success: true,
      message: 'Event duty started successfully'
    });
  } catch (err: any) {
    console.error('Error in POST /api/duty/start:', err);
    return res.status(500).json({ error: 'An unexpected error occurred while starting event duty' });
  }
});

// POST /api/duty/end
dutyRouter.post('/end', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { appGeneratedDeviceId } = req.body;
    if (!appGeneratedDeviceId) {
      return res.status(400).json({ error: 'Device identifier is required' });
    }

    const now = new Date().toISOString();

    // 1. Update user_duty_status
    await execute(`
      UPDATE user_duty_status
      SET on_duty = 0, shift_end = ?, updated_at = ?
      WHERE user_id = ?
    `, [now, now, userId]);

    // 2. Update event_duty_devices
    await execute(`
      UPDATE event_duty_devices
      SET duty_ended_at = ?, last_seen_at = ?, updated_at = ?
      WHERE app_generated_device_id = ? AND user_id = ?
    `, [now, now, now, appGeneratedDeviceId, userId]);

    // Update matching event_duty_assignments to 'ended'
    await execute(`
      UPDATE event_duty_assignments
      SET status = 'ended', updated_at = ?
      WHERE user_id = ? AND event_id = ? AND status = 'on_duty'
    `, [now, userId, REAL_EVENT_ID]);

    // Send Realtime SSE Update
    broadcastSSEEvent('duty_status_changed', { userId, onDuty: false });

    return res.json({
      success: true,
      message: 'Event duty ended successfully'
    });
  } catch (err: any) {
    console.error('Error in POST /api/duty/end:', err);
    return res.status(500).json({ error: 'An unexpected error occurred while ending event duty' });
  }
});

// GET /api/duty/devices
dutyRouter.get('/devices', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const devices = await query('SELECT * FROM event_duty_devices WHERE user_id = ?', [userId]);
    return res.json({
      success: true,
      devices: devices || []
    });
  } catch (err: any) {
    console.error('Error in GET /api/duty/devices:', err);
    return res.status(500).json({ error: 'An unexpected error occurred while fetching duty devices' });
  }
});

// PATCH /api/duty/devices/:deviceId/preferences
dutyRouter.patch('/devices/:deviceId/preferences', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { deviceId } = req.params;
    const { soundEnabled, voiceEnabled, vibrationEnabled, deviceLabel } = req.body;

    const device = await queryOne('SELECT * FROM event_duty_devices WHERE id = ?', [deviceId]);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    if (device.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const now = new Date().toISOString();
    const cleanLabel = deviceLabel !== undefined ? deviceLabel.trim().substring(0, 50) : device.device_label;

    await execute(`
      UPDATE event_duty_devices
      SET sound_enabled = ?, voice_enabled = ?, vibration_enabled = ?, device_label = ?, updated_at = ?
      WHERE id = ?
    `, [
      soundEnabled !== undefined ? (soundEnabled ? 1 : 0) : device.sound_enabled,
      voiceEnabled !== undefined ? (voiceEnabled ? 1 : 0) : device.voice_enabled,
      vibrationEnabled !== undefined ? (vibrationEnabled ? 1 : 0) : device.vibration_enabled,
      cleanLabel,
      now,
      deviceId
    ]);

    const updatedDevice = await queryOne('SELECT * FROM event_duty_devices WHERE id = ?', [deviceId]);
    return res.json({
      success: true,
      device: updatedDevice,
      message: 'Preferences updated successfully'
    });
  } catch (err: any) {
    console.error('Error in PATCH /api/duty/devices/:deviceId/preferences:', err);
    return res.status(500).json({ error: 'An unexpected error occurred while updating device preferences' });
  }
});

// DELETE /api/duty/devices/:deviceId
dutyRouter.delete('/devices/:deviceId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { deviceId } = req.params;
    const device = await queryOne('SELECT * FROM event_duty_devices WHERE id = ?', [deviceId]);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    if (device.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await execute('DELETE FROM event_duty_devices WHERE id = ?', [deviceId]);
    return res.json({
      success: true,
      message: 'Device deleted successfully'
    });
  } catch (err: any) {
    console.error('Error in DELETE /api/duty/devices/:deviceId:', err);
    return res.status(500).json({ error: 'An unexpected error occurred while deleting device' });
  }
});

// GET /api/duty/current-assignment
dutyRouter.get('/current-assignment', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const assignment = await queryOne(`
      SELECT a.*, e.title as event_title
      FROM event_duty_assignments a
      JOIN events e ON a.event_id = e.id
      WHERE a.user_id = ? AND a.event_id = ? AND a.status != 'cancelled'
      ORDER BY a.starts_at DESC
      LIMIT 1
    `, [userId, REAL_EVENT_ID]);

    const volunteerProfile = await queryOne('SELECT * FROM volunteer_profiles WHERE user_id = ?', [userId]);

    return res.json({
      success: true,
      assignment: assignment || null,
      volunteerProfile: volunteerProfile || null
    });
  } catch (err: any) {
    console.error('Error in GET /api/duty/current-assignment:', err);
    return res.status(500).json({ error: 'An unexpected error occurred while fetching current assignment' });
  }
});

// POST /api/duty/assignments/:assignmentId/temporarily-unavailable
dutyRouter.post('/assignments/:assignmentId/temporarily-unavailable', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { assignmentId } = req.params;
    const { reason, expectedReturnTime } = req.body;

    const assignment = await queryOne('SELECT * FROM event_duty_assignments WHERE id = ?', [assignmentId]);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Users can only change their own assignment unless they are admin
    if (assignment.user_id !== userId && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const now = new Date().toISOString();
    await execute(`
      UPDATE event_duty_assignments
      SET status = 'temporarily_unavailable', temporarily_unavailable_at = ?, expected_return_at = ?, note = ?
      WHERE id = ?
    `, [now, expectedReturnTime || null, reason || 'On break', assignmentId]);

    // Set user_duty_status temporarily inactive/un-ready
    await execute('UPDATE user_duty_status SET on_duty = 0, updated_at = ? WHERE user_id = ?', [now, assignment.user_id]);

    // Record change history
    const historyId = `history-${crypto.randomBytes(8).toString('hex')}`;
    await execute(`
      INSERT INTO event_routing_change_history (id, event_id, user_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [historyId, REAL_EVENT_ID, userId, 'assignment_unavailable', 'assignment', assignmentId, `Marked temporarily unavailable: ${reason || 'No reason specified'}`, now]);

    broadcastSSEEvent('assignment_updated', { assignmentId, status: 'temporarily_unavailable' });

    return res.json({
      success: true,
      message: 'Status updated to temporarily unavailable'
    });
  } catch (err: any) {
    console.error('Error in temporarily-unavailable:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/duty/assignments/:assignmentId/return
dutyRouter.post('/assignments/:assignmentId/return', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { assignmentId } = req.params;
    const assignment = await queryOne('SELECT * FROM event_duty_assignments WHERE id = ?', [assignmentId]);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    if (assignment.user_id !== userId && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const now = new Date().toISOString();
    await execute(`
      UPDATE event_duty_assignments
      SET status = 'on_duty', temporarily_unavailable_at = NULL, expected_return_at = NULL
      WHERE id = ?
    `, [assignmentId]);

    await execute('UPDATE user_duty_status SET on_duty = 1, updated_at = ? WHERE user_id = ?', [now, assignment.user_id]);

    // Record change history
    const historyId = `history-${crypto.randomBytes(8).toString('hex')}`;
    await execute(`
      INSERT INTO event_routing_change_history (id, event_id, user_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [historyId, REAL_EVENT_ID, userId, 'assignment_return', 'assignment', assignmentId, 'Returned to event duty', now]);

    broadcastSSEEvent('assignment_updated', { assignmentId, status: 'on_duty' });

    return res.json({
      success: true,
      message: 'Returned to event duty successfully'
    });
  } catch (err: any) {
    console.error('Error in return to duty:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


const adminDutyRouter = Router();
adminDutyRouter.use(authMiddleware);

// GET /api/admin/duty/devices
adminDutyRouter.get('/devices', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const offset = (page - 1) * limit;

    const filterRole = req.query.role as string;
    const filterDuty = req.query.dutyStatus as string;
    const filterReadiness = req.query.readiness as string;
    const filterConnection = req.query.connection as string;

    let whereClause = 'WHERE d.event_id = ?';
    const params: any[] = [REAL_EVENT_ID];

    if (filterRole) {
      whereClause += ' AND d.role = ?';
      params.push(filterRole);
    }
    if (filterDuty) {
      if (filterDuty === 'on_duty') {
        whereClause += ' AND d.duty_started_at IS NOT NULL AND d.duty_ended_at IS NULL';
      } else {
        whereClause += ' AND (d.duty_started_at IS NULL OR d.duty_ended_at IS NOT NULL)';
      }
    }
    if (filterReadiness) {
      whereClause += ' AND d.readiness_status = ?';
      params.push(filterReadiness);
    }
    if (filterConnection) {
      whereClause += ' AND d.live_connection_status = ?';
      params.push(filterConnection);
    }

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM event_duty_devices d
      ${whereClause}
    `;
    const countResult = await queryOne(countQuery, params);
    const total = countResult?.total || 0;
    const totalPages = Math.ceil(total / limit);

    const itemsQuery = `
      SELECT d.*, u.full_name as user_name
      FROM event_duty_devices d
      JOIN users u ON d.user_id = u.id
      ${whereClause}
      ORDER BY d.updated_at DESC
      LIMIT ? OFFSET ?
    `;
    const queryParams = [...params, limit, offset];
    const items = await query(itemsQuery, queryParams);

    return res.json({
      success: true,
      items: items || [],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (err: any) {
    console.error('Error in GET /api/admin/duty/devices:', err);
    return res.status(500).json({ error: 'An unexpected error occurred while fetching admin duty devices' });
  }
});

// POST /api/admin/duty/devices/:deviceId/remind
adminDutyRouter.post('/devices/:deviceId/remind', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }

    const { deviceId } = req.params;
    const device = await queryOne('SELECT * FROM event_duty_devices WHERE id = ?', [deviceId]);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const now = new Date().toISOString();
    const notifId = `notif-${crypto.randomBytes(8).toString('hex')}`;

    await execute(`
      INSERT INTO notifications (
        id, title, message, type, audience_role, audience_scope, event_id, created_by_user_id, created_at, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      notifId,
      'Device readiness check required',
      'Please complete your device readiness check before starting event duty.',
      'info',
      device.role,
      'user',
      REAL_EVENT_ID,
      req.user.id,
      now,
      'high'
    ]);

    // Send push notification too
    await sendWebPush(device.user_id, {
      title: 'Device readiness check required',
      body: 'Please complete your device readiness check before starting event duty.'
    });

    return res.json({
      success: true,
      message: 'Readiness reminder sent successfully'
    });
  } catch (err: any) {
    console.error('Error in POST /api/admin/duty/devices/:deviceId/remind:', err);
    return res.status(500).json({ error: 'An unexpected error occurred while reminding team member' });
  }
});


// ==========================================
// PHASE 3 PREMIUM ON-DUTY TEAM ENDPOINTS
// ==========================================

async function ensureDefaultRules() {
  try {
    const existing = await queryOne('SELECT id FROM alert_routing_rules WHERE event_id = ? LIMIT 1', [REAL_EVENT_ID]);
    if (existing) {
      return; // Already initialized
    }
    console.log('[Routing Rules Seeder] Seeding default premium routing rules...');
    
    const now = new Date().toISOString();
    const rules = [
      {
        id: 'rule-medical',
        category: 'medical_support',
        requires_ack: 1,
        escalation: 30,
        recipients: [
          { type: 'role', key: 'First Aid Team', tier: 'primary' },
          { type: 'role', key: 'Care Lead', tier: 'primary' },
          { type: 'role', key: 'Event Admin', tier: 'supervisory' },
          { type: 'role', key: 'General Response', tier: 'backup' },
          { type: 'role', key: 'Super Admin', tier: 'backup' }
        ]
      },
      {
        id: 'rule-security',
        category: 'security_concern',
        requires_ack: 1,
        escalation: 30,
        recipients: [
          { type: 'role', key: 'Security Lead', tier: 'primary' },
          { type: 'role', key: 'Event Admin', tier: 'primary' },
          { type: 'role', key: 'Gate/Check-in Lead', tier: 'primary' },
          { type: 'role', key: 'Care Lead', tier: 'primary' },
          { type: 'role', key: 'Super Admin', tier: 'backup' },
          { type: 'role', key: 'General Response', tier: 'backup' }
        ]
      },
      {
        id: 'rule-pickup',
        category: 'pickup_issue',
        requires_ack: 1,
        escalation: 45,
        recipients: [
          { type: 'role', key: 'Pickup Lead', tier: 'primary' },
          { type: 'role', key: 'Event Admin', tier: 'primary' },
          { type: 'role', key: 'Care Lead', tier: 'backup' }
        ]
      },
      {
        id: 'rule-pass',
        category: 'pass_issue',
        requires_ack: 1,
        escalation: 45,
        recipients: [
          { type: 'role', key: 'Gate/Check-in Lead', tier: 'primary' },
          { type: 'role', key: 'Event Admin', tier: 'primary' }
        ]
      },
      {
        id: 'rule-location',
        category: 'location_support',
        requires_ack: 1,
        escalation: 30,
        recipients: [
          { type: 'role', key: 'Room/Group Lead', tier: 'primary' },
          { type: 'role', key: 'Care Lead', tier: 'primary' },
          { type: 'role', key: 'General Response', tier: 'backup' }
        ]
      },
      {
        id: 'rule-care',
        category: 'child_care',
        requires_ack: 1,
        escalation: 30,
        recipients: [
          { type: 'role', key: 'Care Lead', tier: 'primary' },
          { type: 'role', key: 'General Response', tier: 'backup' }
        ]
      },
      {
        id: 'rule-other',
        category: 'other',
        requires_ack: 0,
        escalation: 60,
        recipients: [
          { type: 'role', key: 'General Response', tier: 'primary' }
        ]
      }
    ];

    for (const rule of rules) {
      await execute(`
        INSERT INTO alert_routing_rules (
          id, event_id, category_key, severity_key, requires_acknowledgement, escalation_delay_seconds, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, 'all', ?, ?, 1, ?, ?)
      `, [rule.id, REAL_EVENT_ID, rule.category, rule.requires_ack, rule.escalation, now, now]);

      for (let i = 0; i < rule.recipients.length; i++) {
        const recip = rule.recipients[i];
        const recipId = `rule-recip-${rule.category}-${i}`;
        await execute(`
          INSERT INTO alert_routing_recipients (
            id, routing_rule_id, recipient_type, responsibility_key, delivery_tier, sort_order, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [recipId, rule.id, recip.type, recip.key, recip.tier, i, now]);
      }
    }
  } catch (err) {
    console.error('[Routing Rules Seeder] Seeding failed:', err);
  }
}

// Seed default rules automatically if none exist for current event
ensureDefaultRules();

// GET /api/admin/events/:eventId/duty-assignments
adminDutyRouter.get('/events/:eventId/duty-assignments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }

    const { eventId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const offset = (page - 1) * limit;

    const responsibility = req.query.responsibility as string;
    const status = req.query.status as string;
    const level = req.query.level as string;
    const queryStr = req.query.query as string;

    let whereClause = 'WHERE a.event_id = ?';
    const params: any[] = [eventId];

    if (responsibility) {
      whereClause += ' AND a.responsibility_key = ?';
      params.push(responsibility);
    }
    if (status) {
      whereClause += ' AND a.status = ?';
      params.push(status);
    }
    if (level) {
      whereClause += ' AND a.assignment_level = ?';
      params.push(level);
    }
    if (queryStr) {
      whereClause += ' AND (u.full_name LIKE ? OR u.email LIKE ?)';
      params.push(`%${queryStr}%`, `%${queryStr}%`);
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM event_duty_assignments a
      JOIN users u ON a.user_id = u.id
      ${whereClause}
    `;
    const countResult = await queryOne(countQuery, params);
    const total = countResult?.total || 0;
    const totalPages = Math.ceil(total / limit);

    const itemsQuery = `
      SELECT a.*, u.full_name as user_name, u.email as user_email, u.role as user_role,
             (SELECT COUNT(*) FROM event_duty_devices d WHERE d.user_id = a.user_id AND d.readiness_status = 'ready') as ready_devices,
             el.name as assigned_location_name, el.location_type as assigned_location_type
      FROM event_duty_assignments a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN event_locations el ON a.assigned_location_id = el.id
      ${whereClause}
      ORDER BY 
        CASE WHEN a.status = 'on_duty' THEN 1 
             WHEN a.status = 'available' THEN 2 
             WHEN a.status = 'scheduled' THEN 3 
             ELSE 4 END,
        a.starts_at ASC
      LIMIT ? OFFSET ?
    `;
    const queryParams = [...params, limit, offset];
    const items = await query(itemsQuery, queryParams);

    return res.json({
      success: true,
      items: items || [],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (err: any) {
    console.error('Error fetching assignments:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/events/:eventId/duty-assignments
adminDutyRouter.post('/events/:eventId/duty-assignments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { eventId } = req.params;
    const { userId, responsibilityKey, teamKey, assignmentLevel, status, startsAt, endsAt, note, assignedLocationId } = req.body;

    if (!userId || !responsibilityKey || !startsAt || !endsAt) {
      return res.status(400).json({ error: 'Missing required assignment fields' });
    }

    const targetUser = await queryOne('SELECT id, role, is_deleted FROM users WHERE id = ?', [userId]);
    if (!targetUser || targetUser.is_deleted === 1) {
      return res.status(400).json({ error: 'Selected user is inactive or does not exist' });
    }

    const now = new Date().toISOString();
    const assignmentId = `assign-${crypto.randomBytes(8).toString('hex')}`;

    await execute(`
      INSERT INTO event_duty_assignments (
        id, event_id, user_id, responsibility_key, team_key, assignment_level, status, starts_at, ends_at, note, assigned_by, assigned_location_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      assignmentId, eventId, userId, responsibilityKey, teamKey || null, assignmentLevel || 'primary', status || 'scheduled', startsAt, endsAt, note || null, req.user.id, assignedLocationId || null, now, now
    ]);

    // Send notification to volunteer
    const notifId = `notif-${crypto.randomBytes(8).toString('hex')}`;
    const friendlyResponsibility = responsibilityKey.replace('_', ' ');
    await execute(`
      INSERT INTO notifications (
        id, title, message, type, audience_role, audience_scope, event_id, created_by_user_id, created_at, priority
      ) VALUES (?, ?, ?, 'info', 'volunteer', 'user', ?, ?, ?, 'high')
    `, [
      notifId,
      'New Event Duty Assignment',
      `You have been assigned as "${friendlyResponsibility}" for the upcoming event. Please review and start duty when shift starts.`,
      eventId,
      req.user.id,
      now
    ]);

    // Async push notification
    sendWebPush(userId, {
      title: 'New Duty Assignment',
      body: `You are assigned as ${friendlyResponsibility}. Please complete your device readiness check.`
    }).catch(err => console.error('Failed to send assignment push:', err));

    // Change history log
    const historyId = `history-${crypto.randomBytes(8).toString('hex')}`;
    await execute(`
      INSERT INTO event_routing_change_history (id, event_id, user_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [historyId, eventId, req.user.id, 'assignment_created', 'assignment', assignmentId, `Assigned user ${userId} to responsibility ${responsibilityKey}`, now]);

    // SSE update
    broadcastSSEEvent('assignment_updated', { assignmentId, action: 'create' });

    return res.json({
      success: true,
      assignmentId,
      message: 'Event duty assignment created successfully'
    });
  } catch (err: any) {
    console.error('Error creating assignment:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/events/:eventId/duty-assignments/:assignmentId
adminDutyRouter.patch('/events/:eventId/duty-assignments/:assignmentId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { assignmentId } = req.params;
    const { responsibilityKey, teamKey, assignmentLevel, status, startsAt, endsAt, note, assignedLocationId } = req.body;

    const assignment = await queryOne('SELECT * FROM event_duty_assignments WHERE id = ?', [assignmentId]);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const now = new Date().toISOString();
    await execute(`
      UPDATE event_duty_assignments
      SET responsibility_key = COALESCE(?, responsibility_key),
          team_key = COALESCE(?, team_key),
          assignment_level = COALESCE(?, assignment_level),
          status = COALESCE(?, status),
          starts_at = COALESCE(?, starts_at),
          ends_at = COALESCE(?, ends_at),
          note = COALESCE(?, note),
          assigned_location_id = ?,
          updated_at = ?
      WHERE id = ?
    `, [
      responsibilityKey || null, teamKey || null, assignmentLevel || null, status || null, startsAt || null, endsAt || null, note || null, assignedLocationId === '' ? null : (assignedLocationId || assignment.assigned_location_id), now, assignmentId
    ]);

    // Audit change
    const historyId = `history-${crypto.randomBytes(8).toString('hex')}`;
    await execute(`
      INSERT INTO event_routing_change_history (id, event_id, user_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [historyId, assignment.event_id, req.user.id, 'assignment_updated', 'assignment', assignmentId, `Updated assignment details for ${assignment.user_id}`, now]);

    broadcastSSEEvent('assignment_updated', { assignmentId, action: 'update' });

    return res.json({
      success: true,
      message: 'Assignment updated successfully'
    });
  } catch (err: any) {
    console.error('Error updating assignment:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/events/:eventId/duty-assignments/:assignmentId
adminDutyRouter.delete('/events/:eventId/duty-assignments/:assignmentId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { assignmentId } = req.params;
    const assignment = await queryOne('SELECT * FROM event_duty_assignments WHERE id = ?', [assignmentId]);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const now = new Date().toISOString();
    await execute(`UPDATE event_duty_assignments SET status = 'cancelled', updated_at = ? WHERE id = ?`, [now, assignmentId]);

    // Audit change
    const historyId = `history-${crypto.randomBytes(8).toString('hex')}`;
    await execute(`
      INSERT INTO event_routing_change_history (id, event_id, user_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [historyId, assignment.event_id, req.user.id, 'assignment_cancelled', 'assignment', assignmentId, `Cancelled assignment for ${assignment.user_id}`, now]);

    broadcastSSEEvent('assignment_updated', { assignmentId, action: 'cancel' });

    return res.json({
      success: true,
      message: 'Assignment cancelled successfully'
    });
  } catch (err: any) {
    console.error('Error deleting assignment:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


// GET /api/admin/events/:eventId/alert-routing
adminDutyRouter.get('/events/:eventId/alert-routing', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }

    const { eventId } = req.params;
    const rules = await query('SELECT * FROM alert_routing_rules WHERE event_id = ? ORDER BY category_key ASC', [eventId]);
    
    // Populate rule recipients
    const hydratedRules = [];
    for (const rule of rules) {
      const recs = await query('SELECT * FROM alert_routing_recipients WHERE routing_rule_id = ? ORDER BY sort_order ASC', [rule.id]);
      hydratedRules.push({
        ...rule,
        recipients: recs || []
      });
    }

    const changeHistory = await query(`
      SELECT h.*, u.full_name as user_name
      FROM event_routing_change_history h
      JOIN users u ON h.user_id = u.id
      WHERE h.event_id = ?
      ORDER BY h.created_at DESC
      LIMIT 25
    `, [eventId]);

    return res.json({
      success: true,
      rules: hydratedRules,
      history: changeHistory || []
    });
  } catch (err: any) {
    console.error('Error fetching rules:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/events/:eventId/alert-routing
adminDutyRouter.post('/events/:eventId/alert-routing', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { eventId } = req.params;
    const { categoryKey, severityKey, requiresAcknowledgement, escalationDelaySeconds, recipients } = req.body;

    if (!categoryKey || !severityKey) {
      return res.status(400).json({ error: 'Missing required routing rule fields' });
    }

    const now = new Date().toISOString();
    const ruleId = `rule-${crypto.randomBytes(8).toString('hex')}`;

    // Insert main rule
    await execute(`
      INSERT INTO alert_routing_rules (
        id, event_id, category_key, severity_key, requires_acknowledgement, escalation_delay_seconds, is_active, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `, [
      ruleId, eventId, categoryKey, severityKey, requiresAcknowledgement ? 1 : 0, escalationDelaySeconds || 30, req.user.id, req.user.id, now, now
    ]);

    // Insert recipients
    if (Array.isArray(recipients)) {
      for (let i = 0; i < recipients.length; i++) {
        const recip = recipients[i];
        const recipId = `recip-${crypto.randomBytes(8).toString('hex')}`;
        await execute(`
          INSERT INTO alert_routing_recipients (
            id, routing_rule_id, recipient_type, responsibility_key, team_key, user_id, delivery_tier, sort_order, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          recipId, ruleId, recip.recipient_type || 'role', recip.responsibility_key || null, recip.team_key || null, recip.user_id || null, recip.delivery_tier || 'primary', i, now
        ]);
      }
    }

    // Audit change
    const historyId = `history-${crypto.randomBytes(8).toString('hex')}`;
    await execute(`
      INSERT INTO event_routing_change_history (id, event_id, user_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [historyId, eventId, req.user.id, 'rule_created', 'rule', ruleId, `Created routing rule for category: ${categoryKey}`, now]);

    broadcastSSEEvent('routing_updated', { ruleId });

    return res.json({
      success: true,
      ruleId,
      message: 'Alert routing rule created successfully'
    });
  } catch (err: any) {
    console.error('Error creating routing rule:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/events/:eventId/alert-routing/:ruleId
adminDutyRouter.patch('/events/:eventId/alert-routing/:ruleId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { ruleId } = req.params;
    const { requiresAcknowledgement, escalationDelaySeconds, is_active, recipients } = req.body;

    const rule = await queryOne('SELECT * FROM alert_routing_rules WHERE id = ?', [ruleId]);
    if (!rule) {
      return res.status(404).json({ error: 'Routing rule not found' });
    }

    const now = new Date().toISOString();
    await execute(`
      UPDATE alert_routing_rules
      SET requires_acknowledgement = COALESCE(?, requires_acknowledgement),
          escalation_delay_seconds = COALESCE(?, escalation_delay_seconds),
          is_active = COALESCE(?, is_active),
          updated_by = ?,
          updated_at = ?
      WHERE id = ?
    `, [
      requiresAcknowledgement !== undefined ? (requiresAcknowledgement ? 1 : 0) : null,
      escalationDelaySeconds || null,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      req.user.id,
      now,
      ruleId
    ]);

    // If recipients list was passed, overwrite existing recipients
    if (Array.isArray(recipients)) {
      await execute('DELETE FROM alert_routing_recipients WHERE routing_rule_id = ?', [ruleId]);
      for (let i = 0; i < recipients.length; i++) {
        const recip = recipients[i];
        const recipId = `recip-${crypto.randomBytes(8).toString('hex')}`;
        await execute(`
          INSERT INTO alert_routing_recipients (
            id, routing_rule_id, recipient_type, responsibility_key, team_key, user_id, delivery_tier, sort_order, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          recipId, ruleId, recip.recipient_type || 'role', recip.responsibility_key || null, recip.team_key || null, recip.user_id || null, recip.delivery_tier || 'primary', i, now
        ]);
      }
    }

    // Audit change
    const historyId = `history-${crypto.randomBytes(8).toString('hex')}`;
    await execute(`
      INSERT INTO event_routing_change_history (id, event_id, user_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [historyId, rule.event_id, req.user.id, 'rule_updated', 'rule', ruleId, `Updated routing rule for category: ${rule.category_key}`, now]);

    broadcastSSEEvent('routing_updated', { ruleId });

    return res.json({
      success: true,
      message: 'Routing rule updated successfully'
    });
  } catch (err: any) {
    console.error('Error updating routing rule:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/events/:eventId/alert-routing/:ruleId
adminDutyRouter.delete('/events/:eventId/alert-routing/:ruleId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { ruleId } = req.params;
    const rule = await queryOne('SELECT * FROM alert_routing_rules WHERE id = ?', [ruleId]);
    if (!rule) {
      return res.status(404).json({ error: 'Routing rule not found' });
    }

    await execute('DELETE FROM alert_routing_rules WHERE id = ?', [ruleId]);

    // Audit change
    const now = new Date().toISOString();
    const historyId = `history-${crypto.randomBytes(8).toString('hex')}`;
    await execute(`
      INSERT INTO event_routing_change_history (id, event_id, user_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [historyId, rule.event_id, req.user.id, 'rule_deleted', 'rule', ruleId, `Deleted routing rule for category: ${rule.category_key}`, now]);

    broadcastSSEEvent('routing_updated', { ruleId });

    return res.json({
      success: true,
      message: 'Routing rule deleted successfully'
    });
  } catch (err: any) {
    console.error('Error deleting routing rule:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


// GET /api/admin/events/:eventId/eligible-team-members
adminDutyRouter.get('/events/:eventId/eligible-team-members', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const offset = (page - 1) * limit;
    const queryStr = req.query.query as string || '';

    let whereClause = "WHERE u.is_deleted = 0 AND u.role IN ('volunteer', 'team', 'admin', 'super_admin')";
    const params: any[] = [];

    if (queryStr) {
      whereClause += ' AND (u.full_name LIKE ? OR u.email LIKE ?)';
      params.push(`%${queryStr}%`, `%${queryStr}%`);
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM users u
      ${whereClause}
    `;
    const countResult = await queryOne(countQuery, params);
    const total = countResult?.total || 0;
    const totalPages = Math.ceil(total / limit);

    const itemsQuery = `
      SELECT u.id, u.full_name, u.email, u.role, u.created_at,
             COALESCE(vp.status, 'active') as volunteer_status,
             (SELECT COUNT(*) FROM event_duty_devices d WHERE d.user_id = u.id) as device_count
      FROM users u
      LEFT JOIN volunteer_profiles vp ON u.id = vp.user_id
      ${whereClause}
      ORDER BY u.full_name ASC
      LIMIT ? OFFSET ?
    `;
    const queryParams = [...params, limit, offset];
    const items = await query(itemsQuery, queryParams);

    return res.json({
      success: true,
      items: items || [],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (err: any) {
    console.error('Error searching eligible members:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


// ==========================================
// BACKEND RECIPIENT RESOLUTION IMPLEMENTATION
// ==========================================

export async function resolveAlertRecipients(alertId: string, category: string, severity: string, raisedByUserId: string): Promise<any[]> {
  const now = new Date().toISOString();
  console.log(`[Recipient Resolution] Resolving for Alert: ${alertId}, Category: ${category}, Severity: ${severity}`);

  // Fetch alert info to find location_id
  const alert = await queryOne('SELECT location_id FROM event_safety_alerts WHERE id = ?', [alertId]);
  const alertLocationId = alert ? alert.location_id : null;

  // Load all event locations for hierarchy lookup
  const allLocations = await query('SELECT * FROM event_locations WHERE event_id = ?', [REAL_EVENT_ID]);
  const locMap = new Map<string, any>();
  for (const loc of allLocations) {
    locMap.set(loc.id, loc);
  }

  // Trace hierarchy path of the alert's location
  const locationPathIds: string[] = [];
  let currentLocId = alertLocationId;
  const visited = new Set<string>();
  while (currentLocId) {
    if (visited.has(currentLocId)) break;
    visited.add(currentLocId);
    locationPathIds.push(currentLocId);
    const loc = locMap.get(currentLocId);
    currentLocId = loc ? loc.parent_location_id : null;
  }

  // 1. Fetch matching rule using location-aware specificity ranking
  const rules = await query(`
    SELECT * FROM alert_routing_rules
    WHERE event_id = ? AND category_key = ? AND (severity_key = ? OR severity_key = 'all') AND is_active = 1
  `, [REAL_EVENT_ID, category, severity]);

  let rule = null;

  // Match 1: Exact location match
  if (alertLocationId) {
    rule = rules.find((r: any) => r.location_id === alertLocationId);
  }

  // Match 2: Parent match (if rule matches a parent and include_sub_locations = 1, or simply matches a parent)
  if (!rule && locationPathIds.length > 1) {
    for (let i = 1; i < locationPathIds.length; i++) {
      const parentId = locationPathIds[i];
      const match = rules.find((r: any) => r.location_id === parentId && r.include_sub_locations === 1);
      if (match) {
        rule = match;
        break;
      }
    }
  }

  // Match 3: Location type scope match
  if (!rule && alertLocationId) {
    const alertLoc = locMap.get(alertLocationId);
    if (alertLoc) {
      rule = rules.find((r: any) => r.location_type_scope === alertLoc.location_type);
    }
  }

  // Match 4: Global rule fallback
  if (!rule) {
    rule = rules.find((r: any) => !r.location_id && !r.location_type_scope);
  }

  const ruleId = rule ? rule.id : null;
  let ruleRecipients: any[] = [];

  if (ruleId) {
    ruleRecipients = await query('SELECT * FROM alert_routing_recipients WHERE routing_rule_id = ?', [ruleId]);
  } else {
    // If no custom rule defined, prepare fallback from premium default templates
    console.log('[Recipient Resolution] No saved rule found. Generating from fallback template.');
    const defaults: Record<string, string[]> = {
      medical_support: ['First Aid Team', 'Care Lead'],
      security_concern: ['Security Lead', 'Event Admin'],
      pickup_issue: ['Pickup Lead'],
      pass_issue: ['Gate/Check-in Lead'],
      location_support: ['Room/Group Lead', 'Care Lead'],
      child_care: ['Care Lead'],
      other: ['General Response']
    };
    const backupDefaults: Record<string, string[]> = {
      medical_support: ['General Response'],
      security_concern: ['General Response'],
      pickup_issue: ['Care Lead'],
      location_support: ['General Response']
    };

    const roles = defaults[category] || ['General Response'];
    const backupRoles = backupDefaults[category] || [];

    ruleRecipients = [
      ...roles.map((r, idx) => ({ recipient_type: 'role', responsibility_key: r, delivery_tier: 'primary', sort_order: idx })),
      ...backupRoles.map((r, idx) => ({ recipient_type: 'role', responsibility_key: r, delivery_tier: 'backup', sort_order: idx + 10 }))
    ];
  }

  // 2. Fetch all on-duty users / assignments for current event
  const assignments = await query(`
    SELECT a.*, u.full_name, u.email, u.is_deleted, u.role as user_role
    FROM event_duty_assignments a
    JOIN users u ON a.user_id = u.id
    WHERE a.event_id = ? AND a.status != 'cancelled'
  `, [REAL_EVENT_ID]);

  // Fetch all users' duty status
  const dutyStatuses = await query('SELECT * FROM user_duty_status');
  const dutyStatusMap = new Map(dutyStatuses.map((d: any) => [d.user_id, d]));

  // Fetch active duty presences
  const activePresences = await query('SELECT * FROM event_duty_location_presence WHERE event_id = ? AND ended_at IS NULL', [REAL_EVENT_ID]);
  const userPresenceMap = new Map(activePresences.map((p: any) => [p.user_id, p]));

  // Fetch devices
  const devices = await query('SELECT * FROM event_duty_devices WHERE event_id = ?', [REAL_EVENT_ID]);
  const userDevicesMap = new Map<string, any[]>();
  for (const d of devices) {
    if (!userDevicesMap.has(d.user_id)) {
      userDevicesMap.set(d.user_id, []);
    }
    userDevicesMap.get(d.user_id)!.push(d);
  }

  const resolvedUsers: any[] = [];
  const snapshotLogs: any[] = [];

  // Match assignments and direct rules to build snapshots
  for (const req of ruleRecipients) {
    if (req.recipient_type === 'user' && req.user_id) {
      // Direct user target
      const user = await queryOne('SELECT id, full_name, email, role, is_deleted FROM users WHERE id = ?', [req.user_id]);
      if (user && user.is_deleted === 0) {
        const duty = dutyStatusMap.get(user.id);
        const userDevices = userDevicesMap.get(user.id) || [];
        const isUnavailable = duty && duty.on_duty === 0;
        const hasNoDevice = userDevices.length === 0;

        let status = 'eligible';
        let reason = null;

        if (isUnavailable) {
          status = 'excluded';
          reason = 'Not on duty';
        } else if (hasNoDevice) {
          status = 'excluded';
          reason = 'No active duty device';
        }

        snapshotLogs.push({
          id: `snap-${crypto.randomBytes(8).toString('hex')}`,
          alert_id: alertId,
          user_id: user.id,
          assignment_id: null,
          routing_rule_id: ruleId,
          tier: req.delivery_tier,
          eligibility_status: status,
          exclusion_reason: reason
        });

        if (status === 'eligible') {
          resolvedUsers.push({
            id: user.id,
            role: user.role,
            tier: req.delivery_tier,
            devices: userDevices
          });
        }
      }
    } else if (req.recipient_type === 'role' && req.responsibility_key) {
      // Find assignments with matching responsibility_key
      const matchingAssigns = assignments.filter((a: any) => a.responsibility_key === req.responsibility_key);
      
      if (matchingAssigns.length === 0) {
        // Nobody assigned to this role at all
        continue;
      }

      for (const assign of matchingAssigns) {
        const duty = dutyStatusMap.get(assign.user_id);
        const userDevices = userDevicesMap.get(assign.user_id) || [];
        const isUnavailable = assign.status === 'temporarily_unavailable';
        const isEnded = assign.status === 'ended';
        const notStarted = duty && duty.on_duty === 0;
        const hasNoDevice = userDevices.length === 0;

        let status = 'eligible';
        let reason = null;

        if (isUnavailable) {
          status = 'excluded';
          reason = 'Temporarily unavailable';
        } else if (isEnded) {
          status = 'excluded';
          reason = 'Assignment ended';
        } else if (notStarted) {
          status = 'excluded';
          reason = 'Not on duty';
        } else if (hasNoDevice) {
          status = 'excluded';
          reason = 'No active duty device';
        }

        // Location-Aware Assignment & Presence Matching
        const assignLocId = assign.assigned_location_id;
        const presence = userPresenceMap.get(assign.user_id);
        const presenceLocId = presence ? presence.event_location_id : null;

        const hasLocationConstraint = !!assignLocId || !!presenceLocId;
        if (status === 'eligible' && alertLocationId && hasLocationConstraint) {
          const matchAssign = !assignLocId || assignLocId === alertLocationId || locationPathIds.includes(assignLocId);
          const matchPresence = !presenceLocId || presenceLocId === alertLocationId || locationPathIds.includes(presenceLocId);
          if (!matchAssign || !matchPresence) {
            status = 'excluded';
            reason = 'Location routing exclusion (assigned elsewhere)';
          }
        }

        snapshotLogs.push({
          id: `snap-${crypto.randomBytes(8).toString('hex')}`,
          alert_id: alertId,
          user_id: assign.user_id,
          assignment_id: assign.id,
          routing_rule_id: ruleId,
          tier: req.delivery_tier,
          eligibility_status: status,
          exclusion_reason: reason
        });

        if (status === 'eligible') {
          resolvedUsers.push({
            id: assign.user_id,
            role: assign.user_role,
            tier: req.delivery_tier,
            devices: userDevices
          });
        }
      }
    }
  }

  // 3. Fallback check (Section 14)
  let eligiblePrimary = resolvedUsers.filter(u => u.tier === 'primary');
  let eligibleBackup = resolvedUsers.filter(u => u.tier === 'backup');
  let eligibleSupervisory = resolvedUsers.filter(u => u.tier === 'supervisory');

  let finalRecipients: any[] = [];

  if (eligiblePrimary.length > 0) {
    // Route to Primary, and supervisory
    finalRecipients = [...eligiblePrimary, ...eligibleSupervisory];
  } else if (eligibleBackup.length > 0) {
    // No primary available, fall back to Backup immediately!
    console.log('[Recipient Resolution] No primary available, routing to backup.');
    finalRecipients = [...eligibleBackup, ...eligibleSupervisory];
    
    // Log fallback reasons
    snapshotLogs.push({
      id: `snap-fallback-${crypto.randomBytes(8).toString('hex')}`,
      alert_id: alertId,
      user_id: raisedByUserId, // System log referenced to raisedByUser
      assignment_id: null,
      routing_rule_id: ruleId,
      tier: 'primary',
      eligibility_status: 'excluded',
      exclusion_reason: 'Primary unavailable fallback triggered'
    });
  } else {
    // Absolute No-Primary-Or-Backup Emergency Fallback
    console.log('[Recipient Resolution] CRITICAL: No active primary or backup responders available!');
    
    // Always preserve Super Admin emergency visibility for Urgent alerts (Section 14)
    if (severity === 'urgent') {
      const superAdmins = await query("SELECT id, role, full_name FROM users WHERE role = 'super_admin' AND is_deleted = 0");
      for (const sa of superAdmins) {
        const saDevices = userDevicesMap.get(sa.id) || [];
        finalRecipients.push({
          id: sa.id,
          role: sa.role,
          tier: 'supervisory',
          devices: saDevices
        });
        
        snapshotLogs.push({
          id: `snap-sa-fallback-${crypto.randomBytes(8).toString('hex')}`,
          alert_id: alertId,
          user_id: sa.id,
          assignment_id: null,
          routing_rule_id: ruleId,
          tier: 'supervisory',
          eligibility_status: 'eligible',
          exclusion_reason: 'Super Admin Emergency Fallback'
        });
      }
    }

    // Insert fallback failure log
    snapshotLogs.push({
      id: `snap-fallback-fail-${crypto.randomBytes(8).toString('hex')}`,
      alert_id: alertId,
      user_id: raisedByUserId,
      assignment_id: null,
      routing_rule_id: ruleId,
      tier: 'primary',
      eligibility_status: 'excluded',
      exclusion_reason: 'No eligible primary or backup coverage'
    });
  }

  // 4. Save snapshots to database (Section 13, 32)
  for (const log of snapshotLogs) {
    await execute(`
      INSERT INTO alert_recipient_snapshots (
        id, alert_id, user_id, assignment_id, routing_rule_id, tier, eligibility_status, exclusion_reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [log.id, log.alert_id, log.user_id, log.assignment_id, log.routing_rule_id, log.tier, log.eligibility_status, log.exclusion_reason, now]);
  }

  // 5. Populate safety_alert_recipients and alert_device_deliveries for finalRecipients
  const finalUsersWithDevices: any[] = [];
  const uniqueUserIds = Array.from(new Set(finalRecipients.map(u => u.id)));

  for (const uid of uniqueUserIds) {
    const userMatch = finalRecipients.find(u => u.id === uid);
    if (!userMatch) continue;

    // Create safety_alert_recipients record (Section 24)
    const recipientId = `recip-${crypto.randomBytes(8).toString('hex')}`;
    await execute(`
      INSERT INTO safety_alert_recipients (
        id, alert_id, recipient_user_id, recipient_role, sound_started_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(alert_id, recipient_user_id) DO NOTHING
    `, [recipientId, alertId, uid, userMatch.role, severity === 'urgent' ? now : null, now, now]);

    // Create per-device deliveries
    const userDevices = userMatch.devices || [];
    for (const d of userDevices) {
      const deliveryId = `deliv-${crypto.randomBytes(8).toString('hex')}`;
      await execute(`
        INSERT INTO alert_device_deliveries (
          id, alert_id, recipient_user_id, duty_device_id, channel, delivery_status, attempted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'sent', ?, ?, ?)
      `, [deliveryId, alertId, uid, d.id, 'in_app', now, now, now]);

      if (d.push_subscription_id) {
        const pushDeliveryId = `deliv-${crypto.randomBytes(8).toString('hex')}`;
        await execute(`
          INSERT INTO alert_device_deliveries (
            id, alert_id, recipient_user_id, duty_device_id, channel, delivery_status, attempted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        `, [pushDeliveryId, alertId, uid, d.id, 'push', now, now, now]);
      }
    }

    finalUsersWithDevices.push(userMatch);

    // Asynchronous Web Push fallback (Section 12)
    const pushTitle = severity === 'urgent' ? '🔴 Urgent alert' : '⚠️ Important alert';
    const pushBody = `New safety alert raised for category ${category.replace('_', ' ')}. Check duty panel.`;
    sendWebPush(uid, {
      title: pushTitle,
      body: pushBody,
      metadata: { alertId, severity, category }
    }).then(async (pushRes) => {
      if (pushRes.success) {
        await execute(`
          UPDATE alert_device_deliveries
          SET delivery_status = 'delivered', updated_at = ?
          WHERE alert_id = ? AND recipient_user_id = ? AND channel = 'push'
        `, [new Date().toISOString(), alertId, uid]);
      } else {
        await execute(`
          UPDATE alert_device_deliveries
          SET delivery_status = 'failed', failure_code = ?, updated_at = ?
          WHERE alert_id = ? AND recipient_user_id = ? AND channel = 'push'
        `, [pushRes.error || 'unknown_push_error', new Date().toISOString(), alertId, uid]);
      }
    }).catch(err => console.error('[Push Notification Fallback] Failed:', err));
  }

  // 6. Instantly Broadcast SSE delivery event (Section 12, 20)
  try {
    broadcastSSEEvent('safety_alert_created', {
      alertId,
      severity,
      category,
      timestamp: now,
      recipientsCount: uniqueUserIds.length
    });
  } catch (sseErr) {
    console.error('[SSE Broadcast] Failed to send sse alert created:', sseErr);
  }

  return finalUsersWithDevices;
}


// POST /api/admin/events/:eventId/alert-routing/preview
adminDutyRouter.post('/events/:eventId/alert-routing/preview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { category, severity } = req.body;
    if (!category || !severity) {
      return res.status(400).json({ error: 'Category and severity are required for routing preview' });
    }

    // Preview mode: Run resolution algorithm using a fake temporary alert ID, without committing real notifications
    console.log(`[Preview Alert Routing] Previewing Category: ${category}, Severity: ${severity}`);

    // Fetch active routing rule
    let rule = await queryOne(`
      SELECT * FROM alert_routing_rules
      WHERE event_id = ? AND category_key = ? AND (severity_key = ? OR severity_key = 'all') AND is_active = 1
      ORDER BY CASE WHEN severity_key = ? THEN 1 ELSE 2 END ASC
      LIMIT 1
    `, [REAL_EVENT_ID, category, severity, severity]);

    let ruleRecipients = [];
    if (rule) {
      ruleRecipients = await query('SELECT * FROM alert_routing_recipients WHERE routing_rule_id = ?', [rule.id]);
    } else {
      const defaults: Record<string, string[]> = {
        medical_support: ['First Aid Team', 'Care Lead'],
        security_concern: ['Security Lead', 'Event Admin'],
        pickup_issue: ['Pickup Lead'],
        pass_issue: ['Gate/Check-in Lead'],
        location_support: ['Room/Group Lead', 'Care Lead'],
        child_care: ['Care Lead'],
        other: ['General Response']
      };
      const backVars = { medical_support: ['General Response'], security_concern: ['General Response'], pickup_issue: ['Care Lead'] } as any;
      const roles = defaults[category] || ['General Response'];
      const backupRoles = backVars[category] || [];

      ruleRecipients = [
        ...roles.map((r, i) => ({ recipient_type: 'role', responsibility_key: r, delivery_tier: 'primary', sort_order: i })),
        ...backupRoles.map((r, i) => ({ recipient_type: 'role', responsibility_key: r, delivery_tier: 'backup', sort_order: i + 10 }))
      ];
    }

    const assignments = await query(`
      SELECT a.*, u.full_name, u.email, u.role as user_role
      FROM event_duty_assignments a
      JOIN users u ON a.user_id = u.id
      WHERE a.event_id = ? AND a.status != 'cancelled'
    `, [REAL_EVENT_ID]);

    const dutyStatuses = await query('SELECT * FROM user_duty_status');
    const dutyMap = new Map(dutyStatuses.map((d: any) => [d.user_id, d]));

    const devices = await query('SELECT * FROM event_duty_devices WHERE event_id = ?', [REAL_EVENT_ID]);
    const userDevicesMap = new Map<string, any[]>();
    for (const d of devices) {
      if (!userDevicesMap.has(d.user_id)) {
        userDevicesMap.set(d.user_id, []);
      }
      userDevicesMap.get(d.user_id)!.push(d);
    }

    const primaryRecipients: any[] = [];
    const backupRecipients: any[] = [];
    const supervisoryRecipients: any[] = [];
    const excludedRecipients: any[] = [];

    for (const reqRec of ruleRecipients) {
      if (reqRec.recipient_type === 'role' && reqRec.responsibility_key) {
        const matches = assignments.filter((a: any) => a.responsibility_key === reqRec.responsibility_key);
        for (const assign of matches) {
          const duty = dutyMap.get(assign.user_id);
          const userDevices = userDevicesMap.get(assign.user_id) || [];
          const isUnavailable = assign.status === 'temporarily_unavailable';
          const notOnDuty = duty && duty.on_duty === 0;
          const hasNoDevices = userDevices.length === 0;

          let isEligible = true;
          let exclusionReason = null;

          if (isUnavailable) {
            isEligible = false;
            exclusionReason = 'Temporarily unavailable';
          } else if (notOnDuty) {
            isEligible = false;
            exclusionReason = 'Not on duty';
          } else if (hasNoDevices) {
            isEligible = false;
            exclusionReason = 'No active duty device';
          }

          const record = {
            userId: assign.user_id,
            name: assign.full_name,
            role: assign.user_role,
            responsibility: assign.responsibility_key,
            devices: userDevices.map((d: any) => ({ label: d.device_label, status: d.readiness_status }))
          };

          if (isEligible) {
            if (reqRec.delivery_tier === 'primary') primaryRecipients.push(record);
            else if (reqRec.delivery_tier === 'backup') backupRecipients.push(record);
            else supervisoryRecipients.push(record);
          } else {
            excludedRecipients.push({
              ...record,
              exclusionReason
            });
          }
        }
      }
    }

    // Fallback logic inside preview
    let coverageStatus = 'covered';
    if (primaryRecipients.length === 0) {
      if (backupRecipients.length > 0) {
        coverageStatus = 'covered_with_backup_only';
      } else {
        coverageStatus = 'not_covered';
      }
    }

    return res.json({
      success: true,
      preview: true,
      coverageStatus,
      primaryRecipients,
      backupRecipients,
      supervisoryRecipients,
      excludedRecipients,
      channels: ['in_app', 'push_fallback']
    });
  } catch (err: any) {
    console.error('Error previewing rule:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/events/:eventId/alert-routing/test
adminDutyRouter.post('/events/:eventId/alert-routing/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: Admin permissions required' });
    }

    const { category } = req.body;
    if (!category) {
      return res.status(400).json({ error: 'Category key is required for routing test' });
    }

    const now = new Date().toISOString();
    const alertId = `test-alert-${crypto.randomBytes(8).toString('hex')}`;

    // Insert dummy test alert (does not populate production safety_alerts child link)
    await execute(`
      INSERT INTO event_safety_alerts (
        id, event_id, child_id, child_event_entry_id, raised_by_user_id, raised_by_role, severity, category, title, message, status, created_at, updated_at
      ) VALUES (?, ?, NULL, NULL, ?, ?, 'important', ?, 'Event alert test', 'This is a controlled alert routing and delivery test.', 'open', ?, ?)
    `, [alertId, REAL_EVENT_ID, req.user.id, 'admin', category, now, now]);

    // Resolve and notify test recipients using backend resolution engine
    const recipients = await resolveAlertRecipients(alertId, category, 'important', req.user.id);

    // Change history audit logs
    const historyId = `history-${crypto.randomBytes(8).toString('hex')}`;
    await execute(`
      INSERT INTO event_routing_change_history (id, event_id, user_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [historyId, REAL_EVENT_ID, req.user.id, 'test_alert_sent', 'test', alertId, `Triggered alert routing test for: ${category}`, now]);

    return res.json({
      success: true,
      alertId,
      recipientsCount: recipients.length,
      message: `Controlled routing test sent successfully. ${recipients.length} eligible duty devices triggered.`
    });
  } catch (err: any) {
    console.error('Error sending test alert:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


// GET /api/admin/events/:eventId/response-coverage
adminDutyRouter.get('/events/:eventId/response-coverage', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: Admin permissions required' });
    }

    const { eventId } = req.params;

    // Counts
    const onDutyCountRes = await queryOne(`SELECT COUNT(*) as count FROM user_duty_status WHERE on_duty = 1 AND assigned_event_id = ?`, [eventId]);
    const readyDevicesRes = await queryOne(`SELECT COUNT(*) as count FROM event_duty_devices WHERE readiness_status = 'ready' AND event_id = ?`, [eventId]);
    const liveDevicesRes = await queryOne(`SELECT COUNT(*) as count FROM event_duty_devices WHERE live_connection_status = 'connected' AND event_id = ?`, [eventId]);

    const activeAssignments = await query(`
      SELECT a.*, u.full_name, u.role as user_role
      FROM event_duty_assignments a
      JOIN users u ON a.user_id = u.id
      WHERE a.event_id = ? AND a.status != 'cancelled'
    `, [eventId]);

    const dutyStatuses = await query('SELECT * FROM user_duty_status');
    const dutyMap = new Map(dutyStatuses.map((d: any) => [d.user_id, d]));

    const devices = await query('SELECT * FROM event_duty_devices WHERE event_id = ?', [eventId]);
    const userDevicesMap = new Map<string, any[]>();
    for (const d of devices) {
      if (!userDevicesMap.has(d.user_id)) {
        userDevicesMap.set(d.user_id, []);
      }
      userDevicesMap.get(d.user_id)!.push(d);
    }

    const categoriesList = [
      { key: 'child_care', name: 'General Child Care Concern' },
      { key: 'medical_support', name: 'Medical or First Aid Support' },
      { key: 'pickup_issue', name: 'Pickup Concern' },
      { key: 'pass_issue', name: 'Pass/Check-in Concern' },
      { key: 'security_concern', name: 'Security / Missing Child Concerns' },
      { key: 'location_support', name: 'Room/Classroom Assistance' },
      { key: 'other', name: 'General Help' }
    ];

    const resultCategories = [];
    let uncoveredCount = 0;

    for (const cat of categoriesList) {
      // Find rules
      let rule = await queryOne(`SELECT id FROM alert_routing_rules WHERE event_id = ? AND category_key = ? AND is_active = 1 LIMIT 1`, [eventId, cat.key]);
      let ruleRecs = [];
      if (rule) {
        ruleRecs = await query('SELECT * FROM alert_routing_recipients WHERE routing_rule_id = ?', [rule.id]);
      } else {
        const defaults: Record<string, string[]> = {
          medical_support: ['First Aid Team', 'Care Lead'],
          security_concern: ['Security Lead', 'Event Admin'],
          pickup_issue: ['Pickup Lead'],
          pass_issue: ['Gate/Check-in Lead'],
          location_support: ['Room/Group Lead', 'Care Lead'],
          child_care: ['Care Lead'],
          other: ['General Response']
        };
        const backVars = { medical_support: ['General Response'], security_concern: ['General Response'], pickup_issue: ['Care Lead'] } as any;
        const roles = defaults[cat.key] || ['General Response'];
        const backupRoles = backVars[cat.key] || [];

        ruleRecs = [
          ...roles.map((r, i) => ({ recipient_type: 'role', responsibility_key: r, delivery_tier: 'primary' })),
          ...backupRoles.map((r, i) => ({ recipient_type: 'role', responsibility_key: r, delivery_tier: 'backup' }))
        ];
      }

      const primaryResponders: any[] = [];
      const backupResponders: any[] = [];
      const supervisoryRecipients: any[] = [];

      let hasReadyPrimaryDevice = false;
      let hasLivePrimaryConnection = false;

      for (const rec of ruleRecs) {
        if (rec.recipient_type === 'role' && rec.responsibility_key) {
          const matched = activeAssignments.filter((a: any) => a.responsibility_key === rec.responsibility_key);
          for (const assign of matched) {
            const duty = dutyMap.get(assign.user_id);
            const uDevs = userDevicesMap.get(assign.user_id) || [];
            
            const isUnavailable = assign.status === 'temporarily_unavailable';
            const notOnDuty = duty && duty.on_duty === 0;

            const responderDetail = {
              userId: assign.user_id,
              name: assign.full_name,
              status: assign.status,
              onDuty: duty && duty.on_duty === 1,
              readyDevices: uDevs.filter((d: any) => d.readiness_status === 'ready').length
            };

            if (rec.delivery_tier === 'primary') {
              primaryResponders.push(responderDetail);
              if (!isUnavailable && !notOnDuty) {
                if (uDevs.some((d: any) => d.readiness_status === 'ready')) hasReadyPrimaryDevice = true;
                if (uDevs.some((d: any) => d.live_connection_status === 'connected')) hasLivePrimaryConnection = true;
              }
            } else if (rec.delivery_tier === 'backup') {
              backupResponders.push(responderDetail);
            } else {
              supervisoryRecipients.push(responderDetail);
            }
          }
        }
      }

      // Coverage status logic
      let coverageStatus = 'Not covered';
      let gap = null;
      let action = null;

      if (primaryResponders.length > 0) {
        if (primaryResponders.some(r => r.status === 'on_duty')) {
          if (hasReadyPrimaryDevice && hasLivePrimaryConnection) {
            coverageStatus = 'Covered';
          } else {
            coverageStatus = 'Limited';
            gap = 'Primary responders are online but have connection or readiness limitations.';
            action = 'Send readiness reminder';
          }
        } else {
          coverageStatus = 'Limited';
          gap = 'Primary responders are assigned but not currently on duty.';
          action = 'Ask responder to start duty';
        }
      } else if (backupResponders.length > 0) {
        coverageStatus = 'Covered with backup only';
        gap = 'No primary responder is assigned or on duty.';
        action = 'Assign a primary responder';
      } else {
        coverageStatus = 'Not covered';
        gap = 'No eligible primary or backup responders are assigned.';
        action = 'Assign a primary responder';
        uncoveredCount++;
      }

      resultCategories.push({
        categoryKey: cat.key,
        categoryName: cat.name,
        status: coverageStatus,
        primaryResponders,
        backupResponders,
        supervisoryRecipients,
        readyDevicesCount: primaryResponders.reduce((sum, r) => sum + r.readyDevices, 0),
        liveConnectionState: hasLivePrimaryConnection ? 'connected' : 'disconnected',
        pushFallbackState: 'enabled',
        identifiedGap: gap,
        recommendedAction: action
      });
    }

    let overallStatus = 'Ready for event response';
    if (uncoveredCount > 0) {
      overallStatus = 'Action needed before event';
    } else if (resultCategories.some(c => c.status === 'Limited' || c.status === 'Covered with backup only')) {
      overallStatus = 'Ready with coverage limitations';
    }

    return res.json({
      success: true,
      event: {
        name: 'The General Assembly'
      },
      summary: {
        overallStatus,
        onDutyPeople: onDutyCountRes?.count || 0,
        readyDevices: readyDevicesRes?.count || 0,
        liveDevices: liveDevicesRes?.count || 0,
        uncoveredCategories: uncoveredCount
      },
      categories: resultCategories
    });
  } catch (err: any) {
    console.error('Error fetching coverage report:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================
// PHASE 6: VOLUNTEER & DUTY LOCATIONS ENDPOINTS
// ==============================================

// 1. Get active event locations
dutyRouter.get('/locations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string || '1');
    const limit = parseInt(req.query.limit as string || '100');
    const search = (req.query.search as string || '').trim().toLowerCase();
    const type = req.query.type as string || '';

    let queryStr = 'SELECT * FROM event_locations WHERE event_id = ? AND is_active = 1';
    const params: any[] = [REAL_EVENT_ID];

    if (type) {
      queryStr += ' AND location_type = ?';
      params.push(type);
    }

    const allLocations = await query(queryStr, params);

    // Build path labels
    const locMap = new Map<string, any>();
    for (const loc of allLocations) {
      locMap.set(loc.id, loc);
    }

    const getFullPath = (locId: string): string => {
      const pathParts: string[] = [];
      let currentId: string | null = locId;
      const visited = new Set<string>();
      while (currentId) {
        if (visited.has(currentId)) break;
        visited.add(currentId);
        const current = locMap.get(currentId);
        if (current) {
          pathParts.unshift(current.name);
          currentId = current.parent_location_id;
        } else {
          break;
        }
      }
      return pathParts.join(' › ');
    };

    let items = allLocations.map(loc => {
      return {
        id: loc.id,
        eventId: loc.event_id,
        parentLocationId: loc.parent_location_id,
        type: loc.location_type,
        name: loc.name,
        shortName: loc.short_name,
        description: loc.description,
        instructions: loc.instructions,
        capacity: loc.capacity,
        ageGroupKey: loc.age_group_key,
        teamKey: loc.team_key,
        emergencyLabel: loc.emergency_label,
        sortOrder: loc.sort_order,
        isActive: !!loc.is_active,
        pathLabel: getFullPath(loc.id)
      };
    });

    if (search) {
      items = items.filter(item =>
        item.name.toLowerCase().includes(search) ||
        (item.shortName && item.shortName.toLowerCase().includes(search)) ||
        item.pathLabel.toLowerCase().includes(search) ||
        item.type.toLowerCase().includes(search)
      );
    }

    items.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.pathLabel.localeCompare(b.pathLabel);
    });

    const total = items.length;
    const totalPages = Math.ceil(total / limit);
    const startIdx = (page - 1) * limit;
    const paginatedItems = items.slice(startIdx, startIdx + limit);

    return res.json({
      success: true,
      items: paginatedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (err: any) {
    console.error('Error fetching volunteer duty locations:', err);
    return res.status(500).json({ error: 'Failed to retrieve event locations' });
  }
});

// 2. Get current active duty location presence
dutyRouter.get('/current-location', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const presence = await queryOne(`
      SELECT p.*, el.name, el.location_type, el.sort_order, el.instructions
      FROM event_duty_location_presence p
      JOIN event_locations el ON p.event_location_id = el.id
      WHERE p.user_id = ? AND p.ended_at IS NULL AND p.event_id = ?
    `, [userId, REAL_EVENT_ID]);

    if (!presence) {
      return res.json({ success: true, presence: null });
    }

    // Build path label
    const allLocations = await query('SELECT * FROM event_locations WHERE event_id = ?', [REAL_EVENT_ID]);
    const locMap = new Map<string, any>();
    for (const loc of allLocations) {
      locMap.set(loc.id, loc);
    }

    const getFullPath = (locId: string): string => {
      const pathParts: string[] = [];
      let currentId: string | null = locId;
      const visited = new Set<string>();
      while (currentId) {
        if (visited.has(currentId)) break;
        visited.add(currentId);
        const current = locMap.get(currentId);
        if (current) {
          pathParts.unshift(current.name);
          currentId = current.parent_location_id;
        } else {
          break;
        }
      }
      return pathParts.join(' › ');
    };

    return res.json({
      success: true,
      presence: {
        id: presence.id,
        locationId: presence.event_location_id,
        name: presence.name,
        type: presence.location_type,
        instructions: presence.instructions,
        source: presence.source,
        startedAt: presence.started_at,
        pathLabel: getFullPath(presence.event_location_id)
      }
    });
  } catch (err: any) {
    console.error('Error fetching current duty location:', err);
    return res.status(500).json({ error: 'Failed to retrieve current duty location' });
  }
});

// 3. Set current active duty location presence (manual selection or QR scan verification)
dutyRouter.post('/current-location', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { locationId, scannedToken, source } = req.body;
    let resolvedLocationId = locationId;
    let resolvedSource = source || 'selected';

    if (scannedToken) {
      // Look up and verify QR code token
      const code = await queryOne('SELECT * FROM event_location_codes WHERE token_hash = ? AND is_active = 1', [scannedToken]);
      if (!code) {
        return res.status(400).json({ success: false, error: 'This location code could not be verified.' });
      }
      resolvedLocationId = code.event_location_id;
      resolvedSource = 'scanned';
    }

    if (!resolvedLocationId) {
      return res.status(400).json({ success: false, error: 'Location ID or scanned token is required.' });
    }

    // Verify location is active and belongs to REAL_EVENT_ID
    const loc = await queryOne('SELECT * FROM event_locations WHERE id = ? AND event_id = ? AND is_active = 1', [resolvedLocationId, REAL_EVENT_ID]);
    if (!loc) {
      return res.status(400).json({ success: false, error: 'The selected location is invalid or no longer active.' });
    }

    const now = new Date().toISOString();

    // End previous active presence sessions for this user
    await execute('UPDATE event_duty_location_presence SET ended_at = ? WHERE user_id = ? AND ended_at IS NULL AND event_id = ?', [now, userId, REAL_EVENT_ID]);

    // Create new active presence
    const presenceId = 'pres-' + crypto.randomBytes(8).toString('hex');
    await execute(`
      INSERT INTO event_duty_location_presence (
        id, event_id, user_id, duty_device_id, event_location_id, source, started_at, ended_at, updated_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, ?)
    `, [presenceId, REAL_EVENT_ID, userId, resolvedLocationId, resolvedSource, now, now]);

    // Broadcast SSE change for admin/team view sync
    broadcastSSEEvent('duty_presence_changed', { eventId: REAL_EVENT_ID, userId, locationId: resolvedLocationId });

    return res.json({
      success: true,
      presence: {
        id: presenceId,
        locationId: resolvedLocationId,
        name: loc.name,
        type: loc.location_type,
        instructions: loc.instructions,
        source: resolvedSource,
        startedAt: now
      }
    });
  } catch (err: any) {
    console.error('Error setting current duty location:', err);
    return res.status(500).json({ success: false, error: 'Failed to set current duty location' });
  }
});

// 4. End current active duty location presence (Clear)
dutyRouter.delete('/current-location', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const now = new Date().toISOString();
    await execute('UPDATE event_duty_location_presence SET ended_at = ? WHERE user_id = ? AND ended_at IS NULL AND event_id = ?', [now, userId, REAL_EVENT_ID]);

    broadcastSSEEvent('duty_presence_changed', { eventId: REAL_EVENT_ID, userId, locationId: null });

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error clearing current duty location:', err);
    return res.status(500).json({ error: 'Failed to clear current duty location' });
  }
});

// 5. Verify a scanned QR token
dutyRouter.post('/location-code/verify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Location code token is required' });
    }

    const code = await queryOne('SELECT * FROM event_location_codes WHERE token_hash = ? AND is_active = 1', [token]);
    if (!code) {
      return res.status(400).json({ success: false, error: 'This location code could not be verified.' });
    }

    const loc = await queryOne('SELECT * FROM event_locations WHERE id = ? AND event_id = ? AND is_active = 1', [code.event_location_id, REAL_EVENT_ID]);
    if (!loc) {
      return res.status(400).json({ success: false, error: 'This location is no longer active.' });
    }

    // Build path label
    const allLocations = await query('SELECT * FROM event_locations WHERE event_id = ?', [REAL_EVENT_ID]);
    const locMap = new Map<string, any>();
    for (const l of allLocations) {
      locMap.set(l.id, l);
    }

    const getFullPath = (locId: string): string => {
      const pathParts: string[] = [];
      let currentId: string | null = locId;
      const visited = new Set<string>();
      while (currentId) {
        if (visited.has(currentId)) break;
        visited.add(currentId);
        const current = locMap.get(currentId);
        if (current) {
          pathParts.unshift(current.name);
          currentId = current.parent_location_id;
        } else {
          break;
        }
      }
      return pathParts.join(' › ');
    };

    return res.json({
      success: true,
      location: {
        id: loc.id,
        name: loc.name,
        type: loc.location_type,
        instructions: loc.instructions,
        description: loc.description,
        pathLabel: getFullPath(loc.id)
      }
    });
  } catch (err: any) {
    console.error('Error verifying location code:', err);
    return res.status(500).json({ success: false, error: 'Internal server error verifying location code' });
  }
});

export { dutyRouter, adminDutyRouter };
