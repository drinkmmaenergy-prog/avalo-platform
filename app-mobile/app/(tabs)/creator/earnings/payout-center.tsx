import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from "@/hooks/useAuth";
import { functions, db } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

interface PayoutMethod {
  id: string;
  type: 'wise' | 'paypal' | 'sepa' | 'swift';
  details: any;
  verified: boolean;
}

interface TokenConversionRate {
  USD: number;
  EUR: number;
  GBP: number;
  PLN: number;
}

const CONVERSION_RATES: TokenConversionRate = {
  USD: 0.01,
  EUR: 0.009,
  GBP: 0.008,
  PLN: 0.04,
};

export default function PayoutCenterScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [availableTokens, setAvailableTokens] = useState(0);
  const [pendingPayout, setPendingPayout] = useState(0);
  const [payoutMethods, setPayoutMethods] = useState<PayoutMethod[]>([]);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<keyof TokenConversionRate>('USD');
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [recentPayouts, setRecentPayouts] = useState<any[]>([]);
  const [kycVerified, setKycVerified] = useState(false);

  useEffect(() => {
    loadPayoutData();
  }, []);

  const loadPayoutData = async () => {
    try {
      // Load earnings summary
      const summaryRef = collection(db, `creators/${user?.uid}/earningSummary`);
      const summarySnapshot = await getDocs(query(summaryRef, limit(1)));
      if (!summarySnapshot.empty) {
        const summary = summarySnapshot.docs[0].data();
        setAvailableTokens(summary.availableTokens || 0);
        setPendingPayout(summary.pendingPayout || 0);
      }

      // Load payout methods
      const methodsRef = collection(db, `creators/${user?.uid}/payoutMethods`);
      const methodsSnapshot = await getDocs(methodsRef);
      setPayoutMethods(
        methodsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as PayoutMethod))
      );

      // Load recent payouts
      const payoutsRef = collection(db, 'payoutRequests');
      const payoutsQuery = query(
        payoutsRef,
        where('creatorId', '==', user?.uid),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const payoutsSnapshot = await getDocs(payoutsQuery);
      setRecentPayouts(payoutsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));

      // Check KYC status
      // TODO: Load from user document
      setKycVerified(true); // Placeholder

    } catch (error) {
      console.error('Error loading payout data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPayout = async () => {
    if (!kycVerified) {
      Alert.alert('KYC Required', 'Please complete KYC verification to request payouts.');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 20) {
      Alert.alert('Invalid Amount', 'Minimum payout is 20 USD equivalent.');
      return;
    }

    if (!selectedMethod) {
      Alert.alert('Select Method', 'Please select a payout method.');
      return;
    }

    const requiredTokens = Math.ceil(amountNum / CONVERSION_RATES[currency]);
    if (requiredTokens > availableTokens) {
      Alert.alert('Insufficient Balance', 'You do not have enough tokens for this payout.');
      return;
    }

    Alert.alert(
      'Confirm Payout',
      `Request payout of ${amountNum} ${currency} (${requiredTokens} tokens)?\n\nETA: 1-5 business days`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setProcessing(true);
            try {
              const selectedMethodData = payoutMethods.find((m) => m.id === selectedMethod);
              const requestPayout = httpsCallable(functions, 'requestPayout');
              await requestPayout({
                amount: amountNum,
                currency,
                method: selectedMethodData?.type,
                methodDetails: selectedMethodData?.details,
              });

              Alert.alert('Success', 'Payout request submitted successfully!');
              setAmount('');
              setSelectedMethod(null);
              loadPayoutData();
            } catch (error) {
              console.error('Error requesting payout:', error);
              Alert.alert('Error', 'Failed to request payout. Please try again.');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleAddPayoutMethod = () => {
    router.push('/creator/earnings/add-payout-method' as any);
  };

  const calculateFiatAmount = (tokens: number): string => {
    return (tokens * CONVERSION_RATES[currency]).toFixed(2);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading payout center...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#10B981', '#059669']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payout Center</Text>
        <Text style={styles.headerSubtitle}>Withdraw your earnings</Text>
      </LinearGradient>

      {/* Balance Cards */}
      <View style={styles.balanceContainer}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>{availableTokens.toLocaleString()}</Text>
          <Text style={styles.balanceSubtext}>tokens</Text>
          <Text style={styles.balanceFiat}>
            ≈ ${calculateFiatAmount(availableTokens)} {currency}
          </Text>
        </View>

        {pendingPayout > 0 && (
          <View style={[styles.balanceCard, styles.pendingCard]}>
            <Text style={styles.balanceLabel}>Pending Payout</Text>
            <Text style={styles.balanceAmount}>${pendingPayout.toFixed(2)}</Text>
            <Text style={styles.balanceSubtext}>Processing...</Text>
          </View>
        )}
      </View>

      {/* KYC Warning */}
      {!kycVerified && (
        <View style={styles.warningCard}>
          <Ionicons name="warning" size={24} color="#F59E0B" />
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>KYC Verification Required</Text>
            <Text style={styles.warningText}>
              Complete identity verification to enable payouts
            </Text>
          </View>
          <TouchableOpacity style={styles.warningButton}>
            <Text style={styles.warningButtonText}>Verify Now</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Payout Request Form */}
      <View style={styles.formSection}>
        <Text style={styles.sectionTitle}>Request Payout</Text>

        {/* Currency Selection */}
        <Text style={styles.inputLabel}>Currency</Text>
        <View style={styles.currencySelector}>
          {(['USD', 'EUR', 'GBP', 'PLN'] as const).map((cur) => (
            <TouchableOpacity
              key={cur}
              style={[styles.currencyButton, currency === cur && styles.currencyButtonActive]}
              onPress={() => setCurrency(cur)}
            >
              <Text
                style={[
                  styles.currencyButtonText,
                  currency === cur && styles.currencyButtonTextActive,
                ]}
              >
                {cur}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Amount Input */}
        <Text style={styles.inputLabel}>Amount ({currency})</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="Minimum 20"
          placeholderTextColor="#9CA3AF"
        />
        {amount && !isNaN(parseFloat(amount)) && (
          <Text style={styles.conversionText}>
            ≈ {Math.ceil(parseFloat(amount) / CONVERSION_RATES[currency])} tokens
          </Text>
        )}

        {/* Payout Method Selection */}
        <Text style={styles.inputLabel}>Payout Method</Text>
        {payoutMethods.length === 0 ? (
          <TouchableOpacity style={styles.addMethodCard} onPress={handleAddPayoutMethod}>
            <Ionicons name="add-circle" size={32} color="#6366F1" />
            <Text style={styles.addMethodText}>Add Payout Method</Text>
          </TouchableOpacity>
        ) : (
          <View>
            {payoutMethods.map((method) => (
              <TouchableOpacity
                key={method.id}
                style={[
                  styles.methodCard,
                  selectedMethod === method.id && styles.methodCardSelected,
                ]}
                onPress={() => setSelectedMethod(method.id)}
              >
                <View style={styles.methodIcon}>
                  <Ionicons name={getMethodIcon(method.type)} size={24} color="#6366F1" />
                </View>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodType}>{method.type.toUpperCase()}</Text>
                  <Text style={styles.methodDetails}>
                    {getMethodLabel(method.type, method.details)}
                  </Text>
                  {method.verified && (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  )}
                </View>
                {selectedMethod === method.id && (
                  <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.addMethodButton} onPress={handleAddPayoutMethod}>
              <Ionicons name="add" size={20} color="#6366F1" />
              <Text style={styles.addMethodButtonText}>Add Another Method</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Request Button */}
        <TouchableOpacity
          style={[
            styles.requestButton,
            (!selectedMethod || !amount || processing || !kycVerified) &&
              styles.requestButtonDisabled,
          ]}
          onPress={handleRequestPayout}
          disabled={!selectedMethod || !amount || processing || !kycVerified}
        >
          {processing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="card" size={20} color="#FFFFFF" />
              <Text style={styles.requestButtonText}>Request Payout</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Info Text */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#6366F1" />
          <Text style={styles.infoText}>
            Payouts are processed within 1-5 business days. Avalo retains 35% commission; you
            receive 65% of gross earnings.
          </Text>
        </View>
      </View>

      {/* Recent Payouts */}
      {recentPayouts.length > 0 && (
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Recent Payouts</Text>
          {recentPayouts.map((payout) => (
            <View key={payout.id} style={styles.payoutHistoryCard}>
              <View style={styles.payoutHistoryIcon}>
                <Ionicons
                  name={getStatusIcon(payout.status)}
                  size={24}
                  color={getStatusColor(payout.status)}
                />
              </View>
              <View style={styles.payoutHistoryInfo}>
                <Text style={styles.payoutHistoryAmount}>
                  {payout.amount} {payout.currency}
                </Text>
                <Text style={styles.payoutHistoryDate}>
                  {formatDate(payout.createdAt)}
                </Text>
              </View>
              <View style={[styles.payoutStatus, { backgroundColor: `${getStatusColor(payout.status)}20` }]}>
                <Text style={[styles.payoutStatusText, { color: getStatusColor(payout.status) }]}>
                  {payout.status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function getMethodIcon(type: string): any {
  const icons: Record<string, any> = {
    wise: 'globe',
    paypal: 'logo-paypal',
    sepa: 'business',
    swift: 'swap-horizontal',
  };
  return icons[type] || 'card';
}

function getMethodLabel(type: string, details: any): string {
  switch (type) {
    case 'paypal':
      return details.email || 'PayPal Account';
    case 'wise':
      return details.accountHolderName || 'Wise Account';
    case 'sepa':
      return `IBAN: ***${(details.iban || '').slice(-4)}`;
    case 'swift':
      return `Account: ***${(details.accountNumber || '').slice(-4)}`;
    default:
      return 'Payment Method';
  }
}

function getStatusIcon(status: string): any {
  const icons: Record<string, any> = {
    pending: 'time',
    processing: 'sync',
    completed: 'checkmark-circle',
    failed: 'close-circle',
    cancelled: 'ban',
  };
  return icons[status] || 'help-circle';
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: '#F59E0B',
    processing: '#3B82F6',
    completed: '#10B981',
    failed: '#EF4444',
    cancelled: '#6B7280',
  };
  return colors[status] || '#6B7280';
}

function formatDate(timestamp: any): string {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 32,
  },
  backButton: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    marginTop: 4,
  },
  balanceContainer: {
    padding: 16,
    marginTop: -20,
    gap: 12,
  },
  balanceCard: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  pendingCard: {
    backgroundColor: '#FEF3C7',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#111827',
  },
  balanceSubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  balanceFiat: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 8,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
  },
  warningContent: {
    flex: 1,
    marginLeft: 12,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  warningText: {
    fontSize: 12,
    color: '#92400E',
    marginTop: 2,
  },
  warningButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F59E0B',
    borderRadius: 8,
  },
  warningButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  formSection: {
    margin: 16,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 16,
  },
  currencySelector: {
    flexDirection: 'row',
    gap: 8,
  },
  currencyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  currencyButtonActive: {
    backgroundColor: '#6366F1',
  },
  currencyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  currencyButtonTextActive: {
    color: '#FFFFFF',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
  },
  conversionText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  addMethodCard: {
    padding: 32,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
  },
  addMethodText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6366F1',
    marginTop: 8,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  methodCardSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  methodInfo: {
    flex: 1,
  },
  methodType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  methodDetails: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  verifiedText: {
    fontSize: 12,
    color: '#10B981',
    marginLeft: 4,
  },
  addMethodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
  },
  addMethodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
    marginLeft: 8,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#10B981',
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  requestButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  requestButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  infoBox: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    marginTop: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#4B5563',
    marginLeft: 8,
    lineHeight: 18,
  },
  historySection: {
    margin: 16,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  payoutHistoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  payoutHistoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  payoutHistoryInfo: {
    flex: 1,
  },
  payoutHistoryAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  payoutHistoryDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  payoutStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  payoutStatusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
