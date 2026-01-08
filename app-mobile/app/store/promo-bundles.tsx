/**
 * PACK 327 — Promo Bundles Store (Mobile)
 * Subscriptions + Boosts + Tokens in One Purchase
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

const functions = getFunctions();
const auth = getAuth();

// Type definitions (inline to avoid import errors)
interface PromoBundle {
  id: string;
  title: string;
  description: string;
  includes: {
    subscriptionType?: 'VIP' | 'ROYAL';
    subscriptionDays?: number;
    boostDays?: number;
    boostMultiplier?: number;
    bonusTokens?: number;
  };
  pricePLN: number;
  priceTokensEquivalent: number;
  available: boolean;
  createdAt: string;
}

interface PurchaseBundleResponse {
  success: boolean;
  purchaseId: string;
  bundle: PromoBundle;
  applied: {
    subscription?: {
      type: string;
      expiresAt: string;
    };
    boost?: {
      expiresAt: string;
      multiplier: number;
    };
    tokens?: {
      amount: number;
      newBalance: number;
    };
  };
  error?: string;
}

export default function PromoBundlesScreen() {
  const router = useRouter();
  const [bundles, setBundles] = useState<PromoBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    loadBundles();
  }, []);

  const loadBundles = async () => {
    try {
      setLoading(true);
      const getBundles = httpsCallable(functions, 'promoBundles_getBundles');
      const result = await getBundles();
      const data = result.data as any;
      
      if (data.success) {
        setBundles(data.bundles);
      }
    } catch (error) {
      console.error('Error loading bundles:', error);
      Alert.alert('Error', 'Failed to load promo bundles');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (bundle: PromoBundle) => {
    try {
      setPurchasing(bundle.id);

      // Show confirmation
      Alert.alert(
        'Confirm Purchase',
        `Purchase ${bundle.title} for ${bundle.pricePLN} PLN?\n\nIncludes:\n${formatBundleIncludes(bundle)}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Purchase',
            onPress: async () => {
              try {
                // TODO: Implement IAP purchase flow for mobile
                // For now, we'll simulate the purchase
                const platform = Platform.OS === 'ios' ? 'IOS' : 'ANDROID';
                
                const purchaseBundle = httpsCallable(functions, 'promoBundles_purchase');
                const result = await purchaseBundle({
                  bundleId: bundle.id,
                  platform,
                });

                const data = result.data as PurchaseBundleResponse;

                if (data.success) {
                  // Show success with applied benefits
                  showSuccessModal(bundle, data.applied);
                } else {
                  Alert.alert('Purchase Failed', data.error || 'Unknown error');
                }
              } catch (error: any) {
                console.error('Purchase error:', error);
                Alert.alert('Purchase Failed', error.message || 'Failed to complete purchase');
              } finally {
                setPurchasing(null);
              }
            },
          },
        ]
      );
    } catch (error) {
      setPurchasing(null);
    }
  };

  const formatBundleIncludes = (bundle: PromoBundle): string => {
    const items: string[] = [];
    
    if (bundle.includes.subscriptionType && bundle.includes.subscriptionDays) {
      items.push(`${bundle.includes.subscriptionDays} days ${bundle.includes.subscriptionType}`);
    }
    
    if (bundle.includes.boostDays && bundle.includes.boostMultiplier) {
      items.push(`${bundle.includes.boostDays} days ${bundle.includes.boostMultiplier}x boost`);
    }
    
    if (bundle.includes.bonusTokens) {
      items.push(`${bundle.includes.bonusTokens} bonus tokens`);
    }
    
    return items.join('\n');
  };

  const showSuccessModal = (bundle: PromoBundle, applied: any) => {
    const benefits: string[] = [];
    
    if (applied.subscription) {
      benefits.push(`✓ ${applied.subscription.type} active until ${new Date(applied.subscription.expiresAt).toLocaleDateString()}`);
    }
    
    if (applied.boost) {
      benefits.push(`✓ ${applied.boost.multiplier}x boost active until ${new Date(applied.boost.expiresAt).toLocaleDateString()}`);
    }
    
    if (applied.tokens) {
      benefits.push(`✓ ${applied.tokens.amount} tokens credited (new balance: ${applied.tokens.newBalance})`);
    }

    Alert.alert(
      'Purchase Successful! 🎉',
      `${bundle.title} activated!\n\n${benefits.join('\n')}`,
      [
        { text: 'OK', onPress: () => router.back() }
      ]
    );
  };

  const getBundleBadge = (bundle: PromoBundle): string | null => {
    if (bundle.title.includes('VIP')) return '⭐ POPULAR';
    if (bundle.title.includes('Royal')) return '👑 BEST VALUE';
    if (bundle.title.includes('Starter')) return '🚀 STARTER';
    return null;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading bundles...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Promo Bundles',
          headerBackTitle: 'Store',
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Special Offers</Text>
          <Text style={styles.headerSubtitle}>
            Unlock VIP perks, boost your visibility, and get bonus tokens
          </Text>
        </View>

        {bundles.map((bundle) => (
          <View key={bundle.id} style={styles.bundleCard}>
            {getBundleBadge(bundle) && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{getBundleBadge(bundle)}</Text>
              </View>
            )}

            <View style={styles.bundleHeader}>
              <Text style={styles.bundleTitle}>{bundle.title}</Text>
              <View style={styles.priceContainer}>
                <Text style={styles.price}>{bundle.pricePLN} PLN</Text>
                <Text style={styles.priceSubtext}>
                  ~{bundle.priceTokensEquivalent} tokens value
                </Text>
              </View>
            </View>

            <Text style={styles.description}>{bundle.description}</Text>

            <View style={styles.includesContainer}>
              {bundle.includes.subscriptionType && bundle.includes.subscriptionDays && (
                <View style={styles.includeItem}>
                  <Ionicons name="shield-checkmark" size={20} color="#6366f1" />
                  <Text style={styles.includeText}>
                    {bundle.includes.subscriptionDays} days {bundle.includes.subscriptionType} membership
                  </Text>
                </View>
              )}

              {bundle.includes.boostDays && bundle.includes.boostMultiplier && (
                <View style={styles.includeItem}>
                  <Ionicons name="trending-up" size={20} color="#6366f1" />
                  <Text style={styles.includeText}>
                    {bundle.includes.boostDays} days {bundle.includes.boostMultiplier}x profile boost
                  </Text>
                </View>
              )}

              {bundle.includes.bonusTokens && (
                <View style={styles.includeItem}>
                  <Ionicons name="gift" size={20} color="#6366f1" />
                  <Text style={styles.includeText}>
                    {bundle.includes.bonusTokens} bonus tokens
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.purchaseButton,
                purchasing === bundle.id && styles.purchaseButtonDisabled,
              ]}
              onPress={() => handlePurchase(bundle)}
              disabled={purchasing === bundle.id}
            >
              {purchasing === bundle.id ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.purchaseButtonText}>Purchase Now</Text>
              )}
            </TouchableOpacity>
          </View>
        ))}

        {bundles.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="gift-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No bundles available</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            💡 Save up to 40% compared to buying separately
          </Text>
          <Text style={styles.footerSubtext}>
            All benefits activate immediately. No refunds except billing errors.
          </Text>
        </View>
      </ScrollView>
    </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  bundleCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#6366f1',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  bundleHeader: {
    marginBottom: 12,
  },
  bundleTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#6366f1',
  },
  priceSubtext: {
    fontSize: 14,
    color: '#9ca3af',
  },
  description: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 16,
    lineHeight: 22,
  },
  includesContainer: {
    marginBottom: 20,
    gap: 12,
  },
  includeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  includeText: {
    fontSize: 15,
    color: '#374151',
    flex: 1,
  },
  purchaseButton: {
    backgroundColor: '#6366f1',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  purchaseButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: '#9ca3af',
    marginTop: 16,
  },
  footer: {
    marginTop: 24,
    marginBottom: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#6366f1',
    fontWeight: '600',
    marginBottom: 8,
  },
  footerSubtext: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
