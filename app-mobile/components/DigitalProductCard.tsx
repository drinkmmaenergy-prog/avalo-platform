import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

export interface DigitalProduct {
  id: string;
  title: string;
  price: number;
  description?: string;
}

interface DigitalProductCardProps {
  product: DigitalProduct;
  onPress?: () => void;
}

export function DigitalProductCard({ product, onPress }: DigitalProductCardProps) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.title}>{product.title}</Text>
        <Text style={styles.price}>{product.price} tokens</Text>
      </View>

      {product.description ? (
        <Text style={styles.description}>{product.description}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f0f0f',
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    paddingRight: 8,
  },
  price: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '700',
  },
  description: {
    marginTop: 6,
    color: '#a1a1aa',
    fontSize: 13,
  },
});
