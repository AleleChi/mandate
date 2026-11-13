/**
 * Frontend Canonical Volunteer Age-Group Helper
 * Normalizes cohort names, aliases, and ranges for offline operations and UI consistency.
 *
 * NOTE: For all online operations, backend API scope resolution is authoritative.
 */

export function normalizeVolunteerAgeGroup(value?: string | null): string {
  if (!value) return '';
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^ages?\s*/i, '')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')
    .replace(/\s+to\s+/g, '-')
    .replace(/\s*-\s*/g, '-');

  const aliases: Record<string, string> = {
    // 2–3 cohort
    '2-3': '2–3',
    '2–3': '2–3',
    '2': '2–3',
    '3': '2–3',
    'toddler': '2–3',
    'toddlers': '2–3',
    'creche': '2–3',

    // 4–6 cohort
    '4-6': '4–6',
    '4–6': '4–6',
    '4': '4–6',
    '5': '4–6',
    '6': '4–6',
    'preschool': '4–6',

    // 7–9 cohort
    '7-9': '7–9',
    '7–9': '7–9',
    '7': '7–9',
    '8': '7–9',
    '9': '7–9',

    // 10–12 cohort
    '10-12': '10–12',
    '10–12': '10–12',
    '10': '10–12',
    '11': '10–12',
    '12': '10–12',

    // 13–14 cohort
    '13-14': '13–14',
    '13–14': '13–14',
    '13': '13–14',
    '14': '13–14',
    'teen': '13–14',
    'teens': '13–14'
  };

  return aliases[raw] || '';
}

/**
 * Validates child scope strictly for OFFLINE operations when backend cannot be reached.
 */
export function isChildInAssignedScopeOffline(
  child: any,
  assignedAgeGroups: string[],
  isOrdinaryVolunteer: boolean
): boolean {
  if (!isOrdinaryVolunteer) return true;
  if (!assignedAgeGroups || assignedAgeGroups.length === 0) return false;

  const rawGroup = child?.ageGroup || child?.classGroup || child?.className || '';
  let canonicalChildGroup = normalizeVolunteerAgeGroup(rawGroup);

  if (!canonicalChildGroup) {
    const ageNum = Number(child?.age ?? child?.calculatedAge);
    if (!isNaN(ageNum) && isFinite(ageNum) && ageNum >= 2 && ageNum <= 14) {
      if (ageNum >= 2 && ageNum <= 3) canonicalChildGroup = '2–3';
      else if (ageNum >= 4 && ageNum <= 6) canonicalChildGroup = '4–6';
      else if (ageNum >= 7 && ageNum <= 9) canonicalChildGroup = '7–9';
      else if (ageNum >= 10 && ageNum <= 12) canonicalChildGroup = '10–12';
      else if (ageNum >= 13 && ageNum <= 14) canonicalChildGroup = '13–14';
    }
  }

  if (!canonicalChildGroup) {
    return false;
  }

  return assignedAgeGroups.some(assigned => {
    const canonicalAssigned = normalizeVolunteerAgeGroup(assigned);
    return canonicalAssigned && canonicalAssigned === canonicalChildGroup;
  });
}
