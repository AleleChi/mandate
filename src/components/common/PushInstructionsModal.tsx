import React, { useState } from 'react';
import { X, Bell, ShieldAlert, CheckCircle2, RefreshCw, Smartphone, Monitor, Globe, Apple } from 'lucide-react';

interface PushInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckAgain: () => Promise<void>;
  checking?: boolean;
}

export const PushInstructionsModal: React.FC<PushInstructionsModalProps> = ({
  isOpen,
  onClose,
  onCheckAgain,
  checking = false
}) => {
  const [activePlatform, setActivePlatform] = useState<'android' | 'chrome_desktop' | 'safari' | 'ios'>('android');
  const [recheckSuccess, setRecheckSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRecheck = async () => {
    setRecheckSuccess(null);
    await onCheckAgain();
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      setRecheckSuccess('Notification permission is now allowed! You can close this guide.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-[#EAE8E1] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 bg-[#FAF8F3] border-b border-[#EAE8E1] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-700">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900">Allow Blocked Notifications</h3>
              <p className="text-xs text-zinc-500">Unblock browser settings for emergency Event Duty alerts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {recheckSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-3 text-emerald-800 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{recheckSuccess}</span>
            </div>
          )}

          <p className="text-xs text-zinc-600 leading-relaxed">
            Your browser or device has blocked notification permissions. Select your platform below for simple step-by-step instructions:
          </p>

          {/* Platform Selector Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-[#F4F3EF] rounded-2xl border border-[#EAE8E1]">
            <button
              type="button"
              onClick={() => setActivePlatform('android')}
              className={`flex flex-col items-center justify-center p-2 rounded-xl text-[11px] font-bold transition-all ${
                activePlatform === 'android'
                  ? 'bg-white text-zinc-900 shadow-sm border border-[#EAE8E1]'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Smartphone className="w-4 h-4 mb-1" />
              <span>Android</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePlatform('chrome_desktop')}
              className={`flex flex-col items-center justify-center p-2 rounded-xl text-[11px] font-bold transition-all ${
                activePlatform === 'chrome_desktop'
                  ? 'bg-white text-zinc-900 shadow-sm border border-[#EAE8E1]'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Monitor className="w-4 h-4 mb-1" />
              <span>Chrome Desktop</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePlatform('safari')}
              className={`flex flex-col items-center justify-center p-2 rounded-xl text-[11px] font-bold transition-all ${
                activePlatform === 'safari'
                  ? 'bg-white text-zinc-900 shadow-sm border border-[#EAE8E1]'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Globe className="w-4 h-4 mb-1" />
              <span>Safari/macOS</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePlatform('ios')}
              className={`flex flex-col items-center justify-center p-2 rounded-xl text-[11px] font-bold transition-all ${
                activePlatform === 'ios'
                  ? 'bg-white text-zinc-900 shadow-sm border border-[#EAE8E1]'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Apple className="w-4 h-4 mb-1" />
              <span>iPhone/iPad</span>
            </button>
          </div>

          {/* Platform Steps */}
          <div className="p-4 bg-[#FAF8F3] border border-[#EAE8E1] rounded-2xl text-xs space-y-3">
            {activePlatform === 'android' && (
              <ol className="space-y-2.5 text-zinc-700 list-decimal list-inside leading-relaxed font-normal">
                <li>Tap the <strong>Lock</strong> or <strong>Tune</strong> icon on the left of the web address bar.</li>
                <li>Tap <strong>Site Settings</strong> or <strong>Permissions</strong>.</li>
                <li>Find <strong>Notifications</strong> and change setting from "Block" to <strong>Allow</strong>.</li>
                <li>Return here and tap <strong>Check again</strong> below.</li>
              </ol>
            )}

            {activePlatform === 'chrome_desktop' && (
              <ol className="space-y-2.5 text-zinc-700 list-decimal list-inside leading-relaxed font-normal">
                <li>Click the <strong>Tune/Lock</strong> icon next to the web address in your Chrome location bar.</li>
                <li>Toggle <strong>Notifications</strong> to <strong>Allow</strong> (or click <strong>Site settings</strong> → Notifications → Allow).</li>
                <li>Return here and click <strong>Check again</strong> below.</li>
              </ol>
            )}

            {activePlatform === 'safari' && (
              <ol className="space-y-2.5 text-zinc-700 list-decimal list-inside leading-relaxed font-normal">
                <li>Click <strong>Safari</strong> in the top menu bar, then choose <strong>Settings for This Website...</strong></li>
                <li>Next to <strong>Notifications</strong>, choose <strong>Allow</strong>.</li>
                <li>Or open <strong>Safari Settings</strong> → <strong>Websites</strong> → <strong>Notifications</strong> and set Koinonia to <strong>Allow</strong>.</li>
                <li>Return here and click <strong>Check again</strong> below.</li>
              </ol>
            )}

            {activePlatform === 'ios' && (
              <ol className="space-y-2.5 text-zinc-700 list-decimal list-inside leading-relaxed font-normal">
                <li>Open the main iOS <strong>Settings</strong> app on your iPhone or iPad.</li>
                <li>Scroll down and tap <strong>Koinonia</strong> (or your browser app e.g. Safari / Chrome).</li>
                <li>Tap <strong>Notifications</strong> and toggle <strong>Allow Notifications</strong> to ON.</li>
                <li>Return to Koinonia and tap <strong>Check again</strong> below.</li>
              </ol>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-5 bg-[#FAF8F3] border-t border-[#EAE8E1] flex items-center justify-between space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-zinc-600 bg-white border border-[#EAE8E1] rounded-xl hover:bg-zinc-50 transition-all cursor-pointer"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleRecheck}
            disabled={checking}
            className="flex-1 flex items-center justify-center space-x-2 py-2.5 bg-[#C59B27] hover:bg-[#8E6E1B] text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            <span>{checking ? 'Checking settings…' : 'Check again'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
