/**
 * PACK 350 - Subscription Management Screen
 * 
 * Displays current subscription tier, perks, and upgrade options
 * Supports Stripe (web), Apple (iOS), and Google Play (Android)
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

// Types
type SubscriptionTier = 'FREE' | 'VIP' | 'ROYAL' | 'CREATOR_PRO' | 'BUSINESS';

interface SubscriptionDetails {
  tier: SubscriptionTier;
  isActive: boolean;
  renewsAt?: string;
  source?: 'WEB_STRIPE' | 'IOS_STORE' | 'ANDROID_PLAY';
}

interface SubscriptionPerks {
  voiceDiscountPercent: number;
  videoDiscountPercent: number;
  chatWordBucket: number;
  hasAdvancedAnalytics: boolean;
  hasAdsDashboard: boolean;
}

interface ProductConfig {
  tier: SubscriptionTier;
  name: string;
  description: string;
  monthlyPriceDisplay?: string;
  stripePriceId?: string;
  appleProductId?: string;
  googleProductId?: string;
}

export default function SubscriptionScreen() {
  const [loading, setLoading] = useState(true);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionDetails | null>(null);
  const [perks, setPerks] = useState<SubscriptionPerks | null>(null);
  const [availableProducts, setAvailableProducts] = useState<ProductConfig[]>([]);
  const [processingUpgrade, setProcessingUpgrade] = useState(false);

  // Cloud Functions client is imported as functions

  useEffect(() => {
    loadSubscriptionData();
  }, []);

  const loadSubscriptionData = async () => {
    try {
      setLoading(true);

      // Get current subscription
      const getMySubscription = httpsCallable(functions, 'pack350_getMySubscription');
      const subResult: any = await getMySubscription({});
      
      if (subResult.data?.success) {
        setCurrentSubscription({
          tier: subResult.data.tier,
          isActive: subResult.data.details?.isActive ?? true,
          renewsAt: subResult.data.details?.renewsAt,
          source: subResult.data.details?.source,
        });
        setPerks(subResult.data.perks);
      }

      // Get available products
      const getSubscriptionProducts = httpsCallable(functions, 'pack350_getSubscriptionProducts');
      const productsResult: any = await getSubscriptionProducts({
        platform: 'mobile',
      });

      if (productsResult.data?.success) {
        setAvailableProducts(productsResult.data.products);
      }
    } catch (error) {
      console.error('Failed to load subscription data:', error);
      Alert.alert('Error', 'Failed to load subscription information');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (product: ProductConfig) => {
    try {
      setProcessingUpgrade(true);

      if (Platform.OS === 'ios') {
        // TODO: Integrate with expo-in-app-purchases or react-native-iap
        // For now, show alert
        Alert.alert(
          'Upgrade',
          `To upgrade to ${product.name}, please visit the subscription page in your iPhone settings or use our web version.`,
          [{ text: 'OK' }]
        );
      } else if (Platform.OS === 'android') {
        // TODO: Integrate with expo-in-app-purchases or react-native-iap
        Alert.alert(
          'Upgrade',
          `To upgrade to ${product.name}, please use the Google Play billing or visit our web version.`,
          [{ text: 'OK' }]
        );
      } else {
        // Web - open Stripe Checkout
        Alert.alert(
          'Upgrade',
          'Please use the web version to upgrade your subscription.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      Alert.alert('Error', 'Failed to process upgrade');
    } finally {
      setProcessingUpgrade(false);
    }
  };

  const handleCancelSubscription = async () => {
    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel your subscription? You will lose all premium perks at the end of your billing period.',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const cancelSub = httpsCallable(functions, 'pack350_cancelSubscription');
              await cancelSub({
                reason: 'user_requested',
              });
              
              Alert.alert('Success', 'Your subscription has been cancelled');
              loadSubscriptionData();
            } catch (error) {
              console.error('Cancel error:', error);
              Alert.alert('Error', 'Failed to cancel subscription');
            }
          },
        },
      ]
    );
  };

  const getTierColor = (tier: SubscriptionTier): string => {
    switch (tier) {
      case 'ROYAL':
        return '#FFD700';  // Gold
      case 'VIP':
        return '#C0C0C0';  // Silver
      case 'CREATOR_PRO':
        return '#9333EA';  // Purple
      case 'BUSINESS':
        return '#2563EB';  // Blue
      default:
        return '#6B7280';  // Gray
    }
  };

  const getTierIcon = (tier: SubscriptionTier): string => {
    switch (tier) {
      case 'ROYAL':
        return '👑';
      case 'VIP':
        return '⭐';
      case 'CREATOR_PRO':
        return '🎨';
      case 'BUSINESS':
        return '💼';
      default:
        return '🆓';
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-gray-900 items-center justify-center">
        <ActivityIndicator size="large" color="#FF10F0" />
        <Text className="text-white mt-4">Loading subscription...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-900">
      {/* Header */}
      <View className="px-6 pt-8 pb-6">
        <TouchableOpacity onPress={() => router.back()} className="mb-4">
          <Text className="text-white text-lg">← Back</Text>
        </TouchableOpacity>
        <Text className="text-white text-3xl font-bold">Subscription</Text>
      </View>

      {/* Current Tier */}
      {currentSubscription && (
        <View className="mx-6 mb-6 p-6 bg-gray-800 rounded-xl border-2"
          style={{ borderColor: getTierColor(currentSubscription.tier) }}>
          <View className="flex-row items-center mb-4">
            <Text className="text-5xl mr-3">{getTierIcon(currentSubscription.tier)}</Text>
            <View>
              <Text className="text-white text-2xl font-bold">{currentSubscription.tier}</Text>
              {currentSubscription.renewsAt && (
                <Text className="text-gray-400 text-sm">
                  Renews: {new Date(currentSubscription.renewsAt).toLocaleDateString()}
                </Text>
              )}
            </View>
          </View>

          {/* Current Perks */}
          {perks && (
            <View className="mt-4 space-y-2">
              <Text className="text-white text-lg font-semibold mb-2">Your Perks</Text>
              
              {perks.voiceDiscountPercent > 0 && (
                <View className="flex-row items-center">
                  <Text className="text-green-400 mr-2">✓</Text>
                  <Text className="text-gray-300">{perks.voiceDiscountPercent}% off voice calls</Text>
                </View>
              )}
              
              {perks.videoDiscountPercent > 0 && (
                <View className="flex-row items-center">
                  <Text className="text-green-400 mr-2">✓</Text>
                  <Text className="text-gray-300">{perks.videoDiscountPercent}% off video calls</Text>
                </View>
              )}
              
              {perks.chatWordBucket === 7 && (
                <View className="flex-row items-center">
                  <Text className="text-green-400 mr-2">✓</Text>
                  <Text className="text-gray-300">Better chat earnings (7-word buckets)</Text>
                </View>
              )}
              
              {perks.hasAdvancedAnalytics && (
                <View className="flex-row items-center">
                  <Text className="text-green-400 mr-2">✓</Text>
                  <Text className="text-gray-300">Advanced creator analytics</Text>
                </View>
              )}
              
              {perks.hasAdsDashboard && (
                <View className="flex-row items-center">
                  <Text className="text-green-400 mr-2">✓</Text>
                  <Text className="text-gray-300">Ads & campaigns dashboard</Text>
                </View>
              )}
              
              {currentSubscription.tier === 'FREE' && (
                <Text className="text-gray-400">Standard features available</Text>
              )}
            </View>
          )}

          {/* Cancel Button */}
          {currentSubscription.isActive && currentSubscription.tier !== 'FREE' && (
            <TouchableOpacity
              onPress={handleCancelSubscription}
              className="mt-4 py-2">
              <Text className="text-red-400 text-center">Cancel Subscription</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Available Upgrades */}
      <View className="px-6 pb-8">
        <Text className="text-white text-xl font-bold mb-4">Available Tiers</Text>
        
        {availableProducts.map((product) => {
          const isCurrentTier = product.tier === currentSubscription?.tier;
          
          return (
            <View
              key={product.tier}
              className={`mb-4 p-6 rounded-xl ${
                isCurrentTier ? 'bg-gray-700' : 'bg-gray-800'
              }`}>
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center">
                  <Text className="text-3xl mr-2">{getTierIcon(product.tier)}</Text>
                  <Text className="text-white text-xl font-bold">{product.name}</Text>
                </View>
                {product.monthlyPriceDisplay && (
                  <Text className="text-white text-lg font-semibold">
                    {product.monthlyPriceDisplay}
                  </Text>
                )}
              </View>

              <Text className="text-gray-300 mb-4">{product.description}</Text>

              {!isCurrentTier && (
                <TouchableOpacity
                  onPress={() => handleUpgrade(product)}
                  disabled={processingUpgrade}
                  className={`py-3 rounded-lg ${
                    product.tier === 'ROYAL'
                      ? 'bg-yellow-500'
                      : product.tier === 'VIP'
                      ? 'bg-gray-400'
                      : 'bg-pink-500'
                  }`}>
                  <Text className="text-white text-center font-semibold">
                    {processingUpgrade ? 'Processing...' : `Upgrade to ${product.name}`}
                  </Text>
                </TouchableOpacity>
              )}

              {isCurrentTier && (
                <View className="py-3 bg-green-600 rounded-lg">
                  <Text className="text-white text-center font-semibold">Current Plan</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Info Footer */}
      <View className="px-6 pb-8">
        <Text className="text-gray-400 text-sm text-center">
          Subscription prices and features may vary by platform.{'\n'}
          All subscriptions auto-renew unless cancelled.
        </Text>
      </View>
    </ScrollView>
  );
}

