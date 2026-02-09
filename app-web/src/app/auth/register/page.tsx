'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Loader2, Eye, EyeOff, User } from 'lucide-react';
import sdk from '@/lib/sdk';
import { toast } from '@/components/ui/Toaster';
import { GoogleIcon, AppleIcon } from '@/components/icons/SocialIcons';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';

export default function RegisterPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading, needsOnboarding } = useAuth();
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);

  // Redirect authenticated users away from auth pages
  useEffect(() => {
    if (!authLoading && firebaseUser) {
      if (needsOnboarding) {
        router.replace('/onboarding');
      } else {
        router.replace('/feed');
      }
    }
  }, [authLoading, firebaseUser, needsOnboarding, router]);

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        type: 'error',
        title: t('auth.passwordMismatch'),
        description: t('auth.passwordMismatchDesc'),
      });
      return;
    }

    if (password.length < 8) {
      toast({
        type: 'error',
        title: t('auth.passwordTooShort'),
        description: t('auth.passwordTooShortDesc'),
      });
      return;
    }

    setLoading(true);

    try {
      await sdk.signUpWithEmail(email, password, displayName);
      toast({
        type: 'success',
        title: t('auth.accountCreated'),
        description: t('auth.accountCreatedDesc'),
      });
      // AuthProvider will detect new user → needsOnboarding → redirect via useEffect
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('auth.registrationFailedDesc');
      toast({
        type: 'error',
        title: t('auth.registrationFailed'),
        description: message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setSocialLoading('google');
    try {
      await sdk.signInWithGoogle();
      toast({
        type: 'success',
        title: t('auth.welcomeToAvalo'),
        description: t('auth.googleAccountCreated'),
      });
      // AuthProvider detects auth → if no user doc → needsOnboarding → redirect
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('auth.googleRegistrationFailed');
      toast({
        type: 'error',
        title: t('auth.registrationFailed'),
        description: message,
      });
    } finally {
      setSocialLoading(null);
    }
  };

  const handleAppleRegister = async () => {
    setSocialLoading('apple');
    try {
      await sdk.signInWithApple();
      toast({
        type: 'success',
        title: t('auth.welcomeToAvalo'),
        description: t('auth.appleAccountCreated'),
      });
      // AuthProvider detects auth → if no user doc → needsOnboarding → redirect
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('auth.appleRegistrationFailed');
      toast({
        type: 'error',
        title: t('auth.registrationFailed'),
        description: message,
      });
    } finally {
      setSocialLoading(null);
    }
  };

  // Don't render auth page if already authenticated
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (firebaseUser) {
    return null; // useEffect will redirect
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-gray-900 dark:via-black dark:to-gray-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-display font-bold gradient-text mb-2">
            {t('common.appName')}
          </h1>
          <p className="text-muted-foreground">
            {t('auth.createAccount')}
          </p>
        </div>

        <div className="card p-6 space-y-6">
          {/* Social Login Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleGoogleRegister}
              disabled={!!socialLoading}
              className="btn btn-outline w-full h-11 relative"
            >
              {socialLoading === 'google' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <GoogleIcon className="w-5 h-5 mr-3" />
                  {t('auth.continueWithGoogle')}
                </>
              )}
            </button>

            <button
              onClick={handleAppleRegister}
              disabled={!!socialLoading}
              className="btn btn-outline w-full h-11 relative"
            >
              {socialLoading === 'apple' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <AppleIcon className="w-5 h-5 mr-3" />
                  {t('auth.continueWithApple')}
                </>
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                {t('auth.orRegisterWithEmail')}
              </span>
            </div>
          </div>

          {/* Email Registration Form */}
          <form onSubmit={handleEmailRegister} className="space-y-4">
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium mb-2">
                {t('auth.displayName')}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('auth.displayNamePlaceholder')}
                  required
                  className="input pl-10 w-full"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                {t('auth.email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  required
                  className="input pl-10 w-full"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                {t('auth.password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  required
                  minLength={8}
                  className="input pl-10 pr-10 w-full"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  disabled={loading}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
                {t('auth.confirmPassword')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  required
                  minLength={8}
                  className="input pl-10 w-full"
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password || !confirmPassword || !displayName}
              className="btn btn-primary w-full h-11"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                t('auth.createAccountButton')
              )}
            </button>
          </form>

          {/* Sign In Link */}
          <div className="text-center text-sm text-muted-foreground">
            {t('auth.hasAccount')}{' '}
            <Link
              href="/auth/login"
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
            >
              {t('auth.signInLink')}
            </Link>
          </div>
        </div>

        {/* Terms */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          {t('auth.createTermsAgreement')}{' '}
          <Link href="/legal/terms" className="underline hover:text-foreground">
            {t('auth.termsOfService')}
          </Link>{' '}
          {t('auth.and')}{' '}
          <Link href="/legal/privacy" className="underline hover:text-foreground">
            {t('auth.privacyPolicy')}
          </Link>
        </p>
      </div>
    </div>
  );
}
