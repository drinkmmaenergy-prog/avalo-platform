/**
 * Membership Badge Component
 * Displays VIP or Royal badges on profiles
 * Supports badge stacking for multiple subscription tiers
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MembershipType } from '../config/monetization';

interface MembershipBadgeProps {
  membershipType: MembershipType;
  size?: 'small' | 'medium' | 'large';
  stackable?: boolean;
}

export default function MembershipBadge({
  membershipType,
  size = 'medium',
  stackable = false,
}: MembershipBadgeProps) {
  if (membershipType === 'none') {
    return null;
  }

  const badgeConfig = {
    vip: {
      label: 'VIP',
      icon: '⭐',
      gradient: ['#FFD700', '#FFA500'],
      color: '#FFD700',
    },
    royal: {
      label: 'ROYAL',
      icon: '👑',
      gradient: ['#9400D3', '#FF1493'],
      color: '#9400D3',
    },
  };

  const config = badgeConfig[membershipType];
  const sizeStyles = {
    small: { fontSize: 10, padding: 4, iconSize: 12 },
    medium: { fontSize: 12, padding: 6, iconSize: 14 },
    large: { fontSize: 14, padding: 8, iconSize: 16 },
  };

  const currentSize = sizeStyles[size];

  return (
    <View style={[styles.badge, { backgroundColor: config.color }]}>
      <Text style={[styles.icon, { fontSize: currentSize.iconSize }]}>
        {config.icon}
      </Text>
      <Text style={[styles.label, { fontSize: currentSize.fontSize }]}>
        {config.label}
      </Text>
    </View>
  );
}

/**
 * Stacked Badges Component
 * Shows multiple membership badges side by side
 */
interface StackedBadgesProps {
  memberships: MembershipType[];
  size?: 'small' | 'medium' | 'large';
}

export function StackedBadges({ memberships, size = 'medium' }: StackedBadgesProps) {
  const activeMemberships = memberships.filter(m => m !== 'none');
  
  if (activeMemberships.length === 0) {
    return null;
  }

  return (
    <View style={styles.stackContainer}>
      {activeMemberships.map((membership, index) => (
        <MembershipBadge
          key={`${membership}-${index}`}
          membershipType={membership}
          size={size}
          stackable={true}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  icon: {
    color: '#fff',
  },
  label: {
    color: '#fff',
    fontWeight: 'bold',
  },
  stackContainer: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
});
