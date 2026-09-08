// PWA installation utility
// Handles beforeinstallprompt, standalone detection, iOS guidance, and respectful dismissal.

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(canInstall: boolean) => void>();
const DISMISS_KEY = 'koinonia_pwa_install_dismissed_at';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notifyListeners();
  });
}

function notifyListeners() {
  const can = isPwaInstallable() || isIosInstallable();
  listeners.forEach((fn) => {
    try {
      fn(can);
    } catch (err) {
      console.warn('[PWA] Listener error:', err);
    }
  });
}

export function isAppInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isIosStandalone = (window.navigator as any).standalone === true;
  return isStandalone || isIosStandalone;
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

export function isIosInstallable(): boolean {
  if (isAppInstalled()) return false;
  return isIosDevice();
}

export function isPwaInstallable(): boolean {
  if (isAppInstalled()) return false;
  return Boolean(deferredPrompt);
}

export function isPromptDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const timestamp = parseInt(raw, 10);
  if (isNaN(timestamp)) return false;
  return Date.now() - timestamp < DISMISS_DURATION_MS;
}

export function dismissPwaPrompt(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DISMISS_KEY, Date.now().toString());
  notifyListeners();
}

export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | 'ios' | 'unavailable'> {
  if (isAppInstalled()) return 'unavailable';

  if (deferredPrompt) {
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      notifyListeners();
      return choice.outcome;
    } catch (err) {
      console.warn('[PWA] Prompt error:', err);
      return 'unavailable';
    }
  }

  if (isIosDevice()) {
    return 'ios';
  }

  return 'unavailable';
}

export function subscribeToInstallableChange(callback: (canInstall: boolean) => void): () => void {
  listeners.add(callback);
  callback(isPwaInstallable() || isIosInstallable());
  return () => {
    listeners.delete(callback);
  };
}
