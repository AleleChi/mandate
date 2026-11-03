/**
 * Regression Test Suite: WhatsApp Attendance Notification Template Resolution
 *
 * Verifies:
 * - Case A: Correct check-in template configured -> resolves ONLY check-in env, requires parent_first_name, child_first_name, checkin_time
 * - Case B: Check-in template missing while registration ack, pass ready, selected parent channel, and default template configured -> returns null, NEVER registration ack
 * - Case C: Pickup template missing -> returns null, no fallback, notification skipped safely without failing pickup
 * - Case D: Intent mismatch detection & safe logging -> logs intent and env var name, never leaks secrets/keys
 * - Strict transactional intent resolution: No transactional intent falls back to ZOHO_WA_DEFAULT_TEMPLATE or other templates
 */

import assert from 'assert';
import {
  resolveZohoTemplateConfig,
  STRICT_TRANSACTIONAL_INTENT_ENVS,
  ZohoWhatsAppProvider
} from '../src/server/services/whatsapp/zohoProvider';
import {
  getRequiredMergeFieldsForIntent,
  ZOHO_TEMPLATE_REGISTRY
} from '../src/server/services/whatsapp/templateRegistry';
import {
  dispatchCheckInWhatsAppNotification,
  dispatchPickupWhatsAppNotification
} from '../src/server/services/whatsapp/attendanceNotifications';

async function runTests() {
  console.log('=== RUNNING WHATSAPP ATTENDANCE TEMPLATE RESOLUTION REGRESSION TESTS ===\n');

  // Save original env vars
  const originalEnv = { ...process.env };

  function cleanEnv() {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('ZOHO_WA_') || key.startsWith('WHATSAPP_')) {
        delete process.env[key];
      }
    }
  }

  try {
    // ------------------------------------------------------------------
    // Case A: Correct check-in template configured
    // ------------------------------------------------------------------
    console.log('--- Case A: Correct check-in template configured ---');
    cleanEnv();

    const mockCheckInKey = 'e4b3c2a1-0000-1111-2222-333344445555';
    process.env.ZOHO_WA_TEMPLATE_KOINONIA_CHILD_CHECKED_IN = `key:${mockCheckInKey}`;

    const resolvedA = resolveZohoTemplateConfig('child_checked_in');
    assert(resolvedA !== null, 'Case A: Resolver should return configured check-in template');
    assert.strictEqual(resolvedA?.templateKey, mockCheckInKey, 'Case A: templateKey matches configured check-in key');
    assert.strictEqual(resolvedA?.templateAlias, undefined, 'Case A: templateAlias should be undefined when key is used');

    // Also verify alias koinonia_child_checked_in
    const resolvedAAlias = resolveZohoTemplateConfig('koinonia_child_checked_in');
    assert(resolvedAAlias !== null, 'Case A: Resolver handles koinonia_child_checked_in alias');
    assert.strictEqual(resolvedAAlias?.templateKey, mockCheckInKey);

    // Verify required merge fields
    const checkinFields = getRequiredMergeFieldsForIntent('child_checked_in');
    assert.deepStrictEqual(
      checkinFields,
      ['parent_first_name', 'child_first_name', 'checkin_time'],
      'Case A: Required merge fields must be parent_first_name, child_first_name, checkin_time'
    );
    const checkinAliasFields = getRequiredMergeFieldsForIntent('koinonia_child_checked_in');
    assert.deepStrictEqual(
      checkinAliasFields,
      ['parent_first_name', 'child_first_name', 'checkin_time'],
      'Case A: Alias required merge fields must match'
    );
    console.log('✔ Case A passed: Check-in template resolves strictly from ZOHO_WA_TEMPLATE_KOINONIA_CHILD_CHECKED_IN with correct merge fields.');

    // ------------------------------------------------------------------
    // Case B: Check-in template missing while other templates are present
    // ------------------------------------------------------------------
    console.log('\n--- Case B: Check-in template missing with other templates configured ---');
    cleanEnv();

    // Configure other templates including registration ack and default template
    const regAckKey = 'f72d56f0-c508-11f1-9f0b-5254001dc20d';
    const passReadyKey = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const channelKey = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
    const defaultTemplateKey = '99999999-8888-7777-6666-555544443333';

    process.env.ZOHO_WA_TEMPLATE_REGISTRATION_ACK = `key:${regAckKey}`;
    process.env.ZOHO_WA_TEMPLATE_KOINONIA_PASS_READY_V2 = `key:${passReadyKey}`;
    process.env.ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL = `key:${channelKey}`;
    process.env.ZOHO_WA_DEFAULT_TEMPLATE = `key:${defaultTemplateKey}`;

    // Specifically assert resolveZohoTemplateConfig returns null for child_checked_in
    const resolvedB = resolveZohoTemplateConfig('child_checked_in');
    assert.strictEqual(
      resolvedB,
      null,
      'Case B: Missing check-in template MUST return null despite other templates being configured'
    );

    // Specifically assert it does NOT resolve registration acknowledgement
    assert.notStrictEqual(
      resolvedB?.templateKey,
      regAckKey,
      'Case B CRITICAL: Must NEVER resolve registration acknowledgement for child_checked_in'
    );
    assert.notStrictEqual(
      resolvedB?.templateKey,
      defaultTemplateKey,
      'Case B CRITICAL: Must NEVER resolve ZOHO_WA_DEFAULT_TEMPLATE for child_checked_in'
    );

    // Test dispatchCheckInWhatsAppNotification safe skip
    process.env.WHATSAPP_PROVIDER = 'zoho';
    const checkInResult = await dispatchCheckInWhatsAppNotification({
      childEventEntryId: 'non-existent-or-missing-tpl-entry',
      eventId: 'test-event'
    });
    // Even if entry is not in db or template is not configured, it returns sent: false safely
    assert.strictEqual(checkInResult.sent, false, 'Case B: Check-in notification should not be sent');
    console.log('✔ Case B passed: Missing check-in template returns null; never falls back to registration ack or default template.');

    // ------------------------------------------------------------------
    // Case C: Pickup template missing
    // ------------------------------------------------------------------
    console.log('\n--- Case C: Pickup template missing ---');
    cleanEnv();

    // Other templates configured
    process.env.ZOHO_WA_TEMPLATE_REGISTRATION_ACK = `key:${regAckKey}`;
    process.env.ZOHO_WA_TEMPLATE_KOINONIA_PASS_READY_V2 = `key:${passReadyKey}`;
    process.env.ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL = `key:${channelKey}`;
    process.env.ZOHO_WA_DEFAULT_TEMPLATE = `key:${defaultTemplateKey}`;

    const resolvedC = resolveZohoTemplateConfig('child_picked_up');
    assert.strictEqual(
      resolvedC,
      null,
      'Case C: Missing pickup template MUST return null despite other templates being configured'
    );

    const resolvedCAlias = resolveZohoTemplateConfig('koinonia_child_picked_up');
    assert.strictEqual(
      resolvedCAlias,
      null,
      'Case C: Alias koinonia_child_picked_up MUST also return null when missing'
    );

    // Verify required merge fields for pickup (does NOT require pickup_person_name)
    const pickupFields = getRequiredMergeFieldsForIntent('child_picked_up');
    assert.deepStrictEqual(
      pickupFields,
      ['parent_first_name', 'child_first_name', 'pickup_time'],
      'Case C: Pickup template required fields must be parent_first_name, child_first_name, pickup_time (NO pickup_person_name required)'
    );
    assert(
      !pickupFields.includes('pickup_person_name'),
      'Case C: pickup_person_name must NOT be required in this template definition'
    );

    // Test dispatchPickupWhatsAppNotification safe skip
    process.env.WHATSAPP_PROVIDER = 'zoho';
    const pickupResult = await dispatchPickupWhatsAppNotification({
      childEventEntryId: 'non-existent-or-missing-tpl-entry',
      eventId: 'test-event'
    });
    assert.strictEqual(pickupResult.sent, false, 'Case C: Pickup notification should not be sent');
    console.log('✔ Case C passed: Missing pickup template returns null; no fallback template; pickup operation safe.');

    // ------------------------------------------------------------------
    // Case D: Validation & logging on intent/template mismatch
    // ------------------------------------------------------------------
    console.log('\n--- Case D: Intent / template mismatch detection and safe logging ---');
    cleanEnv();

    const loggedMessages: string[] = [];
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;

    const util = await import('util');
    console.log = (...args: any[]) => {
      loggedMessages.push(util.format(...args));
      originalConsoleLog(...args);
    };
    console.warn = (...args: any[]) => {
      loggedMessages.push(util.format(...args));
      originalConsoleWarn(...args);
    };

    try {
      // Intentionally configure check-in env to registration template value
      const secretKey = 'f72d56f0-c508-11f1-9f0b-5254001dc20d';
      process.env.ZOHO_WA_TEMPLATE_KOINONIA_CHILD_CHECKED_IN = `alias:koinonia_registration_ack`;

      const resolvedD = resolveZohoTemplateConfig('child_checked_in');

      // Assert log contains intent and ENV VAR NAME, but NEVER leaks secret
      const auditLog = loggedMessages.find(m => m.includes('[WhatsApp] intent=child_checked_in'));
      assert(auditLog !== undefined, 'Case D: Must log resolved intent and env variable name');
      assert(auditLog.includes('env=ZOHO_WA_TEMPLATE_KOINONIA_CHILD_CHECKED_IN'), 'Case D: Log must include env variable name');

      // Assert warning was emitted for mismatch
      const warningLog = loggedMessages.find(m => m.includes('WARNING: Configured template value for intent "child_checked_in"'));
      assert(warningLog !== undefined, 'Case D: Must emit warning for registration template assigned to check-in');

      // Test with raw UUID: ensure UUID secret value is not printed in [WhatsApp] intent=... line
      loggedMessages.length = 0;
      process.env.ZOHO_WA_TEMPLATE_KOINONIA_CHILD_CHECKED_IN = `key:${secretKey}`;
      resolveZohoTemplateConfig('child_checked_in');

      const auditLog2 = loggedMessages.find(m => m.includes('[WhatsApp] intent=child_checked_in'));
      assert(auditLog2 !== undefined, 'Case D: Must log audit line');
      assert(!auditLog2.includes(secretKey), 'Case D CRITICAL: Log line must NEVER expose the template key secret');
    } finally {
      console.log = originalConsoleLog;
      console.warn = originalConsoleWarn;
    }
    console.log('✔ Case D passed: Audit logging prints intent and ENV variable name, detects mismatches, and never leaks secret key.');

    // ------------------------------------------------------------------
    // Strict Transactional Resolution for All Recognized Transactional Intents
    // ------------------------------------------------------------------
    console.log('\n--- Strict Transactional Resolution Across All Intents ---');
    cleanEnv();

    // Set ONLY default template
    process.env.ZOHO_WA_DEFAULT_TEMPLATE = 'alias:generic_default_tpl';

    const transactionalIntents = [
      'child_checked_in',
      'koinonia_child_checked_in',
      'child_picked_up',
      'koinonia_child_picked_up',
      'child_approved',
      'koinonia_child_approved',
      'child_under_review',
      'under_review',
      'koinonia_child_under_review',
      'child_not_selected',
      'not_selected',
      'koinonia_child_not_selected',
      'child_waitlisted',
      'waiting_list',
      'koinonia_child_waitlisted',
      'pass_ready',
      'pass_ready_v2',
      'koinonia_pass_ready',
      'koinonia_pass_ready_v2',
      'selected_parent_channel',
      'selected_parents_channel',
      'koinonia_selected_parent_channel',
      'registration_ack',
      'registration_acknowledgement'
    ];

    for (const intent of transactionalIntents) {
      const result = resolveZohoTemplateConfig(intent);
      assert.strictEqual(
        result,
        null,
        `Transactional intent "${intent}" MUST return null when its specific env var is missing (must NEVER use ZOHO_WA_DEFAULT_TEMPLATE)`
      );
    }
    console.log('✔ All 24 transactional intents strictly return null when their specific env vars are missing.');

    console.log('\n=== ALL REGRESSION TESTS PASSED SUCCESSFULLY ===');
  } finally {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('ZOHO_WA_') || key.startsWith('WHATSAPP_')) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
});
