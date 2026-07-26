import React, { useState, useEffect } from 'react';
import { KoinoniaBirdMark } from './KoinoniaBirdMark';

interface AppLoadingScreenProps {
  message?: string;
  title?: string;
  subMessage?: string;
}

export const AppLoadingScreen: React.FC<AppLoadingScreenProps> = ({
  message,
  title,
  subMessage
}) => {
  const displayMessage = title || message || 'Preparing your workspace...';
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [showSlowNotice, setShowSlowNotice] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Show "taking longer" notice if load exceeds 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSlowNotice(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-[#FAF9F5] flex flex-col items-center justify-center p-6 select-none animate-fade-in"
      role="status"
      aria-live="polite"
      aria-label={displayMessage}
      data-component-version="app-loading-screen-v1-standard"
    >
      <div className="max-w-sm w-full flex flex-col items-center text-center space-y-6">
        {/* Restrained Bird Mark with soft scale/opacity animation */}
        <div className={prefersReducedMotion ? 'opacity-90' : 'animate-pulse transition-opacity duration-1000'}>
          <KoinoniaBirdMark size="xl" animated={!prefersReducedMotion} />
        </div>

        {/* Humanized Loading Title & Subtitle */}
        <div className="space-y-1.5">
          <h2 className="text-base font-medium text-zinc-800 tracking-tight font-sans">
            {displayMessage}
          </h2>
          {subMessage && (
            <p className="text-xs text-zinc-500 font-normal">
              {subMessage}
            </p>
          )}
          {showSlowNotice && !subMessage && (
            <p className="text-xs text-amber-700/80 font-normal animate-fade-in pt-1">
              This is taking a little longer than usual...
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
