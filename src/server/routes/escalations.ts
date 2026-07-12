import { Router, Response } from 'express';
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

// Validate that only admin/superadmin can manage policies and view logs
function verifyAdmin(req: AuthenticatedRequest, res: Response, next: any) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
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

export default router;
