import React from 'react';

interface PersistentTrainingBannerProps {
  sessionName: string;
  roleName: string;
  onExit: () => void;
}

export const PersistentTrainingBanner: React.FC<PersistentTrainingBannerProps> = ({
  sessionName,
  roleName,
  onExit
}) => {
  return (
    <div 
      id="persistent-training-banner"
      data-component-version="persistent-training-banner-v1"
      className="bg-[#C59B27] text-white px-4 py-2.5 text-xs sm:text-sm font-medium tracking-wide flex flex-col sm:flex-row items-center justify-between gap-2 shadow-md sticky top-0 z-[90] transition-all"
    >
      <div className="flex items-center gap-2">
        <span className="bg-white text-[#C59B27] font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">
          Training mode
        </span>
        <span className="opacity-90">
          Practice session: <strong className="text-white">{sessionName}</strong>
        </span>
        <span className="hidden sm:inline opacity-70">|</span>
        <span className="opacity-90">
          Assigned Practice Role: <strong className="text-white">{roleName || 'None'}</strong>
        </span>
      </div>
      
      <div className="flex items-center gap-3">
        <span className="text-[11px] opacity-80 hidden md:inline">
          Practice only — no live event action
        </span>
        <button
          onClick={onExit}
          className="bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-semibold px-3 py-1 rounded border border-white/20 transition-colors text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/50"
        >
          Exit Training Mode
        </button>
      </div>
    </div>
  );
};
