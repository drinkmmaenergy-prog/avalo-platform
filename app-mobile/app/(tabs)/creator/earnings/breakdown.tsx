import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';

interface EarningTransaction {
  id: string;
  source: string;
  grossTokens: number;
  commission: number;
  netTokens: number;
  payerId: string;
  payerAvatar?: string;
  payerUsernameHidden: boolean;
  feature: string;
  timestamp: Timestamp;
}

interface SourceSummary {
  source: string;
  totalGross: number;
  totalNet: number;
  totalCommission: number;
  transactionCount: number;
  percentage: number;
}

const EARNING_SOURCES = [
  { id: 'chat', name: 'Chat Earnings', icon: 'chatbubbles', color: '#6366F1' },
  { id: 'calls', name: 'Paid Calls', icon: 'call', color: '#10B981' },
  { id: 'events', name: 'Events', icon: 'ticket', color: '#F59E0B' },
  { id: 'fanClub', name: 'Fan Club', icon: 'heart', color: '#EC4899' },
  { id: 'live', name: 'Live Broadcasts', icon: 'videocam', color: '#8B5CF6' },
  { id: 'digitalProducts', name: 'Digital Products', icon: 'images', color: '#3B82F6' },
  { id: 'tips', name: 'Tips', icon: 'gift', color: '#EF4444' },
];

export default function IncomeBreakdownScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [sourceSummaries, setSourceSummaries] = useState<SourceSummary[]>([]);
  const [transactions, setTransactions] = useState<EarningTransaction[]>([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('month');

  useEffect(() => {
    loadBreakdown();
  }, [period]);

  const loadBreakdown = async () => {
    try {
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'all':
          startDate = new Date(0); // Beginning of time
          break;
      }

      // Load all earnings
      const earningsRef = collection(db, `creators/${user?.uid}/earnings`);
      const earningsQuery = query(
        earningsRef,
        where('timestamp', '>=', Timestamp.fromDate(startDate)),
        orderBy('timestamp', 'desc')
      );
      const earningsSnapshot = await getDocs(earningsQuery);

      const allTransactions: EarningTransaction[] = earningsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as EarningTransaction));

      setTransactions(allTransactions);

      // Calculate summaries by source
      const summaryMap = new Map<string, SourceSummary>();
      let total = 0;

      allTransactions.forEach((transaction) => {
        const existing = summaryMap.get(transaction.source) || {
          source: transaction.source,
          totalGross: 0,
          totalNet: 0,
          totalCommission: 0,
          transactionCount: 0,
          percentage: 0,
        };

        existing.totalGross += transaction.grossTokens;
        existing.totalNet += transaction.netTokens;
        existing.totalCommission += transaction.commission;
        existing.transactionCount++;
        summaryMap.set(transaction.source, existing);

        total += transaction.netTokens;
      });

      // Calculate percentages
      const summaries = Array.from(summaryMap.values()).map((summary) => ({
        ...summary,
        percentage: total > 0 ? (summary.totalNet / total) * 100 : 0,
      }));

      // Sort by total net earnings
      summaries.sort((a, b) => b.totalNet - a.totalNet);

      setSourceSummaries(summaries);
      setTotalEarnings(total);
    } catch (error) {
      console.error('Error loading breakdown:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadBreakdown();
  };

  const getSourceConfig = (sourceId: string) => {
    return EARNING_SOURCES.find((s) => s.id === sourceId) || EARNING_SOURCES[0];
  };

  const getFilteredTransactions = () => {
    if (!selectedSource) return transactions;
    return transactions.filter((t) => t.source === selectedSource);
  };

  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#8B5CF6', '#EC4899']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Income Breakdown</Text>
        <Text style={styles.headerSubtitle}>Earnings by feature</Text>
      </LinearGradient>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {(['week', 'month', 'all'] as const).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodButton, period === p && styles.periodButtonActive]}
            onPress={() => setPeriod(p)}
          >
            <Text
              style={[
                styles.periodButtonText,
                period === p && styles.periodButtonTextActive,
              ]}
            >
              {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Total Earnings Card */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total Earnings</Text>
          <Text style={styles.totalAmount}>{totalEarnings.toLocaleString()}</Text>
          <Text style={styles.totalSubtext}>tokens (65% creator share)</Text>
        </View>

        {/* Source Summaries */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By Feature</Text>
          {sourceSummaries.map((summary) => {
            const config = getSourceConfig(summary.source);
            return (
              <TouchableOpacity
                key={summary.source}
                style={styles.sourceCard}
                onPress={() =>
                  setSelectedSource(selectedSource === summary.source ? null : summary.source)
                }
              >
                <View style={[styles.sourceIcon, { backgroundColor: `${config.color}20` }]}>
                  <Ionicons name={config.icon as any} size={24} color={config.color} />
                </View>
                <View style={styles.sourceInfo}>
                  <Text style={styles.sourceName}>{config.name}</Text>
                  <Text style={styles.sourceStats}>
                    {summary.transactionCount} transactions
                  </Text>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${summary.percentage}%`,
                          backgroundColor: config.color,
                        },
                      ]}
                    />
                  </View>
                </View>
                <View style={styles.sourceAmounts}>
                  <Text style={styles.sourceNet}>+{summary.totalNet.toLocaleString()}</Text>
                  <Text style={styles.sourcePercentage}>{summary.percentage.toFixed(1)}%</Text>
                </View>
                <Ionicons
                  name={
                    selectedSource === summary.source ? 'chevron-up' : 'chevron-down'
                  }
                  size={20}
                  color="#9CA3AF"
                />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Transaction Details */}
        {selectedSource && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {getSourceConfig(selectedSource).name} Transactions
            </Text>
            {getFilteredTransactions().map((transaction) => (
              <View key={transaction.id} style={styles.transactionCard}>
                <View style={styles.transactionHeader}>
                  <Text style={styles.transactionFeature}>{transaction.feature}</Text>
                  <Text style={styles.transactionDate}>
                    {formatDate(transaction.timestamp)}
                  </Text>
                </View>
                <View style={styles.transactionAmounts}>
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Gross:</Text>
                    <Text style={styles.amountValue}>
                      {transaction.grossTokens} tokens
                    </Text>
                  </View>
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Commission (35%):</Text>
                    <Text style={[styles.amountValue, styles.commissionValue]}>
                      -{transaction.commission} tokens
                    </Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabelBold}>Net Earnings (65%):</Text>
                    <Text style={[styles.amountValue, styles.netValue]}>
                      +{transaction.netTokens} tokens
                    </Text>
                  </View>
                </View>
                {!transaction.payerUsernameHidden && (
                  <View style={styles.payerBadge}>
                    <Ionicons name="person" size={12} color="#6B7280" />
                    <Text style={styles.payerText}>From supporter</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Commission Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle" size={24} color="#6366F1" />
            <Text style={styles.infoTitle}>Commission Structure</Text>
          </View>
          <Text style={styles.infoText}>
            • All earnings show gross tokens received{'\n'}
            • Avalo retains 35% platform commission{'\n'}
            • You receive 65% as net creator earnings{'\n'}
            • Commission is locked and never reduced by refunds
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
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
  periodSelector: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#6366F1',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  totalCard: {
    margin: 16,
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  totalLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  totalAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#111827',
  },
  totalSubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  section: {
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 12,
  },
  sourceIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sourceInfo: {
    flex: 1,
  },
  sourceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  sourceStats: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  sourceAmounts: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  sourceNet: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10B981',
  },
  sourcePercentage: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  transactionCard: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 12,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  transactionFeature: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  transactionDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  transactionAmounts: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  amountLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  amountLabelBold: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  amountValue: {
    fontSize: 14,
    color: '#111827',
  },
  commissionValue: {
    color: '#EF4444',
  },
  netValue: {
    fontWeight: 'bold',
    color: '#10B981',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  payerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  payerText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },
  infoCard: {
    margin: 16,
    padding: 20,
    backgroundColor: '#EEF2FF',
    borderRadius: 16,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 22,
  },
});
