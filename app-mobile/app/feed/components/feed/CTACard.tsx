import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

interface CTACardProps {
  title?: string;
  actionLabel?: string;
  onPress?: () => void;
}

export function CTACard({
  title = 'Unlock more features',
  actionLabel = 'Upgrade',
  onPress,
}: CTACardProps) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.action}>{actionLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#020617',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  title: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  action: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
  },
});
