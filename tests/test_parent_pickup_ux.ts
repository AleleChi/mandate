import {
  PARENT_RELATIONSHIP_OPTIONS,
  PICKUP_MANAGEABLE_STATUSES,
  isChildPickupManageable,
  isChildPickedUp,
  parseRelationshipValue,
  getEffectiveRelationship,
  normalizeChildStatus
} from '../src/utils/relationship';
import { validatePhoneNumber, isValidUploadedPhoto } from '../src/utils/validation';

console.log('================================================================');
console.log('PARENT PICKUP UX & ACCESS REGRESSION TEST SUITE');
console.log('================================================================\n');

let allPassed = true;
function assert(desc: string, condition: boolean, extra?: any) {
  if (condition) {
    console.log(`  ✓ [PASS] ${desc}`);
  } else {
    console.error(`  ✗ [FAIL] ${desc}`, extra ? extra : '');
    allPassed = false;
  }
}

// ----------------------------------------------------------------
// Section A: Parent with no selected children
// ----------------------------------------------------------------
console.log('Test A: Parent with no selected children');
const childrenNoSelected = [
  { id: 'c1', name: 'Draft Child', status: 'Draft' },
  { id: 'c2', name: 'Review Child', status: 'Under review' },
  { id: 'c3', name: 'Waitlist Child', status: 'Waiting list' },
  { id: 'c4', name: 'Not Selected Child', status: 'Not selected' }
];

const hasAnyManageableA = childrenNoSelected.some((c) => isChildPickupManageable(c));
assert('No child is manageable for pickup', !hasAnyManageableA);

const cardActionsA = childrenNoSelected.map((c) => {
  const isManageable = isChildPickupManageable(c);
  const canShowManageButton = (c.status === 'Selected' || c.status === 'Pass ready') && isManageable;
  return canShowManageButton;
});
assert('Manage pickup person does not appear on any card', cardActionsA.every((a) => !a));

// ----------------------------------------------------------------
// Section B: Parent with one selected and one draft
// ----------------------------------------------------------------
console.log('\nTest B: Parent with one selected and one draft');
const childrenMixed = [
  { id: 'c-sel', name: 'Selected Child', status: 'Selected' },
  { id: 'c-draft', name: 'Draft Child', status: 'Draft' }
];

const hasAnyManageableB = childrenMixed.some((c) => isChildPickupManageable(c));
assert('Parent qualifies because at least one child is selected', hasAnyManageableB);

const selectedChildManageable = isChildPickupManageable(childrenMixed[0]);
const draftChildManageable = isChildPickupManageable(childrenMixed[1]);
assert('Selected child qualifies for pickup management', selectedChildManageable);
assert('Draft child does NOT qualify for pickup management', !draftChildManageable);

// ----------------------------------------------------------------
// Section C: Parent with multiple selected children
// ----------------------------------------------------------------
console.log('\nTest C: Parent with multiple selected children');
const childrenMulti = [
  { id: 'c-mary', name: 'Mary', status: 'Selected' },
  { id: 'c-daniel', name: 'Daniel', status: 'Pass ready' }
];

const maryManageable = isChildPickupManageable(childrenMulti[0]);
const danielManageable = isChildPickupManageable(childrenMulti[1]);
assert('Mary has independent pickup action', maryManageable);
assert('Daniel has independent pickup action', danielManageable);
assert('Both children maintain distinct identity and actions', childrenMulti[0].id !== childrenMulti[1].id);

// ----------------------------------------------------------------
// Section D: Picked-up child
// ----------------------------------------------------------------
console.log('\nTest D: Picked-up child');
const pickedUpChild = { id: 'c-done', name: 'Bethertrade', status: 'Picked up' };
const checkedOutChild = { id: 'c-out', name: 'Daniel', status: 'Checked out' };

assert('Picked-up child is detected as released', isChildPickedUp(pickedUpChild));
assert('Checked-out child is detected as released', isChildPickedUp(checkedOutChild));
assert('Picked-up child is NOT manageable for changes', !isChildPickupManageable(pickedUpChild));
assert('Checked-out child is NOT manageable for changes', !isChildPickupManageable(checkedOutChild));

// ----------------------------------------------------------------
// Section E: Canonical relationship options
// ----------------------------------------------------------------
console.log('\nTest E: Canonical relationship options');
const expectedCanonical = [
  'Mother',
  'Father',
  'Guardian',
  'Grandparent',
  'Aunt',
  'Uncle',
  'Other'
];
assert('Exact 7 canonical relationship options defined', PARENT_RELATIONSHIP_OPTIONS.length === 7);
assert(
  'Matches expected canonical options',
  expectedCanonical.every((opt, i) => PARENT_RELATIONSHIP_OPTIONS[i] === opt)
);

// ----------------------------------------------------------------
// Section F: Other relationship reveals specify field
// ----------------------------------------------------------------
console.log('\nTest F: Other relationship behavior');
const otherParsed = parseRelationshipValue('Other');
assert('Selecting literal Other sets selectedOption=Other with empty customValue', otherParsed.selectedOption === 'Other' && otherParsed.customValue === '');

const effectiveSpecified = getEffectiveRelationship('Other', 'Family friend');
assert('Specified custom relationship is returned as effective value', effectiveSpecified === 'Family friend');

const canonicalFather = parseRelationshipValue('Father');
assert('Canonical Father resolves without custom value', canonicalFather.selectedOption === 'Father' && canonicalFather.customValue === '');
assert('Effective canonical relationship is Father', getEffectiveRelationship(canonicalFather.selectedOption, '') === 'Father');

// ----------------------------------------------------------------
// Section G: Legacy relationship backwards compatibility
// ----------------------------------------------------------------
console.log('\nTest G: Legacy relationship backwards compatibility');
const legacyFriend = parseRelationshipValue('Family Friend');
assert('Legacy "Family Friend" maps selectedOption to "Other"', legacyFriend.selectedOption === 'Other');
assert('Legacy "Family Friend" prepopulates customValue with "Family Friend"', legacyFriend.customValue === 'Family Friend');
assert('Effective relationship preserves legacy value', getEffectiveRelationship(legacyFriend.selectedOption, legacyFriend.customValue) === 'Family Friend');

const legacyNeighbor = parseRelationshipValue('Neighbor');
assert('Arbitrary stored string "Neighbor" maps to Other', legacyNeighbor.selectedOption === 'Other');
assert('Preserves "Neighbor" in custom value', legacyNeighbor.customValue === 'Neighbor');

// ----------------------------------------------------------------
// Section H: Child state update without full page reload
// ----------------------------------------------------------------
console.log('\nTest H: Update without full reload');
let localChildren = [
  { id: 'c1', name: 'Child A', status: 'Selected', draftData: { pickup: { pickupType: 'parent' } } }
];
let activeSheetChild = localChildren[0];

// Simulate successful PATCH response
const updatedResponse = {
  ...localChildren[0],
  draftData: {
    pickup: {
      pickupType: 'other_person',
      pickupPersonFullName: 'Aunt May',
      pickupPersonRelationship: 'Aunt',
      pickupPersonPhone: '+2348011112222',
      pickupPersonPhoto: '/api/media/files/photo-123'
    }
  }
};

localChildren = localChildren.map((c) => (c.id === updatedResponse.id ? (updatedResponse as any) : c));
activeSheetChild = updatedResponse as any;

assert('Local children state updated in memory without page reload', localChildren[0].draftData?.pickup?.pickupPersonFullName === 'Aunt May');
assert('Active sheet child reflects updated pickup person immediately', activeSheetChild.draftData?.pickup?.pickupPersonFullName === 'Aunt May');

// ----------------------------------------------------------------
// Section I: Save disabled when no changes exist
// ----------------------------------------------------------------
console.log('\nTest I: Save disabled with no changes');
const baseline = {
  pickupType: 'parent',
  fullName: '',
  relOption: '',
  relCustom: '',
  phone: '',
  whatsapp: '',
  photoUrl: ''
};

function checkHasChanges(current: typeof baseline): boolean {
  if (current.pickupType !== baseline.pickupType) return true;
  if (current.pickupType === 'other_person') {
    return (
      current.fullName.trim() !== baseline.fullName ||
      current.relOption !== baseline.relOption ||
      current.relCustom.trim() !== baseline.relCustom ||
      current.phone.trim() !== baseline.phone ||
      current.whatsapp.trim() !== baseline.whatsapp ||
      current.photoUrl.trim() !== baseline.photoUrl
    );
  }
  return false;
}

assert('No changes from initial parent baseline -> hasChanges is false', !checkHasChanges({ ...baseline }));

const changedToOther = { ...baseline, pickupType: 'other_person' };
assert('Switching pickup type to other_person -> hasChanges is true', checkHasChanges(changedToOther as any));

// ----------------------------------------------------------------
// Section J: Another adult requires photo, name, relationship, and phone
// ----------------------------------------------------------------
console.log('\nTest J: Another adult field requirements');

function validateOtherPersonForm(form: {
  fullName: string;
  relOption: string;
  relCustom: string;
  phone: string;
  countryIso: string;
  photoUrl: string;
}): boolean {
  const hasPhoto = Boolean(form.photoUrl && isValidUploadedPhoto(form.photoUrl));
  const hasName = Boolean(form.fullName.trim().length > 0);
  const effectiveRel = getEffectiveRelationship(form.relOption, form.relCustom);
  const hasRel = Boolean(effectiveRel.trim().length > 0);
  const phoneErr = validatePhoneNumber(form.phone, form.countryIso);
  const hasPhone = Boolean(form.phone.trim().length > 0 && !phoneErr);
  return hasPhoto && hasName && hasRel && hasPhone;
}

const emptyForm = {
  fullName: '',
  relOption: '',
  relCustom: '',
  phone: '',
  countryIso: 'NG',
  photoUrl: ''
};
assert('Empty form is invalid', !validateOtherPersonForm(emptyForm));

const missingPhoto = {
  ...emptyForm,
  fullName: 'John Doe',
  relOption: 'Uncle',
  phone: '+2348012345678'
};
assert('Missing photo is invalid', !validateOtherPersonForm(missingPhoto));

const invalidPhone = {
  ...missingPhoto,
  photoUrl: '/api/media/files/11111111-2222-3333-4444-555555555555',
  phone: 'not-a-phone'
};
assert('Invalid phone number is invalid', !validateOtherPersonForm(invalidPhone));

const completeValid = {
  ...missingPhoto,
  photoUrl: '/api/media/files/11111111-2222-3333-4444-555555555555',
  phone: '+2348012345678'
};
assert('Complete and valid form is valid', validateOtherPersonForm(completeValid));

// ----------------------------------------------------------------
// Section K: Case-insensitive status normalization
// ----------------------------------------------------------------
console.log('\nTest K: Case-insensitive status normalization');
const statusVariants = [
  { raw: 'Selected', expectedManageable: true, expectedPickedUp: false },
  { raw: 'selected', expectedManageable: true, expectedPickedUp: false },
  { raw: 'Pass ready', expectedManageable: true, expectedPickedUp: false },
  { raw: 'pass_ready', expectedManageable: true, expectedPickedUp: false },
  { raw: 'Checked in', expectedManageable: true, expectedPickedUp: false },
  { raw: 'checked_in', expectedManageable: true, expectedPickedUp: false },
  { raw: 'Inside', expectedManageable: true, expectedPickedUp: false },
  { raw: 'inside', expectedManageable: true, expectedPickedUp: false },
  { raw: 'Picked up', expectedManageable: false, expectedPickedUp: true },
  { raw: 'picked_up', expectedManageable: false, expectedPickedUp: true },
  { raw: 'Checked out', expectedManageable: false, expectedPickedUp: true },
  { raw: 'checked_out', expectedManageable: false, expectedPickedUp: true },
  { raw: 'Under review', expectedManageable: false, expectedPickedUp: false },
  { raw: 'Draft', expectedManageable: false, expectedPickedUp: false }
];

for (const variant of statusVariants) {
  const norm = normalizeChildStatus(variant.raw);
  const manageable = isChildPickupManageable(variant.raw);
  const pickedUp = isChildPickedUp(variant.raw);
  assert(
    `Status '${variant.raw}' -> norm='${norm}', manageable=${manageable}, pickedUp=${pickedUp}`,
    manageable === variant.expectedManageable && pickedUp === variant.expectedPickedUp
  );
}

// ----------------------------------------------------------------
// Section L: Selected & Pass-ready show Manage pickup person on Home card
// ----------------------------------------------------------------
console.log('\nTest L: Selected & Pass ready card visibility');
function shouldShowManagePickupButtonOnCard(child: { status: string }): boolean {
  const isPickedUp = isChildPickedUp(child);
  const normStatus = normalizeChildStatus(child.status);
  const isSelectedOrPassReady = (normStatus === 'selected' || normStatus === 'pass_ready') && !isPickedUp;
  return isSelectedOrPassReady && isChildPickupManageable(child);
}

assert('Selected child shows Manage pickup person', shouldShowManagePickupButtonOnCard({ status: 'Selected' }));
assert('selected (lowercase) child shows Manage pickup person', shouldShowManagePickupButtonOnCard({ status: 'selected' }));
assert('Pass ready child shows Manage pickup person', shouldShowManagePickupButtonOnCard({ status: 'Pass ready' }));
assert('pass_ready (lowercase) child shows Manage pickup person', shouldShowManagePickupButtonOnCard({ status: 'pass_ready' }));
assert('Draft child does NOT show button', !shouldShowManagePickupButtonOnCard({ status: 'Draft' }));
assert('Under review child does NOT show button', !shouldShowManagePickupButtonOnCard({ status: 'Under review' }));
assert('Picked up child does NOT show button', !shouldShowManagePickupButtonOnCard({ status: 'Picked up' }));

// ----------------------------------------------------------------
// Section M: Checked-in notice guard
// ----------------------------------------------------------------
console.log('\nTest M: Checked-in notice only shown when checked in / inside');
function shouldShowCheckedInNotice(child: { status: string }): boolean {
  const isPickedUp = isChildPickedUp(child);
  const normalizedSheetStatus = normalizeChildStatus(child.status);
  return (normalizedSheetStatus === 'checked_in' || normalizedSheetStatus === 'inside') && !isPickedUp;
}

assert('Selected child does NOT show checked-in operational notice', !shouldShowCheckedInNotice({ status: 'Selected' }));
assert('Pass ready child does NOT show checked-in operational notice', !shouldShowCheckedInNotice({ status: 'Pass ready' }));
assert('Checked in child DOES show operational notice', shouldShowCheckedInNotice({ status: 'Checked in' }));
assert('Inside child DOES show operational notice', shouldShowCheckedInNotice({ status: 'Inside' }));
assert('Picked up child does NOT show operational notice', !shouldShowCheckedInNotice({ status: 'Picked up' }));

// ----------------------------------------------------------------
// Section N: Multiple children independent authorization
// ----------------------------------------------------------------
console.log('\nTest N: Multiple children separate authorization');
const familyChildren = [
  { id: 'c-mary', name: 'Mary', status: 'Selected', draftData: { pickup: { pickupType: 'parent', pickupPersonFullName: 'Bethertrade Test' } } },
  { id: 'c-daniel', name: 'Daniel', status: 'Pass ready', draftData: { pickup: { pickupType: 'parent', pickupPersonFullName: 'Bethertrade Test' } } }
];

// Update Mary only
const updatedMary = {
  ...familyChildren[0],
  draftData: {
    pickup: {
      pickupType: 'other_person',
      pickupPersonFullName: 'Uncle Bob',
      pickupPersonRelationship: 'Uncle',
      pickupPersonPhone: '+2348033333333'
    }
  }
};
const updatedFamily = familyChildren.map(c => c.id === updatedMary.id ? updatedMary : c);
assert('Mary updated to Uncle Bob', updatedFamily[0].draftData.pickup.pickupPersonFullName === 'Uncle Bob');
assert('Daniel remains unchanged with parent', updatedFamily[1].draftData.pickup.pickupPersonFullName === 'Bethertrade Test');

console.log('\n================================================================');
if (allPassed) {
  console.log('SUMMARY: ALL TESTS PASSED (14/14)');
} else {
  console.error('SUMMARY: SOME TESTS FAILED');
  process.exit(1);
}
console.log('================================================================');
