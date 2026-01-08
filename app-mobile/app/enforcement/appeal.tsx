/**
 * PACK 103 — Community Governance, Moderation Expansion & Federated Automated Enforcement
 * Appeal Submission Screen
 * 
 * Allows users to submit appeals for enforcement actions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { collection, doc, getDoc, addDoc, serverTimestamp, query, where, getDocs, limit } from 'firebase/firestore';
import { db, auth } from "@/lib/firebase";

interface ModerationCase {
  caseId: string;
  subjectUserId: string;
  status: string;
  reasonCodes: string[];
  resolution?: {
    outcome: string;
    reviewNote: string;
  };
}

export default function AppealScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const caseId = params.caseId as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [moderationCase, setModerationCase] = useState<ModerationCase | null>(null);
  const [explanation, setExplanation] = useState('');

  useEffect(() => {
    if (!caseId) {
      Alert.alert('Error', 'No case ID provided');
      router.back();
      return;
    }
    loadCaseInfo();
  }, [caseId]);

  const loadCaseInfo = async () => {
    try {
      setLoading(true);
      const caseDoc = await getDoc(doc(db, 'moderation_cases', caseId));
      
      if (!caseDoc.exists()) {
        Alert.alert('Error', 'Case not found');
        router.back();
        return;
      }

      const caseData = caseDoc.data() as ModerationCase;
      
      // Verify case belongs to current user
      const userId = auth.currentUser?.uid;
      if (caseData.subjectUserId !== userId) {
        Alert.alert('Error', 'You can only appeal your own cases');
        router.back();
        return;
      }

      // Check if case is resolved (required for appeal)
      if (caseData.status !== 'RESOLVED') {
        Alert.alert('Error', 'You can only appeal resolved cases');
        router.back();
        return;
      }

      setModerationCase(caseData);
    } catch (error) {
      console.error('Error loading case info:', error);
      Alert.alert('Error', 'Failed to load case information');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAppeal = async () => {
    if (!explanation.trim()) {
      Alert.alert('Error', 'Please provide an explanation for your appeal');
      return;
    }

    if (explanation.trim().length < 50) {
      Alert.alert('Error', 'Please provide a more detailed explanation (at least 50 characters)');
      return;
    }

    try {
      setSubmitting(true);
      const userId = auth.currentUser?.uid;
      
      if (!userId) {
        Alert.alert('Error', 'You must be logged in to submit an appeal');
        return;
      }

      // Check for existing pending appeal
      const existingAppealsQuery = query(
        collection(db, 'enforcement_appeals'),
        where('caseId', '==', caseId),
        where('userId', '==', userId),
        where('status', '==', 'PENDING'),
        limit(1)
      );

      const existingAppealsSnapshot = await getDocs(existingAppealsQuery);
      if (!existingAppealsSnapshot.empty) {
        Alert.alert('Error', 'You already have a pending appeal for this case');
        return;
      }

      // Submit appeal
      await addDoc(collection(db, 'enforcement_appeals'), {
        caseId,
        userId,
        explanation: explanation.trim(),
        submittedAt: serverTimestamp(),
        status: 'PENDING',
        updatedAt: serverTimestamp(),
      });

      Alert.alert(
        'Appeal Submitted',
        'Your appeal has been submitted and will be reviewed by our team. You will be notified of the decision.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting appeal:', error);
      Alert.alert('Error', 'Failed to submit appeal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading case information...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Submit Appeal</Text>

        {/* Case Information */}
        {moderationCase && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Case Information</Text>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Case ID:</Text>
              <Text style={styles.infoValue}>{moderationCase.caseId}</Text>
            </View>

            {moderationCase.resolution && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionTitle}>Original Decision</Text>
                <Text style={styles.infoText}>{moderationCase.resolution.reviewNote}</Text>
              </>
            )}
          </View>
        )}

        {/* Appeal Guidelines */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Appeal Guidelines</Text>
          <Text style={styles.guidelineText}>
            • Provide a clear and detailed explanation of why you believe the decision was incorrect
          </Text>
          <Text style={styles.guidelineText}>
            • Include any relevant context or information that wasn't considered
          </Text>
          <Text style={styles.guidelineText}>
            • Be respectful and professional in your explanation
          </Text>
          <Text style={styles.guidelineText}>
            • Appeals are typically reviewed within 3-5 business days
          </Text>
          <Text style={styles.guidelineText}>
            • You can only submit one appeal per case
          </Text>
        </View>

        {/* Appeal Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Explanation</Text>
          <Text style={styles.helperText}>
            Explain why you believe the decision should be reconsidered (minimum 50 characters):
          </Text>
          
          <TextInput
            style={styles.textArea}
            value={explanation}
            onChangeText={setExplanation}
            placeholder="Provide a detailed explanation of your appeal..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={8}
            maxLength={2000}
            textAlignVertical="top"
          />
          
          <Text style={styles.characterCount}>
            {explanation.length} / 2000 characters
            {explanation.length < 50 && ` (${50 - explanation.length} more needed)`}
          </Text>
        </View>

        {/* Important Notice */}
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>⚠️ Important</Text>
          <Text style={styles.noticeText}>
            Submitting false or misleading information in your appeal may result in additional
            restrictions on your account.
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmitAppeal}
          disabled={submitting || explanation.trim().length < 50}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Appeal</Text>
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

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#000',
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 15,
    color: '#000',
    fontWeight: '400',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
  },
  guidelineText: {
    fontSize: 15,
    color: '#666',
    marginBottom: 8,
    lineHeight: 22,
  },
  helperText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  textArea: {
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#000',
    minHeight: 150,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  characterCount: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    textAlign: 'right',
  },
  noticeCard: {
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFE69C',
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  noticeText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
});
