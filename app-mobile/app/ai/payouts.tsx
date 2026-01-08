/**
 * PACK 279E — AI Creator Payout Screen
 * Request payouts for AI companion earnings
 * Minimum payout: 1000 tokens = 200 PLN
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getAuth } from 'firebase/auth';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  getDoc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from "@/lib/firebase";

const MIN_PAYOUT_TOKENS = 1000;
const TOKEN_TO_PLN = 0.20;
const MIN_PAYOUT_PLN = MIN_PAYOUT_TOKENS * TOKEN_TO_PLN; // 200 PLN

interface PayoutRequest {
  id: string;
  requestedAt: Date;
  tokens: number;
  plnValue: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  completedAt?: Date;
}

export default function AIPayoutScreen() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [availableTokens, setAvailableTokens] = useState(0);
  const [lockedTokens, setLockedTokens] = useState(0);
  const [payoutHistory, setPayoutHistory] = useState<PayoutRequest[]>([]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Load wallet balance
      const walletRef = doc(db, 'wallets', user.uid);
      const walletSnap = await getDoc(walletRef);
      
      if (walletSnap.exists()) {
        const walletData = walletSnap.data();
        setAvailableTokens(walletData.availableTokens || 0);
        setLockedTokens(walletData.lockedTokens || 0);
      }

      // Load payout history
      const payoutsRef = collection(db, 'payoutRequests');
      const payoutsQuery = query(
        payoutsRef,
        where('userId', '==', user.uid),
        where('type', '==', 'ai_creator'),
        orderBy('requestedAt', 'desc'),
        limit(20)
      );

      const payoutsSnapshot = await getDocs(payoutsQuery);
      const payouts = payoutsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        requestedAt: doc.data().requestedAt?.toDate(),
        completedAt: doc.data().completedAt?.toDate(),
      })) as PayoutRequest[];

      setPayoutHistory(payouts);
    } catch (error) {
      console.error('Error loading payout data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleRequestPayout = async () => {
    if (!user) return;

    if (availableTokens < MIN_PAYOUT_TOKENS) {
      Alert.alert(
        'Insufficient Balance',
        `Minimum payout is ${MIN_PAYOUT_TOKENS} tokens (${MIN_PAYOUT_PLN} PLN). You currently have ${availableTokens.toLocaleString()} tokens.`,
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Request Payout',
      `Request payout of ${availableTokens.toLocaleString()} tokens (≈${formatPLN(availableTokens * TOKEN_TO_PLN)} PLN)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
            try {
              setRequesting(true);

              const functions = getFunctions();
              const requestPayout = httpsCallable(functions, 'pack277_requestPayout');
              
              const result = await requestPayout({
                tokens: availableTokens,
                type: 'ai_creator',
              });

              Alert.alert(
                'Success',
                'Payout request submitted successfully. You will receive your payment within 2-5 business days.',
                [{ text: 'OK' }]
              );

              // Reload data
              await loadData();
            } catch (error: any) {
              console.error('Error requesting payout:', error);
              Alert.alert(
                'Error',
                error.message || 'Failed to request payout. Please try again.',
                [{ text: 'OK' }]
              );
            } finally {
              setRequesting(false);
            }
          },
        },
      ]
    );
  };

  const formatTokens = (tokens: number) => {
    return tokens.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  const formatPLN = (pln: number) => {
    return pln.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#34C759';
      case 'processing': return '#FF9500';
      case 'pending': return '#007AFF';
      case 'cancelled': return '#FF3B30';
      default: return '#8E8E93';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return 'check-circle';
      case 'processing': return 'clock-outline';
      case 'pending': return 'clock-alert-outline';
      case 'cancelled': return 'close-circle';
      default: return 'help-circle';
    }
  };

  const canRequestPayout = availableTokens >= MIN_PAYOUT_TOKENS;

  if (loading && availableTokens === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading payout information...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request Payout</Text>
        <Text style={styles.headerSubtitle}>
          Transfer your AI earnings to your bank account
        </Text>
      </View>

      {/* Wallet Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available for Payout</Text>
        <Text style={styles.balanceValue}>
          {formatTokens(availableTokens)} tokens
        </Text>
        <Text style={styles.balancePLN}>
          ≈ {formatPLN(availableTokens * TOKEN_TO_PLN)} PLN
        </Text>

        {lockedTokens > 0 && (
          <View style={styles.lockedInfo}>
            <MaterialCommunityIcons name="lock" size={16} color="#FF9500" />
            <Text style={styles.lockedText}>
              {formatTokens(lockedTokens)} tokens locked (pending settlements)
            </Text>
          </View>
        )}
      </View>

      {/* Minimum Payout Notice */}
      <View style={styles.noticeCard}>
        <MaterialCommunityIcons name="information" size={24} color="#007AFF" />
        <View style={styles.noticeContent}>
          <Text style={styles.noticeTitle}>Minimum Payout</Text>
          <Text style={styles.noticeText}>
            {MIN_PAYOUT_TOKENS} tokens = {MIN_PAYOUT_PLN} PLN
          </Text>
          {!canRequestPayout && (
            <Text style={styles.noticeWarning}>
              You need {(MIN_PAYOUT_TOKENS - availableTokens).toLocaleString()} more tokens to request a payout
            </Text>
          )}
        </View>
      </View>

      {/* Request Payout Button */}
      <View style={styles.actionSection}>
        <TouchableOpacity
          style={[
            styles.requestButton,
            (!canRequestPayout || requesting) && styles.requestButtonDisabled,
          ]}
          onPress={handleRequestPayout}
          disabled={!canRequestPayout || requesting}
        >
          {requesting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="cash-multiple" size={24} color="#FFFFFF" />
              <Text style={styles.requestButtonText}>
                {canRequestPayout ? 'Request Payout' : 'Insufficient Balance'}
              </Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.requestNote}>
          Payouts are processed within 2-5 business days
        </Text>
      </View>

      {/* Payout History */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payout History</Text>
        {payoutHistory.length > 0 ? (
          <View style={styles.historyList}>
            {payoutHistory.map((payout) => (
              <View key={payout.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(payout.status) + '20' }]}>
                    <MaterialCommunityIcons
                      name={getStatusIcon(payout.status)}
                      size={16}
                      color={getStatusColor(payout.status)}
                    />
                    <Text style={[styles.statusText, { color: getStatusColor(payout.status) }]}>
                      {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                    </Text>
                  </View>
                  <Text style={styles.historyDate}>
                    {formatDate(payout.requestedAt)}
                  </Text>
                </View>
                <View style={styles.historyAmount}>
                  <Text style={styles.historyTokens}>
                    {formatTokens(payout.tokens)} tokens
                  </Text>
                  <Text style={styles.historyPLN}>
                    {formatPLN(payout.plnValue)} PLN
                  </Text>
                </View>
                {payout.completedAt && (
                  <Text style={styles.completedDate}>
                    Completed: {formatDate(payout.completedAt)}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="wallet-outline" size={48} color="#CCC" />
            <Text style={styles.emptyStateText}>No payout requests yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Your payout history will appear here
            </Text>
          </View>
        )}
      </View>

      {/* Important Info */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>💡 Important Information</Text>
        <View style={styles.infoList}>
          <View style={styles.infoItem}>
            <MaterialCommunityIcons name="check-circle" size={20} color="#34C759" />
            <Text style={styles.infoText}>
              Payouts are processed to your verified bank account
            </Text>
          </View>
          <View style={styles.infoItem}>
            <MaterialCommunityIcons name="check-circle" size={20} color="#34C759" />
            <Text style={styles.infoText}>
              Processing time: 2-5 business days
            </Text>
          </View>
          <View style={styles.infoItem}>
            <MaterialCommunityIcons name="check-circle" size={20} color="#34C759" />
            <Text style={styles.infoText}>
              Conversion rate: 1 Token = {TOKEN_TO_PLN.toFixed(2)} PLN
            </Text>
          </View>
          <View style={styles.infoItem}>
            <MaterialCommunityIcons name="check-circle" size={20} color="#34C759" />
            <Text style={styles.infoText}>
              Minimum payout: {MIN_PAYOUT_TOKENS} tokens
            </Text>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Ensure your tax profile and bank details are up to date before requesting a payout.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/profile/earnings-taxes' as any)}
        >
          <Text style={styles.footerLink}>
            Manage Tax Profile →
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#666',
  },
  balanceCard: {
    margin: 16,
    padding: 24,
    backgroundColor: '#34C759',
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  balancePLN: {
    fontSize: 18,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  lockedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
    gap: 8,
  },
  lockedText: {
    fontSize: 13,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  noticeCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#E7F3FF',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
  },
  noticeContent: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#004085',
    marginBottom: 4,
  },
  noticeText: {
    fontSize: 14,
    color: '#004085',
    fontWeight: '500',
  },
  noticeWarning: {
    fontSize: 13,
    color: '#FF3B30',
    marginTop: 8,
    fontWeight: '500',
  },
  actionSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  requestButtonDisabled: {
    backgroundColor: '#CCC',
    shadowOpacity: 0,
    elevation: 0,
  },
  requestButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  requestNote: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16,
  },
  historyList: {
    gap: 12,
  },
  historyCard: {
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  historyDate: {
    fontSize: 13,
    color: '#666',
  },
  historyAmount: {
    marginBottom: 8,
  },
  historyTokens: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  historyPLN: {
    fontSize: 15,
    color: '#666',
  },
  completedDate: {
    fontSize: 13,
    color: '#34C759',
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  infoSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#FFFBF0',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE066',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 12,
  },
  infoList: {
    gap: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    marginBottom: 40,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  footerLink: {
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '600',
  },
});
