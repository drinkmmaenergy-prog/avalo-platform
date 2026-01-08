/**
 * PACK 166: A/B Pricing Tests Screen
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
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface PricingTest {
  testId: string;
  productId: string;
  testName: string;
  status: string;
  currentImpressions: number;
  targetImpressions: number;
  variants: any[];
}

export default function PricingTestsScreen() {
  const router = useRouter();
  const [tests, setTests] = useState<PricingTest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPricingTests();
  }, []);

  const loadPricingTests = async () => {
    try {
      // TODO: Implement list pricing tests function
      setTests([]);
    } catch (error) {
      console.error('Failed to load pricing tests:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNewTest = () => {
    Alert.alert(
      'Create Pricing Test',
      'A/B pricing tests help you optimize conversion rates through controlled price experiments.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: () => {
            // Navigate to creation form
            Alert.alert('Info', 'Test creation form - coming soon');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>A/B Pricing Tests</Text>
          <Text style={styles.subtitle}>
            Optimize prices with controlled experiments
          </Text>
        </View>

        <TouchableOpacity style={styles.createButton} onPress={createNewTest}>
          <Text style={styles.createButtonText}>+ Create New Test</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
        ) : tests.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyTitle}>No Pricing Tests Yet</Text>
            <Text style={styles.emptyText}>
              Create your first A/B test to optimize product pricing
            </Text>
          </View>
        ) : (
          tests.map((test) => (
            <View key={test.testId} style={styles.testCard}>
              <Text style={styles.testName}>{test.testName}</Text>
              <Text style={styles.testStatus}>Status: {test.status}</Text>
              <Text style={styles.testProgress}>
                {test.currentImpressions} / {test.targetImpressions} impressions
              </Text>
            </View>
          ))
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Allowed Test Types</Text>
          <Text style={styles.infoItem}>✓ Base price variations</Text>
          <Text style={styles.infoItem}>✓ Discount duration tests</Text>
          <Text style={styles.infoItem}>✓ Bundle price optimization</Text>
          <Text style={styles.infoItem}>✓ Subscription add-on pricing</Text>
          <Text style={styles.infoWarning}>
            ✗ No attention-based pricing tiers
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  createButton: {
    backgroundColor: '#007AFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loader: {
    marginTop: 32,
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  testCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  testName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  testStatus: {
    fontSize: 14,
    color: '#007AFF',
    marginBottom: 4,
  },
  testProgress: {
    fontSize: 14,
    color: '#666',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  infoItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  infoWarning: {
    fontSize: 14,
    color: '#FF3B30',
    marginTop: 8,
  },
});
