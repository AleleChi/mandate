import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { AppRoute } from '../../types';

interface ProcessStep {
  number: string;
  title: string;
  description: string;
}

const STEPS: ProcessStep[] = [
  {
    number: '01',
    title: 'Create your profile',
    description: 'Add your contact details and basic information.',
  },
  {
    number: '02',
    title: 'Add your child’s details',
    description: 'Add their age group, photo, care information and designated pickup person.',
  },
  {
    number: '03',
    title: 'Submit for review',
    description: 'We’ll review the details before an event pass is issued.',
  },
];

interface ParentProcessSectionProps {
  onNavigate?: (route: AppRoute) => void;
  parentCtaRoute?: string;
}

export const ParentProcessSection: React.FC<ParentProcessSectionProps> = ({
  onNavigate,
  parentCtaRoute = '/parent/create-account',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      mediaQuery.removeEventListener('change', listener);
      observer.disconnect();
    };
  }, []);

  return (
    <section
      id="process"
      ref={sectionRef}
      className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full border-t border-[#EAE8E1]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
        {/* Left Column: Editorial CTA */}
        <div
          style={{
            opacity: prefersReducedMotion || isVisible ? 1 : 0,
            transform: prefersReducedMotion || isVisible ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 750ms cubic-bezier(0.25, 1, 0.5, 1), transform 750ms cubic-bezier(0.25, 1, 0.5, 1)',
          }}
          className="lg:col-span-6 space-y-6 lg:sticky lg:top-28 text-left"
        >
          <span className="text-xs font-bold tracking-widest text-[#9A7326] uppercase block font-sans">
            FOR PARENTS &amp; GUARDIANS
          </span>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif-koinonia font-bold text-[#18181B] tracking-tight leading-[1.14]">
            Register your child<br className="hidden sm:inline" /> for the gathering
          </h2>

          <p className="text-sm sm:text-base text-[#6B7280] leading-relaxed max-w-md">
            Create your parent profile, add your child’s details, and submit them for review.
          </p>

          <div className="pt-2">
            <button
              onClick={() => onNavigate && onNavigate(parentCtaRoute as AppRoute)}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold py-3.5 px-8 rounded-xl text-sm shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
            >
              <span>Register your child</span>
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          </div>
        </div>

        {/* Right Column: Editorial 3-Step Flow */}
        <div
          style={{
            opacity: prefersReducedMotion || isVisible ? 1 : 0,
            transform: prefersReducedMotion || isVisible ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity 800ms cubic-bezier(0.25, 1, 0.5, 1) 150ms, transform 800ms cubic-bezier(0.25, 1, 0.5, 1) 150ms',
          }}
          className="lg:col-span-6 pt-4 lg:pt-2"
        >
          <div className="border-t border-[#EAE8E1]/80 pt-6 lg:border-t-0 lg:pt-0">
            {STEPS.map((step) => (
              <div
                key={step.number}
                className="border-b border-[#EAE8E1]/70 pb-6 mb-6 last:border-b-0 last:pb-0 last:mb-0"
              >
                <div className="flex items-start gap-4 sm:gap-5">
                  <span className="font-serif-koinonia font-bold text-base sm:text-lg text-[#9A7326] tracking-wider pt-0.5 shrink-0">
                    {step.number}
                  </span>
                  <div className="space-y-1 text-left">
                    <h3 className="text-lg sm:text-xl font-serif-koinonia font-bold text-[#18181B] tracking-tight">
                      {step.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
