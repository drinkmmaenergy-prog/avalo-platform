'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import sdk from '@/lib/sdk';
import { toast } from '@/components/ui/Toaster';
import { GoogleIcon, AppleIcon } from '@/components/icons/SocialIcons';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';

export default function LoginPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading, needsOnboarding } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | 'facebook' | null>(null);

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

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await sdk.signInWithEmail(email, password);
      toast({
        type: 'success',
        title: t('auth.welcomeBack'),
        description: t('auth.signInSuccess'),
      });
      // AuthProvider will detect auth state → redirect via useEffect
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('auth.invalidCredentials');
      toast({
        type: 'error',
        title: t('auth.signInFailed'),
        description: message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSocialLoading('google');
    try {
      await sdk.signInWithGoogle();
      toast({
        type: 'success',
        title: t('auth.welcomeBack'),
        description: t('auth.signInWithGoogleSuccess'),
      });
      // AuthProvider will detect auth state → redirect via useEffect
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('auth.googleSignInFailed');
      toast({
        type: 'error',
        title: t('auth.signInFailed'),
        description: message,
      });
    } finally {
      setSocialLoading(null);
    }
  };

  const handleAppleLogin = async () => {
    setSocialLoading('apple');
    try {
      await sdk.signInWithApple();
      toast({
        type: 'success',
        title: t('auth.welcomeBack'),
        description: t('auth.signInWithAppleSuccess'),
      });
      // AuthProvider will detect auth state → redirect via useEffect
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('auth.appleSignInFailed');
      toast({
        type: 'error',
        title: t('auth.signInFailed'),
        description: message,
      });
    } finally {
      setSocialLoading(null);
    }
  };

  // FIX 128: Facebook login — key in developing markets
  const handleFacebookLogin = async () => {
    setSocialLoading('facebook');
    try {
      await sdk.signInWithFacebook();
      toast({
        type: 'success',
        title: t('auth.welcomeBack'),
        description: 'Signed in with Facebook',
      });
      // AuthProvider will detect auth state → redirect via useEffect
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code !== 'auth/popup-closed-by-user') {
        const message = err.message || 'Facebook sign-in failed';
        toast({
          type: 'error',
          title: t('auth.signInFailed'),
          description: message,
        });
      }
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
            {t('auth.welcomeBackDesc')}
          </p>
        </div>

        <div className="card p-6 space-y-6">
          {/* Social Login Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleGoogleLogin}
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
              onClick={handleAppleLogin}
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

            {/* FIX 128: Facebook Login — key in developing markets */}
            <button
              onClick={handleFacebookLogin}
              disabled={!!socialLoading}
              className="w-full py-3 bg-[#1877F2] text-white rounded-xl flex items-center justify-center gap-3 hover:bg-[#166FE5] transition font-medium disabled:opacity-50"
            >
              {socialLoading === 'facebook' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5" fill="white" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Continue with Facebook
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
                {t('auth.orContinueWithEmail')}
              </span>
            </div>
          </div>

          {/* Email Login Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
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

            <div className="flex items-center justify-end text-sm">
              <Link
                href="/auth/forgot-password"
                className="text-muted-foreground hover:text-foreground"
              >
                {t('auth.forgotPassword')}
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="btn btn-primary w-full h-11"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                t('auth.signInButton')
              )}
            </button>
          </form>

          {/* Sign Up Link */}
          <div className="text-center text-sm text-muted-foreground">
            {t('auth.noAccount')}{' '}
            <Link
              href="/auth/register"
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
            >
              {t('auth.signUpLink')}
            </Link>
          </div>
        </div>

        {/* Terms */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          {t('auth.termsAgreement')}{' '}
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


