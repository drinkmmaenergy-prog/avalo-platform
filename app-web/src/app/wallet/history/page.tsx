/**
 * /wallet/history — Purchase History Page
 *
 * Auth-protected (via wallet layout.tsx).
 * Shows all purchase transactions from Firestore purchases collection.
 *
 * INVARIANTS:
 * - Data is READ-ONLY from Firestore.
 * - No balance modification from this page.
 */

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

interface PurchaseRecord {
  sessionId: string;
  packId: string;
  tokens: number;
  amountTotal: number | null;
  currency: string | null;
  source: string;
  status: string;
  createdAt: Date;
}

export default function WalletHistoryPage() {
  const { firebaseUser } = useAuth();
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHistory() {
      if (!firebaseUser?.uid || !db) {
        setLoading(false);
        return;
      }

      try {
        const q = query(
          collection(db, 'purchases'),
          where('userId', '==', firebaseUser.uid),
          orderBy('createdAt', 'desc'),
          limit(100),
        );

        const snap = await getDocs(q);
        const records: PurchaseRecord[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            sessionId: d.id,
            packId: data.packId ?? 'Unknown',
            tokens: data.tokens ?? 0,
            amountTotal: data.amountTotal ?? null,
            currency: data.currency ?? null,
            source: data.source ?? 'web',
            status: data.status ?? 'UNKNOWN',
            createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt ?? 0),
          };
        });

        setPurchases(records);
      } catch (err) {
        console.error('[WalletHistory] Failed to load purchases:', err);
        setError('Failed to load purchase history. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [firebaseUser?.uid]);

  function formatCurrency(amountCents: number | null, currency: string | null): string {
    if (amountCents === null || currency === null) return '—';
    const amount = amountCents / 100;
    const symbols: Record<string, string> = { usd: '$', eur: '€', pln: 'zł', gbp: '£' };
    const sym = symbols[currency.toLowerCase()] || currency.toUpperCase() + ' ';
    if (currency.toLowerCase() === 'pln') {
      return `${amount.toFixed(2)} ${sym}`;
    }
    return `${sym}${amount.toFixed(2)}`;
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

  function statusBadge(status: string) {
    const styles: Record<string, string> = {
      COMPLETED: 'bg-green-100 text-green-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
      FAILED: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`text-xs font-medium px-2 py-1 rounded-full ${styles[status] ?? 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Breadcrumb */}
          <nav className="mb-6 text-sm">
            <Link href="/wallet" className="text-pink-600 hover:text-pink-700">
              Wallet
            </Link>
            <span className="mx-2 text-gray-400">/</span>
            <span className="text-gray-600">Purchase History</span>
          </nav>

          <h1 className="text-3xl font-bold text-gray-900 mb-8">Purchase History</h1>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-600" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <p className="text-red-700">{error}</p>
            </div>
          ) : purchases.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
              <div className="text-5xl mb-4" aria-hidden="true">🛒</div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No purchases yet</h2>
              <p className="text-gray-500 mb-6">
                You haven&apos;t purchased any token packs yet.
              </p>
              <Link
                href="/wallet/buy"
                className="inline-block bg-pink-600 hover:bg-pink-700 text-white font-medium py-3 px-8 rounded-lg transition"
              >
                Buy Tokens
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Pack
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Tokens
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Source
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {purchases.map((p) => (
                      <tr key={p.sessionId} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                          {formatDate(p.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {p.packId}
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-semibold text-pink-600">
                          +{p.tokens.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-700">
                          {formatCurrency(p.amountTotal, p.currency)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {statusBadge(p.status)}
                        </td>
                        <td className="px-6 py-4 text-center text-xs text-gray-400 uppercase">
                          {p.source}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-gray-100">
                {purchases.map((p) => (
                  <div key={p.sessionId} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{p.packId}</span>
                      {statusBadge(p.status)}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">{formatDate(p.createdAt)}</span>
                      <span className="font-semibold text-pink-600">+{p.tokens.toLocaleString()}</span>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {formatCurrency(p.amountTotal, p.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
