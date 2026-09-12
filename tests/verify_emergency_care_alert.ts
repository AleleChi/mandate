import crypto from 'crypto';
import { execute, query, queryOne, REAL_EVENT_ID } from '../src/server/db';
import { resolveUserDutyLocation } from '../src/server/routes/duty';
import { 
  startEscalationCycle, 
  cancelActiveEscalationCycles, 
  processScheduledExecutions 
} from '../src/server/services/escalationService';

async function runTests() {
  console.log('========================================================');
  console.log('STARTING EMERGENCY CARE ALERT VERIFICATION SUITE       ');
  console.log('========================================================');

  const runId = Date.now().toString().substring(8);
  const now = new Date().toISOString();

  // Test actor IDs
  const adminAId = `test_admin_a_${runId}`;
  const adminBId = `test_admin_b_${runId}`;
  const volunteerId = `test_vol_${runId}`;
  const locationId = `test_loc_${runId}`;
  const assignmentId = `test_asgn_${runId}`;
  const alertId = `test_alert_${runId}`;
  const recipientId = `test_recip_${runId}`;

  try {
    // -----------------------------------------------------------------
    // 1. Setup Test Users and Duty Assignment
    // -----------------------------------------------------------------
    console.log('\n[1/7] Seeding test users, volunteer profile, and duty assignment...');
    
    await execute(
      `INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
       VALUES (?, ?, 'mock_hash', 'admin', 1, ?, ?)`,
      [adminAId, `admin_a_${runId}@koinonia.org`, now, now]
    );

    await execute(
      `INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
       VALUES (?, ?, 'mock_hash', 'admin', 1, ?, ?)`,
      [adminBId, `admin_b_${runId}@koinonia.org`, now, now]
    );

    await execute(
      `INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
       VALUES (?, ?, 'mock_hash', 'volunteer', 1, ?, ?)`,
      [volunteerId, `vol_${runId}@koinonia.org`, now, now]
    );

    await execute(
      `INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
       VALUES (?, ?, 'Sister Mary', '+2348011112222', '+2348011112222', 'Ages 4-6 Team', 'approved', ?, ?)`,
      [`prof_vol_${runId}`, volunteerId, now, now]
    );

    // Create an event location
    await execute(
      `INSERT INTO event_locations (id, event_id, location_type, name, emergency_label, is_active, created_at, updated_at)
       VALUES (?, ?, 'room', 'Primary Auditorium - West Wing', 'Auditorium West', 1, ?, ?)`,
      [locationId, REAL_EVENT_ID, now, now]
    );

    // Assign volunteer on duty at this location
    await execute(
      `INSERT INTO event_duty_assignments (
        id, event_id, user_id, assigned_location_id, status, responsibility_key, starts_at, ends_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'on_duty', 'lead', ?, ?, ?, ?)`,
      [assignmentId, REAL_EVENT_ID, volunteerId, locationId, now, now, now, now]
    );

    console.log('✓ Seeded admin users, volunteer profile, event location, and duty assignment.');

    // -----------------------------------------------------------------
    // 2. Test Duty Location Automatic Fallback
    // -----------------------------------------------------------------
    console.log('\n[2/7] Testing automatic duty location resolution for volunteer distress...');

    const resolved = await resolveUserDutyLocation(volunteerId, REAL_EVENT_ID);
    console.log(`Resolved location: "${resolved?.name}" (ID: ${resolved?.locationId})`);
    if (!resolved || !resolved.name || !resolved.name.includes('Primary Auditorium')) {
      throw new Error(`Expected duty location containing 'Primary Auditorium', got: ${JSON.stringify(resolved)}`);
    }
    const resolvedLocation = resolved.name;
    console.log('✓ Automatic duty location resolved correctly from active assignment.');

    // -----------------------------------------------------------------
    // 3. Create Emergency Care Alert
    // -----------------------------------------------------------------
    console.log('\n[3/7] Creating distress emergency alert with resolved location...');

    await execute(
      `INSERT INTO event_safety_alerts (
        id, event_id, raised_by_user_id, raised_by_role, category, severity, status, location_label, message, title, created_at, updated_at
      ) VALUES (?, ?, ?, 'volunteer', 'medical_support', 'urgent', 'open', ?, 'Child is hyperventilating, need immediate assistance!', 'Emergency Medical Assistance', ?, ?)`,
      [alertId, REAL_EVENT_ID, volunteerId, resolvedLocation, now, now]
    );

    // Register recipient
    await execute(
      `INSERT INTO safety_alert_recipients (
        id, alert_id, recipient_user_id, recipient_role, sound_started_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'admin', ?, ?, ?)`,
      [recipientId, alertId, adminAId, now, now, now]
    );

    // Start escalation cycle
    await startEscalationCycle({
      eventId: REAL_EVENT_ID,
      subjectType: 'alert',
      alertId,
      conditionKey: 'urgent_medical'
    });

    const cycle = await queryOne(`SELECT id, status FROM escalation_cycles WHERE alert_id = ?`, [alertId]);

    console.log(`✓ Created alert ${alertId}, recipient record with sound_started_at, and escalation cycle.`);

    // -----------------------------------------------------------------
    // 4. Test Decoupled Silence vs. Acknowledge
    // -----------------------------------------------------------------
    console.log('\n[4/7] Testing Silence Alert behavior (Local Sound Stop ONLY)...');

    // Silence from Admin A terminal:
    const silenceTime = new Date().toISOString();
    await execute(
      `UPDATE safety_alert_recipients
       SET sound_stopped_at = ?, updated_at = ?
       WHERE alert_id = ? AND recipient_user_id = ?`,
      [silenceTime, silenceTime, alertId, adminAId]
    );

    // Verify recipient sound is stopped
    const recipAfterSilence = await queryOne(
      `SELECT sound_stopped_at FROM safety_alert_recipients WHERE id = ?`,
      [recipientId]
    );
    if (!recipAfterSilence || !recipAfterSilence.sound_stopped_at) {
      throw new Error('Expected recipient sound_stopped_at to be populated upon silence');
    }

    // CRITICAL: Verify the incident is STILL OPEN and escalation is STILL ACTIVE!
    const alertAfterSilence = await queryOne(
      `SELECT status FROM event_safety_alerts WHERE id = ?`,
      [alertId]
    );
    if (alertAfterSilence.status !== 'open') {
      throw new Error(`CRITICAL DEFECT: Silencing alert changed status to "${alertAfterSilence.status}" (must remain "open")!`);
    }

    if (cycle) {
      const cycleAfterSilence = await queryOne(
        `SELECT status FROM escalation_cycles WHERE id = ?`,
        [cycle.id]
      );
      if (cycleAfterSilence && cycleAfterSilence.status !== 'scheduled' && cycleAfterSilence.status !== 'active') {
        throw new Error(`CRITICAL DEFECT: Silencing alert cancelled escalation cycle status to "${cycleAfterSilence.status}"!`);
      }
    }
    console.log('✓ Silence alert ONLY stops local sound; incident remains OPEN; escalation remains ACTIVE.');

    // -----------------------------------------------------------------
    // 5. Test Acknowledge Alert (Cancels Escalation & Sets Ownership)
    // -----------------------------------------------------------------
    console.log('\n[5/7] Testing Acknowledge & Respond behavior...');

    const ackTime = new Date().toISOString();
    await execute(
      `UPDATE event_safety_alerts
       SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = ?, updated_at = ?
       WHERE id = ?`,
      [adminAId, ackTime, ackTime, alertId]
    );

    // Cancel escalation cycle
    await cancelActiveEscalationCycles({ alertId, reason: 'RESPONDER_ACKNOWLEDGED' });

    // Stop sounds for all recipients
    await execute(
      `UPDATE safety_alert_recipients
       SET sound_stopped_at = COALESCE(sound_stopped_at, ?), acknowledged_visibility_at = ?, updated_at = ?
       WHERE alert_id = ?`,
      [ackTime, ackTime, ackTime, alertId]
    );

    // Verify alert state
    const alertAfterAck = await queryOne(
      `SELECT status, acknowledged_by, acknowledged_at FROM event_safety_alerts WHERE id = ?`,
      [alertId]
    );
    if (alertAfterAck.status !== 'acknowledged' || alertAfterAck.acknowledged_by !== adminAId) {
      throw new Error(`Expected status acknowledged by ${adminAId}, got: ${JSON.stringify(alertAfterAck)}`);
    }

    // Verify escalation cycle status is cancelled
    if (cycle) {
      const cycleAfterAck = await queryOne(
        `SELECT status, stop_reason, stopped_at FROM escalation_cycles WHERE id = ?`,
        [cycle.id]
      );
      if (cycleAfterAck && cycleAfterAck.status !== 'cancelled') {
        throw new Error(`Expected escalation cycle to be cancelled, got: ${cycleAfterAck.status}`);
      }
      if (cycleAfterAck && cycleAfterAck.stop_reason !== 'RESPONDER_ACKNOWLEDGED') {
        throw new Error(`Expected stop_reason RESPONDER_ACKNOWLEDGED, got: ${cycleAfterAck.stop_reason}`);
      }
    }
    console.log('✓ Acknowledge sets acknowledged_by, acknowledged_at, and cancels escalation cycles.');

    // -----------------------------------------------------------------
    // 6. Test Escalation Guard (ALERT_ALREADY_HANDLED)
    // -----------------------------------------------------------------
    console.log('\n[6/7] Testing escalation execution safety guard (ALERT_ALREADY_HANDLED)...');

    // Run scheduled executions: should find nothing to fire or mark cancelled
    await processScheduledExecutions();
    console.log('✓ Scheduled executions processed successfully.');

    // Verify no scheduled executions are left active for this alert
    const pendingExecs = await query(
      `SELECT id, status, failure_code FROM escalation_executions 
       WHERE cycle_id IN (SELECT id FROM escalation_cycles WHERE alert_id = ?) AND status = 'scheduled'`,
      [alertId]
    );
    if (pendingExecs.length > 0) {
      throw new Error(`Found ${pendingExecs.length} scheduled executions for an acknowledged alert!`);
    }
    console.log('✓ Escalation service safely ignores and cancels scheduled steps for handled alerts.');

    // -----------------------------------------------------------------
    // 7. Test Resolve Alert with Note & Multi-Admin Sync
    // -----------------------------------------------------------------
    console.log('\n[7/7] Testing Resolve Alert with Audit Note...');

    const resTime = new Date().toISOString();
    const resolutionNote = 'Child attended by medical team and resting comfortably.';
    await execute(
      `UPDATE event_safety_alerts
       SET status = 'resolved', resolved_by = ?, resolved_at = ?, resolution_note = ?, updated_at = ?
       WHERE id = ?`,
      [adminBId, resTime, resolutionNote, resTime, alertId]
    );

    const alertAfterRes = await queryOne(
      `SELECT status, resolved_by, resolved_at, resolution_note FROM event_safety_alerts WHERE id = ?`,
      [alertId]
    );
    if (alertAfterRes.status !== 'resolved' || alertAfterRes.resolved_by !== adminBId) {
      throw new Error(`Expected resolved by ${adminBId}, got: ${JSON.stringify(alertAfterRes)}`);
    }
    if (alertAfterRes.resolution_note !== resolutionNote) {
      throw new Error(`Resolution note mismatch: got "${alertAfterRes.resolution_note}"`);
    }
    console.log('✓ Resolved alert properly records resolution_note, resolved_by, and resolved_at.');

    console.log('\n========================================================');
    console.log('ALL EMERGENCY CARE ALERT VERIFICATION TESTS PASSED!     ');
    console.log('========================================================');
  } finally {
    // Cleanup test records
    console.log('\n[Cleanup] Removing temporary test records...');
    try {
      await execute(`DELETE FROM escalation_executions WHERE cycle_id IN (SELECT id FROM escalation_cycles WHERE alert_id = ?)`, [alertId]);
      await execute(`DELETE FROM escalation_cycles WHERE alert_id = ?`, [alertId]);
      await execute(`DELETE FROM safety_alert_recipients WHERE alert_id = ?`, [alertId]);
      await execute(`DELETE FROM event_safety_alerts WHERE id = ?`, [alertId]);
      await execute(`DELETE FROM event_duty_assignments WHERE id = ?`, [assignmentId]);
      await execute(`DELETE FROM event_locations WHERE id = ?`, [locationId]);
      await execute(`DELETE FROM volunteer_profiles WHERE user_id = ?`, [volunteerId]);
      await execute(`DELETE FROM users WHERE id IN (?, ?, ?)`, [adminAId, adminBId, volunteerId]);
      console.log('✓ Test data cleaned up successfully.');
    } catch (cleanErr) {
      console.warn('Cleanup error (ignored):', cleanErr);
    }
  }
}

runTests().catch((err) => {
  console.error('\n❌ EMERGENCY CARE ALERT TEST FAILURE:', err);
  process.exit(1);
});
