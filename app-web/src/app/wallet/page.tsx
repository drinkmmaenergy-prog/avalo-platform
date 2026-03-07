'use client';

"use client";

/**
 * /wallet — Main Wallet Hub Page
 *
 * Auth-protected (via layout.tsx), force-dynamic.
 * Shows:
 * - Token balance (read from user profile / Firestore)
 * - Quick links: Buy Tokens, Purchase History
 * - Creator earnings summary (if user is a creator)
 *
 * INVARIANTS:
 * - tokenBalance is READ-ONLY from Firestore (set by webhook only).
 * - Creator earnings use PAYOUT_PER_TOKEN_USD = 0.03.
 * - 1 chat = 100 tokens.
 */
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet as WalletIcon, ShoppingCart, ClipboardList, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import { doc, onSnapshot } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { TOKEN_PAYOUT_USD } from '@/lib/economyConfig';

interface CreatorEarnings {
  totalTokensEarnedAllTime: number;
  withdrawableTokens: number;
  pendingTokens: number;
}

export default function WalletPage() {
  const { user, firebaseUser } = useAuth();
  const { t } = useI18n();
  const [tokenBalance, setTokenBalance] = useState<number>(user?.tokenBalance ?? 0);
  const [creatorEarnings, setCreatorEarnings] = useState<CreatorEarnings | null>(null);

  // Real-time listener for token balance
  useEffect(() => {
    if (!firebaseUser?.uid) return;

    const unsub = onSnapshot(doc(requireDb(), 'users', firebaseUser.uid), (snap) => {
      if (snap.exists()) {
        setTokenBalance(snap.data().tokenBalance ?? 0);
      }
    });

    return () => unsub();
  }, [firebaseUser?.uid]);

  // Load creator earnings if user is a creator
  useEffect(() => {
    if (!user?.isCreator || !firebaseUser?.uid) return;

    const unsub = onSnapshot(doc(requireDb(), 'creator_earnings', firebaseUser.uid), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setCreatorEarnings({
          totalTokensEarnedAllTime: d.totalTokensEarnedAllTime ?? 0,
          withdrawableTokens: d.withdrawableTokens ?? 0,
          pendingTokens: d.pendingTokens ?? 0,
        });
      }
    });

    return () => unsub();
  }, [user?.isCreator, firebaseUser?.uid]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Page Title */}
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        {t('wallet.title')}
      </h1>

      {/* Token Balance Card */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {t('wallet.tokenBalance')}
          </h2>
          <WalletIcon className="w-5 h-5 text-primary-500" />
        </div>
        <div className="text-4xl font-bold text-primary-600 dark:text-primary-400 mb-1">
          {tokenBalance.toLocaleString()}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('wallet.availableTokens')}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Link
          href="/wallet/buy"
          className="card p-5 hover:shadow-md transition-shadow group flex items-center gap-4"
        >
          <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition">
              {t('wallet.buyTokens')}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {t('wallet.buyTokensDesc')}
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition" />
        </Link>

        <Link
          href="/wallet/history"
          className="card p-5 hover:shadow-md transition-shadow group flex items-center gap-4"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition">
              {t('wallet.purchaseHistory')}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {t('wallet.purchaseHistoryDesc')}
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition" />
        </Link>
      </div>

      {/* Creator Earnings Section */}
      {user?.isCreator && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            {t('wallet.creatorEarnings')}
          </h2>

          {creatorEarnings ? (
            <div className="space-y-4">
              {/* Available for Payout */}
              <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {t('wallet.availableForPayout')}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('wallet.readyToWithdraw')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-green-600 dark:text-green-400">
                    {creatorEarnings.withdrawableTokens.toLocaleString()} tokens
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    ≈ ${(creatorEarnings.withdrawableTokens * TOKEN_PAYOUT_USD).toFixed(2)} USD
                  </div>
                </div>
              </div>

              {/* Pending */}
              <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {t('wallet.pending')}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('wallet.processingPeriod')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                    {creatorEarnings.pendingTokens.toLocaleString()} tokens
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    ≈ ${(creatorEarnings.pendingTokens * TOKEN_PAYOUT_USD).toFixed(2)} USD
                  </div>
                </div>
              </div>

              {/* All-Time Earned */}
              <div className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {t('wallet.allTimeEarned')}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('wallet.totalLifetimeEarnings')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-gray-900 dark:text-white">
                    {creatorEarnings.totalTokensEarnedAllTime.toLocaleString()} tokens
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    ≈ ${(creatorEarnings.totalTokensEarnedAllTime * TOKEN_PAYOUT_USD).toFixed(2)} USD
                  </div>
                </div>
              </div>

              {/* Link to Creator Panel */}
              <div className="pt-4">
                <Link
                  href="/creator/payouts"
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium text-sm flex items-center gap-1 transition"
                >
                  {t('wallet.managePayouts')}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {t('wallet.noEarnings')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}



