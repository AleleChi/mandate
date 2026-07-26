import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, RefreshCw, History, RotateCcw, Archive, Trash2 } from 'lucide-react';

interface ReportActionsMenuProps {
  reportId: string;
  status: string;
  onUpdateVersion?: () => void;
  onViewHistory?: () => void;
  onRegenerate?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

export const ReportActionsMenu: React.FC<ReportActionsMenuProps> = ({
  reportId,
  status,
  onUpdateVersion,
  onViewHistory,
  onRegenerate,
  onArchive,
  onDelete,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const toggleMenu = () => {
    setIsOpen(prev => !prev);
  };

  const closeMenu = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        ref={triggerRef}
        onClick={toggleMenu}
        aria-label="More report actions"
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="w-10 h-10 flex items-center justify-center bg-white border border-stone-200 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-50 transition-all focus:outline-none focus:ring-2 focus:ring-[#C59B27]"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-1.5 w-60 bg-[#FAF9F6] border border-stone-200 rounded-xl shadow-xl z-50 py-1.5 focus:outline-none overflow-hidden divide-y divide-stone-100"
        >
          <div className="py-1" role="none">
            {onUpdateVersion && (
              <button
                onClick={() => { closeMenu(); onUpdateVersion(); }}
                className="w-full text-left px-4 py-2.5 text-xs text-stone-700 hover:bg-stone-100 flex items-center gap-2.5 transition-colors font-medium"
                role="menuitem"
              >
                <RefreshCw className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                <span>Create updated version</span>
              </button>
            )}

            {onViewHistory && (
              <button
                onClick={() => { closeMenu(); onViewHistory(); }}
                className="w-full text-left px-4 py-2.5 text-xs text-stone-700 hover:bg-stone-100 flex items-center gap-2.5 transition-colors font-medium"
                role="menuitem"
              >
                <History className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                <span>Report history</span>
              </button>
            )}

            {onRegenerate && (
              <button
                onClick={() => { closeMenu(); onRegenerate(); }}
                className="w-full text-left px-4 py-2.5 text-xs text-stone-700 hover:bg-stone-100 flex items-center gap-2.5 transition-colors font-medium"
                role="menuitem"
              >
                <RotateCcw className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                <span>Regenerate from original information</span>
              </button>
            )}
          </div>

          <div className="py-1" role="none">
            {onArchive && (
              <button
                onClick={() => { closeMenu(); onArchive(); }}
                className="w-full text-left px-4 py-2.5 text-xs text-stone-700 hover:bg-stone-100 flex items-center gap-2.5 transition-colors font-medium"
                role="menuitem"
              >
                <Archive className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                <span>Archive report</span>
              </button>
            )}

            {onDelete && (
              <button
                onClick={() => { closeMenu(); onDelete(); }}
                className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors font-medium"
                role="menuitem"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span>Delete permanently</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
