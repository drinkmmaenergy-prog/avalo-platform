/**
 * PACK 321B — Web Wallet Token Store
 * Purchase token packs
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface TokenPack {
  id: string;
  name: string;
  tokens: number;
  pricePLN: number;
  priceUSD?: number;
  priceEUR?: number;
  active: boolean;
  order: number;
  popularBadge?: boolean;
}

// PACK 321: Immutable token packs
const TOKEN_PACKS: TokenPack[] = [
  { id: 'mini', name: 'Mini', tokens: 100, pricePLN: 31.99, priceUSD: 8.00, priceEUR: 7.50, active: true, order: 1 },
  { id: 'basic', name: 'Basic', tokens: 300, pricePLN: 85.99, priceUSD: 21.50, priceEUR: 20.00, active: true, order: 2 },
  { id: 'standard', name: 'Standard', tokens: 500, pricePLN: 134.99, priceUSD: 34.00, priceEUR: 31.50, active: true, order: 3, popularBadge: true },
  { id: 'premium', name: 'Premium', tokens: 1000, pricePLN: 244.99, priceUSD: 61.50, priceEUR: 57.50, active: true, order: 4 },
  { id: 'pro', name: 'Pro', tokens: 2000, pricePLN: 469.99, priceUSD: 118.00, priceEUR: 110.00, active: true, order: 5 },
  { id: 'elite', name: 'Elite', tokens: 5000, pricePLN: 1125.99, priceUSD: 282.50, priceEUR: 264.00, active: true, order: 6 },
  { id: 'royal', name: 'Royal', tokens: 10000, pricePLN: 2149.99, priceUSD: 539.00, priceEUR: 504.00, active: true, order: 7 },
];

export default function BuyTokensPage() {
  const router = useRouter();
  const [packs, setPacks] = useState<TokenPack[]>([]);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [currency, setCurrency] = useState<'PLN' | 'USD' | 'EUR'>('PLN');

  useEffect(() => {
    setPacks(TOKEN_PACKS);
  }, []);

  const getPrice = (pack: TokenPack) => {
    switch (currency) {
      case 'USD': return pack.priceUSD?.toFixed(2) || pack.pricePLN.toFixed(2);
      case 'EUR': return pack.priceEUR?.toFixed(2) || pack.pricePLN.toFixed(2);
      default: return pack.pricePLN.toFixed(2);
    }
  };

  const handlePurchase = async (pack: TokenPack) => {
    // TODO: Integrate with Stripe checkout
    setPurchasing(pack.id);
    
    try {
      // Placeholder - implement Stripe checkout session
      alert(`Payment integration coming soon.\n\nThis will redirect to Stripe checkout for:\n${pack.tokens} tokens for ${getPrice(pack)} ${currency}`);
    } catch (error) {
      console.error('Purchase error:', error);
      alert('Purchase failed. Please try again.');
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">💎 Buy Tokens</h1>
            <button
              onClick={() => router.back()}
              className="text-gray-600 hover:text-gray-900 transition text-2xl"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Currency Selector */}
        <div className="mb-8 flex justify-center gap-2">
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

        {/* Token Packs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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
                    {(pack.tokens * 0.20).toFixed(2)} PLN
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

        {/* Important Info */}
        <div className="bg-white rounded-2xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Important Information</h3>
          <div className="space-y-2 text-gray-700 text-sm">
            <p>✓ Secure payment via Stripe</p>
            <p>✓ Instant token delivery</p>
            <p>✓ 18+ required</p>
            <p>✓ Payout rate: 0.20 PLN/token</p>
            <p>⚠️ No refunds on token purchases (except where required by law)</p>
            <p>⚠️ Terms & Conditions apply</p>
          </div>
        </div>
      </div>
    </div>
  );
}