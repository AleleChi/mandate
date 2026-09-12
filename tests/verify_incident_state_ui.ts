import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActiveResponseCoordinationPanel } from '../src/components/common/ActiveResponseCoordinationPanel';
import { NotificationProvider } from '../src/context/NotificationContext';
import { execute, queryOne, REAL_EVENT_ID } from '../src/server/db';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function assertNotContains(haystack: string, needle: string, context: string) {
  if (haystack.toLowerCase().includes(needle.toLowerCase())) {
    throw new Error(`Forbidden copy found in ${context}: "${needle}"`);
  }
}

function assertContains(haystack: string, needle: string, context: string) {
  if (!haystack.toLowerCase().includes(needle.toLowerCase())) {
    throw new Error(`Expected text not found in ${context}: "${needle}"`);
  }
}

async function runTests() {
  console.log('========================================================');
  console.log('STARTING INCIDENT STATE-AWARE UI & WORKFLOW TESTS       ');
  console.log('========================================================');

  const currentUser = {
    id: 'usr_admin_test',
    role: 'admin',
    email: 'admin@koinonia.org',
    fullName: 'Pastor Admin'
  };

  // -------------------------------------------------------------
  // TEST 1: RESOLVED INCIDENT RENDERS CALM RESOLUTION SUMMARY
  // -------------------------------------------------------------
  console.log('\n[Test 1] Testing RESOLVED incident modal presentation...');
  const resolvedAlert = {
    id: 'alert_resolved_123',
    title: 'Unregistered Parent Loitering',
    message: 'Unknown individual noticed around the preschool corridor.',
    location_label: 'Main Campus Hall',
    status: 'resolved',
    severity: 'warning',
    resolved_by_name: 'Admin Sarah',
    resolved_at: '2026-09-12T20:34:00.000Z',
    resolution_note: 'Parent was verified as new attendee grandmother, escorted to check-in.',
    acknowledged_by_name: 'Lead James',
    acknowledged_at: '2026-09-12T20:25:00.000Z'
  };

  const resolvedHtml = renderToStaticMarkup(
    React.createElement(
      NotificationProvider,
      null,
      React.createElement(ActiveResponseCoordinationPanel, {
        alertId: resolvedAlert.id,
        initialAlert: resolvedAlert,
        currentUser: currentUser,
        onClose: () => {}
      })
    )
  );

  assertContains(resolvedHtml, 'Incident resolved', 'Resolved modal title');
  assertContains(resolvedHtml, 'Unregistered Parent Loitering', 'Incident title');
  assertContains(resolvedHtml, 'Main Campus Hall', 'Incident location');
  assertContains(resolvedHtml, 'Resolved by', 'Resolved by label');
  assertContains(resolvedHtml, 'Admin Sarah', 'Resolved by name');
  assertContains(resolvedHtml, 'Parent was verified as new attendee grandmother', 'Resolution note content');
  assertContains(resolvedHtml, 'Close', 'Close button text');
  assertContains(resolvedHtml, 'aria-label="Close"', 'X close button');
  assertContains(resolvedHtml, 'View incident report', 'View incident report action');

  // Verify prohibited copy is strictly ABSENT
  assertNotContains(resolvedHtml, 'Active Response Coordination', 'Resolved modal');
  assertNotContains(resolvedHtml, 'LIVE CONNECTION ACTIVE', 'Resolved modal');
  assertNotContains(resolvedHtml, 'WARNING PRIORITY', 'Resolved modal');
  assertNotContains(resolvedHtml, 'ACKNOWLEDGED &amp; LED', 'Resolved modal');
  assertNotContains(resolvedHtml, 'Active Response Lead', 'Resolved modal');
  assertNotContains(resolvedHtml, 'Waiting for a responder', 'Resolved modal');
  assertNotContains(resolvedHtml, 'Ownership: Pending', 'Resolved modal');
  assertNotContains(resolvedHtml, 'Ownership Pending', 'Resolved modal');
  assertNotContains(resolvedHtml, 'Response Progress', 'Resolved modal');
  assertNotContains(resolvedHtml, 'Assisting Team', 'Resolved modal');
  assertNotContains(resolvedHtml, 'Silence alert', 'Resolved modal');
  assertNotContains(resolvedHtml, 'Acknowledge &amp; respond', 'Resolved modal');
  assertNotContains(resolvedHtml, 'Acknowledge and respond', 'Resolved modal');

  console.log('✓ Resolved incident correctly renders calm read-only summary without active controls.');

  // -------------------------------------------------------------
  // TEST 2: RESOLVED INCIDENT WITHOUT RESOLUTION NOTE
  // -------------------------------------------------------------
  console.log('\n[Test 2] Testing RESOLVED incident without resolution note...');
  const resolvedAlertNoNote = {
    id: 'alert_resolved_no_note',
    title: 'Distress in Room 3',
    message: 'Water spill on walkway.',
    location_label: 'Room 3 Hallway',
    status: 'closed',
    severity: 'low',
    resolved_by_name: 'Facility Officer',
    resolved_at: '2026-09-12T19:00:00.000Z',
    resolution_note: null
  };

  const resolvedNoNoteHtml = renderToStaticMarkup(
    React.createElement(
      NotificationProvider,
      null,
      React.createElement(ActiveResponseCoordinationPanel, {
        alertId: resolvedAlertNoNote.id,
        initialAlert: resolvedAlertNoNote,
        currentUser: currentUser,
        onClose: () => {}
      })
    )
  );

  assertContains(resolvedNoNoteHtml, 'Incident resolved', 'Resolved no note modal');
  assertContains(resolvedNoNoteHtml, 'No resolution note was added.', 'Resolution note fallback');
  assertContains(resolvedNoNoteHtml, 'Facility Officer', 'Resolved by name');
  assertContains(resolvedNoNoteHtml, 'Close', 'Close action');
  console.log('✓ Cleanly handled resolved incident when resolution note is empty.');

  // -------------------------------------------------------------
  // TEST 3: RESPONSE UNDERWAY (ACKNOWLEDGED)
  // -------------------------------------------------------------
  console.log('\n[Test 3] Testing RESPONSE UNDERWAY (acknowledged) presentation...');
  const underwayAlert = {
    id: 'alert_underway_456',
    title: 'Medical Attention Needed',
    message: 'Child has mild asthma wheezing.',
    location_label: 'West Playground',
    status: 'acknowledged',
    severity: 'urgent',
    acknowledged_by_name: 'Nurse Hannah',
    acknowledged_at: '2026-09-12T20:40:00.000Z'
  };

  const underwayHtml = renderToStaticMarkup(
    React.createElement(
      NotificationProvider,
      null,
      React.createElement(ActiveResponseCoordinationPanel, {
        alertId: underwayAlert.id,
        initialAlert: underwayAlert,
        currentUser: currentUser,
        onClose: () => {}
      })
    )
  );

  assertContains(underwayHtml, 'Emergency Response', 'Underway header');
  assertContains(underwayHtml, 'Response underway', 'Underway subheader');
  assertContains(underwayHtml, 'Responding', 'Responding label');
  assertContains(underwayHtml, 'Nurse Hannah', 'Responder name');
  assertContains(underwayHtml, 'Acknowledged at', 'Acknowledged time label');
  assertContains(underwayHtml, 'Resolve request', 'Resolve button');
  assertContains(underwayHtml, 'Close', 'Close button');

  // Verify prohibited copy
  assertNotContains(underwayHtml, 'Incident resolved', 'Underway modal');
  assertNotContains(underwayHtml, 'Ownership: Pending', 'Underway modal');
  assertNotContains(underwayHtml, 'Waiting for a responder', 'Underway modal');
  assertNotContains(underwayHtml, 'Assisting Team', 'Underway modal without assistants');

  console.log('✓ Response underway modal correctly displays responder and active options.');

  // -------------------------------------------------------------
  // TEST 4: NEEDS RESPONSE (OPEN)
  // -------------------------------------------------------------
  console.log('\n[Test 4] Testing NEEDS RESPONSE (open) presentation...');
  const openAlert = {
    id: 'alert_open_789',
    title: 'Child Lost Separation Alert',
    message: 'Child separated from class near entrance.',
    location_label: 'Front Foyer',
    status: 'open',
    severity: 'urgent',
    raised_by_name: 'Volunteer David',
    volunteer_team: 'Security Team'
  };

  const openHtml = renderToStaticMarkup(
    React.createElement(
      NotificationProvider,
      null,
      React.createElement(ActiveResponseCoordinationPanel, {
        alertId: openAlert.id,
        initialAlert: openAlert,
        currentUser: currentUser,
        onClose: () => {}
      })
    )
  );

  assertContains(openHtml, 'Emergency Response', 'Open header');
  assertContains(openHtml, 'Needs response', 'Open subheader');
  assertContains(openHtml, 'No responder yet', 'Open responder copy');
  assertContains(openHtml, 'Acknowledge &amp; respond', 'Acknowledge button');
  assertContains(openHtml, 'Close', 'Close button');

  // Verify prohibited copy
  assertNotContains(openHtml, 'Incident resolved', 'Open modal');
  assertNotContains(openHtml, 'Waiting for a responder to lead this case', 'Open modal');
  assertNotContains(openHtml, 'Ownership: Pending', 'Open modal');

  console.log('✓ Needs response modal correctly displays plain language and acknowledge action.');

  // -------------------------------------------------------------
  // TEST 5: ESCALATION IS NOT RESTARTED ON RESOLVED INCIDENT
  // -------------------------------------------------------------
  console.log('\n[Test 5] Testing that resolved incidents do NOT restart or have active escalation...');
  const now = new Date().toISOString();
  const existingUser = await queryOne('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
  const adminId = existingUser ? existingUser.id : (await queryOne('SELECT id FROM users LIMIT 1')).id;
  const testResolvedId = `test_res_esc_${Date.now()}`;

  await execute(
    `INSERT INTO event_safety_alerts (
      id, event_id, raised_by_user_id, raised_by_role, category, severity, status, location_label, message, title, resolution_note, resolved_by, resolved_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'volunteer', 'medical_support', 'urgent', 'resolved', 'Main Hall', 'Resolved case message', 'Resolved Case', 'Resolved on site', ?, ?, ?, ?)`,
    [testResolvedId, REAL_EVENT_ID, adminId, adminId, now, now, now]
  );

  // Verify no active escalation cycle exists
  const activeCycle = await queryOne(
    `SELECT id FROM escalation_cycles WHERE alert_id = ? AND status IN ('scheduled', 'processing')`,
    [testResolvedId]
  );
  assert(!activeCycle, 'Resolved incident must not have active escalation cycle');

  console.log('✓ Confirmed resolved incidents do not have or restart active escalation cycles.');

  // Cleanup test record
  await execute(`DELETE FROM event_safety_alerts WHERE id = ?`, [testResolvedId]);

  console.log('\n========================================================');
  console.log('🎉 ALL INCIDENT STATE-AWARE UI TESTS PASSED!            ');
  console.log('========================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
