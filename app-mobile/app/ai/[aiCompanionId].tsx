/**
 * PACK 340 - AI Profile Screen (Mobile)
 * View AI companion details and start sessions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  getAICompanion,
  createAIChatSession,
  type AICompanion,
  type SessionType,
  formatTokens,
  formatRating,
  getCreatorBadge,
  calculateEffectivePrice,
} from "@/types/aiCompanion";

export default function AIProfileScreen() {
  const { aiCompanionId } = useLocalSearchParams<{ aiCompanionId: string }>();
  const [companion, setCompanion] = useState<AICompanion | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingSession, setStartingSession] = useState(false);

  // Mock user tier and token balance - in production, fetch from state/context
  const userTier = { tier: 'FREE' as const, ageVerified: true, kycVerified: true };
  const tokenBalance = 5000; // mock

  useEffect(() => {
    if (aiCompanionId) {
      loadCompanion();
    }
  }, [aiCompanionId]);

  const loadCompanion = async () => {
    try {
      setLoading(true);
      const data = await getAICompanion(aiCompanionId);
      setCompanion(data);
    } catch (error) {
      console.error('Error loading companion:', error);
      Alert.alert('Error', 'Failed to load AI companion');
    } finally {
      setLoading(false);
    }
  };

  const startSession = async (sessionType: SessionType) => {
    if (!companion) return;

    // Check age verification
    if (!userTier.ageVerified) {
      Alert.alert(
        'Age Verification Required',
        'You must be 18+ and verify your age to use AI companions.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Calculate price
    let basePrice = 0;
    if (sessionType === 'CHAT') {
      basePrice = companion.chatBucketPrice;
    } else if (sessionType === 'VOICE') {
      basePrice = companion.voicePricePerMinute;
    } else if (sessionType === 'VIDEO') {
      basePrice = companion.videoPricePerMinute;
    }

    const { price, discount } = calculateEffectivePrice(basePrice, sessionType, userTier);

    // Check balance
    if (tokenBalance < price) {
      Alert.alert(
        'Insufficient Tokens',
        `You need ${formatTokens(price)} tokens but have ${formatTokens(tokenBalance)}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Tokens', onPress: () => router.push('/wallet' as any) },
        ]
      );
      return;
    }

    // Confirm start
    Alert.alert(
      'Start Session',
      `Price: ${formatTokens(price)} tokens${discount > 0 ? ` (-${discount}%)` : ''}\n\n⚠️ No refund after session start\n\nYour balance: ${formatTokens(tokenBalance)} tokens`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            try {
              setStartingSession(true);
              const session = await createAIChatSession(aiCompanionId, sessionType);
              router.push(`/ai/chat/${session.sessionId}` as any);
            } catch (error) {
              console.error('Error starting session:', error);
              Alert.alert('Error', 'Failed to start session');
            } finally {
              setStartingSession(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!companion) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>AI companion not found</Text>
      </View>
    );
  }

  const badge = getCreatorBadge(companion);
  const chatPrice = calculateEffectivePrice(companion.chatBucketPrice, 'CHAT', userTier);
  const voicePrice = calculateEffectivePrice(companion.voicePricePerMinute, 'VOICE', userTier);
  const videoPrice = calculateEffectivePrice(companion.videoPricePerMinute, 'VIDEO', userTier);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Image source={{ uri: companion.avatarUrl }} style={styles.avatar} />
        <Text style={styles.name}>{companion.name}</Text>
        <View style={[styles.badge, { backgroundColor: badge.color }]}>
          <Text style={styles.badgeText}>{badge.text}</Text>
        </View>
        <Text style={styles.language}>🌐 {companion.language.toUpperCase()}</Text>
      </View>

      {/* Bio */}
      <View style={styles.section}>
        <Text style={styles.bio}>{companion.shortBio}</Text>
      </View>

      {/* Style Tags */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Style</Text>
        <View style={styles.tagsContainer}>
          {companion.styleTags.map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stats</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{companion.totalChats}</Text>
            <Text style={styles.statLabel}>Total Chats</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatRating(companion.averageRating)}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>
      </View>

      {/* Pricing */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pricing</Text>

        {/* Chat */}
        <View style={styles.priceCard}>
          <View style={styles.priceHeader}>
            <Text style={styles.priceTitle}>💬 Text Chat</Text>
            {chatPrice.discount > 0 && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>-{chatPrice.discount}%</Text>
              </View>
            )}
          </View>
          <Text style={styles.priceValue}>
            {formatTokens(chatPrice.price)} tokens / bucket
          </Text>
          <Text style={styles.priceDetail}>({companion.wordsPerBucket} words)</Text>
        </View>

        {/* Voice */}
        <View style={styles.priceCard}>
          <View style={styles.priceHeader}>
            <Text style={styles.priceTitle}>🎤 Voice Call</Text>
            {voicePrice.discount > 0 && (
              <View style={styles.vipBadge}>
                <Text style={styles.vipText}>VIP -{voicePrice.discount}%</Text>
              </View>
            )}
          </View>
          <Text style={styles.priceValue}>
            {formatTokens(voicePrice.price)} tokens / minute
          </Text>
          {voicePrice.discount > 0 && (
            <Text style={styles.originalPrice}>
              {formatTokens(companion.voicePricePerMinute)} tokens
            </Text>
          )}
        </View>

        {/* Video */}
        <View style={styles.priceCard}>
          <View style={styles.priceHeader}>
            <Text style={styles.priceTitle}>📹 Video Call</Text>
            {videoPrice.discount > 0 && (
              <View style={styles.vipBadge}>
                <Text style={styles.vipText}>VIP -{videoPrice.discount}%</Text>
              </View>
            )}
          </View>
          <Text style={styles.priceValue}>
            {formatTokens(videoPrice.price)} tokens / minute
          </Text>
          {videoPrice.discount > 0 && (
            <Text style={styles.originalPrice}>
              {formatTokens(companion.videoPricePerMinute)} tokens
            </Text>
          )}
        </View>
      </View>

      {/* Legal Banner */}
      <View style={styles.legalBanner}>
        <Text style={styles.legalText}>
          ⚠️ AI interaction · 18+ only · Tokens required · No refunds after session start
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={[styles.actionButton, styles.primaryButton]}
          onPress={() => startSession('CHAT')}
          disabled={startingSession}
        >
          <Text style={styles.actionButtonText}>💬 Start Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => startSession('VOICE')}
          disabled={startingSession}
        >
          <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
            🎤 Start Voice
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => startSession('VIDEO')}
          disabled={startingSession}
        >
          <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
            📹 Start Video
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Spacer */}
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  header: {
    alignItems: 'center',
    padding: 20,
    paddingTop: 80,
    backgroundColor: '#FFFFFF',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E0E0E0',
    marginBottom: 16,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  language: {
    fontSize: 14,
    color: '#8E8E93',
  },
  section: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
  },
  bio: {
    fontSize: 16,
    color: '#333333',
    lineHeight: 24,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
  },
  tagText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
  },
  priceCard: {
    padding: 16,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    marginBottom: 12,
  },
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  priceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 4,
  },
  priceDetail: {
    fontSize: 13,
    color: '#8E8E93',
  },
  originalPrice: {
    fontSize: 14,
    color: '#8E8E93',
    textDecorationLine: 'line-through',
  },
  discountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#34C759',
    borderRadius: 4,
  },
  discountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  vipBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFD700',
    borderRadius: 4,
  },
  vipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
  },
  legalBanner: {
    padding: 16,
    backgroundColor: '#FFF3CD',
    marginTop: 12,
  },
  legalText: {
    fontSize: 13,
    color: '#856404',
    textAlign: 'center',
  },
  actionsSection: {
    padding: 20,
    gap: 12,
  },
  actionButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
  },
  bottomSpacer: {
    height: 40,
  },
});
