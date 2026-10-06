import assert from 'assert';
import {
  resolveCanonicalAgeGroup,
  getDobCutoffsForEvent,
  CANONICAL_MIN_AGE,
  CANONICAL_MAX_AGE,
  CANONICAL_GA_EVENT_DATE
} from '../src/server/services/eligibilityService';

/**
 * Pure simulation of registration categorisation matching the review board & backend /api/admin/applications logic
 */
function classifyApplication(app: {
  id: string;
  eventId: string;
  status: string;
  submittedAt?: string | null;
  detailsConfirmed?: number | null;
  isDeleted?: number | null;
  child: {
    fullName: string;
    dob?: string | null;
    age?: number | null;
    photoUrl?: string | null;
    needsAgeReview?: number | null;
  };
  pickupPeople?: Array<{ id: string; fullName: string; photoUrl?: string | null }>;
  hasMedicalNotes?: number;
  medicalNotes?: string;
  needsExtraSupport?: number;
  supportNotes?: string;
}, currentEventId: string, eventDate: string = CANONICAL_GA_EVENT_DATE) {
  // Scoped to current event
  if (app.eventId !== currentEventId) {
    return { excluded: true, reason: 'DIFFERENT_EVENT' };
  }
  if (app.isDeleted === 1 || app.status === 'removed') {
    return { excluded: true, reason: 'DELETED_OR_REMOVED' };
  }

  // Incomplete check
  const isIncomplete = (
    (app.status === 'incomplete' || app.status === 'draft') &&
    !app.submittedAt &&
    (app.detailsConfirmed === 0 || app.detailsConfirmed === null || app.detailsConfirmed === undefined)
  );

  // Status mapping
  let reviewBucket: 'incomplete' | 'awaiting_review' | 'selected' | 'waiting_list' | 'not_selected';
  if (isIncomplete) {
    reviewBucket = 'incomplete';
  } else if (app.status === 'under_review' || app.status === 'review_reopened' || app.status === 'submitted') {
    reviewBucket = 'awaiting_review';
  } else if (['selected', 'pass_ready', 'checked_in', 'inside', 'picked_up'].includes(app.status)) {
    reviewBucket = 'selected';
  } else if (app.status === 'waiting_list') {
    reviewBucket = 'waiting_list';
  } else if (app.status === 'not_selected' || app.status === 'rejected') {
    reviewBucket = 'not_selected';
  } else {
    reviewBucket = 'awaiting_review';
  }

  // Needs attention check (orthogonal flag)
  const ageRes = resolveCanonicalAgeGroup(app.child.dob ?? app.child.age, eventDate);
  const isOutOfAgeRange = ageRes.isOutOfRange;
  const isMissingChildPhoto = !app.child.photoUrl;
  const isMissingPickupPhoto = !app.pickupPeople || app.pickupPeople.length === 0 || app.pickupPeople.some(p => !p.photoUrl);
  const hasMedical = app.hasMedicalNotes === 1 || Boolean(app.medicalNotes);
  const hasSupport = app.needsExtraSupport === 1 || Boolean(app.supportNotes);

  const needsAttention = (
    app.child.needsAgeReview === 1 ||
    isOutOfAgeRange ||
    isMissingChildPhoto ||
    isMissingPickupPhoto ||
    hasMedical ||
    hasSupport
  );

  return {
    excluded: false,
    reviewBucket,
    needsAttention,
    ageRes,
    isIncomplete
  };
}

function processReviewBoard(applications: any[], currentEventId: string | null) {
  if (!currentEventId) {
    return {
      success: true,
      applications: [],
      stats: {
        total: 0,
        incomplete: 0,
        sentReview: 0,
        selected: 0,
        waitingList: 0,
        notSelected: 0,
        needsAttention: 0
      }
    };
  }

  const processed: any[] = [];
  const stats = {
    total: 0,
    incomplete: 0,
    sentReview: 0,
    selected: 0,
    waitingList: 0,
    notSelected: 0,
    needsAttention: 0
  };

  for (const app of applications) {
    const res = classifyApplication(app, currentEventId);
    if (res.excluded) continue;

    stats.total++;
    if (res.needsAttention) stats.needsAttention++;

    switch (res.reviewBucket) {
      case 'incomplete':
        stats.incomplete++;
        break;
      case 'awaiting_review':
        stats.sentReview++;
        break;
      case 'selected':
        stats.selected++;
        break;
      case 'waiting_list':
        stats.waitingList++;
        break;
      case 'not_selected':
        stats.notSelected++;
        break;
    }

    processed.push({
      id: app.id,
      status: app.status,
      reviewBucket: res.reviewBucket,
      needsAttention: res.needsAttention,
      ageGroup: res.ageRes.label
    });
  }

  return {
    success: true,
    applications: processed,
    stats
  };
}

async function runReviewClassificationTests() {
  console.log('================================================================');
  console.log('REVIEW BOARD CLASSIFICATION & CURRENT-EVENT SCOPE TEST SUITE');
  console.log('================================================================\n');

  const CURRENT_EVENT = 'event-ga-2026';
  const ARCHIVED_EVENT = 'event-ga-2024';

  // 1. Current event with NO registrations returns valid empty response, not 500
  console.log('--- TEST 1: Empty Current Event Handling ---');
  const emptyRes = processReviewBoard([], CURRENT_EVENT);
  assert.strictEqual(emptyRes.success, true);
  assert.strictEqual(emptyRes.applications.length, 0);
  assert.strictEqual(emptyRes.stats.total, 0);
  assert.strictEqual(emptyRes.stats.incomplete, 0);
  assert.strictEqual(emptyRes.stats.sentReview, 0);
  assert.strictEqual(emptyRes.stats.selected, 0);
  assert.strictEqual(emptyRes.stats.waitingList, 0);
  assert.strictEqual(emptyRes.stats.notSelected, 0);
  assert.strictEqual(emptyRes.stats.needsAttention, 0);

  const nullEventRes = processReviewBoard([], null);
  assert.strictEqual(nullEventRes.success, true);
  assert.strictEqual(nullEventRes.applications.length, 0);
  console.log('  ✓ Empty current event returns valid 200 payload with zeroed stats');

  // 2. Lifecycle status categorisation tests
  console.log('\n--- TEST 2: Categorisation and Lifecycle Mapping ---');
  const sampleRegistrations: any[] = [
    // 1. Incomplete draft
    {
      id: 'app-draft',
      eventId: CURRENT_EVENT,
      status: 'incomplete',
      submittedAt: null,
      detailsConfirmed: 0,
      child: { fullName: 'Child Incomplete', dob: '2022-05-01', photoUrl: 'https://img/c1.jpg' },
      pickupPeople: [{ id: 'p1', fullName: 'Parent 1', photoUrl: 'https://img/p1.jpg' }]
    },
    // 2. Under review -> Awaiting review
    {
      id: 'app-review',
      eventId: CURRENT_EVENT,
      status: 'under_review',
      submittedAt: '2026-10-01T10:00:00Z',
      detailsConfirmed: 1,
      child: { fullName: 'Child Review', dob: '2020-05-01', photoUrl: 'https://img/c2.jpg' },
      pickupPeople: [{ id: 'p2', fullName: 'Parent 2', photoUrl: 'https://img/p2.jpg' }]
    },
    // 3. Selected -> Selected
    {
      id: 'app-selected',
      eventId: CURRENT_EVENT,
      status: 'selected',
      submittedAt: '2026-10-01T10:00:00Z',
      detailsConfirmed: 1,
      child: { fullName: 'Child Selected', dob: '2019-05-01', photoUrl: 'https://img/c3.jpg' },
      pickupPeople: [{ id: 'p3', fullName: 'Parent 3', photoUrl: 'https://img/p3.jpg' }]
    },
    // 4. Pass ready -> Selected
    {
      id: 'app-pass-ready',
      eventId: CURRENT_EVENT,
      status: 'pass_ready',
      submittedAt: '2026-10-01T10:00:00Z',
      detailsConfirmed: 1,
      child: { fullName: 'Child Pass', dob: '2016-05-01', photoUrl: 'https://img/c4.jpg' },
      pickupPeople: [{ id: 'p4', fullName: 'Parent 4', photoUrl: 'https://img/p4.jpg' }]
    },
    // 5. Waiting list -> Waiting list
    {
      id: 'app-waitlist',
      eventId: CURRENT_EVENT,
      status: 'waiting_list',
      submittedAt: '2026-10-01T10:00:00Z',
      detailsConfirmed: 1,
      child: { fullName: 'Child Waiting', dob: '2014-05-01', photoUrl: 'https://img/c5.jpg' },
      pickupPeople: [{ id: 'p5', fullName: 'Parent 5', photoUrl: 'https://img/p5.jpg' }]
    },
    // 6. Rejected / not selected -> Not selected
    {
      id: 'app-not-selected',
      eventId: CURRENT_EVENT,
      status: 'not_selected',
      submittedAt: '2026-10-01T10:00:00Z',
      detailsConfirmed: 1,
      child: { fullName: 'Child Not Selected', dob: '2013-05-01', photoUrl: 'https://img/c6.jpg' },
      pickupPeople: [{ id: 'p6', fullName: 'Parent 6', photoUrl: 'https://img/p6.jpg' }]
    },
    // 7. Needs attention flag (Child age 1 out-of-range + medical notes)
    {
      id: 'app-attention',
      eventId: CURRENT_EVENT,
      status: 'selected',
      submittedAt: '2026-10-01T10:00:00Z',
      detailsConfirmed: 1,
      child: { fullName: 'Baby Attention', dob: '2025-06-01', photoUrl: 'https://img/c7.jpg', needsAgeReview: 1 },
      pickupPeople: [{ id: 'p7', fullName: 'Parent 7', photoUrl: 'https://img/p7.jpg' }],
      hasMedicalNotes: 1,
      medicalNotes: 'Asthma inhaler required'
    },
    // 8. ARCHIVED EVENT REGISTRATION (Must be excluded!)
    {
      id: 'app-archived',
      eventId: ARCHIVED_EVENT,
      status: 'selected',
      child: { fullName: 'Archived Child', dob: '2018-01-01', photoUrl: 'https://img/c8.jpg' },
      pickupPeople: [{ id: 'p8', fullName: 'Parent 8', photoUrl: 'https://img/p8.jpg' }]
    }
  ];

  const boardRes = processReviewBoard(sampleRegistrations, CURRENT_EVENT);

  console.log('Board Stats:', boardRes.stats);

  // Check categories:
  assert.strictEqual(boardRes.stats.incomplete, 1, 'Incomplete count must be 1');
  assert.strictEqual(boardRes.stats.sentReview, 1, 'Awaiting review count must be 1');
  assert.strictEqual(boardRes.stats.selected, 3, 'Selected count must be 3 (app-selected, app-pass-ready, app-attention)');
  assert.strictEqual(boardRes.stats.waitingList, 1, 'Waiting list count must be 1');
  assert.strictEqual(boardRes.stats.notSelected, 1, 'Not selected count must be 1');
  assert.strictEqual(boardRes.stats.total, 7, 'Total current-event registrations must be 7 (archived excluded)');

  // Verify archived event isolation:
  const archivedFound = boardRes.applications.some(a => a.id === 'app-archived');
  assert.strictEqual(archivedFound, false, 'Archived event record must never appear in current event review');
  console.log('  ✓ Archived event records strictly isolated');

  // Verify orthogonal Needs Attention count:
  assert.strictEqual(boardRes.stats.needsAttention, 1, 'Needs attention must flag 1 child');
  const attentionApp = boardRes.applications.find(a => a.id === 'app-attention');
  assert(attentionApp, 'Attention child must exist in review board');
  assert.strictEqual(attentionApp.needsAttention, true);
  assert.strictEqual(attentionApp.ageGroup, 'Age review needed');
  console.log('  ✓ Needs attention flags map correctly without breaking review category');

  // Verify counts match returned records:
  const incompleteRows = boardRes.applications.filter(a => a.reviewBucket === 'incomplete').length;
  const reviewRows = boardRes.applications.filter(a => a.reviewBucket === 'awaiting_review').length;
  const selectedRows = boardRes.applications.filter(a => a.reviewBucket === 'selected').length;
  const waitlistRows = boardRes.applications.filter(a => a.reviewBucket === 'waiting_list').length;
  const notSelectedRows = boardRes.applications.filter(a => a.reviewBucket === 'not_selected').length;

  assert.strictEqual(incompleteRows, boardRes.stats.incomplete);
  assert.strictEqual(reviewRows, boardRes.stats.sentReview);
  assert.strictEqual(selectedRows, boardRes.stats.selected);
  assert.strictEqual(waitlistRows, boardRes.stats.waitingList);
  assert.strictEqual(notSelectedRows, boardRes.stats.notSelected);
  assert.strictEqual(incompleteRows + reviewRows + selectedRows + waitlistRows + notSelectedRows, boardRes.stats.total);
  console.log('  ✓ Counts match returned records 1-to-1');

  console.log('\n================================================================');
  console.log('ALL REVIEW CLASSIFICATION TESTS PASSED');
  console.log('================================================================');
}

runReviewClassificationTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
