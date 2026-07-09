/**
 * Koinonia Sound Utility
 * 
 * Provides sound support for in-app notifications.
 * By default, sound is strictly DISABLED (off) for all parents to respect user preferences
 * and comply with browser autoplay policies that prevent automatic audio playback before
 * user interaction.
 */

import { safeStorage } from './storage';

const SOUND_PREF_KEY = 'koinonia_notification_sound_enabled';

// Elegant default chime sound (MP3 URL)
const DEFAULT_CHIME_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-600.wav'; // Light, high-quality digital notification sound

export const soundUtility = {
  /**
   * Check if sound notifications are enabled by the user.
   * Defaults to false (off) per system rules.
   */
  isEnabled(): boolean {
    const val = safeStorage.getItem(SOUND_PREF_KEY);
    return val === 'true'; // Defaults to false if not set
  },

  /**
   * Enable or disable notification sounds.
   */
  setEnabled(enabled: boolean) {
    safeStorage.setItem(SOUND_PREF_KEY, enabled ? 'true' : 'false');
  },

  /**
   * Play the elegant notification chime.
   * Will only play if the user has explicitly turned sound ON and has interacted with the document.
   */
  async playChime(force: boolean = false): Promise<boolean> {
    if (!force && !this.isEnabled()) {
      return false; // Sound is disabled
    }

    try {
      const audio = new Audio(DEFAULT_CHIME_URL);
      audio.volume = 0.4; // Low, gentle volume
      await audio.play();
      return true;
    } catch (err) {
      // Autoplay prevented or network failure
      console.warn('[SoundUtility] Playback was prevented or failed:', err);
      return false;
    }
  }
};
