/**
 * Regression test for Admin Theme Isolation & Public Theme Decoupling.
 * Verifies that:
 * 1. Public theme and Admin theme use separate storage keys.
 * 2. Admin defaults to light mode ('light') when no preference is stored.
 * 3. Toggling Admin theme does NOT affect Public theme.
 * 4. Toggling Public theme does NOT affect Admin theme.
 * 5. Surface detection correctly identifies admin vs public routes.
 * 6. Scenario A: Public light, Admin dark.
 * 7. Scenario B: Public dark, Admin light.
 * 8. Scenario C: Delete admin preference only -> Admin defaults to light, public unchanged.
 * 9. Scenario D: OS/browser prefers dark, explicit Admin light -> Admin stays light.
 * 10. Scenario E: OS/browser prefers light, explicit Admin dark -> Admin stays dark.
 */

// Simulated storage and DOM environment
class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const mockStorage = new MemoryStorage();

// Storage keys under test
const PUBLIC_STORAGE_KEY = 'koinonia-public-theme';
const ADMIN_STORAGE_KEY = 'koinonia-admin-theme';
const LEGACY_STORAGE_KEY = 'koinonia-theme';

// Logic under test mirrored from ThemeContext / index.html
function getInitialThemeForSurface(
  surface: 'public' | 'admin',
  storage: MemoryStorage,
  osPrefersDark: boolean = false
): 'light' | 'dark' {
  if (surface === 'admin') {
    const saved = storage.getItem(ADMIN_STORAGE_KEY);
    // Explicit admin preference overrides everything (including OS preference)
    if (saved === 'dark' || saved === 'light') return saved;
    // Admin defaults strictly to light regardless of OS preference
    return 'light';
  }

  // Public surface
  const savedPublic = storage.getItem(PUBLIC_STORAGE_KEY);
  if (savedPublic === 'dark' || savedPublic === 'light') return savedPublic;
  const savedLegacy = storage.getItem(LEGACY_STORAGE_KEY);
  if (savedLegacy === 'dark' || savedLegacy === 'light') return savedLegacy;
  return osPrefersDark ? 'dark' : 'light';
}

function detectSurface(pathname: string, hash: string): 'public' | 'admin' {
  const isHashAdmin = hash.startsWith('#/admin') || hash.startsWith('#admin');
  const isPathAdmin = pathname.startsWith('/admin');
  return isHashAdmin || isPathAdmin ? 'admin' : 'public';
}

function setSurfaceTheme(
  surface: 'public' | 'admin',
  theme: 'light' | 'dark',
  storage: MemoryStorage
): void {
  if (surface === 'admin') {
    storage.setItem(ADMIN_STORAGE_KEY, theme);
  } else {
    storage.setItem(PUBLIC_STORAGE_KEY, theme);
  }
}

function runTests() {
  console.log('--- Testing Admin Theme Isolation & Localhost Recovery ---');
  let failures = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
    } else {
      console.error(`  [FAIL] ${testName}`);
      failures++;
    }
  }

  // Test 1: Admin defaults to light when storage is clean
  mockStorage.clear();
  const adminInitial = getInitialThemeForSurface('admin', mockStorage);
  assert(adminInitial === 'light', 'Admin defaults strictly to light mode');

  // Test 2: Public defaults to light when storage is clean and OS is light
  const publicInitial = getInitialThemeForSurface('public', mockStorage, false);
  assert(publicInitial === 'light', 'Public defaults to light mode when OS is light');

  // Test 3: Setting Admin to dark does not pollute Public
  setSurfaceTheme('admin', 'dark', mockStorage);
  assert(
    mockStorage.getItem(ADMIN_STORAGE_KEY) === 'dark',
    'Admin storage key is set to dark'
  );
  assert(
    mockStorage.getItem(PUBLIC_STORAGE_KEY) === null,
    'Public storage key is untouched when setting Admin theme'
  );
  assert(
    getInitialThemeForSurface('public', mockStorage, false) === 'light',
    'Public theme remains light when Admin is dark'
  );

  // Test 4: Setting Public to dark does not overwrite Admin
  setSurfaceTheme('admin', 'light', mockStorage);
  setSurfaceTheme('public', 'dark', mockStorage);
  assert(
    mockStorage.getItem(PUBLIC_STORAGE_KEY) === 'dark',
    'Public storage key is set to dark'
  );
  assert(
    mockStorage.getItem(ADMIN_STORAGE_KEY) === 'light',
    'Admin storage key remains light when Public is set to dark'
  );
  assert(
    getInitialThemeForSurface('admin', mockStorage) === 'light',
    'Admin theme remains light when Public is dark'
  );

  // Test 5: Route surface detection
  assert(detectSurface('/admin', '') === 'admin', 'Detects /admin pathname as admin surface');
  assert(detectSurface('/admin/events', '') === 'admin', 'Detects /admin/events pathname as admin surface');
  assert(detectSurface('/', '#/admin') === 'admin', 'Detects #/admin hash as admin surface');
  assert(detectSurface('/', '#/admin/overview') === 'admin', 'Detects #/admin/overview hash as admin surface');
  assert(detectSurface('/', '') === 'public', 'Detects root / as public surface');
  assert(detectSurface('/parent', '') === 'public', 'Detects /parent as public surface (not admin)');
  assert(detectSurface('/volunteer', '') === 'public', 'Detects /volunteer as public surface (not admin)');

  // Test 6: Legacy fallback for public only
  mockStorage.clear();
  mockStorage.setItem(LEGACY_STORAGE_KEY, 'dark');
  assert(
    getInitialThemeForSurface('public', mockStorage, false) === 'dark',
    'Public falls back to legacy koinonia-theme when public key is not set'
  );
  assert(
    getInitialThemeForSurface('admin', mockStorage, false) === 'light',
    'Admin IGNORES legacy koinonia-theme and defaults to light'
  );

  // Scenario A: Public light, Admin dark
  mockStorage.clear();
  setSurfaceTheme('public', 'light', mockStorage);
  setSurfaceTheme('admin', 'dark', mockStorage);
  assert(mockStorage.getItem(PUBLIC_STORAGE_KEY) === 'light', 'Scenario A: koinonia-public-theme = light');
  assert(mockStorage.getItem(ADMIN_STORAGE_KEY) === 'dark', 'Scenario A: koinonia-admin-theme = dark');
  assert(getInitialThemeForSurface('public', mockStorage) === 'light', 'Scenario A: opening public remains light');
  assert(getInitialThemeForSurface('admin', mockStorage) === 'dark', 'Scenario A: opening admin remains dark');

  // Scenario B: Public dark, Admin light
  mockStorage.clear();
  setSurfaceTheme('public', 'dark', mockStorage);
  setSurfaceTheme('admin', 'light', mockStorage);
  assert(mockStorage.getItem(PUBLIC_STORAGE_KEY) === 'dark', 'Scenario B: koinonia-public-theme = dark');
  assert(mockStorage.getItem(ADMIN_STORAGE_KEY) === 'light', 'Scenario B: koinonia-admin-theme = light');
  assert(getInitialThemeForSurface('public', mockStorage) === 'dark', 'Scenario B: opening public remains dark');
  assert(getInitialThemeForSurface('admin', mockStorage) === 'light', 'Scenario B: opening admin remains light');

  // Scenario C: Delete admin preference only
  mockStorage.clear();
  setSurfaceTheme('public', 'dark', mockStorage);
  setSurfaceTheme('admin', 'dark', mockStorage);
  mockStorage.removeItem(ADMIN_STORAGE_KEY);
  assert(getInitialThemeForSurface('admin', mockStorage) === 'light', 'Scenario C: Admin defaults to light when preference deleted');
  assert(mockStorage.getItem(PUBLIC_STORAGE_KEY) === 'dark', 'Scenario C: Public preference unchanged when admin deleted');
  assert(getInitialThemeForSurface('public', mockStorage) === 'dark', 'Scenario C: Public remains dark');

  // Scenario D: OS/browser prefers dark, explicit Admin light
  mockStorage.clear();
  setSurfaceTheme('admin', 'light', mockStorage);
  assert(getInitialThemeForSurface('admin', mockStorage, true) === 'light', 'Scenario D: Admin stays light even when OS prefers dark');

  // Scenario E: OS/browser prefers light, explicit Admin dark
  mockStorage.clear();
  setSurfaceTheme('admin', 'dark', mockStorage);
  assert(getInitialThemeForSurface('admin', mockStorage, false) === 'dark', 'Scenario E: Admin stays dark even when OS prefers light');

  console.log('-----------------------------------------------------------');
  if (failures === 0) {
    console.log('ALL THEME ISOLATION TESTS PASSED!');
    process.exit(0);
  } else {
    console.error(`${failures} test(s) failed.`);
    process.exit(1);
  }
}

runTests();
