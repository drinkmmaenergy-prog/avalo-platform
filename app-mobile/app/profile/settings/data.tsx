/**
 * PACK 171 - Data Rights & Export Panel
 * GDPR-compliant data export, correction, and deletion
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

interface DataRequest {
  id: string;
  type: 'export' | 'deletion' | 'correction' | 'takedown' | 'legal_evidence';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
}

export default function DataRightsScreen() {
  const router = useRouter();
  const [activeRequests, setActiveRequests] = useState<DataRequest[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [exportFormat, setExportFormat] = useState<'json' | 'csv' | 'pdf'>('json');
  const [includeMediaFiles, setIncludeMediaFiles] = useState(false);
  const [includeMessages, setIncludeMessages] = useState(true);
  const [includePurchases, setIncludePurchases] = useState(true);
  const [includeAnalytics, setIncludeAnalytics] = useState(false);
  
  const [deletionConfirmation, setDeletionConfirmation] = useState('');
  const [deleteImmediately, setDeleteImmediately] = useState(false);

  useEffect(() => {
    loadDataRequests();
  }, []);

  const loadDataRequests = async () => {
    try {
      setActiveRequests([]);
    } catch (error) {
      console.error('Failed to load data requests:', error);
    }
  };

  const requestDataExport = async () => {
    Alert.alert(
      'Export Your Data',
      `This will create a ${exportFormat.toUpperCase()} file containing your personal data. You'll be notified when it's ready for download.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: async () => {
            try {
              setLoading(true);
              const exportUserData = httpsCallable(functions, 'exportUserData');
              const result = await exportUserData({
                format: exportFormat,
                includeMediaFiles,
                includeMessages,
                includePurchases,
                includeAnalytics,
              });

              const data = result.data as { success: boolean; requestId: string; message: string };
              
              if (data.success) {
                Alert.alert('Success', data.message);
                await loadDataRequests();
              }
            } catch (error) {
              console.error('Failed to request data export:', error);
              Alert.alert('Error', 'Failed to create export request');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const requestAccountDeletion = async () => {
    if (deletionConfirmation !== 'DELETE') {
      Alert.alert('Error', 'Please type "DELETE" to confirm account deletion');
      return;
    }

    const gracePeriod = deleteImmediately ? 0 : 30;
    
    Alert.alert(
      'Delete Account',
      deleteImmediately
        ? '⚠️ WARNING: Your account will be permanently deleted within 7 days. This action CANNOT be undone.\n\nAll your data, messages, purchases, and content will be permanently erased.'
        : `Your account will be scheduled for deletion in ${gracePeriod} days. You can cancel anytime during this grace period by signing in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const requestAccountDeletion = httpsCallable(functions, 'requestAccountDeletion');
              const result = await requestAccountDeletion({
                confirmationCode: deletionConfirmation,
                deleteImmediately,
              });

              const data = result.data as { success: boolean; message: string; gracePeriodDays: number };
              
              if (data.success) {
                Alert.alert('Account Deletion', data.message);
                setDeletionConfirmation('');
                await loadDataRequests();
              }
            } catch (error) {
              console.error('Failed to request account deletion:', error);
              Alert.alert('Error', 'Failed to request account deletion');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Data Rights</Text>
        <Text style={styles.subtitle}>Export, correct, or delete your data</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>📄</Text>
          <Text style={styles.infoText}>
            You have full control over your data. Export, request corrections, or delete your account at any time.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>📦 Export Your Data</Text>
          <Text style={styles.cardDescription}>
            Download a copy of all your personal data in a portable format
          </Text>

          <View style={styles.optionGroup}>
            <Text style={styles.optionGroupTitle}>Format</Text>
            <View style={styles.formatButtons}>
              <TouchableOpacity
                style={[styles.formatButton, exportFormat === 'json' && styles.formatButtonActive]}
                onPress={() => setExportFormat('json')}
              >
                <Text style={[styles.formatButtonText, exportFormat === 'json' && styles.formatButtonTextActive]}>
                  JSON
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formatButton, exportFormat === 'csv' && styles.formatButtonActive]}
                onPress={() => setExportFormat('csv')}
              >
                <Text style={[styles.formatButtonText, exportFormat === 'csv' && styles.formatButtonTextActive]}>
                  CSV
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formatButton, exportFormat === 'pdf' && styles.formatButtonActive]}
                onPress={() => setExportFormat('pdf')}
              >
                <Text style={[styles.formatButtonText, exportFormat === 'pdf' && styles.formatButtonTextActive]}>
                  PDF
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.optionGroup}>
            <Text style={styles.optionGroupTitle}>Include</Text>
            
            <View style={styles.toggleOption}>
              <Text style={styles.toggleLabel}>Messages & Conversations</Text>
              <Switch
                value={includeMessages}
                onValueChange={setIncludeMessages}
                trackColor={{ false: '#E0E0E0', true: '#4ECDC4' }}
              />
            </View>

            <View style={styles.toggleOption}>
              <Text style={styles.toggleLabel}>Purchase History</Text>
              <Switch
                value={includePurchases}
                onValueChange={setIncludePurchases}
                trackColor={{ false: '#E0E0E0', true: '#4ECDC4' }}
              />
            </View>

            <View style={styles.toggleOption}>
              <Text style={styles.toggleLabel}>Analytics Data</Text>
              <Switch
                value={includeAnalytics}
                onValueChange={setIncludeAnalytics}
                trackColor={{ false: '#E0E0E0', true: '#4ECDC4' }}
              />
            </View>

            <View style={styles.toggleOption}>
              <Text style={styles.toggleLabel}>Media Files (larger download)</Text>
              <Switch
                value={includeMediaFiles}
                onValueChange={setIncludeMediaFiles}
                trackColor={{ false: '#E0E0E0', true: '#4ECDC4' }}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={requestDataExport}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>Request Data Export</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>🗑️ Delete Account</Text>
          <Text style={styles.cardDescription}>
            Permanently delete your account and all associated data
          </Text>

          <View style={styles.warningBox}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningText}>
              This action cannot be undone. All your data will be permanently deleted.
            </Text>
          </View>

          <View style={styles.optionGroup}>
            <Text style={styles.optionGroupTitle}>Confirmation</Text>
            <TextInput
              style={styles.input}
              placeholder='Type "DELETE" to confirm'
              value={deletionConfirmation}
              onChangeText={setDeletionConfirmation}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.toggleOption}>
            <View style={styles.toggleLabelContainer}>
              <Text style={styles.toggleLabel}>Delete Immediately</Text>
              <Text style={styles.toggleSubtext}>
                {deleteImmediately ? 'No grace period' : '30-day grace period'}
              </Text>
            </View>
            <Switch
              value={deleteImmediately}
              onValueChange={setDeleteImmediately}
              trackColor={{ false: '#E0E0E0', true: '#FF6B6B' }}
            />
          </View>

          <TouchableOpacity
            style={[styles.dangerButton, loading && styles.dangerButtonDisabled]}
            onPress={requestAccountDeletion}
            disabled={loading || deletionConfirmation !== 'DELETE'}
          >
            <Text style={styles.dangerButtonText}>Delete My Account</Text>
          </TouchableOpacity>
        </View>

        {activeRequests.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📋 Active Requests</Text>
            {activeRequests.map((request) => (
              <View key={request.id} style={styles.requestCard}>
                <View style={styles.requestHeader}>
                  <Text style={styles.requestType}>{request.type}</Text>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{request.status}</Text>
                  </View>
                </View>
                <Text style={styles.requestDate}>
                  Created: {formatDate(request.createdAt)}
                </Text>
                {request.downloadUrl && (
                  <TouchableOpacity style={styles.downloadButton}>
                    <Text style={styles.downloadButtonText}>Download</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={styles.gdprCard}>
          <Text style={styles.gdprTitle}>🇪🇺 Your Data Rights (GDPR)</Text>
          <Text style={styles.gdprText}>• Right to Access: Download your data</Text>
          <Text style={styles.gdprText}>• Right to Rectification: Request corrections</Text>
          <Text style={styles.gdprText}>• Right to Erasure: Delete your account</Text>
          <Text style={styles.gdprText}>• Right to Portability: Export in standard formats</Text>
          <Text style={styles.gdprText}>• Right to Object: Opt out of processing</Text>
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
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  content: {
    padding: 20,
  },
  infoCard: {
    backgroundColor: '#F0FFFE',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#4ECDC4',
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  optionGroup: {
    marginBottom: 20,
  },
  optionGroupTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  formatButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  formatButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  formatButtonActive: {
    backgroundColor: '#F0FFFE',
    borderColor: '#4ECDC4',
  },
  formatButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  formatButtonTextActive: {
    color: '#4ECDC4',
  },
  toggleOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  toggleLabel: {
    fontSize: 14,
    color: '#333',
  },
  toggleLabelContainer: {
    flex: 1,
  },
  toggleSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  warningBox: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  dangerButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  dangerButtonDisabled: {
    opacity: 0.5,
  },
  dangerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  requestCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  requestType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textTransform: 'capitalize',
  },
  statusBadge: {
    backgroundColor: '#E8F8F5',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4ECDC4',
  },
  requestDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  downloadButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  downloadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  gdprCard: {
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  gdprTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  gdprText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 4,
  },
});
