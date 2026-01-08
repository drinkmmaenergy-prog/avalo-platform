/**
 * PACK 143 - CRM Dashboard
 * Main entry point for Avalo Business Suite
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
import { useRouter } from 'expo-router';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

interface DashboardStats {
  totalContacts: number;
  newContacts: number;
  totalRevenue: number;
  conversionRate: number;
}

export default function CRMDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    try {
      setLoading(true);
      const getAnalytics = httpsCallable(functions, 'getCRMAnalytics');
      
      const result = await getAnalytics({ period: 'month' });
      const data = result.data as any;
      
      if (data.success) {
        setStats(data.analytics.metrics);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadDashboardStats}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Business Suite</Text>
        <Text style={styles.subtitle}>Manage your audience and sales</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.totalContacts || 0}</Text>
          <Text style={styles.statLabel}>Total Contacts</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.newContacts || 0}</Text>
          <Text style={styles.statLabel}>New This Month</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            ${(stats?.totalRevenue || 0).toFixed(0)}
          </Text>
          <Text style={styles.statLabel}>Total Revenue</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {(stats?.conversionRate || 0).toFixed(1)}%
          </Text>
          <Text style={styles.statLabel}>Conversion Rate</Text>
        </View>
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => router.push('./contacts' as any)}
        >
          <Text style={styles.menuIcon}>👥</Text>
          <Text style={styles.menuTitle}>Contacts</Text>
          <Text style={styles.menuDescription}>
            Manage your audience and interactions
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => router.push('./segments' as any)}
        >
          <Text style={styles.menuIcon}>🎯</Text>
          <Text style={styles.menuTitle}>Segments</Text>
          <Text style={styles.menuDescription}>
            Create targeted audience groups
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => router.push('./funnels' as any)}
        >
          <Text style={styles.menuIcon}>🔄</Text>
          <Text style={styles.menuTitle}>Smart Funnels</Text>
          <Text style={styles.menuDescription}>
            Automate your sales sequences
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => router.push('./broadcasts' as any)}
        >
          <Text style={styles.menuIcon}>📢</Text>
          <Text style={styles.menuTitle}>Broadcasts</Text>
          <Text style={styles.menuDescription}>
            Send messages to your segments
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => router.push('./analytics' as any)}
        >
          <Text style={styles.menuIcon}>📊</Text>
          <Text style={styles.menuTitle}>Analytics</Text>
          <Text style={styles.menuDescription}>
            Track performance and conversions
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.disclaimerContainer}>
        <Text style={styles.disclaimerTitle}>⚠️ Ethical Guidelines</Text>
        <Text style={styles.disclaimerText}>
          • No romantic or NSFW content{'\n'}
          • No emotional manipulation{'\n'}
          • No external payment links{'\n'}
          • Product-driven content only{'\n'}
          • Contact privacy protected
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
    padding: 20,
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    marginHorizontal: '1%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
  menuContainer: {
    padding: 16,
  },
  menuItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4,
  },
  menuDescription: {
    fontSize: 14,
    color: '#6c757d',
  },
  disclaimerContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: '#fff3cd',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  disclaimerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  disclaimerText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#dc3545',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
