/**
 * Animated Token Balance Component
 * Animates token balance changes with visual feedback
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';

interface AnimatedTokenBalanceProps {
  balance: number;
  fontSize?: number;
  color?: string;
}

export default function AnimatedTokenBalance({
  balance,
  fontSize = 48,
  color = '#fff',
}: AnimatedTokenBalanceProps) {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const previousBalance = useRef(balance);

  useEffect(() => {
    if (previousBalance.current !== balance) {
      // Animate scale on balance change
      Animated.sequence([
        Animated.timing(scaleValue, {
          toValue: 1.2,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleValue, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      previousBalance.current = balance;
    }
  }, [balance]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleValue }] }}>
      <Text style={[styles.balance, { fontSize, color }]}>
        {balance.toLocaleString()}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  balance: {
    fontWeight: 'bold',
  },
});
