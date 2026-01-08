/**
 * PACK 82 — Creator Performance Analytics & Insights Dashboard
 * Main analytics screen for creators
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { useCreatorAnalytics } from "@/hooks/useCreatorAnalytics";
import { useCreatorAnalyticsTimeseries } from "@/hooks/useCreatorAnalyticsTimeseries";
import {
  getSourceLabel,
  getSourceIcon,
  convertToChartData,
  formatLargeNumber,
} from "@/types/analytics";
import { formatTokens, formatDateRange, getTimeAgo } from "@/services/analyticsService";
import { SOURCE_TYPE_COLORS } from "@/types/earnings";

const { width } = Dimensions.get('window');

export default function CreatorAnalyticsScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const userId = (params.userId as string) || user?.uid;

  const {
    overview,
    isLoading: overviewLoading,
    error: overviewError,
    refresh: refreshOverview,
    lastUpdated,
  } = useCreatorAnalytics(userId);

  const {
    timeseries,
    isLoading: timeseriesLoading,
    error: timeseriesError,
    refresh: refreshTimeseries,
  } = useCreatorAnalyticsTimeseries(userId, 30);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshOverview(), refreshTimeseries()]);
    setRefreshing(false);
  };

  if (overviewLoading || timeseriesLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  if (overviewError || timeseriesError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Failed to load analytics</Text>
        <Text style={styles.errorMessage}>
          {overviewError?.message || timeseriesError?.message}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!overview || !timeseries) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Analytics Available</Text>
        <Text style={styles.emptyMessage}>
          Start earning to see your performance analytics
        </Text>
      </View>
    );
  }

  const chartData = convertToChartData(overview.earningsBySource);
  const topSource = overview.topEarningSource;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#8B5CF6']}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics & Insights</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Period Info */}
      <View style={styles.periodInfo}>
        <Text style={styles.periodText}>
          {formatDateRange(overview.periodStart, overview.periodEnd)}
        </Text>
        {lastUpdated && (
          <Text style={styles.lastUpdatedText}>
            Updated {getTimeAgo(lastUpdated)}
          </Text>
        )}
      </View>

      {/* KPI Cards */}
      <View style={styles.kpiSection}>
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, styles.kpiCardLarge]}>
            <Text style={styles.kpiLabel}>Total Earnings</Text>
            <Text style={styles.kpiValue}>
              {formatTokens(overview.totalEarnings)} 🪙
            </Text>
            <Text style={styles.kpiSubtext}>Last 30 days</Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Paying Users</Text>
            <Text style={styles.kpiValue}>
              {formatLargeNumber(overview.payingUsers)}
            </Text>
            <Text style={styles.kpiIcon}>👥</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Paid Actions</Text>
            <Text style={styles.kpiValue}>
              {formatLargeNumber(overview.paidInteractions)}
            </Text>
            <Text style={styles.kpiIcon}>⚡</Text>
          </View>
        </View>

        {topSource && (
          <View style={[styles.kpiCard, styles.kpiCardFull]}>
            <Text style={styles.kpiLabel}>Top Earning Source</Text>
            <View style={styles.topSourceRow}>
              <Text style={styles.topSourceIcon}>{getSourceIcon(topSource)}</Text>
              <Text style={styles.topSourceLabel}>{getSourceLabel(topSource)}</Text>
            </View>
            <Text style={styles.topSourceAmount}>
              {formatTokens(overview.earningsBySource[topSource] || 0)} tokens
            </Text>
          </View>
        )}
      </View>

      {/* Earnings Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Earnings Over Time</Text>
        <View style={styles.chartContainer}>
          <EarningsLineChart data={timeseries} />
        </View>
        
        {timeseries.summary && (
          <View style={styles.chartSummary}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Average Daily</Text>
              <Text style={styles.summaryValue}>
                {formatTokens(timeseries.summary.averageDaily)} 🪙
              </Text>
            </View>
            {timeseries.summary.peakDay && (
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Peak Day</Text>
                <Text style={styles.summaryValue}>
                  {formatTokens(timeseries.summary.peakDay.earnings)} 🪙
                </Text>
                <Text style={styles.summaryDate}>
                  {timeseries.summary.peakDay.date}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Breakdown by Source */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Earnings by Source</Text>
        <View style={styles.breakdownContainer}>
          {chartData.map((item) => (
            <View key={item.label} style={styles.breakdownItem}>
              <View style={styles.breakdownHeader}>
                <View style={styles.breakdownLabelRow}>
                  <Text style={styles.breakdownIcon}>{getSourceIcon(item.label as any)}</Text>
                  <Text style={styles.breakdownLabel}>{getSourceLabel(item.label as any)}</Text>
                </View>
                <Text style={styles.breakdownPercentage}>{item.percentage}%</Text>
              </View>
              <View style={styles.breakdownBarContainer}>
                <View
                  style={[
                    styles.breakdownBar,
                    { width: `${item.percentage}%`, backgroundColor: item.color },
                  ]}
                />
              </View>
              <Text style={styles.breakdownValue}>{formatTokens(item.value)} tokens</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Top Supporters */}
      {overview.topSupporters.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Supporters</Text>
          <View style={styles.supportersContainer}>
            {overview.topSupporters.map((supporter, index) => (
              <View key={supporter.userId} style={styles.supporterItem}>
                <View style={styles.supporterRank}>
                  <Text style={styles.supporterRankText}>#{index + 1}</Text>
                </View>
                <View style={styles.supporterInfo}>
                  <Text style={styles.supporterName}>{supporter.maskedName}</Text>
                  <Text style={styles.supporterActions}>
                    {supporter.paidActions} paid actions
                  </Text>
                </View>
                <Text style={styles.supporterTokens}>
                  {formatTokens(supporter.totalTokens)} 🪙
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Top Content */}
      {(overview.topStories.length > 0 ||
        overview.topPaidMedia.length > 0 ||
        overview.topGifts.length > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Earning Content</Text>
          
          {overview.topStories.length > 0 && (
            <TopContentSection
              title="Premium Stories"
              items={overview.topStories}
              icon="📖"
            />
          )}
          
          {overview.topPaidMedia.length > 0 && (
            <TopContentSection
              title="Paid Media"
              items={overview.topPaidMedia}
              icon="🔒"
            />
          )}
          
          {overview.topGifts.length > 0 && (
            <TopContentSection
              title="Gifts"
              items={overview.topGifts}
              icon="🎁"
            />
          )}
        </View>
      )}

      {/* Bottom Spacing */}
      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

function EarningsLineChart({ data }: { data: any }) {
  // Simple bar chart visualization
  const points = data.dataPoints || [];
  const maxValue = Math.max(...points.map((p: any) => p.totalNetTokens), 1);

  return (
    <View style={styles.lineChart}>
      <View style={styles.chartBars}>
        {points.map((point: any, index: number) => {
          const heightPercent = (point.totalNetTokens / maxValue) * 100;
          return (
            <View key={index} style={styles.barWrapper}>
              <View
                style={[
                  styles.bar,
                  {
                    height: `${heightPercent}%`,
                    backgroundColor: '#8B5CF6',
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.chartXAxis}>
        {points.map((point: any, index: number) => {
          // Show every 5th date
          if (index % 5 === 0 || index === points.length - 1) {
            const date = new Date(point.date);
            return (
              <Text key={index} style={styles.xAxisLabel}>
                {date.getDate()}/{date.getMonth() + 1}
              </Text>
            );
          }
          return <View key={index} style={styles.xAxisSpacer} />;
        })}
      </View>
    </View>
  );
}

function TopContentSection({
  title,
  items,
  icon,
}: {
  title: string;
  items: any[];
  icon: string;
}) {
  return (
    <View style={styles.topContentSection}>
      <View style={styles.topContentHeader}>
        <Text style={styles.topContentIcon}>{icon}</Text>
        <Text style={styles.topContentTitle}>{title}</Text>
      </View>
      {items.map((item, index) => (
        <View key={item.id} style={styles.topContentItem}>
          <Text style={styles.topContentRank}>#{index + 1}</Text>
          <View style={styles.topContentInfo}>
            {item.title && (
              <Text style={styles.topContentName} numberOfLines={1}>
                {item.title}
              </Text>
            )}
            {item.unlockCount && (
              <Text style={styles.topContentUnlocks}>
                {item.unlockCount} {item.unlockCount === 1 ? 'unlock' : 'unlocks'}
              </Text>
            )}
          </View>
          <Text style={styles.topContentEarnings}>
            {formatTokens(item.totalEarnings)} 🪙
          </Text>
        </View>
      ))}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorMessage: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptyMessage: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 24,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerRight: {
    width: 40,
  },
  periodInfo: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  periodText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  lastUpdatedText: {
    color: '#999',
    fontSize: 12,
  },
  kpiSection: {
    padding: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  kpiCardLarge: {
    backgroundColor: '#8B5CF6',
  },
  kpiCardFull: {
    marginBottom: 0,
  },
  kpiLabel: {
    color: '#999',
    fontSize: 12,
    marginBottom: 8,
  },
  kpiValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  kpiSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
  kpiIcon: {
    fontSize: 20,
    marginTop: 4,
  },
  topSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  topSourceIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  topSourceLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  topSourceAmount: {
    color: '#999',
    fontSize: 14,
  },
  section: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  chartContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  lineChart: {
    height: 200,
  },
  chartBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  barWrapper: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  chartXAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  xAxisLabel: {
    color: '#999',
    fontSize: 10,
  },
  xAxisSpacer: {
    flex: 1,
  },
  chartSummary: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
  },
  summaryLabel: {
    color: '#999',
    fontSize: 11,
    marginBottom: 4,
  },
  summaryValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  summaryDate: {
    color: '#999',
    fontSize: 10,
    marginTop: 2,
  },
  breakdownContainer: {
    gap: 16,
  },
  breakdownItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  breakdownLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakdownIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  breakdownLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  breakdownPercentage: {
    color: '#8B5CF6',
    fontSize: 16,
    fontWeight: 'bold',
  },
  breakdownBarContainer: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  breakdownBar: {
    height: '100%',
    borderRadius: 4,
  },
  breakdownValue: {
    color: '#999',
    fontSize: 12,
  },
  supportersContainer: {
    gap: 12,
  },
  supporterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  supporterRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  supporterRankText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  supporterInfo: {
    flex: 1,
  },
  supporterName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  supporterActions: {
    color: '#999',
    fontSize: 12,
  },
  supporterTokens: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: 'bold',
  },
  topContentSection: {
    marginBottom: 20,
  },
  topContentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  topContentIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  topContentTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  topContentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  topContentRank: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: 'bold',
    width: 24,
  },
  topContentInfo: {
    flex: 1,
  },
  topContentName: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 2,
  },
  topContentUnlocks: {
    color: '#999',
    fontSize: 11,
  },
  topContentEarnings: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomSpacing: {
    height: 40,
  },
});
