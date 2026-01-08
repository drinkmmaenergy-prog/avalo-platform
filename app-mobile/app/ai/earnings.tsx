/**
 * PACK 279E — AI Creator Earnings Dashboard
 * Mobile screen for AI creators to track earnings from chat/voice/video
 * Read-only analytics displaying real earnings from PACK 277
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
  Dimensions,
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
  Timestamp,
} from 'firebase/firestore';
import { db } from "@/lib/firebase";

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface EarningTransaction {
  id: string;
  date: Date;
  aiName: string;
  type: 'chat' | 'voice' | 'video';
  tokensEarned: number;
  plnValue: number;
}

interface EarningsData {
  totalTokens: number;
  totalPLN: number;
  todayTokens: number;
  todayPLN: number;
  last7DaysTokens: number;
  last7DaysPLN: number;
  last30DaysTokens: number;
  last30DaysPLN: number;
  chatEarnings: number;
  voiceEarnings: number;
  videoEarnings: number;
  transactions: EarningTransaction[];
}

const TOKEN_TO_PLN = 0.20; // 1 Token = 0.20 PLN
const CREATOR_SHARE = 0.65; // 65% to creator
const AVALO_SHARE = 0.35; // 35% to Avalo

export default function AIEarningsDashboardScreen() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | '7days' | '30days'>('7days');

  useEffect(() => {
    if (user) {
      loadEarnings();
    }
  }, [user]);

  const loadEarnings = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Fetch AI companion earnings
      const earningsRef = collection(db, 'aiCompanionEarnings');
      const earningsQuery = query(
        earningsRef,
        where('creatorId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(100)
      );

      const earningsSnapshot = await getDocs(earningsQuery);
      const allEarnings = earningsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
      }));

      // Calculate totals
      let totalTokens = 0;
      let todayTokens = 0;
      let last7DaysTokens = 0;
      let last30DaysTokens = 0;
      let chatEarnings = 0;
      let voiceEarnings = 0;
      let videoEarnings = 0;

      const transactions: EarningTransaction[] = [];

      allEarnings.forEach((earning: any) => {
        const earnedTokens = earning.creatorShare || 0;
        const createdAt = earning.createdAt;

        totalTokens += earnedTokens;

        if (createdAt >= todayStart) {
          todayTokens += earnedTokens;
        }
        if (createdAt >= last7Days) {
          last7DaysTokens += earnedTokens;
        }
        if (createdAt >= last30Days) {
          last30DaysTokens += earnedTokens;
        }

        // Categorize by type
        const type = earning.sessionType || 'chat';
        if (type === 'chat') chatEarnings += earnedTokens;
        else if (type === 'voice') voiceEarnings += earnedTokens;
        else if (type === 'video') videoEarnings += earnedTokens;

        // Add to transactions list (last 20)
        if (transactions.length < 20) {
          transactions.push({
            id: earning.id,
            date: createdAt,
            aiName: earning.aiName || 'AI Companion',
            type: type,
            tokensEarned: earnedTokens,
            plnValue: earnedTokens * TOKEN_TO_PLN,
          });
        }
      });

      setEarnings({
        totalTokens,
        totalPLN: totalTokens * TOKEN_TO_PLN,
        todayTokens,
        todayPLN: todayTokens * TOKEN_TO_PLN,
        last7DaysTokens,
        last7DaysPLN: last7DaysTokens * TOKEN_TO_PLN,
        last30DaysTokens,
        last30DaysPLN: last30DaysTokens * TOKEN_TO_PLN,
        chatEarnings,
        voiceEarnings,
        videoEarnings,
        transactions,
      });
    } catch (error) {
      console.error('Error loading AI earnings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadEarnings();
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
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'chat': return 'message-text';
      case 'voice': return 'phone';
      case 'video': return 'video';
      default: return 'currency-usd';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'chat': return '#007AFF';
      case 'voice': return '#34C759';
      case 'video': return '#FF3B30';
      default: return '#8E8E93';
    }
  };

  if (loading && !earnings) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading earnings...</Text>
      </View>
    );
  }

  const selectedEarnings = selectedPeriod === 'today' 
    ? { tokens: earnings?.todayTokens || 0, pln: earnings?.todayPLN || 0 }
    : selectedPeriod === '7days'
    ? { tokens: earnings?.last7DaysTokens || 0, pln: earnings?.last7DaysPLN || 0 }
    : { tokens: earnings?.last30DaysTokens || 0, pln: earnings?.last30DaysPLN || 0 };

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
        <Text style={styles.headerTitle}>AI Creator Earnings</Text>
        <Text style={styles.headerSubtitle}>
          Track your AI companion revenue
        </Text>
      </View>

      {/* Total Earnings Card */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Earned</Text>
        <Text style={styles.totalValue}>
          {formatTokens(earnings?.totalTokens || 0)} tokens
        </Text>
        <Text style={styles.totalPLN}>
          ≈ {formatPLN(earnings?.totalPLN || 0)} PLN
        </Text>
        <TouchableOpacity
          style={styles.payoutButton}
          onPress={() => router.push('/ai/payouts' as any)}
        >
          <MaterialCommunityIcons name="cash-multiple" size={20} color="#FFFFFF" />
          <Text style={styles.payoutButtonText}>Request Payout</Text>
        </TouchableOpacity>
      </View>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        <TouchableOpacity
          style={[
            styles.periodButton,
            selectedPeriod === 'today' && styles.periodButtonActive,
          ]}
          onPress={() => setSelectedPeriod('today')}
        >
          <Text
            style={[
              styles.periodButtonText,
              selectedPeriod === 'today' && styles.periodButtonTextActive,
            ]}
          >
            Today
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.periodButton,
            selectedPeriod === '7days' && styles.periodButtonActive,
          ]}
          onPress={() => setSelectedPeriod('7days')}
        >
          <Text
            style={[
              styles.periodButtonText,
              selectedPeriod === '7days' && styles.periodButtonTextActive,
            ]}
          >
            Last 7 Days
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.periodButton,
            selectedPeriod === '30days' && styles.periodButtonActive,
          ]}
          onPress={() => setSelectedPeriod('30days')}
        >
          <Text
            style={[
              styles.periodButtonText,
              selectedPeriod === '30days' && styles.periodButtonTextActive,
            ]}
          >
            Last 30 Days
          </Text>
        </TouchableOpacity>
      </View>

      {/* Selected Period Earnings */}
      <View style={styles.periodCard}>
        <Text style={styles.periodLabel}>
          {selectedPeriod === 'today' ? 'Today' : selectedPeriod === '7days' ? 'Last 7 Days' : 'Last 30 Days'}
        </Text>
        <Text style={styles.periodValue}>
          {formatTokens(selectedEarnings.tokens)} tokens
        </Text>
        <Text style={styles.periodPLN}>
          ≈ {formatPLN(selectedEarnings.pln)} PLN
        </Text>
      </View>

      {/* Revenue Split Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Revenue Split</Text>
        <View style={styles.splitCard}>
          <View style={styles.splitRow}>
            <Text style={styles.splitLabel}>AI Chat</Text>
            <View style={styles.splitValues}>
              <Text style={styles.splitCreator}>65% Creator</Text>
              <Text style={styles.splitAvalo}>35% Avalo</Text>
            </View>
          </View>
          <View style={styles.splitRow}>
            <Text style={styles.splitLabel}>AI Voice</Text>
            <View style={styles.splitValues}>
              <Text style={styles.splitCreator}>65% Creator</Text>
              <Text style={styles.splitAvalo}>35% Avalo</Text>
            </View>
          </View>
          <View style={styles.splitRow}>
            <Text style={styles.splitLabel}>AI Video</Text>
            <View style={styles.splitValues}>
              <Text style={styles.splitCreator}>65% Creator</Text>
              <Text style={styles.splitAvalo}>35% Avalo</Text>
            </View>
          </View>
          <View style={[styles.splitRow, styles.splitRowLast]}>
            <Text style={styles.splitLabel}>Avalo AI</Text>
            <View style={styles.splitValues}>
              <Text style={styles.splitAvalo}>100% Avalo</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Performance by Type */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance by Type</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="message-text" size={32} color="#007AFF" />
            <Text style={styles.statValue}>
              {formatTokens(earnings?.chatEarnings || 0)}
            </Text>
            <Text style={styles.statLabel}>Chat Earnings</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="phone" size={32} color="#34C759" />
            <Text style={styles.statValue}>
              {formatTokens(earnings?.voiceEarnings || 0)}
            </Text>
            <Text style={styles.statLabel}>Voice Earnings</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="video" size={32} color="#FF3B30" />
            <Text style={styles.statValue}>
              {formatTokens(earnings?.videoEarnings || 0)}
            </Text>
            <Text style={styles.statLabel}>Video Earnings</Text>
          </View>
        </View>
      </View>

      {/* Recent Transactions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Transactions (Last 20)</Text>
        {earnings?.transactions && earnings.transactions.length > 0 ? (
          <View style={styles.transactionsList}>
            {earnings.transactions.map((transaction) => (
              <View key={transaction.id} style={styles.transactionCard}>
                <View style={[styles.typeIcon, { backgroundColor: getTypeColor(transaction.type) + '20' }]}>
                  <MaterialCommunityIcons
                    name={getTypeIcon(transaction.type)}
                    size={20}
                    color={getTypeColor(transaction.type)}
                  />
                </View>
                <View style={styles.transactionInfo}>
                  <Text style={styles.transactionAI}>{transaction.aiName}</Text>
                  <Text style={styles.transactionDate}>{formatDate(transaction.date)}</Text>
                </View>
                <View style={styles.transactionAmount}>
                  <Text style={styles.transactionTokens}>
                    +{formatTokens(transaction.tokensEarned)} tokens
                  </Text>
                  <Text style={styles.transactionPLN}>
                    {formatPLN(transaction.plnValue)} PLN
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="currency-usd-off" size={48} color="#CCC" />
            <Text style={styles.emptyStateText}>No earnings yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Earnings will appear here when users interact with your AI companions
            </Text>
          </View>
        )}
      </View>

      {/* Footer Info */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          💰 Payout Rate: 1 Token = {TOKEN_TO_PLN.toFixed(2)} PLN
        </Text>
        <Text style={styles.footerText}>
          📊 Revenue shown is creator share ({CREATOR_SHARE * 100}%) after platform fee
        </Text>
        <Text style={styles.footerText}>
          🔒 Minimum payout: 1000 tokens = 200 PLN
        </Text>
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
  totalCard: {
    margin: 16,
    padding: 24,
    backgroundColor: '#007AFF',
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  totalLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 8,
  },
  totalValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  totalPLN: {
    fontSize: 18,
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 20,
  },
  payoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  payoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  periodSelector: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodButtonActive: {
    backgroundColor: '#007AFF',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  periodCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  periodLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  periodValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  periodPLN: {
    fontSize: 16,
    color: '#666',
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
  splitCard: {
    gap: 12,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  splitRowLast: {
    borderBottomWidth: 0,
  },
  splitLabel: {
    fontSize: 15,
    color: '#000',
    fontWeight: '500',
  },
  splitValues: {
    flexDirection: 'row',
    gap: 12,
  },
  splitCreator: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '600',
  },
  splitAvalo: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  transactionsList: {
    gap: 12,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    gap: 12,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionInfo: {
    flex: 1,
  },
  transactionAI: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 13,
    color: '#666',
  },
  transactionAmount: {
    alignItems: 'flex-end',
  },
  transactionTokens: {
    fontSize: 15,
    fontWeight: '600',
    color: '#34C759',
    marginBottom: 2,
  },
  transactionPLN: {
    fontSize: 13,
    color: '#666',
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
    paddingHorizontal: 20,
  },
  footer: {
    padding: 20,
    marginBottom: 40,
    gap: 8,
  },
  footerText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});
