/**
 * Season Pass Progress Modal
 * 
 * Animated modal shown when user unlocks a new tier
 * Features:
 * - Confetti animation
 * - Tier reward display
 * - Reward duration countdown
 * - Premium celebratory feel
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import type { TierReward } from '../services/seasonPassService';

const COLORS = {
  background: '#0F0F0F',
  gold: '#D4AF37',
  turquoise: '#40E0D0',
  darkGray: '#1A1A1A',
  mediumGray: '#2A2A2A',
  lightGray: '#CCCCCC',
  white: '#FFFFFF',
  purple: '#9D50BB',
  pink: '#FF6B9D',
};

interface SeasonPassProgressModalProps {
  visible: boolean;
  tier: TierReward | null;
  currentPoints: number;
  onClose: () => void;
}

export default function SeasonPassProgressModal({
  visible,
  tier,
  currentPoints,
  onClose,
}: SeasonPassProgressModalProps) {
  const { t } = useTranslation();
  const [scaleAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));
  const [fadeAnim] = useState(new Animated.Value(0));
  const [pulseAnim] = useState(new Animated.Value(1));
  
  const [confettiAnims] = useState(() =>
    Array.from({ length: 30 }, () => ({
      translateY: new Animated.Value(0),
      translateX: new Animated.Value(0),
      rotate: new Animated.Value(0),
      opacity: new Animated.Value(1),
      scale: new Animated.Value(1),
    }))
  );

  useEffect(() => {
    if (visible) {
      // Reset animations
      scaleAnim.setValue(0);
      slideAnim.setValue(50);
      fadeAnim.setValue(0);
      pulseAnim.setValue(1);

      // Main content animations
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 60,
          friction: 8,
          delay: 200,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          delay: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          delay: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Confetti animations
      confettiAnims.forEach((anim, index) => {
        const delay = index * 30;
        const duration = 2500 + Math.random() * 1000;
        const endY = 500 + Math.random() * 300;
        const endX = (Math.random() - 0.5) * 400;
        const rotations = Math.random() * 3 + 2;

        Animated.parallel([
          Animated.timing(anim.translateY, {
            toValue: endY,
            duration,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(anim.translateX, {
            toValue: endX,
            duration,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(anim.rotate, {
            toValue: rotations * 360,
            duration,
            delay,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(anim.scale, {
              toValue: 1.5,
              duration: duration * 0.3,
              delay,
              useNativeDriver: true,
            }),
            Animated.timing(anim.scale, {
              toValue: 0.8,
              duration: duration * 0.7,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(anim.opacity, {
            toValue: 0,
            duration: duration * 0.8,
            delay: delay + duration * 0.2,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      // Reset all animations
      confettiAnims.forEach((anim) => {
        anim.translateY.setValue(0);
        anim.translateX.setValue(0);
        anim.rotate.setValue(0);
        anim.opacity.setValue(1);
        anim.scale.setValue(1);
      });
    }
  }, [visible]);

  if (!tier) return null;

  const confettiColors = [
    COLORS.gold,
    COLORS.turquoise,
    COLORS.purple,
    COLORS.pink,
    '#FFE66D',
    '#A8E6CF',
    '#FF9500',
  ];

  const getTierEmoji = (tierNumber: number) => {
    switch (tierNumber) {
      case 1:
        return '🥈';
      case 2:
        return '🥇';
      case 3:
        return '👑';
      case 4:
        return '💎';
      case 5:
        return '🔥';
      default:
        return '⭐';
    }
  };

  const formatDuration = (hours: number) => {
    if (hours >= 168) {
      return t('seasonPass.daysCount', { count: hours / 24 });
    }
    return t('seasonPass.hoursCount', { count: hours });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Confetti particles */}
        {confettiAnims.map((anim, index) => {
          const color = confettiColors[index % confettiColors.length];
          const size = 6 + Math.random() * 10;
          const startX = Math.random() * 400 - 200;
          const shape = index % 3 === 0 ? 'circle' : 'square';

          return (
            <Animated.View
              key={index}
              style={[
                styles.confetti,
                shape === 'circle' ? styles.confettiCircle : styles.confettiSquare,
                {
                  width: size,
                  height: size,
                  backgroundColor: color,
                  left: '50%',
                  marginLeft: startX,
                  transform: [
                    { translateY: anim.translateY },
                    { translateX: anim.translateX },
                    { scale: anim.scale },
                    {
                      rotate: anim.rotate.interpolate({
                        inputRange: [0, 360],
                        outputRange: ['0deg', '360deg'],
                      }),
                    },
                  ],
                  opacity: anim.opacity,
                },
              ]}
            />
          );
        })}

        {/* Main modal content */}
        <Animated.View
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [
                { scale: scaleAnim },
                { translateY: slideAnim },
              ],
            },
          ]}
        >
          <View style={styles.content}>
            {/* Tier badge with pulse */}
            <Animated.View
              style={[
                styles.tierBadgeContainer,
                {
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <View style={styles.tierBadge}>
                <View style={styles.tierIconCircle}>
                  <Text style={styles.tierEmoji}>{getTierEmoji(tier.tier)}</Text>
                </View>
                <View style={styles.sparkle1}>
                  <Text style={styles.sparkleText}>✨</Text>
                </View>
                <View style={styles.sparkle2}>
                  <Text style={styles.sparkleText}>✨</Text>
                </View>
              </View>
            </Animated.View>

            {/* Title section */}
            <Text style={styles.congratsText}>{t('seasonPass.tierUnlocked')}</Text>
            <View style={styles.tierNumberBadge}>
              <Text style={styles.tierNumberText}>
                {t('seasonPass.tier')} {tier.tier}
              </Text>
            </View>

            {/* Reward card */}
            <View style={styles.rewardCard}>
              <Text style={styles.rewardName}>{tier.rewardName}</Text>
              
              <View style={styles.rewardMeta}>
                <View style={styles.rewardTypeContainer}>
                  <View style={[styles.rewardTypeBadge, getRewardTypeColor(tier.rewardType)]}>
                    <Text style={styles.rewardTypeText}>
                      {t(`seasonPass.rewardTypes.${tier.rewardType}`)}
                    </Text>
                  </View>
                </View>

                <View style={styles.durationContainer}>
                  <Text style={styles.durationLabel}>{t('seasonPass.duration')}:</Text>
                  <Text style={styles.durationValue}>
                    {formatDuration(tier.rewardDuration)}
                  </Text>
                </View>
              </View>

              <View style={styles.pointsAchieved}>
                <Text style={styles.pointsLabel}>{t('seasonPass.totalPoints')}:</Text>
                <Text style={styles.pointsValue}>{currentPoints}</Text>
              </View>
            </View>

            {/* Info banner */}
            <View style={styles.infoBanner}>
              <Text style={styles.infoIcon}>🎁</Text>
              <Text style={styles.infoText}>
                {t('seasonPass.rewardActive')}
              </Text>
            </View>

            {/* Action button */}
            <TouchableOpacity style={styles.continueButton} onPress={onClose}>
              <Text style={styles.continueButtonText}>
                {t('seasonPass.continue')}
              </Text>
              <Text style={styles.continueArrow}>→</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function getRewardTypeColor(type: string) {
  switch (type) {
    case 'frame':
      return { backgroundColor: COLORS.gold };
    case 'badge':
      return { backgroundColor: COLORS.turquoise };
    case 'animation':
      return { backgroundColor: COLORS.pink };
    case 'aura':
      return { backgroundColor: COLORS.purple };
    case 'entrance':
      return { backgroundColor: '#FF9500' };
    default:
      return { backgroundColor: COLORS.mediumGray };
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confetti: {
    position: 'absolute',
    top: -50,
  },
  confettiCircle: {
    borderRadius: 100,
  },
  confettiSquare: {
    borderRadius: 2,
  },
  container: {
    width: '90%',
    maxWidth: 420,
    borderRadius: 24,
    overflow: 'hidden',
  },
  content: {
    backgroundColor: COLORS.darkGray,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.gold,
  },
  tierBadgeContainer: {
    marginBottom: 24,
  },
  tierBadge: {
    position: 'relative',
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierIconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: COLORS.gold + '25',
    borderWidth: 4,
    borderColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  tierEmoji: {
    fontSize: 70,
  },
  sparkle1: {
    position: 'absolute',
    top: 0,
    right: 10,
  },
  sparkle2: {
    position: 'absolute',
    bottom: 10,
    left: 5,
  },
  sparkleText: {
    fontSize: 24,
  },
  congratsText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 12,
    textAlign: 'center',
  },
  tierNumberBadge: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 24,
  },
  tierNumberText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.background,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rewardCard: {
    width: '100%',
    backgroundColor: COLORS.mediumGray,
    borderRadius: 18,
    padding: 24,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: COLORS.gold + '40',
  },
  rewardName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.gold,
    marginBottom: 16,
    textAlign: 'center',
  },
  rewardMeta: {
    marginBottom: 16,
    gap: 12,
  },
  rewardTypeContainer: {
    alignItems: 'center',
  },
  rewardTypeBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  rewardTypeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  durationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.darkGray,
    padding: 12,
    borderRadius: 12,
  },
  durationLabel: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  durationValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.turquoise,
  },
  pointsAchieved: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.darkGray,
  },
  pointsLabel: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  pointsValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.gold,
  },
  infoBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.mediumGray,
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    gap: 8,
  },
  infoIcon: {
    fontSize: 20,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.lightGray,
    textAlign: 'center',
    flex: 1,
  },
  continueButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gold,
    borderRadius: 18,
    paddingVertical: 18,
    gap: 8,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  continueArrow: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.background,
  },
});
