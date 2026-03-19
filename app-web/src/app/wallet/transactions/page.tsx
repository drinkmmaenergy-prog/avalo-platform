'use client';

/**
 * /wallet/transactions — Transaction History Page
 *
 * Auth-protected (via wallet layout.tsx / AppShell).
 * Lists all transactions for the current user from Firestore `transactions` collection.
 *
 * INVARIANTS:
 * - Data is READ-ONLY from Firestore `transactions` collection.
 * - No balance modification from this page.
 * - Pagination: 20 items per page with "Load more" button.
 * - Color coded: green for incoming (credit), red for outgoing (debit).
 */

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';
import { requireDb } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
  Timestamp,
} from 'firebase/firestore';

// ============================================================================
// TYPES
// ============================================================================

type TransactionType =
  | 'purchase'
  | 'tip_sent'
  | 'tip_received'
  | 'chat'
  | 'chat_earning'
  | 'unlock'
  | 'content_unlock'
  | 'call_earning'
  | 'event_earning'
  | 'payout'
  | 'refund'
  | string;

interface TransactionRecord {
  id: string;
  type: TransactionType;
  amount: number;
  counterpartyName: string | null;
  counterpartyId: string | null;
  createdAt: Date;
  description: string | null;
}

// ============================================================================
// HELPERS
// ============================================================================

const PAGE_SIZE = 20;

/** Map raw Firestore type to a human-readable label. */
function getTypeLabel(type: TransactionType): string {
  const map: Record<string, string> = {
    purchase: 'Purchase',
    tip_sent: 'Tip Sent',
    tip_received: 'Tip Received',
    chat: 'Chat',
    chat_earning: 'Chat Earning',
    unlock: 'Unlock',
    content_unlock: 'Content Unlock',
    call_earning: 'Call Earning',
    event_earning: 'Event Earning',
    payout: 'Payout',
    refund: 'Refund',
  };
  return map[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Determine if a transaction is incoming (credit) or outgoing (debit). */
function isIncoming(type: TransactionType, amount: number): boolean {
  const incomingTypes = new Set([
    'purchase',
    'tip_received',
    'chat_earning',
    'content_unlock',
    'call_earning',
    'event_earning',
    'refund',
  ]);
  if (incomingTypes.has(type)) return true;
  // Fallback: positive amounts are incoming
  return amount > 0;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function WalletTransactionsPage() {
  const { firebaseUser, user } = useAuth();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);

  /** Parse a single Firestore doc into a TransactionRecord. */
  const parseDoc = useCallback((docSnap: QueryDocumentSnapshot<DocumentData>): TransactionRecord => {
    const data = docSnap.data();
    const raw = data.createdAt;
    let createdAt: Date;
    if (raw instanceof Timestamp) {
      createdAt = raw.toDate();
    } else if (raw?.toDate) {
      createdAt = raw.toDate();
    } else if (typeof raw === 'number') {
      createdAt = new Date(raw);
    } else {
      createdAt = new Date(0);
    }

    return {
      id: docSnap.id,
      type: data.type ?? 'unknown',
      amount: data.amount ?? data.tokens ?? 0,
      counterpartyName: data.counterpartyName ?? data.recipientName ?? data.senderName ?? null,
      counterpartyId: data.counterpartyId ?? data.recipientId ?? data.senderId ?? null,
      createdAt,
      description: data.description ?? null,
    };
  }, []);

  /** Load a page of transactions from Firestore. */
  const loadTransactions = useCallback(
    async (afterDoc: QueryDocumentSnapshot<DocumentData> | null) => {
      const resolvedUid = firebaseUser?.uid ?? user?.uid;
      if (!resolvedUid) return;

      try {
        const baseConstraints = [
          where('userId', '==', resolvedUid),
          orderBy('createdAt', 'desc'),
          limit(PAGE_SIZE),
        ];

        const q = afterDoc
          ? query(
              collection(requireDb(), 'transactions'),
              ...baseConstraints,
              startAfter(afterDoc),
            )
          : query(
              collection(requireDb(), 'transactions'),
              ...baseConstraints,
            );

        const snapshot = await getDocs(q);
        const docs = snapshot.docs;
        const records = docs.map(parseDoc);

        if (afterDoc) {
          setTransactions((prev) => [...prev, ...records]);
        } else {
          setTransactions(records);
        }

        setLastDoc(docs.length > 0 ? docs[docs.length - 1] : null);
        setHasMore(docs.length === PAGE_SIZE);
      } catch (err: unknown) {
        console.error('[WalletTransactions] Failed to load transactions:', err);
        const code = (err as { code?: string } | null)?.code;
        if (code === 'permission-denied') {
          setError('You do not have permission to view transactions.');
        } else {
          setError('Failed to load transaction history. Please try again.');
        }
      }
    },
    [firebaseUser?.uid, user?.uid, parseDoc],
  );

  // Initial load
  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadTransactions(null);
      setLoading(false);
    }
    init();
  }, [loadTransactions]);

  // Load more handler
  const handleLoadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await loadTransactions(lastDoc);
    setLoadingMore(false);
  };

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm">
          <Link href="/wallet" className="text-pink-600 hover:text-pink-700">
            Wallet
          </Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-gray-600">Transaction History</span>
        </nav>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          Transaction History
        </h1>

        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-600" />
          </div>
        ) : error ? (
          /* Error state */
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-700">{error}</p>
          </div>
        ) : transactions.length === 0 ? (
          /* Empty state */
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-12 text-center">
            <div className="text-5xl mb-4" aria-hidden="true">📜</div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No transactions yet
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              No transactions yet. Buy tokens to get started.
            </p>
            <Link
              href="/wallet/buy"
              className="inline-block bg-pink-600 hover:bg-pink-700 text-white font-medium py-3 px-8 rounded-lg transition"
            >
              Buy Tokens
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg overflow-hidden">
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Counterparty
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {transactions.map((tx) => {
                      const incoming = isIncoming(tx.type, tx.amount);
                      return (
                        <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                          <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {formatDate(tx.createdAt)}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                            {getTypeLabel(tx.type)}
                          </td>
                          <td
                            className={`px-6 py-4 text-sm text-right font-semibold ${
                              incoming
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {incoming ? '+' : '-'}
                            {Math.abs(tx.amount).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                            {tx.counterpartyName ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
                {transactions.map((tx) => {
                  const incoming = isIncoming(tx.type, tx.amount);
                  return (
                    <div key={tx.id} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {getTypeLabel(tx.type)}
                        </span>
                        <span
                          className={`font-semibold ${
                            incoming
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {incoming ? '+' : '-'}
                          {Math.abs(tx.amount).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">
                          {formatDate(tx.createdAt)}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {tx.counterpartyName ?? '—'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Load More Button */}
            {hasMore && (
              <div className="mt-6 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600" />
                      Loading...
                    </>
                  ) : (
                    'Load more'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
