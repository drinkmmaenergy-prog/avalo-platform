/**
 * FIX 96B-A — Auto Language Detection Middleware
 *
 * Detects the user's preferred language from the Accept-Language header
 * on first visit and sets the `avalo_locale` cookie.
 *
 * If the user already has a locale cookie, the middleware is a no-op.
 *
 * NOTE: Uses the same cookie name as I18nProvider for consistency.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SUPPORTED_LOCALES = [
  'en', 'pl', 'de', 'fr', 'es', 'pt', 'it', 'nl', 'sv',
  'ru', 'uk', 'tr', 'ja', 'ko', 'zh', 'ar', 'hi', 'th', 'vi', 'id',
] as const;

const DEFAULT_LOCALE = 'en';
const LOCALE_COOKIE = 'avalo_locale';

export function middleware(request: NextRequest) {
  // If user already has a valid locale cookie, do nothing
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale && (SUPPORTED_LOCALES as readonly string[]).includes(cookieLocale)) {
    return NextResponse.next();
  }

  // Auto-detect from Accept-Language header
  const acceptLang = request.headers.get('accept-language') || '';
  const detected = acceptLang
    .split(',')
    .map((l) => l.split(';')[0].trim().split('-')[0].toLowerCase())
    .find((l) => (SUPPORTED_LOCALES as readonly string[]).includes(l)) || DEFAULT_LOCALE;

  const response = NextResponse.next();
  response.cookies.set(LOCALE_COOKIE, detected, {
    path: '/',
    maxAge: 365 * 24 * 60 * 60, // 1 year
    sameSite: 'lax',
  });

  return response;
}

/** Only run middleware on page requests (skip static assets, API routes, _next). */
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.json|robots.txt|sitemap.xml).*)',
  ],
};
