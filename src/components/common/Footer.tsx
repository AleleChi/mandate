import React from 'react';
import { ShieldCheck, Heart, MapPin } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#141416] text-[#A1A1AA] border-t border-[#C59B27]/20 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10 pb-12 border-b border-white/10">
        <div className="flex flex-col space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#C59B27] flex items-center justify-center text-white font-serif-koinonia font-bold text-lg">
              K
            </div>
            <span className="font-serif-koinonia text-xl tracking-wider font-bold text-white">
              KOINONIA
            </span>
          </div>
          <p className="text-sm leading-relaxed text-[#D4AF37]/90 font-medium">
            Official Parent Access, staff, and admin platform for managing children and teens access for major Koinonia events.
          </p>
          <p className="text-xs text-[#71717A]">
            Photos, pickup details, passes, entry, and pickup are checked with care.
          </p>
        </div>

        <div className="flex flex-col space-y-3">
          <h4 className="text-sm font-semibold text-white tracking-wider uppercase">Parent Access Protocol</h4>
          <ul className="text-xs space-y-2.5">
            <li className="flex items-center">
              <ShieldCheck className="w-4 h-4 mr-2 text-[#C59B27]" />
              Strict identity & photo verification
            </li>
            <li className="flex items-center">
              <ShieldCheck className="w-4 h-4 mr-2 text-[#C59B27]" />
              Designated guardian pickup release only
            </li>
            <li className="flex items-center">
              <ShieldCheck className="w-4 h-4 mr-2 text-[#C59B27]" />
              Vetted care team & stewards on site
            </li>
          </ul>
        </div>

        <div className="flex flex-col space-y-3">
          <h4 className="text-sm font-semibold text-white tracking-wider uppercase">Event Location & Care</h4>
          <p className="text-xs text-[#A1A1AA] flex items-start leading-relaxed">
            <MapPin className="w-4 h-4 mr-2 text-[#C59B27] shrink-0 mt-0.5" />
            Koinonia Global Auditorium & Children Pavilion, Abuja.
          </p>
          <p className="text-xs text-[#A1A1AA] pt-2">
            Need parent access assistance? Contact the Protocol & Care desk.
          </p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-[#71717A]">
        <p>© 2025 Koinonia Children and Teens. All rights reserved.</p>
        <div className="flex items-center space-x-6 mt-4 sm:mt-0">
          <span>Child Safety Policy</span>
          <span>Parent Terms</span>
          <span>Privacy Protocol</span>
        </div>
      </div>
    </footer>
  );
};
