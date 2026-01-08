/**
 * PACK 440: Creator Revenue Integrity & Payout Freezing Framework
 * Mobile UI: Creator Payout Status Screen
 * 
 * Displays:
 * - Current payout status
 * - Active payouts with ETAs
 * - Integrity score tier
 * - Messages and alerts
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

type PayoutCurrentStatus = 'NORMAL' | 'DELAYED' | 'FROZEN' | 'UNDER_REVIEW';
type IntegrityScoreTier = 'GOLD' | 'SILVER' | 'BRONZE' | 'PROBATION';
type MessageType = 'INFO' | 'WARNING' | 'ACTION_REQUIRED';

interface PayoutMessage {
  messageId: string;
  type: MessageType;
  title: string;
  body: string;
  createdAt: any;
  read: boolean;
}

interface ActivePayoutInfo {
  payoutId: string;
  amount: number;
  status: string;
  estimatedRelease: any;
  delayReason?: string;
}

interface PayoutStatusData {
  creatorId: string;
  currentStatus: PayoutCurrentStatus;
  activePayouts: ActivePayoutInfo[];
  nextPayoutETA?: any;
  integrityScoreTier: IntegrityScoreTier;
  messages: PayoutMessage[];
  escrowPeriod: {
    currentDays: number;
    minDays: number;
    maxDays: number;
  };
  lastUpdated: any;
}

export default function PayoutStatusScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusData, setStatusData] = useState<PayoutStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPayoutStatus();
  }, []);

  const fetchPayoutStatus = async () => {
    try {
      const functions = getFunctions();
      const getStatus = httpsCallable(functions, 'getCreatorPayoutStatus');
      const result = await getStatus();
      setStatusData(result.data as PayoutStatusData);
      setError(null);
    } catch (err) {
      console.error('Error fetching payout status:', err);
      setError('Failed to load payout status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchPayoutStatus();
  };

  const markMessageAsRead = async (messageId: string) => {
    try {
      const functions = getFunctions();
      const markRead = httpsCallable(functions, 'markPayoutMessageRead');
      await markRead({ messageId });
      
      // Update local state
      if (statusData) {
        setStatusData({
          ...statusData,
          messages: statusData.messages.map(msg =>
            msg.messageId === messageId ? { ...msg, read: true } : msg
          ),
        });
      }
    } catch (err) {
      console.error('Error marking message as read:', err);
    }
  };

  const getStatusColor = (status: PayoutCurrentStatus): string => {
    switch (status) {
      case 'NORMAL': return '#10b981'; // Green
      case 'DELAYED': return '#f59e0b'; // Yellow
      case 'FROZEN': return '#ef4444'; // Red
      case 'UNDER_REVIEW': return '#3b82f6'; // Blue
      default: return '#6b7280'; // Gray
    }
  };

  const getStatusIcon = (status: PayoutCurrentStatus): string => {
    switch (status) {
      case 'NORMAL': return '✓';
      case 'DELAYED': return '⏱';
      case 'FROZEN': return '❄';
      case 'UNDER_REVIEW': return '👁';
      default: return '•';
    }
  };

  const getTierColor = (tier: IntegrityScoreTier): string => {
    switch (tier) {
      case 'GOLD': return '#fbbf24'; // Gold
      case 'SILVER': return '#9ca3af'; // Silver
      case 'BRONZE': return '#cd7f32'; // Bronze
      case 'PROBATION': return '#ef4444'; // Red
      default: return '#6b7280';
    }
  };

  const getTierIcon = (tier: IntegrityScoreTier): string => {
    switch (tier) {
      case 'GOLD': return '👑';
      case 'SILVER': return '⭐';
      case 'BRONZE': return '🥉';
      case 'PROBATION': return '⚠️';
      default: return '•';
    }
  };

  const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  const formatAmount = (amount: number): string => {
    return `$${amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading payout status...</Text>
      </View>
    );
  }

  if (error || !statusData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error || 'No data available'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchPayoutStatus}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
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
      {/* Status Banner */}
      <View
        style={[
          styles.statusBanner,
          { backgroundColor: getStatusColor(statusData.currentStatus) },
        ]}
      >
        <Text style={styles.statusIcon}>{getStatusIcon(statusData.currentStatus)}</Text>
        <View style={styles.statusTextContainer}>
          <Text style={styles.statusTitle}>
            {statusData.currentStatus.replace('_', ' ')}
          </Text>
          <Text style={styles.statusSubtitle}>Current payout status</Text>
        </View>
      </View>

      {/* Integrity Score Tier */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Account Standing</Text>
        </View>
        <View style={styles.tierContainer}>
          <Text style={[styles.tierIcon, { color: getTierColor(statusData.integrityScoreTier) }]}>
            {getTierIcon(statusData.integrityScoreTier)}
          </Text>
          <View style={styles.tierInfo}>
            <Text style={[styles.tierName, { color: getTierColor(statusData.integrityScoreTier) }]}>
              {statusData.integrityScoreTier} TIER
            </Text>
            <Text style={styles.tierDescription}>
              Escrow Period: {statusData.escrowPeriod.currentDays} days
            </Text>
            <Text style={styles.tierSubtext}>
              Range: {statusData.escrowPeriod.minDays} - {statusData.escrowPeriod.maxDays} days
            </Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      {statusData.messages.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Messages</Text>
          </View>
          {statusData.messages.map((message) => (
            <TouchableOpacity
              key={message.messageId}
              style={[
                styles.messageItem,
                !message.read && styles.messageUnread,
              ]}
              onPress={() => markMessageAsRead(message.messageId)}
            >
              <View style={styles.messageHeader}>
                <Text style={styles.messageTitle}>{message.title}</Text>
                {!message.read && <View style={styles.messageUnreadDot} />}
              </View>
              <Text style={styles.messageBody}>{message.body}</Text>
              <Text style={styles.messageDate}>
                {formatDate(message.createdAt)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Active Payouts */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Active Payouts</Text>
        </View>
        {statusData.activePayouts.length === 0 ? (
          <Text style={styles.emptyText}>No active payouts</Text>
        ) : (
          statusData.activePayouts.map((payout) => (
            <View key={payout.payoutId} style={styles.payoutItem}>
              <View style={styles.payoutHeader}>
                <Text style={styles.payoutAmount}>{formatAmount(payout.amount)}</Text>
                <Text style={styles.payoutStatus}>{payout.status}</Text>
              </View>
              <Text style={styles.payoutETA}>
                ETA: {formatDate(payout.estimatedRelease)}
              </Text>
              {payout.delayReason && (
                <Text style={styles.payoutReason}>{payout.delayReason}</Text>
              )}
            </View>
          ))
        )}
      </View>

      {/* Support Link */}
      <TouchableOpacity style={styles.supportButton}>
        <Text style={styles.supportButtonText}>Need Help? Contact Support</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Last updated: {formatDate(statusData.lastUpdated)}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f9fafb',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
    margin: 16,
  },
  statusIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  statusSubtitle: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.9,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    margin: 16,
    marginTop: 0,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  tierContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierIcon: {
    fontSize: 48,
    marginRight: 16,
  },
  tierInfo: {
    flex: 1,
  },
  tierName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  tierDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  tierSubtext: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  messageItem: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    marginBottom: 8,
  },
  messageUnread: {
    backgroundColor: '#eff6ff',
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  messageUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  messageBody: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 4,
  },
  messageDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  payoutItem: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    marginBottom: 8,
  },
  payoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  payoutAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  payoutStatus: {
    fontSize: 14,
    color: '#8b5cf6',
    fontWeight: '600',
  },
  payoutETA: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  payoutReason: {
    fontSize: 12,
    color: '#f59e0b',
    fontStyle: 'italic',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    padding: 16,
  },
  supportButton: {
    backgroundColor: '#8b5cf6',
    padding: 16,
    borderRadius: 8,
    margin: 16,
    marginTop: 8,
    alignItems: 'center',
  },
  supportButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#9ca3af',
  },
});
