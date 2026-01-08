/**
 * Report User Sheet Component
 * 
 * A bottom sheet for reporting users for misconduct.
 * Submits reports to the backend trust system.
 * 
 * PACK 46 — Trust Engine & Blocklist Safety Mesh
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { reportUser, ReportReason } from '../services/trustService';

interface ReportUserSheetProps {
  visible: boolean;
  targetUserId: string;
  targetUserName?: string;
  reporterId: string;
  messageId?: string;
  locale?: 'en' | 'pl';
  onClose: () => void;
  onReported?: () => void;
}

interface ReportOption {
  reason: ReportReason;
  label: string;
  labelPl: string;
}

const REPORT_OPTIONS: ReportOption[] = [
  {
    reason: 'SCAM',
    label: 'Scam or fraud',
    labelPl: 'Oszustwo lub próba wyłudzenia'
  },
  {
    reason: 'HARASSMENT',
    label: 'Harassment or hate',
    labelPl: 'Nękanie lub mowa nienawiści'
  },
  {
    reason: 'SPAM',
    label: 'Spam or unwanted messages',
    labelPl: 'Spam lub niechciane wiadomości'
  },
  {
    reason: 'OTHER',
    label: 'Other',
    labelPl: 'Inny powód'
  }
];

export const ReportUserSheet: React.FC<ReportUserSheetProps> = ({
  visible,
  targetUserId,
  targetUserName,
  reporterId,
  messageId,
  locale = 'en',
  onClose,
  onReported
}) => {
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) return;

    setSubmitting(true);
    try {
      await reportUser({
        reporterId,
        targetId: targetUserId,
        reason: selectedReason,
        messageId
      });

      // Success
      onReported?.();
      onClose();
      
      // Reset state
      setSelectedReason(null);
    } catch (error) {
      console.error('Error reporting user:', error);
      alert(locale === 'pl' ? 'Nie udało się wysłać zgłoszenia' : 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const getLabel = (option: ReportOption) => {
    return locale === 'pl' ? option.labelPl : option.label;
  };

  const title = locale === 'pl' ? 'Zgłoś użytkownika' : 'Report user';
  const submitText = locale === 'pl' ? 'Wyślij zgłoszenie' : 'Submit report';
  const cancelText = locale === 'pl' ? 'Anuluj' : 'Cancel';
  const selectReasonText = locale === 'pl' 
    ? 'Wybierz powód zgłoszenia:' 
    : 'Select a reason for reporting:';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.container}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              {targetUserName && (
                <Text style={styles.subtitle}>{targetUserName}</Text>
              )}
            </View>

            <ScrollView style={styles.content}>
              <Text style={styles.instructionText}>{selectReasonText}</Text>

              {REPORT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.reason}
                  style={[
                    styles.optionButton,
                    selectedReason === option.reason && styles.optionButtonSelected
                  ]}
                  onPress={() => setSelectedReason(option.reason)}
                  disabled={submitting}
                >
                  <View style={styles.optionContent}>
                    <View style={[
                      styles.radio,
                      selectedReason === option.reason && styles.radioSelected
                    ]}>
                      {selectedReason === option.reason && (
                        <View style={styles.radioInner} />
                      )}
                    </View>
                    <Text style={[
                      styles.optionText,
                      selectedReason === option.reason && styles.optionTextSelected
                    ]}>
                      {getLabel(option)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
                disabled={submitting}
              >
                <Text style={styles.cancelButtonText}>{cancelText}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.submitButton,
                  (!selectedReason || submitting) && styles.submitButtonDisabled
                ]}
                onPress={handleSubmit}
                disabled={!selectedReason || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>{submitText}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  content: {
    padding: 20,
  },
  instructionText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
    fontWeight: '500',
  },
  optionButton: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionButtonSelected: {
    backgroundColor: '#F0F7FF',
    borderColor: '#007AFF',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CCC',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#007AFF',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  optionTextSelected: {
    color: '#007AFF',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#F8F8F8',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  submitButton: {
    backgroundColor: '#007AFF',
  },
  submitButtonDisabled: {
    backgroundColor: '#CCC',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default ReportUserSheet;
