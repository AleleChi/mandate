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

export const authValidation = {
  /**
   * Full name validation: required, must be at least 2 words
   */
  fullName: (value: string): string | undefined => {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'Enter your full name.';
    }
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length < 2) {
      return 'Enter your full name.';
    }
    return undefined;
  },

  /**
   * Email address validation: required, valid email format
   */
  email: (value: string): string | undefined => {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'Enter a valid email address.';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return 'Enter a valid email address.';
    }
    return undefined;
  },

  /**
   * Phone number validation: required, must contain at least 10 digits
   */
  phone: (value: string): string | undefined => {
    const trimmed = value.trim();
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (!trimmed || digitsOnly.length < 10) {
      return 'Enter a valid phone number.';
    }
    return undefined;
  },

  /**
   * WhatsApp number validation: required, must contain at least 10 digits
   */
  whatsapp: (value: string): string | undefined => {
    const trimmed = value.trim();
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (!trimmed || digitsOnly.length < 10) {
      return 'Enter a valid WhatsApp number.';
    }
    return undefined;
  },

  /**
   * Password validation: required, minimum 8 characters
   */
  password: (value: string): string | undefined => {
    if (!value || value.length < 8) {
      return 'Use at least 8 characters.';
    }
    return undefined;
  },

  /**
   * Confirm password validation: required, must match password
   */
  confirmPassword: (confirmValue: string, passwordValue: string): string | undefined => {
    if (!confirmValue || confirmValue !== passwordValue) {
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
