/**
 * PACK 112 — Achievements Screen
 * Displays all achievements, progress, and XP/Level
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

interface Achievement {
  id: string;
  title: string;
  description: string;
  iconKey: string;
  category: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
  milestoneType: string;
  threshold?: number;
  enabled: boolean;
  sortOrder: number;
}

interface UserAchievements {
  userId: string;
  achievedIds: string[];
  progress: Record<string, number>;
  streaks: Record<string, number>;
  selectedBadges: string[];
  xp: number;
  level: number;
}

interface XPInfo {
  currentXp: number;
  currentLevel: number;
  levelName: string;
  nextLevelXp: number;
  progress: number;
}

const TIER_COLORS = {
  BRONZE: '#CD7F32',
  SILVER: '#C0C0C0',
  GOLD: '#FFD700',
  PLATINUM: '#E5E4E2',
  DIAMOND: '#B9F2FF',
};

const CATEGORY_ICONS = {
  PROFILE: '👤',
  ACTIVITY: '🔥',
  CONTENT: '📝',
  COMMUNITY: '🤝',
  SAFETY: '🛡️',
  MILESTONE: '🎯',
};

export default function AchievementsScreen() {
  const router = useRouter();
  const functions = getFunctions();
  const auth = getAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userAchievements, setUserAchievements] = useState<UserAchievements | null>(null);
  const [catalog, setCatalog] = useState<Achievement[]>([]);
  const [xpInfo, setXPInfo] = useState<XPInfo | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const loadAchievements = async () => {
    try {
      const getUserAchievements = httpsCallable(functions, 'getUserAchievements');
      const result = await getUserAchievements({});
      
      const data = result.data as any;
      setUserAchievements(data.achievements);
      setCatalog(data.catalog);
      setXPInfo(data.xpInfo);
    } catch (error) {
      console.error('Error loading achievements:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAchievements();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadAchievements();
  };

  const isAchieved = (achievementId: string) => {
    return userAchievements?.achievedIds.includes(achievementId) || false;
  };

  const getProgress = (achievement: Achievement) => {
    if (!userAchievements) return 0;
    
    if (achievement.milestoneType === 'STREAK') {
      return userAchievements.streaks[achievement.id] || 0;
    }
    
    return userAchievements.progress[achievement.id] || 0;
  };

  const filteredAchievements = selectedCategory === 'ALL'
    ? catalog
    : catalog.filter(a => a.category === selectedCategory);

  const categories = ['ALL', 'PROFILE', 'ACTIVITY', 'CONTENT', 'COMMUNITY', 'SAFETY', 'MILESTONE'];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading achievements...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with XP/Level */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Achievements</Text>
          {xpInfo && (
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>Lv {xpInfo.currentLevel}</Text>
              <Text style={styles.levelName}>{xpInfo.levelName}</Text>
            </View>
          )}
        </View>
        
        {xpInfo && (
          <View style={styles.xpContainer}>
            <View style={styles.xpBar}>
              <View style={[styles.xpFill, { width: `${xpInfo.progress}%` }]} />
            </View>
            <Text style={styles.xpText}>
              {xpInfo.currentXp} / {xpInfo.nextLevelXp} XP
            </Text>
          </View>
        )}
      </View>

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContainer}
      >
        {categories.map(category => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryButton,
              selectedCategory === category && styles.categoryButtonActive,
            ]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === category && styles.categoryTextActive,
              ]}
            >
              {category === 'ALL' ? '🌟 All' : `${CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS]} ${category}`}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Achievements List */}
      <ScrollView
        style={styles.achievementsScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.achievementsList}>
          {filteredAchievements.map(achievement => {
            const achieved = isAchieved(achievement.id);
            const progress = getProgress(achievement);
            const progressPercent = achievement.threshold
              ? Math.min(100, (progress / achievement.threshold) * 100)
              : achieved ? 100 : 0;

            return (
              <View
                key={achievement.id}
                style={[
                  styles.achievementCard,
                  achieved && styles.achievementCardAchieved,
                ]}
              >
                <View style={styles.achievementIcon}>
                  <View
                    style={[
                      styles.tierBadge,
                      { backgroundColor: TIER_COLORS[achievement.tier] },
                      !achieved && styles.tierBadgeInactive,
                    ]}
                  >
                    <Text style={styles.tierText}>
                      {achievement.tier.charAt(0)}
                    </Text>
                  </View>
                </View>

                <View style={styles.achievementContent}>
                  <View style={styles.achievementHeader}>
                    <Text
                      style={[
                        styles.achievementTitle,
                        !achieved && styles.achievementTitleInactive,
                      ]}
                    >
                      {achievement.title}
                    </Text>
                    {achieved && (
                      <Text style={styles.achievedBadge}>✓</Text>
                    )}
                  </View>

                  <Text
                    style={[
                      styles.achievementDescription,
                      !achieved && styles.achievementDescriptionInactive,
                    ]}
                  >
                    {achievement.description}
                  </Text>

                  {!achieved && achievement.threshold && (
                    <View style={styles.progressContainer}>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${progressPercent}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressText}>
                        {progress} / {achievement.threshold}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Manage Badges Button */}
        <TouchableOpacity
          style={styles.manageBadgesButton}
          onPress={() => router.push('/achievements/select-badges' as any)}
        >
          <Text style={styles.manageBadgesText}>
            Manage Profile Badges
          </Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Achievements are cosmetic and do not affect earnings or visibility
          </Text>
        </View>
      </ScrollView>
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
    marginTop: 12,
    fontSize: 16,
    color: '#6C757D',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#212529',
  },
  levelBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
  },
  levelText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  levelName: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  xpContainer: {
    marginTop: 8,
  },
  xpBar: {
    height: 8,
    backgroundColor: '#E9ECEF',
    borderRadius: 4,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    backgroundColor: '#28A745',
    borderRadius: 4,
  },
  xpText: {
    marginTop: 4,
    fontSize: 12,
    color: '#6C757D',
    textAlign: 'right',
  },
  categoryScroll: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  categoryContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
  },
  categoryButtonActive: {
    backgroundColor: '#007AFF',
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6C757D',
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  achievementsScroll: {
    flex: 1,
  },
  achievementsList: {
    padding: 16,
  },
  achievementCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    opacity: 0.6,
  },
  achievementCardAchieved: {
    opacity: 1,
    borderColor: '#28A745',
    borderWidth: 2,
  },
  achievementIcon: {
    marginRight: 16,
    justifyContent: 'center',
  },
  tierBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierBadgeInactive: {
    opacity: 0.5,
  },
  tierText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  achievementContent: {
    flex: 1,
  },
  achievementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  achievementTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212529',
    flex: 1,
  },
  achievementTitleInactive: {
    color: '#6C757D',
  },
  achievedBadge: {
    fontSize: 20,
    color: '#28A745',
    marginLeft: 8,
  },
  achievementDescription: {
    fontSize: 14,
    color: '#495057',
    marginBottom: 8,
  },
  achievementDescriptionInactive: {
    color: '#ADB5BD',
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E9ECEF',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 3,
  },
  progressText: {
    marginTop: 4,
    fontSize: 12,
    color: '#6C757D',
  },
  manageBadgesButton: {
    margin: 16,
    marginTop: 8,
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  manageBadgesText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  footer: {
    padding: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#6C757D',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
