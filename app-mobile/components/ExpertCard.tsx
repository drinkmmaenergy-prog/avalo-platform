import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

interface ExpertProfile {
  id: string;
  displayName: string;
  category?: string;
  rating?: number;
}

interface ExpertCardProps {
  expert: ExpertProfile;
  onPress?: () => void;
}

export default function ExpertCard({ expert, onPress }: ExpertCardProps) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.name}>{expert.displayName}</Text>

      {expert.category ? (
        <Text style={styles.category}>{expert.category}</Text>
      ) : null}

      {typeof expert.rating === 'number' ? (
        <Text style={styles.rating}>⭐ {expert.rating.toFixed(1)}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  name: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  category: {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 13,
  },
  rating: {
    marginTop: 6,
    color: '#facc15',
    fontSize: 13,
    fontWeight: '600',
  },
});
