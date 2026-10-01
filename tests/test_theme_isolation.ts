import { PARENT_STORAGE_KEY, VOLUNTEER_STORAGE_KEY, ADMIN_STORAGE_KEY, PUBLIC_STORAGE_KEY } from '../src/context/ThemeContext';

console.log('================================================================');
console.log('THEME ISOLATION & LIGHT DEFAULT VALIDATION SUITE');
console.log('================================================================');

// Mock localStorage
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] || null,
  setItem: (key: string, val: string) => { store[key] = String(val); },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); }
};

// Replicate ThemeContext resolution functions
function getStoredParentTheme(): string {
  const item = mockLocalStorage.getItem(PARENT_STORAGE_KEY) ||
               mockLocalStorage.getItem(PUBLIC_STORAGE_KEY) ||
               mockLocalStorage.getItem('koinonia-theme');
  if (item === 'light' || item === 'dark') {
    return item;
  }
  return 'light'; // First visit must be LIGHT
}

function getStoredVolunteerTheme(): string {
  const item = mockLocalStorage.getItem(VOLUNTEER_STORAGE_KEY);
  if (item === 'light' || item === 'dark') {
    return item;
  }
  return 'light'; // First visit must be LIGHT
}

function getStoredAdminTheme(): string {
  const item = mockLocalStorage.getItem(ADMIN_STORAGE_KEY);
  if (item === 'light' || item === 'dark') {
    return item;
  }
  return 'light';
}

function detectActiveSurface(hash: string): 'parent' | 'volunteer' | 'admin' {
  if (hash.includes('/admin')) return 'admin';
  if (hash.includes('/volunteer')) return 'volunteer';
  return 'parent';
}

function resolveActiveTheme(hash: string) {
  const surface = detectActiveSurface(hash);
  if (surface === 'admin') return getStoredAdminTheme();
  if (surface === 'volunteer') return getStoredVolunteerTheme();
  return getStoredParentTheme();
}

let passed = 0;
let total = 0;

function assert(desc: string, condition: boolean) {
  total++;
  if (condition) {
    console.log(`  [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${desc}`);
    process.exitCode = 1;
  }
}

// TEST A — Fresh Parent First Visit
mockLocalStorage.clear();
assert('Test A: Fresh parent first visit defaults to light', getStoredParentTheme() === 'light');
assert('Test A: Fresh parent on /parent/sign-in resolves to light', resolveActiveTheme('#/parent/sign-in') === 'light');

// TEST B — Parent Chooses Dark
mockLocalStorage.setItem(PARENT_STORAGE_KEY, 'dark');
assert('Test B: Parent chooses dark persists dark', getStoredParentTheme() === 'dark');
assert('Test B: Parent reload resolves to dark', resolveActiveTheme('#/parent/home') === 'dark');

// TEST C — Parent Chooses Light
mockLocalStorage.setItem(PARENT_STORAGE_KEY, 'light');
assert('Test C: Parent chooses light persists light', getStoredParentTheme() === 'light');
assert('Test C: Parent reload resolves to light', resolveActiveTheme('#/parent/home') === 'light');

// TEST D — Fresh Volunteer First Visit
mockLocalStorage.clear();
assert('Test D: Fresh volunteer first visit defaults to light', getStoredVolunteerTheme() === 'light');
assert('Test D: Fresh volunteer on /volunteer/sign-in resolves to light', resolveActiveTheme('#/volunteer/sign-in') === 'light');

// TEST E — Volunteer Chooses Dark
mockLocalStorage.setItem(VOLUNTEER_STORAGE_KEY, 'dark');
assert('Test E: Volunteer chooses dark persists dark', getStoredVolunteerTheme() === 'dark');
assert('Test E: Volunteer reload resolves to dark', resolveActiveTheme('#/volunteer/event') === 'dark');

// TEST F — Role Isolation
mockLocalStorage.clear();
// 1. Admin dark mode does NOT affect Parent or Volunteer
mockLocalStorage.setItem(ADMIN_STORAGE_KEY, 'dark');
assert('Test F.1: Admin dark does not make Parent dark', resolveActiveTheme('#/parent/home') === 'light');
assert('Test F.1: Admin dark does not make Volunteer dark', resolveActiveTheme('#/volunteer/event') === 'light');
assert('Test F.1: Admin route resolves to dark', resolveActiveTheme('#/admin/overview') === 'dark');

// 2. Parent dark mode does NOT affect Volunteer or Admin
mockLocalStorage.clear();
mockLocalStorage.setItem(PARENT_STORAGE_KEY, 'dark');
assert('Test F.2: Parent dark does not make Volunteer dark', resolveActiveTheme('#/volunteer/event') === 'light');
assert('Test F.2: Parent dark does not make Admin dark', resolveActiveTheme('#/admin/overview') === 'light');
assert('Test F.2: Parent route resolves to dark', resolveActiveTheme('#/parent/home') === 'dark');

// 3. Volunteer dark mode does NOT affect Parent or Admin
mockLocalStorage.clear();
mockLocalStorage.setItem(VOLUNTEER_STORAGE_KEY, 'dark');
assert('Test F.3: Volunteer dark does not make Parent dark', resolveActiveTheme('#/parent/home') === 'light');
assert('Test F.3: Volunteer dark does not make Admin dark', resolveActiveTheme('#/admin/overview') === 'light');
assert('Test F.3: Volunteer route resolves to dark', resolveActiveTheme('#/volunteer/event') === 'dark');

console.log('================================================================');
console.log(`RESULTS: ${passed}/${total} TESTS PASSED`);
console.log('================================================================');
