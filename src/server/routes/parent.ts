import { Router, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne, execute, transaction } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { sendChildReviewReceivedEmail } from '../services/email';

const router = Router();
router.use(authMiddleware);

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

function resolvePhotoUrl(photoRef?: string | null): string {
  if (!photoRef) return '';
  if (photoRef.startsWith('http://') || photoRef.startsWith('https://') || photoRef.startsWith('/') || photoRef.startsWith('data:')) {
    return photoRef;
  }
  return `/api/media/files/${photoRef}`;
}

function mapProfileToFrontend(row: any) {
  if (!row) return null;
  return {
    fullName: row.full_name || '',
    email: row.email || '',
    phone: row.phone_number || '',
    whatsapp: row.whatsapp_number || row.phone_number || '',
    homeAddress: row.home_address || '',
    preferredContact: (row.preferred_contact as any) || 'WhatsApp',
    isWorker: Boolean(row.is_koinonia_worker),
    department: row.department || '',
    photoUrl: resolvePhotoUrl(row.photo_file_id)
  };
}

function mapChildToFrontend(childRow: any, entryRow: any, pickupRow: any) {
  const status = entryRow ? entryRow.status : 'incomplete';
  let frontendStatus: any = 'Incomplete';
  let statusNote = 'Continue entering child details';

  if (status === 'under_review') {
    frontendStatus = 'Under review';
    statusNote = 'Details sent for review';
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
  }

  const resolvedChildPhoto = resolvePhotoUrl(childRow.photo_file_id);
  const resolvedPickupPhoto = resolvePhotoUrl(pickupRow?.photo_file_id);

  const draftData = {
    id: childRow.id,
    childDetails: {
      photo: resolvedChildPhoto,
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
    list.push(mapChildToFrontend(c, entry, pickup));
  }
  return list;
}

router.get('/profile', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) {
    return res.status(404).json({ error: 'Parent profile not found' });
  }
  res.json(mapProfileToFrontend(req.parentProfile));
});

router.put('/profile', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) {
    return res.status(404).json({ error: 'Parent profile not found' });
  }

  const { fullName, phone, whatsapp, homeAddress, preferredContact, isWorker, department, photoUrl } = req.body;

  if (!fullName || !fullName.trim()) return res.status(400).json({ error: 'Full name is required' });
  if (!phone || !phone.trim()) return res.status(400).json({ error: 'Phone number is required' });
  if (!photoUrl || !photoUrl.trim()) return res.status(400).json({ error: 'Profile photo is required' });
  if (isWorker && (!department || !department.trim())) {
    return res.status(400).json({ error: 'Department is required for Koinonia workers' });
  }

  const now = new Date().toISOString();
  await execute(`
    UPDATE parent_profiles SET
      full_name = ?,
      phone_number = ?,
      whatsapp_number = ?,
      home_address = ?,
      preferred_contact = ?,
      is_koinonia_worker = ?,
      department = ?,
      photo_file_id = ?,
      profile_completed_at = COALESCE(profile_completed_at, ?),
      updated_at = ?
    WHERE id = ?
  `, [
    fullName.trim(),
    phone.trim(),
    whatsapp?.trim() || phone.trim(),
    homeAddress?.trim() || '',
    preferredContact || 'WhatsApp',
    isWorker ? 1 : 0,
    isWorker ? department.trim() : '',
    photoUrl.trim(),
    now,
    now,
    req.parentProfile.id
  ]);

  const updated = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [req.parentProfile.id]);
  req.parentProfile = updated;
  res.json(mapProfileToFrontend(updated));
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
    parentProfile: mapProfileToFrontend(req.parentProfile),
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

  const { calculatedAge, ageGroup, needsAgeReview } = calculateAgeAndGroup(dob);

  await transaction(async () => {
    const existingChild = await queryOne('SELECT id FROM children WHERE id = ? AND parent_profile_id = ?', [childId, req.parentProfile!.id]);
    if (existingChild) {
      await execute(`
        UPDATE children SET
          full_name = ?, gender = ?, date_of_birth = ?, calculated_age = ?,
          age_group = ?, relationship_to_child = ?, photo_file_id = ?, needs_age_review = ?, updated_at = ?
        WHERE id = ?
      `, [fullName, gender, dob, calculatedAge, ageGroup, relationship, photo, needsAgeReview ? 1 : 0, now, childId]);
    } else {
      await execute(`
        INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, photo_file_id, needs_age_review, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [childId, req.parentProfile!.id, fullName, gender, dob, calculatedAge, ageGroup, relationship, photo, needsAgeReview ? 1 : 0, now, now]);
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

    const existingPickup = await queryOne('SELECT id FROM pickup_people WHERE child_event_entry_id = ?', [actualEntryId]);
    if (existingPickup) {
      await execute(`
        UPDATE pickup_people SET
          pickup_type = ?, full_name = ?, relationship_to_child = ?, phone_number = ?, whatsapp_number = ?, photo_file_id = ?, approved_by_parent = ?, updated_at = ?
        WHERE id = ?
      `, [pickupType, pickupName, pickupRel, pickupPhone, pickupWa, pickupPhoto, pickupAppr, now, existingPickup.id]);
    } else {
      await execute(`
        INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, whatsapp_number, photo_file_id, approved_by_parent, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [crypto.randomUUID(), actualEntryId, pickupType, pickupName, pickupRel, pickupPhone, pickupWa, pickupPhoto, pickupAppr, now, now]);
    }
  });

  const c = await queryOne('SELECT * FROM children WHERE id = ?', [childId]);
  const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, REAL_EVENT_ID]);
  const pickup = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]);

  return mapChildToFrontend(c, entry, pickup);
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
  if (checkOwner && checkOwner.parent_profile_id !== req.parentProfile.id) {
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
  if (!entry) return res.status(400).json({ error: 'Child entry details incomplete' });

  const pickup = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]);
  if (!pickup) return res.status(400).json({ error: 'Pickup person details incomplete' });

  // Server-side validation rules
  if (!c.photo_file_id || !c.photo_file_id.trim()) return res.status(400).json({ error: 'Child photo is required' });
  if (!c.full_name || !c.full_name.trim()) return res.status(400).json({ error: 'Child full name is required' });
  if (!c.gender) return res.status(400).json({ error: 'Gender is required' });
  if (!c.date_of_birth) return res.status(400).json({ error: 'Date of birth is required' });
  if (!entry.school_class) return res.status(400).json({ error: 'School class is required' });
  if (!entry.information_confirmed) return res.status(400).json({ error: 'You must confirm the health and support information' });

  if (pickup.pickup_type === 'other_person') {
    if (!pickup.full_name || !pickup.full_name.trim()) return res.status(400).json({ error: 'Pickup person full name is required' });
    if (!pickup.photo_file_id || !pickup.photo_file_id.trim()) return res.status(400).json({ error: 'Pickup person photo is required' });
    if (!pickup.phone_number || !pickup.phone_number.trim()) return res.status(400).json({ error: 'Pickup person phone number is required' });
    if (!pickup.approved_by_parent) return res.status(400).json({ error: 'You must approve the pickup person authorization' });
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
    sendChildReviewReceivedEmail(req.user.email, c.full_name).catch(() => {});
  }
  res.json(mapChildToFrontend(c, updatedEntry, pickup));
});

router.get('/children/:childId/status', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  const { childId } = req.params;

  const checkOwner = await queryOne('SELECT parent_profile_id FROM children WHERE id = ?', [childId]);
  if (checkOwner && checkOwner.parent_profile_id !== req.parentProfile.id) {
    return res.status(403).json({ error: 'You do not have authorization to access this child profile' });
  }

  const c = await queryOne('SELECT * FROM children WHERE id = ? AND parent_profile_id = ?', [childId, req.parentProfile.id]);
  if (!c) return res.status(404).json({ error: 'Child not found' });

  const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, REAL_EVENT_ID]);
  const pickup = entry ? await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]) : null;

  res.json(mapChildToFrontend(c, entry, pickup));
});

router.get('/children/:childId/pass', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.parentProfile) return res.status(404).json({ error: 'Parent profile not found' });
  const { childId } = req.params;

  const checkOwner = await queryOne('SELECT parent_profile_id FROM children WHERE id = ?', [childId]);
  if (checkOwner && checkOwner.parent_profile_id !== req.parentProfile.id) {
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
  const mappedChild = mapChildToFrontend(c, entry, pickup);

  res.json({
    passReference: pass.pass_reference,
    status: pass.status,
    issuedAt: pass.issued_at,
    child: mappedChild
  });
});

export default router;
