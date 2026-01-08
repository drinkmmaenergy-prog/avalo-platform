/**
 * PACK 303 — Creator Earnings Dashboard (Mobile)
 * 
 * Displays earnings summary, breakdown, and timeline for creators
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

// Types
interface EarningsSummary {
  currentMonthTokens: number;
  availableForPayout: number;
  totalPayoutsLifetime: number;
  currency: string;
}

interface EarningsSourceBreakdown {
  source: string;
  tokensEarned: number;
  tokensRefunded: number;
  tokensCreatorShare: number;
}

interface EarningsBreakdown {
  year: number;
  month: number;
  bySource: EarningsSourceBreakdown[];
  totalNetTokens: number;
  totalCreatorShare: number;
}

interface EarningsTimelinePoint {
  date: string;
  tokensNetEarned: number;
}

const screenWidth = Dimensions.get('window').width;

export default function EarningsDashboard() {
  const router = useRouter();
  const auth = getAuth();
  const functions = getFunctions();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [breakdown, setBreakdown] = useState<EarningsBreakdown | null>(null);
  const [timeline, setTimeline] = useState<EarningsTimelinePoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadDashboardData = async () => {
    try {
      setError(null);
      const getDashboard = httpsCallable(functions, 'pack303_getEarningsDashboard');
      const response: any = await getDashboard({});

      if (response.data.success) {
        setSummary(response.data.summary);
        setBreakdown(response.data.breakdown);
        setTimeline(response.data.timeline || []);
      } else {
        setError(response.data.error || 'Failed to load earnings data');
      }
    } catch (err: any) {
      console.error('Error loading dashboard:', err);
      setError(err.message || 'Failed to load earnings dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  const formatTokens = (tokens: number): string => {
    return tokens.toLocaleString('en-US');
  };

  const formatCurrency = (amount: number, currency: string): string => {
    return `${amount.toFixed(2)} ${currency}`;
  };

  const getSourceColor = (source: string): string => {
    const colors: Record<string, string> = {
      CHAT: '#8b5cf6',
      CALLS: '#3b82f6',
      CALENDAR: '#10b981',
      EVENTS: '#f59e0b',
      OTHER: '#6b7280',
    };
    return colors[source] || '#6b7280';
  };

  const getSourceIcon = (source: string): any => {
    const icons: Record<string, any> = {
      CHAT: 'chatbubble',
      CALLS: 'call',
      CALENDAR: 'calendar',
      EVENTS: 'ticket',
      OTHER: 'ellipsis-horizontal',
    };
    return icons[source] || 'ellipsis-horizontal';
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading earnings data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={48} color="#ef4444" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadDashboardData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6366f1']} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Creator Earnings</Text>
        <TouchableOpacity onPress={() => router.push('/profile/earnings-history' as any)}>
          <Ionicons name="document-text-outline" size={24} color="#111" />
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      {summary && (
        <View style={styles.summarySection}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryCardIcon}>
              <Ionicons name="calendar-outline" size={24} color="#6366f1" />
            </View>
            <Text style={styles.summaryCardLabel}>This Month</Text>
            <Text style={styles.summaryCardValue}>{formatTokens(summary.currentMonthTokens)}</Text>
            <Text style={styles.summaryCardUnit}>tokens</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryCardIcon}>
              <Ionicons name="wallet-outline" size={24} color="#10b981" />
            </View>
            <Text style={styles.summaryCardLabel}>Available</Text>
            <Text style={styles.summaryCardValue}>{formatTokens(summary.availableForPayout)}</Text>
            <Text style={styles.summaryCardUnit}>tokens</Text>
          </View>

          <View style={[styles.summaryCard, styles.summaryCardFull]}>
            <View style={styles.summaryCardIcon}>
              <Ionicons name="cash-outline" size={24} color="#f59e0b" />
            </View>
            <Text style={styles.summaryCardLabel}>Total Payouts (Lifetime)</Text>
            <Text style={styles.summaryCardValue}>
              {formatCurrency(summary.totalPayoutsLifetime, summary.currency)}
            </Text>
          </View>
        </View>
      )}

      {/* Payout Button */}
      <TouchableOpacity
        style={styles.payoutButton}
        onPress={() => router.push('/profile/request-payout' as any)}
      >
        <Ionicons name="cash" size={20} color="#fff" />
        <Text style={styles.payoutButtonText}>Request Payout</Text>
      </TouchableOpacity>

      {/* Earnings by Source */}
      {breakdown && breakdown.bySource && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Earnings by Source</Text>
          <Text style={styles.sectionSubtitle}>
            {new Date(breakdown.year, breakdown.month - 1).toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            })}
          </Text>

          {breakdown.bySource
            .filter(source => source.tokensEarned > 0)
            .map((source, index) => (
              <View key={index} style={styles.sourceCard}>
                <View style={styles.sourceHeader}>
                  <View style={styles.sourceIcon}>
                    <Ionicons
                      name={getSourceIcon(source.source)}
                      size={20}
                      color={getSourceColor(source.source)}
                    />
                  </View>
                  <Text style={styles.sourceName}>{source.source}</Text>
                </View>

                <View style={styles.sourceStats}>
                  <View style={styles.sourceStat}>
                    <Text style={styles.sourceStatLabel}>Earned</Text>
                    <Text style={styles.sourceStatValue}>{formatTokens(source.tokensEarned)}</Text>
                  </View>

                  {source.tokensRefunded > 0 && (
                    <View style={styles.sourceStat}>
                      <Text style={styles.sourceStatLabel}>Refunded</Text>
                      <Text style={[styles.sourceStatValue, styles.refundedText]}>
                        -{formatTokens(source.tokensRefunded)}
                      </Text>
                    </View>
                  )}

                  <View style={styles.sourceStat}>
                    <Text style={styles.sourceStatLabel}>Your Share</Text>
                    <Text style={[styles.sourceStatValue, styles.yourShareText]}>
                      {formatTokens(source.tokensCreatorShare)}
                    </Text>
                  </View>
                </View>

                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${(source.tokensCreatorShare / breakdown.totalCreatorShare) * 100}%`,
                        backgroundColor: getSourceColor(source.source),
                      },
                    ]}
                  />
                </View>
              </View>
            ))}

          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total Creator Share</Text>
            <Text style={styles.totalValue}>{formatTokens(breakdown.totalCreatorShare)} tokens</Text>
          </View>
        </View>
      )}

      {/* Timeline - Simple List View */}
      {timeline && timeline.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Earnings</Text>
          <Text style={styles.sectionSubtitle}>Last 7 days</Text>

          <View style={styles.timelineContainer}>
            {timeline.slice(-7).reverse().map((point, index) => {
              const date = new Date(point.date);
              return (
                <View key={index} style={styles.timelineItem}>
                  <View style={styles.timelineDate}>
                    <Text style={styles.timelineDateDay}>{date.getDate()}</Text>
                    <Text style={styles.timelineDateMonth}>
                      {date.toLocaleDateString('en-US', { month: 'short' })}
                    </Text>
                  </View>
                  <View style={styles.timelineBar}>
                    <View
                      style={[
                        styles.timelineBarFill,
                        {
                          width: `${Math.min((point.tokensNetEarned / Math.max(...timeline.map(p => p.tokensNetEarned))) * 100, 100)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.timelineValue}>{formatTokens(point.tokensNetEarned)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* View Statements Button */}
      <TouchableOpacity
        style={styles.statementsButton}
        onPress={() => router.push('/profile/earnings-statements' as any)}
      >
        <Ionicons name="document-text" size={20} color="#6366f1" />
        <Text style={styles.statementsButtonText}>View Monthly Statements</Text>
        <Ionicons name="chevron-forward" size={20} color="#6366f1" />
      </TouchableOpacity>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#6366f1',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  summarySection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryCardFull: {
    width: '100%',
  },
  summaryCardIcon: {
    marginBottom: 8,
  },
  summaryCardLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  summaryCardValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
  },
  summaryCardUnit: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  payoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    gap: 8,
  },
  payoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  sourceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  sourceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sourceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  sourceStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sourceStat: {
    flex: 1,
  },
  sourceStatLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  sourceStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  refundedText: {
    color: '#ef4444',
  },
  yourShareText: {
    color: '#10b981',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  totalCard: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: '#e0e7ff',
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  timelineContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  timelineDate: {
    width: 50,
    alignItems: 'center',
  },
  timelineDateDay: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  timelineDateMonth: {
    fontSize: 12,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  timelineBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  timelineBarFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 4,
  },
  timelineValue: {
    width: 80,
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    textAlign: 'right',
  },
  statementsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  statementsButtonText: {
    flex: 1,
    marginLeft: 8,
    color: '#6366f1',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 32,
  },
});
