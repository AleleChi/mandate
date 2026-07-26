import { getDb } from './src/server/db';

async function main() {
  const db = getDb();
  console.log('--- Checking Snapshot Data ---');
  try {
    const jobs = await db.query('SELECT rj.*, rs.snapshot_data FROM report_jobs rj JOIN report_snapshots rs ON rj.snapshot_id = rs.id ORDER BY rj.created_at DESC LIMIT 1');
    if (jobs.length === 0) {
      console.log('No jobs found!');
      return;
    }
    const job = jobs[0];
    console.log('Job ID:', job.id);
    console.log('Template Key:', job.template_key);
    console.log('Status:', job.status);
    console.log('Sections selected:', job.section_configuration);

    const snapshot = JSON.parse(job.snapshot_data);
    console.log('\n--- Snapshot Contents ---');
    console.log('Cutoff Time:', snapshot.cutoffTime);
    console.log('Event Title:', snapshot.event?.title);
    console.log('Event ID:', snapshot.event?.id);
    console.log('attendanceRecords Count:', snapshot.attendanceRecords?.length);
    console.log('childEntries Count:', snapshot.childEntries?.length);
    console.log('safetyAlerts Count:', snapshot.safetyAlerts?.length);
    console.log('syncRecords Count:', snapshot.syncRecords?.length);
    console.log('deviceReadiness Count:', snapshot.deviceReadiness?.length);
    console.log('dutyDevices Count:', snapshot.dutyDevices?.length);
    console.log('dutyAssignments Count:', snapshot.dutyAssignments?.length);
    console.log('pickupRecords Count:', snapshot.pickupRecords?.length);
    console.log('incidentRecords Count:', snapshot.incidentRecords?.length);
    console.log('ageGroups Count:', snapshot.ageGroups?.length);
    
    if (snapshot.childEntries?.length > 0) {
      console.log('Sample childEntry status:', snapshot.childEntries[0]);
    }
    if (snapshot.attendanceRecords?.length > 0) {
      console.log('Sample attendanceRecord:', snapshot.attendanceRecords[0]);
    }
  } catch (err) {
    console.error('Error running check:', err);
  } finally {
    console.log('--- Finished ---');
    process.exit(0);
  }
}

main();
