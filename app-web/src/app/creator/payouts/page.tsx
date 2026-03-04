/**
 * PHASE 3.3 — Creator Payouts Page (READ-ONLY history + payout request)
 * 
 * Displays payout history and allows payout requests.
 * All data fetched from backend — NO local calculations.
 * 
 * Backend functions consumed:
 * - getPayoutRequests (read history)
 * - requestPayout (submit payout request)
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  getCreatorEarningsSummary,
  getPayoutHistory,
  requestCreatorPayout,
} from '@/lib/services/phase33';
import type { CreatorEarningsSummary, PayoutHistoryEntry, PayoutStatus } from '@/types/phase33.types';
import { TOKEN_PAYOUT_USD } from '@/lib/economyConfig';

const MIN_PAYOUT_TOKENS = 1000; // Minimum for payout request

function StatusBadge({ status }: { status: PayoutStatus }) {
  const styles: Record<PayoutStatus, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    PROCESSING: 'bg-blue-100 text-blue-800',
    PAID: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    REJECTED: 'bg-red-100 text-red-800',
  };
  
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function CreatorPayoutsPage() {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<CreatorEarningsSummary | null>(null);
  const [history, setHistory] = useState<PayoutHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Request form state
  const [requestAmount, setRequestAmount] = useState<number>(0);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  
  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      
      try {
        setLoading(true);
        const [earningsData, historyData] = await Promise.all([
          getCreatorEarningsSummary(user.uid),
          getPayoutHistory(user.uid),
        ]);
        setEarnings(earningsData);
        setHistory(historyData);
        
        // Pre-fill request amount with available balance
        if (earningsData) {
          setRequestAmount(Math.max(earningsData.availableForPayout, MIN_PAYOUT_TOKENS));
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load payout data');
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [user]);
  
  const handlePayoutRequest = async () => {
    if (!user || !earnings) return;
    
    // Validation
    if (requestAmount < MIN_PAYOUT_TOKENS) {
      setRequestError(`Minimum payout is ${MIN_PAYOUT_TOKENS} tokens`);
      return;
    }
    if (requestAmount > earnings.availableForPayout) {
      setRequestError('Amount exceeds available balance');
      return;
    }
    
    setRequesting(true);
    setRequestError(null);
    setRequestSuccess(null);
    
    try {
      const result = await requestCreatorPayout(user.uid, requestAmount);
      
      if (result.success) {
        setRequestSuccess(`Payout request submitted! ID: ${(result as { payoutRequestId?: string }).payoutRequestId ?? 'pending'}`);
        
        // Refresh data
        const [earningsData, historyData] = await Promise.all([
          getCreatorEarningsSummary(user.uid),
          getPayoutHistory(user.uid),
        ]);
        setEarnings(earningsData);
        setHistory(historyData);
      } else {
        setRequestError(result.error || 'Failed to submit payout request');
      }
    } catch (err: any) {
      setRequestError(err.message || 'Failed to submit payout request');
    } finally {
      setRequesting(false);
    }
  };
  
  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-48 bg-gray-200 rounded-xl" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-red-800 mb-2">Error Loading Payouts</h2>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }
  
  const PAYOUT_RATE_PLN = TOKEN_PAYOUT_USD; // derived from TOKEN_PAYOUT_USD (0.03 USD)
  
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
        <p className="text-gray-600 mt-1">Request payouts and view history</p>
      </div>
      
      {/* Request Payout Card */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Payout</h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Available Balance */}
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-sm text-green-700 mb-1">Available for Payout</div>
            <div className="text-2xl font-bold text-green-800">
              {(earnings?.availableForPayout || 0).toLocaleString()} tokens
            </div>
            <div className="text-sm text-green-600 mt-1">
              ≈ {((earnings?.availableForPayout || 0) * PAYOUT_RATE_PLN).toFixed(2)} PLN
            </div>
          </div>
          
          {/* Request Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (tokens)
              </label>
              <input
                type="number"
                min={MIN_PAYOUT_TOKENS}
                max={earnings?.availableForPayout || 0}
                value={requestAmount}
                onChange={(e) => setRequestAmount(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Minimum: {MIN_PAYOUT_TOKENS} tokens ({MIN_PAYOUT_TOKENS * PAYOUT_RATE_PLN} PLN)
              </p>
            </div>
            
            <div className="bg-gray-50 p-3 rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Payout amount:</span>
                <span className="font-medium">{(requestAmount * PAYOUT_RATE_PLN).toFixed(2)} PLN</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-600">Platform fee (2%):</span>
                <span className="font-medium">-{(requestAmount * PAYOUT_RATE_PLN * 0.02).toFixed(2)} PLN</span>
              </div>
              <div className="flex justify-between mt-2 pt-2 border-t border-gray-200">
                <span className="font-medium text-gray-800">You receive:</span>
                <span className="font-bold text-green-600">
                  {(requestAmount * PAYOUT_RATE_PLN * 0.98).toFixed(2)} PLN
                </span>
              </div>
            </div>
            
            {requestError && (
              <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
                {requestError}
              </div>
            )}
            {requestSuccess && (
              <div className="bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm">
                {requestSuccess}
              </div>
            )}
            
            <button
              onClick={handlePayoutRequest}
              disabled={requesting || requestAmount < MIN_PAYOUT_TOKENS || requestAmount > (earnings?.availableForPayout || 0)}
              className="w-full bg-pink-600 hover:bg-pink-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition"
            >
              {requesting ? 'Submitting...' : 'Request Payout'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Payout History */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payout History</h2>
        
        {history.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">📭</div>
            <p>No payout requests yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Tokens</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Method</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((entry) => (
                  <tr key={entry.payoutId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      {entry.createdAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {entry.requestedTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {entry.amountFiatNetToUser.toFixed(2)} {entry.currency}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{entry.rail}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={entry.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Info Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <h3 className="font-medium text-blue-900">Payout Processing</h3>
            <p className="text-sm text-blue-700 mt-1">
              Payouts are typically processed within 1-3 business days. Large payouts may require 
              additional verification. Make sure your Stripe Connect account is set up and verified.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

