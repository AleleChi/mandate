import React, { useState, useEffect, useRef } from 'react';
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
  FileVideo,
  Plus,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Edit3,
  X,
  Globe,
  Maximize2,
  Search,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { api, AdminGalleryItem, PublicGalleryItem } from '../../services/api';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { AssetImage } from '../../components/common/AssetImage';
import { CurvedPhotoGallery } from '../../components/common/CurvedPhotoGallery';

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
    dimensions: '256x256px (Aspect ratio 1:1, warm portrait photo)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'users',
    category: 'interactive'
  },
  {
    key: 'safetySection',
    label: 'Child Care & Safety Section Photo',
    description: 'Photograph showcasing child protection, check-in desks, or safe volunteer environments.',
    dimensions: '1200x800px (Aspect ratio 3:2, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'shield',
    category: 'interactive'
  },
  {
    key: 'galleryArrival',
    label: 'Gallery - Arrival Step',
    description: 'Photo showing family arrival and welcome in the 8-step past moments reel.',
    dimensions: '900x600px (Aspect ratio 3:2, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'gallery'
  },
  {
    key: 'galleryCheckIn',
    label: 'Gallery - Check-in Step',
    description: 'Photo illustrating the security check-in desk phase in the 8-step past moments reel.',
    dimensions: '900x600px (Aspect ratio 3:2, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'gallery'
  },
  {
    key: 'galleryActivities',
    label: 'Gallery - Activities Step',
    description: 'Photo showing high-energy games and social activities in the 8-step past moments reel.',
    dimensions: '900x600px (Aspect ratio 3:2, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'gallery'
  },
  {
    key: 'galleryTeaching',
    label: 'Gallery - Teaching Step',
    description: 'Photo representing kids learning and curriculum sessions in the 8-step past moments reel.',
    dimensions: '900x600px (Aspect ratio 3:2, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'gallery'
  },
  {
    key: 'galleryCareTeam',
    label: 'Gallery - Care Team Step',
    description: 'Photo highlighting the warm volunteer care team staff members in the 8-step past moments reel.',
    dimensions: '900x600px (Aspect ratio 3:2, landscape image)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'gallery'
  },
  {
    key: 'galleryPickup',
    label: 'Gallery - Safe Checkout Step',
    description: 'Photo demonstrating secure child checkout/parent matches in the 8-step past moments reel.',
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
  // Main view switcher: 'slots' for individual slot overrides, 'gallery' for the orbital photo gallery
  const [mainTab, setMainTab] = useState<'slots' | 'gallery'>('slots');

  // Core Slots state
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<'all' | 'brand' | 'hero' | 'interactive' | 'gallery'>('all');
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [resettingSlot, setResettingSlot] = useState<string | null>(null);
  const [errorSlot, setErrorSlot] = useState<{ [key: string]: string }>({});
  const [successSlot, setSuccessSlot] = useState<{ [key: string]: string }>({});

  // Orbital Photo Gallery state
  const [galleryItems, setGalleryItems] = useState<AdminGalleryItem[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminGalleryItem | null>(null);
  const [showLivePreview, setShowLivePreview] = useState(false);

  // Gallery Filters, View Modes & Pagination for Large Collections (40+ photos)
  const [gallerySearch, setGallerySearch] = useState('');
  const [galleryStatusFilter, setGalleryStatusFilter] = useState<'all' | 'active' | 'draft'>('all');
  const [galleryViewMode, setGalleryViewMode] = useState<'cards' | 'compact'>('cards');
  const [galleryPage, setGalleryPage] = useState(1);
  const [galleryPageSize, setGalleryPageSize] = useState<number>(12);

  // Filtered & Paginated gallery items
  const filteredGalleryItems = React.useMemo(() => {
    return galleryItems.filter(item => {
      if (galleryStatusFilter === 'active' && item.is_active !== 1) return false;
      if (galleryStatusFilter === 'draft' && item.is_active === 1) return false;
      if (gallerySearch.trim()) {
        const q = gallerySearch.toLowerCase();
        const matchCaption = (item.caption || '').toLowerCase().includes(q);
        const matchAlt = (item.alt_text || '').toLowerCase().includes(q);
        if (!matchCaption && !matchAlt) return false;
      }
      return true;
    });
  }, [galleryItems, galleryStatusFilter, gallerySearch]);

  const totalPages = Math.max(1, Math.ceil(filteredGalleryItems.length / galleryPageSize));
  const paginatedGalleryItems = React.useMemo(() => {
    if (galleryPageSize >= 999) return filteredGalleryItems;
    const start = (galleryPage - 1) * galleryPageSize;
    return filteredGalleryItems.slice(start, start + galleryPageSize);
  }, [filteredGalleryItems, galleryPage, galleryPageSize]);

  // Add / Edit Modal state
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalPreview, setModalPreview] = useState<string | null>(null);
  const [modalAltText, setModalAltText] = useState('');
  const [modalCaption, setModalCaption] = useState('');
  const [modalIsActive, setModalIsActive] = useState(true);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch Landing Settings (Slots)
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

  // 2. Fetch Orbital Gallery Items
  const fetchGalleryItems = async () => {
    try {
      setLoadingGallery(true);
      const res = await api.gallery.getAdminItems();
      if (res.success) {
        setGalleryItems(res.items || []);
      }
    } catch (err: any) {
      console.error('Failed to load gallery items:', err);
    } finally {
      setLoadingGallery(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchGalleryItems();
  }, []);

  // Handler for Core Slots Upload
  const handleFileUpload = async (slotKey: string, file: File, purpose: 'landing_image' | 'event_video') => {
    setErrorSlot(prev => ({ ...prev, [slotKey]: '' }));
    setSuccessSlot(prev => ({ ...prev, [slotKey]: '' }));
    
    const slotSpec = MEDIA_SLOTS.find(s => s.key === slotKey);
    if (!slotSpec) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    const isVideoFile = file.type.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(fileExt);

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
      const uploadRes = await api.media.uploadFile(file, purpose, slotKey);
      const fileUrl = uploadRes.url || uploadRes.secureUrl;
      
      if (!fileUrl) {
        throw new Error('Upload succeeded but server returned empty file address.');
      }

      await api.admin.updateLandingSettings({ [slotKey]: fileUrl });
      setSettings(prev => ({ ...prev, [slotKey]: fileUrl }));
      setSuccessSlot(prev => ({ ...prev, [slotKey]: 'Media uploaded & live!' }));
      setTimeout(() => setSuccessSlot(prev => ({ ...prev, [slotKey]: '' })), 4000);
    } catch (err: any) {
      console.error('Upload failed for slot:', slotKey, err);
      setErrorSlot(prev => ({ ...prev, [slotKey]: err?.message || 'Upload failed. Please try again.' }));
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleResetSlot = async (slotKey: string) => {
    if (!window.confirm('Restore this media frame to its default branded visual illustration?')) return;
    try {
      setResettingSlot(slotKey);
      setErrorSlot(prev => ({ ...prev, [slotKey]: '' }));
      await api.admin.updateLandingSettings({ [slotKey]: '' });
      setSettings(prev => ({ ...prev, [slotKey]: '' }));
    } catch (err: any) {
      console.error('Reset failed for slot:', slotKey, err);
      setErrorSlot(prev => ({ ...prev, [slotKey]: err?.message || 'Restore failed. Please try again.' }));
    } finally {
      setResettingSlot(null);
    }
  };

  // ----------------------------------------------------
  // Orbital Photo Gallery Actions
  // ----------------------------------------------------
  const handleMoveGalleryItem = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= galleryItems.length) return;

    const newItems = [...galleryItems];
    const [moved] = newItems.splice(index, 1);
    newItems.splice(targetIndex, 0, moved);
    setGalleryItems(newItems);

    try {
      await api.gallery.reorderItems(newItems.map(i => i.id));
    } catch (err) {
      console.error('Failed to save gallery order:', err);
      fetchGalleryItems();
    }
  };

  const handleToggleGalleryActive = async (item: AdminGalleryItem) => {
    const nextState = item.is_active === 1 ? 0 : 1;
    setGalleryItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: nextState } : i));
    try {
      await api.gallery.updateItem(item.id, { is_active: nextState });
    } catch (err) {
      console.error('Failed to toggle active state:', err);
      fetchGalleryItems();
    }
  };

  const handleDeleteGalleryItem = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this photograph from the landing page gallery?')) return;
    try {
      await api.gallery.deleteItem(id);
      setGalleryItems(prev => prev.filter(i => i.id !== id));
    } catch (err: any) {
      alert(err?.message || 'Failed to remove photo.');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setModalError('File size is too large. Maximum size is 10MB.');
      return;
    }

    setModalFile(file);
    setModalError(null);

    const reader = new FileReader();
    reader.onload = () => {
      setModalPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveNewGalleryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalFile) {
      setModalError('Please choose a photograph to upload (JPG, PNG, or WebP).');
      return;
    }
    if (!modalAltText.trim()) {
      setModalError('Accessible Alt Text is required for screen readers and search engines.');
      return;
    }

    try {
      setIsSavingItem(true);
      setModalError(null);

      const formData = new FormData();
      formData.append('file', modalFile);
      formData.append('alt_text', modalAltText.trim());
      if (modalCaption.trim()) {
        formData.append('caption', modalCaption.trim());
      }
      formData.append('is_active', modalIsActive ? '1' : '0');

      const res = await api.gallery.createItem(formData);
      if (res.success) {
        setIsAddModalOpen(false);
        setModalFile(null);
        setModalPreview(null);
        setModalAltText('');
        setModalCaption('');
        setModalIsActive(true);
        fetchGalleryItems();
      } else {
        setModalError(res.message || 'Failed to add photo.');
      }
    } catch (err: any) {
      setModalError(err?.message || 'Upload failed. Please check image format and size.');
    } finally {
      setIsSavingItem(false);
    }
  };

  const handleSaveEditGalleryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!editingItem.alt_text.trim()) {
      alert('Accessible Alt Text cannot be empty.');
      return;
    }

    try {
      setIsSavingItem(true);
      const res = await api.gallery.updateItem(editingItem.id, {
        alt_text: editingItem.alt_text.trim(),
        caption: editingItem.caption ? editingItem.caption.trim() : null,
        is_active: editingItem.is_active
      });
      if (res.success) {
        setEditingItem(null);
        fetchGalleryItems();
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to update photo.');
    } finally {
      setIsSavingItem(false);
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

  if (loading && loadingGallery) {
    return (
      <div className="w-full">
        <KoinoniaInlineLoader
          variant="logo"
          size="md"
          label="Loading Landing Page configuration..."
          fullCard
          centered
        />
      </div>
    );
  }

  // Active items count for summary
  const activeGalleryCount = galleryItems.filter(i => i.is_active === 1).length;

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
            Curate core page media slots and manage the continuous 3D orbital photo gallery showcasing ministry fellowship, children, and teens.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => {
              fetchSettings();
              fetchGalleryItems();
            }}
            className="flex items-center space-x-1.5 text-xs font-semibold bg-white border border-[#EAE8E1] hover:bg-[#FAF9F6] text-zinc-700 px-4 py-2.5 rounded-xl shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
            <span>Sync State</span>
          </button>
        </div>
      </div>

      {/* Top Segmented Navigation: Core Slots vs Orbital Gallery */}
      <div className="flex bg-[#FAF8F3] p-1.5 rounded-2xl border border-[#E5D5AE]/80 max-w-md shadow-2xs">
        <button
          onClick={() => setMainTab('slots')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            mainTab === 'slots'
              ? 'bg-white text-[#18181B] shadow-2xs border border-[#EAE8E1]'
              : 'text-[#71717A] hover:text-[#18181B]'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5 text-[#C59B27]" />
          <span>Core Media Slots</span>
        </button>

        <button
          onClick={() => setMainTab('gallery')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            mainTab === 'gallery'
              ? 'bg-[#C59B27] text-white shadow-2xs'
              : 'text-[#71717A] hover:text-[#18181B]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Orbital Photo Gallery</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
            mainTab === 'gallery' ? 'bg-white/20 text-white' : 'bg-[#FAF6EB] text-[#9A7326] border border-[#E5D5AE]'
          }`}>
            {galleryItems.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. ORBITAL PHOTO GALLERY MANAGER VIEW */}
      {/* ========================================================================= */}
      {mainTab === 'gallery' && (
        <div className="space-y-6">
          {/* Gallery Sub-Header & Controls */}
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xs">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-serif-koinonia font-bold text-[#18181B]">
                  Orbital Photo Carousel
                </span>
                <span className="text-[10px] bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] px-2 py-0.5 rounded-full font-bold">
                  {activeGalleryCount} Active on Landing
                </span>
                {galleryItems.length - activeGalleryCount > 0 && (
                  <span className="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-bold">
                    {galleryItems.length - activeGalleryCount} Drafts
                  </span>
                )}
              </div>
              <p className="text-xs text-[#71717A]">
                Photographs orbit smoothly along a curved globe on the landing page. Drag or use the arrows to reorder.
              </p>
            </div>

            <div className="flex items-center space-x-3 w-full md:w-auto">
              <button
                onClick={() => setShowLivePreview(!showLivePreview)}
                className={`flex-1 md:flex-initial flex items-center justify-center space-x-2 text-xs font-bold px-4 py-2.5 rounded-xl border transition-all cursor-pointer ${
                  showLivePreview
                    ? 'bg-[#18181B] text-white border-[#18181B]'
                    : 'bg-[#FAF8F3] hover:bg-[#FAF6EB] text-[#18181B] border-[#EAE8E1]'
                }`}
              >
                <Eye className="w-3.5 h-3.5 text-[#C59B27]" />
                <span>{showLivePreview ? 'Hide Preview' : 'Live Preview'}</span>
              </button>

              <button
                onClick={() => {
                  setModalFile(null);
                  setModalPreview(null);
                  setModalAltText('');
                  setModalCaption('');
                  setModalIsActive(true);
                  setModalError(null);
                  setIsAddModalOpen(true);
                }}
                className="flex-1 md:flex-initial flex items-center justify-center space-x-2 text-xs font-bold bg-[#C59B27] hover:bg-[#B38A22] text-white px-5 py-2.5 rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Photograph</span>
              </button>
            </div>
          </div>

          {/* LIVE SIMULATION PREVIEW DRAWER */}
          {showLivePreview && (
            <div className="bg-[#FAF9F6] border border-[#E5D5AE] rounded-3xl p-6 shadow-md overflow-hidden animate-in fade-in duration-300">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#EAE8E1]">
                <div className="flex items-center space-x-2">
                  <Globe className="w-4 h-4 text-[#C59B27]" />
                  <span className="text-xs font-serif-koinonia font-bold text-[#18181B]">
                    Live Orbital Simulation
                  </span>
                  <span className="text-[10px] text-[#71717A]">
                    (Showing currently active photographs)
                  </span>
                </div>
                <button
                  onClick={() => setShowLivePreview(false)}
                  className="text-xs text-[#71717A] hover:text-[#18181B] cursor-pointer"
                >
                  Close
                </button>
              </div>

              {/* Render the actual public gallery component */}
              <div className="rounded-2xl overflow-hidden border border-[#EAE8E1] bg-white">
                <CurvedPhotoGallery 
                  customItems={galleryItems.filter(i => i.is_active === 1)} 
                  className="!py-8"
                />
              </div>
            </div>
          )}

          {/* Controls Bar: Search, Status Filter, View Mode, Pagination size */}
          {galleryItems.length > 0 && (
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-2xs">
              {/* Search & Filter pills */}
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={gallerySearch}
                    onChange={(e) => {
                      setGallerySearch(e.target.value);
                      setGalleryPage(1);
                    }}
                    placeholder="Search caption or alt text..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl text-[#18181B] placeholder:text-zinc-400 focus:outline-none focus:border-[#C59B27]"
                  />
                  {gallerySearch && (
                    <button
                      onClick={() => {
                        setGallerySearch('');
                        setGalleryPage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-1 bg-[#FAF9F6] p-1 rounded-xl border border-[#EAE8E1]">
                  {(['all', 'active', 'draft'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => {
                        setGalleryStatusFilter(tab);
                        setGalleryPage(1);
                      }}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer capitalize ${
                        galleryStatusFilter === tab
                          ? 'bg-white text-[#18181B] shadow-2xs border border-[#EAE8E1]'
                          : 'text-[#71717A] hover:text-[#18181B]'
                      }`}
                    >
                      {tab === 'all' ? `All (${galleryItems.length})` : tab === 'active' ? `Live (${activeGalleryCount})` : `Drafts (${galleryItems.length - activeGalleryCount})`}
                    </button>
                  ))}
                </div>
              </div>

              {/* View mode & Page Size switcher */}
              <div className="flex items-center space-x-2 self-end md:self-auto">
                <div className="flex items-center bg-[#FAF9F6] p-1 rounded-xl border border-[#EAE8E1]">
                  <button
                    onClick={() => setGalleryViewMode('cards')}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      galleryViewMode === 'cards' ? 'bg-white text-[#C59B27] shadow-2xs' : 'text-zinc-400 hover:text-zinc-600'
                    }`}
                    title="Card View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setGalleryViewMode('compact')}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      galleryViewMode === 'compact' ? 'bg-white text-[#C59B27] shadow-2xs' : 'text-zinc-400 hover:text-zinc-600'
                    }`}
                    title="Compact Table View"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>

                <select
                  value={galleryPageSize}
                  onChange={(e) => {
                    setGalleryPageSize(Number(e.target.value));
                    setGalleryPage(1);
                  }}
                  className="text-xs bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-2.5 py-1.5 text-zinc-700 focus:outline-none focus:border-[#C59B27] cursor-pointer"
                >
                  <option value={12}>12 / page</option>
                  <option value={24}>24 / page</option>
                  <option value={999}>View All</option>
                </select>
              </div>
            </div>
          )}

          {/* GALLERY ITEMS LIST / GRID */}
          {galleryItems.length === 0 ? (
            <div className="bg-white border border-[#EAE8E1] rounded-3xl p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] flex items-center justify-center mx-auto">
                <Camera className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-serif-koinonia font-bold text-[#18181B]">
                  No Custom Gallery Photos Uploaded Yet
                </h3>
                <p className="text-xs text-[#71717A] max-w-md mx-auto">
                  Upload photos of children, teens, and fellowship moments to activate the continuous 3D orbital gallery on the public landing page!
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center space-x-2 text-xs font-bold bg-[#C59B27] hover:bg-[#B38A22] text-white px-5 py-2.5 rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Upload First Photo</span>
              </button>
            </div>
          ) : filteredGalleryItems.length === 0 ? (
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-8 text-center space-y-2">
              <p className="text-xs text-[#71717A]">No photos matched your filter criteria.</p>
              <button
                onClick={() => {
                  setGallerySearch('');
                  setGalleryStatusFilter('all');
                }}
                className="text-xs font-bold text-[#9A7326] hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : galleryViewMode === 'cards' ? (
            /* CARDS VIEW */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedGalleryItems.map((item) => {
                const trueIdx = galleryItems.findIndex(i => i.id === item.id);
                return (
                  <div
                    key={item.id}
                    className={`bg-white border rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow relative overflow-hidden ${
                      item.is_active === 1 ? 'border-[#EAE8E1]' : 'border-zinc-200 opacity-75 bg-zinc-50/50'
                    }`}
                  >
                    <div className="space-y-2.5">
                      {/* Top status bar & Reorder buttons */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          <span className="w-5 h-5 rounded-full bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] font-bold text-[11px] flex items-center justify-center">
                            {trueIdx + 1}
                          </span>
                          <button
                            onClick={() => handleToggleGalleryActive(item)}
                            className={`flex items-center space-x-1 text-[9px] font-bold px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                              item.is_active === 1
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-zinc-100 text-zinc-500 border-zinc-200'
                            }`}
                            title="Click to toggle visibility on public landing page"
                          >
                            {item.is_active === 1 ? (
                              <>
                                <Eye className="w-2.5 h-2.5 text-emerald-600" />
                                <span>Live</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-2.5 h-2.5 text-zinc-400" />
                                <span>Draft</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Reorder Buttons */}
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleMoveGalleryItem(trueIdx, 'up')}
                            disabled={trueIdx === 0}
                            className="w-6 h-6 rounded-md border border-[#EAE8E1] hover:bg-[#FAF8F3] text-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
                            title="Move Earlier"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleMoveGalleryItem(trueIdx, 'down')}
                            disabled={trueIdx === galleryItems.length - 1}
                            className="w-6 h-6 rounded-md border border-[#EAE8E1] hover:bg-[#FAF8F3] text-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
                            title="Move Later"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Image Viewport */}
                      <div className="w-full h-36 rounded-xl overflow-hidden bg-[#FAF8F3] border border-[#EAE8E1] relative">
                        <AssetImage
                          src={item.image_url}
                          alt={item.alt_text}
                          thumbnailWidth={400}
                          iconType="camera"
                          label={item.caption || 'Event Moment'}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Captions & Alt Text */}
                      <div className="space-y-1">
                        <p className="text-xs font-serif-koinonia font-bold text-[#18181B] line-clamp-1">
                          {item.caption || 'Untitled Moment'}
                        </p>
                        <div className="bg-[#FAF8F3] p-1.5 rounded-lg border border-[#EAE8E1]/80">
                          <p className="text-[10px] text-[#71717A] line-clamp-2">
                            {item.alt_text}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div className="pt-3 border-t border-[#EAE8E1] flex items-center justify-between mt-2.5">
                      <button
                        onClick={() => setEditingItem(item)}
                        className="flex items-center space-x-1 text-xs text-zinc-600 hover:text-[#18181B] font-medium transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3 text-[#C59B27]" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleDeleteGalleryItem(item.id)}
                        className="w-7 h-7 rounded-md hover:bg-rose-50 text-zinc-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                        title="Remove from gallery"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* COMPACT TABLE / LIST VIEW (Optimized for 40+ items) */
            <div className="bg-white border border-[#EAE8E1] rounded-2xl overflow-hidden shadow-2xs">
              <div className="divide-y divide-[#EAE8E1]">
                {paginatedGalleryItems.map((item) => {
                  const trueIdx = galleryItems.findIndex(i => i.id === item.id);
                  return (
                    <div
                      key={item.id}
                      className="p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-[#FAF9F6] transition-colors"
                    >
                      {/* Left: Thumbnail & Info */}
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <span className="w-6 h-6 rounded-full bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] font-bold text-xs flex items-center justify-center shrink-0">
                          {trueIdx + 1}
                        </span>

                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#FAF8F3] border border-[#EAE8E1] shrink-0">
                          <AssetImage
                            src={item.image_url}
                            alt={item.alt_text}
                            thumbnailWidth={150}
                            iconType="camera"
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-serif-koinonia font-bold text-[#18181B] truncate">
                            {item.caption || 'Untitled Moment'}
                          </h4>
                          <p className="text-[11px] text-[#71717A] truncate mt-0.5">
                            {item.alt_text}
                          </p>
                        </div>
                      </div>

                      {/* Right: Actions & Status */}
                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          onClick={() => handleToggleGalleryActive(item)}
                          className={`flex items-center space-x-1 text-[10px] font-bold px-2 py-1 rounded-full border transition-colors cursor-pointer ${
                            item.is_active === 1
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-zinc-100 text-zinc-500 border-zinc-200'
                          }`}
                        >
                          {item.is_active === 1 ? (
                            <>
                              <Eye className="w-3 h-3 text-emerald-600" />
                              <span className="hidden sm:inline">Live</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3 h-3 text-zinc-400" />
                              <span className="hidden sm:inline">Draft</span>
                            </>
                          )}
                        </button>

                        <div className="flex items-center space-x-0.5">
                          <button
                            onClick={() => handleMoveGalleryItem(trueIdx, 'up')}
                            disabled={trueIdx === 0}
                            className="w-7 h-7 rounded-lg border border-[#EAE8E1] hover:bg-[#FAF8F3] text-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
                            title="Move Earlier"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleMoveGalleryItem(trueIdx, 'down')}
                            disabled={trueIdx === galleryItems.length - 1}
                            className="w-7 h-7 rounded-lg border border-[#EAE8E1] hover:bg-[#FAF8F3] text-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
                            title="Move Later"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          onClick={() => setEditingItem(item)}
                          className="w-7 h-7 rounded-lg border border-[#EAE8E1] hover:bg-[#FAF8F3] text-zinc-600 flex items-center justify-center transition-colors cursor-pointer"
                          title="Edit Details"
                        >
                          <Edit3 className="w-3 h-3 text-[#C59B27]" />
                        </button>

                        <button
                          onClick={() => handleDeleteGalleryItem(item.id)}
                          className="w-7 h-7 rounded-lg hover:bg-rose-50 text-zinc-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PAGINATION BAR */}
          {filteredGalleryItems.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between bg-white border border-[#EAE8E1] rounded-2xl p-3 shadow-2xs text-xs text-zinc-600">
              <span>
                Showing {((galleryPage - 1) * galleryPageSize) + 1} to {Math.min(galleryPage * galleryPageSize, filteredGalleryItems.length)} of {filteredGalleryItems.length} photos
              </span>
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => setGalleryPage(prev => Math.max(1, prev - 1))}
                  disabled={galleryPage === 1}
                  className="px-2.5 py-1 rounded-lg border border-[#EAE8E1] hover:bg-[#FAF8F3] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center space-x-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Prev</span>
                </button>
                <span className="font-bold px-2">
                  Page {galleryPage} of {totalPages}
                </span>
                <button
                  onClick={() => setGalleryPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={galleryPage === totalPages}
                  className="px-2.5 py-1 rounded-lg border border-[#EAE8E1] hover:bg-[#FAF8F3] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center space-x-1"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ADD PHOTOGRAPH MODAL */}
          {isAddModalOpen && (
            <div 
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
              role="dialog"
              aria-modal="true"
            >
              <div className="bg-[#FAF8F3] border border-[#E5D5AE] rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
                  <div className="flex items-center space-x-2">
                    <Camera className="w-4 h-4 text-[#C59B27]" />
                    <h3 className="text-sm font-serif-koinonia font-bold text-[#18181B]">
                      Add Photo to Orbital Gallery
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsAddModalOpen(false)}
                    className="w-7 h-7 rounded-full hover:bg-zinc-200 text-zinc-500 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveNewGalleryItem} className="space-y-4">
                  {/* File Upload Zone */}
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block mb-1.5">
                      Photograph File (JPG, PNG, or WebP &bull; Max 10MB) *
                    </label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleFileSelect}
                    />

                    {modalPreview ? (
                      <div className="relative h-48 rounded-2xl overflow-hidden border border-[#EAE8E1] bg-white group">
                        <img 
                          src={modalPreview} 
                          alt="Upload Preview" 
                          className="w-full h-full object-cover" 
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center font-bold text-xs transition-opacity cursor-pointer"
                        >
                          Change Photo
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="h-40 rounded-2xl border-2 border-dashed border-[#E5D5AE] hover:border-[#C59B27] bg-white flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-colors"
                      >
                        <Upload className="w-6 h-6 text-[#C59B27] mb-2" />
                        <span className="text-xs font-bold text-[#18181B]">Click to browse photo file</span>
                        <span className="text-[10px] text-[#71717A] mt-1">High resolution landscape or portrait</span>
                      </div>
                    )}
                  </div>

                  {/* Alt Text (Required) */}
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block mb-1">
                      Accessible Alt Text *
                    </label>
                    <input
                      type="text"
                      value={modalAltText}
                      onChange={(e) => setModalAltText(e.target.value)}
                      placeholder="e.g. Children smiling and singing during morning praise session"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:border-[#C59B27]"
                      required
                    />
                    <span className="text-[10px] text-[#71717A] mt-1 block">
                      Used by screen readers for parents with visual impairments and indexed by search engines.
                    </span>
                  </div>

                  {/* Caption (Optional) */}
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block mb-1">
                      Editorial Caption (Optional)
                    </label>
                    <input
                      type="text"
                      value={modalCaption}
                      onChange={(e) => setModalCaption(e.target.value)}
                      placeholder="e.g. Worship & Praise in Fellowship"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:border-[#C59B27]"
                    />
                  </div>

                  {/* Active Switch */}
                  <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-[#EAE8E1]">
                    <div>
                      <span className="text-xs font-bold text-[#18181B] block">Visible on Landing Page</span>
                      <span className="text-[10px] text-[#71717A]">Publish immediately to the orbital belt</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={modalIsActive}
                      onChange={(e) => setModalIsActive(e.target.checked)}
                      className="w-4 h-4 accent-[#C59B27] cursor-pointer"
                    />
                  </div>

                  {modalError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                      {modalError}
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="text-xs font-semibold px-4 py-2.5 rounded-xl border border-[#EAE8E1] bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingItem}
                      className="flex items-center space-x-1.5 text-xs font-bold bg-[#C59B27] hover:bg-[#B38A22] text-white px-5 py-2.5 rounded-xl shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isSavingItem ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Uploading & Processing...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Publish Photo</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* EDIT PHOTOGRAPH MODAL */}
          {editingItem && (
            <div 
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
              role="dialog"
              aria-modal="true"
            >
              <div className="bg-[#FAF8F3] border border-[#E5D5AE] rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
                  <div className="flex items-center space-x-2">
                    <Edit3 className="w-4 h-4 text-[#C59B27]" />
                    <h3 className="text-sm font-serif-koinonia font-bold text-[#18181B]">
                      Edit Photo Details
                    </h3>
                  </div>
                  <button
                    onClick={() => setEditingItem(null)}
                    className="w-7 h-7 rounded-full hover:bg-zinc-200 text-zinc-500 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveEditGalleryItem} className="space-y-4">
                  {/* Photo Preview Thumbnail */}
                  <div className="h-36 rounded-2xl overflow-hidden border border-[#EAE8E1] bg-[#FAF8F3]">
                    <AssetImage
                      src={editingItem.image_url}
                      alt={editingItem.alt_text}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Alt Text */}
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block mb-1">
                      Accessible Alt Text *
                    </label>
                    <input
                      type="text"
                      value={editingItem.alt_text}
                      onChange={(e) => setEditingItem({ ...editingItem, alt_text: e.target.value })}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:border-[#C59B27]"
                      required
                    />
                  </div>

                  {/* Caption */}
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block mb-1">
                      Editorial Caption (Optional)
                    </label>
                    <input
                      type="text"
                      value={editingItem.caption || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, caption: e.target.value })}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:border-[#C59B27]"
                    />
                  </div>

                  {/* Active Switch */}
                  <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-[#EAE8E1]">
                    <div>
                      <span className="text-xs font-bold text-[#18181B] block">Visible on Landing Page</span>
                      <span className="text-[10px] text-[#71717A]">Active in orbital circulation</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={editingItem.is_active === 1}
                      onChange={(e) => setEditingItem({ ...editingItem, is_active: e.target.checked ? 1 : 0 })}
                      className="w-4 h-4 accent-[#C59B27] cursor-pointer"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setEditingItem(null)}
                      className="text-xs font-semibold px-4 py-2.5 rounded-xl border border-[#EAE8E1] bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingItem}
                      className="flex items-center space-x-1.5 text-xs font-bold bg-[#C59B27] hover:bg-[#B38A22] text-white px-5 py-2.5 rounded-xl shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isSavingItem ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving Changes...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Changes</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. CORE MEDIA SLOTS VIEW (Existing slot overrides) */}
      {/* ========================================================================= */}
      {mainTab === 'slots' && (
        <div className="space-y-6">
          {/* Categories Toolbar */}
          <div className="flex border-b border-[#EAE8E1] overflow-x-auto gap-1 scrollbar-none pb-0.5">
            {[
              { id: 'all', label: 'All Content Slots' },
              { id: 'brand', label: 'Header & Brand' },
              { id: 'hero', label: 'Hero Cover & Composition' },
              { id: 'interactive', label: 'Demo Cards' },
              { id: 'gallery', label: 'Past Moments Reel' },
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
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <div className="p-2.5 bg-[#FAF8F3] border border-[#E5D5AE] rounded-2xl shrink-0">
                          {getSlotIcon(slot.icon)}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-[#18181B] font-serif-koinonia">
                            {slot.label}
                          </h3>
                          <span className="text-[10px] font-mono text-zinc-400 block mt-0.5">
                            {slot.key} &bull; {slot.type.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {customUrl ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold rounded-full shrink-0">
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Custom Active</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-zinc-100 border border-zinc-200 text-zinc-500 text-[10px] font-medium rounded-full shrink-0">
                          <span>Default Fallback</span>
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[#71717A] leading-relaxed">
                      {slot.description}
                    </p>

                    <div className="bg-[#FAF8F3] border border-[#EAE8E1] rounded-xl p-2.5 text-[10px] text-zinc-500 flex items-center space-x-2">
                      <HelpCircle className="w-3.5 h-3.5 text-[#C59B27] shrink-0" />
                      <span>{slot.dimensions}</span>
                    </div>

                    {/* Preview Frame */}
                    <div className="relative w-full h-44 rounded-2xl overflow-hidden bg-[#FAF8F3] border border-[#EAE8E1] flex items-center justify-center">
                      {isUploading && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center z-20 space-y-2">
                          <Loader2 className="w-6 h-6 text-[#C59B27] animate-spin" />
                          <span className="text-[11px] font-semibold text-zinc-700">Uploading media...</span>
                        </div>
                      )}

                      {slot.type === 'video' ? (
                        customUrl ? (
                          <video 
                            src={customUrl} 
                            controls 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <div className="flex flex-col items-center space-y-2 text-zinc-400">
                            <FileVideo className="w-8 h-8 text-[#C59B27]/50" />
                            <span className="text-[10px]">Default background loop active</span>
                          </div>
                        )
                      ) : (
                        <AssetImage
                          src={customUrl}
                          alt={slot.label}
                          iconType={slot.icon as any}
                          label={slot.label}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>

                    {/* Error / Success Feedback */}
                    {errorMsg && (
                      <div className="flex items-center space-x-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{errorMsg}</span>
                      </div>
                    )}
                    {successMsg && (
                      <div className="flex items-center space-x-2 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs">
                        <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span>{successMsg}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-4 border-t border-[#EAE8E1] flex items-center space-x-2 mt-4">
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
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
