/**
 * Streak Reward Modal Component - Phase 31D-4
 * Shows claimable streak rewards (zero-cost for Avalo)
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import {
  getClaimableRewards,
  claimReward,
  type StreakReward,
} from '../utils/streakEngine';

type StreakRewardModalProps = {
  visible: boolean;
  onClose: () => void;
  onRewardClaimed?: () => void;
};

export default function StreakRewardModal({
  visible,
  onClose,
  onRewardClaimed,
}: StreakRewardModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState<StreakReward[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadRewards();
    }
  }, [visible]);

  const loadRewards = async () => {
    try {
      setLoading(true);
      const claimableRewards = await getClaimableRewards();
      setRewards(claimableRewards);
    } catch (error) {
      console.error('[StreakRewardModal] Error loading rewards:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimReward = async (reward: StreakReward) => {
    if (reward.claimed) return;

    try {
      setClaiming(reward.id);
      const success = await claimReward(reward.id);

      if (success) {
        Alert.alert(
          t('gamification.swipe.rewards.claimed'),
          t('gamification.swipe.rewards.claimedMessage', {
            name: reward.name,
            duration: reward.duration,
          }),
          [{ text: t('common.ok') }]
        );

        // Refresh rewards
        await loadRewards();
        onRewardClaimed?.();
      } else {
        Alert.alert(
          t('common.error'),
          t('gamification.swipe.rewards.claimFailed')
        );
      }
    } catch (error) {
      console.error('[StreakRewardModal] Error claiming reward:', error);
      Alert.alert(
        t('common.error'),
        t('gamification.swipe.rewards.claimFailed')
      );
    } finally {
      setClaiming(null);
    }
  };

  const getRewardIcon = (type: StreakReward['type']): string => {
    switch (type) {
      case 'golden_frame':
        return '🖼️';
      case 'discover_boost':
        return '🚀';
      case 'visibility_boost':
        return '⭐';
      default:
        return '🎁';
    }
  };

  const getTimeRemaining = (expiresAt: number): string => {
    const now = Date.now();
    const diff = expiresAt - now;
    
    if (diff <= 0) return t('gamification.swipe.rewards.expired');

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const unclaimedRewards = rewards.filter(r => !r.claimed);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>
                🎁 {t('gamification.swipe.rewards.title')}
              </Text>
              <Text style={styles.subtitle}>
                {unclaimedRewards.length} {t('gamification.swipe.rewards.available')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Rewards List */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#D4AF37" />
            </View>
          ) : rewards.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🎯</Text>
              <Text style={styles.emptyTitle}>
                {t('gamification.swipe.rewards.noRewards')}
              </Text>
              <Text style={styles.emptyText}>
                {t('gamification.swipe.rewards.keepStreakGoing')}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.rewardsContainer}
              showsVerticalScrollIndicator={false}
            >
              {rewards.map((reward) => (
                <View
                  key={reward.id}
                  style={[
                    styles.rewardCard,
                    reward.claimed && styles.rewardCardClaimed,
                  ]}
                >
                  {/* Reward Icon */}
                  <View style={styles.rewardIcon}>
                    <Text style={styles.rewardIconText}>
                      {getRewardIcon(reward.type)}
                    </Text>
                  </View>

                  {/* Reward Info */}
                  <View style={styles.rewardInfo}>
                    <Text style={styles.rewardName}>{reward.name}</Text>
                    <Text style={styles.rewardDescription}>
                      {reward.description}
                    </Text>
                    
                    <View style={styles.rewardMeta}>
                      <Text style={styles.rewardDuration}>
                        ⏱️ {reward.duration}h {t('gamification.swipe.rewards.duration')}
                      </Text>
                      {!reward.claimed && (
                        <Text style={styles.rewardExpires}>
                          {t('gamification.swipe.rewards.expiresIn')}: {getTimeRemaining(reward.expiresAt)}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Claim Button */}
                  {!reward.claimed ? (
                    <TouchableOpacity
                      style={[
                        styles.claimButton,
                        claiming === reward.id && styles.claimButtonDisabled,
                      ]}
                      onPress={() => handleClaimReward(reward)}
                      disabled={claiming === reward.id}
                    >
                      {claiming === reward.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.claimButtonText}>
                          {t('gamification.swipe.rewards.claim')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.claimedBadge}>
                      <Text style={styles.claimedBadgeText}>✓</Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          )}

          {/* Info Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              💡 {t('gamification.swipe.rewards.info')}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#D4AF37',
    fontWeight: '600',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  scrollView: {
    flex: 1,
  },
  rewardsContainer: {
    padding: 16,
    gap: 12,
  },
  rewardCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  rewardCardClaimed: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
    opacity: 0.7,
  },
  rewardIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  rewardIconText: {
    fontSize: 28,
  },
  rewardInfo: {
    flex: 1,
  },
  rewardName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  rewardDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
  },
  rewardMeta: {
    gap: 2,
  },
  rewardDuration: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  rewardExpires: {
    fontSize: 11,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  claimButton: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  claimButtonDisabled: {
    opacity: 0.6,
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  claimedBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  claimedBadgeText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
});
