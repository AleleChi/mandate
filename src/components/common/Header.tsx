import React from 'react';
import { Button } from './Button';
import { AppRoute } from '../../types';
import { BrandLogo } from './BrandLogo';

interface HeaderProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentRoute, onNavigate }) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-[#18181B]/95 backdrop-blur-md border-b border-[#C59B27]/30 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand */}
        <BrandLogo
          context="parent"
          data-component-version="parent-brand-logo-v1-configured"
          onClick={() => onNavigate('/')}
          className="group"
        />

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
