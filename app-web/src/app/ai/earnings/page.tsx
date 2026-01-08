/**
 * PACK 279E — AI Creator Earnings Dashboard (Web)
 * Next.js page for AI creators to track earnings from chat/voice/video
 * Read-only analytics displaying real earnings from PACK 277
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '@/lib/firebase';

const TOKEN_TO_PLN = 0.20; // 1 Token = 0.20 PLN
const CREATOR_SHARE = 0.65; // 65% to creator
const AVALO_SHARE = 0.35; // 35% to Avalo

interface EarningTransaction {
  id: string;
  date: Date;
  aiName: string;
  type: 'chat' | 'voice' | 'video';
  tokensEarned: number;
  plnValue: number;
}

interface EarningsData {
  totalTokens: number;
  totalPLN: number;
  todayTokens: number;
  todayPLN: number;
  last7DaysTokens: number;
  last7DaysPLN: number;
  last30DaysTokens: number;
  last30DaysPLN: number;
  chatEarnings: number;
  voiceEarnings: number;
  videoEarnings: number;
  transactions: EarningTransaction[];
}

export default function AIEarningsWebPage() {
  const router = useRouter();
  const auth = getAuth();

  const [loading, setLoading] = useState(true);
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | '7days' | '30days'>('7days');

  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      loadEarnings(user.uid);
    } else {
      // Wait for auth state
      const unsubscribe = auth.onAuthStateChanged((user) => {
        if (user) {
          loadEarnings(user.uid);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  const loadEarnings = async (userId: string) => {
    try {
      setLoading(true);

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Fetch AI companion earnings
      const earningsRef = collection(db, 'aiCompanionEarnings');
      const earningsQuery = query(
        earningsRef,
        where('creatorId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(100)
      );

      const earningsSnapshot = await getDocs(earningsQuery);
      const allEarnings = earningsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
      }));

      // Calculate totals
      let totalTokens = 0;
      let todayTokens = 0;
      let last7DaysTokens = 0;
      let last30DaysTokens = 0;
      let chatEarnings = 0;
      let voiceEarnings = 0;
      let videoEarnings = 0;

      const transactions: EarningTransaction[] = [];

      allEarnings.forEach((earning: any) => {
        const earnedTokens = earning.creatorShare || 0;
        const createdAt = earning.createdAt;

        totalTokens += earnedTokens;

        if (createdAt >= todayStart) {
          todayTokens += earnedTokens;
        }
        if (createdAt >= last7Days) {
          last7DaysTokens += earnedTokens;
        }
        if (createdAt >= last30Days) {
          last30DaysTokens += earnedTokens;
        }

        // Categorize by type
        const type = earning.sessionType || 'chat';
        if (type === 'chat') chatEarnings += earnedTokens;
        else if (type === 'voice') voiceEarnings += earnedTokens;
        else if (type === 'video') videoEarnings += earnedTokens;

        // Add to transactions list (last 20)
        if (transactions.length < 20) {
          transactions.push({
            id: earning.id,
            date: createdAt,
            aiName: earning.aiName || 'AI Companion',
            type: type,
            tokensEarned: earnedTokens,
            plnValue: earnedTokens * TOKEN_TO_PLN,
          });
        }
      });

      setEarnings({
        totalTokens,
        totalPLN: totalTokens * TOKEN_TO_PLN,
        todayTokens,
        todayPLN: todayTokens * TOKEN_TO_PLN,
        last7DaysTokens,
        last7DaysPLN: last7DaysTokens * TOKEN_TO_PLN,
        last30DaysTokens,
        last30DaysPLN: last30DaysTokens * TOKEN_TO_PLN,
        chatEarnings,
        voiceEarnings,
        videoEarnings,
        transactions,
      });
    } catch (error) {
      console.error('Error loading AI earnings:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTokens = (tokens: number) => {
    return tokens.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  const formatPLN = (pln: number) => {
    return pln.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'chat': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'voice': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'video': return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading earnings...</p>
        </div>
      </div>
    );
  }

  const selectedEarnings = selectedPeriod === 'today'
    ? { tokens: earnings?.todayTokens || 0, pln: earnings?.todayPLN || 0 }
    : selectedPeriod === '7days'
    ? { tokens: earnings?.last7DaysTokens || 0, pln: earnings?.last7DaysPLN || 0 }
    : { tokens: earnings?.last30DaysTokens || 0, pln: earnings?.last30DaysPLN || 0 };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-700 mb-4 inline-flex items-center"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            AI Creator Earnings
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Track your AI companion revenue
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Total Earnings Card */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-8 text-white mb-8 shadow-lg">
          <p className="text-sm opacity-90 mb-2">Total Earned</p>
          <h2 className="text-4xl font-bold mb-2">
            {formatTokens(earnings?.totalTokens || 0)} tokens
          </h2>
          <p className="text-xl opacity-90 mb-6">
            ≈ {formatPLN(earnings?.totalPLN || 0)} PLN
          </p>
          <button
            onClick={() => router.push('/ai/payouts')}
            className="bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors inline-flex items-center gap-2"
          >
            💰 Request Payout
          </button>
        </div>

        {/* Period Selector */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setSelectedPeriod('today')}
            className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-colors ${
              selectedPeriod === 'today'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setSelectedPeriod('7days')}
            className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-colors ${
              selectedPeriod === '7days'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setSelectedPeriod('30days')}
            className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-colors ${
              selectedPeriod === '30days'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
          >
            Last 30 Days
          </button>
        </div>

        {/* Selected Period Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-8 text-center shadow">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {selectedPeriod === 'today' ? 'Today' : selectedPeriod === '7days' ? 'Last 7 Days' : 'Last 30 Days'}
          </p>
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {formatTokens(selectedEarnings.tokens)} tokens
          </h3>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            ≈ {formatPLN(selectedEarnings.pln)} PLN
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Revenue Split */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Revenue Split
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700">
                <span className="font-medium text-gray-900 dark:text-white">AI Chat</span>
                <div className="flex gap-3">
                  <span className="text-green-600 font-semibold">65% Creator</span>
                  <span className="text-gray-500">35% Avalo</span>
                </div>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700">
                <span className="font-medium text-gray-900 dark:text-white">AI Voice</span>
                <div className="flex gap-3">
                  <span className="text-green-600 font-semibold">65% Creator</span>
                  <span className="text-gray-500">35% Avalo</span>
                </div>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700">
                <span className="font-medium text-gray-900 dark:text-white">AI Video</span>
                <div className="flex gap-3">
                  <span className="text-green-600 font-semibold">65% Creator</span>
                  <span className="text-gray-500">35% Avalo</span>
                </div>
              </div>
              <div className="flex justify-between items-center py-3">
                <span className="font-medium text-gray-900 dark:text-white">Avalo AI</span>
                <span className="text-gray-500 font-semibold">100% Avalo</span>
              </div>
            </div>
          </div>

          {/* Performance by Type */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Performance by Type
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="text-3xl mb-2">💬</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatTokens(earnings?.chatEarnings || 0)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Chat</div>
              </div>
              <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="text-3xl mb-2">📞</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatTokens(earnings?.voiceEarnings || 0)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Voice</div>
              </div>
              <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <div className="text-3xl mb-2">📹</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatTokens(earnings?.videoEarnings || 0)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Video</div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Recent Transactions (Last 20)
          </h3>
          {earnings?.transactions && earnings.transactions.length > 0 ? (
            <div className="space-y-3">
              {earnings.transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getTypeColor(transaction.type)}`}>
                      {transaction.type === 'chat' && '💬'}
                      {transaction.type === 'voice' && '📞'}
                      {transaction.type === 'video' && '📹'}
                      {' '}{transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {transaction.aiName}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {formatDate(transaction.date)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-green-600">
                      +{formatTokens(transaction.tokensEarned)} tokens
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {formatPLN(transaction.plnValue)} PLN
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">💰</div>
              <p className="text-gray-600 dark:text-gray-400 mb-2">No earnings yet</p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                Earnings will appear here when users interact with your AI companions
              </p>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-8 p-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <p>💰 <strong>Payout Rate:</strong> 1 Token = {TOKEN_TO_PLN.toFixed(2)} PLN</p>
            <p>📊 <strong>Revenue Share:</strong> {CREATOR_SHARE * 100}% creator, {AVALO_SHARE * 100}% platform fee</p>
            <p>🔒 <strong>Minimum Payout:</strong> 1000 tokens = 200 PLN</p>
          </div>
        </div>
      </div>
    </div>
  );
}