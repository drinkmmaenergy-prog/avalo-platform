'use client';

/**
 * Onboarding Wizard — DELIVERABLE C (extended with FIX 95 dating-profile steps + earn_on)
 *
 * Steps:
 *   1. Accept Terms + Age gate
 *   2. Set preferred language
 *   3. Gender (FIX 95)
 *   4. Orientation (FIX 95)
 *   5. Birthdate (FIX 95)
 *   6. City (FIX 95)
 *   7. How do you want to use Avalo? (earn_on selection — OPTIONAL, can skip)
 *   8. Photos (FIX 95)
 *   9. Confirmation → Create users/{uid} atomically → profileComplete = true
 *  10. Selfie verification (FIX 77)
 *
 * After success → route to /feed (AppShell)
 *
 * On Firestore error: shows explicit error message.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle, ChevronRight, ChevronLeft, Globe, Shield, Sparkles, Camera } from 'lucide-react';
import { doc, setDoc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { requireDb, requireStorage, requireFunctions } from '@/lib/firebase';
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

type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const TOTAL_STEPS = 10;

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

  // ── FIX 95: Dating-profile state (steps 3-6, 8) ──────────────────
  const [gender, setGender] = useState('');
  const [orientation, setOrientation] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [city, setCity] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Earn on state (step 7) ───────────────────────────────────────
  const [earnOnChoice, setEarnOnChoice] = useState<'connect' | 'earn' | null>(null);
  const [selectedSurfaces, setSelectedSurfaces] = useState<Partial<Record<EarnSurfaceKey, boolean>>>({
    chat: true,
    tips: true,
  });

  // ── FIX 77: Selfie verification state (step 10) ────────────────────
  const [selfiePreview, setSelfiePreview] = useState('');
  const [selfieURL, setSelfieURL] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<'pending' | 'match' | 'mismatch' | null>(null);

  // ── FIX 109: Welcome bonus modal state ────────────────────────────
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  // Redirect if not authenticated or already onboarded
  useEffect(() => {
    if (!authLoading && !firebaseUser) {
      // Not logged in — redirect to home (AuthModal will handle login)
      router.replace('/');
    }
    if (!authLoading && firebaseUser && !needsOnboarding && step !== 10) {
      // Already completed onboarding — go to feed (NOT back to onboarding)
      // FIX 77: Skip redirect if on selfie verification step (step 10)
      router.replace('/feed');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, firebaseUser, needsOnboarding, router, step]);

  // ── FIX 95: Age calculation helper ────────────────────────────────
  const calculateAge = (dob: string) => {
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age;
  };

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
      // FIX 95: Gender — must select
      if (!gender) {
        toast({ type: 'warning', title: 'Please select your gender' });
        return;
      }
      setStep(4);
    } else if (step === 4) {
      // FIX 95: Orientation — must select
      if (!orientation) {
        toast({ type: 'warning', title: "Please select who you're looking for" });
        return;
      }
      setStep(5);
    } else if (step === 5) {
      // FIX 95: Birthdate — must be 18+
      if (!dateOfBirth) {
        toast({ type: 'warning', title: 'Please enter your date of birth' });
        return;
      }
      if (calculateAge(dateOfBirth) < 18) {
        toast({ type: 'error', title: 'You must be at least 18 years old' });
        return;
      }
      setStep(6);
    } else if (step === 6) {
      // FIX 95: City — must not be empty
      if (!city.trim()) {
        toast({ type: 'warning', title: 'Please enter your city' });
        return;
      }
      setStep(7);
    } else if (step === 7) {
      // earn_on step — user can skip (earnOnChoice=null treated as 'connect')
      setStep(8);
    } else if (step === 8) {
      // FIX 95: Photos — minimum 3 required
      if (photos.length < 3) {
        toast({ type: 'warning', title: `Please upload at least 3 photos (${photos.length}/3)` });
        return;
      }
      setStep(9);
    } else if (step === 9) {
      // FIX 77: After confirmation, go to selfie verification
      setStep(10);
    }
  };

  const handlePreviousStep = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else if (step === 4) setStep(3);
    else if (step === 5) setStep(4);
    else if (step === 6) setStep(5);
    else if (step === 7) setStep(6);
    else if (step === 8) setStep(7);
    else if (step === 9) setStep(8);
    else if (step === 10) setStep(9);
  };

  // ── FIX 95: Photo upload handler ──────────────────────────────────
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!firebaseUser) return;
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (photos.length >= 6) break;
      try {
        const storage = requireStorage();
        const storageRef = ref(storage, `users/${firebaseUser.uid}/photos/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        setPhotos(prev => [...prev, url]);
      } catch (err) {
        toast({ type: 'error', title: 'Failed to upload photo', description: String(err) });
      }
    }
    // Reset the file input so the same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';
  };

  // FIX 77: Capture selfie using device camera
  const captureSelfie = async () => {
    if (!firebaseUser) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 640 },
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      // Wait for video to stabilize
      await new Promise((r) => setTimeout(r, 500));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());

      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85)
      );
      setSelfiePreview(URL.createObjectURL(blob));

      // Upload immediately for verification
      const storage = requireStorage();
      const storageRef = ref(storage, `verification/${firebaseUser.uid}/selfie_${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      setSelfieURL(url);
    } catch (err) {
      toast({
        type: 'error',
        title: 'Camera access required',
        description: 'Please allow camera permissions for verification.',
      });
    }
  };

  // FIX 77: Submit selfie for comparison
  const submitSelfie = async () => {
    if (!selfieURL || !firebaseUser) return;
    setVerifying(true);
    try {
      const functions = requireFunctions();
      const fn = httpsCallable(functions, 'verifySelfie');
      const result = await fn({ selfieURL });
      const data = result.data as any;

      if (data.verified || data.match) {
        setVerificationResult('match');
        // Update user verification status
        const db = requireDb();
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          'verification.selfie': true,
          'verification.selfieVerifiedAt': serverTimestamp(),
        });
        await updateDoc(doc(db, 'public_profiles', firebaseUser.uid), { verified: true }).catch(() => {});
        // Auto-proceed to feed after 2 seconds
        setTimeout(() => router.replace('/feed'), 2000);
      } else {
        setVerificationResult('mismatch');
      }
    } catch (err) {
      console.error('Verification failed:', err);
      setVerificationResult('mismatch');
    }
    setVerifying(false);
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

      // FIX 82: Read referral code from sessionStorage (set during registration)
      let referredBy: string | null = null;
      try {
        referredBy = sessionStorage.getItem('avalo_referral_code') || null;
        if (referredBy) sessionStorage.removeItem('avalo_referral_code');
      } catch {}

      // Atomically create the user document with all required fields
      const userRef = doc(requireDb(), 'users', firebaseUser.uid);
      await setDoc(userRef, {
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        displayName: firebaseUser.displayName ?? '',
        photoURL: photos[0] || firebaseUser.photoURL || '',
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
        // FIX 95: Dating-profile fields
        gender,
        lookingFor: orientation,
        dateOfBirth,
        city,
        photos,
        discoverable: true,
        onboardingCompleted: true,
        // Canonical earn_on fields
        earn_on: isEarner,
        earn_surfaces,
        earn_profile,
        // Backward-compatible fields
        earnOn: isEarner,
        modes: {
          earnFromChat: isEarner && (selectedSurfaces.chat ?? true),
        },
        // FIX 82: Referral tracking — backend referral engine processes reward automatically
        ...(referredBy ? { referredBy } : {}),
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
      });

      // FIX 95: Also create/update public_profiles for discovery
      await setDoc(doc(requireDb(), 'public_profiles', firebaseUser.uid), {
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName || '',
        gender,
        lookingFor: orientation,
        dateOfBirth,
        city,
        photos,
        photoURL: photos[0] || '',
        discoverable: true,
        isHuman: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // FIX 109: Grant welcome bonus (25 free tokens)
      try {
        const grantBonus = httpsCallable(requireFunctions(), 'grantWelcomeBonus');
        await grantBonus({});
      } catch {
        // Fallback: write pending_transactions for backend processing
        await addDoc(collection(requireDb(), 'pending_transactions'), {
          userId: firebaseUser.uid,
          type: 'welcome_bonus',
          tokens: 25,
          createdAt: serverTimestamp(),
        });
      }

      toast({
        type: 'success',
        title: t('onboarding.profileCreated'),
      });

      // Update auth context — must await to prevent onboarding loop
      await completeOnboarding();
      await refreshUser();

      // FIX 77: If on step 9, go to selfie verification step before navigating to feed
      if (step === 9) {
        setStep(10);
        return;
      }

      // FIX 109: Show welcome modal instead of navigating directly
      setShowWelcomeModal(true);
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

      {/* FIX 109: Welcome bonus modal — shown after onboarding completion */}
      {showWelcomeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 text-center max-w-sm mx-4">
            <span className="text-5xl block mb-3">🎁</span>
            <h2 className="text-xl font-bold mb-1">Welcome to Avalo!</h2>
            <p className="text-gray-500 text-sm mb-4">Here&apos;s 25 free tokens to get you started</p>
            <div className="p-3 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl mb-4">
              <p className="text-2xl font-bold text-amber-600">+25 🪙</p>
            </div>
            <button
              onClick={() => router.push('/discover')}
              className="w-full py-3 bg-gradient-to-r from-[#E8593C] to-[#8B5CF6] text-white rounded-xl font-medium"
            >
              Start Exploring
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold gradient-text mb-2">
            {t('onboarding.title')}
          </h1>
          <p className="text-muted-foreground">{t('onboarding.subtitle')}</p>
        </div>

        {/* FIX 95: Progress bar (replaces numbered circles for 10-step flow) */}
        <div className="w-full mb-8">
          <div className="flex gap-1">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  i < step
                    ? 'bg-gradient-to-r from-[#E8593C] to-[#8B5CF6]'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Step {step} of {TOTAL_STEPS}
          </p>
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

          {/* Step 3: Gender (FIX 95) */}
          {step === 3 && (
            <div className="space-y-6 text-center">
              <h2 className="text-2xl font-bold mb-2">I am a...</h2>
              <p className="text-sm text-muted-foreground mb-6">Choose your gender</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'Man', icon: '👨', label: 'Man' },
                  { id: 'Woman', icon: '👩', label: 'Woman' },
                  { id: 'Non-binary', icon: '🧑', label: 'Non-binary' },
                  { id: 'Other', icon: '✨', label: 'Other' },
                ].map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGender(g.id)}
                    className={`p-4 rounded-2xl border-2 text-center transition ${
                      gender === g.id
                        ? 'border-[#E4458F] bg-pink-50 dark:bg-pink-900/20'
                        : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                    }`}
                  >
                    <span className="text-3xl block mb-1">{g.icon}</span>
                    <span className="text-sm font-medium">{g.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Orientation (FIX 95) */}
          {step === 4 && (
            <div className="space-y-6 text-center">
              <h2 className="text-2xl font-bold mb-2">I&apos;m looking for...</h2>
              <p className="text-sm text-muted-foreground mb-6">Who would you like to meet?</p>
              <div className="space-y-3">
                {[
                  { id: 'Men', label: 'Men' },
                  { id: 'Women', label: 'Women' },
                  { id: 'Everyone', label: 'Everyone' },
                ].map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setOrientation(o.id)}
                    className={`w-full p-4 rounded-2xl border-2 text-center transition ${
                      orientation === o.id
                        ? 'border-[#E4458F] bg-pink-50 dark:bg-pink-900/20'
                        : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                    }`}
                  >
                    <span className="font-medium">{o.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Birthdate (FIX 95) */}
          {step === 5 && (
            <div className="space-y-6 text-center">
              <h2 className="text-2xl font-bold mb-2">When&apos;s your birthday?</h2>
              <p className="text-sm text-muted-foreground mb-6">You must be 18 or older</p>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                className="w-full p-3 border-2 rounded-xl text-center text-lg border-gray-200 dark:border-gray-700 dark:bg-gray-800"
              />
              {dateOfBirth && calculateAge(dateOfBirth) < 18 && (
                <p className="text-red-500 text-sm mt-2">You must be at least 18 years old</p>
              )}
            </div>
          )}

          {/* Step 6: City (FIX 95) */}
          {step === 6 && (
            <div className="space-y-6 text-center">
              <h2 className="text-2xl font-bold mb-2">Where do you live?</h2>
              <p className="text-sm text-muted-foreground mb-6">This helps us find people near you</p>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g., Warsaw, Berlin, London..."
                className="w-full p-3 border-2 rounded-xl text-center text-lg border-gray-200 dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
          )}

          {/* Step 7: How do you want to use Avalo? (earn_on) */}
          {step === 7 && (
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

          {/* Step 8: Photos (FIX 95) */}
          {step === 8 && (
            <div className="space-y-6 text-center">
              <h2 className="text-2xl font-bold mb-2">Add your photos</h2>
              <p className="text-sm text-muted-foreground mb-6">
                At least 3 photos showing your face (first 6 must show YOU)
              </p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {Array.from({ length: 6 }).map((_, i) => {
                  const photo = photos[i];
                  return photo ? (
                    <div key={i} className="aspect-square rounded-xl overflow-hidden relative">
                      <img src={photo} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white rounded-full text-xs flex items-center justify-center"
                      >
                        ×
                      </button>
                      <span className="absolute bottom-1 left-1 text-[9px] bg-black/40 text-white px-1 rounded">
                        {i + 1}
                      </span>
                    </div>
                  ) : (
                    <div
                      key={i}
                      onClick={() => fileRef.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center cursor-pointer hover:border-[#E4458F] transition"
                    >
                      <span className="text-2xl text-gray-300">+</span>
                      <span className="text-[9px] text-gray-400">📸 Face</span>
                    </div>
                  );
                })}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoUpload}
              />
              <p className="text-xs text-muted-foreground">
                {photos.length}/6 photos · minimum 3 required
              </p>
            </div>
          )}

          {/* Step 9: Confirmation */}
          {step === 9 && (
            <div className="space-y-6 text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-lg font-semibold">{t('onboarding.step3Title')}</h2>
              <p className="text-sm text-muted-foreground">{t('onboarding.step3Desc')}</p>

              {/* FIX 95: Dating-profile summary */}
              <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-left space-y-1">
                <p className="text-sm"><strong>Gender:</strong> {gender}</p>
                <p className="text-sm"><strong>Looking for:</strong> {orientation}</p>
                <p className="text-sm"><strong>Birthday:</strong> {dateOfBirth}</p>
                <p className="text-sm"><strong>City:</strong> {city}</p>
                <p className="text-sm"><strong>Photos:</strong> {photos.length} uploaded</p>
              </div>

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

          {/* FIX 77: Step 10 — Selfie Verification */}
          {step === 10 && (
            <div className="space-y-6 text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Camera className="w-8 h-8 text-[#E4458F]" />
              </div>
              <h2 className="text-xl font-bold mb-2">Verify Your Identity</h2>
              <p className="text-sm text-gray-500 mb-6">
                Take a quick selfie so we can confirm you match your photos.
                This helps keep Avalo safe and authentic.
              </p>

              {!selfiePreview ? (
                <div className="space-y-4">
                  <div className="w-48 h-48 mx-auto rounded-full bg-gray-100 flex items-center justify-center border-4 border-dashed border-[#E4458F]">
                    <span className="text-6xl">📸</span>
                  </div>
                  <button
                    onClick={captureSelfie}
                    className="w-full py-3 bg-gradient-to-r from-[#E8593C] via-[#E4458F] to-[#8B5CF6] text-white rounded-xl font-medium"
                  >
                    Take Selfie
                  </button>
                  <button
                    onClick={() => router.replace('/feed')}
                    className="text-sm text-gray-400 hover:text-gray-600"
                  >
                    Skip for now (some features will be limited)
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="w-48 h-48 mx-auto rounded-full overflow-hidden border-4 border-green-400">
                    <img src={selfiePreview} alt="" className="w-full h-full object-cover" />
                  </div>

                  {verifying && (
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                      <div className="animate-spin w-4 h-4 border-2 border-[#E4458F] border-t-transparent rounded-full" />
                      Comparing with your photos...
                    </div>
                  )}

                  {verificationResult === 'match' && (
                    <div className="p-3 bg-green-50 rounded-xl text-green-700 text-sm">
                      ✅ Verified! Your selfie matches your profile photos.
                    </div>
                  )}

                  {verificationResult === 'mismatch' && (
                    <div className="p-3 bg-red-50 rounded-xl text-red-700 text-sm">
                      ⚠️ We couldn&apos;t confirm a match. Please try again with better lighting,
                      or make sure your profile photos show you.
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={captureSelfie}
                      className="flex-1 py-2 bg-gray-100 rounded-lg text-sm"
                    >
                      Retake
                    </button>
                    <button
                      onClick={submitSelfie}
                      disabled={verifying}
                      className="flex-1 py-2 bg-[#E4458F] text-white rounded-lg text-sm disabled:opacity-50"
                    >
                      {verifying ? 'Verifying...' : 'Submit'}
                    </button>
                  </div>

                  <button
                    onClick={() => router.replace('/feed')}
                    className="text-sm text-gray-400 hover:text-gray-600 mt-2"
                  >
                    Skip for now
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Navigation buttons — hidden on step 10 (selfie step has its own controls) */}
          {step !== 10 && (
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

              {step < 9 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="btn btn-primary px-6 py-2 text-sm"
                >
                  {step === 7 && !earnOnChoice ? 'Skip' : t('onboarding.next')}
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
          )}
        </div>
      </div>
    </div>
  );
}
