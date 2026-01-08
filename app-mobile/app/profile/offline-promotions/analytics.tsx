/**
 * PACK 135: Scan Analytics Dashboard
 * View QR code scan statistics and insights
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getScanSummary, type ScanSummary } from "@/lib/offline-presence";

export default function AnalyticsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<number>(7);

  useEffect(() => {
    loadAnalytics();
  }, [selectedPeriod]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await getScanSummary(selectedPeriod);
      setSummary(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
      Alert.alert('Error', 'Failed to load analytics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C5CE7" />
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load analytics</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadAnalytics}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Scan Analytics</Text>
        <Text style={styles.subtitle}>
          Aggregate, anonymous scan data
        </Text>
      </View>

      <View style={styles.periodSelector}>
        {[7, 14, 30, 90].map((days) => (
          <TouchableOpacity
            key={days}
            style={[
              styles.periodButton,
              selectedPeriod === days && styles.periodButtonActive,
            ]}
            onPress={() => setSelectedPeriod(days)}
          >
            <Text
              style={[
                styles.periodButtonText,
                selectedPeriod === days && styles.periodButtonTextActive,
              ]}
            >
              {days}d
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{summary.totalScans}</Text>
          <Text style={styles.statLabel}>Total Scans</Text>
          <Text style={styles.statSubtext}>All time</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{summary.recent.totalScans}</Text>
          <Text style={styles.statLabel}>Recent Scans</Text>
          <Text style={styles.statSubtext}>Last {selectedPeriod} days</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{summary.recent.averagePerDay}</Text>
          <Text style={styles.statLabel}>Avg per Day</Text>
          <Text style={styles.statSubtext}>Last {selectedPeriod} days</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {summary.topCities.length > 0 ? summary.topCities[0].count : 0}
          </Text>
          <Text style={styles.statLabel}>Top City</Text>
          <Text style={styles.statSubtext}>
            {summary.recent.topCity || 'N/A'}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top Cities</Text>
        {summary.topCities.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No scan data yet</Text>
          </View>
        ) : (
          <View style={styles.citiesList}>
            {summary.topCities.map((city, index) => (
              <View key={index} style={styles.cityItem}>
                <View style={styles.cityRank}>
                  <Text style={styles.cityRankText}>{index + 1}</Text>
                </View>
                <View style={styles.cityInfo}>
                  <Text style={styles.cityName}>{city.city}</Text>
                  <View style={styles.cityBar}>
                    <View
                      style={[
                        styles.cityBarFill,
                        {
                          width: `${(city.count / summary.topCities[0].count) * 100}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
                <Text style={styles.cityCount}>{city.count}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device Breakdown</Text>
        <View style={styles.deviceGrid}>
          <View style={styles.deviceCard}>
            <Text style={styles.deviceIcon}>📱</Text>
            <Text style={styles.deviceValue}>
              {summary.deviceBreakdown.mobile}
            </Text>
            <Text style={styles.deviceLabel}>Mobile</Text>
          </View>

          <View style={styles.deviceCard}>
            <Text style={styles.deviceIcon}>💻</Text>
            <Text style={styles.deviceValue}>
              {summary.deviceBreakdown.desktop}
            </Text>
            <Text style={styles.deviceLabel}>Desktop</Text>
          </View>

          <View style={styles.deviceCard}>
            <Text style={styles.deviceIcon}>📟</Text>
            <Text style={styles.deviceValue}>
              {summary.deviceBreakdown.tablet}
            </Text>
            <Text style={styles.deviceLabel}>Tablet</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>🔒 Privacy First</Text>
          <Text style={styles.infoText}>
            • All scan data is anonymous{'\n'}
            • No individual user tracking{'\n'}
            • Only aggregate statistics shown{'\n'}
            • City-level location only (approximate){'\n'}
            • Scans don't affect feed rankings
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.insightBox}>
          <Text style={styles.insightTitle}>💡 Insights</Text>
          {summary.recent.totalScans === 0 ? (
            <Text style={styles.insightText}>
              No scans yet. Share your QR code to start tracking engagement!
            </Text>
          ) : (
            <>
              {summary.recent.topCity && (
                <Text style={styles.insightText}>
                  • Most scans from {summary.recent.topCity}
                </Text>
              )}
              {summary.recent.topDevice && (
                <Text style={styles.insightText}>
                  • Most common device: {summary.recent.topDevice}
                </Text>
              )}
              {summary.recent.averagePerDay > 1 && (
                <Text style={styles.insightText}>
                  • Averaging {summary.recent.averagePerDay.toFixed(1)} scans per day
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#6C5CE7',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    padding: 20,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#6C5CE7',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
  },
  periodSelector: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#6C5CE7',
    borderColor: '#6C5CE7',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    gap: 12,
  },
  statCard: {
    width: '48%',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#6C5CE7',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  statSubtext: {
    fontSize: 12,
    color: '#666666',
  },
  section: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666666',
  },
  citiesList: {
    gap: 12,
  },
  cityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
  },
  cityRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cityRankText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cityInfo: {
    flex: 1,
  },
  cityName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  cityBar: {
    height: 6,
    backgroundColor: '#E5E5E5',
    borderRadius: 3,
    overflow: 'hidden',
  },
  cityBarFill: {
    height: '100%',
    backgroundColor: '#6C5CE7',
  },
  cityCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginLeft: 12,
  },
  deviceGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  deviceCard: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    alignItems: 'center',
  },
  deviceIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  deviceValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6C5CE7',
    marginBottom: 4,
  },
  deviceLabel: {
    fontSize: 12,
    color: '#666666',
  },
  infoBox: {
    padding: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#90CAF9',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
  },
  insightBox: {
    padding: 16,
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE68C',
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  insightText: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
    marginBottom: 4,
  },
});
