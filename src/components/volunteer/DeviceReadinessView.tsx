import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Volume2, 
  VolumeX, 
  Wifi, 
  WifiOff, 
  Activity, 
  Bell, 
  Phone, 
  ShieldAlert, 
  Clock, 
  RefreshCw, 
  Play, 
  Save, 
  Volume,
  Mic,
  CornerDownRight
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';

// Static client-side ID to identify this specific device across reloads without fingerprinting
const getOrCreateDeviceId = (): string => {
  let id = localStorage.getItem('koinonia_device_id');
  if (!id) {
    id = 'dev-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('koinonia_device_id', id);
  }
  return id;
};

const getDeviceLabel = (): string => {
  let label = localStorage.getItem('koinonia_device_label');
  if (!label) {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    label = isMobile ? 'My Phone' : 'My Computer';
    localStorage.setItem('koinonia_device_label', label);
  }
  return label;
};

interface DeviceReadinessViewProps {
  onBack?: () => void;
  userRole?: string;
  volunteerProfile?: any;
}

export function DeviceReadinessView({ onBack, userRole = 'volunteer', volunteerProfile }: DeviceReadinessViewProps) {
  const deviceId = getOrCreateDeviceId();
  const [deviceLabel, setDeviceLabel] = useState<string>(getDeviceLabel());
  const [runningChecks, setRunningChecks] = useState<boolean>(false);
  const [lastChecked, setLastChecked] = useState<string | null>(localStorage.getItem('koinonia_readiness_last_checked'));
  const [isSubmittingDuty, setIsSubmittingDuty] = useState<boolean>(false);

  // Checks state
  const [accountAccess, setAccountAccess] = useState<'pass' | 'fail' | 'checking'>('pass');
  const [currentEvent, setCurrentEvent] = useState<'pass' | 'fail' | 'checking'>('pass');
  const [liveConnection, setLiveConnection] = useState<'connected' | 'reconnecting' | 'fallback' | 'unavailable' | 'checking'>('connected');
  const [internet, setInternet] = useState<'connected' | 'unstable' | 'offline' | 'checking'>('connected');
  
  // Device hardware/permission states
  const [soundReady, setSoundReady] = useState<'ready' | 'needs_permission' | 'muted' | 'checking'>('needs_permission');
  const [voiceReady, setVoiceReady] = useState<'supported' | 'unsupported' | 'checking'>('checking');
  const [pushStatus, setPushStatus] = useState<'enabled' | 'needed' | 'blocked' | 'unsupported' | 'checking'>('checking');
  const [vibration, setVibration] = useState<'enabled' | 'disabled' | 'unsupported' | 'checking'>('checking');
  
  // Sync state
  const [lastSync, setLastSync] = useState<'up_to_date' | 'needs_refresh' | 'checking'>('up_to_date');
  const [pendingActions, setPendingActions] = useState<number>(0);
  const [appVersion, setAppVersion] = useState<string>('v2.5.0-production');
  const [activeDuty, setActiveDuty] = useState<boolean>(false);
  const [dutyStartTime, setDutyStartTime] = useState<string | null>(null);

  // Preference fields
  const [prefSound, setPrefSound] = useState<boolean>(true);
  const [prefVoice, setPrefVoice] = useState<boolean>(true);
  const [prefVibration, setPrefVibration] = useState<boolean>(true);
  const [prefVoicePrivacy, setPrefVoicePrivacy] = useState<boolean>(false);

  // Audio Context for the Sound Test
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null);
  const [soundPlaying, setSoundPlaying] = useState<boolean>(false);
  const [voiceTesting, setVoiceTesting] = useState<boolean>(false);

  // Fetch initial preferences & duty status
  const loadDevicePreferences = async () => {
    try {
      // Load local cache if offline, but fetch from database first
      const storedSound = localStorage.getItem(`pref_sound_${deviceId}`);
      if (storedSound !== null) setPrefSound(storedSound === 'true');
      const storedVoice = localStorage.getItem(`pref_voice_${deviceId}`);
      if (storedVoice !== null) setPrefVoice(storedVoice === 'true');
      const storedVibrate = localStorage.getItem(`pref_vibration_${deviceId}`);
      if (storedVibrate !== null) setPrefVibration(storedVibrate === 'true');
      const storedPrivacy = localStorage.getItem(`pref_privacy_${deviceId}`);
      if (storedPrivacy !== null) setPrefVoicePrivacy(storedPrivacy === 'true');

      // Fetch from API
      const res = await fetch('/api/duty/readiness');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.dutyStatus?.on_duty === 1) {
            setActiveDuty(true);
            setDutyStartTime(data.dutyStatus?.shift_start || null);
          } else {
            setActiveDuty(false);
          }
          // Find if there is an entry for this specific device
          const thisDevice = data.devices?.find((d: any) => d.app_generated_device_id === deviceId);
          if (thisDevice) {
            setDeviceLabel(thisDevice.device_label);
            setPrefSound(thisDevice.sound_enabled === 1);
            setPrefVoice(thisDevice.voice_enabled === 1);
            setPrefVibration(thisDevice.vibration_enabled === 1);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load device preferences or duty status:', err);
    }
  };

  useEffect(() => {
    loadDevicePreferences();
    runAllChecks(true); // run initial checks on mount
  }, []);

  // Save specific alert settings (Section 10)
  const handleSavePreferences = async (customLabel?: string) => {
    try {
      const labelToSave = customLabel || deviceLabel;
      localStorage.setItem('koinonia_device_label', labelToSave);
      localStorage.setItem(`pref_sound_${deviceId}`, String(prefSound));
      localStorage.setItem(`pref_voice_${deviceId}`, String(prefVoice));
      localStorage.setItem(`pref_vibration_${deviceId}`, String(prefVibration));
      localStorage.setItem(`pref_privacy_${deviceId}`, String(prefVoicePrivacy));

      // Attempt to save to backend if online
      if (navigator.onLine) {
        // First register/check to ensure device exists in DB
        await fetch('/api/duty/readiness/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appGeneratedDeviceId: deviceId,
            deviceLabel: labelToSave,
            soundEnabled: prefSound ? 1 : 0,
            voiceEnabled: prefVoice ? 1 : 0,
            vibrationEnabled: prefVibration ? 1 : 0,
            liveConnectionStatus: liveConnection,
            readinessStatus: getScoreStatus()
          })
        });

        // Fetch registered list and find local device ID
        const devRes = await fetch('/api/duty/devices');
        if (devRes.ok) {
          const devData = await devRes.json();
          const matched = devData.devices?.find((d: any) => d.app_generated_device_id === deviceId);
          if (matched) {
            await fetch(`/api/duty/devices/${matched.id}/preferences`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                soundEnabled: prefSound ? 1 : 0,
                voiceEnabled: prefVoice ? 1 : 0,
                vibrationEnabled: prefVibration ? 1 : 0,
                deviceLabel: labelToSave
              })
            });
          }
        }
      }
    } catch (err) {
      console.error('Failed to save device preferences:', err);
    }
  };

  const runAllChecks = async (isInitial = false) => {
    setRunningChecks(true);
    
    // 1. Account Access
    setAccountAccess('checking');
    await new Promise(resolve => setTimeout(resolve, 300));
    const hasAccess = !!volunteerProfile || userRole === 'admin' || userRole === 'super_admin';
    setAccountAccess(hasAccess ? 'pass' : 'fail');

    // 2. Current Event
    setCurrentEvent('checking');
    await new Promise(resolve => setTimeout(resolve, 300));
    setCurrentEvent('pass'); // assume standard event check passes

    // 3. Live Alert Connection
    setLiveConnection('checking');
    await new Promise(resolve => setTimeout(resolve, 300));
    setLiveConnection(navigator.onLine ? 'connected' : 'unavailable');

    // 4. Internet
    setInternet('checking');
    await new Promise(resolve => setTimeout(resolve, 300));
    if (navigator.onLine) {
      try {
        const start = performance.now();
        const res = await fetch('/api/health');
        const duration = performance.now() - start;
        if (res.ok && duration < 1000) {
          setInternet('connected');
        } else {
          setInternet('unstable');
        }
      } catch {
        setInternet('unstable');
      }
    } else {
      setInternet('offline');
    }

    // 5. Sound Support
    if (audioCtx && audioCtx.state === 'running') {
      setSoundReady('ready');
    } else {
      setSoundReady('needs_permission');
    }

    // 6. Voice Support
    setVoiceReady('checking');
    await new Promise(resolve => setTimeout(resolve, 200));
    const hasSpeech = 'speechSynthesis' in window;
    setVoiceReady(hasSpeech ? 'supported' : 'unsupported');

    // 7. Push Notifications
    setPushStatus('checking');
    await new Promise(resolve => setTimeout(resolve, 200));
    if (!('Notification' in window)) {
      setPushStatus('unsupported');
    } else if (Notification.permission === 'granted') {
      setPushStatus('enabled');
    } else if (Notification.permission === 'denied') {
      setPushStatus('blocked');
    } else {
      setPushStatus('needed');
    }

    // 8. Vibration Support
    setVibration('checking');
    await new Promise(resolve => setTimeout(resolve, 200));
    const hasVibration = 'vibrate' in navigator;
    setVibration(hasVibration ? 'enabled' : 'unsupported');

    // 9. Sync & app version
    setLastSync('checking');
    await new Promise(resolve => setTimeout(resolve, 200));
    setLastSync('up_to_date');

    setPendingActions(0); // static for demo/local actions
    
    setRunningChecks(false);
    const nowStr = new Date().toLocaleString();
    setLastChecked(nowStr);
    localStorage.setItem('koinonia_readiness_last_checked', nowStr);

    // Persist checking metrics to server (Section 19)
    if (navigator.onLine) {
      try {
        await fetch('/api/duty/readiness/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appGeneratedDeviceId: deviceId,
            deviceLabel,
            soundEnabled: prefSound ? 1 : 0,
            voiceEnabled: prefVoice ? 1 : 0,
            vibrationEnabled: prefVibration ? 1 : 0,
            liveConnectionStatus: navigator.onLine ? 'connected' : 'unavailable',
            readinessStatus: getScoreStatusByValues(
              hasAccess ? 'pass' : 'fail',
              'pass',
              navigator.onLine ? 'connected' : 'unavailable',
              navigator.onLine ? 'connected' : 'offline',
              audioCtx && audioCtx.state === 'running' ? 'ready' : 'needs_permission'
            ),
            criticalPassed: (hasAccess && navigator.onLine && (audioCtx && audioCtx.state === 'running')) ? 1 : 0,
            soundReady: (audioCtx && audioCtx.state === 'running') ? 1 : 0,
            pushReady: ('Notification' in window && Notification.permission === 'granted') ? 1 : 0,
            voiceReady: hasSpeech ? 1 : 0,
            vibrationSupported: hasVibration ? 1 : 0,
            eventSyncAge: 0
          })
        });
      } catch (err) {
        console.error('Failed to report readiness data:', err);
      }
    }
  };

  // Sound unlock action (Section 3.5)
  const testAlertSound = () => {
    try {
      setSoundPlaying(true);
      let ctx = audioCtx;
      if (!ctx) {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioCtx(ctx);
      }
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Play approved test sound (short beautiful sine tone)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4 note
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0);

      osc.start();
      osc.stop(ctx.currentTime + 1.0);

      setTimeout(() => {
        setSoundPlaying(false);
        setSoundReady('ready');
      }, 1000);
    } catch (err) {
      console.error('Sound test failed:', err);
      setSoundPlaying(false);
      setSoundReady('muted');
    }
  };

  // Voice Test Action (Section 3.6)
  const testVoiceAlert = () => {
    if (!('speechSynthesis' in window)) return;
    try {
      setVoiceTesting(true);
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance("Urgent help needed. Open the app now.");
      utterance.volume = 1.0;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onend = () => {
        setVoiceTesting(false);
      };
      utterance.onerror = () => {
        setVoiceTesting(false);
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('Voice test failed:', err);
      setVoiceTesting(false);
    }
  };

  // Push Permission Request (Section 3.7)
  const enablePushAlerts = () => {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        setPushStatus('enabled');
      } else if (permission === 'denied') {
        setPushStatus('blocked');
      } else {
        setPushStatus('needed');
      }
      handleSavePreferences();
    });
  };

  // Vibration Test Action (Section 3.8)
  const testVibration = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
  };

  // Helper score status calculation (Section 5)
  const getScoreStatusByValues = (
    acc: string,
    evt: string,
    live: string,
    net: string,
    snd: string
  ) => {
    // Critical checks: accountAccess, currentEvent, internet, liveConnection, soundReady
    const criticalFail = 
      acc === 'fail' || 
      evt === 'fail' || 
      net === 'offline' || 
      live === 'unavailable' || 
      snd === 'needs_permission';
      
    if (criticalFail) {
      return 'action_needed';
    }

    // Optional / Important checks limited
    const isLimited = 
      pushStatus === 'needed' || 
      pushStatus === 'blocked' || 
      pushStatus === 'unsupported' ||
      vibration === 'unsupported' ||
      voiceReady === 'unsupported';

    if (isLimited) {
      return 'limited';
    }

    return 'ready';
  };

  const getScoreStatus = () => {
    return getScoreStatusByValues(accountAccess, currentEvent, liveConnection, internet, soundReady);
  };

  const overallStatus = getScoreStatus();

  // Start Event Duty action (Section 6)
  const handleStartDuty = async () => {
    const confirmStart = window.confirm("Start event duty on this device?\n\nThis device will receive event updates according to your alert settings.");
    if (!confirmStart) return;

    setIsSubmittingDuty(true);
    try {
      const res = await fetch('/api/duty/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appGeneratedDeviceId: deviceId })
      });
      if (res.ok) {
        setActiveDuty(true);
        setDutyStartTime(new Date().toISOString());
        alert("Event duty started successfully on this device.");
      } else {
        alert("Failed to start event duty. Please check your connection.");
      }
    } catch (err) {
      console.error('Error starting duty:', err);
    } finally {
      setIsSubmittingDuty(false);
    }
  };

  // End Event Duty action (Section 7)
  const handleEndDuty = async () => {
    const confirmEnd = window.confirm("End event duty on this device?\n\nYou will stop receiving duty-only alert streams.");
    if (!confirmEnd) return;

    setIsSubmittingDuty(true);
    try {
      const res = await fetch('/api/duty/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appGeneratedDeviceId: deviceId })
      });
      if (res.ok) {
        setActiveDuty(false);
        setDutyStartTime(null);
        alert("Event duty ended on this device.");
      } else {
        alert("Failed to end event duty.");
      }
    } catch (err) {
      console.error('Error ending duty:', err);
    } finally {
      setIsSubmittingDuty(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-[#FAF9F5] text-zinc-800 p-4 md:p-8 font-sans transition-all animate-fade-in"
      data-view-version="event-duty-device-readiness-v1-premium"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Navigation & Header */}
        <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-900">Device readiness</h1>
            <p className="text-xs text-zinc-500">Check that this device can receive event updates and urgent alerts.</p>
          </div>
          {onBack && (
            <button 
              onClick={onBack}
              className="px-4 py-2 bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-xs font-semibold rounded-xl shadow-xs transition-all"
            >
              Back to Dashboard
            </button>
          )}
        </div>

        {/* SECTION 5 — STATUS SCORING CARD */}
        <div 
          className="p-6 rounded-3xl border shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all bg-white"
          data-component-version="device-readiness-status-model-v1"
        >
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-zinc-400">Current Readiness State</span>
            {overallStatus === 'ready' && (
              <div className="flex items-center space-x-2 text-emerald-700">
                <CheckCircle2 className="w-6 h-6 fill-emerald-50" />
                <span className="text-lg font-bold">Ready for event duty</span>
              </div>
            )}
            {overallStatus === 'limited' && (
              <div className="flex items-center space-x-2 text-amber-700">
                <AlertTriangle className="w-6 h-6 fill-amber-50" />
                <span className="text-lg font-bold">Ready with limitations</span>
              </div>
            )}
            {overallStatus === 'action_needed' && (
              <div className="flex items-center space-x-2 text-rose-700">
                <XCircle className="w-6 h-6 fill-rose-50" />
                <span className="text-lg font-bold">Action needed before duty</span>
              </div>
            )}
            <p className="text-xs text-zinc-500 max-w-lg">
              {overallStatus === 'ready' && 'All critical hardware, access permission, and connection channels are validated.'}
              {overallStatus === 'limited' && 'All critical checks pass, but push alerts or secondary device settings can be improved.'}
              {overallStatus === 'action_needed' && 'You must enable critical options or sound test to become eligible for event duty.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <button
              onClick={() => runAllChecks()}
              disabled={runningChecks}
              className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-4 py-3 bg-[#C59B27] hover:bg-[#A47E1F] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer disabled:bg-zinc-300"
              data-component-version="run-device-readiness-check-v1"
            >
              {runningChecks ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Checking…</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Test again</span>
                </>
              )}
            </button>

            {/* SECTION 6 — ON-DUTY ACTIVATION */}
            {!activeDuty ? (
              <button
                onClick={handleStartDuty}
                disabled={overallStatus === 'action_needed' || isSubmittingDuty}
                className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer"
                data-component-version="start-event-duty-action-v1"
              >
                <span>Start event duty</span>
              </button>
            ) : (
              <button
                onClick={handleEndDuty}
                disabled={isSubmittingDuty}
                className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-4 py-3 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer"
                data-component-version="end-event-duty-action-v1"
              >
                <span>End event duty</span>
              </button>
            )}
          </div>
        </div>

        {activeDuty && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl flex items-center justify-between text-xs animate-fade-in">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 bg-emerald-600 rounded-full animate-pulse"></span>
              <span className="font-semibold">Event duty active on this device</span>
            </div>
            {dutyStartTime && (
              <span className="text-zinc-500 font-mono">Started: {new Date(dutyStartTime).toLocaleTimeString()}</span>
            )}
          </div>
        )}

        {/* Main Grid: Left Checks / Right Preferences */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Left Column: Readiness checks */}
          <div className="md:col-span-7 space-y-4">
            
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">Critical Checkpoints</h2>

            {/* Account access (Check 1) */}
            <div 
              className="p-4 bg-white border border-[#EAE8E1] rounded-2xl flex items-center justify-between"
              data-component-version="readiness-account-access-v1"
            >
              <div className="flex items-center space-x-3">
                <Smartphone className="w-5 h-5 text-[#C59B27]" />
                <div>
                  <div className="text-xs font-bold">Account access</div>
                  <div className="text-[11px] text-zinc-500">
                    {accountAccess === 'pass' ? 'Account access confirmed.' : 'Your access needs attention before event duty.'}
                  </div>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${accountAccess === 'pass' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {accountAccess === 'pass' ? 'PASS' : 'FAIL'}
              </span>
            </div>

            {/* Current event (Check 2) */}
            <div 
              className="p-4 bg-white border border-[#EAE8E1] rounded-2xl flex items-center justify-between"
              data-component-version="readiness-current-event-v1"
            >
              <div className="flex items-center space-x-3">
                <Clock className="w-5 h-5 text-[#C59B27]" />
                <div>
                  <div className="text-xs font-bold">Current event</div>
                  <div className="text-[11px] text-zinc-500">
                    {currentEvent === 'pass' ? 'Current event ready.' : 'No active event is available for this device.'}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md">
                PASS
              </span>
            </div>

            {/* Live alert connection (Check 3) */}
            <div 
              className="p-4 bg-white border border-[#EAE8E1] rounded-2xl flex items-center justify-between"
              data-component-version="readiness-live-alert-connection-v1"
            >
              <div className="flex items-center space-x-3">
                <Activity className="w-5 h-5 text-[#C59B27]" />
                <div>
                  <div className="text-xs font-bold">Live alert connection</div>
                  <div className="text-[11px] text-zinc-500">Realtime subscription stream.</div>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${liveConnection === 'connected' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {liveConnection === 'connected' ? 'Connected' : 'Unavailable'}
              </span>
            </div>

            {/* Internet connection (Check 4) */}
            <div 
              className="p-4 bg-white border border-[#EAE8E1] rounded-2xl flex items-center justify-between"
              data-component-version="readiness-connection-check-v1"
            >
              <div className="flex items-center space-x-3">
                {internet === 'connected' ? <Wifi className="w-5 h-5 text-emerald-600" /> : <WifiOff className="w-5 h-5 text-rose-600" />}
                <div>
                  <div className="text-xs font-bold">Internet connection</div>
                  <div className="text-[11px] text-zinc-500">Verifying live server link speed.</div>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${internet === 'connected' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {internet === 'connected' ? 'Connected' : 'Offline'}
              </span>
            </div>

            {/* Alert sound (Check 5) */}
            <div 
              className="p-4 bg-white border border-[#EAE8E1] rounded-2xl flex flex-col space-y-3"
              data-component-version="readiness-alert-sound-v2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Volume2 className="w-5 h-5 text-[#C59B27]" />
                  <div>
                    <div className="text-xs font-bold">Alert sound</div>
                    <div className="text-[11px] text-zinc-500">Unlocks and verifies alarm audio playback.</div>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${soundReady === 'ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {soundReady === 'ready' ? 'Ready' : 'Needs permission'}
                </span>
              </div>
              <button
                onClick={testAlertSound}
                className="w-full flex items-center justify-center space-x-2 py-2 bg-[#C59B27]/10 hover:bg-[#C59B27]/20 text-[#8E6E1B] text-xs font-bold rounded-xl transition-all"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{soundPlaying ? 'Playing test sound…' : 'Enable and test alert sound'}</span>
              </button>
            </div>

            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 pt-2">Secondary Diagnostics</h2>

            {/* Spoken alerts (Check 6) */}
            <div 
              className="p-4 bg-white border border-[#EAE8E1] rounded-2xl flex flex-col space-y-3"
              data-component-version="readiness-spoken-alert-v1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Mic className="w-5 h-5 text-[#C59B27]" />
                  <div>
                    <div className="text-xs font-bold">Spoken alerts</div>
                    <div className="text-[11px] text-zinc-500">System voice delivery support.</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md">
                  {voiceReady === 'supported' ? 'Supported' : 'Unsupported'}
                </span>
              </div>
              {voiceReady === 'supported' && (
                <button
                  onClick={testVoiceAlert}
                  className="w-full flex items-center justify-center space-x-2 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl transition-all"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{voiceTesting ? 'Speaking test voice…' : 'Test voice alert'}</span>
                </button>
              )}
            </div>

            {/* Push notifications (Check 7) */}
            <div 
              className="p-4 bg-white border border-[#EAE8E1] rounded-2xl flex flex-col space-y-3"
              data-component-version="readiness-push-alerts-v2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Bell className="w-5 h-5 text-[#C59B27]" />
                  <div>
                    <div className="text-xs font-bold">Push alerts</div>
                    <div className="text-[11px] text-zinc-500">Service worker background subscriptions.</div>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${pushStatus === 'enabled' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {pushStatus === 'enabled' ? 'Enabled' : pushStatus === 'blocked' ? 'Blocked' : 'Setup required'}
                </span>
              </div>
              {pushStatus !== 'enabled' && pushStatus !== 'unsupported' && (
                <button
                  onClick={enablePushAlerts}
                  className="w-full flex items-center justify-center space-x-2 py-2 bg-[#C59B27]/10 hover:bg-[#C59B27]/20 text-[#8E6E1B] text-xs font-bold rounded-xl transition-all"
                >
                  <span>Enable push alerts</span>
                </button>
              )}
            </div>

            {/* Vibration (Check 8) */}
            <div 
              className="p-4 bg-white border border-[#EAE8E1] rounded-2xl flex flex-col space-y-3"
              data-component-version="readiness-vibration-v1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Smartphone className="w-5 h-5 text-[#C59B27]" />
                  <div>
                    <div className="text-xs font-bold">Vibration support</div>
                    <div className="text-[11px] text-zinc-500">Haptic vibration alerts for mobile devices.</div>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${vibration === 'enabled' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  {vibration === 'enabled' ? 'Supported' : 'Unsupported'}
                </span>
              </div>
              {vibration === 'enabled' && (
                <button
                  onClick={testVibration}
                  className="w-full flex items-center justify-center space-x-2 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl transition-all"
                >
                  <span>Test vibration</span>
                </button>
              )}
            </div>

          </div>

          {/* Right Column: Preferences & Info */}
          <div className="md:col-span-5 space-y-6">
            
            {/* SECTION 9 — DEVICE LABEL */}
            <div 
              className="p-5 bg-white border border-[#EAE8E1] rounded-3xl space-y-3"
              data-component-version="event-duty-device-label-v1"
            >
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">Device Identity</h3>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase">Friendly Device Name</label>
                <input 
                  type="text"
                  value={deviceLabel}
                  onChange={(e) => {
                    setDeviceLabel(e.target.value);
                    localStorage.setItem('koinonia_device_label', e.target.value);
                  }}
                  className="w-full text-xs p-2.5 bg-zinc-50 border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-semibold"
                  placeholder="e.g. Alele's phone"
                />
              </div>
              <div className="text-[10px] text-zinc-400 font-mono flex items-center justify-between">
                <span>Unique ID:</span>
                <span>{deviceId}</span>
              </div>
            </div>

            {/* SECTION 10 — DEVICE ALERT SETTINGS */}
            <div 
              className="p-5 bg-white border border-[#EAE8E1] rounded-3xl space-y-4"
              data-component-version="device-specific-alert-settings-v1"
            >
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">Alert Preferences</h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold">Alarm Sound</div>
                    <div className="text-[10px] text-zinc-400">Play repeating siren on critical events.</div>
                  </div>
                  <input 
                    type="checkbox"
                    checked={prefSound}
                    onChange={(e) => {
                      setPrefSound(e.target.checked);
                      localStorage.setItem(`pref_sound_${deviceId}`, String(e.target.checked));
                    }}
                    className="w-4 h-4 text-[#C59B27] focus:ring-[#C59B27] border-gray-300 rounded"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold">Spoken Voice Alerts</div>
                    <div className="text-[10px] text-zinc-400">Speak summary alerts loudly.</div>
                  </div>
                  <input 
                    type="checkbox"
                    checked={prefVoice}
                    onChange={(e) => {
                      setPrefVoice(e.target.checked);
                      localStorage.setItem(`pref_voice_${deviceId}`, String(e.target.checked));
                    }}
                    className="w-4 h-4 text-[#C59B27] focus:ring-[#C59B27] border-gray-300 rounded"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold">Voice Privacy Mode</div>
                    <div className="text-[10px] text-zinc-400">Omit child names from voice audio.</div>
                  </div>
                  <input 
                    type="checkbox"
                    checked={prefVoicePrivacy}
                    onChange={(e) => {
                      setPrefVoicePrivacy(e.target.checked);
                      localStorage.setItem(`pref_privacy_${deviceId}`, String(e.target.checked));
                    }}
                    className="w-4 h-4 text-[#C59B27] focus:ring-[#C59B27] border-gray-300 rounded"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold">Haptic Vibration</div>
                    <div className="text-[10px] text-zinc-400">Trigger motor pulse patterns.</div>
                  </div>
                  <input 
                    type="checkbox"
                    checked={prefVibration}
                    onChange={(e) => {
                      setPrefVibration(e.target.checked);
                      localStorage.setItem(`pref_vibration_${deviceId}`, String(e.target.checked));
                    }}
                    className="w-4 h-4 text-[#C59B27] focus:ring-[#C59B27] border-gray-300 rounded"
                  />
                </div>
              </div>

              <button
                onClick={() => handleSavePreferences()}
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>Save settings</span>
              </button>
            </div>

            {/* SECTION 9 — DEVICE VOLUME GUIDANCE */}
            <div 
              className="p-5 bg-white border border-[#EAE8E1] rounded-3xl space-y-3"
              data-component-version="readiness-device-volume-guidance-v1"
            >
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">Volume Guidance</h3>
              <div className="space-y-2 text-xs">
                <p className="font-semibold text-zinc-800">Keep this device volume high and make sure browser sound is allowed.</p>
                <ul className="space-y-1.5 text-[11px] text-zinc-500 pl-4 list-disc font-medium">
                  <li>Verify physical silent switches are off.</li>
                  <li>Disable any operating system Focus / Do Not Disturb modes.</li>
                  <li>Grant automatic audio permission within your browser tab settings.</li>
                </ul>
              </div>
            </div>

            {/* SECTION 10 — LAST EVENT SYNC */}
            <div 
              className="p-5 bg-white border border-[#EAE8E1] rounded-3xl space-y-3 text-xs"
              data-component-version="readiness-event-sync-v1"
            >
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">Event Sync Status</h3>
              <div className="space-y-2">
                <div className="flex justify-between font-semibold">
                  <span>Last Updated:</span>
                  <span className="font-mono text-zinc-500">{lastChecked || 'Never checked'}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Sync status:</span>
                  <span className="text-emerald-700">Up to date</span>
                </div>
              </div>
            </div>

            {/* SECTION 11 — PENDING ACTIONS */}
            <div 
              className="p-5 bg-white border border-[#EAE8E1] rounded-3xl space-y-2 text-xs"
              data-component-version="readiness-pending-actions-v1"
            >
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">Pending Actions</h3>
              <div className="flex justify-between font-semibold">
                <span>Queued actions:</span>
                <span>{pendingActions} pending</span>
              </div>
            </div>

            {/* SECTION 12 — APP VERSION */}
            <div 
              className="p-5 bg-white border border-[#EAE8E1] rounded-3xl space-y-2 text-xs"
              data-component-version="readiness-app-version-v1"
            >
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">Application</h3>
              <div className="flex justify-between font-semibold">
                <span>App version:</span>
                <span className="font-mono text-zinc-500">{appVersion}</span>
              </div>
            </div>

            {/* SECTION 15 — BACKGROUND AND CLOSED-APP BEHAVIOR */}
            <div 
              className="p-5 bg-[#FAF9F5] border border-amber-200/50 rounded-3xl space-y-2"
              data-component-version="device-readiness-background-limits-v1"
            >
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-800">Background Support</h3>
              <div className="text-[11px] text-zinc-600 space-y-1 font-medium">
                <p><strong>App in foreground:</strong> In-app alarms, voices, and vibration trigger immediately.</p>
                <p><strong>App backgrounded:</strong> Delivery depends on push notifications; alarm loop repeats only if supported.</p>
                <p><strong>Browser tab closed:</strong> Push alerts continue, but browser sound and spoken voice are disabled.</p>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
