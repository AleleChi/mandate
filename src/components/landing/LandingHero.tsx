import React, { useState, useEffect } from 'react';
import { ShieldCheck, ArrowRight, QrCode } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { AppRoute } from '../../types';
import { AssetImage } from '../common/AssetImage';
import { REAL_ASSETS } from '../../config/assets';
import parentHeroImg from '../../assets/images/parent_hero_1783622066454.jpg';

export interface LandingHeroProps {
  loaded: boolean;
  prefersReducedMotion: boolean;
  assets: any;
  regStatus: any;
  currentEvent?: any;
  onParentRegisterClick: () => void;
  onVolunteerRegisterClick: () => void;
  onNavigate: (route: AppRoute) => void;
}

export interface HeroPhotoCardProps {
  src?: string;
  alt?: string;
  prefersReducedMotion?: boolean;
  loaded?: boolean;
}

export const HeroPhotoCard: React.FC<HeroPhotoCardProps> = ({
  src,
  alt = 'Koinonia Children & Teens Event Experience',
  prefersReducedMotion = false,
  loaded = true,
}) => {
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });
  const systemReducedMotion = useReducedMotion();
  const shouldReduceMotion = Boolean(systemReducedMotion || prefersReducedMotion);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (shouldReduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMouseOffset({ x, y });
  };

  const handleMouseLeave = () => {
    setMouseOffset({ x: 0, y: 0 });
  };

  const resolvedSrc = src && src.trim() !== '' ? src : parentHeroImg;

  return (
    <div
      style={{ perspective: '1200px' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative select-none w-full max-w-[360px] sm:max-w-[400px] lg:max-w-[440px] mx-auto lg:ml-auto group/photo py-4 sm:py-6"
    >
      {/* 1. Ambient soft shadow plane & warm atmospheric glow */}
      <div
        aria-hidden="true"
        className="absolute inset-4 sm:inset-6 bg-[#C59B27]/12 dark:bg-black/40 blur-2xl rounded-3xl -z-30 pointer-events-none transform translate-y-6"
      />

      {/* 2. Offset back paper plane (Physical print backing / exhibition depth) */}
      <motion.div
        aria-hidden="true"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 16, rotate: -4 }}
        animate={
          shouldReduceMotion
            ? { opacity: 1 }
            : {
                opacity: 0.9,
                y: [0, -3, 0],
                rotate: -2.5,
              }
        }
        transition={
          shouldReduceMotion
            ? { duration: 0.3 }
            : {
                opacity: { duration: 0.8, delay: 0.15 },
                rotate: { duration: 0.8, delay: 0.15 },
                y: { duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 0.3 },
              }
        }
        style={{
          transform: shouldReduceMotion
            ? 'rotate(-2.5deg)'
            : `translate3d(${mouseOffset.x * 2 + 6}px, ${mouseOffset.y * 2 + 6}px, -12px) rotate(-2.5deg)`,
        }}
        className="absolute inset-0 bg-[#ECE5D4] dark:bg-[#201F1C] rounded-2xl sm:rounded-3xl border border-[#E0D7C3] dark:border-[#2E2D29] -z-20 shadow-sm pointer-events-none transition-transform duration-300"
      />

      {/* 3. Mid abstract paper layer for depth */}
      <motion.div
        aria-hidden="true"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12, rotate: 3 }}
        animate={
          shouldReduceMotion
            ? { opacity: 1 }
            : {
                opacity: 0.75,
                y: [0, -2, 0],
                rotate: 1.5,
              }
        }
        transition={
          shouldReduceMotion
            ? { duration: 0.3 }
            : {
                opacity: { duration: 0.8, delay: 0.25 },
                rotate: { duration: 0.8, delay: 0.25 },
                y: { duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.6 },
              }
        }
        style={{
          transform: shouldReduceMotion
            ? 'rotate(1.5deg)'
            : `translate3d(${mouseOffset.x * 1.5 - 4}px, ${mouseOffset.y * 1.5 - 4}px, -6px) rotate(1.5deg)`,
        }}
        className="absolute inset-0 bg-[#F5F2EA] dark:bg-[#262522] rounded-2xl sm:rounded-3xl border border-[#E8E2D2] dark:border-[#33322D] -z-10 shadow-2xs pointer-events-none transition-transform duration-300"
      />

      {/* 4. Front Editorial Photo Card */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
        animate={
          shouldReduceMotion
            ? { opacity: 1 }
            : {
                opacity: 1,
                y: [0, -4, 0],
              }
        }
        transition={
          shouldReduceMotion
            ? { duration: 0.3 }
            : {
                opacity: { duration: 0.8, delay: 0.2 },
                y: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
              }
        }
        style={{
          transform: shouldReduceMotion
            ? 'none'
            : `translate3d(${mouseOffset.x * 4}px, ${mouseOffset.y * 4}px, 0) rotateX(${-mouseOffset.y * 2}deg) rotateY(${mouseOffset.x * 2.5}deg)`,
        }}
        className="relative z-10 rounded-2xl sm:rounded-3xl overflow-hidden bg-[#FAF9F6] dark:bg-[#1E1E1C] border border-[#E8E4D8] dark:border-[#2E2D29] shadow-[0_20px_50px_-12px_rgba(24,24,27,0.16),0_6px_16px_-4px_rgba(197,155,39,0.06)] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] aspect-[4/5] max-h-[540px] w-full transition-transform duration-200"
      >
        <AssetImage
          src={resolvedSrc}
          alt={alt}
          iconType="sparkles"
          hideText
          className="w-full h-full object-cover object-center"
          loading="eager"
          fetchpriority="high"
        />

        {/* Subtle paper inner highlight and warm edge vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/10 dark:from-white/5 dark:to-black/30 pointer-events-none" />
        <div className="absolute inset-0 ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06] rounded-2xl sm:rounded-3xl pointer-events-none" />
      </motion.div>
    </div>
  );
};

export interface HeroPassPreviewProps {
  className?: string;
  isMobile?: boolean;
  avatarUrl?: string;
}

export const HeroPassPreview: React.FC<HeroPassPreviewProps> = ({
  className = '',
}) => {
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMouseOffset({ x, y });
  };

  const handleMouseLeave = () => {
    setMouseOffset({ x: 0, y: 0 });
  };

  return (
    <div
      style={{ perspective: '1200px' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative select-none ${className}`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-4 bg-[#C59B27]/12 blur-2xl rounded-3xl -z-20 transform translate-y-6 pointer-events-none"
      />

      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[#ECE5D4] rounded-[22px] -rotate-1.5 translate-x-2.5 translate-y-2.5 border border-[#D9CBAC]/90 -z-10 shadow-sm pointer-events-none transition-transform duration-300 keep-ivory"
        style={{
          transform: prefersReducedMotion
            ? 'none'
            : `translate3d(${mouseOffset.x * 2 + 8}px, ${mouseOffset.y * 2 + 8}px, -10px) rotate(-1.5deg)`,
        }}
      />

      <motion.div
        animate={prefersReducedMotion ? {} : { y: [0, -5, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          transform: prefersReducedMotion
            ? 'none'
            : `translate3d(${mouseOffset.x * 4}px, ${mouseOffset.y * 4}px, 0) rotateX(${-mouseOffset.y * 5}deg) rotateY(${mouseOffset.x * 7}deg)`,
        }}
        className="bg-[#FCFBF7] rounded-[22px] p-6 sm:p-7 border border-[#E2D4B7] shadow-[0_20px_40px_-12px_rgba(24,24,27,0.16),0_6px_16px_-4px_rgba(197,155,39,0.10)] relative overflow-hidden text-left transition-transform duration-200 ring-1 ring-white/90 keep-ivory"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/90 via-transparent to-black/[0.015] pointer-events-none rounded-[22px]" />

        <div className="relative z-10">
          <span className="text-[9.5px] sm:text-[10px] font-bold tracking-[0.22em] text-[#9A7326] uppercase font-sans block">
            KOINONIA CHILDREN &amp; TEENS
          </span>

          <h3 className="font-serif-koinonia text-3xl sm:text-[32px] font-bold text-[#18181B] tracking-tight leading-none mt-2">
            EVENT PASS
          </h3>
          <p className="text-xs font-semibold text-[#52525B] mt-1.5 font-sans tracking-wide">
            The General Assembly
          </p>

          <div className="h-[1px] w-12 bg-[#C59B27]/50 mt-3 mb-4" />
        </div>

        <div className="relative z-10 my-1 flex flex-col items-center justify-center">
          <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-xl bg-white border border-[#E8DFC8] flex items-center justify-center p-3.5 text-zinc-900 shadow-[inset_0_1px_3px_rgba(0,0,0,0.03),0_2px_8px_rgba(0,0,0,0.04)] relative overflow-hidden">
            <QrCode className="w-full h-full stroke-[1.35] text-zinc-850" />
            {!prefersReducedMotion && (
              <motion.div
                initial={{ top: '-10%', opacity: 0 }}
                animate={{ top: '110%', opacity: [0, 1, 1, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
                className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C59B27] to-transparent shadow-[0_0_8px_rgba(197,155,39,0.5)] pointer-events-none"
              />
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export const LandingHero: React.FC<LandingHeroProps> = ({
  loaded,
  prefersReducedMotion,
  assets,
  regStatus,
  currentEvent,
  onParentRegisterClick,
  onVolunteerRegisterClick,
  onNavigate,
}) => {
  return (
    <section
      id="about"
      aria-label="Koinonia Children and Teens Introduction"
      className="relative py-10 sm:py-12 lg:py-14 px-6 sm:px-10 lg:px-12 max-w-7xl mx-auto w-full overflow-hidden rounded-[36px] my-4 sm:my-6 border border-[#EAE8E1]/70 dark:border-[#2A2926] bg-[#FAF9F6] dark:bg-[#181817] shadow-xs scroll-mt-24"
    >
      {/* Layer 1: Background Video Atmosphere */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none rounded-[36px]">
        {assets.heroVideo && assets.heroVideo.trim() !== '' && !prefersReducedMotion ? (
          <video
            key={assets.heroVideo}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            poster={assets.heroUpper}
            className="w-full h-full object-cover transition-opacity duration-1000"
            style={{
              opacity: 0.23,
              filter: 'brightness(0.62) contrast(1.08)',
            }}
          >
            <source src={assets.heroVideo} type="video/mp4" />
          </video>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#EAE8E1]/40 via-[#FAF9F6] to-[#EAE8E1]/20 dark:from-[#201F1C] dark:via-[#181817] dark:to-[#201F1C]" />
        )}

        {/* Layer 2: Warm Off-White Gradient Overlay protecting text readability on left & subtle contrast on right */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#FAF9F6]/98 via-[#FAF9F6]/88 to-[#FAF9F6]/30 dark:from-[#181817]/98 dark:via-[#181817]/88 dark:to-[#181817]/30 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#FAF9F6]/60 via-transparent to-[#FAF9F6]/90 dark:from-[#181817]/60 dark:via-transparent dark:to-[#181817]/90 pointer-events-none" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center relative z-10">
        {/* Left-aligned hero text */}
        <div
          className={`lg:col-span-7 text-left max-w-[680px] transition-all duration-1000 ease-out ${
            loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <h1 className="text-4xl sm:text-[44px] md:text-5xl lg:text-[54px] xl:text-[60px] font-sans font-extrabold text-[#18181B] dark:text-[#F7F4ED] tracking-[-0.04em] leading-[1.04] sm:leading-[1.02] lg:leading-[0.98] mb-4 sm:mb-5 max-w-[620px]">
            The Children and Teens section starts here
          </h1>

          <p className="text-base sm:text-lg text-[#6B7280] dark:text-[#C8C2B6] leading-relaxed max-w-xl mb-6 sm:mb-7">
            Parents and guardians can create an account, add each child’s details, follow review updates, and keep event passes ready for the day.
          </p>

          {/* Buttons or Registration Status */}
          {regStatus && !regStatus.parent?.isOpen ? (
            <div className="bg-white/95 dark:bg-[#201F1C]/95 border border-[#E7E3D8] dark:border-[#2E2D29] rounded-2xl p-6 space-y-4 text-left max-w-xl shadow-xs backdrop-blur-xs mb-4">
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-[#9A7326] dark:text-[#D4AF37] uppercase tracking-wider">
                  {regStatus.parent?.state === 'not_open_yet' ? 'Registration opening soon' : 'Registration closed'}
                </div>
                  <h3 className="text-xl sm:text-2xl font-sans font-bold text-[#18181B] dark:text-[#F7F4ED] leading-snug">
                    {regStatus.parent?.state === 'not_open_yet'
                      ? `Registration for ${regStatus.eventName || currentEvent?.title || 'The General Assembly'} has not started yet.`
                      : `Registration for ${regStatus.eventName || currentEvent?.title || 'The General Assembly'} is now closed.`}
                  </h3>
                <p className="text-sm text-[#52525B] dark:text-[#C8C2B6] leading-relaxed">
                  {regStatus.parent?.state === 'not_open_yet'
                    ? regStatus.parent?.opensAtFormatted
                    ? `Registration opens ${regStatus.parent.opensAtFormatted}. If you already have an account, you can still sign in anytime to view your child’s information and updates.`
                    : 'If you already have an account, you can still sign in anytime to view your child’s information and updates.'
                    : 'Existing families can sign in below anytime to view child details and keep event passes ready.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate('/parent/sign-in')}
                  className="w-full sm:w-56 h-[48px] bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-xl text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center justify-center cursor-pointer"
                >
                  <span>Sign in</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/volunteer/sign-in')}
                  className="w-full sm:w-56 h-[48px] bg-white dark:bg-[#201F1C] hover:bg-[#FAF6EB] dark:hover:bg-[#2A2926] text-[#262626] dark:text-[#F7F4ED] border border-[#D9D6CE] dark:border-[#383733] font-semibold rounded-xl text-xs uppercase tracking-wider transition-colors flex items-center justify-center cursor-pointer"
                >
                  <span>Volunteer sign in</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3.5 sm:gap-4 mb-4 sm:mb-5" data-component-version="landing-hero-cta-v2-clean">
              <button
                type="button"
                onClick={onParentRegisterClick}
                className="w-full sm:w-60 h-[50px] bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-xl text-sm shadow-sm transition-colors inline-flex items-center justify-center space-x-2 cursor-pointer"
              >
                <span>Register your child</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onVolunteerRegisterClick}
                className="w-full sm:w-60 h-[50px] bg-white dark:bg-[#201F1C] hover:bg-[#FAF6EB] dark:hover:bg-[#2A2926] text-[#262626] dark:text-[#F7F4ED] border border-[#D9D6CE] dark:border-[#383733] font-semibold rounded-xl text-sm transition-colors inline-flex items-center justify-center cursor-pointer"
              >
                <span>Volunteer sign in</span>
              </button>
            </div>
          )}

          {/* Trust note */}
          <div className="pt-0">
            <div className="inline-flex items-center space-x-2.5 bg-white/90 dark:bg-[#201F1C]/90 border border-[#EAE8E1] dark:border-[#2E2D29] rounded-xl px-3.5 py-2.5 shadow-2xs text-xs text-[#6B7280] dark:text-[#C8C2B6]">
              <ShieldCheck className="w-4 h-4 text-[#C59B27] shrink-0" />
              <span>Photos, pickup details, passes, entry, and pickup are checked with care.</span>
            </div>
          </div>
        </div>

        {/* Right-side photographic composition (Real Koinonia Photo Card) */}
        <div className="lg:col-span-5 relative flex items-center justify-center lg:justify-end py-2 sm:py-4">
          <HeroPhotoCard
            src={assets.heroMain}
            alt="Koinonia Children & Teens Event Experience"
            prefersReducedMotion={prefersReducedMotion}
            loaded={loaded}
          />
        </div>
      </div>
    </section>
  );
};
