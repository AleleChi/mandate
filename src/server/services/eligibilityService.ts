/**
 * Event-scoped age eligibility calculation service.
 * Separates ministry/programme age cohort grouping from event-specific participation rules.
 */

export interface EventEligibilityResult {
  eligible: boolean;
  status: 'eligible' | 'ineligible';
  reason?: string;
  code: 'ELIGIBLE' | 'BELOW_MINIMUM_AGE' | 'ABOVE_MAXIMUM_AGE' | 'INVALID_DOB';
  childAgeOnEventDate: number | null;
  minimumAge: number | null;
  maximumAge: number | null;
  eventDate: string | null;
}

export interface EligibilityEventContext {
  id?: string;
  title?: string;
  starts_at?: string | null;
  event_start_at?: string | null;
  minimum_age?: number | null;
  maximum_age?: number | null;
  minimumAge?: number | null;
  maximumAge?: number | null;
}

/**
 * Helper to safely extract calendar year, month, and day without timezone shift.
 */
function parseCalendarDateParts(dateInput?: string | Date | null): { year: number; month: number; day: number } | null {
  if (!dateInput) return null;
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    // Match leading YYYY-MM-DD or YYYY/MM/DD
    const match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return { year, month, day };
      }
    }
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return null;
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  } else if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return null;
    return { year: dateInput.getUTCFullYear(), month: dateInput.getUTCMonth() + 1, day: dateInput.getUTCDate() };
  }
  return null;
}

export const CANONICAL_GA_EVENT_DATE = '2026-11-21';
export const CANONICAL_MIN_AGE = 2;
export const CANONICAL_MAX_AGE = 14;

export const CANONICAL_PROGRAMME_AGE_GROUPS = [
  { key: '2–3', label: '2–3', minAge: 2, maxAge: 3 },
  { key: '4–6', label: '4–6', minAge: 4, maxAge: 6 },
  { key: '7–9', label: '7–9', minAge: 7, maxAge: 9 },
  { key: '10–12', label: '10–12', minAge: 10, maxAge: 12 },
  { key: '13–14', label: '13–14', minAge: 13, maxAge: 14 }
] as const;

export type CanonicalAgeGroupKey = '2–3' | '4–6' | '7–9' | '10–12' | '13–14';

export interface CanonicalAgeGroupResolution {
  group: CanonicalAgeGroupKey | null;
  label: string;
  isOutOfRange: boolean;
  age: number | null;
}

/**
 * Authoritative Server-Side Age Group Resolver for Koinonia 2026.
 * Resolves child age group strictly against canonical event date (or specified event date).
 * Age boundaries (inclusive):
 * - 2 to 3   -> '2–3'
 * - 4 to 6   -> '4–6'
 * - 7 to 9   -> '7–9'
 * - 10 to 12 -> '10–12'
 * - 13 to 14 -> '13–14'
 * - < 2 or > 14 (or missing DOB/age) -> OUT_OF_RANGE ('Age review needed')
 */
export function resolveCanonicalAgeGroup(
  dobOrAge: string | number | null | undefined,
  referenceDate: string | Date = CANONICAL_GA_EVENT_DATE
): CanonicalAgeGroupResolution {
  let calculatedAge: number | null = null;

  if (typeof dobOrAge === 'number') {
    calculatedAge = !isNaN(dobOrAge) && dobOrAge >= 0 ? dobOrAge : null;
  } else if (typeof dobOrAge === 'string' && dobOrAge.trim()) {
    const trimmed = dobOrAge.trim();
    if (/^\d+$/.test(trimmed)) {
      calculatedAge = parseInt(trimmed, 10);
    } else {
      calculatedAge = calculateAgeOnDate(trimmed, referenceDate);
    }
  }

  if (calculatedAge === null || calculatedAge < 2 || calculatedAge > 14) {
    return {
      group: null,
      label: 'Age review needed',
      isOutOfRange: true,
      age: calculatedAge
    };
  }

  if (calculatedAge >= 2 && calculatedAge <= 3) {
    return { group: '2–3', label: '2–3', isOutOfRange: false, age: calculatedAge };
  }
  if (calculatedAge >= 4 && calculatedAge <= 6) {
    return { group: '4–6', label: '4–6', isOutOfRange: false, age: calculatedAge };
  }
  if (calculatedAge >= 7 && calculatedAge <= 9) {
    return { group: '7–9', label: '7–9', isOutOfRange: false, age: calculatedAge };
  }
  if (calculatedAge >= 10 && calculatedAge <= 12) {
    return { group: '10–12', label: '10–12', isOutOfRange: false, age: calculatedAge };
  }
  if (calculatedAge >= 13 && calculatedAge <= 14) {
    return { group: '13–14', label: '13–14', isOutOfRange: false, age: calculatedAge };
  }

  return {
    group: null,
    label: 'Age review needed',
    isOutOfRange: true,
    age: calculatedAge
  };
}

/**
 * Calculates portable YYYY-MM-DD DOB cutoffs for SQL date comparison across PostgreSQL and SQLite.
 * Eliminates non-portable database functions like strftime().
 * - Too young if child DOB > minAgeDobCutoff (born after (eventYear - minAge)-eventMonth-eventDay)
 * - Too old if child DOB <= maxAgeDobCutoff (born on or before (eventYear - (maxAge + 1))-eventMonth-eventDay)
 */
export function getDobCutoffsForEvent(
  eventDateStr: string = CANONICAL_GA_EVENT_DATE,
  minAge: number = CANONICAL_MIN_AGE,
  maxAge: number = CANONICAL_MAX_AGE
): { minAgeDobCutoff: string; maxAgeDobCutoff: string } {
  const parts = parseCalendarDateParts(eventDateStr);
  const year = parts ? parts.year : 2026;
  const month = parts ? String(parts.month).padStart(2, '0') : '11';
  const day = parts ? String(parts.day).padStart(2, '0') : '21';

  const minYear = year - minAge;
  const maxYear = year - (maxAge + 1);

  return {
    minAgeDobCutoff: `${minYear}-${month}-${day}`,
    maxAgeDobCutoff: `${maxYear}-${month}-${day}`
  };
}

/**
 * Accurately calculates child's age in completed years on a specific target date (e.g. event start date).
 * Uses strict calendar-date semantics to prevent timezone parsing from shifting birthdays by one day.
 */
export function calculateAgeOnDate(dobStr: string, referenceDateStr?: string | Date | null): number | null {
  const dobParts = parseCalendarDateParts(dobStr);
  if (!dobParts) return null;

  const refParts = parseCalendarDateParts(referenceDateStr) || parseCalendarDateParts(new Date());
  if (!refParts) return null;

  let age = refParts.year - dobParts.year;
  const isBeforeBirthdayThisYear =
    refParts.month < dobParts.month ||
    (refParts.month === dobParts.month && refParts.day < dobParts.day);

  if (isBeforeBirthdayThisYear) {
    age--;
  }

  return age >= 0 ? age : 0;
}

/**
 * Evaluates whether a child is eligible to register for a specific event
 * based on the child's DOB, event start date, and event eligibility rules.
 */
export function checkEventEligibility(
  dob: string,
  event?: EligibilityEventContext | null
): EventEligibilityResult {
  if (!dob) {
    return {
      eligible: false,
      status: 'ineligible',
      code: 'INVALID_DOB',
      reason: 'A valid date of birth is required to verify event eligibility.',
      childAgeOnEventDate: null,
      minimumAge: null,
      maximumAge: null,
      eventDate: null
    };
  }

  const eventDate = event?.starts_at || event?.event_start_at || CANONICAL_GA_EVENT_DATE;
  const childAge = calculateAgeOnDate(dob, eventDate);

  if (childAge === null) {
    return {
      eligible: false,
      status: 'ineligible',
      code: 'INVALID_DOB',
      reason: 'A valid date of birth is required to verify event eligibility.',
      childAgeOnEventDate: null,
      minimumAge: null,
      maximumAge: null,
      eventDate
    };
  }

  const rawMin = event?.minimum_age !== undefined && event?.minimum_age !== null
    ? event.minimum_age
    : (event?.minimumAge !== undefined && event?.minimumAge !== null
        ? event.minimumAge
        : (event === undefined || event === null ? CANONICAL_MIN_AGE : null));

  const rawMax = event?.maximum_age !== undefined
    ? event.maximum_age
    : (event?.maximumAge !== undefined
        ? event.maximumAge
        : (event === undefined || event === null ? CANONICAL_MAX_AGE : null));

  const minAge = rawMin !== null && !isNaN(Number(rawMin)) ? Number(rawMin) : null;
  const maxAge = rawMax !== null && !isNaN(Number(rawMax)) ? Number(rawMax) : null;

  // 1. Minimum age check
  if (minAge !== null && childAge < minAge) {
    const reason = (minAge !== null && maxAge !== null)
      ? `This programme is currently open to children ages ${minAge}–${maxAge}.`
      : (minAge === CANONICAL_MIN_AGE && (maxAge === CANONICAL_MAX_AGE || maxAge === null))
        ? 'This programme is currently open to children ages 2–14.'
        : `Children must be at least ${minAge} years old by the event date to be eligible for this programme.`;

    return {
      eligible: false,
      status: 'ineligible',
      code: 'BELOW_MINIMUM_AGE',
      reason,
      childAgeOnEventDate: childAge,
      minimumAge: minAge,
      maximumAge: maxAge,
      eventDate
    };
  }

  // 2. Maximum age check (only enforced if maximum age is explicitly configured)
  if (maxAge !== null && childAge > maxAge) {
    const reason = (minAge !== null && maxAge !== null)
      ? `This programme is currently open to children ages ${minAge}–${maxAge}.`
      : (minAge === CANONICAL_MIN_AGE && maxAge === CANONICAL_MAX_AGE)
        ? 'This programme is currently open to children ages 2–14.'
        : `This event is open to children up to ${maxAge} years old.`;

    return {
      eligible: false,
      status: 'ineligible',
      code: 'ABOVE_MAXIMUM_AGE',
      reason,
      childAgeOnEventDate: childAge,
      minimumAge: minAge,
      maximumAge: maxAge,
      eventDate
    };
  }

  // 3. Eligible (either passed both checks or event has no restrictions like historical events)
  return {
    eligible: true,
    status: 'eligible',
    code: 'ELIGIBLE',
    childAgeOnEventDate: childAge,
    minimumAge: minAge,
    maximumAge: maxAge,
    eventDate
  };
}
