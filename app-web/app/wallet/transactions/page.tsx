/**
 * PACK 321B — Web Wallet Transaction History
 * View wallet transactions with filters
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface WalletTransaction {
  txId: string;
  userId: string;
  type: 'PURCHASE' | 'SPEND' | 'EARN' | 'REFUND' | 'PAYOUT';
  source: string;
  amountTokens: number;
  beforeBalance: number;
  afterBalance: number;
  metadata: any;
  timestamp: any;
}

type FilterType = 'ALL' | 'PURCHASE' | 'SPEND' | 'EARN' | 'REFUND' | 'PAYOUT';

export default function TransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('ALL');

  useEffect(() => {
    loadTransactions();
  }, [filter]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      
      // TODO: Replace with actual Firebase callable function
      // Example: const result = await yourFirebaseCall('pack277_getTransactionHistory', { limit: 50, type: filter === 'ALL' ? undefined : filter });
      
      // Simulated API call - REPLACE WITH ACTUAL IMPLEMENTATION
      await new Promise(resolve => setTimeout(resolve, 1000));
      setTransactions([]);
    } catch (err) {
      console.error('Load transactions error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'PURCHASE': return '💳';
      case 'SPEND': return '💸';
      case 'EARN': return '💰';
      case 'REFUND': return '↩️';
      case 'PAYOUT': return '🏦';
      default: return '📝';
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'PURCHASE': return 'text-purple-600';
      case 'SPEND': return 'text-red-600';
      case 'EARN': return 'text-green-600';
      case 'REFUND': return 'text-amber-600';
      case 'PAYOUT': return 'text-indigo-600';
      default: return 'text-gray-600';
    }
  };

  const getTransactionTitle = (tx: WalletTransaction) => {
    switch (tx.type) {
      case 'PURCHASE': return 'Token Purchase';
      case 'SPEND': return `${tx.source} Payment`;
      case 'EARN': return `${tx.source} Earnings`;
      case 'REFUND': return `${tx.source} Refund`;
      case 'PAYOUT': return 'Payout Request';
      default: return 'Transaction';
    }
  };

  const filters: { type: FilterType; label: string }[] = [
    { type: 'ALL', label: 'All' },
    { type: 'PURCHASE', label: 'Purchases' },
    { type: 'SPEND', label: 'Spent' },
    { type: 'EARN', label: 'Earned' },
    { type: 'REFUND', label: 'Refunds' },
    { type: 'PAYOUT', label: 'Payouts' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">📜 Transaction History</h1>
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
        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.type}
              onClick={() => setFilter(f.type)}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                filter === f.type
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Transactions List */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No transactions found</h3>
            <p className="text-gray-600">
              {filter !== 'ALL'
                ? `You have no ${filter.toLowerCase()} transactions`
                : 'Your transaction history will appear here'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => {
              const isPositive = ['PURCHASE', 'EARN', 'REFUND'].includes(tx.type);
              
              return (
                <div
                  key={tx.txId}
                  className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">
                      {getTransactionIcon(tx.type)}
                    </div>
                    
                    <div className="flex-grow min-w-0">
                      <h4 className="font-semibold text-gray-900 truncate">
                        {getTransactionTitle(tx)}
                      </h4>
                      <p className="text-sm text-gray-500">
                        {formatDate(tx.timestamp)}
                      </p>
                      {tx.metadata?.contextType && (
                        <p className="text-xs text-gray-400 mt-1">
                          Context: {tx.metadata.contextType}
                        </p>
                      )}
                    </div>
                    
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xl font-bold ${getTransactionColor(tx.type)}`}>
                        {isPositive ? '+' : ''}{tx.amountTokens.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">tokens</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}