import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export interface ThemeSwitcherProps {
  className?: string;
  showLabel?: boolean;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  className = '',
  showLabel = false,
}) => {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={`relative inline-flex items-center justify-center rounded-xl p-2 text-xs font-semibold transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C59B27] focus-visible:ring-offset-2 ${
        isDark
          ? 'text-[#E5B834] bg-[#262522] border border-[#3D3B36] hover:bg-[#2F2E2A] hover:border-[#C59B27]/50 focus-visible:ring-offset-[#181817]'
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
