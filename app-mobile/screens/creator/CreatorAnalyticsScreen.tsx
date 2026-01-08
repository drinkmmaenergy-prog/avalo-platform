/**
 * PACK 62 — Creator Analytics Screen
 * 
 * Display-only screen showing creator earnings analytics:
 * - Tokens earned by time period (7d/30d/90d/all-time)
 * - Channel breakdown
 * - Key performance metrics
 * - Payout overview
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { auth } from '../../lib/firebase';
import {
  fetchCreatorAnalytics,
  clearCreatorAnalyticsCache,
  formatTokens,
  formatAnalyticsDate,
  getChannelDisplayData,
  type CreatorAnalytics,
} from '../../services/analyticsService';

export default function CreatorAnalyticsScreen() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<CreatorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const userId = auth.currentUser?.uid;

  // Load analytics on mount
  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async (forceRefresh: boolean = false) => {
    if (!userId) {
      console.warn('No user ID available');
      setLoading(false);
      return;
    }

    try {
      const data = await fetchCreatorAnalytics(userId, forceRefresh);
      setAnalytics(data);
    } catch (error) {
      console.error('Error loading creator analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (userId) {
      await clearCreatorAnalyticsCache(userId);
    }
    await loadAnalytics(true);
  };

  const getTokensForPeriod = (): number => {
    if (!analytics) return 0;
    
    switch (selectedPeriod) {
      case '7d':
        return analytics.last7dTokens;
      case '30d':
        return analytics.last30dTokens;
      case '90d':
        return analytics.last90dTokens;
      case 'all':
        return analytics.allTimeTokens;
      default:
        return 0;
    }
  };

  const getPeriodLabel = (): string => {
    switch (selectedPeriod) {
      case '7d':
        return 'Last 7 days';
      case '30d':
        return 'Last 30 days';
      case '90d':
        return 'Last 90 days';
      case 'all':
        return 'All time';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  if (!analytics) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Unable to load analytics</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => loadAnalytics(true)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const channelData = getChannelDisplayData(analytics.channels30d);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Creator Analytics</Text>
        <Text style={styles.headerSubtitle}>Track your earnings and performance</Text>
      </View>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {(['7d', '30d', '90d', 'all'] as const).map((period) => (
          <TouchableOpacity
            key={period}
            style={[
              styles.periodButton,
              selectedPeriod === period && styles.periodButtonActive,
            ]}
            onPress={() => setSelectedPeriod(period)}
          >
            <Text
              style={[
                styles.periodButtonText,
                selectedPeriod === period && styles.periodButtonTextActive,
              ]}
            >
              {period === 'all' ? 'All' : period.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Main Earnings Card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{getPeriodLabel()}</Text>
        <Text style={styles.mainTokensValue}>{formatTokens(getTokensForPeriod())}</Text>
        <Text style={styles.tokenLabel}>Tokens Earned</Text>
      </View>

      {/* Quick Stats */}
      <View style={styles.quickStatsRow}>
        <View style={styles.quickStatCard}>
          <Text style={styles.quickStatValue}>{formatTokens(analytics.last7dTokens)}</Text>
          <Text style={styles.quickStatLabel}>Last 7 days</Text>
        </View>
        <View style={styles.quickStatCard}>
          <Text style={styles.quickStatValue}>{formatTokens(analytics.last30dTokens)}</Text>
          <Text style={styles.quickStatLabel}>Last 30 days</Text>
        </View>
      </View>

      {/* Channel Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Earnings by Channel (30 days)</Text>
        {channelData.length > 0 ? (
          channelData.map((channel) => (
            <View key={channel.key} style={styles.channelRow}>
              <View style={styles.channelInfo}>
                <Text style={styles.channelLabel}>{channel.label}</Text>
                <Text style={styles.channelValue}>{formatTokens(channel.value)}</Text>
              </View>
              <View style={styles.channelBarContainer}>
                <View
                  style={[
                    styles.channelBar,
                    { width: `${Math.min(channel.percentage, 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.channelPercentage}>{channel.percentage.toFixed(1)}%</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No earnings data for this period</Text>
        )}
      </View>

      {/* Key Metrics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Key Metrics (30 days)</Text>
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.kpis30d.uniquePayers}</Text>
            <Text style={styles.metricLabel}>Unique Payers</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.kpis30d.totalPaidConversations}</Text>
            <Text style={styles.metricLabel}>Paid Chats</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.kpis30d.totalPaidMessages}</Text>
            <Text style={styles.metricLabel}>Paid Messages</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.kpis30d.totalBookings}</Text>
            <Text style={styles.metricLabel}>Bookings</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.kpis30d.totalNewFans}</Text>
            <Text style={styles.metricLabel}>New Fans</Text>
          </View>
        </View>
      </View>

      {/* Payout Overview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payout Overview</Text>
        <View style={styles.payoutCard}>
          <View style={styles.payoutRow}>
            <Text style={styles.payoutLabel}>Total Payouts</Text>
            <Text style={styles.payoutValue}>{analytics.payouts.totalPayoutsCount}</Text>
          </View>
          <View style={styles.payoutRow}>
            <Text style={styles.payoutLabel}>Total Tokens Paid Out</Text>
            <Text style={styles.payoutValue}>{formatTokens(analytics.payouts.totalPayoutTokens)}</Text>
          </View>
          {analytics.payouts.lastPayoutAt && (
            <>
              <View style={styles.payoutRow}>
                <Text style={styles.payoutLabel}>Last Payout</Text>
                <Text style={styles.payoutValue}>
                  {formatAnalyticsDate(analytics.payouts.lastPayoutAt)}
                </Text>
              </View>
              <View style={styles.payoutRow}>
                <Text style={styles.payoutLabel}>Last Payout Amount</Text>
                <Text style={styles.payoutValue}>
                  {formatTokens(analytics.payouts.lastPayoutAmountTokens || 0)}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/payouts' as any)}
        >
          <Text style={styles.actionButtonText}>View Payouts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/promotions' as any)}
        >
          <Text style={styles.actionButtonText}>View Promotions</Text>
        </TouchableOpacity>
      </View>

      {/* Last Updated */}
      <Text style={styles.lastUpdated}>
        Last updated: {formatAnalyticsDate(analytics.updatedAt)}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000000',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666666',
    marginTop: 4,
  },
  periodSelector: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#007AFF',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  card: {
    margin: 16,
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardLabel: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 8,
  },
  mainTokensValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#007AFF',
  },
  tokenLabel: {
    fontSize: 16,
    color: '#666666',
    marginTop: 4,
  },
  quickStatsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  quickStatCard: {
    flex: 1,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
  },
  quickStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
  },
  quickStatLabel: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
  },
  section: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  channelRow: {
    marginBottom: 16,
  },
  channelInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  channelLabel: {
    fontSize: 14,
    color: '#000000',
  },
  channelValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  channelBarContainer: {
    height: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    marginBottom: 4,
  },
  channelBar: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  channelPercentage: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'right',
  },
  emptyText: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    width: '47%',
    padding: 16,
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#007AFF',
  },
  metricLabel: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
    textAlign: 'center',
  },
  payoutCard: {
    backgroundColor: '#F8F8F8',
    padding: 16,
    borderRadius: 8,
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  payoutLabel: {
    fontSize: 14,
    color: '#666666',
  },
  payoutValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  actionsSection: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  lastUpdated: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
