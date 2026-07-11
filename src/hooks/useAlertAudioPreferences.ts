import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { playSound, resumeAudioContext } from '../utils/sound';

export function useAlertAudioPreferences() {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_sound_enabled') !== 'false';
    }
    return true;
  });

  const [urgentSoundProfile, setUrgentSoundProfile] = useState<'normal' | 'important' | 'emergency'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('koinonia_alert_profile') as any) || 'emergency';
    }
    return 'emergency';
  });

  const [urgentVolumeBoost, setUrgentVolumeBoost] = useState<'standard' | 'loud' | 'very_loud'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('koinonia_alert_volume') as any) || 'standard';
    }
    return 'standard';
  });

  const [repeatUrgentAlerts, setRepeatUrgentAlerts] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_repeat_urgent_alerts') !== 'false';
    }
    return true;
  });

  const [spokenAlertsEnabled, setSpokenAlertsEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_spoken_alerts_enabled') === 'true';
    }
    return false;
  });

  const [spokenAlertMode, setSpokenAlertMode] = useState<'private' | 'event' | 'full_context'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('koinonia_spoken_alert_mode') as any) || 'private';
    }
    return 'private';
  });

  const [spokenAlertRepeats, setSpokenAlertRepeats] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_spoken_alert_repeats') !== 'false';
    }
    return true;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await api.request<{
        soundEnabled: boolean;
        urgentSoundProfile?: string;
        urgentVolumeBoost?: string;
        repeatUrgentAlerts?: boolean;
        spokenAlertsEnabled?: boolean;
        spokenAlertMode?: string;
        spokenAlertRepeats?: boolean;
      }>('/api/notifications/preferences');

      if (res) {
        setSoundEnabled(res.soundEnabled);
        localStorage.setItem('koinonia_sound_enabled', String(res.soundEnabled));

        if (res.urgentSoundProfile) {
          setUrgentSoundProfile(res.urgentSoundProfile as any);
          localStorage.setItem('koinonia_alert_profile', res.urgentSoundProfile);
        }
        if (res.urgentVolumeBoost) {
          setUrgentVolumeBoost(res.urgentVolumeBoost as any);
          localStorage.setItem('koinonia_alert_volume', res.urgentVolumeBoost);
        }
        if (res.repeatUrgentAlerts !== undefined) {
          setRepeatUrgentAlerts(res.repeatUrgentAlerts);
          localStorage.setItem('koinonia_repeat_urgent_alerts', String(res.repeatUrgentAlerts));
        }
        if (res.spokenAlertsEnabled !== undefined) {
          setSpokenAlertsEnabled(res.spokenAlertsEnabled);
          localStorage.setItem('koinonia_spoken_alerts_enabled', String(res.spokenAlertsEnabled));
        }
        if (res.spokenAlertMode) {
          setSpokenAlertMode(res.spokenAlertMode as any);
          localStorage.setItem('koinonia_spoken_alert_mode', res.spokenAlertMode);
        }
        if (res.spokenAlertRepeats !== undefined) {
          setSpokenAlertRepeats(res.spokenAlertRepeats);
          localStorage.setItem('koinonia_spoken_alert_repeats', String(res.spokenAlertRepeats));
        }
      }
    } catch (err) {
      console.warn('Preferences fetch failed inside useAlertAudioPreferences:', err);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreference = useCallback(async (key: string, value: any) => {
    // 1. Optimistic update
    if (typeof window !== 'undefined') {
      if (key === 'soundEnabled') {
        setSoundEnabled(!!value);
        localStorage.setItem('koinonia_sound_enabled', String(!!value));
      } else if (key === 'urgentSoundProfile') {
        setUrgentSoundProfile(value);
        localStorage.setItem('koinonia_alert_profile', value);
      } else if (key === 'urgentVolumeBoost') {
        setUrgentVolumeBoost(value);
        localStorage.setItem('koinonia_alert_volume', value);
      } else if (key === 'repeatUrgentAlerts') {
        setRepeatUrgentAlerts(!!value);
        localStorage.setItem('koinonia_repeat_urgent_alerts', String(!!value));
      } else if (key === 'spokenAlertsEnabled') {
        setSpokenAlertsEnabled(!!value);
        localStorage.setItem('koinonia_spoken_alerts_enabled', String(!!value));
      } else if (key === 'spokenAlertMode') {
        setSpokenAlertMode(value);
        localStorage.setItem('koinonia_spoken_alert_mode', value);
      } else if (key === 'spokenAlertRepeats') {
        setSpokenAlertRepeats(!!value);
        localStorage.setItem('koinonia_spoken_alert_repeats', String(!!value));
      }
    }

    // 2. Persist to server
    setIsSaving(true);
    try {
      const payload: Record<string, any> = {};
      payload[key] = value;

      await api.request('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      setLastSavedAt(new Date().toISOString());
    } catch (err) {
      console.warn('Failed to update preference on server:', err);
      // Even if server sync fails, we let client-side stay local as fallback
    } finally {
      setIsSaving(false);
    }
  }, []);

  const testEmergencySound = useCallback(() => {
    resumeAudioContext();
    playSound('emergency', { volume: urgentVolumeBoost, profile: urgentSoundProfile });
  }, [urgentVolumeBoost, urgentSoundProfile]);

  return {
    soundEnabled,
    urgentSoundProfile,
    urgentVolumeBoost,
    repeatUrgentAlerts,
    spokenAlertsEnabled,
    spokenAlertMode,
    spokenAlertRepeats,
    isSaving,
    lastSavedAt,
    updatePreference,
    testEmergencySound,
    refetch: fetchPreferences
  };
}
