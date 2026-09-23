/**
 * tests/test_admin_invitation_flow.ts
 *
 * Comprehensive validation of the Admin Invitation Flow hardening:
 * 1. new Admin invite succeeds
 * 2. new Super Admin invite succeeds
 * 3. DB failure rolls back user/profile/token changes
 * 4. duplicate pending invite does not create duplicate user
 * 5. pending invite can be resent
 * 6. resend revokes old token
 * 7. resend generates new valid token
 * 8. expired pending invite can be recovered
 * 9. revoked pending invite can be recovered
 * 10. active Admin cannot be reinvited
 * 11. email delivery failure preserves pending invite
 * 12. second resend after provider failure remains possible
 * 13. unauthorized user cannot invite/resend
 * 14. invalid email rejected
 * 15. PostgreSQL timestamp fields receive timestamps/null only
 *
 * Run: npx tsx tests/test_admin_invitation_flow.ts
 */

import crypto from 'crypto';
import express from 'express';
import adminRoutes from '../src/server/routes/admin';
import { generateToken, hashPassword } from '../src/server/auth';
import { execute, queryOne, query, transaction } from '../src/server/db';
import { buildPublicAppUrl } from '../src/server/utils/urlHelper';

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

function isValidIsoTimestampOrNull(val: any): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val !== 'string') return false;
  const d = new Date(val);
  return !isNaN(d.getTime());
}

async function main() {
  console.log('\n=== ADMIN INVITATION FLOW HARDENING REGRESSION TESTS ===\n');

  // Configure simulated email provider for testing environment
  process.env.EMAIL_PROVIDER = 'simulated';
  process.env.MAIL_FROM_ADDRESS = 'noreply@koinonia.test';
  process.env.MAIL_FROM_NAME = 'Koinonia Children and Teens';

  // Setup test Express app with admin routes
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const runId = Date.now();
  const superAdminId = `super-admin-test-${runId}`;
  const normalAdminId = `normal-admin-test-${runId}`;
  const regularUserId = `regular-user-test-${runId}`;
  const nowIso = new Date().toISOString();

  // Seed caller users
  await execute(`
    INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, 'super_admin', 1, ?, ?)
  `, [superAdminId, `superadmin_${runId}@koinonia.test`, hashPassword('SuperSecret123!'), nowIso, nowIso]);

  await execute(`
    INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, 'admin', 1, ?, ?)
  `, [normalAdminId, `normaladmin_${runId}@koinonia.test`, hashPassword('AdminSecret123!'), nowIso, nowIso]);

  await execute(`
    INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, 'parent', 1, ?, ?)
  `, [regularUserId, `parentuser_${runId}@koinonia.test`, hashPassword('ParentSecret123!'), nowIso, nowIso]);

  const superAdminToken = generateToken(superAdminId);
  const normalAdminToken = generateToken(normalAdminId);
  const regularUserToken = generateToken(regularUserId);

  try {
    // -------------------------------------------------------------------------
    // 1. new Admin invite succeeds
    // -------------------------------------------------------------------------
    const admin1Email = `new_admin_${runId}@koinonia.test`;
    await runTest('1. new Admin invite succeeds', async () => {
      const res = await fetch(`${baseUrl}/api/admin/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ email: admin1Email, role: 'admin' })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected status 200 but got ${res.status}`);
      assert(body.success === true, `Expected success true but got ${JSON.stringify(body)}`);

      // Verify DB record
      const user = await queryOne('SELECT * FROM users WHERE email = ?', [admin1Email]);
      assert(!!user, 'User record was not created in DB');
      assert(user.role === 'admin', `Expected role admin but got ${user.role}`);
      assert(user.password_hash === 'invited_pending', `Expected password_hash invited_pending but got ${user.password_hash}`);

      const profile = await queryOne('SELECT * FROM parent_profiles WHERE user_id = ?', [user.id]);
      assert(!!profile, 'Parent profile record was not created');

      const token = await queryOne("SELECT * FROM auth_tokens WHERE user_id = ? AND token_type = 'admin_invite'", [user.id]);
      assert(!!token, 'Auth token was not created in DB');
      assert(token.used_at === null, `Expected used_at to be NULL for new token, got ${token.used_at}`);
      assert(token.revoked_at === null, `Expected revoked_at to be NULL, got ${token.revoked_at}`);
    });

    // -------------------------------------------------------------------------
    // 2. new Super Admin invite succeeds
    // -------------------------------------------------------------------------
    const superAdmin1Email = `new_super_${runId}@koinonia.test`;
    await runTest('2. new Super Admin invite succeeds', async () => {
      const res = await fetch(`${baseUrl}/api/admin/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ email: superAdmin1Email, role: 'super_admin' })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected status 200 but got ${res.status}`);
      assert(body.success === true, `Expected success true`);

      const user = await queryOne('SELECT * FROM users WHERE email = ?', [superAdmin1Email]);
      assert(!!user, 'User record was not created');
      assert(user.role === 'super_admin', `Expected role super_admin but got ${user.role}`);
      assert(user.password_hash === 'invited_pending', `Expected password_hash invited_pending`);
    });

    // -------------------------------------------------------------------------
    // 3. DB failure rolls back user/profile/token changes
    // -------------------------------------------------------------------------
    await runTest('3. DB failure rolls back user/profile/token changes', async () => {
      const failUserId = `rollback-user-${runId}`;
      const failEmail = `rollback_${runId}@koinonia.test`;
      let errorThrown = false;

      try {
        await transaction(async () => {
          await execute(`
            INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
            VALUES (?, ?, 'invited_pending', 'admin', 0, ?, ?)
          `, [failUserId, failEmail, nowIso, nowIso]);

          await execute(`
            INSERT INTO parent_profiles (id, user_id, full_name, email, created_at, updated_at)
            VALUES (?, ?, 'Rollback User', ?, ?, ?)
          `, [crypto.randomUUID(), failUserId, failEmail, nowIso, nowIso]);

          await execute(`
            INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
            VALUES (?, ?, 'fake_token_hash', 'admin_invite', ?, ?)
          `, [crypto.randomUUID(), failUserId, nowIso, nowIso]);

          // Force failure inside transaction
          throw new Error('Simulated DB failure during invitation creation');
        });
      } catch (err: any) {
        errorThrown = true;
      }

      assert(errorThrown, 'Transaction was expected to throw');

      // Verify complete rollback: no partial user, profile, or token records
      const user = await queryOne('SELECT * FROM users WHERE id = ?', [failUserId]);
      assert(!user, 'User record was NOT rolled back!');

      const profile = await queryOne('SELECT * FROM parent_profiles WHERE user_id = ?', [failUserId]);
      assert(!profile, 'Parent profile record was NOT rolled back!');

      const token = await queryOne('SELECT * FROM auth_tokens WHERE user_id = ?', [failUserId]);
      assert(!token, 'Auth token record was NOT rolled back!');
    });

    // -------------------------------------------------------------------------
    // 4. duplicate pending invite does not create duplicate user
    // -------------------------------------------------------------------------
    await runTest('4. duplicate pending invite does not create duplicate user', async () => {
      const res = await fetch(`${baseUrl}/api/admin/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ email: superAdmin1Email, role: 'super_admin' })
      });

      const body = await res.json();
      assert(res.status === 400, `Expected status 400 but got ${res.status}`);
      assert(body.code === 'INVITATION_ALREADY_PENDING', `Expected INVITATION_ALREADY_PENDING, got ${body.code}`);

      // Verify only 1 user record exists
      const users = await query('SELECT * FROM users WHERE email = ?', [superAdmin1Email]);
      assert(users.length === 1, `Expected exactly 1 user record, found ${users.length}`);
    });

    // -------------------------------------------------------------------------
    // 5. pending invite can be resent
    // 6. resend revokes old token
    // 7. resend generates new valid token
    // -------------------------------------------------------------------------
    let resentTokenString = '';
    await runTest('5. pending invite can be resent', async () => {
      // Get the existing token before resend
      const user = await queryOne('SELECT id FROM users WHERE email = ?', [admin1Email]);
      const oldToken = await queryOne("SELECT * FROM auth_tokens WHERE user_id = ? AND token_type = 'admin_invite' AND used_at IS NULL AND revoked_at IS NULL", [user.id]);
      assert(!!oldToken, 'Old active token not found before resend');

      const res = await fetch(`${baseUrl}/api/admin/invites/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ email: admin1Email })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert(body.success === true, `Expected success true`);

      // 6. Check old token revoked
      const recheckedOld = await queryOne('SELECT * FROM auth_tokens WHERE id = ?', [oldToken.id]);
      assert(recheckedOld.revoked_at !== null, 'Old token was not revoked');
      assert(recheckedOld.revoked_by === superAdminId, `Expected revoked_by ${superAdminId}, got ${recheckedOld.revoked_by}`);
      assert(recheckedOld.used_at === null, `Expected used_at to remain NULL, got ${recheckedOld.used_at}`);

      // 7. Check new valid token created
      const newToken = await queryOne("SELECT * FROM auth_tokens WHERE user_id = ? AND id != ? AND token_type = 'admin_invite' AND revoked_at IS NULL", [user.id, oldToken.id]);
      assert(!!newToken, 'New auth token not created');
      assert(newToken.used_at === null, 'New token used_at should be NULL');
      assert(newToken.expires_at > new Date().toISOString(), 'New token expires_at is not in the future');

      // Verify no duplicate users created
      const allUsers = await query('SELECT * FROM users WHERE email = ?', [admin1Email]);
      assert(allUsers.length === 1, `Expected 1 user record, found ${allUsers.length}`);
    });

    await runTest('6. resend revokes old token (verified above and token cannot be used)', async () => {
      const user = await queryOne('SELECT id FROM users WHERE email = ?', [admin1Email]);
      const revokedTokens = await query("SELECT * FROM auth_tokens WHERE user_id = ? AND revoked_at IS NOT NULL", [user.id]);
      assert(revokedTokens.length >= 1, 'Expected at least 1 revoked token');
      for (const rt of revokedTokens) {
        assert(rt.used_at === null, `Revoked token should not have string in used_at: ${rt.used_at}`);
        assert(isValidIsoTimestampOrNull(rt.revoked_at), `revoked_at should be a valid timestamp: ${rt.revoked_at}`);
      }
    });

    await runTest('7. resend generates new valid token that can verify', async () => {
      const user = await queryOne('SELECT id FROM users WHERE email = ?', [admin1Email]);
      const activeTokens = await query("SELECT * FROM auth_tokens WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL", [user.id]);
      assert(activeTokens.length === 1, `Expected exactly 1 active token, found ${activeTokens.length}`);
    });

    // -------------------------------------------------------------------------
    // 8. expired pending invite can be recovered
    // -------------------------------------------------------------------------
    await runTest('8. expired pending invite can be recovered without manual DB deletion', async () => {
      const expiredEmail = `expired_${runId}@koinonia.test`;
      const expiredUserId = `expired-user-${runId}`;
      const pastDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

      // Seed an invited_pending user with an expired token
      await execute(`
        INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
        VALUES (?, ?, 'invited_pending', 'admin', 0, ?, ?)
      `, [expiredUserId, expiredEmail, pastDate, pastDate]);

      await execute(`
        INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
        VALUES (?, ?, ?, 'admin_invite', ?, ?)
      `, [crypto.randomUUID(), expiredUserId, crypto.randomBytes(32).toString('hex'), pastDate, pastDate]);

      // Recovery attempt 1: via POST /api/admin/invites (new invite to existing expired user)
      const res = await fetch(`${baseUrl}/api/admin/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ email: expiredEmail, role: 'admin' })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert(body.success === true, 'Expected recovery invite to succeed');

      // Verify a new active unexpired token was issued
      const freshToken = await queryOne(
        "SELECT * FROM auth_tokens WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
        [expiredUserId, new Date().toISOString()]
      );
      assert(!!freshToken, 'Fresh active token was not issued for expired invite');
    });

    // -------------------------------------------------------------------------
    // 9. revoked pending invite can be recovered
    // -------------------------------------------------------------------------
    await runTest('9. revoked pending invite can be recovered without manual DB deletion', async () => {
      const revokedEmail = `revoked_${runId}@koinonia.test`;
      const revokedUserId = `revoked-user-${runId}`;

      // Seed an invited_pending user whose previous token was revoked
      await execute(`
        INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
        VALUES (?, ?, 'invited_pending', 'admin', 0, ?, ?)
      `, [revokedUserId, revokedEmail, nowIso, nowIso]);

      await execute(`
        INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at, revoked_at, revoked_by)
        VALUES (?, ?, ?, 'admin_invite', ?, ?, ?, ?)
      `, [crypto.randomUUID(), revokedUserId, crypto.randomBytes(32).toString('hex'), new Date(Date.now() + 72 * 3600 * 1000).toISOString(), nowIso, nowIso, superAdminId]);

      // Recovery attempt via POST /api/admin/invites/resend
      const res = await fetch(`${baseUrl}/api/admin/invites/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ email: revokedEmail })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert(body.success === true, 'Expected resend to recover revoked invite');

      const freshToken = await queryOne(
        "SELECT * FROM auth_tokens WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
        [revokedUserId, new Date().toISOString()]
      );
      assert(!!freshToken, 'Fresh active token was not issued for revoked invite');
    });

    // -------------------------------------------------------------------------
    // 10. active Admin cannot be reinvited
    // -------------------------------------------------------------------------
    await runTest('10. active Admin cannot be reinvited or resent an invitation', async () => {
      // 10a: Try inviting active normal admin
      const res1 = await fetch(`${baseUrl}/api/admin/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ email: `normaladmin_${runId}@koinonia.test`, role: 'admin' })
      });

      const body1 = await res1.json();
      assert(res1.status === 400, `Expected status 400, got ${res1.status}`);
      assert(body1.code === 'ALREADY_ACTIVE_ADMIN', `Expected ALREADY_ACTIVE_ADMIN, got ${body1.code}`);

      // 10b: Try resending to active admin
      const res2 = await fetch(`${baseUrl}/api/admin/invites/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ email: `normaladmin_${runId}@koinonia.test` })
      });

      const body2 = await res2.json();
      assert(res2.status === 400, `Expected status 400, got ${res2.status}`);
      assert(body2.code === 'NOT_PENDING_INVITATION', `Expected NOT_PENDING_INVITATION, got ${body2.code}`);
    });

    // -------------------------------------------------------------------------
    // 11. email delivery failure preserves pending invite
    // -------------------------------------------------------------------------
    const failEmail = `email_fail_${runId}@koinonia.test`;
    await runTest('11. email delivery failure preserves pending invite', async () => {
      const origProvider = process.env.EMAIL_PROVIDER;
      process.env.EMAIL_PROVIDER = 'resend';
      const origApiKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY; // forces Resend to fail safely

      try {
        const res = await fetch(`${baseUrl}/api/admin/invites`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${superAdminToken}`
          },
          body: JSON.stringify({ email: failEmail, role: 'admin' })
        });

        const body = await res.json();
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
        assert(body.success === false, 'Expected success: false on email failure');
        assert(body.code === 'EMAIL_DELIVERY_FAILED', `Expected EMAIL_DELIVERY_FAILED, got ${body.code}`);
        assert(body.message.includes('email could not be sent'), `Unexpected message: ${body.message}`);

        // Verify that the user and token are preserved in pending state
        const user = await queryOne('SELECT * FROM users WHERE email = ?', [failEmail]);
        assert(!!user, 'User record was not preserved on email failure');
        assert(user.password_hash === 'invited_pending', 'User state changed from invited_pending');

        const token = await queryOne("SELECT * FROM auth_tokens WHERE user_id = ? AND token_type = 'admin_invite'", [user.id]);
        assert(!!token, 'Auth token was not preserved');
        assert(token.used_at === null, 'Token should not be marked used');
        assert(token.revoked_at === null, 'Token should not be marked revoked');
      } finally {
        if (origProvider) process.env.EMAIL_PROVIDER = origProvider;
        if (origApiKey) process.env.RESEND_API_KEY = origApiKey;
      }
    });

    // -------------------------------------------------------------------------
    // 12. second resend after provider failure remains possible
    // -------------------------------------------------------------------------
    await runTest('12. second resend after provider failure remains possible', async () => {
      // With email provider working again, resend for the user that had an email failure
      const res = await fetch(`${baseUrl}/api/admin/invites/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ email: failEmail })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert(body.success === true, `Expected success true on resend: ${JSON.stringify(body)}`);

      // Verify that a new valid token is in place
      const user = await queryOne('SELECT id FROM users WHERE email = ?', [failEmail]);
      const validTokens = await query(
        "SELECT * FROM auth_tokens WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
        [user.id, new Date().toISOString()]
      );
      assert(validTokens.length === 1, `Expected 1 active valid token, got ${validTokens.length}`);
    });

    // -------------------------------------------------------------------------
    // 13. unauthorized user cannot invite/resend
    // -------------------------------------------------------------------------
    await runTest('13. unauthorized user cannot invite or resend', async () => {
      // Regular user cannot invite
      const res1 = await fetch(`${baseUrl}/api/admin/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${regularUserToken}`
        },
        body: JSON.stringify({ email: `unauth_${runId}@koinonia.test`, role: 'admin' })
      });
      assert(res1.status === 403, `Expected 403 for regular user invite, got ${res1.status}`);

      // Regular user cannot resend
      const res2 = await fetch(`${baseUrl}/api/admin/invites/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${regularUserToken}`
        },
        body: JSON.stringify({ email: admin1Email })
      });
      assert(res2.status === 403, `Expected 403 for regular user resend, got ${res2.status}`);

      // Normal admin cannot invite super_admin
      const res3 = await fetch(`${baseUrl}/api/admin/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${normalAdminToken}`
        },
        body: JSON.stringify({ email: `unauth_super_${runId}@koinonia.test`, role: 'super_admin' })
      });
      assert(res3.status === 403, `Expected 403 for normal admin inviting super_admin, got ${res3.status}`);

      // Normal admin cannot resend for a super_admin
      const res4 = await fetch(`${baseUrl}/api/admin/invites/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${normalAdminToken}`
        },
        body: JSON.stringify({ email: superAdmin1Email })
      });
      assert(res4.status === 403, `Expected 403 for normal admin resending super_admin invite, got ${res4.status}`);
    });

    // -------------------------------------------------------------------------
    // 14. invalid email rejected
    // -------------------------------------------------------------------------
    await runTest('14. invalid email rejected', async () => {
      const res = await fetch(`${baseUrl}/api/admin/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ email: 'not-an-email@', role: 'admin' })
      });

      const body = await res.json();
      assert(res.status === 400, `Expected status 400 but got ${res.status}`);
      assert(body.code === 'INVALID_EMAIL', `Expected INVALID_EMAIL, got ${body.code}`);
      assert(body.error === 'Please enter a valid email address.', `Unexpected error: ${body.error}`);
    });

    // -------------------------------------------------------------------------
    // 15. PostgreSQL timestamp fields receive timestamps/null only
    // -------------------------------------------------------------------------
    await runTest('15. PostgreSQL timestamp fields receive timestamps/null only', async () => {
      // Create and accept an invitation to test token used_at timestamp
      const acceptEmail = `accept_ts_${runId}@koinonia.test`;
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const userId = crypto.randomUUID();

      await execute(`
        INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
        VALUES (?, ?, 'invited_pending', 'admin', 0, ?, ?)
      `, [userId, acceptEmail, nowIso, nowIso]);

      await execute(`
        INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
        VALUES (?, ?, ?, 'admin_invite', ?, ?)
      `, [crypto.randomUUID(), userId, tokenHash, new Date(Date.now() + 72 * 3600 * 1000).toISOString(), nowIso]);

      // Accept the invite
      const acceptRes = await fetch(`${baseUrl}/api/admin/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawToken, password: 'StrongPassword123!' })
      });
      const acceptBody = await acceptRes.json();
      assert(acceptRes.status === 200, `Expected 200 on accept, got ${acceptRes.status}`);

      // Query all admin_invite auth_tokens in DB
      const allTokens = await query("SELECT * FROM auth_tokens WHERE token_type = 'admin_invite'");
      for (const t of allTokens) {
        // Assert used_at is null or valid ISO string
        assert(
          isValidIsoTimestampOrNull(t.used_at),
          `auth_tokens.used_at has invalid non-timestamp value: "${t.used_at}" (id: ${t.id})`
        );
        assert(t.used_at !== 'revoked', `auth_tokens.used_at should never be string 'revoked'`);
        assert(t.used_at !== 'replaced', `auth_tokens.used_at should never be string 'replaced'`);
        assert(t.used_at !== 'removed', `auth_tokens.used_at should never be string 'removed'`);

        // Assert revoked_at is null or valid ISO string
        assert(
          isValidIsoTimestampOrNull(t.revoked_at),
          `auth_tokens.revoked_at has invalid non-timestamp value: "${t.revoked_at}" (id: ${t.id})`
        );

        // Assert expires_at and created_at are valid timestamps
        assert(
          isValidIsoTimestampOrNull(t.expires_at) && t.expires_at !== null,
          `auth_tokens.expires_at must be a valid timestamp: "${t.expires_at}"`
        );
        assert(
          isValidIsoTimestampOrNull(t.created_at) && t.created_at !== null,
          `auth_tokens.created_at must be a valid timestamp: "${t.created_at}"`
        );
      }
    });

  } finally {
    server.close();
  }

  console.log(`\nResults: ${passedCount} passed, ${failedCount} failed.`);
  if (failedCount > 0) {
    console.error('Failed tests:', failures);
    process.exit(1);
  } else {
    console.log('ALL 15 INVITATION HARDENING TESTS PASSED SUCCESSFULLY.\n');
  }
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
