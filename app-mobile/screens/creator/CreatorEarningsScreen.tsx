/**
 * PACK 52: Creator Earnings Dashboard
 * 
 * Shows earnings analytics for creators who earn from chat.
 * Includes total earnings, breakdown by channel, and recent activity.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../lib/firebase';
import {
  fetchCreatorEarningsSummary,
  refreshCreatorEarningsSummary,
  fetchCreatorEarningsEvents,
  CreatorEarningsSummary,
  CreatorEarningsEvent,
} from '../../services/creatorService';

// ============================================================================
// EARNINGS EVENT CARD COMPONENT
// ============================================================================

interface EventCardProps {
  event: CreatorEarningsEvent;
}

const EventCard: React.FC<EventCardProps> = ({ event }) => {
  const { t } = useTranslation();

  const getEventIcon = () => {
    switch (event.type) {
      case 'CHAT_MESSAGE':
        return 'chatbubble';
      case 'BOOST':
        return 'rocket';
      case 'PAID_MEDIA':
        return 'image';
      case 'AI_COMPANION':
        return 'sparkles';
      default:
        return 'cash';
    }
  };

  const getEventLabel = () => {
    switch (event.type) {
      case 'CHAT_MESSAGE':
        return t('creator.earnings.chatMessage');
      case 'BOOST':
        return t('creator.earnings.boost');
      case 'PAID_MEDIA':
        return t('creator.earnings.paidMedia');
      case 'AI_COMPANION':
        return t('creator.earnings.aiCompanion');
      default:
        return event.type;
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
      return date.toLocaleDateString();
    } else if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  };

  return (
    <View style={styles.eventCard}>
      <View style={styles.eventIconContainer}>
        <Ionicons name={getEventIcon()} size={20} color="#007AFF" />
      </View>
      <View style={styles.eventInfo}>
        <Text style={styles.eventLabel}>{getEventLabel()}</Text>
        <Text style={styles.eventTime}>{formatDate(event.createdAt)}</Text>
      </View>
      <Text style={styles.eventTokens}>+{event.tokensEarned}</Text>
    </View>
  );
};

// ============================================================================
// MAIN SCREEN COMPONENT
// ============================================================================

export default function CreatorEarningsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  
  const [summary, setSummary] = useState<CreatorEarningsSummary | null>(null);
  const [events, setEvents] = useState<CreatorEarningsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'30d' | '90d' | 'all'>('30d');

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (currentUser) {
      loadEarningsData();
    }
  }, [currentUser]);

  const loadEarningsData = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      
      // Load summary
      const summaryData = await fetchCreatorEarningsSummary(currentUser.uid);
      setSummary(summaryData);

      // Load recent events
      const eventsData = await fetchCreatorEarningsEvents(currentUser.uid);
      setEvents(eventsData.events);
      setNextCursor(eventsData.nextCursor || null);
    } catch (error) {
      console.error('Error loading earnings:', error);
      Alert.alert(
        t('error.title'),
        t('error.loadingEarnings', { defaultValue: 'Failed to load earnings data' })
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    if (!currentUser) return;

    try {
      setRefreshing(true);
      
      // Refresh summary (bypass cache)
      const summaryData = await refreshCreatorEarningsSummary(currentUser.uid);
      setSummary(summaryData);

      // Reload events
      const eventsData = await fetchCreatorEarningsEvents(currentUser.uid);
      setEvents(eventsData.events);
      setNextCursor(eventsData.nextCursor || null);
    } catch (error) {
      console.error('Error refreshing earnings:', error);
    } finally {
      setRefreshing(false);
    }
  }, [currentUser]);

  const handleLoadMore = async () => {
    if (!currentUser || !nextCursor || loadingMore) return;

    try {
      setLoadingMore(true);
      const eventsData = await fetchCreatorEarningsEvents(currentUser.uid, nextCursor);
      setEvents(prev => [...prev, ...eventsData.events]);
      setNextCursor(eventsData.nextCursor || null);
    } catch (error) {
      console.error('Error loading more events:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const getTotalForPeriod = () => {
    if (!summary) return 0;
    
    switch (selectedPeriod) {
      case '30d':
        return summary.totalTokensEarned30d;
      case '90d':
        return summary.totalTokensEarned90d;
      case 'all':
        return summary.totalTokensEarnedAllTime;
    }
  };

  const getChannelDataForPeriod = () => {
    if (!summary) return [];

    const suffix = selectedPeriod === 'all' ? 'AllTime' : selectedPeriod;
    
    return [
      {
        label: t('creator.earnings.chatMessages'),
        value: summary[`tokensFromChatMessages${suffix}` as keyof CreatorEarningsSummary] as number || 0,
        icon: 'chatbubble',
        color: '#007AFF',
      },
      {
        label: t('creator.earnings.boosts'),
        value: summary[`tokensFromBoosts${suffix}` as keyof CreatorEarningsSummary] as number || 0,
        icon: 'rocket',
        color: '#FF9500',
      },
      {
        label: t('creator.earnings.paidMedia'),
        value: summary[`tokensFromPaidMedia${suffix}` as keyof CreatorEarningsSummary] as number || 0,
        icon: 'image',
        color: '#34C759',
      },
      {
        label: t('creator.earnings.aiCompanions'),
        value: summary[`tokensFromAiCompanions${suffix}` as keyof CreatorEarningsSummary] as number || 0,
        icon: 'sparkles',
        color: '#AF52DE',
      },
    ];
  };

  if (!currentUser) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('creator.earnings.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>
            {t('auth.loginRequired', { defaultValue: 'Please log in to continue' })}
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('creator.earnings.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  const channelData = getChannelDataForPeriod();
  const total = getTotalForPeriod();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('creator.earnings.title')}</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
          <Ionicons name="refresh" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={events}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <EventCard event={item} />}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListHeaderComponent={
          <View>
            {/* Period Selector */}
            <View style={styles.periodSelector}>
              <TouchableOpacity
                style={[
                  styles.periodButton,
                  selectedPeriod === '30d' && styles.periodButtonActive,
                ]}
                onPress={() => setSelectedPeriod('30d')}
              >
                <Text
                  style={[
                    styles.periodButtonText,
                    selectedPeriod === '30d' && styles.periodButtonTextActive,
                  ]}
                >
                  30 Days
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.periodButton,
                  selectedPeriod === '90d' && styles.periodButtonActive,
                ]}
                onPress={() => setSelectedPeriod('90d')}
              >
                <Text
                  style={[
                    styles.periodButtonText,
                    selectedPeriod === '90d' && styles.periodButtonTextActive,
                  ]}
                >
                  90 Days
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.periodButton,
                  selectedPeriod === 'all' && styles.periodButtonActive,
                ]}
                onPress={() => setSelectedPeriod('all')}
              >
                <Text
                  style={[
                    styles.periodButtonText,
                    selectedPeriod === 'all' && styles.periodButtonTextActive,
                  ]}
                >
                  All Time
                </Text>
              </TouchableOpacity>
            </View>

            {/* Total Earnings Card */}
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>{t('creator.earnings.totalEarned')}</Text>
              <Text style={styles.totalValue}>{total.toLocaleString()} tokens</Text>
            </View>

            {/* Channel Breakdown */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('creator.earnings.breakdown')}</Text>
              {channelData.map((channel, index) => (
                <View key={index} style={styles.channelRow}>
                  <View style={styles.channelLeft}>
                    <View style={[styles.channelIcon, { backgroundColor: channel.color + '20' }]}>
                      <Ionicons name={channel.icon as any} size={20} color={channel.color} />
                    </View>
                    <Text style={styles.channelLabel}>{channel.label}</Text>
                  </View>
                  <Text style={styles.channelValue}>
                    {channel.value.toLocaleString()} tokens
                  </Text>
                </View>
              ))}
            </View>

            {/* Recent Activity Header */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('creator.earnings.recentActivity')}</Text>
            </View>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color="#007AFF" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="cash-outline" size={64} color="#CCC" />
            <Text style={styles.emptyText}>
              {t('creator.earnings.noActivity', { defaultValue: 'No earnings yet' })}
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  refreshButton: {
    padding: 8,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  periodSelector: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CCC',
    backgroundColor: '#FFF',
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  periodButtonText: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
  },
  periodButtonTextActive: {
    color: '#FFF',
  },
  totalCard: {
    backgroundColor: '#007AFF',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: '#FFF',
    opacity: 0.9,
    marginBottom: 8,
  },
  totalValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFF',
  },
  section: {
    backgroundColor: '#FFF',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  channelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  channelIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelLabel: {
    fontSize: 15,
    color: '#333',
  },
  channelValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  eventIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  eventInfo: {
    flex: 1,
  },
  eventLabel: {
    fontSize: 15,
    color: '#000',
    fontWeight: '500',
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 13,
    color: '#666',
  },
  eventTokens: {
    fontSize: 16,
    fontWeight: '600',
    color: '#34C759',
  },
  loadingMore: {
    padding: 16,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
});
