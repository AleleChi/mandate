import React, { useState } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppRoute } from '../../types';
import { BrandLogo } from '../common/BrandLogo';

export interface PublicHeaderProps {
  onNavigate: (route: AppRoute) => void;
  onParentRegisterClick: () => void;
  scrollToSection: (id: string) => void;
}

export const PublicHeader: React.FC<PublicHeaderProps> = ({
  onNavigate,
  onParentRegisterClick,
  scrollToSection,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (sectionId: string) => {
    scrollToSection(sectionId);
    setMobileMenuOpen(false);
  };

  return (
    <header
      className="sticky top-0 z-40 w-full bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EAE8E1] transition-colors"
      data-component-version="landing-header-v2-responsive-menu"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between relative">
        {/* Brand Logo with administrative access */}
        <BrandLogo
          context="landing"
          data-component-version="landing-header-logo-image-v2-full-brand"
          onDoubleClick={() => onNavigate('/admin/sign-in')}
          onTouchStart={() => {
            const now = Date.now();
            const lastTap = (window as any)._lastLogoTap || 0;
            if (now - lastTap < 300) {
              onNavigate('/admin/sign-in');
            }
            (window as any)._lastLogoTap = now;
          }}
          onClick={() => onNavigate('/')}
          title="Double-click to access Administration"
          className="group cursor-pointer shrink-0"
        />

        {/* Desktop Lightweight Event-Facing Navigation Links */}
        <nav
          aria-label="Main navigation"
          className="hidden lg:flex items-center space-x-7 xl:space-x-8 text-xs font-semibold uppercase tracking-wider text-[#6B7280]"
        >
          <button
            type="button"
            onClick={() => handleNavClick('about')}
            className="hover:text-[#18181B] transition-colors cursor-pointer py-1"
          >
            About
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('journey')}
            className="hover:text-[#18181B] transition-colors cursor-pointer py-1"
          >
            The Process
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('safety')}
            className="hover:text-[#18181B] transition-colors cursor-pointer py-1"
          >
            Safety
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('age-groups')}
            className="hover:text-[#18181B] transition-colors cursor-pointer py-1"
          >
            Age Groups
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('moments')}
            className="hover:text-[#18181B] transition-colors cursor-pointer py-1"
          >
            Past Moments
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('faq')}
            className="hover:text-[#18181B] transition-colors cursor-pointer py-1"
          >
            FAQ
          </button>
        </nav>

        {/* Desktop Auth & Registration Actions */}
        <div className="hidden lg:flex items-center space-x-3.5">
          <button
            type="button"
            onClick={() => onNavigate('/volunteer/sign-in')}
            className="text-[#6B7280] hover:text-[#18181B] text-xs font-semibold px-3 py-2 rounded-xl hover:bg-[#FAF6EB] transition-all cursor-pointer"
          >
            Volunteer sign in
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/parent/sign-in')}
            className="text-[#6B7280] hover:text-[#18181B] text-xs font-semibold px-3 py-2 rounded-xl hover:bg-[#FAF6EB] transition-all cursor-pointer"
          >
            Parent sign in
          </button>
          <button
            type="button"
            onClick={onParentRegisterClick}
            className="bg-[#C59B27] hover:bg-[#B89047] active:bg-[#AA8220] text-white text-xs font-semibold px-4.5 py-2.5 rounded-xl shadow-xs hover:shadow-sm transition-all cursor-pointer inline-flex items-center space-x-1.5"
          >
            <span>Register child</span>
            <ArrowRight className="w-3.5 h-3.5 text-white/90" />
          </button>
        </div>

        {/* Mobile Hamburger Menu Toggle */}
        <div className="flex lg:hidden items-center">
          <button
            type="button"
            id="btn-landing-mobile-menu"
            onClick={(e) => {
              e.stopPropagation();
              setMobileMenuOpen(!mobileMenuOpen);
            }}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            className="p-2 rounded-xl text-[#52525B] hover:text-[#18181B] hover:bg-[#FAF6EB] transition-all cursor-pointer focus:outline-none"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Backdrop for tapping outside mobile menu */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 top-20 bg-black/30 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden border-t border-[#EAE8E1] bg-[#FAF9F6] shadow-xl overflow-hidden absolute top-full left-0 right-0 z-50"
            data-component-version="landing-header-mobile-menu-v2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-6 space-y-4 flex flex-col">
              {/* Navigation Grid */}
              <div className="grid grid-cols-2 gap-2.5 pb-4 border-b border-[#EAE8E1] text-xs font-semibold tracking-wider text-[#6B7280] uppercase">
                <button
                  type="button"
                  onClick={() => handleNavClick('about')}
                  className="text-left py-2 hover:text-[#18181B] transition-colors cursor-pointer"
                >
                  About
                </button>
                <button
                  type="button"
                  onClick={() => handleNavClick('journey')}
                  className="text-left py-2 hover:text-[#18181B] transition-colors cursor-pointer"
                >
                  The Process
                </button>
                <button
                  type="button"
                  onClick={() => handleNavClick('safety')}
                  className="text-left py-2 hover:text-[#18181B] transition-colors cursor-pointer"
                >
                  Safety
                </button>
                <button
                  type="button"
                  onClick={() => handleNavClick('age-groups')}
                  className="text-left py-2 hover:text-[#18181B] transition-colors cursor-pointer"
                >
                  Age Groups
                </button>
                <button
                  type="button"
                  onClick={() => handleNavClick('moments')}
                  className="text-left py-2 hover:text-[#18181B] transition-colors cursor-pointer"
                >
                  Past Moments
                </button>
                <button
                  type="button"
                  onClick={() => handleNavClick('faq')}
                  className="text-left py-2 hover:text-[#18181B] transition-colors cursor-pointer"
                >
                  FAQ
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onParentRegisterClick();
                  }}
                  className="w-full flex items-center justify-between bg-[#C59B27] hover:bg-[#B89047] active:bg-[#AA8220] text-white text-sm font-semibold py-3 px-4 rounded-xl shadow-xs transition-all cursor-pointer group"
                >
                  <span>Register child</span>
                  <ArrowRight className="w-4 h-4 text-white/90 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigate('/parent/sign-in');
                  }}
                  className="w-full flex items-center justify-between bg-white hover:bg-[#FAF6EB] text-[#18181B] border border-[#D9D6CE] text-sm font-semibold py-3 px-4 rounded-xl shadow-2xs transition-all cursor-pointer group"
                >
                  <span>Parent sign in</span>
                  <ArrowRight className="w-4 h-4 text-[#71717A] group-hover:text-[#18181B] group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigate('/volunteer/sign-in');
                  }}
                  className="w-full flex items-center justify-between bg-white hover:bg-[#FAF6EB] text-[#52525B] border border-[#EAE8E1] text-xs font-semibold py-2.5 px-4 rounded-xl transition-all cursor-pointer group"
                >
                  <span>Volunteer sign in</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#71717A] group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
