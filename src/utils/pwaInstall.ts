// PWA installation utility
// Handles early-captured beforeinstallprompt, standalone detection, browser-specific guidance, and respectful dismissal.

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export type PwaInstallOutcome = 
  | 'accepted' 
  | 'dismissed' 
  | 'manual_ios' 
  | 'manual_browser' 
  | 'already_installed';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(canInstall: boolean) => void>();
const DISMISS_KEY = 'koinonia_pwa_install_dismissed_at';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

if (typeof window !== 'undefined') {
  // Check if early capture in index.html already received the event
  if ((window as any).__koinoniaDeferredPrompt) {
    deferredPrompt = (window as any).__koinoniaDeferredPrompt;
  }

  // Register listener for any early-captured events
  if (Array.isArray((window as any).__koinoniaPromptListeners)) {
    (window as any).__koinoniaPromptListeners.push((hasPrompt: boolean) => {
      deferredPrompt = (window as any).__koinoniaDeferredPrompt || null;
      notifyListeners();
    });
  }

  // Also listen directly in case it fires later
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    (window as any).__koinoniaDeferredPrompt = e;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    (window as any).__koinoniaDeferredPrompt = null;
    notifyListeners();
  });
}

function notifyListeners() {
  const can = isPwaInstallable() || isIosInstallable() || isAndroidInstallable();
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

export function isAndroidDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /android/.test(ua);
}

export function isIosInstallable(): boolean {
  if (isAppInstalled()) return false;
  return isIosDevice();
}

export function isAndroidInstallable(): boolean {
  if (isAppInstalled()) return false;
  return isAndroidDevice();
}

export function isPwaInstallable(): boolean {
  if (isAppInstalled()) return false;
  return Boolean(deferredPrompt || (typeof window !== 'undefined' && (window as any).__koinoniaDeferredPrompt));
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

export async function promptPwaInstall(): Promise<PwaInstallOutcome> {
  if (isAppInstalled()) return 'already_installed';

  const promptToUse = deferredPrompt || (typeof window !== 'undefined' ? (window as any).__koinoniaDeferredPrompt : null);

  if (promptToUse) {
    try {
      await promptToUse.prompt();
      const choice = await promptToUse.userChoice;
      deferredPrompt = null;
      if (typeof window !== 'undefined') (window as any).__koinoniaDeferredPrompt = null;
      notifyListeners();
      return choice.outcome;
    } catch (err) {
      console.warn('[PWA] Browser install prompt error:', err);
      // Fall through to manual guidance
    }
  }

  // Programmatic prompt unavailable — show simple browser-specific manual instructions
  if (isIosDevice()) {
    return 'manual_ios';
  }

  return 'manual_browser';
}

export function subscribeToInstallableChange(callback: (canInstall: boolean) => void): () => void {
  listeners.add(callback);
  callback(isPwaInstallable() || isIosInstallable() || isAndroidInstallable());
  return () => {
    listeners.delete(callback);
  };
}
