import React, { useState, useEffect } from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { AppRoute } from '../../types';
import parentHeroImg from '../../assets/images/parent_hero_1783622066454.jpg';
import volunteerHeroImg from '../../assets/images/volunteer_hero_1783622081200.jpg';
import { resolveMediaUrl } from '../../utils/mediaUrl';

import {
  CANONICAL_REGISTRATION_DEADLINE,
  calculateRegistrationCountdown,
} from '../../utils/countdown';

export {
  CANONICAL_REGISTRATION_DEADLINE,
  calculateRegistrationCountdown,
};

const DEFAULT_DEADLINE_SHORT_LABEL = '17 OCT · 11:59 PM';
const DEFAULT_DEADLINE_FULL_LABEL = '17 October 2026 · 11:59 PM';

function resolveHeroImageSource(src?: string, fallbackSrc: string = parentHeroImg): string {
  const effective = src && src.trim() !== '' ? src : fallbackSrc;
  // Vite-imported bundled asset URLs (e.g. /assets/parent_hero_xxx.jpg) must never be
  // passed through resolveMediaUrl — they are already fully resolved by the module bundler.
  if (effective.startsWith('/assets/') || effective.startsWith('data:') || effective.startsWith('blob:')) {
    return effective;
  }
  return resolveMediaUrl(effective);
}

function formatRegistrationDeadline(deadlineIso: string, includeYear = false): string {
  const date = new Date(deadlineIso);
  if (Number.isNaN(date.getTime())) {
    return includeYear ? DEFAULT_DEADLINE_FULL_LABEL : DEFAULT_DEADLINE_SHORT_LABEL;
  }

  const dateLabel = includeYear
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Africa/Lagos',
      }).format(date)
    : new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Africa/Lagos',
      }).format(date).replace('.', '').toUpperCase();
  const timeLabel = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Lagos',
  }).format(date);

  return `${dateLabel} · ${timeLabel}`;
}

export interface LandingHeroProps {
  loaded: boolean;
  prefersReducedMotion: boolean;
  assets: any;
  regStatus: any;
  currentEvent?: any;
  landingSettings?: Record<string, string>;
  onParentRegisterClick: () => void;
  onVolunteerRegisterClick: () => void;
  onNavigate: (route: AppRoute) => void;
}

export const HeroEventImage: React.FC<{
  src: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  priority?: boolean;
}> = ({ src, fallbackSrc = parentHeroImg, alt, className = '', priority = false }) => {
  const [currentSrc, setCurrentSrc] = useState(resolveHeroImageSource(src, fallbackSrc));
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    setCurrentSrc(resolveHeroImageSource(src, fallbackSrc));
    setHasFailed(false);
  }, [src, fallbackSrc]);

  const handleError = () => {
    const resolvedFallback = resolveHeroImageSource(fallbackSrc, parentHeroImg);
    if (!hasFailed && currentSrc !== resolvedFallback) {
      setHasFailed(true);
      setCurrentSrc(resolvedFallback);
    }
  };

  return (
    <img
      src={currentSrc}
      alt={alt}
      onError={handleError}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      className={`object-cover object-center ${className}`}
    />
  );
};

export interface HeroPhotoCompositionProps {
  photos: string[];
  featureImage?: string;
  prefersReducedMotion?: boolean;
  loaded?: boolean;
}

export const HeroPhotoComposition: React.FC<HeroPhotoCompositionProps> = ({
  photos,
  featureImage,
  prefersReducedMotion = false,
  loaded = true,
}) => {
  const systemReducedMotion = useReducedMotion();
  const shouldReduceMotion = Boolean(systemReducedMotion || prefersReducedMotion);
  const uniquePhotos = photos.filter((photo, index, list) => photo && list.indexOf(photo) === index);
  const mainPhoto = uniquePhotos[0] || parentHeroImg;
  const upperPhoto = uniquePhotos.find((photo) => photo !== mainPhoto) || volunteerHeroImg;
  const rightPhoto = uniquePhotos.find((photo) => photo !== mainPhoto && photo !== upperPhoto) || '/social_share.jpg';
  const featurePhoto = featureImage || uniquePhotos.find((photo) => photo !== mainPhoto && photo !== upperPhoto && photo !== rightPhoto) || volunteerHeroImg;

  return (
    <div
      className="relative w-full max-w-[420px] min-h-[440px] sm:min-h-[510px] lg:min-h-[540px] mx-auto lg:ml-auto pb-20 sm:pb-24 pt-7 sm:pt-8 pl-2 sm:pl-6 group/hero select-none"
      data-component-version="landing-hero-layered-photo-composition-v6"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-8 top-12 bottom-20 bg-[#C59B27]/12 dark:bg-black/35 blur-2xl rounded-3xl -z-10 pointer-events-none"
      />

      {/* Back image layer restored from the accepted editorial composition. */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: -16, rotate: -6 }}
        animate={
          shouldReduceMotion
            ? { opacity: 0.92, rotate: -3 }
            : {
                opacity: loaded ? 0.92 : 0,
                y: loaded ? 0 : -16,
                rotate: loaded ? -3 : -6,
              }
        }
        transition={{ duration: 0.65, delay: 0.1, ease: [0.16, 1, 0.3, 1] as const }}
        className="absolute -top-1 left-0 sm:left-4 z-0 h-60 w-[56%] max-w-[260px] overflow-hidden rounded-3xl border border-[#EAE8E1] dark:border-[#2E2D29] bg-white dark:bg-[#201F1C] shadow-lg transition-transform duration-500 group-hover/hero:-translate-y-2 group-hover/hero:shadow-2xl"
      >
        <HeroEventImage
          src={upperPhoto}
          fallbackSrc={volunteerHeroImg}
          alt="Families arriving at The General Assembly Children and Teens session"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/15 pointer-events-none" />
      </motion.div>

      {/* Main curved image layer. */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 22 }}
        animate={
          shouldReduceMotion
            ? { opacity: 1 }
            : {
                opacity: loaded ? 1 : 0,
                y: loaded ? 0 : 22,
              }
        }
        transition={{ duration: 0.7, delay: 0.22, ease: [0.16, 1, 0.3, 1] as const }}
        className="relative z-10 mx-auto aspect-[4/5] w-[78%] max-w-[370px] overflow-hidden rounded-t-[140px] rounded-b-3xl border border-[#EAE8E1] dark:border-[#2E2D29] bg-white dark:bg-[#201F1C] shadow-2xl transition-transform duration-500 group-hover/hero:scale-[1.018] group-hover/hero:shadow-[0_28px_60px_-12px_rgba(24,24,27,0.22)] sm:rounded-t-[180px] lg:ml-auto"
      >
        <HeroEventImage
          src={mainPhoto}
          fallbackSrc={parentHeroImg}
          alt="Koinonia General Assembly Children and Teens welcome moment"
          priority
          className="w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/18 pointer-events-none" />
      </motion.div>

      {/* Front/right image layer. */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: 0.96 }}
        animate={
          shouldReduceMotion
            ? { opacity: 1, scale: 1 }
            : {
                opacity: loaded ? 1 : 0,
                y: loaded ? 0 : 18,
                scale: loaded ? 1 : 0.96,
              }
        }
        transition={{ duration: 0.65, delay: 0.34, ease: [0.16, 1, 0.3, 1] as const }}
        className="absolute right-0 bottom-24 z-20 aspect-square w-[38%] max-w-[176px] overflow-hidden rounded-2xl border-4 border-white bg-white shadow-2xl transition-transform duration-500 group-hover/hero:translate-x-1.5 dark:border-[#262522] dark:bg-[#201F1C] sm:bottom-28 sm:max-w-[190px]"
      >
        <HeroEventImage
          src={rightPhoto}
          fallbackSrc="/social_share.jpg"
          alt="Care team welcoming children and teens"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/15 pointer-events-none" />
      </motion.div>

      {/* Replaceable feature image surface for the supporting editorial layer. */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
        animate={
          shouldReduceMotion
            ? { opacity: 1 }
            : {
                opacity: loaded ? 1 : 0,
                y: loaded ? 0 : 18,
              }
        }
        transition={{ duration: 0.65, delay: 0.46, ease: [0.16, 1, 0.3, 1] as const }}
        className="absolute bottom-2 left-1 z-30 aspect-[4/5] w-[40%] max-w-[168px] overflow-hidden rounded-[26px] border-[5px] border-[#FAF9F6] bg-white shadow-[0_22px_48px_-18px_rgba(24,24,27,0.34)] ring-1 ring-[#EAE1D0]/70 transition-transform duration-500 group-hover/hero:-translate-y-1.5 dark:border-[#181817] dark:bg-[#201F1C] dark:ring-[#34312A] sm:bottom-1 sm:left-2 sm:max-w-[184px] lg:max-w-[194px]"
      >
        <HeroEventImage
          src={featurePhoto}
          fallbackSrc={volunteerHeroImg}
          alt="Featured General Assembly children and teens moment"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/20 pointer-events-none" />
      </motion.div>
    </div>
  );
};

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
  return (
    <HeroPhotoComposition
      photos={[src || parentHeroImg, volunteerHeroImg, '/social_share.jpg']}
      featureImage={volunteerHeroImg}
      prefersReducedMotion={prefersReducedMotion}
      loaded={loaded}
    />
  );
};

export const LandingHero: React.FC<LandingHeroProps> = ({
  loaded,
  prefersReducedMotion,
  assets,
  regStatus,
  currentEvent,
  landingSettings,
  onParentRegisterClick,
  onVolunteerRegisterClick,
  onNavigate,
}) => {
  const deadlineIso =
    currentEvent?.parent_access_closes_at ||
    regStatus?.parent?.closesAt ||
    CANONICAL_REGISTRATION_DEADLINE;

  const [countdown, setCountdown] = useState(() => calculateRegistrationCountdown(deadlineIso));

  useEffect(() => {
    setCountdown(calculateRegistrationCountdown(deadlineIso));
    const interval = setInterval(() => {
      setCountdown(calculateRegistrationCountdown(deadlineIso));
    }, 1000);
    return () => clearInterval(interval);
  }, [deadlineIso]);

  const isRegistrationClosed = countdown.isClosed || regStatus?.parent?.state === 'closed';

  const isParentEnabled =
    currentEvent?.parent_registration_enabled !== undefined
      ? (currentEvent.parent_registration_enabled === true || currentEvent.parent_registration_enabled === 1 || currentEvent.parent_registration_enabled === 'true')
      : landingSettings?.parent_registration_enabled !== undefined
      ? landingSettings.parent_registration_enabled !== 'false'
      : regStatus?.parent?.enabled !== undefined
      ? Boolean(regStatus.parent.enabled)
      : true;

  const isVolunteerEnabled =
    currentEvent?.volunteer_registration_enabled !== undefined
      ? (currentEvent.volunteer_registration_enabled === true || currentEvent.volunteer_registration_enabled === 1 || currentEvent.volunteer_registration_enabled === 'true')
      : landingSettings?.volunteer_registration_enabled !== undefined
      ? landingSettings.volunteer_registration_enabled !== 'false'
      : regStatus?.volunteer?.enabled !== undefined
      ? Boolean(regStatus.volunteer.enabled)
      : true;

  const showCtaRow = isParentEnabled || isVolunteerEnabled;
  const deadlineShortLabel = formatRegistrationDeadline(deadlineIso);
  const deadlineFullLabel = formatRegistrationDeadline(deadlineIso, true);

  const minAge = currentEvent?.minimum_age !== undefined && currentEvent?.minimum_age !== null ? currentEvent.minimum_age : 2;
  const maxAge = currentEvent?.maximum_age !== undefined && currentEvent?.maximum_age !== null ? currentEvent.maximum_age : 14;
  const eventTitle = currentEvent?.title || 'The General Assembly';
  const eventDateLabel = React.useMemo(() => {
    const raw = currentEvent?.starts_at;
    if (!raw) return '21 November 2026';
    const match = String(raw).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      const d = new Date(Date.UTC(year, month - 1, day));
      return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
    }
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '21 November 2026';
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  }, [currentEvent?.starts_at]);

  const highlightPhotos = React.useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();

    const add = (img?: string) => {
      if (img && typeof img === 'string' && img.trim() !== '' && !seen.has(img) && list.length < 5) {
        seen.add(img);
        list.push(img);
      }
    };

    // 1. Existing backend/gallery media
    if (Array.isArray(assets?.galleryItems)) {
      assets.galleryItems.forEach((img: any) => {
        if (typeof img === 'string') add(img);
      });
    }
    if (assets?.gallery) {
      Object.values(assets.gallery).forEach((val: any) => {
        if (typeof val === 'string') add(val);
      });
    }
    return list;
  }, [assets]);

  const heroPhotos = React.useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();

    const add = (img?: string) => {
      if (img && typeof img === 'string' && img.trim() !== '' && !seen.has(img) && list.length < 5) {
        seen.add(img);
        list.push(img);
      }
    };

    highlightPhotos.forEach(add);

    // 2. Configured landing media (from DB/API — may be hashed Cloudinary URLs or public paths)
    if (assets?.heroMain && !String(assets.heroMain).match(/^parent_hero_\d+\.jpg$|^volunteer_hero_\d+\.jpg$/)) {
      add(assets.heroMain);
    }
    if (assets?.heroUpper) add(assets.heroUpper);
    if (assets?.heroRight) add(assets.heroRight);
    if (assets?.safetySection) add(assets.safetySection);

    // 3. Bundled static fallbacks — always append so the composition always has images.
    //    These are Vite-resolved /assets/... paths that are guaranteed to exist.
    add(parentHeroImg);
    add(volunteerHeroImg);
    add('/social_share.jpg');

    return list;
  }, [assets, highlightPhotos]);

  const heroFeatureImage = React.useMemo(() => {
    if (assets?.heroFeatureImage && typeof assets.heroFeatureImage === 'string' && assets.heroFeatureImage.trim() !== '') {
      return assets.heroFeatureImage;
    }
    // Use a gallery highlight that isn't already used in the main photo slots, or fall back
    // to the Vite-bundled volunteer hero image which is always reliably available.
    return highlightPhotos.find((img) => !heroPhotos.slice(0, 3).includes(img)) || volunteerHeroImg;
  }, [assets?.heroFeatureImage, heroPhotos, highlightPhotos]);

  // Unified CTA & supporting thumbnails action cluster
  const renderActionCluster = () => {
    const hasHighlightContent = highlightPhotos.length > 0;
    if (!showCtaRow && !hasHighlightContent) return null;

    const parentBtn = isParentEnabled && (
      isRegistrationClosed ? (
        <button
          type="button"
          onClick={() => onNavigate('/parent/sign-in')}
          className="w-full sm:w-auto sm:min-w-[190px] h-[46px] px-6 bg-[#C59B27] hover:bg-[#B89047] active:bg-[#AA8220] text-white font-semibold rounded-xl text-sm shadow-xs transition-colors inline-flex items-center justify-center space-x-2 cursor-pointer shrink-0"
        >
          <span>Sign in to your account</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onParentRegisterClick}
          className="w-full sm:w-auto sm:min-w-[190px] h-[46px] px-6 bg-[#C59B27] hover:bg-[#B89047] active:bg-[#AA8220] text-white font-semibold rounded-xl text-sm shadow-xs transition-colors inline-flex items-center justify-center space-x-2 cursor-pointer shrink-0"
        >
          <span>Register your child</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      )
    );

    const volunteerBtn = isVolunteerEnabled && (
      <button
        type="button"
        onClick={onVolunteerRegisterClick}
        className="w-full sm:w-auto sm:min-w-[170px] h-[46px] px-6 bg-white dark:bg-[#201F1C] hover:bg-[#FAF6EB] dark:hover:bg-[#2A2926] text-[#262626] dark:text-[#F7F4ED] border border-[#D9D6CE] dark:border-[#383733] font-semibold rounded-xl text-sm transition-colors inline-flex items-center justify-center cursor-pointer shrink-0"
      >
        <span>Volunteer sign in</span>
      </button>
    );

    const handleHighlightsClick = () => {
      const momentsEl = document.getElementById('moments');
      if (momentsEl) {
        momentsEl.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      const videoEl = document.getElementById('video');
      if (videoEl) {
        videoEl.scrollIntoView({ behavior: 'smooth' });
      }
    };

    const supportingStrip = hasHighlightContent && (
      <button
        type="button"
        onClick={handleHighlightsClick}
        aria-label="View General Assembly Children and Teens highlights"
        className="group inline-flex items-center gap-2.5 sm:gap-3 text-left py-1.5 px-2 -ml-2 rounded-lg hover:bg-[#FAF0D7]/40 dark:hover:bg-[#2A261D]/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C59B27] cursor-pointer max-w-full"
      >
        {/* Thumbnails cluster - fixed/flex-none */}
        <div className="flex-none flex -space-x-2 sm:-space-x-2.5 overflow-hidden py-0.5 transition-transform group-hover:scale-[1.02]">
          {highlightPhotos.slice(0, 3).map((src, i) => (
            <HeroEventImage
              key={i}
              src={src}
              fallbackSrc={parentHeroImg}
              alt={`General Assembly highlight thumbnail ${i + 1}`}
              className="inline-block h-6 w-6 sm:h-7 sm:w-7 md:h-7 md:w-7 rounded-full ring-2 ring-white dark:ring-[#1E1E1C] object-cover object-center shadow-2xs flex-none"
            />
          ))}
        </div>

        {/* Text area - min-w-0 / flexible */}
        <div className="flex-1 min-w-0 py-0.5">
          <p className="text-[11px] sm:text-xs md:text-[13px] font-semibold tracking-normal text-[#715D3A] dark:text-[#C5BAA8] group-hover:text-[#524124] dark:group-hover:text-[#E2D8C3] font-sans transition-colors leading-snug whitespace-nowrap">
            View highlights
          </p>
        </div>

        {/* Arrow - flex-none */}
        <ChevronRight
          className="flex-none w-4 h-4 text-[#715D3A]/70 dark:text-[#C5BAA8]/70 group-hover:text-[#524124] dark:group-hover:text-[#E2D8C3] group-hover:translate-x-0.5 transition-all"
          aria-hidden="true"
        />
      </button>
    );

    return (
      <div className="space-y-3.5 mb-6" data-component-version="landing-hero-action-cluster-v4">
        {showCtaRow && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {parentBtn}
            {volunteerBtn}
          </div>
        )}
        {supportingStrip}
      </div>
    );
  };

  // Restrained premium event-status panel (printed invitation / editorial credential style)
  const renderCountdownModule = () => {
    if (isRegistrationClosed) {
      return (
        <div
          aria-label="Registration countdown"
          className="max-w-[520px] border-y border-[#D8CFBB] dark:border-[#343029] py-3.5 sm:py-4"
          data-component-version="landing-countdown-status-strip-v6"
        >
          <div className="flex flex-col gap-1">
            <span className="text-[10px] sm:text-[10.5px] font-semibold tracking-normal uppercase text-[#6B665E] dark:text-[#A8A398] font-sans">
              REGISTRATION CLOSED
            </span>
            <span className="text-xs sm:text-[13px] text-[#71717A] dark:text-[#A19D95] font-normal font-sans">
              Closed {deadlineFullLabel}
            </span>
          </div>
        </div>
      );
    }

    const formattedDays = String(countdown.days).padStart(2, '0');
    const formattedHours = String(countdown.hours).padStart(2, '0');
    const formattedMinutes = String(countdown.minutes).padStart(2, '0');

    return (
      <div
        aria-label="Registration countdown"
        className="max-w-[520px] border-y border-[#D8CFBB] dark:border-[#343029] py-3.5 sm:py-4"
        data-component-version="landing-countdown-status-strip-v6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4 pb-3 mb-3 border-b border-[#E6DECE] dark:border-[#2C2924]">
          <span className="text-[10px] sm:text-[10.5px] font-semibold tracking-normal uppercase text-[#8C6D23] dark:text-[#D4AF37] font-sans">
            REGISTRATION OPEN
          </span>
          <span className="text-[10px] sm:text-[10.5px] font-semibold tracking-normal uppercase text-[#6B665E] dark:text-[#A8A398] font-sans sm:text-right">
            CLOSES {deadlineShortLabel}
          </span>
        </div>

        <div className="grid grid-cols-3 divide-x divide-[#E0D7C6] dark:divide-[#2C2924] text-center">
          {/* DAYS */}
          <div className="flex flex-col items-center px-2 sm:px-4">
            <div className="h-9 sm:h-10 flex items-center justify-center">
              {prefersReducedMotion ? (
                <span className="text-[28px] sm:text-[34px] font-semibold font-sans text-[#1C1A16] dark:text-[#F4EFE6] tracking-normal tabular-nums leading-none">
                  {formattedDays}
                </span>
              ) : (
                <motion.span
                  key={formattedDays}
                  initial={{ opacity: 0.6, y: 1 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="text-[28px] sm:text-[34px] font-semibold font-sans text-[#1C1A16] dark:text-[#F4EFE6] tracking-normal tabular-nums leading-none inline-block"
                >
                  {formattedDays}
                </motion.span>
              )}
            </div>
            <span className="text-[9px] sm:text-[9.5px] font-medium tracking-normal text-[#7E786D] dark:text-[#9E988D] uppercase mt-1 font-sans">
              DAYS
            </span>
          </div>

          {/* HOURS */}
          <div className="flex flex-col items-center px-2 sm:px-4">
            <div className="h-9 sm:h-10 flex items-center justify-center">
              {prefersReducedMotion ? (
                <span className="text-[28px] sm:text-[34px] font-semibold font-sans text-[#1C1A16] dark:text-[#F4EFE6] tracking-normal tabular-nums leading-none">
                  {formattedHours}
                </span>
              ) : (
                <motion.span
                  key={formattedHours}
                  initial={{ opacity: 0.6, y: 1 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="text-[28px] sm:text-[34px] font-semibold font-sans text-[#1C1A16] dark:text-[#F4EFE6] tracking-normal tabular-nums leading-none inline-block"
                >
                  {formattedHours}
                </motion.span>
              )}
            </div>
            <span className="text-[9px] sm:text-[9.5px] font-medium tracking-normal text-[#7E786D] dark:text-[#9E988D] uppercase mt-1 font-sans">
              HOURS
            </span>
          </div>

          {/* MINUTES */}
          <div className="flex flex-col items-center px-2 sm:px-4">
            <div className="h-9 sm:h-10 flex items-center justify-center">
              {prefersReducedMotion ? (
                <span className="text-[28px] sm:text-[34px] font-semibold font-sans text-[#1C1A16] dark:text-[#F4EFE6] tracking-normal tabular-nums leading-none">
                  {formattedMinutes}
                </span>
              ) : (
                <motion.span
                  key={formattedMinutes}
                  initial={{ opacity: 0.6, y: 1 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="text-[28px] sm:text-[34px] font-semibold font-sans text-[#1C1A16] dark:text-[#F4EFE6] tracking-normal tabular-nums leading-none inline-block"
                >
                  {formattedMinutes}
                </motion.span>
              )}
            </div>
            <span className="text-[9px] sm:text-[9.5px] font-medium tracking-normal text-[#7E786D] dark:text-[#9E988D] uppercase mt-1 font-sans">
              MINUTES
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      id="about"
      aria-label="Koinonia Children and Teens Introduction"
      className="relative py-8 sm:py-10 lg:py-12 px-4 sm:px-8 lg:px-10 max-w-7xl mx-auto w-full overflow-hidden rounded-[24px] sm:rounded-[32px] my-2 sm:my-4 border border-[#EAE8E1]/70 dark:border-[#2A2926] bg-[#FAF9F6] dark:bg-[#181817] shadow-xs scroll-mt-24"
    >
      {/* Background Video Atmosphere */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none rounded-[24px] sm:rounded-[32px]">
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

        <div className="absolute inset-0 bg-gradient-to-r from-[#FAF9F6]/98 via-[#FAF9F6]/88 to-[#FAF9F6]/30 dark:from-[#181817]/98 dark:via-[#181817]/88 dark:to-[#181817]/30 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#FAF9F6]/60 via-transparent to-[#FAF9F6]/90 dark:from-[#181817]/60 dark:via-transparent dark:to-[#181817]/90 pointer-events-none" />
      </div>

      {/* Balanced 2-column Grid Composition */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)] gap-7 sm:gap-8 lg:gap-8 xl:gap-10 items-center relative z-10 max-w-[1160px] mx-auto">
        {/* Left Column */}
        <div
          className={`w-full max-w-[590px] xl:max-w-[610px] text-left transition-all duration-1000 ease-out ${
            loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {/* Eyebrow */}
          <div className="text-[10.5px] sm:text-xs font-bold tracking-normal uppercase text-[#9A7326] dark:text-[#D4AF37] font-sans mb-2 sm:mb-2.5">
            THE GENERAL ASSEMBLY 2026
          </div>

          {/* Headline - Strong sans-serif */}
          <h1 className="text-[36px] sm:text-[42px] md:text-[48px] lg:text-[54px] xl:text-[58px] font-sans font-extrabold text-[#18181B] dark:text-[#F7F4ED] tracking-normal leading-[1.04] mb-3.5 sm:mb-4 max-w-[620px]">
            Welcome to the Children &amp; Teens Session
          </h1>

          {/* Body copy - ONE concise paragraph */}
          <div className="max-w-[540px] mb-5 sm:mb-6">
            <p className="text-sm sm:text-[15px] lg:text-base text-[#52525B] dark:text-[#C8C2B6] leading-[1.65] font-normal">
              Registration is open for children ages {minAge}–{maxAge} attending {eventTitle} on {eventDateLabel}. Applications are reviewed before acceptance, and successful applicants will be notified by email.
            </p>
          </div>

          {/* Unified Action Cluster: CTAs & Supporting Photos */}
          {renderActionCluster()}

          {/* Premium Integrated Countdown Module */}
          {renderCountdownModule()}
        </div>

        {/* Right Column: restored layered event-image composition */}
        <div className="w-full flex items-center justify-center lg:justify-end py-0 sm:py-1">
          <HeroPhotoComposition
            photos={heroPhotos}
            featureImage={heroFeatureImage}
            prefersReducedMotion={prefersReducedMotion}
            loaded={loaded}
          />
        </div>
      </div>
    </section>
  );
};
