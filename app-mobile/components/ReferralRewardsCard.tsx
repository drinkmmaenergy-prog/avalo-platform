/**
 * Referral Rewards Card Component
 * Displays reward grid with progress bar
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { getAllRewards, getProgressToNextReward, isRewardUnlocked, type ReferralState } from '../services/referralService';

interface ReferralRewardsCardProps {
  state: ReferralState;
}

export default function ReferralRewardsCard({ state }: ReferralRewardsCardProps) {
  const { t } = useTranslation();
  const allRewards = getAllRewards();
  const progress = getProgressToNextReward(state.invitedCount);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('referrals.rewards')}</Text>
        <Text style={styles.subtitle}>
          {t('referrals.referralsCount', { count: state.invitedCount })}
        </Text>
      </View>

      {/* Progress Bar */}
      {progress.nextReward && (
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>{t('referrals.progress')}</Text>
            <Text style={styles.progressCount}>
              {progress.current} / {progress.target}
            </Text>
          </View>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${(progress.current / progress.target) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.nextRewardText}>
            Next: {progress.nextReward.icon} {progress.nextReward.title}
          </Text>
        </View>
      )}

      {/* Rewards Grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rewardsScroll}>
        <View style={styles.rewardsGrid}>
          {allRewards.map((reward) => {
            const unlocked = isRewardUnlocked(state, reward.id);
            return (
              <View
                key={reward.id}
                style={[
                  styles.rewardCard,
                  unlocked ? styles.rewardCardUnlocked : styles.rewardCardLocked,
                ]}
              >
                <Text style={styles.rewardIcon}>{unlocked ? reward.icon : '🔒'}</Text>
                <Text
                  style={[
                    styles.rewardTitle,
                    !unlocked && styles.rewardTitleLocked,
                  ]}
                  numberOfLines={2}
                >
                  {reward.title}
                </Text>
                <Text
                  style={[
                    styles.rewardDescription,
                    !unlocked && styles.rewardDescriptionLocked,
                  ]}
                  numberOfLines={2}
                >
                  {reward.description}
                </Text>
                <View style={styles.rewardTarget}>
                  <Text
                    style={[
                      styles.rewardTargetText,
                      unlocked && styles.rewardTargetUnlocked,
                    ]}
                  >
                    {reward.targetReferrals} {reward.targetReferrals === 1 ? t('referrals.reward1Target').split(' ')[1] : t('referrals.reward2Target').split(' ')[1]}
                  </Text>
                </View>
                {unlocked && (
                  <View style={styles.unlockedBadge}>
                    <Text style={styles.unlockedText}>✓</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Cost Info */}
      <Text style={styles.costInfo}>{t('referrals.costInfo')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  progressContainer: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  progressCount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#40E0D0',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#40E0D0',
    borderRadius: 4,
  },
  nextRewardText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  rewardsScroll: {
    marginBottom: 16,
  },
  rewardsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  rewardCard: {
    width: 160,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    position: 'relative',
  },
  rewardCardUnlocked: {
    backgroundColor: '#F0F8FF',
    borderColor: '#D4AF37',
  },
  rewardCardLocked: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
  },
  rewardIcon: {
    fontSize: 32,
    marginBottom: 8,
    textAlign: 'center',
  },
  rewardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
    textAlign: 'center',
    minHeight: 36,
  },
  rewardTitleLocked: {
    color: '#999',
  },
  rewardDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
    minHeight: 32,
  },
  rewardDescriptionLocked: {
    color: '#AAA',
  },
  rewardTarget: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    alignSelf: 'center',
  },
  rewardTargetText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  rewardTargetUnlocked: {
    color: '#D4AF37',
  },
  unlockedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D4AF37',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  unlockedText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  costInfo: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
