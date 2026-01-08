/**
 * Creator Analytics Screen
 * PACK 97 — Analytics dashboard for creators to track earnings and performance
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
// TODO: Install react-native-chart-kit for charts: npm install react-native-chart-kit react-native-svg
// import { LineChart } from 'react-native-chart-kit';
import { useCreatorAnalyticsState, useEarningsGrowth } from "@/hooks/useCreatorAnalytics";
import {
  formatTokens,
  formatDate,
  getContentTypeDisplayName,
} from "@/services/creatorAnalyticsService";

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 32;

export default function CreatorAnalyticsScreen() {
  const router = useRouter();
  const {
    timeframe,
    setTimeframe,
    summary,
    timeseries,
    topContent,
    loading,
    error,
    refetchAll,
  } = useCreatorAnalyticsState();

  const growth = useEarningsGrowth(timeseries);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetchAll();
    setRefreshing(false);
  };

  if (loading && !summary) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load analytics</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetchAll}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
        <Text style={styles.headerSubtitle}>
          Track your earnings and performance
        </Text>
      </View>

      {/* Top Summary Card */}
      {summary && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Available Balance</Text>
              <Text style={styles.summaryValue}>
                {formatTokens(summary.currentBalance.availableTokens)}
              </Text>
              <Text style={styles.summarySubtext}>tokens</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Last 30 Days</Text>
              <Text style={styles.summaryValue}>
                {formatTokens(summary.last30Days.tokensEarnedTotal)}
              </Text>
              {growth && (
                <View style={styles.trendContainer}>
                  <Text
                    style={[
                      styles.trendText,
                      growth.trend === 'up' && styles.trendUp,
                      growth.trend === 'down' && styles.trendDown,
                    ]}
                  >
                    {growth.trend === 'up' ? '↑' : growth.trend === 'down' ? '↓' : '→'}{' '}
                    {Math.abs(growth.percentageChange).toFixed(0)}%
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {summary.last30Days.uniquePayers}
              </Text>
              <Text style={styles.statLabel}>Unique Payers</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {summary.last30Days.daysWithEarnings}
              </Text>
              <Text style={styles.statLabel}>Active Days</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {formatTokens(summary.last30Days.averagePerDay)}
              </Text>
              <Text style={styles.statLabel}>Avg per Day</Text>
            </View>
          </View>
        </View>
      )}

      {/* Timeframe Selector */}
      <View style={styles.timeframeSelector}>
        <TouchableOpacity
          style={[
            styles.timeframeButton,
            timeframe === 7 && styles.timeframeButtonActive,
          ]}
          onPress={() => setTimeframe(7)}
        >
          <Text
            style={[
              styles.timeframeButtonText,
              timeframe === 7 && styles.timeframeButtonTextActive,
            ]}
          >
            7 Days
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.timeframeButton,
            timeframe === 30 && styles.timeframeButtonActive,
          ]}
          onPress={() => setTimeframe(30)}
        >
          <Text
            style={[
              styles.timeframeButtonText,
              timeframe === 30 && styles.timeframeButtonTextActive,
            ]}
          >
            30 Days
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.timeframeButton,
            timeframe === 90 && styles.timeframeButtonActive,
          ]}
          onPress={() => setTimeframe(90)}
        >
          <Text
            style={[
              styles.timeframeButtonText,
              timeframe === 90 && styles.timeframeButtonTextActive,
            ]}
          >
            90 Days
          </Text>
        </TouchableOpacity>
      </View>

      {/* Daily Chart - Simple bar visualization (upgrade to LineChart when react-native-chart-kit is installed) */}
      {timeseries && timeseries.points.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Earnings</Text>
          <View style={styles.simpleChart}>
            {timeseries.points.slice(-14).map((point, index) => {
              const maxValue = Math.max(...timeseries.points.map(p => p.tokensEarnedTotal));
              const height = maxValue > 0 ? (point.tokensEarnedTotal / maxValue) * 150 : 0;
              
              return (
                <View key={point.date} style={styles.chartBar}>
                  <View style={[styles.chartBarFill, { height }]} />
                  {index % 2 === 0 && (
                    <Text style={styles.chartLabel} numberOfLines={1}>
                      {formatDate(point.date)}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
          <Text style={styles.chartNote}>
            Last 14 days · Install react-native-chart-kit for advanced charts
          </Text>
        </View>
      )}

      {/* Earnings Breakdown */}
      {summary && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Earnings Breakdown</Text>
          <View style={styles.breakdownList}>
            <BreakdownItem
              label="Gifts"
              value={summary.lifetime.tokensFromGifts}
              color="#FF6B6B"
            />
            <BreakdownItem
              label="Paid Media"
              value={summary.lifetime.tokensFromPaidMedia}
              color="#4ECDC4"
            />
            <BreakdownItem
              label="Premium Stories"
              value={summary.lifetime.tokensFromStories}
              color="#45B7D1"
            />
            <BreakdownItem
              label="Voice/Video Calls"
              value={summary.lifetime.tokensFromCalls}
              color="#FFA07A"
            />
            <BreakdownItem
              label="AI Companions"
              value={summary.lifetime.tokensFromAI}
              color="#9B59B6"
            />
          </View>
        </View>
      )}

      {/* Top Performing Content */}
      {topContent && topContent.items.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Performing Content</Text>
          {topContent.items.map((item, index) => (
            <View key={`${item.contentType}_${item.contentId}`} style={styles.contentItem}>
              <View style={styles.contentRank}>
                <Text style={styles.contentRankText}>#{index + 1}</Text>
              </View>
              <View style={styles.contentInfo}>
                <Text style={styles.contentType}>
                  {getContentTypeDisplayName(item.contentType)}
                </Text>
                {item.title && (
                  <Text style={styles.contentTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                )}
                <Text style={styles.contentStats}>
                  {formatTokens(item.tokensEarned)} tokens · {item.unlocksCount}{' '}
                  unlocks
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Lifetime Stats */}
      {summary && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lifetime Stats</Text>
          <View style={styles.lifetimeCard}>
            <View style={styles.lifetimeItem}>
              <Text style={styles.lifetimeLabel}>Total Earned</Text>
              <Text style={styles.lifetimeValue}>
                {formatTokens(summary.currentBalance.lifetimeEarned)}
              </Text>
            </View>
            <View style={styles.lifetimeItem}>
              <Text style={styles.lifetimeLabel}>Available</Text>
              <Text style={styles.lifetimeValue}>
                {formatTokens(summary.currentBalance.availableTokens)}
              </Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Analytics are updated daily. All earnings shown are net amounts after
          Avalo's commission.
        </Text>
      </View>
    </ScrollView>
  );
}

// Helper component for breakdown items
function BreakdownItem({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.breakdownItem}>
      <View style={styles.breakdownLabelContainer}>
        <View style={[styles.breakdownDot, { backgroundColor: color }]} />
        <Text style={styles.breakdownLabel}>{label}</Text>
      </View>
      <Text style={styles.breakdownValue}>{formatTokens(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F8F9FA',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
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
    borderBottomColor: '#E5E5E5',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#666',
  },
  summaryCard: {
    margin: 16,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
  },
  summarySubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E5E5E5',
    marginHorizontal: 16,
  },
  trendContainer: {
    marginTop: 4,
  },
  trendText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  trendUp: {
    color: '#34C759',
  },
  trendDown: {
    color: '#FF3B30',
  },
  statsRow: {
    flexDirection: 'row',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  timeframeSelector: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
  },
  timeframeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  timeframeButtonActive: {
    backgroundColor: '#007AFF',
  },
  timeframeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  timeframeButtonTextActive: {
    color: '#FFFFFF',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16,
  },
  simpleChart: {
    flexDirection: 'row',
    height: 150,
    alignItems: 'flex-end',
    gap: 4,
    marginVertical: 16,
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
  },
  chartBarFill: {
    width: '100%',
    backgroundColor: '#007AFF',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    minHeight: 2,
  },
  chartLabel: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  chartNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  breakdownList: {
    gap: 12,
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  breakdownLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakdownDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  breakdownLabel: {
    fontSize: 16,
    color: '#333',
  },
  breakdownValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  contentItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  contentRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contentRankText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  contentInfo: {
    flex: 1,
  },
  contentType: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
    marginBottom: 4,
  },
  contentTitle: {
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
    marginBottom: 4,
  },
  contentStats: {
    fontSize: 14,
    color: '#666',
  },
  lifetimeCard: {
    flexDirection: 'row',
    gap: 16,
  },
  lifetimeItem: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
  },
  lifetimeLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  lifetimeValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  footer: {
    padding: 20,
    marginBottom: 40,
  },
  footerText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
});
