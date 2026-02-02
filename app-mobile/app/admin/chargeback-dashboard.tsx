/**
 * PACK 3.4 — Admin Chargeback Dashboard
 * Store compliance: Admin-only read-only view of chargebacks
 * 
 * COMPLIANCE NOTES:
 * - READ-ONLY display - no modification actions
 * - Admin access required
 * - No business logic changes - visibility only
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, orderBy, limit, getDocs, where, Timestamp } from 'firebase/firestore';
import { db } from "@/lib/firebase";

interface ChargebackRecord {
  id: string;
  userId: string;
  transactionId: string;
  amount: number;
  currency: string;
  reason: string;
  stripeDisputeId?: string;
  status: 'open' | 'under_review' | 'won' | 'lost' | 'closed';
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  evidenceSubmitted: boolean;
  riskScore?: number;
}

interface ChargebackStats {
  total30d: number;
  totalOpen: number;
  totalWon: number;
  totalLost: number;
  totalAmount30d: number;
  averageResolutionDays: number;
  ratePercent: number;
}

type TabType = 'overview' | 'active' | 'history';
type StatusFilter = 'all' | 'open' | 'under_review' | 'won' | 'lost' | 'closed';

export default function ChargebackDashboardScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<ChargebackStats | null>(null);
  const [chargebacks, setChargebacks] = useState<ChargebackRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchUserId, setSearchUserId] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, [activeTab, statusFilter]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadStats(),
        loadChargebacks(),
      ]);
    } catch (error) {
      console.error('Error loading chargeback data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get recent chargebacks
      const recentQuery = query(
        collection(db, 'chargebacks'),
        where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo)),
        orderBy('createdAt', 'desc')
      );
      const recentSnapshot = await getDocs(recentQuery);

      // Get open chargebacks
      const openQuery = query(
        collection(db, 'chargebacks'),
        where('status', 'in', ['open', 'under_review'])
      );
      const openSnapshot = await getDocs(openQuery);

      // Get won chargebacks
      const wonQuery = query(
        collection(db, 'chargebacks'),
        where('status', '==', 'won'),
        where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo))
      );
      const wonSnapshot = await getDocs(wonQuery);

      // Get lost chargebacks
      const lostQuery = query(
        collection(db, 'chargebacks'),
        where('status', '==', 'lost'),
        where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo))
      );
      const lostSnapshot = await getDocs(lostQuery);

      // Calculate total amount
      let totalAmount = 0;
      let totalResolutionDays = 0;
      let resolvedCount = 0;

      recentSnapshot.forEach(doc => {
        const data = doc.data();
        totalAmount += data.amount || 0;
        
        if (data.resolvedAt && data.createdAt) {
          const createdMs = data.createdAt.toMillis();
          const resolvedMs = data.resolvedAt.toMillis();
          totalResolutionDays += (resolvedMs - createdMs) / (1000 * 60 * 60 * 24);
          resolvedCount++;
        }
      });

      // Get total transactions for rate calculation
      const transactionsQuery = query(
        collection(db, 'transactions'),
        where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo)),
        where('type', '==', 'payment')
      );
      const transactionsSnapshot = await getDocs(transactionsQuery);
      const chargebackRate = transactionsSnapshot.size > 0
        ? (recentSnapshot.size / transactionsSnapshot.size) * 100
        : 0;

      setStats({
        total30d: recentSnapshot.size,
        totalOpen: openSnapshot.size,
        totalWon: wonSnapshot.size,
        totalLost: lostSnapshot.size,
        totalAmount30d: totalAmount,
        averageResolutionDays: resolvedCount > 0 ? totalResolutionDays / resolvedCount : 0,
        ratePercent: chargebackRate,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadChargebacks = async () => {
    try {
      let chargebackQuery;

      if (statusFilter === 'all') {
        chargebackQuery = query(
          collection(db, 'chargebacks'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
      } else {
        chargebackQuery = query(
          collection(db, 'chargebacks'),
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
      }

      const snapshot = await getDocs(chargebackQuery);
      const records: ChargebackRecord[] = snapshot.docs.map(doc => {
        const data = doc.data() as Record<string, any>;
        return {
          id: doc.id,
          userId: data.userId || '',
          transactionId: data.transactionId || '',
          amount: data.amount || 0,
          currency: data.currency || 'USD',
          reason: data.reason || '',
          stripeDisputeId: data.stripeDisputeId,
          status: data.status || 'open',
          createdAt: data.createdAt,
          resolvedAt: data.resolvedAt,
          evidenceSubmitted: data.evidenceSubmitted || false,
          riskScore: data.riskScore,
        } as ChargebackRecord;
      });

      // Filter by userId if search is active
      const filtered = searchUserId
        ? records.filter(r => r.userId.toLowerCase().includes(searchUserId.toLowerCase()))
        : records;

      setChargebacks(filtered);
    } catch (error) {
      console.error('Error loading chargebacks:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'open': return '#FF9800';
      case 'under_review': return '#2196F3';
      case 'won': return '#4CAF50';
      case 'lost': return '#F44336';
      case 'closed': return '#9E9E9E';
      default: return '#666';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'open': return 'Open';
      case 'under_review': return 'Under Review';
      case 'won': return 'Won';
      case 'lost': return 'Lost';
      case 'closed': return 'Closed';
      default: return status;
    }
  };

  const formatCurrency = (amount: number, currency: string = 'USD'): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount / 100);
  };

  const formatDate = (timestamp: Timestamp): string => {
    return timestamp.toDate().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderOverview = () => (
    <View style={styles.overviewContainer}>
      {/* Stats Cards */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, styles.statCardWarning]}>
          <Text style={styles.statValue}>{stats?.total30d || 0}</Text>
          <Text style={styles.statLabel}>Last 30 Days</Text>
        </View>
        <View style={[styles.statCard, styles.statCardDanger]}>
          <Text style={styles.statValue}>{stats?.totalOpen || 0}</Text>
          <Text style={styles.statLabel}>Open Cases</Text>
        </View>
        <View style={[styles.statCard, styles.statCardSuccess]}>
          <Text style={styles.statValue}>{stats?.totalWon || 0}</Text>
          <Text style={styles.statLabel}>Won</Text>
        </View>
        <View style={[styles.statCard, styles.statCardError]}>
          <Text style={styles.statValue}>{stats?.totalLost || 0}</Text>
          <Text style={styles.statLabel}>Lost</Text>
        </View>
      </View>

      {/* Key Metrics */}
      <View style={styles.metricsSection}>
        <Text style={styles.metricsTitle}>Key Metrics</Text>
        
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Total Amount (30d)</Text>
          <Text style={styles.metricValue}>
            {formatCurrency(stats?.totalAmount30d || 0)}
          </Text>
        </View>
        
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Chargeback Rate</Text>
          <Text style={[
            styles.metricValue,
            (stats?.ratePercent || 0) > 1 && styles.metricDanger
          ]}>
            {(stats?.ratePercent || 0).toFixed(2)}%
          </Text>
        </View>
        
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Avg Resolution Time</Text>
          <Text style={styles.metricValue}>
            {(stats?.averageResolutionDays || 0).toFixed(1)} days
          </Text>
        </View>
      </View>

      {/* Risk Indicator */}
      <View style={styles.riskIndicator}>
        <Ionicons
          name={(stats?.ratePercent || 0) > 1 ? 'warning' : 'checkmark-circle'}
          size={24}
          color={(stats?.ratePercent || 0) > 1 ? '#FF9800' : '#4CAF50'}
        />
        <Text style={styles.riskText}>
          {(stats?.ratePercent || 0) > 1
            ? 'Chargeback rate exceeds 1% threshold - review recommended'
            : 'Chargeback rate within acceptable limits'}
        </Text>
      </View>
    </View>
  );

  const renderChargebackList = () => (
    <View style={styles.listContainer}>
      {/* Status Filter */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
      >
        {(['all', 'open', 'under_review', 'won', 'lost', 'closed'] as StatusFilter[]).map(status => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterChip,
              statusFilter === status && styles.filterChipActive
            ]}
            onPress={() => setStatusFilter(status)}
          >
            <Text style={[
              styles.filterChipText,
              statusFilter === status && styles.filterChipTextActive
            ]}>
              {status === 'all' ? 'All' : getStatusLabel(status)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by User ID..."
          value={searchUserId}
          onChangeText={setSearchUserId}
          onSubmitEditing={loadChargebacks}
        />
      </View>

      {/* Chargeback List */}
      {chargebacks.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-outline" size={48} color="#CCC" />
          <Text style={styles.emptyStateText}>No chargebacks found</Text>
        </View>
      ) : (
        chargebacks.map(chargeback => (
          <View key={chargeback.id} style={styles.chargebackCard}>
            <View style={styles.chargebackHeader}>
              <View style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(chargeback.status) }
              ]}>
                <Text style={styles.statusBadgeText}>
                  {getStatusLabel(chargeback.status)}
                </Text>
              </View>
              <Text style={styles.chargebackAmount}>
                {formatCurrency(chargeback.amount, chargeback.currency)}
              </Text>
            </View>
            
            <View style={styles.chargebackDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>User ID</Text>
                <Text style={styles.detailValue}>{chargeback.userId}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Transaction</Text>
                <Text style={styles.detailValue}>{chargeback.transactionId}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Reason</Text>
                <Text style={styles.detailValue}>{chargeback.reason}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Date</Text>
                <Text style={styles.detailValue}>
                  {formatDate(chargeback.createdAt)}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Evidence</Text>
                <Text style={[
                  styles.detailValue,
                  { color: chargeback.evidenceSubmitted ? '#4CAF50' : '#FF9800' }
                ]}>
                  {chargeback.evidenceSubmitted ? 'Submitted' : 'Pending'}
                </Text>
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Chargeback Dashboard',
          headerBackTitle: 'Back',
        }}
      />

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {(['overview', 'active', 'history'] as TabType[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading chargeback data...</Text>
          </View>
        ) : (
          <>
            {activeTab === 'overview' && renderOverview()}
            {(activeTab === 'active' || activeTab === 'history') && renderChargebackList()}
          </>
        )}

        {/* Read-Only Notice */}
        <View style={styles.readOnlyNotice}>
          <Ionicons name="eye-outline" size={16} color="#666" />
          <Text style={styles.readOnlyText}>
            Read-only view. Dispute handling is processed via Stripe Dashboard.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#666',
  },
  overviewContainer: {
    gap: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderLeftWidth: 4,
  },
  statCardWarning: {
    borderLeftColor: '#FF9800',
  },
  statCardDanger: {
    borderLeftColor: '#F44336',
  },
  statCardSuccess: {
    borderLeftColor: '#4CAF50',
  },
  statCardError: {
    borderLeftColor: '#E91E63',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  metricsSection: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
  },
  metricsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  metricLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  metricDanger: {
    color: '#F44336',
  },
  riskIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  riskText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  listContainer: {
    gap: 16,
  },
  filterScroll: {
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterChipText: {
    fontSize: 14,
    color: '#666',
  },
  filterChipTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  chargebackCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  chargebackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    color: '#FFF',
    fontWeight: '600',
  },
  chargebackAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  chargebackDetails: {
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  readOnlyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
    marginTop: 16,
  },
  readOnlyText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
});
