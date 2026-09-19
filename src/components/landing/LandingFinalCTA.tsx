import React from 'react';
import { ArrowRight } from 'lucide-react';
import { AppRoute } from '../../types';

export interface LandingFinalCTAProps {
  currentEvent?: any;
  regStatus: any;
  onParentRegisterClick: () => void;
  onVolunteerRegisterClick: () => void;
  onNavigate: (route: AppRoute) => void;
  isRegistrationClosed: boolean;
}

export const LandingFinalCTA: React.FC<LandingFinalCTAProps> = ({
  currentEvent,
  regStatus,
  onParentRegisterClick,
  onVolunteerRegisterClick,
  onNavigate,
  isRegistrationClosed,
}) => {
  const eventTitle = currentEvent?.title?.trim() || regStatus?.eventName?.trim() || 'The General Assembly';

  return (
    <section
      className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full"
      aria-label="Event Registration Call to Action"
    >
      <div className="relative rounded-[32px] sm:rounded-[40px] overflow-hidden bg-[#18181B] text-white p-8 sm:p-14 lg:p-20 text-center shadow-xl border border-white/10">
        <div className="relative z-10 max-w-2xl mx-auto space-y-6">
          {/* Eyebrow: Live Event Title */}
          <span className="text-xs font-bold tracking-widest text-[#D4AF37] uppercase font-sans block">
            {eventTitle}
          </span>

          {/* Heading */}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif-koinonia font-bold text-white tracking-tight leading-tight">
            {isRegistrationClosed
              ? `Registration has closed for ${eventTitle}.`
              : `Registration is open for the Children & Teens programme.`}
          </h2>

          {/* Natural Subtitle */}
          <p className="text-xs sm:text-base text-[#D1D5DB] leading-relaxed max-w-lg mx-auto font-normal">
            {isRegistrationClosed
              ? 'If you have already registered your child, you can sign in below to view your details and access your event pass.'
              : 'Register your child online to receive an event pass and prepare for the gathering.'}
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
            {isRegistrationClosed ? (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('/parent/sign-in')}
                  className="w-full sm:w-auto px-8 h-[48px] bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-xl text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center cursor-pointer"
                >
                  <span>Sign in to account</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/volunteer/sign-in')}
                  className="w-full sm:w-auto px-7 h-[48px] bg-white/10 hover:bg-white/15 text-white border border-white/20 font-semibold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center cursor-pointer"
                >
                  <span>Volunteer sign in</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onParentRegisterClick}
                  className="w-full sm:w-auto px-8 h-[50px] bg-[#C59B27] hover:bg-[#B89047] active:bg-[#AA8220] text-white font-semibold rounded-xl text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all inline-flex items-center justify-center space-x-2 cursor-pointer group"
                >
                  <span>Register your child</span>
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/parent/sign-in')}
                  className="w-full sm:w-auto px-7 h-[50px] bg-white/10 hover:bg-white/15 active:bg-white/20 text-white border border-white/20 font-semibold rounded-xl text-xs uppercase tracking-wider transition-all inline-flex items-center justify-center cursor-pointer"
                >
                  <span>Parent sign in</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
