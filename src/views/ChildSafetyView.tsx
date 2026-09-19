import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowUp } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { Seo } from '../components/common/Seo';
import { PublicFooter } from '../components/landing/PublicFooter';
import { api } from '../services/api';
import { AppRoute } from '../../src/types';
import { OFFICIAL_PUBLIC_CONTACT_EMAIL } from '../constants/contact';

interface ChildSafetyViewProps {
  onNavigate: (route: string) => void;
}

export const ChildSafetyView: React.FC<ChildSafetyViewProps> = ({ onNavigate }) => {
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

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between antialiased">
      <Seo
        title="Child Safety | Koinonia Children and Teens"
        description="How check-in, care information, supervision ratios, and pickup verification are handled during Koinonia events."
        canonical="https://koinonia12.netlify.app/#/child-safety"
        robots="index, follow"
        ogTitle="Child Safety | Koinonia Children and Teens"
        ogDescription="Clear operational guidance on how children are registered, protected, supervised, and safely released."
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

      {/* Main Content: PiggyVest Security Inspired Open Editorial Guide */}
      <main className="max-w-[760px] mx-auto w-full px-6 sm:px-8 py-14 sm:py-20 lg:py-24 flex-grow text-left">
        {/* Guide Header */}
        <div className="mb-12 sm:mb-16">
          <p className="text-xs font-mono font-medium tracking-widest text-[#9A7326] uppercase mb-3">
            Koinonia Children &amp; Teens
          </p>
          <h1 className="text-3xl sm:text-5xl lg:text-[3.5rem] font-serif-koinonia font-normal text-stone-900 tracking-tight leading-[1.1] mb-6">
            Child Safety
          </h1>

          <p className="text-lg sm:text-xl text-stone-800 font-serif-koinonia leading-relaxed mb-4">
            How check-in, care information and pickup are handled during the Children &amp; Teens programme.
          </p>

          <p className="text-base sm:text-[17px] text-stone-600 leading-[1.75] pb-8 border-b border-[#EAE8E1]">
            When your child joins us for Children&apos;s Session, our team works within clear, established procedures to ensure they are welcomed warmly, supervised carefully, and released only to the people you have authorized. Here is what to expect from registration to pickup.
          </p>
        </div>

        {/* Editorial Sections */}
        <div className="space-y-14 sm:space-y-16">
          {/* 01 BEFORE THE EVENT */}
          <article className="space-y-5 text-left">
            <div className="space-y-1">
              <span className="font-serif-koinonia text-2xl sm:text-3xl text-[#9A7326] font-normal block">
                01
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif-koinonia font-normal text-stone-900 tracking-tight">
                Before the event
              </h2>
            </div>

            <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
              <p>
                Safeguarding begins well before you arrive at the venue. Through the parent portal, you provide the essential information our team needs to prepare for your child:
              </p>

              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="font-semibold text-stone-900">Parent identity &amp; headshot:</strong> Parents complete a verified profile with a clear facial photo so coordinators can confirm your identity at pickup.
                </li>
                <li>
                  <strong className="font-semibold text-stone-900">Care &amp; medical declarations:</strong> You declare any asthma or respiratory needs, food or environmental allergies, and special physical requirements. These are securely accessible only to the first-aid and care personnel on duty.
                </li>
                <li>
                  <strong className="font-semibold text-stone-900">Designated backup pickup:</strong> If someone other than yourself will collect your child, you register their name, phone number, and photo before the service starts.
                </li>
              </ul>

              <p className="text-sm text-stone-500 pt-1">
                Age accuracy ensures your child is assigned to the right age cohort hall with peers and age-appropriate teacher ratios.
              </p>
            </div>
          </article>

          {/* 02 ARRIVAL AND CHECK-IN */}
          <article className="pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
            <div className="space-y-1">
              <span className="font-serif-koinonia text-2xl sm:text-3xl text-[#9A7326] font-normal block">
                02
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif-koinonia font-normal text-stone-900 tracking-tight">
                Arrival and check-in
              </h2>
            </div>

            <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
              <p>
                Check-in takes place at the Children &amp; Teens Pavilion welcome concourse:
              </p>

              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="font-semibold text-stone-900">Digital pass scan:</strong> Each child is admitted by scanning their individual pass barcode or QR code. Entry records synchronize to the live operations dashboard in real-time.
                </li>
                <li>
                  <strong className="font-semibold text-stone-900">Immediate attendance record:</strong> The moment a pass is scanned, your child&apos;s status shifts to &quot;Checked In&quot; and their hall location is established.
                </li>
                <li>
                  <strong className="font-semibold text-stone-900">Physical wristbands &amp; identifiers:</strong> Children receive cohort identifiers linked directly to their system record to ensure seamless room movement.
                </li>
              </ul>
            </div>
          </article>

          {/* 03 DURING THE PROGRAMME */}
          <article className="pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
            <div className="space-y-1">
              <span className="font-serif-koinonia text-2xl sm:text-3xl text-[#9A7326] font-normal block">
                03
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif-koinonia font-normal text-stone-900 tracking-tight">
                During the programme
              </h2>
            </div>

            <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
              <p>
                While inside their classrooms and activity halls, children are under continuous adult supervision following established operational practices:
              </p>

              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="font-semibold text-stone-900">Vetted volunteer team:</strong> Every volunteer, teacher, and steward completes criminal background vetting, identity verification, and safeguarding orientation before serving.
                </li>
                <li>
                  <strong className="font-semibold text-stone-900">Supervision ratios:</strong>
                  <ul className="mt-1 space-y-1 pl-4 list-circle text-stone-600">
                    <li>Crèche &amp; Under-3s: 1 supervisor per 4 children</li>
                    <li>Ages 4 to 9: 1 supervisor per 8 children</li>
                    <li>Teens (Ages 10+): Monitored by designated mentors and senior stewards</li>
                  </ul>
                </li>
                <li>
                  <strong className="font-semibold text-stone-900">Capacity thresholds:</strong> Hall occupancy limits are tracked dynamically on the operations console to prevent overcrowding and maintain clear exit lanes.
                </li>
              </ul>
            </div>
          </article>

          {/* 04 PICKUP VERIFICATION */}
          <article className="pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
            <div className="space-y-1">
              <span className="font-serif-koinonia text-2xl sm:text-3xl text-[#9A7326] font-normal block">
                04
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif-koinonia font-normal text-stone-900 tracking-tight">
                Pickup verification
              </h2>
            </div>

            <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
              <p>
                Our pickup process is designed to eliminate uncertainty and ensure no child leaves with an unauthorized individual:
              </p>

              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="font-semibold text-stone-900">Exclusive guardian release:</strong> A child is released only to the parent who registered them or the designated secondary contact registered on their active pass.
                </li>
                <li>
                  <strong className="font-semibold text-stone-900">Photo-terminal confirmation:</strong> The coordinator checks the collecting adult against the photo on file. If the person at the counter does not match the registered record, the child remains securely in the hall.
                </li>
                <li>
                  <strong className="font-semibold text-stone-900">Zero unofficial overrides:</strong> Phone calls, text messages, and paper notes cannot bypass this check. Any exception requires physical clearance at the central Protocol Desk.
                </li>
              </ul>
            </div>
          </article>

          {/* 05 IF SOMETHING NEEDS ATTENTION */}
          <article className="pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
            <div className="space-y-1">
              <span className="font-serif-koinonia text-2xl sm:text-3xl text-[#9A7326] font-normal block">
                05
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif-koinonia font-normal text-stone-900 tracking-tight">
                If something needs attention
              </h2>
            </div>

            <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
              <p>
                In the event of distress, an unexpected health reaction, or an accident:
              </p>

              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="font-semibold text-stone-900">Immediate first-aid support:</strong> Stationed medical volunteers step in immediately and review the child&apos;s registered health declarations.
                </li>
                <li>
                  <strong className="font-semibold text-stone-900">Multi-tier escalation protocol:</strong> Our system dispatches automated priority notifications directly to parents via phone, SMS, and WhatsApp.
                </li>
                <li>
                  <strong className="font-semibold text-stone-900">Documented incident records:</strong> All interventions are recorded in an incident log for transparent review and follow-up.
                </li>
              </ul>
            </div>
          </article>

          {/* 06 QUESTIONS OR CONCERNS */}
          <article className="pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
            <div className="space-y-1">
              <span className="font-serif-koinonia text-2xl sm:text-3xl text-[#9A7326] font-normal block">
                06
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif-koinonia font-normal text-stone-900 tracking-tight">
                Questions or concerns
              </h2>
            </div>

            <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
              <p>
                Have questions regarding your child&apos;s hall placement, special care requirements, or pickup arrangements? Contact our team:
              </p>

              <div className="pt-2 space-y-1.5 text-stone-700">
                <p className="font-semibold text-stone-900">
                  The Koinonia General Assembly
                </p>
                <p>
                  Email:{' '}
                  <a href={`mailto:${OFFICIAL_PUBLIC_CONTACT_EMAIL}`} className="text-stone-900 underline underline-offset-4 hover:text-[#9A7326] transition-colors">
                    {OFFICIAL_PUBLIC_CONTACT_EMAIL}
                  </a>
                </p>
              </div>
            </div>
          </article>
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

export default ChildSafetyView;
