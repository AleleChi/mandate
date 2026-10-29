/**
 * tests/test_admin_removal_flow.ts
 *
 * Comprehensive validation of Admin / Super Admin safe removal:
 * 1. Super Admin removes ordinary Admin -> PASS
 * 2. Super Admin removes another Super Admin when 2+ active remain -> PASS
 * 3. Last active Super Admin removal -> BLOCKED
 * 4. Pending Super Admin invite does NOT count as active Super Admin
 * 5. Revoked Super Admin does NOT count
 * 6. Ordinary Admin attempts removal -> BLOCKED
 * 7. Self-removal -> BLOCKED
 * 8. Pending invited Admin removal -> PASS
 * 9. Outstanding invite token revoked -> PASS
 * 10. Removed Admin cannot authenticate afterward (JWT denied & login blocked)
 * 11. Audit record preserved/created
 * 12. Concurrent last-super-admin protection
 *
 * Run: npx tsx tests/test_admin_removal_flow.ts
 */

import crypto from 'crypto';
import express from 'express';
import adminRoutes from '../src/server/routes/admin';
import authRoutes from '../src/server/routes/auth';
import { generateToken, hashPassword } from '../src/server/auth';
import { execute, queryOne, query } from '../src/server/db';

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
  console.log('\n=== ADMIN TEAM ACCESS REMOVAL TESTS ===\n');

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api/auth', authRoutes);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const runId = Date.now();
  const nowIso = new Date().toISOString();

  // Find all pre-existing active super admins so we can isolate the test environment
  // and restore them safely in finally
  const existingActiveSupers = await query(`
    SELECT id, status FROM users
    WHERE role = 'super_admin'
      AND (status = 'active' OR status IS NULL)
      AND password_hash IS NOT NULL
      AND password_hash != ''
      AND password_hash != 'invited_pending'
  `);

  try {
    // Temporarily deactivate pre-existing super admins to isolate the test suite
    if (existingActiveSupers.length > 0) {
      await execute(`
        UPDATE users SET status = 'temp_suspended_for_test'
        WHERE id IN (${existingActiveSupers.map(() => '?').join(',')})
      `, existingActiveSupers.map((u: any) => u.id));
    }

    // Seed test users
    const masterSuperAdminId = `master-super-${runId}`;
    const superAdmin2Id = `super-2-${runId}`;
    const superAdmin3Id = `super-3-${runId}`;
    const normalAdminId = `normal-admin-${runId}`;

    const masterPassword = 'MasterSecret123!';
    const normalPassword = 'NormalSecret123!';

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'super_admin', 'active', 1, ?, ?)
    `, [masterSuperAdminId, `master_${runId}@koinonia.test`, hashPassword(masterPassword), nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'super_admin', 'active', 1, ?, ?)
    `, [superAdmin2Id, `super2_${runId}@koinonia.test`, hashPassword('Super2Secret123!'), nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'super_admin', 'active', 1, ?, ?)
    `, [superAdmin3Id, `super3_${runId}@koinonia.test`, hashPassword('Super3Secret123!'), nowIso, nowIso]);

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 'active', 1, ?, ?)
    `, [normalAdminId, `normal_${runId}@koinonia.test`, hashPassword(normalPassword), nowIso, nowIso]);

    // Authorized super admin service caller (status='system_service' so not counted in active super admin count)
    const systemCallerId = `system-caller-${runId}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, '', 'super_admin', 'system_service', 1, ?, ?)
    `, [systemCallerId, `system_caller_${runId}@koinonia.test`, nowIso, nowIso]);

    const masterToken = generateToken(masterSuperAdminId);
    const super2Token = generateToken(superAdmin2Id);
    const normalAdminToken = generateToken(normalAdminId);
    const systemCallerToken = generateToken(systemCallerId);

    // -------------------------------------------------------------------------
    // 1. Super Admin removes ordinary Admin -> PASS
    // -------------------------------------------------------------------------
    const testAdminId = `removable-admin-${runId}`;
    const testAdminPassword = 'TestAdminPass123!';
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 'active', 1, ?, ?)
    `, [testAdminId, `admin_todel_${runId}@koinonia.test`, hashPassword(testAdminPassword), nowIso, nowIso]);

    await runTest('1. Super Admin removes ordinary Admin -> PASS', async () => {
      const res = await fetch(`${baseUrl}/api/admin/team/remove-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${masterToken}`
        },
        body: JSON.stringify({ userId: testAdminId })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected 200 but got ${res.status}: ${JSON.stringify(body)}`);
      assert(body.success === true, 'Expected success true');

      const user = await queryOne('SELECT * FROM users WHERE id = ?', [testAdminId]);
      assert(user.status === 'revoked', `Expected status revoked, got ${user.status}`);
      assert(user.role === 'parent', `Expected role demoted to parent, got ${user.role}`);
    });

    // -------------------------------------------------------------------------
    // 2. Super Admin removes another Super Admin when 2+ active remain -> PASS
    // -------------------------------------------------------------------------
    await runTest('2. Super Admin removes another Super Admin when 2+ active remain -> PASS', async () => {
      // Currently active: masterSuperAdmin, superAdmin2, superAdmin3 (3 active)
      const res = await fetch(`${baseUrl}/api/admin/team/remove-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${masterToken}`
        },
        body: JSON.stringify({ userId: superAdmin3Id })
      });

      const body = await res.json();
      assert(res.status === 200, `Expected 200 but got ${res.status}: ${JSON.stringify(body)}`);
      assert(body.success === true, 'Expected success true');

      const user = await queryOne('SELECT * FROM users WHERE id = ?', [superAdmin3Id]);
      assert(user.status === 'revoked', `Expected status revoked, got ${user.status}`);
    });

    // -------------------------------------------------------------------------
    // 3. Last active Super Admin removal -> BLOCKED
    // -------------------------------------------------------------------------
    await runTest('3. Last active Super Admin removal -> BLOCKED', async () => {
      // Remove superAdmin2 so masterSuperAdminId is the ONLY active super admin
      await fetch(`${baseUrl}/api/admin/team/remove-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${masterToken}`
        },
        body: JSON.stringify({ userId: superAdmin2Id })
      });

      // Now masterSuperAdminId is the sole active super admin.
      // Use the authorized super admin service caller (systemCallerToken) to attempt removal
      const res = await fetch(`${baseUrl}/api/admin/team/remove-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${systemCallerToken}`
        },
        body: JSON.stringify({ userId: masterSuperAdminId })
      });

      const body = await res.json();
      assert(res.status === 400, `Expected 400, got ${res.status}: ${JSON.stringify(body)}`);
      assert(body.code === 'LAST_SUPER_ADMIN', `Expected LAST_SUPER_ADMIN, got ${body.code}`);
      assert(
        body.error === 'This Super Admin cannot be removed because at least one Super Admin must remain.',
        `Unexpected error message: ${body.error}`
      );

      // Verify masterSuperAdmin is still active
      const masterUser = await queryOne('SELECT status, role FROM users WHERE id = ?', [masterSuperAdminId]);
      assert(masterUser.status === 'active', `Expected status active, got ${masterUser.status}`);
      assert(masterUser.role === 'super_admin', `Expected role super_admin, got ${masterUser.role}`);
    });

    // -------------------------------------------------------------------------
    // 4. Pending Super Admin invite does NOT count as active Super Admin
    // -------------------------------------------------------------------------
    await runTest('4. Pending Super Admin invite does NOT count as active Super Admin', async () => {
      // Seed a pending invited super admin
      const pendingSuperId = `pending-super-${runId}`;
      await execute(`
        INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
        VALUES (?, ?, 'invited_pending', 'super_admin', 'invited', 0, ?, ?)
      `, [pendingSuperId, `pending_super_${runId}@koinonia.test`, nowIso, nowIso]);

      // Query active super admins count excluding masterSuperAdminId
      const activeCount = await queryOne(
        `SELECT COUNT(*) as count FROM users 
         WHERE role = 'super_admin' 
           AND (status = 'active' OR status IS NULL)
           AND (status IS NULL OR status NOT IN ('revoked', 'suspended', 'disabled', 'invited'))
           AND password_hash IS NOT NULL 
           AND password_hash != '' 
           AND password_hash != 'invited_pending'
           AND id != ?`,
        [masterSuperAdminId]
      );
      assert(Number(activeCount.count) === 0, `Pending super admin must NOT count as active. Count: ${activeCount.count}`);

      // Attempting to remove masterSuperAdminId with pending super admin in DB must STILL fail with LAST_SUPER_ADMIN
      const res = await fetch(`${baseUrl}/api/admin/team/remove-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${systemCallerToken}`
        },
        body: JSON.stringify({ userId: masterSuperAdminId })
      });

      const body = await res.json();
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      assert(body.code === 'LAST_SUPER_ADMIN', `Expected LAST_SUPER_ADMIN with pending invite present, got ${body.code}`);
    });

    // -------------------------------------------------------------------------
    // 5. Revoked Super Admin does NOT count
    // -------------------------------------------------------------------------
    await runTest('5. Revoked Super Admin does NOT count', async () => {
      // superAdmin2Id and superAdmin3Id are already revoked
      const activeCount = await queryOne(
        `SELECT COUNT(*) as count FROM users 
         WHERE role = 'super_admin' 
           AND (status = 'active' OR status IS NULL)
           AND (status IS NULL OR status NOT IN ('revoked', 'suspended', 'disabled', 'invited'))
           AND password_hash IS NOT NULL 
           AND password_hash != '' 
           AND password_hash != 'invited_pending'
           AND id != ?`,
        [masterSuperAdminId]
      );
      assert(Number(activeCount.count) === 0, `Revoked super admins must NOT count as active. Count: ${activeCount.count}`);
    });

    // -------------------------------------------------------------------------
    // 6. Ordinary Admin attempts removal -> BLOCKED
    // -------------------------------------------------------------------------
    await runTest('6. Ordinary Admin attempts removal -> BLOCKED', async () => {
      const res = await fetch(`${baseUrl}/api/admin/team/remove-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${normalAdminToken}`
        },
        body: JSON.stringify({ userId: masterSuperAdminId })
      });

      const body = await res.json();
      assert(res.status === 403, `Expected status 403 but got ${res.status}`);
      assert(body.code === 'SUPER_ADMIN_REQUIRED', `Expected SUPER_ADMIN_REQUIRED, got ${body.code}`);
      assert(body.error === 'Only Super Administrators can remove administrative access.', `Unexpected error: ${body.error}`);
    });

    // -------------------------------------------------------------------------
    // 7. Self-removal -> BLOCKED
    // -------------------------------------------------------------------------
    await runTest('7. Self-removal -> BLOCKED', async () => {
      const res = await fetch(`${baseUrl}/api/admin/team/remove-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${masterToken}`
        },
        body: JSON.stringify({ userId: masterSuperAdminId })
      });

      const body = await res.json();
      assert(res.status === 400, `Expected status 400 but got ${res.status}`);
      assert(body.code === 'SELF_REMOVAL_NOT_ALLOWED', `Expected SELF_REMOVAL_NOT_ALLOWED, got ${body.code}`);
      assert(body.error === 'You cannot remove your own access while signed in.', `Unexpected error: ${body.error}`);
    });

    // -------------------------------------------------------------------------
    // 8. Pending invited Admin removal -> PASS
    // 9. Outstanding invite token revoked -> PASS
    // -------------------------------------------------------------------------
    const pendingAdminId = `pending-admin-${runId}`;
    const rawInviteToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawInviteToken).digest('hex');

    await runTest('8. Pending invited Admin removal -> PASS', async () => {
      // Seed pending invited admin
      await execute(`
        INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
        VALUES (?, ?, 'invited_pending', 'admin', 'invited', 0, ?, ?)
      `, [pendingAdminId, `pending_admin_${runId}@koinonia.test`, nowIso, nowIso]);

      // Seed auth token
      await execute(`
        INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
        VALUES (?, ?, ?, 'admin_invite', ?, ?)
      `, [crypto.randomUUID(), pendingAdminId, tokenHash, new Date(Date.now() + 72 * 3600 * 1000).toISOString(), nowIso]);

      // Remove via DELETE /api/admin/team-members/:userId
      const res = await fetch(`${baseUrl}/api/admin/team-members/${pendingAdminId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${masterToken}`
        }
      });

      const body = await res.json();
      assert(res.status === 200, `Expected 200 but got ${res.status}: ${JSON.stringify(body)}`);
      assert(body.success === true, 'Expected success true');

      const user = await queryOne('SELECT * FROM users WHERE id = ?', [pendingAdminId]);
      assert(user.status === 'revoked', `Expected status revoked, got ${user.status}`);
    });

    await runTest('9. Outstanding invite token revoked -> PASS', async () => {
      // Verify token in DB has revoked_at populated
      const token = await queryOne('SELECT * FROM auth_tokens WHERE token_hash = ?', [tokenHash]);
      assert(token.revoked_at !== null, 'Token revoked_at was not populated');
      assert(token.revoked_by === masterSuperAdminId, `Expected revoked_by ${masterSuperAdminId}, got ${token.revoked_by}`);

      // Verify verify-invite endpoint rejects the token
      const verifyRes = await fetch(`${baseUrl}/api/admin/verify-invite?token=${rawInviteToken}`);
      const verifyBody = await verifyRes.json();
      assert(verifyRes.status === 400, `Expected 400 for revoked token, got ${verifyRes.status}`);
      assert(verifyBody.code === 'INVITATION_REVOKED', `Expected INVITATION_REVOKED, got ${verifyBody.code}`);
    });

    // -------------------------------------------------------------------------
    // 10. Removed Admin cannot authenticate afterward
    // -------------------------------------------------------------------------
    await runTest('10. Removed Admin cannot authenticate afterward (JWT denied & login blocked)', async () => {
      // testAdminId was removed in Test 1
      const removedToken = generateToken(testAdminId);

      // Attempt 1: Call authenticated admin route with removed user's JWT
      const reqRes = await fetch(`${baseUrl}/api/admin/admins`, {
        headers: { 'Authorization': `Bearer ${removedToken}` }
      });
      // Should be rejected with 403 because user.status is 'revoked'
      assert(reqRes.status === 403, `Expected 403 for revoked admin token, got ${reqRes.status}`);

      // Attempt 2: Try logging in with email and password to admin sign-in
      const adminLoginRes = await fetch(`${baseUrl}/api/admin/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `admin_todel_${runId}@koinonia.test`,
          password: testAdminPassword
        })
      });

      const adminLoginBody = await adminLoginRes.json();
      assert(adminLoginRes.status === 403, `Expected 403 for revoked admin login, got ${adminLoginRes.status}`);
      assert(
        adminLoginBody.code === 'ACCOUNT_BLOCKED' || adminLoginBody.code === 'ADMIN_ACCESS_REQUIRED',
        `Expected ACCOUNT_BLOCKED or ADMIN_ACCESS_REQUIRED, got ${adminLoginBody.code}`
      );

      // Attempt 3: Try logging in to auth sign-in
      const authLoginRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `admin_todel_${runId}@koinonia.test`,
          password: testAdminPassword
        })
      });

      const authLoginBody = await authLoginRes.json();
      assert(authLoginRes.status === 403, `Expected 403 for revoked auth login, got ${authLoginRes.status}`);
      assert(authLoginBody.code === 'ACCOUNT_BLOCKED', `Expected ACCOUNT_BLOCKED, got ${authLoginBody.code}`);
    });

    // -------------------------------------------------------------------------
    // 11. Audit record preserved/created
    // -------------------------------------------------------------------------
    await runTest('11. Audit record preserved/created', async () => {
      const log = await queryOne(
        "SELECT * FROM audit_logs WHERE action = 'REMOVE_ADMIN_ACCESS' AND target_id = ? ORDER BY timestamp DESC",
        [testAdminId]
      );
      assert(!!log, 'Audit log record for REMOVE_ADMIN_ACCESS was not created');
      assert(log.user_id === masterSuperAdminId, `Expected user_id ${masterSuperAdminId}, got ${log.user_id}`);
      assert(log.user_role === 'super_admin', `Expected user_role super_admin, got ${log.user_role}`);
      assert(log.timestamp !== null, 'Timestamp is missing');

      const details = JSON.parse(log.details);
      assert(details.email === `admin_todel_${runId}@koinonia.test`, `Unexpected email in details: ${details.email}`);
      assert(details.previousRole === 'admin', `Unexpected previousRole in details: ${details.previousRole}`);
    });

    // -------------------------------------------------------------------------
    // 12. Concurrent last-super-admin protection
    // -------------------------------------------------------------------------
    await runTest('12. Concurrent last-super-admin protection', async () => {
      // Seed two fresh active super admins
      const concurrent1Id = `conc-1-${runId}`;
      const concurrent2Id = `conc-2-${runId}`;

      await execute(`
        INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 'super_admin', 'active', 1, ?, ?)
      `, [concurrent1Id, `conc1_${runId}@koinonia.test`, hashPassword('Conc1Pass123!'), nowIso, nowIso]);

      await execute(`
        INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 'super_admin', 'active', 1, ?, ?)
      `, [concurrent2Id, `conc2_${runId}@koinonia.test`, hashPassword('Conc2Pass123!'), nowIso, nowIso]);

      // Remove masterSuperAdmin so ONLY concurrent1Id and concurrent2Id exist as active super admins
      await execute("UPDATE users SET status = 'revoked' WHERE id = ?", [masterSuperAdminId]);

      // Verify DB now has EXACTLY 2 active super admins (conc1 and conc2)
      const countBefore = await queryOne(`
        SELECT COUNT(*) as count FROM users
        WHERE role = 'super_admin'
          AND status = 'active'
          AND password_hash IS NOT NULL
          AND password_hash != ''
          AND password_hash != 'invited_pending'
      `);
      assert(Number(countBefore.count) === 2, `Expected exactly 2 active super admins before race, got ${countBefore.count}`);

      // Caller 1 is concurrent1Id trying to remove concurrent2Id.
      // Caller 2 is authorized systemCallerId trying to remove concurrent1Id simultaneously.
      const token1 = generateToken(concurrent1Id);
      const token2 = generateToken(systemCallerId);

      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/api/admin/team/remove-access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
          body: JSON.stringify({ userId: concurrent2Id })
        }),
        fetch(`${baseUrl}/api/admin/team/remove-access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token2}` },
          body: JSON.stringify({ userId: concurrent1Id })
        })
      ]);

      const [body1, body2] = await Promise.all([res1.json(), res2.json()]);

      // Exactly ONE must succeed and the other must be rejected
      const successes = [body1.success, body2.success].filter(Boolean).length;
      assert(successes === 1, `Expected exactly 1 removal to succeed, but ${successes} succeeded. Res1: ${JSON.stringify(body1)}, Res2: ${JSON.stringify(body2)}`);

      // Verify that the other response has code LAST_SUPER_ADMIN
      const lastSuperAdminErrors = [body1.code, body2.code].filter(c => c === 'LAST_SUPER_ADMIN').length;
      assert(lastSuperAdminErrors === 1, `Expected 1 LAST_SUPER_ADMIN error, got ${lastSuperAdminErrors}. Res1: ${JSON.stringify(body1)}, Res2: ${JSON.stringify(body2)}`);

      // Verify in DB that exactly ONE active Super Admin remains
      const remainingActive = await query(
        `SELECT id FROM users 
         WHERE role = 'super_admin' 
           AND status = 'active'
           AND password_hash != 'invited_pending'
           AND (id = ? OR id = ?)`,
        [concurrent1Id, concurrent2Id]
      );
      assert(remainingActive.length === 1, `Expected exactly 1 active Super Admin in DB, found ${remainingActive.length}`);
    });

  } finally {
    // Restore any pre-existing active super admins that were temporarily suspended
    if (existingActiveSupers.length > 0) {
      await execute(`
        UPDATE users SET status = 'active'
        WHERE id IN (${existingActiveSupers.map(() => '?').join(',')})
      `, existingActiveSupers.map((u: any) => u.id));
    }

    server.close();
  }

  console.log(`\nResults: ${passedCount} passed, ${failedCount} failed.`);
  if (failedCount > 0) {
    console.error('Failed tests:', failures);
    process.exit(1);
  } else {
    console.log('ALL 12 ADMIN REMOVAL TESTS PASSED SUCCESSFULLY.\n');
  }
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
