/**
 * PACK 321 — Payout Request Screen
 * Request token payout with KYC verification
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader } from "@/components/AppHeader";
import { colors, spacing, fontSizes, fontWeights } from "@/shared/theme";
import { auth, functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

const MIN_PAYOUT_TOKENS = 1000;
const TOKEN_PAYOUT_RATE = 0.20; // PLN per token

export default function PayoutRequestScreen() {
  const router = useRouter();
  const [balance, setBalance] = useState(0);
  const [amountTokens, setAmountTokens] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<'stripe_connect' | 'bank_transfer'>('stripe_connect');
  const [kycVerified, setKycVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadWalletInfo();
  }, []);

  const loadWalletInfo = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) return;

      const getBalance = httpsCallable(functions, 'pack277_getBalance');
      const result = await getBalance();
      const data = result.data as any;

      if (data.success && data.wallet) {
        setBalance(data.wallet.tokensBalance);
      }

      // TODO: Check KYC status from user profile
      // For now, assume not verified
      setKycVerified(false);
    } catch (err) {
      console.error('Load wallet info error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePayout = async () => {
    const tokens = parseInt(amountTokens);

    if (!tokens || tokens < MIN_PAYOUT_TOKENS) {
      Alert.alert('Invalid Amount', `Minimum payout is ${MIN_PAYOUT_TOKENS} tokens`);
      return;
    }

    if (tokens > balance) {
      Alert.alert('Insufficient Balance', 'You don\'t have enough tokens');
      return;
    }

    if (!kycVerified) {
      Alert.alert(
        'KYC Required',
        'You must complete KYC verification before requesting a payout.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Verify Now', 
            onPress: () => {
              // TODO: Navigate to KYC verification
              Alert.alert('KYC Verification', 'KYC verification coming soon');
            }
          },
        ]
      );
      return;
    }

    const plnAmount = (tokens * TOKEN_PAYOUT_RATE).toFixed(2);

    Alert.alert(
      'Confirm Payout',
      `Request payout of ${tokens} tokens (${plnAmount} PLN)?\n\n` +
      `Processing may take 3-5 business days.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => submitPayout(tokens) },
      ]
    );
  };

  const submitPayout = async (tokens: number) => {
    try {
      setSubmitting(true);

      const requestPayout = httpsCallable(functions, 'pack277_requestPayout');
      const result = await requestPayout({
        amountTokens: tokens,
        payoutMethod,
        payoutDetails: {
          // Add actual payout details based on method
        },
      });

      const data = result.data as any;

      if (data.success) {
        Alert.alert(
          'Payout Requested',
          'Your payout request has been submitted. You will receive the funds within 3-5 business days.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Error', data.error || 'Failed to submit payout request');
      }
    } catch (err: any) {
      console.error('Payout error:', err);
      Alert.alert('Error', err.message || 'Failed to submit payout');
    } finally {
      setSubmitting(false);
    }
  };

  const calculatePayout = (tokens: string) => {
    const amount = parseInt(tokens) || 0;
    return (amount * TOKEN_PAYOUT_RATE).toFixed(2);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader
          title="Request Payout"
          rightAction={
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          }
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader
        title="Request Payout"
        rightAction={
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>{balance.toLocaleString()}</Text>
          <Text style={styles.balanceSubtext}>tokens</Text>
          <Text style={styles.balanceFiat}>
            ≈ {(balance * TOKEN_PAYOUT_RATE).toFixed(2)} PLN
          </Text>
        </View>

        {/* KYC Status */}
        <View style={styles.section}>
          <View style={styles.kycCard}>
            <View style={styles.kycIcon}>
              <Text style={styles.kycIconText}>{kycVerified ? '✓' : '⚠️'}</Text>
            </View>
            <View style={styles.kycInfo}>
              <Text style={styles.kycTitle}>
                {kycVerified ? 'KYC Verified' : 'KYC Not Verified'}
              </Text>
              <Text style={styles.kycSubtext}>
                {kycVerified
                  ? 'You can request payouts'
                  : 'Complete KYC to request payouts'}
              </Text>
            </View>
            {!kycVerified && (
              <TouchableOpacity style={styles.kycButton}>
                <Text style={styles.kycButtonText}>Verify</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Payout Amount */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payout Amount</Text>
          
          <View style={styles.inputCard}>
            <TextInput
              style={styles.input}
              placeholder={`Minimum ${MIN_PAYOUT_TOKENS} tokens`}
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={amountTokens}
              onChangeText={setAmountTokens}
              editable={!submitting}
            />
            <Text style={styles.inputLabel}>tokens</Text>
          </View>

          {amountTokens && parseInt(amountTokens) >= MIN_PAYOUT_TOKENS && (
            <View style={styles.conversionCard}>
              <Text style={styles.conversionLabel}>You will receive:</Text>
              <Text style={styles.conversionAmount}>
                {calculatePayout(amountTokens)} PLN
              </Text>
              <Text style={styles.conversionSubtext}>
                (at {TOKEN_PAYOUT_RATE} PLN/token)
              </Text>
            </View>
          )}

          <View style={styles.quickAmounts}>
            {[1000, 2500, 5000].map((amount) => (
              <TouchableOpacity
                key={amount}
                style={styles.quickButton}
                onPress={() => setAmountTokens(amount.toString())}
                disabled={amount > balance}
              >
                <Text style={[
                  styles.quickButtonText,
                  amount > balance && styles.quickButtonTextDisabled
                ]}>
                  {amount.toLocaleString()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Payout Method */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payout Method</Text>
          
          <TouchableOpacity
            style={[
              styles.methodCard,
              payoutMethod === 'stripe_connect' && styles.methodCardActive,
            ]}
            onPress={() => setPayoutMethod('stripe_connect')}
          >
            <View style={styles.methodIcon}>
              <Text style={styles.methodIconText}>💳</Text>
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodTitle}>Stripe Connect</Text>
              <Text style={styles.methodSubtext}>Fast & secure</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.methodCard,
              payoutMethod === 'bank_transfer' && styles.methodCardActive,
            ]}
            onPress={() => setPayoutMethod('bank_transfer')}
          >
            <View style={styles.methodIcon}>
              <Text style={styles.methodIconText}>🏦</Text>
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodTitle}>Bank Transfer</Text>
              <Text style={styles.methodSubtext}>3-5 business days</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Important Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>⚠️ Important Information</Text>
          <Text style={styles.infoText}>
            • Minimum payout: {MIN_PAYOUT_TOKENS} tokens ({MIN_PAYOUT_TOKENS * TOKEN_PAYOUT_RATE} PLN){'\n'}
            • Payout rate: {TOKEN_PAYOUT_RATE} PLN per token{'\n'}
            • Processing time: 3-5 business days{'\n'}
            • KYC verification required{'\n'}
            • Platform fees may apply{'\n'}
            • Payouts are irreversible
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            (submitting || !kycVerified || !amountTokens || parseInt(amountTokens) < MIN_PAYOUT_TOKENS) && 
            styles.submitButtonDisabled,
          ]}
          onPress={handlePayout}
          disabled={submitting || !kycVerified || !amountTokens || parseInt(amountTokens) < MIN_PAYOUT_TOKENS}
        >
          {submitting ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.submitButtonText}>Request Payout</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    fontSize: 24,
    color: colors.textPrimary,
  },
  balanceCard: {
    backgroundColor: colors.primary + '20',
    margin: spacing.lg,
    padding: spacing.xl,
    borderRadius: 20,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  balanceAmount: {
    fontSize: 42,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    marginVertical: spacing.sm,
  },
  balanceSubtext: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
  },
  balanceFiat: {
    fontSize: fontSizes.lg,
    color: colors.primary,
    marginTop: spacing.sm,
    fontWeight: fontWeights.semibold,
  },
  section: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  kycCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.textSecondary + '10',
    padding: spacing.lg,
    borderRadius: 16,
  },
  kycIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  kycIconText: {
    fontSize: 24,
  },
  kycInfo: {
    flex: 1,
  },
  kycTitle: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  kycSubtext: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  kycButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20,
  },
  kycButtonText: {
    color: colors.background,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.textSecondary + '10',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  input: {
    flex: 1,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  inputLabel: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  conversionCard: {
    backgroundColor: colors.primary + '10',
    padding: spacing.lg,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  conversionLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  conversionAmount: {
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  conversionSubtext: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickButton: {
    flex: 1,
    backgroundColor: colors.textSecondary + '10',
    padding: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  quickButtonText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  quickButtonTextDisabled: {
    color: colors.textSecondary,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.textSecondary + '10',
    padding: spacing.lg,
    borderRadius: 16,
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  methodCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  methodIconText: {
    fontSize: 24,
  },
  methodInfo: {
    flex: 1,
  },
  methodTitle: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  methodSubtext: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  infoCard: {
    margin: spacing.lg,
    marginTop: 0,
    padding: spacing.lg,
    backgroundColor: colors.textSecondary + '10',
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  infoTitle: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: colors.primary,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.background,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
});
