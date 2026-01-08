/**
 * Influencer Badge Progress Screen
 * 
 * Shows:
 * - Current popularity score
 * - Current badge level
 * - Progress to next level
 * - VIP/Royal badge takes precedence in UI
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import BadgeDisplay from "@/components/BadgeDisplay";

interface InfluencerProgress {
  currentScore: number;
  currentLevel: 'none' | 'rising' | 'influencer' | 'top_influencer';
  nextLevel: 'rising' | 'influencer' | 'top_influencer' | 'max';
  nextLevelThreshold: number;
  progressPercent: number;
}

const LEVEL_CONFIG = {
  none: {
    name: 'Getting Started',
    icon: '⭐',
    color: '#95A5A6',
    threshold: 0,
  },
  rising: {
    name: 'Rising Star',
    icon: '🌟',
    color: '#F39C12',
    threshold: 1000,
  },
  influencer: {
    name: 'Influencer',
    icon: '⭐',
    color: '#FF6B6B',
    threshold: 5000,
  },
  top_influencer: {
    name: 'Top Influencer',
    icon: '💫',
    color: '#9B59B6',
    threshold: 20000,
  },
};

export default function InfluencerProgressScreen() {
  const router = useRouter();
  const [progress, setProgress] = useState<InfluencerProgress>({
    currentScore: 450,
    currentLevel: 'none',
    nextLevel: 'rising',
    nextLevelThreshold: 1000,
    progressPercent: 45,
  });
  const [hasVIP, setHasVIP] = useState(false);
  const [hasRoyal, setHasRoyal] = useState(false);

  useEffect(() => {
    loadInfluencerProgress();
  }, []);

  const loadInfluencerProgress = async () => {
    try {
      // TODO: Load from Cloud Function
      // const userId = await getCurrentUserId();
      // const progressData = await getInfluencerProgress(userId);
      // setProgress(progressData);
      
      // Check membership
      // const userDoc = await getDoc(doc(db, 'users', userId));
      // setHasVIP(userDoc.data()?.membership?.vip || false);
      // setHasRoyal(userDoc.data()?.membership?.royal || false);
    } catch (error) {
      console.error('Failed to load influencer progress:', error);
    }
  };

  const currentLevelConfig = LEVEL_CONFIG[progress.currentLevel];
  const nextLevelConfig = progress.nextLevel === 'max' 
    ? null 
    : LEVEL_CONFIG[progress.nextLevel as keyof typeof LEVEL_CONFIG];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Influencer Progress</Text>
      </View>

      <View style={styles.content}>
        {/* Current Badge Display */}
        <View style={styles.badgeCard}>
          <Text style={styles.cardTitle}>Your Badge</Text>
          <View style={styles.badgeDisplayContainer}>
            <BadgeDisplay
              userBadges={{
                hasRoyal,
                hasVIP,
                influencerLevel: progress.currentLevel !== 'none' ? progress.currentLevel : null,
              }}
              size="large"
              showLabel={true}
            />
          </View>
          {(hasVIP || hasRoyal) && (
            <Text style={styles.badgeNote}>
              💡 Your {hasRoyal ? 'Royal' : 'VIP'} badge is displayed instead of Influencer badge in the app
            </Text>
          )}
        </View>

        {/* Current Level */}
        <View style={styles.levelCard}>
          <View style={styles.levelHeader}>
            <Text style={styles.levelIcon}>{currentLevelConfig.icon}</Text>
            <View style={styles.levelInfo}>
              <Text style={styles.levelName}>{currentLevelConfig.name}</Text>
              <Text style={styles.levelScore}>
                {progress.currentScore.toLocaleString()} popularity points
              </Text>
            </View>
          </View>
        </View>

        {/* Progress to Next Level */}
        {progress.nextLevel !== 'max' && nextLevelConfig && (
          <View style={styles.progressCard}>
            <Text style={styles.cardTitle}>Progress to {nextLevelConfig.name}</Text>
            
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progress.progressPercent}%`,
                    backgroundColor: nextLevelConfig.color,
                  },
                ]}
              />
            </View>
            
            <View style={styles.progressStats}>
              <Text style={styles.progressText}>
                {progress.currentScore.toLocaleString()} / {progress.nextLevelThreshold.toLocaleString()}
              </Text>
              <Text style={styles.progressPercent}>
                {progress.progressPercent}%
              </Text>
            </View>

            <Text style={styles.progressNote}>
              {(progress.nextLevelThreshold - progress.currentScore).toLocaleString()} more points needed
            </Text>
          </View>
        )}

        {progress.nextLevel === 'max' && (
          <View style={styles.maxLevelCard}>
            <Text style={styles.maxLevelIcon}>🏆</Text>
            <Text style={styles.maxLevelTitle}>Maximum Level Reached!</Text>
            <Text style={styles.maxLevelText}>
              You've achieved the highest influencer level on Avalo
            </Text>
          </View>
        )}

        {/* All Levels */}
        <View style={styles.levelsCard}>
          <Text style={styles.cardTitle}>All Levels</Text>
          
          {Object.entries(LEVEL_CONFIG).map(([key, config]) => {
            const isCurrentLevel = key === progress.currentLevel;
            const isUnlocked = progress.currentScore >= config.threshold;
            
            return (
              <View
                key={key}
                style={[
                  styles.levelItem,
                  isCurrentLevel && styles.levelItemCurrent,
                  !isUnlocked && styles.levelItemLocked,
                ]}
              >
                <Text style={styles.levelItemIcon}>{config.icon}</Text>
                <View style={styles.levelItemInfo}>
                  <Text style={[
                    styles.levelItemName,
                    !isUnlocked && styles.levelItemNameLocked,
                  ]}>
                    {config.name}
                  </Text>
                  <Text style={styles.levelItemThreshold}>
                    {config.threshold.toLocaleString()} points
                  </Text>
                </View>
                {isCurrentLevel && (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>CURRENT</Text>
                  </View>
                )}
                {isUnlocked && !isCurrentLevel && progress.currentScore >= config.threshold && (
                  <Text style={styles.unlockedCheck}>✓</Text>
                )}
              </View>
            );
          })}
        </View>

        {/* How to Earn Points */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>How to Earn Popularity Points</Text>
          
          <View style={styles.earnItem}>
            <Text style={styles.earnIcon}>💕</Text>
            <Text style={styles.earnText}>Get likes on your profile (+5 points)</Text>
          </View>
          
          <View style={styles.earnItem}>
            <Text style={styles.earnIcon}>🔥</Text>
            <Text style={styles.earnText}>Get SuperLikes (+25 points)</Text>
          </View>
          
          <View style={styles.earnItem}>
            <Text style={styles.earnIcon}>💬</Text>
            <Text style={styles.earnText}>Start conversations (+10 points)</Text>
          </View>
          
          <View style={styles.earnItem}>
            <Text style={styles.earnIcon}>📸</Text>
            <Text style={styles.earnText}>Post engaging content (+15 points)</Text>
          </View>
          
          <View style={styles.earnItem}>
            <Text style={styles.earnIcon}>⭐</Text>
            <Text style={styles.earnText}>Complete your profile (+50 points)</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    padding: 20,
  },
  badgeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  badgeDisplayContainer: {
    marginVertical: 10,
  },
  badgeNote: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  levelCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelIcon: {
    fontSize: 40,
    marginRight: 15,
  },
  levelInfo: {
    flex: 1,
  },
  levelName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  levelScore: {
    fontSize: 16,
    color: '#666',
  },
  progressCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  progressBar: {
    height: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
    overflow: 'hidden',
    marginVertical: 15,
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  progressPercent: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  progressNote: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  maxLevelCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 30,
    marginBottom: 20,
    alignItems: 'center',
  },
  maxLevelIcon: {
    fontSize: 60,
    marginBottom: 15,
  },
  maxLevelTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  maxLevelText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  levelsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  levelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#F5F5F5',
  },
  levelItemCurrent: {
    backgroundColor: '#E8F5E9',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  levelItemLocked: {
    opacity: 0.5,
  },
  levelItemIcon: {
    fontSize: 30,
    marginRight: 15,
  },
  levelItemInfo: {
    flex: 1,
  },
  levelItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  levelItemNameLocked: {
    color: '#999',
  },
  levelItemThreshold: {
    fontSize: 14,
    color: '#666',
  },
  currentBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  currentBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  unlockedCheck: {
    fontSize: 24,
    color: '#4CAF50',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  earnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  earnIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  earnText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
});
