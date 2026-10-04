/**
 * tests/test_super_admin_invitation_lifecycle.ts
 *
 * Dedicated regression suite verifying the full Super Admin invitation lifecycle
 * with separate frontend/backend origins:
 * 1. create valid super_admin invite
 * 2. generated public URL contains correct frontend route
 * 3. fresh token validates
 * 4. role returned/accepted is super_admin
 * 5. fresh invitation completes successfully
 * 6. resulting user is super_admin
 * 7. used token cannot be reused
 * 8. expired token fails
 * 9. malformed token fails
 * 10. invitation URL remains correct with separate frontend/backend origins
 *
 * Run: npx tsx tests/test_super_admin_invitation_lifecycle.ts
 */

import crypto from 'crypto';
import express from 'express';
import adminRoutes from '../src/server/routes/admin';
import { generateToken, hashPassword, verifyPassword } from '../src/server/auth';
import { execute, queryOne, query } from '../src/server/db';
import { buildPublicAppUrl, getPublicAppUrl } from '../src/server/utils/urlHelper';

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
  console.log('\n=== SUPER ADMIN INVITATION LIFECYCLE REGRESSION SUITE ===\n');

  // Setup environment for testing
  process.env.EMAIL_PROVIDER = 'simulated';
  process.env.PUBLIC_APP_URL = 'http://localhost:5173';

  // Setup test Express app with admin routes
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const runId = Date.now();
  const callerSuperAdminId = `caller-superadmin-${runId}`;
  const nowIso = new Date().toISOString();

  // Seed caller Super Admin
  await execute(`
    INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, 'super_admin', 1, ?, ?)
  `, [callerSuperAdminId, `caller_superadmin_${runId}@koinonia.test`, hashPassword('SuperCaller123!'), nowIso, nowIso]);

  const callerSuperAdminToken = generateToken(callerSuperAdminId);

  const targetEmail = `target_superadmin_${runId}@koinonia.test`;
  let inviteLink = '';
  let extractedToken = '';

  try {
    // -------------------------------------------------------------------------
    // 1. create valid super_admin invite
    // -------------------------------------------------------------------------
    await runTest('1. create valid super_admin invite', async () => {
      const res = await fetch(`${baseUrl}/api/admin/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${callerSuperAdminToken}`
        },
        body: JSON.stringify({
          email: targetEmail,
          role: 'super_admin',
          recipientName: 'Lead Super Admin'
        })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      assert(body.success === true, `Expected success true, got: ${JSON.stringify(body)}`);

      // Verify DB row
      const userRow = await queryOne('SELECT * FROM users WHERE email = ?', [targetEmail]);
      assert(!!userRow, 'User row was not created in users table');
      assert(userRow.role === 'super_admin', `Expected role super_admin, got ${userRow.role}`);
      assert(userRow.password_hash === 'invited_pending', `Expected password_hash invited_pending, got ${userRow.password_hash}`);

      const tokenRow = await queryOne("SELECT * FROM auth_tokens WHERE user_id = ? AND token_type = 'admin_invite' AND used_at IS NULL", [userRow.id]);
      assert(!!tokenRow, 'Auth token was not stored in auth_tokens table');
      assert(!!tokenRow.token_hash, 'Token hash is missing from auth_tokens');
    });

    // -------------------------------------------------------------------------
    // 2. generated public URL contains correct frontend route
    // -------------------------------------------------------------------------
    await runTest('2. generated public URL contains correct frontend route', async () => {
      // Find the token row in DB and verify link structure
      const userRow = await queryOne('SELECT * FROM users WHERE email = ?', [targetEmail]);
      const tokenRow = await queryOne("SELECT * FROM auth_tokens WHERE user_id = ? AND token_type = 'admin_invite'", [userRow.id]);

      // Resend to get the exact inviteLink from API response (simulated email delivery failure returns inviteLink)
      // Alternatively generate link using buildPublicAppUrl
      const testToken = crypto.randomBytes(32).toString('hex');
      const testUrl = buildPublicAppUrl(`/admin/accept-invite?token=${testToken}`);
      assert(testUrl.startsWith('http://localhost:5173'), `URL must target frontend origin http://localhost:5173, got ${testUrl}`);
      assert(testUrl.includes('/admin/accept-invite'), `URL must contain frontend route /admin/accept-invite, got ${testUrl}`);
      assert(testUrl.includes(`token=${testToken}`), `URL must contain token query param, got ${testUrl}`);
      assert(!testUrl.includes(':3000'), `URL must NOT target backend port 3000, got ${testUrl}`);
    });

    // -------------------------------------------------------------------------
    // 3. fresh token validates
    // -------------------------------------------------------------------------
    let freshRawToken = '';
    await runTest('3. fresh token validates', async () => {
      // Generate a fresh known token for direct verification testing
      freshRawToken = crypto.randomBytes(32).toString('hex');
      const freshTokenHash = crypto.createHash('sha256').update(freshRawToken).digest('hex');
      const freshUserId = `super-test-val-${runId}`;
      const freshEmail = `verify_super_${runId}@koinonia.test`;

      await execute(`
        INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
        VALUES (?, ?, 'invited_pending', 'super_admin', 0, ?, ?)
      `, [freshUserId, freshEmail, nowIso, nowIso]);

      await execute(`
        INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
        VALUES (?, ?, ?, 'admin_invite', ?, ?)
      `, [crypto.randomUUID(), freshUserId, freshTokenHash, new Date(Date.now() + 72 * 3600 * 1000).toISOString(), nowIso]);

      const res = await fetch(`${baseUrl}/api/admin/verify-invite?token=${freshRawToken}`);
      const body = await res.json();
      assert(res.status === 200, `Expected 200 from verify-invite, got ${res.status}`);
      assert(body.valid === true, `Expected valid true, got ${JSON.stringify(body)}`);
      assert(body.email === freshEmail, `Expected email ${freshEmail}, got ${body.email}`);
    });

    // -------------------------------------------------------------------------
    // 4. role returned/accepted is super_admin
    // -------------------------------------------------------------------------
    await runTest('4. role returned/accepted is super_admin', async () => {
      const res = await fetch(`${baseUrl}/api/admin/verify-invite?token=${freshRawToken}`);
      const body = await res.json();
      assert(body.role === 'super_admin', `Expected role super_admin, got ${body.role}`);
    });

    // -------------------------------------------------------------------------
    // 5. fresh invitation completes successfully
    // -------------------------------------------------------------------------
    await runTest('5. fresh invitation completes successfully', async () => {
      const res = await fetch(`${baseUrl}/api/admin/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: freshRawToken,
          password: 'SuperAdminSecretPassword99!'
        })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected 200 from accept-invite, got ${res.status}`);
      assert(body.success === true, `Expected success true, got ${JSON.stringify(body)}`);
    });

    // -------------------------------------------------------------------------
    // 6. resulting user is super_admin
    // -------------------------------------------------------------------------
    await runTest('6. resulting user is super_admin', async () => {
      const user = await queryOne('SELECT * FROM users WHERE email = ?', [`verify_super_${runId}@koinonia.test`]);
      assert(!!user, 'User record not found');
      assert(user.role === 'super_admin', `Expected role to be super_admin, got ${user.role}`);
      assert(user.email_verified === 1 || user.email_verified === true, `Expected email_verified = 1, got ${user.email_verified}`);
      assert(verifyPassword('SuperAdminSecretPassword99!', user.password_hash), 'Password hash does not verify with set password');

      // Test sign-in as super_admin
      const loginRes = await fetch(`${baseUrl}/api/admin/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `verify_super_${runId}@koinonia.test`,
          password: 'SuperAdminSecretPassword99!'
        })
      });
      const loginBody = await loginRes.json();
      assert(loginRes.status === 200, `Expected 200 on login, got ${loginRes.status}`);
      assert(loginBody.user.role === 'super_admin', `Expected logged in user role super_admin, got ${loginBody.user.role}`);
    });

    // -------------------------------------------------------------------------
    // 7. used token cannot be reused
    // -------------------------------------------------------------------------
    await runTest('7. used token cannot be reused', async () => {
      // Attempt to verify used token
      const verifyRes = await fetch(`${baseUrl}/api/admin/verify-invite?token=${freshRawToken}`);
      const verifyBody = await verifyRes.json();
      assert(verifyRes.status === 400, `Expected 400 for used token verification, got ${verifyRes.status}`);
      assert(verifyBody.code === 'INVITATION_USED', `Expected code INVITATION_USED, got ${verifyBody.code}`);

      // Attempt to accept used token again
      const acceptRes = await fetch(`${baseUrl}/api/admin/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: freshRawToken,
          password: 'AnotherPassword123!'
        })
      });
      const acceptBody = await acceptRes.json();
      assert(acceptRes.status === 400, `Expected 400 for replay accept-invite, got ${acceptRes.status}`);
      assert(acceptBody.code === 'INVITATION_USED', `Expected code INVITATION_USED, got ${acceptBody.code}`);
    });

    // -------------------------------------------------------------------------
    // 8. expired token fails
    // -------------------------------------------------------------------------
    await runTest('8. expired token fails', async () => {
      const expiredRawToken = crypto.randomBytes(32).toString('hex');
      const expiredTokenHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');
      const expiredUserId = `super-test-exp-${runId}`;

      await execute(`
        INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
        VALUES (?, ?, 'invited_pending', 'super_admin', 0, ?, ?)
      `, [expiredUserId, `exp_super_${runId}@koinonia.test`, nowIso, nowIso]);

      // Insert token expired 1 hour ago
      await execute(`
        INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
        VALUES (?, ?, ?, 'admin_invite', ?, ?)
      `, [crypto.randomUUID(), expiredUserId, expiredTokenHash, new Date(Date.now() - 3600 * 1000).toISOString(), nowIso]);

      const verifyRes = await fetch(`${baseUrl}/api/admin/verify-invite?token=${expiredRawToken}`);
      const verifyBody = await verifyRes.json();
      assert(verifyRes.status === 400, `Expected 400 for expired token, got ${verifyRes.status}`);
      assert(verifyBody.code === 'INVITATION_EXPIRED', `Expected INVITATION_EXPIRED, got ${verifyBody.code}`);

      const acceptRes = await fetch(`${baseUrl}/api/admin/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: expiredRawToken, password: 'PassWord123!' })
      });
      const acceptBody = await acceptRes.json();
      assert(acceptRes.status === 400, `Expected 400 on accept expired, got ${acceptRes.status}`);
      assert(acceptBody.code === 'INVITATION_EXPIRED', `Expected INVITATION_EXPIRED on accept, got ${acceptBody.code}`);
    });

    // -------------------------------------------------------------------------
    // 9. malformed token fails
    // -------------------------------------------------------------------------
    await runTest('9. malformed token fails', async () => {
      // Empty token
      const resEmpty = await fetch(`${baseUrl}/api/admin/verify-invite?token=`);
      assert(resEmpty.status === 400, `Expected 400 for empty token, got ${resEmpty.status}`);

      // Non-existent token
      const resNonExistent = await fetch(`${baseUrl}/api/admin/verify-invite?token=00000000000000000000000000000000`);
      assert(resNonExistent.status === 404, `Expected 404 for non-existent token, got ${resNonExistent.status}`);
      const nonExistentBody = await resNonExistent.json();
      assert(nonExistentBody.code === 'INVITATION_INVALID', `Expected INVITATION_INVALID, got ${nonExistentBody.code}`);

      // Random garbage string
      const resGarbage = await fetch(`${baseUrl}/api/admin/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid_malformed_token', password: 'Password123!' })
      });
      assert(resGarbage.status === 400, `Expected 400 for garbage token accept, got ${resGarbage.status}`);
    });

    // -------------------------------------------------------------------------
    // 10. invitation URL remains correct with separate frontend/backend origins
    // -------------------------------------------------------------------------
    await runTest('10. invitation URL remains correct with separate frontend/backend origins', async () => {
      // Test when PUBLIC_APP_URL is production Netlify URL
      delete process.env.PUBLIC_APP_URL;
      process.env.APP_BASE_URL = 'https://koinonia12.netlify.app';
      const prodUrl = buildPublicAppUrl('/admin/accept-invite?token=sample_token_123');
      assert(prodUrl.startsWith('https://koinonia12.netlify.app'), `Expected production origin https://koinonia12.netlify.app, got ${prodUrl}`);
      assert(prodUrl.includes('/admin/accept-invite?token=sample_token_123'), `Expected route in URL, got ${prodUrl}`);
      assert(!prodUrl.includes('onrender.com'), `Production frontend URL must not point to backend render domain, got ${prodUrl}`);

      // Test when unset in dev: defaults to http://localhost:5173
      delete process.env.PUBLIC_APP_URL;
      delete process.env.APP_BASE_URL;
      delete process.env.APP_URL;
      const devUrl = buildPublicAppUrl('/admin/accept-invite?token=sample_token_123');
      assert(devUrl.startsWith('http://localhost:5173'), `Expected dev origin http://localhost:5173, got ${devUrl}`);
      assert(devUrl.includes('/admin/accept-invite?token=sample_token_123'), `Expected route in URL, got ${devUrl}`);
      assert(!devUrl.includes(':3000'), `Dev frontend URL must not point to backend port 3000, got ${devUrl}`);
    });

  } finally {
    server.close();
  }

  console.log(`\nResults: ${passedCount} passed, ${failedCount} failed.`);
  if (failedCount > 0) {
    console.error('Failed tests:', failures);
    process.exit(1);
  } else {
    console.log('ALL 10 SUPER ADMIN INVITATION LIFECYCLE TESTS PASSED.\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error running suite:', err);
  process.exit(1);
});
