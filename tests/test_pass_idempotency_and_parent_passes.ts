import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { execute, query, queryOne } from '../src/server/db';
import { issuePassForChild, getPassesForParent, revokePassForChild, getPassForChild } from '../src/server/services/passService';

describe('Pass Idempotency, Approval Coherence, and Parent Passes Regression Suite', () => {
  const testEventId = `event-test-${Date.now()}`;
  let testParentId: string;
  let testUserId: string;

  before(async () => {
    // Setup test event
    await execute(`
      INSERT OR IGNORE INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Koinonia General Assembly 2026', 'current', '2026-06-01T08:00:00Z', '2026-06-05T18:00:00Z', datetime('now'), datetime('now'))
    `, [testEventId]);

    // Setup parent profile
    testUserId = `user-${crypto.randomUUID()}`;
    testParentId = `parent-${crypto.randomUUID()}`;

    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'parent', datetime('now'), datetime('now'))
    `, [testUserId, `parent_${Date.now()}@test.org`]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Test Parent Guardian', '+2348011223344', datetime('now'), datetime('now'))
    `, [testParentId, testUserId]);
  });

  async function createTestChildWithEntry(name: string, status: string = 'under_review', withPhoto: boolean = true) {
    const childId = `child-${crypto.randomUUID()}`;
    const entryId = `entry-${crypto.randomUUID()}`;
    const photoId = withPhoto ? `photo-${crypto.randomUUID()}` : null;
    const now = new Date().toISOString();

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, age_group, photo_file_id, created_at, updated_at)
      VALUES (?, ?, ?, '2016-05-10', 'female', '7-9', ?, ?, ?)
    `, [childId, testParentId, name, photoId, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [entryId, childId, testEventId, status, now, now, now]);

    return { childId, entryId, photoId };
  }

  it('Test A: First approval issues exactly 1 active pass and updates entry status to pass_ready', async () => {
    const { childId, entryId } = await createTestChildWithEntry('Bethertrade First', 'under_review', true);

    const pass = await issuePassForChild({ childId, eventId: testEventId });

    assert.ok(pass, 'Pass should be created');
    assert.equal(pass.child_event_entry_id, entryId);
    assert.equal(pass.status, 'active');
    assert.ok(pass.pass_reference.startsWith('KOI-2026-'));

    // Check entry status
    const entry = await queryOne('SELECT status FROM child_event_entries WHERE id = ?', [entryId]);
    assert.equal(entry?.status, 'pass_ready');

    // Check pass count in DB
    const passRows = await query('SELECT * FROM event_passes WHERE child_event_entry_id = ?', [entryId]);
    assert.equal(passRows.length, 1);

    // Parent Passes API verification
    const parentPasses = await getPassesForParent(testParentId, testEventId);
    const childPass = parentPasses.passes.find(p => p.childId === childId);
    assert.ok(childPass, 'Child pass should be listed in parent passes');
    assert.equal(childPass?.passCode, pass.pass_reference);
    assert.equal(childPass?.status, 'ready');
  });

  it('Test B: Approving the same child again returns the existing active pass without creating duplicates', async () => {
    const { childId, entryId } = await createTestChildWithEntry('Bethertrade Idempotent', 'under_review', true);

    const firstPass = await issuePassForChild({ childId, eventId: testEventId });
    const secondPass = await issuePassForChild({ childId, eventId: testEventId });

    assert.equal(firstPass.id, secondPass.id, 'Same pass row ID must be returned');
    assert.equal(firstPass.pass_reference, secondPass.pass_reference, 'Same pass reference must be returned');
    assert.equal(secondPass.status, 'active');

    // Verify exactly 1 pass row exists in database
    const passRows = await query('SELECT * FROM event_passes WHERE child_event_entry_id = ?', [entryId]);
    assert.equal(passRows.length, 1, 'Must still be exactly 1 event_passes row');
  });

  it('Test C: Previously revoked pass is reused with new reference and hash without creating a second row', async () => {
    const { childId, entryId } = await createTestChildWithEntry('Bethertrade Revoked', 'under_review', true);

    // 1. Issue initial pass
    const initialPass = await issuePassForChild({ childId, eventId: testEventId });
    assert.equal(initialPass.status, 'active');

    // 2. Revoke pass
    await revokePassForChild(childId, testEventId, 'Administrative test revocation');
    const revokedPass = await queryOne('SELECT * FROM event_passes WHERE id = ?', [initialPass.id]);
    assert.equal(revokedPass?.status, 'revoked');
    assert.ok(revokedPass?.revoked_at);

    // 3. Reissue / approve again
    const reissuedPass = await issuePassForChild({ childId, eventId: testEventId });

    assert.equal(reissuedPass.id, initialPass.id, 'Must reuse the exact same database row ID');
    assert.equal(reissuedPass.status, 'active', 'Reissued pass must have status active');
    assert.equal(reissuedPass.revoked_at, null, 'revoked_at must be cleared to NULL');
    assert.notEqual(reissuedPass.pass_reference, initialPass.pass_reference, 'Must generate a fresh pass_reference');
    assert.notEqual(reissuedPass.pass_hash, initialPass.pass_hash, 'Must generate a fresh pass_hash');

    // Verify exactly 1 pass row exists in database for this entry
    const passRows = await query('SELECT * FROM event_passes WHERE child_event_entry_id = ?', [entryId]);
    assert.equal(passRows.length, 1, 'Only one pass row must exist for child_event_entry_id');

    // Verify entry is pass_ready
    const entry = await queryOne('SELECT status FROM child_event_entries WHERE id = ?', [entryId]);
    assert.equal(entry?.status, 'pass_ready');
  });

  it('Test D: Waiting list child does not receive pass and is not returned as active pass', async () => {
    const { childId, entryId } = await createTestChildWithEntry('Bethertrade Waitlist', 'waiting_list', true);

    const parentPasses = await getPassesForParent(testParentId, testEventId);
    const childPass = parentPasses.passes.find(p => p.childId === childId);
    assert.equal(childPass, undefined, 'Waiting list child must not have an active pass');

    const pendingPass = parentPasses.pending.find(p => p.childId === childId);
    assert.equal(pendingPass, undefined, 'Waiting list child must not be in pending passes list');
  });

  it('Test E: Checked-in child retains checked_in status on re-issuance without status regression', async () => {
    const { childId, entryId } = await createTestChildWithEntry('Bethertrade CheckedIn', 'under_review', true);

    await issuePassForChild({ childId, eventId: testEventId });

    // Mark as checked in
    const now = new Date().toISOString();
    await execute(`
      UPDATE child_event_entries
      SET status = 'checked_in', checked_in_at = ?
      WHERE id = ?
    `, [now, entryId]);

    // Re-issue pass
    const pass = await issuePassForChild({ childId, eventId: testEventId });
    assert.ok(pass);

    // Verify status did NOT regress to pass_ready
    const entry = await queryOne('SELECT status FROM child_event_entries WHERE id = ?', [entryId]);
    assert.equal(entry?.status, 'checked_in', 'Checked-in status must not regress to pass_ready');
  });

  it('Test F: Picked-up child retains picked_up status on re-issuance without status regression', async () => {
    const { childId, entryId } = await createTestChildWithEntry('Bethertrade PickedUp', 'under_review', true);

    await issuePassForChild({ childId, eventId: testEventId });

    // Mark as picked up
    const now = new Date().toISOString();
    await execute(`
      UPDATE child_event_entries
      SET status = 'picked_up', picked_up_at = ?
      WHERE id = ?
    `, [now, entryId]);

    // Re-issue pass
    const pass = await issuePassForChild({ childId, eventId: testEventId });
    assert.ok(pass);

    // Verify status did NOT regress to pass_ready
    const entry = await queryOne('SELECT status FROM child_event_entries WHERE id = ?', [entryId]);
    assert.equal(entry?.status, 'picked_up', 'Picked-up status must not regress to pass_ready');
  });

  it('Test G: Targeted assertion: Re-issuing pass with an inactive row never causes unique constraint violation', async () => {
    const { childId, entryId } = await createTestChildWithEntry('Bethertrade ConstraintTest', 'under_review', true);

    // Directly insert an inactive/revoked pass simulating existing historical record
    const historicalPassId = `pass-hist-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, revoked_at, issued_at, created_at, updated_at)
      VALUES (?, ?, 'KOI-2026-OLDREF', 'oldhash', 'revoked', ?, ?, ?, ?)
    `, [historicalPassId, entryId, now, now, now, now]);

    // Call issuePassForChild - should NOT throw unique constraint error or 23505
    let error: any = null;
    let pass: any = null;
    try {
      pass = await issuePassForChild({ childId, eventId: testEventId });
    } catch (err) {
      error = err;
    }

    assert.equal(error, null, 'Must not throw unique constraint error');
    assert.ok(pass, 'Pass should be successfully issued/reactivated');
    assert.equal(pass.id, historicalPassId, 'Must reuse the existing pass row');
    assert.equal(pass.status, 'active');

    // Confirm DB has strictly 1 pass row
    const countRow = await queryOne('SELECT count(*) as cnt FROM event_passes WHERE child_event_entry_id = ?', [entryId]);
    assert.equal(Number(countRow?.cnt), 1, 'Database must have maximum one pass row per child_event_entry_id');
  });

  it('Test H: Fails safely when required child photo is missing without creating orphaned pass', async () => {
    const { childId, entryId } = await createTestChildWithEntry('Bethertrade NoPhoto', 'under_review', false);

    let error: any = null;
    try {
      await issuePassForChild({ childId, eventId: testEventId });
    } catch (err: any) {
      error = err;
    }

    assert.ok(error, 'Should throw error when photo is missing');
    assert.ok(error.message.includes('Missing required child photo'));

    // Verify no pass was inserted
    const passRows = await query('SELECT * FROM event_passes WHERE child_event_entry_id = ?', [entryId]);
    assert.equal(passRows.length, 0, 'No pass row should exist');

    // Entry status should remain under_review
    const entry = await queryOne('SELECT status FROM child_event_entries WHERE id = ?', [entryId]);
    assert.equal(entry?.status, 'under_review');
  });

  it('Test I: Event-specific lookup prevents activating pass for wrong event', async () => {
    const otherEventId = `event-other-${Date.now()}`;
    await execute(`
      INSERT OR IGNORE INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Other Event', 'draft', '2027-01-01T08:00:00Z', '2027-01-05T18:00:00Z', datetime('now'), datetime('now'))
    `, [otherEventId]);

    const { childId } = await createTestChildWithEntry('Bethertrade MultiEvent', 'under_review', true);

    // Call with specific non-existent event for this child
    let error: any = null;
    try {
      await issuePassForChild({ childId, eventId: otherEventId });
    } catch (err: any) {
      error = err;
    }

    assert.ok(error, 'Must throw when child is not registered for specified event');
    assert.ok(error.message.includes('Child event registration not found'));
  });
});
