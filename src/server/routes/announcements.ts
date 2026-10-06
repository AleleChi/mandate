import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { MessageDomainError } from '../services/messageService';
import {
  createAnnouncement,
  listAdminAnnouncements,
  getAdminAnnouncement,
  searchAnnouncementRecipients,
  listParentAnnouncements,
  getParentAnnouncement,
  getParentAnnouncementUnreadCount,
  markParentAnnouncementRead,
  listVolunteerAnnouncements,
  getVolunteerAnnouncement,
  getVolunteerAnnouncementUnreadCount,
  markVolunteerAnnouncementRead
} from '../services/announcementService';

function handleAnnouncementError(err: any, res: Response) {
  if (err instanceof MessageDomainError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      error: err.message
    });
  }
  console.error('[announcementsRoute Error]:', err);
  return res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    error: 'Internal server error'
  });
}

// ============================================================================
// PARENT ANNOUNCEMENTS ROUTER
// Mount path: /api/parent/announcements
// ============================================================================
export const parentAnnouncementsRouter = Router();
parentAnnouncementsRouter.use(authMiddleware);

parentAnnouncementsRouter.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, code: 'UNAUTHORIZED', error: 'Authentication required' });
  }
  if (req.user.role !== 'parent' && !req.parentProfile) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Parent access required' });
  }
  next();
});

// GET /api/parent/announcements/unread-count
parentAnnouncementsRouter.get('/unread-count', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const result = await getParentAnnouncementUnreadCount({ parentUserId: req.user!.id });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleAnnouncementError(err, res);
  }
});

// GET /api/parent/announcements
parentAnnouncementsRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const result = await listParentAnnouncements({
      parentUserId: req.user!.id,
      page,
      limit
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleAnnouncementError(err, res);
  }
});

// GET /api/parent/announcements/:id
parentAnnouncementsRouter.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const result = await getParentAnnouncement({
      id: req.params.id,
      parentUserId: req.user!.id
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleAnnouncementError(err, res);
  }
});

// POST or PATCH /api/parent/announcements/:id/read
parentAnnouncementsRouter.all('/:id/read', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return next();
  }
  try {
    const result = await markParentAnnouncementRead({
      id: req.params.id,
      parentUserId: req.user!.id
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleAnnouncementError(err, res);
  }
});

// ============================================================================
// VOLUNTEER ANNOUNCEMENTS ROUTER
// Mount path: /api/volunteer/announcements
// ============================================================================
export const volunteerAnnouncementsRouter = Router();
volunteerAnnouncementsRouter.use(authMiddleware);

volunteerAnnouncementsRouter.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, code: 'UNAUTHORIZED', error: 'Authentication required' });
  }
  if (req.user.role !== 'volunteer' && !req.volunteerProfile) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Volunteer access required' });
  }
  next();
});

// GET /api/volunteer/announcements/unread-count
volunteerAnnouncementsRouter.get('/unread-count', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const result = await getVolunteerAnnouncementUnreadCount({ volunteerUserId: req.user!.id });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleAnnouncementError(err, res);
  }
});

// GET /api/volunteer/announcements
volunteerAnnouncementsRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const result = await listVolunteerAnnouncements({
      volunteerUserId: req.user!.id,
      page,
      limit
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleAnnouncementError(err, res);
  }
});

// GET /api/volunteer/announcements/:id
volunteerAnnouncementsRouter.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const result = await getVolunteerAnnouncement({
      id: req.params.id,
      volunteerUserId: req.user!.id
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleAnnouncementError(err, res);
  }
});

// POST or PATCH /api/volunteer/announcements/:id/read
volunteerAnnouncementsRouter.all('/:id/read', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return next();
  }
  try {
    const result = await markVolunteerAnnouncementRead({
      id: req.params.id,
      volunteerUserId: req.user!.id
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleAnnouncementError(err, res);
  }
});

// ============================================================================
// ADMIN ANNOUNCEMENTS ROUTER
// Mount path: /api/admin/announcements
// ============================================================================
export const adminAnnouncementsRouter = Router();
adminAnnouncementsRouter.use(authMiddleware);

// Strict admin verification: only 'admin' or 'super_admin'. 'team' is denied.
adminAnnouncementsRouter.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, code: 'UNAUTHORIZED', error: 'Authentication required' });
  }
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Admin or Super Admin access required' });
  }
  next();
});

// GET /api/admin/announcements/recipients (Search candidates for selected recipient broadcast)
adminAnnouncementsRouter.get('/recipients', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const role = (req.query.role as string) || 'parent';
    const query = req.query.query as string | undefined;
    if (role !== 'parent' && role !== 'volunteer') {
      return res.status(400).json({ success: false, code: 'INVALID_ROLE', error: 'Role must be parent or volunteer' });
    }
    const result = await searchAnnouncementRecipients(role, query);
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleAnnouncementError(err, res);
  }
});

// GET /api/admin/announcements (List announcements)
adminAnnouncementsRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const result = await listAdminAnnouncements({ page, limit });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleAnnouncementError(err, res);
  }
});

// POST /api/admin/announcements (Create & publish announcement)
adminAnnouncementsRouter.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, body, audience_type, audienceType, target_user_id, targetUserId, event_id, eventId } = req.body || {};
    const result = await createAnnouncement({
      title,
      body,
      audienceType: audience_type || audienceType,
      targetUserId: target_user_id || targetUserId,
      eventId: event_id || eventId,
      adminUserId: req.user!.id,
      adminRole: req.user!.role
    });
    return res.status(201).json(result);
  } catch (err) {
    return handleAnnouncementError(err, res);
  }
});

// GET /api/admin/announcements/:id (Detail view)
adminAnnouncementsRouter.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const result = await getAdminAnnouncement(req.params.id);
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleAnnouncementError(err, res);
  }
});
