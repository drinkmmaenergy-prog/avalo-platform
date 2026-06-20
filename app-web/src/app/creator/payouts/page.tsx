'use client';

/**
 * PHASE 3.3 — Creator Payouts Page (READ-ONLY history + payout request)
 *
 * Displays payout history and allows payout requests.
 * All data fetched from backend — NO local calculations.
 *
 * Firestore reads:
 *   - wallets/{uid} -> pending balance
 *   - payout_requests (query by userId) -> request history
 *
 * Firestore writes:
 *   - payout_requests -> new request document
 *
 * Backend functions consumed:
 *   - getCreatorEarningsSummary (via phase33 facade)
 *   - getPayoutHistory (via phase33 facade)
 *   - requestCreatorPayout (via phase33 facade)
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  getCreatorEarningsSummary,
  getPayoutHistory,
  requestCreatorPayout,
} from '@/lib/services/phase33';
import {
  getWalletData,
  submitPayoutRequest,
  getPayoutRequests,
  type WalletData,
} from '@/lib/services/creatorService';
import type { CreatorEarningsSummary, PayoutHistoryEntry, PayoutStatus } from '@/types/phase33.types';
import { TOKEN_PAYOUT_USD } from '@/lib/economyConfig';

const MIN_PAYOUT_TOKENS = 1000; // Minimum for payout request

// ============================================================================
// NOT-A-CREATOR CTA
// ============================================================================

function NotACreatorCTA() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-lg text-center border border-gray-100">
        <div className="text-6xl mb-6">💳</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Creator Payouts</h1>
        <p className="text-gray-600 mb-6 leading-relaxed">
          Enable creator mode to start earning and requesting payouts.
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
// STATUS BADGE
// ============================================================================

function StatusBadge({ status }: { status: PayoutStatus | string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    PROCESSING: 'bg-blue-100 text-blue-800',
    PAID: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    REJECTED: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded ${styles[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

// ============================================================================
// [PAYOUTS_DISABLED_FOR_SOFT_LAUNCH] — server-side kill switch active.
// This banner renders immediately; the payout request form is removed.
// ============================================================================
function PayoutsDisabledBanner() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-lg text-center border border-amber-200">
        <div className="text-5xl mb-6">🔒</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Creator Payouts</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left">
          <p className="text-sm font-semibold text-amber-800 mb-1">Not available yet</p>
          <p className="text-sm text-amber-700 leading-relaxed">
            Creator payouts are not available during the current launch phase.
            We are building a secure earnings ledger to ensure every payout is
            accurate and auditable.
          </p>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">
          Your earned tokens are safe. Once creator payouts launch you will be
          able to withdraw directly to your bank account via Stripe.
        </p>
      </div>
    </div>
  );
}

export default function CreatorPayoutsPage() {
  // [PAYOUTS_DISABLED_FOR_SOFT_LAUNCH] — show disabled state, do not render payout form
  return <PayoutsDisabledBanner />;
}

function CreatorPayoutsPage_DISABLED_IMPL() {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<CreatorEarningsSummary | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [history, setHistory] = useState<PayoutHistoryEntry[]>([]);
  const [firestoreRequests, setFirestoreRequests] = useState<
    Array<{ id: string; tokensRequested: number; status: string; createdAt: Date }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Request form state
  const [requestAmount, setRequestAmount] = useState<number>(0);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      try {
        setLoading(true);
        const [earningsData, historyData, walletData, payoutReqs] = await Promise.all([
          getCreatorEarningsSummary(user.uid),
          getPayoutHistory(user.uid),
          getWalletData(user.uid),
          getPayoutRequests(user.uid),
        ]);
        setEarnings(earningsData);
        setHistory(historyData);
        setWallet(walletData);
        setFirestoreRequests(payoutReqs);

        // Pre-fill request amount with available balance
        if (earningsData && earningsData.availableForPayout >= MIN_PAYOUT_TOKENS) {
          setRequestAmount(earningsData.availableForPayout);
        } else {
          setRequestAmount(MIN_PAYOUT_TOKENS);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load payout data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user]);

  const handlePayoutRequest = async () => {
    if (!user || !earnings) return;

    // Validation
    if (requestAmount < MIN_PAYOUT_TOKENS) {
      setRequestError(`Minimum payout is ${MIN_PAYOUT_TOKENS} tokens`);
      return;
    }
    if (requestAmount > earnings.availableForPayout) {
      setRequestError('Amount exceeds available balance');
      return;
    }

    setRequesting(true);
    setRequestError(null);
    setRequestSuccess(null);

    try {
      // Write to payout_requests collection in Firestore
      const firestoreResult = await submitPayoutRequest(user.uid, requestAmount);

      if (!firestoreResult.success) {
        setRequestError(firestoreResult.error || 'Failed to submit payout request');
        setRequesting(false);
        return;
      }

      // Also call backend function for processing pipeline
      const backendResult = await requestCreatorPayout(user.uid, requestAmount);

      if (backendResult.success) {
        setRequestSuccess(
          `Payout request submitted! ID: ${backendResult.payoutRequestId ?? firestoreResult.requestId ?? 'pending'}`,
        );
      } else {
        // Firestore write succeeded; backend may pick it up asynchronously
        setRequestSuccess(
          `Payout request recorded (ID: ${firestoreResult.requestId}). Processing will begin shortly.`,
        );
      }

      // Refresh data
      const [earningsData, historyData, payoutReqs] = await Promise.all([
        getCreatorEarningsSummary(user.uid),
        getPayoutHistory(user.uid),
        getPayoutRequests(user.uid),
      ]);
      setEarnings(earningsData);
      setHistory(historyData);
      setFirestoreRequests(payoutReqs);
    } catch (err: any) {
      setRequestError(err.message || 'Failed to submit payout request');
    } finally {
      setRequesting(false);
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
        <div className="h-48 bg-gray-200 rounded-xl" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-red-800 mb-2">Error Loading Payouts</h2>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const PAYOUT_RATE_PLN = TOKEN_PAYOUT_USD; // derived from TOKEN_PAYOUT_USD (0.03 USD)
  const pendingBalance = wallet?.pending ?? earnings?.pendingTokens ?? 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
        <p className="text-gray-600 mt-1">Request payouts and view history</p>
      </div>

      {/* Request Payout Card */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Payout</h2>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Balance Overview */}
          <div className="space-y-4">
            {/* Available Balance */}
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-sm text-green-700 mb-1">Available for Payout</div>
              <div className="text-2xl font-bold text-green-800">
                {(earnings?.availableForPayout || 0).toLocaleString()} tokens
              </div>
              <div className="text-sm text-green-600 mt-1">
                ≈ {((earnings?.availableForPayout || 0) * PAYOUT_RATE_PLN).toFixed(2)} PLN
              </div>
            </div>

            {/* Pending Balance (from wallets/{uid}) */}
            <div className="bg-yellow-50 p-4 rounded-lg">
              <div className="text-sm text-yellow-700 mb-1">Pending Balance</div>
              <div className="text-xl font-bold text-yellow-800">
                {pendingBalance.toLocaleString()} tokens
              </div>
              <div className="text-sm text-yellow-600 mt-1">
                Clearing within 7 days
              </div>
            </div>
          </div>

          {/* Request Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (tokens)
              </label>
              <input
                type="number"
                min={MIN_PAYOUT_TOKENS}
                max={earnings?.availableForPayout || 0}
                value={requestAmount}
                onChange={(e) => setRequestAmount(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Minimum: {MIN_PAYOUT_TOKENS} tokens ({MIN_PAYOUT_TOKENS * PAYOUT_RATE_PLN} PLN)
              </p>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Payout amount:</span>
                <span className="font-medium">{(requestAmount * PAYOUT_RATE_PLN).toFixed(2)} PLN</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-600">Platform fee (2%):</span>
                <span className="font-medium">-{(requestAmount * PAYOUT_RATE_PLN * 0.02).toFixed(2)} PLN</span>
              </div>
              <div className="flex justify-between mt-2 pt-2 border-t border-gray-200">
                <span className="font-medium text-gray-800">You receive:</span>
                <span className="font-bold text-green-600">
                  {(requestAmount * PAYOUT_RATE_PLN * 0.98).toFixed(2)} PLN
                </span>
              </div>
            </div>

            {requestError && (
              <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
                {requestError}
              </div>
            )}
            {requestSuccess && (
              <div className="bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm">
                {requestSuccess}
              </div>
            )}

            <button
              onClick={handlePayoutRequest}
              disabled={requesting || requestAmount < MIN_PAYOUT_TOKENS || requestAmount > (earnings?.availableForPayout || 0)}
              className="w-full bg-pink-600 hover:bg-pink-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition"
            >
              {requesting ? 'Submitting...' : 'Request Payout'}
            </button>
          </div>
        </div>
      </div>

      {/* Payout History (from backend functions) */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payout History</h2>

        {history.length === 0 && firestoreRequests.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">📭</div>
            <p>No payout requests yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Tokens</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Method</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* Backend function payout history */}
                {history.map((entry) => (
                  <tr key={entry.payoutId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      {entry.createdAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {entry.requestedTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {entry.amountFiatNetToUser.toFixed(2)} {entry.currency}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{entry.rail}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={entry.status} />
                    </td>
                  </tr>
                ))}

                {/* Firestore payout_requests (if any not in backend history) */}
                {firestoreRequests
           