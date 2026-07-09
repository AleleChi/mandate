import React, { useState, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { REAL_ASSETS } from '../../config/assets';
import { AssetImage } from './AssetImage';

interface ChecklistItem {
  id: string;
  label: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'photo', label: 'Child photo check' },
  { id: 'parent', label: 'Parent profile' },
  { id: 'pickup-person', label: 'Approved pickup person' },
  { id: 'record', label: 'Pickup record' },
];

interface SafetySectionProps {
  customImage?: string;
}

export const SafetySection: React.FC<SafetySectionProps> = ({ customImage }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

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

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
      mediaQuery.removeEventListener('change', listener);
      observer.disconnect();
    };
  }, []);

  return (
    <section
      id="safety"
      ref={sectionRef}
      className="bg-[#18181B] text-white py-24 sm:py-32 my-12 relative overflow-hidden border-t border-b border-white/10"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left text and checklist block */}
          <div className="lg:col-span-6 space-y-6">
            {/* Eyebrow */}
            <div
              style={{
                opacity: prefersReducedMotion || isVisible ? 1 : 0,
                transition: 'opacity 700ms cubic-bezier(0.25, 1, 0.5, 1)',
              }}
            >
              <span className="text-xs font-bold tracking-widest text-[#D4AF37] uppercase block font-sans">
                SAFETY & PICKUP CHECKS
              </span>
            </div>

            {/* Title */}
            <div
              style={{
                opacity: prefersReducedMotion || isVisible ? 1 : 0,
                transform: prefersReducedMotion || isVisible ? 'translateY(0)' : 'translateY(22px)',
                transition: 'opacity 750ms cubic-bezier(0.25, 1, 0.5, 1) 120ms, transform 750ms cubic-bezier(0.25, 1, 0.5, 1) 120ms',
              }}
            >
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif-koinonia font-bold text-white tracking-tight leading-tight">
                Clear checks before entry and pickup.
              </h2>
            </div>

            {/* Body text */}
            <div
              style={{
                opacity: prefersReducedMotion || isVisible ? 1 : 0,
                transform: prefersReducedMotion || isVisible ? 'translateY(0)' : 'translateY(22px)',
                transition: 'opacity 750ms cubic-bezier(0.25, 1, 0.5, 1) 240ms, transform 750ms cubic-bezier(0.25, 1, 0.5, 1) 240ms',
              }}
            >
              <p className="text-base sm:text-lg text-[#D1D5DB] leading-relaxed max-w-xl">
                The team can confirm each child, parent, and approved pickup person before entry and pickup.
              </p>
            </div>

            {/* Refined Checklist Cards */}
            <div className="space-y-3 pt-3">
              {CHECKLIST_ITEMS.map((item, index) => {
                const delayMs = 350 + index * 120;
                return (
                  <div
                    key={item.id}
                    style={{
                      opacity: prefersReducedMotion || isVisible ? 1 : 0,
                      transform: prefersReducedMotion || isVisible ? 'translateY(0)' : 'translateY(18px)',
                      transition: `opacity 750ms cubic-bezier(0.25, 1, 0.5, 1) ${delayMs}ms, transform 750ms cubic-bezier(0.25, 1, 0.5, 1) ${delayMs}ms`,
                    }}
                    className="group bg-white/[0.04] py-3.5 px-4 sm:px-5 rounded-2xl border border-white/10 flex items-center space-x-4 transition-all duration-300 ease-out hover:-translate-y-[4px] hover:bg-white/[0.07] hover:border-[#C59B27]/45 hover:shadow-[0_8px_24px_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(212,175,55,0.18)] cursor-default"
                  >
                    <div className="w-8 h-8 rounded-xl bg-[#C59B27]/15 border border-[#C59B27]/30 flex items-center justify-center text-[#D4AF37] shrink-0 transition-all duration-300 ease-out group-hover:bg-[#C59B27]/30 group-hover:border-[#C59B27]/60 group-hover:text-white group-hover:scale-105">
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <span className="text-sm sm:text-base font-medium text-[#F9FAFB] tracking-tight group-hover:text-white transition-colors duration-300">
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right premium image reveal panel */}
          <div
            style={{
              opacity: prefersReducedMotion || isVisible ? 1 : 0,
              transform: prefersReducedMotion || isVisible ? 'translateY(0)' : 'translateY(24px)',
              transition: 'opacity 800ms cubic-bezier(0.25, 1, 0.5, 1) 300ms, transform 800ms cubic-bezier(0.25, 1, 0.5, 1) 300ms',
            }}
            className="lg:col-span-6"
          >
            <div className="relative group rounded-3xl overflow-hidden border border-[#C59B27]/30 hover:border-[#C59B27]/60 shadow-2xl bg-[#222228] aspect-[16/10] sm:aspect-[4/3] transition-all duration-500">
              {/* Event care image placeholder */}
              <AssetImage
                src={customImage || REAL_ASSETS.safetySection}
                alt="Clear checks before entry and pickup"
                iconType="shield"
                label="Safety & Check-in Station"
                className="w-full h-full object-cover grayscale sepia-[0.08] contrast-[1.04] opacity-90 transition-all duration-700 ease-out group-hover:scale-[1.02] group-hover:opacity-100 group-hover:sepia-0"
              />

              {/* Subtle dark gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none transition-opacity duration-500 group-hover:opacity-80" />

              {/* Geometric curtain panels for split-screen reveal animation on desktop */}
              {!prefersReducedMotion && !isMobile && (
                <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden rounded-3xl">
                  {/* Leftmost panel */}
                  <div
                    style={{
                      clipPath: 'polygon(0 0, 32% 0, 22% 100%, 0 100%)',
                      transform: isVisible ? 'translateX(-105%)' : 'translateX(0)',
                      transition: 'transform 1050ms cubic-bezier(0.25, 1, 0.5, 1) 250ms',
                    }}
                    className="absolute inset-0 bg-[#222228] border-r border-[#C59B27]/30"
                  />
                  {/* Inner left panel */}
                  <div
                    style={{
                      clipPath: 'polygon(32% 0, 53% 0, 43% 100%, 22% 100%)',
                      transform: isVisible ? 'translateX(-105%)' : 'translateX(0)',
                      transition: 'transform 1150ms cubic-bezier(0.25, 1, 0.5, 1) 380ms',
                    }}
                    className="absolute inset-0 bg-[#1C1C22] border-r border-[#C59B27]/25"
                  />
                  {/* Inner right panel */}
                  <div
                    style={{
                      clipPath: 'polygon(53% 0, 78% 0, 68% 100%, 43% 100%)',
                      transform: isVisible ? 'translateX(105%)' : 'translateX(0)',
                      transition: 'transform 1150ms cubic-bezier(0.25, 1, 0.5, 1) 380ms',
                    }}
                    className="absolute inset-0 bg-[#1C1C22] border-l border-[#C59B27]/25"
                  />
                  {/* Rightmost panel */}
                  <div
                    style={{
                      clipPath: 'polygon(78% 0, 100% 0, 100% 100%, 68% 100%)',
                      transform: isVisible ? 'translateX(105%)' : 'translateX(0)',
                      transition: 'transform 1050ms cubic-bezier(0.25, 1, 0.5, 1) 250ms',
                    }}
                    className="absolute inset-0 bg-[#222228] border-l border-[#C59B27]/30"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
