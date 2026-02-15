/**
 * VerifiedBadge Component
 * Displays a verification badge indicator
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface VerifiedBadgeProps {
  verified: boolean;
  size?: 'small' | 'medium' | 'large';
}

const SIZES = {
  small: { badge: 16, icon: 10 },
  medium: { badge: 24, icon: 14 },
  large: { badge: 32, icon: 18 },
};

export default function VerifiedBadge({ verified, size = 'medium' }: VerifiedBadgeProps) {
  if (!verified) return null;

  const dimensions = SIZES[size];

  return (
    <View
      style={[
        styles.badge,
        {
          width: dimensions.badge,
          height: dimensions.badge,
          borderRadius: dimensions.badge / 2,
        },
      ]}
    >
      <Text style={[styles.icon, { fontSize: dimensions.icon }]}>✓</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
