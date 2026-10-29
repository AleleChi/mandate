import dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local' });
process.env.SKIP_DB_SCHEMA_INIT = 'true';

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { queryOne, query, execute } from '../src/server/db';
import { 
  requestReportJob, 
  processQueuedReportJobs, 
  getOrRegenerateReportPDF, 
  formatReportFilename,
  REPORT_TEMPLATES 
} from '../src/server/services/reportService';

const LOCAL_STORAGE_DIR = path.join(process.cwd(), 'data', 'reports');

async function waitForJobReady(jobId: string, timeoutMs = 30000): Promise<any> {
  const start = Date.now();
  await processQueuedReportJobs();
  while (Date.now() - start < timeoutMs) {
    const job = await queryOne('SELECT * FROM report_jobs WHERE id = ?', [jobId]);
    if (job?.status === 'ready' || job?.status === 'completed') {
      const gen = await queryOne('SELECT * FROM generated_reports WHERE report_job_id = ?', [jobId]);
      if (gen) {
        return job;
      }
    }
    if (job?.status === 'failed') {
      throw new Error(`Job ${jobId} failed with error: ${job.error_code}`);
    }
    await processQueuedReportJobs();
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`Timeout waiting for job ${jobId}`);
}

async function runLifecycleTest() {
  console.log('====================================================');
  console.log('STARTING REPORT DOWNLOAD & ARTIFACT LIFECYCLE TEST');
  console.log('====================================================\n');

  // 1. Get Event and Admin user
  const event = await queryOne("SELECT id, title FROM events WHERE title ILIKE '%General Assembly%' LIMIT 1");
  const eventId = event ? event.id : 'event-ga-2026';
  const adminUser = await queryOne("SELECT id, email, role FROM users WHERE role IN ('super_admin', 'admin') LIMIT 1");
  assert.ok(adminUser, 'Admin user must exist in DB');
  console.log(`Using Admin User: ${adminUser.email} (${adminUser.role}, ID: ${adminUser.id})`);
  console.log(`Using Event: ${event?.title || eventId} (${eventId})\n`);

  // 2. Test 1: Attendance & Movement Report with Simulating Missing Local PDF File
  console.log('--- TEST 1: Attendance & Movement Report (Ephemeral Local Storage Simulation) ---');
  const attJobId = await requestReportJob(
    eventId,
    null,
    'attendance-movement',
    adminUser.id,
    adminUser.role,
    'Internal operational',
    ['Attendance & movement', 'Key observations'],
    { timezone: 'Africa/Lagos' }
  );
  console.log(`  1. Queued job: ${attJobId}`);

  const attJob = await waitForJobReady(attJobId);
  console.log(`  2. Job status confirmed: ${attJob.status}`);
  assert.strictEqual(attJob.status, 'ready');

  // Verify preview data exists
  const attGen = await queryOne('SELECT * FROM generated_reports WHERE report_job_id = ?', [attJobId]);
  assert.ok(attGen, 'generated_reports row must exist');
  assert.ok(attGen.document_model_json, 'document_model_json must be stored in database');
  const storedDoc = JSON.parse(attGen.document_model_json);
  console.log(`  3. Preview data verified: Title="${storedDoc.reportTitle}", KPIs=${storedDoc.kpis?.length || 0}`);

  // Simulate missing local PDF file (as occurs across Netlify serverless invocations / cold starts)
  const diskPath = path.join(LOCAL_STORAGE_DIR, path.basename(attGen.storage_key || `${attJobId}.pdf`));
  if (fs.existsSync(diskPath)) {
    fs.unlinkSync(diskPath);
    console.log(`  4. Simulated ephemeral loss: Deleted local file ${diskPath}`);
  } else {
    console.log(`  4. File already not on local disk: ${diskPath}`);
  }
  assert.strictEqual(fs.existsSync(diskPath), false, 'Local disk file must be absent to test resilience');

  // Attempt download via getOrRegenerateReportPDF
  console.log('  5. Requesting download / artifact resolution with local file missing...');
  const artifact = await getOrRegenerateReportPDF(attJobId);
  assert.ok(artifact, 'Artifact must be successfully returned even when local file is missing');
  assert.strictEqual(artifact.fromCache, false, 'Artifact must have been regenerated on-the-fly from immutable data');
  assert.ok(artifact.pdfBytes.length > 1000, `PDF must have substantial length, got: ${artifact.pdfBytes.length}`);

  // Confirm PDF begins with valid PDF signature (%PDF)
  const magic = artifact.pdfBytes.toString('utf8', 0, 4);
  console.log(`  6. Verifying magic header: "${magic}"`);
  assert.strictEqual(magic, '%PDF', 'Artifact must begin with %PDF magic header');

  // Confirm filename formatting
  console.log(`  7. Verifying filename: "${artifact.filename}"`);
  assert.ok(artifact.filename.endsWith('.pdf'));
  assert.ok(artifact.filename.includes('Attendance'));

  // Confirm historical snapshot was used without recalculation
  assert.strictEqual(artifact.docModel.reportId, storedDoc.reportId, 'Must preserve identical historical report ID');
  assert.strictEqual(artifact.docModel.kpis?.length, storedDoc.kpis?.length, 'Must preserve identical historical KPI count');
  console.log('  ✓ Test 1 PASSED: Attendance & Movement report resiliently regenerated from immutable snapshot!\n');

  // 3. Test Newly Generated: Volunteer Coverage Report
  console.log('--- TEST 2: Volunteer Coverage Report ---');
  const volJobId = await requestReportJob(
    eventId,
    null,
    'volunteer-coverage',
    adminUser.id,
    adminUser.role,
    'Internal operational',
    ['Volunteer coverage', 'Key observations'],
    { timezone: 'Africa/Lagos' }
  );
  console.log(`  1. Queued job: ${volJobId}`);
  const volJob = await waitForJobReady(volJobId);
  assert.strictEqual(volJob.status, 'ready');

  const volGen = await queryOne('SELECT * FROM generated_reports WHERE report_job_id = ?', [volJobId]);
  const volDiskPath = path.join(LOCAL_STORAGE_DIR, path.basename(volGen.storage_key || `${volJobId}.pdf`));
  if (fs.existsSync(volDiskPath)) fs.unlinkSync(volDiskPath);

  const volArtifact = await getOrRegenerateReportPDF(volJobId);
  assert.ok(volArtifact, 'Volunteer artifact must resolve');
  assert.strictEqual(volArtifact.pdfBytes.toString('utf8', 0, 4), '%PDF');
  console.log(`  ✓ Test 2 PASSED: Volunteer report generated and regenerated without disk dependency (${volArtifact.pdfBytes.length} bytes)\n`);

  // 4. Test Newly Generated: Registration Report
  console.log('--- TEST 3: Registration & Demographics Report ---');
  const regJobId = await requestReportJob(
    eventId,
    null,
    'registration-selection',
    adminUser.id,
    adminUser.role,
    'Internal operational',
    ['Registration & selection', 'Participation profile', 'Key observations'],
    { timezone: 'Africa/Lagos' }
  );
  console.log(`  1. Queued job: ${regJobId}`);
  const regJob = await waitForJobReady(regJobId);
  assert.strictEqual(regJob.status, 'ready');

  const regGen = await queryOne('SELECT * FROM generated_reports WHERE report_job_id = ?', [regJobId]);
  const regDiskPath = path.join(LOCAL_STORAGE_DIR, path.basename(regGen.storage_key || `${regJobId}.pdf`));
  if (fs.existsSync(regDiskPath)) fs.unlinkSync(regDiskPath);

  const regArtifact = await getOrRegenerateReportPDF(regJobId);
  assert.ok(regArtifact, 'Registration artifact must resolve');
  assert.strictEqual(regArtifact.pdfBytes.toString('utf8', 0, 4), '%PDF');
  console.log(`  ✓ Test 3 PASSED: Registration report generated and regenerated without disk dependency (${regArtifact.pdfBytes.length} bytes)\n`);

  // 5. Test Newly Generated: Safety & Incident Report
  console.log('--- TEST 4: Safety & Incident Report ---');
  const safJobId = await requestReportJob(
    eventId,
    null,
    'care-safety-summary',
    adminUser.id,
    adminUser.role,
    'Internal operational',
    ['Care & safety', 'Key observations'],
    { timezone: 'Africa/Lagos' }
  );
  console.log(`  1. Queued job: ${safJobId}`);
  const safJob = await waitForJobReady(safJobId);
  assert.strictEqual(safJob.status, 'ready');

  const safGen = await queryOne('SELECT * FROM generated_reports WHERE report_job_id = ?', [safJobId]);
  const safDiskPath = path.join(LOCAL_STORAGE_DIR, path.basename(safGen.storage_key || `${safJobId}.pdf`));
  if (fs.existsSync(safDiskPath)) fs.unlinkSync(safDiskPath);

  const safArtifact = await getOrRegenerateReportPDF(safJobId);
  assert.ok(safArtifact, 'Safety artifact must resolve');
  assert.strictEqual(safArtifact.pdfBytes.toString('utf8', 0, 4), '%PDF');
  console.log(`  ✓ Test 4 PASSED: Safety report generated and regenerated without disk dependency (${safArtifact.pdfBytes.length} bytes)\n`);

  // 6. Test Historical Ready Reports in DB
  console.log('--- TEST 5: Existing Historical Reports in Production DB ---');
  const existingJobs = await query(`
    SELECT rj.id, rj.template_key, rj.status, rj.created_at, gr.storage_key
    FROM report_jobs rj
    JOIN generated_reports gr ON rj.id = gr.report_job_id
    WHERE rj.status IN ('ready', 'completed')
    ORDER BY rj.created_at ASC
    LIMIT 3
  `);
  console.log(`  Found ${existingJobs.length} existing historical reports to test.`);
  for (const histJob of existingJobs) {
    // Ensure no local disk file exists
    const histPath = path.join(LOCAL_STORAGE_DIR, path.basename(histJob.storage_key || `${histJob.id}.pdf`));
    if (fs.existsSync(histPath)) fs.unlinkSync(histPath);

    const histArtifact = await getOrRegenerateReportPDF(histJob.id);
    assert.ok(histArtifact, `Historical report ${histJob.id} must be recoverable`);
    assert.strictEqual(histArtifact.pdfBytes.toString('utf8', 0, 4), '%PDF');
    console.log(`  ✓ Historical report ${histJob.id} (${histJob.template_key}) recovered: ${histArtifact.filename} (${histArtifact.pdfBytes.length} bytes)`);
  }

  console.log('\n====================================================');
  console.log('ALL DOWNLOAD LIFECYCLE TESTS COMPLETED SUCCESSFULLY!');
  console.log('====================================================');
}

runLifecycleTest()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
