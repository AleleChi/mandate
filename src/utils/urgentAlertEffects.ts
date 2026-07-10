import { playSound, stopAllUrgentAlertEffects } from './sound';

// Device-level Silenced Alert Tracking across page reloads
const SILENCED_ALERTS_KEY = 'koinonia_silenced_alerts';

function getSilencedAlertIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(SILENCED_ALERTS_KEY);
    if (stored) {
      const arr = JSON.parse(stored);
      if (Array.isArray(arr)) {
        return new Set(arr);
      }
    }
  } catch (e) {
    console.warn('Failed to parse silenced alerts:', e);
  }
  return new Set();
}

function saveSilencedAlertIds(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SILENCED_ALERTS_KEY, JSON.stringify(Array.from(ids)));
  } catch (e) {
    console.warn('Failed to save silenced alerts:', e);
  }
}

// Keep track of which alert IDs have already triggered an initial sound feedback on this page session
const soundedAlertIds = new Set<string>();

let alarmInterval: any = null;
let currentActiveAlerts: any[] = [];
let isFirstSync = true;

export const urgentAlertEffectsManager = {
  getSilencedAlertIds() {
    return getSilencedAlertIds();
  },

  // Silence an alert on this device (Stop alert sound button or Acknowledge/Resolve actions)
  silenceAlert(alertId: string) {
    const silenced = getSilencedAlertIds();
    silenced.add(alertId);
    saveSilencedAlertIds(silenced);
    this.evaluateEffects();
  },

  unsilenceAlert(alertId: string) {
    const silenced = getSilencedAlertIds();
    silenced.delete(alertId);
    saveSilencedAlertIds(silenced);
    this.evaluateEffects();
  },

  isAlertSilenced(alertId: string): boolean {
    return getSilencedAlertIds().has(alertId);
  },

  // Sync latest alerts from any view's polling loops or fetches
  syncAlerts(alerts: any[]) {
    if (!Array.isArray(alerts)) return;

    // Filter down to active, non-resolved safety alerts
    const activeAlerts = alerts.filter(a => a.status !== 'resolved' && !a.resolved_at);

    // First-load Quiet Guard: Mark all currently open alerts on first load as already "sounded"
    // to prevent sudden loud alarms when the user opens the dashboard.
    if (isFirstSync) {
      activeAlerts.forEach(a => {
        soundedAlertIds.add(a.id);
      });
      isFirstSync = false;
    } else {
      // Subsequent syncs: detect newly arrived, un-sounded alerts
      const rxUrgentPref = localStorage.getItem('koinonia_device_receive_urgent') !== 'false';
      const sndPref = localStorage.getItem('koinonia_device_sound') !== 'false';
      const vibePref = localStorage.getItem('koinonia_device_vibration') !== 'false';
      const silenced = getSilencedAlertIds();

      const newAlerts = activeAlerts.filter(a => !soundedAlertIds.has(a.id) && !silenced.has(a.id));

      if (newAlerts.length > 0 && rxUrgentPref) {
        const hasUrgent = newAlerts.some(a => a.severity === 'urgent');
        const hasImportant = newAlerts.some(a => a.severity === 'important');

        if (hasUrgent) {
          if (sndPref) {
            try { playSound('alert'); } catch (_) {}
          }
          if (vibePref && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try { navigator.vibrate([200, 100, 200, 100, 500]); } catch (_) {}
          }
        } else if (hasImportant) {
          if (sndPref) {
            try { playSound('notification_gentle'); } catch (_) {}
          }
          if (vibePref && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try { navigator.vibrate([150]); } catch (_) {}
          }
        }

        // Register these alerts as sounded so they don't trigger immediate sound again
        newAlerts.forEach(a => soundedAlertIds.add(a.id));
      }
    }

    currentActiveAlerts = activeAlerts;
    this.evaluateEffects();
  },

  // Evaluate sound/vibration requirements based on current active alerts
  evaluateEffects() {
    const rxUrgentPref = localStorage.getItem('koinonia_device_receive_urgent') !== 'false';
    const sndPref = localStorage.getItem('koinonia_device_sound') !== 'false';
    const vibePref = localStorage.getItem('koinonia_device_vibration') !== 'false';
    const isRepeatEnabled = localStorage.getItem('koinonia_device_repeat_urgent') === 'true';

    const silenced = getSilencedAlertIds();

    // Check if there are any active, non-silenced urgent alerts in 'open' status
    const repeatingUrgentAlerts = currentActiveAlerts.filter(
      a => a.severity === 'urgent' && a.status === 'open' && !silenced.has(a.id)
    );

    if (repeatingUrgentAlerts.length > 0 && rxUrgentPref) {
      if (isRepeatEnabled) {
        if (!alarmInterval) {
          alarmInterval = setInterval(() => {
            const latestSilenced = getSilencedAlertIds();
            const stillActive = currentActiveAlerts.filter(
              a => a.severity === 'urgent' && a.status === 'open' && !latestSilenced.has(a.id)
            );

            if (stillActive.length === 0) {
              this.stopAll();
              return;
            }

            if (sndPref) {
              try { playSound('alert'); } catch (_) {}
            }
            if (vibePref && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
              try { navigator.vibrate([200, 100, 200, 100, 500]); } catch (_) {}
            }
          }, 5000);
          
          if (typeof window !== 'undefined') {
            if (!(window as any).koinonia_intervals) {
              (window as any).koinonia_intervals = [];
            }
            (window as any).koinonia_intervals.push(alarmInterval);
          }
        }
      } else {
        // Repeat is disabled, clear any active interval
        if (alarmInterval) {
          clearInterval(alarmInterval);
          if (typeof window !== 'undefined' && (window as any).koinonia_intervals) {
            (window as any).koinonia_intervals = (window as any).koinonia_intervals.filter((id: any) => id !== alarmInterval);
          }
          alarmInterval = null;
        }
      }
    } else {
      // No repeating alerts qualify, clear everything
      this.stopAll();
    }
  },

  stopAll() {
    if (alarmInterval) {
      clearInterval(alarmInterval);
      if (typeof window !== 'undefined' && (window as any).koinonia_intervals) {
        (window as any).koinonia_intervals = (window as any).koinonia_intervals.filter((id: any) => id !== alarmInterval);
      }
      alarmInterval = null;
    }
    // Fire the global audio context / oscillator / vibration stop engine
    try {
      stopAllUrgentAlertEffects();
    } catch (e) {
      console.warn('Error running stopAllUrgentAlertEffects:', e);
    }
  }
};
