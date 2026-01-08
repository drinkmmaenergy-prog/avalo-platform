/**
 * PACK 272 — Complete Swipe Engine
 * 
 * Features:
 * - Daily limit tracking (50 swipes/day + hourly refills)
 * - Smart feed generation with ranking
 * - Match detection and modal
 * - Incognito mode integration
 * - Passport location support
 * - Anti-abuse filters
 * - Return-to-swipe logic
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Animated,
  PanResponder,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BottomNavigation } from './components/BottomNavigation';
import SwipeCard from './components/SwipeCard';
import MatchModal from './components/MatchModal';
import { colors, spacing, fontSizes, fontWeights } from "@/shared/theme";
import { useAuth } from "@/contexts/AuthContext";
import { swipeService, SWIPE_LIMITS } from './services/swipeService';
import { swipeFeedService, SwipeCard as SwipeCardType } from './services/swipeFeedService';

export default function SwipeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  // State
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<SwipeCardType[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipesRemaining, setSwipesRemaining] = useState(50);
  const [canRefill, setCanRefill] = useState(false);
  const [nextRefillMinutes, setNextRefillMinutes] = useState(0);
  const [matchModalVisible, setMatchModalVisible] = useState(false);
  const [matchedUser, setMatchedUser] = useState<SwipeCardType | null>(null);
  
  // Animation refs
  const position = useRef(new Animated.ValueXY()).current;
  const swipeAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (user?.uid) {
      initializeSwipeEngine();
    }
  }, [user]);

  useEffect(() => {
    // Update refill timer every minute
    const timer = setInterval(() => {
      updateRefillStatus();
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  /**
   * Initialize swipe engine
   */
  const initializeSwipeEngine = async () => {
    try {
      setLoading(true);

      // Get swipe limit status
      const limitStatus = await swipeService.getSwipeLimitStatus(user!.uid);
      setSwipesRemaining(limitStatus.swipesRemaining);
      setCanRefill(limitStatus.canRefillNow);
      
      if (limitStatus.nextRefillAt) {
        const minutes = Math.ceil(
          (limitStatus.nextRefillAt.getTime() - Date.now()) / 60000
        );
        setNextRefillMinutes(Math.max(0, minutes));
      }

      // Load user preferences and location
      const preferences = await loadUserPreferences();
      const location = await loadUserLocation();

      // Generate initial feed
      const feedResult = await swipeFeedService.generateFeed({
        userId: user!.uid,
        preferences,
        userLocation: location,
        batchSize: 20,
      });

      setCards(feedResult.cards);
      setCurrentIndex(0);
    } catch (error) {
      console.error('Failed to initialize swipe engine:', error);
      Alert.alert('Error', 'Failed to load profiles. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load user preferences
   */
  const loadUserPreferences = async () => {
    // TODO: Load from Firestore user preferences
    return {
      genderPreference: 'any' as const,
      minAge: 18,
      maxAge: 99,
      maxDistance: 100,
      nsfwAllowed: false,
    };
  };

  /**
   * Load user location (with Passport support)
   */
  const loadUserLocation = async () => {
    // TODO: Load from Firestore with Passport override support
    return {
      lat: 52.2297,
      lng: 21.0122,
      city: 'Warsaw',
      country: 'Poland',
      isPassport: false,
    };
  };

  /**
   * Update refill status
   */
  const updateRefillStatus = async () => {
    if (!user?.uid) return;
    
    try {
      const limitStatus = await swipeService.getSwipeLimitStatus(user.uid);
      setCanRefill(limitStatus.canRefillNow);
      
      if (limitStatus.nextRefillAt) {
        const minutes = Math.ceil(
          (limitStatus.nextRefillAt.getTime() - Date.now()) / 60000
        );
        setNextRefillMinutes(Math.max(0, minutes));
      }
    } catch (error) {
      console.error('Failed to update refill status:', error);
    }
  };

  /**
   * Handle refill request
   */
  const handleRefill = async () => {
    if (!user?.uid || !canRefill) return;

    try {
      const result = await swipeService.requestRefill(user.uid);
      
      if (result.success) {
        setSwipesRemaining(result.newLimit);
        setCanRefill(false);
        Alert.alert('Success!', result.message);
        updateRefillStatus();
      } else {
        Alert.alert('Not Available', result.message);
      }
    } catch (error) {
      console.error('Failed to request refill:', error);
      Alert.alert('Error', 'Failed to refill swipes. Please try again.');
    }
  };

  /**
   * Handle swipe action
   */
  const handleSwipe = async (
    action: 'like' | 'pass' | 'super_like',
    tokensCost?: number
  ) => {
    if (!user?.uid || currentIndex >= cards.length) return;

    const currentCard = cards[currentIndex];

    try {
      // Record swipe
      const result = await swipeService.recordSwipe({
        userId: user.uid,
        targetUserId: currentCard.userId,
        action,
        timestamp: new Date(),
        isSuperLike: action === 'super_like',
        tokensCost,
      });

      // Update swipes remaining
      setSwipesRemaining(result.swipesRemaining);

      // Check for match
      if (result.isMatch) {
        setMatchedUser(currentCard);
        setMatchModalVisible(true);
      }

      // Move to next card
      setCurrentIndex(prev => prev + 1);

      // Preload more cards if running low
      if (currentIndex >= cards.length - 5) {
        loadMoreCards();
      }
    } catch (error: any) {
      console.error('Failed to record swipe:', error);
      Alert.alert('Error', error.message || 'Failed to record swipe');
    }
  };

  /**
   * Load more cards
   */
  const loadMoreCards = async () => {
    if (!user?.uid) return;

    try {
      const preferences = await loadUserPreferences();
      const location = await loadUserLocation();

      const feedResult = await swipeFeedService.generateFeed({
        userId: user.uid,
        preferences,
        userLocation: location,
        batchSize: 10,
      });

      setCards(prev => [...prev, ...feedResult.cards]);
    } catch (error) {
      console.error('Failed to load more cards:', error);
    }
  };

  /**
   * Handle swipe left (pass)
   */
  const handleSwipeLeft = () => {
    handleSwipe('pass');
  };

  /**
   * Handle swipe right (like)
   */
  const handleSwipeRight = () => {
    handleSwipe('like');
  };

  /**
   * Handle super like
   */
  const handleSuperLike = () => {
    Alert.alert(
      'Super Like',
      'Super Likes cost 20 tokens. Stand out and get noticed!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Super Like',
          onPress: () => handleSwipe('super_like', 20),
        },
      ]
    );
  };

  /**
   * Handle expand profile
   */
  const handleExpandProfile = () => {
    const currentCard = cards[currentIndex];
    if (currentCard) {
      router.push(`/profile/${currentCard.userId}` as any);
    }
  };

  /**
   * Handle match modal actions
   */
  const handleStartChat = () => {
    if (matchedUser) {
      setMatchModalVisible(false);
      router.push(`/chat/${matchedUser.userId}` as any);
    }
  };

  const handleViewProfile = () => {
    if (matchedUser) {
      setMatchModalVisible(false);
      router.push(`/profile/${matchedUser.userId}` as any);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading profiles...</Text>
        </View>
        <BottomNavigation />
      </View>
    );
  }

  // No swipes remaining
  if (swipesRemaining <= 0) {
    return (
      <View style={styles.container}>
        <View style={styles.noSwipesContainer}>
          <Text style={styles.noSwipesIcon}>⏰</Text>
          <Text style={styles.noSwipesTitle}>Out of Swipes</Text>
          <Text style={styles.noSwipesText}>
            You've used all {SWIPE_LIMITS.DAILY_BASE} daily swipes
          </Text>
          
          {canRefill ? (
            <TouchableOpacity
              style={styles.refillButton}
              onPress={handleRefill}
            >
              <Text style={styles.refillButtonText}>
                Get +{SWIPE_LIMITS.HOURLY_REFILL} Swipes
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.refillInfo}>
              <Text style={styles.refillInfoText}>
                Next refill in {nextRefillMinutes} minutes
              </Text>
            </View>
          )}
          
          <Text style={styles.resetInfo}>
            Daily limit resets at midnight
          </Text>
        </View>
        <BottomNavigation />
      </View>
    );
  }

  // No more cards
  if (currentIndex >= cards.length) {
    return (
      <View style={styles.container}>
        <View style={styles.noCardsContainer}>
          <Text style={styles.noCardsIcon}>✨</Text>
          <Text style={styles.noCardsTitle}>That's Everyone!</Text>
          <Text style={styles.noCardsText}>
            You've seen all available profiles. Check back later for new matches!
          </Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={initializeSwipeEngine}
          >
            <Text style={styles.refreshButtonText}>Refresh Feed</Text>
          </TouchableOpacity>
        </View>
        <BottomNavigation />
      </View>
    );
  }

  const currentCard = cards[currentIndex];

  return (
    <View style={styles.container}>
      {/* Header with swipe counter */}
      <View style={styles.header}>
        <View style={styles.swipeCounter}>
          <Text style={styles.swipeCounterText}>
            {swipesRemaining} swipes left
          </Text>
        </View>
        
        {canRefill && (
          <TouchableOpacity
            style={styles.refillBadge}
            onPress={handleRefill}
          >
            <Text style={styles.refillBadgeText}>
              +{SWIPE_LIMITS.HOURLY_REFILL} Available
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Card stack */}
      <View style={styles.cardContainer}>
        <SwipeCard
          card={currentCard}
          onSwipeLeft={handleSwipeLeft}
          onSwipeRight={handleSwipeRight}
          onSuperLike={handleSuperLike}
          onExpand={handleExpandProfile}
        />
        
        {/* Show preview of next card */}
        {currentIndex + 1 < cards.length && (
          <View style={styles.nextCardPreview}>
            <SwipeCard
              card={cards[currentIndex + 1]}
              onSwipeLeft={() => {}}
              onSwipeRight={() => {}}
              onSuperLike={() => {}}
              onExpand={() => {}}
            />
          </View>
        )}
      </View>

      {/* Match modal */}
      {matchedUser && (
        <MatchModal
          visible={matchModalVisible}
          currentUserPhoto={user?.photoURL || ''}
          matchedUserPhoto={matchedUser.mainPhoto}
          matchedUserName={matchedUser.displayName}
          freeMessagesCount={6}
          onStartChat={handleStartChat}
          onViewProfile={handleViewProfile}
          onClose={() => setMatchModalVisible(false)}
        />
      )}

      <BottomNavigation />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSizes.base,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  swipeCounter: {
    backgroundColor: colors.backgroundCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
  },
  swipeCounterText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  refillBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
  },
  refillBadgeText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
  cardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  nextCardPreview: {
    position: 'absolute',
    opacity: 0.5,
    transform: [{ scale: 0.95 }],
    zIndex: -1,
  },
  noSwipesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxxl,
  },
  noSwipesIcon: {
    fontSize: 80,
    marginBottom: spacing.lg,
  },
  noSwipesTitle: {
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  noSwipesText: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  refillButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 24,
    marginBottom: spacing.md,
  },
  refillButtonText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
  refillInfo: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  refillInfoText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  resetInfo: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  noCardsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxxl,
  },
  noCardsIcon: {
    fontSize: 80,
    marginBottom: spacing.lg,
  },
  noCardsTitle: {
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  noCardsText: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  refreshButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 24,
  },
  refreshButtonText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
});
