import assert from 'assert';
import crypto from 'crypto';
import { execute, query, queryOne } from '../src/server/db';
import { setCurrentEvent, getCurrentEventId } from '../src/server/services/eventService';
import { initReportSchema, compileReportSnapshot, requestReportJob, getOrRegenerateReportPDF } from '../src/server/services/reportService';
import { createIncident, getIncidentState, Actor } from '../src/server/services/incidentService';

async function runTests() {
  console.log('=== PHASE 3D2A VERIFICATION: REPORT & INCIDENT SERVICE EVENT RESOLUTION ===\n');

  const initialCurrentEventId = await getCurrentEventId();
  console.log(`Initial current event: ${initialCurrentEventId}`);
  assert.strictEqual(initialCurrentEventId, 'event-ga-2026', 'Initial current event must be event-ga-2026');

  const adminUserId = `test-admin-${crypto.randomUUID()}`;
  const nowStr = new Date().toISOString();

  // Create admin user in DB
  await execute(`
    INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
    VALUES (?, ?, 'dummyhash', 'admin', 1, ?, ?)
  `, [adminUserId, `admin-${crypto.randomUUID()}@test.internal`, nowStr, nowStr]);

  const actor: Actor = {
    id: adminUserId,
    role: 'admin',
    email: 'admin@test.internal'
  };

  // Define unique IDs for Event A & Event B
  const eventAId = `test-evt-3d2a-a-${crypto.randomUUID().slice(0, 8)}`;
  const eventBId = `test-evt-3d2a-b-${crypto.randomUUID().slice(0, 8)}`;

  let jobAId: string | null = null;
  let incidentAId: string | null = null;
  let incidentBId: string | null = null;
  let incidentHistAId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // 1. SETUP TEST FIXTURES: Event A & Event B
    // -------------------------------------------------------------------------
    console.log('1. Setting up test fixtures for Event A & Event B...');
    await initReportSchema();

    await execute(`
      INSERT INTO events (id, title, section_name, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Event A Summit', 'Kids Track A', 'archived', '2026-05-10', '2026-05-12', ?, ?)
    `, [eventAId, nowStr, nowStr]);

    await execute(`
      INSERT INTO events (id, title, section_name, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Event B Conference', 'Youth Track B', 'archived', '2026-08-20', '2026-08-22', ?, ?)
    `, [eventBId, nowStr, nowStr]);

    console.log('  [PASS] Event A and Event B created.');

    // -------------------------------------------------------------------------
    // 2. REPORT SERVICE TESTS
    // -------------------------------------------------------------------------
    console.log('\n2. Testing reportService event resolution...');

    // 2.1 With Event A current: compileReportSnapshot without explicit eventId uses A
    await setCurrentEvent(eventAId);
    assert.strictEqual(await getCurrentEventId(), eventAId);

    const snapshotA = await compileReportSnapshot(null, null, 'management-summary', adminUserId, 'admin', 'Internal operational');
    assert.strictEqual(snapshotA.event.id, eventAId, 'Snapshot without explicit eventId must use current Event A');
    console.log('  [PASS] 2.1 Snapshot without explicit eventId resolves current Event A');

    // 2.2 Create a stored report job for Event A
    jobAId = await requestReportJob(eventAId, null, 'management-summary', adminUserId, 'admin', 'Internal operational', ['Executive summary']);
    const jobARow = await queryOne('SELECT * FROM report_jobs WHERE id = ?', [jobAId]);
    assert.strictEqual(jobARow.event_id, eventAId, 'Report job must store Event A');
    console.log('  [PASS] 2.2 Stored report job created with Event A');

    // 2.3 Switch current to Event B: compileReportSnapshot without explicit eventId uses B
    await setCurrentEvent(eventBId);
    assert.strictEqual(await getCurrentEventId(), eventBId);

    const snapshotB = await compileReportSnapshot(null, null, 'management-summary', adminUserId, 'admin', 'Internal operational');
    assert.strictEqual(snapshotB.event.id, eventBId, 'Snapshot without explicit eventId must use current Event B');
    console.log('  [PASS] 2.3 Snapshot without explicit eventId resolves current Event B');

    // 2.4 While Event B is current: explicit eventId=A generates/reads Event A context
    const snapshotHistA = await compileReportSnapshot(eventAId, null, 'management-summary', adminUserId, 'admin', 'Internal operational');
    assert.strictEqual(snapshotHistA.event.id, eventAId, 'Explicit eventId=A must resolve Event A');
    const currentStillB = await getCurrentEventId();
    assert.strictEqual(currentStillB, eventBId, 'Current event must remain Event B');
    console.log('  [PASS] 2.4 Explicit eventId=A resolves Event A while current event remains Event B');

    // 2.5 Existing report record for Event A preserves Event A when B is current
    const jobAAfterSwitch = await queryOne('SELECT * FROM report_jobs WHERE id = ?', [jobAId]);
    assert.strictEqual(jobAAfterSwitch.event_id, eventAId, 'Existing report job must preserve stored Event A');
    console.log('  [PASS] 2.5 Existing report job preserves its stored Event A context after event switch');

    // 2.6 No-current-event: reportService fails safely without falling back to open/active/latest/2026
    await execute("UPDATE events SET status = 'archived' WHERE status = 'current'");
    const noCurrentId = await getCurrentEventId();
    assert.strictEqual(noCurrentId, null, 'Current event must be null');

    await assert.rejects(
      async () => {
        await compileReportSnapshot(null, null, 'management-summary', adminUserId, 'admin', 'Internal operational');
      },
      (err: any) => {
        assert(err.message.includes('No valid event ID was provided or could be resolved.'));
        return true;
      },
      'compileReportSnapshot must fail safely when no current event exists'
    );
    console.log('  [PASS] 2.6 Report compile rejects cleanly when no current event exists (no 2026 fallback)');

    // -------------------------------------------------------------------------
    // 3. INCIDENT SERVICE TESTS
    // -------------------------------------------------------------------------
    console.log('\n3. Testing incidentService event resolution...');

    // 3.1 With Event A current: new incident without explicit eventId uses A
    await setCurrentEvent(eventAId);
    assert.strictEqual(await getCurrentEventId(), eventAId);

    const incA = await createIncident({
      actor,
      title: 'Incident in Event A',
      category: 'medical',
      description: 'Medical issue in Event A'
    });
    assert.strictEqual(incA.eventId, eventAId, 'Incident created with A current must have event_id = A');
    incidentAId = incA.id;
    console.log('  [PASS] 3.1 New direct incident without explicit eventId uses current Event A');

    // 3.2 With Event B current: new incident without explicit eventId uses B
    await setCurrentEvent(eventBId);
    assert.strictEqual(await getCurrentEventId(), eventBId);

    const incB = await createIncident({
      actor,
      title: 'Incident in Event B',
      category: 'security',
      description: 'Security incident in Event B'
    });
    assert.strictEqual(incB.eventId, eventBId, 'Incident created with B current must have event_id = B');
    incidentBId = incB.id;
    console.log('  [PASS] 3.2 New direct incident without explicit eventId uses current Event B');

    // 3.3 While Event B is current: explicit eventId=A creates incident in Event A
    const incHistA = await createIncident({
      actor,
      eventId: eventAId,
      title: 'Historical Incident for Event A',
      category: 'other',
      description: 'Explicitly logging incident to Event A'
    });
    assert.strictEqual(incHistA.eventId, eventAId, 'Incident created with explicit eventId=A must have event_id = A');
    incidentHistAId = incHistA.id;
    const currentAfterInc = await getCurrentEventId();
    assert.strictEqual(currentAfterInc, eventBId, 'Current event must remain Event B');
    console.log('  [PASS] 3.3 Explicit eventId=A creates incident in Event A while current event remains Event B');

    // 3.4 Existing incident for Event A preserves event_id=A when reading state under Event B
    const fetchedIncA = await getIncidentState(incidentAId, actor);
    assert.strictEqual(fetchedIncA.eventId, eventAId, 'Fetched existing incident must preserve original event_id = A');
    console.log('  [PASS] 3.4 Existing Incident A preserves event_id=A when retrieved while B is current');

    // 3.5 No-current-event: new incident rejects safely without falling back to open/active/latest/2026
    await execute("UPDATE events SET status = 'archived' WHERE status = 'current'");
    assert.strictEqual(await getCurrentEventId(), null);

    await assert.rejects(
      async () => {
        await createIncident({
          actor,
          title: 'Incident with no current event',
          category: 'other',
          description: 'Should fail'
        });
      },
      (err: any) => {
        assert.strictEqual(err.code, 'NO_EVENT', 'Error code must be NO_EVENT');
        assert.strictEqual(err.status, 400, 'Error status must be 400');
        return true;
      },
      'createIncident must reject cleanly when no current event exists'
    );
    console.log('  [PASS] 3.5 Incident creation rejects cleanly when no current event exists (no 2026 fallback)');

    console.log('\n=== ALL PHASE 3D2A TESTS PASSED SUCCESSFULLY ===');
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    console.log('\n--- CLEANING UP TEST DATA ---');
    try {
      await setCurrentEvent(initialCurrentEventId);
      console.log(`Restored current event to: ${initialCurrentEventId}`);
    } catch (e: any) {
      console.error('Failed to restore initial current event:', e.message);
    }

    try {
      if (jobAId) {
        await execute('DELETE FROM report_history WHERE report_job_id = ?', [jobAId]);
        await execute('DELETE FROM report_jobs WHERE id = ?', [jobAId]);
      }
      const incidentIds = [incidentAId, incidentBId, incidentHistAId].filter(Boolean);
      if (incidentIds.length > 0) {
        const placeholders = incidentIds.map(() => '?').join(', ');
        await execute(`DELETE FROM incident_records WHERE id IN (${placeholders})`, incidentIds);
      }
      await execute('DELETE FROM event_safety_alerts WHERE event_id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM events WHERE id IN (?, ?)', [eventAId, eventBId]);
      await execute('DELETE FROM users WHERE id = ?', [adminUserId]);
      console.log('Test fixtures cleaned up successfully.');
    } catch (e: any) {
      console.error('Failed to clean up test fixtures:', e.message);
    }

    const finalCurrentId = await getCurrentEventId();
    assert.strictEqual(finalCurrentId, 'event-ga-2026', 'Final current event must be event-ga-2026');
    console.log(`Final verified current event: ${finalCurrentId}`);
  }
}

runTests().catch(err => {
  console.error('\nFatal error in Phase 3D2A verification:', err);
  process.exit(1);
});
