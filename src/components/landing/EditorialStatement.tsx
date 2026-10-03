import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { QrCode } from 'lucide-react';
import parentHeroImg from '../../assets/images/parent_hero_1783622066454.jpg';

export interface EditorialStatementProps {
  backgroundImage?: string;
}

export const EditorialStatement: React.FC<EditorialStatementProps> = ({
  backgroundImage,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });
  const systemReducedMotion = useReducedMotion();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, []);

  const shouldReduceMotion = Boolean(systemReducedMotion || prefersReducedMotion);
  const activeIndex = hoveredIndex ?? focusedIndex;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (shouldReduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 to 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5; // -0.5 to 0.5
    setMouseOffset({ x, y });
  };

  const handleMouseLeave = () => {
    setMouseOffset({ x: 0, y: 0 });
    setHoveredIndex(null);
  };

  const resolvedPickupImage = backgroundImage && backgroundImage.trim() !== ''
    ? backgroundImage
    : parentHeroImg;

  return (
    <section
      className="py-14 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full"
      aria-label="Children and teens experience"
    >
      {/* ========================================================================= */}
      {/* 1. Header Area: Strong Sans Display Typography, Confident Compact Rhythm  */}
      {/* ========================================================================= */}
      <motion.div
        className="text-center max-w-[980px] mx-auto"
        initial={shouldReduceMotion ? undefined : { opacity: 0, y: 16 }}
        whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="text-xs sm:text-[13px] font-bold tracking-[0.14em] text-[#9A7326] dark:text-[#D4AF37] uppercase font-sans block mb-2 sm:mb-3">
          CHILDREN &amp; TEENS EXPERIENCE
        </span>

        <h2 className="text-[38px] sm:text-5xl lg:text-[62px] xl:text-[70px] font-sans font-extrabold text-[#18181B] dark:text-[#F7F4ED] tracking-[-0.04em] leading-[1.04] sm:leading-[1.01] lg:leading-[0.98]">
          A safe, well-organised experience for every child.
        </h2>

        <p className="mt-3.5 sm:mt-4 text-base sm:text-lg lg:text-[19px] text-[#52525B] dark:text-[#C8C2B6] leading-[1.62] font-normal max-w-[720px] mx-auto">
          From registration to pickup, the Children &amp; Teens team keeps the information needed for each child in one place, so check-in, care, and pickup can be handled clearly on event day.
        </p>
      </motion.div>

      {/* ========================================================================= */}
      {/* 2. One Connected Visual Stage (Asymmetric 3-Part Editorial Composition)    */}
      {/* ========================================================================= */}
      <div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="mt-10 sm:mt-12 rounded-3xl overflow-hidden border border-[#E5D5AE]/70 dark:border-[#383733] bg-[#121214] shadow-xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 min-h-[540px] lg:min-h-[600px] items-stretch">
          {/* ======================================================================= */}
          {/* PANEL 01: BEFORE THE EVENT (Deep Charcoal, Text-Led, Document Layer)    */}
          {/* ======================================================================= */}
          <motion.div
            tabIndex={0}
            onMouseEnter={() => setHoveredIndex(0)}
            onFocus={() => setFocusedIndex(0)}
            onBlur={() => setFocusedIndex(null)}
            initial={shouldReduceMotion ? undefined : { opacity: 0, x: -16 }}
            whileInView={shouldReduceMotion ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.55, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="relative md:col-span-1 lg:col-span-3 bg-[#141417] dark:bg-[#1E1D1A] text-white p-7 sm:p-9 flex flex-col justify-between border-b md:border-b-0 md:border-r border-white/10 dark:border-r-[#33312C] overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C59B27] cursor-default"
          >
            {/* Oversized background step numeral with subtle inverse parallax */}
            <span
              aria-hidden="true"
              className="text-8xl sm:text-9xl font-serif-koinonia font-bold text-white/[0.04] absolute -bottom-5 -left-2 select-none pointer-events-none transition-transform duration-300"
              style={{
                transform: shouldReduceMotion
                  ? 'none'
                  : `translate3d(${-mouseOffset.x * 6}px, ${-mouseOffset.y * 6 + (activeIndex === 0 ? -4 : 0)}px, 0)`,
              }}
            >
              01
            </span>

            {/* Editorial Typography content */}
            <div className="relative z-10">
              <span className="text-[10px] font-bold tracking-widest text-[#C59B27] uppercase font-sans block">
                01 / BEFORE THE EVENT
              </span>
              <h3 className="text-2xl sm:text-3xl font-sans font-bold text-white tracking-tight mt-2">
                Registration
              </h3>
              <p className="mt-3 text-xs sm:text-sm text-zinc-300 leading-relaxed font-normal max-w-xs">
                Parents add the child's details and any care information needed for the programme.
              </p>
            </div>

            {/* Subtle editorial document shape (No fake input lines, no progress bars) */}
            <div className="relative z-10 mt-10 pt-6 border-t border-white/10">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 relative overflow-hidden backdrop-blur-xs">
                <div className="w-10 h-[2px] bg-[#C59B27]" />
                <span className="text-[10.5px] uppercase tracking-[0.18em] text-zinc-400 font-sans block mt-3 font-medium">
                  Care &amp; attendance record
                </span>
              </div>
            </div>
          </motion.div>

          {/* ======================================================================= */}
          {/* PANEL 02: ARRIVAL (Light Surface, Tallest, Physical Event Pass Visual)   */}
          {/* ======================================================================= */}
          <motion.div
            tabIndex={0}
            onMouseEnter={() => setHoveredIndex(1)}
            onFocus={() => setFocusedIndex(1)}
            onBlur={() => setFocusedIndex(null)}
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 20, scale: 0.97 }}
            whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.6, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="relative md:col-span-1 lg:col-span-5 bg-[#FAF8F5] text-zinc-900 p-7 sm:p-9 flex flex-col justify-between border-b md:border-b-0 lg:border-r border-[#E5D5AE]/70 dark:border-[#383733] overflow-visible focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C59B27] cursor-default z-10 keep-ivory"
          >
            {/* Oversized background step numeral */}
            <span
              aria-hidden="true"
              className="text-8xl sm:text-9xl font-serif-koinonia font-bold text-[#8C6D23]/[0.05] absolute -bottom-5 -right-2 select-none pointer-events-none"
            >
              02
            </span>

            {/* Editorial Typography content */}
            <div className="relative z-10">
              <span className="text-[10px] font-bold tracking-widest text-[#8C6D23] uppercase font-sans block">
                02 / ARRIVAL
              </span>
              <h3 className="text-2xl sm:text-3xl font-sans font-bold text-[#18181B] tracking-tight mt-2">
                Check in
              </h3>
              <p className="mt-3 text-xs sm:text-sm text-[#52525B] leading-relaxed font-normal max-w-sm">
                The event pass is presented when the child arrives so their entry can be recorded.
              </p>
            </div>

            {/* Physical designed Event Pass visual (Floating, elegant depth, no fake PII, no status badge) */}
            <div
              className="relative z-20 my-6 sm:my-8 flex items-center justify-center transition-transform duration-300"
              style={{
                perspective: '1000px',
                transform: shouldReduceMotion
                  ? 'none'
                  : `translate3d(${mouseOffset.x * 8}px, ${mouseOffset.y * 8 + (activeIndex === 1 ? -4 : 0)}px, 0) rotateY(${mouseOffset.x * 2}deg) rotateX(${-mouseOffset.y * 2}deg)`,
              }}
            >
              <div className="w-full max-w-[340px] bg-[#FDFCF9] rounded-2xl p-6 sm:p-7 border border-[#E5D5AE] shadow-[0_24px_50px_rgba(0,0,0,0.07),0_2px_6px_rgba(0,0,0,0.04)] text-center relative overflow-hidden ring-1 ring-black/[0.03] keep-ivory">
                {/* Subtle paper inner highlight */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-transparent to-black/[0.02] pointer-events-none" />

                {/* Clean gold header with subtle rule */}
                <div className="relative z-10">
                  <span className="text-[9.5px] sm:text-[10px] font-bold tracking-[0.22em] text-[#9A7326] uppercase font-sans block">
                    KOINONIA CHILDREN &amp; TEENS
                  </span>
                  <h4 className="font-serif-koinonia text-2xl sm:text-[28px] font-bold text-[#18181B] tracking-tight leading-none mt-2">
                    EVENT PASS
                  </h4>
                  <p className="text-xs font-semibold text-[#52525B] mt-1.5 font-sans tracking-wide">
                    The General Assembly
                  </p>
                  <div className="h-[1px] w-12 bg-[#C59B27]/50 mx-auto mt-3 mb-4" />
                </div>

                {/* Bold, prominent QR visual motif */}
                <div className="relative z-10 my-2 flex flex-col items-center justify-center">
                  <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-xl bg-white border border-[#E8DFC8] flex items-center justify-center p-3.5 text-zinc-900 shadow-[inset_0_1px_3px_rgba(0,0,0,0.03),0_2px_8px_rgba(0,0,0,0.04)]">
                    <QrCode className="w-full h-full stroke-[1.35] text-zinc-850" />
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-10" />
          </motion.div>

          {/* ======================================================================= */}
          {/* PANEL 03: PICKUP (Rich Warm Photographic, Visible Family Photo)          */}
          {/* ======================================================================= */}
          <motion.div
            tabIndex={0}
            onMouseEnter={() => setHoveredIndex(2)}
            onFocus={() => setFocusedIndex(2)}
            onBlur={() => setFocusedIndex(null)}
            initial={shouldReduceMotion ? undefined : { opacity: 0 }}
            whileInView={shouldReduceMotion ? undefined : { opacity: 1 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.65, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative md:col-span-2 lg:col-span-4 bg-[#14120F] text-white p-7 sm:p-9 flex flex-col justify-between overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C59B27] cursor-default"
          >
            {/* Photographic background with directional top-down gradient overlay */}
            <div className="absolute inset-0 z-0 overflow-hidden">
              <img
                src={resolvedPickupImage}
                alt=""
                className="w-full h-full object-cover object-center grayscale-[5%] opacity-90 transition-transform duration-700"
                style={{
                  transform: shouldReduceMotion
                    ? 'none'
                    : `translate3d(${mouseOffset.x * 4}px, ${mouseOffset.y * 4}px, 0) scale(${activeIndex === 2 ? 1.02 : 1})`,
                }}
              />
              {/* Directional gradient: Darker near the top text, translucent through the center and bottom */}
              <div className="absolute inset-0 bg-gradient-to-b from-[#14120F]/90 via-[#14120F]/30 to-transparent pointer-events-none" />
            </div>

            {/* Oversized background step numeral */}
            <span
              aria-hidden="true"
              className="text-8xl sm:text-9xl font-serif-koinonia font-bold text-white/[0.12] absolute -bottom-5 -right-2 select-none pointer-events-none drop-shadow-sm z-10"
            >
              03
            </span>

            {/* Editorial Typography content */}
            <div className="relative z-10">
              <span className="text-[10px] font-bold tracking-widest text-[#C59B27] uppercase font-sans block">
                03 / PICKUP
              </span>
              <h3 className="text-2xl sm:text-3xl font-sans font-bold text-white tracking-tight mt-2">
                Pickup
              </h3>
              <p className="mt-3 text-xs sm:text-sm text-zinc-100 leading-relaxed font-normal max-w-xs drop-shadow-sm">
                Pickup information is checked before departure is recorded.
              </p>
            </div>

            <div className="relative z-10" />
          </motion.div>

        </div>
      </div>
    </section>
  );
};
