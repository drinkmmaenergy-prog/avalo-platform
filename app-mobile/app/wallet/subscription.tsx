/**
 * PACK 341 — Subscription Access Panel Screen
 * Shows current tier and subscription benefits
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
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader } from "@/components/AppHeader";
import { colors, spacing, fontSizes, fontWeights } from "@/shared/theme";
import { auth, functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

type SubscriptionTier = 'FREE' | 'VIP' | 'ROYAL';

interface UserSubscription {
  tier: SubscriptionTier;
  subscriptionId?: string;
  expiresAt?: any;
  benefits: string[];
}

const SUBSCRIPTION_TIERS = {
  FREE: {
    name: 'Free',
    icon: '👤',
    color: colors.textSecondary,
    price: 'Free',
    benefits: [
      'Standard chat costs',
      'Standard voice/video rates',
      'Basic features access',
    ],
  },
  VIP: {
    name: 'VIP',
    icon: '⭐',
    color: '#FFD700',
    price: '19.99 PLN/month',
    benefits: [
      '-30% on voice/video calls',
      'Priority customer support',
      'VIP badge on profile',
      'Special chat features',
      'Access to VIP events',
    ],
  },
  ROYAL: {
    name: 'Royal',
    icon: '👑',
    color: '#9C27B0',
    price: '49.99 PLN/month',
    benefits: [
      '-50% on voice/video calls',
      'Better chat conversion (7 words)',
      'Priority matching',
      'Royal badge on profile',
      'Exclusive Royal Club access',
      'Premium customer support',
      'Access to all VIP events',
      'Early access to new features',
    ],
  },
};

export default function SubscriptionScreen() {
  const router = useRouter();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) {
        router.replace('/onboarding/intro-2' as any);
        return;
      }

      // TODO: Implement actual subscription check function
      // For now, return mock data
      const mockSubscription: UserSubscription = {
        tier: 'FREE',
        benefits: SUBSCRIPTION_TIERS.FREE.benefits,
      };

      setSubscription(mockSubscription);
    } catch (err) {
      console.error('Load subscription error:', err);
      Alert.alert('Error', 'Failed to load subscription info');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = (tier: SubscriptionTier) => {
    if (tier === subscription?.tier) {
      Alert.alert('Current Plan', 'This is your current subscription tier');
      return;
    }

    if (tier === 'FREE') {
      handleCancelSubscription();
      return;
    }

    const tierInfo = SUBSCRIPTION_TIERS[tier];
    
    Alert.alert(
      `Upgrade to ${tierInfo.name}`,
      `Price: ${tierInfo.price}\n\nBenefits:\n${tierInfo.benefits.join('\n')}\n\nProceed to payment?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => processUpgrade(tier) },
      ]
    );
  };

  const processUpgrade = async (tier: SubscriptionTier) => {
    try {
      setUpgrading(true);

      // Platform-specific subscription handling
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        // Redirect to App Store / Play Store subscription
        Alert.alert(
          'In-App Subscription',
          'You will be redirected to your app store to complete the subscription.',
          [{ text: 'OK' }]
        );
      } else {
        // Web: Redirect to Stripe
        Alert.alert(
          'Web Subscription',
          'You will be redirected to Stripe to complete the subscription.',
          [{ text: 'OK' }]
        );
      }

      // TODO: Implement actual subscription upgrade
      // const upgradeSubscription = httpsCallable(functions, 'subscription_upgrade');
      // await upgradeSubscription({ tier });
      
    } catch (err: any) {
      console.error('Upgrade error:', err);
      Alert.alert('Error', err.message || 'Failed to upgrade subscription');
    } finally {
      setUpgrading(false);
    }
  };

  const handleCancelSubscription = () => {
    if (subscription?.tier === 'FREE') {
      Alert.alert('Info', 'You are already on the free tier');
      return;
    }

    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel your subscription? You will lose access to premium benefits.',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        { text: 'Cancel Subscription', style: 'destructive', onPress: processCancel },
      ]
    );
  };

  const processCancel = async () => {
    try {
      setUpgrading(true);

      // TODO: Implement actual cancellation
      Alert.alert(
        'Cancellation Requested',
        'Your subscription will remain active until the end of the current billing period.',
        [{ text: 'OK', onPress: loadSubscription }]
      );
    } catch (err: any) {
      console.error('Cancel error:', err);
      Alert.alert('Error', err.message || 'Failed to cancel subscription');
    } finally {
      setUpgrading(false);
    }
  };

  const TierCard = ({ tier, current = false }: { tier: SubscriptionTier; current?: boolean }) => {
    const tierInfo = SUBSCRIPTION_TIERS[tier];
    const canUpgrade = !current && subscription && 
      (tier === 'VIP' && subscription.tier === 'FREE') ||
      (tier === 'ROYAL' && (subscription.tier === 'FREE' || subscription.tier === 'VIP'));
    const canDowngrade = !current && subscription &&
      (tier === 'VIP' && subscription.tier === 'ROYAL') ||
      (tier === 'FREE' && subscription.tier !== 'FREE');

    return (
      <View style={[
        styles.tierCard,
        current && styles.tierCardCurrent,
        tier === 'ROYAL' && styles.tierCardRoyal,
      ]}>
        {current && (
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>Current Plan</Text>
          </View>
        )}

        <View style={styles.tierHeader}>
          <Text style={styles.tierIcon}>{tierInfo.icon}</Text>
          <Text style={[styles.tierName, { color: tierInfo.color }]}>
            {tierInfo.name}
          </Text>
        </View>

        <Text style={styles.tierPrice}>{tierInfo.price}</Text>

        <View style={styles.benefitsList}>
          {tierInfo.benefits.map((benefit, index) => (
            <View key={index} style={styles.benefitRow}>
              <Text style={styles.benefitCheck}>✓</Text>
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>

        {!current && (canUpgrade || canDowngrade) && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              canUpgrade && styles.actionButtonUpgrade,
              canDowngrade && styles.actionButtonDowngrade,
            ]}
            onPress={() => handleUpgrade(tier)}
            disabled={upgrading}
          >
            {upgrading ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={styles.actionButtonText}>
                {canUpgrade ? 'Upgrade' : 'Switch Plan'}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {current && tier !== 'FREE' && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelSubscription}
            disabled={upgrading}
          >
            <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader title="Subscription" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader
        title="Subscription"
        rightAction={
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Choose Your Plan</Text>
          <Text style={styles.headerSubtitle}>
            Unlock premium benefits with VIP or Royal subscription
          </Text>
        </View>

        <View style={styles.tiersContainer}>
          <TierCard tier="FREE" current={subscription?.tier === 'FREE'} />
          <TierCard tier="VIP" current={subscription?.tier === 'VIP'} />
          <TierCard tier="ROYAL" current={subscription?.tier === 'ROYAL'} />
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📋 Important Information</Text>
          <Text style={styles.infoText}>
            • Subscriptions auto-renew monthly{'\n'}
            • Cancel anytime before renewal{'\n'}
            • Benefits apply immediately{'\n'}
            • Subscription managed via app store (mobile) or Stripe (web){'\n'}
            • Discounts apply to all eligible activities{'\n'}
            • 18+ required for subscription
          </Text>
        </View>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
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
  closeButton: {
    fontSize: 24,
    color: colors.textPrimary,
  },
  header: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  headerSubtitle: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  tiersContainer: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  tierCard: {
    backgroundColor: colors.textSecondary + '10',
    borderRadius: 20,
    padding: spacing.xl,
    position: 'relative',
  },
  tierCardCurrent: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  tierCardRoyal: {
    borderWidth: 2,
    borderColor: '#9C27B0' + '40',
  },
  currentBadge: {
    position: 'absolute',
    top: -12,
    right: spacing.xl,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  currentBadgeText: {
    color: colors.background,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  tierHeader: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  tierIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  tierName: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
  },
  tierPrice: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  benefitsList: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  benefitCheck: {
    fontSize: fontSizes.base,
    color: colors.primary,
    marginRight: spacing.sm,
    fontWeight: fontWeights.bold,
  },
  benefitText: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  actionButton: {
    backgroundColor: colors.textSecondary,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonUpgrade: {
    backgroundColor: colors.primary,
  },
  actionButtonDowngrade: {
    backgroundColor: colors.textSecondary + '60',
  },
  actionButtonText: {
    color: colors.background,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  cancelButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  infoCard: {
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.textSecondary + '10',
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  infoTitle: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});

