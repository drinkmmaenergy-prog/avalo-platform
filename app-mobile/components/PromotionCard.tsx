/**
 * PACK 61: Promotion Card Component
 * Displays a promotion in feeds/marketplace
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PromotionItem, logPromotionImpression, logPromotionClick } from '../services/promotionService';

interface PromotionCardProps {
  promotion: PromotionItem;
  userId: string;
  style?: any;
}

export default function PromotionCard({ promotion, userId, style }: PromotionCardProps) {
  const router = useRouter();
  const impressionLogged = useRef(false);

  // Log impression when component mounts
  useEffect(() => {
    if (!impressionLogged.current) {
      impressionLogged.current = true;
      logPromotionImpression(userId, promotion.campaignId, promotion.placement);
    }
  }, [userId, promotion.campaignId, promotion.placement]);

  const handlePress = () => {
    // Log click
    logPromotionClick(userId, promotion.campaignId, promotion.placement);

    // Navigate to deep link if provided
    if (promotion.deepLink) {
      // Handle internal navigation
      if (promotion.deepLink.startsWith('profile/')) {
        const profileId = promotion.deepLink.replace('profile/', '');
        router.push(`/profile/${profileId}`);
      } else if (promotion.deepLink.startsWith('marketplace/')) {
        const creatorId = promotion.deepLink.replace('marketplace/', '');
        router.push(`/marketplace/${creatorId}`);
      } else {
        // Generic navigation
        router.push(promotion.deepLink as any);
      }
    }
  };

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={styles.badge}>
        <Ionicons name="megaphone" size={12} color="#fff" />
        <Text style={styles.badgeText}>Sponsored</Text>
      </View>

      {promotion.imageUrl && (
        <Image
          source={{ uri: promotion.imageUrl }}
          style={styles.image}
          resizeMode="cover"
        />
      )}

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {promotion.title}
        </Text>
        {promotion.subtitle && (
          <Text style={styles.subtitle} numberOfLines={2}>
            {promotion.subtitle}
          </Text>
        )}
      </View>

      <View style={styles.arrow}>
        <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#fbbf24',
    overflow: 'hidden'
  },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4
  },
  image: {
    width: '100%',
    height: 120,
    backgroundColor: '#fef3c7'
  },
  content: {
    padding: 16,
    paddingRight: 40
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#78350f',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    color: '#92400e'
  },
  arrow: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -10
  }
});
