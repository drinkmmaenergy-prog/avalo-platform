/**
 * Global Ranking Screen
 * Public leaderboard showing top creators across different categories
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as rankingService from "@/services/rankingService";
import type {
  RankingPeriod,
  RankingSegment,
  GenderFilter,
  CategoryFilter,
  LeaderboardEntry,
} from "@/services/rankingService";

export default function GlobalRankingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  
  // Filters
  const [period, setPeriod] = useState<RankingPeriod>('daily');
  const [segment, setSegment] = useState<RankingSegment>('worldwide');
  const [gender, setGender] = useState<GenderFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');

  useEffect(() => {
    loadLeaderboard();
  }, [period, segment, gender, category]);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const result = await rankingService.getLeaderboard({
        period,
        segment,
        gender,
        category,
        limit: 100,
      });
      setEntries(result.entries);
    } catch (error) {
      // Error loading leaderboard
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadLeaderboard();
  };

  const handleCreatorPress = (creatorId: string) => {
    // Navigate to creator profile (adjust route based on your app structure)
    // For now, this is a placeholder - integrate with your actual profile route
    router.push('/(tabs)/home' as any);
  };

  const renderFilterButton = (
    label: string,
    isSelected: boolean,
    onPress: () => void
  ) => (
    <TouchableOpacity
      style={[styles.filterButton, isSelected && styles.filterButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.filterText, isSelected && styles.filterTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderLeaderboardEntry = (entry: LeaderboardEntry, index: number) => {
    const badge = rankingService.getPrimaryBadge(entry.badges);
    const rankDisplay = rankingService.getRankDisplayText(entry.rank);
    const badgeColor = rankingService.getRankBadgeColor(entry.rank);

    return (
      <Pressable
        key={`${entry.creatorId}-${index}`}
        style={styles.entryCard}
        onPress={() => handleCreatorPress(entry.creatorId)}
      >
        {/* Rank Badge */}
        <View style={[styles.rankBadge, { backgroundColor: badgeColor }]}>
          <Text style={styles.rankText}>{rankDisplay}</Text>
        </View>

        {/* Avatar */}
        <Image
          source={{ uri: entry.avatar || 'https://via.placeholder.com/50' }}
          style={styles.avatar}
        />

        {/* Creator Info */}
        <View style={styles.infoContainer}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {entry.displayName}
            </Text>
            {entry.hasTop10Bonus && (
              <View style={styles.bonusBadge}>
                <Text style={styles.bonusText}>⚡ TOP 10</Text>
              </View>
            )}
          </View>

          {/* Badge */}
          {badge && (
            <View style={[styles.badge, { backgroundColor: badge.color }]}>
              <Text style={styles.badgeText}>{badge.label}</Text>
            </View>
          )}

          {/* Stats */}
          <View style={styles.statsRow}>
            <Text style={styles.statsText}>
              💬 {entry.stats.chats} • 📞 {entry.stats.calls} • 💰 {entry.stats.tips}
            </Text>
          </View>
        </View>

        {/* Points */}
        <View style={styles.pointsContainer}>
          <Text style={styles.points}>{rankingService.formatPoints(entry.points)}</Text>
          <Text style={styles.pointsLabel}>points</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🏆 Global Ranking</Text>
        <Text style={styles.subtitle}>Top creators worldwide</Text>
      </View>

      {/* Period Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {renderFilterButton('Today', period === 'daily', () => setPeriod('daily'))}
        {renderFilterButton('This Week', period === 'weekly', () => setPeriod('weekly'))}
        {renderFilterButton('This Month', period === 'monthly', () => setPeriod('monthly'))}
        {renderFilterButton('All Time', period === 'lifetime', () => setPeriod('lifetime'))}
      </ScrollView>

      {/* Segment Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {renderFilterButton('🌍 Global', segment === 'worldwide', () => setSegment('worldwide'))}
        {renderFilterButton('🗺️ Country', segment === 'country', () => setSegment('country'))}
        {renderFilterButton('🏙️ City', segment === 'city', () => setSegment('city'))}
      </ScrollView>

      {/* Gender Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {renderFilterButton('All', gender === 'all', () => setGender('all'))}
        {renderFilterButton('Women', gender === 'women', () => setGender('women'))}
        {renderFilterButton('Men', gender === 'men', () => setGender('men'))}
      </ScrollView>

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {renderFilterButton('All', category === 'all', () => setCategory('all'))}
        {renderFilterButton('📹 Video', category === 'video', () => setCategory('video'))}
        {renderFilterButton('💬 Chat', category === 'chat', () => setCategory('chat'))}
        {renderFilterButton('💰 Tips', category === 'tips', () => setCategory('tips'))}
        {renderFilterButton('🎨 Content', category === 'content', () => setCategory('content'))}
      </ScrollView>

      {/* Leaderboard */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
        </View>
      ) : (
        <ScrollView
          style={styles.leaderboard}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {entries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No creators found</Text>
              <Text style={styles.emptySubtext}>Try different filters</Text>
            </View>
          ) : (
            entries.map((entry, index) => renderLeaderboardEntry(entry, index))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#FF6B6B',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    marginTop: 4,
  },
  filterRow: {
    maxHeight: 50,
    marginVertical: 8,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: '#FF6B6B',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  leaderboard: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  infoContainer: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginRight: 8,
  },
  bonusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#FCD34D',
    borderRadius: 8,
  },
  bonusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#92400E',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statsRow: {
    flexDirection: 'row',
  },
  statsText: {
    fontSize: 12,
    color: '#6B7280',
  },
  pointsContainer: {
    alignItems: 'flex-end',
  },
  points: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  pointsLabel: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
});
