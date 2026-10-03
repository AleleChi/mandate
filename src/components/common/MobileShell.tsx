import React from 'react';
import { ArrowLeft, ShieldCheck, HelpCircle } from 'lucide-react';
import { BottomNavTab, AppRoute } from '../../types';
import { BottomNav } from './BottomNav';
import { BrandLogo } from './BrandLogo';

interface MobileShellProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  showBottomNav?: boolean;
  activeTab?: BottomNavTab;
  onTabChange?: (tab: BottomNavTab) => void;
  onNavigate?: (route: AppRoute) => void;
  children: React.ReactNode;
}

export const MobileShell: React.FC<MobileShellProps> = ({
  title,
  subtitle,
  showBack = false,
  onBack,
  showBottomNav = false,
  activeTab = 'Home',
  onTabChange,
  onNavigate,
  children
}) => {
  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-24 flex flex-col justify-between">
      {/* Top App Header */}
      <header className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EAE8E1]">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {showBack && onBack ? (
              <button
                onClick={onBack}
                className="p-1.5 -ml-1.5 rounded-xl text-[#262626] hover:bg-black/5 transition-colors"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <BrandLogo
                context="compact"
                onClick={() => onNavigate && onNavigate('/')}
                className="mr-1"
              />
            )}
            <div className="flex flex-col">
              <span className="font-serif-koinonia font-bold text-sm text-[#18181B] tracking-wider uppercase">
                {title || 'Parent Access'}
              </span>
              {subtitle && (
                <span className="text-[10px] text-[#6B7280] truncate max-w-[200px]">
                  {subtitle}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="inline-flex items-center px-2 py-1 rounded-full bg-[#FAF6EB] text-[#9A7326] text-[10px] font-semibold border border-[#E5D5AE]">
              <ShieldCheck className="w-3 h-3 mr-1 text-[#C59B27]" />
              Official
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area framed to standard mobile app width */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 pt-5 pb-8">
        {children}
      </main>

      {/* Bottom Navigation if enabled */}
      {showBottomNav && onTabChange && (
        <BottomNav activeTab={activeTab} onTabChange={onTabChange} />
      )}
    </div>
  );
};
