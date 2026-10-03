import React from 'react';
import { AssetImage } from '../common/AssetImage';
import { REAL_ASSETS } from '../../config/assets';
import parentHeroImg from '../../assets/images/parent_hero_1783622066454.jpg';
import { AppRoute } from '../../types';

export interface SafetyStoryProps {
  customImage?: string;
  onNavigate: (route: AppRoute) => void;
}

export const SafetyStory: React.FC<SafetyStoryProps> = ({
  customImage,
  onNavigate,
}) => {
  return (
    <section
      id="safety"
      aria-label="Child Safety and Care Information"
      className="bg-[#18181B] text-white py-14 sm:py-20 my-4 sm:my-6 relative overflow-hidden border-y border-white/10 scroll-mt-24"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Left Column: Large Factual Statement & Description */}
          <div className="lg:col-span-6 space-y-6 text-left">
            <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase font-sans block">
              CHILD SAFETY &amp; CARE
            </span>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-sans font-bold text-white tracking-tight leading-tight">
              Care and security throughout the gathering.
            </h2>

            <p className="text-sm sm:text-base text-[#D1D5DB] leading-relaxed max-w-xl font-normal">
              The Children &amp; Teens team uses the system to manage entrance check-in, record dietary and care notes, track session attendance, and confirm designated pickup details before any child departs.
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('/child-safety')}
                className="text-xs font-semibold text-[#D4AF37] hover:underline cursor-pointer inline-flex items-center space-x-1"
              >
                <span>Read our Child Safety policy</span>
                <span>&rarr;</span>
              </button>
            </div>
          </div>

          {/* Right Column: One Large Event / Safety Visual */}
          <div className="lg:col-span-6">
            <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-[#222228] aspect-[16/11] sm:aspect-[4/3]">
              <AssetImage
                src={customImage || REAL_ASSETS.safetySection || parentHeroImg}
                alt="Children and Teens care and safety station"
                iconType="shield"
                label="Care Check-in Station"
                className="w-full h-full object-cover grayscale-[20%] opacity-90"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Below: 3 Short Factual Items Separated by Clean Lines */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-14 mt-12 border-t border-white/10 text-left">
          <div className="space-y-2">
            <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider font-sans block">
              01 &bull; Check-in
            </span>
            <h3 className="text-lg font-sans font-bold text-white">
              Arrival details
            </h3>
            <p className="text-xs sm:text-sm text-[#9CA3AF] leading-relaxed">
              Relevant child details, medical notes, and emergency contacts are available to permitted team members upon entry.
            </p>
          </div>

          <div className="space-y-2 md:border-l md:border-white/10 md:pl-8">
            <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider font-sans block">
              02 &bull; During the programme
            </span>
            <h3 className="text-lg font-sans font-bold text-white">
              Attendance tracking
            </h3>
            <p className="text-xs sm:text-sm text-[#9CA3AF] leading-relaxed">
              Attendance status is logged by the event team so coordinators know which children are currently inside the halls.
            </p>
          </div>

          <div className="space-y-2 md:border-l md:border-white/10 md:pl-8">
            <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider font-sans block">
              03 &bull; Pickup
            </span>
            <h3 className="text-lg font-sans font-bold text-white">
              Controlled release
            </h3>
            <p className="text-xs sm:text-sm text-[#9CA3AF] leading-relaxed">
              Designated pickup person information is verified before a child is checked out and released to their family.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
