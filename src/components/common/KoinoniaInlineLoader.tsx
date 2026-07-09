import React from 'react';
import { BrandLogo } from './BrandLogo';

export type KoinoniaInlineLoaderProps = {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'logo' | 'line' | 'skeleton';
  label?: string;
  fullCard?: boolean;
  centered?: boolean;
};

export const KoinoniaInlineLoader: React.FC<KoinoniaInlineLoaderProps> = ({
  size = 'md',
  variant = 'logo',
  label,
  fullCard = false,
  centered = false,
}) => {
  // Skeleton height class based on size
  const skeletonHeight = 
    size === 'sm' ? 'h-16' : 
    size === 'lg' ? 'h-36' : 'h-24';

  const renderLoader = () => {
    switch (variant) {
      case 'line':
        return (
          <div className="w-full flex flex-col items-center justify-center py-4 space-y-3">
            {/* Elegant warm gold pulsing sweep line */}
            <div className="w-full max-w-xs h-[2px] bg-zinc-100 rounded-full overflow-hidden relative">
              <div className="absolute top-0 left-0 h-full w-1/2 bg-gradient-to-r from-transparent via-[#C59B27] to-transparent animate-shimmer" style={{ animation: 'shimmer 1.8s infinite' }} />
            </div>
            {label && (
              <p className="text-xs text-zinc-500 font-medium font-serif tracking-wide text-center">
                {label}
              </p>
            )}
            <style>{`
              @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(200%); }
              }
            `}</style>
          </div>
        );

      case 'skeleton':
        return (
          <div className={`w-full space-y-4 animate-pulse py-4`}>
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 rounded-xl bg-zinc-200/70" />
              <div className="flex-1 space-y-2.5 py-1">
                <div className="h-3.5 bg-zinc-200/70 rounded-md w-1/3" />
                <div className="h-3 bg-zinc-100/70 rounded-md w-5/6" />
              </div>
            </div>
            {size === 'lg' && (
              <div className="space-y-2 pt-2">
                <div className="h-3 bg-zinc-100/70 rounded-md w-full" />
                <div className="h-3 bg-zinc-100/70 rounded-md w-4/5" />
              </div>
            )}
            {label && (
              <p className="text-[11px] text-zinc-400 font-medium text-center pt-2">
                {label}
              </p>
            )}
          </div>
        );

      case 'logo':
      default:
        // Size configuration for logo
        const logoScale = 
          size === 'sm' ? 'scale-85' : 
          size === 'lg' ? 'scale-110' : 'scale-95';
        
        return (
          <div className="flex flex-col items-center justify-center py-6 space-y-3.5">
            {/* Subtle opacity pulse (NOT rapid bouncing/blinking, conforming to motion rules) */}
            <div className={`transform transition-transform ${logoScale} opacity-75 animate-pulse duration-2000`}>
              <BrandLogo context="compact" className="pointer-events-none select-none" />
            </div>
            {label && (
              <p className="text-xs text-zinc-500 font-medium tracking-wide text-center font-serif">
                {label}
              </p>
            )}
          </div>
        );
    }
  };

  if (fullCard) {
    return (
      <div 
        className={`w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 shadow-xs flex flex-col justify-center ${centered ? 'min-h-[250px] py-12' : ''}`}
        data-component-version="koinonia-inline-loader-v2-brand"
      >
        {renderLoader()}
      </div>
    );
  }

  return (
    <div 
      className={`w-full flex items-center justify-center ${centered ? 'min-h-[200px] py-12' : ''}`}
      data-component-version="koinonia-inline-loader-v2-brand"
    >
      {renderLoader()}
    </div>
  );
};
