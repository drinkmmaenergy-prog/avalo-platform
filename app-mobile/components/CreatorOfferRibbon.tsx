/**
 * Creator Offer Ribbon Component
 * Pack 33-6 — Display limited-time offer banner on creator profiles
 * Shows a gold banner when creator has active offers
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import {
  CreatorOffer,
  getActiveOffersForViewer,
} from '../services/creatorOfferService';

interface CreatorOfferRibbonProps {
  creatorId: string;
  viewerId: string;
  onPress: (offer: CreatorOffer) => void;
}

export default function CreatorOfferRibbon({
  creatorId,
  viewerId,
  onPress,
}: CreatorOfferRibbonProps) {
  const { t } = useTranslation();
  const [offer, setOffer] = useState<CreatorOffer | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    loadOffer();
  }, [creatorId, viewerId]);

  useEffect(() => {
    if (offer) {
      // Fade in animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();

      // Pulse animation for attention
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [offer]);

  const loadOffer = async () => {
    try {
      const offers = await getActiveOffersForViewer(creatorId, viewerId);
      if (offers.length > 0) {
        // Show the first active offer
        setOffer(offers[0]);
      }
    } catch (error) {
      console.error('Error loading creator offer:', error);
    }
  };

  const getTimeRemaining = (expiresAt: number): string => {
    const now = Date.now();
    const diff = expiresAt - now;
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    
    return `${hours}h ${minutes}m`;
  };

  if (!offer) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ scale: pulseAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.ribbon}
        onPress={() => onPress(offer)}
        activeOpacity={0.9}
      >
        <View style={styles.content}>
          <View style={styles.leftSection}>
            <View style={styles.badgeContainer}>
              <Text style={styles.flame}>🔥</Text>
              <Text style={styles.badgeText}>
                {t('creatorOffers.viewer_bannerLimitedOffer') || 'Limited offer'}
              </Text>
            </View>
            
            <Text style={styles.title} numberOfLines={1}>
              {offer.title}
            </Text>
            
            <View style={styles.detailsRow}>
              <Text style={styles.price}>
                {offer.tokenPrice} {t('common.tokens') || 'tokens'}
              </Text>
              <View style={styles.separator} />
              <Text style={styles.countdown}>
                ⏰ {getTimeRemaining(offer.expiresAt)}
              </Text>
            </View>
          </View>

          <View style={styles.rightSection}>
            <View style={styles.ctaButton}>
              <Text style={styles.ctaText}>
                {t('creatorOffers.viewer_viewOffer') || 'View'}
              </Text>
            </View>
          </View>
        </View>

        {/* Glow effect */}
        <View style={styles.glowOverlay} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 12,
  },
  ribbon: {
    backgroundColor: '#1A1610',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingVertical: 14,
  },
  leftSection: {
    flex: 1,
    marginRight: 12,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  flame: {
    fontSize: 14,
    marginRight: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF6B6B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D4AF37',
  },
  separator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#707070',
    marginHorizontal: 8,
  },
  countdown: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  rightSection: {
    justifyContent: 'center',
  },
  ctaButton: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
    letterSpacing: 0.3,
  },
  glowOverlay: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 18,
    backgroundColor: '#D4AF37',
    opacity: 0.1,
    zIndex: -1,
  },
});
