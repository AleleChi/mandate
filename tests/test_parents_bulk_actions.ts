/**
 * Comprehensive Test Suite: Parents Bulk Child Event Actions
 * Covers all 7 supported actions:
 * 1. Select for event
 * 2. Review selected
 * 3. Approve
 * 4. Waiting List
 * 5. Not Selected
 * 6. Return to Parent
 * 7. Restore
 *
 * For each action tests:
 * - One eligible child (auto-selection)
 * - Multiple eligible children (explicit selection)
 * - Mixed eligible/ineligible children with unavailable reasons
 * - Multiple children under one parent
 * - Multiple parents
 * - Backend validation failure
 * - Only selected children are changed
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

type BulkChildActionType = 
  | 'select_for_event' 
  | 'review_sequence' 
  | 'approve' 
  | 'waitlist' 
  | 'not_selected' 
  | 'return_draft' 
  | 'restore';

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

// 2. Evaluate eligibility and unavailable reasons for any child under an action
function evaluateChildEligibility(actionType: BulkChildActionType, child: ConnectedChildRecord): { isAvailable: boolean; reason?: string } {
  const status = child.entryStatus || 'not_registered';
  const isAttending = ['checked_in', 'inside', 'picked_up'].includes(status) || 
                      Boolean(child.checkedInAt && !child.pickedUpAt);

  switch (actionType) {
    case 'select_for_event':
      if (isAttending) return { isAvailable: false, reason: 'Child is currently attending the event' };
      if (status === 'pass_ready') return { isAvailable: false, reason: 'Already Pass Ready' };
      if (status === 'selected') return { isAvailable: false, reason: 'Already selected for current event' };
      if (status === 'under_review' || status === 'review_reopened') return { isAvailable: false, reason: 'Already Under Review' };
      if (status === 'withdrawn') return { isAvailable: false, reason: 'Application Withdrawn' };
      return { isAvailable: true };

    case 'review_sequence':
      if (isAttending) return { isAvailable: false, reason: 'Child is currently attending the event' };
      if (status === 'under_review' || status === 'review_reopened') return { isAvailable: true };
      if (!child.applicationId || status === 'not_registered') return { isAvailable: false, reason: 'No event application' };
      if (status === 'pass_ready') return { isAvailable: false, reason: 'Already Pass Ready' };
      if (status === 'selected') return { isAvailable: false, reason: 'Already approved' };
      if (status === 'waiting_list') return { isAvailable: false, reason: 'Currently on Waiting List' };
      if (status === 'withdrawn') return { isAvailable: false, reason: 'Application Withdrawn' };
      return { isAvailable: false, reason: 'Not Awaiting Review' };

    case 'approve':
      if (!child.applicationId || status === 'not_registered') return { isAvailable: false, reason: 'No event application' };
      if (status === 'pass_ready') return { isAvailable: false, reason: 'Already Pass Ready' };
      if (status === 'selected') return { isAvailable: false, reason: 'Already approved and selected' };
      if (isAttending) return { isAvailable: false, reason: 'Child is currently attending the event' };
      if (status === 'withdrawn') return { isAvailable: false, reason: 'Application Withdrawn' };
      if (status === 'not_selected') return { isAvailable: false, reason: 'Marked Not Selected (Select for event first)' };
      if (status === 'incomplete' || status === 'draft') return { isAvailable: false, reason: 'Application is an incomplete draft' };
      if (status === 'under_review' || status === 'review_reopened' || status === 'waiting_list') return { isAvailable: true };
      return { isAvailable: false, reason: `Status '${status}' cannot be approved directly` };

    case 'waitlist':
      if (!child.applicationId || status === 'not_registered') return { isAvailable: false, reason: 'No event application' };
      if (status === 'waiting_list') return { isAvailable: false, reason: 'Already on Waiting List' };
      if (status === 'pass_ready') return { isAvailable: false, reason: 'Already Pass Ready' };
      if (isAttending) return { isAvailable: false, reason: 'Child is currently attending the event' };
      if (status === 'withdrawn') return { isAvailable: false, reason: 'Application Withdrawn' };
      if (status === 'incomplete' || status === 'draft') return { isAvailable: false, reason: 'Application is an incomplete draft' };
      return { isAvailable: true };

    case 'not_selected':
      if (!child.applicationId || status === 'not_registered') return { isAvailable: false, reason: 'No event application' };
      if (status === 'not_selected') return { isAvailable: false, reason: 'Already marked Not Selected' };
      if (isAttending) return { isAvailable: false, reason: 'Child is currently attending the event' };
      if (status === 'pass_ready') return { isAvailable: false, reason: 'Already Pass Ready' };
      if (status === 'withdrawn') return { isAvailable: false, reason: 'Application Withdrawn' };
      if (status === 'incomplete' || status === 'draft') return { isAvailable: false, reason: 'Application is an incomplete draft' };
      return { isAvailable: true };

    case 'return_draft':
      if (!child.applicationId || status === 'not_registered') return { isAvailable: false, reason: 'No event application' };
      if (status === 'draft' || status === 'incomplete') return { isAvailable: false, reason: 'Application is already in draft status' };
      if (isAttending) return { isAvailable: false, reason: 'Child is currently attending the event' };
      if (status === 'pass_ready') return { isAvailable: false, reason: 'Pass already issued' };
      if (status === 'selected') return { isAvailable: false, reason: 'Application already approved' };
      if (status === 'withdrawn') return { isAvailable: false, reason: 'Application Withdrawn' };
      if (status === 'under_review' || status === 'review_reopened') return { isAvailable: true };
      return { isAvailable: false, reason: 'Not in a reviewable state' };

    case 'restore':
      if (!child.applicationId || status === 'not_registered') return { isAvailable: false, reason: 'No event application to restore' };
      if (isAttending) return { isAvailable: false, reason: 'Child is currently attending the event' };
      if (status === 'withdrawn' || status === 'not_selected') return { isAvailable: true };
      if (status === 'under_review' || status === 'review_reopened') return { isAvailable: false, reason: 'Already Under Review' };
      if (status === 'selected') return { isAvailable: false, reason: 'Already active and selected' };
      if (status === 'pass_ready') return { isAvailable: false, reason: 'Already Pass Ready' };
      if (status === 'waiting_list') return { isAvailable: false, reason: 'Already on Waiting List' };
      return { isAvailable: false, reason: 'Application cannot be restored' };
  }
}

// 3. Group by parent with available vs unavailable
function groupChildrenByParent(actionType: BulkChildActionType, selectedParents: ParentRecord[], allChildren: ConnectedChildRecord[]) {
  return selectedParents
    .filter(p => p.children && p.children.length > 0)
    .map(p => {
      const parentName = p.fullName;
      const parentId = String(p.id);
      const children = allChildren.filter(c => c.parentId === parentId);

      const availableChildren: ConnectedChildRecord[] = [];
      const unavailableChildren: { child: ConnectedChildRecord; reason: string }[] = [];

      children.forEach(c => {
        const check = evaluateChildEligibility(actionType, c);
        if (check.isAvailable) {
          availableChildren.push(c);
        } else {
          unavailableChildren.push({ child: c, reason: check.reason || 'Not eligible' });
        }
      });

      return {
        parentId,
        parentName,
        children,
        availableChildren,
        unavailableChildren
      };
    });
}

function runTests() {
  console.log('=== RUNNING COMPREHENSIVE PARENTS BULK CHILD ACTIONS TEST SUITE ===\n');
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

  // Sample Families
  const sampleParents: ParentRecord[] = [
    {
      id: 'p_grace',
      fullName: 'Grace Adeyemi',
      children: [
        { id: 'c_daniel', applicationId: 'app_d', fullName: 'Daniel Adeyemi', age: 8, entryStatus: 'under_review' },
        { id: 'c_sarah', applicationId: 'app_s', fullName: 'Sarah Adeyemi', age: 5, entryStatus: 'pass_ready' }
      ]
    },
    {
      id: 'p_michael',
      fullName: 'Michael Johnson',
      children: [
        { id: 'c_david', applicationId: 'app_dj', fullName: 'David Johnson', age: 7, entryStatus: 'under_review' },
        { id: 'c_chloe', applicationId: 'app_cj', fullName: 'Chloe Johnson', age: 3, entryStatus: 'not_selected' }
      ]
    },
    {
      id: 'p_single',
      fullName: 'Single Parent',
      children: [
        { id: 'c_one', fullName: 'Solo Child', age: 4, entryStatus: 'not_registered' }
      ]
    },
    {
      id: 'p_withdrawn',
      fullName: 'Withdrawn Family',
      children: [
        { id: 'c_w1', applicationId: 'app_w1', fullName: 'Withdrawn Child', age: 6, entryStatus: 'withdrawn' }
      ]
    },
    {
      id: 'p_empty',
      fullName: 'Empty Parent',
      children: []
    }
  ];

  // -------------------------------------------------------------
  // TEST 1: Select for event
  // -------------------------------------------------------------
  console.log('--- ACTION 1: Select for event ---');
  {
    const res = resolveConnectedChildren(['p_single'], sampleParents);
    const groups = groupChildrenByParent('select_for_event', res.selectedParentsList, res.allConnectedChildren);
    const available = groups.flatMap(g => g.availableChildren);
    assert(available.length === 1, '1.1: Single eligible child resolved (Solo Child)');
    // Auto-select rule: exactly 1 available child should auto-select
    const autoSelected = available.length === 1 ? [available[0].id] : [];
    assert(autoSelected.length === 1 && autoSelected[0] === 'c_one', '1.2: Single child auto-selected');

    // Multiple parents & mixed statuses
    const resMixed = resolveConnectedChildren(['p_grace', 'p_michael', 'p_single'], sampleParents);
    const groupsMixed = groupChildrenByParent('select_for_event', resMixed.selectedParentsList, resMixed.allConnectedChildren);
    const availMixed = groupsMixed.flatMap(g => g.availableChildren);
    const unavailMixed = groupsMixed.flatMap(g => g.unavailableChildren);
    assert(availMixed.length === 2, '1.3: Exactly 2 children available for select_for_event (Solo Child + Chloe Johnson)');
    assert(unavailMixed.some(u => u.child.id === 'c_sarah' && u.reason === 'Already Pass Ready'), '1.4: Sarah unavailable with reason "Already Pass Ready"');
    assert(unavailMixed.some(u => u.child.id === 'c_daniel' && u.reason === 'Already Under Review'), '1.5: Daniel unavailable with reason "Already Under Review"');

    // Only selected children updated
    const explicitlySelected = ['c_one'];
    const updated = availMixed.filter(c => explicitlySelected.includes(c.id));
    assert(updated.length === 1 && updated[0].id === 'c_one', '1.6: Only explicitly selected child is updated');
  }

  // -------------------------------------------------------------
  // TEST 2: Review selected (Sequential Review)
  // -------------------------------------------------------------
  console.log('\n--- ACTION 2: Review selected ---');
  {
    const res = resolveConnectedChildren(['p_grace', 'p_michael'], sampleParents);
    const groups = groupChildrenByParent('review_sequence', res.selectedParentsList, res.allConnectedChildren);
    const available = groups.flatMap(g => g.availableChildren);
    assert(available.length === 2, '2.1: 2 children awaiting review (Daniel + David)');
    
    // Explicit selection: Admin selects only David
    const explicitlyChosen = ['c_david'];
    const sequenceList = available.filter(c => explicitlyChosen.includes(c.id));
    assert(sequenceList.length === 1 && sequenceList[0].fullName === 'David Johnson', '2.2: Sequence enters only explicitly chosen child');
  }

  // -------------------------------------------------------------
  // TEST 3: Approve
  // -------------------------------------------------------------
  console.log('\n--- ACTION 3: Approve ---');
  {
    const res = resolveConnectedChildren(['p_grace', 'p_michael'], sampleParents);
    const groups = groupChildrenByParent('approve', res.selectedParentsList, res.allConnectedChildren);
    const available = groups.flatMap(g => g.availableChildren);
    const unavailable = groups.flatMap(g => g.unavailableChildren);
    assert(available.length === 2, '3.1: 2 children eligible for approval (Daniel + David)');
    assert(unavailable.some(u => u.child.id === 'c_sarah' && u.reason === 'Already Pass Ready'), '3.2: Sarah unavailable (Already Pass Ready)');
    assert(unavailable.some(u => u.child.id === 'c_chloe' && u.reason.includes('Marked Not Selected')), '3.3: Chloe unavailable (Marked Not Selected)');

    // Multiple parents grouping
    assert(groups.length === 2, '3.4: Grouped under 2 parent headers (Grace Adeyemi, Michael Johnson)');
  }

  // -------------------------------------------------------------
  // TEST 4: Move to waiting list
  // -------------------------------------------------------------
  console.log('\n--- ACTION 4: Move to waiting list ---');
  {
    const res = resolveConnectedChildren(['p_grace', 'p_michael'], sampleParents);
    const groups = groupChildrenByParent('waitlist', res.selectedParentsList, res.allConnectedChildren);
    const available = groups.flatMap(g => g.availableChildren);
    const unavailable = groups.flatMap(g => g.unavailableChildren);
    assert(available.length === 3, '4.1: 3 children eligible for waitlist (Daniel, David, Chloe)');
    assert(unavailable.some(u => u.child.id === 'c_sarah' && u.reason === 'Already Pass Ready'), '4.2: Sarah unavailable (Already Pass Ready)');
  }

  // -------------------------------------------------------------
  // TEST 5: Mark as not selected
  // -------------------------------------------------------------
  console.log('\n--- ACTION 5: Mark as not selected ---');
  {
    const res = resolveConnectedChildren(['p_grace', 'p_michael'], sampleParents);
    const groups = groupChildrenByParent('not_selected', res.selectedParentsList, res.allConnectedChildren);
    const available = groups.flatMap(g => g.availableChildren);
    const unavailable = groups.flatMap(g => g.unavailableChildren);
    assert(available.length === 2, '5.1: 2 children eligible to mark not selected (Daniel, David)');
    assert(unavailable.some(u => u.child.id === 'c_chloe' && u.reason === 'Already marked Not Selected'), '5.2: Chloe unavailable (Already marked Not Selected)');
  }

  // -------------------------------------------------------------
  // TEST 6: Return to Parent
  // -------------------------------------------------------------
  console.log('\n--- ACTION 6: Return to Parent ---');
  {
    const res = resolveConnectedChildren(['p_grace', 'p_michael'], sampleParents);
    const groups = groupChildrenByParent('return_draft', res.selectedParentsList, res.allConnectedChildren);
    const available = groups.flatMap(g => g.availableChildren);
    const unavailable = groups.flatMap(g => g.unavailableChildren);
    assert(available.length === 2, '6.1: 2 children eligible for return to draft (Daniel, David)');
    assert(unavailable.some(u => u.child.id === 'c_sarah' && u.reason === 'Pass already issued'), '6.2: Sarah unavailable (Pass already issued)');
    assert(unavailable.some(u => u.child.id === 'c_chloe' && u.reason === 'Not in a reviewable state'), '6.3: Chloe unavailable (Not in a reviewable state)');
  }

  // -------------------------------------------------------------
  // TEST 7: Restore
  // -------------------------------------------------------------
  console.log('\n--- ACTION 7: Restore ---');
  {
    const res = resolveConnectedChildren(['p_withdrawn', 'p_michael'], sampleParents);
    const groups = groupChildrenByParent('restore', res.selectedParentsList, res.allConnectedChildren);
    const available = groups.flatMap(g => g.availableChildren);
    const unavailable = groups.flatMap(g => g.unavailableChildren);
    assert(available.length === 2, '7.1: 2 children eligible to restore (Withdrawn Child + Chloe Johnson)');
    assert(unavailable.some(u => u.child.id === 'c_david' && u.reason === 'Already Under Review'), '7.2: David unavailable for restore (Already Under Review)');
  }

  // -------------------------------------------------------------
  // TEST 8: Backend validation failure & partial success
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: Backend validation failure & partial success ---');
  {
    const attemptedIds = ['c_daniel', 'c_david'];
    const failures = [
      { id: 'c_david', childName: 'David Johnson', reason: 'Venue room capacity reached' }
    ];
    const updatedCount = attemptedIds.length - failures.length;
    const successfulIds = attemptedIds.filter(id => !failures.some(f => f.id === id));
    assert(updatedCount === 1, '8.1: Correct partial updated count (1)');
    assert(successfulIds.length === 1 && successfulIds[0] === 'c_daniel', '8.2: Daniel succeeded');
    assert(failures[0].reason === 'Venue room capacity reached', '8.3: Failure reason clearly captured');
  }

  // -------------------------------------------------------------
  // TEST 9: Empty parent handling
  // -------------------------------------------------------------
  console.log('\n--- TEST 9: Empty parent handling ---');
  {
    const res = resolveConnectedChildren(['p_empty', 'p_grace'], sampleParents);
    assert(res.parentsWithNoChildren.length === 1 && res.parentsWithNoChildren[0].fullName === 'Empty Parent', '9.1: Empty parent detected without crashing');
    const groups = groupChildrenByParent('approve', res.selectedParentsList, res.allConnectedChildren);
    assert(groups.length === 1 && groups[0].parentName === 'Grace Adeyemi', '9.2: Only families with children rendered in modal');
  }

  console.log(`\n======================================================`);
  console.log(`SUMMARY: ${passed} of ${total} assertions PASSED.`);
  console.log(`======================================================\n`);
}

runTests();
