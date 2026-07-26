import React, { useState, useEffect } from 'react';
import { KoinoniaBirdMark } from './KoinoniaBirdMark';

interface ModuleLoadingStateProps {
  title?: string;
  supportingText?: string;
  minHeight?: string;
  className?: string;
}

export const ModuleLoadingState: React.FC<ModuleLoadingStateProps> = ({
  title = 'Preparing page content...',
  supportingText,
  minHeight = 'min-h-[380px]',
  className = ''
}) => {
  const [showSlowNotice, setShowSlowNotice] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSlowNotice(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`w-full flex flex-col items-center justify-center p-8 text-center bg-[#FAF9F5]/60 rounded-2xl border border-[#EAE8E1]/80 ${minHeight} ${className}`}
      role="status"
      aria-live="polite"
      data-component-version="module-loading-state-v1-standard"
    >
      <div className="flex flex-col items-center space-y-4 max-w-sm">
        <KoinoniaBirdMark size="lg" animated={true} />
        <div className="space-y-1">
          <p className="text-sm font-medium text-zinc-800 font-sans">
            {title}
          </p>
          {supportingText ? (
            <p className="text-xs text-zinc-500 font-normal">
              {supportingText}
            </p>
          ) : showSlowNotice ? (
            <p className="text-xs text-amber-700/80 font-normal animate-fade-in">
              This should only take a moment...
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};
