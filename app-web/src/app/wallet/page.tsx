/**
 * Wallet Page - Web Version
 * Phase 17: Minimal integration - Read-only info about earning tokens via mobile ads
 * Phase 31B: Region-based pricing display
 * Phase 31C: Adaptive Smart Discounts integration
 */

'use client';

import React, { useState, useEffect } from 'react';
import TokenPrice from '../../../components/TokenPrice';
import PromoCard from '../../../components/PromoCard';
import { DiscountOffer } from '../../../../shared/types/discounts';
import { retrieveActiveDiscount } from '../../../../shared/utils/discountEngine';

// PLN Pricing Table (Phase 31B) - Display only
const PLN_PRICING_TABLE: Record<string, number> = {
  'mini': 31.99,     // 100 tokens
  'basic': 85.99,    // 300 tokens
  'standard': 134.99, // 500 tokens
  'premium': 244.99,  // 1000 tokens
  'pro': 469.99,      // 2000 tokens
  'elite': 1125.99,   // 5000 tokens
  'royal': 2149.99,   // 10000 tokens
};

// Token packs with USD pricing (backend uses this)
const TOKEN_PACKS = [
  { packId: 'mini', displayName: 'Mini', tokens: 100, price: 7.99 },
  { packId: 'basic', displayName: 'Basic', tokens: 300, price: 21.49 },
  { packId: 'standard', displayName: 'Standard', tokens: 500, price: 33.74, popular: true },
  { packId: 'premium', displayName: 'Premium', tokens: 1000, price: 61.24 },
  { packId: 'pro', displayName: 'Pro', tokens: 2000, price: 117.49 },
  { packId: 'elite', displayName: 'Elite', tokens: 5000, price: 281.49 },
  { packId: 'royal', displayName: 'Royal', tokens: 10000, price: 537.49 },
];

export default function WalletPage() {
  // State for discount offer
  const [activeDiscount, setActiveDiscount] = useState<DiscountOffer | null>(null);
  const [showPromoModal, setShowPromoModal] = useState(false);

  // In a real implementation, this would come from user context/Firestore
  // For now, we'll detect based on browser locale as fallback
  const isPL = typeof window !== 'undefined' &&
    (navigator.language === 'pl' || navigator.language.startsWith('pl-'));

  // Phase 31C: Check for active discounts
  useEffect(() => {
    const discount = retrieveActiveDiscount();
    if (discount) {
      setActiveDiscount(discount);
      setShowPromoModal(true);
    }
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            💰 Wallet
          </h1>
          <p className="text-lg text-gray-600">
            Manage your tokens and purchases
          </p>
        </div>

        {/* Promo Modal */}
        {showPromoModal && activeDiscount && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="max-w-md w-full">
              <PromoCard
                offer={activeDiscount}
                onActivate={() => {
                  setShowPromoModal(false);
                  // Scroll to token packs
                  document.getElementById('token-packs')?.scrollIntoView({ behavior: 'smooth' });
                }}
                onDismiss={() => setShowPromoModal(false)}
                locale={isPL ? 'pl' : 'en'}
              />
            </div>
          </div>
        )}

        {/* Active Discount Banner */}
        {activeDiscount && !showPromoModal && (
          <button
            onClick={() => setShowPromoModal(true)}
            className="w-full max-w-4xl mx-auto mb-8 bg-gradient-to-r from-gray-900 to-black border-2 border-gold rounded-xl p-6 flex items-center gap-4 hover:scale-105 transition-transform duration-200 shadow-lg hover:shadow-gold/50"
          >
            <span className="text-4xl">🎉</span>
            <div className="flex-1 text-left">
              <p className="text-white font-bold text-lg">
                {activeDiscount.discountPercent}% OFF - Limited Time!
              </p>
              <p className="text-gold font-semibold">
                Tap to view offer
              </p>
            </div>
            <span className="text-gold font-black text-2xl">→</span>
          </button>
        )}

        {/* Token Info Cards */}
        <div id="token-packs" className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Purchase Tokens Card */}
          <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">💳</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Purchase Tokens
              </h2>
              <p className="text-gray-600">
                Buy token packs to use across the platform
              </p>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {TOKEN_PACKS.map((pack) => {
                const plnPrice = isPL ? PLN_PRICING_TABLE[pack.packId] : undefined;
                const displayPrice = plnPrice
                  ? `${plnPrice.toFixed(2)} PLN`
                  : `$${pack.price.toFixed(2)}`;
                
                return (
                  <div
                    key={pack.packId}
                    className={`bg-gray-50 rounded-lg p-4 ${pack.popular ? 'border-2 border-pink-500' : ''}`}
                  >
                    {pack.popular && (
                      <div className="text-xs font-bold text-pink-600 mb-1">⭐ POPULAR</div>
                    )}
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-gray-900">{pack.displayName}</span>
                        <p className="text-sm text-gray-500 mt-1">{pack.tokens.toLocaleString()} tokens</p>
                      </div>
                      <TokenPrice
                        baseUsdPrice={pack.price}
                        plnPrice={plnPrice}
                        showApproximate={false}
                        className="text-pink-600 font-bold"
                        discount={activeDiscount}
                        showDiscountBadge={true}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {isPL && (
              <p className="text-xs text-gray-500 italic text-center mt-4 px-2">
                💡 Globalne rozliczenie odbywa się w USD — bez dopłat i przewalutowań
              </p>
            )}
            <button
              className="w-full mt-6 bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200"
              disabled
            >
              Purchase (Mobile Only)
            </button>
          </div>

          {/* Earn Tokens Card - Phase 17 */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-lg p-8 border-2 border-green-200">
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">📺</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Earn Free Tokens
              </h2>
              <p className="text-gray-700 font-medium">
                Watch ads in the mobile app!
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4 text-center">
                How It Works
              </h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <span className="text-green-600 font-bold mr-2">✓</span>
                  <span className="text-sm text-gray-700">
                    Earn <strong>10 tokens</strong> per ad watched
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-600 font-bold mr-2">✓</span>
                  <span className="text-sm text-gray-700">
                    Get <strong>+10 bonus</strong> tokens every 10 ads
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-600 font-bold mr-2">✓</span>
                  <span className="text-sm text-gray-700">
                    Up to <strong>20 ads per day</strong> (220 tokens max)
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-600 font-bold mr-2">✓</span>
                  <span className="text-sm text-gray-700">
                    Use earned tokens everywhere on Avalo
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-900 text-center">
                <strong>💡 Download our mobile app</strong> to start earning tokens by watching ads!
              </p>
            </div>

            <div className="flex gap-3">
              <a
                href="#"
                className="flex-1 bg-black hover:bg-gray-800 text-white text-center font-semibold py-2 px-4 rounded-lg transition duration-200 text-sm"
              >
                🍎 App Store
              </a>
              <a
                href="#"
                className="flex-1 bg-black hover:bg-gray-800 text-white text-center font-semibold py-2 px-4 rounded-lg transition duration-200 text-sm"
              >
                🤖 Play Store
              </a>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <div className="flex items-start gap-4">
            <div className="text-4xl">ℹ️</div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 mb-2">
                Token Purchase & Earning
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-3">
                Tokens are the currency of Avalo. Use them to unlock premium features, send gifts, 
                boost your profile, and more. While token purchases are available through our mobile app, 
                you can also <strong>earn free tokens daily by watching rewarded ads</strong> in the mobile app.
              </p>
              <p className="text-gray-500 text-xs">
                Web-based token purchases and ad rewards will be available in a future update. 
                For now, please use our mobile app for the full token economy experience.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">
            Ready to earn free tokens?
          </p>
          <a
            href="/"
            className="inline-block bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white font-semibold py-3 px-8 rounded-lg transition duration-200 shadow-lg"
          >
            Download Avalo Mobile App
          </a>
        </div>
      </div>
    </main>
  );
}