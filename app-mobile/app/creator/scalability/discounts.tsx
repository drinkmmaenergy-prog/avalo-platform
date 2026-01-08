/**
 * PACK 166: Fair-Use Discounts Screen
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';

export default function DiscountsScreen() {
  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Discounts</Text>
          <Text style={styles.subtitle}>Ethical, fair-use discounts only</Text>
        </View>

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => Alert.alert('Info', 'Create discount - coming soon')}
        >
          <Text style={styles.createButtonText}>+ Create Discount</Text>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Allowed Discount Types</Text>
          <Text style={styles.infoItem}>✓ Launch discounts (new products)</Text>
          <Text style={styles.infoItem}>✓ Loyalty discounts (repeat customers)</Text>
          <Text style={styles.infoItem}>✓ Bundle discounts (product collections)</Text>
          <Text style={styles.infoItem}>✓ Event-linked discounts (seasonal)</Text>
          <Text style={styles.infoWarning}>✗ No emotional labor discounts</Text>
          <Text style={styles.infoWarning}>✗ No discounts for flirting/romance</Text>
          <Text style={styles.infoWarning}>✗ Maximum 50% discount allowed</Text>
        </View>

        <View style={styles.safetyCard}>
          <Text style={styles.safetyIcon}>🛡️</Text>
          <View style={styles.safetyContent}>
            <Text style={styles.safetyTitle}>Commercial Logic Only</Text>
            <Text style={styles.safetyText}>
              All discounts must be based on commercial logic, not emotional
              exploitation or targeting vulnerable groups.
            </Text>
          </View>
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
  safetyCard: { flexDirection: 'row', backgroundColor: '#E7F5FF', margin: 16, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#B3D9FF' },
  safetyIcon: { fontSize: 24, marginRight: 12 },
  safetyContent: { flex: 1 },
  safetyTitle: { fontSize: 16, fontWeight: '600', color: '#0066CC', marginBottom: 4 },
  safetyText: { fontSize: 14, color: '#004C99', lineHeight: 20 },
});
