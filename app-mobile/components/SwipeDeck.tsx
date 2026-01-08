/**
 * SwipeDeck Component
 * Phase 27: Optimized with React.memo and performance improvements
 * Phase 31D-2: SmartMatch + SuperSwipe integration
 */

import React, { useState, useEffect, memo, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Dimensions,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProfileData } from '../lib/profileService';
import SwipeTutorial from './SwipeTutorial';
import SponsoredCard from './SponsoredCard';
import { AdCampaign } from '../services/sponsoredAdsService';
import SuperSwipeButton from './SuperSwipeButton';
import {
  calculateSmartMatch,
  calculateInterestsOverlap,
  calculateAgeCompatibility,
  calculateLocationScore,
  calculateActivityScore,
  getMatchTierColor,
  type MembershipTier as SmartMatchMembershipTier,
  type SmartMatchResult,
} from '../utils/smartMatch';

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = width - 40;
const CARD_HEIGHT = height * 0.65;

// Union type for swipe cards (profiles or ads)
export type SwipeCard =
  | { type: 'profile'; data: ProfileData }
  | { type: 'sponsored'; data: AdCampaign; impressionId?: string };

interface SwipeDeckProps {
  profiles: ProfileData[];
  sponsoredCards?: Map<number, AdCampaign>; // Position -> Ad mapping
  onSwipeLeft: (profile: ProfileData) => void;
  onSwipeRight: (profile: ProfileData) => void;
  onSwipeUp: (profile: ProfileData) => Promise<{ success: boolean; error?: string }>;
  onProfilePress: (profile: ProfileData) => void;
  onAdImpression?: (campaignId: string) => void;
  onAdClick?: (campaignId: string, impressionId: string) => void;
  currentTokenBalance: number;
  onNeedTokens: () => void;
  boostedProfiles?: Set<string>;
  currentUserProfile?: ProfileData; // Phase 31D-2: For SmartMatch calculation
}

export default function SwipeDeck({
  profiles,
  sponsoredCards = new Map(),
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onProfilePress,
  onAdImpression,
  onAdClick,
  currentTokenBalance,
  onNeedTokens,
  boostedProfiles = new Set(),
  currentUserProfile,
}: SwipeDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [superSwipeActive, setSuperSwipeActive] = useState<Set<string>>(new Set());
  const [goldBorderAnim] = useState(new Animated.Value(1));

  // Memoize combined cards array
  const cards = useMemo(() => {
    const combined: SwipeCard[] = [];
    
    profiles.forEach((profile, index) => {
      const sponsoredAd = sponsoredCards.get(index);
      if (sponsoredAd) {
        combined.push({
          type: 'sponsored',
          data: sponsoredAd,
          impressionId: `${sponsoredAd.campaignId}_${Date.now()}_${index}`,
        });
      }
      
      combined.push({
        type: 'profile',
        data: profile,
      });
    });
    
    return combined;
  }, [profiles, sponsoredCards]);

  // Phase 31D-2: Calculate SmartMatch scores for profiles
  const profileScores = useMemo(() => {
    const scores = new Map<string, SmartMatchResult>();
    
    if (!currentUserProfile) {
      return scores;
    }

    profiles.forEach(profile => {
      // Calculate various compatibility scores
      const interestsOverlap = calculateInterestsOverlap(
        currentUserProfile.interests || [],
        profile.interests || []
      );

      // Simplified age compatibility (within reasonable range)
      const userAge = currentUserProfile.age || 25;
      const profileAge = profile.age || 25;
      const ageDiff = Math.abs(userAge - profileAge);
      const ageCompatibility = ageDiff <= 10 ? 100 : Math.max(0, 100 - ageDiff * 5);

      // Location score (simplified - using 50km as default max)
      const locationScore = profile.city === currentUserProfile.city ? 100 : 50;

      // Activity score (using current time as placeholder for last active)
      const activityScore = calculateActivityScore(Date.now());

      // Membership tier for bonus
      const membershipTier: SmartMatchMembershipTier =
        currentUserProfile.membership === 'royal' ? 'ROYAL' :
        currentUserProfile.membership === 'vip' ? 'VIP' : 'FREE';

      const smartMatchResult = calculateSmartMatch({
        interestsOverlap,
        ageCompatibility,
        locationScore,
        activityScore,
        membershipTier,
      });

      scores.set(profile.uid, smartMatchResult);
    });

    return scores;
  }, [profiles, currentUserProfile]);

  useEffect(() => {
    checkFirstTime();
    checkSuperSwipeStates();
  }, []);

  useEffect(() => {
    // Animate gold border for TOP matches
    Animated.loop(
      Animated.sequence([
        Animated.timing(goldBorderAnim, {
          toValue: 1.1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(goldBorderAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const checkSuperSwipeStates = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const superSwipeKeys = keys.filter(key => key.startsWith('superswipe:'));
      const activeSet = new Set<string>();
      const now = Date.now();

      for (const key of superSwipeKeys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          const parsed = JSON.parse(data);
          if (parsed.expiresAt > now) {
            const userId = key.replace('superswipe:', '').split(':')[0];
            activeSet.add(userId);
          }
        }
      }

      setSuperSwipeActive(activeSet);
    } catch (error) {
      console.error('Error checking SuperSwipe states:', error);
    }
  };

  const checkFirstTime = async () => {
    try {
      const hasSeenTutorial = await AsyncStorage.getItem('hasSeenSwipeTutorial');
      if (!hasSeenTutorial) {
        setShowTutorial(true);
      }
    } catch (error) {
      console.error('Error checking tutorial status:', error);
    }
  };

  const handleCloseTutorial = async () => {
    try {
      await AsyncStorage.setItem('hasSeenSwipeTutorial', 'true');
      setShowTutorial(false);
    } catch (error) {
      console.error('Error saving tutorial status:', error);
      setShowTutorial(false);
    }
  };

  const currentCard = cards[currentIndex];
  
  // Phase 31D-2: Get SmartMatch score for current profile
  const currentSmartMatch = currentCard?.type === 'profile'
    ? profileScores.get(currentCard.data.uid)
    : null;

  const handleSkip = useCallback(() => {
    if (currentCard.type === 'profile') {
      onSwipeLeft(currentCard.data);
    }
    // For sponsored cards, just skip to next
    setCurrentIndex(prev => prev + 1);
  }, [currentCard, onSwipeLeft]);

  const handleLike = useCallback(() => {
    if (currentCard.type === 'profile') {
      onSwipeRight(currentCard.data);
    }
    // For sponsored cards, treat as click then skip
    else if (currentCard.type === 'sponsored' && onAdClick && currentCard.impressionId) {
      onAdClick(currentCard.data.campaignId, currentCard.impressionId);
    }
    setCurrentIndex(prev => prev + 1);
  }, [currentCard, onAdClick]);

  const handleSuperLike = useCallback(async () => {
    // SuperLike not available for sponsored cards
    if (currentCard.type === 'sponsored') {
      handleLike(); // Treat as regular click
      return;
    }

    const SUPERLIKE_COST = 50; // From monetization config
    
    if (currentTokenBalance < SUPERLIKE_COST) {
      Alert.alert(
        'Insufficient Tokens',
        `SuperLike costs ${SUPERLIKE_COST} tokens. You have ${currentTokenBalance} tokens.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Tokens', onPress: onNeedTokens },
        ]
      );
      return;
    }

    setLoading(true);
    const result = await onSwipeUp(currentCard.data);
    setLoading(false);

    if (result.success) {
      setCurrentIndex(currentIndex + 1);
    } else {
      if (result.error === 'INSUFFICIENT_BALANCE') {
        Alert.alert('Insufficient Tokens', 'You need more tokens to send a SuperLike', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Tokens', onPress: onNeedTokens },
        ]);
      } else {
        Alert.alert('Error', 'Failed to send SuperLike. Please try again.');
      }
    }
  }, [currentCard, currentTokenBalance, onSwipeUp, onNeedTokens]);

  if (!currentCard) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>🎉</Text>
        <Text style={styles.emptyTitle}>Koniec profilów</Text>
        <Text style={styles.emptyText}>Sprawdź później lub dostosuj swoje preferencje!</Text>
      </View>
    );
  }


  return (
    <View style={styles.container}>
      {/* Render appropriate card type */}
      {currentCard.type === 'sponsored' ? (
        <View style={styles.card}>
          <SponsoredCard
            campaignId={currentCard.data.campaignId}
            impressionId={currentCard.impressionId}
            title={currentCard.data.title}
            description={currentCard.data.description}
            imageUrl={currentCard.data.imageUrl}
            brandName={currentCard.data.brandName}
            callToAction={currentCard.data.callToAction}
            targetUrl={currentCard.data.targetUrl}
            onImpression={onAdImpression || (() => {})}
            onClick={onAdClick || (() => {})}
          />
        </View>
      ) : (
        <Animated.View
          style={[
            styles.card,
            currentSmartMatch?.tier === 'TOP' && {
              transform: [{ scale: goldBorderAnim }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.cardTouchable}
            onPress={() => onProfilePress(currentCard.data)}
            activeOpacity={0.95}
          >
            {/* Boost Badge */}
            {boostedProfiles.has(currentCard.data.uid) && (
              <View style={styles.boostBadge}>
                <Text style={styles.boostBadgeText}>⚡ BOOST</Text>
              </View>
            )}

            {/* Phase 31D-2: SuperSwipe Active Badge */}
            {superSwipeActive.has(currentCard.data.uid) && (
              <View style={styles.superSwipeBadge}>
                <Text style={styles.superSwipeBadgeText}>⚡ SuperSwipe Active</Text>
              </View>
            )}

            {/* Phase 31D-2: SmartMatch Badge */}
            {currentSmartMatch && (currentSmartMatch.tier === 'HIGH' || currentSmartMatch.tier === 'TOP') && (
              <View style={[
                styles.smartMatchBadge,
                currentSmartMatch.tier === 'TOP' && styles.smartMatchBadgeTop
              ]}>
                <Text style={styles.smartMatchBadgeText}>
                  {currentSmartMatch.tier === 'TOP' ? '⭐ Top Match' : '✨ High Match'}
                </Text>
              </View>
            )}

            {/* Photo with SmartMatch border */}
            <View style={[
              styles.imageContainer,
              boostedProfiles.has(currentCard.data.uid) && styles.imageContainerBoosted,
              currentSmartMatch?.tier === 'HIGH' && styles.imageContainerHighMatch,
              currentSmartMatch?.tier === 'TOP' && styles.imageContainerTopMatch,
            ]}>
            {currentCard.data.photos && currentCard.data.photos.length > 0 ? (
              <Image
                source={{ uri: currentCard.data.photos[0] }}
                style={styles.image}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.image, styles.placeholderImage]}>
                <Text style={styles.placeholderText}>📷</Text>
              </View>
            )}

            {/* Gradient Overlay */}
            <View style={styles.gradientOverlay} />

            {/* Profile Info */}
            <View style={styles.infoContainer}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{currentCard.data.name}</Text>
                {currentCard.data.age && <Text style={styles.age}>, {currentCard.data.age}</Text>}
              </View>
              
              {currentCard.data.city && (
                <Text style={styles.location}>📍 {currentCard.data.city}</Text>
              )}

              {currentCard.data.bio && (
                <Text style={styles.bio} numberOfLines={2}>
                  {currentCard.data.bio}
                </Text>
              )}

              {currentCard.data.interests && currentCard.data.interests.length > 0 && (
                <View style={styles.interestsRow}>
                  {currentCard.data.interests.slice(0, 3).map((interest, index) => (
                    <View key={index} style={styles.interestBadge}>
                      <Text style={styles.interestText}>{interest}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Phase 31D-2: SuperSwipe Button */}
      {currentCard?.type === 'profile' && currentUserProfile && (
        <View style={styles.superSwipeContainer}>
          <SuperSwipeButton
            targetUserId={currentCard.data.uid}
            membershipTier={
              currentUserProfile.membership === 'royal' ? 'ROYAL' :
              currentUserProfile.membership === 'vip' ? 'VIP' : 'FREE'
            }
            onActivate={() => {
              setSuperSwipeActive(prev => new Set([...prev, currentCard.data.uid]));
            }}
          />
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        {/* Skip Button */}
        <TouchableOpacity
          style={[styles.actionButton, styles.skipButton]}
          onPress={handleSkip}
          disabled={loading}
        >
          <Text style={styles.actionIcon}>✕</Text>
          <Text style={styles.actionLabel}>Pomiń</Text>
        </TouchableOpacity>

        {/* SuperLike Button */}
        <TouchableOpacity
          style={[styles.actionButton, styles.superLikeButton]}
          onPress={handleSuperLike}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.actionIcon}>⭐</Text>
              <Text style={styles.actionLabel}>SuperLike</Text>
              <Text style={styles.costLabel}>50 tokenów</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Like Button */}
        <TouchableOpacity
          style={[styles.actionButton, styles.likeButton]}
          onPress={handleLike}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={styles.actionIcon}>❤️</Text>
          <Text style={styles.actionLabel}>Lubię</Text>
        </TouchableOpacity>
      </View>

      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          {currentIndex + 1} / {cards.length}
        </Text>
      </View>

      {/* Swipe Tutorial */}
      <SwipeTutorial visible={showTutorial} onClose={handleCloseTutorial} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 80,
    opacity: 0.3,
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  infoContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  age: {
    fontSize: 24,
    color: '#fff',
  },
  location: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 8,
  },
  bio: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 12,
    lineHeight: 20,
  },
  interestsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  interestText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    gap: 16,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 70,
    height: 70,
    borderRadius: 35,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  skipButton: {
    backgroundColor: '#E0E0E0',
  },
  likeButton: {
    backgroundColor: '#40E0D0',
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  superLikeButton: {
    backgroundColor: '#FF6B6B',
    width: 80,
    height: 80,
    borderRadius: 40,
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  actionIcon: {
    fontSize: 32,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    marginTop: 2,
  },
  costLabel: {
    fontSize: 8,
    color: '#fff',
    opacity: 0.8,
  },
  progressContainer: {
    marginTop: 12,
  },
  progressText: {
    fontSize: 14,
    color: '#999',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 20,
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
  boostBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#40E0D0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  boostBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  imageContainerBoosted: {
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  cardTouchable: {
    width: '100%',
    height: '100%',
  },
  imageContainerHighMatch: {
    borderWidth: 3,
    borderColor: '#26D0CE',
    shadowColor: '#26D0CE',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  imageContainerTopMatch: {
    borderWidth: 4,
    borderColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
  },
  smartMatchBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: '#26D0CE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
    shadowColor: '#26D0CE',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  smartMatchBadgeTop: {
    backgroundColor: '#D4AF37',
    shadowColor: '#D4AF37',
  },
  smartMatchBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  superSwipeBadge: {
    position: 'absolute',
    top: 56,
    left: 16,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  superSwipeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  superSwipeContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
});
