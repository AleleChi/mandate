import React, { useState, useEffect } from 'react';
import { fetchLogoUrl, getSafePublicAssetUrl } from './BrandLogo';

interface KoinoniaBirdMarkProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  animated?: boolean;
  'aria-label'?: string;
}

export const KoinoniaBirdMark: React.FC<KoinoniaBirdMarkProps> = ({
  size = 'md',
  className = '',
  animated = false,
  'aria-label': ariaLabel = 'Koinonia Logo'
}) => {
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    fetchLogoUrl().then((url) => {
      if (isMounted && url) {
        const resolved = getSafePublicAssetUrl(url);
        if (resolved) setRemoteUrl(resolved);
      }
    });
    return () => { isMounted = false; };
  }, []);

  // Determine standard size dimensions
  let pxSize = 40;
  if (typeof size === 'number') {
    pxSize = size;
  } else if (size === 'sm') {
    pxSize = 28;
  } else if (size === 'md') {
    pxSize = 44;
  } else if (size === 'lg') {
    pxSize = 64;
  } else if (size === 'xl') {
    pxSize = 88;
  }

  const animClass = animated
    ? 'animate-pulse transition-transform duration-1000 ease-in-out'
    : '';

  // Render SVG official bird mark
  const renderBirdSvg = () => (
    <svg
      width={pxSize}
      height={pxSize}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="koinoniaBirdGoldGrad" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D8AC33" />
          <stop offset="50%" stopColor="#C59B27" />
          <stop offset="100%" stopColor="#96731C" />
        </linearGradient>
        <filter id="koinoniaSoftGlow" x="-10%" y="-10%" width="120%" height="120%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#C59B27" floodOpacity="0.25" />
        </filter>
      </defs>
      
      {/* Outer subtle shield background */}
      <rect x="4" y="4" width="56" height="56" rx="18" fill="#FAF9F5" stroke="#EAE8E1" strokeWidth="1.5" />

      {/* Stylized Koinonia Soaring Dove / Bird Vector */}
      <g filter="url(#koinoniaSoftGlow)">
        {/* Main Wing Sweep */}
        <path
          d="M17 38C22 30 28 20 44 16C40 22 35 28 32 35C29 42 22 46 17 38Z"
          fill="url(#koinoniaBirdGoldGrad)"
        />
        {/* Inner Ascending Feather Accent */}
        <path
          d="M22 35C27 28 34 23 47 19C42 25 36 32 32 38C28 43 25 41 22 35Z"
          fill="#E6C458"
          opacity="0.9"
        />
        {/* Tail Feather Sweep */}
        <path
          d="M16 39C13 41 12 45 15 47C18 49 21 46 23 41C20 42 18 41 16 39Z"
          fill="url(#koinoniaBirdGoldGrad)"
        />
        {/* Crown / Head Dot Accent */}
        <circle cx="45" cy="17" r="3.2" fill="#8C6B18" />
      </g>
    </svg>
  );

  return (
    <div
      className={`inline-flex items-center justify-center ${animClass} ${className}`}
      style={{ width: pxSize, height: pxSize }}
      role="img"
      aria-label={ariaLabel}
      data-component-version="koinonia-bird-mark-v1"
    >
      {remoteUrl && !imgError ? (
        <img
          src={remoteUrl}
          alt={ariaLabel}
          style={{ width: pxSize, height: pxSize }}
          className="object-contain rounded-xl"
          onError={() => setImgError(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        renderBirdSvg()
      )}
    </div>
  );
};
