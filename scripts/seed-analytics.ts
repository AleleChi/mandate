import { getDb, query, execute } from '../src/server/db';

async function seed() {
  console.log('=== Starting High-Fidelity Analytics Seeding ===');

  const eventId = 'event-ga-2026';
  const db = getDb();

  try {
    // 1. Clean existing records to avoid duplicate primary key or unique key errors
    console.log('Cleaning old test records...');
    await execute("DELETE FROM attendance_records WHERE child_event_entry_id LIKE 'entry-seed-%'");
    await execute("DELETE FROM event_safety_alerts WHERE event_id = ?", [eventId]);
    await execute("DELETE FROM incident_records WHERE event_id = ?", [eventId]);
    await execute("DELETE FROM offline_sync_records WHERE event_id = ?", [eventId]);
    await execute("DELETE FROM device_readiness_logs WHERE event_id = ?", [eventId]);
    await execute("DELETE FROM event_duty_assignments WHERE event_id = ?", [eventId]);
    await execute("DELETE FROM event_duty_devices WHERE event_id = ?", [eventId]);
    await execute("DELETE FROM event_locations WHERE event_id = ?", [eventId]);
    await execute("DELETE FROM child_event_entries WHERE event_id = ? AND id LIKE 'entry-seed-%'", [eventId]);
    await execute("DELETE FROM children WHERE id LIKE 'child-seed-%'");

    // 2. Seed Locations
    console.log('Seeding Event Locations...');
    const locations = [
      { id: 'loc-grace-hall', name: 'Grace Hall Primary', type: 'room', capacity: 40, age: 'Ages 4 to 6' },
      { id: 'loc-main-pavilion', name: 'Main Auditorium Pavilion', type: 'hall', capacity: 100, age: 'Ages 7 to 9' },
      { id: 'loc-teens-chapel', name: 'Teens Upper Chapel', type: 'room', capacity: 50, age: 'Teens' },
      { id: 'loc-nursery', name: 'Infant Care Suite', type: 'room', capacity: 20, age: 'Ages 1 to 3' }
    ];

    for (const loc of locations) {
      await execute(`
        INSERT INTO event_locations (
          id, event_id, location_type, name, short_name, description, capacity, age_group_key, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `, [
        loc.id, eventId, loc.type, loc.name, loc.id.slice(4).toUpperCase(), `Dedicated zone for ${loc.age}`,
        loc.capacity, loc.age, new Date().toISOString(), new Date().toISOString()
      ]);
    }

    // 3. Seed Children and Event Entries
    console.log('Seeding Children & Event Entries...');
    const testChildren = [
      // Ages 4 to 6 (Grace Hall)
      { id: 'child-seed-1', name: 'Daniel Adeniran', dob: '2021-02-14', gender: 'Male', status: 'checked_in', room: 'loc-grace-hall' },
      { id: 'child-seed-2', name: 'Deborah Eze', dob: '2020-09-01', gender: 'Female', status: 'checked_in', room: 'loc-grace-hall' },
      { id: 'child-seed-3', name: 'Joshua Bello', dob: '2021-05-18', gender: 'Male', status: 'picked_up', room: 'loc-grace-hall' },
      { id: 'child-seed-4', name: 'Michelle Okoro', dob: '2020-11-30', gender: 'Female', status: 'picked_up', room: 'loc-grace-hall' },
      { id: 'child-seed-5', name: 'Tunde Bakare', dob: '2021-01-05', gender: 'Male', status: 'pass_ready', room: 'loc-grace-hall' },
      
      // Ages 7 to 9 (Main Pavilion)
      { id: 'child-seed-6', name: 'Ester Nwachukwu', dob: '2018-04-12', gender: 'Female', status: 'checked_in', room: 'loc-main-pavilion' },
      { id: 'child-seed-7', name: 'Caleb Alabi', dob: '2017-08-25', gender: 'Male', status: 'checked_in', room: 'loc-main-pavilion' },
      { id: 'child-seed-8', name: 'Victoria Yusuf', dob: '2018-12-05', gender: 'Female', status: 'picked_up', room: 'loc-main-pavilion' },
      { id: 'child-seed-9', name: 'Ephraim Chinedu', dob: '2017-10-14', gender: 'Male', status: 'picked_up', room: 'loc-main-pavilion' },
      { id: 'child-seed-10', name: 'Abigail Williams', dob: '2019-02-28', gender: 'Female', status: 'selected', room: 'loc-main-pavilion' },

      // Teens (Teens Chapel)
      { id: 'child-seed-11', name: 'Emmanuel Adebayo', dob: '2012-07-22', gender: 'Male', status: 'checked_in', room: 'loc-teens-chapel' },
      { id: 'child-seed-12', name: 'Joy Chukwuma', dob: '2011-03-09', gender: 'Female', status: 'checked_in', room: 'loc-teens-chapel' },
      { id: 'child-seed-13', name: 'David Igwe', dob: '2012-11-15', gender: 'Male', status: 'picked_up', room: 'loc-teens-chapel' },
      { id: 'child-seed-14', name: 'Blessing Paul', dob: '2011-10-04', gender: 'Female', status: 'selected', room: 'loc-teens-chapel' },

      // Ages 1 to 3 (Nursery Suite)
      { id: 'child-seed-15', name: 'Solomon Davies', dob: '2023-01-20', gender: 'Male', status: 'checked_in', room: 'loc-nursery' },
      { id: 'child-seed-16', name: 'Praise George', dob: '2024-03-15', gender: 'Female', status: 'checked_in', room: 'loc-nursery' },
      { id: 'child-seed-17', name: 'Israel Edet', dob: '2023-08-11', gender: 'Male', status: 'pass_ready', room: 'loc-nursery' }
    ];

    // Dynamically look up or create admin users
    const adminRows = await query("SELECT id FROM users WHERE role IN ('admin', 'super_admin')");
    let adminIds: string[] = [];
    if (adminRows && adminRows.length >= 4) {
      adminIds = adminRows.map((r: any) => r.id);
      console.log(`Using existing admin/super_admin users:`, adminIds);
    } else {
      console.log('Fewer than 4 admins found, creating standard fallback admins...');
      const fallbackAdmins = [
        { id: 'admin-user-id-2026', email: 'admin@koinonia.org', role: 'super_admin' },
        { id: 'admin-user-id-2026-1', email: 'admin1@koinonia.org', role: 'admin' },
        { id: 'admin-user-id-2026-2', email: 'admin2@koinonia.org', role: 'admin' },
        { id: 'admin-user-id-2026-3', email: 'admin3@koinonia.org', role: 'admin' },
        { id: 'admin-user-id-2026-4', email: 'admin4@koinonia.org', role: 'admin' },
      ];
      for (const adm of fallbackAdmins) {
        const exists = await query('SELECT id FROM users WHERE id = ?', [adm.id]);
        if (!exists || exists.length === 0) {
          await execute(`
            INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
            VALUES (?, ?, 'seeded_hash', ?, ?, ?)
          `, [adm.id, adm.email, adm.role, new Date().toISOString(), new Date().toISOString()]);
        }
        adminIds.push(adm.id);
      }
    }

    const admin1 = adminIds[0];
    const admin2 = adminIds[1] || adminIds[0];
    const admin3 = adminIds[2] || adminIds[0];
    const admin4 = adminIds[3] || adminIds[0];
    const admin5 = adminIds[4] || adminIds[0];
    const staffId = admin2; // Check-in operator
    
    // Dynamically look up an existing parent profile to satisfy foreign key constraints
    const parentRows = await query('SELECT id FROM parent_profiles LIMIT 1');
    let parentId = 'parent-profile-id-2026';
    if (parentRows && parentRows.length > 0) {
      parentId = parentRows[0].id;
      console.log(`Using existing parent profile ID: ${parentId}`);
    } else {
      console.log('No parent profile found, creating a default one...');
      const fallbackUserId = 'parent-user-id-2026';
      const userExists = await query('SELECT id FROM users WHERE id = ?', [fallbackUserId]);
      if (!userExists || userExists.length === 0) {
        await execute(`
          INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
          VALUES (?, 'parent@koinonia.org', 'seeded_hash', 'parent', ?, ?)
        `, [fallbackUserId, new Date().toISOString(), new Date().toISOString()]);
      }
      await execute(`
        INSERT INTO parent_profiles (id, user_id, full_name, email, created_at, updated_at)
        VALUES (?, ?, 'Seeded Parent', 'parent@koinonia.org', ?, ?)
      `, [parentId, fallbackUserId, new Date().toISOString(), new Date().toISOString()]);
    }

    for (const c of testChildren) {
      // Calculate current age
      const dobDate = new Date(c.dob);
      const today = new Date('2026-07-12'); // matching event context timezone
      let age = today.getFullYear() - dobDate.getFullYear();
      const m = today.getMonth() - dobDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
        age--;
      }

      let ageGroupStr = 'Ages 4 to 6';
      if (age < 1) ageGroupStr = 'Below 1';
      else if (age >= 1 && age <= 3) ageGroupStr = 'Ages 1 to 3';
      else if (age >= 4 && age <= 6) ageGroupStr = 'Ages 4 to 6';
      else if (age >= 7 && age <= 9) ageGroupStr = 'Ages 7 to 9';
      else if (age >= 10 && age <= 12) ageGroupStr = 'Ages 10 to 12';
      else if (age >= 13) ageGroupStr = 'Teens';

      // Create child record
      await execute(`
        INSERT INTO children (
          id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, needs_age_review, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Parent', 0, ?, ?)
      `, [
        c.id, parentId, c.name, c.gender, c.dob, age, ageGroupStr,
        new Date().toISOString(), new Date().toISOString()
      ]);

      // Create child event entry
      const entryId = `entry-seed-${c.id.split('-').pop()}`;
      
      let checkedInAt: string | null = null;
      let pickedUpAt: string | null = null;

      if (c.status === 'checked_in' || c.status === 'picked_up') {
        checkedInAt = '2026-11-18T09:30:00.000Z';
      }
      if (c.status === 'picked_up') {
        pickedUpAt = '2026-11-18T16:15:00.000Z';
      }

      await execute(`
        INSERT INTO child_event_entries (
          id, child_id, event_id, status, school_class, school_name, submitted_at, information_confirmed, details_confirmed, 
          checked_in_at, checked_in_by, picked_up_at, picked_up_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?)
      `, [
        entryId, c.id, eventId, c.status, 'Grade Level', 'Lighthouse Academy', new Date().toISOString(),
        checkedInAt, checkedInAt ? staffId : null,
        pickedUpAt, pickedUpAt ? staffId : null,
        new Date().toISOString(), new Date().toISOString()
      ]);

      // Seed attendance check-in record
      if (checkedInAt) {
        await execute(`
          INSERT INTO attendance_records (
            id, child_event_entry_id, action_type, action_time, staff_user_id, gate_location, sync_source, idempotency_key, created_at
          ) VALUES (?, ?, 'check_in', ?, ?, ?, 'online_device', ?, ?)
        `, [
          `att-seed-in-${c.id.split('-').pop()}`, entryId, checkedInAt, staffId, c.room, `key-in-${entryId}`, new Date().toISOString()
        ]);
      }

      // Seed attendance checkout record
      if (pickedUpAt) {
        await execute(`
          INSERT INTO attendance_records (
            id, child_event_entry_id, action_type, action_time, staff_user_id, gate_location, sync_source, idempotency_key, created_at
          ) VALUES (?, ?, 'check_out', ?, ?, ?, 'online_device', ?, ?)
        `, [
          `att-seed-out-${c.id.split('-').pop()}`, entryId, pickedUpAt, staffId, c.room, `key-out-${entryId}`, new Date().toISOString()
        ]);
      }
    }

    // 4. Seed Duty Devices
    console.log('Seeding Duty Devices...');
    const dutyDevices = [
      { id: 'dev-seed-1', label: 'Operator Tab 1 - Grace Hall', role: 'admin', status: 'connected', user: admin2 },
      { id: 'dev-seed-2', label: 'Operator Tab 2 - Main Pavilion', role: 'admin', status: 'connected', user: admin3 },
      { id: 'dev-seed-3', label: 'Safety Rover - Grace Hall Zone', role: 'safeguarding_lead', status: 'connected', user: admin4 },
      { id: 'dev-seed-4', label: 'Coordinator Board - Central Command', role: 'super_admin', status: 'connected', user: admin1 }
    ];

    for (const dev of dutyDevices) {
      await execute(`
        INSERT INTO event_duty_devices (
          id, user_id, role, event_id, device_label, app_generated_device_id, live_connection_status, readiness_status, readiness_checked_at, duty_started_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)
      `, [
        dev.id, dev.user, dev.role, eventId, dev.label, `guid-${dev.id}`, dev.status,
        new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), new Date().toISOString()
      ]);

      // Seed readiness logs
      await execute(`
        INSERT INTO device_readiness_logs (
          id, event_id, user_id, role, device_id, readiness_status, critical_passed, sound_ready, push_ready, voice_ready, vibration_supported, live_connection_state, check_timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, 'ready', 1, 1, 1, 1, 1, 'connected', ?, ?)
      `, [
        `log-${dev.id}`, eventId, dev.user, dev.role, dev.id, new Date().toISOString(), new Date().toISOString()
      ]);
    }

    // 5. Seed Duty Assignments
    console.log('Seeding Duty Assignments...');
    const assignments = [
      { id: 'asg-seed-1', user: admin2, location: 'loc-grace-hall', role: 'Room Operator' },
      { id: 'asg-seed-2', user: admin3, location: 'loc-main-pavilion', role: 'Room Operator' },
      { id: 'asg-seed-3', user: admin4, location: 'loc-teens-chapel', role: 'Room Operator' },
      { id: 'asg-seed-4', user: admin5 || admin1, location: 'loc-grace-hall', role: 'Safety Marshal' }
    ];

    for (const asg of assignments) {
      await execute(`
        INSERT INTO event_duty_assignments (
          id, event_id, user_id, responsibility_key, assigned_location_id, status, starts_at, ends_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
      `, [
        asg.id, eventId, asg.user, asg.role, asg.location, new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), new Date().toISOString()
      ]);
    }

    // 6. Seed Safety Alerts
    console.log('Seeding Safety Alerts...');
    const alerts = [
      {
        id: 'alert-seed-1',
        childId: 'child-seed-1',
        entryId: 'entry-seed-1',
        category: 'Medical',
        severity: 'critical',
        title: 'Mild Asthma Wheezing Reported',
        message: 'Daniel reported tight chest. Administered inhaler per plan at room station, symptoms resolving.',
        loc: 'Grace Hall Primary',
        status: 'resolved',
        ackBy: admin4,
        resBy: admin4
      },
      {
        id: 'alert-seed-2',
        childId: 'child-seed-6',
        entryId: 'entry-seed-6',
        category: 'Safeguarding',
        severity: 'warning',
        title: 'Unregistered Parent Loitering',
        message: 'Adult without verified badge spotted near entry point. Security escorted person to registry board.',
        loc: 'Main Auditorium Pavilion',
        status: 'acknowledged',
        ackBy: admin3,
        resBy: null
      }
    ];

    for (const alt of alerts) {
      await execute(`
        INSERT INTO event_safety_alerts (
          id, event_id, child_id, child_event_entry_id, raised_by_user_id, raised_by_role, severity, category, title, message, location_label, status, acknowledged_by, acknowledged_at, resolved_by, resolved_at, resolution_note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        alt.id, eventId, alt.childId, alt.entryId, admin2, alt.severity, alt.category, alt.title, alt.message, alt.loc, alt.status,
        alt.ackBy, alt.ackBy ? new Date().toISOString() : null,
        alt.resBy, alt.resBy ? new Date().toISOString() : null,
        alt.resBy ? 'Verified and resolving cleanly.' : null,
        new Date().toISOString(), new Date().toISOString()
      ]);
    }

    // 7. Seed Incident Records
    console.log('Seeding Incident Records...');
    await execute(`
      INSERT INTO incident_records (
        id, alert_id, event_id, creator_user_id, status, category, title, description, structured_data, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'resolved', 'Medical', 'Recess Scuffed Knee', 'Grace scraped knee on playground structure. Cleaned and adhesive dressing applied by first-aid team.', '{}', ?, ?)
    `, [
      'inc-seed-1', 'alert-seed-1', eventId, admin2, new Date().toISOString(), new Date().toISOString()
    ]);

    // 8. Seed Offline Sync Logs
    console.log('Seeding Offline Sync Logs...');
    const syncs = [
      { id: 'sync-seed-1', type: 'registration_scan', count: 12 },
      { id: 'sync-seed-2', type: 'checkout_scan', count: 8 },
      { id: 'sync-seed-3', type: 'device_logs_audit', count: 4 }
    ];

    for (const syn of syncs) {
      await execute(`
        INSERT INTO offline_sync_records (
          id, event_id, staff_user_id, device_identifier, sync_type, record_count, payload_hash, status, created_at
        ) VALUES (?, ?, ?, 'device-terminal-01', ?, ?, 'sha256-verified-ok', 'success', ?)
      `, [
        syn.id, eventId, admin2, syn.type, syn.count, new Date().toISOString()
      ]);
    }

    console.log('=== Seeding Complete Successfully! ===');
    const tableCounts = await query(`
      SELECT 
        (SELECT count(*) FROM event_locations) as locations,
        (SELECT count(*) FROM children) as children,
        (SELECT count(*) FROM child_event_entries) as entries,
        (SELECT count(*) FROM attendance_records) as attendance,
        (SELECT count(*) FROM event_duty_devices) as devices,
        (SELECT count(*) FROM event_duty_assignments) as assignments,
        (SELECT count(*) FROM event_safety_alerts) as alerts,
        (SELECT count(*) FROM incident_records) as incidents,
        (SELECT count(*) FROM offline_sync_records) as syncs
    `);
    console.log('New Table Metrics:', tableCounts[0]);
    process.exit(0);

  } catch (error) {
    console.error('Error during high-fidelity analytics seeding:', error);
    process.exit(1);
  }
}

seed();
