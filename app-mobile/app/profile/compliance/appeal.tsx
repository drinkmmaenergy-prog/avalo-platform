/**
 * PACK 156: Compliance Appeal Submission Screen
 * Submit appeal for compliance actions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { auth } from "@/lib/firebase";

export default function ComplianceAppealScreen() {
  const params = useLocalSearchParams();
  const { caseId, actionId } = params;
  
  const [userId, setUserId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [caseDetails, setCaseDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      setUserId(currentUser.uid);
    }
  }, []);

  useEffect(() => {
    loadCaseDetails();
  }, [userId, caseId]);

  const loadCaseDetails = async () => {
    if (!userId || !caseId) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/compliance/cases/${caseId}`
      );
      const data = await response.json();
      setCaseDetails(data.case);
    } catch (error) {
      console.error('Failed to load case details:', error);
      Alert.alert('Error', 'Failed to load case details');
    } finally {
      setLoading(false);
    }
  };

  const submitAppeal = async () => {
    if (!userId || !caseId || !actionId) return;

    if (!reason.trim()) {
      Alert.alert('Required', 'Please provide a reason for your appeal');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/compliance/appeals/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            caseId,
            actionId,
            reason,
            evidence: evidence.trim() || undefined
          })
        }
      );

      if (response.ok) {
        Alert.alert(
          'Appeal Submitted',
          'Your appeal has been submitted and will be reviewed by our team.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        const error = await response.json();
        Alert.alert('Error', error.message || 'Failed to submit appeal');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to submit appeal');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Submit Appeal' }} />
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Submit Appeal',
          headerBackTitle: 'Back'
        }}
      />

      <ScrollView style={styles.scrollView}>
        <View style={styles.infoSection}>
          <MaterialIcons name="info" size={24} color="#007AFF" />
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>Appeal Process</Text>
            <Text style={styles.infoDescription}>
              Submit your appeal with a detailed explanation. Our team will review it within 7 business days.
            </Text>
          </View>
        </View>

        {caseDetails && (
          <View style={styles.caseCard}>
            <Text style={styles.cardTitle}>Case Details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reason Code:</Text>
              <Text style={styles.detailValue}>{caseDetails.reasonCode}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Severity:</Text>
              <Text style={styles.detailValue}>
                {getSeverityLabel(caseDetails.severity)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Action Taken:</Text>
              <Text style={styles.detailValue}>
                {getActionLabel(caseDetails.actionTaken)}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.formSection}>
          <Text style={styles.label}>Reason for Appeal *</Text>
          <Text style={styles.hint}>
            Explain why you believe this action was incorrect
          </Text>
          <TextInput
            style={styles.textArea}
            value={reason}
            onChangeText={setReason}
            placeholder="Enter your reason..."
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.formSection}>
          <Text style={styles.label}>Supporting Evidence (Optional)</Text>
          <Text style={styles.hint}>
            Provide any additional context or evidence
          </Text>
          <TextInput
            style={styles.textArea}
            value={evidence}
            onChangeText={setEvidence}
            placeholder="Enter supporting evidence..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.warningSection}>
          <MaterialIcons name="warning" size={20} color="#ff9800" />
          <Text style={styles.warningText}>
            Submitting false or misleading information in your appeal may result in additional penalties.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={submitAppeal}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons name="send" size={20} color="#fff" />
              <Text style={styles.submitButtonText}>Submit Appeal</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function getSeverityLabel(severity: number): string {
  switch (severity) {
    case 5:
      return 'Critical';
    case 4:
      return 'Severe';
    case 3:
      return 'Moderate';
    case 2:
      return 'Minor';
    default:
      return 'Notice';
  }
}

function getActionLabel(action: string): string {
  switch (action) {
    case 'account_ban':
      return 'Account Ban';
    case 'feature_freeze':
      return 'Feature Freeze';
    case 'warning':
      return 'Warning';
    case 'education_required':
      return 'Education Required';
    default:
      return action;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  scrollView: {
    flex: 1
  },
  infoSection: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#e3f2fd',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    gap: 12
  },
  infoText: {
    flex: 1
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976d2',
    marginBottom: 4
  },
  infoDescription: {
    fontSize: 14,
    color: '#1565c0',
    lineHeight: 20
  },
  caseCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  detailLabel: {
    fontSize: 14,
    color: '#666'
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333'
  },
  formSection: {
    marginHorizontal: 16,
    marginTop: 24
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4
  },
  hint: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8
  },
  textArea: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
    minHeight: 120
  },
  warningSection: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff3cd',
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 8,
    gap: 12
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#856404',
    lineHeight: 18
  },
  submitButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 32,
    borderRadius: 8,
    gap: 8
  },
  submitButtonDisabled: {
    opacity: 0.6
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  }
});
