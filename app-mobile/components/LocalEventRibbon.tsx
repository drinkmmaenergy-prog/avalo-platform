/**
 * Local Event Ribbon Component
 * Phase 34: Local Fan Events & Meet-Ups
 * 
 * Displays active local event as a ribbon on creator's profile
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { LocalFanEvent, getTimeUntilEvent } from '../services/localEventService';

const COLORS = {
  gold: '#D4AF37',
  turquoise: '#40E0D0',
  darkBackground: '#0F0F0F',
  cardBackground: '#181818',
  white: '#FFFFFF',
  lightGray: '#CCCCCC',
  red: '#FF6B6B',
};

interface LocalEventRibbonProps {
  event: LocalFanEvent;
  isUnlocked: boolean;
  onPress: () => void;
}

export default function LocalEventRibbon({
  event,
  isUnlocked,
  onPress,
}: LocalEventRibbonProps) {
  const { t } = useTranslation();
  const [fadeAnim] = useState(new Animated.Value(0));
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    // Pulse animation for border
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.02,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const formatTimeUntil = () => {
    const { days, hours, isPast } = getTimeUntilEvent(event);
    
    if (isPast) {
      return t('localEvents.countdownSoon');
    }
    
    if (days > 0) {
      return t('localEvents.countdownDays', { count: days });
    }
    
    if (hours > 0) {
      return t('localEvents.countdownHours', { count: hours });
    }
    
    return t('localEvents.countdownSoon');
  };

  const getSeatsRemaining = () => {
    // This would need participants count from service
    // For now, return placeholder
    return event.maxSeats;
  };

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
        style={[
          styles.ribbon,
          isUnlocked ? styles.ribbonUnlocked : styles.ribbonLocked,
        ]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <View style={styles.content}>
          {/* Left section: Icon and info */}
          <View style={styles.leftSection}>
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>📍</Text>
            </View>
            
            <View style={styles.textContainer}>
              <View style={styles.badgeRow}>
                <Text style={[styles.badge, isUnlocked && styles.badgeUnlocked]}>
                  {isUnlocked 
                    ? t('localEvents.ribbonUnlocked', { city: event.city })
                    : t('localEvents.ribbonLocked', { city: event.city })
                  }
                </Text>
              </View>
              
              <Text style={styles.title} numberOfLines={1}>
                {event.title}
              </Text>
              
              <View style={styles.detailsRow}>
                <Text style={styles.countdown}>
                  ⏰ {formatTimeUntil()}
                </Text>
                <View style={styles.separator} />
                <Text style={styles.seats}>
                  {t('localEvents.ribbonSeatsLeft', { seats: getSeatsRemaining() })}
                </Text>
              </View>
            </View>
          </View>

          {/* Right section: CTA */}
          <View style={styles.rightSection}>
            <View style={[
              styles.ctaButton,
              isUnlocked ? styles.ctaButtonUnlocked : styles.ctaButtonLocked
            ]}>
              <Text style={[
                styles.ctaText,
                isUnlocked ? styles.ctaTextUnlocked : styles.ctaTextLocked
              ]}>
                {isUnlocked 
                  ? t('localEvents.viewEvent')
                  : t('localEvents.joinEvent')
                }
              </Text>
            </View>
          </View>
        </View>

        {/* Glow effect */}
        <View style={[
          styles.glowOverlay,
          isUnlocked && styles.glowOverlayUnlocked
        ]} />
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
    backgroundColor: COLORS.cardBackground,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
  },
  ribbonLocked: {
    borderColor: COLORS.turquoise,
    shadowColor: COLORS.turquoise,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  ribbonUnlocked: {
    borderColor: COLORS.gold,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    marginRight: 12,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.turquoise + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: COLORS.turquoise,
  },
  icon: {
    fontSize: 26,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  badgeRow: {
    marginBottom: 4,
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.turquoise,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeUnlocked: {
    color: COLORS.gold,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 6,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countdown: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.red,
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
    color: COLORS.lightGray,
  },
  rightSection: {
    justifyContent: 'center',
  },
  ctaButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  ctaButtonLocked: {
    backgroundColor: COLORS.turquoise,
    shadowColor: COLORS.turquoise,
  },
  ctaButtonUnlocked: {
    backgroundColor: COLORS.gold,
    shadowColor: COLORS.gold,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  ctaTextLocked: {
    color: COLORS.darkBackground,
  },
  ctaTextUnlocked: {
    color: '#000000',
  },
  glowOverlay: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 18,
    opacity: 0.1,
    zIndex: -1,
  },
  glowOverlayUnlocked: {
    backgroundColor: COLORS.gold,
  },
});
