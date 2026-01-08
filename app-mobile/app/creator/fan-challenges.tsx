import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/contexts/AuthContext";
import {
  createChallenge,
  getActiveChallenge,
  getChallengeStats,
  endChallengeEarly,
  expireChallengesIfNeeded,
  getChallengeTypeInfo,
  getRewardInfo,
  type ChallengeType,
  type ChallengeDuration,
  type CosmeticReward,
  type ChallengeConfig,
  type Challenge,
  type ChallengeStats,
} from "@/services/fanChallengeService";

const COLORS = {
  background: '#0F0F0F',
  gold: '#D4AF37',
  turquoise: '#40E0D0',
  darkGray: '#1A1A1A',
  mediumGray: '#2A2A2A',
  lightGray: '#CCCCCC',
  white: '#FFFFFF',
};

export default function FanChallengesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [stats, setStats] = useState<ChallengeStats | null>(null);
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<ChallengeType | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<ChallengeDuration | null>(null);
  const [selectedReward, setSelectedReward] = useState<CosmeticReward | null>(null);

  useEffect(() => {
    loadChallenge();
  }, []);

  const loadChallenge = async () => {
    try {
      setLoading(true);
      await expireChallengesIfNeeded();
      
      if (user?.uid) {
        const challenge = await getActiveChallenge(user.uid);
        setActiveChallenge(challenge);
        
        if (challenge) {
          const challengeStats = await getChallengeStats(user.uid);
          setStats(challengeStats);
        }
      }
    } catch (error) {
      console.error('Error loading challenge:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChallenge = async () => {
    if (!selectedType || !selectedDuration || !selectedReward || !user?.uid) {
      return;
    }

    try {
      setCreating(true);
      const config: ChallengeConfig = {
        type: selectedType,
        duration: selectedDuration,
        reward: selectedReward,
      };

      await createChallenge(user.uid, config);
      Alert.alert(
        t('common.success'),
        t('fanChallenge.creator.challengeCreated')
      );
      
      // Reset wizard
      setStep(1);
      setSelectedType(null);
      setSelectedDuration(null);
      setSelectedReward(null);
      
      // Reload challenge
      await loadChallenge();
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('fanChallenge.errors.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleEndChallenge = () => {
    Alert.alert(
      t('fanChallenge.creator.endConfirm'),
      t('fanChallenge.creator.endWarning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            if (user?.uid) {
              await endChallengeEarly(user.uid);
              Alert.alert(
                t('common.success'),
                t('fanChallenge.creator.challengeEndedEarly')
              );
              await loadChallenge();
            }
          },
        },
      ]
    );
  };

  const formatTimeRemaining = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  const renderActiveChallengeCard = () => {
    if (!activeChallenge || !stats) return null;

    const typeInfo = getChallengeTypeInfo(activeChallenge.type);
    const rewardInfo = getRewardInfo(activeChallenge.reward);

    return (
      <View style={styles.activeChallengeCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardHeaderText}>
            {t('fanChallenge.activeChallenge')}
          </Text>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        <View style={styles.challengeInfo}>
          <View style={styles.challengeIcon}>
            <Text style={styles.challengeEmoji}>{typeInfo.icon}</Text>
          </View>
          <View style={styles.challengeDetails}>
            <Text style={styles.challengeTitle}>{typeInfo.title}</Text>
            <Text style={styles.challengeDescription}>{typeInfo.description}</Text>
          </View>
        </View>

        <View style={styles.rewardSection}>
          <Text style={styles.rewardLabel}>{t('fanChallenge.reward')}:</Text>
          <View style={styles.rewardBadge}>
            <Text style={styles.rewardEmoji}>{rewardInfo.icon}</Text>
            <Text style={styles.rewardText}>{rewardInfo.title}</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats.participantsCount}</Text>
            <Text style={styles.statLabel}>{t('fanChallenge.participants')}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats.completionCount}</Text>
            <Text style={styles.statLabel}>{t('fanChallenge.completions')}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {formatTimeRemaining(stats.remainingTime)}
            </Text>
            <Text style={styles.statLabel}>{t('fanChallenge.timeRemaining')}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.endButton}
          onPress={handleEndChallenge}
        >
          <Text style={styles.endButtonText}>
            {t('fanChallenge.endEarly')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderWizardStep1 = () => {
    const types: ChallengeType[] = [
      'SEND_MESSAGES',
      'FIRST_MESSAGES',
      'VIEW_PPV',
      'JOIN_LIVE',
      'AI_SESSION',
    ];

    return (
      <View style={styles.wizardStep}>
        <Text style={styles.stepTitle}>{t('fanChallenge.step1')}</Text>
        <Text style={styles.stepSubtitle}>{t('fanChallenge.selectType')}</Text>

        <View style={styles.optionsGrid}>
          {types.map((type) => {
            const info = getChallengeTypeInfo(type);
            const isSelected = selectedType === type;

            return (
              <TouchableOpacity
                key={type}
                style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                onPress={() => setSelectedType(type)}
              >
                <Text style={styles.optionEmoji}>{info.icon}</Text>
                <Text style={styles.optionTitle}>{info.title}</Text>
                <Text style={styles.optionDescription}>{info.description}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.nextButton, !selectedType && styles.nextButtonDisabled]}
          onPress={() => selectedType && setStep(2)}
          disabled={!selectedType}
        >
          <Text style={styles.nextButtonText}>{t('common.next')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderWizardStep2 = () => {
    const durations: ChallengeDuration[] = [24, 48, 72];

    return (
      <View style={styles.wizardStep}>
        <Text style={styles.stepTitle}>{t('fanChallenge.step2')}</Text>
        <Text style={styles.stepSubtitle}>{t('fanChallenge.selectDuration')}</Text>

        <View style={styles.durationOptions}>
          {durations.map((duration) => {
            const isSelected = selectedDuration === duration;

            return (
              <TouchableOpacity
                key={duration}
                style={[styles.durationCard, isSelected && styles.durationCardSelected]}
                onPress={() => setSelectedDuration(duration)}
              >
                <Text style={styles.durationValue}>{duration}</Text>
                <Text style={styles.durationLabel}>{t('common.hours')}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.wizardButtons}>
          <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.nextButton, !selectedDuration && styles.nextButtonDisabled]}
            onPress={() => selectedDuration && setStep(3)}
            disabled={!selectedDuration}
          >
            <Text style={styles.nextButtonText}>{t('common.next')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderWizardStep3 = () => {
    const rewards: CosmeticReward[] = [
      'GOLDEN_FRAME',
      'SPOTLIGHT_BADGE',
      'SMARTMATCH_GLOW',
      'SUPERFAN_TITLE',
    ];

    return (
      <View style={styles.wizardStep}>
        <Text style={styles.stepTitle}>{t('fanChallenge.step3')}</Text>
        <Text style={styles.stepSubtitle}>{t('fanChallenge.selectReward')}</Text>

        <View style={styles.rewardsGrid}>
          {rewards.map((reward) => {
            const info = getRewardInfo(reward);
            const isSelected = selectedReward === reward;

            return (
              <TouchableOpacity
                key={reward}
                style={[styles.rewardCard, isSelected && styles.rewardCardSelected]}
                onPress={() => setSelectedReward(reward)}
              >
                <Text style={styles.rewardCardEmoji}>{info.icon}</Text>
                <Text style={styles.rewardCardTitle}>{info.title}</Text>
                <Text style={styles.rewardCardDescription}>{info.description}</Text>
                <Text style={styles.rewardCardDuration}>{info.duration}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.costInfo}>
          <Text style={styles.costInfoText}>
            {t('fanChallenge.cosmeticOnly')}
          </Text>
          <Text style={styles.costInfoSubtext}>
            {t('fanChallenge.noTokenRewards')}
          </Text>
        </View>

        <View style={styles.wizardButtons}>
          <TouchableOpacity style={styles.backButton} onPress={() => setStep(2)}>
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.createButton, (!selectedReward || creating) && styles.createButtonDisabled]}
            onPress={handleCreateChallenge}
            disabled={!selectedReward || creating}
          >
            {creating ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <Text style={styles.createButtonText}>
                {t('fanChallenge.createChallenge')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.turquoise} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('fanChallenge.title')}</Text>
          <Text style={styles.subtitle}>{t('fanChallenge.subtitle')}</Text>
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoText}>
            {t('fanChallenge.creator.engagementBoost')}
          </Text>
          <View style={styles.infoHighlight}>
            <Text style={styles.infoHighlightText}>
              {t('fanChallenge.creator.noTokenCost')}
            </Text>
          </View>
          <View style={styles.rules}>
            <Text style={styles.ruleText}>• {t('fanChallenge.creator.ruleOneActive')}</Text>
            <Text style={styles.ruleText}>• {t('fanChallenge.creator.ruleDuration')}</Text>
            <Text style={styles.ruleText}>• {t('fanChallenge.creator.ruleRewards')}</Text>
          </View>
        </View>

        {/* Active Challenge or Create New */}
        {activeChallenge ? (
          renderActiveChallengeCard()
        ) : (
          <View style={styles.createSection}>
            <View style={styles.noChallengeBanner}>
              <Text style={styles.noChallengeTitle}>
                {t('fanChallenge.noActiveChallenge')}
              </Text>
              <Text style={styles.noChallengeSubtitle}>
                {t('fanChallenge.createYourFirst')}
              </Text>
            </View>

            {step === 1 && renderWizardStep1()}
            {step === 2 && renderWizardStep2()}
            {step === 3 && renderWizardStep3()}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.lightGray,
  },
  infoSection: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
  },
  infoText: {
    fontSize: 15,
    color: COLORS.white,
    marginBottom: 16,
    lineHeight: 22,
  },
  infoHighlight: {
    backgroundColor: COLORS.mediumGray,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoHighlightText: {
    fontSize: 14,
    color: COLORS.turquoise,
    fontWeight: '600',
    textAlign: 'center',
  },
  rules: {
    gap: 8,
  },
  ruleText: {
    fontSize: 14,
    color: COLORS.lightGray,
    lineHeight: 20,
  },
  activeChallengeCard: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 18,
    padding: 20,
    borderWidth: 2,
    borderColor: COLORS.turquoise,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.mediumGray,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginRight: 6,
  },
  liveText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  challengeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  challengeIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.mediumGray,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  challengeEmoji: {
    fontSize: 32,
  },
  challengeDetails: {
    flex: 1,
  },
  challengeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 4,
  },
  challengeDescription: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  rewardSection: {
    marginBottom: 20,
  },
  rewardLabel: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginBottom: 8,
  },
  rewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gold + '20',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  rewardEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  rewardText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.gold,
  },
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.mediumGray,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.turquoise,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.lightGray,
    textAlign: 'center',
  },
  endButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  endButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  createSection: {
    gap: 24,
  },
  noChallengeBanner: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
  },
  noChallengeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  noChallengeSubtitle: {
    fontSize: 14,
    color: COLORS.lightGray,
    textAlign: 'center',
  },
  wizardStep: {
    gap: 20,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  stepSubtitle: {
    fontSize: 15,
    color: COLORS.lightGray,
  },
  optionsGrid: {
    gap: 12,
  },
  optionCard: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 18,
    padding: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardSelected: {
    borderColor: COLORS.turquoise,
    backgroundColor: COLORS.turquoise + '10',
  },
  optionEmoji: {
    fontSize: 32,
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 6,
  },
  optionDescription: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  durationOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  durationCard: {
    flex: 1,
    backgroundColor: COLORS.darkGray,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  durationCardSelected: {
    borderColor: COLORS.turquoise,
    backgroundColor: COLORS.turquoise + '10',
  },
  durationValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 4,
  },
  durationLabel: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  rewardsGrid: {
    gap: 12,
  },
  rewardCard: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 18,
    padding: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rewardCardSelected: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.gold + '10',
  },
  rewardCardEmoji: {
    fontSize: 32,
    marginBottom: 12,
  },
  rewardCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 6,
  },
  rewardCardDescription: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginBottom: 8,
  },
  rewardCardDuration: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: '600',
  },
  costInfo: {
    backgroundColor: COLORS.mediumGray,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  costInfoText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  costInfoSubtext: {
    fontSize: 12,
    color: COLORS.lightGray,
    textAlign: 'center',
  },
  wizardButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flex: 1,
    backgroundColor: COLORS.mediumGray,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  nextButton: {
    flex: 2,
    backgroundColor: COLORS.turquoise,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  createButton: {
    flex: 2,
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
});
