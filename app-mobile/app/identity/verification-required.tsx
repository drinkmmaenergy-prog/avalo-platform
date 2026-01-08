/**
 * PACK 328A: Identity Verification Required Screen
 * Bank-ID & Document Fallback Verification (18+ Enforcement Layer)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

type VerificationReason = 'SELFIE_FAIL' | 'MISMATCH' | 'FRAUD_FLAG' | 'UNDERAGE_RISK';
type VerificationProvider = 'BANK_ID' | 'DOC_AI' | 'MANUAL';
type DocumentType = 'PASSPORT' | 'NATIONAL_ID' | 'DRIVERS_LICENSE' | 'LIVE_SELFIE';

interface VerificationStatus {
  hasPendingRequest: boolean;
  pendingRequest: {
    id: string;
    reason: VerificationReason;
    provider: VerificationProvider;
    requestedAt: string;
    timeoutAt: string;
  } | null;
  isVerified: boolean;
  ageConfirmed: boolean;
  lastVerificationAt?: string;
}

interface UploadedDocument {
  type: DocumentType;
  uri: string;
  base64?: string;
}

export default function VerificationRequiredScreen() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<DocumentType>('PASSPORT');

  useEffect(() => {
    loadVerificationStatus();
  }, []);

  const loadVerificationStatus = async () => {
    try {
      setLoading(true);
      const getStatus = httpsCallable(functions, 'identityVerification_getStatus');
      const result = await getStatus({});
      setStatus(result.data as VerificationStatus);
    } catch (error: any) {
      console.error('Error loading verification status:', error);
      Alert.alert('Error', 'Failed to load verification status');
    } finally {
      setLoading(false);
    }
  };

  const pickDocument = async (type: DocumentType) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera roll permission is required to upload documents');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setDocuments(prev => [
          ...prev.filter(d => d.type !== type),
          {
            type,
            uri: asset.uri,
            base64: asset.base64,
          },
        ]);
      }
    } catch (error: any) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const takeSelfie = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required to take a selfie');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
        base64: true,
        cameraType: ImagePicker.CameraType.front,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setDocuments(prev => [
          ...prev.filter(d => d.type !== 'LIVE_SELFIE'),
          {
            type: 'LIVE_SELFIE',
            uri: asset.uri,
            base64: asset.base64,
          },
        ]);
      }
    } catch (error: any) {
      console.error('Error taking selfie:', error);
      Alert.alert('Error', 'Failed to take selfie');
    }
  };

  const submitVerification = async () => {
    if (!status?.pendingRequest) {
      Alert.alert('Error', 'No pending verification request');
      return;
    }

    // Validate documents
    const hasDocument = documents.some(d => 
      ['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE'].includes(d.type)
    );
    const hasSelfie = documents.some(d => d.type === 'LIVE_SELFIE');

    if (!hasDocument || !hasSelfie) {
      Alert.alert(
        'Missing Documents',
        'Please upload both an identity document and a live selfie'
      );
      return;
    }

    try {
      setUploading(true);

      const uploadDocuments = httpsCallable(functions, 'identityVerification_uploadDocuments');
      const result = await uploadDocuments({
        requestId: status.pendingRequest.id,
        documents: documents.map(d => ({
          type: d.type,
          data: d.base64,
        })),
      });

      const data = result.data as any;

      Alert.alert(
        data.verified ? 'Verification Successful' : 'Verification Under Review',
        data.verified
          ? 'Your identity has been verified successfully!'
          : 'Your documents have been submitted and are under review. You will be notified once the review is complete.',
        [
          {
            text: 'OK',
            onPress: () => {
              if (data.verified) {
                router.back();
              } else {
                loadVerificationStatus();
              }
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error submitting verification:', error);
      Alert.alert('Error', error.message || 'Failed to submit verification');
    } finally {
      setUploading(false);
    }
  };

  const getReasonText = (reason: VerificationReason): string => {
    switch (reason) {
      case 'SELFIE_FAIL':
        return 'Your profile photo does not match your selfie verification';
      case 'MISMATCH':
        return 'Your profile information has been reported as mismatched';
      case 'FRAUD_FLAG':
        return 'Suspicious activity has been detected on your account';
      case 'UNDERAGE_RISK':
        return 'Age verification is required to continue';
      default:
        return 'Identity verification is required';
    }
  };

  const getProviderText = (provider: VerificationProvider): string => {
    switch (provider) {
      case 'BANK_ID':
        return 'BankID Verification';
      case 'DOC_AI':
        return 'Document Verification';
      case 'MANUAL':
        return 'Manual Review';
      default:
        return 'Identity Verification';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B9D" />
          <Text style={styles.loadingText}>Loading verification status...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (status?.isVerified) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>Verified</Text>
          <Text style={styles.successText}>
            Your identity has been verified successfully
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!status?.hasPendingRequest) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>No Verification Required</Text>
          <Text style={styles.errorText}>
            There is no pending verification request for your account
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { pendingRequest } = status;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerIcon}>🛡️</Text>
          <Text style={styles.title}>Identity Verification Required</Text>
          <Text style={styles.subtitle}>{getReasonText(pendingRequest.reason)}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{getProviderText(pendingRequest.provider)}</Text>
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What you need to provide:</Text>
          <View style={styles.instructionItem}>
            <Text style={styles.instructionIcon}>📄</Text>
            <Text style={styles.instructionText}>
              Valid government-issued ID (passport, national ID, or driver's license)
            </Text>
          </View>
          <View style={styles.instructionItem}>
            <Text style={styles.instructionIcon}>🤳</Text>
            <Text style={styles.instructionText}>
              Live selfie photo taken now (not from camera roll)
            </Text>
          </View>
        </View>

        {/* Document Type Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Document Type:</Text>
          <View style={styles.documentTypeContainer}>
            {(['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE'] as DocumentType[]).map(type => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.documentTypeButton,
                  selectedDocType === type && styles.documentTypeButtonActive,
                ]}
                onPress={() => setSelectedDocType(type)}
              >
                <Text style={[
                  styles.documentTypeText,
                  selectedDocType === type && styles.documentTypeTextActive,
                ]}>
                  {type.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Document Upload */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upload Documents:</Text>
          
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={() => pickDocument(selectedDocType)}
          >
            {documents.find(d => d.type === selectedDocType) ? (
              <View style={styles.uploadedPreview}>
                <Image
                  source={{ uri: documents.find(d => d.type === selectedDocType)?.uri }}
                  style={styles.previewImage}
                />
                <Text style={styles.uploadedText}>✓ Document Uploaded</Text>
              </View>
            ) : (
              <>
                <Text style={styles.uploadIcon}>📤</Text>
                <Text style={styles.uploadText}>Upload {selectedDocType.replace('_', ' ')}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.uploadButton}
            onPress={takeSelfie}
          >
            {documents.find(d => d.type === 'LIVE_SELFIE') ? (
              <View style={styles.uploadedPreview}>
                <Image
                  source={{ uri: documents.find(d => d.type === 'LIVE_SELFIE')?.uri }}
                  style={styles.previewImage}
                />
                <Text style={styles.uploadedText}>✓ Selfie Captured</Text>
              </View>
            ) : (
              <>
                <Text style={styles.uploadIcon}>📸</Text>
                <Text style={styles.uploadText}>Take Live Selfie</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Timeout Warning */}
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            ⏰ You must complete verification by{' '}
            {new Date(pendingRequest.timeoutAt).toLocaleDateString()}
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.primaryButton,
            (uploading || documents.length < 2) && styles.buttonDisabled,
          ]}
          onPress={submitVerification}
          disabled={uploading || documents.length < 2}
        >
          {uploading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>Submit for Verification</Text>
          )}
        </TouchableOpacity>

        {/* Help Text */}
        <Text style={styles.helpText}>
          Your documents will be securely encrypted and reviewed by our verification team.
          This process typically takes 1-2 business days.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFF',
    marginTop: 16,
    fontSize: 16,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  successTitle: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  successText: {
    color: '#AAA',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  errorTitle: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  errorText: {
    color: '#AAA',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  headerIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  title: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: '#FF6B9D',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
  },
  badge: {
    backgroundColor: '#FF6B9D',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  instructionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  instructionText: {
    color: '#CCC',
    fontSize: 15,
    flex: 1,
  },
  documentTypeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  documentTypeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  documentTypeButtonActive: {
    backgroundColor: '#FF6B9D',
    borderColor: '#FF6B9D',
  },
  documentTypeText: {
    color: '#CCC',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  documentTypeTextActive: {
    color: '#FFF',
  },
  uploadButton: {
    backgroundColor: '#1A1A1A',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  uploadIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  uploadText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadedPreview: {
    alignItems: 'center',
  },
  previewImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginBottom: 8,
  },
  uploadedText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  warningBox: {
    backgroundColor: '#FFB74D20',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#FFB74D',
  },
  warningText: {
    color: '#FFB74D',
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: '#FF6B9D',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  secondaryButton: {
    backgroundColor: '#333',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  helpText: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
