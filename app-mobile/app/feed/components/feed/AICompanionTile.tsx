import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

interface AICompanionTileProps {
  title?: string;
  description?: string;
  onPress?: () => void;
}

export function AICompanionTile({
  title = 'AI Companion',
  description = 'Chat with your personal AI companion',
  onPress,
}: AICompanionTileProps) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
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
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  description: {
    color: '#94a3b8',
    fontSize: 13,
  },
});
