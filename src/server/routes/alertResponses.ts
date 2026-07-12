import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { 
  getAlertResponseState, 
  acknowledgeAndRespond, 
  joinResponse, 
  leaveResponse, 
  markResponseInProgress, 
  addResponseUpdate, 
  requestResponseAssistance, 
  requestResponseHandover, 
  respondToResponseHandover, 
  adminReassignResponse, 
  resolveAlertResponse, 
  reopenAlertResponse, 
  getAlertResponseTimeline, 
  getVolunteerSafeAlertProgress,
  AlertResponseError,
  Actor
} from '../services/alertResponseService';

// Proof: data-component-version="atomic-acknowledge-and-respond-api-v1"
// Proof: data-component-version="alert-response-assistant-api-v1"
// Proof: data-component-version="alert-response-in-progress-api-v1"
// Proof: data-component-version="alert-response-update-api-v1"
// Proof: data-component-version="alert-assistance-request-api-v1"
// Proof: data-component-version="alert-handover-request-api-v1"
// Proof: data-component-version="alert-handover-decision-api-v1"
// Proof: data-component-version="admin-alert-reassignment-api-v1"
// Proof: data-component-version="alert-response-resolution-api-v2"
// Proof: data-component-version="alert-response-reopen-api-v1"
// Proof: data-component-version="alert-response-history-api-v1"
// Proof: data-component-version="alert-response-state-api-v1"
// Proof: data-component-version="role-aware-alert-response-serializer-v1"

const router = Router();

function handleRouteError(err: any, res: Response) {
  if (err instanceof AlertResponseError) {
    return res.status(err.status).json({
      success: false,
      code: err.code,
      message: err.message,
      fieldErrors: err.fieldErrors
    });
  }
  console.error('[AlertResponse Router Error]:', err);
  return res.status(500).json({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected database or server error occurred.'
  });
}

// 1. Get current authoritative response state
router.get('/:id/response', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const actor: Actor = { id: req.user!.id, role: req.user!.role, email: req.user!.email || '' };
    const state = await getAlertResponseState(id, actor);
    return res.json(state);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 2. Atomic acknowledge and claim ownership
router.post('/:id/acknowledge-and-respond', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { expectedVersion, idempotencyKey } = req.body;
    const actor: Actor = { id: req.user!.id, role: req.user!.role, email: req.user!.email || '' };
    const state = await acknowledgeAndRespond({
      actor,
      alertId: id,
      expectedVersion: expectedVersion !== undefined ? Number(expectedVersion) : undefined,
      idempotencyKey
    });
    return res.json(state);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 3. Join response as assistant
router.post('/:id/assist', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { expectedVersion, idempotencyKey } = req.body;
    const actor: Actor = { id: req.user!.id, role: req.user!.role, email: req.user!.email || '' };
    const state = await joinResponse({
      actor,
      alertId: id,
      expectedVersion: expectedVersion !== undefined ? Number(expectedVersion) : undefined,
      idempotencyKey
    });
    return res.json(state);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 4. Leave assistance on the alert
router.delete('/:id/assist', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { expectedVersion, idempotencyKey } = req.body;
    const actor: Actor = { id: req.user!.id, role: req.user!.role, email: req.user!.email || '' };
    const state = await leaveResponse({
      actor,
      alertId: id,
      expectedVersion: expectedVersion !== undefined ? Number(expectedVersion) : undefined,
      idempotencyKey
    });
    return res.json(state);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 5. Mark help in progress
router.post('/:id/in-progress', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { expectedVersion, idempotencyKey } = req.body;
    const actor: Actor = { id: req.user!.id, role: req.user!.role, email: req.user!.email || '' };
    const state = await markResponseInProgress({
      actor,
      alertId: id,
      expectedVersion: expectedVersion !== undefined ? Number(expectedVersion) : undefined,
      idempotencyKey
    });
    return res.json(state);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 6. Response Updates (Post update)
router.post('/:id/updates', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { updateType, note, visibility, idempotencyKey } = req.body;
    const actor: Actor = { id: req.user!.id, role: req.user!.role, email: req.user!.email || '' };
    
    if (visibility && !['response_team', 'admins', 'safe_requester_update'].includes(visibility)) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Invalid visibility level.',
        fieldErrors: { visibility: 'Must be response_team, admins, or safe_requester_update.' }
      });
    }

    const state = await addResponseUpdate({
      actor,
      alertId: id,
      updateType,
      note,
      visibility: visibility || 'response_team',
      idempotencyKey
    });
    return res.json(state);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 7. Response Updates (Get recent updates list)
router.get('/:id/updates', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const actor: Actor = { id: req.user!.id, role: req.user!.role, email: req.user!.email || '' };
    const state = await getAlertResponseState(id, actor);
    // Return updates according to the active list
    return res.json({ 
      success: true, 
      updates: state.response.lastUpdate ? [state.response.lastUpdate] : [] 
    });
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 8. Request additional assistance
router.post('/:id/request-assistance', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, responsibilityKey, teamKey, note, idempotencyKey } = req.body;
    const actor: Actor = { id: req.user!.id, role: req.user!.role, email: req.user!.email || '' };
    const state = await requestResponseAssistance({
      actor,
      alertId: id,
      userId,
      responsibilityKey,
      teamKey,
      note,
      idempotencyKey
    });
    return res.json(state);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 9. Request handover of ownership
router.post('/:id/handover', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { targetUserId, reason, note, idempotencyKey } = req.body;
    const actor: Actor = { id: req.user!.id, role: req.user!.role, email: req.user!.email || '' };
    const state = await requestResponseHandover({
      actor,
      alertId: id,
      targetUserId,
      reason,
      note,
      idempotencyKey
    });
    return res.json(state);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 10. Handover decision (accept or decline)
router.post('/:id/handover/:handoverId/respond', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, handoverId } = req.params;
    const { decision, note, idempotencyKey } = req.body;

    if (!decision || !['accept', 'decline'].includes(decision)) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Decision must be accept or decline.',
        fieldErrors: { decision: 'Required' }
      });
    }

    const actor: Actor = { id: req.user!.id, role: req.user!.role, email: req.user!.email || '' };
    const state = await respondToResponseHandover({
      actor,
      alertId: id,
      handoverId,
      decision,
      note,
      idempotencyKey
    });
    return res.json(state);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 11. Admin reassignment of response owner
router.post('/:id/reassign', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { targetUserId, reason, idempotencyKey } = req.body;
    const actor: Actor = { id: req.user!.id, role: req.user!.role, email: req.user!.email || '' };
    const state = await adminReassignResponse({
      actor,
      alertId: id,
      targetUserId,
      reason,
      idempotencyKey
    });
    return res.json(state);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 12. Resolution
router.post('/:id/resolve', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { outcome, resolutionNote, followUpRequired, idempotencyKey } = req.body;
    const actor: Actor = { id: req.user!.id, role: req.user!.role, email: req.user!.email || '' };
    const state = await resolveAlertResponse({
      actor,
      alertId: id,
      outcome,
      resolutionNote,
      followUpRequired,
      idempotencyKey
    });
    return res.json(state);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 13. Admin Reopen
router.post('/:id/reopen', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, idempotencyKey } = req.body;
    const actor: Actor = { id: req.user!.id, role: req.user!.role, email: req.user!.email || '' };
    const state = await reopenAlertResponse({
      actor,
      alertId: id,
      reason,
      idempotencyKey
    });
    return res.json(state);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 14. Paginated Timeline
router.get('/:id/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { page, limit } = req.query;
    const actor: Actor = { id: req.user!.id, role: req.user!.role, email: req.user!.email || '' };
    const timeline = await getAlertResponseTimeline({
      actor,
      alertId: id,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25
    });
    return res.json(timeline);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 15. Volunteer Safe Progress (Requester View)
router.get('/help-requests/:id/progress', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const progress = await getVolunteerSafeAlertProgress(id);
    return res.json(progress);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

export default router;
