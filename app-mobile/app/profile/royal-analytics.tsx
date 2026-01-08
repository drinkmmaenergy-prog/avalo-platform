/**
 * PACK 253 — Royal Analytics Dashboard
 * Deep revenue dashboard for Royal creators
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Stack } from 'expo-router';

interface RoyalAnalyticsData {
  chatRevenue: number;
  callRevenue: number;
  storyRevenue: number;
  albumRevenue: number;
  digitalProductRevenue: number;
  totalRevenue: number;
  uniquePayers: number;
  repeatPayers: number;
  averageTransactionSize: number;
  peakEarningHour: number;
  peakEarningDay: number;
  royalEarningsBonus: number;
  customPricingRevenue: number;
  priorityInboxConversions: number;
  returningPayerRate: number;
  averagePayerLifetimeValue: number;
}

export default function RoyalAnalyticsScreen() {
  const [analytics, setAnalytics] = useState<RoyalAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const functions = getFunctions();
      const getRoyalAnalytics = httpsCallable(functions, 'getRoyalAnalytics');
      const result = await getRoyalAnalytics({});
      setAnalytics(result.data as RoyalAnalyticsData);
    } catch (error) {
      console.error('Error loading Royal analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAnalytics();
    setRefreshing(false);
  };

  if (loading && !analytics) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  if (!analytics) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="chart-box-outline" size={64} color="#64748B" />
        <Text style={styles.emptyText}>No analytics data available</Text>
      </View>
    );
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Royal Analytics',
          headerStyle: { backgroundColor: '#0F172A' },
          headerTintColor: '#FFD700',
        }}
      />

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFD700" />
        }
      >
        {/* Total Revenue Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="currency-usd" size={24} color="#FFD700" />
            <Text style={styles.cardTitle}>Total Revenue (Last 30 Days)</Text>
          </View>
          <Text style={styles.totalRevenue}>{analytics.totalRevenue.toLocaleString()} tokens</Text>
          <View style={styles.royalBonus}>
            <MaterialCommunityIcons name="crown" size={16} color="#10B981" />
            <Text style={styles.bonusText}>
              +{analytics.royalEarningsBonus.toLocaleString()} from Royal boost
            </Text>
          </View>
        </View>

        {/* Revenue Breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Revenue Breakdown</Text>
          <View style={styles.breakdown}>
            <RevenueItem
              icon="chat"
              label="Chat Messages"
              amount={analytics.chatRevenue}
              total={analytics.totalRevenue}
            />
            <RevenueItem
              icon="phone"
              label="Voice/Video Calls"
              amount={analytics.callRevenue}
              total={analytics.totalRevenue}
            />
            <RevenueItem
              icon="book-open-variant"
              label="Stories"
              amount={analytics.storyRevenue}
              total={analytics.totalRevenue}
            />
            <RevenueItem
              icon="image-multiple"
              label="Albums"
              amount={analytics.albumRevenue}
              total={analytics.totalRevenue}
            />
            <RevenueItem
              icon="package-variant"
              label="Digital Products"
              amount={analytics.digitalProductRevenue}
              total={analytics.totalRevenue}
            />
          </View>
        </View>

        {/* Payer Insights */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payer Insights</Text>
          <View style={styles.statsGrid}>
            <StatBox
              icon="account-multiple"
              label="Unique Payers"
              value={analytics.uniquePayers.toString()}
            />
            <StatBox
              icon="account-heart"
              label="Repeat Payers"
              value={analytics.repeatPayers.toString()}
            />
            <StatBox
              icon="cash"
              label="Avg Transaction"
              value={`${Math.round(analytics.averageTransactionSize)} tokens`}
            />
            <StatBox
              icon="percent"
              label="Return Rate"
              value={`${Math.round(analytics.returningPayerRate)}%`}
            />
          </View>
        </View>

        {/* Peak Performance */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Peak Performance</Text>
          <View style={styles.peakStats}>
            <View style={styles.peakItem}>
              <MaterialCommunityIcons name="clock-outline" size={20} color="#FFD700" />
              <Text style={styles.peakLabel}>Best Hour</Text>
              <Text style={styles.peakValue}>
                {analytics.peakEarningHour}:00 - {analytics.peakEarningHour + 1}:00
              </Text>
            </View>
            <View style={styles.peakItem}>
              <MaterialCommunityIcons name="calendar" size={20} color="#FFD700" />
              <Text style={styles.peakLabel}>Best Day</Text>
              <Text style={styles.peakValue}>{dayNames[analytics.peakEarningDay]}</Text>
            </View>
          </View>
        </View>

        {/* Royal Benefits Impact */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="crown" size={24} color="#FFD700" />
            <Text style={styles.cardTitle}>Royal Benefits Impact</Text>
          </View>
          <View style={styles.benefitsImpact}>
            <BenefitImpact
              icon="chart-line-variant"
              label="7-Word Earnings Boost"
              value={`+${analytics.royalEarningsBonus.toLocaleString()} tokens`}
              description="Extra earnings from improved word-to-token ratio"
            />
            <BenefitImpact
              icon="currency-usd-circle"
              label="Custom Pricing Revenue"
              value={`${analytics.customPricingRevenue.toLocaleString()} tokens`}
              description="Earnings from custom chat pricing"
            />
            <BenefitImpact
              icon="inbox-arrow-down"
              label="Priority Inbox Conversions"
              value={analytics.priorityInboxConversions.toString()}
              description="New chats from priority placement"
            />
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

interface RevenueItemProps {
  icon: string;
  label: string;
  amount: number;
  total: number;
}

function RevenueItem({ icon, label, amount, total }: RevenueItemProps) {
  const percentage = total > 0 ? (amount / total) * 100 : 0;

  return (
    <View style={styles.revenueItem}>
      <View style={styles.revenueItemHeader}>
        <MaterialCommunityIcons name={icon as any} size={20} color="#94A3B8" />
        <Text style={styles.revenueItemLabel}>{label}</Text>
        <Text style={styles.revenueItemAmount}>{amount.toLocaleString()}</Text>
      </View>
      <View style={styles.revenueItemBar}>
        <View style={[styles.revenueItemBarFill, { width: `${percentage}%` }]} />
      </View>
      <Text style={styles.revenueItemPercentage}>{percentage.toFixed(1)}%</Text>
    </View>
  );
}

interface StatBoxProps {
  icon: string;
  label: string;
  value: string;
}

function StatBox({ icon, label, value }: StatBoxProps) {
  return (
    <View style={styles.statBox}>
      <MaterialCommunityIcons name={icon as any} size={24} color="#FFD700" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface BenefitImpactProps {
  icon: string;
  label: string;
  value: string;
  description: string;
}

function BenefitImpact({ icon, label, value, description }: BenefitImpactProps) {
  return (
    <View style={styles.benefitItem}>
      <View style={styles.benefitHeader}>
        <MaterialCommunityIcons name={icon as any} size={20} color="#10B981" />
        <Text style={styles.benefitLabel}>{label}</Text>
      </View>
      <Text style={styles.benefitValue}>{value}</Text>
      <Text style={styles.benefitDescription}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 16,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    marginBottom: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F1F5F9',
    marginLeft: 8,
  },
  totalRevenue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 8,
  },
  royalBonus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bonusText: {
    fontSize: 14,
    color: '#10B981',
    marginLeft: 6,
  },
  breakdown: {
    marginTop: 12,
    gap: 16,
  },
  revenueItem: {
    gap: 8,
  },
  revenueItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  revenueItemLabel: {
    fontSize: 14,
    color: '#94A3B8',
    marginLeft: 8,
    flex: 1,
  },
  revenueItemAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  revenueItemBar: {
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
  },
  revenueItemBarFill: {
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 3,
  },
  revenueItemPercentage: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'right',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  peakStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  peakItem: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  peakLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 8,
  },
  peakValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F1F5F9',
    marginTop: 4,
  },
  benefitsImpact: {
    marginTop: 12,
    gap: 12,
  },
  benefitItem: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
  },
  benefitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  benefitLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F1F5F9',
    marginLeft: 8,
  },
  benefitValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 4,
  },
  benefitDescription: {
    fontSize: 12,
    color: '#94A3B8',
  },
  bottomPadding: {
    height: 32,
  },
});
