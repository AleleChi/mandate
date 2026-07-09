import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface AuthScreenShellProps {
  onBack?: () => void;
  showBack?: boolean;
  children: React.ReactNode;
  dataViewVersion?: string;
  maxWidth?: 'md' | 'lg' | 'xl';
  extraClass?: string;
  headerRight?: React.ReactNode;
}

export const AuthScreenShell: React.FC<AuthScreenShellProps> = ({
  onBack,
  showBack = false,
  children,
  dataViewVersion,
  maxWidth = 'md',
  extraClass = '',
  headerRight
}) => {
  // Map maxWidth string to tailwind class
  const maxWidthClass = 
    maxWidth === 'xl' ? 'max-w-xl' :
    maxWidth === 'lg' ? 'max-w-lg' : 'max-w-md';

  return (
    <div
      data-view-version={dataViewVersion}
      className={`min-h-screen bg-[#FAF9F6] text-[#18181B] flex flex-col justify-between font-sans antialiased pb-12 selection:bg-[#C59B27]/20 ${extraClass}`}
    >
      <div className="w-full flex-1 flex flex-col">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EAE8E1] h-14 shrink-0">
          <div className="w-full max-w-4xl mx-auto px-4 h-full flex items-center justify-center relative">
            {showBack && onBack && (
              <button
                type="button"
                onClick={onBack}
                className="absolute left-4 p-2 rounded-full text-[#18181B] hover:bg-black/5 transition-colors focus:outline-none"
                aria-label="Back"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            <BrandLogo
              context="compact"
              data-component-version="auth-brand-logo-v1-configured"
              className="select-none"
            />
            {headerRight && (
              <div className="absolute right-4 flex items-center">
                {headerRight}
              </div>
            )}
          </div>
        </header>

        {/* Outer body wrap with spacing */}
        <main className="flex-1 w-full flex flex-col justify-center px-4 py-8 sm:py-12">
          {/* Subtle Branded Inner Content Surface */}
          <div
            className={`w-full ${maxWidthClass} mx-auto bg-[#FFFDF9] border border-[#EBE3D3] rounded-[24px] sm:rounded-[32px] p-6 sm:p-10 shadow-[0_18px_45px_rgba(15,23,42,0.04)] space-y-6 transition-all duration-300`}
          >
            {children}
          </div>
        </main>
      </div>

      {/* Elegant minimalist decorative bottom indicator */}
      <footer className="w-16 h-1 bg-[#B89047]/30 rounded-full mx-auto shrink-0 mt-2"></footer>
    </div>
  );
};
