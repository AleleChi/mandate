import React, { useState } from 'react';
import { Image as ImageIcon, Camera, Sparkles, Shield, Users, Heart } from 'lucide-react';

interface AssetImageProps {
  src?: string;
  alt: string;
  className?: string;
  iconType?: 'camera' | 'sparkles' | 'shield' | 'users' | 'heart' | 'default';
  label?: string;
  loading?: 'lazy' | 'eager';
}

export const AssetImage: React.FC<AssetImageProps> = ({
  src,
  alt,
  className = '',
  iconType = 'default',
  label,
  loading = 'lazy'
}) => {
  const [hasError, setHasError] = useState(false);

  const getIcon = () => {
    switch (iconType) {
      case 'camera': return <Camera className="w-8 h-8 text-[#C59B27]/60" />;
      case 'sparkles': return <Sparkles className="w-8 h-8 text-[#C59B27]/60" />;
      case 'shield': return <Shield className="w-8 h-8 text-[#C59B27]/60" />;
      case 'users': return <Users className="w-8 h-8 text-[#C59B27]/60" />;
      case 'heart': return <Heart className="w-8 h-8 text-[#C59B27]/60" />;
      default: return <ImageIcon className="w-8 h-8 text-[#C59B27]/60" />;
    }
  };

  if (src && src.trim() !== '' && !hasError) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        loading={loading}
        onError={() => setHasError(true)}
      />
    );
  }

  // Visual fallback when no asset has been uploaded yet
  return (
    <div className={`relative flex flex-col items-center justify-center bg-[#F8F7F3] border border-[#EAE8E1] overflow-hidden p-4 text-center select-none ${className}`}>
      {/* Decorative architectural grid background */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none" 
        style={{
          backgroundImage: `radial-gradient(#C59B27 1px, transparent 1px)`,
          backgroundSize: '16px 16px'
        }}
      />
      <div className="relative z-10 w-14 h-14 rounded-2xl bg-white border border-[#EAE8E1] shadow-sm flex items-center justify-center mb-3.5">
        {getIcon()}
      </div>
      <div className="relative z-10 max-w-[85%]">
        <p className="text-xs font-serif-koinonia font-bold text-[#18181B] tracking-tight truncate">
          {label || alt}
        </p>
        <p className="text-[10px] font-sans text-[#71717A] mt-0.5">
          Awaiting Asset Upload
        </p>
      </div>
    </div>
  );
};
