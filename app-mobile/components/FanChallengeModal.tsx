import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import {
  joinChallenge,
  getUserChallengeProgress,
  getChallengeTypeInfo,
  getRewardInfo,
  type Challenge,
  type ChallengeProgress,
} from '../services/fanChallengeService';

const COLORS = {
  background: '#0F0F0F',
  gold: '#D4AF37',
  turquoise: '#40E0D0',
  darkGray: '#1A1A1A',
  mediumGray: '#2A2A2A',
  lightGray: '#CCCCCC',
  white: '#FFFFFF',
  green: '#34C759',
};

interface FanChallengeModalProps {
  visible: boolean;
  challenge: Challenge | null;
  userId: string;
  onClose: () => void;
  onJoin?: () => void;
}

export default function FanChallengeModal({
  visible,
  challenge,
  userId,
  onClose,
  onJoin,
}: FanChallengeModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ChallengeProgress | null>(null);
  const [scaleAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      loadProgress();
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [visible, challenge]);

  const loadProgress = async () => {
    if (!challenge || !userId) return;

    try {
      const userProgress = await getUserChallengeProgress(challenge.id, userId);
      setProgress(userProgress);
    } catch (error) {
      console.error('Error loading progress:', error);
    }
  };

  const handleJoin = async () => {
    if (!challenge || !userId) return;

    try {
      setLoading(true);
      await joinChallenge(challenge.creatorId, userId);
      await loadProgress();
      onJoin?.();
    } catch (error: any) {
      console.error('Error joining challenge:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRemaining = (endTime: number) => {
    const remaining = endTime - Date.now();
    if (remaining <= 0) return t('fanChallenge.expired');

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  const getProgressPercentage = () => {
    if (!progress) return 0;
    return (progress.progress / progress.target) * 100;
  };

  const getMotivationalMessage = () => {
    if (!progress) return '';

    const percentage = getProgressPercentage();
    if (percentage === 0) {
      return t('fanChallenge.motivational.greatStart');
    } else if (percentage < 50) {
      return t('fanChallenge.motivational.keepMomentum');
    } else if (percentage < 100) {
      return t('fanChallenge.motivational.almostThere');
    } else {
      return t('fanChallenge.motivational.wellDone');
    }
  };

  if (!challenge) return null;

  const typeInfo = getChallengeTypeInfo(challenge.type);
  const rewardInfo = getRewardInfo(challenge.reward);
  const hasJoined = !!progress;
  const isCompleted = progress?.completed || false;
  const progressPercentage = getProgressPercentage();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.gradient}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.iconContainer}>
                  <Text style={styles.iconEmoji}>{typeInfo.icon}</Text>
                </View>
                <Text style={styles.title}>{typeInfo.title}</Text>
                <Text style={styles.subtitle}>{typeInfo.description}</Text>
              </View>

              {/* Time Remaining Banner */}
              <View style={styles.timeBanner}>
                <Text style={styles.timeLabel}>{t('fanChallenge.timeLeft')}</Text>
                <Text style={styles.timeValue}>
                  {formatTimeRemaining(challenge.endTime)}
                </Text>
              </View>

              {/* Progress Section (if joined) */}
              {hasJoined && (
                <View style={styles.progressSection}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressTitle}>
                      {t('fanChallenge.yourProgress')}
                    </Text>
                    <Text style={styles.progressValue}>
                      {progress?.progress || 0} / {progress?.target || 0}
                    </Text>
                  </View>

                  <View style={styles.progressBarContainer}>
                    <View style={styles.progressBarBackground}>
                      <Animated.View
                        style={[
                          styles.progressBarFill,
                          { width: `${progressPercentage}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressPercentage}>
                      {Math.round(progressPercentage)}%
                    </Text>
                  </View>

                  {!isCompleted && (
                    <View style={styles.motivationBanner}>
                      <Text style={styles.motivationText}>
                        {getMotivationalMessage()}
                      </Text>
                    </View>
                  )}

                  {isCompleted && (
                    <View style={styles.completedBanner}>
                      <Text style={styles.completedEmoji}>🎉</Text>
                      <Text style={styles.completedText}>
                        {t('fanChallenge.complete')}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Instructions */}
              <View style={styles.instructionsSection}>
                <Text style={styles.sectionTitle}>{t('fanChallenge.task')}</Text>
                <Text style={styles.instructionsText}>
                  {t(`fanChallenge.instructions.${challenge.type}`)}
                </Text>
              </View>

              {/* Reward Section */}
              <View style={styles.rewardSection}>
                <Text style={styles.sectionTitle}>
                  {t('fanChallenge.completionReward')}
                </Text>
                <View style={styles.rewardCard}>
                  <Text style={styles.rewardEmoji}>{rewardInfo.icon}</Text>
                  <View style={styles.rewardInfo}>
                    <Text style={styles.rewardTitle}>{rewardInfo.title}</Text>
                    <Text style={styles.rewardDescription}>
                      {rewardInfo.description}
                    </Text>
                    <Text style={styles.rewardDuration}>
                      {t('fanChallenge.expiresIn')}: {rewardInfo.duration}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Info Banner */}
              <View style={styles.infoBanner}>
                <Text style={styles.infoText}>{t('fanChallenge.viewer.freeToJoin')}</Text>
                <Text style={styles.infoSubtext}>{t('fanChallenge.cosmeticOnly')}</Text>
              </View>
            </ScrollView>

            {/* Action Button */}
            <View style={styles.actionContainer}>
              {!hasJoined ? (
                <TouchableOpacity
                  style={[styles.actionButton, loading && styles.actionButtonDisabled]}
                  onPress={handleJoin}
                  disabled={loading}
                >
                  <View style={styles.actionButtonGradient}>
                    {loading ? (
                     <ActivityIndicator color={COLORS.background} />
                    ) : (
                      <>
                        <Text style={styles.actionButtonText}>
                          {t('fanChallenge.join')}
                        </Text>
                        <Text style={styles.actionButtonIcon}>🚀</Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              ) : isCompleted ? (
                <TouchableOpacity style={styles.completedButton} onPress={onClose}>
                  <Text style={styles.completedButtonText}>
                    {t('fanChallenge.viewRewards')}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.continueButton} onPress={onClose}>
                  <Text style={styles.continueButtonText}>
                    {t('fanChallenge.continue')}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>{t('fanChallenge.closeDetails')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    width: '90%',
    maxHeight: '85%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    backgroundColor: COLORS.darkGray,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.mediumGray,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconEmoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.lightGray,
    textAlign: 'center',
  },
  timeBanner: {
    backgroundColor: COLORS.turquoise + '20',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.turquoise,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 14,
    color: COLORS.lightGray,
    fontWeight: '600',
  },
  timeValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.turquoise,
  },
  progressSection: {
    backgroundColor: COLORS.mediumGray,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  progressValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.turquoise,
  },
  progressBarContainer: {
    marginBottom: 12,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: COLORS.darkGray,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.turquoise,
    borderRadius: 4,
  },
  progressPercentage: {
    fontSize: 14,
    color: COLORS.lightGray,
    textAlign: 'right',
  },
  motivationBanner: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 12,
    padding: 12,
  },
  motivationText: {
    fontSize: 14,
    color: COLORS.turquoise,
    fontWeight: '600',
    textAlign: 'center',
  },
  completedBanner: {
    backgroundColor: COLORS.green + '20',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.green,
  },
  completedEmoji: {
    fontSize: 24,
    marginRight: 8,
  },
  completedText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.green,
  },
  instructionsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 15,
    color: COLORS.lightGray,
    lineHeight: 22,
  },
  rewardSection: {
    marginBottom: 24,
  },
  rewardCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.gold + '10',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  rewardEmoji: {
    fontSize: 40,
    marginRight: 16,
  },
  rewardInfo: {
    flex: 1,
  },
  rewardTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.gold,
    marginBottom: 6,
  },
  rewardDescription: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginBottom: 8,
    lineHeight: 20,
  },
  rewardDuration: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: '600',
  },
  infoBanner: {
    backgroundColor: COLORS.mediumGray,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  infoSubtext: {
    fontSize: 12,
    color: COLORS.lightGray,
    textAlign: 'center',
  },
  actionContainer: {
    padding: 24,
    paddingTop: 0,
  },
  actionButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: COLORS.turquoise,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
    backgroundColor: COLORS.turquoise,
  },
  actionButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  actionButtonIcon: {
    fontSize: 20,
  },
  continueButton: {
    backgroundColor: COLORS.mediumGray,
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  completedButton: {
    backgroundColor: COLORS.gold,
    borderRadius: 16,
    paddingVertical: 18,
    marginBottom: 12,
    alignItems: 'center',
  },
  completedButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  closeButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    color: COLORS.lightGray,
    fontWeight: '600',
  },
});
