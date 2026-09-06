import React, { useState, useEffect, useRef } from 'react';
import { 
  Image as ImageIcon, 
  Camera, 
  Video, 
  Upload, 
  Trash2, 
  Check, 
  Loader2, 
  RefreshCw,
  Plus, 
  ArrowUp, 
  ArrowDown, 
  Eye, 
  EyeOff, 
  Pencil, 
  X, 
  Search, 
  LayoutGrid, 
  List, 
  ChevronLeft, 
  ChevronRight,
  MoreHorizontal,
  GripVertical
} from 'lucide-react';
import { api, AdminGalleryItem } from '../../services/api';
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
  icon: 'camera' | 'video' | 'default';
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
    icon: 'default',
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
    key: 'interactiveSample',
    label: 'Interactive Feature Preview Cover',
    description: 'Preview cover image for interactive attendance demonstrations.',
    dimensions: '640x360px (Aspect ratio 16:9)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'interactive'
  },
  {
    key: 'gallerySample',
    label: 'Fellowship Reel Fallback Cover',
    description: 'Fallback cover image for the fellowship gallery reel.',
    dimensions: '600x800px (Aspect ratio 3:4)',
    type: 'image',
    purpose: 'landing_image',
    icon: 'camera',
    category: 'gallery'
  },
  {
    key: 'pastMomentsVideo',
    label: 'Highlights Video Preview',
    description: 'Short video preview for past general assembly highlights.',
    dimensions: '720p or 1080p MP4 format',
    type: 'video',
    purpose: 'event_video',
    icon: 'video',
    category: 'gallery'
  }
];

export const AdminLandingView: React.FC<AdminLandingViewProps> = ({ isSuperAdmin }) => {
  // Main view switcher: 'gallery' (primary photo gallery) vs 'slots' (fixed hero/brand images)
  const [mainTab, setMainTab] = useState<'gallery' | 'slots'>('gallery');

  // Core Slots state
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<'all' | 'brand' | 'hero' | 'interactive' | 'gallery'>('all');
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [resettingSlot, setResettingSlot] = useState<string | null>(null);
  const [errorSlot, setErrorSlot] = useState<{ [key: string]: string }>({});
  const [successSlot, setSuccessSlot] = useState<{ [key: string]: string }>({});

  // Photo Gallery state
  const [galleryItems, setGalleryItems] = useState<AdminGalleryItem[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminGalleryItem | null>(null);
  const [showLivePreview, setShowLivePreview] = useState(false);

  // Gallery Filters, View Modes & Pagination
  const [gallerySearch, setGallerySearch] = useState('');
  const [galleryStatusFilter, setGalleryStatusFilter] = useState<'all' | 'active' | 'draft'>('all');
  const [galleryViewMode, setGalleryViewMode] = useState<'cards' | 'compact'>('cards');
  const [galleryPage, setGalleryPage] = useState(1);
  const [galleryPageSize, setGalleryPageSize] = useState<number>(12);

  // Card overflow action menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Drag & drop state for reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Add / Edit Modal state
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalPreview, setModalPreview] = useState<string | null>(null);
  const [modalAltText, setModalAltText] = useState('');
  const [modalCaption, setModalCaption] = useState('');
  const [modalIsActive, setModalIsActive] = useState(true);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dismiss card dropdown on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-card-menu]')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openMenuId]);

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

  // 2. Fetch Photo Gallery Items
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
    if (!window.confirm('Restore this image to its default branded visual illustration?')) return;
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
  // Photo Gallery Actions
  // ----------------------------------------------------
  const handleMoveGalleryItem = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= galleryItems.length) return;

    const newItems = [...galleryItems];
    const [moved] = newItems.splice(index, 1);
    newItems.splice(targetIndex, 0, moved);
    setGalleryItems(newItems);
    setOpenMenuId(null);

    try {
      await api.gallery.reorderItems(newItems.map(i => i.id));
    } catch (err) {
      console.error('Failed to save photo order:', err);
      fetchGalleryItems();
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    const newItems = [...galleryItems];
    const [moved] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, moved);
    setGalleryItems(newItems);
    setDraggedIndex(null);

    try {
      await api.gallery.reorderItems(newItems.map(i => i.id));
    } catch (err) {
      console.error('Failed to save photo order:', err);
      fetchGalleryItems();
    }
  };

  const handleToggleGalleryActive = async (item: AdminGalleryItem) => {
    const nextState = item.is_active === 1 ? 0 : 1;
    setGalleryItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: nextState } : i));
    setOpenMenuId(null);
    try {
      await api.gallery.updateItem(item.id, { is_active: nextState });
    } catch (err) {
      console.error('Failed to toggle active state:', err);
      fetchGalleryItems();
    }
  };

  const handleDeleteGalleryItem = async (id: string) => {
    setOpenMenuId(null);
    if (!window.confirm('Are you sure you want to remove this photo from the landing page gallery?')) return;
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
      setModalError('Please choose a photo to upload (JPG, PNG, or WebP).');
      return;
    }
    if (!modalAltText.trim()) {
      setModalError('Accessible description is required.');
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
      alert('Accessible description cannot be empty.');
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
      case 'camera': return <Camera className="w-4 h-4 text-stone-500" />;
      case 'video': return <Video className="w-4 h-4 text-stone-500" />;
      default: return <ImageIcon className="w-4 h-4 text-stone-500" />;
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

  const activeGalleryCount = galleryItems.filter(i => i.is_active === 1).length;
  const hiddenGalleryCount = galleryItems.length - activeGalleryCount;

  return (
    <div className="space-y-8 font-sans" id="admin-landing-manager">
      {/* Editorial Page Header */}
      <div className="border-b border-[#EAE8E1]/80 pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-serif-koinonia font-normal text-stone-900 tracking-tight">
            Landing Page
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Manage the images shown on your public landing page.
          </p>
        </div>

        <button 
          onClick={() => {
            fetchSettings();
            fetchGalleryItems();
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 bg-white border border-[#EAE8E1] hover:bg-stone-50 hover:text-stone-900 px-3 py-2 rounded-lg transition-colors cursor-pointer shadow-2xs"
          title="Refresh current data"
        >
          <RefreshCw className="w-3.5 h-3.5 text-stone-400" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Understated Main Tabs */}
      <div className="flex border-b border-[#EAE8E1] gap-6 text-xs">
        <button
          onClick={() => setMainTab('gallery')}
          className={`pb-3 font-medium transition-colors cursor-pointer border-b-2 flex items-center gap-2 ${
            mainTab === 'gallery'
              ? 'border-[#C59B27] text-stone-950 font-semibold'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>Photo Gallery</span>
          <span className="text-[11px] font-mono text-stone-400">
            {galleryItems.length}
          </span>
        </button>

        <button
          onClick={() => setMainTab('slots')}
          className={`pb-3 font-medium transition-colors cursor-pointer border-b-2 flex items-center gap-2 ${
            mainTab === 'slots'
              ? 'border-[#C59B27] text-stone-950 font-semibold'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>Featured Images</span>
          <span className="text-[11px] font-mono text-stone-400">
            {MEDIA_SLOTS.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. PHOTO GALLERY MANAGEMENT VIEW */}
      {/* ========================================================================= */}
      {mainTab === 'gallery' && (
        <div className="space-y-6">
          {/* Section Heading & Actions Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-semibold text-stone-900">
                  Photo Gallery
                </h3>
                <span className="text-xs text-stone-500 font-normal">
                  {activeGalleryCount} published{hiddenGalleryCount > 0 ? `, ${hiddenGalleryCount} hidden` : ''}
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Manage the photos shown in the gallery on the landing page.
              </p>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                onClick={() => setShowLivePreview(true)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 text-xs font-medium text-stone-700 bg-white hover:bg-stone-50 border border-[#EAE8E1] px-3.5 py-2 rounded-lg transition-colors cursor-pointer shadow-2xs"
              >
                <Eye className="w-3.5 h-3.5 text-stone-400" />
                <span>Preview on homepage</span>
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
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-[#C59B27] hover:bg-[#B38A22] text-white px-4 py-2 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add photo</span>
              </button>
            </div>
          </div>

          {/* Filtering & View Switcher */}
          {galleryItems.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              {/* Search & Status Filters */}
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={gallerySearch}
                    onChange={(e) => {
                      setGallerySearch(e.target.value);
                      setGalleryPage(1);
                    }}
                    placeholder="Search caption or description..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-[#EAE8E1] rounded-lg text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-[#C59B27]"
                  />
                  {gallerySearch && (
                    <button
                      onClick={() => {
                        setGallerySearch('');
                        setGalleryPage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 text-xs">
                  {(['all', 'active', 'draft'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => {
                        setGalleryStatusFilter(tab);
                        setGalleryPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                        galleryStatusFilter === tab
                          ? 'bg-stone-900 text-white'
                          : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                      }`}
                    >
                      {tab === 'all' ? `All (${galleryItems.length})` : tab === 'active' ? `Published (${activeGalleryCount})` : `Hidden (${hiddenGalleryCount})`}
                    </button>
                  ))}
                </div>
              </div>

              {/* View Mode & Page Size */}
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <div className="flex items-center border border-[#EAE8E1] rounded-lg bg-white p-0.5">
                  <button
                    onClick={() => setGalleryViewMode('cards')}
                    className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                      galleryViewMode === 'cards' ? 'bg-stone-100 text-stone-900 font-medium' : 'text-stone-400 hover:text-stone-600'
                    }`}
                    title="Grid view"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setGalleryViewMode('compact')}
                    className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                      galleryViewMode === 'compact' ? 'bg-stone-100 text-stone-900 font-medium' : 'text-stone-400 hover:text-stone-600'
                    }`}
                    title="List view"
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
                  className="text-xs bg-white border border-[#EAE8E1] rounded-lg px-2.5 py-1.5 text-stone-600 focus:outline-none focus:border-[#C59B27] cursor-pointer"
                >
                  <option value={12}>12 per page</option>
                  <option value={24}>24 per page</option>
                  <option value={999}>View all</option>
                </select>
              </div>
            </div>
          )}

          {/* GALLERY CONTENT: CARDS OR LIST */}
          {galleryItems.length === 0 ? (
            <div className="border border-dashed border-[#EAE8E1] rounded-2xl p-12 text-center space-y-4 bg-white">
              <div className="w-10 h-10 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center mx-auto">
                <Camera className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-stone-900">
                  No photos uploaded yet
                </h4>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">
                  Upload photos of children, teens, and fellowship gatherings to display in the landing page gallery.
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#C59B27] hover:bg-[#B38A22] text-white px-4 py-2 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Upload first photo</span>
              </button>
            </div>
          ) : filteredGalleryItems.length === 0 ? (
            <div className="border border-[#EAE8E1] rounded-xl p-8 text-center space-y-2 bg-white">
              <p className="text-xs text-stone-500">No photos matched your filter criteria.</p>
              <button
                onClick={() => {
                  setGallerySearch('');
                  setGalleryStatusFilter('all');
                }}
                className="text-xs font-medium text-[#9A7326] hover:underline cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          ) : galleryViewMode === 'cards' ? (
            /* CLEAN RESPONSIVE PHOTO CARDS GRID */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {paginatedGalleryItems.map((item) => {
                const trueIdx = galleryItems.findIndex(i => i.id === item.id);
                const isMenuOpen = openMenuId === item.id;

                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, trueIdx)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, trueIdx)}
                    className={`bg-white border rounded-xl overflow-hidden shadow-2xs hover:border-[#C59B27]/40 transition-all flex flex-col justify-between group ${
                      item.is_active === 1 ? 'border-[#EAE8E1]' : 'border-stone-200 opacity-80'
                    }`}
                  >
                    <div>
                      {/* Photo Viewport */}
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
                        <AssetImage
                          src={item.image_url}
                          alt={item.alt_text}
                          thumbnailWidth={400}
                          iconType="camera"
                          className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                        />

                        {/* Top Overlay Badges: Order & Status */}
                        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                          <span className="font-mono text-[10px] text-stone-700 bg-white/95 backdrop-blur-xs px-2 py-0.5 rounded border border-stone-200/80 shadow-2xs flex items-center gap-1 pointer-events-auto cursor-grab" title="Drag to reorder">
                            <GripVertical className="w-2.5 h-2.5 text-stone-400" />
                            <span>{trueIdx + 1}</span>
                          </span>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleGalleryActive(item);
                            }}
                            className={`pointer-events-auto px-2 py-0.5 rounded-full text-[10px] font-medium border shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                              item.is_active === 1
                                ? 'bg-white/95 text-emerald-800 border-emerald-200'
                                : 'bg-white/95 text-stone-500 border-stone-200'
                            }`}
                            title="Click to toggle publication status"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${item.is_active === 1 ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                            <span>{item.is_active === 1 ? 'Published' : 'Hidden'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Content Area */}
                      <div className="p-3.5 space-y-1">
                        <h4 className="text-sm font-medium text-stone-900 truncate">
                          {item.caption ? item.caption : <span className="text-stone-400 italic font-normal">No caption</span>}
                        </h4>
                        <p className="text-xs text-stone-500 line-clamp-1">
                          {item.alt_text}
                        </p>
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div className="px-3.5 py-2.5 border-t border-[#EAE8E1]/80 flex items-center justify-between bg-stone-50/40 text-xs relative" data-card-menu>
                      <button
                        onClick={() => setEditingItem(item)}
                        className="text-stone-600 hover:text-stone-900 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3 h-3 text-stone-400" />
                        <span>Edit</span>
                      </button>

                      {/* Three-Dot Overflow Menu */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(isMenuOpen ? null : item.id);
                          }}
                          className="w-7 h-7 rounded hover:bg-stone-200/60 text-stone-500 hover:text-stone-800 flex items-center justify-center transition-colors cursor-pointer"
                          title="Actions"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {isMenuOpen && (
                          <div className="absolute right-0 bottom-full mb-1 w-44 bg-white border border-[#EAE8E1] rounded-xl shadow-lg p-1 z-30 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                            <button
                              onClick={() => {
                                setEditingItem(item);
                                setOpenMenuId(null);
                              }}
                              className="w-full text-left px-2.5 py-1.5 text-xs text-stone-700 hover:text-stone-900 hover:bg-stone-50 rounded-lg flex items-center gap-2 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3 text-stone-400" />
                              <span>Edit details</span>
                            </button>

                            <button
                              onClick={() => handleToggleGalleryActive(item)}
                              className="w-full text-left px-2.5 py-1.5 text-xs text-stone-700 hover:text-stone-900 hover:bg-stone-50 rounded-lg flex items-center gap-2 cursor-pointer"
                            >
                              {item.is_active === 1 ? (
                                <>
                                  <EyeOff className="w-3 h-3 text-stone-400" />
                                  <span>Hide from homepage</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3 h-3 text-stone-400" />
                                  <span>Publish to homepage</span>
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => handleMoveGalleryItem(trueIdx, 'up')}
                              disabled={trueIdx === 0}
                              className="w-full text-left px-2.5 py-1.5 text-xs text-stone-700 hover:text-stone-900 hover:bg-stone-50 rounded-lg flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <ArrowUp className="w-3 h-3 text-stone-400" />
                              <span>Move earlier</span>
                            </button>

                            <button
                              onClick={() => handleMoveGalleryItem(trueIdx, 'down')}
                              disabled={trueIdx === galleryItems.length - 1}
                              className="w-full text-left px-2.5 py-1.5 text-xs text-stone-700 hover:text-stone-900 hover:bg-stone-50 rounded-lg flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <ArrowDown className="w-3 h-3 text-stone-400" />
                              <span>Move later</span>
                            </button>

                            <div className="border-t border-[#EAE8E1] my-1" />

                            <button
                              onClick={() => handleDeleteGalleryItem(item.id)}
                              className="w-full text-left px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-2 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3 text-rose-500" />
                              <span>Delete photo</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* COMPACT TABLE / LIST VIEW */
            <div className="bg-white border border-[#EAE8E1] rounded-xl overflow-hidden shadow-2xs">
              <div className="divide-y divide-[#EAE8E1]">
                {paginatedGalleryItems.map((item) => {
                  const trueIdx = galleryItems.findIndex(i => i.id === item.id);
                  return (
                    <div
                      key={item.id}
                      className="p-3 sm:p-4 flex items-center justify-between gap-4 hover:bg-stone-50/60 transition-colors"
                    >
                      {/* Left: Thumbnail & Info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="font-mono text-xs text-stone-400 w-5 shrink-0 text-center">
                          {trueIdx + 1}
                        </span>

                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-stone-100 border border-[#EAE8E1] shrink-0">
                          <AssetImage
                            src={item.image_url}
                            alt={item.alt_text}
                            thumbnailWidth={150}
                            iconType="camera"
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-medium text-stone-900 truncate">
                            {item.caption ? item.caption : <span className="text-stone-400 italic font-normal">No caption</span>}
                          </h4>
                          <p className="text-[11px] text-stone-500 truncate mt-0.5">
                            {item.alt_text}
                          </p>
                        </div>
                      </div>

                      {/* Right: Status & Actions */}
                      <div className="flex items-center gap-2 shrink-0 text-xs">
                        <button
                          onClick={() => handleToggleGalleryActive(item)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors cursor-pointer ${
                            item.is_active === 1
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-stone-100 text-stone-600 border-stone-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${item.is_active === 1 ? 'bg-emerald-500' : 'bg-stone-400'}`} />
                          <span className="hidden sm:inline">{item.is_active === 1 ? 'Published' : 'Hidden'}</span>
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleMoveGalleryItem(trueIdx, 'up')}
                            disabled={trueIdx === 0}
                            className="w-7 h-7 rounded border border-[#EAE8E1] hover:bg-stone-50 text-stone-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
                            title="Move earlier"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleMoveGalleryItem(trueIdx, 'down')}
                            disabled={trueIdx === galleryItems.length - 1}
                            className="w-7 h-7 rounded border border-[#EAE8E1] hover:bg-stone-50 text-stone-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
                            title="Move later"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          onClick={() => setEditingItem(item)}
                          className="w-7 h-7 rounded border border-[#EAE8E1] hover:bg-stone-50 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3 text-stone-500" />
                        </button>

                        <button
                          onClick={() => handleDeleteGalleryItem(item.id)}
                          className="w-7 h-7 rounded hover:bg-rose-50 text-stone-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
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

          {/* PAGINATION */}
          {filteredGalleryItems.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#EAE8E1]/80 pt-4 text-xs text-stone-500">
              <span>
                Showing {((galleryPage - 1) * galleryPageSize) + 1} to {Math.min(galleryPage * galleryPageSize, filteredGalleryItems.length)} of {filteredGalleryItems.length} photos
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setGalleryPage(prev => Math.max(1, prev - 1))}
                  disabled={galleryPage === 1}
                  className="px-2.5 py-1 rounded border border-[#EAE8E1] hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>
                <span className="font-mono px-2 text-stone-700">
                  {galleryPage} of {totalPages}
                </span>
                <button
                  onClick={() => setGalleryPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={galleryPage === totalPages}
                  className="px-2.5 py-1 rounded border border-[#EAE8E1] hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* HOMEPAGE PREVIEW MODAL (ON-DEMAND) */}
          {/* ========================================================================= */}
          {showLivePreview && (
            <div 
              className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
              role="dialog"
              aria-modal="true"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowLivePreview(false);
              }}
            >
              <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl max-w-5xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-[#EAE8E1] flex items-center justify-between bg-white">
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900 font-sans">
                      Homepage preview
                    </h3>
                    <p className="text-xs text-stone-500 mt-0.5">
                      See how your published photos appear on the landing page.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowLivePreview(false)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-900 px-3 py-1.5 rounded-lg border border-[#EAE8E1] hover:bg-stone-50 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Close preview</span>
                  </button>
                </div>

                {/* Modal Body: CurvedPhotoGallery with actual published items */}
                <div className="p-4 sm:p-6 overflow-y-auto bg-[#FAF9F6]">
                  <div className="rounded-xl overflow-hidden border border-[#EAE8E1] bg-white">
                    <CurvedPhotoGallery
                      customItems={galleryItems.filter(i => i.is_active === 1)}
                      className="!py-10"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ADD PHOTO MODAL */}
          {/* ========================================================================= */}
          {isAddModalOpen && (
            <div 
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
              role="dialog"
              aria-modal="true"
            >
              <div className="bg-white border border-[#EAE8E1] rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900 font-sans">
                      Add photo
                    </h3>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Upload a photo for the landing page gallery.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsAddModalOpen(false)}
                    className="w-7 h-7 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-600 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveNewGalleryItem} className="space-y-4">
                  {/* File Upload Zone */}
                  <div>
                    <label className="text-xs font-medium text-stone-700 block mb-1.5">
                      Photo file (JPG, PNG, or WebP &bull; Max 10MB) *
                    </label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleFileSelect}
                    />

                    {modalPreview ? (
                      <div className="relative h-44 rounded-xl overflow-hidden border border-[#EAE8E1] bg-stone-50 group">
                        <img 
                          src={modalPreview} 
                          alt="Upload Preview" 
                          className="w-full h-full object-cover" 
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center font-medium text-xs transition-opacity cursor-pointer"
                        >
                          Change photo
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="h-36 rounded-xl border border-dashed border-stone-300 hover:border-[#C59B27] bg-stone-50/50 flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-colors"
                      >
                        <Upload className="w-5 h-5 text-stone-400 mb-1.5" />
                        <span className="text-xs font-medium text-stone-800">Click to browse photo file</span>
                        <span className="text-[11px] text-stone-400 mt-0.5">High-resolution portrait or landscape</span>
                      </div>
                    )}
                  </div>

                  {/* Alt Text (Required) */}
                  <div>
                    <label className="text-xs font-medium text-stone-700 block mb-1">
                      Accessible description *
                    </label>
                    <input
                      type="text"
                      value={modalAltText}
                      onChange={(e) => setModalAltText(e.target.value)}
                      placeholder="e.g. Children smiling and singing during morning praise session"
                      className="w-full text-xs px-3 py-2 rounded-lg border border-[#EAE8E1] bg-white focus:outline-none focus:border-[#C59B27]"
                      required
                    />
                    <span className="text-[11px] text-stone-400 mt-1 block">
                      Read by assistive tools for parents with visual impairments.
                    </span>
                  </div>

                  {/* Caption (Optional) */}
                  <div>
                    <label className="text-xs font-medium text-stone-700 block mb-1">
                      Caption (optional)
                    </label>
                    <input
                      type="text"
                      value={modalCaption}
                      onChange={(e) => setModalCaption(e.target.value)}
                      placeholder="e.g. Worship & Praise in Fellowship"
                      className="w-full text-xs px-3 py-2 rounded-lg border border-[#EAE8E1] bg-white focus:outline-none focus:border-[#C59B27]"
                    />
                  </div>

                  {/* Publish Switch */}
                  <div className="flex items-center justify-between p-3 rounded-lg border border-[#EAE8E1] bg-stone-50/40">
                    <div>
                      <span className="text-xs font-medium text-stone-900 block">Publish on homepage</span>
                      <span className="text-[11px] text-stone-400">Make visible in the landing page gallery immediately</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={modalIsActive}
                      onChange={(e) => setModalIsActive(e.target.checked)}
                      className="w-4 h-4 accent-[#C59B27] cursor-pointer"
                    />
                  </div>

                  {modalError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                      {modalError}
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#EAE8E1]">
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="text-xs font-medium px-3.5 py-2 rounded-lg border border-[#EAE8E1] bg-white text-stone-600 hover:bg-stone-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingItem}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#C59B27] hover:bg-[#B38A22] text-white px-4 py-2 rounded-lg shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isSavingItem ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Add photo</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* EDIT PHOTO MODAL */}
          {/* ========================================================================= */}
          {editingItem && (
            <div 
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
              role="dialog"
              aria-modal="true"
            >
              <div className="bg-white border border-[#EAE8E1] rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900 font-sans">
                      Edit photo
                    </h3>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Update caption, description, or publication status.
                    </p>
                  </div>
                  <button
                    onClick={() => setEditingItem(null)}
                    className="w-7 h-7 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-600 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveEditGalleryItem} className="space-y-4">
                  {/* Photo Preview */}
                  <div className="h-32 rounded-xl overflow-hidden border border-[#EAE8E1] bg-stone-100">
                    <AssetImage
                      src={editingItem.image_url}
                      alt={editingItem.alt_text}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Alt Text */}
                  <div>
                    <label className="text-xs font-medium text-stone-700 block mb-1">
                      Accessible description *
                    </label>
                    <input
                      type="text"
                      value={editingItem.alt_text}
                      onChange={(e) => setEditingItem({ ...editingItem, alt_text: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-[#EAE8E1] bg-white focus:outline-none focus:border-[#C59B27]"
                      required
                    />
                  </div>

                  {/* Caption */}
                  <div>
                    <label className="text-xs font-medium text-stone-700 block mb-1">
                      Caption (optional)
                    </label>
                    <input
                      type="text"
                      value={editingItem.caption || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, caption: e.target.value })}
                      placeholder="e.g. Worship & Praise in Fellowship"
                      className="w-full text-xs px-3 py-2 rounded-lg border border-[#EAE8E1] bg-white focus:outline-none focus:border-[#C59B27]"
                    />
                  </div>

                  {/* Publish Switch */}
                  <div className="flex items-center justify-between p-3 rounded-lg border border-[#EAE8E1] bg-stone-50/40">
                    <div>
                      <span className="text-xs font-medium text-stone-900 block">Publish on homepage</span>
                      <span className="text-[11px] text-stone-400">Make visible in the landing page gallery</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={editingItem.is_active === 1}
                      onChange={(e) => setEditingItem({ ...editingItem, is_active: e.target.checked ? 1 : 0 })}
                      className="w-4 h-4 accent-[#C59B27] cursor-pointer"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#EAE8E1]">
                    <button
                      type="button"
                      onClick={() => setEditingItem(null)}
                      className="text-xs font-medium px-3.5 py-2 rounded-lg border border-[#EAE8E1] bg-white text-stone-600 hover:bg-stone-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingItem}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#C59B27] hover:bg-[#B38A22] text-white px-4 py-2 rounded-lg shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isSavingItem ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Save changes</span>
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
      {/* 2. FEATURED IMAGES VIEW (Fixed Hero & Page Slot Overrides) */}
      {/* ========================================================================= */}
      {mainTab === 'slots' && (
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h3 className="text-base font-semibold text-stone-900">
              Featured Images
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Manage fixed images and media across the hero and header sections.
            </p>
          </div>

          {/* Categories Toolbar */}
          <div className="flex border-b border-[#EAE8E1] overflow-x-auto gap-2 pb-0.5">
            {[
              { id: 'all', label: 'All images' },
              { id: 'brand', label: 'Brand & header' },
              { id: 'hero', label: 'Hero section' },
              { id: 'interactive', label: 'Demonstrations' },
              { id: 'gallery', label: 'Reels' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id as any)}
                className={`py-2 px-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap focus:outline-none cursor-pointer ${
                  activeCategory === cat.id 
                    ? 'border-[#C59B27] text-stone-950 font-semibold' 
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Slots List */}
          <div className="space-y-4">
            {filteredSlots.map((slot) => {
              const currentVal = settings[slot.key];
              const isUploading = uploadingSlot === slot.key;
              const isResetting = resettingSlot === slot.key;
              const slotError = errorSlot[slot.key];
              const slotSuccess = successSlot[slot.key];

              return (
                <div 
                  key={slot.key}
                  className="bg-white border border-[#EAE8E1] rounded-xl p-5 shadow-2xs hover:border-[#C59B27]/40 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    {/* Left: Info & Specs */}
                    <div className="space-y-1.5 max-w-xl">
                      <div className="flex items-center gap-2">
                        {getSlotIcon(slot.icon)}
                        <h4 className="text-sm font-semibold text-stone-900">
                          {slot.label}
                        </h4>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-stone-100 text-stone-600 rounded">
                          {slot.type}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500">
                        {slot.description}
                      </p>
                      <p className="text-[11px] font-mono text-stone-400">
                        Recommended: {slot.dimensions}
                      </p>
                    </div>

                    {/* Right: Preview Thumbnail & Upload Control */}
                    <div className="flex items-center gap-4">
                      {/* Image Thumbnail */}
                      <div className="w-20 h-20 rounded-lg overflow-hidden border border-[#EAE8E1] bg-stone-50 shrink-0 relative">
                        {slot.type === 'video' ? (
                          currentVal ? (
                            <video 
                              src={currentVal} 
                              className="w-full h-full object-cover" 
                              muted 
                              loop 
                              autoPlay 
                              playsInline 
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-stone-400">
                              <Video className="w-5 h-5 mb-0.5" />
                              <span className="text-[9px]">Default video</span>
                            </div>
                          )
                        ) : (
                          <AssetImage
                            src={currentVal || undefined}
                            label={slot.label}
                            alt={slot.label}
                            className="w-full h-full object-cover"
                            thumbnailWidth={160}
                          />
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="space-y-2">
                        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 bg-white hover:bg-stone-50 border border-[#EAE8E1] px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-2xs">
                          {isUploading ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-500" />
                              <span>Uploading...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5 text-stone-400" />
                              <span>{currentVal ? 'Replace image' : 'Upload image'}</span>
                            </>
                          )}
                          <input 
                            type="file" 
                            className="hidden" 
                            accept={slot.type === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp'}
                            disabled={isUploading || isResetting}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(slot.key, file, slot.purpose);
                            }}
                          />
                        </label>

                        {currentVal && (
                          <button
                            onClick={() => handleResetSlot(slot.key)}
                            disabled={isResetting || isUploading}
                            className="block text-[11px] text-stone-500 hover:text-stone-900 transition-colors cursor-pointer disabled:opacity-40"
                          >
                            Restore default
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {slotError && (
                    <p className="text-xs text-rose-600 mt-3 pt-3 border-t border-rose-100">
                      {slotError}
                    </p>
                  )}
                  {slotSuccess && (
                    <p className="text-xs text-emerald-600 mt-3 pt-3 border-t border-emerald-100">
                      {slotSuccess}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLandingView;
