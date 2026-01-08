import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../styles/globals.css';
import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Avalo - The Future of Social Connections',
  description: 'Join Avalo, the next-generation social platform that connects people through meaningful experiences.',
  keywords: ['social', 'connections', 'avalo', 'dating', 'friends', 'networking'],
  authors: [{ name: 'Avalo Team' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://avalo.app',
    siteName: 'Avalo',
    title: 'Avalo - The Future of Social Connections',
    description: 'Join Avalo, the next-generation social platform that connects people through meaningful experiences.',
    images: [
      {
        url: '/og-cover.png',
        width: 1200,
        height: 630,
        alt: 'Avalo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Avalo - The Future of Social Connections',
    description: 'Join Avalo, the next-generation social platform that connects people through meaningful experiences.',
    images: ['/og-cover.png'],
    creator: '@avaloapp',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Nav />
        <main className="min-h-screen pt-16">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}