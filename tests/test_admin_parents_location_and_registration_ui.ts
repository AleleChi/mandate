import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { NotificationProvider } from '../src/context/NotificationContext';
import { AddParentModal } from '../src/components/admin/modals/AddParentModal';
import {
  formatParentLocationDisplay,
  getZeroChildRegistrationActionLabel
} from '../src/views/admin/AdminParentsView';

async function main() {
  console.log('=== ADMIN PARENTS LOCATION & ZERO-CHILD REGISTRATION UI TESTS ===');

  // 1. formatParentLocationDisplay: never synthesizes Nigeria or UK
  assert.equal(
    formatParentLocationDisplay({ city: null, stateRegion: null, country: null, homeAddress: null }),
    null,
    'Missing location must return null so UI displays Location not provided'
  );
  assert.equal(
    formatParentLocationDisplay({ city: '', stateRegion: '', country: 'Nigeria', homeAddress: '' }),
    'Nigeria'
  );
  assert.equal(
    formatParentLocationDisplay({ city: '', stateRegion: '', country: 'United Kingdom', homeAddress: '' }),
    'United Kingdom',
    'Country-only UK must NOT prepend synthetic Nigeria'
  );
  assert.equal(
    formatParentLocationDisplay({ city: 'Owerri', stateRegion: 'Imo', country: 'Nigeria' }),
    'Owerri · Imo, Nigeria'
  );
  console.log('  ✓ Location formatting tests passed (no synthetic Nigeria or UK)');

  // 2. getZeroChildRegistrationActionLabel mapping across all 4 account states
  assert.equal(getZeroChildRegistrationActionLabel('no_account'), 'Send registration invitation');
  assert.equal(getZeroChildRegistrationActionLabel('invitation_pending'), 'Resend registration invitation');
  assert.equal(getZeroChildRegistrationActionLabel('email_delivery_failed'), 'Resend registration invitation');
  assert.equal(getZeroChildRegistrationActionLabel('active'), 'Send registration reminder');
  console.log('  ✓ Zero-child registration action label tests passed');

  // 3. AddParentModal SSR does NOT default Country input to United Kingdom
  const modalHtml = renderToString(
    React.createElement(
      NotificationProvider,
      null,
      React.createElement(AddParentModal, {
        isOpen: true,
        onClose: () => {},
        onSuccess: () => {}
      })
    )
  );
  assert.ok(!modalHtml.includes('value="United Kingdom"'), 'AddParentModal must NOT preselect United Kingdom');
  assert.ok(modalHtml.includes('Country (optional)'), 'AddParentModal must expose optional Country field');
  assert.ok(modalHtml.includes('Leave blank if unknown'));
  console.log('  ✓ AddParentModal SSR country default test passed');

  console.log('ALL ADMIN PARENTS FRONTEND LOCATION & ACCESS UI TESTS PASSED!');
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});

