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
import { Users, Bot, Coins, CalendarCheck } from 'lucide-react';

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

  /* FIX 66: Updated value propositions to match actual platform features */
  const features = [
    {
      icon: Users,
      title: 'Meet Real People',
      desc: 'Discovery with verified profiles and authentic connections.',
      href: '/discover',
      requireAuth: true,
    },
    {
      icon: Bot,
      title: 'Chat with AI Companions',
      desc: 'AI personality system — practice, connect, and explore.',
      href: '/ai',
      requireAuth: true,
    },
    {
      icon: Coins,
      title: 'Earn as a Creator',
      desc: '8 monetization surfaces: tips, subscriptions, media, events, and more.',
      href: '/creator',
      requireAuth: true,
    },
    {
      icon: CalendarCheck,
      title: 'Safe Meetings',
      desc: 'Calendar with escrow payments and built-in safety features.',
      href: '/calendar',
      requireAuth: true,
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
                  className="group text-left p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg hover:border-[#E4458F]/30 dark:hover:border-[#E4458F]/40 transition-all duration-200"
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{background: 'linear-gradient(135deg, rgba(232,89,60,0.12), rgba(228,69,143,0.12), rgba(139,92,246,0.12))'}}>
                    <Icon className="w-6 h-6 text-[#E4458F]" />
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

          {/* FIX 66: Social proof placeholder — no fake numbers */}
          <div className="mt-14 text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Trusted by creators worldwide
            </p>
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
              { href: '/terms', label: 'Terms of Service' },
              { href: '/privacy', label: 'Privacy Policy' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-[#E4458F] hover:text-[#E8593C] transition"
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

