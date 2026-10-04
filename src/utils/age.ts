export interface ChildAgeCalculationResult {
  years: number | null;
  months: number;
  display: string;
  isVerified: boolean;
}

/**
 * Calculates a child's age based on date of birth.
 * Properly handles infants under 1 year old (age 0).
 */
export function calculateChildAge(dateOfBirth: string | null | undefined): ChildAgeCalculationResult {
  if (!dateOfBirth) {
    return {
      years: null,
      months: 0,
      display: "Age not verified",
      isVerified: false
    };
  }

  const birthDate = new Date(dateOfBirth);
  const today = new Date();

  if (isNaN(birthDate.getTime()) || birthDate > today) {
    return {
      years: null,
      months: 0,
      display: "Age not verified",
      isVerified: false
    };
  }

  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  if (dayDiff < 0) {
    months--;
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  if (years < 0) {
    years = 0;
  }

  const display = years === 0 ? "Under 1 year old" : `${years} ${years === 1 ? 'year' : 'years'} old`;

  return {
    years,
    months,
    display,
    isVerified: true
  };
}

// Proof attribute indicator helper
// data-component-version="child-age-calculation-v2-under-one"
export const CHILD_AGE_CALCULATION_VERSION = "child-age-calculation-v2-under-one";

export const EVENT_START_DATE_2026 = '2026-11-21';
export const MIN_ELIGIBLE_AGE = 2;
export const MAX_ELIGIBLE_AGE = 14;

export interface EventAgeEligibilityResult {
  isEligible: boolean;
  ageOnEventDate: number | null;
  message?: string;
}

/**
 * Accurately calculates child's completed age on the event start date (21 November 2026).
 * Strict calendar comparison prevents timezone shifts from affecting birthday calculations.
 */
export function calculateAgeOnEventDate(
  dobString?: string | null,
  eventDateString: string = EVENT_START_DATE_2026
): number | null {
  if (!dobString) return null;
  const matchDob = dobString.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!matchDob) return null;
  const birthYear = parseInt(matchDob[1], 10);
  const birthMonth = parseInt(matchDob[2], 10);
  const birthDay = parseInt(matchDob[3], 10);

  const matchRef = eventDateString.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!matchRef) return null;
  const refYear = parseInt(matchRef[1], 10);
  const refMonth = parseInt(matchRef[2], 10);
  const refDay = parseInt(matchRef[3], 10);

  let age = refYear - birthYear;
  const isBeforeBirthday =
    refMonth < birthMonth || (refMonth === birthMonth && refDay < birthDay);
  if (isBeforeBirthday) {
    age--;
  }
  return age >= 0 ? age : 0;
}

/**
 * Early frontend eligibility evaluation against General Assembly 2026 participation rules:
 * Eligible ages: 2 through 14 inclusive, calculated on 21 November 2026.
 */
export function checkChildEventEligibility(
  dobString?: string | null,
  eventDateString: string = EVENT_START_DATE_2026,
  minAge: number = MIN_ELIGIBLE_AGE,
  maxAge: number = MAX_ELIGIBLE_AGE
): EventAgeEligibilityResult {
  if (!dobString) {
    return { isEligible: true, ageOnEventDate: null };
  }

  const ageOnEventDate = calculateAgeOnEventDate(dobString, eventDateString);
  if (ageOnEventDate === null) {
    return { isEligible: true, ageOnEventDate: null };
  }

  if (ageOnEventDate < minAge || ageOnEventDate > maxAge) {
    const message = (minAge !== undefined && maxAge !== undefined)
      ? `This programme is currently open to children ages ${minAge}–${maxAge}.`
      : 'This programme is currently open to children ages 2–14.';
    return {
      isEligible: false,
      ageOnEventDate,
      message
    };
  }

  return {
    isEligible: true,
    ageOnEventDate
  };
}
