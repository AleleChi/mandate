import express from 'express';
import http from 'http';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Force isolated test SQLite database BEFORE importing db/auth/routes
const tempDbPath = path.join(os.tmpdir(), `test-closure-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.sqlite`);
process.env.TEST_SQLITE_PATH = tempDbPath;
delete process.env.DATABASE_URL;
process.env.EMAIL_PROVIDER = 'simulated';

import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken, hashPassword } from '../src/server/auth';
import authRoutes from '../src/server/routes/auth';
import parentRoutes from '../src/server/routes/parent';
import adminRoutes from '../src/server/routes/admin';

async function runTestSuite() {
  console.log('================================================================');
  console.log('FOCUSED REGRESSION TEST SUITE: PARENT REGISTRATION ACCESS        ');
  console.log('SCENARIOS A - O (15 TEST CASES)                                 ');
  console.log('================================================================\n');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const now = new Date();
  const pastIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago
  const farPastIso = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(); // 48h ago

  // Archive any pre-existing seeded current events in the temp DB so exactly 1 current event exists
  await execute("UPDATE events SET status = 'archived' WHERE status = 'current'");

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/parent', parentRoutes);
  app.use('/api/admin', adminRoutes);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const results: Record<string, boolean> = {};

  const makeRequest = async (path: string, options: any = {}, token?: string) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, body: data };
  };

  try {
    // Setup test event where public parent registration is CLOSED:
    // parent_access_opens_at: 48h ago, parent_access_closes_at: 24h ago (closed)
    const testEventId = `ev-test-closed-${testRunId}`;
    await execute(`
      INSERT INTO events (
        id, title, status, parent_access_opens_at, parent_access_closes_at,
        parents_can_create_account, allow_multiple_children, allow_save_and_continue,
        minimum_age, maximum_age, capacity, created_at, updated_at
      ) VALUES (?, 'Annual Conference 2026', 'current', ?, ?, 1, 1, 1, 2, 14, 100, ?, ?)
    `, [testEventId, farPastIso, pastIso, pastIso, pastIso]);

    // Setup Admin User & Token
    const adminUserId = `usr-admin-${testRunId}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 'active', 1, ?, ?)
    `, [adminUserId, `admin-${testRunId}@church.org`, hashPassword('AdminPass123!'), pastIso, pastIso]);
    const adminToken = generateToken(adminUserId);

    // Setup Existing Authenticated Parent User & Profile (created before closure)
    const existingParentUserId = `usr-parent-${testRunId}`;
    const existingParentProfileId = `prof-parent-${testRunId}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'parent', 'active', 1, ?, ?)
    `, [existingParentUserId, `parent-${testRunId}@family.org`, hashPassword('ParentPass123!'), pastIso, pastIso]);
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'Grace Adeleke', 'parent-${testRunId}@family.org', '+2348012345678', 'photo_parent_1', ?, ?)
    `, [existingParentProfileId, existingParentUserId, pastIso, pastIso]);
    const existingParentToken = generateToken(existingParentUserId);

    // =========================================================================
    // REGISTRATION MATRIX: SCENARIOS A - H
    // =========================================================================
    console.log('--- REGISTRATION MATRIX (A - H) ---');

    // Scenario A: Unauthenticated public parent registration attempt -> blocked
    {
      const regRes = await makeRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Public Visitor',
          email: `public-${testRunId}@visitor.com`,
          phone: '+2348099990000',
          password: 'Password123!'
        })
      });
      const statusRes = await makeRequest('/api/auth/registration-status');
      const pass = regRes.status === 403 &&
        regRes.body.code === 'REGISTRATION_CLOSED' &&
        statusRes.body.parent?.isOpen === false &&
        statusRes.body.parent?.state === 'closed';
      results['A: Public registration closed blocks unauthenticated account creation'] = Boolean(pass);
      console.log(`Scenario A (Public closed): ${pass ? 'PASS' : 'FAIL'} (status: ${regRes.status}, code: ${regRes.body.code}, isOpen: ${statusRes.body.parent?.isOpen})`);
    }

    // Scenario B: Existing authenticated parent creates child draft after public close -> success
    let childIdB = '';
    {
      const draftRes = await makeRequest('/api/parent/children/draft', {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Tobi Adeleke',
          gender: 'Male',
          dob: '2015-06-10'
        })
      }, existingParentToken);
      childIdB = draftRes.body?.id;
      const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childIdB, testEventId]);
      const pass = draftRes.status === 201 && childIdB && entry && entry.status === 'incomplete';
      results['B: Existing authenticated parent creates child draft after close'] = Boolean(pass);
      console.log(`Scenario B (Create draft after close): ${pass ? 'PASS' : 'FAIL'} (status: ${draftRes.status}, childId: ${childIdB})`);
    }

    // Scenario C: Authenticated parent saves incomplete child -> persists as incomplete
    {
      const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childIdB, testEventId]);
      const pass = entry && entry.status === 'incomplete' && entry.submitted_at === null && entry.details_confirmed === 0;
      results['C: Incomplete child persists in draft/incomplete state'] = Boolean(pass);
      console.log(`Scenario C (Incomplete draft persists): ${pass ? 'PASS' : 'FAIL'} (entryStatus: ${entry?.status})`);
    }

    // Scenario D: Authenticated parent completes existing draft after close -> update succeeds
    {
      const updateRes = await makeRequest(`/api/parent/children/${childIdB}/draft`, {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Tobi Adeleke',
          gender: 'Male',
          dob: '2015-06-10',
          photoUrl: 'https://res.cloudinary.com/test/photo_tobi.jpg',
          schoolClass: 'Grade 8',
          schoolName: 'Kings College',
          attendedBefore: 'Yes',
          hasAllergies: 'No',
          needsExtraSupport: 'No',
          infoConfirmed: true,
          pickupType: 'parent',
          pickupPersonFullName: 'Grace Adeleke',
          pickupPersonRelationship: 'Mother',
          pickupPersonPhone: '+2348012345678',
          pickupPersonPhotoUrl: 'https://res.cloudinary.com/test/photo_parent_1.jpg',
          pickupPersonApproved: true,
          detailsConfirmed: true
        })
      }, existingParentToken);
      const pass = (updateRes.status === 200 || updateRes.status === 201) && (updateRes.body?.id === childIdB || updateRes.body?.success === true);
      results['D: Authenticated parent completes existing draft after close'] = Boolean(pass);
      console.log(`Scenario D (Update draft after close): ${pass ? 'PASS' : 'FAIL'} (status: ${updateRes.status}, childId: ${updateRes.body?.id})`);
    }

    // Scenario E: Authenticated parent submits complete child after close -> under_review
    {
      const submitRes = await makeRequest(`/api/parent/children/${childIdB}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Tobi Adeleke',
          gender: 'Male',
          dob: '2015-06-10',
          relationship: 'Mother',
          photoUrl: 'https://res.cloudinary.com/test/photo_tobi.jpg',
          schoolClass: 'Grade 8',
          schoolName: 'Kings College',
          attendedBefore: 'Yes',
          hasAllergies: 'No',
          needsExtraSupport: 'No',
          infoConfirmed: true,
          pickupType: 'parent',
          pickupPersonFullName: 'Grace Adeleke',
          pickupPersonRelationship: 'Mother',
          pickupPersonPhone: '+2348012345678',
          pickupPersonPhotoUrl: 'https://res.cloudinary.com/test/photo_parent_1.jpg',
          pickupPersonApproved: true,
          detailsConfirmed: true
        })
      }, existingParentToken);
      const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childIdB, testEventId]);
      const pass = submitRes.status === 200 && submitRes.body.success === true && entry && entry.status === 'under_review' && entry.submitted_at !== null;
      results['E: Authenticated parent submits complete child after close'] = Boolean(pass);
      console.log(`Scenario E (Submit child after close): ${pass ? 'PASS' : 'FAIL'} (status: ${submitRes.status}, entryStatus: ${entry?.status})`);
    }

    // Scenario F: Age-invalid child -> rejected
    {
      // Create child with DOB making them age 15 on event date (valid birth date < 18, but exceeds event max age 14)
      const invalidAgeDraft = await makeRequest('/api/parent/children/draft', {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Fifteen Year Old Child',
          gender: 'Male',
          dob: '2011-03-01', // Age 15 on 2026 event
          photoUrl: 'https://res.cloudinary.com/test/photo_adult.jpg',
          schoolClass: 'Grade 10',
          schoolName: 'Senior High',
          attendedBefore: 'No',
          hasAllergies: 'No',
          needsExtraSupport: 'No',
          infoConfirmed: true,
          pickupType: 'parent',
          pickupPersonFullName: 'Grace Adeleke',
          pickupPersonRelationship: 'Mother',
          pickupPersonPhone: '+2348012345678',
          pickupPersonPhotoUrl: 'https://res.cloudinary.com/test/photo_parent_1.jpg',
          pickupPersonApproved: true,
          detailsConfirmed: true
        })
      }, existingParentToken);
      const invalidChildId = invalidAgeDraft.body?.id;
      const submitRes = await makeRequest(`/api/parent/children/${invalidChildId}/submit`, {
        method: 'POST'
      }, existingParentToken);
      const pass = submitRes.status === 400 && submitRes.body.code === 'AGE_NOT_ELIGIBLE';
      results['F: Age-invalid child registration is rejected'] = Boolean(pass);
      console.log(`Scenario F (Age invalid rejected): ${pass ? 'PASS' : 'FAIL'} (status: ${submitRes.status}, code: ${submitRes.body.code})`);
    }

    // Scenario G: Capacity full -> rejected
    {
      // Set event capacity to 1 (which is already reached by childIdB)
      await execute('UPDATE events SET capacity = 1 WHERE id = ?', [testEventId]);
      const capDraftRes = await makeRequest('/api/parent/children/draft', {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Capacity Exceeded Child',
          gender: 'Female',
          dob: '2017-04-12'
        })
      }, existingParentToken);
      const pass = capDraftRes.status === 403 && capDraftRes.body.code === 'CAPACITY_FULL';
      results['G: Capacity full rejection enforced'] = Boolean(pass);
      console.log(`Scenario G (Capacity full rejected): ${pass ? 'PASS' : 'FAIL'} (status: ${capDraftRes.status}, code: ${capDraftRes.body.code})`);
      // Restore capacity
      await execute('UPDATE events SET capacity = 100 WHERE id = ?', [testEventId]);
    }

    // Scenario H: Multiple-child restriction -> rejected if configured
    {
      await execute('UPDATE events SET allow_multiple_children = 0 WHERE id = ?', [testEventId]);
      const multiDraftRes = await makeRequest('/api/parent/children/draft', {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Second Sibling',
          gender: 'Female',
          dob: '2018-09-20'
        })
      }, existingParentToken);
      const pass = multiDraftRes.status === 403 && multiDraftRes.body.code === 'MULTIPLE_CHILDREN_NOT_ALLOWED';
      results['H: Multiple-child restriction enforced'] = Boolean(pass);
      console.log(`Scenario H (Multiple child restriction): ${pass ? 'PASS' : 'FAIL'} (status: ${multiDraftRes.status}, code: ${multiDraftRes.body.code})`);
      // Restore allow_multiple_children
      await execute('UPDATE events SET allow_multiple_children = 1 WHERE id = ?', [testEventId]);
    }

    // =========================================================================
    // ADMIN INVITE MATRIX: SCENARIOS I - O
    // =========================================================================
    console.log('\n--- ADMIN INVITE MATRIX (I - O) ---');

    // Scenario I & J: Admin creates/invites parent after public close, email succeeds
    let invitedUserId = '';
    let invitedProfileId = '';
    const invitedEmail = `invited-${testRunId}@invited.org`;
    {
      process.env.EMAIL_PROVIDER = 'simulated';
      const addRes = await makeRequest('/api/admin/parents', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'Chima',
          lastName: 'Okeke',
          email: invitedEmail,
          phone: '+2348033334444',
          sendInvitation: true
        })
      }, adminToken);

      invitedProfileId = addRes.body.parentId;
      invitedUserId = addRes.body.userId;
      const userRow = await queryOne('SELECT * FROM users WHERE id = ?', [invitedUserId]);
      const parentRow = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [invitedProfileId]);

      // Check Admin Parents list returns accountStatus
      const listRes = await makeRequest('/api/admin/parents', { method: 'GET' }, adminToken);
      const listedParent = listRes.body.parents?.find((p: any) => p.userId === invitedUserId);

      const pass = addRes.status === 200 && addRes.body.success === true &&
        userRow && userRow.password_hash === 'invited_pending' &&
        parentRow &&
        listedParent && listedParent.accountStatus === 'invitation_pending' &&
        listedParent.canResendInvitation === true;

      results['I & J: Admin invites parent after closure with successful email delivery'] = Boolean(pass);
      console.log(`Scenario I & J (Admin invite success): ${pass ? 'PASS' : 'FAIL'} (accountStatus: ${listedParent?.accountStatus}, canResend: ${listedParent?.canResendInvitation})`);
    }

    // Scenario K: Invitation email provider fails -> EMAIL_DELIVERY_FAILED, parent preserved
    let failedUserId = '';
    let failedProfileId = '';
    const failedEmail = `failed-${testRunId}@failed.org`;
    {
      // Mock failure by setting EMAIL_PROVIDER to simulated fail mode
      process.env.EMAIL_PROVIDER = 'simulated_fail'; // Unrecognized provider without from address will fail
      const addRes = await makeRequest('/api/admin/parents', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'Emeka',
          lastName: 'Nnamdi',
          email: failedEmail,
          phone: '+2348055556666',
          sendInvitation: true
        })
      }, adminToken);

      failedProfileId = addRes.body.parentId;
      failedUserId = addRes.body.userId;
      const userRow = await queryOne('SELECT * FROM users WHERE id = ?', [failedUserId]);
      const parentRow = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [failedProfileId]);

      // Check Admin Parents list returns email_delivery_failed
      const listRes = await makeRequest('/api/admin/parents', { method: 'GET' }, adminToken);
      const listedParent = listRes.body.parents?.find((p: any) => p.userId === failedUserId);

      const pass = addRes.status === 200 &&
        addRes.body.success === false &&
        addRes.body.code === 'EMAIL_DELIVERY_FAILED' &&
        addRes.body.parentCreated === true &&
        userRow && userRow.password_hash === 'invited_pending' &&
        parentRow &&
        listedParent && listedParent.accountStatus === 'email_delivery_failed' &&
        listedParent.canResendInvitation === true;

      results['K: Email failure returns EMAIL_DELIVERY_FAILED without rolling back parent'] = Boolean(pass);
      console.log(`Scenario K (Email failure handled safely): ${pass ? 'PASS' : 'FAIL'} (code: ${addRes.body.code}, accountStatus: ${listedParent?.accountStatus})`);
      process.env.EMAIL_PROVIDER = 'simulated';
    }

    // Scenario L: Admin resends pending invitation -> new token, old revoked, email sent
    {
      const oldToken = await queryOne("SELECT * FROM auth_tokens WHERE user_id = ? AND token_type = 'admin_invite'", [invitedUserId]);
      const resendRes = await makeRequest('/api/admin/invites/resend', {
        method: 'POST',
        body: JSON.stringify({ userId: invitedUserId, email: invitedEmail })
      }, adminToken);

      const oldTokenRefreshed = await queryOne('SELECT * FROM auth_tokens WHERE id = ?', [oldToken.id]);
      const newToken = await queryOne("SELECT * FROM auth_tokens WHERE user_id = ? AND token_type = 'admin_invite' AND revoked_at IS NULL", [invitedUserId]);

      const pass = resendRes.status === 200 && resendRes.body.success === true &&
        oldTokenRefreshed.revoked_at !== null &&
        newToken && newToken.id !== oldToken.id;

      results['L: Admin resends pending invitation revoking old token and creating fresh one'] = Boolean(pass);
      console.log(`Scenario L (Resend invitation): ${pass ? 'PASS' : 'FAIL'} (oldRevoked: ${Boolean(oldTokenRefreshed?.revoked_at)}, newToken: ${Boolean(newToken)})`);
    }

    // Scenario M: Invited parent accepts invitation while public registration remains closed
    let rawInviteToken = '';
    {
      // Generate clean token for testing accept-invite
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiry = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
      await execute(`
        INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
        VALUES (?, ?, ?, 'admin_invite', ?, ?)
      `, [crypto.randomUUID(), invitedUserId, tokenHash, expiry, now.toISOString()]);
      rawInviteToken = rawToken;

      const acceptRes = await makeRequest('/api/admin/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token: rawInviteToken, password: 'ActivatedPass123!' })
      });

      const userRow = await queryOne('SELECT * FROM users WHERE id = ?', [invitedUserId]);
      const pass = acceptRes.status === 200 && acceptRes.body.success === true &&
        userRow && userRow.password_hash !== 'invited_pending' && userRow.email_verified === 1;

      results['M: Invited parent accepts invite while public registration is closed'] = Boolean(pass);
      console.log(`Scenario M (Accept invite while closed): ${pass ? 'PASS' : 'FAIL'} (verified: ${userRow?.email_verified}, status: ${acceptRes.status})`);
    }

    // Scenario N: Newly activated invited parent signs in, adds child, and submits child
    {
      // Ensure invited parent profile has photo for mandatory photo requirement
      await execute("UPDATE parent_profiles SET photo_file_id = 'photo_parent_invited' WHERE user_id = ?", [invitedUserId]);
      const newlyActivatedParentToken = generateToken(invitedUserId);
      const draftRes = await makeRequest('/api/parent/children/draft', {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Somto Okeke',
          gender: 'Male',
          dob: '2016-03-15',
          photoUrl: 'https://res.cloudinary.com/test/photo_somto.jpg',
          schoolAndAgeGroup: { schoolName: 'Federal Academy', schoolClass: 'Primary 5' },
          healthAndSupport: { medicalNotes: 'None', allergies: 'None' },
          pickupPerson: { fullName: 'Chima Okeke', phone: '+2348033334444', relationship: 'Father' }
        })
      }, newlyActivatedParentToken);
      const childIdN = draftRes.body?.id;

      // Submit child
      const submitRes = await makeRequest(`/api/parent/children/${childIdN}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Somto Okeke',
          gender: 'Male',
          dob: '2016-03-15',
          relationship: 'Father',
          photoUrl: 'https://res.cloudinary.com/test/photo_somto.jpg',
          schoolClass: 'Primary 5',
          schoolName: 'Federal Academy',
          attendedBefore: 'No',
          hasAllergies: 'No',
          needsExtraSupport: 'No',
          infoConfirmed: true,
          pickupType: 'parent',
          pickupPersonFullName: 'Chima Okeke',
          pickupPersonRelationship: 'Father',
          pickupPersonPhone: '+2348033334444',
          pickupPersonPhotoUrl: 'https://res.cloudinary.com/test/photo_parent_invited.jpg',
          pickupPersonApproved: true,
          detailsConfirmed: true
        })
      }, newlyActivatedParentToken);
      const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childIdN, testEventId]);

      const pass = draftRes.status === 201 && submitRes.status === 200 && entry && entry.status === 'under_review';
      results['N: Activated invited parent can add and submit child while closed'] = Boolean(pass);
      console.log(`Scenario N (Invited parent adds child): ${pass ? 'PASS' : 'FAIL'} (submitStatus: ${submitRes.status}, entryStatus: ${entry?.status}, body: ${JSON.stringify(submitRes.body)})`);
    }

    // Scenario O: Active parent: Resend invitation action rejected by backend
    {
      const resendRes = await makeRequest('/api/admin/invites/resend', {
        method: 'POST',
        body: JSON.stringify({ userId: invitedUserId, email: invitedEmail })
      }, adminToken);

      const listRes = await makeRequest('/api/admin/parents', { method: 'GET' }, adminToken);
      const listedParent = listRes.body.parents?.find((p: any) => p.userId === invitedUserId);

      const pass = resendRes.status === 400 &&
        resendRes.body.code === 'NOT_PENDING_INVITATION' &&
        listedParent &&
        listedParent.accountStatus === 'active' &&
        listedParent.canResendInvitation === false;

      results['O: Active parent rejects resend invitation and UI disables action'] = Boolean(pass);
      console.log(`Scenario O (Active parent rejects resend): ${pass ? 'PASS' : 'FAIL'} (status: ${resendRes.status}, canResend: ${listedParent?.canResendInvitation})`);
    }

    console.log('\n================================================================');
    console.log('TEST SUMMARY RESULTS');
    console.log('================================================================');
    let allPassed = true;
    for (const [name, passed] of Object.entries(results)) {
      console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}`);
      if (!passed) allPassed = false;
    }

    if (allPassed) {
      console.log('\n>>> ALL 15 REGRESSION TEST CASES PASSED SUCCESSFULLY! <<<');
      process.exit(0);
    } else {
      console.error('\n>>> SOME TEST CASES FAILED! <<<');
      process.exit(1);
    }
  } finally {
    server.close();
    // Clean up temporary sqlite DB
    try {
      if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
      const wal = `${tempDbPath}-wal`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      const shm = `${tempDbPath}-shm`;
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch (e) {}
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
