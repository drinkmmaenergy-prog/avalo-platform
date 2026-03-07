'use client';

/**
 * Hero — Premium landing page hero section.
 *
 * Layout:
 *   LEFT: Headline + description + 2 CTA buttons
 *   RIGHT: Hero image (romantic + premium + tech)
 *
 * CTAs:
 *   Primary: "Start Dating" → opens auth modal
 *   Secondary: "For Creators" → /creator (opens auth modal if not logged in)
 *
 * Uses provided marketing images from /public/marketing/.
 * All interactive elements are React components — no fake buttons in images.
 */

import Image from 'next/image';
import { useAuthModal } from '@/components/AuthModal';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function Hero() {
  const { openAuthModal } = useAuthModal();
  const { firebaseUser, needsOnboarding } = useAuth();
  const router = useRouter();

  const handleStartDating = () => {
    if (firebaseUser) {
      if (needsOnboarding) {
        router.push('/onboarding');
      } else {
        router.push('/feed');
      }
    } else {
      openAuthModal('/feed');
    }
  };

  const handleForCreators = () => {
    if (firebaseUser) {
      if (needsOnboarding) {
        router.push('/onboarding');
      } else {
        router.push('/creator');
      }
    } else {
      openAuthModal('/creator');
    }
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* LEFT — Content */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              Premium Social & Creator Platform
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
              <span className="gradient-text">Connect Beyond</span>
              <br />
              <span className="text-gray-900 dark:text-white">Boundaries</span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 mb-8 max-w-lg mx-auto lg:mx-0 leading-relaxed">
              Meet real people, build meaningful connections, and monetize your creativity — all in one premium ecosystem.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <button
                onClick={handleStartDating}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-lg font-semibold shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 hover:from-purple-700 hover:to-pink-700 transition-all duration-200 transform hover:-translate-y-0.5"
              >
                Start Dating
                <ArrowRight className="w-5 h-5" />
              </button>

              <button
                onClick={handleForCreators}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border-2 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-lg font-semibold hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all duration-200"
              >
                <Sparkles className="w-5 h-5" />
                For Creators
              </button>
            </div>

            {/* Social proof */}
            <div className="mt-10 flex items-center gap-6 justify-center lg:justify-start text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1.5">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 border-2 border-white dark:border-gray-900"
                    />
                  ))}
                </div>
                <span className="ml-2 font-medium">10K+ members</span>
              </div>
              <div className="h-4 w-px bg-gray-300 dark:bg-gray-700" />
              <span>⭐ 4.9 rating</span>
            </div>
          </div>

          {/* RIGHT — Hero Image */}
          <div className="relative flex justify-center lg:justify-end">
            <div className="relative w-full max-w-lg">
              {/* Glow effect behind image */}
              <div className="absolute -inset-4 bg-gradient-to-r from-purple-400/20 to-pink-400/20 rounded-3xl blur-2xl" />

              <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                <Image
                  src="/marketing/hero.png"
                  alt="Avalo — Premium social and dating platform"
                  width={600}
                  height={700}
                  className="w-full h-auto object-cover"
                  priority
                />
              </div>

              {/* Floating badge */}
              <div className="absolute -bottom-4 -left-4 sm:left-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 border border-gray-100 dark:border-gray-700">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white text-lg">
                  💎
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">Token Economy</div>
                  <div className="text-xs text-gray-500">Earn & spend tokens</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

