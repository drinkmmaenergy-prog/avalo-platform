/**
 * PACK 52: Creator Profile Screen
 * 
 * Shows detailed creator profile from marketplace perspective.
 * Includes ability to start chat or view media.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../lib/firebase';
import {
  fetchCreatorProfile,
  CreatorProfileSummary,
} from '../../services/creatorService';

export default function CreatorProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { creatorId } = useLocalSearchParams<{ creatorId: string }>();
  
  const [creator, setCreator] = useState<CreatorProfileSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (currentUser && creatorId) {
      loadCreatorProfile();
    }
  }, [currentUser, creatorId]);

  const loadCreatorProfile = async () => {
    if (!currentUser || !creatorId) return;

    try {
      setLoading(true);
      const profile = await fetchCreatorProfile(creatorId, currentUser.uid);
      setCreator(profile);
    } catch (error) {
      console.error('Error loading creator profile:', error);
      Alert.alert(
        t('error.title'),
        t('error.loadingProfile', { defaultValue: 'Failed to load profile' })
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStartChat = () => {
    if (!creator) return;
    
    // Navigate to existing chat flow
    router.push(`/chat/${creator.userId}`);
  };

  const handleViewMedia = () => {
    if (!creator) return;
    
    // Navigate to existing feed/PPM interface
    router.push(`/profile/${creator.userId}/media`);
  };

  const getRoyalBadgeColor = () => {
    if (!creator) return 'transparent';
    
    switch (creator.royalTier) {
      case 'ROYAL_PLATINUM':
        return '#E5E4E2';
      case 'ROYAL_GOLD':
        return '#FFD700';
      case 'ROYAL_SILVER':
        return '#C0C0C0';
      default:
        return 'transparent';
    }
  };

  const getRoyalLabel = () => {
    if (!creator) return '';
    
    switch (creator.royalTier) {
      case 'ROYAL_PLATINUM':
        return 'Platinum';
      case 'ROYAL_GOLD':
        return 'Gold';
      case 'ROYAL_SILVER':
        return 'Silver';
      default:
        return '';
    }
  };

  if (!currentUser) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('creator.profile.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>
            {t('auth.loginRequired', { defaultValue: 'Please log in to continue' })}
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('creator.profile.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  if (!creator) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('creator.profile.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="person-outline" size={64} color="#CCC" />
          <Text style={styles.errorText}>
            {t('creator.profileNotFound', { defaultValue: 'Creator profile not found' })}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('creator.profile.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <Image
            source={{ uri: creator.avatarUrl || 'https://via.placeholder.com/120' }}
            style={styles.profileAvatar}
          />
          <View style={styles.nameContainer}>
            <Text style={styles.profileName}>{creator.displayName}</Text>
            {creator.royalTier !== 'NONE' && (
              <View
                style={[
                  styles.royalBadge,
                  { backgroundColor: getRoyalBadgeColor() },
                ]}
              >
                <Text style={styles.royalText}>{getRoyalLabel()}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Trust Warning */}
        {creator.isHighRisk && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning" size={20} color="#FF3B30" />
            <Text style={styles.warningText}>
              {t('creator.highRiskWarning')}
            </Text>
          </View>
        )}

        {/* Info Section */}
        <View style={styles.section}>
          {/* Location */}
          {creator.mainLocationCity && creator.mainLocationCountry && (
            <View style={styles.infoRow}>
              <Ionicons name="location" size={20} color="#007AFF" />
              <Text style={styles.infoText}>
                {creator.mainLocationCity}, {creator.mainLocationCountry}
              </Text>
            </View>
          )}

          {/* Languages */}
          {creator.languages && creator.languages.length > 0 && (
            <View style={styles.infoRow}>
              <Ionicons name="language" size={20} color="#007AFF" />
              <Text style={styles.infoText}>
                {creator.languages.join(', ')}
              </Text>
            </View>
          )}

          {/* Trust Score */}
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark" size={20} color="#007AFF" />
            <Text style={styles.infoText}>
              Trust Score: {creator.trustScore}/100
            </Text>
          </View>
        </View>

        {/* Bio */}
        {creator.shortBio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('common.bio')}</Text>
            <Text style={styles.bioText}>{creator.shortBio}</Text>
          </View>
        )}

        {/* Pricing Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('creator.pricingInfo')}</Text>
          <View style={styles.pricingCard}>
            <View style={styles.pricingRow}>
              <Ionicons name="chatbubble-outline" size={20} color="#666" />
              <Text style={styles.pricingLabel}>
                {t('creator.messagePrice')}:
              </Text>
              <Text style={styles.pricingValue}>
                {creator.baseMessageTokenCost} tokens
              </Text>
            </View>
            <View style={styles.pricingRow}>
              <Ionicons name="image-outline" size={20} color="#666" />
              <Text style={styles.pricingLabel}>
                {t('creator.mediaPrice')}:
              </Text>
              <Text style={styles.pricingValue}>
                {t('creator.card.fromPrice', { tokens: creator.ppmMediaFromTokens })}
              </Text>
            </View>
          </View>
        </View>

        {/* Labels */}
        <View style={styles.section}>
          <View style={styles.labelsContainer}>
            {creator.earnsFromChat && (
              <View style={styles.label}>
                <Ionicons name="cash-outline" size={16} color="#34C759" />
                <Text style={styles.labelText}>
                  {t('creator.earnsFromChat')}
                </Text>
              </View>
            )}
            {creator.royalTier !== 'NONE' && (
              <View style={styles.label}>
                <Ionicons name="star" size={16} color={getRoyalBadgeColor()} />
                <Text style={styles.labelText}>
                  Royal {getRoyalLabel()}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleStartChat}
        >
          <Ionicons name="chatbubble" size={20} color="#FFF" />
          <Text style={styles.primaryButtonText}>
            {t('creator.profile.startChat')}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleViewMedia}
        >
          <Ionicons name="images-outline" size={20} color="#007AFF" />
          <Text style={styles.secondaryButtonText}>
            {t('creator.profile.viewMedia')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
  },
  content: {
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  profileAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000',
  },
  royalBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  royalText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3F3',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    gap: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#FFF',
    padding: 16,
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  bioText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  pricingCard: {
    gap: 12,
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pricingLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  pricingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  labelsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  labelText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  actionsContainer: {
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
});
