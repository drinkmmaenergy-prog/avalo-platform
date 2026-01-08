/**
 * PACK 258 — BUYER / SUPPORTER ANALYTICS
 * Private analytics screen for supporters (users who spend tokens)
 * Location: Profile → Wallet → Supporter Stats
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
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

const { width } = Dimensions.get('window');

// ============================================================================
// TYPES
// ============================================================================

type FanLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface SupporterAnalytics {
  userId: string;
  lifetimeSpent: number;
  monthlySpent: number;
  topCreatorId: string | null;
  topCreatorSpent: number;
  creatorsDiscovered: number;
  profileViewsReceived: number;
  matchesFromPaidChats: number;
  lastSpentAt: any;
  createdAt: any;
  updatedAt: any;
}

interface FanLevelData {
  supporterId: string;
  creatorId: string;
  level: FanLevel;
  totalSpent: number;
  lastInteractionAt: any;
  levelUnlockedAt: any;
  createdAt: any;
  updatedAt: any;
}

interface CreatorInfo {
  id: string;
  displayName: string;
  username: string;
  profileImageUrl?: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SupporterStatsScreen() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<SupporterAnalytics | null>(null);
  const [topCreator, setTopCreator] = useState<CreatorInfo | null>(null);
  const [topFanLevels, setTopFanLevels] = useState<Array<FanLevelData & { creator?: CreatorInfo }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.uid) {
      loadSupporterData();
    }
  }, [user?.uid]);

  const loadSupporterData = async () => {
    try {
      setError(null);

      // Load supporter analytics
      const analyticsDoc = await getDoc(doc(db, 'supporterAnalytics', user!.uid));
      
      if (!analyticsDoc.exists()) {
        // User has never spent tokens
        setAnalytics(null);
        setIsLoading(false);
        return;
      }

      const analyticsData = analyticsDoc.data() as SupporterAnalytics;
      setAnalytics(analyticsData);

      // Load top creator info
      if (analyticsData.topCreatorId) {
        const creatorDoc = await getDoc(doc(db, 'users', analyticsData.topCreatorId));
        if (creatorDoc.exists()) {
          const creatorData = creatorDoc.data();
          setTopCreator({
            id: analyticsData.topCreatorId,
            displayName: creatorData.displayName || 'Creator',
            username: creatorData.username || '',
            profileImageUrl: creatorData.profileImageUrl,
          });
        }
      }

      // Load top fan levels
      const fanLevelsQuery = query(
        collection(db, 'fanLevels'),
        where('supporterId', '==', user!.uid),
        orderBy('level', 'desc'),
        orderBy('totalSpent', 'desc'),
        limit(5)
      );

      const fanLevelsSnapshot = await getDocs(fanLevelsQuery);
      const fanLevelsData: Array<FanLevelData & { creator?: CreatorInfo }> = [];

      for (const fanDoc of fanLevelsSnapshot.docs) {
        const fanData = fanDoc.data() as FanLevelData;
        
        // Load creator info for each fan level
        const creatorDoc = await getDoc(doc(db, 'users', fanData.creatorId));
        if (creatorDoc.exists()) {
          const creatorData = creatorDoc.data();
          fanLevelsData.push({
            ...fanData,
            creator: {
              id: fanData.creatorId,
              displayName: creatorData.displayName || 'Creator',
              username: creatorData.username || '',
              profileImageUrl: creatorData.profileImageUrl,
            },
          });
        }
      }

      setTopFanLevels(fanLevelsData);
      setIsLoading(false);
    } catch (err) {
      console.error('Error loading supporter data:', err);
      setError('Failed to load supporter stats');
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSupporterData();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading your stats...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Failed to load stats</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadSupporterData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!analytics) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🪙</Text>
        <Text style={styles.emptyTitle}>No Activity Yet</Text>
        <Text style={styles.emptyMessage}>
          Your supporter stats will appear here once you start spending tokens
        </Text>
        <TouchableOpacity style={styles.exploreButton} onPress={() => router.push('/(tabs)' as any)}>
          <Text style={styles.exploreButtonText}>Explore Creators</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
        <Text style={styles.headerTitle}>Supporter Stats</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Lifetime Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Spending</Text>
        
        <View style={[styles.statCard, styles.statCardPrimary]}>
          <Text style={styles.statLabel}>Tokens Spent (Lifetime)</Text>
          <Text style={styles.statValueLarge}>{formatTokens(analytics.lifetimeSpent)} 🪙</Text>
          <Text style={styles.statSubtext}>Total investment in creators</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Tokens Spent This Month</Text>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${getMonthProgress(analytics.monthlySpent, analytics.lifetimeSpent)}%` },
              ]}
            />
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statValue}>{formatTokens(analytics.monthlySpent)} 🪙</Text>
            <Text style={styles.statPercentage}>
              {getMonthProgress(analytics.monthlySpent, analytics.lifetimeSpent)}%
            </Text>
          </View>
        </View>
      </View>

      {/* Top Creator */}
      {topCreator && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Creator</Text>
          <TouchableOpacity
            style={styles.topCreatorCard}
            onPress={() => router.push(`/(tabs)/profile/${topCreator.id}` as any)}
          >
            <View style={styles.topCreatorAvatar}>
              <Text style={styles.topCreatorAvatarText}>
                {topCreator.displayName[0].toUpperCase()}
              </Text>
            </View>
            <View style={styles.topCreatorInfo}>
              <Text style={styles.topCreatorName}>{topCreator.displayName}</Text>
              <Text style={styles.topCreatorUsername}>@{topCreator.username}</Text>
            </View>
            <View style={styles.topCreatorStats}>
              <Text style={styles.topCreatorSpent}>
                {formatTokens(analytics.topCreatorSpent)} 🪙
              </Text>
              <Text style={styles.topCreatorLabel}>spent</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Activity Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Activity</Text>
        
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>✨</Text>
            <Text style={styles.statValue}>{analytics.creatorsDiscovered}</Text>
            <Text style={styles.statLabel}>Creators Discovered</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statIcon}>👀</Text>
            <Text style={styles.statValue}>{analytics.profileViewsReceived}</Text>
            <Text style={styles.statLabel}>Profile Views Received</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statIcon}>💬</Text>
            <Text style={styles.statValue}>{analytics.matchesFromPaidChats}</Text>
            <Text style={styles.statLabel}>Matches from Paid Chats</Text>
          </View>
        </View>
      </View>

      {/* Fan Levels */}
      {topFanLevels.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Fan Levels</Text>
          <Text style={styles.sectionSubtitle}>
            Your support levels with creators you've invested in
          </Text>
          
          {topFanLevels.map((fanLevel) => (
            <TouchableOpacity
              key={`${fanLevel.supporterId}_${fanLevel.creatorId}`}
              style={styles.fanLevelCard}
              onPress={() => router.push(`/(tabs)/profile/${fanLevel.creatorId}` as any)}
            >
              <View style={styles.fanLevelHeader}>
                <View style={styles.fanLevelCreatorInfo}>
                  <View style={styles.fanLevelAvatar}>
                    <Text style={styles.fanLevelAvatarText}>
                      {fanLevel.creator?.displayName[0].toUpperCase() || '?'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.fanLevelCreatorName}>
                      {fanLevel.creator?.displayName || 'Creator'}
                    </Text>
                    <Text style={styles.fanLevelCreatorUsername}>
                      @{fanLevel.creator?.username || 'unknown'}
                    </Text>
                  </View>
                </View>
                
                <View style={[styles.fanLevelBadge, getFanLevelBadgeStyle(fanLevel.level)]}>
                  <Text style={styles.fanLevelBadgeText}>{getFanLevelName(fanLevel.level)}</Text>
                  <Text style={styles.fanLevelBadgeLevel}>L{fanLevel.level}</Text>
                </View>
              </View>

              <View style={styles.fanLevelStats}>
                <View style={styles.fanLevelStat}>
                  <Text style={styles.fanLevelStatLabel}>Total Spent</Text>
                  <Text style={styles.fanLevelStatValue}>
                    {formatTokens(fanLevel.totalSpent)} 🪙
                  </Text>
                </View>
                <View style={styles.fanLevelStat}>
                  <Text style={styles.fanLevelStatLabel}>Priority Boost</Text>
                  <Text style={styles.fanLevelStatValue}>
                    {getPriorityBoost(fanLevel.level)}x
                  </Text>
                </View>
              </View>

              {/* Progress to next level */}
              {fanLevel.level < 6 && (
                <View style={styles.fanLevelProgress}>
                  <Text style={styles.fanLevelProgressLabel}>
                    Progress to {getFanLevelName((fanLevel.level + 1) as FanLevel)}
                  </Text>
                  <View style={styles.progressBarContainer}>
                    <View
                      style={[
                        styles.progressBar,
                        {
                          width: `${getLevelProgress(fanLevel.level, fanLevel.totalSpent)}%`,
                          backgroundColor: getFanLevelColor(fanLevel.level),
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.fanLevelProgressText}>
                    {formatTokens(getNextLevelTokens(fanLevel.level) - fanLevel.totalSpent)} more tokens
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoTitle}>About Supporter Stats</Text>
        <Text style={styles.infoText}>
          Your stats are completely private. Creators can see your fan level (which gives you inbox priority), but they never see your name on any public leaderboard or ranking.
        </Text>
        <Text style={styles.infoText}>
          Higher fan levels increase your visibility with creators without creating any obligations.
        </Text>
      </View>

      {/* Bottom Spacing */}
      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function getMonthProgress(monthly: number, lifetime: number): number {
  if (lifetime === 0) return 0;
  return Math.min(Math.round((monthly / lifetime) * 100), 100);
}

function getFanLevelName(level: FanLevel): string {
  const names = {
    1: 'Interested',
    2: 'Supporter',
    3: 'Big Fan',
    4: 'Top Fan',
    5: 'VIP',
    6: 'Elite VIP',
  };
  return names[level];
}

function getFanLevelColor(level: FanLevel): string {
  const colors = {
    1: '#6B7280',
    2: '#3B82F6',
    3: '#8B5CF6',
    4: '#EC4899',
    5: '#F59E0B',
    6: '#EF4444',
  };
  return colors[level];
}

function getFanLevelBadgeStyle(level: FanLevel) {
  return {
    backgroundColor: getFanLevelColor(level),
  };
}

function getPriorityBoost(level: FanLevel): number {
  const boosts = {
    1: 1.0,
    2: 1.0,
    3: 1.5,
    4: 2.0,
    5: 3.0,
    6: 4.0,
  };
  return boosts[level];
}

function getNextLevelTokens(currentLevel: FanLevel): number {
  const thresholds = {
    1: 50,
    2: 200,
    3: 500,
    4: 1500,
    5: 5000,
    6: Infinity,
  };
  return thresholds[currentLevel];
}

function getLevelProgress(currentLevel: FanLevel, totalSpent: number): number {
  if (currentLevel >= 6) return 100;
  
  const currentThreshold = getNextLevelTokens((currentLevel - 1) as FanLevel);
  const nextThreshold = getNextLevelTokens(currentLevel);
  
  const progress = ((totalSpent - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
  return Math.min(Math.max(progress, 0), 100);
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
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptyMessage: {
    color: '#999',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  exploreButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
  },
  exploreButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
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
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerRight: {
    width: 40,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  sectionSubtitle: {
    color: '#999',
    fontSize: 14,
    marginBottom: 16,
    marginTop: -8,
  },
  statCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  statCardPrimary: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  statLabel: {
    color: '#999',
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  statValueLarge: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  statIcon: {
    fontSize: 32,
    marginBottom: 8,
    textAlign: 'center',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  statPercentage: {
    color: '#8B5CF6',
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 4,
  },
  topCreatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  topCreatorAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  topCreatorAvatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  topCreatorInfo: {
    flex: 1,
  },
  topCreatorName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  topCreatorUsername: {
    color: '#999',
    fontSize: 14,
  },
  topCreatorStats: {
    alignItems: 'flex-end',
  },
  topCreatorSpent: {
    color: '#8B5CF6',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  topCreatorLabel: {
    color: '#999',
    fontSize: 11,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  fanLevelCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  fanLevelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  fanLevelCreatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  fanLevelAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fanLevelAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  fanLevelCreatorName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  fanLevelCreatorUsername: {
    color: '#999',
    fontSize: 12,
  },
  fanLevelBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fanLevelBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  fanLevelBadgeLevel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    opacity: 0.8,
  },
  fanLevelStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  fanLevelStat: {
    flex: 1,
  },
  fanLevelStatLabel: {
    color: '#999',
    fontSize: 11,
    marginBottom: 4,
  },
  fanLevelStatValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fanLevelProgress: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
  },
  fanLevelProgressLabel: {
    color: '#999',
    fontSize: 12,
    marginBottom: 8,
  },
  fanLevelProgressText: {
    color: '#999',
    fontSize: 11,
    marginTop: 4,
  },
  infoCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  infoIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  infoTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    color: '#999',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  bottomSpacing: {
    height: 40,
  },
});
