import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import {
  previewCompletionReminder,
  sendCompletionReminder,
  sendWhatsAppNudge,
  sendApplicationRecoveryReminder,
  ApplicationReminderError
} from '../services/applicationReminderService';

export const applicationRemindersRouter = Router();

// 1. Strict Authentication & Admin Authorization
applicationRemindersRouter.use(authMiddleware);

applicationRemindersRouter.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Authentication required'
    });
  }

  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      error: 'Admin or Super Admin access required'
    });
  }

  next();
});

function handleReminderError(err: any, res: Response) {
  if (err instanceof ApplicationReminderError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      error: err.message,
      ...(err.metadata ? { metadata: err.metadata } : {})
    });
  }
  console.error('[applicationReminders Route Error]:', err);
  return res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    error: 'Internal server error'
  });
}

/**
 * GET /api/admin/applications/:entryId/completion-reminder
 * Previews the completion reminder context, prefilled body, and cooldown status.
 */
applicationRemindersRouter.get('/:entryId/completion-reminder', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const result = await previewCompletionReminder(req.params.entryId, req.user!);
    return res.json({
      success: true,
      ...result
    });
  } catch (err) {
    return handleReminderError(err, res);
  }
});

/**
 * POST /api/admin/applications/:entryId/completion-reminder
 * Dispatches an authoritative application completion reminder to the parent.
 * Supports channel: 'portal' | 'whatsapp' | 'both'.
 */
applicationRemindersRouter.post('/:entryId/completion-reminder', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { body, channel, whatsappBody } = req.body || {};
    const result = await sendApplicationRecoveryReminder({
      entryId: req.params.entryId,
      adminUserId: req.user!.id,
      adminRole: req.user!.role,
      channel: channel || 'portal',
      customBody: body,
      whatsappBody
    });
    return res.status(201).json({
      success: true,
      ...result
    });
  } catch (err) {
    return handleReminderError(err, res);
  }
});
