/**
 * PACK 51 — Discovery Card Component
 * Profile card with monetization CTAs
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

interface DiscoveryCardProps {
  item: {
    userId: string;
    name: string;
    age: number;
    distanceKm: number | null;
    avatarUrl: string | null;
    mediaPreviewUrls: string[];
    royalTier: string | null;
    isHighRisk: boolean;
  };
  onVisible: () => void;
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32; // 16px margin on each side

export const DiscoveryCard: React.FC<DiscoveryCardProps> = ({ item, onVisible }) => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const viewedRef = useRef(false);

  // Record view when card becomes visible
  useEffect(() => {
    if (!viewedRef.current) {
      viewedRef.current = true;
      onVisible();
    }
  }, [onVisible]);

  const handleStartChat = () => {
    // Navigate to profile screen which will handle monetization
    navigation.navigate('Profile', { userId: item.userId });
  };

  const handleViewProfile = () => {
    // Navigate to full profile view
    navigation.navigate('Profile', { userId: item.userId });
  };

  const getRoyalBadgeText = () => {
    switch (item.royalTier) {
      case 'ROYAL_PLATINUM':
        return t('discovery.royalBadge') + ' 💎';
      case 'ROYAL_GOLD':
        return t('discovery.royalBadge') + ' 👑';
      case 'ROYAL_SILVER':
        return t('discovery.royalBadge') + ' ⭐';
      default:
        return null;
    }
  };

  const royalBadgeText = getRoyalBadgeText();

  return (
    <View style={styles.card}>
      {/* Media Preview Section */}
      <View style={styles.mediaContainer}>
        {item.mediaPreviewUrls.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.mediaScroll}
          >
            {item.mediaPreviewUrls.map((url, index) => (
              <Image
                key={index}
                source={{ uri: url }}
                style={styles.mediaImage}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        ) : item.avatarUrl ? (
          <Image
            source={{ uri: item.avatarUrl }}
            style={styles.mediaImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.mediaImage, styles.placeholderImage]}>
            <Text style={styles.placeholderText}>?</Text>
          </View>
        )}

        {/* Media indicator dots */}
        {item.mediaPreviewUrls.length > 1 && (
          <View style={styles.dotsContainer}>
            {item.mediaPreviewUrls.map((_, index) => (
              <View key={index} style={styles.dot} />
            ))}
          </View>
        )}
      </View>

      {/* Profile Info Section */}
      <View style={styles.infoContainer}>
        <View style={styles.headerRow}>
          <View style={styles.nameContainer}>
            <Text style={styles.name}>
              {item.name}, {item.age}
            </Text>
            {item.distanceKm !== null && (
              <Text style={styles.distance}>
                {item.distanceKm < 1
                  ? '<1 km'
                  : `${Math.round(item.distanceKm)} km`}
              </Text>
            )}
          </View>

          {/* Royal Badge */}
          {royalBadgeText && (
            <View style={styles.royalBadge}>
              <Text style={styles.royalBadgeText}>{royalBadgeText}</Text>
            </View>
          )}
        </View>

        {/* High Risk Warning */}
        {item.isHighRisk && (
          <View style={styles.warningContainer}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningText}>
              {t('discovery.highRisk')}
            </Text>
          </View>
        )}

        {/* CTA Buttons */}
        <View style={styles.ctaContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleStartChat}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              {t('discovery.startChat')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleViewProfile}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>
              {t('discovery.viewProfile')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  mediaContainer: {
    width: '100%',
    height: CARD_WIDTH * 1.2, // 1.2:1 aspect ratio
    backgroundColor: '#F0F0F0',
    position: 'relative',
  },
  mediaScroll: {
    flex: 1,
  },
  mediaImage: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.2,
  },
  placeholderImage: {
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 48,
    color: '#AAAAAA',
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  infoContainer: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  nameContainer: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  distance: {
    fontSize: 14,
    color: '#666666',
  },
  royalBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  royalBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000000',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  warningIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#856404',
  },
  ctaContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
});
