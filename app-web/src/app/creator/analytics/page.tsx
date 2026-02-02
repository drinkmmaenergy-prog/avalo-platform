/**
 * PHASE 3.3 — Creator Analytics Dashboard (READ-ONLY)
 * 
 * Displays pre-computed analytics from backend.
 * NO client-side data aggregation — all from Firestore.
 * 
 * Backend source: creator_analytics collection (computed by PACK 290)
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getCreatorAnalytics } from '@/lib/services/phase33';
import type { CreatorAnalyticsDashboard } from '@/types/phase33.types';

type Period = 'day' | 'week' | 'month';

export default function CreatorAnalyticsPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('week');
  const [analytics, setAnalytics] = useState<CreatorAnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      
      try {
        setLoading(true);
        const data = await getCreatorAnalytics(user.uid, period);
        setAnalytics(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [user, period]);
  
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
  
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-red-800 mb-2">Error Loading Analytics</h2>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }
  
  if (!analytics) {
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
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="text-2xl mb-2">👁️</div>
          <div className="text-2xl font-bold text-gray-900">
            {analytics.totalViews.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Total Views</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="text-2xl mb-2">👤</div>
          <div className="text-2xl font-bold text-gray-900">
            {analytics.profileViews.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Profile Views</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="text-2xl mb-2">💬</div>
          <div className="text-2xl font-bold text-gray-900">
            {analytics.totalInteractions.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Interactions</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="text-2xl mb-2">❤️</div>
          <div className="text-2xl font-bold text-gray-900">
            {analytics.uniqueFans.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Unique Fans</div>
        </div>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Earnings by Source
          </h2>
          <div className="space-y-3">
            {Object.entries(analytics.earningsBySource).map(([source, tokens]) => {
              const total = Object.values(analytics.earningsBySource).reduce((a, b) => a + b, 0);
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
        
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Conversion Metrics
          </h2>
          <div className="space-y-4">
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
      </div>
      
      {analytics.dailyEarnings && analytics.dailyEarnings.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Daily Earnings Trend
          </h2>
          <div className="flex items-end gap-1 h-32">
            {analytics.dailyEarnings.map((day, index) => {
              const max = Math.max(...analytics.dailyEarnings.map((d) => d.tokens));
              const height = max > 0 ? (day.tokens / max) * 100 : 0;
              
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-pink-500 rounded-t hover:bg-pink-600 transition"
                    style={{ height: `${height}%`, minHeight: '4px' }}
                    title={`${day.date}: ${day.tokens} tokens`}
                  />
                  {index % Math.ceil(analytics.dailyEarnings.length / 7) === 0 && (
                    <div className="text-xs text-gray-400 mt-1 truncate w-full text-center">
                      {day.date.slice(5)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-sm text-gray-600">
        Last updated: {analytics.lastUpdated.toLocaleString()}
      </div>
    </div>
  );
}
