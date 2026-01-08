/**
 * PACK 166: Product Bundles Screen
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';

export default function BundlesScreen() {
  const [loading, setLoading] = useState(false);

  const createNewBundle = () => {
    Alert.alert(
      'Create Bundle',
      'Bundle 2-5 products together with a discount (max 40% off)',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Product Bundles</Text>
          <Text style={styles.subtitle}>
            Increase average order value with collections
          </Text>
        </View>

        <TouchableOpacity style={styles.createButton} onPress={createNewBundle}>
          <Text style={styles.createButtonText}>+ Create New Bundle</Text>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Bundle Rules</Text>
          <Text style={styles.infoItem}>✓ 2-5 products per bundle</Text>
          <Text style={styles.infoItem}>✓ Maximum 40% discount</Text>
          <Text style={styles.infoItem}>✓ Educational/functional value only</Text>
          <Text style={styles.infoWarning}>✗ No "girlfriend/boyfriend" bundles</Text>
          <Text style={styles.infoWarning}>✗ No NSFW content collections</Text>
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
