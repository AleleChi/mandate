import React, { useState, useEffect } from 'react';
import { X, ArrowRight, Mail } from 'lucide-react';
import { AppRoute } from '../types';
import { api } from '../services/api';
import { Seo } from '../components/common/Seo';
import { REAL_ASSETS } from '../config/assets';

// Event-Led Landing Components
import { PublicHeader } from '../components/landing/PublicHeader';
import { LandingHero } from '../components/landing/LandingHero';
import { EditorialStatement } from '../components/landing/EditorialStatement';
import { ChildJourney } from '../components/landing/ChildJourney';
import { SafetyStory } from '../components/landing/SafetyStory';
import { AgeGroups } from '../components/landing/AgeGroups';
import { MomentsGallery } from '../components/landing/MomentsGallery';
import { CurrentEventSection } from '../components/landing/CurrentEventSection';
import { LandingVideoSection } from '../components/landing/LandingVideoSection';
import { LandingFAQ } from '../components/landing/LandingFAQ';
import { LandingFinalCTA } from '../components/landing/LandingFinalCTA';
import { PublicFooter } from '../components/landing/PublicFooter';

export interface LandingPageProps {
  onNavigate: (route: AppRoute) => void;
  isMobileLandingView?: boolean;
  onToggleMobileView?: (mobile: boolean) => void;
  parentCtaRoute?: string;
  volunteerCtaRoute?: string;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  parentCtaRoute = '/parent/create-account',
  volunteerCtaRoute = '/volunteer/sign-in',
}) => {
  const [loaded, setLoaded] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [assets, setAssets] = useState<any>({
    ...REAL_ASSETS,
    site_logo: (typeof window !== 'undefined' && (window as any)._site_logo) || '',
  });
  const [landingSettings, setLandingSettings] = useState<Record<string, string>>({});
  const [currentEvent, setCurrentEvent] = useState<any>(null);
  const [regStatus, setRegStatus] = useState<any>(null);

  // Registration state modal dialog
  const [infoModal, setInfoModal] = useState<{
    isOpen: boolean;
    type: 'parent' | 'volunteer';
    title: string;
    message: string;
    note?: string;
    signInRoute: AppRoute;
    signInLabel: string;
  } | null>(null);

  // 1. Fetch live registration status
  useEffect(() => {
    api.auth.getRegistrationStatus()
      .then((res) => {
        if (res && res.success) {
          setRegStatus(res);
        }
      })
      .catch((err) => {
        console.error('Failed to load registration status', err);
      });
  }, []);

  // 2. Fetch live public event data & dynamic settings
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoaded(true);
    }, 60);

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);

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
              experiencePickup: s.experiencePickup || REAL_ASSETS.experiencePickup || '',
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
              },
            });
            if (s.site_logo && typeof window !== 'undefined') {
              (window as any)._site_logo = s.site_logo;
            }
          }
        }
      } catch (err) {
        console.error('Error fetching landing page data:', err);
      }
    };

    fetchLandingData();

    return () => {
      clearTimeout(timer);
      mediaQuery.removeEventListener('change', listener);
    };
  }, []);

  // Handler: Parent registration click with live closed/open state check
  const handleParentRegisterClick = () => {
    if (regStatus && !regStatus.parent?.isOpen) {
      const isNotOpen = regStatus.parent?.state === 'not_open_yet';
      const eventName = regStatus.eventName || currentEvent?.title || 'The General Assembly';

      setInfoModal({
        isOpen: true,
        type: 'parent',
        title: isNotOpen ? 'Registration is not open yet' : 'Registration has closed',
        message: isNotOpen
          ? `Registration for ${eventName} has not started yet.${
              regStatus.parent?.opensAtFormatted
                ? ` Registration opens ${regStatus.parent.opensAtFormatted}.`
                : ''
            }`
          : `Registration for ${eventName} is no longer accepting new applications.`,
        note: 'Already registered?\nYou can still sign in to access your child details and event passes.',
        signInRoute: '/parent/sign-in',
        signInLabel: 'Sign in to account',
      });
      return;
    }
    onNavigate(parentCtaRoute as AppRoute);
  };

  // Handler: Volunteer registration click with live closed/open state check
  const handleVolunteerRegisterClick = () => {
    if (regStatus && !regStatus.volunteer?.isOpen) {
      const isNotOpen = regStatus.volunteer?.state === 'not_open_yet';
      const eventName = regStatus.eventName || currentEvent?.title || 'The General Assembly';

      setInfoModal({
        isOpen: true,
        type: 'volunteer',
        title: isNotOpen ? 'Volunteer registration not open yet' : 'Volunteer registration closed',
        message: isNotOpen
          ? `Volunteer applications for ${eventName} have not started yet.${
              regStatus.volunteer?.opensAtFormatted
                ? ` Applications open ${regStatus.volunteer.opensAtFormatted}.`
                : ''
            }`
          : `Volunteer registration for ${eventName} is currently closed.`,
        note: 'Already registered as a volunteer?\nYou can sign in to access your dashboard.',
        signInRoute: '/volunteer/sign-in',
        signInLabel: 'Volunteer sign in',
      });
      return;
    }
    onNavigate(volunteerCtaRoute as AppRoute);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const isRegistrationClosed = Boolean(regStatus && !regStatus.parent?.isOpen);

  // SEO Configurations
  const siteUrl =
    import.meta.env.VITE_PUBLIC_SITE_URL ||
    (typeof window !== 'undefined'
      ? window.location.origin
      : 'https://themandate.dontechservicesconst.com');
  const eventTitle = currentEvent?.title || regStatus?.eventName || 'The General Assembly';
  const seoTitle = `${eventTitle} | Koinonia Children & Teens Registration`;
  const seoDescription =
    `Register your child for ${eventTitle}. Safe check-in, attendance tracking, and verified pickup for Koinonia Children and Teens.`;
  const seoImage = assets.heroMain || REAL_ASSETS.heroMain || `${siteUrl}/social_share.jpg`;

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: eventTitle,
      startDate: currentEvent?.starts_at || undefined,
      endDate: currentEvent?.ends_at || undefined,
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      location: {
        '@type': 'Place',
        name: currentEvent?.location || 'Koinonia Main Auditorium',
      },
      organizer: {
        '@type': 'Organization',
        name: 'Koinonia Children and Teens',
        url: siteUrl,
      },
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#18181B] font-sans flex flex-col selection:bg-[#C59B27]/25 overflow-x-clip">
      <Seo
        title={seoTitle}
        description={seoDescription}
        canonical={`${siteUrl}/`}
        robots="index, follow"
        ogTitle={seoTitle}
        ogDescription={seoDescription}
        ogImage={seoImage}
        ogType="website"
        twitterCard="summary_large_image"
        structuredData={structuredData}
      />

      {/* 1. Header: Event-Led Navigation */}
      <PublicHeader
        onNavigate={onNavigate}
        onParentRegisterClick={handleParentRegisterClick}
        scrollToSection={scrollToSection}
      />

      {/* Target Rhythm: Event-First, Natural Copy, Real Motion, No Fabricated Content */}
      <main className="w-full flex flex-col flex-1">
        {/* 2. Event-Led Hero: Prominently leads with current event, dates, theme & real motion */}
        <LandingHero
          loaded={loaded}
          prefersReducedMotion={prefersReducedMotion}
          assets={assets}
          currentEvent={currentEvent}
          regStatus={regStatus}
          onParentRegisterClick={handleParentRegisterClick}
          onVolunteerRegisterClick={handleVolunteerRegisterClick}
          onNavigate={onNavigate}
        />

        {/* 3. Short Factual Introduction: Plain English, no generic stat cards */}
        <EditorialStatement backgroundImage={assets.experiencePickup} />

        {/* 4. The Journey: From registration to pickup (Real 5-step sequence with motion) */}
        <ChildJourney
          onRegisterClick={handleParentRegisterClick}
          onNavigate={onNavigate}
        />

        {/* 5. Child Safety & Care: Dark editorial mood with real verified mechanisms */}
        <SafetyStory
          customImage={assets.safetySection}
          onNavigate={onNavigate}
        />

        {/* 6. Programme Age Groups: Canonical current-event divisions */}
        <AgeGroups ageGroups={currentEvent?.ageGroups} />

        {/* 7. Moments: Large 3D Real-Image Experience (70–80vh visual presence) */}
        <MomentsGallery />

        {/* 8. Live Event Details & Video Presentation */}
        <CurrentEventSection
          event={currentEvent}
          regStatus={regStatus}
        />

        <LandingVideoSection
          videoUrl={assets.heroVideo || assets.gallery?.eventVideo}
          posterUrl={assets.heroVideoPoster || assets.heroMain || assets.heroUpper}
        />

        {/* 9. FAQ: Retained visual excellence with strictly factual copy */}
        <LandingFAQ
          onNavigate={onNavigate}
          prefersReducedMotion={prefersReducedMotion}
        />

        {/* 10. Event-Specific Final CTA */}
        <LandingFinalCTA
          currentEvent={currentEvent}
          regStatus={regStatus}
          onParentRegisterClick={handleParentRegisterClick}
          onVolunteerRegisterClick={handleVolunteerRegisterClick}
          onNavigate={onNavigate}
          isRegistrationClosed={isRegistrationClosed}
        />
      </main>

      {/* 11. Simple Institutional Footer */}
      <PublicFooter
        onNavigate={onNavigate}
        onParentRegisterClick={handleParentRegisterClick}
        landingSettings={landingSettings}
        currentEvent={currentEvent}
        scrollToSection={scrollToSection}
      />

      {/* Mobile Sticky Quick Action Bar */}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FAF9F6]/95 backdrop-blur-md border-t border-[#EAE8E1] p-3 px-4 flex items-center space-x-3 shadow-2xl"
        data-component-version="landing-mobile-bottom-bar-v4"
      >
        <button
          type="button"
          onClick={handleParentRegisterClick}
          className="flex-1 bg-[#C59B27] hover:bg-[#B89047] active:bg-[#AA8220] text-white font-semibold py-3 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer"
        >
          <span>{isRegistrationClosed ? 'Sign in to account' : 'Register child'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => scrollToSection('footer')}
          className="bg-white hover:bg-[#FAF6EB] text-[#262626] border border-[#D9D6CE] font-semibold py-3 px-4 rounded-xl text-xs flex items-center justify-center space-x-1.5 shrink-0 cursor-pointer"
        >
          <Mail className="w-3.5 h-3.5 text-[#71717A]" />
          <span>CONTACT</span>
        </button>
      </div>

      {/* Registration Status Info Modal */}
      {infoModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-[#EAE8E1] space-y-5 text-left relative">
            <button
              type="button"
              onClick={() => setInfoModal(null)}
              className="absolute top-5 right-5 p-2 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100 transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2">
              <span className="text-[10px] sm:text-[11px] font-bold text-[#9A7326] tracking-widest uppercase block font-sans">
                Registration Notice
              </span>
              <h3
                id="modal-title"
                className="text-xl sm:text-2xl font-sans font-bold text-[#18181B] leading-tight"
              >
                {infoModal.title}
              </h3>
              <p className="text-xs sm:text-sm text-[#52525B] leading-relaxed">
                {infoModal.message}
              </p>
            </div>

            {infoModal.note && (
              <div className="bg-[#FAF8F3] border border-[#E5D5AE]/80 rounded-2xl p-4 text-xs space-y-1">
                <p className="font-bold text-zinc-900 font-sans text-sm">
                  Already registered?
                </p>
                <p className="text-zinc-600 leading-relaxed whitespace-pre-line">
                  {infoModal.note}
                </p>
              </div>
            )}

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
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
                type="button"
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
