/**
 * Creator Drop Ribbon Component - Pack 33-7
 * Display limited-seat drop banner on creator profiles
 * Shows pulse animation when creator has active drops
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
  CreatorDrop,
  getActiveDrop,
  formatTimeRemaining,
} from '../services/creatorDropsService';

interface CreatorDropRibbonProps {
  creatorId: string;
  onPress: (drop: CreatorDrop) => void;
}

export default function CreatorDropRibbon({
  creatorId,
  onPress,
}: CreatorDropRibbonProps) {
  const { t } = useTranslation();
  const [drop, setDrop] = useState<CreatorDrop | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    loadDrop();
    const interval = setInterval(loadDrop, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [creatorId]);

  useEffect(() => {
    if (drop) {
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
            toValue: 1.08,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [drop]);

  const loadDrop = async () => {
    try {
      const activeDrop = await getActiveDrop(creatorId);
      setDrop(activeDrop);
    } catch (error) {
      console.error('Error loading creator drop:', error);
    }
  };

  if (!drop || !drop.active) return null;

  const seatsLeft = drop.seats - drop.purchasedBy.length;
  const timeLeft = formatTimeRemaining(drop.expiresAt);

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
        onPress={() => onPress(drop)}
        activeOpacity={0.9}
      >
        <View style={styles.content}>
          <View style={styles.leftSection}>
            <View style={styles.badgeContainer}>
              <Text style={styles.flame}>🎁</Text>
              <Text style={styles.badgeText}>
                {t('creatorDrops.limitedDrop') || 'Limited Drop'}
              </Text>
            </View>
            
            <Text style={styles.title} numberOfLines={1}>
              {t('creatorDrops.exclusiveBundle') || 'Exclusive Bundle'}
            </Text>
            
            <View style={styles.detailsRow}>
              <Text style={styles.price}>
                {drop.price} 💎
              </Text>
              <View style={styles.separator} />
              <Text style={styles.seats}>
                {seatsLeft}/{drop.seats} {t('creatorDrops.left') || 'left'}
              </Text>
              <View style={styles.separator} />
              <Text style={styles.countdown}>
                ⏰ {timeLeft}
              </Text>
            </View>
          </View>

          <View style={styles.rightSection}>
            <View style={styles.ctaButton}>
              <Text style={styles.ctaText}>
                {t('creatorDrops.buyNow') || 'Buy'}
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
    borderColor: '#40E0D0',
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
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
    color: '#40E0D0',
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
  seats: {
    fontSize: 12,
    fontWeight: '600',
    color: '#40E0D0',
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
    backgroundColor: '#40E0D0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#40E0D0',
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
    backgroundColor: '#40E0D0',
    opacity: 0.1,
    zIndex: -1,
  },
});
