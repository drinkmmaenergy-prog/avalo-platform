import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function BottomNavigation() {
  return (
    <View style={styles.container}>
      <Text style={styles.item}>Feed</Text>
      <Text style={styles.item}>Discover</Text>
      <Text style={styles.item}>Profile</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: '#020617',
    borderTopWidth: 1,
    borderTopColor: '#0f172a',
  },
  item: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
});
