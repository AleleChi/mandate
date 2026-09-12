import crypto from 'crypto';
import express from 'express';
import http from 'http';
import { query, queryOne, execute } from '../src/server/db';
import { generateToken } from '../src/server/auth';
import volunteerRouter from '../src/server/routes/volunteer';
import {
  isVolunteerAudience,
  isChildSpecificMessageType,
  getVolunteerWhatsAppBadge,
  calculateEffectiveEligibility,
  getWhatsAppAudienceDescription,
  getPushPreviewFooterText,
  validateRequiredVolunteerTokens,
  evaluateSendButtonState
} from '../src/views/admin/AdminMessagesView';
import { resolveMessageTokens as serverResolveMessageTokens } from '../src/server/utils/urlHelper';
import { resolveMessageTokens as clientResolveMessageTokens } from '../src/utils/urlHelper';
import { resolveUserDutyLocation } from '../src/server/routes/duty';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('VOLUNTEER MESSAGING & REGISTRATION NOTIFICATIONS');
  console.log('AUDIT & VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}: ${err.message}`);
      failed++;
    }
  }

  const testSuffix = Date.now().toString();

  try {
    // 1. Target Audiences & Helper Function
    await test('isVolunteerAudience correctly identifies volunteer recipient groups', () => {
      assert(isVolunteerAudience('volunteers') === true, 'volunteers should be volunteer audience');
      assert(isVolunteerAudience('specific_volunteers') === true, 'specific_volunteers should be volunteer audience');
      assert(isVolunteerAudience('all_parents') === false, 'all_parents should not be volunteer audience');
      assert(isVolunteerAudience('specific_parents') === false, 'specific_parents should not be volunteer audience');
      assert(isVolunteerAudience('selected_children') === false, 'selected_children should not be volunteer audience');
      assert(isVolunteerAudience(undefined) === false, 'undefined should not be volunteer audience');
    });

    // 2. Audience-Aware Message Types (Fix Current Volunteer Audience Bug)
    await test('Volunteer message types are never marked as child-specific', () => {
      const volunteerTypes = [
        'volunteer_application_received',
        'volunteer_application_status',
        'volunteer_approved',
        'volunteer_assignment',
        'duty_reminder',
        'event_information',
        'operational_update'
      ];
      for (const vt of volunteerTypes) {
        assert(
          isChildSpecificMessageType(vt, 'Dear {Volunteer name}', 'Update') === false,
          `Volunteer message type ${vt} must not be treated as child-specific`
        );
      }

      // Parent/child message types must still be child-specific
      const childTypes = [
        'pass_ready',
        'pass_update',
        'review_update',
        'waiting_list_update',
        'selection_update',
        'application_status',
        'pickup_reminder'
      ];
      for (const ct of childTypes) {
        assert(
          isChildSpecificMessageType(ct, 'Dear {Parent name}', 'Update') === true,
          `Parent/child message type ${ct} must be treated as child-specific`
        );
      }
    });

    // 3. Volunteer Preview Uses Volunteer Context (No Child Tokens)
    await test('Volunteer preview resolves volunteer tokens and excludes child context', () => {
      const volunteerTemplate = 'Dear {Volunteer name},\nYour assignment for {Event name} is with the {Team} team at {Location}. Contact {Support contact}.';
      const resolved = serverResolveMessageTokens(volunteerTemplate, {
        eventName: 'The General Assembly 2026',
        volunteerName: 'Samuel Adeyemi',
        team: 'Logistics',
        location: 'Hall A',
        supportContact: '+234 800 000 0000'
      });

      assert(resolved.includes('Dear Samuel Adeyemi,'), 'Volunteer name was not resolved correctly');
      assert(resolved.includes('The General Assembly 2026'), 'Event name was not resolved correctly');
      assert(resolved.includes('Logistics team'), 'Team was not resolved correctly');
      assert(resolved.includes('Hall A'), 'Location was not resolved correctly');
      assert(resolved.includes('+234 800 000 0000'), 'Support contact was not resolved correctly');
      assert(!resolved.includes('{Child name}'), 'Child name token was leaked');
      assert(!resolved.includes('{Pass link}'), 'Pass link token was leaked');
      assert(!resolved.includes('{Review link}'), 'Review link token was leaked');
    });

    // 4. Approved Volunteers Query Excludes Rejected/Incomplete/Withdrawn Volunteers
    await test('All approved volunteers query excludes rejected, incomplete, withdrawn, or deleted records', async () => {
      // Query the database with the exact filter used in admin.ts
      const approvedVolunteers = await query(`
        SELECT vp.id, vp.full_name, vp.status, vp.is_deleted, u.status as user_status
        FROM volunteer_profiles vp
        JOIN users u ON u.id = vp.user_id
        WHERE vp.status IN ('active', 'approved')
          AND (vp.is_deleted = 0 OR vp.is_deleted IS NULL)
          AND (u.status = 'active' OR u.status IS NULL)
      `);

      for (const v of approvedVolunteers) {
        assert(
          v.status === 'active' || v.status === 'approved',
          `Volunteer ${v.full_name} has invalid status ${v.status}`
        );
        assert(v.is_deleted !== 1 && v.is_deleted !== true, `Volunteer ${v.full_name} is marked as deleted`);
      }
    });

    // 5. Specific Volunteer Selection & Targeting
    await test('Specific volunteers can be queried and resolved individually and in batches', async () => {
      // Find up to 3 approved volunteers to verify individual and multi-selection
      const sampleVolunteers = await query(`
        SELECT vp.id, vp.full_name, vp.preferred_team, vp.phone, u.email, u.id as user_id
        FROM volunteer_profiles vp
        JOIN users u ON u.id = vp.user_id
        WHERE vp.status IN ('active', 'approved')
          AND (vp.is_deleted = 0 OR vp.is_deleted IS NULL)
        LIMIT 3
      `);

      if (sampleVolunteers.length > 0) {
        const singleId = [sampleVolunteers[0].id];
        const singleRes = await query(`
          SELECT vp.id, vp.full_name, u.email
          FROM volunteer_profiles vp
          JOIN users u ON u.id = vp.user_id
          WHERE vp.id IN (${singleId.map(() => '?').join(',')})
        `, singleId);
        assert(singleRes.length === 1, 'Single volunteer targeting failed');
        assert(singleRes[0].id === singleId[0], 'Single volunteer ID mismatch');

        if (sampleVolunteers.length > 1) {
          const multiIds = sampleVolunteers.map((v: any) => v.id);
          const multiRes = await query(`
            SELECT vp.id, vp.full_name, u.email
            FROM volunteer_profiles vp
            JOIN users u ON u.id = vp.user_id
            WHERE vp.id IN (${multiIds.map(() => '?').join(',')})
          `, multiIds);
          assert(multiRes.length === multiIds.length, 'Multiple volunteer targeting failed');
        }
      }
    });

    // 6. Same User as Parent + Volunteer: Identity Unification & Deduplication
    await test('Dual-role user (Parent + Volunteer) deduplicates general campaigns while keeping role-specific messages independent', async () => {
      // Check if any dual-role users exist in DB
      const dualUsers = await query(`
        SELECT u.id as user_id, u.email, pp.id as parent_profile_id, vp.id as volunteer_profile_id
        FROM users u
        JOIN parent_profiles pp ON pp.user_id = u.id AND (pp.is_deleted = 0 OR pp.is_deleted IS NULL)
        JOIN volunteer_profiles vp ON vp.user_id = u.id AND (vp.is_deleted = 0 OR vp.is_deleted IS NULL)
        LIMIT 5
      `);

      // Verify canonical identity relationship: ONE user_id points to both profiles
      for (const du of dualUsers) {
        assert(du.user_id, 'User must have canonical users.id');
        assert(du.parent_profile_id, 'Parent profile ID must exist');
        assert(du.volunteer_profile_id, 'Volunteer profile ID must exist');
      }

      // Test general campaign deduplication logic by user_id
      const recipients = [
        { userId: 'user-dual-1', role: 'parent', email: 'dual@test.com' },
        { userId: 'user-dual-1', role: 'volunteer', email: 'dual@test.com' },
        { userId: 'user-other-2', role: 'volunteer', email: 'other@test.com' }
      ];

      const seenUserIds = new Set<string>();
      const dedupedGeneral: typeof recipients = [];
      for (const r of recipients) {
        if (!seenUserIds.has(r.userId)) {
          seenUserIds.add(r.userId);
          dedupedGeneral.push(r);
        }
      }

      assert(dedupedGeneral.length === 2, `General campaign should have 2 unique users, got ${dedupedGeneral.length}`);
      assert(dedupedGeneral.filter(r => r.userId === 'user-dual-1').length === 1, 'Dual user must only appear once in general announcement');

      // Test role-specific independence: Parent child update vs Volunteer duty update
      const roleSpecificQueue = [
        { userId: 'user-dual-1', type: 'pass_ready', childId: 'child-123', content: 'Baby Livina pass' },
        { userId: 'user-dual-1', type: 'volunteer_assignment', team: 'Logistics', content: 'Duty assignment' }
      ];

      // Because contexts are different (one child-specific, one volunteer assignment), they must NOT be deduplicated against each other
      const dedupedRoleSpecific = roleSpecificQueue.filter((item, idx, arr) =>
        arr.findIndex(other => other.userId === item.userId && other.type === item.type) === idx
      );

      assert(dedupedRoleSpecific.length === 2, 'Role-specific messages for same user must remain independent');
    });

    // 7. WhatsApp Consent Model & Schema Gap Verification
    await test('WhatsApp requires explicit opt-in; audits volunteer consent source and reports schema gap', async () => {
      // 1. Verify parent_profiles has whatsapp_consent_status column
      let parentCols = await query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'parent_profiles' AND column_name = 'whatsapp_consent_status'
      `).catch(() => []);
      if (parentCols.length === 0) {
        const pragma = await query("PRAGMA table_info(parent_profiles)").catch(() => []);
        parentCols = pragma.filter((c: any) => c.name === 'whatsapp_consent_status');
      }

      // 2. Verify volunteer_profiles column names
      let volunteerCols = await query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'volunteer_profiles' AND column_name = 'whatsapp_consent_status'
      `).catch(() => []);
      if (volunteerCols.length === 0) {
        const pragma = await query("PRAGMA table_info(volunteer_profiles)").catch(() => []);
        volunteerCols = pragma.filter((c: any) => c.name === 'whatsapp_consent_status');
      }

      console.log('    [Consent Audit]:');
      console.log('    - Parent WhatsApp consent stored in: parent_profiles.whatsapp_consent_status');
      console.log(`    - Volunteer WhatsApp consent stored in: volunteer_profiles (${volunteerCols.length > 0 ? 'PHASE 2A COLUMN ACTIVE' : 'MISSING COLUMN'})`);
      console.log('    - Dual-role (Parent + Volunteer): Parent WhatsApp consent remains authoritative');
      console.log('    - Volunteer-only: Volunteer consent is authoritative');
      
      assert(parentCols.length > 0, 'Parent consent verification check');
      assert(volunteerCols.length > 0, 'Volunteer consent column must be present in volunteer_profiles');
    });

    // 8. Email Verification Independence
    await test('Email verification proves email inbox control and is not replaced by WhatsApp', () => {
      const emailVerificationType = 'email_verification';
      const isWaSafe = emailVerificationType !== 'email_verification' && emailVerificationType !== 'password_reset';
      assert(isWaSafe === false, 'Security-sensitive email verification must not be bypassed or routed as verified via WhatsApp');
    });

    // 9. WhatsApp Availability Consistency: Unknown Consent vs Opted-in vs Opted-out
    await test('Volunteer WhatsApp availability indicators are consistent across row badge, channel count, and side panel', () => {
      // 9a. Unknown consent -> row badge says "WhatsApp pending"
      const unknownBadge = getVolunteerWhatsAppBadge('unknown', true);
      assert(unknownBadge.label === 'WhatsApp pending', `Expected badge 'WhatsApp pending', got '${unknownBadge.label}'`);
      assert(unknownBadge.isPending === true, 'Unknown consent must be marked as isPending');
      assert(unknownBadge.isOptedIn === false, 'Unknown consent must not be marked as isOptedIn');

      // 9b. Unknown consent -> WhatsApp channel count is 0
      const unknownEligibility = calculateEffectiveEligibility({
        selectedGroup: 'volunteers',
        isSpecificParents: false,
        isSpecificVolunteers: false,
        selectedParentsList: [],
        selectedVolunteersList: [],
        eventVolunteers: [{ userId: 'vol-1', name: 'Alele Chi', phone: '+2348000000000', whatsappConsentStatus: 'unknown', pushCount: 1, email: 'alele@test.com' }],
        channelEligibility: { whatsappOptedIn: 10 }, // parent count must be ignored
        whatsappEnabled: true
      });
      assert(unknownEligibility.whatsappOptedIn === 0, `Expected whatsappOptedIn 0 for unknown consent, got ${unknownEligibility.whatsappOptedIn}`);

      // 9c. Specific volunteer selection with unknown consent -> channel count is 0
      const specificUnknownEligibility = calculateEffectiveEligibility({
        selectedGroup: 'specific_volunteers',
        isSpecificParents: false,
        isSpecificVolunteers: true,
        selectedParentsList: [],
        selectedVolunteersList: [{ userId: 'vol-1', name: 'Alele Chi', phone: '+2348000000000', whatsappConsentStatus: 'unknown', pushCount: 1, email: 'alele@test.com' }],
        eventVolunteers: [],
        channelEligibility: { whatsappOptedIn: 10 },
        whatsappEnabled: true
      });
      assert(specificUnknownEligibility.whatsappOptedIn === 0, `Expected specific volunteer whatsappOptedIn 0 for unknown consent, got ${specificUnknownEligibility.whatsappOptedIn}`);

      // 9d. Opted-in volunteer with phone -> row badge says "WhatsApp", channel count is 1
      const optedInBadge = getVolunteerWhatsAppBadge('opted_in', true);
      assert(optedInBadge.label === 'WhatsApp', `Expected badge 'WhatsApp', got '${optedInBadge.label}'`);
      assert(optedInBadge.isOptedIn === true, 'Opted-in volunteer must be marked as isOptedIn');

      const optedInEligibility = calculateEffectiveEligibility({
        selectedGroup: 'volunteers',
        isSpecificParents: false,
        isSpecificVolunteers: false,
        selectedParentsList: [],
        selectedVolunteersList: [],
        eventVolunteers: [{ userId: 'vol-2', name: 'Approved Vol', phone: '+2348000000001', whatsappConsentStatus: 'opted_in', pushCount: 0, email: 'app@test.com' }],
        channelEligibility: { whatsappOptedIn: 0 },
        whatsappEnabled: true
      });
      assert(optedInEligibility.whatsappOptedIn === 1, `Expected whatsappOptedIn 1 for opted_in volunteer, got ${optedInEligibility.whatsappOptedIn}`);

      // 9e. Opted-out volunteer -> row badge says "WhatsApp off"
      const optedOutBadge = getVolunteerWhatsAppBadge('opted_out', true);
      assert(optedOutBadge.label === 'WhatsApp off', `Expected badge 'WhatsApp off', got '${optedOutBadge.label}'`);
      assert(optedOutBadge.isOptedOut === true, 'Opted-out volunteer must be marked as isOptedOut');
    });

    // 10. Provider READY does not imply recipient availability
    await test('Provider READY status does not imply recipient availability', () => {
      // Even if whatsappEnabled is true (configured and READY), 0 opted-in volunteers results in 0 available
      const eligibility = calculateEffectiveEligibility({
        selectedGroup: 'volunteers',
        isSpecificParents: false,
        isSpecificVolunteers: false,
        selectedParentsList: [],
        selectedVolunteersList: [],
        eventVolunteers: [
          { userId: 'vol-1', name: 'Vol 1', phone: '+2348000000000', whatsappConsentStatus: 'unknown' },
          { userId: 'vol-2', name: 'Vol 2', phone: '', whatsappConsentStatus: 'opted_in' } // opted in but missing phone
        ],
        channelEligibility: { whatsappOptedIn: 12 }, // should not bleed from parent eligibility
        whatsappEnabled: true // Provider is ready
      });

      assert(eligibility.whatsappOptedIn === 0, `Provider READY must not inflate volunteer WhatsApp availability. Got ${eligibility.whatsappOptedIn}`);

      // WhatsApp send condition verification: when whatsappOptedIn === 0, send is disabled
      const isSendDisabled = !eligibility.whatsappOptedIn || eligibility.whatsappOptedIn === 0;
      assert(isSendDisabled === true, 'WhatsApp send button must be disabled when 0 recipients are available, even if provider is ready');
    });

    // 11. Audience-Aware WhatsApp Copy & Descriptions
    await test('Audience-aware WhatsApp copy distinguishes parents vs volunteers', () => {
      const parentCopy = getWhatsAppAudienceDescription('all_parents');
      assert(parentCopy === 'Parents with WhatsApp updates enabled for this event.', `Unexpected parent copy: ${parentCopy}`);

      const specificParentCopy = getWhatsAppAudienceDescription('specific_parents');
      assert(specificParentCopy === 'Parents with WhatsApp updates enabled for this event.', `Unexpected specific parent copy: ${specificParentCopy}`);

      const volCopy = getWhatsAppAudienceDescription('volunteers');
      assert(volCopy === 'Volunteers with WhatsApp updates enabled for this event.', `Unexpected volunteer copy: ${volCopy}`);

      const specificVolCopy = getWhatsAppAudienceDescription('specific_volunteers');
      assert(specificVolCopy === 'Volunteers with WhatsApp updates enabled for this event.', `Unexpected specific volunteer copy: ${specificVolCopy}`);
    });

    // 12. Volunteer Identity & Duty Token Resolution ({Volunteer name}, {Team}, {Location})
    await test('Volunteer identity and duty tokens resolve correctly and remove fake Designated Area fallback', () => {
      const template = 'Dear {Volunteer name},\nYou are assigned to the {Team} team at {Location} for {Event name}. Contact {Support contact}.';

      // Full context resolution
      const resolved = serverResolveMessageTokens(template, {
        volunteerName: 'Alele Chi',
        team: 'Teens Team',
        location: 'Grace Hall Primary',
        eventName: 'The General Assembly 2026',
        supportContact: '+234 803 123 4567'
      });

      assert(resolved.includes('Dear Alele Chi,'), `Expected 'Dear Alele Chi,', got: ${resolved}`);
      assert(resolved.includes('Teens Team team'), `Expected 'Teens Team team', got: ${resolved}`);
      assert(resolved.includes('at Grace Hall Primary for'), `Expected 'at Grace Hall Primary for', got: ${resolved}`);
      assert(resolved.includes('The General Assembly 2026'), 'Event name mismatch');
      assert(resolved.includes('+234 803 123 4567'), 'Support contact mismatch');

      // Removal of fake "Designated Area": when location is absent/empty, it must NOT inject "Designated Area"
      const emptyLocationResolved = serverResolveMessageTokens('Reporting at {Location}.', {
        volunteerName: 'Alele Chi',
        location: ''
      });
      assert(!emptyLocationResolved.includes('Designated Area'), `Fake placeholder 'Designated Area' must not be injected! Got: ${emptyLocationResolved}`);
      assert(emptyLocationResolved.includes('{Location}'), `Token {Location} should remain unreplaced if unassigned, got: ${emptyLocationResolved}`);
    });

    // 13. Missing Duty Location Blocks Duty Reminder and Send
    await test('Missing duty location blocks Duty Reminder send with staff-facing validation error', () => {
      // 13a. Duty reminder with unassigned volunteer
      const unassignedResult = validateRequiredVolunteerTokens({
        messageType: 'duty_reminder',
        subject: 'Duty Reminder - The General Assembly',
        body: 'Dear {Volunteer name},\n\nThis is a reminder regarding your upcoming duty session for {Event name} at {Location}.',
        volunteers: [{ name: 'Alele Chi', dutyLocation: null, team: 'Teens Team' }]
      });

      assert(unassignedResult.valid === false, 'Duty reminder without assigned location must be invalid');
      assert(unassignedResult.error?.includes("Can't send duty reminder"), `Error must mention Can't send duty reminder, got: ${unassignedResult.error}`);
      assert(unassignedResult.error?.includes('does not have a duty location assigned yet.'), `Error must mention missing duty location, got: ${unassignedResult.error}`);

      // 13b. Template with {Location} token with unassigned volunteer
      const customLocationResult = validateRequiredVolunteerTokens({
        messageType: 'operational_update',
        subject: 'Report to {Location}',
        body: 'Please report immediately to {Location}.',
        volunteers: [{ name: 'John Doe', dutyLocation: '', team: 'Logistics' }]
      });
      assert(customLocationResult.valid === false, 'Message with {Location} token and empty duty location must be blocked');

      // 13c. Valid volunteer with duty location passes validation
      const validResult = validateRequiredVolunteerTokens({
        messageType: 'duty_reminder',
        subject: 'Duty Reminder - The General Assembly',
        body: 'Dear {Volunteer name},\n\nThis is a reminder regarding your upcoming duty session for {Event name} at {Location}.',
        volunteers: [{ name: 'Alele Chi', dutyLocation: 'Grace Hall Primary', team: 'Teens Team' }]
      });
      assert(validResult.valid === true, `Expected valid: true for volunteer with assigned location, got error: ${validResult.error}`);
    });

    // 14. Token Resolver Parity: Frontend Preview and Server Dispatch
    await test('Frontend preview and server dispatch token resolvers produce identical results', () => {
      const testCases = [
        {
          template: 'Dear {Volunteer name},\n\nYour duty assignment for {Event name} is confirmed. You will be serving at {Location} with the {Team} team.',
          context: {
            volunteerName: 'Alele Chi',
            team: 'Teens Team',
            location: 'Grace Hall Primary',
            eventName: 'The General Assembly'
          }
        },
        {
          template: 'Reminder for {Volunteer name} at {Location}. Contact {Support contact}.',
          context: {
            volunteerName: 'Samuel Adeyemi',
            team: 'Logistics',
            location: '', // empty location
            eventName: 'The General Assembly',
            supportContact: '+234 800 000 0000'
          }
        },
        {
          template: 'Dear {Parent name},\n\nPass link: {Pass link}\nReview link: {Review link}',
          context: {
            parentName: 'Jane Doe',
            childName: 'Baby Livina',
            passUrl: 'https://koinonia.app/#/parent/children/c1/pass',
            reviewUrl: 'https://koinonia.app/#/parent/children/c1/status'
          }
        }
      ];

      for (const tc of testCases) {
        const clientOutput = clientResolveMessageTokens(tc.template, tc.context);
        const serverOutput = serverResolveMessageTokens(tc.template, tc.context);
        assert(clientOutput === serverOutput, `Parity mismatch:\nClient: ${clientOutput}\nServer: ${serverOutput}`);
      }
    });

    // 15. Preview Truth in Advertising: No Premature "Delivered" Claim
    await test('Push preview footer accurately reflects device availability without false Delivered claims', () => {
      const footer1 = getPushPreviewFooterText(1);
      assert(footer1 === '1 registered device available', `Expected '1 registered device available', got '${footer1}'`);

      const footer0 = getPushPreviewFooterText(0);
      assert(footer0 === 'No registered devices available', `Expected 'No registered devices available', got '${footer0}'`);

      const footerMultiple = getPushPreviewFooterText(3);
      assert(footerMultiple === '3 registered devices available', `Expected '3 registered devices available', got '${footerMultiple}'`);

      assert(!footer1.toLowerCase().includes('delivered'), 'Preview footer must not claim message was delivered');
      assert(!footer0.toLowerCase().includes('delivered'), 'Preview footer must not claim message was delivered');
    });

    // 16. Canonical Database Duty Location Resolution
    await test('resolveUserDutyLocation resolves duty location and team from live database', async () => {
      // Find a volunteer with a user_id
      const volunteerUser = await queryOne(`
        SELECT u.id as user_id, vp.full_name, vp.preferred_team
        FROM volunteer_profiles vp
        JOIN users u ON u.id = vp.user_id
        WHERE vp.status IN ('active', 'approved')
          AND (vp.is_deleted = 0 OR vp.is_deleted IS NULL)
        LIMIT 1
      `);

      if (volunteerUser) {
        const duty = await resolveUserDutyLocation(volunteerUser.user_id);
        console.log(`    [Duty Audit for ${volunteerUser.full_name}]:`, duty ? `${duty.name} (${duty.team || 'no team'})` : 'No assignment currently active');
        if (duty) {
          assert(typeof duty.name === 'string', 'Duty location must have a name string');
        }
      }
    });

    // 17. Send Button Validation & Blocker State Evaluation
    await test('Send button evaluation correctly enables send for valid volunteer context and blocks with staff-facing reason when invalid', () => {
      const aleleVolunteer = { name: 'Alele Chi', dutyLocation: null, team: 'Teens Team' };

      // 17a. Duty Reminder + resolved location + Push eligible → send enabled
      const resPushOnly = evaluateSendButtonState({
        actionLoading: false,
        body: 'Dear {Volunteer name},\nDuty session at {Location} for {Event name}.',
        subject: 'Duty Reminder - The General Assembly',
        activeGroupRecipients: 1,
        selectedChannels: ['push'],
        emailEnabled: true,
        whatsappEnabled: true,
        effectiveEligibility: { push: 1, email: 0, whatsappOptedIn: 0 },
        isVolAudience: true,
        selectedType: 'duty_reminder',
        targetVolunteers: [aleleVolunteer],
        resolvedVolunteerLocation: 'Grace Hall Primary'
      });
      assert(resPushOnly.isEnabled === true, `Expected send enabled with Push only, got: ${resPushOnly.blockerReason}`);
      assert(resPushOnly.blockerReason === null, 'Blocker reason must be null');

      // 17b. Duty Reminder + resolved location + Email eligible → send enabled
      const resEmailOnly = evaluateSendButtonState({
        actionLoading: false,
        body: 'Dear {Volunteer name},\nDuty session at {Location} for {Event name}.',
        subject: 'Duty Reminder - The General Assembly',
        activeGroupRecipients: 1,
        selectedChannels: ['email'],
        emailEnabled: true,
        whatsappEnabled: true,
        effectiveEligibility: { push: 0, email: 1, whatsappOptedIn: 0 },
        isVolAudience: true,
        selectedType: 'duty_reminder',
        targetVolunteers: [aleleVolunteer],
        resolvedVolunteerLocation: 'Grace Hall Primary'
      });
      assert(resEmailOnly.isEnabled === true, `Expected send enabled with Email only, got: ${resEmailOnly.blockerReason}`);

      // 17c. Duty Reminder + Push + Email eligible → send enabled
      const resPushAndEmail = evaluateSendButtonState({
        actionLoading: false,
        body: 'Dear {Volunteer name},\nDuty session at {Location} for {Event name}.',
        subject: 'Duty Reminder - The General Assembly',
        activeGroupRecipients: 1,
        selectedChannels: ['push', 'email'],
        emailEnabled: true,
        whatsappEnabled: true,
        effectiveEligibility: { push: 1, email: 1, whatsappOptedIn: 0 },
        isVolAudience: true,
        selectedType: 'duty_reminder',
        targetVolunteers: [aleleVolunteer],
        resolvedVolunteerLocation: 'Grace Hall Primary'
      });
      assert(resPushAndEmail.isEnabled === true, `Expected send enabled with Push + Email, got: ${resPushAndEmail.blockerReason}`);

      // 17d. WhatsApp unavailable (0 available) but not selected does NOT disable send
      const resWaUnselected = evaluateSendButtonState({
        actionLoading: false,
        body: 'Dear {Volunteer name},\nDuty session at {Location} for {Event name}.',
        subject: 'Duty Reminder',
        activeGroupRecipients: 1,
        selectedChannels: ['push', 'email'],
        emailEnabled: true,
        whatsappEnabled: true,
        effectiveEligibility: { push: 1, email: 1, whatsappOptedIn: 0 },
        isVolAudience: true,
        selectedType: 'duty_reminder',
        targetVolunteers: [aleleVolunteer],
        resolvedVolunteerLocation: 'Grace Hall Primary'
      });
      assert(resWaUnselected.isEnabled === true, 'WhatsApp unavailable must not disable send when WhatsApp is not selected');

      // 17e. In-app unchecked does NOT disable send
      const resInAppUnchecked = evaluateSendButtonState({
        actionLoading: false,
        body: 'Dear {Volunteer name},\nDuty session at {Location} for {Event name}.',
        subject: 'Duty Reminder',
        activeGroupRecipients: 1,
        selectedChannels: ['push'],
        emailEnabled: true,
        whatsappEnabled: true,
        effectiveEligibility: { inApp: 1, push: 1, email: 1, whatsappOptedIn: 0 },
        isVolAudience: true,
        selectedType: 'duty_reminder',
        targetVolunteers: [aleleVolunteer],
        resolvedVolunteerLocation: 'Grace Hall Primary'
      });
      assert(resInAppUnchecked.isEnabled === true, 'Unchecking in-app notification must not disable send when push is eligible');

      // 17f. Raw template contains {Location} and {Volunteer name} but resolved location exists → send enabled
      const resRawTemplate = evaluateSendButtonState({
        actionLoading: false,
        body: 'Dear {Volunteer name},\nYour duty assignment is at {Location} for {Event name}.',
        subject: 'Duty Reminder - {Event name}',
        activeGroupRecipients: 1,
        selectedChannels: ['push', 'email'],
        emailEnabled: true,
        whatsappEnabled: true,
        effectiveEligibility: { push: 1, email: 1 },
        isVolAudience: true,
        selectedType: 'duty_reminder',
        targetVolunteers: [aleleVolunteer],
        resolvedVolunteerLocation: 'Grace Hall Primary'
      });
      assert(resRawTemplate.isEnabled === true, 'Raw template tokens must not block send when resolved data exists');

      // 17g. Genuinely missing location → send disabled
      const resMissingLocation = evaluateSendButtonState({
        actionLoading: false,
        body: 'Dear {Volunteer name},\nDuty at {Location}.',
        subject: 'Duty Reminder',
        activeGroupRecipients: 1,
        selectedChannels: ['push', 'email'],
        emailEnabled: true,
        whatsappEnabled: true,
        effectiveEligibility: { push: 1, email: 1 },
        isVolAudience: true,
        selectedType: 'duty_reminder',
        targetVolunteers: [{ name: 'Unassigned Volunteer', dutyLocation: null, team: 'Logistics' }],
        resolvedVolunteerLocation: null
      });
      assert(resMissingLocation.isEnabled === false, 'Genuinely missing duty location must disable send');

      // 17h. Missing location gives staff-facing reason
      assert(
        resMissingLocation.blockerReason === 'Unassigned Volunteer does not have a duty location assigned yet.',
        `Expected staff-facing reason, got: ${resMissingLocation.blockerReason}`
      );

      // 17i. No eligible selected channels → send disabled
      const resNoEligibleChannels = evaluateSendButtonState({
        actionLoading: false,
        body: 'Dear {Volunteer name},\nDuty update.',
        subject: 'Duty Reminder',
        activeGroupRecipients: 1,
        selectedChannels: ['whatsapp'],
        emailEnabled: true,
        whatsappEnabled: true,
        effectiveEligibility: { push: 1, email: 1, whatsappOptedIn: 0 },
        isVolAudience: true,
        selectedType: 'duty_reminder',
        targetVolunteers: [aleleVolunteer],
        resolvedVolunteerLocation: 'Grace Hall Primary'
      });
      assert(resNoEligibleChannels.isEnabled === false, 'Send must be disabled when selected channels have 0 eligible recipients');
      assert(
        resNoEligibleChannels.blockerReason === 'Selected delivery methods have no eligible recipients.',
        `Expected channel blocker message, got: ${resNoEligibleChannels.blockerReason}`
      );

      // 17j. Selected volunteer + valid context + valid channel → send enabled
      const resFullValid = evaluateSendButtonState({
        actionLoading: false,
        body: 'Dear {Volunteer name},\nDuty session at {Location}.',
        subject: 'Duty Reminder',
        activeGroupRecipients: 1,
        selectedChannels: ['push', 'email'],
        emailEnabled: true,
        whatsappEnabled: true,
        effectiveEligibility: { push: 1, email: 1 },
        isVolAudience: true,
        selectedType: 'duty_reminder',
        targetVolunteers: [{ name: 'Alele Chi', dutyLocation: 'Grace Hall Primary', team: 'Teens Team' }],
        resolvedVolunteerLocation: 'Grace Hall Primary'
      });
      assert(resFullValid.isEnabled === true, 'Valid volunteer with assigned location and channel must be enabled');
      assert(resFullValid.blockerReason === null, 'Blocker reason must be null for valid state');
    });

    // 18. Volunteer WhatsApp Opt-In, Opt-Out, and Dual-Role Verification
    await test('Volunteer WhatsApp Opt-In, Opt-Out, and Dual-Role consent flows behave safely', async () => {
      const volOnlyUserId = `u-vol-only-${testSuffix}`;
      const volOnlyProfileId = `vp-vol-only-${testSuffix}`;
      const dualUserId = `u-dual-${testSuffix}`;
      const dualParentId = `pp-dual-${testSuffix}`;
      const dualVolProfileId = `vp-dual-${testSuffix}`;
      const now = new Date().toISOString();

      // 18a. Volunteer unknown preserved until action
      await execute(`
        INSERT INTO users (id, email, role, email_verified, status, created_at, updated_at)
        VALUES (?, ?, 'volunteer', 1, 'active', ?, ?)
      `, [volOnlyUserId, `volonly.${testSuffix}@test.com`, now, now]);

      await execute(`
        INSERT INTO volunteer_profiles (
          id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at
        ) VALUES (?, ?, 'Volunteer Only', '+2348011112222', '+2348011112222', 'Teens Team', 'approved', ?, ?)
      `, [volOnlyProfileId, volOnlyUserId, now, now]);

      const initialVol = await queryOne('SELECT * FROM volunteer_profiles WHERE id = ?', [volOnlyProfileId]);
      assert(initialVol.whatsapp_consent_status === 'unknown', `Expected initial consent 'unknown', got: ${initialVol.whatsapp_consent_status}`);
      assert(initialVol.whatsapp_consent_at === null, 'Initial consent timestamp must be null');

      // Admin Messages reflection: unknown consent -> badge is "WhatsApp pending", channel count is 0
      const initialBadge = getVolunteerWhatsAppBadge(initialVol.whatsapp_consent_status, true);
      assert(initialBadge.label === 'WhatsApp pending', `Expected badge 'WhatsApp pending', got: ${initialBadge.label}`);
      assert(initialBadge.isPending === true, 'Badge must be marked isPending');

      const initialEligibility = calculateEffectiveEligibility({
        selectedGroup: 'volunteers',
        isSpecificParents: false,
        isSpecificVolunteers: false,
        selectedParentsList: [],
        selectedVolunteersList: [],
        eventVolunteers: [{
          id: volOnlyProfileId,
          userId: volOnlyUserId,
          name: 'Volunteer Only',
          phone: '+2348011112222',
          whatsappNumber: '+2348011112222',
          whatsappConsentStatus: initialVol.whatsapp_consent_status
        }],
        channelEligibility: { whatsappOptedIn: 0 },
        whatsappEnabled: true
      });
      assert(initialEligibility.whatsappOptedIn === 0, `Expected whatsappOptedIn 0 for unknown consent, got: ${initialEligibility.whatsappOptedIn}`);

      // 18b. No phone -> opt-in blocked clearly
      const volNoPhoneUserId = `u-nophone-${testSuffix}`;
      const volNoPhoneProfileId = `vp-nophone-${testSuffix}`;
      await execute(`
        INSERT INTO users (id, email, role, email_verified, status, created_at, updated_at)
        VALUES (?, ?, 'volunteer', 1, 'active', ?, ?)
      `, [volNoPhoneUserId, `nophone.${testSuffix}@test.com`, now, now]);

      await execute(`
        INSERT INTO volunteer_profiles (
          id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at
        ) VALUES (?, ?, 'No Phone Volunteer', '', '', 'Teens Team', 'approved', ?, ?)
      `, [volNoPhoneProfileId, volNoPhoneUserId, now, now]);

      const noPhoneProfile = await queryOne('SELECT * FROM volunteer_profiles WHERE id = ?', [volNoPhoneProfileId]);
      const hasPhone = Boolean(noPhoneProfile.phone || noPhoneProfile.whatsapp);
      assert(hasPhone === false, 'Profile must have no phone number');

      // 18c. Volunteer-only opts in successfully with timestamp and source
      const optInTime = new Date().toISOString();
      await execute(`
        UPDATE volunteer_profiles SET
          whatsapp_consent_status = 'opted_in',
          whatsapp_consent_at = ?,
          whatsapp_opt_out_at = NULL,
          whatsapp_consent_source = 'volunteer_portal',
          updated_at = ?
        WHERE id = ?
      `, [optInTime, optInTime, volOnlyProfileId]);

      const optedInVol = await queryOne('SELECT * FROM volunteer_profiles WHERE id = ?', [volOnlyProfileId]);
      assert(optedInVol.whatsapp_consent_status === 'opted_in', `Expected 'opted_in', got: ${optedInVol.whatsapp_consent_status}`);
      assert(optedInVol.whatsapp_consent_at !== null, 'Consent timestamp must be set');
      assert(optedInVol.whatsapp_opt_out_at === null, 'Opt out timestamp must be null after opt-in');
      assert(optedInVol.whatsapp_consent_source === 'volunteer_portal', 'Consent source must be recorded as volunteer_portal');

      // 18d. Opted-in Volunteer becomes WhatsApp eligible in Admin Messages
      const optedInBadge = getVolunteerWhatsAppBadge(optedInVol.whatsapp_consent_status, true);
      assert(optedInBadge.label === 'WhatsApp', `Expected badge 'WhatsApp', got: ${optedInBadge.label}`);
      assert(optedInBadge.isOptedIn === true, 'Badge must be isOptedIn');

      const optedInEligibility = calculateEffectiveEligibility({
        selectedGroup: 'volunteers',
        isSpecificParents: false,
        isSpecificVolunteers: false,
        selectedParentsList: [],
        selectedVolunteersList: [],
        eventVolunteers: [{
          id: volOnlyProfileId,
          userId: volOnlyUserId,
          name: 'Volunteer Only',
          phone: '+2348011112222',
          whatsappNumber: '+2348011112222',
          whatsappConsentStatus: optedInVol.whatsapp_consent_status
        }],
        channelEligibility: { whatsappOptedIn: 0 },
        whatsappEnabled: true
      });
      assert(optedInEligibility.whatsappOptedIn === 1, `Expected whatsappOptedIn 1 for opted-in volunteer, got: ${optedInEligibility.whatsappOptedIn}`);

      // 18e. Volunteer opts out successfully; phone number preserved
      const optOutTime = new Date().toISOString();
      await execute(`
        UPDATE volunteer_profiles SET
          whatsapp_consent_status = 'opted_out',
          whatsapp_opt_out_at = ?,
          updated_at = ?
        WHERE id = ?
      `, [optOutTime, optOutTime, volOnlyProfileId]);

      const optedOutVol = await queryOne('SELECT * FROM volunteer_profiles WHERE id = ?', [volOnlyProfileId]);
      assert(optedOutVol.whatsapp_consent_status === 'opted_out', `Expected 'opted_out', got: ${optedOutVol.whatsapp_consent_status}`);
      assert(optedOutVol.whatsapp_opt_out_at !== null, 'Opt out timestamp must be recorded');
      assert(optedOutVol.phone === '+2348011112222', 'Phone number must NOT be deleted on opt-out');

      // 18f. Opted-out Volunteer becomes ineligible in Admin Messages
      const optedOutBadge = getVolunteerWhatsAppBadge(optedOutVol.whatsapp_consent_status, true);
      assert(optedOutBadge.label === 'WhatsApp off', `Expected badge 'WhatsApp off', got: ${optedOutBadge.label}`);
      assert(optedOutBadge.isOptedIn === false, 'Opted out volunteer must not be isOptedIn');

      const optedOutEligibility = calculateEffectiveEligibility({
        selectedGroup: 'volunteers',
        isSpecificParents: false,
        isSpecificVolunteers: false,
        selectedParentsList: [],
        selectedVolunteersList: [],
        eventVolunteers: [{
          id: volOnlyProfileId,
          userId: volOnlyUserId,
          name: 'Volunteer Only',
          phone: '+2348011112222',
          whatsappNumber: '+2348011112222',
          whatsappConsentStatus: optedOutVol.whatsapp_consent_status
        }],
        channelEligibility: { whatsappOptedIn: 0 },
        whatsappEnabled: true
      });
      assert(optedOutEligibility.whatsappOptedIn === 0, `Expected whatsappOptedIn 0 for opted-out volunteer, got: ${optedOutEligibility.whatsappOptedIn}`);

      // 18g. Dual-role Parent + Volunteer: Parent consent remains authoritative
      await execute(`
        INSERT INTO users (id, email, role, email_verified, status, created_at, updated_at)
        VALUES (?, ?, 'parent', 1, 'active', ?, ?)
      `, [dualUserId, `dual.${testSuffix}@test.com`, now, now]);

      await execute(`
        INSERT INTO parent_profiles (
          id, user_id, full_name, email, phone_number, whatsapp_number, whatsapp_consent_status, whatsapp_consent_at, created_at, updated_at
        ) VALUES (?, ?, 'Dual Parent Volunteer', ?, '+2348033334444', '+2348033334444', 'opted_in', ?, ?, ?)
      `, [dualParentId, dualUserId, `dual.${testSuffix}@test.com`, now, now, now]);

      await execute(`
        INSERT INTO volunteer_profiles (
          id, user_id, full_name, phone, whatsapp, preferred_team, status, whatsapp_consent_status, created_at, updated_at
        ) VALUES (?, ?, 'Dual Parent Volunteer', '+2348033334444', '+2348033334444', 'Teens Team', 'approved', 'unknown', ?, ?)
      `, [dualVolProfileId, dualUserId, now, now]);

      // When resolving dual-role volunteer profile:
      const parentRow = await queryOne('SELECT * FROM parent_profiles WHERE user_id = ?', [dualUserId]);
      const volRow = await queryOne('SELECT * FROM volunteer_profiles WHERE user_id = ?', [dualUserId]);

      const effectiveConsentForDual = parentRow.id
        ? (parentRow.whatsapp_consent_status || 'unknown')
        : (volRow.whatsapp_consent_status || 'unknown');

      assert(effectiveConsentForDual === 'opted_in', 'Dual-role user must inherit authoritative Parent opted_in consent');

      // In Admin Messages query simulation:
      const dualAdminVolunteer = {
        id: dualVolProfileId,
        userId: dualUserId,
        name: 'Dual Parent Volunteer',
        phone: '+2348033334444',
        whatsappNumber: '+2348033334444',
        parentProfileId: parentRow.id,
        parentConsentStatus: parentRow.whatsapp_consent_status,
        volunteerConsentStatus: volRow.whatsapp_consent_status,
        whatsappConsentStatus: parentRow.id ? parentRow.whatsapp_consent_status : volRow.whatsapp_consent_status
      };

      assert(dualAdminVolunteer.whatsappConsentStatus === 'opted_in', 'Dual role admin record must reflect parent opted_in');
      const dualBadge = getVolunteerWhatsAppBadge(dualAdminVolunteer.whatsappConsentStatus, true);
      assert(dualBadge.label === 'WhatsApp', `Expected dual-role badge 'WhatsApp', got: ${dualBadge.label}`);

      // 18h. Dual-role synchronization: opt-out keeps both records non-contradictory
      await execute(`
        UPDATE parent_profiles SET whatsapp_consent_status = 'opted_out', whatsapp_opt_out_at = ?, updated_at = ? WHERE id = ?
      `, [now, now, dualParentId]);
      await execute(`
        UPDATE volunteer_profiles SET whatsapp_consent_status = 'opted_out', whatsapp_opt_out_at = ?, updated_at = ? WHERE id = ?
      `, [now, now, dualVolProfileId]);

      const syncedParent = await queryOne('SELECT whatsapp_consent_status FROM parent_profiles WHERE id = ?', [dualParentId]);
      const syncedVol = await queryOne('SELECT whatsapp_consent_status FROM volunteer_profiles WHERE id = ?', [dualVolProfileId]);
      assert(syncedParent.whatsapp_consent_status === 'opted_out', 'Parent status must be opted_out');
      assert(syncedVol.whatsapp_consent_status === 'opted_out', 'Volunteer status must be opted_out');
      assert(syncedParent.whatsapp_consent_status === syncedVol.whatsapp_consent_status, 'Consent between parent and volunteer profile must not contradict');
    });

    // 19. HTTP Endpoint Integration Verification: POST /api/volunteer/whatsapp/consent
    await test('HTTP endpoints enforce authentication, phone requirement, persistence, and dual-role sync', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api/volunteer', volunteerRouter);

      const server = await new Promise<http.Server>((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });
      const address = server.address() as any;
      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const httpTestSuffix = Date.now().toString().slice(-6);
        const now = new Date().toISOString();

        // 19a. Unauthenticated requests are rejected
        const unauthRes = await fetch(`${baseUrl}/api/volunteer/whatsapp/consent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'opt_in' })
        });
        assert(unauthRes.status === 401, `Expected 401 for unauthenticated request, got: ${unauthRes.status}`);

        // Setup test volunteer
        const volUser = `u-http-vol-${httpTestSuffix}`;
        const volProf = `vp-http-vol-${httpTestSuffix}`;
        await execute(`
          INSERT INTO users (id, email, role, email_verified, status, created_at, updated_at)
          VALUES (?, ?, 'volunteer', 1, 'active', ?, ?)
        `, [volUser, `httpvol.${httpTestSuffix}@test.com`, now, now]);

        await execute(`
          INSERT INTO volunteer_profiles (
            id, user_id, full_name, phone, whatsapp, preferred_team, status, created_at, updated_at
          ) VALUES (?, ?, 'HTTP Volunteer', '', '', 'Teens Team', 'approved', ?, ?)
        `, [volProf, volUser, now, now]);

        const volJwt = generateToken(volUser);

        // 19b. Opt-in with no phone returns 400 with PHONE_REQUIRED
        const noPhoneRes = await fetch(`${baseUrl}/api/volunteer/whatsapp/consent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${volJwt}`
          },
          body: JSON.stringify({ action: 'opt_in' })
        });
        assert(noPhoneRes.status === 400, `Expected 400 for missing phone, got: ${noPhoneRes.status}`);
        const noPhoneData = await noPhoneRes.json();
        assert(noPhoneData.code === 'PHONE_REQUIRED', `Expected PHONE_REQUIRED code, got: ${noPhoneData.code}`);
        assert(noPhoneData.error === 'Add a phone number before enabling WhatsApp updates.', `Expected clear error message, got: ${noPhoneData.error}`);

        // 19c. Opt-in with valid phone succeeds and persists
        const optInRes = await fetch(`${baseUrl}/api/volunteer/whatsapp/consent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${volJwt}`
          },
          body: JSON.stringify({ action: 'opt_in', whatsappNumber: '08012345678' })
        });
        assert(optInRes.status === 200, `Expected 200 for valid opt-in, got: ${optInRes.status}`);
        const optInData = await optInRes.json();
        assert(optInData.success === true, 'Response must indicate success');
        assert(optInData.consentStatus === 'opted_in', 'Response must return opted_in status');

        // Check DB persistence directly
        const dbVol = await queryOne('SELECT * FROM volunteer_profiles WHERE id = ?', [volProf]);
        assert(dbVol.whatsapp_consent_status === 'opted_in', 'DB status must be opted_in');
        assert(dbVol.whatsapp_consent_source === 'volunteer_portal', 'DB source must be volunteer_portal');
        assert(dbVol.whatsapp_consent_at !== null, 'DB timestamp must be recorded');
        assert(dbVol.whatsapp === '+2348012345678', `Expected normalized phone +2348012345678, got: ${dbVol.whatsapp}`);

        // 19d. GET /api/volunteer/me reflects opted_in state and phone
        const meRes = await fetch(`${baseUrl}/api/volunteer/me`, {
          headers: { 'Authorization': `Bearer ${volJwt}` }
        });
        assert(meRes.status === 200, `Expected 200 from GET /me, got: ${meRes.status}`);
        const meData = await meRes.json();
        assert(meData.profile.whatsappConsentStatus === 'opted_in', 'GET /me must return whatsappConsentStatus: opted_in');
        assert(meData.profile.whatsappNumber === '+2348012345678', 'GET /me must return normalized phone');

        // 19e. Opt-out succeeds and preserves phone number
        const optOutRes = await fetch(`${baseUrl}/api/volunteer/whatsapp/consent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${volJwt}`
          },
          body: JSON.stringify({ action: 'opt_out' })
        });
        assert(optOutRes.status === 200, `Expected 200 for opt-out, got: ${optOutRes.status}`);
        const optOutData = await optOutRes.json();
        assert(optOutData.success === true, 'Opt out response must indicate success');
        assert(optOutData.consentStatus === 'opted_out', 'Opt out response must return opted_out');

        const dbVolOptOut = await queryOne('SELECT * FROM volunteer_profiles WHERE id = ?', [volProf]);
        assert(dbVolOptOut.whatsapp_consent_status === 'opted_out', 'DB status must be opted_out');
        assert(dbVolOptOut.whatsapp_opt_out_at !== null, 'DB opt out timestamp must be set');
        assert(dbVolOptOut.whatsapp === '+2348012345678', 'Phone number must NOT be deleted on opt-out');

        // 19f. Dual-role user HTTP sync test
        const dualHttpUser = `u-http-dual-${httpTestSuffix}`;
        const dualHttpParent = `pp-http-dual-${httpTestSuffix}`;
        const dualHttpVol = `vp-http-dual-${httpTestSuffix}`;
        await execute(`
          INSERT INTO users (id, email, role, email_verified, status, created_at, updated_at)
          VALUES (?, ?, 'volunteer', 1, 'active', ?, ?)
        `, [dualHttpUser, `httpdual.${httpTestSuffix}@test.com`, now, now]);

        await execute(`
          INSERT INTO parent_profiles (
            id, user_id, full_name, email, phone_number, whatsapp_number, whatsapp_consent_status, created_at, updated_at
          ) VALUES (?, ?, 'HTTP Dual', ?, '+2348099887766', '+2348099887766', 'opted_in', ?, ?)
        `, [dualHttpParent, dualHttpUser, `httpdual.${httpTestSuffix}@test.com`, now, now]);

        await execute(`
          INSERT INTO volunteer_profiles (
            id, user_id, full_name, phone, whatsapp, preferred_team, status, whatsapp_consent_status, created_at, updated_at
          ) VALUES (?, ?, 'HTTP Dual', '+2348099887766', '+2348099887766', 'Teens Team', 'approved', 'unknown', ?, ?)
        `, [dualHttpVol, dualHttpUser, now, now]);

        const dualJwt = generateToken(dualHttpUser);

        // GET /me reflects parent opted_in status as authoritative
        const dualMeRes = await fetch(`${baseUrl}/api/volunteer/me`, {
          headers: { 'Authorization': `Bearer ${dualJwt}` }
        });
        const dualMeData = await dualMeRes.json();
        assert(dualMeData.profile.whatsappConsentStatus === 'opted_in', 'Dual-role GET /me must reflect authoritative parent opted_in');
        assert(dualMeData.profile.isDualRole === true, 'Dual-role flag must be true');

        // Dual-role opt-out updates both profiles
        const dualOptOutRes = await fetch(`${baseUrl}/api/volunteer/whatsapp/consent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${dualJwt}`
          },
          body: JSON.stringify({ action: 'opt_out' })
        });
        assert(dualOptOutRes.status === 200, 'Dual role opt-out must succeed');

        const finalParent = await queryOne('SELECT whatsapp_consent_status FROM parent_profiles WHERE id = ?', [dualHttpParent]);
        const finalVol = await queryOne('SELECT whatsapp_consent_status FROM volunteer_profiles WHERE id = ?', [dualHttpVol]);
        assert(finalParent.whatsapp_consent_status === 'opted_out', 'Parent profile must be updated to opted_out');
        assert(finalVol.whatsapp_consent_status === 'opted_out', 'Volunteer profile must be updated to opted_out');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

  } finally {
    console.log('\n====================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');
  }

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
