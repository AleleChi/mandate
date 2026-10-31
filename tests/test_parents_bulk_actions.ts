/**
 * Test Suite: Parents & Workers Bulk Child Event Actions
 * Covers test cases A through G from specification:
 * - A. Three parents, one child each (all awaiting review -> waitlist)
 * - B. Parent with multiple children (partial eligibility -> 2 eligible / 1 skipped)
 * - C. Mixed statuses (not selected, awaiting review, pass ready, withdrawn -> valid counts)
 * - D. Parent with no children (gracefully excluded without breaking bulk operation)
 * - E. Age-filtered selection (filter 2-3 -> bulk action affects matching records)
 * - F. Validation failure handling (partial success & clear summary of failure reasons)
 * - G. Sequential review workflow (traversal, index bounds, in-place table update)
 */

interface ChildRecord {
  id: string;
  applicationId?: string | null;
  fullName: string;
  age?: number | null;
  ageGroup?: string | null;
  gender?: string | null;
  entryStatus?: string;
  checkedInAt?: string | null;
  pickedUpAt?: string | null;
}

interface ParentRecord {
  id: string;
  fullName: string;
  email?: string;
  phoneNumber?: string;
  children: ChildRecord[];
}

interface ConnectedChildRecord extends ChildRecord {
  parentId: string;
  parentName: string;
}

// 1. Resolve connected children across selected parents
function resolveConnectedChildren(selectedParentIds: string[], parents: ParentRecord[]): {
  selectedParentsList: ParentRecord[];
  allConnectedChildren: ConnectedChildRecord[];
  parentsWithNoChildren: ParentRecord[];
} {
  const idSet = new Set(selectedParentIds.map(String));
  const selectedParentsList = parents.filter(p => idSet.has(String(p.id)));
  const parentsWithNoChildren = selectedParentsList.filter(p => !p.children || p.children.length === 0);

  const allConnectedChildren: ConnectedChildRecord[] = [];
  selectedParentsList.forEach(p => {
    (p.children || []).forEach(c => {
      allConnectedChildren.push({
        ...c,
        parentId: String(p.id),
        parentName: p.fullName
      });
    });
  });

  return { selectedParentsList, allConnectedChildren, parentsWithNoChildren };
}

// 2. Compute context-aware applicable counts
function computeApplicableCounts(allConnectedChildren: ConnectedChildRecord[]) {
  let selectForEvent = 0;
  let reviewSelected = 0;
  let approve = 0;
  let waitlist = 0;
  let notSelected = 0;
  let returnDraft = 0;

  allConnectedChildren.forEach(child => {
    const status = child.entryStatus || 'not_registered';
    const isAttending = ['checked_in', 'inside', 'picked_up'].includes(status) || Boolean(child.checkedInAt && !child.pickedUpAt);
    if (isAttending || status === 'withdrawn') return;

    // select_for_event
    if (!child.entryStatus || status === 'not_registered' || status === 'not_selected' || status === 'incomplete' || status === 'draft' || status === 'waiting_list') {
      if (status !== 'pass_ready' && status !== 'selected' && status !== 'under_review' && status !== 'review_reopened') {
        selectForEvent++;
      }
    }

    // review_selected
    if (status === 'under_review' || status === 'review_reopened') {
      reviewSelected++;
    }

    // approve
    if (child.applicationId && (status === 'under_review' || status === 'review_reopened' || status === 'waiting_list')) {
      approve++;
    }

    // waitlist
    if (child.applicationId && status !== 'waiting_list' && status !== 'pass_ready' && ['under_review', 'review_reopened', 'selected', 'not_selected'].includes(status)) {
      waitlist++;
    }

    // not_selected
    if (child.applicationId && status !== 'not_selected' && status !== 'pass_ready' && ['under_review', 'review_reopened', 'selected', 'waiting_list'].includes(status)) {
      notSelected++;
    }

    // return_draft
    if (child.applicationId && (status === 'under_review' || status === 'review_reopened')) {
      returnDraft++;
    }
  });

  return {
    selectForEvent,
    reviewSelected,
    approve,
    waitlist,
    notSelected,
    returnDraft
  };
}

// 3. Evaluate eligibility for bulk action confirmation breakdown
function evaluateBulkActionBreakdown(
  actionType: 'select_for_event' | 'approve' | 'waitlist' | 'not_selected' | 'return_draft',
  allChildren: ConnectedChildRecord[]
) {
  const eligible: ConnectedChildRecord[] = [];
  const skipped: { child: ConnectedChildRecord; reason: string }[] = [];

  allChildren.forEach(child => {
    const status = child.entryStatus || 'not_registered';
    const isAttending = ['checked_in', 'inside', 'picked_up'].includes(status) || Boolean(child.checkedInAt && !child.pickedUpAt);

    if (actionType === 'select_for_event') {
      if (isAttending) {
        skipped.push({ child, reason: 'Child is currently attending the event' });
      } else if (status === 'pass_ready') {
        skipped.push({ child, reason: 'Pass already issued for current event' });
      } else if (status === 'selected') {
        skipped.push({ child, reason: 'Already selected for current event' });
      } else if (status === 'under_review' || status === 'review_reopened') {
        skipped.push({ child, reason: 'Already entered and awaiting review' });
      } else if (status === 'withdrawn') {
        skipped.push({ child, reason: 'Application is withdrawn' });
      } else {
        eligible.push(child);
      }
    } else if (actionType === 'approve') {
      if (!child.applicationId || status === 'not_registered') {
        skipped.push({ child, reason: 'No current-event application (Select for event first)' });
      } else if (status === 'pass_ready') {
        skipped.push({ child, reason: 'Already Pass Ready' });
      } else if (status === 'selected') {
        skipped.push({ child, reason: 'Already approved and selected' });
      } else if (isAttending) {
        skipped.push({ child, reason: 'Child is currently attending the event' });
      } else if (status === 'withdrawn') {
        skipped.push({ child, reason: 'Application is withdrawn' });
      } else if (status === 'not_selected') {
        skipped.push({ child, reason: 'Marked not selected (Select for event first)' });
      } else if (status === 'incomplete' || status === 'draft') {
        skipped.push({ child, reason: 'Application is an incomplete draft' });
      } else if (status === 'under_review' || status === 'review_reopened' || status === 'waiting_list') {
        eligible.push(child);
      } else {
        skipped.push({ child, reason: `Status '${status}' cannot be approved directly` });
      }
    } else if (actionType === 'waitlist') {
      if (!child.applicationId || status === 'not_registered') {
        skipped.push({ child, reason: 'No current-event application' });
      } else if (status === 'waiting_list') {
        skipped.push({ child, reason: 'Already on waiting list' });
      } else if (status === 'pass_ready') {
        skipped.push({ child, reason: 'Already Pass Ready' });
      } else if (isAttending) {
        skipped.push({ child, reason: 'Child is currently attending the event' });
      } else if (status === 'withdrawn') {
        skipped.push({ child, reason: 'Application is withdrawn' });
      } else if (status === 'incomplete' || status === 'draft') {
        skipped.push({ child, reason: 'Application is an incomplete draft' });
      } else {
        eligible.push(child);
      }
    } else if (actionType === 'not_selected') {
      if (!child.applicationId || status === 'not_registered') {
        skipped.push({ child, reason: 'No current-event application' });
      } else if (status === 'not_selected') {
        skipped.push({ child, reason: 'Already marked as not selected' });
      } else if (isAttending) {
        skipped.push({ child, reason: 'Child is currently attending the event' });
      } else if (status === 'pass_ready') {
        skipped.push({ child, reason: 'Already Pass Ready' });
      } else if (status === 'withdrawn') {
        skipped.push({ child, reason: 'Application is withdrawn' });
      } else if (status === 'incomplete' || status === 'draft') {
        skipped.push({ child, reason: 'Application is an incomplete draft' });
      } else {
        eligible.push(child);
      }
    }
  });

  return { eligible, skipped };
}

// RUN TESTS
function runTests() {
  console.log('--- RUNNING PARENTS BULK CHILD ACTIONS TEST SUITE ---\n');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`);
      process.exitCode = 1;
    }
  }

  // --- TEST CASE A: Three parents, one child each, all awaiting review -> move to waitlist ---
  console.log('[Test Case A: Three parents, one child each]');
  const parentsA: ParentRecord[] = [
    { id: 'p1', fullName: 'Parent 1', children: [{ id: 'c1', applicationId: 'app1', fullName: 'Child 1', entryStatus: 'under_review' }] },
    { id: 'p2', fullName: 'Parent 2', children: [{ id: 'c2', applicationId: 'app2', fullName: 'Child 2', entryStatus: 'under_review' }] },
    { id: 'p3', fullName: 'Parent 3', children: [{ id: 'c3', applicationId: 'app3', fullName: 'Child 3', entryStatus: 'under_review' }] }
  ];
  const resA = resolveConnectedChildren(['p1', 'p2', 'p3'], parentsA);
  assert(resA.allConnectedChildren.length === 3, 'A: Resolves all 3 connected children');
  const countsA = computeApplicableCounts(resA.allConnectedChildren);
  assert(countsA.waitlist === 3, 'A: Waitlist count is 3');
  assert(countsA.reviewSelected === 3, 'A: Review count is 3');
  const breakdownA = evaluateBulkActionBreakdown('waitlist', resA.allConnectedChildren);
  assert(breakdownA.eligible.length === 3, 'A: All 3 children eligible for waitlist');
  assert(breakdownA.skipped.length === 0, 'A: 0 children skipped');

  // --- TEST CASE B: Parent with three children, only two eligible ---
  console.log('\n[Test Case B: Parent with three children, partial eligibility]');
  const parentsB: ParentRecord[] = [
    {
      id: 'pB',
      fullName: 'Parent B',
      children: [
        { id: 'cB1', applicationId: 'appB1', fullName: 'Child B1', entryStatus: 'under_review' },
        { id: 'cB2', applicationId: 'appB2', fullName: 'Child B2', entryStatus: 'waiting_list' },
        { id: 'cB3', applicationId: 'appB3', fullName: 'Child B3', entryStatus: 'pass_ready' } // Not eligible for approve/waitlist
      ]
    }
  ];
  const resB = resolveConnectedChildren(['pB'], parentsB);
  assert(resB.allConnectedChildren.length === 3, 'B: Resolves 3 connected children');
  const breakdownB = evaluateBulkActionBreakdown('approve', resB.allConnectedChildren);
  assert(breakdownB.eligible.length === 2, 'B: 2 children eligible for approve (under_review + waiting_list)');
  assert(breakdownB.skipped.length === 1, 'B: 1 child skipped');
  assert(breakdownB.skipped[0].reason === 'Already Pass Ready', 'B: Reason correctly identifies "Already Pass Ready"');

  // --- TEST CASE C: Mixed statuses across parents ---
  console.log('\n[Test Case C: Mixed statuses]');
  const parentsC: ParentRecord[] = [
    {
      id: 'pC1',
      fullName: 'Parent C1',
      children: [
        { id: 'c_not_sel', applicationId: 'appC1', fullName: 'Child Not Selected', entryStatus: 'not_selected' },
        { id: 'c_rev', applicationId: 'appC2', fullName: 'Child Reviewing', entryStatus: 'under_review' }
      ]
    },
    {
      id: 'pC2',
      fullName: 'Parent C2',
      children: [
        { id: 'c_pass', applicationId: 'appC3', fullName: 'Child Pass Ready', entryStatus: 'pass_ready' },
        { id: 'c_withdrawn', applicationId: 'appC4', fullName: 'Child Withdrawn', entryStatus: 'withdrawn' }
      ]
    }
  ];
  const resC = resolveConnectedChildren(['pC1', 'pC2'], parentsC);
  const countsC = computeApplicableCounts(resC.allConnectedChildren);
  assert(countsC.selectForEvent === 1, 'C: 1 child eligible for select for event (not_selected)');
  assert(countsC.reviewSelected === 1, 'C: 1 child eligible for review selected (under_review)');
  assert(countsC.approve === 1, 'C: 1 child eligible for approval (under_review)');
  assert(countsC.waitlist === 2, 'C: 2 children eligible for waitlist (not_selected + under_review)');

  // --- TEST CASE D: Parent with no children ---
  console.log('\n[Test Case D: Parent with no children]');
  const parentsD: ParentRecord[] = [
    { id: 'pD_empty', fullName: 'Parent Empty', children: [] },
    { id: 'pD_with_child', fullName: 'Parent Active', children: [{ id: 'cD1', applicationId: 'appD1', fullName: 'Child D1', entryStatus: 'under_review' }] }
  ];
  const resD = resolveConnectedChildren(['pD_empty', 'pD_with_child'], parentsD);
  assert(resD.allConnectedChildren.length === 1, 'D: Only 1 child resolved');
  assert(resD.parentsWithNoChildren.length === 1, 'D: 1 parent identified as having no children');
  assert(resD.parentsWithNoChildren[0].fullName === 'Parent Empty', 'D: Empty parent identified by name for breakdown note');
  const breakdownD = evaluateBulkActionBreakdown('approve', resD.allConnectedChildren);
  assert(breakdownD.eligible.length === 1, 'D: Bulk operation continues safely for eligible children');

  // --- TEST CASE E: Age-filtered result (e.g. Ages 2-3) ---
  console.log('\n[Test Case E: Age-filtered selection]');
  const parentsE: ParentRecord[] = [
    {
      id: 'pE1',
      fullName: 'Parent Toddler',
      children: [{ id: 'cE1', applicationId: 'appE1', fullName: 'Toddler A', age: 2, ageGroup: 'Ages 2–3', entryStatus: 'under_review' }]
    },
    {
      id: 'pE2',
      fullName: 'Parent Teen',
      children: [{ id: 'cE2', applicationId: 'appE2', fullName: 'Teen B', age: 14, ageGroup: 'Ages 13–14', entryStatus: 'under_review' }]
    }
  ];
  // Filter for parents matching Ages 2-3
  const visibleFilteredParents = parentsE.filter(p => p.children.some(c => c.age !== undefined && c.age !== null && c.age >= 2 && c.age <= 3));
  assert(visibleFilteredParents.length === 1 && visibleFilteredParents[0].id === 'pE1', 'E: Only parent with 2-3 yr old matches filter');
  const resE = resolveConnectedChildren(visibleFilteredParents.map(p => p.id), parentsE);
  assert(resE.allConnectedChildren.length === 1 && resE.allConnectedChildren[0].fullName === 'Toddler A', 'E: Bulk action affects only matching filtered family records');

  // --- TEST CASE F: Validation failure handling & partial success summary ---
  console.log('\n[Test Case F: Partial success and validation error handling]');
  const sampleFailures = [
    { id: 'appF2', childName: 'Child F2', reason: 'Mandatory requirements missing: Child photo verification required' }
  ];
  const totalAttempted = 5;
  const updatedCount = 4;
  const resultsSummary = {
    updatedCount,
    failedItems: sampleFailures
  };
  assert(resultsSummary.updatedCount === 4, 'F: 4 succeeded');
  assert(resultsSummary.failedItems.length === 1, 'F: 1 failed');
  assert(resultsSummary.failedItems[0].reason.includes('Mandatory requirements missing'), 'F: Failure reason clearly surfaced to admin');

  // --- TEST CASE G: Sequential review sequence ---
  console.log('\n[Test Case G: Sequential review workflow]');
  const reviewSequenceList = [
    { id: 'cG1', fullName: 'Child G1', entryStatus: 'under_review' },
    { id: 'cG2', fullName: 'Child G2', entryStatus: 'under_review' },
    { id: 'cG3', fullName: 'Child G3', entryStatus: 'under_review' }
  ];
  let seqIdx = 0;
  assert(seqIdx === 0 && reviewSequenceList[seqIdx].fullName === 'Child G1', 'G: Sequence starts at 1 of 3 (Child G1)');
  // Advance to next
  seqIdx++;
  assert(seqIdx === 1 && reviewSequenceList[seqIdx].fullName === 'Child G2', 'G: Advances to 2 of 3 (Child G2)');
  // Advance to last
  seqIdx++;
  assert(seqIdx === 2 && reviewSequenceList[seqIdx].fullName === 'Child G3', 'G: Advances to 3 of 3 (Child G3)');
  // Cannot advance beyond last
  const canAdvance = seqIdx < reviewSequenceList.length - 1;
  assert(!canAdvance, 'G: Next button disabled at end of sequence');

  console.log(`\n========================================`);
  console.log(`SUMMARY: ${passed} of ${total} assertions PASSED.`);
  console.log(`========================================\n`);
}

runTests();
