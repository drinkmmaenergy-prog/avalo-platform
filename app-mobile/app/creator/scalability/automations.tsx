/**
 * PACK 166: Passive Revenue Automations Screen
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';

export default function AutomationsScreen() {
  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Automations</Text>
          <Text style={styles.subtitle}>Passive revenue automations</Text>
        </View>

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => Alert.alert('Info', 'Create automation - coming soon')}
        >
          <Text style={styles.createButtonText}>+ Create Automation</Text>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Allowed Automation Triggers</Text>
          <Text style={styles.infoItem}>✓ Abandoned cart reminders</Text>
          <Text style={styles.infoItem}>✓ Course milestone unlocks</Text>
          <Text style={styles.infoItem}>✓ New product announcements</Text>
          <Text style={styles.infoItem}>✓ Learning path recommendations</Text>
          <Text style={styles.infoWarning}>✗ No "reminder to get attention"</Text>
          <Text style={styles.infoWarning}>✗ No emotional pressure triggers</Text>
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
