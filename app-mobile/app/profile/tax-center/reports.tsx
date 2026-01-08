/**
 * PACK 330 — Tax Reports & Earnings Statements
 * Mobile UI for viewing and downloading tax reports
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
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Types
interface TaxReportUser {
  userId: string;
  period: string;
  totalEarnedTokens: number;
  totalEarnedPLN: number;
  breakdown: {
    chatTokens: number;
    voiceTokens: number;
    videoTokens: number;
    calendarTokens: number;
    eventTokens: number;
    tipsTokens: number;
    aiCompanionsTokens: number;
    digitalProductsTokens: number;
  };
  numberOfPayouts: number;
  totalPaidOutPLN: number;
  totalPendingPLN: number;
  generatedAt: any;
}

export default function TaxReportsScreen() {
  const router = useRouter();
  const auth = getAuth();
  const functions = getFunctions();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reports, setReports] = useState<TaxReportUser[]>([]);
  const [selectedReport, setSelectedReport] = useState<TaxReportUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setError(null);
      const listReports = httpsCallable(functions, 'taxReports_listReports');
      const response: any = await listReports({ limit: 12 });

      if (response.data.success) {
        setReports(response.data.reports || []);
      } else {
        setError(response.data.error || 'Failed to load reports');
      }
    } catch (err: any) {
      console.error('Error loading reports:', err);
      setError(err.message || 'Failed to load tax reports');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadReports();
  };

  const formatPeriod = (period: string): string => {
    if (period.endsWith('-YEAR')) {
      return period.replace('-YEAR', ' (Yearly)');
    }
    const [year, month] = period.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatTokens = (tokens: number): string => {
    return tokens.toLocaleString('en-US');
  };

  const formatCurrency = (amount: number): string => {
    return `${amount.toFixed(2)} PLN`;
  };

  const handleGenerateReport = async () => {
    try {
      Alert.prompt(
        'Generate Tax Report',
        'Enter period (e.g., 2024-12 or 2024-YEAR):',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Generate',
            onPress: async (period) => {
              if (!period) return;
              
              setLoading(true);
              const generate = httpsCallable(functions, 'taxReports_generateOnDemand');
              const response: any = await generate({
                userId: auth.currentUser?.uid,
                period,
              });

              if (response.data.success) {
                Alert.alert('Success', 'Tax report generated successfully');
                loadReports();
              } else {
                Alert.alert('Error', response.data.error || 'Failed to generate report');
              }
              setLoading(false);
            },
          },
        ],
        'plain-text'
      );
    } catch (err: any) {
      console.error('Error generating report:', err);
      Alert.alert('Error', err.message || 'Failed to generate report');
      setLoading(false);
    }
  };

  const viewReportDetails = (report: TaxReportUser) => {
    setSelectedReport(report);
  };

  const closeDetails = () => {
    setSelectedReport(null);
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading tax reports...</Text>
      </View>
    );
  }

  if (selectedReport) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={closeDetails} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#111827" />
            </TouchableOpacity>
            <Text style={styles.detailTitle}>Tax Report</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>Period</Text>
            <Text style={styles.periodValue}>{formatPeriod(selectedReport.period)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.cardTitle}>Earnings Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Earned:</Text>
              <Text style={styles.summaryValue}>
                {formatTokens(selectedReport.totalEarnedTokens)} tokens
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Value:</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(selectedReport.totalEarnedPLN)}
              </Text>
            </View>
          </View>

          <View style={styles.breakdownCard}>
            <Text style={styles.cardTitle}>Earnings Breakdown</Text>
            {Object.entries(selectedReport.breakdown).map(([key, value]) => {
              if (value === 0) return null;
              const label = key
                .replace('Tokens', '')
                .replace(/([A-Z])/g, ' $1')
                .trim();
              return (
                <View key={key} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{label}:</Text>
                  <Text style={styles.breakdownValue}>{formatTokens(value as number)}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.payoutsCard}>
            <Text style={styles.cardTitle}>Payout Information</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Number of Payouts:</Text>
              <Text style={styles.summaryValue}>{selectedReport.numberOfPayouts}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Paid Out:</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(selectedReport.totalPaidOutPLN)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Pending Payouts:</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(selectedReport.totalPendingPLN)}
              </Text>
            </View>
          </View>

          <View style={styles.disclaimerCard}>
            <Ionicons name="information-circle-outline" size={20} color="#6366F1" />
            <Text style={styles.disclaimerText}>
              Avalo does not provide tax advice. You are responsible for declaring your income according to local law.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6366F1']} />
        }
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tax Reports</Text>
          <TouchableOpacity onPress={handleGenerateReport}>
            <Ionicons name="add-circle-outline" size={24} color="#6366F1" />
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {reports.length === 0 && !error && (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Reports Available</Text>
            <Text style={styles.emptyText}>
              Tax reports are generated automatically at the end of each month
            </Text>
            <TouchableOpacity style={styles.generateButton} onPress={handleGenerateReport}>
              <Text style={styles.generateButtonText}>Generate Report Manually</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.reportsList}>
          {reports.map((report, index) => (
            <TouchableOpacity
              key={index}
              style={styles.reportCard}
              onPress={() => viewReportDetails(report)}
            >
              <View style={styles.reportIcon}>
                <Ionicons
                  name={report.period.endsWith('-YEAR') ? 'calendar' : 'calendar-outline'}
                  size={24}
                  color="#6366F1"
                />
              </View>
              <View style={styles.reportContent}>
                <Text style={styles.reportPeriod}>{formatPeriod(report.period)}</Text>
                <Text style={styles.reportEarnings}>
                  {formatTokens(report.totalEarnedTokens)} tokens • {formatCurrency(report.totalEarnedPLN)}
                </Text>
                <Text style={styles.reportPayouts}>
                  {report.numberOfPayouts} payout{report.numberOfPayouts !== 1 ? 's' : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.disclaimerCard}>
          <Ionicons name="information-circle-outline" size={20} color="#6366F1" />
          <Text style={styles.disclaimerText}>
            Avalo does not provide tax advice. You are responsible for declaring your income according to local law.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#991B1B',
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  generateButton: {
    backgroundColor: '#6366F1',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  reportsList: {
    padding: 16,
    gap: 12,
  },
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  reportIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reportContent: {
    flex: 1,
  },
  reportPeriod: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  reportEarnings: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  reportPayouts: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  periodCard: {
    backgroundColor: '#6366F1',
    padding: 20,
    margin: 16,
    borderRadius: 12,
  },
  periodLabel: {
    fontSize: 14,
    color: '#E0E7FF',
    marginBottom: 4,
  },
  periodValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  breakdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#4B5563',
    textTransform: 'capitalize',
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  payoutsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  disclaimerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    gap: 12,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 13,
    color: '#4338CA',
    lineHeight: 18,
  },
});
