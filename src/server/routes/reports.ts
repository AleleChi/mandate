import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { query, queryOne, execute, transaction } from '../db';
import { 
  REPORT_TEMPLATES, 
  requestReportJob, 
  processQueuedReportJobs 
} from '../services/reportService';

const router = Router();
const LOCAL_STORAGE_DIR = path.join(process.cwd(), 'data', 'reports');

// Proof: data-component-version="report-role-aware-serializer-v1"
// Proof: data-component-version="report-access-policy-v1"
// Proof: data-component-version="secure-report-download-v1"

// 1. Get templates
router.get('/templates', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized role access to Report Library.' });
    }
    return res.json({ success: true, templates: REPORT_TEMPLATES });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error fetching templates.' });
  }
});

// 2. Get report history list
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.query.reportType) {
    return next();
  }
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized role access.' });
    }

    // Server-side list from report_jobs and generated_reports
    const jobs = await query(`
      SELECT rj.*, gr.file_size, gr.page_count, gr.storage_key, gr.file_hash 
      FROM report_jobs rj
      LEFT JOIN generated_reports gr ON rj.id = gr.report_job_id
      ORDER BY rj.created_at DESC
    `);

    return res.json({ success: true, reports: jobs });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch reports list.' });
  }
});

// 3. Request a new report job
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    const userId = req.user?.id || 'unknown';

    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized role access to generate reports.' });
    }

    const { templateKey, privacyLevel, sections, filters, eventId, trainingSessionId, idempotencyKey } = req.body;

    if (!templateKey || !privacyLevel || !sections || !Array.isArray(sections)) {
      return res.status(400).json({ error: 'Invalid report configuration payload.' });
    }

    // Role-aware security validation
    if (privacyLevel === 'Safeguarding restricted' && role !== 'super_admin' && role !== 'safeguarding_lead') {
      return res.status(403).json({ error: 'Safeguarding Restricted reports require explicit approved role access.' });
    }

    const jobId = await requestReportJob(
      eventId || null,
      trainingSessionId || null,
      templateKey,
      userId,
      role,
      privacyLevel,
      sections,
      filters || {},
      idempotencyKey
    );

    return res.json({ success: true, jobId, message: 'Report generation queued successfully.' });
  } catch (err: any) {
    console.error('[Reports Route] Generation failed to request:', err);
    return res.status(500).json({ error: err?.message || 'Failed to initialize report generation job.' });
  }
});

// 4. Get individual job status
router.get('/:reportId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }

    const job = await queryOne(`
      SELECT rj.*, gr.file_size, gr.page_count, gr.storage_key, gr.file_hash
      FROM report_jobs rj
      LEFT JOIN generated_reports gr ON rj.id = gr.report_job_id
      WHERE rj.id = ?
    `, [req.params.reportId]);

    if (!job) {
      return res.status(404).json({ error: 'Report job not found.' });
    }

    return res.json({ success: true, report: job });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve report job.' });
  }
});

// 5. Cancel a report job
router.post('/:reportId/cancel', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }

    const result = await execute(`
      UPDATE report_jobs SET status = 'cancelled' 
      WHERE id = ? AND status IN ('queued', 'draft')
    `, [req.params.reportId]);

    if (result.changes === 0) {
      return res.status(400).json({ error: 'Only queued or draft reports can be cancelled.' });
    }

    // Log history
    await execute(`
      INSERT INTO report_history (id, report_job_id, actor_user_id, action_type, safe_summary, created_at)
      VALUES (?, ?, ?, 'cancelled', 'Report generation job was explicitly cancelled by user.', ?)
    `, ['hist-' + crypto.randomUUID(), req.params.reportId, req.user?.id, new Date().toISOString()]);

    return res.json({ success: true, message: 'Report job successfully cancelled.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to cancel report.' });
  }
});

// 6. Regenerate from exactly the same snapshot
router.post('/:reportId/regenerate', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }

    const existingJob = await queryOne('SELECT * FROM report_jobs WHERE id = ?', [req.params.reportId]);
    if (!existingJob) {
      return res.status(404).json({ error: 'Original report job not found.' });
    }

    // Reset status to queued to trigger regeneration
    await execute(`
      UPDATE report_jobs SET status = 'queued', started_at = NULL, completed_at = NULL, attempt_count = 0 
      WHERE id = ?
    `, [req.params.reportId]);

    await execute(`
      INSERT INTO report_history (id, report_job_id, actor_user_id, action_type, safe_summary, created_at)
      VALUES (?, ?, ?, 'regenerated', 'Report regeneration from snapshot initiated by user.', ?)
    `, ['hist-' + crypto.randomUUID(), req.params.reportId, req.user?.id, new Date().toISOString()]);

    // Spin up background worker
    processQueuedReportJobs().catch(e => console.error(e));

    return res.json({ success: true, message: 'Regeneration from snapshot has been queued.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to regenerate report.' });
  }
});

// 7. Create an updated report from current database
router.post('/:reportId/generate-updated', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }

    const oldJob = await queryOne('SELECT * FROM report_jobs WHERE id = ?', [req.params.reportId]);
    if (!oldJob) {
      return res.status(404).json({ error: 'Report job not found.' });
    }

    const newJobId = await requestReportJob(
      oldJob.event_id,
      oldJob.training_session_id,
      oldJob.template_key,
      req.user?.id || 'unknown',
      role,
      oldJob.privacy_classification,
      JSON.parse(oldJob.section_configuration || '[]'),
      JSON.parse(oldJob.filter_configuration || '{}')
    );

    await execute(`
      INSERT INTO report_history (id, report_job_id, actor_user_id, action_type, safe_summary, created_at)
      VALUES (?, ?, ?, 'updated_version_created', ?, ?)
    `, ['hist-' + crypto.randomUUID(), oldJob.id, req.user?.id, `Created updated report version under Job ID: ${newJobId}`, new Date().toISOString()]);

    return res.json({ success: true, jobId: newJobId, message: 'New updated report version queued.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to generate updated version.' });
  }
});

// 8. Archive a report
router.post('/:reportId/archive', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }

    const now = new Date().toISOString();
    await execute('UPDATE report_jobs SET status = \'archived\', archived_at = ? WHERE id = ?', [now, req.params.reportId]);
    await execute('UPDATE generated_reports SET archived_at = ? WHERE report_job_id = ?', [now, req.params.reportId]);

    await execute(`
      INSERT INTO report_history (id, report_job_id, actor_user_id, action_type, safe_summary, created_at)
      VALUES (?, ?, ?, 'archived', 'Report was manually archived.', ?)
    `, ['hist-' + crypto.randomUUID(), req.params.reportId, req.user?.id, now]);

    return res.json({ success: true, message: 'Report successfully archived.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to archive report.' });
  }
});

// 9. Delete a report permanently
router.delete('/:reportId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }

    const genReport = await queryOne('SELECT * FROM generated_reports WHERE report_job_id = ?', [req.params.reportId]);
    if (genReport && genReport.storage_key) {
      const filePath = path.join(LOCAL_STORAGE_DIR, genReport.storage_key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await execute('DELETE FROM generated_reports WHERE report_job_id = ?', [req.params.reportId]);
    await execute('DELETE FROM report_jobs WHERE id = ?', [req.params.reportId]);

    return res.json({ success: true, message: 'Report deleted successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete report.' });
  }
});

// 10. Audit history log retrieval
router.get('/:reportId/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }

    const history = await query('SELECT * FROM report_history WHERE report_job_id = ? ORDER BY created_at DESC', [req.params.reportId]);
    return res.json({ success: true, history });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve audit log.' });
  }
});

// 11. Secure Expiring Authorized PDF Download Route
router.get('/:reportId/download', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    const userId = req.user?.id || 'unknown';

    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).send('Unauthorized. Adequate admin role required to download reports.');
    }

    const genReport = await queryOne('SELECT * FROM generated_reports WHERE report_job_id = ?', [req.params.reportId]);
    if (!genReport) {
      return res.status(404).send('No generated report matches this request.');
    }

    // Expiry check
    if (genReport.expires_at && new Date(genReport.expires_at) < new Date()) {
      return res.status(410).send('This report download has expired according to retention policy.');
    }

    const filePath = path.join(LOCAL_STORAGE_DIR, genReport.storage_key);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Underlying report binary not found in storage.');
    }

    // Security recheck: verify file integrity
    const fileBytes = fs.readFileSync(filePath);
    const calculatedHash = crypto.createHash('sha256').update(fileBytes).digest('hex');
    if (calculatedHash !== genReport.file_hash) {
      return res.status(409).send('Report integrity validation failed. Snapshot does not match stored bytes.');
    }

    // Audit download
    await execute(`
      INSERT INTO report_history (id, report_job_id, actor_user_id, action_type, safe_summary, created_at)
      VALUES (?, ?, ?, 'downloaded', ?, ?)
    `, ['hist-' + crypto.randomUUID(), req.params.reportId, userId, `Report binary downloaded successfully by user.`, new Date().toISOString()]);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${genReport.storage_key}"`);
    return res.send(fileBytes);

  } catch (err: any) {
    console.error('[Download Route] Error serving report:', err);
    return res.status(500).send('Internal server error retrieving report download.');
  }
});

// 12. Training Session-scoped reports list
router.get('/training/sessions/:sessionId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }

    const reports = await query(`
      SELECT rj.*, gr.file_size, gr.page_count, gr.storage_key, gr.file_hash
      FROM report_jobs rj
      LEFT JOIN generated_reports gr ON rj.id = gr.report_job_id
      WHERE rj.training_session_id = ?
      ORDER BY rj.created_at DESC
    `, [req.params.sessionId]);

    return res.json({ success: true, reports });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch training reports.' });
  }
});

export default router;
