import assert from 'assert';
import fs from 'fs';
import path from 'path';

function runTypographyAndHeroPassTests() {
  console.log('=== Verifying Experience Typography & Hero Pass Polish ===');

  const srcDir = path.resolve(process.cwd(), 'src');

  // 1. Verify EditorialStatement.tsx Typography & Spacing
  console.log('\n--- 1. Checking EditorialStatement.tsx Typography & Connection ---');
  const editorialPath = path.join(srcDir, 'components/landing/EditorialStatement.tsx');
  assert(fs.existsSync(editorialPath), 'EditorialStatement.tsx must exist');
  const editorialContent = fs.readFileSync(editorialPath, 'utf8');

  // Strong Plus Jakarta Sans headline
  assert(editorialContent.includes('font-sans font-extrabold'), 'Headline must use bold Plus Jakarta Sans');
  assert(editorialContent.includes('tracking-[-0.04em]'), 'Headline must have tighter letter-spacing');
  assert(editorialContent.includes('leading-[1.04] sm:leading-[1.01] lg:leading-[0.98]'), 'Headline must have tight line-height');
  assert(editorialContent.includes('max-w-[980px]'), 'Headline must have intentional max-width');

  // Restrained label
  assert(editorialContent.includes('text-xs sm:text-[13px] font-bold tracking-[0.14em] text-[#9A7326] uppercase font-sans'), 'Label must be restrained plain text in Koinonia gold');

  // Compact vertical connection (paragraph to visual stage)
  assert(editorialContent.includes('mt-10 sm:mt-12 rounded-3xl'), 'Spacing between paragraph and visual stage must be compact (40-56px)');
  assert(editorialContent.includes('max-w-[720px]'), 'Supporting copy must have focused max-width');
  console.log('✔ Experience Typography & Visual Connection PASS');

  // 2. Verify LandingHero.tsx HeroPassPreview
  console.log('\n--- 2. Checking LandingHero.tsx HeroPassPreview ---');
  const heroPath = path.join(srcDir, 'components/landing/LandingHero.tsx');
  assert(fs.existsSync(heroPath), 'LandingHero.tsx must exist');
  const heroContent = fs.readFileSync(heroPath, 'utf8');

  // All fake personal data removed
  assert(!heroContent.includes('Mary Omikunle'), 'Must remove Mary Omikunle');
  assert(!heroContent.includes('7 years'), 'Must remove 7 years');
  assert(!heroContent.includes('Ages 7 to 9'), 'Must remove Ages 7 to 9');
  assert(!heroContent.includes('Sarah Omikunle'), 'Must remove Sarah Omikunle');

  // Abstract event-pass content
  assert(heroContent.includes('KOINONIA CHILDREN &amp; TEENS'), 'Must include brand header');
  assert(heroContent.includes('EVENT PASS'), 'Must include large EVENT PASS');
  assert(heroContent.includes('The General Assembly'), 'Must include event title');
  assert(heroContent.includes('Digital verification'), 'Must include digital verification note');
  assert(heroContent.includes('Ready for entry'), 'Must include ready for entry state');

  // Physical 3D depth & layered card edges
  assert(heroContent.includes("perspective: '1200px'"), 'Must have 3D perspective wrapper');
  assert(heroContent.includes('-rotate-1.5 translate-x-2.5 translate-y-2.5'), 'Must have offset back card plane for physical thickness');
  assert(heroContent.includes('rounded-[22px]'), 'Must use refined 20-28px physical-pass radius');
  assert(heroContent.includes('bg-[#C59B27]/15 blur-2xl rounded-3xl'), 'Must have ambient soft shadow plane');

  // Pointer parallax and idle floating motion
  assert(heroContent.includes('rotateX('), 'Must have rotateX 3D tilt');
  assert(heroContent.includes('rotateY('), 'Must have rotateY 3D tilt');
  assert(heroContent.includes('y: [0, -6, 0]'), 'Must have subtle idle floating motion');
  assert(heroContent.includes('prefersReducedMotion'), 'Must respect prefersReducedMotion');

  // QR feature
  assert(heroContent.includes('w-28 h-28 sm:w-32 sm:h-32 rounded-xl bg-white border border-[#E5D5AE]/90'), 'QR visual must be prominent and central');

  // Hero structure & live event logic preserved
  assert(heroContent.includes('onParentRegisterClick'), 'Hero CTA must be preserved');
  assert(heroContent.includes('onVolunteerRegisterClick'), 'Volunteer CTA must be preserved');
  assert(heroContent.includes('currentEvent'), 'Live currentEvent logic must be preserved');
  console.log('✔ HeroPassPreview 3D Physical Polish PASS');

  console.log('\n=== ALL TYPOGRAPHY AND HERO PASS TESTS PASSED! ===');
}

runTypographyAndHeroPassTests();
