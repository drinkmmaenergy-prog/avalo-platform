/**
 * PACK 276 - Mismatch Report Screen
 * 
 * Allows users to report when someone looks significantly different from their photos.
 * Integrates with PACK 268 (Calendar) and PACK 275 (Events) for automatic refunds.
 * 
 * Flow:
 * 1. User reports mismatch (after meeting/event)
 * 2. System flags profile
 * 3. Automatic refund triggered
 * 4. After 3+ reports: shadowban
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { submitMismatchReport } from "@/lib/profile-service";

export default function ReportMismatchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Extract params
  const reportedUserId = params.userId as string;
  const reportedUserName = params.userName as string;
  const meetingId = params.meetingId as string | undefined;
  const eventId = params.eventId as string | undefined;
  const context = params.context as 'calendar' | 'event' | 'general';

  const [reason, setReason] = useState('');
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const predefinedReasons = [
    'Looks significantly different from photos',
    'Much older/younger than photos',
    'Different body type',
    'Photos heavily edited/filtered',
    'Used someone else\'s photos',
    'Other',
  ];

  const toggleReason = (reasonText: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reasonText)
        ? prev.filter((r) => r !== reasonText)
        : [...prev, reasonText]
    );
  };

  const handleSubmit = async () => {
    if (selectedReasons.length === 0 && !reason.trim()) {
      Alert.alert('Missing information', 'Please select at least one reason or provide details.');
      return;
    }

    Alert.alert(
      'Confirm Report',
      'Are you sure you want to report this profile? This action is serious and will be reviewed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            await submitReport();
          },
        },
      ]
    );
  };

  const submitReport = async () => {
    setSubmitting(true);

    try {
      // Get current user ID (from auth context)
      const currentUserId = 'current-user-id'; // TODO: Get from auth context

      const combinedReason = [
        ...selectedReasons,
        reason.trim() ? `Additional details: ${reason}` : '',
      ]
        .filter(Boolean)
        .join('; ');

      const result = await submitMismatchReport({
        reporterId: currentUserId,
        reportedUserId,
        meetingId,
        eventId,
        reason: combinedReason,
      });

      if (result.success) {
        Alert.alert(
          'Report Submitted',
          'Thank you for helping keep Avalo safe. Your report has been submitted and will be reviewed. If this was from a paid meeting or event, a refund will be processed automatically.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to submit report. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Report Profile Mismatch</Text>
      </View>

      <View style={styles.content}>
        {/* Warning card */}
        <View style={styles.warningCard}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>Serious Report</Text>
            <Text style={styles.warningText}>
              This report is for when someone looks significantly different from their photos. False reports may result in account suspension.
            </Text>
          </View>
        </View>

        {/* Context info */}
        {(meetingId || eventId) && (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>
              {meetingId ? '📅 From Calendar Meeting' : '🎉 From Event'}
            </Text>
            <Text style={styles.infoText}>
              {context === 'calendar'
                ? 'A refund will be automatically processed for this meeting.'
                : 'A refund will be processed according to event refund policy.'}
            </Text>
          </View>
        )}

        {/* Reported user */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reporting:</Text>
          <Text style={styles.userName}>{reportedUserName}</Text>
        </View>

        {/* Reason selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What was different?</Text>
          <Text style={styles.sectionSubtitle}>Select all that apply:</Text>
          <View style={styles.reasonsList}>
            {predefinedReasons.map((reasonText) => (
              <TouchableOpacity
                key={reasonText}
                style={[
                  styles.reasonChip,
                  selectedReasons.includes(reasonText) && styles.reasonChipSelected,
                ]}
                onPress={() => toggleReason(reasonText)}
                disabled={submitting}
              >
                <Text
                  style={[
                    styles.reasonChipText,
                    selectedReasons.includes(reasonText) && styles.reasonChipTextSelected,
                  ]}
                >
                  {reasonText}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Additional details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Details (Optional)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Provide any additional information that might help..."
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!submitting}
          />
        </View>

        {/* What happens next */}
        <View style={styles.processCard}>
          <Text style={styles.processTitle}>What happens next?</Text>
          <View style={styles.processStep}>
            <Text style={styles.processNumber}>1</Text>
            <Text style={styles.processText}>Your report is reviewed by our team</Text>
          </View>
          <View style={styles.processStep}>
            <Text style={styles.processNumber}>2</Text>
            <Text style={styles.processText}>
              {meetingId || eventId ? 'Automatic refund is processed' : 'Reported user may be flagged'}
            </Text>
          </View>
          <View style={styles.processStep}>
            <Text style={styles.processNumber}>3</Text>
            <Text style={styles.processText}>After 3+ reports, profile is restricted</Text>
          </View>
        </View>

        {/* Submit button */}
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitButtonText}>
            {submitting ? 'Submitting...' : 'Submit Report'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.privacyNote}>
          Your report is confidential. The reported user will not know who submitted the report.
        </Text>
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
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    padding: 20,
  },
  warningCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
    flexDirection: 'row',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D32F2F',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  infoCard: {
    backgroundColor: '#F0F8FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4ECDC4',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  userName: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  reasonsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonChip: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  reasonChipSelected: {
    backgroundColor: '#FF6B6B',
    borderColor: '#FF6B6B',
  },
  reasonChipText: {
    fontSize: 14,
    color: '#666',
  },
  reasonChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    fontSize: 16,
    minHeight: 120,
  },
  processCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  processTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  processStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  processNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4ECDC4',
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 24,
    marginRight: 12,
  },
  processText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginTop: 2,
  },
  submitButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  privacyNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});
