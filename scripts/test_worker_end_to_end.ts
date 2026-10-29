import dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local' });
process.env.SKIP_DB_SCHEMA_INIT = 'true';

import { requestReportJob, processQueuedReportJobs } from '../src/server/services/reportService';
import { queryOne, execute } from '../src/server/db';
import assert from 'assert';

async function waitForReady(jobId: string, timeoutMs = 30000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await queryOne('SELECT id, status, error_code, completed_at, updated_at FROM report_jobs WHERE id = ?', [jobId]);
    if (job?.status === 'ready' || job?.status === 'completed') {
      return job;
    }
    if (job?.status === 'failed') {
      throw new Error(`Job failed with error: ${job.error_code}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for job ${jobId}`);
}

async function testWorker() {
  console.log('=== TESTING WORKER AND TRY-AGAIN END-TO-END ===\n');

  const event = await queryOne("SELECT id, title FROM events WHERE title ILIKE '%General Assembly%' LIMIT 1");
  const eventId = event ? event.id : 'event-ga-2026';
  const user = await queryOne("SELECT id FROM users WHERE role IN ('super_admin', 'admin') LIMIT 1");
  const userId = user?.id || 'admin-user';

  console.log('1. Queueing new Attendance & Movement report job...');
  const jobId = await requestReportJob(
    eventId,
    null,
    'attendance-movement',
    userId,
    'super_admin',
    'Internal operational',
    ['Attendance & movement', 'Participation profile', 'Key observations'],
    { timezone: 'Africa/Lagos' }
  );
  console.log('  Created job ID:', jobId);

  console.log('2. Waiting for background worker to complete job...');
  const finishedJob = await waitForReady(jobId);
  console.log('  Job status after worker processing:', finishedJob.status);
  assert.strictEqual(finishedJob.status, 'ready');

  const genReport = await queryOne('SELECT id, report_version, file_size, page_count, storage_key FROM generated_reports WHERE report_job_id = ?', [jobId]);
  console.log('  Generated report record:', genReport);
  assert.ok(genReport, 'Generated report row must exist');
  assert.strictEqual(genReport.report_version, 1);
  assert.ok(genReport.file_size > 0);

  console.log('\n3. Testing "Try Again" / Regeneration workflow on the report...');
  const now = new Date().toISOString();
  await execute(`
    UPDATE report_jobs 
    SET status = 'queued', snapshot_id = NULL, started_at = NULL, completed_at = NULL, attempt_count = 0, error_code = NULL, updated_at = ?
    WHERE id = ?
  `, [now, jobId]);

  // Trigger worker
  processQueuedReportJobs().catch(e => console.error(e));

  console.log('  Waiting for retried job to complete...');
  const retriedJob = await waitForReady(jobId);
  console.log('  Retried job status:', retriedJob.status);
  assert.strictEqual(retriedJob.status, 'ready');

  const updatedGenReport = await queryOne('SELECT id, report_version, file_size, page_count FROM generated_reports WHERE report_job_id = ?', [jobId]);
  console.log('  Updated generated report record:', updatedGenReport);
  assert.strictEqual(updatedGenReport?.report_version, 2, 'Report version should increment to 2');

  console.log('\n>>> WORKER AND TRY-AGAIN TEST PASSED COMPLETELY! <<<');
}

testWorker().then(() => process.exit(0)).catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
