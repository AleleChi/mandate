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

export const sanitizeTextInput = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '') // Strip script tags completely
    .replace(/<\/?[^>]+(>|$)/g, '')                    // Strip all other HTML tags
    .trim();
};

export const normalizeEmail = (email: string): string => {
  return (email || '').trim().toLowerCase();
};

export const normalizePhone = (phone: string, country = 'NG'): string => {
  const cleaned = (phone || '').replace(/[^\d+]/g, '');
  try {
    const parsed = parsePhoneNumberFromString(cleaned, country as CountryCode);
    if (parsed && parsed.isValid()) {
      return parsed.format('E.164');
    }
  } catch (e) {}
  return cleaned.startsWith('+') ? cleaned : cleaned ? `+234${cleaned.replace(/^0+/, '')}` : '';
};

/**
 * Strict Full Name Validator (Parent & Pickup)
 */
export function validateFullName(name: string, isParentOrPickup = true, fieldName = 'fullName'): ValidationResult {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      code: 'NAME_REQUIRED',
      field: fieldName,
      message: 'Enter a valid full name.'
    };
  }

  if (trimmed.length < 3 || trimmed.length > 100) {
    return {
      valid: false,
      code: 'INVALID_NAME_LENGTH',
      field: fieldName,
      message: 'Enter a valid full name.'
    };
  }

  // Reject digits
  if (/\d/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_NAME_DIGITS',
      field: fieldName,
      message: 'Enter a valid full name.'
    };
  }

  // Allowed characters: letters, spaces, apostrophe, hyphen, period
  if (!/^[a-zA-ZÀ-ÿ\s.\-']+$/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_NAME_CHARACTERS',
      field: fieldName,
      message: 'Enter a valid full name.'
    };
  }

  // Reject quotes, backticks
  if (trimmed.includes('"') || trimmed.includes('`')) {
    return {
      valid: false,
      code: 'INVALID_NAME_QUOTES',
      field: fieldName,
      message: 'Enter a valid full name.'
    };
  }

  // Reject consecutive punctuation
  if (/[\.\-']{2,}/.test(trimmed) || /[\.\-']\s*[\.\-']/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_NAME_RUNS',
      field: fieldName,
      message: 'Enter a valid full name.'
    };
  }

  // Must contain letters
  if (!/[a-zA-Z]/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_NAME_NO_LETTERS',
      field: fieldName,
      message: 'Enter a valid full name.'
    };
  }

  // Reject SQL injection / script tags
  if (/\b(drop|select|insert|delete|update|union|script|table)\b/i.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_NAME_SQL',
      field: fieldName,
      message: 'Enter a valid full name.'
    };
  }

  // Reject mostly punctuation (letters < 50% of non-whitespace)
  const lettersCount = trimmed.replace(/[^a-zA-ZÀ-ÿ]/g, '').length;
  const totalNonSpace = trimmed.replace(/\s/g, '').length;
  if (totalNonSpace > 0 && (lettersCount / totalNonSpace) < 0.5) {
    return {
      valid: false,
      code: 'INVALID_NAME_MOSTLY_PUNCTUATION',
      field: fieldName,
      message: 'Enter a valid full name.'
    };
  }

  // Check multiple words for parent/pickup
  if (isParentOrPickup) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      return {
        valid: false,
        code: 'INVALID_NAME_WORDS',
        field: fieldName,
        message: 'Enter a valid full name.'
      };
    }
  }

  return { valid: true };
}

// Preserve validateName signature for backend routing
export function validateName(name: string, fieldName = 'fullName'): ValidationResult {
  const res = validateFullName(name, true, fieldName);
  if (!res.valid) {
    // Return original standard error message to preserve compatibility but keep strict rules
    return { ...res, message: 'Enter your full name.' };
  }
  return res;
}

/**
 * Strict Child Name Validator
 */
export function validateChildName(name: string, fieldName = 'childFullName'): ValidationResult {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      code: 'CHILD_NAME_REQUIRED',
      field: fieldName,
      message: 'Enter the child’s full name.'
    };
  }

  if (trimmed.length < 2 || trimmed.length > 100) {
    return {
      valid: false,
      code: 'INVALID_CHILD_NAME_LENGTH',
      field: fieldName,
      message: 'Enter the child’s full name.'
    };
  }

  // Reject digits
  if (/\d/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_CHILD_NAME_DIGITS',
      field: fieldName,
      message: 'Enter the child’s full name.'
    };
  }

  // Allowed: letters, spaces, apostrophe, hyphen
  if (!/^[a-zA-ZÀ-ÿ\s\-']+$/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_CHILD_NAME_CHARACTERS',
      field: fieldName,
      message: 'Enter the child’s full name.'
    };
  }

  // Reject long symbol runs
  if (/[\-']{2,}/.test(trimmed) || /[\-']\s*[\-']/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_CHILD_NAME_RUNS',
      field: fieldName,
      message: 'Enter the child’s full name.'
    };
  }

  // Must contain letters
  if (!/[a-zA-Z]/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_CHILD_NAME_NO_LETTERS',
      field: fieldName,
      message: 'Enter the child’s full name.'
    };
  }

  // Reject SQL injection / script tags
  if (/\b(drop|select|insert|delete|update|union|script|table)\b/i.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_CHILD_NAME_SQL',
      field: fieldName,
      message: 'Enter the child’s full name.'
    };
  }

  // Mostly punctuation
  const lettersCount = trimmed.replace(/[^a-zA-ZÀ-ÿ]/g, '').length;
  const totalNonSpace = trimmed.replace(/\s/g, '').length;
  if (totalNonSpace > 0 && (lettersCount / totalNonSpace) < 0.5) {
    return {
      valid: false,
      code: 'INVALID_CHILD_NAME_PUNCTUATION',
      field: fieldName,
      message: 'Enter the child’s full name.'
    };
  }

  return { valid: true };
}

/**
 * Strict Email Validator Syntax Check
 */
export function validateEmailSyntax(email: string, fieldName = 'email'): ValidationResult {
  const normalized = (email || '').trim().toLowerCase();
  
  if (!normalized) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: fieldName,
      message: 'Enter a valid email address.'
    };
  }

  // Reject quotes, apostrophes, backticks
  if (normalized.includes("'") || normalized.includes('"') || normalized.includes('`')) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: fieldName,
      message: 'Enter a valid email address.'
    };
  }

  // Email must match a proper email pattern:
  // - no spaces
  if (/\s/.test(normalized)) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: fieldName,
      message: 'Enter a valid email address.'
    };
  }

  // - one @ only
  const parts = normalized.split('@');
  if (parts.length !== 2) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: fieldName,
      message: 'Enter a valid email address.'
    };
  }

  // - local part before @
  // - domain after @
  const [local, domain] = parts;
  if (!local || !domain) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: fieldName,
      message: 'Enter a valid email address.'
    };
  }

  // - domain must contain at least one dot
  if (!domain.includes('.')) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: fieldName,
      message: 'Enter a valid email address.'
    };
  }

  // Reject blocked test domains
  if (BLOCKED_DOMAINS.includes(domain) || domain.endsWith('.invalid')) {
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: fieldName,
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
      field: fieldName,
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
        field: fieldName,
        message: 'Enter a valid email address.'
      };
    }
    
    // - no label starts or ends with hyphen
    if (label.startsWith('-') || label.endsWith('-')) {
      return {
        valid: false,
        code: 'INVALID_EMAIL_FORMAT',
        field: fieldName,
        message: 'Enter a valid email address.'
      };
    }
    
    // - labels contain only letters, numbers, and hyphen
    if (!/^[a-z0-9-]+$/i.test(label)) {
      return {
        valid: false,
        code: 'INVALID_EMAIL_FORMAT',
        field: fieldName,
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
      field: fieldName,
      message: 'Enter a valid email address.'
    };
  }

  if (COMMON_TYPOS[domain]) {
    const suggestion = COMMON_TYPOS[domain];
    return {
      valid: false,
      code: 'INVALID_EMAIL_FORMAT',
      field: fieldName,
      message: `Please check the email address. Did you mean ${suggestion}?`,
      suggestion
    };
  }

  return { valid: true };
}

/**
 * Backend Email Validator (including DNS/MX check)
 */
export async function validateEmailAddress(email: string, skipMxCheck = false, fieldName = 'email'): Promise<ValidationResult> {
  const syntaxRes = validateEmailSyntax(email, fieldName);
  if (!syntaxRes.valid) {
    return syntaxRes;
  }

  const normalized = email.trim().toLowerCase();
  const domain = normalized.split('@')[1];

  // Perform DNS MX lookup unless skipped
  if (!skipMxCheck) {
    try {
      const mxRecords = await resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return {
          valid: false,
          code: 'EMAIL_DOMAIN_CANNOT_RECEIVE_MAIL',
          field: fieldName,
          message: 'This email address does not appear to receive email.'
        };
      }
    } catch (err: any) {
      console.error(`MX lookup failed for ${domain}:`, err.message || err);
      return {
        valid: false,
        code: 'EMAIL_DOMAIN_CANNOT_RECEIVE_MAIL',
        field: fieldName,
        message: 'This email address does not appear to receive email.'
      };
    }
  }

  return {
    valid: true,
    normalizedEmail: normalized
  };
}

export async function validateEmailDeliverability(email: string): Promise<boolean> {
  const res = await validateEmailAddress(email, false);
  return res.valid;
}

/**
 * Backend Phone Number Validator using libphonenumber-js
 */
export function validatePhoneNumber(phone: string, defaultCountry = 'NG', fieldName = 'phone'): ValidationResult {
  if (!phone) {
    return {
      valid: false,
      code: 'INVALID_PHONE_FORMAT',
      field: fieldName,
      message: 'Enter your phone number.'
    };
  }

  const trimmed = phone.trim();

  // Accept only + digits spaces
  const allowedCharsRegex = /^[+\d\s]+$/;
  if (!allowedCharsRegex.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_PHONE_FORMAT',
      field: fieldName,
      message: 'Phone number can only contain digits, spaces, and +.'
    };
  }

  try {
    const parsed = parsePhoneNumberFromString(trimmed, defaultCountry as CountryCode);
    if (!parsed || !parsed.isValid()) {
      return {
        valid: false,
        code: 'INVALID_PHONE_FORMAT',
        field: fieldName,
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
      field: fieldName,
      message: 'Enter a valid phone number.'
    };
  }
}

/**
 * Country Validator
 */
export function validateCountry(country: string, fieldName = 'country'): ValidationResult {
  if (!country || !country.trim()) {
    return {
      valid: false,
      code: 'COUNTRY_REQUIRED',
      field: fieldName,
      message: 'Select your country.'
    };
  }
  return { valid: true };
}

/**
 * City Validator
 */
export function validateCity(city: string, fieldName = 'city'): ValidationResult {
  const trimmed = (city || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      code: 'CITY_REQUIRED',
      field: fieldName,
      message: 'City is required.'
    };
  }
  if (/^\d+$/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_CITY',
      field: fieldName,
      message: 'Enter a valid city name.'
    };
  }
  if (trimmed.length < 2 || trimmed.length > 80) {
    return {
      valid: false,
      code: 'CITY_LENGTH_INVALID',
      field: fieldName,
      message: 'City name must be between 2 and 80 characters.'
    };
  }
  if (!/[a-zA-Z]/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_CITY',
      field: fieldName,
      message: 'Enter a valid city name.'
    };
  }
  return { valid: true };
}

/**
 * State / Region Validator
 */
export function validateStateRegion(state: string, country = 'Nigeria', fieldName = 'stateRegion'): ValidationResult {
  const trimmed = (state || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      code: 'STATE_REQUIRED',
      field: fieldName,
      message: 'State / Region is required.'
    };
  }
  if (country === 'Nigeria') {
    const validNigerianStates = [
      'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River',
      'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Federal Capital Territory', 'Gombe', 'Imo', 'Jigawa',
      'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
      'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'
    ];
    const isMatched = validNigerianStates.some(s => s.toLowerCase() === trimmed.toLowerCase());
    if (!isMatched) {
      if (!/^[a-zA-Z\s.\-']+$/.test(trimmed) || !/[a-zA-Z]/.test(trimmed)) {
        return {
          valid: false,
          code: 'INVALID_STATE',
          field: fieldName,
          message: 'Enter a valid Nigerian state.'
        };
      }
    }
  } else {
    if (!/^[a-zA-Z0-9\s.\-']+$/.test(trimmed) || !/[a-zA-Z]/.test(trimmed)) {
      return {
        valid: false,
        code: 'INVALID_STATE',
        field: fieldName,
        message: 'Enter a valid state / region.'
      };
    }
  }
  return { valid: true };
}

/**
 * Address Validator
 */
export function validateAddress(address: string, fieldName = 'homeAddress'): ValidationResult {
  const trimmed = (address || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      code: 'ADDRESS_REQUIRED',
      field: fieldName,
      message: 'Home address is required.'
    };
  }
  if (trimmed.length < 5) {
    return {
      valid: false,
      code: 'ADDRESS_TOO_SHORT',
      field: fieldName,
      message: 'Enter a valid home address.'
    };
  }
  if (trimmed.length > 250) {
    return {
      valid: false,
      code: 'ADDRESS_TOO_LONG',
      field: fieldName,
      message: 'Address cannot exceed 250 characters.'
    };
  }
  if (/\b(drop|select|insert|delete|update|union|script|table)\b/i.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_ADDRESS_SQL',
      field: fieldName,
      message: 'Invalid characters in home address.'
    };
  }
  if (!/[a-zA-Z]/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_ADDRESS',
      field: fieldName,
      message: 'Enter a valid home address.'
    };
  }
  return { valid: true };
}

/**
 * Relationship Validator
 */
export function validateRelationship(relationship: string, fieldName = 'relationship'): ValidationResult {
  const trimmed = (relationship || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      code: 'RELATIONSHIP_REQUIRED',
      field: fieldName,
      message: 'Relationship is required.'
    };
  }
  if (trimmed.length < 2 || trimmed.length > 50) {
    return {
      valid: false,
      code: 'INVALID_RELATIONSHIP_LENGTH',
      field: fieldName,
      message: 'Enter a valid relationship.'
    };
  }
  if (!/^[a-zA-Z\s\-']+$/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_RELATIONSHIP_CHARS',
      field: fieldName,
      message: 'Relationship can only contain letters.'
    };
  }
  return { valid: true };
}

/**
 * School Name Validator
 */
export function validateSchoolName(schoolName: string, fieldName = 'schoolName'): ValidationResult {
  const trimmed = (schoolName || '').trim();
  if (!trimmed) return { valid: true }; // Optional
  if (trimmed.length < 2 || trimmed.length > 100) {
    return {
      valid: false,
      code: 'INVALID_SCHOOL_NAME_LENGTH',
      field: fieldName,
      message: 'School name must be between 2 and 100 characters.'
    };
  }
  if (!/[a-zA-Z]/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_SCHOOL_NAME_NO_LETTERS',
      field: fieldName,
      message: 'School name must contain letters.'
    };
  }
  if (/\b(drop|select|insert|delete|update|union|script|table)\b/i.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_SCHOOL_NAME_SQL',
      field: fieldName,
      message: 'Invalid characters in school name.'
    };
  }
  return { valid: true };
}

/**
 * Notes Validator
 */
export function validateNotes(notes: string, fieldName = 'notes'): ValidationResult {
  const trimmed = (notes || '').trim();
  if (!trimmed) return { valid: true }; // Optional
  if (trimmed.length > 1000) {
    return {
      valid: false,
      code: 'NOTES_TOO_LONG',
      field: fieldName,
      message: 'Notes cannot exceed 1000 characters.'
    };
  }
  if (/<script[^>]*>/i.test(trimmed) || /\b(drop|select|insert|delete|update|union|table)\b/i.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_NOTES_SQL',
      field: fieldName,
      message: 'Invalid content detected in notes.'
    };
  }
  return { valid: true };
}

/**
 * Date Of Birth Validator
 */
export function validateDateOfBirth(dob: string, fieldName = 'dateOfBirth'): ValidationResult {
  if (!dob) {
    return {
      valid: false,
      code: 'DOB_REQUIRED',
      field: fieldName,
      message: 'Date of birth is required.'
    };
  }
  const dobDate = new Date(dob);
  const now = new Date();
  if (dobDate > now) {
    return {
      valid: false,
      code: 'DOB_FUTURE',
      field: fieldName,
      message: 'Date of birth cannot be in the future.'
    };
  }
  // Max age: 18
  const ageInMs = now.getTime() - dobDate.getTime();
  const ageInYears = ageInMs / (1000 * 60 * 60 * 24 * 365.25);
  if (ageInYears > 18) {
    return {
      valid: false,
      code: 'CHILD_TOO_OLD',
      field: fieldName,
      message: 'Child must be under 18 years old.'
    };
  }
  return { valid: true };
}

/**
 * Image File Validator
 */
export function validateImageFile(file: { type: string; size: number }, fieldName = 'image'): ValidationResult {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedMimeTypes.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      code: 'INVALID_IMAGE_TYPE',
      field: fieldName,
      message: 'Please upload a JPG, PNG, or WebP image.'
    };
  }
  // Max size: 10MB
  if (file.size > 10 * 1024 * 1024) {
    return {
      valid: false,
      code: 'IMAGE_TOO_LARGE',
      field: fieldName,
      message: 'This image is too large. Please choose a smaller photo.'
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
  const nameRes = validateFullName(data.fullName || data.full_name, true, 'fullName');
  if (!nameRes.valid) {
    errors.fullName = nameRes;
  }

  // Phone
  const phoneVal = data.phone || data.phone_number;
  const phoneRes = validatePhoneNumber(phoneVal || '', data.countryCode || 'NG', 'phone');
  if (!phoneRes.valid) {
    errors.phone = phoneRes;
  }

  // WhatsApp (optional but if provided must be valid)
  const whatsappVal = data.whatsapp || data.whatsapp_number;
  if (whatsappVal) {
    const whatsappRes = validatePhoneNumber(whatsappVal, data.countryCode || 'NG', 'whatsapp');
    if (!whatsappRes.valid) {
      errors.whatsapp = { ...whatsappRes, message: 'Enter a valid WhatsApp number.' };
    }
  }

  // Country
  const countryRes = validateCountry(data.country, 'country');
  if (!countryRes.valid) {
    errors.country = countryRes;
  }

  // State / Region
  const stateVal = data.stateRegion || data.state_region;
  const stateRes = validateStateRegion(stateVal, data.country || 'Nigeria', 'stateRegion');
  if (!stateRes.valid) {
    errors.stateRegion = stateRes;
  }

  // City
  const cityRes = validateCity(data.city, 'city');
  if (!cityRes.valid) {
    errors.city = cityRes;
  }

  // Home Address
  const addressVal = data.homeAddress || data.home_address;
  const addressRes = validateAddress(addressVal, 'homeAddress');
  if (!addressRes.valid) {
    errors.homeAddress = addressRes;
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
    const nameRes = validateFullName(pickup?.pickupPersonFullName, true, 'pickupPersonFullName');
    if (!nameRes.valid) {
      errors.pickupPersonFullName = nameRes;
    }

    const relationshipRes = validateRelationship(pickup?.pickupPersonRelationship, 'pickupPersonRelationship');
    if (!relationshipRes.valid) {
      errors.pickupPersonRelationship = relationshipRes;
    }

    const phoneRes = validatePhoneNumber(pickup?.pickupPersonPhone || '', defaultCountry, 'pickupPersonPhone');
    if (!phoneRes.valid) {
      errors.pickupPersonPhone = phoneRes;
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
 * Validate entire child submission before review
 */
export function validateChildDraftStep(draft: any, parentProfile: any): { valid: boolean; errors: { [key: string]: ValidationResult } } {
  const errors: { [key: string]: ValidationResult } = {};

  // STEP 1: Child details
  const nameVal = draft.childDetails?.fullName || draft.fullName;
  const nameRes = validateChildName(nameVal || '', 'childFullName');
  if (!nameRes.valid) {
    errors.childFullName = nameRes;
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
  const dobRes = validateDateOfBirth(dobVal, 'childDob');
  if (!dobRes.valid) {
    errors.childDob = dobRes;
  }

  const relationshipVal = draft.childDetails?.relationshipToChild || draft.relationship;
  const relationshipRes = validateRelationship(relationshipVal, 'childRelationship');
  if (!relationshipRes.valid) {
    errors.childRelationship = { ...relationshipRes, message: 'Relationship to child is required.' };
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

  const schoolNameVal = draft.schoolAndAgeGroup?.schoolName || draft.schoolName;
  const schoolNameRes = validateSchoolName(schoolNameVal, 'schoolName');
  if (!schoolNameRes.valid) {
    errors.schoolName = schoolNameRes;
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
    const medRes = validateNotes(medNotesVal, 'medicalNotes');
    if (!medRes.valid) {
      errors.medicalNotes = medRes;
    } else if (!medNotesVal || !medNotesVal.trim()) {
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
    const supportRes = validateNotes(supportNotesVal, 'supportNotes');
    if (!supportRes.valid) {
      errors.supportNotes = supportRes;
    } else if (!supportNotesVal || !supportNotesVal.trim()) {
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
