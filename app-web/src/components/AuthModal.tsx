'use client';

/**
 * AuthModal — Centralized authentication modal.
 *
 * Supports:
 *   - Email + password sign in
 *   - Email + password registration
 *   - Google sign in (popup)
 *   - Password reset link
 *
 * After successful login:
 *   - New user → redirect to /onboarding
 *   - Existing user with profile complete → redirect to /feed (or intended destination)
 *   - Existing user without profile complete → redirect to /onboarding
 *
 * INVARIANTS:
 *   - Google login MUST use signInWithPopup.
 *   - No silent redirects — user sees modal.
 *   - Does NOT redirect if already on public page and user cancels.
 */

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { X, Mail, Lock, Eye, EyeOff, Loader2, User as UserIcon } from 'lucide-react';
import sdk from '@/lib/sdk';
import { useAuth } from '@/components/providers/AuthProvider';
import { GoogleIcon } from '@/components/icons/SocialIcons';
import { toast } from '@/components/ui/Toaster';

// ── Context for opening AuthModal from anywhere ──────────────────

interface AuthModalContextType {
  isOpen: boolean;
  openAuthModal: (redirectTo?: string) => void;
  closeAuthModal: () => void;
}

const AuthModalContext = createContext<AuthModalContextType>({
  isOpen: false,
  openAuthModal: () => {},
  closeAuthModal: () => {},
});

export const useAuthModal = () => useContext(AuthModalContext);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [redirectTo, setRedirectTo] = useState<string | undefined>(undefined);

  const openAuthModal = useCallback((dest?: string) => {
    setRedirectTo(dest);
    setIsOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsOpen(false);
    setRedirectTo(undefined);
  }, []);

  return (
    <AuthModalContext.Provider value={{ isOpen, openAuthModal, closeAuthModal }}>
      {children}
      {isOpen && <AuthModal onClose={closeAuthModal} redirectTo={redirectTo} />}
    </AuthModalContext.Provider>
  );
}

// ── Modal Component ──────────────────────────────────────────────

type AuthMode = 'login' | 'register' | 'forgot';

interface AuthModalProps {
  onClose: () => void;
  redirectTo?: string;
}

function AuthModal({ onClose, redirectTo }: AuthModalProps) {
  const router = useRouter();
  const { firebaseUser, needsOnboarding, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Close modal and redirect when auth state changes
  useEffect(() => {
    if (!authLoading && firebaseUser) {
      onClose();
      if (needsOnboarding) {
        router.push('/onboarding');
      } else if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.push('/feed');
      }
    }
  }, [authLoading, firebaseUser, needsOnboarding, redirectTo, router, onClose]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sdk.signInWithEmail(email, password);
      toast({ type: 'success', title: 'Welcome back!' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Invalid credentials';
      toast({ type: 'error', title: 'Sign in failed', description: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sdk.registerWithEmail(email, password, displayName || undefined);
      toast({ type: 'success', title: 'Account created!' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Registration failed';
      toast({ type: 'error', title: 'Registration failed', description: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      await sdk.signInWithGoogle();
      toast({ type: 'success', title: 'Welcome!' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Google sign in failed';
      toast({ type: 'error', title: 'Sign in failed', description: msg });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ type: 'warning', title: 'Enter your email address' });
      return;
    }
    setLoading(true);
    try {
      await sdk.sendPasswordReset(email);
      toast({ type: 'success', title: 'Reset email sent', description: 'Check your inbox' });
      setMode('login');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to send reset email';
      toast({ type: 'error', title: 'Error', description: msg });
    } finally {
      setLoading(false);
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold gradient-text mb-1">
            {mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create account' : 'Reset password'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === 'login'
              ? 'Sign in to continue to Avalo'
              : mode === 'register'
                ? 'Join the premium social platform'
                : 'We\'ll send you a reset link'}
          </p>
        </div>

        {/* Google Sign In */}
        {mode !== 'forgot' && (
          <>
            <button
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50"
            >
              {googleLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <GoogleIcon className="w-5 h-5" />
              )}
              Continue with Google
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-gray-900 px-2 text-gray-400">or</span>
              </div>
            </div>
          </>
        )}

        {/* Email Form */}
        <form
          onSubmit={
            mode === 'login'
              ? handleEmailLogin
              : mode === 'register'
                ? handleEmailRegister
                : handleForgotPassword
          }
          className="space-y-4"
        >
          {mode === 'register' && (
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                className="input pl-10"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              className="input pl-10"
            />
          </div>

          {mode !== 'forgot' && (
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                minLength={6}
                className="input pl-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          )}

          {mode === 'login' && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setMode('forgot')}
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn btn-primary py-3 text-sm"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            {mode === 'login'
              ? 'Sign In'
              : mode === 'register'
                ? 'Create Account'
                : 'Send Reset Link'}
          </button>
        </form>

        {/* Mode Switch */}
        <div className="mt-6 text-center text-sm text-gray-500">
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                onClick={() => setMode('register')}
                className="text-primary-600 font-medium hover:text-primary-700"
              >
                Sign up
              </button>
            </>
          ) : mode === 'register' ? (
            <>
              Already have an account?{' '}
              <button
                onClick={() => setMode('login')}
                className="text-primary-600 font-medium hover:text-primary-700"
              >
                Sign in
              </button>
            </>
          ) : (
            <button
              onClick={() => setMode('login')}
              className="text-primary-600 font-medium hover:text-primary-700"
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthModal;
