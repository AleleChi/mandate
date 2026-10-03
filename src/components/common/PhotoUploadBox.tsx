import React, { useState, useRef, useEffect } from 'react';
import { Camera, Check, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { compressImageBeforeUpload } from '../../utils/imageCompression';
import { resolveMediaUrl } from '../../utils/mediaUrl';

export type PhotoUploadState =
  | "empty"
  | "preparing"
  | "uploading"
  | "uploaded"
  | "upload_failed"
  | "display_failed";

interface PhotoUploadBoxProps {
  value: string;
  onUploaded: (savedRef: string) => void;
  label?: string;
  helperText?: string;
  purpose: 'parent_profile_photo' | 'child_photo' | 'pickup_person_photo' | 'volunteer_profile_photo';
  required?: boolean;
  error?: string;
  sizeVariant?: 'w-28' | 'w-24' | 'w-24-28';
  onUploadingStateChange?: (isUploading: boolean) => void;
  allowPublicUpload?: boolean;
  requireServerUpload?: boolean;
  onUploadStatusChange?: (status: PhotoUploadState) => void;
  onFileSelected?: (file: File | null) => void;
  previewOnly?: boolean;
}

function isSavedMediaReference(value: string): boolean {
  const ref = value.trim();
  if (!ref) return false;
  if (ref.startsWith("blob:") || ref.startsWith("data:")) return false;
  return (
    ref.startsWith("/api/media/files/") ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)
  );
}

export const PhotoUploadBox: React.FC<PhotoUploadBoxProps> = ({
  value,
  onUploaded,
  label,
  helperText,
  purpose,
  error,
  sizeVariant = 'w-28',
  onUploadingStateChange,
  allowPublicUpload = false,
  requireServerUpload = false,
  onUploadStatusChange,
  onFileSelected,
  previewOnly = false
}) => {
  const { showSuccess, showError } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stored file reference for retries
  const selectedFileRef = useRef<File | null>(null);

  // Core required variables to track on frontend
  const [mediaFileId, setMediaFileId] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>(value || '');

  // Local blob preview (held separately to avoid flashing or blank states)
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string>('');

  // Operational states: 'empty' | 'preparing' | 'uploading' | 'uploaded' | 'upload_failed' | 'display_failed'
  const [uploadState, setUploadState] = useState<PhotoUploadState>(
    value ? (requireServerUpload && !isSavedMediaReference(value) ? 'upload_failed' : 'uploaded') : 'empty'
  );

  // Status of the currently active image tag load: 'idle' | 'loading' | 'loaded' | 'failed'
  const [imageStatus, setImageStatus] = useState<'idle' | 'loading' | 'loaded' | 'failed'>(
    value ? 'loading' : 'idle'
  );

  // Track the actual image src we pass to the <img /> tag
  const [displayedUrl, setDisplayedUrl] = useState<string>(value || '');

  // Keep a set of blob URLs we created to revoke them safely when they are no longer needed
  const blobUrlsRef = useRef<Set<string>>(new Set());

  // Notify parent of state changes
  useEffect(() => {
    onUploadStatusChange?.(uploadState);
  }, [uploadState, onUploadStatusChange]);

  // Function to register a blob URL for cleanup
  const registerBlobUrl = (url: string) => {
    if (url.startsWith('blob:')) {
      blobUrlsRef.current.add(url);
    }
  };

  // Sync value changes from parent (essential for initialization and reset)
  useEffect(() => {
    if (value) {
      if (previewOnly) {
        setLocalPreviewUrl(value);
        setDisplayedUrl(value);
        setImageStatus('loading');
        setUploadState('uploaded');
        return;
      }
      if (requireServerUpload && !isSavedMediaReference(value)) {
        setImageUrl('');
        setMediaFileId('');
        setLocalPreviewUrl(value);
        setDisplayedUrl(value);
        setImageStatus('loading');
        setUploadState('upload_failed');
        return;
      }
      setImageUrl(value);
      setDisplayedUrl(value);
      setImageStatus('loading');
      setUploadState('uploaded');

      // Attempt to extract existing media ID from URL
      const fileIdMatch = value.match(/\/api\/media\/files\/([a-zA-Z0-9-]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        setMediaFileId(fileIdMatch[1]);
      }
    } else {
      // Only clear if requireServerUpload isn't in a failed state we want to preserve, or if value is explicitly cleared
      setImageUrl('');
      setMediaFileId('');
      setLocalPreviewUrl('');
      setDisplayedUrl('');
      setImageStatus('idle');
      setUploadState('empty');
      if (previewOnly) {
        onFileSelected?.(null);
      }
    }
  }, [value, requireServerUpload, previewOnly]);

  // Clean up all allocated local object URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          console.warn('[DevLog] Failed to revoke object URL on unmount:', e);
        }
      });
      blobUrlsRef.current.clear();
    };
  }, []);

  const handleBoxClick = () => {
    if (uploadState === 'preparing' || uploadState === 'uploading') {
      return; // prevent click actions while processing is active
    }
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleBoxClick();
    }
  };

  const performUpload = async (file: File) => {
    if (!navigator.onLine) {
      showError('You are offline', 'Please reconnect before sending these details.');
      return;
    }

    onUploadingStateChange?.(true);
    setUploadState('preparing');
    if (requireServerUpload) {
      setMediaFileId('');
      setImageUrl('');
    }

    // Create immediate local blob URL of raw file
    const rawLocalUrl = URL.createObjectURL(file);
    registerBlobUrl(rawLocalUrl);
    setLocalPreviewUrl(rawLocalUrl);
    setDisplayedUrl(rawLocalUrl);
    setImageStatus('loading');

    try {
      // Compress file
      const compressionResult = await compressImageBeforeUpload(file);
      
      // Update local preview to the optimized one
      const compressedBlobUrl = compressionResult.previewUrl;
      registerBlobUrl(compressedBlobUrl);
      setLocalPreviewUrl(compressedBlobUrl);
      setDisplayedUrl(compressedBlobUrl);

      if (previewOnly) {
        setUploadState('uploaded');
        setImageStatus('loading');
        onFileSelected?.(compressionResult.compressedFile as File);
        onUploaded(compressedBlobUrl);
        onUploadingStateChange?.(false);
        return;
      }

      setUploadState('uploading');

      if (api.getToken() || allowPublicUpload) {
        const uploadRes = api.getToken()
          ? await api.media.uploadFile(compressionResult.compressedFile, purpose)
          : await api.media.publicUploadFile(compressionResult.compressedFile, purpose);
        
        const secureUrl = uploadRes.url || `/api/media/files/${uploadRes.id}`;
        
        console.log('[DevLog] Media upload response:', uploadRes);

        // Set state values
        setMediaFileId(uploadRes.id);
        setImageUrl(secureUrl);

        // Transition display URL to the loaded remote secure URL,
        // but do not clear localPreviewUrl yet so fallback is preserved!
        setDisplayedUrl(secureUrl);
        setImageStatus('loading');
        setUploadState('uploaded');

        // Notify parent of the change
        onUploaded(secureUrl);
      } else {
        if (requireServerUpload) {
          throw new Error('Server upload is required, but user is unauthenticated.');
        }
        // Fallback local-only preview if not logged in
        setUploadState('uploaded');
        setImageStatus('loaded');
        onUploaded(compressedBlobUrl);
        showSuccess('Photo added', 'Saved local preview.');
      }
    } catch (err: any) {
      console.error('[DevLog] Photo upload failed:', err);
      setUploadState('upload_failed');
      if (requireServerUpload) {
        onUploaded('');
      }
      showError('Photo could not be saved', err.message || 'Please choose another photo and try again.');
    } finally {
      onUploadingStateChange?.(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict validation check for file type and size (Max 10MB)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setUploadState('upload_failed');
      if (requireServerUpload) {
        onUploaded('');
      }
      showError('Invalid file type', 'Only JPG, PNG and WebP images are allowed.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSizeBytes) {
      setUploadState('upload_failed');
      if (requireServerUpload) {
        onUploaded('');
      }
      showError('File too large', 'Maximum image size is 10MB.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    selectedFileRef.current = file;
    if (requireServerUpload) {
      onUploaded('');
    }
    await performUpload(file);
  };

  const handleRetryUpload = async () => {
    if (selectedFileRef.current) {
      await performUpload(selectedFileRef.current);
    } else {
      showError('No file selected', 'Please choose a photo to upload.');
    }
  };

  const handleImageLoad = () => {
    console.log('[DevLog] Image loaded successfully:', displayedUrl);
    setImageStatus('loaded');
  };

  const handleImageError = () => {
    console.error('[DevLog] Image display failed:', displayedUrl);

    // If secureUrl image fails, try local preview if still available
    if (displayedUrl === imageUrl && localPreviewUrl && displayedUrl !== localPreviewUrl) {
      console.log('[DevLog] Trying fallback to local preview URL:', localPreviewUrl);
      setDisplayedUrl(localPreviewUrl);
      setImageStatus('loading');
    } else {
      setImageStatus('failed');
      setUploadState('display_failed');
    }
  };

  // Border style
  const isPickup = purpose === 'pickup_person_photo';
  const borderClasses = isPickup
    ? `border-2 border-dashed ${uploadState === 'upload_failed' || uploadState === 'display_failed' || error ? 'border-[#C53030]' : 'border-[#D9D6CE] hover:border-[#C59B27]'}`
    : `border ${uploadState === 'upload_failed' || uploadState === 'display_failed' || error ? 'border-[#C53030]' : 'border-[#EAE8E1] hover:border-[#C59B27]'}`;

  // Aria labels
  const getAriaLabel = () => {
    switch (uploadState) {
      case 'empty':
        return `Upload ${label || 'photo'}. Click to choose a file.`;
      case 'preparing':
        return 'Preparing photo...';
      case 'uploading':
        return 'Uploading photo...';
      case 'uploaded':
        return requireServerUpload ? 'Photo ready. Click to change.' : 'Photo added. Click to change.';
      case 'upload_failed':
        return 'Photo could not be saved.';
      case 'display_failed':
        return 'Photo could not be displayed.';
      default:
        return 'Photo upload box';
    }
  };

  // Determine fixed sizing class and direct styles to prevent expanding/shrinking
  let widthClass = 'w-28';
  let heightClass = 'h-28';
  if (sizeVariant === 'w-24') {
    widthClass = 'w-24';
    heightClass = 'h-24';
  } else if (sizeVariant === 'w-24-28') {
    widthClass = 'w-24 sm:w-28';
    heightClass = 'h-24 sm:h-28';
  } else if (isPickup) {
    widthClass = 'w-24';
    heightClass = 'h-24';
  }

  return (
    <div className="flex flex-col items-center">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Frame Container - Fixed size, overflow-hidden, flex-none */}
      <div
        onClick={handleBoxClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={getAriaLabel()}
        aria-live="polite"
        className={`${widthClass} ${heightClass} ${borderClasses} bg-[#FAF8F4] rounded-2xl flex-none flex flex-col items-center justify-center cursor-pointer transition-all duration-200 relative overflow-hidden group shadow-2xs`}
      >
        {/* Render base fallback if empty or completely failed */}
        {((uploadState === 'empty' && !displayedUrl) || uploadState === 'display_failed') && (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <Camera className="w-6 h-6 text-[#715D3A] stroke-[1.75] mb-1.5" />
            <span className="text-xs font-bold text-[#715D3A]">{label || 'Add Photo'}</span>
          </div>
        )}

        {/* Preparing overlay */}
        {uploadState === 'preparing' && (
          <div className="flex flex-col items-center justify-center p-4 text-center bg-white/90 absolute inset-0 z-10">
            <div className="text-xs font-medium text-[#715D3A] animate-pulse">Preparing photo...</div>
          </div>
        )}

        {/* Uploading overlay */}
        {uploadState === 'uploading' && (
          <div className="flex flex-col items-center justify-center p-4 text-center bg-white/90 absolute inset-0 z-10">
            <div className="text-xs font-medium text-[#715D3A] animate-pulse">Saving photo...</div>
          </div>
        )}

        {/* Upload Failed overlay */}
        {uploadState === 'upload_failed' && (
          <div className="flex flex-col items-center justify-center p-2 text-center bg-black/65 absolute inset-0 z-10 text-white">
            <AlertCircle className="w-5 h-5 text-red-400 mb-1" />
            <div className="text-[11px] font-bold text-white leading-snug">Photo not saved</div>
            {selectedFileRef.current && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRetryUpload();
                }}
                className="mt-1.5 px-2 py-0.5 bg-[#C59B27] hover:bg-[#A67C2E] text-white text-[10px] font-bold rounded-md shadow-sm transition-colors cursor-pointer"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {/* Display Image (Always use cover / center / block / 100% dimensions) */}
        {displayedUrl && uploadState !== 'display_failed' && (
          <>
            <img
              src={resolveMediaUrl(displayedUrl)}
              alt="Preview"
              onLoad={handleImageLoad}
              onError={handleImageError}
              className="w-full h-full object-cover object-center block"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            {/* Hover overlay to change photo */}
            {uploadState !== 'preparing' && uploadState !== 'uploading' && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-semibold">
                Change photo
              </div>
            )}
          </>
        )}
      </div>

      {/* Underneath Helper Text / Labels / Messages */}
      {/* "Photo added" / "Photo ready" only shows if image is visible/loaded successfully */}
      {uploadState === 'uploaded' && imageStatus === 'loaded' && (
        <span className="text-[11px] font-semibold text-emerald-700 mt-2 flex items-center justify-center gap-1">
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          {previewOnly ? 'Photo selected' : (requireServerUpload ? 'Photo ready' : 'Photo added')}
        </span>
      )}

      {/* Custom label/help text if display fails */}
      {uploadState === 'display_failed' && (
        <div className="text-center mt-2 max-w-[240px]">
          <p className="text-[11px] font-bold text-[#C53030]">Photo could not be displayed</p>
          <p className="text-[10px] text-[#715D3A] mt-0.5">Please try another photo.</p>
        </div>
      )}

      {/* Upload failed label */}
      {uploadState === 'upload_failed' && (
        <div className="text-center mt-2 max-w-[240px]">
          <p className="text-[11px] font-semibold text-[#C53030]">Photo not saved</p>
          <p className="text-[10px] text-[#715D3A] mt-0.5">
            {selectedFileRef.current ? 'Tap "Try again" to retry saving.' : 'Please try another photo.'}
          </p>
        </div>
      )}

      {/* Standard non-failed helperText */}
      {uploadState !== 'upload_failed' && uploadState !== 'display_failed' && (uploadState !== 'uploaded' || imageStatus !== 'loaded') && helperText && (
        <span className="text-xs text-[#3F3F46] mt-3 block font-medium text-center">
          {helperText}
        </span>
      )}

      {error && uploadState !== 'upload_failed' && uploadState !== 'display_failed' && (
        <p className="text-xs text-[#C53030] mt-2 font-medium text-center">
          {error}
        </p>
      )}
    </div>
  );
};
