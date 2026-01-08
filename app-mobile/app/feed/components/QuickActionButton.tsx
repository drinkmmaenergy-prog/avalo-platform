import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';

interface QuickActionButtonProps {
  label?: string;
  onPress?: () => void;
}

export function QuickActionButton({
  label = '+',
  onPress,
}: QuickActionButtonProps) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  label: {
    color: '#020617',
    fontSize: 24,
    fontWeight: '800',
  },
});
