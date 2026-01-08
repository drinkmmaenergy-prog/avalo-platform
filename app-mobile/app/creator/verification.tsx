/**
 * PACK 395 - Creator Verification Screen
 * KYC/KYB submission and status
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
  TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

interface VerificationStatus {
  verified: boolean;
  status: string;
  level: string;
  limits: {
    dailyLimit: number;
    monthlyLimit: number;
    minimumPayout: number;
  };
}

export default function CreatorVerificationScreen() {
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // KYC Level 1 fields
  const [governmentId, setGovernmentId] = useState<any>(null);
  const [idType, setIdType] = useState<'passport' | 'drivers_license' | 'national_id'>('passport');
  const [taxResidency, setTaxResidency] = useState('');
  const [nationality, setNationality] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  useEffect(() => {
    loadVerificationStatus();
  }, []);

  const loadVerificationStatus = async () => {
    try {
      // Call Cloud Function to get status
      // const getVerificationStatus = functions.httpsCallable('getVerificationStatus');
      // const result = await getVerificationStatus();
      // setVerificationStatus(result.data);
      
      // Mock data for now
      setVerificationStatus({
        verified: false,
        status: 'pending',
        level: 'unverified',
        limits: {
          dailyLimit: 0,
          monthlyLimit: 0,
          minimumPayout: 0
        }
      });
    } catch (error) {
      console.error('Error loading verification status:', error);
    } finally {
      setLoading(false);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf']
      });
      
      if (result.canceled === false) {
        setGovernmentId(result);
        Alert.alert('Success', 'Document selected');
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1
      });

      if (!result.canceled) {
        setGovernmentId(result);
        Alert.alert('Success', 'Image selected');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const submitKYCLevel1 = async () => {
    if (!governmentId || !taxResidency || !nationality || !dateOfBirth) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    setSubmitting(true);
    try {
      // Upload document to storage
      // const governmentIdUrl = await uploadDocument(governmentId);
      
      // Submit KYC
      // const submitKYC = functions.httpsCallable('submitKYCLevel1');
      // await submitKYC({
      //   governmentIdUrl,
      //   governmentIdType: idType,
      //   taxResidency,
      //   nationality,
      //   dateOfBirth
      // });
      
      Alert.alert(
        'Success',
        'Your verification has been submitted and is under review. You will be notified once approved.'
      );
      
      loadVerificationStatus();
    } catch (error) {
      console.error('Error submitting KYC:', error);
      Alert.alert('Error', 'Failed to submit verification');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusBadge = () => {
    if (!verificationStatus) return null;

    const { status, level } = verificationStatus;
    let badgeColor = '#999';
    let badgeText = 'Unverified';
    let icon = 'alert-circle-outline';

    switch (status) {
      case 'approved':
        badgeColor = '#34C759';
        badgeText = `Verified - ${level.toUpperCase()}`;
        icon = 'checkmark-circle';
        break;
      case 'pending':
        badgeColor = '#FF9500';
        badgeText = 'Under Review';
        icon = 'time-outline';
        break;
      case 'rejected':
        badgeColor = '#FF3B30';
        badgeText = 'Rejected';
        icon = 'close-circle';
        break;
    }

    return (
      <View style={[styles.statusBadge, { backgroundColor: badgeColor + '20' }]}>
        <Ionicons name={icon as any} size={24} color={badgeColor} />
        <Text style={[styles.statusText, { color: badgeColor }]}>
          {badgeText}
        </Text>
      </View>
    );
  };

  const renderLimits = () => {
    if (!verificationStatus) return null;

    const { limits } = verificationStatus;

    return (
      <View style={styles.limitsCard}>
        <Text style={styles.cardTitle}>Payout Limits</Text>
        <View style={styles.limitRow}>
          <Text style={styles.limitLabel}>Daily Limit:</Text>
          <Text style={styles.limitValue}>{limits.dailyLimit} PLN</Text>
        </View>
        <View style={styles.limitRow}>
          <Text style={styles.limitLabel}>Monthly Limit:</Text>
          <Text style={styles.limitValue}>{limits.monthlyLimit} PLN</Text>
        </View>
        <View style={styles.limitRow}>
          <Text style={styles.limitLabel}>Minimum Payout:</Text>
          <Text style={styles.limitValue}>{limits.minimumPayout} PLN</Text>
        </View>
      </View>
    );
  };

  const renderKYCForm = () => {
    if (verificationStatus?.verified) return null;

    return (
      <View style={styles.formCard}>
        <Text style={styles.cardTitle}>Submit Verification</Text>
        <Text style={styles.cardSubtitle}>
          Complete KYC Level 1 to start receiving payouts
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Government ID Type</Text>
          <View style={styles.segmentControl}>
            <TouchableOpacity
              style={[styles.segment, idType === 'passport' && styles.segmentActive]}
              onPress={() => setIdType('passport')}
            >
              <Text style={[styles.segmentText, idType === 'passport' && styles.segmentTextActive]}>
                Passport
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, idType === 'drivers_license' && styles.segmentActive]}
              onPress={() => setIdType('drivers_license')}
            >
              <Text style={[styles.segmentText, idType === 'drivers_license' && styles.segmentTextActive]}>
                License
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, idType === 'national_id' && styles.segmentActive]}
              onPress={() => setIdType('national_id')}
            >
              <Text style={[styles.segmentText, idType === 'national_id' && styles.segmentTextActive]}>
                National ID
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Upload Government ID *</Text>
          <View style={styles.uploadButtons}>
            <TouchableOpacity style={styles.uploadButton} onPress={pickDocument}>
              <Ionicons name="document-outline" size={24} color="#007AFF" />
              <Text style={styles.uploadButtonText}>Document</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
              <Ionicons name="camera-outline" size={24} color="#007AFF" />
              <Text style={styles.uploadButtonText}>Photo</Text>
            </TouchableOpacity>
          </View>
          {governmentId && (
            <Text style={styles.selectedFile}>✓ File selected</Text>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Tax Residency (Country) *</Text>
          <TextInput
            style={styles.input}
            value={taxResidency}
            onChangeText={setTaxResidency}
            placeholder="e.g., PL, US, GB"
            maxLength={2}
            autoCapitalize="characters"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Nationality *</Text>
          <TextInput
            style={styles.input}
            value={nationality}
            onChangeText={setNationality}
            placeholder="e.g., Polish, American"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Date of Birth *</Text>
          <TextInput
            style={styles.input}
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
        </View>

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={submitKYCLevel1}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#FFF" />
              <Text style={styles.submitButtonText}>Submit Verification</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Your data is encrypted and processed securely in compliance with GDPR and data protection regulations.
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.title}>Creator Verification</Text>
        <Text style={styles.subtitle}>
          Verify your identity to unlock creator payouts
        </Text>
      </View>

      {renderStatusBadge()}
      {renderLimits()}
      {renderKYCForm()}

      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={24} color="#007AFF" />
        <View style={styles.infoContent}>
          <Text style={styles.infoTitle}>Why verify?</Text>
          <Text style={styles.infoText}>
            • Receive payouts from your earnings{'\n'}
            • Comply with global financial regulations{'\n'}
            • Protect your account from fraud{'\n'}
            • Access higher payout limits
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7'
  },
  scrollContent: {
    padding: 16
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F7'
  },
  header: {
    marginBottom: 20
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    color: '#666'
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666'
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12
  },
  limitsCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16
  },
  formCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20
  },
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12
  },
  limitLabel: {
    fontSize: 14,
    color: '#666'
  },
  limitValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000'
  },
  inputGroup: {
    marginBottom: 20
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
    marginBottom: 8
  },
  input: {
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#000'
  },
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
    padding: 2
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6
  },
  segmentActive: {
    backgroundColor: '#007AFF'
  },
  segmentText: {
    fontSize: 14,
    color: '#666'
  },
  segmentTextActive: {
    color: '#FFF',
    fontWeight: '600'
  },
  uploadButtons: {
    flexDirection: 'row',
    gap: 12
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed'
  },
  uploadButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
    marginLeft: 8
  },
  selectedFile: {
    fontSize: 14,
    color: '#34C759',
    marginTop: 8
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    marginTop: 8
  },
  submitButtonDisabled: {
    opacity: 0.5
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 8
  },
  disclaimer: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#007AFF10',
    borderRadius: 12,
    padding: 16,
    marginTop: 8
  },
  infoContent: {
    flex: 1,
    marginLeft: 12
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20
  }
});
