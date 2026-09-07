import React from 'react';

interface PersistentTrainingBannerProps {
  sessionName?: string;
  roleName?: string;
  onExit: () => void;
}

export const PersistentTrainingBanner: React.FC<PersistentTrainingBannerProps> = ({
  roleName = 'Check-in team',
  onExit
}) => {
  // Format role name nicely
  const displayRole = roleName.toLowerCase().includes('check-in')
    ? 'Check-in team'
    : roleName.toLowerCase().includes('pickup')
    ? 'Pickup team'
    : roleName.toLowerCase().includes('room')
    ? 'Room lead'
    : roleName;

  return (
    <aside 
      id="persistent-training-banner"
      aria-label="Practice mode banner"
      className="bg-[#FAF9F5] border-b border-[#EAE8E1] text-[#18181B] px-4 sm:px-6 py-2.5 text-xs font-sans flex items-center justify-between gap-3 sticky top-0 z-[90] transition-colors"
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="bg-[#C59B27]/10 text-[#967215] border border-[#C59B27]/25 font-semibold px-2 py-0.5 rounded-md text-[11px]">
          Practice mode
        </span>
        {displayRole && (
          <>
            <span className="text-zinc-300">•</span>
            <span className="text-zinc-700 font-medium">
              {displayRole}
            </span>
          </>
        )}
        <span className="text-zinc-400 hidden sm:inline">•</span>
        <span className="text-zinc-500 hidden sm:inline">
          No live event changes
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[11px] text-zinc-500 sm:hidden">
          No live changes
        </span>
        <button
          onClick={onExit}
          className="min-h-[36px] px-3.5 py-1.5 rounded-xl border border-[#EAE8E1] bg-white hover:bg-zinc-50 text-zinc-700 hover:text-zinc-900 font-medium text-xs transition-colors cursor-pointer shadow-2xs"
        >
          Exit practice
        </button>
      </div>
    </aside>
  );
};
