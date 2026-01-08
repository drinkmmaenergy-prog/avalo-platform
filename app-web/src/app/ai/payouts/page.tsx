/**
 * PACK 279E — AI Creator Payout Screen (Web)
 * Request payouts for AI companion earnings
 * Minimum payout: 1000 tokens = 200 PLN
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  getDoc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { db } from '@/lib/firebase';

const MIN_PAYOUT_TOKENS = 1000;
const TOKEN_TO_PLN = 0.20;
const MIN_PAYOUT_PLN = MIN_PAYOUT_TOKENS * TOKEN_TO_PLN; // 200 PLN

interface PayoutRequest {
  id: string;
  requestedAt: Date;
  tokens: number;
  plnValue: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  completedAt?: Date;
}

export default function AIPayoutsWebPage() {
  const router = useRouter();
  const auth = getAuth();

  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [availableTokens, setAvailableTokens] = useState(0);
  const [lockedTokens, setLockedTokens] = useState(0);
  const [payoutHistory, setPayoutHistory] = useState<PayoutRequest[]>([]);

  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      loadData(user.uid);
    } else {
      // Wait for auth state
      const unsubscribe = auth.onAuthStateChanged((user) => {
        if (user) {
          loadData(user.uid);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  const loadData = async (userId: string) => {
    try {
      setLoading(true);

      // Load wallet balance
      const walletRef = doc(db, 'wallets', userId);
      const walletSnap = await getDoc(walletRef);

      if (walletSnap.exists()) {
        const walletData = walletSnap.data();
        setAvailableTokens(walletData.availableTokens || 0);
        setLockedTokens(walletData.lockedTokens || 0);
      }

      // Load payout history
      const payoutsRef = collection(db, 'payoutRequests');
      const payoutsQuery = query(
        payoutsRef,
        where('userId', '==', userId),
        where('type', '==', 'ai_creator'),
        orderBy('requestedAt', 'desc'),
        limit(20)
      );

      const payoutsSnapshot = await getDocs(payoutsQuery);
      const payouts = payoutsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        requestedAt: doc.data().requestedAt?.toDate(),
        completedAt: doc.data().completedAt?.toDate(),
      })) as PayoutRequest[];

      setPayoutHistory(payouts);
    } catch (error) {
      console.error('Error loading payout data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPayout = async () => {
    const user = auth.currentUser;
    if (!user) return;

    if (availableTokens < MIN_PAYOUT_TOKENS) {
      alert(
        `Minimum payout is ${MIN_PAYOUT_TOKENS} tokens (${MIN_PAYOUT_PLN} PLN). You currently have ${availableTokens.toLocaleString()} tokens.`
      );
      return;
    }

    if (!confirm(
      `Request payout of ${availableTokens.toLocaleString()} tokens (≈${formatPLN(availableTokens * TOKEN_TO_PLN)} PLN)?`
    )) {
      return;
    }

    try {
      setRequesting(true);

      const functions = getFunctions();
      const requestPayout = httpsCallable(functions, 'pack277_requestPayout');

      await requestPayout({
        tokens: availableTokens,
        type: 'ai_creator',
      });

      alert(
        'Payout request submitted successfully. You will receive your payment within 2-5 business days.'
      );

      // Reload data
      await loadData(user.uid);
    } catch (error: any) {
      console.error('Error requesting payout:', error);
      alert(error.message || 'Failed to request payout. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const formatTokens = (tokens: number) => {
    return tokens.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  const formatPLN = (pln: number) => {
    return pln.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'processing': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
      case 'pending': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'cancelled': return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✅';
      case 'processing': return '⏳';
      case 'pending': return '⏰';
      case 'cancelled': return '❌';
      default: return '❓';
    }
  };

  const canRequestPayout = availableTokens >= MIN_PAYOUT_TOKENS;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading payout information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-700 mb-4 inline-flex items-center"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Request Payout
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Transfer your AI earnings to your bank account
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Wallet Balance Card */}
        <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-lg p-8 text-white mb-8 shadow-lg">
          <p className="text-sm opacity-90 mb-2">Available for Payout</p>
          <h2 className="text-4xl font-bold mb-2">
            {formatTokens(availableTokens)} tokens
          </h2>
          <p className="text-xl opacity-90">
            ≈ {formatPLN(availableTokens * TOKEN_TO_PLN)} PLN
          </p>

          {lockedTokens > 0 && (
            <div className="mt-6 pt-4 border-t border-white/30 flex items-center gap-2">
              <span className="text-yellow-300">🔒</span>
              <span className="text-sm opacity-90">
                {formatTokens(lockedTokens)} tokens locked (pending settlements)
              </span>
            </div>
          )}
        </div>

        {/* Minimum Payout Notice */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-8">
          <div className="flex items-start gap-4">
            <span className="text-2xl">ℹ️</span>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-2">
                Minimum Payout
              </h3>
              <p className="text-blue-800 dark:text-blue-400 mb-2">
                {MIN_PAYOUT_TOKENS} tokens = {MIN_PAYOUT_PLN} PLN
              </p>
              {!canRequestPayout && (
                <p className="text-red-600 dark:text-red-400 font-semibold">
                  You need {(MIN_PAYOUT_TOKENS - availableTokens).toLocaleString()} more tokens to request a payout
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Request Payout Button */}
        <div className="mb-8">
          <button
            onClick={handleRequestPayout}
            disabled={!canRequestPayout || requesting}
            className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-colors ${
              canRequestPayout && !requesting
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {requesting ? (
              <span className="inline-flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Processing...
              </span>
            ) : canRequestPayout ? (
              '💰 Request Payout'
            ) : (
              'Insufficient Balance'
            )}
          </button>
          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-3">
            Payouts are processed within 2-5 business days
          </p>
        </div>

        {/* Payout History */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow mb-8">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Payout History
          </h3>
          {payoutHistory.length > 0 ? (
            <div className="space-y-4">
              {payoutHistory.map((payout) => (
                <div
                  key={payout.id}
                  className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(payout.status)}`}>
                      {getStatusIcon(payout.status)} {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(payout.requestedAt)}
                    </span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xl font-semibold text-gray-900 dark:text-white">
                        {formatTokens(payout.tokens)} tokens
                      </p>
                      <p className="text-gray-600 dark:text-gray-400">
                        {formatPLN(payout.plnValue)} PLN
                      </p>
                    </div>
                    {payout.completedAt && (
                      <p className="text-sm text-green-600 dark:text-green-400 italic">
                        Completed: {formatDate(payout.completedAt)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">👛</div>
              <p className="text-gray-600 dark:text-gray-400 mb-2">No payout requests yet</p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                Your payout history will appear here
              </p>
            </div>
          )}
        </div>

        {/* Important Info */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-300 mb-4">
            💡 Important Information
          </h3>
          <div className="space-y-3 text-sm text-yellow-800 dark:text-yellow-400">
            <div className="flex items-start gap-3">
              <span className="text-green-600 mt-0.5">✓</span>
              <p>Payouts are processed to your verified bank account</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-green-600 mt-0.5">✓</span>
              <p>Processing time: 2-5 business days</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-green-600 mt-0.5">✓</span>
              <p>Conversion rate: 1 Token = {TOKEN_TO_PLN.toFixed(2)} PLN</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-green-600 mt-0.5">✓</span>
              <p>Minimum payout: {MIN_PAYOUT_TOKENS} tokens</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center p-6 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Ensure your tax profile and bank details are up to date before requesting a payout.
          </p>
          <button
            onClick={() => router.push('/profile/earnings-taxes')}
            className="text-blue-600 hover:text-blue-700 font-semibold"
          >
            Manage Tax Profile →
          </button>
        </div>
      </div>
    </div>
  );
}