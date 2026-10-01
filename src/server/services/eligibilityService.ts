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

  const eventDate = event?.starts_at || event?.event_start_at || null;
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
    : (event?.minimumAge !== undefined && event?.minimumAge !== null ? event.minimumAge : null);

  const rawMax = event?.maximum_age !== undefined && event?.maximum_age !== null
    ? event.maximum_age
    : (event?.maximumAge !== undefined && event?.maximumAge !== null ? event.maximumAge : null);

  const minAge = rawMin !== null && !isNaN(Number(rawMin)) ? Number(rawMin) : null;
  const maxAge = rawMax !== null && !isNaN(Number(rawMax)) ? Number(rawMax) : null;

  // 1. Minimum age check
  if (minAge !== null && childAge < minAge) {
    return {
      eligible: false,
      status: 'ineligible',
      code: 'BELOW_MINIMUM_AGE',
      reason: `Children must be at least ${minAge} years old by the event date to be eligible for this programme.`,
      childAgeOnEventDate: childAge,
      minimumAge: minAge,
      maximumAge: maxAge,
      eventDate
    };
  }

  // 2. Maximum age check (only enforced if maximum age is explicitly configured)
  if (maxAge !== null && childAge > maxAge) {
    return {
      eligible: false,
      status: 'ineligible',
      code: 'ABOVE_MAXIMUM_AGE',
      reason: `This event is open to children up to ${maxAge} years old.`,
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
