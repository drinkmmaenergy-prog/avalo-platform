/**
 * PACK 321B — Web Wallet Payout Request
 * Request token payout with KYC verification
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const MIN_PAYOUT_TOKENS = 1000;
const TOKEN_PAYOUT_RATE = 0.20; // PLN per token

export default function PayoutsPage() {
  const router = useRouter();
  const [balance, setBalance] = useState(0);
  const [earnedBalance, setEarnedBalance] = useState(0);
  const [amountTokens, setAmountTokens] = useState('');
  const [currency, setCurrency] = useState<'PLN' | 'USD' | 'EUR' | 'GBP'>('PLN');
  const [payoutMethod, setPayoutMethod] = useState<'stripe_connect' | 'bank_transfer'>('stripe_connect');
  const [kycVerified, setKycVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadWalletInfo();
  }, []);

  const loadWalletInfo = async () => {
    try {
      setLoading(true);
      
      // TODO: Replace with actual Firebase callable function
      // const result = await yourFirebaseCall('pack277_getBalance');
      
      // Simulated API call - REPLACE WITH ACTUAL IMPLEMENTATION
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setBalance(0);
      setEarnedBalance(0);
      setKycVerified(false);
    } catch (err) {
      console.error('Load wallet info error:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculatePayout = (tokens: string) => {
    const amount = parseInt(tokens) || 0;
    const plnAmount = amount * TOKEN_PAYOUT_RATE;
    
    // Simplified exchange rates
    const exchangeRates: Record<string, number> = {
      PLN: 1.0,
      USD: 0.25,
      EUR: 0.23,
      GBP: 0.20,
    };
    
    const localAmount = plnAmount * exchangeRates[currency];
    return localAmount.toFixed(2);
  };

  const handlePayout = async () => {
    const tokens = parseInt(amountTokens);

    if (!tokens || tokens < MIN_PAYOUT_TOKENS) {
      alert(`Minimum payout is ${MIN_PAYOUT_TOKENS} tokens`);
      return;
    }

    if (tokens > balance) {
      alert("You don't have enough tokens");
      return;
    }

    if (tokens > earnedBalance) {
      alert('You can only cash out earned tokens, not purchased tokens');
      return;
    }

    if (!kycVerified) {
      const proceed = confirm('KYC verification is required for payouts. Would you like to verify now?');
      if (proceed) {
        // TODO: Navigate to KYC verification
        alert('KYC verification coming soon');
      }
      return;
    }

    const plnAmount = (tokens * TOKEN_PAYOUT_RATE).toFixed(2);
    const localAmount = calculatePayout(amountTokens);

    const confirmed = confirm(
      `Request payout of ${tokens} tokens (${localAmount} ${currency} ≈ ${plnAmount} PLN)?\n\nProcessing may take 3-5 business days.`
    );

    if (!confirmed) return;

    try {
      setSubmitting(true);
      
      // TODO: Replace with actual Firebase callable function
      // const result = await yourFirebaseCall('pack277_requestPayout', { amountTokens: tokens, payoutMethod, currency });
      
      alert('Payout request submitted successfully! You will receive the funds within 3-5 business days.');
      router.back();
    } catch (err: any) {
      console.error('Payout error:', err);
      alert(err.message || 'Failed to submit payout');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
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
            <h1 className="text-2xl font-bold text-gray-900">💰 Request Payout</h1>
            <button
              onClick={() => router.back()}
              className="text-gray-600 hover:text-gray-900 transition text-2xl"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Balance Card */}
        <div className="bg-gradient-to-br from-purple-100 to-purple-200 rounded-2xl p-6 mb-6">
          <p className="text-sm text-gray-700 mb-2">Available Balance</p>
          <p className="text-4xl font-bold text-purple-900 mb-1">
            {balance.toLocaleString()} <span className="text-2xl">tokens</span>
          </p>
          <p className="text-sm text-gray-700">
            Earned: {earnedBalance.toLocaleString()} tokens
          </p>
          <p className="text-purple-800 mt-2">
            ≈ {(balance * TOKEN_PAYOUT_RATE).toFixed(2)} PLN
          </p>
        </div>

        {/* KYC Status */}
        <div className={`rounded-xl p-4 mb-6 flex items-center gap-4 ${
          kycVerified ? 'bg-green-50 border-2 border-green-200' : 'bg-amber-50 border-2 border-amber-200'
        }`}>
          <div className="text-4xl">{kycVerified ? '✓' : '⚠️'}</div>
          <div className="flex-grow">
            <h3 className="font-bold text-gray-900">
              {kycVerified ? 'KYC Verified' : 'KYC Not Verified'}
            </h3>
            <p className="text-sm text-gray-600">
              {kycVerified ? 'You can request payouts' : 'Complete KYC to request payouts'}
            </p>
          </div>
          {!kycVerified && (
            <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition">
              Verify
            </button>
          )}
        </div>

        {/* Payout Amount */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payout Amount</h3>
          
          <div className="mb-4">
            <input
              type="number"
              placeholder={`Minimum ${MIN_PAYOUT_TOKENS} tokens`}
              value={amountTokens}
              onChange={(e) => setAmountTokens(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent text-2xl font-bold"
              disabled={submitting}
            />
          </div>

          {amountTokens && parseInt(amountTokens) >= MIN_PAYOUT_TOKENS && (
            <div className="bg-purple-50 rounded-lg p-4 mb-4 text-center">
              <p className="text-sm text-gray-600 mb-1">You will receive:</p>
              <p className="text-3xl font-bold text-purple-600">
                {calculatePayout(amountTokens)} {currency}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                (at {TOKEN_PAYOUT_RATE} PLN/token payout rate)
              </p>
            </div>
          )}

          <div className="flex gap-2">
            {[1000, 2500, 5000].map((amount) => (
              <button
                key={amount}
                onClick={() => setAmountTokens(amount.toString())}
                disabled={amount > balance}
                className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 text-gray-900 py-2 rounded-lg font-semibold transition"
              >
                {amount.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Currency Selection */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Currency</h3>
          <div className="grid grid-cols-4 gap-2">
            {(['PLN', 'USD', 'EUR', 'GBP'] as const).map((curr) => (
              <button
                key={curr}
                onClick={() => setCurrency(curr)}
                className={`py-2 rounded-lg font-semibold transition ${
                  currency === curr
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {curr}
              </button>
            ))}
          </div>
        </div>

        {/* Payout Method */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payout Method</h3>
          
          <button
            onClick={() => setPayoutMethod('stripe_connect')}
            className={`w-full flex items-center gap-4 p-4 rounded-lg mb-3 border-2 transition ${
              payoutMethod === 'stripe_connect'
                ? 'border-purple-600 bg-purple-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-3xl">💳</div>
            <div className="text-left flex-grow">
              <p className="font-semibold text-gray-900">Stripe Connect</p>
              <p className="text-sm text-gray-600">Fast & secure</p>
            </div>
          </button>

          <button
            onClick={() => setPayoutMethod('bank_transfer')}
            className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 transition ${
              payoutMethod === 'bank_transfer'
                ? 'border-purple-600 bg-purple-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-3xl">🏦</div>
            <div className="text-left flex-grow">
              <p className="font-semibold text-gray-900">Bank Transfer</p>
              <p className="text-sm text-gray-600">3-5 business days</p>
            </div>
          </button>
        </div>

        {/* Important Info */}
        <div className="bg-amber-50 border-l-4 border-amber-500 rounded-lg p-6 mb-6">
          <h4 className="font-semibold text-gray-900 mb-3">⚠️ Important Information</h4>
          <ul className="space-y-1 text-sm text-gray-700">
            <li>• Minimum payout: {MIN_PAYOUT_TOKENS} tokens ({MIN_PAYOUT_TOKENS * TOKEN_PAYOUT_RATE} PLN)</li>
            <li>• Payout rate: {TOKEN_PAYOUT_RATE} PLN per token</li>
            <li>• Processing time: 3-5 business days</li>
            <li>• KYC verification required</li>
            <li>• Platform fees may apply</li>
            <li>• Payouts are irreversible</li>
          </ul>
        </div>

        {/* Submit Button */}
        <button
          onClick={handlePayout}
          disabled={
            submitting ||
            !kycVerified ||
            !amountTokens ||
            parseInt(amountTokens) < MIN_PAYOUT_TOKENS
          }
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-4 rounded-lg transition text-lg"
        >
          {submitting ? 'Processing...' : 'Request Payout'}
        </button>
      </div>
    </div>
  );
}