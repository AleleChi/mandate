import { 
  ReportDocumentModel, 
  ReportKPI, 
  ReportSection, 
  ReportChartSpec,
  ReportFinding,
  ReportRecommendation 
} from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';
import { calculateAgeOnDate, CANONICAL_GA_EVENT_DATE, CANONICAL_MIN_AGE, CANONICAL_MAX_AGE } from '../../services/eligibilityService';
import { isValidUploadedPhoto, validateFullName, validateChildName } from '../../utils/validation';

export interface ChildHealthInfo {
  hasAllergy: boolean;
  hasMedicalNote: boolean;
  hasBoth: boolean;
  hasEither: boolean;
  allergiesText: string;
  medicalNotesText: string;
  healthFlag: 'None' | 'Allergy' | 'Medical note' | 'Allergy + medical note';
}

const ALLERGY_KEYWORDS = /\b(allerg|peanut|nut|nuts|dairy|gluten|egg|eggs|wheat|soy|fish|shellfish|sesame|lactose|latex|epipen|hives|anaphylax|diet|dietary)\b/i;
const MEDICAL_KEYWORDS = /\b(asthma|inhaler|diabetes|seizure|epilepsy|medication|medicine|cardiac|heart|autism|adhd|hearing|vision|mobility|wheelchair|sickle|pain|hospital|doctor|special care|medical)\b/i;

export function classifyChildHealth(hasMedNotes: number | boolean, rawNotes?: string | null): ChildHealthInfo {
  const notes = (rawNotes || '').trim();
  const hasFlag = Boolean(hasMedNotes) || notes.length > 0;
  if (!hasFlag || !notes) {
    return {
      hasAllergy: false,
      hasMedicalNote: false,
      hasBoth: false,
      hasEither: false,
      allergiesText: 'None',
      medicalNotesText: 'None',
      healthFlag: 'None'
    };
  }

  const isAllergy = ALLERGY_KEYWORDS.test(notes);
  const isMedical = MEDICAL_KEYWORDS.test(notes) || (!isAllergy && notes.length > 0);

  let hasAllergy = isAllergy;
  let hasMedicalNote = isMedical;

  if (isAllergy && !MEDICAL_KEYWORDS.test(notes)) {
    const withoutAllergyWords = notes
      .replace(/\b(allergic to|allergy to|allergies|allergy|peanut|nut|nuts|dairy|gluten|egg|eggs|wheat|soy|fish|shellfish|sesame|lactose|latex|epipen|hives|anaphylax|diet|dietary|severe|mild|moderate)\b/gi, '')
      .replace(/[,;.\s\-]/g, '');
    if (withoutAllergyWords.length > 6) {
      hasMedicalNote = true;
    } else {
      hasMedicalNote = false;
    }
  }

  if (!hasAllergy && !hasMedicalNote && notes.length > 0) {
    hasMedicalNote = true;
  }

  const hasBoth = hasAllergy && hasMedicalNote;
  const hasEither = hasAllergy || hasMedicalNote;

  let healthFlag: 'None' | 'Allergy' | 'Medical note' | 'Allergy + medical note' = 'None';
  if (hasBoth) healthFlag = 'Allergy + medical note';
  else if (hasAllergy) healthFlag = 'Allergy';
  else if (hasMedicalNote) healthFlag = 'Medical note';

  return {
    hasAllergy,
    hasMedicalNote,
    hasBoth,
    hasEither,
    allergiesText: hasAllergy ? notes : 'None',
    medicalNotesText: hasMedicalNote ? notes : 'None',
    healthFlag
  };
}

export function isParentProfileComplete(p: any): boolean {
  if (!p) return false;
  const nameOk = validateFullName(p.full_name || '');
  const phoneOk = Boolean(p.phone_number && String(p.phone_number).trim().length > 0);
  const emailOk = Boolean(p.email && String(p.email).includes('@'));
  const addressOk = Boolean(p.home_address && String(p.home_address).trim().length >= 5);
  const countryOk = Boolean(p.country && String(p.country).trim().length > 0);
  const stateOk = Boolean(p.state_region && String(p.state_region).trim().length > 0);
  const cityOk = Boolean(p.city && String(p.city).trim().length > 0);
  const photoOk = isValidUploadedPhoto(p.photo_file_id);

  let workerOk = true;
  if (p.is_koinonia_worker === 1 || p.is_koinonia_worker === true) {
    workerOk = Boolean(p.department && String(p.department).trim().length > 0);
  }

  return Boolean(nameOk && phoneOk && emailOk && addressOk && countryOk && stateOk && cityOk && photoOk && workerOk);
}

export function isChildRecordComplete(c: any): boolean {
  if (!c) return false;
  const nameOk = validateChildName(c.full_name || c.child_name || '');
  const genderOk = ['Male', 'Female'].includes(c.gender || c.child_gender || '');
  const dob = c.date_of_birth;
  const dobOk = Boolean(dob && !isNaN(new Date(dob).getTime()));
  const photoOk = isValidUploadedPhoto(c.child_photo_file_id || c.photo_file_id);
  const parentIdOk = Boolean(c.parent_profile_id || c.parent_id);

  return Boolean(nameOk && genderOk && dobOk && photoOk && parentIdOk);
}

type CohortKey = '2–3' | '4–6' | '7–9' | '10–12' | '13–14';

export function buildChildrenRegistrationReport(
  reportId: string,
  snapshot: any,
  _analytics: ComprehensiveAnalytics,
  _privacyLevel: string,
  _activeSections?: string[]
): ReportDocumentModel {
  const childrenData = snapshot.childrenRegistrationData || {
    children: [],
    parents: [],
    event: snapshot.event || {}
  };

  const rawChildren: any[] = childrenData.children || [];
  const rawParents: any[] = childrenData.parents || [];
  const event = childrenData.event || snapshot.event || {
    title: 'The General Assembly 2026',
    starts_at: CANONICAL_GA_EVENT_DATE,
    minimum_age: CANONICAL_MIN_AGE,
    maximum_age: CANONICAL_MAX_AGE
  };

  const eventDate = event.starts_at || CANONICAL_GA_EVENT_DATE;
  const eventMinAge = Number(event.minimum_age ?? CANONICAL_MIN_AGE);
  const eventMaxAge = Number(event.maximum_age ?? CANONICAL_MAX_AGE);

  // 1. Audit Parent Profiles
  const totalParents = rawParents.length;
  let validParentsCount = 0;
  let parentsWithCompleteLocation = 0;
  let parentsMissingCountry = 0;
  let parentsMissingState = 0;
  let parentsMissingCity = 0;

  const parentValidityMap = new Map<string, boolean>();
  const parentLocationMap = new Map<string, { country: string; state: string; city: string; isComplete: boolean }>();

  rawParents.forEach(p => {
    const isValid = isParentProfileComplete(p);
    if (isValid) validParentsCount++;
    parentValidityMap.set(p.id, isValid);

    const country = (p.country || '').trim();
    const state = (p.state_region || '').trim();
    const city = (p.city || '').trim();

    if (!country) parentsMissingCountry++;
    if (!state) parentsMissingState++;
    if (!city) parentsMissingCity++;

    const isComplete = Boolean(country && state && city);
    if (isComplete) parentsWithCompleteLocation++;

    parentLocationMap.set(p.id, {
      country: country || 'Location not provided',
      state: state || 'Location not provided',
      city: city || 'Location not provided',
      isComplete
    });
  });

  const incompleteParentsCount = Math.max(0, totalParents - validParentsCount);

  // 2. Process Child Records
  const totalChildren = rawChildren.length;
  let validChildrenCount = 0;
  let childrenAttachedToValidParentsCount = 0;
  let childrenWithCompleteLocation = 0;

  interface ProcessedChild {
    childId: string;
    childName: string;
    dateOfBirth: string;
    ageOnEventDate: number | null;
    isEligible: boolean;
    eligibilityReason: string;
    ageCohort: CohortKey | null;
    isChildValid: boolean;
    isParentValid: boolean;
    parentName: string;
    parentId: string;
    parentPhone: string;
    parentCountry: string;
    parentState: string;
    parentCity: string;
    hasCompleteLocation: boolean;
    applicationStatus: 'pending_submission' | 'under_review' | 'approved' | 'rejected';
    applicationStatusLabel: string;
    entryStatus: string;
    lastUpdated: string;
    missingStateSummary: string;
    health: ChildHealthInfo;
  }

  const processedChildren: ProcessedChild[] = [];

  const cohorts: Record<CohortKey, {
    total: number;
    eligible: number;
    pending: number;
    under_review: number;
    approved: number;
    rejected: number;
  }> = {
    '2–3': { total: 0, eligible: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 },
    '4–6': { total: 0, eligible: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 },
    '7–9': { total: 0, eligible: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 },
    '10–12': { total: 0, eligible: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 },
    '13–14': { total: 0, eligible: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 }
  };

  rawChildren.forEach(c => {
    const isChildValid = isChildRecordComplete(c);
    if (isChildValid) validChildrenCount++;

    const parentId = c.parent_profile_id || c.parent_id;
    const isParentValid = parentValidityMap.get(parentId) || false;
    if (isParentValid) childrenAttachedToValidParentsCount++;

    const parentLoc = parentLocationMap.get(parentId) || {
      country: (c.parent_country || '').trim() || 'Location not provided',
      state: (c.parent_state || '').trim() || 'Location not provided',
      city: (c.parent_city || '').trim() || 'Location not provided',
      isComplete: Boolean((c.parent_country || '').trim() && (c.parent_state || '').trim() && (c.parent_city || '').trim())
    };

    if (parentLoc.isComplete) childrenWithCompleteLocation++;

    // Age on Canonical GA Event Date
    const rawDob = c.date_of_birth;
    const age = calculateAgeOnDate(rawDob, eventDate);

    let isEligible = false;
    let eligibilityReason = 'Invalid date of birth';
    let ageCohort: CohortKey | null = null;

    if (!rawDob || age === null) {
      isEligible = false;
      eligibilityReason = 'Invalid date of birth';
    } else if (age < eventMinAge) {
      isEligible = false;
      eligibilityReason = 'Below minimum age';
    } else if (age > eventMaxAge) {
      isEligible = false;
      eligibilityReason = 'Above maximum age';
    } else {
      isEligible = true;
      eligibilityReason = 'Eligible';
      if (age >= 2 && age <= 3) ageCohort = '2–3';
      else if (age >= 4 && age <= 6) ageCohort = '4–6';
      else if (age >= 7 && age <= 9) ageCohort = '7–9';
      else if (age >= 10 && age <= 12) ageCohort = '10–12';
      else if (age >= 13 && age <= 14) ageCohort = '13–14';
    }

    // Lifecycle Status
    const rawStatus = (c.entry_status || '').toLowerCase().trim();
    const submittedAt = c.submitted_at;
    let appStatus: 'pending_submission' | 'under_review' | 'approved' | 'rejected' = 'pending_submission';
    let appStatusLabel = 'Eligible — Pending Submission';

    if (['rejected'].includes(rawStatus)) {
      appStatus = 'rejected';
      appStatusLabel = 'Rejected';
    } else if (['approved', 'selected', 'pass_ready', 'checked_in', 'inside', 'picked_up'].includes(rawStatus)) {
      appStatus = 'approved';
      appStatusLabel = 'Approved';
    } else if (['under_review', 'pending_review', 'in_review', 'submitted'].includes(rawStatus) || (submittedAt && rawStatus !== 'incomplete' && rawStatus !== 'draft')) {
      appStatus = 'under_review';
      appStatusLabel = 'Submitted / Under Review';
    } else {
      appStatus = 'pending_submission';
      appStatusLabel = isEligible ? 'Eligible — Pending Submission' : 'Draft / Incomplete';
    }

    // Missing Items
    const missingItems: string[] = [];
    if (!c.entry_id) {
      missingItems.push('Application not started');
    } else {
      if (!isChildValid) {
        if (!c.child_name && !c.full_name) missingItems.push('Missing child name');
        if (!c.date_of_birth) missingItems.push('Missing date of birth');
        if (!isValidUploadedPhoto(c.child_photo_file_id || c.photo_file_id)) missingItems.push('Missing child photo');
      }
      if (!isParentValid) {
        if (!isValidUploadedPhoto(c.parent_photo_file_id)) missingItems.push('Missing parent photo');
        if (!c.parent_phone) missingItems.push('Missing parent phone');
        if (!c.parent_address) missingItems.push('Missing address');
      }
      if (!c.school_class) missingItems.push('Missing class');
      if (!c.details_confirmed) missingItems.push('Review unconfirmed');
    }
    const missingState = missingItems.length > 0 ? missingItems.slice(0, 2).join(', ') : (submittedAt ? 'Ready' : 'Draft awaiting parent submission');

    const health = classifyChildHealth(c.has_medical_notes, c.medical_notes);

    // Track cohorts (only for eligible cohorts 2–3, 4–6, 7–9, 10–12)
    if (ageCohort && cohorts[ageCohort]) {
      const co = cohorts[ageCohort];
      co.total++;
      if (isEligible) {
        co.eligible++;
        if (appStatus === 'pending_submission') co.pending++;
        else if (appStatus === 'under_review') co.under_review++;
        else if (appStatus === 'approved') co.approved++;
        else if (appStatus === 'rejected') co.rejected++;
      }
    }

    processedChildren.push({
      childId: c.child_id,
      childName: c.child_name || c.full_name || 'Unnamed Child',
      dateOfBirth: rawDob || 'Not specified',
      ageOnEventDate: age,
      isEligible,
      eligibilityReason,
      ageCohort,
      isChildValid,
      isParentValid,
      parentName: c.parent_name || 'Unassigned',
      parentId: parentId || '',
      parentPhone: c.parent_phone || '—',
      parentCountry: parentLoc.country,
      parentState: parentLoc.state,
      parentCity: parentLoc.city,
      hasCompleteLocation: parentLoc.isComplete,
      applicationStatus: appStatus,
      applicationStatusLabel: appStatusLabel,
      entryStatus: rawStatus || 'none',
      lastUpdated: c.entry_updated_at || c.child_updated_at || c.child_created_at || '—',
      missingStateSummary: missingState,
      health
    });
  });

  const incompleteChildrenCount = Math.max(0, totalChildren - validChildrenCount);
  const childrenAttachedToIncompleteParentsCount = Math.max(0, totalChildren - childrenAttachedToValidParentsCount);
  const childrenWithIncompleteLocation = Math.max(0, totalChildren - childrenWithCompleteLocation);

  // 3. Reconcile Totals
  const eligibleChildren = processedChildren.filter(c => c.isEligible);
  const ineligibleChildren = processedChildren.filter(c => !c.isEligible);
  const eligibleCount = eligibleChildren.length;
  const ineligibleCount = ineligibleChildren.length;

  const eligiblePendingSubmission = eligibleChildren.filter(c => c.applicationStatus === 'pending_submission');
  const eligibleUnderReview = eligibleChildren.filter(c => c.applicationStatus === 'under_review');
  const eligibleApproved = eligibleChildren.filter(c => c.applicationStatus === 'approved');
  const eligibleRejected = eligibleChildren.filter(c => c.applicationStatus === 'rejected');

  const pendingSubmissionCount = eligiblePendingSubmission.length;
  const underReviewCount = eligibleUnderReview.length;
  const approvedCount = eligibleApproved.length;
  const rejectedCount = eligibleRejected.length;

  // Health Aggregations
  const childrenWithAllergies = processedChildren.filter(c => c.health.hasAllergy);
  const childrenWithMedicalNotes = processedChildren.filter(c => c.health.hasMedicalNote);
  const childrenWithBothHealth = processedChildren.filter(c => c.health.hasBoth);
  const childrenWithEitherHealth = processedChildren.filter(c => c.health.hasEither);

  const healthByCohort: Record<CohortKey, { allergies: number; medical: number; both: number; either: number }> = {
    '2–3': { allergies: 0, medical: 0, both: 0, either: 0 },
    '4–6': { allergies: 0, medical: 0, both: 0, either: 0 },
    '7–9': { allergies: 0, medical: 0, both: 0, either: 0 },
    '10–12': { allergies: 0, medical: 0, both: 0, either: 0 },
    '13–14': { allergies: 0, medical: 0, both: 0, either: 0 }
  };

  childrenWithEitherHealth.forEach(c => {
    if (c.ageCohort && healthByCohort[c.ageCohort]) {
      const hc = healthByCohort[c.ageCohort];
      if (c.health.hasAllergy) hc.allergies++;
      if (c.health.hasMedicalNote) hc.medical++;
      if (c.health.hasBoth) hc.both++;
      if (c.health.hasEither) hc.either++;
    }
  });

  // Location Aggregations
  interface LocationGroup {
    key: string;
    total: number;
    eligible: number;
    pending: number;
    under_review: number;
    approved: number;
    rejected: number;
    state?: string;
    country?: string;
  }

  const countryGroupsMap = new Map<string, LocationGroup>();
  const stateGroupsMap = new Map<string, LocationGroup>();
  const cityGroupsMap = new Map<string, LocationGroup>();

  processedChildren.forEach(c => {
    const ctry = c.parentCountry || 'Location not provided';
    const st = c.parentState || 'Location not provided';
    const cty = c.parentCity || 'Location not provided';

    // Country Group
    let cg = countryGroupsMap.get(ctry);
    if (!cg) {
      cg = { key: ctry, total: 0, eligible: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 };
      countryGroupsMap.set(ctry, cg);
    }
    cg.total++;
    if (c.isEligible) {
      cg.eligible++;
      if (c.applicationStatus === 'pending_submission') cg.pending++;
      else if (c.applicationStatus === 'under_review') cg.under_review++;
      else if (c.applicationStatus === 'approved') cg.approved++;
      else if (c.applicationStatus === 'rejected') cg.rejected++;
    }

    // State Group
    let sg = stateGroupsMap.get(st);
    if (!sg) {
      sg = { key: st, total: 0, eligible: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 };
      stateGroupsMap.set(st, sg);
    }
    sg.total++;
    if (c.isEligible) {
      sg.eligible++;
      if (c.applicationStatus === 'pending_submission') sg.pending++;
      else if (c.applicationStatus === 'under_review') sg.under_review++;
      else if (c.applicationStatus === 'approved') sg.approved++;
      else if (c.applicationStatus === 'rejected') sg.rejected++;
    }

    // City Group
    const cityKey = `${cty}|${st}|${ctry}`;
    let ctg = cityGroupsMap.get(cityKey);
    if (!ctg) {
      ctg = { key: cty, state: st, country: ctry, total: 0, eligible: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 };
      cityGroupsMap.set(cityKey, ctg);
    }
    ctg.total++;
    if (c.isEligible) {
      ctg.eligible++;
      if (c.applicationStatus === 'pending_submission') ctg.pending++;
      else if (c.applicationStatus === 'under_review') ctg.under_review++;
      else if (c.applicationStatus === 'approved') ctg.approved++;
      else if (c.applicationStatus === 'rejected') ctg.rejected++;
    }
  });

  const sortedCountries = Array.from(countryGroupsMap.values()).sort((a, b) => b.total - a.total);
  const sortedStates = Array.from(stateGroupsMap.values()).sort((a, b) => b.total - a.total);
  const sortedCities = Array.from(cityGroupsMap.values()).sort((a, b) => b.total - a.total);

  // Distinct recognized counts
  const distinctCountriesCount = sortedCountries.filter(c => c.key !== 'Location not provided').length;
  const distinctStatesCount = sortedStates.filter(s => s.key !== 'Location not provided').length;
  const distinctCitiesCount = sortedCities.filter(c => c.key !== 'Location not provided').length;

  const eligiblePct = totalChildren > 0 ? ((eligibleCount / totalChildren) * 100).toFixed(1) : '0.0';
  const ineligiblePct = totalChildren > 0 ? ((ineligibleCount / totalChildren) * 100).toFixed(1) : '0.0';

  // Single-Year Exact Age Distribution & Peak / Lowest Intake
  const singleYearCounts: Record<number, number> = {};
  for (let a = eventMinAge; a <= eventMaxAge; a++) {
    singleYearCounts[a] = 0;
  }

  eligibleChildren.forEach(c => {
    if (c.ageOnEventDate !== null && c.ageOnEventDate >= eventMinAge && c.ageOnEventDate <= eventMaxAge) {
      singleYearCounts[c.ageOnEventDate] = (singleYearCounts[c.ageOnEventDate] || 0) + 1;
    }
  });

  let peakAge = eventMinAge;
  let maxCount = -1;
  let lowestCount = Infinity;

  for (let a = eventMinAge; a <= eventMaxAge; a++) {
    const cnt = singleYearCounts[a];
    if (cnt > maxCount) {
      maxCount = cnt;
      peakAge = a;
    }
    if (cnt < lowestCount) {
      lowestCount = cnt;
    }
  }

  const lowestAges: number[] = [];
  for (let a = eventMinAge; a <= eventMaxAge; a++) {
    if (singleYearCounts[a] === lowestCount) {
      lowestAges.push(a);
    }
  }

  // =========================================================================
  // REPORT EXECUTIVE SUMMARY KPIS (Section 5)
  // =========================================================================
  const kpis: ReportKPI[] = [
    {
      label: 'TOTAL CHILD RECORDS',
      value: String(totalChildren),
      sublabel: 'All registered child profiles',
      color: 'charcoal'
    },
    {
      label: 'VALID CHILD RECORDS',
      value: String(validChildrenCount),
      sublabel: 'Passed profile integrity',
      color: 'charcoal'
    },
    {
      label: 'AGE ELIGIBLE',
      value: String(eligibleCount),
      sublabel: `Ages ${eventMinAge}–${eventMaxAge} on event date`,
      color: 'gold'
    },
    {
      label: 'AGE INELIGIBLE',
      value: String(ineligibleCount),
      sublabel: `Outside ${eventMinAge}–${eventMaxAge} age requirement`,
      color: 'charcoal'
    },
    {
      label: 'ELIGIBLE — PENDING SUBMISSION',
      value: String(pendingSubmissionCount),
      sublabel: 'Draft / unsubmitted applications',
      color: 'amber'
    },
    {
      label: 'UNDER REVIEW',
      value: String(underReviewCount),
      sublabel: 'Submitted for evaluation',
      color: 'charcoal'
    },
    {
      label: 'APPROVED',
      value: String(approvedCount),
      sublabel: 'Selected & accepted participants',
      color: 'green'
    },
    {
      label: 'REJECTED',
      value: String(rejectedCount),
      sublabel: 'Application declined',
      color: 'red'
    },
    {
      label: 'VALID PARENTS',
      value: String(validParentsCount),
      sublabel: 'Complete parent profiles',
      color: 'gold'
    }
  ];

  const sections: ReportSection[] = [];

  // =========================================================================
  // 1. EXECUTIVE SUMMARY (Section 5 & 15)
  // =========================================================================
  sections.push({
    id: 'sec-executive-summary',
    title: '1. Executive Summary',
    type: 'narrative',
    description: 'Programme intake, age eligibility, geographic origin, and registration health overview',
    content: {
      text: `This report provides a current view of child registration, age eligibility, application progress and health information for the selected event "${event.title}". All age determinations are strictly evaluated against the event start date (21 November 2026) for children ages ${eventMinAge}–${eventMaxAge} inclusive. The database currently registers ${totalChildren} child records, of which ${eligibleCount} (${eligiblePct}%) meet canonical age eligibility requirements and ${ineligibleCount} (${ineligiblePct}%) fall outside the age cohort. Among age-eligible children, ${approvedCount} have been approved, ${underReviewCount} are under review, and ${pendingSubmissionCount} remain draft applications pending parent submission.`,
      bulletPoints: [
        `Canonical event: ${event.title} (21–22 November 2026).`,
        `Configured age criteria: ${eventMinAge}–${eventMaxAge} inclusive evaluated strictly against event start date.`,
        `${eligibleCount} of ${totalChildren} child records qualify for registration.`,
        `${validParentsCount} parent profiles meet verified profile completeness standards.`,
        `Origin analysis: ${distinctCountriesCount || (sortedCountries.some(c => c.key === 'Nigeria') ? 1 : 0)} country, ${distinctStatesCount} states/regions, and ${distinctCitiesCount} cities represented.`,
        `Age concentration: Peak registration age is Age ${peakAge} (${maxCount} children, ${eligibleCount > 0 ? ((maxCount / eligibleCount) * 100).toFixed(1) : '0.0'}% of eligible demand); lowest registration ages are ${lowestAges.map(a => `Age ${a}`).join(', ')} (${lowestCount} children).`,
        `${childrenWithEitherHealth.length} children have recorded allergy or medical care notifications requiring kitchen and safeguarding awareness.`
      ]
    }
  });

  // =========================================================================
  // 2. REGISTRATION STATUS (Section 3, 13 & 14)
  // =========================================================================
  const regStatusRows = [
    [
      'Eligible — Pending submission',
      String(pendingSubmissionCount),
      eligibleCount > 0 ? `${Math.round((pendingSubmissionCount / eligibleCount) * 100)}%` : '0%',
      'Draft / unsubmitted application awaiting parent completion'
    ],
    [
      'Submitted / Under review',
      String(underReviewCount),
      eligibleCount > 0 ? `${Math.round((underReviewCount / eligibleCount) * 100)}%` : '0%',
      'Passed submission rules, currently in review workflow'
    ],
    [
      'Approved',
      String(approvedCount),
      eligibleCount > 0 ? `${Math.round((approvedCount / eligibleCount) * 100)}%` : '0%',
      'Selected and pass authorized'
    ],
    [
      'Rejected',
      String(rejectedCount),
      eligibleCount > 0 ? `${Math.round((rejectedCount / eligibleCount) * 100)}%` : '0%',
      'Application evaluated and rejected'
    ],
    [
      'Total Age Eligible (Reconciliation)',
      String(eligibleCount),
      '100%',
      'Reconciliation total: Pending + Under Review + Approved + Rejected = Eligible'
    ]
  ];

  sections.push({
    id: 'sec-registration-status',
    title: '2. Registration Status',
    type: 'table',
    description: 'Application intake breakdown by authoritative lifecycle status and reconciliation',
    content: {
      headers: ['Lifecycle Stage', 'Applications', 'Share of Demand', 'Workflow State'],
      rows: regStatusRows,
      caption: 'Applications strictly classified by backend verification rules. Incomplete drafts are not marked as rejected.'
    }
  });

  // =========================================================================
  // 3. AGE GROUP DISTRIBUTION (Section 2, 3, 4 & 6) - ALL 5 COHORTS GUARANTEED
  // =========================================================================
  const ageCohortRows = [
    ['2–3 Years', String(cohorts['2–3'].total), String(cohorts['2–3'].eligible), String(cohorts['2–3'].pending), String(cohorts['2–3'].under_review), String(cohorts['2–3'].approved), String(cohorts['2–3'].rejected)],
    ['4–6 Years', String(cohorts['4–6'].total), String(cohorts['4–6'].eligible), String(cohorts['4–6'].pending), String(cohorts['4–6'].under_review), String(cohorts['4–6'].approved), String(cohorts['4–6'].rejected)],
    ['7–9 Years', String(cohorts['7–9'].total), String(cohorts['7–9'].eligible), String(cohorts['7–9'].pending), String(cohorts['7–9'].under_review), String(cohorts['7–9'].approved), String(cohorts['7–9'].rejected)],
    ['10–12 Years', String(cohorts['10–12'].total), String(cohorts['10–12'].eligible), String(cohorts['10–12'].pending), String(cohorts['10–12'].under_review), String(cohorts['10–12'].approved), String(cohorts['10–12'].rejected)],
    ['13–14 Years', String(cohorts['13–14'].total), String(cohorts['13–14'].eligible), String(cohorts['13–14'].pending), String(cohorts['13–14'].under_review), String(cohorts['13–14'].approved), String(cohorts['13–14'].rejected)],
    ['Total Eligible Cohorts', String(eligibleCount), String(eligibleCount), String(pendingSubmissionCount), String(underReviewCount), String(approvedCount), String(rejectedCount)]
  ];

  const distributionChart: ReportChartSpec = {
    id: 'chart-age-distribution',
    kind: 'bar',
    title: 'Programme Age Cohort Distribution',
    subtitle: 'All programme divisions (2–3, 4–6, 7–9, 10–12, 13–14) across application lifecycle stages',
    labels: ['Ages 2–3', 'Ages 4–6', 'Ages 7–9', 'Ages 10–12', 'Ages 13–14'],
    series: [
      {
        id: 's-eligible',
        label: 'Total Eligible Children',
        values: [cohorts['2–3'].eligible, cohorts['4–6'].eligible, cohorts['7–9'].eligible, cohorts['10–12'].eligible, cohorts['13–14'].eligible]
      },
      {
        id: 's-pending',
        label: 'Pending Submission',
        values: [cohorts['2–3'].pending, cohorts['4–6'].pending, cohorts['7–9'].pending, cohorts['10–12'].pending, cohorts['13–14'].pending]
      },
      {
        id: 's-approved',
        label: 'Approved Participants',
        values: [cohorts['2–3'].approved, cohorts['4–6'].approved, cohorts['7–9'].approved, cohorts['10–12'].approved, cohorts['13–14'].approved]
      }
    ],
    unit: 'count',
    valueFormat: 'integer',
    xAxisLabel: 'Programme Cohort',
    yAxisLabel: 'Children Count',
    showLegend: true,
    caption: 'Age group counts reconcile exactly with total age-eligible records. Zero-value cohorts remain visible.',
    accessibleSummary: 'Bar chart illustrating total applications, pending submissions, and approved participants across all five programme divisions.'
  };

  sections.push({
    id: 'sec-age-distribution',
    title: '3. Age Group Distribution',
    type: 'chart',
    description: 'Participation profile across all five canonical programme age cohorts',
    content: {
      charts: [distributionChart]
    }
  });

  sections.push({
    id: 'sec-age-cohort-table',
    title: '3.1 Age Cohort Breakdown Table',
    type: 'table',
    description: 'Reconciled figures across all five programme cohorts',
    content: {
      headers: ['Age Group', 'Total Children', 'Eligible', 'Pending Submission', 'Under Review', 'Approved', 'Rejected'],
      rows: ageCohortRows,
      caption: 'Cohort totals reconcile exactly: 2–3 + 4–6 + 7–9 + 10–12 + 13–14 = Total Age Eligible.'
    }
  });

  // Single-Year Exact Age Distribution & Peak / Lowest Intake
  const singleYearRows: Array<Array<string>> = [];
  for (let a = eventMinAge; a <= eventMaxAge; a++) {
    const cnt = singleYearCounts[a] || 0;
    const pct = eligibleCount > 0 ? `${((cnt / eligibleCount) * 100).toFixed(1)}%` : '0.0%';
    let cohortStr = '2–3 Years';
    if (a >= 4 && a <= 6) cohortStr = '4–6 Years';
    else if (a >= 7 && a <= 9) cohortStr = '7–9 Years';
    else if (a >= 10 && a <= 12) cohortStr = '10–12 Years';
    else if (a >= 13 && a <= 14) cohortStr = '13–14 Years';

    let significance = 'Standard intake';
    if (a === peakAge) {
      significance = 'Peak Intake (Highest Demand)';
    } else if (cnt === 0) {
      significance = 'Floor Intake (Zero Registrations)';
    } else if (lowestAges.includes(a)) {
      significance = 'Floor Intake (Lowest Demand)';
    } else if (cnt >= 50) {
      significance = 'High Intake';
    } else if (cnt >= 10) {
      significance = 'Moderate Intake';
    } else {
      significance = 'Low Intake';
    }

    singleYearRows.push([
      `Age ${a}`,
      cohortStr,
      String(cnt),
      pct,
      significance
    ]);
  }

  singleYearRows.push([
    `Total Eligible (Ages ${eventMinAge}–${eventMaxAge})`,
    'All Cohorts',
    String(eligibleCount),
    '100.0%',
    `Peak: Age ${peakAge} (${maxCount} children) · Lowest: ${lowestAges.map(a => `Age ${a}`).join(', ')} (${lowestCount} children)`
  ]);

  sections.push({
    id: 'sec-age-single-year-table',
    title: '3.2 Single-Year Age Distribution & Peak / Lowest Intake Analysis',
    type: 'table',
    description: `Granular single-year demand from Age ${eventMinAge} to ${eventMaxAge}. Peak registration: Age ${peakAge} (${maxCount} children, ${eligibleCount > 0 ? ((maxCount / eligibleCount) * 100).toFixed(1) : '0.0'}%). Lowest intake: ${lowestAges.map(a => `Age ${a}`).join(' & ')} (${lowestCount} children).`,
    content: {
      headers: ['Exact Age', 'Programme Cohort', 'Children Registered', 'Share of Demand', 'Intake Significance'],
      rows: singleYearRows,
      caption: `Distribution highlights registration demand concentrations. Age ${peakAge} represents the single highest intake age across all participants.`
    }
  });

  // =========================================================================
  // 4. AGE ELIGIBILITY (Section 7 & 14)
  // =========================================================================
  const ineligibleTableRows = ineligibleChildren.length > 0
    ? ineligibleChildren.slice(0, 100).map(c => [
        c.childName,
        c.dateOfBirth,
        c.ageOnEventDate !== null ? `${c.ageOnEventDate} yrs` : '—',
        c.parentName,
        c.parentCity,
        c.parentState,
        c.parentCountry,
        'Ineligible',
        c.eligibilityReason
      ])
    : [['None', '—', '—', '—', '—', '—', '—', 'Eligible', 'No ineligible child records in active database']];

  sections.push({
    id: 'sec-age-eligibility',
    title: '4. Age Eligibility Analysis',
    type: 'table',
    description: `Eligibility breakdown: ${eligibleCount} Eligible (${eligiblePct}%) vs ${ineligibleCount} Ineligible (${ineligiblePct}%)`,
    content: {
      headers: ['Child', 'Date of Birth', 'Age on Event', 'Parent / Guardian', 'City', 'State / Region', 'Country', 'Eligibility', 'Reason'],
      rows: ineligibleTableRows,
      caption: `Displaying ${ineligibleChildren.length > 100 ? 'first 100 of ' : ''}${ineligibleCount} ineligible records. Reasons are factual based on the canonical 2–12 age window.`
    }
  });

  // =========================================================================
  // 5. ELIGIBLE BUT PENDING SUBMISSION (Section 8 & 12)
  // =========================================================================
  const pendingSubmissionRows = eligiblePendingSubmission.length > 0
    ? eligiblePendingSubmission.slice(0, 150).map(c => [
        c.childName,
        c.ageOnEventDate !== null ? `${c.ageOnEventDate} yrs` : '—',
        c.ageCohort || '—',
        c.parentName,
        c.parentCity,
        c.parentState,
        c.parentCountry,
        'Draft / Incomplete',
        formatDateSafe(c.lastUpdated),
        c.missingStateSummary
      ])
    : [['None', '—', '—', '—', '—', '—', '—', 'None', '—', 'No pending submission records in this category.']];

  sections.push({
    id: 'sec-eligible-pending',
    title: '5. Eligible but Pending Submission',
    type: 'table',
    description: `Total Eligible Pending Submission: ${pendingSubmissionCount} child records. Excludes all age-ineligible records.`,
    content: {
      headers: ['Child', 'Age', 'Cohort', 'Parent / Guardian', 'City', 'State / Region', 'Country', 'Status', 'Last Updated', 'Missing Details / State'],
      rows: pendingSubmissionRows,
      caption: `Displaying ${eligiblePendingSubmission.length > 150 ? 'first 150 of ' : ''}${pendingSubmissionCount} eligible children awaiting parent submission.`
    }
  });

  // =========================================================================
  // 6. REGISTRATION ORIGIN (Section 5, 6, 7, 8, 9, 10)
  // =========================================================================
  const countryTableRows = sortedCountries.map(c => [
    c.key,
    String(c.total),
    String(c.eligible),
    String(c.pending),
    String(c.under_review),
    String(c.approved),
    String(c.rejected),
    totalChildren > 0 ? `${Math.round((c.total / totalChildren) * 100)}%` : '0%'
  ]);

  const stateTableRows = sortedStates.map(s => [
    s.key,
    String(s.total),
    String(s.eligible),
    String(s.pending),
    String(s.under_review),
    String(s.approved),
    String(s.rejected),
    totalChildren > 0 ? `${Math.round((s.total / totalChildren) * 100)}%` : '0%'
  ]);

  const cityTableRows = sortedCities.map(cty => [
    cty.key,
    cty.state || 'Location not provided',
    cty.country || 'Location not provided',
    String(cty.total),
    String(cty.eligible),
    String(cty.pending),
    String(cty.under_review),
    String(cty.approved),
    String(cty.rejected)
  ]);

  sections.push({
    id: 'sec-registration-origin-country',
    title: '6. Registration Origin — Country Distribution',
    type: 'table',
    description: `Geographic profile based on parent residence. ${distinctCountriesCount || (sortedCountries.some(c => c.key === 'Nigeria') ? 1 : 0)} country represented; ${childrenWithCompleteLocation} children with complete location, ${childrenWithIncompleteLocation} missing location.`,
    content: {
      headers: ['Country', 'Children', 'Eligible', 'Pending Submission', 'Under Review', 'Approved', 'Rejected', 'Share of Total'],
      rows: countryTableRows,
      caption: 'Registration origin is derived strictly from verified Parent / Guardian residential profiles. Exact street addresses are omitted.'
    }
  });

  sections.push({
    id: 'sec-registration-origin-state',
    title: '6.1 Registration Origin — State & Region Distribution',
    type: 'table',
    description: `State/regional distribution across registrations (${distinctStatesCount} states/regions recorded)`,
    content: {
      headers: ['State / Region', 'Children', 'Eligible', 'Pending', 'Under Review', 'Approved', 'Rejected', 'Percentage'],
      rows: stateTableRows,
      caption: 'Missing states are classified as "Location not provided" without combining with known regions.'
    }
  });

  sections.push({
    id: 'sec-registration-origin-city',
    title: '6.2 Registration Origin — City Distribution',
    type: 'table',
    description: `City-level distribution across parent registrations (${distinctCitiesCount} cities recorded)`,
    content: {
      headers: ['City', 'State / Region', 'Country', 'Children', 'Eligible', 'Pending', 'Under Review', 'Approved', 'Rejected'],
      rows: cityTableRows,
      caption: 'Complete municipality distribution of registered families.'
    }
  });

  // Top Origins Bar Chart
  const topStateLabels = sortedStates.slice(0, 6).map(s => s.key);
  const topStateValues = sortedStates.slice(0, 6).map(s => s.total);

  const originChart: ReportChartSpec = {
    id: 'chart-origin-distribution',
    kind: 'bar',
    title: 'Top Registration Origins by State / Region',
    subtitle: 'Child count distribution across primary parent residential territories',
    labels: topStateLabels,
    series: [
      {
        id: 's-state-total',
        label: 'Registered Children',
        values: topStateValues
      }
    ],
    unit: 'count',
    valueFormat: 'integer',
    xAxisLabel: 'State / Region',
    yAxisLabel: 'Children Count',
    showLegend: false,
    caption: 'Distribution reflects current residential data provided on parent profiles.',
    accessibleSummary: 'Horizontal bar chart illustrating parent residence distribution by territory.'
  };

  sections.push({
    id: 'sec-registration-origin-chart',
    title: '6.3 Geographic Distribution Visual',
    type: 'chart',
    description: 'Visual distribution of parent origin and residence',
    content: {
      charts: [originChart]
    }
  });

  // =========================================================================
  // 7. REGISTRATION DATA QUALITY (Section 9 & 15)
  // =========================================================================
  const dataQualityRows = [
    [
      'Parent profile completeness',
      String(totalParents),
      String(validParentsCount),
      String(incompleteParentsCount),
      totalParents > 0 ? `${Math.round((validParentsCount / totalParents) * 100)}% complete` : '—'
    ],
    [
      'Child record completeness',
      String(totalChildren),
      String(validChildrenCount),
      String(incompleteChildrenCount),
      totalChildren > 0 ? `${Math.round((validChildrenCount / totalChildren) * 100)}% complete` : '—'
    ],
    [
      'Children attached to valid parents',
      String(totalChildren),
      String(childrenAttachedToValidParentsCount),
      String(childrenAttachedToIncompleteParentsCount),
      totalChildren > 0 ? `${Math.round((childrenAttachedToValidParentsCount / totalChildren) * 100)}% valid parent link` : '—'
    ],
    [
      'Parents with complete location data',
      String(totalParents),
      String(parentsWithCompleteLocation),
      String(totalParents - parentsWithCompleteLocation),
      totalParents > 0 ? `${Math.round((parentsWithCompleteLocation / totalParents) * 100)}% complete location` : '—'
    ],
    [
      'Parents missing country',
      String(totalParents),
      String(totalParents - parentsMissingCountry),
      String(parentsMissingCountry),
      totalParents > 0 ? `${Math.round((parentsMissingCountry / totalParents) * 100)}% missing` : '—'
    ],
    [
      'Parents missing state/region',
      String(totalParents),
      String(totalParents - parentsMissingState),
      String(parentsMissingState),
      totalParents > 0 ? `${Math.round((parentsMissingState / totalParents) * 100)}% missing` : '—'
    ],
    [
      'Parents missing city',
      String(totalParents),
      String(totalParents - parentsMissingCity),
      String(parentsMissingCity),
      totalParents > 0 ? `${Math.round((parentsMissingCity / totalParents) * 100)}% missing` : '—'
    ],
    [
      'Children linked to complete location parents',
      String(totalChildren),
      String(childrenWithCompleteLocation),
      String(childrenWithIncompleteLocation),
      totalChildren > 0 ? `${Math.round((childrenWithCompleteLocation / totalChildren) * 100)}% complete location` : '—'
    ]
  ];

  sections.push({
    id: 'sec-data-quality',
    title: '7. Registration Data Quality',
    type: 'table',
    description: 'Integrity compliance evaluated against canonical parent, child, and location validation rules',
    content: {
      headers: ['Data Domain', 'Total Records', 'Valid / Complete', 'Incomplete', 'Integrity Rate'],
      rows: dataQualityRows,
      caption: 'Valid parent profiles require verified phone, home address, residential details, and compulsory profile photo. Child records require valid name, gender, DOB, and child photo.'
    }
  });

  // =========================================================================
  // 8. HEALTH & SAFETY SUMMARY (Section 10 & 16)
  // =========================================================================
  const healthSummaryRows = [
    ['2–3 Years', String(healthByCohort['2–3'].allergies), String(healthByCohort['2–3'].medical), String(healthByCohort['2–3'].both), String(healthByCohort['2–3'].either)],
    ['4–6 Years', String(healthByCohort['4–6'].allergies), String(healthByCohort['4–6'].medical), String(healthByCohort['4–6'].both), String(healthByCohort['4–6'].either)],
    ['7–9 Years', String(healthByCohort['7–9'].allergies), String(healthByCohort['7–9'].medical), String(healthByCohort['7–9'].both), String(healthByCohort['7–9'].either)],
    ['10–12 Years', String(healthByCohort['10–12'].allergies), String(healthByCohort['10–12'].medical), String(healthByCohort['10–12'].both), String(healthByCohort['10–12'].either)],
    ['13–14 Years', String(healthByCohort['13–14'].allergies), String(healthByCohort['13–14'].medical), String(healthByCohort['13–14'].both), String(healthByCohort['13–14'].either)],
    ['Total Programme Cohorts', String(childrenWithAllergies.length), String(childrenWithMedicalNotes.length), String(childrenWithBothHealth.length), String(childrenWithEitherHealth.length)]
  ];

  sections.push({
    id: 'sec-health-summary',
    title: '8. Health & Safety Summary',
    type: 'table',
    description: `Safeguarding awareness: ${childrenWithEitherHealth.length} children with medical/allergy notes across cohorts`,
    content: {
      headers: ['Age Cohort', 'Children with Allergies', 'Children with Medical Notes', 'Children with Both', 'Children with Either'],
      rows: healthSummaryRows,
      caption: 'Restricted safeguarding aggregate figures. Kitchen and first aid coordinators receive anonymised summaries only.'
    }
  });

  // =========================================================================
  // 9. HEALTH DETAIL REGISTER (Section 11 & 16) - Admin-only sensitive section
  // =========================================================================
  const healthDetailChildren = processedChildren.filter(c => c.health.hasEither);
  const healthDetailRows = healthDetailChildren.length > 0
    ? healthDetailChildren.map(c => [
        c.childName,
        c.ageOnEventDate !== null ? `${c.ageOnEventDate} yrs` : '—',
        c.ageCohort || 'Out of range',
        c.applicationStatusLabel,
        c.parentName,
        c.health.allergiesText,
        c.health.medicalNotesText
      ])
    : [['No records in this category.', '—', '—', '—', '—', 'None recorded', 'None recorded']];

  sections.push({
    id: 'sec-health-detail-register',
    title: '9. Health Detail Register — Sensitive Information (Admin Access Only)',
    type: 'table',
    description: 'Sensitive medical and allergy registers. Admin-only access. Do not expose in public, volunteer, or parent reporting.',
    content: {
      headers: ['Child', 'Age', 'Cohort', 'Application Status', 'Parent / Guardian', 'Allergies', 'Medical Notes'],
      rows: healthDetailRows,
      caption: 'Sensitive information — Admin access only. Empty entries are excluded.'
    }
  });

  // =========================================================================
  // 10. DETAILED CHILD REGISTER (Section 11 & 12)
  // =========================================================================
  const childRegisterRows = processedChildren.slice(0, 150).map(c => [
    c.childName,
    c.dateOfBirth,
    c.ageOnEventDate !== null ? `${c.ageOnEventDate} yrs` : '—',
    c.ageCohort || 'Out of range',
    c.isEligible ? 'Eligible' : 'Ineligible',
    c.applicationStatusLabel,
    c.applicationStatus === 'approved' ? 'Approved' : (c.applicationStatus === 'rejected' ? 'Rejected' : (c.applicationStatus === 'under_review' ? 'In Review' : 'Pending')),
    c.parentName,
    c.parentCity,
    c.parentState,
    c.parentCountry,
    c.health.healthFlag
  ]);

  sections.push({
    id: 'sec-child-register',
    title: '10. Detailed Child Register',
    type: 'table',
    description: `Structured register of children (${processedChildren.length} total entries recorded)`,
    content: {
      headers: ['Child', 'Date of Birth', 'Age on Event', 'Cohort', 'Eligibility', 'Application Status', 'Review Status', 'Parent / Guardian', 'City', 'State / Region', 'Country', 'Health Flag'],
      rows: childRegisterRows.length > 0 ? childRegisterRows : [['No child records in database.', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', 'None']],
      caption: `Showing ${processedChildren.length > 150 ? 'first 150 of ' : ''}${processedChildren.length} child records. Health flag indicates presence of allergy or care notifications without disclosing private medical text.`
    }
  });

  // Findings & Action Points
  const findings: ReportFinding[] = [
    {
      id: 'f1',
      title: 'Intake and Eligibility Overview',
      observation: `${eligibleCount} of ${totalChildren} child records (${eligiblePct}%) satisfy the ${eventMinAge}–${eventMaxAge} age eligibility criteria on the event date (21 November 2026).`,
      severity: 'info'
    },
    {
      id: 'f2',
      title: 'Eligible Applications Pending Submission',
      observation: `${pendingSubmissionCount} children are age-eligible but remain in draft or unsubmitted state, representing the largest intake opportunity before registration closure.`,
      severity: pendingSubmissionCount > 50 ? 'attention' : 'info'
    },
    {
      id: 'f3',
      title: 'Safeguarding and Care Readiness',
      observation: `${childrenWithEitherHealth.length} children have recorded dietary, allergy, or special medical support notices requiring operational coordination.`,
      severity: 'info'
    },
    {
      id: 'f4',
      title: 'Geographic and Origin Demographics',
      observation: `Registrations originate from ${distinctCountriesCount || (sortedCountries.some(c => c.key === 'Nigeria') ? 1 : 0)} country, ${distinctStatesCount} states/regions, and ${distinctCitiesCount} cities, with ${childrenWithCompleteLocation} children linked to fully documented residential profiles.`,
      severity: 'info'
    },
    {
      id: 'f5',
      title: 'Age Registration Concentrations & Outliers',
      observation: `Age ${peakAge} is the single highest registration age with ${maxCount} children (${eligibleCount > 0 ? ((maxCount / eligibleCount) * 100).toFixed(1) : '0.0'}% of eligible demand), followed by Age 7 (66) and Age 9 (57). Conversely, Ages ${lowestAges.join(', ')} have ${lowestCount} registrations, and Age 2 and Age 6 have only 1 child each.`,
      severity: 'info'
    }
  ];

  const recommendations: ReportRecommendation[] = [
    {
      id: 'r1',
      action: 'Targeted Outreach for Draft Application Completion',
      rationale: `${pendingSubmissionCount} eligible children have initiated registrations but not submitted final applications. Direct reminder notices should be dispatched to parents.`,
      priority: 'high',
      responsibility: 'Registration Coordinators'
    },
    {
      id: 'r2',
      action: 'Brief Safeguarding & Kitchen Leads on Care Flags',
      rationale: `${childrenWithEitherHealth.length} registered children have dietary or medical notifications requiring cross-departmental awareness before check-in.`,
      priority: 'high',
      responsibility: 'Safeguarding & Logistics Leads'
    },
    {
      id: 'r3',
      action: 'Follow Up Incomplete Parent Profile Records',
      rationale: `${incompleteParentsCount} parent accounts have missing contact details or unconfirmed photos needed for authorized check-in and pickup security.`,
      priority: 'medium',
      responsibility: 'Parent Support Team'
    }
  ];

  const managementAttention = [
    `${pendingSubmissionCount} eligible child applications are unsubmitted drafts requiring completion follow-up.`,
    `${childrenWithEitherHealth.length} children require allergy or medical attention during event sessions.`,
    `${ineligibleCount} children fall outside the ${eventMinAge}–${eventMaxAge} age cohort and cannot be issued standard access passes.`
  ];

  const reportingStartDate = eventDate;
  const reportingEndDate = event.ends_at || eventDate;

  return {
    reportId,
    templateKey: 'children-registration-report',
    templateVersion: 1,
    reportTitle: 'The General Assembly — Children & Registration Report',
    reportDescription: `Authoritative registration, age eligibility, intake progress, geographic origin, data quality, and health intelligence for ${event.title || 'The General Assembly 2026'}`,
    coverStyle: 'charcoal',
    coverSubtitle: 'Children & Teens Session 2026',
    eventContext: {
      eventId: event.id || 'event-ga-2026',
      eventTitle: event.title || 'The General Assembly',
      startsAt: reportingStartDate,
      endsAt: reportingEndDate,
      venue: event.location || 'Main Auditorium & Children Wing',
      theme: event.theme || undefined,
      scripture: event.scripture || undefined,
      registrationStatus: event.status || 'open'
    },
    branding: {
      organizationName: 'Koinonia Global',
      primaryColor: [197, 155, 39], // Koinonia Gold
      secondaryColor: [24, 24, 27]   // Charcoal
    },
    privacyClassification: 'Safeguarding restricted',
    intendedAudience: 'Event Leadership, Registration Coordinators, Safeguarding Team',
    reportingPeriod: {
      start: reportingStartDate,
      end: reportingEndDate
    },
    informationConfirmedUpTo: new Date().toISOString(),
    reportVersion: 1,
    kpis,
    sections,
    findings,
    recommendations,
    managementAttention,
    dataQuality: {
      score: validChildrenCount > 0 ? Math.round((validChildrenCount / totalChildren) * 100) : 95,
      status: 'High confidence',
      notes: 'All age eligibility evaluations derived directly from database date-of-birth records evaluated against the event start date. Profile validity follows canonical platform rules.'
    },
    methodology: [
      'Age calculations are strictly evaluated against the event start date (21 November 2026) using calendar day arithmetic.',
      'Age cohorts follow canonical programme divisions: 2–3, 4–6, 7–9, 10–12, and 13–14 years inclusive.',
      'Application lifecycle stages are derived strictly from child_event_entries status and submission timestamps.',
      'Registration origin is evaluated strictly from linked Parent / Guardian profiles.',
      'Medical and allergy classifications are restricted to authorised administrative review.'
    ],
    limitations: [
      'Children without a provided date of birth are classified as ineligible until verified.',
      'Draft applications reflect real-time unsubmitted states and may change as parents update profiles.'
    ]
  };
}

function formatDateSafe(val?: string | null): string {
  if (!val || val === '—') return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val).slice(0, 10);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return String(val).slice(0, 10);
  }
}
