import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';

/**
 * Normalizes phone numbers to E.164 format with special handling for Nigerian numbers.
 * 
 * Rules for Nigerian numbers (Country 'NG'):
 * - 08012345678  -> +2348012345678
 * - 8012345678   -> +2348012345678
 * - +2348012345678 -> +2348012345678
 * - 2348012345678 -> +2348012345678
 * 
 * Returns null for malformed or empty inputs.
 */
export function normalizePhoneNumberToE164(phone: string | null | undefined, defaultCountry: string = 'NG'): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  let cleaned = phone.trim();
  if (!cleaned) {
    return null;
  }

  // Strip WhatsApp URI scheme if present
  if (cleaned.toLowerCase().startsWith('whatsapp:')) {
    cleaned = cleaned.substring(9).trim();
  }

  // Remove common separators (spaces, hyphens, parentheses, dots)
  cleaned = cleaned.replace(/[\s\-\(\)\.]/g, '');

  if (!cleaned) {
    return null;
  }

  // Handle Nigerian prefixes before standard parsing
  if (defaultCountry === 'NG') {
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      // e.g. 08012345678 -> +2348012345678
      cleaned = '+234' + cleaned.substring(1);
    } else if (!cleaned.startsWith('+')) {
      if (cleaned.startsWith('234') && cleaned.length === 13) {
        // e.g. 2348012345678 -> +2348012345678
        cleaned = '+' + cleaned;
      } else if ((cleaned.startsWith('7') || cleaned.startsWith('8') || cleaned.startsWith('9')) && cleaned.length === 10) {
        // e.g. 8012345678 -> +2348012345678
        cleaned = '+234' + cleaned;
      }
    }
  }

  try {
    const parsed = parsePhoneNumberFromString(cleaned, defaultCountry as CountryCode);
    if (parsed && parsed.isValid()) {
      return parsed.format('E.164');
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Resolves the preferred WhatsApp destination for a parent.
 * Rule:
 * 1. If explicit whatsapp_number is provided and valid, use it.
 * 2. If absent and fallbackToPhone is explicitly permitted, normalize phone_number.
 * 3. Otherwise returns null to prevent unverified delivery assumptions.
 */
export function resolveParentWhatsAppCandidate(
  parent: { phone_number?: string | null; whatsapp_number?: string | null },
  allowPhoneFallback = false
): { normalizedNumber: string | null; source: 'whatsapp_number' | 'phone_number' | 'none' } {
  if (parent.whatsapp_number) {
    const norm = normalizePhoneNumberToE164(parent.whatsapp_number);
    if (norm) {
      return { normalizedNumber: norm, source: 'whatsapp_number' };
    }
  }

  if (allowPhoneFallback && parent.phone_number) {
    const norm = normalizePhoneNumberToE164(parent.phone_number);
    if (norm) {
      return { normalizedNumber: norm, source: 'phone_number' };
    }
  }

  return { normalizedNumber: null, source: 'none' };
}
