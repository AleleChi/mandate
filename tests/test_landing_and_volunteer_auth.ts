import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import authRouter from '../src/server/routes/auth';
import volunteerRouter from '../src/server/routes/volunteer';
import { execute, queryOne } from '../src/server/db';
import { hashPassword, generateToken } from '../src/server/auth';
import { setCustomMxResolver } from '../src/server/utils/validation';

describe('Landing Auth and Volunteer Gating Tests', () => {
  before(() => {
    setCustomMxResolver(async () => [{ exchange: 'mx.koinoniaglobal.org', priority: 10 }]);
  });

  after(() => {
    setCustomMxResolver(null);
  });
  it('verifies getRegistrationStatus reflects separate controls for parent and volunteer', async () => {
    const existing = await queryOne("SELECT id FROM admin_general_settings WHERE id = 'primary_general_settings'");
    if (existing) {
      await execute(`
        UPDATE admin_general_settings
        SET parent_registration_enabled = 0, volunteer_registration_enabled = 1, parent_login_enabled = 1, updated_at = datetime('now')
        WHERE id = 'primary_general_settings'
      `);
    } else {
      await execute(`
        INSERT INTO admin_general_settings (id, parent_registration_enabled, volunteer_registration_enabled, parent_login_enabled, created_at, updated_at)
        VALUES ('primary_general_settings', 0, 1, 1, datetime('now'), datetime('now'))
      `);
    }

    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);

    const server = await new Promise<any>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/registration-status`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.success, true);
      assert.equal(data.parentRegistrationEnabled, false);
      assert.equal(data.parentLoginEnabled, true);
      assert.equal(data.volunteerRegistrationEnabled, true);
      assert.equal(data.parent?.isOpen, false);
      assert.equal(data.parent?.canLogin, true);
      assert.equal(data.volunteer?.isOpen, true);
    } finally {
      server.close();
    }
  });

  it('verifies parent login succeeds when registration is closed but parent login is enabled', async () => {
    await execute(`
      UPDATE admin_general_settings
      SET parent_registration_enabled = 0, parent_login_enabled = 1, updated_at = datetime('now')
      WHERE id = 'primary_general_settings'
    `);

    const testEmail = `parent_login_${Date.now()}@gmail.com`;
    const password = 'TestPassword123!';
    const passwordHash = hashPassword(password);
    const userId = crypto.randomUUID();

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'parent', 'active', 1, datetime('now'), datetime('now'))
    `, [userId, testEmail, passwordHash]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Existing Parent', '+2348011223344', datetime('now'), datetime('now'))
    `, [crypto.randomUUID(), userId]);

    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);

    const server = await new Promise<any>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.token);
      assert.equal(data.user?.email, testEmail);
    } finally {
      server.close();
    }
  });

  it('verifies parent-to-volunteer request works for authenticated parent user and handles duplicates', async () => {
    const userId = crypto.randomUUID();
    const testEmail = `parent_test_${Date.now()}@gmail.com`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'testhash', 'parent', datetime('now'), datetime('now'))
    `, [userId, testEmail]);
    const parentProfileId = crypto.randomUUID();

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Test Parent', '+2348011223344', datetime('now'), datetime('now'))
    `, [parentProfileId, userId]);

    const app = express();
    app.use(express.json());
    app.use('/api/volunteer', volunteerRouter);

    const server = await new Promise<any>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;

    try {
      const token = generateToken(userId);

      const payload = {
        fullName: 'Test Parent Volunteer',
        phone: '+2348011223344',
        whatsapp: '+2348011223344',
        whatsappCountryIso: 'NG',
        whatsappConsent: true,
        isKoinoniaWorker: false,
        preferredTeam: 'Check-in Team',
        servingExperience: true,
        note: 'Ready to serve'
      };

      const res = await fetch(`http://127.0.0.1:${port}/api/volunteer/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.profile?.status, 'pending_review');

      // Verify DB record
      const profile = await queryOne('SELECT * FROM volunteer_profiles WHERE user_id = ?', [userId]) as any;
      assert.ok(profile);
      assert.equal(profile.status, 'pending_review');
      assert.equal(profile.whatsapp_consent_status, 'opted_in');

      // Test submitting again (duplicate application handling: returns success without creating error)
      const res2 = await fetch(`http://127.0.0.1:${port}/api/volunteer/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      assert.equal(res2.status, 200);
      const data2 = await res2.json();
      assert.equal(data2.success, true);
    } finally {
      server.close();
    }
  });

  it('verifies volunteer create-account is permitted when volunteer registration is enabled', async () => {
    await execute(`
      UPDATE admin_general_settings
      SET volunteer_registration_enabled = 1, parent_registration_enabled = 0, updated_at = datetime('now')
      WHERE id = 'primary_general_settings'
    `);

    // Create a mock media file for the profile photo
    const mediaId = crypto.randomUUID();
    const testStorageKey = `test_key_${Date.now()}`;
    await execute(`
      INSERT INTO media_files (
        id, provider, file_type, public_id, secure_url, resource_type,
        mime_type, file_size, storage_key, file_url, created_at
      ) VALUES (?, 'local', 'volunteer_profile_photo', 'test_pub', 'http://test.jpg', 'image', 'image/jpeg', 1000, ?, 'http://test.jpg', datetime('now'))
    `, [mediaId, testStorageKey]);

    const app = express();
    app.use(express.json());
    app.use('/api/volunteer', volunteerRouter);

    const server = await new Promise<any>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;

    try {
      const volEmail = `new_vol_${Date.now()}@gmail.com`;
      const res = await fetch(`http://127.0.0.1:${port}/api/volunteer/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'New Volunteer',
          email: volEmail,
          phone: '+2348099887766',
          whatsapp: '+2348099887766',
          whatsappCountryIso: 'NG',
          whatsappConsent: true,
          password: 'VolPassword123!',
          isKoinoniaWorker: false,
          preferredTeam: 'Logistics',
          photoFileId: mediaId
        })
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.user?.email, volEmail);
    } finally {
      server.close();
    }
  });

  it('verifies volunteer create-account is rejected when volunteer registration is disabled', async () => {
    await execute(`
      UPDATE admin_general_settings
      SET volunteer_registration_enabled = 0, updated_at = datetime('now')
      WHERE id = 'primary_general_settings'
    `);

    const app = express();
    app.use(express.json());
    app.use('/api/volunteer', volunteerRouter);

    const server = await new Promise<any>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;

    try {
      const volEmail = `blocked_vol_${Date.now()}@gmail.com`;
      const res = await fetch(`http://127.0.0.1:${port}/api/volunteer/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Blocked Volunteer',
          email: volEmail,
          phone: '+2348099887766',
          whatsapp: '+2348099887766',
          whatsappCountryIso: 'NG',
          whatsappConsent: true,
          password: 'VolPassword123!',
          isKoinoniaWorker: false,
          preferredTeam: 'Logistics'
        })
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.code, 'VOLUNTEER_REGISTRATION_DISABLED');
    } finally {
      server.close();
    }
  });
});
