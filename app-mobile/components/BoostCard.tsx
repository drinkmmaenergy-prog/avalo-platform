import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export interface BoostCardProps {
  type: string;
  title: string;
  subtitle?: string;
  tokens: number;
  onBoost?: () => void;
}

export function BoostCard({ type, title, subtitle, tokens, onBoost }: BoostCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        <Text style={styles.tokens}>{tokens} tokens</Text>
      </View>

      <TouchableOpacity style={styles.action} onPress={onBoost}>
        <Text style={styles.actionText}>Boost</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0B0C12',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  left: { flexDirection: 'column', flex: 1 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  subtitle: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  tokens: { color: '#22c55e', fontSize: 13, marginTop: 6 },
  action: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#2563eb',
    borderRadius: 10,
  },
  actionText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
