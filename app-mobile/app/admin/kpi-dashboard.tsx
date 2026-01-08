/**
 * PACK 324A — Admin KPI Dashboard
 * 
 * Read-only admin dashboard for platform health monitoring
 * Displays platform metrics, revenue, user activity, and safety KPIs
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

interface PlatformKpiData {
  date: string;
  users: {
    new: number;
    verified: number;
    active: number;
    paying: number;
  };
  revenue: {
    tokensSpent: number;
    revenuePLN: number;
  };
  activity: {
    chats: number;
    voiceMinutes: number;
    videoMinutes: number;
    calendarBookings: number;
    eventTickets: number;
  };
  lastUpdated: Date;
}

interface SafetyKpiData {
  date: string;
  reports: {
    total: number;
    aiDetected: number;
    userReported: number;
  };
  enforcement: {
    bans: number;
    autoBlocks: number;
    panicEvents: number;
  };
  lastUpdated: Date;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function KpiDashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [platformKpi, setPlatformKpi] = useState<PlatformKpiData | null>(null);
  const [safetyKpi, setSafetyKpi] = useState<SafetyKpiData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Set default date to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = formatDate(yesterday);
    setSelectedDate(dateStr);
    loadKpiData(dateStr);
  }, []);

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const loadKpiData = async (date: string) => {
    try {
      setError(null);
      const functions = getFunctions();

      // Load platform KPI
      const getPlatformKpi = httpsCallable(functions, 'kpi_getPlatformDaily');
      const platformResult = await getPlatformKpi({ date });
      setPlatformKpi(platformResult.data as PlatformKpiData);

      // Load safety KPI
      const getSafetyKpi = httpsCallable(functions, 'kpi_getSafetyDaily');
      const safetyResult = await getSafetyKpi({ date });
      setSafetyKpi(safetyResult.data as SafetyKpiData);

      setLoading(false);
      setRefreshing(false);
    } catch (err: any) {
      console.error('Error loading KPI data:', err);
      setError(err.message || 'Failed to load KPI data');
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadKpiData(selectedDate);
  };

  const handlePreviousDay = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 1);
    const newDate = formatDate(date);
    setSelectedDate(newDate);
    setLoading(true);
    loadKpiData(newDate);
  };

  const handleNextDay = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + 1);
    const today = new Date();
    if (date > today) {
      Alert.alert('Invalid Date', 'Cannot view future KPIs');
      return;
    }
    const newDate = formatDate(date);
    setSelectedDate(newDate);
    setLoading(true);
    loadKpiData(newDate);
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C5CE7" />
        <Text style={styles.loadingText}>Loading KPI data...</Text>
      </View>
    );
  }

  if (error && !platformKpi) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>⚠️ {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Platform KPI Dashboard</Text>
        <Text style={styles.subtitle}>Admin-Only • Read-Only</Text>
      </View>

      {/* Date Selector */}
      <View style={styles.dateSelector}>
        <TouchableOpacity style={styles.dateButton} onPress={handlePreviousDay}>
          <Text style={styles.dateButtonText}>← Previous</Text>
        </TouchableOpacity>
        <Text style={styles.dateText}>{selectedDate}</Text>
        <TouchableOpacity style={styles.dateButton} onPress={handleNextDay}>
          <Text style={styles.dateButtonText}>Next →</Text>
        </TouchableOpacity>
      </View>

      {/* Platform Metrics */}
      {platformKpi && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>👥 User Metrics</Text>
            <View style={styles.metricsGrid}>
              <MetricCard label="New Users" value={platformKpi.users.new} />
              <MetricCard label="Verified" value={platformKpi.users.verified} />
              <MetricCard label="Active" value={platformKpi.users.active} />
              <MetricCard label="Paying" value={platformKpi.users.paying} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💰 Revenue</Text>
            <View style={styles.metricsGrid}>
              <MetricCard 
                label="Tokens Spent" 
                value={platformKpi.revenue.tokensSpent.toLocaleString()} 
              />
              <MetricCard 
                label="Revenue PLN" 
                value={`${platformKpi.revenue.revenuePLN.toFixed(2)} PLN`}
                highlighted 
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Activity</Text>
            <View style={styles.metricsGrid}>
              <MetricCard label="Chats" value={platformKpi.activity.chats} />
              <MetricCard label="Voice Minutes" value={platformKpi.activity.voiceMinutes} />
              <MetricCard label="Video Minutes" value={platformKpi.activity.videoMinutes} />
              <MetricCard label="Calendar Bookings" value={platformKpi.activity.calendarBookings} />
              <MetricCard label="Event Tickets" value={platformKpi.activity.eventTickets} />
            </View>
          </View>
        </>
      )}

      {/* Safety Metrics */}
      {safetyKpi && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🛡️ Safety & Moderation</Text>
            <View style={styles.metricsGrid}>
              <MetricCard label="Total Reports" value={safetyKpi.reports.total} />
              <MetricCard label="AI Detected" value={safetyKpi.reports.aiDetected} />
              <MetricCard label="User Reported" value={safetyKpi.reports.userReported} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⚖️ Enforcement</Text>
            <View style={styles.metricsGrid}>
              <MetricCard label="Bans Issued" value={safetyKpi.enforcement.bans} alert />
              <MetricCard label="Auto Blocks" value={safetyKpi.enforcement.autoBlocks} />
              <MetricCard label="Panic Events" value={safetyKpi.enforcement.panicEvents} alert />
            </View>
          </View>
        </>
      )}

      {/* Future Navigation Placeholder */}
      <View style={styles.navSection}>
        <View style={styles.navPlaceholder}>
          <Text style={styles.navPlaceholderText}>
            ℹ️ Creator KPI and Trends views available in future updates
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          ✅ Read-Only Dashboard • Zero Business Logic Impact
        </Text>
        <Text style={styles.footerText}>
          Last Updated: {platformKpi?.lastUpdated ? new Date(platformKpi.lastUpdated).toLocaleString() : 'N/A'}
        </Text>
      </View>
    </ScrollView>
  );
}

// ============================================================================
// METRIC CARD COMPONENT
// ============================================================================

interface MetricCardProps {
  label: string;
  value: number | string;
  highlighted?: boolean;
  alert?: boolean;
}

function MetricCard({ label, value, highlighted, alert }: MetricCardProps) {
  return (
    <View style={[
      styles.metricCard,
      highlighted && styles.metricCardHighlighted,
      alert && styles.metricCardAlert,
    ]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[
        styles.metricValue,
        highlighted && styles.metricValueHighlighted,
        alert && styles.metricValueAlert,
      ]}>
        {value}
      </Text>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#E74C3C',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#6C5CE7',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFF',
    marginTop: 8,
  },
  dateButton: {
    padding: 8,
  },
  dateButtonText: {
    fontSize: 14,
    color: '#6C5CE7',
    fontWeight: '600',
  },
  dateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  section: {
    backgroundColor: '#FFF',
    padding: 16,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E1E8ED',
  },
  metricCardHighlighted: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  metricCardAlert: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  metricValueHighlighted: {
    color: '#2E7D32',
  },
  metricValueAlert: {
    color: '#C62828',
  },
  navSection: {
    padding: 16,
    marginTop: 12,
    gap: 12,
  },
  navPlaceholder: {
    backgroundColor: '#F0F0F0',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  navPlaceholderText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    marginTop: 12,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginVertical: 4,
  },
});
