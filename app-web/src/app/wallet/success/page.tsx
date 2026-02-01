/**
 * PHASE 3.3 — Token Purchase Success Page
 * 
 * Displayed after successful Stripe checkout.
 * NO balance modification — webhook handles token crediting.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function WalletSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Brief delay to let webhook process
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto mb-4" />
          <p className="text-gray-600">Processing your purchase...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="text-6xl mb-6">🎉</div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Purchase Successful!
        </h1>
        
        <p className="text-gray-600 mb-6">
          Your tokens have been added to your wallet. 
          Thank you for your purchase!
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
