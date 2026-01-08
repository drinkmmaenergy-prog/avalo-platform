/**
 * Achievement Badge Component - Phase 31D-4
 * Displays individual achievement badges
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  getAchievementColor,
  getAchievementEmoji,
  type AchievementTier,
} from '../utils/achievementsEngine';

type AchievementBadgeProps = {
  tier: AchievementTier;
  name: string;
  description: string;
  unlocked: boolean;
  size?: 'small' | 'medium' | 'large';
};

export default function AchievementBadge({
  tier,
  name,
  description,
  unlocked,
  size = 'medium',
}: AchievementBadgeProps) {
  const color = getAchievementColor(tier);
  const emoji = getAchievementEmoji(tier);

  const badgeSize = size === 'small' ? 50 : size === 'large' ? 90 : 70;
  const emojiSize = size === 'small' ? 24 : size === 'large' ? 40 : 32;
  const nameSize = size === 'small' ? 12 : size === 'large' ? 16 : 14;
  const descSize = size === 'small' ? 10 : size === 'large' ? 13 : 11;

  return (
    <View style={styles.container}>
      {/* Badge Circle */}
      <View
        style={[
          styles.badge,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            backgroundColor: unlocked ? color : '#E0E0E0',
            borderColor: unlocked ? color : '#BDBDBD',
          },
        ]}
      >
        <Text style={[styles.emoji, { fontSize: emojiSize }]}>
          {unlocked ? emoji : '🔒'}
        </Text>
      </View>

      {/* Badge Info */}
      <Text
        style={[
          styles.name,
          { fontSize: nameSize },
          !unlocked && styles.lockedText,
        ]}
        numberOfLines={1}
      >
        {name}
      </Text>
      <Text
        style={[
          styles.description,
          { fontSize: descSize },
          !unlocked && styles.lockedText,
        ]}
        numberOfLines={2}
      >
        {description}
      </Text>

      {/* Unlocked Indicator */}
      {unlocked && (
        <View style={[styles.unlockedBadge, { backgroundColor: color }]}>
          <Text style={styles.unlockedText}>✓</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 8,
    maxWidth: 110,
  },
  badge: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    position: 'relative',
  },
  emoji: {
    textAlign: 'center',
  },
  name: {
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 2,
  },
  description: {
    color: '#666',
    textAlign: 'center',
  },
  lockedText: {
    color: '#999',
  },
  unlockedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  unlockedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
