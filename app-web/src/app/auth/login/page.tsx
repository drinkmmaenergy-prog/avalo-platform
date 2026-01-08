'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import sdk from '@/lib/sdk';
import { toast } from '@/components/ui/Toaster';
import { GoogleIcon, AppleIcon } from '@/components/icons/SocialIcons';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await sdk.signInWithEmail(email, password);
      toast({
        type: 'success',
        title: 'Welcome back!',
        description: 'You have successfully signed in.',
      });
      router.push('/feed');
    } catch (error: any) {
      toast({
        type: 'error',
        title: 'Sign in failed',
        description: error.message || 'Invalid email or password',
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
        title: 'Welcome back!',
        description: 'You have successfully signed in with Google.',
      });
      router.push('/feed');
    } catch (error: any) {
      toast({
        type: 'error',
        title: 'Sign in failed',
        description: error.message || 'Could not sign in with Google',
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
        title: 'Welcome back!',
        description: 'You have successfully signed in with Apple.',
      });
      router.push('/feed');
    } catch (error: any) {
      toast({
        type: 'error',
        title: 'Sign in failed',
        description: error.message || 'Could not sign in with Apple',
      });
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-gray-900 dark:via-black dark:to-gray-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-display font-bold gradient-text mb-2">
            Avalo
          </h1>
          <p className="text-muted-foreground">
            Welcome back! Sign in to continue.
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
                  Continue with Google
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
                  Continue with Apple
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
                Or continue with email
              </span>
            </div>
          </div>

          {/* Email Login Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="input pl-10 w-full"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
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

            <div className="flex items-center justify-between text-sm">
              <Link
                href="/auth/phone"
                className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                Sign in with phone
              </Link>
              <Link
                href="/auth/forgot-password"
                className="text-muted-foreground hover:text-foreground"
              >
                Forgot password?
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
                'Sign In'
              )}
            </button>
          </form>

          {/* Sign Up Link */}
          <div className="text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link
              href="/auth/register"
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
            >
              Sign up
            </Link>
          </div>
        </div>

        {/* Terms */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          By continuing, you agree to Avalo's{' '}
          <Link href="/legal/terms" className="underline hover:text-foreground">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}