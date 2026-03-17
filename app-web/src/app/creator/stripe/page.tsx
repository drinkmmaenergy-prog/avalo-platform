'use client';

/**
 * PHASE 3.3 — Creator Stripe Connect Page
 *
 * Displays Stripe Connect status and initiates onboarding.
 * All data from backend — NO direct Stripe API access.
 *
 * Backend functions consumed (via phase33/creatorPanel.ts):
 *   - getPayoutState (status check)
 *   - setupPayoutAccount (onboarding)
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getStripeConnectStatus, initiateStripeOnboarding } from '@/lib/services/phase33';
import type { CreatorStripeConnectInfo, StripeConnectStatus } from '@/types/phase33.types';

// ============================================================================
// NOT-A-CREATOR CTA
// ============================================================================

function NotACreatorCTA() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-lg text-center border border-gray-100">
        <div className="text-6xl mb-6">🔗</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Stripe Connect</h1>
        <p className="text-gray-600 mb-6 leading-relaxed">
          Enable creator mode first before connecting your Stripe account for payouts.
        </p>
        <a
          href="/settings/creator"
          className="inline-flex items-center px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white
                     font-medium rounded-lg transition"
        >
          Enable Creator Mode
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// STATUS INDICATOR
// ============================================================================

function StatusIndicator({ status }: { status: StripeConnectStatus }) {
  const config: Record<StripeConnectStatus, { color: string; label: string; icon: string }> = {
    NOT_CONNECTED: { color: 'bg-gray-100 text-gray-800', label: 'Not Connected', icon: '⚪' },
    PENDING_ONBOARDING: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending Onboarding', icon: '🟡' },
    ONBOARDING_INCOMPLETE: { color: 'bg-orange-100 text-orange-800', label: 'Onboarding Incomplete', icon: '🟠' },
    ACTIVE: { color: 'bg-green-100 text-green-800', label: 'Active', icon: '🟢' },
    RESTRICTED: { color: 'bg-red-100 text-red-800', label: 'Restricted', icon: '🔴' },
    DISABLED: { color: 'bg-red-200 text-red-900', label: 'Disabled', icon: '⛔' },
  };

  const { color, label, icon } = config[status];

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${color}`}>
      <span className="mr-2">{icon}</span>
      {label}
    </span>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function CreatorStripePage() {
  const { user } = useAuth();
  const [stripeInfo, setStripeInfo] = useState<CreatorStripeConnectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      try {
        setLoading(true);
        const data = await getStripeConnectStatus(user.uid);
        setStripeInfo(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load Stripe status');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user]);

  const handleStartOnboarding = async () => {
    if (!user) return;

    setOnboarding(true);
    setError(null);

    try {
      const result = await initiateStripeOnboarding(
        user.uid
      );

      if ('url' in result && result.url) {
        window.location.href = result.url;
      } else {
        setError('Failed to start onboarding. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start onboarding');
    } finally {
      setOnboarding(false);
    }
  };

  // ── Not-a-creator gate ───────────────────────────────────────────

  if (!loading && user && !user.isCreator) {
    return <NotACreatorCTA />;
  }

  // ── Loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Stripe Connect</h1>
        <p className="text-gray-600 mt-1">Connect your Stripe account to receive payouts</p>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Account Status</h2>
          {stripeInfo && <StatusIndicator status={stripeInfo.status} />}
        </div>

        {error && (
          <div className="mb-6 bg-red-50 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {stripeInfo?.status === 'NOT_CONNECTED' && (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">🔗</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Connect Your Stripe Account
            </h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              To receive payouts, you need to connect a Stripe account.
              This allows us to transfer your earnings directly to your bank.
            </p>
            <button
              onClick={handleStartOnboarding}
              disabled={onboarding}
              className="bg-pink-600 hover:bg-pink-700 disabled:bg-gray-300 text-white font-medium py-3 px-8 rounded-lg transition"
            >
              {onboarding ? 'Starting...' : 'Connect Stripe Account'}
            </button>
          </div>
        )}

        {stripeInfo?.status === 'ONBOARDING_INCOMPLETE' && (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">⚠️</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Complete Your Onboarding
            </h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Your Stripe account setup is incomplete. Please finish the onboarding process.
            </p>
            {stripeInfo.currentlyDue && stripeInfo.currentlyDue.length > 0 && (
              <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-md mx-auto">
                <p className="text-sm font-medium text-yellow-800 mb-2">Required information:</p>
                <ul className="text-sm text-yellow-700 list-disc list-inside">
                  {stripeInfo.currentlyDue.map((item) => (
                    <li key={item}>{item.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
              </div>
            )}
            <button
              onClick={handleStartOnboarding}
              disabled={onboarding}
              className="bg-pink-600 hover:bg-pink-700 disabled:bg-gray-300 text-white font-medium py-3 px-8 rounded-lg transition"
            >
              {onboarding ? 'Opening...' : 'Complete Onboarding'}
            </button>
          </div>
        )}

        {stripeInfo?.status === 'ACTIVE' && (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">✅</div>
            <h3 className="text-xl font-semibold text-green-800 mb-2">
              Account Connected
            </h3>
            <p className="text-gray-600 mb-6">
              Your Stripe account is active and ready to receive payouts.
            </p>
            <div className="bg-green-50 rounded-lg p-4 max-w-sm mx-auto">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Payouts:</span>
                  <span className="ml-2 font-medium text-green-700">
                    {stripeInfo.payoutsEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Charges:</span>
                  <span className="ml-2 font-medium text-green-700">
                    {stripeInfo.chargesEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {stripeInfo?.status === 'RESTRICTED' && (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">🚫</div>
            <h3 className="text-xl font-semibold text-red-800 mb-2">
              Account Restricted
            </h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Your Stripe account has restrictions. Please update your information to continue receiving payouts.
            </p>
            <button
              onClick={handleStartOnboarding}
              disabled={onboarding}
              className="bg-pink-600 hover:bg-pink-700 disabled:bg-gray-300 text-white font-medium py-3 px-8 rounded-lg transition"
            >
              {onboarding ? 'Opening...' : 'Update Account'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <h3 className="font-medium text-blue-900">About Stripe Connect</h3>
            <p className="text-sm text-blue-700 mt-1">
              Stripe Connect is a secure payment platform that handles your payouts.
              Your banking information is stored securely with Stripe — Avalo never has direct access to it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
