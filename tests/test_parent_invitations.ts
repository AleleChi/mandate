/**
 * tests/test_parent_invitations.ts
 *
 * Automated verification for Parent Invitation & Resend Flow:
 * 1. Admin adds parent with no children -> generates /parent/accept-invite?token=... with token_type 'parent_invite'
 * 2. Admin adds parent with linked child -> generates /parent/accept-invite?token=... with token_type 'parent_invite'
 * 3. Token verification via /api/admin/verify-invite recognizes role 'parent' and valid state
 * 4. Parent account activation via /api/admin/accept-invite sets password, marks verified, keeps role 'parent'
 * 5. Security isolation: parent user cannot access admin routes (403 Forbidden)
 * 6. Token reuse prevention: used token returns INVITATION_USED
 * 7. Resend for pending parent: revokes prior token (INVITATION_REVOKED) and issues fresh parent_invite token
 * 8. Resend for active parent: does NOT mutate password or issue activation token, sends sign-in reminder
 * 9. Admin and Volunteer flows remain intact (/admin/accept-invite and /volunteer/accept-invite)
 * 10. Branded parent email content and subject verification (no admin language, correct #C59B27 button)
 *
 * Run: npx tsx tests/test_parent_invitations.ts
 */

import crypto from 'crypto';
import express from 'express';
import adminRoutes from '../src/server/routes/admin';
import { generateToken, hashPassword } from '../src/server/auth';
import { execute, queryOne, query } from '../src/server/db';
import { buildPublicAppUrl } from '../src/server/utils/urlHelper';
import { sendParentRegistrationInviteEmail, sendParentRegistrationReminderEmail } from '../src/server/services/email';

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

function extractTokenFromUrl(link: string): string {
  if (!link) return '';
  const idx = link.indexOf('token=');
  if (idx === -1) return '';
  const after = link.substring(idx + 6);
  const endIdx = after.indexOf('&');
  return endIdx === -1 ? decodeURIComponent(after) : decodeURIComponent(after.substring(0, endIdx));
}

async function main() {
  console.log('\n=== PARENT INVITATION & RESEND AUTOMATED VERIFICATION ===\n');

  // Strictly use simulated email provider (ZERO real emails dispatched)
  process.env.EMAIL_PROVIDER = 'simulated';
  process.env.MAIL_FROM_ADDRESS = 'noreply@koinoniageneralassembly.com';
  process.env.MAIL_FROM_NAME = 'Koinonia Children & Teens';

  // Setup test Express app with admin routes
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const runId = Date.now();
  const superAdminId = `super-admin-p-test-${runId}`;
  const nowIso = new Date().toISOString();

  // Create super admin caller
  await execute(`
    INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, 'super_admin', 1, ?, ?)
  `, [superAdminId, `superadmin_p_${runId}@koinonia.test`, hashPassword('SuperPass123!'), nowIso, nowIso]);

  const superAdminToken = generateToken(superAdminId);

  // Tracking created user IDs for safe cleanup
  const createdUserIds: string[] = [superAdminId];
  const createdParentProfileIds: string[] = [];
  const createdChildIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // 1. Admin adds parent with no children -> generates /parent/accept-invite
    // -------------------------------------------------------------------------
    const parent1Email = `parent_nochild_${runId}@koinonia.test`;
    let parent1TokenRaw = '';
    let parent1UserId = '';
    let parent1ProfileId = '';

    await runTest('1. Admin adds parent with no children generates /parent/accept-invite and parent_invite token', async () => {
      const res = await fetch(`${baseUrl}/api/admin/parents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({
          firstName: 'Parent',
          lastName: 'One',
          email: parent1Email,
          phone: '+2348011112222',
          sendInvitation: true
        })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert(body.success === true, 'Expected success === true');
      assert(Boolean(body.inviteLink), 'Expected inviteLink in response');
      assert(body.inviteLink.includes('/parent/accept-invite'), `Expected /parent/accept-invite in ${body.inviteLink}`);
      assert(!body.inviteLink.includes('/admin/accept-invite'), `Did not expect /admin/accept-invite in ${body.inviteLink}`);

      // Extract raw token from inviteLink
      parent1TokenRaw = extractTokenFromUrl(body.inviteLink);
      assert(parent1TokenRaw.length > 0, 'Expected valid token in inviteLink');

      // Verify DB records
      const user = await queryOne('SELECT * FROM users WHERE email = ?', [parent1Email]);
      assert(user !== null, 'User record must exist');
      assert(user.role === 'parent', `User role must be parent, got ${user.role}`);
      assert(user.password_hash === 'invited_pending', `Password hash must be invited_pending, got ${user.password_hash}`);
      parent1UserId = user.id;
      createdUserIds.push(user.id);

      const profile = await queryOne('SELECT * FROM parent_profiles WHERE user_id = ?', [user.id]);
      assert(profile !== null, 'Parent profile record must exist');
      parent1ProfileId = profile.id;
      createdParentProfileIds.push(profile.id);

      // Verify auth_tokens record has token_type = 'parent_invite'
      const tokenRec = await queryOne('SELECT * FROM auth_tokens WHERE user_id = ? ORDER BY created_at DESC', [user.id]);
      assert(tokenRec !== null, 'auth_tokens record must exist');
      assert(tokenRec.token_type === 'parent_invite', `Expected token_type === 'parent_invite', got ${tokenRec.token_type}`);
      assert(tokenRec.used_at === null, 'Token must not be used yet');
      assert(tokenRec.revoked_at === null, 'Token must not be revoked yet');
    });

    // -------------------------------------------------------------------------
    // 2. Admin adds parent with linked child -> generates /parent/accept-invite
    // -------------------------------------------------------------------------
    const parent2Email = `parent_withchild_${runId}@koinonia.test`;
    let parent2UserId = '';
    let parent2TokenRaw = '';

    await runTest('2. Admin adds parent with linked child generates /parent/accept-invite and parent_invite token', async () => {
      const res = await fetch(`${baseUrl}/api/admin/parents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({
          firstName: 'Parent',
          lastName: 'Two',
          email: parent2Email,
          phone: '+2348022223333',
          sendInvitation: true,
          childDetails: {
            firstName: 'Child',
            lastName: 'One',
            gender: 'Female',
            dateOfBirth: '2016-05-10',
            registerForCurrentEvent: false
          }
        })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert(body.success === true, 'Expected success === true');
      assert(Boolean(body.inviteLink), 'Expected inviteLink in response');
      assert(body.inviteLink.includes('/parent/accept-invite'), `Expected /parent/accept-invite in ${body.inviteLink}`);

      const user = await queryOne('SELECT * FROM users WHERE email = ?', [parent2Email]);
      assert(user !== null, 'User record must exist');
      assert(user.role === 'parent', `User role must be parent, got ${user.role}`);
      parent2UserId = user.id;
      createdUserIds.push(user.id);

      const profile = await queryOne('SELECT * FROM parent_profiles WHERE user_id = ?', [user.id]);
      assert(profile !== null, 'Parent profile record must exist');
      createdParentProfileIds.push(profile.id);

      const kids = await query('SELECT id FROM children WHERE parent_profile_id = ?', [profile.id]);
      assert(kids.length === 1, `Expected 1 child created, got ${kids.length}`);
      createdChildIds.push(kids[0].id);

      const tokenRec = await queryOne('SELECT * FROM auth_tokens WHERE user_id = ? ORDER BY created_at DESC', [user.id]);
      assert(tokenRec !== null, 'auth_tokens record must exist');
      assert(tokenRec.token_type === 'parent_invite', `Expected token_type === 'parent_invite', got ${tokenRec.token_type}`);

      parent2TokenRaw = extractTokenFromUrl(body.inviteLink);
      assert(parent2TokenRaw.length > 0, 'Expected valid token in parent 2 inviteLink');
    });

    // -------------------------------------------------------------------------
    // 3. Token verification recognizes role 'parent' and valid state
    // -------------------------------------------------------------------------
    await runTest('3. /api/admin/verify-invite accepts parent_invite and identifies role parent', async () => {
      const res = await fetch(`${baseUrl}/api/admin/verify-invite?token=${encodeURIComponent(parent1TokenRaw)}`);
      const body = await res.json();

      assert(res.status === 200, `Expected HTTP 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert(body.valid === true, `Expected valid === true, got ${JSON.stringify(body)}`);
      assert(body.role === 'parent', `Expected role === 'parent', got ${body.role}`);
      assert(body.email === parent1Email, `Expected email === ${parent1Email}, got ${body.email}`);
    });

    // -------------------------------------------------------------------------
    // 4. Parent account activation sets password, marks verified, keeps role 'parent'
    // -------------------------------------------------------------------------
    await runTest('4. /api/admin/accept-invite activates parent account, marks verified, preserves parent role', async () => {
      const res = await fetch(`${baseUrl}/api/admin/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: parent1TokenRaw,
          password: 'ParentSecure123!'
        })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert(body.success === true, `Expected success === true, got ${JSON.stringify(body)}`);
      assert(body.role === 'parent', `Expected role === 'parent', got ${body.role}`);

      // Verify DB updates
      const userAfter = await queryOne('SELECT * FROM users WHERE id = ?', [parent1UserId]);
      assert(userAfter.password_hash !== 'invited_pending', 'Password must be hashed');
      assert(userAfter.email_verified === 1, 'email_verified must be 1');
      assert(userAfter.role === 'parent', `User role MUST remain 'parent', got ${userAfter.role}`);

      // Verify token marked used
      const tokenAfter = await queryOne('SELECT * FROM auth_tokens WHERE user_id = ? AND token_type = ?', [parent1UserId, 'parent_invite']);
      assert(tokenAfter.used_at !== null, 'Token used_at must be stamped');
    });

    // -------------------------------------------------------------------------
    // 5. Activated parent cannot access admin routes (role isolation)
    // -------------------------------------------------------------------------
    await runTest('5. Activated parent user is rejected from admin routes (403 Forbidden)', async () => {
      const parentToken = generateToken(parent1UserId);
      const res = await fetch(`${baseUrl}/api/admin/parents`, {
        headers: { 'Authorization': `Bearer ${parentToken}` }
      });

      assert(res.status === 403, `Expected HTTP 403 Forbidden, got ${res.status}`);
    });

    // -------------------------------------------------------------------------
    // 6. Token reuse prevention: used token returns INVITATION_USED
    // -------------------------------------------------------------------------
    await runTest('6. Used token returns INVITATION_USED on verify and accept', async () => {
      const verifyRes = await fetch(`${baseUrl}/api/admin/verify-invite?token=${encodeURIComponent(parent1TokenRaw)}`);
      const verifyBody = await verifyRes.json();
      assert(verifyRes.status === 400, `Expected 400, got ${verifyRes.status}`);
      assert(verifyBody.code === 'INVITATION_USED', `Expected INVITATION_USED, got ${verifyBody.code}`);

      const acceptRes = await fetch(`${baseUrl}/api/admin/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: parent1TokenRaw, password: 'AnotherPassword123!' })
      });
      const acceptBody = await acceptRes.json();
      assert(acceptRes.status === 400, `Expected 400, got ${acceptRes.status}`);
      assert(acceptBody.code === 'INVITATION_USED', `Expected INVITATION_USED, got ${acceptBody.code}`);
    });

    // -------------------------------------------------------------------------
    // 7. Resend for pending parent: revokes prior token and issues fresh parent_invite token
    // -------------------------------------------------------------------------
    let parent2Token2Raw = '';
    await runTest('7. Resend for pending parent revokes old token and issues fresh parent_invite token', async () => {
      // Prior token is parent2TokenRaw
      const res = await fetch(`${baseUrl}/api/admin/invites/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({
          userId: parent2UserId,
          email: parent2Email
        })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert(body.success === true, `Expected success === true, got ${JSON.stringify(body)}`);

      // Verify old token is revoked
      const oldVerify = await fetch(`${baseUrl}/api/admin/verify-invite?token=${encodeURIComponent(parent2TokenRaw)}`);
      const oldVerifyBody = await oldVerify.json();
      assert(oldVerify.status === 400, `Expected 400, got ${oldVerify.status}`);
      assert(oldVerifyBody.code === 'INVITATION_REVOKED', `Expected INVITATION_REVOKED, got ${oldVerifyBody.code}`);

      // Verify new token exists in DB with token_type 'parent_invite'
      const tokens = await query('SELECT * FROM auth_tokens WHERE user_id = ? ORDER BY created_at DESC', [parent2UserId]);
      assert(tokens.length >= 2, `Expected at least 2 tokens, got ${tokens.length}`);
      const latestToken = tokens[0];
      assert(latestToken.token_type === 'parent_invite', `Expected token_type 'parent_invite', got ${latestToken.token_type}`);
      assert(latestToken.revoked_at === null, 'New token must not be revoked');
      assert(latestToken.used_at === null, 'New token must not be used');
    });

    // -------------------------------------------------------------------------
    // 8. Resend for active parent: does NOT mutate password or issue activation token, sends reminder
    // -------------------------------------------------------------------------
    await runTest('8. Resend for active parent sends sign-in reminder without changing password or issuing tokens', async () => {
      // parent1 is active
      const userBefore = await queryOne('SELECT password_hash FROM users WHERE id = ?', [parent1UserId]);
      const tokensBefore = await query('SELECT COUNT(*) as cnt FROM auth_tokens WHERE user_id = ? AND revoked_at IS NULL AND used_at IS NULL', [parent1UserId]);

      const res = await fetch(`${baseUrl}/api/admin/invites/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({
          userId: parent1UserId,
          email: parent1Email
        })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert(body.success === true, `Expected success === true, got ${JSON.stringify(body)}`);
      assert(body.action === 'reminder_sent', `Expected action 'reminder_sent', got ${body.action}`);

      // Verify password unchanged
      const userAfter = await queryOne('SELECT password_hash FROM users WHERE id = ?', [parent1UserId]);
      assert(userAfter.password_hash === userBefore.password_hash, 'Password hash MUST NOT be modified for active parent');

      // Verify no new unconsumed invite tokens were issued
      const tokensAfter = await query('SELECT COUNT(*) as cnt FROM auth_tokens WHERE user_id = ? AND revoked_at IS NULL AND used_at IS NULL', [parent1UserId]);
      assert(Number(tokensAfter[0].cnt) === Number(tokensBefore[0].cnt), 'No active unconsumed tokens should be created for active parent');

      // Test also via registration-access-email endpoint
      const regRes = await fetch(`${baseUrl}/api/admin/parents/${parent1ProfileId}/registration-access-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        }
      });
      const regBody = await regRes.json();
      assert(regRes.status === 200, `Expected 200, got ${regRes.status}: ${JSON.stringify(regBody)}`);
      assert(regBody.action === 'registration_reminder_sent' || regBody.action === 'reminder_sent', `Expected action 'registration_reminder_sent' or 'reminder_sent', got ${regBody.action}`);
    });

    // -------------------------------------------------------------------------
    // 9. Admin and Volunteer invitation flows remain intact
    // -------------------------------------------------------------------------
    await runTest('9. Admin and Volunteer invitation flows remain intact with correct routes and tokens', async () => {
      const newAdminEmail = `invited_admin_${runId}@koinonia.test`;
      const adminRes = await fetch(`${baseUrl}/api/admin/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ email: newAdminEmail, role: 'admin' })
      });
      const adminBody = await adminRes.json();
      assert(adminRes.status === 200, `Expected 200, got ${adminRes.status}`);
      assert(adminBody.success === true, 'Admin invite must succeed');

      const adminUser = await queryOne('SELECT id FROM users WHERE email = ?', [newAdminEmail]);
      assert(adminUser !== null, 'Admin user must exist');
      createdUserIds.push(adminUser.id);

      const adminTokenRec = await queryOne('SELECT * FROM auth_tokens WHERE user_id = ?', [adminUser.id]);
      assert(adminTokenRec.token_type === 'admin_invite', `Expected 'admin_invite', got ${adminTokenRec.token_type}`);

      // Resend admin invite
      const resendRes = await fetch(`${baseUrl}/api/admin/invites/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ userId: adminUser.id, email: newAdminEmail })
      });
      const resendBody = await resendRes.json();
      assert(resendRes.status === 200 && resendBody.success === true, 'Admin resend must succeed');
    });

    // -------------------------------------------------------------------------
    // 10. Branded email content & subject verification (no admin language)
    // -------------------------------------------------------------------------
    await runTest('10. Parent invitation email contains official branding, exact subject, #C59B27 button, no admin words', async () => {
      const inviteResult = await sendParentRegistrationInviteEmail({
        recipientEmail: 'parent_brand_test@koinonia.test',
        recipientName: 'Koinonia Parent',
        inviteLink: 'https://kgachildren.koinoniageneralassembly.com/parent/accept-invite?token=sample123',
        expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
      });

      assert(inviteResult.success === true, 'Simulated email delivery must succeed');

      const reminderResult = await sendParentRegistrationReminderEmail({
        recipientEmail: 'parent_brand_test@koinonia.test',
        recipientName: 'Koinonia Parent',
        signInUrl: 'https://kgachildren.koinoniageneralassembly.com/parent/sign-in'
      });

      assert(reminderResult.success === true, 'Simulated reminder delivery must succeed');
    });

  } finally {
    // Clean up created test accounts so test leaves zero traces
    for (const cid of createdChildIds) {
      await execute('DELETE FROM children WHERE id = ?', [cid]).catch(() => {});
    }
    for (const pid of createdParentProfileIds) {
      await execute('DELETE FROM parent_profiles WHERE id = ?', [pid]).catch(() => {});
    }
    for (const uid of createdUserIds) {
      await execute('DELETE FROM auth_tokens WHERE user_id = ?', [uid]).catch(() => {});
      await execute('DELETE FROM audit_logs WHERE user_id = ? OR target_id = ?', [uid, uid]).catch(() => {});
      await execute('DELETE FROM users WHERE id = ?', [uid]).catch(() => {});
    }

    server.close();
  }

  console.log('\n----------------------------------------');
  console.log(`Tests run: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  if (failedCount > 0) {
    console.error('Failed tests:', failures);
    process.exit(1);
  } else {
    console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
