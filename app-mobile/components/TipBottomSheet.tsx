/**
 * Tip Bottom Sheet Component
 * Modal for sending tips to creators
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { TIPS_CONFIG } from '../config/monetization';
import {
  sendTip,
  getCommonTipAmounts,
  calculateTipSplit,
  validateTipAmount,
} from '../services/tipsService';

interface TipBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  recipientId: string;
  recipientName: string;
  currentUserId: string;
  currentBalance: number;
  onTipSent?: (amount: number) => void;
  onNeedTokens?: () => void;
  context?: {
    postId?: string;
    type?: 'feed' | 'profile' | 'chat';
  };
}

export default function TipBottomSheet({
  visible,
  onClose,
  recipientId,
  recipientName,
  currentUserId,
  currentBalance,
  onTipSent,
  onNeedTokens,
  context,
}: TipBottomSheetProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const commonAmounts = getCommonTipAmounts();

  const handleAmountSelect = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount('');
  };

  const handleCustomAmountChange = (text: string) => {
    // Only allow numbers
    const numericText = text.replace(/[^0-9]/g, '');
    setCustomAmount(numericText);
    setSelectedAmount(null);
  };

  const getTipAmount = (): number | null => {
    if (selectedAmount !== null) {
      return selectedAmount;
    }
    if (customAmount) {
      return parseInt(customAmount, 10);
    }
    return null;
  };

  const handleSendTip = async () => {
    const amount = getTipAmount();
    
    if (!amount) {
      Alert.alert('Error', 'Please select or enter a tip amount');
      return;
    }

    // Validate amount
    const validation = validateTipAmount(amount);
    if (!validation.valid) {
      Alert.alert('Invalid Amount', validation.error);
      return;
    }

    // Check balance
    if (currentBalance < amount) {
      Alert.alert(
        'Insufficient Tokens',
        `You need ${amount} tokens to send this tip. Would you like to purchase tokens?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Buy Tokens',
            onPress: () => {
              onClose();
              onNeedTokens?.();
            },
          },
        ]
      );
      return;
    }

    setLoading(true);

    try {
      const result = await sendTip(currentUserId, recipientId, amount, context);

      if (result.success) {
        Alert.alert(
          'Tip Sent! 🎉',
          `You sent ${amount} tokens to ${recipientName}\n\n` +
          `They received: ${result.creatorAmount} tokens (${Math.floor((result.creatorAmount! / amount) * 100)}%)\n` +
          `Platform fee: ${result.avaloFee} tokens`,
          [
            {
              text: 'OK',
              onPress: () => {
                onTipSent?.(amount);
                onClose();
              },
            },
          ]
        );
      } else if (result.error === 'INSUFFICIENT_TOKENS') {
        Alert.alert(
          'Insufficient Tokens',
          'Would you like to purchase tokens?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Buy Tokens',
              onPress: () => {
                onClose();
                onNeedTokens?.();
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to send tip. Please try again.');
      }
    } catch (error) {
      console.error('Error sending tip:', error);
      Alert.alert('Error', 'Failed to send tip. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const currentAmount = getTipAmount();
  const { creatorAmount, avaloFee } = currentAmount
    ? calculateTipSplit(currentAmount)
    : { creatorAmount: 0, avaloFee: 0 };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.title}>Send Tip to {recipientName}</Text>
            <Text style={styles.balance}>Your Balance: {currentBalance} tokens</Text>
          </View>

          {/* Common Amounts */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Amounts</Text>
            <View style={styles.amountsGrid}>
              {commonAmounts.map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={[
                    styles.amountButton,
                    selectedAmount === amount && styles.amountButtonSelected,
                  ]}
                  onPress={() => handleAmountSelect(amount)}
                >
                  <Text
                    style={[
                      styles.amountButtonText,
                      selectedAmount === amount && styles.amountButtonTextSelected,
                    ]}
                  >
                    {amount}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Custom Amount */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Custom Amount</Text>
            <TextInput
              style={styles.input}
              placeholder={`${TIPS_CONFIG.MIN_TIP_AMOUNT} - ${TIPS_CONFIG.MAX_TIP_AMOUNT} tokens`}
              keyboardType="numeric"
              value={customAmount}
              onChangeText={handleCustomAmountChange}
              placeholderTextColor="#999"
            />
          </View>

          {/* Breakdown */}
          {currentAmount && currentAmount > 0 && (
            <View style={styles.breakdown}>
              <Text style={styles.breakdownTitle}>Breakdown</Text>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Total:</Text>
                <Text style={styles.breakdownValue}>{currentAmount} tokens</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>
                  {recipientName} receives:
                </Text>
                <Text style={[styles.breakdownValue, styles.creatorAmount]}>
                  {creatorAmount} tokens ({Math.floor((creatorAmount / currentAmount) * 100)}%)
                </Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Platform fee:</Text>
                <Text style={styles.breakdownValue}>
                  {avaloFee} tokens ({Math.floor((avaloFee / currentAmount) * 100)}%)
                </Text>
              </View>
            </View>
          )}

          {/* Send Button */}
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!currentAmount || loading) && styles.sendButtonDisabled,
            ]}
            onPress={handleSendTip}
            disabled={!currentAmount || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>
                Send Tip {currentAmount ? `(${currentAmount} tokens)` : ''}
              </Text>
            )}
          </TouchableOpacity>

          {/* Cancel Button */}
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
    maxHeight: '90%',
  },
  header: {
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  balance: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  amountsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  amountButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#f5f5f5',
    minWidth: 80,
    alignItems: 'center',
  },
  amountButtonSelected: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FF6B6B',
  },
  amountButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  amountButtonTextSelected: {
    color: '#FF6B6B',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#f9f9f9',
  },
  breakdown: {
    marginHorizontal: 24,
    marginTop: 20,
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#666',
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  creatorAmount: {
    color: '#4CAF50',
  },
  sendButton: {
    marginHorizontal: 24,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  cancelButton: {
    marginHorizontal: 24,
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
  },
});
