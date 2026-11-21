import { Response } from 'express';
import { jsPDF } from 'jspdf';
import { query, queryOne, execute } from '../db';
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
import crypto from 'crypto';

export interface MedicalCareChildRecord {
  childId: string;
  eventEntryId: string;
  fullName: string;
  photoUrl: string | null;
  dateOfBirth: string;
  age: number;
  ageGroup: string;
  gender: string;
  schoolName: string | null;
  schoolClass: string | null;
  registeredAt: string;
  registrationStatus: string;
  passStatus: 'pass_ready' | 'missing_pass';
  passReference: string | null;
  assignedLocation: string;
  locationId?: string | null;
  attendanceStatus: 'not_arrived' | 'checked_in' | 'inside' | 'picked_up';
  checkedInAtWAT: string | null;
  checkedInAtRaw: string | null;
  pickedUpAtWAT: string | null;
  pickedUpAtRaw: string | null;
  // Health & Care Details
  hasMedicalNotes: boolean;
  rawMedicalNotes: string;
  hasAllergyMention: boolean;
  hasOtherMedicalNotes: boolean;
  careCategory: 'allergy_and_medical' | 'allergy_only' | 'other_medical' | 'support_only' | 'none';
  allergyClassificationLabel: string;
  needsExtraSupport: boolean;
  rawSupportNotes: string;
  informationConfirmed: boolean;
  detailsConfirmed: boolean;
  requiresClarification: boolean;
  // Parent Details
  parent: {
    id: string;
    fullName: string;
    relationship: string;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    preferredContact: string;
    city: string | null;
    state: string | null;
    homeAddress: string | null;
    isKoinoniaWorker: boolean;
    department: string | null;
  };
  // Pickup Person
  pickupPerson: {
    id?: string | null;
    fullName: string;
    relationship: string;
    phone: string | null;
    whatsapp?: string | null;
    photoUrl?: string | null;
    isPrimaryParent: boolean;
    approvalStatus: string;
  };
}

export interface MedicalCareSummary {
  totalRegistered: number;
  withCareConcerns: number;
  allergyMentions: number;
  otherMedicalNotes: number;
  supportRequested: number;
  bothMedicalAndSupport: number;
  requiresClarification: number;
  careNotesInsideOrCheckedIn: number;
  careNotesNotArrived: number;
  careNotesPickedUp: number;
  noConcernReported: number;
  ageGroupBreakdown: Array<{
    ageGroup: string;
    total: number;
    withCareConcerns: number;
    allergyMentions: number;
    otherMedical: number;
    supportRequested: number;
    checkedIn: number;
  }>;
  locationBreakdown: Array<{
    locationName: string;
    total: number;
    withCareConcerns: number;
    allergyMentions: number;
    otherMedical: number;
    supportRequested: number;
  }>;
  statusBreakdown: Array<{
    status: string;
    count: number;
  }>;
  attendanceBreakdown: {
    not_arrived: number;
    checked_in: number;
    inside: number;
    picked_up: number;
  };
}

export interface MedicalCareReportData {
  event: {
    id: string;
    title: string;
    starts_at: string;
    generatedAtWAT: string;
  };
  summary: MedicalCareSummary;
  children: MedicalCareChildRecord[];
  allFiltered: MedicalCareChildRecord[];
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
    paginatedChildren: MedicalCareChildRecord[];
  };
  filters: {
    search: string;
    careConcern: string;
    ageGroup: string;
    location: string;
    attendanceStatus: string;
    passStatus: string;
    sort: string;
  };
}

export const ALLERGY_KEYWORDS = /\b(allerg|allergic|allergies|allergy|peanut|peanuts|groundnut|groundnuts|nut|nuts|dairy|milk|lactose|gluten|wheat|egg|eggs|soy|soya|fish|seafood|shellfish|prawn|prawns|shrimp|shrimps|crab|sesame|latex|epipen|hives|rash|rashes|anaphylax|anaphylactic|diet|dietary)\b/i;

export const MEDICAL_KEYWORDS = /\b(asthma|inhaler|inhalers|breathing|respiratory|diabetes|diabetic|sugar|insulin|seizure|seizures|epilepsy|epileptic|convulsion|convulsions|fever|sickle|sickle cell|hbss|hbas|anemia|anaemia|heart|cardiac|autism|autistic|adhd|special needs|hearing|vision|eye|glasses|sight|mobility|wheelchair|walking|pain|headache|ulcer|gastritis|medication|medications|medicine|medicines|drugs|daily drug|prescription|hospital|doctor|clinic|treatment)\b/i;

export function matchKeywords(text: string, pattern: RegExp): boolean {
  return new RegExp(pattern.source, 'i').test(text);
}

export function stripKeywords(text: string, pattern: RegExp): string {
  return text.replace(new RegExp(pattern.source, 'gi'), '');
}

export function formatToWAT(isoDateStr?: string | null): string | null {
  if (!isoDateStr) return null;
  const d = new Date(isoDateStr);
  if (isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Africa/Lagos'
    }).format(d) + ' WAT';
  } catch {
    return d.toISOString();
  }
}

export function formatDateToWAT(isoDateStr?: string | null): string | null {
  if (!isoDateStr) return null;
  const d = new Date(isoDateStr);
  if (isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Africa/Lagos'
    }).format(d);
  } catch {
    return d.toISOString().split('T')[0];
  }
}

export function getChildAge(c: any, referenceDate: string | Date = CANONICAL_GA_EVENT_DATE): number {
  if (typeof c === 'number') {
    return c;
  }
  if (!c) return 0;
  if (typeof c === 'string' && !isNaN(Number(c))) {
    return Number(c);
  }
  if (c.date_of_birth) {
    const age = calculateAgeOnDate(c.date_of_birth, referenceDate);
    if (age !== null && age >= 0) return age;
  }
  if (c.calculated_age !== null && c.calculated_age !== undefined && !isNaN(Number(c.calculated_age))) {
    return Number(c.calculated_age);
  }
  return 0;
}

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

function isTriviallyBlank(str?: string | null): boolean {
  if (!str) return true;
  const s = str.trim().toLowerCase();
  return (
    s === '' ||
    s === 'nil' ||
    s === 'none' ||
    s === 'no' ||
    s === 'n/a' ||
    s === 'na' ||
    s === '-' ||
    s === '--' ||
    s === 'nothing' ||
    s === 'not applicable' ||
    s === 'none.' ||
    s === 'nil.'
  );
}

export function classifyHealthCare(
  rawMedical: string,
  rawSupport: string,
  hasMedFlag: boolean = false,
  needsSupportFlag: boolean = false,
  infoConfirmed: boolean = true
) {
  const medText = (rawMedical || '').trim();
  const supportText = (rawSupport || '').trim();

  const medIsBlank = isTriviallyBlank(medText);
  const supportIsBlank = isTriviallyBlank(supportText);

  const hasRecordedMedNotes = (!medIsBlank && medText.length > 0) || hasMedFlag;
  const hasRecordedSupportNotes = (!supportIsBlank && supportText.length > 0) || needsSupportFlag;

  let hasAllergyMention = false;
  let hasOtherMedicalNotes = false;
  let requiresClarification = false;

  if (hasMedFlag && medIsBlank) {
    requiresClarification = true;
  }
  if (needsSupportFlag && supportIsBlank) {
    requiresClarification = true;
  }
  if (!infoConfirmed && (hasRecordedMedNotes || hasRecordedSupportNotes)) {
    requiresClarification = true;
  }

  if (!medIsBlank) {
    const isAllergy = matchKeywords(medText, ALLERGY_KEYWORDS);
    const hasMedicalSpecificWord = matchKeywords(medText, MEDICAL_KEYWORDS);

    hasAllergyMention = isAllergy;
    hasOtherMedicalNotes = hasMedicalSpecificWord;

    if (isAllergy && !hasMedicalSpecificWord) {
      // Strip allergy terms and connectors to check if substantial non-allergy medical text exists
      const stripped = stripKeywords(medText, ALLERGY_KEYWORDS)
        .replace(/\b(to|and|also|has|is|allergic|allergies|allergy|child|very|severe|mild|moderate|suffers|from|he|she|they|with|a|an)\b/gi, '')
        .replace(/[,;.\s\-]/g, '');
      if (stripped.length > 6) {
        hasOtherMedicalNotes = true;
      }
    } else if (!isAllergy && medText.length > 0) {
      hasOtherMedicalNotes = true;
    }
  }

  let careCategory: 'allergy_and_medical' | 'allergy_only' | 'other_medical' | 'support_only' | 'none' = 'none';
  let allergyClassificationLabel = 'No concern reported';

  if (hasAllergyMention && (hasOtherMedicalNotes || hasRecordedSupportNotes)) {
    careCategory = 'allergy_and_medical';
    allergyClassificationLabel = hasOtherMedicalNotes
      ? 'Allergy mentioned — requires verification & other medical note'
      : 'Allergy mentioned — requires verification & additional support';
  } else if (hasAllergyMention) {
    careCategory = 'allergy_only';
    allergyClassificationLabel = 'Allergy mentioned — requires verification';
  } else if (hasOtherMedicalNotes && hasRecordedSupportNotes) {
    careCategory = 'allergy_and_medical';
    allergyClassificationLabel = 'Other medical note & additional support';
  } else if (hasOtherMedicalNotes) {
    careCategory = 'other_medical';
    allergyClassificationLabel = 'Other medical information';
  } else if (hasRecordedSupportNotes) {
    careCategory = 'support_only';
    allergyClassificationLabel = 'Additional support requested';
  } else if (requiresClarification) {
    allergyClassificationLabel = 'Reported with incomplete details — clarification needed';
  }

  return {
    hasMedicalNotes: hasRecordedMedNotes && !medIsBlank,
    rawMedicalNotes: medIsBlank ? '' : medText,
    hasAllergyMention,
    hasOtherMedicalNotes,
    careCategory,
    allergyClassificationLabel,
    needsExtraSupport: hasRecordedSupportNotes && !supportIsBlank,
    rawSupportNotes: supportIsBlank ? '' : supportText,
    informationConfirmed: infoConfirmed,
    requiresClarification
  };
}

export async function checkMedicalCareReportAccess(
  req: AuthenticatedRequest,
  eventId?: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (!req.user) {
    return { allowed: false, reason: 'Authentication required' };
  }

  const role = (req.user.role || '').toLowerCase().trim();
  // Super Admin, Admin, Safeguarding Lead, and Medical Lead have unrestricted access
  if (['super_admin', 'admin', 'safeguarding_lead', 'medical_lead'].includes(role)) {
    return { allowed: true };
  }

  // Check event-level safeguarding or medical assignments
  const targetEventId = eventId || 'event-ga-2026';
  const assignment = await queryOne<any>(`
    SELECT id, responsibility_key, team_key
    FROM event_duty_assignments
    WHERE event_id = ? AND user_id = ? AND status != 'cancelled'
    LIMIT 1
  `, [targetEventId, req.user.id]);

  if (assignment) {
    const key = (assignment.responsibility_key || '').toLowerCase();
    const team = (assignment.team_key || '').toLowerCase();
    if (key.includes('safeguard') || key.includes('medical') || team.includes('safeguard') || team.includes('medical')) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: 'Access restricted: Super Admins, authorised Safeguarding Leads or Medical personnel only.'
  };
}

export async function logMedicalReportAudit(
  req: AuthenticatedRequest,
  action: string,
  details: string
) {
  try {
    const auditId = `audit-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await execute(`
      INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      auditId,
      req.user?.id || 'anonymous',
      req.user?.role || 'unknown',
      action,
      'medical_care_register',
      'event-ga-2026',
      details,
      now
    ]);
  } catch (err) {
    console.warn('[Medical Care Audit] Error writing audit log:', err);
  }
}

export interface FetchMedicalCareOptions {
  eventId?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  careConcern?: string;
  ageGroup?: string;
  location?: string;
  attendanceStatus?: string;
  passStatus?: string;
  sort?: string;
}

export async function fetchMedicalCareReportData(options: FetchMedicalCareOptions): Promise<MedicalCareReportData> {
  const explicitEventId = options.eventId;
  let event: EventRow | null = null;
  if (explicitEventId && typeof explicitEventId === 'string' && explicitEventId.trim()) {
    event = await getEventById(explicitEventId.trim());
  }
  if (!event) {
    event = await getCurrentEvent();
  }

  const eventId = event?.id || 'event-ga-2026';
  const eventTitle = event?.title || 'The General Assembly 2026';
  const eventDate = event?.starts_at || CANONICAL_GA_EVENT_DATE;
  const nowWAT = formatToWAT(new Date().toISOString()) || 'WAT';

  // Fetch active room locations for this event
  const locations = await query<any>(`
    SELECT id, name, short_name, location_type, age_group_key
    FROM event_locations
    WHERE event_id = ? AND is_active = 1
    ORDER BY sort_order ASC, name ASC
  `, [eventId]);

  const locationByAgeGroup = new Map<string, string>();
  for (const loc of locations) {
    if (loc.age_group_key) {
      const norm = normalizeAgeGroupLabelToRange(loc.age_group_key);
      locationByAgeGroup.set(norm, loc.name || loc.short_name);
    }
  }

  // Query all active registrations for this event without duplicate rows from joins
  const rows = await query<any>(`
    SELECT 
      e.id as event_entry_id,
      e.child_id,
      e.event_id,
      e.status as entry_status,
      e.school_class,
      e.school_name,
      e.has_medical_notes,
      e.medical_notes,
      e.needs_extra_support,
      e.support_notes,
      e.information_confirmed,
      e.details_confirmed,
      e.submitted_at,
      e.checked_in_at,
      e.checked_in_by,
      e.picked_up_at,
      e.picked_up_by,
      e.created_at as entry_created_at,
      c.full_name as child_name,
      c.date_of_birth,
      c.calculated_age,
      c.age_group as child_stored_age_group,
      c.gender,
      c.photo_file_id,
      c.relationship_to_child as child_parent_rel,
      c.created_at as child_created_at,
      m.secure_url as child_photo_url,
      p.id as parent_id,
      p.user_id as parent_user_id,
      p.full_name as parent_name,
      p.phone_number as parent_phone,
      p.whatsapp_number as parent_whatsapp,
      COALESCE(p.email, u.email) as parent_email,
      p.home_address as parent_home_address,
      p.country as parent_country,
      p.state_region as parent_state,
      p.city as parent_city,
      p.preferred_contact as parent_preferred_contact,
      p.is_koinonia_worker as parent_is_worker,
      p.department as parent_department,
      ep.id as active_pass_id,
      ep.pass_reference,
      ep.status as pass_record_status,
      pk.id as pickup_id,
      pk.pickup_type,
      pk.full_name as pickup_name,
      pk.relationship_to_child as pickup_relationship,
      pk.phone_number as pickup_phone,
      pk.whatsapp_number as pickup_whatsapp,
      pk.photo_file_id as pickup_photo_id,
      pk.approved_by_parent as pickup_approved
    FROM child_event_entries e
    JOIN children c ON c.id = e.child_id
    LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN media_files m ON m.id = c.photo_file_id
    LEFT JOIN event_passes ep ON ep.id = (
      SELECT id FROM event_passes 
      WHERE child_event_entry_id = e.id AND status = 'active' 
      ORDER BY created_at DESC LIMIT 1
    )
    LEFT JOIN pickup_people pk ON pk.id = (
      SELECT id FROM pickup_people 
      WHERE child_event_entry_id = e.id 
      ORDER BY created_at DESC LIMIT 1
    )
    WHERE e.event_id = ?
      AND (e.is_deleted = 0 OR e.is_deleted IS NULL)
      AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
    ORDER BY LOWER(TRIM(c.full_name)) ASC, c.id ASC
  `, [eventId]);

  const allRecords: MedicalCareChildRecord[] = rows.map((r: any) => {
    const numericAge = getChildAge(r, eventDate);
    const resolvedAgeGroup = resolveReportAgeGroup(r, eventDate);

    // Consolidate medical & support notes from event entry
    const medParts = [r.medical_notes]
      .filter(Boolean)
      .map((s) => String(s).trim())
      .filter((s, idx, arr) => s.length > 0 && arr.indexOf(s) === idx);
    const combinedMed = medParts.join('; ');

    const supportParts = [r.support_notes]
      .filter(Boolean)
      .map((s) => String(s).trim())
      .filter((s, idx, arr) => s.length > 0 && arr.indexOf(s) === idx);
    const combinedSupport = supportParts.join('; ');

    const hasMedFlag = Boolean(r.has_medical_notes === 1 || combinedMed.length > 0);
    const needsSupportFlag = Boolean(r.needs_extra_support === 1 || combinedSupport.length > 0);
    const infoConfirmed = Boolean(r.information_confirmed === 1 || r.details_confirmed === 1);

    const classification = classifyHealthCare(
      combinedMed,
      combinedSupport,
      hasMedFlag,
      needsSupportFlag,
      infoConfirmed
    );

    // Pass status
    const hasActivePass = Boolean(r.active_pass_id) || ['pass_ready', 'checked_in', 'inside', 'picked_up'].includes(r.entry_status);
    const passStatus: 'pass_ready' | 'missing_pass' = hasActivePass ? 'pass_ready' : 'missing_pass';

    // Attendance status
    let attendanceStatus: 'not_arrived' | 'checked_in' | 'inside' | 'picked_up' = 'not_arrived';
    if (r.entry_status === 'picked_up' || r.entry_status === 'checked_out' || Boolean(r.picked_up_at)) {
      attendanceStatus = 'picked_up';
    } else if (r.entry_status === 'inside') {
      attendanceStatus = 'inside';
    } else if (r.entry_status === 'checked_in' || Boolean(r.checked_in_at)) {
      attendanceStatus = 'checked_in';
    }

    // Gender
    let genderDisplay = 'Unspecified';
    const rawG = String(r.gender || '').trim().toLowerCase();
    if (['male', 'm', 'boy', 'boys'].includes(rawG)) genderDisplay = 'Male';
    else if (['female', 'f', 'girl', 'girls'].includes(rawG)) genderDisplay = 'Female';

    // Room Location Mapping
    let assignedLocation = locationByAgeGroup.get(resolvedAgeGroup) || `${resolvedAgeGroup} Section Room`;
    if (resolvedAgeGroup === 'Age review needed') {
      assignedLocation = 'Central Care Desk (Needs Age Review)';
    }

    // Authorized Pickup Person
    const hasDesignatedPickup = Boolean(r.pickup_name && String(r.pickup_name).trim());
    let pickupFullName = (r.parent_name || 'Primary Parent').trim();
    let pickupRelationship = r.child_parent_rel || 'Primary parent';
    let pickupPhone = r.parent_phone || null;
    let isPrimaryParent = true;
    let approvalStatus = 'Primary Guardian';

    if (hasDesignatedPickup) {
      pickupFullName = String(r.pickup_name).trim();
      pickupRelationship = (r.pickup_relationship && String(r.pickup_relationship).trim()) || 'Authorised pickup';
      pickupPhone = r.pickup_phone || r.parent_phone || null;
      if (r.pickup_type === 'parent' || pickupFullName.toLowerCase() === (r.parent_name || '').trim().toLowerCase()) {
        isPrimaryParent = true;
        approvalStatus = 'Primary Parent';
      } else {
        isPrimaryParent = false;
        approvalStatus = r.pickup_approved === 1 ? 'Approved by parent' : 'Designated pickup';
      }
    }

    const regDateWAT = formatToWAT(r.submitted_at || r.entry_created_at || r.child_created_at) || '';

    return {
      childId: r.child_id,
      eventEntryId: r.event_entry_id,
      fullName: r.child_name || 'Unnamed Child',
      photoUrl: r.child_photo_url || null,
      dateOfBirth: r.date_of_birth || '',
      age: numericAge,
      ageGroup: resolvedAgeGroup,
      gender: genderDisplay,
      schoolName: r.school_name || null,
      schoolClass: r.school_class || null,
      registeredAt: regDateWAT,
      registrationStatus: r.entry_status || 'registered',
      passStatus,
      passReference: r.pass_reference || null,
      assignedLocation,
      attendanceStatus,
      checkedInAtWAT: formatToWAT(r.checked_in_at),
      checkedInAtRaw: r.checked_in_at || null,
      pickedUpAtWAT: formatToWAT(r.picked_up_at),
      pickedUpAtRaw: r.picked_up_at || null,
      // Health & Care
      hasMedicalNotes: classification.hasMedicalNotes,
      rawMedicalNotes: classification.rawMedicalNotes,
      hasAllergyMention: classification.hasAllergyMention,
      hasOtherMedicalNotes: classification.hasOtherMedicalNotes,
      careCategory: classification.careCategory,
      allergyClassificationLabel: classification.allergyClassificationLabel,
      needsExtraSupport: classification.needsExtraSupport,
      rawSupportNotes: classification.rawSupportNotes,
      informationConfirmed: classification.informationConfirmed,
      detailsConfirmed: Boolean(r.details_confirmed === 1),
      requiresClarification: classification.requiresClarification,
      // Parent
      parent: {
        id: r.parent_id || '',
        fullName: r.parent_name || 'Parent / Guardian',
        relationship: r.child_parent_rel || 'Parent',
        phone: r.parent_phone || null,
        whatsapp: r.parent_whatsapp || r.parent_phone || null,
        email: r.parent_email || null,
        preferredContact: r.parent_preferred_contact || 'phone',
        city: r.parent_city || null,
        state: r.parent_state || null,
        homeAddress: r.parent_home_address || null,
        isKoinoniaWorker: Boolean(r.parent_is_worker === 1),
        department: r.parent_department || null
      },
      // Pickup Person
      pickupPerson: {
        id: r.pickup_id || null,
        fullName: pickupFullName,
        relationship: pickupRelationship,
        phone: pickupPhone,
        whatsapp: r.pickup_whatsapp || null,
        photoUrl: null,
        isPrimaryParent,
        approvalStatus
      }
    };
  });

  // Calculate live summary statistics across ALL registrations
  const totalRegistered = allRecords.length;
  const withCareConcerns = allRecords.filter(
    (c) => c.hasMedicalNotes || c.hasAllergyMention || c.hasOtherMedicalNotes || c.needsExtraSupport
  ).length;
  const allergyMentions = allRecords.filter((c) => c.hasAllergyMention).length;
  const otherMedicalNotes = allRecords.filter((c) => c.hasOtherMedicalNotes).length;
  const supportRequested = allRecords.filter((c) => c.needsExtraSupport).length;
  const bothMedicalAndSupport = allRecords.filter(
    (c) => (c.hasMedicalNotes || c.hasAllergyMention || c.hasOtherMedicalNotes) && c.needsExtraSupport
  ).length;
  const requiresClarification = allRecords.filter((c) => c.requiresClarification).length;

  const careRecords = allRecords.filter(
    (c) => c.hasMedicalNotes || c.hasAllergyMention || c.hasOtherMedicalNotes || c.needsExtraSupport
  );

  const careNotesInsideOrCheckedIn = careRecords.filter(
    (c) => c.attendanceStatus === 'checked_in' || c.attendanceStatus === 'inside'
  ).length;
  const careNotesNotArrived = careRecords.filter((c) => c.attendanceStatus === 'not_arrived').length;
  const careNotesPickedUp = careRecords.filter((c) => c.attendanceStatus === 'picked_up').length;
  const noConcernReported = allRecords.filter(
    (c) => !c.hasMedicalNotes && !c.hasAllergyMention && !c.hasOtherMedicalNotes && !c.needsExtraSupport
  ).length;

  // Age group breakdown
  const ageGroupBreakdown: Array<{
    ageGroup: string;
    total: number;
    withCareConcerns: number;
    allergyMentions: number;
    otherMedical: number;
    supportRequested: number;
    checkedIn: number;
  }> = CANONICAL_PROGRAMME_AGE_GROUPS.map((g) => {
    const inCohort = allRecords.filter((c) => c.ageGroup === g.key);
    return {
      ageGroup: g.key,
      total: inCohort.length,
      withCareConcerns: inCohort.filter(
        (c) => c.hasMedicalNotes || c.hasAllergyMention || c.hasOtherMedicalNotes || c.needsExtraSupport
      ).length,
      allergyMentions: inCohort.filter((c) => c.hasAllergyMention).length,
      otherMedical: inCohort.filter((c) => c.hasOtherMedicalNotes).length,
      supportRequested: inCohort.filter((c) => c.needsExtraSupport).length,
      checkedIn: inCohort.filter((c) => c.attendanceStatus === 'checked_in' || c.attendanceStatus === 'inside').length
    };
  });

  const reviewCohort = allRecords.filter((c) => c.ageGroup === 'Age review needed');
  if (reviewCohort.length > 0) {
    ageGroupBreakdown.push({
      ageGroup: 'Age review needed',
      total: reviewCohort.length,
      withCareConcerns: reviewCohort.filter(
        (c) => c.hasMedicalNotes || c.hasAllergyMention || c.hasOtherMedicalNotes || c.needsExtraSupport
      ).length,
      allergyMentions: reviewCohort.filter((c) => c.hasAllergyMention).length,
      otherMedical: reviewCohort.filter((c) => c.hasOtherMedicalNotes).length,
      supportRequested: reviewCohort.filter((c) => c.needsExtraSupport).length,
      checkedIn: reviewCohort.filter((c) => c.attendanceStatus === 'checked_in' || c.attendanceStatus === 'inside').length
    });
  }

  // Location breakdown
  const locationMap = new Map<string, typeof allRecords>();
  for (const c of allRecords) {
    const loc = c.assignedLocation || 'General Care';
    if (!locationMap.has(loc)) locationMap.set(loc, []);
    locationMap.get(loc)!.push(c);
  }

  const locationBreakdown = Array.from(locationMap.entries()).map(([locName, list]) => ({
    locationName: locName,
    total: list.length,
    withCareConcerns: list.filter(
      (c) => c.hasMedicalNotes || c.hasAllergyMention || c.hasOtherMedicalNotes || c.needsExtraSupport
    ).length,
    allergyMentions: list.filter((c) => c.hasAllergyMention).length,
    otherMedical: list.filter((c) => c.hasOtherMedicalNotes).length,
    supportRequested: list.filter((c) => c.needsExtraSupport).length
  }));

  // Status breakdown
  const statusMap = new Map<string, number>();
  for (const c of allRecords) {
    statusMap.set(c.registrationStatus, (statusMap.get(c.registrationStatus) || 0) + 1);
  }
  const statusBreakdown = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

  // Attendance breakdown
  const attendanceBreakdown = {
    not_arrived: allRecords.filter((c) => c.attendanceStatus === 'not_arrived').length,
    checked_in: allRecords.filter((c) => c.attendanceStatus === 'checked_in').length,
    inside: allRecords.filter((c) => c.attendanceStatus === 'inside').length,
    picked_up: allRecords.filter((c) => c.attendanceStatus === 'picked_up').length
  };

  const summary: MedicalCareSummary = {
    totalRegistered,
    withCareConcerns,
    allergyMentions,
    otherMedicalNotes,
    supportRequested,
    bothMedicalAndSupport,
    requiresClarification,
    careNotesInsideOrCheckedIn,
    careNotesNotArrived,
    careNotesPickedUp,
    noConcernReported,
    ageGroupBreakdown,
    locationBreakdown,
    statusBreakdown,
    attendanceBreakdown
  };

  // ==========================================
  // APPLY OPERATIONAL FILTERS (Section 6)
  // ==========================================
  let filtered = allRecords;

  // Care Concern filter (Default: 'with_concerns')
  const careFilter = (options.careConcern || 'with_concerns').toLowerCase().trim();
  if (careFilter === 'with_concerns') {
    filtered = filtered.filter(
      (c) => c.hasMedicalNotes || c.hasAllergyMention || c.hasOtherMedicalNotes || c.needsExtraSupport
    );
  } else if (careFilter === 'allergies_only') {
    filtered = filtered.filter((c) => c.hasAllergyMention);
  } else if (careFilter === 'other_medical_only') {
    filtered = filtered.filter((c) => c.hasOtherMedicalNotes);
  } else if (careFilter === 'support_only') {
    filtered = filtered.filter((c) => c.needsExtraSupport);
  } else if (careFilter === 'both_medical_and_support') {
    filtered = filtered.filter(
      (c) => (c.hasMedicalNotes || c.hasAllergyMention || c.hasOtherMedicalNotes) && c.needsExtraSupport
    );
  } else if (careFilter === 'needs_clarification') {
    filtered = filtered.filter((c) => c.requiresClarification);
  } else if (careFilter === 'no_concerns') {
    filtered = filtered.filter(
      (c) => !c.hasMedicalNotes && !c.hasAllergyMention && !c.hasOtherMedicalNotes && !c.needsExtraSupport
    );
  } // 'all' includes everyone without filter

  // Age Group filter
  if (options.ageGroup && options.ageGroup.toLowerCase() !== 'all') {
    const norm = normalizeAgeGroupLabelToRange(options.ageGroup);
    filtered = filtered.filter((c) => c.ageGroup === norm || c.ageGroup.toLowerCase() === options.ageGroup?.toLowerCase());
  }

  // Location filter
  if (options.location && options.location.toLowerCase() !== 'all') {
    filtered = filtered.filter(
      (c) => c.assignedLocation.toLowerCase() === options.location?.toLowerCase()
    );
  }

  // Attendance Status filter
  if (options.attendanceStatus && options.attendanceStatus.toLowerCase() !== 'all') {
    filtered = filtered.filter((c) => c.attendanceStatus === options.attendanceStatus);
  }

  // Pass Status filter
  if (options.passStatus && options.passStatus.toLowerCase() !== 'all') {
    filtered = filtered.filter((c) => c.passStatus === options.passStatus);
  }

  // Text Search (Child name, Parent name, Phone, Email)
  if (options.search && options.search.trim()) {
    const s = options.search.toLowerCase().trim();
    filtered = filtered.filter(
      (c) =>
        (c.fullName && c.fullName.toLowerCase().includes(s)) ||
        (c.parent.fullName && c.parent.fullName.toLowerCase().includes(s)) ||
        (c.parent.phone && c.parent.phone.includes(s)) ||
        (c.parent.whatsapp && c.parent.whatsapp.includes(s)) ||
        (c.parent.email && c.parent.email.toLowerCase().includes(s)) ||
        (c.pickupPerson.fullName && c.pickupPerson.fullName.toLowerCase().includes(s)) ||
        (c.pickupPerson.phone && c.pickupPerson.phone.includes(s)) ||
        (c.rawMedicalNotes && c.rawMedicalNotes.toLowerCase().includes(s)) ||
        (c.rawSupportNotes && c.rawSupportNotes.toLowerCase().includes(s))
    );
  }

  // Sorting
  const sort = options.sort || 'name_asc';
  if (sort === 'name_asc') {
    filtered.sort((a, b) => a.fullName.localeCompare(b.fullName, 'en', { sensitivity: 'base' }));
  } else if (sort === 'name_desc') {
    filtered.sort((a, b) => b.fullName.localeCompare(a.fullName, 'en', { sensitivity: 'base' }));
  } else if (sort === 'age_asc') {
    filtered.sort((a, b) => a.age - b.age || a.fullName.localeCompare(b.fullName));
  } else if (sort === 'age_desc') {
    filtered.sort((a, b) => b.age - a.age || a.fullName.localeCompare(b.fullName));
  } else if (sort === 'concern_priority') {
    // Sort allergy mentions first, then other medical, then support
    const priorityWeight = (c: MedicalCareChildRecord) => {
      if (c.hasAllergyMention && c.hasOtherMedicalNotes) return 4;
      if (c.hasAllergyMention) return 3;
      if (c.hasOtherMedicalNotes) return 2;
      if (c.needsExtraSupport) return 1;
      return 0;
    };
    filtered.sort((a, b) => priorityWeight(b) - priorityWeight(a) || a.fullName.localeCompare(b.fullName));
  }

  // Pagination
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.max(1, Math.min(200, options.pageSize || 25));
  const totalRecords = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const startIndex = (page - 1) * pageSize;
  const paginatedChildren = filtered.slice(startIndex, startIndex + pageSize);

  return {
    event: {
      id: eventId,
      title: eventTitle,
      starts_at: eventDate,
      generatedAtWAT: nowWAT
    },
    summary,
    children: paginatedChildren,
    allFiltered: filtered,
    pagination: {
      page,
      pageSize,
      totalRecords,
      totalPages,
      paginatedChildren
    },
    filters: {
      search: options.search || '',
      careConcern: careFilter,
      ageGroup: options.ageGroup || 'all',
      location: options.location || 'all',
      attendanceStatus: options.attendanceStatus || 'all',
      passStatus: options.passStatus || 'all',
      sort
    }
  };
}

export function escapeCSVField(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export function renderMedicalCareCsv(
  records: MedicalCareChildRecord[],
  summary: MedicalCareSummary,
  eventTitle: string,
  generatedAtWAT: string
): string {
  let csv = '\uFEFF'; // UTF-8 BOM for Microsoft Excel

  // Executive Header & Metadata
  csv += `${escapeCSVField(`KOINONIA CHILDREN & TEENS MINISTRY — ALLERGY & MEDICAL CARE REGISTER`)}\n`;
  csv += `${escapeCSVField(`Event: ${eventTitle} | Generated at: ${generatedAtWAT}`)}\n`;
  csv += `${escapeCSVField(`CONFIDENTIAL MEDICAL DOCUMENT — RESTRICTED TO AUTHORISED HEALTH & SAFEGUARDING PERSONNEL ONLY`)}\n`;
  csv += `\n`;

  // Summary Metrics Section
  csv += `SUMMARY METRICS\n`;
  csv += `Metric,Count\n`;
  csv += `Total Registered Children,${summary.totalRegistered}\n`;
  csv += `Children with Care Concerns (Medical / Allergy / Support),${summary.withCareConcerns}\n`;
  csv += `Allergy Mentions (Requires Verification),${summary.allergyMentions}\n`;
  csv += `Other Medical Notes,${summary.otherMedicalNotes}\n`;
  csv += `Additional Support Requested,${summary.supportRequested}\n`;
  csv += `Both Medical Notes & Additional Support,${summary.bothMedicalAndSupport}\n`;
  csv += `Reported with Incomplete Details (Needs Clarification),${summary.requiresClarification}\n`;
  csv += `Children with Care Notes Inside / Checked In,${summary.careNotesInsideOrCheckedIn}\n`;
  csv += `Children with Care Notes Not Arrived,${summary.careNotesNotArrived}\n`;
  csv += `Children with Care Notes Picked Up,${summary.careNotesPickedUp}\n`;
  csv += `No Concern Reported,${summary.noConcernReported}\n`;
  csv += `\n`;

  // Age Cohort Summary
  csv += `AGE GROUP BREAKDOWN\n`;
  csv += `Age Group,Total Registered,With Care Concerns,Allergy Mentions,Other Medical,Support Requested,Checked In / Inside\n`;
  for (const g of summary.ageGroupBreakdown) {
    csv += `${escapeCSVField(g.ageGroup)},${g.total},${g.withCareConcerns},${g.allergyMentions},${g.otherMedical},${g.supportRequested},${g.checkedIn}\n`;
  }
  csv += `\n`;

  // Location Summary
  csv += `LOCATION BREAKDOWN\n`;
  csv += `Location / Room,Total Registered,With Care Concerns,Allergy Mentions,Other Medical,Support Requested\n`;
  for (const loc of summary.locationBreakdown) {
    csv += `${escapeCSVField(loc.locationName)},${loc.total},${loc.withCareConcerns},${loc.allergyMentions},${loc.otherMedical},${loc.supportRequested}\n`;
  }
  csv += `\n`;

  // Detailed Register Header
  csv += `DETAILED ALLERGY & MEDICAL CARE REGISTER (${records.length} Records Matching Filters)\n`;
  const headers = [
    'Child ID',
    'Event Entry ID',
    'Child Full Name',
    'Gender',
    'Date of Birth',
    'Age on Event Date',
    'Age Group',
    'Assigned Location / Room',
    'School Name',
    'School Class',
    'Care Concern Category',
    'Allergy Classification',
    'Has Allergy Mention',
    'Has Other Medical Notes',
    'Exact Medical Notes from Parent',
    'Needs Extra Support',
    'Exact Support Notes from Parent',
    'Information Confirmed by Parent',
    'Requires Clarification',
    'Parent Full Name',
    'Parent Relationship',
    'Parent Primary Phone',
    'Parent WhatsApp',
    'Parent Email',
    'Preferred Contact',
    'Parent City',
    'Parent State',
    'Parent Home Address',
    'Koinonia Worker',
    'Worker Department',
    'Authorised Pickup Person Name',
    'Pickup Relationship',
    'Pickup Contact Phone',
    'Pickup Approval Status',
    'Pass Status',
    'Pass Reference',
    'Attendance Status',
    'Checked In Time (WAT)',
    'Picked Up Time (WAT)',
    'Registration Date (WAT)'
  ];
  csv += headers.map(escapeCSVField).join(',') + '\n';

  // Detailed Rows
  for (const c of records) {
    const row = [
      c.childId,
      c.eventEntryId,
      c.fullName,
      c.gender,
      c.dateOfBirth,
      c.age,
      c.ageGroup,
      c.assignedLocation,
      c.schoolName || '',
      c.schoolClass || '',
      c.careCategory,
      c.allergyClassificationLabel,
      c.hasAllergyMention ? 'Yes' : 'No',
      c.hasOtherMedicalNotes ? 'Yes' : 'No',
      c.rawMedicalNotes || '',
      c.needsExtraSupport ? 'Yes' : 'No',
      c.rawSupportNotes || '',
      c.informationConfirmed ? 'Yes' : 'No',
      c.requiresClarification ? 'Yes' : 'No',
      c.parent.fullName,
      c.parent.relationship,
      c.parent.phone || '',
      c.parent.whatsapp || '',
      c.parent.email || '',
      c.parent.preferredContact,
      c.parent.city || '',
      c.parent.state || '',
      c.parent.homeAddress || '',
      c.parent.isKoinoniaWorker ? 'Yes' : 'No',
      c.parent.department || '',
      c.pickupPerson.fullName,
      c.pickupPerson.relationship,
      c.pickupPerson.phone || '',
      c.pickupPerson.approvalStatus,
      c.passStatus,
      c.passReference || '',
      c.attendanceStatus,
      c.checkedInAtWAT || '',
      c.pickedUpAtWAT || '',
      c.registeredAt
    ];
    csv += row.map(escapeCSVField).join(',') + '\n';
  }

  return csv;
}

export async function renderMedicalCarePdf(data: MedicalCareReportData): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Header Colors
  const navyColor = [15, 23, 42]; // #0F172A
  const goldColor = [197, 155, 39]; // #C59B27
  const grayLight = [241, 245, 249]; // #F1F5F9
  const textDark = [30, 41, 59]; // #1E293B

  // Load logo if available
  let brandLogoBase64: string | null = null;
  try {
    const logoInfo = await getValidatedBrandLogo();
    if (logoInfo.available && logoInfo.pdfData) {
      brandLogoBase64 = logoInfo.pdfData;
    }
  } catch {
    brandLogoBase64 = null;
  }

  // ==========================================
  // PAGE 1: Executive Summary & Demographics
  // ==========================================
  let y = margin;

  // Header Banner
  doc.setFillColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.rect(margin, y, contentWidth, 24, 'F');

  if (brandLogoBase64) {
    try {
      doc.addImage(brandLogoBase64, 'PNG', margin + 4, y + 2.5, 19, 19);
    } catch (_) {}
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('KOINONIA CHILDREN & TEENS MINISTRY', margin + 28, y + 9);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
  doc.text(`ALLERGY & MEDICAL CARE REGISTER — ${data.event.title.toUpperCase()}`, margin + 28, y + 16);

  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(`Report Generated: ${data.event.generatedAtWAT} | Scope: ${data.allFiltered.length} matching records`, margin + 28, y + 21);

  y += 30;

  // Security Notice Box
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(239, 68, 68);
  doc.setLineWidth(0.4);
  doc.rect(margin, y, contentWidth, 12, 'FD');

  doc.setTextColor(185, 28, 28);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('CONFIDENTIAL SAFEGUARDING & MEDICAL RECORD — AUTHORISED HEALTH PERSONNEL ONLY', margin + 4, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(127, 29, 29);
  doc.text('This document contains private medical, allergy and parental emergency contact data. Do not duplicate, leave unattended, or share outside designated safeguarding personnel.', margin + 4, y + 9.5);

  y += 18;

  // KPI Grid (6 metrics)
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Live Medical & Care Metrics Overview', margin, y);
  y += 5;

  const kpis = [
    { label: 'Total Registered', val: String(data.summary.totalRegistered), desc: 'All registered children' },
    { label: 'Care Concerns Reported', val: String(data.summary.withCareConcerns), desc: 'Medical, allergy or support' },
    { label: 'Allergy Mentions', val: String(data.summary.allergyMentions), desc: 'Requires verification' },
    { label: 'Other Medical Notes', val: String(data.summary.otherMedicalNotes), desc: 'Conditions & medications' },
    { label: 'Support Requested', val: String(data.summary.supportRequested), desc: 'Assistance notes' },
    { label: 'Needs Clarification', val: String(data.summary.requiresClarification), desc: 'Incomplete or unconfirmed' }
  ];

  const colWidth = (contentWidth - 10) / 6;
  kpis.forEach((kpi, idx) => {
    const kx = margin + idx * (colWidth + 2);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(kx, y, colWidth, 18, 'FD');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label.toUpperCase(), kx + 3, y + 5);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
    doc.text(kpi.val, kx + 3, y + 12);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(kpi.desc, kx + 3, y + 16);
  });

  y += 24;

  // Age Group Breakdown & Attendance Summary Side-by-Side
  const halfWidth = (contentWidth - 6) / 2;

  // Left: Age Group Table
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text('Care Concerns by Age Cohort', margin, y);

  const ageTableY = y + 4;
  doc.setFillColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.rect(margin, ageTableY, halfWidth, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Cohort', margin + 3, ageTableY + 4.8);
  doc.text('Registered', margin + 35, ageTableY + 4.8);
  doc.text('Concerns', margin + 60, ageTableY + 4.8);
  doc.text('Allergies', margin + 85, ageTableY + 4.8);
  doc.text('Checked In', margin + 110, ageTableY + 4.8);

  let rowY = ageTableY + 7;
  data.summary.ageGroupBreakdown.forEach((g, i) => {
    doc.setFillColor(i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 252);
    doc.rect(margin, rowY, halfWidth, 6, 'F');
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(g.ageGroup, margin + 3, rowY + 4.2);
    doc.text(String(g.total), margin + 35, rowY + 4.2);
    doc.text(String(g.withCareConcerns), margin + 60, rowY + 4.2);
    doc.text(String(g.allergyMentions), margin + 85, rowY + 4.2);
    doc.text(String(g.checkedIn), margin + 110, rowY + 4.2);
    rowY += 6;
  });

  // Right: Care Concerns Attendance Status Table
  const rightX = margin + halfWidth + 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text('Care Concerns Live Attendance Status', rightX, y);

  doc.setFillColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.rect(rightX, ageTableY, halfWidth, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Operational Status', rightX + 3, ageTableY + 4.8);
  doc.text('Count', rightX + 70, ageTableY + 4.8);
  doc.text('% of Care Audience', rightX + 100, ageTableY + 4.8);

  let attRowY = ageTableY + 7;
  const attMetrics = [
    { label: 'Checked In / Inside Venue', count: data.summary.careNotesInsideOrCheckedIn },
    { label: 'Not Arrived Yet', count: data.summary.careNotesNotArrived },
    { label: 'Picked Up / Released', count: data.summary.careNotesPickedUp }
  ];
  const careTotal = Math.max(1, data.summary.withCareConcerns);

  attMetrics.forEach((am, i) => {
    doc.setFillColor(i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 252);
    doc.rect(rightX, attRowY, halfWidth, 7, 'F');
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(am.label, rightX + 3, attRowY + 4.8);
    doc.text(String(am.count), rightX + 70, attRowY + 4.8);
    const pct = ((am.count / careTotal) * 100).toFixed(1) + '%';
    doc.text(pct, rightX + 100, attRowY + 4.8);
    attRowY += 7;
  });

  // Footer on page 1
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Koinonia Children & Teens Portal · Confidential Medical Register', margin, pageHeight - 8);
  doc.text('Page 1 of Register', pageWidth - margin - 25, pageHeight - 8);

  // ==========================================
  // PAGE 2+: Detailed Register Table
  // ==========================================
  const records = data.allFiltered;
  let currentPage = 2;

  const renderTableHeader = () => {
    doc.setFillColor(navyColor[0], navyColor[1], navyColor[2]);
    doc.rect(margin, margin, contentWidth, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');

    doc.text('#', margin + 2, margin + 6);
    doc.text('Child & Age Group', margin + 8, margin + 6);
    doc.text('Location / Room', margin + 50, margin + 6);
    doc.text('Medical & Allergy Notes', margin + 88, margin + 6);
    doc.text('Additional Support', margin + 148, margin + 6);
    doc.text('Parent & Pickup Contacts', margin + 200, margin + 6);
    doc.text('Attendance', margin + 248, margin + 6);
  };

  const renderPageFooter = (pageNum: number) => {
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Koinonia Children & Teens Ministry · Allergy & Medical Care Register · ${data.event.title} · ${data.event.generatedAtWAT}`,
      margin,
      pageHeight - 6
    );
    doc.text(`Page ${pageNum}`, pageWidth - margin - 15, pageHeight - 6);
  };

  if (records.length > 0) {
    doc.addPage('a4', 'landscape');
    renderTableHeader();
    let currentY = margin + 9;

    for (let i = 0; i < records.length; i++) {
      const c = records[i];

      // Format medical and support text with line wrapping
      const medLines = c.rawMedicalNotes
        ? doc.splitTextToSize(c.rawMedicalNotes, 56)
        : (c.hasAllergyMention || c.hasOtherMedicalNotes ? ['Reported without details'] : ['None reported']);

      const supportLines = c.rawSupportNotes
        ? doc.splitTextToSize(c.rawSupportNotes, 48)
        : (c.needsExtraSupport ? ['Support requested without notes'] : ['None requested']);

      const contactLines = [
        `Parent: ${c.parent.fullName}`,
        `Tel: ${c.parent.phone || 'None'}`,
        `Pickup: ${c.pickupPerson.fullName} (${c.pickupPerson.relationship})`
      ];

      const maxLines = Math.max(medLines.length, supportLines.length, contactLines.length, 2);
      const rowHeight = Math.max(14, maxLines * 4.2 + 3);

      // Page break check
      if (currentY + rowHeight > pageHeight - 12) {
        renderPageFooter(currentPage);
        currentPage++;
        doc.addPage('a4', 'landscape');
        renderTableHeader();
        currentY = margin + 9;
      }

      // Row background
      doc.setFillColor(i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 252);
      doc.rect(margin, currentY, contentWidth, rowHeight, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(margin, currentY + rowHeight, margin + contentWidth, currentY + rowHeight);

      // Col 1: Index
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(String(i + 1), margin + 2, currentY + 5);

      // Col 2: Child Name, Age, Gender
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(c.fullName, margin + 8, currentY + 4.5);

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`${c.age} yrs (${c.gender}) · ${c.ageGroup}`, margin + 8, currentY + 8.5);

      if (c.passReference) {
        doc.setFontSize(6.5);
        doc.setFont('courier', 'bold');
        doc.setTextColor(161, 98, 7);
        doc.text(`Pass: ${c.passReference}`, margin + 8, currentY + 12);
      }

      // Col 3: Assigned Location
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const locLines = doc.splitTextToSize(c.assignedLocation, 34);
      doc.text(locLines, margin + 50, currentY + 5);

      // Col 4: Medical / Allergy Notes
      doc.setFontSize(7);
      if (c.hasAllergyMention) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(185, 28, 28); // Red
        doc.text('[ALLERGY MENTIONED]', margin + 88, currentY + 4.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        doc.text(medLines, margin + 88, currentY + 8.5);
      } else if (c.hasOtherMedicalNotes) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 64, 175); // Blue
        doc.text('[MEDICAL NOTE]', margin + 88, currentY + 4.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        doc.text(medLines, margin + 88, currentY + 8.5);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text('No concern reported', margin + 88, currentY + 5);
      }

      // Col 5: Support Notes
      doc.setFontSize(7);
      if (c.needsExtraSupport) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(109, 40, 217); // Purple
        doc.text('[EXTRA SUPPORT]', margin + 148, currentY + 4.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        doc.text(supportLines, margin + 148, currentY + 8.5);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text('None requested', margin + 148, currentY + 5);
      }

      // Col 6: Parent & Pickup Contacts
      doc.setFontSize(6.8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      contactLines.forEach((line, clIdx) => {
        doc.text(line, margin + 200, currentY + 4.5 + clIdx * 4);
      });

      // Col 7: Attendance Status
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      if (c.attendanceStatus === 'inside' || c.attendanceStatus === 'checked_in') {
        doc.setTextColor(21, 128, 61); // Green
        doc.text('Checked In', margin + 248, currentY + 5);
        if (c.checkedInAtWAT) {
          doc.setFontSize(6.5);
          doc.setFont('helvetica', 'normal');
          doc.text(c.checkedInAtWAT.replace(' WAT', ''), margin + 248, currentY + 9);
        }
      } else if (c.attendanceStatus === 'picked_up') {
        doc.setTextColor(100, 116, 139);
        doc.text('Picked Up', margin + 248, currentY + 5);
        if (c.pickedUpAtWAT) {
          doc.setFontSize(6.5);
          doc.setFont('helvetica', 'normal');
          doc.text(c.pickedUpAtWAT.replace(' WAT', ''), margin + 248, currentY + 9);
        }
      } else {
        doc.setTextColor(161, 98, 7);
        doc.text('Not Arrived', margin + 248, currentY + 5);
      }

      currentY += rowHeight;
    }

    renderPageFooter(currentPage);
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
