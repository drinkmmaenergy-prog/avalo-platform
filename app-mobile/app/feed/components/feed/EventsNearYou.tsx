import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface EventsNearYouProps {
  title?: string;
}

export function EventsNearYou({ title = 'Events near you' }: EventsNearYouProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>No upcoming events</Text>
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
