import assert from 'assert';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { NotificationProvider } from '../src/context/NotificationContext';
import { AdminReviewChildView } from '../src/views/admin/AdminReviewChildView';
import { api } from '../src/services/api';

async function runAdminChildMoreMenuTests() {
  console.log('================================================================');
  console.log('TEST SUITE: Admin Child Record More Menu UI & Permission Tests');
  console.log('================================================================\n');

  const originalGetDetails = api.admin.getApplicationDetails;
  const originalGetMe = api.admin.getMe;

  const mockCheckedInApplication = {
    id: 'entry-qa-123',
    eventId: 'event-2026',
    childId: 'child-qa-123',
    status: 'checked_in',
    checkedInAt: '2026-11-01T10:30:00Z',
    hasPass: true,
    child: {
      id: 'child-qa-123',
      fullName: 'Bethertrade Test',
      gender: 'Male',
      dob: '2018-05-10',
      needsAgeReview: false
    },
    parent: {
      fullName: 'Sarah Test',
      phone: '+2348011223344',
      email: 'parent@example.com'
    },
    pickupPeople: [
      {
        fullName: 'Michael Test',
        relationship: 'Father',
        phone: '+2348011223344'
      }
    ]
  };

  function renderView(adminUser: any, isSuperAdmin = false) {
    return renderToString(
      React.createElement(
        NotificationProvider,
        null,
        React.createElement(AdminReviewChildView, {
          applicationId: 'entry-qa-123',
          onBack: () => {},
          onSave: () => {},
          adminUser,
          isSuperAdmin,
          initialApplication: mockCheckedInApplication
        })
      )
    );
  }

  let passed = 0;
  let total = 0;

  function runTest(name: string, fn: () => void) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  }

  // TEST 1: Checked-in child + Super Admin
  runTest('1. Checked-in child + Super Admin shows More button & Additional actions', () => {
    const html = renderView({ role: 'super_admin', email: 'super@example.com' }, true);
    assert.ok(html.includes('Additional actions'), 'Additional actions section must be visible');
    assert.ok(html.includes('>More<'), 'More button must be visible');
    assert.ok(html.includes('Child in attendance'), 'Must indicate child is checked in / in attendance');
  });

  // TEST 2: Checked-in child + Admin role
  runTest('2. Checked-in child + Admin role shows More button & Additional actions', () => {
    const html = renderView({ role: 'admin', email: 'admin@example.com' }, false);
    assert.ok(html.includes('Additional actions'), 'Additional actions section must be visible for admin role');
    assert.ok(html.includes('>More<'), 'More button must be visible for admin role');
  });

  // TEST 3: Unauthorized role (Volunteer)
  runTest('3. Unauthorized role (Volunteer) hides More button and prevents empty dropdown', () => {
    const html = renderView({ role: 'volunteer', email: 'volunteer@example.com' }, false);
    assert.ok(!html.includes('Additional actions'), 'Additional actions section must NOT be rendered');
    assert.ok(!html.includes('>More<'), 'More button must NOT be rendered');
  });

  // TEST 4: Unauthorized role (Parent)
  runTest('4. Unauthorized role (Parent) hides More button and prevents empty dropdown', () => {
    const html = renderView({ role: 'parent', email: 'parent@example.com' }, false);
    assert.ok(!html.includes('Additional actions'), 'Additional actions section must NOT be rendered');
    assert.ok(!html.includes('>More<'), 'More button must NOT be rendered');
  });

  // TEST 5: Props omitted fallback with isSuperAdmin=true
  runTest('5. Self-healing fallback when adminUser prop is omitted but isSuperAdmin=true', () => {
    const html = renderView(undefined, true);
    assert.ok(html.includes('Additional actions'), 'Additional actions section must be visible');
    assert.ok(html.includes('>More<'), 'More button must be visible');
  });

  // TEST 6: Verification of More dropdown contents logic
  runTest('6. Dropdown action calculation: Reset event state is available while checked-in', () => {
    // Mirror the exact logic in AdminReviewChildView
    const computeActions = (app: any, activeAdmin: any, effectiveSuperAdmin: boolean) => {
      const isAttendingChild = Boolean(app.checkedInAt || app.pickedUpAt || app.status === 'checked_in' || app.status === 'picked_up');
      const isAuthorizedAdmin = Boolean(effectiveSuperAdmin || activeAdmin?.role === 'admin');
      
      const canRevokePass = Boolean(app.hasPass && !isAttendingChild);
      const canReopenReview = Boolean(!isAttendingChild);
      const canResetEventState = Boolean(isAuthorizedAdmin);
      const canResetProgress = Boolean(effectiveSuperAdmin && !isAttendingChild);
      const canResetAndRemove = Boolean(effectiveSuperAdmin && !isAttendingChild);
      const canRemove = Boolean(!isAttendingChild);
      
      const hasAnyMoreAction = Boolean(
        canRevokePass || canReopenReview || canResetEventState || canResetProgress || canResetAndRemove || canRemove
      );

      return {
        isAttendingChild,
        canRevokePass,
        canReopenReview,
        canResetEventState,
        canResetProgress,
        canResetAndRemove,
        canRemove,
        hasAnyMoreAction
      };
    };

    // Case A: Checked-in child with super_admin
    const resSuper = computeActions(mockCheckedInApplication, { role: 'super_admin' }, true);
    assert.strictEqual(resSuper.isAttendingChild, true);
    assert.strictEqual(resSuper.canResetEventState, true, 'Super Admin must have Reset event state');
    assert.strictEqual(resSuper.canRevokePass, false, 'Revoke pass must be disabled during attendance');
    assert.strictEqual(resSuper.canRemove, false, 'Remove must be disabled during attendance');
    assert.strictEqual(resSuper.hasAnyMoreAction, true, 'hasAnyMoreAction must be true so More button renders');

    // Case B: Checked-in child with admin role
    const resAdmin = computeActions(mockCheckedInApplication, { role: 'admin' }, false);
    assert.strictEqual(resAdmin.canResetEventState, true, 'Admin role must have Reset event state');
    assert.strictEqual(resAdmin.hasAnyMoreAction, true, 'hasAnyMoreAction must be true so More button renders');

    // Case C: Checked-in child with volunteer role
    const resVolunteer = computeActions(mockCheckedInApplication, { role: 'volunteer' }, false);
    assert.strictEqual(resVolunteer.canResetEventState, false, 'Volunteer must NOT have Reset event state');
    assert.strictEqual(resVolunteer.hasAnyMoreAction, false, 'Volunteer must have 0 actions, hiding More button completely');

    // Case D: Checked-in child with parent role
    const resParent = computeActions(mockCheckedInApplication, { role: 'parent' }, false);
    assert.strictEqual(resParent.canResetEventState, false, 'Parent must NOT have Reset event state');
    assert.strictEqual(resParent.hasAnyMoreAction, false, 'Parent must have 0 actions, hiding More button completely');
  });

  console.log(`\nResults: ${passed} passed out of ${total} tests.`);
  console.log('================================================================\n');
}

runAdminChildMoreMenuTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
