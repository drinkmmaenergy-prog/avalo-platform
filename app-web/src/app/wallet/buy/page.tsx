'use client';

/**
 * PHASE 5.1 — Web Token Purchase Page
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
 * 
 * SUPPORTED FLOWS:
 * 1. Direct web access: /wallet/buy
 * 2. App→Web redirect: /wallet/buy?source=app&userId=UID
 *    - userId is NOT trusted by web
 *    - backend re-verifies auth
 *    - web just passes it through
 * 
 * @version v2.1 (PHASE 5.1 — removed redundant Header/Footer since AppShell provides navigation)
 */
import React, { Suspense, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRoleGate } from '@/hooks/useRoleGate';
import TokenPackCard from '@/components/TokenPackCard';
import { getAvailableTokenPacks, formatPackPrice } from '@/lib/services/phase33';
import { createCheckoutSession, redirectToCheckout } from '@/lib/api/tokens';
import type { CanonicalTokenPack } from '@/types/phase33.types';
import { useFirstPurchaseStatus } from '@/components/wallet/FirstPurchaseIncentive';

type Currency = 'USD' | 'EUR' | 'PLN' | 'GBP';

function WalletBuyContent() {
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  
  // Extract app→web redirect params (NOT trusted, passes through to backend)
  const sourceApp = searchParams?.get('source') === 'app';
  const passedUserId = searchParams?.get('userId');
  // 2.7: AI chat return context — when user navigates from AI chat
  const fromChat = searchParams?.get('from_chat') ?? null;
  
  // Auth is relaxed for app→web flow (backend handles verification)
  const { isAuthorized, isLoading: roleLoading } = useRoleGate({
    requiredRole: 'user',
    // Don't redirect if coming from app — let them browse, backend will verify on purchase
    redirectTo: sourceApp ? undefined : '/auth/login?redirect=/wallet/buy',
  });
  
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FIX 112: Check if this is the user's first purchase
  const hasPurchased = useFirstPurchaseStatus();
  const showFirstPurchaseBonus = hasPurchased === false;
  
  const tokenPacks = useMemo(() => getAvailableTokenPacks(), []);
  
  const handlePurchase = async (pack: CanonicalTokenPack) => {
    // For direct web access, require auth
    if (!sourceApp && !user) {
      setError('Please sign in to purchase tokens');
      return;
    }
    
    setPurchasing(true);
    setError(null);
    setSelectedPack(pack.packId);
    
    try {
      const result = await createCheckoutSession({
        packageId: pack.packId,
        // Pass through app userId (backend re-verifies, we don't trust it)
        userId: sourceApp ? (passedUserId || undefined) : undefined,
        source: sourceApp ? 'app' : 'web',
        successUrl: `${window.location.origin}/wallet/success?session_id={CHECKOUT_SESSION_ID}&source=${sourceApp ? 'app' : 'web'}${fromChat ? `&from_chat=${encodeURIComponent(fromChat)}` : ''}`,
        cancelUrl: fromChat ? `${window.location.origin}/ai/chat/${encodeURIComponent(fromChat)}` : `${window.location.origin}/wallet/buy${sourceApp ? '?source=app' : ''}`,
      });
      
      if (!result.success) {
        setError(result.error || 'Failed to create checkout session');
        setPurchasing(false);
        setSelectedPack(null);
        return;
      }
      
      if (result.checkoutUrl) {
        // Redirect to Stripe Checkout
        redirectToCheckout(result.checkoutUrl);
        // Don't reset state — we're leaving the page
      } else {
        setError('No checkout URL received');
        setPurchasing(false);
        setSelectedPack(null);
      }
    } catch (err) {
      console.error('[WalletBuy] Purchase error:', err);
      setError('An unexpected error occurred. Please try again.');
      setPurchasing(false);
      setSelectedPack(null);
    }
  };
  
  // Loading state
  if (authLoading || roleLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600" />
      </div>
    );
  }
  
  // For direct web access (not from app), enforce auth
  if (!sourceApp && !isAuthorized) {
    return null; // Redirect happens in hook
  }
  
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Back button */}
        <Link
          href="/wallet"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
        >
          ← Back
        </Link>

        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">💎 Buy Tokens</h1>
          <p className="text-gray-600">
            Purchase tokens to unlock premium features and support creators
          </p>
          {sourceApp && (
            <p className="mt-2 text-sm text-pink-600">
              Redirected from Avalo App
            </p>
          )}
        </div>
        
        {/* Error Message */}
        {error && (
          <div className="mb-8 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-red-700">{error}</p>
          </div>
        )}
        
        {/* Currency Selector */}
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
          
          {/* Token Pack Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tokenPacks.map((pack) => (
              <TokenPackCard
                key={pack.packId}
                pack={pack}
                currency={currency}
                isSelected={selectedPack === pack.packId}
                isPopular={pack.packId === 'STANDARD'}
                isLoading={purchasing && selectedPack === pack.packId}
                onSelect={handlePurchase}
                disabled={purchasing}
                showFirstPurchaseBonus={showFirstPurchaseBonus}
              />
            ))}
          </div>
        </div>
        
        {/* Information Cards */}
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl" aria-hidden="true">🔒</span>
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
              <span className="text-xl" aria-hidden="true">⚠️</span>
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
              <span className="text-xl" aria-hidden="true">ℹ️</span>
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
        
        {/* Legal Links */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            By purchasing tokens, you agree to our{' '}
            <a href="/legal/terms" className="text-pink-600 hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/legal/privacy" className="text-pink-600 hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function WalletBuyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600" />
        </div>
      }
    >
      <WalletBuyContent />
    </Suspense>
  );
}


