import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';

export interface ProductCardProps {
  product?: {
    id?: string;
    name?: string;
    description?: string;
    price?: number;
    imageUrl?: string;
  };
  onPress?: () => void;
}

export function ProductCard({ product, onPress }: ProductCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      {product?.imageUrl ? (
        <Image source={{ uri: product.imageUrl }} style={styles.image} />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.placeholderText}>IMG</Text>
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.name}>{product?.name ?? 'Product name'}</Text>
        <Text style={styles.description} numberOfLines={2}>
          {product?.description ?? 'Product description'}
        </Text>

        {typeof product?.price === 'number' && (
          <Text style={styles.price}>{product.price.toFixed(2)} zł</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#F2F2F7',
  },
  imagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 6,
  },
  price: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
});
