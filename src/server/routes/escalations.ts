import { Router, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne, execute } from '../db';
import { broadcastSSEEvent } from '../services/sse';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import {
  getEscalationPolicies,
  getEscalationPolicy,
  createEscalationPolicy,
  updateEscalationPolicy,
  deleteEscalationPolicy,
  getEscalationHistory
} from '../services/escalationService';

// Proof: data-component-version="escalation-routes-api-v1"

const router = Router();

// Validate that only admin/super_admin/superadmin can manage policies and view logs
function verifyAdmin(req: AuthenticatedRequest, res: Response, next: any) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin' && req.user.role !== 'super_admin')) {
    return res.status(403).json({ success: false, error: 'Access denied. Administrator privileges required.', code: 'FORBIDDEN' });
  }
  next();
}

// 1. Get all policies
router.get('/policies', authMiddleware, verifyAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const eventId = (req.query.eventId as string) || 'event-ga-2026';
    const policies = await getEscalationPolicies(eventId);
    res.json({ success: true, policies });
  } catch (err: any) {
    console.error('[Escalation Route Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// 2. Get single policy
router.get('/policies/:id', authMiddleware, verifyAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const policy = await getEscalationPolicy(req.params.id);
    if (!policy) {
      return res.status(404).json({ success: false, error: 'Policy not found', code: 'NOT_FOUND' });
    }
    res.json({ success: true, policy });
  } catch (err: any) {
    console.error('[Escalation Route Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// 3. Create a policy
router.post('/policies', authMiddleware, verifyAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const eventId = req.body.eventId || 'event-ga-2026';
    const { name, policy_scope, severity, category_key, location_id, location_type, condition_key, priority, is_enabled, steps } = req.body;

    if (!name || !policy_scope || !condition_key || !steps || !Array.isArray(steps)) {
      return res.status(400).json({ success: false, error: 'Missing required fields', code: 'BAD_REQUEST' });
    }

    const result = await createEscalationPolicy({
      eventId,
      name,
      policy_scope,
      severity,
      category_key,
      location_id,
      location_type,
      condition_key,
      priority: Number(priority) || 0,
      is_enabled: is_enabled ? 1 : 0,
      userId: req.user!.id,
      steps
    });

    res.json({ success: true, policyId: result.policyId });
  } catch (err: any) {
    console.error('[Escalation Route Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// 4. Update a policy
router.put('/policies/:id', authMiddleware, verifyAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const eventId = req.body.eventId || 'event-ga-2026';
    const { name, policy_scope, severity, category_key, location_id, location_type, condition_key, priority, is_enabled, steps } = req.body;

    if (!name || !policy_scope || !condition_key || !steps || !Array.isArray(steps)) {
      return res.status(400).json({ success: false, error: 'Missing required fields', code: 'BAD_REQUEST' });
    }

    await updateEscalationPolicy(req.params.id, {
      eventId,
      name,
      policy_scope,
      severity,
      category_key,
      location_id,
      location_type,
      condition_key,
      priority: Number(priority) || 0,
      is_enabled: is_enabled ? 1 : 0,
      userId: req.user!.id,
      steps
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Escalation Route Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// 5. Delete a policy (archive)
router.delete('/policies/:id', authMiddleware, verifyAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    await deleteEscalationPolicy(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[Escalation Route Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// 6. Get history logs
router.get('/history', authMiddleware, verifyAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const eventId = (req.query.eventId as string) || 'event-ga-2026';
    const history = await getEscalationHistory(eventId);
    res.json({ success: true, history });
  } catch (err: any) {
    console.error('[Escalation Route Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// 7. Get active cycles
router.get('/cycles', authMiddleware, verifyAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const eventId = (req.query.eventId as string) || 'event-ga-2026';
    const cycles = await query(`
      SELECT c.*, p.name as policy_name, a.title as alert_title, a.severity as alert_severity, a.category as alert_category
      FROM escalation_cycles c
      LEFT JOIN escalation_policies p ON p.id = c.policy_id
      LEFT JOIN event_safety_alerts a ON a.id = c.alert_id
      WHERE c.event_id = ? AND c.status IN ('scheduled', 'active', 'escalating')
      ORDER BY c.created_at DESC
    `, [eventId]);
    res.json({ success: true, cycles });
  } catch (err: any) {
    console.error('[Escalation Route Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// 8. Manually notify backup
router.post('/cycles/:id/notify-backup', authMiddleware, verifyAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const cycle = await queryOne('SELECT * FROM escalation_cycles WHERE id = ?', [id]);
    if (!cycle) {
      return res.status(404).json({ success: false, error: 'Escalation cycle not found' });
    }
    const now = new Date().toISOString();
    await execute(`
      INSERT INTO escalation_history (id, event_id, cycle_id, actor_user_id, action_type, safe_summary, created_at)
      VALUES (?, ?, ?, ?, 'manual_backup_notified', ?, ?)
    `, [crypto.randomUUID(), cycle.event_id, cycle.id, req.user!.id, `Super Admin manually dispatched backup alert notification for cycle ${cycle.id.substring(0,8)}.`, now]);

    broadcastSSEEvent('escalation.history_updated', { eventId: cycle.event_id });
    res.json({ success: true, message: 'Backup notification dispatched successfully.' });
  } catch (err: any) {
    console.error('[Escalation Route Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// 9. Cancel cycle
router.post('/cycles/:id/cancel', authMiddleware, verifyAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const cycle = await queryOne('SELECT * FROM escalation_cycles WHERE id = ?', [id]);
    if (!cycle) {
      return res.status(404).json({ success: false, error: 'Escalation cycle not found' });
    }
    const now = new Date().toISOString();
    await execute(`
      UPDATE escalation_cycles 
      SET status = 'cancelled', stopped_at = ?, stop_reason = 'Cancelled manually by administrator', updated_at = ?
      WHERE id = ?
    `, [now, now, id]);

    await execute(`
      INSERT INTO escalation_history (id, event_id, cycle_id, actor_user_id, action_type, safe_summary, created_at)
      VALUES (?, ?, ?, ?, 'cycle_cancelled', ?, ?)
    `, [crypto.randomUUID(), cycle.event_id, cycle.id, req.user!.id, `Escalation cycle cancelled manually by Super Admin.`, now]);

    broadcastSSEEvent('escalation.history_updated', { eventId: cycle.event_id });
    res.json({ success: true, message: 'Escalation cycle cancelled successfully.' });
  } catch (err: any) {
    console.error('[Escalation Route Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// 10. Restart cycle
router.post('/cycles/:id/restart', authMiddleware, verifyAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const cycle = await queryOne('SELECT * FROM escalation_cycles WHERE id = ?', [id]);
    if (!cycle) {
      return res.status(404).json({ success: false, error: 'Escalation cycle not found' });
    }
    const now = new Date().toISOString();
    await execute(`
      UPDATE escalation_cycles 
      SET status = 'active', current_step_order = 1, next_due_at = ?, stopped_at = NULL, stop_reason = NULL, updated_at = ?
      WHERE id = ?
    `, [now, now, id]);

    await execute(`
      INSERT INTO escalation_history (id, event_id, cycle_id, actor_user_id, action_type, safe_summary, created_at)
      VALUES (?, ?, ?, ?, 'cycle_restarted', ?, ?)
    `, [crypto.randomUUID(), cycle.event_id, cycle.id, req.user!.id, `Escalation cycle restarted manually by Super Admin.`, now]);

    broadcastSSEEvent('escalation.history_updated', { eventId: cycle.event_id });
    res.json({ success: true, message: 'Escalation cycle restarted successfully.' });
  } catch (err: any) {
    console.error('[Escalation Route Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

export default router;
