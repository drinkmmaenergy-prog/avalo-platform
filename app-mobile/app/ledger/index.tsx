/**
 * PACK 148 - Ledger Overview Screen
 * Main dashboard for user's blockchain transaction ledger
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

interface LedgerStats {
  totalSent: number;
  totalReceived: number;
  transactionCount: number;
  verifiedCount: number;
}

interface RecentTransaction {
  id: string;
  transactionId: string;
  productType: string;
  tokenAmount: number;
  status: string;
  timestamp: Date;
  blockchainHash: string;
  verified: boolean;
}

interface PayoutSummary {
  totalEarned: number;
  totalPaidOut: number;
  pendingPayout: number;
  verificationRate: number;
}

export default function LedgerOverviewScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<LedgerStats | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [payoutSummary, setPayoutSummary] = useState<PayoutSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLedgerData = async () => {
    try {
      setError(null);
      const getLedgerOverview = httpsCallable(functions, 'getLedgerOverviewEndpoint');
      const result = await getLedgerOverview({});
      
      const data = result.data as any;
      
      if (data.success) {
        // Map stats
        const statsData = data.stats?.asCreator || data.stats?.asUser || {};
        setStats({
          totalSent: statsData.totalSpent || 0,
          totalReceived: statsData.totalEarned || 0,
          transactionCount: statsData.totalTransactions || 0,
          verifiedCount: Math.floor((statsData.verificationRate || 0) / 100 * (statsData.totalTransactions || 0)),
        });
        
        setRecentTransactions(data.recentTransactions || []);
        setPayoutSummary(data.payoutSummary || null);
      }
    } catch (err: any) {
      console.error('Error loading ledger overview:', err);
      setError(err.message || 'Failed to load ledger data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLedgerData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadLedgerData();
  };

  const formatProductType = (type: string): string => {
    const typeMap: { [key: string]: string } = {
      chat: '💬 Chat',
      call: '📞 Call',
      product: '📦 Product',
      event: '🎫 Event',
      club: '👥 Club',
      challenge: '🏆 Challenge',
      mentorship: '🎓 Mentorship',
      subscription: '⭐ Subscription',
      gift: '🎁 Gift',
      post: '📝 Post',
      media_unlock: '🔓 Media',
      ads: '📢 Ads',
    };
    return typeMap[type] || type;
  };

  const formatStatus = (status: string): { text: string; color: string } => {
    const statusMap: { [key: string]: { text: string; color: string } } = {
      pending: { text: 'Pending', color: '#FFA500' },
      escrowed: { text: 'In Escrow', color: '#3B82F6' },
      completed: { text: 'Completed', color: '#10B981' },
      refunded: { text: 'Refunded', color: '#EF4444' },
      disputed: { text: 'Disputed', color: '#F59E0B' },
      cancelled: { text: 'Cancelled', color: '#6B7280' },
    };
    return statusMap[status] || { text: status, color: '#6B7280' };
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading ledger...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadLedgerData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Blockchain Ledger</Text>
        <Text style={styles.headerSubtitle}>
          Transparent · Immutable · Auditable
        </Text>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Earned</Text>
          <Text style={styles.statValue}>{stats?.totalReceived.toFixed(0)} 🪙</Text>
          <Text style={styles.statSubtext}>Tokens received</Text>
        </View>
        
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Spent</Text>
          <Text style={styles.statValue}>{stats?.totalSent.toFixed(0)} 🪙</Text>
          <Text style={styles.statSubtext}>Tokens sent</Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Transactions</Text>
          <Text style={styles.statValue}>{stats?.transactionCount || 0}</Text>
          <Text style={styles.statSubtext}>Total recorded</Text>
        </View>
        
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Verified</Text>
          <Text style={styles.statValue}>
            {stats?.verifiedCount || 0}/{stats?.transactionCount || 0}
          </Text>
          <Text style={styles.statSubtext}>On blockchain</Text>
        </View>
      </View>

      {/* Payout Summary */}
      {payoutSummary && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payout Summary</Text>
          <View style={styles.payoutCard}>
            <View style={styles.payoutRow}>
              <Text style={styles.payoutLabel}>Total Earned (65%):</Text>
              <Text style={styles.payoutValue}>
                {payoutSummary.totalEarned.toFixed(0)} 🪙
              </Text>
            </View>
            <View style={styles.payoutRow}>
              <Text style={styles.payoutLabel}>Paid Out:</Text>
              <Text style={[styles.payoutValue, { color: '#10B981' }]}>
                {payoutSummary.totalPaidOut.toFixed(0)} 🪙
              </Text>
            </View>
            <View style={styles.payoutRow}>
              <Text style={styles.payoutLabel}>Pending:</Text>
              <Text style={[styles.payoutValue, { color: '#F59E0B' }]}>
                {payoutSummary.pendingPayout.toFixed(0)} 🪙
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.payoutRow}>
              <Text style={styles.payoutLabel}>Verification Rate:</Text>
              <Text style={styles.payoutValue}>
                {payoutSummary.verificationRate.toFixed(1)}%
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Recent Transactions */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <TouchableOpacity onPress={() => router.push('/ledger/transactions')}>
            <Text style={styles.seeAllText}>See All →</Text>
          </TouchableOpacity>
        </View>

        {recentTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No transactions yet</Text>
          </View>
        ) : (
          recentTransactions.map((tx) => {
            const statusInfo = formatStatus(tx.status);
            return (
              <TouchableOpacity
                key={tx.id}
                style={styles.transactionCard}
                onPress={() => router.push({
                  pathname: '/ledger/transaction-details',
                  params: { transactionId: tx.transactionId }
                })}
              >
                <View style={styles.transactionHeader}>
                  <Text style={styles.transactionType}>
                    {formatProductType(tx.productType)}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '20' }]}>
                    <Text style={[styles.statusText, { color: statusInfo.color }]}>
                      {statusInfo.text}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.transactionBody}>
                  <View style={styles.transactionRow}>
                    <Text style={styles.transactionLabel}>Amount:</Text>
                    <Text style={styles.transactionValue}>
                      {tx.tokenAmount} 🪙
                    </Text>
                  </View>
                  
                  <View style={styles.transactionRow}>
                    <Text style={styles.transactionLabel}>Blockchain:</Text>
                    <View style={styles.verificationContainer}>
                      <Text style={styles.hashText}>
                        {tx.blockchainHash.substring(0, 12)}...
                      </Text>
                      {tx.verified ? (
                        <Text style={styles.verifiedBadge}>✓ Verified</Text>
                      ) : (
                        <Text style={styles.unverifiedBadge}>⚠ Unverified</Text>
                      )}
                    </View>
                  </View>
                  
                  <Text style={styles.transactionDate}>
                    {new Date(tx.timestamp).toLocaleString()}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/ledger/transactions')}
        >
          <Text style={styles.actionButtonText}>📊 View All Transactions</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/ledger/export')}
        >
          <Text style={styles.actionButtonText}>📥 Export Reports</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/ledger/verify')}
        >
          <Text style={styles.actionButtonText}>🔍 Verify Blockchain</Text>
        </TouchableOpacity>
      </View>

      {/* Footer Notice */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          🔒 All transactions are recorded on Avalo's immutable blockchain ledger
        </Text>
        <Text style={styles.footerSubtext}>
          Tokens are internal currency only • No crypto speculation • 65/35 revenue split
        </Text>
      </View>
    </ScrollView>
  );
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
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 2,
  },
  statSubtext: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  seeAllText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  payoutCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  payoutLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  payoutValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  transactionCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  transactionType: {
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
  },
  transactionBody: {
    gap: 8,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  transactionValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  verificationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hashText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#6B7280',
  },
  verifiedBadge: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
  },
  unverifiedBadge: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '600',
  },
  transactionDate: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  actionsSection: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    marginBottom: 40,
  },
  footerText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
