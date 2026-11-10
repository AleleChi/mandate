/**
 * tests/test_account_lifecycle_and_email_reuse.ts
 *
 * Comprehensive regression test suite for Account Deletion, Lifecycle,
 * and Email Reuse across Parents, Volunteers, and Admins.
 *
 * Scenarios covered:
 * - Scenario A: Create Parent with email -> succeeds
 * - Scenario B: Soft-delete/remove Parent. Attempt to create Parent with same email -> returns REMOVED_ACCOUNT_EXISTS
 * - Scenario C: Restore Parent -> restores existing profile and user without duplicate rows
 * - Scenario D: Permanently delete Parent -> tombstones users.email, sets status='deleted', anonymises profile
 * - Scenario E: Create new Parent with original email after permanent delete -> succeeds with new user ID
 * - Scenario F: Volunteer lifecycle: create, soft-delete, detect removed, restore, permanently delete, re-create
 * - Scenario G: Admin lifecycle: invite/create, remove access, detect removed, restore, permanently delete, re-invite
 * - Scenario H: Cross-role email collision: active volunteer email cannot be used to create parent (ROLE_CONFLICT)
 * - Scenario I: Pending parent invitation: email with pending invite returns INVITATION_PENDING
 * - Scenario J: Case-insensitive email normalization (e.g. UPPERCASE/spaces match canonical)
 * - Scenario K: Deleted user cannot authenticate via sign-in endpoints
 * - Scenario L: Permanent deletion revokes auth tokens, password reset tokens, and pending invite tokens
 *
 * Run: npx tsx tests/test_account_lifecycle_and_email_reuse.ts
 */

import express from 'express';
import adminRoutes from '../src/server/routes/admin';
import authRoutes from '../src/server/routes/auth';
import volunteerRoutes from '../src/server/routes/volunteer';
import { generateToken, hashPassword } from '../src/server/auth';
import { execute, queryOne, query } from '../src/server/db';
import { normalizeEmail } from '../src/server/services/accountLifecycleService';

let passedCount = 0;
let failedCount = 0;
const failures: string[] = [];

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failures.push(name);
    failedCount++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log('\n=== ACCOUNT LIFECYCLE & EMAIL REUSE REGRESSION TEST SUITE ===\n');

  process.env.EMAIL_PROVIDER = 'simulated';
  process.env.PUBLIC_APP_URL = 'http://localhost:5173';

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/volunteer', volunteerRoutes);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const runId = Date.now();
  const callerSuperAdminId = `superadmin-lifecycle-${runId}`;
  const nowIso = new Date().toISOString();

  // Create caller Super Admin
  await execute(`
    INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, 'super_admin', 'active', 1, ?, ?)
  `, [callerSuperAdminId, `superadmin_lifecycle_${runId}@koinonia.test`, hashPassword('SuperTest123!'), nowIso, nowIso]);

  const superAdminToken = generateToken(callerSuperAdminId);

  // Helper headers
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${superAdminToken}`
  };

  try {
    // =========================================================================
    // SCENARIO A: Create Parent with email -> succeeds
    // =========================================================================
    const parentEmailA = `parent_a_${runId}@koinonia.test`;
    let parentProfileIdA = '';
    let parentUserIdA = '';

    await runTest('Scenario A: Create Parent with email -> succeeds', async () => {
      const res = await fetch(`${baseUrl}/api/admin/parents`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          firstName: 'Alice',
          lastName: 'Smith',
          email: parentEmailA,
          phone: '+447000111222',
          relationship: 'Mother',
          sendInvitation: false
        })
      });
      const data = await res.json();
      assert(res.status === 200, `Expected status 200, got ${res.status}: ${JSON.stringify(data)}`);
      assert(data.success === true, `Expected success true`);
      assert(Boolean(data.parentId), 'Expected parentId in response');
      parentProfileIdA = data.parentId;

      // Check DB
      const profile = await queryOne<any>(`SELECT * FROM parent_profiles WHERE id = ?`, [parentProfileIdA]);
      assert(Boolean(profile), 'Parent profile should exist');
      assert(profile.is_deleted === 0 || profile.is_deleted === null, 'Profile is not deleted');
      parentUserIdA = profile.user_id;

      const user = await queryOne<any>(`SELECT * FROM users WHERE id = ?`, [parentUserIdA]);
      assert(Boolean(user), 'User record should exist');
      assert(user.email === parentEmailA.toLowerCase(), `User email matches ${parentEmailA}`);
      assert(user.status === 'active', `User status is active`);
    });

    // =========================================================================
    // SCENARIO B: Soft-delete Parent. Attempt to create -> REMOVED_ACCOUNT_EXISTS
    // =========================================================================
    await runTest('Scenario B: Soft-delete Parent, then attempt duplicate -> returns REMOVED_ACCOUNT_EXISTS', async () => {
      // Remove parent
      const removeRes = await fetch(`${baseUrl}/api/admin/parents/${parentProfileIdA}/remove`, {
        method: 'POST',
        headers: authHeaders
      });
      const removeData = await removeRes.json();
      assert(removeRes.status === 200, `Expected 200 on remove, got ${removeRes.status}`);

      // Verify soft-deleted
      const deletedProfile = await queryOne<any>(`SELECT * FROM parent_profiles WHERE id = ?`, [parentProfileIdA]);
      assert(deletedProfile.is_deleted === 1, 'Parent profile should be marked is_deleted = 1');

      // Attempt to create again with exact same email
      const dupRes = await fetch(`${baseUrl}/api/admin/parents`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          firstName: 'Alice',
          lastName: 'Smith',
          email: parentEmailA,
          phone: '+447000111222',
          relationship: 'Mother',
          sendInvitation: false
        })
      });
      const dupData = await dupRes.json();
      assert(dupRes.status === 409, `Expected 409 status on removed parent email, got ${dupRes.status}`);
      assert(dupData.code === 'REMOVED_ACCOUNT_EXISTS', `Expected code REMOVED_ACCOUNT_EXISTS, got ${dupData.code}`);
      assert(dupData.profileId === parentProfileIdA, `Expected profileId ${parentProfileIdA}, got ${dupData.profileId}`);
    });

    // =========================================================================
    // SCENARIO C: Restore Parent -> restores without duplicate rows
    // =========================================================================
    await runTest('Scenario C: Restore Parent -> restores existing profile and user ID', async () => {
      const restoreRes = await fetch(`${baseUrl}/api/admin/parents/${parentProfileIdA}/restore`, {
        method: 'POST',
        headers: authHeaders
      });
      const restoreData = await restoreRes.json();
      assert(restoreRes.status === 200, `Expected 200 on restore, got ${restoreRes.status}: ${JSON.stringify(restoreData)}`);
      assert(restoreData.success === true, 'Expected restore success');

      // Check DB
      const restoredProfile = await queryOne<any>(`SELECT * FROM parent_profiles WHERE id = ?`, [parentProfileIdA]);
      assert(restoredProfile.is_deleted === 0, 'Parent profile is_deleted should be 0');
      assert(restoredProfile.user_id === parentUserIdA, 'User ID should remain unchanged');

      // Check unique row count in users table
      const userRows = await query<any>(`SELECT * FROM users WHERE email = ?`, [parentEmailA.toLowerCase()]);
      assert(userRows.length === 1, `Expected exactly 1 user row for email, found ${userRows.length}`);
    });

    // =========================================================================
    // SCENARIO D: Permanently delete Parent -> tombstones email, status='deleted'
    // =========================================================================
    await runTest('Scenario D: Permanently delete Parent -> tombstones email and releases original', async () => {
      // Must be removed before permanent deletion
      await fetch(`${baseUrl}/api/admin/parents/${parentProfileIdA}/remove`, {
        method: 'POST',
        headers: authHeaders
      });

      const deleteRes = await fetch(`${baseUrl}/api/admin/parents/${parentProfileIdA}/permanent-delete`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          confirmation: 'DELETE',
          reason: 'Test permanent deletion'
        })
      });
      const deleteData = await deleteRes.json();
      assert(deleteRes.status === 200, `Expected 200 on permanent delete, got ${deleteRes.status}: ${JSON.stringify(deleteData)}`);
      assert(deleteData.success === true, 'Expected permanent delete success');

      // Check DB: old user record has tombstone email and status='deleted'
      const oldUser = await queryOne<any>(`SELECT * FROM users WHERE id = ?`, [parentUserIdA]);
      assert(oldUser.status === 'deleted', `Expected status 'deleted', got ${oldUser.status}`);
      assert(oldUser.email.startsWith('deleted-'), `Expected tombstone email, got ${oldUser.email}`);
      assert(oldUser.email.endsWith('@deleted.invalid'), `Expected @deleted.invalid domain, got ${oldUser.email}`);

      // Check parent profile is permanently deleted
      const oldProfile = await queryOne<any>(`SELECT * FROM parent_profiles WHERE id = ?`, [parentProfileIdA]);
      assert(Boolean(oldProfile.permanently_deleted_at), 'permanently_deleted_at should be set');
    });

    // =========================================================================
    // SCENARIO E: Create new Parent with original email after permanent delete
    // =========================================================================
    await runTest('Scenario E: Create new Parent with original email -> succeeds with new user ID', async () => {
      const res = await fetch(`${baseUrl}/api/admin/parents`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          firstName: 'Alice',
          lastName: 'NewSmith',
          email: parentEmailA, // SAME email reused cleanly!
          phone: '+447000999888',
          relationship: 'Mother',
          sendInvitation: false
        })
      });
      const data = await res.json();
      assert(res.status === 200, `Expected 200 on recreate, got ${res.status}: ${JSON.stringify(data)}`);
      assert(data.success === true, 'Expected success');
      assert(data.parentId !== parentProfileIdA, 'Expected new profileId');

      // Check DB
      const newProfile = await queryOne<any>(`SELECT * FROM parent_profiles WHERE id = ?`, [data.parentId]);
      assert(newProfile.user_id !== parentUserIdA, 'Expected brand new user_id');

      const newUser = await queryOne<any>(`SELECT * FROM users WHERE id = ?`, [newProfile.user_id]);
      assert(newUser.email === parentEmailA.toLowerCase(), 'New user has the original email');
      assert(newUser.status === 'active', 'New user status is active');
    });

    // =========================================================================
    // SCENARIO F: Volunteer Lifecycle (create -> remove -> detect -> restore -> permanent-delete -> recreate)
    // =========================================================================
    const volEmail = `volunteer_${runId}@koinonia.test`;
    let volProfileId = '';
    let volUserId = '';

    await runTest('Scenario F1: Create Volunteer -> succeeds', async () => {
      const res = await fetch(`${baseUrl}/api/admin/volunteers`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          firstName: 'Bob',
          lastName: 'Helper',
          email: volEmail,
          phone: '+447111222333',
          preferredTeam: 'General Assistance',
          sendInvitation: false
        })
      });
      const data = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      assert(data.success === true, 'Expected success');
      volProfileId = data.volunteerId;

      const profile = await queryOne<any>(`SELECT * FROM volunteer_profiles WHERE id = ?`, [volProfileId]);
      volUserId = profile.user_id;
      assert(Boolean(volUserId), 'Volunteer user_id should be set');
    });

    await runTest('Scenario F2: Soft-delete Volunteer, then attempt duplicate -> returns REMOVED_ACCOUNT_EXISTS', async () => {
      const removeRes = await fetch(`${baseUrl}/api/admin/volunteers/${volProfileId}/remove`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ reason: 'Temporary departure' })
      });
      const removeData = await removeRes.json();
      assert(removeRes.status === 200, `Expected 200, got ${removeRes.status}`);

      // Attempt duplicate create
      const dupRes = await fetch(`${baseUrl}/api/admin/volunteers`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          firstName: 'Bob',
          lastName: 'Helper',
          email: volEmail,
          phone: '+447111222333',
          sendInvitation: false
        })
      });
      const dupData = await dupRes.json();
      assert(dupRes.status === 409, `Expected 409 status on removed volunteer email, got ${dupRes.status}`);
      assert(dupData.code === 'REMOVED_ACCOUNT_EXISTS', `Expected REMOVED_ACCOUNT_EXISTS, got ${dupData.code}`);
      assert(dupData.profileId === volProfileId, `Expected profileId ${volProfileId}, got ${dupData.profileId}`);
    });

    await runTest('Scenario F3: Restore Volunteer -> restores without duplicate rows', async () => {
      const res = await fetch(`${baseUrl}/api/admin/volunteers/${volProfileId}/restore`, {
        method: 'POST',
        headers: authHeaders
      });
      const data = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(data.success === true, 'Expected success');

      const restoredProfile = await queryOne<any>(`SELECT * FROM volunteer_profiles WHERE id = ?`, [volProfileId]);
      assert(restoredProfile.is_deleted === 0, 'is_deleted should be 0');
    });

    await runTest('Scenario F4: Permanently delete Volunteer -> tombstones email and releases original', async () => {
      // Must remove volunteer before permanent deletion
      await fetch(`${baseUrl}/api/admin/volunteers/${volProfileId}/remove`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ reason: 'Pre-permanent removal' })
      });

      const res = await fetch(`${baseUrl}/api/admin/volunteers/${volProfileId}/permanent-delete`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          confirmation: 'DELETE',
          reason: 'Test volunteer permanent deletion'
        })
      });
      const data = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(data)}`);

      const oldUser = await queryOne<any>(`SELECT * FROM users WHERE id = ?`, [volUserId]);
      assert(oldUser.status === 'deleted', 'User status should be deleted');
      assert(oldUser.email.startsWith('deleted-'), 'User email should be tombstoned');
    });

    await runTest('Scenario F5: Re-create Volunteer with same email -> succeeds with new user ID', async () => {
      const res = await fetch(`${baseUrl}/api/admin/volunteers`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          firstName: 'Bob',
          lastName: 'NewHelper',
          email: volEmail,
          phone: '+447111222444',
          sendInvitation: false
        })
      });
      const data = await res.json();
      assert(res.status === 200, `Expected 200 on recreate, got ${res.status}`);
      assert(data.volunteerId !== volProfileId, 'New volunteer profile ID');
    });

    // =========================================================================
    // SCENARIO G: Admin Lifecycle (invite -> remove access -> detect -> restore -> permanent-delete -> reinvite)
    // =========================================================================
    const adminEmail = `admin_test_${runId}@koinonia.test`;
    let adminUserId = '';

    await runTest('Scenario G1: Invite Admin -> succeeds', async () => {
      const res = await fetch(`${baseUrl}/api/admin/invites`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          email: adminEmail,
          role: 'admin',
          recipientName: 'Team Officer'
        })
      });
      const data = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      assert(data.success === true, 'Expected success');

      const user = await queryOne<any>(`SELECT * FROM users WHERE email = ?`, [adminEmail.toLowerCase()]);
      assert(Boolean(user), 'Admin user row should exist');
      adminUserId = user.id;
    });

    await runTest('Scenario G2: Remove Admin Access, then attempt duplicate invite -> returns REMOVED_ACCOUNT_EXISTS', async () => {
      const delRes = await fetch(`${baseUrl}/api/admin/team-members/${adminUserId}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      assert(delRes.status === 200, `Expected 200 on remove team member, got ${delRes.status}`);

      // Attempt duplicate invite
      const dupRes = await fetch(`${baseUrl}/api/admin/invites`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          email: adminEmail,
          role: 'admin'
        })
      });
      const dupData = await dupRes.json();
      assert(dupRes.status === 400 || dupRes.status === 409, `Expected 400/409 status on removed admin email, got ${dupRes.status}`);
      assert(dupData.code === 'REMOVED_ACCOUNT_EXISTS', `Expected REMOVED_ACCOUNT_EXISTS, got ${dupData.code}`);
      assert(dupData.userId === adminUserId, `Expected userId ${adminUserId}, got ${dupData.userId}`);
    });

    await runTest('Scenario G3: Restore Admin Access -> restores successfully', async () => {
      const res = await fetch(`${baseUrl}/api/admin/team/${adminUserId}/restore`, {
        method: 'POST',
        headers: authHeaders
      });
      const data = await res.json();
      assert(res.status === 200, `Expected 200 on restore, got ${res.status}: ${JSON.stringify(data)}`);
      assert(data.success === true, 'Expected success');

      const restoredUser = await queryOne<any>(`SELECT * FROM users WHERE id = ?`, [adminUserId]);
      assert(restoredUser.status === 'active', 'User status should be active');
    });

    await runTest('Scenario G4: Permanently delete Admin -> tombstones email and releases original', async () => {
      // Must remove access first
      await fetch(`${baseUrl}/api/admin/team-members/${adminUserId}`, {
        method: 'DELETE',
        headers: authHeaders
      });

      const res = await fetch(`${baseUrl}/api/admin/team/${adminUserId}/permanent-delete`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          confirmation: 'DELETE',
          reason: 'Admin left organisation'
        })
      });
      const data = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(data)}`);

      const oldUser = await queryOne<any>(`SELECT * FROM users WHERE id = ?`, [adminUserId]);
      assert(oldUser.status === 'deleted', 'User status should be deleted');
      assert(oldUser.email.startsWith('deleted-'), 'User email should be tombstoned');
    });

    await runTest('Scenario G5: Re-invite Admin with same email -> succeeds with new user ID', async () => {
      const res = await fetch(`${baseUrl}/api/admin/invites`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          email: adminEmail,
          role: 'admin',
          recipientName: 'Team Officer 2'
        })
      });
      const data = await res.json();
      assert(res.status === 200, `Expected 200 on reinvite, got ${res.status}: ${JSON.stringify(data)}`);
      assert(data.success === true, 'Expected success');

      const newUser = await queryOne<any>(`SELECT * FROM users WHERE email = ?`, [adminEmail.toLowerCase()]);
      assert(newUser.id !== adminUserId, 'Expected different user ID for new invite');
      assert(newUser.password_hash === 'invited_pending' || newUser.status === 'invited', 'New user status is invited/pending');
    });

    // =========================================================================
    // SCENARIO H: Cross-role email collision (Volunteer email used for Parent)
    // =========================================================================
    await runTest('Scenario H: Cross-role collision -> returns ROLE_CONFLICT', async () => {
      const crossEmail = `cross_volunteer_${runId}@koinonia.test`;
      // Create volunteer
      await fetch(`${baseUrl}/api/admin/volunteers`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          firstName: 'Charlie',
          lastName: 'Cross',
          email: crossEmail,
          phone: '+447222333444',
          sendInvitation: false
        })
      });

      // Try to create Parent with same email
      const parentRes = await fetch(`${baseUrl}/api/admin/parents`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          firstName: 'Charlie',
          lastName: 'Cross',
          email: crossEmail,
          relationship: 'Father'
        })
      });
      const parentData = await parentRes.json();
      assert(parentRes.status === 409, `Expected 409 status on cross-role conflict, got ${parentRes.status}`);
      assert(parentData.code === 'ROLE_CONFLICT', `Expected ROLE_CONFLICT code, got ${parentData.code}`);
    });

    // =========================================================================
    // SCENARIO I: Pending invitation check -> INVITATION_PENDING
    // =========================================================================
    await runTest('Scenario I: Pending invitation check -> returns INVITATION_PENDING', async () => {
      const pendingEmail = `pending_parent_${runId}@koinonia.test`;
      // Seed pending user with an invite token in auth_tokens
      const pendingUserId = `pending-user-${runId}`;
      await execute(`
        INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 'parent', 'invited', 0, ?, ?)
      `, [pendingUserId, pendingEmail.toLowerCase(), hashPassword('Temp123!'), nowIso, nowIso]);

      await execute(`
        INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
        VALUES (?, ?, ?, 'admin_invite', ?, ?)
      `, [`invite-tok-${runId}`, pendingUserId, `hash-${runId}`, new Date(Date.now() + 86400000).toISOString(), nowIso]);

      const res = await fetch(`${baseUrl}/api/admin/parents`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          firstName: 'Penny',
          lastName: 'Pending',
          email: pendingEmail,
          relationship: 'Mother'
        })
      });
      const data = await res.json();
      assert(res.status === 409, `Expected 409 status, got ${res.status}`);
      assert(data.code === 'INVITATION_PENDING', `Expected INVITATION_PENDING, got ${data.code}`);
    });

    // =========================================================================
    // SCENARIO J: Case-insensitive email normalization
    // =========================================================================
    await runTest('Scenario J: Case-insensitive and trimmed email normalization', async () => {
      const mixed = `  UPPER_test_${runId}@EXAMPLE.COM  `;
      const normalized = normalizeEmail(mixed);
      assert(normalized === `upper_test_${runId}@example.com`, `Expected normalized email, got ${normalized}`);

      // Create parent with mixed case
      const res = await fetch(`${baseUrl}/api/admin/parents`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          firstName: 'Upper',
          lastName: 'Case',
          email: mixed,
          relationship: 'Mother',
          sendInvitation: false
        })
      });
      const data = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}`);

      // Query database to ensure it was stored normalized
      const user = await queryOne<any>(`SELECT * FROM users WHERE email = ?`, [normalized]);
      assert(Boolean(user), 'User should be found with canonical lower-case email');
    });

    // =========================================================================
    // SCENARIO K: Deleted or revoked user cannot authenticate
    // =========================================================================
    await runTest('Scenario K: Deleted or revoked user cannot sign in', async () => {
      const revokedEmail = `revoked_login_${runId}@koinonia.test`;
      const revokedUserId = `revoked-user-${runId}`;
      await execute(`
        INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 'parent', 'revoked', 1, ?, ?)
      `, [revokedUserId, revokedEmail.toLowerCase(), hashPassword('ValidPass123!'), nowIso, nowIso]);

      // Attempt parent sign-in with revoked account email
      const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: revokedEmail,
          password: 'ValidPass123!'
        })
      });
      assert(res.status === 403, `Expected 403 for revoked user login, got ${res.status}`);
      const data = await res.json();
      assert(data.code === 'ACCOUNT_BLOCKED', `Expected ACCOUNT_BLOCKED, got ${data.code}`);
    });

    // =========================================================================
    // SCENARIO L: Permanent deletion revokes tokens
    // =========================================================================
    await runTest('Scenario L: Permanent deletion revokes active password reset and invite tokens', async () => {
      const revokeUserEmail = `revoke_tok_${runId}@koinonia.test`;
      const revokeUserId = `revoke-user-${runId}`;
      const revokeProfileId = `revoke-parent-${runId}`;

      await execute(`
        INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 'parent', 'active', 1, ?, ?)
      `, [revokeUserId, revokeUserEmail.toLowerCase(), hashPassword('RevokePass123!'), nowIso, nowIso]);

      await execute(`
        INSERT INTO parent_profiles (id, user_id, full_name, email, is_deleted, created_at, updated_at)
        VALUES (?, ?, 'Revoke User', ?, 1, ?, ?)
      `, [revokeProfileId, revokeUserId, revokeUserEmail.toLowerCase(), nowIso, nowIso]);

      // Add a password reset token and invite token to auth_tokens
      await execute(`
        INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
        VALUES (?, ?, ?, 'password_reset', ?, ?)
      `, [`prt-${runId}`, revokeUserId, `hash-reset-${runId}`, new Date(Date.now() + 3600000).toISOString(), nowIso]);

      await execute(`
        INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
        VALUES (?, ?, ?, 'admin_invite', ?, ?)
      `, [`inv-${runId}`, revokeUserId, `hash-inv-${runId}`, new Date(Date.now() + 3600000).toISOString(), nowIso]);

      // Call permanent delete
      const delRes = await fetch(`${baseUrl}/api/admin/parents/${revokeProfileId}/permanent-delete`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ confirmation: 'DELETE', reason: 'Token revocation test' })
      });
      assert(delRes.status === 200, `Expected 200 on permanent delete`);

      // Verify active (non-revoked) tokens are gone
      const activeTokens = await query<any>(`
        SELECT * FROM auth_tokens WHERE user_id = ? AND revoked_at IS NULL
      `, [revokeUserId]);
      assert(activeTokens.length === 0, `Expected 0 active tokens, got ${activeTokens.length}`);
    });

  } finally {
    server.close();
  }

  console.log('\n-------------------------------------------------------------');
  console.log(`Results: ${passedCount} passed, ${failedCount} failed.`);
  if (failures.length > 0) {
    console.error('Failed scenarios:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('ALL ACCOUNT LIFECYCLE & EMAIL REUSE SCENARIOS PASSED SUCCESSFULLY!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
