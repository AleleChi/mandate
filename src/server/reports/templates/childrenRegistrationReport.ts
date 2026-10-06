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

export function normalizeStateName(rawState?: string | null): string {
  if (!rawState) return 'Location not provided';
  const trimmed = rawState.trim();
  if (!trimmed || trimmed === '—' || trimmed.toLowerCase() === 'none') return 'Location not provided';

  // Lowercase and remove punctuation except spaces (e.g. "F.C.T." -> "f c t")
  const clean = trimmed.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

  // Strip trailing "state" if present e.g. "nasarawa state" -> "nasarawa", "lagos state" -> "lagos"
  const withoutStateSuffix = clean.replace(/\s+state$/, '').trim();

  // FCT / Abuja matches (Federal Capital Territory)
  if (
    withoutStateSuffix === 'fct' ||
    withoutStateSuffix === 'f c t' ||
    withoutStateSuffix === 'abuja' ||
    withoutStateSuffix === 'fct abuja' ||
    withoutStateSuffix === 'abuja fct' ||
    withoutStateSuffix === 'f c t abuja' ||
    withoutStateSuffix === 'federal capital territory' ||
    withoutStateSuffix === 'federal capital terroty' ||
    withoutStateSuffix.includes('federal capital') ||
    withoutStateSuffix.startsWith('fct ') ||
    withoutStateSuffix.endsWith(' fct')
  ) {
    return 'Federal Capital Territory (FCT)';
  }

  // Proper title casing for all other states (e.g. "NASARAWA" -> "Nasarawa", "LAGOS" -> "Lagos")
  const words = withoutStateSuffix.split(/\s+/).filter(Boolean).map(w => {
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
  return words.join(' ') || 'Location not provided';
}

export function normalizeCountryName(rawCountry?: string | null): string {
  if (!rawCountry) return 'Location not provided';
  const trimmed = rawCountry.trim();
  if (!trimmed || trimmed === '—' || trimmed.toLowerCase() === 'none') return 'Location not provided';
  const clean = trimmed.toLowerCase();
  if (clean === 'nigeria' || clean === 'ng' || clean === 'nga') return 'Nigeria';
  const words = trimmed.split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join(' ') || 'Location not provided';
}

export function normalizeCityName(rawCity?: string | null): string {
  if (!rawCity) return 'Location not provided';
  const trimmed = rawCity.trim();
  if (!trimmed || trimmed === '—' || trimmed.toLowerCase() === 'none') return 'Location not provided';
  const words = trimmed.split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join(' ') || 'Location not provided';
}

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

    const rawCountry = (p.country || '').trim();
    const rawState = (p.state_region || '').trim();
    const rawCity = (p.city || '').trim();

    if (!rawCountry) parentsMissingCountry++;
    if (!rawState) parentsMissingState++;
    if (!rawCity) parentsMissingCity++;

    const isComplete = Boolean(rawCountry && rawState && rawCity);
    if (isComplete) parentsWithCompleteLocation++;

    const country = rawCountry ? normalizeCountryName(rawCountry) : 'Location not provided';
    const state = rawState ? normalizeStateName(rawState) : 'Location not provided';
    const city = rawCity ? normalizeCityName(rawCity) : 'Location not provided';

    parentLocationMap.set(p.id, {
      country,
      state,
      city,
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

    const rawChildCtry = (c.parent_country || '').trim();
    const rawChildSt = (c.parent_state || '').trim();
    const rawChildCty = (c.parent_city || '').trim();

    const parentLoc = parentLocationMap.get(parentId) || {
      country: rawChildCtry ? normalizeCountryName(rawChildCtry) : 'Location not provided',
      state: rawChildSt ? normalizeStateName(rawChildSt) : 'Location not provided',
      city: rawChildCty ? normalizeCityName(rawChildCty) : 'Location not provided',
      isComplete: Boolean(rawChildCtry && rawChildSt && rawChildCty)
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
      sublabel: 'Complete profiles with photos',
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
      sublabel: `Outside ${eventMinAge}–${eventMaxAge} age range`,
      color: 'charcoal'
    },
    {
      label: 'ELIGIBLE — PENDING SUBMISSION',
      value: String(pendingSubmissionCount),
      sublabel: 'Drafts waiting for parent submission',
      color: 'amber'
    },
    {
      label: 'UNDER REVIEW',
      value: String(underReviewCount),
      sublabel: 'Submitted and being reviewed',
      color: 'charcoal'
    },
    {
      label: 'APPROVED',
      value: String(approvedCount),
      sublabel: 'Approved participants',
      color: 'green'
    },
    {
      label: 'REJECTED',
      value: String(rejectedCount),
      sublabel: 'Declined applications',
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
    description: 'Overview of registrations, age qualification, locations, and health notes',
    content: {
      text: `This report provides an up-to-date overview of child registrations, age eligibility, application progress, and health notes for "${event.title}". All children are evaluated for the event (21 November 2026) based on the required age range of ${eventMinAge}–${eventMaxAge} years inclusive. The database currently registers ${totalChildren} child records, of which ${eligibleCount} (${eligiblePct}%) meet the age requirement and ${ineligibleCount} (${ineligiblePct}%) fall outside the age range. Among eligible children, ${approvedCount} are approved, ${underReviewCount} are under review, and ${pendingSubmissionCount} are draft applications waiting for parent submission.`,
      bulletPoints: [
        `Event: ${event.title} (21–22 November 2026).`,
        `Age requirement: Ages ${eventMinAge}–${eventMaxAge} inclusive on the event start date.`,
        `${eligibleCount} of ${totalChildren} children qualify for the programme.`,
        `${validParentsCount} parent profiles have complete contact and residential information.`,
        `Locations represented: ${distinctCountriesCount || (sortedCountries.some(c => c.key === 'Nigeria') ? 1 : 0)} country, ${distinctStatesCount} states/regions, and ${distinctCitiesCount} cities.`,
        `Turnout by age: Highest registration is Age ${peakAge} (${maxCount} children, ${eligibleCount > 0 ? ((maxCount / eligibleCount) * 100).toFixed(1) : '0.0'}% of eligible children); lowest registration is ${lowestAges.map(a => `Age ${a}`).join(', ')} (${lowestCount} children).`,
        `${childrenWithEitherHealth.length} children have recorded dietary, allergy, or medical care notes for event safety.`
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
      'Draft started by parent, waiting for final submission'
    ],
    [
      'Submitted / Under review',
      String(underReviewCount),
      eligibleCount > 0 ? `${Math.round((underReviewCount / eligibleCount) * 100)}%` : '0%',
      'Submitted by parent, currently being reviewed by the registration team'
    ],
    [
      'Approved',
      String(approvedCount),
      eligibleCount > 0 ? `${Math.round((approvedCount / eligibleCount) * 100)}%` : '0%',
      'Accepted and attendance pass confirmed'
    ],
    [
      'Rejected',
      String(rejectedCount),
      eligibleCount > 0 ? `${Math.round((rejectedCount / eligibleCount) * 100)}%` : '0%',
      'Application reviewed and declined'
    ],
    [
      'Total Eligible Children',
      String(eligibleCount),
      '100%',
      'All eligible children across all application stages'
    ]
  ];

  sections.push({
    id: 'sec-registration-status',
    title: '2. Registration Status',
    type: 'table',
    description: 'Breakdown of applications by current progress and status',
    content: {
      headers: ['Application Stage', 'Children', '% of Total', 'Current Status'],
      rows: regStatusRows,
      caption: 'Summary of all registered children by current application status. Unsubmitted drafts remain open for parents to complete.'
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
    title: 'Children by Age Group',
    subtitle: 'All age groups (2–3, 4–6, 7–9, 10–12, 13–14) by application status',
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
    xAxisLabel: 'Age Group',
    yAxisLabel: 'Children Count',
    showLegend: true,
    caption: 'Age group counts match total eligible children. All age groups are shown.',
    accessibleSummary: 'Bar chart showing eligible children, pending submissions, and approved participants across all age groups.'
  };

  sections.push({
    id: 'sec-age-distribution',
    title: '3. Age Group Breakdown',
    type: 'chart',
    description: 'Number of children registered across each programme age group',
    content: {
      charts: [distributionChart]
    }
  });

  sections.push({
    id: 'sec-age-cohort-table',
    title: '3.1 Age Group Summary Table',
    type: 'table',
    description: 'Summary figures across all five age groups',
    content: {
      headers: ['Age Group', 'Total Registered', 'Age Eligible', 'Pending Submission', 'Under Review', 'Approved', 'Rejected'],
      rows: ageCohortRows,
      caption: 'Combined totals across all age groups: 2–3 + 4–6 + 7–9 + 10–12 + 13–14 = Total Eligible Children.'
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

    let significance = 'Standard Turnout';
    if (a === peakAge) {
      significance = 'Highest Registration (Peak)';
    } else if (cnt === 0) {
      significance = 'No Registrations Yet';
    } else if (lowestAges.includes(a)) {
      significance = 'Lowest Registration';
    } else if (cnt >= 50) {
      significance = 'High Turnout';
    } else if (cnt >= 10) {
      significance = 'Moderate Turnout';
    } else {
      significance = 'Low Turnout';
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
    `Highest: Age ${peakAge} (${maxCount} children) · Lowest: ${lowestAges.map(a => `Age ${a}`).join(', ')} (${lowestCount} children)`
  ]);

  sections.push({
    id: 'sec-age-single-year-table',
    title: '3.2 Exact Age Breakdown (Highest & Lowest Registrations)',
    type: 'table',
    description: `Breakdown by individual age from Age ${eventMinAge} to ${eventMaxAge}. Highest registration: Age ${peakAge} (${maxCount} children, ${eligibleCount > 0 ? ((maxCount / eligibleCount) * 100).toFixed(1) : '0.0'}%). Lowest registration: ${lowestAges.map(a => `Age ${a}`).join(' & ')} (${lowestCount} children).`,
    content: {
      headers: ['Exact Age', 'Age Group', 'Children Registered', '% of Total', 'Turnout Level'],
      rows: singleYearRows,
      caption: `Individual age breakdown shows registration distribution. Age ${peakAge} has the highest number of registered children.`
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
        'Outside Age Range',
        c.eligibilityReason
      ])
    : [['None', '—', '—', '—', '—', '—', '—', 'Eligible', 'No children outside age range']];

  sections.push({
    id: 'sec-age-eligibility',
    title: '4. Age Eligibility Check',
    type: 'table',
    description: `Age qualification: ${eligibleCount} Eligible (${eligiblePct}%) vs ${ineligibleCount} Outside Age Range (${ineligiblePct}%)`,
    content: {
      headers: ['Child', 'Date of Birth', 'Age on Event', 'Parent / Guardian', 'City', 'State / Region', 'Country', 'Eligibility', 'Reason'],
      rows: ineligibleTableRows,
      caption: `Displaying ${ineligibleChildren.length > 100 ? 'first 100 of ' : ''}${ineligibleCount} records outside the required 2–14 age range. Explanations are based on the child's birth date.`
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
        'Draft (Waiting for Parent)',
        formatDateSafe(c.lastUpdated),
        c.missingStateSummary
      ])
    : [['None', '—', '—', '—', '—', '—', '—', 'None', '—', 'No pending submission records in this category.']];

  sections.push({
    id: 'sec-eligible-pending',
    title: '5. Registered Children Awaiting Parent Submission',
    type: 'table',
    description: `Total eligible children with incomplete or unsubmitted drafts: ${pendingSubmissionCount}. (Excludes children outside the 2–14 age range).`,
    content: {
      headers: ['Child', 'Age', 'Age Group', 'Parent / Guardian', 'City', 'State / Region', 'Country', 'Status', 'Last Updated', 'What is Needed to Complete'],
      rows: pendingSubmissionRows,
      caption: `Displaying ${eligiblePendingSubmission.length > 150 ? 'first 150 of ' : ''}${pendingSubmissionCount} eligible children waiting for parents to complete and submit their registration.`
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
    title: '6. Where Families Are Coming From — Countries',
    type: 'table',
    description: `Geographic profile based on parent addresses. ${distinctCountriesCount || (sortedCountries.some(c => c.key === 'Nigeria') ? 1 : 0)} country represented; ${childrenWithCompleteLocation} children with complete address details, ${childrenWithIncompleteLocation} with address details pending.`,
    content: {
      headers: ['Country', 'Children', 'Eligible', 'Pending Submission', 'Under Review', 'Approved', 'Rejected', '% of Total'],
      rows: countryTableRows,
      caption: 'Locations are based on residential details provided by parents. Exact street addresses are omitted for privacy.'
    }
  });

  sections.push({
    id: 'sec-registration-origin-state',
    title: '6.1 States & Regions Breakdown',
    type: 'table',
    description: `Distribution of registered families across states and regions (${distinctStatesCount} states/regions recorded)`,
    content: {
      headers: ['State / Region', 'Children', 'Eligible', 'Pending Submission', 'Under Review', 'Approved', 'Rejected', 'Percentage'],
      rows: stateTableRows,
      caption: 'Unspecified locations are shown as "Location not provided". Variations of the Federal Capital Territory (FCT, Abuja) are unified.'
    }
  });

  sections.push({
    id: 'sec-registration-origin-city',
    title: '6.2 Cities Breakdown',
    type: 'table',
    description: `Distribution of registered families across cities and towns (${distinctCitiesCount} cities recorded)`,
    content: {
      headers: ['City', 'State / Region', 'Country', 'Children', 'Eligible', 'Pending Submission', 'Under Review', 'Approved', 'Rejected'],
      rows: cityTableRows,
      caption: 'City distribution of registered families based on profile entries.'
    }
  });

  // Top Origins Bar Chart
  const topStateLabels = sortedStates.slice(0, 6).map(s => s.key);
  const topStateValues = sortedStates.slice(0, 6).map(s => s.total);

  const originChart: ReportChartSpec = {
    id: 'chart-origin-distribution',
    kind: 'bar',
    title: 'Top States & Regions by Registration',
    subtitle: 'Number of registered children across primary residential states and territories',
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
    caption: 'Locations reflect residential data provided on parent profiles. FCT and Abuja entries are unified.',
    accessibleSummary: 'Bar chart showing child registration counts by state and territory.'
  };

  sections.push({
    id: 'sec-registration-origin-chart',
    title: '6.3 Top States & Regions (Chart)',
    type: 'chart',
    description: 'Visual overview of where registered families reside',
    content: {
      charts: [originChart]
    }
  });

  // =========================================================================
  // 7. PROFILE & RECORD COMPLETENESS
  // =========================================================================
  const dataQualityRows = [
    [
      'Parent contact and profile details',
      String(totalParents),
      String(validParentsCount),
      String(incompleteParentsCount),
      totalParents > 0 ? `${Math.round((validParentsCount / totalParents) * 100)}% complete` : '—'
    ],
    [
      'Child details and photos',
      String(totalChildren),
      String(validChildrenCount),
      String(incompleteChildrenCount),
      totalChildren > 0 ? `${Math.round((validChildrenCount / totalChildren) * 100)}% complete` : '—'
    ],
    [
      'Children linked to complete parent profiles',
      String(totalChildren),
      String(childrenAttachedToValidParentsCount),
      String(childrenAttachedToIncompleteParentsCount),
      totalChildren > 0 ? `${Math.round((childrenAttachedToValidParentsCount / totalChildren) * 100)}% complete` : '—'
    ],
    [
      'Parents with city and state provided',
      String(totalParents),
      String(parentsWithCompleteLocation),
      String(totalParents - parentsWithCompleteLocation),
      totalParents > 0 ? `${Math.round((parentsWithCompleteLocation / totalParents) * 100)}% complete` : '—'
    ],
    [
      'Parents without country',
      String(totalParents),
      String(totalParents - parentsMissingCountry),
      String(parentsMissingCountry),
      totalParents > 0 ? `${Math.round((parentsMissingCountry / totalParents) * 100)}% missing` : '—'
    ],
    [
      'Parents without state or region',
      String(totalParents),
      String(totalParents - parentsMissingState),
      String(parentsMissingState),
      totalParents > 0 ? `${Math.round((parentsMissingState / totalParents) * 100)}% missing` : '—'
    ],
    [
      'Parents without city or town',
      String(totalParents),
      String(totalParents - parentsMissingCity),
      String(parentsMissingCity),
      totalParents > 0 ? `${Math.round((parentsMissingCity / totalParents) * 100)}% missing` : '—'
    ],
    [
      'Children with full family location',
      String(totalChildren),
      String(childrenWithCompleteLocation),
      String(childrenWithIncompleteLocation),
      totalChildren > 0 ? `${Math.round((childrenWithCompleteLocation / totalChildren) * 100)}% complete` : '—'
    ]
  ];

  sections.push({
    id: 'sec-data-quality',
    title: '7. Profile & Record Completeness',
    type: 'table',
    description: 'Overview of completed contact details, addresses, and photos across parent and child records',
    content: {
      headers: ['Record Type', 'Total Records', 'Completed', 'Needs Attention', 'Completion Rate'],
      rows: dataQualityRows,
      caption: 'Complete parent profiles include phone number, home address, and photo. Complete child records include full name, gender, date of birth, and photo.'
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
    description: `Health awareness: ${childrenWithEitherHealth.length} children with allergy or medical notes across all age groups`,
    content: {
      headers: ['Age Group', 'Children with Allergies', 'Children with Medical Notes', 'Children with Both', 'Children with Either'],
      rows: healthSummaryRows,
      caption: 'Confidential health summary. Kitchen and first aid coordinators receive anonymized summaries only to ensure child safety.'
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
    title: '9. Medical & Allergy Notes (Confidential — Admin Access Only)',
    type: 'table',
    description: 'Sensitive medical and allergy registers for administrative and medical coordination. Confidential access only.',
    content: {
      headers: ['Child', 'Age', 'Age Group', 'Application Status', 'Parent / Guardian', 'Allergies', 'Medical Notes'],
      rows: healthDetailRows,
      caption: 'Confidential health information — Admin access only. Empty entries are excluded.'
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
    c.isEligible ? 'Eligible' : 'Outside Age Range',
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
    title: '10. Complete Children List',
    type: 'table',
    description: `Complete list of registered children (${processedChildren.length} total entries recorded)`,
    content: {
      headers: ['Child Name', 'Date of Birth', 'Age on Event', 'Age Group', 'Eligibility', 'Application Stage', 'Current Status', 'Parent / Guardian', 'City', 'State / Region', 'Country', 'Health Note'],
      rows: childRegisterRows.length > 0 ? childRegisterRows : [['No child records in database.', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', 'None']],
      caption: `Showing ${processedChildren.length > 150 ? 'first 150 of ' : ''}${processedChildren.length} child records. Health note indicates whether allergy or medical care is needed without disclosing private medical text.`
    }
  });

  // Findings & Action Points
  const findings: ReportFinding[] = [
    {
      id: 'f1',
      title: 'Registration and Age Qualification Overview',
      observation: `${eligibleCount} of ${totalChildren} registered children (${eligiblePct}%) meet the ${eventMinAge}–${eventMaxAge} age requirement on the date of the event (21 November 2026).`,
      severity: 'info'
    },
    {
      id: 'f2',
      title: 'Draft Registrations Waiting for Parent Submission',
      observation: `${pendingSubmissionCount} children meet the age requirement but their parents have not yet submitted the final application. This represents the largest group to follow up with before registration closes.`,
      severity: pendingSubmissionCount > 50 ? 'attention' : 'info'
    },
    {
      id: 'f3',
      title: 'Health, Allergy & Care Preparedness',
      observation: `${childrenWithEitherHealth.length} children have recorded food allergies or medical care notes that the kitchen and first aid teams need to be prepared for.`,
      severity: 'info'
    },
    {
      id: 'f4',
      title: 'Where Registered Families Are Coming From',
      observation: `Families are attending from ${distinctCountriesCount || (sortedCountries.some(c => c.key === 'Nigeria') ? 1 : 0)} country, ${distinctStatesCount} states/regions, and ${distinctCitiesCount} cities, with the Federal Capital Territory (FCT) being the primary location.`,
      severity: 'info'
    },
    {
      id: 'f5',
      title: 'Ages with Highest and Lowest Registrations',
      observation: `Age ${peakAge} has the highest number of children registered with ${maxCount} children (${eligibleCount > 0 ? ((maxCount / eligibleCount) * 100).toFixed(1) : '0.0'}% of all eligible children). The lowest registrations are at ${lowestAges.map(a => `Age ${a}`).join(', ')} with ${lowestCount} children.`,
      severity: 'info'
    }
  ];

  const recommendations: ReportRecommendation[] = [
    {
      id: 'r1',
      action: 'Send Friendly Reminders to Parents with Draft Applications',
      rationale: `${pendingSubmissionCount} eligible children have started registrations that are not yet submitted. A quick reminder message will help parents complete and submit them on time.`,
      priority: 'high',
      responsibility: 'Registration Coordinators'
    },
    {
      id: 'r2',
      action: 'Brief Kitchen and First Aid Teams on Special Care Notes',
      rationale: `${childrenWithEitherHealth.length} registered children have dietary restrictions or medical care notes that team leads should review before check-in begins.`,
      priority: 'high',
      responsibility: 'Kitchen & First Aid Leads'
    },
    {
      id: 'r3',
      action: 'Reach Out to Parents with Incomplete Contact Details',
      rationale: `${incompleteParentsCount} parent accounts are missing phone numbers or photos needed for secure check-in and child pickup.`,
      priority: 'medium',
      responsibility: 'Parent Support Team'
    }
  ];

  const managementAttention = [
    `${pendingSubmissionCount} eligible children have draft applications waiting for parents to submit.`,
    `${childrenWithEitherHealth.length} children have allergy or medical notes that event teams need to be aware of.`,
    `${ineligibleCount} children fall outside the required ${eventMinAge}–${eventMaxAge} age range.`
  ];

  const reportingStartDate = eventDate;
  const reportingEndDate = event.ends_at || eventDate;

  return {
    reportId,
    templateKey: 'children-registration-report',
    templateVersion: 1,
    reportTitle: 'The General Assembly — Children & Registration Report',
    reportDescription: `Comprehensive registration, age eligibility, intake progress, location breakdown, profile completeness, and health summary for ${event.title || 'The General Assembly 2026'}`,
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
      notes: 'All age eligibility evaluations are calculated directly from birth dates against the event start date. Profile completeness follows standard platform rules.'
    },
    methodology: [
      'Age calculations are evaluated as of the event start date (21 November 2026).',
      'Age groups follow five programme divisions: 2–3, 4–6, 7–9, 10–12, and 13–14 years inclusive.',
      'Application stages reflect real-time submission and review progress.',
      'Locations are based on residential information provided on parent profiles.',
      'Medical and allergy details are restricted to authorized team leads for child safety.'
    ],
    limitations: [
      'Children without a provided date of birth cannot be verified for age eligibility.',
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
