import assert from 'assert';
import fs from 'fs';
import path from 'path';

function runExperienceMediaFlowTests() {
  console.log('=== Verifying Children & Teens Experience Media Flow & Refinements ===');

  const srcDir = path.resolve(process.cwd(), 'src');

  // 1. Verify EditorialStatement.tsx
  console.log('\n--- 1. Checking EditorialStatement.tsx ---');
  const editorialPath = path.join(srcDir, 'components/landing/EditorialStatement.tsx');
  assert(fs.existsSync(editorialPath), 'EditorialStatement.tsx must exist');
  const editorialContent = fs.readFileSync(editorialPath, 'utf8');

  // A. Fallback and prop resolution
  assert(editorialContent.includes('export interface EditorialStatementProps'), 'Must export EditorialStatementProps');
  assert(editorialContent.includes('backgroundImage?: string'), 'Must support backgroundImage prop');
  assert(editorialContent.includes('parentHeroImg'), 'Must import parentHeroImg as fallback');
  assert(editorialContent.includes('resolvedPickupImage = backgroundImage && backgroundImage.trim() !== \'\''), 'Must resolve backgroundImage with non-empty check');

  // Visual refinements: No fake lines, no status chip, directional gradient
  assert(!editorialContent.includes('h-1 w-full bg-white/10'), 'Must remove fake progress/input lines in left panel');
  assert(!editorialContent.includes('Ready for entry</span>'), 'Must remove standalone green status chip / pill');
  assert(!editorialContent.includes('Shield className'), 'Must remove shield widget in pickup panel');
  assert(!editorialContent.includes('Authorized departure confirmation'), 'Must remove fake status copy in pickup panel');
  assert(!editorialContent.includes('Children depart only with listed guardians'), 'Must remove bottom microcopy strip');
  assert(editorialContent.includes('bg-gradient-to-b from-[#14120F]/90 via-[#14120F]/30 to-transparent'), 'Must use top-weighted directional gradient on pickup photo');
  assert(editorialContent.includes('object-cover object-center'), 'Must use responsive object-cover object-center for configured images');
  console.log('✔ EditorialStatement.tsx component implementation PASS');

  // 2. Verify assets.ts
  console.log('\n--- 2. Checking config/assets.ts ---');
  const assetsPath = path.join(srcDir, 'config/assets.ts');
  assert(fs.existsSync(assetsPath), 'config/assets.ts must exist');
  const assetsContent = fs.readFileSync(assetsPath, 'utf8');
  assert(assetsContent.includes('experiencePickup:'), 'REAL_ASSETS must define experiencePickup');
  console.log('✔ config/assets.ts defines experiencePickup PASS');

  // 3. Verify AdminLandingView.tsx
  console.log('\n--- 3. Checking AdminLandingView.tsx ---');
  const adminLandingPath = path.join(srcDir, 'views/admin/AdminLandingView.tsx');
  assert(fs.existsSync(adminLandingPath), 'AdminLandingView.tsx must exist');
  const adminLandingContent = fs.readFileSync(adminLandingPath, 'utf8');
  assert(adminLandingContent.includes("key: 'experiencePickup'"), 'MEDIA_SLOTS must contain experiencePickup slot');
  assert(adminLandingContent.includes("label: 'Children & Teens Experience — Pickup image'"), 'Slot must have clear label');
  assert(adminLandingContent.includes("purpose: 'landing_image'"), 'Slot purpose must be landing_image');
  console.log('✔ AdminLandingView.tsx registers experiencePickup slot PASS');

  // 4. Verify LandingPage.tsx
  console.log('\n--- 4. Checking LandingPage.tsx Data Flow ---');
  const landingPagePath = path.join(srcDir, 'views/LandingPage.tsx');
  assert(fs.existsSync(landingPagePath), 'LandingPage.tsx must exist');
  const landingPageContent = fs.readFileSync(landingPagePath, 'utf8');
  assert(landingPageContent.includes('experiencePickup: s.experiencePickup || REAL_ASSETS.experiencePickup'), 'LandingPage must thread experiencePickup from settings');
  assert(landingPageContent.includes('<EditorialStatement backgroundImage={assets.experiencePickup} />'), 'LandingPage must pass backgroundImage prop to EditorialStatement');
  console.log('✔ LandingPage.tsx data flow PASS');

  // 5. Verify Database Architecture
  console.log('\n--- 5. Checking Database Architecture (No migration needed) ---');
  const dbPath = path.join(srcDir, 'server/db.ts');
  const dbContent = fs.readFileSync(dbPath, 'utf8');
  assert(dbContent.includes('CREATE TABLE IF NOT EXISTS admin_landing_settings'), 'admin_landing_settings table must exist');
  assert(dbContent.includes('setting_key TEXT PRIMARY KEY'), 'admin_landing_settings is key-value schema');
  console.log('✔ Database key-value architecture confirmed (No migration needed) PASS');

  // 6. Verify Existing Media Slots Unaffected
  console.log('\n--- 6. Checking Other Media Slots Unaffected ---');
  const requiredSlots = ['site_logo', 'heroMain', 'heroUpper', 'heroRight', 'heroVideo', 'interactiveSample', 'gallerySample', 'pastMomentsVideo'];
  for (const slot of requiredSlots) {
    assert(adminLandingContent.includes(`key: '${slot}'`), `Slot ${slot} must be preserved in MEDIA_SLOTS`);
  }
  console.log('✔ All existing media slots preserved PASS');

  console.log('\n=== ALL EXPERIENCE MEDIA FLOW TESTS PASSED SUCCESSFULLY! ===');
}

runExperienceMediaFlowTests();
