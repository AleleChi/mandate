import React from 'react';
import { Button } from './Button';
import { AppRoute } from '../../types';

interface HeaderProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentRoute, onNavigate }) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-[#18181B]/95 backdrop-blur-md border-b border-[#C59B27]/30 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand */}
        <div
          onClick={() => onNavigate('/')}
          className="flex items-center space-x-3 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#C59B27] to-[#A67C2E] flex items-center justify-center text-white font-serif-koinonia font-bold text-xl shadow-md group-hover:scale-105 transition-transform">
            K
          </div>
          <div className="flex flex-col">
            <span className="font-serif-koinonia text-xl tracking-wider font-bold text-[#FDFBF7] leading-none">
              KOINONIA
            </span>
            <span className="text-[10px] tracking-[0.2em] uppercase text-[#D4AF37] font-semibold mt-1">
              Children & Teens
            </span>
          </div>
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center space-x-4">
          <Button
            variant="ghost"
            className="text-white/80 hover:text-white"
            onClick={() => onNavigate('/parent/sign-in')}
          >
            Sign In
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate('/parent/create-account')}
          >
            Begin Parent Access
          </Button>
        </div>

        {/* Mobile quick actions */}
        <div className="flex md:hidden items-center space-x-2">
          <button
            onClick={() => onNavigate('/parent/sign-in')}
            className="text-xs font-semibold px-3 py-2 text-white/90 hover:text-white"
          >
            Sign In
          </button>
          <button
            onClick={() => onNavigate('/parent/create-account')}
            className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#B89047] to-[#C59B27] text-white shadow-sm"
          >
            Begin Parent Access
          </button>
        </div>
      </div>
    </header>
  );
};
