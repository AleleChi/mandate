/**
 * Test Suite: Selected Parents WhatsApp Channel Invitations Workflow
 * 
 * Verifies all 12 required test cases (Cases A through L) from Section 31:
 * - Case A: One child (Daniel — Selected) -> 1 of 1 selected, selected_child_names = "Daniel"
 * - Case B: Two selected children (Daniel — Selected, Sarah — Pass Ready) -> 2 of 2 selected, "Daniel and Sarah"
 * - Case C: Mixed states (Daniel — Selected, Sarah — Waiting List, Michael — Under Review) -> 1 of 3 selected, "Daniel"
 * - Case D: Three selected (Daniel, Sarah, Michael) -> "Daniel, Sarah and Michael"
 * - Case E: No qualifying children (Waiting List + Under Review only) -> Parent not in audience
 * - Case F: Deduplication (Three selected children) -> exactly one parent communication row
 * - Case G: Invitation already sent -> child count updates, invitation remains "Sent", no duplicate
 * - Case H: Reversed decision -> only child changes to Not Selected -> parent removed from audience
 * - Case I: Pending template -> no env key -> templateConfigured is false, dispatch rejected safely
 * - Case J: Bulk send -> validates all individually, provides sent/skipped/failed breakdown
 * - Case K: Cross-template deduplication -> pass_ready_v2 sends Channel invitation -> Selected Parents shows "Sent"
 * - Case L: Multi-event isolation -> parent qualifies for Event A but not Event B -> appears only for Event A
 */

import { execute, query, queryOne } from '../src/server/db';
import {
  formatSelectedChildNames,
  getSelectedParentsAudience,
  sendSelectedParentsChannelInvitations,
  recordChannelInvitationSent,
  isChannelTemplateConfigured,
  QUALIFYING_CHILD_STATUSES
} from '../src/server/services/selectedParentsChannelService';
import { buildMergeInfo, validateMergeInfo } from '../src/server/services/whatsapp/personalization';
import { ZOHO_TEMPLATE_REGISTRY, getTemplateDefinition, getRequiredMergeFieldsForIntent } from '../src/server/services/whatsapp/templateRegistry';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    testsFailed++;
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ PASSED: ${message}`);
    testsPassed++;
  }
}

async function runTests() {
  console.log('\n=============================================================');
  console.log('RUNNING SELECTED PARENTS CHANNEL INVITATIONS TEST SUITE');
  console.log('=============================================================\n');

  // --- UNIT TESTS: Child Names Formatting ---
  console.log('--- Unit: formatSelectedChildNames ---');
  assert(formatSelectedChildNames(['Daniel']) === 'Daniel', 'Case A: 1 child names format');
  assert(formatSelectedChildNames(['Daniel', 'Sarah']) === 'Daniel and Sarah', 'Case B: 2 children names format');
  assert(formatSelectedChildNames(['Daniel', 'Sarah', 'Michael']) === 'Daniel, Sarah and Michael', 'Case D: 3 children names format');
  assert(formatSelectedChildNames(['Daniel', 'Sarah', 'Michael', 'Grace']) === 'Daniel, Sarah, Michael and Grace', '4 children names format');
  assert(formatSelectedChildNames(['Pastor Daniel', 'Dr. Sarah']) === 'Daniel and Sarah', 'Honorific stripping in child names');
  assert(formatSelectedChildNames([]) === '', 'Empty children list returns empty string');

  // --- UNIT TESTS: Template Registry & Merge Validation ---
  console.log('\n--- Unit: Template Registry & Personalization ---');
  const templateDef = getTemplateDefinition('koinonia_selected_parent_channel');
  assert(templateDef !== null, 'Template registry has koinonia_selected_parent_channel');
  assert(templateDef?.requiredMergeFields.includes('parent_first_name') === true, 'Requires parent_first_name');
  assert(templateDef?.requiredMergeFields.includes('selected_child_names') === true, 'Requires selected_child_names');

  const reqFields = getRequiredMergeFieldsForIntent('selected_parent_channel');
  assert(reqFields.includes('parent_first_name') && reqFields.includes('selected_child_names'), 'getRequiredMergeFieldsForIntent returns required fields');

  const validMerge = buildMergeInfo({
    parentFirstName: 'Grace',
    selectedChildNames: 'Daniel and Sarah'
  });
  assert(validMerge.parent_first_name === 'Grace', 'buildMergeInfo sets parent_first_name');
  assert(validMerge.selected_child_names === 'Daniel and Sarah', 'buildMergeInfo sets selected_child_names');
  assert(validateMergeInfo(reqFields, validMerge).valid === true, 'Valid merge info passes validation');

  const invalidMerge = buildMergeInfo({
    parentFirstName: 'Grace',
    selectedChildNames: ''
  });
  assert(validateMergeInfo(reqFields, invalidMerge).valid === false, 'Empty selected_child_names fails validation');

  // --- INTEGRATION TESTS WITH DATABASE ---
  console.log('\n--- Integration Database Scenarios ---');
  const now = new Date().toISOString();
  const EVENT_A = `test-event-a-${Date.now()}`;
  const EVENT_B = `test-event-b-${Date.now()}`;

  // Clean up any test records from prior runs
  await execute(`DELETE FROM parent_channel_invitations WHERE parent_id LIKE 'parent-case-%'`);
  await execute(`DELETE FROM child_event_entries WHERE child_id LIKE 'child-case-%'`);
  await execute(`DELETE FROM children WHERE id LIKE 'child-case-%'`);
  await execute(`DELETE FROM parent_profiles WHERE id LIKE 'parent-case-%'`);
  await execute(`DELETE FROM users WHERE id LIKE 'user-parent-case-%' OR email LIKE '%@test.org'`);

  // Seed test events
  await execute(`
    INSERT INTO events (id, title, status, created_at, updated_at)
    VALUES (?, 'Koinonia General Assembly 2026 (Event A)', 'open', ?, ?),
           (?, 'Teens Camp 2026 (Event B)', 'open', ?, ?)
  `, [EVENT_A, now, now, EVENT_B, now, now]);

  // Seed test parents and children helper
  async function createTestParent(id: string, name: string, phone: string, consent: string = 'opted_in') {
    const userId = `user-${id}`;
    await execute(`
      INSERT INTO users (id, email, role, email_verified, created_at, updated_at)
      VALUES (?, ?, 'parent', 1, ?, ?)
    `, [userId, `${id}@test.org`, now, now]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, whatsapp_consent_status, country_iso, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'NG', ?, ?)
    `, [id, userId, name, phone, phone, consent, now, now]);
    return { parentId: id, userId };
  }

  async function createTestChild(id: string, parentId: string, name: string) {
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES (?, ?, ?, 'Male', '2018-01-01', ?, ?)
    `, [id, parentId, name, now, now]);
  }

  async function createEntry(id: string, childId: string, eventId: string, status: string) {
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, childId, eventId, status, now, now]);
  }

  // --- CASE A: One child (Daniel — Selected) ---
  console.log('\n--- Case A: One Child (Daniel — Selected) ---');
  await createTestParent('parent-case-a', 'Grace Okafor', '+2348011110001');
  await createTestChild('child-case-a-1', 'parent-case-a', 'Daniel Okafor');
  await createEntry('entry-case-a-1', 'child-case-a-1', EVENT_A, 'selected');

  const audienceA = await getSelectedParentsAudience(EVENT_A);
  const pA = audienceA.parents.find(p => p.parentId === 'parent-case-a');
  assert(pA !== undefined, 'Case A: Parent appears in audience');
  assert(pA?.totalRegisteredChildren === 1, 'Case A: 1 registered child');
  assert(pA?.selectedChildrenCount === 1, 'Case A: 1 selected child');
  assert(pA?.selectedRatioText === '1 of 1 selected', 'Case A: Ratio text "1 of 1 selected"');
  assert(pA?.selectedChildNames === 'Daniel', 'Case A: selected_child_names is "Daniel"');

  // --- CASE B: Two selected children (Daniel — Selected, Sarah — Pass Ready) ---
  console.log('\n--- Case B: Two Selected Children ---');
  await createTestParent('parent-case-b', 'Chinedu Eze', '+2348011110002');
  await createTestChild('child-case-b-1', 'parent-case-b', 'Daniel Eze');
  await createTestChild('child-case-b-2', 'parent-case-b', 'Sarah Eze');
  await createEntry('entry-case-b-1', 'child-case-b-1', EVENT_A, 'selected');
  await createEntry('entry-case-b-2', 'child-case-b-2', EVENT_A, 'pass_ready');

  const audienceB = await getSelectedParentsAudience(EVENT_A);
  const pB = audienceB.parents.find(p => p.parentId === 'parent-case-b');
  assert(pB !== undefined, 'Case B: Parent appears once in audience');
  assert(pB?.totalRegisteredChildren === 2, 'Case B: 2 registered children');
  assert(pB?.selectedChildrenCount === 2, 'Case B: 2 selected children');
  assert(pB?.selectedRatioText === '2 of 2 selected', 'Case B: Ratio text "2 of 2 selected"');
  assert(pB?.selectedChildNames === 'Daniel and Sarah', 'Case B: selected_child_names is "Daniel and Sarah"');

  // --- CASE C: Mixed states (Daniel — Selected, Sarah — Waiting List, Michael — Under Review) ---
  console.log('\n--- Case C: Mixed States ---');
  await createTestParent('parent-case-c', 'Emeka Nnamdi', '+2348011110003');
  await createTestChild('child-case-c-1', 'parent-case-c', 'Daniel Nnamdi');
  await createTestChild('child-case-c-2', 'parent-case-c', 'Sarah Nnamdi');
  await createTestChild('child-case-c-3', 'parent-case-c', 'Michael Nnamdi');
  await createEntry('entry-case-c-1', 'child-case-c-1', EVENT_A, 'selected');
  await createEntry('entry-case-c-2', 'child-case-c-2', EVENT_A, 'waiting_list');
  await createEntry('entry-case-c-3', 'child-case-c-3', EVENT_A, 'under_review');

  const audienceC = await getSelectedParentsAudience(EVENT_A);
  const pC = audienceC.parents.find(p => p.parentId === 'parent-case-c');
  assert(pC !== undefined, 'Case C: Parent appears in audience');
  assert(pC?.totalRegisteredChildren === 3, 'Case C: 3 registered children');
  assert(pC?.selectedChildrenCount === 1, 'Case C: 1 selected child');
  assert(pC?.selectedRatioText === '1 of 3 selected', 'Case C: Ratio text "1 of 3 selected"');
  assert(pC?.selectedChildNames === 'Daniel', 'Case C: Only Daniel is named (Sarah & Michael excluded)');

  // --- CASE D: Three selected (Daniel, Sarah, Michael) ---
  console.log('\n--- Case D: Three Selected Children ---');
  await createTestParent('parent-case-d', 'Blessing Adeleke', '+2348011110004');
  await createTestChild('child-case-d-1', 'parent-case-d', 'Daniel Adeleke');
  await createTestChild('child-case-d-2', 'parent-case-d', 'Sarah Adeleke');
  await createTestChild('child-case-d-3', 'parent-case-d', 'Michael Adeleke');
  await createEntry('entry-case-d-1', 'child-case-d-1', EVENT_A, 'selected');
  await createEntry('entry-case-d-2', 'child-case-d-2', EVENT_A, 'pass_ready');
  await createEntry('entry-case-d-3', 'child-case-d-3', EVENT_A, 'checked_in');

  const audienceD = await getSelectedParentsAudience(EVENT_A);
  const pD = audienceD.parents.find(p => p.parentId === 'parent-case-d');
  assert(pD?.selectedRatioText === '3 of 3 selected', 'Case D: 3 of 3 selected');
  assert(pD?.selectedChildNames === 'Daniel, Sarah and Michael', 'Case D: "Daniel, Sarah and Michael"');

  // --- CASE E: No qualifying children (Waiting List + Under Review only) ---
  console.log('\n--- Case E: No Qualifying Children ---');
  await createTestParent('parent-case-e', 'Tunde Bakare', '+2348011110005');
  await createTestChild('child-case-e-1', 'parent-case-e', 'Junior Bakare');
  await createTestChild('child-case-e-2', 'parent-case-e', 'Mary Bakare');
  await createEntry('entry-case-e-1', 'child-case-e-1', EVENT_A, 'waiting_list');
  await createEntry('entry-case-e-2', 'child-case-e-2', EVENT_A, 'under_review');

  const audienceE = await getSelectedParentsAudience(EVENT_A);
  const pE = audienceE.parents.find(p => p.parentId === 'parent-case-e');
  assert(pE === undefined, 'Case E: Parent with NO qualifying children is NOT in audience');

  // --- CASE F: Deduplication (Three selected children -> 1 record) ---
  console.log('\n--- Case F: Deduplication ---');
  const dMatches = audienceD.parents.filter(p => p.parentId === 'parent-case-d');
  assert(dMatches.length === 1, 'Case F: Parent with 3 children appears exactly ONCE in audience (no row duplicates)');

  // --- CASE G: Invitation already sent -> child added -> count updates, status remains "sent" ---
  console.log('\n--- Case G: Invitation Already Sent & Status Preservation ---');
  // Mark invitation sent for parent B
  await recordChannelInvitationSent({
    parentId: 'parent-case-b',
    eventId: EVENT_A,
    templateAlias: 'koinonia_selected_parent_channel',
    providerMessageId: 'mock-wa-msg-123',
    selectedChildNames: 'Daniel and Sarah'
  });

  // Verify status is 'sent'
  const audienceG1 = await getSelectedParentsAudience(EVENT_A);
  const pG1 = audienceG1.parents.find(p => p.parentId === 'parent-case-b');
  assert(pG1?.invitationStatus === 'sent', 'Case G: Initial invitation status is "sent"');

  // Now a 3rd child is added and selected
  await createTestChild('child-case-b-3', 'parent-case-b', 'Faith Eze');
  await createEntry('entry-case-b-3', 'child-case-b-3', EVENT_A, 'selected');

  const audienceG2 = await getSelectedParentsAudience(EVENT_A);
  const pG2 = audienceG2.parents.find(p => p.parentId === 'parent-case-b');
  assert(pG2?.totalRegisteredChildren === 3, 'Case G: Registered children count updated to 3');
  // Verify explicit resend updates the same logical record
  process.env.ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL = 'mock-approved-template-key-2026';
  const resendResult = await sendSelectedParentsChannelInvitations({
    eventId: EVENT_A,
    parentIds: ['parent-case-b'],
    adminUserId: 'admin-tester',
    resend: true
  });
  assert(resendResult.success === true, 'Case G: Explicit resend succeeds');
  assert(resendResult.sentCount === 1, 'Case G: Resend sentCount is 1');
  const invRows = await query('SELECT * FROM parent_channel_invitations WHERE parent_id = ? AND event_id = ? AND channel = ?', ['parent-case-b', EVENT_A, 'whatsapp']);
  assert(invRows.length === 1, 'Case G: Same logical invitation record preserved (no duplicates)');
  assert(audienceG2.summary.totalSelectedChildren > 0, 'Summary includes totalSelectedChildren count');

  // --- CASE H: Reversed decision -> only child becomes not_selected -> parent removed from audience ---
  console.log('\n--- Case H: Reversed Decision ---');
  await createTestParent('parent-case-h', 'Kelechi Madu', '+2348011110008');
  await createTestChild('child-case-h-1', 'parent-case-h', 'Chidi Madu');
  await createEntry('entry-case-h-1', 'child-case-h-1', EVENT_A, 'selected');

  let audienceH = await getSelectedParentsAudience(EVENT_A);
  assert(audienceH.parents.some(p => p.parentId === 'parent-case-h'), 'Case H: Parent initially in audience');

  // Reversed: change child entry to not_selected
  await execute(`UPDATE child_event_entries SET status = 'not_selected' WHERE id = 'entry-case-h-1'`);
  audienceH = await getSelectedParentsAudience(EVENT_A);
  assert(!audienceH.parents.some(p => p.parentId === 'parent-case-h'), 'Case H: Parent automatically removed from active eligible audience when selection reversed');

  // --- CASE I: Pending template approval ---
  console.log('\n--- Case I: Pending Template Approval ---');
  const originalKey = process.env.ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL;
  const originalKeyAlt = process.env.ZOHO_WA_TEMPLATE_SELECTED_PARENT_CHANNEL;
  delete process.env.ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL;
  delete process.env.ZOHO_WA_TEMPLATE_SELECTED_PARENT_CHANNEL;

  assert(isChannelTemplateConfigured() === false, 'Case I: isChannelTemplateConfigured() is false when env var missing');

  const audienceI = await getSelectedParentsAudience(EVENT_A);
  assert(audienceI.templateConfigured === false, 'Case I: Audience returns templateConfigured = false');
  assert(audienceI.parents.length > 0, 'Case I: Audience records and child counts remain fully accessible');

  const sendAttemptI = await sendSelectedParentsChannelInvitations({
    eventId: EVENT_A,
    parentIds: ['parent-case-a'],
    adminUserId: 'admin-tester'
  });
  assert(sendAttemptI.success === false, 'Case I: Dispatch refused when template pending');
  assert(sendAttemptI.error === 'WhatsApp template pending approval', 'Case I: Clear error message given');
  assert(sendAttemptI.sentCount === 0, 'Case I: 0 messages sent through provider');

  // Restore mock template key for subsequent tests
  process.env.ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL = 'mock-approved-template-key-2026';
  assert(isChannelTemplateConfigured() === true, 'Template configured after env var set');

  // --- CASE J: Bulk send with individual validation & skip/fail reasons ---
  console.log('\n--- Case J: Bulk Send Individual Validation ---');
  // Create parent with invalid number and parent opted out
  await createTestParent('parent-case-j-invalid', 'Invalid Phone Parent', 'invalid_phone');
  await createTestChild('child-case-j-invalid', 'parent-case-j-invalid', 'Peter Invalid');
  await createEntry('entry-case-j-invalid', 'child-case-j-invalid', EVENT_A, 'selected');

  await createTestParent('parent-case-j-optout', 'Opted Out Parent', '+2348011110099', 'opted_out');
  await createTestChild('child-case-j-optout', 'parent-case-j-optout', 'Philip Optout');
  await createEntry('entry-case-j-optout', 'child-case-j-optout', EVENT_A, 'selected');

  // Bulk send to: Parent A (eligible, not sent), Parent B (already sent), Parent Invalid, Parent Optout
  const bulkResult = await sendSelectedParentsChannelInvitations({
    eventId: EVENT_A,
    parentIds: ['parent-case-a', 'parent-case-b', 'parent-case-j-invalid', 'parent-case-j-optout'],
    adminUserId: 'admin-tester'
  });

  assert(bulkResult.totalRequested === 4, 'Case J: 4 requested');
  assert(bulkResult.details.some(d => d.parentId === 'parent-case-b' && d.status === 'skipped' && d.reason === 'Already sent'), 'Case J: Parent B skipped with "Already sent"');
  assert(bulkResult.details.some(d => d.parentId === 'parent-case-j-optout' && d.status === 'skipped' && d.reason === 'WhatsApp not opted in'), 'Case J: Opted out parent skipped');
  assert(bulkResult.details.some(d => d.parentId === 'parent-case-j-invalid' && d.status === 'failed' && d.reason === 'Invalid WhatsApp number'), 'Case J: Invalid number failed with clear reason');

  // --- CASE K: Cross-template deduplication (pass-ready v2 marks channel invitation sent) ---
  console.log('\n--- Case K: Cross-Template Deduplication ---');
  await createTestParent('parent-case-k', 'Victoria Ade', '+2348011110010');
  await createTestChild('child-case-k-1', 'parent-case-k', 'Victor Ade');
  await createEntry('entry-case-k-1', 'child-case-k-1', EVENT_A, 'pass_ready');

  // Simulate pass-ready v2 delivery hook
  await recordChannelInvitationSent({
    parentId: 'parent-case-k',
    eventId: EVENT_A,
    templateAlias: 'koinonia_pass_ready_v2',
    providerMessageId: 'pass-ready-v2-msg-999',
    selectedChildNames: 'Victor'
  });

  const audienceK = await getSelectedParentsAudience(EVENT_A);
  const pK = audienceK.parents.find(p => p.parentId === 'parent-case-k');
  assert(pK !== undefined, 'Case K: Parent found');
  assert(pK?.invitationStatus === 'sent', 'Case K: Marked "sent" due to pass_ready_v2 cross-workflow deduplication');

  // Verify filtered by "not_sent" excludes parent K
  const notSentAudience = await getSelectedParentsAudience(EVENT_A, { status: 'not_sent' });
  assert(!notSentAudience.parents.some(p => p.parentId === 'parent-case-k'), 'Case K: Excluded from "Invitation not sent" filter');

  // --- CASE L: Multi-event isolation ---
  console.log('\n--- Case L: Multi-Event Isolation ---');
  // Parent qualifies for Event A but NOT Event B
  const audienceEventA = await getSelectedParentsAudience(EVENT_A);
  const audienceEventB = await getSelectedParentsAudience(EVENT_B);

  assert(audienceEventA.parents.some(p => p.parentId === 'parent-case-a'), 'Case L: Parent A appears in Event A audience');
  assert(!audienceEventB.parents.some(p => p.parentId === 'parent-case-a'), 'Case L: Parent A does NOT appear in Event B audience');

  // --- CASE M: Default 25 per page pagination ---
  console.log('\n--- Case M: Default Pagination ---');
  const pagedDefault = await getSelectedParentsAudience(EVENT_A);
  assert(pagedDefault.pagination.page === 1, 'Case M: Page defaults to 1');
  assert(pagedDefault.pagination.pageSize === 25, 'Case M: Page size defaults to 25');
  assert(pagedDefault.pagination.totalRecords >= 1, 'Case M: totalRecords is populated');
  assert(pagedDefault.pagination.totalPages >= 1, 'Case M: totalPages is populated');

  // --- CASE N: 95 Records Across 4 Pages Simulation ---
  console.log('\n--- Case N: 95 Records Across 4 Pages ---');
  const EVENT_N = `test-event-n-${Date.now()}`;
  await execute(`
    INSERT INTO events (id, title, status, created_at, updated_at)
    VALUES (?, 'Large Event 2026', 'open', ?, ?)
  `, [EVENT_N, now, now]);

  // Seed 95 parents with 1 child each
  for (let i = 1; i <= 95; i++) {
    const pId = `parent-case-n-${i}`;
    const cId = `child-case-n-${i}`;
    const eId = `entry-case-n-${i}`;
    await createTestParent(pId, `Parent N ${i}`, `+23480000000${i.toString().padStart(3, '0')}`);
    await createTestChild(cId, pId, `Child N ${i}`);
    await createEntry(eId, cId, EVENT_N, 'selected');
  }

  const page1 = await getSelectedParentsAudience(EVENT_N, { page: 1, pageSize: 25 });
  assert(page1.pagination.totalRecords === 95, 'Case N: Total records is 95');
  assert(page1.pagination.totalPages === 4, 'Case N: Total pages is 4');
  assert(page1.parents.length === 25, 'Case N: Page 1 has 25 rows');

  const page4 = await getSelectedParentsAudience(EVENT_N, { page: 4, pageSize: 25 });
  assert(page4.parents.length === 20, 'Case N: Page 4 has 20 rows');

  // Summary represents COMPLETE audience, not just current page
  assert(page1.summary.totalEligibleParents === 95, 'Case N: Summary represents complete audience of 95 parents');
  assert(page1.summary.totalSelectedChildren === 95, 'Case N: Summary represents complete 95 selected children');

  // --- CASE O: Sends Count & Resend Tracking ---
  console.log('\n--- Case O: Sends Count & Resend Tracking ---');
  const pOId = 'parent-case-o';
  await createTestParent(pOId, 'Olumide Bakare', '+2348033334444');
  await createTestChild('child-case-o-1', pOId, 'Femi Bakare');
  await createEntry('entry-case-o-1', 'child-case-o-1', EVENT_A, 'selected');

  // Check initial state
  const audO0 = await getSelectedParentsAudience(EVENT_A);
  const pO0 = audO0.parents.find(p => p.parentId === pOId);
  assert(pO0?.whatsappSendCount === 0, 'Case O: Initial send count = 0');
  assert(pO0?.lastWhatsappSentAt === null, 'Case O: Initial lastWhatsappSentAt = null');

  // Send 1st time
  const send1 = await sendSelectedParentsChannelInvitations({
    eventId: EVENT_A,
    parentIds: [pOId],
    adminUserId: 'admin-tester'
  });
  assert(send1.sentCount === 1, 'Case O: 1st send succeeds');

  const audO1 = await getSelectedParentsAudience(EVENT_A);
  const pO1 = audO1.parents.find(p => p.parentId === pOId);
  assert(pO1?.whatsappSendCount === 1, 'Case O: Send count = 1 after first send');
  assert(pO1?.invitationStatus === 'sent', 'Case O: Invitation status = sent');
  assert(pO1?.lastWhatsappSentAt !== null, 'Case O: lastWhatsappSentAt is populated');

  // Resend 2nd time with resend=true, skipAlreadySent=false
  const send2 = await sendSelectedParentsChannelInvitations({
    eventId: EVENT_A,
    parentIds: [pOId],
    adminUserId: 'admin-tester',
    resend: true,
    skipAlreadySent: false
  });
  assert(send2.sentCount === 1, 'Case O: 2nd send succeeds with explicit resend');

  // Resend 3rd time
  const send3 = await sendSelectedParentsChannelInvitations({
    eventId: EVENT_A,
    parentIds: [pOId],
    adminUserId: 'admin-tester',
    resend: true,
    skipAlreadySent: false
  });
  assert(send3.sentCount === 1, 'Case O: 3rd send succeeds with explicit resend');

  const audO3 = await getSelectedParentsAudience(EVENT_A);
  const pO3 = audO3.parents.find(p => p.parentId === pOId);
  assert(pO3?.whatsappSendCount === 3, 'Case O: Send count = 3 after resends');

  // Verify only ONE logical invitation record remains in parent_channel_invitations
  const pciCount = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM parent_channel_invitations WHERE parent_id = ? AND event_id = ? AND channel = 'whatsapp'`,
    [pOId, EVENT_A]
  );
  assert(Number(pciCount?.count) === 1, 'Case O: Exactly ONE logical invitation record remains in parent_channel_invitations');

  // --- CASE P: Bulk Send Safety & Skip Already Sent ---
  console.log('\n--- Case P: Bulk Send Safety ---');
  // Attempt bulk send with skipAlreadySent=true (default) for parent O (already sent) and parent N 1 (never sent)
  const bulkSafe = await sendSelectedParentsChannelInvitations({
    eventId: EVENT_A,
    parentIds: [pOId],
    adminUserId: 'admin-tester',
    skipAlreadySent: true
  });
  assert(bulkSafe.skippedCount === 1, 'Case P: Previously sent parent skipped by default in bulk send');
  assert(bulkSafe.details.some(d => d.parentId === pOId && d.reason === 'Already sent'), 'Case P: Reason is "Already sent"');

  // Clean up mock env
  if (originalKey) process.env.ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL = originalKey;
  else delete process.env.ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL;
  if (originalKeyAlt) process.env.ZOHO_WA_TEMPLATE_SELECTED_PARENT_CHANNEL = originalKeyAlt;

  console.log('\n=============================================================');
  console.log(`ALL TESTS COMPLETED: ${testsPassed} passed, ${testsFailed} failed.`);
  console.log('=============================================================\n');
  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
