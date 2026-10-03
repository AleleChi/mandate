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
