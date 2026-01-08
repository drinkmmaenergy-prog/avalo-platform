/**
 * PACK 278 — Subscription Management Screen
 * 
 * Displays available VIP and Royal tiers, current subscription status,
 * and allows users to purchase or cancel subscriptions
 */

import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { SUBSCRIPTIONS } from "@/config/subscriptions";

interface SubscriptionStatus {
  tier: 'vip' | 'royal' | null;
  active: boolean;
  renewalDate?: string;
  platform?: string;
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionStatus | null>(null);

  useEffect(() => {
    loadSubscriptionStatus();
  }, []);

  const loadSubscriptionStatus = async () => {
    try {
      setLoading(true);
      // TODO: Call Cloud Function to get subscription status
      // const result = await pack278_getSubscription();
      // setCurrentSubscription(result.subscription);
      
      // Mock data for now
      setCurrentSubscription({
        tier: null,
        active: false,
      });
    } catch (error) {
      console.error('Failed to load subscription:', error);
      Alert.alert('Error', 'Failed to load subscription status');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (tier: 'vip' | 'royal') => {
    try {
      setPurchasing(true);
      
      Alert.alert(
        'Purchase Subscription',
        `Start ${tier.toUpperCase()} subscription for ${SUBSCRIPTIONS[tier].monthlyPricePLN} PLN/month?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setPurchasing(false),
          },
          {
            text: 'Continue',
            onPress: async () => {
              // TODO: Implement platform-specific purchase flow
              // For iOS: Use StoreKit
              // For Android: Use Google Play Billing
              // For Web: Redirect to Stripe checkout
              
              Alert.alert('Success', `${tier.toUpperCase()} subscription activated!`);
              await loadSubscriptionStatus();
              setPurchasing(false);
            },
          },
        ]
      );
    } catch (error) {
      console.error('Purchase error:', error);
      Alert.alert('Error', 'Failed to process purchase');
      setPurchasing(false);
    }
  };

  const handleCancelSubscription = async () => {
    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel your subscription? You will lose all premium benefits.',
      [
        {
          text: 'Keep Subscription',
          style: 'cancel',
        },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              // TODO: Call Cloud Function to cancel
              // await pack278_cancelSubscription({ reason: 'User requested' });
              
              Alert.alert('Cancelled', 'Your subscription has been cancelled');
              await loadSubscriptionStatus();
            } catch (error) {
              console.error('Cancel error:', error);
              Alert.alert('Error', 'Failed to cancel subscription');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>Loading subscription...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Subscriptions</Text>
        <Text style={styles.subtitle}>Unlock premium features</Text>
      </View>

      {/* Current Subscription Status */}
      {currentSubscription?.active && (
        <View style={styles.currentSubscriptionCard}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {currentSubscription.tier === 'royal' ? '👑 ROYAL' : '⭐ VIP'}
            </Text>
          </View>
          <Text style={styles.subscriptionStatus}>Active Subscription</Text>
          {currentSubscription.renewalDate && (
            <Text style={styles.renewalDate}>
              Renews: {new Date(currentSubscription.renewalDate).toLocaleDateString()}
            </Text>
          )}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelSubscription}
          >
            <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* VIP Tier */}
      <View style={[styles.planCard, currentSubscription?.tier === 'vip' && styles.activePlan]}>
        <View style={styles.planHeader}>
          <Text style={styles.planIcon}>⭐</Text>
          <Text style={styles.planName}>VIP</Text>
        </View>
        <Text style={styles.planPrice}>{SUBSCRIPTIONS.vip.monthlyPricePLN} PLN</Text>
        <Text style={styles.planPriceSubtext}>per month</Text>

        <View style={styles.featuresContainer}>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>💬</Text>
            <Text style={styles.featureText}>30% discount on voice/video calls</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🌍</Text>
            <Text style={styles.featureText}>Passport - Change location</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🔒</Text>
            <Text style={styles.featureText}>Incognito mode</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>⭐</Text>
            <Text style={styles.featureText}>Priority in Discovery</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>♾️</Text>
            <Text style={styles.featureText}>Unlimited Discovery views</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🚀</Text>
            <Text style={styles.featureText}>1 daily boost</Text>
          </View>
        </View>

        {currentSubscription?.tier !== 'vip' && (
          <TouchableOpacity
            style={[styles.subscribeButton, purchasing && styles.subscribeButtonDisabled]}
            onPress={() => handlePurchase('vip')}
            disabled={purchasing || currentSubscription?.active}
          >
            <Text style={styles.subscribeButtonText}>
              {currentSubscription?.tier === 'royal' ? 'Downgrade to VIP' : 'Subscribe to VIP'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Royal Tier */}
      <View style={[styles.planCard, styles.royalCard, currentSubscription?.tier === 'royal' && styles.activePlan]}>
        <View style={styles.popularBadge}>
          <Text style={styles.popularBadgeText}>BEST VALUE</Text>
        </View>
        <View style={styles.planHeader}>
          <Text style={styles.planIcon}>👑</Text>
          <Text style={styles.planName}>Royal</Text>
        </View>
        <Text style={styles.planPrice}>{SUBSCRIPTIONS.royal.monthlyPricePLN} PLN</Text>
        <Text style={styles.planPriceSubtext}>per month</Text>

        <View style={styles.featuresContainer}>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>💬</Text>
            <Text style={styles.featureText}>50% discount on voice/video calls</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🌍</Text>
            <Text style={styles.featureText}>Passport - Change location</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🔒</Text>
            <Text style={styles.featureText}>Incognito mode</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>👑</Text>
            <Text style={styles.featureText}>Top priority in Discovery</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🎯</Text>
            <Text style={styles.featureText}>Priority in Swipe queue</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>♾️</Text>
            <Text style={styles.featureText}>Unlimited Discovery views</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🚀</Text>
            <Text style={styles.featureText}>2 daily boosts</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>⚡</Text>
            <Text style={styles.featureText}>Early access to new features</Text>
          </View>
        </View>

        {currentSubscription?.tier !== 'royal' && (
          <TouchableOpacity
            style={[styles.subscribeButton, styles.royalButton, purchasing && styles.subscribeButtonDisabled]}
            onPress={() => handlePurchase('royal')}
            disabled={purchasing || currentSubscription?.active}
          >
            <Text style={styles.subscribeButtonText}>
              {currentSubscription?.tier === 'vip' ? 'Upgrade to Royal' : 'Subscribe to Royal'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.footerNote}>
        <Text style={styles.footerNoteText}>
          💡 Subscriptions auto-renew monthly. Cancel anytime from this screen.
        </Text>
        <Text style={styles.footerNoteText}>
          Prices may vary by region. All features available immediately upon purchase.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  currentSubscriptionCard: {
    backgroundColor: '#4ECDC4',
    margin: 20,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4ECDC4',
  },
  subscriptionStatus: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  renewalDate: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 16,
  },
  cancelButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  planCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  activePlan: {
    borderColor: '#4ECDC4',
    backgroundColor: '#F0FFFE',
  },
  royalCard: {
    borderColor: '#FFD700',
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  planIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  planName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  planPrice: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginBottom: 4,
  },
  planPriceSubtext: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  featuresContainer: {
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 28,
  },
  featureText: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  subscribeButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  royalButton: {
    backgroundColor: '#FFD700',
  },
  subscribeButtonDisabled: {
    opacity: 0.5,
  },
  subscribeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  footerNote: {
    margin: 20,
    padding: 16,
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
  },
  footerNoteText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
});
