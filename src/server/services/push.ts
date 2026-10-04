import webpush from 'web-push';
import { query, queryOne, execute } from '../db';

let vapidKeysInitialized = false;
let currentPublicKey: string | null = null;
let currentPrivateKey: string | null = null;

export async function ensureVapidKeysLoaded(): Promise<boolean> {
  if (vapidKeysInitialized && currentPublicKey && currentPrivateKey) return true;

  let publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:info@themandate.dontechservicesconst.com';

  if (!publicKey || !privateKey) {
    try {
      // Check database first to ensure persistent keys across restarts
      const pubRow = await queryOne('SELECT setting_value FROM admin_landing_settings WHERE setting_key = ?', ['vapid_public_key']);
      const privRow = await queryOne('SELECT setting_value FROM admin_landing_settings WHERE setting_key = ?', ['vapid_private_key']);

      if (pubRow?.setting_value && privRow?.setting_value) {
        publicKey = pubRow.setting_value;
        privateKey = privRow.setting_value;
      } else {
        // Generate new keys and save to database
        const generated = webpush.generateVAPIDKeys();
        publicKey = generated.publicKey;
        privateKey = generated.privateKey;

        const now = new Date().toISOString();
        const saveKey = async (keyName: string, keyValue: string) => {
          const exist = await queryOne('SELECT setting_key FROM admin_landing_settings WHERE setting_key = ?', [keyName]);
          if (exist) {
            await execute('UPDATE admin_landing_settings SET setting_value = ?, updated_at = ? WHERE setting_key = ?', [keyValue, now, keyName]);
          } else {
            await execute('INSERT INTO admin_landing_settings (setting_key, setting_value, value_type, updated_at) VALUES (?, ?, ?, ?)', [keyName, keyValue, 'string', now]);
          }
        };

        await saveKey('vapid_public_key', publicKey);
        await saveKey('vapid_private_key', privateKey);

        console.log('[WebPush] Generated and persisted VAPID keys to DB. Public Key:', publicKey);
      }
    } catch (err) {
      console.error('[WebPush] Error retrieving or persisting VAPID keys:', err);
      return false;
    }
  }

  try {
    webpush.setVapidDetails(subject, publicKey!, privateKey!);
    currentPublicKey = publicKey!;
    currentPrivateKey = privateKey!;
    vapidKeysInitialized = true;
    return true;
  } catch (err) {
    console.error('[WebPush] Error setting VAPID details:', err);
    vapidKeysInitialized = false;
    return false;
  }
}

export function initVapidKeys(): boolean {
  if (vapidKeysInitialized) return true;
  // Fallback sync attempt using env vars if available
  let publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:info@themandate.dontechservicesconst.com';

  if (publicKey && privateKey) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      currentPublicKey = publicKey;
      currentPrivateKey = privateKey;
      vapidKeysInitialized = true;
      return true;
    } catch (err) {
      console.error('[WebPush] Error setting VAPID details:', err);
    }
  }
  return false;
}

export async function getVapidPublicKey(): Promise<string> {
  await ensureVapidKeysLoaded();
  return currentPublicKey || process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '';
}

export interface PushSendResult {
  success: boolean;
  sentCount: number;
  failedCount: number;
  staleCount: number;
  noSubscriptions?: boolean;
  error?: string;
  failureReason?: 'no_subscription' | 'stale_subscription' | 'vapid_auth_error' | 'rate_limited' | 'network_error';
}

export async function sendWebPush(userId: string, payload: { title: string; body: string; metadata?: any }): Promise<PushSendResult> {
  const isConfigured = await ensureVapidKeysLoaded();
  if (!isConfigured) {
    console.error(`[WebPush] VAPID keys not initialized for userId=${userId.slice(0, 8)}`);
    return {
      success: false,
      sentCount: 0,
      failedCount: 1,
      staleCount: 0,
      error: 'Push notification service is not configured',
      failureReason: 'vapid_auth_error'
    };
  }

  // Retrieve active subscriptions for this user, newest first
  const subscriptions = await query('SELECT * FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC', [userId]);

  if (subscriptions.length === 0) {
    console.warn(`[WebPush] No active subscriptions found for userId=${userId.slice(0, 8)}`);
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      staleCount: 0,
      noSubscriptions: true,
      error: 'Push unavailable — no active subscription found for this parent',
      failureReason: 'no_subscription'
    };
  }

  console.log(`[WebPush] Attempting push to ${subscriptions.length} subscription(s) for userId=${userId.slice(0, 8)}`);

  let sentCount = 0;
  let staleCount = 0;
  let vapidAuthErrors = 0;
  let rateLimitErrors = 0;
  let otherErrors = 0;
  const failureDetails: string[] = [];

  for (const sub of subscriptions) {
    try {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
      sentCount++;
      console.log(`[WebPush] ✓ Delivered to subscription ${sub.id.slice(0, 12)} (ua: ${(sub.user_agent || '').slice(0, 40)})`);
    } catch (err: any) {
      const statusCode = err.statusCode;
      const errBody = err.body || '';

      if (statusCode === 404 || statusCode === 410) {
        // FCM/VAPID: subscription is unsubscribed or expired — remove safely
        staleCount++;
        console.warn(`[WebPush] Subscription ${sub.id.slice(0, 12)} expired (${statusCode}): ${errBody}. Removing.`);
        try {
          await execute('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
        } catch (delErr) {
          console.error(`[WebPush] Failed to remove expired subscription ${sub.id}:`, delErr);
        }
        failureDetails.push('Device subscription expired');
      } else if (statusCode === 401 || statusCode === 403) {
        // VAPID or auth mismatch — do NOT delete subscription
        vapidAuthErrors++;
        console.error(`[WebPush] Auth/VAPID error (${statusCode}) for subscription ${sub.id.slice(0, 12)}: ${errBody}`);
        failureDetails.push('Push service configuration error');
      } else if (statusCode === 429) {
        rateLimitErrors++;
        console.error(`[WebPush] Rate limited (429) for subscription ${sub.id.slice(0, 12)}`);
        failureDetails.push('Push service rate limit reached');
      } else {
        otherErrors++;
        console.error(`[WebPush] Failed (${statusCode || 'no-status'}) for subscription ${sub.id.slice(0, 12)}: ${err.message}`);
        failureDetails.push('Network or delivery failure');
      }
    }
  }

  const failedCount = staleCount + vapidAuthErrors + rateLimitErrors + otherErrors;
  const isSuccess = sentCount > 0;

  let failureReason: PushSendResult['failureReason'];
  let errorSummary: string | undefined;

  if (!isSuccess) {
    if (staleCount > 0 && vapidAuthErrors === 0 && otherErrors === 0) {
      failureReason = 'stale_subscription';
      errorSummary = 'Device subscription has expired. Please enable notifications on your device.';
    } else if (vapidAuthErrors > 0) {
      failureReason = 'vapid_auth_error';
      errorSummary = 'Push configuration error. Please contact the administrator.';
    } else if (rateLimitErrors > 0) {
      failureReason = 'rate_limited';
      errorSummary = 'Push notifications temporarily rate limited. Please retry in a few moments.';
    } else {
      failureReason = 'network_error';
      errorSummary = failureDetails[0] || 'Push delivery could not be completed.';
    }
  }

  const result: PushSendResult = {
    success: isSuccess,
    sentCount,
    failedCount,
    staleCount,
    error: errorSummary,
    failureReason
  };

  console.log(`[WebPush] Result for userId=${userId.slice(0, 8)}: sent=${sentCount}, failed=${failedCount}, stale=${staleCount}`);
  return result;
}
