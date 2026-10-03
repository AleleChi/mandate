import parsePhoneNumber, { CountryCode } from 'libphonenumber-js/core';
import meta from 'libphonenumber-js/metadata.min';
import { validateCountryIso } from './countries';

const rawMeta = meta as any;
const phoneMetadata = rawMeta?.countries ? rawMeta : (rawMeta?.default?.countries ? rawMeta.default : rawMeta);
const parsePhoneNumberFromString = (text: string, country?: any) => {
  try {
    return parsePhoneNumber(text, country, phoneMetadata);
  } catch {
    return undefined;
  }
};

export const validateRequired = (val: any, message = 'This field is required.'): string | undefined => {
  if (val === undefined || val === null) return message;
  if (typeof val === 'string' && !val.trim()) return message;
  if (Array.isArray(val) && val.length === 0) return message;
  return undefined;
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

export const normalizePhone = (phone: string, country: string = 'NG'): string => {
  if (!phone || typeof phone !== 'string') return '';
  let cleaned = phone.trim();
  if (cleaned.toLowerCase().startsWith('whatsapp:')) {
    cleaned = cleaned.substring(9).trim();
  }
  cleaned = cleaned.replace(/[\s\-\(\)\.]/g, '');
  if (!cleaned) return '';

  const isExplicitInternational = cleaned.startsWith('+');
  if (isExplicitInternational) {
    try {
      const parsed = parsePhoneNumberFromString(cleaned);
      if (parsed && parsed.isValid()) {
        return parsed.format('E.164');
      }
    } catch {}
  }

  const isoCheck = validateCountryIso(country, { allowFallback: true, fallbackIso: 'NG' });
  const targetCountry = isoCheck.countryIso || 'NG';

  if (targetCountry === 'NG' && !isExplicitInternational) {
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      cleaned = '+234' + cleaned.substring(1);
    } else if (cleaned.startsWith('234') && cleaned.length === 13) {
      cleaned = '+' + cleaned;
    } else if ((cleaned.startsWith('7') || cleaned.startsWith('8') || cleaned.startsWith('9')) && cleaned.length === 10) {
      cleaned = '+234' + cleaned;
    }
  }

  try {
    const parsed = parsePhoneNumberFromString(cleaned, targetCountry as CountryCode);
    if (parsed && parsed.isValid()) {
      return parsed.format('E.164');
    }
  } catch {}

  return cleaned.startsWith('+') ? cleaned : targetCountry === 'NG' ? `+234${cleaned.replace(/^0+/, '')}` : '';
};

export const validateFullName = (name: string, isParentOrPickup = true): string | undefined => {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return 'Enter a valid full name.';
  }
  if (trimmed.length < 3 || trimmed.length > 100) {
    return 'Enter a valid full name.';
  }
  // Reject digits
  if (/\d/.test(trimmed)) {
    return 'Enter a valid full name.';
  }
  // Allowed characters: letters, spaces, apostrophe, hyphen, period
  if (!/^[a-zA-ZÀ-ÿ\s.\-']+$/.test(trimmed)) {
    return 'Enter a valid full name.';
  }
  // Reject quotes / backticks or other random characters
  if (trimmed.includes('"') || trimmed.includes('`')) {
    return 'Enter a valid full name.';
  }
  // Reject long symbol runs (consecutive punctuation)
  if (/[\.\-']{2,}/.test(trimmed) || /[\.\-']\s*[\.\-']/.test(trimmed)) {
    return 'Enter a valid full name.';
  }
  // Must contain letters
  if (!/[a-zA-Z]/.test(trimmed)) {
    return 'Enter a valid full name.';
  }
  // Reject SQL-like content/script tags
  if (/\b(drop|select|insert|delete|update|union|script|table)\b/i.test(trimmed)) {
    return 'Enter a valid full name.';
  }
  // Reject mostly punctuation (letters must be at least 50% of non-space length)
  const lettersCount = trimmed.replace(/[^a-zA-ZÀ-ÿ]/g, '').length;
  const totalNonSpace = trimmed.replace(/\s/g, '').length;
  if (totalNonSpace > 0 && (lettersCount / totalNonSpace) < 0.5) {
    return 'Enter a valid full name.';
  }
  // Meaningful name parts
  if (isParentOrPickup) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      return 'Enter a valid full name.';
    }
  }
  return undefined;
};

// Map old validateName to our robust validator so other files don't break
export const validateName = (name: string): string | undefined => {
  const err = validateFullName(name, true);
  if (err) return 'Enter your full name.';
  return undefined;
};

export const validateChildName = (name: string): string | undefined => {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return 'Enter the child’s full name.';
  }
  if (trimmed.length < 2 || trimmed.length > 100) {
    return 'Enter the child’s full name.';
  }
  // Reject digits
  if (/\d/.test(trimmed)) {
    return 'Enter the child’s full name.';
  }
  // Allowed: letters, spaces, apostrophe, hyphen
  if (!/^[a-zA-ZÀ-ÿ\s\-']+$/.test(trimmed)) {
    return 'Enter the child’s full name.';
  }
  // Reject long symbol runs
  if (/[\-']{2,}/.test(trimmed) || /[\-']\s*[\-']/.test(trimmed)) {
    return 'Enter the child’s full name.';
  }
  // Must contain letters
  if (!/[a-zA-Z]/.test(trimmed)) {
    return 'Enter the child’s full name.';
  }
  // Reject SQL injection
  if (/\b(drop|select|insert|delete|update|union|script|table)\b/i.test(trimmed)) {
    return 'Enter the child’s full name.';
  }
  // Mostly punctuation
  const lettersCount = trimmed.replace(/[^a-zA-ZÀ-ÿ]/g, '').length;
  const totalNonSpace = trimmed.replace(/\s/g, '').length;
  if (totalNonSpace > 0 && (lettersCount / totalNonSpace) < 0.5) {
    return 'Enter the child’s full name.';
  }
  return undefined;
};

export const validateEmailSyntax = (email: string): { valid: boolean; message?: string; suggestion?: string } => {
  const normalized = (email || '').trim().toLowerCase();
  
  if (!normalized) {
    return { valid: false, message: 'Enter a valid email address.' };
  }

  // Reject quotes, apostrophes, backticks
  if (normalized.includes("'") || normalized.includes('"') || normalized.includes('`')) {
    return { valid: false, message: 'Enter a valid email address.' };
  }

  // Email must match a proper email pattern:
  // - no spaces
  if (/\s/.test(normalized)) {
    return { valid: false, message: 'Enter a valid email address.' };
  }

  // - one @ only
  const parts = normalized.split('@');
  if (parts.length !== 2) {
    return { valid: false, message: 'Enter a valid email address.' };
  }

  // - local part before @
  // - domain after @
  const [local, domain] = parts;
  if (!local || !domain) {
    return { valid: false, message: 'Enter a valid email address.' };
  }

  // - domain must contain at least one dot
  if (!domain.includes('.')) {
    return { valid: false, message: 'Enter a valid email address.' };
  }

  // Reject blocked test domains
  const blockedDomains = [
    'example.com',
    'example.net',
    'example.org',
    'localhost',
    'invalid',
    'example.invalid',
    'example'
  ];

  if (blockedDomains.includes(domain) || domain.endsWith('.invalid')) {
    return { valid: false, message: 'Enter a valid email address.' };
  }

  // Domain labels must be valid:
  const domainParts = domain.split('.');
  
  // - at least 2 labels are required for a domain with a dot (e.g. gmail.com)
  if (domainParts.length < 2) {
    return { valid: false, message: 'Enter a valid email address.' };
  }

  for (let i = 0; i < domainParts.length; i++) {
    const label = domainParts[i];
    
    // - no empty labels
    if (!label) {
      return { valid: false, message: 'Enter a valid email address.' };
    }
    
    // - no label starts or ends with hyphen
    if (label.startsWith('-') || label.endsWith('-')) {
      return { valid: false, message: 'Enter a valid email address.' };
    }
    
    // - labels contain only letters, numbers, and hyphen
    if (!/^[a-z0-9-]+$/i.test(label)) {
      return { valid: false, message: 'Enter a valid email address.' };
    }
  }

  // TLD must be valid:
  const tld = domainParts[domainParts.length - 1];
  
  // - last domain section must contain letters only
  // - no numbers in TLD
  // - length between 2 and 24 characters
  if (!/^[a-z]{2,24}$/i.test(tld)) {
    return { valid: false, message: 'Enter a valid email address.' };
  }

  // Known email provider typo protection
  const commonTypos: { [key: string]: string } = {
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

  if (commonTypos[domain]) {
    const suggestion = commonTypos[domain];
    return {
      valid: false,
      message: `Please check the email address. Did you mean ${suggestion}?`,
      suggestion
    };
  }

  return { valid: true };
};

export const validatePhoneNumber = (phone: string, countryCode = 'NG'): string | undefined => {
  const trimmed = (phone || '').trim();
  if (!trimmed) {
    return 'Enter your phone number.';
  }
  
  const allowedCharsRegex = /^[+\d\s\-\(\)\.]+$/;
  if (!allowedCharsRegex.test(trimmed)) {
    return 'Phone number can only contain digits, spaces, and +.';
  }

  const isExplicitInternational = trimmed.startsWith('+');
  if (isExplicitInternational) {
    try {
      const parsed = parsePhoneNumberFromString(trimmed);
      if (parsed && parsed.isValid()) {
        return undefined;
      }
    } catch {}
  }

  const isoCheck = validateCountryIso(countryCode, { allowFallback: true, fallbackIso: 'NG' });
  if (!isoCheck.valid || !isoCheck.countryIso) {
    return 'Invalid country selected.';
  }

  try {
    let toParse = trimmed.replace(/[\s\-\(\)\.]/g, '');
    if (isoCheck.countryIso === 'NG' && !isExplicitInternational) {
      if (toParse.startsWith('0') && toParse.length === 11) {
        toParse = '+234' + toParse.substring(1);
      } else if (toParse.startsWith('234') && toParse.length === 13) {
        toParse = '+' + toParse;
      } else if ((toParse.startsWith('7') || toParse.startsWith('8') || toParse.startsWith('9')) && toParse.length === 10) {
        toParse = '+234' + toParse;
      }
    }

    const parsed = parsePhoneNumberFromString(toParse, isoCheck.countryIso as CountryCode);
    if (!parsed || !parsed.isValid()) {
      return 'Enter a valid phone number.';
    }
    return undefined;
  } catch (e) {
    return 'Enter a valid phone number.';
  }
};

// Maintain old validatePhone mapping
export const validatePhone = (phone: string, countryCode = 'NG'): string | undefined => {
  return validatePhoneNumber(phone, countryCode);
};

export const validatePassword = (password: string): string | undefined => {
  if (!password) {
    return 'Use at least 8 characters with a letter and a number.';
  }
  if (password.length < 8) {
    return 'Use at least 8 characters with a letter and a number.';
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) {
    return 'Use at least 8 characters with a letter and a number.';
  }
  return undefined;
};

export const validateDateOfBirth = (dob: string): string | undefined => {
  if (!dob) {
    return 'Date of birth is required.';
  }
  const dobDate = new Date(dob);
  const now = new Date();
  if (dobDate > now) {
    return 'Date of birth cannot be in the future.';
  }
  // Check age: must be realistic (0 to 18 years for children registry)
  const ageInMs = now.getTime() - dobDate.getTime();
  const ageInYears = ageInMs / (1000 * 60 * 60 * 24 * 365.25);
  if (ageInYears > 18) {
    return 'Child must be under 18 years old.';
  }
  return undefined;
};

export const validateCountry = (country: string): string | undefined => {
  if (!country || !country.trim()) {
    return 'Select your country.';
  }
  return undefined;
};

export const validateCity = (city: string): string | undefined => {
  const trimmed = (city || '').trim();
  if (!trimmed) {
    return 'City is required.';
  }
  if (/^\d+$/.test(trimmed)) {
    return 'Enter a valid city name.';
  }
  if (trimmed.length < 2 || trimmed.length > 80) {
    return 'City name must be between 2 and 80 characters.';
  }
  if (!/[a-zA-Z]/.test(trimmed)) {
    return 'Enter a valid city name.';
  }
  return undefined;
};

export const validateStateRegion = (state: string, country = 'Nigeria'): string | undefined => {
  const trimmed = (state || '').trim();
  if (!trimmed) {
    return 'State / Region is required.';
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
        return 'Enter a valid Nigerian state.';
      }
    }
  } else {
    if (!/^[a-zA-Z0-9\s.\-']+$/.test(trimmed) || !/[a-zA-Z]/.test(trimmed)) {
      return 'Enter a valid state / region.';
    }
  }
  return undefined;
};

export const validateAddress = (address: string): string | undefined => {
  const trimmed = (address || '').trim();
  if (!trimmed) {
    return 'Home address is required.';
  }
  if (trimmed.length < 5) {
    return 'Enter a valid home address.';
  }
  if (trimmed.length > 250) {
    return 'Address cannot exceed 250 characters.';
  }
  // Validate characters: allow letters, numbers, common symbols, spaces. No HTML or SQL patterns
  if (/\b(drop|select|insert|delete|update|union|script|table)\b/i.test(trimmed)) {
    return 'Invalid characters in home address.';
  }
  // Must contain letters or valid location characters
  if (!/[a-zA-Z]/.test(trimmed)) {
    return 'Enter a valid home address.';
  }
  return undefined;
};

export const validateRelationship = (relationship: string): string | undefined => {
  const trimmed = (relationship || '').trim();
  if (!trimmed) {
    return 'Relationship is required.';
  }
  if (trimmed.length < 2 || trimmed.length > 50) {
    return 'Enter a valid relationship.';
  }
  if (!/^[a-zA-Z\s\-']+$/.test(trimmed)) {
    return 'Relationship can only contain letters.';
  }
  return undefined;
};

export const validateSchoolName = (schoolName: string): string | undefined => {
  const trimmed = (schoolName || '').trim();
  if (!trimmed) return undefined; // Optional
  if (trimmed.length < 2 || trimmed.length > 100) {
    return 'School name must be between 2 and 100 characters.';
  }
  if (!/[a-zA-Z]/.test(trimmed)) {
    return 'School name must contain letters.';
  }
  if (/\b(drop|select|insert|delete|update|union|script|table)\b/i.test(trimmed)) {
    return 'Invalid characters in school name.';
  }
  return undefined;
};

export const validateNotes = (notes: string): string | undefined => {
  const trimmed = (notes || '').trim();
  if (!trimmed) return undefined; // Optional
  if (trimmed.length > 1000) {
    return 'Notes cannot exceed 1000 characters.';
  }
  if (/<script[^>]*>/i.test(trimmed) || /\b(drop|select|insert|delete|update|union|table)\b/i.test(trimmed)) {
    return 'Invalid content detected in notes.';
  }
  return undefined;
};

export const validateImageFile = (file: { type: string; size: number }): string | undefined => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedMimeTypes.includes(file.type.toLowerCase())) {
    return 'Please upload a JPG, PNG, or WebP image.';
  }
  // Max size: 10MB
  if (file.size > 10 * 1024 * 1024) {
    return 'This image is too large. Please choose a smaller photo.';
  }
  return undefined;
};

export const validateEmailDeliverability = async (email: string): Promise<boolean> => {
  // Client side fallback is simple syntax check
  return validateEmailSyntax(email).valid;
};

/**
 * Verifies whether a photo reference is a genuine uploaded/stored profile photo
 * rather than an empty value, local blob URL, data URI, placeholder, or generic initials.
 */
export const isValidUploadedPhoto = (val?: any): boolean => {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();

  // Reject local blob URLs and data URIs (not uploaded)
  if (lower.startsWith('blob:') || lower.startsWith('data:') || lower.startsWith('javascript:')) {
    return false;
  }

  // Reject placeholders, sample assets, default avatars, initials
  if (
    lower.includes('placeholder') ||
    lower.includes('default_avatar') ||
    lower.includes('default-avatar') ||
    lower.includes('avatar_placeholder') ||
    lower.includes('pass_avatar') ||
    lower.includes('worker_avatar') ||
    lower.includes('parent_hero') ||
    lower.includes('volunteer_hero') ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower.startsWith('initials:')
  ) {
    return false;
  }

  // Reject short raw letters/initials (e.g. "JD", "AB")
  if (/^[a-zA-Z]{1,3}$/.test(trimmed)) {
    return false;
  }

  // Must be a valid media file reference: UUID, API path, media- prefix, or valid URL
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  const isMediaApi = trimmed.startsWith('/api/media/files/') || trimmed.startsWith('api/media/files/');
  const isMediaPrefix = /^(media|photo|file|rec|img)[-_][a-zA-Z0-9_-]+/i.test(trimmed);
  const isHttpUrl = (lower.startsWith('https://') || lower.startsWith('http://'));

  return isUuid || isMediaApi || isMediaPrefix || isHttpUrl;
};
