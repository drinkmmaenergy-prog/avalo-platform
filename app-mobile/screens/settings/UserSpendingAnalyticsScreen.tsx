/**
 * PACK 62 — User Spending Analytics Screen
 * 
 * Display-only screen showing user spending insights:
 * - Tokens spent by time period (7d/30d/90d/all-time)
 * - Category breakdown
 * - Purchase history
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
  fetchUserSpendingAnalytics,
  clearUserSpendingAnalyticsCache,
  formatTokens,
  formatAnalyticsDate,
  getChannelDisplayData,
  type UserSpendingAnalytics,
} from '../../services/analyticsService';

export default function UserSpendingAnalyticsScreen() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<UserSpendingAnalytics | null>(null);
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
      const data = await fetchUserSpendingAnalytics(userId, forceRefresh);
      setAnalytics(data);
    } catch (error) {
      console.error('Error loading spending analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (userId) {
      await clearUserSpendingAnalyticsCache(userId);
    }
    await loadAnalytics(true);
  };

  const getTokensForPeriod = (): number => {
    if (!analytics) return 0;
    
    switch (selectedPeriod) {
      case '7d':
        return analytics.last7dTokensSpent;
      case '30d':
        return analytics.last30dTokensSpent;
      case '90d':
        return analytics.last90dTokensSpent;
      case 'all':
        return analytics.allTimeTokensSpent;
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
        <Text style={styles.loadingText}>Loading spending insights...</Text>
      </View>
    );
  }

  if (!analytics) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Unable to load spending insights</Text>
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
        <Text style={styles.headerTitle}>Your Spending</Text>
        <Text style={styles.headerSubtitle}>Track your token usage and purchases</Text>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerText}>
          💡 You are in control of your spending. All purchases and token consumption are tracked here.
        </Text>
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

      {/* Main Spending Card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{getPeriodLabel()}</Text>
        <Text style={styles.mainTokensValue}>{formatTokens(getTokensForPeriod())}</Text>
        <Text style={styles.tokenLabel}>Tokens Spent</Text>
      </View>

      {/* Quick Stats */}
      <View style={styles.quickStatsRow}>
        <View style={styles.quickStatCard}>
          <Text style={styles.quickStatValue}>{formatTokens(analytics.last7dTokensSpent)}</Text>
          <Text style={styles.quickStatLabel}>Last 7 days</Text>
        </View>
        <View style={styles.quickStatCard}>
          <Text style={styles.quickStatValue}>{formatTokens(analytics.last30dTokensSpent)}</Text>
          <Text style={styles.quickStatLabel}>Last 30 days</Text>
        </View>
      </View>

      {/* Category Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spending by Category (30 days)</Text>
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
          <Text style={styles.emptyText}>No spending data for this period</Text>
        )}
      </View>

      {/* Purchase History */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Token Purchases</Text>
        <View style={styles.purchaseCard}>
          <View style={styles.purchaseRow}>
            <Text style={styles.purchaseLabel}>Total Purchases</Text>
            <Text style={styles.purchaseValue}>{analytics.purchases.totalPurchasesCount}</Text>
          </View>
          <View style={styles.purchaseRow}>
            <Text style={styles.purchaseLabel}>Total Tokens Purchased</Text>
            <Text style={styles.purchaseValue}>
              {formatTokens(analytics.purchases.totalPurchasedTokens)}
            </Text>
          </View>
          {analytics.purchases.lastPurchaseAt && (
            <>
              <View style={styles.purchaseRow}>
                <Text style={styles.purchaseLabel}>Last Purchase</Text>
                <Text style={styles.purchaseValue}>
                  {formatAnalyticsDate(analytics.purchases.lastPurchaseAt)}
                </Text>
              </View>
              <View style={styles.purchaseRow}>
                <Text style={styles.purchaseLabel}>Last Purchase Amount</Text>
                <Text style={styles.purchaseValue}>
                  {formatTokens(analytics.purchases.lastPurchaseAmountTokens || 0)}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Budget Insight */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Budget Insight</Text>
        <View style={styles.budgetCard}>
          <View style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>Tokens Purchased</Text>
            <Text style={styles.budgetValue}>
              {formatTokens(analytics.purchases.totalPurchasedTokens)}
            </Text>
          </View>
          <View style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>Tokens Spent</Text>
            <Text style={styles.budgetValue}>
              {formatTokens(analytics.allTimeTokensSpent)}
            </Text>
          </View>
          <View style={[styles.budgetRow, styles.budgetRowHighlight]}>
            <Text style={styles.budgetLabelBold}>Balance Used</Text>
            <Text style={styles.budgetValueBold}>
              {analytics.purchases.totalPurchasedTokens > 0
                ? `${((analytics.allTimeTokensSpent / analytics.purchases.totalPurchasedTokens) * 100).toFixed(1)}%`
                : '0%'}
            </Text>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/wallet' as any)}
        >
          <Text style={styles.actionButtonText}>Buy Tokens</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButtonSecondary}
          onPress={() => router.push('/settings/control-center' as any)}
        >
          <Text style={styles.actionButtonSecondaryText}>Privacy & Control Center</Text>
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
  infoBanner: {
    margin: 16,
    padding: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  infoBannerText: {
    fontSize: 14,
    color: '#1565C0',
    lineHeight: 20,
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
    color: '#FF6B35',
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
    color: '#FF6B35',
  },
  channelBarContainer: {
    height: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    marginBottom: 4,
  },
  channelBar: {
    height: '100%',
    backgroundColor: '#FF6B35',
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
  purchaseCard: {
    backgroundColor: '#F8F8F8',
    padding: 16,
    borderRadius: 8,
  },
  purchaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  purchaseLabel: {
    fontSize: 14,
    color: '#666666',
  },
  purchaseValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  budgetCard: {
    backgroundColor: '#F8F8F8',
    padding: 16,
    borderRadius: 8,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  budgetRowHighlight: {
    backgroundColor: '#FFF3E0',
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    borderBottomWidth: 0,
  },
  budgetLabel: {
    fontSize: 14,
    color: '#666666',
  },
  budgetValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  budgetLabelBold: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  budgetValueBold: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF6B35',
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
  actionButtonSecondary: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  actionButtonSecondaryText: {
    color: '#007AFF',
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
