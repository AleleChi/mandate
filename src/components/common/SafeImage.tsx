import React, { useState, useEffect } from 'react';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { ImageOff, Loader2 } from 'lucide-react';

export interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string | null;
  fallbackComponent?: React.ReactNode;
  containerClassName?: string;
}

export const SafeImage: React.FC<SafeImageProps> = ({
  src,
  alt = '',
  className = '',
  fallbackComponent,
  containerClassName = '',
  ...props
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [resolvedSrc, setResolvedSrc] = useState<string>('');

  useEffect(() => {
    if (!src || src.trim() === '') {
      setError(true);
      setLoading(false);
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
      setError(true);
      setLoading(false);
    };
  }, [src]);

  if (error) {
    if (fallbackComponent) {
      return <div className={containerClassName}>{fallbackComponent}</div>;
    }
    return (
      <div 
        data-component-version="safe-image-v2-optimized" 
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
      <img
        data-component-version="safe-image-v2-optimized"
        src={resolvedSrc}
        alt={alt}
        className={`${className} ${loading ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}`}
        referrerPolicy="no-referrer"
        loading="lazy"
        {...props}
      />
    </div>
  );
};
