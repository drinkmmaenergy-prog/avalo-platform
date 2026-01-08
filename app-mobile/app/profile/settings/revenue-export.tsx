/**
 * PACK 105 — Revenue Export Screen
 * 
 * Minimal UI for creators to download their annual revenue statements
 * 
 * Features:
 * - Select year or custom date range
 * - Download as CSV or PDF
 * - View summary before download
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from "@/lib/firebase";

interface RevenueExport {
  userId: string;
  year: number;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalEarningsTokens: number;
    totalEarningsPLN: number;
    paidInteractions: number;
    payoutsTotal: number;
    payoutsCount: number;
  };
  breakdown: {
    gifts: number;
    premiumStories: number;
    paidMedia: number;
    paidCalls: number;
    aiCompanion: number;
    other: number;
  };
  vatInfo?: {
    applicable: boolean;
    jurisdiction?: string;
    notes: string;
  };
  fileUrl?: string;
  generatedAt: any;
}

export default function RevenueExportScreen() {
  const user = auth.currentUser;
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [exportData, setExportData] = useState<RevenueExport | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<'json' | 'csv' | 'pdf'>('csv');

  const currentYear = new Date().getFullYear();
  const availableYears = Array.from(
    { length: 5 },
    (_, i) => currentYear - i
  );

  const handleGenerateExport = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const getCreatorRevenueExport = httpsCallable<
        { year: number; format: string },
        RevenueExport
      >(functions, 'getCreatorRevenueExport');

      const result = await getCreatorRevenueExport({
        year: selectedYear,
        format: selectedFormat,
      });

      setExportData(result.data);

      Alert.alert(
        'Export Generated',
        'Your revenue export has been generated successfully.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('[RevenueExport] Error:', error);
      Alert.alert(
        'Export Failed',
        error.message || 'Failed to generate revenue export. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFile = async () => {
    if (!exportData?.fileUrl) return;

    try {
      const supported = await Linking.canOpenURL(exportData.fileUrl);
      if (supported) {
        await Linking.openURL(exportData.fileUrl);
      } else {
        Alert.alert('Error', 'Unable to open download link');
      }
    } catch (error) {
      console.error('[RevenueExport] Download error:', error);
      Alert.alert('Error', 'Failed to download file');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Revenue Export</Text>
        <Text style={styles.subtitle}>
          Download your annual revenue statement for tax purposes
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Year</Text>
        <View style={styles.yearSelector}>
          {availableYears.map((year) => (
            <TouchableOpacity
              key={year}
              style={[
                styles.yearButton,
                selectedYear === year && styles.yearButtonActive,
              ]}
              onPress={() => setSelectedYear(year)}
            >
              <Text
                style={[
                  styles.yearButtonText,
                  selectedYear === year && styles.yearButtonTextActive,
                ]}
              >
                {year}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Export Format</Text>
        <View style={styles.formatSelector}>
          {(['csv', 'pdf', 'json'] as const).map((format) => (
            <TouchableOpacity
              key={format}
              style={[
                styles.formatButton,
                selectedFormat === format && styles.formatButtonActive,
              ]}
              onPress={() => setSelectedFormat(format)}
            >
              <Text
                style={[
                  styles.formatButtonText,
                  selectedFormat === format && styles.formatButtonTextActive,
                ]}
              >
                {format.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.generateButton, loading && styles.generateButtonDisabled]}
        onPress={handleGenerateExport}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.generateButtonText}>Generate Export</Text>
        )}
      </TouchableOpacity>

      {exportData && (
        <View style={styles.summarySection}>
          <Text style={styles.summaryTitle}>Export Summary</Text>
          
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Period:</Text>
              <Text style={styles.summaryValue}>
                {exportData.period.startDate} to {exportData.period.endDate}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Earnings:</Text>
              <Text style={styles.summaryValue}>
                {exportData.summary.totalEarningsTokens} tokens ({exportData.summary.totalEarningsPLN.toFixed(2)} PLN)
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Paid Interactions:</Text>
              <Text style={styles.summaryValue}>
                {exportData.summary.paidInteractions}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Payouts:</Text>
              <Text style={styles.summaryValue}>
                {exportData.summary.payoutsTotal.toFixed(2)} PLN ({exportData.summary.payoutsCount} payouts)
              </Text>
            </View>
          </View>

          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownTitle}>Earnings Breakdown</Text>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Gifts:</Text>
              <Text style={styles.breakdownValue}>{exportData.breakdown.gifts} tokens</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Premium Stories:</Text>
              <Text style={styles.breakdownValue}>{exportData.breakdown.premiumStories} tokens</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Paid Media:</Text>
              <Text style={styles.breakdownValue}>{exportData.breakdown.paidMedia} tokens</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Paid Calls:</Text>
              <Text style={styles.breakdownValue}>{exportData.breakdown.paidCalls} tokens</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>AI Companion:</Text>
              <Text style={styles.breakdownValue}>{exportData.breakdown.aiCompanion} tokens</Text>
            </View>
          </View>

          {exportData.vatInfo && (
            <View style={styles.vatCard}>
              <Text style={styles.vatTitle}>VAT Information</Text>
              <Text style={styles.vatText}>
                Applicable: {exportData.vatInfo.applicable ? 'Yes' : 'No'}
              </Text>
              {exportData.vatInfo.jurisdiction && (
                <Text style={styles.vatText}>
                  Jurisdiction: {exportData.vatInfo.jurisdiction}
                </Text>
              )}
              <Text style={styles.vatNotes}>{exportData.vatInfo.notes}</Text>
            </View>
          )}

          {exportData.fileUrl && (
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={handleDownloadFile}
            >
              <Text style={styles.downloadButtonText}>Download File</Text>
            </TouchableOpacity>
          )}

          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>
              ⚠️ Disclaimer: This is a factual statement of revenue earned through the Avalo platform.
              It is NOT tax advice. Consult a qualified tax advisor for your specific situation.
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  yearSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  yearButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  yearButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  yearButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  yearButtonTextActive: {
    color: '#fff',
  },
  formatSelector: {
    flexDirection: 'row',
    gap: 10,
  },
  formatButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  formatButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  formatButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  formatButtonTextActive: {
    color: '#fff',
  },
  generateButton: {
    margin: 20,
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  generateButtonDisabled: {
    opacity: 0.5,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  summarySection: {
    padding: 20,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  breakdownCard: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#666',
  },
  breakdownValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  vatCard: {
    backgroundColor: '#fff3cd',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  vatTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  vatText: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 4,
  },
  vatNotes: {
    fontSize: 12,
    color: '#856404',
    marginTop: 8,
    fontStyle: 'italic',
  },
  downloadButton: {
    backgroundColor: '#28a745',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    backgroundColor: '#fff3cd',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  disclaimerText: {
    fontSize: 12,
    color: '#856404',
    lineHeight: 18,
  },
});
