import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { api, PublicGalleryItem } from '../../services/api';
import parentHeroImg from '../../assets/images/parent_hero_1783622066454.jpg';
import volunteerHeroImg from '../../assets/images/volunteer_hero_1783622081200.jpg';

export interface MomentsGalleryProps {
  customItems?: PublicGalleryItem[];
  className?: string;
}

export interface ApprovedMoment {
  id: string;
  imageUrl: string;
  altText: string;
  caption?: string | null;
  objectPosition?: string;
  sort_order?: number;
}

// Fallback approved photographs used strictly when no items are returned from the public API
const APPROVED_DEFAULTS: ApprovedMoment[] = [
  {
    id: 'approved-1',
    imageUrl: parentHeroImg,
    altText: 'Families and children at Koinonia gathering',
    objectPosition: 'object-[center_22%]',
    sort_order: 1,
  },
  {
    id: 'approved-2',
    imageUrl: '/social_share.jpg',
    altText: 'Koinonia gathering sanctuary',
    objectPosition: 'object-center',
    sort_order: 2,
  },
  {
    id: 'approved-3',
    imageUrl: volunteerHeroImg,
    altText: 'Care team volunteer at Koinonia programme',
    objectPosition: 'object-[center_20%]',
    sort_order: 3,
  },
];

function getLayoutConfig(width: number) {
  if (width >= 1440) {
    return {
      cardWidth: 560,
      cardHeight: 720,
      xOffset: 440,
      scaleSide: 0.72,
      rotateYSide: 8,
      translateZCentre: 110,
      translateZSide: -120,
    };
  }
  if (width >= 1280) {
    return {
      cardWidth: 520,
      cardHeight: 670,
      xOffset: 400,
      scaleSide: 0.72,
      rotateYSide: 8,
      translateZCentre: 100,
      translateZSide: -110,
    };
  }
  if (width >= 1024) {
    return {
      cardWidth: 440,
      cardHeight: 580,
      xOffset: 330,
      scaleSide: 0.72,
      rotateYSide: 7,
      translateZCentre: 80,
      translateZSide: -100,
    };
  }
  // Tablet (768px - 1023px)
  return {
    cardWidth: 350,
    cardHeight: 470,
    xOffset: 220,
    scaleSide: 0.74,
    rotateYSide: 5,
    translateZCentre: 60,
    translateZSide: -80,
  };
}

export const MomentsGallery: React.FC<MomentsGalleryProps> = ({
  customItems,
  className = '',
}) => {
  const [items, setItems] = useState<ApprovedMoment[]>(
    customItems !== undefined
      ? customItems.map((item, idx) => ({
          id: item.id || `custom-${idx}`,
          imageUrl: item.image_url,
          altText: item.alt_text || 'Programme moment',
          caption: item.caption,
          objectPosition: 'object-center',
          sort_order: item.sort_order ?? idx,
        }))
      : APPROVED_DEFAULTS
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [stageTilt, setStageTilt] = useState({ rotateX: 0, rotateY: 0 });
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const mobileTrackRef = useRef<HTMLDivElement>(null);
  const lastWheelTime = useRef<number>(0);

  // Motion preference listener
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  // Resize listener for responsive geometry
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // One-time viewport entrance observer
  useEffect(() => {
    if (prefersReducedMotion) {
      setHasEntered(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHasEntered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    if (stageRef.current) {
      observer.observe(stageRef.current);
    }
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  // Load items from API or customItems prop (supports N items, respects sort_order)
  useEffect(() => {
    if (customItems !== undefined) {
      setItems(
        customItems.map((item, idx) => ({
          id: item.id || `custom-${idx}`,
          imageUrl: item.image_url,
          altText: item.alt_text || 'Programme moment',
          caption: item.caption,
          objectPosition: 'object-center',
          sort_order: item.sort_order ?? idx,
        }))
      );
      return;
    }

    let isMounted = true;
    api.gallery.getPublicItems()
      .then((res) => {
        if (!isMounted) return;
        if (res && res.success && Array.isArray(res.items) && res.items.length > 0) {
          // Respect Admin ordering: items from /api/public/gallery are ordered by sort_order ASC, created_at ASC
          setItems(
            res.items.map((item, idx) => ({
              id: item.id || `api-${idx}`,
              imageUrl: item.image_url,
              altText: item.alt_text || 'Programme moment',
              caption: item.caption,
              objectPosition: 'object-center',
              sort_order: item.sort_order ?? idx,
            }))
          );
        } else {
          setItems(APPROVED_DEFAULTS);
        }
      })
      .catch(() => {
        if (isMounted) {
          setItems(APPROVED_DEFAULTS);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [customItems]);

  const total = items.length;

  // Ensure activeIndex is always valid if total changes
  useEffect(() => {
    if (total > 0 && activeIndex >= total) {
      setActiveIndex(0);
    }
  }, [total, activeIndex]);

  // If 0 images, return null to avoid rendering an empty broken box
  if (total === 0) {
    return null;
  }

  const handlePrev = () => {
    if (total <= 1) return;
    setActiveIndex((prev) => (prev - 1 + total) % total);
  };

  const handleNext = () => {
    if (total <= 1) return;
    setActiveIndex((prev) => (prev + 1) % total);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      handleNext();
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (prefersReducedMotion || Math.abs(e.deltaX) < 30 || total <= 1) return;
    const now = Date.now();
    if (now - lastWheelTime.current < 450) return;
    lastWheelTime.current = now;

    if (e.deltaX > 30) {
      handleNext();
    } else if (e.deltaX < -30) {
      handlePrev();
    }
  };

  // Subtle restrained pointer depth on desktop (max ±1.5 deg)
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setStageTilt({
      rotateX: -y * 2.2,
      rotateY: x * 2.8,
    });
  };

  const handleMouseLeave = () => {
    setStageTilt({ rotateX: 0, rotateY: 0 });
  };

  // Keep mobile scroll aligned to activeIndex
  useEffect(() => {
    if (mobileTrackRef.current) {
      const container = mobileTrackRef.current;
      const card = container.children[activeIndex] as HTMLElement;
      if (card) {
        const offset = card.offsetLeft - (container.clientWidth - card.clientWidth) / 2;
        container.scrollTo({ left: offset, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      }
    }
  }, [activeIndex, prefersReducedMotion]);

  const cfg = getLayoutConfig(windowWidth);

  // Precompute indices for previous, current, and next in 3D stage (works for any N >= 3)
  const prevIdx = (activeIndex - 1 + total) % total;
  const currIdx = activeIndex;
  const nextIdx = (activeIndex + 1) % total;

  return (
    <section
      id="moments"
      aria-label="Moments from the programme"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      className={`py-16 sm:py-24 bg-[#FAF9F6] border-y border-[#EAE8E1]/80 overflow-hidden outline-none ${className}`}
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-2xl text-left mb-10 sm:mb-14 space-y-2">
          <span className="text-[11px] font-bold tracking-widest text-[#9A7326] uppercase font-sans block">
            GALLERY
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif-koinonia font-bold text-[#18181B] tracking-tight leading-tight">
            Moments from the programme
          </h2>
        </div>

        {/* ========================================================================= */}
        {/* REDUCED MOTION STATIC LAYOUT */}
        {/* ========================================================================= */}
        {prefersReducedMotion ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-3xl overflow-hidden border border-[#EAE8E1] bg-stone-100 shadow-sm aspect-[4/5]"
              >
                <img
                  src={item.imageUrl}
                  alt={item.altText}
                  className={`w-full h-full object-cover ${item.objectPosition || 'object-center'}`}
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* ========================================================================= */}
            {/* DESKTOP & TABLET: Centred 3D Perspective Stage (md:block) */}
            {/* ========================================================================= */}
            <div
              ref={stageRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              className="hidden md:block relative py-4"
            >
              <motion.div
                className="relative w-full h-[540px] lg:h-[680px] xl:h-[780px] flex items-center justify-center select-none"
                style={{
                  perspective: '1600px',
                  perspectiveOrigin: 'center center',
                  transformStyle: 'preserve-3d',
                }}
                animate={{
                  rotateX: stageTilt.rotateX,
                  rotateY: stageTilt.rotateY,
                }}
                transition={{
                  duration: 0.25,
                  ease: 'easeOut',
                }}
              >
                {/* STATE 1: Exactly 1 Image */}
                {total === 1 && (
                  <div
                    style={{
                      width: cfg.cardWidth,
                      height: cfg.cardHeight,
                    }}
                    className="rounded-3xl overflow-hidden bg-stone-900 border border-white/40 shadow-[0_35px_85px_-15px_rgba(24,24,27,0.38)] ring-1 ring-black/5"
                  >
                    <img
                      src={items[0].imageUrl}
                      alt={items[0].altText}
                      className={`w-full h-full object-cover ${items[0].objectPosition || 'object-center'}`}
                      loading="lazy"
                    />
                  </div>
                )}

                {/* STATE 2: Exactly 2 Images (Balanced two-image composition) */}
                {total === 2 && (
                  <div className="relative w-full h-full flex items-center justify-center">
                    {items.map((item, idx) => {
                      const isActive = idx === activeIndex;
                      const xOffset = idx === 0 ? -cfg.xOffset * 0.55 : cfg.xOffset * 0.55;
                      return (
                        <motion.div
                          key={item.id}
                          onClick={() => setActiveIndex(idx)}
                          animate={{
                            x: xOffset,
                            z: isActive ? cfg.translateZCentre : cfg.translateZSide,
                            scale: isActive ? 1 : cfg.scaleSide,
                            opacity: isActive ? 1 : 0.82,
                          }}
                          transition={{
                            duration: 0.6,
                            ease: [0.16, 1, 0.3, 1] as const,
                          }}
                          style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            width: cfg.cardWidth,
                            height: cfg.cardHeight,
                            marginLeft: -cfg.cardWidth / 2,
                            marginTop: -cfg.cardHeight / 2,
                            zIndex: isActive ? 30 : 20,
                            transformStyle: 'preserve-3d',
                          }}
                          className="cursor-pointer select-none"
                        >
                          <div
                            className={`w-full h-full rounded-3xl overflow-hidden bg-stone-900 border transition-all duration-500 ${
                              isActive
                                ? 'border-white/40 shadow-[0_35px_85px_-15px_rgba(24,24,27,0.38)] ring-1 ring-black/5'
                                : 'border-white/10 shadow-[0_20px_45px_-10px_rgba(24,24,27,0.24)] hover:opacity-95'
                            }`}
                          >
                            <img
                              src={item.imageUrl}
                              alt={item.altText}
                              className={`w-full h-full object-cover ${item.objectPosition || 'object-center'}`}
                              loading="lazy"
                            />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* STATE 3: N >= 3 Images (Full 3-card visible 3D depth stage, all N navigable) */}
                {total >= 3 &&
                  items.map((item, index) => {
                    const isCentre = index === currIdx;
                    const isPrev = index === prevIdx;
                    const isNext = index === nextIdx;
                    const isVisible = isCentre || isPrev || isNext;

                    let targetX = 0;
                    let targetZ = 0;
                    let targetRotateY = 0;
                    let targetScale = 1;
                    let targetOpacity = 0;
                    let zIndex = 10;
                    let targetFilter = 'none';

                    if (isCentre) {
                      targetX = 0;
                      targetZ = cfg.translateZCentre;
                      targetRotateY = 0;
                      targetScale = 1;
                      targetOpacity = 1;
                      zIndex = 30;
                      targetFilter = 'none';
                    } else if (isNext) {
                      targetX = hasEntered ? cfg.xOffset : cfg.xOffset * 0.4;
                      targetZ = cfg.translateZSide;
                      targetRotateY = -cfg.rotateYSide;
                      targetScale = cfg.scaleSide;
                      targetOpacity = hasEntered ? 0.78 : 0;
                      zIndex = 20;
                      targetFilter = 'grayscale(25%) brightness(0.9)';
                    } else if (isPrev) {
                      targetX = hasEntered ? -cfg.xOffset : -cfg.xOffset * 0.4;
                      targetZ = cfg.translateZSide;
                      targetRotateY = cfg.rotateYSide;
                      targetScale = cfg.scaleSide;
                      targetOpacity = hasEntered ? 0.78 : 0;
                      zIndex = 20;
                      targetFilter = 'grayscale(25%) brightness(0.9)';
                    } else {
                      // Non-adjacent items recede smoothly into depth so transitions remain continuous
                      targetX = index < activeIndex ? -cfg.xOffset * 1.5 : cfg.xOffset * 1.5;
                      targetZ = cfg.translateZSide - 100;
                      targetRotateY = index < activeIndex ? cfg.rotateYSide * 1.5 : -cfg.rotateYSide * 1.5;
                      targetScale = cfg.scaleSide * 0.8;
                      targetOpacity = 0;
                      zIndex = 0;
                      targetFilter = 'grayscale(60%) brightness(0.7)';
                    }

                    return (
                      <motion.div
                        key={item.id}
                        onClick={() => {
                          if (isPrev) handlePrev();
                          else if (isNext) handleNext();
                        }}
                        initial={false}
                        animate={{
                          x: targetX,
                          z: targetZ,
                          rotateY: targetRotateY,
                          scale: targetScale,
                          opacity: targetOpacity,
                        }}
                        transition={{
                          duration: 0.72,
                          ease: [0.16, 1, 0.3, 1] as const,
                        }}
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '50%',
                          width: cfg.cardWidth,
                          height: cfg.cardHeight,
                          marginLeft: -cfg.cardWidth / 2,
                          marginTop: -cfg.cardHeight / 2,
                          zIndex,
                          filter: targetFilter,
                          transformStyle: 'preserve-3d',
                          pointerEvents: isVisible ? 'auto' : 'none',
                        }}
                        className="cursor-pointer select-none"
                      >
                        <div
                          className={`w-full h-full rounded-3xl overflow-hidden bg-stone-900 border transition-all duration-500 ${
                            isCentre
                              ? 'border-white/40 shadow-[0_35px_85px_-15px_rgba(24,24,27,0.38)] ring-1 ring-black/5'
                              : 'border-white/10 shadow-[0_20px_45px_-10px_rgba(24,24,27,0.24)] hover:opacity-90'
                          }`}
                        >
                          <img
                            src={item.imageUrl}
                            alt={item.altText}
                            className={`w-full h-full object-cover ${item.objectPosition || 'object-center'}`}
                            draggable={false}
                            loading="lazy"
                          />
                        </div>
                      </motion.div>
                    );
                  })}
              </motion.div>

              {/* Desktop / Tablet Controls (shown when total > 1) */}
              {total > 1 && (
                <div className="hidden md:flex items-center justify-between max-w-xs mx-auto mt-8">
                  <button
                    type="button"
                    onClick={handlePrev}
                    aria-label="Previous photograph"
                    className="w-11 h-11 rounded-full bg-white border border-[#D9D6CE] hover:border-[#C59B27] hover:bg-[#FAF6EB] flex items-center justify-center text-[#262626] transition-all cursor-pointer shadow-xs"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  {/* Understated progress counter for N > 5, dot indicators for N <= 5 */}
                  {total > 5 ? (
                    <span className="text-xs font-semibold text-[#52525B] font-mono tracking-wider">
                      {activeIndex + 1} / {total}
                    </span>
                  ) : (
                    <div className="flex items-center space-x-2">
                      {items.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActiveIndex(idx)}
                          aria-label={`Go to photo ${idx + 1}`}
                          className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                            idx === activeIndex
                              ? 'w-8 bg-[#C59B27]'
                              : 'w-2 bg-[#E5D5AE] hover:bg-[#C59B27]/50'
                          }`}
                        />
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleNext}
                    aria-label="Next photograph"
                    className="w-11 h-11 rounded-full bg-white border border-[#D9D6CE] hover:border-[#C59B27] hover:bg-[#FAF6EB] flex items-center justify-center text-[#262626] transition-all cursor-pointer shadow-xs"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* ========================================================================= */}
            {/* MOBILE: Large Clean Horizontal Swipe Track (< md) */}
            {/* ========================================================================= */}
            <div className="md:hidden">
              <div
                ref={mobileTrackRef}
                className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar space-x-4 px-6 py-4"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {items.map((item, idx) => {
                  const isActive = idx === activeIndex;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setActiveIndex(idx)}
                      className="snap-center shrink-0 w-[84vw] max-w-[340px] transition-all duration-300 cursor-pointer"
                    >
                      <div
                        className={`aspect-[4/5] rounded-3xl overflow-hidden bg-stone-900 border transition-all duration-300 ${
                          isActive
                            ? 'border-[#C59B27] shadow-[0_24px_50px_-12px_rgba(24,24,27,0.3)] scale-100'
                            : 'border-[#EAE8E1] opacity-70 scale-95'
                        }`}
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.altText}
                          className={`w-full h-full object-cover ${item.objectPosition || 'object-center'}`}
                          loading="lazy"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Mobile Indicators (Counter when N > 5, dots when N <= 5) */}
              {total > 1 && (
                <div className="flex items-center justify-center space-x-2.5 mt-4">
                  {total > 5 ? (
                    <span className="text-xs font-semibold text-[#52525B] font-mono tracking-wider">
                      {activeIndex + 1} / {total}
                    </span>
                  ) : (
                    items.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveIndex(idx)}
                        aria-label={`Go to image ${idx + 1}`}
                        className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                          idx === activeIndex ? 'w-6 bg-[#C59B27]' : 'w-1.5 bg-[#E5D5AE]'
                        }`}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
};
