/**
 * Rewards Hub Screen - Phase 32-5
 * First-time rewards unlock after FTUX completion
 * UI-ONLY: Zero backend calls, cosmetic rewards only
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from "@/hooks/useTranslation";
import {
  RewardStoreState,
  RewardDefinition,
  loadRewardStoreState,
  saveRewardStoreState,
  activateReward,
  getRewardStatus,
  getTimeRemaining,
  dismissRewardStore,
  initRewardStore,
} from "@/services/rewardStoreService";

export default function RewardsHubScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [state, setState] = useState<RewardStoreState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activatingRewardId, setActivatingRewardId] = useState<string | null>(null);

  // Load reward store state
  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      setIsLoading(true);
      let loadedState = await loadRewardStoreState();
      
      // If no state exists, initialize new reward store
      if (!loadedState) {
        loadedState = initRewardStore();
        await saveRewardStoreState(loadedState);
      }
      
      setState(loadedState);
    } catch (error) {
      console.error('[Rewards Hub] Error loading state:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivateReward = async (rewardId: string) => {
    if (!state) return;
    
    try {
      setActivatingRewardId(rewardId);
      
      // Activate reward
      const updatedState = activateReward(state, rewardId as any);
      
      // Save to AsyncStorage
      await saveRewardStoreState(updatedState);
      
      // Update local state
      setState(updatedState);
      
      // Show success message
      const reward = state.availableRewards.find(r => r.id === rewardId);
      if (reward) {
        Alert.alert(
          t('common.success'),
          t('rewardHub.activationSuccess', { name: t(reward.titleKey) })
        );
      }
    } catch (error) {
      console.error('[Rewards Hub] Error activating reward:', error);
      Alert.alert(t('common.error'), t('errors.unknownError'));
    } finally {
      setActivatingRewardId(null);
    }
  };

  const handleDismiss = async () => {
    if (!state) return;
    
    try {
      const updatedState = dismissRewardStore(state);
      await saveRewardStoreState(updatedState);
      router.back();
    } catch (error) {
      console.error('[Rewards Hub] Error dismissing store:', error);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
        </View>
      </SafeAreaView>
    );
  }

  if (!state) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{t('errors.unknownError')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Check if all rewards are activated
  const allActivated = state.availableRewards.every(
    reward => getRewardStatus(state, reward.id) === 'ACTIVATED'
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>{t('rewardHub.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('rewardHub.subtitle')}</Text>
        </View>
      </View>

      {/* Rewards List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>💎 {t('rewardHub.costInfo')}</Text>
        </View>

        {/* All Activated Message */}
        {allActivated && (
          <View style={styles.allActivatedBanner}>
            <Text style={styles.allActivatedIcon}>🎉</Text>
            <Text style={styles.allActivatedText}>
              {t('rewardHub.noRewardsAvailable')}
            </Text>
          </View>
        )}

        {/* Reward Cards */}
        {state.availableRewards.map((reward, index) => (
          <RewardCard
            key={reward.id}
            reward={reward}
            state={state}
            onActivate={() => handleActivateReward(reward.id)}
            isActivating={activatingRewardId === reward.id}
            t={t}
            index={index}
          />
        ))}

        {/* Dismiss Button */}
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={handleDismiss}
          activeOpacity={0.7}
        >
          <Text style={styles.dismissButtonText}>{t('rewardHub.dismissButton')}</Text>
        </TouchableOpacity>

        {/* Bottom Padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Reward Card Component
interface RewardCardProps {
  reward: RewardDefinition;
  state: RewardStoreState;
  onActivate: () => void;
  isActivating: boolean;
  t: (key: string, params?: Record<string, any>) => string;
  index: number;
}

function RewardCard({ reward, state, onActivate, isActivating, t, index }: RewardCardProps) {
  const status = getRewardStatus(state, reward.id);
  const isActivated = status === 'ACTIVATED';
  
  // Get activation details for time-based rewards
  const activation = state.activatedRewards.find(ar => ar.rewardId === reward.id);
  const timeRemaining = activation ? getTimeRemaining(activation) : null;
  
  // Animated fade-in
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  
  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      delay: index * 80,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.rewardCard, { opacity: fadeAnim }]}>
      {/* Gold border for activated rewards */}
      {isActivated && <View style={styles.activatedBorder} />}
      
      <View style={styles.rewardContent}>
        {/* Icon */}
        <View style={[styles.rewardIcon, isActivated && styles.rewardIconActivated]}>
          <Text style={styles.rewardIconText}>{reward.icon}</Text>
        </View>
        
        {/* Info */}
        <View style={styles.rewardInfo}>
          <Text style={styles.rewardTitle}>{t(reward.titleKey)}</Text>
          <Text style={styles.rewardDescription} numberOfLines={2}>
            {t(reward.descriptionKey)}
          </Text>
          
          {/* Duration/Time Remaining */}
          {reward.duration !== undefined && (
            <View style={styles.durationContainer}>
              {isActivated && timeRemaining ? (
                <Text style={styles.timeRemaining}>
                  ⏱️ {t('rewardHub.timeRemaining', { time: timeRemaining })}
                </Text>
              ) : (
                <Text style={styles.duration}>
                  🕐 {reward.duration}h
                </Text>
              )}
            </View>
          )}
          {reward.duration === undefined && (
            <View style={styles.durationContainer}>
              <Text style={styles.permanent}>
                ♾️ {t('rewardHub.permanent')}
              </Text>
            </View>
          )}
        </View>
        
        {/* Action Button */}
        <TouchableOpacity
          style={[
            styles.actionButton,
            isActivated && styles.actionButtonActivated,
          ]}
          onPress={onActivate}
          disabled={isActivated || isActivating}
          activeOpacity={0.7}
        >
          {isActivating ? (
            <ActivityIndicator size="small" color="#0F0F0F" />
          ) : (
            <Text style={[
              styles.actionButtonText,
              isActivated && styles.actionButtonTextActivated,
            ]}>
              {isActivated ? t('rewardHub.activated') : t('rewardHub.activate')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
      
      {/* Glow effect for activated rewards */}
      {isActivated && (
        <View style={styles.glowEffect} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181818',
    borderRadius: 20,
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 24,
    color: '#D4AF37',
    fontWeight: '600',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#D4AF37',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#999',
  },
  
  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  
  // Info Banner
  infoBanner: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoBannerText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#D4AF37',
    textAlign: 'center',
  },
  
  // All Activated Banner
  allActivatedBanner: {
    alignItems: 'center',
    padding: 24,
    marginBottom: 16,
  },
  allActivatedIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  allActivatedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#40E0D0',
    textAlign: 'center',
  },
  
  // Reward Card
  rewardCard: {
    backgroundColor: '#181818',
    borderRadius: 18,
    marginBottom: 16,
    minHeight: 170,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  activatedBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: '#D4AF37',
    borderRadius: 18,
    zIndex: 1,
  },
  glowEffect: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 18,
    backgroundColor: 'transparent',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    zIndex: 0,
  },
  rewardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  
  // Reward Icon
  rewardIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 32,
  },
  rewardIconActivated: {
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
  },
  rewardIconText: {
    fontSize: 32,
  },
  
  // Reward Info
  rewardInfo: {
    flex: 1,
  },
  rewardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  rewardDescription: {
    fontSize: 13,
    fontWeight: '400',
    color: '#999',
    lineHeight: 18,
    marginBottom: 8,
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  duration: {
    fontSize: 12,
    fontWeight: '600',
    color: '#40E0D0',
  },
  timeRemaining: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D4AF37',
  },
  permanent: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D4AF37',
  },
  
  // Action Button
  actionButton: {
    backgroundColor: '#40E0D0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonActivated: {
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F0F0F',
  },
  actionButtonTextActivated: {
    color: '#D4AF37',
  },
  
  // Dismiss Button
  dismissButton: {
    backgroundColor: '#2A2A2A',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  dismissButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#999',
  },
  
  // Bottom Padding
  bottomPadding: {
    height: 20,
  },
});
