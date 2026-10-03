import React, { useState, useRef, useEffect } from 'react';
import { Menu, X, ArrowRight, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppRoute } from '../../types';
import { BrandLogo } from '../common/BrandLogo';
import { ThemeSwitcher } from '../common/ThemeSwitcher';

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
  const [signInOpen, setSignInOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const signInRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (signInRef.current && !signInRef.current.contains(e.target as Node)) {
        setSignInOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSignInOpen(false);
      }
    };
    if (signInOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [signInOpen]);

  const handleNavClick = (sectionId: string) => {
    scrollToSection(sectionId);
    setMobileMenuOpen(false);
  };

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-shadow duration-200 ${
        isScrolled
          ? 'bg-[#FAF9F6]/95 dark:bg-[#181817]/95 backdrop-blur-md border-b border-[#EAE8E1] dark:border-[#2A2926] shadow-[0_4px_20px_-4px_rgba(24,24,27,0.06)] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.6)]'
          : 'bg-[#FAF9F6] dark:bg-[#181817] border-b border-[#EAE8E1]/80 dark:border-[#2A2926]/80'
      }`}
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
          className="hidden lg:flex items-center space-x-7 xl:space-x-8 text-xs font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#C8C2B6]"
        >
          <button
            type="button"
            onClick={() => handleNavClick('about')}
            className="hover:text-[#18181B] dark:hover:text-[#D4AF37] transition-colors cursor-pointer py-1"
          >
            About
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('journey')}
            className="hover:text-[#18181B] dark:hover:text-[#D4AF37] transition-colors cursor-pointer py-1"
          >
            The Process
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('safety')}
            className="hover:text-[#18181B] dark:hover:text-[#D4AF37] transition-colors cursor-pointer py-1"
          >
            Safety
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('age-groups')}
            className="hover:text-[#18181B] dark:hover:text-[#D4AF37] transition-colors cursor-pointer py-1"
          >
            Age Groups
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('moments')}
            className="hover:text-[#18181B] dark:hover:text-[#D4AF37] transition-colors cursor-pointer py-1"
          >
            Past Moments
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('faq')}
            className="hover:text-[#18181B] dark:hover:text-[#D4AF37] transition-colors cursor-pointer py-1"
          >
            FAQ
          </button>
        </nav>

        {/* Desktop Auth & Registration Actions: [ theme ] [ Sign in ] [ Register child ] */}
        <div className="hidden lg:flex items-center space-x-3.5">
          <ThemeSwitcher />

          {/* Single Sign In Control with Popover */}
          <div className="relative" ref={signInRef}>
            <button
              type="button"
              onClick={() => setSignInOpen(!signInOpen)}
              aria-expanded={signInOpen}
              aria-haspopup="true"
              className="text-xs font-semibold px-3.5 py-2 rounded-xl text-[#6B7280] dark:text-[#C8C2B6] hover:text-[#18181B] dark:hover:text-[#F7F4ED] hover:bg-[#FAF6EB] dark:hover:bg-[#262522] transition-colors cursor-pointer inline-flex items-center space-x-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C59B27]"
            >
              <span>Sign in</span>
              <ChevronDown className={`w-3 h-3 text-[#71717A] dark:text-[#938C81] transition-transform duration-200 ${signInOpen ? 'rotate-180' : ''}`} />
            </button>

            {signInOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#3D3B36] rounded-2xl shadow-lg p-1.5 z-50 animate-in fade-in zoom-in-95">
                <button
                  type="button"
                  onClick={() => {
                    setSignInOpen(false);
                    onNavigate('/parent/sign-in');
                  }}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold text-[#18181B] dark:text-[#F7F4ED] hover:bg-[#FAF6EB] dark:hover:bg-[#262522] transition-colors cursor-pointer block"
                >
                  Parent sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSignInOpen(false);
                    onNavigate('/volunteer/sign-in');
                  }}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold text-[#6B7280] dark:text-[#C8C2B6] hover:text-[#18181B] dark:hover:text-[#F7F4ED] hover:bg-[#FAF6EB] dark:hover:bg-[#262522] transition-colors cursor-pointer block"
                >
                  Volunteer sign in
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onParentRegisterClick}
            className="bg-[#C59B27] hover:bg-[#B89047] active:bg-[#AA8220] text-white text-xs font-semibold px-4.5 py-2.5 rounded-xl shadow-xs hover:shadow-sm transition-colors cursor-pointer inline-flex items-center space-x-1.5"
          >
            <span>Register child</span>
            <ArrowRight className="w-3.5 h-3.5 text-white/90" />
          </button>
        </div>

        {/* Mobile Header Controls */}
        <div className="flex lg:hidden items-center space-x-2">
          <ThemeSwitcher />
          <button
            type="button"
            id="btn-landing-mobile-menu"
            onClick={(e) => {
              e.stopPropagation();
              setMobileMenuOpen(!mobileMenuOpen);
            }}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            className="p-2 rounded-xl text-[#52525B] dark:text-[#C8C2B6] hover:text-[#18181B] dark:hover:text-[#F7F4ED] hover:bg-[#FAF6EB] dark:hover:bg-[#262522] transition-colors cursor-pointer focus:outline-none"
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
            className="lg:hidden border-t border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6] dark:bg-[#181817] shadow-xl overflow-hidden absolute top-full left-0 right-0 z-50"
            data-component-version="landing-header-mobile-menu-v2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-6 space-y-4 flex flex-col">
              {/* Navigation Grid */}
              <div className="grid grid-cols-2 gap-2.5 pb-4 border-b border-[#EAE8E1] dark:border-[#2A2926] text-xs font-semibold tracking-wider text-[#6B7280] dark:text-[#A19D95] uppercase">
                <button
                  type="button"
                  onClick={() => handleNavClick('about')}
                  className="text-left py-2 hover:text-[#18181B] dark:hover:text-[#F7F4ED] transition-colors cursor-pointer"
                >
                  About
                </button>
                <button
                  type="button"
                  onClick={() => handleNavClick('journey')}
                  className="text-left py-2 hover:text-[#18181B] dark:hover:text-[#F7F4ED] transition-colors cursor-pointer"
                >
                  The Process
                </button>
                <button
                  type="button"
                  onClick={() => handleNavClick('safety')}
                  className="text-left py-2 hover:text-[#18181B] dark:hover:text-[#F7F4ED] transition-colors cursor-pointer"
                >
                  Safety
                </button>
                <button
                  type="button"
                  onClick={() => handleNavClick('age-groups')}
                  className="text-left py-2 hover:text-[#18181B] dark:hover:text-[#F7F4ED] transition-colors cursor-pointer"
                >
                  Age Groups
                </button>
                <button
                  type="button"
                  onClick={() => handleNavClick('moments')}
                  className="text-left py-2 hover:text-[#18181B] dark:hover:text-[#F7F4ED] transition-colors cursor-pointer"
                >
                  Past Moments
                </button>
                <button
                  type="button"
                  onClick={() => handleNavClick('faq')}
                  className="text-left py-2 hover:text-[#18181B] dark:hover:text-[#F7F4ED] transition-colors cursor-pointer"
                >
                  FAQ
                </button>
              </div>

              {/* Theme Switcher Row */}
              <div className="flex items-center justify-between py-2.5 border-t border-[#EAE8E1] dark:border-[#2A2926]">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#A19D95]">
                  Appearance
                </span>
                <ThemeSwitcher showLabel />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col space-y-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onParentRegisterClick();
                  }}
                  className="w-full flex items-center justify-between bg-[#C59B27] hover:bg-[#B89047] active:bg-[#AA8220] text-white text-sm font-semibold py-3 px-4 rounded-xl shadow-xs transition-colors cursor-pointer group"
                >
                  <span>Register child</span>
                  <ArrowRight className="w-4 h-4 text-white/90 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>

                {/* Simplified Sign in control on mobile */}
                <div className="pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926] space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#A19D95] px-1">
                    Sign in
                  </span>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onNavigate('/parent/sign-in');
                      }}
                      className="flex items-center justify-between bg-white dark:bg-[#21201D] hover:bg-[#FAF6EB] dark:hover:bg-[#2A2926] text-[#18181B] dark:text-[#F7F4ED] border border-[#D9D6CE] dark:border-[#383733] text-xs font-semibold py-2.5 px-3 rounded-xl transition-colors cursor-pointer group"
                    >
                      <span>Parent</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#71717A] dark:text-[#A19D95] group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onNavigate('/volunteer/sign-in');
                      }}
                      className="flex items-center justify-between bg-white dark:bg-[#21201D] hover:bg-[#FAF6EB] dark:hover:bg-[#2A2926] text-[#18181B] dark:text-[#F7F4ED] border border-[#D9D6CE] dark:border-[#383733] text-xs font-semibold py-2.5 px-3 rounded-xl transition-colors cursor-pointer group"
                    >
                      <span>Volunteer</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#71717A] dark:text-[#A19D95] group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
