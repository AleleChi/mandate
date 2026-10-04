import { resolveParentWhatsAppCandidate } from '../../utils/phone';

export type WhatsAppConsentStatus = 'unknown' | 'opted_in' | 'opted_out';

export interface ParentConsentProfile {
  id?: string;
  phone_number?: string | null;
  whatsapp_number?: string | null;
  whatsapp_consent_status?: string | null;
  preferred_contact?: string | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  normalizedNumber?: string;
  consentStatus: WhatsAppConsentStatus;
}

/**
 * Evaluates whether a parent is eligible to receive WhatsApp communications.
 * 
 * CORE RULES:
 * 1. An existing parent with status 'unknown' is NOT eligible for automated/broadcast messages.
 * 2. An 'opted_out' parent is NEVER eligible.
 * 3. Only an explicitly 'opted_in' parent is eligible.
 * 4. Automatic opt-in must NOT be inferred merely because whatsapp_number or phone_number exists.
 */
export function evaluateWhatsAppEligibility(
  parent: ParentConsentProfile,
  options: { allowTestBypass?: boolean } = {}
): EligibilityResult {
  const rawStatus = (parent.whatsapp_consent_status || 'unknown').toLowerCase();
  let consentStatus: WhatsAppConsentStatus = 'unknown';

  if (rawStatus === 'opted_in') {
    consentStatus = 'opted_in';
  } else if (rawStatus === 'opted_out') {
    consentStatus = 'opted_out';
  } else {
    consentStatus = 'unknown';
  }

  // Check phone number validity
  const candidate = resolveParentWhatsAppCandidate(parent, false);
  if (!candidate.normalizedNumber) {
    return {
      eligible: false,
      reason: 'No valid normalized E.164 WhatsApp number available.',
      consentStatus
    };
  }

  // Bypass only for internal super_admin test sends to verified staff numbers
  if (options.allowTestBypass) {
    return {
      eligible: true,
      normalizedNumber: candidate.normalizedNumber,
      consentStatus
    };
  }

  if (consentStatus === 'opted_out') {
    return {
      eligible: false,
      reason: 'Parent has explicitly opted out of WhatsApp communications.',
      consentStatus,
      normalizedNumber: candidate.normalizedNumber
    };
  }

  if (consentStatus === 'unknown') {
    return {
      eligible: false,
      reason: 'Parent WhatsApp consent status is unknown. Explicit opt-in is required before automated dispatch.',
      consentStatus,
      normalizedNumber: candidate.normalizedNumber
    };
  }

  return {
    eligible: true,
    normalizedNumber: candidate.normalizedNumber,
    consentStatus: 'opted_in'
  };
}
