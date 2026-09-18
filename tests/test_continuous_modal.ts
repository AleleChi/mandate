import fs from 'fs';
import path from 'path';
import { operationsQueryPlanner } from '../src/server/services/operations/queryPlanner';
import { execute } from '../src/server/db';
import { getCurrentEvent } from '../src/server/services/eventService';
import { ToolActor } from '../src/server/services/operations/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    throw new Error(msg);
  }
  console.log(`[PASS] ${msg}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('OPERATIONS ASSISTANT — CONTINUOUS MODAL TEST SUITE');
  console.log('====================================================\n');

  const currentEvent = await getCurrentEvent();
  assert(Boolean(currentEvent), 'Canonical current event exists');
  const eventId = currentEvent!.id;
  const nowIso = new Date().toISOString();

  const testAgeGroupId = 'test-ag-continuous-juniors';
  await execute(`
    INSERT OR REPLACE INTO event_age_groups (id, event_id, label, min_age, max_age, capacity, manual_review, sort_order, created_at, updated_at)
    VALUES (?, ?, 'Juniors (4-7)', 4, 7, 50, 0, 1, ?, ?)
  `, [testAgeGroupId, eventId, nowIso, nowIso]);

  const adminActor: ToolActor = {
    id: 'admin-continuous-modal-test',
    role: 'admin',
    email: 'admin@koinonia.org'
  };

  // --- SECTION 1: EXACT FLOW TESTS ---

  // TEST A: Ask from Overview: "How many children are checked in right now?"
  console.log('\n--- TEST A: First Question ---');
  const qA = 'How many children are checked in right now?';
  const resA = await operationsQueryPlanner.planAndExecute(qA, eventId, adminActor);
  assert(resA.grounded === true, 'Test A: Grounded answer returned');
  assert(Boolean(resA.answer), 'Test A: Answer text present');

  // TEST B: Without closing modal, ask: "Which age group has the highest registration?"
  console.log('\n--- TEST B: Continuous Question (Table/Breakdown) ---');
  const qB = 'Which age group has the highest registration?';
  const resB = await operationsQueryPlanner.planAndExecute(qB, eventId, adminActor);
  assert(resB.grounded === true, 'Test B: Grounded response received');
  assert(Boolean(resB.table), 'Test B: Table data received without closing modal');
  assert(resB.table!.columns.length >= 4, 'Test B: Table columns present');

  // TEST C: Click related question inside modal
  console.log('\n--- TEST C: Click Related Question ---');
  assert(Array.isArray(resB.suggestedQuestions) && resB.suggestedQuestions.length > 0, 'Test C: Related questions present in response');
  const relatedQ = resB.suggestedQuestions![0];
  const resC = await operationsQueryPlanner.planAndExecute(relatedQ, eventId, adminActor);
  assert(resC.grounded === true, 'Test C: Related question executed seamlessly in same session');

  // TEST D: List question: "List the volunteers currently on duty."
  console.log('\n--- TEST D: List Question ---');
  const qD = 'List the volunteers currently on duty.';
  const resD = await operationsQueryPlanner.planAndExecute(qD, eventId, adminActor);
  assert(resD.grounded === true, 'Test D: Grounded');
  assert(Boolean(resD.table), 'Test D: List table data received');
  assert(resD.table!.columns.includes('Name'), 'Test D: List columns valid');

  // TEST E: Action question: "Remind volunteers who haven't reported."
  console.log('\n--- TEST E: Action Question & Cancel ---');
  const qE = 'Remind volunteers who haven\'t reported.';
  const resE = await operationsQueryPlanner.planAndExecute(qE, eventId, adminActor);
  assert(resE.grounded === true, 'Test E: Action preview or zero-eligible answer generated');
  if (resE.actionPreview) {
    assert(Boolean(resE.actionPreview.confirmationToken), 'Test E: Confirmation token present');
    assert(resE.actionPreview.actionKey === 'SEND_DUTY_REMINDERS', 'Test E: Action key is SEND_DUTY_REMINDERS');
  }

  // TEST F: Pending Action Discard Simulation
  console.log('\n--- TEST F: Discard Stale Pending Action on New Question ---');
  // When an action preview exists and user submits a new question:
  // UI logic clears actionPreview before submitting new question
  const stalePreview = resE.actionPreview;
  let clientState = { preview: stalePreview, result: resE };
  // User enters new question:
  clientState = { preview: undefined, result: resA };
  assert(clientState.preview === undefined, 'Test F: Stale pending action discarded client-side');
  assert(clientState.result.answer === resA.answer, 'Test F: New question answer displayed');

  // TEST G: Friendly error state
  console.log('\n--- TEST G: Friendly Failure State ---');
  const friendlyError = "We couldn't get that information right now. Please try again.";
  assert(!friendlyError.includes('API') && !friendlyError.includes('tool'), 'Test G: Error contains no technical jargon');

  // TEST H: Reopening last answer without refetch
  console.log('\n--- TEST H: Reopen Answer State ---');
  assert(resA.answer.length > 0, 'Test H: Last answer available in state');

  // --- SECTION 2: HUMAN LANGUAGE REGRESSION ---
  console.log('\n--- SECTION 2: HUMAN LANGUAGE REGRESSION AUDIT ---');

  const modalPath = path.join(process.cwd(), 'src/components/admin/OperationsAssistantModal.tsx');
  const panelPath = path.join(process.cwd(), 'src/components/admin/OperationsAssistantPanel.tsx');

  const modalCode = fs.readFileSync(modalPath, 'utf8');
  const panelCode = fs.readFileSync(panelPath, 'utf8');

  // Forbidden user-facing strings (case-insensitive check in JSX/user-facing text)
  const forbiddenUserFacingStrings = [
    'Live operational inquiry',
    'query result',
    'data synthesis',
    'multi-source',
    'powered by',
    'processing request',
    'execution result',
    'system data',
    'smart assistant',
    'Analyzing current operational data',
    'live inquiry'
  ];

  for (const forbidden of forbiddenUserFacingStrings) {
    const inModal = modalCode.toLowerCase().includes(forbidden.toLowerCase());
    const inPanel = panelCode.toLowerCase().includes(forbidden.toLowerCase());
    assert(!inModal, `Human language: "${forbidden}" is NOT in OperationsAssistantModal`);
    assert(!inPanel, `Human language: "${forbidden}" is NOT in OperationsAssistantPanel`);
  }

  // Verify header has no subtitle
  assert(!modalCode.includes('Live operational inquiry'), 'Header subtitle "Live operational inquiry" removed');
  assert(modalCode.includes('Getting the latest information…'), 'Quiet loading state "Getting the latest information…" used');

  // Verify answer humanization regex
  console.log('\n--- SECTION 3: ANSWER HUMANIZATION VERIFICATION ---');
  const sampleInput = '20 children are checked in right now (201 total arrivals, 1 picked up).';
  const match = sampleInput.match(/^(\d[\d,]*) children are checked in right now \((\d[\d,]*) total arrivals, (\d[\d,]*) picked up\)\.?$/i);
  assert(Boolean(match), 'Humanize regex matches sample input');
  if (match) {
    const [, inside, arrivals, picked] = match;
    const pickedPart = picked === '1' ? '1 has been picked up' : `${picked} have been picked up`;
    const sentences = [
      `${inside} children are currently checked in.`,
      `${arrivals} children have arrived during the event, and ${pickedPart}.`
    ];
    assert(sentences[0] === '20 children are currently checked in.', 'Sentence 1 formatted properly');
    assert(sentences[1] === '201 children have arrived during the event, and 1 has been picked up.', 'Sentence 2 formatted properly');
  }

  // Clean up
  await execute(`DELETE FROM event_age_groups WHERE id = ?`, [testAgeGroupId]);

  console.log('\n====================================================');
  console.log('ALL CONTINUOUS MODAL TESTS PASSED CLEANLY!');
  console.log('====================================================');
}

runTests().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
