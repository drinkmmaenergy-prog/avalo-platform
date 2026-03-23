'use client';
// @ts-nocheck — FIX 140: recharts module types not installed; runtime import works

/**
 * PHASE 3.3 — Creator Analytics Dashboard (READ-ONLY)
 *
 * FIX 110: Enhanced with recharts (LineChart, PieChart), Cloud Function data
 * loading with Firestore fallback, top supporters, revenue by source, and
 * conversion funnel.
 *
 * Firestore reads:
 *   - creator_stats/{uid} -> dailyEarnings, messageCount, topPayers
 *   - creator_analytics/{uid}_{period} -> engagement metrics (existing PACK 290)
 *   - creator_analytics_daily (fallback collection for daily data)
 *
 * Cloud Function:
 *   - getCreatorAnalyticsDashboard -> full analytics payload
 *
 * INVARIANTS:
 *   - Uses requireDb() / requireFunctions() canonical guards.
 *   - Uses useAuth() from AuthProvider for user context.
 *   - All data is READ-ONLY — no client-side aggregation modifies server state.
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getCreatorAnalytics } from '@/lib/services/phase33';
import { getCreatorStatsData, type CreatorStatsData } from '@/lib/services/creatorService';
import type { CreatorAnalyticsDashboard } from '@/types/phase33.types';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { requireDb, requireFunctions } from '@/lib/firebase';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';

type Period = 'day' | 'week' | 'month';

/* ─── Chart colors ─────────────────────────────────────────────────────── */

const COLORS = ['#E8593C', '#E4458F', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B'];

/* ─── Cloud Function analytics data shape ──────────────────────────────── */

interface CloudAnalyticsData {
  daily?: Array<{ date: string; tokensEarned: number; profileViews?: number }>;
  bySource?: {
    chat?: number;
    tips?: number;
    calls?: number;
    media?: number;
    subscriptions?: number;
    events?: number;
  };
  topSupporters?: Array<{
    uid: string;
    displayName: string;
    photoURL?: string;
    totalSpent: number;
  }>;
  responseRate?: number;
  conversionFunnel?: {
    profileViews: number;
    messages: number;
    payments: number;
  };
}

// ============================================================================
// NOT-A-CREATOR CTA
// ============================================================================

function NotACreatorCTA() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-lg text-center border border-gray-100">
        <div className="text-6xl mb-6">📊</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Creator Analytics</h1>
        <p className="text-gray-600 mb-6 leading-relaxed">
          Enable creator mode to access analytics about your audience, earnings,
          and performance.
        </p>
        <a
          href="/settings/creator"
          className="inline-flex items-center px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white
                     font-medium rounded-lg transition"
        >
          Enable Creator Mode
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// TOP PAYERS TABLE (existing)
// ============================================================================

function TopPayersTable({
  topPayers,
}: {
  topPayers: Array<{ uid: string; displayName: string; totalSpent: number }>;
}) {
  if (!topPayers || topPayers.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500">
        <div className="text-3xl mb-2">👥</div>
        <p className="text-sm">No top payer data yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">#</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Fan</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Tokens Spent</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {topPayers.map((payer, idx) => (
            <tr key={payer.uid} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-500 font-medium">{idx + 1}</td>
              <td className="px-4 py-3 text-gray-900">{payer.displayName || 'Anonymous'}</td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                {payer.totalSpent.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// FIX 110: TOP SUPPORTERS (with avatars)
// ============================================================================

function TopSupportersList({
  supporters,
}: {
  supporters: Array<{
    uid: string;
    displayName: string;
    photoURL?: string;
    totalSpent: number;
  }>;
}) {
  if (!supporters || supporters.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500">
        <div className="text-3xl mb-2">💝</div>
        <p className="text-sm">No supporters yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {supporters.map((s, i) => (
        <div key={s.uid || i} className="flex items-center gap-3 py-2">
          <span className="w-6 text-center font-bold text-sm">#{i + 1}</span>
          <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
            {s.photoURL ? (
              <img src={s.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#E8593C] to-[#8B5CF6] flex items-center justify-center text-white text-xs font-bold">
                {s.displayName?.charAt(0) || '?'}
              </div>
            )}
          </div>
          <span className="flex-1 text-sm truncate">{s.displayName || 'Anonymous'}</span>
          <span className="text-sm font-bold text-[#E4458F]">{s.totalSpent} tokens</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function CreatorAnalyticsPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('week');
  const [analytics, setAnalytics] = useState<CreatorAnalyticsDashboard | null>(null);
  const [stats, setStats] = useState<CreatorStatsData | null>(null);
  const [cloudData, setCloudData] = useState<CloudAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      try {
        setLoading(true);

        // FIX 110: Try Cloud Function first for full analytics dashboard data
        let cloudResult: CloudAnalyticsData | null = null;
        try {
          const fn = httpsCallable(requireFunctions(), 'getCreatorAnalyticsDashboard');
          const result = await fn({});
          cloudResult = (result.data as CloudAnalyticsData) || null;
          setCloudData(cloudResult);
        } catch {
          // Fallback: read from creator_analytics_daily collection
          try {
            const db = requireDb();
            const last30 = new Date();
            last30.setDate(last30.getDate() - 30);
            const snap = await getDocs(
              query(
                collection(db, 'creator_analytics_daily'),
                where('creatorId', '==', user.uid),
                where('date', '>=', last30.toISOString().split('T')[0]),
                orderBy('date', 'asc')
              )
            );
            if (snap.docs.length > 0) {
              cloudResult = { daily: snap.docs.map((d) => d.data() as any) };
              setCloudData(cloudResult);
            }
          } catch (fallbackErr) {
            console.debug('Creator analytics daily fallback failed:', fallbackErr);
          }
        }

        // Existing data sources as secondary/complement
        const [analyticsData, statsData] = await Promise.all([
          getCreatorAnalytics(user.uid, period).catch(() => null),
          getCreatorStatsData(user.uid).catch(() => null),
        ]);
        setAnalytics(analyticsData);
        setStats(statsData);
      } catch (err: any) {
        console.debug('Creator analytics not available:', err);
        // Silent fallback — no error shown to user
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user, period]);

  // ── Not-a-creator gate ───────────────────────────────────────────

  if (!loading && user && !user.isCreator) {
    return <NotACreatorCTA />;
  }

  // ── Loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-red-800 mb-2">Error Loading Analytics</h2>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!analytics && !stats && !cloudData) {
    return (
      <div className="bg-gray-50 rounded-xl p-12 text-center">
        <div className="text-6xl mb-4">📊</div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">No Analytics Data Yet</h2>
        <p className="text-gray-600">
          Analytics will appear once you start receiving engagement on your content.
        </p>
      </div>
    );
  }

  // ── Derived data ─────────────────────────────────────────────────

  // Prefer cloud daily data, then creator_stats, then analytics
  const dailyEarnings =
    cloudData?.daily && cloudData.daily.length > 0
      ? cloudData.daily.map((d) => ({ date: d.date, tokens: d.tokensEarned ?? 0 }))
      : stats?.dailyEarnings && stats.dailyEarnings.length > 0
        ? stats.dailyEarnings
        : analytics?.dailyEarnings ?? [];

  // Revenue by source — for PieChart
  const bySource = cloudData?.bySource || (analytics ? analytics.earningsBySource : null);
  const sourceData = bySource
    ? [
        { name: 'Chat', value: (bySource as any).chat || 0 },
        { name: 'Tips', value: (bySource as any).tips || 0 },
        { name: 'Calls', value: (bySource as any).calls || 0 },
        { name: 'Media', value: (bySource as any).media || (bySource as any).contentUnlocks || 0 },
        { name: 'Subs', value: (bySource as any).subscriptions || 0 },
        { name: 'Events', value: (bySource as any).events || 0 },
      ].filter((d) => d.value > 0)
    : [];

  // Top supporters from cloud, or topPayers from stats
  const topSupporters = cloudData?.topSupporters || null;

  // Profile views trend
  const profileViewsTrend = cloudData?.daily
    ? cloudData.daily
        .filter((d) => d.profileViews !== undefined)
        .map((d) => ({ date: d.date, views: d.profileViews || 0 }))
    : [];

  // Conversion funnel
  const funnel = cloudData?.conversionFunnel || null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600 mt-1">Your performance metrics and insights</p>
        </div>

        <div className="flex bg-gray-100 rounded-lg p-1">
          {(['day', 'week', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                period === p
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards — from creator_stats + analytics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="text-2xl mb-2">👁️</div>
          <div className="text-2xl font-bold text-gray-900">
            {(analytics?.totalViews ?? 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Total Views</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="text-2xl mb-2">💬</div>
          <div className="text-2xl font-bold text-gray-900">
            {(stats?.messageCount ?? analytics?.totalInteractions ?? 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Messages</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="text-2xl mb-2">👤</div>
          <div className="text-2xl font-bold text-gray-900">
            {(analytics?.profileViews ?? 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Profile Views</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="text-2xl mb-2">❤️</div>
          <div className="text-2xl font-bold text-gray-900">
            {(analytics?.uniqueFans ?? 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Unique Fans</div>
        </div>
      </div>

      {/* FIX 110: Revenue Chart (recharts LineChart) */}
      {dailyEarnings.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Revenue Trend (Last 30 Days)
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyEarnings}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="tokens"
                stroke="#E4458F"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Middle Grid: Revenue by Source PieChart + Top Supporters */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* FIX 110: Revenue by Source — PieChart (recharts) */}
        {sourceData.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Revenue by Source
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {sourceData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-3 justify-center">
              {sourceData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-gray-600">{d.name}</span>
                  <span className="font-medium">{d.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Earnings by Source bar breakdown (existing, for when PieChart has no data) */}
        {sourceData.length === 0 && analytics && (
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Earnings by Source
            </h2>
            <div className="space-y-3">
              {Object.entries(analytics.earningsBySource).map(([source, tokens]) => {
                const total = Object.values(analytics.earningsBySource).reduce(
                  (a, b) => a + b,
                  0,
                );
                const percentage = total > 0 ? (tokens / total) * 100 : 0;

                return (
                  <div key={source}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 capitalize">{source}</span>
                      <span className="font-medium">{tokens.toLocaleString()} tokens</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-pink-500 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FIX 110: Top Supporters (with avatars) — from Cloud Function */}
        {topSupporters ? (
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Supporters</h2>
            <TopSupportersList supporters={topSupporters} />
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Payers</h2>
            <TopPayersTable topPayers={stats?.topPayers ?? []} />
          </div>
        )}
      </div>

      {/* FIX 110: Profile Views Trend */}
      {profileViewsTrend.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Views Trend</h2>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={profileViewsTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="views" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* FIX 110: Message Response Rate */}
      {cloudData?.responseRate !== undefined && (
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Message Response Rate</h2>
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="3"
                  strokeDasharray={`${cloudData.responseRate * 100}, 100`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-gray-900">
                  {(cloudData.responseRate * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-600">
                You respond to {(cloudData.responseRate * 100).toFixed(0)}% of messages
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Higher response rates lead to more engagement and earnings
              </p>
            </div>
          </div>
        </div>
      )}

      {/* FIX 110: Conversion Funnel */}
      {funnel && (funnel.profileViews > 0 || funnel.messages > 0 || funnel.payments > 0) && (
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Conversion Funnel</h2>
          <div className="space-y-3">
            {[
              { label: 'Profile Views', value: funnel.profileViews, color: '#8B5CF6' },
              { label: 'Messages', value: funnel.messages, color: '#E4458F' },
              { label: 'Payments', value: funnel.payments, color: '#10B981' },
            ].map((step, idx) => {
              const maxVal = Math.max(funnel.profileViews, funnel.messages, funnel.payments, 1);
              const width = (step.value / maxVal) * 100;
              const prevStep = idx > 0
                ? [funnel.profileViews, funnel.messages, funnel.payments][idx - 1]
                : null;
              const convRate = prevStep && prevStep > 0
                ? ((step.value / prevStep) * 100).toFixed(1)
                : null;

              return (
                <div key={step.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 font-medium">{step.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{step.value.toLocaleString()}</span>
                      {convRate && (
                        <span className="text-xs text-gray-400">({convRate}%)</span>
                      )}
                    </div>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${width}%`, backgroundColor: step.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Conversion Metrics (from analytics — existing) */}
      {analytics && (
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Conversion Metrics</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm text-gray-600">Free to Paid Rate</div>
                <div className="text-xs text-gray-400">Viewers who became paying fans</div>
              </div>
              <div className="text-xl font-bold text-green-600">
                {(analytics.freeToPaidRate * 100).toFixed(1)}%
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm text-gray-600">Repeat Fan Rate</div>
                <div className="text-xs text-gray-400">Fans who engaged multiple times</div>
              </div>
              <div className="text-xl font-bold text-blue-600">
                {(analytics.repeatFanRate * 100).toFixed(1)}%
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm text-gray-600">Avg. Spend per Fan</div>
                <div className="text-xs text-gray-400">Average tokens spent per fan</div>
              </div>
              <div className="text-xl font-bold text-purple-600">
                {analytics.avgSpendPerFan.toFixed(0)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Last Updated */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-sm text-gray-600">
        Last updated: {analytics?.lastUpdated?.toLocaleString?.() ?? 'N/A'}
      </div>
    </div>
  );
}
