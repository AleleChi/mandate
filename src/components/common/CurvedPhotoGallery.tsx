import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sparkles, ChevronLeft, ChevronRight, X, Maximize2, MoveHorizontal } from 'lucide-react';
import { api, PublicGalleryItem } from '../../services/api';
import { AssetImage } from './AssetImage';
import { BrandLogo } from './BrandLogo';

interface CurvedPhotoGalleryProps {
  customItems?: PublicGalleryItem[];
  className?: string;
  onItemsLoaded?: (count: number) => void;
}

export interface OrbitTierConfig {
  tier: 'mobile' | 'tablet' | 'desktop' | 'largeDesktop';
  visibleSlots: number;
  rx: number;
  rz: number;
  yFront: number;
  yRear: number;
  cardW: number;
  cardH: number;
  stageH: number;
  logoSize: number;
  perspective: number;
  frontScale: number;
  rearScale: number;
  maxRotateY: number;
  verticalOffset: number;
}

/**
 * Explicitly adaptive geometry configuration for each responsive viewport tier.
 * Never multiplies by a single naive scale factor.
 */
export function getOrbitTierConfig(width: number): OrbitTierConfig {
  if (width >= 1600) {
    // Tier 1: Large Desktop (>= 1600px)
    const cardW = 215;
    const cardH = Math.round(cardW * 1.28);
    const logoSize = 120;
    return {
      tier: 'largeDesktop',
      visibleSlots: 11,
      rx: 540,
      rz: 240,
      yFront: 180,
      yRear: 180,
      cardW,
      cardH,
      stageH: 560,
      logoSize,
      perspective: 1400,
      frontScale: 1.06,
      rearScale: 0.74,
      maxRotateY: 22,
      verticalOffset: 0
    };
  } else if (width >= 1200) {
    // Tier 2: Normal Desktop (1200px - 1599px, e.g. 1366x768, 1440x900)
    const cardW = 180;
    const cardH = Math.round(cardW * 1.28);
    const logoSize = 104;
    return {
      tier: 'desktop',
      visibleSlots: 9,
      rx: 440,
      rz: 190,
      yFront: 155,
      yRear: 155,
      cardW,
      cardH,
      stageH: 500,
      logoSize,
      perspective: 1200,
      frontScale: 1.05,
      rearScale: 0.76,
      maxRotateY: 18,
      verticalOffset: 0
    };
  } else if (width >= 768) {
    // Tier 3: Tablet (768px - 1199px)
    const cardW = 145;
    const cardH = Math.round(cardW * 1.28);
    const logoSize = 88;
    return {
      tier: 'tablet',
      visibleSlots: 7,
      rx: 290,
      rz: 130,
      yFront: 130,
      yRear: 130,
      cardW,
      cardH,
      stageH: 420,
      logoSize,
      perspective: 1050,
      frontScale: 1.04,
      rearScale: 0.80,
      maxRotateY: 14,
      verticalOffset: 0
    };
  } else {
    // Tier 4: Mobile (< 768px)
    const clampedCardW = Math.min(130, Math.max(110, Math.round(width * 0.31)));
    const clampedCardH = Math.round(clampedCardW * 1.28);
    const clampedRx = Math.min(148, Math.max(122, Math.round(width * 0.38)));
    const clampedLogoSize = Math.min(76, Math.max(66, Math.round(width * 0.20)));
    const frontScale = 1.04;
    const rearScale = 0.82;
    
    // Exact visual-center equilibrium: gaps above and below the logo match identically
    const buffer = 18;
    const yRear = Math.round(clampedLogoSize / 2 + buffer + (clampedCardH * rearScale) / 2);
    const yFront = Math.round(clampedLogoSize / 2 + buffer + (clampedCardH * frontScale) / 2);

    return {
      tier: 'mobile',
      visibleSlots: 5,
      rx: clampedRx,
      rz: 60,
      yFront,
      yRear,
      cardW: clampedCardW,
      cardH: clampedCardH,
      stageH: 420,
      logoSize: clampedLogoSize,
      perspective: 850,
      frontScale,
      rearScale,
      maxRotateY: 10,
      verticalOffset: -12
    };
  }
}

export const CurvedPhotoGallery: React.FC<CurvedPhotoGalleryProps> = ({
  customItems,
  className = '',
  onItemsLoaded
}) => {
  const [items, setItems] = useState<PublicGalleryItem[]>(customItems || []);
  const [loading, setLoading] = useState(!customItems);
  const [currentAngle, setCurrentAngle] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartAngle, setDragStartAngle] = useState(0);
  const [velocity, setVelocity] = useState(0);
  const [selectedItem, setSelectedItem] = useState<PublicGalleryItem | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200);

  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const lastDragXRef = useRef<number>(0);
  const lastDragTimeRef = useRef<number>(0);

  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    startAngle: number;
    isHorizontal: boolean | null;
    hasMoved: boolean;
  }>({
    startX: 0,
    startY: 0,
    startAngle: 0,
    isHorizontal: null,
    hasMoved: false
  });

  // 1. Fetch public gallery items asynchronously if not provided via props
  useEffect(() => {
    if (customItems) {
      setItems(customItems);
      setLoading(false);
      onItemsLoaded?.(customItems.length);
      return;
    }

    let isMounted = true;
    const fetchGallery = async () => {
      try {
        const res = await api.gallery.getPublicItems();
        if (isMounted) {
          const fetched = res.success && Array.isArray(res.items) ? res.items : [];
          setItems(fetched);
          setLoading(false);
          onItemsLoaded?.(fetched.length);
        }
      } catch (err) {
        console.error('[CurvedPhotoGallery] Failed to fetch gallery:', err);
        if (isMounted) {
          setItems([]);
          setLoading(false);
          onItemsLoaded?.(0);
        }
      }
    };

    fetchGallery();
    return () => {
      isMounted = false;
    };
  }, [customItems, onItemsLoaded]);

  // 2. Responsive viewport & accessibility detection
  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });
    mediaQuery.addEventListener('change', handleMotionChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      mediaQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  // 3. Compute active adaptive tier configuration
  const config = useMemo(() => getOrbitTierConfig(viewportWidth), [viewportWidth]);

  // 4. Continuous 3D Orbital Animation Loop
  useEffect(() => {
    if (prefersReducedMotion || items.length === 0) return;

    const animate = (time: number) => {
      const delta = Math.min((time - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = time;

      if (!isDragging) {
        // Base orbit speed: gentle, continuous drift (~2.2 deg/sec, slowed on hover)
        const baseSpeed = isHovered ? 0.35 : 2.2;

        // Apply drag inertia / momentum decay
        if (Math.abs(velocity) > 0.01) {
          setCurrentAngle(prev => (prev + velocity) % 360);
          setVelocity(prev => prev * 0.92);
        } else {
          setCurrentAngle(prev => (prev + baseSpeed * delta) % 360);
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [prefersReducedMotion, items.length, isHovered, isDragging, velocity]);

  // 5. Mouse Drag Handlers (Desktop)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (prefersReducedMotion || items.length === 0) return;
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartAngle(currentAngle);
    lastDragXRef.current = e.clientX;
    lastDragTimeRef.current = performance.now();
    setVelocity(0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || prefersReducedMotion) return;
    const deltaX = e.clientX - dragStartX;
    const sensitivity = 0.25;
    const newAngle = (dragStartAngle - deltaX * sensitivity) % 360;
    setCurrentAngle(newAngle);

    const now = performance.now();
    const dt = now - lastDragTimeRef.current;
    if (dt > 10) {
      const dx = e.clientX - lastDragXRef.current;
      setVelocity(-dx * 0.08);
      lastDragXRef.current = e.clientX;
      lastDragTimeRef.current = now;
    }
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
    }
  };

  // 6. Touch Gestures with Vertical Scroll Protection (Mobile & Tablet)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || prefersReducedMotion || items.length === 0) return;
    const touch = e.touches[0];
    touchStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startAngle: currentAngle,
      isHorizontal: null,
      hasMoved: false
    };
    setIsDragging(true);
    setVelocity(0);
    lastDragXRef.current = touch.clientX;
    lastDragTimeRef.current = performance.now();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1 || prefersReducedMotion) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStateRef.current.startX;
    const deltaY = touch.clientY - touchStateRef.current.startY;

    // Detect gesture direction intent on initial movement
    if (touchStateRef.current.isHorizontal === null) {
      if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
        if (Math.abs(deltaY) > Math.abs(deltaX)) {
          // User is scrolling the page vertically! Release gallery drag cleanly
          touchStateRef.current.isHorizontal = false;
          setIsDragging(false);
          return;
        } else {
          // User is intentionally scrubbing the gallery horizontally
          touchStateRef.current.isHorizontal = true;
        }
      }
    }

    if (touchStateRef.current.isHorizontal === true) {
      touchStateRef.current.hasMoved = true;
      const sensitivity = config.tier === 'mobile' ? 0.35 : 0.28;
      const newAngle = (touchStateRef.current.startAngle - deltaX * sensitivity) % 360;
      setCurrentAngle(newAngle);

      const now = performance.now();
      const dt = now - lastDragTimeRef.current;
      if (dt > 10) {
        const dx = touch.clientX - lastDragXRef.current;
        setVelocity(-dx * 0.07);
        lastDragXRef.current = touch.clientX;
        lastDragTimeRef.current = now;
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchStateRef.current.isHorizontal = null;
  };

  // 7. Lightbox Navigation
  const openLightbox = (item: PublicGalleryItem, index: number) => {
    setSelectedItem(item);
    setSelectedIndex(index);
  };

  const closeLightbox = () => {
    setSelectedItem(null);
  };

  const nextLightboxItem = useCallback(() => {
    if (!items.length) return;
    const nextIdx = (selectedIndex + 1) % items.length;
    setSelectedIndex(nextIdx);
    setSelectedItem(items[nextIdx]);
  }, [items, selectedIndex]);

  const prevLightboxItem = useCallback(() => {
    if (!items.length) return;
    const prevIdx = (selectedIndex - 1 + items.length) % items.length;
    setSelectedIndex(prevIdx);
    setSelectedItem(items[prevIdx]);
  }, [items, selectedIndex]);

  useEffect(() => {
    if (!selectedItem) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextLightboxItem();
      if (e.key === 'ArrowLeft') prevLightboxItem();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem, nextLightboxItem, prevLightboxItem]);

  // RULE: If not loading and there are 0 active items, hide the section entirely
  if (!loading && items.length === 0) {
    return null;
  }

  // 8. Adaptive Slots Calculation
  // Total available slots determined by active tier (e.g. 5 on mobile, 7 on tablet, 9 on desktop, 11 on large desktop)
  const K = config.visibleSlots;
  const N = items.length;
  const angleStep = 360 / K;
  // Phase offset ensures diamond/horseshoe composition where no card sits dead-center over the logo at start
  const phaseOffset = 180 / K;

  // Build the array of K slots currently orbiting
  const slots = [];
  for (let k = 0; k < K; k++) {
    // Slot angle continuous calculation
    const continuousAngle = currentAngle + phaseOffset + k * angleStep;
    const normalizedAngle = ((continuousAngle + 180) % 360 + 360) % 360 - 180;
    const radians = (normalizedAngle * Math.PI) / 180;

    const sinVal = Math.sin(radians);
    const cosVal = Math.cos(radians);

    // Compute which database item belongs in this slot
    let item: PublicGalleryItem | undefined;
    let originalIdx = 0;

    if (N > 0) {
      if (N <= K) {
        originalIdx = k % N;
        item = items[originalIdx];
      } else {
        // Continuous lap counter: increments as slot passes through the far rear (-180° / +180°)
        const lap = Math.floor((continuousAngle + 180) / 360);
        originalIdx = ((k + lap * K) % N + N) % N;
        item = items[originalIdx];
      }
    }

    if (item) {
      // 3D coordinates
      const xPos = sinVal * config.rx;
      const zPos = cosVal * config.rz;

      // Depth hierarchy
      const depthFactor = (cosVal + 1) / 2; // [0, 1]
      const scale = config.rearScale + (config.frontScale - config.rearScale) * depthFactor;

      // Natural inclined orbital trajectory (harmonic continuous curve ensuring visual symmetry)
      const yPos = cosVal >= 0 ? cosVal * config.yFront : cosVal * config.yRear;

      // Gentle opacity transition at the far rear apex (smoothly cycles items without popping)
      let opacity = 0.85 + 0.15 * depthFactor;
      if (N > K && Math.abs(normalizedAngle) > 170) {
        const rearApexFade = Math.max(0, (180 - Math.abs(normalizedAngle)) / 10);
        opacity = opacity * rearApexFade;
      }

      const rotateY = -sinVal * config.maxRotateY;
      const zIndex = Math.round(15 + depthFactor * 65);

      slots.push({
        slotKey: k,
        item,
        originalIdx,
        xPos,
        yPos,
        zPos,
        scale,
        opacity,
        rotateY,
        zIndex,
        cosVal
      });
    }
  }

  return (
    <section 
      id="gallery-section"
      className={`relative w-full py-6 sm:py-10 md:py-14 bg-[#FAF9F6] border-y border-[#EAE8E1]/80 overflow-hidden select-none touch-pan-y ${className}`}
      aria-label="Photo Gallery - Moments in Fellowship"
      ref={containerRef}
    >
      {/* Subtle ambient background glow */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[350px] rounded-full pointer-events-none opacity-20 blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(197,155,39,0.18) 0%, rgba(250,249,246,0) 70%)'
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header: Pure Editorial Typography */}
        <div className="text-center max-w-2xl mx-auto mb-2 sm:mb-4 md:mb-6 px-4">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#9A7326] mb-1.5 sm:mb-2">
            Moments in Fellowship
          </p>

          <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-serif-koinonia font-bold text-[#18181B] tracking-tight leading-snug">
            Life at Koinonia <br className="sm:hidden" />Children & Teens
          </h2>
        </div>

        {/* LOADING STATE */}
        {loading && (
          <div className="h-64 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#E5D5AE] border-t-[#C59B27] animate-spin" />
            <span className="text-xs text-[#71717A] font-medium tracking-wide">Loading moments...</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 1. REDUCED MOTION STATIC GRID (Accessibility Fallback) */}
        {/* ========================================================================= */}
        {!loading && prefersReducedMotion && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 py-3">
            {items.map((item, idx) => (
              <div
                key={item.id || idx}
                onClick={() => openLightbox(item, idx)}
                className="group relative rounded-2xl overflow-hidden bg-white border border-[#EAE8E1] shadow-2xs hover:shadow-md transition-all cursor-pointer aspect-4/5"
              >
                <AssetImage
                  src={item.image_url}
                  alt={item.alt_text}
                  thumbnailWidth={400}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60" />
                {item.caption && (
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 text-white">
                    <p className="text-xs font-serif-koinonia font-medium truncate">
                      {item.caption}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. ADAPTIVE 3D ORBITAL GLOBE SCENE */}
        {/* ========================================================================= */}
        {!loading && !prefersReducedMotion && (
          <div 
            className="relative w-full flex items-center justify-center cursor-grab active:cursor-grabbing touch-pan-y"
            style={{
              height: `${config.stageH}px`,
              perspective: `${config.perspective}px`,
              perspectiveOrigin: '50% 50%'
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => {
              setIsHovered(false);
              setIsDragging(false);
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* 3D World Stage */}
            <div 
              className="relative w-full h-full flex items-center justify-center pointer-events-none"
              style={{
                transformStyle: 'preserve-3d'
              }}
            >
              {/* =================================================================== */}
              {/* PROTECTED CENTRAL KOINONIA LOGO MEDALLION (Independent Visual Anchor) */}
              {/* =================================================================== */}
              <div
                className="absolute pointer-events-auto select-none flex items-center justify-center"
                style={{
                  left: '50%',
                  top: `calc(50% + ${config.verticalOffset}px)`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 42
                }}
                title="Koinonia Children & Teens General Assembly"
              >
                <div 
                  className="rounded-full bg-[#FAF8F3]/95 backdrop-blur-md border border-[#C59B27]/40 ring-4 ring-[#C59B27]/10 shadow-[0_12px_36px_rgba(0,0,0,0.08),0_2px_8px_rgba(197,155,39,0.15)] flex flex-col items-center justify-center p-2 text-center transition-all duration-300"
                  style={{
                    width: `${config.logoSize}px`,
                    height: `${config.logoSize}px`
                  }}
                >
                  <BrandLogo context="compact" className="scale-85 sm:scale-95" />
                  <span className="text-[7px] sm:text-[8px] font-sans text-[#9A7326] font-bold tracking-widest uppercase mt-0.5 opacity-90">
                    GA 2026
                  </span>
                </div>
              </div>

              {/* =================================================================== */}
              {/* ADAPTIVE ORBITING PHOTOGRAPH CARDS (Photograph Only) */}
              {/* =================================================================== */}
              {slots.map((slot) => {
                const { slotKey, item, originalIdx, xPos, yPos, zPos, scale, opacity, rotateY, zIndex } = slot;

                return (
                  <div
                    key={`slot-${slotKey}`}
                    onClick={(e) => {
                      if (Math.abs(velocity) < 0.2 && !touchStateRef.current.hasMoved) {
                        e.stopPropagation();
                        openLightbox(item, originalIdx);
                      }
                    }}
                    className="absolute top-1/2 left-1/2 rounded-2xl bg-white p-1 sm:p-1.5 border border-[#EAE8E1]/90 shadow-md hover:shadow-xl transition-shadow duration-300 cursor-pointer overflow-hidden group pointer-events-auto"
                    style={{
                      width: `${config.cardW}px`,
                      height: `${config.cardH}px`,
                      transformStyle: 'preserve-3d',
                      transform: `translate3d(calc(-50% + ${xPos}px), calc(-50% + ${yPos + config.verticalOffset}px), ${zPos}px) rotateY(${rotateY}deg) scale(${scale})`,
                      opacity: opacity,
                      zIndex: zIndex,
                      willChange: 'transform, opacity'
                    }}
                    title={item.caption || item.alt_text}
                  >
                    <div className="relative w-full h-full rounded-xl overflow-hidden bg-[#FAF8F3]">
                      {/* Photograph */}
                      <AssetImage
                        src={item.image_url}
                        alt={item.alt_text || 'Koinonia Fellowship Photograph'}
                        thumbnailWidth={420}
                        iconType="camera"
                        label=""
                        hideText={true}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                        loading="lazy"
                        fetchpriority="low"
                      />

                      {/* Soft vignette gradient */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent pointer-events-none" />

                      {/* Subtle Expand Icon Badge */}
                      <div className="absolute top-2 right-2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/90 backdrop-blur-xs border border-white/60 text-[#18181B] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-2xs">
                        <Maximize2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#9A7326]" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. LIGHTBOX MODAL (Accessible, Keyboard & Touch Supported) */}
      {/* ========================================================================= */}
      {selectedItem && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label={selectedItem.alt_text || 'Photo viewer'}
        >
          <div 
            className="relative max-w-4xl w-full max-h-[90vh] bg-white rounded-3xl overflow-hidden shadow-2xl border border-[#EAE8E1] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-4 sm:px-5 py-3 border-b border-[#EAE8E1] flex items-center justify-between bg-[#FAF9F6]">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#9A7326] bg-[#FAF6EB] border border-[#E5D5AE] px-2.5 py-0.5 rounded-full">
                  Moment {selectedIndex + 1} of {items.length}
                </span>
              </div>
              <button
                onClick={closeLightbox}
                className="w-8 h-8 rounded-full bg-white border border-[#EAE8E1] hover:bg-[#FAF8F3] text-[#71717A] hover:text-[#18181B] flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Media Content */}
            <div className="relative flex-1 bg-black flex items-center justify-center min-h-[260px] sm:min-h-[420px] max-h-[68vh] overflow-hidden">
              <AssetImage
                src={selectedItem.image_url}
                alt={selectedItem.alt_text}
                thumbnailWidth={1600}
                iconType="camera"
                label=""
                className="w-full h-full object-contain"
              />

              {/* Prev / Next Navigation Buttons */}
              {items.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      prevLightboxItem();
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 flex items-center justify-center transition-all cursor-pointer"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      nextLightboxItem();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 flex items-center justify-center transition-all cursor-pointer"
                    aria-label="Next image"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Modal Footer: Shown ONLY if caption is present and non-empty */}
            {selectedItem.caption && selectedItem.caption.trim() !== '' && (
              <div className="p-4 sm:p-5 bg-white border-t border-[#EAE8E1]">
                <p className="text-sm sm:text-base font-serif-koinonia font-medium text-[#18181B] leading-snug">
                  {selectedItem.caption}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
