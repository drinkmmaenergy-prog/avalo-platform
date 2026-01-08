/**
 * PACK 243: Creator Ego Metrics Dashboard
 * Main dashboard screen for creator analytics and motivation
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, doc, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
import { db, auth } from "@/lib/firebase";
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface DashboardData {
  profileViews: number;
  profileViewsChange: number;
  swipeInterest: number;
  swipeInterestChange: number;
  chatRequests: number;
  chatRequestsChange: number;
  missedEarnings: number;
  topPayingAgeRange: string;
  topCountries: string[];
  tokenEarnings: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  meetingConversion: number;
  eventPopularity: number;
  retentionPercentile: number;
  topCreatorBadge: boolean;
  lastUpdated: any;
}

interface Nudge {
  id: string;
  type: string;
  message: string;
  priority: number;
  actionable: boolean;
  suggestedAction?: string;
  dismissed: boolean;
}

interface Suggestion {
  id: string;
  type: string;
  title: string;
  description: string;
  expectedImpact: string;
  actionType: string;
  priority: number;
  active: boolean;
}

export default function CreatorDashboard() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  useEffect(() => {
    if (!auth.currentUser) return;

    const userId = auth.currentUser.uid;

    // Subscribe to dashboard updates
    const dashboardUnsubscribe = onSnapshot(
      doc(db, 'creatorDashboard', userId),
      (snapshot) => {
        if (snapshot.exists()) {
          setDashboard(snapshot.data() as DashboardData);
        }
        setLoading(false);
        setRefreshing(false);
      }
    );

    // Subscribe to active nudges
    const nudgesUnsubscribe = onSnapshot(
      query(
        collection(db, 'creatorDashboard', userId, 'motivationalNudges'),
        where('dismissed', '==', false),
        orderBy('priority', 'desc'),
        limit(5)
      ),
      (snapshot) => {
        const nudgesData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Nudge[];
        setNudges(nudgesData);
      }
    );

    // Subscribe to active suggestions
    const suggestionsUnsubscribe = onSnapshot(
      query(
        collection(db, 'creatorDashboard', userId, 'actionSuggestions'),
        where('active', '==', true),
        orderBy('priority', 'desc'),
        limit(5)
      ),
      (snapshot) => {
        const suggestionsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Suggestion[];
        setSuggestions(suggestionsData);
      }
    );

    return () => {
      dashboardUnsubscribe();
      nudgesUnsubscribe();
      suggestionsUnsubscribe();
    };
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    // Trigger manual dashboard calculation
    // This would call the Cloud Function
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return '#4CAF50';
    if (change < 0) return '#F44336';
    return '#9E9E9E';
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return 'trending-up';
    if (change < 0) return 'trending-down';
    return 'remove';
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getPercentileMessage = (percentile: number) => {
    if (percentile <= 1) return 'Top 1% Elite Creator 🏆';
    if (percentile <= 5) return 'Top 5% Rising Star ⭐';
    if (percentile <= 10) return 'Top 10% High Performer 🚀';
    if (percentile <= 25) return 'Top 25% Strong Creator 💪';
    return `Top ${Math.round(percentile)}% Creator`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading your metrics...</Text>
      </View>
    );
  }

  if (!dashboard) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="analytics-outline" size={64} color="#666" />
        <Text style={styles.emptyText}>No dashboard data yet</Text>
        <Text style={styles.emptySubtext}>Data will appear after 24 hours</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {/* Header with Ranking */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Creator Dashboard</Text>
        <View style={styles.rankingContainer}>
          <Text style={styles.rankingText}>{getPercentileMessage(dashboard.retentionPercentile)}</Text>
          <Text style={styles.rankingSubtext}>
            You're earning more than {100 - dashboard.retentionPercentile}% of creators
          </Text>
        </View>
        {dashboard.topCreatorBadge && (
          <View style={styles.badge}>
            <Ionicons name="trophy" size={20} color="#FFD700" />
            <Text style={styles.badgeText}>Top 1% Creator</Text>
          </View>
        )}
      </View>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {(['daily', 'weekly', 'monthly'] as const).map((period) => (
          <TouchableOpacity
            key={period}
            style={[styles.periodButton, selectedPeriod === period && styles.periodButtonActive]}
            onPress={() => setSelectedPeriod(period)}
          >
            <Text
              style={[
                styles.periodButtonText,
                selectedPeriod === period && styles.periodButtonTextActive,
              ]}
            >
              {period.charAt(0).toUpperCase() + period.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Earnings Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Token Earnings</Text>
        <Text style={styles.earningsAmount}>
          {formatNumber(dashboard.tokenEarnings[selectedPeriod])} Tokens
        </Text>
        <Text style={styles.earningsSubtext}>
          ~${(dashboard.tokenEarnings[selectedPeriod] * 0.1).toFixed(2)} USD (65% split)
        </Text>
      </View>

      {/* Metrics Grid */}
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Ionicons name="eye-outline" size={24} color="#6366F1" />
            <Text style={styles.metricValue}>{formatNumber(dashboard.profileViews)}</Text>
          </View>
          <Text style={styles.metricLabel}>Profile Views</Text>
          <View style={styles.changeContainer}>
            <Ionicons
              name={getChangeIcon(dashboard.profileViewsChange)}
              size={16}
              color={getChangeColor(dashboard.profileViewsChange)}
            />
            <Text style={[styles.changeText, { color: getChangeColor(dashboard.profileViewsChange) }]}>
              {dashboard.profileViewsChange > 0 ? '+' : ''}
              {dashboard.profileViewsChange.toFixed(1)}%
            </Text>
          </View>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Ionicons name="heart-outline" size={24} color="#EC4899" />
            <Text style={styles.metricValue}>{formatNumber(dashboard.swipeInterest)}</Text>
          </View>
          <Text style={styles.metricLabel}>Swipe Interest</Text>
          <View style={styles.changeContainer}>
            <Ionicons
              name={getChangeIcon(dashboard.swipeInterestChange)}
              size={16}
              color={getChangeColor(dashboard.swipeInterestChange)}
            />
            <Text style={[styles.changeText, { color: getChangeColor(dashboard.swipeInterestChange) }]}>
              {dashboard.swipeInterestChange > 0 ? '+' : ''}
              {dashboard.swipeInterestChange.toFixed(1)}%
            </Text>
          </View>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Ionicons name="chatbubble-outline" size={24} color="#10B981" />
            <Text style={styles.metricValue}>{formatNumber(dashboard.chatRequests)}</Text>
          </View>
          <Text style={styles.metricLabel}>Chat Requests</Text>
          <View style={styles.changeContainer}>
            <Ionicons
              name={getChangeIcon(dashboard.chatRequestsChange)}
              size={16}
              color={getChangeColor(dashboard.chatRequestsChange)}
            />
            <Text style={[styles.changeText, { color: getChangeColor(dashboard.chatRequestsChange) }]}>
              {dashboard.chatRequestsChange > 0 ? '+' : ''}
              {dashboard.chatRequestsChange.toFixed(1)}%
            </Text>
          </View>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Ionicons name="calendar-outline" size={24} color="#F59E0B" />
            <Text style={styles.metricValue}>{dashboard.meetingConversion.toFixed(1)}%</Text>
          </View>
          <Text style={styles.metricLabel}>Meeting Rate</Text>
          <Text style={styles.metricSubtext}>Chat → Booking</Text>
        </View>
      </View>

      {/* Audience Insights */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Audience</Text>
        <View style={styles.audienceRow}>
          <View style={styles.audienceItem}>
            <Text style={styles.audienceLabel}>Top Age Group</Text>
            <Text style={styles.audienceValue}>{dashboard.topPayingAgeRange}</Text>
          </View>
          <View style={styles.audienceItem}>
            <Text style={styles.audienceLabel}>Top Countries</Text>
            <Text style={styles.audienceValue}>{dashboard.topCountries.slice(0, 3).join(', ')}</Text>
          </View>
        </View>
        {dashboard.missedEarnings > 0 && (
          <View style={styles.missedEarningsContainer}>
            <Ionicons name="alert-circle-outline" size={20} color="#F59E0B" />
            <Text style={styles.missedEarningsText}>
              {dashboard.missedEarnings} users couldn't afford your price
            </Text>
          </View>
        )}
      </View>

      {/* Motivational Nudges */}
      {nudges.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 Boost Your Success</Text>
          {nudges.map((nudge) => (
            <View key={nudge.id} style={styles.nudgeCard}>
              <Text style={styles.nudgeMessage}>{nudge.message}</Text>
              {nudge.actionable && nudge.suggestedAction && (
                <TouchableOpacity style={styles.nudgeAction}>
                  <Text style={styles.nudgeActionText}>{nudge.suggestedAction}</Text>
                  <Ionicons name="arrow-forward" size={16} color="#6366F1" />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Action Suggestions */}
      {suggestions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💡 Recommended Actions</Text>
          {suggestions.map((suggestion) => (
            <TouchableOpacity key={suggestion.id} style={styles.suggestionCard}>
              <View style={styles.suggestionHeader}>
                <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                <Ionicons name="chevron-forward" size={20} color="#666" />
              </View>
              <Text style={styles.suggestionDescription}>{suggestion.description}</Text>
              <View style={styles.suggestionImpact}>
                <Ionicons name="trending-up" size={16} color="#10B981" />
                <Text style={styles.suggestionImpactText}>{suggestion.expectedImpact}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Last updated: {dashboard.lastUpdated?.toDate?.()?.toLocaleString() || 'Just now'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 32,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  header: {
    padding: 24,
    paddingTop: 48,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: '#6366F1',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 16,
  },
  rankingContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  rankingText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  rankingSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
    marginLeft: 6,
  },
  periodSelector: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  periodButtonActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  periodButtonTextActive: {
    color: '#FFF',
  },
  card: {
    backgroundColor: '#FFF',
    margin: 16,
    marginTop: 0,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  earningsAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#6366F1',
    marginBottom: 4,
  },
  earningsSubtext: {
    fontSize: 14,
    color: '#666',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    gap: 8,
  },
  metricCard: {
    backgroundColor: '#FFF',
    width: (width - 40) / 2,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  metricSubtext: {
    fontSize: 10,
    color: '#999',
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  audienceRow: {
    flexDirection: 'row',
    gap: 16,
  },
  audienceItem: {
    flex: 1,
  },
  audienceLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  audienceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  missedEarningsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  missedEarningsText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  nudgeCard: {
    backgroundColor: '#EEF2FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#6366F1',
  },
  nudgeMessage: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 8,
  },
  nudgeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nudgeActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
  },
  suggestionCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  suggestionDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  suggestionImpact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  suggestionImpactText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  footer: {
    padding: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
});
