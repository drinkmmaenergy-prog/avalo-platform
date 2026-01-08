/**
 * PACK 327 — Promo Bundles Store (Web)
 * Subscriptions + Boosts + Tokens in One Purchase
 *
 * NOTE: This is a reference implementation
 * Adjust imports based on your web app structure
 */

import React, { useState, useEffect } from 'react';
import { httpsCallable, getFunctions } from 'firebase/functions';
// import { functions } from '../../lib/firebase'; // Adjust based on your setup
// import { useAuth } from '../../hooks/useAuth'; // Adjust based on your setup
// import { useRouter } from 'next/router'; // Or react-router-dom

// Temporary placeholders - replace with actual hooks
const useAuth = () => ({ user: { uid: 'demo-user' } });
const useRouter = () => ({ push: (path: string) => console.log('Navigate to:', path) });
const functions = getFunctions();

interface PromoBundle {
  id: string;
  title: string;
  description: string;
  includes: {
    subscriptionType?: 'VIP' | 'ROYAL';
    subscriptionDays?: number;
    boostDays?: number;
    boostMultiplier?: number;
    bonusTokens?: number;
  };
  pricePLN: number;
  priceTokensEquivalent: number;
  available: boolean;
  createdAt: string;
}

interface PurchaseBundleResponse {
  success: boolean;
  purchaseId: string;
  bundle: PromoBundle;
  applied: {
    subscription?: {
      type: string;
      expiresAt: string;
    };
    boost?: {
      expiresAt: string;
      multiplier: number;
    };
    tokens?: {
      amount: number;
      newBalance: number;
    };
  };
  error?: string;
}

export default function PromoBundlesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [bundles, setBundles] = useState<PromoBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState<PurchaseBundleResponse | null>(null);

  useEffect(() => {
    loadBundles();
  }, []);

  const loadBundles = async () => {
    try {
      setLoading(true);
      const getBundles = httpsCallable(functions, 'promoBundles_getBundles');
      const result = await getBundles();
      const data = result.data as any;
      
      if (data.success) {
        setBundles(data.bundles);
      }
    } catch (error) {
      console.error('Error loading bundles:', error);
      alert('Failed to load promo bundles');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (bundle: PromoBundle) => {
    if (!user) {
      router.push('/login');
      return;
    }

    try {
      setPurchasing(bundle.id);

      // TODO: Implement Stripe Checkout flow
      // For now, simulate purchase
      const purchaseBundle = httpsCallable(functions, 'promoBundles_purchase');
      const result = await purchaseBundle({
        bundleId: bundle.id,
        platform: 'WEB',
      });

      const data = result.data as PurchaseBundleResponse;

      if (data.success) {
        setShowSuccess(data);
      } else {
        alert(data.error || 'Purchase failed');
      }
    } catch (error: any) {
      console.error('Purchase error:', error);
      alert(error.message || 'Failed to complete purchase');
    } finally {
      setPurchasing(null);
    }
  };

  const getBundleBadge = (bundle: PromoBundle): string | null => {
    if (bundle.title.includes('VIP')) return '⭐ POPULAR';
    if (bundle.title.includes('Royal')) return '👑 BEST VALUE';
    if (bundle.title.includes('Starter')) return '🚀 STARTER';
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading bundles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Special Offers</h1>
          <p className="text-xl text-gray-600">
            Unlock VIP perks, boost your visibility, and get bonus tokens
          </p>
        </div>

        {/* Bundles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {bundles.map((bundle) => (
            <div
              key={bundle.id}
              className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow relative"
            >
              {/* Badge */}
              {getBundleBadge(bundle) && (
                <div className="absolute top-4 right-4 bg-indigo-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                  {getBundleBadge(bundle)}
                </div>
              )}

              <div className="p-8">
                {/* Title & Price */}
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{bundle.title}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-indigo-600">{bundle.pricePLN}</span>
                    <span className="text-lg text-gray-600">PLN</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    ~{bundle.priceTokensEquivalent} tokens value
                  </p>
                </div>

                {/* Description */}
                <p className="text-gray-600 mb-6">{bundle.description}</p>

                {/* Includes */}
                <div className="space-y-3 mb-8">
                  {bundle.includes.subscriptionType && bundle.includes.subscriptionDays && (
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-gray-700">
                        {bundle.includes.subscriptionDays} days {bundle.includes.subscriptionType} membership
                      </span>
                    </div>
                  )}

                  {bundle.includes.boostDays && bundle.includes.boostMultiplier && (
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-gray-700">
                        {bundle.includes.boostDays} days {bundle.includes.boostMultiplier}x profile boost
                      </span>
                    </div>
                  )}

                  {bundle.includes.bonusTokens && (
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-gray-700">
                        {bundle.includes.bonusTokens} bonus tokens
                      </span>
                    </div>
                  )}
                </div>

                {/* Purchase Button */}
                <button
                  onClick={() => handlePurchase(bundle)}
                  disabled={purchasing === bundle.id}
                  className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition-colors ${
                    purchasing === bundle.id
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {purchasing === bundle.id ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Processing...
                    </span>
                  ) : (
                    'Purchase Now'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {bundles.length === 0 && (
          <div className="text-center py-16">
            <svg className="w-16 h-16 mx-auto text-gray-300" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
            </svg>
            <p className="mt-4 text-gray-600">No bundles available</p>
          </div>
        )}

        {/* Footer Info */}
        <div className="text-center mt-12">
          <p className="text-indigo-600 font-semibold mb-2">
            💡 Save up to 40% compared to buying separately
          </p>
          <p className="text-sm text-gray-500">
            All benefits activate immediately. No refunds except billing errors.
          </p>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Purchase Successful! 🎉</h2>
              <p className="text-gray-600">{showSuccess.bundle.title} activated!</p>
            </div>

            <div className="space-y-3 mb-6">
              {showSuccess.applied.subscription && (
                <div className="flex items-start gap-3 p-3 bg-indigo-50 rounded-lg">
                  <svg className="w-5 h-5 text-indigo-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {showSuccess.applied.subscription.type} Membership
                    </p>
                    <p className="text-sm text-gray-600">
                      Active until {new Date(showSuccess.applied.subscription.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {showSuccess.applied.boost && (
                <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                  <svg className="w-5 h-5 text-purple-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {showSuccess.applied.boost.multiplier}x Profile Boost
                    </p>
                    <p className="text-sm text-gray-600">
                      Active until {new Date(showSuccess.applied.boost.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {showSuccess.applied.tokens && (
                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                  <svg className="w-5 h-5 text-green-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {showSuccess.applied.tokens.amount} Tokens Credited
                    </p>
                    <p className="text-sm text-gray-600">
                      New balance: {showSuccess.applied.tokens.newBalance} tokens
                    </p>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setShowSuccess(null);
                router.push('/profile');
              }}
              className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
            >
              Go to Profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}