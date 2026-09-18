import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../../auth';
import { getCurrentEvent } from '../../services/eventService';
import {
  evaluateCurrentEventAutomations,
  getAutomationEngineHealth
} from '../../services/operations/automation/automationEngine';
import {
  acknowledgeAutomation,
  dismissAutomation,
  getAutomationById,
  getAutomationsForEvent,
  getAutomationSettingsForEvent,
  setAutomationRuleEnabled
} from '../../services/operations/automation/automationPersistence';
import { PHASE3B_AUTOMATION_RULES } from '../../services/operations/automation/ruleModel';
import { operationsActionRegistry } from '../../services/operations/actions';
import { ActionKey } from '../../services/operations/actions/types';

export const automationsRouter = Router();

function isAuthorizedForSafety(role?: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: () => void) {
  if (!req.user || !['admin', 'super_admin', 'team'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Unauthorized: Admin access required.' });
  }
  next();
}

/**
 * GET /api/admin/automations
 * Returns active and resolved automations for the canonical CURRENT EVENT.
 * Strictly respects safety permissions and current event isolation.
 */
automationsRouter.get('/', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const event = await getCurrentEvent();
    if (!event) {
      return res.json({
        success: true,
        eventId: null,
        active: [],
        resolved: [],
        health: getAutomationEngineHealth()
      });
    }

    const includeSafety = isAuthorizedForSafety(req.user?.role);

    // If evaluate=true in query, or if no automations exist yet for this event, run evaluation
    if (req.query.evaluate === 'true') {
      await evaluateCurrentEventAutomations(event.id);
    } else {
      const existing = await getAutomationsForEvent(event.id, { limit: 1 });
      if (existing.length === 0) {
        await evaluateCurrentEventAutomations(event.id);
      }
    }

    const [active, resolved] = await Promise.all([
      getAutomationsForEvent(event.id, { status: 'active', includeSafety, limit: 50 }),
      getAutomationsForEvent(event.id, { status: 'resolved', includeSafety, limit: 20 })
    ]);

    res.json({
      success: true,
      eventId: event.id,
      eventTitle: event.title,
      active,
      resolved,
      health: getAutomationEngineHealth()
    });
  } catch (err: any) {
    console.error('Error fetching event automations:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve event automations.' });
  }
});

/**
 * POST /api/admin/automations/evaluate
 * Triggers a server-side evaluation cycle for the canonical CURRENT EVENT.
 */
automationsRouter.post('/evaluate', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetEventId = req.body.eventId as string | undefined;
    const result = await evaluateCurrentEventAutomations(targetEventId);
    res.json({ success: true, result });
  } catch (err: any) {
    console.error('Error triggering automation evaluation:', err);
    res.status(500).json({ success: false, error: 'Failed to evaluate event automations.' });
  }
});

/**
 * POST /api/admin/automations/:id/acknowledge
 * Acknowledges an automation item and applies cooldown.
 */
automationsRouter.post('/:id/acknowledge', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const cooldownMinutes = typeof req.body.cooldownMinutes === 'number' ? req.body.cooldownMinutes : 60;

    const event = await getCurrentEvent();
    if (!event) {
      return res.status(404).json({ success: false, error: 'No active event found.' });
    }

    const existing = await getAutomationById(id, event.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Automation item not found.' });
    }

    if (existing.signal_type === 'SAFETY_ITEM_OPEN' && !isAuthorizedForSafety(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'Access denied: Safety permissions required.' });
    }

    await acknowledgeAutomation(id, event.id, cooldownMinutes);
    res.json({ success: true, message: 'Automation acknowledged.' });
  } catch (err: any) {
    console.error('Error acknowledging automation:', err);
    res.status(500).json({ success: false, error: 'Failed to acknowledge automation.' });
  }
});

/**
 * POST /api/admin/automations/:id/dismiss
 * Dismisses an automation item with cooldown.
 */
automationsRouter.post('/:id/dismiss', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const cooldownMinutes = typeof req.body.cooldownMinutes === 'number' ? req.body.cooldownMinutes : 120;

    const event = await getCurrentEvent();
    if (!event) {
      return res.status(404).json({ success: false, error: 'No active event found.' });
    }

    const existing = await getAutomationById(id, event.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Automation item not found.' });
    }

    if (existing.signal_type === 'SAFETY_ITEM_OPEN' && !isAuthorizedForSafety(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'Access denied: Safety permissions required.' });
    }

    await dismissAutomation(id, event.id, cooldownMinutes);
    res.json({ success: true, message: 'Automation dismissed.' });
  } catch (err: any) {
    console.error('Error dismissing automation:', err);
    res.status(500).json({ success: false, error: 'Failed to dismiss automation.' });
  }
});

/**
 * GET /api/admin/automations/settings
 * Retrieves rule enablement settings for the current event.
 */
automationsRouter.get('/settings', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const event = await getCurrentEvent();
    if (!event) {
      return res.json({ success: true, settings: [] });
    }

    const settingsMap = await getAutomationSettingsForEvent(event.id);
    const rules = PHASE3B_AUTOMATION_RULES.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      triggerSignal: r.triggerSignal,
      isEnabled: settingsMap.has(r.id) ? settingsMap.get(r.id)! : r.isEnabled,
      isMandatory: !!r.isMandatory,
      defaultCooldownMinutes: r.defaultCooldownMinutes
    }));

    res.json({ success: true, rules });
  } catch (err: any) {
    console.error('Error retrieving automation settings:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve automation settings.' });
  }
});

/**
 * POST /api/admin/automations/settings
 * Updates rule enablement for the current event.
 */
automationsRouter.post('/settings', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthorizedForSafety(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'Access denied: Administrator permissions required to update automation settings.' });
    }

    const { ruleId, isEnabled } = req.body;
    if (!ruleId || typeof isEnabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'ruleId and isEnabled are required.' });
    }

    const event = await getCurrentEvent();
    if (!event) {
      return res.status(404).json({ success: false, error: 'No active event found.' });
    }

    const ok = await setAutomationRuleEnabled(event.id, ruleId, isEnabled, req.user?.id);
    if (!ok) {
      return res.status(400).json({ success: false, error: 'Mandatory safety rules cannot be disabled.' });
    }

    res.json({ success: true, message: 'Settings updated.' });
  } catch (err: any) {
    console.error('Error updating automation settings:', err);
    res.status(500).json({ success: false, error: 'Failed to update automation settings.' });
  }
});

/**
 * POST /api/admin/automations/prepare-action
 * Prepares a Phase 3A confirmed action preview for a linked automation item.
 * Strictly human-confirmed: DOES NOT execute action!
 */
automationsRouter.post('/prepare-action', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { actionKey, automationId, params } = req.body;
    if (!actionKey || typeof actionKey !== 'string') {
      return res.status(400).json({ success: false, error: 'actionKey is required.' });
    }

    const event = await getCurrentEvent();
    if (!event) {
      return res.status(404).json({ success: false, error: 'No active event found.' });
    }

    if (automationId) {
      const existing = await getAutomationById(automationId, event.id);
      if (existing && existing.signal_type === 'SAFETY_ITEM_OPEN' && !isAuthorizedForSafety(req.user?.role)) {
        return res.status(403).json({ success: false, error: 'Access denied: Safety permissions required.' });
      }
    }

    const actor = req.user ? { id: req.user.id, role: req.user.role } : { id: 'admin-actor', role: 'admin' };
    const context = { eventId: event.id, actor };

    // Action preparation through canonical Phase 3A registry
    const result = await operationsActionRegistry.prepareActionPreview(
      actionKey as ActionKey,
      context,
      params
    );

    res.json({ success: true, result });
  } catch (err: any) {
    console.error('Error preparing confirmed action preview:', err);
    res.status(500).json({ success: false, error: 'Failed to prepare action preview.' });
  }
});

export default automationsRouter;
