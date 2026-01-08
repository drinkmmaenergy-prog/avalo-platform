import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface BadgeDisplayProps {
  badges?: string[];
}

export default function BadgeDisplay({ badges = [] }: BadgeDisplayProps) {
  if (!badges.length) return null;

  return (
    <View style={styles.container}>
      {badges.map((badge, index) => (
        <View key={index} style={styles.badge}>
          <Text style={styles.text}>{badge}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  badge: {
    backgroundColor: '#222',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
