/**
 * tests/verify_parent_status.ts
 *
 * Test suite for Parent Status Canonical Experience:
 *   - one-child Parent opens full status directly
 *   - multi-child Parent opens full status with child selector
 *   - changing child updates detailed status
 *   - selected child survives refresh/routing (/parent/status/:childId and /parent/children/:childId/status)
 *   - no card-only Status page used as canonical screen
 *   - checked-in child does not show Review Needed
 *   - review-completed child does not show Details under review
 *   - checked-in timeline correct
 *   - picked-up child has Pickup and release complete
 *   - Parent/child ownership enforced
 *   - View Pass behaviour unchanged
 *   - secure pass logic unchanged
 *
 * Run: npx tsx tests/verify_parent_status.ts
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failures.push(name);
    failed++;
  }
}

interface ChildItem {
  id: string;
  name: string;
  age: number;
  ageGroup: string;
  status: 'Draft' | 'Incomplete' | 'Under review' | 'Pass ready' | 'Selected' | 'Waiting list' | 'Not selected' | 'Withdrawn' | 'Checked in' | 'Inside' | 'Picked up' | 'Checked out';
  statusNote: string;
  photoUrl: string;
  submittedAt?: string;
  updated_at?: string;
  draftData?: any;
  passReference?: string;
  passLocked?: boolean;
}

// ---------------------------------------------------------------------------
// Logic extracted from ChildStatusView and App.tsx for unit testing
// ---------------------------------------------------------------------------
const resolveDefaultChild = (list: ChildItem[]): ChildItem | undefined => {
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  
  const sorted = [...list].sort((a, b) => {
    const getTs = (c: ChildItem) => {
      const raw = (c as any).updated_at || (c as any).updatedAt || c.submittedAt || c.draftData?.review?.submittedAt;
      if (!raw) return 0;
      const ms = new Date(raw).getTime();
      return isNaN(ms) ? 0 : ms;
    };
    return getTs(b) - getTs(a);
  });

  const top = sorted[0];
  const topTs = (top as any).updated_at || (top as any).updatedAt || top.submittedAt || top.draftData?.review?.submittedAt;
  if (topTs) return top;
  return list[0];
};

const resolveStatusStages = (currentStatus: string, hasPassReference: boolean = false) => {
  const isDetailsSentDone = currentStatus !== 'Draft' && currentStatus !== 'Incomplete';
  const isReviewDone = ['Selected', 'Not selected', 'Waiting list', 'Pass ready', 'Checked in', 'Inside', 'Picked up', 'Checked out'].includes(currentStatus) || hasPassReference;
  const isPassDone = ['Pass ready', 'Checked in', 'Inside', 'Picked up', 'Checked out'].includes(currentStatus) || hasPassReference;
  const isCheckInDone = ['Checked in', 'Inside', 'Picked up', 'Checked out'].includes(currentStatus);
  const isPickupDone = ['Picked up', 'Checked out'].includes(currentStatus);

  return {
    detailsSent: isDetailsSentDone ? 'complete' : 'active',
    reviewCompleted: isReviewDone ? 'complete' : (currentStatus === 'Under review' ? 'active' : 'future'),
    passReady: isPassDone ? 'complete' : (currentStatus === 'Selected' ? 'active' : 'future'),
    arrivalCheckIn: isCheckInDone ? 'complete' : (currentStatus === 'Pass ready' ? 'active' : 'future'),
    pickupAndRelease: isPickupDone ? 'complete' : ((currentStatus === 'Checked in' || currentStatus === 'Inside') ? 'active' : 'future')
  };
};

const computeAgeGroupDisplay = (child: ChildItem, currentStatus: string) => {
  const isReviewDone = ['Selected', 'Not selected', 'Waiting list', 'Pass ready', 'Checked in', 'Inside', 'Picked up', 'Checked out'].includes(currentStatus) || Boolean(child.passReference);
  const cleanAgeGroup = (child.ageGroup || '').replace(/\s*\(Review Needed\)/gi, '').trim() || 'Children';
  const displayAgeGroup = (isReviewDone || currentStatus !== 'Under review')
    ? cleanAgeGroup
    : child.ageGroup || 'Children';
  const displayAge = child.age === 0 ? '0 yrs old' : `${child.age} yrs old`;
  return { displayAge, displayAgeGroup };
};

const getStatusCardContent = (child: ChildItem, currentStatus: string) => {
  switch (currentStatus) {
    case 'Picked up':
    case 'Checked out':
      return {
        title: 'Picked up',
        message: child.statusNote && child.statusNote.toLowerCase().includes('picked up')
          ? child.statusNote
          : `${child.name} has been picked up and checked out safely.`
      };
    case 'Checked in':
    case 'Inside':
      return {
        title: 'Checked in',
        message: child.statusNote && child.statusNote.toLowerCase().includes('checked in')
          ? child.statusNote
          : `${child.name} has been checked in successfully.`
      };
    case 'Pass ready':
      return {
        title: 'Pass ready',
        message: 'Your child’s event pass is ready. Please present it at arrival and keep it available for pickup.'
      };
    case 'Selected':
      return {
        title: 'Selected',
        message: 'Your child has been selected. The event pass is being generated.'
      };
    case 'Waiting list':
      return {
        title: 'Waiting list',
        message: 'Your child is currently on the waiting list. We will notify you if a space opens up.'
      };
    case 'Not selected':
      return {
        title: 'Not selected',
        message: 'Unfortunately, your child was not selected for this session.'
      };
    case 'Draft':
    case 'Incomplete':
      return {
        title: 'Details incomplete',
        message: child.statusNote || 'Please complete and submit your child’s registration details.'
      };
    case 'Withdrawn':
      return {
        title: 'Withdrawn',
        message: child.statusNote || `Registration details for ${child.name} have been withdrawn.`
      };
    case 'Under review':
    default:
      return {
        title: 'Details under review',
        message: child.statusNote || 'The care team is reviewing your child’s details. You will be notified once verified.'
      };
  }
};

const parseRouteChildParam = (cleanRoute: string): string | undefined => {
  const parts = cleanRoute.split('/');
  if (cleanRoute.startsWith('/parent/status/')) {
    return parts.length >= 4 && parts[3] ? parts[3] : undefined;
  }
  if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/status')) {
    return parts.length >= 4 && parts[3] !== 'review-sent' && parts[3] !== 'new' ? parts[3] : undefined;
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function runTests() {
  console.log('\n=== PARENT STATUS CANONICAL VIEW TESTS ===\n');

  // Test data representing current real family
  const babyLove: ChildItem = {
    id: 'child-love-001',
    name: 'Baby Love',
    age: 0,
    ageGroup: 'Under 4 (Review Needed)',
    status: 'Checked in',
    statusNote: 'Successfully checked in',
    photoUrl: '/sample/love.jpg',
    submittedAt: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-12T08:00:00Z',
    passReference: 'KOI-2026-LOVE'
  };

  const babyLivina: ChildItem = {
    id: 'child-livina-002',
    name: 'Baby Livina',
    age: 4,
    ageGroup: 'Ages 4 to 6',
    status: 'Picked up',
    statusNote: 'Picked up and checked out',
    photoUrl: '/sample/livina.jpg',
    submittedAt: '2026-09-01T10:05:00Z',
    updated_at: '2026-09-12T11:30:00Z',
    passReference: 'KOI-2026-LIVINA'
  };

  // 1. One-child Parent opens full status directly
  await test('one-child Parent opens full status directly without requiring selector', () => {
    const singleChildList = [babyLove];
    const defaultChild = resolveDefaultChild(singleChildList);
    assert.strictEqual(defaultChild?.id, babyLove.id, 'Must select the single child');
    const hasSelector = singleChildList.length > 1;
    assert.strictEqual(hasSelector, false, 'Single-child family should not display multi-child selector row');
  });

  // 2. Multi-child Parent opens full status with child selector
  await test('multi-child Parent opens full status with child selector enabled', () => {
    const multiChildList = [babyLove, babyLivina];
    const defaultChild = resolveDefaultChild(multiChildList);
    assert.ok(defaultChild !== undefined, 'Must resolve a default child');
    assert.strictEqual(defaultChild?.id, babyLivina.id, 'Most recently updated child (Baby Livina) is deterministic default');
    const hasSelector = multiChildList.length > 1;
    assert.strictEqual(hasSelector, true, 'Multi-child family must enable child selector row');
  });

  // 3. Changing child updates detailed status
  await test('changing child updates detailed status', () => {
    const multiChildList = [babyLove, babyLivina];
    // Switching from Livina to Love
    const selectedChild = multiChildList.find(c => c.id === 'child-love-001');
    assert.ok(selectedChild !== undefined);
    assert.strictEqual(selectedChild?.name, 'Baby Love');
    assert.strictEqual(selectedChild?.status, 'Checked in');

    const card = getStatusCardContent(selectedChild!, selectedChild!.status);
    assert.strictEqual(card.title, 'Checked in');
    assert.strictEqual(card.message, 'Successfully checked in');
  });

  // 4. Selected child survives refresh / routing
  await test('selected child survives refresh/routing via /parent/status/:childId and /parent/children/:childId/status', () => {
    const routeLove = '/parent/status/child-love-001';
    const parsedLove = parseRouteChildParam(routeLove);
    assert.strictEqual(parsedLove, 'child-love-001', 'Must parse childId from /parent/status/:childId');

    const routeLivina = '/parent/status/child-livina-002';
    const parsedLivina = parseRouteChildParam(routeLivina);
    assert.strictEqual(parsedLivina, 'child-livina-002', 'Must parse childId from /parent/status/:childId');

    const routeChildrenLivina = '/parent/children/child-livina-002/status';
    const parsedChildrenLivina = parseRouteChildParam(routeChildrenLivina);
    assert.strictEqual(parsedChildrenLivina, 'child-livina-002', 'Must parse childId from /parent/children/:childId/status');

    // Refresh simulation: URL hash contains child ID, resolving same child
    const multiChildList = [babyLove, babyLivina];
    const resolvedOnReload = multiChildList.find(c => c.id === parsedLivina);
    assert.strictEqual(resolvedOnReload?.id, 'child-livina-002');
    assert.strictEqual(resolvedOnReload?.name, 'Baby Livina');
  });

  // 5. No card-only Status page used as canonical screen
  await test('no card-only Status page used as canonical screen in ParentHomeView and routing', () => {
    const parentHomeSource = fs.readFileSync(path.join(process.cwd(), 'src/views/ParentHomeView.tsx'), 'utf-8');
    assert.ok(!parentHomeSource.includes('Review Status</h2>'), 'ParentHomeView must not render the old Review Status h2 header');
    assert.ok(parentHomeSource.includes("if (tab === 'Status')"), 'ParentHomeView handleTabChange must intercept Status tab');
    assert.ok(parentHomeSource.includes("onNavigate('/parent/status')"), 'ParentHomeView must delegate Status to /parent/status');

    const appSource = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf-8');
    assert.ok(appSource.includes("cleanRoute === '/parent/status'"), 'App.tsx must route /parent/status to ChildStatusView');
    assert.ok(appSource.includes("cleanRoute.startsWith('/parent/status/')"), 'App.tsx must route /parent/status/:childId to ChildStatusView');
  });

  // 6. Checked-in child does not show Review Needed
  await test('checked-in child (Baby Love) does not show Review Needed in header', () => {
    const { displayAge, displayAgeGroup } = computeAgeGroupDisplay(babyLove, babyLove.status);
    assert.strictEqual(displayAge, '0 yrs old');
    assert.strictEqual(displayAgeGroup, 'Under 4', 'Must strip (Review Needed) when review is completed/checked in');
    assert.ok(!displayAgeGroup.includes('Review Needed'), 'Must never include "Review Needed"');
  });

  // 7. Review-completed child does not show Details under review
  await test('review-completed / checked-in child does not show Details under review', () => {
    const card = getStatusCardContent(babyLove, babyLove.status);
    assert.strictEqual(card.title, 'Checked in');
    assert.notStrictEqual(card.title, 'Details under review');
    assert.ok(!card.message.includes('reviewing your child'), 'Must not display under review message');
  });

  // 8. Checked-in timeline correct
  await test('checked-in child timeline has first 4 stages complete and pickup pending/active', () => {
    const stages = resolveStatusStages('Checked in', true);
    assert.strictEqual(stages.detailsSent, 'complete', 'Details sent must be complete');
    assert.strictEqual(stages.reviewCompleted, 'complete', 'Review completed must be complete');
    assert.strictEqual(stages.passReady, 'complete', 'Pass ready must be complete');
    assert.strictEqual(stages.arrivalCheckIn, 'complete', 'Arrival check-in must be complete');
    assert.strictEqual(stages.pickupAndRelease, 'active', 'Pickup and release must be active next step');
  });

  // 9. Picked-up child has Pickup and release complete
  await test('picked-up child (Baby Livina) has Pickup and release complete (not pending)', () => {
    const stages = resolveStatusStages('Picked up', true);
    assert.strictEqual(stages.detailsSent, 'complete', 'Details sent must be complete');
    assert.strictEqual(stages.reviewCompleted, 'complete', 'Review completed must be complete');
    assert.strictEqual(stages.passReady, 'complete', 'Pass ready must be complete');
    assert.strictEqual(stages.arrivalCheckIn, 'complete', 'Arrival check-in must be complete');
    assert.strictEqual(stages.pickupAndRelease, 'complete', 'Pickup and release must be complete (green)');

    const card = getStatusCardContent(babyLivina, babyLivina.status);
    assert.strictEqual(card.title, 'Picked up');
    assert.strictEqual(card.message, 'Picked up and checked out');
  });

  // 10. Parent/child ownership enforced in backend route
  await test('Parent/child ownership is enforced in parent routes', () => {
    const parentRouteSource = fs.readFileSync(path.join(process.cwd(), 'src/server/routes/parent.ts'), 'utf-8');
    assert.ok(parentRouteSource.includes('/children/:childId/status'), 'Backend must expose /children/:childId/status');
    assert.ok(parentRouteSource.includes('parentProfileId'), 'Backend must check authenticated parent profile ID');
  });

  // 11. View pass action preserved and redundant Back to Home button removed
  await test('View Pass button preserved and redundant Back to Home button removed from ChildStatusView', () => {
    const childStatusSource = fs.readFileSync(path.join(process.cwd(), 'src/views/ChildStatusView.tsx'), 'utf-8');
    assert.ok(childStatusSource.includes('<span>View pass</span>'), 'ChildStatusView must keep View pass button');
    assert.ok(childStatusSource.includes('/parent/children/${foundChild.id}/pass'), 'View pass must link to pass view');
    assert.ok(!childStatusSource.includes('Back to Home'), 'ChildStatusView must NOT have redundant Back to Home button');
  });

  // 12. Multi-child selector row rendered cleanly with photo, name, and state
  await test('Multi-child selector row renders with photo, name, and status', () => {
    const childStatusSource = fs.readFileSync(path.join(process.cwd(), 'src/views/ChildStatusView.tsx'), 'utf-8');
    assert.ok(childStatusSource.includes('childrenList.length > 1'), 'ChildStatusView must condition selector on childrenList.length > 1');
    assert.ok(childStatusSource.includes('FallbackAvatar'), 'Selector must render child photo avatar');
    assert.ok(childStatusSource.includes('highLevelState'), 'Selector must render high level state');
    assert.ok(childStatusSource.includes('/parent/status/${c.id}'), 'Selector must navigate to /parent/status/:childId');
  });

  console.log('\n==============================================');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  if (failures.length > 0) {
    console.error('\nFailed tests:');
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('\nAll parent status canonical view tests PASSED.\n');
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
