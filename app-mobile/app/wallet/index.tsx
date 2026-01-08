/**
 * PACK 321 — Wallet Screen (Main)
 * Token balance overview with quick actions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader } from "@/components/AppHeader";
import { BottomNavigation } from "@/components/BottomNavigation";
import { colors, spacing, fontSizes, fontWeights } from "@/shared/theme";
import { auth } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

interface WalletBalance {
  tokensBalance: number;
  lifetimePurchasedTokens: number;
  lifetimeSpentTokens: number;
  lifetimeEarnedTokens: number;
}

export default function WalletScreen() {
  const router = useRouter();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBalance();
  }, []);

  const loadBalance = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const user = auth.currentUser;
      if (!user) {
        router.replace('/onboarding/intro-2' as any);
        return;
      }

      const getBalance = httpsCallable(functions, 'pack277_getBalance');
      const result = await getBalance();
      const data = result.data as any;

      if (data.success && data.wallet) {
        setBalance(data.wallet);
      } else {
        setError(data.error || 'Failed to load balance');
      }
    } catch (err: any) {
      console.error('Load balance error:', err);
      setError(err.message || 'Failed to load wallet');
    } finally {
      setLoading(false);
    }
  };

  const getFiatEquivalent = (tokens: number) => {
    // Payout rate: 1 token = 0.20 PLN
    const pln = tokens * 0.20;
    return pln.toFixed(2);
  };

  const QuickActionButton = ({
    icon,
    label,
    onPress,
    primary = false,
  }: {
    icon: string;
    label: string;
    onPress: () => void;
    primary?: boolean;
  }) => (
    <TouchableOpacity
      style={[styles.actionButton, primary && styles.actionButtonPrimary]}
      onPress={onPress}
    >
      <Text style={styles.actionIcon}>{icon}</Text>
      <Text style={[styles.actionLabel, primary && styles.actionLabelPrimary]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader title="Wallet" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <BottomNavigation />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <AppHeader title="Wallet" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadBalance}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
        <BottomNavigation />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader 
        title="Wallet" 
        rightAction={
          <TouchableOpacity onPress={loadBalance}>
            <Text style={styles.refreshIcon}>🔄</Text>
          </TouchableOpacity>
        }
      />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Token Balance</Text>
          <Text style={styles.balanceAmount}>
            {balance?.tokensBalance.toLocaleString() || '0'}
          </Text>
          <Text style={styles.balanceSubtext}>tokens</Text>
          
          <View style={styles.fiatHint}>
            <Text style={styles.fiatHintText}>
              ≈ {getFiatEquivalent(balance?.tokensBalance || 0)} PLN
            </Text>
            <Text style={styles.fiatHintSubtext}>
              (estimated at 0.20 PLN/token payout rate)
            </Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <QuickActionButton
              icon="💳"
              label="Buy Tokens"
              onPress={() => router.push('/wallet/store' as any)}
              primary
            />
            <QuickActionButton
              icon="📜"
              label="History"
              onPress={() => router.push('/wallet/transactions' as any)}
            />
            <QuickActionButton
              icon="💰"
              label="Payout"
              onPress={() => router.push('/wallet/payout' as any)}
            />
            <QuickActionButton
              icon="👑"
              label="Subscription"
              onPress={() => router.push('/wallet/subscription' as any)}
            />
            <QuickActionButton
              icon="ℹ️"
              label="Info"
              onPress={() => router.push('/wallet/info' as any)}
            />
          </View>
        </View>

        {/* Lifetime Stats */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Lifetime Statistics</Text>
          
          <View style={styles.statCard}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>💸 Purchased</Text>
              <Text style={styles.statValue}>
                {balance?.lifetimePurchasedTokens.toLocaleString() || '0'}
              </Text>
            </View>
            
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>🎯 Spent</Text>
              <Text style={styles.statValue}>
                {balance?.lifetimeSpentTokens.toLocaleString() || '0'}
              </Text>
            </View>
            
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>💎 Earned</Text>
              <Text style={styles.statValue}>
                {balance?.lifetimeEarnedTokens.toLocaleString() || '0'}
              </Text>
            </View>
          </View>
        </View>

        {/* Important Notice */}
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>⚠️ Important Information</Text>
          <Text style={styles.noticeText}>
            • Tokens are for 18+ users only{'\n'}
            • Payout rate: 1 token = 0.20 PLN{'\n'}
            • Minimum payout: 1,000 tokens (200 PLN){'\n'}
            • KYC verification required for payouts{'\n'}
            • No refunds on token purchases (except where required by law)
          </Text>
        </View>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
      
      <BottomNavigation />
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorIcon: {
    fontSize: 60,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 24,
  },
  retryButtonText: {
    color: colors.background,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  refreshIcon: {
    fontSize: 20,
  },
  balanceCard: {
    backgroundColor: colors.primary,
    margin: spacing.lg,
    padding: spacing.xl,
    borderRadius: 20,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: fontSizes.sm,
    color: colors.background + 'CC',
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceAmount: {
    fontSize: 48,
    fontWeight: fontWeights.bold,
    color: colors.background,
    marginVertical: spacing.sm,
  },
  balanceSubtext: {
    fontSize: fontSizes.base,
    color: colors.background + 'CC',
  },
  fiatHint: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.background + '30',
    alignItems: 'center',
  },
  fiatHintText: {
    fontSize: fontSizes.lg,
    color: colors.background,
    fontWeight: fontWeights.semibold,
  },
  fiatHintSubtext: {
    fontSize: fontSizes.xs,
    color: colors.background + '99',
    marginTop: spacing.xs,
  },
  actionsSection: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.textSecondary + '10',
    padding: spacing.lg,
    borderRadius: 16,
    alignItems: 'center',
  },
  actionButtonPrimary: {
    backgroundColor: colors.primary + '20',
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  actionLabel: {
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    fontWeight: fontWeights.semibold,
  },
  actionLabelPrimary: {
    color: colors.primary,
  },
  statsSection: {
    padding: spacing.lg,
  },
  statCard: {
    backgroundColor: colors.textSecondary + '10',
    borderRadius: 16,
    padding: spacing.lg,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.textSecondary + '20',
  },
  statLabel: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  noticeCard: {
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.textSecondary + '10',
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  noticeTitle: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  noticeText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
