/**
 * PACK 155: Data Export Request
 * GDPR Article 15, CCPA §1798.110 - Right of Access
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
  Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from "@/lib/firebase";

interface ExportRequest {
  id: string;
  status: string;
  requestedAt: string;
  downloadUrl?: string;
  downloadExpiresAt?: string;
  fileSize?: number;
}

const DATA_CATEGORIES = [
  { id: 'chats_calls', name: 'Chats & Calls', description: 'All your messages and call history' },
  { id: 'public_posts', name: 'Public Posts', description: 'Posts and content you\'ve shared' },
  { id: 'paid_content', name: 'Paid Content', description: 'Purchase history and transactions' },
  { id: 'ai_companion', name: 'AI Companion', description: 'AI conversation history' },
  { id: 'analytics_data', name: 'Analytics', description: 'Usage and interaction data' },
  { id: 'location_data', name: 'Location Data', description: 'Location history' },
  { id: 'device_data', name: 'Device Data', description: 'Device and session information' }
];

export default function DataExportScreen() {
  const user = auth.currentUser;
  const [loading, setLoading] = useState(false);
  const [existingRequest, setExistingRequest] = useState<ExportRequest | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    DATA_CATEGORIES.map(c => c.id)
  );

  useEffect(() => {
    checkExistingRequest();
  }, []);

  const checkExistingRequest = async () => {
    try {
      const getExportRequest = httpsCallable(functions, 'getLatestExportRequest');
      const result = await getExportRequest();
      
      if (result.data) {
        setExistingRequest(result.data as ExportRequest);
      }
    } catch (error) {
      console.error('Error checking export request:', error);
    }
  };

  const toggleCategory = (categoryId: string) => {
    if (selectedCategories.includes(categoryId)) {
      setSelectedCategories(selectedCategories.filter(id => id !== categoryId));
    } else {
      setSelectedCategories([...selectedCategories, categoryId]);
    }
  };

  const requestExport = async () => {
    if (selectedCategories.length === 0) {
      Alert.alert('Error', 'Please select at least one data category to export');
      return;
    }

    try {
      setLoading(true);

      const generateExport = httpsCallable(functions, 'requestDataExport');
      const result = await generateExport({
        categories: selectedCategories
      });

      Alert.alert(
        'Export Requested',
        'Your data export has been requested. You will receive a notification when it\'s ready to download (usually within a few minutes).',
        [
          {
            text: 'OK',
            onPress: () => checkExistingRequest()
          }
        ]
      );
    } catch (error) {
      console.error('Error requesting export:', error);
      Alert.alert('Error', 'Failed to request data export. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadExport = async () => {
    if (!existingRequest?.downloadUrl) return;

    try {
      await Linking.openURL(existingRequest.downloadUrl);

      const markDownloaded = httpsCallable(functions, 'markExportDownloaded');
      await markDownloaded({ exportRequestId: existingRequest.id });

      Alert.alert('Success', 'Your data export has been downloaded');
    } catch (error) {
      console.error('Error downloading export:', error);
      Alert.alert('Error', 'Failed to download export. Please try again.');
    }
  };

  const formatFileSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return '#34C759';
      case 'processing':
        return '#FF9500';
      case 'failed':
        return '#FF3B30';
      default:
        return '#007AFF';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Download Your Data',
          headerLargeTitle: false
        }} 
      />
      
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Ionicons name="download-outline" size={48} color="#007AFF" />
          <Text style={styles.headerTitle}>Export Your Data</Text>
          <Text style={styles.headerDescription}>
            You have the right to receive a copy of all your personal data in a portable format.
          </Text>
        </View>

        {existingRequest && (
          <View style={styles.existingRequestCard}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(existingRequest.status) }]} />
              <Text style={styles.statusText}>
                {existingRequest.status === 'ready' ? 'Ready for Download' :
                 existingRequest.status === 'processing' ? 'Processing...' :
                 existingRequest.status === 'failed' ? 'Failed' :
                 'Pending'}
              </Text>
            </View>

            <Text style={styles.requestDate}>
              Requested: {formatDate(existingRequest.requestedAt)}
            </Text>

            {existingRequest.status === 'ready' && existingRequest.downloadUrl && (
              <>
                {existingRequest.fileSize && (
                  <Text style={styles.fileSize}>
                    File size: {formatFileSize(existingRequest.fileSize)}
                  </Text>
                )}
                
                {existingRequest.downloadExpiresAt && (
                  <Text style={styles.expiryWarning}>
                    ⚠️ Link expires: {formatDate(existingRequest.downloadExpiresAt)}
                  </Text>
                )}

                <TouchableOpacity 
                  style={styles.downloadButton}
                  onPress={downloadExport}
                >
                  <Ionicons name="download" size={20} color="#FFFFFF" />
                  <Text style={styles.downloadButtonText}>Download Export</Text>
                </TouchableOpacity>
              </>
            )}

            {existingRequest.status === 'processing' && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="small" color="#FF9500" />
                <Text style={styles.processingText}>
                  Your export is being prepared. This usually takes a few minutes.
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Data to Export</Text>
          
          {DATA_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={styles.categoryCard}
              onPress={() => toggleCategory(category.id)}
            >
              <View style={styles.categoryContent}>
                <Text style={styles.categoryName}>{category.name}</Text>
                <Text style={styles.categoryDescription}>{category.description}</Text>
              </View>
              <View style={[
                styles.checkbox,
                selectedCategories.includes(category.id) && styles.checkboxChecked
              ]}>
                {selectedCategories.includes(category.id) && (
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.requestButton, loading && styles.requestButtonDisabled]}
          onPress={requestExport}
          disabled={loading || selectedCategories.length === 0}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="document-text-outline" size={20} color="#FFFFFF" />
              <Text style={styles.requestButtonText}>Request New Export</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={24} color="#007AFF" />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>What's in your export?</Text>
            <Text style={styles.infoText}>
              • All personal data from selected categories{'\n'}
              • Data in JSON format (machine-readable){'\n'}
              • Download link valid for 48 hours{'\n'}
              • Secure, encrypted download
            </Text>
          </View>
        </View>

        <View style={styles.legalBox}>
          <Text style={styles.legalText}>
            Under GDPR Article 15 and CCPA §1798.110, you have the right to access your personal information. 
            This export does not include data about other users or commercially sensitive information.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7'
  },
  scrollView: {
    flex: 1
  },
  header: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    marginBottom: 16
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8
  },
  headerDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22
  },
  existingRequestCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600'
  },
  requestDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8
  },
  fileSize: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4
  },
  expiryWarning: {
    fontSize: 14,
    color: '#FF9500',
    marginBottom: 12
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34C759',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8
  },
  downloadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600'
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12
  },
  processingText: {
    flex: 1,
    fontSize: 14,
    color: '#666'
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    marginTop: 8
  },
  categoryContent: {
    flex: 1,
    marginRight: 12
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2
  },
  categoryDescription: {
    fontSize: 14,
    color: '#666'
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#C7C7CC',
    justifyContent: 'center',
    alignItems: 'center'
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF'
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8
  },
  requestButtonDisabled: {
    opacity: 0.5
  },
  requestButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600'
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E8F4FD',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    gap: 12
  },
  infoContent: {
    flex: 1
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#014361',
    marginBottom: 8
  },
  infoText: {
    fontSize: 14,
    color: '#014361',
    lineHeight: 20
  },
  legalBox: {
    backgroundColor: '#F2F2F7',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 12
  },
  legalText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18
  }
});
