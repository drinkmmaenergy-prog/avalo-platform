/**
 * Streak Card Component - Phase 31D-4
 * Displays daily swipe streak with progress to next milestone
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from '../hooks/useTranslation';

type StreakCardProps = {
  currentStreak: number;
  onViewRewards?: () => void;
};

export default function StreakCard({
  currentStreak,
  onViewRewards,
}: StreakCardProps) {
  const { t } = useTranslation();

  // Define milestones
  const milestones = [3, 7, 14];
  
  // Find next milestone
  const nextMilestone = milestones.find(m => m > currentStreak) || 14;
  const previousMilestone = [...milestones].reverse().find(m => m <= currentStreak) || 0;
  
  // Calculate progress to next milestone
  const progressToNext = previousMilestone < nextMilestone
    ? ((currentStreak - previousMilestone) / (nextMilestone - previousMilestone)) * 100
    : 100;

  // Get milestone reward info
  const getMilestoneReward = (days: number): string => {
    switch (days) {
      case 3:
        return t('gamification.swipe.streak.reward3Days');
      case 7:
        return t('gamification.swipe.streak.reward7Days');
      case 14:
        return t('gamification.swipe.streak.reward14Days');
      default:
        return '';
    }
  };

  const nextReward = getMilestoneReward(nextMilestone);
  const hasReachedMilestone = milestones.includes(currentStreak);

  return (
    <TouchableOpacity
      style={[
        styles.container,
        hasReachedMilestone && styles.containerHighlighted
      ]}
      onPress={onViewRewards}
      activeOpacity={0.8}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.streakBadge}>
          <Text style={styles.streakEmoji}>🔥</Text>
          <Text style={styles.streakNumber}>{currentStreak}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>
            {currentStreak} {t('gamification.swipe.streak.day')} {t('gamification.swipe.streak.streak')}
          </Text>
          {hasReachedMilestone && (
            <Text style={styles.milestone}>
              🎉 {t('gamification.swipe.streak.milestoneReached')}
            </Text>
          )}
        </View>
      </View>

      {/* Progress to next milestone */}
      {currentStreak < 14 && (
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>
              {t('gamification.swipe.streak.nextReward')}: {nextMilestone} {t('gamification.swipe.streak.days')}
            </Text>
            <Text style={styles.progressDays}>
              {nextMilestone - currentStreak} {t('gamification.swipe.streak.daysLeft')}
            </Text>
          </View>
          
          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(progressToNext, 100)}%` },
              ]}
            />
          </View>

          <Text style={styles.rewardText}>{nextReward}</Text>
        </View>
      )}

      {/* Max streak reached */}
      {currentStreak >= 14 && (
        <View style={styles.maxStreakSection}>
          <Text style={styles.maxStreakText}>
            👑 {t('gamification.swipe.streak.maxStreak')}
          </Text>
          <Text style={styles.maxStreakSubtext}>
            {t('gamification.swipe.streak.keepItUp')}
          </Text>
        </View>
      )}

      {/* View Rewards Button */}
      {hasReachedMilestone && (
        <View style={styles.rewardAvailable}>
          <Text style={styles.rewardAvailableText}>
            ⭐ {t('gamification.swipe.streak.rewardAvailable')}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#40E0D0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  containerHighlighted: {
    borderColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOpacity: 0.3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  streakBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFE0B2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  streakEmoji: {
    fontSize: 24,
    position: 'absolute',
    top: 4,
  },
  streakNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF6B00',
    marginTop: 20,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  milestone: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D4AF37',
  },
  progressSection: {
    marginTop: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  progressDays: {
    fontSize: 12,
    fontWeight: '500',
    color: '#40E0D0',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: '#E0F7FA',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#40E0D0',
    borderRadius: 3,
  },
  rewardText: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
  },
  maxStreakSection: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  maxStreakText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 4,
  },
  maxStreakSubtext: {
    fontSize: 12,
    color: '#666',
  },
  rewardAvailable: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    alignItems: 'center',
  },
  rewardAvailableText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D4AF37',
  },
});
