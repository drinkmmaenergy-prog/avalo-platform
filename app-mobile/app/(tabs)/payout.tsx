/**
 * Payout Screen
 * Token to EUR conversion and withdrawal management
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { getTokenBalance, subscribeToTokenBalance } from "@/services/tokenService";

// Payout configuration (from MONETIZATION_MASTER_TABLE.md)
const TOKEN_TO_EUR_RATE = 0.05; // 1 token = €0.05

const PAYOUT_METHODS = [
  {
    id: 'paypal',
    name: 'PayPal',
    icon: '💳',
    feeType: 'percentage',
    feePercent: 7,
    minFee: 0.50,
    maxFee: 50.00,
    minTokens: 100,
    maxTokens: 100000,
    processingDays: '1-3',
  },
  {
    id: 'bank',
    name: 'Bank Transfer',
    icon: '🏦',
    feeType: 'flat',
    flatFee: 4.00,
    minTokens: 200,
    maxTokens: 200000,
    processingDays: '3-5',
  },
  {
    id: 'revolut',
    name: 'Revolut',
    icon: '💸',
    feeType: 'percentage',
    feePercent: 5,
    minFee: 0.25,
    maxFee: 25.00,
    minTokens: 100,
    maxTokens: 150000,
    processingDays: '1-2',
  },
  {
    id: 'crypto',
    name: 'Crypto (USDT)',
    icon: '₿',
    feeType: 'percentage',
    feePercent: 2,
    minFee: 1.00,
    maxFee: 100.00,
    minTokens: 200,
    maxTokens: 500000,
    processingDays: '1',
  },
];

export default function PayoutScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [tokenBalance, setTokenBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  useEffect(() => {
    if (user?.uid) {
      const unsubscribe = subscribeToTokenBalance(
        user.uid,
        (balance) => {
          setTokenBalance(balance);
          setLoading(false);
        },
        (error) => {
          console.error('Balance subscription error:', error);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } else {
      setLoading(false);
    }
  }, [user?.uid]);

  const calculatePayout = (tokens: number, methodId: string) => {
    const method = PAYOUT_METHODS.find(m => m.id === methodId);
    if (!method) return { gross: 0, fee: 0, net: 0 };

    const gross = tokens * TOKEN_TO_EUR_RATE;

    let fee = 0;
    if (method.feeType === 'percentage') {
      fee = gross * (method.feePercent / 100);
      if (method.minFee && fee < method.minFee) fee = method.minFee;
      if (method.maxFee && fee > method.maxFee) fee = method.maxFee;
    } else if (method.feeType === 'flat') {
      fee = method.flatFee || 0;
    }

    const net = gross - fee;

    return { gross, fee, net };
  };

  const handleWithdraw = () => {
    if (!selectedMethod) {
      Alert.alert('Select Method', 'Please select a withdrawal method');
      return;
    }

    const tokens = parseInt(withdrawAmount);
    if (isNaN(tokens) || tokens <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid token amount');
      return;
    }

    const method = PAYOUT_METHODS.find(m => m.id === selectedMethod);
    if (!method) return;

    if (tokens < method.minTokens) {
      Alert.alert(
        'Below Minimum',
        `Minimum withdrawal for ${method.name} is ${method.minTokens} tokens (€${(method.minTokens * TOKEN_TO_EUR_RATE).toFixed(2)})`
      );
      return;
    }

    if (tokens > method.maxTokens) {
      Alert.alert(
        'Above Maximum',
        `Maximum withdrawal for ${method.name} is ${method.maxTokens} tokens (€${(method.maxTokens * TOKEN_TO_EUR_RATE).toFixed(2)})`
      );
      return;
    }

    if (tokens > tokenBalance) {
      Alert.alert('Brakuje Ci tokenów', `Masz tylko ${tokenBalance} tokenów — doładuj i kontynuuj zarabianie`);
      return;
    }

    const { gross, fee, net } = calculatePayout(tokens, selectedMethod);

    Alert.alert(
      'Confirm Withdrawal',
      `Withdraw ${tokens} tokens?\n\nGross: €${gross.toFixed(2)}\nFee: €${fee.toFixed(2)}\nNet Payout: €${net.toFixed(2)}\n\nProcessing: ${method.processingDays} days`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            // In production, process withdrawal
            Alert.alert(
              'Withdrawal Submitted',
              `Your withdrawal request has been submitted. You will receive €${net.toFixed(2)} via ${method.name} within ${method.processingDays} days.`
            );
            setWithdrawAmount('');
          },
        },
      ]
    );
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Please sign in to access payouts</Text>
        </View>
      </View>
    );
  }

  const eurValue = tokenBalance * TOKEN_TO_EUR_RATE;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payout</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          {loading ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <>
              <Text style={styles.balanceTokens}>{tokenBalance.toLocaleString()} tokens</Text>
              <Text style={styles.balanceEur}>≈ €{eurValue.toFixed(2)}</Text>
              <Text style={styles.conversionRate}>1 token = €{TOKEN_TO_EUR_RATE.toFixed(2)}</Text>
            </>
          )}
        </View>

        {/* Withdrawal Amount Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Withdrawal Amount</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Enter tokens to withdraw"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="numeric"
            />
            {withdrawAmount && !isNaN(parseInt(withdrawAmount)) && (
              <Text style={styles.eurPreview}>
                ≈ €{(parseInt(withdrawAmount) * TOKEN_TO_EUR_RATE).toFixed(2)}
              </Text>
            )}
          </View>
        </View>

        {/* Withdrawal Methods */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Withdrawal Method</Text>
          {PAYOUT_METHODS.map((method) => {
            const tokens = parseInt(withdrawAmount) || 0;
            const { gross, fee, net } = calculatePayout(tokens, method.id);
            const isSelected = selectedMethod === method.id;

            return (
              <TouchableOpacity
                key={method.id}
                style={[styles.methodCard, isSelected && styles.methodCardSelected]}
                onPress={() => setSelectedMethod(method.id)}
              >
                <View style={styles.methodHeader}>
                  <View style={styles.methodInfo}>
                    <Text style={styles.methodIcon}>{method.icon}</Text>
                    <View>
                      <Text style={styles.methodName}>{method.name}</Text>
                      <Text style={styles.methodProcessing}>
                        {method.processingDays} business days
                      </Text>
                    </View>
                  </View>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>

                <View style={styles.methodDetails}>
                  <Text style={styles.methodFee}>
                    Fee: {method.feeType === 'flat' 
                      ? `€${method.flatFee?.toFixed(2)}` 
                      : `${method.feePercent}%`}
                  </Text>
                  <Text style={styles.methodLimits}>
                    Min: {method.minTokens} tokens (€{(method.minTokens * TOKEN_TO_EUR_RATE).toFixed(2)})
                  </Text>
                </View>

                {isSelected && tokens > 0 && tokens >= method.minTokens && (
                  <View style={styles.calculationBox}>
                    <View style={styles.calcRow}>
                      <Text style={styles.calcLabel}>Gross:</Text>
                      <Text style={styles.calcValue}>€{gross.toFixed(2)}</Text>
                    </View>
                    <View style={styles.calcRow}>
                      <Text style={styles.calcLabel}>Fee:</Text>
                      <Text style={styles.calcValue}>-€{fee.toFixed(2)}</Text>
                    </View>
                    <View style={[styles.calcRow, styles.calcRowTotal]}>
                      <Text style={styles.calcLabelTotal}>Net Payout:</Text>
                      <Text style={styles.calcValueTotal}>€{net.toFixed(2)}</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Withdraw Button */}
        <TouchableOpacity
          style={[
            styles.withdrawButton,
            (!selectedMethod || !withdrawAmount) && styles.withdrawButtonDisabled,
          ]}
          onPress={handleWithdraw}
          disabled={!selectedMethod || !withdrawAmount || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.withdrawButtonText}>Request Withdrawal</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          💡 Withdrawals are processed within the specified timeframe. Minimum balance of 100 tokens required.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    padding: 8,
  },
  backText: {
    color: '#FF6B6B',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  placeholder: {
    width: 50,
  },
  content: {
    padding: 16,
  },
  balanceCard: {
    backgroundColor: '#4CAF50',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  balanceLabel: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
  },
  balanceTokens: {
    color: '#fff',
    fontSize: 42,
    fontWeight: 'bold',
  },
  balanceEur: {
    color: '#fff',
    fontSize: 24,
    marginTop: 8,
  },
  conversionRate: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.8,
    marginTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  inputContainer: {
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  eurPreview: {
    fontSize: 14,
    color: '#4CAF50',
    marginTop: 8,
    textAlign: 'right',
    fontWeight: '600',
  },
  methodCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5E5E5',
  },
  methodCardSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8F4',
  },
  methodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  methodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  methodIcon: {
    fontSize: 32,
  },
  methodName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  methodProcessing: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  checkmark: {
    fontSize: 24,
    color: '#4CAF50',
  },
  methodDetails: {
    marginTop: 8,
    gap: 4,
  },
  methodFee: {
    fontSize: 14,
    color: '#666',
  },
  methodLimits: {
    fontSize: 12,
    color: '#999',
  },
  calculationBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  calcLabel: {
    fontSize: 14,
    color: '#666',
  },
  calcValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  calcRowTotal: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  calcLabelTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  calcValueTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  withdrawButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  withdrawButtonDisabled: {
    backgroundColor: '#CCC',
    opacity: 0.6,
  },
  withdrawButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
