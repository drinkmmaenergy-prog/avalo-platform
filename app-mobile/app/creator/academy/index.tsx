/**
 * Creator Academy - Main Screen
 * Shows all available learning modules with progress tracking
 * Rewards users with 50 tokens + Academy badge upon completion
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import AcademyCard, { AcademyModule } from "@/components/AcademyCard";
import AcademyProgressBar from "@/components/AcademyProgressBar";
import AcademyCompletionModal from "@/components/AcademyCompletionModal";
import { getTokenBalance } from "@/services/tokenService";
import AsyncStorage from '@react-native-async-storage/async-storage';

// Academy progress structure stored locally
interface AcademyProgress {
  completedModules: string[];
  rewarded: boolean;
}

// Define all 6 Academy modules
const ACADEMY_MODULES: AcademyModule[] = [
  {
    id: 'earn-to-chat',
    title: 'Earn-to-Chat',
    icon: '💬',
    description: 'Master paid messaging and build lasting income from conversations',
    completed: false,
    progress: 0,
  },
  {
    id: 'ai-companions',
    title: 'AI Companions & Passive Income',
    icon: '🤖',
    description: 'Create AI bots that earn money 24/7 while you sleep',
    completed: false,
    progress: 0,
  },
  {
    id: 'live-streaming',
    title: 'LIVE Streaming Gifts',
    icon: '🎥',
    description: 'Maximize earnings from livestreams with gifts and engagement',
    completed: false,
    progress: 0,
  },
  {
    id: 'drops-marketplace',
    title: 'Drops Marketplace',
    icon: '🎁',
    description: 'Launch exclusive drops and create scarcity-driven sales',
    completed: false,
    progress: 0,
  },
  {
    id: 'growth-missions',
    title: 'Growth Missions & Ranking',
    icon: '🎯',
    description: 'Level up your profile and climb the creator leaderboard',
    completed: false,
    progress: 0,
  },
  {
    id: 'tips-ads',
    title: 'Tips + Ads Rewards System',
    icon: '💰',
    description: 'Optimize tips and ad revenue for maximum monthly income',
    completed: false,
    progress: 0,
  },
];

const STORAGE_KEY = 'academy_progress';
const REWARD_TOKENS = 50;

export default function CreatorAcademyScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modules, setModules] = useState<AcademyModule[]>(ACADEMY_MODULES);
  const [progress, setProgress] = useState<AcademyProgress>({
    completedModules: [],
    rewarded: false,
  });
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(0);

  useEffect(() => {
    if (user?.uid) {
      loadProgress();
      loadTokenBalance();
    } else {
      setLoading(false);
    }
  }, [user?.uid]);

  const loadTokenBalance = async () => {
    if (!user?.uid) return;
    try {
      const balance = await getTokenBalance(user.uid);
      setTokenBalance(balance);
    } catch (error) {
      console.error('Error loading token balance:', error);
    }
  };

  const loadProgress = async () => {
    try {
      setLoading(true);
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      
      if (stored) {
        const savedProgress: AcademyProgress = JSON.parse(stored);
        setProgress(savedProgress);
        
        // Update modules with completion status
        const updatedModules = ACADEMY_MODULES.map(module => ({
          ...module,
          completed: savedProgress.completedModules.includes(module.id),
          progress: savedProgress.completedModules.includes(module.id) ? 100 : 0,
        }));
        setModules(updatedModules);

        // Show completion modal if all done but not claimed
        const allComplete = updatedModules.every(m => m.completed);
        if (allComplete && !savedProgress.rewarded) {
          setShowCompletionModal(true);
        }
      }
    } catch (error) {
      console.error('Error loading Academy progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadProgress();
    await loadTokenBalance();
    setRefreshing(false);
  };

  const handleModulePress = (moduleId: string) => {
    router.push(`/creator/academy/module/${moduleId}` as any);
  };

  const handleClaimReward = async () => {
    if (!user?.uid || progress.rewarded) return;

    setClaiming(true);
    try {
      // Add tokens using existing tokenService
      const { addTokensAfterPurchase } = require('../../../services/tokenService');
      await addTokensAfterPurchase(user.uid, REWARD_TOKENS, 'academy_completion');

      // Mark as rewarded in local storage
      const updatedProgress: AcademyProgress = {
        ...progress,
        rewarded: true,
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProgress));
      setProgress(updatedProgress);

      // Reload balance
      await loadTokenBalance();

      Alert.alert(
        'Reward Claimed! 🎉',
        `You received ${REWARD_TOKENS} tokens and the "Academy" badge!\n\nYou're now a certified Avalo Creator.`,
        [{ text: 'Awesome!', onPress: () => setShowCompletionModal(false) }]
      );
    } catch (error) {
      console.error('Error claiming reward:', error);
      Alert.alert('Error', 'Failed to claim reward. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  const completedCount = modules.filter(m => m.completed).length;
  const totalCount = modules.length;
  const allComplete = completedCount === totalCount;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#40E0D0" />
        <Text style={styles.loadingText}>Loading Academy...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Please sign in to access Creator Academy</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🎓 Creator Academy</Text>
          <Text style={styles.headerSubtitle}>Learn how to earn on Avalo</Text>
        </View>
        <View style={styles.tokenBadge}>
          <Text style={styles.tokenText}>💎 {tokenBalance}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Progress Overview */}
        <AcademyProgressBar
          completedModules={completedCount}
          totalModules={totalCount}
        />

        {/* Reward Info */}
        {!progress.rewarded && (
          <View style={styles.rewardInfo}>
            <Text style={styles.rewardTitle}>💎 Complete All Modules</Text>
            <Text style={styles.rewardText}>
              Finish all 6 modules to earn {REWARD_TOKENS} tokens + Academy badge
            </Text>
          </View>
        )}

        {progress.rewarded && (
          <View style={styles.rewardClaimed}>
            <Text style={styles.rewardClaimedIcon}>✓</Text>
            <Text style={styles.rewardClaimedText}>
              Academy Completed · {REWARD_TOKENS} tokens earned
            </Text>
          </View>
        )}

        {/* Module List */}
        <View style={styles.modulesSection}>
          <Text style={styles.sectionTitle}>Learning Modules</Text>
          {modules.map((module) => (
            <AcademyCard
              key={module.id}
              module={module}
              onPress={() => handleModulePress(module.id)}
            />
          ))}
        </View>

        {/* Benefits Section */}
        <View style={styles.benefitsSection}>
          <Text style={styles.benefitsTitle}>What You'll Learn</Text>
          <View style={styles.benefitsList}>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>📈</Text>
              <Text style={styles.benefitText}>
                Proven strategies to maximize earnings
              </Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>💡</Text>
              <Text style={styles.benefitText}>
                How to create multiple income streams
              </Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>🎯</Text>
              <Text style={styles.benefitText}>
                Tips to grow your audience fast
              </Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>🚀</Text>
              <Text style={styles.benefitText}>
                Advanced monetization techniques
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Completion Modal */}
      <AcademyCompletionModal
        visible={showCompletionModal}
        onClaim={handleClaimReward}
        onClose={() => setShowCompletionModal(false)}
        claiming={claiming}
        alreadyClaimed={progress.rewarded}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#999',
  },
  tokenBadge: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#40E0D0',
  },
  tokenText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  rewardInfo: {
    backgroundColor: '#1A2A2A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#40E0D0',
  },
  rewardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#40E0D0',
    marginBottom: 8,
    textAlign: 'center',
  },
  rewardText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  rewardClaimed: {
    backgroundColor: '#1A2A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  rewardClaimedIcon: {
    fontSize: 24,
    color: '#4CAF50',
  },
  rewardClaimedText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4CAF50',
  },
  modulesSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  benefitsSection: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  benefitsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  benefitsList: {
    gap: 16,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitIcon: {
    fontSize: 24,
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    color: '#999',
    lineHeight: 20,
  },
});
