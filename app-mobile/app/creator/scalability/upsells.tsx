/**
 * PACK 166: Smart Upsells Screen
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';

export default function UpsellsScreen() {
  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Smart Upsells</Text>
          <Text style={styles.subtitle}>Educational recommendations only</Text>
        </View>

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => Alert.alert('Info', 'Create upsell rule - coming soon')}
        >
          <Text style={styles.createButtonText}>+ Create Upsell Rule</Text>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Allowed Upsell Types</Text>
          <Text style={styles.infoItem}>✓ Related product recommendations</Text>
          <Text style={styles.infoItem}>✓ Complementary products</Text>
          <Text style={styles.infoItem}>✓ Bundle upgrades</Text>
          <Text style={styles.infoItem}>✓ Course continuations</Text>
          <Text style={styles.infoWarning}>✗ No "pay for attention" upsells</Text>
          <Text style={styles.infoWarning}>✗ No romantic/emotional incentives</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { backgroundColor: '#FFFFFF', padding: 24, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#000', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666' },
  createButton: { backgroundColor: '#007AFF', margin: 16, padding: 16, borderRadius: 12, alignItems: 'center' },
  createButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  infoCard: { backgroundColor: '#FFFFFF', margin: 16, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E5E5' },
  infoTitle: { fontSize: 16, fontWeight: '600', color: '#000', marginBottom: 12 },
  infoItem: { fontSize: 14, color: '#666', marginBottom: 8 },
  infoWarning: { fontSize: 14, color: '#FF3B30', marginTop: 4 },
});
