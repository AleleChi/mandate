import React from 'react';
import { LucideIcon, FolderOpen } from 'lucide-react';

interface KoinoniaEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const KoinoniaEmptyState: React.FC<KoinoniaEmptyStateProps> = ({
  icon: Icon = FolderOpen,
  title,
  description,
  actionLabel,
  onAction,
  className = ''
}) => {
  return (
    <div
      className={`bg-white border border-[#EAE8E1] rounded-2xl p-8 sm:p-10 text-center space-y-3.5 ${className}`}
      data-component-version="koinonia-empty-state-v1"
    >
      <div className="mx-auto w-12 h-12 bg-[#FAF9F5] text-zinc-500 rounded-2xl flex items-center justify-center border border-[#EAE8E1]">
        <Icon className="w-6 h-6 stroke-[1.5]" />
      </div>
      <div className="space-y-1 max-w-sm mx-auto">
        <h3 className="font-serif font-semibold text-base text-[#18181B]">
          {title}
        </h3>
        {description && (
          <p className="text-xs text-zinc-500 leading-relaxed font-sans">
            {description}
          </p>
        )}
      </div>
      {actionLabel && onAction && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onAction}
            className="px-4 py-2 bg-[#C59B27] hover:bg-[#A37E1C] text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
};
