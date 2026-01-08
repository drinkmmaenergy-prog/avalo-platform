/**
 * PACK 321B — Web Wallet Main Page
 * Token balance overview with quick actions
 * Note: Adapt Firebase calls to match your existing web infrastructure
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface WalletBalance {
  tokensBalance: number;
  lifetimePurchasedTokens: number;
  lifetimeSpentTokens: number;
  lifetimeEarnedTokens: number;
}

export default function WalletPage() {
  const router = useRouter();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBalance();
  }, []);

  const loadBalance = async () => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Replace with your Firebase callable function call
      // Example: const result = await yourFirebaseCall('pack277_getBalance');
      // For now, using placeholder
      
      // Simulated API call - REPLACE WITH ACTUAL IMPLEMENTATION
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setBalance({
        tokensBalance: 0,
        lifetimePurchasedTokens: 0,
        lifetimeSpentTokens: 0,
        lifetimeEarnedTokens: 0,
      });
    } catch (err: any) {
      console.error('Load balance error:', err);
      setError(err.message || 'Failed to load wallet');
    } finally {
      setLoading(false);
    }
  };

  const getFiatEquivalent = (tokens: number) => {
    // Payout rate: 1 token = 0.20 PLN
    const pln = tokens * 0.20;
    return pln.toFixed(2);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading wallet...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Wallet</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadBalance}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">💰 Wallet</h1>
            <button
              onClick={loadBalance}
              className="text-gray-600 hover:text-gray-900 transition"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Balance Card */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl shadow-xl p-8 mb-8 text-white">
          <p className="text-purple-200 text-sm uppercase tracking-wide mb-2">Token Balance</p>
          <div className="flex items-baseline gap-3 mb-2">
            <h2 className="text-5xl font-bold">
              {balance?.tokensBalance.toLocaleString() || '0'}
            </h2>
            <span className="text-xl text-purple-200">tokens</span>
          </div>
          <div className="mt-6 pt-6 border-t border-purple-400">
            <p className="text-lg font-semibold">
              ≈ {getFiatEquivalent(balance?.tokensBalance || 0)} PLN
            </p>
            <p className="text-sm text-purple-200 mt-1">
              (estimated at 0.20 PLN/token payout rate)
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={() => router.push('/wallet/buy')}
              className="bg-purple-600 hover:bg-purple-700 text-white p-6 rounded-xl shadow-md transition flex flex-col items-center"
            >
              <span className="text-4xl mb-2">💳</span>
              <span className="font-semibold">Buy Tokens</span>
            </button>
            
            <button
              onClick={() => router.push('/wallet/transactions')}
              className="bg-white hover:bg-gray-50 text-gray-900 p-6 rounded-xl shadow-md transition flex flex-col items-center border border-gray-200"
            >
              <span className="text-4xl mb-2">📜</span>
              <span className="font-semibold">History</span>
            </button>
            
            <button
              onClick={() => router.push('/wallet/payouts')}
              className="bg-white hover:bg-gray-50 text-gray-900 p-6 rounded-xl shadow-md transition flex flex-col items-center border border-gray-200"
            >
              <span className="text-4xl mb-2">💰</span>
              <span className="font-semibold">Request Payout</span>
            </button>
            
            <button
              onClick={() => window.open('/legal/wallet-policy', '_blank')}
              className="bg-white hover:bg-gray-50 text-gray-900 p-6 rounded-xl shadow-md transition flex flex-col items-center border border-gray-200"
            >
              <span className="text-4xl mb-2">ℹ️</span>
              <span className="font-semibold">Info</span>
            </button>
          </div>
        </div>

        {/* Lifetime Stats */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Lifetime Statistics</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-gray-100">
              <span className="text-gray-600">💸 Purchased</span>
              <span className="text-xl font-bold text-gray-900">
                {balance?.lifetimePurchasedTokens.toLocaleString() || '0'}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-gray-100">
              <span className="text-gray-600">🎯 Spent</span>
              <span className="text-xl font-bold text-gray-900">
                {balance?.lifetimeSpentTokens.toLocaleString() || '0'}
              </span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-gray-600">💎 Earned</span>
              <span className="text-xl font-bold text-gray-900">
                {balance?.lifetimeEarnedTokens.toLocaleString() || '0'}
              </span>
            </div>
          </div>
        </div>

        {/* Important Notice */}
        <div className="bg-amber-50 border-l-4 border-amber-500 rounded-lg p-6">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span>⚠️</span>
            <span>Important Information</span>
          </h4>
          <ul className="space-y-2 text-gray-700 text-sm">
            <li>• Tokens are for 18+ users only</li>
            <li>• Payout rate: 1 token = 0.20 PLN</li>
            <li>• Minimum payout: 1,000 tokens (200 PLN)</li>
            <li>• KYC verification required for payouts</li>
            <li>• No refunds on token purchases (except where required by law)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}