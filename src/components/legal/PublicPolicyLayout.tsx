import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowUp } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';
import { PublicFooter } from '../landing/PublicFooter';
import { api } from '../../services/api';
import { AppRoute } from '../../types';

export interface PolicyTocItem {
  id: string;
  number: string;
  title: string;
  targetId: string;
}

export interface PublicPolicyLayoutProps {
  title: string;
  subtitle: string;
  lastUpdated: string;
  tocItems: PolicyTocItem[];
  onNavigate: (route: string) => void;
  children: React.ReactNode;
  categoryLabel?: string;
}

export const PublicPolicyLayout: React.FC<PublicPolicyLayoutProps> = ({
  title,
  subtitle,
  lastUpdated,
  tocItems,
  onNavigate,
  children,
  categoryLabel = 'Koinonia Children & Teens',
}) => {
  const [activeSection, setActiveSection] = useState<string>(tocItems[0]?.targetId || '');

  // Dynamic public page settings for shared footer
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

  // IntersectionObserver to update active TOC section and hash
  useEffect(() => {
    if (tocItems.length === 0) return;

    const elements = tocItems
      .map((item) => document.getElementById(item.targetId))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter((entry) => entry.isIntersecting);
        if (intersecting.length > 0) {
          const topEntry = intersecting.reduce((prev, curr) => {
            return prev.boundingClientRect.top > curr.boundingClientRect.top ? prev : curr;
          });
          if (topEntry.target.id) {
            setActiveSection(topEntry.target.id);
            if (window.history && window.history.replaceState) {
              const currentPath = window.location.hash.split('#')[1] || '';
              const baseRoute = currentPath.split('#')[0] || window.location.pathname;
              window.history.replaceState(null, '', `#${baseRoute}#${topEntry.target.id}`);
            }
          }
        }
      },
      {
        rootMargin: '-15% 0px -60% 0px',
        threshold: 0.05,
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [tocItems]);

  const scrollToTarget = (targetId: string) => {
    const element = document.getElementById(targetId);
    if (element) {
      const yOffset = -80;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
      setActiveSection(targetId);

      if (window.history && window.history.replaceState) {
        const currentPath = window.location.hash.split('#')[1] || '';
        const baseRoute = currentPath.split('#')[0] || window.location.pathname;
        window.history.replaceState(null, '', `#${baseRoute}#${targetId}`);
      }
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between antialiased">
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

      {/* Main Typeset Document Container: PiggyVest-Style Central Column */}
      <main className="max-w-[760px] mx-auto w-full px-6 sm:px-8 py-14 sm:py-20 lg:py-24 flex-grow text-left">
        {/* Document Header */}
        <div id="intro" className="mb-10 sm:mb-14">
          <p className="text-xs font-mono font-medium tracking-widest text-[#9A7326] uppercase mb-3">
            {categoryLabel}
          </p>
          <h1 className="text-3xl sm:text-5xl lg:text-[3.5rem] font-serif-koinonia font-normal text-stone-900 tracking-tight leading-[1.1] mb-6">
            {title}
          </h1>

          <p className="text-base sm:text-lg text-stone-600 leading-[1.75] mb-6">
            {subtitle}
          </p>

          <div className="text-xs font-mono text-stone-500 uppercase tracking-wider pb-6 border-b border-[#EAE8E1]">
            Last updated: {lastUpdated}
          </div>
        </div>

        {/* Compact "On this page" disclosure if TOC exists */}
        {tocItems.length > 0 && (
          <details className="mb-12 py-3 px-4 bg-white border border-[#EAE8E1] rounded-lg group cursor-pointer">
            <summary className="text-xs font-semibold uppercase tracking-wider text-stone-600 hover:text-stone-900 flex items-center justify-between list-none">
              <span>On this page ({tocItems.length} sections)</span>
              <span className="text-stone-400 group-open:rotate-180 transition-transform text-xs">▼</span>
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 pt-4 mt-2 border-t border-[#EAE8E1]/70">
              {tocItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToTarget(item.targetId)}
                  className="text-left text-xs text-stone-600 hover:text-[#9A7326] transition-colors py-1 flex items-baseline gap-2 cursor-pointer"
                >
                  <span className="font-mono text-[11px] text-stone-400 shrink-0">{item.number.padStart(2, '0')}.</span>
                  <span className="leading-snug">{item.title}</span>
                </button>
              ))}
            </div>
          </details>
        )}

        {/* Document Content: Clean, Open Spacing */}
        <div className="space-y-14 sm:space-y-16">
          {children}
        </div>

        {/* Document Footer Link */}
        <div className="mt-16 pt-8 border-t border-[#EAE8E1] flex items-center justify-between text-xs text-stone-500">
          <span>The Koinonia General Assembly</span>
          <button
            type="button"
            onClick={scrollToTop}
            className="hover:text-stone-900 transition-colors inline-flex items-center gap-1 cursor-pointer font-medium"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span>Back to top</span>
          </button>
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
