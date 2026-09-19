import React from 'react';
import { BrandLogo } from '../common/BrandLogo';
import { AppRoute } from '../../types';
import { OFFICIAL_PUBLIC_CONTACT_EMAIL } from '../../constants/contact';

export interface PublicFooterProps {
  onNavigate: (route: AppRoute) => void;
  onParentRegisterClick: () => void;
  landingSettings: Record<string, string>;
  currentEvent?: any;
  scrollToSection: (id: string) => void;
}

function formatEventDates(startsAt?: string | null, endsAt?: string | null): string | null {
  if (!startsAt || startsAt.trim() === '') return null;
  const s = new Date(startsAt);
  if (isNaN(s.getTime())) return startsAt.trim();

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const sDay = s.getDate();
  const sMonth = months[s.getMonth()];
  const sYear = s.getFullYear();

  if (!endsAt || endsAt.trim() === '') {
    return `${sDay} ${sMonth} ${sYear}`;
  }

  const e = new Date(endsAt);
  if (isNaN(e.getTime())) {
    return `${sDay} ${sMonth} ${sYear}`;
  }

  const eDay = e.getDate();
  const eMonth = months[e.getMonth()];
  const eYear = e.getFullYear();

  if (sYear === eYear && sMonth === eMonth) {
    return sDay === eDay ? `${sDay} ${sMonth} ${sYear}` : `${sDay}–${eDay} ${sMonth} ${sYear}`;
  }

  return `${sDay} ${sMonth} – ${eDay} ${eMonth} ${sYear}`;
}

export const PublicFooter: React.FC<PublicFooterProps> = ({
  onNavigate,
  onParentRegisterClick,
  landingSettings,
  currentEvent,
  scrollToSection,
}) => {
  const footerYear = landingSettings.footerYear || String(new Date().getFullYear());
  const footerCopyrightName = landingSettings.footerCopyrightName || 'The Koinonia General Assembly';

  const eventTitle = currentEvent?.title?.trim() || 'The General Assembly';
  const eventDates = formatEventDates(currentEvent?.starts_at, currentEvent?.ends_at);

  return (
    <footer
      id="footer"
      aria-label="Event Portal Footer"
      className="bg-[#FAF9F6] border-t border-[#EAE8E1] pt-14 pb-12 px-4 sm:px-6 lg:px-8 mt-auto text-left"
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8 pb-12 border-b border-[#EAE8E1]">
          {/* Column 1: Ministry / Event Identifier */}
          <div className="space-y-3">
            <BrandLogo
              context="compact"
              onClick={() => onNavigate('/')}
              onDoubleClick={() => onNavigate('/admin/sign-in')}
              className="flex items-center space-x-3 cursor-pointer"
              title="Koinonia Children & Teens"
            />
            {/* Understated Event Reference */}
            <div className="pt-1.5 space-y-0.5">
              <p className="text-sm font-semibold text-stone-900 font-serif-koinonia tracking-tight">
                {eventTitle}
              </p>
              {eventDates && (
                <p className="text-xs text-stone-500 font-medium">
                  {eventDates}
                </p>
              )}
            </div>
            <p className="text-xs text-stone-600 leading-relaxed max-w-xs font-normal pt-0.5">
              Children &amp; Teens registration and event access.
            </p>
          </div>

          {/* Column 2: Current event / participation */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-stone-900 uppercase tracking-wider font-sans">
              Participation
            </h4>
            <ul className="space-y-2.5 text-xs text-stone-600">
              <li>
                <button
                  type="button"
                  onClick={onParentRegisterClick}
                  className="hover:text-stone-950 transition-colors cursor-pointer text-left font-medium text-[#9A7326]"
                >
                  Register your child
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/parent/sign-in')}
                  className="hover:text-stone-950 transition-colors cursor-pointer text-left"
                >
                  Parent sign in
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/volunteer/sign-in')}
                  className="hover:text-stone-950 transition-colors cursor-pointer text-left"
                >
                  Volunteer sign in
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Useful information */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-stone-900 uppercase tracking-wider font-sans">
              Information
            </h4>
            <ul className="space-y-2.5 text-xs text-stone-600">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/child-safety')}
                  className="hover:text-stone-950 transition-colors cursor-pointer text-left"
                >
                  Child Safety
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/privacy')}
                  className="hover:text-stone-950 transition-colors cursor-pointer text-left"
                >
                  Privacy Notice
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/terms')}
                  className="hover:text-stone-950 transition-colors cursor-pointer text-left"
                >
                  Terms of Service
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    if (window.location.hash.startsWith('#/') && window.location.hash !== '#/') {
                      onNavigate('/');
                      setTimeout(() => scrollToSection('faq'), 150);
                    } else {
                      scrollToSection('faq');
                    }
                  }}
                  className="hover:text-stone-950 transition-colors cursor-pointer text-left"
                >
                  Questions &amp; Answers
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Contact (Official Email Only) */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-stone-900 uppercase tracking-wider font-sans">
              Contact
            </h4>
            <div className="space-y-0.5 text-xs text-stone-600">
              <span className="text-stone-400 block text-[11px] font-medium uppercase tracking-wide">Email</span>
              <a
                href={`mailto:${OFFICIAL_PUBLIC_CONTACT_EMAIL}`}
                className="text-stone-700 hover:text-[#9A7326] underline underline-offset-2 transition-colors block break-all"
              >
                {OFFICIAL_PUBLIC_CONTACT_EMAIL}
              </a>
            </div>
          </div>
        </div>

        {/* Bottom line: © [YEAR] [canonical organisation name] · Legal Links */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
          <p>
            &copy; {footerYear} {footerCopyrightName}. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-6 font-medium">
            <button
              type="button"
              onClick={() => onNavigate('/privacy')}
              className="hover:text-stone-950 cursor-pointer transition-colors"
            >
              Privacy Notice
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/child-safety')}
              className="hover:text-stone-950 cursor-pointer transition-colors"
            >
              Child Safety
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/terms')}
              className="hover:text-stone-950 cursor-pointer transition-colors"
            >
              Terms of Service
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/contact')}
              className="hover:text-stone-950 cursor-pointer transition-colors"
            >
              Contact Us
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
