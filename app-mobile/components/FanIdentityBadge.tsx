/**
 * Fan Identity Badge Component
 * Pack 33-13: Unified Fan Identity Engine
 * 
 * Small inline chip displaying relationship tag
 * Designed for dark theme (#0F0F0F background)
 * 18px minimum border radius, premium feel
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RelationshipTag } from '../services/fanIdentityService';

export interface FanIdentityBadgeProps {
  tag: RelationshipTag;
  size?: 'small' | 'medium';
}

const TAG_CONFIG = {
  NEW: {
    backgroundColor: '#2A2A2A',
    borderColor: '#555555',
    textColor: '#999999',
    glow: false,
  },
  WARMING_UP: {
    backgroundColor: 'rgba(64, 224, 208, 0.1)',
    borderColor: '#40E0D0',
    textColor: '#40E0D0',
    glow: false,
  },
  LOYAL: {
    backgroundColor: 'rgba(64, 224, 208, 0.15)',
    borderColor: '#40E0D0',
    textColor: '#40E0D0',
    glow: false,
  },
  VIP_FAN: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderColor: '#D4AF37',
    textColor: '#FFD700',
    glow: false,
  },
  ROYAL_FAN: {
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
    borderColor: '#D4AF37',
    textColor: '#FFD700',
    glow: true,
  },
};

const SIZE_CONFIG = {
  small: {
    fontSize: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  medium: {
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1.5,
  },
};

export const FanIdentityBadge: React.FC<FanIdentityBadgeProps> = ({ 
  tag, 
  size = 'small' 
}) => {
  const config = TAG_CONFIG[tag];
  const sizeConfig = SIZE_CONFIG[size];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
          borderWidth: sizeConfig.borderWidth,
          paddingHorizontal: sizeConfig.paddingHorizontal,
          paddingVertical: sizeConfig.paddingVertical,
        },
        config.glow && styles.glowEffect,
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: config.textColor,
            fontSize: sizeConfig.fontSize,
          },
        ]}
      >
        {tag.replace(/_/g, ' ')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 18,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '600',
    textTransform: 'capitalize',
    letterSpacing: 0.3,
  },
  glowEffect: {
    shadowColor: '#D4AF37',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
});

export default FanIdentityBadge;
