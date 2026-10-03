import assert from 'assert';
import fs from 'fs';
import path from 'path';
import express from 'express';
import http from 'http';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken, hashPassword } from '../src/server/auth';
import parentRoutes from '../src/server/routes/parent';
import authRoutes from '../src/server/routes/auth';
import { validateParentProfile } from '../src/server/utils/validation';
import { getInternationalCountries, resolveCountryIso, getCountryByIso } from '../src/utils/countries';

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING TEST SUITE: PARENT INTERNATIONAL WHATSAPP INTEGRATION   ');
  console.log('================================================================\n');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const now = new Date();
  const nowIso = now.toISOString();

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/parent', parentRoutes);
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
    const profileSetupViewPath = path.resolve(process.cwd(), 'src/views/ProfileSetupView.tsx');
    const profileSetupSource = fs.readFileSync(profileSetupViewPath, 'utf-8');

    // -------------------------------------------------------------------------
    // 1. Parent uses shared InternationalWhatsAppField
    // -------------------------------------------------------------------------
    console.log('--- 1. Parent uses shared InternationalWhatsAppField ---');
    assert.ok(
      profileSetupSource.includes("from '../components/common/InternationalWhatsAppField'"),
      'ProfileSetupView must import InternationalWhatsAppField'
    );
    assert.ok(
      profileSetupSource.includes('<InternationalWhatsAppField'),
      'ProfileSetupView must render InternationalWhatsAppField'
    );
    pass('Parent uses shared InternationalWhatsAppField');

    // -------------------------------------------------------------------------
    // 2. Parent does not contain duplicated country list
    // -------------------------------------------------------------------------
    console.log('--- 2. Parent does not contain duplicated country list ---');
    assert.ok(
      profileSetupSource.includes('getInternationalCountries'),
      'ProfileSetupView must import getInternationalCountries from countries.ts'
    );
    assert.ok(
      !profileSetupSource.includes('commonCountries ='),
      'ProfileSetupView must not define a separate hardcoded commonCountries array'
    );
    pass('Parent does not contain duplicated country list');

    // Setup base parent user & profile for API tests
    const parentUserId = `usr-p-wa-${testRunId}`;
    const parentProfileId = `prof-p-wa-${testRunId}`;
    const parentEmail = `parent-wa-${testRunId}@test.org`;
    const password = 'Password123!';

    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'parent', 'active', 1, ?, ?)
    `, [parentUserId, parentEmail, hashPassword(password), nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (
        id, user_id, full_name, email, phone_number, whatsapp_number, country, country_iso,
        home_address, state_region, city, preferred_contact, whatsapp_consent_status, photo_file_id, created_at, updated_at
      )
      VALUES (?, ?, 'Chidinma Adeyemi', ?, '+2348011112222', '+2348011112222', 'Nigeria', 'NG', '12 Test Crescent', 'Lagos', 'Ikeja', 'WhatsApp', 'unknown', 'dummy-photo-id', ?, ?)
    `, [parentProfileId, parentUserId, parentEmail, nowIso, nowIso]);

    const token = generateToken(parentUserId);

    const makeParentRequest = async (path: string, options: any = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      };
      const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, body: data };
    };

    // -------------------------------------------------------------------------
    // 3 & 4. NG selection saves country_iso NG and local WhatsApp saves +234...
    // -------------------------------------------------------------------------
    console.log('--- 3 & 4. NG selection saves country_iso NG and local WhatsApp saves +234... ---');
    {
      const res = await makeParentRequest('/api/parent/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Chidinma Adeyemi',
          email: parentEmail,
          phone: '08012345678',
          whatsapp: '08012345678',
          country: 'Nigeria',
          countryIso: 'NG',
          homeAddress: '12 Test Crescent',
          stateRegion: 'Lagos',
          city: 'Ikeja',
          preferredContact: 'WhatsApp',
          photoUrl: 'https://example.com/photo.jpg'
        })
      });

      assert.strictEqual(res.status, 200, `Expected 200 from profile update: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.countryIso, 'NG');
      assert.strictEqual(res.body.country_iso, 'NG');
      assert.strictEqual(res.body.whatsappNumber, '+2348012345678');

      const dbRow = await queryOne('SELECT country, country_iso, whatsapp_number, phone_number FROM parent_profiles WHERE id = ?', [parentProfileId]);
      assert.strictEqual(dbRow.country_iso, 'NG', 'DB country_iso must be NG');
      assert.strictEqual(dbRow.country, 'Nigeria', 'DB country must be Nigeria');
      pass('NG selection saves country_iso NG');

      assert.strictEqual(dbRow.whatsapp_number, '+2348012345678', 'DB whatsapp_number must be canonical E.164 (+234...)');
      pass('NG local WhatsApp saves +234...');
    }

    // -------------------------------------------------------------------------
    // 5 & 6. GB selection saves country_iso GB and local WhatsApp saves +44...
    // -------------------------------------------------------------------------
    console.log('--- 5 & 6. GB selection saves country_iso GB and local WhatsApp saves +44... ---');
    {
      const res = await makeParentRequest('/api/parent/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Chidinma Adeyemi',
          email: parentEmail,
          phone: '+442079460000',
          whatsapp: '02079460000',
          country: 'United Kingdom',
          countryIso: 'GB',
          homeAddress: '221B Baker St',
          stateRegion: 'Greater London',
          city: 'London',
          preferredContact: 'WhatsApp',
          photoUrl: 'https://example.com/photo.jpg'
        })
      });

      assert.strictEqual(res.status, 200, `Expected 200 from profile update: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.countryIso, 'GB');
      assert.strictEqual(res.body.country_iso, 'GB');
      assert.strictEqual(res.body.whatsappNumber, '+442079460000');

      const dbRow = await queryOne('SELECT country, country_iso, whatsapp_number FROM parent_profiles WHERE id = ?', [parentProfileId]);
      assert.strictEqual(dbRow.country_iso, 'GB');
      pass('GB selection saves country_iso GB');

      assert.strictEqual(dbRow.whatsapp_number, '+442079460000');
      pass('GB local WhatsApp saves +44...');
    }

    // -------------------------------------------------------------------------
    // 7 & 8. US selection saves country_iso US and national number saves +1...
    // -------------------------------------------------------------------------
    console.log('--- 7 & 8. US selection saves country_iso US and national number saves +1... ---');
    {
      const res = await makeParentRequest('/api/parent/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Chidinma Adeyemi',
          email: parentEmail,
          phone: '+12025550123',
          whatsapp: '2025550123',
          country: 'United States',
          countryIso: 'US',
          homeAddress: '1600 Pennsylvania Ave',
          stateRegion: 'DC',
          city: 'Washington',
          preferredContact: 'WhatsApp',
          photoUrl: 'https://example.com/photo.jpg'
        })
      });

      assert.strictEqual(res.status, 200, `Expected 200 from profile update: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.countryIso, 'US');
      assert.strictEqual(res.body.country_iso, 'US');
      assert.strictEqual(res.body.whatsappNumber, '+12025550123');

      const dbRow = await queryOne('SELECT country, country_iso, whatsapp_number FROM parent_profiles WHERE id = ?', [parentProfileId]);
      assert.strictEqual(dbRow.country_iso, 'US');
      pass('US selection saves country_iso US');

      assert.strictEqual(dbRow.whatsapp_number, '+12025550123');
      pass('US national number saves +1...');
    }

    // -------------------------------------------------------------------------
    // 9. Explicit E.164 remains unchanged
    // -------------------------------------------------------------------------
    console.log('--- 9. Explicit E.164 remains unchanged ---');
    {
      const res = await makeParentRequest('/api/parent/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Chidinma Adeyemi',
          email: parentEmail,
          phone: '+2348012345678',
          whatsapp: '+12025550123', // explicit US number while country is Nigeria
          country: 'Nigeria',
          countryIso: 'NG',
          homeAddress: '12 Test Crescent',
          stateRegion: 'Lagos',
          city: 'Ikeja',
          preferredContact: 'WhatsApp',
          photoUrl: 'https://example.com/photo.jpg'
        })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.whatsappNumber, '+12025550123');

      const dbRow = await queryOne('SELECT whatsapp_number FROM parent_profiles WHERE id = ?', [parentProfileId]);
      assert.strictEqual(dbRow.whatsapp_number, '+12025550123');
      pass('explicit E.164 remains unchanged');
    }

    // -------------------------------------------------------------------------
    // 9B. Phase 3A.1 Case A: Residence Nigeria + WhatsApp Nigeria
    // -------------------------------------------------------------------------
    console.log('--- 9B. Phase 3A.1 Case A: Residence Nigeria + WhatsApp Nigeria ---');
    {
      const res = await makeParentRequest('/api/parent/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Chidinma Adeyemi',
          email: parentEmail,
          phone: '08012345678',
          whatsapp: '08012345678',
          whatsappCountryIso: 'NG',
          country: 'Nigeria',
          countryIso: 'NG',
          homeAddress: '12 Test Crescent',
          stateRegion: 'Lagos',
          city: 'Ikeja',
          preferredContact: 'WhatsApp',
          photoUrl: 'https://example.com/photo.jpg'
        })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.country, 'Nigeria');
      assert.strictEqual(res.body.countryIso, 'NG');
      assert.strictEqual(res.body.whatsappCountryIso, 'NG');
      assert.strictEqual(res.body.whatsappNumber, '+2348012345678');

      const dbRow = await queryOne('SELECT country, country_iso, whatsapp_country_iso, whatsapp_number FROM parent_profiles WHERE id = ?', [parentProfileId]);
      assert.strictEqual(dbRow.country, 'Nigeria');
      assert.strictEqual(dbRow.country_iso, 'NG');
      assert.strictEqual(dbRow.whatsapp_country_iso, 'NG');
      assert.strictEqual(dbRow.whatsapp_number, '+2348012345678');
      pass('Case A: Residence NG + WhatsApp NG stored independently');
    }

    // -------------------------------------------------------------------------
    // 9C. Phase 3A.1 Case B: Residence Nigeria + WhatsApp United Kingdom (+44)
    // -------------------------------------------------------------------------
    console.log('--- 9C. Phase 3A.1 Case B: Residence Nigeria + WhatsApp United Kingdom ---');
    {
      const res = await makeParentRequest('/api/parent/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Chidinma Adeyemi',
          email: parentEmail,
          phone: '08012345678',
          whatsapp: '02079460000',
          whatsappCountryIso: 'GB',
          country: 'Nigeria',
          countryIso: 'NG',
          homeAddress: '12 Test Crescent',
          stateRegion: 'Lagos',
          city: 'Ikeja',
          preferredContact: 'WhatsApp',
          photoUrl: 'https://example.com/photo.jpg'
        })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.country, 'Nigeria');
      assert.strictEqual(res.body.countryIso, 'NG');
      assert.strictEqual(res.body.whatsappCountryIso, 'GB');
      assert.strictEqual(res.body.whatsappNumber, '+442079460000');

      const dbRow = await queryOne('SELECT country, country_iso, whatsapp_country_iso, whatsapp_number FROM parent_profiles WHERE id = ?', [parentProfileId]);
      assert.strictEqual(dbRow.country, 'Nigeria');
      assert.strictEqual(dbRow.country_iso, 'NG');
      assert.strictEqual(dbRow.whatsapp_country_iso, 'GB');
      assert.strictEqual(dbRow.whatsapp_number, '+442079460000');
      pass('Case B: Residence NG + WhatsApp GB accepted and stored independently');
      pass('Changing WhatsApp country does not change residence country');
    }

    // -------------------------------------------------------------------------
    // 9D. Phase 3A.1 Case C: Residence United States + WhatsApp Nigeria (+234)
    // -------------------------------------------------------------------------
    console.log('--- 9D. Phase 3A.1 Case C: Residence United States + WhatsApp Nigeria ---');
    {
      const res = await makeParentRequest('/api/parent/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Chidinma Adeyemi',
          email: parentEmail,
          phone: '+12025550123',
          whatsapp: '08012345678',
          whatsappCountryIso: 'NG',
          country: 'United States',
          countryIso: 'US',
          homeAddress: '1600 Pennsylvania Ave',
          stateRegion: 'DC',
          city: 'Washington',
          preferredContact: 'WhatsApp',
          photoUrl: 'https://example.com/photo.jpg'
        })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.country, 'United States');
      assert.strictEqual(res.body.countryIso, 'US');
      assert.strictEqual(res.body.whatsappCountryIso, 'NG');
      assert.strictEqual(res.body.whatsappNumber, '+2348012345678');

      const dbRow = await queryOne('SELECT country, country_iso, whatsapp_country_iso, whatsapp_number FROM parent_profiles WHERE id = ?', [parentProfileId]);
      assert.strictEqual(dbRow.country, 'United States');
      assert.strictEqual(dbRow.country_iso, 'US');
      assert.strictEqual(dbRow.whatsapp_country_iso, 'NG');
      assert.strictEqual(dbRow.whatsapp_number, '+2348012345678');
      pass('Case C: Residence US + WhatsApp NG stored independently; residence not changed to Nigeria');
    }

    // -------------------------------------------------------------------------
    // 9E. Changing residence country does not silently rewrite valid WhatsApp
    // -------------------------------------------------------------------------
    console.log('--- 9E. Changing residence country does not silently rewrite valid WhatsApp ---');
    {
      const res = await makeParentRequest('/api/parent/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Chidinma Adeyemi',
          email: parentEmail,
          phone: '+233241234567',
          whatsapp: '+2348012345678', // unchanged existing NG WhatsApp
          whatsappCountryIso: 'NG',
          country: 'Ghana',
          countryIso: 'GH',
          homeAddress: 'Accra Road',
          stateRegion: 'Greater Accra',
          city: 'Accra',
          preferredContact: 'WhatsApp',
          photoUrl: 'https://example.com/photo.jpg'
        })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.country, 'Ghana');
      assert.strictEqual(res.body.countryIso, 'GH');
      assert.strictEqual(res.body.whatsappCountryIso, 'NG');
      assert.strictEqual(res.body.whatsappNumber, '+2348012345678');

      const dbRow = await queryOne('SELECT country_iso, whatsapp_country_iso, whatsapp_number FROM parent_profiles WHERE id = ?', [parentProfileId]);
      assert.strictEqual(dbRow.country_iso, 'GH');
      assert.strictEqual(dbRow.whatsapp_country_iso, 'NG');
      assert.strictEqual(dbRow.whatsapp_number, '+2348012345678');
      pass('Changing residence country from US to GH preserves existing valid WhatsApp +234...');
    }

    // -------------------------------------------------------------------------
    // 9F. Address Country presentation in ProfileSetupView
    // -------------------------------------------------------------------------
    console.log('--- 9F. Address Country presentation in ProfileSetupView ---');
    {
      // Check that ProfileSetupView renders {c.flag} {c.name} for country select options
      assert.ok(
        profileSetupSource.includes('{c.flag} {c.name}'),
        'Address country select must render only flag and country name'
      );
      assert.ok(
        !profileSetupSource.includes('{c.flag} {c.name} ({c.dialCode})'),
        'Address country select must NOT render dial code'
      );
      assert.ok(
        !profileSetupSource.includes('{c.flag} {c.name} ({c.iso})'),
        'Address country select must NOT render ISO in option label'
      );
      pass('Address Country displays flag + name without dial codes or raw ISO badges');
    }

    // -------------------------------------------------------------------------
    // 10. Country name and ISO remain synchronized
    // -------------------------------------------------------------------------
    console.log('--- 10. Country name and ISO remain synchronized ---');
    {
      // Attempting to send conflicting country name and countryIso (e.g. United Kingdom with NG)
      const res = await makeParentRequest('/api/parent/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Chidinma Adeyemi',
          email: parentEmail,
          phone: '08012345678',
          whatsapp: '08012345678',
          country: 'United Kingdom',
          countryIso: 'NG',
          homeAddress: '12 Test Crescent',
          stateRegion: 'Lagos',
          city: 'Ikeja',
          preferredContact: 'WhatsApp',
          photoUrl: 'https://example.com/photo.jpg'
        })
      });

      assert.strictEqual(res.status, 400, 'Conflicting country and countryIso must be rejected with 400');
      pass('country name and ISO remain synchronized');
    }

    // -------------------------------------------------------------------------
    // 11. Malformed ISO rejected server-side
    // -------------------------------------------------------------------------
    console.log('--- 11. Malformed ISO rejected server-side ---');
    {
      const res = await makeParentRequest('/api/parent/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Chidinma Adeyemi',
          email: parentEmail,
          phone: '08012345678',
          whatsapp: '08012345678',
          country: 'Nigeria',
          countryIso: 'INVALID_ISO',
          homeAddress: '12 Test Crescent',
          stateRegion: 'Lagos',
          city: 'Ikeja',
          preferredContact: 'WhatsApp',
          photoUrl: 'https://example.com/photo.jpg'
        })
      });

      assert.strictEqual(res.status, 400, 'Malformed ISO must be rejected with 400');
      pass('malformed ISO rejected server-side');
    }

    // -------------------------------------------------------------------------
    // 12. Impossible WhatsApp rejected server-side
    // -------------------------------------------------------------------------
    console.log('--- 12. Impossible WhatsApp rejected server-side ---');
    {
      const res = await makeParentRequest('/api/parent/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Chidinma Adeyemi',
          email: parentEmail,
          phone: '08012345678',
          whatsapp: '123', // impossible WhatsApp number
          country: 'Nigeria',
          countryIso: 'NG',
          homeAddress: '12 Test Crescent',
          stateRegion: 'Lagos',
          city: 'Ikeja',
          preferredContact: 'WhatsApp',
          photoUrl: 'https://example.com/photo.jpg'
        })
      });

      assert.strictEqual(res.status, 400, 'Impossible WhatsApp number must be rejected with 400');
      assert.ok(
        res.body.error.includes('valid WhatsApp number'),
        `Error message must be user-safe, got: ${res.body.error}`
      );
      assert.ok(!res.body.error.includes('INVALID_COUNTRY'));
      assert.ok(!res.body.error.includes('PARSE_ERROR'));
      pass('impossible WhatsApp rejected server-side');
    }

    // -------------------------------------------------------------------------
    // 13. Existing country_iso NULL Parent still loads
    // -------------------------------------------------------------------------
    console.log('--- 13. Existing country_iso NULL Parent still loads ---');
    {
      const legacyUserId = `usr-legacy-${testRunId}`;
      const legacyProfileId = `prof-legacy-${testRunId}`;
      const legacyEmail = `legacy-${testRunId}@test.org`;

      await execute(`
        INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 'parent', 'active', 1, ?, ?)
      `, [legacyUserId, legacyEmail, hashPassword(password), nowIso, nowIso]);

      await execute(`
        INSERT INTO parent_profiles (
          id, user_id, full_name, email, phone_number, whatsapp_number, country, country_iso,
          home_address, state_region, city, preferred_contact, photo_file_id, created_at, updated_at
        )
        VALUES (?, ?, 'Legacy Parent', ?, '08012345678', '08012345678', 'Nigeria', NULL, '10 Old Road', 'Lagos', 'Yaba', 'WhatsApp', 'dummy-id', ?, ?)
      `, [legacyProfileId, legacyUserId, legacyEmail, nowIso, nowIso]);

      const legacyToken = generateToken(legacyUserId);
      const res = await fetch(`${baseUrl}/api/parent/profile`, {
        headers: { Authorization: `Bearer ${legacyToken}` }
      });
      const data = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.countryIso, 'NG', 'Should resolve countryIso to NG from country name');
      assert.strictEqual(data.country, 'Nigeria');
      pass('existing country_iso NULL Parent still loads');

      // -----------------------------------------------------------------------
      // 14. Existing E.164 Parent still loads & infers WhatsApp country safely
      // -----------------------------------------------------------------------
      console.log('--- 14. Existing E.164 Parent still loads & infers WhatsApp country safely ---');
      await execute('UPDATE parent_profiles SET whatsapp_number = ?, whatsapp_country_iso = NULL WHERE id = ?', ['+442079460000', legacyProfileId]);
      const resE164 = await fetch(`${baseUrl}/api/parent/profile`, {
        headers: { Authorization: `Bearer ${legacyToken}` }
      });
      const dataE164 = await resE164.json();
      assert.strictEqual(resE164.status, 200);
      assert.strictEqual(dataE164.whatsappNumber, '+442079460000');
      assert.strictEqual(dataE164.whatsappCountryIso, 'GB', 'E.164 +44... must safely infer display country GB');
      const checkLegacyWaDb = await queryOne('SELECT whatsapp_country_iso FROM parent_profiles WHERE id = ?', [legacyProfileId]);
      assert.strictEqual(checkLegacyWaDb.whatsapp_country_iso, null, 'Opening profile must not mutate DB whatsapp_country_iso');
      pass('existing E.164 number infers display country safely without mutating DB');

      // NULL WhatsApp number falls back safely to residence country_iso or NG
      await execute('UPDATE parent_profiles SET whatsapp_number = NULL, whatsapp_country_iso = NULL WHERE id = ?', [legacyProfileId]);
      const resNullWa = await fetch(`${baseUrl}/api/parent/profile`, {
        headers: { Authorization: `Bearer ${legacyToken}` }
      });
      const dataNullWa = await resNullWa.json();
      assert.strictEqual(resNullWa.status, 200);
      assert.strictEqual(dataNullWa.whatsappCountryIso, 'NG', 'NULL WhatsApp country falls back to residence country_iso');
      pass('existing NULL WhatsApp country remains backward compatible');

      // -----------------------------------------------------------------------
      // 15. Opening profile does not mutate existing data
      // -----------------------------------------------------------------------
      console.log('--- 15. Opening profile does not mutate existing data ---');
      // Set country_iso back to NULL and record updated_at
      await execute('UPDATE parent_profiles SET country_iso = NULL, updated_at = ? WHERE id = ?', ['2026-01-01T00:00:00.000Z', legacyProfileId]);

      // Call GET profile multiple times
      await fetch(`${baseUrl}/api/parent/profile`, { headers: { Authorization: `Bearer ${legacyToken}` } });
      await fetch(`${baseUrl}/api/parent/profile`, { headers: { Authorization: `Bearer ${legacyToken}` } });

      const checkDb = await queryOne('SELECT country_iso, updated_at FROM parent_profiles WHERE id = ?', [legacyProfileId]);
      assert.strictEqual(checkDb.country_iso, null, 'country_iso must remain NULL until explicitly saved');
      assert.strictEqual(checkDb.updated_at, '2026-01-01T00:00:00.000Z', 'updated_at must NOT change on read');
      pass('opening profile does not mutate existing data');
    }

    // -------------------------------------------------------------------------
    // 16. Save for later still works without WhatsApp
    // -------------------------------------------------------------------------
    console.log('--- 16. Save for later still works without WhatsApp ---');
    {
      const res = await makeParentRequest('/api/parent/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Chidinma Adeyemi',
          email: parentEmail,
          phone: '+2348012345678',
          whatsapp: '', // Empty WhatsApp
          country: 'Nigeria',
          countryIso: 'NG',
          homeAddress: '12 Test Crescent',
          stateRegion: 'Lagos',
          city: 'Ikeja',
          preferredContact: 'Email',
          photoUrl: 'https://example.com/photo.jpg'
        })
      });

      assert.strictEqual(res.status, 200, 'Saving profile without WhatsApp must succeed');
      pass('Save for later still works without WhatsApp');
    }

    // -------------------------------------------------------------------------
    // 17. Consent state is not automatically changed
    // -------------------------------------------------------------------------
    console.log('--- 17. Consent state is not automatically changed ---');
    {
      await execute("UPDATE parent_profiles SET whatsapp_consent_status = 'unknown' WHERE id = ?", [parentProfileId]);

      await makeParentRequest('/api/parent/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Chidinma Adeyemi',
          email: parentEmail,
          phone: '+2348012345678',
          whatsapp: '+2348012345678',
          country: 'Nigeria',
          countryIso: 'NG',
          homeAddress: '12 Test Crescent',
          stateRegion: 'Lagos',
          city: 'Ikeja',
          preferredContact: 'WhatsApp',
          photoUrl: 'https://example.com/photo.jpg'
        })
      });

      const dbRow = await queryOne('SELECT whatsapp_consent_status FROM parent_profiles WHERE id = ?', [parentProfileId]);
      assert.strictEqual(dbRow.whatsapp_consent_status, 'unknown', 'Consent must remain unchanged');
      pass('consent state is not automatically changed');
    }

    // -------------------------------------------------------------------------
    // 18. Login/session behaviour unchanged
    // -------------------------------------------------------------------------
    console.log('--- 18. Login/session behaviour unchanged ---');
    {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: parentEmail,
          password: password
        })
      });
      const loginData = await loginRes.json();
      assert.strictEqual(loginRes.status, 200);
      assert.ok(loginData.token, 'Must return JWT token');
      assert.strictEqual(loginData.user.email, parentEmail);
      assert.strictEqual(loginData.user.role, 'parent');
      pass('login/session behaviour unchanged');
    }

    // -------------------------------------------------------------------------
    // 19. No external country API
    // -------------------------------------------------------------------------
    console.log('--- 19. No external country API ---');
    const parentRoutePath = path.resolve(process.cwd(), 'src/server/routes/parent.ts');
    const parentRouteSource = fs.readFileSync(parentRoutePath, 'utf-8');
    const countriesPath = path.resolve(process.cwd(), 'src/utils/countries.ts');
    const countriesSource = fs.readFileSync(countriesPath, 'utf-8');

    for (const src of [profileSetupSource, parentRouteSource, countriesSource]) {
      assert.ok(!src.includes('restcountries'), 'No restcountries API allowed');
      assert.ok(!src.includes('twilio.com'), 'No twilio API allowed');
      assert.ok(!src.includes('graph.facebook.com'), 'No Meta API allowed');
    }
    pass('no external country API');

    // -------------------------------------------------------------------------
    // 20. Parent 390px responsive integration present
    // -------------------------------------------------------------------------
    console.log('--- 20. Parent 390px responsive integration present ---');
    assert.ok(
      profileSetupSource.includes('InternationalWhatsAppField'),
      'InternationalWhatsAppField component present'
    );
    const fieldComponentPath = path.resolve(process.cwd(), 'src/components/common/InternationalWhatsAppField.tsx');
    const fieldComponentSource = fs.readFileSync(fieldComponentPath, 'utf-8');
    assert.ok(
      fieldComponentSource.includes('max-w-[360px]') || fieldComponentSource.includes('w-full'),
      'Component includes mobile safe max-width container'
    );
    assert.ok(
      fieldComponentSource.includes('truncate'),
      'Component includes text truncation for narrow viewports'
    );
    pass('Parent 390px responsive integration present');

    console.log(`\n================================================================`);
    console.log(`ALL ${passCount} PARENT INTERNATIONAL WHATSAPP TESTS PASSED!`);
    console.log(`================================================================\n`);
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});
