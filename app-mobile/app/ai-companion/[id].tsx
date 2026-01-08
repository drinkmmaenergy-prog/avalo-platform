/**
 * PACK 185 - AI Companion Detail Page
 * 
 * View detailed information about an AI companion
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  aiCharacters,
  AICharacter,
  AILore,
  AIPhotoset,
  AIVoiceProfile,
  getPersonalityEmoji,
  getCommunicationEmoji,
  getFlirtStyleDescription,
  formatLocation,
} from '../../lib/aiCharacters';
import { getAuth } from 'firebase/auth';

export default function AICompanionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const auth = getAuth();

  const [loading, setLoading] = useState(true);
  const [character, setCharacter] = useState<AICharacter | null>(null);
  const [lore, setLore] = useState<AILore | null>(null);
  const [photoset, setPhotoset] = useState<AIPhotoset | null>(null);
  const [voice, setVoice] = useState<AIVoiceProfile | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (id) {
      loadCharacterProfile();
      checkSubscriptionStatus();
    }
  }, [id]);

  const loadCharacterProfile = async () => {
    try {
      setLoading(true);
      const profile = await aiCharacters.getCompleteProfile(id);
      setCharacter(profile.character);
      setLore(profile.lore);
      setPhotoset(profile.photoset);
      setVoice(profile.voice);
    } catch (error) {
      console.error('Error loading character profile:', error);
      Alert.alert('Error', 'Failed to load character profile');
    } finally {
      setLoading(false);
    }
  };

  const checkSubscriptionStatus = async () => {
    if (!auth.currentUser) return;
    
    try {
      const subscriptions = await aiCharacters.getUserSubscriptions(auth.currentUser.uid);
      setIsSubscribed(subscriptions.some(c => c.characterId === id));
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const handleSubscribe = async () => {
    if (!auth.currentUser) {
      Alert.alert('Authentication Required', 'Please sign in to subscribe to AI companions');
      return;
    }

    try {
      setSubscribing(true);
      if (isSubscribed) {
        await aiCharacters.unsubscribeFromCharacter(auth.currentUser.uid, id);
        setIsSubscribed(false);
        Alert.alert('Unsubscribed', 'You have unsubscribed from this companion');
      } else {
        await aiCharacters.subscribeToCharacter(auth.currentUser.uid, id);
        setIsSubscribed(true);
        Alert.alert('Subscribed!', 'You can now chat with this companion');
      }
    } catch (error) {
      console.error('Error toggling subscription:', error);
      Alert.alert('Error', 'Failed to update subscription');
    } finally {
      setSubscribing(false);
    }
  };

  const handleStartChat = () => {
    if (!isSubscribed) {
      Alert.alert('Subscribe First', 'Please subscribe to start chatting with this companion');
      return;
    }
    router.push(`/chat/${id}` as any);
  };

  const handleReport = async () => {
    if (!auth.currentUser) return;

    Alert.alert(
      'Report Character',
      'Why are you reporting this character?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Safety Concern',
          onPress: async () => {
            try {
              await aiCharacters.reportCharacter(
                auth.currentUser!.uid,
                id,
                'safety_concern',
                'User reported safety concern'
              );
              Alert.alert('Reported', 'Thank you for your report. We will review it shortly.');
            } catch (error) {
              console.error('Error reporting character:', error);
            }
          },
        },
        {
          text: 'Inappropriate Content',
          onPress: async () => {
            try {
              await aiCharacters.reportCharacter(
                auth.currentUser!.uid,
                id,
                'inappropriate_content',
                'User reported inappropriate content'
              );
              Alert.alert('Reported', 'Thank you for your report. We will review it shortly.');
            } catch (error) {
              console.error('Error reporting character:', error);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={styles.loadingText}>Loading companion profile...</Text>
      </View>
    );
  }

  if (!character) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Character not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header Image */}
        <View style={styles.headerImage}>
          <Text style={styles.headerImagePlaceholder}>
            {getPersonalityEmoji(character.personalityStyle)}
          </Text>
        </View>

        {/* Back Button */}
        <TouchableOpacity style={styles.backButtonTop} onPress={() => router.back()}>
          <Text style={styles.backButtonTopText}>← Back</Text>
        </TouchableOpacity>

        {/* Character Info */}
        <View style={styles.infoContainer}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{character.name}</Text>
            <View style={styles.safetyBadge}>
              <View style={[styles.safetyDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.safetyText}>Verified</Text>
            </View>
          </View>

          <Text style={styles.location}>
            {character.age} • {formatLocation(character.countries, character.currentLocation)}
          </Text>

          {/* Personality Traits */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personality</Text>
            <View style={styles.traitRow}>
              <View style={styles.trait}>
                <Text style={styles.traitEmoji}>{getPersonalityEmoji(character.personalityStyle)}</Text>
                <Text style={styles.traitLabel}>{character.personalityStyle}</Text>
              </View>
              <View style={styles.trait}>
                <Text style={styles.traitEmoji}>{getCommunicationEmoji(character.communicationVibe)}</Text>
                <Text style={styles.traitLabel}>{character.communicationVibe}</Text>
              </View>
            </View>
            <Text style={styles.flirtStyle}>
              💝 {getFlirtStyleDescription(character.flirtStyle)}
            </Text>
          </View>

          {/* Lore/Backstory */}
          {lore && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About {character.name}</Text>
              <Text style={styles.loreText}>{lore.currentLifeSituation}</Text>
              
              <Text style={styles.subsectionTitle}>Background</Text>
              <Text style={styles.loreText}>{lore.childhood}</Text>
              
              <Text style={styles.subsectionTitle}>Career</Text>
              <Text style={styles.loreText}>{lore.careerPath}</Text>
            </View>
          )}

          {/* Interests */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Interests</Text>
            <View style={styles.tagContainer}>
              {character.interests.map((interest, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>{interest}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Skills */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <View style={styles.tagContainer}>
              {character.skills.map((skill, index) => (
                <View key={index} style={[styles.tag, styles.tagSkill]}>
                  <Text style={[styles.tagText, styles.tagTextSkill]}>{skill}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Dreams */}
          {lore && lore.dreams.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Dreams & Aspirations</Text>
              {lore.dreams.map((dream, index) => (
                <Text key={index} style={styles.bulletPoint}>• {dream}</Text>
              ))}
            </View>
          )}

          {/* Voice Info */}
          {voice && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Voice Profile</Text>
              <Text style={styles.voiceInfo}>
                🎤 {voice.baselineVoice.language}
                {voice.multilingualAbility.languages.length > 1 && 
                  ` + ${voice.multilingualAbility.languages.length - 1} more`}
              </Text>
              <Text style={styles.voiceSubtext}>
                {voice.moodVariations.length} mood variations available
              </Text>
            </View>
          )}

          {/* Report Button */}
          <TouchableOpacity style={styles.reportButton} onPress={handleReport}>
            <Text style={styles.reportButtonText}>⚠️ Report Character</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.subscribeButton, isSubscribed && styles.subscribedButton]}
          onPress={handleSubscribe}
          disabled={subscribing}
        >
          {subscribing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.subscribeButtonText}>
              {isSubscribed ? '✓ Subscribed' : '+ Subscribe'}
            </Text>
          )}
        </TouchableOpacity>

        {isSubscribed && (
          <TouchableOpacity style={styles.chatButton} onPress={handleStartChat}>
            <Text style={styles.chatButtonText}>💬 Start Chat</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#EF4444',
    marginBottom: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  headerImage: {
    width: '100%',
    height: 300,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerImagePlaceholder: {
    fontSize: 80,
  },
  backButtonTop: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  backButtonTopText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    padding: 20,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  safetyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  safetyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  safetyText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  location: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  traitRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  trait: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginRight: 12,
  },
  traitEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  traitLabel: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  flirtStyle: {
    fontSize: 15,
    color: '#7C3AED',
    fontWeight: '500',
  },
  loreText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '600',
  },
  tagSkill: {
    backgroundColor: '#DBEAFE',
  },
  tagTextSkill: {
    color: '#2563EB',
  },
  bulletPoint: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 24,
    marginBottom: 8,
  },
  voiceInfo: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 8,
  },
  voiceSubtext: {
    fontSize: 14,
    color: '#6B7280',
  },
  reportButton: {
    backgroundColor: '#FEF2F2',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  reportButtonText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    padding: 16,
    flexDirection: 'row',
  },
  subscribeButton: {
    flex: 1,
    backgroundColor: '#7C3AED',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  subscribedButton: {
    backgroundColor: '#10B981',
  },
  subscribeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  chatButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  chatButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});