import crypto from 'crypto';
import { execute, query, queryOne, transaction, REAL_EVENT_ID } from '../src/server/db';
import {
  createIncident,
  updateIncidentDraft,
  submitIncident,
  submitChangeRequest,
  resolveChangeRequests,
  addFollowUpAction,
  completeFollowUpAction,
  updateClosureChecklist,
  closeIncident,
  reopenIncident,
  voidIncident,
  getIncidentsList,
  getIncidentHistory,
  getIncidentStats,
  getIncidentState,
  getIncidentByAlertId,
  IncidentError,
  Actor
} from '../src/server/services/incidentService';

async function runTests() {
  console.log('========================================================');
  console.log('STARTING PHASE 8 BACKEND INCIDENTS LIFE-CYCLE TESTS      ');
  console.log('========================================================');

  const runId = Date.now().toString().substring(8);
  const now = new Date().toISOString();

  // 1. Prepare Seed Accounts and Profiles
  console.log('\n[Prep] Seeding users and events...');

  const adminUser: Actor = { id: `inc_admin_${runId}`, role: 'admin', email: `inc_admin_${runId}@koinonia.org` };
  const volunteerCreator: Actor = { id: `inc_vol_cr_${runId}`, role: 'volunteer', email: `inc_vol_cr_${runId}@koinonia.org` };
  const volunteerInvolved: Actor = { id: `inc_vol_inv_${runId}`, role: 'volunteer', email: `inc_vol_inv_${runId}@koinonia.org` };
  const volunteerUninvolved: Actor = { id: `inc_vol_un_${runId}`, role: 'volunteer', email: `inc_vol_un_${runId}@koinonia.org` };

  // Seed Users
  const usersToSeed = [adminUser, volunteerCreator, volunteerInvolved, volunteerUninvolved];
  for (const u of usersToSeed) {
    await execute(
      `INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
       VALUES (?, ?, 'mock_hash', ?, 1, ?, ?)`,
      [u.id, u.email, u.role, now, now]
    );
  }

  // Seed Volunteer Profiles (with 'approved' status)
  const volProfiles = [
    { userId: volunteerCreator.id, fullName: 'Creator Volunteer' },
    { userId: volunteerInvolved.id, fullName: 'Involved Volunteer' },
    { userId: volunteerUninvolved.id, fullName: 'Uninvolved Volunteer' },
  ];
  for (const p of volProfiles) {
    await execute(
      `INSERT INTO volunteer_profiles (id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at)
       VALUES (?, ?, ?, '111', '111', 'Ages 7-9 Team', 'approved', ?, ?)`,
      [`profile_${p.userId}`, p.userId, p.fullName, now, now]
    );
  }

  // Seed event & event_safety_alerts
  const testEventId = REAL_EVENT_ID;
  const testAlertId = `alert_inc_${runId}`;
  await execute(
    `INSERT INTO event_safety_alerts (id, event_id, raised_by_user_id, raised_by_role, severity, category, title, message, status, owner_user_id, created_at, updated_at)
     VALUES (?, ?, ?, 'volunteer', 'high', 'medical', 'Knee Scraped', 'Child fell down', 'open', ?, ?, ?)`,
    [testAlertId, testEventId, volunteerCreator.id, volunteerInvolved.id, now, now]
  );

  console.log(`✅ Seed completed. Test Alert: ${testAlertId}`);

  // =========================================================================
  // TEST A: Access Policies & Unauthorized Blocks
  // =========================================================================
  console.log('\n[Test A] Verifying access boundary rules...');
  
  try {
    await createIncident({
      actor: volunteerUninvolved,
      alertId: testAlertId,
      category: 'medical',
      title: 'Uninvolved Medical Incident',
      description: 'Test details',
      structuredData: { symptoms: 'fever', treatment: 'paracetamol', doctorNotified: false, hospitalVisitRequired: false },
    });
    throw new Error('❌ Test A Failed: Uninvolved volunteer was allowed to create incident.');
  } catch (e: any) {
    if (e.code === 'ACCESS_DENIED') {
      console.log('✅ Correctly blocked uninvolved volunteer from creating incident.');
    } else {
      throw e;
    }
  }

  // =========================================================================
  // TEST B: Draft Saving & Privacy Redaction (Role-Aware Serializers)
  // =========================================================================
  console.log('\n[Test B] Creating incident draft & checking serialization redaction...');

  const structuredMedical = {
    symptoms: 'Child fell and scraped knee',
    treatment: 'Applied antiseptic wipe and adhesive bandage',
    doctorNotified: false,
    hospitalVisitRequired: false,
  };

  const incident = await createIncident({
    actor: volunteerCreator,
    alertId: testAlertId,
    category: 'medical',
    title: 'Scraped Knee',
    description: 'Detailed private report: Child is allergic to latex bandages.',
    structuredData: structuredMedical,
    parentContact: '+234 803 111 2222',
    firstAid: 'Antiseptic',
  });

  const incidentId = incident.id;
  console.log(`✅ Incident draft created successfully: ${incidentId}`);

  // Test Serialization for Creator (Should NOT be redacted)
  const stateCreator = await getIncidentState(incidentId, volunteerCreator);
  if (stateCreator.description !== 'Detailed private report: Child is allergic to latex bandages.' || stateCreator.parentContact !== '+234 803 111 2222') {
    throw new Error('❌ Test B Failed: Sensitive details were redacted for the creator.');
  }
  console.log('✅ Creator serialization intact.');

  // Test Serialization for Involved Volunteer (Involved as owner, should be treated as unauthorized for sensitive redaction unless admin/creator)
  const stateInvolved = await getIncidentState(incidentId, volunteerInvolved);
  if (stateInvolved.description === '[REDACTED FOR PRIVACY - SENSITIVE CASE]' && stateInvolved.parentContact === '[REDACTED]') {
    console.log('✅ Correctly redacted sensitive fields for non-creator, non-admin volunteer.');
  } else {
    throw new Error('❌ Test B Failed: Unredacted details leaked to unauthorized volunteer.');
  }

  // =========================================================================
  // TEST C: Enforcing One Incident Per Alert Constraint
  // =========================================================================
  console.log('\n[Test C] Enforcing "One Incident per Alert" rule...');
  try {
    await createIncident({
      actor: volunteerCreator,
      alertId: testAlertId,
      category: 'medical',
      title: 'Scraped Knee Duplicate',
      description: 'Another draft',
      structuredData: structuredMedical,
    });
    throw new Error('❌ Test C Failed: Allowed duplicate incident for the same safety alert.');
  } catch (e: any) {
    if (e.code === 'DUPLICATE_RECORD') {
      console.log('✅ Correctly blocked duplicate incident creation.');
    } else {
      throw e;
    }
  }

  // =========================================================================
  // TEST D: Draft Updates & Concurrency Control
  // =========================================================================
  console.log('\n[Test D] Verifying concurrency control (optimistic locking)...');

  // Attempt update with wrong expected version
  try {
    await updateIncidentDraft({
      actor: volunteerCreator,
      incidentId,
      expectedVersion: 999, // wrong version
      title: 'Scraped Knee (Updated Title)',
    });
    throw new Error('❌ Test D Failed: Allowed update with stale version.');
  } catch (e: any) {
    if (e.code === 'CONCURRENCY_CONFLICT') {
      console.log('✅ Optimistic locking block verified successfully.');
    } else {
      throw e;
    }
  }

  // Proper version update
  const stateDraftUpdated = await updateIncidentDraft({
    actor: volunteerCreator,
    incidentId,
    expectedVersion: 1,
    title: 'Scraped Knee (Updated Title)',
  });
  if (stateDraftUpdated.title === 'Scraped Knee (Updated Title)' && stateDraftUpdated.version === 2) {
    console.log('✅ Valid update draft and version incremented correctly.');
  } else {
    throw new Error('❌ Test D Failed: Draft update did not apply correctly.');
  }

  // =========================================================================
  // TEST E: Submit with Structured Field Validations
  // =========================================================================
  console.log('\n[Test E] Testing submission validation rules...');

  // Attempt submit with empty symptoms (validation should fail)
  try {
    await submitIncident({
      actor: volunteerCreator,
      incidentId,
      expectedVersion: 2,
      structuredData: { symptoms: '', treatment: 'Ice Pack', doctorNotified: false, hospitalVisitRequired: false },
    });
    throw new Error('❌ Test E Failed: Submitted medical incident with missing symptoms.');
  } catch (e: any) {
    if (e.code === 'VALIDATION_ERROR' && e.fieldErrors?.symptoms) {
      console.log('✅ Correctly blocked submission due to missing category-specific medical symptoms.');
    } else {
      throw e;
    }
  }

  // Successful submission
  const stateSubmitted = await submitIncident({
    actor: volunteerCreator,
    incidentId,
    expectedVersion: 2,
    structuredData: structuredMedical,
    description: 'Full resolved description.',
  });
  if (stateSubmitted.status === 'submitted' && stateSubmitted.version === 3) {
    console.log('✅ Incident successfully submitted for review with valid details.');
  } else {
    throw new Error('❌ Test E Failed: Submission failed.');
  }

  // =========================================================================
  // TEST F: Change Request Cycle & Needs Revision Flow
  // =========================================================================
  console.log('\n[Test F] Testing admin Change Request & Needs Revision flow...');

  const stateNeedsRev = await submitChangeRequest({
    actor: adminUser,
    incidentId,
    expectedVersion: 3,
    notes: 'Please add details on child allergies.',
  });

  if (stateNeedsRev.status === 'needs_revision' && stateNeedsRev.version === 4) {
    const changeReqs = stateNeedsRev.changeRequests;
    if (changeReqs.length === 1 && changeReqs[0].status === 'pending' && changeReqs[0].requestNotes === 'Please add details on child allergies.') {
      console.log('✅ Admin change request successfully applied. Status transitioned to Needs Revision.');
    } else {
      throw new Error('❌ Test F Failed: Change request details mismatch.');
    }
  } else {
    throw new Error('❌ Test F Failed: Transition to needs_revision failed.');
  }

  // Creator modifies to resolve revision and submits
  const stateResolvedSubmit = await submitIncident({
    actor: volunteerCreator,
    incidentId,
    expectedVersion: 4,
    description: 'Full details added: Kid has latex allergy, but antiseptic is fine.',
  });

  // Automatically resolve change requests
  const stateCheckResolved = await resolveChangeRequests({
    actor: volunteerCreator,
    incidentId,
    expectedVersion: 5,
  });

  const finalReqs = stateCheckResolved.changeRequests;
  if (finalReqs[0].status === 'resolved') {
    console.log('✅ Change requests resolved after correct submission updates.');
  } else {
    throw new Error('❌ Test F Failed: Change requests not marked as resolved.');
  }

  // =========================================================================
  // TEST G: Follow-up Actions (Creation, Assignment, and Completion)
  // =========================================================================
  console.log('\n[Test G] Testing Follow-up action item workflows...');

  const stateWithFollowUp = await addFollowUpAction({
    actor: volunteerCreator,
    incidentId,
    expectedVersion: 6,
    title: 'Call parents tomorrow to check in on recovery',
    assignedToUserId: volunteerInvolved.id,
  });

  const actionsList = stateWithFollowUp.followUpActions;
  if (actionsList.length === 1 && actionsList[0].status === 'pending' && actionsList[0].assignedToUserId === volunteerInvolved.id) {
    console.log('✅ Follow-up action added and assigned successfully.');
  } else {
    throw new Error('❌ Test G Failed: Follow-up action not found or misassigned.');
  }

  // Mark completed
  const stateFollowUpCompleted = await completeFollowUpAction({
    actor: volunteerCreator,
    incidentId,
    expectedVersion: 7,
    actionId: actionsList[0].id,
    completed: true,
    completedNote: 'Spoke with mom, child is fully fine and back playing.',
  });

  if (stateFollowUpCompleted.followUpActions[0].status === 'completed' && stateFollowUpCompleted.followUpActions[0].completedNote === 'Spoke with mom, child is fully fine and back playing.') {
    console.log('✅ Follow-up action successfully marked completed with resolution note.');
  } else {
    throw new Error('❌ Test G Failed: Follow-up completion update failed.');
  }

  // =========================================================================
  // TEST H: Checklist Management & Formal Closure
  // =========================================================================
  console.log('\n[Test H] Managing closure checklist & formally closing incident...');

  // Setup closure checklist (un-satisfied, missing sign-off)
  const checklistPartial = {
    parentNotified: true,
    safeguardingReviewCompleted: false,
    followUpsClosed: true,
    signedOffByAdmin: false,
  };

  const stateChecklistUpdated = await updateClosureChecklist({
    actor: adminUser,
    incidentId,
    expectedVersion: 8,
    checklist: checklistPartial,
  });

  // Try close (should fail because signedOffByAdmin is false)
  try {
    await closeIncident({
      actor: adminUser,
      incidentId,
      expectedVersion: 9,
    });
    throw new Error('❌ Test H Failed: Allowed closure with unsatisfied checklist.');
  } catch (e: any) {
    if (e.code === 'VALIDATION_ERROR' && e.fieldErrors?.signedOffByAdmin) {
      console.log('✅ Correctly blocked closure due to missing Admin sign-off in checklist.');
    } else {
      throw e;
    }
  }

  // Satisfy checklist
  const checklistFull = {
    parentNotified: true,
    safeguardingReviewCompleted: true,
    followUpsClosed: true,
    signedOffByAdmin: true,
  };

  await updateClosureChecklist({
    actor: adminUser,
    incidentId,
    expectedVersion: 9,
    checklist: checklistFull,
  });

  const stateClosed = await closeIncident({
    actor: adminUser,
    incidentId,
    expectedVersion: 10,
  });

  if (stateClosed.status === 'closed' && stateClosed.version === 11) {
    console.log('✅ Incident successfully satisfied all closure criteria and is closed!');
  } else {
    throw new Error('❌ Test H Failed: Final closure transition failed.');
  }

  // =========================================================================
  // TEST I: Reopening Closed Incidents & History Audits
  // =========================================================================
  console.log('\n[Test I] Testing Admin Reopening closed incidents & immutable history auditing...');

  const stateReopened = await reopenIncident({
    actor: adminUser,
    incidentId,
    expectedVersion: 11,
    reason: 'Parent called and reported late infection symptoms, need medical review.',
  });

  if (stateReopened.status === 'submitted' && !stateReopened.closureChecklist.signedOffByAdmin) {
    console.log('✅ Incident reopened by Admin. Admin sign-off reset to false.');
  } else {
    throw new Error('❌ Test I Failed: Reopening failed or did not clear admin sign-off.');
  }

  // Query Immutable History
  const history = await getIncidentHistory(incidentId, adminUser);
  if (history.length >= 7) {
    console.log(`✅ Immutable history audit logs verified successfully. Records count: ${history.length}`);
  } else {
    throw new Error(`❌ Test I Failed: Missing some audit log steps. Total: ${history.length}`);
  }

  // =========================================================================
  // TEST J: Voiding Incident Record
  // =========================================================================
  console.log('\n[Test J] Testing Admin Voiding / Not-Required workflow...');

  const stateVoided = await voidIncident({
    actor: adminUser,
    incidentId,
    expectedVersion: 12,
    reason: 'Raised in error, false alarm',
  });

  if (stateVoided.status === 'voided') {
    console.log('✅ Incident marked void / false-alarm successfully.');
  } else {
    throw new Error('❌ Test J Failed: Voiding transition failed.');
  }

  // =========================================================================
  // TEST K: Stats Reporting Analytics
  // =========================================================================
  console.log('\n[Test K] Verifying report stats summary analytics...');

  const stats = await getIncidentStats(adminUser);
  if (stats.success && stats.totalCount >= 1) {
    console.log(`✅ Reports analytical data retrieved successfully. Total: ${stats.totalCount}`);
  } else {
    throw new Error('❌ Test K Failed: Invalid stats metrics response.');
  }

  console.log('\n========================================================');
  console.log('🎉 ALL PHASE 8 BACKEND INCIDENTS TESTS PASSED SUCCESSFULLY! ');
  console.log('========================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST VERIFICATION FAILURE:');
  console.error(err);
  process.exit(1);
});
