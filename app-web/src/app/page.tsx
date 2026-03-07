'use client';

/**
 * Root landing page — Avalo premium homepage.
 *
 * Renders at / via App Router (src/app/page.tsx).
 *
 * Sections:
 *   1. Navbar (public navigation)
 *   2. Hero (premium + CTA buttons)
 *   3. Feature highlights (Token Economy, Creator Tools, Safety, Global)
 *   4. Download App section (phone mockup + store buttons)
 *   5. Quick links
 *   6. Footer
 *
 * INVARIANTS:
 *   - No auth required to view this page.
 *   - CTA buttons open AuthModal if not logged in.
 *   - All interactive elements are React components (no fake UI).
 */

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import DownloadSection from '@/components/DownloadSection';
import Footer from '@/components/Footer';
import { useAuthModal } from '@/components/AuthModal';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import { Coins, Palette, Shield, Globe } from 'lucide-react';

export default function HomePage() {
  const { openAuthModal } = useAuthModal();
  const { firebaseUser, needsOnboarding } = useAuth();
  const router = useRouter();

  const handleFeatureClick = (href: string, requireAuth: boolean) => {
    if (requireAuth && !firebaseUser) {
      openAuthModal(href);
    } else if (firebaseUser && needsOnboarding) {
      router.push('/onboarding');
    } else {
      router.push(href);
    }
  };

  const features = [
    {
      icon: Coins,
      title: 'Token Economy',
      desc: 'Buy, earn, and withdraw tokens seamlessly.',
      href: '/features/token-economy',
      requireAuth: false,
    },
    {
      icon: Palette,
      title: 'Creator Tools',
      desc: 'Analytics, payouts, and audience management.',
      href: '/creator',
      requireAuth: true,
    },
    {
      icon: Shield,
      title: 'Safety First',
      desc: 'AI-powered moderation and verified profiles.',
      href: '/legal/safety',
      requireAuth: false,
    },
    {
      icon: Globe,
      title: 'Global Platform',
      desc: 'Multi-language, multi-currency support.',
      href: '/features',
      requireAuth: false,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      <Navbar />

      {/* Hero */}
      <Hero />

      {/* Feature Highlights */}
      <section className="py-20 sm:py-24 bg-white dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Everything You Need
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              A complete premium ecosystem for social connections and creator economy.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <button
                  key={feature.title}
                  onClick={() => handleFeatureClick(feature.href, feature.requireAuth)}
                  className="group text-left p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg hover:border-purple-200 dark:hover:border-purple-800 transition-all duration-200"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {feature.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Download App */}
      <DownloadSection />

      {/* Quick Links */}
      <section className="py-12 bg-gray-50 dark:bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex flex-wrap gap-6 justify-center">
            {[
              { href: '/features', label: 'Features' },
              { href: '/creators', label: 'For Creators' },
              { href: '/investors', label: 'Investors' },
              { href: '/legal/safety', label: 'Safety' },
              { href: '/download', label: 'Download App' },
              { href: '/features/token-economy', label: 'Token Economy' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}

