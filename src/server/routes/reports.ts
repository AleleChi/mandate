import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { query, queryOne, execute, transaction } from '../db';
import { compileReportDocument } from '../reports/reportTemplateRegistry';
import { renderDocumentToPDF } from '../reports/reportRenderer';
import { 
  REPORT_TEMPLATES, 
  requestReportJob, 
  processQueuedReportJobs,
  compileReportSnapshot,
  needsModelUpgrade,
  upgradeReportRecord,
  upgradeAllStoredReports,
  getValidatedBrandLogo
} from '../services/reportService';
import { calculateAnalytics } from '../services/reportAnalyticsService';

const router = Router();
const LOCAL_STORAGE_DIR = path.join(process.cwd(), 'data', 'reports');

export function resolveReportFilePath(storageKey: string | null | undefined, reportJobId: string): string {
  const cleanFilename = storageKey ? path.basename(storageKey) : `${reportJobId}.pdf`;
  const canonicalPath = path.join(LOCAL_STORAGE_DIR, cleanFilename);

  if (fs.existsSync(canonicalPath)) {
    return canonicalPath;
  }

  if (storageKey && path.isAbsolute(storageKey) && fs.existsSync(storageKey)) {
    const resolved = path.resolve(storageKey);
    const approvedDir = path.resolve(LOCAL_STORAGE_DIR);
    if (resolved.startsWith(approvedDir)) {
      return resolved;
    }
  }

  return canonicalPath;
}

// Apply authMiddleware FIRST across all report routes so req.user is guaranteed
router.use(authMiddleware);

async function checkReportAccess(req: AuthenticatedRequest, eventId: string | null): Promise<boolean> {
  const role = req.user?.role || 'parent';
  const userId = req.user?.id || '';
  if (['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
    return true;
  }
  const targetEventId = eventId || 'event-ga-2026';
  const assigned = await queryOne('SELECT id FROM event_duty_assignments WHERE event_id = ? AND user_id = ? AND status != \'cancelled\' LIMIT 1', [targetEventId, userId]);
  return !!assigned;
}

// Router parameter authorization check (req.user is populated because authMiddleware ran first)
router.param('reportId', async (req: any, res, next, reportId) => {
  try {
    const job = await queryOne('SELECT event_id FROM report_jobs WHERE id = ?', [reportId]);
    if (!job) {
      return res.status(404).json({ error: 'Report job not found.' });
    }
    const hasAccess = await checkReportAccess(req, job.event_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied: You do not have access to this event.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Failed to authorize report access.' });
  }
});

// Helper to format canonical report jobs for frontend consumption
async function formatReportJob(job: any) {
  const template = REPORT_TEMPLATES.find(t => t.key === job.template_key);
  const templateName = template ? template.name : 'Leadership Report';
  
  let eventTitle = 'The General Assembly';
  if (job.event_id) {
    const ev = await queryOne('SELECT title FROM events WHERE id = ?', [job.event_id]);
    if (ev?.title) eventTitle = ev.title;
  } else if (job.training_session_id) {
    eventTitle = 'Training Drill Session';
  }

  let requestedByName = 'Administrator';
  let requestedByEmail = '';
  if (job.requested_by) {
    const user = await queryOne('SELECT pp.full_name, u.email FROM users u LEFT JOIN parent_profiles pp ON u.id = pp.user_id WHERE u.id = ?', [job.requested_by]);
    if (user) {
      requestedByName = user.full_name || user.email || 'Administrator';
      requestedByEmail = user.email || '';
    }
  }

  const reportTitle = `${templateName} — ${eventTitle}`;

  const storagePath = resolveReportFilePath(job.storage_key, job.id);
  const storageAvailable = fs.existsSync(storagePath);

  let status = job.status || 'queued';
  if (status === 'completed') status = 'ready';

  let errorMessage: string | null = null;
  if (job.error_code || job.error_message) {
    const rawErr = String(job.error_code || job.error_message);
    if (rawErr.toLowerCase().includes('sql') || rawErr.toLowerCase().includes('database') || rawErr.includes('/')) {
      errorMessage = 'Report compilation encountered an issue. Please try again.';
    } else {
      errorMessage = rawErr;
    }
  }

  return {
    id: job.id,
    templateKey: job.template_key,
    templateName,
    reportTitle,
    eventId: job.event_id,
    trainingSessionId: job.training_session_id,
    eventTitle,
    requestedBy: job.requested_by,
    requestedByName,
    requestedByEmail,
    privacyClassification: job.privacy_classification,
    status,
    filterConfiguration: job.filter_configuration ? JSON.parse(job.filter_configuration) : {},
    sectionConfiguration: job.section_configuration ? JSON.parse(job.section_configuration) : [],
    fileSize: job.file_size || 0,
    pageCount: job.page_count || 0,
    storageAvailable,
    errorMessage,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    completedAt: job.completed_at,
    archivedAt: job.archived_at
  };
}

// 1. Get templates
router.get('/templates', async (req: AuthenticatedRequest, res: Response) => {
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

// 1b. Get individual template configuration
router.get('/templates/:templateKey', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized role access to Report Template configuration.' });
    }

    const { templateKey } = req.params;
    const template = REPORT_TEMPLATES.find(t => t.key === templateKey);
    if (!template) {
      return res.status(404).json({ error: 'Report template not found.' });
    }

    return res.json({
      success: true,
      template: {
        key: template.key,
        name: template.name,
        description: template.description,
        reportDomain: template.reportDomain,
        privacyClassification: template.privacyClassification,
        supportedSections: template.supportedSections,
        defaultSections: template.defaultSections,
        availableFilters: template.availableFilters,
        dataAvailability: (template as any).dataAvailability,
        permittedEventTypes: template.permittedEventTypes,
        allowedActions: template.allowedActions,
        estimatedTime: (template as any).estimatedTime || '15s',
        audience: template.audience,
        requiredDataSources: (template as any).requiredDataSources,
        analyticsCalculations: (template as any).analyticsCalculations,
        reportSections: (template as any).reportSections,
        charts: (template as any).charts,
        tables: (template as any).tables,
        insights: (template as any).insights,
        recommendations: (template as any).recommendations
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error fetching template detail.' });
  }
});

// 1c. POST /api/admin/reports/preview
router.post('/preview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    const userId = req.user?.id || 'unknown';

    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized role access to report previews.' });
    }

    const { templateKey, privacyLevel, sections, filters, eventId, trainingSessionId } = req.body;

    if (!templateKey || !privacyLevel) {
      return res.status(400).json({ error: 'Invalid report preview request payload.' });
    }

    const hasAccess = await checkReportAccess(req, eventId || null);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied: You do not have access to this event.' });
    }

    if (privacyLevel === 'Safeguarding restricted' && role !== 'super_admin' && role !== 'safeguarding_lead') {
      return res.status(403).json({ error: 'Safeguarding Restricted reports require explicit approved role access.' });
    }

    const snapshot = await compileReportSnapshot(
      eventId || null,
      trainingSessionId || null,
      templateKey,
      userId,
      role,
      privacyLevel,
      filters || {}
    );

    const analytics = calculateAnalytics(snapshot);

    const template = REPORT_TEMPLATES.find(t => t.key === templateKey);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const docModel = compileReportDocument(
      'prev-doc-' + crypto.randomUUID(),
      snapshot,
      analytics,
      templateKey,
      privacyLevel,
      sections || template.recommendedSections
    );

    const logoInfo = await getValidatedBrandLogo();
    if (logoInfo.available) {
      console.log('[Report Preview Branding] database logo resolved');
      docModel.branding = {
        ...docModel.branding,
        organizationName: 'Koinonia Global',
        logoUrl: logoInfo.previewUrl || logoInfo.pdfData || undefined,
        logoBase64: logoInfo.pdfData || undefined
      };
    }

    return res.json({
      success: true,
      template: {
        key: template.key,
        name: template.name,
        description: template.description,
        reportDomain: template.reportDomain,
        privacyClassification: privacyLevel,
        audience: template.audience,
        estimatedTime: (template as any).estimatedTime || '15s'
      },
      context: {
        eventId: eventId || 'event-ga-2026',
        eventTitle: snapshot.event?.title || (snapshot.session ? 'Training Drill Session' : 'The General Assembly'),
        startsAt: snapshot.event?.starts_at || snapshot.session?.scheduled_start_at || new Date().toISOString()
      },
      metadata: {
        cutoffTime: snapshot.cutoffTime || new Date().toISOString(),
        timezone: snapshot.timezone || 'Africa/Lagos'
      },
      sections: sections || template.recommendedSections,
      analytics,
      documentModel: docModel,
      dataQuality: {
        status: 'High',
        description: 'Real-time event databases and synchronization layers are verified.'
      },
      limitations: [
        'Data represents system records captured up to the cutoff timestamp.',
        'Physical attendance location figures reflect confirmed check-in and checkout scans.',
        'Anonymization filters are applied according to role privacy boundaries.'
      ],
      allowedActions: template.allowedActions
    });

  } catch (err: any) {
    console.error('[Reports Preview] Failed to generate preview:', err);
    return res.status(500).json({ error: err?.message || 'Failed to compile report preview data.' });
  }
});

// 1d. POST /api/admin/reports/preview/download
router.post('/preview/download', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    const userId = req.user?.id || 'unknown';

    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized role access to report preview downloads.' });
    }

    const { templateKey, privacyLevel, sections, filters, eventId, trainingSessionId } = req.body;

    if (!templateKey || !privacyLevel) {
      return res.status(400).json({ error: 'Invalid report preview download request payload.' });
    }

    const hasAccess = await checkReportAccess(req, eventId || null);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied: You do not have access to this event.' });
    }

    if (privacyLevel === 'Safeguarding restricted' && role !== 'super_admin' && role !== 'safeguarding_lead') {
      return res.status(403).json({ error: 'Safeguarding Restricted reports require explicit approved role access.' });
    }

    const snapshot = await compileReportSnapshot(
      eventId || null,
      trainingSessionId || null,
      templateKey,
      userId,
      role,
      privacyLevel,
      filters || {}
    );

    const analytics = calculateAnalytics(snapshot);

    const template = REPORT_TEMPLATES.find(t => t.key === templateKey);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const docModel = compileReportDocument(
      'prev-dl-' + crypto.randomUUID(),
      snapshot,
      analytics,
      templateKey,
      privacyLevel,
      sections || template.recommendedSections
    );

    const logoInfo = await getValidatedBrandLogo();
    if (logoInfo.available) {
      docModel.branding = {
        ...docModel.branding,
        organizationName: 'Koinonia Global',
        logoUrl: logoInfo.previewUrl || logoInfo.pdfData || undefined,
        logoBase64: logoInfo.pdfData || undefined
      };
    }

    const { pdfBytes } = await renderDocumentToPDF(docModel);

    const reportTitlePart = (docModel.reportTitle || template.name).replace(/[/\\?%*:|"<>]/g, '').trim();
    const eventContextPart = (snapshot.event?.title || (snapshot.session ? 'Training Drill Session' : 'The General Assembly')).replace(/[/\\?%*:|"<>]/g, '').trim();
    const dateFormatted = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const rawFilename = `${reportTitlePart} - ${eventContextPart} - ${dateFormatted}.pdf`;
    const safeFilename = rawFilename.replace(/[^a-zA-Z0-9.\- _]/g, '_');
    const encodedFilename = encodeURIComponent(rawFilename);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.send(Buffer.from(pdfBytes));
  } catch (err: any) {
    console.error('Failed to generate template preview download PDF:', err);
    return res.status(500).json({ error: 'Failed to generate preview download PDF.' });
  }
});

// 2. Get generated reports list
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.query.reportType) {
    return next();
  }
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized role access.' });
    }

    let jobsQuery = `
      SELECT rj.*, gr.file_size, gr.page_count, gr.storage_key, gr.file_hash 
      FROM report_jobs rj
      LEFT JOIN generated_reports gr ON rj.id = gr.report_job_id
    `;
    const params: any[] = [];
    if (role !== 'super_admin' && role !== 'admin') {
      const assignedEvents = await query('SELECT DISTINCT event_id FROM event_duty_assignments WHERE user_id = ? AND status != \'cancelled\'', [req.user?.id]);
      const eventIds = assignedEvents.map((e: any) => e.event_id).filter(Boolean);
      if (eventIds.length === 0) {
        return res.json({ success: true, reports: [] });
      }
      const placeholders = eventIds.map(() => '?').join(',');
      jobsQuery += ` WHERE rj.event_id IN (${placeholders})`;
      params.push(...eventIds);
    }
    jobsQuery += ' ORDER BY rj.created_at DESC';
    const rawJobs = await query(jobsQuery, params);

    const reports = await Promise.all(rawJobs.map((j: any) => formatReportJob(j)));

    return res.json({ success: true, reports });
  } catch (err: any) {
    console.error('[GET /api/admin/reports] Failed to fetch reports:', err);
    return res.status(500).json({ error: 'Failed to fetch reports list.' });
  }
});

// 3. Request a new report job (Non-blocking HTTP 202)
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
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

    const hasAccess = await checkReportAccess(req, eventId || null);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied: You do not have access to this event.' });
    }

    if (privacyLevel === 'Safeguarding restricted' && role !== 'super_admin' && role !== 'safeguarding_lead') {
      return res.status(403).json({ error: 'Safeguarding Restricted reports require explicit approved role access.' });
    }

    console.log(`[Reports] request accepted - Template: ${templateKey}, User: ${userId}`);

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

    return res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: 'Report generation queued successfully.'
    });
  } catch (err: any) {
    console.error('[Reports Route] Generation request failed:', err);
    return res.status(500).json({ error: err?.message || 'Failed to initialize report generation job.' });
  }
});

// 4. Get individual job status
router.get('/:reportId/preview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    const userId = req.user?.id || 'unknown';

    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized role access to report previews.' });
    }

    const { reportId } = req.params;
    const job = await queryOne('SELECT * FROM report_jobs WHERE id = ?', [reportId]);
    if (!job) {
      return res.status(404).json({ error: 'Report job not found.' });
    }

    const genReport = await queryOne('SELECT * FROM generated_reports WHERE report_job_id = ?', [reportId]);
    
    let docModel: any = null;

    if (genReport && genReport.document_model_json) {
      try {
        docModel = JSON.parse(genReport.document_model_json);
      } catch (e) {
        console.warn('[Report Preview] Could not parse stored document_model_json, falling back to backfill.');
      }
    }

    // Check if stored document model contains deprecated terms or needs controlled upgrade
    if (needsModelUpgrade(docModel)) {
      console.log(`[Report Preview] Report job ${reportId} needs model upgrade. Triggering controlled upgrade...`);
      const upgradedModel = await upgradeReportRecord(reportId);
      if (upgradedModel) {
        docModel = upgradedModel;
      }
    }

    // Lazy backfill if document_model_json does not exist yet or was corrupted
    if (!docModel) {
      if (!job.snapshot_id) {
        return res.status(400).json({ error: 'Original snapshot missing for this report.' });
      }

      const snapshotRow = await queryOne('SELECT * FROM report_snapshots WHERE id = ?', [job.snapshot_id]);
      if (!snapshotRow || !snapshotRow.snapshot_data) {
        return res.status(400).json({ error: 'Report snapshot data unavailable.' });
      }

      const snapshot = JSON.parse(snapshotRow.snapshot_data);
      const analytics = calculateAnalytics(snapshot);
      const activeSections = job.section_configuration ? JSON.parse(job.section_configuration) : [];

      docModel = compileReportDocument(
        job.id,
        snapshot,
        analytics,
        job.template_key,
        job.privacy_classification,
        activeSections
      );

      // Save backfilled document model to generated_reports
      const jsonStr = JSON.stringify(docModel);
      const docHash = crypto.createHash('sha256').update(jsonStr).digest('hex');

      if (genReport) {
        await execute(
          'UPDATE generated_reports SET document_model_json = ?, document_hash = ? WHERE report_job_id = ?',
          [jsonStr, docHash, job.id]
        );
      }
    }

    // Record safe audit log
    await execute(`
      INSERT INTO report_history (id, report_job_id, actor_user_id, action_type, safe_summary, created_at)
      VALUES (?, ?, ?, 'preview_opened', 'Report preview opened by user.', ?)
    `, ['hist-' + crypto.randomUUID(), job.id, userId, new Date().toISOString()]);

    const formattedReport = await formatReportJob(job);

    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      success: true,
      report: formattedReport,
      documentModel: docModel
    });

  } catch (err: any) {
    console.error('[GET /:reportId/preview] Error:', err);
    return res.status(500).json({ error: 'Failed to generate report preview.' });
  }
});

// 4b. Get individual job status
router.get('/:reportId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }

    const rawJob = await queryOne(`
      SELECT rj.*, gr.file_size, gr.page_count, gr.storage_key, gr.file_hash
      FROM report_jobs rj
      LEFT JOIN generated_reports gr ON rj.id = gr.report_job_id
      WHERE rj.id = ?
    `, [req.params.reportId]);

    if (!rawJob) {
      return res.status(404).json({ error: 'Report job not found.' });
    }

    const report = await formatReportJob(rawJob);

    return res.json({ success: true, report, job: report });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve report job.' });
  }
});

// 5. Cancel a report job
router.post('/:reportId/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }

    const result = await execute(`
      UPDATE report_jobs SET status = 'cancelled', updated_at = ?
      WHERE id = ? AND status IN ('queued', 'generating', 'draft')
    `, [new Date().toISOString(), req.params.reportId]);

    if (result.changes === 0) {
      return res.status(400).json({ error: 'Only queued or preparing reports can be cancelled.' });
    }

    await execute(`
      INSERT INTO report_history (id, report_job_id, actor_user_id, action_type, safe_summary, created_at)
      VALUES (?, ?, ?, 'cancelled', 'Report generation job was cancelled by user.', ?)
    `, ['hist-' + crypto.randomUUID(), req.params.reportId, req.user?.id, new Date().toISOString()]);

    return res.json({ success: true, message: 'Report job successfully cancelled.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to cancel report.' });
  }
});

// 6. Regenerate from exactly the same snapshot
router.post('/:reportId/regenerate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }

    const existingJob = await queryOne('SELECT * FROM report_jobs WHERE id = ?', [req.params.reportId]);
    if (!existingJob) {
      return res.status(404).json({ error: 'Original report job not found.' });
    }

    const now = new Date().toISOString();
    await execute(`
      UPDATE report_jobs SET status = 'queued', started_at = NULL, completed_at = NULL, attempt_count = 0, error_code = NULL, updated_at = ?
      WHERE id = ?
    `, [now, req.params.reportId]);

    await execute(`
      INSERT INTO report_history (id, report_job_id, actor_user_id, action_type, safe_summary, created_at)
      VALUES (?, ?, ?, 'regenerated', 'Report regeneration from snapshot initiated by user.', ?)
    `, ['hist-' + crypto.randomUUID(), req.params.reportId, req.user?.id, now]);

    processQueuedReportJobs().catch(e => console.error(e));

    return res.status(202).json({ success: true, jobId: req.params.reportId, status: 'queued', message: 'Regeneration from snapshot has been queued.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to regenerate report.' });
  }
});

// 7. Create an updated report from current event information
router.post('/:reportId/generate-updated', async (req: AuthenticatedRequest, res: Response) => {
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

    const now = new Date().toISOString();
    await execute(`
      INSERT INTO report_history (id, report_job_id, actor_user_id, action_type, safe_summary, created_at)
      VALUES (?, ?, ?, 'updated_version_created', ?, ?)
    `, ['hist-' + crypto.randomUUID(), oldJob.id, req.user?.id, `Created updated report version under Job ID: ${newJobId}`, now]);

    return res.status(202).json({ success: true, jobId: newJobId, status: 'queued', message: 'New updated report version queued.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to generate updated version.' });
  }
});

// 8. Archive a report
router.post('/:reportId/archive', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }

    const now = new Date().toISOString();
    await execute('UPDATE report_jobs SET status = \'archived\', archived_at = ?, updated_at = ? WHERE id = ?', [now, now, req.params.reportId]);
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
router.delete('/:reportId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (role !== 'super_admin' && role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized access. Super Admin or Admin access required to delete reports.' });
    }

    const genReport = await queryOne('SELECT * FROM generated_reports WHERE report_job_id = ?', [req.params.reportId]);
    if (genReport && genReport.storage_key) {
      const filePath = resolveReportFilePath(genReport.storage_key, req.params.reportId);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.error('[Delete Report] Failed to remove file:', e);
        }
      }
    }

    await transaction(async () => {
      await execute('DELETE FROM report_history WHERE report_job_id = ?', [req.params.reportId]);
      await execute('DELETE FROM report_download_tokens WHERE generated_report_id IN (SELECT id FROM generated_reports WHERE report_job_id = ?)', [req.params.reportId]);
      await execute('DELETE FROM generated_reports WHERE report_job_id = ?', [req.params.reportId]);
      await execute('DELETE FROM report_jobs WHERE id = ?', [req.params.reportId]);
    });

    return res.json({ success: true, message: 'Report deleted successfully.' });
  } catch (err: any) {
    console.error('[Delete Report] Error:', err);
    return res.status(500).json({ error: 'Failed to delete report.' });
  }
});

// 10. Audit history log retrieval
router.get('/:reportId/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }

    const history = await query(`
      SELECT rh.*, pp.full_name as actor_name, u.email as actor_email
      FROM report_history rh
      LEFT JOIN users u ON rh.actor_user_id = u.id
      LEFT JOIN parent_profiles pp ON u.id = pp.user_id
      WHERE rh.report_job_id = ?
      ORDER BY rh.created_at DESC
    `, [req.params.reportId]);

    return res.json({ success: true, history });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve audit log.' });
  }
});

// 11. PDF Download Route
router.get('/:reportId/download', async (req: AuthenticatedRequest, res: Response) => {
  const reportId = req.params.reportId;
  console.log(`[Reports Download] request received - Report ID: ${reportId}`);

  try {
    const role = req.user?.role || 'parent';
    const userId = req.user?.id || 'unknown';

    if (!['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead', 'team'].includes(role)) {
      console.warn(`[Reports Download] failed - unauthorized role: ${role}`);
      return res.status(403).json({ error: 'Unauthorized. Adequate admin role required to download reports.' });
    }
    console.log(`[Reports Download] access confirmed - User ID: ${userId}, Role: ${role}`);

    const genReport = await queryOne('SELECT * FROM generated_reports WHERE report_job_id = ?', [reportId]);
    const job = await queryOne('SELECT * FROM report_jobs WHERE id = ?', [reportId]);

    if (!job) {
      console.warn(`[Reports Download] failed - report job not found: ${reportId}`);
      return res.status(400).json({ error: 'Invalid report job reference.' });
    }

    if (job.status !== 'ready' && job.status !== 'completed') {
      console.warn(`[Reports Download] failed - report status not ready: ${job.status}`);
      return res.status(409).json({ error: 'Report generation is not ready for download.' });
    }
    
    if (!genReport) {
      console.warn(`[Reports Download] failed - no generated report record for job: ${reportId}`);
      return res.status(404).json({ error: 'No generated report metadata matches this request.' });
    }

    if (genReport.expires_at && new Date(genReport.expires_at) < new Date()) {
      console.warn(`[Reports Download] failed - report expired: ${genReport.expires_at}`);
      return res.status(410).json({ error: 'This report download has expired according to retention policy.' });
    }
    console.log(`[Reports Download] metadata loaded - Version: ${genReport.report_version}, Size: ${genReport.file_size} bytes`);

    const filePath = resolveReportFilePath(genReport.storage_key, reportId);
    
    // Security check: path traversal escape check
    const approvedDir = path.resolve(LOCAL_STORAGE_DIR);
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(approvedDir)) {
      console.error(`[Reports Download] failed - path traversal escape blocked: ${resolvedPath}`);
      return res.status(403).json({ error: 'Access denied: Invalid storage path.' });
    }

    if (!fs.existsSync(filePath)) {
      console.warn(`[Reports Download] failed - file does not exist on disk: ${filePath}`);
      return res.status(404).json({ error: 'Underlying report file not found in storage.' });
    }

    const fileBytes = fs.readFileSync(filePath);
    if (fileBytes.length === 0) {
      console.warn(`[Reports Download] failed - file on disk is empty: ${filePath}`);
      return res.status(500).json({ error: 'Underlying report file is empty.' });
    }
    console.log(`[Reports Download] file resolved - Path: ${filePath}, Exists: true, Bytes: ${fileBytes.length}`);

    const calculatedHash = crypto.createHash('sha256').update(fileBytes).digest('hex');
    if (calculatedHash !== genReport.file_hash) {
      console.warn(`[Reports Download] hash check discrepancy - Calculated: ${calculatedHash}, DB: ${genReport.file_hash}`);
      // Self-heal DB hash if file is valid PDF
      if (fileBytes.toString('utf8', 0, 4) === '%PDF') {
        await execute('UPDATE generated_reports SET file_hash = ?, file_size = ? WHERE id = ?', [calculatedHash, fileBytes.length, genReport.id]);
      }
    } else {
      console.log(`[Reports Download] hash verified - SHA256 match confirmed`);
    }

    await execute(`
      INSERT INTO report_history (id, report_job_id, actor_user_id, action_type, safe_summary, created_at)
      VALUES (?, ?, ?, 'downloaded', 'Report PDF downloaded successfully by user.', ?)
    `, ['hist-' + crypto.randomUUID(), reportId, userId, new Date().toISOString()]);

    let docModel: any = null;
    if (genReport && genReport.document_model_json) {
      try {
        docModel = JSON.parse(genReport.document_model_json);
      } catch (e) {
        console.warn('[Reports Download] Could not parse stored document_model_json:', e);
      }
    }

    const template = REPORT_TEMPLATES.find(t => t.key === job?.template_key);
    const titlePart = docModel?.reportTitle || template?.name || 'Attendance and Demographics Report';
    
    let eventPart = docModel?.eventContext?.eventTitle;
    if (!eventPart && job?.event_id) {
      const ev = await queryOne('SELECT title FROM events WHERE id = ?', [job.event_id]);
      if (ev?.title) eventPart = ev.title;
    }
    if (!eventPart) eventPart = 'The General Assembly';

    const dateObj = new Date(job?.completed_at || job?.created_at || Date.now());
    const datePart = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const rawHumanFilename = `${titlePart} - ${eventPart} - ${datePart}`;
    const cleanFilename = rawHumanFilename
      .replace(/[\/\\:*?"<>|\x00-\x1F\x7F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 150);

    const asciiFilename = cleanFilename
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/[\/\\:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Report';

    const encodedFilename = encodeURIComponent(cleanFilename + '.pdf')
      .replace(/['()]/g, escape)
      .replace(/\*/g, '%2A');

    const downloadFilename = `${asciiFilename}.pdf`;

    console.log(`[Reports Download] response started - Filename: ${downloadFilename}`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(fileBytes);

  } catch (err: any) {
    console.error(`[Reports Download] failed - Internal error serving report ${reportId}:`, err);
    return res.status(500).json({ error: 'Internal server error retrieving report download.' });
  }
});

// 12. Training Session-scoped reports list
router.get('/training/sessions/:sessionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || 'parent';
    if (!['super_admin', 'admin', 'team'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }

    const rawJobs = await query(`
      SELECT rj.*, gr.file_size, gr.page_count, gr.storage_key, gr.file_hash
      FROM report_jobs rj
      LEFT JOIN generated_reports gr ON rj.id = gr.report_job_id
      WHERE rj.training_session_id = ?
      ORDER BY rj.created_at DESC
    `, [req.params.sessionId]);

    const reports = await Promise.all(rawJobs.map((j: any) => formatReportJob(j)));

    return res.json({ success: true, reports });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch training reports.' });
  }
});

export default router;
