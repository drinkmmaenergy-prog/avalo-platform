/**
 * PACK 132 — Creator Insights Dashboard (Mobile)
 * Privacy-First Analytics Display
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useAuth } from "@/hooks/useAuth";
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { useRouter } from 'expo-router';

type AnalyticsPeriod = 'DAY_1' | 'DAY_7' | 'DAY_30' | 'DAY_90';

interface CreatorMetrics {
  period: AnalyticsPeriod;
  totalFollowers: number;
  followerGrowth: number;
  totalProfileViews: number;
  totalPosts: number;
  totalImpressions: number;
  totalReach: number;
  totalLikes: number;
  totalComments: number;
  engagementRate: number;
  totalRevenue: number;
  revenueGrowth: number;
  totalPurchases: number;
  avgPurchaseValue: number;
  revenueByChannel: {
    CHAT: number;
    MEDIA_UNLOCK: number;
    SUBSCRIPTION: number;
    DIGITAL_PRODUCT: number;
    CALL: number;
    GIFT: number;
  };
  subscriptionCount: number;
  callMinutesTotal: number;
  mediaUnlockCount: number;
  retentionDay1: number;
  retentionDay7: number;
  retentionDay30: number;
}

export default function CreatorAnalyticsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [selectedPeriod, setSelectedPeriod] = useState<AnalyticsPeriod>('DAY_30');
  const [metrics, setMetrics] = useState<CreatorMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadAnalytics();
    }
  }, [user, selectedPeriod]);

  const loadAnalytics = async () => {
    if (!user) return;
    
    try {
      setError(null);
      
      const getCreatorAnalytics = httpsCallable(functions, 'getCreatorAnalytics');
      const result = await getCreatorAnalytics({
        creatorId: user.uid,
        period: selectedPeriod,
        includeHeatmaps: false,
        includeInsights: true,
      });
      
      const data = result.data as any;
      setMetrics(data.metrics);
    } catch (err: any) {
      console.error('Error loading analytics:', err);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadAnalytics();
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const formatGrowth = (growth: number): string => {
    const sign = growth >= 0 ? '+' : '';
    return `${sign}${growth.toFixed(1)}%`;
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Please sign in to view analytics</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadAnalytics}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {(['DAY_1', 'DAY_7', 'DAY_30', 'DAY_90'] as AnalyticsPeriod[]).map((period) => (
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
              {period.replace('DAY_', '')}d
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {metrics && (
        <>
          {/* Overview Cards */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Overview</Text>
            
            <View style={styles.cardsRow}>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Followers</Text>
                <Text style={styles.cardValue}>{formatNumber(metrics.totalFollowers)}</Text>
                <Text style={[
                  styles.cardGrowth,
                  metrics.followerGrowth >= 0 ? styles.growthPositive : styles.growthNegative,
                ]}>
                  {formatGrowth(metrics.followerGrowth)}
                </Text>
              </View>
              
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Reach</Text>
                <Text style={styles.cardValue}>{formatNumber(metrics.totalReach)}</Text>
                <Text style={styles.cardSubtext}>{formatNumber(metrics.totalImpressions)} impressions</Text>
              </View>
            </View>

            <View style={styles.cardsRow}>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Engagement Rate</Text>
                <Text style={styles.cardValue}>{metrics.engagementRate.toFixed(1)}%</Text>
                <Text style={styles.cardSubtext}>
                  {formatNumber(metrics.totalLikes + metrics.totalComments)} actions
                </Text>
              </View>
              
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Revenue</Text>
                <Text style={styles.cardValue}>{formatNumber(metrics.totalRevenue)} 🪙</Text>
                <Text style={[
                  styles.cardGrowth,
                  metrics.revenueGrowth >= 0 ? styles.growthPositive : styles.growthNegative,
                ]}>
                  {formatGrowth(metrics.revenueGrowth)}
                </Text>
              </View>
            </View>
          </View>

          {/* Content Performance */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Content Performance</Text>
            
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Posts Published</Text>
              <Text style={styles.statValue}>{metrics.totalPosts}</Text>
            </View>
            
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Profile Views</Text>
              <Text style={styles.statValue}>{formatNumber(metrics.totalProfileViews)}</Text>
            </View>
            
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Total Likes</Text>
              <Text style={styles.statValue}>{formatNumber(metrics.totalLikes)}</Text>
            </View>
            
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Total Comments</Text>
              <Text style={styles.statValue}>{formatNumber(metrics.totalComments)}</Text>
            </View>
          </View>

          {/* Revenue Breakdown */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Revenue by Channel</Text>
            
            {Object.entries(metrics.revenueByChannel)
              .filter(([_, value]) => value > 0)
              .sort(([_, a], [__, b]) => b - a)
              .map(([channel, amount]) => (
                <View key={channel} style={styles.revenueRow}>
                  <View style={styles.revenueInfo}>
                    <Text style={styles.revenueLabel}>
                      {channel.replace('_', ' ')}
                    </Text>
                    <Text style={styles.revenueValue}>
                      {formatNumber(amount)} 🪙
                    </Text>
                  </View>
                  <View style={styles.revenueBar}>
                    <View
                      style={[
                        styles.revenueBarFill,
                        { width: `${(amount / metrics.totalRevenue) * 100}%` },
                      ]}
                    />
                  </View>
                </View>
              ))}
          </View>

          {/* Monetization Stats */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Monetization</Text>
            
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Total Purchases</Text>
              <Text style={styles.statValue}>{metrics.totalPurchases}</Text>
            </View>
            
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Avg Purchase Value</Text>
              <Text style={styles.statValue}>{metrics.avgPurchaseValue.toFixed(0)} 🪙</Text>
            </View>
            
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Active Subscriptions</Text>
              <Text style={styles.statValue}>{metrics.subscriptionCount}</Text>
            </View>
            
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Call Minutes</Text>
              <Text style={styles.statValue}>{metrics.callMinutesTotal}</Text>
            </View>
            
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Media Unlocks</Text>
              <Text style={styles.statValue}>{metrics.mediaUnlockCount}</Text>
            </View>
          </View>

          {/* Retention */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Follower Retention</Text>
            
            <View style={styles.retentionRow}>
              <View style={styles.retentionCard}>
                <Text style={styles.retentionLabel}>Day 1</Text>
                <Text style={styles.retentionValue}>{metrics.retentionDay1.toFixed(0)}%</Text>
              </View>
              
              <View style={styles.retentionCard}>
                <Text style={styles.retentionLabel}>Day 7</Text>
                <Text style={styles.retentionValue}>{metrics.retentionDay7.toFixed(0)}%</Text>
              </View>
              
              <View style={styles.retentionCard}>
                <Text style={styles.retentionLabel}>Day 30</Text>
                <Text style={styles.retentionValue}>{metrics.retentionDay30.toFixed(0)}%</Text>
              </View>
            </View>
          </View>

          {/* View Detailed Analytics */}
          <TouchableOpacity
            style={styles.detailedButton}
            onPress={() => router.push('/creator/analytics/insights' as any)}
          >
            <Text style={styles.detailedButtonText}>View Detailed Analytics</Text>
          </TouchableOpacity>

          {/* Privacy Notice */}
          <View style={styles.privacyNotice}>
            <Text style={styles.privacyText}>
              🔒 All analytics are aggregated and anonymized. No personal data or buyer identities are exposed.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#DC3545',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  periodSelector: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#FFF',
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#007AFF',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  periodButtonTextActive: {
    color: '#FFF',
  },
  section: {
    backgroundColor: '#FFF',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 8,
  },
  cardLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  cardGrowth: {
    fontSize: 14,
    fontWeight: '600',
  },
  growthPositive: {
    color: '#28A745',
  },
  growthNegative: {
    color: '#DC3545',
  },
  cardSubtext: {
    fontSize: 12,
    color: '#999',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  statLabel: {
    fontSize: 15,
    color: '#666',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  revenueRow: {
    marginBottom: 16,
  },
  revenueInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  revenueLabel: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  revenueValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  revenueBar: {
    height: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  revenueBarFill: {
    height: '100%',
    backgroundColor: '#007AFF',
  },
  retentionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  retentionCard: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  retentionLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  retentionValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#007AFF',
  },
  detailedButton: {
    backgroundColor: '#007AFF',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  detailedButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  privacyNotice: {
    backgroundColor: '#E8F5E9',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  privacyText: {
    fontSize: 13,
    color: '#1B5E20',
    lineHeight: 20,
  },
});
