import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type ThemeSurface = 'public' | 'admin';

interface ThemeContextValue {
  // Current active surface theme
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  activeSurface: ThemeSurface;
  setTheme: (theme: Theme, surface?: ThemeSurface) => void;
  toggleTheme: (surface?: ThemeSurface) => void;

  // Explicit surface themes
  publicTheme: Theme;
  publicResolvedTheme: ResolvedTheme;
  setPublicTheme: (theme: Theme) => void;
  togglePublicTheme: () => void;

  adminTheme: Theme;
  adminResolvedTheme: ResolvedTheme;
  setAdminTheme: (theme: Theme) => void;
  toggleAdminTheme: () => void;
}

export const PUBLIC_STORAGE_KEY = 'koinonia-public-theme';
export const LEGACY_STORAGE_KEY = 'koinonia-theme';
export const ADMIN_STORAGE_KEY = 'koinonia-admin-theme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemPreference(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getStoredPublicTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    const item = localStorage.getItem(PUBLIC_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (item === 'light' || item === 'dark' || item === 'system') {
      return item;
    }
  } catch (e) {
    // localStorage might be unavailable or restricted
  }
  return 'system';
}

function getStoredAdminTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const item = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (item === 'light' || item === 'dark' || item === 'system') {
      return item;
    }
  } catch (e) {
    // localStorage might be unavailable
  }
  return 'light'; // Admin defaults to light mode
}

function detectActiveSurface(): ThemeSurface {
  if (typeof window === 'undefined') return 'public';
  const hash = window.location.hash || '';
  const pathname = window.location.pathname || '';
  if (hash.includes('/admin') || pathname.includes('/admin')) {
    return 'admin';
  }
  return 'public';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [publicTheme, setPublicThemeState] = useState<Theme>(getStoredPublicTheme);
  const [adminTheme, setAdminThemeState] = useState<Theme>(getStoredAdminTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemPreference);
  const [activeSurface, setActiveSurface] = useState<ThemeSurface>(detectActiveSurface);

  // Listen to OS system theme changes
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

  // Track active surface based on window hash and popstate/hashchange
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateSurface = () => {
      setActiveSurface(detectActiveSurface());
    };

    window.addEventListener('hashchange', updateSurface);
    window.addEventListener('popstate', updateSurface);
    return () => {
      window.removeEventListener('hashchange', updateSurface);
      window.removeEventListener('popstate', updateSurface);
    };
  }, []);

  const publicResolvedTheme: ResolvedTheme = useMemo(() => {
    if (publicTheme === 'system') {
      return systemTheme;
    }
    return publicTheme;
  }, [publicTheme, systemTheme]);

  const adminResolvedTheme: ResolvedTheme = useMemo(() => {
    if (adminTheme === 'system') {
      return systemTheme;
    }
    return adminTheme;
  }, [adminTheme, systemTheme]);

  const activeResolvedTheme = activeSurface === 'admin' ? adminResolvedTheme : publicResolvedTheme;
  const activeTheme = activeSurface === 'admin' ? adminTheme : publicTheme;

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

  const setPublicTheme = useCallback((newTheme: Theme) => {
    setPublicThemeState(newTheme);
    try {
      localStorage.setItem(PUBLIC_STORAGE_KEY, newTheme);
      localStorage.setItem(LEGACY_STORAGE_KEY, newTheme);
    } catch (e) {
      console.warn('Could not persist public theme to localStorage', e);
    }
  }, []);

  const togglePublicTheme = useCallback(() => {
    setPublicTheme(publicResolvedTheme === 'dark' ? 'light' : 'dark');
  }, [publicResolvedTheme, setPublicTheme]);

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
    } else {
      setPublicTheme(newTheme);
    }
  }, [activeSurface, setAdminTheme, setPublicTheme]);

  const toggleTheme = useCallback((surface?: ThemeSurface) => {
    const target = surface || activeSurface;
    if (target === 'admin') {
      toggleAdminTheme();
    } else {
      togglePublicTheme();
    }
  }, [activeSurface, toggleAdminTheme, togglePublicTheme]);

  const value = useMemo(
    () => ({
      theme: activeTheme,
      resolvedTheme: activeResolvedTheme,
      activeSurface,
      setTheme,
      toggleTheme,
      publicTheme,
      publicResolvedTheme,
      setPublicTheme,
      togglePublicTheme,
      adminTheme,
      adminResolvedTheme,
      setAdminTheme,
      toggleAdminTheme,
    }),
    [
      activeTheme,
      activeResolvedTheme,
      activeSurface,
      setTheme,
      toggleTheme,
      publicTheme,
      publicResolvedTheme,
      setPublicTheme,
      togglePublicTheme,
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
