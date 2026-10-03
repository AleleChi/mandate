import parsePhoneNumber, {
  CountryCode,
  getCountries as coreGetCountries,
  getCountryCallingCode as coreGetCountryCallingCode
} from 'libphonenumber-js/core';
import meta from 'libphonenumber-js/metadata.min';

const rawMeta = meta as any;
const phoneMetadata = rawMeta?.countries
  ? rawMeta
  : rawMeta?.default?.countries
  ? rawMeta.default
  : rawMeta;

export const getCountries = (): CountryCode[] => {
  return coreGetCountries(phoneMetadata);
};

export const getCountryCallingCode = (country: CountryCode): string => {
  return coreGetCountryCallingCode(country, phoneMetadata);
};

export type InternationalCountry = {
  iso: CountryCode;
  name: string;
  callingCode: string; // e.g. "234"
  dialCode: string;    // e.g. "+234"
  flag: string;        // e.g. "ðŸ‡³ðŸ‡¬"
};

/**
 * Derives a flag emoji from an ISO 3166-1 alpha-2 country code.
 */
export function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '';
  const upper = countryCode.toUpperCase();
  return upper.replace(/./g, (char) =>
    String.fromCodePoint(char.charCodeAt(0) + 127397)
  );
}

let cachedCountries: InternationalCountry[] | null = null;
let supportedCountrySet: Set<string> | null = null;

function getSupportedSet(): Set<string> {
  if (!supportedCountrySet) {
    supportedCountrySet = new Set(getCountries());
  }
  return supportedCountrySet;
}

/**
 * Returns all supported international countries derived from libphonenumber-js
 * and Intl.DisplayNames, sorted alphabetically by country name.
 *
 * Safe for both browser and Node.js runtimes. Zero network requests.
 */
export function getInternationalCountries(): InternationalCountry[] {
  if (cachedCountries) {
    return cachedCountries;
  }

  const regionNames =
    typeof Intl !== 'undefined' && Intl.DisplayNames
      ? new Intl.DisplayNames(['en'], { type: 'region' })
      : null;

  const rawCodes = getCountries();
  const list: InternationalCountry[] = [];

  for (const iso of rawCodes) {
    try {
      const callingCode = getCountryCallingCode(iso);
      const name = (regionNames && regionNames.of(iso)) || iso;
      const flag = getFlagEmoji(iso);
      list.push({
        iso,
        name,
        callingCode,
        dialCode: `+${callingCode}`,
        flag
      });
    } catch {
      // Skip if country metadata cannot be parsed
    }
  }

  // Sort alphabetically by English country name
  list.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

  cachedCountries = list;
  return cachedCountries;
}

/**
 * Looks up a single country record by 2-letter ISO code.
 */
export function getCountryByIso(iso: string | null | undefined): InternationalCountry | undefined {
  if (!iso || typeof iso !== 'string') return undefined;
  const upper = iso.trim().toUpperCase() as CountryCode;
  const countries = getInternationalCountries();
  return countries.find((c) => c.iso === upper);
}

/**
 * Looks up a single country record by country name (case-insensitive).
 */
export function getCountryByName(name: string | null | undefined): InternationalCountry | undefined {
  if (!name || typeof name !== 'string' || !name.trim()) return undefined;
  const clean = name.trim().toLowerCase();
  const countries = getInternationalCountries();
  return countries.find((c) => c.name.toLowerCase() === clean);
}

/**
 * Resolves a valid 2-letter ISO code from an ISO or country name, defaulting to fallbackIso (default 'NG').
 */
export function resolveCountryIso(
  countryIso?: string | null,
  countryName?: string | null,
  fallbackIso: CountryCode = 'NG'
): CountryCode {
  if (countryIso && countryIso.trim()) {
    const val = validateCountryIso(countryIso);
    if (val.valid && val.countryIso) return val.countryIso;
  }
  if (countryName && countryName.trim()) {
    const matched = getCountryByName(countryName);
    if (matched) return matched.iso;
  }
  return fallbackIso;
}

export interface IsoValidationResult {
  valid: boolean;
  countryIso?: CountryCode;
  error?: string;
}

/**
 * Validates and canonicalizes an ISO 3166-1 alpha-2 country code.
 *
 * Rules:
 * - Accept two-letter country ISO (case-insensitive: 'ng' -> 'NG', 'gb' -> 'GB')
 * - Rejects malformed values (3-letter codes 'NGA', numeric dial codes '234', full names 'Nigeria')
 * - When country is empty/omitted and allowFallback=true, defaults to fallbackIso (default 'NG')
 * - When explicit country is provided, never forces or assumes 'NG'
 */
export function validateCountryIso(
  iso: string | null | undefined,
  options?: { allowFallback?: boolean; fallbackIso?: string }
): IsoValidationResult {
  const allowFallback = options?.allowFallback ?? false;
  const fallbackIso = (options?.fallbackIso || 'NG').trim().toUpperCase() as CountryCode;

  if (!iso || typeof iso !== 'string' || !iso.trim()) {
    if (allowFallback) {
      return { valid: true, countryIso: fallbackIso };
    }
    return {
      valid: false,
      error: 'Country ISO code is required.'
    };
  }

  const cleaned = iso.trim().toUpperCase();

  // Exactly two alphabetic characters
  if (!/^[A-Z]{2}$/.test(cleaned)) {
    return {
      valid: false,
      error: `Invalid country code: "${iso}". Expected a 2-letter ISO alpha-2 code (e.g. NG, GB, US).`
    };
  }

  const supported = getSupportedSet();
  if (!supported.has(cleaned)) {
    return {
      valid: false,
      error: `Unsupported country code: "${cleaned}".`
    };
  }

  return {
    valid: true,
    countryIso: cleaned as CountryCode
  };
}

/**
 * Searches international countries by name, 2-letter ISO, or dial/calling code.
 *
 * Examples that match Nigeria:
 * - "Nigeria"
 * - "NG"
 * - "+234"
 * - "234"
 */
export function searchInternationalCountries(
  query: string,
  countries: InternationalCountry[] = getInternationalCountries()
): InternationalCountry[] {
  if (!query || !query.trim()) {
    return countries;
  }

  const clean = query.trim().toLowerCase();
  const numericOnly = clean.replace(/[^0-9]/g, '');

  return countries.filter((c) => {
    // Match country name
    if (c.name.toLowerCase().includes(clean)) return true;
    // Match ISO code
    if (c.iso.toLowerCase() === clean) return true;
    // Match dialCode (+234)
    if (c.dialCode.toLowerCase().startsWith(clean)) return true;
    // Match numeric callingCode (234)
    if (numericOnly && c.callingCode.startsWith(numericOnly)) return true;
    return false;
  });
}

/**
 * Formats a phone number for national display within an international input
 * (e.g. +2348012345678 with ISO 'NG' -> '8012345678').
 */
export function formatToNationalDisplay(phone?: string | null, countryIso?: string | null): string {
  if (!phone || typeof phone !== 'string') return '';
  const trimmed = phone.trim();
  if (!trimmed) return '';
  const iso = resolveCountryIso(countryIso, null, 'NG');
  const country = getCountryByIso(iso);
  if (!country) return trimmed;
  if (trimmed.startsWith(country.dialCode)) {
    return trimmed.slice(country.dialCode.length).trim();
  }
  return trimmed;
}

/**
 * Safely infers country ISO (alpha-2) from a valid E.164 phone number.
 * Returns null if the phone is missing, not valid E.164, or cannot be mapped to a country.
 */
export function inferCountryIsoFromE164(phone?: string | null): CountryCode | null {
  if (!phone || typeof phone !== 'string') return null;
  const trimmed = phone.trim();
  if (!trimmed.startsWith('+')) return null;
  try {
    const parsed = parsePhoneNumber(trimmed, undefined, phoneMetadata);
    if (parsed && parsed.country && getSupportedSet().has(parsed.country)) {
      return parsed.country as CountryCode;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

/**
 * Resolves the WhatsApp country ISO for display and interpretation using backward-compatible fallback:
 * 1. whatsapp_country_iso (if present and valid)
 * 2. Inferred from E.164 whatsapp_number
 * 3. Residence country_iso (or residence country name lookup)
 * 4. Fallback ISO ('NG')
 */
export function resolveWhatsAppCountryIso(
  whatsappCountryIso?: string | null,
  whatsappNumber?: string | null,
  residenceCountryIso?: string | null,
  residenceCountryName?: string | null,
  fallbackIso: CountryCode = 'NG'
): CountryCode {
  if (whatsappCountryIso && typeof whatsappCountryIso === 'string') {
    const validResult = validateCountryIso(whatsappCountryIso);
    if (validResult.valid && validResult.countryIso) {
      return validResult.countryIso;
    }
  }

  const inferred = inferCountryIsoFromE164(whatsappNumber);
  if (inferred) {
    return inferred;
  }

  return resolveCountryIso(residenceCountryIso, residenceCountryName, fallbackIso);
}

let flagEmojiSupportedCache: boolean | null = null;

/**
 * Detects whether the current runtime environment natively supports rendering country flag emojis.
 * On platforms like Windows (Chromium / Edge), standard system fonts lack emoji flags and
 * render raw Regional Indicator letters (e.g. "NG", "US").
 * When unavailable, presentation components fallback cleanly to E.164 / international numbers
 * without ever showing raw ISO codes in profile views.
 */
export function supportsFlagEmoji(): boolean {
  if (flagEmojiSupportedCache !== null) {
    return flagEmojiSupportedCache;
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return true;
  }

  try {
    const ua = navigator.userAgent || '';
    // Windows standard Segoe UI Emoji deliberately omits country flag glyphs.
    // Chromium / Edge on Windows render two regional indicator letters (e.g. "NG").
    // Firefox on Windows bundles Twemoji, which does render flag glyphs.
    if (/Windows/i.test(ua) && !/Firefox/i.test(ua)) {
      flagEmojiSupportedCache = false;
      return false;
    }

    // Dynamic canvas check for other browsers/platforms
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      flagEmojiSupportedCache = true;
      return true;
    }

    ctx.font = '24px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    const singleWidth = ctx.measureText('\u{1F1F3}').width;
    const pairWidth = ctx.measureText('\u{1F1F3}\u{1F1EC}').width;
    // When unsupported, pairWidth is approximately 2 * singleWidth
    flagEmojiSupportedCache = pairWidth < singleWidth * 1.5;
    return flagEmojiSupportedCache;
  } catch {
    flagEmojiSupportedCache = true;
    return true;
  }
}

/**
 * Formats a phone or WhatsApp number into canonical readable international format (e.g. "ðŸ‡³ðŸ‡¬ +234 801 234 5678" or "+234 801 234 5678").
 * Preserves international country semantics without altering normalization or persistence.
 * If flag rendering is unsupported (e.g. on Windows), falls back to clean "+234..." without raw ISO code.
 */
export function formatReadablePhone(
  phone?: string | null,
  countryIso?: string | null,
  includeFlag: boolean = true
): string {
  if (!phone || typeof phone !== 'string' || !phone.trim()) return '';
  const trimmed = phone.trim();
  const targetIso = resolveCountryIso(countryIso, null, 'NG');

  try {
    const parsed = parsePhoneNumber(
      trimmed,
      trimmed.startsWith('+') ? undefined : targetIso,
      phoneMetadata
    );
    if (parsed) {
      const international = parsed.formatInternational();
      if (!includeFlag || !supportsFlagEmoji()) return international;
      const flag = getFlagEmoji(parsed.country || targetIso);
      return flag ? `${flag} ${international}` : international;
    }
  } catch {
    // If parse fails, fallback to cleaned string
  }

  if (!includeFlag || !supportsFlagEmoji()) return trimmed;
  const flag = getFlagEmoji(targetIso);
  return flag ? `${flag} ${trimmed}` : trimmed;
}

/**
 * Formats a residence country for display (e.g. "ðŸ‡³ðŸ‡¬ Nigeria" or "Nigeria").
 * Adheres strictly to the requirement:
 * - Displays flag and country name (e.g. "ðŸ‡³ðŸ‡¬ Nigeria") when supported
 * - Falls back cleanly to country name (e.g. "Nigeria") when flag rendering is unavailable
 * - Does NOT display dial code (never "NG Nigeria (+234)")
 * - Does NOT display raw ISO code (never "NG")
 * - Does NOT merge residence and WhatsApp country semantics.
 */
export function formatReadableCountry(
  countryName?: string | null,
  countryIso?: string | null
): string {
  if (!countryName && !countryIso) return 'Not provided';
  const iso = resolveCountryIso(countryIso, countryName, 'NG');
  const countryObj = getCountryByIso(iso) || (countryName ? getCountryByName(countryName) : undefined);
  const flag = supportsFlagEmoji() ? (countryObj?.flag || (iso ? getFlagEmoji(iso) : '')) : '';
  const displayName = countryObj?.name || countryName || 'Nigeria';
  return flag ? `${flag} ${displayName}` : displayName;
}
