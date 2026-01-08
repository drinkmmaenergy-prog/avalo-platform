/**
 * PACK 83 — Creator Payout Requests & Compliance Layer
 * Create Payout Request Screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { usePayoutSystem } from "@/hooks/usePayouts";
import { useWallet } from "@/hooks/useWallet";
import {
  formatCurrency,
  formatTokens,
  PAYOUT_METHOD_LABELS,
  PAYOUT_METHOD_ICONS,
  getMaskedMethodDetails,
} from "@/types/payouts";
import type { PayoutMethod } from "@/types/payouts";

export default function CreatePayoutRequestScreen() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const {
    config,
    configLoading,
    methods,
    methodsLoading,
    getDefaultMethod,
    createRequest,
    canRequestPayout,
    calculateFiatAmount,
  } = usePayoutSystem(user?.uid || null);

  const { wallet, isLoading: walletLoading } = useWallet(user?.uid || null);

  const [selectedMethod, setSelectedMethod] = useState<PayoutMethod | null>(null);
  const [tokenAmount, setTokenAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set default method on load
  useEffect(() => {
    if (methods.length > 0 && !selectedMethod) {
      const defaultMethod = getDefaultMethod();
      setSelectedMethod(defaultMethod);
    }
  }, [methods, selectedMethod, getDefaultMethod]);

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in');
      return;
    }

    if (!selectedMethod) {
      Alert.alert('Error', 'Please select a payout method');
      return;
    }

    if (!config) {
      Alert.alert('Error', 'Configuration not loaded');
      return;
    }

    const tokens = parseInt(tokenAmount);
    if (isNaN(tokens) || tokens <= 0) {
      Alert.alert('Error', 'Please enter a valid token amount');
      return;
    }

    const validation = canRequestPayout(
      wallet?.availableTokens || 0,
      tokens
    );

    if (!validation.canRequest) {
      Alert.alert('Error', validation.reason || 'Cannot request payout');
      return;
    }

    const fiatAmount = calculateFiatAmount(tokens);

    Alert.alert(
      'Confirm Payout Request',
      `You are requesting a payout of ${formatTokens(tokens)} tokens (${formatCurrency(fiatAmount, selectedMethod.currency)}) to ${selectedMethod.displayName}.\n\nThis will lock these tokens until the request is reviewed. If rejected, tokens will be returned to your balance.\n\nContinue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              setIsSubmitting(true);
              await createRequest(selectedMethod.id, tokens);
              Alert.alert(
                'Success',
                'Your payout request has been created and is now pending review.',
                [
                  {
                    text: 'OK',
                    onPress: () => router.back(),
                  },
                ]
              );
            } catch (err: any) {
              Alert.alert(
                'Error',
                err.message || 'Failed to create payout request'
              );
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleMaxAmount = () => {
    if (wallet) {
      setTokenAmount(wallet.availableTokens.toString());
    }
  };

  if (configLoading || methodsLoading || walletLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!config || !wallet) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>⚠️ Failed to load data</Text>
      </View>
    );
  }

  if (methods.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyIcon}>💳</Text>
        <Text style={styles.emptyTitle}>No Payout Methods</Text>
        <Text style={styles.emptySubtitle}>
          You need to add a payout method before requesting a payout
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/wallet/payout-methods' as any)}
        >
          <Text style={styles.primaryButtonText}>Add Payout Method</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tokens = parseInt(tokenAmount) || 0;
  const fiatAmount = calculateFiatAmount(tokens);
  const validation = canRequestPayout(wallet.availableTokens, tokens);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Request Payout</Text>
          <Text style={styles.subtitle}>
            Withdraw your earnings to your chosen payment method
          </Text>
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>
            {formatTokens(wallet.availableTokens)} tokens
          </Text>
          <Text style={styles.balanceNote}>
            ≈ {formatCurrency(calculateFiatAmount(wallet.availableTokens), selectedMethod?.currency || 'EUR')}
          </Text>
        </View>

        {/* Minimum Payout Warning */}
        <View style={styles.warningCard}>
          <Text style={styles.warningIcon}>ℹ️</Text>
          <View style={styles.warningTextContainer}>
            <Text style={styles.warningText}>
              Minimum payout: {formatTokens(config.minPayoutTokens)} tokens
            </Text>
            <Text style={styles.warningSubtext}>
              Token rate: 1 token = €{config.tokenToEurRate.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Payout Method Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payout Method</Text>
          {methods.map((method) => (
            <TouchableOpacity
              key={method.id}
              style={[
                styles.methodOption,
                selectedMethod?.id === method.id && styles.methodOptionSelected,
              ]}
              onPress={() => setSelectedMethod(method)}
              disabled={isSubmitting}
            >
              <View style={styles.methodOptionContent}>
                <Text style={styles.methodIcon}>
                  {PAYOUT_METHOD_ICONS[method.type]}
                </Text>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodName}>{method.displayName}</Text>
                  <Text style={styles.methodDetails}>
                    {PAYOUT_METHOD_LABELS[method.type]} • {method.currency}
                  </Text>
                  <Text style={styles.methodDetailsSmall}>
                    {getMaskedMethodDetails(method)}
                  </Text>
                </View>
              </View>
              {selectedMethod?.id === method.id && (
                <View style={styles.selectedIndicator}>
                  <Text style={styles.selectedIndicatorText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.manageMethodsButton}
            onPress={() => router.push('/wallet/payout-methods' as any)}
          >
            <Text style={styles.manageMethodsButtonText}>
              Manage Payout Methods
            </Text>
          </TouchableOpacity>
        </View>

        {/* Amount Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Amount (tokens)</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={tokenAmount}
              onChangeText={setTokenAmount}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#9CA3AF"
              editable={!isSubmitting}
            />
            <TouchableOpacity
              style={styles.maxButton}
              onPress={handleMaxAmount}
              disabled={isSubmitting}
            >
              <Text style={styles.maxButtonText}>MAX</Text>
            </TouchableOpacity>
          </View>
          {tokens > 0 && (
            <Text style={styles.conversionText}>
              ≈ {formatCurrency(fiatAmount, selectedMethod?.currency || 'EUR')}
            </Text>
          )}
          {!validation.canRequest && tokens > 0 && (
            <Text style={styles.errorSubtext}>{validation.reason}</Text>
          )}
        </View>

        {/* Important Notice */}
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>⚠️ Important</Text>
          <Text style={styles.noticeText}>
            • Your payout request will be reviewed according to Avalo's policies
          </Text>
          <Text style={styles.noticeText}>
            • If rejected, tokens will be returned to your Avalo balance
          </Text>
          <Text style={styles.noticeText}>
            • Processing time may vary depending on review
          </Text>
          <Text style={styles.noticeText}>
            • Once approved and paid, tokens cannot be refunded
          </Text>
        </View>
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (!validation.canRequest || isSubmitting) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!validation.canRequest || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Request Payout</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  balanceCard: {
    backgroundColor: '#3B82F6',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#BFDBFE',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  balanceNote: {
    fontSize: 14,
    color: '#DBEAFE',
  },
  warningCard: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  warningTextContainer: {
    flex: 1,
  },
  warningText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  warningSubtext: {
    fontSize: 13,
    color: '#92400E',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  methodOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  methodOptionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  methodOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  methodIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  methodDetails: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
  },
  methodDetailsSmall: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedIndicatorText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  manageMethodsButton: {
    padding: 12,
    alignItems: 'center',
  },
  manageMethodsButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    paddingVertical: 16,
  },
  maxButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  maxButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  conversionText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  errorSubtext: {
    fontSize: 13,
    color: '#DC2626',
    marginTop: 8,
  },
  noticeCard: {
    backgroundColor: '#FEF2F2',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#991B1B',
    marginBottom: 12,
  },
  noticeText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 20,
    marginBottom: 4,
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
  },
});
