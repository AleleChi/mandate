import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type ThemeSurface = 'parent' | 'volunteer' | 'admin' | 'public';

interface ThemeContextValue {
  // Current active surface theme
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  activeSurface: ThemeSurface;
  setTheme: (theme: Theme, surface?: ThemeSurface) => void;
  toggleTheme: (surface?: ThemeSurface) => void;

  // Parent surface theme
  parentTheme: Theme;
  parentResolvedTheme: ResolvedTheme;
  setParentTheme: (theme: Theme) => void;
  toggleParentTheme: () => void;

  // Volunteer surface theme
  volunteerTheme: Theme;
  volunteerResolvedTheme: ResolvedTheme;
  setVolunteerTheme: (theme: Theme) => void;
  toggleVolunteerTheme: () => void;

  // Admin surface theme
  adminTheme: Theme;
  adminResolvedTheme: ResolvedTheme;
  setAdminTheme: (theme: Theme) => void;
  toggleAdminTheme: () => void;

  // Public surface aliases (backwards compatibility for landing, public header, etc.)
  publicTheme: Theme;
  publicResolvedTheme: ResolvedTheme;
  setPublicTheme: (theme: Theme) => void;
  togglePublicTheme: () => void;
}

export const PARENT_STORAGE_KEY = 'koinonia-parent-theme';
export const VOLUNTEER_STORAGE_KEY = 'koinonia-volunteer-theme';
export const ADMIN_STORAGE_KEY = 'koinonia-admin-theme';
export const PUBLIC_STORAGE_KEY = 'koinonia-public-theme';
export const LEGACY_STORAGE_KEY = 'koinonia-theme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemPreference(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Parent default rule:
 * If the user has a saved preference ('light' | 'dark'), use it.
 * Otherwise, DEFAULT TO LIGHT. Do NOT default from OS/system dark mode or admin theme.
 */
function getStoredParentTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const item = localStorage.getItem(PARENT_STORAGE_KEY) ||
                 localStorage.getItem(PUBLIC_STORAGE_KEY) ||
                 localStorage.getItem(LEGACY_STORAGE_KEY);
    if (item === 'light' || item === 'dark') {
      return item;
    }
  } catch (e) {
    // localStorage might be unavailable or restricted
  }
  return 'light'; // First visit must be LIGHT
}

/**
 * Volunteer default rule:
 * If the user has a saved preference ('light' | 'dark'), use it.
 * Otherwise, DEFAULT TO LIGHT. Do NOT default from OS/system dark mode or admin theme.
 */
function getStoredVolunteerTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const item = localStorage.getItem(VOLUNTEER_STORAGE_KEY);
    if (item === 'light' || item === 'dark') {
      return item;
    }
  } catch (e) {
    // localStorage might be unavailable
  }
  return 'light'; // First visit must be LIGHT
}

/**
 * Admin default rule:
 * If the user has a saved preference ('light' | 'dark'), use it.
 * Otherwise, DEFAULT TO LIGHT.
 */
function getStoredAdminTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const item = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (item === 'light' || item === 'dark') {
      return item;
    }
  } catch (e) {
    // localStorage might be unavailable
  }
  return 'light'; // Admin defaults to light mode
}

function detectActiveSurface(): ThemeSurface {
  if (typeof window === 'undefined') return 'parent';
  const hash = window.location.hash || '';
  const pathname = window.location.pathname || '';
  if (hash.includes('/admin') || pathname.includes('/admin')) {
    return 'admin';
  }
  if (hash.includes('/volunteer') || pathname.includes('/volunteer')) {
    return 'volunteer';
  }
  return 'parent';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [parentTheme, setParentThemeState] = useState<Theme>(getStoredParentTheme);
  const [volunteerTheme, setVolunteerThemeState] = useState<Theme>(getStoredVolunteerTheme);
  const [adminTheme, setAdminThemeState] = useState<Theme>(getStoredAdminTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemPreference);
  const [activeSurface, setActiveSurface] = useState<ThemeSurface>(detectActiveSurface);

  // Listen to OS system theme changes (only affects 'system' preference if explicitly set)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  // Track active surface based on window hash, pathname, popstate, pushState, and replaceState
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateSurface = () => {
      setActiveSurface(detectActiveSurface());
    };

    window.addEventListener('hashchange', updateSurface);
    window.addEventListener('popstate', updateSurface);

    // Patch history pushState and replaceState to catch SPA navigations immediately
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      updateSurface();
      return result;
    };

    window.history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      updateSurface();
      return result;
    };

    return () => {
      window.removeEventListener('hashchange', updateSurface);
      window.removeEventListener('popstate', updateSurface);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  const parentResolvedTheme: ResolvedTheme = useMemo(() => {
    if (parentTheme === 'system') {
      return systemTheme;
    }
    return parentTheme === 'dark' ? 'dark' : 'light';
  }, [parentTheme, systemTheme]);

  const volunteerResolvedTheme: ResolvedTheme = useMemo(() => {
    if (volunteerTheme === 'system') {
      return systemTheme;
    }
    return volunteerTheme === 'dark' ? 'dark' : 'light';
  }, [volunteerTheme, systemTheme]);

  const adminResolvedTheme: ResolvedTheme = useMemo(() => {
    if (adminTheme === 'system') {
      return systemTheme;
    }
    return adminTheme === 'dark' ? 'dark' : 'light';
  }, [adminTheme, systemTheme]);

  const activeResolvedTheme: ResolvedTheme = useMemo(() => {
    if (activeSurface === 'admin') return adminResolvedTheme;
    if (activeSurface === 'volunteer') return volunteerResolvedTheme;
    return parentResolvedTheme;
  }, [activeSurface, adminResolvedTheme, volunteerResolvedTheme, parentResolvedTheme]);

  const activeTheme: Theme = useMemo(() => {
    if (activeSurface === 'admin') return adminTheme;
    if (activeSurface === 'volunteer') return volunteerTheme;
    return parentTheme;
  }, [activeSurface, adminTheme, volunteerTheme, parentTheme]);

  // Synchronize document attribute and class for the active surface
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-theme', activeResolvedTheme);
    if (activeResolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [activeResolvedTheme]);

  // Setters with isolated persistence
  const setParentTheme = useCallback((newTheme: Theme) => {
    setParentThemeState(newTheme);
    try {
      localStorage.setItem(PARENT_STORAGE_KEY, newTheme);
      localStorage.setItem(PUBLIC_STORAGE_KEY, newTheme);
      localStorage.setItem(LEGACY_STORAGE_KEY, newTheme);
    } catch (e) {
      console.warn('Could not persist parent theme to localStorage', e);
    }
  }, []);

  const toggleParentTheme = useCallback(() => {
    setParentTheme(parentResolvedTheme === 'dark' ? 'light' : 'dark');
  }, [parentResolvedTheme, setParentTheme]);

  const setVolunteerTheme = useCallback((newTheme: Theme) => {
    setVolunteerThemeState(newTheme);
    try {
      localStorage.setItem(VOLUNTEER_STORAGE_KEY, newTheme);
    } catch (e) {
      console.warn('Could not persist volunteer theme to localStorage', e);
    }
  }, []);

  const toggleVolunteerTheme = useCallback(() => {
    setVolunteerTheme(volunteerResolvedTheme === 'dark' ? 'light' : 'dark');
  }, [volunteerResolvedTheme, setVolunteerTheme]);

  const setAdminTheme = useCallback((newTheme: Theme) => {
    setAdminThemeState(newTheme);
    try {
      localStorage.setItem(ADMIN_STORAGE_KEY, newTheme);
    } catch (e) {
      console.warn('Could not persist admin theme to localStorage', e);
    }
  }, []);

  const toggleAdminTheme = useCallback(() => {
    setAdminTheme(adminResolvedTheme === 'dark' ? 'light' : 'dark');
  }, [adminResolvedTheme, setAdminTheme]);

  const setTheme = useCallback((newTheme: Theme, surface?: ThemeSurface) => {
    const target = surface || activeSurface;
    if (target === 'admin') {
      setAdminTheme(newTheme);
    } else if (target === 'volunteer') {
      setVolunteerTheme(newTheme);
    } else {
      setParentTheme(newTheme);
    }
  }, [activeSurface, setAdminTheme, setVolunteerTheme, setParentTheme]);

  const toggleTheme = useCallback((surface?: ThemeSurface) => {
    const target = surface || activeSurface;
    if (target === 'admin') {
      toggleAdminTheme();
    } else if (target === 'volunteer') {
      toggleVolunteerTheme();
    } else {
      toggleParentTheme();
    }
  }, [activeSurface, toggleAdminTheme, toggleVolunteerTheme, toggleParentTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: activeTheme,
      resolvedTheme: activeResolvedTheme,
      activeSurface,
      setTheme,
      toggleTheme,

      // Parent
      parentTheme,
      parentResolvedTheme,
      setParentTheme,
      toggleParentTheme,

      // Volunteer
      volunteerTheme,
      volunteerResolvedTheme,
      setVolunteerTheme,
      toggleVolunteerTheme,

      // Admin
      adminTheme,
      adminResolvedTheme,
      setAdminTheme,
      toggleAdminTheme,

      // Public aliases
      publicTheme: parentTheme,
      publicResolvedTheme: parentResolvedTheme,
      setPublicTheme: setParentTheme,
      togglePublicTheme: toggleParentTheme,
    }),
    [
      activeTheme,
      activeResolvedTheme,
      activeSurface,
      setTheme,
      toggleTheme,
      parentTheme,
      parentResolvedTheme,
      setParentTheme,
      toggleParentTheme,
      volunteerTheme,
      volunteerResolvedTheme,
      setVolunteerTheme,
      toggleVolunteerTheme,
      adminTheme,
      adminResolvedTheme,
      setAdminTheme,
      toggleAdminTheme,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
