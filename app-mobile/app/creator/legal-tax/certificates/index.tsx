/**
 * PACK 195: Earnings Certificates
 * Generate professional proof of income for banks and lenders
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

interface Certificate {
  id: string;
  certificateNumber: string;
  periodStart: any;
  periodEnd: any;
  totalEarnings: number;
  recurringRevenue: number;
  currency: string;
  transactionCount: number;
  generatedAt: any;
  expiresAt: any;
  verified: boolean;
}

export default function EarningsCertificates() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [certificates, setCertificates] = useState<Certificate[]>([]);

  useEffect(() => {
    loadCertificates();
  }, []);

  const loadCertificates = async () => {
    try {
      setLoading(true);
      setCertificates([]);
    } catch (error) {
      console.error('Failed to load certificates:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateCertificate = async () => {
    Alert.alert(
      'Generate Certificate',
      'Select the time period for your earnings certificate:',
      [
        {
          text: 'Last 3 Months',
          onPress: () => handleGenerate(3),
        },
        {
          text: 'Last 6 Months',
          onPress: () => handleGenerate(6),
        },
        {
          text: 'Last 12 Months',
          onPress: () => handleGenerate(12),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleGenerate = async (months: number) => {
    setGenerating(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      const generateCert = httpsCallable(
        functions,
        'generateEarningsCertificateFunction'
      );

      const result = await generateCert({
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
      });

      Alert.alert(
        'Success',
        'Earnings certificate generated successfully!',
        [{ text: 'OK', onPress: loadCertificates }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setGenerating(false);
    }
  };

  const shareCertificate = async (cert: Certificate) => {
    try {
      const message = `
Earnings Certificate
${cert.certificateNumber}

Period: ${new Date(cert.periodStart.seconds * 1000).toLocaleDateString()} - ${new Date(cert.periodEnd.seconds * 1000).toLocaleDateString()}

Total Earnings: $${cert.totalEarnings.toFixed(2)} ${cert.currency}
Monthly Recurring Revenue: $${cert.recurringRevenue.toFixed(2)}
Verified Transactions: ${cert.transactionCount}

This certificate is verified and expires on ${new Date(cert.expiresAt.seconds * 1000).toLocaleDateString()}
      `.trim();

      await Share.share({
        message,
        title: `Earnings Certificate ${cert.certificateNumber}`,
      });
    } catch (error) {
      console.error('Failed to share certificate:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Certificates...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Earnings Certificates</Text>
        <Text style={styles.subtitle}>
          Professional proof of income for financial institutions
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoIcon}>🏆</Text>
        <View style={styles.infoContent}>
          <Text style={styles.infoTitle}>What are Earnings Certificates?</Text>
          <Text style={styles.infoText}>
            Official documents that verify your income from Avalo. Use them for
            bank loans, rental applications, or financial verification.
          </Text>
          <View style={styles.featureList}>
            <Text style={styles.featureItem}>✓ Verified by Avalo</Text>
            <Text style={styles.featureItem}>✓ 90-day validity</Text>
            <Text style={styles.featureItem}>✓ Includes recurring revenue</Text>
            <Text style={styles.featureItem}>✓ Transaction count proof</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.generateButton, generating && styles.buttonDisabled]}
        onPress={generateCertificate}
        disabled={generating}
      >
        {generating ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Text style={styles.generateButtonIcon}>📄</Text>
            <Text style={styles.generateButtonText}>
              Generate New Certificate
            </Text>
          </>
        )}
      </TouchableOpacity>

      <ScrollView style={styles.list}>
        {certificates.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No Certificates Yet</Text>
            <Text style={styles.emptyText}>
              Generate your first earnings certificate to get started
            </Text>
          </View>
        ) : (
          certificates.map((cert) => (
            <View key={cert.id} style={styles.certCard}>
              <View style={styles.certHeader}>
                <View style={styles.certBadge}>
                  <Text style={styles.certBadgeIcon}>✓</Text>
                  <Text style={styles.certBadgeText}>VERIFIED</Text>
                </View>
                <Text style={styles.certNumber}>{cert.certificateNumber}</Text>
              </View>

              <View style={styles.certContent}>
                <View style={styles.certRow}>
                  <Text style={styles.certLabel}>Period:</Text>
                  <Text style={styles.certValue}>
                    {new Date(
                      cert.periodStart.seconds * 1000
                    ).toLocaleDateString()}{' '}
                    -{' '}
                    {new Date(
                      cert.periodEnd.seconds * 1000
                    ).toLocaleDateString()}
                  </Text>
                </View>

                <View style={styles.certRow}>
                  <Text style={styles.certLabel}>Total Earnings:</Text>
                  <Text style={styles.certValueLarge}>
                    ${cert.totalEarnings.toFixed(2)} {cert.currency}
                  </Text>
                </View>

                <View style={styles.certRow}>
                  <Text style={styles.certLabel}>Monthly Recurring:</Text>
                  <Text style={styles.certValue}>
                    ${cert.recurringRevenue.toFixed(2)}
                  </Text>
                </View>

                <View style={styles.certRow}>
                  <Text style={styles.certLabel}>Transactions:</Text>
                  <Text style={styles.certValue}>{cert.transactionCount}</Text>
                </View>

                <View style={styles.certRow}>
                  <Text style={styles.certLabel}>Generated:</Text>
                  <Text style={styles.certValue}>
                    {new Date(
                      cert.generatedAt.seconds * 1000
                    ).toLocaleDateString()}
                  </Text>
                </View>

                <View style={styles.certRow}>
                  <Text style={styles.certLabel}>Expires:</Text>
                  <Text style={styles.certValue}>
                    {new Date(
                      cert.expiresAt.seconds * 1000
                    ).toLocaleDateString()}
                  </Text>
                </View>
              </View>

              <View style={styles.certActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => shareCertificate(cert)}
                >
                  <Text style={styles.actionButtonText}>📤 Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionButtonText}>📥 Download PDF</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.privacyNote}>
        <Text style={styles.privacyIcon}>🔒</Text>
        <Text style={styles.privacyText}>
          Certificates contain only financial data. Personal behavior, chat logs,
          and relationship details are never included.
        </Text>
      </View>
    </View>
  );
}

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
  header: {
    padding: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    padding: 16,
    margin: 16,
    borderRadius: 12,
  },
  infoIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1565C0',
    marginBottom: 12,
  },
  featureList: {
    gap: 4,
  },
  featureItem: {
    fontSize: 12,
    color: '#1976D2',
  },
  generateButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    padding: 16,
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  generateButtonIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  generateButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    flex: 1,
    padding: 16,
    paddingTop: 0,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  certCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  certHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  certBadge: {
    flexDirection: 'row',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
  },
  certBadgeIcon: {
    color: '#FFF',
    fontSize: 14,
    marginRight: 4,
  },
  certBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  certNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  certContent: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingTop: 12,
  },
  certRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  certLabel: {
    fontSize: 14,
    color: '#666',
  },
  certValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  certValueLarge: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  certActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  privacyNote: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    alignItems: 'center',
  },
  privacyIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
  },
});
