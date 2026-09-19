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
  avatarUrl,
}) => {
  const [phase, setPhase] = useState<'pass' | 'scanning' | 'details'>('pass');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setPhase('pass');
      return;
    }

    let timer: NodeJS.Timeout;

    const runLoop = () => {
      setPhase('pass');
      timer = setTimeout(() => {
        setPhase('scanning');
        timer = setTimeout(() => {
          setPhase('details');
          timer = setTimeout(() => {
            runLoop();
          }, 3500);
        }, 1500);
      }, 3000);
    };

    runLoop();

    return () => clearTimeout(timer);
  }, [prefersReducedMotion]);

  return (
    <motion.div
      layout={!prefersReducedMotion}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] as const }}
      className={`bg-[#FAF8F3] rounded-3xl p-5 sm:p-6 shadow-[0_16px_40px_-12px_rgba(24,24,27,0.14)] border border-[#E5D5AE]/80 overflow-hidden text-left relative ${className}`}
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]/80 mb-4">
        <span className="text-[10px] sm:text-[11px] font-bold tracking-widest text-[#9A7326] uppercase font-sans">
          Koinonia Children and Teens
        </span>
        <span className="text-[10px] sm:text-[11px] font-semibold text-[#6B7280] tracking-wide">
          {phase === 'details' ? 'Child details' : 'Event pass'}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'details' ? (
          <motion.div
            key="details"
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -5 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] as const }}
            className="space-y-4"
          >
            {/* Child Header */}
            <div className="flex items-center space-x-3.5">
              <AssetImage
                src={avatarUrl || REAL_ASSETS.passAvatar}
                alt="Mary Omikunle"
                iconType="users"
                className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl object-cover border border-[#EAE8E1] shrink-0 shadow-2xs"
              />
              <div>
                <h4 className="text-base sm:text-lg font-bold text-[#18181B] font-serif-koinonia leading-tight">
                  Mary Omikunle
                </h4>
                <p className="text-xs text-[#6B7280] font-medium mt-0.5">7 years • Ages 7 to 9</p>
              </div>
            </div>

            {/* Verification & Pickup Details */}
            <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-[#EAE8E1] space-y-2 text-xs sm:text-[13px] shadow-2xs">
              <div className="flex justify-between items-center">
                <span className="text-[#6B7280]">Parent</span>
                <span className="font-bold text-[#18181B]">Sarah Omikunle</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#6B7280]">Pickup person</span>
                <span className="font-bold text-[#18181B]">Sarah Omikunle</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-[#FAF9F6]">
                <span className="text-[#6B7280]">Entry check</span>
                <span className="font-bold text-[#9A7326] flex items-center space-x-1.5 bg-[#FAF6EB] px-2.5 py-0.5 rounded-full border border-[#E5D5AE]">
                  <Check className="w-3.5 h-3.5 text-[#C59B27]" />
                  <span>Ready</span>
                </span>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="pass"
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 5 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] as const }}
            className="space-y-4"
          >
            {/* Child Profile Info */}
            <div className="flex items-center space-x-3.5">
              <AssetImage
                src={avatarUrl || REAL_ASSETS.passAvatar}
                alt="Mary Omikunle"
                iconType="users"
                className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl object-cover border border-[#EAE8E1] shrink-0 shadow-2xs"
              />
              <div className="flex-1">
                <h4 className="text-base sm:text-lg font-bold text-[#18181B] font-serif-koinonia leading-tight">
                  Mary Omikunle
                </h4>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-xs text-[#6B7280] font-medium">7 years</span>
                  <span className="text-[10px] text-[#D9D6CE]">•</span>
                  <span className="text-xs text-[#6B7280] font-medium">Ages 7 to 9</span>
                </div>
              </div>
            </div>

            {/* Status & QR Block */}
            <div className="bg-white rounded-2xl p-4 border border-[#EAE8E1] shadow-2xs flex items-center justify-between relative overflow-hidden">
              <div className="space-y-1">
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] text-[11px] font-bold">
                  Pass ready
                </span>
                <p className="text-xs font-bold text-[#18181B] font-serif-koinonia pt-1">Event pass</p>
                <p className="text-[11px] text-[#6B7280] font-medium">Show at entry</p>
              </div>

              <div className="w-14 h-14 rounded-xl bg-[#FAF9F6] border border-[#EAE8E1] flex items-center justify-center relative shrink-0">
                <QrCode className="w-9 h-9 text-[#262626]" />
                {phase === 'scanning' && !prefersReducedMotion && (
                  <motion.div
                    initial={{ top: '-10%', opacity: 0 }}
                    animate={{ top: '110%', opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.4, ease: 'easeInOut' }}
                    className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C59B27] to-transparent shadow-[0_0_8px_rgba(197,155,39,0.45)] pointer-events-none"
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
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
      className="relative py-16 sm:py-24 px-6 sm:px-10 lg:px-12 max-w-7xl mx-auto w-full overflow-hidden rounded-[36px] my-6 border border-[#EAE8E1]/70 shadow-xs"
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center relative z-10">
        {/* Left-aligned hero text */}
        <div
          className={`lg:col-span-6 space-y-6 text-left transition-all duration-1000 ease-out ${
            loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <span className="text-xs font-bold tracking-widest text-[#B89047] uppercase block">
            KOINONIA CHILDREN AND TEENS
          </span>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif-koinonia font-bold text-[#18181B] tracking-tight leading-[1.12]">
            The Children and Teens section starts here
          </h1>

          <p className="text-base sm:text-lg text-[#6B7280] leading-relaxed max-w-xl">
            Parents and guardians can create an account, add each child’s details, follow review updates, and keep event passes ready for the day.
          </p>

          {/* Buttons or Registration Status */}
          {regStatus && !regStatus.parent?.isOpen ? (
            <div className="bg-white/95 border border-[#E7E3D8] rounded-2xl p-6 space-y-4 text-left max-w-xl shadow-xs backdrop-blur-xs">
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-[#9A7326] uppercase tracking-wider">
                  {regStatus.parent?.state === 'not_open_yet' ? 'Registration opening soon' : 'Registration closed'}
                </div>
                  <h3 className="text-xl sm:text-2xl font-serif-koinonia font-bold text-[#18181B] leading-snug">
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
            <div className="flex flex-wrap items-center gap-4 pt-2" data-component-version="landing-hero-cta-v2-clean">
              <button
                type="button"
                onClick={onParentRegisterClick}
                className="w-full sm:w-64 h-[52px] bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-xl text-sm shadow-sm transition-all inline-flex items-center justify-center space-x-2 cursor-pointer"
              >
                <span>Register your child</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onVolunteerRegisterClick}
                className="w-full sm:w-64 h-[52px] bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] font-semibold rounded-xl text-sm transition-all inline-flex items-center justify-center cursor-pointer"
              >
                <span>Volunteer sign in</span>
              </button>
            </div>
          )}

          {/* Trust note */}
          <div className="pt-4">
            <div className="inline-flex items-center space-x-3 bg-white border border-[#EAE8E1] rounded-xl px-4 py-3 shadow-2xs text-xs text-[#6B7280]">
              <ShieldCheck className="w-4 h-4 text-[#C59B27] shrink-0" />
              <span>Photos, pickup details, passes, entry, and pickup are checked with care.</span>
            </div>
          </div>
        </div>

        {/* Right-side editorial layered image composition (Stitch Reference) */}
        <div className="lg:col-span-6 relative pb-20 lg:pb-16 pt-6 pl-4 sm:pl-10 group/hero">
          {/* Back layer (smaller image layer behind or slightly above) */}
          <div
            className={`absolute -top-4 left-0 sm:left-6 w-60 sm:w-72 h-80 rounded-3xl overflow-hidden shadow-lg border border-[#EAE8E1] z-0 transition-all duration-700 delay-150 ease-out ${
              loaded ? 'opacity-90 translate-y-0 -rotate-3' : 'opacity-0 -translate-y-6 -rotate-6'
            } group-hover/hero:-translate-y-2 group-hover/hero:shadow-2xl`}
          >
            <AssetImage
              src={assets.heroUpper}
              alt="Families arriving at event"
              iconType="users"
              label="Back Layer Visual"
              className="w-full h-full object-cover"
            />
          </div>

          {/* Main image (large main image with curved/rounded top shape) */}
          <div
            className={`relative z-10 rounded-t-[140px] sm:rounded-t-[180px] rounded-b-3xl overflow-hidden shadow-2xl border border-[#EAE8E1] bg-white aspect-[4/5] max-w-md mx-auto lg:ml-auto transition-all duration-700 delay-300 ease-out ${
              loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            } group-hover/hero:scale-[1.02] group-hover/hero:shadow-[0_28px_60px_-12px_rgba(24,24,27,0.22)]`}
          >
            <AssetImage
              src={assets.heroMain}
              alt="Koinonia General Assembly Welcome Reception"
              iconType="sparkles"
              label="Main Hero Gathering"
              className="w-full h-full object-cover object-top"
              loading="eager"
              fetchpriority="high"
            />
          </div>

          {/* Front/right layer (smaller image layer in front/right side) */}
          <div
            className={`absolute -right-2 sm:-right-6 bottom-12 sm:bottom-16 z-20 w-44 sm:w-52 aspect-square rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-white transition-all duration-700 delay-500 ease-out ${
              loaded ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'
            } group-hover/hero:translate-x-2 group-hover/hero:shadow-[0_28px_60px_-12px_rgba(24,24,27,0.24)]`}
          >
            <AssetImage
              src={assets.heroRight}
              alt="Welcoming care team member check-in"
              iconType="heart"
              label="Front Right Layer"
              className="w-full h-full object-cover"
            />
          </div>

          {/* Floating pass preview card (subtle scan-to-details animation - overlapping lower-left area of main image) */}
          <div
            className={`absolute left-0 sm:left-2 -bottom-8 sm:-bottom-10 z-30 w-[300px] sm:w-[350px] transition-all duration-700 delay-700 ease-out ${
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
