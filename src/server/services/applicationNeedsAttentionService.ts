import { isValidUploadedPhoto } from '../utils/validation';
import { calculateAgeOnDate, CANONICAL_GA_EVENT_DATE } from './eligibilityService';

export interface NeedsAttentionResult {
  needsAttention: boolean;
  reasons: string[];
  blocking: boolean;
  summary: string;
  summaryMessage: string;
}

export const REASON_LABELS: Record<string, string> = {
  MISSING_PICKUP_PERSON: 'Missing pickup person',
  MISSING_PICKUP_PHOTO: 'Missing pickup photo',
  INVALID_PICKUP_PHOTO: 'Invalid pickup photo',
  MISSING_PARENT_PHOTO: 'Missing Parent photo',
  MISSING_CHILD_PHOTO: 'Missing child photo',
  MISSING_REQUIRED_FIELD: 'Missing required details',
  AGE_NOT_ELIGIBLE: 'Age eligibility issue',
  DOB_MISSING: 'Date of birth missing'
};

/**
 * Authoritative Needs Attention Evaluator for Koinonia registrations.
 * Evaluates whether an application (draft or submitted) has missing required information
 * that blocks approval / pass issuance, or requires parent recovery messaging.
 */
export function evaluateApplicationNeedsAttention(
  app: any,
  pickups: any[] = [],
  eventDate: string = CANONICAL_GA_EVENT_DATE
): NeedsAttentionResult {
  const reasons: string[] = [];

  // 1. DOB & AGE ELIGIBILITY
  const rawDob = app.date_of_birth || app.dob || app.child?.date_of_birth || app.child?.dob;
  if (!rawDob || !String(rawDob).trim()) {
    reasons.push('DOB_MISSING');
  } else {
    const age = calculateAgeOnDate(rawDob, eventDate);
    if (age === null || age < 2 || age > 14) {
      reasons.push('AGE_NOT_ELIGIBLE');
    }
  }

  // 2. CHILD PHOTO
  const childPhoto = app.child_photo_file_id || app.child?.photoFileId || app.photo_file_id || app.child_photo_url || app.child?.photoUrl;
  if (!isValidUploadedPhoto(childPhoto)) {
    reasons.push('MISSING_CHILD_PHOTO');
  }

  // 3. PARENT PHOTO
  const parentPhoto = app.parent_photo_file_id || app.parent?.photoFileId || app.parent_photo_url || app.parent?.photoUrl;
  if (!isValidUploadedPhoto(parentPhoto)) {
    reasons.push('MISSING_PARENT_PHOTO');
  }

  // 4. AUTHORISED PICKUP PERSON & PHOTO
  if (!pickups || pickups.length === 0) {
    reasons.push('MISSING_PICKUP_PERSON');
  } else {
    for (const pickup of pickups) {
      const isParentPickup = pickup.pickup_type === 'parent';
      const pickupPhoto = pickup.photo_file_id || pickup.photoUrl || (isParentPickup ? parentPhoto : null);

      if (!pickupPhoto || !String(pickupPhoto).trim()) {
        if (!reasons.includes('MISSING_PICKUP_PHOTO')) {
          reasons.push('MISSING_PICKUP_PHOTO');
        }
      } else if (!isValidUploadedPhoto(pickupPhoto)) {
        if (!reasons.includes('INVALID_PICKUP_PHOTO')) {
          reasons.push('INVALID_PICKUP_PHOTO');
        }
      }

      if (!isParentPickup) {
        const name = pickup.full_name || pickup.fullName;
        const rel = pickup.relationship_to_child || pickup.relationship;
        const phone = pickup.phone_number || pickup.phone;
        const approved = pickup.approved_by_parent !== undefined
          ? Boolean(pickup.approved_by_parent)
          : Boolean(pickup.approvedByParent);

        if (!name || !String(name).trim() || !rel || !String(rel).trim() || !phone || !String(phone).trim() || !approved) {
          if (!reasons.includes('MISSING_REQUIRED_FIELD')) {
            reasons.push('MISSING_REQUIRED_FIELD');
          }
        }
      }
    }
  }

  // 5. REQUIRED IDENTIFIERS & CLASS
  const childName = app.child_name || app.child?.fullName || app.full_name;
  if (!childName || !String(childName).trim()) {
    if (!reasons.includes('MISSING_REQUIRED_FIELD')) {
      reasons.push('MISSING_REQUIRED_FIELD');
    }
  }
  const childClass = app.school_class || app.schoolClass;
  if (!childClass || !String(childClass).trim()) {
    if (!reasons.includes('MISSING_REQUIRED_FIELD')) {
      reasons.push('MISSING_REQUIRED_FIELD');
    }
  }

  const blocking = reasons.length > 0;
  let summaryMessage = '';
  if (reasons.includes('MISSING_PICKUP_PERSON') || reasons.includes('MISSING_PICKUP_PHOTO') || reasons.includes('INVALID_PICKUP_PHOTO')) {
    summaryMessage = 'This application is missing required pickup information.';
  } else if (reasons.includes('MISSING_PARENT_PHOTO')) {
    summaryMessage = 'This application is missing a valid parent profile photo.';
  } else if (reasons.includes('MISSING_CHILD_PHOTO')) {
    summaryMessage = 'This application is missing a valid child photo.';
  } else if (reasons.includes('AGE_NOT_ELIGIBLE') || reasons.includes('DOB_MISSING')) {
    summaryMessage = 'This application has an age eligibility issue.';
  } else if (reasons.length > 0) {
    summaryMessage = 'This application is missing mandatory required details.';
  }

  return {
    needsAttention: reasons.length > 0,
    reasons,
    blocking,
    summary: summaryMessage,
    summaryMessage
  };
}
