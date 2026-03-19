'use client';

/**
 * /wallet/payouts — Payouts Page (user-facing, not creator-specific)
 *
 * Auth-protected (via wallet layout.tsx / AppShell).
 * Shows:
 *   - Current balance available for payout (from wallets/{uid})
 *   - Payout threshold: minimum 100 tokens = $3.00 USD
 *   - "Request Payout" button → calls requestPayoutCallable Firebase Function
 *   - Payout history from `payouts` collection
 *   - Payout status: Pending / Processing / Completed
 *   - Info box about processing time
 *
 * INVARIANTS:
 * - Balance is READ-ONLY from Firestore (wallets/{uid}).
 * - Payout request goes through backend callable only (requestPayoutCallable).
 * - TOKEN_PAYOUT_USD from economyConfig is used for display; backend is source of truth.
 */

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';
import { requireDb, requireFunctions } from '@/lib/firebase';
import { TOKEN_PAYOUT_USD } from '@/lib/economyConfig';
import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum payout threshold in tokens for this wallet payouts page. */
const MIN_PAYOUT_TOKENS = 100;

/** USD equivalent of the minimum payout. */
const MIN_PAYOUT_USD = MIN_PAYOUT_TOKENS * TOKEN_PAYOUT_USD;

// ============================================================================
// TYPES
// ============================================================================

interface PayoutRecord {
  id: string;
  tokensRequested: number;
  amountUsd: number;
  status: 'Pending' | 'Processing' | 'Completed' | 'Failed' | string;
  createdAt: Date;
  completedAt: Date | null;
}

// ============================================================================
// STATUS BADGE
// ============================================================================

function PayoutStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Pending: 'bg-yellow-100 text-yellow-800',
    PENDING: 'bg-yellow-100 text-yellow-800',
    Processing: 'bg-blue-100 text-blue-800',
    PROCESSING: 'bg-blue-100 text-blue-800',
    Completed: 'bg-green-100 text-green-800',
    COMPLETED: 'bg-green-100 text-green-800',
    PAID: 'bg-green-100 text-green-800',
    Failed: 'bg-red-100 text-red-800',
    FAILED: 'bg-red-100 text-red-800',
    REJECTED: 'bg-red-100 text-red-800',
  };

  const normalized =
    status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${
        styles[status] ?? styles[normalized] ?? 'bg-gray-100 text-gray-800'
      }`}
    >
      {normalized}
    </span>
  );
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function WalletPayoutsPage() {
  const { firebaseUser, user } = useAuth();

  // Wallet balance state
  const [availableBalance, setAvailableBalance] = useState<number>(0);
  const [balanceLoading, setBalanceLoading] = useState(true);

  // Payout history state
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Request payout state
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);

  const resolvedUid = firebaseUser?.uid ?? user?.uid;

  // ── Real-time balance listener (wallets/{uid}) ────────────────────
  useEffect(() => {
    if (!resolvedUid) {
      setBalanceLoading(false);
      return;
    }

    const unsub = onSnapshot(
      doc(requireDb(), 'wallets', resolvedUid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          // Use tokensBalance, tokenBalance, or balance — whichever is present
          setAvailableBalance(
            data.tokensBalance ?? data.tokenBalance ?? data.balance ?? 0,
          );
        } else {
          setAvailableBalance(0);
        }
        setBalanceLoading(false);
      },
      (error) => {
        if (error?.code !== 'permission-denied') {
          console.error('[WalletPayouts] Balance listener failed:', error);
        }
        setBalanceLoading(false);
      },
    );

    return () => unsub();
  }, [resolvedUid]);

  // ── Load payout history from `payouts` collection ─────────────────
  const loadPayoutHistory = useCallback(async () => {
    if (!resolvedUid) {
      setHistoryLoading(false);
      return;
    }

    try {
      const q = query(
        collection(requireDb(), 'payouts'),
        where('userId', '==', resolvedUid),
        orderBy('createdAt', 'desc'),
        limit(50),
      );

      const snapshot = await getDocs(q);
      const records: PayoutRecord[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();

        let createdAt: Date;
        const rawCreated = data.createdAt;
        if (rawCreated instanceof Timestamp) {
          createdAt = rawCreated.toDate();
        } else if (rawCreated?.toDate) {
          createdAt = rawCreated.toDate();
        } else if (typeof rawCreated === 'number') {
          createdAt = new Date(rawCreated);
        } else {
          createdAt = new Date(0);
        }

        let completedAt: Date | null = null;
        const rawCompleted = data.completedAt;
        if (rawCompleted instanceof Timestamp) {
          completedAt = rawCompleted.toDate();
        } else if (rawCompleted?.toDate) {
          completedAt = rawCompleted.toDate();
        } else if (typeof rawCompleted === 'number') {
          completedAt = new Date(rawCompleted);
        }

        return {
          id: docSnap.id,
          tokensRequested: data.tokensRequested ?? data.tokens ?? data.amount ?? 0,
          amountUsd: data.amountUsd ?? data.amountFiat ?? (data.tokensRequested ?? 0) * TOKEN_PAYOUT_USD,
          status: data.status ?? 'Pending',
          createdAt,
          completedAt,
        };
      });

      setPayouts(records);
    } catch (err: unknown) {
      console.error('[WalletPayouts] Failed to load payout history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [resolvedUid]);

  useEffect(() => {
    loadPayoutHistory();
  }, [loadPayoutHistory]);

  // ── Request payout handler ─────────────────────────────────────────
  const handleRequestPayout = async () => {
    if (!resolvedUid) return;

    if (availableBalance < MIN_PAYOUT_TOKENS) {
      setRequestError(
        `Minimum payout is ${MIN_PAYOUT_TOKENS} tokens ($${MIN_PAYOUT_USD.toFixed(2)} USD). You have ${availableBalance} tokens.`,
      );
      return;
    }

    setRequesting(true);
    setRequestError(null);
    setRequestSuccess(null);

    try {
      const requestPayoutCallable = httpsCallable<
        { tokens: number },
        { success: boolean; payoutId?: string; error?: string }
      >(requireFunctions(), 'requestPayoutCallable');

      const result = await requestPayoutCallable({ tokens: availableBalance });

      if (result.data.success) {
        setRequestSuccess(
          `Payout request submitted successfully! Request ID: ${result.data.payoutId ?? 'pending'}. ` +
          `${availableBalance.toLocaleString()} tokens ≈ $${(availableBalance * TOKEN_PAYOUT_USD).toFixed(2)} USD.`,
        );
        // Refresh payout history
        await loadPayoutHistory();
      } else {
        setRequestError(result.data.error || 'Failed to submit payout request. Please try again.');
      }
    } catch (err: unknown) {
      console.error('[WalletPayouts] Payout request failed:', err);
      const code = (err as { code?: string } | null)?.code;
      if (code === 'unauthenticated') {
        setRequestError('You must be signed in to request a payout.');
      } else if (code === 'failed-precondition') {
        setRequestError('Your account does not meet payout requirements. Please ensure your profile is complete and verified.');
      } else {
        const message = (err as { message?: string } | null)?.message;
        setRequestError(message || 'Failed to submit payout request. Please try again.');
      }
    } finally {
      setRequesting(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────
  function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  const canRequestPayout = availableBalance >= MIN_PAYOUT_TOKENS && !requesting;

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm">
          <Link href="/wallet" className="text-pink-600 hover:text-pink-700">
            Wallet
          </Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-gray-600">Payouts</span>
        </nav>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">Payouts</h1>

        {/* ── Balance & Request Section ────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6 mb-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Available Balance */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Available for Payout
              </h2>
              {balanceLoading ? (
                <div className="animate-pulse h-12 bg-gray-200 dark:bg-gray-700 rounded w-48" />
              ) : (
                <>
                  <div className="text-4xl font-bold text-green-600 dark:text-green-400 mb-1">
                    {availableBalance.toLocaleString()} tokens
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    ≈ ${(availableBalance * TOKEN_PAYOUT_USD).toFixed(2)} USD
                  </p>
                </>
              )}

              {/* Threshold info */}
              <div className="mt-4 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">Payout threshold:</span> minimum{' '}
                  {MIN_PAYOUT_TOKENS} tokens = ${MIN_PAYOUT_USD.toFixed(2)} USD
                </p>
                {availableBalance < MIN_PAYOUT_TOKENS && !balanceLoading && (
                  <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                    You need {MIN_PAYOUT_TOKENS - availableBalance} more tokens to request a
                    payout.
                  </p>
                )}
              </div>
            </div>

            {/* Payout Request */}
            <div className="flex flex-col justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Request Payout
                </h2>

                {!balanceLoading && availableBalance >= MIN_PAYOUT_TOKENS && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-4 text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Tokens:</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {availableBalance.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        Estimated payout:
                      </span>
                      <span className="font-bold text-green-600 dark:text-green-400">
                        ${(availableBalance * TOKEN_PAYOUT_USD).toFixed(2)} USD
                      </span>
                    </div>
                  </div>
                )}

                {requestError && (
                  <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-2 rounded-lg text-sm mb-4">
                    {requestError}
                  </div>
                )}
                {requestSuccess && (
                  <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-2 rounded-lg text-sm mb-4">
                    {requestSuccess}
                  </div>
                )}
              </div>

              <button
                onClick={handleRequestPayout}
                disabled={!canRequestPayout}
                className="w-full bg-pink-600 hover:bg-pink-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition"
              >
                {requesting ? 'Submitting...' : 'Request Payout'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Info Box ─────────────────────────────────────────────── */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-xl" aria-hidden="true">ℹ️</span>
            <div>
              <h3 className="font-medium text-blue-900 dark:text-blue-200">Payout Processing</h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Payouts processed within 3-5 business days via bank transfer.
                Make sure your payment details are up to date in your account settings.
              </p>
            </div>
          </div>
        </div>

        {/* ── Payout History ───────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Payout History
            </h2>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600" />
            </div>
          ) : payouts.length === 0 ? (
            <div className="text-center py-12 px-6">
              <div className="text-4xl mb-3" aria-hidden="true">📭</div>
              <p className="text-gray-500 dark:text-gray-400">
                No payout requests yet.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Tokens
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Amount (USD)
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {payouts.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(p.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                          {p.tokensRequested.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-700 dark:text-gray-300">
                          ${p.amountUsd.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <PayoutStatusBadge status={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
                {payouts.map((p) => (
                  <div key={p.id} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {p.tokensRequested.toLocaleString()} tokens
                      </span>
                      <PayoutStatusBadge status={p.status} />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {formatDate(p.createdAt)}
                      </span>
                      <span className="text-gray-700 dark:text-gray-300">
                        ${p.amountUsd.toFixed(2)} USD
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
