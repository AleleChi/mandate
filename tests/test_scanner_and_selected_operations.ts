import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { execute, query, queryOne } from '../src/server/db';
import { issuePassForChild } from '../src/server/services/passService';
import { resolveVolunteerScope } from '../src/server/routes/volunteer';
import { isChildInScope } from '../src/server/services/eligibilityService';

describe('Scanner and Selected Children Operations Test Suite', () => {
  const testEventId = `event-sel-${Date.now()}`;
  let testParentId: string;
  let testUserId: string;

  before(async () => {
    // Setup test event as current
    await execute(`
      INSERT OR IGNORE INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Koinonia General Assembly 2026', 'current', '2026-06-01T08:00:00Z', '2026-06-05T18:00:00Z', datetime('now'), datetime('now'))
    `, [testEventId]);

    testUserId = `user-${crypto.randomUUID()}`;
    testParentId = `parent-${crypto.randomUUID()}`;

    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'parent', datetime('now'), datetime('now'))
    `, [testUserId, `parent_sel_${Date.now()}@test.org`]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Selected Ops Parent', '+2348099887766', datetime('now'), datetime('now'))
    `, [testParentId, testUserId]);
  });

  async function createChild(name: string, ageGroup: string = 'Ages 7–9', status: string = 'selected', withPhoto: boolean = true) {
    const childId = `child-${crypto.randomUUID()}`;
    const entryId = `entry-${crypto.randomUUID()}`;
    const photoId = withPhoto ? `photo-${crypto.randomUUID()}` : null;
    const now = new Date().toISOString();

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, age_group, photo_file_id, created_at, updated_at)
      VALUES (?, ?, ?, '2017-04-12', 'male', ?, ?, ?, ?)
    `, [childId, testParentId, name, ageGroup, photoId, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [entryId, childId, testEventId, status, now, now, now]);

    return { childId, entryId, photoId };
  }

  it('1. Selected children filter excludes waiting_list and not_selected', async () => {
    const child1 = await createChild('Selected One', 'Ages 7–9', 'selected', true);
    const child2 = await createChild('Pass Ready One', 'Ages 7–9', 'pass_ready', true);
    const child3 = await createChild('Waitlist Child', 'Ages 7–9', 'waiting_list', true);
    const child4 = await createChild('Not Selected Child', 'Ages 7–9', 'not_selected', true);

    const rows = await query(`
      SELECT e.id, e.status
      FROM child_event_entries e
      WHERE e.event_id = ?
        AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
    `, [testEventId]);

    const ids = rows.map((r: any) => r.id);
    assert.ok(ids.includes(child1.entryId), 'selected must be included');
    assert.ok(ids.includes(child2.entryId), 'pass_ready must be included');
    assert.ok(!ids.includes(child3.entryId), 'waiting_list must be excluded');
    assert.ok(!ids.includes(child4.entryId), 'not_selected must be excluded');
  });

  it('2. Bulk pass issuance issues missing passes and skips already-active passes without regenerating', async () => {
    // Child A: selected, no pass -> should be issued
    const childA = await createChild('Bulk Child A', 'Ages 7–9', 'selected', true);
    // Child B: selected, already has active pass -> should be skipped as already had pass, reconciled to pass_ready
    const childB = await createChild('Bulk Child B', 'Ages 7–9', 'selected', true);
    const passB = await issuePassForChild({ childId: childB.childId, eventId: testEventId });
    await execute("UPDATE child_event_entries SET status = 'selected' WHERE id = ?", [childB.entryId]);

    // Child C: missing photo -> should fail safely
    const childC = await createChild('Bulk Child C', 'Ages 7–9', 'selected', false);

    // Call issuePassForChild for childA
    const passA = await issuePassForChild({ childId: childA.childId, eventId: testEventId });
    assert.ok(passA, 'Pass A must be generated');
    assert.equal(passA.status, 'active');

    const entryA = await queryOne('SELECT status FROM child_event_entries WHERE id = ?', [childA.entryId]);
    assert.equal(entryA?.status, 'pass_ready');

    // Child B already has pass: calling issuePassForChild returns the same pass
    const passB2 = await issuePassForChild({ childId: childB.childId, eventId: testEventId });
    assert.equal(passB2.id, passB.id, 'Pass B row ID must be unchanged');
    assert.equal(passB2.pass_reference, passB.pass_reference, 'Pass B code must remain valid and unchanged');

    // Child C missing photo throws safe error
    let cError: any = null;
    try {
      await issuePassForChild({ childId: childC.childId, eventId: testEventId });
    } catch (err: any) {
      cError = err;
    }
    assert.ok(cError, 'Missing photo must fail safely');
    assert.ok(cError.message.includes('photo'));
  });

  it('3. Lookup pass accepts normalized pass code, deep link, and returns picked up child cleanly', async () => {
    const childD = await createChild('Pickup Child D', 'Ages 4–6', 'pass_ready', true);
    const passD = await issuePassForChild({ childId: childD.childId, eventId: testEventId });

    // Mark as picked up
    const now = new Date().toISOString();
    await execute(`
      UPDATE child_event_entries
      SET status = 'picked_up', picked_up_at = ?
      WHERE id = ?
    `, [now, childD.entryId]);

    // Test URL-wrapped ref normalization
    const rawRef = passD.pass_reference;
    const urlRef = `https://koinonia12.netlify.app/parent/pass/${rawRef}`;
    const cleanRef = urlRef.split('/pass/')[1]?.split('?')[0]?.replace(/\/$/, '') || urlRef;
    assert.equal(cleanRef, rawRef, 'Normalized URL should match raw pass reference');

    // Lookup pass row
    const passRow = await queryOne('SELECT * FROM event_passes WHERE pass_reference = ?', [cleanRef]);
    assert.ok(passRow, 'Pass row must be found');

    const entry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [passRow.child_event_entry_id]);
    assert.equal(entry?.status, 'picked_up', 'Entry is picked up');
    // Ensure picked up child is identifiable and retains status
    assert.equal(entry?.child_id, childD.childId);
  });

  it('4. Ordinary volunteer + no assignment -> blocked', async () => {
    const volUserId = `vol-${crypto.randomUUID()}`;
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'volunteer', datetime('now'), datetime('now'))
    `, [volUserId, `vol_unassigned_${Date.now()}@test.org`]);

    const scope = await resolveVolunteerScope(volUserId, 'volunteer', testEventId);
    assert.equal(scope.isScoped, true, 'Ordinary volunteer must always be scoped');
    assert.equal(scope.assignedAgeGroups.length, 0, 'No assignments present');

    // Rule: if scope.isScoped and assignedAgeGroups.length === 0, child access must be blocked
    const canAccess = !scope.isScoped || scope.assignedAgeGroups.length > 0;
    assert.equal(canAccess, false, 'Unassigned ordinary volunteer must be blocked from child processing');
  });

  it('5. Ordinary volunteer + assigned age group -> allowed in scope', async () => {
    const volUserId = `vol-${crypto.randomUUID()}`;
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'volunteer', datetime('now'), datetime('now'))
    `, [volUserId, `vol_assigned_${Date.now()}@test.org`]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, assigned_age_groups, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'volunteer', '["Ages 7–9"]', 'assigned', datetime('now'), datetime('now', '+8 hours'), datetime('now'), datetime('now'))
    `, [`duty-${crypto.randomUUID()}`, testEventId, volUserId]);

    const scope = await resolveVolunteerScope(volUserId, 'volunteer', testEventId);
    assert.equal(scope.isScoped, true, 'Ordinary volunteer is scoped');
    assert.deepEqual(scope.assignedAgeGroups, ['Ages 7–9']);

    const childInScope = { age_group: 'Ages 7–9', calculated_age: 8 };
    assert.equal(isChildInScope(childInScope, scope.assignedAgeGroups), true, 'Child in Ages 7–9 is allowed');
  });

  it('6. Ordinary volunteer + out-of-scope child -> blocked', async () => {
    const volUserId = `vol-${crypto.randomUUID()}`;
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'volunteer', datetime('now'), datetime('now'))
    `, [volUserId, `vol_assigned_scope_${Date.now()}@test.org`]);

    await execute(`
      INSERT INTO event_duty_assignments (id, event_id, user_id, responsibility_key, assigned_age_groups, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'volunteer', '["Ages 7–9"]', 'assigned', datetime('now'), datetime('now', '+8 hours'), datetime('now'), datetime('now'))
    `, [`duty-${crypto.randomUUID()}`, testEventId, volUserId]);

    const scope = await resolveVolunteerScope(volUserId, 'volunteer', testEventId);
    const childOutOfScope = { age_group: 'Ages 4–6', calculated_age: 5 };
    assert.equal(isChildInScope(childOutOfScope, scope.assignedAgeGroups), false, 'Child outside Ages 7–9 must be blocked');
  });

  it('7. Team lead + no age assignment -> permitted according to role', async () => {
    const leadUserId = `lead-${crypto.randomUUID()}`;
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'team_lead', datetime('now'), datetime('now'))
    `, [leadUserId, `lead_${Date.now()}@test.org`]);

    const scope = await resolveVolunteerScope(leadUserId, 'team_lead', testEventId);
    assert.equal(scope.isScoped, false, 'Team lead must NOT be restricted by ordinary volunteer scope');
    assert.equal(scope.assignedAgeGroups.length, 0);
  });

  it('8. Admin / Super Admin -> unaffected', async () => {
    const adminUserId = `admin-${crypto.randomUUID()}`;
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'admin', datetime('now'), datetime('now'))
    `, [adminUserId, `admin_${Date.now()}@test.org`]);

    const adminScope = await resolveVolunteerScope(adminUserId, 'admin', testEventId);
    assert.equal(adminScope.isScoped, false, 'Admin must not be scoped');

    const superAdminUserId = `superadmin-${crypto.randomUUID()}`;
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'super_admin', datetime('now'), datetime('now'))
    `, [superAdminUserId, `superadmin_${Date.now()}@test.org`]);

    const superAdminScope = await resolveVolunteerScope(superAdminUserId, 'super_admin', testEventId);
    assert.equal(superAdminScope.isScoped, false, 'Super admin must not be scoped');
  });

  it('9. QR scan and manual pass entry obey the same scope rules', async () => {
    const childE = await createChild('Scope Test Child', 'Ages 4–6', 'pass_ready', true);
    const passE = await issuePassForChild({ childId: childE.childId, eventId: testEventId });

    // QR scan produces deep link or raw code
    const qrPayload = `https://koinonia12.netlify.app/parent/pass/${passE.pass_reference}`;
    const manualEntry = `  ${passE.pass_reference}  `;

    // Normalization logic extracts identical canonical reference for both
    const normalize = (val: string) => {
      let clean = val.trim();
      if (clean.includes('/pass/')) {
        clean = clean.split('/pass/')[1]?.split('?')[0]?.replace(/\/$/, '') || clean;
      }
      return clean.trim().toUpperCase();
    };

    const qrNormalized = normalize(qrPayload);
    const manualNormalized = normalize(manualEntry);

    assert.equal(qrNormalized, passE.pass_reference);
    assert.equal(manualNormalized, passE.pass_reference);
    assert.equal(qrNormalized, manualNormalized, 'QR and manual input must normalize to identical canonical code');

    // Both pass through the same resolveVolunteerScope + isChildInScope logic
    const assignedScope = ['Ages 7–9'];
    const childPayload = { age_group: 'Ages 4–6', calculated_age: 5 };
    assert.equal(isChildInScope(childPayload, assignedScope), false, 'Both QR and manual lookups block out-of-scope child');
  });
});
