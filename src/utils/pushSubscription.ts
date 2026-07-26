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
      if (subscription) {
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
 * Triggers user permission prompt and subscribes the user to push notifications via PushManager.
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

    const registration = await navigator.serviceWorker.ready;
    if (!registration) {
      return { success: false, error: 'Service worker registration is not ready.' };
    }

    // Request permission from user gesture
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission was not granted.' };
    }

    // Retrieve VAPID Key from the server dynamically
    const keyRes = await api.parent.getVapidPublicKey();
    const publicKey = keyRes?.publicKey;
    if (!publicKey) {
      return { success: false, error: 'Push notification server key not found.' };
    }

    // Check existing subscription and handle potential key mismatches or stale browser push registrations
    let subscription = await registration.pushManager.getSubscription();
    const appServerKey = urlBase64ToUint8Array(publicKey);

    if (subscription) {
      try {
        // Try to obtain or refresh subscription with current server VAPID key
        await subscription.unsubscribe();
        subscription = null;
      } catch (e) {
        console.warn('[PushSubscription] Could not unsubscribe old subscription:', e);
      }
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

    // Send subscription object to backend
    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys || !subJson.keys.p256dh || !subJson.keys.auth) {
      return { success: false, error: 'Invalid subscription details generated by browser.' };
    }

    await api.parent.savePushSubscription({
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth
      }
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error during push subscription:', err);
    return { success: false, error: err.message || 'Failed to complete subscription.' };
  }
}

/**
 * Unsubscribes current device from PushManager and notifies backend.
 */
export async function repairPushSubscription(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { success: false, error: 'Push notifications are not supported on this browser.' };
    }
    const registration = await navigator.serviceWorker.ready;
    if (registration && registration.pushManager) {
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe().catch(() => {});
      }
    }
    return await subscribeUserToPush();
  } catch (err: any) {
    console.error('Error repairing push subscription:', err);
    return { success: false, error: err.message || 'Failed to repair subscription.' };
  }
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
