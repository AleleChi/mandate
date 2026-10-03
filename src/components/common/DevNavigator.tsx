import React, { useState } from 'react';
import { Compass, Monitor, Smartphone, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { AppRoute } from '../../types';

interface DevNavigatorProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  isMobileLandingView: boolean;
  onToggleLandingView: (mobile: boolean) => void;
}

export const DevNavigator: React.FC<DevNavigatorProps> = ({
  currentRoute,
  onNavigate,
  isMobileLandingView,
  onToggleLandingView
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const routes: { label: string; route: AppRoute; section: string }[] = [
    { label: 'Public Landing Page', route: '/', section: 'Public' },
    { label: 'Create Parent Account', route: '/parent/create-account', section: 'Auth' },
    { label: 'Email Confirmation', route: '/parent/check-email', section: 'Auth' },
    { label: 'Sign In Screen', route: '/parent/sign-in', section: 'Auth' },
    { label: 'Forgot Password', route: '/parent/forgot-password', section: 'Auth' },
    { label: 'New Password Screen', route: '/parent/new-password', section: 'Auth' },
    { label: 'Parent Profile Setup', route: '/parent/profile-setup', section: 'Profile' },
    { label: 'Parent Profile Edit', route: '/parent/profile/edit', section: 'Profile' },
    { label: 'Parent Profile Screen', route: '/parent/profile', section: 'Profile' },
    { label: 'Parent Home', route: '/parent/home', section: 'App' },
    { label: 'Add Child (Step 1)', route: '/parent/children/new', section: 'App' },
    { label: 'Add Child (Step 2)', route: '/parent/children/new/care-details', section: 'App' },
    { label: 'Add Child (Step 3)', route: '/parent/children/new/health-and-support', section: 'App' },
    { label: 'Add Child (Step 4)', route: '/parent/children/new/pickup-person', section: 'App' },
    { label: 'Add Child (Step 5)', route: '/parent/children/new/review', section: 'App' }
  ];

  return (
    <div className="fixed bottom-20 right-4 z-50" data-dev-only="screen-navigator">
      {isOpen ? (
        <div className="bg-[#18181B] text-white rounded-2xl p-4 shadow-2xl border border-[#C59B27]/50 w-72 backdrop-blur-lg animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/15">
            <div className="flex items-center space-x-2 text-xs font-bold text-[#D4AF37] uppercase tracking-wider">
              <Layers className="w-4 h-4" />
              <span>All Screens</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-white/10 text-white/70"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Landing view mode switcher when on Landing Page */}
          {currentRoute === '/' && (
            <div className="bg-black/40 p-2.5 rounded-xl mb-3 border border-white/10">
              <span className="text-[10px] text-white/60 uppercase block mb-1.5 font-semibold">Landing Page Mode</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => onToggleLandingView(false)}
                  className={`flex items-center justify-center space-x-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    !isMobileLandingView
                      ? 'bg-[#C59B27] text-white'
                      : 'bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Desktop</span>
                </button>
                <button
                  onClick={() => onToggleLandingView(true)}
                  className={`flex items-center justify-center space-x-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isMobileLandingView
                      ? 'bg-[#C59B27] text-white'
                      : 'bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Invitation</span>
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {routes.map((item) => {
              const active = currentRoute === item.route;
              return (
                <button
                  key={item.route}
                  onClick={() => {
                    onNavigate(item.route);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-colors ${
                    active
                      ? 'bg-[#FAF6EB] text-[#18181B] font-bold shadow-sm'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>{item.label}</span>
                  {active && <span className="w-2 h-2 rounded-full bg-[#C59B27]" />}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-gradient-to-r from-[#18181B] to-[#262626] text-white px-4 py-3 rounded-full shadow-2xl border border-[#C59B27]/60 flex items-center space-x-2.5 hover:scale-105 active:scale-95 transition-transform"
        >
          <Compass className="w-4 h-4 text-[#D4AF37]" />
          <span className="text-xs font-semibold tracking-wide">Screen Navigator</span>
          <ChevronUp className="w-3.5 h-3.5 text-white/60" />
        </button>
      )}
    </div>
  );
};
