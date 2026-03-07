'use client';

/**
 * /auth/forgot-password — Password Reset Page
 *
 * Sends a password-reset email via Firebase Auth.
 * Uses sdk.resetPassword() which calls sendPasswordResetEmail().
 *
 * Linked from: /auth/login
 */

import { useState } from 'react';
import Link from 'next/link';
import { Mail, Loader2, ArrowLeft, CheckCircle } from 'lucide-react';
import sdk from '@/lib/sdk';
import { toast } from '@/components/ui/Toaster';
import { useI18n } from '@/components/providers/I18nProvider';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);

    try {
      await sdk.sendPasswordReset(email);
      setSent(true);
      toast({
        type: 'success',
        title: 'Reset email sent',
        description: 'Check your inbox for a password reset link.',
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to send reset email.';
      toast({
        type: 'error',
        title: 'Error',
        description: message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-gray-900 dark:via-black dark:to-gray-900 px-4">
      <div className="w-full max-w-md">
        {/* Back link */}
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-display font-bold gradient-text mb-2">
            {t('common.appName')}
          </h1>
          <p className="text-muted-foreground">Reset your password</p>
        </div>

        <div className="card p-6 space-y-6">
          {sent ? (
            <div className="text-center py-4 space-y-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a password reset link to{' '}
                <span className="font-medium text-foreground">{email}</span>.
                <br />
                Follow the instructions in the email to reset your password.
              </p>
              <Link
                href="/auth/login"
                className="btn btn-primary inline-block mt-4 px-6 py-2"
              >
                Return to sign in
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Enter your email address and we&apos;ll send you a link to reset
                your password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium mb-2"
                  >
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="input pl-10 w-full"
                      disabled={loading}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="btn btn-primary w-full h-11"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Send reset link'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


