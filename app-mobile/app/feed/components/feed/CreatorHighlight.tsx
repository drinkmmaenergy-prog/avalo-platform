import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface CreatorHighlightProps {
  name?: string;
  description?: string;
}

export function CreatorHighlight({
  name = 'Featured Creator',
  description = 'Discover top creators today',
}: CreatorHighlightProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{name}</Text>
      <Text style={styles.subtitle}>{description}</Text>
    </View>
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
  },
  subtitle: {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 13,
  },
});
