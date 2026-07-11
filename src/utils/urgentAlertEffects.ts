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

const SPOKEN_ALERTS_KEY = 'koinonia_spoken_once_alerts';

function getSpokenOnceAlertIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(SPOKEN_ALERTS_KEY);
    if (stored) {
      const arr = JSON.parse(stored);
      if (Array.isArray(arr)) {
        return new Set(arr);
      }
    }
  } catch (e) {
    console.warn('Failed to parse spoken once alerts:', e);
  }
  return new Set();
}

function saveSpokenOnceAlertIds(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SPOKEN_ALERTS_KEY, JSON.stringify(Array.from(ids)));
  } catch (e) {
    console.warn('Failed to save spoken once alerts:', e);
  }
}

let alarmInterval: any = null;
let currentActiveAlerts: any[] = [];
let isFirstSync = true;

let isPlayingSequence = false;
let sequenceTimeout: any = null;
let lastSpokenTime = 0;

export function getCategoryLabel(category: string): string {
  const mapping: Record<string, string> = {
    medical_support: 'Medical support',
    pickup_issue: 'Pickup concern',
    security_concern: 'Security concern',
    pass_issue: 'Pass/check-in concern',
    child_care: 'Child care concern',
    location_support: 'Location support',
    other: 'Other support'
  };
  return mapping[category] || category || 'Other support';
}

export function getSpokenCategoryLabel(category?: string): string | null {
  if (!category) return null;
  const mapping: Record<string, string> = {
    medical_support: 'medical support',
    security_concern: 'security support',
    pickup_issue: 'pickup support',
    pass_issue: 'pass and check-in support',
    child_care: 'child care support',
    general_help: 'immediate support',
    other: 'immediate support'
  };
  return mapping[category] || null;
}

export function generateSpokenAlertText(alert: any, mode: 'private' | 'event' | 'full_context' = 'private'): string {
  if (!alert) return 'Urgent help needed. Open the app now.';
  
  // Extract child first name
  let childFirstName = '';
  if (alert.child_first_name) {
    childFirstName = alert.child_first_name;
  } else if (alert.child_name) {
    const parts = alert.child_name.trim().split(/\s+/);
    if (parts.length > 1 && (parts[0].toLowerCase() === 'baby' || parts[0].toLowerCase() === 'child')) {
      childFirstName = `${parts[0]} ${parts[1]}`;
    } else {
      childFirstName = parts[0];
    }
  }

  // Extract category label using mapping
  const categoryLabel = getSpokenCategoryLabel(alert.category) || 'immediate support';
  // Extract location label
  const rawLocation = alert.location || alert.location_label || '';
  let formattedLocation = rawLocation.trim();
  if (formattedLocation) {
    if (!/^(the|at|in|on)\b/i.test(formattedLocation)) {
      formattedLocation = 'the ' + formattedLocation;
    }
  }

  // Private Mode
  if (mode === 'private') {
    return 'Urgent help needed. Open the app now.';
  }

  // Event Mode
  if (mode === 'event') {
    if (formattedLocation) {
      return `Urgent ${categoryLabel} is required at ${formattedLocation}. Open the app now.`;
    } else {
      return `Urgent ${categoryLabel} is required. Open the app now.`;
    }
  }

  // Child first-name (full_context) Mode
  if (mode === 'full_context') {
    if (childFirstName) {
      // Capitalize first letter of categoryLabel
      const capCategory = categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1);
      if (formattedLocation) {
        return `Urgent help needed for ${childFirstName}. ${capCategory} is required at ${formattedLocation}. Open the app now.`;
      } else {
        return `Urgent help needed for ${childFirstName}. ${capCategory} is required. Open the app now.`;
      }
    } else {
      // Fallback if no child is linked
      return 'Urgent help needed. A volunteer has requested immediate support. Open the app now.';
    }
  }

  return 'Urgent help needed. Open the app now.';
}

export function speakAlert(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Volume based on alertVolume preference
    const selectedVolume = localStorage.getItem('koinonia_alert_volume') || 'standard';
    let vol = 1.0;
    if (selectedVolume === 'loud') {
      vol = 1.0;
    } else if (selectedVolume === 'very_loud') {
      vol = 1.0;
    }
    utterance.volume = vol;
    
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('Speech error:', e);
  }
}

export function stopSpeaking() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
  } catch (e) {}
}

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

  hasUnsoundedUrgentOnLoad() {
    const silenced = getSilencedAlertIds();
    return currentActiveAlerts.some(
      a => a.severity === 'urgent' && a.status === 'open' && !silenced.has(a.id) && soundedAlertIds.has(a.id)
    );
  },

  resumeOnLoadAlerts() {
    currentActiveAlerts.forEach(a => {
      if (a.severity === 'urgent' && a.status === 'open') {
        soundedAlertIds.delete(a.id);
      }
    });
    this.evaluateEffects();
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
          // Play the first urgent alarm pattern
          if (sndPref) {
            try { playSound('emergency'); } catch (_) {}
          }
          if (vibePref && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try { navigator.vibrate([200, 100, 200, 100, 500]); } catch (_) {}
          }

          const spokenEnabled = localStorage.getItem('koinonia_spoken_alerts_enabled') === 'true';
          const targetAlert = newAlerts.find(a => a.severity === 'urgent') || newAlerts[0];
          const persistentSpokenIds = getSpokenOnceAlertIds();

          if (spokenEnabled && targetAlert && !persistentSpokenIds.has(targetAlert.id)) {
            // Sequence starts: 1. Play the urgent alarm pattern. 2. Pause briefly (2 seconds). 3. Speak once. 4. Resume repeating alarm.
            isPlayingSequence = true;
            if (sequenceTimeout) {
              clearTimeout(sequenceTimeout);
            }
            sequenceTimeout = setTimeout(() => {
              const spokenMode = (localStorage.getItem('koinonia_spoken_alert_mode') as any) || 'private';
              const text = generateSpokenAlertText(targetAlert, spokenMode);
              speakAlert(text);
              lastSpokenTime = Date.now();
              
              const updatedSpokenIds = getSpokenOnceAlertIds();
              updatedSpokenIds.add(targetAlert.id);
              saveSpokenOnceAlertIds(updatedSpokenIds);

              // 4. Resume the controlled repeating emergency alarm after speech (or safety fallback)
              sequenceTimeout = setTimeout(() => {
                isPlayingSequence = false;
                this.evaluateEffects();
              }, 6000);
            }, 2000); // 2-second brief pause
          } else {
            isPlayingSequence = false;
          }

          // Register these alerts as sounded so they don't trigger immediate sound again
          newAlerts.forEach(a => soundedAlertIds.add(a.id));
        } else if (hasImportant) {
          if (sndPref) {
            try { playSound('notification_gentle'); } catch (_) {}
          }
          if (vibePref && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try { navigator.vibrate([150]); } catch (_) {}
          }
          newAlerts.forEach(a => soundedAlertIds.add(a.id));
        }
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
    const isRepeatEnabled = localStorage.getItem('koinonia_device_repeat_urgent') !== 'false';

    const silenced = getSilencedAlertIds();

    // Check if there are any active, non-silenced urgent alerts in 'open' status
    const repeatingUrgentAlerts = currentActiveAlerts.filter(
      a => a.severity === 'urgent' && a.status === 'open' && !silenced.has(a.id)
    );

    if (repeatingUrgentAlerts.length > 0 && rxUrgentPref) {
      if (isRepeatEnabled) {
        if (!alarmInterval) {
          // If we are currently in the initial sequence (sound then speak), don't schedule repeating yet
          if (isPlayingSequence) {
            return;
          }

          alarmInterval = setInterval(() => {
            const latestSilenced = getSilencedAlertIds();
            const stillActive = currentActiveAlerts.filter(
              a => a.severity === 'urgent' && a.status === 'open' && !latestSilenced.has(a.id)
            );

            if (stillActive.length === 0) {
              this.stopAll();
              return;
            }

            // Do not play alarm sound if currently speaking (avoids overlap)
            if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
              return;
            }

            if (sndPref) {
              try { playSound('emergency'); } catch (_) {}
              
              // Speak repeat if enabled
              const spokenEnabled = localStorage.getItem('koinonia_spoken_alerts_enabled') === 'true';
              if (spokenEnabled && stillActive.length > 0) {
                const spokenMode = (localStorage.getItem('koinonia_spoken_alert_mode') as any) || 'private';
                const spokenRepeats = localStorage.getItem('koinonia_spoken_alert_repeats') !== 'false';
                const firstAlert = stillActive[0];
                const now = Date.now();
                
                // Repeat voice every 30 seconds if enabled
                if (spokenRepeats && (now - lastSpokenTime > 30000)) {
                  const text = generateSpokenAlertText(firstAlert, spokenMode);
                  speakAlert(text);
                  lastSpokenTime = now;
                }
              }
            }
            if (vibePref && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
              try { navigator.vibrate([200, 100, 200, 100, 500]); } catch (_) {}
            }
          }, 4000); // Highly responsive 4-second repeating cadence
          
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
    isPlayingSequence = false;
    if (sequenceTimeout) {
      clearTimeout(sequenceTimeout);
      sequenceTimeout = null;
    }
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
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch (e) {}
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(0);
      }
    } catch (e) {}
  }
};
