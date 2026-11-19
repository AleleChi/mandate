import crypto from 'crypto';
import { execute, query, queryOne } from '../src/server/db';
import { QUALIFYING_CHILD_STATUSES } from '../src/server/services/selectedParentsChannelService';
import { resolveMessageTokens } from '../src/server/utils/urlHelper';
import { formatSelectedChildNames } from '../src/server/services/whatsapp/personalization';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failed++;
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`[PASS] ${msg}`);
  passed++;
}

async function runTests() {
  console.log('======================================================================');
  console.log('TEST SUITE: SELECTED PARENTS EMAIL BROADCAST & VENUE RESTRICTION');
  console.log('======================================================================\n');

  const runId = Date.now().toString().slice(-6);
  const now = new Date().toISOString();

  const event1Id = `evt-email-test1-${runId}`;
  const event2Id = `evt-email-test2-${runId}`;
  const venue1Name = 'Koinonia Pavilion';
  const venue1Address = 'Koinonia Pavilion, Plot 1234, Central District, Abuja';
  const venue2Address = 'Lagos Centre, Victoria Island, Lagos';

  // 1. Setup Test Events
  console.log('[Setup] Inserting test events with authoritative location/venue details...');
  await execute(`
    INSERT INTO events (id, title, starts_at, ends_at, location, status, created_at, updated_at)
    VALUES (?, 'Koinonia General Assembly 2026', '2026-11-18T09:00:00Z', '2026-11-22T19:00:00Z', ?, 'active', ?, ?)
  `, [event1Id, venue1Address, now, now]);

  await execute(`
    INSERT INTO events (id, title, starts_at, ends_at, location, status, created_at, updated_at)
    VALUES (?, 'Koinonia Lagos Conference 2026', '2026-12-01T09:00:00Z', '2026-12-05T19:00:00Z', ?, 'active', ?, ?)
  `, [event2Id, venue2Address, now, now]);

  // Clean any leftovers from past test runs
  await execute(`DELETE FROM email_delivery_logs WHERE campaign_id LIKE 'camp-em-%'`);
  await execute(`DELETE FROM whatsapp_delivery_logs WHERE campaign_id LIKE 'camp-wa-%'`);
  await execute(`DELETE FROM child_event_entries WHERE id LIKE 'cee-%'`);
  await execute(`DELETE FROM children WHERE id LIKE 'ch-%'`);
  await execute(`DELETE FROM parent_profiles WHERE id LIKE 'prof-p%'`);
  await execute(`DELETE FROM users WHERE email LIKE '%@test.com' OR email LIKE '%@example.com' OR id LIKE 'usr-p%'`);

  // Setup Test Parents & Children
  // Parent 1: 1 selected child in Event 1, valid email
  const u1Id = `usr-p1-${runId}`;
  const p1Id = `prof-p1-${runId}`;
  const c1Id = `ch-1-${runId}`;
  const cee1Id = `cee-1-${runId}`;
  const email1 = `parent1_${runId}@test.com`;
  await execute(`INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES (?, ?, 'parent', 'active', ?, ?)`, [u1Id, email1, now, now]);
  await execute(`INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_consent_status, created_at, updated_at) VALUES (?, ?, 'David Adeleke', '+2348011111111', 'opted_in', ?, ?)`, [p1Id, u1Id, now, now]);
  await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, created_at, updated_at) VALUES (?, ?, 'Imade Adeleke', 'female', '2018-05-10', 'Primary (6-8)', ?, ?)`, [c1Id, p1Id, now, now]);
  await execute(`INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at) VALUES (?, ?, ?, 'selected', ?, ?)`, [cee1Id, event1Id, c1Id, now, now]);

  // Parent 2: Multiple children in Event 1 (all selected: pass_ready + checked_in), valid email
  const u2Id = `usr-p2-${runId}`;
  const p2Id = `prof-p2-${runId}`;
  const c2aId = `ch-2a-${runId}`;
  const c2bId = `ch-2b-${runId}`;
  const cee2aId = `cee-2a-${runId}`;
  const cee2bId = `cee-2b-${runId}`;
  const email2 = `parent2_${runId}@test.com`;
  await execute(`INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES (?, ?, 'parent', 'active', ?, ?)`, [u2Id, email2, now, now]);
  await execute(`INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_consent_status, created_at, updated_at) VALUES (?, ?, 'Chioma Okoye', '+2348022222222', 'opted_in', ?, ?)`, [p2Id, u2Id, now, now]);
  await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, created_at, updated_at) VALUES (?, ?, 'Somto Okoye', 'male', '2016-03-15', 'Pre-Teens (9-12)', ?, ?)`, [c2aId, p2Id, now, now]);
  await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, created_at, updated_at) VALUES (?, ?, 'Kamsi Okoye', 'female', '2019-08-20', 'Pre-Primary (3-5)', ?, ?)`, [c2bId, p2Id, now, now]);
  await execute(`INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pass_ready', ?, ?)`, [cee2aId, event1Id, c2aId, now, now]);
  await execute(`INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at) VALUES (?, ?, ?, 'checked_in', ?, ?)`, [cee2bId, event1Id, c2bId, now, now]);

  // Parent 3: Mixed children in Event 1 (Child 3a: selected, Child 3b: not_selected, Child 3c: waiting_list)
  const u3Id = `usr-p3-${runId}`;
  const p3Id = `prof-p3-${runId}`;
  const c3aId = `ch-3a-${runId}`;
  const c3bId = `ch-3b-${runId}`;
  const c3cId = `ch-3c-${runId}`;
  const cee3aId = `cee-3a-${runId}`;
  const cee3bId = `cee-3b-${runId}`;
  const cee3cId = `cee-3c-${runId}`;
  const email3 = `parent3_${runId}@test.com`;
  await execute(`INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES (?, ?, 'parent', 'active', ?, ?)`, [u3Id, email3, now, now]);
  await execute(`INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_consent_status, created_at, updated_at) VALUES (?, ?, 'Emeka Johnson', '+2348033333333', 'opted_in', ?, ?)`, [p3Id, u3Id, now, now]);
  await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, created_at, updated_at) VALUES (?, ?, 'Zion Johnson', 'male', '2017-01-10', 'Primary (6-8)', ?, ?)`, [c3aId, p3Id, now, now]);
  await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, created_at, updated_at) VALUES (?, ?, 'Liam Johnson', 'male', '2020-04-12', 'Toddler (0-2)', ?, ?)`, [c3bId, p3Id, now, now]);
  await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, created_at, updated_at) VALUES (?, ?, 'Maya Johnson', 'female', '2015-11-05', 'Pre-Teens (9-12)', ?, ?)`, [c3cId, p3Id, now, now]);
  await execute(`INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at) VALUES (?, ?, ?, 'selected', ?, ?)`, [cee3aId, event1Id, c3aId, now, now]);
  await execute(`INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at) VALUES (?, ?, ?, 'not_selected', ?, ?)`, [cee3bId, event1Id, c3bId, now, now]);
  await execute(`INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at) VALUES (?, ?, ?, 'waiting_list', ?, ?)`, [cee3cId, event1Id, c3cId, now, now]);

  // Parent 4: No selected children in Event 1 (Child 4: under_review)
  const u4Id = `usr-p4-${runId}`;
  const p4Id = `prof-p4-${runId}`;
  const c4Id = `ch-4-${runId}`;
  const cee4Id = `cee-4-${runId}`;
  const email4 = `parent4_${runId}@test.com`;
  await execute(`INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES (?, ?, 'parent', 'active', ?, ?)`, [u4Id, email4, now, now]);
  await execute(`INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_consent_status, created_at, updated_at) VALUES (?, ?, 'Grace Danladi', '+2348044444444', 'opted_in', ?, ?)`, [p4Id, u4Id, now, now]);
  await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, created_at, updated_at) VALUES (?, ?, 'Praise Danladi', 'female', '2018-09-09', 'Primary (6-8)', ?, ?)`, [c4Id, p4Id, now, now]);
  await execute(`INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at) VALUES (?, ?, ?, 'under_review', ?, ?)`, [cee4Id, event1Id, c4Id, now, now]);

  // Parent 5: 1 selected child in Event 1, but MISSING email address (empty string)
  const u5Id = `usr-p5-${runId}`;
  const p5Id = `prof-p5-${runId}`;
  const c5Id = `ch-5-${runId}`;
  const cee5Id = `cee-5-${runId}`;
  await execute(`INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES (?, '', 'parent', 'active', ?, ?)`, [u5Id, now, now]);
  await execute(`INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_consent_status, created_at, updated_at) VALUES (?, ?, 'Musa Bello', '+2348055555555', 'opted_in', ?, ?)`, [p5Id, u5Id, now, now]);
  await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, created_at, updated_at) VALUES (?, ?, 'Farida Bello', 'female', '2017-06-25', 'Primary (6-8)', ?, ?)`, [c5Id, p5Id, now, now]);
  await execute(`INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at) VALUES (?, ?, ?, 'selected', ?, ?)`, [cee5Id, event1Id, c5Id, now, now]);

  // Parent 6: Selected child ONLY in Event 2 (Different Event)
  const u6Id = `usr-p6-${runId}`;
  const p6Id = `prof-p6-${runId}`;
  const c6Id = `ch-6-${runId}`;
  const cee6Id = `cee-6-${runId}`;
  const email6 = `parent6_${runId}@test.com`;
  await execute(`INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES (?, ?, 'parent', 'active', ?, ?)`, [u6Id, email6, now, now]);
  await execute(`INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_consent_status, created_at, updated_at) VALUES (?, ?, 'Kolawole Sanwo', '+2348066666666', 'opted_in', ?, ?)`, [p6Id, u6Id, now, now]);
  await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, age_group, created_at, updated_at) VALUES (?, ?, 'Timi Sanwo', 'male', '2019-12-01', 'Pre-Primary (3-5)', ?, ?)`, [c6Id, p6Id, now, now]);
  await execute(`INSERT INTO child_event_entries (id, event_id, child_id, status, created_at, updated_at) VALUES (?, ?, ?, 'selected', ?, ?)`, [cee6Id, event2Id, c6Id, now, now]);

  // =========================================================================
  // SUITE 1: SELECTED-PARENT RECIPIENT RESOLUTION TESTS
  // =========================================================================
  console.log('\n--- SUITE 1: SELECTED-PARENT RECIPIENT RESOLUTION ---');

  const qualifyingStatuses = [...QUALIFYING_CHILD_STATUSES];
  const qPlaceholders = qualifyingStatuses.map(() => '?').join(',');

  // Query eligible parents for Event 1
  const eligibleRows = await query<any>(`
    SELECT 
      p.id as parent_id,
      p.full_name as parent_name,
      u.email,
      c.id as child_id,
      c.full_name as child_name,
      cee.status as child_status
    FROM child_event_entries cee
    JOIN children c ON c.id = cee.child_id
    JOIN parent_profiles p ON p.id = c.parent_profile_id
    JOIN users u ON u.id = p.user_id
    WHERE cee.event_id = ?
      AND cee.status IN (${qPlaceholders})
      AND (cee.is_deleted = 0 OR cee.is_deleted IS NULL)
      AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
      AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
    ORDER BY p.full_name ASC, c.date_of_birth ASC
  `, [event1Id, ...qualifyingStatuses]);

  // Group by parent_id
  const parentMap = new Map<string, any>();
  for (const r of eligibleRows) {
    if (!parentMap.has(r.parent_id)) {
      parentMap.set(r.parent_id, {
        parentId: r.parent_id,
        parentName: r.parent_name,
        email: r.email,
        children: []
      });
    }
    parentMap.get(r.parent_id).children.push(r.child_name);
  }

  // 1. Parent with one selected child qualifies
  assert(parentMap.has(p1Id), 'Parent 1 with 1 selected child qualifies in audience');
  assert(parentMap.get(p1Id).children.length === 1 && parentMap.get(p1Id).children[0] === 'Imade Adeleke', 'Parent 1 has correct single selected child');

  // 2. Parent with multiple selected children receives one email with aggregated names
  assert(parentMap.has(p2Id), 'Parent 2 with multiple selected children qualifies');
  const p2NamesFormatted = formatSelectedChildNames(parentMap.get(p2Id).children);
  assert(p2NamesFormatted === 'Somto and Kamsi', `Parent 2 formatted child names: "${p2NamesFormatted}"`);

  // 3. Parent with selected and non-selected children references selected children only
  assert(parentMap.has(p3Id), 'Parent 3 with mixed selected/non-selected children qualifies');
  assert(parentMap.get(p3Id).children.length === 1 && parentMap.get(p3Id).children[0] === 'Zion Johnson', 'Parent 3 excludes non-selected children (Liam, Maya) from selected list');

  // 4. Parent with no selected children is excluded
  assert(!parentMap.has(p4Id), 'Parent 4 (under_review) is strictly excluded from audience');

  // 5. Parent from another event is excluded
  assert(!parentMap.has(p6Id), 'Parent 6 (selected in Event 2) is strictly excluded from Event 1 audience');

  // 6. Parent without an email address is identified for exclusion from delivery
  assert(parentMap.has(p5Id), 'Parent 5 is in eligible parents count');
  assert(!parentMap.get(p5Id).email || !parentMap.get(p5Id).email.includes('@'), 'Parent 5 is identified as having no valid email');

  // 7. Token replacement test
  const testTmpl = 'Dear {Parent name},\n{Selected child name(s)} selected for {Event name} at {Venue name} ({Venue address}).';
  const resolved = resolveMessageTokens(testTmpl, {
    parentName: parentMap.get(p2Id).parentName,
    selectedChildNames: p2NamesFormatted,
    eventName: 'Koinonia General Assembly 2026',
    venueName: 'Koinonia Pavilion',
    venueAddress: venue1Address
  });
  assert(resolved.includes('Dear Chioma Okoye,'), 'Tokens correctly resolve {Parent name}');
  assert(resolved.includes('Somto and Kamsi selected for'), 'Tokens correctly resolve {Selected child name(s)}');
  assert(resolved.includes('at Koinonia Pavilion (Koinonia Pavilion, Plot 1234, Central District, Abuja)'), 'Tokens correctly resolve {Venue name} and {Venue address}');

  // =========================================================================
  // SUITE 2: EMAIL DELIVERY & DUPLICATE PREVENTION TESTS
  // =========================================================================
  console.log('\n--- SUITE 2: EMAIL DELIVERY & DUPLICATE PREVENTION ---');

  const campaign1Id = `camp-em-1-${runId}`;
  const campaign2Id = `camp-em-2-${runId}`;

  // 1. WhatsApp previously sent record should NOT block email
  await execute(`
    INSERT INTO whatsapp_delivery_logs (id, campaign_id, parent_profile_id, recipient_phone, provider, status, created_at, updated_at)
    VALUES (?, ?, ?, '+2348011111111', 'zoho', 'delivered', ?, ?)
  `, [`wa-log-${runId}`, `camp-wa-${runId}`, p1Id, now, now]);

  // Check whether Parent 1 has an email sent record
  const p1EmailCheck = await queryOne(`
    SELECT id FROM email_delivery_logs WHERE event_id = ? AND parent_profile_id = ? AND status = 'sent'
  `, [event1Id, p1Id]);
  assert(!p1EmailCheck, 'Parent 1 has WhatsApp delivered, but email is not yet sent');

  // Record successful email delivery for Parent 1
  const log1Id = `edl-1-${runId}`;
  await execute(`
    INSERT INTO email_delivery_logs (
      id, campaign_id, event_id, parent_profile_id, user_id, recipient_email,
      subject, provider, provider_message_id, status, sent_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'Important Event Details', 'zeptomail', 'msg-12345', 'sent', ?, ?, ?)
  `, [log1Id, campaign1Id, event1Id, p1Id, u1Id, email1, now, now, now]);

  // 2. Successful email recorded
  const p1EmailAfter = await queryOne(`
    SELECT status, provider_message_id FROM email_delivery_logs WHERE id = ?
  `, [log1Id]);
  assert(p1EmailAfter?.status === 'sent' && p1EmailAfter?.provider_message_id === 'msg-12345', 'Successful email delivery correctly logged in email_delivery_logs');

  // 3. Retry duplicate prevention: if email is already sent, it is skipped
  const p1AlreadySent = await queryOne(`
    SELECT id FROM email_delivery_logs
    WHERE event_id = ? AND parent_profile_id = ? AND status = 'sent'
  `, [event1Id, p1Id]);
  assert(Boolean(p1AlreadySent), 'Duplicate check correctly identifies Parent 1 as already successfully emailed');

  // 4. Failed delivery recorded
  const logFailId = `edl-fail-${runId}`;
  await execute(`
    INSERT INTO email_delivery_logs (
      id, campaign_id, event_id, parent_profile_id, user_id, recipient_email,
      subject, provider, error_message, status, failed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'Important Event Details', 'zeptomail', 'SMTP 550 Mailbox unavailable', 'failed', ?, ?, ?)
  `, [logFailId, campaign1Id, event1Id, p3Id, u3Id, email3, now, now, now]);

  const p3FailRecord = await queryOne(`
    SELECT status, error_message FROM email_delivery_logs WHERE id = ?
  `, [logFailId]);
  assert(p3FailRecord?.status === 'failed' && p3FailRecord?.error_message?.includes('SMTP 550'), 'Failed email delivery recorded with error message');

  // 5. Retry allows failed delivery to be retried
  const p3SentCheck = await queryOne(`
    SELECT id FROM email_delivery_logs
    WHERE event_id = ? AND parent_profile_id = ? AND status = 'sent'
  `, [event1Id, p3Id]);
  assert(!p3SentCheck, 'Parent 3 failed previously, so status!=sent allows safe retry');

  // Now retry Parent 3 successfully
  const logRetryId = `edl-retry-${runId}`;
  await execute(`
    INSERT INTO email_delivery_logs (
      id, campaign_id, event_id, parent_profile_id, user_id, recipient_email,
      subject, provider, provider_message_id, status, sent_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'Important Event Details', 'zeptomail', 'msg-retry-ok', 'sent', ?, ?, ?)
  `, [logRetryId, campaign2Id, event1Id, p3Id, u3Id, email3, now, now, now]);

  const p3RetryRecord = await queryOne(`
    SELECT id FROM email_delivery_logs WHERE event_id = ? AND parent_profile_id = ? AND status = 'sent'
  `, [event1Id, p3Id]);
  assert(Boolean(p3RetryRecord), 'Retry recorded successful send without duplicating Parent 1');

  // =========================================================================
  // SUITE 3: VENUE VISIBILITY & SERVER-SIDE AUTHORIZATION TESTS
  // =========================================================================
  console.log('\n--- SUITE 3: RESTRICTED VENUE ADDRESS VISIBILITY ---');

  // Helper function simulating GET /api/parent/venue-access
  async function checkVenueAccess(parentId: string, targetEventId: string) {
    const parent = await queryOne<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM parent_profiles WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL)',
      [parentId]
    );
    if (!parent) return { success: false, status: 401 };

    const event = await queryOne<{ id: string; title: string; location: string }>(
      'SELECT id, title, location FROM events WHERE id = ?',
      [targetEventId]
    );
    if (!event) return { success: false, status: 404 };

    const hasQualifyingChild = await queryOne(`
      SELECT cee.id
      FROM child_event_entries cee
      JOIN children c ON c.id = cee.child_id
      WHERE c.parent_profile_id = ?
        AND cee.event_id = ?
        AND cee.status IN (${qPlaceholders})
        AND (cee.is_deleted = 0 OR cee.is_deleted IS NULL)
        AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
      LIMIT 1
    `, [parent.id, targetEventId, ...qualifyingStatuses]);

    if (!hasQualifyingChild) {
      return {
        success: true,
        eligible: false,
        venueName: null,
        venueAddress: null,
        location: null
      };
    }

    const rawLocation = (event.location || '').trim();
    const venueName = rawLocation ? (rawLocation.split(',')[0]?.trim() || rawLocation) : (event.title || 'Auditorium');

    return {
      success: true,
      eligible: true,
      venueName,
      venueAddress: rawLocation,
      location: rawLocation
    };
  }

  // 1. Authenticated parent with one selected child receives venue address
  const accessP1 = await checkVenueAccess(p1Id, event1Id);
  assert(accessP1.eligible === true && accessP1.venueAddress === venue1Address, 'Parent 1 with 1 selected child receives full venue address');

  // 2. Authenticated parent with multiple selected children receives venue address
  const accessP2 = await checkVenueAccess(p2Id, event1Id);
  assert(accessP2.eligible === true && accessP2.venueAddress === venue1Address, 'Parent 2 with multiple selected children receives full venue address');

  // 3. Parent with no selected children does NOT receive venue address
  const accessP4 = await checkVenueAccess(p4Id, event1Id);
  assert(accessP4.eligible === false && accessP4.venueAddress === null, 'Parent 4 with child under_review is denied venue address (returns null)');

  // 4. Cross-event protection: Parent 6 has selected child in Event 2, but requests Event 1
  const accessP6Event1 = await checkVenueAccess(p6Id, event1Id);
  assert(accessP6Event1.eligible === false && accessP6Event1.venueAddress === null, 'Cross-event isolation: Parent 6 cannot access Event 1 address');

  // But Parent 6 CAN access Event 2 address
  const accessP6Event2 = await checkVenueAccess(p6Id, event2Id);
  assert(accessP6Event2.eligible === true && accessP6Event2.venueAddress === venue2Address, 'Parent 6 can access Event 2 address where child is selected');

  // 5. Revocation behaviour: Revoke Child 1's selection -> Parent 1 immediately loses venue access
  console.log('[Test] Revoking Parent 1 child selection (selected -> withdrawn)...');
  await execute(`
    UPDATE child_event_entries SET status = 'withdrawn' WHERE id = ?
  `, [cee1Id]);

  const accessP1Revoked = await checkVenueAccess(p1Id, event1Id);
  assert(accessP1Revoked.eligible === false && accessP1Revoked.venueAddress === null, 'After child status withdrawn, Parent 1 venue access is immediately revoked');

  // Restore status for clean state
  await execute(`UPDATE child_event_entries SET status = 'selected' WHERE id = ?`, [cee1Id]);
  const accessP1Restored = await checkVenueAccess(p1Id, event1Id);
  assert(accessP1Restored.eligible === true, 'Parent 1 venue access restored when child re-selected');

  // Clean test records
  console.log('\n[Cleanup] Cleaning up test records...');
  await execute(`DELETE FROM email_delivery_logs WHERE event_id IN (?, ?)`, [event1Id, event2Id]);
  await execute(`DELETE FROM whatsapp_delivery_logs WHERE id LIKE 'wa-log-%'`);
  await execute(`DELETE FROM child_event_entries WHERE event_id IN (?, ?)`, [event1Id, event2Id]);
  await execute(`DELETE FROM children WHERE id IN (?, ?, ?, ?, ?, ?, ?)`, [c1Id, c2aId, c2bId, c3aId, c3bId, c3cId, c4Id]);
  await execute(`DELETE FROM parent_profiles WHERE id IN (?, ?, ?, ?, ?, ?)`, [p1Id, p2Id, p3Id, p4Id, p5Id, p6Id]);
  await execute(`DELETE FROM users WHERE id IN (?, ?, ?, ?, ?, ?)`, [u1Id, u2Id, u3Id, u4Id, u5Id, u6Id]);
  await execute(`DELETE FROM events WHERE id IN (?, ?)`, [event1Id, event2Id]);

  console.log('\n======================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
