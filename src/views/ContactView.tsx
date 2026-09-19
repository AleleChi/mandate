import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { Seo } from '../components/common/Seo';
import { PublicFooter } from '../components/landing/PublicFooter';
import { api } from '../services/api';
import { AppRoute } from '../../src/types';
import { OFFICIAL_PUBLIC_CONTACT_EMAIL } from '../constants/contact';

interface ContactViewProps {
  onNavigate: (route: string) => void;
}

export const ContactView: React.FC<ContactViewProps> = ({ onNavigate }) => {
  const [landingSettings, setLandingSettings] = useState<Record<string, string>>({});
  const [currentEvent, setCurrentEvent] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    api.landing.getPublicPage().then((res) => {
      if (isMounted && res && res.success) {
        if (res.settings) setLandingSettings(res.settings);
        if (res.currentEvent) setCurrentEvent(res.currentEvent);
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between antialiased">
      <Seo
        title="Contact Us | Koinonia Children and Teens"
        description="Contact information and support for The Koinonia General Assembly Children & Teens event portal."
        canonical="https://koinonia12.netlify.app/#/contact"
        robots="index, follow"
        ogTitle="Contact Us | Koinonia Children and Teens"
        ogDescription="Questions about registration or the Children & Teens programme can be sent to our official contact email."
      />

      {/* Restrained Public Header */}
      <header className="sticky top-0 z-40 bg-[#FAF9F6]/95 backdrop-blur-sm border-b border-[#EAE8E1] px-6 sm:px-8 lg:px-12 py-3.5 transition-all">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <BrandLogo
            context="compact"
            onClick={() => onNavigate('/')}
            onDoubleClick={() => onNavigate('/admin/sign-in')}
            className="cursor-pointer"
            title="Koinonia Children & Teens"
          />

          <div className="flex items-center space-x-6">
            <button
              type="button"
              onClick={() => onNavigate('/parent/sign-in')}
              className="text-xs font-medium text-stone-600 hover:text-stone-950 transition-colors cursor-pointer"
            >
              Parent sign in
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="group inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-950 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-0.5 text-stone-400 group-hover:text-stone-700" />
              <span>Back to event</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content: Official Email Only */}
      <main className="max-w-[760px] mx-auto w-full px-6 sm:px-8 py-16 sm:py-24 flex-grow text-left">
        <div className="space-y-6">
          <p className="text-xs font-sans font-bold tracking-[0.12em] text-[#9A7326] uppercase">
            Koinonia Children &amp; Teens
          </p>
          <h1 className="text-3xl sm:text-5xl lg:text-[3.5rem] font-serif-koinonia font-normal text-stone-900 tracking-tight leading-[1.1]">
            Contact Us
          </h1>

          <p className="text-base sm:text-lg text-stone-600 leading-[1.75] pt-2 font-sans">
            Questions about registration or the Children &amp; Teens programme can be sent to:
          </p>

          <div className="pt-2">
            <a
              href={`mailto:${OFFICIAL_PUBLIC_CONTACT_EMAIL}`}
              className="text-xl sm:text-2xl font-sans font-medium text-stone-900 hover:text-[#9A7326] underline underline-offset-4 transition-colors"
            >
              {OFFICIAL_PUBLIC_CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </main>

      {/* Shared Public Footer */}
      <PublicFooter
        onNavigate={(route: AppRoute) => onNavigate(route)}
        onParentRegisterClick={() => onNavigate('/parent/create-account')}
        landingSettings={landingSettings}
        currentEvent={currentEvent}
        scrollToSection={(id: string) => {
          onNavigate('/');
          setTimeout(() => {
            const el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }, 150);
        }}
      />
    </div>
  );
};

export default ContactView;
