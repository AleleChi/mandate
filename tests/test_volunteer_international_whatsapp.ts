import assert from 'assert';
import fs from 'fs';
import path from 'path';
import express from 'express';
import http from 'http';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken, hashPassword } from '../src/server/auth';
import volunteerRoutes from '../src/server/routes/volunteer';
import authRoutes from '../src/server/routes/auth';
import { normalizePhoneNumberToE164 } from '../src/server/utils/phone';
import { validatePhoneNumber, setCustomMxResolver } from '../src/server/utils/validation';
import { validateCountryIso, inferCountryIsoFromE164, resolveConsistentCountryIso } from '../src/utils/countries';

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING TEST SUITE: VOLUNTEER INTERNATIONAL WHATSAPP INTEGRATION');
  console.log('================================================================\n');

  // Configure MX resolver for tests so mock domains pass
  setCustomMxResolver(async () => [{ exchange: 'mx.koinoniaglobal.org', priority: 10 }]);

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const now = new Date();
  const nowIso = now.toISOString();

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/volunteer', volunteerRoutes);
  app.use('/api/auth', authRoutes);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let passCount = 0;
  function pass(msg: string) {
    passCount++;
    console.log(`  [PASS ${passCount}] ${msg}`);
  }

  try {
    // -------------------------------------------------------------------------
    // 1. NG local -> +234 E.164
    // -------------------------------------------------------------------------
    console.log('--- 1. NG local -> +234 E.164 ---');
    const ngNormalized = normalizePhoneNumberToE164('08031234567', 'NG');
    assert.strictEqual(ngNormalized, '+2348031234567', 'NG 080... must normalize to +2348031234567');
    pass('NG local number normalizes to +234 E.164');

    // -------------------------------------------------------------------------
    // 2. GB local -> +44 E.164
    // -------------------------------------------------------------------------
    console.log('--- 2. GB local -> +44 E.164 ---');
    const gbNormalized = normalizePhoneNumberToE164('07911123456', 'GB');
    assert.strictEqual(gbNormalized, '+447911123456', 'GB 079... must normalize to +447911123456');
    pass('GB local number normalizes to +44 E.164');

    // -------------------------------------------------------------------------
    // 3. US number -> +1 E.164
    // -------------------------------------------------------------------------
    console.log('--- 3. US number -> +1 E.164 ---');
    const usNormalized = normalizePhoneNumberToE164('2025550123', 'US');
    assert.strictEqual(usNormalized, '+12025550123', 'US 202... must normalize to +12025550123');
    pass('US number normalizes to +1 E.164');

    // -------------------------------------------------------------------------
    // 4. Explicit +E.164 preserved
    // -------------------------------------------------------------------------
    console.log('--- 4. Explicit +E.164 preserved ---');
    const explicitGb = normalizePhoneNumberToE164('+447911123456', 'NG');
    assert.strictEqual(explicitGb, '+447911123456', 'Explicit +44 must not be rewritten to NG');
    const explicitUs = normalizePhoneNumberToE164('+12025550123', 'GB');
    assert.strictEqual(explicitUs, '+12025550123', 'Explicit +1 must not be rewritten to GB');
    pass('Explicit +E.164 preserved regardless of defaultCountry parameter');

    // -------------------------------------------------------------------------
    // 5. Invalid ISO rejected
    // -------------------------------------------------------------------------
    console.log('--- 5. Invalid ISO rejected ---');
    const invalidIsoRes = validateCountryIso('XX');
    assert.strictEqual(invalidIsoRes.valid, false, 'Invalid country ISO XX must be invalid');
    const invalidIsoNum = validateCountryIso('123');
    assert.strictEqual(invalidIsoNum.valid, false, 'Numeric country ISO must be invalid');
    pass('Invalid ISO rejected');

    // -------------------------------------------------------------------------
    // 6. Invalid WhatsApp rejected
    // -------------------------------------------------------------------------
    console.log('--- 6. Invalid WhatsApp rejected ---');
    const invalidWaRes = validatePhoneNumber('12345', 'NG', 'whatsapp');
    assert.strictEqual(invalidWaRes.valid, false, 'Short invalid phone number must be rejected');
    pass('Invalid WhatsApp rejected');

    // Prepare media file row for photo requirement
    const dummyPhotoId = `photo-${testRunId}`;
    await execute(`
      INSERT INTO media_files (id, file_url, storage_key, mime_type, file_size, created_at)
      VALUES (?, '/uploads/test.jpg', ?, 'image/jpeg', 1024, ?)
    `, [dummyPhotoId, `key-${dummyPhotoId}`, nowIso]);

    // -------------------------------------------------------------------------
    // 7. create-account without consent rejected
    // -------------------------------------------------------------------------
    console.log('--- 7. create-account without consent rejected ---');
    const noConsentRes = await fetch(`${baseUrl}/api/volunteer/create-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Test Volunteer No Consent',
        email: `vol-noconsent-${testRunId}@test.org`,
        password: 'Password123!',
        phone: '+2348031234567',
        whatsapp: '+2348031234567',
        whatsappConsent: false,
        photoFileId: dummyPhotoId,
        preferredTeam: 'Check-in Team'
      })
    });
    assert.strictEqual(noConsentRes.status, 400, 'create-account without consent must return 400');
    const noConsentJson: any = await noConsentRes.json();
    assert.strictEqual(noConsentJson.code, 'WHATSAPP_CONSENT_REQUIRED', 'Error code must be WHATSAPP_CONSENT_REQUIRED');
    pass('create-account without consent rejected with 400 and WHATSAPP_CONSENT_REQUIRED');

    // -------------------------------------------------------------------------
    // 8. create-account with consent accepted (with international WhatsApp)
    // -------------------------------------------------------------------------
    console.log('--- 8. create-account with consent accepted ---');

    const volCreateEmail = `vol-consent-${testRunId}@test.org`;
    const consentRes = await fetch(`${baseUrl}/api/volunteer/create-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Grace Hopper',
        email: volCreateEmail,
        password: 'Password123!',
        phone: '+2348031234567',
        whatsapp: '07911123456',
        whatsappCountryIso: 'GB',
        whatsappConsent: true,
        photoFileId: dummyPhotoId,
        preferredTeam: 'Check-in Team'
      })
    });
    assert.strictEqual(consentRes.status, 201, `create-account with consent must return 201, got ${consentRes.status}`);
    const consentJson: any = await consentRes.json();
    assert.strictEqual(consentJson.success, true, 'create-account must return success: true');
    assert.strictEqual(consentJson.profile.whatsapp, '+447911123456', 'WhatsApp must be normalized to GB E.164');
    assert.strictEqual(consentJson.profile.whatsapp_country_iso, 'GB', 'WhatsApp ISO must be persisted as GB');
    assert.strictEqual(consentJson.profile.whatsappCountryIso, 'GB', 'whatsappCountryIso camelCase must be exposed');

    // Verify database record
    const createdVol = await queryOne('SELECT * FROM volunteer_profiles WHERE user_id = ?', [consentJson.user.id]);
    assert.ok(createdVol, 'volunteer_profiles row must exist');
    assert.strictEqual(createdVol.whatsapp, '+447911123456', 'DB whatsapp must be +447911123456');
    assert.strictEqual(createdVol.whatsapp_country_iso, 'GB', 'DB whatsapp_country_iso must be GB');
    assert.strictEqual(createdVol.whatsapp_consent_status, 'opted_in', 'DB consent must be opted_in');
    pass('create-account with consent accepted, normalized to GB E.164, and persisted');

    // -------------------------------------------------------------------------
    // 9. new Volunteer request without consent rejected
    // -------------------------------------------------------------------------
    console.log('--- 9. new Volunteer request without consent rejected ---');
    const parentOnlyUserId = `usr-parent-req-${testRunId}`;
    const parentOnlyEmail = `parent-req-${testRunId}@test.org`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'parent', 'active', 1, ?, ?)
    `, [parentOnlyUserId, parentOnlyEmail, hashPassword('Password123!'), nowIso, nowIso]);

    const parentToken = generateToken(parentOnlyUserId);

    const reqNoConsentRes = await fetch(`${baseUrl}/api/volunteer/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentToken}`
      },
      body: JSON.stringify({
        fullName: 'Parent Applying Vol',
        phone: '+2348031234567',
        whatsapp: '+2348031234567',
        whatsappConsent: false,
        preferredTeam: 'Check-in Team'
      })
    });
    assert.strictEqual(reqNoConsentRes.status, 400, 'New volunteer request without consent must return 400');
    const reqNoConsentJson: any = await reqNoConsentRes.json();
    assert.strictEqual(reqNoConsentJson.code, 'WHATSAPP_CONSENT_REQUIRED', 'Error must be WHATSAPP_CONSENT_REQUIRED');
    pass('new Volunteer request without consent rejected');

    // -------------------------------------------------------------------------
    // 10. historical unknown-consent Volunteer remains operational
    // -------------------------------------------------------------------------
    console.log('--- 10. historical unknown-consent Volunteer remains operational ---');
    const histVolUserId = `usr-hist-vol-${testRunId}`;
    const histVolEmail = `hist-vol-${testRunId}@test.org`;
    const histVolProfileId = `prof-hist-${testRunId}`;

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'volunteer', 'active', 1, ?, ?)
    `, [histVolUserId, histVolEmail, hashPassword('Password123!'), nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (
        id, user_id, full_name, phone, whatsapp, whatsapp_country_iso,
        status, whatsapp_consent_status, preferred_team, created_at, updated_at
      ) VALUES (?, ?, 'Historical Volunteer', '+2348011223344', '+2348011223344', NULL, 'active', 'unknown', 'Check-in Team', ?, ?)
    `, [histVolProfileId, histVolUserId, nowIso, nowIso]);

    // Sign in test
    const histSignInRes = await fetch(`${baseUrl}/api/volunteer/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: histVolEmail,
        password: 'Password123!'
      })
    });
    assert.strictEqual(histSignInRes.status, 200, 'Historical volunteer sign-in must succeed with 200');
    const histSignInJson: any = await histSignInRes.json();
    assert.strictEqual(histSignInJson.nextRoute, '/volunteer/event', 'Historical active volunteer routes to /volunteer/event');

    // Operational route access
    const histToken = generateToken(histVolUserId);
    const histMeRes = await fetch(`${baseUrl}/api/volunteer/me`, {
      headers: { Authorization: `Bearer ${histToken}` }
    });
    assert.strictEqual(histMeRes.status, 200, 'Historical unknown-consent volunteer can access /api/volunteer/me');
    const histMeJson: any = await histMeRes.json();
    assert.strictEqual(histMeJson.profile.whatsapp_consent_status, 'unknown', 'Consent remains unknown');
    pass('historical unknown-consent Volunteer remains operational');

    // -------------------------------------------------------------------------
    // 11. opted-out Volunteer profile edit does not opt in
    // -------------------------------------------------------------------------
    console.log('--- 11. opted-out Volunteer profile edit does not opt in ---');
    const optedOutUserId = `usr-optout-vol-${testRunId}`;
    const optedOutEmail = `optout-vol-${testRunId}@test.org`;
    const optedOutProfileId = `prof-optout-${testRunId}`;

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'volunteer', 'active', 1, ?, ?)
    `, [optedOutUserId, optedOutEmail, hashPassword('Password123!'), nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (
        id, user_id, full_name, phone, whatsapp, whatsapp_country_iso,
        status, whatsapp_consent_status, preferred_team, created_at, updated_at
      ) VALUES (?, ?, 'Opted Out Volunteer', '+2348011223355', '+2348011223355', 'NG', 'active', 'opted_out', 'Check-in Team', ?, ?)
    `, [optedOutProfileId, optedOutUserId, nowIso, nowIso]);

    const optOutToken = generateToken(optedOutUserId);
    const editRes = await fetch(`${baseUrl}/api/volunteer/me/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${optOutToken}`
      },
      body: JSON.stringify({
        fullName: 'Opted Out Volunteer Renamed',
        department: 'Ushering'
      })
    });
    assert.strictEqual(editRes.status, 200, 'Profile edit must succeed with 200');
    const editJson: any = await editRes.json();
    assert.strictEqual(editJson.profile.whatsapp_consent_status, 'opted_out', 'whatsapp_consent_status must remain opted_out');

    const dbOptOutCheck = await queryOne('SELECT whatsapp_consent_status FROM volunteer_profiles WHERE id = ?', [optedOutProfileId]);
    assert.strictEqual(dbOptOutCheck.whatsapp_consent_status, 'opted_out', 'DB consent must remain opted_out');
    pass('opted-out Volunteer profile edit does not flip consent to opted_in');

    // -------------------------------------------------------------------------
    // 12. WhatsApp ISO persists independently
    // -------------------------------------------------------------------------
    console.log('--- 12. WhatsApp ISO persists independently ---');
    const isoUpdateRes = await fetch(`${baseUrl}/api/volunteer/me/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${optOutToken}`
      },
      body: JSON.stringify({
        whatsapp: '2025550123',
        whatsappCountryIso: 'US'
      })
    });
    assert.strictEqual(isoUpdateRes.status, 200, 'Profile update with US WhatsApp must succeed');
    const isoUpdateJson: any = await isoUpdateRes.json();
    assert.strictEqual(isoUpdateJson.profile.whatsapp, '+12025550123', 'WhatsApp must be normalized to +12025550123');
    assert.strictEqual(isoUpdateJson.profile.whatsapp_country_iso, 'US', 'whatsapp_country_iso must be US');
    assert.strictEqual(isoUpdateJson.profile.whatsappCountryIso, 'US', 'whatsappCountryIso must be US');

    const dbIsoCheck = await queryOne('SELECT whatsapp, whatsapp_country_iso FROM volunteer_profiles WHERE id = ?', [optedOutProfileId]);
    assert.strictEqual(dbIsoCheck.whatsapp, '+12025550123', 'DB whatsapp must be +12025550123');
    assert.strictEqual(dbIsoCheck.whatsapp_country_iso, 'US', 'DB whatsapp_country_iso must be US');
    pass('WhatsApp ISO persists independently');

    // -------------------------------------------------------------------------
    // 13. NULL historical ISO inferred safely
    // -------------------------------------------------------------------------
    console.log('--- 13. NULL historical ISO inferred safely ---');
    const inferredGb = inferCountryIsoFromE164('+447400123456');
    assert.strictEqual(inferredGb, 'GB', 'Inferred country from +447400123456 must be GB');
    const inferredNg = inferCountryIsoFromE164('+2348031234567');
    assert.strictEqual(inferredNg, 'NG', 'Inferred country from +2348031234567 must be NG');
    const inferredUs = inferCountryIsoFromE164('+12025550123');
    assert.strictEqual(inferredUs, 'US', 'Inferred country from +12025550123 must be US');

    // Verify reading profile with NULL ISO did NOT mutate DB
    const dbNullCheck = await queryOne('SELECT whatsapp_country_iso FROM volunteer_profiles WHERE id = ?', [histVolProfileId]);
    assert.strictEqual(dbNullCheck.whatsapp_country_iso, null, 'Reading profile must not write inferred value to DB');
    pass('NULL historical ISO inferred safely without database mutation');

    // -------------------------------------------------------------------------
    // 14. Volunteer edit does not mutate Parent record (Role Isolation)
    // -------------------------------------------------------------------------
    console.log('--- 14. Volunteer edit does not mutate Parent record ---');
    const dualUserId = `usr-dual-${testRunId}`;
    const dualEmail = `dual-${testRunId}@test.org`;
    const dualParentProfileId = `prof-p-dual-${testRunId}`;
    const dualVolProfileId = `prof-v-dual-${testRunId}`;

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'volunteer', 'active', 1, ?, ?)
    `, [dualUserId, dualEmail, hashPassword('Password123!'), nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (
        id, user_id, full_name, email, phone_number, whatsapp_number, country, country_iso, whatsapp_country_iso,
        home_address, state_region, city, preferred_contact, whatsapp_consent_status, photo_file_id, created_at, updated_at
      ) VALUES (?, ?, 'Dual Parent', ?, '+2348011119999', '+2348011119999', 'Nigeria', 'NG', 'NG', 'Parent Address', 'Lagos', 'Ikeja', 'WhatsApp', 'opted_out', 'photo-p', ?, ?)
    `, [dualParentProfileId, dualUserId, dualEmail, nowIso, nowIso]);

    await execute(`
      INSERT INTO volunteer_profiles (
        id, user_id, full_name, phone, whatsapp, whatsapp_country_iso,
        status, whatsapp_consent_status, preferred_team, created_at, updated_at
      ) VALUES (?, ?, 'Dual Volunteer', '+2348011118888', '+2348011118888', 'NG', 'active', 'opted_in', 'Check-in Team', ?, ?)
    `, [dualVolProfileId, dualUserId, nowIso, nowIso]);

    const dualToken = generateToken(dualUserId);

    // Edit volunteer profile with new UK WhatsApp
    await fetch(`${baseUrl}/api/volunteer/me/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dualToken}`
      },
      body: JSON.stringify({
        fullName: 'Dual Role Updated Vol',
        whatsapp: '+447911123456',
        whatsappCountryIso: 'GB'
      })
    });

    // Check parent record was NOT touched
    const parentRecord = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [dualParentProfileId]);
    assert.strictEqual(parentRecord.whatsapp_number, '+2348011119999', 'Parent whatsapp_number must remain unchanged');
    assert.strictEqual(parentRecord.whatsapp_country_iso, 'NG', 'Parent whatsapp_country_iso must remain unchanged');
    assert.strictEqual(parentRecord.whatsapp_consent_status, 'opted_out', 'Parent consent must remain opted_out');
    pass('Volunteer edit does not mutate Parent record');

    // -------------------------------------------------------------------------
    // 15. Volunteer read response exposes ISO metadata
    // -------------------------------------------------------------------------
    console.log('--- 15. Volunteer read response exposes ISO metadata ---');
    const readMeRes = await fetch(`${baseUrl}/api/volunteer/me`, {
      headers: { Authorization: `Bearer ${dualToken}` }
    });
    assert.strictEqual(readMeRes.status, 200, 'GET /me must return 200');
    const readMeJson: any = await readMeRes.json();
    assert.strictEqual(readMeJson.profile.whatsapp_country_iso, 'GB', 'GET /me profile exposes whatsapp_country_iso');
    assert.strictEqual(readMeJson.profile.whatsappCountryIso, 'GB', 'GET /me profile exposes whatsappCountryIso');

    const readStatusRes = await fetch(`${baseUrl}/api/volunteer/me/status`, {
      headers: { Authorization: `Bearer ${dualToken}` }
    });
    assert.strictEqual(readStatusRes.status, 200, 'GET /me/status must return 200');
    const readStatusJson: any = await readStatusRes.json();
    assert.strictEqual(readStatusJson.profile.whatsapp_country_iso, 'GB', 'GET /me/status profile exposes whatsapp_country_iso');
    assert.strictEqual(readStatusJson.profile.whatsappCountryIso, 'GB', 'GET /me/status profile exposes whatsappCountryIso');
    pass('Volunteer read response exposes ISO metadata in both snake_case and camelCase');

    // -------------------------------------------------------------------------
    // 16. consent endpoint uses correct ISO context
    // -------------------------------------------------------------------------
    console.log('--- 16. consent endpoint uses correct ISO context ---');
    const consentOptInRes = await fetch(`${baseUrl}/api/volunteer/whatsapp/consent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dualToken}`
      },
      body: JSON.stringify({
        action: 'opt_in',
        whatsappNumber: '07911123456',
        whatsappCountryIso: 'GB'
      })
    });
    assert.strictEqual(consentOptInRes.status, 200, 'consent opt_in with GB ISO must succeed with 200');
    const consentOptInJson: any = await consentOptInRes.json();
    assert.strictEqual(consentOptInJson.profile.whatsapp, '+447911123456', 'Candidate phone parsed in GB context');
    assert.strictEqual(consentOptInJson.profile.whatsapp_country_iso, 'GB', 'whatsapp_country_iso persisted as GB');
    assert.strictEqual(consentOptInJson.profile.whatsappCountryIso, 'GB', 'whatsappCountryIso exposed as GB');

    // Invalid ISO on consent endpoint
    const badIsoRes = await fetch(`${baseUrl}/api/volunteer/whatsapp/consent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dualToken}`
      },
      body: JSON.stringify({
        action: 'opt_in',
        whatsappNumber: '07911123456',
        whatsappCountryIso: 'ZZ'
      })
    });
    assert.strictEqual(badIsoRes.status, 400, 'Invalid ISO in consent endpoint must return 400');
    pass('consent endpoint uses correct ISO context and validates country ISO');

    // -------------------------------------------------------------------------
    // 17. Same-as-phone infers ISO
    // -------------------------------------------------------------------------
    console.log('--- 17. Same-as-phone infers ISO ---');
    const usPhone = '+12025550123';
    const inferredUsPhone = inferCountryIsoFromE164(usPhone);
    assert.strictEqual(inferredUsPhone, 'US', 'US phone E.164 must infer US');

    const gbPhone = '+447400123456';
    const inferredGbPhone = inferCountryIsoFromE164(gbPhone);
    assert.strictEqual(inferredGbPhone, 'GB', 'GB phone E.164 must infer GB');

    const ngPhone = '+2348031234567';
    const inferredNgPhone = inferCountryIsoFromE164(ngPhone);
    assert.strictEqual(inferredNgPhone, 'NG', 'NG phone E.164 must infer NG');
    pass('Same-as-phone infers ISO correctly across multiple countries');

    // -------------------------------------------------------------------------
    // 18. NG selected + explicit GB number -> consistent GB ISO
    // -------------------------------------------------------------------------
    console.log('--- 18. NG selected + explicit GB number -> consistent GB ISO ---');
    assert.strictEqual(
      resolveConsistentCountryIso('NG', '+447400123456'),
      'GB',
      'resolveConsistentCountryIso must map +44 to GB when NG was selected'
    );

    const ngSelectedRes = await fetch(`${baseUrl}/api/volunteer/me/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${optOutToken}`
      },
      body: JSON.stringify({
        whatsapp: '+447400123456',
        whatsappCountryIso: 'NG'
      })
    });
    assert.strictEqual(ngSelectedRes.status, 200, 'Profile update must succeed with 200');
    const ngSelectedJson: any = await ngSelectedRes.json();
    assert.strictEqual(ngSelectedJson.profile.whatsapp, '+447400123456');
    assert.strictEqual(
      ngSelectedJson.profile.whatsapp_country_iso,
      'GB',
      'Persisted ISO must be GB when explicit GB number entered, not contradictory NG'
    );
    assert.strictEqual(ngSelectedJson.profile.whatsappCountryIso, 'GB');
    pass('NG selected + explicit GB number resolves to consistent GB ISO');

    // -------------------------------------------------------------------------
    // 19. GB selected + explicit NG number -> consistent NG ISO
    // -------------------------------------------------------------------------
    console.log('--- 19. GB selected + explicit NG number -> consistent NG ISO ---');
    assert.strictEqual(
      resolveConsistentCountryIso('GB', '+2348031234567'),
      'NG',
      'resolveConsistentCountryIso must map +234 to NG when GB was selected'
    );

    const gbSelectedRes = await fetch(`${baseUrl}/api/volunteer/me/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${optOutToken}`
      },
      body: JSON.stringify({
        whatsapp: '+2348031234567',
        whatsappCountryIso: 'GB'
      })
    });
    assert.strictEqual(gbSelectedRes.status, 200, 'Profile update must succeed with 200');
    const gbSelectedJson: any = await gbSelectedRes.json();
    assert.strictEqual(gbSelectedJson.profile.whatsapp, '+2348031234567');
    assert.strictEqual(
      gbSelectedJson.profile.whatsapp_country_iso,
      'NG',
      'Persisted ISO must be NG when explicit NG number entered, not contradictory GB'
    );
    assert.strictEqual(gbSelectedJson.profile.whatsappCountryIso, 'NG');
    pass('GB selected + explicit NG number resolves to consistent NG ISO');

    // -------------------------------------------------------------------------
    // 20. Ambiguous shared calling-code region (NANP +1) preserves selected country
    // -------------------------------------------------------------------------
    console.log('--- 20. Shared calling-code region (NANP +1) preserves selected country ---');
    assert.strictEqual(
      resolveConsistentCountryIso('CA', '+16045550123'),
      'CA',
      'resolveConsistentCountryIso must preserve CA for +1 number when CA was selected'
    );
    assert.strictEqual(
      resolveConsistentCountryIso('US', '+12025550123'),
      'US',
      'resolveConsistentCountryIso must preserve US for +1 number when US was selected'
    );

    const caSelectedRes = await fetch(`${baseUrl}/api/volunteer/me/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${optOutToken}`
      },
      body: JSON.stringify({
        whatsapp: '+16045550123',
        whatsappCountryIso: 'CA'
      })
    });
    assert.strictEqual(caSelectedRes.status, 200, 'Profile update with CA WhatsApp must succeed');
    const caSelectedJson: any = await caSelectedRes.json();
    assert.strictEqual(caSelectedJson.profile.whatsapp, '+16045550123');
    assert.strictEqual(
      caSelectedJson.profile.whatsapp_country_iso,
      'CA',
      'Shared calling code must preserve selected CA rather than forcing US'
    );
    assert.strictEqual(caSelectedJson.profile.whatsappCountryIso, 'CA');
    pass('Shared calling-code region (NANP +1) preserves compatible selected country');

    // -------------------------------------------------------------------------
    // 21. Volunteer create-account consent UX verification
    // -------------------------------------------------------------------------
    console.log('--- 21. Volunteer create-account consent UX verification ---');
    const createAccountViewSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/views/VolunteerCreateAccountView.tsx'),
      'utf-8'
    );
    const normalizedSource = createAccountViewSource.replace(/\r\n/g, '\n');

    // 1. Button enabled state does NOT block on agreedToWhatsApp
    assert.ok(
      !normalizedSource.includes('agreedToWhatsApp &&\n    (!isKoinoniaWorker'),
      'requiredFieldsPresent must not include agreedToWhatsApp so button remains usable'
    );
    assert.ok(
      normalizedSource.includes('const canSubmit =\n    requiredFieldsPresent &&\n    !formHasErrors &&\n    !loading;'),
      'canSubmit is true when normal fields are valid regardless of consent checkbox'
    );

    // 2. Submit handler rejects locally if consent is false without calling API
    assert.ok(
      normalizedSource.includes('if (!agreedToWhatsApp) {\n      const msg = \'Please enable WhatsApp updates to continue. Important volunteer information and duty updates are sent through WhatsApp.\';\n      setErrorMsg(msg);'),
      'handleSubmit rejects locally when consent is false, sets error message, and returns before API call'
    );

    // 3. Inline error message rendered below consent control
    assert.ok(
      normalizedSource.includes('id="whatsapp-consent-error"'),
      'Inline error paragraph with id whatsapp-consent-error rendered below consent row'
    );
    assert.ok(
      normalizedSource.includes('role="alert"'),
      'Inline error has accessible role="alert"'
    );
    assert.ok(
      normalizedSource.includes('aria-invalid={touched.whatsappConsent && !agreedToWhatsApp}'),
      'Checkbox input has aria-invalid tied to touched.whatsappConsent and !agreedToWhatsApp'
    );

    // 4. Form inputs preserved (no form clearing on consent failure)
    assert.ok(
      !normalizedSource.includes('setPassword(\'\')') &&
      !normalizedSource.includes('setEmail(\'\')') &&
      !normalizedSource.includes('setFullName(\'\')'),
      'Form fields are strictly preserved and never cleared on consent validation failure'
    );

    // 5. Backend missing consent rejection remains intact (verified with real API call)
    const backendConsentCheckRes = await fetch(`${baseUrl}/api/volunteer/create-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Consent Check User',
        email: `consent-chk-${testRunId}@test.org`,
        phone: '08012345678',
        whatsapp: '08012345678',
        whatsappCountryIso: 'NG',
        password: 'Password123!',
        preferredTeam: 'Check-in & Welcome',
        photoFileId: dummyPhotoId,
        whatsappConsent: false
      })
    });
    assert.strictEqual(backendConsentCheckRes.status, 400, 'Backend must continue independently rejecting missing consent');
    const backendConsentCheckJson: any = await backendConsentCheckRes.json();
    assert.strictEqual(backendConsentCheckJson.code, 'WHATSAPP_CONSENT_REQUIRED');
    pass('Volunteer create-account consent UX verification');

    console.log(`\n================================================================`);
    console.log(`ALL 21 TESTS PASSED (${passCount}/21)`);
    console.log(`================================================================\n`);
  } finally {
    server.close();
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nTEST FAILED:', err);
    process.exit(1);
  });
