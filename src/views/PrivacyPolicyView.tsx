import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowUp } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { Seo } from '../components/common/Seo';

interface PrivacyPolicyViewProps {
  onNavigate: (route: string) => void;
}

interface TocItem {
  id: string;
  number: string;
  title: string;
  targetId: string;
}

const TOC_ITEMS: TocItem[] = [
  { id: 'toc-1', number: '1', title: 'What information do we collect?', targetId: 'section-1' },
  { id: 'toc-2', number: '2', title: 'How do we process your information?', targetId: 'section-2' },
  { id: 'toc-3', number: '3', title: 'When and with whom do we share personal information?', targetId: 'section-3' },
  { id: 'toc-4', number: '4', title: 'Do we use cookies and other tracking technologies?', targetId: 'section-4' },
  { id: 'toc-5', number: '5', title: 'How long do we keep your information?', targetId: 'section-5' },
  { id: 'toc-6', number: '6', title: 'How do we keep your information safe?', targetId: 'section-6' },
  { id: 'toc-7', number: '7', title: "Our approach to children's personal information", targetId: 'section-7' },
  { id: 'toc-8', number: '8', title: 'What are your privacy rights?', targetId: 'section-8' },
  { id: 'toc-9', number: '9', title: 'Controls for do-not-track features', targetId: 'section-9' },
  { id: 'toc-10', number: '10', title: 'Do we make updates to this notice?', targetId: 'section-10' },
  { id: 'toc-11', number: '11', title: 'How can you contact us about this notice?', targetId: 'section-11' },
  { id: 'toc-12', number: '12', title: 'How can you review, update, or delete the data we collect from you?', targetId: 'section-8' },
];

interface KeyPoint {
  number: string;
  question: string;
  answer: string;
  sectionLinkText?: string;
  sectionTargetId?: string;
}

const KEY_POINTS: KeyPoint[] = [
  {
    number: '01',
    question: 'What personal information do we process?',
    answer: "When a parent or guardian registers a child for Children's Session, or uses our web application, we may process the child's name, age, health/allergy information, and the parent/guardian's contact and address details.",
    sectionLinkText: 'Learn more in Section 1.',
    sectionTargetId: 'section-1'
  },
  {
    number: '02',
    question: 'Do we process sensitive personal information?',
    answer: "Yes — with your explicit consent, we process your child's health information (e.g., allergies, medical conditions) where necessary to keep them safe during the programme.",
    sectionLinkText: 'Learn more in Section 1.',
    sectionTargetId: 'section-1'
  },
  {
    number: '03',
    question: 'Do we collect information from third parties?',
    answer: 'No, we do not collect information about you or your child from third parties.'
  },
  {
    number: '04',
    question: 'How do we process your information?',
    answer: "We process it to register and safely run Children's Session, to communicate with you, to respond to emergencies, and to comply with Nigerian law; principally the Nigeria Data Protection Act 2023 and the Child's Rights Act 2003.",
    sectionLinkText: 'Learn more in Section 2.',
    sectionTargetId: 'section-2'
  },
  {
    number: '05',
    question: 'In what situations do we share personal information, and with whom?',
    answer: 'Only with our vetted volunteers on a need-to-know basis, emergency/medical services if needed, and government authorities where the law requires it. We do not sell your information or share it for third-party advertising.',
    sectionLinkText: 'Learn more in Section 3.',
    sectionTargetId: 'section-3'
  },
  {
    number: '06',
    question: 'How do we keep your information safe?',
    answer: 'We use reasonable organisational and technical safeguards. No system is 100% secure, so we cannot guarantee against unauthorised access, but we take this seriously given the information concerns children.',
    sectionLinkText: 'Learn more in Section 6.',
    sectionTargetId: 'section-6'
  },
  {
    number: '07',
    question: "What is our approach to children's data?",
    answer: "Unlike a typical app, collecting children's information,  always through and with a parent/guardian's consent,  is the core purpose of this Service.",
    sectionLinkText: 'Learn more in Section 7.',
    sectionTargetId: 'section-7'
  },
  {
    number: '08',
    question: 'What are your rights, and how do you exercise them?',
    answer: "As a parent/guardian, you may access, correct, or ask us to delete your child's information, and withdraw consent at any time, by contacting us directly.",
    sectionLinkText: 'Learn more in Sections 8 and 12.',
    sectionTargetId: 'section-8'
  }
];

export const PrivacyPolicyView: React.FC<PrivacyPolicyViewProps> = ({ onNavigate }) => {
  const [activeSection, setActiveSection] = useState<string>('section-1');
  const [readingProgress, setReadingProgress] = useState<number>(0);
  const [showBackToTop, setShowBackToTop] = useState<boolean>(false);
  const [mobileTocOpen, setMobileTocOpen] = useState<boolean>(false);

  // Scroll listener for reading progress bar and minimal back-to-top indicator
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        const progress = Math.min(100, Math.max(0, (scrollY / docHeight) * 100));
        setReadingProgress(progress);
      }
      setShowBackToTop(scrollY > 600);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // IntersectionObserver to quietly track active TOC item
  useEffect(() => {
    const sectionIds = TOC_ITEMS.map((item) => item.targetId);
    const uniqueIds = Array.from(new Set(sectionIds));
    const elements = uniqueIds.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];

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
          }
        }
      },
      {
        rootMargin: '-15% 0px -60% 0px',
        threshold: 0.05
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollToTarget = (targetId: string) => {
    const element = document.getElementById(targetId);
    if (element) {
      const yOffset = -80;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
      setActiveSection(targetId);
      setMobileTocOpen(false);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between antialiased">
      <Seo
        title="Privacy Notice | Koinonia Children and Teens"
        description="Privacy Notice for The Koinonia General Assembly Children & Teens services and events."
        canonical="https://koinonia12.netlify.app/#/privacy"
        robots="index, follow"
        ogTitle="Privacy Notice | Koinonia Children and Teens"
        ogDescription="How we access, collect, store, and process personal information for Children's Session."
      />

      {/* Subtle Reading Progress Indicator */}
      <div
        className="fixed top-0 left-0 h-[2px] bg-[#C59B27] z-50 transition-all duration-150 ease-out"
        style={{ width: `${readingProgress}%` }}
        aria-hidden="true"
      />

      {/* Quiet, Minimal Top Bar */}
      <header className="sticky top-0 z-40 bg-[#FAF9F6]/90 backdrop-blur-sm border-b border-[#EAE8E1]/80 px-6 sm:px-8 lg:px-12 py-3.5 transition-all">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <BrandLogo
            context="compact"
            onClick={() => onNavigate('/')}
            className="cursor-pointer"
          />

          <button
            onClick={() => onNavigate('/')}
            className="group inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-0.5 text-stone-400 group-hover:text-stone-700" />
            <span>Back to Home</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto w-full px-6 sm:px-8 lg:px-12 py-12 sm:py-16 lg:py-20 flex-grow">
        {/* Editorial Document Header */}
        <div id="intro" className="max-w-[760px] mb-16 sm:mb-20">
          <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-serif-koinonia font-normal text-stone-900 tracking-tight leading-[1.15]">
            Privacy Notice
          </h1>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-stone-500 font-normal pt-3 pb-6 border-b border-[#EAE8E1]/80">
            <span>Last updated September 05, 2026</span>
            <span className="text-stone-300 select-none">/</span>
            <span>The Koinonia General Assembly</span>
          </div>

          {/* Lead Paragraph */}
          <p className="text-base sm:text-[17px] text-stone-700 leading-[1.75] pt-8">
            This Privacy Notice for <strong className="font-semibold text-stone-900">The Koinonia General Assembly</strong> (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) describes how and why we may access, collect, store, use, and/or share (&quot;process&quot;) your and your child&apos;s personal information when you use our services, including when you:
          </p>

          {/* Intro Engagement Bullets */}
          <ul className="space-y-3 pt-3 pl-1 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
            <li className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
              <span>
                Register a child for, or otherwise engage with, our children&apos;s ministry programme, in person or through our web application (<a href="https://koinonia12.netlify.app/#/" target="_blank" rel="noopener noreferrer" className="text-stone-900 underline underline-offset-4 hover:text-[#9A7326] transition-colors">https://koinonia12.netlify.app/#/</a>)
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
              <span>Engage with us in other related ways, including communications about the children&apos;s programme</span>
            </li>
          </ul>

          {/* Questions or Concerns: Restrained Editorial Callout */}
          <div className="my-8 py-3 pl-5 border-l-2 border-[#D9D6CE]">
            <p className="text-sm sm:text-base text-stone-700 leading-[1.75]">
              <strong className="font-semibold text-stone-900">Questions or concerns?</strong> Reading this Privacy Notice will help you understand your privacy rights and choices as a parent or guardian. If you do not agree with our policies and practices, please do not use our Services. If you still have questions, contact us at <a href="mailto:koinoniaabuja@gmail.com" className="text-stone-900 font-medium underline underline-offset-4 hover:text-[#9A7326] transition-colors">koinoniaabuja@gmail.com</a>.
            </p>
          </div>

          {/* A note on this Notice: Editorial Marginal Note */}
          <div className="my-8 py-3 pl-5 border-l-2 border-[#C59B27]/80 bg-[#FAF6EB]/50">
            <blockquote className="text-sm sm:text-base text-stone-800 leading-[1.75]">
              <strong className="font-semibold text-stone-900">A note on this Notice:</strong> Because our Services exist specifically to run a children&apos;s programme, the personal information we process is mostly about children under 13, always provided to us by a parent or legal guardian. Section 7 explains this directly; we do not say we &quot;don&apos;t knowingly collect data from children,&quot; because doing so, with proper parental consent, is the entire purpose of Children&apos;s Session.
            </blockquote>
          </div>
        </div>

        {/* Summary of Key Points: Editorial Scannable List */}
        <section id="summary" className="scroll-mt-24 mb-16 sm:mb-20 pt-8 border-t border-[#EAE8E1]/80">
          <div className="pb-8">
            <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight">
              SUMMARY OF KEY POINTS
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
            {KEY_POINTS.map((item) => (
              <div key={item.number} className="space-y-2 border-t border-[#EAE8E1]/60 pt-4">
                <span className="text-xs font-mono font-medium text-[#9A7326] tracking-wider block">
                  {item.number}
                </span>
                <h3 className="text-sm sm:text-[15px] font-semibold text-stone-900 leading-snug">
                  {item.question}
                </h3>
                <p className="text-sm sm:text-[15px] text-stone-600 leading-[1.7]">
                  {item.answer}
                </p>
                {item.sectionLinkText && item.sectionTargetId && (
                  <div className="pt-1">
                    <button
                      onClick={() => scrollToTarget(item.sectionTargetId!)}
                      className="group inline-flex items-center gap-1 text-xs font-medium text-[#9A7326] hover:text-[#7A5B18] transition-colors cursor-pointer"
                    >
                      <span>{item.sectionLinkText}</span>
                      <span className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Mobile & Tablet Compact TOC Disclosure */}
        <div className="lg:hidden my-10 border-y border-[#EAE8E1]">
          <button
            onClick={() => setMobileTocOpen(!mobileTocOpen)}
            className="w-full py-4 flex items-center justify-between text-left text-sm font-medium text-stone-800 hover:text-stone-950 transition-colors cursor-pointer"
            aria-expanded={mobileTocOpen}
          >
            <span className="font-serif-koinonia text-base tracking-wide">TABLE OF CONTENTS (12 sections)</span>
            <span className="text-stone-400 text-xs font-mono">{mobileTocOpen ? 'Hide ↑' : 'Show ↓'}</span>
          </button>

          {mobileTocOpen && (
            <div className="pb-6 pt-1 space-y-2.5 border-t border-[#EAE8E1]/60">
              {TOC_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToTarget(item.targetId)}
                  className="w-full text-left py-1 flex items-start gap-3 text-xs text-stone-600 hover:text-stone-950 transition-colors cursor-pointer"
                >
                  <span className="font-mono text-[#9A7326] shrink-0 w-5">{item.number.padStart(2, '0')}</span>
                  <span className="leading-relaxed">{item.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Desktop Two-Column Layout: Quiet Reading Rail + Continuous Reading Column */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start pt-6">
          {/* Left Column: Quiet Sticky TOC (Desktop) */}
          <aside className="hidden lg:block lg:col-span-4 sticky top-20 border-r border-[#EAE8E1]/70 pr-8">
            <h3 className="font-serif-koinonia text-xs tracking-widest uppercase font-semibold text-stone-400 mb-6">
              TABLE OF CONTENTS
            </h3>

            <nav className="space-y-1 max-h-[calc(100vh-12rem)] overflow-y-auto pr-2">
              {TOC_ITEMS.map((item) => {
                const isActive = activeSection === item.targetId;
                return (
                  <button
                    key={item.id}
                    onClick={() => scrollToTarget(item.targetId)}
                    className={`w-full text-left py-1.5 pl-3 -ml-3 text-xs transition-colors flex items-start gap-2.5 cursor-pointer border-l-2 ${
                      isActive
                        ? 'border-[#C59B27] text-stone-950 font-semibold'
                        : 'border-transparent text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    <span className={`font-mono text-[11px] shrink-0 w-4 ${isActive ? 'text-[#9A7326]' : 'text-stone-400'}`}>
                      {item.number.padStart(2, '0')}
                    </span>
                    <span className="leading-relaxed">{item.title}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-8 pt-6 border-t border-[#EAE8E1]/60">
              <button
                onClick={scrollToTop}
                className="text-xs font-medium text-stone-400 hover:text-stone-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>↑ Back to top</span>
              </button>
            </div>
          </aside>

          {/* Right Column: Continuous Document Flow */}
          <div className="lg:col-span-8 max-w-[760px] space-y-16 sm:space-y-20">
            {/* SECTION 1 */}
            <article id="section-1" className="scroll-mt-24 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-mono font-medium tracking-wider text-[#9A7326] block">
                  01
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-[2rem] font-serif-koinonia font-normal text-stone-900 leading-snug tracking-tight">
                  1. WHAT INFORMATION DO WE COLLECT?
                </h2>
              </div>

              {/* In Short: Pull-quote style */}
              <div className="my-5 pl-5 border-l-2 border-[#C59B27]/70 py-1">
                <p className="text-sm sm:text-base text-stone-600 font-sans italic leading-[1.75]">
                  In Short: \We collect the personal information that a parent or guardian provides when registering a child for Children&apos;s Session, and basic information if you use our web application.
                </p>
              </div>

              <div className="space-y-6 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
                <div>
                  <p className="font-semibold text-stone-900 pb-2">
                    Personal information provided by a parent/guardian, about your child:
                  </p>
                  <ul className="space-y-2.5 pl-1">
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                      <span>Full name</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                      <span>Date of birth or age</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                      <span>Emergency contact name and phone number</span>
                    </li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-stone-900 pb-2">
                    Personal information provided by you, the parent/guardian:
                  </p>
                  <ul className="space-y-2.5 pl-1">
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                      <span>Name</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                      <span>Phone number</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                      <span>Email address</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                      <span>Home address (only if you choose to provide it,...e.g in case we need to contact you for emergency reasons)</span>
                    </li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-stone-900 pb-2">
                    Sensitive information. <span className="font-normal text-stone-700">With your explicit consent, we process:</span>
                  </p>
                  <ul className="space-y-2.5 pl-1">
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                      <span>Health data — allergies, medical conditions, and medications your child may need us to be aware of, so we can keep them safe during the programme.</span>
                    </li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-stone-900 pb-2">
                    Application data. <span className="font-normal text-stone-700">If you use our web application at <a href="https://koinonia12.netlify.app/#/" target="_blank" rel="noopener noreferrer" className="text-stone-900 underline underline-offset-4 hover:text-[#9A7326] transition-colors">https://koinonia12.netlify.app/#/</a>, we may also collect:</span>
                  </p>
                  <ul className="space-y-2.5 pl-1">
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                      <span>Login/account information, if you create an account</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                      <span>Basic technical data (e.g., device or browser type, IP address) for security, troubleshooting, and keeping the application working properly</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                      <span>Push notifications, if enabled, about registration confirmations or programme updates. You can turn these off in your device&apos;s settings at any time.</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-4 pt-2">
                  <p>
                    <strong>Photographs and videos:</strong> With your separate, specific consent, we may photograph or record your child during Children&apos;s Session activities, either (a) for internal safety and attendance records, or (b) for sharing on our ministry&apos;s social media or promotional materials. You may consent to (a) without consenting to (b).
                  </p>
                  <p>
                    We do not collect any information about you or your child from third parties. All information you provide must be accurate, and you must tell us if anything changes (for example, a new emergency contact number).
                  </p>
                </div>
              </div>
            </article>

            {/* SECTION 2 */}
            <article id="section-2" className="scroll-mt-24 pt-12 border-t border-[#EAE8E1]/80 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-mono font-medium tracking-wider text-[#9A7326] block">
                  02
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-[2rem] font-serif-koinonia font-normal text-stone-900 leading-snug tracking-tight">
                  2. HOW DO WE PROCESS YOUR INFORMATION?
                </h2>
              </div>

              {/* In Short: Pull-quote style */}
              <div className="my-5 pl-5 border-l-2 border-[#C59B27]/70 py-1">
                <p className="text-sm sm:text-base text-stone-600 font-sans italic leading-[1.75]">
                  In Short: We process your information to register and run Children&apos;s Session safely, to communicate with you, to respond to emergencies, and to comply with the law.
                </p>
              </div>

              <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
                <p>We process personal information to:</p>
                <ul className="space-y-3 pl-1">
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>Register your child and manage attendance for Children&apos;s Session, including through our web application;</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>Ensure appropriate supervision and respond to your child&apos;s medical needs or an emergency during the programme;</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>Communicate with you about registration, schedule changes, and (only if you have separately opted in) future Koinonia General Assembly children&apos;s programmes;</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>Maintain the security and proper functioning of our web application, including troubleshooting and preventing misuse;</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>Comply with our legal obligations, including under the Nigeria Data Protection Act, 2023 and the Child&apos;s Rights Act, 2003.</span>
                  </li>
                </ul>
                <p className="pt-2">
                  We do not use your child&apos;s information for advertising, profiling, or automated decision-making.
                </p>
              </div>
            </article>

            {/* SECTION 3 */}
            <article id="section-3" className="scroll-mt-24 pt-12 border-t border-[#EAE8E1]/80 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-mono font-medium tracking-wider text-[#9A7326] block">
                  03
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-[2rem] font-serif-koinonia font-normal text-stone-900 leading-snug tracking-tight">
                  3. WHEN AND WITH WHOM DO WE SHARE PERSONAL INFORMATION?
                </h2>
              </div>

              {/* In Short: Pull-quote style */}
              <div className="my-5 pl-5 border-l-2 border-[#C59B27]/70 py-1">
                <p className="text-sm sm:text-base text-stone-600 font-sans italic leading-[1.75]">
                  In Short: Only with those who need it to keep your child safe, or where the law requires it. We do not sell your information.
                </p>
              </div>

              <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
                <p>We may share personal information:</p>
                <ul className="space-y-3 pl-1">
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>With our vetted children&apos;s ministry volunteers and workers, strictly on a need-to-know basis;</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>With emergency or medical services, if needed during the programme;</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>With government authorities  such as the Nigeria Data Protection Commission (NDPC), the Nigeria Police Force, or NAPTIP; where required or permitted by law;</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>With service providers who help us run our web application (e.g., hosting), under confidentiality obligations.</span>
                  </li>
                </ul>
                <p className="pt-2">
                  We do not sell or rent your or your child&apos;s personal information, and we do not share it with third parties for their own marketing or advertising purposes.
                </p>
              </div>
            </article>

            {/* SECTION 4 */}
            <article id="section-4" className="scroll-mt-24 pt-12 border-t border-[#EAE8E1]/80 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-mono font-medium tracking-wider text-[#9A7326] block">
                  04
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-[2rem] font-serif-koinonia font-normal text-stone-900 leading-snug tracking-tight">
                  4. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?
                </h2>
              </div>

              {/* In Short: Pull-quote style */}
              <div className="my-5 pl-5 border-l-2 border-[#C59B27]/70 py-1">
                <p className="text-sm sm:text-base text-stone-600 font-sans italic leading-[1.75]">
                  In Short: Our web application may use minimal cookies necessary for it to function. We do not currently use cookies or trackers for advertising.
                </p>
              </div>

              <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
                <p>
                  We may use limited cookies or similar technologies (e.g., to keep you logged in, remember your preferences, or keep the application secure). We do not currently permit third parties to use our Services for advertising or ad-tracking purposes.
                </p>
              </div>
            </article>

            {/* SECTION 5 */}
            <article id="section-5" className="scroll-mt-24 pt-12 border-t border-[#EAE8E1]/80 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-mono font-medium tracking-wider text-[#9A7326] block">
                  05
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-[2rem] font-serif-koinonia font-normal text-stone-900 leading-snug tracking-tight">
                  5. HOW LONG DO WE KEEP YOUR INFORMATION?
                </h2>
              </div>

              {/* In Short: Pull-quote style */}
              <div className="my-5 pl-5 border-l-2 border-[#C59B27]/70 py-1">
                <p className="text-sm sm:text-base text-stone-600 font-sans italic leading-[1.75]">
                  In Short: Only for as long as necessary for the programme, or as the law requires, then we delete or anonymise it.
                </p>
              </div>

              <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
                <ul className="space-y-3.5 pl-1">
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>
                      <strong>Registration and health information:</strong> retained for the duration of the relevant Children&apos;s Session programme, and until the next assembly season in case of a follow-up safety concern, then securely deleted, unless you have separately opted in to further contact.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>
                      <strong>Any safeguarding or incident reports:</strong> retained for a longer period on legal advice, given their potential importance to a child&apos;s ongoing welfare.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>
                      <strong>Application account data (if applicable):</strong> retained while your account is active, and deleted on your request.
                    </span>
                  </li>
                </ul>
              </div>
            </article>

            {/* SECTION 6 */}
            <article id="section-6" className="scroll-mt-24 pt-12 border-t border-[#EAE8E1]/80 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-mono font-medium tracking-wider text-[#9A7326] block">
                  06
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-[2rem] font-serif-koinonia font-normal text-stone-900 leading-snug tracking-tight">
                  6. HOW DO WE KEEP YOUR INFORMATION SAFE?
                </h2>
              </div>

              {/* In Short: Pull-quote style */}
              <div className="my-5 pl-5 border-l-2 border-[#C59B27]/70 py-1">
                <p className="text-sm sm:text-base text-stone-600 font-sans italic leading-[1.75]">
                  In Short: We use reasonable organisational and technical measures to protect personal information.
                </p>
              </div>

              <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
                <p>
                  We restrict access to registration and health forms to those who need them to run the programme safely, and apply reasonable technical safeguards to our web application. However, no method of electronic storage or transmission is 100% secure, so we cannot guarantee absolute security. Given that this information often concerns children, we treat its protection as a priority, not an afterthought.
                </p>
              </div>
            </article>

            {/* SECTION 7 */}
            <article id="section-7" className="scroll-mt-24 pt-12 border-t border-[#EAE8E1]/80 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-mono font-medium tracking-wider text-[#9A7326] block">
                  07
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-[2rem] font-serif-koinonia font-normal text-stone-900 leading-snug tracking-tight">
                  7. OUR APPROACH TO CHILDREN&apos;S PERSONAL INFORMATION
                </h2>
              </div>

              {/* In Short: Pull-quote style */}
              <div className="my-5 pl-5 border-l-2 border-[#C59B27]/70 py-1">
                <p className="text-sm sm:text-base text-stone-600 font-sans italic leading-[1.75]">
                  In Short: Children&apos;s Session is built specifically to serve children under 18, so, unlike a typical online service, we <em>do</em> knowingly collect children&apos;s personal information, always through and with the verified consent of a parent or legal guardian.
                </p>
              </div>

              <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
                <ul className="space-y-3.5 pl-1">
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>
                      All information about a child is provided, and consented to, by that child&apos;s parent or legal guardian — never by the child alone — in line with the Nigeria Data Protection Act 2023 (which treats minors as unable to give their own consent to data processing) and the Child&apos;s Rights Act 2003.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>
                      We only use a child&apos;s information for the purposes stated in this Notice: safely running Children&apos;s Session. We never use it to advertise to children or profile them.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>
                      A parent/guardian may withdraw consent, or ask us to delete their child&apos;s information, at any time, by contacting us using the details in Section 11. Please note that withdrawing certain information (e.g., emergency or health details) may mean we cannot safely admit the child to future sessions.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>
                      If you believe we hold information about a child that was not provided with proper parental or guardian consent, please contact us immediately at <a href="mailto:koinoniaabuja@gmail.com" className="text-stone-900 font-medium underline underline-offset-4 hover:text-[#9A7326] transition-colors">koinoniaabuja@gmail.com</a> and we will investigate and delete it as appropriate.
                    </span>
                  </li>
                </ul>
              </div>
            </article>

            {/* SECTION 8 */}
            <article id="section-8" className="scroll-mt-24 pt-12 border-t border-[#EAE8E1]/80 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-mono font-medium tracking-wider text-[#9A7326] block">
                  08
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-[2rem] font-serif-koinonia font-normal text-stone-900 leading-snug tracking-tight">
                  8. WHAT ARE YOUR PRIVACY RIGHTS?
                </h2>
              </div>

              {/* In Short: Pull-quote style */}
              <div className="my-5 pl-5 border-l-2 border-[#C59B27]/70 py-1">
                <p className="text-sm sm:text-base text-stone-600 font-sans italic leading-[1.75]">
                  In Short: As a parent or guardian, you may review, correct, or delete your child&apos;s information, and withdraw your consent, at any time.
                </p>
              </div>

              <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
                <ul className="space-y-3.5 pl-1">
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>
                      <strong>Withdrawing consent:</strong> Where we rely on your consent, you may withdraw it at any time by contacting us (Section 11). This does not affect the lawfulness of processing carried out before withdrawal.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>
                      <strong>Access, correction, deletion:</strong> You may ask to see what information we hold about your child, ask us to correct it, or ask us to delete it, subject to any legal or safety record-keeping requirement.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>
                      <strong>Account information:</strong> If you have an account on our web application, you may review or update it directly, or ask us to close it.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-2.5 shrink-0" />
                    <span>
                      <strong>Complaints:</strong> If you believe your rights have been infringed, you may contact us first, or lodge a complaint with the Nigeria Data Protection Commission (NDPC).
                    </span>
                  </li>
                </ul>

                <p className="pt-2">
                  To exercise any of these rights, email us at <a href="mailto:koinoniaabuja@gmail.com" className="text-stone-900 font-medium underline underline-offset-4 hover:text-[#9A7326] transition-colors">koinoniaabuja@gmail.com</a>.
                </p>
              </div>
            </article>

            {/* SECTION 9 */}
            <article id="section-9" className="scroll-mt-24 pt-12 border-t border-[#EAE8E1]/80 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-mono font-medium tracking-wider text-[#9A7326] block">
                  09
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-[2rem] font-serif-koinonia font-normal text-stone-900 leading-snug tracking-tight">
                  9. CONTROLS FOR DO-NOT-TRACK FEATURES
                </h2>
              </div>

              <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
                <p>
                  Most web browsers include a &quot;Do-Not-Track&quot; (DNT) signal. As no uniform technical standard for recognising DNT signals currently exists, we do not respond to DNT signals at this time. If a recognised standard is adopted, we will update this Notice accordingly.
                </p>
              </div>
            </article>

            {/* SECTION 10 */}
            <article id="section-10" className="scroll-mt-24 pt-12 border-t border-[#EAE8E1]/80 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-mono font-medium tracking-wider text-[#9A7326] block">
                  10
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-[2rem] font-serif-koinonia font-normal text-stone-900 leading-snug tracking-tight">
                  10. DO WE MAKE UPDATES TO THIS NOTICE?
                </h2>
              </div>

              <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
                <h3 className="text-lg font-semibold text-stone-900">
                  Yes, we will update this Notice as needed, and note the &quot;Last updated&quot; date above when we do.
                </h3>
                <p>
                  If we make a material change to how we handle your child&apos;s information, we will notify parents/guardians directly (e.g., by email or at registration), not only by updating this page.
                </p>
              </div>
            </article>

            {/* SECTION 11 */}
            <article id="section-11" className="scroll-mt-24 pt-12 border-t border-[#EAE8E1]/80 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-mono font-medium tracking-wider text-[#9A7326] block">
                  11
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-[2rem] font-serif-koinonia font-normal text-stone-900 leading-snug tracking-tight">
                  11. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?
                </h2>
              </div>

              <div className="space-y-5 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
                <p>
                  If you have questions or comments about this Notice, contact us at:
                </p>

                {/* Editorial Contact Details */}
                <div className="pt-4 pb-2 space-y-2 border-t border-[#EAE8E1]/80">
                  <p className="font-semibold text-stone-900 text-base">
                    The Koinonia General Assembly
                  </p>
                  <p>
                    <span className="text-stone-500">Email:</span>{' '}
                    <a href="mailto:koinoniaabuja@gmail.com" className="text-stone-900 font-medium underline underline-offset-4 hover:text-[#9A7326] transition-colors">
                      koinoniaabuja@gmail.com
                    </a>
                  </p>
                  <p>
                    <span className="text-stone-500">Address:</span> Chidal Event Centre, Jabi.
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </main>

      {/* Discreet Minimal Floating Return To Top */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          aria-label="Back to top"
          className="fixed bottom-6 right-6 z-30 bg-[#FAF9F6] hover:bg-white text-stone-500 hover:text-stone-900 border border-[#EAE8E1] px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs cursor-pointer group"
        >
          <ArrowUp className="w-3.5 h-3.5 transition-transform group-hover:-translate-y-0.5 text-stone-400 group-hover:text-stone-700" />
          <span className="hidden sm:inline">Top</span>
        </button>
      )}

      {/* Restrained Editorial Footer */}
      <footer className="bg-[#FAF9F6] border-t border-[#EAE8E1]/80 py-10 px-6 sm:px-8 lg:px-12 mt-20">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-stone-400">
          <BrandLogo
            context="compact"
            onClick={() => onNavigate('/')}
            className="flex items-center space-x-3 cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
          />

          <div className="flex flex-wrap items-center justify-center gap-6 font-medium text-stone-500">
            <span onClick={() => scrollToTop()} className="text-stone-900 font-semibold cursor-pointer">
              Privacy Notice
            </span>
            <span onClick={() => onNavigate('/terms')} className="hover:text-stone-900 cursor-pointer transition-colors">
              Terms of Service
            </span>
            <span onClick={() => onNavigate('/child-safety')} className="hover:text-stone-900 cursor-pointer transition-colors">
              Child Safety Policy
            </span>
            <span onClick={() => onNavigate('/contact')} className="hover:text-stone-900 cursor-pointer transition-colors">
              Contact Us
            </span>
          </div>

          <div>
            <p>&copy; 2026 The Koinonia General Assembly. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PrivacyPolicyView;
