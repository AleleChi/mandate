import React, { useState } from 'react';
import { Camera, Upload, CheckCircle } from 'lucide-react';
import { REAL_ASSETS } from '../../config/assets';
import { resolveMediaUrl } from '../../utils/mediaUrl';

interface PhotoUploadPlaceholderProps {
  label: string;
  initialUrl?: string;
  onPhotoSelect?: (url: string) => void;
  helperText?: string;
}

export const PhotoUploadPlaceholder: React.FC<PhotoUploadPlaceholderProps> = ({
  label,
  initialUrl,
  onPhotoSelect,
  helperText = 'Clear headshot photo helps staff verify identity during entry and pickup.'
}) => {
  const [photo, setPhoto] = useState<string | undefined>(initialUrl);
  const [isUploading, setIsUploading] = useState(false);

  const handleSimulatedUpload = () => {
    setIsUploading(true);
    setTimeout(() => {
      // Use real asset path if configured, otherwise remain empty until uploaded
      const sample = REAL_ASSETS.passAvatar || '';
      setPhoto(sample);
      setIsUploading(false);
      if (onPhotoSelect) onPhotoSelect(sample);
    }, 600);
  };

  return (
    <div className="w-full flex flex-col space-y-2">
      <label className="text-sm font-semibold text-[#262626]">{label}</label>
      <div className="flex items-center space-x-4">
        <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-[#EAE8E1] border-2 border-[#C59B27]/30 flex items-center justify-center shrink-0 shadow-inner">
          {photo && photo.trim() !== '' ? (
            <img 
              src={resolveMediaUrl(photo)} 
              alt={label} 
              className="w-full h-full object-cover" 
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <Camera className="w-7 h-7 text-[#9A7326]" />
          )}
          {isUploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSimulatedUpload}
              className="inline-flex items-center text-xs font-semibold px-3.5 py-2 rounded-xl bg-white border border-[#C59B27] text-[#9A7326] hover:bg-[#FAF6EB] transition-colors"
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              {photo && photo.trim() !== '' ? 'Change photo' : 'Choose photo'}
            </button>
            {photo && photo.trim() !== '' && (
              <span className="inline-flex items-center text-xs font-medium text-[#059669]">
                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                Photo ready
              </span>
            )}
          </div>
          <p className="text-xs text-[#6B7280] leading-relaxed">{helperText}</p>
        </div>
      </div>
    </div>
  );
};
