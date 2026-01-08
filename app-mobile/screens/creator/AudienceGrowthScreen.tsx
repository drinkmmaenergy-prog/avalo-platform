/**
 * PACK 102 — Audience Growth Screen
 * 
 * Shows creator's external audience growth metrics from social platforms.
 * Displays funnel data: visits → signups → follows → paid interactions.
 * Provides Smart Links and QR code for sharing.
 * 
 * CRITICAL: Zero incentives, analytics-only display.
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
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import {
  AudienceGrowthMetrics,
  SocialPlatform,
  PLATFORM_NAMES,
  PLATFORM_COLORS,
} from '../../types/audienceGrowth';
import ShareProfileModal from '../../components/creator/ShareProfileModal';

export default function AudienceGrowthScreen() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<AudienceGrowthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const userId = auth.currentUser?.uid;

  useEffect(() => {
    loadMetrics();
  }, [selectedPeriod]);

  const loadMetrics = async (forceRefresh: boolean = false) => {
    if (!userId) {
      console.warn('[AudienceGrowth] No user ID available');
      setLoading(false);
      return;
    }

    try {
      const toDate = new Date().toISOString().split('T')[0];
      const daysAgo = selectedPeriod === '7d' ? 7 : selectedPeriod === '30d' ? 30 : 90;
      const fromDateObj = new Date();
      fromDateObj.setDate(fromDateObj.getDate() - daysAgo);
      const fromDate = fromDateObj.toISOString().split('T')[0];

      const getMetrics = httpsCallable(functions, 'pack102_getMetrics');
      const result = await getMetrics({ userId, fromDate, toDate });
      
      setMetrics(result.data as AudienceGrowthMetrics);
    } catch (error) {
      console.error('[AudienceGrowth] Error loading metrics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMetrics(true);
  };

  const getPeriodLabel = (): string => {
    switch (selectedPeriod) {
      case '7d':
        return 'Last 7 days';
      case '30d':
        return 'Last 30 days';
      case '90d':
        return 'Last 90 days';
      default:
        return '';
    }
  };

  const calculateConversionRate = (numerator: number, denominator: number): string => {
    if (denominator === 0) return '0%';
    return `${((numerator / denominator) * 100).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading audience growth data...</Text>
      </View>
    );
  }

  if (!metrics) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Unable to load audience growth data</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => loadMetrics(true)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const platformData = Object.entries(metrics.platformBreakdown || {})
    .map(([platform, data]) => ({
      platform: platform as SocialPlatform,
      ...data,
    }))
    .sort((a, b) => b.visits - a.visits);

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Audience Growth</Text>
          <Text style={styles.headerSubtitle}>
            Track your external social media traffic
          </Text>
        </View>

        {/* Share Button */}
        <TouchableOpacity
          style={styles.shareButton}
          onPress={() => setShareModalVisible(true)}
        >
          <Text style={styles.shareButtonText}>📤 Share Your Profile</Text>
        </TouchableOpacity>

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {(['7d', '30d', '90d'] as const).map((period) => (
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
                {period === '7d' ? '7D' : period === '30d' ? '30D' : '90D'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Funnel Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Growth Funnel ({getPeriodLabel()})</Text>
          <View style={styles.funnelContainer}>
            <View style={styles.funnelRow}>
              <Text style={styles.funnelLabel}>👁️ Profile Visits</Text>
              <Text style={styles.funnelValue}>{metrics.visits.toLocaleString()}</Text>
            </View>
            <View style={styles.funnelArrow}>
              <Text style={styles.funnelArrowText}>↓</Text>
              <Text style={styles.conversionRate}>
                {calculateConversionRate(metrics.signups, metrics.visits)}
              </Text>
            </View>
            <View style={styles.funnelRow}>
              <Text style={styles.funnelLabel}>📝 Sign-ups</Text>
              <Text style={styles.funnelValue}>{metrics.signups.toLocaleString()}</Text>
            </View>
            <View style={styles.funnelArrow}>
              <Text style={styles.funnelArrowText}>↓</Text>
              <Text style={styles.conversionRate}>
                {calculateConversionRate(metrics.follows, metrics.signups)}
              </Text>
            </View>
            <View style={styles.funnelRow}>
              <Text style={styles.funnelLabel}>➕ Followers</Text>
              <Text style={styles.funnelValue}>{metrics.follows.toLocaleString()}</Text>
            </View>
            <View style={styles.funnelArrow}>
              <Text style={styles.funnelArrowText}>↓</Text>
              <Text style={styles.conversionRate}>
                {calculateConversionRate(metrics.firstPaidInteractions, metrics.follows)}
              </Text>
            </View>
            <View style={styles.funnelRow}>
              <Text style={styles.funnelLabel}>💰 First Paid</Text>
              <Text style={styles.funnelValue}>
                {metrics.firstPaidInteractions.toLocaleString()}
              </Text>
            </View>
          </View>
        </View>

        {/* Platform Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Traffic by Platform</Text>
          {platformData.length > 0 ? (
            platformData.map((data) => (
              <View key={data.platform} style={styles.platformRow}>
                <View style={styles.platformHeader}>
                  <View
                    style={[
                      styles.platformDot,
                      { backgroundColor: PLATFORM_COLORS[data.platform] },
                    ]}
                  />
                  <Text style={styles.platformName}>
                    {PLATFORM_NAMES[data.platform]}
                  </Text>
                </View>
                <View style={styles.platformMetrics}>
                  <View style={styles.platformMetric}>
                    <Text style={styles.platformMetricValue}>
                      {data.visits.toLocaleString()}
                    </Text>
                    <Text style={styles.platformMetricLabel}>visits</Text>
                  </View>
                  <View style={styles.platformMetric}>
                    <Text style={styles.platformMetricValue}>
                      {data.signups.toLocaleString()}
                    </Text>
                    <Text style={styles.platformMetricLabel}>signups</Text>
                  </View>
                  <View style={styles.platformMetric}>
                    <Text style={styles.platformMetricValue}>
                      {data.follows.toLocaleString()}
                    </Text>
                    <Text style={styles.platformMetricLabel}>follows</Text>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>
              No external traffic yet. Share your profile to start tracking!
            </Text>
          )}
        </View>

        {/* Info Notice */}
        <View style={styles.infoNotice}>
          <Text style={styles.infoNoticeTitle}>📊 Analytics Only</Text>
          <Text style={styles.infoNoticeText}>
            This dashboard tracks organic audience growth from your external social media presence.
            All users follow the same monetization rules - no bonuses or incentives for referrals.
          </Text>
        </View>
      </ScrollView>

      {/* Share Modal */}
      <ShareProfileModal
        visible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
      />
    </>
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
  shareButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
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
  funnelContainer: {
    paddingHorizontal: 8,
  },
  funnelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
  },
  funnelLabel: {
    fontSize: 16,
    color: '#000000',
  },
  funnelValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#007AFF',
  },
  funnelArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  funnelArrowText: {
    fontSize: 24,
    color: '#999999',
    marginRight: 8,
  },
  conversionRate: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '600',
  },
  platformRow: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
  },
  platformHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  platformDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  platformName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  platformMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  platformMetric: {
    alignItems: 'center',
  },
  platformMetricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#007AFF',
  },
  platformMetricLabel: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  infoNotice: {
    margin: 16,
    padding: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  infoNoticeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 8,
  },
  infoNoticeText: {
    fontSize: 14,
    color: '#424242',
    lineHeight: 20,
  },
});
