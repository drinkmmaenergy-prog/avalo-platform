'use client';

import { MONETIZATION_SPLITS } from "@constants/monetization";
/**
 * PHASE 3.3 — Creator Earnings Page (READ-ONLY)
 * 
 * Displays creator earnings summary.
 * All data fetched from backend — NO local calculations.
 * 
 * Backend function consumed: getPayoutState
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getCreatorEarningsSummary, getCreatorAnalytics } from '@/lib/services/phase33';
import type { CreatorEarningsSummary, CreatorAnalyticsDashboard } from '@/types/phase33.types';

export default function CreatorEarningsPage() {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<CreatorEarningsSummary | null>(null);
  const [analytics, setAnalytics] = useState<CreatorAnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      
      try {
        setLoading(true);
        const [earningsData, analyticsData] = await Promise.all([
          getCreatorEarningsSummary(user.uid),
          getCreatorAnalytics(user.uid, 'week'),
        ]);
        setEarnings(earningsData);
        setAnalytics(analyticsData);
      } catch (err: any) {
        setError(err.message || 'Failed to load earnings');
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [user]);
  
  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-red-800 mb-2">Error Loading Earnings</h2>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }
  
  const PAYOUT_RATE_PLN = MONETIZATION_SPLITS.EVENT_TICKET.avalo; // 1 token = MONETIZATION_SPLITS.EVENT_TICKET.avalo PLN (display only, backend calculates actual)
  
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Earnings Overview</h1>
        <p className="text-gray-600 mt-1">Your token earnings and payout status</p>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Earned */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <span className="text-3xl">💰</span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">All Time</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {(earnings?.totalTokensEarnedAllTime || 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500 mt-1">Tokens Earned</div>
          <div className="text-xs text-gray-400 mt-2">
            ≈ {((earnings?.totalTokensEarnedAllTime || 0) * PAYOUT_RATE_PLN).toFixed(2)} PLN
          </div>
        </div>
        
        {/* Available for Payout */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-md p-6 border border-green-200">
          <div className="flex items-center justify-between mb-4">
            <span className="text-3xl">✅</span>
            <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">Available</span>
          </div>
          <div className="text-2xl font-bold text-green-800">
            {(earnings?.availableForPayout || 0).toLocaleString()}
          </div>
          <div className="text-sm text-green-700 mt-1">Ready for Payout</div>
          <div className="text-xs text-green-600 mt-2">
            ≈ {((earnings?.availableForPayout || 0) * PAYOUT_RATE_PLN).toFixed(2)} PLN
          </div>
        </div>
        
        {/* Pending */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <span className="text-3xl">⏳</span>
            <span className="text-xs text-yellow-600 bg-yellow-100 px-2 py-1 rounded">Pending</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {(earnings?.pendingTokens || 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500 mt-1">Pending Clearance</div>
          <div className="text-xs text-gray-400 mt-2">7-day hold period</div>
        </div>
      </div>
      
      {/* Actions */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <a
            href="/creator/payouts"
            className="inline-flex items-center px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white font-medium rounded-lg transition"
          >
            💳 Request Payout
          </a>
          <a
            href="/creator/stripe"
            className="inline-flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-lg transition"
          >
            🔗 Stripe Connect
          </a>
          <a
            href="/creator/analytics"
            className="inline-flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-lg transition"
          >
            📊 View Analytics
          </a>
        </div>
      </div>
      
      {/* Earnings Breakdown (if analytics available) */}
      {analytics && (
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Earnings Breakdown (This Week)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.entries(analytics.earningsBySource).map(([source, tokens]) => (
              <div key={source} className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-900">
                  {tokens.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 capitalize mt-1">{source}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Revenue Split Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <h3 className="font-medium text-blue-900">Revenue Split</h3>
            <p className="text-sm text-blue-700 mt-1">
              Avalo operates on a 65/35 revenue split — you keep 65% of all tokens earned.
              Payout rate: 1 token = MONETIZATION_SPLITS.EVENT_TICKET.avalo PLN. Minimum payout: 1,000 tokens (200 PLN).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}




