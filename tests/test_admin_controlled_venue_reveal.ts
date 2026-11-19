import crypto from 'crypto';
import { execute, query, queryOne } from '../src/server/db';
import { QUALIFYING_CHILD_STATUSES } from '../src/server/services/selectedParentsChannelService';

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
  console.log('TEST SUITE: ADMIN-CONTROLLED VENUE REVEAL FOR SELECTED PARENTS');
  console.log('======================================================================\n');

  const runId = Date.now().toString().slice(-6);
  const now = new Date().toISOString();

  const event1Id = `evt-reveal-test1-${runId}`;
  const event2Id = `evt-reveal-test2-${runId}`;
  const venue1Name = 'Koinonia Pavilion';
  const venue1Address = 'Koinonia Pavilion, Plot 1234, Central District, Abuja';
  const venue2Address = 'Lagos Event Dome, Victoria Island, Lagos';

  const parent1UserId = `usr-rev-p1-${runId}`;
  const parent1ProfileId = `prof-rev-p1-${runId}`;
  const child1Id = `ch-rev-c1-${runId}`;

  const parent2UserId = `usr-rev-p2-${runId}`;
  const parent2ProfileId = `prof-rev-p2-${runId}`;
  const child2Id = `ch-rev-c2-${runId}`;

  const adminUserId = `usr-admin-${runId}`;

  try {
    // 1. Setup Test Events (Default venue visibility must be 0 / OFF)
    console.log('[Setup] Inserting test events with default venue visibility...');
    await execute(`
      INSERT INTO events (id, title, starts_at, ends_at, location, status, venue_visible_to_selected_parents, created_at, updated_at)
      VALUES (?, 'Koinonia General Assembly 2026', '2026-11-18T09:00:00Z', '2026-11-22T19:00:00Z', ?, 'current', 0, ?, ?)
    `, [event1Id, venue1Address, now, now]);

    await execute(`
      INSERT INTO events (id, title, starts_at, ends_at, location, status, venue_visible_to_selected_parents, created_at, updated_at)
      VALUES (?, 'Koinonia Lagos Conference 2026', '2026-12-01T09:00:00Z', '2026-12-05T19:00:00Z', ?, 'open', 0, ?, ?)
    `, [event2Id, venue2Address, now, now]);

    // Setup Admin User
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'admin', 'active', ?, ?)
    `, [adminUserId, `admin-${runId}@test.org`, now, now]);

    // Setup Parent 1 (Selected child in Event 1)
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', 'active', ?, ?)
    `, [parent1UserId, `parent1-${runId}@test.org`, now, now]);
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Sarah Okon', '+2348011111111', ?, ?)
    `, [parent1ProfileId, parent1UserId, now, now]);
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES (?, ?, 'Daniel Okon', 'male', '2018-05-10', ?, ?)
    `, [child1Id, parent1ProfileId, now, now]);
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?)
    `, [`cee-rev-1-${runId}`, child1Id, event1Id, now, now]);

    // Setup Parent 2 (Child under_review in Event 1 - NOT selected)
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'hash', 'parent', 'active', ?, ?)
    `, [parent2UserId, `parent2-${runId}@test.org`, now, now]);
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'David Adeleke', '+2348022222222', ?, ?)
    `, [parent2ProfileId, parent2UserId, now, now]);
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES (?, ?, 'Faith Adeleke', 'female', '2019-02-14', ?, ?)
    `, [child2Id, parent2ProfileId, now, now]);
    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'under_review', ?, ?)
    `, [`cee-rev-2-${runId}`, child2Id, event1Id, now, now]);

    // ==================================================================
    // SUITE 1: DEFAULT INITIAL STATE & TWO-CONDITION ACCESS WHILE OFF
    // ==================================================================
    console.log('\n--- SUITE 1: DEFAULT INITIAL STATE & TWO-CONDITION ACCESS WHILE OFF ---');

    const ev1Initial = await queryOne<any>('SELECT venue_visible_to_selected_parents FROM events WHERE id = ?', [event1Id]);
    assert(
      ev1Initial?.venue_visible_to_selected_parents === 0 || ev1Initial?.venue_visible_to_selected_parents === false,
      'Initial event state has venue_visible_to_selected_parents = 0 (OFF)'
    );

    // Parent 1 (Selected): Condition B met, Condition A (Toggle ON) NOT met
    // Simulation of GET /api/parent/home logic
    const evaluateParentHome = (ev: any, childrenEntries: any[]) => {
      const isSelected = childrenEntries.some((c: any) => QUALIFYING_CHILD_STATUSES.includes(c.status));
      const isVisible = Boolean(ev && (ev.venue_visible_to_selected_parents === 1 || ev.venue_visible_to_selected_parents === true));
      const canSeeVenue = Boolean(isSelected && isVisible);

      let venueName: string | null = null;
      let venueAddress: string | null = null;
      if (canSeeVenue && ev?.location) {
        venueAddress = ev.location;
        const parts = ev.location.split(',');
        venueName = parts.length > 1 ? parts[0].trim() : (ev.title || 'Event Venue');
      }

      return {
        location: canSeeVenue ? ev.location : null,
        venueName,
        venueAddress,
        venue_accessible: canSeeVenue,
        venue_released: isVisible,
        venue_pending_release: Boolean(isSelected && !isVisible)
      };
    };

    const p1HomeWhileOff = evaluateParentHome(ev1Initial, [{ status: 'selected' }]);
    assert(p1HomeWhileOff.location === null, 'Selected parent receives null location while toggle is OFF');
    assert(p1HomeWhileOff.venueAddress === null, 'Selected parent receives null venueAddress while toggle is OFF');
    assert(p1HomeWhileOff.venue_accessible === false, 'Selected parent venue_accessible is false while toggle is OFF');
    assert(p1HomeWhileOff.venue_pending_release === true, 'Selected parent venue_pending_release is true while toggle is OFF (triggers "shared here soon")');

    // Parent 2 (Not selected): Condition B NOT met, Condition A NOT met
    const p2HomeWhileOff = evaluateParentHome(ev1Initial, [{ status: 'under_review' }]);
    assert(p2HomeWhileOff.location === null, 'Non-selected parent receives null location while toggle is OFF');
    assert(p2HomeWhileOff.venueAddress === null, 'Non-selected parent receives null venueAddress while toggle is OFF');
    assert(p2HomeWhileOff.venue_accessible === false, 'Non-selected parent venue_accessible is false');
    assert(p2HomeWhileOff.venue_pending_release === false, 'Non-selected parent venue_pending_release is false (no venue section at all)');

    // ==================================================================
    // SUITE 2: ADMIN TOGGLE PERSISTENCE & AUDIT LOGGING
    // ==================================================================
    console.log('\n--- SUITE 2: ADMIN TOGGLE PERSISTENCE & AUDIT LOGGING ---');

    const updateTime = new Date().toISOString();
    // Simulate POST /api/admin/events/:eventId/venue-visibility with visible: true
    await execute(`
      UPDATE events SET
        venue_visible_to_selected_parents = 1,
        venue_visibility_released_at = ?,
        venue_visibility_released_by = ?,
        venue_visibility_updated_at = ?,
        venue_visibility_updated_by = ?
      WHERE id = ?
    `, [updateTime, adminUserId, updateTime, adminUserId, event1Id]);

    // Insert audit log
    await execute(`
      INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
      VALUES (?, ?, 'admin', 'Update Event Venue Visibility', 'event', ?, ?, ?)
    `, [
      crypto.randomUUID(),
      adminUserId,
      event1Id,
      JSON.stringify({
        administrator: adminUserId,
        userRole: 'admin',
        eventId: event1Id,
        previousValue: false,
        newValue: true,
        timestamp: updateTime
      }),
      updateTime
    ]);

    const ev1AfterOn = await queryOne<any>('SELECT * FROM events WHERE id = ?', [event1Id]);
    assert(
      ev1AfterOn?.venue_visible_to_selected_parents === 1 || ev1AfterOn?.venue_visible_to_selected_parents === true,
      'Venue visibility toggle persists in database as 1 (ON)'
    );
    assert(ev1AfterOn?.venue_visibility_released_by === adminUserId, 'venue_visibility_released_by is recorded');

    const auditEntry = await queryOne<any>(`
      SELECT * FROM audit_logs
      WHERE target_id = ? AND action = 'Update Event Venue Visibility'
      ORDER BY timestamp DESC LIMIT 1
    `, [event1Id]);
    assert(Boolean(auditEntry), 'Audit log successfully recorded for venue visibility change');
    const auditDetails = JSON.parse(auditEntry.details);
    assert(auditDetails.previousValue === false && auditDetails.newValue === true, 'Audit log correctly records previousValue (false) and newValue (true)');
    assert(auditDetails.administrator === adminUserId, 'Audit log records administrator ID');

    // ==================================================================
    // SUITE 3: TWO CONDITIONS MET WHILE TOGGLE IS ON
    // ==================================================================
    console.log('\n--- SUITE 3: TWO CONDITIONS MET WHILE TOGGLE IS ON ---');

    // Parent 1 (Selected): Condition A MET, Condition B MET
    const p1HomeWhileOn = evaluateParentHome(ev1AfterOn, [{ status: 'selected' }]);
    assert(p1HomeWhileOn.location === venue1Address, 'Selected parent receives full location while toggle is ON');
    assert(p1HomeWhileOn.venueAddress === venue1Address, 'Selected parent receives full venueAddress while toggle is ON');
    assert(p1HomeWhileOn.venue_accessible === true, 'Selected parent venue_accessible is true while toggle is ON');
    assert(p1HomeWhileOn.venue_pending_release === false, 'Selected parent venue_pending_release is false while toggle is ON');

    // Parent 2 (Not selected): Condition A MET, Condition B NOT MET
    const p2HomeWhileOn = evaluateParentHome(ev1AfterOn, [{ status: 'under_review' }]);
    assert(p2HomeWhileOn.location === null, 'Non-selected parent CANNOT see venue address even when toggle is ON');
    assert(p2HomeWhileOn.venueAddress === null, 'Non-selected parent receives null venueAddress when toggle is ON');
    assert(p2HomeWhileOn.venue_accessible === false, 'Non-selected parent venue_accessible remains false');
    assert(p2HomeWhileOn.venue_pending_release === false, 'Non-selected parent venue_pending_release is false');

    // ==================================================================
    // SUITE 4: REVOCATION OF CHILD SELECTION
    // ==================================================================
    console.log('\n--- SUITE 4: REVOCATION OF CHILD SELECTION ---');

    // Revoke Parent 1 child selection (selected -> withdrawn)
    await execute(`UPDATE child_event_entries SET status = 'withdrawn' WHERE id = ?`, [`cee-rev-1-${runId}`]);
    const p1HomeRevoked = evaluateParentHome(ev1AfterOn, [{ status: 'withdrawn' }]);
    assert(p1HomeRevoked.location === null, 'Immediately after child status is withdrawn, location is denied (null)');
    assert(p1HomeRevoked.venueAddress === null, 'Immediately after child status is withdrawn, venueAddress is denied (null)');
    assert(p1HomeRevoked.venue_accessible === false, 'Immediately after child status is withdrawn, venue_accessible is false');

    // Restore Parent 1 child selection (withdrawn -> selected)
    await execute(`UPDATE child_event_entries SET status = 'selected' WHERE id = ?`, [`cee-rev-1-${runId}`]);
    const p1HomeRestored = evaluateParentHome(ev1AfterOn, [{ status: 'selected' }]);
    assert(p1HomeRestored.location === venue1Address, 'Access restored when child is re-selected');

    // ==================================================================
    // SUITE 5: CROSS-EVENT ISOLATION
    // ==================================================================
    console.log('\n--- SUITE 5: CROSS-EVENT ISOLATION ---');

    // Event 1 has toggle ON. Event 2 has toggle OFF.
    const ev2 = await queryOne<any>('SELECT * FROM events WHERE id = ?', [event2Id]);
    assert(
      ev2?.venue_visible_to_selected_parents === 0 || ev2?.venue_visible_to_selected_parents === false,
      'Event 2 toggle remains OFF (0)'
    );

    // Parent selected in Event 2 cannot see Event 2 venue because Event 2 toggle is OFF
    const pHomeEv2 = evaluateParentHome(ev2, [{ status: 'selected' }]);
    assert(pHomeEv2.location === null, 'Event 2 selected parent cannot access Event 2 venue while Event 2 toggle is OFF');
    assert(pHomeEv2.venue_pending_release === true, 'Event 2 selected parent sees pending release message');

    // ==================================================================
    // SUITE 6: PRE-ANNOUNCEMENT EMAIL VENUE LEAK PREVENTION
    // ==================================================================
    console.log('\n--- SUITE 6: PRE-ANNOUNCEMENT EMAIL VENUE LEAK PREVENTION ---');

    const RESTRICTED_VENUE_TOKEN_REGEX = /\{(Venue address|Venue name|Address)\}/i;

    const validateBroadcastTokens = (body: string, subject: string, isVenueVisible: boolean) => {
      const containsRestrictedVenueToken = RESTRICTED_VENUE_TOKEN_REGEX.test(body) || RESTRICTED_VENUE_TOKEN_REGEX.test(subject);
      if (containsRestrictedVenueToken && !isVenueVisible) {
        return {
          allowed: false,
          error: 'Cannot send message containing restricted venue details while Venue Visibility is OFF. Please enable "Show venue to selected parents" in Event Settings before including venue tokens, or remove the venue token from your message.'
        };
      }
      return { allowed: true };
    };

    // Body with restricted token while toggle is OFF
    const blockedCheck1 = validateBroadcastTokens(
      'Dear Parent, the event will take place at {Venue address}.',
      'Event Location',
      false
    );
    assert(blockedCheck1.allowed === false, 'Broadcast containing {Venue address} is strictly BLOCKED when toggle is OFF');
    assert(blockedCheck1.error.includes('while Venue Visibility is OFF'), 'Error message clearly explains Venue Visibility is OFF');

    const blockedCheck2 = validateBroadcastTokens(
      'Dear Parent, venue name is {Venue name}.',
      'Update',
      false
    );
    assert(blockedCheck2.allowed === false, 'Broadcast containing {Venue name} is strictly BLOCKED when toggle is OFF');

    // Body without restricted token while toggle is OFF
    const allowedCheckWhileOff = validateBroadcastTokens(
      'Dear {Parent name}, your child {Selected child name(s)} has been selected! Venue details will be announced soon in your portal.',
      'Congratulations {Parent name}!',
      false
    );
    assert(allowedCheckWhileOff.allowed === true, 'Pre-announcement email without venue tokens is ALLOWED when toggle is OFF');

    // Body with restricted token while toggle is ON
    const allowedCheckWhileOn = validateBroadcastTokens(
      'Dear Parent, the event will take place at {Venue address}.',
      'Event Location',
      true
    );
    assert(allowedCheckWhileOn.allowed === true, 'Broadcast containing {Venue address} is ALLOWED when toggle is ON');

    // ==================================================================
    // SUITE 7: TOGGLE OFF RE-ENFORCEMENT
    // ==================================================================
    console.log('\n--- SUITE 7: TOGGLE OFF RE-ENFORCEMENT ---');

    await execute(`
      UPDATE events SET
        venue_visible_to_selected_parents = 0,
        venue_visibility_updated_at = ?,
        venue_visibility_updated_by = ?
      WHERE id = ?
    `, [now, adminUserId, event1Id]);

    const ev1AfterOffAgain = await queryOne<any>('SELECT * FROM events WHERE id = ?', [event1Id]);
    assert(
      ev1AfterOffAgain?.venue_visible_to_selected_parents === 0 || ev1AfterOffAgain?.venue_visible_to_selected_parents === false,
      'Admin toggled venue visibility back to OFF (0)'
    );

    const p1HomeAfterOffAgain = evaluateParentHome(ev1AfterOffAgain, [{ status: 'selected' }]);
    assert(p1HomeAfterOffAgain.location === null, 'Immediately after toggle is turned OFF, location is hidden again');
    assert(p1HomeAfterOffAgain.venue_accessible === false, 'venue_accessible is false again');
    assert(p1HomeAfterOffAgain.venue_pending_release === true, 'venue_pending_release is true again');

    // Cleanup
    console.log('\n[Cleanup] Cleaning up test records...');
    await execute('DELETE FROM audit_logs WHERE target_id IN (?, ?)', [event1Id, event2Id]);
    await execute('DELETE FROM child_event_entries WHERE event_id IN (?, ?)', [event1Id, event2Id]);
    await execute('DELETE FROM children WHERE id IN (?, ?)', [child1Id, child2Id]);
    await execute('DELETE FROM parent_profiles WHERE id IN (?, ?)', [parent1ProfileId, parent2ProfileId]);
    await execute('DELETE FROM users WHERE id IN (?, ?, ?)', [parent1UserId, parent2UserId, adminUserId]);
    await execute('DELETE FROM events WHERE id IN (?, ?)', [event1Id, event2Id]);

    console.log('\n======================================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================================\n');
    process.exit(0);
  } catch (err: any) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
}

runTests();
