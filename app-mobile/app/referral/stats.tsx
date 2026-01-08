/**
 * PACK 355 - Referral & Invite Engine
 * Detailed Stats Screen
 * 
 * Features:
 * - Earn tracker
 * - Invite history
 * - Reward history
 * - Locked rewards with explanation
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

interface ReferralStats {
  userId: string;
  totalInvites: number;
  convertedInvites: number;
  totalRewardsTokens: number;
  flaggedAttempts: number;
  viralCoefficient?: number;
}

interface Referral {
  referralId: string;
  referrerUserId: string;
  invitedUserId: string;
  type: string;
  countryCode: string;
  createdAt: any;
  activatedAt?: any;
  status: 'PENDING' | 'ACTIVE' | 'LOCKED' | 'FRAUD';
  rewardUnlocked: boolean;
}

export default function ReferralStatsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');

  useEffect(() => {
    loadStatsData();
  }, []);

  const loadStatsData = async () => {
    try {
      setLoading(true);

      // Get stats
      const getStatsFn = httpsCallable(functions, 'getMyReferralStats');
      const statsResult = await getStatsFn({});
      setStats((statsResult.data as any).stats);

      // Get history
      const getHistoryFn = httpsCallable(functions, 'getMyReferralHistory');
      const historyResult = await getHistoryFn({ limit: 50 });
      setReferrals((historyResult.data as any).referrals);
    } catch (error) {
      console.error('Error loading stats:', error);
      Alert.alert('Error', 'Failed to load referral stats');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return '#4CAF50';
      case 'PENDING':
        return '#FF9800';
      case 'LOCKED':
        return '#9E9E9E';
      case 'FRAUD':
        return '#F44336';
      default:
        return '#999';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'checkmark-circle';
      case 'PENDING':
        return 'time';
      case 'LOCKED':
        return 'lock-closed';
      case 'FRAUD':
        return 'warning';
      default:
        return 'help-circle';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'Active - Reward Earned';
      case 'PENDING':
        return 'Pending Verification';
      case 'LOCKED':
        return 'Locked by Admin';
      case 'FRAUD':
        return 'Flagged as Suspicious';
      default:
        return 'Unknown';
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderReferralItem = ({ item }: { item: Referral }) => (
    <View style={styles.referralCard}>
      <View style={styles.referralHeader}>
        <Ionicons
          name={getStatusIcon(item.status) as any}
          size={24}
          color={getStatusColor(item.status)}
        />
        <View style={styles.referralInfo}>
          <Text style={styles.referralId} numberOfLines={1}>
            {item.referralId}
          </Text>
          <Text style={styles.referralDate}>{formatDate(item.createdAt)}</Text>
        </View>
        <View style={styles.countryBadge}>
          <Text style={styles.countryText}>{item.countryCode}</Text>
        </View>
      </View>

      <View style={styles.referralStatus}>
        <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
          {getStatusText(item.status)}
        </Text>
      </View>

      {item.status === 'PENDING' && (
        <View style={styles.pendingInfo}>
          <Ionicons name="information-circle" size={16} color="#FF9800" />
          <Text style={styles.pendingText}>
            Waiting for user to complete verification and first payment
          </Text>
        </View>
      )}

      {item.status === 'ACTIVE' && item.rewardUnlocked && (
        <View style={styles.rewardInfo}>
          <Ionicons name="gift" size={16} color="#4CAF50" />
          <Text style={styles.rewardText}>+100 Tokens Earned</Text>
        </View>
      )}

      {item.status === 'FRAUD' && (
        <View style={styles.fraudInfo}>
          <Ionicons name="shield-checkmark" size={16} color="#F44336" />
          <Text style={styles.fraudText}>Flagged by fraud detection system</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E91E63" />
          <Text style={styles.loadingText}>Loading statistics...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Referral Statistics</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'overview' && styles.activeTab]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabText, activeTab === 'overview' && styles.activeTabText]}>
            Overview
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.activeTab]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
            History
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'overview' ? (
        <View style={styles.overviewContainer}>
          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Ionicons name="people" size={32} color="#E91E63" />
              <Text style={styles.statValue}>{stats?.totalInvites || 0}</Text>
              <Text style={styles.statLabel}>Total Invites</Text>
            </View>

            <View style={styles.statBox}>
              <Ionicons name="checkmark-done" size={32} color="#4CAF50" />
              <Text style={styles.statValue}>{stats?.convertedInvites || 0}</Text>
              <Text style={styles.statLabel}>Activated</Text>
            </View>

            <View style={styles.statBox}>
              <Ionicons name="warning" size={32} color="#FF9800" />
              <Text style={styles.statValue}>
                {(stats?.totalInvites || 0) - (stats?.convertedInvites || 0)}
              </Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>

            <View style={styles.statBox}>
              <Ionicons name="diamond" size={32} color="#FFD700" />
              <Text style={styles.statValue}>{stats?.totalRewardsTokens || 0}</Text>
              <Text style={styles.statLabel}>Tokens Earned</Text>
            </View>
          </View>

          {/* Conversion Rate */}
          <View style={styles.conversionCard}>
            <Text style={styles.conversionTitle}>Conversion Rate</Text>
            <Text style={styles.conversionValue}>
              {stats && stats.totalInvites > 0
                ? Math.round((stats.convertedInvites / stats.totalInvites) * 100)
                : 0}
              %
            </Text>
            <View style={styles.conversionBar}>
              <View
                style={[
                  styles.conversionFill,
                  {
                    width: `${
                      stats && stats.totalInvites > 0
                        ? (stats.convertedInvites / stats.totalInvites) * 100
                        : 0
                    }%`,
                  },
                ]}
              />
            </View>
          </View>

          {/* Viral Coefficient */}
          {stats?.viralCoefficient !== undefined && (
            <View style={styles.viralCard}>
              <Text style={styles.viralTitle}>Viral Coefficient (K-Factor)</Text>
              <Text style={styles.viralValue}>{stats.viralCoefficient.toFixed(2)}</Text>
              <Text style={styles.viralDescription}>
                {stats.viralCoefficient > 1
                  ? '🚀 Excellent! Your referrals are creating exponential growth'
                  : stats.viralCoefficient > 0.5
                  ? '📈 Good! Your referrals are helping us grow'
                  : '💡 Keep sharing to increase your viral impact'}
              </Text>
            </View>
          )}

          {/* Warning for flagged attempts */}
          {stats && stats.flaggedAttempts > 0 && (
            <View style={styles.warningCard}>
              <Ionicons name="shield-checkmark" size={32} color="#FF9800" />
              <Text style={styles.warningTitle}>Fraud Protection Active</Text>
              <Text style={styles.warningDescription}>
                {stats.flaggedAttempts} suspicious referral attempt(s) detected and blocked.
                Continue referring genuine users to maintain your good standing.
              </Text>
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={referrals}
          renderItem={renderReferralItem}
          keyExtractor={(item) => item.referralId}
          contentContainerStyle={styles.historyList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color="#666" />
              <Text style={styles.emptyText}>No referrals yet</Text>
              <Text style={styles.emptySubtext}>Start sharing your referral link to earn rewards!</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#252525',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  placeholder: {
    width: 40,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#252525',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#E91E63',
  },
  tabText: {
    fontSize: 16,
    color: '#999',
  },
  activeTabText: {
    color: '#E91E63',
    fontWeight: 'bold',
  },
  overviewContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statBox: {
    width: '48%',
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
  },
  statLabel: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  conversionCard: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  conversionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  conversionValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#E91E63',
    marginBottom: 16,
  },
  conversionBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  conversionFill: {
    height: '100%',
    backgroundColor: '#E91E63',
    borderRadius: 4,
  },
  viralCard: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  viralTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  viralValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 8,
  },
  viralDescription: {
    fontSize: 14,
    color: '#999',
    lineHeight: 20,
  },
  warningCard: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF9800',
    marginTop: 12,
    marginBottom: 8,
  },
  warningDescription: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  historyList: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  referralCard: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  referralHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  referralInfo: {
    flex: 1,
    marginLeft: 12,
  },
  referralId: {
    fontSize: 14,
    color: '#fff',
    fontFamily: 'monospace',
  },
  referralDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  countryBadge: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  countryText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
  },
  referralStatus: {
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  pendingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF980020',
    padding: 8,
    borderRadius: 8,
  },
  pendingText: {
    fontSize: 12,
    color: '#FF9800',
    marginLeft: 8,
    flex: 1,
  },
  rewardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF5020',
    padding: 8,
    borderRadius: 8,
  },
  rewardText: {
    fontSize: 12,
    color: '#4CAF50',
    marginLeft: 8,
    fontWeight: 'bold',
  },
  fraudInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4433620',
    padding: 8,
    borderRadius: 8,
  },
  fraudText: {
    fontSize: 12,
    color: '#F44336',
    marginLeft: 8,
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
});

