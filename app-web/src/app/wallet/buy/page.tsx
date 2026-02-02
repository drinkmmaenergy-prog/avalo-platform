/**
 * PHASE 3.3 — Web Token Purchase Page
 * 
 * Token purchase using SAME checkout session function as mobile.
 * NO discounts, NO coupons, NO overrides.
 * 
 * Backend function consumed: tokens_createCheckoutSession
 * 
 * INVARIANTS ENFORCED BY BACKEND:
 * - CANONICAL_TOKEN_PACKS: Fixed pricing, no overrides
 * - NO_DISCOUNTS: Rejects sessions with coupons
 * - Age verification required (18+)
 */

'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRoleGate } from '@/hooks/useRoleGate';
import {
  getAvailableTokenPacks,
  formatPackPrice,
  initiatePurchase,
} from '@/lib/services/phase33';
import type { CanonicalTokenPack } from '@/types/phase33.types';

type Currency = 'USD' | 'EUR' | 'PLN' | 'GBP';

export default function WalletBuyPage() {
  const { user, loading: authLoading } = useAuth();
  const { isAuthorized, isLoading: roleLoading } = useRoleGate({
    requiredRole: 'user',
    redirectTo: '/auth/login?redirect=/wallet/buy',
  });
  
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const tokenPacks = getAvailableTokenPacks();
  
  const handlePurchase = async (pack: CanonicalTokenPack) => {
    if (!user) {
      setError('Please sign in to purchase tokens');
      return;
    }
    
    setPurchasing(true);
    setError(null);
    setSelectedPack(pack.packId);
    
    await initiatePurchase(pack.packId, {
      onError: (err) => {
        setError(err);
        setPurchasing(false);
        setSelectedPack(null);
      },
      onSuccess: () => {
        // Will redirect to Stripe, no need to reset state
      },
    });
  };
  
  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600" />
      </div>
    );
  }
  
  if (!isAuthorized) {
    return null; // Redirect happens in hook
  }
  
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Buy Tokens</h1>
          <p className="text-gray-600">
            Purchase tokens to unlock premium features and support creators
          </p>
        </div>
        
        {error && (
          <div className="mb-8 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-red-700">{error}</p>
          </div>
        )}
        
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Select Currency</h2>
            <div className="flex bg-gray-100 rounded-lg p-1">
              {(['USD', 'EUR', 'PLN', 'GBP'] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                    currency === c
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tokenPacks.map((pack) => {
              const isSelected = selectedPack === pack.packId;
              const isPopular = pack.packId === 'STANDARD';
              
              return (
                <div
                  key={pack.packId}
                  className={`relative rounded-xl border-2 p-6 transition cursor-pointer ${
                    isSelected
                      ? 'border-pink-500 bg-pink-50'
                      : 'border-gray-200 hover:border-pink-300'
                  }`}
                  onClick={() => !purchasing && handlePurchase(pack)}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                      POPULAR
                    </div>
                  )}
                  
                  <div className="text-center">
                    <div className="text-3xl mb-2">💎</div>
                    <div className="text-lg font-bold text-gray-900 mb-1">
                      {pack.packId}
                    </div>
                    <div className="text-3xl font-bold text-pink-600 mb-2">
                      {pack.tokens.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500 mb-4">tokens</div>
                    
                    <div className="text-xl font-bold text-gray-900">
                      {formatPackPrice(pack, currency)}
                    </div>
                    
                    <button
                      disabled={purchasing}
                      className={`mt-4 w-full py-2 px-4 rounded-lg font-medium transition ${
                        purchasing && isSelected
                          ? 'bg-gray-300 cursor-wait'
                          : 'bg-pink-600 hover:bg-pink-700 text-white'
                      }`}
                    >
                      {purchasing && isSelected ? 'Redirecting...' : 'Buy Now'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">🔒</span>
              <div>
                <h3 className="font-medium text-blue-900">Secure Payment</h3>
                <p className="text-sm text-blue-700 mt-1">
                  All payments are processed securely via Stripe. 
                  Your payment details are never stored on our servers.
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <h3 className="font-medium text-yellow-900">Age Restriction</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  You must be 18 years or older to purchase tokens. 
                  Age verification may be required.
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">ℹ️</span>
              <div>
                <h3 className="font-medium text-gray-900">No Refunds</h3>
                <p className="text-sm text-gray-700 mt-1">
                  Token purchases are final and non-refundable. 
                  Please review your selection before completing the purchase.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
