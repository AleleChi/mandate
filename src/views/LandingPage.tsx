import React, { useState, useEffect } from 'react';
import { ShieldCheck, Calendar, Clock, QrCode, Smartphone, Monitor, ArrowRight, Check, Mail, BookOpen, Sparkles, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppRoute } from '../types';
import { PastMomentsCarousel } from '../components/common/PastMomentsCarousel';
import { CurvedPhotoGallery } from '../components/common/CurvedPhotoGallery';
import { ParentProcessSection } from '../components/common/ParentProcessSection';
import { SafetySection } from '../components/common/SafetySection';
import { BrandLogo } from '../components/common/BrandLogo';
import { REAL_ASSETS } from '../config/assets';
import { AssetImage } from '../components/common/AssetImage';
import { api } from '../services/api';
import { Seo } from '../components/common/Seo';
import { LandingEventDetailsSection } from '../components/common/LandingEventDetailsSection';
import { LandingVideoSection } from '../components/common/LandingVideoSection';

interface LandingPageProps {
  onNavigate: (route: AppRoute) => void;
  isMobileLandingView: boolean;
  onToggleMobileView: (mobile: boolean) => void;
  parentCtaRoute?: string;
  volunteerCtaRoute?: string;
}

interface HeroPassPreviewProps {
  className?: string;
  isMobile?: boolean;
  avatarUrl?: string;
}

const HeroPassPreview: React.FC<HeroPassPreviewProps> = ({ className = "", isMobile = false, avatarUrl }) => {
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
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
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
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
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
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
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
                    transition={{ duration: 1.4, ease: "easeInOut" }}
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

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  isMobileLandingView,
  onToggleMobileView,
  parentCtaRoute = '/parent/create-account',
  volunteerCtaRoute = '/volunteer/sign-in'
}) => {
  const [loaded, setLoaded] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [simMobileMenuOpen, setSimMobileMenuOpen] = useState(false);
  const [assets, setAssets] = useState<any>({
    ...REAL_ASSETS,
    site_logo: (window as any)._site_logo || ''
  });
  const [landingSettings, setLandingSettings] = useState<Record<string, string>>({});

  const [currentEvent, setCurrentEvent] = useState<any>(null);
  const [regStatus, setRegStatus] = useState<any>(null);
  const [infoModal, setInfoModal] = useState<{
    isOpen: boolean;
    type: 'parent' | 'volunteer';
    title: string;
    message: string;
    note?: string;
    signInRoute: AppRoute;
    signInLabel: string;
  } | null>(null);

  useEffect(() => {
    api.auth.getRegistrationStatus().then((res) => {
      if (res && res.success) {
        setRegStatus(res);
      }
    }).catch((err) => {
      console.error('Failed to load registration status', err);
    });
  }, []);

  const handleParentRegisterClick = () => {
    if (regStatus && !regStatus.parent?.isOpen) {
      const isNotOpen = regStatus.parent?.state === 'not_open_yet';
      const eventName = regStatus.eventName || 'The General Assembly';

      setInfoModal({
        isOpen: true,
        type: 'parent',
        title: isNotOpen ? 'Registration is not open yet' : 'Registration has closed',
        message: isNotOpen
          ? `Registration for ${eventName} has not started yet.${regStatus.parent?.opensAtFormatted ? ` Registration opens ${regStatus.parent.opensAtFormatted}.` : ''}`
          : `Registration for ${eventName} is no longer accepting new applications.`,
        note: 'Already registered?\nYou can still sign in to access your account.',
        signInRoute: '/parent/sign-in',
        signInLabel: 'Sign in'
      });
      return;
    }
    onNavigate(parentCtaRoute as AppRoute);
  };

  const handleVolunteerRegisterClick = () => {
    if (regStatus && !regStatus.volunteer?.isOpen) {
      const isNotOpen = regStatus.volunteer?.state === 'not_open_yet';
      const eventName = regStatus.eventName || 'The General Assembly';

      setInfoModal({
        isOpen: true,
        type: 'volunteer',
        title: isNotOpen ? 'Registration is not open yet' : 'Registration has closed',
        message: isNotOpen
          ? `Volunteer registration for ${eventName} has not started yet.${regStatus.volunteer?.opensAtFormatted ? ` Registration opens ${regStatus.volunteer.opensAtFormatted}.` : ''}`
          : `Volunteer registration for ${eventName} is no longer accepting new applications.`,
        note: 'Already registered?\nYou can still sign in to access your account.',
        signInRoute: '/volunteer/sign-in',
        signInLabel: 'Sign in'
      });
      return;
    }
    onNavigate(volunteerCtaRoute as AppRoute);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoaded(true);
    }, 100);

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);

    // Fetch dynamic assets override
    const fetchLandingData = async () => {
      try {
        const res = await api.landing.getPublicPage();
        if (res.success) {
          if (res.currentEvent) {
            setCurrentEvent(res.currentEvent);
          }
          if (res.settings) {
            setLandingSettings(res.settings);
            const s = res.settings;
          setAssets({
            site_logo: s.site_logo || (window as any)._site_logo || '',
            heroMain: s.heroMain || REAL_ASSETS.heroMain,
            heroUpper: s.heroUpper || REAL_ASSETS.heroUpper,
            heroRight: s.heroRight || REAL_ASSETS.heroRight,
            heroVideo: (res as any).landingVideo?.url || s.heroVideo || REAL_ASSETS.heroVideo,
            heroVideoPoster: (res as any).landingVideo?.posterUrl || s.heroVideoPoster || '',
            passAvatar: s.passAvatar || REAL_ASSETS.passAvatar,
            workerAvatar: s.workerAvatar || REAL_ASSETS.workerAvatar,
            safetySection: s.safetySection || REAL_ASSETS.safetySection,
            gallery: {
              arrival: s.galleryArrival || REAL_ASSETS.gallery.arrival,
              checkIn: s.galleryCheckIn || REAL_ASSETS.gallery.checkIn,
              activities: s.galleryActivities || REAL_ASSETS.gallery.activities,
              teaching: s.galleryTeaching || REAL_ASSETS.gallery.teaching,
              careTeam: s.galleryCareTeam || REAL_ASSETS.gallery.careTeam,
              pickup: s.galleryPickup || REAL_ASSETS.gallery.pickup,
              parentUpdates: s.galleryParentUpdates || REAL_ASSETS.gallery.parentUpdates,
              eventMoments: s.galleryEventMoments || REAL_ASSETS.gallery.eventMoments,
              eventVideo: s.galleryEventVideo || REAL_ASSETS.gallery.eventVideo,
            }
          });
          if (s.site_logo) {
            (window as any)._site_logo = s.site_logo;
          }
        }
      }
      } catch (err) {
        console.error('Error fetching landing page assets:', err);
      }
    };
    fetchLandingData();

    return () => {
      clearTimeout(timer);
      mediaQuery.removeEventListener('change', listener);
    };
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://themandate.dontechservicesconst.com');
  const seoTitle = 'Koinonia Children and Teens Event Registration';
  const seoDescription = 'Register, manage child details, receive event updates, and access secure check-in and pickup support for Koinonia Children and Teens events.';
  const seoOgDescription = 'A secure event registration and check-in experience for parents, children, and approved volunteers.';
  const seoImage = assets.heroMain || REAL_ASSETS.heroMain || (siteUrl + '/social_share.jpg');

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Koinonia Children and Teens",
      "url": siteUrl,
      "logo": assets.site_logo || (typeof window !== 'undefined' ? `${window.location.origin}/logo.png` : '')
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Koinonia Children and Teens",
      "url": siteUrl
    }
  ];

  // ==========================================
  // MOBILE LANDING PAGE VIEW (Stitch Mobile)
  // ==========================================
  if (isMobileLandingView) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] text-[#18181B] font-sans pb-24 flex flex-col justify-between selection:bg-[#C59B27]/30">
        <Seo
          title={seoTitle}
          description={seoDescription}
          canonical={siteUrl + '/'}
          robots="index, follow"
          ogTitle={seoTitle}
          ogDescription={seoOgDescription}
          ogImage={seoImage}
          ogType="website"
          twitterCard="summary_large_image"
          structuredData={structuredData}
        />
        {/* Minimal Mobile Header */}
        <header className="sticky top-0 z-40 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EAE8E1] px-5 py-4 flex items-center justify-between relative" data-component-version="landing-header-v2-responsive-menu">
          <BrandLogo
            context="compact"
            data-component-version="landing-header-logo-image-v2-full-brand"
            onDoubleClick={() => onNavigate('/admin/sign-in')}
            onTouchStart={(e) => {
              const now = Date.now();
              const lastTap = (window as any)._lastLogoTap || 0;
              if (now - lastTap < 300) {
                onNavigate('/admin/sign-in');
              }
              (window as any)._lastLogoTap = now;
            }}
            onClick={() => onNavigate('/')}
            title="Double-click to access Administration"
            className="group"
          />

          <button
            type="button"
            onClick={() => setSimMobileMenuOpen(!simMobileMenuOpen)}
            data-component-version="landing-header-menu-button-v2"
            aria-label="Open menu"
            className="p-2 rounded-xl text-[#6B7280] hover:text-[#18181B] hover:bg-[#FAF6EB] transition-all cursor-pointer focus:outline-none"
          >
            {simMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Simulated Mobile Dropdown Menu Panel */}
          <AnimatePresence>
            {simMobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="absolute top-full left-0 right-0 border-b border-[#EAE8E1] bg-[#FAF9F6] shadow-lg overflow-hidden z-50"
                data-component-version="landing-header-mobile-menu-v2"
              >
                <div className="px-5 py-6 space-y-4 flex flex-col">
                  {/* Navigation links inside dropdown */}
                  <div className="grid grid-cols-2 gap-3 pb-4 border-b border-[#EAE8E1] text-[11px] font-semibold tracking-wider text-[#6B7280] uppercase">
                    <button
                      onClick={() => {
                        scrollToSection('about');
                        setSimMobileMenuOpen(false);
                      }}
                      className="text-left py-2 hover:text-[#18181B] transition-colors"
                    >
                      About
                    </button>
                    <button
                      onClick={() => {
                        scrollToSection('process');
                        setSimMobileMenuOpen(false);
                      }}
                      className="text-left py-2 hover:text-[#18181B] transition-colors"
                    >
                      The Process
                    </button>
                    <button
                      onClick={() => {
                        scrollToSection('safety');
                        setSimMobileMenuOpen(false);
                      }}
                      className="text-left py-2 hover:text-[#18181B] transition-colors"
                    >
                      Safety
                    </button>
                    <button
                      onClick={() => {
                        scrollToSection('moments');
                        setSimMobileMenuOpen(false);
                      }}
                      className="text-left py-2 hover:text-[#18181B] transition-colors"
                    >
                      Past Moments
                    </button>
                  </div>

                  {/* Auth actions: primary Parent sign in, secondary Volunteer sign in */}
                  <div className="flex flex-col space-y-3 pt-2">
                    <button
                      onClick={() => {
                        onNavigate('/parent/sign-in');
                        setSimMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between bg-[#C59B27] hover:bg-[#B89047] active:bg-[#AA8220] text-white text-sm font-semibold py-3 px-4 rounded-xl shadow-xs transition-all cursor-pointer group"
                    >
                      <span>Parent sign in</span>
                      <ArrowRight className="w-4 h-4 text-white/90 group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </button>
                    <button
                      onClick={() => {
                        onNavigate('/volunteer/sign-in');
                        setSimMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between bg-white hover:bg-[#FAF6EB] active:bg-[#F5F2E9] text-[#262626] border border-[#D9D6CE] text-sm font-semibold py-3 px-4 rounded-xl shadow-2xs transition-all cursor-pointer group"
                    >
                      <span>Volunteer sign in</span>
                      <ArrowRight className="w-4 h-4 text-[#71717A] group-hover:text-[#262626] group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        <main className="max-w-md mx-auto w-full px-5 pt-6 space-y-10">
          {/* Mobile Hero Section */}
          <section className={`relative rounded-3xl overflow-hidden p-5 -mx-1 sm:p-6 bg-[#FAF8F3] border border-[#E5D5AE]/60 shadow-xs transition-all duration-1000 ease-out ${loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {/* Layer 1 & 2: Background Video & Warm Off-White Overlay */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none rounded-3xl">
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
                    opacity: 0.20,
                    filter: 'brightness(0.65) contrast(1.08)',
                  }}
                >
                  <source src={assets.heroVideo} type="video/mp4" />
                </video>
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#EAE8E1]/30 to-[#FAF8F3]" />
              )}
              {/* Warm Off-White Overlay ensuring readability above the fold */}
              <div className="absolute inset-0 bg-gradient-to-b from-[#FAF8F3]/96 via-[#FAF8F3]/88 to-[#FAF8F3]/96 pointer-events-none" />
            </div>

            <div className="relative z-10 space-y-6">
              <div className="inline-block px-3.5 py-1 rounded-full bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] text-xs font-semibold tracking-wide uppercase">
                KOINONIA CHILDREN AND TEENS
              </div>

            <h1 className="text-3xl sm:text-4xl font-serif-koinonia font-bold tracking-tight text-[#18181B] leading-[1.15]">
              The Children and Teens section starts here
            </h1>

            <p className="text-sm text-[#6B7280] leading-relaxed">
              Parents and guardians can create an account, add each child’s details, follow review updates, and keep event passes ready for the day.
            </p>

            {/* Stacked Action Buttons / Registration Status */}
            {regStatus && !regStatus.parent?.isOpen ? (
              <div className="bg-white/95 border border-[#E7E3D8] rounded-2xl p-5 space-y-4 text-left shadow-xs backdrop-blur-xs">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#9A7326] uppercase tracking-wider">
                    {regStatus.parent?.state === 'not_open_yet' ? 'Registration opening soon' : 'Registration closed'}
                  </div>
                  <h3 className="text-lg sm:text-xl font-serif-koinonia font-bold text-[#18181B] leading-snug">
                    {regStatus.parent?.state === 'not_open_yet'
                      ? `Registration for ${regStatus.eventName} has not started yet.`
                      : `Registration for ${regStatus.eventName} is now closed.`}
                  </h3>
                  <p className="text-xs text-[#52525B] leading-relaxed">
                    {regStatus.parent?.state === 'not_open_yet'
                      ? (regStatus.parent?.opensAtFormatted
                          ? `Registration opens ${regStatus.parent.opensAtFormatted}. If you already have an account, sign in below anytime.`
                          : 'If you already have an account, you can still sign in below anytime.')
                      : 'Existing families can sign in below to view child details and event passes.'}
                  </p>
                </div>
                <div className="space-y-2 pt-1">
                  <button
                    onClick={() => onNavigate('/parent/sign-in')}
                    className="w-full h-[46px] bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-xl text-xs shadow-sm transition-all flex items-center justify-center uppercase tracking-wider cursor-pointer"
                  >
                    <span>Sign in</span>
                  </button>
                  <button
                    onClick={() => onNavigate('/volunteer/sign-in')}
                    className="w-full h-[46px] bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] font-semibold rounded-xl text-xs transition-all flex items-center justify-center uppercase tracking-wider cursor-pointer"
                  >
                    <span>Volunteer sign in</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-1" data-component-version="landing-hero-cta-v2-clean">
                <button
                  onClick={handleParentRegisterClick}
                  className="w-full h-[52px] bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-xl text-sm shadow-sm transition-all flex items-center justify-center space-x-2 uppercase tracking-wider cursor-pointer"
                >
                  <span>Register your child</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={handleVolunteerRegisterClick}
                  className="w-full h-[52px] bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] font-semibold rounded-xl text-sm transition-all flex items-center justify-center uppercase tracking-wider cursor-pointer"
                >
                  <span>Volunteer sign in</span>
                </button>
              </div>
            )}

            {/* Small trust badge */}
            <div className="flex items-center space-x-2 text-xs text-[#6B7280] pt-1">
              <ShieldCheck className="w-4 h-4 text-[#C59B27] shrink-0" />
              <span>Entry and pickup are checked with care.</span>
            </div>

            {/* Hero Event Image */}
            <div className="pt-2">
              <div className="rounded-3xl overflow-hidden shadow-lg border border-[#EAE8E1] bg-white h-72">
                <AssetImage
                  src={assets.heroMain}
                  alt="Koinonia General Assembly Children and Teens"
                  iconType="sparkles"
                  label="General Assembly Gathering"
                  className="w-full h-full object-cover object-top"
                  loading="eager"
                  fetchpriority="high"
                />
              </div>
            </div>
            </div>
          </section>

          {/* Live Event Details Section */}
          <LandingEventDetailsSection event={currentEvent} regStatus={regStatus} className="!py-4 !px-0" />

          {/* Premium Curved Video Section */}
          <LandingVideoSection
            videoUrl={assets.heroVideo || assets.gallery?.eventVideo}
            posterUrl={assets.heroVideoPoster || assets.heroMain || assets.heroUpper}
            className="!py-4 !px-0"
          />

          {/* Pass Preview Card Block - Subtle Scan-to-Details Animation */}
          <HeroPassPreview className="!rounded-3xl !p-5 shadow-xl" isMobile={true} avatarUrl={assets.passAvatar} />

          {/* Curved Orbital Photo Gallery Section */}
          <CurvedPhotoGallery />

          {/* For Parents & Guardians (Mobile Editorial Section) */}
          <section id="process" className="pt-8 pb-4 space-y-6 text-left border-t border-[#EAE8E1]">
            <div className="space-y-3">
              <span className="text-xs font-bold tracking-widest text-[#9A7326] uppercase block font-sans">
                FOR PARENTS &amp; GUARDIANS
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif-koinonia font-bold text-[#18181B] leading-tight">
                Register your child for the gathering
              </h2>
              <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                Create your parent profile, add your child’s details, and submit them for review.
              </p>
              <div className="pt-2">
                <button
                  onClick={handleParentRegisterClick}
                  className="w-full inline-flex items-center justify-center space-x-2 bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold py-3.5 px-6 rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer group"
                >
                  <span>Register your child</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>
              </div>
              <div className="pt-1">
                <button
                  onClick={() => onNavigate('/parent/sign-in')}
                  className="text-xs font-semibold text-[#9A7326] hover:underline"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </div>

            {/* 3 Editorial Process Steps */}
            <div className="space-y-4 pt-3 border-t border-[#EAE8E1]/80">
              <div className="flex items-start space-x-3.5">
                <span className="font-serif-koinonia font-bold text-sm text-[#9A7326] pt-0.5 shrink-0">
                  01
                </span>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-serif-koinonia font-bold text-[#18181B]">Create your profile</h3>
                  <p className="text-xs text-[#6B7280] leading-relaxed">Add your contact details and basic information.</p>
                </div>
              </div>

              <div className="flex items-start space-x-3.5">
                <span className="font-serif-koinonia font-bold text-sm text-[#9A7326] pt-0.5 shrink-0">
                  02
                </span>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-serif-koinonia font-bold text-[#18181B]">Add your child’s details</h3>
                  <p className="text-xs text-[#6B7280] leading-relaxed">Add their age group, photo, care information and designated pickup person.</p>
                </div>
              </div>

              <div className="flex items-start space-x-3.5">
                <span className="font-serif-koinonia font-bold text-sm text-[#9A7326] pt-0.5 shrink-0">
                  03
                </span>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-serif-koinonia font-bold text-[#18181B]">Submit for review</h3>
                  <p className="text-xs text-[#6B7280] leading-relaxed">We’ll review the details before an event pass is issued.</p>
                </div>
              </div>
            </div>
          </section>

          {/* For Volunteers (Mobile Editorial Section) */}
          <section id="volunteers" className="pt-6 pb-2 space-y-3.5 text-left border-t border-[#EAE8E1]">
            <span className="text-xs font-bold tracking-widest text-[#9A7326] uppercase block font-sans">
              FOR VOLUNTEERS
            </span>
            <h2 className="text-2xl font-serif-koinonia font-bold text-[#18181B] leading-snug">
              Volunteering with Children &amp; Teens?
            </h2>
            <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
              Approved volunteers can sign in to use check-in, pickup and other event-day tools.
            </p>
            <div className="pt-1">
              <button
                onClick={() => onNavigate(volunteerCtaRoute as AppRoute)}
                className="w-full inline-flex items-center justify-center space-x-2 bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] hover:border-[#C59B27]/60 font-semibold py-3.5 px-6 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer group"
              >
                <span>Volunteer sign in</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#9A7326] transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            </div>
          </section>

          {/* Safety Section (Mobile View) */}
          <SafetySection customImage={assets.safetySection} />

          {/* Past Moments Section (Mobile 3D Carousel Reel) */}
          <PastMomentsCarousel loaded={true} customAssets={assets.gallery} />
        </main>

        {/* Sticky Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#FAF9F6]/95 backdrop-blur-md border-t border-[#EAE8E1] p-3 flex items-center space-x-3 shadow-2xl">
          <button
            onClick={handleParentRegisterClick}
            className="flex-1 bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold py-3 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer"
          >
            <span>Register your child</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => scrollToSection('footer')}
            className="bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] font-semibold py-3 px-4 rounded-xl text-xs flex items-center justify-center space-x-1.5 shrink-0"
          >
            <Mail className="w-3.5 h-3.5 text-[#6B7280]" />
            <span>CONTACT US</span>
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // DESKTOP LANDING PAGE VIEW (Stitch Desktop)
  // ==========================================
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#18181B] font-sans flex flex-col selection:bg-[#C59B27]/30">
      <Seo
        title={seoTitle}
        description={seoDescription}
        canonical={siteUrl + '/'}
        robots="index, follow"
        ogTitle={seoTitle}
        ogDescription={seoOgDescription}
        ogImage={seoImage}
        ogType="website"
        twitterCard="summary_large_image"
        structuredData={structuredData}
      />
      {/* 1. Header (Stitch Light Header) */}
      <header className="sticky top-0 z-40 w-full bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EAE8E1] relative" data-component-version="landing-header-v2-responsive-menu">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between relative">
          {/* Brand */}
          <BrandLogo
            context="landing"
            data-component-version="landing-header-logo-image-v2-full-brand"
            onDoubleClick={() => onNavigate('/admin/sign-in')}
            onTouchStart={(e) => {
              const now = Date.now();
              const lastTap = (window as any)._lastLogoTap || 0;
              if (now - lastTap < 300) {
                onNavigate('/admin/sign-in');
              }
              (window as any)._lastLogoTap = now;
            }}
            onClick={() => onNavigate('/')}
            title="Double-click to access Administration"
            className="group"
          />

          {/* Nav Links - Hidden on Mobile */}
          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-[#6B7280]">
            <button onClick={() => scrollToSection('about')} className="hover:text-[#18181B] transition-colors cursor-pointer">About</button>
            <button onClick={() => scrollToSection('process')} className="hover:text-[#18181B] transition-colors cursor-pointer">The Process</button>
            <button onClick={() => scrollToSection('safety')} className="hover:text-[#18181B] transition-colors cursor-pointer">Safety</button>
            <button onClick={() => scrollToSection('moments')} className="hover:text-[#18181B] transition-colors cursor-pointer">Past Moments</button>
            <button onClick={() => scrollToSection('footer')} className="hover:text-[#18181B] transition-colors cursor-pointer">Contact</button>
          </nav>

          {/* CTAs - Hidden on Mobile */}
          <div className="hidden md:flex items-center space-x-4">
            <button
              onClick={() => onNavigate('/volunteer/sign-in')}
              className="text-[#6B7280] hover:text-[#18181B] text-xs font-semibold px-4 py-2.5 rounded-xl hover:bg-[#FAF6EB] transition-all cursor-pointer"
            >
              Volunteer Sign In
            </button>
            <button
              onClick={() => onNavigate('/parent/sign-in')}
              className="text-[#6B7280] hover:text-[#18181B] text-xs font-semibold px-4 py-2.5 rounded-xl hover:bg-[#FAF6EB] transition-all cursor-pointer"
            >
              Parent Sign In
            </button>
            <button
              onClick={handleParentRegisterClick}
              className="bg-[#C59B27] hover:bg-[#B89047] text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-all cursor-pointer"
            >
              Register Your Child
            </button>
          </div>

          {/* Hamburger Menu Button - Hidden on md and up */}
          <div className="flex md:hidden items-center">
            <button
              type="button"
              id="btn-landing-mobile-menu"
              onClick={(e) => {
                e.stopPropagation();
                setMobileMenuOpen(!mobileMenuOpen);
              }}
              data-component-version="landing-header-menu-button-v2"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="p-2 rounded-xl text-[#6B7280] hover:text-[#18181B] hover:bg-[#FAF6EB] transition-all cursor-pointer focus:outline-none"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Backdrop for tapping outside to close menu */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 top-20 bg-black/30 backdrop-blur-xs z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Mobile Dropdown Menu Panel */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="md:hidden border-t border-[#EAE8E1] bg-[#FAF9F6] shadow-xl overflow-hidden absolute top-full left-0 right-0 z-50"
              data-component-version="landing-header-mobile-menu-v2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-6 space-y-4 flex flex-col">
                {/* Navigation links inside dropdown */}
                <div className="grid grid-cols-2 gap-3 pb-4 border-b border-[#EAE8E1] text-[11px] font-semibold tracking-wider text-[#6B7280] uppercase">
                  <button
                    type="button"
                    onClick={() => {
                      scrollToSection('about');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 hover:text-[#18181B] transition-colors cursor-pointer"
                  >
                    About
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      scrollToSection('process');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 hover:text-[#18181B] transition-colors cursor-pointer"
                  >
                    The Process
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      scrollToSection('safety');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 hover:text-[#18181B] transition-colors cursor-pointer"
                  >
                    Safety
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      scrollToSection('moments');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 hover:text-[#18181B] transition-colors cursor-pointer"
                  >
                    Past Moments
                  </button>
                </div>

                {/* Auth actions: primary Parent sign in, secondary Volunteer sign in */}
                <div className="flex flex-col space-y-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('/parent/sign-in');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between bg-[#C59B27] hover:bg-[#B89047] active:bg-[#AA8220] text-white text-sm font-semibold py-3 px-4 rounded-xl shadow-xs transition-all cursor-pointer group"
                  >
                    <span>Parent sign in</span>
                    <ArrowRight className="w-4 h-4 text-white/90 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('/volunteer/sign-in');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between bg-white hover:bg-[#FAF6EB] active:bg-[#F5F2E9] text-[#262626] border border-[#D9D6CE] text-sm font-semibold py-3 px-4 rounded-xl shadow-2xs transition-all cursor-pointer group"
                  >
                    <span>Volunteer sign in</span>
                    <ArrowRight className="w-4 h-4 text-[#71717A] group-hover:text-[#262626] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* 2. Hero Section */}
      <section id="about" className="relative py-16 sm:py-24 px-6 sm:px-10 lg:px-12 max-w-7xl mx-auto w-full overflow-hidden rounded-[36px] my-6 border border-[#EAE8E1]/70 shadow-xs">
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
          <div className={`lg:col-span-6 space-y-6 text-left transition-all duration-1000 ease-out ${loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
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
                      ? `Registration for ${regStatus.eventName} has not started yet.`
                      : `Registration for ${regStatus.eventName} is now closed.`}
                  </h3>
                  <p className="text-sm text-[#52525B] leading-relaxed">
                    {regStatus.parent?.state === 'not_open_yet'
                      ? (regStatus.parent?.opensAtFormatted
                          ? `Registration opens ${regStatus.parent.opensAtFormatted}. If you already have an account, you can still sign in anytime to view your child’s information and updates.`
                          : 'If you already have an account, you can still sign in anytime to view your child’s information and updates.')
                      : 'Existing families can sign in below anytime to view child details and keep event passes ready.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    onClick={() => onNavigate('/parent/sign-in')}
                    className="w-full sm:w-56 h-[48px] bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center cursor-pointer"
                  >
                    <span>Sign in</span>
                  </button>
                  <button
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
                  onClick={handleParentRegisterClick}
                  className="w-full sm:w-64 h-[52px] bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-xl text-sm shadow-sm transition-all inline-flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <span>Register your child</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={handleVolunteerRegisterClick}
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
            <div className={`absolute -top-4 left-0 sm:left-6 w-60 sm:w-72 h-80 rounded-3xl overflow-hidden shadow-lg border border-[#EAE8E1] z-0 transition-all duration-700 delay-150 ease-out ${loaded ? 'opacity-90 translate-y-0 -rotate-3' : 'opacity-0 -translate-y-6 -rotate-6'} group-hover/hero:-translate-y-2 group-hover/hero:shadow-2xl`}>
              <AssetImage
                src={assets.heroUpper}
                alt="Families arriving at event"
                iconType="users"
                label="Back Layer Visual"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Main image (large main image with curved/rounded top shape) */}
            <div className={`relative z-10 rounded-t-[140px] sm:rounded-t-[180px] rounded-b-3xl overflow-hidden shadow-2xl border border-[#EAE8E1] bg-white aspect-[4/5] max-w-md mx-auto lg:ml-auto transition-all duration-700 delay-300 ease-out ${loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} group-hover/hero:scale-[1.02] group-hover/hero:shadow-[0_28px_60px_-12px_rgba(24,24,27,0.22)]`}>
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
            <div className={`absolute -right-2 sm:-right-6 bottom-12 sm:bottom-16 z-20 w-44 sm:w-52 aspect-square rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-white transition-all duration-700 delay-500 ease-out ${loaded ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'} group-hover/hero:translate-x-2 group-hover/hero:shadow-[0_28px_60px_-12px_rgba(24,24,27,0.24)]`}>
              <AssetImage
                src={assets.heroRight}
                alt="Welcoming care team member check-in"
                iconType="heart"
                label="Front Right Layer"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Floating pass preview card (subtle scan-to-details animation - overlapping lower-left area of main image) */}
            <div className={`absolute left-0 sm:left-2 -bottom-8 sm:-bottom-10 z-30 w-[300px] sm:w-[350px] transition-all duration-700 delay-700 ease-out ${loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} group-hover/hero:-translate-y-2 group-hover/hero:shadow-[0_28px_60px_-12px_rgba(24,24,27,0.2)]`}>
              <HeroPassPreview avatarUrl={assets.passAvatar} />
            </div>
          </div>
        </div>
      </section>

      {/* 3. Live Event Details Section */}
      <LandingEventDetailsSection event={currentEvent} regStatus={regStatus} />

      {/* 4. Premium Curved Video Section */}
      <LandingVideoSection
        videoUrl={assets.heroVideo || assets.gallery?.eventVideo}
        posterUrl={assets.heroVideoPoster || assets.heroMain || assets.heroUpper}
      />

      {/* Curved Orbital Photo Gallery Section */}
      <CurvedPhotoGallery />

      {/* 5. Parent Process Section (Editorial Steps) */}
      <ParentProcessSection
        onNavigate={onNavigate}
        parentCtaRoute={parentCtaRoute}
        onRegisterClick={handleParentRegisterClick}
      />

      {/* 5. For Volunteers (Editorial Connected Layout) */}
      <section id="volunteers" className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full border-t border-[#EAE8E1]">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 md:gap-10">
          <div className="max-w-lg space-y-3 text-left">
            <span className="text-xs font-bold tracking-widest text-[#9A7326] uppercase block font-sans">
              FOR VOLUNTEERS
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-serif-koinonia font-bold text-[#18181B] tracking-tight leading-snug">
              Volunteering with Children &amp; Teens?
            </h2>
            <p className="text-sm sm:text-base text-[#6B7280] leading-relaxed">
              Approved volunteers can sign in to use check-in, pickup and other event-day tools.
            </p>
          </div>

          <div className="shrink-0 pt-2 md:pt-0 md:pb-1">
            <button
              onClick={() => onNavigate(volunteerCtaRoute as AppRoute)}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] hover:border-[#C59B27]/60 font-semibold py-3 px-6 sm:px-7 rounded-xl text-sm shadow-2xs hover:shadow-sm transition-all duration-200 cursor-pointer group whitespace-nowrap"
            >
              <span>Volunteer sign in</span>
              <ArrowRight className="w-4 h-4 text-[#9A7326] transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </section>

      {/* 6. Safety Section (Remaining Lower Content) */}
      <SafetySection customImage={assets.safetySection} />

      {/* 7. Past Moments Section (3D Editorial Reel) */}
      <PastMomentsCarousel loaded={loaded} customAssets={assets.gallery} />

      {/* 8. Footer (Institutional, Restrained & Intentional) */}
      {(() => {
        const footerYear = landingSettings.footerYear || String(new Date().getFullYear());
        const footerCopyrightName = landingSettings.footerCopyrightName || 'The Koinonia General Assembly';
        const contactEmail = landingSettings.contactEmail?.trim() || '';
        const contactPhone = landingSettings.contactPhone?.trim() || '';
        const contactWhatsApp = landingSettings.contactWhatsApp?.trim() || '';
        const contactAddress = landingSettings.contactAddress?.trim() || '';

        return (
          <footer id="footer" className="bg-[#FAF9F6] border-t border-[#EAE8E1] pt-14 pb-10 px-4 sm:px-6 lg:px-8 mt-auto">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8 pb-12 border-b border-[#EAE8E1]">
                {/* Column 1: Ministry Identifier (spans 2 cols on lg) */}
                <div className="lg:col-span-2 space-y-4">
                  <BrandLogo
                    context="compact"
                    onClick={() => onNavigate('/')}
                    className="flex items-center space-x-3 cursor-pointer"
                  />
                  <p className="text-xs sm:text-sm text-stone-600 leading-relaxed max-w-sm">
                    A dedicated ministry of The Koinonia General Assembly committed to nurturing children and teens in faith, safety, and Christian fellowship.
                  </p>
                </div>

                {/* Column 2: EXPLORE */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-stone-900 uppercase tracking-wider font-sans">
                    Explore
                  </h4>
                  <ul className="space-y-2 text-xs text-stone-600">
                    <li>
                      <button
                        onClick={() => {
                          const el = document.getElementById('gathering-video');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                          else window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="hover:text-stone-950 transition-colors cursor-pointer text-left"
                      >
                        About
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => {
                          const el = document.getElementById('volunteers');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="hover:text-stone-950 transition-colors cursor-pointer text-left"
                      >
                        The Process
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => onNavigate('/child-safety')}
                        className="hover:text-stone-950 transition-colors cursor-pointer text-left"
                      >
                        Safety
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => {
                          const el = document.getElementById('footer');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="hover:text-stone-950 transition-colors cursor-pointer text-left"
                      >
                        Past Moments
                      </button>
                    </li>
                  </ul>
                </div>

                {/* Column 3: FOR PARENTS */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-stone-900 uppercase tracking-wider font-sans">
                    For Parents
                  </h4>
                  <ul className="space-y-2 text-xs text-stone-600">
                    <li>
                      <button
                        onClick={() => onNavigate('/parent/sign-in')}
                        className="hover:text-stone-950 transition-colors cursor-pointer text-left"
                      >
                        Parent Sign In
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={handleParentRegisterClick}
                        className="hover:text-stone-950 transition-colors cursor-pointer text-left"
                      >
                        Register Your Child
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => onNavigate('/privacy')}
                        className="hover:text-stone-950 transition-colors cursor-pointer text-left"
                      >
                        Privacy Notice
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => onNavigate('/child-safety')}
                        className="hover:text-stone-950 transition-colors cursor-pointer text-left"
                      >
                        Child Safety
                      </button>
                    </li>
                  </ul>
                </div>

                {/* Column 4: CONTACT (Displays only configured fields) */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-stone-900 uppercase tracking-wider font-sans">
                    Contact
                  </h4>
                  <ul className="space-y-2 text-xs text-stone-600">
                    {contactAddress && (
                      <li className="leading-relaxed">
                        <span className="text-stone-400 block text-[11px]">Address</span>
                        <span className="text-stone-700">{contactAddress}</span>
                      </li>
                    )}
                    {contactEmail && (
                      <li>
                        <span className="text-stone-400 block text-[11px]">Email</span>
                        <a
                          href={`mailto:${contactEmail}`}
                          className="text-stone-700 hover:text-[#9A7326] underline underline-offset-2 transition-colors"
                        >
                          {contactEmail}
                        </a>
                      </li>
                    )}
                    {contactPhone && (
                      <li>
                        <span className="text-stone-400 block text-[11px]">Phone</span>
                        <a
                          href={`tel:${contactPhone}`}
                          className="text-stone-700 hover:text-stone-950 transition-colors"
                        >
                          {contactPhone}
                        </a>
                      </li>
                    )}
                    {contactWhatsApp && (
                      <li>
                        <span className="text-stone-400 block text-[11px]">WhatsApp</span>
                        <a
                          href={`https://wa.me/${contactWhatsApp.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-stone-700 hover:text-[#9A7326] transition-colors"
                        >
                          {contactWhatsApp}
                        </a>
                      </li>
                    )}
                    {!contactAddress && !contactEmail && !contactPhone && !contactWhatsApp && (
                      <li>
                        <button
                          onClick={() => onNavigate('/contact')}
                          className="hover:text-stone-950 transition-colors cursor-pointer text-left underline underline-offset-2"
                        >
                          Contact details
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Bottom line: © [YEAR] [canonical organisation name] · Privacy Notice · Child Safety */}
              <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
                <p>
                  &copy; {footerYear} {footerCopyrightName}. All rights reserved.
                </p>
                <div className="flex flex-wrap items-center gap-6 font-medium">
                  <span onClick={() => onNavigate('/privacy')} className="hover:text-stone-950 cursor-pointer transition-colors">
                    Privacy Notice
                  </span>
                  <span onClick={() => onNavigate('/child-safety')} className="hover:text-stone-950 cursor-pointer transition-colors">
                    Child Safety
                  </span>
                  <span onClick={() => onNavigate('/terms')} className="hover:text-stone-950 cursor-pointer transition-colors">
                    Terms of Service
                  </span>
                  <span onClick={() => onNavigate('/contact')} className="hover:text-stone-950 cursor-pointer transition-colors">
                    Contact Us
                  </span>
                </div>
              </div>
            </div>
          </footer>
        );
      })()}

      {/* Registration Closed / Not Open Info Modal */}
      {infoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-[#EAE8E1] space-y-5 text-left relative">
            <button
              onClick={() => setInfoModal(null)}
              className="absolute top-5 right-5 p-2 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-[#9A7326] tracking-wider uppercase block">
                Notice
              </span>
              <h3 className="text-xl sm:text-2xl font-serif-koinonia font-bold text-[#18181B] leading-tight">
                {infoModal.title}
              </h3>
              <p className="text-sm text-[#52525B] leading-relaxed">
                {infoModal.message}
              </p>
            </div>

            {infoModal.note && (
              <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 text-xs space-y-1">
                <p className="font-semibold text-zinc-900">Already registered?</p>
                <p className="text-zinc-600 leading-relaxed">You can still sign in to access your account.</p>
              </div>
            )}

            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={() => {
                  const dest = infoModal.signInRoute;
                  setInfoModal(null);
                  onNavigate(dest);
                }}
                className="flex-1 bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-colors text-center shadow-xs cursor-pointer"
              >
                {infoModal.signInLabel}
              </button>
              <button
                onClick={() => setInfoModal(null)}
                className="flex-1 bg-white hover:bg-zinc-50 text-zinc-700 border border-[#D9D6CE] font-semibold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-colors text-center cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
