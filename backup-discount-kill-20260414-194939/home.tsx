/**
 * Home Screen - Main Discovery Interface
 * Includes: Wallet summary, Discovery grid, Swipe deck, and Feed list
 * Phase 27: Optimized with skeleton loaders and performance improvements
 * Phase 31C: Adaptive Smart Discounts integration
 * Phase 32-4: FTUX Missions & First-Week Checklist
 * Phase 36: Smart Suggestions CTA Integration
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useDailyTasks } from "@/hooks/useDailyTasks";
import DailyTasksModal from "@/components/DailyTasksModal";
import { DailyTask, DailyTaskType } from "@/services/dailyTasksService";
import { getProfile, ProfileData } from "@/lib/profileService";
import { getTokenBalance } from "@/services/tokenService";
import { getMiniDiscoveryProfiles, getSwipeProfiles } from "@/services/discoveryService";
import {
  recordLike,
  recordSkip,
  processSuperLike,
  getSwipedUserIds,
} from "@/services/interactionService";
import { getFeedProfiles } from "@/lib/feedService";
import DiscoveryGrid from "@/components/DiscoveryGrid";
import SwipeDeck from "@/components/SwipeDeck";
import ProfileCard from "@/components/ProfileCard";
import { TokenPurchaseModal } from "@/components/TokenPurchaseModal";
import IcebreakerTemplates from "@/components/IcebreakerTemplates";
import TopBar from "@/components/TopBar";
import SponsoredPost from "@/components/SponsoredPost";
import { FeedSkeleton } from "@/components/SkeletonLoader";
import { EmptyState, EmptyStates } from "@/components/EmptyState";
import {
  shouldShowSponsoredAd,
  getAdForPlacement,
  registerImpression,
  registerClick,
  getUserTier,
  type AdCampaign,
  type UserTier,
  type UserProfile as AdUserProfile,
} from "@/services/sponsoredAdsService";
import BottomSheetPromo from "@/components/BottomSheetPromo";
import { DiscountOffer } from "@/shared/types/discounts";
import {
  evaluateDiscountEligibility,
  retrieveActiveDiscount,
  storeActiveDiscount,
} from "@/shared/utils/discountEngine";
import { useFtuxMissions } from "@/hooks/useFtuxMissions";
import { useTranslation } from "@/hooks/useTranslation";
import { FtuxMissionsBanner } from "@/components/FtuxMissionsBanner";
import { useRewardStore } from "@/hooks/useRewardStore";
import { RewardStorePrompt } from "@/components/RewardStorePrompt";
import SocialMomentumCard from "@/components/SocialMomentumCard";
import {
  analyzeMomentum,
  calculateProfileCompleteness,
  estimateNearbyActiveUsers,
  countRecentSwipes,
  getLastPhotoUploadTime,
  type MomentumInsight,
  type MomentumData,
} from "@/services/socialMomentumService";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userProfile, setUserProfile] = useState<ProfileData | null>(null);
  const [tokenBalance, setTokenBalance] = useState(0);
  
  // Discovery & Swipe
  const [discoveryProfiles, setDiscoveryProfiles] = useState<ProfileData[]>([]);
  const [swipeProfiles, setSwipeProfiles] = useState<ProfileData[]>([]);
  const [swipedUserIds, setSwipedUserIds] = useState<string[]>([]);
  
  // Feed
  const [feedProfiles, setFeedProfiles] = useState<ProfileData[]>([]);
  
  // Sponsored Ads (Phase 19B)
  const [userTier, setUserTier] = useState<UserTier>('standard');
  const [feedAds, setFeedAds] = useState<Map<number, AdCampaign>>(new Map());
  const [swipeAds, setSwipeAds] = useState<Map<number, AdCampaign>>(new Map());
  const [impressedAdIds, setImpressedAdIds] = useState<Set<string>>(new Set());
  
  // UI States
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showIcebreakerModal, setShowIcebreakerModal] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  
  // Phase 31C: Discount states
  const [activeDiscount, setActiveDiscount] = useState<DiscountOffer | null>(null);
  const [showPromoModal, setShowPromoModal] = useState(false);
  
  // Phase 32-4: FTUX Missions
  const { t } = useTranslation();
  const ftuxMissions = useFtuxMissions(
    userProfile
      ? {
          gender: userProfile.gender as 'male' | 'female' | 'other',
          createdAt: userProfile.createdAt instanceof Date
            ? userProfile.createdAt.getTime()
            : typeof userProfile.createdAt === 'number'
            ? userProfile.createdAt
            : null,
        }
      : undefined
  );
  
  // Phase 32-5: Reward Store
  const ftuxCompleted = ftuxMissions.completedCount === ftuxMissions.totalCount && ftuxMissions.totalCount > 0;
  const rewardStore = useRewardStore(ftuxCompleted);
  const [showRewardPrompt, setShowRewardPrompt] = useState(false);
  
  // Phase 32-7: Social Momentum
  const [momentumInsight, setMomentumInsight] = useState<MomentumInsight | null>(null);
  
  // Phase 36: Smart Suggestions CTA
  const [showSmartSuggestions, setShowSmartSuggestions] = useState(false);
  const [smartSuggestionsGlow] = useState(new Animated.Value(1));
  
  // Phase 37: Daily Tasks Engine
  const [showDailyTasksModal, setShowDailyTasksModal] = useState(false);
  const dailyTasks = useDailyTasks(user?.uid || '');
  
  // Check if user has seen Smart Suggestions CTA
  useEffect(() => {
    checkSmartSuggestionsVisibility();
  }, []);
  
  const checkSmartSuggestionsVisibility = async () => {
    try {
      const visits = await AsyncStorage.getItem('smartSuggestionsVisits');
      const visitCount = visits ? parseInt(visits, 10) : 0;
      
      if (visitCount < 3) {
        setShowSmartSuggestions(true);
        // Start glow animation
        Animated.loop(
          Animated.sequence([
            Animated.timing(smartSuggestionsGlow, {
              toValue: 1.2,
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(smartSuggestionsGlow, {
              toValue: 1,
              duration: 1000,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }
    } catch (error) {
      console.error('Error checking smart suggestions visibility:', error);
    }
  };
  
  const handleSmartSuggestionsPress = async () => {
    try {
      // Increment visit count
      const visits = await AsyncStorage.getItem('smartSuggestionsVisits');
      const visitCount = visits ? parseInt(visits, 10) : 0;
      await AsyncStorage.setItem('smartSuggestionsVisits', (visitCount + 1).toString());
      
      // Navigate to suggestions
      router.push('/suggestions' as any);
    } catch (error) {
      console.error('Error updating smart suggestions visits:', error);
      router.push('/suggestions' as any);
    }
  };
  
  // Show reward prompt when FTUX completes
  useEffect(() => {
    if (ftuxCompleted && rewardStore.shouldShow && !rewardStore.isLoading) {
      // Initialize reward store and show prompt
      rewardStore.initializeStore().then(() => {
        setTimeout(() => setShowRewardPrompt(true), 1000);
      });
    }
  }, [ftuxCompleted, rewardStore.shouldShow, rewardStore.isLoading]);

  useEffect(() => {
    if (user?.uid) {
      loadAllData();
    }
  }, [user?.uid]);

  const loadAllData = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);

      // Load user profile and token balance
      const [profile, balance, swiped] = await Promise.all([
        getProfile(user.uid),
        getTokenBalance(user.uid),
        getSwipedUserIds(user.uid),
      ]);

      setUserProfile(profile);
      setTokenBalance(balance);
      setSwipedUserIds(swiped);

      if (!profile) {
        setLoading(false);
        return;
      }

      // Determine user tier from membership
      const tier = getUserTier(profile.membership);
      setUserTier(tier);

      // Load discovery profiles (mini grid)
      const discovery = await getMiniDiscoveryProfiles(user.uid, profile, 12);
      setDiscoveryProfiles(discovery);

      // Load swipe profiles
      const swipe = await getSwipeProfiles(user.uid, profile, swiped, 50);
      setSwipeProfiles(swipe);

      // Load feed profiles
      const feed = await getFeedProfiles(user.uid, profile.city, profile.interests);
      setFeedProfiles(feed);

      // Load sponsored ads for feed and swipe (Phase 19B)
      await Promise.all([
        loadFeedAds(profile, tier, feed.length),
        loadSwipeAds(profile, tier, swipe.length),
      ]);

      // Phase 31C: Evaluate discount eligibility
      checkForDiscounts(profile);
      
      // Phase 32-7: Analyze social momentum
      await checkMomentumInsight(profile, discovery, swiped);
    } catch (error) {
      console.error('Error loading home data:', error);
      // Use toast instead of Alert for better UX
    } finally {
      setLoading(false);
    }
  };
  
  // Phase 32-7: Check for momentum insights
  const checkMomentumInsight = async (
    profile: ProfileData,
    discoveryProfiles: ProfileData[],
    swipedIds: string[]
  ) => {
    try {
      // Only show if onboarding completed
      if (!profile.profileComplete) {
        return;
      }
      
      const momentumData: MomentumData = {
        profile,
        recentSwipeCount: countRecentSwipes(swipedIds),
        recentMatchCount: 0, // TODO: Get from matchService if available
        photoCount: profile.photos?.length || 0,
        profileCompleteness: calculateProfileCompleteness(profile),
        lastPhotoUpload: getLastPhotoUploadTime(profile),
        nearbyActiveUsers: estimateNearbyActiveUsers(discoveryProfiles),
      };
      
      const insight = await analyzeMomentum(momentumData);
      setMomentumInsight(insight);
    } catch (error) {
      console.error('Error checking momentum insight:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  const handleSwipeRight = async (profile: ProfileData) => {
    try {
      const result = await recordLike(user!.uid, profile.uid, false);
      setSwipedUserIds((prev) => [...prev, profile.uid]);

      if (result.matchCreated) {
        // Phase 32-4: Register first match for FTUX missions
        ftuxMissions.registerEvent({ type: 'MATCH_CREATED' });
        
        Alert.alert(
          '🎉 It\'s a Match!',
          `You and ${profile.name} liked each other!`,
          [
            { text: 'Keep Swiping', style: 'cancel' },
            {
              text: 'Send Message',
              onPress: () => router.push(`/chat/${result.chatId}` as any),
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error recording like:', error);
      Alert.alert('Error', 'Failed to record like. Please try again.');
    }
  };

  const handleSwipeLeft = async (profile: ProfileData) => {
    try {
      await recordSkip(user!.uid, profile.uid);
      setSwipedUserIds((prev) => [...prev, profile.uid]);
    } catch (error) {
      console.error('Error recording skip:', error);
    }
  };

  const handleSwipeUp = async (
    profile: ProfileData
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await processSuperLike(user!.uid, profile.uid);

      if (result.success) {
        setSwipedUserIds((prev) => [...prev, profile.uid]);
        // Update token balance
        const newBalance = await getTokenBalance(user!.uid);
        setTokenBalance(newBalance);

        if (result.matchCreated) {
          Alert.alert(
            '⭐ Super Match!',
            `${profile.name} will see you sent a SuperLike!`,
            [
              { text: 'Keep Swiping', style: 'cancel' },
              {
                text: 'Send Message',
                onPress: () => router.push(`/chat/${result.chatId}` as any),
              },
            ]
          );
        } else {
          Alert.alert('⭐ SuperLike wysłany!', `${profile.name} zobaczy, że jesteś zainteresowany!`);
        }
      }

      return result;
    } catch (error) {
      console.error('Error processing SuperLike:', error);
      return { success: false, error: 'PROCESSING_ERROR' };
    }
  };

  const handleProfilePress = (profile: ProfileData) => {
    router.push(`/profile/${profile.uid}` as any);
  };

  const handleSendIcebreaker = (profile: ProfileData) => {
    setSelectedProfile(profile);
    setShowIcebreakerModal(true);
  };

  const handleSelectIcebreakerTemplate = async (message: string) => {
    if (!selectedProfile) return;
    
    try {
      // Send the icebreaker message
      const { getOrCreateChatAndSendMessage } = await import('../../services/chatService');
      await getOrCreateChatAndSendMessage(user!.uid, selectedProfile.uid, message);
      
      // Phase 32-4: Register first message for FTUX missions
      ftuxMissions.registerEvent({ type: 'FIRST_MESSAGE_SENT' });
      
      Alert.alert(
        'Icebreaker Sent! 💬',
        `Your message to ${selectedProfile.name} has been sent!`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Also record as a like
              handleSwipeRight(selectedProfile);
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error sending icebreaker:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  };

  // Load ads for feed placement
  const loadFeedAds = async (profile: ProfileData, tier: UserTier, feedLength: number) => {
    try {
      const adUserProfile: AdUserProfile = {
        tier,
        country: undefined, // Not in ProfileData - could be derived from city
        language: 'en', // Default - could be from app settings
        age: profile.age,
        gender: profile.gender,
        interests: profile.interests,
      };

      // Determine which positions should have ads
      const adsMap = new Map<number, AdCampaign>();
      
      for (let i = 1; i <= feedLength; i++) {
        const shouldShow = shouldShowSponsoredAd('feed', tier, i, {
          hasAdsAvailable: true, // Will be validated when fetching
          userAge: profile.age,
          isUserBlocked: false, // Not tracked in ProfileData - safe default
          isUserSuspended: false, // Not tracked in ProfileData - safe default
        });

        if (shouldShow) {
          const ad = await getAdForPlacement('feed', adUserProfile);
          if (ad) {
            adsMap.set(i - 1, ad); // Store at array index (i-1)
          }
        }
      }

      setFeedAds(adsMap);
    } catch (error) {
      console.error('Error loading feed ads:', error);
      // Silent fail - feed will work without ads
    }
  };

  // Load ads for swipe placement
  const loadSwipeAds = async (profile: ProfileData, tier: UserTier, swipeLength: number) => {
    try {
      const adUserProfile: AdUserProfile = {
        tier,
        country: undefined,
        language: 'en',
        age: profile.age,
        gender: profile.gender,
        interests: profile.interests,
      };

      const adsMap = new Map<number, AdCampaign>();
      
      for (let i = 1; i <= swipeLength; i++) {
        const shouldShow = shouldShowSponsoredAd('swipe', tier, i, {
          hasAdsAvailable: true,
          userAge: profile.age,
          isUserBlocked: false,
          isUserSuspended: false,
        });

        if (shouldShow) {
          const ad = await getAdForPlacement('swipe', adUserProfile);
          if (ad) {
            adsMap.set(i - 1, ad);
          }
        }
      }

      setSwipeAds(adsMap);
    } catch (error) {
      console.error('Error loading swipe ads:', error);
      // Silent fail - swipe will work without ads
    }
  };

  // Handle ad impression (track once per ad)
  const handleAdImpression = useCallback(async (campaignId: string) => {
    if (impressedAdIds.has(campaignId)) return;
    
    try {
      const impressionId = await registerImpression(campaignId, 'feed', userTier);
      if (impressionId) {
        setImpressedAdIds(prev => new Set(prev).add(campaignId));
      }
    } catch (error) {
      console.error('Error registering ad impression:', error);
    }
  }, [impressedAdIds, userTier]);

  // Handle ad click
  const handleAdClick = useCallback(async (campaignId: string, impressionId: string) => {
    try {
      await registerClick(campaignId, impressionId);
    } catch (error) {
      console.error('Error registering ad click:', error);
    }
  }, []);

  // Phase 31C: Check for available discounts
  const checkForDiscounts = (profile: ProfileData) => {
    // Check if there's already an active discount stored
    const stored = retrieveActiveDiscount();
    if (stored) {
      setActiveDiscount(stored);
      setShowPromoModal(true);
      return;
    }

    // Map ProfileData gender to DiscountConditions gender
    const mapGender = (gender: string): 'male' | 'female' | 'other' => {
      if (gender === 'male') return 'male';
      if (gender === 'female') return 'female';
      return 'other';
    };

    // Evaluate eligibility based on user conditions
    const createdAtTime = typeof profile.createdAt === 'number' ? profile.createdAt : 0;
    const isNewUser = createdAtTime > 0 && (Date.now() - createdAtTime) < 30 * 24 * 60 * 60 * 1000;
    
    const conditions = {
      isNewMaleUser: isNewUser && profile.gender === 'male',
      userGender: mapGender(profile.gender),
      daysSinceLastPayment: 15, // TODO: Get from payment history
      activityStreak: 0, // TODO: Get from activity tracking
      daysSinceLastSession: 0, // TODO: Get from session tracking
      lifetimeSpent: 0, // TODO: Get from payment history
      isBirthday: checkIfBirthday(profile.age),
    };

    const offer = evaluateDiscountEligibility(conditions);
    if (offer) {
      storeActiveDiscount(offer);
      setActiveDiscount(offer);
      // Show promo after a short delay (2 seconds) to not be intrusive
      setTimeout(() => setShowPromoModal(true), 2000);
    }
  };

  // Helper to check if today is user's birthday (approximation based on age)
  const checkIfBirthday = (age?: number): boolean => {
    // This is a simplified check - ideally we'd have actual birth date
    // For now, return false as we don't have birthday data
    return false;
  };

  // Handle promo activation
  const handlePromoActivate = () => {
    // Navigate to the relevant purchase screen based on discount target
    if (activeDiscount) {
      switch (activeDiscount.target) {
        case 'vip':
        case 'royal':
        case 'any_subscription':
          router.push('/(tabs)/wallet' as any);
          break;
        case 'boosts':
        case 'live':
          router.push('/boost-hub' as any);
          break;
        case 'social_meet':
          router.push('/meet' as any);
          break;
      }
    }
  };
  
  // Phase 37: Handle Daily Task Navigation
  const handleDailyTaskNavigate = (task: DailyTask) => {
    // Navigate based on task type
    switch (task.type) {
      case 'ADD_PHOTO':
        router.push('/(tabs)/profile' as any);
        break;
      case 'SEND_MESSAGE_PROFILE_VISITED':
        router.push('/(tabs)/chat' as any);
        break;
      case 'REPLY_UNREAD':
        router.push('/(tabs)/chat' as any);
        break;
      case 'DO_10_SWIPES':
        // User is already on home - no navigation needed
        break;
      case 'OPEN_SMART_SUGGESTIONS':
        router.push('/suggestions' as any);
        break;
      case 'OPEN_LIVE_TAB':
        router.push('/live' as any);
        break;
      case 'BROWSE_PPV_GALLERY':
        router.push('/(tabs)/explore' as any);
        break;
      case 'OPEN_AI_COMPANION':
        router.push('/ai-companion' as any);
        break;
      case 'VISIT_PROFILE_WHO_VISITED_YOU':
        router.push('/(tabs)/profile' as any);
        break;
      case 'EDIT_PROFILE_SECTION':
        router.push('/(tabs)/profile' as any);
        break;
      case 'OPEN_EXPLORE_TRENDING':
        router.push('/(tabs)/explore' as any);
        break;
      case 'SET_MOOD_STATUS':
        router.push('/(tabs)/profile' as any);
        break;
    }
    
    // Mark task as completed after navigation
    if (task.id) {
      dailyTasks.markCompleted(task.id);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <TopBar
          tokenBalance={tokenBalance}
          onWalletPress={() => router.push('/(tabs)/wallet' as any)}
          onFiltersPress={() => router.push('/(tabs)/dating-preferences' as any)}
          onSettingsPress={() => router.push('/(tabs)/profile' as any)}
        />
        <ScrollView style={styles.content}>
          <FeedSkeleton />
        </ScrollView>
      </View>
    );
  }

  if (!userProfile?.profileComplete) {
    return (
      <View style={styles.container}>
        <EmptyState
          {...EmptyStates.profileIncomplete}
          actionLabel="Uzupełnij profil"
          onAction={() => router.push('/(onboarding)/profile-setup' as any)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Bar with Wallet, Filters, and Settings */}
      <TopBar
        tokenBalance={tokenBalance}
        onWalletPress={() => router.push('/(tabs)/wallet' as any)}
        onFiltersPress={() => router.push('/(tabs)/dating-preferences' as any)}
        onSettingsPress={() => router.push('/(tabs)/profile' as any)}
      />

      {/* Premium Earnings Banner for VIP/Royal */}
      {(userTier === 'vip' || userTier === 'royal') && (
        <TouchableOpacity
          style={styles.premiumBanner}
          onPress={() => router.push('/(tabs)/premium-earnings' as any)}
        >
          <Text style={styles.premiumBannerIcon}>👑</Text>
          <View style={styles.premiumBannerContent}>
            <Text style={styles.premiumBannerTitle}>
              Zarabiaj do +9% więcej jako Royal
            </Text>
            <Text style={styles.premiumBannerSubtitle}>
              Zobacz swoje bonusy premium →
            </Text>
          </View>
        </TouchableOpacity>
      )}

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#FF6B6B']}
            tintColor="#FF6B6B"
          />
        }
      >
        {/* Phase 32-4: FTUX Missions Banner */}
        {!ftuxMissions.isLoading &&
         !ftuxMissions.isExpired &&
         ftuxMissions.completedCount < ftuxMissions.totalCount &&
         ftuxMissions.missions.length > 0 && (
          <FtuxMissionsBanner
            missions={ftuxMissions.missions}
            completedCount={ftuxMissions.completedCount}
            totalCount={ftuxMissions.totalCount}
            t={t}
          />
        )}
        
        {/* Phase 37: Daily Tasks Banner Card */}
        {!dailyTasks.loading && dailyTasks.totalCount > 0 && userProfile?.profileComplete && (
          <View style={styles.dailyTasksBanner}>
            <TouchableOpacity
              style={styles.dailyTasksBannerButton}
              onPress={() => setShowDailyTasksModal(true)}
              activeOpacity={0.9}
            >
              <View style={styles.dailyTasksBannerContent}>
                <Text style={styles.dailyTasksBannerIcon}>✅</Text>
                <View style={styles.dailyTasksBannerText}>
                  <Text style={styles.dailyTasksBannerTitle}>
                    {t('dailyTasks.teaserTitle')}
                  </Text>
                  <Text style={styles.dailyTasksBannerSubtitle}>
                    {t('dailyTasks.teaserSubtitle')}
                  </Text>
                </View>
                <View style={styles.dailyTasksBadge}>
                  <Text style={styles.dailyTasksBadgeText}>
                    {dailyTasks.completedCount}/{dailyTasks.totalCount}
                  </Text>
                </View>
              </View>
              {dailyTasks.completedCount < dailyTasks.totalCount && (
                <View style={styles.dailyTasksPulse} />
              )}
            </TouchableOpacity>
          </View>
        )}
        
        {/* Phase 36: Smart Suggestions CTA Card */}
        {showSmartSuggestions && userProfile?.profileComplete && (
          <Animated.View style={[styles.smartSuggestionsCTA, { transform: [{ scale: smartSuggestionsGlow }] }]}>
            <TouchableOpacity
              style={styles.smartSuggestionsCTAButton}
              onPress={handleSmartSuggestionsPress}
              activeOpacity={0.9}
            >
              <View style={styles.smartSuggestionsCTAContent}>
                <Text style={styles.smartSuggestionsCTAIcon}>✨</Text>
                <View style={styles.smartSuggestionsCTAText}>
                  <Text style={styles.smartSuggestionsCTATitle}>
                    {t('smartSuggestions.title')}
                  </Text>
                  <Text style={styles.smartSuggestionsCTASubtitle}>
                    {t('smartSuggestions.firstTimeHighlight')}
                  </Text>
                </View>
                <Text style={styles.smartSuggestionsCTAArrow}>→</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}
        
        {/* Phase 32-7: Social Momentum Card */}
        {momentumInsight && userProfile?.profileComplete && (
          <SocialMomentumCard
            insight={momentumInsight}
            onDismiss={() => setMomentumInsight(null)}
          />
        )}

        {/* Discovery Mini Grid */}
        {discoveryProfiles.length > 0 && (
          <DiscoveryGrid
            profiles={discoveryProfiles}
            onProfilePress={handleProfilePress}
          />
        )}

        {/* Swipe Deck */}
        <View style={styles.swipeContainer}>
          <SwipeDeck
            profiles={swipeProfiles}
            sponsoredCards={swipeAds}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
            onSwipeUp={handleSwipeUp}
            onProfilePress={handleProfilePress}
            onAdImpression={handleAdImpression}
            onAdClick={handleAdClick}
            currentTokenBalance={tokenBalance}
            onNeedTokens={() => setShowTokenModal(true)}
          />
        </View>

        {/* Feed Section */}
        <View style={styles.feedSection}>
          <Text style={styles.feedTitle}>📋 Your Feed</Text>
          <View style={styles.feedContainer}>
            {feedProfiles.length === 0 ? (
              <EmptyState {...EmptyStates.noFeed} />
            ) : (
              feedProfiles.map((profile, index) => {
                // Check if there's a sponsored ad at this position
                const sponsoredAd = feedAds.get(index);
                
                return (
                  <React.Fragment key={`feed-item-${index}`}>
                    {/* Render sponsored ad if available */}
                    {sponsoredAd && (
                      <SponsoredPost
                        key={`ad-${sponsoredAd.campaignId}`}
                        campaignId={sponsoredAd.campaignId}
                        impressionId={`${sponsoredAd.campaignId}_${Date.now()}`}
                        title={sponsoredAd.title}
                        description={sponsoredAd.description}
                        imageUrl={sponsoredAd.imageUrl}
                        brandName={sponsoredAd.brandName}
                        callToAction={sponsoredAd.callToAction}
                        targetUrl={sponsoredAd.targetUrl}
                        onImpression={handleAdImpression}
                        onClick={handleAdClick}
                      />
                    )}
                    
                    {/* Render normal profile card */}
                    <ProfileCard
                      key={profile.uid}
                      profile={profile}
                      onViewProfile={() => handleProfilePress(profile)}
                      onSendIcebreaker={() => handleSendIcebreaker(profile)}
                    />
                  </React.Fragment>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>

      {/* Token Purchase Modal */}
      <TokenPurchaseModal
        visible={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        onPurchase={(packId) => {
          console.log('Purchased pack:', packId);
          // Token balance will auto-update via subscription
        }}
      />

      {/* Icebreaker Templates Modal */}
      {selectedProfile && (
        <IcebreakerTemplates
          visible={showIcebreakerModal}
          onClose={() => {
            setShowIcebreakerModal(false);
            setSelectedProfile(null);
          }}
          onSelectTemplate={handleSelectIcebreakerTemplate}
          recipientName={selectedProfile.name}
        />
      )}

      {/* Phase 31C: Promo Bottom Sheet */}
      <BottomSheetPromo
        visible={showPromoModal}
        offer={activeDiscount}
        onClose={() => setShowPromoModal(false)}
        onActivate={handlePromoActivate}
        locale="en"
      />
      
      {/* Phase 32-5: Reward Store Prompt */}
      <RewardStorePrompt
        visible={showRewardPrompt}
        onClose={() => setShowRewardPrompt(false)}
        t={t}
      />
      
      {/* Phase 37: Daily Tasks Modal */}
      <DailyTasksModal
        visible={showDailyTasksModal}
        tasks={dailyTasks.tasks}
        completedCount={dailyTasks.completedCount}
        totalCount={dailyTasks.totalCount}
        onClose={() => setShowDailyTasksModal(false)}
        onNavigateForTask={handleDailyTaskNavigate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#F9F9F9',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  swipeContainer: {
    height: 600,
    marginTop: 20,
    paddingHorizontal: 20,
  },
  feedSection: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  feedTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  feedContainer: {
    paddingBottom: 20,
  },
  emptyFeed: {
    padding: 40,
    alignItems: 'center',
  },
  emptyFeedText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 16,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  premiumBannerIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  premiumBannerContent: {
    flex: 1,
  },
  premiumBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  premiumBannerSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D4AF37',
  },
  // Phase 36: Smart Suggestions CTA styles
  smartSuggestionsCTA: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  smartSuggestionsCTAButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    borderWidth: 2,
    borderColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  smartSuggestionsCTAContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smartSuggestionsCTAIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  smartSuggestionsCTAText: {
    flex: 1,
  },
  smartSuggestionsCTATitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  smartSuggestionsCTASubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D4AF37',
  },
  smartSuggestionsCTAArrow: {
    fontSize: 24,
    color: '#D4AF37',
    fontWeight: 'bold',
  },
  // Phase 37: Daily Tasks Banner styles
  dailyTasksBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  dailyTasksBannerButton: {
    backgroundColor: '#181818',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(64, 224, 208, 0.3)',
    position: 'relative',
    overflow: 'hidden',
  },
  dailyTasksBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dailyTasksBannerIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  dailyTasksBannerText: {
    flex: 1,
  },
  dailyTasksBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  dailyTasksBannerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  dailyTasksBadge: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  dailyTasksBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F0F0F',
  },
  dailyTasksPulse: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(64, 224, 208, 0.1)',
    borderRadius: 18,
  },
});

