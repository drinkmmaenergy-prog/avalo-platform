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
import EmptyState from '@/components/ui/EmptyState';
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
  | 'chat_charge'
  | 'chat_earning'
  | 'chat_earned'
  | 'call_charge'
  | 'call_earned'
  | 'unlock'
  | 'content_unlock'
  | 'media_unlock'
  | 'media_earned'
  | 'subscription'
  | 'event_ticket'
  | 'event_earning'
  | 'payout'
  | 'boost'
  | 'superlike'
  | 'icebreaker'
  | 'welcome_bonus'
  | 'referral_bonus'
  | 'refund'
  | string;

/** FIX 129: Filter categories for transaction history */
type TransactionFilter = 'all' | 'purchases' | 'earnings' | 'tips' | 'calls' | 'events';

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

/** FIX 129: Emoji icons for each transaction type */
function getTypeIcon(type: TransactionType): string {
  const icons: Record<string, string> = {
    purchase: '💳',
    tip_sent: '🎁',
    tip_received: '💰',
    chat_charge: '💬',
    chat_earned: '📨',
    chat: '💬',
    chat_earning: '📨',
    call_charge: '📞',
    call_earned: '📞',
    call_earning: '📞',
    media_unlock: '🔓',
    media_earned: '📸',
    unlock: '🔓',
    content_unlock: '📸',
    subscription: '⭐',
    event_ticket: '🎫',
    event_earning: '🎫',
    payout: '🏦',
    boost: '🚀',
    superlike: '⭐',
    icebreaker: '💡',
    welcome_bonus: '🎉',
    referral_bonus: '🎁',
    refund: '↩️',
  };
  return icons[type] || '🔄';
}

/** Map raw Firestore type to a human-readable label. */
function getTypeLabel(type: TransactionType): string {
  const map: Record<string, string> = {
    purchase: 'Purchase',
    tip_sent: 'Tip Sent',
    tip_received: 'Tip Received',
    chat: 'Chat Message',
    chat_charge: 'Chat Charge',
    chat_earning: 'Chat Earning',
    chat_earned: 'Chat Earned',
    call_charge: 'Call Charge',
    call_earned: 'Call Earned',
    call_earning: 'Call Earning',
    unlock: 'Media Unlock',
    content_unlock: 'Content Unlock',
    media_unlock: 'Media Unlock',
    media_earned: 'Media Earned',
    subscription: 'Subscription',
    event_ticket: 'Event Ticket',
    event_earning: 'Event Earning',
    payout: 'Payout',
    boost: 'Profile Boost',
    superlike: 'SuperLike',
    icebreaker: 'Icebreaker',
    welcome_bonus: 'Welcome Bonus',
    referral_bonus: 'Referral Bonus',
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
    'chat_earned',
    'call_earned',
    'call_earning',
    'content_unlock',
    'media_earned',
    'event_earning',
    'welcome_bonus',
    'referral_bonus',
    'refund',
  ]);
  if (incomingTypes.has(type)) return true;
  // Fallback: positive amounts are incoming
  return amount > 0;
}

/** FIX 129: Filter type categories */
const FILTER_TYPES: Record<TransactionFilter, Set<string> | null> = {
  all: null,
  purchases: new Set(['purchase', 'media_unlock', 'unlock', 'content_unlock', 'subscription', 'boost', 'superlike', 'icebreaker']),
  earnings: new Set(['tip_received', 'chat_earning', 'chat_earned', 'call_earning', 'call_earned', 'media_earned', 'event_earning', 'welcome_bonus', 'referral_bonus']),
  tips: new Set(['tip_sent', 'tip_received']),
  calls: new Set(['call_charge', 'call_earned', 'call_earning']),
  events: new Set(['event_ticket', 'event_earning']),
};

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

  // FIX 129: Filter state
  const [filter, setFilter] = useState<TransactionFilter>('all');

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

        // FIX 129: Try both 'transactions' and 'walletTransactions' collections
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

        let snapshot = await getDocs(q);

        // Fallback: if no results from 'transactions', try 'walletTransactions'
        if (snapshot.empty && !afterDoc) {
          const walletQ = query(
            collection(requireDb(), 'walletTransactions'),
            ...baseConstraints,
          );
          snapshot = await getDocs(walletQ);
        }

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

  // FIX 129: Apply client-side filter
  const filterSet = FILTER_TYPES[filter];
  const filteredTransactions = filterSet
    ? transactions.filter((tx) => filterSet.has(tx.type))
    : transactions;

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

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Transaction History
        </h1>

        {/* FIX 129: Filter tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {(['all', 'purchases', 'earnings', 'tips', 'calls', 'events'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f
                  ? 'bg-pink-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

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
          /* Empty state — FIX 130 */
          <EmptyState
            icon="💰"
            title="No transactions yet"
            description="Buy tokens to send messages, unlock content, and boost your profile."
            actionLabel="Buy Tokens"
            actionHref="/wallet/buy"
          />
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
                    {filteredTransactions.map((tx) => {
                      const incoming = isIncoming(tx.type, tx.amount);
                      return (
                        <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                          <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {formatDate(tx.createdAt)}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                            <span className="mr-2">{getTypeIcon(tx.type)}</span>
                            {tx.description || getTypeLabel(tx.type)}
                          </td>
                          <td
                            className={`px-6 py-4 text-sm text-right font-semibold ${
                              incoming
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {incoming ? '+' : '-'}
                            {Math.abs(tx.amount).toLocaleString()} 🪙
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

              {/* Mobile Card View — FIX 129: Enhanced with icons and filtering */}
              <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
                {filteredTransactions.map((tx) => {
                  const incoming = isIncoming(tx.type, tx.amount);
                  return (
                    <div key={tx.id} className="flex items-center gap-3 p-4">
                      <span className="text-xl flex-shrink-0">{getTypeIcon(tx.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {tx.description || getTypeLabel(tx.type)}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatDate(tx.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`font-bold text-sm flex-shrink-0 ${
                          incoming
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-500 dark:text-red-400'
                        }`}
                      >
                        {incoming ? '+' : ''}{tx.amount} 🪙
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* FIX 129: Empty filter state */}
              {filteredTransactions.length === 0 && transactions.length > 0 && (
                <div className="text-center py-8 text-gray-400">
                  <p>No {filter} transactions found</p>
                </div>
              )}
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
