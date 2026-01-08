'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Shield, 
  Calendar,
  MessageCircle,
  Video,
  Sparkles,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Loader2
} from 'lucide-react';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface InvestorMetrics {
  date: string;
  users: {
    registeredTotal: number;
    verifiedTotal: number;
    dau: number;
    mau: number;
  };
  engagement: {
    swipes: number;
    activeChats: number;
    meetingsBooked: number;
    eventTickets: number;
    aiSessions: number;
  };
  monetization: {
    tokensPurchased: number;
    tokensSpentChat: number;
    tokensSpentCalls: number;
    tokensSpentCalendar: number;
    tokensSpentEvents: number;
    tokensSpentAI: number;
    platformShareTokens: number;
  };
  safety: {
    verificationsCompleted: number;
    safetyReports: number;
    panicButtonTriggers: number;
    accountsBanned: number;
  };
}

export default function InvestorDashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<InvestorMetrics | null>(null);
  const [historicalData, setHistoricalData] = useState<InvestorMetrics[]>([]);

  useEffect(() => {
    checkAuthorization();
  }, [user, authLoading]);

  const checkAuthorization = async () => {
    if (authLoading) return;

    if (!user) {
      router.push('/auth/login?redirect=/investor/dashboard');
      return;
    }

    try {
      // Check if user has investor role
      const userDoc = await getDocs(
        query(collection(db, 'users'), where('__name__', '==', user.uid), limit(1))
      );

      if (!userDoc.empty) {
        const userData = userDoc.docs[0].data();
        
        // Check for investor role or admin role
        if (userData.role === 'investor' || userData.role === 'admin') {
          setAuthorized(true);
          
          // Log access for audit
          await logAccess();
          
          // Fetch metrics
          await fetchMetrics();
        } else {
          router.push('/');
        }
      } else {
        router.push('/');
      }
    } catch (error) {
      console.error('Authorization error:', error);
      router.push('/');
    } finally {
      setLoading(false);
    }
  };

  const logAccess = async () => {
    try {
      // Log to audit collection
      await fetch('/api/admin/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'INVESTOR_DASHBOARD_VIEWED',
          userId: user?.uid,
          timestamp: new Date().toISOString(),
          metadata: {
            userAgent: navigator.userAgent,
            ip: 'server-side' // Will be logged server-side
          }
        })
      });
    } catch (error) {
      console.error('Failed to log access:', error);
    }
  };

  const fetchMetrics = async () => {
    try {
      // Fetch latest metrics
      const metricsQuery = query(
        collection(db, 'investorMetricsDaily'),
        orderBy('date', 'desc'),
        limit(30)
      );

      const metricsSnap = await getDocs(metricsQuery);
      const data: InvestorMetrics[] = [];

      metricsSnap.forEach(doc => {
        data.push({ ...doc.data(), date: doc.id } as InvestorMetrics);
      });

      setHistoricalData(data);
      if (data.length > 0) {
        setMetrics(data[0]);
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
    }
  };

  const calculateGrowth = (current: number, previous: number): number => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  const previousMetrics = historicalData.length > 1 ? historicalData[1] : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Investor Dashboard
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Real-time metrics and performance analytics
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600 dark:text-gray-400">Last updated</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {metrics ? new Date().toLocaleString() : '-'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {!metrics ? (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 text-center">
            <AlertCircle className="w-12 h-12 text-yellow-600 dark:text-yellow-400 mx-auto mb-4" />
            <p className="text-yellow-800 dark:text-yellow-200">
              No metrics data available yet. Metrics are aggregated daily.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* User Growth */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
                <Users className="w-6 h-6 text-purple-600" />
                <span>User Growth</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { 
                    label: 'Total Registered', 
                    value: metrics.users.registeredTotal,
                    previous: previousMetrics?.users.registeredTotal || 0
                  },
                  { 
                    label: 'Verified Users', 
                    value: metrics.users.verifiedTotal,
                    previous: previousMetrics?.users.verifiedTotal || 0
                  },
                  { 
                    label: 'Daily Active Users', 
                    value: metrics.users.dau,
                    previous: previousMetrics?.users.dau || 0
                  },
                  { 
                    label: 'Monthly Active Users', 
                    value: metrics.users.mau,
                    previous: previousMetrics?.users.mau || 0
                  }
                ].map((stat, index) => {
                  const growth = calculateGrowth(stat.value, stat.previous);
                  return (
                    <div key={index} className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{stat.label}</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        {formatNumber(stat.value)}
                      </p>
                      {previousMetrics && (
                        <div className={`flex items-center space-x-1 text-sm ${growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {growth >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                          <span>{Math.abs(growth).toFixed(1)}%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Engagement */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
                <TrendingUp className="w-6 h-6 text-purple-600" />
                <span>Engagement</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                {[
                  { label: 'Daily Swipes', value: metrics.engagement.swipes, icon: Users },
                  { label: 'Active Chats', value: metrics.engagement.activeChats, icon: MessageCircle },
                  { label: 'Meetings Booked', value: metrics.engagement.meetingsBooked, icon: Calendar },
                  { label: 'Event Tickets', value: metrics.engagement.eventTickets, icon: Calendar },
                  { label: 'AI Sessions', value: metrics.engagement.aiSessions, icon: Sparkles }
                ].map((stat, index) => (
                  <div key={index} className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <stat.icon className="w-5 h-5 text-purple-600" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                      {formatNumber(stat.value)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{stat.label}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Monetization */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
                <DollarSign className="w-6 h-6 text-purple-600" />
                <span>Monetization</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Tokens Overview
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Total Purchased</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatNumber(metrics.monetization.tokensPurchased)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Platform Share</p>
                      <p className="text-2xl font-bold text-purple-600">
                        {formatNumber(metrics.monetization.platformShareTokens)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        (Based on revenue splits)
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Tokens by Category
                  </h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Chat', value: metrics.monetization.tokensSpentChat },
                      { label: 'Calls', value: metrics.monetization.tokensSpentCalls },
                      { label: 'Calendar', value: metrics.monetization.tokensSpentCalendar },
                      { label: 'Events', value: metrics.monetization.tokensSpentEvents },
                      { label: 'AI', value: metrics.monetization.tokensSpentAI }
                    ].map((cat, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">{cat.label}</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {formatNumber(cat.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Safety & Trust */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
                <Shield className="w-6 h-6 text-purple-600" />
                <span>Safety & Trust</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Verifications Completed', value: metrics.safety.verificationsCompleted },
                  { label: 'Safety Reports', value: metrics.safety.safetyReports },
                  { label: 'Panic Button Triggers', value: metrics.safety.panicButtonTriggers },
                  { label: 'Accounts Banned', value: metrics.safety.accountsBanned }
                ].map((stat, index) => (
                  <div key={index} className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatNumber(stat.value)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Disclaimer */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Note:</strong> All metrics are aggregated and anonymized. No personally identifiable information (PII) is displayed. 
                Platform revenue calculations are based on configured revenue split percentages (65/35 for chat/calls/AI, 80/20 for calendar/events).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}