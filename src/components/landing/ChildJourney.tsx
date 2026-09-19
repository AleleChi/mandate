import React, { useState } from 'react';
import { ArrowRight, Check, QrCode, UserCheck, ShieldCheck, ClipboardCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppRoute } from '../../types';

export interface ChildJourneyProps {
  onRegisterClick: () => void;
  onNavigate: (route: AppRoute) => void;
}

interface JourneyStep {
  number: string;
  title: string;
  description: string;
  visualNote: string;
  icon: 'register' | 'review' | 'pass' | 'checkin' | 'pickup';
}

const STEPS: JourneyStep[] = [
  {
    number: '01',
    title: 'Register',
    description: 'Add your child’s details and any care information we should know.',
    visualNote: 'Parent contact, child age, and authorized pickup details recorded.',
    icon: 'register',
  },
  {
    number: '02',
    title: 'Review',
    description: 'The event team reviews the registration before the child’s pass is made available.',
    visualNote: 'Team confirms details to prepare group allocation and resources.',
    icon: 'review',
  },
  {
    number: '03',
    title: 'Pass ready',
    description: 'Once approved, the event pass becomes available in the parent account.',
    visualNote: 'Digital pass includes the verification code used on event day.',
    icon: 'pass',
  },
  {
    number: '04',
    title: 'Check in',
    description: 'Present the pass when your child arrives so their entry can be recorded.',
    visualNote: 'Volunteers at the entrance desk log attendance and welcome the child.',
    icon: 'checkin',
  },
  {
    number: '05',
    title: 'Pickup',
    description: 'The child’s pickup details are checked before they leave.',
    visualNote: 'Designated pickup guardian is confirmed before release at dismissal.',
    icon: 'pickup',
  },
];

export const ChildJourney: React.FC<ChildJourneyProps> = ({
  onRegisterClick,
  onNavigate,
}) => {
  const [activeStep, setActiveStep] = useState(0);

  const current = STEPS[activeStep];

  return (
    <section
      id="journey"
      aria-label="From registration to pickup"
      className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full border-t border-[#EAE8E1]"
    >
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-12 border-b border-[#EAE8E1] text-left">
        <div className="max-w-2xl space-y-3">
          <span className="text-[11px] font-bold tracking-widest text-[#9A7326] uppercase font-sans block">
            HOW IT WORKS
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif-koinonia font-bold text-[#18181B] tracking-tight leading-tight">
            From registration to pickup
          </h2>
          <p className="text-sm sm:text-base text-[#52525B] leading-relaxed font-normal">
            A clear sequence designed so parents know exactly what to expect before, during, and after the event.
          </p>
        </div>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onRegisterClick}
            className="w-full sm:w-auto px-6 py-3.5 bg-[#C59B27] hover:bg-[#B89047] active:bg-[#AA8220] text-white font-semibold rounded-xl text-xs uppercase tracking-wider shadow-xs transition-all inline-flex items-center justify-center space-x-2 cursor-pointer group"
          >
            <span>Register your child</span>
            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DESKTOP: Clean Editorial Journey (Timeline Left, Editorial Visual Right)  */}
      {/* ========================================================================= */}
      <div className="hidden lg:grid grid-cols-12 gap-12 pt-12 items-start text-left">
        {/* Left Column: Interactive Steps List with Clean Connecting Track */}
        <div className="col-span-7 relative pl-4 space-y-4">
          {/* Vertical connecting line */}
          <div className="absolute left-[31px] top-6 bottom-6 w-[2px] bg-[#EAE8E1]" />
          {/* Active progress indicator along connecting line */}
          <motion.div
            className="absolute left-[31px] top-6 w-[2px] bg-[#C59B27]"
            initial={false}
            animate={{ height: `${(activeStep / (STEPS.length - 1)) * 82}%` }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
          />

          {STEPS.map((step, idx) => {
            const isActive = idx === activeStep;
            return (
              <div
                key={step.number}
                onClick={() => setActiveStep(idx)}
                className={`relative flex items-start space-x-6 p-4 rounded-2xl cursor-pointer transition-all duration-300 ${
                  isActive
                    ? 'bg-white shadow-xs border border-[#E5D5AE]'
                    : 'hover:bg-white/50 opacity-70 hover:opacity-100'
                }`}
              >
                {/* Number Circle Node */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 z-10 ${
                    isActive
                      ? 'bg-[#C59B27] text-white shadow-xs scale-110'
                      : 'bg-[#FAF6EB] text-[#9A7326] border border-[#E5D5AE]'
                  }`}
                >
                  {step.number}
                </div>

                {/* Step Text */}
                <div className="space-y-1">
                  <h3
                    className={`text-lg font-serif-koinonia font-bold transition-colors ${
                      isActive ? 'text-[#18181B]' : 'text-[#71717A]'
                    }`}
                  >
                    {step.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#52525B] leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: Editorial Active Step Stage (No SaaS Cards, No Fake Pills) */}
        <div className="col-span-5 sticky top-28">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] as const }}
              className="bg-[#FAF8F3] rounded-3xl p-8 sm:p-10 border border-[#EAE8E1] text-left relative overflow-hidden"
            >
              {/* Large Subtle Editorial Watermark Number */}
              <div className="text-7xl sm:text-8xl font-serif-koinonia font-bold text-[#E5D5AE]/50 leading-none select-none tracking-tight">
                {current.number}
              </div>

              {/* Active Step Heading & Natural Copy */}
              <div className="space-y-3 pt-4">
                <h3 className="text-2xl sm:text-3xl font-serif-koinonia font-bold text-[#18181B] leading-tight">
                  {current.title}
                </h3>
                <p className="text-sm sm:text-base text-[#52525B] leading-relaxed">
                  {current.description}
                </p>
              </div>

              {/* Factual Workflow Visual Indicator */}
              <div className="mt-8 pt-6 border-t border-[#EAE8E1] flex items-start space-x-3 text-xs text-[#71717A]">
                <div className="w-8 h-8 rounded-xl bg-white border border-[#EAE8E1] flex items-center justify-center shrink-0 text-[#C59B27] shadow-2xs">
                  {current.icon === 'register' && <ClipboardCheck className="w-4 h-4" />}
                  {current.icon === 'review' && <ShieldCheck className="w-4 h-4" />}
                  {current.icon === 'pass' && <QrCode className="w-4 h-4" />}
                  {current.icon === 'checkin' && <UserCheck className="w-4 h-4" />}
                  {current.icon === 'pickup' && <Check className="w-4 h-4" />}
                </div>
                <p className="leading-relaxed pt-1 font-normal">
                  {current.visualNote}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE: Simple Vertical Step Flow */}
      {/* ========================================================================= */}
      <div className="lg:hidden pt-8 space-y-6 text-left">
        {STEPS.map((step) => (
          <div
            key={step.number}
            className="flex items-start space-x-4 pb-6 border-b border-[#EAE8E1]/80 last:border-b-0"
          >
            <span className="font-serif-koinonia text-2xl font-bold text-[#C59B27] shrink-0 pt-0.5">
              {step.number}
            </span>
            <div className="space-y-1">
              <h3 className="text-base font-serif-koinonia font-bold text-[#18181B]">
                {step.title}
              </h3>
              <p className="text-xs sm:text-sm text-[#52525B] leading-relaxed">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
