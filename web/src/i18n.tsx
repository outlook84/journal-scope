import { useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  I18nContext,
  getInitialLocale,
  getMessages,
  supportedLocales,
  type I18nContextValue,
  type SupportedLocale
} from './i18n-context';

export type { SupportedLocale } from './i18n-context';

export function LocaleProvider({
  children,
  initialLocale
}: {
  children: ReactNode;
  initialLocale?: SupportedLocale;
}) {
  const [locale, setLocale] = useState<SupportedLocale>(() => initialLocale ?? getInitialLocale());

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }

    try {
      window.localStorage.setItem('journal-scope:locale', locale);
    } catch {
      // Ignore storage failures and keep rendering with the current locale.
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    messages: getMessages(locale),
    supportedLocales
  }), [locale]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}
