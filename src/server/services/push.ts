import webpush from 'web-push';
import { query, execute } from '../db';

let vapidKeysInitialized = false;
let generatedKeys: { publicKey: string; privateKey: string } | null = null;

function initVapidKeys(): boolean {
  if (vapidKeysInitialized) return true;

  let publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:info@koinoniachildrenandteens.org';

  if (!publicKey || !privateKey) {
    if (!generatedKeys) {
      try {
        generatedKeys = webpush.generateVAPIDKeys();
        console.log('[WebPush] Generated on-the-fly VAPID keys for development/preview. Public Key:', generatedKeys.publicKey);
      } catch (err) {
        console.error('[WebPush] Failed to generate dynamic VAPID keys:', err);
        return false;
      }
    }
    publicKey = generatedKeys.publicKey;
    privateKey = generatedKeys.privateKey;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidKeysInitialized = true;
    return true;
  } catch (err) {
    console.error('[WebPush] Error setting VAPID details:', err);
     vapidKeysInitialized = false;
    return false;
  }
}

export function getVapidPublicKey(): string {
  initVapidKeys();
  return process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || generatedKeys?.publicKey || '';
}

export async function sendWebPush(userId: string, payload: { title: string; body: string; metadata?: any }): Promise<{ success: boolean; sentCount: number; error?: string }> {
  const isConfigured = initVapidKeys();
  if (!isConfigured) {
    return { success: false, sentCount: 0, error: 'WebPush is not configured and on-the-fly keys generation failed' };
  }

  // Retrieve subscriptions for this user
  const subscriptions = await query('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId]);
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
      // If subscription is expired or invalid (404 or 410 Gone), remove it from DB automatically
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log(`[WebPush] Removing expired subscription ${sub.id}`);
        await execute('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
      } else {
        failures.push(err.message || String(err));
      }
    }
  }

  return {
    success: failures.length === 0,
    sentCount,
    error: failures.length > 0 ? failures.join('; ') : undefined
  };
}
