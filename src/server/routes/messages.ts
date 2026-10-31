import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import {
  createThread,
  listThreads,
  getThread,
  getThreadMessages,
  appendMessage,
  markThreadRead,
  resolveThread,
  reopenThread,
  getUnreadCount,
  MessageDomainError
} from '../services/messageService';

function handleMessageError(err: any, res: Response) {
  if (err instanceof MessageDomainError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      error: err.message
    });
  }
  console.error('[messagesRoute Error]:', err);
  return res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    error: 'Internal server error'
  });
}

// ============================================================================
// PARENT MESSAGING ROUTER
// Mount path: /api/parent/messages
// ============================================================================
export const parentMessagesRouter = Router();
parentMessagesRouter.use(authMiddleware);

parentMessagesRouter.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, code: 'UNAUTHORIZED', error: 'Authentication required' });
  }
  if (req.user.role !== 'parent' && !req.parentProfile) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Parent access required' });
  }
  next();
});

// GET /api/parent/messages/unread-count
parentMessagesRouter.get('/unread-count', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const counts = await getUnreadCount({ userId: req.user!.id, role: 'parent' });
    return res.json({ success: true, ...counts });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// GET /api/parent/messages (List threads)
parentMessagesRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const category = req.query.category as string | undefined;
    const status = req.query.status as string | undefined;

    const result = await listThreads({
      userId: req.user!.id,
      role: 'parent',
      category,
      status,
      page,
      limit
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// POST /api/parent/messages (Create thread)
parentMessagesRouter.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category, subject, body, linkedChildId, linkedEntryId, eventId } = req.body || {};
    const result = await createThread({
      eventId,
      category,
      subject,
      body,
      creatorUserId: req.user!.id,
      creatorRole: 'parent',
      parentProfileId: req.parentProfile?.id,
      linkedChildId,
      linkedEntryId
    });
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// GET /api/parent/messages/:threadId (Thread detail)
parentMessagesRouter.get('/:threadId', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const result = await getThread({
      threadId: req.params.threadId,
      userId: req.user!.id,
      role: 'parent'
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// GET /api/parent/messages/:threadId/messages (Messages list)
parentMessagesRouter.get('/:threadId/messages', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const result = await getThreadMessages({
      threadId: req.params.threadId,
      userId: req.user!.id,
      role: 'parent',
      page,
      limit
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// POST /api/parent/messages/:threadId/messages (Append message)
parentMessagesRouter.post('/:threadId/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { body } = req.body || {};
    const result = await appendMessage({
      threadId: req.params.threadId,
      senderUserId: req.user!.id,
      senderRole: 'parent',
      body
    });
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// POST/PATCH /api/parent/messages/:threadId/read (Mark thread read)
parentMessagesRouter.all('/:threadId/read', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.method !== 'POST' && req.method !== 'PATCH') return next();
  try {
    const result = await markThreadRead({
      threadId: req.params.threadId,
      userId: req.user!.id,
      role: 'parent'
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// ============================================================================
// VOLUNTEER MESSAGING ROUTER
// Mount path: /api/volunteer/messages
// ============================================================================
export const volunteerMessagesRouter = Router();
volunteerMessagesRouter.use(authMiddleware);

volunteerMessagesRouter.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, code: 'UNAUTHORIZED', error: 'Authentication required' });
  }
  if (req.user.role !== 'volunteer' && !req.volunteerProfile) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Volunteer access required' });
  }
  next();
});

// GET /api/volunteer/messages/unread-count
volunteerMessagesRouter.get('/unread-count', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const counts = await getUnreadCount({ userId: req.user!.id, role: 'volunteer' });
    return res.json({ success: true, ...counts });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// GET /api/volunteer/messages (List threads)
volunteerMessagesRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const category = req.query.category as string | undefined;
    const status = req.query.status as string | undefined;

    const result = await listThreads({
      userId: req.user!.id,
      role: 'volunteer',
      category,
      status,
      page,
      limit
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// POST /api/volunteer/messages (Create thread)
volunteerMessagesRouter.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category, subject, body, eventId } = req.body || {};
    const result = await createThread({
      eventId,
      category,
      subject,
      body,
      creatorUserId: req.user!.id,
      creatorRole: 'volunteer'
    });
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// GET /api/volunteer/messages/:threadId (Thread detail)
volunteerMessagesRouter.get('/:threadId', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const result = await getThread({
      threadId: req.params.threadId,
      userId: req.user!.id,
      role: 'volunteer'
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// GET /api/volunteer/messages/:threadId/messages (Messages list)
volunteerMessagesRouter.get('/:threadId/messages', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const result = await getThreadMessages({
      threadId: req.params.threadId,
      userId: req.user!.id,
      role: 'volunteer',
      page,
      limit
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// POST /api/volunteer/messages/:threadId/messages (Append message)
volunteerMessagesRouter.post('/:threadId/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { body } = req.body || {};
    const result = await appendMessage({
      threadId: req.params.threadId,
      senderUserId: req.user!.id,
      senderRole: 'volunteer',
      body
    });
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// POST/PATCH /api/volunteer/messages/:threadId/read (Mark thread read)
volunteerMessagesRouter.all('/:threadId/read', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.method !== 'POST' && req.method !== 'PATCH') return next();
  try {
    const result = await markThreadRead({
      threadId: req.params.threadId,
      userId: req.user!.id,
      role: 'volunteer'
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// ============================================================================
// ADMIN MESSAGING ROUTER
// Mount path: /api/admin/messages
// ============================================================================
export const adminMessagesRouter = Router();
adminMessagesRouter.use(authMiddleware);

// Strict admin verification: only 'admin' or 'super_admin'. 'team' is denied.
adminMessagesRouter.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, code: 'UNAUTHORIZED', error: 'Authentication required' });
  }
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Admin or Super Admin access required' });
  }
  next();
});

const RESERVED_ADMIN_MESSAGE_PATHS = new Set([
  'preview',
  'drafts',
  'settings',
  'send',
  'campaign-status',
  'selected-parents',
  'threads',
  'unread-count'
]);

// GET /api/admin/messages/unread-count
adminMessagesRouter.get('/unread-count', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const counts = await getUnreadCount({ userId: req.user!.id, role: 'admin' });
    return res.json({ success: true, ...counts });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// Explicit threads listing endpoint: GET /api/admin/messages/threads
adminMessagesRouter.get('/threads', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const category = req.query.category as string | undefined;
    const status = req.query.status as string | undefined;
    const participantRole = req.query.participantRole as string | undefined;
    const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
    const search = req.query.search as string | undefined;

    const result = await listThreads({
      userId: req.user!.id,
      role: 'admin',
      category,
      status,
      participantRole,
      unreadOnly,
      search,
      page,
      limit
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// Root handler: GET /api/admin/messages
// Backwards compatible: if eventId is provided without direct thread indicator, pass through to legacy campaign dashboard in admin.ts
adminMessagesRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const isDirectMode = req.query.scope === 'direct' ||
                       req.query.tab === 'direct' ||
                       req.query.type === 'threads' ||
                       req.headers['x-message-mode'] === 'threads';

  if (!isDirectMode && req.query.eventId) {
    // Falls through to legacy campaign dashboard in admin.ts
    return next();
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const category = req.query.category as string | undefined;
    const status = req.query.status as string | undefined;
    const participantRole = req.query.participantRole as string | undefined;
    const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
    const search = req.query.search as string | undefined;

    const result = await listThreads({
      userId: req.user!.id,
      role: 'admin',
      category,
      status,
      participantRole,
      unreadOnly,
      search,
      page,
      limit
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// GET /api/admin/messages/threads/:threadId
adminMessagesRouter.get('/threads/:threadId', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const result = await getThread({
      threadId: req.params.threadId,
      userId: req.user!.id,
      role: 'admin'
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// GET /api/admin/messages/threads/:threadId/messages
adminMessagesRouter.get('/threads/:threadId/messages', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const result = await getThreadMessages({
      threadId: req.params.threadId,
      userId: req.user!.id,
      role: 'admin',
      page,
      limit
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// GET /api/admin/messages/:threadId (Fallback routing with reserved path protection)
adminMessagesRouter.get('/:threadId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (RESERVED_ADMIN_MESSAGE_PATHS.has(req.params.threadId)) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const result = await getThread({
      threadId: req.params.threadId,
      userId: req.user!.id,
      role: 'admin'
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// GET /api/admin/messages/:threadId/messages
adminMessagesRouter.get('/:threadId/messages', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (RESERVED_ADMIN_MESSAGE_PATHS.has(req.params.threadId)) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const result = await getThreadMessages({
      threadId: req.params.threadId,
      userId: req.user!.id,
      role: 'admin',
      page,
      limit
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// POST /api/admin/messages/:threadId/messages
adminMessagesRouter.post(['/:threadId/messages', '/threads/:threadId/messages'], async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (RESERVED_ADMIN_MESSAGE_PATHS.has(req.params.threadId)) {
    return next();
  }
  try {
    const { body } = req.body || {};
    const result = await appendMessage({
      threadId: req.params.threadId,
      senderUserId: req.user!.id,
      senderRole: 'admin',
      body
    });
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// POST/PATCH /api/admin/messages/:threadId/read
adminMessagesRouter.all(['/:threadId/read', '/threads/:threadId/read'], async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.method !== 'POST' && req.method !== 'PATCH') return next();
  if (RESERVED_ADMIN_MESSAGE_PATHS.has(req.params.threadId)) {
    return next();
  }
  try {
    const result = await markThreadRead({
      threadId: req.params.threadId,
      userId: req.user!.id,
      role: 'admin'
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// POST/PATCH /api/admin/messages/:threadId/resolve
adminMessagesRouter.all(['/:threadId/resolve', '/threads/:threadId/resolve'], async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.method !== 'POST' && req.method !== 'PATCH') return next();
  if (RESERVED_ADMIN_MESSAGE_PATHS.has(req.params.threadId)) {
    return next();
  }
  try {
    const result = await resolveThread({
      threadId: req.params.threadId,
      adminUserId: req.user!.id,
      adminRole: req.user!.role
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});

// POST/PATCH /api/admin/messages/:threadId/reopen
adminMessagesRouter.all(['/:threadId/reopen', '/threads/:threadId/reopen'], async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.method !== 'POST' && req.method !== 'PATCH') return next();
  if (RESERVED_ADMIN_MESSAGE_PATHS.has(req.params.threadId)) {
    return next();
  }
  try {
    const result = await reopenThread({
      threadId: req.params.threadId,
      adminUserId: req.user!.id,
      adminRole: req.user!.role
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleMessageError(err, res);
  }
});
