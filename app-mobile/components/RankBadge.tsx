/**
 * RankBadge Component
 * PACK 33-9: Creator Leaderboards & Discovery Boost Engine
 * 
 * Displays rank badges for top creators with animations
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export type BadgeVariant = 'gold' | 'silver' | 'bronze' | 'rising_star';

interface RankBadgeProps {
  variant: BadgeVariant;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  animated?: boolean;
}

const BADGE_CONFIG = {
  gold: {
    color: '#D4AF37',
    gradient: ['#FFD700', '#FFA500'],
    icon: '👑',
    label: 'TOP 1',
    glow: 'rgba(212, 175, 55, 0.5)',
  },
  silver: {
    color: '#C0C0C0',
    gradient: ['#E8E8E8', '#B0B0B0'],
    icon: '🥈',
    label: 'TOP 2',
    glow: 'rgba(192, 192, 192, 0.5)',
  },
  bronze: {
    color: '#CD7F32',
    gradient: ['#CD8032', '#B87333'],
    icon: '🥉',
    label: 'TOP 3',
    glow: 'rgba(205, 127, 50, 0.5)',
  },
  rising_star: {
    color: '#40E0D0',
    gradient: ['#40E0D0', '#00CED1'],
    icon: '⭐',
    label: 'RISING',
    glow: 'rgba(64, 224, 208, 0.5)',
  },
};

const SIZE_CONFIG = {
  small: {
    container: 40,
    icon: 16,
    label: 8,
    borderWidth: 2,
  },
  medium: {
    container: 56,
    icon: 24,
    label: 10,
    borderWidth: 2.5,
  },
  large: {
    container: 80,
    icon: 36,
    label: 12,
    borderWidth: 3,
  },
};

export default function RankBadge({
  variant,
  size = 'medium',
  showLabel = true,
  animated = true,
}: RankBadgeProps) {
  const config = BADGE_CONFIG[variant];
  const sizeConfig = SIZE_CONFIG[size];
  
  // Pulse animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    if (!animated) return;
    
    // Pulse effect
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    
    // Glow effect
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );
    
    pulse.start();
    glow.start();
    
    return () => {
      pulse.stop();
      glow.stop();
    };
  }, [animated, pulseAnim, glowAnim]);
  
  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });
  
  return (
    <View style={styles.container}>
      {/* Glow effect */}
      {animated && (
        <Animated.View
          style={[
            styles.glow,
            {
              width: sizeConfig.container + 20,
              height: sizeConfig.container + 20,
              borderRadius: (sizeConfig.container + 20) / 2,
              backgroundColor: config.glow,
              opacity: glowOpacity,
            },
          ]}
        />
      )}
      
      {/* Badge container */}
      <Animated.View
        style={[
          styles.badge,
          {
            width: sizeConfig.container,
            height: sizeConfig.container,
            borderRadius: sizeConfig.container / 2,
            borderWidth: sizeConfig.borderWidth,
            borderColor: config.color,
            transform: animated ? [{ scale: pulseAnim }] : undefined,
          },
        ]}
      >
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: config.color,
            },
          ]}
        >
          <Text style={[styles.icon, { fontSize: sizeConfig.icon }]}>
            {config.icon}
          </Text>
        </View>
      </Animated.View>
      
      {/* Label */}
      {showLabel && (
        <View
          style={[
            styles.labelContainer,
            {
              backgroundColor: config.color,
            },
          ]}
        >
          <Text
            style={[
              styles.label,
              {
                fontSize: sizeConfig.label,
              },
            ]}
          >
            {config.label}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  } as const,
  glow: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -30 }, { translateY: -30 }],
  } as const,
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  } as const,
  iconContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  } as const,
  icon: {
    textAlign: 'center',
  } as const,
  labelContainer: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  } as const,
  label: {
    color: '#000000',
    fontWeight: 'bold',
    letterSpacing: 1,
  } as const,
});
