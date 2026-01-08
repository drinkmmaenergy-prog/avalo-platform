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
import { getRewardInfo, type CosmeticReward } from '../services/fanChallengeService';

const COLORS = {
  background: '#0F0F0F',
  gold: '#D4AF37',
  turquoise: '#40E0D0',
  darkGray: '#1A1A1A',
  mediumGray: '#2A2A2A',
  lightGray: '#CCCCCC',
  white: '#FFFFFF',
  green: '#34C759',
};

interface FanChallengeRewardPopupProps {
  visible: boolean;
  reward: CosmeticReward | null;
  expiresIn: string;
  onClose: () => void;
}

export default function FanChallengeRewardPopup({
  visible,
  reward,
  expiresIn,
  onClose,
}: FanChallengeRewardPopupProps) {
  const { t } = useTranslation();
  const [scaleAnim] = useState(new Animated.Value(0));
  const [confettiAnims] = useState(() =>
    Array.from({ length: 20 }, () => ({
      translateY: new Animated.Value(0),
      translateX: new Animated.Value(0),
      rotate: new Animated.Value(0),
      opacity: new Animated.Value(1),
    }))
  );

  useEffect(() => {
    if (visible) {
      // Scale animation for popup
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();

      // Confetti animation
      confettiAnims.forEach((anim, index) => {
        const delay = index * 50;
        const duration = 2000 + Math.random() * 1000;
        const endY = 400 + Math.random() * 200;
        const endX = (Math.random() - 0.5) * 300;

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
            toValue: Math.random() * 720 - 360,
            duration,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(anim.opacity, {
            toValue: 0,
            duration: duration * 0.7,
            delay: delay + duration * 0.3,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      scaleAnim.setValue(0);
      confettiAnims.forEach((anim) => {
        anim.translateY.setValue(0);
        anim.translateX.setValue(0);
        anim.rotate.setValue(0);
        anim.opacity.setValue(1);
      });
    }
  }, [visible]);

  if (!reward) return null;

  const rewardInfo = getRewardInfo(reward);

  const confettiColors = [
    COLORS.gold,
    COLORS.turquoise,
    '#FF6B6B',
    '#4ECDC4',
    '#FFE66D',
    '#A8E6CF',
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Confetti */}
        {confettiAnims.map((anim, index) => {
          const color = confettiColors[index % confettiColors.length];
          const size = 8 + Math.random() * 8;
          const startX = Math.random() * 300 - 150;

          return (
            <Animated.View
              key={index}
              style={[
                styles.confetti,
                {
                  width: size,
                  height: size,
                  backgroundColor: color,
                  left: '50%',
                  marginLeft: startX,
                  transform: [
                    { translateY: anim.translateY },
                    { translateX: anim.translateX },
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

        {/* Popup Content */}
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.content}>
            {/* Success Icon */}
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconEmoji}>{rewardInfo.icon}</Text>
              </View>
              <View style={styles.successBadge}>
                <Text style={styles.successEmoji}>✨</Text>
              </View>
            </View>

            {/* Title */}
            <Text style={styles.title}>{t('fanChallenge.congratulations')}</Text>
            <Text style={styles.subtitle}>{t('fanChallenge.rewardActivated')}</Text>

            {/* Reward Card */}
            <View style={styles.rewardCard}>
              <Text style={styles.rewardTitle}>{rewardInfo.title}</Text>
              <Text style={styles.rewardDescription}>{rewardInfo.description}</Text>
              
              <View style={styles.expirationBanner}>
                <Text style={styles.expirationLabel}>
                  {t('fanChallenge.rewardExpires')}
                </Text>
                <Text style={styles.expirationValue}>{expiresIn}</Text>
              </View>
            </View>

            {/* Info */}
            <View style={styles.infoBanner}>
              <Text style={styles.infoText}>
                {t('fanChallenge.cosmeticOnly')}
              </Text>
            </View>

            {/* Action Button */}
            <TouchableOpacity style={styles.actionButton} onPress={onClose}>
              <Text style={styles.actionButtonText}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confetti: {
    position: 'absolute',
    top: -50,
    borderRadius: 4,
  },
  container: {
    width: '85%',
    maxWidth: 400,
    borderRadius: 24,
    overflow: 'hidden',
  },
  content: {
    backgroundColor: COLORS.darkGray,
    padding: 32,
    alignItems: 'center',
  },
  iconContainer: {
    position: 'relative',
    marginBottom: 24,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.gold + '20',
    borderWidth: 3,
    borderColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconEmoji: {
    fontSize: 60,
  },
  successBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.green,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.darkGray,
  },
  successEmoji: {
    fontSize: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.lightGray,
    marginBottom: 24,
    textAlign: 'center',
  },
  rewardCard: {
    width: '100%',
    backgroundColor: COLORS.mediumGray,
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: COLORS.gold,
  },
  rewardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.gold,
    marginBottom: 8,
    textAlign: 'center',
  },
  rewardDescription: {
    fontSize: 15,
    color: COLORS.lightGray,
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  expirationBanner: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expirationLabel: {
    fontSize: 13,
    color: COLORS.lightGray,
    fontWeight: '600',
  },
  expirationValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.gold,
  },
  infoBanner: {
    width: '100%',
    backgroundColor: COLORS.mediumGray,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 12,
    color: COLORS.lightGray,
    textAlign: 'center',
  },
  actionButton: {
    width: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.background,
  },
});
