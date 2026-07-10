// Client-side Web Audio API Sound Effects Engine
// Generates synthesized tones on the fly, avoiding any static asset load issues.

const activeContexts = new Set<AudioContext>();
const activeOscillators = new Set<OscillatorNode>();
const activeGainNodes = new Set<GainNode>();
const activeAudioElements = new Set<HTMLAudioElement>();
const activeTimeouts = new Set<any>();
const activeIntervals = new Set<any>();

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      try {
        audioCtx = new AudioContextClass();
        activeContexts.add(audioCtx);
      } catch (e) {
        console.warn('Failed to construct AudioContext:', e);
      }
    }
  }
  return audioCtx;
}

export function playSound(type: 'success' | 'error' | 'notification' | 'alert' | 'notification_gentle') {
  try {
    // Check local preference override
    const stored = localStorage.getItem('koinonia_sound_enabled');
    if (stored === 'false') return;

    const ctx = getAudioContext();
    if (!ctx) return;

    // Autoplay restrictions guard
    if (ctx.state === 'suspended') {
      return;
    }

    const playTone = (freq: number, duration: number, oscType: OscillatorType = 'sine', delay = 0) => {
      const timeoutId = setTimeout(() => {
        try {
          activeTimeouts.delete(timeoutId);
          if (!ctx || ctx.state === 'suspended') return;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          activeOscillators.add(osc);
          activeGainNodes.add(gain);

          osc.type = oscType;
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.start();
          osc.stop(ctx.currentTime + duration);

          const cleanupId = setTimeout(() => {
            activeOscillators.delete(osc);
            activeGainNodes.delete(gain);
            activeTimeouts.delete(cleanupId);
          }, duration * 1000 + 100);
          activeTimeouts.add(cleanupId);
        } catch (e) {
          console.warn('Tone play error:', e);
        }
      }, delay * 1000);
      activeTimeouts.add(timeoutId);
    };

    switch (type) {
      case 'success':
        // Clean chime: rising dual tones
        playTone(523.25, 0.15, 'sine', 0); // C5
        playTone(659.25, 0.3, 'sine', 0.08); // E5
        break;
      case 'error':
        // Double low beep
        playTone(150, 0.12, 'sawtooth', 0);
        playTone(130, 0.15, 'sawtooth', 0.15);
        break;
      case 'notification':
        // Soft, elegant premium dual-tone chime using clean sine waves
        playTone(659.25, 0.4, 'sine', 0); // E5
        playTone(987.77, 0.6, 'sine', 0.12); // B5 (fifth up, beautiful resonance)
        break;
      case 'notification_gentle':
        // Extremely gentle, low-profile double chime for in-app status updates
        playTone(523.25, 0.3, 'sine', 0); // C5
        playTone(587.33, 0.4, 'sine', 0.1); // D5
        break;
      case 'alert':
        // Warm, beautiful, and gentle major chord chime for high-priority care alerts
        playTone(523.25, 0.4, 'sine', 0); // C5
        playTone(659.25, 0.45, 'sine', 0.08); // E5
        playTone(783.99, 0.5, 'sine', 0.16); // G5
        playTone(1046.50, 0.6, 'sine', 0.24); // C6 (sparkling, highly audible but peaceful)
        break;
    }
  } catch (err) {
    console.warn('Web Audio playback error:', err);
  }
}

// Resumes or unlocks the audio context from a user interaction event (tap / click)
export function resumeAudioContext() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch((err) => console.warn('Failed to resume AudioContext:', err));
    }
  } catch (_) {}
}

export function stopAllUrgentAlertEffects() {
  console.log('[Emergency Kill Switch] stopping all AudioContext, oscillators, timers, and vibrations.');
  
  // 1. Close contexts
  activeContexts.forEach(ctx => {
    try {
      ctx.close();
    } catch (e) {
      console.warn('Error closing AudioContext:', e);
    }
  });
  activeContexts.clear();
  audioCtx = null;

  // 2. Stop and disconnect oscillators
  activeOscillators.forEach(osc => {
    try {
      osc.stop();
      osc.disconnect();
    } catch (e) {}
  });
  activeOscillators.clear();

  // 3. Disconnect gain nodes
  activeGainNodes.forEach(g => {
    try {
      g.disconnect();
    } catch (e) {}
  });
  activeGainNodes.clear();

  // 4. Pause audio elements
  activeAudioElements.forEach(aud => {
    try {
      aud.pause();
      aud.currentTime = 0;
    } catch (e) {}
  });
  activeAudioElements.clear();

  // 5. Clear timeouts
  activeTimeouts.forEach(id => {
    try {
      clearTimeout(id);
    } catch (e) {}
  });
  activeTimeouts.clear();

  // 6. Clear intervals
  activeIntervals.forEach(id => {
    try {
      clearInterval(id);
    } catch (e) {}
  });
  activeIntervals.clear();

  // 7. Clear window-registered intervals & timeouts
  if (typeof window !== 'undefined') {
    try {
      if ((window as any).koinonia_intervals) {
        (window as any).koinonia_intervals.forEach((id: any) => clearInterval(id));
        (window as any).koinonia_intervals = [];
      }
      if ((window as any).koinonia_timeouts) {
        (window as any).koinonia_timeouts.forEach((id: any) => clearTimeout(id));
        (window as any).koinonia_timeouts = [];
      }
    } catch (e) {}
  }

  // 8. Stop vibrations
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(0);
    } catch (e) {}
  }
}

// Bind globally
if (typeof window !== 'undefined') {
  (window as any).stopAllUrgentAlertEffects = stopAllUrgentAlertEffects;
}

export const soundUtility = {
  isEnabled() {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('koinonia_sound_enabled') !== 'false';
  },
  setEnabled(val: boolean) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('koinonia_sound_enabled', String(val));
  },
  playChime(force = false) {
    resumeAudioContext();
    playSound('success');
  }
};
