import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export interface BrandCardProps {
  brand?: {
    id?: string;
    name?: string;
    description?: string;
  };
  onPress?: () => void;
}

export function BrandCard({ brand, onPress }: BrandCardProps) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.card}>
      <Text style={styles.name}>{brand?.name ?? 'Brand'}</Text>
      <Text style={styles.description}>
        {brand?.description ?? 'Brand description'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: '#8E8E93',
  },
});
