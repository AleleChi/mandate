import React, { useEffect, useState } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';
import {
  isAppInstalled,
  isPromptDismissed,
  dismissPwaPrompt,
  promptPwaInstall,
  subscribeToInstallableChange
} from '../../utils/pwaInstall';

export const PwaInstallBanner: React.FC = () => {
  const [canInstall, setCanInstall] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);
  const [showIosGuide, setShowIosGuide] = useState(false);

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
    // Only show iOS guide if requested even if banner is closed
    if (!showIosGuide) return null;
  }

  const handleInstallClick = async () => {
    const outcome = await promptPwaInstall();
    if (outcome === 'ios') {
      setShowIosGuide(true);
    } else if (outcome === 'accepted' || outcome === 'dismissed') {
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
          data-component-version="pwa-install-banner-v1"
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
                Get quicker access and receive event updates on this device.
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

      {/* iOS Safari Manual Instructions Modal */}
      {showIosGuide && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl border border-zinc-100 space-y-4 font-sans animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">
                Install on iPhone or iPad
              </h3>
              <button
                onClick={() => setShowIosGuide(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg cursor-pointer"
                aria-label="Close guide"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

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
                  <p className="text-[11px] text-zinc-500 mt-0.5">Scroll down and select "Add to Home Screen".</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIosGuide(false)}
              className="w-full py-2.5 bg-[#18181B] text-white text-xs font-medium rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
