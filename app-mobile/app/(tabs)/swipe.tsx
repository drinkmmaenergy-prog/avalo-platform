/**
 * Swipe Screen
 * Dedicated tab for swiping through profiles
 * Phase 31D: Added Global Swipe Counter System
 * Phase 31D-3: Added Premium UX features (Priority Swipe, AI-Swipe, Rewind)
 * Phase 31D-4: Added Gamification System (XP, Streaks, Achievements)
 * PACK 38: Swipe-to-Icebreaker Templates 2.0
 * PACK 40: Smart Profile Rank & Heat Score integration
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useRouter } from 'expo-router';
import SwipeDeck from "@/components/SwipeDeck";
import { getProfile, ProfileData } from "@/lib/profileService";
import { getSwipeProfiles } from "@/services/discoveryService";
import {
  recordLike,
  recordSkip,
  processSuperLike,
  getSwipedUserIds,
} from "@/services/interactionService";
import { getOrCreateChatAndSendMessage } from "@/services/chatService";
import {
  SwipeIcebreakerContext,
  SwipeIcebreakerSettings,
  getOrCreateIcebreakerForSwipe,
} from "@/services/swipeIcebreakerService";
import SwipeIcebreakerPicker from "@/components/SwipeIcebreakerPicker";
import { getTokenBalance, subscribeToTokenBalance } from "@/services/tokenService";
import { isProfileBoosted } from "@/services/boostService";
import {
  updateOnSwipeRightReceived,
  updateOnSwipeRightGiven,
} from "@/services/profileRankService";
import { useSwipeCounter } from "@/hooks/useSwipeCounter";
import { MembershipTier } from "@/services/swipeCounterService";
import SwipeLimitModal from "@/components/SwipeLimitModal";
import { useTranslation } from "@/hooks/useTranslation";
import PrioritySwipeButton from "@/components/PrioritySwipeButton";
import AISwipeToggle from "@/components/AISwipeToggle";
import RewindButton from "@/components/RewindButton";
import LevelProgressBar from "@/components/LevelProgressBar";
import StreakCard from "@/components/StreakCard";
import AchievementsModal from "@/components/AchievementsModal";
import StreakRewardModal from "@/components/StreakRewardModal";
import { awardSwipeXP, getXPData } from "@/utils/xpEngine";
import { updateStreak, getStreakData } from "@/utils/streakEngine";
import { incrementSwipeCount } from "@/utils/achievementsEngine";

export default function SwipeScreen() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [currentUserProfile, setCurrentUserProfile] = useState<ProfileData | null>(null);
  const [boostedProfiles, setBoostedProfiles] = useState<Set<string>>(new Set());
  const [showSwipeLimitModal, setShowSwipeLimitModal] = useState(false);
  const [currentProfileIndex, setCurrentProfileIndex] = useState(0);
  const [swipeHistory, setSwipeHistory] = useState<ProfileData[]>([]);
  
  // PACK 38: Icebreaker state
  const [showIcebreakerPicker, setShowIcebreakerPicker] = useState(false);
  const [icebreakerContext, setIcebreakerContext] = useState<SwipeIcebreakerContext | null>(null);
  const [icebreakerSettings, setIcebreakerSettings] = useState<SwipeIcebreakerSettings | null>(null);
  const [pendingSwipeProfile, setPendingSwipeProfile] = useState<ProfileData | null>(null);
  
  // Phase 31D-4: Gamification state
  const [xpData, setXpData] = useState({ totalXP: 0, level: 1, xpInCurrentLevel: 0, xpNeededForNext: 250, progressPercent: 0 });
  const [streakData, setStreakData] = useState({ currentStreak: 0, lastSwipeDate: null as Date | null, canStreakToday: true });
  const [showAchievementsModal, setShowAchievementsModal] = useState(false);
  const [showStreakRewardModal, setShowStreakRewardModal] = useState(false);
  
  const router = useRouter();
  const { t } = useTranslation();

  const auth = getAuth();
  const currentUser = auth.currentUser;

  // Phase 31D: Swipe counter integration
  // Determine membership tier from profile
  const membershipTier: MembershipTier =
    currentUserProfile?.membership === 'royal' ? 'royal' :
    currentUserProfile?.membership === 'vip' ? 'vip' : 'free';
  
  const {
    swipesLeft,
    dailyLimit,
    nextRegenerationAt,
    canSwipe,
    decrement: decrementSwipeCount,
    forceRefresh: refreshSwipeCounter,
  } = useSwipeCounter(membershipTier);

  useEffect(() => {
    if (currentUser) {
      loadData();
      loadGamificationData();

      // Subscribe to token balance updates
      const unsubscribe = subscribeToTokenBalance(
        currentUser.uid,
        (balance) => setTokenBalance(balance),
        (error) => console.error('Token balance subscription error:', error)
      );

      return () => unsubscribe();
    }
  }, [currentUser]);

  // Phase 31D-4: Load gamification data
  const loadGamificationData = async () => {
    try {
      const [xp, streak] = await Promise.all([
        getXPData(),
        getStreakData(),
      ]);
      setXpData(xp);
      setStreakData(streak);
    } catch (error) {
      console.error('[Gamification] Error loading data:', error);
    }
  };

  const loadData = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);

      // Load current user's profile
      const userProfile = await getProfile(currentUser.uid);
      setCurrentUserProfile(userProfile);

      if (!userProfile) {
        Alert.alert('Profile Incomplete', 'Please complete your profile first');
        router.push('/profile');
        return;
      }

      // Get already swiped user IDs
      const swipedIds = await getSwipedUserIds(currentUser.uid);

      // Load swipe profiles (excluding already swiped)
      let discoveryProfiles = await getSwipeProfiles(
        currentUser.uid,
        userProfile,
        swipedIds,
        50
      );

      // Check which profiles are boosted
      const boostedSet = new Set<string>();
      await Promise.all(
        discoveryProfiles.map(async (profile) => {
          const isBoosted = await isProfileBoosted(profile.uid);
          if (isBoosted) {
            boostedSet.add(profile.uid);
          }
        })
      );
      setBoostedProfiles(boostedSet);

      // Sort profiles: boosted first, then regular
      discoveryProfiles = discoveryProfiles.sort((a, b) => {
        const aBoost = boostedSet.has(a.uid) ? 1 : 0;
        const bBoost = boostedSet.has(b.uid) ? 1 : 0;
        return bBoost - aBoost; // Boosted profiles first
      });

      setProfiles(discoveryProfiles);

      // Load token balance
      const balance = await getTokenBalance(currentUser.uid);
      setTokenBalance(balance);
    } catch (error) {
      console.error('Error loading swipe data:', error);
      Alert.alert('Error', 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleSwipeLeft = async (profile: ProfileData) => {
    if (!currentUser) return;

    // Phase 31D: Check swipe counter
    if (!canSwipe) {
      setShowSwipeLimitModal(true);
      return;
    }

    try {
      await recordSkip(currentUser.uid, profile.uid);
      // Phase 31D: Decrement swipe counter after successful swipe
      await decrementSwipeCount();
      
      // Phase 31D-4: Award XP, update streak, increment achievements
      await processGamificationRewards();
      
      // PACK 40: No signal update for left swipes (skip)
    } catch (error) {
      console.error('Error recording skip:', error);
    }
  };

  const handleSwipeRight = async (profile: ProfileData) => {
    if (!currentUser) return;

    // Phase 31D: Check swipe counter
    if (!canSwipe) {
      setShowSwipeLimitModal(true);
      return;
    }

    try {
      // Record the like first
      const result = await recordLike(currentUser.uid, profile.uid, false);

      // Phase 31D: Decrement swipe counter after successful swipe
      await decrementSwipeCount();
      
      // Phase 31D-4: Award XP, update streak, increment achievements
      await processGamificationRewards();

      // PACK 40: Update profile signals for right swipe
      await updateOnSwipeRightGiven(currentUser.uid);
      await updateOnSwipeRightReceived(profile.uid);

      // PACK 38: Handle icebreaker
      await handleIcebreakerFlow(profile);

    } catch (error) {
      console.error('Error recording like:', error);
      Alert.alert('Error', 'Failed to process like');
    }
  };

  // PACK 38: Handle icebreaker flow after right swipe
  const handleIcebreakerFlow = async (profile: ProfileData) => {
    if (!currentUser || !currentUserProfile) return;

    try {
      // Build context for icebreaker
      const context: SwipeIcebreakerContext = {
        viewerId: currentUser.uid,
        targetId: profile.uid,
        viewerDisplayName: currentUserProfile.name,
        targetDisplayName: profile.name,
        targetCity: profile.city,
        targetInterests: profile.interests,
        viewerGender: currentUserProfile.gender,
        targetGender: profile.gender,
      };

      // Get icebreaker settings and message
      const { message, settings } = await getOrCreateIcebreakerForSwipe(
        currentUser.uid,
        context
      );

      if (settings.autoSendOnSwipe) {
        // Auto-send mode: send message immediately
        await sendIcebreakerMessage(profile.uid, message);
      } else {
        // Picker mode: show bottom sheet
        setIcebreakerContext(context);
        setIcebreakerSettings(settings);
        setPendingSwipeProfile(profile);
        setShowIcebreakerPicker(true);
      }
    } catch (error) {
      console.error('[Icebreaker] Error in flow:', error);
      // Fallback: send generic message
      await sendIcebreakerMessage(profile.uid, `Hi ${profile.name}, your profile caught my attention!`);
    }
  };

  // PACK 38: Send icebreaker message and navigate to chat
  const sendIcebreakerMessage = async (targetUserId: string, message: string) => {
    if (!currentUser) return;

    try {
      const chatId = await getOrCreateChatAndSendMessage(
        currentUser.uid,
        targetUserId,
        message
      );

      // Navigate to chat
      router.push(`/chat/${chatId}` as any);
    } catch (error: any) {
      console.error('[Icebreaker] Error sending message:', error);
      
      if (error.message === 'INSUFFICIENT_BALANCE') {
        Alert.alert(
          'Insufficient Tokens',
          'You need more tokens to start this chat.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Buy Tokens', onPress: () => router.push('/wallet') },
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to send message. Please try again.');
      }
    }
  };

  // PACK 38: Handle message selection from picker
  const handleIcebreakerSelect = async (message: string) => {
    if (!pendingSwipeProfile) return;

    setShowIcebreakerPicker(false);
    await sendIcebreakerMessage(pendingSwipeProfile.uid, message);
    
    // Clean up
    setPendingSwipeProfile(null);
    setIcebreakerContext(null);
    setIcebreakerSettings(null);
  };

  // PACK 38: Handle picker close
  const handleIcebreakerPickerClose = () => {
    setShowIcebreakerPicker(false);
    setPendingSwipeProfile(null);
    setIcebreakerContext(null);
    setIcebreakerSettings(null);
  };

  const handleSwipeUp = async (profile: ProfileData) => {
    if (!currentUser) return;

    // Phase 31D: Check swipe counter
    if (!canSwipe) {
      setShowSwipeLimitModal(true);
      return { success: false, error: 'NO_SWIPES' };
    }

    const result = await processSuperLike(currentUser.uid, profile.uid);

    if (result.success) {
      // Phase 31D: Decrement swipe counter after successful swipe
      await decrementSwipeCount();
      
      // Phase 31D-4: Award XP, update streak, increment achievements
      await processGamificationRewards();

      // PACK 40: Update profile signals for super like (counts as right swipe)
      await updateOnSwipeRightGiven(currentUser.uid);
      await updateOnSwipeRightReceived(profile.uid);

      if (result.matchCreated) {
        Alert.alert(
          "It's a Match! 🎉⭐",
          `Your SuperLike matched with ${profile.name}!`,
          [
            { text: 'Keep Swiping', style: 'cancel' },
            {
              text: 'Send Message',
              onPress: () => {
                if (result.chatId) {
                  router.push(`/chat/${result.chatId}` as any);
                }
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'SuperLike Sent! ⭐',
          `You SuperLiked ${profile.name}. They'll be notified!`
        );
      }
    }

    return result;
  };

  // Phase 31D-4: Process gamification rewards after swipe
  const processGamificationRewards = async () => {
    try {
      // Award XP
      const xpResult = await awardSwipeXP(null);
      
      // Update streak
      const streakResult = await updateStreak();
      
      // Increment achievement swipe count
      const achievementResult = await incrementSwipeCount();

      // Refresh gamification data
      await loadGamificationData();

      // Show level up alert if applicable
      if (xpResult.leveledUp) {
        Alert.alert(
          '🎉 Level Up!',
          `Congratulations! You reached Level ${xpResult.newLevel}!`,
          [{ text: 'Awesome!', style: 'default' }]
        );
      }

      // Show streak reward if unlocked
      if (streakResult.rewardUnlocked) {
        Alert.alert(
          '🔥 Streak Reward!',
          `${streakResult.newStreak}-day streak unlocked: ${streakResult.rewardUnlocked.name}!`,
          [
            { text: 'View Rewards', onPress: () => setShowStreakRewardModal(true) },
            { text: 'Later', style: 'cancel' },
          ]
        );
      }

      // Show achievement unlock if applicable
      if (achievementResult.newAchievements.length > 0) {
        const achievement = achievementResult.newAchievements[0];
        Alert.alert(
          '🏆 Achievement Unlocked!',
          `You earned: ${achievement.name}!`,
          [
            { text: 'View All', onPress: () => setShowAchievementsModal(true) },
            { text: 'Cool!', style: 'cancel' },
          ]
        );
      }
    } catch (error) {
      console.error('[Gamification] Error processing rewards:', error);
    }
  };

  const handleProfilePress = (profile: ProfileData) => {
    router.push(`/profile/${profile.uid}` as any);
  };

  const handleNeedTokens = () => {
    router.push('/wallet');
  };

  // Phase 31D-3: AI-Swipe handler
  const handleAutoSwipe = (profile: ProfileData, direction: 'left' | 'right') => {
    if (direction === 'right') {
      handleSwipeRight(profile);
    } else {
      handleSwipeLeft(profile);
    }
  };

  // Phase 31D-3: Rewind handler
  const handleRewind = (profile: ProfileData) => {
    // Add profile back to the beginning of the deck
    setProfiles(prevProfiles => [profile, ...prevProfiles]);
    // Remove from history
    setSwipeHistory(prevHistory => prevHistory.slice(0, -1));
  };

  // Phase 31D-3: Track swipe history for rewind
  const addToSwipeHistory = (profile: ProfileData) => {
    setSwipeHistory(prevHistory => [...prevHistory, profile]);
  };

  // Update swipe handlers to track history
  const handleSwipeLeftWithHistory = async (profile: ProfileData) => {
    addToSwipeHistory(profile);
    await handleSwipeLeft(profile);
  };

  const handleSwipeRightWithHistory = async (profile: ProfileData) => {
    addToSwipeHistory(profile);
    await handleSwipeRight(profile);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>Loading profiles...</Text>
        </View>
      </View>
    );
  }

  const currentProfile = profiles[currentProfileIndex];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💫 Swipe</Text>
        <View style={styles.headerRight}>
          {/* Phase 31D: Swipe Counter Badge */}
          <View style={[
            styles.swipeCounterBadge,
            swipesLeft === 0 && styles.swipeCounterBadgeEmpty
          ]}>
            <Text style={styles.swipeCounterText}>
              🔄 {swipesLeft}/{dailyLimit}
            </Text>
          </View>
          <View style={styles.tokenBadge}>
            <Text style={styles.tokenBadgeText}>💎 {tokenBalance}</Text>
          </View>
        </View>
      </View>

      {/* Phase 31D-3: Premium Swipe Features */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.premiumFeaturesContainer}
        contentContainerStyle={styles.premiumFeaturesContent}
      >
        <AISwipeToggle
          membershipTier={membershipTier}
          onAutoSwipe={handleAutoSwipe}
          currentProfile={currentProfile}
          smartMatchScore={null}
          swipesLeft={swipesLeft}
        />
        <RewindButton
          membershipTier={membershipTier}
          onRewind={handleRewind}
          lastSwipedProfile={swipeHistory[swipeHistory.length - 1] || null}
        />
        {currentProfile && (
          <PrioritySwipeButton
            targetUserId={currentProfile.uid}
            membershipTier={membershipTier}
          />
        )}
      </ScrollView>

      {/* Phase 31D-4: XP Progress Bar */}
      <LevelProgressBar
        level={xpData.level}
        xpInCurrentLevel={xpData.xpInCurrentLevel}
        xpNeededForNext={xpData.xpNeededForNext}
        progressPercent={xpData.progressPercent}
      />

      {/* Phase 31D-4: Streak Card */}
      <StreakCard
        currentStreak={streakData.currentStreak}
        onViewRewards={() => setShowStreakRewardModal(true)}
      />

      {/* Phase 31D-4: View Achievements Button */}
      <TouchableOpacity
        style={styles.achievementsButton}
        onPress={() => setShowAchievementsModal(true)}
      >
        <Text style={styles.achievementsButtonText}>
          🏆 {t('gamification.swipe.achievements.viewAll')}
        </Text>
      </TouchableOpacity>

      {/* Swipe Deck */}
      <View style={styles.deckContainer}>
        <SwipeDeck
          profiles={profiles}
          onSwipeLeft={handleSwipeLeftWithHistory}
          onSwipeRight={handleSwipeRightWithHistory}
          onSwipeUp={handleSwipeUp}
          onProfilePress={handleProfilePress}
          currentTokenBalance={tokenBalance}
          onNeedTokens={handleNeedTokens}
          boostedProfiles={boostedProfiles}
          currentUserProfile={currentUserProfile || undefined}
        />
      </View>

      {/* Phase 31D: Swipe Limit Modal */}
      <SwipeLimitModal
        visible={showSwipeLimitModal}
        onClose={() => setShowSwipeLimitModal(false)}
        nextRegenerationAt={nextRegenerationAt}
        hourlyRestore={dailyLimit === 50 ? 10 : dailyLimit === 100 ? 15 : 25}
      />

      {/* Phase 31D-4: Achievements Modal */}
      <AchievementsModal
        visible={showAchievementsModal}
        onClose={() => setShowAchievementsModal(false)}
      />

      {/* Phase 31D-4: Streak Reward Modal */}
      <StreakRewardModal
        visible={showStreakRewardModal}
        onClose={() => setShowStreakRewardModal(false)}
        onRewardClaimed={loadGamificationData}
      />

      {/* PACK 38: Icebreaker Picker */}
      {icebreakerContext && icebreakerSettings && (
        <SwipeIcebreakerPicker
          visible={showIcebreakerPicker}
          onClose={handleIcebreakerPickerClose}
          context={icebreakerContext}
          settings={icebreakerSettings}
          onSelectMessage={handleIcebreakerSelect}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  // Phase 31D-3: Premium features container
  premiumFeaturesContainer: {
    backgroundColor: '#fff',
    maxHeight: 100,
  },
  premiumFeaturesContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Phase 31D: Swipe Counter Badge Styles
  swipeCounterBadge: {
    backgroundColor: '#E0F7FA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#40E0D0',
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  swipeCounterBadgeEmpty: {
    backgroundColor: '#FFE0E0',
    borderColor: '#FF6B6B',
    shadowColor: '#FF6B6B',
  },
  swipeCounterText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  tokenBadge: {
    backgroundColor: '#FFF5E1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  tokenBadgeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  deckContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Phase 31D-4: Achievements button
  achievementsButton: {
    backgroundColor: '#40E0D0',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  achievementsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
