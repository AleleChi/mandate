import React, { useState, useEffect } from 'react';
import { ShieldCheck, Calendar, Clock, Key, QrCode, Smartphone, Monitor, ArrowRight, Check, Mail, BookOpen, Sparkles, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppRoute } from '../types';
import { PastMomentsCarousel } from '../components/common/PastMomentsCarousel';
import { ParentProcessSection } from '../components/common/ParentProcessSection';
import { SafetySection } from '../components/common/SafetySection';
import { BrandLogo } from '../components/common/BrandLogo';
import { REAL_ASSETS } from '../config/assets';
import { AssetImage } from '../components/common/AssetImage';
import { api } from '../services/api';
import { Seo } from '../components/common/Seo';

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
        if (res.success && res.settings) {
          const s = res.settings;
          setAssets({
            site_logo: s.site_logo || (window as any)._site_logo || '',
            heroMain: s.heroMain || REAL_ASSETS.heroMain,
            heroUpper: s.heroUpper || REAL_ASSETS.heroUpper,
            heroRight: s.heroRight || REAL_ASSETS.heroRight,
            heroVideo: s.heroVideo || REAL_ASSETS.heroVideo,
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

                  {/* Auth actions only: stacked */}
                  <div className="flex flex-col space-y-3 pt-2">
                    <button
                      onClick={() => {
                        onNavigate('/parent/sign-in');
                        setSimMobileMenuOpen(false);
                      }}
                      className="w-full bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] text-xs font-bold py-3 px-4 rounded-xl text-center tracking-wider uppercase transition-all cursor-pointer"
                    >
                      Parent Sign In
                    </button>
                    <button
                      onClick={() => {
                        onNavigate('/volunteer/sign-in');
                        setSimMobileMenuOpen(false);
                      }}
                      className="w-full bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] text-xs font-bold py-3 px-4 rounded-xl text-center tracking-wider uppercase transition-all cursor-pointer"
                    >
                      Volunteer Sign In
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

            {/* Stacked Action Buttons */}
            <div className="space-y-3 pt-1" data-component-version="landing-hero-cta-v2-clean">
              <button
                onClick={() => onNavigate(parentCtaRoute as AppRoute)}
                className="w-full h-[52px] bg-[#C59B27] hover:bg-[#B89047] text-white font-bold rounded-xl text-sm shadow-sm transition-all flex items-center justify-center space-x-2 uppercase tracking-wider cursor-pointer"
              >
                <span>Begin Parent Access</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onNavigate(volunteerCtaRoute as AppRoute)}
                className="w-full h-[52px] bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] font-bold rounded-xl text-sm transition-all flex items-center justify-center uppercase tracking-wider cursor-pointer"
              >
                <span>Volunteer Access</span>
              </button>
            </div>

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
                />
              </div>
            </div>
            </div>
          </section>

          {/* Refined Event Details Band */}
          <section className="bg-[#FAF8F3] rounded-3xl border border-[#E5D5AE]/80 p-5 shadow-2xs space-y-4">
            <h2 className="text-xs font-serif-koinonia font-bold text-[#18181B] pb-2 border-b border-[#EAE8E1]/80 uppercase tracking-widest text-[#9A7326]">
              Event Details
            </h2>
            <div className="grid grid-cols-2 gap-3.5 text-xs">
              <div className="bg-white p-3 rounded-2xl border border-[#EAE8E1]">
                <span className="text-[10px] font-bold tracking-wider text-[#6B7280] uppercase block">Event</span>
                <span className="font-bold text-[#18181B] text-xs sm:text-sm mt-0.5 block font-serif-koinonia">The General Assembly</span>
              </div>

              <div className="bg-white p-3 rounded-2xl border border-[#EAE8E1]">
                <span className="text-[10px] font-bold tracking-wider text-[#6B7280] uppercase block">Date</span>
                <span className="font-bold text-[#18181B] text-xs sm:text-sm mt-0.5 block">18th to 22nd November 2026</span>
              </div>

              <div className="bg-white p-3 rounded-2xl border border-[#EAE8E1]">
                <span className="text-[10px] font-bold tracking-wider text-[#6B7280] uppercase block">Theme</span>
                <span className="font-bold text-[#18181B] text-xs sm:text-sm mt-0.5 block font-serif-koinonia">More Than Conquerors</span>
                <span className="text-[10px] text-[#9A7326] font-medium block mt-0.5">Romans 8:37</span>
              </div>

              <div className="bg-white p-3 rounded-2xl border border-[#EAE8E1]">
                <span className="text-[10px] font-bold tracking-wider text-[#6B7280] uppercase block">Time</span>
                <span className="font-bold text-[#18181B] text-xs sm:text-sm mt-0.5 block">9:00 AM to 7:00 PM</span>
              </div>

              <div className="bg-white p-3 rounded-2xl border border-[#EAE8E1]">
                <span className="text-[10px] font-bold tracking-wider text-[#6B7280] uppercase block">Access</span>
                <span className="font-bold text-[#18181B] text-xs sm:text-sm mt-0.5 block">Parent account required</span>
              </div>

              <div className="bg-white p-3 rounded-2xl border border-[#EAE8E1]">
                <span className="text-[10px] font-bold tracking-wider text-[#6B7280] uppercase block">Pass</span>
                <span className="font-bold text-[#18181B] text-xs sm:text-sm mt-0.5 block text-[#9A7326]">QR pass on selection</span>
              </div>
            </div>
          </section>

          {/* Pass Preview Card Block - Subtle Scan-to-Details Animation */}
          <HeroPassPreview className="!rounded-3xl !p-5 shadow-xl" isMobile={true} avatarUrl={assets.passAvatar} />

          {/* Past Moments Section (3D Carousel Reel) */}
          <PastMomentsCarousel loaded={true} customAssets={assets.gallery} />

          {/* How it works Section */}
          <section className="space-y-6 pt-4 border-t border-[#EAE8E1]">
            <div>
              <h2 className="text-xl font-serif-koinonia font-bold text-[#18181B]">
                How it works
              </h2>
              <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
                A simple process to ensure every child is ready and secure before the event begins.
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="w-7 h-7 rounded-full bg-[#C59B27] text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  1
                </div>
                <div>
                  <h3 className="text-sm font-serif-koinonia font-bold text-[#18181B]">Create parent account</h3>
                  <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">Add your contact details and photo so the team can reach you when needed.</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-7 h-7 rounded-full bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <h3 className="text-sm font-serif-koinonia font-bold text-[#18181B]">Add each child</h3>
                  <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">Add each child’s details, age group, photo, care notes, and pickup person.</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-7 h-7 rounded-full bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <h3 className="text-sm font-serif-koinonia font-bold text-[#18181B]">Send details for review</h3>
                  <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">The team checks the details before a child is selected for the event.</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-7 h-7 rounded-full bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  4
                </div>
                <div>
                  <h3 className="text-sm font-serif-koinonia font-bold text-[#18181B]">Receive event pass</h3>
                  <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">If selected, the child’s event pass appears in the parent account.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Safety Section (Mobile View) */}
          <SafetySection customImage={assets.safetySection} />

          {/* Volunteer Section (Mobile) */}
          <section className="bg-[#FAF8F3] rounded-3xl border border-[#E5D5AE]/60 p-5 shadow-2xs space-y-4 text-center">
            <span className="text-[10px] font-bold tracking-widest text-[#9A7326] uppercase block">
              Event Team
            </span>
            <h2 className="text-lg font-serif-koinonia font-bold text-[#18181B]">
              Serving with Children and Teens?
            </h2>
            <p className="text-xs text-[#6B7280] leading-relaxed">
              Approved volunteers and event team members can sign in to support check-in, pickup, and care during the event.
            </p>
            <button
              onClick={() => onNavigate(volunteerCtaRoute as AppRoute)}
              className="w-full bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              Open Volunteer Access
            </button>
            <p className="text-[11px] text-[#9A7326]/80 italic">
              Volunteer access is reviewed before event tools are opened.
            </p>
          </section>

          {/* Final CTA Block */}
          <section className="pt-8 pb-4 text-center space-y-4 border-t border-[#EAE8E1]">
            <h2 className="text-xl font-serif-koinonia font-bold text-[#18181B]">
              Start with parent access
            </h2>
            <p className="text-xs text-[#6B7280] leading-relaxed max-w-xs mx-auto">
              Create your account first. You can add children and save progress before sending details for review.
            </p>
            <button
              onClick={() => onNavigate(parentCtaRoute as AppRoute)}
              className="w-full bg-[#C59B27] hover:bg-[#B89047] text-white font-bold py-3.5 px-6 rounded-xl text-sm shadow-sm transition-all uppercase tracking-wider cursor-pointer"
            >
              BEGIN PARENT ACCESS
            </button>
            <button
              onClick={() => onNavigate('/parent/sign-in')}
              className="text-[11px] font-bold tracking-widest text-[#9A7326] uppercase hover:underline pt-2 block w-full cursor-pointer"
            >
              I ALREADY HAVE AN ACCOUNT
            </button>
          </section>
        </main>

        {/* Sticky Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#FAF9F6]/95 backdrop-blur-md border-t border-[#EAE8E1] p-3 flex items-center space-x-3 shadow-2xl">
          <button
            onClick={() => onNavigate(parentCtaRoute as AppRoute)}
            className="flex-1 bg-[#C59B27] hover:bg-[#B89047] text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer"
          >
            <Key className="w-3.5 h-3.5" />
            <span>BEGIN PARENT ACCESS</span>
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
      <header className="sticky top-0 z-40 w-full bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EAE8E1]" data-component-version="landing-header-v2-responsive-menu">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between relative">
          {/* Koinonia Wordmark on the left */}
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

          {/* Navigation */}
          <nav className="hidden lg:flex items-center space-x-8 text-xs font-semibold tracking-wider text-[#6B7280] uppercase">
            <button onClick={() => scrollToSection('about')} className="hover:text-[#18181B] transition-colors">
              About
            </button>
            <button onClick={() => scrollToSection('process')} className="hover:text-[#18181B] transition-colors">
              The Process
            </button>
            <button onClick={() => scrollToSection('safety')} className="hover:text-[#18181B] transition-colors">
              Safety
            </button>
            <button onClick={() => scrollToSection('moments')} className="hover:text-[#18181B] transition-colors">
              Past Moments
            </button>
            <button onClick={() => scrollToSection('footer')} className="hover:text-[#18181B] transition-colors">
              FAQs
            </button>
          </nav>

          {/* Sign In & Parent Access Buttons - Visible on md and up */}
          <div className="hidden md:flex items-center space-x-3">
            <button
              onClick={() => onNavigate('/parent/sign-in')}
              className="bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-2xs cursor-pointer"
            >
              Sign In
            </button>
            <button
              onClick={() => onNavigate(parentCtaRoute as AppRoute)}
              className="bg-[#C59B27] hover:bg-[#B89047] text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-all cursor-pointer"
            >
              Parent Access
            </button>
          </div>

          {/* Hamburger Menu Button - Hidden on md and up */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-component-version="landing-header-menu-button-v2"
              aria-label="Open menu"
              className="p-2 rounded-xl text-[#6B7280] hover:text-[#18181B] hover:bg-[#FAF6EB] transition-all cursor-pointer focus:outline-none"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu Panel */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="md:hidden border-t border-[#EAE8E1] bg-[#FAF9F6] shadow-lg overflow-hidden absolute top-20 left-0 right-0 z-45"
              data-component-version="landing-header-mobile-menu-v2"
            >
              <div className="px-4 py-6 space-y-4 flex flex-col">
                {/* Navigation links inside dropdown */}
                <div className="grid grid-cols-2 gap-3 pb-4 border-b border-[#EAE8E1] text-[11px] font-semibold tracking-wider text-[#6B7280] uppercase">
                  <button
                    onClick={() => {
                      scrollToSection('about');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 hover:text-[#18181B] transition-colors"
                  >
                    About
                  </button>
                  <button
                    onClick={() => {
                      scrollToSection('process');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 hover:text-[#18181B] transition-colors"
                  >
                    The Process
                  </button>
                  <button
                    onClick={() => {
                      scrollToSection('safety');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 hover:text-[#18181B] transition-colors"
                  >
                    Safety
                  </button>
                  <button
                    onClick={() => {
                      scrollToSection('moments');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 hover:text-[#18181B] transition-colors"
                  >
                    Past Moments
                  </button>
                </div>

                {/* Auth actions only: stacked */}
                <div className="flex flex-col space-y-3 pt-2">
                  <button
                    onClick={() => {
                      onNavigate('/parent/sign-in');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] text-xs font-bold py-3 px-4 rounded-xl text-center tracking-wider uppercase transition-all cursor-pointer"
                  >
                    Parent Sign In
                  </button>
                  <button
                    onClick={() => {
                      onNavigate('/volunteer/sign-in');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] text-xs font-bold py-3 px-4 rounded-xl text-center tracking-wider uppercase transition-all cursor-pointer"
                  >
                    Volunteer Sign In
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

            {/* Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-2" data-component-version="landing-hero-cta-v2-clean">
              <button
                onClick={() => onNavigate(parentCtaRoute as AppRoute)}
                className="w-full sm:w-64 h-[52px] bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-xl text-sm shadow-sm transition-all inline-flex items-center justify-center space-x-2 cursor-pointer"
              >
                <span>Begin Parent Access</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onNavigate(volunteerCtaRoute as AppRoute)}
                className="w-full sm:w-64 h-[52px] bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] font-semibold rounded-xl text-sm transition-all inline-flex items-center justify-center cursor-pointer"
              >
                <span>Volunteer Access</span>
              </button>
            </div>

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

      {/* 3. Event Detail Strip */}
      <section className="py-14 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="bg-[#FAF8F3] border border-[#E5D5AE]/80 rounded-3xl p-6 sm:p-8 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
          {/* Card 1: Event */}
          <div className="bg-white p-5 rounded-2xl border border-[#EAE8E1] shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-bold tracking-widest text-[#9A7326] uppercase block">EVENT</span>
            <span className="text-sm font-bold text-[#18181B] font-serif-koinonia mt-2 block">The General Assembly</span>
          </div>

          {/* Card 2: Date */}
          <div className="bg-white p-5 rounded-2xl border border-[#EAE8E1] shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-bold tracking-widest text-[#9A7326] uppercase block">DATE</span>
            <span className="text-sm font-bold text-[#18181B] mt-2 block">18th to 22nd November 2026</span>
          </div>

          {/* Card 3: Theme */}
          <div className="bg-white p-5 rounded-2xl border border-[#EAE8E1] shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-bold tracking-widest text-[#9A7326] uppercase block">THEME</span>
            <div>
              <span className="text-sm font-bold text-[#18181B] font-serif-koinonia block">More Than Conquerors</span>
              <span className="text-xs text-[#9A7326] font-medium block mt-0.5">Romans 8:37</span>
            </div>
          </div>

          {/* Card 4: Time */}
          <div className="bg-white p-5 rounded-2xl border border-[#EAE8E1] shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-bold tracking-widest text-[#9A7326] uppercase block">TIME</span>
            <span className="text-sm font-bold text-[#18181B] mt-2 block">9:00 AM to 7:00 PM</span>
          </div>

          {/* Card 5: Access */}
          <div className="bg-white p-5 rounded-2xl border border-[#EAE8E1] shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-bold tracking-widest text-[#9A7326] uppercase block">ACCESS</span>
            <span className="text-sm font-bold text-[#18181B] mt-2 block">Parent account required</span>
          </div>

          {/* Card 6: Pass */}
          <div className="bg-white p-5 rounded-2xl border border-[#EAE8E1] shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-bold tracking-widest text-[#9A7326] uppercase block">PASS</span>
            <span className="text-sm font-bold text-[#9A7326] mt-2 block">QR pass on selection</span>
          </div>
        </div>
      </section>

      {/* 4. Past Moments Section (3D Editorial Reel) */}
      <PastMomentsCarousel loaded={loaded} customAssets={assets.gallery} />

      {/* 5. Parent Process Section */}
      <ParentProcessSection />

      {/* 6. Safety Section */}
      <SafetySection customImage={assets.safetySection} />

      {/* Volunteer Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-center border-t border-[#EAE8E1]">
        <div className="bg-[#FAF8F3] border border-[#E5D5AE]/60 rounded-3xl p-8 sm:p-10 shadow-2xs space-y-5">
          <span className="text-xs font-bold tracking-widest text-[#9A7326] uppercase block">
            Event Team
          </span>
          <h2 className="text-2xl sm:text-3xl font-serif-koinonia font-bold text-[#18181B] tracking-tight">
            Serving with Children and Teens?
          </h2>
          <p className="text-sm text-[#6B7280] max-w-xl mx-auto leading-relaxed">
            Approved volunteers and event team members can sign in to support check-in, pickup, and care during the event.
          </p>
          <div className="pt-2">
            <button
              onClick={() => onNavigate(volunteerCtaRoute as AppRoute)}
              className="bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] font-bold py-3 px-8 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              Open Volunteer Access
            </button>
          </div>
          <p className="text-xs text-[#9A7326]/80 italic mt-2">
            Volunteer access is reviewed before event tools are opened.
          </p>
        </div>
      </section>

      {/* 7. Final CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-center space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-[#FAF6EB] border border-[#E5D5AE] flex items-center justify-center mx-auto text-[#C59B27] shadow-2xs">
          <Key className="w-7 h-7" />
        </div>

        <h2 className="text-3xl sm:text-5xl font-serif-koinonia font-bold text-[#18181B] tracking-tight">
          Begin with parent access
        </h2>

        <p className="text-base text-[#6B7280] max-w-xl mx-auto leading-relaxed">
          Create your account first. You can add children and save progress before sending details for review.
        </p>

        <div className="pt-4">
          <button
            onClick={() => onNavigate(parentCtaRoute as AppRoute)}
            className="bg-[#C59B27] hover:bg-[#B89047] text-white font-bold py-4 px-10 rounded-xl text-sm shadow-md transition-all uppercase tracking-wider inline-flex items-center space-x-2 cursor-pointer"
          >
            <span>Begin Parent Access</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* 8. Footer (Stitch Footer) */}
      <footer id="footer" className="bg-[#FAF9F6] border-t border-[#EAE8E1] py-14 px-4 sm:px-6 lg:px-8 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 text-xs text-[#6B7280]">
          {/* Brand */}
          <BrandLogo
            context="compact"
            onClick={() => onNavigate('/')}
            className="flex items-center space-x-3 cursor-pointer"
          />

          {/* Links */}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 font-medium">
            <span className="hover:text-[#18181B] cursor-pointer">Privacy Policy</span>
            <span className="hover:text-[#18181B] cursor-pointer">Terms of Service</span>
            <span className="hover:text-[#18181B] cursor-pointer">Child Safety Policy</span>
            <span className="hover:text-[#18181B] cursor-pointer">Contact Us</span>
          </div>

          {/* Copyright */}
          <div>
            <p>&copy; 2025 Koinonia Children &amp; Teens. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
