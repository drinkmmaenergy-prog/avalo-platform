/**
 * PACK 73 — Safety Modals & Contextual Prompts
 * Reusable modals for safety warnings and tips
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';

interface SafetyModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  titleKey: string;
  bodyKey: string;
  confirmTextKey?: string;
  cancelTextKey?: string;
  showCancel?: boolean;
}

/**
 * Generic safety modal component
 */
export function SafetyModal({
  visible,
  onClose,
  onConfirm,
  titleKey,
  bodyKey,
  confirmTextKey = 'common.ok',
  cancelTextKey = 'common.cancel',
  showCancel = false,
}: SafetyModalProps) {
  const { t } = useTranslation();

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    } else {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>{t(titleKey)}</Text>
            <Text style={styles.body}>{t(bodyKey)}</Text>
          </ScrollView>

          <View style={styles.buttonContainer}>
            {showCancel && (
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={onClose}
              >
                <Text style={styles.buttonSecondaryText}>
                  {t(cancelTextKey)}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.button,
                styles.buttonPrimary,
                !showCancel && styles.buttonFull,
              ]}
              onPress={handleConfirm}
            >
              <Text style={styles.buttonPrimaryText}>
                {t(confirmTextKey)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * First meeting safety tip modal
 */
interface FirstMeetingTipProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function FirstMeetingTip({ visible, onClose, onConfirm }: FirstMeetingTipProps) {
  return (
    <SafetyModal
      visible={visible}
      onClose={onClose}
      onConfirm={onConfirm}
      titleKey="safety.meeting.tip.title"
      bodyKey="safety.meeting.tip.body"
      confirmTextKey="safety.meeting.tip.ok"
      cancelTextKey="safety.meeting.tip.cancel"
      showCancel={true}
    />
  );
}

/**
 * Off-platform contact sharing warning
 */
interface OffPlatformWarningProps {
  visible: boolean;
  onClose: () => void;
}

export function OffPlatformWarning({ visible, onClose }: OffPlatformWarningProps) {
  return (
    <SafetyModal
      visible={visible}
      onClose={onClose}
      titleKey="safety.offPlatform.title"
      bodyKey="safety.offPlatform.body"
      confirmTextKey="common.ok"
      showCancel={false}
    />
  );
}

/**
 * Payment safety tip
 */
interface PaymentSafetyTipProps {
  visible: boolean;
  onClose: () => void;
}

export function PaymentSafetyTip({ visible, onClose }: PaymentSafetyTipProps) {
  return (
    <SafetyModal
      visible={visible}
      onClose={onClose}
      titleKey="safety.payment.title"
      bodyKey="safety.payment.body"
      confirmTextKey="common.ok"
      showCancel={false}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  contentScroll: {
    maxHeight: 400,
  },
  contentContainer: {
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 16,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4A4A4A',
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFull: {
    flex: 1,
  },
  buttonPrimary: {
    backgroundColor: '#FF69B4',
  },
  buttonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    backgroundColor: '#F5F5F5',
  },
  buttonSecondaryText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '600',
  },
});
