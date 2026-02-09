'use client';

/**
 * I18nProvider — Client-side reactive internationalisation context.
 *
 * Single source of truth: locale in cookie + React state.
 * Changing locale rerenders the entire subtree instantly (no page reload).
 *
 * Usage:
 *   const { t, locale, setLocale } = useI18n();
 *   t('auth.signIn')  // → "Sign In" or "Zaloguj się"
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';

import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  type SupportedLocale,
} from '@/i18n/config';

// ── Message cache ──────────────────────────────────────
type Messages = Record<string, unknown>;

const messageCache = new Map<string, Messages>();

async function loadMessages(locale: SupportedLocale): Promise<Messages> {
  if (messageCache.has(locale)) {
    return messageCache.get(locale)!;
  }

  try {
    const mod = await import(`@/i18n/messages/${locale}.json`);
    const msgs: Messages = mod.default ?? mod;
    messageCache.set(locale, msgs);
    return msgs;
  } catch {
    // Fallback to English
    if (locale !== 'en') {
      return loadMessages('en' as SupportedLocale);
    }
    return {};
  }
}

// ── Cookie helpers ─────────────────────────────────────
const LOCALE_COOKIE = 'avalo_locale';

function readLocaleCookie(): SupportedLocale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;

  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`));

  if (match) {
    const val = match.split('=')[1] as SupportedLocale;
    if (SUPPORTED_LOCALES.includes(val)) return val;
  }

  // Browser language detection
  if (typeof navigator !== 'undefined') {
    const browserLang = navigator.language?.split('-')[0] as SupportedLocale;
    if (SUPPORTED_LOCALES.includes(browserLang)) return browserLang;
  }

  return DEFAULT_LOCALE;
}

function writeLocaleCookie(locale: SupportedLocale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`;
}

// ── Nested key resolver ────────────────────────────────
function resolveKey(messages: Messages, key: string): string {
  const parts = key.split('.');
  let current: unknown = messages;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key; // Fallback: return the key itself
    }
  }

  return typeof current === 'string' ? current : key;
}

// ── Context ────────────────────────────────────────────
interface I18nContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string) => string;
  ready: boolean;
}

const I18nContext = createContext<I18nContextType>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key: string) => key,
  ready: false,
});

// ── Provider ───────────────────────────────────────────
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);
  const [messages, setMessages] = useState<Messages>({});
  const [ready, setReady] = useState(false);

  // Load initial locale from cookie
  useEffect(() => {
    const detected = readLocaleCookie();
    setLocaleState(detected);
  }, []);

  // Load messages whenever locale changes
  useEffect(() => {
    let cancelled = false;

    loadMessages(locale).then((msgs) => {
      if (!cancelled) {
        setMessages(msgs);
        setReady(true);
        // Update html lang attribute
        if (typeof document !== 'undefined') {
          document.documentElement.lang = locale;
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    if (!SUPPORTED_LOCALES.includes(newLocale)) return;
    writeLocaleCookie(newLocale);
    setLocaleState(newLocale);
  }, []);

  const t = useCallback(
    (key: string): string => resolveKey(messages, key),
    [messages],
  );

  const value = useMemo<I18nContextType>(
    () => ({ locale, setLocale, t, ready }),
    [locale, setLocale, t, ready],
  );

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────
export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
