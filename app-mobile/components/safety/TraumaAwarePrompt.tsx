/**
 * PACK 126 — Trauma-Aware Prompt
 * 
 * No-confrontation safety action prompt
 * Allows users to protect themselves without explanation
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TraumaAwarePromptProps {
  visible: boolean;
  onClose: () => void;
  onPauseConsent: () => void;
  onRevokeConsent: () => void;
  onContactSupport: () => void;
  counterpartName: string;
}

export default function TraumaAwarePrompt({
  visible,
  onClose,
  onPauseConsent,
  onRevokeConsent,
  onContactSupport,
  counterpartName,
}: TraumaAwarePromptProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Ionicons name="shield-checkmark" size={32} color="#10b981" />
            <Text style={styles.title}>
              I don't feel comfortable right now
            </Text>
          </View>

          <Text style={styles.description}>
            You can take action without explaining why. Your safety comes first.
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.pauseButton]}
              onPress={onPauseConsent}
            >
              <Ionicons name="pause-circle" size={20} color="#fff" />
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Take a Break</Text>
                <Text style={styles.actionDescription}>
                  Pause this connection temporarily
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.endButton]}
              onPress={onRevokeConsent}
            >
              <Ionicons name="ban" size={20} color="#fff" />
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>End Connection</Text>
                <Text style={styles.actionDescription}>
                  Stop all communication permanently
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.supportButton]}
              onPress={onContactSupport}
            >
              <Ionicons name="help-circle" size={20} color="#fff" />
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Contact Support</Text>
                <Text style={styles.actionDescription}>
                  Talk to our safety team privately
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelText}>Not Right Now</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              No questions asked. No explanations required.
            </Text>
          </View>
        </View>
      </View>
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
  modal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  actions: {
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  pauseButton: {
    backgroundColor: '#f59e0b',
  },
  endButton: {
    backgroundColor: '#ef4444',
  },
  supportButton: {
    backgroundColor: '#3b82f6',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'center',
  },
  footer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  footerText: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
