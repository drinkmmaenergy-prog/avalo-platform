type Locale = 'pl' | 'en' | string;

const FALLBACK_MESSAGES: Record<string, { pl: string; en: string }> = {
  UNKNOWN_ERROR: {
    pl: 'Wystąpił nieoczekiwany błąd',
    en: 'An unexpected error occurred',
  },
};

export function getErrorMessage(
  errorCode: unknown,
  locale: Locale = 'en'
): string {
  const code =
    typeof errorCode === 'string'
      ? errorCode
      : errorCode && typeof errorCode === 'object' && 'code' in errorCode
      ? String((errorCode as any).code)
      : 'UNKNOWN_ERROR';

  const entry = FALLBACK_MESSAGES[code] || FALLBACK_MESSAGES.UNKNOWN_ERROR;

  if (locale === 'pl') return entry.pl;
  return entry.en;
}

