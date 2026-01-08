/**
 * PACK 86 - Report Issue Screen
 * Unified screen for reporting transaction issues
 * 
 * IMPORTANT: Never shows "refund" or "money back" language
 * All copy focuses on safety, moderation, and enforcement
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useReportIssue } from "@/hooks/useReportIssue";
import {
  TransactionIssueRelatedType,
  TransactionIssueReasonCode,
  REASON_CODE_LABELS,
} from "@/types/dispute.types";

interface ReportIssueParams {
  relatedType: TransactionIssueRelatedType;
  relatedId?: string;
  chatId?: string;
  reportedUserId: string;
  reportedUserName?: string;
}

export default function ReportIssueScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { submitReport, submitting, success, error } = useReportIssue();

  const [selectedReason, setSelectedReason] = useState<TransactionIssueReasonCode | null>(
    null
  );
  const [description, setDescription] = useState('');

  const reasons: TransactionIssueReasonCode[] = [
    'SCAM',
    'HARASSMENT',
    'SPAM',
    'INAPPROPRIATE_CONTENT',
    'OTHER',
  ];

  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert('Select a Reason', 'Please select a reason for your report.');
      return;
    }

    if (!params.reportedUserId) {
      Alert.alert('Error', 'Missing required information. Please try again.');
      return;
    }

    try {
      await submitReport({
        relatedType: params.relatedType as TransactionIssueRelatedType,
        relatedId: typeof params.relatedId === 'string' ? params.relatedId : undefined,
        chatId: typeof params.chatId === 'string' ? params.chatId : undefined,
        reportedUserId: params.reportedUserId as string,
        reasonCode: selectedReason,
        description: description.trim() || undefined,
      });

      Alert.alert(
        'Report Submitted',
        'Thank you. Your report has been submitted and will be reviewed by our moderation team.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (err: any) {
      Alert.alert(
        'Submission Failed',
        err.message || 'Failed to submit report. Please try again.'
      );
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Report Issue</Text>
          <Text style={styles.subtitle}>
            {params.reportedUserName
              ? `Reporting: ${params.reportedUserName}`
              : 'Report a problem'}
          </Text>
        </View>

        {/* Important Notice */}
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            ⚠️ Reports are reviewed for safety and moderation purposes. This does not
            initiate a refund or transaction reversal.
          </Text>
        </View>

        {/* Reason Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Reason *</Text>
          {reasons.map((reason) => (
            <TouchableOpacity
              key={reason}
              style={[
                styles.reasonOption,
                selectedReason === reason && styles.reasonOptionSelected,
              ]}
              onPress={() => setSelectedReason(reason)}
              disabled={submitting}
            >
              <View style={styles.radioButton}>
                {selectedReason === reason && <View style={styles.radioButtonInner} />}
              </View>
              <Text
                style={[
                  styles.reasonText,
                  selectedReason === reason && styles.reasonTextSelected,
                ]}
              >
                {REASON_CODE_LABELS[reason]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Description (Optional) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Details (Optional)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Provide any additional context..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
            maxLength={500}
            editable={!submitting}
          />
          <Text style={styles.charCount}>{description.length}/500</Text>
        </View>

        {/* Error Display */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !selectedReason}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Report</Text>
          )}
        </TouchableOpacity>

        {/* Cancel Button */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={submitting}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        {/* Footer Info */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            All reports are confidential and reviewed by our moderation team. We take user
            safety seriously and will take appropriate action based on our community
            guidelines.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  notice: {
    backgroundColor: '#FFF3CD',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFC107',
  },
  noticeText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 12,
  },
  reasonOptionSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  reasonText: {
    fontSize: 16,
    color: '#000',
    flex: 1,
  },
  reasonTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#000',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FF0000',
  },
  errorText: {
    fontSize: 14,
    color: '#CC0000',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  cancelButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
  },
  footer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
    textAlign: 'center',
  },
});
