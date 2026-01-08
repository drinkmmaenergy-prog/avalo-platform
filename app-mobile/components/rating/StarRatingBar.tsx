/**
 * PACK 423 — Star Rating Bar Component
 * Simple 1-5 star rating UI
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface StarRatingBarProps {
  rating: number;
  onRatingChange: (rating: 1 | 2 | 3 | 4 | 5) => void;
  size?: number;
  color?: string;
  disabled?: boolean;
}

export const StarRatingBar: React.FC<StarRatingBarProps> = ({
  rating,
  onRatingChange,
  size = 40,
  color = '#FFD700',
  disabled = false,
}) => {
  const stars = [1, 2, 3, 4, 5];

  return (
    <View style={styles.container}>
      {stars.map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => !disabled && onRatingChange(star as 1 | 2 | 3 | 4 | 5)}
          disabled={disabled}
          style={styles.starButton}
        >
          <Ionicons
            name={star <= rating ? 'star' : 'star-outline'}
            size={size}
            color={color}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  starButton: {
    padding: 4,
  },
});
