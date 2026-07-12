import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import {
  createIncident,
  updateIncidentDraft,
  submitIncident,
  submitChangeRequest,
  resolveChangeRequests,
  addFollowUpAction,
  completeFollowUpAction,
  updateClosureChecklist,
  closeIncident,
  reopenIncident,
  voidIncident,
  getIncidentsList,
  getIncidentHistory,
  getIncidentStats,
  getIncidentState,
  getIncidentByAlertId,
  IncidentError,
  Actor
} from '../services/incidentService';

// Proof: data-component-version="incident-routes-api-v1"

const router = Router();

// Helper to wrap authenticated actor
function getActor(req: AuthenticatedRequest): Actor {
  if (!req.user) {
    throw new IncidentError('Unauthenticated request', 'UNAUTHENTICATED', 401);
  }
  return {
    id: req.user.id,
    role: req.user.role,
    email: req.user.email,
  };
}

// Helper to handle standard errors
function handleError(res: Response, err: any) {
  if (err instanceof IncidentError) {
    return res.status(err.status).json({
      success: false,
      error: err.message,
      code: err.code,
      fieldErrors: err.fieldErrors,
    });
  }
  console.error('[Incident Routes Error]:', err);
  return res.status(500).json({
    success: false,
    error: 'An unexpected internal error occurred.',
    code: 'INTERNAL_ERROR',
  });
}

// 1. Create a new incident (draft or submitted)
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const { alertId, category, title, description, structuredData, parentContact, firstAid, security, status, idempotencyKey } = req.body;
    const result = await createIncident({
      actor,
      alertId,
      category,
      title,
      description,
      structuredData,
      parentContact,
      firstAid,
      security,
      status,
      idempotencyKey,
    });
    return res.status(201).json({ success: true, incident: result });
  } catch (err) {
    return handleError(res, err);
  }
});

// 2. Retrieve a paginated/filtered list of incidents
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const { eventId, status, category, page, limit } = req.query;
    const result = await getIncidentsList({
      actor,
      eventId: eventId as string,
      status: status as string,
      category: category as string,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

// 3. Retrieve reports / stats summary (Admin only)
router.get('/stats', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const result = await getIncidentStats(actor);
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

// 4. Retrieve incident by associated alertId
router.get('/by-alert/:alertId', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const result = await getIncidentByAlertId(req.params.alertId, actor);
    return res.json({ success: true, incident: result });
  } catch (err) {
    return handleError(res, err);
  }
});

// 5. Retrieve full details of specific incident
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const result = await getIncidentState(req.params.id, actor);
    return res.json({ success: true, incident: result });
  } catch (err) {
    return handleError(res, err);
  }
});

// 6. Retrieve immutable history log of an incident
router.get('/:id/history', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const result = await getIncidentHistory(req.params.id, actor);
    return res.json({ success: true, history: result });
  } catch (err) {
    return handleError(res, err);
  }
});

// 7. Update draft incident details
router.patch('/:id/draft', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const { expectedVersion, category, title, description, structuredData, parentContact, firstAid, security } = req.body;
    const result = await updateIncidentDraft({
      actor,
      incidentId: req.params.id,
      expectedVersion: parseInt(expectedVersion),
      category,
      title,
      description,
      structuredData,
      parentContact,
      firstAid,
      security,
    });
    return res.json({ success: true, incident: result });
  } catch (err) {
    return handleError(res, err);
  }
});

// 8. Formally submit incident for review
router.post('/:id/submit', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const { expectedVersion, category, title, description, structuredData, parentContact, firstAid, security } = req.body;
    const result = await submitIncident({
      actor,
      incidentId: req.params.id,
      expectedVersion: parseInt(expectedVersion),
      category,
      title,
      description,
      structuredData,
      parentContact,
      firstAid,
      security,
    });
    return res.json({ success: true, incident: result });
  } catch (err) {
    return handleError(res, err);
  }
});

// 9. Admin: Request changes / Change request
router.post('/:id/change-request', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const { expectedVersion, notes } = req.body;
    const result = await submitChangeRequest({
      actor,
      incidentId: req.params.id,
      expectedVersion: parseInt(expectedVersion),
      notes,
    });
    return res.json({ success: true, incident: result });
  } catch (err) {
    return handleError(res, err);
  }
});

// 10. Resolve pending change requests
router.post('/:id/resolve-change-requests', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const { expectedVersion } = req.body;
    const result = await resolveChangeRequests({
      actor,
      incidentId: req.params.id,
      expectedVersion: parseInt(expectedVersion),
    });
    return res.json({ success: true, incident: result });
  } catch (err) {
    return handleError(res, err);
  }
});

// 11. Add follow-up action item
router.post('/:id/follow-up', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const { expectedVersion, title, assignedToUserId } = req.body;
    const result = await addFollowUpAction({
      actor,
      incidentId: req.params.id,
      expectedVersion: parseInt(expectedVersion),
      title,
      assignedToUserId,
    });
    return res.json({ success: true, incident: result });
  } catch (err) {
    return handleError(res, err);
  }
});

// 12. Complete/Incomplete follow-up action item
router.post('/:id/follow-up/:actionId/complete', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const { expectedVersion, completed, completedNote } = req.body;
    const result = await completeFollowUpAction({
      actor,
      incidentId: req.params.id,
      expectedVersion: parseInt(expectedVersion),
      actionId: req.params.actionId,
      completed: !!completed,
      completedNote,
    });
    return res.json({ success: true, incident: result });
  } catch (err) {
    return handleError(res, err);
  }
});

// 13. Admin: Update closure checklist
router.post('/:id/checklist', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const { expectedVersion, checklist } = req.body;
    const result = await updateClosureChecklist({
      actor,
      incidentId: req.params.id,
      expectedVersion: parseInt(expectedVersion),
      checklist,
    });
    return res.json({ success: true, incident: result });
  } catch (err) {
    return handleError(res, err);
  }
});

// 14. Admin: Close incident
router.post('/:id/close', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const { expectedVersion, idempotencyKey } = req.body;
    const result = await closeIncident({
      actor,
      incidentId: req.params.id,
      expectedVersion: parseInt(expectedVersion),
      idempotencyKey,
    });
    return res.json({ success: true, incident: result });
  } catch (err) {
    return handleError(res, err);
  }
});

// 15. Admin: Reopen incident
router.post('/:id/reopen', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const { expectedVersion, reason, idempotencyKey } = req.body;
    const result = await reopenIncident({
      actor,
      incidentId: req.params.id,
      expectedVersion: parseInt(expectedVersion),
      reason,
      idempotencyKey,
    });
    return res.json({ success: true, incident: result });
  } catch (err) {
    return handleError(res, err);
  }
});

// 16. Admin: Void incident
router.post('/:id/void', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const { expectedVersion, reason, idempotencyKey } = req.body;
    const result = await voidIncident({
      actor,
      incidentId: req.params.id,
      expectedVersion: parseInt(expectedVersion),
      reason,
      idempotencyKey,
    });
    return res.json({ success: true, incident: result });
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
