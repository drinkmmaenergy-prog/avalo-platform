/**
 * PACK 343 — Token Purchase Page
 * Buy token packs and view purchase history
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AccountLayout } from '../../../components/account/AccountLayout';
import { ComplianceGate } from '../../../components/account/ComplianceGate';
import { useWallet } from '../../../../hooks/useWallet';
import { useCompliance } from '../../../../hooks/useCompliance';
import type { WalletBalance, TokenPack, Transaction } from '../../../../hooks/useWallet';
import type { UserComplianceStatus } from '../../../../hooks/useCompliance';

export default function TokensPage() {
  const searchParams = useSearchParams();
  const { getBalance, getTokenPacks, getTransactionHistory, purchaseTokensWeb } = useWallet();
  const { getComplianceStatus, canMakePayments } = useCompliance();

  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [packs, setPacks] = useState<TokenPack[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [compliance, setCompliance] = useState<UserComplianceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<'PLN' | 'USD' | 'EUR'>('PLN');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    loadData();

    // Check for payment status in URL
    const status = searchParams.get('status');
    if (status === 'success') {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } else if (status === 'failed') {
      setShowError(true);
      setTimeout(() => setShowError(false), 5000);
    }
  }, [searchParams]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [balanceData, packsData, transactionsData, complianceData] = await Promise.all([
        getBalance(),
        getTokenPacks(),
        getTransactionHistory(20),
        getComplianceStatus(),
      ]);

      setBalance(balanceData);
      setPacks(packsData);
      setTransactions(transactionsData);
      setCompliance(complianceData);
    } catch (err: any) {
      console.error('Load tokens error:', err);
      setError(err.message || 'Failed to load token data');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (pack: TokenPack) => {
    if (!compliance || !canMakePayments(compliance)) {
      alert('You cannot make payments at this time. Please check your account status.');
      return;
    }

    try {
      setPurchasing(pack.id);
      const checkoutUrl = await purchaseTokensWeb(pack.id);
      window.location.href = checkoutUrl;
    } catch (err: any) {
      console.error('Purchase error:', err);
      alert(err.message || 'Failed to start purchase checkout');
    } finally {
      setPurchasing(null);
    }
  };

  const getPrice = (pack: TokenPack) => {
    switch (currency) {
      case 'USD':
        return pack.priceUSD?.toFixed(2) || pack.pricePLN.toFixed(2);
      case 'EUR':
        return pack.priceEUR?.toFixed(2) || pack.pricePLN.toFixed(2);
      default:
        return pack.pricePLN.toFixed(2);
    }
  };

  const getFiatEquivalent = (tokens: number) => {
    return (tokens * 0.20).toFixed(2);
  };

  if (loading) {
    return (
      <AccountLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading tokens...</p>
          </div>
        </div>
      </AccountLayout>
    );
  }

  if (error) {
    return (
      <AccountLayout>
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Tokens</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadData}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition"
          >
            Retry
          </button>
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout>
      {/* Success/Error Alerts */}
      {showSuccess && (
        <div className="mb-6 bg-green-50 border-2 border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold text-green-900">Purchase Successful!</p>
              <p className="text-green-800 text-sm">Your tokens have been added to your account.</p>
            </div>
          </div>
        </div>
      )}

      {showError && (
        <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">❌</span>
            <div>
              <p className="font-semibold text-red-900">Purchase Failed</p>
              <p className="text-red-800 text-sm">There was a problem processing your payment.</p>
            </div>
          </div>
        </div>
      )}

      <ComplianceGate complianceStatus={compliance!} requiredFor="PAYMENT">
        <div>
          {/* Current Balance */}
          <section className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Current Token Balance</h2>
            <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-lg p-6 text-white">
              <p className="text-purple-200 text-sm mb-2">Available Tokens</p>
              <div className="flex items-baseline gap-3 mb-3">
                <h3 className="text-5xl font-bold">
                  {balance?.tokensBalance.toLocaleString() || '0'}
                </h3>
                <span className="text-xl text-purple-200">tokens</span>
              </div>
              <div className="pt-4 border-t border-purple-400">
                <p className="text-lg font-semibold">
                  ≈ {getFiatEquivalent(balance?.tokensBalance || 0)} PLN
                </p>
                <p className="text-sm text-purple-200">Estimated payout value (0.20 PLN/token)</p>
              </div>
            </div>
          </section>

          {/* Currency Selector */}
          <div className="mb-6 flex justify-center gap-2">
            {(['PLN', 'USD', 'EUR'] as const).map((curr) => (
              <button
                key={curr}
                onClick={() => setCurrency(curr)}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  currency === curr
                    ? 'bg-purple-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {curr}
              </button>
            ))}
          </div>

          {/* Token Packs */}
          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Buy Token Packs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {packs.map((pack) => (
                <div
                  key={pack.id}
                  className="bg-white rounded-2xl shadow-md p-6 relative hover:shadow-lg transition"
                >
                  {pack.popularBadge && (
                    <div className="absolute -top-3 right-6 bg-purple-600 text-white px-4 py-1 rounded-full text-sm font-bold">
                      ⭐ Most Popular
                    </div>
                  )}

                  <div className="text-center mb-6 mt-2">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{pack.name}</h3>
                    <div className="text-5xl font-bold text-purple-600 my-4">
                      {pack.tokens.toLocaleString()}
                    </div>
                    <p className="text-gray-600">tokens</p>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Price:</span>
                      <span className="text-xl font-bold text-gray-900">
                        {getPrice(pack)} {currency}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600 text-sm">Payout value:</span>
                      <span className="text-sm text-gray-600">
                        {getFiatEquivalent(pack.tokens)} PLN
                      </span>
                    </div>
                    <div className="text-center text-sm text-gray-500">
                      💡 {(pack.pricePLN / pack.tokens).toFixed(3)} PLN per token
                    </div>
                  </div>

                  <button
                    onClick={() => handlePurchase(pack)}
                    disabled={purchasing === pack.id}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition"
                  >
                    {purchasing === pack.id ? 'Processing...' : 'Buy Now'}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Purchase History */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Purchase History</h2>
            {transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions
                  .filter((t) => t.type === 'PURCHASE')
                  .map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between py-3 border-b border-gray-100"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">
                          {transaction.status === 'COMPLETED'
                            ? '✅'
                            : transaction.status === 'PENDING'
                            ? '⏳'
                            : '❌'}
                        </span>
                        <div>
                          <p className="font-medium text-gray-900">{transaction.description}</p>
                          <p className="text-sm text-gray-600">
                            {new Date(transaction.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-purple-600">
                          +{transaction.amount.toLocaleString()} tokens
                        </p>
                        <p className="text-sm text-gray-600 capitalize">{transaction.status}</p>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p className="text-4xl mb-2">📦</p>
                <p>No purchases yet</p>
              </div>
            )}
          </section>

          {/* Important Info */}
          <div className="mt-6 bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Important Information</h3>
            <div className="space-y-2 text-gray-700 text-sm">
              <p>✓ Secure payment via Stripe</p>
              <p>✓ Instant token delivery</p>
              <p>✓ 18+ age verification required</p>
              <p>✓ Payout rate: 0.20 PLN/token</p>
              <p>⚠️ No refunds on token purchases (except where required by law)</p>
              <p>⚠️ Terms & Conditions apply</p>
            </div>
          </div>
        </div>
      </ComplianceGate>
    </AccountLayout>
  );
}
