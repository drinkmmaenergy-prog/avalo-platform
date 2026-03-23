// src/app/layout.tsx

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers/Providers';
import { Toaster } from '@/components/ui/Toaster';
import CookieConsent from '@/components/legal/CookieConsent';
import AgeGate from '@/components/legal/AgeGate';

const inter = Inter({ subsets: ['latin'] });

/** FIX 96B-C: All 20 supported locales for hreflang tags. */
const SUPPORTED_LOCALES = [
  'en', 'pl', 'de', 'fr', 'es', 'pt', 'it', 'nl', 'sv',
  'ru', 'uk', 'tr', 'ja', 'ko', 'zh', 'ar', 'hi', 'th', 'vi', 'id',
] as const;

export const metadata: Metadata = {
  title: 'Avalo',
  description: 'Avalo – creator economy platform',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* FIX 67B: PWA manifest + Apple mobile web app meta tags */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#E4458F" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Avalo" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />

        {/* FIX 96B-C: Hreflang tags for SEO — tells Google about language versions */}
        {SUPPORTED_LOCALES.map((l) => (
          <link key={l} rel="alternate" hrefLang={l} href={`https://avalo.app/${l}`} />
        ))}
        <link rel="alternate" hrefLang="x-default" href="https://avalo.app" />

        {/* FIX 97D: JSON-LD Structured Data for the application */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              'name': 'Avalo',
              'description': 'Connect, create, earn — the social platform for authentic connections',
              'url': 'https://avalo.app',
              'applicationCategory': 'SocialNetworkingApplication',
              'operatingSystem': 'Web',
              'offers': {
                '@type': 'Offer',
                'price': '0',
                'priceCurrency': 'USD',
              },
            }),
          }}
        />

        {/* FIX 48D: Initialize dark mode before first paint to avoid flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('avalo-dark-mode');
                  if (saved === 'true') {
                    document.documentElement.classList.add('dark');
                  } else if (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    document.documentElement.classList.add('dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <Providers>
          <AgeGate>
            {children}
          </AgeGate>
          <Toaster />
          <CookieConsent />
        </Providers>
      </body>
    </html>
  );
}
