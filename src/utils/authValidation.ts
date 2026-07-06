/**
 * Reusable Frontend Validation Rules for Parent Access & Auth Forms
 *
 * Designed to be reused across:
 * - Create Parent Account
 * - Sign In
 * - Forgot Password
 * - Create New Password
 * - Parent Profile Setup
 */

import {
  validateName,
  validateEmailSyntax,
  validatePhone,
  validatePassword
} from './validation';

export const authValidation = {
  /**
   * Full name validation: required, must be at least 2 words, no numbers, etc.
   */
  fullName: (value: string): string | undefined => {
    return validateName(value);
  },

  /**
   * Email address validation: required, valid email format and typo detection
   */
  email: (value: string): string | undefined => {
    const res = validateEmailSyntax(value);
    if (!res.valid) {
      return res.message;
    }
    return undefined;
  },

  /**
   * Phone number validation: required, must be valid via libphonenumber-js
   */
  phone: (value: string, countryCode = 'NG'): string | undefined => {
    return validatePhone(value, countryCode);
  },

  /**
   * WhatsApp number validation: required, must be valid via libphonenumber-js
   */
  whatsapp: (value: string, countryCode = 'NG'): string | undefined => {
    const res = validatePhone(value, countryCode);
    if (res) {
      return 'Enter a valid WhatsApp number.';
    }
    return undefined;
  },

  /**
   * Password validation: required, minimum 8 characters with letter + number
   */
  password: (value: string): string | undefined => {
    return validatePassword(value);
  },

  /**
   * Confirm password validation: required, must match password
   */
  confirmPassword: (confirmValue: string, passwordValue: string): string | undefined => {
    if (!confirmValue) {
      return 'Passwords do not match.';
    }
    if (confirmValue !== passwordValue) {
      return 'Passwords do not match.';
    }
    return undefined;
  },

  /**
   * Agreement checkbox validation: required
   */
  agreement: (agreed: boolean): string | undefined => {
    if (!agreed) {
      return 'Please agree to receive event updates.';
    }
    return undefined;
  }
};
