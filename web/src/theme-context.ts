import { createContext, useContext } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'journal-scope:theme';

export type ThemeContextValue = {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemePreference: (theme: ThemePreference) => void;
  supportedThemes: ThemePreference[];
};

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getInitialThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    // Ignore storage failures and fall back to system theme.
  }

  return 'system';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? getSystemTheme() : preference;
}

export const supportedThemes: ThemePreference[] = ['system', 'light', 'dark'];

export const ThemeContext = createContext<ThemeContextValue>({
  themePreference: 'system',
  resolvedTheme: 'dark',
  setThemePreference: () => {},
  supportedThemes
});

export function useTheme() {
  return useContext(ThemeContext);
}
