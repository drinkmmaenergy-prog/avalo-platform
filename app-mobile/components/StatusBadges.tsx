/**
 * Status Badges Component
 * Visual indicators for VIP, Royal, and Boosted status
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface StatusBadgesProps {
  isVIP?: boolean;
  isRoyal?: boolean;
  isBoosted?: boolean;
  membership?: 'none' | 'vip' | 'royal';
  size?: 'small' | 'medium' | 'large';
  layout?: 'horizontal' | 'vertical';
}

export function StatusBadges({
  isVIP = false,
  isRoyal = false,
  isBoosted = false,
  membership = 'none',
  size = 'medium',
  layout = 'horizontal',
}: StatusBadgesProps) {
  // Determine membership from props
  const hasRoyal = isRoyal || membership === 'royal';
  const hasVIP = (isVIP || membership === 'vip') && !hasRoyal; // Don't show VIP if Royal
  const hasBoost = isBoosted;

  const badges: React.ReactNode[] = [];

  if (hasBoost) {
    badges.push(<BoostedBadge key="boost" size={size} />);
  }

  if (hasRoyal) {
    badges.push(<RoyalBadge key="royal" size={size} />);
  } else if (hasVIP) {
    badges.push(<VIPBadge key="vip" size={size} />);
  }

  if (badges.length === 0) {
    return null;
  }

  return (
    <View style={[
      styles.container,
      layout === 'vertical' ? styles.verticalLayout : styles.horizontalLayout
    ]}>
      {badges}
    </View>
  );
}

interface BadgeProps {
  size: 'small' | 'medium' | 'large';
}

function VIPBadge({ size }: BadgeProps) {
  const sizeStyle = size === 'small' ? styles.small : size === 'large' ? styles.large : styles.medium;
  
  return (
    <View style={[styles.badge, styles.vipBadge, sizeStyle]}>
      <Text style={[styles.badgeText, sizeStyle]}>👑 VIP</Text>
    </View>
  );
}

function RoyalBadge({ size }: BadgeProps) {
  const sizeStyle = size === 'small' ? styles.small : size === 'large' ? styles.large : styles.medium;
  
  return (
    <View style={[styles.badge, styles.royalBadge, sizeStyle]}>
      <Text style={[styles.badgeText, sizeStyle]}>♛ ROYAL</Text>
    </View>
  );
}

function BoostedBadge({ size }: BadgeProps) {
  const sizeStyle = size === 'small' ? styles.small : size === 'large' ? styles.large : styles.medium;
  
  return (
    <View style={[styles.badge, styles.boostedBadge, sizeStyle]}>
      <Text style={[styles.badgeText, sizeStyle]}>🚀 BOOSTED</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexWrap: 'wrap',
  },
  horizontalLayout: {
    flexDirection: 'row',
    gap: 4,
  },
  verticalLayout: {
    flexDirection: 'column',
    gap: 4,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  vipBadge: {
    backgroundColor: '#FFD700',
  },
  royalBadge: {
    backgroundColor: '#9B59B6',
  },
  boostedBadge: {
    backgroundColor: '#9400D3',
  },
  badgeText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  small: {
    fontSize: 9,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  medium: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  large: {
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});

// Individual badge exports for direct use
export { VIPBadge, RoyalBadge, BoostedBadge };
