import { getLegalDoc } from '@/shared/legal/legalRegistry';
/**
 * PACK 158 — User Evidence Export Request Screen
 * 
 * Allows users to request their own evidence exports
 * NOT for spying on others - only their own safety case data
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';

export default function EvidenceRequestScreen() {
  const router = useRouter();
  const [vaultId, setVaultId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestExport = async () => {
    if (!vaultId.trim()) {
      Alert.alert('Error', 'Please enter a vault ID');
      return;
    }

    if (!reason.trim()) {
      Alert.alert('Error', 'Please provide a reason for your request');
      return;
    }

    try {
      setLoading(true);

      const functions = getFunctions();
      const requestExport = httpsCallable(functions, 'pack158_getUserOwnEvidence');

      const result = await requestExport({
        vaultId: vaultId.trim(),
      });

      const data = result.data as { success: boolean; requestId: string; message: string };

      if (data.success) {
        Alert.alert(
          'Request Submitted',
          'Your evidence export request has been submitted. You will be notified when it is ready.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('Error requesting evidence export:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to submit export request'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Request Your Evidence</Text>
        <Text style={styles.subtitle}>
          You can request a copy of evidence related to your safety cases
        </Text>
      </View>

      <View style={styles.warningBox}>
        <Text style={styles.warningTitle}>⚠️ Important</Text>
        <Text style={styles.warningText}>
          • You can only request YOUR OWN evidence{'\n'}
          • This is NOT for checking on others{'\n'}
          • Exports are for legal/safety purposes only{'\n'}
          • You will be notified when ready (may take 48-72 hours)
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Vault ID</Text>
        <Text style={styles.helpText}>
          This was provided to you when your safety case was created
        </Text>
        <TextInput
          style={styles.input}
          value={vaultId}
          onChangeText={setVaultId}
          placeholder="Enter vault ID..."
          autoCapitalize="none"
          editable={!loading}
        />

        <Text style={styles.label}>Reason for Request</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={reason}
          onChangeText={setReason}
          placeholder="Why do you need this evidence? (e.g., legal proceedings, police report)"
          multiline
          numberOfLines={4}
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRequestExport}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Submit Request</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>What You'll Receive</Text>
        <Text style={styles.infoText}>
          • Encrypted messages related to your case{'\n'}
          • Media evidence (if applicable){'\n'}
          • Transaction records (if applicable){'\n'}
          • Timestamps and metadata{'\n'}
          • Legal relevance documentation
        </Text>
      </View>

      <View style={styles.privacyBox}>
        <Text style={styles.privacyTitle}>🔒 Privacy Protection</Text>
        <Text style={styles.privacyText}>
          Your evidence export will NOT include:{'\n\n'}
          • Other users' private conversations{'\n'}
          • Consensual adult content{'\n'}
          • Romantic messages without legal issues{'\n'}
          • Regular dating conversations{'\n\n'}
          Only legal violations are stored in evidence vaults.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  warningBox: {
    margin: 16,
    padding: 16,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  form: {
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
    marginTop: 12,
  },
  helpText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    margin: 16,
    padding: 16,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2196f3',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1565c0',
    lineHeight: 20,
  },
  privacyBox: {
    margin: 16,
    padding: 16,
    backgroundColor: '#f3e5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#9c27b0',
    marginBottom: 32,
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#7b1fa2',
    marginBottom: 8,
  },
  privacyText: {
    fontSize: 13,
    color: '#6a1b9a',
    lineHeight: 20,
  },
});





