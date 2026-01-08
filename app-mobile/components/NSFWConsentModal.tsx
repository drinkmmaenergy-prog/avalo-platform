/**
 * PACK 249 - NSFW Consent Modal
 * 
 * Soft, non-shaming consent prompt for explicit content.
 * Sexy atmosphere maintained, just asking for consent.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
} from 'react-native';

interface NSFWConsentModalProps {
  visible: boolean;
  onConsent: () => void;
  onDecline: () => void;
  partnerName?: string;
}

export function NSFWConsentModal({
  visible,
  onConsent,
  onDecline,
  partnerName,
}: NSFWConsentModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}
    >
      <Pressable style={styles.overlay} onPress={onDecline}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>🔒</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>Private Space</Text>

          {/* Message */}
          <Text style={styles.message}>
            {partnerName ? `Your chat with ${partnerName}` : 'This conversation'} is about to
            get more intimate.
          </Text>

          <Text style={styles.submessage}>
            To continue, confirm you're 18+ and you consent to explicit content.
          </Text>

          {/* Info box */}
          <View style={styles.infoBox}>
            <Text style={styles.infoIcon}>💡</Text>
            <Text style={styles.infoText}>
              Keep it consensual, safe and between adults.
            </Text>
          </View>

          {/* Buttons */}
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.declineButton]}
              onPress={onDecline}
            >
              <Text style={styles.declineButtonText}>Not now</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.consentButton]}
              onPress={onConsent}
            >
              <Text style={styles.consentButtonText}>I'm 18+ and I consent</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>
            Your consent is private and can be withdrawn anytime.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#333333',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  submessage: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFD700',
    width: '100%',
  },
  infoIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#856404',
    fontWeight: '500',
    lineHeight: 18,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  declineButton: {
    backgroundColor: '#F5F5F5',
  },
  declineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666666',
  },
  consentButton: {
    backgroundColor: '#FF6B6B',
  },
  consentButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  footer: {
    fontSize: 11,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 15,
    fontStyle: 'italic',
  },
});
