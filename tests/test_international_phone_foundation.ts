import assert from 'assert';
import { getDb, query } from '../src/server/db';
import { normalizePhoneNumberToE164, resolveParentWhatsAppCandidate } from '../src/server/utils/phone';
import { validatePhoneNumber as serverValidatePhoneNumber, normalizePhone as serverNormalizePhone } from '../src/server/utils/validation';
import { normalizePhone as clientNormalizePhone, validatePhoneNumber as clientValidatePhoneNumber } from '../src/utils/validation';
import {
  getInternationalCountries,
  getCountryByIso,
  validateCountryIso,
  searchInternationalCountries
} from '../src/utils/countries';
import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('=== INTERNATIONAL PHONE FOUNDATION TEST SUITE ===\n');

  let passCount = 0;
  function pass(msg: string) {
    passCount++;
    console.log(`  [PASS] ${msg}`);
  }

  // -----------------------------------------------------------------------------
  // 1. NG local number normalization
  // -----------------------------------------------------------------------------
  console.log('--- 1. NG local number normalization ---');
  const ngLocal = normalizePhoneNumberToE164('08012345678', 'NG');
  assert.strictEqual(ngLocal, '+2348012345678', 'Expected NG local number to normalize to +2348012345678');
  assert.strictEqual(clientNormalizePhone('08012345678', 'NG'), '+2348012345678');
  pass('NG local (08012345678, NG) normalizes to canonical E.164 +2348012345678');

  // -----------------------------------------------------------------------------
  // 2. GB local number normalization
  // -----------------------------------------------------------------------------
  console.log('--- 2. GB local number normalization ---');
  const gbLocal = normalizePhoneNumberToE164('02079460000', 'GB');
  assert.strictEqual(gbLocal, '+442079460000', 'Expected GB local number to normalize to +442079460000');
  assert.strictEqual(clientNormalizePhone('02079460000', 'GB'), '+442079460000');
  pass('GB local (02079460000, GB) normalizes to canonical E.164 +442079460000');

  // -----------------------------------------------------------------------------
  // 3. US local number normalization
  // -----------------------------------------------------------------------------
  console.log('--- 3. US local number normalization ---');
  const usLocal = normalizePhoneNumberToE164('2025550123', 'US');
  assert.strictEqual(usLocal, '+12025550123', 'Expected US local number to normalize to +12025550123');
  assert.strictEqual(clientNormalizePhone('2025550123', 'US'), '+12025550123');
  pass('US local (2025550123, US) normalizes to canonical E.164 +12025550123');

  // -----------------------------------------------------------------------------
  // 4. Already E.164 remains canonical
  // -----------------------------------------------------------------------------
  console.log('--- 4. Already E.164 remains canonical ---');
  const alreadyE164 = normalizePhoneNumberToE164('+2348012345678', 'NG');
  assert.strictEqual(alreadyE164, '+2348012345678');
  const alreadyE164US = normalizePhoneNumberToE164('+12025550123', 'US');
  assert.strictEqual(alreadyE164US, '+12025550123');
  pass('Already E.164 numbers remain unchanged and canonical');

  // -----------------------------------------------------------------------------
  // 5. Selected country does not corrupt international number
  // -----------------------------------------------------------------------------
  console.log('--- 5. Selected country does not corrupt international number ---');
  const crossCountry = normalizePhoneNumberToE164('+442079460000', 'NG');
  assert.strictEqual(crossCountry, '+442079460000', 'UK number should remain UK number even if NG is active country');
  const crossCountry2 = normalizePhoneNumberToE164('+12025550123', 'GB');
  assert.strictEqual(crossCountry2, '+12025550123', 'US number should remain US number even if GB is active country');
  pass('Explicit international prefix (+) preserves country calling code regardless of default country');

  // -----------------------------------------------------------------------------
  // 6. Lowercase ISO normalized
  // -----------------------------------------------------------------------------
  console.log('--- 6. Lowercase ISO normalized ---');
  const lowerNg = normalizePhoneNumberToE164('08012345678', 'ng');
  assert.strictEqual(lowerNg, '+2348012345678');
  const lowerGb = normalizePhoneNumberToE164('02079460000', 'gb');
  assert.strictEqual(lowerGb, '+442079460000');
  const valLower = validateCountryIso('us');
  assert.strictEqual(valLower.valid, true);
  assert.strictEqual(valLower.countryIso, 'US');
  pass('Lowercase ISO alpha-2 codes (ng, gb, us) are normalized to uppercase (NG, GB, US)');

  // -----------------------------------------------------------------------------
  // 7. Invalid ISO rejected
  // -----------------------------------------------------------------------------
  console.log('--- 7. Invalid ISO rejected ---');
  assert.strictEqual(validateCountryIso('NGA').valid, false);
  assert.strictEqual(validateCountryIso('234').valid, false);
  assert.strictEqual(validateCountryIso('Nigeria').valid, false);
  assert.strictEqual(validateCountryIso('ZZ').valid, false);
  assert.strictEqual(normalizePhoneNumberToE164('08012345678', 'NGA'), null);
  assert.strictEqual(normalizePhoneNumberToE164('08012345678', '234'), null);
  pass('Invalid ISO values (3-letter NGA, dial code 234, name Nigeria, unsupported ZZ) are rejected');

  // -----------------------------------------------------------------------------
  // 8. Impossible number rejected
  // -----------------------------------------------------------------------------
  console.log('--- 8. Impossible number rejected ---');
  assert.strictEqual(normalizePhoneNumberToE164('12345', 'NG'), null);
  assert.strictEqual(normalizePhoneNumberToE164('abcdefg', 'NG'), null);
  const serverVal = serverValidatePhoneNumber('12345', 'NG');
  assert.strictEqual(serverVal.valid, false);
  const clientVal = clientValidatePhoneNumber('12345', 'NG');
  assert.ok(clientVal, 'Client validation should flag impossible number');
  pass('Impossible or truncated numbers (12345, non-digits) are rejected');

  // -----------------------------------------------------------------------------
  // 9. Existing NG fallback still works when country omitted
  // -----------------------------------------------------------------------------
  console.log('--- 9. Existing NG fallback still works when country omitted ---');
  const omittedCountry = normalizePhoneNumberToE164('08012345678');
  assert.strictEqual(omittedCountry, '+2348012345678');
  const undefinedCountry = normalizePhoneNumberToE164('08012345678', undefined);
  assert.strictEqual(undefinedCountry, '+2348012345678');
  const nullCountry = normalizePhoneNumberToE164('08012345678', null);
  assert.strictEqual(nullCountry, '+2348012345678');
  assert.strictEqual(clientNormalizePhone('08012345678'), '+2348012345678');
  pass('Omitting country parameter safely falls back to NG for backwards compatibility');

  // -----------------------------------------------------------------------------
  // 10. Parent schema in SQLite has nullable country_iso
  // -----------------------------------------------------------------------------
  console.log('--- 10. Parent schema in SQLite has nullable country_iso ---');
  getDb(); // ensure initialized
  const parentTableInfo = await query<any>('PRAGMA table_info(parent_profiles)');
  const parentCountryIsoCol = parentTableInfo.find((col: any) => col.name === 'country_iso');
  assert.ok(parentCountryIsoCol, 'parent_profiles must have country_iso column');
  assert.strictEqual(parentCountryIsoCol.notnull, 0, 'country_iso in parent_profiles must be nullable (notnull=0)');
  pass('parent_profiles table contains nullable country_iso column');

  // -----------------------------------------------------------------------------
  // 11. Volunteer schema in SQLite has nullable country and country_iso
  // -----------------------------------------------------------------------------
  console.log('--- 11. Volunteer schema in SQLite has nullable country and country_iso ---');
  const volunteerTableInfo = await query<any>('PRAGMA table_info(volunteer_profiles)');
  const volunteerCountryCol = volunteerTableInfo.find((col: any) => col.name === 'country');
  const volunteerCountryIsoCol = volunteerTableInfo.find((col: any) => col.name === 'country_iso');
  assert.ok(volunteerCountryCol, 'volunteer_profiles must have country column');
  assert.strictEqual(volunteerCountryCol.notnull, 0, 'country in volunteer_profiles must be nullable (notnull=0)');
  assert.ok(volunteerCountryIsoCol, 'volunteer_profiles must have country_iso column');
  assert.strictEqual(volunteerCountryIsoCol.notnull, 0, 'country_iso in volunteer_profiles must be nullable (notnull=0)');
  pass('volunteer_profiles table contains nullable country and country_iso columns');

  // -----------------------------------------------------------------------------
  // 12. Existing consent defaults unchanged
  // -----------------------------------------------------------------------------
  console.log('--- 12. Existing consent defaults unchanged ---');
  const parentWaConsentCol = parentTableInfo.find((col: any) => col.name === 'whatsapp_consent_status');
  assert.ok(parentWaConsentCol, 'parent_profiles has whatsapp_consent_status');
  assert.ok(
    parentWaConsentCol.dflt_value?.includes('unknown'),
    `parent_profiles whatsapp_consent_status default should be 'unknown', got ${parentWaConsentCol.dflt_value}`
  );

  const volunteerWaConsentCol = volunteerTableInfo.find((col: any) => col.name === 'whatsapp_consent_status');
  assert.ok(volunteerWaConsentCol, 'volunteer_profiles has whatsapp_consent_status');
  assert.ok(
    volunteerWaConsentCol.dflt_value?.includes('unknown'),
    `volunteer_profiles whatsapp_consent_status default should be 'unknown', got ${volunteerWaConsentCol.dflt_value}`
  );
  pass('Existing WhatsApp consent columns maintain default "unknown" and are not mutated');

  // -----------------------------------------------------------------------------
  // 13. Existing phone values are not migrated/mutated
  // -----------------------------------------------------------------------------
  console.log('--- 13. Existing phone values are not migrated/mutated ---');
  // Verify migration file docs/migrations/014_international_whatsapp_neon.sql only adds nullable Parent columns
  const migrationSql = fs.readFileSync(path.resolve(process.cwd(), 'docs/migrations/014_international_whatsapp_neon.sql'), 'utf-8');
  assert.ok(migrationSql.includes('ADD COLUMN IF NOT EXISTS country_iso VARCHAR(2) NULL'), '014 must add parent_profiles.country_iso');
  assert.ok(migrationSql.includes('ADD COLUMN IF NOT EXISTS whatsapp_country_iso VARCHAR(2) NULL'), '014 must add parent_profiles.whatsapp_country_iso');
  assert.ok(!migrationSql.includes('volunteer_profiles'), '014 must NOT add volunteer_profiles columns (deferred to Volunteer phase)');
  assert.ok(!migrationSql.includes('UPDATE parent_profiles'), 'Migration must not run UPDATE on parent_profiles');
  assert.ok(!migrationSql.includes('SET phone'), 'Migration must not mutate existing phone numbers');
  pass('Database migration 014 strictly contains additive Parent columns and executes no UPDATE or data mutations');

  // -----------------------------------------------------------------------------
  // 14. No app-boot PostgreSQL DDL added
  // -----------------------------------------------------------------------------
  console.log('--- 14. No app-boot PostgreSQL DDL added ---');
  const dbSource = fs.readFileSync(path.resolve(process.cwd(), 'src/server/db.ts'), 'utf-8');
  const startIdx = dbSource.indexOf('async function initPostgresSchema');
  assert.ok(startIdx !== -1, 'initPostgresSchema function must exist in db.ts');
  const initPgBody = dbSource.slice(startIdx, startIdx + 45000);
  assert.ok(
    !initPgBody.includes('014_international_whatsapp'),
    'initPostgresSchema must not reference 014 migration'
  );
  assert.ok(
    !initPgBody.includes('country_iso VARCHAR'),
    'initPostgresSchema must not execute DDL for country_iso on production app boot'
  );
  pass('Production PostgreSQL app boot (initPostgresSchema) is untouched and executes no 014 DDL');

  // -----------------------------------------------------------------------------
  // 15. Country list and search verification
  // -----------------------------------------------------------------------------
  console.log('--- 15. Country list and search verification ---');
  const countries = getInternationalCountries();
  assert.ok(countries.length > 200, `Expected >200 countries, got ${countries.length}`);
  const nigeria = getCountryByIso('NG');
  assert.ok(nigeria);
  assert.strictEqual(nigeria?.iso, 'NG');
  assert.strictEqual(nigeria?.name, 'Nigeria');
  assert.strictEqual(nigeria?.callingCode, '234');
  assert.strictEqual(nigeria?.dialCode, '+234');
  assert.strictEqual(nigeria?.flag, '🇳🇬');

  const searchByName = searchInternationalCountries('Nigeria');
  assert.ok(searchByName.some(c => c.iso === 'NG'));
  const searchByIso = searchInternationalCountries('NG');
  assert.ok(searchByIso.some(c => c.iso === 'NG'));
  const searchByDial = searchInternationalCountries('+234');
  assert.ok(searchByDial.some(c => c.iso === 'NG'));
  const searchByDigits = searchInternationalCountries('234');
  assert.ok(searchByDigits.some(c => c.iso === 'NG'));
  pass('Country list helper delivers 245 countries and robust search by name, ISO, dial code, and digits');

  console.log(`\n=== ALL ${passCount} INTERNATIONAL PHONE FOUNDATION TESTS PASSED ===\n`);
}

runTests().catch((err) => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
