/**
 * PACK 48 — AI Companion List Screen
 * Display available AI companions for user to chat with
 * PACK 49 — Added personalization recommendations
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import {
  AICompanion,
  getAllAICompanions,
  startAIConversation,
} from '../../services/aiCompanionService';
import {
  fetchUserPersonalizationProfile,
  UserPersonalizationProfile,
} from '../../services/personalizationService';

export default function AICompanionListScreen() {
  const router = useRouter();
  const auth = getAuth();
  const [companions, setCompanions] = useState<AICompanion[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState<string | null>(null);
  const [personalizationProfile, setPersonalizationProfile] = useState<UserPersonalizationProfile | null>(null);

  useEffect(() => {
    loadCompanions();
    loadPersonalization();
  }, []);

  const loadCompanions = async () => {
    try {
      setLoading(true);
      const companionsList = await getAllAICompanions();
      setCompanions(companionsList);
    } catch (error: any) {
      console.error('[AICompanionListScreen] Error loading companions:', error);
      Alert.alert('Error', 'Failed to load AI companions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadPersonalization = async () => {
    if (!auth.currentUser) return;
    
    try {
      const profile = await fetchUserPersonalizationProfile(auth.currentUser.uid);
      setPersonalizationProfile(profile);
    } catch (error) {
      console.debug('[PACK 49] Personalization profile fetch failed (non-blocking)');
    }
  };

  // Simple heuristic: recommend companions if user has high AI usage score
  const isRecommended = (companion: AICompanion): boolean => {
    if (!personalizationProfile) return false;
    
    // Recommend if user has shown interest in AI (aiUsageScore > 30)
    return personalizationProfile.aiUsageScore > 30;
  };

  const handleCompanionPress = async (companion: AICompanion) => {
    if (!auth.currentUser) {
      Alert.alert('Error', 'You must be logged in to chat with AI companions');
      return;
    }

    // Check if NSFW companion requires Premium subscription
    if (companion.isNsfw) {
      Alert.alert(
        'Premium Required',
        'NSFW companions require a Premium subscription. Please upgrade to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Upgrade',
            onPress: () => {
              // Navigate to subscription screen
              // router.push('/subscription');
              Alert.alert('Info', 'Subscription upgrade coming soon!');
            },
          },
        ]
      );
      return;
    }

    try {
      setStartingChat(companion.companionId);

      // Start or get existing conversation
      const { conversationId } = await startAIConversation(companion.companionId);

      // Navigate to conversation screen
      router.push({
        pathname: '/screens/ai/conversation',
        params: {
          conversationId,
          companionId: companion.companionId,
          companionName: companion.displayName,
          companionAvatar: companion.avatarUrl,
        },
      });
    } catch (error: any) {
      console.error('[AICompanionListScreen] Error starting conversation:', error);
      
      if (error.message?.includes('Premium subscription')) {
        Alert.alert('Premium Required', error.message);
      } else {
        Alert.alert('Error', 'Failed to start conversation. Please try again.');
      }
    } finally {
      setStartingChat(null);
    }
  };

  const renderCompanion = ({ item }: { item: AICompanion }) => {
    const isStarting = startingChat === item.companionId;
    const recommended = isRecommended(item);

    return (
      <TouchableOpacity
        style={styles.companionCard}
        onPress={() => handleCompanionPress(item)}
        disabled={isStarting}
      >
        <Image
          source={{ uri: item.avatarUrl }}
          style={styles.avatar}
          defaultSource={require('../../assets/default-avatar.png')}
        />
        <View style={styles.companionInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.companionName}>{item.displayName}</Text>
            {item.isNsfw && (
              <View style={styles.nsfwBadge}>
                <Text style={styles.nsfwText}>18+</Text>
              </View>
            )}
            {recommended && (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>⭐ For You</Text>
              </View>
            )}
          </View>
          <Text style={styles.companionBio} numberOfLines={2}>
            {item.shortBio}
          </Text>
          <Text style={styles.companionLanguage}>
            🌍 {item.language.toUpperCase()}
          </Text>
        </View>
        {isStarting ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <Text style={styles.chatButton}>Chat</Text>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading AI Companions...</Text>
      </View>
    );
  }

  if (companions.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>No AI companions available</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadCompanions}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={companions}
        renderItem={renderCompanion}
        keyExtractor={(item) => item.companionId}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 20,
  },
  listContent: {
    padding: 16,
  },
  companionCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  companionInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  companionName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  nsfwBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nsfwText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  recommendedBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  recommendedText: {
    color: '#333',
    fontSize: 11,
    fontWeight: '600',
  },
  companionBio: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  companionLanguage: {
    fontSize: 12,
    color: '#999',
  },
  chatButton: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
