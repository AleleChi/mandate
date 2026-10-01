import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme, ThemeSurface } from '../../context/ThemeContext';

export interface ThemeSwitcherProps {
  className?: string;
  showLabel?: boolean;
  surface?: ThemeSurface;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  className = '',
  showLabel = false,
  surface,
}) => {
  const {
    resolvedTheme,
    toggleTheme,
    adminResolvedTheme,
    toggleAdminTheme,
    volunteerResolvedTheme,
    toggleVolunteerTheme,
    parentResolvedTheme,
    toggleParentTheme,
    activeSurface,
  } = useTheme();

  const effectiveSurface = surface || activeSurface;

  const isDark = effectiveSurface === 'admin'
    ? adminResolvedTheme === 'dark'
    : effectiveSurface === 'volunteer'
    ? volunteerResolvedTheme === 'dark'
    : effectiveSurface === 'parent' || effectiveSurface === 'public'
    ? parentResolvedTheme === 'dark'
    : resolvedTheme === 'dark';

  const handleToggle = () => {
    if (effectiveSurface === 'admin') {
      toggleAdminTheme();
    } else if (effectiveSurface === 'volunteer') {
      toggleVolunteerTheme();
    } else if (effectiveSurface === 'parent' || effectiveSurface === 'public') {
      toggleParentTheme();
    } else {
      toggleTheme();
    }
  };

  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={label}
      title={label}
      className={`relative inline-flex items-center justify-center rounded-xl p-2 text-xs font-semibold transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C59B27] focus-visible:ring-offset-2 ${
        isDark
          ? 'text-[#E5B834] bg-[#262520] border border-[#3A3835] hover:bg-[#2F2D27] hover:border-[#C59B27]/50 focus-visible:ring-offset-[#19191A]'
          : 'text-[#9A7326] bg-[#FAF6EB] border border-[#E5D5AE] hover:bg-[#F5EED9] hover:border-[#C59B27]/60 focus-visible:ring-offset-[#FAF9F6]'
      } ${className}`}
    >
      {isDark ? (
        <Moon className="w-4 h-4 stroke-[2] transition-transform duration-300 rotate-0" />
      ) : (
        <Sun className="w-4 h-4 stroke-[2] transition-transform duration-300 rotate-0" />
      )}
      {showLabel && (
        <span className="ml-2 font-sans tracking-wide">
          {isDark ? 'Dark' : 'Light'}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </button>
  );
};
