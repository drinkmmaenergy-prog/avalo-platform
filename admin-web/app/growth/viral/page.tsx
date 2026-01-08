'use client';

/**
 * ═══════════════════════════════════════════════════════════════
 * PACK 374 — VIRAL GROWTH ENGINE - ADMIN DASHBOARD
 * ═══════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

interface ViralMetrics {
  totalInvitesSent: number;
  totalInvitesAccepted: number;
  conversionRate: number;
  activeBoosts: number;
  totalBoostRevenue: number;
  shareToInstallRate: number;
  kFactor: number;
  fraudBlocked: number;
  revenueFromViral: number;
}

interface ChartData {
  date: string;
  invites: number;
  accepted: number;
  boosts: number;
  kFactor: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function ViralGrowthDashboard() {
  const [metrics, setMetrics] = useState<ViralMetrics>({
    totalInvitesSent: 0,
    totalInvitesAccepted: 0,
    conversionRate: 0,
    activeBoosts: 0,
    totalBoostRevenue: 0,
    shareToInstallRate: 0,
    kFactor: 0,
    fraudBlocked: 0,
    revenueFromViral: 0,
  });

  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [channelData, setChannelData] = useState<any[]>([]);
  const [boostTypeData, setBoostTypeData] = useState<any[]>([]);
  const [topInviters, setTopInviters] = useState<any[]>([]);
  const [fraudAlerts, setFraudAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    loadDashboardData();
  }, [dateRange]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadViralMetrics(),
        loadChartData(),
        loadChannelDistribution(),
        loadBoostTypeDistribution(),
        loadTopInviters(),
        loadFraudAlerts(),
      ]);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadViralMetrics = async () => {
    const daysAgo = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const startDate = Timestamp.fromDate(
      new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    );

    // Total invites sent
    const invitesSentQuery = query(
      collection(db, 'viralInvites'),
      where('createdAt', '>=', startDate)
    );
    const invitesSent = await getCountFromServer(invitesSentQuery);

    // Total invites accepted
    const invitesAcceptedQuery = query(
      collection(db, 'viralInvites'),
      where('createdAt', '>=', startDate),
      where('rewardStatus', '==', 'rewarded')
    );
    const invitesAccepted = await getCountFromServer(invitesAcceptedQuery);

    // Active boosts
    const activeBoostsQuery = query(
      collection(db, 'viralBoosts'),
      where('status', '==', 'active')
    );
    const activeBoosts = await getCountFromServer(activeBoostsQuery);

    // Boost revenue
    const boostPurchasesQuery = query(
      collection(db, 'boostPurchaseHistory'),
      where('purchasedAt', '>=', startDate)
    );
    const boostPurchases = await getDocs(boostPurchasesQuery);
    const totalBoostRevenue = boostPurchases.docs.reduce(
      (sum, doc) => sum + (doc.data().price || 0),
      0
    );

    // Fraud blocked
    const fraudQuery = query(
      collection(db, 'inviteFraud'),
      where('detectedAt', '>=', startDate)
    );
    const fraudBlocked = await getCountFromServer(fraudQuery);

    // Get latest K-Factor
    const kFactorQuery = query(
      collection(db, 'viralCoefficients'),
      orderBy('date', 'desc'),
      limit(1)
    );
    const kFactorSnapshot = await getDocs(kFactorQuery);
    const latestKFactor = kFactorSnapshot.empty
      ? 0
      : kFactorSnapshot.docs[0].data().kFactor;

    // Share conversions
    const shareConversionsQuery = query(
      collection(db, 'shareConversions'),
      where('convertedAt', '>=', startDate)
    );
    const shareConversions = await getDocs(shareConversionsQuery);
    const totalShares = await getCountFromServer(
      query(
        collection(db, 'shareTracking'),
        where('createdAt', '>=', startDate)
      )
    );

    const shareToInstallRate =
      totalShares.data().count > 0
        ? (shareConversions.size / totalShares.data().count) * 100
        : 0;

    const revenueFromViral = shareConversions.docs.reduce(
      (sum, doc) => sum + (doc.data().revenueGenerated || 0),
      0
    );

    setMetrics({
      totalInvitesSent: invitesSent.data().count,
      totalInvitesAccepted: invitesAccepted.data().count,
      conversionRate:
        invitesSent.data().count > 0
          ? (invitesAccepted.data().count / invitesSent.data().count) * 100
          : 0,
      activeBoosts: activeBoosts.data().count,
      totalBoostRevenue,
      shareToInstallRate,
      kFactor: latestKFactor,
      fraudBlocked: fraudBlocked.data().count,
      revenueFromViral,
    });
  };

  const loadChartData = async () => {
    const daysAgo = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const data: ChartData[] = [];

    for (let i = daysAgo - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const startTimestamp = Timestamp.fromDate(date);
      const endTimestamp = Timestamp.fromDate(nextDate);

      // Get invites for this day
      const invitesQuery = query(
        collection(db, 'viralInvites'),
        where('createdAt', '>=', startTimestamp),
        where('createdAt', '<', endTimestamp)
      );
      const invites = await getCountFromServer(invitesQuery);

      // Get accepted invites
      const acceptedQuery = query(
        collection(db, 'viralInvites'),
        where('createdAt', '>=', startTimestamp),
        where('createdAt', '<', endTimestamp),
        where('rewardStatus', '==', 'rewarded')
      );
      const accepted = await getCountFromServer(acceptedQuery);

      // Get boosts for this day
      const boostsQuery = query(
        collection(db, 'viralBoosts'),
        where('createdAt', '>=', startTimestamp),
        where('createdAt', '<', endTimestamp)
      );
      const boosts = await getCountFromServer(boostsQuery);

      // Get K-Factor for this day
      const dateStr = date.toISOString().split('T')[0];
      const kFactorQuery = query(
        collection(db, 'viralCoefficients'),
        where('period', '==', dateStr)
      );
      const kFactorSnapshot = await getDocs(kFactorQuery);
      const kFactor = kFactorSnapshot.empty
        ? 0
        : kFactorSnapshot.docs[0].data().kFactor;

      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        invites: invites.data().count,
        accepted: accepted.data().count,
        boosts: boosts.data().count,
        kFactor: parseFloat(kFactor.toFixed(3)),
      });
    }

    setChartData(data);
  };

  const loadChannelDistribution = async () => {
    const daysAgo = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const startDate = Timestamp.fromDate(
      new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    );

    const channels = ['sms', 'whatsapp', 'messenger', 'instagram', 'qr', 'link'];
    const data = [];

    for (const channel of channels) {
      const channelQuery = query(
        collection(db, 'viralInvites'),
        where('channel', '==', channel),
        where('createdAt', '>=', startDate)
      );
      const count = await getCountFromServer(channelQuery);
      
      if (count.data().count > 0) {
        data.push({
          name: channel.charAt(0).toUpperCase() + channel.slice(1),
          value: count.data().count,
        });
      }
    }

    setChannelData(data);
  };

  const loadBoostTypeDistribution = async () => {
    const daysAgo = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const startDate = Timestamp.fromDate(
      new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    );

    const types = ['profile', 'story', 'creator', 'local'];
    const data = [];

    for (const type of types) {
      const typeQuery = query(
        collection(db, 'viralBoosts'),
        where('boostType', '==', type),
        where('createdAt', '>=', startDate)
      );
      const count = await getCountFromServer(typeQuery);
      
      if (count.data().count > 0) {
        data.push({
          name: type.charAt(0).toUpperCase() + type.slice(1),
          value: count.data().count,
        });
      }
    }

    setBoostTypeData(data);
  };

  const loadTopInviters = async () => {
    const topInvitersQuery = query(
      collection(db, 'userInviteStats'),
      orderBy('totalInvitesAccepted', 'desc'),
      limit(10)
    );

    const snapshot = await getDocs(topInvitersQuery);
    const data = snapshot.docs.map((doc) => ({
      userId: doc.id.substring(0, 8) + '...',
      sent: doc.data().totalInvitesSent || 0,
      accepted: doc.data().totalInvitesAccepted || 0,
      rate: ((doc.data().totalInvitesAccepted / doc.data().totalInvitesSent) * 100).toFixed(1),
    }));

    setTopInviters(data);
  };

  const loadFraudAlerts = async () => {
    const fraudQuery = query(
      collection(db, 'inviteFraud'),
      orderBy('detectedAt', 'desc'),
      limit(10)
    );

    const snapshot = await getDocs(fraudQuery);
    const data = snapshot.docs.map((doc) => {
      const fraudData = doc.data();
      return {
        id: doc.id.substring(0, 8),
        type: fraudData.fraudType,
        severity: fraudData.severity,
        userId: fraudData.inviterUserId?.substring(0, 8) + '...',
        time: fraudData.detectedAt?.toDate().toLocaleString(),
      };
    });

    setFraudAlerts(data);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading viral growth data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🚀 Viral Growth Engine
          </h1>
          <p className="text-gray-600">
            Real-time analytics for invites, boosts, and viral loops
          </p>

          {/* Date Range Selector */}
          <div className="mt-4 flex gap-2">
            {(['7d', '30d', '90d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  dateRange === range
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="K-Factor"
            value={metrics.kFactor.toFixed(3)}
            subtitle="Target: 0.25+"
            trend={metrics.kFactor >= 0.25 ? 'up' : 'down'}
            color={metrics.kFactor >= 0.25 ? 'green' : 'yellow'}
          />
          <MetricCard
            title="Invites Sent"
            value={metrics.totalInvitesSent.toLocaleString()}
            subtitle={`${metrics.totalInvitesAccepted} accepted`}
            trend="neutral"
            color="blue"
          />
          <MetricCard
            title="Conversion Rate"
            value={`${metrics.conversionRate.toFixed(1)}%`}
            subtitle="Invite to user"
            trend={metrics.conversionRate > 10 ? 'up' : 'down'}
            color="purple"
          />
          <MetricCard
            title="Active Boosts"
            value={metrics.activeBoosts.toLocaleString()}
            subtitle={`$${metrics.totalBoostRevenue.toFixed(0)} revenue`}
            trend="neutral"
            color="orange"
          />
        </div>

        {/* Revenue & Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <MetricCard
            title="Share → Install"
            value={`${metrics.shareToInstallRate.toFixed(1)}%`}
            subtitle="Conversion rate"
            trend={metrics.shareToInstallRate > 5 ? 'up' : 'down'}
            color="teal"
          />
          <MetricCard
            title="Viral Revenue"
            value={`$${metrics.revenueFromViral.toFixed(0)}`}
            subtitle="From shares & invites"
            trend="up"
            color="green"
          />
          <MetricCard
            title="Fraud Blocked"
            value={metrics.fraudBlocked.toLocaleString()}
            subtitle="Suspicious invites"
            trend="neutral"
            color="red"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Invites Over Time */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Invites & Acceptance
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="invites" stroke="#3B82F6" name="Sent" />
                <Line type="monotone" dataKey="accepted" stroke="#10B981" name="Accepted" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* K-Factor Trend */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              K-Factor Trend
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 0.5]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="kFactor"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  name="K-Factor"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribution Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Invite Channels */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Invite Channels
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={channelData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {channelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Boost Types */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Boost Types
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={boostTypeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#F59E0B" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Inviters */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              🏆 Top Inviters
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">
                      User ID
                    </th>
                    <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">
                      Sent
                    </th>
                    <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">
                      Accepted
                    </th>
                    <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">
                      Rate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topInviters.map((inviter, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-4 text-sm text-gray-900">
                        {inviter.userId}
                      </td>
                      <td className="py-2 px-4 text-sm text-gray-900 text-right">
                        {inviter.sent}
                      </td>
                      <td className="py-2 px-4 text-sm text-gray-900 text-right">
                        {inviter.accepted}
                      </td>
                      <td className="py-2 px-4 text-sm text-gray-900 text-right">
                        {inviter.rate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fraud Alerts */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              ⚠️ Recent Fraud Alerts
            </h3>
            <div className="space-y-3">
              {fraudAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-3 bg-red-50 rounded-lg border border-red-200"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-red-900">
                        {alert.type.replace(/_/g, ' ').toUpperCase()}
                      </p>
                      <p className="text-xs text-red-700 mt-1">
                        User: {alert.userId} • {alert.time}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded ${
                        alert.severity === 'high'
                          ? 'bg-red-600 text-white'
                          : alert.severity === 'medium'
                          ? 'bg-orange-500 text-white'
                          : 'bg-yellow-500 text-white'
                      }`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function MetricCard({
  title,
  value,
  subtitle,
  trend,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  trend: 'up' | 'down' | 'neutral';
  color: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500',
    purple: 'bg-purple-500',
    red: 'bg-red-500',
    teal: 'bg-teal-500',
  };

  const bgColor = colorClasses[color as keyof typeof colorClasses] || 'bg-gray-500';

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        {trend !== 'neutral' && (
          <span className={`text-${trend === 'up' ? 'green' : 'red'}-500`}>
            {trend === 'up' ? '↑' : '↓'}
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-sm text-gray-500">{subtitle}</p>
      <div className={`mt-3 h-1 rounded-full ${bgColor}`}></div>
    </div>
  );
}

function renderCustomLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: any) {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
  const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize="12"
      fontWeight="bold"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}
