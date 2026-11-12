import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { getCurrentEventId, getEventById } from '../services/eventService';
import {
  getEventAnalyticsSnapshot,
  getEventAnalyticsWatermark,
  renderEventAnalyticsCsv,
  renderEventAnalyticsSummaryPdf
} from '../services/eventAnalyticsService';

const ALLOWED_ANALYTICS_ROLES = ['admin', 'super_admin', 'team'];

function requireAnalyticsAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const role = String(req.user?.role || '').toLowerCase();
  if (!req.user || !ALLOWED_ANALYTICS_ROLES.includes(role)) {
    return res.status(403).json({ error: 'Admin access required for Event Analytics.' });
  }
  return next();
}

function parseFiltersFromQuery(req: AuthenticatedRequest) {
  return {
    eventId: typeof req.query.eventId === 'string' ? req.query.eventId : undefined,
    ageGroup: typeof req.query.ageGroup === 'string' ? req.query.ageGroup : undefined,
    volunteerId: typeof req.query.volunteerId === 'string' ? req.query.volunteerId : undefined,
    action: typeof req.query.action === 'string' ? req.query.action : undefined,
    activityPage: req.query.activityPage ? Number(req.query.activityPage) : 1,
    activityPageSize: req.query.activityPageSize ? Number(req.query.activityPageSize) : 20
  };
}

export function createEventAnalyticsRouter(options?: { pollIntervalMs?: number }): Router {
  const router = Router();
  const pollIntervalMs = Math.max(100, options?.pollIntervalMs ?? 1500);

  router.use(authMiddleware);
  router.use(requireAnalyticsAdmin);

  // GET /api/admin/event-analytics
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    try {
      const snapshot = await getEventAnalyticsSnapshot(parseFiltersFromQuery(req));
      return res.json(snapshot);
    } catch (err: any) {
      const status = err?.statusCode || 500;
      if (status >= 500) {
        console.error('[EventAnalytics] Snapshot error:', err);
      }
      return res.status(status).json({ error: err?.message || 'Failed to load event analytics.' });
    }
  });

  // GET /api/admin/event-analytics/export-csv
  router.get('/export-csv', async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    try {
      const filters = parseFiltersFromQuery(req);
      // Export complete matching activity feed when exporting CSV
      const snapshot = await getEventAnalyticsSnapshot({
        ...filters,
        activityPage: 1,
        activityPageSize: 100
      });
      const csv = renderEventAnalyticsCsv(snapshot);
      const slug = (snapshot.event?.title || 'event')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'event';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="event-analytics-${slug}.csv"`);
      return res.send(csv);
    } catch (err: any) {
      const status = err?.statusCode || 500;
      return res.status(status).json({ error: err?.message || 'Failed to export analytics CSV.' });
    }
  });

  // GET /api/admin/event-analytics/export-pdf
  router.get('/export-pdf', async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    try {
      const filters = parseFiltersFromQuery(req);
      const snapshot = await getEventAnalyticsSnapshot({
        ...filters,
        activityPage: 1,
        activityPageSize: 50
      });
      const pdfBuffer = renderEventAnalyticsSummaryPdf(snapshot);
      const slug = (snapshot.event?.title || 'event')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'event';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="event-analytics-summary-${slug}.pdf"`);
      return res.send(pdfBuffer);
    } catch (err: any) {
      const status = err?.statusCode || 500;
      return res.status(status).json({ error: err?.message || 'Failed to export analytics PDF.' });
    }
  });

  // GET /api/admin/event-analytics/stream (Separate read-only analytics SSE channel)
  router.get('/stream', async (req: AuthenticatedRequest, res: Response) => {
    try {
      let targetEventId: string | null = null;
      if (typeof req.query.eventId === 'string' && req.query.eventId.trim()) {
        const cleanId = req.query.eventId.trim();
        const ev = await getEventById(cleanId);
        if (!ev) {
          return res.status(404).json({ error: `Event not found: ${cleanId}` });
        }
        targetEventId = ev.id;
      } else {
        targetEventId = await getCurrentEventId();
      }

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      let closed = false;
      let checking = false;
      let lastVersion = '';

      if (targetEventId) {
        try {
          const initial = await getEventAnalyticsWatermark(targetEventId);
          lastVersion = initial.version;
        } catch {
          lastVersion = '';
        }
      }

      const sendEvent = (eventName: string, payload: Record<string, any>) => {
        if (closed || res.writableEnded) return;
        try {
          res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
          (res as any).flush?.();
        } catch {
          closed = true;
        }
      };

      sendEvent('connected', {
        type: 'connected',
        eventId: targetEventId,
        version: lastVersion,
        updatedAt: new Date().toISOString()
      });

      const pollTimer = setInterval(async () => {
        if (closed || checking || !targetEventId) return;
        checking = true;
        try {
          const watermark = await getEventAnalyticsWatermark(targetEventId);
          if (watermark.version !== lastVersion) {
            lastVersion = watermark.version;
            sendEvent('analytics_update', {
              type: 'analytics_update',
              eventId: targetEventId,
              updatedAt: watermark.updatedAt,
              version: watermark.version
            });
          }
        } catch {
          // Keep stream alive; client fallback polling handles temporary errors
        } finally {
          checking = false;
        }
      }, pollIntervalMs);

      const keepAliveTimer = setInterval(() => {
        if (closed || res.writableEnded) return;
        try {
          res.write(': keepalive\n\n');
          (res as any).flush?.();
        } catch {
          closed = true;
        }
      }, 20000);
      pollTimer.unref?.();
      keepAliveTimer.unref?.();

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(pollTimer);
        clearInterval(keepAliveTimer);
        try {
          if (!res.writableEnded) res.end();
        } catch {}
      };

      req.on('close', cleanup);
      res.on('close', cleanup);
    } catch (err: any) {
      if (!res.headersSent) {
        return res.status(500).json({ error: err?.message || 'Failed to establish analytics stream.' });
      }
    }
  });

  return router;
}

export default createEventAnalyticsRouter();

