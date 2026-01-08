import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from "@/hooks/useAuth";
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

const { width } = Dimensions.get('window');

interface EarningSummary {
  todayTokens: number;
  weekTokens: number;
  monthTokens: number;
  pendingPayout: number;
  availableTokens: number;
  bestDay: number;
  bestWeek: number;
  bestMonth: number;
}

interface DashboardData {
  summary: EarningSummary;
  topSupporters: any[];
  recentEarnings: any[];
  analytics: any;
  tips: any[];
}

export default function CreatorEarningsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [progressAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (dashboardData?.summary) {
      animateProgress();
    }
  }, [dashboardData]);

  const loadDashboard = async () => {
    try {
      const getEarningsDashboard = httpsCallable(functions, 'getEarningsDashboard');
      const result = await getEarningsDashboard();
      setDashboardData(result.data as DashboardData);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const animateProgress = () => {
    Animated.spring(progressAnim, {
      toValue: 1,
      useNativeDriver: false,
      tension: 40,
      friction: 7,
    }).start();
  };

  const calculateProgress = (current: number, best: number): number => {
    if (best === 0) return 0;
    return Math.min((current / best) * 100, 100);
  };

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Animated.View style={{ transform: [{ scale: progressAnim }] }}>
          <Ionicons name="wallet" size={64} color="#6366F1" />
        </Animated.View>
        <Text style={styles.loadingText}>Loading your earnings...</Text>
      </View>
    );
  }

  if (!dashboardData) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color="#EF4444" />
        <Text style={styles.errorText}>Failed to load earnings data</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadDashboard}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { summary, topSupporters, recentEarnings, tips } = dashboardData;
  const todayProgress = calculateProgress(summary.todayTokens, summary.bestDay);
  const tokensToRecord = Math.max(0, summary.bestDay - summary.todayTokens);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header Section */}
      <LinearGradient
        colors={['#6366F1', '#8B5CF6', '#EC4899']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Creator Earnings</Text>
        <Text style={styles.headerSubtitle}>Track your success</Text>
      </LinearGradient>

      {/* Main KPIs */}
      <View style={styles.kpiContainer}>
        <View style={styles.kpiRow}>
          <KPICard
            icon="flash"
            label="Today's Tokens"
            value={formatTokens(summary.todayTokens)}
            color="#F59E0B"
          />
          <KPICard
            icon="trending-up"
            label="This Week"
            value={formatTokens(summary.weekTokens)}
            color="#10B981"
          />
        </View>
        <View style={styles.kpiRow}>
          <KPICard
            icon="calendar"
            label="This Month"
            value={formatTokens(summary.monthTokens)}
            color="#3B82F6"
          />
          <KPICard
            icon="wallet"
            label="Available"
            value={formatTokens(summary.availableTokens)}
            color="#8B5CF6"
          />
        </View>
      </View>

      {/* Gamified Progress */}
      {tokensToRecord > 0 && (
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Ionicons name="trophy" size={24} color="#F59E0B" />
            <Text style={styles.progressTitle}>
              {tokensToRecord} tokens to your best day!
            </Text>
          </View>
          <View style={styles.progressBarContainer}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', `${todayProgress}%`],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {todayProgress.toFixed(0)}% of your record
          </Text>
        </View>
      )}

      {/* Pending Payout Alert */}
      {summary.pendingPayout > 0 && (
        <TouchableOpacity
          style={styles.payoutAlert}
          onPress={() => router.push('/creator/earnings/payout-center' as any)}
        >
          <Ionicons name="time" size={24} color="#F59E0B" />
          <View style={styles.payoutAlertContent}>
            <Text style={styles.payoutAlertTitle}>Pending Payout</Text>
            <Text style={styles.payoutAlertAmount}>
              ${summary.pendingPayout.toFixed(2)} USD
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
        </TouchableOpacity>
      )}

      {/* Quick Actions */}
      <View style={styles.actionsContainer}>
        <ActionButton
          icon="card"
          label="Request Payout"
          onPress={() => router.push('/creator/earnings/payout-center')}
          color="#10B981"
        />
        <ActionButton
          icon="bar-chart"
          label="Analytics"
          onPress={() => router.push('/creator/earnings/analytics' as any)}
          color="#3B82F6"
        />
        <ActionButton
          icon="list"
          label="Income Breakdown"
          onPress={() => router.push('/creator/earnings/breakdown' as any)}
          color="#8B5CF6"
        />
      </View>

      {/* AI Earning Tips */}
      {tips && tips.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="bulb" size={24} color="#F59E0B" />
            <Text style={styles.sectionTitle}>AI Earning Tips</Text>
          </View>
          {tips.slice(0, 3).map((tip, index) => (
            <View key={index} style={styles.tipCard}>
              <View style={styles.tipIconContainer}>
                <Ionicons
                  name={getTipIcon(tip.type) as any}
                  size={20}
                  color="#6366F1"
                />
              </View>
              <Text style={styles.tipText}>{tip.message}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Top Supporters */}
      {topSupporters && topSupporters.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="people" size={24} color="#EC4899" />
            <Text style={styles.sectionTitle}>Top Supporters</Text>
          </View>
          {topSupporters.slice(0, 5).map((supporter, index) => (
            <View key={supporter.supporterId} style={styles.supporterCard}>
              <View style={styles.supporterRank}>
                <Text style={styles.supporterRankText}>#{index + 1}</Text>
              </View>
              <View style={styles.supporterInfo}>
                <Text style={styles.supporterName}>{supporter.username}</Text>
                <Text style={styles.supporterStats}>
                  {formatTokens(supporter.totalSpent)} tokens •{' '}
                  {supporter.transactionCount} purchases
                </Text>
              </View>
              <View style={styles.supporterBadge}>
                <Ionicons name="star" size={16} color="#F59E0B" />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Recent Transactions */}
      {recentEarnings && recentEarnings.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time" size={24} color="#6366F1" />
            <Text style={styles.sectionTitle}>Recent Earnings</Text>
            <TouchableOpacity
              onPress={() => router.push('/creator/earnings/history' as any)}
            >
              <Text style={styles.sectionLink}>See All</Text>
            </TouchableOpacity>
          </View>
          {recentEarnings.slice(0, 10).map((earning) => (
            <EarningRow key={earning.id} earning={earning} />
          ))}
        </View>
      )}

      {/* Bottom Padding */}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

interface KPICardProps {
  icon: string;
  label: string;
  value: string;
  color: string;
}

function KPICard({ icon, label, value, color }: KPICardProps) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={24} color={color} />
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

interface ActionButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  color: string;
}

function ActionButton({ icon, label, onPress, color }: ActionButtonProps) {
  return (
    <TouchableOpacity style={styles.actionButton} onPress={onPress}>
      <View style={[styles.actionIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={24} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

interface EarningRowProps {
  earning: any;
}

function EarningRow({ earning }: EarningRowProps) {
  const getSourceIcon = (source: string) => {
    const icons: Record<string, string> = {
      chat: 'chatbubbles',
      calls: 'call',
      events: 'ticket',
      fanClub: 'heart',
      live: 'videocam',
      digitalProducts: 'images',
      tips: 'gift',
    };
    return icons[source] || 'cash';
  };

  const formatDate = (timestamp: any) => {
    const date = timestamp.toDate();
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <View style={styles.earningRow}>
      <View style={styles.earningIcon}>
        <Ionicons name={getSourceIcon(earning.source) as any} size={20} color="#6366F1" />
      </View>
      <View style={styles.earningInfo}>
        <Text style={styles.earningFeature}>{earning.feature}</Text>
        <Text style={styles.earningTime}>{formatDate(earning.timestamp)}</Text>
      </View>
      <View style={styles.earningAmounts}>
        <Text style={styles.earningNet}>+{earning.netTokens} tokens</Text>
        <Text style={styles.earningGross}>{earning.grossTokens} gross</Text>
      </View>
    </View>
  );
}

function getTipIcon(type: string): string {
  const icons: Record<string, string> = {
    timing: 'time',
    audience: 'people',
    monetization: 'cash',
  };
  return icons[type] || 'information-circle';
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
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#6366F1',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 32,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    marginTop: 4,
  },
  kpiContainer: {
    padding: 16,
    marginTop: -20,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  kpiIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  kpiLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  progressCard: {
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
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 8,
    flex: 1,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#F59E0B',
  },
  progressText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  payoutAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
  },
  payoutAlertContent: {
    flex: 1,
    marginLeft: 12,
  },
  payoutAlertTitle: {
    fontSize: 14,
    color: '#92400E',
    fontWeight: '600',
  },
  payoutAlertAmount: {
    fontSize: 18,
    color: '#92400E',
    fontWeight: 'bold',
    marginTop: 2,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '600',
    textAlign: 'center',
  },
  section: {
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginLeft: 8,
    flex: 1,
  },
  sectionLink: {
    fontSize: 14,
    color: '#6366F1',
    fontWeight: '600',
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginBottom: 8,
  },
  tipIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  supporterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  supporterRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  supporterRankText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  supporterInfo: {
    flex: 1,
  },
  supporterName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  supporterStats: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  supporterBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  earningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  earningIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  earningInfo: {
    flex: 1,
  },
  earningFeature: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  earningTime: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  earningAmounts: {
    alignItems: 'flex-end',
  },
  earningNet: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#10B981',
  },
  earningGross: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
});
