import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { execute, query, queryOne } from '../src/server/db';
import {
  issuePassForChild,
  getPassesForParent,
  revokePassForChild,
  getPassForChild,
  validatePassForScan
} from '../src/server/services/passService';
import { resolveCanonicalAgeGroup, CANONICAL_GA_EVENT_DATE } from '../src/server/services/eligibilityService';

describe('Admin Pass Retrieval, Print Parity, and Scanner Invariants Test Suite', () => {
  const testEventId = `ev-pass-parity-${Date.now()}`;
  let testParentId: string;
  let testUserId: string;

  before(async () => {
    // 1. Setup isolated test event
    await execute(`
      INSERT OR IGNORE INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'The General Assembly 2026', 'current', '2026-11-21T08:00:00Z', '2026-11-22T18:00:00Z', datetime('now'), datetime('now'))
    `, [testEventId]);

    // 2. Setup isolated test parent profile
    testUserId = `usr-${crypto.randomUUID()}`;
    testParentId = `prnt-${crypto.randomUUID()}`;

    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'parent', datetime('now'), datetime('now'))
    `, [testUserId, `parent_${Date.now()}@paritytest.org`]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Faithful Guardian', '+2348099887766', datetime('now'), datetime('now'))
    `, [testParentId, testUserId]);
  });

  after(async () => {
    // Clean up test data
    try {
      await execute(`DELETE FROM event_passes WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id = ?)`, [testEventId]);
      await execute(`DELETE FROM pickup_people WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id = ?)`, [testEventId]);
      await execute(`DELETE FROM attendance_records WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id = ?)`, [testEventId]);
      await execute(`DELETE FROM child_event_entries WHERE event_id = ?`, [testEventId]);
      await execute(`DELETE FROM children WHERE parent_profile_id = ?`, [testParentId]);
      await execute(`DELETE FROM parent_profiles WHERE id = ?`, [testParentId]);
      await execute(`DELETE FROM users WHERE id = ?`, [testUserId]);
      await execute(`DELETE FROM events WHERE id = ?`, [testEventId]);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  async function createFixtureChild(name: string, dob: string = '2012-04-15') {
    const childId = `ch-${crypto.randomUUID()}`;
    const entryId = `entry-${crypto.randomUUID()}`;
    const photoId = `photo-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, age_group, photo_file_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'female', '13–14', ?, ?, ?)
    `, [childId, testParentId, name, dob, photoId, now, now]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, 'selected', ?, ?, ?)
    `, [entryId, childId, testEventId, now, now, now]);

    await execute(`
      INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, created_at, updated_at)
      VALUES (?, ?, 'parent', 'Faithful Guardian', 'Mother', '+2348099887766', ?, ?)
    `, [`pk-${crypto.randomUUID()}`, entryId, now, now]);

    return { childId, entryId, photoId };
  }

  // Canonical Admin Pass Retrieval Resolver (Simulates GET /api/admin/children/:childId/pass)
  async function resolveAdminPass(childId: string, eventId: string) {
    const entry = await queryOne(
      'SELECT * FROM child_event_entries WHERE (child_id = ? OR id = ?) AND event_id = ?',
      [childId, childId, eventId]
    );
    if (!entry) return null;

    const child = await queryOne('SELECT * FROM children WHERE id = ?', [entry.child_id]);
    const event = await queryOne('SELECT id, title, starts_at, ends_at FROM events WHERE id = ?', [entry.event_id]);
    const pass = await queryOne(
      'SELECT * FROM event_passes WHERE child_event_entry_id = ? AND status = ?',
      [entry.id, 'active']
    );

    const eventDate = event?.starts_at ? new Date(event.starts_at) : CANONICAL_GA_EVENT_DATE;
    const ageRes = child?.date_of_birth ? resolveCanonicalAgeGroup(child.date_of_birth, eventDate) : null;
    const age = ageRes?.age ?? (child?.age ? Number(child.age) : null);
    const ageGroup = ageRes?.label || child?.age_group || 'Ages 2–14';

    const photoUrl = child?.photo_file_id ? `/api/media/files/${child.photo_file_id}` : null;
    const parentProfile = child?.parent_profile_id
      ? await queryOne('SELECT full_name, phone_number FROM parent_profiles WHERE id = ?', [child.parent_profile_id])
      : null;
    const pickupPerson = await queryOne(
      'SELECT * FROM pickup_people WHERE child_event_entry_id = ?',
      [entry.id]
    );

    const pickupName = pickupPerson?.pickup_type === 'other_person'
      ? (pickupPerson.full_name || pickupPerson.pickup_person_full_name || null)
      : (parentProfile?.full_name || null);
    const pickupRelation = pickupPerson?.pickup_type === 'other_person'
      ? (pickupPerson.relationship_to_child || pickupPerson.relationship || 'Authorized adult')
      : 'Parent';

    return {
      success: true,
      entryStatus: entry.status,
      childId: entry.child_id,
      childEventEntryId: entry.id,
      childName: child?.full_name || 'Child',
      photoUrl,
      age,
      ageGroup,
      parentName: parentProfile?.full_name || null,
      parentPhone: parentProfile?.phone_number || null,
      pickupName: pickupPerson?.pickup_type === 'other_person' ? pickupPerson.pickup_person_full_name : (parentProfile?.full_name || null),
      pickupRelation: pickupPerson?.pickup_type === 'other_person' ? pickupPerson.relationship : 'Parent',
      event: event ? {
        id: event.id,
        title: event.title,
        startsAt: event.starts_at,
        endsAt: event.ends_at
      } : null,
      pass: pass ? {
        id: pass.id,
        passReference: pass.pass_reference,
        qrPayload: pass.pass_reference,
        status: pass.status,
        issuedAt: pass.issued_at
      } : null
    };
  }

  // Canonical Admin Batch Pass Retrieval Resolver (Simulates POST /api/admin/children/passes/printable)
  async function resolveAdminBatchPasses(childIds: string[], eventId: string) {
    const passes = [];
    for (const id of childIds) {
      const single = await resolveAdminPass(id, eventId);
      if (single) passes.push(single);
    }
    return { success: true, count: passes.length, passes };
  }

  it('Test A: Parent and Admin QR payload identical', async () => {
    const { childId, entryId } = await createFixtureChild('Bethertrade Parity A');
    const canonicalPass = await issuePassForChild({ childId, eventId: testEventId });

    // Retrieve via Parent service
    const parentPasses = await getPassesForParent(testParentId, testEventId);
    const parentPass = parentPasses.passes.find(p => p.childId === childId);
    assert.ok(parentPass, 'Parent pass should exist');

    // Retrieve via Admin service
    const adminPass = await resolveAdminPass(childId, testEventId);
    assert.ok(adminPass?.pass, 'Admin pass should exist');

    assert.equal(
      adminPass.pass.qrPayload,
      parentPass.qrPayload,
      'Admin qrPayload and Parent qrPayload must be IDENTICAL'
    );
    assert.equal(
      adminPass.pass.qrPayload,
      canonicalPass.pass_reference,
      'QR payload must match canonical pass_reference in database'
    );
  });

  it('Test B: Parent and Admin pass reference identical', async () => {
    const { childId } = await createFixtureChild('Bethertrade Parity B');
    const canonicalPass = await issuePassForChild({ childId, eventId: testEventId });

    const parentPasses = await getPassesForParent(testParentId, testEventId);
    const parentPass = parentPasses.passes.find(p => p.childId === childId);
    const adminPass = await resolveAdminPass(childId, testEventId);

    assert.equal(
      adminPass?.pass?.passReference,
      parentPass?.passCode,
      'Admin passReference and Parent passCode must be IDENTICAL'
    );
    assert.equal(
      adminPass?.pass?.passReference,
      canonicalPass.pass_reference,
      'Pass reference must match database record'
    );
  });

  it('Test C: Admin View Pass does not mutate DB', async () => {
    const { childId, entryId } = await createFixtureChild('Bethertrade Parity C');
    await issuePassForChild({ childId, eventId: testEventId });

    // Record DB snapshots before
    const passesBefore = await query('SELECT * FROM event_passes WHERE child_event_entry_id = ?', [entryId]);
    const entryBefore = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entryId]);

    // Admin views pass multiple times
    const view1 = await resolveAdminPass(childId, testEventId);
    const view2 = await resolveAdminPass(childId, testEventId);

    // Record DB snapshots after
    const passesAfter = await query('SELECT * FROM event_passes WHERE child_event_entry_id = ?', [entryId]);
    const entryAfter = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entryId]);

    assert.equal(passesBefore.length, passesAfter.length, 'Pass count must not change');
    assert.equal(passesBefore[0].id, passesAfter[0].id, 'Pass ID must be unchanged');
    assert.equal(passesBefore[0].pass_reference, passesAfter[0].pass_reference, 'Pass reference must be unchanged');
    assert.equal(passesBefore[0].updated_at, passesAfter[0].updated_at, 'Pass row must not be updated');
    assert.equal(entryBefore.updated_at, entryAfter.updated_at, 'Entry row must not be updated');
    assert.equal(view1?.pass?.passReference, view2?.pass?.passReference);
  });

  it('Test D: Admin Print Pass does not mutate DB', async () => {
    const { childId, entryId } = await createFixtureChild('Bethertrade Parity D');
    await issuePassForChild({ childId, eventId: testEventId });

    const countBefore = await queryOne('SELECT COUNT(*) as count FROM event_passes');

    // Simulate Admin requesting printable pass for printing
    const printable = await resolveAdminPass(childId, testEventId);
    assert.ok(printable?.pass);

    const countAfter = await queryOne('SELECT COUNT(*) as count FROM event_passes');
    assert.equal(countBefore.count, countAfter.count, 'Total event_passes rows must remain constant');
  });

  it('Test E: Admin QR scans successfully with existing scanner', async () => {
    const { childId, entryId } = await createFixtureChild('Bethertrade Parity E');
    await issuePassForChild({ childId, eventId: testEventId });

    // Admin retrieves pass and extracts printed QR payload
    const adminPass = await resolveAdminPass(childId, testEventId);
    const printedQrPayload = adminPass?.pass?.qrPayload;
    assert.ok(printedQrPayload);

    // Volunteer scanner scans the printed QR code
    const scanResult = await validatePassForScan(printedQrPayload, testEventId);

    assert.equal(scanResult.valid, true, 'Scanner must validate Admin printed QR code successfully');
    assert.equal((scanResult as any).pass.child_event_entry_id, entryId, 'Scanner must resolve to correct event entry');
    assert.equal((scanResult as any).child.id, childId, 'Scanner must resolve to correct child');
  });

  it('Test F: No duplicate event_passes row is created', async () => {
    const { childId, entryId } = await createFixtureChild('Bethertrade Parity F');
    await issuePassForChild({ childId, eventId: testEventId });

    // Multiple Admin requests
    await resolveAdminPass(childId, testEventId);
    await resolveAdminPass(childId, testEventId);
    await resolveAdminBatchPasses([childId], testEventId);

    const rows = await query('SELECT * FROM event_passes WHERE child_event_entry_id = ?', [entryId]);
    assert.equal(rows.length, 1, 'Exactly one pass row must exist for child_event_entry_id');
  });

  it('Test G: Checked-in child still shows same pass', async () => {
    const { childId, entryId } = await createFixtureChild('Bethertrade Parity G');
    const originalPass = await issuePassForChild({ childId, eventId: testEventId });

    // Simulate check-in
    const now = new Date().toISOString();
    await execute(`
      UPDATE child_event_entries SET status = 'checked_in', checked_in_at = ?, updated_at = ? WHERE id = ?
    `, [now, now, entryId]);

    // Admin views pass after check-in for operational recovery
    const adminPass = await resolveAdminPass(childId, testEventId);
    assert.ok(adminPass?.pass);
    assert.equal(adminPass.entryStatus, 'checked_in');
    assert.equal(adminPass.pass.passReference, originalPass.pass_reference, 'Checked-in child pass reference must match');
    assert.equal(adminPass.pass.qrPayload, originalPass.pass_reference, 'QR payload must remain identical');
  });

  it('Test H: Revoked pass is not printed as active', async () => {
    const { childId, entryId } = await createFixtureChild('Bethertrade Parity H');
    await issuePassForChild({ childId, eventId: testEventId });

    // Revoke pass
    await revokePassForChild(childId, testEventId, 'Duplicate registration test');

    const adminPass = await resolveAdminPass(childId, testEventId);
    assert.equal(adminPass?.pass, null, 'Revoked pass must NOT be returned as active');
    assert.equal(adminPass?.entryStatus, 'review_reopened');
  });

  it('Test I: Batch printing uses each child\'s existing canonical pass', async () => {
    const child1 = await createFixtureChild('Batch Child One');
    const child2 = await createFixtureChild('Batch Child Two');
    const child3 = await createFixtureChild('Batch Child Three');

    const pass1 = await issuePassForChild({ childId: child1.childId, eventId: testEventId });
    const pass2 = await issuePassForChild({ childId: child2.childId, eventId: testEventId });
    const pass3 = await issuePassForChild({ childId: child3.childId, eventId: testEventId });

    // Admin selects multiple children for batch printing
    const batchResult = await resolveAdminBatchPasses(
      [child1.childId, child2.childId, child3.childId],
      testEventId
    );

    assert.equal(batchResult.count, 3);
    const retrieved1 = batchResult.passes.find(p => p.childId === child1.childId);
    const retrieved2 = batchResult.passes.find(p => p.childId === child2.childId);
    const retrieved3 = batchResult.passes.find(p => p.childId === child3.childId);

    assert.equal(retrieved1?.pass?.passReference, pass1.pass_reference);
    assert.equal(retrieved2?.pass?.passReference, pass2.pass_reference);
    assert.equal(retrieved3?.pass?.passReference, pass3.pass_reference);

    assert.equal(retrieved1?.pass?.qrPayload, pass1.pass_reference);
    assert.equal(retrieved2?.pass?.qrPayload, pass2.pass_reference);
    assert.equal(retrieved3?.pass?.qrPayload, pass3.pass_reference);
  });

  it('Test J: Parent pass remains unchanged after Admin printing', async () => {
    const { childId } = await createFixtureChild('Bethertrade Parity J');
    await issuePassForChild({ childId, eventId: testEventId });

    // Parent baseline
    const parentBefore = await getPassesForParent(testParentId, testEventId);
    const parentPassBefore = parentBefore.passes.find(p => p.childId === childId);

    // Admin views & prints pass
    await resolveAdminPass(childId, testEventId);
    await resolveAdminBatchPasses([childId], testEventId);

    // Parent verification
    const parentAfter = await getPassesForParent(testParentId, testEventId);
    const parentPassAfter = parentAfter.passes.find(p => p.childId === childId);

    assert.equal(parentPassBefore?.passCode, parentPassAfter?.passCode);
    assert.equal(parentPassBefore?.qrPayload, parentPassAfter?.qrPayload);
    assert.equal(parentPassBefore?.status, parentPassAfter?.status);
    assert.equal(parentPassBefore?.issuedAt, parentPassAfter?.issuedAt);
  });
});
