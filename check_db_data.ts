import { getDb } from './src/server/db';

async function main() {
  const db = getDb();
  console.log('--- Database Deep Inspection ---');
  try {
    // 1. Events list
    const events = await db.query('SELECT id, title, starts_at, status FROM events');
    console.log('\n--- events ---');
    console.log(events);

    // 2. Counts in tables
    const tables = [
      'children',
      'parent_profiles',
      'child_event_entries',
      'attendance_records',
      'event_safety_alerts',
      'offline_sync_records',
      'device_readiness_logs',
      'event_duty_devices',
      'event_duty_assignments',
      'pickup_people',
      'incident_records',
      'event_age_groups',
      'event_locations'
    ];

    console.log('\n--- Table Counts ---');
    for (const t of tables) {
      try {
        const res = await db.query(`SELECT count(*) as count FROM ${t}`);
        console.log(`${t}:`, res[0]?.count);
      } catch (err: any) {
        console.log(`${t}: Table query failed:`, err.message);
      }
    }

    // 3. Child entries grouped by event_id and status
    console.log('\n--- child_event_entries by Event & Status ---');
    try {
      const entries = await db.query('SELECT event_id, status, count(*) as count, count(checked_in_at) as checked_in, count(picked_up_at) as picked_up FROM child_event_entries GROUP BY event_id, status');
      console.log(entries);
    } catch (err: any) {
      console.log('Failed:', err.message);
    }

    // 4. Sample attendance records
    console.log('\n--- Sample attendance_records ---');
    try {
      const records = await db.query('SELECT * FROM attendance_records LIMIT 5');
      console.log(records);
    } catch (err: any) {
      console.log('Failed:', err.message);
    }

    // 5. Sample safety alerts
    console.log('\n--- Sample safety alerts count and sample ---');
    try {
      const alerts = await db.query('SELECT event_id, status, count(*) as count FROM event_safety_alerts GROUP BY event_id, status');
      console.log(alerts);
    } catch (err: any) {
      console.log('Failed:', err.message);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    console.log('--- Finished deep inspection ---');
    process.exit(0);
  }
}

main();
