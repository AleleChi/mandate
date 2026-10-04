import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { buildApiUrl } from '../../utils/urlHelper';
import { updateDocumentFavicon } from '../../utils/faviconHelper';
import koinoniaLogoPng from '../../assets/images/koinonia-logo.png';

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
  return buildApiUrl(url);
}

export const fetchLogoUrl = async (): Promise<string | null> => {
  if (globalSiteLogo) return globalSiteLogo;
  if (globalPromise) return globalPromise;

  globalPromise = (async () => {
    try {
      const res = await api.landing.getPublicPage();
      if (res && res.success && res.settings) {
        if (res.settings.site_logo) {
          globalSiteLogo = res.settings.site_logo;
          if (typeof window !== 'undefined') {
            (window as any)._site_logo = globalSiteLogo;
          }
        }
        if (res.settings.site_favicon) {
          updateDocumentFavicon(res.settings.site_favicon);
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

  // Handle fallback if site_logo is missing — use bundled koinonia-logo.png
  // with the SAME img tag, sizing classes, and attributes as the admin site_logo path
  const renderFallback = () => {
    return (
      <img
        src={koinoniaLogoPng}
        alt="Koinonia"
        className={`${sizeClasses} object-contain`}
        draggable={false}
      />
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
