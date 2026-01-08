import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface ChemistryBadgeDisplayProps {
  badges?: {
    level?: number;
    title?: string;
    description?: string;
  };
}

export default function ChemistryBadgeDisplay({
  badges,
}: ChemistryBadgeDisplayProps) {
  if (!badges) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Text style={styles.level}>🔥 {badges.level ?? 0}</Text>
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>
          {badges.title ?? 'Chemistry Level'}
        </Text>
        <Text style={styles.description}>
          {badges.description ?? 'User chemistry badge'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  level: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
  description: {
    fontSize: 11,
    color: '#8E8E93',
  },
});
