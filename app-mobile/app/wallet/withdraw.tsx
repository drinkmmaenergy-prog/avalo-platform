/**
 * PACK 289 — Withdrawal Screen
 * 
 * Main withdrawal/payout screen:
 * - Display withdrawable tokens
 * - Request new withdrawal
 * - View withdrawal history
 * - Monthly limits tracking
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from "@/lib/firebase";

// Constants
const PAYOUT_RATE = 0.20; // 1 token = 0.20 PLN

interface WithdrawableData {
  withdrawableTokens: number;
  calculation: {
    currentBalance: number;
    totalEarned: number;
    totalWithdrawn: number;
    maxEarnedAvailable: number;
  };
  canWithdraw: boolean;
  reasons?: string[];
}

interface MonthlyLimits {
  stats: {
    totalTokensWithdrawn: number;
    totalPLNWithdrawn: number;
    withdrawalCount: number;
  };
  limits: {
    minTokensPerWithdrawal: number;
    maxTokensPerWithdrawal: number;
    maxPLNPerMonth: number;
    maxWithdrawalsPerMonth: number;
  };
  remainingPLN: number;
  remainingWithdrawals: number;
  canWithdraw: boolean;
}

interface WithdrawalRequest {
  withdrawalId: string;
  requestedTokens: number;
  payoutAmount: number;
  payoutCurrency: string;
  status: string;
  createdAt: any;
  paidAt?: any;
}

export default function WithdrawScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [withdrawableData, setWithdrawableData] = useState<WithdrawableData | null>(null);
  const [monthlyLimits, setMonthlyLimits] = useState<MonthlyLimits | null>(null);
  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalRequest[]>([]);
  const [kycStatus, setKycStatus] = useState<string>('NOT_STARTED');

  const [requestedTokens, setRequestedTokens] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load all data in parallel
      const [withdrawableRes, limitsRes, historyRes, kycRes] = await Promise.all([
        httpsCallable(functions, 'withdrawals_getWithdrawableTokens')({}),
        httpsCallable(functions, 'withdrawals_getMonthlyLimits')({}),
        httpsCallable(functions, 'withdrawals_getHistory')({ limit: 10 }),
        httpsCallable(functions, 'kyc_getStatus')({}),
      ]);

      if ((withdrawableRes.data as any).success) {
        setWithdrawableData(withdrawableRes.data as any);
      }

      if ((limitsRes.data as any).success) {
        setMonthlyLimits(limitsRes.data as any);
      }

      if ((historyRes.data as any).success) {
        setWithdrawalHistory((historyRes.data as any).withdrawals || []);
      }

      if ((kycRes.data as any).success) {
        setKycStatus((kycRes.data as any).status || 'NOT_STARTED');
      }
    } catch (error) {
      console.error('Error loading withdrawal data:', error);
      Alert.alert('Error', 'Failed to load withdrawal data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  const handleQuickAmount = (percentage: number) => {
    if (!withdrawableData) return;
    const amount = Math.floor(withdrawableData.withdrawableTokens * (percentage / 100));
    setRequestedTokens(amount.toString());
  };

  const handleWithdraw = async () => {
    if (!requestedTokens || isNaN(parseInt(requestedTokens))) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    const tokens = parseInt(requestedTokens);

    if (!withdrawableData || tokens > withdrawableData.withdrawableTokens) {
      Alert.alert('Error', 'Insufficient withdrawable tokens');
      return;
    }

    if (!monthlyLimits) {
      Alert.alert('Error', 'Unable to verify limits');
      return;
    }

    if (tokens < monthlyLimits.limits.minTokensPerWithdrawal) {
      Alert.alert(
        'Error',
        `Minimum withdrawal is ${monthlyLimits.limits.minTokensPerWithdrawal} tokens`
      );
      return;
    }

    const payoutPLN = tokens * PAYOUT_RATE;

    Alert.alert(
      'Confirm Withdrawal',
      `Withdraw ${tokens} tokens for ${payoutPLN.toFixed(2)} PLN?\n\nThis will be processed within 3-7 business days.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => submitWithdrawal(tokens),
        },
      ]
    );
  };

  const submitWithdrawal = async (tokens: number) => {
    setSubmitting(true);

    try {
      const createRequest = httpsCallable(functions, 'withdrawals_createRequest');
      const result = await createRequest({ requestedTokens: tokens });

      if ((result.data as any).success) {
        Alert.alert(
          'Success',
          'Withdrawal request submitted for review. You will be notified once processed.',
          [
            {
              text: 'OK',
              onPress: () => {
                setRequestedTokens('');
                loadData();
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', (result.data as any).error || 'Failed to create withdrawal');
      }
    } catch (error: any) {
      console.error('Withdrawal error:', error);
      Alert.alert('Error', error.message || 'Failed to create withdrawal');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return '#10b981';
      case 'PROCESSING':
        return '#f59e0b';
      case 'PENDING_REVIEW':
        return '#6366f1';
      case 'REJECTED':
      case 'CANCELLED':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'Paid';
      case 'PROCESSING':
        return 'Processing';
      case 'PENDING_REVIEW':
        return 'Pending Review';
      case 'PENDING_USER':
        return 'Pending';
      case 'APPROVED':
        return 'Approved';
      case 'REJECTED':
        return 'Rejected';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      </SafeAreaView>
    );
  }

  // Check KYC status
  if (kycStatus !== 'VERIFIED') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Withdraw</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.kycRequired}>
          <Ionicons name="shield-checkmark" size={64} color="#6366f1" />
          <Text style={styles.kycRequiredTitle}>KYC Verification Required</Text>
          <Text style={styles.kycRequiredText}>
            {kycStatus === 'NOT_STARTED' &&
              'To withdraw earnings, you need to complete KYC verification.'}
            {kycStatus === 'PENDING' &&
              'Your KYC is pending review. You will be notified once verified.'}
            {kycStatus === 'REJECTED' &&
              'Your KYC was rejected. Please contact support for assistance.'}
          </Text>
          {kycStatus === 'NOT_STARTED' && (
            <TouchableOpacity
              style={styles.kycButton}
              onPress={() => router.push('/wallet/kyc-form' as any)}
            >
              <Text style={styles.kycButtonText}>Start KYC Verification</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Withdraw</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Withdrawable Balance */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Withdrawable Tokens</Text>
          <Text style={styles.balanceAmount}>
            {withdrawableData?.withdrawableTokens.toLocaleString() || 0}
          </Text>
          <Text style={styles.balanceSubtext}>
            ≈ {((withdrawableData?.withdrawableTokens || 0) * PAYOUT_RATE).toFixed(2)} PLN
          </Text>

          <View style={styles.balanceInfo}>
            <View style={styles.balanceInfoRow}>
              <Text style={styles.balanceInfoLabel}>Total Earned:</Text>
              <Text style={styles.balanceInfoValue}>
                {withdrawableData?.calculation.totalEarned.toLocaleString() || 0} tokens
              </Text>
            </View>
            <View style={styles.balanceInfoRow}>
              <Text style={styles.balanceInfoLabel}>Already Withdrawn:</Text>
              <Text style={styles.balanceInfoValue}>
                {withdrawableData?.calculation.totalWithdrawn.toLocaleString() || 0} tokens
              </Text>
            </View>
            <View style={styles.balanceInfoRow}>
              <Text style={styles.balanceInfoLabel}>Current Balance:</Text>
              <Text style={styles.balanceInfoValue}>
                {withdrawableData?.calculation.currentBalance.toLocaleString() || 0} tokens
              </Text>
            </View>
          </View>
        </View>

        {/* Monthly Limits */}
        {monthlyLimits && (
          <View style={styles.limitsCard}>
            <Text style={styles.sectionTitle}>Monthly Limits</Text>
            <View style={styles.progressContainer}>
              <View style={styles.progressInfo}>
                <Text style={styles.progressLabel}>This Month</Text>
                <Text style={styles.progressValue}>
                  {monthlyLimits.stats.totalPLNWithdrawn.toFixed(2)} /{' '}
                  {monthlyLimits.limits.maxPLNPerMonth} PLN
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${(monthlyLimits.stats.totalPLNWithdrawn / monthlyLimits.limits.maxPLNPerMonth) * 100}%`,
                    },
                  ]}
                />
              </View>
            </View>
            <View style={styles.limitsInfo}>
              <Text style={styles.limitsText}>
                Withdrawals this month: {monthlyLimits.stats.withdrawalCount} /{' '}
                {monthlyLimits.limits.maxWithdrawalsPerMonth}
              </Text>
            </View>
          </View>
        )}

        {/* Withdrawal Form */}
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Request Withdrawal</Text>

          <Text style={styles.inputLabel}>Amount (tokens)</Text>
          <TextInput
            style={styles.input}
            value={requestedTokens}
            onChangeText={setRequestedTokens}
            placeholder="Enter amount"
            keyboardType="numeric"
            editable={!submitting}
          />

          <View style={styles.quickButtons}>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickAmount(25)}
              disabled={submitting}
            >
              <Text style={styles.quickButtonText}>25%</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickAmount(50)}
              disabled={submitting}
            >
              <Text style={styles.quickButtonText}>50%</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickAmount(75)}
              disabled={submitting}
            >
              <Text style={styles.quickButtonText}>75%</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickAmount(100)}
              disabled={submitting}
            >
              <Text style={styles.quickButtonText}>Max</Text>
            </TouchableOpacity>
          </View>

          {requestedTokens && !isNaN(parseInt(requestedTokens)) && (
            <View style={styles.estimateBox}>
              <Text style={styles.estimateText}>
                You will receive: {(parseInt(requestedTokens) * PAYOUT_RATE).toFixed(2)} PLN
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.withdrawButton, submitting && styles.withdrawButtonDisabled]}
            onPress={handleWithdraw}
            disabled={submitting || !requestedTokens}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.withdrawButtonText}>Request Withdrawal</Text>
            )}
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={16} color="#6366f1" />
            <Text style={styles.infoText}>
              Withdrawals are processed within 3-7 business days. Rate: 1 token = 0.20 PLN
            </Text>
          </View>
        </View>

        {/* Withdrawal History */}
        {withdrawalHistory.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Recent Withdrawals</Text>
            {withdrawalHistory.map((withdrawal) => (
              <View key={withdrawal.withdrawalId} style={styles.historyItem}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyAmount}>
                    {withdrawal.requestedTokens} tokens
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(withdrawal.status) },
                    ]}
                  >
                    <Text style={styles.statusText}>{getStatusLabel(withdrawal.status)}</Text>
                  </View>
                </View>
                <View style={styles.historyDetails}>
                  <Text style={styles.historyPayout}>
                    {withdrawal.payoutAmount.toFixed(2)} {withdrawal.payoutCurrency}
                  </Text>
                  <Text style={styles.historyDate}>
                    {new Date(withdrawal.createdAt.seconds * 1000).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  balanceCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 48,
    fontWeight: '700',
    color: '#111827',
  },
  balanceSubtext: {
    fontSize: 18,
    color: '#6b7280',
    marginTop: 4,
  },
  balanceInfo: {
    width: '100%',
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  balanceInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balanceInfoLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  balanceInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  limitsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  progressValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 4,
  },
  limitsInfo: {
    marginTop: 12,
  },
  limitsText: {
    fontSize: 14,
    color: '#6b7280',
  },
  formCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  quickButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  quickButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  estimateBox: {
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  estimateText: {
    fontSize: 14,
    color: '#4f46e5',
    textAlign: 'center',
  },
  withdrawButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  withdrawButtonDisabled: {
    opacity: 0.5,
  },
  withdrawButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
  },
  historySection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 32,
    padding: 20,
    borderRadius: 16,
  },
  historyItem: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 16,
    marginTop: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  historyDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyPayout: {
    fontSize: 14,
    color: '#6b7280',
  },
  historyDate: {
    fontSize: 14,
    color: '#6b7280',
  },
  kycRequired: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  kycRequiredTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  kycRequiredText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  kycButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  kycButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
