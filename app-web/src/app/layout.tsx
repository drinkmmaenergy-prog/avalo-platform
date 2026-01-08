import type { Metadata, Viewport } from 'next';
import { Inter, Manrope } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers/Providers';
import { Toaster } from '@/components/ui/Toaster';

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const manrope = Manrope({ 
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Avalo - Connect with Creators',
    template: '%s | Avalo',
  },
  description: 'Connect with creators, explore exclusive content, and engage in meaningful conversations',
  keywords: ['creators', 'content', 'social', 'subscription', 'exclusive'],
  authors: [{ name: 'Avalo' }],
  creator: 'Avalo',
  publisher: 'Avalo',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://avalo.app'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'Avalo',
    title: 'Avalo - Connect with Creators',
    description: 'Connect with creators, explore exclusive content, and engage in meaningful conversations',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Avalo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Avalo - Connect with Creators',
    description: 'Connect with creators, explore exclusive content, and engage in meaningful conversations',
    images: ['/og-image.png'],
    creator: '@avaloapp',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icons/icon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/icon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png' },
    ],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Avalo',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased bg-white dark:bg-black text-gray-900 dark:text-gray-100">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}