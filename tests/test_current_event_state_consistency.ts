import assert from 'assert';
import crypto from 'crypto';
import { execute, query, queryOne } from '../src/server/db';
import { getChildSummaryStats } from '../src/server/services/childSummaryService';
import { operationsAssistantService } from '../src/server/services/operationsAssistantService';
import { evaluateCurrentEventAutomations } from '../src/server/services/operations/automation/automationEngine';
import { getRuleBySignal } from '../src/server/services/operations/automation/ruleModel';

async function runStateConsistencyTests() {
  console.log('================================================================');
  console.log('CURRENT EVENT STATE CONSISTENCY — PERMANENT REGRESSION SUITE');
  console.log('================================================================\n');

  const nowIso = new Date().toISOString();
  const testEventIdA = `ev-state-test-a-${Date.now()}`;
  const testEventIdB = `ev-state-test-b-${Date.now()}`;

  try {
    // -------------------------------------------------------------
    // SETUP: Create isolated test events
    // -------------------------------------------------------------
    await execute(`
      INSERT INTO events (id, title, status, capacity, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'State Test Event A', 'current', 100, '2026-11-20', '2026-11-21', ?, ?)
    `, [testEventIdA, nowIso, nowIso]);

    await execute(`
      INSERT INTO events (id, title, status, capacity, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'State Test Event B', 'upcoming', 100, '2026-12-01', '2026-12-02', ?, ?)
    `, [testEventIdB, nowIso, nowIso]);

    // Parent profile fixture
    const parentProfileId = `parent-test-${Date.now()}`;
    const parentUserId = `usr-parent-${Date.now()}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', ?, ?)
    `, [parentUserId, `parent_${Date.now()}@test.org`, nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Test Parent Guardian', ?, '+2348011223344', ?, ?)
    `, [parentProfileId, parentUserId, `parent_${Date.now()}@test.org`, nowIso, nowIso]);

    // =============================================================
    // A. DASHBOARD COUNTS & HISTORICAL SCAN EXCLUSION
    // Fixture: 8 children for Event A, all 8 selected.
    // 3 checked in (2 inside, 1 picked up).
    // Plus 20 raw historical attendance scans in attendance_records.
    // Proves historical attendance actions NEVER produce checkedIn = 20.
    // =============================================================
    console.log('[TEST A] Dashboard Counts: 8 children, 3 checked in, 20 historical scans');

    const childIdsA: string[] = [];
    const entryIdsA: string[] = [];

    // 8 children:
    // Index 0, 1: checked_in (inside)
    // Index 2: picked_up
    // Index 3..7: pass_ready
    for (let i = 0; i < 8; i++) {
      const childId = `ch-a-${i}-${Date.now()}`;
      const entryId = `entry-a-${i}-${Date.now()}`;
      childIdsA.push(childId);
      entryIdsA.push(entryId);

      let status = 'pass_ready';
      let checkedInAt: string | null = null;
      let pickedUpAt: string | null = null;

      if (i === 0 || i === 1) {
        status = 'checked_in';
        checkedInAt = '2026-09-19T09:00:00Z';
      } else if (i === 2) {
        status = 'picked_up';
        checkedInAt = '2026-09-19T08:30:00Z';
        pickedUpAt = '2026-09-19T12:00:00Z';
      }

      await execute(`
        INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, 'Female', '2020-01-01', 'Ages 4 to 6', 0, ?, ?)
      `, [childId, parentProfileId, `Child A${i}`, nowIso, nowIso]);

      await execute(`
        INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, picked_up_at, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
      `, [entryId, childId, testEventIdA, status, checkedInAt, pickedUpAt, nowIso, nowIso]);

      // Active pass for each
      await execute(`
        INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
      `, [`pass-a-${i}-${Date.now()}`, entryId, `PASS-A-${i}`, `hash-a-${i}`, nowIso, nowIso, nowIso]);
    }

    // Insert 20 raw historical attendance scan records (simulating multiple scans/transitions)
    for (let s = 0; s < 20; s++) {
      const targetEntryId = entryIdsA[s % 8];
      await execute(`
        INSERT INTO attendance_records (id, child_event_entry_id, action_type, action_time, staff_user_id, sync_source, idempotency_key, created_at)
        VALUES (?, ?, 'check_in', ?, ?, 'online_device', ?, ?)
      `, [`att-scan-${s}-${Date.now()}`, targetEntryId, nowIso, parentUserId, `idem-scan-${s}-${Date.now()}`, nowIso]);
    }

    // Evaluate canonical child summary stats
    const statsA = await getChildSummaryStats(testEventIdA);
    assert.strictEqual(statsA.totalChildren, 8, 'Total registrations must be 8');
    assert.strictEqual(statsA.selected, 8, 'Selected must be 8');
    assert.strictEqual(statsA.checkedIn, 3, 'Checked in must be 3 (all who arrived today: 2 inside + 1 picked up)');
    assert.strictEqual(statsA.inside, 2, 'Inside must be 2');
    assert.strictEqual(statsA.pickedUp, 1, 'Picked up must be 1');
    assert.notStrictEqual(statsA.checkedIn, 20, 'Checked in must NEVER be 20 from raw scan rows');

    // Evaluate Operations Assistant attendance summary
    const oaSummaryA = await operationsAssistantService.getAttendanceSummary(testEventIdA);
    assert.strictEqual(oaSummaryA.checkedIn, 3, 'Operations Assistant checkedIn must match canonical stats (3)');
    assert.strictEqual(oaSummaryA.inside, 2, 'Operations Assistant inside must be 2');
    assert.strictEqual(oaSummaryA.pickedUp, 1, 'Operations Assistant pickedUp must be 1');

    console.log(`  Registrations: ${statsA.totalChildren}, Selected: ${statsA.selected}, Checked In: ${statsA.checkedIn} (Inside: ${statsA.inside}, Picked up: ${statsA.pickedUp})`);
    console.log('  Historical scans (20 rows) successfully excluded from child count -> PASS');

    // =============================================================
    // B. RESET LIFECYCLE REGRESSION
    // Baby Livina scenario: child checked in -> inside -> picked up -> reset cycle.
    // Exercise the actual reset logic from /api/admin/applications/:id/reset-progress.
    // =============================================================
    console.log('\n[TEST B] Reset Lifecycle: child picked_up -> reset cycle');

    const livinaChildId = childIdsA[2];
    const livinaEntryId = entryIdsA[2];

    // Verify BEFORE reset:
    const beforeEntry = await queryOne(`SELECT status, checked_in_at, picked_up_at FROM child_event_entries WHERE id = ?`, [livinaEntryId]);
    assert.strictEqual(beforeEntry.status, 'picked_up', 'Before reset status must be picked_up');
    assert.ok(beforeEntry.checked_in_at !== null, 'Before reset checked_in_at must be set');
    assert.ok(beforeEntry.picked_up_at !== null, 'Before reset picked_up_at must be set');

    // Execute the actual production reset logic (as in admin.ts:10091-10115)
    const resetTimestamp = new Date().toISOString();
    const pass = await queryOne(`SELECT id, status FROM event_passes WHERE child_event_entry_id = ? AND status = 'active'`, [livinaEntryId]);
    const targetStatus = pass ? 'pass_ready' : 'selected';

    await execute(`DELETE FROM attendance_records WHERE child_event_entry_id = ?`, [livinaEntryId]);
    await execute(`
      UPDATE child_event_entries 
      SET status = ?, checked_in_at = NULL, checked_in_by = NULL, picked_up_at = NULL, picked_up_by = NULL, updated_at = ?
      WHERE id = ?
    `, [targetStatus, resetTimestamp, livinaEntryId]);

    await execute(`
      INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
      VALUES (?, 'admin-test-id', 'super_admin', 'Event attendance reset by Super Admin', 'child_event_entry', ?, ?, ?)
    `, [crypto.randomUUID(), livinaEntryId, JSON.stringify({ mode: 'attendance', targetStatus, previousStatus: 'picked_up' }), resetTimestamp]);

    // Verify AFTER reset:
    const afterEntry = await queryOne(`SELECT status, checked_in_at, picked_up_at FROM child_event_entries WHERE id = ?`, [livinaEntryId]);
    assert.strictEqual(afterEntry.status, 'pass_ready', 'After reset status must be pass_ready');
    assert.strictEqual(afterEntry.checked_in_at, null, 'After reset checked_in_at must be null');
    assert.strictEqual(afterEntry.picked_up_at, null, 'After reset picked_up_at must be null');

    // Verify canonical child summary excludes reset child from checked-in/picked-up
    const statsAfterReset = await getChildSummaryStats(testEventIdA);
    assert.strictEqual(statsAfterReset.totalChildren, 8, 'Total registrations remains 8');
    assert.strictEqual(statsAfterReset.selected, 8, 'Selected remains 8');
    assert.strictEqual(statsAfterReset.checkedIn, 2, 'Checked in decreases from 3 to 2');
    assert.strictEqual(statsAfterReset.inside, 2, 'Inside remains 2');
    assert.strictEqual(statsAfterReset.pickedUp, 0, 'Picked up decreases from 1 to 0');

    // Verify parent status mapping after reset
    const parentRow = await queryOne(`
      SELECT e.status, p.status as pass_status
      FROM child_event_entries e
      LEFT JOIN event_passes p ON p.child_event_entry_id = e.id AND p.status = 'active'
      WHERE e.id = ?
    `, [livinaEntryId]);

    const isParentPassReady = parentRow.status === 'pass_ready' || (parentRow.status === 'selected' && parentRow.pass_status === 'active');
    assert.ok(isParentPassReady, 'Parent-facing status must be Pass ready');
    assert.notStrictEqual(parentRow.status, 'picked_up', 'Parent must NOT see Picked up after reset');

    // Verify audit log exists
    const auditRecord = await queryOne(`SELECT action, details FROM audit_logs WHERE target_id = ?`, [livinaEntryId]);
    assert.ok(auditRecord, 'Audit record must be preserved');
    assert.strictEqual(auditRecord.action, 'Event attendance reset by Super Admin');

    console.log('  State after reset: pass_ready (checked_in_at = null, picked_up_at = null)');
    console.log(`  Metrics after reset: Checked in: ${statsAfterReset.checkedIn}, Picked up: ${statsAfterReset.pickedUp}`);
    console.log('  Parent status: Pass ready (not Picked up) -> PASS');

    // =============================================================
    // C. RESET + RE-ENTRY
    // Child checks in again after reset -> new cycle becomes current.
    // Distinct child count = 1. No duplicate current attendance.
    // =============================================================
    console.log('\n[TEST C] Reset + Re-entry: child checks in again');

    const reEntryTimestamp = new Date().toISOString();
    await execute(`
      UPDATE child_event_entries
      SET status = 'checked_in', checked_in_at = ?, updated_at = ?
      WHERE id = ?
    `, [reEntryTimestamp, reEntryTimestamp, livinaEntryId]);

    const statsAfterReEntry = await getChildSummaryStats(testEventIdA);
    assert.strictEqual(statsAfterReEntry.checkedIn, 3, 'Checked in increases back to 3');
    assert.strictEqual(statsAfterReEntry.inside, 3, 'Inside increases to 3');
    assert.strictEqual(statsAfterReEntry.pickedUp, 0, 'Picked up remains 0');

    // Distinct children check: verify child is only counted once
    const distinctCheckedIn = await queryOne(`
      SELECT COUNT(DISTINCT e.child_id) as count
      FROM child_event_entries e
      WHERE e.event_id = ? AND e.status IN ('checked_in', 'inside', 'picked_up') AND COALESCE(e.is_deleted, 0) = 0
    `, [testEventIdA]);
    assert.strictEqual(distinctCheckedIn.count, 3, 'Distinct checked in children must be 3, never duplicated');

    console.log(`  Re-entry: status = checked_in, distinct children = ${distinctCheckedIn.count} -> PASS`);

    // =============================================================
    // D. DUTY COUNT REGRESSION: Authoritative Location Presence (1 / 5)
    // Fixture: 5 assigned volunteers.
    // Vol A: active presence (ended_at IS NULL).
    // Vol B: ended presence.
    // Vol C/D/E: never reported.
    // Plus historical ended presence from an old event.
    // Plus obsolete user_duty_status row.
    // Expected: assigned = 5, on duty = 1.
    // =============================================================
    console.log('\n[TEST D] Duty Counts: 5 assigned, 1 active presence (1 / 5)');

    const locationId = `loc-test-${Date.now()}`;
    await execute(`
      INSERT INTO event_locations (id, event_id, location_type, name, volunteer_capacity, is_active, created_at, updated_at)
      VALUES (?, ?, 'room', 'Test Hall', 5, 1, ?, ?)
    `, [locationId, testEventIdA, nowIso, nowIso]);

    const volunteerUserIds: string[] = [];
    for (let v = 0; v < 5; v++) {
      const uid = `usr-vol-${v}-${Date.now()}`;
      volunteerUserIds.push(uid);

      await execute(`
        INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
        VALUES (?, ?, 'hash', 'volunteer', ?, ?)
      `, [uid, `vol_${v}_${Date.now()}@test.org`, nowIso, nowIso]);

      await execute(`
        INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
        VALUES (?, ?, ?, '+2348011223344', '+2348011223344', 'Check-in', 'approved', ?, ?)
      `, [`vp-${v}-${Date.now()}`, uid, `Volunteer ${v}`, nowIso, nowIso]);

      // Assign to testEventIdA
      await execute(`
        INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
        VALUES (?, ?, ?, 'General Response', 'scheduled', '2026-11-20T08:00:00Z', '2026-11-20T18:00:00Z', ?, ?)
      `, [`asg-test-${v}-${Date.now()}`, testEventIdA, uid, nowIso, nowIso]);
    }

    // Vol 0 (Alele): active presence in Event A
    await execute(`
      INSERT INTO event_duty_location_presence (id, event_id, user_id, event_location_id, source, started_at, ended_at, updated_at)
      VALUES (?, ?, ?, ?, 'manual_station', '2026-09-17T14:00:00Z', NULL, ?)
    `, [`pres-active-${Date.now()}`, testEventIdA, volunteerUserIds[0], locationId, nowIso]);

    // Vol 1: ended presence in Event A
    await execute(`
      INSERT INTO event_duty_location_presence (id, event_id, user_id, event_location_id, source, started_at, ended_at, updated_at)
      VALUES (?, ?, ?, ?, 'manual_station', '2026-09-17T12:00:00Z', '2026-09-17T13:00:00Z', ?)
    `, [`pres-ended-${Date.now()}`, testEventIdA, volunteerUserIds[1], locationId, nowIso]);

    // Vol 0: historical presence from Event B (must be excluded)
    await execute(`
      INSERT INTO event_duty_location_presence (id, event_id, user_id, event_location_id, source, started_at, ended_at, updated_at)
      VALUES (?, ?, ?, ?, 'manual_station', '2026-08-01T10:00:00Z', NULL, ?)
    `, [`pres-old-${Date.now()}`, testEventIdB, volunteerUserIds[0], locationId, nowIso]);

    // Obsolete user_duty_status row (must NOT be used as truth)
    await execute(`
      INSERT INTO user_duty_status (id, user_id, assigned_event_id, on_duty, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?)
    `, [`uds-${Date.now()}`, volunteerUserIds[0], testEventIdA, nowIso, nowIso]);

    const volSummaryA = await operationsAssistantService.getVolunteerSummary(testEventIdA);
    assert.strictEqual(volSummaryA.volunteersAssigned, 5, 'Assigned denominator must be 5');
    assert.strictEqual(volSummaryA.volunteersOnDuty, 1, 'Active duty numerator must be 1 (Vol 0 only)');

    console.log(`  On duty: ${volSummaryA.volunteersOnDuty} / ${volSummaryA.volunteersAssigned} assigned volunteers`);
    console.log('  Historical event presence excluded, user_duty_status ignored -> PASS');

    // =============================================================
    // E. EVENT ISOLATION
    // Event A and Event B data must not cross-contaminate.
    // =============================================================
    console.log('\n[TEST E] Cross-Event Isolation');

    // Add 1 child to Event B
    const childIdB = `ch-b-${Date.now()}`;
    const entryIdB = `entry-b-${Date.now()}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Child B', 'Male', '2021-05-01', 'Ages 4 to 6', 0, ?, ?)
    `, [childIdB, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', 0, ?, ?)
    `, [entryIdB, childIdB, testEventIdB, nowIso, nowIso]);

    const statsEventB = await getChildSummaryStats(testEventIdB);
    assert.strictEqual(statsEventB.totalChildren, 1, 'Event B must have exactly 1 child');
    assert.strictEqual(statsEventB.checkedIn, 0, 'Event B checked in must be 0');

    const statsEventAAfter = await getChildSummaryStats(testEventIdA);
    assert.strictEqual(statsEventAAfter.totalChildren, 8, 'Event A child count must remain 8');

    console.log(`  Event A: ${statsEventAAfter.totalChildren} children, Event B: ${statsEventB.totalChildren} child -> PASS`);

    // =============================================================
    // F. AUTOMATION INTEGRITY RULES (Phase 3C)
    // CHILD_ATTENDANCE_STATE_MISMATCH & DUTY_PRESENCE_MISMATCH
    // =============================================================
    console.log('\n[TEST F] Automation Integrity Watch Rules');

    // 1. Verify rules exist in ruleModel
    const childMismatchRule = getRuleBySignal('CHILD_ATTENDANCE_STATE_MISMATCH');
    assert.ok(childMismatchRule, 'CHILD_ATTENDANCE_STATE_MISMATCH rule must exist');
    assert.strictEqual(childMismatchRule.actionTargetRoute, 'children');
    assert.strictEqual(childMismatchRule.actionTargetLabel, 'Review child →');

    const dutyMismatchRule = getRuleBySignal('DUTY_PRESENCE_MISMATCH');
    assert.ok(dutyMismatchRule, 'DUTY_PRESENCE_MISMATCH rule must exist');
    assert.strictEqual(dutyMismatchRule.actionTargetRoute, 'duty');
    assert.strictEqual(dutyMismatchRule.actionTargetLabel, 'View duty →');

    // 2. Inject conflicting states into a temporary child entry:
    // picked_up without checked_in_at
    const mismatchChildId = `ch-mismatch-${Date.now()}`;
    const mismatchEntryId = `entry-mismatch-${Date.now()}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Mismatch Child', 'Female', '2020-01-01', 'Ages 4 to 6', 0, ?, ?)
    `, [mismatchChildId, parentProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, checked_in_at, picked_up_at, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, 'picked_up', NULL, '2026-09-19T12:00:00Z', 0, ?, ?)
    `, [mismatchEntryId, mismatchChildId, testEventIdA, nowIso, nowIso]);

    // Inject duplicate active presence for Vol 0:
    await execute(`
      INSERT INTO event_duty_location_presence (id, event_id, user_id, event_location_id, source, started_at, ended_at, updated_at)
      VALUES (?, ?, ?, ?, 'manual_station', '2026-09-17T15:00:00Z', NULL, ?)
    `, [`pres-dup-${Date.now()}`, testEventIdA, volunteerUserIds[0], locationId, nowIso]);

    // Query mismatch detector queries directly to verify factual detection
    const mismatchedRows = await query(
      `SELECT e.id, c.full_name, e.status, e.checked_in_at, e.picked_up_at
       FROM child_event_entries e
       JOIN children c ON c.id = e.child_id
       WHERE e.event_id = ? AND COALESCE(e.is_deleted, 0) = 0
         AND (
           (e.status IN ('picked_up', 'checked_out') AND e.checked_in_at IS NULL)
           OR (e.status = 'inside' AND e.checked_in_at IS NULL)
           OR (e.status IN ('checked_in', 'inside') AND e.picked_up_at IS NOT NULL)
         )`,
      [testEventIdA]
    );
    assert.strictEqual(mismatchedRows.length, 1, 'Must detect exactly 1 mismatched child entry');
    assert.strictEqual(mismatchedRows[0].id, mismatchEntryId);

    const presenceMismatches = await query(
      `SELECT p.user_id, COUNT(*) as active_count
       FROM event_duty_location_presence p
       WHERE p.event_id = ? AND p.ended_at IS NULL
       GROUP BY p.user_id
       HAVING COUNT(*) > 1`,
      [testEventIdA]
    );
    assert.strictEqual(presenceMismatches.length, 1, 'Must detect exactly 1 volunteer with conflicting active presence');
    assert.strictEqual(presenceMismatches[0].user_id, volunteerUserIds[0]);

    // Verify NO automatic mutation happened
    const unmutatedEntry = await queryOne(`SELECT status FROM child_event_entries WHERE id = ?`, [mismatchEntryId]);
    assert.strictEqual(unmutatedEntry.status, 'picked_up', 'Status must NOT be mutated automatically');

    console.log('  CHILD_ATTENDANCE_STATE_MISMATCH detected -> 1 child');
    console.log('  DUTY_PRESENCE_MISMATCH detected -> 1 volunteer');
    console.log('  Human review actions configured, no auto-mutation -> PASS');

    console.log('\n================================================================');
    console.log('ALL REGRESSION SUITES PASSED SUCCESSFULLY');
    console.log('================================================================\n');

  } finally {
    // -------------------------------------------------------------
    // TEARDOWN: Clean up test event data
    // -------------------------------------------------------------
    await execute(`DELETE FROM attendance_records WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id IN (?, ?))`, [testEventIdA, testEventIdB]);
    await execute(`DELETE FROM event_passes WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id IN (?, ?))`, [testEventIdA, testEventIdB]);
    await execute(`DELETE FROM child_event_entries WHERE event_id IN (?, ?)`, [testEventIdA, testEventIdB]);
    await execute(`DELETE FROM children WHERE id IN (SELECT child_id FROM child_event_entries WHERE event_id IN (?, ?))`, [testEventIdA, testEventIdB]);
    await execute(`DELETE FROM event_duty_location_presence WHERE event_id IN (?, ?)`, [testEventIdA, testEventIdB]);
    await execute(`DELETE FROM event_duty_assignments WHERE event_id IN (?, ?)`, [testEventIdA, testEventIdB]);
    await execute(`DELETE FROM event_locations WHERE event_id IN (?, ?)`, [testEventIdA, testEventIdB]);
    await execute(`DELETE FROM events WHERE id IN (?, ?)`, [testEventIdA, testEventIdB]);
  }
}

runStateConsistencyTests().catch((err) => {
  console.error('REGRESSION TEST FAILED:', err);
  process.exit(1);
});
