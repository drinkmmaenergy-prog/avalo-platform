/**
 * Creator Leaderboard Screen
 * PACK 33-9: Creator Leaderboards & Discovery Boost Engine
 * 
 * Displays weekly creator rankings with tabs for different categories
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import RankBadge from "@/components/RankBadge";
import {
  getLeaderboard,
  computeWeeklyLeaderboard,
  getUserRank,
  type Leaderboard,
  type CreatorScore,
} from "@/services/leaderboardService";

type TabType = 'overall' | 'subscriptions' | 'ppv' | 'live' | 'messages' | 'trending' | 'rising';

export default function CreatorLeaderboardScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('overall');
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [userRank, setUserRank] = useState<{
    rank: number;
    delta: number;
    badge?: 'gold' | 'silver' | 'bronze' | 'rising_star';
    score: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  useEffect(() => {
    if (user?.uid) {
      loadUserRank();
    }
  }, [user?.uid, leaderboard]);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      let data = await getLeaderboard();
      
      // If no leaderboard or outdated, compute new one
      if (!data) {
        data = await computeWeeklyLeaderboard();
      }
      
      setLeaderboard(data);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserRank = async () => {
    if (!user?.uid) return;
    
    try {
      const rank = await getUserRank(user.uid);
      setUserRank(rank);
    } catch (error) {
      console.error('Error loading user rank:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await computeWeeklyLeaderboard();
    await loadLeaderboard();
    setRefreshing(false);
  };

  const getDisplayData = (): CreatorScore[] => {
    if (!leaderboard) return [];
    
    switch (activeTab) {
      case 'overall':
        return leaderboard.overall;
      case 'subscriptions':
        return leaderboard.byCategory.subscriptions;
      case 'ppv':
        return leaderboard.byCategory.ppv;
      case 'live':
        return leaderboard.byCategory.live;
      case 'messages':
        return leaderboard.byCategory.messages;
      case 'trending':
        return leaderboard.trending;
      case 'rising':
        return leaderboard.risingStar;
      default:
        return leaderboard.overall;
    }
  };

  const renderTabButton = (tab: TabType, label: string, icon: string) => {
    const isActive = activeTab === tab;
    return (
      <TouchableOpacity
        key={tab}
        style={[styles.tabButton, isActive && styles.tabButtonActive]}
        onPress={() => setActiveTab(tab)}
      >
        <Text style={styles.tabIcon}>{icon}</Text>
        <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderLeaderboardRow = (creator: CreatorScore, index: number) => {
    const isCurrentUser = user?.uid === creator.creatorId;
    const deltaColor = creator.delta > 0 ? '#00FF00' : creator.delta < 0 ? '#FF4444' : '#888';
    const deltaSymbol = creator.delta > 0 ? '↑' : creator.delta < 0 ? '↓' : '→';
    
    return (
      <View
        key={`${creator.creatorId}-${index}`}
        style={[
          styles.leaderboardRow,
          isCurrentUser && styles.leaderboardRowHighlight,
        ]}
      >
        {/* Rank */}
        <View style={styles.rankContainer}>
          {creator.badge && (
            <RankBadge variant={creator.badge} size="small" showLabel={false} />
          )}
          {!creator.badge && (
            <Text style={styles.rankNumber}>#{creator.rank}</Text>
          )}
        </View>

        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {creator.creatorName.substring(0, 2).toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.creatorName} numberOfLines={1}>
            {creator.creatorName}
            {isCurrentUser && <Text style={styles.youLabel}> (YOU)</Text>}
          </Text>
          <Text style={styles.scoreText}>
            {t('leaderboard.score')}: {creator.score.toLocaleString()}
          </Text>
        </View>

        {/* Delta */}
        {creator.delta !== 0 && (
          <View style={styles.deltaContainer}>
            <Text style={[styles.deltaText, { color: deltaColor }]}>
              {deltaSymbol} {Math.abs(creator.delta)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#40E0D0" />
        <Text style={styles.loadingText}>{t('leaderboard.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('leaderboard.title')}</Text>
        <Text style={styles.weekLabel}>
          {leaderboard?.week || 'Week --'}
        </Text>
      </View>

      {/* User Rank Card */}
      {userRank && (
        <View style={styles.userRankCard}>
          <View style={styles.userRankLeft}>
            {userRank.badge && (
              <RankBadge variant={userRank.badge} size="medium" showLabel />
            )}
            {!userRank.badge && (
              <View style={styles.userRankNumber}>
                <Text style={styles.userRankNumberText}>#{userRank.rank}</Text>
              </View>
            )}
          </View>
          <View style={styles.userRankRight}>
            <Text style={styles.userRankTitle}>{t('leaderboard.yourRank')}</Text>
            <Text style={styles.userRankScore}>
              {t('leaderboard.score')}: {userRank.score.toLocaleString()}
            </Text>
            {userRank.delta !== 0 && (
              <Text style={styles.userRankDelta}>
                {userRank.delta > 0 ? '↑' : '↓'} {Math.abs(userRank.delta)} {t('leaderboard.vsLastWeek')}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsContainer}
        contentContainerStyle={styles.tabsContent}
      >
        {renderTabButton('overall', t('leaderboard.tabs.overall'), '🏆')}
        {renderTabButton('trending', t('leaderboard.tabs.trending'), '🔥')}
        {renderTabButton('rising', t('leaderboard.tabs.rising'), '⭐')}
        {renderTabButton('subscriptions', t('leaderboard.tabs.subscriptions'), '💎')}
        {renderTabButton('ppv', t('leaderboard.tabs.ppv'), '🎬')}
        {renderTabButton('live', t('leaderboard.tabs.live'), '📹')}
        {renderTabButton('messages', t('leaderboard.tabs.messages'), '💬')}
      </ScrollView>

      {/* Leaderboard List */}
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#40E0D0"
          />
        }
      >
        {getDisplayData().length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📊</Text>
            <Text style={styles.emptyStateText}>
              {t('leaderboard.noData')}
            </Text>
          </View>
        ) : (
          getDisplayData().map((creator, index) => renderLeaderboardRow(creator, index))
        )}

        {/* Bottom padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
    marginTop: 16,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  weekLabel: {
    fontSize: 14,
    color: '#888',
  },
  userRankCard: {
    margin: 20,
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    borderWidth: 2,
    borderColor: '#40E0D0',
  },
  userRankLeft: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  userRankNumber: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#40E0D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userRankNumberText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  userRankRight: {
    flex: 1,
  },
  userRankTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  userRankScore: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  userRankDelta: {
    fontSize: 14,
    color: '#00FF00',
    fontWeight: 'bold',
  },
  tabsContainer: {
    maxHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tabsContent: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
  },
  tabButtonActive: {
    backgroundColor: '#40E0D0',
  },
  tabIcon: {
    fontSize: 16,
  },
  tabLabel: {
    fontSize: 14,
    color: '#888',
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#000',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 20,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  leaderboardRowHighlight: {
    backgroundColor: '#1A2A2A',
    borderWidth: 2,
    borderColor: '#40E0D0',
  },
  rankContainer: {
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#888',
  },
  avatarContainer: {
    width: 48,
    height: 48,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#40E0D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  infoContainer: {
    flex: 1,
  },
  creatorName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  youLabel: {
    color: '#40E0D0',
  },
  scoreText: {
    fontSize: 14,
    color: '#888',
  },
  deltaContainer: {
    paddingHorizontal: 10,
  },
  deltaText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  bottomPadding: {
    height: 40,
  },
});
