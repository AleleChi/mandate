import assert from 'assert';
import fs from 'fs';
import path from 'path';

/**
 * Verification test for Phase 2: Public Footer + Legal & Policy Pages + Official Contact Email
 * 1. Privacy Notice (/privacy)
 * 2. Terms of Service (/terms)
 * 3. Child Safety (/child-safety)
 * 4. Contact Us (/contact)
 * 5. Public Footer (PublicFooter.tsx)
 * 6. Shared Public Policy Layout (PublicPolicyLayout.tsx)
 * 7. Single Source of Truth for Official Public Contact Email
 */

function runTests() {
  console.log('=== Starting Phase 2 Public Legal & Contact Experience Verification ===');

  const srcDir = path.resolve(process.cwd(), 'src');

  // 0. Verify Single Source of Truth Constant
  console.log('\n--- Checking Official Public Contact Constant ---');
  const contactConstantPath = path.join(srcDir, 'constants/contact.ts');
  assert(fs.existsSync(contactConstantPath), 'constants/contact.ts must exist');
  const contactConstantContent = fs.readFileSync(contactConstantPath, 'utf8');
  assert(contactConstantContent.includes('OFFICIAL_PUBLIC_CONTACT_EMAIL'), 'Must export OFFICIAL_PUBLIC_CONTACT_EMAIL');
  assert(contactConstantContent.includes("'koinoniaabuja@gmail.com'"), 'Official email must be koinoniaabuja@gmail.com');
  console.log('✔ Official Public Contact Constant PASS');

  // 1. Verify PublicFooter.tsx
  console.log('\n--- Checking PublicFooter.tsx ---');
  const footerPath = path.join(srcDir, 'components/landing/PublicFooter.tsx');
  assert(fs.existsSync(footerPath), 'PublicFooter.tsx must exist');
  const footerContent = fs.readFileSync(footerPath, 'utf8');

  // Must have dynamic event title & dates
  assert(footerContent.includes('eventTitle'), 'PublicFooter must reference eventTitle');
  assert(footerContent.includes('eventDates'), 'PublicFooter must reference eventDates');
  assert(footerContent.includes('formatEventDates'), 'PublicFooter must format event dates');

  // Must have Participation, Information, Contact columns
  assert(footerContent.includes('Participation'), 'PublicFooter must include Participation column');
  assert(footerContent.includes('Information'), 'PublicFooter must include Information column');
  assert(footerContent.includes('Contact'), 'PublicFooter must include Contact column');

  // Contact column must show official email only (no dynamic unapproved phone/whatsapp/address)
  assert(footerContent.includes('OFFICIAL_PUBLIC_CONTACT_EMAIL'), 'PublicFooter must use OFFICIAL_PUBLIC_CONTACT_EMAIL');
  assert(footerContent.includes('mailto:'), 'PublicFooter must have mailto: link for official email');
  assert(!footerContent.includes('contactPhone'), 'PublicFooter must not expose dynamic contactPhone');
  assert(!footerContent.includes('contactWhatsApp'), 'PublicFooter must not expose dynamic contactWhatsApp');
  assert(!footerContent.includes('contactAddress'), 'PublicFooter must not expose dynamic contactAddress');

  // Must link to all 4 policy pages in bottom row
  assert(footerContent.includes("onNavigate('/privacy')"), 'PublicFooter must navigate to /privacy');
  assert(footerContent.includes("onNavigate('/child-safety')"), 'PublicFooter must navigate to /child-safety');
  assert(footerContent.includes("onNavigate('/terms')"), 'PublicFooter must navigate to /terms');
  assert(footerContent.includes("onNavigate('/contact')"), 'PublicFooter must navigate to /contact');
  console.log('✔ PublicFooter verification PASS');

  // 2. Verify PublicPolicyLayout.tsx
  console.log('\n--- Checking PublicPolicyLayout.tsx ---');
  const layoutPath = path.join(srcDir, 'components/legal/PublicPolicyLayout.tsx');
  assert(fs.existsSync(layoutPath), 'PublicPolicyLayout.tsx must exist');
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');

  // Must have BrandLogo, Back to event, scrollspy, PublicFooter
  assert(layoutContent.includes('BrandLogo'), 'PublicPolicyLayout must include BrandLogo');
  assert(layoutContent.includes('Back to event'), 'PublicPolicyLayout must have Back to event');
  assert(layoutContent.includes('PublicFooter'), 'PublicPolicyLayout must render PublicFooter');
  assert(layoutContent.includes('max-w-[760px]'), 'PublicPolicyLayout must constrain document width to 700-820px');
  console.log('✔ PublicPolicyLayout verification PASS');

  // 3. Verify Privacy Notice
  console.log('\n--- Checking PrivacyPolicyView.tsx ---');
  const privacyPath = path.join(srcDir, 'views/PrivacyPolicyView.tsx');
  assert(fs.existsSync(privacyPath), 'PrivacyPolicyView.tsx must exist');
  const privacyContent = fs.readFileSync(privacyPath, 'utf8');

  // Must use PublicPolicyLayout and official contact email
  assert(privacyContent.includes('PublicPolicyLayout'), 'PrivacyPolicyView must use PublicPolicyLayout');
  assert(privacyContent.includes('OFFICIAL_PUBLIC_CONTACT_EMAIL'), 'PrivacyPolicyView must use OFFICIAL_PUBLIC_CONTACT_EMAIL');

  // Substantive legal provisions preserved
  assert(privacyContent.includes('Nigeria Data Protection Act, 2023') || privacyContent.includes('Nigeria Data Protection Act 2023'), 'Must preserve NDPA 2023 clause');
  assert(privacyContent.includes("Child's Rights Act") || privacyContent.includes("Child&apos;s Rights Act"), "Must preserve Child's Rights Act 2003 clause");
  assert(privacyContent.includes('Nigeria Data Protection Commission (NDPC)'), 'Must preserve NDPC clause');
  assert(privacyContent.includes('Sensitive information'), 'Must preserve sensitive information / health data clause');
  assert(privacyContent.includes('1. WHAT INFORMATION DO WE COLLECT?'), 'Must preserve Section 1');
  assert(privacyContent.includes('2. HOW DO WE PROCESS YOUR INFORMATION?'), 'Must preserve Section 2');
  assert(privacyContent.includes('3. WHEN AND WITH WHOM DO WE SHARE PERSONAL INFORMATION?'), 'Must preserve Section 3');
  assert(privacyContent.includes('4. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?'), 'Must preserve Section 4');
  assert(privacyContent.includes('5. HOW LONG DO WE KEEP YOUR INFORMATION?'), 'Must preserve Section 5');
  assert(privacyContent.includes('6. HOW DO WE KEEP YOUR INFORMATION SAFE?'), 'Must preserve Section 6');
  assert(privacyContent.includes("7. OUR APPROACH TO CHILDREN"), 'Must preserve Section 7');
  assert(privacyContent.includes('8. WHAT ARE YOUR PRIVACY RIGHTS?'), 'Must preserve Section 8');
  assert(privacyContent.includes('9. CONTROLS FOR DO-NOT-TRACK FEATURES'), 'Must preserve Section 9');
  assert(privacyContent.includes('10. DO WE MAKE UPDATES TO THIS NOTICE?'), 'Must preserve Section 10');
  assert(privacyContent.includes('11. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?'), 'Must preserve Section 11');
  console.log('✔ Privacy Notice substantive content & layout PASS');

  // 4. Verify Terms of Service
  console.log('\n--- Checking TermsOfServiceView.tsx ---');
  const termsPath = path.join(srcDir, 'views/TermsOfServiceView.tsx');
  assert(fs.existsSync(termsPath), 'TermsOfServiceView.tsx must exist');
  const termsContent = fs.readFileSync(termsPath, 'utf8');

  // Must use PublicPolicyLayout and official contact email
  assert(termsContent.includes('PublicPolicyLayout'), 'TermsOfServiceView must use PublicPolicyLayout');
  assert(termsContent.includes('OFFICIAL_PUBLIC_CONTACT_EMAIL'), 'TermsOfServiceView must use OFFICIAL_PUBLIC_CONTACT_EMAIL');

  // Substantive Parent Terms clauses preserved
  assert(termsContent.includes('VERIFICATION') && termsContent.includes('PROFILE COMPLIANCE'), 'Must preserve verification clause');
  assert(termsContent.includes('EXCLUSIVE GUARDIAN PICKUP RELEASE'), 'Must preserve exclusive guardian pickup clause');
  assert(termsContent.includes('MEDICAL DECLARATIONS') && termsContent.includes('FIRST AID'), 'Must preserve medical declarations clause');
  assert(termsContent.includes('ARRIVAL SCHEDULES') && termsContent.includes('CONDUCT'), 'Must preserve arrival and conduct clause');
  assert(termsContent.includes('DIGITAL EVENT PASSES') && termsContent.includes('ACCOUNT SECURITY'), 'Must preserve event passes clause');
  assert(termsContent.includes('photo-terminal'), 'Must reference photo-terminal pickup verification');
  assert(termsContent.includes('September 05, 2026'), 'Must use real last-updated date');
  console.log('✔ Terms of Service substantive content & layout PASS');

  // 5. Verify Child Safety
  console.log('\n--- Checking ChildSafetyView.tsx ---');
  const safetyPath = path.join(srcDir, 'views/ChildSafetyView.tsx');
  assert(fs.existsSync(safetyPath), 'ChildSafetyView.tsx must exist');
  const safetyContent = fs.readFileSync(safetyPath, 'utf8');

  // Must use official email only in contact section
  assert(safetyContent.includes('OFFICIAL_PUBLIC_CONTACT_EMAIL'), 'ChildSafetyView must use OFFICIAL_PUBLIC_CONTACT_EMAIL');

  // Approachable child journey structure
  assert(safetyContent.includes('Before the event'), 'Must have Before the event section');
  assert(safetyContent.includes('Arrival and check-in'), 'Must have Arrival and check-in section');
  assert(safetyContent.includes('During the programme'), 'Must have During the programme section');
  assert(safetyContent.includes('Pickup verification'), 'Must have Pickup verification section');
  assert(safetyContent.includes('If something needs attention'), 'Must have If something needs attention section');
  assert(safetyContent.includes('Questions or concerns'), 'Must have Questions or concerns section');

  // Verified practices (supervision ratios, background checks, QR scans, photo match)
  assert(safetyContent.includes('1 supervisor per 4 children'), 'Must specify Under-3s 1:4 ratio');
  assert(safetyContent.includes('1 supervisor per 8 children'), 'Must specify Ages 4-9 1:8 ratio');
  assert(safetyContent.includes('photo-terminal') || safetyContent.includes('photo'), 'Must specify photo verification');
  assert(safetyContent.includes('PublicFooter'), 'Must use shared PublicFooter');
  console.log('✔ Child Safety content & journey structure PASS');

  // 6. Verify Contact Us (Official Email Only)
  console.log('\n--- Checking ContactView.tsx ---');
  const contactPath = path.join(srcDir, 'views/ContactView.tsx');
  assert(fs.existsSync(contactPath), 'ContactView.tsx must exist');
  const contactContent = fs.readFileSync(contactPath, 'utf8');

  // Shows official Terms email and clickable mailto link
  assert(contactContent.includes('OFFICIAL_PUBLIC_CONTACT_EMAIL'), 'ContactView must use OFFICIAL_PUBLIC_CONTACT_EMAIL');
  assert(contactContent.includes('mailto:'), 'ContactView must have mailto: link');

  // PROVE Contact page does NOT show phone, WhatsApp, address, or help desk
  assert(!contactContent.includes('tel:'), 'ContactView must NOT show phone (tel:)');
  assert(!contactContent.includes('wa.me/'), 'ContactView must NOT show WhatsApp (wa.me/)');
  assert(!contactContent.includes('Physical Address'), 'ContactView must NOT show physical address');
  assert(!contactContent.includes('On-site Help Desk'), 'ContactView must NOT show on-site help desk');
  assert(!contactContent.includes('Protocol Desk'), 'ContactView must NOT show protocol desk');

  // Must use shared PublicFooter
  assert(contactContent.includes('PublicFooter'), 'ContactView must use shared PublicFooter');
  console.log('✔ Contact presentation (Official Email Only) PASS');

  // 7. Verify No Test Data Leakage across public views
  console.log('\n--- Checking No Test Data Leakage ---');
  const publicFiles = [contactContent, footerContent, privacyContent, termsContent, safetyContent];
  for (const content of publicFiles) {
    assert(!content.includes('test-care@'), 'No public file may expose test-care@');
    assert(!content.includes('Koinonia Global Headquarters'), 'No public file may expose Koinonia Global Headquarters');
  }
  console.log('✔ No Test Data Leakage PASS');

  // 8. Verify Routing in App.tsx
  console.log('\n--- Checking App.tsx Routing ---');
  const appPath = path.join(srcDir, 'App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  assert(appContent.includes("cleanRoute === '/privacy'"), 'App.tsx must route /privacy');
  assert(appContent.includes("cleanRoute === '/terms'"), 'App.tsx must route /terms');
  assert(appContent.includes("cleanRoute === '/child-safety'"), 'App.tsx must route /child-safety');
  assert(appContent.includes("cleanRoute === '/contact'"), 'App.tsx must route /contact');

  // Make sure they render dedicated views directly
  assert(appContent.includes('<PrivacyPolicyView onNavigate={navigate} />'), 'App.tsx renders PrivacyPolicyView');
  assert(appContent.includes('<TermsOfServiceView onNavigate={navigate} />'), 'App.tsx renders TermsOfServiceView');
  assert(appContent.includes('<ChildSafetyView onNavigate={navigate} />'), 'App.tsx renders ChildSafetyView');
  assert(appContent.includes('<ContactView onNavigate={navigate} />'), 'App.tsx renders ContactView');

  // SEO metadata checks
  assert(appContent.includes("canonical: 'https://koinonia12.netlify.app/#/privacy'"), 'SEO for /privacy');
  assert(appContent.includes("canonical: 'https://koinonia12.netlify.app/#/terms'"), 'SEO for /terms');
  assert(appContent.includes("canonical: 'https://koinonia12.netlify.app/#/child-safety'"), 'SEO for /child-safety');
  assert(appContent.includes("canonical: 'https://koinonia12.netlify.app/#/contact'"), 'SEO for /contact');
  console.log('✔ App.tsx Routing and SEO PASS');

  // 9. Verify LegalPagesView.tsx delegation
  console.log('\n--- Checking LegalPagesView.tsx delegation ---');
  const legalPagesPath = path.join(srcDir, 'views/LegalPagesView.tsx');
  const legalPagesContent = fs.readFileSync(legalPagesPath, 'utf8');
  assert(legalPagesContent.includes('TermsOfServiceView'), 'LegalPagesView delegates terms');
  assert(legalPagesContent.includes('ChildSafetyView'), 'LegalPagesView delegates child-safety');
  assert(legalPagesContent.includes('ContactView'), 'LegalPagesView delegates contact');
  console.log('✔ LegalPagesView backward compatibility PASS');

  console.log('\n======================================================');
  console.log('ALL PUBLIC EXPERIENCE OFFICIAL CONTACT CHECKS PASSED!');
  console.log('======================================================\n');
}

runTests();
