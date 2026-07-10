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
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [resolvedSrc, setResolvedSrc] = useState<string>('');
  const [hasTriedFallback, setHasTriedFallback] = useState<boolean>(false);

  useEffect(() => {
    setHasTriedFallback(false);
  }, [src]);

  useEffect(() => {
    if (!src || src.trim() === '') {
      if (fallbackSrc && fallbackSrc.trim() !== '' && !hasTriedFallback) {
        const url = resolveMediaUrl(fallbackSrc);
        setResolvedSrc(url);
        setHasTriedFallback(true);
        setError(false);
        setLoading(true);

        const img = new Image();
        img.src = url;
        img.onload = () => {
          setLoading(false);
        };
        img.onerror = () => {
          console.warn('[media] fallback image also failed to load', { fallbackSrc, resolvedUrl: url });
          setError(true);
          setLoading(false);
        };
      } else {
        setError(true);
        setLoading(false);
      }
      return;
    }

    const url = resolveMediaUrl(src);
    setResolvedSrc(url);
    setError(false);
    setLoading(true);

    const img = new Image();
    img.src = url;
    img.onload = () => {
      setLoading(false);
    };
    img.onerror = () => {
      // If the main image fails to load, try fallbackSrc once
      if (fallbackSrc && fallbackSrc.trim() !== '' && !hasTriedFallback) {
        console.warn('[media] hero image failed to load, switching to fallback', { src, resolvedUrl: url });
        const fbUrl = resolveMediaUrl(fallbackSrc);
        setResolvedSrc(fbUrl);
        setHasTriedFallback(true);

        const fbImg = new Image();
        fbImg.src = fbUrl;
        fbImg.onload = () => {
          setLoading(false);
        };
        fbImg.onerror = () => {
          console.warn('[media] fallback image also failed to load', { fallbackSrc, resolvedUrl: fbUrl });
          setError(true);
          setLoading(false);
        };
      } else {
        console.warn('[media] hero image failed to load', { src, resolvedUrl: url });
        setError(true);
        setLoading(false);
      }
    };
  }, [src, fallbackSrc, hasTriedFallback]);

  if (error) {
    if (fallbackComponent) {
      return <div className={containerClassName}>{fallbackComponent}</div>;
    }
    return (
      <div 
        data-component-version="safe-image-v7-volunteer-handover" 
        className={`flex flex-col items-center justify-center bg-[#FAF6EB] text-[#A1A1AA] border border-[#E5D5AE]/40 ${className} ${containerClassName}`}
      >
        <ImageOff className="w-5 h-5 text-[#9A7326]/50" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${containerClassName}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#FAF8F3] z-10">
          <Loader2 className="w-5 h-5 text-[#C59B27] animate-spin" />
        </div>
      )}
      {resolvedSrc ? (
        <img
          data-component-version="safe-image-v7-volunteer-handover"
          src={resolvedSrc}
          alt={alt}
          className={`${className} ${loading ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}`}
          referrerPolicy="no-referrer"
          loading="lazy"
          {...props}
        />
      ) : null}
    </div>
  );
};
