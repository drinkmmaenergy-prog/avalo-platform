/**
 * PACK 147 — Refund Request Screen
 * 
 * File a refund request for a transaction.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

const REFUND_REASONS = [
  { value: 'NOT_DELIVERED', label: 'Product/Service Not Delivered' },
  { value: 'CALL_NEVER_HAPPENED', label: 'Call Never Connected' },
  { value: 'EVENT_CANCELLED', label: 'Event Was Cancelled' },
  { value: 'ACCESS_NOT_GRANTED', label: 'Access Not Granted' },
  { value: 'FILE_CORRUPTED', label: 'File Downloaded But Unusable' },
  { value: 'TECHNICAL_ERROR', label: 'Technical Platform Issue' }
];

export default function RefundRequestScreen() {
  const params = useLocalSearchParams();
  const { transactionId, transactionType, amount } = params;
  
  const [selectedReason, setSelectedReason] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert('Error', 'Please select a reason for the refund');
      return;
    }
    
    if (description.length < 20) {
      Alert.alert('Error', 'Please provide at least 20 characters of description');
      return;
    }
    
    if (description.length > 1000) {
      Alert.alert('Error', 'Description must be less than 1000 characters');
      return;
    }
    
    setLoading(true);
    
    try {
      const requestRefund = httpsCallable(functions, 'pack147_requestRefund');
      
      const result = await requestRefund({
        transactionId,
        transactionType,
        reason: selectedReason,
        description,
        evidenceUrls: []
      });
      
      const data = result.data as any;
      
      if (data.success) {
        Alert.alert(
          'Success',
          'Your refund request has been submitted and is being reviewed.',
          [
            {
              text: 'OK',
              onPress: () => router.back()
            }
          ]
        );
      }
    } catch (error: any) {
      console.error('Refund request failed:', error);
      Alert.alert('Error', error.message || 'Failed to submit refund request');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Request Refund</Text>
        <Text style={styles.subtitle}>
          Transaction: {transactionType}
        </Text>
        {amount && (
          <Text style={styles.amount}>Amount: {amount} tokens</Text>
        )}
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reason for Refund</Text>
        <Text style={styles.helper}>
          Select the reason that best describes your issue
        </Text>
        
        {REFUND_REASONS.map((reason) => (
          <TouchableOpacity
            key={reason.value}
            style={[
              styles.reasonOption,
              selectedReason === reason.value && styles.reasonSelected
            ]}
            onPress={() => setSelectedReason(reason.value)}
          >
            <Text
              style={[
                styles.reasonText,
                selectedReason === reason.value && styles.reasonTextSelected
              ]}
            >
              {reason.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.helper}>
          Explain what happened (20-1000 characters)
        </Text>
        
        <TextInput
          style={styles.textArea}
          multiline
          numberOfLines={6}
          placeholder="Describe the issue in detail..."
          value={description}
          onChangeText={setDescription}
          maxLength={1000}
        />
        
        <Text style={styles.charCount}>
          {description.length} / 1000 characters
        </Text>
      </View>
      
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>⚠️ Important</Text>
        <Text style={styles.noticeText}>
          • Refunds based on emotional satisfaction or romantic expectations will be automatically rejected
        </Text>
        <Text style={styles.noticeText}>
          • Provide factual information only
        </Text>
        <Text style={styles.noticeText}>
          • False claims may result in account penalties
        </Text>
      </View>
      
      <TouchableOpacity
        style={[styles.submitButton, loading && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Submit Refund Request</Text>
        )}
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => router.back()}
        disabled={loading}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  helper: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  reasonOption: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 12,
  },
  reasonSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#e6f2ff',
  },
  reasonText: {
    fontSize: 16,
    color: '#000',
  },
  reasonTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 4,
  },
  notice: {
    backgroundColor: '#fff3cd',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
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
    marginBottom: 4,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    margin: 16,
    marginTop: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    padding: 16,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 32,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
});
