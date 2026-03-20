'use client';

/**
 * Tokens Client Component
 *
 * Displays:
 * - Current token balance (via getWalletBalance callable)
 * - "Buy More Tokens" link → /wallet/buy
 * - Last 5 token transactions from Firestore transactions collection
 * - "View Full History" link → /wallet/transactions (mapped to /wallet/history)
 */

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';
import { getTokenBalance } from '@/lib/services/tokenService';
import { doc, onSnapshot, collection, query, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenTransaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TokensClient() {
  const searchParams = useSearchParams();
  const { firebaseUser, user } = useAuth();
  const [showSuccess, setShowSuccess] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);

  // ── Success banner from checkout redirect ───────────────────────────
  useEffect(() => {
    const status = searchParams?.get('status');
    if (status === 'success') {
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  // ── Fetch token balance ─────────────────────────────────────────────
  useEffect(() => {
    const resolvedUid = firebaseUser?.uid ?? user?.uid;
    if (!resolvedUid) return;
    let active = true;

    const fetchBalance = async () => {
      try {
        const bal = await getTokenBalance(resolvedUid);
        if (active) setBalance(bal);
      } catch (err) {
        console.error('[TokensClient] Failed to fetch balance:', err);
      } finally {
        if (active) setBalanceLoading(false);
      }
    };

    void fetchBalance();

    // Real-time listener on wallet doc
    const unsub = onSnapshot(
      doc(requireDb(), 'wallets', resolvedUid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setBalance(data.tokensBalance ?? data.tokenBalance ?? 0);
          setBalanceLoading(false);
        }
      },
      (error) => {
        if (error?.code !== 'permission-denied') {
          console.error('[TokensClient] Wallet listener error:', error);
        }
      },
    );

    return () => {
      active = false;
      unsub();
    };
  }, [firebaseUser?.uid, user?.uid]);

  // ── Fetch last 5 transactions ───────────────────────────────────────
  useEffect(() => {
    const resolvedUid = firebaseUser?.uid ?? user?.uid;
    if (!resolvedUid) return;
    let active = true;

    async function loadTransactions() {
      try {
        const db = requireDb();
        const txRef = collection(db, 'users', resolvedUid!, 'transactions');
        const q = query(txRef, orderBy('createdAt', 'desc'), limit(5));
        const snap = await getDocs(q);

        const txs: TokenTransaction[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: data.type ?? 'unknown',
            amount: data.amount ?? 0,
            description: data.description ?? data.type ?? 'Transaction',
            createdAt:
              data.createdAt instanceof Timestamp
                ? data.createdAt.toDate()
                : new Date(data.createdAt ?? Date.now()),
          };
        });

        if (active) setTransactions(txs);
      } catch (err) {
        console.error('[TokensClient] Failed to load transactions:', err);
      } finally {
        if (active) setTxLoading(false);
      }
    }

    void loadTransactions();
    return () => { active = false; };
  }, [firebaseUser?.uid, user?.uid]);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Tokens</h1>

      {/* Success banner */}
      {showSuccess && (
        <div className="rounded bg-green-100 p-3 text-green-800">
          Payment successful
        </div>
      )}

      {/* Token Balance Card */}
      <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-6 text-white">
        <p className="text-purple-200 text-sm mb-1">Current Balance</p>
        {balanceLoading ? (
          <div className="h-10 w-32 bg-purple-500/50 animate-pulse rounded" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">{balance.toLocaleString()}</span>
            <span className="text-lg text-purple-200">tokens</span>
          </div>
        )}
      </div>

      {/* Buy More Tokens */}
      <Link
        href="/wallet/buy"
        className="block w-full text-center bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition"
      >
        Buy More Tokens
      </Link>

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
        </div>

        {txLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-6 text-center">
            <p className="text-gray-500 text-sm">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between bg-gray-50 rounded-lg p-4"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                  <p className="text-xs text-gray-500">
                    {tx.createdAt.toLocaleDateString()} &middot; {tx.createdAt.toLocaleTimeString()}
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    tx.amount >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {tx.amount >= 0 ? '+' : ''}
                  {tx.amount.toLocaleString()} tokens
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* View Full History Link */}
      <Link
        href="/wallet/history"
        className="block text-center text-purple-600 hover:text-purple-700 font-medium text-sm py-2"
      >
        View Full History →
      </Link>
    </div>
  );
}
