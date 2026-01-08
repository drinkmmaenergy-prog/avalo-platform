/**
 * PACK 166: Digital Product Scalability Engine - Main Dashboard
 * 
 * Overview screen showing all scalability tools and metrics
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
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

interface ScalabilityMetrics {
  overview: {
    totalProducts: number;
    activeProducts: number;
    totalRevenue: number;
    totalPurchases: number;
    averageProductPrice: number;
  };
  testingMetrics: {
    activeTests: number;
    completedTests: number;
    averageConversionLift: number;
  };
  bundleMetrics: {
    activeBundles: number;
    bundleRevenue: number;
    bundleConversionRate: number;
  };
  automationMetrics: {
    activeAutomations: number;
    automationConversions: number;
    automationRevenue: number;
  };
  discountMetrics: {
    activeDiscounts: number;
    discountRedemptions: number;
    discountRevenueLoss: number;
  };
}

export default function ScalabilityDashboard() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<ScalabilityMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      const functions = getFunctions();
      const getMetrics = httpsCallable(functions, 'getCreatorScalabilityMetrics');
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      
      const result = await getMetrics({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      
      const data = result.data as any;
      if (data.success && data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading scalability metrics...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Scalability Engine</Text>
        <Text style={styles.subtitle}>Grow your digital product sales</Text>
      </View>

      {/* Overview Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Overview (Last 30 Days)</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{metrics?.overview.totalProducts || 0}</Text>
            <Text style={styles.statLabel}>Products</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{metrics?.overview.totalRevenue || 0}</Text>
            <Text style={styles.statLabel}>Revenue (Tokens)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{metrics?.overview.totalPurchases || 0}</Text>
            <Text style={styles.statLabel}>Purchases</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{Math.round(metrics?.overview.averageProductPrice || 0)}</Text>
            <Text style={styles.statLabel}>Avg Price</Text>
          </View>
        </View>
      </View>

      {/* Tools */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Scalability Tools</Text>
        
        <TouchableOpacity
          style={styles.toolCard}
          onPress={() => router.push('/creator/scalability/pricing-tests')}
        >
          <View style={styles.toolHeader}>
            <Text style={styles.toolIcon}>📊</Text>
            <View style={styles.toolContent}>
              <Text style={styles.toolTitle}>A/B Pricing Tests</Text>
              <Text style={styles.toolDescription}>
                Optimize prices with controlled experiments
              </Text>
            </View>
          </View>
          <View style={styles.toolStats}>
            <Text style={styles.toolStat}>
              {metrics?.testingMetrics.activeTests || 0} active
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolCard}
          onPress={() => router.push('/creator/scalability/bundles')}
        >
          <View style={styles.toolHeader}>
            <Text style={styles.toolIcon}>📦</Text>
            <View style={styles.toolContent}>
              <Text style={styles.toolTitle}>Product Bundles</Text>
              <Text style={styles.toolDescription}>
                Create collections to increase average order value
              </Text>
            </View>
          </View>
          <View style={styles.toolStats}>
            <Text style={styles.toolStat}>
              {metrics?.bundleMetrics.activeBundles || 0} active
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolCard}
          onPress={() => router.push('/creator/scalability/upsells')}
        >
          <View style={styles.toolHeader}>
            <Text style={styles.toolIcon}>🎯</Text>
            <View style={styles.toolContent}>
              <Text style={styles.toolTitle}>Smart Upsells</Text>
              <Text style={styles.toolDescription}>
                Recommend related products (educational only)
              </Text>
            </View>
          </View>
          <View style={styles.toolStats}>
            <Text style={styles.toolStat}>Value-driven recommendations</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolCard}
          onPress={() => router.push('/creator/scalability/automations')}
        >
          <View style={styles.toolHeader}>
            <Text style={styles.toolIcon}>⚙️</Text>
            <View style={styles.toolContent}>
              <Text style={styles.toolTitle}>Automations</Text>
              <Text style={styles.toolDescription}>
                Set up passive revenue automations
              </Text>
            </View>
          </View>
          <View style={styles.toolStats}>
            <Text style={styles.toolStat}>
              {metrics?.automationMetrics.activeAutomations || 0} active
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolCard}
          onPress={() => router.push('/creator/scalability/discounts')}
        >
          <View style={styles.toolHeader}>
            <Text style={styles.toolIcon}>🏷️</Text>
            <View style={styles.toolContent}>
              <Text style={styles.toolTitle}>Discounts</Text>
              <Text style={styles.toolDescription}>
                Create ethical, fair-use discounts
              </Text>
            </View>
          </View>
          <View style={styles.toolStats}>
            <Text style={styles.toolStat}>
              {metrics?.discountMetrics.activeDiscounts || 0} active
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolCard}
          onPress={() => router.push('/creator/scalability/analytics')}
        >
          <View style={styles.toolHeader}>
            <Text style={styles.toolIcon}>📈</Text>
            <View style={styles.toolContent}>
              <Text style={styles.toolTitle}>Analytics</Text>
              <Text style={styles.toolDescription}>
                Track performance and optimize strategy
              </Text>
            </View>
          </View>
          <View style={styles.toolStats}>
            <Text style={styles.toolStat}>Detailed insights</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Safety Notice */}
      <View style={styles.safetyNotice}>
        <Text style={styles.safetyIcon}>🛡️</Text>
        <View style={styles.safetyContent}>
          <Text style={styles.safetyTitle}>Ethical Growth Only</Text>
          <Text style={styles.safetyText}>
            All scalability tools are validated to prevent seductive funnels,
            emotional manipulation, and attention-based pricing. Growth = professional,
            not parasocial.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  statCard: {
    width: '50%',
    padding: 8,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  toolCard: {
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  toolIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  toolContent: {
    flex: 1,
  },
  toolTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  toolDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  toolStats: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  toolStat: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  safetyNotice: {
    margin: 16,
    backgroundColor: '#E7F5FF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#B3D9FF',
  },
  safetyIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  safetyContent: {
    flex: 1,
  },
  safetyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0066CC',
    marginBottom: 4,
  },
  safetyText: {
    fontSize: 14,
    color: '#004C99',
    lineHeight: 20,
  },
});
