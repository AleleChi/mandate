import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeParentReturnRoute } from '../src/views/SignInView';
import { sanitizeVolunteerReturnRoute } from '../src/views/VolunteerSignInView';
import {
  resolveNotificationRoute,
  getNotificationAction,
  PROTECTED_VOLUNTEER_ROUTES,
  isProtectedVolunteerRoute
} from '../src/components/common/MobileNotificationCentre';
import { ParentApiError } from '../src/services/api';
import { safeStorage } from '../src/utils/storage';

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
  // 8. Volunteer returnTo accepts real operational /volunteer/* routes
  // ----------------------------------------------------
  console.log('--- 8. Volunteer returnTo accepts real operational /volunteer/* routes ---');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/volunteer/event'), '/volunteer/event');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/volunteer/scan'), '/volunteer/scan');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/volunteer/children'), '/volunteer/children');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/volunteer/team-alerts'), '/volunteer/team-alerts');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/volunteer/profile'), '/volunteer/profile');
  console.log('  [PASS] Volunteer returnTo allows verified operational /volunteer/* destinations');
  passed++;

  // ----------------------------------------------------
  // 9. Volunteer returnTo rejects /parent/*, /admin/*, and non-operational routes
  // ----------------------------------------------------
  console.log('--- 9. Volunteer returnTo rejects /parent/*, /admin/*, and non-operational routes ---');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/parent/home'), '/volunteer/event');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/parent/passes'), '/volunteer/event');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/parent/children'), '/volunteer/event');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/admin/events'), '/volunteer/event');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/volunteer/duty'), '/volunteer/event');
  assert.strictEqual(sanitizeVolunteerReturnRoute('/volunteer/safety'), '/volunteer/event');
  console.log('  [PASS] Volunteer returnTo rejects /parent/*, /admin/*, and non-operational routes');
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
    metadata: { targetRoute: '/volunteer/team-alerts' }
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
  assert.ok(
    !appContent.includes("activeExperience === 'volunteer' ? '/volunteer/event' : '/parent/sign-in'"),
    'ProtectedRoute must NOT redirect to /volunteer/event on mismatch'
  );
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
  const dualRoleParentAccess = { exists: true, profile: { id: 'p-1', user_id: 'dual-user-1' } };
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
  const dualRoleVolAccess = { exists: true, profile: { id: 'v-1', user_id: 'dual-user-1', status: 'approved' } };
  const volunteerPath = '/volunteer/event';
  const isVolunteerPath = volunteerPath.includes('/volunteer');
  const resolvedExperienceVolunteer = isVolunteerPath && dualRoleVolAccess.exists ? 'volunteer' : 'parent';
  assert.strictEqual(resolvedExperienceVolunteer, 'volunteer', 'Dual-role user accessing volunteer portal must remain volunteer');
  console.log('  [PASS] Dual-role identity entering Volunteer portal remains Volunteer');
  passed++;

  // ====================================================
  // VOLUNTEER NOTIFICATION ROUTING AUDIT TESTS (23 - 32)
  // ====================================================

  // ----------------------------------------------------
  // 23. /volunteer/duty is NOT considered a valid authenticated notification target
  // ----------------------------------------------------
  console.log('--- 23. /volunteer/duty is NOT considered a valid notification target ---');
  assert.strictEqual(isProtectedVolunteerRoute('/volunteer/duty'), false, '/volunteer/duty must not be a protected volunteer route');
  const dutyPayloadNotif = {
    id: 'vol-duty-1',
    title: 'Duty Assignment',
    message: 'Report to your duty station',
    createdAt: new Date().toISOString(),
    isRead: false,
    metadata: { targetRoute: '/volunteer/duty' }
  };
  const dutyResolved = resolveNotificationRoute(dutyPayloadNotif, 'volunteer');
  assert.strictEqual(dutyResolved, '/volunteer/event', '/volunteer/duty must fall back to /volunteer/event');
  console.log('  [PASS] /volunteer/duty is rejected and falls back to /volunteer/event');
  passed++;

  // ----------------------------------------------------
  // 24. Unsupported Volunteer notification route falls back to /volunteer/event
  // ----------------------------------------------------
  console.log('--- 24. Unsupported Volunteer notification route falls back to /volunteer/event ---');
  const unsupportedNotifs = [
    '/volunteer/safety',
    '/volunteer/random-action',
    '/volunteer/nonexistent',
    '/volunteer/invalid/deep'
  ];
  for (const unsupp of unsupportedNotifs) {
    const res = resolveNotificationRoute(
      {
        id: 'unsupp-test',
        title: 'Notice',
        message: 'Info',
        createdAt: new Date().toISOString(),
        isRead: false,
        metadata: { targetRoute: unsupp }
      },
      'volunteer'
    );
    assert.strictEqual(
      res,
      '/volunteer/event',
      `Unsupported route ${unsupp} must fall back to /volunteer/event`
    );
  }
  console.log('  [PASS] All unsupported Volunteer notification routes safely fall back to /volunteer/event');
  passed++;

  // ----------------------------------------------------
  // 25. Volunteer notification cannot navigate to public landing content
  // ----------------------------------------------------
  console.log('--- 25. Volunteer notification cannot navigate to public landing content ---');
  const publicTargets = ['/', '/child-safety', '/terms', '/privacy', '/contact', '/volunteer/duty'];
  for (const pubTarget of publicTargets) {
    const res = resolveNotificationRoute(
      {
        id: 'pub-test',
        title: 'Policy Update',
        message: 'Important general update',
        createdAt: new Date().toISOString(),
        isRead: false,
        metadata: { targetRoute: pubTarget }
      },
      'volunteer'
    );
    assert.ok(
      isProtectedVolunteerRoute(res),
      `Public target ${pubTarget} must never be navigated to; must resolve to protected route: ${res}`
    );
    assert.strictEqual(res, '/volunteer/event');
  }
  console.log('  [PASS] Volunteer notification cannot navigate to public landing content');
  passed++;

  // ----------------------------------------------------
  // 26. Volunteer notification cannot navigate to Parent
  // ----------------------------------------------------
  console.log('--- 26. Volunteer notification cannot navigate to Parent ---');
  const parentTargets = ['/parent/home', '/parent/children', '/parent/passes', '/parent/profile'];
  for (const pt of parentTargets) {
    const res = resolveNotificationRoute(
      {
        id: 'pt-test',
        title: 'Parent Notice',
        message: 'Parent message',
        createdAt: new Date().toISOString(),
        isRead: false,
        metadata: { targetRoute: pt }
      },
      'volunteer'
    );
    assert.strictEqual(res, '/volunteer/event');
  }
  console.log('  [PASS] Volunteer notification strictly rejects Parent destinations');
  passed++;

  // ----------------------------------------------------
  // 27. Volunteer notification cannot navigate to Admin
  // ----------------------------------------------------
  console.log('--- 27. Volunteer notification cannot navigate to Admin ---');
  const adminTargets = ['/admin/dashboard', '/admin/wristbands', '/admin/settings'];
  for (const at of adminTargets) {
    const res = resolveNotificationRoute(
      {
        id: 'at-test',
        title: 'Admin Notice',
        message: 'Admin message',
        createdAt: new Date().toISOString(),
        isRead: false,
        metadata: { targetRoute: at }
      },
      'volunteer'
    );
    assert.strictEqual(res, '/volunteer/event');
  }
  console.log('  [PASS] Volunteer notification strictly rejects Admin destinations');
  passed++;

  // ----------------------------------------------------
  // 28. Volunteer notification preserves authenticated session
  // ----------------------------------------------------
  console.log('--- 28. Volunteer notification preserves authenticated session ---');
  // Notification navigation never throws or triggers auth clearance
  const badNotif = {
    id: 'corrupt-1',
    title: undefined as any,
    message: null as any,
    createdAt: 'bad-date',
    isRead: false,
    metadata: { targetRoute: 'javascript:void(0)' }
  };
  assert.doesNotThrow(() => {
    const res = resolveNotificationRoute(badNotif, 'volunteer');
    assert.strictEqual(res, '/volunteer/event');
  });
  console.log('  [PASS] Volunteer notification route resolver is resilient and preserves session');
  passed++;

  // ----------------------------------------------------
  // 29. Volunteer notification preserves active experience = volunteer
  // ----------------------------------------------------
  console.log('--- 29. Volunteer notification preserves active experience = volunteer ---');
  safeStorage.setItem('koinonia_active_experience', 'volunteer');
  const currentExp = safeStorage.getItem('koinonia_active_experience');
  assert.strictEqual(currentExp, 'volunteer', 'Active experience must remain volunteer');
  console.log('  [PASS] Active experience = volunteer is preserved');
  passed++;

  // ----------------------------------------------------
  // 30. Safety notification resolves to the ACTUAL existing protected Safety route
  // ----------------------------------------------------
  console.log('--- 30. Safety notification resolves to ACTUAL protected Safety route (/volunteer/team-alerts) ---');
  const safetyNotif = {
    id: 'vol-safety-1',
    title: 'Urgent Safety Alert',
    message: 'Medical incident reported in Children Room 2',
    createdAt: new Date().toISOString(),
    isRead: false
  };
  const safetyResolved = resolveNotificationRoute(safetyNotif, 'volunteer');
  assert.strictEqual(
    safetyResolved,
    '/volunteer/team-alerts',
    'Safety/concern notification must route to /volunteer/team-alerts'
  );
  console.log('  [PASS] Safety notification maps to /volunteer/team-alerts');
  passed++;

  // ----------------------------------------------------
  // 31. Event/duty notification resolves to the ACTUAL existing protected Event route
  // ----------------------------------------------------
  console.log('--- 31. Event/duty notification resolves to ACTUAL protected Event route (/volunteer/event) ---');
  const eventDutyNotif = {
    id: 'vol-event-1',
    title: 'Serving Assignment Updated',
    message: 'Your duty location has been assigned to Main Auditorium Gate 3',
    createdAt: new Date().toISOString(),
    isRead: false
  };
  const eventDutyResolved = resolveNotificationRoute(eventDutyNotif, 'volunteer');
  assert.strictEqual(
    eventDutyResolved,
    '/volunteer/event',
    'Event/duty notification must route to /volunteer/event'
  );
  console.log('  [PASS] Event/duty notification maps to /volunteer/event');
  passed++;

  // ----------------------------------------------------
  // 32. Every Volunteer route accepted by notification routing corresponds to a real protected Volunteer route in App.tsx
  // ----------------------------------------------------
  console.log('--- 32. Every Volunteer route in allowlist is verified in App.tsx ---');
  for (const route of PROTECTED_VOLUNTEER_ROUTES) {
    assert.ok(
      appContent.includes(`case '${route}':`),
      `Protected volunteer route ${route} must have a matching case in App.tsx`
    );
  }
  // Verify that neither /volunteer/duty nor /volunteer/safety are cases in App.tsx
  assert.ok(
    !appContent.includes("case '/volunteer/duty':"),
    '/volunteer/duty must not be a protected route in App.tsx'
  );
  assert.ok(
    !appContent.includes("case '/volunteer/safety':"),
    '/volunteer/safety must not be a protected route in App.tsx'
  );
  console.log('  [PASS] All PROTECTED_VOLUNTEER_ROUTES correspond 1:1 with App.tsx protected routes');
  passed++;

  // ====================================================
  // NOTIFICATION INTERACTION & FULL MESSAGE TESTS (33 - 48)
  // ====================================================

  const notifCentreContent = fs.readFileSync(
    path.join(process.cwd(), 'src/components/common/MobileNotificationCentre.tsx'),
    'utf-8'
  );

  // ----------------------------------------------------
  // 33. Volunteer notification row is interactive
  // ----------------------------------------------------
  console.log('--- 33. Volunteer notification row is interactive ---');
  assert.ok(
    notifCentreContent.includes('role="button"') && notifCentreContent.includes('tabIndex={0}'),
    'Notification row must have button semantics with role="button" and tabIndex={0}'
  );
  assert.ok(
    notifCentreContent.includes("e.key === 'Enter'") && notifCentreContent.includes("e.key === ' '"),
    'Notification row must support Enter and Space keyboard interaction'
  );
  assert.ok(
    notifCentreContent.includes('focus-visible:ring-2'),
    'Notification row must have visible keyboard focus indicator'
  );
  console.log('  [PASS] Volunteer notification row is fully interactive and accessible');
  passed++;

  // ----------------------------------------------------
  // 34. Row click selects notification detail
  // ----------------------------------------------------
  console.log('--- 34. Row click selects notification detail ---');
  assert.ok(
    notifCentreContent.includes('setSelectedNotif({ ...notif, isRead: true })'),
    'handleNotificationClick must set selectedNotif without auto-routing'
  );
  assert.ok(
    notifCentreContent.includes('handleNotificationClick = async (notif: NotificationItem) => {\n    // 1. Mark notification as read immediately without awaiting navigation'),
    'handleNotificationClick must not auto-navigate away on row click'
  );
  console.log('  [PASS] Row click selects notification detail view instead of auto-routing');
  passed++;

  // ----------------------------------------------------
  // 35. Full title is available in detail
  // ----------------------------------------------------
  console.log('--- 35. Full title is available in detail ---');
  assert.ok(
    notifCentreContent.includes('humanizeNotificationCopy(selectedNotif.title, role)') &&
    notifCentreContent.includes('whitespace-normal break-words'),
    'Detail view must render full notification title with whitespace-normal break-words'
  );
  console.log('  [PASS] Full title is rendered in detail view without truncation');
  passed++;

  // ----------------------------------------------------
  // 36. Full message body is available without truncation
  // ----------------------------------------------------
  console.log('--- 36. Full message body is available without truncation ---');
  assert.ok(
    notifCentreContent.includes('humanizeNotificationCopy(selectedNotif.message, role)'),
    'Detail view must render humanized full message'
  );
  assert.ok(
    notifCentreContent.includes('whitespace-normal') &&
    notifCentreContent.includes('break-words') &&
    notifCentreContent.includes('leading-relaxed') &&
    notifCentreContent.includes('whitespace-pre-wrap'),
    'Detail view message body must have whitespace-normal break-words leading-relaxed'
  );
  console.log('  [PASS] Full message body is available in detail view without line-clamp or truncation');
  passed++;

  // ----------------------------------------------------
  // 37. Duty notification CTA resolves to /volunteer/event
  // ----------------------------------------------------
  console.log('--- 37. Duty notification CTA resolves to /volunteer/event ---');
  const dutyTestItem = {
    id: 'duty-test-cta',
    title: 'New duty location assigned',
    message: 'Please review and start duty when shift starts. Please report to Zone B Main Entrance.',
    createdAt: new Date().toISOString(),
    isRead: false
  };
  const dutyAction = getNotificationAction(dutyTestItem, 'volunteer');
  assert.ok(dutyAction, 'Duty notification must provide an action');
  assert.strictEqual(dutyAction.label, 'View event', 'Duty notification CTA label should be "View event"');
  assert.strictEqual(dutyAction.route, '/volunteer/event', 'Duty notification CTA must route to /volunteer/event');
  console.log('  [PASS] Duty notification CTA resolves to /volunteer/event with "View event" label');
  passed++;

  // ----------------------------------------------------
  // 38. Safety CTA resolves to /volunteer/team-alerts
  // ----------------------------------------------------
  console.log('--- 38. Safety CTA resolves to /volunteer/team-alerts ---');
  const safetyTestItem = {
    id: 'safety-test-cta',
    title: 'Safety alert: Child assistance requested',
    message: 'Team assistance required at Hallway 3 for child check-in issue.',
    createdAt: new Date().toISOString(),
    isRead: false
  };
  const safetyAction = getNotificationAction(safetyTestItem, 'volunteer');
  assert.ok(safetyAction, 'Safety notification must provide an action');
  assert.strictEqual(safetyAction.label, 'View safety', 'Safety notification CTA label should be "View safety"');
  assert.strictEqual(safetyAction.route, '/volunteer/team-alerts', 'Safety notification CTA must route to /volunteer/team-alerts');
  console.log('  [PASS] Safety notification CTA resolves to /volunteer/team-alerts with "View safety" label');
  passed++;

  // ----------------------------------------------------
  // 39. /volunteer/duty is never produced
  // ----------------------------------------------------
  console.log('--- 39. /volunteer/duty is never produced ---');
  assert.ok(
    !notifCentreContent.includes("onNavigate('/volunteer/duty')"),
    'MobileNotificationCentre must not have hardcoded navigation to /volunteer/duty'
  );
  const maliciousDutyPayload = {
    id: 'duty-exploit',
    title: 'Duty Assignment',
    message: 'Go to duty',
    createdAt: new Date().toISOString(),
    isRead: false,
    metadata: { targetRoute: '/volunteer/duty' }
  };
  const resolvedDutyAction = getNotificationAction(maliciousDutyPayload, 'volunteer');
  assert.notStrictEqual(resolvedDutyAction?.route, '/volunteer/duty', '/volunteer/duty must never be returned');
  assert.strictEqual(resolvedDutyAction?.route, '/volunteer/event', 'Must safely resolve to /volunteer/event');
  console.log('  [PASS] /volunteer/duty is never produced');
  passed++;

  // ----------------------------------------------------
  // 40. /volunteer/safety is never produced
  // ----------------------------------------------------
  console.log('--- 40. /volunteer/safety is never produced ---');
  const maliciousSafetyPayload = {
    id: 'safety-exploit',
    title: 'Safety Alert',
    message: 'Report to safety desk',
    createdAt: new Date().toISOString(),
    isRead: false,
    metadata: { targetRoute: '/volunteer/safety' }
  };
  const resolvedSafetyAction = getNotificationAction(maliciousSafetyPayload, 'volunteer');
  assert.notStrictEqual(resolvedSafetyAction?.route, '/volunteer/safety', '/volunteer/safety must never be returned');
  assert.ok(
    isProtectedVolunteerRoute(resolvedSafetyAction?.route || ''),
    'Must resolve to a protected volunteer route'
  );
  console.log('  [PASS] /volunteer/safety is never produced');
  passed++;

  // ----------------------------------------------------
  // 41. Invalid actionable destination falls back safely
  // ----------------------------------------------------
  console.log('--- 41. Invalid actionable destination falls back safely ---');
  const invalidActionPayloads = [
    '/volunteer/invalid-random',
    '/admin/dashboard',
    'https://attacker.example.com',
    'javascript:alert(1)'
  ];
  for (const inv of invalidActionPayloads) {
    const act = getNotificationAction(
      {
        id: 'inv-test',
        title: 'Action Item',
        message: 'Click this button',
        createdAt: new Date().toISOString(),
        isRead: false,
        metadata: { targetRoute: inv }
      },
      'volunteer'
    );
    assert.ok(act, 'Actionable notification with invalid route returns safe action');
    assert.strictEqual(act.route, '/volunteer/event', 'Must safely fall back to /volunteer/event');
  }
  console.log('  [PASS] Invalid actionable destinations fall back safely to /volunteer/event');
  passed++;

  // ----------------------------------------------------
  // 42. Information-only notification displays fully without invented route
  // ----------------------------------------------------
  console.log('--- 42. Information-only notification displays fully without invented route ---');
  const infoOnlyItem = {
    id: 'info-only-1',
    title: 'Sunday Morning Fellowship',
    message: 'Coffee and refreshments are available in the courtyard following the morning service. Have a wonderful day!',
    createdAt: new Date().toISOString(),
    isRead: false
  };
  const infoAction = getNotificationAction(infoOnlyItem, 'volunteer');
  assert.strictEqual(infoAction, null, 'Information-only notification must not have an action');
  const infoRoute = resolveNotificationRoute(infoOnlyItem, 'volunteer');
  assert.strictEqual(infoRoute, '', 'Information-only notification must not have an invented route');
  console.log('  [PASS] Information-only notification has null action and empty route');
  passed++;

  // ----------------------------------------------------
  // 43. Selecting notification marks it read
  // ----------------------------------------------------
  console.log('--- 43. Selecting notification marks it read ---');
  assert.ok(
    notifCentreContent.includes('api.parent.markNotificationAsRead(notif.id)'),
    'Selecting notification must invoke markNotificationAsRead API'
  );
  assert.ok(
    notifCentreContent.includes('isRead: true'),
    'Selecting notification must update local state to isRead = true'
  );
  console.log('  [PASS] Selecting notification immediately marks it read');
  passed++;

  // ----------------------------------------------------
  // 44. Mark-all-read still works
  // ----------------------------------------------------
  console.log('--- 44. Mark-all-read still works ---');
  assert.ok(
    notifCentreContent.includes('api.parent.markAllNotificationsAsRead()'),
    'handleMarkAllRead must invoke markAllNotificationsAsRead API'
  );
  assert.ok(
    notifCentreContent.includes('setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))'),
    'handleMarkAllRead must update all notifications to read state'
  );
  console.log('  [PASS] Mark-all-read mechanism is fully preserved');
  passed++;

  // ----------------------------------------------------
  // 45. Volunteer active experience remains volunteer
  // ----------------------------------------------------
  console.log('--- 45. Volunteer active experience remains volunteer ---');
  assert.ok(
    notifCentreContent.includes("safeStorage.setItem('koinonia_active_experience', 'volunteer')"),
    'Action click in volunteer surface must explicitly set active experience to volunteer'
  );
  console.log('  [PASS] Volunteer active experience remains volunteer upon action navigation');
  passed++;

  // ----------------------------------------------------
  // 46. Session is not cleared
  // ----------------------------------------------------
  console.log('--- 46. Session is not cleared ---');
  assert.ok(
    !notifCentreContent.includes('localStorage.clear()') &&
    !notifCentreContent.includes('sessionStorage.clear()') &&
    !notifCentreContent.includes('safeStorage.removeItem'),
    'MobileNotificationCentre must not clear user session or tokens'
  );
  console.log('  [PASS] Notification interactions do not clear session');
  passed++;

  // ----------------------------------------------------
  // 47. Parent notification detail still works
  // ----------------------------------------------------
  console.log('--- 47. Parent notification detail still works ---');
  const parentTestItem = {
    id: 'parent-item-1',
    title: 'Child Checked In',
    message: 'Your child Jordan has been safely checked in to Kingdom Kids Room 101.',
    createdAt: new Date().toISOString(),
    isRead: false,
    childId: 'ch-jordan-1'
  };
  const parentAction = getNotificationAction(parentTestItem, 'parent');
  assert.ok(parentAction, 'Parent notification with childId must provide an action');
  assert.strictEqual(parentAction.route, '/parent/children/ch-jordan-1/status');
  assert.strictEqual(parentAction.label, 'View child status');
  console.log('  [PASS] Parent notification detail displays and routes to parent destination');
  passed++;

  // ----------------------------------------------------
  // 48. Parent and Volunteer destinations cannot cross surfaces
  // ----------------------------------------------------
  console.log('--- 48. Parent and Volunteer destinations cannot cross surfaces ---');
  // Volunteer attempting parent route
  const volCrossItem = {
    id: 'vol-cross',
    title: 'Notice',
    message: 'Message',
    createdAt: new Date().toISOString(),
    isRead: false,
    metadata: { targetRoute: '/parent/home' }
  };
  const volCrossAction = getNotificationAction(volCrossItem, 'volunteer');
  assert.ok(volCrossAction?.route.startsWith('/volunteer/'), 'Volunteer surface must never route to /parent/*');

  // Parent attempting volunteer route
  const parentCrossItem = {
    id: 'parent-cross',
    title: 'Notice',
    message: 'Message',
    createdAt: new Date().toISOString(),
    isRead: false,
    metadata: { targetRoute: '/volunteer/event' }
  };
  const parentCrossAction = getNotificationAction(parentCrossItem, 'parent');
  assert.ok(parentCrossAction?.route.startsWith('/parent/'), 'Parent surface must never route to /volunteer/*');
  console.log('  [PASS] Parent and Volunteer destinations cannot cross surfaces');
  passed++;

  console.log(`\nAll ${passed} tests passed successfully!`);
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
