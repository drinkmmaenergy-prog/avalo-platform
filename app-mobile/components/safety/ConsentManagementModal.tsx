/**
 * PACK 126 — Consent Management Modal
 * 
 * Trauma-aware consent control UI
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface ConsentManagementModalProps {
  visible: boolean;
  onClose: () => void;
  counterpartId: string;
  counterpartName: string;
  currentState: 'PENDING' | 'ACTIVE_CONSENT' | 'PAUSED' | 'REVOKED';
}

export default function ConsentManagementModal({
  visible,
  onClose,
  counterpartId,
  counterpartName,
  currentState,
}: ConsentManagementModalProps) {
  const [processing, setProcessing] = useState(false);

  const handlePauseConsent = async () => {
    Alert.alert(
      'Pause Connection',
      'This will temporarily pause all communication. You can resume anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pause',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              const pauseConsent = httpsCallable(functions, 'pack126_pauseConsent');
              await pauseConsent({ counterpartId });
              Alert.alert('Success', 'Connection paused');
              onClose();
            } catch (error) {
              Alert.alert('Error', 'Failed to pause connection');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleRevokeConsent = async () => {
    Alert.alert(
      'End Connection',
      'This will permanently end communication. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Connection',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              const revokeConsent = httpsCallable(functions, 'pack126_revokeConsent');
              await revokeConsent({ counterpartId });
              Alert.alert('Success', 'Connection ended');
              onClose();
            } catch (error) {
              Alert.alert('Error', 'Failed to end connection');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleResumeConsent = async () => {
    setProcessing(true);
    try {
      const resumeConsent = httpsCallable(functions, 'pack126_resumeConsent');
      await resumeConsent({ counterpartId });
      Alert.alert('Success', 'Connection resumed');
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to resume connection');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Manage Connection</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.info}>
            <Text style={styles.infoText}>
              Connection with <Text style={styles.bold}>{counterpartName}</Text>
            </Text>
            <Text style={styles.statusText}>
              Status: <Text style={getStatusStyle(currentState)}>{currentState}</Text>
            </Text>
          </View>

          <View style={styles.actions}>
            {currentState === 'ACTIVE_CONSENT' && (
              <>
                <TouchableOpacity
                  style={[styles.button, styles.pauseButton]}
                  onPress={handlePauseConsent}
                  disabled={processing}
                >
                  <Ionicons name="pause-circle-outline" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Pause Connection</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.revokeButton]}
                  onPress={handleRevokeConsent}
                  disabled={processing}
                >
                  <Ionicons name="ban-outline" size={20} color="#fff" />
                  <Text style={styles.buttonText}>End Connection</Text>
                </TouchableOpacity>
              </>
            )}

            {currentState === 'PAUSED' && (
              <>
                <TouchableOpacity
                  style={[styles.button, styles.resumeButton]}
                  onPress={handleResumeConsent}
                  disabled={processing}
                >
                  <Ionicons name="play-circle-outline" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Resume Connection</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.revokeButton]}
                  onPress={handleRevokeConsent}
                  disabled={processing}
                >
                  <Ionicons name="ban-outline" size={20} color="#fff" />
                  <Text style={styles.buttonText}>End Connection</Text>
                </TouchableOpacity>
              </>
            )}

            {currentState === 'REVOKED' && (
              <View style={styles.revokedMessage}>
                <Ionicons name="shield-checkmark" size={32} color="#10b981" />
                <Text style={styles.revokedText}>
                  This connection has been permanently ended
                </Text>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              These actions take effect immediately and protect both users.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getStatusStyle(state: string): any {
  switch (state) {
    case 'ACTIVE_CONSENT':
      return { color: '#10b981' };
    case 'PAUSED':
      return { color: '#f59e0b' };
    case 'REVOKED':
      return { color: '#ef4444' };
    default:
      return { color: '#6b7280' };
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  info: {
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 8,
  },
  bold: {
    fontWeight: 'bold',
  },
  statusText: {
    fontSize: 14,
    color: '#6b7280',
  },
  actions: {
    gap: 12,
    marginBottom: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  pauseButton: {
    backgroundColor: '#f59e0b',
  },
  resumeButton: {
    backgroundColor: '#10b981',
  },
  revokeButton: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  revokedMessage: {
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  revokedText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  footer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  footerText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
});
