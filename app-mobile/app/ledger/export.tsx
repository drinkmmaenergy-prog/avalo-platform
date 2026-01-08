/**
 * PACK 148 - Export Ledger Data Screen
 * Export transaction history, payout reports, tax summaries
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

export default function ExportLedgerScreen() {
  const [loading, setLoading] = useState(false);
  const [exportId, setExportId] = useState<string | null>(null);

  const handleExport = async (exportType: string, format: string) => {
    try {
      setLoading(true);
      const exportLedger = httpsCallable(functions, 'exportLedgerHistoryEndpoint');
      const result = await exportLedger({
        exportType,
        format,
        dateRange: {
          startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          endDate: new Date(),
        },
      });
      
      const data = result.data as any;
      if (data.success) {
        setExportId(data.exportId);
        alert('Export started! Check your exports list.');
      }
    } catch (error: any) {
      alert('Export failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Export Ledger Data</Text>
        <Text style={styles.subtitle}>
          Download transaction history, payout reports, and tax summaries
        </Text>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Transaction History</Text>
          <Text style={styles.sectionDescription}>
            Complete record of all token transactions
          </Text>
          
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.exportButton}
              onPress={() => handleExport('transaction_history', 'csv')}
              disabled={loading}
            >
              <Text style={styles.exportButtonText}>Export as CSV</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.exportButton}
              onPress={() => handleExport('transaction_history', 'json')}
              disabled={loading}
            >
              <Text style={styles.exportButtonText}>Export as JSON</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.exportButton}
              onPress={() => handleExport('transaction_history', 'pdf')}
              disabled={loading}
            >
              <Text style={styles.exportButtonText}>Export as PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 Payout Report</Text>
          <Text style={styles.sectionDescription}>
            Earnings breakdown and payout summary
          </Text>
          
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => handleExport('payout_report', 'json')}
            disabled={loading}
          >
            <Text style={styles.exportButtonText}>Generate Payout Report</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📄 Tax Summary</Text>
          <Text style={styles.sectionDescription}>
            Annual tax report for your region
          </Text>
          
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => handleExport('tax_summary', 'json')}
            disabled={loading}
          >
            <Text style={styles.exportButtonText}>Generate Tax Summary</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Creating export...</Text>
          </View>
        )}

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            🔒 Exports are secure and expire after 24 hours
          </Text>
          <Text style={styles.noticeSubtext}>
            Maximum 3 downloads per export
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  content: {
    padding: 16,
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  buttonGroup: {
    gap: 8,
  },
  exportButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  notice: {
    backgroundColor: '#FEF3C7',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  noticeText: {
    fontSize: 14,
    color: '#92400E',
    marginBottom: 4,
  },
  noticeSubtext: {
    fontSize: 12,
    color: '#92400E',
  },
});
