import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';

export const validateRequired = (val: any, message = 'This field is required.'): string | undefined => {
  if (val === undefined || val === null) return message;
  if (typeof val === 'string' && !val.trim()) return message;
  if (Array.isArray(val) && val.length === 0) return message;
  return undefined;
};

export const validateEmailSyntax = (email: string): { valid: boolean; message?: string; suggestion?: string } => {
  const normalized = (email || '').trim().toLowerCase();
  
  if (!normalized) {
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

export const validateName = (name: string): string | undefined => {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return 'Enter your full name.';
  }
  if (trimmed.length < 3 || trimmed.length > 100) {
    return 'Enter your full name.';
  }
  const nameRegex = /^[a-zA-Z'\-\s]+$/;
  if (!nameRegex.test(trimmed)) {
    return 'Enter your full name.';
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return 'Enter your full name.';
  }
  return undefined;
};

export const validatePhone = (phone: string, countryCode = 'NG'): string | undefined => {
  const trimmed = (phone || '').trim();
  if (!trimmed) {
    return 'Enter a valid phone number.';
  }
  
  const allowedCharsRegex = /^[+\d\s]+$/;
  if (!allowedCharsRegex.test(trimmed)) {
    return 'Phone number can only contain digits, spaces, and +.';
  }

  try {
    const parsed = parsePhoneNumberFromString(trimmed, countryCode as CountryCode);
    if (!parsed || !parsed.isValid()) {
      return 'Enter a valid phone number.';
    }
    return undefined;
  } catch (e) {
    return 'Enter a valid phone number.';
  }
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
  if (trimmed.length > 80) {
    return 'City name cannot exceed 80 characters.';
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
  return undefined;
};
