import { Response } from 'express';
import { jsPDF } from 'jspdf';
import QRCodeLib from 'qrcode';
import { query } from '../db';
import { AuthenticatedRequest } from '../auth';
import {
  calculateAgeOnDate,
  CANONICAL_GA_EVENT_DATE,
  CANONICAL_PROGRAMME_AGE_GROUPS,
  resolveCanonicalAgeGroup
} from './eligibilityService';
import { getCurrentEvent, getEventById, EventRow } from './eventService';
import { normalizeAgeGroupLabelToRange } from '../routes/admin';
import { getValidatedBrandLogo } from './reportService';

async function resolveAdminEvent(explicitEventId?: string | null): Promise<EventRow | null> {
  if (explicitEventId && typeof explicitEventId === 'string' && explicitEventId.trim()) {
    const cleanId = explicitEventId.trim();
    const ev = await getEventById(cleanId);
    if (!ev) {
      const err: any = new Error(`Event not found: ${cleanId}`);
      err.statusCode = 404;
      throw err;
    }
    return ev;
  }
  return await getCurrentEvent();
}

export function getChildAge(c: any, referenceDate?: string | Date | null): number {
  if (c.date_of_birth) {
    const age = calculateAgeOnDate(c.date_of_birth, referenceDate || CANONICAL_GA_EVENT_DATE);
    if (age !== null) return age;
  }
  if (c.calculated_age !== null && c.calculated_age !== undefined && !isNaN(Number(c.calculated_age))) {
    return Number(c.calculated_age);
  }
  return -1;
}

/**
 * Determine report age group strictly from actual numeric age on event date.
 * Does NOT let legacy event configuration labels (such as 'Ages 1' for 1-3)
 * distort the ministry canonical reporting buckets:
 * 2–3, 4–6, 7–9, 10–12, 13–14.
 */
export function resolveReportAgeGroup(c: any, eventDate: string | Date = CANONICAL_GA_EVENT_DATE): string {
  const numericAge = getChildAge(c, eventDate);
  if (numericAge !== null && numericAge >= 0) {
    if (numericAge >= 2 && numericAge <= 3) return '2–3';
    if (numericAge >= 4 && numericAge <= 6) return '4–6';
    if (numericAge >= 7 && numericAge <= 9) return '7–9';
    if (numericAge >= 10 && numericAge <= 12) return '10–12';
    if (numericAge >= 13 && numericAge <= 14) return '13–14';
    return 'Age review needed';
  }

  if (c.date_of_birth) {
    const canonicalRes = resolveCanonicalAgeGroup(c.date_of_birth, eventDate);
    if (!canonicalRes.isOutOfRange && canonicalRes.group) {
      return canonicalRes.group;
    }
  }

  return 'Age review needed';
}

export interface SelectedChildRecord {
  childId: string;
  eventEntryId: string;
  fullName: string;
  photoUrl: string | null;
  dateOfBirth: string;
  age: number;
  ageGroup: string;
  gender: string;
  parent: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
  };
  pickupPerson?: {
    fullName: string;
    relationship: string;
    phone: string | null;
    isPrimaryParent: boolean;
  };
  passStatus: 'pass_ready' | 'missing_pass';
  attendanceStatus: 'not_arrived' | 'checked_in' | 'inside' | 'picked_up';
  passReference: string | null;
}

export interface ExactAgeCount {
  age: number;
  selected: number;
  passReady: number;
  missingPass: number;
}

export interface AgeGroupBreakdownItem {
  ageGroup: string;
  selected: number;
  passReady: number;
  missingPass: number;
  ages: ExactAgeCount[];
}

export type SelectedChildrenSortOption = 'name_asc' | 'name_desc' | 'age_asc' | 'age_desc';

const VALID_SORT_OPTIONS = new Set<SelectedChildrenSortOption>([
  'name_asc',
  'name_desc',
  'age_asc',
  'age_desc'
]);

function parseCustomAgeBound(raw: unknown, label: string): number | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'all') return null;
  const num = Number(trimmed);
  if (!Number.isInteger(num) || num < 2 || num > 14) {
    const err: any = new Error(`Invalid ${label} parameter: ${raw}. Must be an integer between 2 and 14.`);
    err.statusCode = 400;
    throw err;
  }
  return num;
}

export function sortSelectedChildren(
  records: SelectedChildRecord[],
  sortOption: SelectedChildrenSortOption
): SelectedChildRecord[] {
  const compareNameAsc = (a: SelectedChildRecord, b: SelectedChildRecord): number => {
    const nameA = (a.fullName || '').trim().toLowerCase();
    const nameB = (b.fullName || '').trim().toLowerCase();
    const cmp = nameA.localeCompare(nameB, 'en', { sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    return a.childId.localeCompare(b.childId);
  };

  return [...records].sort((a, b) => {
    switch (sortOption) {
      case 'name_desc': {
        const nameA = (a.fullName || '').trim().toLowerCase();
        const nameB = (b.fullName || '').trim().toLowerCase();
        const cmp = nameB.localeCompare(nameA, 'en', { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return a.childId.localeCompare(b.childId);
      }
      case 'age_asc':
        return a.age !== b.age ? a.age - b.age : compareNameAsc(a, b);
      case 'age_desc':
        return a.age !== b.age ? b.age - a.age : compareNameAsc(a, b);
      case 'name_asc':
      default:
        return compareNameAsc(a, b);
    }
  });
}

export interface SelectedChildrenReportData {
  event: {
    id: string;
    title: string;
    starts_at: string;
  };
  summary: {
    totalSelected: number;
    passReady: number;
    missingPass: number;
    checkedIn: number;
    inside: number;
    pickedUp: number;
  };
  ageGroups: Array<{
    ageGroup: string;
    selected: number;
    passReady: number;
    missingPass: number;
  }>;
  ageBreakdown: AgeGroupBreakdownItem[];
  filtered: SelectedChildRecord[];
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
    paginatedChildren: SelectedChildRecord[];
  };
  filters: {
    search: string;
    ageGroup: string;
    exactAge: number | null;
    minAge: number | null;
    maxAge: number | null;
    sort: SelectedChildrenSortOption;
    passStatus: string;
    attendanceStatus: string;
    gender: string;
  };
}

/**
 * Single source of truth for Selected Children report data across JSON, CSV, and PDF.
 */
export async function getSelectedChildrenReportData(params: {
  eventId?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  ageGroup?: string;
  exactAge?: number | string;
  minAge?: number | string;
  maxAge?: number | string;
  sort?: string;
  passStatus?: string;
  attendanceStatus?: string;
  gender?: string;
}): Promise<SelectedChildrenReportData> {
  const event = await resolveAdminEvent(params.eventId);
  if (!event) {
    const err: any = new Error('Event not found');
    err.statusCode = 404;
    throw err;
  }

  const eventId = event.id;
  const eventTitle = event.title;
  const eventDate = event.starts_at || CANONICAL_GA_EVENT_DATE;

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, params.pageSize || 25);
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const ageGroupFilter = typeof params.ageGroup === 'string' ? params.ageGroup.trim() : '';
  let exactAgeFilter: number | null = null;
  if (
    params.exactAge !== undefined &&
    params.exactAge !== null &&
    String(params.exactAge).trim() !== '' &&
    String(params.exactAge).trim().toLowerCase() !== 'all'
  ) {
    const parsedExact = Number(String(params.exactAge).trim());
    if (!Number.isInteger(parsedExact) || parsedExact < 0 || parsedExact > 120) {
      const err: any = new Error(`Invalid exactAge filter: ${params.exactAge}`);
      err.statusCode = 400;
      throw err;
    }
    exactAgeFilter = parsedExact;
  }
  const passStatusFilter = typeof params.passStatus === 'string' ? params.passStatus.trim() : '';
  const attendanceStatusFilter = typeof params.attendanceStatus === 'string' ? params.attendanceStatus.trim() : '';
  const genderFilter = typeof params.gender === 'string' ? params.gender.trim() : '';

  let minAgeFilter = parseCustomAgeBound(params.minAge, 'minAge');
  let maxAgeFilter = parseCustomAgeBound(params.maxAge, 'maxAge');
  if (minAgeFilter !== null && maxAgeFilter === null) {
    maxAgeFilter = 14;
  } else if (minAgeFilter === null && maxAgeFilter !== null) {
    minAgeFilter = 2;
  }
  if (minAgeFilter !== null && maxAgeFilter !== null && minAgeFilter > maxAgeFilter) {
    const err: any = new Error(`Invalid age range: minAge (${minAgeFilter}) cannot exceed maxAge (${maxAgeFilter}).`);
    err.statusCode = 400;
    throw err;
  }

  const rawSort = typeof params.sort === 'string' && params.sort.trim() !== ''
    ? params.sort.trim()
    : 'name_asc';
  if (!VALID_SORT_OPTIONS.has(rawSort as SelectedChildrenSortOption)) {
    const err: any = new Error(`Invalid sort parameter: ${params.sort}`);
    err.statusCode = 400;
    throw err;
  }
  const sortOption = rawSort as SelectedChildrenSortOption;

  // Query all active selected entries for this event with parent, pass, and authorised pickup information
  const rows = await query(`
    SELECT 
      e.id as event_entry_id,
      e.child_id,
      e.status as entry_status,
      c.full_name as child_name,
      c.date_of_birth,
      c.calculated_age,
      c.age_group as child_stored_age_group,
      c.gender,
      c.photo_file_id,
      m.secure_url as child_photo_url,
      p.id as parent_id,
      p.full_name as parent_name,
      p.phone_number as parent_phone,
      COALESCE(p.email, u.email) as parent_email,
      ep.id as active_pass_id,
      ep.pass_reference,
      ep.status as pass_record_status,
      pk.id as pickup_id,
      pk.pickup_type,
      pk.full_name as pickup_name,
      pk.relationship_to_child as pickup_relationship,
      pk.phone_number as pickup_phone
    FROM child_event_entries e
    JOIN children c ON c.id = e.child_id
    LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN media_files m ON m.id = c.photo_file_id
    LEFT JOIN event_passes ep ON ep.child_event_entry_id = e.id AND ep.status = 'active'
    LEFT JOIN pickup_people pk ON pk.child_event_entry_id = e.id
    WHERE e.event_id = ?
      AND (e.is_deleted = 0 OR e.is_deleted IS NULL)
      AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
      AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
    ORDER BY LOWER(TRIM(c.full_name)) ASC, c.id ASC
  `, [eventId]);

  // Map each child strictly to canonical report age group
  const allMapped: SelectedChildRecord[] = rows.map((r: any) => {
    const numericAge = getChildAge(r, eventDate);
    const resolvedAgeGroup = resolveReportAgeGroup(r, eventDate);

    const hasActivePass = Boolean(r.active_pass_id) || ['pass_ready', 'checked_in', 'inside', 'picked_up'].includes(r.entry_status);
    const passStatus: 'pass_ready' | 'missing_pass' = hasActivePass ? 'pass_ready' : 'missing_pass';

    let attendanceStatus: 'not_arrived' | 'checked_in' | 'inside' | 'picked_up' = 'not_arrived';
    if (r.entry_status === 'picked_up' || r.entry_status === 'checked_out') {
      attendanceStatus = 'picked_up';
    } else if (r.entry_status === 'inside') {
      attendanceStatus = 'inside';
    } else if (r.entry_status === 'checked_in') {
      attendanceStatus = 'checked_in';
    }

    let genderDisplay = 'Unspecified';
    const rawGender = String(r.gender || '').trim().toLowerCase();
    if (['male', 'm', 'boy', 'boys'].includes(rawGender)) {
      genderDisplay = 'Male';
    } else if (['female', 'f', 'girl', 'girls'].includes(rawGender)) {
      genderDisplay = 'Female';
    }

    // Resolve current canonical authorised pickup person (Requirements 11 & 12)
    const hasDesignatedPickup = Boolean(r.pickup_name && String(r.pickup_name).trim());
    let pickupFullName = (r.parent_name || 'Primary Parent').trim();
    let pickupRelationship = 'Primary parent';
    let pickupPhone = r.parent_phone || null;
    let isPrimaryParent = true;

    if (hasDesignatedPickup) {
      pickupFullName = String(r.pickup_name).trim();
      pickupRelationship = (r.pickup_relationship && String(r.pickup_relationship).trim()) || 'Authorised pickup';
      pickupPhone = r.pickup_phone || r.parent_phone || null;
      if (r.pickup_type === 'parent' || pickupFullName.toLowerCase() === (r.parent_name || '').trim().toLowerCase()) {
        isPrimaryParent = true;
        if (!r.pickup_relationship) {
          pickupRelationship = 'Primary parent';
        }
      } else {
        isPrimaryParent = false;
      }
    }

    return {
      childId: r.child_id,
      eventEntryId: r.event_entry_id,
      fullName: r.child_name || 'Unnamed Child',
      photoUrl: r.child_photo_url || null,
      dateOfBirth: r.date_of_birth || '',
      age: numericAge !== null && numericAge >= 0 ? numericAge : (r.calculated_age ? Number(r.calculated_age) : 0),
      ageGroup: resolvedAgeGroup,
      gender: genderDisplay,
      parent: {
        id: r.parent_id || '',
        fullName: r.parent_name || 'Parent / Guardian',
        phone: r.parent_phone || null,
        email: r.parent_email || null
      },
      pickupPerson: {
        fullName: pickupFullName,
        relationship: pickupRelationship,
        phone: pickupPhone,
        isPrimaryParent
      },
      passStatus,
      attendanceStatus,
      passReference: r.pass_reference || null
    };
  });

  // Sort deterministically alphabetically by child name (case-insensitive)
  allMapped.sort((a, b) => a.fullName.localeCompare(b.fullName, 'en', { sensitivity: 'base' }));

  // Overall event summary
  const summary = {
    totalSelected: allMapped.length,
    passReady: allMapped.filter((c) => c.passStatus === 'pass_ready').length,
    missingPass: allMapped.filter((c) => c.passStatus === 'missing_pass').length,
    checkedIn: allMapped.filter((c) => c.attendanceStatus === 'checked_in').length,
    inside: allMapped.filter((c) => c.attendanceStatus === 'inside').length,
    pickedUp: allMapped.filter((c) => c.attendanceStatus === 'picked_up').length
  };

  // Canonical age group & exact-age breakdown dynamically derived from CANONICAL_PROGRAMME_AGE_GROUPS
  const ageBreakdown: AgeGroupBreakdownItem[] = CANONICAL_PROGRAMME_AGE_GROUPS.map((group) => {
    const inBucket = allMapped.filter(
      (c) => c.ageGroup === group.key || normalizeAgeGroupLabelToRange(c.ageGroup) === group.key
    );
    const ages: ExactAgeCount[] = [];
    for (let ageVal = group.minAge; ageVal <= group.maxAge; ageVal++) {
      const ofExactAge = inBucket.filter((c) => c.age === ageVal);
      ages.push({
        age: ageVal,
        selected: ofExactAge.length,
        passReady: ofExactAge.filter((c) => c.passStatus === 'pass_ready').length,
        missingPass: ofExactAge.filter((c) => c.passStatus === 'missing_pass').length
      });
    }
    return {
      ageGroup: group.key,
      selected: inBucket.length,
      passReady: inBucket.filter((c) => c.passStatus === 'pass_ready').length,
      missingPass: inBucket.filter((c) => c.passStatus === 'missing_pass').length,
      ages
    };
  });

  const inReview = allMapped.filter((c) => c.ageGroup === 'Age review needed');
  if (inReview.length > 0) {
    const distinctReviewAges = Array.from(new Set(inReview.map((c) => c.age))).sort((a, b) => a - b);
    ageBreakdown.push({
      ageGroup: 'Age review needed',
      selected: inReview.length,
      passReady: inReview.filter((c) => c.passStatus === 'pass_ready').length,
      missingPass: inReview.filter((c) => c.passStatus === 'missing_pass').length,
      ages: distinctReviewAges.map((ageVal) => {
        const ofExactAge = inReview.filter((c) => c.age === ageVal);
        return {
          age: ageVal,
          selected: ofExactAge.length,
          passReady: ofExactAge.filter((c) => c.passStatus === 'pass_ready').length,
          missingPass: ofExactAge.filter((c) => c.passStatus === 'missing_pass').length
        };
      })
    });
  }

  const ageGroups = ageBreakdown.map((g) => ({
    ageGroup: g.ageGroup,
    selected: g.selected,
    passReady: g.passReady,
    missingPass: g.missingPass
  }));

  // Filter children
  let filtered = allMapped;

  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((c) => 
      (c.fullName && c.fullName.toLowerCase().includes(s)) ||
      (c.parent.fullName && c.parent.fullName.toLowerCase().includes(s)) ||
      (c.parent.phone && c.parent.phone.toLowerCase().includes(s)) ||
      (c.parent.email && c.parent.email.toLowerCase().includes(s))
    );
  }

  if (ageGroupFilter && ageGroupFilter.toLowerCase() !== 'all' && ageGroupFilter.toLowerCase() !== 'all age groups') {
    const normFilter = normalizeAgeGroupLabelToRange(ageGroupFilter);
    filtered = filtered.filter((c) => {
      if (ageGroupFilter.toLowerCase() === 'age review needed' || normFilter.toLowerCase() === 'age review needed') {
        return c.ageGroup === 'Age review needed';
      }
      return c.ageGroup === normFilter || normalizeAgeGroupLabelToRange(c.ageGroup) === normFilter;
    });
  }

  if (exactAgeFilter !== null) {
    filtered = filtered.filter((c) => c.age === exactAgeFilter);
  }

  if (minAgeFilter !== null && maxAgeFilter !== null) {
    filtered = filtered.filter((c) => c.age >= minAgeFilter! && c.age <= maxAgeFilter!);
  }

  if (passStatusFilter && passStatusFilter.toLowerCase() !== 'all') {
    filtered = filtered.filter((c) => c.passStatus === passStatusFilter);
  }

  if (attendanceStatusFilter && attendanceStatusFilter.toLowerCase() !== 'all') {
    filtered = filtered.filter((c) => c.attendanceStatus === attendanceStatusFilter);
  }

  if (genderFilter && genderFilter.toLowerCase() !== 'all') {
    const targetG = genderFilter.toLowerCase();
    filtered = filtered.filter((c) => c.gender.toLowerCase() === targetG);
  }

  // Sort globally across the COMPLETE matching population BEFORE pagination
  filtered = sortSelectedChildren(filtered, sortOption);

  const totalRecords = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const startIndex = (page - 1) * pageSize;
  const paginatedChildren = filtered.slice(startIndex, startIndex + pageSize);

  return {
    event: {
      id: eventId,
      title: eventTitle,
      starts_at: eventDate
    },
    summary,
    ageGroups,
    ageBreakdown,
    filtered,
    pagination: {
      page,
      pageSize,
      totalRecords,
      totalPages,
      paginatedChildren
    },
    filters: {
      search,
      ageGroup: ageGroupFilter,
      exactAge: exactAgeFilter,
      minAge: minAgeFilter,
      maxAge: maxAgeFilter,
      sort: sortOption,
      passStatus: passStatusFilter,
      attendanceStatus: attendanceStatusFilter,
      gender: genderFilter
    }
  };
}

/**
 * Render CSV string for selected children
 */
export function renderSelectedChildrenCsv(filtered: SelectedChildRecord[]): string {
  const escapeCSVField = (val: any): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  // Group by exact age ascending, and within each age sort alphabetically by child name A-Z (Requirements 2, 25, 26)
  const ageMap = new Map<number, SelectedChildRecord[]>();
  for (const c of filtered) {
    const age = c.age;
    if (!ageMap.has(age)) {
      ageMap.set(age, []);
    }
    ageMap.get(age)!.push(c);
  }

  const sortedAges = Array.from(ageMap.keys()).sort((a, b) => a - b);

  let csvContent = 'Age,No.,Child Name,Gender,Age Group,Parent / Guardian,Parent Phone,Pass Code,Pass Status,Attendance\n';

  for (const age of sortedAges) {
    const childrenOfAge = ageMap.get(age)!;
    childrenOfAge.sort((a, b) =>
      (a.fullName || '').trim().toLowerCase().localeCompare(
        (b.fullName || '').trim().toLowerCase(),
        'en',
        { sensitivity: 'base' }
      )
    );

    childrenOfAge.forEach((c, idx) => {
      const passCode = c.passReference || '—';
      const passText = c.passStatus === 'pass_ready' ? 'Pass ready' : 'Missing pass';
      const attendanceText = c.attendanceStatus === 'picked_up'
        ? 'Picked up'
        : c.attendanceStatus === 'inside'
          ? 'Inside'
          : c.attendanceStatus === 'checked_in'
            ? 'Checked in'
            : 'Not arrived';

      const ageGroupDisplay = c.ageGroup === 'Age review needed' || c.ageGroup.startsWith('Ages')
        ? c.ageGroup
        : `Ages ${c.ageGroup}`;

      csvContent += [
        escapeCSVField(c.age),
        escapeCSVField(idx + 1),
        escapeCSVField(c.fullName),
        escapeCSVField(c.gender),
        escapeCSVField(ageGroupDisplay),
        escapeCSVField(c.parent.fullName),
        escapeCSVField(c.parent.phone || ''),
        escapeCSVField(passCode),
        escapeCSVField(passText),
        escapeCSVField(attendanceText)
      ].join(',') + '\n';
    });
  }

  return csvContent;
}

export function getSelectedChildrenPdfFilename(
  eventTitle: string,
  ageGroupFilter?: string,
  exactAgeFilter?: number | null,
  minAgeFilter?: number | null,
  maxAgeFilter?: number | null,
  variant: 'standard' | 'qr_register' | 'name_list' = 'qr_register'
): string {
  let eventSlug = 'TGA-2026';
  if (eventTitle && eventTitle.toLowerCase().includes('general assembly')) {
    const yearMatch = eventTitle.match(/\d{4}/);
    eventSlug = `TGA-${yearMatch ? yearMatch[0] : '2026'}`;
  } else if (eventTitle) {
    eventSlug = eventTitle.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  const prefix = variant === 'name_list'
    ? 'Selected-Children-Name-List'
    : 'Selected-Children-QR-Register';

  if (exactAgeFilter !== undefined && exactAgeFilter !== null && String(exactAgeFilter).trim() !== '' && String(exactAgeFilter).toLowerCase() !== 'all') {
    return `${eventSlug}-${prefix}-Age-${exactAgeFilter}.pdf`;
  }

  if (minAgeFilter !== undefined && minAgeFilter !== null && maxAgeFilter !== undefined && maxAgeFilter !== null) {
    return `${eventSlug}-${prefix}-Ages-${minAgeFilter}-to-${maxAgeFilter}.pdf`;
  }

  const normAge = normalizeAgeGroupLabelToRange(ageGroupFilter);
  if (normAge && normAge.toLowerCase() !== 'all' && normAge.toLowerCase() !== 'all age groups') {
    const cleanTag = normAge.replace(/[\u2013–—]/g, '-to-').replace(/\s+/g, '');
    return `${eventSlug}-${prefix}-Ages-${cleanTag}.pdf`;
  }
  return `${eventSlug}-${prefix}-Ages-2-to-14.pdf`;
}

export function getSelectedChildrenCsvFilename(
  eventTitle: string,
  ageGroupFilter?: string,
  exactAgeFilter?: number | null,
  minAgeFilter?: number | null,
  maxAgeFilter?: number | null
): string {
  let eventSlug = 'TGA-2026';
  if (eventTitle && eventTitle.toLowerCase().includes('general assembly')) {
    const yearMatch = eventTitle.match(/\d{4}/);
    eventSlug = `TGA-${yearMatch ? yearMatch[0] : '2026'}`;
  } else if (eventTitle) {
    eventSlug = eventTitle.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  if (exactAgeFilter !== undefined && exactAgeFilter !== null && String(exactAgeFilter).trim() !== '' && String(exactAgeFilter).toLowerCase() !== 'all') {
    return `${eventSlug}-Selected-Children-Age-${exactAgeFilter}.csv`;
  }

  if (minAgeFilter !== undefined && minAgeFilter !== null && maxAgeFilter !== undefined && maxAgeFilter !== null) {
    return `${eventSlug}-Selected-Children-Ages-${minAgeFilter}-to-${maxAgeFilter}.csv`;
  }

  const normAge = normalizeAgeGroupLabelToRange(ageGroupFilter);
  if (normAge && normAge.toLowerCase() !== 'all' && normAge.toLowerCase() !== 'all age groups') {
    const cleanTag = normAge.replace(/[\u2013–—]/g, '-to-').replace(/\s+/g, '');
    return `${eventSlug}-Selected-Children-Ages-${cleanTag}.csv`;
  }
  return `${eventSlug}-Selected-Children-Ages-2-to-14.csv`;
}

function getSortDisplayLabel(sortOption: SelectedChildrenSortOption): string {
  switch (sortOption) {
    case 'name_desc':
      return 'Reverse Alphabetical Register (Z-A)';
    case 'age_asc':
      return 'Age Order (Youngest First)';
    case 'age_desc':
      return 'Age Order (Oldest First)';
    case 'name_asc':
    default:
      return 'Alphabetical Register';
  }
}

function getScopeDisplayLabel(data: SelectedChildrenReportData): string {
  if (data.filters.exactAge !== null && data.filters.exactAge !== undefined) {
    return `Age ${data.filters.exactAge}`;
  }
  if (data.filters.minAge !== null && data.filters.maxAge !== null) {
    return `Ages ${data.filters.minAge}–${data.filters.maxAge}`;
  }
  if (data.filters.ageGroup && data.filters.ageGroup.toLowerCase() !== 'all') {
    return data.filters.ageGroup.startsWith('Ages') ? data.filters.ageGroup : `Ages ${data.filters.ageGroup}`;
  }
  return 'Ages 2–14';
}

/**
 * Generate official consolidated Portrait A4 PDF document for Selected Children Printable QR Register.
 * Separated by exact age sections (Age 2..14), sorted A-Z within each age,
 * with first-page reconciled summary and individual bordered cut-records featuring large (38mm) scannable QR codes,
 * canonical pass codes, parent details, and authorized pickup persons.
 */
export async function renderSelectedChildrenPdf(data: SelectedChildrenReportData): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const marginLeft = 14;
  const tableWidth = 182;

  // Format generation timestamp
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const generatedTimestamp = `${dateStr} · ${timeStr}`;

  // Attempt to load official Koinonia logo cleanly (fails safely in isolated offline tests)
  let brandLogoBase64: string | null = null;
  try {
    const logoInfo = await getValidatedBrandLogo();
    if (logoInfo.available && logoInfo.pdfData) {
      brandLogoBase64 = logoInfo.pdfData;
    }
  } catch {
    brandLogoBase64 = null;
  }

  // Determine requested age range boundaries
  let minAge = 2;
  let maxAge = 14;
  let isExactAgeScope = false;

  if (data.filters.exactAge !== null && data.filters.exactAge !== undefined) {
    minAge = data.filters.exactAge;
    maxAge = data.filters.exactAge;
    isExactAgeScope = true;
  } else if (data.filters.minAge !== null && data.filters.maxAge !== null) {
    minAge = data.filters.minAge;
    maxAge = data.filters.maxAge;
  } else if (data.filters.ageGroup && data.filters.ageGroup.toLowerCase() !== 'all') {
    const norm = normalizeAgeGroupLabelToRange(data.filters.ageGroup);
    const foundGroup = CANONICAL_PROGRAMME_AGE_GROUPS.find((g) => g.key === norm);
    if (foundGroup) {
      minAge = foundGroup.minAge;
      maxAge = foundGroup.maxAge;
    }
  }

  const rangeDisplay = isExactAgeScope
    ? `Age ${minAge}`
    : `Ages ${minAge}–${maxAge}`;

  // Build list of exact ages within the range
  const ageRangeList: number[] = [];
  for (let a = minAge; a <= maxAge; a++) {
    ageRangeList.push(a);
  }

  // Group children by exact age and sort each exact age alphabetically A-Z (Requirement 2)
  const ageToChildrenMap = new Map<number, SelectedChildRecord[]>();
  for (const a of ageRangeList) {
    const childrenOfAge = data.filtered.filter((c) => c.age === a);
    childrenOfAge.sort((aRec, bRec) =>
      (aRec.fullName || '').trim().toLowerCase().localeCompare(
        (bRec.fullName || '').trim().toLowerCase(),
        'en',
        { sensitivity: 'base' }
      )
    );
    ageToChildrenMap.set(a, childrenOfAge);
  }

  // Pre-generate QR data URLs for all unique pass references in parallel chunks of 50
  const qrCache = new Map<string, string>();
  const distinctRefs = Array.from(
    new Set(data.filtered.map((c) => c.passReference).filter(Boolean))
  ) as string[];

  const chunkSize = 50;
  for (let i = 0; i < distinctRefs.length; i += chunkSize) {
    const batch = distinctRefs.slice(i, i + chunkSize);
    await Promise.all(
      batch.map(async (ref) => {
        try {
          const dataUrl = await QRCodeLib.toDataURL(ref, {
            margin: 1,
            width: 240,
            errorCorrectionLevel: 'M',
            color: { dark: '#000000', light: '#FFFFFF' }
          });
          qrCache.set(ref, dataUrl);
        } catch {
          // ignore error gracefully
        }
      })
    );
  }

  const totalFilteredCount = data.filtered.length;

  // =================== PAGE 1: ADMINISTRATIVE HEADER & AGE SUMMARY (Requirements 5, 17, 18) ===================
  // Brand Logo
  if (brandLogoBase64) {
    try {
      const imgProps = doc.getImageProperties(brandLogoBase64);
      const ratio = (imgProps.width || 1) / (imgProps.height || 1);
      const maxH = 11;
      const logoH = maxH;
      const logoW = Math.min(28, logoH * ratio);
      const adjH = logoW / ratio;
      doc.addImage(
        brandLogoBase64,
        imgProps.fileType || 'PNG',
        marginLeft + tableWidth - logoW,
        12 + (maxH - adjH) / 2,
        logoW,
        adjH
      );
    } catch {
      // Ignore logo error gracefully
    }
  }

  // Header Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(197, 155, 39); // Koinonia Gold
  doc.text('KOINONIA CHILDREN & TEENS', marginLeft, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 91);
  doc.text((data.event.title || 'THE GENERAL ASSEMBLY 2026').toUpperCase(), marginLeft, 21);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(24, 24, 27);
  doc.text('SELECTED CHILDREN REGISTER', marginLeft, 28);

  // Gold accent rule
  doc.setDrawColor(197, 155, 39);
  doc.setLineWidth(0.6);
  doc.line(marginLeft, 32.5, marginLeft + tableWidth, 32.5);

  // Administrative metadata banner (Requirement 5)
  doc.setFillColor(250, 249, 245); // Warm ivory tint
  doc.rect(marginLeft, 34.5, tableWidth, 10, 'F');
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.3);
  doc.rect(marginLeft, 34.5, tableWidth, 10, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(24, 24, 27);
  doc.text(`Scope: ${rangeDisplay}`, marginLeft + 4, 41);

  doc.text(`Total Selected: ${totalFilteredCount.toLocaleString()}`, marginLeft + 55, 41);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(82, 82, 91);
  doc.text(`Generated: ${dateStr}`, marginLeft + tableWidth - 4, 41, { align: 'right' });

  // First-page Age Summary Table (Requirements 17 & 18)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text('EXACT AGE BREAKDOWN', marginLeft, 51);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(113, 113, 122);
  doc.text(
    'Summary of selected children across exact ages in this register. Reconciled with total records.',
    marginLeft + 52,
    51
  );

  // Draw Summary Table Header
  const summaryY = 55;
  doc.setFillColor(244, 244, 245);
  doc.rect(marginLeft, summaryY, tableWidth, 7, 'F');
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, summaryY + 7, marginLeft + tableWidth, summaryY + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(63, 63, 70);

  doc.text('AGE', marginLeft + 4, summaryY + 4.8);
  doc.text('SELECTED CHILDREN', marginLeft + 55, summaryY + 4.8, { align: 'right' });
  doc.text('PASS READY', marginLeft + 95, summaryY + 4.8, { align: 'right' });
  doc.text('MISSING PASS', marginLeft + 138, summaryY + 4.8, { align: 'right' });
  doc.text('% OF TOTAL', marginLeft + 178, summaryY + 4.8, { align: 'right' });

  let curSumY = summaryY + 7;
  const sumRowH = 6.2;
  let runningSelectedSum = 0;
  let runningPassReadySum = 0;
  let runningMissingPassSum = 0;

  for (const ageVal of ageRangeList) {
    const list = ageToChildrenMap.get(ageVal) || [];
    const count = list.length;
    const readyCount = list.filter((c) => c.passStatus === 'pass_ready').length;
    const missingCount = list.filter((c) => c.passStatus === 'missing_pass').length;

    runningSelectedSum += count;
    runningPassReadySum += readyCount;
    runningMissingPassSum += missingCount;

    const pct = totalFilteredCount > 0 ? ((count / totalFilteredCount) * 100).toFixed(1) + '%' : '0.0%';

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(24, 24, 27);
    doc.text(`Age ${ageVal}`, marginLeft + 4, curSumY + 4.3);
    doc.text(count.toLocaleString(), marginLeft + 55, curSumY + 4.3, { align: 'right' });

    doc.setTextColor(21, 128, 61); // green
    doc.text(readyCount.toLocaleString(), marginLeft + 95, curSumY + 4.3, { align: 'right' });

    if (missingCount > 0) {
      doc.setTextColor(180, 83, 9); // amber
    } else {
      doc.setTextColor(113, 113, 122);
    }
    doc.text(missingCount.toLocaleString(), marginLeft + 138, curSumY + 4.3, { align: 'right' });

    doc.setTextColor(82, 82, 91);
    doc.text(pct, marginLeft + 178, curSumY + 4.3, { align: 'right' });

    doc.setDrawColor(244, 244, 245);
    doc.setLineWidth(0.2);
    doc.line(marginLeft, curSumY + sumRowH, marginLeft + tableWidth, curSumY + sumRowH);

    curSumY += sumRowH;
  }

  // Summary Reconciliation Total Row (Requirement 18)
  doc.setFillColor(250, 249, 245);
  doc.rect(marginLeft, curSumY, tableWidth, 7.5, 'F');
  doc.setDrawColor(197, 155, 39);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, curSumY, marginLeft + tableWidth, curSumY);
  doc.line(marginLeft, curSumY + 7.5, marginLeft + tableWidth, curSumY + 7.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(24, 24, 27);
  doc.text(`TOTAL (${rangeDisplay})`, marginLeft + 4, curSumY + 5.2);
  doc.text(runningSelectedSum.toLocaleString(), marginLeft + 55, curSumY + 5.2, { align: 'right' });

  doc.setTextColor(21, 128, 61);
  doc.text(runningPassReadySum.toLocaleString(), marginLeft + 95, curSumY + 5.2, { align: 'right' });

  if (runningMissingPassSum > 0) {
    doc.setTextColor(180, 83, 9);
  } else {
    doc.setTextColor(24, 24, 27);
  }
  doc.text(runningMissingPassSum.toLocaleString(), marginLeft + 138, curSumY + 5.2, { align: 'right' });

  doc.setTextColor(24, 24, 27);
  doc.text('100.0%', marginLeft + 178, curSumY + 5.2, { align: 'right' });

  // Reconciled note box
  const noteY = curSumY + 11;
  doc.setFillColor(255, 255, 255);
  doc.rect(marginLeft, noteY, tableWidth, 16, 'F');
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.3);
  doc.rect(marginLeft, noteY, tableWidth, 16, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(24, 24, 27);
  doc.text('Official Administrative Register · Physical Entry Credentials', marginLeft + 5, noteY + 5.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(82, 82, 91);
  doc.text(
    'Each subsequent page contains individual bordered child credential records separated by exact age, ordered A–Z.',
    marginLeft + 5,
    noteY + 9.5
  );
  doc.text(
    'Each record includes a large scannable QR code (38mm) matching the Parent Pass, parent, and authorized pickup person.',
    marginLeft + 5,
    noteY + 13.5
  );

  const truncateText = (text: string, maxWidth: number): string => {
    if (!text) return '';
    if (doc.getTextWidth(text) <= maxWidth) return text;
    let t = text;
    while (t.length > 0 && doc.getTextWidth(`${t}…`) > maxWidth) {
      t = t.slice(0, -1);
    }
    return `${t}…`;
  };

  // =================== EXACT AGE SECTION PAGES WITH BORDERED CUT-CARDS (Requirements 14, 15) ===================
  const cardWidth = tableWidth; // 182mm
  const cardHeight = 54;
  const gapY = 4;
  const maxY = 270;

  for (const ageVal of ageRangeList) {
    const childrenOfAge = ageToChildrenMap.get(ageVal) || [];
    if (childrenOfAge.length === 0) continue;

    // Start each exact age section on a fresh page
    doc.addPage();
    let currentY = 12;

    const drawAgeHeader = (y: number, isContinuation: boolean = false) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(24, 24, 27);
      doc.text(isContinuation ? `AGE ${ageVal} — Continued` : `AGE ${ageVal}`, marginLeft, y + 4.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(197, 155, 39);
      const countBadge = `${childrenOfAge.length} SELECTED ${childrenOfAge.length === 1 ? 'CHILD' : 'CHILDREN'}`;
      doc.text(countBadge, marginLeft + 32, y + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(113, 113, 122);
      doc.text(
        `${data.event.title || 'The General Assembly 2026'} · Printable QR Register`,
        marginLeft + cardWidth,
        y + 4.5,
        { align: 'right' }
      );

      // Gold accent line
      doc.setDrawColor(197, 155, 39);
      doc.setLineWidth(0.5);
      doc.line(marginLeft, y + 7, marginLeft + cardWidth, y + 7);
      return y + 11;
    };

    currentY = drawAgeHeader(currentY, false);

    childrenOfAge.forEach((c, idx) => {
      if (currentY + cardHeight > maxY) {
        doc.addPage();
        currentY = drawAgeHeader(12, true);
      }

      const cardX = marginLeft;
      const cardY = currentY;

      // 1. Bordered Card Container (Section 14: Printable cut-box)
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 1.5, 1.5, 'F');
      doc.setDrawColor(212, 212, 216); // zinc 300
      doc.setLineWidth(0.35);
      doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 1.5, 1.5, 'S');

      // Left Gold Accent Bar
      doc.setFillColor(197, 155, 39);
      doc.roundedRect(cardX, cardY, 2.5, cardHeight, 1, 1, 'F');

      // 2. Child Index Number & Full Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(161, 161, 170); // zinc 400
      const numStr = String(idx + 1).padStart(2, '0');
      doc.text(numStr, cardX + 6, cardY + 7.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(24, 24, 27);
      doc.text(truncateText(c.fullName || '', 95), cardX + 15, cardY + 7.5);
      doc.text((c.fullName || '').toUpperCase(), cardX + 15, cardY + 7.5, { renderingMode: 'invisible' });

      // 3. Subtitle: Exact Age · Age Group · Gender
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(82, 82, 91);
      const agDisplay = c.ageGroup === 'Age review needed' ? 'Age review needed' : (c.ageGroup.startsWith('Ages') ? c.ageGroup : `Ages ${c.ageGroup}`);
      const genderDisplay = c.gender ? ` · ${c.gender}` : '';
      doc.text(`${c.age} yrs · ${agDisplay}${genderDisplay}`, cardX + 15, cardY + 13);

      // Divider inside left area
      doc.setDrawColor(244, 244, 245);
      doc.setLineWidth(0.2);
      doc.line(cardX + 6, cardY + 16.5, cardX + 126, cardY + 16.5);

      // 4. Primary Parent
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(63, 63, 70);
      doc.text('Parent:', cardX + 6, cardY + 22.5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(24, 24, 27);
      const parentName = truncateText(c.parent?.fullName || '—', 75);
      const parentPhone = c.parent?.phone ? ` (${c.parent.phone})` : '';
      doc.text(`${parentName}${parentPhone}`, cardX + 22, cardY + 22.5);

      // 5. Authorised Pickup Person (from canonical pickup_people)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(63, 63, 70);
      doc.text('Pickup:', cardX + 6, cardY + 29.5);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(24, 24, 27);
      const pickupName = truncateText(c.pickupPerson?.fullName || c.parent?.fullName || '—', 75);
      const pickupPhone = c.pickupPerson?.phone ? ` (${c.pickupPerson.phone})` : '';
      doc.text(`${pickupName}${pickupPhone}`, cardX + 22, cardY + 29.5);

      // Relationship
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(82, 82, 91);
      const relStr = c.pickupPerson?.relationship || 'Primary parent';
      doc.text(`Relationship: ${relStr}`, cardX + 22, cardY + 34.5);

      // 6. Attendance Status
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(113, 113, 122);
      const attText = c.attendanceStatus === 'picked_up'
        ? 'Picked up'
        : c.attendanceStatus === 'inside'
          ? 'Inside'
          : c.attendanceStatus === 'checked_in'
            ? 'Checked in'
            : 'Not arrived';
      doc.text(`Status: ${attText}`, cardX + 6, cardY + 45.5);

      // Vertical Divider before QR section
      doc.setDrawColor(240, 240, 243);
      doc.setLineWidth(0.3);
      doc.line(cardX + 130, cardY + 3, cardX + 130, cardY + cardHeight - 3);

      // 7. Large QR Code (38mm x 38mm) & Canonical Pass Code (Section 14)
      const qrSize = 38;
      const qrX = cardX + 136;
      const qrY = cardY + 2.5;

      if (c.passReference && qrCache.has(c.passReference)) {
        doc.addImage(qrCache.get(c.passReference)!, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST');

        // Pass Code Label & Value below QR
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(113, 113, 122);
        doc.text('PASS CODE', qrX + qrSize / 2, qrY + qrSize + 3.2, { align: 'center' });

        doc.setFont('courier', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(24, 24, 27);
        doc.text(c.passReference, qrX + qrSize / 2, qrY + qrSize + 7, { align: 'center' });
      } else {
        // Missing Pass box
        doc.setFillColor(254, 243, 199); // amber 100
        doc.roundedRect(qrX + 2, qrY + 8, qrSize - 4, 18, 1.5, 1.5, 'F');
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.3);
        doc.roundedRect(qrX + 2, qrY + 8, qrSize - 4, 18, 1.5, 1.5, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(180, 83, 9);
        doc.text('PASS NOT AVAILABLE', qrX + qrSize / 2, qrY + 16, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(146, 64, 14);
        doc.text('Missing pass', qrX + qrSize / 2, qrY + 21, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(113, 113, 122);
        doc.text('PASS CODE', qrX + qrSize / 2, qrY + qrSize + 3.2, { align: 'center' });

        doc.setFont('courier', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(113, 113, 122);
        doc.text('—', qrX + qrSize / 2, qrY + qrSize + 7, { align: 'center' });
      }

      currentY += cardHeight + gapY;
    });
  }

  // Running Footer across all pages (Requirement 28)
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, 287, marginLeft + tableWidth, 287);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(113, 113, 122);
    doc.text(
      `${data.event.title || 'The General Assembly 2026'} · Selected Children Register · ${rangeDisplay}`,
      marginLeft,
      292
    );
    doc.text(`Page ${p} of ${pageCount}`, marginLeft + tableWidth, 292, { align: 'right' });
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

/**
 * Generate simplified printable Alphabetical Name List PDF (Portrait A4).
 * Includes child name, exact age, and age group only — excludes sensitive parent/medical details.
 */
export async function renderSelectedChildrenNameListPdf(data: SelectedChildrenReportData): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const marginLeft = 16;
  const contentWidth = 178;
  const scopeUpper = getScopeDisplayLabel(data).toUpperCase();

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const generatedTimestamp = `${dateStr} · ${timeStr}`;

  let brandLogoBase64: string | null = null;
  try {
    const logoInfo = await getValidatedBrandLogo();
    if (logoInfo.available && logoInfo.pdfData) {
      brandLogoBase64 = logoInfo.pdfData;
    }
  } catch {
    brandLogoBase64 = null;
  }

  if (brandLogoBase64) {
    try {
      const imgProps = doc.getImageProperties(brandLogoBase64);
      const ratio = (imgProps.width || 1) / (imgProps.height || 1);
      const maxH = 9;
      const logoW = Math.min(24, maxH * ratio);
      const adjH = logoW / ratio;
      doc.addImage(
        brandLogoBase64,
        imgProps.fileType || 'PNG',
        marginLeft + contentWidth - logoW,
        12 + (maxH - adjH) / 2,
        logoW,
        adjH
      );
    } catch {
      // Ignore invalid/unsupported logo gracefully
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(197, 155, 39);
  doc.text('KOINONIA CHILDREN & TEENS', marginLeft, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 91);
  doc.text((data.event.title || 'THE GENERAL ASSEMBLY 2026').toUpperCase(), marginLeft, 20.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(24, 24, 27);
  doc.text(`SELECTED CHILDREN — ${scopeUpper}`, marginLeft, 27.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(63, 63, 70);
  doc.text('ALPHABETICAL NAME LIST', marginLeft, 33);

  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, 36.5, marginLeft + contentWidth, 36.5);

  doc.setFillColor(250, 249, 245);
  doc.rect(marginLeft, 37.5, contentWidth, 8, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(63, 63, 70);
  doc.text(`Total selected children: ${data.filtered.length}`, marginLeft + 3, 42.6);
  doc.text(`Generated: ${generatedTimestamp}`, marginLeft + contentWidth - 3, 42.6, { align: 'right' });

  doc.line(marginLeft, 46, marginLeft + contentWidth, 46);

  const alphabeticalRecords = sortSelectedChildren(data.filtered, 'name_asc');
  let currentY = 53;
  const rowHeight = 6.2;
  const maxY = 278;

  const truncateLine = (text: string, maxWidth: number): string => {
    if (!text || doc.getTextWidth(text) <= maxWidth) return text;
    let t = text;
    while (t.length > 0 && doc.getTextWidth(`${t}…`) > maxWidth) {
      t = t.slice(0, -1);
    }
    return `${t}…`;
  };

  if (alphabeticalRecords.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(113, 113, 122);
    doc.text('No selected children match the specified filters.', marginLeft + contentWidth / 2, currentY + 10, { align: 'center' });
  } else {
    alphabeticalRecords.forEach((c, idx) => {
      if (currentY + rowHeight > maxY) {
        doc.addPage();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(113, 113, 122);
        doc.text(`SELECTED CHILDREN — ${scopeUpper} · ALPHABETICAL NAME LIST`, marginLeft, 12);
        doc.setDrawColor(228, 228, 231);
        doc.line(marginLeft, 14.5, marginLeft + contentWidth, 14.5);
        currentY = 21;
      }

      const ageGroupText = c.ageGroup === 'Age review needed' ? 'Age review needed' : `Ages ${c.ageGroup}`;
      const lineText = `${idx + 1}. ${c.fullName} — ${c.age} yrs — ${ageGroupText}`;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(24, 24, 27);
      doc.text(truncateLine(lineText, contentWidth - 2), marginLeft + 1, currentY + 4.1);

      doc.setDrawColor(244, 244, 245);
      doc.setLineWidth(0.2);
      doc.line(marginLeft, currentY + rowHeight, marginLeft + contentWidth, currentY + rowHeight);

      currentY += rowHeight;
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, 283, marginLeft + contentWidth, 283);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(113, 113, 122);
    doc.text(`${data.event.title || 'The General Assembly 2026'} · Selected Children — ${scopeUpper} · Alphabetical Name List`, marginLeft, 288);
    doc.text(`Page ${p} of ${pageCount}`, marginLeft + contentWidth, 288, { align: 'right' });
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

/**
 * Main Controller Handler for Selected Children Report (JSON, CSV, and PDF)
 */
export async function handleSelectedChildrenReport(
  req: AuthenticatedRequest,
  res: Response,
  format: 'json' | 'csv' | 'pdf' = 'json'
) {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'team')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const requestedFormat: 'json' | 'csv' | 'pdf' = 
      format === 'pdf' || req.query.format === 'pdf' || req.query.export === 'pdf'
        ? 'pdf'
        : format === 'csv' || req.query.format === 'csv' || req.query.export === 'csv'
          ? 'csv'
          : 'json';

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(1, parseInt((req.query.pageSize || req.query.limit) as string, 10) || 25);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : (typeof req.query.q === 'string' ? req.query.q.trim() : '');
    const ageGroup = typeof req.query.ageGroup === 'string' ? req.query.ageGroup.trim() : '';
    const exactAge = req.query.exactAge !== undefined ? String(req.query.exactAge).trim() : '';
    const minAge = req.query.minAge !== undefined ? String(req.query.minAge).trim() : '';
    const maxAge = req.query.maxAge !== undefined ? String(req.query.maxAge).trim() : '';
    const sort = typeof req.query.sort === 'string' ? req.query.sort.trim() : '';
    const passStatus = typeof req.query.passStatus === 'string' ? req.query.passStatus.trim() : '';
    const attendanceStatus = typeof req.query.attendanceStatus === 'string' ? req.query.attendanceStatus.trim() : '';
    const gender = typeof req.query.gender === 'string' ? req.query.gender.trim() : '';
    const variant = req.query.variant === 'name_list' || req.query.listMode === 'name_list' ? 'name_list' : 'standard';

    const reportData = await getSelectedChildrenReportData({
      eventId: req.query.eventId as string,
      page,
      pageSize,
      search,
      ageGroup,
      exactAge,
      minAge,
      maxAge,
      sort,
      passStatus,
      attendanceStatus,
      gender
    });

    // 1. PDF Export
    if (requestedFormat === 'pdf') {
      const pdfBuffer = variant === 'name_list'
        ? await renderSelectedChildrenNameListPdf(reportData)
        : await renderSelectedChildrenPdf(reportData);
      const filename = getSelectedChildrenPdfFilename(
        reportData.event.title,
        ageGroup,
        reportData.filters.exactAge,
        reportData.filters.minAge,
        reportData.filters.maxAge,
        variant
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      return res.status(200).send(pdfBuffer);
    }

    // 2. CSV Export
    if (requestedFormat === 'csv') {
      const csvContent = renderSelectedChildrenCsv(reportData.filtered);
      const csvFilename = getSelectedChildrenCsvFilename(
        reportData.event.title,
        ageGroup,
        reportData.filters.exactAge,
        reportData.filters.minAge,
        reportData.filters.maxAge
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${csvFilename}"`);
      return res.status(200).send(csvContent);
    }

    // 3. JSON Paginated Response
    return res.json({
      success: true,
      event: {
        id: reportData.event.id,
        title: reportData.event.title
      },
      summary: reportData.summary,
      ageGroups: reportData.ageGroups,
      ageBreakdown: reportData.ageBreakdown,
      children: reportData.pagination.paginatedChildren,
      pagination: {
        page: reportData.pagination.page,
        pageSize: reportData.pagination.pageSize,
        totalRecords: reportData.pagination.totalRecords,
        totalPages: reportData.pagination.totalPages
      },
      filters: {
        minAge: reportData.filters.minAge,
        maxAge: reportData.filters.maxAge,
        sort: reportData.filters.sort
      }
    });
  } catch (err: any) {
    console.error('Error in handleSelectedChildrenReport:', err);
    return res.status(err.statusCode || 500).json({ success: false, error: err.message || 'Failed to generate selected children report' });
  }
}
