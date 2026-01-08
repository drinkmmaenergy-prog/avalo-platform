/**
 * PACK 148 - All Transactions Screen
 * View complete transaction history
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

export default function TransactionsScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>All Transactions</Text>
        <Text style={styles.subtitle}>Complete blockchain ledger history</Text>
      </View>
      
      <View style={styles.content}>
        <Text style={styles.placeholder}>Transaction list coming soon</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  placeholder: {
    fontSize: 16,
    color: '#9CA3AF',
  },
});
