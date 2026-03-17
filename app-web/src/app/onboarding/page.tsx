'use client';

/**
 * Onboarding Wizard — DELIVERABLE C (extended with earn_on step)
 *
 * Steps:
 *   1. Accept Terms + Age gate
 *   2. Set preferred language
 *   3. How do you want to use Avalo? (earn_on selection — OPTIONAL, can skip)
 *   4. Create users/{uid} atomically → profileComplete = true
 *   5. After success → route to /feed (AppShell)
 *
 * On Firestore error: shows explicit error message.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle, ChevronRight, ChevronLeft, Globe, Shield, Sparkles } from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import {
  SUPPORTED_LOCALES,
  LOCALE_DISPLAY_NAMES,
  type SupportedLocale,
} from '@/i18n/config';
import { toast } from '@/components/ui/Toaster';
import {
  EARN_SURFACE_META,
  type EarnSurfaceKey,
} from '@/lib/services/earnerService';

type OnboardingStep = 1 | 2 | 3 | 4;

const TOTAL_STEPS = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading, needsOnboarding, completeOnboarding, refreshUser } = useAuth();
  const { t, locale, setLocale } = useI18n();

  const [step, setStep] = useState<OnboardingStep>(1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState<SupportedLocale>(locale);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Earn on state (step 3) ───────────────────────────────────────
  const [earnOnChoice, setEarnOnChoice] = useState<'connect' | 'earn' | null>(null);
  const [selectedSurfaces, setSelectedSurfaces] = useState<Partial<Record<EarnSurfaceKey, boolean>>>({
    chat: true,
    tips: true,
  });

  // Redirect if not authenticated or already onboarded
  useEffect(() => {
    if (!authLoading && !firebaseUser) {
      // Not logged in — redirect to home (AuthModal will handle login)
      router.replace('/');
    }
    if (!authLoading && firebaseUser && !needsOnboarding) {
      // Already completed onboarding — go to feed (NOT back to onboarding)
      router.replace('/feed');
    }
  }, [authLoading, firebaseUser, needsOnboarding, router]);

  const handleNextStep = () => {
    if (step === 1) {
      if (!termsAccepted) {
        toast({ type: 'warning', title: t('onboarding.mustAcceptTerms') });
        return;
      }
      if (!ageConfirmed) {
        toast({ type: 'warning', title: t('onboarding.mustConfirmAge') });
        return;
      }
      setStep(2);
    } else if (step === 2) {
      // Apply locale selection
      setLocale(selectedLocale);
      setStep(3);
    } else if (step === 3) {
      // earn_on step — user can skip (earnOnChoice=null treated as 'connect')
      setStep(4);
    }
  };

  const handlePreviousStep = () => {
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
    if (step === 4) setStep(3);
  };

  const toggleSurface = (key: EarnSurfaceKey) => {
    setSelectedSurfaces((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleComplete = async () => {
    if (!firebaseUser) return;

    setCreating(true);
    setError(null);

    try {
      const isEarner = earnOnChoice === 'earn';

      // Build earn_surfaces object (only if earner)
      const earn_surfaces = isEarner
        ? {
            chat: selectedSurfaces.chat ?? true,
            calls: selectedSurfaces.calls ?? false,
            tips: selectedSurfaces.tips ?? true,
            media: selectedSurfaces.media ?? false,
            live: selectedSurfaces.live ?? false,
            subscription: selectedSurfaces.subscription ?? false,
            meetings: selectedSurfaces.meetings ?? false,
            events: selectedSurfaces.events ?? false,
          }
        : {
            chat: false,
            calls: false,
            tips: false,
            media: false,
            live: false,
            subscription: false,
            meetings: false,
            events: false,
          };

      // Build earn_profile defaults
      const earn_profile = {
        displayName: firebaseUser.displayName ?? '',
        bio: '',
        chatPriceTokens: 100,
        callRatePerMin: 50,
        subscriptionPrice: 500,
      };

      // Atomically create the user document with all required fields
      const userRef = doc(requireDb(), 'users', firebaseUser.uid);
      await setDoc(userRef, {
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        displayName: firebaseUser.displayName ?? '',
        photoURL: firebaseUser.photoURL ?? '',
        phoneNumber: firebaseUser.phoneNumber ?? '',
        role: 'user',
        locale: selectedLocale,
        termsAcceptedAt: serverTimestamp(),
        ageVerified: true,
        profileComplete: true,
        isCreator: false,
        isVerified: false,
        tokenBalance: 0,
        accountStatus: 'ACTIVE',
        // Canonical earn_on fields
        earn_on: isEarner,
        earn_surfaces,
        earn_profile,
        // Backward-compatible fields
        earnOn: isEarner,
        modes: {
          earnFromChat: isEarner && (selectedSurfaces.chat ?? true),
        },
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
      });

      toast({
        type: 'success',
        title: t('onboarding.profileCreated'),
      });

      // Update auth context — must await to prevent onboarding loop
      await completeOnboarding();
      await refreshUser();

      // Navigate to app — use replace to prevent back-button loop
      router.replace('/feed');
    } catch (err: unknown) {
      // Show explicit Firestore error
      const message = err instanceof Error ? err.message : String(err);
      const firestoreCode = (err as { code?: string }).code;

      let displayError = message;
      if (firestoreCode === 'permission-denied') {
        displayError = `Firestore permission denied: Cannot write to users/${firebaseUser.uid}. Check security rules.`;
      } else if (firestoreCode) {
        displayError = `Firestore error [${firestoreCode}]: ${message}`;
      }

      setError(displayError);
      toast({
        type: 'error',
        title: t('onboarding.profileError'),
        description: displayError,
        duration: 10000,
      });
    } finally {
      setCreating(false);
    }
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!firebaseUser) {
    return null; // redirect in useEffect
  }

  // Popular locales to show first
  const popularLocales: SupportedLocale[] = ['en', 'pl', 'de', 'fr', 'es', 'it', 'pt'];
  const otherLocales = SUPPORTED_LOCALES.filter((l) => !popularLocales.includes(l));

  const surfaceKeys = Object.keys(EARN_SURFACE_META) as EarnSurfaceKey[];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-gray-900 dark:via-black dark:to-gray-900 px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold gradient-text mb-2">
            {t('onboarding.title')}
          </h1>
          <p className="text-muted-foreground">{t('onboarding.subtitle')}</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
            <div
              key={s}
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                s === step
                  ? 'bg-primary-500 text-white scale-110'
                  : s < step
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              {s < step ? <CheckCircle className="w-5 h-5" /> : s}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="card p-6 space-y-6">
          {/* Step 1: Terms + Age Gate */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-6 h-6 text-primary-500" />
                <div>
                  <h2 className="text-lg font-semibold">{t('onboarding.step1Title')}</h2>
                  <p className="text-sm text-muted-foreground">{t('onboarding.step1Desc')}</p>
                </div>
              </div>

              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:border-primary-300 transition dark:border-gray-700">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div className="text-sm">
                    <span>{t('onboarding.acceptTerms')}</span>
                    <div className="flex gap-3 mt-1">
                      <Link href="/legal/terms" target="_blank" className="text-primary-600 underline text-xs">
                        {t('onboarding.viewTerms')}
                      </Link>
                      <Link href="/legal/privacy" target="_blank" className="text-primary-600 underline text-xs">
                        {t('onboarding.viewPrivacy')}
                      </Link>
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:border-primary-300 transition dark:border-gray-700">
                  <input
                    type="checkbox"
                    checked={ageConfirmed}
                    onChange={(e) => setAgeConfirmed(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm">{t('onboarding.ageGate')}</span>
                </label>
              </div>
            </div>
          )}

          {/* Step 2: Language Selection */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <Globe className="w-6 h-6 text-primary-500" />
                <div>
                  <h2 className="text-lg font-semibold">{t('onboarding.step2Title')}</h2>
                  <p className="text-sm text-muted-foreground">{t('onboarding.step2Desc')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {[...popularLocales, ...otherLocales].map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setSelectedLocale(loc)}
                    className={`text-left px-3 py-2 rounded-lg text-sm transition ${
                      loc === selectedLocale
                        ? 'bg-primary-500 text-white font-semibold'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    {LOCALE_DISPLAY_NAMES[loc]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: How do you want to use Avalo? (earn_on) */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="w-6 h-6 text-primary-500" />
                <div>
                  <h2 className="text-lg font-semibold">How do you want to use Avalo?</h2>
                  <p className="text-sm text-muted-foreground">
                    You can always change this later in settings.
                  </p>
                </div>
              </div>

              {/* Choice cards */}
              <div className="grid grid-cols-1 gap-3">
                {/* Option A: Connect & Meet */}
                <button
                  type="button"
                  onClick={() => setEarnOnChoice('connect')}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    earnOnChoice === 'connect'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🤝</span>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">Connect & Meet</div>
                      <div className="text-sm text-muted-foreground">
                        Discover people, chat, and enjoy the platform as a social user
                      </div>
                    </div>
                  </div>
                </button>

                {/* Option B: Earn with Avalo */}
                <button
                  type="button"
                  onClick={() => setEarnOnChoice('earn')}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    earnOnChoice === 'earn'
                      ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">💰</span>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">Earn with Avalo</div>
                      <div className="text-sm text-muted-foreground">
                        Monetize your chat, calls, tips, media, and more
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              {/* Surface selection (shown only if 'earn' chosen) */}
              {earnOnChoice === 'earn' && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Select which surfaces to activate (you can change these later):
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {surfaceKeys.map((key) => {
                      const meta = EARN_SURFACE_META[key];
                      const isChecked = selectedSurfaces[key] ?? false;
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition text-sm ${
                            isChecked
                              ? 'border-pink-400 bg-pink-50 dark:bg-pink-900/20'
                              : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSurface(key)}
                            className="w-4 h-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                          />
                          <span>{meta.icon}</span>
                          <span className="text-gray-800 dark:text-gray-200">{meta.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Skip hint */}
              {!earnOnChoice && (
                <p className="text-xs text-center text-muted-foreground">
                  You can skip this step — earning can be enabled later from Settings.
                </p>
              )}
            </div>
          )}

          {/* Step 4: Confirmation */}
          {step === 4 && (
            <div className="space-y-6 text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-lg font-semibold">{t('onboarding.step3Title')}</h2>
              <p className="text-sm text-muted-foreground">{t('onboarding.step3Desc')}</p>

              {/* Show earn_on summary */}
              {earnOnChoice === 'earn' && (
                <div className="bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800 rounded-lg p-3 text-left">
                  <p className="text-sm font-medium text-pink-800 dark:text-pink-300">
                    💰 Earning mode enabled
                  </p>
                  <p className="text-xs text-pink-600 dark:text-pink-400 mt-1">
                    Active surfaces:{' '}
                    {surfaceKeys
                      .filter((k) => selectedSurfaces[k])
                      .map((k) => EARN_SURFACE_META[k].label)
                      .join(', ') || 'None selected'}
                  </p>
                </div>
              )}

              {earnOnChoice === 'connect' && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-left">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    🤝 Social mode — Connect & Meet
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    You can enable earning later from Earn with Avalo settings.
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-left">
                  <p className="text-sm text-red-700 dark:text-red-300 font-mono break-all">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between pt-4">
            {step > 1 ? (
              <button
                type="button"
                onClick={handlePreviousStep}
                className="btn btn-outline px-4 py-2 text-sm"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                {t('onboarding.previous')}
              </button>
            ) : (
              <div />
            )}

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="btn btn-primary px-6 py-2 text-sm"
              >
                {step === 3 && !earnOnChoice ? 'Skip' : t('onboarding.next')}
                <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleComplete}
                disabled={creating}
                className="btn btn-primary px-6 py-2 text-sm"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {t('onboarding.creatingProfile')}
                  </>
                ) : (
                  t('onboarding.complete')
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
