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

export function normalizeAgeGroup(g?: string | null): string {
  if (!g) return '';
  const trimmed = String(g).trim();
  if (!trimmed) return '';

  // Remove leading 'Ages ' or 'Age ' (case-insensitive)
  let cleaned = trimmed.replace(/^Ages?\s+/i, '');

  // Normalize Unicode dashes and 'to':
  // - hyphen \u002D (-)
  // - non-breaking hyphen \u2011 (‑)
  // - figure dash \u2012 (‒)
  // - en dash \u2013 (–)
  // - em dash \u2014 (—)
  // - horizontal bar \u2015 (―)
  cleaned = cleaned
    .replace(/[\u002D\u2011\u2012\u2013\u2014\u2015]/g, '–')
    .replace(/\s+to\s+/i, '–')
    .replace(/\s*–\s*/g, '–')
    .trim();

  // Validate against canonical groups
  const canonicalGroups: CanonicalAgeGroupKey[] = ['2–3', '4–6', '7–9', '10–12', '13–14'];
  for (const cg of canonicalGroups) {
    if (cleaned === cg) {
      return cg;
    }
  }

  return '';
}

export function parseAssignedAgeGroups(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch (e) {}
    }
    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Shared Authoritative Child Scope Resolver for Volunteer & Pass operations.
 * Priority:
 * 1. DOB + event date (authoritative)
 * 2. calculated_age (numeric or string) if DOB unavailable
 * 3. legacy stored age_group (normalized) as last fallback
 */
export function resolveChildScopeAgeGroup(
  child: {
    date_of_birth?: string | null;
    calculated_age?: number | string | null;
    age_group?: string | null;
  },
  eventStart?: string | Date | null
): {
  age: number | null;
  group: string;
} {
  const refDate = eventStart || CANONICAL_GA_EVENT_DATE;

  // 1. DOB + event date: primary authoritative source
  if (child?.date_of_birth && String(child.date_of_birth).trim()) {
    const res = resolveCanonicalAgeGroup(child.date_of_birth, refDate);
    if (res.group) {
      return { age: res.age, group: res.group };
    }
    if (res.age !== null) {
      return { age: res.age, group: '' };
    }
  }

  // 2. calculated_age: if DOB unavailable
  if (child?.calculated_age !== null && child?.calculated_age !== undefined) {
    const raw = String(child.calculated_age).trim();
    if (raw) {
      const num = Number(raw);
      if (!isNaN(num) && isFinite(num)) {
        const res = resolveCanonicalAgeGroup(num, refDate);
        if (res.group) {
          return { age: res.age, group: res.group };
        }
        return { age: num, group: '' };
      }
    }
  }

  // 3. legacy stored age_group: only as last fallback
  if (child?.age_group) {
    const norm = normalizeAgeGroup(child.age_group);
    if (norm) {
      return { age: null, group: norm };
    }
  }

  return { age: null, group: '' };
}

export function isChildInScope(
  child: {
    age_group?: string | null;
    calculated_age?: number | string | null;
    date_of_birth?: string | null;
  },
  assignedGroups: string[],
  eventStart?: string | Date | null
): boolean {
  if (!assignedGroups || assignedGroups.length === 0) return false;

  const normalizedAssigned = assignedGroups
    .map(normalizeAgeGroup)
    .filter(Boolean);

  if (normalizedAssigned.length === 0) return false;

  const childScope = resolveChildScopeAgeGroup(child, eventStart);
  if (!childScope.group) return false;

  return normalizedAssigned.includes(childScope.group);
}

export function buildAgeGroupSqlFilter(assignedGroups: string[], tableAlias = 'c'): { clause: string; params: any[] } {
  if (!assignedGroups || assignedGroups.length === 0) {
    return { clause: '1=0', params: [] };
  }
  const conditions: string[] = [];
  for (const group of assignedGroups) {
    const norm = normalizeAgeGroup(group);
    if (norm === '2–3') {
      conditions.push(`(${tableAlias}.age_group LIKE '%2%3%' OR (${tableAlias}.calculated_age >= 2 AND ${tableAlias}.calculated_age <= 3))`);
    } else if (norm === '4–6') {
      conditions.push(`(${tableAlias}.age_group LIKE '%4%6%' OR (${tableAlias}.calculated_age >= 4 AND ${tableAlias}.calculated_age <= 6))`);
    } else if (norm === '7–9') {
      conditions.push(`(${tableAlias}.age_group LIKE '%7%9%' OR (${tableAlias}.calculated_age >= 7 AND ${tableAlias}.calculated_age <= 9))`);
    } else if (norm === '10–12') {
      conditions.push(`(${tableAlias}.age_group LIKE '%10%12%' OR (${tableAlias}.calculated_age >= 10 AND ${tableAlias}.calculated_age <= 12))`);
    } else if (norm === '13–14') {
      conditions.push(`(${tableAlias}.age_group LIKE '%13%14%' OR (${tableAlias}.calculated_age >= 13 AND ${tableAlias}.calculated_age <= 14))`);
    } else {
      conditions.push(`${tableAlias}.age_group = '${group.replace(/'/g, "''")}'`);
    }
  }
  return {
    clause: conditions.length > 0 ? `(${conditions.join(' OR ')})` : '1=1',
    params: []
  };
}
