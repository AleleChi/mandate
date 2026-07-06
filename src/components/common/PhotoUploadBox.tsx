import React, { useState, useRef, useEffect } from 'react';
import { Camera, Check, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { compressImageBeforeUpload } from '../../utils/imageCompression';

interface PhotoUploadBoxProps {
  value: string;
  onUploaded: (url: string) => void;
  label?: string;
  helperText?: string;
  purpose: 'parent_profile_photo' | 'child_photo' | 'pickup_person_photo';
  required?: boolean;
  error?: string;
  sizeVariant?: 'w-28' | 'w-24-28';
  onUploadingStateChange?: (isUploading: boolean) => void;
}

export const PhotoUploadBox: React.FC<PhotoUploadBoxProps> = ({
  value,
  onUploaded,
  label,
  helperText,
  purpose,
  error,
  sizeVariant = 'w-28',
  onUploadingStateChange
}) => {
  const { showSuccess, showError } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States: 'empty' | 'preparing' | 'uploading' | 'uploaded' | 'failed' | 'replacing'
  const [uploadState, setUploadState] = useState<'empty' | 'preparing' | 'uploading' | 'uploaded' | 'failed' | 'replacing'>(
    value ? 'uploaded' : 'empty'
  );
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string>(value || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync value changes from parent if any
  useEffect(() => {
    if (value) {
      setLocalPreviewUrl(value);
      if (uploadState === 'empty' || uploadState === 'failed') {
        setUploadState('uploaded');
      }
    } else {
      setLocalPreviewUrl('');
      setUploadState('empty');
    }
  }, [value]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (localPreviewUrl && localPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const handleBoxClick = () => {
    if (uploadState === 'preparing' || uploadState === 'uploading') {
      return; // prevent clicking while active
    }
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleBoxClick();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isReplacing = uploadState === 'uploaded';
    setErrorMessage(null);

    try {
      // 1. Preparing state: compression starting
      setUploadState(isReplacing ? 'replacing' : 'preparing');
      onUploadingStateChange?.(true);

      // Clean up old local blob if any
      if (localPreviewUrl && localPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localPreviewUrl);
      }

      // Perform compression
      const compressionResult = await compressImageBeforeUpload(file);
      
      // Set the compressed preview immediately
      setLocalPreviewUrl(compressionResult.previewUrl);

      // 2. Uploading state: upload starts
      setUploadState('uploading');

      if (api.getToken()) {
        const uploadRes = await api.media.uploadFile(compressionResult.compressedFile, purpose);
        const finalUrl = uploadRes.secureUrl || uploadRes.url;
        
        // 3. Uploaded state: success
        setLocalPreviewUrl(finalUrl);
        setUploadState('uploaded');
        onUploaded(finalUrl);
        showSuccess('Photo added', 'The photo has been saved.');
      } else {
        // Fallback for local draft if not logged in
        setUploadState('uploaded');
        onUploaded(compressionResult.previewUrl);
        showSuccess('Photo added', 'The photo has been saved (local preview).');
      }
    } catch (err: any) {
      console.error('Photo upload failed:', err);
      setUploadState('failed');
      setErrorMessage(err.message || 'Photo could not be uploaded');
      showError('Photo could not be uploaded', 'Please choose another photo and try again.');
    } finally {
      onUploadingStateChange?.(false);
      // Reset input value so same file can be chosen again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Styles based on purpose and state
  const isPickup = purpose === 'pickup_person_photo';
  
  // Outer frame size classes
  let frameSizeClasses = 'w-28 h-28 mx-auto';
  if (sizeVariant === 'w-24-28') {
    frameSizeClasses = 'w-24 h-24 sm:w-28 sm:h-28 mx-auto';
  } else if (isPickup) {
    frameSizeClasses = 'w-24 h-24 mx-auto';
  }

  // Border style
  const borderClasses = isPickup
    ? `border-2 border-dashed ${uploadState === 'failed' || error ? 'border-[#C53030]' : 'border-[#D9D6CE] hover:border-[#C59B27]'}`
    : `border ${uploadState === 'failed' || error ? 'border-[#C53030]' : 'border-[#EAE8E1] hover:border-[#C59B27]'}`;

  // Aria labels
  const getAriaLabel = () => {
    switch (uploadState) {
      case 'empty':
        return `Upload ${label || 'photo'}. Click to choose a file.`;
      case 'preparing':
        return 'Preparing and compressing your photo. Please wait.';
      case 'uploading':
        return 'Uploading your photo. Please wait.';
      case 'uploaded':
        return 'Photo uploaded successfully. Click to replace with a different photo.';
      case 'failed':
        return 'Photo upload failed. Click to try choosing another photo.';
      case 'replacing':
        return 'Replacing your photo. Please wait.';
      default:
        return 'Photo upload box';
    }
  };

  return (
    <div className="flex flex-col items-center">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div
        onClick={handleBoxClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={getAriaLabel()}
        aria-live="polite"
        className={`${frameSizeClasses} ${borderClasses} bg-[#FAF8F4] rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-200 relative overflow-hidden group shadow-2xs`}
      >
        {/* Render based on state */}
        {(uploadState === 'empty' && !localPreviewUrl) && (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <Camera className="w-6 h-6 text-[#715D3A] stroke-[1.75] mb-1.5" />
            <span className="text-xs font-bold text-[#715D3A]">{label || 'Add Photo'}</span>
          </div>
        )}

        {uploadState === 'preparing' && (
          <div className="flex flex-col items-center justify-center p-4 text-center bg-white/90 absolute inset-0 z-10">
            <div className="text-xs font-medium text-[#715D3A] animate-pulse">Preparing photo...</div>
          </div>
        )}

        {(uploadState === 'uploading' || uploadState === 'replacing') && (
          <div className="flex flex-col items-center justify-center p-4 text-center bg-white/90 absolute inset-0 z-10">
            <div className="text-xs font-medium text-[#715D3A] animate-pulse">
              {uploadState === 'replacing' ? 'Updating photo...' : 'Uploading photo...'}
            </div>
          </div>
        )}

        {uploadState === 'failed' && (
          <div className="flex flex-col items-center justify-center p-4 text-center bg-white/95 absolute inset-0 z-10">
            <AlertCircle className="w-5 h-5 text-[#C53030] mb-1" />
            <div className="text-[11px] font-bold text-[#C53030] leading-snug">Photo could not be uploaded</div>
          </div>
        )}

        {/* Display Image Preview for Uploaded, Replacing, or Uploading (background preview) */}
        {localPreviewUrl && (
          <>
            <img
              src={localPreviewUrl}
              alt="Preview"
              className="w-full h-full object-cover object-center"
              onError={() => {
                // If the preview fails to load, set state to empty
                setUploadState('empty');
                setLocalPreviewUrl('');
              }}
            />
            {/* Hover overlay to change photo */}
            {uploadState !== 'preparing' && uploadState !== 'uploading' && uploadState !== 'replacing' && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-semibold">
                Change photo
              </div>
            )}
          </>
        )}
      </div>

      {/* Underneath Helper Text / Labels / Messages */}
      {uploadState === 'uploaded' && (
        <span className="text-[11px] font-semibold text-emerald-700 mt-2 flex items-center justify-center gap-1">
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          Photo added
        </span>
      )}

      {uploadState === 'failed' && (
        <div className="text-center mt-2 max-w-[240px]">
          <p className="text-[11px] font-medium text-[#C53030]">Please choose another photo and try again.</p>
        </div>
      )}

      {uploadState !== 'failed' && uploadState !== 'uploaded' && helperText && (
        <span className="text-xs text-[#3F3F46] mt-3 block font-medium text-center">
          {helperText}
        </span>
      )}

      {(error || errorMessage) && uploadState !== 'failed' && (
        <p className="text-xs text-[#C53030] mt-2 font-medium text-center">
          {error || errorMessage}
        </p>
      )}
    </div>
  );
};
