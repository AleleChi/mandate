import React, { useState, useEffect, useRef } from 'react';
import { User, Users, ClipboardCheck, QrCode } from 'lucide-react';

interface ProcessStep {
  number: number;
  title: string;
  body: string;
  icon: React.ReactNode;
}

const STEPS: ProcessStep[] = [
  {
    number: 1,
    title: 'Create parent account',
    body: 'Add your contact details and photo so the team can reach you when needed.',
    icon: <User className="w-5 h-5" />,
  },
  {
    number: 2,
    title: 'Add each child',
    body: 'Add each child’s details, age group, photo, care notes, and pickup person.',
    icon: <Users className="w-5 h-5" />,
  },
  {
    number: 3,
    title: 'Send details for review',
    body: 'The team checks the details before a child is selected for the event.',
    icon: <ClipboardCheck className="w-5 h-5" />,
  },
  {
    number: 4,
    title: 'Receive event pass',
    body: 'If selected, the child’s event pass appears in the parent account.',
    icon: <QrCode className="w-5 h-5" />,
  },
];

export const ParentProcessSection: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Check reduced motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);

    // Intersection observer for scroll trigger
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      mediaQuery.removeEventListener('change', listener);
      observer.disconnect();
    };
  }, []);

  const shouldAnimate = isVisible && !prefersReducedMotion;

  return (
    <section
      id="process"
      ref={sectionRef}
      className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full border-t border-[#EAE8E1] bg-[#FAF8F3]"
    >
      {/* Header section */}
      <div className="text-center max-w-2xl mx-auto mb-20 space-y-3.5">
        <div
          style={{
            opacity: prefersReducedMotion || isVisible ? 1 : 0,
            transition: 'opacity 700ms cubic-bezier(0.25, 1, 0.5, 1)',
          }}
        >
          <span className="text-xs font-bold tracking-widest text-[#9A7326] uppercase block font-sans">
            THE PROCESS
          </span>
        </div>

        <div
          style={{
            opacity: prefersReducedMotion || isVisible ? 1 : 0,
            transform: prefersReducedMotion || isVisible ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 750ms cubic-bezier(0.25, 1, 0.5, 1) 120ms, transform 750ms cubic-bezier(0.25, 1, 0.5, 1) 120ms',
          }}
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif-koinonia font-bold text-[#18181B] tracking-tight leading-tight">
            How parents prepare for event access
          </h2>
        </div>

        <div
          style={{
            opacity: prefersReducedMotion || isVisible ? 1 : 0,
            transform: prefersReducedMotion || isVisible ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 750ms cubic-bezier(0.25, 1, 0.5, 1) 240ms, transform 750ms cubic-bezier(0.25, 1, 0.5, 1) 240ms',
          }}
        >
          <p className="text-sm sm:text-base text-[#6B7280] leading-relaxed max-w-xl mx-auto">
            A simple path from parent account to child details, review, and event pass.
          </p>
        </div>
      </div>

      {/* Process Steps Container */}
      <div className="relative">
        {/* Desktop Horizontal Connecting Gold Line */}
        <div className="hidden lg:block absolute top-[28px] left-[10%] right-[10%] h-[2px] bg-[#EAE8E1] z-0 overflow-hidden rounded-full">
          <div
            style={{
              width: prefersReducedMotion ? '100%' : isVisible ? '100%' : '0%',
              transition: 'width 1000ms cubic-bezier(0.25, 1, 0.5, 1) 350ms',
            }}
            className="h-full bg-gradient-to-r from-[#D4B87C] via-[#C59B27] to-[#9A7326]"
          />
        </div>

        {/* Mobile Vertical Connecting Gold Line */}
        <div className="block lg:hidden absolute top-8 bottom-8 left-[27px] sm:left-[31px] w-[2px] bg-[#EAE8E1] z-0 overflow-hidden rounded-full">
          <div
            style={{
              height: prefersReducedMotion ? '100%' : isVisible ? '100%' : '0%',
              transition: 'height 1000ms cubic-bezier(0.25, 1, 0.5, 1) 350ms',
            }}
            className="w-full bg-gradient-to-b from-[#D4B87C] via-[#C59B27] to-[#9A7326]"
          />
        </div>

        {/* Steps Grid / Timeline */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 sm:gap-10 lg:gap-8 relative z-10">
          {STEPS.map((step, index) => {
            const delayMs = 300 + index * 140;

            return (
              <div
                key={step.number}
                style={{
                  opacity: prefersReducedMotion || isVisible ? 1 : 0,
                  transform: prefersReducedMotion || isVisible ? 'translateY(0)' : 'translateY(28px)',
                  transition: `opacity 800ms cubic-bezier(0.25, 1, 0.5, 1) ${delayMs}ms, transform 800ms cubic-bezier(0.25, 1, 0.5, 1) ${delayMs}ms`,
                }}
                className="group flex flex-row lg:flex-col items-start lg:items-center text-left lg:text-center"
              >
                {/* Step Number Badge */}
                <div className="shrink-0 mr-5 sm:mr-6 lg:mr-0 lg:mb-6">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#FAF6EB] border border-[#E5D5AE] shadow-xs flex items-center justify-center transition-all duration-300 ease-out group-hover:bg-[#C59B27] group-hover:border-[#C59B27] group-hover:shadow-md">
                    <span className="font-serif-koinonia font-bold text-lg sm:text-xl text-[#9A7326] transition-colors duration-300 group-hover:text-white">
                      {step.number}
                    </span>
                  </div>
                </div>

                {/* Step Card */}
                <div className="flex-1 w-full bg-white rounded-3xl border border-[#EAE8E1] border-t-2 border-t-[#D4B87C] p-6 sm:p-7 shadow-sm transition-all duration-300 ease-out group-hover:-translate-y-1.5 group-hover:shadow-xl group-hover:border-[#E5D5AE] flex flex-col justify-between h-full">
                  <div>
                    {/* Optional Minimal Icon */}
                    <div className="mb-4 text-[#9A7326] flex items-center lg:justify-center transition-transform duration-300 ease-out group-hover:-translate-y-0.5">
                      <div className="w-10 h-10 rounded-xl bg-[#FAF8F3] border border-[#EAE8E1]/80 flex items-center justify-center">
                        {step.icon}
                      </div>
                    </div>

                    <h3 className="text-lg sm:text-xl font-serif-koinonia font-bold text-[#18181B] mb-2.5 tracking-tight">
                      {step.title}
                    </h3>

                    <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                      {step.body}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
