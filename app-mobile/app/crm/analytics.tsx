/**
 * PACK 143 - CRM Analytics
 * Track performance and conversions
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

interface AnalyticsData {
  totalContacts: number;
  newContacts: number;
  totalRevenue: number;
  averageOrderValue: number;
  conversionRate: number;
  topPerformingProducts: Array<{
    productName: string;
    salesCount: number;
    revenue: number;
  }>;
}

export default function AnalyticsScreen() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [period]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const getAnalytics = httpsCallable(functions, 'getCRMAnalytics');
      const result = await getAnalytics({ period });
      const data = result.data as any;
      
      if (data.success) {
        setAnalytics(data.analytics.metrics);
      }
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const periods = [
    { key: 'day', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
  ];

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Analytics</Text>
      </View>

      <View style={styles.periodSelector}>
        {periods.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[
              styles.periodButton,
              period === p.key && styles.periodButtonActive,
            ]}
            onPress={() => setPeriod(p.key as any)}
          >
            <Text
              style={[
                styles.periodButtonText,
                period === p.key && styles.periodButtonTextActive,
              ]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{analytics?.totalContacts || 0}</Text>
          <Text style={styles.statLabel}>Total Contacts</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{analytics?.newContacts || 0}</Text>
          <Text style={styles.statLabel}>New Contacts</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            ${(analytics?.totalRevenue || 0).toFixed(0)}
          </Text>
          <Text style={styles.statLabel}>Total Revenue</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            ${(analytics?.averageOrderValue || 0).toFixed(0)}
          </Text>
          <Text style={styles.statLabel}>Avg Order Value</Text>
        </View>

        <View style={[styles.statCard, styles.statCardFull]}>
          <Text style={styles.statValue}>
            {(analytics?.conversionRate || 0).toFixed(1)}%
          </Text>
          <Text style={styles.statLabel}>Conversion Rate</Text>
        </View>
      </View>

      {analytics?.topPerformingProducts && analytics.topPerformingProducts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Performing Products</Text>
          {analytics.topPerformingProducts.map((product, index) => (
            <View key={index} style={styles.productCard}>
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{product.productName}</Text>
                <Text style={styles.productStats}>
                  {product.salesCount} sales
                </Text>
              </View>
              <Text style={styles.productRevenue}>
                ${product.revenue.toFixed(0)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>📊 Analytics Privacy</Text>
        <Text style={styles.infoText}>
          • All metrics are aggregate only{'\n'}
          • No personal user data exposed{'\n'}
          • No fan leaderboards{'\n'}
          • No wealth tracking{'\n'}
          • Focus on product performance
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
  },
  periodSelector: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  periodButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  periodButtonText: {
    fontSize: 14,
    color: '#6c757d',
    fontWeight: '600',
  },
  periodButtonTextActive: {
    color: '#fff',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statCardFull: {
    width: '100%',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#6c757d',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 12,
  },
  productCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4,
  },
  productStats: {
    fontSize: 13,
    color: '#6c757d',
  },
  productRevenue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#28a745',
  },
  infoBox: {
    backgroundColor: '#e7f3ff',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#004085',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#004085',
    lineHeight: 20,
  },
});
