import { Router, Request, Response } from 'express';
import { processPendingNotifications } from '../services/notifications';

const router = Router();
const REAL_EVENT_ID = 'event-ga-2026';

router.post('/process-notifications', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const secret = process.env.JOB_SECRET || 'job-secret-default-2026';

  if (!token || token !== secret) {
    return res.status(401).json({ error: 'Unauthorized. Invalid or missing JOB_SECRET token.' });
  }

  try {
    const result = await processPendingNotifications(REAL_EVENT_ID);
    res.json({
      success: true,
      processed: result.processed,
      failures: result.failures
    });
  } catch (err: any) {
    console.error('[Scheduler API] Error running notification processing job:', err);
    res.status(500).json({ 
      error: err?.message || 'Internal server error during notification processing' 
    });
  }
});

export default router;
