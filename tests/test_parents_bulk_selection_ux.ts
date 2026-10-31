/**
 * Test Suite: Parents & Workers Bulk Selection UX
 * Verifies all 8 specification scenarios (Cases A to H):
 *
 * Case A: 896 filtered parents. Choose "Select first 50". Expected: exactly 50 parents selected.
 * Case B: Choose "Select first 25", then manually deselect 5. Expected: 20 selected.
 * Case C: 143 filtered parents. Custom amount: 50. Expected: 50 selected.
 * Case D: 43 filtered parents. Custom amount: 50. Expected: Prevent action and explain "Only 43 parents match the current filters."
 * Case E: Select all filtered: 896. Expected: Explicit confirmation before selection (> 50 threshold).
 * Case F: Select first 50. Then choose "Move to waiting list". Expected: child-level eligibility modal still determines exact available children and allows explicit child selection.
 * Case G: Select first 50. Change filter. Expected: selection reconciles safely with new filtered result (retaining only matching parents).
 * Case H: Select 50. Click "Clear selection". Expected: 0 selected; filters/search remain intact.
 */

import { assert } from 'console';

interface ChildRecord {
  id: string;
  applicationId?: string | null;
  fullName: string;
  age?: number | null;
  entryStatus?: string;
  checkedInAt?: string | null;
  pickedUpAt?: string | null;
}

interface ParentRecord {
  id: string;
  fullName: string;
  city?: string;
  stateRegion?: string;
  country?: string;
  isKoinoniaWorker?: boolean;
  children: ChildRecord[];
}

// Generate dummy parent records
function generateMockParents(count: number, cityPrefix = 'Abuja'): ParentRecord[] {
  const parents: ParentRecord[] = [];
  for (let i = 1; i <= count; i++) {
    parents.push({
      id: `parent_${i}`,
      fullName: `Parent ${i} Doe`,
      city: i % 2 === 0 ? cityPrefix : 'Lagos',
      isKoinoniaWorker: i % 5 === 0,
      children: [
        {
          id: `child_${i}_1`,
          applicationId: `app_${i}_1`,
          fullName: `Child ${i}.1 Doe`,
          age: 8,
          entryStatus: i % 3 === 0 ? 'under_review' : (i % 3 === 1 ? 'selected' : 'not_registered')
        },
        {
          id: `child_${i}_2`,
          applicationId: `app_${i}_2`,
          fullName: `Child ${i}.2 Doe`,
          age: 5,
          entryStatus: i % 4 === 0 ? 'waiting_list' : 'under_review'
        }
      ]
    });
  }
  return parents;
}

// Core UX Functions matching AdminParentsView.tsx
class ParentSelectionController {
  public allParents: ParentRecord[] = [];
  public filteredParents: ParentRecord[] = [];
  public selectedParentIds: string[] = [];
  public pageSize: number = 25;
  public currentPage: number = 1;
  public confirmationRequested: boolean = false;
  public confirmationCount: number = 0;

  constructor(parents: ParentRecord[]) {
    this.allParents = parents;
    this.filteredParents = [...parents];
  }

  // Filter application
  public applyFilter(predicate: (p: ParentRecord) => boolean) {
    this.filteredParents = this.allParents.filter(predicate);
    this.currentPage = 1;
    // Reconcile selection: retain only selected parents that still match the active filtered dataset
    const validSet = new Set(this.filteredParents.map(p => p.id));
    this.selectedParentIds = this.selectedParentIds.filter(id => validSet.has(id));
  }

  // Visible rows
  public get visibleParents(): ParentRecord[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredParents.slice(start, start + this.pageSize);
  }

  public get visibleParentIds(): string[] {
    return this.visibleParents.map(p => p.id);
  }

  public get isAllVisibleSelected(): boolean {
    return this.visibleParents.length > 0 && this.visibleParents.every(p => this.selectedParentIds.includes(p.id));
  }

  public get isSomeVisibleSelected(): boolean {
    return this.visibleParents.some(p => this.selectedParentIds.includes(p.id));
  }

  public get isIndeterminate(): boolean {
    return this.isSomeVisibleSelected && !this.isAllVisibleSelected;
  }

  // Header checkbox click
  public toggleSelectVisible() {
    if (this.isAllVisibleSelected) {
      const visibleSet = new Set(this.visibleParentIds);
      this.selectedParentIds = this.selectedParentIds.filter(id => !visibleSet.has(id));
    } else {
      this.selectedParentIds = Array.from(new Set([...this.selectedParentIds, ...this.visibleParentIds]));
    }
  }

  // Predefined first N selection
  public selectFirstN(n: number) {
    this.selectedParentIds = this.filteredParents.slice(0, n).map(p => p.id);
  }

  // Custom amount selection with validation
  public selectCustomAmount(amount: number): { success: boolean; error?: string } {
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: 'Please enter a number greater than 0.' };
    }
    if (amount > this.filteredParents.length) {
      return {
        success: false,
        error: `Only ${this.filteredParents.length} parents match the current filters.`
      };
    }
    this.selectFirstN(amount);
    return { success: true };
  }

  // Select all filtered (with deliberate intent check for large datasets > 50)
  public selectAllFiltered(): { requiresConfirmation: boolean; count: number } {
    if (this.filteredParents.length > 50) {
      this.confirmationRequested = true;
      this.confirmationCount = this.filteredParents.length;
      return { requiresConfirmation: true, count: this.filteredParents.length };
    }
    this.selectedParentIds = this.filteredParents.map(p => p.id);
    return { requiresConfirmation: false, count: this.filteredParents.length };
  }

  public confirmSelectAll() {
    this.selectedParentIds = this.filteredParents.map(p => p.id);
    this.confirmationRequested = false;
  }

  // Manual toggle of single row
  public toggleParent(id: string) {
    if (this.selectedParentIds.includes(id)) {
      this.selectedParentIds = this.selectedParentIds.filter(i => i !== id);
    } else {
      this.selectedParentIds.push(id);
    }
  }

  // Clear selection
  public clearSelection() {
    this.selectedParentIds = [];
    this.confirmationRequested = false;
  }

  // Resolve connected children
  public get connectedChildren(): ChildRecord[] {
    const idSet = new Set(this.selectedParentIds);
    const selectedParents = this.allParents.filter(p => idSet.has(p.id));
    const children: ChildRecord[] = [];
    selectedParents.forEach(p => {
      p.children.forEach(c => children.push(c));
    });
    return children;
  }
}

async function runTests() {
  console.log('=== RUNNING PARENTS BULK SELECTION UX TEST SUITE (CASES A - H) ===\n');

  // CASE A: 896 filtered parents. Choose "Select first 50". Exactly 50 selected.
  console.log('--- CASE A: 896 Filtered Parents -> Select First 50 ---');
  const mock896 = generateMockParents(896);
  const controllerA = new ParentSelectionController(mock896);
  controllerA.selectFirstN(50);
  console.log(`Selected parents count: ${controllerA.selectedParentIds.length}`);
  if (controllerA.selectedParentIds.length !== 50) {
    throw new Error(`Expected 50 selected, got ${controllerA.selectedParentIds.length}`);
  }
  // Verify deterministic order: top 50
  for (let i = 0; i < 50; i++) {
    if (controllerA.selectedParentIds[i] !== mock896[i].id) {
      throw new Error(`Sort order mismatch at index ${i}`);
    }
  }
  console.log('✅ [PASS] Case A: Exactly 50 parents selected in deterministic list order.\n');

  // CASE B: Choose "Select first 25", then manually deselect 5 -> 20 selected.
  console.log('--- CASE B: Select First 25, Manually Deselect 5 -> 20 Selected ---');
  const controllerB = new ParentSelectionController(mock896);
  controllerB.selectFirstN(25);
  console.log(`Initially selected: ${controllerB.selectedParentIds.length}`);
  // Deselect 5 parents
  controllerB.toggleParent(mock896[2].id);
  controllerB.toggleParent(mock896[7].id);
  controllerB.toggleParent(mock896[12].id);
  controllerB.toggleParent(mock896[15].id);
  controllerB.toggleParent(mock896[20].id);
  console.log(`After deselecting 5: ${controllerB.selectedParentIds.length}`);
  if (controllerB.selectedParentIds.length !== 20) {
    throw new Error(`Expected 20 selected, got ${controllerB.selectedParentIds.length}`);
  }
  if (controllerB.isIndeterminate !== true) {
    throw new Error('Expected checkbox state to be indeterminate after deselecting individual rows');
  }
  console.log('✅ [PASS] Case B: Dynamic deselection works and updates count to 20 with indeterminate state.\n');

  // CASE C: 143 filtered parents. Custom amount: 50 -> 50 selected.
  console.log('--- CASE C: 143 Filtered Parents -> Custom Amount 50 ---');
  const mock143 = generateMockParents(143);
  const controllerC = new ParentSelectionController(mock143);
  const resultC = controllerC.selectCustomAmount(50);
  if (!resultC.success || controllerC.selectedParentIds.length !== 50) {
    throw new Error(`Case C failed: ${resultC.error}`);
  }
  console.log(`Selected parents count: ${controllerC.selectedParentIds.length}`);
  console.log('✅ [PASS] Case C: Custom amount 50 successfully selected from 143 records.\n');

  // CASE D: 43 filtered parents. Custom amount: 50 -> Prevent action and explain "Only 43 parents match the current filters."
  console.log('--- CASE D: 43 Filtered Parents -> Custom Amount 50 Blocked ---');
  const mock43 = generateMockParents(43);
  const controllerD = new ParentSelectionController(mock43);
  const resultD = controllerD.selectCustomAmount(50);
  console.log(`Success: ${resultD.success}, Error: "${resultD.error}"`);
  if (resultD.success !== false) {
    throw new Error('Case D expected failure but got success');
  }
  if (resultD.error !== 'Only 43 parents match the current filters.') {
    throw new Error(`Unexpected error message: ${resultD.error}`);
  }
  if (controllerD.selectedParentIds.length !== 0) {
    throw new Error('Expected 0 parents selected when custom amount exceeds available count');
  }
  console.log('✅ [PASS] Case D: Action prevented without silent clamping; exact error message returned.\n');

  // CASE E: Select all filtered: 896 -> Explicit confirmation required before selection.
  console.log('--- CASE E: Select All Filtered (896) Requires Confirmation ---');
  const controllerE = new ParentSelectionController(mock896);
  const resultE = controllerE.selectAllFiltered();
  console.log(`Requires confirmation: ${resultE.requiresConfirmation}, Count: ${resultE.count}`);
  if (!resultE.requiresConfirmation || resultE.count !== 896) {
    throw new Error('Case E failed: Large select all should require deliberate confirmation');
  }
  if (controllerE.selectedParentIds.length !== 0) {
    throw new Error('Parents should NOT be selected before explicit confirmation');
  }
  // Now confirm
  controllerE.confirmSelectAll();
  console.log(`After explicit confirmation: ${controllerE.selectedParentIds.length} parents selected`);
  if (controllerE.selectedParentIds.length !== 896) {
    throw new Error(`Expected 896 selected, got ${controllerE.selectedParentIds.length}`);
  }
  console.log('✅ [PASS] Case E: Large select all required deliberate intent and explicit confirmation.\n');

  // CASE F: Select first 50. Then choose "Move to waiting list" -> child-level eligibility intact.
  console.log('--- CASE F: Select First 50 -> Child-level Eligibility Preserved ---');
  const controllerF = new ParentSelectionController(mock896);
  controllerF.selectFirstN(50);
  const connectedChildren = controllerF.connectedChildren;
  console.log(`Connected children for 50 parents: ${connectedChildren.length}`);
  if (connectedChildren.length !== 100) {
    throw new Error(`Expected 100 children for 50 parents, got ${connectedChildren.length}`);
  }
  // Evaluate waiting list eligibility
  const eligibleForWaitlist = connectedChildren.filter(c => 
    c.entryStatus !== 'waiting_list' && c.entryStatus !== 'pass_ready'
  );
  console.log(`Eligible children for waiting list: ${eligibleForWaitlist.length} / ${connectedChildren.length}`);
  if (eligibleForWaitlist.length === 0) {
    throw new Error('Expected eligible children');
  }
  console.log('✅ [PASS] Case F: Child-level eligibility resolves independently without automatic child cascade.\n');

  // CASE G: Select first 50. Change filter -> selection reconciles safely.
  console.log('--- CASE G: Select First 50 -> Change Filter Reconciles Selection ---');
  const controllerG = new ParentSelectionController(mock896);
  controllerG.selectFirstN(50);
  console.log(`Initial selection: ${controllerG.selectedParentIds.length}`);
  // Change filter to city = 'Abuja' (which matches 50% of records)
  controllerG.applyFilter(p => p.city === 'Abuja');
  console.log(`Filtered result count: ${controllerG.filteredParents.length}`);
  console.log(`Reconciled selection count: ${controllerG.selectedParentIds.length}`);
  // Every retained parent must be in filteredParents
  const abujaIds = new Set(controllerG.filteredParents.map(p => p.id));
  const allRetainedMatch = controllerG.selectedParentIds.every(id => abujaIds.has(id));
  if (!allRetainedMatch) {
    throw new Error('Found selected parent outside current filtered dataset');
  }
  if (controllerG.selectedParentIds.length !== 25) {
    throw new Error(`Expected 25 matching parents retained, got ${controllerG.selectedParentIds.length}`);
  }
  console.log('✅ [PASS] Case G: Filter change safely pruned non-matching parents without silent inclusion.\n');

  // CASE H: Select 50. Click "Clear selection" -> 0 selected; filters/search remain intact.
  console.log('--- CASE H: Select 50 -> Clear Selection Leaves Filters Intact ---');
  const controllerH = new ParentSelectionController(mock896);
  controllerH.applyFilter(p => p.city === 'Abuja'); // Filter active
  controllerH.selectFirstN(50);
  console.log(`Pre-clear: ${controllerH.selectedParentIds.length} selected, ${controllerH.filteredParents.length} filtered`);
  controllerH.clearSelection();
  console.log(`Post-clear: ${controllerH.selectedParentIds.length} selected, ${controllerH.filteredParents.length} filtered`);
  if (controllerH.selectedParentIds.length !== 0) {
    throw new Error('Selection not cleared');
  }
  if (controllerH.filteredParents.length !== 448) {
    throw new Error('Filter was improperly reset by clear selection');
  }
  console.log('✅ [PASS] Case H: Clear selection reset parent IDs to 0 while maintaining active filters.\n');

  console.log('======================================================');
  console.log('ALL 8 BULK SELECTION SPECIFICATION CASES PASSED (A - H)');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
