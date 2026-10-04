import parsePhoneNumber, { CountryCode } from 'libphonenumber-js/core';
import meta from 'libphonenumber-js/metadata.min';
import { validateCountryIso } from '../../utils/countries';

const rawMeta = meta as any;
const phoneMetadata = rawMeta?.countries ? rawMeta : (rawMeta?.default?.countries ? rawMeta.default : rawMeta);
const parsePhoneNumberFromString = (text: string, country?: any) => {
  try {
    return parsePhoneNumber(text, country, phoneMetadata);
  } catch {
    return undefined;
  }
};

/**
 * Normalizes phone numbers to E.164 format with support for international countries.
 * 
 * Rules:
 * - If countryIso is omitted/null/undefined, defaults to 'NG' for backwards compatibility.
 * - An already international number (starting with '+') must not be rewritten using the selected country.
 * - Supports any valid ISO 3166-1 alpha-2 country code (case-insensitive, e.g. 'ng', 'gb', 'us').
 * - For Nigerian numbers ('NG'), handles national prefix conventions:
 *   - 08012345678  -> +2348012345678
 *   - 8012345678   -> +2348012345678
 *   - +2348012345678 -> +2348012345678
 *   - 2348012345678 -> +2348012345678
 * - Returns null for malformed, empty, or impossible inputs.
 */
export function normalizePhoneNumberToE164(
  phone: string | null | undefined,
  countryIso: string | null | undefined = 'NG'
): string | null {
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

  const isExplicitInternational = cleaned.startsWith('+');

  // If already international (+E.164), parse directly with international prefix
  if (isExplicitInternational) {
    try {
      const parsed = parsePhoneNumberFromString(cleaned);
      if (parsed && parsed.isValid()) {
        return parsed.format('E.164');
      }
    } catch {
      // Fall through to country-guided attempt
    }
  }

  // Canonicalize country ISO. If omitted or empty, fall back to 'NG'.
  const isoCheck = validateCountryIso(countryIso, {
    allowFallback: countryIso === undefined || countryIso === null || countryIso === '',
    fallbackIso: 'NG'
  });

  if (!isoCheck.valid || !isoCheck.countryIso) {
    // If the country code is invalid and the number is not a valid international number, reject
    return null;
  }

  const targetCountry = isoCheck.countryIso;

  // Handle Nigerian prefixes before standard parsing ONLY when target country is NG
  if (targetCountry === 'NG' && !isExplicitInternational) {
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
    const parsed = parsePhoneNumberFromString(cleaned, targetCountry as CountryCode);
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
  parent: { phone_number?: string | null; whatsapp_number?: string | null; country_iso?: string | null },
  allowPhoneFallback = false
): { normalizedNumber: string | null; source: 'whatsapp_number' | 'phone_number' | 'none' } {
  const country = parent.country_iso || 'NG';

  if (parent.whatsapp_number) {
    const norm = normalizePhoneNumberToE164(parent.whatsapp_number, country);
    if (norm) {
      return { normalizedNumber: norm, source: 'whatsapp_number' };
    }
  }

  if (allowPhoneFallback && parent.phone_number) {
    const norm = normalizePhoneNumberToE164(parent.phone_number, country);
    if (norm) {
      return { normalizedNumber: norm, source: 'phone_number' };
    }
  }

  return { normalizedNumber: null, source: 'none' };
}
