import { resolveMx } from 'dns/promises';
import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';

export interface ValidationResult {
  valid: boolean;
  code?: string;
  field?: string;
  message?: string;
  suggestion?: string;
  normalizedEmail?: string;
  normalizedPhone?: string;
}

const BLOCKED_DOMAINS = [
  'example.com',
  'example.net',
  'example.org',
  'localhost',
  'invalid',
  'example.invalid',
  'example'
];

const COMMON_TYPOS: { [key: string]: string } = {
  'gmail.con': 'gmail.com',
  'gmail.cmo': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.hot': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'yahoo.con': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'outlook.con': 'outlook.com',
  'outlook.co': 'outlook.com',
  'hotmail.con': 'hotmail.com',
  'hotmail.co': 'hotmail.com'
};

/**
 * Backend Email Validator (including DNS/MX check)
 */
export async function validateEmailAddress(email: string, skipMxCheck = false): Promise<ValidationResult> {
  if (!email) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: 'email',
      message: 'Enter a valid email address.'
    };
  }

  const normalized = email.trim().toLowerCase();

  // Email must match a proper email pattern:
  // - no spaces
  if (/\s/.test(normalized)) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: 'email',
      message: 'Enter a valid email address.'
    };
  }

  // - one @ only
  const parts = normalized.split('@');
  if (parts.length !== 2) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: 'email',
      message: 'Enter a valid email address.'
    };
  }

  // - local part before @
  // - domain after @
  const [localPart, domain] = parts;
  if (!domain || !localPart) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: 'email',
      message: 'Enter a valid email address.'
    };
  }

  // - domain must contain at least one dot
  if (!domain.includes('.')) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: 'email',
      message: 'Enter a valid email address.'
    };
  }

  // Reject blocked test domains
  if (BLOCKED_DOMAINS.includes(domain) || domain.endsWith('.invalid')) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: 'email',
      message: 'Enter a valid email address.'
    };
  }

  // Domain labels must be valid:
  const domainParts = domain.split('.');
  
  // - at least 2 labels are required for a domain with a dot
  if (domainParts.length < 2) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: 'email',
      message: 'Enter a valid email address.'
    };
  }

  for (let i = 0; i < domainParts.length; i++) {
    const label = domainParts[i];
    
    // - no empty labels
    if (!label) {
      return {
        valid: false,
        code: 'INVALID_EMAIL_FORMAT',
        field: 'email',
        message: 'Enter a valid email address.'
      };
    }
    
    // - no label starts or ends with hyphen
    if (label.startsWith('-') || label.endsWith('-')) {
      return {
        valid: false,
        code: 'INVALID_EMAIL_FORMAT',
        field: 'email',
        message: 'Enter a valid email address.'
      };
    }
    
    // - labels contain only letters, numbers, and hyphen
    if (!/^[a-z0-9-]+$/i.test(label)) {
      return {
        valid: false,
        code: 'INVALID_EMAIL_FORMAT',
        field: 'email',
        message: 'Enter a valid email address.'
      };
    }
  }

  // TLD must be valid:
  const tld = domainParts[domainParts.length - 1];
  
  // - last domain section must contain letters only
  // - no numbers in TLD
  // - length between 2 and 24 characters
  if (!/^[a-z]{2,24}$/i.test(tld)) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: 'email',
      message: 'Enter a valid email address.'
    };
  }

  // Suspicious common domain typos check
  if (COMMON_TYPOS[domain]) {
    const suggestion = COMMON_TYPOS[domain];
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: 'email',
      message: `Please check the email address. Did you mean ${suggestion}?`,
      suggestion
    };
  }

  // Perform DNS MX lookup unless skipped
  if (!skipMxCheck) {
    try {
      const mxRecords = await resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return {
          valid: false,
          code: 'EMAIL_DOMAIN_CANNOT_RECEIVE_MAIL',
          field: 'email',
          message: 'This email address does not appear to receive email.'
        };
      }
    } catch (err: any) {
      console.error(`MX lookup failed for ${domain}:`, err.message || err);
      return {
        valid: false,
        code: 'EMAIL_DOMAIN_CANNOT_RECEIVE_MAIL',
        field: 'email',
        message: 'This email address does not appear to receive email.'
      };
    }
  }

  return {
    valid: true,
    normalizedEmail: normalized
  };
}

/**
 * Backend Phone Number Validator using libphonenumber-js
 */
export function validatePhoneNumber(phone: string, defaultCountry: string = 'NG'): ValidationResult {
  if (!phone) {
    return {
      valid: false,
      code: 'INVALID_PHONE_FORMAT',
      field: 'phone',
      message: 'Enter a valid phone number.'
    };
  }

  const trimmed = phone.trim();

  // Accept only + digits spaces
  const allowedCharsRegex = /^[+\d\s]+$/;
  if (!allowedCharsRegex.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_PHONE_FORMAT',
      field: 'phone',
      message: 'Phone number can only contain digits, spaces, and +.'
    };
  }

  try {
    const parsed = parsePhoneNumberFromString(trimmed, defaultCountry as CountryCode);
    if (!parsed || !parsed.isValid()) {
      return {
        valid: false,
        code: 'INVALID_PHONE_FORMAT',
        field: 'phone',
        message: 'Enter a valid phone number.'
      };
    }

    return {
      valid: true,
      normalizedPhone: parsed.format('E.164')
    };
  } catch (err) {
    return {
      valid: false,
      code: 'INVALID_PHONE_FORMAT',
      field: 'phone',
      message: 'Enter a valid phone number.'
    };
  }
}

/**
 * Validate full name
 */
export function validateName(name: string, fieldName: string = 'fullName'): ValidationResult {
  const trimmed = name ? name.trim() : '';
  if (!trimmed) {
    return {
      valid: false,
      code: 'NAME_REQUIRED',
      field: fieldName,
      message: 'Enter your full name.'
    };
  }

  if (trimmed.length < 3 || trimmed.length > 100) {
    return {
      valid: false,
      code: 'INVALID_NAME_LENGTH',
      field: fieldName,
      message: 'Enter your full name.'
    };
  }

  // Letters, spaces, apostrophes, hyphens only
  const nameRegex = /^[a-zA-Z'\-\s]+$/;
  if (!nameRegex.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_NAME_CHARACTERS',
      field: fieldName,
      message: 'Enter your full name.'
    };
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return {
      valid: false,
      code: 'INVALID_NAME_WORDS',
      field: fieldName,
      message: 'Enter your full name.'
    };
  }

  return { valid: true };
}

/**
 * Validate Parent Profile fields server-side
 */
export function validateParentProfile(data: any): { valid: boolean; errors: { [key: string]: ValidationResult } } {
  const errors: { [key: string]: ValidationResult } = {};

  // Full Name
  const nameRes = validateName(data.fullName || data.full_name, 'fullName');
  if (!nameRes.valid) {
    errors.fullName = nameRes;
  }

  // Phone
  const phoneVal = data.phone || data.phone_number;
  const phoneRes = validatePhoneNumber(phoneVal || '', data.countryCode || 'NG');
  if (!phoneRes.valid) {
    errors.phone = { ...phoneRes, field: 'phone' };
  }

  // WhatsApp (optional but if provided must be valid)
  const whatsappVal = data.whatsapp || data.whatsapp_number;
  if (whatsappVal) {
    const whatsappRes = validatePhoneNumber(whatsappVal, data.countryCode || 'NG');
    if (!whatsappRes.valid) {
      errors.whatsapp = { ...whatsappRes, field: 'whatsapp', message: 'Enter a valid WhatsApp number.' };
    }
  }

  // Country
  if (!data.country || !data.country.trim()) {
    errors.country = {
      valid: false,
      code: 'COUNTRY_REQUIRED',
      field: 'country',
      message: 'Select your country.'
    };
  }

  // State / Region
  const stateVal = data.stateRegion || data.state_region;
  if (!stateVal || !stateVal.trim()) {
    errors.stateRegion = {
      valid: false,
      code: 'STATE_REQUIRED',
      field: 'stateRegion',
      message: 'State / Region is required.'
    };
  }

  // City (free text, no numbers-only, max 80 chars)
  const cityVal = (data.city || '').trim();
  if (!cityVal) {
    errors.city = {
      valid: false,
      code: 'CITY_REQUIRED',
      field: 'city',
      message: 'City is required.'
    };
  } else if (/^\d+$/.test(cityVal)) {
    errors.city = {
      valid: false,
      code: 'INVALID_CITY',
      field: 'city',
      message: 'Enter a valid city name.'
    };
  } else if (cityVal.length > 80) {
    errors.city = {
      valid: false,
      code: 'CITY_TOO_LONG',
      field: 'city',
      message: 'City name cannot exceed 80 characters.'
    };
  }

  // Home Address (min 5, max 250)
  const addressVal = (data.homeAddress || data.home_address || '').trim();
  if (!addressVal) {
    errors.homeAddress = {
      valid: false,
      code: 'ADDRESS_REQUIRED',
      field: 'homeAddress',
      message: 'Home address is required.'
    };
  } else if (addressVal.length < 5) {
    errors.homeAddress = {
      valid: false,
      code: 'ADDRESS_TOO_SHORT',
      field: 'homeAddress',
      message: 'Enter a valid home address.'
    };
  } else if (addressVal.length > 250) {
    errors.homeAddress = {
      valid: false,
      code: 'ADDRESS_TOO_LONG',
      field: 'homeAddress',
      message: 'Address cannot exceed 250 characters.'
    };
  }

  // Photo check
  const photoVal = data.photoUrl || data.photo_file_id || data.photoFileId;
  if (!photoVal || !photoVal.trim()) {
    errors.photo = {
      valid: false,
      code: 'PHOTO_REQUIRED',
      field: 'photo',
      message: 'Photo is required.'
    };
  }

  // Worker department check
  const isWorker = data.isWorker === true || data.is_koinonia_worker === 1 || data.is_koinonia_worker === '1';
  if (isWorker) {
    const deptVal = (data.department || '').trim();
    if (!deptVal) {
      errors.department = {
        valid: false,
        code: 'DEPARTMENT_REQUIRED',
        field: 'department',
        message: 'Department is required.'
      };
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Validate pickup person details
 */
export function validatePickupPerson(pickup: any, defaultCountry = 'NG'): { valid: boolean; errors: { [key: string]: ValidationResult } } {
  const errors: { [key: string]: ValidationResult } = {};

  const pickupType = pickup?.pickupType || 'parent';
  if (pickupType === 'other_person') {
    const nameRes = validateName(pickup?.pickupPersonFullName, 'pickupPersonFullName');
    if (!nameRes.valid) {
      errors.pickupPersonFullName = nameRes;
    }

    if (!pickup?.pickupPersonRelationship || !pickup?.pickupPersonRelationship.trim()) {
      errors.pickupPersonRelationship = {
        valid: false,
        code: 'RELATIONSHIP_REQUIRED',
        field: 'pickupPersonRelationship',
        message: 'Relationship is required.'
      };
    }

    const phoneRes = validatePhoneNumber(pickup?.pickupPersonPhone || '', defaultCountry);
    if (!phoneRes.valid) {
      errors.pickupPersonPhone = { ...phoneRes, field: 'pickupPersonPhone' };
    }

    const photoVal = pickup?.pickupPersonPhoto || pickup?.pickupPersonPhotoFileId;
    if (!photoVal || !photoVal.trim()) {
      errors.pickupPersonPhoto = {
        valid: false,
        code: 'PICKUP_PHOTO_REQUIRED',
        field: 'pickupPersonPhoto',
        message: 'Photo is required.'
      };
    }

    if (!pickup?.approvedByParent && !pickup?.approved_by_parent) {
      errors.approvedByParent = {
        valid: false,
        code: 'APPROVAL_REQUIRED',
        field: 'approvedByParent',
        message: 'Approval is required.'
      };
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Validate entire child submission before review (Part 7)
 */
export function validateChildDraftStep(draft: any, parentProfile: any): { valid: boolean; errors: { [key: string]: ValidationResult } } {
  const errors: { [key: string]: ValidationResult } = {};

  // STEP 1: Child details
  const nameVal = draft.childDetails?.fullName || draft.fullName;
  const nameRes = validateName(nameVal || '', 'childFullName');
  if (!nameRes.valid) {
    errors.childFullName = { ...nameRes, message: 'Enter child\'s full name.' };
  }

  const genderVal = draft.childDetails?.gender || draft.gender;
  if (!genderVal || !['Male', 'Female'].includes(genderVal)) {
    errors.childGender = {
      valid: false,
      code: 'GENDER_REQUIRED',
      field: 'childGender',
      message: 'Gender is required.'
    };
  }

  const dobVal = draft.childDetails?.dateOfBirth || draft.dob || draft.dateOfBirth;
  if (!dobVal) {
    errors.childDob = {
      valid: false,
      code: 'DOB_REQUIRED',
      field: 'childDob',
      message: 'Date of birth is required.'
    };
  } else {
    const dobDate = new Date(dobVal);
    const now = new Date();
    if (dobDate > now) {
      errors.childDob = {
        valid: false,
        code: 'DOB_FUTURE',
        field: 'childDob',
        message: 'Date of birth cannot be in the future.'
      };
    }
  }

  const relationshipVal = draft.childDetails?.relationshipToChild || draft.relationship;
  if (!relationshipVal || !relationshipVal.trim()) {
    errors.childRelationship = {
      valid: false,
      code: 'RELATIONSHIP_REQUIRED',
      field: 'childRelationship',
      message: 'Relationship to child is required.'
    };
  }

  const childPhotoVal = draft.childDetails?.photo || draft.photoUrl || draft.photoFileId;
  if (!childPhotoVal || !childPhotoVal.trim()) {
    errors.childPhoto = {
      valid: false,
      code: 'CHILD_PHOTO_REQUIRED',
      field: 'childPhoto',
      message: 'Child photo is required.'
    };
  }

  // STEP 2: School and Care
  const schoolClassVal = draft.schoolAndAgeGroup?.schoolClass || draft.schoolClass;
  if (!schoolClassVal || !schoolClassVal.trim()) {
    errors.schoolClass = {
      valid: false,
      code: 'SCHOOL_CLASS_REQUIRED',
      field: 'schoolClass',
      message: 'School class is required.'
    };
  }

  const attendedBeforeVal = draft.schoolAndAgeGroup?.previousChildrenProgramme || draft.attendedBefore;
  if (!attendedBeforeVal || !['Yes', 'No'].includes(attendedBeforeVal)) {
    errors.previousAttendance = {
      valid: false,
      code: 'ATTENDANCE_REQUIRED',
      field: 'previousAttendance',
      message: 'Previous attendance response is required.'
    };
  }

  // STEP 3: Health and Support
  const hasMedicalVal = draft.healthAndSupport?.hasMedicalNotes || draft.hasAllergies;
  if (!hasMedicalVal || !['Yes', 'No'].includes(hasMedicalVal)) {
    errors.hasMedicalNotes = {
      valid: false,
      code: 'MEDICAL_RESPONSE_REQUIRED',
      field: 'hasMedicalNotes',
      message: 'Allergy/medical response is required.'
    };
  } else if (hasMedicalVal === 'Yes') {
    const medNotesVal = draft.healthAndSupport?.medicalNotes || draft.medicalNote;
    if (!medNotesVal || !medNotesVal.trim()) {
      errors.medicalNotes = {
        valid: false,
        code: 'MEDICAL_NOTES_REQUIRED',
        field: 'medicalNotes',
        message: 'Please specify the medical details.'
      };
    }
  }

  const needsSupportVal = draft.healthAndSupport?.needsExtraSupport || draft.needsExtraSupport;
  if (!needsSupportVal || !['Yes', 'No'].includes(needsSupportVal)) {
    errors.needsExtraSupport = {
      valid: false,
      code: 'SUPPORT_RESPONSE_REQUIRED',
      field: 'needsExtraSupport',
      message: 'Extra support response is required.'
    };
  } else if (needsSupportVal === 'Yes') {
    const supportNotesVal = draft.healthAndSupport?.supportNotes || draft.supportNote;
    if (!supportNotesVal || !supportNotesVal.trim()) {
      errors.supportNotes = {
        valid: false,
        code: 'SUPPORT_NOTES_REQUIRED',
        field: 'supportNotes',
        message: 'Please specify the support details.'
      };
    }
  }

  const infoConfirmed = draft.healthAndSupport?.informationConfirmed || draft.infoConfirmed;
  if (!infoConfirmed) {
    errors.informationConfirmed = {
      valid: false,
      code: 'CONFIRMATION_REQUIRED',
      field: 'informationConfirmed',
      message: 'Confirmation is required.'
    };
  }

  // STEP 4: Pickup Details
  const pickup = draft.pickup;
  const pickupType = pickup?.pickupType || draft.pickupType || 'parent';
  if (pickupType === 'parent') {
    // If parent pickup, parent profile must have name, phone, photo
    if (!parentProfile?.full_name || !parentProfile?.full_name.trim() ||
        !parentProfile?.phone_number || !parentProfile?.phone_number.trim() ||
        !parentProfile?.photo_file_id || !parentProfile?.photo_file_id.trim()) {
      errors.pickup = {
        valid: false,
        code: 'PARENT_PROFILE_INCOMPLETE',
        field: 'pickup',
        message: 'Your parent profile must be complete with name, phone, and photo for parent pickup.'
      };
    }
  } else if (pickupType === 'other_person') {
    const pickupRes = validatePickupPerson(pickup, parentProfile?.country === 'Nigeria' ? 'NG' : 'NG');
    if (!pickupRes.valid) {
      Object.assign(errors, pickupRes.errors);
    }
  } else {
    errors.pickupType = {
      valid: false,
      code: 'PICKUP_OPTION_REQUIRED',
      field: 'pickupType',
      message: 'Pickup option is required.'
    };
  }

  // STEP 5: Final review details confirmed
  const detailsConfirmed = draft.review?.detailsConfirmed || draft.detailsConfirmed;
  if (!detailsConfirmed) {
    errors.detailsConfirmed = {
      valid: false,
      code: 'DETAILS_CONFIRMATION_REQUIRED',
      field: 'detailsConfirmed',
      message: 'Please confirm that all details are correct before sending.'
    };
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}
