/**
 * PACK 148 - Blockchain Verification Screen
 * Verify blockchain hash integrity
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

export default function VerifyBlockchainScreen() {
  const [transactionId, setTransactionId] = useState('');
  const [blockchainHash, setBlockchainHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleVerify = async () => {
    if (!transactionId || !blockchainHash) {
      alert('Please enter both transaction ID and blockchain hash');
      return;
    }

    try {
      setLoading(true);
      setResult(null);
      
      const verifyHash = httpsCallable(functions, 'verifyBlockchainHashEndpoint');
      const response = await verifyHash({
        transactionId,
        blockchainHash,
      });
      
      const data = response.data as any;
      setResult(data);
    } catch (error: any) {
      alert('Verification failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Verify Blockchain Hash</Text>
        <Text style={styles.subtitle}>
          Confirm transaction integrity on the blockchain
        </Text>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.label}>Transaction ID</Text>
          <TextInput
            style={styles.input}
            value={transactionId}
            onChangeText={setTransactionId}
            placeholder="Enter transaction ID"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Blockchain Hash</Text>
          <TextInput
            style={[styles.input, styles.hashInput]}
            value={blockchainHash}
            onChangeText={setBlockchainHash}
            placeholder="Enter blockchain hash (64 characters)"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
        </View>

        <TouchableOpacity
          style={[styles.verifyButton, loading && styles.verifyButtonDisabled]}
          onPress={handleVerify}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.verifyButtonText}>🔍 Verify Hash</Text>
          )}
        </TouchableOpacity>

        {result && (
          <View style={[
            styles.resultCard,
            result.isValid ? styles.resultCardSuccess : styles.resultCardError
          ]}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultIcon}>
                {result.isValid ? '✅' : '❌'}
              </Text>
              <Text style={styles.resultTitle}>
                {result.isValid ? 'Verification Successful' : 'Verification Failed'}
              </Text>
            </View>
            
            <View style={styles.resultBody}>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Status:</Text>
                <Text style={[
                  styles.resultValue,
                  result.isValid ? styles.successText : styles.errorText
                ]}>
                  {result.isValid ? 'Valid' : 'Invalid'}
                </Text>
              </View>
              
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Method:</Text>
                <Text style={styles.resultValue}>
                  {result.verificationDetails?.verificationMethod || 'N/A'}
                </Text>
              </View>
              
              {result.verificationDetails?.details && (
                <View style={styles.detailsContainer}>
                  <Text style={styles.detailsLabel}>Details:</Text>
                  <Text style={styles.detailsText}>
                    {result.verificationDetails.details}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>ℹ️ How Verification Works</Text>
          <Text style={styles.infoText}>
            1. Each transaction is recorded on Avalo's blockchain{'\n'}
            2. A unique hash is generated as proof{'\n'}
            3. The hash is immutable and cannot be altered{'\n'}
            4. Verification confirms the transaction exists and is valid
          </Text>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            🔒 All Avalo transactions are recorded on our private blockchain ledger
          </Text>
          <Text style={styles.noticeSubtext}>
            Blockchain provides immutability, not crypto speculation
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
  },
  hashInput: {
    height: 80,
    textAlignVertical: 'top',
    fontFamily: 'monospace',
  },
  verifyButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 2,
  },
  resultCardSuccess: {
    borderColor: '#10B981',
  },
  resultCardError: {
    borderColor: '#EF4444',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  resultIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  resultBody: {
    gap: 12,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  resultValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  successText: {
    color: '#10B981',
  },
  errorText: {
    color: '#EF4444',
  },
  detailsContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  detailsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  detailsText: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  infoCard: {
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1E3A8A',
    lineHeight: 20,
  },
  notice: {
    backgroundColor: '#FEF3C7',
    padding: 16,
    borderRadius: 12,
  },
  noticeText: {
    fontSize: 14,
    color: '#92400E',
    marginBottom: 4,
  },
  noticeSubtext: {
    fontSize: 12,
    color: '#92400E',
  },
});
