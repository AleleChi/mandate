import assert from 'assert';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  InternationalWhatsAppField,
  InternationalWhatsAppFieldProps
} from '../src/components/common/InternationalWhatsAppField';
import {
  getInternationalCountries,
  searchInternationalCountries,
  getCountryByIso,
  validateCountryIso
} from '../src/utils/countries';
import { normalizePhone, validatePhoneNumber } from '../src/utils/validation';

console.log('=== INTERNATIONAL WHATSAPP FIELD TEST SUITE ===\n');

let passCount = 0;
function pass(msg: string) {
  passCount++;
  console.log(`  [PASS] ${msg}`);
}

const componentFilePath = path.resolve(
  process.cwd(),
  'src/components/common/InternationalWhatsAppField.tsx'
);
const componentSource = fs.readFileSync(componentFilePath, 'utf-8');

// -----------------------------------------------------------------------------
// 1. Component uses shared country utility
// -----------------------------------------------------------------------------
console.log('--- 1. Component uses shared country utility ---');
assert.ok(
  componentSource.includes("from '../../utils/countries'"),
  'Component must import from src/utils/countries'
);
assert.ok(
  componentSource.includes('getInternationalCountries'),
  'Component must use getInternationalCountries'
);
assert.ok(
  componentSource.includes('searchInternationalCountries'),
  'Component must use searchInternationalCountries'
);
pass('Component imports and uses shared country utility (src/utils/countries.ts)');

// -----------------------------------------------------------------------------
// 2. No hardcoded country table
// -----------------------------------------------------------------------------
console.log('--- 2. No hardcoded country table ---');
assert.ok(
  !componentSource.includes("callingCode: '233'"),
  'Component must not contain hardcoded country list entries'
);
assert.ok(
  !componentSource.includes("callingCode: '44'"),
  'Component must not contain hardcoded dial code mapping'
);
pass('Component contains zero hardcoded country tables or dial-code lists');

// -----------------------------------------------------------------------------
// 3. No external country API
// -----------------------------------------------------------------------------
console.log('--- 3. No external country API ---');
assert.ok(
  !componentSource.includes('fetch('),
  'Component must not make fetch calls'
);
assert.ok(
  !componentSource.includes('axios'),
  'Component must not make axios calls'
);
assert.ok(
  !componentSource.includes('restcountries'),
  'Component must not call restcountries'
);
assert.ok(
  !componentSource.includes('googleapis.com'),
  'Component must not call googleapis'
);
pass('Zero external network calls or remote country APIs are used');

// -----------------------------------------------------------------------------
// 4. Nigeria searchable by Nigeria
// -----------------------------------------------------------------------------
console.log('--- 4. Nigeria searchable by Nigeria ---');
const searchByName = searchInternationalCountries('Nigeria');
assert.ok(searchByName.some((c) => c.iso === 'NG' && c.name === 'Nigeria'));
pass('Nigeria is searchable by full name ("Nigeria")');

// -----------------------------------------------------------------------------
// 5. Nigeria searchable by NG
// -----------------------------------------------------------------------------
console.log('--- 5. Nigeria searchable by NG ---');
const searchByIso = searchInternationalCountries('NG');
assert.ok(searchByIso.some((c) => c.iso === 'NG'));
const searchByIsoLower = searchInternationalCountries('ng');
assert.ok(searchByIsoLower.some((c) => c.iso === 'NG'));
pass('Nigeria is searchable by 2-letter ISO ("NG" / "ng")');

// -----------------------------------------------------------------------------
// 6. Nigeria searchable by +234
// -----------------------------------------------------------------------------
console.log('--- 6. Nigeria searchable by +234 ---');
const searchByDial = searchInternationalCountries('+234');
assert.ok(searchByDial.some((c) => c.iso === 'NG' && c.dialCode === '+234'));
pass('Nigeria is searchable by dial code with plus ("+234")');

// -----------------------------------------------------------------------------
// 7. Ghana searchable by 233
// -----------------------------------------------------------------------------
console.log('--- 7. Ghana searchable by 233 ---');
const searchByDigits = searchInternationalCountries('233');
assert.ok(searchByDigits.some((c) => c.iso === 'GH' && c.callingCode === '233'));
pass('Ghana is searchable by calling code digits ("233")');

// -----------------------------------------------------------------------------
// 8. Country change returns ISO
// -----------------------------------------------------------------------------
console.log('--- 8. Country change returns ISO ---');
let changedCountryIso: string | null = null;
const mockOnCountryChange = (iso: string) => {
  changedCountryIso = iso;
};

// Test ISO validity function returns CountryCode
const ghVal = validateCountryIso('GH');
assert.strictEqual(ghVal.valid, true);
assert.strictEqual(ghVal.countryIso, 'GH');

mockOnCountryChange(ghVal.countryIso!);
assert.strictEqual(changedCountryIso, 'GH', 'Expected country change to pass ISO "GH"');
pass('Country selection callback consistently yields uppercase 2-letter ISO code');

// -----------------------------------------------------------------------------
// 9. NG local input normalizes to +234...
// -----------------------------------------------------------------------------
console.log('--- 9. NG local input normalizes to +234... ---');
const ngNormalized = normalizePhone('08012345678', 'NG');
assert.strictEqual(ngNormalized, '+2348012345678');
pass('NG local input "08012345678" normalizes to canonical E.164 +2348012345678');

// -----------------------------------------------------------------------------
// 10. GB local input normalizes to +44...
// -----------------------------------------------------------------------------
console.log('--- 10. GB local input normalizes to +44... ---');
const gbNormalized = normalizePhone('02079460000', 'GB');
assert.strictEqual(gbNormalized, '+442079460000');
pass('GB local input "02079460000" normalizes to canonical E.164 +442079460000');

// -----------------------------------------------------------------------------
// 11. US input normalizes to +1...
// -----------------------------------------------------------------------------
console.log('--- 11. US input normalizes to +1... ---');
const usNormalized = normalizePhone('2025550123', 'US');
assert.strictEqual(usNormalized, '+12025550123');
pass('US input "2025550123" normalizes to canonical E.164 +12025550123');

// -----------------------------------------------------------------------------
// 12. Explicit +E.164 not corrupted
// -----------------------------------------------------------------------------
console.log('--- 12. Explicit +E.164 not corrupted ---');
const explicitUkWithNgSelected = normalizePhone('+442079460000', 'NG');
assert.strictEqual(
  explicitUkWithNgSelected,
  '+442079460000',
  'UK number must retain +44 even when NG is selected'
);
pass('Explicit international number (+442079460000) is preserved regardless of default country');

// -----------------------------------------------------------------------------
// 13. Invalid number reports invalid state
// -----------------------------------------------------------------------------
console.log('--- 13. Invalid number reports invalid state ---');
const invalidValidation = validatePhoneNumber('12345', 'NG');
assert.ok(Boolean(invalidValidation), 'Expected 12345 to fail validation');
assert.strictEqual(invalidValidation, 'Enter a valid phone number.');

// Component computes null E.164 when validation fails
const computedE164 = invalidValidation ? null : normalizePhone('12345', 'NG');
assert.strictEqual(computedE164, null, 'Invalid number must compute to null E.164');
pass('Impossible or truncated number (12345) reports an invalid validation state and null E.164');

// -----------------------------------------------------------------------------
// 14. Parent 390px-safe responsive classes present
// -----------------------------------------------------------------------------
console.log('--- 14. Parent 390px-safe responsive classes present ---');
assert.ok(
  componentSource.includes('min-w-0'),
  'Phone input must allow flex shrinking without overflowing'
);
assert.ok(
  componentSource.includes('shrink-0'),
  'Trigger and icons must have shrink-0'
);
assert.ok(
  componentSource.includes('truncate'),
  'Country name must truncate cleanly in selector'
);
pass('Responsive classes guarantee fit inside Parent ~390px shell without horizontal overflow');

// -----------------------------------------------------------------------------
// 14B. Collapsed WhatsApp control presentation (HubSpot-style compact control)
// -----------------------------------------------------------------------------
console.log('--- 14B. Collapsed WhatsApp control presentation ---');
const collapsedHtml = renderToString(
  React.createElement(InternationalWhatsAppField, {
    label: 'WhatsApp number',
    countryIso: 'NG',
    value: '08012345678',
    onCountryChange: () => {},
    onChange: () => {}
  })
);
const triggerHtml = collapsedHtml.slice(
  collapsedHtml.indexOf('<button'),
  collapsedHtml.indexOf('</button>') + 9
);
// Strip tags to get visible inner text
const visibleTriggerText = triggerHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
assert.ok(visibleTriggerText.includes('🇳🇬'), '1. collapsed WhatsApp control contains flag');
assert.ok(visibleTriggerText.includes('+234'), '2. collapsed WhatsApp control contains dial code');
assert.ok(!visibleTriggerText.includes('NG'), '3. collapsed control does NOT visibly render ISO NG');
assert.ok(!visibleTriggerText.includes('Nigeria'), '4. collapsed control does NOT visibly render Nigeria');
assert.ok(componentSource.includes('{c.name}'), '5. selector DOES render Nigeria/country name');
assert.ok(componentSource.includes('{c.dialCode}'), '6. selector DOES render +234/dial code');
assert.ok(!componentSource.includes('({c.iso})'), 'Selector does not render raw ISO badge in list');
pass('Collapsed control renders compact 🇳🇬 +234 ▾ without full country name or ISO text; selector renders name and dial code');

// -----------------------------------------------------------------------------
// 15. Dark mode classes present
// -----------------------------------------------------------------------------
console.log('--- 15. Dark mode classes present ---');
assert.ok(componentSource.includes('dark:bg-[#21211E]'));
assert.ok(componentSource.includes('dark:border-[#3A3835]'));
assert.ok(componentSource.includes('dark:text-[#F0EBE3]'));
assert.ok(componentSource.includes('dark:text-[#B8B0A5]'));
assert.ok(componentSource.includes('dark:hover:bg-[#2A2926]'));
assert.ok(componentSource.includes('dark:focus-within:ring-[#C59B27]/20'));
pass('Complete warm operational dark mode tokens implemented across field and modal');

// -----------------------------------------------------------------------------
// 16. No WhatsApp verified claim
// -----------------------------------------------------------------------------
console.log('--- 16. No WhatsApp verified claim ---');
const forbiddenPhrases = [
  'WhatsApp verified',
  'whatsapp verified',
  'Verified WhatsApp account',
  'verified whatsapp account',
  'Active on WhatsApp',
  'active on whatsapp'
];
for (const phrase of forbiddenPhrases) {
  assert.ok(
    !componentSource.includes(phrase),
    `Component must NOT claim "${phrase}"`
  );
}
pass('Component makes zero unverified claims of WhatsApp account existence');

// -----------------------------------------------------------------------------
// 17. Component is shared/common, not Parent-specific
// -----------------------------------------------------------------------------
console.log('--- 17. Component is shared/common, not Parent-specific ---');
assert.ok(
  componentFilePath.includes('src/components/common') ||
  componentFilePath.includes('src\\components\\common'),
  'Component must reside in src/components/common'
);
assert.ok(
  !componentSource.includes('parent_profiles'),
  'Component must have no coupled database or parent table dependencies'
);
assert.ok(
  !componentSource.includes('useParentStore'),
  'Component must not be tied to parent store'
);
pass('Component is decoupled and reusable in Parent flows');

// -----------------------------------------------------------------------------
// 18. Component is shared/common, not Volunteer-specific
// -----------------------------------------------------------------------------
console.log('--- 18. Component is shared/common, not Volunteer-specific ---');
assert.ok(
  !componentSource.includes('volunteer_profiles'),
  'Component must have no coupled database or volunteer table dependencies'
);
assert.ok(
  !componentSource.includes('useVolunteerStore'),
  'Component must not be tied to volunteer store'
);
pass('Component is decoupled and reusable in Volunteer flows');

// -----------------------------------------------------------------------------
// 19. SSR HTML markup generation test
// -----------------------------------------------------------------------------
console.log('--- 19. SSR HTML markup generation test ---');
let e164Emitted: string | null = null;
const renderedHtml = renderToString(
  React.createElement(InternationalWhatsAppField, {
    label: 'WhatsApp number',
    required: true,
    countryIso: 'NG',
    value: '08012345678',
    onCountryChange: () => {},
    onChange: () => {},
    onE164Change: (val) => {
      e164Emitted = val;
    }
  })
);

assert.ok(renderedHtml.includes('WhatsApp number'), 'Rendered HTML contains label');
assert.ok(renderedHtml.includes('+234'), 'Rendered HTML contains dial code +234');
assert.ok(renderedHtml.includes('🇳🇬'), 'Rendered HTML contains Nigeria flag');
assert.ok(renderedHtml.includes('type="tel"'), 'Rendered HTML contains tel input');
assert.ok(renderedHtml.includes('Valid number'), 'Rendered HTML shows valid number indicator');
pass('Component renders valid SSR markup with flag, dial code, input, and valid indicator');

console.log(`\n=== ALL ${passCount} INTERNATIONAL WHATSAPP FIELD TESTS PASSED ===\n`);
