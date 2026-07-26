import { getDb } from './src/server/db';

async function main() {
  const db = getDb();
  console.log('--- Database Connection Started ---');
  try {
    const jobs = await db.query('SELECT id, template_key, report_name, status, created_at, completed_at, error_code FROM report_jobs ORDER BY created_at DESC LIMIT 5');
    console.log('report_jobs:', jobs);

    const generated = await db.query('SELECT id, report_job_id, storage_key, file_size, page_count, generated_at FROM generated_reports ORDER BY generated_at DESC LIMIT 5');
    console.log('generated_reports:', generated);

    const snapshots = await db.query('SELECT count(*) as count FROM report_snapshots');
    console.log('report_snapshots count:', snapshots);
  } catch (err) {
    console.error('Error running queries:', err);
  } finally {
    console.log('--- Database Connection Finished ---');
    process.exit(0);
  }
}

main();
