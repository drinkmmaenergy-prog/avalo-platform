/**
 * PACK 279D - AI Profile Screen
 * Detailed AI Companion profile with pricing and session routing
 * 
 * Routes to:
 * - AI Chat → PACK 279A (pack279_aiChatStart)
 * - AI Voice → PACK 279B (pack279_aiVoiceStart)
 * - AI Video → PACK 322 (pack322_aiVideoStartSession)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

interface AICompanionProfile {
  id: string;
  name: string;
  avatar: string;
  gender: 'male' | 'female' | 'other';
  language: string;
  style: string[];
  rating: number;
  reviewCount: number;
  creatorType: 'USER_CREATED' | 'AVALO_CREATED';
  creatorId?: string;
  creatorName?: string;
  isRoyalExclusive: boolean;
  description: string;
  personalityPrompt: string;
  chatPrice: number; // Fixed: 100 tokens per bucket
  voicePricing: {
    standard: number; // 10 tokens/min
    vip: number; // 7 tokens/min
    royal: number; // 5 tokens/min
  };
  videoPricing: {
    standard: number; // 20 tokens/min
    vip: number; // 14 tokens/min
    royal: number; // 10 tokens/min
  };
}

interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: Date;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AIProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [companion, setCompanion] = useState<AICompanionProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingSession, setStartingSession] = useState(false);

  useEffect(() => {
    if (id) {
      loadCompanionProfile();
    }
  }, [id]);

  const loadCompanionProfile = async () => {
    try {
      setLoading(true);

      // Load companion data
      const companionRef = doc(db, 'aiCompanions', id);
      const companionSnap = await getDoc(companionRef);

      if (!companionSnap.exists()) {
        Alert.alert('Error', 'AI Companion not found');
        router.back();
        return;
      }

      const data = companionSnap.data();
      const profile: AICompanionProfile = {
        id: companionSnap.id,
        name: data.name || 'AI Companion',
        avatar: data.avatarUrl || '🤖',
        gender: data.gender || 'other',
        language: data.language || 'en',
        style: data.style || [],
        rating: data.rating || 0,
        reviewCount: data.reviewCount || 0,
        creatorType: data.creatorType || 'AVALO_CREATED',
        creatorId: data.creatorId,
        creatorName: data.creatorName,
        isRoyalExclusive: data.isRoyalExclusive || false,
        description: data.description || '',
        personalityPrompt: data.personalityPrompt || '',
        chatPrice: 100, // Fixed per PACK 279A
        voicePricing: {
          standard: 10,
          vip: 7,
          royal: 5,
        },
        videoPricing: {
          standard: 20,
          vip: 14,
          royal: 10,
        },
      };

      setCompanion(profile);

      // Load reviews
      const reviewsRef = collection(db, 'aiCompanionReviews');
      const reviewsQuery = query(
        reviewsRef,
        where('companionId', '==', id),
        orderBy('createdAt', 'desc'),
        limit(5)
      );
      const reviewsSnap = await getDocs(reviewsQuery);

      const loadedReviews: Review[] = reviewsSnap.docs.map((doc) => ({
        id: doc.id,
        userId: doc.data().userId,
        userName: doc.data().userName || 'Anonymous',
        rating: doc.data().rating,
        comment: doc.data().comment,
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      }));

      setReviews(loadedReviews);
    } catch (error) {
      console.error('Error loading companion profile:', error);
      Alert.alert('Error', 'Failed to load companion profile');
    } finally {
      setLoading(false);
    }
  };

  const handleStartChat = async () => {
    if (!companion) return;

    try {
      setStartingSession(true);

      // Call PACK 279A function
      const startChatFn = httpsCallable(functions, 'pack279_aiChatStart');
      const result = await startChatFn({ companionId: companion.id });

      const data = result.data as any;
      if (data.success) {
        // Navigate to chat screen
        router.push(`/ai/chat/${companion.id}` as any);
      } else {
        Alert.alert('Error', data.error || 'Failed to start chat');
      }
    } catch (error: any) {
      console.error('Error starting chat:', error);
      Alert.alert('Error', error.message || 'Failed to start chat session');
    } finally {
      setStartingSession(false);
    }
  };

  const handleStartVoice = async () => {
    if (!companion) return;

    try {
      setStartingSession(true);

      // Call PACK 279B function
      const startVoiceFn = httpsCallable(functions, 'pack279_aiVoiceStart');
      const result = await startVoiceFn({ companionId: companion.id });

      const data = result.data as any;
      if (data.success) {
        // Navigate to voice session screen
        router.push(`/ai/voice/${companion.id}` as any);
      } else {
        Alert.alert('Error', data.error || 'Failed to start voice session');
      }
    } catch (error: any) {
      console.error('Error starting voice:', error);
      Alert.alert('Error', error.message || 'Failed to start voice session');
    } finally {
      setStartingSession(false);
    }
  };

  const handleStartVideo = async () => {
    if (!companion) return;

    try {
      setStartingSession(true);

      // Call PACK 322 function
      const startVideoFn = httpsCallable(functions, 'pack322_aiVideoStartSession');
      const result = await startVideoFn({ 
        userId: 'current_user_id', // TODO: Get from auth context
        companionId: companion.id 
      });

      const data = result.data as any;
      if (data.success) {
        // Navigate to video session screen
        router.push(`/ai/video/${companion.id}?sessionId=${data.sessionId}` as any);
      } else {
        Alert.alert('Error', data.error || 'Failed to start video session');
      }
    } catch (error: any) {
      console.error('Error starting video:', error);
      Alert.alert('Error', error.message || 'Failed to start video session');
    } finally {
      setStartingSession(false);
    }
  };

  if (loading || !companion) {
    return (
      <View style={[styles.container, isDark && styles.containerDark, styles.centerContent]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={[styles.loadingText, isDark && styles.textSecondaryDark]}>
          Loading AI Profile...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Header */}
      <View style={[styles.header, isDark && styles.headerDark]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDark && styles.textDark]}>AI Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Avatar & Name */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            {companion.avatar.startsWith('http') ? (
              <Image source={{ uri: companion.avatar }} style={styles.avatarLarge} />
            ) : (
              <Text style={styles.avatarEmojiLarge}>{companion.avatar}</Text>
            )}
            {companion.isRoyalExclusive && (
              <View style={styles.royalBadgeLarge}>
                <Text style={styles.royalBadgeTextLarge}>👑 Royal Exclusive</Text>
              </View>
            )}
          </View>

          <Text style={[styles.companionName, isDark && styles.textDark]}>
            {companion.name}
          </Text>

          {/* Style badges */}
          <View style={styles.styleBadgesRow}>
            {companion.style.map((style, index) => (
              <View key={index} style={styles.styleBadgeLarge}>
                <Text style={styles.styleBadgeTextLarge}>{style}</Text>
              </View>
            ))}
          </View>

          {/* Rating */}
          <View style={styles.ratingSection}>
            <Text style={styles.ratingLarge}>⭐ {companion.rating.toFixed(1)}</Text>
            <Text style={[styles.reviewCountLarge, isDark && styles.textSecondaryDark]}>
              ({companion.reviewCount} reviews)
            </Text>
          </View>
        </View>

        {/* Description */}
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>About</Text>
          <Text style={[styles.descriptionText, isDark && styles.textSecondaryDark]}>
            {companion.description}
          </Text>
        </View>

        {/* Personality Preview */}
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Personality</Text>
          <Text style={[styles.personalityText, isDark && styles.textSecondaryDark]}>
            {companion.personalityPrompt.substring(0, 150)}...
          </Text>
        </View>

        {/* Creator Info */}
        {companion.creatorType === 'USER_CREATED' && (
          <View style={[styles.section, isDark && styles.sectionDark]}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Creator</Text>
            <Text style={[styles.creatorText, isDark && styles.textSecondaryDark]}>
              👤 Created by {companion.creatorName || 'User'}
            </Text>
          </View>
        )}

        {/* Pricing Summary */}
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Pricing</Text>

          {/* Chat Pricing */}
          <View style={styles.pricingRow}>
            <Text style={[styles.pricingLabel, isDark && styles.textDark]}>💬 Chat</Text>
            <Text style={[styles.pricingValue, isDark && styles.textDark]}>
              {companion.chatPrice} tokens / bucket
            </Text>
          </View>

          {/* Voice Pricing */}
          <View style={styles.pricingRow}>
            <Text style={[styles.pricingLabel, isDark && styles.textDark]}>🎤 Voice</Text>
            <View style={styles.pricingTiers}>
              <Text style={[styles.pricingTierText, isDark && styles.textSecondaryDark]}>
                Standard: {companion.voicePricing.standard}/min
              </Text>
              <Text style={[styles.pricingTierText, isDark && styles.textSecondaryDark]}>
                VIP: {companion.voicePricing.vip}/min
              </Text>
              <Text style={[styles.pricingTierText, isDark && styles.textSecondaryDark]}>
                Royal: {companion.voicePricing.royal}/min
              </Text>
            </View>
          </View>

          {/* Video Pricing */}
          <View style={styles.pricingRow}>
            <Text style={[styles.pricingLabel, isDark && styles.textDark]}>📹 Video</Text>
            <View style={styles.pricingTiers}>
              <Text style={[styles.pricingTierText, isDark && styles.textSecondaryDark]}>
                Standard: {companion.videoPricing.standard}/min
              </Text>
              <Text style={[styles.pricingTierText, isDark && styles.textSecondaryDark]}>
                VIP: {companion.videoPricing.vip}/min
              </Text>
              <Text style={[styles.pricingTierText, isDark && styles.textSecondaryDark]}>
                Royal: {companion.videoPricing.royal}/min
              </Text>
            </View>
          </View>
        </View>

        {/* Reviews */}
        {reviews.length > 0 && (
          <View style={[styles.section, isDark && styles.sectionDark]}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
              Recent Reviews
            </Text>
            {reviews.map((review) => (
              <View key={review.id} style={[styles.reviewCard, isDark && styles.reviewCardDark]}>
                <View style={styles.reviewHeader}>
                  <Text style={[styles.reviewUserName, isDark && styles.textDark]}>
                    {review.userName}
                  </Text>
                  <Text style={styles.reviewRating}>
                    ⭐ {review.rating.toFixed(1)}
                  </Text>
                </View>
                <Text style={[styles.reviewComment, isDark && styles.textSecondaryDark]}>
                  {review.comment}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Action Buttons */}
      <View style={[styles.actionButtons, isDark && styles.actionButtonsDark]}>
        <TouchableOpacity
          style={[styles.actionButton, styles.chatButton]}
          onPress={handleStartChat}
          disabled={startingSession}
        >
          <Text style={styles.actionButtonText}>💬 Start Chat</Text>
          <Text style={styles.actionButtonPrice}>{companion.chatPrice} tokens</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.voiceButton]}
          onPress={handleStartVoice}
          disabled={startingSession}
        >
          <Text style={styles.actionButtonText}>🎤 Voice Call</Text>
          <Text style={styles.actionButtonPrice}>From {companion.voicePricing.royal}/min</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.videoButton]}
          onPress={handleStartVideo}
          disabled={startingSession}
        >
          <Text style={styles.actionButtonText}>📹 Video Call</Text>
          <Text style={styles.actionButtonPrice}>From {companion.videoPricing.royal}/min</Text>
        </TouchableOpacity>
      </View>

      {/* Loading Overlay */}
      {startingSession && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingOverlayText}>Starting session...</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  containerDark: {
    backgroundColor: '#000000',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerDark: {
    backgroundColor: '#1C1C1E',
    borderBottomColor: '#38383A',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 24,
    color: '#007AFF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#FFFFFF',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarEmojiLarge: {
    fontSize: 100,
  },
  royalBadgeLarge: {
    position: 'absolute',
    bottom: 0,
    right: -10,
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  royalBadgeTextLarge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
  },
  companionName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
  },
  styleBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 12,
  },
  styleBadgeLarge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    margin: 4,
  },
  styleBadgeTextLarge: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  ratingSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingLarge: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFD700',
    marginRight: 8,
  },
  reviewCountLarge: {
    fontSize: 14,
    color: '#8E8E93',
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginTop: 12,
  },
  sectionDark: {
    backgroundColor: '#1C1C1E',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#8E8E93',
  },
  personalityText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#8E8E93',
    fontStyle: 'italic',
  },
  creatorText: {
    fontSize: 15,
    color: '#8E8E93',
  },
  pricingRow: {
    marginBottom: 16,
  },
  pricingLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  pricingValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
  },
  pricingTiers: {
    paddingLeft: 12,
  },
  pricingTierText: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  reviewCard: {
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  reviewCardDark: {
    backgroundColor: '#2C2C2E',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  reviewRating: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD700',
  },
  reviewComment: {
    fontSize: 14,
    lineHeight: 20,
    color: '#8E8E93',
  },
  actionButtons: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    gap: 8,
  },
  actionButtonsDark: {
    backgroundColor: '#1C1C1E',
    borderTopColor: '#38383A',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  chatButton: {
    backgroundColor: '#007AFF',
  },
  voiceButton: {
    backgroundColor: '#34C759',
  },
  videoButton: {
    backgroundColor: '#FF3B30',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionButtonPrice: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 2,
    opacity: 0.9,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlayText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
  },
  textDark: {
    color: '#FFFFFF',
  },
  textSecondaryDark: {
    color: '#8E8E93',
  },
});