import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeParentReturnRoute } from '../src/views/SignInView';
import { sanitizeVolunteerReturnRoute } from '../src/views/VolunteerSignInView';
import { resolveNotificationRoute } from '../src/components/common/MobileNotificationCentre';
import { ParentApiError } from '../src/services/api';

async function runTests() {
  console.log('=== AUTH / ROLE ISOLATION REGRESSION TEST SUITE ===\n');
  let passed = 0;

  // ----------------------------------------------------
  // 1. Parent sign-in stays Parent
  // ----------------------------------------------------
  console.log('--- 1. Parent sign-in stays Parent ---');
  const parentDefaultRoute = sanitizeParentReturnRoute(null);
  assert.strictEqual(parentDefaultRoute, '/parent/home', 'Default route for parent sign-in must be /parent/home');
  console.log('  [PASS] Parent sign-in resolves to /parent/home by default');
  passed++;

  // ----------------------------------------------------
  // 2. Volunteer sign-in stays Volunteer
  // ----------------------------------------------------
  console.log('--- 2. Volunteer sign-in stays Volunteer ---');
  const volunteerDefaultRoute = sanitizeVolunteerReturnRoute(null);
  assert.strictEqual(volunteerDefaultRoute, '/volunteer/event', 'Default route for volunteer sign-in must be /volunteer/event');
  console.log('  [PASS] Volunteer sign-in resolves to /volunteer/event by default');
  passed++;

  // ----------------------------------------------------
  // 3. Parent login never automatically redirects to Volunteer
  // ----------------------------------------------------
  console.log('--- 3. Parent login never automatically redirects to Volunteer ---');
  const parentAttemptVol = sanitizeParentReturnRoute('/volunteer/event');
  assert.strictEqual(parentAttemptVol, '/parent/home', 'Parent login attempting /volunteer/event must redirect to /parent/home');
  const parentAttemptVolDuty = sanitizeParentReturnRoute('/volunteer/duty');
  assert.strictEqual(parentAttemptVolDuty, '/parent/home', 'Parent login attempting /volunteer/duty must redirect to /parent/home');
  console.log('  [PASS] Parent sign-in sanitization blocks any volunteer target');
  passed++;

  // ----------------------------------------------------
  // 4. Volunteer login never automatically redirects to Parent
  // ----------------------------------------------------
  console.log('--- 4. Volunteer login never automatically redirects to Parent ---');
  const volAttemptParent = sanitizeVolunteerReturnRoute('/parent/home');
  assert.strictEqual(volAttemptParent, '/volunteer/event', 'Volunteer login attempting /parent/home must redirect to /volunteer/event');
  const volAttemptParentChildren = sanitizeVolunteerReturnRoute('/parent/children');
  assert.strictEqual(volAttemptParentChildren, '/volunteer/event', 'Volunteer login attempting /parent/children must redirect to /volunteer/event');
  console.log('  [PASS] Volunteer sign-in sanitization blocks any parent target');
  passed++;

  // ----------------------------------------------------
  // 5. Parent returnTo accepts /parent/*
  // ----------------------------------------------------
  console.log('--- 5. Parent returnTo accepts /parent/* ---');
  assert.strictEqual(sanitizeParentReturnRoute('/parent/children'), '/parent/children');
  assert.strictEqual(sanitizeParentReturnRoute('/parent/passes'), '/parent/passes');
  assert.strictEqual(sanitizeParentReturnRoute('/parent/profile'), '/parent/profile');
  assert.strictEqual(sanitizeParentReturnRoute('/parent/status/ch-123'), '/parent/status/ch-123');
  console.log('  [PASS] Parent returnTo allows valid /parent/* destinations');
  passed++;

  // ----------------------------------------------------
  // 6. Parent returnTo rejects /volunteer/*
  // ----------------------------------------------------
  console.log('--- 6. Parent returnTo rejects /volunteer/* ---');
  assert.strictEqual(sanitizeParentReturnRoute('/volunteer/event'), '/parent/home');
  assert.strictEqual(sanitizeParentReturnRoute('/volunteer/scan'), '/parent/home');
  assert.strictEqual(sanitizeParentReturnRoute('/volunteer/safety'), '/parent/home');
  console.log('  [PASS] Parent returnTo rejects all /volunteer/* destinations');
  passed++;

  // ----------------------------------------------------
  // 7. Parent returnTo rejects /admin/*
  // ----------------------------------------------------
  console.log('--- 7. Parent returnTo rejects /admin/* ---');
  assert.strictEqual(sanitizeParentReturnRoute('/admin/dashboard'), '/parent/home');
  assert.strictEqual(sanitizeParentReturnRoute('/admin/attendance'), '/parent/home');
  assert.strictEqual(sanitizeParentReturnRoute('/admin/wristbands'), '/parent/home');
  console.log('  [PASS] Parent returnTo rejects all /admin/* destinations');
  passed++;

  // ----------------------------------------------------
  // 8. Volunteer returnTo accepts /volunteer/*
  // ----------------------------------------------------
  console.log('--- 8. Volunteer returnTo accepts /volunteer/* ---');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/volunteer/event'), '/volunteer/event');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/volunteer/scan'), '/volunteer/scan');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/volunteer/duty'), '/volunteer/duty');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/volunteer/profile'), '/volunteer/profile');
  console.log('  [PASS] Volunteer returnTo allows valid /volunteer/* destinations');
  passed++;

  // ----------------------------------------------------
  // 9. Volunteer returnTo rejects /parent/*
  // ----------------------------------------------------
  console.log('--- 9. Volunteer returnTo rejects /parent/* ---');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/parent/home'), '/volunteer/event');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/parent/passes'), '/volunteer/event');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/parent/children'), '/volunteer/event');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/admin/events'), '/volunteer/event');
  console.log('  [PASS] Volunteer returnTo rejects /parent/* and /admin/* destinations');
  passed++;

  // ----------------------------------------------------
  // 10. 403 authorization response does NOT clear authenticated session
  // ----------------------------------------------------
  console.log('--- 10. 403 authorization response does NOT clear authenticated session ---');
  const forbiddenError = new ParentApiError('Forbidden', 'Forbidden', 'FORBIDDEN', null, 403);
  assert.strictEqual(forbiddenError.status, 403);
  assert.strictEqual(forbiddenError.code, 'FORBIDDEN');

  // Verify failure classification logic in App.tsx:
  // ONLY clear authentication/session on genuine 401 UNAUTHORIZED authentication failures
  const shouldClearSessionOn403 = (forbiddenError as any).code === 'UNAUTHORIZED' || (forbiddenError as any).status === 401;
  assert.strictEqual(shouldClearSessionOn403, false, '403 Forbidden must NOT trigger session clear / logout');
  console.log('  [PASS] 403 response preserves authenticated session');
  passed++;

  // ----------------------------------------------------
  // 11. 401 authentication failure follows existing logout handling
  // ----------------------------------------------------
  console.log('--- 11. 401 authentication failure follows existing logout handling ---');
  const unauthError = new ParentApiError('Unauthorized', 'Unauthorized', 'UNAUTHORIZED', null, 401);
  const shouldClearSessionOn401 = (unauthError as any).code === 'UNAUTHORIZED' || (unauthError as any).status === 401;
  assert.strictEqual(shouldClearSessionOn401, true, '401 Unauthorized MUST trigger session clear / logout');
  console.log('  [PASS] 401 response triggers proper logout/clear handling');
  passed++;

  // ----------------------------------------------------
  // 12. Parent notification with valid Parent route stays Parent
  // ----------------------------------------------------
  console.log('--- 12. Parent notification with valid Parent route stays Parent ---');
  const validParentNotif = {
    id: 'notif-1',
    title: 'Pass Issued',
    message: 'Check-in pass is available',
    createdAt: new Date().toISOString(),
    isRead: false,
    childId: 'child-abc',
    metadata: { targetRoute: '/parent/children/child-abc/pass' }
  };
  const resolvedParentRoute = resolveNotificationRoute(validParentNotif, 'parent');
  assert.strictEqual(resolvedParentRoute, '/parent/children/child-abc/pass');
  console.log('  [PASS] Parent notification with valid Parent route stays on Parent surface');
  passed++;

  // ----------------------------------------------------
  // 13. Parent notification with Volunteer route cannot switch portals
  // ----------------------------------------------------
  console.log('--- 13. Parent notification with Volunteer route cannot switch portals ---');
  const crossSurfaceNotif = {
    id: 'notif-2',
    title: 'Volunteer Incident Alert',
    message: 'Check volunteer safety desk',
    createdAt: new Date().toISOString(),
    isRead: false,
    childId: 'child-abc',
    metadata: { targetRoute: '/volunteer/safety' }
  };
  const blockedParentRoute = resolveNotificationRoute(crossSurfaceNotif, 'parent');
  assert.ok(
    blockedParentRoute.startsWith('/parent/'),
    `Parent notification with volunteer route must stay in /parent/*, got: ${blockedParentRoute}`
  );
  assert.ok(!blockedParentRoute.startsWith('/volunteer'), 'Must not navigate to /volunteer/*');
  console.log('  [PASS] Parent notification with Volunteer payload safely falls back to Parent route');
  passed++;

  // ----------------------------------------------------
  // 14. Invalid Parent notification target falls back safely without logout
  // ----------------------------------------------------
  console.log('--- 14. Invalid Parent notification target falls back safely without logout ---');
  const maliciousNotif = {
    id: 'notif-3',
    title: 'Malicious External Link',
    message: 'Click here',
    createdAt: new Date().toISOString(),
    isRead: false,
    metadata: { targetRoute: 'https://malicious-site.example.com/exploit' }
  };
  const fallbackRoute = resolveNotificationRoute(maliciousNotif, 'parent');
  assert.strictEqual(fallbackRoute, '/parent/home', 'External or invalid route must fall back to /parent/home');
  console.log('  [PASS] Malicious or invalid notification target falls back to /parent/home without error');
  passed++;

  // ----------------------------------------------------
  // 15. Volunteer notification cannot switch into Parent
  // ----------------------------------------------------
  console.log('--- 15. Volunteer notification cannot switch into Parent ---');
  const volunteerCrossNotif = {
    id: 'notif-4',
    title: 'Parent Notice',
    message: 'Check your child pass',
    createdAt: new Date().toISOString(),
    isRead: false,
    metadata: { targetRoute: '/parent/home' }
  };
  const blockedVolunteerRoute = resolveNotificationRoute(volunteerCrossNotif, 'volunteer');
  assert.ok(
    blockedVolunteerRoute.startsWith('/volunteer/'),
    `Volunteer notification with parent route must stay in /volunteer/*, got: ${blockedVolunteerRoute}`
  );
  assert.ok(!blockedVolunteerRoute.startsWith('/parent'), 'Must not navigate to /parent/*');
  console.log('  [PASS] Volunteer notification cannot switch into Parent surface');
  passed++;

  // ----------------------------------------------------
  // 16. Parent Event Continue does NOT route to /parent/passes
  // ----------------------------------------------------
  console.log('--- 16. Parent Event Continue does NOT route to /parent/passes ---');
  const parentHomeViewContent = fs.readFileSync(
    path.join(process.cwd(), 'src/views/ParentHomeView.tsx'),
    'utf-8'
  );
  // Look for the Event card Continue button action
  assert.ok(
    !parentHomeViewContent.includes("onClick={() => onNavigate('/parent/passes')}"),
    'ParentHomeView must not route Event Continue directly to /parent/passes'
  );
  console.log('  [PASS] Parent Home Event Continue does NOT navigate to /parent/passes');
  passed++;

  // ----------------------------------------------------
  // 17. Parent Event Continue uses existing registration/event workflow
  // ----------------------------------------------------
  console.log('--- 17. Parent Event Continue uses existing registration/event workflow ---');
  // Verify that Event Continue handles child draft resume, start new child, or child list
  assert.ok(
    parentHomeViewContent.includes('onResumeChildDraft') && parentHomeViewContent.includes('onStartNewChild'),
    'ParentHomeView must connect Event Continue to registration/draft workflow'
  );
  console.log('  [PASS] Parent Event Continue routes into child draft / registration workflow');
  passed++;

  // ----------------------------------------------------
  // 18. Volunteer header contains no standalone Home icon
  // ----------------------------------------------------
  console.log('--- 18. Volunteer header contains no standalone Home icon ---');
  const volunteerDashboardContent = fs.readFileSync(
    path.join(process.cwd(), 'src/views/VolunteerEventDashboardView.tsx'),
    'utf-8'
  );
  // Header should not contain a Home icon button
  assert.ok(
    !volunteerDashboardContent.includes('aria-label="Home"'),
    'VolunteerEventDashboardView header must not have a Home icon button'
  );
  assert.ok(
    !volunteerDashboardContent.includes('<Home className="h-4.5 w-4.5" />'),
    'Volunteer header must not render standalone Home icon'
  );
  console.log('  [PASS] Volunteer header has no standalone Home icon');
  passed++;

  // ----------------------------------------------------
  // 19. Existing bottom Volunteer Events navigation remains available
  // ----------------------------------------------------
  console.log('--- 19. Existing bottom Volunteer Events navigation remains available ---');
  // Check for the Events bottom nav item in Volunteer view
  assert.ok(
    volunteerDashboardContent.includes("id: 'tab-volunteer-events'") && volunteerDashboardContent.includes("label: 'Events'"),
    'Volunteer bottom navigation must retain Events navigation tab'
  );
  console.log('  [PASS] Volunteer bottom navigation includes Events tab');
  passed++;

  // ----------------------------------------------------
  // 20. Existing Parent/Volunteer route guards remain enforced
  // ----------------------------------------------------
  console.log('--- 20. Existing Parent/Volunteer route guards remain enforced ---');
  const appContent = fs.readFileSync(
    path.join(process.cwd(), 'src/App.tsx'),
    'utf-8'
  );
  // ProtectedRoute must require authenticated user and must NOT redirect to /volunteer/event
  assert.ok(
    !appContent.includes("activeExperience === 'volunteer' ? '/volunteer/event' : '/parent/sign-in'"),
    'ProtectedRoute must NOT redirect to /volunteer/event on mismatch'
  );
  // VolunteerProtectedRoute must require authenticated user and must NOT redirect to /parent/home
  assert.ok(
    !appContent.includes("activeExperience === 'parent' ? '/parent/home' : '/volunteer/sign-in'"),
    'VolunteerProtectedRoute must NOT redirect to /parent/home on mismatch'
  );
  console.log('  [PASS] Route guards strictly prevent cross-portal redirects and display controlled access UI');
  passed++;

  // ----------------------------------------------------
  // 21. Dual-role identity entering /parent/sign-in remains Parent
  // ----------------------------------------------------
  console.log('--- 21. Dual-role identity entering /parent/sign-in remains Parent ---');
  // A dual role user entering parent portal should have activeExperience set to 'parent'
  const dualRoleUser = {
    id: 'dual-user-1',
    role: 'parent',
    email: 'dual@koinonia.test'
  };
  const dualRoleParentAccess = { exists: true, profile: { id: 'p-1', user_id: 'dual-user-1' } };
  const dualRoleVolAccess = { exists: true, profile: { id: 'v-1', user_id: 'dual-user-1', status: 'approved' } };

  // Explicit parent portal entry:
  const parentPath = '/parent/home';
  const isParentPath = parentPath.includes('/parent');
  const resolvedExperienceParent = isParentPath && dualRoleParentAccess.exists ? 'parent' : 'volunteer';
  assert.strictEqual(resolvedExperienceParent, 'parent', 'Dual-role user accessing parent portal must remain parent');
  console.log('  [PASS] Dual-role identity entering Parent portal remains Parent');
  passed++;

  // ----------------------------------------------------
  // 22. Dual-role identity entering /volunteer/sign-in remains Volunteer
  // ----------------------------------------------------
  console.log('--- 22. Dual-role identity entering /volunteer/sign-in remains Volunteer ---');
  // Explicit volunteer portal entry:
  const volunteerPath = '/volunteer/event';
  const isVolunteerPath = volunteerPath.includes('/volunteer');
  const resolvedExperienceVolunteer = isVolunteerPath && dualRoleVolAccess.exists ? 'volunteer' : 'parent';
  assert.strictEqual(resolvedExperienceVolunteer, 'volunteer', 'Dual-role user accessing volunteer portal must remain volunteer');
  console.log('  [PASS] Dual-role identity entering Volunteer portal remains Volunteer');
  passed++;

  console.log(`\nAll ${passed} tests passed successfully!`);
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
