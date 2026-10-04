import { execute, query, queryOne } from '../src/server/db';
import { getCurrentEvent } from '../src/server/services/eventService';
import {
  detectEventSignals,
  evaluateCurrentEventAutomations,
  getAutomationEngineHealth
} from '../src/server/services/operations/automation/automationEngine';
import {
  acknowledgeAutomation,
  autoResolveMissingAutomations,
  dismissAutomation,
  getAutomationById,
  getAutomationsForEvent,
  initAutomationSchema,
  setAutomationRuleEnabled,
  upsertAutomation
} from '../src/server/services/operations/automation/automationPersistence';
import { PHASE3B_AUTOMATION_RULES } from '../src/server/services/operations/automation/ruleModel';

export async function runEventAutomationEngineTests() {
  console.log('====================================================');
  console.log('OPERATIONS ASSISTANT — PHASE 3B EVENT AUTOMATION ENGINE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`, detail ? JSON.stringify(detail) : '');
      failed++;
    }
  }

  // 1. Initialize schema
  await initAutomationSchema();
  assert(true, 'Schema: initAutomationSchema executes cleanly');

  // 2. Canonical current event resolution
  const currentEvent = await getCurrentEvent();
  assert(Boolean(currentEvent && currentEvent.id), 'Canonical Event: Current event resolves without fallback', {
    eventId: currentEvent?.id,
    title: currentEvent?.title
  });

  const testEventId = `test-auto-evt-${Date.now()}`;
  const testEventBId = `test-auto-evt-b-${Date.now()}`;
  const now = Date.now();
  const nowIso = new Date().toISOString();

  try {
    // -------------------------------------------------------------
    // Set Up Controlled Test Fixtures for Test Event
    // -------------------------------------------------------------
    await execute(
      `INSERT INTO events (id, title, status, starts_at, ends_at, parent_access_opens_at, parent_access_closes_at, capacity, created_at, updated_at)
       VALUES (?, ?, 'draft', ?, ?, ?, ?, 100, ?, ?)`,
      [
        testEventId,
        'Automation Test Event A',
        new Date(now + 12 * 3600 * 1000).toISOString(),
        new Date(now + 24 * 3600 * 1000).toISOString(),
        new Date(now - 24 * 3600 * 1000).toISOString(),
        new Date(now + 12 * 3600 * 1000).toISOString(), // closes in 12 hours
        nowIso,
        nowIso
      ]
    );

    await execute(
      `INSERT INTO events (id, title, status, starts_at, ends_at, capacity, created_at, updated_at)
       VALUES (?, ?, 'draft', ?, ?, 50, ?, ?)`,
      [
        testEventBId,
        'Automation Test Event B',
        new Date(now + 48 * 3600 * 1000).toISOString(),
        new Date(now + 60 * 3600 * 1000).toISOString(),
        nowIso,
        nowIso
      ]
    );

    // -------------------------------------------------------------
    // TEST CASE A: Registration closes in 12 hours -> one active automation
    // -------------------------------------------------------------
    const evalA = await evaluateCurrentEventAutomations(testEventId);
    assert(evalA.success, 'Case A: Evaluator runs successfully on test event');

    const automationsA = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });
    const regAuto = automationsA.find(a => a.signal_type === 'REGISTRATION_CLOSING_SOON');
    assert(Boolean(regAuto), 'Case A: Registration closing in 12h creates active automation', {
      title: regAuto?.title,
      summary: regAuto?.summary,
      severity: regAuto?.severity
    });

    const configGapAuto = automationsA.find(a => a.signal_type === 'CONFIGURATION_GAP' && a.entity_id === 'missing_volunteer_registration_deadline');
    assert(Boolean(configGapAuto), 'Case A: Missing volunteer registration deadline creates CONFIGURATION_GAP automation', {
      title: configGapAuto?.title,
      summary: configGapAuto?.summary
    });

    // -------------------------------------------------------------
    // TEST CASE B: Run evaluator again -> no duplicate
    // -------------------------------------------------------------
    const evalB = await evaluateCurrentEventAutomations(testEventId);
    const automationsB = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });
    const regAutosB = automationsB.filter(a => a.signal_type === 'REGISTRATION_CLOSING_SOON');
    assert(regAutosB.length === 1, 'Case B: Repeated evaluation deduplicates (still exactly 1 item)', {
      count: regAutosB.length,
      id: regAutosB[0]?.id
    });

    // -------------------------------------------------------------
    // TEST CASE C: Registration deadline moves 7 days away -> automation resolved
    // -------------------------------------------------------------
    const futureClose = new Date(now + 7 * 24 * 3600 * 1000).toISOString();
    await execute('UPDATE events SET parent_access_closes_at = ? WHERE id = ?', [futureClose, testEventId]);

    const evalC = await evaluateCurrentEventAutomations(testEventId);
    assert(evalC.resolvedItemsCount > 0, 'Case C: Evaluator reports resolved items when deadline moves away');

    const automationsCActive = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });
    const automationsCResolved = await getAutomationsForEvent(testEventId, { status: 'resolved', includeSafety: true });
    const regActiveC = automationsCActive.find(a => a.signal_type === 'REGISTRATION_CLOSING_SOON');
    const regResolvedC = automationsCResolved.find(a => a.signal_type === 'REGISTRATION_CLOSING_SOON');
    assert(!regActiveC && Boolean(regResolvedC), 'Case C: Registration automation automatically transitioned to resolved', {
      resolvedAt: regResolvedC?.resolved_at,
      status: regResolvedC?.status
    });

    // -------------------------------------------------------------
    // TEST CASE D: Duty location 2/5 staffed -> one understaffed automation
    // -------------------------------------------------------------
    const testLocId = `test-loc-${Date.now()}`;
    await execute(
      `INSERT INTO event_locations (id, event_id, name, short_name, location_type, volunteer_capacity, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, 'Grace Hall', 'GH', 'hall', 5, 1, 1, ?, ?)`,
      [testLocId, testEventId, nowIso, nowIso]
    );

    const volUser1 = `usr-vol1-${Date.now()}`;
    const volUser2 = `usr-vol2-${Date.now()}`;
    await execute(`INSERT INTO users (id, email, role, created_at, updated_at) VALUES (?, ?, 'volunteer', ?, ?)`, [volUser1, `vol1-${volUser1}@koinonia.org`, nowIso, nowIso]);
    await execute(`INSERT INTO users (id, email, role, created_at, updated_at) VALUES (?, ?, 'volunteer', ?, ?)`, [volUser2, `vol2-${volUser2}@koinonia.org`, nowIso, nowIso]);
    await execute(`INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at) VALUES (?, ?, 'Volunteer One', '08011111111', '08011111111', 'ushering', 'approved', ?, ?)`, [`vp1-${Date.now()}`, volUser1, nowIso, nowIso]);
    await execute(`INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at) VALUES (?, ?, 'Volunteer Two', '08022222222', '08022222222', 'ushering', 'approved', ?, ?)`, [`vp2-${Date.now()}`, volUser2, nowIso, nowIso]);

    await execute(
      `INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'post_leader', 'scheduled', ?, ?, ?, ?)`,
      [`asgn1-${Date.now()}`, testEventId, volUser1, testLocId, new Date(now - 30 * 60000).toISOString(), new Date(now + 4 * 3600000).toISOString(), nowIso, nowIso]
    );
    await execute(
      `INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'support', 'scheduled', ?, ?, ?, ?)`,
      [`asgn2-${Date.now()}`, testEventId, volUser2, testLocId, new Date(now - 30 * 60000).toISOString(), new Date(now + 4 * 3600000).toISOString(), nowIso, nowIso]
    );

    await evaluateCurrentEventAutomations(testEventId);
    const automationsD = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });
    const understaffedD = automationsD.find(a => a.signal_type === 'LOCATION_UNDERSTAFFED' && a.entity_id === testLocId);
    assert(Boolean(understaffedD && understaffedD.summary === '2 assigned of 5'), 'Case D: Location with 2/5 staffing produces understaffed automation', {
      title: understaffedD?.title,
      summary: understaffedD?.summary,
      proposedAction: understaffedD?.proposed_action_key
    });

    // -------------------------------------------------------------
    // TEST CASE E: Staffing becomes 5/5 -> resolved
    // -------------------------------------------------------------
    for (let i = 3; i <= 5; i++) {
      const extraVol = `usr-extra-${i}-${Date.now()}`;
      await execute(`INSERT INTO users (id, email, role, created_at, updated_at) VALUES (?, ?, 'volunteer', ?, ?)`, [extraVol, `extra${i}-${extraVol}@koinonia.org`, nowIso, nowIso]);
      await execute(`INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at) VALUES (?, ?, ?, '08033333333', '08033333333', 'ushering', 'approved', ?, ?)`, [`vp-${extraVol}`, extraVol, `Extra Vol ${i}`, nowIso, nowIso]);
      await execute(
        `INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'helper', 'scheduled', ?, ?, ?, ?)`,
        [`asgn-extra-${i}-${Date.now()}`, testEventId, extraVol, testLocId, new Date(now - 30 * 60000).toISOString(), new Date(now + 4 * 3600000).toISOString(), nowIso, nowIso]
      );
    }

    await evaluateCurrentEventAutomations(testEventId);
    const automationsEActive = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });
    const automationsEResolved = await getAutomationsForEvent(testEventId, { status: 'resolved', includeSafety: true });
    const understaffedActiveE = automationsEActive.find(a => a.signal_type === 'LOCATION_UNDERSTAFFED' && a.entity_id === testLocId);
    const understaffedResolvedE = automationsEResolved.find(a => a.signal_type === 'LOCATION_UNDERSTAFFED' && a.entity_id === testLocId);
    assert(!understaffedActiveE && Boolean(understaffedResolvedE), 'Case E: Staffing reaching 5/5 automatically resolves understaffed automation', {
      resolvedAt: understaffedResolvedE?.resolved_at
    });

    // -------------------------------------------------------------
    // TEST CASE F: Volunteer scheduled and no presence after report time -> no-show automation
    // -------------------------------------------------------------
    const automationsF = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });
    const noShowVol1 = automationsF.find(a => a.signal_type === 'VOLUNTEER_NO_SHOW' && a.entity_id === volUser1);
    assert(Boolean(noShowVol1), 'Case F: Scheduled volunteer without presence after report time produces no-show automation', {
      title: noShowVol1?.title,
      summary: noShowVol1?.summary,
      proposedAction: noShowVol1?.proposed_action_key
    });

    // -------------------------------------------------------------
    // TEST CASE G: Volunteer reports -> resolved
    // -------------------------------------------------------------
    const presenceId = `pres-${Date.now()}`;
    await execute(
      `INSERT INTO event_duty_location_presence (id, event_id, user_id, event_location_id, source, started_at, updated_at)
       VALUES (?, ?, ?, ?, 'qr_scan', ?, ?)`,
      [presenceId, testEventId, volUser1, testLocId, nowIso, nowIso]
    );

    await evaluateCurrentEventAutomations(testEventId);
    const automationsGActive = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });
    const automationsGResolved = await getAutomationsForEvent(testEventId, { status: 'resolved', includeSafety: true });
    const noShowActiveG = automationsGActive.find(a => a.signal_type === 'VOLUNTEER_NO_SHOW' && a.entity_id === volUser1);
    const noShowResolvedG = automationsGResolved.find(a => a.signal_type === 'VOLUNTEER_NO_SHOW' && a.entity_id === volUser1);
    assert(!noShowActiveG && Boolean(noShowResolvedG), 'Case G: Volunteer check-in automatically resolves no-show automation', {
      resolvedAt: noShowResolvedG?.resolved_at
    });

    // -------------------------------------------------------------
    // TEST CASE H: Volunteer assigned with no reliable reporting time -> do not falsely label late
    // -------------------------------------------------------------
    const volNoTime = `usr-notime-${Date.now()}`;
    await execute(`INSERT INTO users (id, email, role, created_at, updated_at) VALUES (?, ?, 'volunteer', ?, ?)`, [volNoTime, `notime-${volNoTime}@koinonia.org`, nowIso, nowIso]);
    await execute(`INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at) VALUES (?, ?, 'Floating Assistant', '08044444444', '08044444444', 'ushering', 'approved', ?, ?)`, [`vp-notime-${Date.now()}`, volNoTime, nowIso, nowIso]);
    await execute(
      `INSERT INTO event_duty_assignments (id, event_id, user_id, assigned_location_id, responsibility_key, status, starts_at, ends_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'floating', 'scheduled', 'TBD', 'TBD', ?, ?)`,
      [`asgn-notime-${Date.now()}`, testEventId, volNoTime, testLocId, nowIso, nowIso]
    );

    await evaluateCurrentEventAutomations(testEventId);
    const automationsH = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });
    const notOnDutyItem = automationsH.find(a => a.signal_type === 'VOLUNTEER_NO_SHOW' && a.entity_id === volNoTime);
    assert(Boolean(notOnDutyItem), 'Case H: Volunteer with no scheduled time detected');
    assert(notOnDutyItem?.title.includes('not currently on duty') && !notOnDutyItem?.title.includes('late'), 'Case H: Does NOT falsely label as late/no-show when time is unrecorded', {
      title: notOnDutyItem?.title,
      summary: notOnDutyItem?.summary,
      severity: notOnDutyItem?.severity
    });

    // -------------------------------------------------------------
    // TEST CASE I: 12 selected children without passes -> pass-readiness automation
    // -------------------------------------------------------------
    const parentId = `par-${Date.now()}`;
    const parentProfileId = `pp-${Date.now()}`;
    await execute(`INSERT INTO users (id, email, role, created_at, updated_at) VALUES (?, ?, 'parent', ?, ?)`, [parentId, `parent-${parentId}@koinonia.org`, nowIso, nowIso]);
    await execute(`INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at) VALUES (?, ?, 'Test Parent', '08012345678', ?, ?)`, [parentProfileId, parentId, nowIso, nowIso]);

    const entryIds: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const childId = `ch-${i}-${Date.now()}`;
      const entryId = `entry-${i}-${Date.now()}`;
      entryIds.push(entryId);
      await execute(`INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, created_at, updated_at) VALUES (?, ?, ?, '2018-05-10', 'Male', ?, ?)`, [childId, parentProfileId, `Child ${i}`, nowIso, nowIso]);
      await execute(`INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at) VALUES (?, ?, ?, 'selected', ?, ?)`, [entryId, childId, testEventId, nowIso, nowIso]);
    }

    await evaluateCurrentEventAutomations(testEventId);
    const automationsI = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });
    const passAuto = automationsI.find(a => a.signal_type === 'PASS_NOT_READY');
    assert(Boolean(passAuto && passAuto.title.includes('12 selected children still need passes')), 'Case I: 12 children without passes produces pass-readiness automation', {
      title: passAuto?.title,
      summary: passAuto?.summary
    });

    // -------------------------------------------------------------
    // TEST CASE J: All passes become ready -> resolved
    // -------------------------------------------------------------
    for (const eid of entryIds) {
      await execute(
        `INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
         VALUES (?, ?, ?, 'hash', 'active', ?, ?, ?)`,
        [`pass-${eid}`, eid, `PASS-${eid}`, nowIso, nowIso, nowIso]
      );
    }

    await evaluateCurrentEventAutomations(testEventId);
    const automationsJActive = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });
    const automationsJResolved = await getAutomationsForEvent(testEventId, { status: 'resolved', includeSafety: true });
    const passActiveJ = automationsJActive.find(a => a.signal_type === 'PASS_NOT_READY');
    const passResolvedJ = automationsJResolved.find(a => a.signal_type === 'PASS_NOT_READY');
    assert(!passActiveJ && Boolean(passResolvedJ), 'Case J: Generating all passes automatically resolves pass-readiness automation', {
      resolvedAt: passResolvedJ?.resolved_at
    });

    // -------------------------------------------------------------
    // TEST CASE K: Report expires -> automation + regenerate option
    // -------------------------------------------------------------
    const testJobId = `job-rep-${Date.now()}`;
    await execute(
      `INSERT INTO report_jobs (id, event_id, requested_by, template_key, report_name, status, access_profile, privacy_classification, created_at, updated_at)
       VALUES (?, ?, 'usr-admin', 'duty_roster', 'Duty Roster Summary', 'completed', 'admin', 'internal', ?, ?)`,
      [testJobId, testEventId, nowIso, nowIso]
    );

    const expiredReportId = `rep-exp-${Date.now()}`;
    await execute(
      `INSERT INTO generated_reports (id, report_job_id, snapshot_id, report_version, generator_version, storage_key, file_size, file_hash, page_count, generated_at, expires_at, created_at)
       VALUES (?, ?, 'snap-1', 1, '1.0', ?, 1024, 'hash1', 1, ?, ?, ?)`,
      [expiredReportId, testJobId, `key-${Date.now()}`, new Date(now - 48 * 3600000).toISOString(), new Date(now - 60000).toISOString(), nowIso]
    );

    await evaluateCurrentEventAutomations(testEventId);
    const automationsK = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });
    const reportAuto = automationsK.find(a => a.signal_type === 'REPORT_EXPIRED' && a.entity_id === expiredReportId);
    assert(Boolean(reportAuto && reportAuto.proposed_action_key === 'REGENERATE_REPORT'), 'Case K: Expired report produces automation with REGENERATE_REPORT action', {
      title: reportAuto?.title,
      summary: reportAuto?.summary,
      proposedAction: reportAuto?.proposed_action_key
    });

    // -------------------------------------------------------------
    // TEST CASE L: Unresolved safety item -> permission-aware automation
    // -------------------------------------------------------------
    const safetyAlertId = `safe-alert-${Date.now()}`;
    await execute(
      `INSERT INTO event_safety_alerts (id, event_id, raised_by_user_id, raised_by_role, severity, category, title, message, status, created_at, updated_at)
       VALUES (?, ?, ?, 'lead_safety', 'urgent', 'medical_concern', 'Child allergic reaction', 'Requires review', 'open', ?, ?)`,
      [safetyAlertId, testEventId, volUser1, nowIso, nowIso]
    );

    await evaluateCurrentEventAutomations(testEventId);
    const adminSafetyAutos = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });
    const safetyItemAdmin = adminSafetyAutos.find(a => a.signal_type === 'SAFETY_ITEM_OPEN');
    assert(Boolean(safetyItemAdmin), 'Case L: Open safety alert detected for admin role');

    const unprivilegedAutos = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: false });
    const safetyItemUnprivileged = unprivilegedAutos.find(a => a.signal_type === 'SAFETY_ITEM_OPEN');
    assert(!safetyItemUnprivileged, 'Case L: Safety item is strictly filtered out when includeSafety is false (permission preserved)');

    // -------------------------------------------------------------
    // TEST CASE M: Event A/B isolation
    // -------------------------------------------------------------
    const locBId = `loc-b-${Date.now()}`;
    await execute(
      `INSERT INTO event_locations (id, event_id, name, short_name, location_type, volunteer_capacity, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, 'Event B Sanctuary', 'EBS', 'sanctuary', 10, 1, 1, ?, ?)`,
      [locBId, testEventBId, nowIso, nowIso]
    );

    // Evaluate Event B
    await evaluateCurrentEventAutomations(testEventBId);
    const autosEventB = await getAutomationsForEvent(testEventBId, { status: 'active', includeSafety: true });
    const autosEventA = await getAutomationsForEvent(testEventId, { status: 'active', includeSafety: true });

    const eventBItemInA = autosEventA.find(a => a.entity_id === locBId);
    const eventBItemInB = autosEventB.find(a => a.entity_id === locBId);
    assert(!eventBItemInA && Boolean(eventBItemInB), 'Case M: Event A/B strict isolation verified (Event B condition never leaks into Event A)');

    // -------------------------------------------------------------
    // TEST CASE N: Repeated evaluator run -> no duplicate records
    // -------------------------------------------------------------
    const countBefore = (await getAutomationsForEvent(testEventId, { status: 'all', includeSafety: true })).length;
    await evaluateCurrentEventAutomations(testEventId);
    await evaluateCurrentEventAutomations(testEventId);
    const countAfter = (await getAutomationsForEvent(testEventId, { status: 'all', includeSafety: true })).length;
    assert(countBefore === countAfter, 'Case N: Repeated evaluations create zero duplicate records', {
      before: countBefore,
      after: countAfter
    });

    // -------------------------------------------------------------
    // TEST CASE O: Admin acknowledgement/dismissal -> cooldown respected
    // -------------------------------------------------------------
    if (reportAuto) {
      await acknowledgeAutomation(reportAuto.id, testEventId, 60);
      const ackRecord = await getAutomationById(reportAuto.id, testEventId);
      assert(ackRecord?.status === 'acknowledged', 'Case O: Automation successfully transitioned to acknowledged with cooldown');

      // Re-run evaluation: should NOT recreate or reset acknowledged status since condition hasn't changed
      await evaluateCurrentEventAutomations(testEventId);
      const ackRecordAfter = await getAutomationById(reportAuto.id, testEventId);
      assert(ackRecordAfter?.status === 'acknowledged', 'Case O: Cooldown respected on subsequent evaluation cycle (remains acknowledged)');
    } else {
      assert(false, 'Case O: Skipped, reportAuto not found');
    }

    // Health & Observability test
    const health = getAutomationEngineHealth();
    assert(Boolean(health.lastEvaluationAt && health.rulesEvaluatedCount > 0), 'Health & Observability: Engine health metrics tracked correctly', {
      lastEvaluationAt: health.lastEvaluationAt,
      rulesEvaluated: health.rulesEvaluatedCount,
      signalsDetected: health.signalsDetectedCount
    });

  } finally {
    // Clean up test data
    try {
      await execute('DELETE FROM event_automations WHERE event_id IN (?, ?)', [testEventId, testEventBId]);
      await execute('DELETE FROM event_automation_settings WHERE event_id IN (?, ?)', [testEventId, testEventBId]);
      await execute('DELETE FROM event_passes WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id = ?)', [testEventId]);
      await execute('DELETE FROM child_event_entries WHERE event_id = ?', [testEventId]);
      await execute("DELETE FROM children WHERE id LIKE 'ch-%'");
      await execute('DELETE FROM event_duty_location_presence WHERE event_id = ?', [testEventId]);
      await execute('DELETE FROM event_duty_assignments WHERE event_id = ?', [testEventId]);
      await execute('DELETE FROM event_locations WHERE event_id IN (?, ?)', [testEventId, testEventBId]);
      await execute('DELETE FROM generated_reports WHERE report_job_id IN (SELECT id FROM report_jobs WHERE event_id = ?)', [testEventId]);
      await execute('DELETE FROM report_jobs WHERE event_id = ?', [testEventId]);
      await execute('DELETE FROM event_safety_alerts WHERE event_id = ?', [testEventId]);
      await execute('DELETE FROM events WHERE id IN (?, ?)', [testEventId, testEventBId]);
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }
  }

  console.log('\n----------------------------------------------------');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('----------------------------------------------------');

  return { passed, failed };
}

runEventAutomationEngineTests().then(({ passed, failed }) => {
  process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

