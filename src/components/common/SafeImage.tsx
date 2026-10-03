import React, { useState, useEffect } from 'react';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { ImageOff, Loader2 } from 'lucide-react';

export interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string | null;
  fallbackSrc?: string | null;
  fallbackComponent?: React.ReactNode;
  containerClassName?: string;
}

export const SafeImage: React.FC<SafeImageProps> = ({
  src,
  fallbackSrc,
  alt = '',
  className = '',
  fallbackComponent,
  containerClassName = '',
  ...props
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>('');
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    // Determine the resolved primary and fallback URLs
    const resolvedMain = resolveMediaUrl(src);
    const resolvedFallback = resolveMediaUrl(fallbackSrc);

    if (!resolvedMain || resolvedMain.trim() === '') {
      if (resolvedFallback && resolvedFallback.trim() !== '') {
        setCurrentSrc(resolvedFallback);
        setStatus('loading');
      } else {
        setStatus('error');
      }
    } else {
      setCurrentSrc(resolvedMain);
      setStatus('loading');
    }
  }, [src, fallbackSrc]);

  const handleLoad = () => {
    setStatus('loaded');
  };

  const handleError = () => {
    const resolvedMain = resolveMediaUrl(src);
    const resolvedFallback = resolveMediaUrl(fallbackSrc);

    // If we were trying to load the main image and we have a valid fallback, try the fallback
    if (currentSrc === resolvedMain && resolvedFallback && resolvedFallback.trim() !== '' && resolvedMain !== resolvedFallback) {
      console.warn('[media] SafeImage main source failed, switching to fallback', { src, fallbackSrc });
      setCurrentSrc(resolvedFallback);
      setStatus('loading');
    } else {
      console.warn('[media] SafeImage failed to load image/fallback', { src, fallbackSrc });
      setStatus('error');
    }
  };

  if (status === 'error') {
    if (fallbackComponent) {
      return <div className={containerClassName}>{fallbackComponent}</div>;
    }
    return (
      <div 
        data-component-version="safe-image-v8-secure-production" 
        className={`flex flex-col items-center justify-center bg-[#FAF6EB] text-[#A1A1AA] border border-[#E5D5AE]/40 ${className} ${containerClassName}`}
      >
        <ImageOff className="w-5 h-5 text-[#9A7326]/50" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${containerClassName}`}>
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#FAF8F3] z-10">
          <Loader2 className="w-5 h-5 text-[#C59B27] animate-spin" />
        </div>
      )}
      {currentSrc ? (
        <img
          data-component-version="safe-image-v8-secure-production"
          src={currentSrc}
          alt={alt}
          className={`${className} ${status === 'loading' ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}`}
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={handleLoad}
          onError={handleError}
          {...props}
        />
      ) : null}
    </div>
  );
};
