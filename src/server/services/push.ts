import webpush from 'web-push';
import { query, queryOne, execute } from '../db';

let vapidKeysInitialized = false;
let currentPublicKey: string | null = null;
let currentPrivateKey: string | null = null;

export async function ensureVapidKeysLoaded(): Promise<boolean> {
  if (vapidKeysInitialized && currentPublicKey && currentPrivateKey) return true;

  let publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:info@koinoniachildrenandteens.org';

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
  const subject = process.env.VAPID_SUBJECT || 'mailto:info@koinoniachildrenandteens.org';

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

export async function sendWebPush(userId: string, payload: { title: string; body: string; metadata?: any }): Promise<{ success: boolean; sentCount: number; error?: string }> {
  const isConfigured = await ensureVapidKeysLoaded();
  if (!isConfigured) {
    return { success: false, sentCount: 0, error: 'WebPush is not configured and key initialization failed' };
  }

  // Retrieve subscriptions for this user that are not revoked
  const subscriptions = await query('SELECT * FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL', [userId]);
  if (subscriptions.length === 0) {
    return { success: true, sentCount: 0 };
  }

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
    } catch (err: any) {
      console.error(`[WebPush Error] Failed to send push to subscription ${sub.id}:`, err);
      // If subscription is expired or invalid (404 or 410 Gone), mark revoked/delete automatically
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log(`[WebPush] Removing expired subscription ${sub.id}`);
        await execute('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
      } else {
        failures.push(err.message || String(err));
      }
    }
  }

  return {
    success: failures.length === 0 || sentCount > 0,
    sentCount,
    error: failures.length > 0 && sentCount === 0 ? failures.join('; ') : undefined
  };
}
