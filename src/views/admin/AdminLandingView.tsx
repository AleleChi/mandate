import React, { useState, useEffect } from 'react';
import { 
  Image as ImageIcon, 
  Camera, 
  Sparkles, 
  Shield, 
  Users, 
  Video, 
  Upload, 
  Trash2, 
  AlertCircle, 
  Check, 
  Loader2, 
  RefreshCw,
  HelpCircle,
  FileVideo
} from 'lucide-react';
import { api } from '../../services/api';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';

interface AdminLandingViewProps {
  isSuperAdmin: boolean;
}

interface MediaSlot {
  key: string;
  label: string;
  description: string;
  dimensions: string;
  type: 'image' | 'video';
  purpose: 'landing_image' | 'event_video';
  icon: 'camera' | 'sparkles' | 'shield' | 'users' | 'video' | 'default';
  category: 'brand' | 'hero' | 'interactive' | 'gallery';
}

const MEDIA_SLOTS: MediaSlot[] = [
  {
    key: 'site_logo',
    label: 'Brand Header Logo',
    description: 'Header logo displayed on the top-left of all public pages.',
    dimensions: '128x128px (PNG or WebP with transparent background recommended)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'sparkles',
    category: 'brand'
  },
  {
    key: 'heroMain',
    label: 'Main Hero Foreground Image',
    description: 'The large foreground curved image in the editorial hero section.',
    dimensions: '800x1000px (Aspect ratio 4:5, high quality portrait image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'hero'
  },
  {
    key: 'heroUpper',
    label: 'Hero Back Background Image',
    description: 'The background stacked card image positioned behind the main hero image.',
    dimensions: '600x800px (Aspect ratio 3:4, portrait image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'hero'
  },
  {
    key: 'heroRight',
    label: 'Hero Front Right Image',
    description: 'The smaller foreground stacked card image floating on the right side.',
    dimensions: '500x500px (Aspect ratio 1:1, square portrait image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'hero'
  },
  {
    key: 'heroVideo',
    label: 'Hero Ambient Background Video',
    description: 'Muted atmospheric video looping softly behind the hero text content.',
    dimensions: '1080p MP4 or WebM format, optimized compression (<20MB recommended)',
    type: 'video',
    purpose: 'event_video',
    icon: 'video',
    category: 'hero'
  },
  {
    key: 'passAvatar',
    label: 'Interactive Pass - Child Avatar Demo',
    description: 'The child avatar headshot used inside the live interactive scan-pass preview.',
    dimensions: '256x256px (Aspect ratio 1:1, high contrast face photo)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'users',
    category: 'interactive'
  },
  {
    key: 'workerAvatar',
    label: 'Interactive Pass - Worker Avatar Demo',
    description: 'The volunteer check-in staff photo used inside the live interactive scan-pass preview.',
    dimensions: '256x256px (Aspect ratio 1:1, friendly face photo)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'users',
    category: 'interactive'
  },
  {
    key: 'safetySection',
    label: 'Safety Section Image',
    description: 'The main illustrative graphic representing child secure verification systems.',
    dimensions: '800x600px (Aspect ratio 4:3, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'shield',
    category: 'gallery'
  },
  {
    key: 'galleryArrival',
    label: 'Gallery - Arrival Step',
    description: 'Photo illustrating the arrival phase of kids in the past moments section.',
    dimensions: '900x600px (Aspect ratio 3:2, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'gallery'
  },
  {
    key: 'galleryCheckIn',
    label: 'Gallery - Check-In Step',
    description: 'Photo illustrating the security check-in desk phase in the gallery.',
    dimensions: '900x600px (Aspect ratio 3:2, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'gallery'
  },
  {
    key: 'galleryActivities',
    label: 'Gallery - Activities Step',
    description: 'Photo showing high-energy games and social activities in the gallery.',
    dimensions: '900x600px (Aspect ratio 3:2, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'gallery'
  },
  {
    key: 'galleryTeaching',
    label: 'Gallery - Teaching Step',
    description: 'Photo representing kids learning and curriculum sessions in the gallery.',
    dimensions: '900x600px (Aspect ratio 3:2, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'gallery'
  },
  {
    key: 'galleryCareTeam',
    label: 'Gallery - Care Team Step',
    description: 'Photo highlighting the warm volunteer care team staff members in the gallery.',
    dimensions: '900x600px (Aspect ratio 3:2, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'gallery'
  },
  {
    key: 'galleryPickup',
    label: 'Gallery - Safe Checkout Step',
    description: 'Photo demonstrating secure child checkout/parent matches in the gallery.',
    dimensions: '900x600px (Aspect ratio 3:2, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'gallery'
  },
  {
    key: 'galleryParentUpdates',
    label: 'Gallery - Parent Updates Step',
    description: 'Photo showing parents receiving updates and live push notifications.',
    dimensions: '900x600px (Aspect ratio 3:2, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'gallery'
  },
  {
    key: 'galleryEventMoments',
    label: 'Gallery - Event Highlight Video Cover',
    description: 'Cover photo shown initially over the video card play trigger.',
    dimensions: '900x600px (Aspect ratio 3:2, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'gallery'
  },
  {
    key: 'galleryEventVideo',
    label: 'Gallery - Event Highlights Video Clip',
    description: 'Active highlight video clip played when clicking the video gallery moment.',
    dimensions: '1080p MP4 or WebM format, optimized compression (<25MB recommended)',
    type: 'video',
    purpose: 'event_video',
    icon: 'video',
    category: 'gallery'
  }
];

export const AdminLandingView: React.FC<AdminLandingViewProps> = ({ isSuperAdmin }) => {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<'all' | 'brand' | 'hero' | 'interactive' | 'gallery'>('all');
  
  // Per-slot upload states
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [resettingSlot, setResettingSlot] = useState<string | null>(null);
  const [errorSlot, setErrorSlot] = useState<{ [key: string]: string }>({});
  const [successSlot, setSuccessSlot] = useState<{ [key: string]: string }>({});

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await api.admin.getLandingSettings();
      if (res.success) {
        setSettings(res.settings || {});
      }
    } catch (err: any) {
      console.error('Failed to load landing settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleFileUpload = async (slotKey: string, file: File, purpose: 'landing_image' | 'event_video') => {
    setErrorSlot(prev => ({ ...prev, [slotKey]: '' }));
    setSuccessSlot(prev => ({ ...prev, [slotKey]: '' }));
    
    const slotSpec = MEDIA_SLOTS.find(s => s.key === slotKey);
    if (!slotSpec) return;

    // Validations with file extension fallback for robustness
    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    const isVideoFile = file.type.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(fileExt);

    // Slot type validations
    if (slotSpec.type === 'video' && !isVideoFile) {
      setErrorSlot(prev => ({ ...prev, [slotKey]: 'Please upload a video file (MP4, WebM, or MOV) for this video-only slot.' }));
      return;
    }
    if (slotSpec.type === 'image' && isVideoFile) {
      setErrorSlot(prev => ({ ...prev, [slotKey]: 'Please upload an image file (JPG, PNG, or WebP) for this image-only slot.' }));
      return;
    }

    if (isVideoFile) {
      const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
      const allowedVideoExts = ['mp4', 'webm', 'mov'];
      if (!allowedVideoTypes.includes(file.type) && !allowedVideoExts.includes(fileExt)) {
        setErrorSlot(prev => ({ ...prev, [slotKey]: 'Please choose an MP4, WebM, or MOV video format.' }));
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setErrorSlot(prev => ({ ...prev, [slotKey]: 'File size is too large. Maximum video size is 50MB.' }));
        return;
      }
    } else {
      const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      const allowedImageExts = ['jpg', 'jpeg', 'png', 'webp'];
      if (!allowedImageTypes.includes(file.type) && !allowedImageExts.includes(fileExt)) {
        setErrorSlot(prev => ({ ...prev, [slotKey]: 'Please choose a JPG, PNG, or WebP image format.' }));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setErrorSlot(prev => ({ ...prev, [slotKey]: 'File size is too large. Maximum image size is 10MB.' }));
        return;
      }
    }

    try {
      setUploadingSlot(slotKey);
      
      // 1. Upload via file endpoint with slotKey passed for server-side processing specifications
      const uploadRes = await api.media.uploadFile(file, purpose, slotKey);
      const fileUrl = uploadRes.url || uploadRes.secureUrl;
      
      if (!fileUrl) {
        throw new Error('Failed to retrieve file storage URL');
      }

      // 2. Persist slot config update on server
      const updatedSettings = { ...settings, [slotKey]: fileUrl };
      const saveRes = await api.admin.updateLandingSettings({ [slotKey]: fileUrl });
      
      if (saveRes.success) {
        setSettings(updatedSettings);
        setSuccessSlot(prev => ({ ...prev, [slotKey]: 'Uploaded and saved successfully.' }));
        setTimeout(() => {
          setSuccessSlot(prev => ({ ...prev, [slotKey]: '' }));
        }, 4000);
      } else {
        throw new Error('Failed to update landing page config');
      }
    } catch (err: any) {
      console.error('Upload failed for slot:', slotKey, err);
      let friendlyMessage = err?.message || 'Upload failed. Please try again.';
      // Fail-safe to never expose low-level sharp/system errors or raw trace details
      if (
        friendlyMessage.toLowerCase().includes('sharp') || 
        friendlyMessage.toLowerCase().includes('process') || 
        friendlyMessage.toLowerCase().includes('failed to fetch') ||
        friendlyMessage.toLowerCase().includes('request failed') ||
        friendlyMessage.toLowerCase().includes('stack') ||
        friendlyMessage.toLowerCase().includes('error')
      ) {
        friendlyMessage = 'We could not process this image. Please try another JPG, PNG, or WebP file.';
      }
      setErrorSlot(prev => ({ ...prev, [slotKey]: friendlyMessage }));
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleResetSlot = async (slotKey: string) => {
    if (!window.confirm(`Are you sure you want to restore the default fallback configuration for this slot? This will clear any uploaded custom media.`)) {
      return;
    }

    setErrorSlot(prev => ({ ...prev, [slotKey]: '' }));
    setSuccessSlot(prev => ({ ...prev, [slotKey]: '' }));

    try {
      setResettingSlot(slotKey);
      
      const updatedSettings = { ...settings, [slotKey]: '' };
      const saveRes = await api.admin.updateLandingSettings({ [slotKey]: '' });
      
      if (saveRes.success) {
        setSettings(updatedSettings);
        setSuccessSlot(prev => ({ ...prev, [slotKey]: 'Restored to default successfully.' }));
        setTimeout(() => {
          setSuccessSlot(prev => ({ ...prev, [slotKey]: '' }));
        }, 4000);
      } else {
        throw new Error('Failed to save configuration update');
      }
    } catch (err: any) {
      console.error('Reset failed for slot:', slotKey, err);
      setErrorSlot(prev => ({ ...prev, [slotKey]: err?.message || 'Restore failed. Please try again.' }));
    } finally {
      setResettingSlot(null);
    }
  };

  const filteredSlots = activeCategory === 'all' 
    ? MEDIA_SLOTS 
    : MEDIA_SLOTS.filter(s => s.category === activeCategory);

  const getSlotIcon = (iconName: string) => {
    switch (iconName) {
      case 'camera': return <Camera className="w-5 h-5 text-[#C59B27]" />;
      case 'sparkles': return <Sparkles className="w-5 h-5 text-[#C59B27]" />;
      case 'shield': return <Shield className="w-5 h-5 text-[#C59B27]" />;
      case 'users': return <Users className="w-5 h-5 text-[#C59B27]" />;
      case 'video': return <Video className="w-5 h-5 text-[#C59B27]" />;
      default: return <ImageIcon className="w-5 h-5 text-[#C59B27]" />;
    }
  };

  if (loading) {
    return (
      <div className="w-full">
        <KoinoniaInlineLoader
          variant="logo"
          size="md"
          label="Loading Landing Page configuration slots..."
          fullCard
          centered
        />
      </div>
    );
  }

  return (
    <div className="space-y-8" id="admin-landing-manager">
      {/* Intro Header Card */}
      <div className="bg-[#FAF8F3] border border-[#E5D5AE] rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 shadow-2xs">
        <div className="space-y-1.5 max-w-2xl">
          <span className="text-[10px] sm:text-[11px] font-bold tracking-widest text-[#9A7326] uppercase font-sans">
            Koinonia Content Management
          </span>
          <h2 className="text-2xl sm:text-3xl font-serif-koinonia font-bold text-[#18181B] leading-tight">
            Landing Page Manager
          </h2>
          <p className="text-xs sm:text-sm text-[#6B7280]">
            Customize logo, media composition frames, pass avatars, event gallery, and atmosphere loops. 
            Empty slots cleanly auto-revert to the default elegant vector illustrations or brand layout rules.
          </p>
        </div>
        <button 
          onClick={fetchSettings}
          className="flex items-center space-x-1.5 text-xs font-semibold bg-white border border-[#EAE8E1] hover:bg-[#FAF9F6] text-zinc-700 px-4 py-2.5 rounded-xl shadow-2xs transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
          <span>Sync State</span>
        </button>
      </div>

      {/* Categories Toolbar */}
      <div className="flex border-b border-[#EAE8E1] overflow-x-auto gap-1 scrollbar-none pb-0.5">
        {[
          { id: 'all', label: 'All Content Slots' },
          { id: 'brand', label: 'Header & Brand' },
          { id: 'hero', label: 'Hero Cover & Composition' },
          { id: 'interactive', label: 'Demo Cards' },
          { id: 'gallery', label: 'Gallery & Illustration' },
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id as any)}
            className={`py-2.5 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap focus:outline-none cursor-pointer ${
              activeCategory === cat.id 
                ? 'border-[#C59B27] text-[#C59B27]' 
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid of Slots */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredSlots.map((slot) => {
          const customUrl = settings[slot.key];
          const isUploading = uploadingSlot === slot.key;
          const isResetting = resettingSlot === slot.key;
          const errorMsg = errorSlot[slot.key];
          const successMsg = successSlot[slot.key];

          return (
            <div 
              key={slot.key}
              className="bg-white border border-[#EAE8E1] rounded-3xl p-5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow relative overflow-hidden"
            >
              {/* Slot Header */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#FAF6EB] border border-[#E5D5AE]/50 flex items-center justify-center shrink-0">
                      {getSlotIcon(slot.icon)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#18181B] font-serif-koinonia leading-none">
                        {slot.label}
                      </h4>
                      <p className="text-[11px] text-zinc-400 font-sans mt-1">
                        Slot: <code className="font-mono bg-zinc-50 px-1 py-0.5 rounded text-[10px] text-zinc-600">{slot.key}</code>
                      </p>
                    </div>
                  </div>
                  {customUrl ? (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 uppercase tracking-wide">
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50/50 px-2.5 py-1 rounded-full border border-amber-100 uppercase tracking-wide">
                      Default Fallback
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    {slot.description}
                  </p>
                  <div className="flex items-center space-x-1.5 text-[11px] text-[#9A7326] bg-[#FAF8F3] px-3 py-1.5 rounded-xl border border-[#E5D5AE]/30">
                    <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                    <span><strong>Specs:</strong> {slot.dimensions}</span>
                  </div>
                </div>

                {/* Media Preview Stage */}
                <div className="relative mt-3 h-48 bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl overflow-hidden flex items-center justify-center">
                  {isUploading ? (
                    <div className="p-4 w-full">
                      <KoinoniaInlineLoader
                        variant="logo"
                        size="sm"
                        label="Loading updates..."
                        centered
                      />
                    </div>
                  ) : customUrl ? (
                    slot.type === 'video' ? (
                      <div className="relative w-full h-full group">
                        <video 
                          src={customUrl} 
                          controls
                          playsInline
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-md font-mono pointer-events-none">
                          Video Slot
                        </div>
                      </div>
                    ) : (
                      <img 
                        src={customUrl} 
                        alt={slot.label} 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain"
                      />
                    )
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-6 space-y-2 select-none">
                      {slot.type === 'video' ? (
                        <FileVideo className="w-8 h-8 text-[#C59B27]/40" />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-[#C59B27]/40" />
                      )}
                      <div>
                        <p className="text-xs font-serif-koinonia font-bold text-zinc-700">Awaiting Custom Upload</p>
                        <p className="text-[10px] text-zinc-400 mt-0.5">Rendered using clean native fallbacks</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Area */}
              <div className="mt-5 space-y-3">
                {errorMsg && (
                  <div className="flex items-start space-x-1.5 text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-100">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}
                {successMsg && (
                  <div className="flex items-center space-x-1.5 text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <label className="flex-1">
                    <input 
                      type="file" 
                      className="hidden" 
                      accept={slot.type === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/jpg,image/png,image/webp'}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(slot.key, file, slot.purpose);
                      }}
                      disabled={isUploading || isResetting}
                    />
                    <div className="flex items-center justify-center space-x-1.5 bg-[#FAF6EB] hover:bg-[#FAF2DF] active:bg-[#F3E6C7] text-[#9A7326] border border-[#E5D5AE] text-xs font-bold px-4 py-3 rounded-xl shadow-2xs transition-colors cursor-pointer select-none">
                      <Upload className="w-3.5 h-3.5 shrink-0" />
                      <span>{customUrl ? 'Replace Media' : 'Upload Media'}</span>
                    </div>
                  </label>

                  {customUrl && (
                    <button
                      onClick={() => handleResetSlot(slot.key)}
                      disabled={isUploading || isResetting}
                      className="bg-white border border-[#EAE8E1] hover:bg-rose-50 text-zinc-400 hover:text-rose-600 active:bg-rose-100 p-3 rounded-xl shadow-2xs transition-all cursor-pointer focus:outline-none"
                      title="Restore Default Fallback"
                    >
                      {isResetting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
