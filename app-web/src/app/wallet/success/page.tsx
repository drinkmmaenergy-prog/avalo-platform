'use client';

/**
 * PHASE 3.3 — Token Purchase Success Page
 *
 * Displayed after successful Stripe checkout redirect.
 *
 * ACTIVE FULFILLMENT PATH:
 * 1. Reads session_id from URL search params.
 * 2. Calls tokens_fulfillCheckout (backend callable) which:
 *    - Retrieves the Stripe session server-side
 *    - Runs the idempotent handleCheckoutCompleted from pack288
 *    - Credits tokens to wallets/{uid} if not already processed
 * 3. Displays the confirmed purchase details to the user.
 *
 * This ensures tokens are ALWAYS credited regardless of whether the Stripe
 * webhook was delivered (webhook may not reach localhost, or may be delayed).
 *
 * NO balance modification on the client — backend handles all crediting.
 *
 * BUG 5 (AI Chat): After successful fulfillment, if sessionStorage contains
 * 'ai_chat_return_to', redirects the user back to the AI chat with ?resumed=true.
 */
import React, { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { fulfillCheckout, getPurchaseBySession } from '@/lib/api/tokens';

type FulfillmentState =
  | { status: 'loading' }
  | { status: 'awaiting-auth' }
  | { status: 'fulfilled'; tokens: number; packageId: string }
  | { status: 'error'; message: string };

function WalletSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get('session_id');
  const { firebaseUser, loading: authLoading } = useAuth();
  const [state, setState] = useState<FulfillmentState>({ status: 'loading' });
  /** BUG 5: Tracks whether AI chat redirect has been attempted */
  const aiChatRedirectAttempted = useRef(false);

  /**
   * BUG 5: After successful fulfillment, check if the user came from AI chat.
   * If sessionStorage has 'ai_chat_return_to', redirect there.
   */
  const maybeRedirectToAIChat = useCallback(() => {
    if (aiChatRedirectAttempted.current) return;
    if (typeof window === 'undefined') return;

    const returnTo = sessionStorage.getItem('ai_chat_return_to');
    if (returnTo) {
      aiChatRedirectAttempted.current = true;
      sessionStorage.removeItem('ai_chat_return_to');
      // Short delay to let user see the success state briefly
      setTimeout(() => {
        window.location.href = returnTo;
      }, 1500);
    }
  }, []);

  const runFulfillment = useCallback(async (sid: string) => {
    setState({ status: 'loading' });

    // Step 1: Call the fulfillment callable
    const fulfillResult = await fulfillCheckout(sid);

    if (fulfillResult.success && fulfillResult.purchase) {
      setState({
        status: 'fulfilled',
        tokens: fulfillResult.purchase.tokens,
        packageId: fulfillResult.purchase.packageId,
      });
      // BUG 5: Redirect back to AI chat if applicable
      maybeRedirectToAIChat();
      return;
    }

    // Step 2: If fulfillment returned success but no purchase object,
    // poll getPurchaseBySession as a fallback (webhook may have handled it)
    if (fulfillResult.success && fulfillResult.fulfilled) {
      const purchaseResult = await getPurchaseBySession(sid);
      if (purchaseResult.success && purchaseResult.purchase) {
        setState({
          status: 'fulfilled',
          tokens: purchaseResult.purchase.tokens ?? 0,
          packageId: purchaseResult.purchase.packageId ?? 'unknown',
        });
        // BUG 5: Redirect back to AI chat if applicable
        maybeRedirectToAIChat();
        return;
      }
      // Fulfillment succeeded but purchase record not readable — show error, do NOT fake fulfilled
      setState({
        status: 'error',
        message: 'Purchase confirmation pending. Please check your wallet in a few minutes.',
      });
      return;
    }

    // Step 3: Payment not yet completed or fulfillment failed
    if (fulfillResult.error) {
      setState({ status: 'error', message: fulfillResult.error });
      return;
    }

    setState({ status: 'error', message: 'Unable to confirm your purchase. Please check your wallet.' });
  }, [maybeRedirectToAIChat]);

  useEffect(() => {
    if (!sessionId) {
      setState({ status: 'error', message: 'No session ID found in URL.' });
      return;
    }

    if (authLoading) {
      setState({ status: 'awaiting-auth' });
      return;
    }

    if (!firebaseUser) {
      setState({ status: 'error', message: 'Please sign in to confirm your purchase.' });
      return;
    }

    void runFulfillment(sessionId);
  }, [sessionId, firebaseUser, authLoading, runFulfillment]);

  // Loading / awaiting auth state
  if (state.status === 'loading' || state.status === 'awaiting-auth') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto mb-4" />
          <p className="text-gray-600">
            {state.status === 'awaiting-auth'
              ? 'Waiting for authentication...'
              : 'Confirming your purchase...'}
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="text-6xl mb-6">⚠️</div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Purchase Confirmation Issue
          </h1>

          <p className="text-gray-600 mb-6">
            {state.message}
          </p>

          {sessionId && (
            <div className="bg-gray-50 rounded-lg p-3 mb-6">
              <p className="text-xs text-gray-500 mb-1">Transaction ID</p>
              <p className="text-sm font-mono text-gray-700 break-all">
                {sessionId.substring(0, 30)}...
              </p>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={() => sessionId && runFulfillment(sessionId)}
              className="block w-full bg-pink-600 hover:bg-pink-700 text-white font-medium py-3 px-6 rounded-lg transition"
            >
              Retry Confirmation
            </button>

            <a
              href="/wallet"
              className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-3 px-6 rounded-lg transition"
            >
              Go to Wallet
            </a>
          </div>

          <p className="text-xs text-gray-400 mt-6">
            If your tokens don&apos;t appear within a few minutes,
            please contact support.
          </p>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="text-6xl mb-6">🎉</div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Purchase Successful!
        </h1>

        <p className="text-gray-600 mb-6">
          {state.tokens > 0
            ? `${state.tokens.toLocaleString()} tokens have been added to your wallet.`
            : 'Your tokens have been added to your wallet.'}
          {' '}Thank you for your purchase!
        </p>

        {sessionId && (
          <div className="bg-gray-50 rounded-lg p-3 mb-6">
            <p className="text-xs text-gray-500 mb-1">Transaction ID</p>
            <p className="text-sm font-mono text-gray-700 break-all">
              {sessionId.substring(0, 30)}...
            </p>
          </div>
        )}

        <div className="space-y-3">
          <a
            href="/wallet"
            className="block w-full bg-pink-600 hover:bg-pink-700 text-white font-medium py-3 px-6 rounded-lg transition"
          >
            View My Wallet
          </a>

          <a
            href="/"
            className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-3 px-6 rounded-lg transition"
          >
            Back to Home
          </a>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          If your tokens don&apos;t appear within a few minutes,
          please contact support.
        </p>
      </div>
    </div>
  );
}

export default function WalletSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <WalletSuccessContent />
    </Suspense>
  );
}
