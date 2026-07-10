import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface BrandLogoProps {
  context?: 'landing' | 'admin' | 'parent' | 'volunteer' | 'auth' | 'compact';
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  title?: string;
  'data-component-version'?: string;
}

let globalSiteLogo: string | null = (typeof window !== 'undefined' && (window as any)._site_logo) || null;
let globalPromise: Promise<string | null> | null = null;

export function getSafePublicAssetUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  
  // Resolve API Base URL
  let apiBaseUrl = '';
  try {
    apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
  } catch {
    apiBaseUrl = ((import.meta as any).env?.VITE_API_BASE_URL || '').trim();
  }

  let isDev = false;
  try {
    isDev = !!import.meta.env.DEV;
  } catch {}

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (
      isDev ||
      hostname === 'localhost' || 
      hostname === '127.0.0.1' || 
      hostname.endsWith('.run.app') || 
      hostname.endsWith('.google.com') ||
      hostname.endsWith('.googleusercontent.com')
    ) {
      apiBaseUrl = ''; // Use relative paths for local development and AI Studio preview
    }
  }

  if (apiBaseUrl) {
    const base = apiBaseUrl.replace(/\/+$/, '');
    const path = url.replace(/^\/+/, '');
    return `${base}/${path}`;
  }
  
  return url;
}

export const fetchLogoUrl = async (): Promise<string | null> => {
  if (globalSiteLogo) return globalSiteLogo;
  if (globalPromise) return globalPromise;

  globalPromise = (async () => {
    try {
      const res = await api.landing.getPublicPage();
      if (res && res.success && res.settings && res.settings.site_logo) {
        globalSiteLogo = res.settings.site_logo;
        if (typeof window !== 'undefined') {
          (window as any)._site_logo = globalSiteLogo;
        }
        return globalSiteLogo;
      }
    } catch (err) {
      console.error('Failed to fetch site logo for BrandLogo:', err);
    }
    return null;
  })();

  return globalPromise;
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  context = 'landing',
  className = '',
  onClick,
  onDoubleClick,
  onTouchStart,
  title,
  'data-component-version': dataComponentVersion
}) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(globalSiteLogo);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [logoUrl]);

  useEffect(() => {
    // If we already have the logoUrl from state or global cache, do nothing
    if (logoUrl) return;

    // Check window object first in case another component set it
    if (typeof window !== 'undefined' && (window as any)._site_logo) {
      setLogoUrl((window as any)._site_logo);
      return;
    }

    let isMounted = true;
    fetchLogoUrl().then((url) => {
      if (isMounted && url) {
        setLogoUrl(url);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [logoUrl]);

  // Determine size classes based on context
  let sizeClasses = 'h-10 w-auto max-w-full';
  if (context === 'landing') {
    sizeClasses = 'h-11 md:h-12 w-auto max-w-[220px] md:max-w-[260px]';
  } else if (context === 'admin') {
    sizeClasses = 'h-12 w-auto max-w-[180px] sm:max-w-[220px]';
  } else if (context === 'parent') {
    sizeClasses = 'h-10 w-auto max-w-[160px]';
  } else if (context === 'volunteer') {
    sizeClasses = 'h-9 w-auto max-w-[150px]';
  } else if (context === 'auth') {
    sizeClasses = 'h-16 w-auto max-w-[240px]';
  } else if (context === 'compact') {
    sizeClasses = 'h-8 w-auto max-w-[120px]';
  }

  // Handle fallback if site_logo is missing
  const renderFallback = () => {
    // Elegant CSS drawn fallback mimicking a premium brand mark
    // It says "K" inside a gold-gradient badge
    return (
      <div className="flex items-center space-x-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#C59B27] to-[#A67C2E] flex items-center justify-center text-white font-serif font-black text-xl shadow-md transition-transform duration-300">
          K
        </div>
        {context !== 'compact' && (
          <div className="flex flex-col text-left">
            <span className="font-serif font-black text-[#18181B] tracking-widest text-sm leading-none uppercase">
              KOINONIA
            </span>
            <span className="text-[9px] text-[#C59B27] tracking-wider uppercase font-bold mt-1">
              Children & Teens
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      data-component-version={dataComponentVersion || "brand-logo-v1-configured"}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onTouchStart={onTouchStart}
      className={`inline-flex items-center select-none cursor-pointer ${className}`}
      title={title}
    >
      {logoUrl && 
       !hasError && 
       (logoUrl.startsWith('http://') || 
        logoUrl.startsWith('https://') || 
        logoUrl.startsWith('data:') || 
        logoUrl.includes('/api/media/') || 
        logoUrl.includes('/media/')) ? (
        <img
          src={getSafePublicAssetUrl(logoUrl) || null}
          alt="Koinonia"
          className={`${sizeClasses} object-contain`}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      ) : (
        renderFallback()
      )}
    </div>
  );
};
