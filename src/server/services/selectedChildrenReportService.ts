import { Response } from 'express';
import { jsPDF } from 'jspdf';
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

  // Query all active selected entries for this event with parent & pass information
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
      ep.status as pass_record_status
    FROM child_event_entries e
    JOIN children c ON c.id = e.child_id
    LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN media_files m ON m.id = c.photo_file_id
    LEFT JOIN event_passes ep ON ep.child_event_entry_id = e.id AND ep.status = 'active'
    WHERE e.event_id = ?
      AND (e.is_deleted = 0 OR e.is_deleted IS NULL)
      AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
      AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
    ORDER BY c.full_name ASC
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

  let csvContent = 'Child Name,Age,Age Group,Gender,Parent / Guardian,Parent Phone,Parent Email,Pass Status,Attendance Status\n';
  for (const c of filtered) {
    const passText = c.passStatus === 'pass_ready' ? 'Pass ready' : 'Missing pass';
    const attendanceText = c.attendanceStatus === 'picked_up'
      ? 'Picked up'
      : c.attendanceStatus === 'inside'
        ? 'Inside'
        : c.attendanceStatus === 'checked_in'
          ? 'Checked in'
          : 'Not arrived';

    csvContent += [
      escapeCSVField(c.fullName),
      escapeCSVField(`${c.age} yrs`),
      escapeCSVField(c.ageGroup),
      escapeCSVField(c.gender),
      escapeCSVField(c.parent.fullName),
      escapeCSVField(c.parent.phone || ''),
      escapeCSVField(c.parent.email || ''),
      escapeCSVField(passText),
      escapeCSVField(attendanceText)
    ].join(',') + '\n';
  }
  return csvContent;
}

export function getSelectedChildrenPdfFilename(
  eventTitle: string,
  ageGroupFilter?: string,
  exactAgeFilter?: number | null
): string {
  let eventSlug = 'GA-2026';
  if (eventTitle && eventTitle.toLowerCase().includes('general assembly')) {
    const yearMatch = eventTitle.match(/\d{4}/);
    eventSlug = `GA-${yearMatch ? yearMatch[0] : '2026'}`;
  } else if (eventTitle) {
    eventSlug = eventTitle.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  if (exactAgeFilter !== undefined && exactAgeFilter !== null) {
    return `Koinonia-${eventSlug}-Selected-Children-Age-${exactAgeFilter}.pdf`;
  }

  const normAge = normalizeAgeGroupLabelToRange(ageGroupFilter);
  if (normAge && normAge.toLowerCase() !== 'all' && normAge.toLowerCase() !== 'all age groups') {
    const cleanTag = normAge.replace(/[\u2013–—]/g, '-');
    return `Koinonia-${eventSlug}-Selected-Children-Ages-${cleanTag}.pdf`;
  }
  return `Koinonia-${eventSlug}-All-Selected-Children.pdf`;
}

/**
 * Generate publication-grade Landscape A4 PDF document for Selected Children list.
 */
export async function renderSelectedChildrenPdf(data: SelectedChildrenReportData): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const marginLeft = 17.5;
  const tableWidth = 262;
  const isExactAge = data.filters.exactAge !== null && data.filters.exactAge !== undefined;

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

  // Age scope display string
  const activeAgeGroup = data.filters.ageGroup && data.filters.ageGroup.toLowerCase() !== 'all'
    ? (data.filters.ageGroup.startsWith('Ages') ? data.filters.ageGroup : `Ages ${data.filters.ageGroup}`)
    : 'All Age Groups';
  const scopeLabel = isExactAge ? `Age ${data.filters.exactAge}` : activeAgeGroup;

  // Table columns layout: Exact Age operational register omits redundant Age column
  type ColKey = 'index' | 'name' | 'age' | 'gender' | 'parent' | 'phone' | 'pass' | 'attendance';
  const cols: Array<{ key: ColKey; header: string; width: number; align: 'left' | 'center'; maxW?: number }> = isExactAge
    ? [
        { key: 'index', header: '#', width: 12, align: 'center' },
        { key: 'name', header: 'Child Name', width: 64, align: 'left', maxW: 60 },
        { key: 'gender', header: 'Gender', width: 20, align: 'center' },
        { key: 'parent', header: 'Parent / Guardian', width: 60, align: 'left', maxW: 56 },
        { key: 'phone', header: 'Phone', width: 38, align: 'left', maxW: 34 },
        { key: 'pass', header: 'Pass Status', width: 34, align: 'left' },
        { key: 'attendance', header: 'Attendance', width: 34, align: 'left' }
      ]
    : [
        { key: 'index', header: 'No.', width: 12, align: 'center' },
        { key: 'name', header: 'Child Name', width: 58, align: 'left', maxW: 54 },
        { key: 'age', header: 'Age', width: 14, align: 'center' },
        { key: 'gender', header: 'Gender', width: 18, align: 'center' },
        { key: 'parent', header: 'Parent / Guardian', width: 56, align: 'left', maxW: 52 },
        { key: 'phone', header: 'Parent Phone', width: 36, align: 'left', maxW: 32 },
        { key: 'pass', header: 'Pass Status', width: 34, align: 'left' },
        { key: 'attendance', header: 'Attendance', width: 34, align: 'left' }
      ];

  const drawTableHeader = (y: number) => {
    doc.setFillColor(244, 244, 245);
    doc.rect(marginLeft, y, tableWidth, 7, 'F');
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, y + 7, marginLeft + tableWidth, y + 7);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(63, 63, 70);

    let curX = marginLeft;
    for (const c of cols) {
      if (c.align === 'center') {
        doc.text(c.header, curX + c.width / 2, y + 4.8, { align: 'center' });
      } else {
        doc.text(c.header, curX + 2, y + 4.8);
      }
      curX += c.width;
    }
    return y + 7;
  };

  // =================== PAGE 1 HEADER ===================
  if (brandLogoBase64) {
    try {
      const imgProps = doc.getImageProperties(brandLogoBase64);
      const ratio = (imgProps.width || 1) / (imgProps.height || 1);
      const maxH = 10;
      const logoH = maxH;
      const logoW = Math.min(28, logoH * ratio);
      const adjH = logoW / ratio;
      doc.addImage(
        brandLogoBase64,
        imgProps.fileType || 'PNG',
        marginLeft + tableWidth - logoW,
        10 + (maxH - adjH) / 2,
        logoW,
        adjH
      );
    } catch {
      // Ignore invalid/unsupported image format gracefully
    }
  }

  if (isExactAge) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(197, 155, 39); // Restrained Koinonia Gold
    doc.text('KOINONIA CHILDREN & TEENS', marginLeft, 13.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(82, 82, 91);
    doc.text((data.event.title || 'THE GENERAL ASSEMBLY 2026').toUpperCase(), marginLeft, 19.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(24, 24, 27);
    doc.text(`SELECTED CHILDREN — AGE ${data.filters.exactAge}`, marginLeft, 26.5);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(197, 155, 39); // Restrained Koinonia Gold
    doc.text('KOINONIA GLOBAL', marginLeft, 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(113, 113, 122);
    doc.text('Children & Teens Ministry', marginLeft + 38, 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(24, 24, 27);
    doc.text('Selected Children Report', marginLeft, 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(63, 63, 70);
    doc.text(`Event: ${data.event.title || 'The General Assembly'}`, marginLeft, 28);
    doc.text(`Age Group: ${activeAgeGroup}`, marginLeft + 85, 28);
    doc.text(`Generated: ${generatedTimestamp}`, marginLeft + 160, 28);
  }

  // Summary strip
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, 32, marginLeft + tableWidth, 32);

  doc.setFillColor(250, 249, 245); // Warm ivory operational tint
  doc.rect(marginLeft, 33, tableWidth, 9, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(24, 24, 27);

  const filteredCount = data.filtered.length;
  const filteredPassReady = data.filtered.filter(c => c.passStatus === 'pass_ready').length;
  const filteredMissingPass = data.filtered.filter(c => c.passStatus === 'missing_pass').length;
  const filteredCheckedIn = data.filtered.filter(c => c.attendanceStatus === 'checked_in').length;
  const filteredInside = data.filtered.filter(c => c.attendanceStatus === 'inside').length;
  const filteredPickedUp = data.filtered.filter(c => c.attendanceStatus === 'picked_up').length;

  if (isExactAge) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(63, 63, 70);
    doc.text(`Generated: ${generatedTimestamp}`, marginLeft + 4, 38.8);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    doc.text(`Selected children: ${filteredCount}`, marginLeft + 68, 38.8);
    doc.text(`Pass ready: ${filteredPassReady}`, marginLeft + 118, 38.8);

    if (filteredMissingPass > 0) {
      doc.setTextColor(180, 83, 9);
    }
    doc.text(`Missing pass: ${filteredMissingPass}`, marginLeft + 158, 38.8);

    doc.setTextColor(24, 24, 27);
    doc.text(`Checked in: ${filteredCheckedIn}`, marginLeft + 200, 38.8);
    doc.text(`Inside: ${filteredInside}`, marginLeft + 236, 38.8);
  } else {
    doc.text(`Selected Children: ${filteredCount}`, marginLeft + 4, 38.8);
    doc.text(`Pass Ready: ${filteredPassReady}`, marginLeft + 52, 38.8);

    if (filteredMissingPass > 0) {
      doc.setTextColor(180, 83, 9); // Amber
    } else {
      doc.setTextColor(24, 24, 27);
    }
    doc.text(`Missing Pass: ${filteredMissingPass}`, marginLeft + 98, 38.8);

    doc.setTextColor(24, 24, 27);
    doc.text(`Checked In: ${filteredCheckedIn}`, marginLeft + 148, 38.8);
    doc.text(`Inside: ${filteredInside}`, marginLeft + 192, 38.8);
    if (filteredPickedUp > 0) {
      doc.text(`Picked Up: ${filteredPickedUp}`, marginLeft + 228, 38.8);
    }
  }

  doc.setDrawColor(228, 228, 231);
  doc.line(marginLeft, 42.5, marginLeft + tableWidth, 42.5);

  let currentY = drawTableHeader(46);

  // =================== ROWS RENDERING ===================
  const rowHeight = 7.2;
  const maxY = 194;

  const truncateText = (text: string, maxWidth: number): string => {
    if (!text) return '';
    if (doc.getTextWidth(text) <= maxWidth) return text;
    let t = text;
    while (t.length > 0 && doc.getTextWidth(`${t}…`) > maxWidth) {
      t = t.slice(0, -1);
    }
    return `${t}…`;
  };

  const runningTitle = isExactAge
    ? `Koinonia Children & Teens · Selected Children — Age ${data.filters.exactAge} · ${data.event.title || 'The General Assembly 2026'}`
    : `Koinonia Children & Teens · Selected Children Report · ${data.event.title || 'The General Assembly'} (${scopeLabel})`;

  if (data.filtered.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(113, 113, 122);
    const emptyMsg = isExactAge
      ? `No selected children aged ${data.filters.exactAge}.`
      : 'No selected children match the specified filters.';
    doc.text(emptyMsg, marginLeft + tableWidth / 2, currentY + 12, { align: 'center' });
  } else {
    data.filtered.forEach((c, idx) => {
      if (currentY + rowHeight > maxY) {
        doc.addPage();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(113, 113, 122);
        doc.text(runningTitle, marginLeft, 12);
        currentY = drawTableHeader(16);
      }

      // Thin row divider
      doc.setDrawColor(244, 244, 245);
      doc.setLineWidth(0.2);
      doc.line(marginLeft, currentY + rowHeight, marginLeft + tableWidth, currentY + rowHeight);

      let colX = marginLeft;
      for (const col of cols) {
        const textY = currentY + 4.8;
        if (col.key === 'index') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(113, 113, 122);
          doc.text(String(idx + 1), colX + col.width / 2, textY, { align: 'center' });
        } else if (col.key === 'name') {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(24, 24, 27);
          doc.text(truncateText(c.fullName, col.maxW || 54), colX + 2, textY);
        } else if (col.key === 'age') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(63, 63, 70);
          doc.text(`${c.age} yrs`, colX + col.width / 2, textY, { align: 'center' });
        } else if (col.key === 'gender') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(63, 63, 70);
          doc.text(c.gender || '—', colX + col.width / 2, textY, { align: 'center' });
        } else if (col.key === 'parent') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(24, 24, 27);
          doc.text(truncateText(c.parent?.fullName || '—', col.maxW || 52), colX + 2, textY);
        } else if (col.key === 'phone') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(63, 63, 70);
          doc.text(truncateText(c.parent?.phone || '—', col.maxW || 32), colX + 2, textY);
        } else if (col.key === 'pass') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          if (c.passStatus === 'pass_ready') {
            doc.setTextColor(21, 128, 61);
            doc.text('Pass ready', colX + 2, textY);
          } else {
            doc.setTextColor(180, 83, 9);
            doc.text('Missing pass', colX + 2, textY);
          }
        } else if (col.key === 'attendance') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(63, 63, 70);
          const attText = c.attendanceStatus === 'picked_up'
            ? 'Picked up'
            : c.attendanceStatus === 'inside'
              ? 'Inside'
              : c.attendanceStatus === 'checked_in'
                ? 'Checked in'
                : 'Not arrived';
          doc.text(attText, colX + 2, textY);
        }
        colX += col.width;
      }

      currentY += rowHeight;
    });
  }

  // =================== RUNNING FOOTER ON EVERY PAGE ===================
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, 198, marginLeft + tableWidth, 198);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(113, 113, 122);
    doc.text(runningTitle, marginLeft, 203);
    doc.text(`Page ${p} of ${pageCount}`, marginLeft + tableWidth, 203, { align: 'right' });
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
    const passStatus = typeof req.query.passStatus === 'string' ? req.query.passStatus.trim() : '';
    const attendanceStatus = typeof req.query.attendanceStatus === 'string' ? req.query.attendanceStatus.trim() : '';
    const gender = typeof req.query.gender === 'string' ? req.query.gender.trim() : '';

    const reportData = await getSelectedChildrenReportData({
      eventId: req.query.eventId as string,
      page,
      pageSize,
      search,
      ageGroup,
      exactAge,
      passStatus,
      attendanceStatus,
      gender
    });

    // 1. PDF Export
    if (requestedFormat === 'pdf') {
      const pdfBuffer = await renderSelectedChildrenPdf(reportData);
      const filename = getSelectedChildrenPdfFilename(reportData.event.title, ageGroup, reportData.filters.exactAge);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      return res.status(200).send(pdfBuffer);
    }

    // 2. CSV Export
    if (requestedFormat === 'csv') {
      const csvContent = renderSelectedChildrenCsv(reportData.filtered);
      const csvFilename = reportData.filters.exactAge !== null
        ? `selected-children-age-${reportData.filters.exactAge}.csv`
        : 'selected-children-report.csv';
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
      }
    });
  } catch (err: any) {
    console.error('Error in handleSelectedChildrenReport:', err);
    return res.status(err.statusCode || 500).json({ success: false, error: err.message || 'Failed to generate selected children report' });
  }
}
