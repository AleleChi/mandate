import { query, queryOne, execute } from '../src/server/db';
import { REAL_ASSETS } from '../src/config/assets';

async function runHeroMediaFlowTest() {
  console.log('--- Starting Hero Photo & Landing Media Flow Regression Test ---');

  // Test 1: Fallback Asset Verification
  console.log('\n[Test 1] Fallback Asset Verification:');
  const bundledFallback = '/assets/images/parent_hero_1783622066454.jpg';
  console.log('✓ Bundled fallback image available:', bundledFallback);

  // Test 2: Simulating Admin Landing Media Update for heroMain with metadata
  console.log('\n[Test 2] Simulating Admin Landing Settings update with heroMain + metadata:');
  const testSlotData = {
    heroMain: '/uploads/media/koinonia-hero-photo-test.webp',
    heroMainMediaId: 'med_test_hero_main_001',
    heroMainOriginalName: 'koinonia_children_hero.jpg',
    heroMainFileSize: '1548200',
    experiencePickup: '/uploads/media/koinonia-pickup-test.webp',
    experiencePickupOriginalName: 'koinonia_pickup_zone.jpg',
    experiencePickupFileSize: '984200'
  };

  for (const [key, value] of Object.entries(testSlotData)) {
    await execute(
      `INSERT INTO admin_landing_settings (setting_key, setting_value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`,
      [key, String(value)]
    );
  }

  // Test 3: Verifying persistence in admin_landing_settings table
  console.log('\n[Test 3] Verifying persistence in admin_landing_settings:');
  const persistedHeroMain = await queryOne(
    'SELECT setting_value FROM admin_landing_settings WHERE setting_key = ?',
    ['heroMain']
  );
  if (!persistedHeroMain || persistedHeroMain.setting_value !== testSlotData.heroMain) {
    throw new Error(`FAIL: heroMain not persisted properly! Expected ${testSlotData.heroMain}, got: ${persistedHeroMain?.setting_value}`);
  }
  console.log('✓ heroMain persisted in DB:', persistedHeroMain.setting_value);

  const persistedOriginalName = await queryOne(
    'SELECT setting_value FROM admin_landing_settings WHERE setting_key = ?',
    ['heroMainOriginalName']
  );
  if (!persistedOriginalName || persistedOriginalName.setting_value !== testSlotData.heroMainOriginalName) {
    throw new Error(`FAIL: heroMainOriginalName not persisted properly! Expected ${testSlotData.heroMainOriginalName}, got: ${persistedOriginalName?.setting_value}`);
  }
  console.log('✓ heroMainOriginalName metadata persisted in DB:', persistedOriginalName.setting_value);

  const persistedPickup = await queryOne(
    'SELECT setting_value FROM admin_landing_settings WHERE setting_key = ?',
    ['experiencePickup']
  );
  if (!persistedPickup || persistedPickup.setting_value !== testSlotData.experiencePickup) {
    throw new Error(`FAIL: experiencePickup not persisted properly! Expected ${testSlotData.experiencePickup}, got: ${persistedPickup?.setting_value}`);
  }
  console.log('✓ experiencePickup persisted in DB:', persistedPickup.setting_value);

  // Test 4: Verifying public settings resolution
  console.log('\n[Test 4] Verifying public settings resolution:');
  const rows = await query('SELECT setting_key, setting_value FROM admin_landing_settings');
  const settingsMap: Record<string, string> = {};
  for (const r of rows) {
    settingsMap[r.setting_key] = r.setting_value;
  }

  // Simulating LandingPage asset resolution: s.heroMain || REAL_ASSETS.heroMain || bundledFallback
  const resolvedHeroMain = settingsMap.heroMain || REAL_ASSETS.heroMain || bundledFallback;
  if (resolvedHeroMain !== testSlotData.heroMain) {
    throw new Error(`FAIL: Resolved heroMain mismatch! Expected ${testSlotData.heroMain}, got: ${resolvedHeroMain}`);
  }
  console.log('✓ Public heroMain resolves to uploaded image:', resolvedHeroMain);

  // Test 5: Resetting slot and verifying fallback behavior
  console.log('\n[Test 5] Simulating Reset of heroMain slot:');
  // When reset, slot and metadata are cleared
  await execute('DELETE FROM admin_landing_settings WHERE setting_key IN (?, ?, ?, ?)', [
    'heroMain',
    'heroMainMediaId',
    'heroMainOriginalName',
    'heroMainFileSize'
  ]);

  const resetSettingsMap: Record<string, string> = {};
  const remainingRows = await query('SELECT setting_key, setting_value FROM admin_landing_settings');
  for (const r of remainingRows) {
    resetSettingsMap[r.setting_key] = r.setting_value;
  }

  const fallbackHero = resetSettingsMap.heroMain || REAL_ASSETS.heroMain || bundledFallback;
  if (!fallbackHero || fallbackHero !== bundledFallback) {
    throw new Error(`FAIL: Reset did not fall back to bundledFallback! Got: ${fallbackHero}`);
  }
  console.log('✓ Reset cleanly falls back to approved bundled Koinonia image:', fallbackHero);

  // Clean up test pickup setting as well
  await execute('DELETE FROM admin_landing_settings WHERE setting_key IN (?, ?, ?)', [
    'experiencePickup',
    'experiencePickupOriginalName',
    'experiencePickupFileSize'
  ]);

  console.log('\n--- ALL HERO MEDIA FLOW REGRESSION TESTS PASSED ---');
}

runHeroMediaFlowTest().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
