/**
 * PACK 50 — Royal Badge Component
 * Display Royal Club tier badge on profiles and chat
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RoyalTier, getRoyalTierDisplayName, getRoyalTierColor } from '../services/royalService';

interface Props {
  tier: RoyalTier;
  size?: 'small' | 'medium' | 'large';
  style?: any;
}

export default function RoyalBadge({ tier, size = 'medium', style }: Props) {
  // Don't render badge for NONE tier
  if (tier === 'NONE') {
    return null;
  }

  const tierColor = getRoyalTierColor(tier);
  const tierName = getRoyalTierDisplayName(tier);

  const badgeSize = {
    small: { fontSize: 10, padding: 4, icon: 12 },
    medium: { fontSize: 12, padding: 6, icon: 14 },
    large: { fontSize: 14, padding: 8, icon: 16 },
  }[size];

  return (
    <View style={[styles.badge, { borderColor: tierColor }, style]}>
      <Text style={[styles.icon, { fontSize: badgeSize.icon }]}>👑</Text>
      <Text style={[styles.text, { fontSize: badgeSize.fontSize, color: tierColor }]}>
        {tierName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontWeight: '600',
  },
});
