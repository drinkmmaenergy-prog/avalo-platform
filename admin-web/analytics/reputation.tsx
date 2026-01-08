/**
 * PACK 411 — Admin Reputation Console
 * Monitor app store reputation, reviews, and detect brigading
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  StoreReview,
  StoreType,
  ReputationSnapshot,
  ReviewBrigadeAlert,
} from '../../../shared/types/pack411-reviews';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export default function ReputationConsole() {
  const [selectedStore, setSelectedStore] = useState<StoreType>('GOOGLE_PLAY');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedVersion, setSelectedVersion] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  
  const [reputationSnapshots, setReputationSnapshots] = useState<ReputationSnapshot[]>([]);
  const [recentReviews, setRecentReviews] = useState<StoreReview[]>([]);
  const [alerts, setAlerts] = useState<ReviewBrigadeAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [selectedStore, selectedCountry, selectedVersion, timeRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadReputationSnapshots(),
        loadRecentReviews(),
        loadAlerts(),
      ]);
    } catch (error) {
      console.error('Error loading reputation data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReputationSnapshots = async () => {
    const daysAgo = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);
    const startDateStr = startDate.toISOString().split('T')[0];

    let q = query(
      collection(db, 'storeReputationSnapshots'),
      where('store', '==', selectedStore),
      where('date', '>=', startDateStr),
      orderBy('date', 'desc')
    );

    const snapshot = await getDocs(q);
    const data = snapshot.docs.map((doc) => doc.data() as ReputationSnapshot);
    setReputationSnapshots(data);
  };

  const loadRecentReviews = async () => {
    let q = query(
      collection(db, 'storeReviews'),
      where('store', '==', selectedStore),
      where('rating', '<=', 2), // Focus on negative reviews
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const snapshot = await getDocs(q);
    const data = snapshot.docs.map((doc) => doc.data() as StoreReview);
    setRecentReviews(data);
  };

  const loadAlerts = async () => {
    const q = query(
      collection(db, 'reviewBrigadeAlerts'),
      where('affectedStore', '==', selectedStore),
      where('status', '!=', 'RESOLVED'),
      orderBy('status'),
      orderBy('detectedAt', 'desc'),
      limit(20)
    );

    const snapshot = await getDocs(q);
    const data = snapshot.docs.map((doc) => doc.data() as ReviewBrigadeAlert);
    setAlerts(data);
  };

  const getRatingDistributionData = () => {
    if (reputationSnapshots.length === 0) return [];
    
    const latest = reputationSnapshots[0];
    return [
      { name: '1 Star',value: latest.ratingsDistribution.oneStar, color: '#EF4444' },
      { name: '2 Stars', value: latest.ratingsDistribution.twoStar, color: '#F97316' },
      { name: '3 Stars', value: latest.ratingsDistribution.threeStar, color: '#EAB308' },
      { name: '4 Stars', value: latest.ratingsDistribution.fourStar, color: '#84CC16' },
      { name: '5 Stars', value: latest.ratingsDistribution.fiveStar, color: '#22C55E' },
    ];
  };

  const getRatingTrendData = () => {
    return reputationSnapshots
      .slice()
      .reverse()
      .map((snap) => ({
        date: snap.date,
        rating: snap.avgRating.toFixed(2),
        count: snap.ratingCount,
      }));
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-600';
      case 'HIGH': return 'bg-orange-600';
      case 'MEDIUM': return 'bg-yellow-600';
      case 'LOW': return 'bg-blue-600';
      default: return 'bg-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-gray-600">Loading reputation data...</div>
      </div>
    );
  }

  const latestSnapshot = reputationSnapshots[0];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          App Store Reputation Console
        </h1>
        <p className="text-gray-600">
          Monitor reviews, ratings, and detect brigading attacks
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 flex gap-4 flex-wrap">
        <select
          value={selectedStore}
          onChange={(e) => setSelectedStore(e.target.value as StoreType)}
          className="px-4 py-2 border border-gray-300 rounded-lg"
        >
          <option value="GOOGLE_PLAY">Google Play</option>
          <option value="APPLE_APP_STORE">Apple App Store</option>
        </select>

        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg"
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>

        <button
          onClick={loadData}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Refresh
        </button>
      </div>

      {/* Key Metrics */}
      {latestSnapshot && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Average Rating</div>
            <div className="text-3xl font-bold text-gray-900">
              {latestSnapshot.avgRating.toFixed(2)} ★
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Total Reviews</div>
            <div className="text-3xl font-bold text-gray-900">
              {latestSnapshot.ratingCount.toLocaleString()}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">1-Star Share</div>
            <div className="text-3xl font-bold text-red-600">
              {latestSnapshot.oneStarShare.toFixed(1)}%
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Active Alerts</div>
            <div className="text-3xl font-bold text-orange-600">
              {alerts.length}
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Rating Trend */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Rating Trend
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={getRatingTrendData()}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[0, 5]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="rating" stroke="#6366F1" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Rating Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Rating Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={getRatingDistributionData()}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${entry.value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {getRatingDistributionData().map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Brigade Detection Alerts
          </h3>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold text-white ${getSeverityColor(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {alert.alertType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      {alert.suspectedReviewIds.length} suspected reviews • Detected {new Date(alert.detectedAt).toLocaleDateString()}
                    </div>
                    {alert.notes && (
                      <div className="text-sm text-gray-500">{alert.notes}</div>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {alert.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Negative Reviews */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Negative Reviews (1-2 ★)
        </h3>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {recentReviews.map((review) => (
            <div key={review.id} className="border-b border-gray-200 pb-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="text-yellow-500">
                    {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-1">
                  {review.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              {review.title && (
                <div className="font-medium text-gray-900 mb-1">{review.title}</div>
              )}
              {review.body && (
                <div className="text-sm text-gray-600 line-clamp-2">{review.body}</div>
              )}
              <div className="flex gap-2 mt-2 text-xs text-gray-500">
                <span>{review.country}</span>
                <span>•</span>
                <span>v{review.appVersion}</span>
                {review.linkedSupportTicketId && (
                  <>
                    <span>•</span>
                    <span className="text-indigo-600">Ticket Created</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
