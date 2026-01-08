/**
 * PACK 419 — Appeal Prompt Component
 * 
 * Modal/form for users to submit appeals for enforcement decisions
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { EnforcementDecision } from '../../../shared/types/pack419-enforcement.types';

export interface AppealPromptProps {
  enforcement: EnforcementDecision;
  onSubmit: (message: string) => Promise<void>;
  onCancel: () => void;
}

export function AppealPrompt({ enforcement, onSubmit, onCancel }: AppealPromptProps) {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (message.trim().length < 10) {
      Alert.alert('Appeal Message Too Short', 'Please provide at least 10 characters explaining why this restriction should be reviewed.');
      return;
    }

    if (message.trim().length > 2000) {
      Alert.alert('Appeal Message Too Long', 'Please keep your appeal under 2000 characters.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(message.trim());
      Alert.alert('Appeal Submitted', 'Your appeal has been submitted and will be reviewed by our team.');
    } catch (error: any) {
      Alert.alert('Submission Failed', error.message || 'Failed to submit appeal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getReasonDescription = (): string => {
    const descriptions: Record<string, string> = {
      HARASSMENT: 'Harassment or bullying behavior',
      SPAM: 'Spam or excessive unwanted contact',
      SCAM: 'Fraudulent or scam activity',
      FAKE_ID: 'Identity verification violation',
      HATE_SPEECH: 'Hate speech or discrimination',
      NSFW_VIOLATION: 'Adult content policy violation',
      TOS_VIOLATION: 'Terms of service violation',
      SUSPICIOUS_ACTIVITY: 'Suspicious behavior detected',
      PAYMENT_FRAUD: 'Payment or transaction fraud',
      ACCOUNT_ABUSE: 'Multiple accounts or ban evasion',
      IMPERSONATION: 'Impersonating another user',
      CHARGEBACK_ABUSE: 'Excessive payment chargebacks',
    };
    return descriptions[enforcement.reasonCode] || 'Policy violation';
  };

  const getScopeDescription = (): string => {
    const scopeNames = enforcement.scopes.map(scope => {
      return scope.toLowerCase().replace('_', ' ');
    }).join(', ');
    return scopeNames;
  };

  const characterCount = message.length;
  const isValid = characterCount >= 10 && characterCount <= 2000;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Submit Appeal</Text>
          <Text style={styles.subtitle}>
            Help us understand why this restriction should be reviewed
          </Text>
        </View>

        <View style={styles.enforcementInfo}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Reason:</Text>
            <Text style={styles.infoValue}>{getReasonDescription()}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Affected features:</Text>
            <Text style={styles.infoValue}>{getScopeDescription()}</Text>
          </View>
          {enforcement.expiresAt && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Expires:</Text>
              <Text style={styles.infoValue}>
                {new Date(enforcement.expiresAt).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Your explanation *</Text>
          <Text style={styles.inputHint}>
            Please explain why you believe this restriction was issued in error or why it should be reconsidered.
          </Text>
          
          <TextInput
            style={styles.textInput}
            value={message}
            onChangeText={setMessage}
            placeholder="Explain your situation..."
            multiline
            numberOfLines={8}
            maxLength={2000}
            textAlignVertical="top"
            editable={!isSubmitting}
          />
          
          <View style={styles.characterCount}>
            <Text style={[
              styles.characterCountText,
              !isValid && styles.characterCountInvalid
            ]}>
              {characterCount} / 2000 characters
              {characterCount < 10 && ' (minimum 10)'}
            </Text>
          </View>
        </View>

        <View style={styles.guidelines}>
          <Text style={styles.guidelinesTitle}>Appeal Guidelines:</Text>
          <Text style={styles.guidelinesText}>
            • Be respectful and provide factual information{'\n'}
            • Include relevant context or evidence{'\n'}
            • Appeals are typically reviewed within 24-48 hours{'\n'}
            • Abusive appeals may result in further restrictions
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            disabled={isSubmitting}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.submitButton,
              (!isValid || isSubmitting) && styles.submitButtonDisabled
            ]}
            onPress={handleSubmit}
            disabled={!isValid || isSubmitting}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Submitting...' : 'Submit Appeal'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6C757D',
    lineHeight: 22,
  },
  enforcementInfo: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#DC3545',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
    width: 120,
  },
  infoValue: {
    fontSize: 14,
    color: '#212529',
    flex: 1,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 12,
    lineHeight: 20,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#CED4DA',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#212529',
    minHeight: 160,
    backgroundColor: '#FFFFFF',
  },
  characterCount: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
  characterCountText: {
    fontSize: 13,
    color: '#6C757D',
  },
  characterCountInvalid: {
    color: '#DC3545',
  },
  guidelines: {
    backgroundColor: '#E7F3FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#007BFF',
  },
  guidelinesTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#004085',
    marginBottom: 8,
  },
  guidelinesText: {
    fontSize: 14,
    color: '#004085',
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CED4DA',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#007BFF',
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#ADB5BD',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
