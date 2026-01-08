/**
 * Social Momentum Card Component - Phase 32-7
 * Displays motivational insights based on real user activity
 * Gold + turquoise premium UI with animations
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from '../hooks/useTranslation';
import { MomentumInsight, dismissCard } from '../services/socialMomentumService';

interface SocialMomentumCardProps {
  insight: MomentumInsight;
  onDismiss: () => void;
}

export default function SocialMomentumCard({ insight, onDismiss }: SocialMomentumCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    // Fade in and slide up animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Pulse animation for high intensity (3-4)
    if (insight.intensity >= 3) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [insight.intensity]);

  const handleDismiss = async () => {
    // Fade out animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 30,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(async () => {
      await dismissCard();
      onDismiss();
    });
  };

  const handlePress = () => {
    if (insight.actionRoute) {
      router.push(insight.actionRoute as any);
    }
  };

  // Get category icon
  const getCategoryIcon = () => {
    switch (insight.category) {
      case 'VIEWS':
        return '👀';
      case 'MATCHES':
        return '💫';
      case 'QUIZ':
        return '📈';
      case 'PHOTO':
        return '📸';
      case 'LOCATION':
        return '📍';
      default:
        return '✨';
    }
  };

  // Get intensity color
  const getIntensityColor = () => {
    if (insight.intensity >= 4) return '#D4AF37'; // Gold
    if (insight.intensity >= 3) return '#40E0D0'; // Turquoise
    if (insight.intensity >= 2) return '#4CAF50'; // Green
    return '#2196F3'; // Blue
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [
            { translateY: slideAnim },
            { scale: pulseAnim },
          ],
        },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.card,
          { borderColor: getIntensityColor() },
        ]}
        onPress={handlePress}
        activeOpacity={0.9}
      >
        {/* Glow effect for high intensity */}
        {insight.intensity >= 3 && (
          <View
            style={[
              styles.glow,
              { backgroundColor: getIntensityColor() },
            ]}
          />
        )}

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.icon}>{getCategoryIcon()}</Text>
            <View style={styles.headerText}>
              <Text style={styles.title}>{t('momentum.title')}</Text>
              <Text style={styles.subtitle}>{t('momentum.subtitle')}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.dismissText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Message */}
        <View style={styles.messageContainer}>
          <Text style={styles.message}>{t(insight.message)}</Text>
          <Text style={styles.messageDescription}>
            {t(`${insight.message}Desc`)}
          </Text>
        </View>

        {/* Action */}
        <View style={styles.actionContainer}>
          <Text style={[styles.actionText, { color: getIntensityColor() }]}>
            {t('momentum.action')} →
          </Text>
          
          {/* Intensity indicator */}
          <View style={styles.intensityIndicator}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.intensityDot,
                  {
                    backgroundColor:
                      i < insight.intensity ? getIntensityColor() : '#333',
                  },
                ]}
              />
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
  },
  card: {
    backgroundColor: '#0F0F0F',
    borderRadius: 18,
    borderWidth: 2,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    top: -50,
    left: -50,
    right: -50,
    bottom: -50,
    opacity: 0.1,
    borderRadius: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    fontSize: 28,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: '#999',
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  dismissText: {
    fontSize: 16,
    color: '#999',
    lineHeight: 16,
  },
  messageContainer: {
    marginBottom: 16,
  },
  message: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    lineHeight: 24,
  },
  messageDescription: {
    fontSize: 14,
    color: '#CCCCCC',
    lineHeight: 20,
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  intensityIndicator: {
    flexDirection: 'row',
    gap: 4,
  },
  intensityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
