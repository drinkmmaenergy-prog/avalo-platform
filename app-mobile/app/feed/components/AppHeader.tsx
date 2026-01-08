import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface AppHeaderProps {
  title?: string;
}

export function AppHeader({ title = 'Avalo' }: AppHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 48,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#020617',
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
});
