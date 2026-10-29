import { query, queryOne } from '../src/server/db';

async function diagnose() {
  console.log('=== 1. EVENTS ===');
  const events = await query('SELECT * FROM events');
  console.log(JSON.stringify(events, null, 2));

  console.log('=== 2. VOLUNTEER PROFILES ===');
  const profiles = await query('SELECT * FROM volunteer_profiles');
  console.log(JSON.stringify(profiles, null, 2));

  console.log('=== 3. USERS (Roles) ===');
  const users = await query('SELECT id, email, role FROM users');
  console.log(JSON.stringify(users, null, 2));

  console.log('=== 4. EVENT DUTY ASSIGNMENTS ===');
  const assignments = await query('SELECT * FROM event_duty_assignments');
  console.log(JSON.stringify(assignments, null, 2));

  console.log('=== 5. EVENT LOCATIONS ===');
  const locations = await query('SELECT id, event_id, name, location_label, is_active FROM event_locations');
  console.log(JSON.stringify(locations, null, 2));

  console.log('=== 6. CHILD EVENT ENTRIES ===');
  const entries = await query('SELECT event_id, status, count(*) as cnt FROM child_event_entries GROUP BY event_id, status');
  console.log(JSON.stringify(entries, null, 2));

  process.exit(0);
}

diagnose().catch(err => {
  console.error('Diagnosis failed:', err);
  process.exit(1);
});
