import { api } from '../services/api';

export type GranularPushStatus =
  | 'enabled'
  | 'blocked'
  | 'needed'
  | 'needs_attention'
  | 'unsupported'
  | 'sw_unavailable';

export interface PushNotificationDetails {
  status: GranularPushStatus;
  permission: NotificationPermission | 'unsupported';
  isSupported: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  subscription: PushSubscription | null;
  serverSubscribed: boolean;
  message?: string;
}

// Helper to convert base64 to Uint8Array for the browser's applicationServerKey
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Inspects current browser environment, permission status, service worker, and PushManager subscription.
 * Does NOT invoke Notification.requestPermission(), ensuring zero side effects.
 */
export async function getPushNotificationStatus(): Promise<PushNotificationDetails> {
  const hasNotification = typeof window !== 'undefined' && 'Notification' in window;
  const hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const hasPushManager = typeof window !== 'undefined' && 'PushManager' in window;

  if (!hasNotification || !hasPushManager) {
    return {
      status: 'unsupported',
      permission: 'unsupported',
      isSupported: false,
      hasServiceWorker,
      hasPushManager: false,
      subscription: null,
      serverSubscribed: false,
      message: 'Push notifications are not supported on this browser or platform.'
    };
  }

  const permission = Notification.permission;

  if (permission === 'denied') {
    return {
      status: 'blocked',
      permission: 'denied',
      isSupported: true,
      hasServiceWorker,
      hasPushManager: true,
      subscription: null,
      serverSubscribed: false,
      message: 'Notifications are blocked in your browser or device settings.'
    };
  }

  if (!hasServiceWorker) {
    return {
      status: 'sw_unavailable',
      permission,
      isSupported: true,
      hasServiceWorker: false,
      hasPushManager: true,
      subscription: null,
      serverSubscribed: false,
      message: 'Service worker is unavailable on this device.'
    };
  }

  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))
    ]);

    if (!registration || !registration.pushManager) {
      return {
        status: 'sw_unavailable',
        permission,
        isSupported: true,
        hasServiceWorker: true,
        hasPushManager: true,
        subscription: null,
        serverSubscribed: false,
        message: 'Service worker registration is not ready.'
      };
    }

    const subscription = await registration.pushManager.getSubscription();

    if (permission === 'granted') {
      if (subscription && subscription.endpoint) {
        let serverSubscribed = false;
        try {
          const res = await api.parent.getPushStatus(subscription.endpoint);
          serverSubscribed = Boolean(res?.subscribed);
        } catch (err) {
          console.warn('[PushNotificationStatus] Failed to verify subscription persistence on server:', err);
          serverSubscribed = false;
        }

        if (serverSubscribed) {
          return {
            status: 'enabled',
            permission: 'granted',
            isSupported: true,
            hasServiceWorker: true,
            hasPushManager: true,
            subscription,
            serverSubscribed: true,
            message: 'Push notifications are active on this device.'
          };
        } else {
          return {
            status: 'needs_attention',
            permission: 'granted',
            isSupported: true,
            hasServiceWorker: true,
            hasPushManager: true,
            subscription,
            serverSubscribed: false,
            message: 'Browser subscription exists, but is not confirmed on the server.'
          };
        }
      } else {
        return {
          status: 'needs_attention',
          permission: 'granted',
          isSupported: true,
          hasServiceWorker: true,
          hasPushManager: true,
          subscription: null,
          serverSubscribed: false,
          message: 'Permission is granted, but push subscription needs repair.'
        };
      }
    }

    return {
      status: 'needed',
      permission: 'default',
      isSupported: true,
      hasServiceWorker: true,
      hasPushManager: true,
      subscription: null,
      serverSubscribed: false,
      message: 'Push notifications require permission.'
    };
  } catch (err: any) {
    console.warn('[PushNotificationStatus] Check encountered an error:', err);
    return {
      status: permission === 'granted' ? 'needs_attention' : 'needed',
      permission,
      isSupported: true,
      hasServiceWorker,
      hasPushManager: true,
      subscription: null,
      serverSubscribed: false,
      message: err.message || 'Unable to inspect push status.'
    };
  }
}

/**
 * Triggers user permission prompt, inspects/creates subscription, persists to backend, and verifies persistence.
 */
export async function subscribeUserToPush(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!('Notification' in window) || !('PushManager' in window)) {
      return { success: false, error: 'Push notifications are not supported on this browser.' };
    }

    if (Notification.permission === 'denied') {
      return {
        success: false,
        error: 'Notifications are blocked in browser settings. Please allow notifications in browser settings.'
      };
    }

    if (!('serviceWorker' in navigator)) {
      return { success: false, error: 'Service worker is not active on this browser.' };
    }

    // 1. Get active service worker
    const registration = await navigator.serviceWorker.ready;
    if (!registration || !registration.pushManager) {
      return { success: false, error: 'Service worker registration is not ready.' };
    }

    // Request permission from user gesture if not already granted
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { success: false, error: 'Notification permission was not granted.' };
      }
    }

    // Retrieve VAPID Key from the server dynamically
    const keyRes = await api.parent.getVapidPublicKey();
    const publicKey = keyRes?.publicKey;
    if (!publicKey) {
      return { success: false, error: 'Push notification server key not found.' };
    }
    const appServerKey = urlBase64ToUint8Array(publicKey);

    // 2. Inspect current PushSubscription
    let subscription = await registration.pushManager.getSubscription();

    // 3. If necessary create/recreate subscription
    let needsNewSubscription = !subscription;
    if (subscription) {
      const existingKeyBuf = subscription.options?.applicationServerKey;
      if (existingKeyBuf) {
        const existingKeyArr = new Uint8Array(existingKeyBuf);
        if (existingKeyArr.length !== appServerKey.length || !existingKeyArr.every((b, i) => b === appServerKey[i])) {
          needsNewSubscription = true;
        }
      }
      const subJson = subscription.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        needsNewSubscription = true;
      }
    }

    if (needsNewSubscription) {
      if (subscription) {
        try {
          await subscription.unsubscribe();
        } catch (e) {
          console.warn('[PushSubscription] Could not unsubscribe old subscription:', e);
        }
        subscription = null;
      }

      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey
        });
      } catch (subErr: any) {
        console.warn('[PushSubscription] PushManager.subscribe failed on first try, attempting force repair:', subErr);
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          await existing.unsubscribe().catch(() => {});
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey
        });
      }
    }

    if (!subscription) {
      return { success: false, error: 'Failed to obtain browser push subscription.' };
    }

    // 4. Persist subscription to backend
    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      return { success: false, error: 'Invalid subscription details generated by browser.' };
    }

    await api.parent.savePushSubscription({
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth
      }
    });

    // 5. Verify backend persistence
    const verifyRes = await api.parent.getPushStatus(subJson.endpoint);
    if (!verifyRes?.subscribed) {
      return { success: false, error: 'Push subscription could not be confirmed on the server.' };
    }

    // 6. Only then return success
    return { success: true };
  } catch (err: any) {
    console.error('Error during push subscription:', err);
    return { success: false, error: err.message || 'Failed to complete subscription.' };
  }
}

/**
 * Reconnects/repairs push subscription with full service worker inspection and server verification.
 */
export async function repairPushSubscription(): Promise<{ success: boolean; error?: string }> {
  return subscribeUserToPush();
}

/**
 * Unsubscribes current device from PushManager and notifies backend.
 */
export async function unsubscribeUserFromPush(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { success: true };
    }

    const registration = await navigator.serviceWorker.ready;
    if (registration && registration.pushManager) {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        try {
          await api.parent.unsubscribePushSubscription(endpoint);
        } catch (_) {}
      }
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error during push unsubscription:', err);
    return { success: false, error: err.message || 'Failed to unsubscribe.' };
  }
}

/**
 * Sends a test push alert from the backend to verify push delivery end-to-end.
 */
export async function sendTestPushNotification(): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await api.parent.sendTestPush();
    if (res.success) {
      return { success: true, message: res.message || 'Test push alert sent!' };
    } else {
      return { success: false, error: res.message || 'Failed to send test push alert.' };
    }
  } catch (err: any) {
    console.error('Error triggering test push:', err);
    return { success: false, error: err.message || 'Failed to send test alert.' };
  }
}
