import React, { useEffect, useState } from 'react';
import { Download, Share, PlusSquare, MoreVertical, X, CheckCircle2 } from 'lucide-react';
import {
  isAppInstalled,
  isPromptDismissed,
  dismissPwaPrompt,
  promptPwaInstall,
  subscribeToInstallableChange,
  isIosDevice
} from '../../utils/pwaInstall';

interface PwaInstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform?: 'ios' | 'browser';
}

export const PwaInstallGuideModal: React.FC<PwaInstallGuideModalProps> = ({
  isOpen,
  onClose,
  platform
}) => {
  if (!isOpen) return null;

  const isIos = platform ? platform === 'ios' : isIosDevice();

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-guide-title"
    >
      <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl border border-zinc-100 space-y-4 font-sans animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between">
          <h3 id="install-guide-title" className="text-sm font-semibold text-zinc-900">
            {isIos ? 'Install on iPhone or iPad' : 'Install Koinonia Children & Teens'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg cursor-pointer transition-colors"
            aria-label="Close guide"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIos ? (
          <div className="space-y-3 text-xs text-zinc-700">
            <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl">
              <div className="p-1.5 bg-white rounded-lg border border-zinc-200 shrink-0">
                <Share className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <span className="font-semibold text-zinc-900">1. Tap Share</span>
                <p className="text-[11px] text-zinc-500 mt-0.5">In Safari, tap the Share icon at the bottom of your screen.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl">
              <div className="p-1.5 bg-white rounded-lg border border-zinc-200 shrink-0">
                <PlusSquare className="w-4 h-4 text-zinc-700" />
              </div>
              <div>
                <span className="font-semibold text-zinc-900">2. Choose Add to Home Screen</span>
                <p className="text-[11px] text-zinc-500 mt-0.5">Scroll down and tap &ldquo;Add to Home Screen&rdquo;.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-xs text-zinc-700">
            <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl">
              <div className="p-1.5 bg-white rounded-lg border border-zinc-200 shrink-0">
                <MoreVertical className="w-4 h-4 text-zinc-700" />
              </div>
              <div>
                <span className="font-semibold text-zinc-900">1. Open the browser menu</span>
                <p className="text-[11px] text-zinc-500 mt-0.5">Tap the menu button (three dots) in Chrome or your browser.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl">
              <div className="p-1.5 bg-white rounded-lg border border-zinc-200 shrink-0">
                <Download className="w-4 h-4 text-[#9A7326]" />
              </div>
              <div>
                <span className="font-semibold text-zinc-900">2. Choose Install app</span>
                <p className="text-[11px] text-zinc-500 mt-0.5">Select &ldquo;Install app&rdquo; or &ldquo;Add to Home screen&rdquo;.</p>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-[#18181B] text-white text-xs font-medium rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          Got it
        </button>
      </div>
    </div>
  );
};

export const PwaInstallBanner: React.FC = () => {
  const [canInstall, setCanInstall] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);
  const [guidePlatform, setGuidePlatform] = useState<'ios' | 'browser' | null>(null);

  useEffect(() => {
    if (isAppInstalled()) {
      setCanInstall(false);
      return;
    }

    setIsDismissed(isPromptDismissed());

    const unsubscribe = subscribeToInstallableChange((installable) => {
      setCanInstall(installable && !isAppInstalled());
      setIsDismissed(isPromptDismissed());
    });

    return () => unsubscribe();
  }, []);

  if (!canInstall || isDismissed) {
    if (!guidePlatform) return null;
  }

  const handleInstallClick = async () => {
    const outcome = await promptPwaInstall();
    if (outcome === 'manual_ios') {
      setGuidePlatform('ios');
    } else if (outcome === 'manual_browser') {
      setGuidePlatform('browser');
    } else if (outcome === 'accepted' || outcome === 'dismissed' || outcome === 'already_installed') {
      setIsDismissed(true);
    }
  };

  const handleDismiss = () => {
    dismissPwaPrompt();
    setIsDismissed(true);
  };

  return (
    <>
      {/* Restrained in-app install banner */}
      {!isDismissed && canInstall && (
        <div 
          className="fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto bg-white rounded-2xl p-4 border border-[#EAE8E1] shadow-lg font-sans animate-in slide-in-from-bottom duration-200"
          data-component-version="pwa-install-banner-v2"
          role="region"
          aria-label="Install app prompt"
        >
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-[#FAF6EB] text-[#9A7326] rounded-xl shrink-0">
              <Download className="w-5 h-5 stroke-[1.5]" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold text-zinc-900 leading-tight">
                Install Koinonia Children & Teens
              </h3>
              <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                Open it directly from your home screen and receive important event updates.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleInstallClick}
                  className="px-3.5 py-1.5 bg-[#9A7326] hover:bg-[#7D5B18] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Install
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
                >
                  Not now
                </button>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg transition-colors -mr-1 -mt-1 cursor-pointer"
              aria-label="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Manual Instructions Modal for iOS / Android fallback */}
      <PwaInstallGuideModal
        isOpen={Boolean(guidePlatform)}
        onClose={() => setGuidePlatform(null)}
        platform={guidePlatform || undefined}
      />
    </>
  );
};
