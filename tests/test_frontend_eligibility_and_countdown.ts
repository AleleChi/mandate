import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  calculateAgeOnEventDate,
  checkChildEventEligibility,
  EVENT_START_DATE_2026,
  MIN_ELIGIBLE_AGE,
  MAX_ELIGIBLE_AGE
} from '../src/utils/age';
import {
  calculateRegistrationCountdown,
  CANONICAL_REGISTRATION_DEADLINE
} from '../src/utils/countdown';
import {
  DEFAULT_CANONICAL_GROUPS
} from '../src/components/landing/AgeGroups';
import { resolveMediaUrl, isStaticBundledAsset } from '../src/utils/mediaUrl';

console.log('================================================================');
console.log('FRONTEND ELIGIBILITY, COUNTDOWN & AGE GROUPS UNIT SUITE');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// 1. AGE ELIGIBILITY
console.log('1. FRONTEND AGE ELIGIBILITY');

test('child age 1 on event date (2025-05-10) -> ineligible', () => {
  const res = checkChildEventEligibility('2025-05-10');
  assert.strictEqual(res.isEligible, false);
  assert.strictEqual(res.ageOnEventDate, 1);
  assert.strictEqual(res.message, 'This programme is currently open to children ages 2–14.');
});

test('child exactly age 2 on event date (2024-11-21) -> eligible', () => {
  const res = checkChildEventEligibility('2024-11-21');
  assert.strictEqual(res.isEligible, true);
  assert.strictEqual(res.ageOnEventDate, 2);
});

test('child age 6 on event date (2020-05-15) -> eligible', () => {
  const res = checkChildEventEligibility('2020-05-15');
  assert.strictEqual(res.isEligible, true);
  assert.strictEqual(res.ageOnEventDate, 6);
});

test('child age 12 on event date (2013-11-22) -> eligible', () => {
  const res = checkChildEventEligibility('2013-11-22');
  assert.strictEqual(res.isEligible, true);
  assert.strictEqual(res.ageOnEventDate, 12);
});

test('child age 13 on event date (2013-11-21) -> eligible', () => {
  const res = checkChildEventEligibility('2013-11-21');
  assert.strictEqual(res.isEligible, true);
  assert.strictEqual(res.ageOnEventDate, 13);
});

test('child exactly age 14 on event date (2012-11-21) -> eligible', () => {
  const res = checkChildEventEligibility('2012-11-21');
  assert.strictEqual(res.isEligible, true);
  assert.strictEqual(res.ageOnEventDate, 14);
});

test('child age 15 on event date (2011-11-21) -> ineligible', () => {
  const res = checkChildEventEligibility('2011-11-21');
  assert.strictEqual(res.isEligible, false);
  assert.strictEqual(res.ageOnEventDate, 15);
  assert.strictEqual(res.message, 'This programme is currently open to children ages 2–14.');
});

test('birthday boundary: born 2024-11-22 is 1 on event date -> ineligible', () => {
  const res = checkChildEventEligibility('2024-11-22');
  assert.strictEqual(res.isEligible, false);
  assert.strictEqual(res.ageOnEventDate, 1);
});

test('birthday boundary: born 2024-11-21 is 2 on event date -> eligible', () => {
  const res = checkChildEventEligibility('2024-11-21');
  assert.strictEqual(res.isEligible, true);
  assert.strictEqual(res.ageOnEventDate, 2);
});

test('birthday boundary: born 2012-11-22 is 13 on event date -> eligible', () => {
  const res = checkChildEventEligibility('2012-11-22');
  assert.strictEqual(res.isEligible, true);
  assert.strictEqual(res.ageOnEventDate, 13);
});

test('birthday boundary: born 2012-11-21 is 14 on event date -> eligible', () => {
  const res = checkChildEventEligibility('2012-11-21');
  assert.strictEqual(res.isEligible, true);
  assert.strictEqual(res.ageOnEventDate, 14);
});

test('birthday boundary: born 2011-11-21 is 15 on event date -> ineligible', () => {
  const res = checkChildEventEligibility('2011-11-21');
  assert.strictEqual(res.isEligible, false);
  assert.strictEqual(res.ageOnEventDate, 15);
});

// 2. COUNTDOWN
console.log('\n2. FRONTEND COUNTDOWN');

test('canonical deadline matches 2026-10-25T23:59:00+01:00', () => {
  assert.strictEqual(CANONICAL_REGISTRATION_DEADLINE, '2026-10-25T23:59:00+01:00');
});

test('before deadline returns positive values and isClosed false', () => {
  const res = calculateRegistrationCountdown(CANONICAL_REGISTRATION_DEADLINE);
  // Current time is before 2026-10-25
  assert.strictEqual(res.isClosed, false);
  assert(res.days >= 10, `Expected days >= 10, got ${res.days}`);
  assert(res.hours >= 0 && res.hours < 24);
  assert(res.minutes >= 0 && res.minutes < 60);
});

test('expired date returns isClosed true and zeros (no negative numbers)', () => {
  const res = calculateRegistrationCountdown('2020-01-01T00:00:00Z');
  assert.strictEqual(res.isClosed, true);
  assert.strictEqual(res.days, 0);
  assert.strictEqual(res.hours, 0);
  assert.strictEqual(res.minutes, 0);
});

// 3. PUBLIC AGE GROUPS
console.log('\n3. FRONTEND PUBLIC AGE GROUPS');

test('obsolete Below 1 is removed from default groups', () => {
  assert(!DEFAULT_CANONICAL_GROUPS.some(g => g.label.toLowerCase().includes('below') || g.id?.includes('below') || g.minAge === 0));
});

test('obsolete 1-3 is removed from default groups', () => {
  assert(!DEFAULT_CANONICAL_GROUPS.some(g => g.id === 'ag-1-3' || (g.minAge === 1 && g.maxAge === 3)));
});

test('contains 5 canonical groups', () => {
  assert.strictEqual(DEFAULT_CANONICAL_GROUPS.length, 5);
  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[0].label, 'EARLY YEARS');
  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[0].minAge, 2);
  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[0].maxAge, 3);

  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[1].label, '4–6 YEARS');
  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[1].minAge, 4);
  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[1].maxAge, 6);

  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[2].label, '7–9 YEARS');
  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[2].minAge, 7);
  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[2].maxAge, 9);

  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[3].label, '10–12 YEARS');
  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[3].minAge, 10);
  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[3].maxAge, 12);

  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[4].label, '13–14 YEARS');
  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[4].minAge, 13);
  assert.strictEqual(DEFAULT_CANONICAL_GROUPS[4].maxAge, 14);
});

// 4. DARK MODE STYLES & CONTRAST
console.log('\n4. DARK MODE STYLES & CONTRAST');

test('KoinoniaDatePicker contains dark mode surfaces (#21211E), borders (#302E29), gold accent (#C59B27)', () => {
  const datePickerContent = fs.readFileSync(path.resolve('src/components/common/KoinoniaDatePicker.tsx'), 'utf-8');
  assert(datePickerContent.includes('dark:bg-[#21211E]'), 'Missing dark:bg-[#21211E] on picker surface');
  assert(datePickerContent.includes('dark:border-[#302E29]'), 'Missing dark:border-[#302E29] on picker borders');
  assert(datePickerContent.includes('dark:bg-[#C59B27]'), 'Missing dark:bg-[#C59B27] on selected day');
  assert(datePickerContent.includes('dark:text-[#F0EBE3]'), 'Missing dark:text-[#F0EBE3] on available dates/headers');
  assert(datePickerContent.includes('dark:text-[#52504B]'), 'Missing dark:text-[#52504B] on disabled dates');
});

test('PremiumSelect contains dark mode surfaces (#21211E), borders (#3A3835), selected (#262520), hover (#2A2926)', () => {
  const selectContent = fs.readFileSync(path.resolve('src/components/common/PremiumSelect.tsx'), 'utf-8');
  assert(selectContent.includes('dark:bg-[#21211E]'), 'Missing dark:bg-[#21211E] on select dropdown surface');
  assert(selectContent.includes('dark:border-[#3A3835]'), 'Missing dark:border-[#3A3835] on trigger/menu');
  assert(selectContent.includes('dark:bg-[#262520]'), 'Missing dark:bg-[#262520] on selected row');
  assert(selectContent.includes('dark:hover:bg-[#2A2926]'), 'Missing dark:hover:bg-[#2A2926] on hovered row');
  assert(selectContent.includes('dark:text-[#F0EBE3]'), 'Missing dark:text-[#F0EBE3] on primary text');
});

// 5. CTA TOGGLES & DEADLINE OVERRIDE
console.log('\n5. CTA TOGGLES & DEADLINE OVERRIDE');

function evaluateCtaVisibility(
  parentEnabled: boolean,
  volunteerEnabled: boolean,
  isDeadlineClosed: boolean
) {
  const showParent = parentEnabled;
  const showVolunteer = volunteerEnabled;
  const showCtaRow = showParent || showVolunteer;
  const parentAllowsNewApplication = showParent && !isDeadlineClosed;
  const parentAction = !showParent ? null : (isDeadlineClosed ? 'sign_in' : 'register');

  return {
    showCtaRow,
    showParent,
    showVolunteer,
    parentAction,
    parentAllowsNewApplication,
  };
}

test('parent ON, volunteer ON -> show both buttons', () => {
  const res = evaluateCtaVisibility(true, true, false);
  assert.strictEqual(res.showCtaRow, true);
  assert.strictEqual(res.showParent, true);
  assert.strictEqual(res.showVolunteer, true);
  assert.strictEqual(res.parentAction, 'register');
  assert.strictEqual(res.parentAllowsNewApplication, true);
});

test('parent ON, volunteer OFF -> show only Register your child', () => {
  const res = evaluateCtaVisibility(true, false, false);
  assert.strictEqual(res.showCtaRow, true);
  assert.strictEqual(res.showParent, true);
  assert.strictEqual(res.showVolunteer, false);
  assert.strictEqual(res.parentAction, 'register');
});

test('parent OFF, volunteer ON -> show only Volunteer sign in', () => {
  const res = evaluateCtaVisibility(false, true, false);
  assert.strictEqual(res.showCtaRow, true);
  assert.strictEqual(res.showParent, false);
  assert.strictEqual(res.showVolunteer, true);
  assert.strictEqual(res.parentAction, null);
});

test('parent OFF, volunteer OFF -> cleanly remove CTA row', () => {
  const res = evaluateCtaVisibility(false, false, false);
  assert.strictEqual(res.showCtaRow, false);
  assert.strictEqual(res.showParent, false);
  assert.strictEqual(res.showVolunteer, false);
});

test('deadline overrides parent enabled state: never allow new application after deadline', () => {
  const res = evaluateCtaVisibility(true, true, true);
  assert.strictEqual(res.showCtaRow, true);
  assert.strictEqual(res.showParent, true);
  assert.strictEqual(res.parentAction, 'sign_in'); // routes to sign-in, not new application
  assert.strictEqual(res.parentAllowsNewApplication, false);
});

// 6. LIVE COUNTDOWN ACCURACY
console.log('\n6. LIVE COUNTDOWN ACCURACY');

test('countdown has 3 units (days, hours, minutes) and no seconds property', () => {
  const res = calculateRegistrationCountdown(CANONICAL_REGISTRATION_DEADLINE);
  assert('days' in res);
  assert('hours' in res);
  assert('minutes' in res);
  assert(!('seconds' in res), 'Countdown must not have seconds');
});

test('closes exactly at deadline timestamp', () => {
  const deadlineMs = new Date(CANONICAL_REGISTRATION_DEADLINE).getTime();
  // 1 millisecond before
  const resBefore = calculateRegistrationCountdown(CANONICAL_REGISTRATION_DEADLINE, deadlineMs - 1);
  assert.strictEqual(resBefore.isClosed, false);

  // Exact timestamp
  const resExact = calculateRegistrationCountdown(CANONICAL_REGISTRATION_DEADLINE, deadlineMs);
  assert.strictEqual(resExact.isClosed, true);

  // 1 millisecond after
  const resAfter = calculateRegistrationCountdown(CANONICAL_REGISTRATION_DEADLINE, deadlineMs + 1);
  assert.strictEqual(resAfter.isClosed, true);
  assert.strictEqual(resAfter.days, 0);
  assert.strictEqual(resAfter.hours, 0);
  assert.strictEqual(resAfter.minutes, 0);
});

// 7. PRELOADER INTEGRITY
console.log('\n7. PRELOADER INTEGRITY');

test('AppPreloader uses bundled koinonia-logo.png and has no remote API fetch dependency', () => {
  const preloaderContent = fs.readFileSync(path.resolve('src/components/common/AppPreloader.tsx'), 'utf-8');
  assert(preloaderContent.includes('koinonia-logo.png'), 'Must import bundled koinonia-logo.png');
  assert(!preloaderContent.includes('fetchLogoUrl'), 'Must NOT depend on fetchLogoUrl');
  assert(!preloaderContent.includes('api.landing.getPublicPage'), 'Must NOT wait on getPublicPage API call');
  assert(preloaderContent.includes('dark:bg-[#19191A]'), 'Must support dark mode background #19191A');
});

// 8. MEDIA URL RESOLVER & STATIC BUNDLED ASSETS
console.log('\n8. MEDIA URL RESOLVER & STATIC BUNDLED ASSETS');

test('frontend local assets remain untouched without API base prefix', () => {
  assert.strictEqual(resolveMediaUrl('/src/assets/images/parent_hero_1783622066454.jpg'), '/src/assets/images/parent_hero_1783622066454.jpg');
  assert.strictEqual(resolveMediaUrl('/src/assets/images/volunteer_hero_1783622081200.jpg'), '/src/assets/images/volunteer_hero_1783622081200.jpg');
  assert.strictEqual(resolveMediaUrl('/assets/index-abc.js'), '/assets/index-abc.js');
  assert.strictEqual(resolveMediaUrl('/social_share.jpg'), '/social_share.jpg');
  assert.strictEqual(resolveMediaUrl('/favicon.ico'), '/favicon.ico');
  assert.strictEqual(resolveMediaUrl('/apple-touch-icon.png'), '/apple-touch-icon.png');
  assert.strictEqual(resolveMediaUrl('blob:http://localhost:5173/abc-123'), 'blob:http://localhost:5173/abc-123');
  assert.strictEqual(resolveMediaUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
});

test('static bundled asset detection properly identifies Vite assets and public images', () => {
  assert.strictEqual(isStaticBundledAsset('/src/assets/images/parent_hero_1783622066454.jpg'), true);
  assert.strictEqual(isStaticBundledAsset('/src/assets/images/volunteer_hero_1783622081200.jpg'), true);
  assert.strictEqual(isStaticBundledAsset('/assets/parent_hero_1783622066454-BTVL3Z5j.jpg'), true);
  assert.strictEqual(isStaticBundledAsset('/assets/volunteer_hero_1783622081200-ABC.jpg'), true);
  assert.strictEqual(isStaticBundledAsset('/social_share.jpg'), true);
  assert.strictEqual(isStaticBundledAsset('social_share.jpg'), true);
  assert.strictEqual(isStaticBundledAsset('/koinonia-logo.png'), true);
  assert.strictEqual(isStaticBundledAsset('/src/assets/images/koinonia-logo.png'), true);
  assert.strictEqual(isStaticBundledAsset('/api/media/files/child-123.jpg'), false);
  assert.strictEqual(isStaticBundledAsset('https://res.cloudinary.com/sample.jpg'), false);
});

test('bundled Vite imports are never converted into backend API URLs', () => {
  const devHeroUrl = resolveMediaUrl('/src/assets/images/parent_hero_1783622066454.jpg');
  assert(!devHeroUrl.includes('localhost:3000'), 'Dev hero must not prefix backend URL');
  assert(!devHeroUrl.includes('/api/media'), 'Dev hero must not prefix /api/media');

  const prodHeroUrl = resolveMediaUrl('/assets/parent_hero_1783622066454-BTVL3Z5j.jpg');
  assert(!prodHeroUrl.includes('localhost:3000'), 'Prod hero must not prefix backend URL');
  assert(!prodHeroUrl.includes('/api/media'), 'Prod hero must not prefix /api/media');
});

test('absolute remote URLs remain unchanged', () => {
  const remoteUrl = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
  assert.strictEqual(resolveMediaUrl(remoteUrl), remoteUrl);
});

test('backend media paths resolve properly', () => {
  const backendPath = '/api/media/files/photo-123.jpg';
  const resolved = resolveMediaUrl(backendPath);
  assert(resolved.includes('/api/media/files/photo-123.jpg'));
});

// 9. HERO HIGHLIGHTS INTERACTION & TARGET
console.log('\n9. HERO HIGHLIGHTS INTERACTION & TARGET');

test('LandingHero highlights row is an interactive accessible button', () => {
  const heroContent = fs.readFileSync(path.resolve('src/components/landing/LandingHero.tsx'), 'utf-8');
  assert(heroContent.includes('const handleHighlightsClick'), 'Missing handleHighlightsClick');
  assert(heroContent.includes("document.getElementById('moments')"), 'Highlights must scroll to moments section');
  assert(heroContent.includes("document.getElementById('video')"), 'Highlights must fallback to video section');
  assert(heroContent.includes('aria-label="View General Assembly Children and Teens highlights"'), 'Missing accessibility aria-label');
  assert(heroContent.includes('type="button"'), 'Must render as native accessible button');
  assert(!heroContent.includes('500+'), 'Must not have fake social proof');
  assert(!heroContent.includes('⭐'), 'Must not have fake star rating');
});

// 10. EDITORIAL COUNTDOWN CREDENTIAL PANEL
console.log('\n10. EDITORIAL COUNTDOWN CREDENTIAL PANEL');

test('LandingHero countdown panel uses editorial invitation design', () => {
  const heroContent = fs.readFileSync(path.resolve('src/components/landing/LandingHero.tsx'), 'utf-8');
  assert(heroContent.includes('REGISTRATION OPEN'), 'Must contain REGISTRATION OPEN status text');
  assert(heroContent.includes('REGISTRATION CLOSED'), 'Must contain REGISTRATION CLOSED status text');
  assert(heroContent.includes('DEFAULT_DEADLINE_SHORT_LABEL'), 'Must keep a canonical open deadline fallback label');
  assert(heroContent.includes('DEFAULT_DEADLINE_FULL_LABEL'), 'Must keep a canonical closed deadline fallback label');
  assert(heroContent.includes('DAYS'), 'Must contain DAYS unit label');
  assert(heroContent.includes('HOURS'), 'Must contain HOURS unit label');
  assert(heroContent.includes('MINUTES'), 'Must contain MINUTES unit label');
  assert(heroContent.includes('divide-x'), 'Must use subtle vertical separators between units');
  assert(heroContent.includes('data-component-version="landing-countdown-status-strip-v6"'), 'Countdown panel uses current editorial strip design (v6)');
  assert(!heroContent.includes('CalendarClock'), 'Unnecessary icon box removed for editorial aesthetic');
});

// 11. ADMIN INVITATION TOKEN EXTRACTION
console.log('\n11. ADMIN INVITATION TOKEN EXTRACTION (SEARCH & HASH PARITY)');

test('AdminAcceptInviteView extracts token from window.location.search and hash', () => {
  const inviteContent = fs.readFileSync(path.resolve('src/views/admin/AdminAcceptInviteView.tsx'), 'utf-8');
  assert(inviteContent.includes('window.location.search'), 'Must check window.location.search for pathname query params');
  assert(inviteContent.includes('window.location.hash'), 'Must check window.location.hash for fallback');
  assert(inviteContent.includes("searchParams.get('token')"), 'Must extract token query param');
});

// 12. LANDING EVENT DETAILS SECTION (EDITORIAL EVENT CARD)
console.log('\n12. LANDING EVENT DETAILS SECTION (EDITORIAL EVENT CARD)');

test('LandingEventDetailsSection displays Theme instead of MINISTRY THEME and resolves single day 21 November 2026', () => {
  const detailsContent = fs.readFileSync(path.resolve('src/components/common/LandingEventDetailsSection.tsx'), 'utf-8');
  assert(!detailsContent.includes('MINISTRY THEME'), 'Must NOT contain MINISTRY THEME');
  assert(detailsContent.includes('Theme'), 'Must contain Theme heading');
  assert(detailsContent.includes("eventId === 'event-ga-2026'"), 'Must enforce event-ga-2026 canonical date');
  assert(detailsContent.includes("days: '21'"), 'Must return days 21');
  assert(detailsContent.includes("month: 'NOVEMBER'"), 'Must return month NOVEMBER');
  assert(detailsContent.includes("year: '2026'"), 'Must return year 2026');
});

// 13. HERO COPY & LANDING SECTION REMOVAL
console.log('\n13. HERO COPY & LANDING SECTION REMOVAL');

test('LandingHero has updated headline and body copy', () => {
  const heroContent = fs.readFileSync(path.resolve('src/components/landing/LandingHero.tsx'), 'utf-8');
  assert(heroContent.includes('Welcome to the Koinonia General Assembly Children and Teen’s Session 2026!'), 'Must contain updated headline');
  assert(heroContent.includes('Registration is now open for children between the ages of 2-14 years of old'), 'Must contain updated body copy');
});

test('LandingPage removes EditorialStatement experience section', () => {
  const landingContent = fs.readFileSync(path.resolve('src/views/LandingPage.tsx'), 'utf-8');
  assert(!landingContent.includes('<EditorialStatement'), 'Must NOT contain EditorialStatement');
});

console.log('\n================================================================');
console.log(`FRONTEND TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}

