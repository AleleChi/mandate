import assert from 'assert';
import { getDb } from '../src/server/db';
import { compileReportSnapshot } from '../src/server/services/reportService';
import { compileReportDocument } from '../src/server/reports/reportTemplateRegistry';
import { renderDocumentToPDF } from '../src/server/reports/reportRenderer';
import { calculateAnalytics } from '../src/server/services/reportAnalyticsService';
import { 
  classifyChildHealth, 
  isParentProfileComplete, 
  isChildRecordComplete,
  buildChildrenRegistrationReport
} from '../src/server/reports/templates/childrenRegistrationReport';
import { calculateAgeOnDate, checkEventEligibility } from '../src/server/services/eligibilityService';

async function runTests() {
  console.log('=== STARTING CHILDREN & REGISTRATION REPORT CONSISTENCY TESTS ===\n');

  // Initialize DB
  getDb();

  // Test 1: Unit tests for Focused Test Cases (Section 24)
  console.log('--- TEST SET 1: FOCUSED AGE ELIGIBILITY & COHORT TESTS ---');
  const eventDate = '2026-11-21';

  // Age calculation and cohort verification on 2026-11-21:
  // Age 2: born 2024-11-21
  const age2 = calculateAgeOnDate('2024-11-21', eventDate);
  assert.strictEqual(age2, 2, 'Age 2 child must calculate as 2');
  const el2 = checkEventEligibility('2024-11-21', { starts_at: eventDate, minimum_age: 2, maximum_age: 12 });
  assert.strictEqual(el2.eligible, true, 'Age 2 must be eligible');

  // Age 3: born 2023-11-21
  const age3 = calculateAgeOnDate('2023-11-21', eventDate);
  assert.strictEqual(age3, 3, 'Age 3 child must calculate as 3');
  const el3 = checkEventEligibility('2023-11-21', { starts_at: eventDate, minimum_age: 2, maximum_age: 12 });
  assert.strictEqual(el3.eligible, true, 'Age 3 must be eligible');

  // Age 4: born 2022-11-21
  const age4 = calculateAgeOnDate('2022-11-21', eventDate);
  assert.strictEqual(age4, 4, 'Age 4 child must calculate as 4');

  // Age 6: born 2020-11-21
  const age6 = calculateAgeOnDate('2020-11-21', eventDate);
  assert.strictEqual(age6, 6, 'Age 6 child must calculate as 6');

  // Age 7: born 2019-11-21
  const age7 = calculateAgeOnDate('2019-11-21', eventDate);
  assert.strictEqual(age7, 7, 'Age 7 child must calculate as 7');

  // Age 9: born 2017-11-21
  const age9 = calculateAgeOnDate('2017-11-21', eventDate);
  assert.strictEqual(age9, 9, 'Age 9 child must calculate as 9');

  // Age 10: born 2016-11-21
  const age10 = calculateAgeOnDate('2016-11-21', eventDate);
  assert.strictEqual(age10, 10, 'Age 10 child must calculate as 10');

  // Age 12: born 2014-11-21
  const age12 = calculateAgeOnDate('2014-11-21', eventDate);
  assert.strictEqual(age12, 12, 'Age 12 child must calculate as 12');
  const el12 = checkEventEligibility('2014-11-21', { starts_at: eventDate, minimum_age: 2, maximum_age: 12 });
  assert.strictEqual(el12.eligible, true, 'Age 12 must be eligible');

  // Below age range: age 1 (born 2025-11-21)
  const age1 = calculateAgeOnDate('2025-11-21', eventDate);
  assert.strictEqual(age1, 1, 'Age 1 child must calculate as 1');
  const el1 = checkEventEligibility('2025-11-21', { starts_at: eventDate, minimum_age: 2, maximum_age: 12 });
  assert.strictEqual(el1.eligible, false, 'Age 1 must be ineligible');
  assert.strictEqual(el1.code, 'BELOW_MINIMUM_AGE', 'Code must be BELOW_MINIMUM_AGE');

  // Above age range: age 13 (born 2013-11-21)
  const age13 = calculateAgeOnDate('2013-11-21', eventDate);
  assert.strictEqual(age13, 13, 'Age 13 child must calculate as 13');
  const el13 = checkEventEligibility('2013-11-21', { starts_at: eventDate, minimum_age: 2, maximum_age: 12 });
  assert.strictEqual(el13.eligible, false, 'Age 13 must be ineligible');
  assert.strictEqual(el13.code, 'ABOVE_MAXIMUM_AGE', 'Code must be ABOVE_MAXIMUM_AGE');

  console.log('✓ Age boundary test cases (2, 3, 4, 6, 7, 9, 10, 12, below, above) passed successfully.');

  // Test 2: Health Classification Tests (Section 24)
  console.log('\n--- TEST SET 2: HEALTH CLASSIFICATION CASES ---');
  const hNeither = classifyChildHealth(0, null);
  assert.strictEqual(hNeither.healthFlag, 'None');
  assert.strictEqual(hNeither.hasEither, false);

  const hAllergyOnly = classifyChildHealth(1, 'Severe peanut allergy');
  assert.strictEqual(hAllergyOnly.healthFlag, 'Allergy');
  assert.strictEqual(hAllergyOnly.hasAllergy, true);
  assert.strictEqual(hAllergyOnly.hasMedicalNote, false);
  assert.strictEqual(hAllergyOnly.hasBoth, false);

  const hMedicalOnly = classifyChildHealth(1, 'Mild asthma, uses blue inhaler before sports');
  assert.strictEqual(hMedicalOnly.healthFlag, 'Medical note');
  assert.strictEqual(hMedicalOnly.hasAllergy, false);
  assert.strictEqual(hMedicalOnly.hasMedicalNote, true);
  assert.strictEqual(hMedicalOnly.hasBoth, false);

  const hBoth = classifyChildHealth(1, 'Peanut allergy; carries inhaler for asthma');
  assert.strictEqual(hBoth.healthFlag, 'Allergy + medical note');
  assert.strictEqual(hBoth.hasAllergy, true);
  assert.strictEqual(hBoth.hasMedicalNote, true);
  assert.strictEqual(hBoth.hasBoth, true);
  assert.strictEqual(hBoth.hasEither, true);

  console.log('✓ Health classification test cases (Allergy only, Medical only, Both, Neither) passed successfully.');

  // Test 3: Parent & Child Validity Predicates (Section 24)
  console.log('\n--- TEST SET 3: PARENT & CHILD VALIDITY PREDICATES ---');
  const validParentSample = {
    full_name: 'Grace Test Parent',
    phone_number: '+2348012345678',
    email: 'parent@example.ng',
    home_address: '14 Unity Road, Ikeja',
    country: 'Nigeria',
    state_region: 'Lagos',
    city: 'Ikeja',
    photo_file_id: 'rec_parent_photo_123',
    is_koinonia_worker: 0
  };
  assert.strictEqual(isParentProfileComplete(validParentSample), true, 'Complete parent profile must be valid');

  const incompleteParentSample = {
    full_name: 'Incomplete Parent',
    phone_number: '',
    email: 'incomplete@test.com',
    photo_file_id: null
  };
  assert.strictEqual(isParentProfileComplete(incompleteParentSample), false, 'Incomplete parent profile must be invalid');

  const validChildSample = {
    full_name: 'Timothy Adeyemi',
    gender: 'Male',
    date_of_birth: '2019-04-12',
    child_photo_file_id: 'photo_timothy_456',
    parent_profile_id: 'prof_parent_123'
  };
  assert.strictEqual(isChildRecordComplete(validChildSample), true, 'Complete child record must be valid');

  const incompleteChildSample = {
    full_name: '',
    gender: 'Unknown',
    date_of_birth: '',
    child_photo_file_id: null,
    parent_profile_id: null
  };
  assert.strictEqual(isChildRecordComplete(incompleteChildSample), false, 'Incomplete child record must be invalid');

  console.log('✓ Parent and child profile validity predicates passed successfully.');

  // Test 4: Live Snapshot Compilation & Full Document Model Test (Section 23 & 25)
  console.log('\n--- TEST SET 4: LIVE REPORT SNAPSHOT & CONSISTENCY ASSERTIONS ---');
  const startTime = performance.now();
  const snapshot = await compileReportSnapshot(
    'event-ga-2026',
    null,
    'children-registration-report',
    'admin-user-id',
    'admin',
    'Safeguarding restricted',
    {}
  );
  const snapshotDuration = performance.now() - startTime;
  console.log(`✓ Snapshot compilation completed in ${snapshotDuration.toFixed(2)}ms.`);

  assert.ok(snapshot.childrenRegistrationData, 'Snapshot must contain childrenRegistrationData');
  const childrenCount = snapshot.childrenRegistrationData.children.length;
  const parentsCount = snapshot.childrenRegistrationData.parents.length;
  console.log(`✓ Fetched ${childrenCount} child records and ${parentsCount} parent accounts.`);

  const analytics = calculateAnalytics(snapshot);
  const docStartTime = performance.now();
  const doc = compileReportDocument(
    'test-report-job-1',
    snapshot,
    analytics,
    'children-registration-report',
    'Safeguarding restricted'
  );
  const docDuration = performance.now() - docStartTime;
  console.log(`✓ Document model compiled in ${docDuration.toFixed(2)}ms.`);

  // Verify consistency assertions (Section 23)
  console.log('\n--- VERIFYING RECONCILIATION & CONSISTENCY ASSERTIONS ---');
  const kpiMap = new Map<string, number>();
  doc.kpis.forEach(k => {
    kpiMap.set(k.label, Number(k.value));
  });

  const totalChild = kpiMap.get('TOTAL CHILD RECORDS')!;
  const validChild = kpiMap.get('VALID CHILD RECORDS')!;
  const ageEligible = kpiMap.get('AGE ELIGIBLE')!;
  const ageIneligible = kpiMap.get('AGE INELIGIBLE')!;
  const pendingSubmission = kpiMap.get('ELIGIBLE — PENDING SUBMISSION')!;
  const underReview = kpiMap.get('UNDER REVIEW')!;
  const approved = kpiMap.get('APPROVED')!;
  const rejected = kpiMap.get('REJECTED')!;
  const validParents = kpiMap.get('VALID PARENTS')!;

  console.log(`Total children: ${totalChild}`);
  console.log(`Valid children: ${validChild}`);
  console.log(`Age eligible: ${ageEligible}`);
  console.log(`Age ineligible: ${ageIneligible}`);
  console.log(`Eligible pending submission: ${pendingSubmission}`);
  console.log(`Under review: ${underReview}`);
  console.log(`Approved: ${approved}`);
  console.log(`Rejected: ${rejected}`);
  console.log(`Valid parents: ${validParents}`);

  // Assertion 1: total eligible + total ineligible = children with determinable age eligibility
  assert.strictEqual(
    ageEligible + ageIneligible,
    totalChild,
    'Assertion Failed: ageEligible + ageIneligible must equal totalChild'
  );
  console.log('✓ Assertion 1 passed: total eligible + total ineligible = total child records');

  // Assertion 2: pending + under_review + approved + rejected = age eligible
  assert.strictEqual(
    pendingSubmission + underReview + approved + rejected,
    ageEligible,
    'Assertion Failed: sum of eligible lifecycle states must equal total age eligible'
  );
  console.log('✓ Assertion 2 passed: pending submission + under review + approved + rejected = total age eligible');

  // Assertion 3: Age cohort totals reconcile with eligible distribution
  const cohortSec = doc.sections.find(s => s.id === 'sec-age-cohort-table');
  assert.ok(cohortSec, 'Cohort breakdown table section must exist');
  const cohortRows = (cohortSec as any).content.rows;
  const cohortTotalRow = cohortRows[cohortRows.length - 1];
  const cohortSumTotal = Number(cohortTotalRow[1]);
  assert.strictEqual(cohortSumTotal, ageEligible, 'Cohort sum total must reconcile with ageEligible');
  
  // Verify all 4 cohorts exist in rows
  const cohortNames = cohortRows.slice(0, 4).map((r: any) => r[0]);
  assert.ok(cohortNames.some((c: string) => c.includes('2–3')), 'Cohort 2–3 must be present');
  assert.ok(cohortNames.some((c: string) => c.includes('4–6')), 'Cohort 4–6 must be present');
  assert.ok(cohortNames.some((c: string) => c.includes('7–9')), 'Cohort 7–9 must be present');
  assert.ok(cohortNames.some((c: string) => c.includes('10–12')), 'Cohort 10–12 must be present');
  console.log('✓ Assertion 3 passed: all 4 cohorts (2–3, 4–6, 7–9, 10–12) present and reconcile with eligible count');

  // Assertion 4: Location reconciliation
  const countrySec = doc.sections.find(s => s.id === 'sec-registration-origin-country');
  assert.ok(countrySec, 'Country breakdown section must exist');
  const countryRows = (countrySec as any).content.rows;
  const countrySum = countryRows.reduce((acc: number, r: any) => acc + Number(r[1]), 0);
  assert.strictEqual(countrySum, totalChild, 'Country child count sum must equal total child records');

  const stateSec = doc.sections.find(s => s.id === 'sec-registration-origin-state');
  assert.ok(stateSec, 'State breakdown section must exist');
  const stateRows = (stateSec as any).content.rows;
  const stateSum = stateRows.reduce((acc: number, r: any) => acc + Number(r[1]), 0);
  assert.strictEqual(stateSum, totalChild, 'State child count sum must equal total child records');

  const citySec = doc.sections.find(s => s.id === 'sec-registration-origin-city');
  assert.ok(citySec, 'City breakdown section must exist');
  const cityRows = (citySec as any).content.rows;
  const citySum = cityRows.reduce((acc: number, r: any) => acc + Number(r[3]), 0);
  assert.strictEqual(citySum, totalChild, 'City child count sum must equal total child records');
  console.log('✓ Assertion 4 passed: Country, State, and City sums reconcile with total children');

  // Assertion 5: Report Title Verification
  assert.strictEqual(doc.reportTitle, 'The General Assembly — Children & Registration Report');
  console.log('✓ Assertion 5 passed: reportTitle is "The General Assembly — Children & Registration Report"');

  // Assertion 6: Sections existence
  const expectedSectionIds = [
    'sec-executive-summary',
    'sec-registration-status',
    'sec-age-distribution',
    'sec-age-cohort-table',
    'sec-age-single-year-table',
    'sec-age-eligibility',
    'sec-eligible-pending',
    'sec-registration-origin-country',
    'sec-registration-origin-state',
    'sec-registration-origin-city',
    'sec-registration-origin-chart',
    'sec-data-quality',
    'sec-health-summary',
    'sec-health-detail-register',
    'sec-child-register'
  ];
  expectedSectionIds.forEach(id => {
    const sec = doc.sections.find(s => s.id === id);
    assert.ok(sec, `Required section ${id} must exist in document model`);
  });

  // Verify single-year table sum reconciles with eligibleCount
  const singleYearSec = doc.sections.find(s => s.id === 'sec-age-single-year-table');
  assert.ok(singleYearSec, 'Single-year table section must exist');
  const singleYearRows = (singleYearSec as any).content.rows;
  const singleYearTotalRow = singleYearRows[singleYearRows.length - 1];
  assert.strictEqual(Number(singleYearTotalRow[2]), ageEligible, 'Single-year total row must equal ageEligible');
  console.log('✓ Assertion 6 passed: all 15 sections present and single-year age table reconciles with ageEligible');
  console.log(`✓ Assertion 6 passed: all ${expectedSectionIds.length} required sections present`);

  // Test 7: Render Document to PDF (Section 21)
  console.log('\n--- TEST SET 7: PDF GENERATION & PAGINATION TEST ---');
  const pdfStartTime = performance.now();
  const pdfResult = await renderDocumentToPDF(doc);
  const pdfDuration = performance.now() - pdfStartTime;
  console.log(`✓ PDF rendered successfully in ${pdfDuration.toFixed(2)}ms.`);
  console.log(`✓ Page count: ${pdfResult.pageCount}`);
  console.log(`✓ PDF bytes: ${pdfResult.pdfBytes.byteLength} bytes`);
  assert.ok(pdfResult.pageCount >= 4, 'PDF must contain cover, interior spreads, and back cover');
  assert.ok(pdfResult.pdfBytes.byteLength > 10000, 'PDF bytes must be non-trivial');

  console.log('\n=== ALL CONSISTENCY AND REPORT TESTS PASSED WITH 100% SUCCESS ===');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
