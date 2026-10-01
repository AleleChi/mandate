import React, { useState, useEffect } from 'react';
import { Bell, Mail, Volume2, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import {
  getPushNotificationStatus,
  subscribeUserToPush,
  unsubscribeUserFromPush,
  PushNotificationDetails
} from '../../utils/pushSubscription';

interface SharedNotificationSettingsProps {
  role: 'volunteer' | 'parent';
  showSuccess?: (title: string, message: string) => void;
  showError?: (title: string, message: string) => void;
}

export const SharedNotificationSettings: React.FC<SharedNotificationSettingsProps> = ({
  role,
  showSuccess,
  showError
}) => {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [pushDetails, setPushDetails] = useState<PushNotificationDetails | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [emailOn, setEmailOn] = useState(true);
  const [soundOn, setSoundOn] = useState(true);

  const fetchSettings = async () => {
    try {
      const [prefs, status] = await Promise.all([
        api.parent.getNotificationPreferences().catch(() => null),
        getPushNotificationStatus()
      ]);

      if (prefs) {
        setEmailOn(prefs.emailEnabled ?? true);
        setSoundOn(prefs.soundEnabled ?? true);
        setPushOn(prefs.pushEnabled && status.status === 'enabled');
      } else {
        setPushOn(status.status === 'enabled');
      }

      setPushDetails(status);
    } catch (err) {
      console.warn('Error loading notification preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleTogglePush = async () => {
    if (!pushDetails) return;
    setActionLoading(true);

    try {
      if (pushOn) {
        // Turn off
        await unsubscribeUserFromPush();
        await api.parent.updateNotificationPreferences({ pushEnabled: false }).catch(() => {});
        setPushOn(false);
        const newStatus = await getPushNotificationStatus();
        setPushDetails(newStatus);
        if (showSuccess) {
          showSuccess('Notifications updated', 'Push notifications turned off on this device.');
        }
      } else {
        // Enable push
        const res = await subscribeUserToPush();
        if (res.success) {
          await api.parent.updateNotificationPreferences({ pushEnabled: true }).catch(() => {});
          setPushOn(true);
          const newStatus = await getPushNotificationStatus();
          setPushDetails(newStatus);
          if (showSuccess) {
            showSuccess('Notifications enabled', 'You will now receive event notices directly on this device.');
          }
        } else {
          const newStatus = await getPushNotificationStatus();
          setPushDetails(newStatus);
          if (showError) {
            showError('Could not enable notifications', res.error || 'Please check browser notification settings.');
          }
        }
      }
    } catch (err: any) {
      if (showError) {
        showError('Error', err.message || 'Failed to update notification settings.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleEmail = async () => {
    const nextVal = !emailOn;
    setEmailOn(nextVal);
    try {
      await api.parent.updateNotificationPreferences({ emailEnabled: nextVal });
    } catch (err) {
      setEmailOn(!nextVal);
      if (showError) showError('Error', 'Failed to update email notification preferences.');
    }
  };

  const handleToggleSound = async () => {
    const nextVal = !soundOn;
    setSoundOn(nextVal);
    try {
      await api.parent.updateNotificationPreferences({ soundEnabled: nextVal });
    } catch (err) {
      setSoundOn(!nextVal);
      if (showError) showError('Error', 'Failed to update sound notification preferences.');
    }
  };

  const rolePushDescription = role === 'volunteer'
    ? 'Urgent safety notices, duty locations, and team updates.'
    : 'Child selection updates, pass releases, and event announcements.';

  return (
    <div className="bg-white dark:bg-[#21211E] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] p-5 shadow-xs font-sans text-left space-y-4" data-component-version="shared-notification-settings-v1">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-[#F0EBE3]">
          Notifications
        </h3>
        <p className="text-xs text-zinc-500 dark:text-[#B8B0A5] mt-0.5 leading-relaxed">
          Choose how you receive updates about this event.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-[#7A7570] py-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9A7326]" />
          <span>Loading notification settings...</span>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-[#302E29]">
          {/* Push Notification row */}
          <div className="py-3.5 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-zinc-900 dark:text-[#F0EBE3]">Push notifications</p>
                <p className="text-[11px] text-zinc-500 dark:text-[#B8B0A5] leading-relaxed">
                  {rolePushDescription}
                </p>
              </div>

              {pushDetails?.status === 'unsupported' ? (
                <span className="text-[11px] text-zinc-400 dark:text-[#7A7570] shrink-0">
                  Not available
                </span>
              ) : pushDetails?.permission === 'denied' ? (
                <span className="text-[11px] text-zinc-400 dark:text-[#7A7570] shrink-0">
                  Blocked
                </span>
              ) : (
                <button
                  onClick={handleTogglePush}
                  disabled={actionLoading}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer shrink-0 ${
                    pushOn
                      ? 'bg-zinc-100 dark:bg-[#262520] hover:bg-zinc-200 dark:hover:bg-[#2A2926] text-zinc-700 dark:text-[#B8B0A5] border border-transparent dark:border-[#3A3835]'
                      : 'bg-[#9A7326] dark:bg-[#C59B27] hover:bg-[#7D5B18] dark:hover:bg-[#B88C22] text-white dark:text-[#1D1D1A]'
                  } disabled:opacity-50`}
                >
                  {actionLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : pushOn ? (
                    'Turn off'
                  ) : (
                    'Enable'
                  )}
                </button>
              )}
            </div>

            {/* State helper messages */}
            {pushDetails?.status === 'unsupported' ? (
              <p className="text-[11px] text-zinc-500 dark:text-[#7A7570]">
                Push notifications aren't supported on this browser.
              </p>
            ) : pushDetails?.permission === 'denied' ? (
              <p className="text-[11px] text-amber-700 dark:text-[#B8B0A5] bg-amber-50/60 dark:bg-[#262520] p-2 rounded-lg border border-amber-200/50 dark:border-[#3A3835]">
                Notifications are blocked in your browser. Use your browser settings to allow them.
              </p>
            ) : pushOn ? (
              <p className="text-[11px] text-emerald-700 dark:text-[#B8B0A5] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-[#C59B27]" />
                Push notifications are on
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400 dark:text-[#7A7570]">
                Push notifications are off
              </p>
            )}
          </div>

          {/* Email Updates row */}
          <div className="py-3.5 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-zinc-900 dark:text-[#F0EBE3]">Email updates</p>
              <p className="text-[11px] text-zinc-500 dark:text-[#B8B0A5] leading-relaxed">
                Receive important notices and summaries by email.
              </p>
            </div>
            <button
              onClick={handleToggleEmail}
              className="focus:outline-none cursor-pointer shrink-0"
              aria-label="Toggle email notifications"
            >
              <div className={`w-10 h-5.5 rounded-full transition-colors relative ${emailOn ? 'bg-[#9A7326] dark:bg-[#C59B27]' : 'bg-zinc-200 dark:bg-[#262520] border border-transparent dark:border-[#3A3835]'}`}>
                <div className={`w-4.5 h-4.5 rounded-full bg-white dark:bg-[#F0EBE3] absolute top-0.5 transition-transform shadow-xs ${emailOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </button>
          </div>

          {/* Sound Alerts row */}
          <div className="py-3.5 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-zinc-900 dark:text-[#F0EBE3]">Sound alerts</p>
              <p className="text-[11px] text-zinc-500 dark:text-[#B8B0A5] leading-relaxed">
                Play a gentle tone when notices arrive while using the app.
              </p>
            </div>
            <button
              onClick={handleToggleSound}
              className="focus:outline-none cursor-pointer shrink-0"
              aria-label="Toggle sound alerts"
            >
              <div className={`w-10 h-5.5 rounded-full transition-colors relative ${soundOn ? 'bg-[#9A7326] dark:bg-[#C59B27]' : 'bg-zinc-200 dark:bg-[#262520] border border-transparent dark:border-[#3A3835]'}`}>
                <div className={`w-4.5 h-4.5 rounded-full bg-white dark:bg-[#F0EBE3] absolute top-0.5 transition-transform shadow-xs ${soundOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
