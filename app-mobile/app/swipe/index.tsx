import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSwipeQueue } from "@/lib/hooks/useSwipeQueue";
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = width * 0.9;
const CARD_HEIGHT = height * 0.65;
const SWIPE_THRESHOLD = width * 0.25;

interface SwipeProfile {
  userId: string;
  displayName: string;
  age: number;
  city: string;
  country: string;
  photos: string[];
  bio: string;
  verified: boolean;
  distance: number;
  score: number;
}

export default function SwipeScreen() {
  const {
    profiles,
    loading,
    error,
    remaining,
    nextRefillAt,
    loadMore,
    removeProfile,
  } = useSwipeQueue();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const [matchModal, setMatchModal] = useState<{
    show: boolean;
    profile: SwipeProfile | null;
    matchId: string | null;
    chatId: string | null;
  }>({
    show: false,
    profile: null,
    matchId: null,
    chatId: null,
  });

  const position = useRef(new Animated.ValueXY()).current;
  const rotate = position.x.interpolate({
    inputRange: [-width / 2, 0, width / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp',
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, width / 4],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const nopeOpacity = position.x.interpolate({
    inputRange: [-width / 4, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !swiping,
      onPanResponderMove: Animated.event(
        [null, { dx: position.x, dy: position.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          // Swipe right (like)
          handleSwipe('like');
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          // Swipe left (dislike)
          handleSwipe('dislike');
        } else {
          // Return to center
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const handleSwipe = async (decision: 'like' | 'dislike') => {
    if (swiping || currentIndex >= profiles.length) return;

    setSwiping(true);
    const currentProfile = profiles[currentIndex];

    // Animate card off screen
    const direction = decision === 'like' ? 1 : -1;
    Animated.timing(position, {
      toValue: { x: direction * width * 1.5, y: 0 },
      duration: 300,
      useNativeDriver: false,
    }).start(async () => {
      // Process swipe
      try {
        const processSwipeFn = httpsCallable(functions, 'pack284_processSwipe');
        const result: any = await processSwipeFn({
          targetId: currentProfile.userId,
          decision,
        });

        if (result.data.success) {
          // Update remaining count
          if (result.data.matched) {
            // Show match modal
            setMatchModal({
              show: true,
              profile: currentProfile,
              matchId: result.data.matchId,
              chatId: result.data.chatId,
            });
          }

          // Move to next profile
          removeProfile(currentProfile.userId);
          setCurrentIndex(0);
          position.setValue({ x: 0, y: 0 });
          setSwiping(false);

          // Check if need more profiles
          if (profiles.length <= 5) {
            loadMore();
          }
        } else {
          throw new Error('Swipe failed');
        }
      } catch (err: any) {
        console.error('Swipe error:', err);
        
        // Check if limit reached
        if (err.message?.includes('limit')) {
          setShowLimitModal(true);
        }
        
        // Reset position
        position.setValue({ x: 0, y: 0 });
        setSwiping(false);
      }
    });
  };

  const handleLikeButton = () => {
    if (remaining <= 0) {
      setShowLimitModal(true);
      return;
    }
    handleSwipe('like');
  };

  const handleDislikeButton = () => {
    if (remaining <= 0) {
      setShowLimitModal(true);
      return;
    }
    handleSwipe('dislike');
  };

  const handleMatchChat = () => {
    if (matchModal.chatId) {
      setMatchModal({ show: false, profile: null, matchId: null, chatId: null });
      router.push(`/chat/${matchModal.chatId}` as any);
    }
  };

  const handleMatchKeepSwiping = () => {
    setMatchModal({ show: false, profile: null, matchId: null, chatId: null });
  };

  const currentProfile = profiles[currentIndex];

  if (loading && profiles.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Swipe</Text>
          <Text style={styles.remainingBadge}>{remaining} left</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff4458" />
          <Text style={styles.loadingText}>Loading profiles...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Swipe</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="sad-outline" size={64} color="#999" />
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadMore}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!currentProfile || profiles.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Swipe</Text>
          <Text style={styles.remainingBadge}>{remaining} left</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color="#999" />
          <Text style={styles.emptyText}>No more profiles nearby</Text>
          <Text style={styles.emptySubtext}>
            Try adjusting your filters or check back later
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadMore}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Swipe</Text>
        <View style={styles.headerRight}>
          <Text style={styles.remainingBadge}>{remaining} left</Text>
          <TouchableOpacity onPress={() => router.push('/swipe/filters' as any)}>
            <Ionicons name="options-outline" size={24} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Card Stack */}
      <View style={styles.cardContainer}>
        {/* Next card (background) */}
        {profiles[currentIndex + 1] && (
          <View style={[styles.card, styles.nextCard]}>
            <Image
              source={{ uri: profiles[currentIndex + 1].photos[0] }}
              style={styles.cardImage}
              resizeMode="cover"
            />
          </View>
        )}

        {/* Current card */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.card,
            {
              transform: [
                { translateX: position.x },
                { translateY: position.y },
                { rotate },
              ],
            },
          ]}
        >
          {/* Card Image */}
          <Image
            source={{ uri: currentProfile.photos[0] }}
            style={styles.cardImage}
            resizeMode="cover"
          />

          {/* Like Overlay */}
          <Animated.View
            style={[
              styles.likeOverlay,
              { opacity: likeOpacity },
            ]}
          >
            <View style={styles.likeStamp}>
              <Text style={styles.stampText}>LIKE</Text>
            </View>
          </Animated.View>

          {/* Nope Overlay */}
          <Animated.View
            style={[
              styles.nopeOverlay,
              { opacity: nopeOpacity },
            ]}
          >
            <View style={styles.nopeStamp}>
              <Text style={styles.stampText}>NOPE</Text>
            </View>
          </Animated.View>

          {/* Profile Info */}
          <View style={styles.cardInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>
                {currentProfile.displayName}, {currentProfile.age}
              </Text>
              {currentProfile.verified && (
                <Ionicons name="checkmark-circle" size={24} color="#4A90E2" />
              )}
            </View>
            <Text style={styles.location}>
              <Ionicons name="location-outline" size={16} color="#fff" />
              {' '}{currentProfile.city}, {currentProfile.country} • {currentProfile.distance} km away
            </Text>
            {currentProfile.bio && (
              <Text style={styles.bio} numberOfLines={2}>
                {currentProfile.bio}
              </Text>
            )}
          </View>
        </Animated.View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, styles.dislikeButton]}
          onPress={handleDislikeButton}
          disabled={swiping}
        >
          <Ionicons name="close" size={36} color="#ff4458" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.infoButton]}
          onPress={() => router.push(`/profile/${currentProfile.userId}` as any)}
        >
          <Ionicons name="information-circle-outline" size={28} color="#4A90E2" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.likeButton]}
          onPress={handleLikeButton}
          disabled={swiping}
        >
          <Ionicons name="heart" size={36} color="#00d68f" />
        </TouchableOpacity>
      </View>

      {/* Limit Reached Modal */}
      <Modal
        visible={showLimitModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLimitModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="time-outline" size={64} color="#ff4458" />
            <Text style={styles.modalTitle}>Swipe Limit Reached</Text>
            <Text style={styles.modalText}>
              You've reached today's swipe limit. New profiles will unlock over time when you're active.
            </Text>
            <View style={styles.modalStats}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Remaining</Text>
                <Text style={styles.statValue}>{remaining}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Next Refill</Text>
                <Text style={styles.statValue}>
                  {nextRefillAt ? new Date(nextRefillAt).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }) : 'Soon'}
                </Text>
              </View>
            </View>
            <Text style={styles.modalHint}>
              💡 Tip: Swipes refill at +10 per hour while you're using the app
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowLimitModal(false)}
            >
              <Text style={styles.modalButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Match Modal */}
      <Modal
        visible={matchModal.show}
        transparent
        animationType="fade"
        onRequestClose={handleMatchKeepSwiping}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.matchModalContent}>
            <View style={styles.matchHeader}>
              <Ionicons name="heart-circle" size={80} color="#ff4458" />
              <Text style={styles.matchTitle}>It's a Match! 🎉</Text>
            </View>
            
            {matchModal.profile && (
              <View style={styles.matchProfiles}>
                <Image
                  source={{ uri: matchModal.profile.photos[0] }}
                  style={styles.matchPhoto}
                />
              </View>
            )}

            <Text style={styles.matchText}>
              You and {matchModal.profile?.displayName} liked each other!
            </Text>

            <View style={styles.matchButtons}>
              <TouchableOpacity
                style={styles.matchKeepSwipingButton}
                onPress={handleMatchKeepSwiping}
              >
                <Text style={styles.matchKeepSwipingText}>Keep Swiping</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.matchSendMessageButton}
                onPress={handleMatchChat}
              >
                <Text style={styles.matchSendMessageText}>Send Message</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  remainingBadge: {
    backgroundColor: '#ff4458',
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  cardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
  },
  nextCard: {
    position: 'absolute',
    transform: [{ scale: 0.95 }],
    opacity: 0.5,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  likeOverlay: {
    position: 'absolute',
    top: 40,
    left: 40,
    transform: [{ rotate: '-20deg' }],
  },
  nopeOverlay: {
    position: 'absolute',
    top: 40,
    right: 40,
    transform: [{ rotate: '20deg' }],
  },
  likeStamp: {
    borderWidth: 4,
    borderColor: '#00d68f',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  nopeStamp: {
    borderWidth: 4,
    borderColor: '#ff4458',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  stampText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  cardInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
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
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  actionButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  dislikeButton: {
    borderWidth: 2,
    borderColor: '#ff4458',
  },
  likeButton: {
    borderWidth: 2,
    borderColor: '#00d68f',
  },
  infoButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#4A90E2',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#ff4458',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    width: width * 0.85,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    gap: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  modalStats: {
    flexDirection: 'row',
    gap: 40,
    marginTop: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalHint: {
    fontSize: 14,
    color: '#4A90E2',
    textAlign: 'center',
    marginTop: 8,
  },
  modalButton: {
    marginTop: 12,
    backgroundColor: '#ff4458',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 24,
    width: '100%',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  matchModalContent: {
    width: width * 0.9,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
  },
  matchHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  matchTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ff4458',
    marginTop: 12,
  },
  matchProfiles: {
    marginVertical: 20,
  },
  matchPhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#ff4458',
  },
  matchText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  matchButtons: {
    width: '100%',
    gap: 12,
  },
  matchKeepSwipingButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
  },
  matchKeepSwipingText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  matchSendMessageButton: {
    backgroundColor: '#ff4458',
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
  },
  matchSendMessageText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
