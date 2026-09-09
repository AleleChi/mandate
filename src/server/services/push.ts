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

export async function sendWebPush(userId: string, payload: { title: string; body: string; metadata?: any }): Promise<{ success: boolean; sentCount: number; noSubscriptions?: boolean; error?: string }> {
  const isConfigured = await ensureVapidKeysLoaded();
  if (!isConfigured) {
    console.error(`[WebPush] VAPID keys not initialized for userId=${userId.slice(0, 8)}`);
    return { success: false, sentCount: 0, error: 'WebPush is not configured and key initialization failed' };
  }

  // Retrieve subscriptions for this user that are not revoked
  const subscriptions = await query('SELECT * FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL', [userId]);

  if (subscriptions.length === 0) {
    console.warn(`[WebPush] No active subscriptions found for userId=${userId.slice(0, 8)}`);
    // noSubscriptions=true distinguishes this from a send failure
    return { success: false, sentCount: 0, noSubscriptions: true };
  }

  console.log(`[WebPush] Attempting push to ${subscriptions.length} subscription(s) for userId=${userId.slice(0, 8)}`);

  let sentCount = 0;
  let failures: string[] = [];

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
        console.warn(`[WebPush] Subscription ${sub.id.slice(0, 12)} expired (${statusCode}): ${errBody}. Removing.`);
        await execute('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
      } else if (statusCode === 401 || statusCode === 403) {
        // VAPID or auth mismatch — do NOT delete subscription
        console.error(`[WebPush] Auth/VAPID error (${statusCode}) for subscription ${sub.id.slice(0, 12)}: ${errBody}`);
        failures.push(`VAPID_AUTH_ERROR(${statusCode}): ${err.message}`);
      } else if (statusCode === 429) {
        console.error(`[WebPush] Rate limited (429) for subscription ${sub.id.slice(0, 12)}`);
        failures.push(`RATE_LIMITED(429): ${err.message}`);
      } else {
        console.error(`[WebPush] Failed (${statusCode || 'no-status'}) for subscription ${sub.id.slice(0, 12)}: ${err.message}`);
        failures.push(`ERROR(${statusCode || 'network'}): ${err.message}`);
      }
    }
  }

  const hasFailures = failures.length > 0;
  const result = {
    success: sentCount > 0,
    sentCount,
    error: hasFailures ? failures.join('; ') : undefined
  };

  console.log(`[WebPush] Result for userId=${userId.slice(0, 8)}: sent=${sentCount}, failures=${failures.length}`);
  return result;
}
