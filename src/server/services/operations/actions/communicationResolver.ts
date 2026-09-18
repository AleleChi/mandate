import { query, queryOne } from '../../../db';
import { normalizePhoneNumberToE164 } from '../../../utils/phone';
import { ensureVapidKeysLoaded } from '../../push';

export type SupportedCommunicationChannel = 'whatsapp' | 'sms' | 'email' | 'push' | 'none';

export interface VolunteerCommunicationChannelResult {
  userId: string;
  displayName: string;
  channelsAvailable: string[];
  selectedChannel: SupportedCommunicationChannel;
  contactEligible: boolean;
  reasonIfUnavailable?: string;
  preferredChannel?: string;
  destination?: string;
}

export interface VolunteerInputData {
  userId: string;
  displayName: string;
  phone?: string | null;
  whatsapp?: string | null;
  whatsappConsentStatus?: string | null;
  email?: string | null;
  preferredContact?: string | null;
}

/**
 * Checks if WhatsApp delivery provider is available.
 * In this project, getWhatsAppProvider() is active (Twilio or simulated dev/test provider).
 */
export function isWhatsAppProviderAvailable(): boolean {
  return true;
}

/**
 * Checks if Email delivery provider is available.
 * Email requires RESEND_API_KEY or SMTP credentials configured on the server,
 * or explicitly enabled test mock.
 */
export function isEmailProviderAvailable(): boolean {
  if (process.env.ENABLE_EMAIL_TEST_MOCK === 'true') {
    return true;
  }
  const emailProvider = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
  if (emailProvider === 'resend') {
    return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM_ADDRESS);
  }
  return Boolean(
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_HOST &&
    process.env.MAIL_FROM_ADDRESS
  );
}

/**
 * Checks if Web Push provider is available.
 */
export async function isPushProviderAvailable(): Promise<boolean> {
  try {
    return await ensureVapidKeysLoaded();
  } catch {
    return false;
  }
}

/**
 * SMS provider check. No SMS delivery provider exists in this application.
 */
export function isSmsProviderAvailable(): boolean {
  return false;
}

/**
 * Resolves each volunteer's actual enabled/consented communication channel instead of assuming WhatsApp.
 * 
 * CORE RULES:
 * 1. Does not invent fields or infer consent from mere presence of phone or email.
 * 2. WhatsApp requires explicit 'opted_in' consent status.
 * 3. Email requires notification_preferences.email_enabled === 1 and email provider availability.
 * 4. Push requires notification_preferences.push_enabled === 1 and active push subscription.
 * 5. If an explicit preferred channel exists, it is evaluated first.
 *    If preferred channel lacks a delivery provider (e.g. Email unconfigured or SMS),
 *    it is marked internally as unavailable with a plain reason and does not silently fall back.
 * 6. If no explicit preference exists, follows deterministic priority among enabled channels: WhatsApp -> Push -> Email.
 */
export async function resolveVolunteerCommunicationChannel(
  volunteer: VolunteerInputData
): Promise<VolunteerCommunicationChannelResult> {
  const userId = volunteer.userId;
  const displayName = volunteer.displayName || 'Volunteer';

  // 1. Fetch user email and notification preferences
  const userRow = await queryOne('SELECT email FROM users WHERE id = ?', [userId]);
  const userEmail = (volunteer.email || userRow?.email || '').trim().toLowerCase();

  const prefRow = await queryOne(
    'SELECT email_enabled, push_enabled FROM notification_preferences WHERE user_id = ?',
    [userId]
  );

  // Check parent profile for dual-role volunteers (to catch preferred_contact)
  const parentProfile = await queryOne(
    'SELECT preferred_contact, email, whatsapp_number, phone_number FROM parent_profiles WHERE user_id = ?',
    [userId]
  );

  // Check active push subscriptions
  const pushSubCountRes = await queryOne(
    'SELECT COUNT(*) as count FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL',
    [userId]
  );
  const activePushCount = Number(pushSubCountRes?.count || 0);

  // 2. Evaluate individual channel readiness
  // WhatsApp:
  const rawPhone = volunteer.whatsapp || volunteer.phone || parentProfile?.whatsapp_number || parentProfile?.phone_number;
  const normalizedPhone = normalizePhoneNumberToE164(rawPhone);
  const waConsent = (volunteer.whatsappConsentStatus || 'unknown').toLowerCase();
  const waEligible = waConsent === 'opted_in' && Boolean(normalizedPhone) && isWhatsAppProviderAvailable();

  // Email:
  const emailEnabled = prefRow ? prefRow.email_enabled === 1 : false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValidEmail = Boolean(userEmail && emailRegex.test(userEmail));
  const emailEligible = emailEnabled && isValidEmail && isEmailProviderAvailable();

  // Push:
  const pushEnabled = prefRow ? prefRow.push_enabled === 1 : false;
  const isPushReady = await isPushProviderAvailable();
  const pushEligible = pushEnabled && activePushCount > 0 && isPushReady;

  // SMS:
  const smsEligible = false; // No SMS provider exists in the system

  const channelsAvailable: string[] = [];
  if (waEligible) channelsAvailable.push('whatsapp');
  if (pushEligible) channelsAvailable.push('push');
  if (emailEligible) channelsAvailable.push('email');

  // 3. Resolve preferred channel if configured
  const rawPref = (volunteer.preferredContact || parentProfile?.preferred_contact || '').trim().toLowerCase();
  let preferredChannel: string | undefined;

  if (rawPref.includes('whatsapp')) {
    preferredChannel = 'whatsapp';
  } else if (rawPref.includes('email')) {
    preferredChannel = 'email';
  } else if (rawPref.includes('push')) {
    preferredChannel = 'push';
  } else if (rawPref.includes('sms') || rawPref.includes('phone')) {
    preferredChannel = 'sms';
  }

  // 4. Channel Selection Rule
  // Case: Explicit Preferred Channel Configured
  if (preferredChannel) {
    if (preferredChannel === 'whatsapp') {
      if (waEligible) {
        return {
          userId,
          displayName,
          channelsAvailable,
          selectedChannel: 'whatsapp',
          contactEligible: true,
          preferredChannel,
          destination: normalizedPhone || undefined
        };
      }
      let reason = 'Preferred channel: WhatsApp — WhatsApp opt-in required.';
      if (waConsent === 'opted_out') reason = 'Preferred channel: WhatsApp — Opted out of WhatsApp.';
      else if (!normalizedPhone) reason = 'Preferred channel: WhatsApp — No valid phone number.';
      return {
        userId,
        displayName,
        channelsAvailable,
        selectedChannel: 'none',
        contactEligible: false,
        preferredChannel,
        reasonIfUnavailable: reason
      };
    }

    if (preferredChannel === 'email') {
      if (emailEligible) {
        return {
          userId,
          displayName,
          channelsAvailable,
          selectedChannel: 'email',
          contactEligible: true,
          preferredChannel,
          destination: userEmail
        };
      }
      let reason = 'Preferred channel: Email — Email delivery is not currently available.';
      if (!isEmailProviderAvailable()) {
        reason = 'Preferred channel: Email — Email delivery is not currently available.';
      } else if (!emailEnabled) {
        reason = 'Preferred channel: Email — Email notifications are disabled in preferences.';
      } else if (!isValidEmail) {
        reason = 'Preferred channel: Email — No valid email address on file.';
      }
      return {
        userId,
        displayName,
        channelsAvailable,
        selectedChannel: 'none',
        contactEligible: false,
        preferredChannel,
        reasonIfUnavailable: reason
      };
    }

    if (preferredChannel === 'push') {
      if (pushEligible) {
        return {
          userId,
          displayName,
          channelsAvailable,
          selectedChannel: 'push',
          contactEligible: true,
          preferredChannel
        };
      }
      let reason = 'Preferred channel: Push — No active device push subscription.';
      if (!pushEnabled) {
        reason = 'Preferred channel: Push — Push notifications are disabled in preferences.';
      }
      return {
        userId,
        displayName,
        channelsAvailable,
        selectedChannel: 'none',
        contactEligible: false,
        preferredChannel,
        reasonIfUnavailable: reason
      };
    }

    if (preferredChannel === 'sms') {
      return {
        userId,
        displayName,
        channelsAvailable,
        selectedChannel: 'none',
        contactEligible: false,
        preferredChannel,
        reasonIfUnavailable: 'Preferred channel: SMS — SMS delivery is not currently available.'
      };
    }
  }

  // Case: No explicit preference configured -> Deterministic Fallback among enabled channels
  if (waEligible) {
    return {
      userId,
      displayName,
      channelsAvailable,
      selectedChannel: 'whatsapp',
      contactEligible: true,
      destination: normalizedPhone || undefined
    };
  }

  if (pushEligible) {
    return {
      userId,
      displayName,
      channelsAvailable,
      selectedChannel: 'push',
      contactEligible: true
    };
  }

  if (emailEligible) {
    return {
      userId,
      displayName,
      channelsAvailable,
      selectedChannel: 'email',
      contactEligible: true,
      destination: userEmail
    };
  }

  // Case: Zero available channels
  let reason = 'No available communication channel';
  if (rawPhone && waConsent === 'opted_out') {
    reason = 'Opted out of WhatsApp';
  } else if (rawPhone && waConsent !== 'opted_in') {
    reason = 'No WhatsApp opt-in on file';
  } else if (!rawPhone) {
    reason = 'No valid phone number';
  }

  return {
    userId,
    displayName,
    channelsAvailable,
    selectedChannel: 'none',
    contactEligible: false,
    reasonIfUnavailable: reason
  };
}
