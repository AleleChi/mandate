import { Router, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne, execute, transaction } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { sendChildReviewReceivedEmail } from '../services/email';
import { validateParentProfile, validateChildDraftStep, validatePhoneNumber } from '../utils/validation';

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

const REAL_EVENT_ID = 'event-ga-2026';

function calculateAgeAndGroup(dobStr: string) {
  if (!dobStr) return { calculatedAge: 0, ageGroup: 'Not specified', needsAgeReview: false };
  const dob = new Date(dobStr);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  let ageGroup = 'Ages 4 to 6';
  let needsAgeReview = false;
  if (age < 4) {
    ageGroup = 'Under 4 (Review Needed)';
    needsAgeReview = true;
  } else if (age >= 4 && age <= 6) {
    ageGroup = 'Ages 4 to 6';
  } else if (age >= 7 && age <= 9) {
    ageGroup = 'Ages 7 to 9';
  } else if (age >= 10 && age <= 12) {
    ageGroup = 'Ages 10 to 12';
  } else {
    ageGroup = 'Teens';
  }
  return { calculatedAge: age, ageGroup, needsAgeReview };
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
  return {
    fullName: row.full_name || '',
    email: row.email || '',
    phone: row.phone_number || '',
    phoneNumber: row.phone_number || '',
    whatsapp: row.whatsapp_number || row.phone_number || '',
    whatsappNumber: row.whatsapp_number || row.phone_number || '',
    homeAddress: row.home_address || '',
    country: row.country || '',
    stateRegion: row.state_region || '',
    city: row.city || '',
    preferredContact: (row.preferred_contact as any) || 'WhatsApp',
    isWorker: Boolean(row.is_koinonia_worker),
    department: row.department || '',
    photoFileId: row.photo_file_id || '',
    photoUrl: resolvedPhoto,
    profileCompletedAt: row.profile_completed_at || null
  };
}

async function mapChildToFrontend(childRow: any, entryRow: any, pickupRow: any) {
  const status = entryRow ? entryRow.status : 'incomplete';
  let frontendStatus: any = 'Incomplete';
  let statusNote = 'Continue entering child details';

  if (status === 'under_review') {
    frontendStatus = 'Under review';
    statusNote = 'Details sent for review';
  } else if (status === 'review_reopened') {
    frontendStatus = 'Review reopened';
    const first_name = childRow.full_name ? childRow.full_name.split(' ')[0] : 'your child';
    statusNote = `The event team has reopened the review for ${first_name}. We will share an update when a new decision is made.`;
  } else if (status === 'selected') {
    frontendStatus = 'Selected';
    statusNote = 'Selected for event entry';
  } else if (status === 'pass_ready') {
    frontendStatus = 'Pass ready';
    statusNote = 'Event pass is available';
  } else if (status === 'waiting_list') {
    frontendStatus = 'Waiting list';
    statusNote = 'Placed on waiting list';
  } else if (status === 'not_selected') {
    frontendStatus = 'Not selected';
    statusNote = 'Not selected for this session';
  } else if (status === 'withdrawn') {
    frontendStatus = 'Withdrawn';
    statusNote = 'Details withdrawn';
  } else if (status === 'checked_in') {
    frontendStatus = 'Checked in';
    statusNote = 'Successfully checked in';
  } else if (status === 'inside') {
    frontendStatus = 'Inside';
    statusNote = 'Inside the venue';
  } else if (status === 'picked_up') {
    frontendStatus = 'Picked up';
    statusNote = 'Picked up and checked out';
  } else if (status === 'checked_out') {
    frontendStatus = 'Checked out';
    statusNote = 'Checked out';
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

  return {
    id: childRow.id,
    name: childRow.full_name || '',
    age: childRow.calculated_age !== null ? childRow.calculated_age : 0,
    ageGroup: childRow.age_group || '',
    status: frontendStatus,
    statusNote,
    photoFileId: childRow.photo_file_id || '',
    photoUrl: resolvedChildPhoto,
    submittedAt: entryRow?.submitted_at || undefined,
    draftData
  };
}

async function getFullChildrenList(parentProfileId: string) {
  const children = await query('SELECT * FROM children WHERE parent_profile_id = ? ORDER BY created_at DESC', [parentProfileId]);
  const list = [];
  for (const c of children) {
    const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [c.id, REAL_EVENT_ID]);
    const pickup = entry ? await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]) : null;
    list.push(await mapChildToFrontend(c, entry, pickup));
  }
  return list;
}

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
    homeAddress,
    country,
    stateRegion,
    city,
    preferredContact,
    isWorker,
    department,
    photoUrl
  } = req.body;

  const emailToUse = (email || req.parentProfile.email || '').trim();

  // Validate the parent profile data
  const validation = validateParentProfile({
    fullName,
    email: emailToUse,
    phone,
    whatsapp,
    homeAddress,
    country,
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
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_FAILED',
      error: firstErrMsg,
      errors: errorsList,
      errorsMap: validation.errors
    });
  }

  const cleanPhone = validatePhoneNumber(phone, 'NG').normalizedPhone || phone.trim();
  const cleanWhatsapp = whatsapp ? (validatePhoneNumber(whatsapp, 'NG').normalizedPhone || whatsapp.trim()) : cleanPhone;

  const mediaFileId = await resolveToMediaFileId(photoUrl);

  const now = new Date().toISOString();

  // All required fields check
  const isProfileComplete =
    fullName && fullName.trim() &&
    emailToUse &&
    phone && phone.trim() &&
    whatsapp && whatsapp.trim() &&
    homeAddress && homeAddress.trim() &&
    country && country.trim() &&
    stateRegion && stateRegion.trim() &&
    city && city.trim() &&
    preferredContact && preferredContact.trim() &&
    mediaFileId &&
    (!isWorker || (department && department.trim()));

  const completedAtValue = isProfileComplete ? (req.parentProfile.profile_completed_at || now) : null;

  await execute(`
    UPDATE parent_profiles SET
      full_name = ?,
      email = ?,
      phone_number = ?,
      whatsapp_number = ?,
      home_address = ?,
      country = ?,
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
    homeAddress.trim(),
    country.trim(),
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

router.get('/home', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) {
    return res.status(404).json({ error: 'Parent profile not found' });
  }

  const list = await getFullChildrenList(req.parentProfile.id);
  const childrenCount = list.length;
  const underReviewCount = list.filter(c => c.status === 'Under review').length;
  const passReadyCount = list.filter(c => c.status === 'Pass ready').length;

  res.json({
    parentProfile: await mapProfileToFrontend(req.parentProfile),
    childrenCount,
    underReviewCount,
    passReadyCount,
    childrenList: list
  });
});

router.get('/children', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  const list = await getFullChildrenList(req.parentProfile.id);
  res.json(list);
});

async function performSaveDraftInternal(req: AuthenticatedRequest, draft: any, childIdParam?: string) {
  const childId = draft.id && draft.id.startsWith('child-') ? draft.id : (childIdParam || crypto.randomUUID());
  const now = new Date().toISOString();

  if (childId && !childId.startsWith('child-')) {
    const checkOwner = await queryOne('SELECT parent_profile_id FROM children WHERE id = ?', [childId]);
    if (checkOwner && checkOwner.parent_profile_id !== req.parentProfile!.id) {
      throw new Error('UNAUTHORIZED_CHILD_ACCESS');
    }
  }

  const fullName = (draft.childDetails?.fullName || draft.fullName || 'Untitled Child').trim();
  const gender = draft.childDetails?.gender || draft.gender || 'Not specified';
  const dob = draft.childDetails?.dateOfBirth || draft.dob || '';
  const photo = draft.childDetails?.photo || draft.photoUrl || '';
  const relationship = draft.childDetails?.relationshipToChild || draft.relationship || 'Parent';

  const childPhotoId = await resolveToMediaFileId(photo);

  const { calculatedAge, ageGroup, needsAgeReview } = calculateAgeAndGroup(dob);

  await transaction(async () => {
    const existingChild = await queryOne('SELECT id FROM children WHERE id = ? AND parent_profile_id = ?', [childId, req.parentProfile!.id]);
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
    const existingEntry = await queryOne('SELECT id FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, REAL_EVENT_ID]);
    const actualEntryId = existingEntry ? existingEntry.id : entryId;

    const schoolClass = draft.schoolAndAgeGroup?.schoolClass || draft.schoolClass || '';
    const schoolName = draft.schoolAndAgeGroup?.schoolName || draft.schoolName || '';
    const prevProg = draft.schoolAndAgeGroup?.previousChildrenProgramme || draft.attendedBefore || 'No';
    const noteTeam = draft.schoolAndAgeGroup?.noteToTeam || draft.careNote || '';

    const hasMed = (draft.healthAndSupport?.hasMedicalNotes || draft.hasAllergies) === 'Yes' ? 1 : 0;
    const medNotes = draft.healthAndSupport?.medicalNotes || draft.medicalNote || '';
    const needsSup = (draft.healthAndSupport?.needsExtraSupport || draft.needsExtraSupport) === 'Yes' ? 1 : 0;
    const supNotes = draft.healthAndSupport?.supportNotes || draft.supportNote || '';
    const infoConf = draft.healthAndSupport?.informationConfirmed || draft.infoConfirmed ? 1 : 0;

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
      `, [actualEntryId, childId, REAL_EVENT_ID, schoolClass, schoolName, prevProg, noteTeam, hasMed, medNotes, needsSup, supNotes, infoConf, now, now]);
    }

    const pickupType = draft.pickup?.pickupType || draft.pickupType || 'parent';
    const pickupPhoto = draft.pickup?.pickupPersonPhoto || draft.pickupPersonPhotoUrl || '';
    const pickupName = draft.pickup?.pickupPersonFullName || draft.pickupPersonFullName || '';
    const pickupRel = draft.pickup?.pickupPersonRelationship || draft.pickupPersonRelationship || '';
    const pickupPhone = draft.pickup?.pickupPersonPhone || draft.pickupPersonPhone || '';
    const pickupWa = draft.pickup?.pickupPersonWhatsApp || draft.pickupPersonWhatsapp || '';
    const pickupAppr = draft.pickup?.approvedByParent || draft.pickupPersonApproved ? 1 : 0;

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
  const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, REAL_EVENT_ID]);
  const pickup = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]);

  return await mapChildToFrontend(c, entry, pickup);
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
    console.error('Save draft error:', err);
    res.status(500).json({ error: 'Failed to save child draft' });
  }
}

router.post('/children/draft', saveDraftHelper);

router.put('/children/:childId/draft', saveDraftHelper);

router.post('/children/:childId/submit', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  const { childId } = req.params;

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
    }
  }

  const c = await queryOne('SELECT * FROM children WHERE id = ? AND parent_profile_id = ?', [childId, req.parentProfile.id]);
  if (!c) return res.status(404).json({ error: 'Child not found' });

  const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, REAL_EVENT_ID]);
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
    const mapped = await mapChildToFrontend(c, entry, pickup);
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
      pickupPersonPhoto: pickup.photo_file_id,
      pickupPersonFullName: pickup.full_name,
      pickupPersonRelationship: pickup.relationship_to_child,
      pickupPersonPhone: pickup.phone_number,
      pickupPersonWhatsApp: pickup.whatsapp_number,
      approvedByParent: Boolean(pickup.approved_by_parent)
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

  const now = new Date().toISOString();
  await execute(`
    UPDATE child_event_entries SET
      status = 'under_review',
      details_confirmed = 1,
      submitted_at = COALESCE(submitted_at, ?),
      updated_at = ?
    WHERE id = ?
  `, [now, now, entry.id]);

  const updatedEntry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entry.id]);
  if (req.user && req.user.email) {
    const baseUrl = process.env.APP_BASE_URL || 'https://koinonia12.netlify.app';
    const childStatusLink = `${baseUrl}/#/parent/children/${childId}/status`;
    sendChildReviewReceivedEmail({
      parentEmail: req.user.email,
      parentFirstName: req.parentProfile?.full_name,
      childName: c.full_name,
      childStatusLink
    }).catch(() => {});
  }

  const mapped = await mapChildToFrontend(c, updatedEntry, pickup);
  res.json({
    success: true,
    childId: childId,
    status: 'under_review',
    ...mapped
  });
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

  const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, REAL_EVENT_ID]);
  const pickup = entry ? await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]) : null;

  res.json(await mapChildToFrontend(c, entry, pickup));
});

router.get('/children/:childId/pass', async (req: AuthenticatedRequest, res: Response) => {
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

  const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, REAL_EVENT_ID]);
  if (!entry || entry.status !== 'pass_ready') {
    return res.status(403).json({ error: 'Event pass is not ready yet', status: entry?.status || 'incomplete' });
  }

  let pass = await queryOne('SELECT * FROM event_passes WHERE child_event_entry_id = ?', [entry.id]);
  if (!pass) {
    const passId = crypto.randomUUID();
    const passRef = `KOI-2026-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const passHash = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();

    await execute(`
      INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `, [passId, entry.id, passRef, passHash, now, now, now]);

    pass = await queryOne('SELECT * FROM event_passes WHERE id = ?', [passId]);
  }

  const pickup = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]);
  const mappedChild = await mapChildToFrontend(c, entry, pickup);

  res.json({
    passReference: pass.pass_reference,
    status: pass.status,
    issuedAt: pass.issued_at,
    child: mappedChild
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

    const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, REAL_EVENT_ID]);
    const status = entry ? entry.status : 'incomplete';

    if (status === 'incomplete' || status === 'draft') {
      // Hard delete draft child and related entry/pickup details
      await transaction(async () => {
        if (entry) {
          await execute('DELETE FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]);
          await execute('DELETE FROM event_passes WHERE child_event_entry_id = ?', [entry.id]);
          await execute('DELETE FROM child_event_entries WHERE id = ?', [entry.id]);
        }
        await execute('DELETE FROM children WHERE id = ?', [childId]);
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DB Log] Successfully hard-deleted draft child ${childId}`);
      }

      return res.json({ success: true, message: 'Child removed.' });
    } else if (status === 'under_review') {
      // Soft-withdraw details
      await execute(`
        UPDATE child_event_entries
        SET status = 'withdrawn', withdrawn_at = ?, updated_at = ?
        WHERE child_id = ? AND event_id = ?
      `, [new Date().toISOString(), new Date().toISOString(), childId, REAL_EVENT_ID]);

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DB Log] Successfully withdrew child ${childId} from event entry`);
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
