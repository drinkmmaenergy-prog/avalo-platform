/**
 * PACK 151 - Sponsorship Analytics Dashboard
 * SFW aggregate analytics for brands
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getAuth } from 'firebase/auth';
import type { SponsorshipAnalytics } from '../../../lib/sponsorships/types';
import { SponsorshipSDK, formatCurrency } from '../../../lib/sponsorships/sdk';

const { width } = Dimensions.get('window');

export default function SponsorshipAnalyticsScreen() {
  const router = useRouter();
  const { contractId } = useLocalSearchParams();
  const auth = getAuth();
  const user = auth.currentUser;

  const [analytics, setAnalytics] = useState<SponsorshipAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadAnalytics();
    }
  }, [contractId, user]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await SponsorshipSDK.getSponsorshipAnalytics(contractId as string);
      setAnalytics(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  if (!analytics) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Analytics not available</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const topRegions = Object.entries(analytics.demographics.regionBreakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Analytics Dashboard</Text>
        <Text style={styles.headerSubtitle}>SFW aggregate metrics</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance Overview</Text>
        
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.performance.viewCount.toLocaleString()}</Text>
            <Text style={styles.metricLabel}>Total Views</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.performance.clickThrough.toLocaleString()}</Text>
            <Text style={styles.metricLabel}>Click-Through</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.performance.engagement.toLocaleString()}</Text>
            <Text style={styles.metricLabel}>Engagement</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {analytics.performance.viewCount > 0 
                ? ((analytics.performance.clickThrough / analytics.performance.viewCount) * 100).toFixed(1)
                : '0'}%
            </Text>
            <Text style={styles.metricLabel}>CTR</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Revenue Impact</Text>
        
        <View style={styles.revenueCard}>
          <View style={styles.revenueRow}>
            <Text style={styles.revenueLabel}>Sales Attributed</Text>
            <Text style={styles.revenueValue}>{analytics.performance.salesAttributed}</Text>
          </View>
          <View style={styles.revenueRow}>
            <Text style={styles.revenueLabel}>Revenue Generated</Text>
            <Text style={styles.revenueValue}>{formatCurrency(analytics.performance.revenue)}</Text>
          </View>
          <View style={styles.revenueRow}>
            <Text style={styles.revenueLabel}>Retention Impact</Text>
            <Text style={styles.revenueValue}>
              {analytics.demographics.retentionImpact > 0 ? '+' : ''}
              {analytics.demographics.retentionImpact.toFixed(1)}%
            </Text>
          </View>
        </View>
      </View>

      {topRegions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Regions</Text>
          
          {topRegions.map(([region, count], index) => (
            <View key={region} style={styles.regionRow}>
              <View style={styles.regionRank}>
                <Text style={styles.regionRankText}>{index + 1}</Text>
              </View>
              <Text style={styles.regionName}>{region}</Text>
              <Text style={styles.regionCount}>{count.toLocaleString()}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Campaign Period</Text>
        
        <View style={styles.periodCard}>
          <View style={styles.periodRow}>
            <Text style={styles.periodLabel}>Start Date</Text>
            <Text style={styles.periodValue}>
              {new Date(analytics.period.start).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.periodRow}>
            <Text style={styles.periodLabel}>End Date</Text>
            <Text style={styles.periodValue}>
              {new Date(analytics.period.end).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.periodRow}>
            <Text style={styles.periodLabel}>Duration</Text>
            <Text style={styles.periodValue}>
              {Math.ceil(
                (new Date(analytics.period.end).getTime() - 
                 new Date(analytics.period.start).getTime()) / 
                (1000 * 60 * 60 * 24)
              )} days
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.privacyNotice}>
        <Text style={styles.privacyTitle}>🔒 Privacy Protected</Text>
        <Text style={styles.privacyText}>
          Analytics show aggregate, anonymized data only. Individual user information is never shared.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280'
  },
  header: {
    padding: 20,
    backgroundColor: '#8B5CF6',
    paddingTop: 60
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#E9D5FF'
  },
  section: {
    padding: 16,
    paddingTop: 8
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  metricCard: {
    flex: 1,
    minWidth: (width - 52) / 2,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  metricValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#8B5CF6',
    marginBottom: 4
  },
  metricLabel: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center'
  },
  revenueCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  revenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  revenueLabel: {
    fontSize: 16,
    color: '#6B7280'
  },
  revenueValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827'
  },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  regionRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  regionRankText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF'
  },
  regionName: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    fontWeight: '500'
  },
  regionCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280'
  },
  periodCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  periodLabel: {
    fontSize: 14,
    color: '#6B7280'
  },
  periodValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827'
  },
  privacyNotice: {
    margin: 16,
    padding: 16,
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93C5FD'
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8
  },
  privacyText: {
    fontSize: 14,
    color: '#1E3A8A',
    lineHeight: 20
  },
  errorText: {
    fontSize: 18,
    color: '#6B7280',
    marginBottom: 20
  },
  backButton: {
    padding: 12,
    backgroundColor: '#8B5CF6',
    borderRadius: 8
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF'
  }
});