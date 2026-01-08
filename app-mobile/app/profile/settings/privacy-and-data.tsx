/**
 * Privacy & Data Screen
 * PACK 93 - GDPR Data Rights & Account Lifecycle
 * 
 * Provides:
 * - Data export ("Download my data")
 * - Account deletion ("Delete my account")
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from 'firebase/auth';
import { useDataExports } from "@/hooks/useDataExports";
import { useAccountDeletion } from "@/hooks/useAccountDeletion";
import {
  formatFileSize,
  formatTimestamp,
  getStatusColor,
  getStatusText,
  isExportExpired,
} from "@/services/dataRightsService";

export default function PrivacyAndDataScreen() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);
  const {
    exports,
    isLoading: exportsLoading,
    isRefreshing: exportsRefreshing,
    error: exportsError,
    requestExport,
    refreshExports,
    downloadExport,
  } = useDataExports(user?.uid || null);

  const {
    deletionRequest,
    hasPendingDeletion,
    isLoading: deletionLoading,
    error: deletionError,
    requestDeletion,
    refreshStatus,
  } = useAccountDeletion(user?.uid || null);

  const [isRequestingExport, setIsRequestingExport] = useState(false);
  const [showDeletionConfirm, setShowDeletionConfirm] = useState(false);
  const [deletionConfirmText, setDeletionConfirmText] = useState('');
  const [deletionReason, setDeletionReason] = useState('');
  const [isDeletionChecked, setIsDeletionChecked] = useState(false);
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);

  const handleRequestExport = async () => {
    setIsRequestingExport(true);
    try {
      const result = await requestExport();
      
      if (result.success) {
        Alert.alert(
          'Export Requested',
          result.message,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Request Failed',
          result.message || 'Failed to request data export',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'An error occurred');
    } finally {
      setIsRequestingExport(false);
    }
  };

  const handleDownloadExport = (downloadUrl: string, expiresAt?: number) => {
    if (isExportExpired(expiresAt)) {
      Alert.alert(
        'Export Expired',
        'This export link has expired. Please request a new export.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Download Data',
      'This will open your browser to download your data export.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => {
            Linking.openURL(downloadUrl);
          },
        },
      ]
    );
  };

  const handleShowDeletionConfirm = () => {
    Alert.alert(
      'Delete Account',
      'This action is irreversible. Your account and all associated data will be permanently deleted.\n\nFinancial records will be pseudonymized but retained for compliance purposes.\n\nAre you sure you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => setShowDeletionConfirm(true),
        },
      ]
    );
  };

  const handleRequestDeletion = async () => {
    if (!isDeletionChecked) {
      Alert.alert('Confirmation Required', 'Please acknowledge the consequences by checking the box.');
      return;
    }

    if (deletionConfirmText !== 'DELETE') {
      Alert.alert('Confirmation Required', 'Please type DELETE to confirm.');
      return;
    }

    setIsRequestingDeletion(true);
    try {
      const result = await requestDeletion(deletionConfirmText, deletionReason);
      
      if (result.success) {
        Alert.alert(
          'Deletion Requested',
          result.message,
          [
            {
              text: 'OK',
              onPress: () => {
                setShowDeletionConfirm(false);
                setDeletionConfirmText('');
                setDeletionReason('');
                setIsDeletionChecked(false);
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Request Failed',
          result.message || 'Failed to request account deletion',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'An error occurred');
    } finally {
      setIsRequestingDeletion(false);
    }
  };

  const onRefresh = async () => {
    await Promise.all([refreshExports(), refreshStatus()]);
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Please sign in to access this page.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={exportsRefreshing || deletionLoading}
          onRefresh={onRefresh}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Privacy & Data</Text>
        <Text style={styles.headerSubtitle}>
          Manage your data rights and account lifecycle
        </Text>
      </View>

      {/* Data Export Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Download My Data</Text>
        <Text style={styles.sectionDescription}>
          Request a copy of all your personal data. You'll receive a downloadable file with your profile, content, transactions, and more.
        </Text>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            isRequestingExport && styles.buttonDisabled,
          ]}
          onPress={handleRequestExport}
          disabled={isRequestingExport}
        >
          {isRequestingExport ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Request Data Export</Text>
          )}
        </TouchableOpacity>

        {exportsError && (
          <Text style={styles.errorText}>{exportsError}</Text>
        )}

        {/* Export Requests List */}
        {exportsLoading ? (
          <ActivityIndicator style={styles.loader} size="large" color="#007AFF" />
        ) : exports.length > 0 ? (
          <View style={styles.requestsList}>
            <Text style={styles.requestsListTitle}>Your Export Requests</Text>
            {exports.map((exportRequest) => (
              <View key={exportRequest.id} style={styles.requestCard}>
                <View style={styles.requestHeader}>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(exportRequest.status) },
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>
                      {getStatusText(exportRequest.status)}
                    </Text>
                  </View>
                  <Text style={styles.requestDate}>
                    {formatTimestamp(exportRequest.createdAt)}
                  </Text>
                </View>

                {exportRequest.fileSize && (
                  <Text style={styles.requestInfo}>
                    Size: {formatFileSize(exportRequest.fileSize)}
                  </Text>
                )}

                {exportRequest.expiresAt && (
                  <Text style={styles.requestInfo}>
                    Expires: {formatTimestamp(exportRequest.expiresAt)}
                  </Text>
                )}

                {exportRequest.errorMessage && (
                  <Text style={styles.errorTextSmall}>
                    {exportRequest.errorMessage}
                  </Text>
                )}

                {exportRequest.status === 'READY' && exportRequest.downloadUrl && (
                  <TouchableOpacity
                    style={styles.downloadButton}
                    onPress={() =>
                      handleDownloadExport(
                        exportRequest.downloadUrl!,
                        exportRequest.expiresAt
                      )
                    }
                  >
                    <Text style={styles.downloadButtonText}>Download</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noRequestsText}>
            No export requests yet. Create one to download your data.
          </Text>
        )}
      </View>

      {/* Account Deletion Section */}
      <View style={[styles.section, styles.dangerSection]}>
        <Text style={styles.sectionTitle}>Delete My Account</Text>
        <Text style={styles.sectionDescription}>
          Permanently delete your account and all associated data. This action cannot be undone.
        </Text>

        {hasPendingDeletion && deletionRequest ? (
          <View style={styles.deletionStatusCard}>
            <Text style={styles.deletionStatusTitle}>Deletion Request Active</Text>
            <View style={styles.deletionStatusRow}>
              <Text style={styles.deletionStatusLabel}>Status:</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(deletionRequest.status) },
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {getStatusText(deletionRequest.status)}
                </Text>
              </View>
            </View>
            <Text style={styles.deletionStatusInfo}>
              Requested: {formatTimestamp(deletionRequest.createdAt)}
            </Text>
            {deletionRequest.rejectionReason && (
              <Text style={styles.errorTextSmall}>
                Reason: {deletionRequest.rejectionReason}
              </Text>
            )}
          </View>
        ) : showDeletionConfirm ? (
          <View style={styles.deletionConfirmCard}>
            <Text style={styles.warningText}>⚠️ FINAL WARNING</Text>
            <Text style={styles.warningSubtext}>
              This will permanently delete your account, including:
            </Text>
            <View style={styles.warningList}>
              <Text style={styles.warningItem}>• Your profile and all content</Text>
              <Text style={styles.warningItem}>• Your messages and connections</Text>
              <Text style={styles.warningItem}>• Your media and stories</Text>
              <Text style={styles.warningItem}>• Access to all services</Text>
            </View>
            <Text style={styles.warningSubtext}>
              Financial records will be pseudonymized but retained for compliance.
            </Text>

            <View style={styles.checkboxContainer}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => setIsDeletionChecked(!isDeletionChecked)}
              >
                {isDeletionChecked && (
                  <View style={styles.checkboxChecked} />
                )}
              </TouchableOpacity>
              <Text style={styles.checkboxLabel}>
                I understand this action is irreversible
              </Text>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Type DELETE to confirm"
              value={deletionConfirmText}
              onChangeText={setDeletionConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Reason for deletion (optional)"
              value={deletionReason}
              onChangeText={setDeletionReason}
              multiline
              numberOfLines={3}
            />

            <View style={styles.confirmButtonsContainer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowDeletionConfirm(false);
                  setDeletionConfirmText('');
                  setDeletionReason('');
                  setIsDeletionChecked(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.dangerButton,
                  (!isDeletionChecked ||
                    deletionConfirmText !== 'DELETE' ||
                    isRequestingDeletion) &&
                    styles.buttonDisabled,
                ]}
                onPress={handleRequestDeletion}
                disabled={
                  !isDeletionChecked ||
                  deletionConfirmText !== 'DELETE' ||
                  isRequestingDeletion
                }
              >
                {isRequestingDeletion ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.dangerButtonText}>Delete Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleShowDeletionConfirm}
          >
            <Text style={styles.dangerButtonText}>Request Account Deletion</Text>
          </TouchableOpacity>
        )}

        {deletionError && (
          <Text style={styles.errorText}>{deletionError}</Text>
        )}
      </View>

      {/* Info Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Your data rights are protected under GDPR and applicable privacy laws. For questions, contact support@avalo.app
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
  contentContainer: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dangerSection: {
    borderWidth: 2,
    borderColor: '#ffebee',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  loader: {
    marginTop: 16,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    marginTop: 8,
  },
  errorTextSmall: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 4,
  },
  requestsList: {
    marginTop: 16,
  },
  requestsListTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  requestCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  requestDate: {
    fontSize: 12,
    color: '#666',
  },
  requestInfo: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  downloadButton: {
    backgroundColor: '#34C759',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  noRequestsText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 16,
  },
  deletionStatusCard: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  deletionStatusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  deletionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  deletionStatusLabel: {
    fontSize: 14,
    color: '#856404',
    marginRight: 8,
  },
  deletionStatusInfo: {
    fontSize: 12,
    color: '#856404',
    marginTop: 4,
  },
  deletionConfirmCard: {
    backgroundColor: '#ffebee',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  warningText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 8,
    textAlign: 'center',
  },
  warningSubtext: {
    fontSize: 14,
    color: '#c62828',
    marginBottom: 12,
  },
  warningList: {
    marginBottom: 12,
  },
  warningItem: {
    fontSize: 14,
    color: '#c62828',
    marginBottom: 4,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d32f2f',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    width: 14,
    height: 14,
    backgroundColor: '#d32f2f',
    borderRadius: 2,
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#c62828',
    flex: 1,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  confirmButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    marginTop: 16,
    marginBottom: 32,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});
