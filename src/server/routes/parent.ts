import { Router, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne, execute, transaction } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { sendChildReviewReceivedEmail } from '../services/email';
import { sendWhatsApp } from '../services/notifications';
import { validateParentProfile, validateChildDraftStep, validatePhoneNumber, validateChildName, validateDateOfBirth, isValidUploadedPhoto } from '../utils/validation';
import { resolveCountryIso, resolveWhatsAppCountryIso, getCountryByIso, inferCountryIsoFromE164 } from '../../utils/countries';
import { normalizePhoneNumberToE164 } from '../utils/phone';
import { buildParentStatusUrl } from '../utils/urlHelper';
import { getPassesForParent, issuePassForChild, isChildPassAuthorized } from '../services/passService';
import { getCurrentEvent, getCurrentEventId, getEventById } from '../services/eventService';
import { checkEventEligibility, resolveCanonicalAgeGroup, CANONICAL_GA_EVENT_DATE } from '../services/eligibilityService';
import { QUALIFYING_CHILD_STATUSES } from '../services/selectedParentsChannelService';
import { extractFirstName, formatSelectedChildNames } from '../services/whatsapp/personalization';

const router = Router();
router.use(authMiddleware);

// Enforce parent role or profile existence for all endpoints in this router
router.use((req: AuthenticatedRequest, res: Response, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'parent' && !req.parentProfile) {
    return res.status(403).json({ error: 'Access denied: Parent role or profile required' });
  }
  next();
});

function calculateAgeAndGroup(dobStr: string, referenceDate: string | Date = CANONICAL_GA_EVENT_DATE) {
  if (!dobStr) return { calculatedAge: 0, ageGroup: 'Not specified', needsAgeReview: true };
  const res = resolveCanonicalAgeGroup(dobStr, referenceDate);
  return {
    calculatedAge: res.age ?? 0,
    ageGroup: res.label,
    needsAgeReview: res.isOutOfRange
  };
}

async function resolvePhotoUrlAsync(photoRef?: string | null): Promise<string> {
  if (!photoRef) return '';
  if (photoRef.startsWith('http://') || photoRef.startsWith('https://') || photoRef.startsWith('/') || photoRef.startsWith('data:')) {
    return photoRef;
  }
  const media = await queryOne('SELECT secure_url, file_url FROM media_files WHERE id = ?', [photoRef]);
  if (media) {
    return media.secure_url || media.file_url || `/api/media/files/${photoRef}`;
  }
  return `/api/media/files/${photoRef}`;
}

async function resolveToMediaFileId(photoRef?: string | null): Promise<string> {
  if (!photoRef) return '';
  const ref = photoRef.trim();
  if (!ref.startsWith('http://') && !ref.startsWith('https://') && !ref.startsWith('/') && !ref.startsWith('data:')) {
    return ref;
  }
  const fileIdMatch = ref.match(/\/api\/media\/files\/([a-zA-Z0-9-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    return fileIdMatch[1];
  }
  const matchingMedia = await queryOne('SELECT id FROM media_files WHERE secure_url = ? OR file_url = ?', [ref, ref]);
  if (matchingMedia) {
    return matchingMedia.id;
  }
  return ref;
}

async function mapProfileToFrontend(row: any) {
  if (!row) return null;
  const resolvedPhoto = await resolvePhotoUrlAsync(row.photo_file_id);
  const resolvedIso = resolveCountryIso(row.country_iso, row.country, 'NG');
  const countryName = row.country || getCountryByIso(resolvedIso)?.name || 'Nigeria';
  const resolvedWaIso = resolveWhatsAppCountryIso(
    row.whatsapp_country_iso,
    row.whatsapp_number,
    resolvedIso,
    countryName,
    'NG'
  );
  return {
    id: row.id,
    fullName: row.full_name || '',
    email: row.email || '',
    phone: row.phone_number || '',
    phoneNumber: row.phone_number || '',
    whatsapp: row.whatsapp_number || row.phone_number || '',
    whatsappNumber: row.whatsapp_number || row.phone_number || '',
    homeAddress: row.home_address || '',
    country: countryName,
    countryIso: resolvedIso,
    country_iso: resolvedIso,
    whatsappCountryIso: resolvedWaIso,
    whatsapp_country_iso: resolvedWaIso,
    stateRegion: row.state_region || '',
    city: row.city || '',
    preferredContact: (row.preferred_contact as any) || 'WhatsApp',
    isWorker: Boolean(row.is_koinonia_worker),
    department: row.department || '',
    photoFileId: row.photo_file_id || '',
    photoUrl: resolvedPhoto,
    profileCompletedAt: row.profile_completed_at || null,
    whatsappConsentStatus: (row.whatsapp_consent_status as any) || 'unknown',
    whatsappConsentAt: row.whatsapp_consent_at || null,
    whatsappOptOutAt: row.whatsapp_opt_out_at || null,
    whatsappConsentSource: row.whatsapp_consent_source || null
  };
}

async function mapChildToFrontend(
  childRow: any,
  entryRow: any,
  pickupRow: any,
  parentProfileId?: string,
  isBiometricProtected: boolean = false,
  currentEventId?: string | null
) {
  const isRegisteredForCurrentEvent = Boolean(entryRow);
  const status = entryRow ? entryRow.status : 'not_registered';
  let frontendStatus: any = 'Not registered';
  let statusNote = 'Not registered for this event';
  let passReference = undefined;
  let passObject = undefined;
  let isPassLocked = false;

  if (entryRow) {
    const isPickedUp = entryRow.status === 'picked_up' || entryRow.status === 'checked_out' || Boolean(entryRow.picked_up_at);
    const isCheckedIn = (entryRow.status === 'checked_in' || entryRow.status === 'inside' || Boolean(entryRow.checked_in_at)) && !isPickedUp;

    // Load active pass if present
    const pass = await queryOne('SELECT id, status, pass_reference, issued_at FROM event_passes WHERE child_event_entry_id = ? AND status = ?', [entryRow.id, 'active']);
    if (pass) {
      if (isBiometricProtected && parentProfileId && !(await isChildPassAuthorized(parentProfileId, childRow.id))) {
        isPassLocked = true;
        passReference = undefined;
        passObject = {
          id: pass.id,
          status: pass.status,
          issuedAt: pass.issued_at,
          passLocked: true,
          requiresBiometric: true
        };
      } else {
        passReference = pass.pass_reference;
        passObject = {
          id: pass.id,
          status: pass.status,
          passCode: pass.pass_reference,
          qrPayload: pass.pass_reference,
          issuedAt: pass.issued_at
        };
      }
    }

    // Required Authoritative Priority:
    // 1. Attendance = picked_up / checked_out -> Picked Up (overrides Pass Ready)
    // 2. Attendance = checked_in / inside -> Checked In (overrides Pass Ready)
    // 3. Selected + active pass + not checked in -> Pass ready
    // 4. Otherwise canonical application/review status
    if (isPickedUp) {
      frontendStatus = 'Picked up';
      statusNote = 'Picked up and released';
    } else if (isCheckedIn) {
      frontendStatus = 'Checked in';
      statusNote = 'Successfully checked in';
    } else if (status === 'selected' || status === 'pass_ready') {
      if (passReference || isPassLocked) {
        frontendStatus = 'Pass ready';
        statusNote = 'Event pass is available';
      } else {
        frontendStatus = 'Selected';
        statusNote = 'Event pass will be available shortly.';
      }
    } else if (status === 'incomplete') {
      frontendStatus = 'Incomplete';
      statusNote = 'Continue entering child details';
    } else if (status === 'under_review') {
      frontendStatus = 'Under review';
      statusNote = 'Details sent for review';
    } else if (status === 'review_reopened') {
      frontendStatus = 'Review reopened';
      const first_name = childRow.full_name ? childRow.full_name.split(' ')[0] : 'your child';
      statusNote = `The event team has reopened the review for ${first_name}. We will share an update when a new decision is made.`;
    } else if (status === 'waiting_list') {
      frontendStatus = 'Waiting list';
      statusNote = 'Placed on waiting list';
    } else if (status === 'not_selected') {
      frontendStatus = 'Not selected';
      statusNote = 'Not selected for this session';
    } else if (status === 'withdrawn') {
      frontendStatus = 'Withdrawn';
      statusNote = 'Details withdrawn';
    } else {
      frontendStatus = status;
      statusNote = status;
    }
  }

  const resolvedChildPhoto = await resolvePhotoUrlAsync(childRow.photo_file_id);
  const resolvedPickupPhoto = await resolvePhotoUrlAsync(pickupRow?.photo_file_id);

  const draftData = {
    id: childRow.id,
    childDetails: {
      photo: resolvedChildPhoto,
      photoFileId: childRow.photo_file_id || '',
      photoUrl: resolvedChildPhoto,
      fullName: childRow.full_name || '',
      gender: childRow.gender || '',
      dateOfBirth: childRow.date_of_birth || '',
      calculatedAge: childRow.calculated_age !== null ? childRow.calculated_age : null,
      ageGroup: childRow.age_group || '',
      relationshipToChild: childRow.relationship_to_child || '',
      needsAgeReview: Boolean(childRow.needs_age_review)
    },
    schoolAndAgeGroup: {
      schoolClass: entryRow?.school_class || '',
      schoolName: entryRow?.school_name || '',
      previousChildrenProgramme: entryRow?.previous_children_programme || 'No',
      noteToTeam: entryRow?.note_to_team || ''
    },
    healthAndSupport: {
      hasMedicalNotes: entryRow?.has_medical_notes ? 'Yes' : 'No',
      medicalNotes: entryRow?.medical_notes || '',
      needsExtraSupport: entryRow?.needs_extra_support ? 'Yes' : 'No',
      supportNotes: entryRow?.support_notes || '',
      informationConfirmed: Boolean(entryRow?.information_confirmed)
    },
    pickup: {
      pickupType: pickupRow?.pickup_type || 'parent',
      pickupPersonPhoto: resolvedPickupPhoto,
      pickupPersonPhotoFileId: pickupRow?.photo_file_id || '',
      pickupPersonPhotoUrl: resolvedPickupPhoto,
      pickupPersonFullName: pickupRow?.full_name || '',
      pickupPersonRelationship: pickupRow?.relationship_to_child || '',
      pickupPersonPhone: pickupRow?.phone_number || '',
      pickupPersonWhatsApp: pickupRow?.whatsapp_number || '',
      approvedByParent: Boolean(pickupRow?.approved_by_parent)
    },
    review: {
      detailsConfirmed: Boolean(entryRow?.details_confirmed),
      submittedAt: entryRow?.submitted_at || undefined,
      status: frontendStatus
    },
    photoFileId: childRow.photo_file_id || '',
    photoUrl: resolvedChildPhoto,
    fullName: childRow.full_name || '',
    gender: childRow.gender || '',
    dob: childRow.date_of_birth || '',
    age: childRow.calculated_age !== null ? childRow.calculated_age : null,
    ageGroup: childRow.age_group || '',
    relationship: childRow.relationship_to_child || ''
  };

  const { calculatedAge, ageGroup: calcAgeGroup } = calculateAgeAndGroup(childRow.date_of_birth);
  const rawChildGroup = (childRow.age_group || '').replace(/\s*\(Review Needed\)/gi, '').trim();
  const effectiveAgeGroup = rawChildGroup && !rawChildGroup.includes('Under') && !rawChildGroup.includes('Ages 1') && !rawChildGroup.includes('Below')
    ? rawChildGroup
    : calcAgeGroup;
  const effectiveAge = childRow.calculated_age !== null && childRow.calculated_age !== undefined ? childRow.calculated_age : calculatedAge;

  const eventForEligibility = currentEventId ? await getEventById(currentEventId) : await getCurrentEvent();
  const eventEligibility = eventForEligibility ? checkEventEligibility(childRow.date_of_birth, eventForEligibility) : undefined;

  return {
    id: childRow.id,
    name: childRow.full_name || '',
    age: effectiveAge,
    ageGroup: effectiveAgeGroup,
    status: frontendStatus,
    statusNote,
    photoFileId: childRow.photo_file_id || '',
    photoUrl: resolvedChildPhoto,
    submittedAt: entryRow?.submitted_at || undefined,
    checkedInAt: entryRow?.checked_in_at || null,
    pickedUpAt: entryRow?.picked_up_at || null,
    passReference,
    passLocked: isPassLocked,
    pass: passObject,
    draftData,
    registeredForCurrentEvent: isRegisteredForCurrentEvent,
    currentEventId: currentEventId || null,
    entryId: entryRow?.id || null,
    eventEligibility
  };
}

async function getFullChildrenList(
  parentProfileId: string,
  currentEventId: string | null,
  isBiometricProtected: boolean = false
) {
  const children = await query(
    'SELECT * FROM children WHERE parent_profile_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) ORDER BY created_at DESC',
    [parentProfileId]
  );
  const list = [];
  for (const c of children) {
    // Child event participation must come strictly from the current event.
    // If no current event exists or the child has no entry in it, entry is null.
    const entry = currentEventId
      ? await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [c.id, currentEventId])
      : null;
    const pickup = entry
      ? await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entry.id])
      : null;
    list.push(await mapChildToFrontend(c, entry, pickup, parentProfileId, isBiometricProtected, currentEventId));
  }
  return list;
}

/**
 * GET /api/parent/channel-access
 * Authoritative server-side endpoint verifying whether the authenticated parent
 * has at least one qualifying selected child for the current/active event.
 *
 * Security:
 * - Requires parent authentication.
 * - Resolves live database records (cannot be spoofed from frontend state).
 * - Only reveals the canonical WhatsApp Channel URL if genuinely eligible.
 * - If ineligible, returns friendly notice with eligible: false and NEVER exposes the URL.
 */
router.get('/channel-access', async (req: AuthenticatedRequest, res: Response) => {
  try {
    let parentProfile = req.parentProfile;
    if (!parentProfile && req.user) {
      parentProfile = await queryOne('SELECT * FROM parent_profiles WHERE user_id = ?', [req.user.id]);
    }

    if (!parentProfile) {
      return res.status(403).json({
        success: false,
        eligible: false,
        message: 'Parent profile required to access the Parents Channel.'
      });
    }

    // 1. Resolve current or upcoming active event
    const currentEvent = await getCurrentEvent();
    const eventId = currentEvent?.id || getCurrentEventId();

    if (!eventId) {
      return res.json({
        success: true,
        eligible: false,
        message: 'No active event found. Parents Channel access will open once an event session is active.',
        selectedChildren: [],
        selectedChildNames: ''
      });
    }

    // 2. Query live qualifying selected children for this parent in this event
    const children = await query<any>(
      `SELECT c.id, c.full_name, cee.status
       FROM children c
       JOIN child_event_entries cee ON cee.child_id = c.id AND cee.event_id = ? AND COALESCE(cee.is_deleted, 0) = 0
       WHERE c.parent_profile_id = ?
       ORDER BY c.date_of_birth ASC, c.created_at ASC, c.id ASC`,
      [eventId, parentProfile.id]
    );

    const qualifyingChildren = children.filter((c: any) => QUALIFYING_CHILD_STATUSES.includes(c.status));

    if (qualifyingChildren.length === 0) {
      // INELIGIBLE: Do not reveal raw WhatsApp Channel URL
      return res.json({
        success: true,
        eligible: false,
        eventTitle: currentEvent?.title || "Children's Session",
        message: "Parents Channel access is available to registered parents and guardians of selected children for this event.",
        selectedChildren: [],
        selectedChildNames: ''
      });
    }

    // ELIGIBLE: Return selected children, formatted names, and canonical channel destination
    const selectedChildNames = formatSelectedChildNames(qualifyingChildren.map((c: any) => c.full_name));
    const channelUrl = process.env.WHATSAPP_CHANNEL_URL || 'https://whatsapp.com/channel/0029VbE5UslCHDykcFlf3y0U';

    return res.json({
      success: true,
      eligible: true,
      eventTitle: currentEvent?.title || "Children's Session",
      selectedChildren: qualifyingChildren.map((c: any) => ({
        id: c.id,
        fullName: c.full_name,
        firstName: extractFirstName(c.full_name)
      })),
      selectedChildNames,
      channelUrl,
      notice: "This channel is for registered parents and guardians of selected children. Please do not share the channel link with others."
    });
  } catch (err: any) {
    console.error('[Parent Channel Access] Error checking access:', err);
    return res.status(500).json({
      success: false,
      eligible: false,
      message: 'Failed to verify channel eligibility. Please try again.'
    });
  }
});

router.get('/profile', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) {
    return res.status(404).json({ error: 'Parent profile not found' });
  }
  res.json(await mapProfileToFrontend(req.parentProfile));
});

router.put('/profile', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) {
    return res.status(404).json({ error: 'Parent profile not found' });
  }

  const {
    fullName,
    email,
    phone,
    whatsapp,
    whatsappCountryIso,
    whatsapp_country_iso,
    homeAddress,
    country,
    countryIso,
    country_iso,
    stateRegion,
    city,
    preferredContact,
    isWorker,
    department,
    photoUrl
  } = req.body;

  const rawCountryIso = countryIso || country_iso;
  const rawWaCountryIso = whatsappCountryIso || whatsapp_country_iso;
  const emailToUse = (email || req.parentProfile.email || '').trim();

  // Validate the parent profile data
  const validation = validateParentProfile({
    fullName,
    email: emailToUse,
    phone,
    whatsapp,
    whatsappCountryIso: rawWaCountryIso,
    homeAddress,
    country,
    countryIso: rawCountryIso,
    stateRegion,
    city,
    preferredContact,
    isWorker,
    department,
    photoUrl
  });

  if (!validation.valid) {
    const firstErrKey = Object.keys(validation.errors)[0];
    const firstErrMsg = validation.errors[firstErrKey].message;
    const errorsList = Object.values(validation.errors).map(err => ({
      field: err.field,
      code: err.code,
      message: err.message
    }));
    const code = validation.errors.photoUrl?.code || validation.errors.photo?.code || 'VALIDATION_FAILED';
    return res.status(400).json({
      success: false,
      code,
      error: firstErrMsg,
      message: firstErrMsg,
      errors: errorsList,
      errorsMap: validation.errors
    });
  }

  // Canonical residence country & ISO
  const targetIso = resolveCountryIso(rawCountryIso, country, 'NG');
  const canonicalCountry = getCountryByIso(targetIso)?.name || (country ? country.trim() : 'Nigeria');

  // Canonical WhatsApp country ISO
  const targetWaIso = resolveWhatsAppCountryIso(
    rawWaCountryIso,
    whatsapp,
    targetIso,
    canonicalCountry,
    'NG'
  );

  const phoneValidation = validatePhoneNumber(phone, targetIso, 'phone');
  const cleanPhone = phoneValidation.normalizedPhone || phone.trim();

  const cleanWhatsapp = (whatsapp && String(whatsapp).trim() !== '')
    ? (validatePhoneNumber(whatsapp, targetWaIso, 'whatsapp').normalizedPhone || whatsapp.trim())
    : cleanPhone;

  const mediaFileId = await resolveToMediaFileId(photoUrl);
  const hasValidPhoto = Boolean(mediaFileId && isValidUploadedPhoto(mediaFileId));

  const now = new Date().toISOString();

  // All required fields check
  const isProfileComplete =
    fullName && fullName.trim() &&
    emailToUse &&
    phone && phone.trim() &&
    whatsapp && whatsapp.trim() &&
    homeAddress && homeAddress.trim() &&
    canonicalCountry && canonicalCountry.trim() &&
    stateRegion && stateRegion.trim() &&
    city && city.trim() &&
    preferredContact && preferredContact.trim() &&
    hasValidPhoto &&
    (!isWorker || (department && department.trim()));

  const completedAtValue = isProfileComplete ? (req.parentProfile.profile_completed_at || now) : null;

  await execute(`
    UPDATE parent_profiles SET
      full_name = ?,
      email = ?,
      phone_number = ?,
      whatsapp_number = ?,
      whatsapp_country_iso = ?,
      home_address = ?,
      country = ?,
      country_iso = ?,
      state_region = ?,
      city = ?,
      preferred_contact = ?,
      is_koinonia_worker = ?,
      department = ?,
      photo_file_id = ?,
      profile_completed_at = ?,
      updated_at = ?
    WHERE id = ?
  `, [
    fullName.trim(),
    emailToUse,
    cleanPhone,
    cleanWhatsapp,
    targetWaIso,
    homeAddress.trim(),
    canonicalCountry,
    targetIso,
    stateRegion.trim(),
    city.trim(),
    preferredContact,
    isWorker ? 1 : 0,
    isWorker ? department.trim() : '',
    mediaFileId,
    completedAtValue,
    now,
    req.parentProfile.id
  ]);

  const updated = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [req.parentProfile.id]);
  req.parentProfile = updated;
  res.json(await mapProfileToFrontend(updated));
});

// POST /api/parent/whatsapp/consent - Explicit parent WhatsApp opt-in / opt-out
router.post('/whatsapp/consent', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) {
    return res.status(404).json({ error: 'Parent profile not found' });
  }

  const { action, whatsappNumber } = req.body;
  const now = new Date().toISOString();

  if (action === 'opt_in') {
    // Require parent to confirm/use an explicit WhatsApp number
    const targetNumber = whatsappNumber || req.parentProfile.whatsapp_number || req.parentProfile.phone_number;
    if (!targetNumber || !String(targetNumber).trim()) {
      return res.status(400).json({
        success: false,
        error: 'A valid WhatsApp phone number is required to enable WhatsApp updates.'
      });
    }

    const parentWaIso = resolveWhatsAppCountryIso(
      req.parentProfile.whatsapp_country_iso,
      targetNumber,
      req.parentProfile.country_iso,
      req.parentProfile.country,
      'NG'
    );
    const val = validatePhoneNumber(targetNumber, parentWaIso);
    if (!val.valid || !val.normalizedPhone) {
      return res.status(400).json({
        success: false,
        error: val.message || 'Please provide a valid phone number.'
      });
    }

    await execute(`
      UPDATE parent_profiles SET
        whatsapp_consent_status = 'opted_in',
        whatsapp_consent_at = ?,
        whatsapp_opt_out_at = NULL,
        whatsapp_consent_source = 'profile',
        whatsapp_number = ?,
        whatsapp_country_iso = ?,
        updated_at = ?
      WHERE id = ?
    `, [now, val.normalizedPhone, parentWaIso, now, req.parentProfile.id]);

    const updated = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [req.parentProfile.id]);
    req.parentProfile = updated;

    return res.json({
      success: true,
      message: 'WhatsApp updates enabled successfully.',
      profile: await mapProfileToFrontend(updated)
    });
  } else if (action === 'opt_out') {
    // Turning WhatsApp off must NOT disable in-app, push, or email
    await execute(`
      UPDATE parent_profiles SET
        whatsapp_consent_status = 'opted_out',
        whatsapp_opt_out_at = ?,
        updated_at = ?
      WHERE id = ?
    `, [now, now, req.parentProfile.id]);

    const updated = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [req.parentProfile.id]);
    req.parentProfile = updated;

    return res.json({
      success: true,
      message: 'WhatsApp updates turned off.',
      profile: await mapProfileToFrontend(updated)
    });
  } else {
    return res.status(400).json({
      success: false,
      error: 'Invalid action. Action must be "opt_in" or "opt_out".'
    });
  }
});

router.get('/home', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) {
    return res.status(404).json({ error: 'Parent profile not found' });
  }

  const currentEvent = await getCurrentEvent();
  const currentEventId = currentEvent ? currentEvent.id : null;

  const isBioProtected = req.headers['x-biometric-protected'] === 'true';
  const list = await getFullChildrenList(req.parentProfile.id, currentEventId, isBioProtected);
  const childrenCount = list.length;
  const underReviewCount = list.filter(c => c.status === 'Under review').length;
  const passReadyCount = list.filter(c =>
    c.status === 'Pass ready' ||
    c.status === 'Checked in' ||
    c.status === 'Inside' ||
    c.status === 'Picked up' ||
    c.status === 'Checked out' ||
    Boolean(c.passReference || (c.pass && (c.pass.passCode || c.pass.passLocked)))
  ).length;

  const activeEvent = currentEvent ? {
    id: currentEvent.id,
    title: currentEvent.title,
    section_name: currentEvent.section_name,
    sectionName: currentEvent.section_name,
    theme: currentEvent.theme,
    scripture: currentEvent.scripture,
    starts_at: currentEvent.starts_at,
    startsAt: currentEvent.starts_at,
    ends_at: currentEvent.ends_at,
    endsAt: currentEvent.ends_at,
    daily_start_time: currentEvent.daily_start_time,
    dailyStartTime: currentEvent.daily_start_time,
    daily_end_time: currentEvent.daily_end_time,
    dailyEndTime: currentEvent.daily_end_time,
    location: currentEvent.location,
    status: currentEvent.status
  } : null;

  res.json({
    parentProfile: await mapProfileToFrontend(req.parentProfile),
    childrenCount,
    underReviewCount,
    passReadyCount,
    childrenList: list,
    activeEvent,
    message: currentEvent ? undefined : 'No event is currently open for registration.'
  });
});

router.get('/children', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  const currentEventId = await getCurrentEventId();
  const isBioProtected = req.headers['x-biometric-protected'] === 'true';
  const list = await getFullChildrenList(req.parentProfile.id, currentEventId, isBioProtected);
  res.json(list);
});

async function performSaveDraftInternal(req: AuthenticatedRequest, draft: any, childIdParam?: string) {
  const currentEvent = await getCurrentEvent();
  if (!currentEvent) {
    const err: any = new Error('No event is currently open for registration.');
    err.statusCode = 400;
    err.code = 'NO_CURRENT_EVENT';
    throw err;
  }
  const currentEventId = currentEvent.id;

  const childId = childIdParam || draft.id || crypto.randomUUID();
  const now = new Date().toISOString();

  let existingChild = null;
  if (childId) {
    existingChild = await queryOne('SELECT * FROM children WHERE id = ?', [childId]);
    if (existingChild && existingChild.parent_profile_id !== req.parentProfile!.id) {
      throw new Error('UNAUTHORIZED_CHILD_ACCESS');
    }
  }

  const rawFullName = draft.childDetails?.fullName !== undefined
    ? draft.childDetails.fullName
    : (draft.fullName !== undefined ? draft.fullName : (existingChild ? existingChild.full_name : ''));
  const fullName = typeof rawFullName === 'string' ? rawFullName.trim() : '';

  // Minimal server-side guard: A parent must never be able to persist a child record
  // whose identifying information is effectively blank.
  if (!fullName || fullName === 'Untitled Child' || fullName.replace(/[\s\-_.]/g, '').length === 0) {
    const err: any = new Error('Enter your child’s name before saving.');
    err.statusCode = 400;
    err.code = 'CHILD_NAME_REQUIRED';
    throw err;
  }

  // Reject malicious tags in draft name
  if (/<[^>]*>/.test(fullName) || /<script/i.test(fullName)) {
    const err: any = new Error('Enter a valid child name.');
    err.statusCode = 400;
    err.code = 'INVALID_CHILD_NAME';
    throw err;
  }

  // Format validation for other partially entered fields
  const rawDob = draft.childDetails?.dateOfBirth !== undefined
    ? draft.childDetails.dateOfBirth
    : (draft.dob !== undefined ? draft.dob : (existingChild ? existingChild.date_of_birth : ''));
  const dob = typeof rawDob === 'string' ? rawDob.trim() : '';
  if (dob) {
    const dobValidation = validateDateOfBirth(dob, 'childDob');
    if (!dobValidation.valid) {
      const err: any = new Error(dobValidation.message || 'Invalid date of birth.');
      err.statusCode = 400;
      err.code = dobValidation.code || 'INVALID_DOB';
      throw err;
    }
  }

  const rawGender = draft.childDetails?.gender !== undefined
    ? draft.childDetails.gender
    : (draft.gender !== undefined ? draft.gender : (existingChild ? existingChild.gender : 'Not specified'));
  const gender = typeof rawGender === 'string' && rawGender.trim() ? rawGender.trim() : 'Not specified';
  if (gender !== 'Not specified' && !['Male', 'Female'].includes(gender)) {
    const err: any = new Error('Invalid gender selected.');
    err.statusCode = 400;
    err.code = 'INVALID_GENDER';
    throw err;
  }

  const rawPhoto = draft.childDetails?.photo !== undefined
    ? draft.childDetails.photo
    : (draft.photoUrl !== undefined ? draft.photoUrl : '');
  const photo = typeof rawPhoto === 'string' ? rawPhoto.trim() : '';

  const rawRelationship = draft.childDetails?.relationshipToChild !== undefined
    ? draft.childDetails.relationshipToChild
    : (draft.relationship !== undefined ? draft.relationship : (existingChild ? existingChild.relationship_to_child : 'Parent'));
  const relationship = typeof rawRelationship === 'string' && rawRelationship.trim() ? rawRelationship.trim() : 'Parent';

  const childPhotoId = photo ? await resolveToMediaFileId(photo) : (existingChild ? existingChild.photo_file_id : null);

  const { calculatedAge, ageGroup, needsAgeReview } = calculateAgeAndGroup(dob);

  await transaction(async () => {
    if (existingChild) {
      await execute(`
        UPDATE children SET
          full_name = ?, gender = ?, date_of_birth = ?, calculated_age = ?,
          age_group = ?, relationship_to_child = ?, photo_file_id = ?, needs_age_review = ?, updated_at = ?
        WHERE id = ?
      `, [fullName, gender, dob, calculatedAge, ageGroup, relationship, childPhotoId, needsAgeReview ? 1 : 0, now, childId]);
    } else {
      await execute(`
        INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, photo_file_id, needs_age_review, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [childId, req.parentProfile!.id, fullName, gender, dob, calculatedAge, ageGroup, relationship, childPhotoId, needsAgeReview ? 1 : 0, now, now]);
    }

    const entryId = crypto.randomUUID();
    const existingEntry = await queryOne('SELECT id FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, currentEventId]);
    if (!existingEntry) {
      const nowIso = new Date().toISOString();
      if (currentEvent.parent_access_opens_at && nowIso < currentEvent.parent_access_opens_at) {
        const err: any = new Error('Registration for this event is not open yet.');
        err.statusCode = 403;
        err.code = 'REGISTRATION_NOT_OPEN';
        throw err;
      }
      if (currentEvent.parent_access_closes_at && nowIso > currentEvent.parent_access_closes_at) {
        const err: any = new Error('Registration for this event has closed.');
        err.statusCode = 403;
        err.code = 'REGISTRATION_CLOSED';
        throw err;
      }
      if (currentEvent.allow_multiple_children === 0 || currentEvent.allow_multiple_children === false) {
        const existingParentChildrenCount = await queryOne(`
          SELECT COUNT(*) as count
          FROM child_event_entries e
          JOIN children c ON c.id = e.child_id
          WHERE e.event_id = ? AND c.parent_profile_id = ? AND (e.is_deleted IS NULL OR e.is_deleted = 0)
        `, [currentEventId, req.parentProfile!.id]);
        if (Number(existingParentChildrenCount?.count || 0) > 0) {
          const err: any = new Error('Multiple child registrations are not permitted for this event.');
          err.statusCode = 403;
          err.code = 'MULTIPLE_CHILDREN_NOT_ALLOWED';
          throw err;
        }
      }
    }
    const actualEntryId = existingEntry ? existingEntry.id : entryId;

    const schoolClass = (
      draft.schoolAndAgeGroup?.schoolClass ||
      draft.schoolAndAgeGroup?.classGrade ||
      draft.schoolAndAgeGroup?.class_grade ||
      draft.schoolAndAgeGroup?.grade ||
      draft.schoolClass ||
      draft.classGrade ||
      draft.class_grade ||
      draft.grade ||
      ''
    ).trim();

    const schoolName = (
      draft.schoolAndAgeGroup?.schoolName ||
      draft.schoolAndAgeGroup?.school_name ||
      draft.schoolName ||
      draft.school_name ||
      existingEntry?.school_name ||
      ''
    ).trim();

    const rawAttended =
      draft.schoolAndAgeGroup?.previousChildrenProgramme ||
      draft.schoolAndAgeGroup?.previous_children_programme ||
      draft.schoolAndAgeGroup?.previousAttendance ||
      draft.schoolAndAgeGroup?.previous_attendance ||
      draft.schoolAndAgeGroup?.hasAttendedBefore ||
      draft.schoolAndAgeGroup?.attendedBefore ||
      draft.attendedBefore ||
      draft.previousChildrenProgramme ||
      draft.previous_children_programme ||
      draft.previousAttendance ||
      draft.previous_attendance ||
      draft.hasAttendedBefore;

    let prevProg = 'No';
    if (rawAttended === true || rawAttended === 'true' || (rawAttended && String(rawAttended).toLowerCase() === 'yes') || (rawAttended && String(rawAttended).toLowerCase() === 'y')) {
      prevProg = 'Yes';
    } else if (rawAttended === false || rawAttended === 'false' || (rawAttended && String(rawAttended).toLowerCase() === 'no') || (rawAttended && String(rawAttended).toLowerCase() === 'n')) {
      prevProg = 'No';
    }

    const noteTeam = (
      draft.schoolAndAgeGroup?.noteToTeam ||
      draft.schoolAndAgeGroup?.note_to_team ||
      draft.schoolAndAgeGroup?.teamNote ||
      draft.schoolAndAgeGroup?.additionalNote ||
      draft.schoolAndAgeGroup?.note ||
      draft.careNote ||
      draft.teamNote ||
      draft.additionalNote ||
      draft.note ||
      ''
    ).trim();

    const rawAllergies =
      draft.healthAndSupport?.hasMedicalNotes ||
      draft.healthAndSupport?.has_medical_notes ||
      draft.healthAndSupport?.hasAllergies ||
      draft.hasAllergies ||
      draft.hasMedicalNotes ||
      draft.has_medical_notes;

    let hasMedStr = 'No';
    if (rawAllergies === true || rawAllergies === 'true' || (rawAllergies && String(rawAllergies).toLowerCase() === 'yes') || (rawAllergies && String(rawAllergies).toLowerCase() === 'y')) {
      hasMedStr = 'Yes';
    } else if (rawAllergies === false || rawAllergies === 'false' || (rawAllergies && String(rawAllergies).toLowerCase() === 'no') || (rawAllergies && String(rawAllergies).toLowerCase() === 'n')) {
      hasMedStr = 'No';
    }
    const hasMed = hasMedStr === 'Yes' ? 1 : 0;

    const medNotes = (
      draft.healthAndSupport?.medicalNotes ||
      draft.healthAndSupport?.medical_notes ||
      draft.medicalNote ||
      draft.medicalNotes ||
      draft.medical_notes ||
      ''
    ).trim();

    const rawSupport =
      draft.healthAndSupport?.needsExtraSupport ||
      draft.healthAndSupport?.needs_extra_support ||
      draft.needsExtraSupport ||
      draft.needs_extra_support;

    let needsSupStr = 'No';
    if (rawSupport === true || rawSupport === 'true' || (rawSupport && String(rawSupport).toLowerCase() === 'yes') || (rawSupport && String(rawSupport).toLowerCase() === 'y')) {
      needsSupStr = 'Yes';
    } else if (rawSupport === false || rawSupport === 'false' || (rawSupport && String(rawSupport).toLowerCase() === 'no') || (rawSupport && String(rawSupport).toLowerCase() === 'n')) {
      needsSupStr = 'No';
    }
    const needsSup = needsSupStr === 'Yes' ? 1 : 0;

    const supNotes = (
      draft.healthAndSupport?.supportNotes ||
      draft.healthAndSupport?.support_notes ||
      draft.supportNote ||
      draft.supportNotes ||
      draft.support_notes ||
      ''
    ).trim();

    const infoConf = draft.healthAndSupport?.informationConfirmed || draft.healthAndSupport?.information_confirmed || draft.infoConfirmed || draft.informationConfirmed || draft.information_confirmed ? 1 : 0;

    if (existingEntry) {
      await execute(`
        UPDATE child_event_entries SET
          school_class = ?, school_name = ?, previous_children_programme = ?, note_to_team = ?,
          has_medical_notes = ?, medical_notes = ?, needs_extra_support = ?, support_notes = ?,
          information_confirmed = ?, updated_at = ?
        WHERE id = ?
      `, [schoolClass, schoolName, prevProg, noteTeam, hasMed, medNotes, needsSup, supNotes, infoConf, now, actualEntryId]);
    } else {
      await execute(`
        INSERT INTO child_event_entries (id, child_id, event_id, status, school_class, school_name, previous_children_programme, note_to_team, has_medical_notes, medical_notes, needs_extra_support, support_notes, information_confirmed, details_confirmed, created_at, updated_at)
        VALUES (?, ?, ?, 'incomplete', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `, [actualEntryId, childId, currentEventId, schoolClass, schoolName, prevProg, noteTeam, hasMed, medNotes, needsSup, supNotes, infoConf, now, now]);
    }

    const pickupType = draft.pickup?.pickupType || draft.pickup?.mode || draft.pickupType || 'parent';
    let pickupPhoto = draft.pickup?.pickupPersonPhoto || draft.pickup?.pickupPersonPhotoUrl || draft.pickup?.photo_url || draft.pickupPersonPhotoUrl || '';
    let pickupName = draft.pickup?.pickupPersonFullName || draft.pickup?.full_name || draft.pickupPersonFullName || '';
    let pickupRel = draft.pickup?.pickupPersonRelationship || draft.pickup?.relationship_to_child || draft.pickupPersonRelationship || '';
    let pickupPhone = draft.pickup?.pickupPersonPhone || draft.pickup?.phone_number || draft.pickupPersonPhone || '';
    let pickupWa = draft.pickup?.pickupPersonWhatsApp || draft.pickup?.whatsapp_number || draft.pickupPersonWhatsapp || '';
    let pickupAppr = draft.pickup?.approvedByParent || draft.pickup?.approved_by_parent || draft.pickupPersonApproved ? 1 : 0;

    if (pickupType === 'parent' && req.parentProfile) {
      if (!pickupPhoto && req.parentProfile.photo_file_id) {
        pickupPhoto = req.parentProfile.photo_file_id;
      }
      if (!pickupName && req.parentProfile.full_name) {
        pickupName = req.parentProfile.full_name;
      }
      if (!pickupPhone && req.parentProfile.phone_number) {
        pickupPhone = req.parentProfile.phone_number;
      }
      if (!pickupWa && req.parentProfile.whatsapp_number) {
        pickupWa = req.parentProfile.whatsapp_number;
      }
      if (!pickupRel) {
        pickupRel = 'Parent';
      }
      pickupAppr = 1;
    }

    if (pickupPhone && pickupPhone.trim()) {
      const countryForPickup = inferCountryIsoFromE164(pickupPhone) || draft.pickup?.pickupPersonCountryIso || draft.pickupPersonCountryIso || 'NG';
      const normalizedPickupPhone = normalizePhoneNumberToE164(pickupPhone.trim(), countryForPickup);
      if (normalizedPickupPhone) {
        pickupPhone = normalizedPickupPhone;
      }
    }
    if (pickupWa && pickupWa.trim()) {
      const countryForWa = inferCountryIsoFromE164(pickupWa) || draft.pickup?.pickupPersonCountryIso || draft.pickupPersonCountryIso || 'NG';
      const normalizedPickupWa = normalizePhoneNumberToE164(pickupWa.trim(), countryForWa);
      if (normalizedPickupWa) {
        pickupWa = normalizedPickupWa;
      }
    }

    const pickupPhotoId = await resolveToMediaFileId(pickupPhoto);

    const existingPickup = await queryOne('SELECT id FROM pickup_people WHERE child_event_entry_id = ?', [actualEntryId]);
    if (existingPickup) {
      await execute(`
        UPDATE pickup_people SET
          pickup_type = ?, full_name = ?, relationship_to_child = ?, phone_number = ?, whatsapp_number = ?, photo_file_id = ?, approved_by_parent = ?, updated_at = ?
        WHERE id = ?
      `, [pickupType, pickupName, pickupRel, pickupPhone, pickupWa, pickupPhotoId, pickupAppr, now, existingPickup.id]);
    } else {
      await execute(`
        INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, whatsapp_number, photo_file_id, approved_by_parent, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [crypto.randomUUID(), actualEntryId, pickupType, pickupName, pickupRel, pickupPhone, pickupWa, pickupPhotoId, pickupAppr, now, now]);
    }
  });

  const c = await queryOne('SELECT * FROM children WHERE id = ?', [childId]);
  const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, currentEventId]);
  const pickup = entry ? await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]) : null;

  return await mapChildToFrontend(c, entry, pickup, req.parentProfile!.id, false, currentEventId);
}

async function saveDraftHelper(req: AuthenticatedRequest, res: Response) {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  try {
    const result = await performSaveDraftInternal(req, req.body, req.params.childId);
    res.status(201).json(result);
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED_CHILD_ACCESS') {
      return res.status(403).json({ error: 'You do not have authorization to modify this child profile' });
    }
    if (err.code === 'NO_CURRENT_EVENT') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    if (err.statusCode && err.code) {
      return res.status(err.statusCode).json({
        success: false,
        code: err.code,
        message: err.message,
        error: err.message
      });
    }
    console.error('Save draft error:', err);
    res.status(500).json({ error: 'Failed to save child draft' });
  }
}

router.post('/children/draft', saveDraftHelper);

router.put('/children/:childId/draft', saveDraftHelper);

const PICKUP_EDITABLE_STATUSES = [
  'selected',
  'pass_ready',
  'checked_in',
  'inside'
];

router.patch('/children/:childId/pickup', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) {
    return res.status(404).json({ error: 'Parent profile not found' });
  }
  const { childId } = req.params;

  try {
    // 1. Resolve and verify child ownership
    const child = await queryOne('SELECT * FROM children WHERE id = ?', [childId]);
    if (!child) {
      return res.status(404).json({ error: 'Child not found' });
    }
    if (child.parent_profile_id !== req.parentProfile.id) {
      return res.status(403).json({ error: 'You do not have authorization to modify this child' });
    }

    // 2. Resolve current event and child entry
    const currentEvent = await getCurrentEvent();
    if (!currentEvent) {
      return res.status(400).json({ error: 'No active event found', code: 'NO_CURRENT_EVENT' });
    }

    const entry = await queryOne(
      'SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?',
      [child.id, currentEvent.id]
    );
    if (!entry) {
      return res.status(404).json({ error: 'Child registration not found for the current event' });
    }

    // 3. Status validation (concurrency-safe re-reading from database)
    const isPickedUp = entry.status === 'picked_up' || entry.status === 'checked_out' || Boolean(entry.picked_up_at);
    if (isPickedUp) {
      return res.status(400).json({
        success: false,
        code: 'PICKUP_ALREADY_COMPLETED',
        message: 'Pickup details can no longer be changed because this child has already been released.'
      });
    }

    if (!PICKUP_EDITABLE_STATUSES.includes(entry.status)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STATUS_FOR_PICKUP_EDIT',
        message: `Pickup details cannot be modified while child status is '${entry.status}'.`
      });
    }

    // 4. Payload validation
    const {
      pickupType,
      pickupPersonFullName,
      pickupPersonRelationship,
      pickupPersonPhone,
      pickupPersonWhatsApp,
      pickupPersonPhotoFileId,
      approvedByParent
    } = req.body || {};

    if (approvedByParent !== true && approvedByParent !== 1 && approvedByParent !== 'true') {
      return res.status(400).json({
        success: false,
        code: 'PARENT_APPROVAL_REQUIRED',
        message: 'Parent approval is required to update pickup authorization.'
      });
    }

    if (pickupType !== 'parent' && pickupType !== 'other_person') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PICKUP_TYPE',
        message: 'Pickup type must be either "parent" or "other_person".'
      });
    }

    let finalFullName = '';
    let finalRelationship = '';
    let finalPhone = '';
    let finalWhatsApp = '';
    let finalPhotoId = '';

    if (pickupType === 'parent') {
      finalFullName = (req.parentProfile.full_name || '').trim();
      finalRelationship = (child.relationship_to_child || 'Parent').trim();
      finalPhone = (req.parentProfile.phone_number || '').trim();
      finalWhatsApp = (req.parentProfile.whatsapp_number || req.parentProfile.phone_number || '').trim();
      finalPhotoId = req.parentProfile.photo_file_id || '';

      if (!finalFullName) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_PARENT_NAME',
          message: 'Primary parent profile name is missing.'
        });
      }
    } else {
      // other_person
      const rawFullName = typeof pickupPersonFullName === 'string' ? pickupPersonFullName.trim() : '';
      const rawRelationship = typeof pickupPersonRelationship === 'string' ? pickupPersonRelationship.trim() : '';
      const rawPhone = typeof pickupPersonPhone === 'string' ? pickupPersonPhone.trim() : '';
      const rawWhatsApp = typeof pickupPersonWhatsApp === 'string' ? pickupPersonWhatsApp.trim() : '';
      const rawPhoto = typeof pickupPersonPhotoFileId === 'string' ? pickupPersonPhotoFileId.trim() : '';

      if (!rawFullName || rawFullName.length < 2) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_FULL_NAME',
          message: 'A valid full name is required for the authorised pickup person.'
        });
      }

      if (!rawRelationship) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_RELATIONSHIP',
          message: 'Relationship to child is required.'
        });
      }

      if (!rawPhone) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_PHONE_NUMBER',
          message: 'A phone number is required for the authorised pickup person.'
        });
      }

      const countryIso = inferCountryIsoFromE164(rawPhone) || req.parentProfile.country_iso || 'NG';
      const normalizedPhone = normalizePhoneNumberToE164(rawPhone, countryIso);
      if (!normalizedPhone) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_PHONE_NUMBER',
          message: 'Please provide a valid phone number with country code.'
        });
      }

      let normalizedWa = '';
      if (rawWhatsApp) {
        const waIso = inferCountryIsoFromE164(rawWhatsApp) || countryIso;
        normalizedWa = normalizePhoneNumberToE164(rawWhatsApp, waIso) || rawWhatsApp;
      }

      if (!rawPhoto || !isValidUploadedPhoto(rawPhoto)) {
        return res.status(400).json({
          success: false,
          code: 'PHOTO_REQUIRED',
          message: 'A clear photograph of the authorised pickup person is required for security verification.'
        });
      }

      const resolvedPhotoId = await resolveToMediaFileId(rawPhoto);
      if (!resolvedPhotoId) {
        return res.status(400).json({
          success: false,
          code: 'PHOTO_RESOLUTION_FAILED',
          message: 'Unable to resolve the uploaded pickup person photograph.'
        });
      }

      finalFullName = rawFullName;
      finalRelationship = rawRelationship;
      finalPhone = normalizedPhone;
      finalWhatsApp = normalizedWa;
      finalPhotoId = resolvedPhotoId;
    }

    // 5. Query previous pickup for audit log
    const existingPickup = await queryOne(
      'SELECT * FROM pickup_people WHERE child_event_entry_id = ?',
      [entry.id]
    );
    const previousPickupType = existingPickup?.pickup_type || null;
    const previousPickupPersonName = existingPickup?.full_name || null;

    const now = new Date().toISOString();
    let updatedPickupId = existingPickup?.id;

    if (existingPickup) {
      await execute(`
        UPDATE pickup_people SET
          pickup_type = ?,
          full_name = ?,
          relationship_to_child = ?,
          phone_number = ?,
          whatsapp_number = ?,
          photo_file_id = ?,
          approved_by_parent = 1,
          updated_at = ?
        WHERE id = ?
      `, [
        pickupType,
        finalFullName,
        finalRelationship,
        finalPhone,
        finalWhatsApp,
        finalPhotoId,
        now,
        existingPickup.id
      ]);
    } else {
      updatedPickupId = crypto.randomUUID();
      await execute(`
        INSERT INTO pickup_people (
          id, child_event_entry_id, pickup_type, full_name, relationship_to_child,
          phone_number, whatsapp_number, photo_file_id, approved_by_parent, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `, [
        updatedPickupId,
        entry.id,
        pickupType,
        finalFullName,
        finalRelationship,
        finalPhone,
        finalWhatsApp,
        finalPhotoId,
        now,
        now
      ]);
    }

    // 6. Record immutable audit log
    const auditId = `audit-${crypto.randomUUID()}`;
    try {
      await execute(`
        INSERT INTO audit_logs (
          id, user_id, user_role, action, target_type, target_id, details, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        auditId,
        req.user?.id || req.parentProfile.user_id,
        'parent',
        'parent_pickup_authorization_updated',
        'child_event_entry',
        entry.id,
        JSON.stringify({
          eventId: currentEvent.id,
          childId: child.id,
          childEventEntryId: entry.id,
          parentId: req.parentProfile.id,
          previousPickupType,
          previousPickupPersonName,
          newPickupType: pickupType,
          newPickupPersonName: finalFullName,
          changedAt: now
        }),
        now
      ]);
    } catch (auditErr) {
      console.error('[AuditLog] Failed to record pickup update audit log:', auditErr);
    }

    // 7. Resolve updated child and return
    const updatedChild = await queryOne('SELECT * FROM children WHERE id = ?', [child.id]);
    const updatedEntry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entry.id]);
    const updatedPickup = await queryOne('SELECT * FROM pickup_people WHERE id = ?', [updatedPickupId]);

    const mappedChild = await mapChildToFrontend(
      updatedChild,
      updatedEntry,
      updatedPickup,
      req.parentProfile.id,
      false,
      currentEvent.id
    );

    return res.json({
      success: true,
      message: 'Pickup person updated successfully.',
      child: mappedChild,
      pickup: {
        pickupType,
        fullName: finalFullName,
        relationship: finalRelationship,
        phone: finalPhone,
        whatsapp: finalWhatsApp,
        photoFileId: finalPhotoId
      }
    });
  } catch (err: any) {
    console.error('Update pickup error:', err);
    res.status(500).json({ error: 'Failed to update pickup person' });
  }
});

router.post('/children/:childId/submit', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  const { childId } = req.params;

  const currentEvent = await getCurrentEvent();
  if (!currentEvent) {
    return res.status(400).json({
      error: 'No event is currently open for registration.',
      code: 'NO_CURRENT_EVENT'
    });
  }
  const currentEventId = currentEvent.id;

  const checkOwner = await queryOne('SELECT parent_profile_id FROM children WHERE id = ?', [childId]);
  if (!checkOwner) {
    return res.status(404).json({ error: 'Child not found' });
  }
  if (checkOwner.parent_profile_id !== req.parentProfile.id) {
    return res.status(403).json({ error: 'You do not have authorization to access this child profile' });
  }

  // Save latest draft payload first if provided
  if (req.body && Object.keys(req.body).length > 1) {
    try {
      await performSaveDraftInternal(req, req.body, childId);
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED_CHILD_ACCESS') {
        return res.status(403).json({ error: 'You do not have authorization to access this child profile' });
      }
      if (err.code === 'NO_CURRENT_EVENT') {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      if (err.statusCode && err.code) {
        return res.status(err.statusCode).json({
          success: false,
          code: err.code,
          message: err.message,
          error: err.message
        });
      }
      throw err;
    }
  }

  // Enforce parent profile photo requirement before submitting a child registration
  if (!isValidUploadedPhoto(req.parentProfile.photo_file_id)) {
    return res.status(400).json({
      success: false,
      code: 'PARENT_PHOTO_REQUIRED',
      error: 'Please add a profile photo to continue.',
      message: 'Please add a profile photo to continue.'
    });
  }

  const c = await queryOne('SELECT * FROM children WHERE id = ? AND parent_profile_id = ?', [childId, req.parentProfile.id]);
  if (!c) return res.status(404).json({ error: 'Child not found' });

  const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, currentEventId]);
  if (!entry) {
    return res.status(400).json({
      success: false,
      message: 'Please complete the missing details before sending.'
    });
  }

  const pickup = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]);
  if (!pickup) {
    return res.status(400).json({
      success: false,
      message: 'Please complete the missing details before sending.'
    });
  }

  // Idempotency: check if already submitted
  if (entry.status === 'under_review' || entry.status === 'selected' || entry.status === 'pass_ready' || entry.status === 'waiting_list' || entry.status === 'not_selected') {
    const mapped = await mapChildToFrontend(c, entry, pickup, req.parentProfile.id, false, currentEventId);
    return res.json({
      success: true,
      childId: childId,
      status: 'under_review',
      ...mapped
    });
  }

  // Assemble complete draft object to validate server-side
  const draftObject = {
    childDetails: {
      fullName: c.full_name,
      gender: c.gender,
      dateOfBirth: c.date_of_birth,
      relationshipToChild: c.relationship_to_child,
      photo: c.photo_file_id
    },
    schoolAndAgeGroup: {
      schoolClass: entry.school_class,
      schoolName: entry.school_name,
      previousChildrenProgramme: entry.previous_children_programme,
      noteToTeam: entry.note_to_team
    },
    healthAndSupport: {
      hasMedicalNotes: entry.has_medical_notes ? 'Yes' : 'No',
      medicalNotes: entry.medical_notes,
      needsExtraSupport: entry.needs_extra_support ? 'Yes' : 'No',
      supportNotes: entry.support_notes,
      informationConfirmed: Boolean(entry.information_confirmed)
    },
    pickup: {
      pickupType: pickup.pickup_type,
      pickupPersonPhoto: pickup.photo_file_id || (pickup.pickup_type === 'parent' ? req.parentProfile.photo_file_id : ''),
      pickupPersonFullName: pickup.full_name || (pickup.pickup_type === 'parent' ? req.parentProfile.full_name : ''),
      pickupPersonRelationship: pickup.relationship_to_child || (pickup.pickup_type === 'parent' ? 'Parent' : ''),
      pickupPersonPhone: pickup.phone_number || (pickup.pickup_type === 'parent' ? req.parentProfile.phone_number : ''),
      pickupPersonCountryIso: req.body?.pickup?.pickupPersonCountryIso || req.body?.pickupPersonCountryIso || inferCountryIsoFromE164(pickup.phone_number) || 'NG',
      pickupPersonWhatsApp: pickup.whatsapp_number || (pickup.pickup_type === 'parent' ? req.parentProfile.whatsapp_number : ''),
      approvedByParent: Boolean(pickup.approved_by_parent || pickup.pickup_type === 'parent')
    },
    review: {
      detailsConfirmed: true
    }
  };

  const childVal = validateChildDraftStep(draftObject, req.parentProfile);
  if (!childVal.valid) {
    const firstErrKey = Object.keys(childVal.errors)[0];
    const firstErrMsg = childVal.errors[firstErrKey].message;
    const errorsList = Object.values(childVal.errors).map(err => ({
      field: err.field,
      code: err.code,
      message: err.message
    }));
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_FAILED',
      message: firstErrMsg || "Please complete the missing details before sending.",
      errors: errorsList,
      errorsMap: childVal.errors
    });
  }

  if (entry.status === 'draft') {
    const nowIso = new Date().toISOString();
    if (currentEvent.parent_access_opens_at && nowIso < currentEvent.parent_access_opens_at) {
      return res.status(403).json({
        success: false,
        code: 'REGISTRATION_NOT_OPEN',
        message: 'Registration for this event is not open yet.',
        error: 'Registration for this event is not open yet.'
      });
    }
    if (currentEvent.parent_access_closes_at && nowIso > currentEvent.parent_access_closes_at) {
      return res.status(403).json({
        success: false,
        code: 'REGISTRATION_CLOSED',
        message: 'Registration for this event has closed.',
        error: 'Registration for this event has closed.'
      });
    }
  }

  // Server-authoritative event age eligibility check evaluated on event date
  const eligibility = checkEventEligibility(c.date_of_birth, currentEvent);
  if (!eligibility.eligible) {
    const defaultReason = (currentEvent?.minimum_age && currentEvent?.maximum_age)
      ? `This programme is currently open to children ages ${currentEvent.minimum_age}–${currentEvent.maximum_age}.`
      : 'This programme is currently open to children ages 2–14.';
    return res.status(400).json({
      success: false,
      code: 'AGE_NOT_ELIGIBLE',
      message: eligibility.reason || defaultReason,
      error: eligibility.reason || defaultReason,
      eligibility
    });
  }

  const now = new Date().toISOString();
  await execute(`
    UPDATE child_event_entries SET
      status = 'under_review',
      details_confirmed = 1,
      submitted_at = COALESCE(submitted_at, ?),
      updated_at = ?
    WHERE id = ?
  `, [now, now, entry.id]);

  // 1. Parent confirmation notifications
  const parentNotifId = `pnotif-${crypto.randomUUID()}`;
  await execute(`
    INSERT INTO parent_notifications (
      id, parent_id, event_id, child_id, title, message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    parentNotifId,
    req.parentProfile.id,
    currentEventId,
    childId,
    'Application submitted',
    `${c.full_name || 'Child'}'s application has been received for ${currentEvent.title || 'the event'}.`,
    now
  ]);

  const parentGeneralNotifId = `notif-${crypto.randomUUID()}`;
  await execute(`
    INSERT INTO notifications (
      id, title, message, type, audience_role, audience_scope, event_id, child_id, parent_id, created_by_user_id, created_at, priority, channel, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    parentGeneralNotifId,
    'Application submitted',
    `${c.full_name || 'Child'}'s application has been received for ${currentEvent.title || 'the event'}.`,
    'application_submitted',
    'parent',
    'individual',
    currentEventId,
    childId,
    req.parentProfile.id,
    req.user.id,
    now,
    'normal',
    'in-app',
    JSON.stringify({ childId, applicationId: entry.id, eventId: currentEventId, eventTitle: currentEvent.title, type: 'application_submitted' })
  ]);

  // 2. Admin operational notification (parent_id is null so it never leaks to parent view)
  const adminNotifId = `notif-${crypto.randomUUID()}`;
  await execute(`
    INSERT INTO notifications (
      id, title, message, type, audience_role, audience_scope, event_id, child_id, parent_id, created_by_user_id, created_at, priority, channel, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    adminNotifId,
    'New child application',
    `New application submitted for ${c.full_name || 'child'} (${currentEvent.title || 'Current Event'}).`,
    'new_application',
    'admin',
    'all',
    currentEventId,
    childId,
    null,
    req.user.id,
    now,
    'normal',
    'in-app',
    JSON.stringify({ childId, applicationId: entry.id, eventId: currentEventId, eventTitle: currentEvent.title, type: 'new_application' })
  ]);

  const updatedEntry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entry.id]);
  if (req.user && req.user.email) {
    const childStatusLink = buildParentStatusUrl(childId);
    sendChildReviewReceivedEmail({
      parentEmail: req.user.email,
      parentFirstName: req.parentProfile?.full_name,
      childName: c.full_name,
      childStatusLink
    }).catch(() => {});
  }

  const parentPhone = req.parentProfile?.whatsapp_number || req.parentProfile?.phone_number;
  if (parentPhone) {
    const pName = (req.parentProfile?.full_name || '').split(' ')[0] || 'Parent';
    const cName = c.full_name || 'your child';
    const waText = `Hello ${pName},\n\nWe have received ${cName}'s application for ${currentEvent.title || 'the event'}. It is currently under review by our team.\n\nYou will receive a message when there is a decision.`;
    sendWhatsApp(parentPhone, waText, {
      intent: 'child_under_review',
      parentFirstName: pName,
      childFirstName: cName,
      eventName: currentEvent.title || 'the event'
    }).catch(err => {
      console.error('[ParentReview] Failed to dispatch WhatsApp under-review message:', err);
    });
  }

  const mapped = await mapChildToFrontend(c, updatedEntry, pickup, req.parentProfile.id, false, currentEventId);
  res.json({
    success: true,
    childId: childId,
    status: 'under_review',
    ...mapped
  });
});

router.get('/passes', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  try {
    const currentEventId = await getCurrentEventId();
    if (!currentEventId) {
      return res.json({ success: true, passes: [] });
    }
    const isBioProtected = req.headers['x-biometric-protected'] === 'true';
    const result = await getPassesForParent(req.parentProfile.id, currentEventId);
    if (isBioProtected && result && result.passes) {
      result.passes = await Promise.all(result.passes.map(async p => {
        if (!(await isChildPassAuthorized(req.parentProfile.id, p.childId))) {
          return {
            ...p,
            passCode: undefined,
            qrPayload: undefined,
            passLocked: true,
            requiresBiometric: true
          };
        }
        return p;
      }));
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch passes' });
  }
});

router.get('/passes/:passId', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  const { passId } = req.params;
  try {
    const pass = await queryOne('SELECT * FROM event_passes WHERE id = ?', [passId]);
    if (!pass) {
      return res.status(404).json({ error: 'Event pass not found' });
    }
    const entry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [pass.child_event_entry_id]);
    if (!entry) {
      return res.status(404).json({ error: 'Child registration not found' });
    }
    const c = await queryOne('SELECT * FROM children WHERE id = ?', [entry.child_id]);
    if (!c) {
      return res.status(404).json({ error: 'Child not found' });
    }
    if (c.parent_profile_id !== req.parentProfile.id) {
      return res.status(403).json({ error: 'You are not authorized to view this pass' });
    }

    const isBiometricProtected = req.headers['x-biometric-protected'] === 'true' || req.query.biometric === 'true';
    const passToken = (req.headers['x-pass-token'] as string) || (req.query.passToken as string);
    if (isBiometricProtected && !(await isChildPassAuthorized(req.parentProfile.id, c.id, passToken))) {
      return res.status(403).json({
        error: 'Biometric authorization required to access secure pass',
        passLocked: true,
        requiresBiometric: true
      });
    }

    const currentEventId = await getCurrentEventId();
    const pickup = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]);
    const mappedChild = await mapChildToFrontend(c, entry, pickup, req.parentProfile.id, false, currentEventId);
    res.json({
      success: true,
      passReference: pass.pass_reference,
      status: pass.status,
      issuedAt: pass.issued_at,
      child: mappedChild
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch pass' });
  }
});

router.get('/children/:childId/status', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  const { childId } = req.params;

  const checkOwner = await queryOne('SELECT parent_profile_id FROM children WHERE id = ?', [childId]);
  if (!checkOwner) {
    return res.status(404).json({ error: 'Child not found' });
  }
  if (checkOwner.parent_profile_id !== req.parentProfile.id) {
    return res.status(403).json({ error: 'You do not have authorization to access this child profile' });
  }

  const c = await queryOne('SELECT * FROM children WHERE id = ? AND parent_profile_id = ?', [childId, req.parentProfile.id]);
  if (!c) return res.status(404).json({ error: 'Child not found' });

  const currentEventId = await getCurrentEventId();
  const entry = currentEventId
    ? await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, currentEventId])
    : null;
  const pickup = entry ? await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]) : null;

  res.json(await mapChildToFrontend(c, entry, pickup, req.parentProfile.id, req.headers['x-biometric-protected'] === 'true', currentEventId));
});

router.get('/children/:childId/pass', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  const { childId } = req.params;

  const currentEvent = await getCurrentEvent();
  if (!currentEvent) {
    return res.status(400).json({ error: 'No event is currently open for registration.', status: 'incomplete' });
  }
  const currentEventId = currentEvent.id;

  const checkOwner = await queryOne('SELECT parent_profile_id FROM children WHERE id = ?', [childId]);
  if (!checkOwner) {
    return res.status(404).json({ error: 'Child not found' });
  }
  if (checkOwner.parent_profile_id !== req.parentProfile.id) {
    return res.status(403).json({ error: 'You do not have authorization to access this child profile' });
  }

  const c = await queryOne('SELECT * FROM children WHERE id = ? AND parent_profile_id = ?', [childId, req.parentProfile.id]);
  if (!c) return res.status(404).json({ error: 'Child not found' });

  const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, currentEventId]);
  const allowedPassStatuses = ['pass_ready', 'selected', 'checked_in', 'inside', 'picked_up', 'checked_out'];
  const existingPass = entry ? await queryOne('SELECT * FROM event_passes WHERE child_event_entry_id = ? AND status = ?', [entry.id, 'active']) : null;
  if (!entry || (!existingPass && !allowedPassStatuses.includes(entry.status))) {
    return res.status(403).json({ error: 'Event pass is not ready yet', status: entry?.status || 'incomplete' });
  }

  const isBiometricProtected = req.headers['x-biometric-protected'] === 'true' || req.query.biometric === 'true';
  const passToken = (req.headers['x-pass-token'] as string) || (req.query.passToken as string);
  if (isBiometricProtected && !(await isChildPassAuthorized(req.parentProfile.id, childId, passToken))) {
    return res.status(403).json({
      error: 'Biometric authorization required to access secure pass',
      passLocked: true,
      requiresBiometric: true
    });
  }

  let pass = await queryOne('SELECT * FROM event_passes WHERE child_event_entry_id = ?', [entry.id]);
  if (!pass) {
    const passId = crypto.randomUUID();
    const currentYear = new Date().getFullYear();
    const passRef = `KOI-${currentYear}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const passHash = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `, [passId, entry.id, passRef, passHash, now, now, now]);

    pass = await queryOne('SELECT * FROM event_passes WHERE id = ?', [passId]);
  }

  const pickup = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]);
  const mappedChild = await mapChildToFrontend(c, entry, pickup, req.parentProfile.id, false, currentEventId);

  res.json({
    passReference: pass.pass_reference,
    status: pass.status,
    issuedAt: pass.issued_at,
    child: mappedChild,
    authorized: true
  });
});

router.delete('/children/:childId', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  const { childId } = req.params;

  try {
    const c = await queryOne('SELECT * FROM children WHERE id = ?', [childId]);
    if (!c) {
      return res.status(404).json({ error: 'Child not found' });
    }

    if (c.parent_profile_id !== req.parentProfile.id) {
      return res.status(403).json({ error: 'You do not have authorization to access this child profile' });
    }

    const currentEventId = await getCurrentEventId();
    const entry = currentEventId
      ? await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, currentEventId])
      : null;
    const status = entry ? entry.status : 'incomplete';

    if (status === 'incomplete' || status === 'draft' || !entry) {
      // Check if this child has historical entries in other events
      const otherEntries = await query(
        'SELECT id FROM child_event_entries WHERE child_id = ?' + (entry ? ' AND id != ?' : ''),
        entry ? [childId, entry.id] : [childId]
      );
      const hasHistoricalEntries = otherEntries && otherEntries.length > 0;

      await transaction(async () => {
        if (entry) {
          await execute('DELETE FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]);
          await execute('DELETE FROM event_passes WHERE child_event_entry_id = ?', [entry.id]);
          await execute('DELETE FROM child_event_entries WHERE id = ?', [entry.id]);
        }
        // Only delete the persistent child profile if there are no historical event entries
        if (!hasHistoricalEntries) {
          await execute('DELETE FROM children WHERE id = ?', [childId]);
        }
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DB Log] Successfully removed child/entry ${childId}`);
      }

      return res.json({ success: true, message: 'Child removed.' });
    } else if (status === 'under_review') {
      // Soft-withdraw details for the current event
      await execute(`
        UPDATE child_event_entries
        SET status = 'withdrawn', withdrawn_at = ?, updated_at = ?
        WHERE id = ?
      `, [new Date().toISOString(), new Date().toISOString(), entry.id]);

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DB Log] Successfully withdrew child ${childId} from current event entry`);
      }

      return res.json({ success: true, message: 'Details withdrawn.' });
    } else if (status === 'pass_ready') {
      return res.status(409).json({
        error: 'This child already has an event pass. Please contact the Children and Teens team if you need help.'
      });
    } else if (status === 'checked_in' || status === 'inside' || status === 'picked_up') {
      return res.status(409).json({
        error: 'This child has already been checked in for the event.'
      });
    } else {
      return res.status(409).json({
        error: 'Cannot remove child details at this stage. Please contact our team if you need assistance.'
      });
    }
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error removing/withdrawing child:', err);
    }
    return res.status(500).json({ error: 'An unexpected error occurred while processing your request.' });
  }
});

// GET /api/parent/notifications
router.get('/notifications', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  try {
    const notifications = await query(
      'SELECT id, event_id as eventId, child_id as childId, title, message, read_at as readAt, created_at as createdAt FROM parent_notifications WHERE parent_id = ? ORDER BY created_at DESC',
      [req.parentProfile.id]
    );
    res.json(notifications);
  } catch (err: any) {
    console.error('Error fetching parent notifications:', err);
    res.status(500).json({ error: 'Could not fetch notifications' });
  }
});

// POST /api/parent/notifications/read-all
router.post('/notifications/read-all', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  try {
    const now = new Date().toISOString();
    await execute(
      'UPDATE parent_notifications SET read_at = ? WHERE parent_id = ? AND read_at IS NULL',
      [now, req.parentProfile.id]
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err: any) {
    console.error('Error marking all notifications as read:', err);
    res.status(500).json({ error: 'Could not mark notifications as read' });
  }
});

// POST /api/parent/notifications/:id/read
router.post('/notifications/:id/read', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  const { id } = req.params;
  try {
    const now = new Date().toISOString();
    await execute(
      'UPDATE parent_notifications SET read_at = ? WHERE id = ? AND parent_id = ?',
      [now, id, req.parentProfile.id]
    );
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err: any) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({ error: 'Could not mark notification as read' });
  }
});

export default router;
