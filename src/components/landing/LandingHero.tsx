import React, { useState, useEffect } from 'react';
import { ShieldCheck, ArrowRight, Check, QrCode } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppRoute } from '../../types';
import { AssetImage } from '../common/AssetImage';
import { REAL_ASSETS } from '../../config/assets';

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
      {/* 1. Ambient soft shadow plane */}
      <div
        aria-hidden="true"
        className="absolute inset-4 bg-[#C59B27]/12 blur-2xl rounded-3xl -z-20 transform translate-y-6 pointer-events-none"
      />

      {/* 2. Offset back card plane (Physical thickness / layered edge) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[#ECE5D4] rounded-[22px] -rotate-1.5 translate-x-2.5 translate-y-2.5 border border-[#D9CBAC]/90 -z-10 shadow-sm pointer-events-none transition-transform duration-300"
        style={{
          transform: prefersReducedMotion
            ? 'none'
            : `translate3d(${mouseOffset.x * 2 + 8}px, ${mouseOffset.y * 2 + 8}px, -10px) rotate(-1.5deg)`,
        }}
      />

      {/* 3. Front Physical 3D Pass Card */}
      <motion.div
        animate={prefersReducedMotion ? {} : { y: [0, -5, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          transform: prefersReducedMotion
            ? 'none'
            : `translate3d(${mouseOffset.x * 4}px, ${mouseOffset.y * 4}px, 0) rotateX(${-mouseOffset.y * 5}deg) rotateY(${mouseOffset.x * 7}deg)`,
        }}
        className="bg-[#FCFBF7] rounded-[22px] p-6 sm:p-7 border border-[#E2D4B7] shadow-[0_20px_40px_-12px_rgba(24,24,27,0.16),0_6px_16px_-4px_rgba(197,155,39,0.10)] relative overflow-hidden text-left transition-transform duration-200 ring-1 ring-white/90"
      >
        {/* Subtle paper inner highlight */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/90 via-transparent to-black/[0.015] pointer-events-none rounded-[22px]" />

        {/* Card Header */}
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

        {/* Central QR Graphic Feature */}
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
      className="relative py-10 sm:py-12 lg:py-14 px-6 sm:px-10 lg:px-12 max-w-7xl mx-auto w-full overflow-hidden rounded-[36px] my-4 sm:my-6 border border-[#EAE8E1]/70 shadow-xs"
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
          <div className="w-full h-full bg-gradient-to-br from-[#EAE8E1]/40 via-[#FAF9F6] to-[#EAE8E1]/20" />
        )}

        {/* Layer 2: Warm Off-White Gradient Overlay protecting text readability on left & subtle contrast on right */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#FAF9F6]/98 via-[#FAF9F6]/88 to-[#FAF9F6]/30 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#FAF9F6]/60 via-transparent to-[#FAF9F6]/90 pointer-events-none" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center relative z-10">
        {/* Left-aligned hero text */}
        <div
          className={`lg:col-span-7 text-left max-w-[680px] transition-all duration-1000 ease-out ${
            loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <span className="text-xs font-bold tracking-widest text-[#B89047] uppercase block mb-3 sm:mb-3.5">
            KOINONIA CHILDREN AND TEENS
          </span>

          <h1 className="text-4xl sm:text-[44px] md:text-5xl lg:text-[54px] xl:text-[60px] font-sans font-extrabold text-[#18181B] tracking-[-0.04em] leading-[1.04] sm:leading-[1.02] lg:leading-[0.98] mb-4 sm:mb-5 max-w-[620px]">
            The Children and Teens section starts here
          </h1>

          <p className="text-base sm:text-lg text-[#6B7280] leading-relaxed max-w-xl mb-6 sm:mb-7">
            Parents and guardians can create an account, add each child’s details, follow review updates, and keep event passes ready for the day.
          </p>

          {/* Buttons or Registration Status */}
          {regStatus && !regStatus.parent?.isOpen ? (
            <div className="bg-white/95 border border-[#E7E3D8] rounded-2xl p-6 space-y-4 text-left max-w-xl shadow-xs backdrop-blur-xs mb-4">
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-[#9A7326] uppercase tracking-wider">
                  {regStatus.parent?.state === 'not_open_yet' ? 'Registration opening soon' : 'Registration closed'}
                </div>
                  <h3 className="text-xl sm:text-2xl font-sans font-bold text-[#18181B] leading-snug">
                    {regStatus.parent?.state === 'not_open_yet'
                      ? `Registration for ${regStatus.eventName || currentEvent?.title || 'The General Assembly'} has not started yet.`
                      : `Registration for ${regStatus.eventName || currentEvent?.title || 'The General Assembly'} is now closed.`}
                  </h3>
                <p className="text-sm text-[#52525B] leading-relaxed">
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
                  className="w-full sm:w-56 h-[48px] bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center cursor-pointer"
                >
                  <span>Sign in</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/volunteer/sign-in')}
                  className="w-full sm:w-56 h-[48px] bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] font-semibold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center cursor-pointer"
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
                className="w-full sm:w-60 h-[50px] bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-xl text-sm shadow-sm transition-all inline-flex items-center justify-center space-x-2 cursor-pointer"
              >
                <span>Register your child</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onVolunteerRegisterClick}
                className="w-full sm:w-60 h-[50px] bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] font-semibold rounded-xl text-sm transition-all inline-flex items-center justify-center cursor-pointer"
              >
                <span>Volunteer sign in</span>
              </button>
            </div>
          )}

          {/* Trust note */}
          <div className="pt-0">
            <div className="inline-flex items-center space-x-2.5 bg-white/90 border border-[#EAE8E1] rounded-xl px-3.5 py-2.5 shadow-2xs text-xs text-[#6B7280]">
              <ShieldCheck className="w-4 h-4 text-[#C59B27] shrink-0" />
              <span>Photos, pickup details, passes, entry, and pickup are checked with care.</span>
            </div>
          </div>
        </div>

        {/* Right-side editorial layered image composition (Stitch Reference) */}
        <div className="lg:col-span-5 relative pb-16 lg:pb-14 pt-4 pl-2 sm:pl-6 group/hero">
          {/* Back layer (smaller image layer behind or slightly above) */}
          <div
            className={`absolute -top-4 left-0 sm:left-4 w-56 sm:w-64 h-72 rounded-3xl overflow-hidden shadow-lg border border-[#EAE8E1] z-0 transition-all duration-700 delay-150 ease-out ${
              loaded ? 'opacity-90 translate-y-0 -rotate-3' : 'opacity-0 -translate-y-6 -rotate-6'
            } group-hover/hero:-translate-y-2 group-hover/hero:shadow-2xl`}
          >
            <AssetImage
              src={assets.heroUpper}
              alt="Families arriving at event"
              iconType="users"
              hideText
              className="w-full h-full object-cover"
            />
          </div>

          {/* Main image (large main image with curved/rounded top shape) */}
          <div
            className={`relative z-10 rounded-t-[140px] sm:rounded-t-[180px] rounded-b-3xl overflow-hidden shadow-2xl border border-[#EAE8E1] bg-white aspect-[4/5] max-w-[360px] sm:max-w-[400px] mx-auto lg:ml-auto transition-all duration-700 delay-300 ease-out ${
              loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            } group-hover/hero:scale-[1.02] group-hover/hero:shadow-[0_28px_60px_-12px_rgba(24,24,27,0.22)]`}
          >
            <AssetImage
              src={assets.heroMain}
              alt="Koinonia General Assembly Welcome Reception"
              iconType="sparkles"
              hideText
              className="w-full h-full object-cover object-top"
              loading="eager"
              fetchpriority="high"
            />
          </div>

          {/* Front/right layer (smaller image layer in front/right side) */}
          <div
            className={`absolute -right-2 sm:-right-4 bottom-12 sm:bottom-14 z-20 w-40 sm:w-48 aspect-square rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-white transition-all duration-700 delay-500 ease-out ${
              loaded ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'
            } group-hover/hero:translate-x-2 group-hover/hero:shadow-[0_28px_60px_-12px_rgba(24,24,27,0.24)]`}
          >
            <AssetImage
              src={assets.heroRight}
              alt="Welcoming care team member check-in"
              iconType="heart"
              hideText
              className="w-full h-full object-cover"
            />
          </div>

          {/* Floating pass preview card (subtle scan-to-details animation - overlapping lower-left area of main image) */}
          <div
            className={`absolute left-0 sm:left-0 -bottom-6 sm:-bottom-8 z-30 w-[290px] sm:w-[330px] transition-all duration-700 delay-700 ease-out ${
              loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            } group-hover/hero:-translate-y-2 group-hover/hero:shadow-[0_28px_60px_-12px_rgba(24,24,27,0.2)]`}
          >
            <HeroPassPreview avatarUrl={assets.passAvatar} />
          </div>
        </div>
      </div>
    </section>
  );
};
