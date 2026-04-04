import { useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  ThemeContext,
  getInitialThemePreference,
  resolveTheme,
  supportedThemes,
  type ResolvedTheme,
  type ThemeContextValue,
  type ThemePreference
} from './theme-context';

export type { ResolvedTheme, ThemePreference } from './theme-context';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => getInitialThemePreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(getInitialThemePreference()));

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateResolvedTheme = () => {
      setResolvedTheme(resolveTheme(themePreference));
    };

    updateResolvedTheme();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateResolvedTheme);
      return () => mediaQuery.removeEventListener('change', updateResolvedTheme);
    }

    mediaQuery.addListener(updateResolvedTheme);
    return () => mediaQuery.removeListener(updateResolvedTheme);
  }, [themePreference]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.dataset.themePreference = themePreference;
      document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    }

    try {
      window.localStorage.setItem('journal-scope:theme', themePreference);
    } catch {
      // Ignore storage failures and keep rendering with the current preference.
    }
  }, [resolvedTheme, themePreference]);

  const value = useMemo<ThemeContextValue>(() => ({
    themePreference,
    resolvedTheme,
    setThemePreference,
    supportedThemes
  }), [resolvedTheme, themePreference]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
