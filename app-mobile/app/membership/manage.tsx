/**
 * PACK 107 — Membership Management Screen
 * 
 * Allows users to view and manage their active membership
 * Includes cancellation flow
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from "@/lib/firebase";

interface MembershipData {
  userId: string;
  tier: 'NONE' | 'VIP' | 'ROYAL_CLUB';
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'PAYMENT_FAILED';
  billingCycle?: 'MONTHLY' | 'ANNUAL';
  monthlyPrice?: number;
  currency?: string;
  purchasedAt?: any;
  expiresAt?: any;
  nextBillingDate?: any;
  autoRenew: boolean;
  lifetimeValue?: number;
  totalActiveDays?: number;
  cancellation?: {
    cancelledAt: any;
    reason?: string;
    willExpireAt: any;
  };
}

const TIER_CONFIG = {
  VIP: {
    name: 'VIP',
    icon: '✨',
    color: '#FFD700',
  },
  ROYAL_CLUB: {
    name: 'Royal Club',
    icon: '👑',
    color: '#9B59B6',
  },
};

export default function MembershipManageScreen() {
  const router = useRouter();
  const [membership, setMembership] = useState<MembershipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    loadMembership();
  }, []);

  const loadMembership = async () => {
    setLoading(true);
    try {
      const functions = getFunctions(app, 'europe-west3');
      const getMembershipStatus = httpsCallable(functions, 'pack107_getUserMembershipStatus');
      const result = await getMembershipStatus({});
      const data = result.data as MembershipData;
      
      if (data && data.tier !== 'NONE') {
        setMembership(data);
      } else {
        // No active membership, go back or to upsell
        Alert.alert(
          'No Active Membership',
          'You don\'t have an active membership.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      console.error('Load membership error:', error);
      Alert.alert('Error', 'Failed to load membership details');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleCancelMembership = () => {
    Alert.alert(
      'Cancel Membership?',
      `Are you sure you want to cancel your ${membership?.tier === 'VIP' ? 'VIP' : 'Royal Club'} membership? You'll keep your benefits until ${formatDate(membership?.expiresAt)}, but it won't renew automatically.`,
      [
        { text: 'Keep Membership', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: confirmCancellation,
        },
      ]
    );
  };

  const confirmCancellation = async () => {
    if (cancelling) return;
    
    setCancelling(true);
    try {
      const functions = getFunctions(app, 'europe-west3');
      const cancelMembership = httpsCallable(functions, 'pack107_cancelMembershipAutoRenew');
      const result = await cancelMembership({
        reason: 'USER_REQUESTED',
        immediate: false,
      });

      const data = result.data as { success: boolean; effectiveDate: string };
      
      if (data.success) {
        Alert.alert(
          'Membership Cancelled',
          `Your membership will remain active until ${formatDate(data.effectiveDate)}. After that, you'll return to standard features.`,
          [
            {
              text: 'OK',
              onPress: () => loadMembership(), // Reload to show updated status
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('Cancel membership error:', error);
      Alert.alert(
        'Cancellation Error',
        error.message || 'Failed to cancel membership. Please try again.'
      );
    } finally {
      setCancelling(false);
    }
  };

  const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    
    let date: Date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp._seconds) {
      date = new Date(timestamp._seconds * 1000);
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      return 'N/A';
    }
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount?: number, currency?: string): string => {
    if (!amount) return 'N/A';
    const symbol = currency === 'EUR' ? '€' : currency || '';
    return `${symbol}${amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={styles.loadingText}>Loading membership...</Text>
      </View>
    );
  }

  if (!membership) {
    return null;
  }

  const config = TIER_CONFIG[membership.tier as 'VIP' | 'ROYAL_CLUB'];
  const isCancelled = membership.status === 'CANCELLED' || !membership.autoRenew;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Manage Membership',
          headerBackTitle: 'Back',
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header Card */}
        <View style={[styles.headerCard, { borderColor: config.color }]}>
          <View style={styles.headerTop}>
            <Text style={styles.headerIcon}>{config.icon}</Text>
            <View style={styles.headerInfo}>
              <Text style={[styles.headerTitle, { color: config.color }]}>
                {config.name}
              </Text>
              <Text style={styles.headerStatus}>
                {membership.status === 'ACTIVE' ? 'Active' : membership.status}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: config.color }]}>
              <Text style={styles.statusBadgeText}>ACTIVE</Text>
            </View>
          </View>
        </View>

        {/* Cancellation Notice */}
        {isCancelled && (
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={24} color="#FF9800" />
            <Text style={styles.warningText}>
              Your membership has been cancelled and will expire on{' '}
              {formatDate(membership.cancellation?.willExpireAt || membership.expiresAt)}.
              You'll continue to enjoy your benefits until then.
            </Text>
          </View>
        )}

        {/* Billing Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Billing Information</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Billing Cycle</Text>
            <Text style={styles.infoValue}>
              {membership.billingCycle === 'MONTHLY' ? 'Monthly' : 'Annual'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Price</Text>
            <Text style={styles.infoValue}>
              {formatCurrency(membership.monthlyPrice, membership.currency)}
              /{membership.billingCycle === 'MONTHLY' ? 'mo' : 'yr'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Started On</Text>
            <Text style={styles.infoValue}>
              {formatDate(membership.purchasedAt)}
            </Text>
          </View>

          {membership.autoRenew && membership.nextBillingDate && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Next Billing</Text>
              <Text style={styles.infoValue}>
                {formatDate(membership.nextBillingDate)}
              </Text>
            </View>
          )}

          {!membership.autoRenew && membership.expiresAt && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Expires On</Text>
              <Text style={styles.infoValue}>
                {formatDate(membership.expiresAt)}
              </Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Auto-Renew</Text>
            <Text style={styles.infoValue}>
              {membership.autoRenew ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
        </View>

        {/* Membership Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Membership Stats</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Total Active Days</Text>
            <Text style={styles.infoValue}>
              {membership.totalActiveDays || 0} days
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Lifetime Value</Text>
            <Text style={styles.infoValue}>
              {formatCurrency(membership.lifetimeValue, membership.currency)}
            </Text>
          </View>
        </View>

        {/* Benefits Reminder */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Benefits</Text>
          <Text style={styles.benefitsNote}>
            Remember: Your membership provides cosmetic benefits and status only.
            It does not include free tokens, discounts, or any monetization advantages.
          </Text>
        </View>

        {/* Actions */}
        {membership.autoRenew && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelMembership}
            disabled={cancelling}
          >
            {cancelling ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="close-circle" size={20} color="#fff" />
                <Text style={styles.cancelButtonText}>Cancel Auto-Renewal</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Need help? Contact support for assistance with your membership.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#999',
    marginTop: 16,
    fontSize: 16,
  },
  content: {
    padding: 20,
  },
  headerCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 3,
    marginBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 48,
    marginRight: 16,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerStatus: {
    fontSize: 14,
    color: '#999',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF9800',
    marginBottom: 20,
  },
  warningText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#FF9800',
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  infoLabel: {
    fontSize: 15,
    color: '#999',
  },
  infoValue: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  benefitsNote: {
    fontSize: 14,
    color: '#999',
    lineHeight: 20,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC3545',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});
