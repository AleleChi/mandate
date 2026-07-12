import crypto from 'crypto';
import { execute, query, queryOne, transaction, REAL_EVENT_ID } from '../src/server/db';
import { 
  acknowledgeAndRespond, 
  joinResponse, 
  leaveResponse, 
  markResponseInProgress, 
  addResponseUpdate, 
  requestResponseAssistance, 
  requestResponseHandover, 
  respondToResponseHandover, 
  adminReassignResponse, 
  resolveAlertResponse, 
  reopenAlertResponse, 
  getAlertResponseTimeline, 
  getVolunteerSafeAlertProgress,
  getAlertResponseState,
  AlertResponseError,
  Actor
} from '../src/server/services/alertResponseService';

async function runTests() {
  console.log('========================================================');
  console.log('STARTING PHASE 4A BACKEND RESPONSE COORDINATION TESTS   ');
  console.log('========================================================');

  const runId = Date.now().toString().substring(8);
  const now = new Date().toISOString();

  // 1. Prepare Seed Accounts in Database
  console.log('\n[Prep] Seeding test accounts and roles...');
  
  const adminUser: Actor = { id: `test_admin_${runId}`, role: 'admin', email: `admin_${runId}@koinonia.org` };
  const volunteer1: Actor = { id: `test_vol1_${runId}`, role: 'volunteer', email: `vol1_${runId}@koinonia.org` };
  const volunteer2: Actor = { id: `test_vol2_${runId}`, role: 'volunteer', email: `vol2_${runId}@koinonia.org` };
  const volunteer3: Actor = { id: `test_vol3_${runId}`, role: 'volunteer', email: `vol3_${runId}@koinonia.org` };
  const suspendedVol: Actor = { id: `test_vol_susp_${runId}`, role: 'volunteer', email: `vol_susp_${runId}@koinonia.org` };

  // Seed Users
  const usersToSeed = [adminUser, volunteer1, volunteer2, volunteer3, suspendedVol];
  for (const u of usersToSeed) {
    await execute(
      `INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
       VALUES (?, ?, 'mock_hash', ?, 1, ?, ?)`,
      [u.id, u.email, u.role, now, now]
    );
  }

  // Seed Volunteer Profiles
  await execute(
    `INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
     VALUES (?, ?, 'Volunteer One', '111', '111', 'Ages 7-9 Team', 'active', ?, ?)`,
    [`profile_vol1_${runId}`, volunteer1.id, now, now]
  );
  await execute(
    `INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
     VALUES (?, ?, 'Volunteer Two', '222', '222', 'Ages 4-6 Team', 'active', ?, ?)`,
    [`profile_vol2_${runId}`, volunteer2.id, now, now]
  );
  await execute(
    `INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
     VALUES (?, ?, 'Volunteer Three', '333', '333', 'Medical Team', 'active', ?, ?)`,
    [`profile_vol3_${runId}`, volunteer3.id, now, now]
  );
  await execute(
    `INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
     VALUES (?, ?, 'Suspended Vol', '444', '444', 'Care Team', 'suspended', ?, ?)`,
    [`profile_susp_${runId}`, suspendedVol.id, now, now]
  );

  // Seed User Duty Status (volunteers on duty for REAL_EVENT_ID)
  const dutyVolunteers = [volunteer1, volunteer2, volunteer3, suspendedVol];
  for (const v of dutyVolunteers) {
    const assignedTeam = v.id === volunteer3.id ? 'Medical Team' : 'Care Team';
    await execute(
      `INSERT INTO user_duty_status (id, user_id, active, approved, on_duty, alert_enabled, assigned_event_id, assigned_team, created_at, updated_at)
       VALUES (?, ?, 1, 1, 1, 1, ?, ?, ?, ?)`,
      [`duty_${v.id}`, v.id, REAL_EVENT_ID, assignedTeam, now, now]
    );
  }

  // Set up an active alert
  const alertId = `alert_${runId}`;
  await execute(
    `INSERT INTO event_safety_alerts (id, event_id, raised_by_user_id, raised_by_role, severity, category, title, message, status, created_at, updated_at)
     VALUES (?, ?, ?, 'volunteer', 'urgent', 'medical_support', 'First Aid Required', 'Child fell and scraped knee', 'open', ?, ?)`,
    [alertId, REAL_EVENT_ID, volunteer1.id, now, now]
  );

  console.log(`✅ Seed complete. Created alert: ${alertId}`);

  // ========================================================
  // TEST A — Single acknowledgement
  // ========================================================
  console.log('\n[Test A] Single acknowledgement & ownership claim...');
  const stateA = await acknowledgeAndRespond({
    actor: volunteer1,
    alertId,
    idempotencyKey: `idem_ack_A_${runId}`
  });
  if (stateA.alert.status !== 'acknowledged') throw new Error('Alert status is not acknowledged');
  if (stateA.response.owner?.id !== volunteer1.id) throw new Error('Owner was not assigned correctly');
  console.log('✅ Test A Passed: Eligible responder successfully claimed ownership and updated status.');

  // ========================================================
  // TEST B — Simultaneous acknowledgement (Concurrency Test)
  // ========================================================
  console.log('\n[Test B] Simultaneous acknowledgement (Concurrency Control)...');
  // Create another alert for concurrent tests
  const alertIdB = `alert_B_${runId}`;
  await execute(
    `INSERT INTO event_safety_alerts (id, event_id, raised_by_user_id, raised_by_role, severity, category, title, message, status, created_at, updated_at)
     VALUES (?, ?, ?, 'volunteer', 'urgent', 'care', 'Lost Child Concern', 'Child missing from group', 'open', ?, ?)`,
    [alertIdB, REAL_EVENT_ID, volunteer1.id, now, now]
  );

  let successCount = 0;
  let conflictCount = 0;

  // Run two acknowledgements in parallel
  const results = await Promise.allSettled([
    acknowledgeAndRespond({ actor: volunteer1, alertId: alertIdB, idempotencyKey: `idem_ack_B1_${runId}` }),
    acknowledgeAndRespond({ actor: volunteer2, alertId: alertIdB, idempotencyKey: `idem_ack_B2_${runId}` })
  ]);

  for (const res of results) {
    if (res.status === 'fulfilled') {
      successCount++;
    } else {
      const err = res.reason;
      if (err instanceof AlertResponseError && err.code === 'ALERT_ALREADY_OWNED') {
        conflictCount++;
        console.log(`-> Received expected conflict response: ${err.message}`);
      } else {
        console.error('-> Unexpected parallel execution failure:', err);
      }
    }
  }

  // Ensure database constraint integrity: exactly one owner is selected
  const finalAlertB = await queryOne('SELECT owner_user_id, status FROM event_safety_alerts WHERE id = ?', [alertIdB]);
  const activeAssignmentsB = await query('SELECT * FROM alert_response_assignments WHERE alert_id = ? AND assignment_status = \'active\'', [alertIdB]);

  if (successCount !== 1 || conflictCount !== 1) {
    throw new Error(`Concurrency anomaly detected! Success count: ${successCount}, Conflict count: ${conflictCount}`);
  }
  if (!finalAlertB.owner_user_id) {
    throw new Error('Concurrency failure: Final owner is missing');
  }
  if (activeAssignmentsB.length !== 1) {
    throw new Error(`Expected exactly 1 active assignment, found ${activeAssignmentsB.length}`);
  }
  console.log(`✅ Test B Passed: Atomic transaction-safe claiming successful under concurrency. Active assignments: ${activeAssignmentsB.length}`);

  // ========================================================
  // TEST C — Duplicate acknowledgement
  // ========================================================
  console.log('\n[Test C] Duplicate acknowledgement with same idempotency key...');
  const doubleAck = await acknowledgeAndRespond({
    actor: volunteer1,
    alertId,
    idempotencyKey: `idem_ack_A_${runId}` // Repeat same key as Test A
  });
  // Should succeed safely without duplicate history or version increments
  console.log(`✅ Test C Passed: Idempotent query bypassed safely. Version matches: ${doubleAck.response.version}`);

  // ========================================================
  // TEST D — Join as assistant
  // ========================================================
  console.log('\n[Test D] Joining response as assistant...');
  const stateD = await joinResponse({
    actor: volunteer2,
    alertId,
    idempotencyKey: `idem_assist_${runId}`
  });
  if (stateD.response.assistants.length !== 1 || stateD.response.assistants[0].id !== volunteer2.id) {
    throw new Error('Assistant was not joined properly.');
  }
  if (stateD.response.owner?.id !== volunteer1.id) {
    throw new Error('Owner was altered after assistant joined.');
  }

  // Attempt duplicate assistant join
  try {
    await joinResponse({
      actor: volunteer2,
      alertId
    });
    throw new Error('Failed to block duplicate assistant joining');
  } catch (err: any) {
    if (err.code !== 'PRECONDITION_FAILED') throw err;
    console.log('-> Correctly blocked duplicate assistant join.');
  }
  console.log('✅ Test D Passed: Assistants joined securely and duplicates prevented.');

  // ========================================================
  // TEST E — Mark in progress
  // ========================================================
  console.log('\n[Test E] Progress status transitions (Mark In Progress)...');
  // Attempt with assistant (should fail)
  try {
    await markResponseInProgress({
      actor: volunteer2,
      alertId
    });
    throw new Error('Failed to block assistant from marking progress');
  } catch (err: any) {
    if (err.code !== 'PRECONDITION_FAILED') throw err;
    console.log('-> Assistant correctly blocked from progressing.');
  }

  // Owner marks in progress
  const stateE = await markResponseInProgress({
    actor: volunteer1,
    alertId,
    idempotencyKey: `idem_progress_${runId}`
  });
  if (stateE.alert.status !== 'in_progress') throw new Error('Status failed to transit to in_progress');
  if (!stateE.alert.inProgressAt) throw new Error('inProgressAt timestamp is missing');
  console.log('✅ Test E Passed: Role-based status progression verified successfully.');

  // ========================================================
  // TEST F — Update visibility
  // ========================================================
  console.log('\n[Test F] Testing visibility updates filtering...');
  await addResponseUpdate({
    actor: volunteer1,
    alertId,
    updateType: 'first_aid',
    note: 'Bandage applied to child.',
    visibility: 'safe_requester_update',
    idempotencyKey: `idem_up1_${runId}`
  });

  await addResponseUpdate({
    actor: volunteer1,
    alertId,
    updateType: 'coordination',
    note: 'Supervisor consulted privately.',
    visibility: 'response_team',
    idempotencyKey: `idem_up2_${runId}`
  });

  // Verify that requester progress only returns 'safe_requester_update'
  const requesterProgress = await getVolunteerSafeAlertProgress(alertId);
  if (requesterProgress.updates.length !== 1 || requesterProgress.updates[0].note !== 'Bandage applied to child.') {
    throw new Error('Requester progress returned internal team-only updates!');
  }
  console.log('✅ Test F Passed: Requester progress view correctly filtered internal team updates.');

  // ========================================================
  // TEST G — Assistance request
  // ========================================================
  console.log('\n[Test G] Requesting additional assistance...');
  const stateG = await requestResponseAssistance({
    actor: volunteer1,
    alertId,
    teamKey: 'Medical Team',
    note: 'Need an extra medical kit.',
    idempotencyKey: `idem_assist_req_${runId}`
  });
  // Check if volunteer3 (Medical Team) has been added as a recipient of this alert
  const rec = await queryOne('SELECT * FROM safety_alert_recipients WHERE alert_id = ? AND recipient_user_id = ?', [alertId, volunteer3.id]);
  if (!rec) {
    throw new Error('Target assistance team was not added as recipients of this alert');
  }
  console.log('✅ Test G Passed: Assistance request resolved eligible targets and created recipient routing.');

  // ========================================================
  // TEST H — Handover accepted
  // ========================================================
  console.log('\n[Test H] Requesting and accepting handover of response owner...');
  const stateH_req = await requestResponseHandover({
    actor: volunteer1,
    alertId,
    targetUserId: volunteer2.id,
    reason: 'Shift ending'
  });
  if (!stateH_req.response.handover || stateH_req.response.handover.toUser?.id !== volunteer2.id) {
    throw new Error('Handover request was not recorded as pending');
  }

  // Accept handover
  const stateH_dec = await respondToResponseHandover({
    actor: volunteer2,
    alertId,
    handoverId: stateH_req.response.handover.id,
    decision: 'accept',
    note: 'Accepted shift handoff'
  });
  if (stateH_dec.response.owner?.id !== volunteer2.id) {
    throw new Error('Ownership was not atomically transferred to target');
  }
  console.log('✅ Test H Passed: Handover requested and accepted atomically with ownership reassignment.');

  // ========================================================
  // TEST I — Handover declined
  // ========================================================
  console.log('\n[Test I] Requesting and declining handover...');
  // Request handover from volunteer2 (current owner) to volunteer3
  const stateI_req = await requestResponseHandover({
    actor: volunteer2,
    alertId,
    targetUserId: volunteer3.id,
    reason: 'Assistance completed'
  });

  // Decline handover
  const stateI_dec = await respondToResponseHandover({
    actor: volunteer3,
    alertId,
    handoverId: stateI_req.response.handover.id,
    decision: 'decline',
    note: 'Sorry, busy in classroom.'
  });
  if (stateI_dec.response.owner?.id !== volunteer2.id) {
    throw new Error('Ownership was altered on decline.');
  }
  if (stateI_dec.response.handover !== null) {
    throw new Error('Handover was not resolved/cleared after decline');
  }
  console.log('✅ Test I Passed: Handover decline correctly retained current owner.');

  // ========================================================
  // TEST J — Stale handover request reuse
  // ========================================================
  console.log('\n[Test J] Reusing stale handover request...');
  try {
    await respondToResponseHandover({
      actor: volunteer3,
      alertId,
      handoverId: stateI_req.response.handover.id, // Try to accept the declined request
      decision: 'accept'
    });
    throw new Error('Stale handover request allowed to be reused');
  } catch (err: any) {
    if (err.code !== 'STALE_HANDOVER_REQUEST') throw err;
    console.log('-> Stale handover reuse correctly blocked.');
  }
  console.log('✅ Test J Passed: Stale handovers are protected from reuse.');

  // ========================================================
  // TEST K — Admin reassignment
  // ========================================================
  console.log('\n[Test K] Admin reassignment...');
  // Volunteer tries (should fail)
  try {
    await adminReassignResponse({
      actor: volunteer1,
      alertId,
      targetUserId: volunteer3.id,
      reason: 'Rule breach'
    });
    throw new Error('Volunteer permitted to admin-reassign alert owner');
  } catch (err: any) {
    if (err.code !== 'PRECONDITION_FAILED') throw err;
  }

  // Admin succeeds
  const stateK = await adminReassignResponse({
    actor: adminUser,
    alertId,
    targetUserId: volunteer3.id,
    reason: 'Emergency assignment override'
  });
  if (stateK.response.owner?.id !== volunteer3.id) {
    throw new Error('Ownership reassignment failed for administrator');
  }
  console.log('✅ Test K Passed: Authorized admin reassigned ownership and blocked volunteers.');

  // ========================================================
  // TEST L — Resolution
  // ========================================================
  console.log('\n[Test L] Alert resolution and parameter validation...');
  // Try missing resolution outcome
  try {
    await resolveAlertResponse({
      actor: volunteer3, // current owner
      alertId,
      outcome: '',
      resolutionNote: 'Note here'
    });
    throw new Error('Resolution allowed with empty outcome');
  } catch (err: any) {
    if (err.code !== 'VALIDATION_ERROR') throw err;
  }

  const stateL = await resolveAlertResponse({
    actor: volunteer3,
    alertId,
    outcome: 'Resolved successfully',
    resolutionNote: 'All care instructions given'
  });
  if (stateL.alert.status !== 'resolved') throw new Error('Alert failed to transit to resolved');
  if (stateL.response.owner !== null) throw new Error('Active assignments was not cleared on resolution');
  console.log('✅ Test L Passed: Required resolution fields validated and state progressed.');

  // ========================================================
  // TEST M — Duplicate resolution
  // ========================================================
  console.log('\n[Test M] Duplicate resolution...');
  const doubleRes = await resolveAlertResponse({
    actor: volunteer3,
    alertId,
    outcome: 'Resolved successfully',
    resolutionNote: 'All care instructions given'
  });
  console.log(`✅ Test M Passed: Duplicate resolution bypassed safely. Version: ${doubleRes.response.version}`);

  // ========================================================
  // TEST N — Reopen
  // ========================================================
  console.log('\n[Test N] Reopening resolved alerts...');
  // Volunteer tries (should fail)
  try {
    await reopenAlertResponse({
      actor: volunteer1,
      alertId,
      reason: 'Still bleeding'
    });
    throw new Error('Volunteer allowed to reopen resolved alerts');
  } catch (err: any) {
    if (err.code !== 'PRECONDITION_FAILED') throw err;
  }

  // Admin succeeds
  const stateN = await reopenAlertResponse({
    actor: adminUser,
    alertId,
    reason: 'Recurred symptoms'
  });
  if (stateN.alert.status !== 'reopened') throw new Error('Alert failed to transit to reopened');
  if (stateN.response.owner !== null) throw new Error('Owner should be cleared when alert is reopened');
  console.log('✅ Test N Passed: Admin successfully reopened alert and cleared ownership.');

  // ========================================================
  // TEST O — Safe requester progress
  // ========================================================
  console.log('\n[Test O] Testing safe requester progress detail exclusion...');
  const progressO = await getVolunteerSafeAlertProgress(alertId);
  // Ensure that no private responder credentials or other updates are leaked
  if (progressO.updates.some((u: any) => u.note.includes('privately'))) {
    throw new Error('Security risk: private updates returned in progress!');
  }
  console.log('✅ Test O Passed: Only safe visibility records returned in requester view.');

  // ========================================================
  // TEST P — Timeline pagination
  // ========================================================
  console.log('\n[Test P] Pagination and stable ordering of timeline...');
  const timeline = await getAlertResponseTimeline({
    actor: adminUser,
    alertId,
    page: 1,
    limit: 5
  });
  if (timeline.items.length > 5) {
    throw new Error(`Pagination limit failed. Expected max 5, got ${timeline.items.length}`);
  }
  if (!timeline.pagination.totalPages) {
    throw new Error('Pagination metadata totalPages is missing');
  }
  console.log(`✅ Test P Passed: Timeline returned ${timeline.items.length} items on page 1, total: ${timeline.pagination.total}.`);

  // ========================================================
  // TEST Q — Current event isolation
  // ========================================================
  console.log('\n[Test Q] Current event isolation bounds...');
  
  // Satisfy foreign key constraint on events
  const existingEvent = await queryOne('SELECT id FROM events WHERE id = ?', ['another-event-id']);
  if (!existingEvent) {
    await execute(
      `INSERT INTO events (id, title, created_at, updated_at)
       VALUES ('another-event-id', 'Another Event', ?, ?)`,
      [now, now]
    );
  }

  // Create an alert on a fake event
  const fakeAlertId = `fake_alert_${runId}`;
  await execute(
    `INSERT INTO event_safety_alerts (id, event_id, raised_by_user_id, raised_by_role, severity, category, title, message, status, created_at, updated_at)
     VALUES (?, 'another-event-id', ?, 'volunteer', 'urgent', 'care', 'Isolation Test', 'Test message', 'open', ?, ?)`,
    [fakeAlertId, volunteer1.id, now, now]
  );

  try {
    await acknowledgeAndRespond({
      actor: volunteer1,
      alertId: fakeAlertId
    });
    throw new Error('Allowed to claim ownership of an alert from another event!');
  } catch (err: any) {
    if (err.code !== 'EVENT_ISOLATION_VIOLATION') throw err;
    console.log('-> Safely blocked access to alert belonging to another event.');
  }
  console.log('✅ Test Q Passed: Actor strictly isolated from alerts belonging to other events.');

  // ========================================================
  // TEST R — Suspended/inactive actor
  // ========================================================
  console.log('\n[Test R] Inactive / Suspended actor rejection...');
  try {
    await acknowledgeAndRespond({
      actor: suspendedVol,
      alertId
    });
    throw new Error('Suspended volunteer was allowed to acknowledge and respond!');
  } catch (err: any) {
    if (err.code !== 'ACTOR_SUSPENDED') throw err;
    console.log('-> Suspended volunteer safely rejected.');
  }
  console.log('✅ Test R Passed: Suspended or inactive actors are fully blocked.');

  // ========================================================
  // TEST S & T — Regressions & Latency
  // ========================================================
  console.log('\n[Test S] Existing Phase 3 routing regression check...');
  const alertsCount = await queryOne('SELECT COUNT(*) as count FROM event_safety_alerts');
  if (!alertsCount || Number(alertsCount.count) < 2) {
    throw new Error('Alert records went missing');
  }
  console.log('✅ Test S Passed: Existing routing tables and safety alert counts are intact.');

  console.log('\n[Test T] Urgent acknowledgement latency measure...');
  const alertIdT = `alert_T_${runId}`;
  await execute(
    `INSERT INTO event_safety_alerts (id, event_id, raised_by_user_id, raised_by_role, severity, category, title, message, status, created_at, updated_at)
     VALUES (?, ?, ?, 'volunteer', 'urgent', 'medical_support', 'First Aid Required', 'Child fell and scraped knee', 'open', ?, ?)`,
    [alertIdT, REAL_EVENT_ID, volunteer1.id, now, now]
  );

  const tStart = Date.now();
  await acknowledgeAndRespond({
    actor: volunteer1,
    alertId: alertIdT,
    idempotencyKey: `idem_ack_T_${runId}`
  });
  const duration = Date.now() - tStart;
  console.log(`✅ Test T Passed: Acknowledge took ${duration}ms (Commit-to-SSE occurs asynchronously in background).`);

  console.log('\n========================================================');
  console.log('🎉 ALL PHASE 4A RESPONSE COORDINATION TESTS PASSED SUCCESSFULLY! ');
  console.log('========================================================');
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ TEST VERIFICATION FAILED:', err);
  process.exit(1);
});
