/**
 * PACK 321 — Transaction History Screen
 * View wallet transaction history with filters
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader } from "@/components/AppHeader";
import { colors, spacing, fontSizes, fontWeights } from "@/shared/theme";
import { auth, functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

interface WalletTransaction {
  txId: string;
  userId: string;
  type: 'PURCHASE' | 'SPEND' | 'EARN' | 'REFUND' | 'PAYOUT';
  source: string;
  amountTokens: number;
  beforeBalance: number;
  afterBalance: number;
  metadata: any;
  timestamp: any;
}

type FilterType = 'ALL' | 'PURCHASE' | 'SPEND' | 'EARN' | 'REFUND' | 'PAYOUT';

export default function TransactionsScreen() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('ALL');

  useEffect(() => {
    loadTransactions();
  }, [filter]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) return;

      const getHistory = httpsCallable(functions, 'pack277_getTransactionHistory');
      const result = await getHistory({
        limit: 50,
        type: filter === 'ALL' ? undefined : filter,
      });
      
      const data = result.data as any;
      if (data.success && data.transactions) {
        setTransactions(data.transactions);
      }
    } catch (err) {
      console.error('Load transactions error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadTransactions();
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'PURCHASE': return '💳';
      case 'SPEND': return '💸';
      case 'EARN': return '💰';
      case 'REFUND': return '↩️';
      case 'PAYOUT': return '🏦';
      default: return '📝';
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'PURCHASE': return colors.primary;
      case 'SPEND': return '#FF6B6B';
      case 'EARN': return '#51CF66';
      case 'REFUND': return '#FFA000';
      case 'PAYOUT': return '#9C27B0';
      default: return colors.textSecondary;
    }
  };

  const getTransactionTitle = (tx: WalletTransaction) => {
    switch (tx.type) {
      case 'PURCHASE': return 'Token Purchase';
      case 'SPEND': return `${tx.source} Payment`;
      case 'EARN': return `${tx.source} Earnings`;
      case 'REFUND': return `${tx.source} Refund`;
      case 'PAYOUT': return 'Payout Request';
      default: return 'Transaction';
    }
  };

  const FilterButton = ({ type, label }: { type: FilterType; label: string }) => (
    <TouchableOpacity
      style={[styles.filterButton, filter === type && styles.filterButtonActive]}
      onPress={() => setFilter(type)}
    >
      <Text style={[styles.filterText, filter === type && styles.filterTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const TransactionCard = ({ tx }: { tx: WalletTransaction }) => {
    const isPositive = ['PURCHASE', 'EARN', 'REFUND'].includes(tx.type);
    const color = getTransactionColor(tx.type);

    return (
      <View style={styles.txCard}>
        <View style={styles.txIcon}>
          <Text style={styles.txIconText}>{getTransactionIcon(tx.type)}</Text>
        </View>

        <View style={styles.txInfo}>
          <Text style={styles.txTitle}>{getTransactionTitle(tx)}</Text>
          <Text style={styles.txDate}>{formatDate(tx.timestamp)}</Text>
          {tx.metadata?.contextType && (
            <Text style={styles.txContext}>Context: {tx.metadata.contextType}</Text>
          )}
        </View>

        <View style={styles.txAmount}>
          <Text style={[styles.txAmountText, { color }]}>
            {isPositive ? '+' : ''}{tx.amountTokens.toLocaleString()}
          </Text>
          <Text style={styles.txAmountLabel}>tokens</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title="Transaction History"
        rightAction={
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.filtersContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          <FilterButton type="ALL" label="All" />
          <FilterButton type="PURCHASE" label="Purchases" />
          <FilterButton type="SPEND" label="Spent" />
          <FilterButton type="EARN" label="Earned" />
          <FilterButton type="REFUND" label="Refunds" />
          <FilterButton type="PAYOUT" label="Payouts" />
        </ScrollView>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>No transactions found</Text>
          <Text style={styles.emptySubtext}>
            {filter !== 'ALL'
              ? `You have no ${filter.toLowerCase()} transactions`
              : 'Your transaction history will appear here'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.txList}>
            {transactions.map((tx) => (
              <TransactionCard key={tx.txId} tx={tx} />
            ))}
          </View>
          <View style={{ height: spacing.xxxl }} />
        </ScrollView>
      )}
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  closeButton: {
    fontSize: 24,
    color: colors.textPrimary,
  },
  filtersContainer: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.textSecondary + '20',
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.textSecondary + '10',
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  filterTextActive: {
    color: colors.background,
    fontWeight: fontWeights.bold,
  },
  txList: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.textSecondary + '10',
    padding: spacing.md,
    borderRadius: 12,
  },
  txIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  txIconText: {
    fontSize: 24,
  },
  txInfo: {
    flex: 1,
  },
  txTitle: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  txDate: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  txContext: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  txAmount: {
    alignItems: 'flex-end',
  },
  txAmountText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  txAmountLabel: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
