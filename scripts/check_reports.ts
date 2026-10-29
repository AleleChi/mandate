import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local' });

const { Pool } = pg;

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('No DATABASE_URL in .env.production.local');
    return;
  }
  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  console.log('\n=== RECENT REPORT JOBS IN PROD ===');
  const jobs = await pool.query(`
    SELECT rj.id, rj.event_id, rj.requested_by, rj.template_key, rj.report_name, rj.status, rj.created_at,
           gr.id as gen_id, gr.storage_key, gr.file_size, gr.page_count,
           CASE WHEN gr.document_model_json IS NOT NULL THEN length(gr.document_model_json) ELSE 0 END as doc_json_len,
           CASE WHEN rs.snapshot_data IS NOT NULL THEN length(rs.snapshot_data) ELSE 0 END as snap_data_len
    FROM report_jobs rj
    LEFT JOIN generated_reports gr ON rj.id = gr.report_job_id
    LEFT JOIN report_snapshots rs ON rj.snapshot_id = rs.id
    ORDER BY rj.created_at DESC
    LIMIT 10
  `);
  console.log(JSON.stringify(jobs.rows, null, 2));

  console.log('\n=== CREATOR USER AUDIT ===');
  const userIds = [...new Set(jobs.rows.map((j: any) => j.requested_by).filter(Boolean))];
  if (userIds.length > 0) {
    const users = await pool.query(`
      SELECT u.id, u.email, u.role,
             pp.full_name as parent_name,
             vp.full_name as volunteer_name
      FROM users u
      LEFT JOIN parent_profiles pp ON u.id = pp.user_id
      LEFT JOIN volunteer_profiles vp ON u.id = vp.user_id
      WHERE u.id = ANY($1)
    `, [userIds]);
    console.log(JSON.stringify(users.rows, null, 2));
  }

  console.log('\n=== USERS TABLE COLUMNS ===');
  const userCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'users'
  `);
  console.log(JSON.stringify(userCols.rows, null, 2));

  await pool.end();
}

main().catch(console.error);
