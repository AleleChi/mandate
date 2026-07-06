import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { REAL_ASSETS } from '../../config/assets';
import { AssetImage } from './AssetImage';

interface MomentCard {
  id: string;
  title: string;
  image: string;
  videoUrl?: string;
}

const MOMENTS: MomentCard[] = [
  {
    id: 'arrival',
    title: 'Arrival',
    image: REAL_ASSETS.gallery.arrival,
  },
  {
    id: 'check-in',
    title: 'Check-in',
    image: REAL_ASSETS.gallery.checkIn,
  },
  {
    id: 'activities',
    title: 'Activities',
    image: REAL_ASSETS.gallery.activities,
  },
  {
    id: 'teaching',
    title: 'Teaching',
    image: REAL_ASSETS.gallery.teaching,
  },
  {
    id: 'care-team',
    title: 'Care team',
    image: REAL_ASSETS.gallery.careTeam,
  },
  {
    id: 'pickup',
    title: 'Pickup',
    image: REAL_ASSETS.gallery.pickup,
  },
  {
    id: 'parent-updates',
    title: 'Parent updates',
    image: REAL_ASSETS.gallery.parentUpdates,
  },
  {
    id: 'event-moments',
    title: 'Event moments',
    image: REAL_ASSETS.gallery.eventMoments,
    videoUrl: REAL_ASSETS.gallery.eventVideo,
  },
];

interface PastMomentsCarouselProps {
  loaded?: boolean;
}

export const PastMomentsCarousel: React.FC<PastMomentsCarouselProps> = ({ loaded = true }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Drag / Swipe ref states
  const dragStartX = useRef<number | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);

    return () => {
      window.removeEventListener('resize', checkMobile);
      mediaQuery.removeEventListener('change', listener);
    };
  }, []);

  const handlePrev = () => {
    setActiveIndex((prev) => (prev === 0 ? MOMENTS.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev === MOMENTS.length - 1 ? 0 : prev + 1));
  };

  // Touch / Mouse Drag handlers
  const handleStart = (clientX: number) => {
    dragStartX.current = clientX;
    isDragging.current = true;
  };

  const handleMove = (clientX: number) => {
    if (!isDragging.current || dragStartX.current === null) return;
    const diff = clientX - dragStartX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        handlePrev();
      } else {
        handleNext();
      }
      isDragging.current = false;
      dragStartX.current = null;
    }
  };

  const handleEnd = () => {
    isDragging.current = false;
    dragStartX.current = null;
  };

  // Helper to compute shortest circular offset from activeIndex
  const getRelativeOffset = (index: number) => {
    const total = MOMENTS.length;
    let offset = (index - activeIndex) % total;
    if (offset > Math.floor(total / 2)) {
      offset -= total;
    } else if (offset < -Math.floor(total / 2)) {
      offset += total;
    }
    return offset;
  };

  return (
    <section id="moments" className="pt-28 pb-24 sm:pt-36 sm:pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full overflow-hidden">
      {/* Section Title & Controls */}
      <div className={`flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-14 sm:mb-16 transition-all duration-1000 ease-out ${loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        <div className="max-w-2xl">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif-koinonia font-bold text-[#18181B] tracking-tight leading-tight">
            Past moments from the Children and Teens experience.
          </h2>
        </div>

        <div className="flex items-center justify-between sm:justify-end space-x-6 shrink-0 pb-1">
          <span className="text-xs font-bold tracking-widest text-[#9A7326] uppercase">
            Drag to explore &rarr;
          </span>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={handlePrev}
              aria-label="Previous moment"
              className="w-10 h-10 rounded-full bg-white border border-[#EAE8E1] flex items-center justify-center text-[#18181B] hover:bg-[#FAF6EB] hover:border-[#E5D5AE] transition-all duration-300 shadow-2xs"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleNext}
              aria-label="Next moment"
              className="w-10 h-10 rounded-full bg-white border border-[#EAE8E1] flex items-center justify-center text-[#18181B] hover:bg-[#FAF6EB] hover:border-[#E5D5AE] transition-all duration-300 shadow-2xs"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3D Carousel Container */}
      <div
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        onTouchEnd={handleEnd}
        onMouseDown={(e) => handleStart(e.clientX)}
        onMouseMove={(e) => handleMove(e.clientX)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        style={{ perspective: isMobile ? '900px' : '1150px' }}
        className="relative h-[480px] sm:h-[580px] w-full flex items-center justify-center cursor-grab active:cursor-grabbing select-none my-4 sm:my-8"
      >
        <div
          style={{ transformStyle: 'preserve-3d' }}
          className="relative w-full h-full flex items-center justify-center"
        >
          {MOMENTS.map((moment, index) => {
            const offset = getRelativeOffset(index);
            const isCenter = offset === 0;
            const isLeft = offset === -1;
            const isRight = offset === 1;

            // Determine 3D transform attributes based on responsive screen
            let scale = 0.65;
            let translateZ = -240;
            let rotateY = offset < 0 ? 16 : -16;
            let translateX = offset * (isMobile ? 180 : 340);
            let opacity = 0;
            let blur = '2px';
            let zIndex = 0;
            let pointerEvents: 'auto' | 'none' = 'none';

            if (isCenter) {
              scale = 1;
              translateZ = 0;
              rotateY = 0;
              translateX = 0;
              opacity = 1;
              blur = '0px';
              zIndex = 30;
              pointerEvents = 'auto';
            } else if (isLeft) {
              scale = isMobile ? 0.86 : 0.82;
              translateZ = isMobile ? -80 : -120;
              rotateY = isMobile ? 8 : 10;
              translateX = isMobile ? -230 : -360;
              opacity = 0.82;
              blur = '1px';
              zIndex = 20;
              pointerEvents = 'auto';
            } else if (isRight) {
              scale = isMobile ? 0.86 : 0.82;
              translateZ = isMobile ? -80 : -120;
              rotateY = isMobile ? -8 : -10;
              translateX = isMobile ? 230 : 360;
              opacity = 0.82;
              blur = '1px';
              zIndex = 20;
              pointerEvents = 'auto';
            } else if (Math.abs(offset) === 2) {
              scale = 0.68;
              translateZ = -220;
              rotateY = offset < 0 ? 14 : -14;
              translateX = offset * (isMobile ? 200 : 360);
              opacity = 0.35;
              blur = '2px';
              zIndex = 10;
            }

            if (prefersReducedMotion) {
              rotateY = 0;
              translateZ = 0;
            }

            return (
              <div
                key={moment.id}
                onClick={() => {
                  if (isLeft) handlePrev();
                  if (isRight) handleNext();
                }}
                style={{
                  transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                  opacity,
                  filter: `blur(${blur})`,
                  zIndex,
                  pointerEvents,
                  transition: prefersReducedMotion
                    ? 'opacity 0.4s ease'
                    : 'all 750ms cubic-bezier(0.25, 1, 0.5, 1)',
                }}
                className={`absolute w-[290px] sm:w-[380px] lg:w-[420px] transition-all flex flex-col items-start ${
                  isCenter ? 'cursor-default' : 'cursor-pointer hover:opacity-95'
                }`}
              >
                <div
                  className={`relative w-full h-[390px] sm:h-[480px] rounded-3xl overflow-hidden bg-white border border-[#EAE8E1] shadow-xl transition-transform duration-500 ease-out ${
                    isCenter ? 'hover:scale-[1.02]' : ''
                  }`}
                >
                  {moment.videoUrl && moment.videoUrl.trim() !== '' && isCenter && !prefersReducedMotion ? (
                    <video
                      autoPlay
                      loop
                      muted
                      playsInline
                      poster={moment.image}
                      className="w-full h-full object-cover grayscale sepia-[0.08] contrast-[1.04] select-none pointer-events-none"
                    >
                      <source src={moment.videoUrl} type="video/mp4" />
                    </video>
                  ) : (
                    <AssetImage
                      src={moment.image}
                      alt={moment.title}
                      className="w-full h-full object-cover grayscale sepia-[0.08] contrast-[1.04] select-none pointer-events-none"
                    />
                  )}
                  {moment.videoUrl && moment.videoUrl.trim() !== '' && (
                    <div className="absolute top-4 right-4 bg-[#18181B]/80 backdrop-blur-md text-white text-xs font-medium px-3 py-1.5 rounded-full flex items-center space-x-1.5 border border-white/20 shadow-sm">
                      <Play className="w-3 h-3 fill-current text-[#C59B27]" />
                      <span>Video</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 pl-1">
                  <h3 className="text-lg sm:text-xl font-serif-koinonia font-bold text-[#18181B] tracking-tight">
                    {moment.title}
                  </h3>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagination indicators */}
      <div className="flex items-center justify-center space-x-2 pt-2">
        {MOMENTS.map((moment, idx) => (
          <button
            key={moment.id}
            onClick={() => setActiveIndex(idx)}
            aria-label={`Go to ${moment.title}`}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              activeIndex === idx ? 'w-8 bg-[#9A7326]' : 'w-2 bg-[#EAE8E1] hover:bg-[#D9D6CE]'
            }`}
          />
        ))}
      </div>
    </section>
  );
};
