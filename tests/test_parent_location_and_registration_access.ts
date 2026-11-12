/**
 * tests/test_parent_location_and_registration_access.ts
 *
 * Regression suite for:
 * 1) Removing synthetic UK/Nigeria location defaults for Admin-created Parents (Scenarios A–D)
 * 2) Zero-child Parent registration access emails & bulk routing (Scenarios E–K)
 *
 * Runs isolated against a temporary SQLite database in os.tmpdir() with mocked email dispatch.
 * Never sends real emails or touches production records.
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import assert from 'node:assert/strict';
import express from 'express';

const tempDbPath = path.join(os.tmpdir(), `koinonia-parent-loc-access-${Date.now()}.sqlite`);

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
    console.error(`    ${err.stack || err.message}`);
    failures.push(name);
    failedCount++;
  }
}

async function main() {
  console.log('\n=== PARENT LOCATION & ZERO-CHILD REGISTRATION ACCESS TEST SUITE ===\n');

  process.env.TEST_SQLITE_PATH = tempDbPath;
  delete process.env.DATABASE_URL;
  process.env.ENABLE_EMAIL_TEST_MOCK = 'true';

  const { execute, query, queryOne } = await import('../src/server/db');
  const { generateToken, hashPassword } = await import('../src/server/auth');
  const {
    sendRegistrationAccessEmailForParent,
    sendBulkRegistrationAccessEmails,
    buildRegistrationEmailStatsMap
  } = await import('../src/server/services/parentRegistrationAccessService');
  const adminRoutes = (await import('../src/server/routes/admin')).default;

  const now = new Date().toISOString();
  const adminUserId = `admin-parent-test-${crypto.randomUUID()}`;
  await execute(
    `INSERT INTO users (id, email, role, created_at, updated_at) VALUES (?, ?, 'admin', ?, ?)`,
    [adminUserId, `admin_loc_${Date.now()}@koinonia.test`, now, now]
  );
  const adminToken = generateToken(adminUserId);

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  let server: any;
  let baseUrl = '';
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const port = (server.address() as any).port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    let blankLocationParentId = '';

    // A: Admin-created Parent with no location -> country = null, city = null, state = null
    await runTest('A: POST /api/admin/parents without country stores NULL instead of UK', async () => {
      const res = await fetch(`${baseUrl}/api/admin/parents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          firstName: 'Blank',
          lastName: 'LocationParent',
          email: 'blank.loc@koinonia.test',
          sendInvitation: false
        })
      });
      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);
      blankLocationParentId = data.parentId;

      const row = await queryOne<any>('SELECT * FROM parent_profiles WHERE id = ?', [blankLocationParentId]);
      assert.ok(row);
      assert.equal(row.country, null, 'country must be null when omitted');
      assert.equal(row.city, null, 'city must be null when omitted');
      assert.equal(row.state_region, null, 'state_region must be null when omitted');
      assert.equal(row.home_address, null, 'home_address must be null when omitted');
    });

    // B: GET /api/admin/parents & GET /api/admin/parents/:id reflect missing location properly
    await runTest('B: Parents list and detail return null location / Location not provided', async () => {
      const listRes = await fetch(`${baseUrl}/api/admin/parents?q=blank.loc@koinonia.test`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(listRes.status, 200);
      const listData: any = await listRes.json();
      const rec = listData.parents.find((p: any) => p.id === blankLocationParentId);
      assert.ok(rec);
      assert.equal(rec.country, null);
      assert.equal(rec.city, null);
      assert.equal(rec.stateRegion, null);

      const detRes = await fetch(`${baseUrl}/api/admin/parents/${blankLocationParentId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(detRes.status, 200);
      const detData: any = await detRes.json();
      assert.equal(detData.parent.country, null);
      assert.equal(detData.parent.location, 'Location not provided');
    });

    // C: Explicit United Kingdom is preserved AND PUT can clear legacy Country back to NULL
    await runTest('C: Explicit United Kingdom is preserved and PUT /parents/:id allows clearing country', async () => {
      const res = await fetch(`${baseUrl}/api/admin/parents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          firstName: 'London',
          lastName: 'Parent',
          email: 'london.uk@koinonia.test',
          country: 'United Kingdom',
          city: 'London',
          sendInvitation: false
        })
      });
      assert.equal(res.status, 200);
      const data: any = await res.json();
      const row = await queryOne<any>('SELECT * FROM parent_profiles WHERE id = ?', [data.parentId]);
      assert.equal(row.country, 'United Kingdom');
      assert.equal(row.city, 'London');

      // Verify Admin can clear Country on edit
      const putRes = await fetch(`${baseUrl}/api/admin/parents/${data.parentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          country: '',
          city: ''
        })
      });
      assert.equal(putRes.status, 200);
      const updated = await queryOne<any>('SELECT * FROM parent_profiles WHERE id = ?', [data.parentId]);
      assert.equal(updated.country, null, 'PUT must allow clearing country to null');
      assert.equal(updated.city, null, 'PUT must allow clearing city to null');
    });

    // D: Explicit Nigeria is preserved
    await runTest('D: Explicit Nigeria country is preserved verbatim', async () => {
      const res = await fetch(`${baseUrl}/api/admin/parents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          firstName: 'Abuja',
          lastName: 'Parent',
          email: 'abuja.ng@koinonia.test',
          city: 'Abuja',
          stateProvince: 'FCT',
          country: 'Nigeria',
          sendInvitation: false
        })
      });
      assert.equal(res.status, 200);
      const data: any = await res.json();
      const row = await queryOne<any>('SELECT * FROM parent_profiles WHERE id = ?', [data.parentId]);
      assert.equal(row.country, 'Nigeria');
      assert.equal(row.city, 'Abuja');
      assert.equal(row.state_region, 'FCT');
    });

    // Helper to seed isolated test parents for Registration Access scenarios
    async function seedTestParent(opts: {
      email: string;
      name: string;
      passwordHash: string;
      withChild?: boolean;
      seedFailedLog?: boolean;
    }) {
      const uid = `u-${crypto.randomUUID()}`;
      const pid = `p-${crypto.randomUUID()}`;
      await execute(
        `INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at) VALUES (?, ?, ?, 'parent', ?, ?, ?)`,
        [uid, opts.email, opts.passwordHash, opts.passwordHash.startsWith('scrypt$') || opts.passwordHash === 'hashed_pw' ? 1 : 0, now, now]
      );
      await execute(
        `INSERT INTO parent_profiles (id, user_id, full_name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [pid, uid, opts.name, opts.email, now, now]
      );
      if (opts.passwordHash === 'invited_pending') {
        const tokHash = crypto.createHash('sha256').update(`old-tok-${uid}`).digest('hex');
        await execute(
          `INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at) VALUES (?, ?, ?, 'admin_invite', ?, ?)`,
          [crypto.randomUUID(), uid, tokHash, new Date(Date.now() + 86400000).toISOString(), now]
        );
      }
      if (opts.seedFailedLog) {
        await execute(
          `INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp) VALUES (?, ?, 'admin', 'SEND_INVITATION', 'user', ?, ?, ?)`,
          [crypto.randomUUID(), adminUserId, uid, JSON.stringify({ email: opts.email, status: 'failed', error: 'Mock failure' }), now]
        );
      }
      if (opts.withChild) {
        await execute(
          `INSERT INTO children (id, parent_profile_id, full_name, date_of_birth, gender, created_at, updated_at) VALUES (?, ?, 'Seeded Child', '2018-06-01', 'female', ?, ?)`,
          [crypto.randomUUID(), pid, now, now]
        );
      }
      return { uid, pid };
    }

    // E: no_account + 0 children -> same user reused, invite generated, invite email sent
    const noAccountParent = await seedTestParent({
      email: 'noaccount@koinonia.test',
      name: 'Grace NoAccount',
      passwordHash: 'profile_no_account'
    });

    await runTest('E: no_account zero-child parent reuses same user ID, generates token, sends invite email', async () => {
      const sentInvites: any[] = [];
      const res = await sendRegistrationAccessEmailForParent({
        parentId: noAccountParent.pid,
        adminUserId,
        adminRole: 'admin',
        emailOverrides: {
          sendInvite: async (p) => {
            sentInvites.push(p);
            return { success: true, id: 'mock-invite-1' };
          }
        }
      });

      assert.equal(res.success, true);
      assert.equal(res.action, 'invitation_sent');
      assert.equal(sentInvites.length, 1);
      assert.ok(sentInvites[0].inviteLink.includes('/admin/accept-invite?token='));

      const userRow = await queryOne<any>('SELECT * FROM users WHERE id = ?', [noAccountParent.uid]);
      assert.equal(userRow.id, noAccountParent.uid);
      assert.equal(userRow.password_hash, 'invited_pending');

      const tokens = await query<any>('SELECT * FROM auth_tokens WHERE user_id = ? AND revoked_at IS NULL', [noAccountParent.uid]);
      assert.equal(tokens.length, 1);

      const stats = await buildRegistrationEmailStatsMap([noAccountParent.uid]);
      assert.equal(stats[noAccountParent.uid].registrationEmailCount, 1);
    });

    // F: invitation_pending + 0 children -> old token revoked, new token created, email resent
    await runTest('F: invitation_pending revokes old unused token, generates new token, resends invite & increments count', async () => {
      const sentResends: any[] = [];
      const res = await sendRegistrationAccessEmailForParent({
        parentId: noAccountParent.pid,
        adminUserId,
        adminRole: 'admin',
        emailOverrides: {
          sendInvite: async (p) => {
            sentResends.push(p);
            return { success: true, id: 'mock-resend-2' };
          }
        }
      });

      assert.equal(res.success, true);
      assert.equal(res.action, 'invitation_resent');
      assert.equal(sentResends.length, 1);

      const activeTokens = await query<any>('SELECT * FROM auth_tokens WHERE user_id = ? AND revoked_at IS NULL', [noAccountParent.uid]);
      const revokedTokens = await query<any>('SELECT * FROM auth_tokens WHERE user_id = ? AND revoked_at IS NOT NULL', [noAccountParent.uid]);
      assert.equal(activeTokens.length, 1);
      assert.equal(revokedTokens.length, 1);

      const stats = await buildRegistrationEmailStatsMap([noAccountParent.uid]);
      assert.equal(stats[noAccountParent.uid].registrationEmailCount, 2);
    });

    // G: email_delivery_failed + 0 children -> retry allowed & succeeds
    const failedParent = await seedTestParent({
      email: 'failedprev@koinonia.test',
      name: 'David FailedBefore',
      passwordHash: 'invited_pending',
      seedFailedLog: true
    });

    await runTest('G: email_delivery_failed allows safe retry and sends fresh invitation', async () => {
      const sentRetries: any[] = [];
      const res = await sendRegistrationAccessEmailForParent({
        parentId: failedParent.pid,
        adminUserId,
        adminRole: 'admin',
        emailOverrides: {
          sendInvite: async (p) => {
            sentRetries.push(p);
            return { success: true, id: 'mock-retry-1' };
          }
        }
      });
      assert.equal(res.success, true);
      assert.equal(res.action, 'invitation_resent');
      assert.equal(sentRetries.length, 1);
      const stats = await buildRegistrationEmailStatsMap([failedParent.uid]);
      assert.equal(stats[failedParent.uid].lastRegistrationEmailStatus, 'sent');
      assert.equal(stats[failedParent.uid].registrationEmailCount, 1);
    });

    // H: active + 0 children -> reminder only, NO password/token mutation
    const realHash = hashPassword('StrongPassword123!');
    const activeZeroParent = await seedTestParent({
      email: 'activezero@koinonia.test',
      name: 'Mary ActiveZero',
      passwordHash: realHash
    });

    await runTest('H: active zero-child parent sends reminder only without mutating password or creating tokens', async () => {
      const sentReminders: any[] = [];
      const res = await sendRegistrationAccessEmailForParent({
        parentId: activeZeroParent.pid,
        adminUserId,
        adminRole: 'admin',
        emailOverrides: {
          sendReminder: async (p) => {
            sentReminders.push(p);
            return { success: true, id: 'mock-rem-1' };
          }
        }
      });

      assert.equal(res.success, true);
      assert.equal(res.action, 'registration_reminder_sent');
      assert.equal(sentReminders.length, 1);
      assert.ok(sentReminders[0].signInUrl.includes('/parent/sign-in'));

      const userRow = await queryOne<any>('SELECT * FROM users WHERE id = ?', [activeZeroParent.uid]);
      assert.equal(userRow.password_hash, realHash, 'Password hash must remain untouched');
      const tokens = await query<any>('SELECT * FROM auth_tokens WHERE user_id = ?', [activeZeroParent.uid]);
      assert.equal(tokens.length, 0, 'Active parent reminder must not create invite tokens');
    });

    // J: email provider failure reports failure accurately
    const providerFailParent = await seedTestParent({
      email: 'providerfail@koinonia.test',
      name: 'Paul ProviderFail',
      passwordHash: 'profile_no_account'
    });

    await runTest('J: provider failure returns EMAIL_DELIVERY_FAILED and never reports false success', async () => {
      const res = await sendRegistrationAccessEmailForParent({
        parentId: providerFailParent.pid,
        adminUserId,
        adminRole: 'admin',
        emailOverrides: {
          sendInvite: async () => ({ success: false, error: 'Resend API 503' })
        }
      });
      assert.equal(res.success, false);
      assert.equal(res.code, 'EMAIL_DELIVERY_FAILED');
      assert.equal(res.status, 'failed');

      const stats = await buildRegistrationEmailStatsMap([providerFailParent.uid]);
      assert.equal(stats[providerFailParent.uid].registrationEmailCount, 0);
      assert.equal(stats[providerFailParent.uid].lastRegistrationEmailStatus, 'failed');
    });

    // K: parent with existing child is skipped/rejected
    const parentWithChild = await seedTestParent({
      email: 'withchild@koinonia.test',
      name: 'Ruth WithChild',
      passwordHash: hashPassword('Pass123!'),
      withChild: true
    });

    await runTest('K: parent who already has children is skipped/rejected from zero-child action', async () => {
      const res = await fetch(`${baseUrl}/api/admin/parents/${parentWithChild.pid}/registration-access-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 400);
      const data: any = await res.json();
      assert.equal(data.code, 'PARENT_HAS_CHILDREN');
    });

    // I: Bulk mixed statuses (no_account, pending, active, with-child skipped, one failure)
    const bulkNoAcct = await seedTestParent({ email: 'bulk1@koinonia.test', name: 'Bulk One', passwordHash: 'profile_no_account' });
    const bulkPending = await seedTestParent({ email: 'bulk2@koinonia.test', name: 'Bulk Two', passwordHash: 'invited_pending' });
    const bulkActive = await seedTestParent({ email: 'bulk3@koinonia.test', name: 'Bulk Three', passwordHash: hashPassword('Pw123456!') });
    const bulkFail = await seedTestParent({ email: 'bulkfail@koinonia.test', name: 'Bulk Fail', passwordHash: 'profile_no_account' });

    await runTest('I: bulk mixed states routes each recipient safely and isolates single failure/skip', async () => {
      const bulkRes = await sendBulkRegistrationAccessEmails({
        parentIds: [bulkNoAcct.pid, bulkPending.pid, bulkActive.pid, bulkFail.pid, parentWithChild.pid],
        adminUserId,
        adminRole: 'admin',
        emailOverrides: {
          sendInvite: async (p) => {
            if (p.recipientEmail === 'bulkfail@koinonia.test') {
              return { success: false, error: 'Mock mailbox bounce' };
            }
            return { success: true, id: `mock-${p.recipientEmail}` };
          },
          sendReminder: async (p) => ({ success: true, id: `mock-rem-${p.recipientEmail}` })
        }
      });

      assert.equal(bulkRes.requested, 5);
      assert.equal(bulkRes.sent, 3);
      assert.equal(bulkRes.failed, 1);
      assert.equal(bulkRes.skipped, 1);

      const byId = Object.fromEntries(bulkRes.results.map((r) => [r.parentId, r]));
      assert.equal(byId[bulkNoAcct.pid].action, 'invitation_sent');
      assert.equal(byId[bulkPending.pid].action, 'invitation_resent');
      assert.equal(byId[bulkActive.pid].action, 'registration_reminder_sent');
      assert.equal(byId[bulkFail.pid].status, 'failed');
      assert.equal(byId[parentWithChild.pid].status, 'skipped');
    });
  } finally {
    server.close();
    try {
      for (const suffix of ['', '-wal', '-shm']) {
        const f = `${tempDbPath}${suffix}`;
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    } catch {}
  }

  console.log('\n-------------------------------------------------------------');
  console.log(`Results: ${passedCount} passed, ${failedCount} failed.`);
  if (failures.length > 0) {
    process.exit(1);
  }
  console.log('ALL PARENT LOCATION & REGISTRATION ACCESS SCENARIOS (A–K) PASSED!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
