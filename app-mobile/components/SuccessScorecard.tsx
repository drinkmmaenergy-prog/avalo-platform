import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface SuccessScorecardComponentProps {
  score?: number;
  title?: string;
  subtitle?: string;
}

export function SuccessScorecardComponent({
  score = 0,
  title = 'Creator Success',
  subtitle = 'Performance overview',
}: SuccessScorecardComponentProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.score}>{score}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0b0b0b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  score: {
    marginTop: 8,
    color: '#22c55e',
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 4,
    color: '#9ca3af',
    fontSize: 13,
  },
});
