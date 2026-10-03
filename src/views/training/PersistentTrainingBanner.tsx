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
      className="bg-[#FAF9F5] dark:bg-[#1D1D1A] border-b border-[#EAE8E1] dark:border-[#302E29] text-[#18181B] dark:text-[#F0EBE3] px-4 sm:px-6 py-2.5 text-xs font-sans flex items-center justify-between gap-3 sticky top-0 z-[90] transition-colors"
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="bg-[#C59B27]/10 dark:bg-amber-950/40 text-[#967215] dark:text-amber-400 border border-[#C59B27]/25 dark:border-amber-900/40 font-semibold px-2 py-0.5 rounded-md text-[11px]">
          Practice mode
        </span>
        {displayRole && (
          <>
            <span className="text-zinc-300 dark:text-[#3A3835]">•</span>
            <span className="text-zinc-700 dark:text-[#F0EBE3] font-medium">
              {displayRole}
            </span>
          </>
        )}
        <span className="text-zinc-400 dark:text-[#7A7570] hidden sm:inline">•</span>
        <span className="text-zinc-500 dark:text-[#7A7570] hidden sm:inline">
          No live event changes
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[11px] text-zinc-500 dark:text-[#7A7570] sm:hidden">
          No live changes
        </span>
        <button
          onClick={onExit}
          className="min-h-[36px] px-3.5 py-1.5 rounded-xl border border-[#EAE8E1] dark:border-[#302E29] bg-white dark:bg-[#21211E] hover:bg-zinc-50 dark:hover:bg-[#262520] text-zinc-700 dark:text-[#B8B0A5] hover:text-zinc-900 dark:hover:text-[#F0EBE3] font-medium text-xs transition-colors cursor-pointer shadow-2xs"
        >
          Exit practice
        </button>
      </div>
    </aside>
  );
};
