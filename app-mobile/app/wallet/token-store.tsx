/**
 * PACK 288 — Mobile Token Store Screen
 * 
 * Displays token packages and handles in-app purchases
 * for Android (Google Play) and iOS (App Store)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { auth, functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';
import { User } from 'firebase/auth';
import {
  TOKEN_PACKAGES,
  MOBILE_TOKEN_PRODUCTS,
  formatPrice,
  getDiscountPercentage,
  type TokenPackage,
} from "@/lib/token-store-config";

// Mock IAP library imports (replace with actual react-native-iap)
// import { requestPurchase, useIAP, Product } from 'react-native-iap';

interface WalletBalance {
  balance: number;
  lifetimePurchased: number;
  lifetimeSpent: number;
  lifetimeEarned: number;
}

export default function TokenStoreScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null);
  const [monthlyLimit, setMonthlyLimit] = useState<any>(null);

  useEffect(() => {
    // Subscribe to auth state
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadWalletBalance();
      loadMonthlyLimits();
    }
  }, [user]);

  /**
   * Load user's current wallet balance
   */
  const loadWalletBalance = async () => {
    if (!user) return;

    try {
      const getBalance = httpsCallable(functions, 'wallet_getBalance');
      const result = await getBalance();
      const data = result.data as any;

      if (data.success) {
        setWalletBalance({
          balance: data.balance,
          lifetimePurchased: data.lifetimePurchased,
          lifetimeSpent: data.lifetimeSpent,
          lifetimeEarned: data.lifetimeEarned,
        });
      }
    } catch (error) {
      console.error('Load balance error:', error);
    }
  };

  /**
   * Load monthly purchase limits
   */
  const loadMonthlyLimits = async () => {
    if (!user) return;

    try {
      const getLimits = httpsCallable(functions, 'tokens_getMonthlyLimits');
      const result = await getLimits();
      const data = result.data as any;

      if (data.success) {
        setMonthlyLimit(data);
      }
    } catch (error) {
      console.error('Load limits error:', error);
    }
  };

  /**
   * Handle token pack purchase
   */
  const handlePurchase = async (pack: TokenPackage) => {
    if (!user) {
      Alert.alert('Authentication Required', 'Please sign in to purchase tokens');
      return;
    }

    if (purchasing) {
      return; // Already processing a purchase
    }

    // Check monthly limit
    if (monthlyLimit && !monthlyLimit.canPurchase) {
      Alert.alert(
        'Purchase Limit Reached',
        `You have reached your monthly purchase limit of ${formatPrice(monthlyLimit.limit, 'PLN')}`
      );
      return;
    }

    setPurchasing(pack.id);

    try {
      // Step 1: Initiate store purchase
      const productId = Platform.select({
        ios: MOBILE_TOKEN_PRODUCTS.ios[pack.id as keyof typeof MOBILE_TOKEN_PRODUCTS.ios],
        android: MOBILE_TOKEN_PRODUCTS.android[pack.id as keyof typeof MOBILE_TOKEN_PRODUCTS.android],
      });

      if (!productId) {
        throw new Error('Product ID not found');
      }

      // TODO: Replace with actual IAP library
      // const purchase = await requestPurchase({ sku: productId });
      
      // Mock purchase for development
      const mockReceipt = `mock_receipt_${Date.now()}_${productId}`;

      // Step 2: Send receipt to backend for verification
      const verifyPurchase = httpsCallable(functions, 'tokens_mobilePurchase');
      const result = await verifyPurchase({
        platform: Platform.OS,
        providerReceipt: mockReceipt,
        packageId: pack.id,
        productId,
      });

      const data = result.data as any;

      if (data.success) {
        // Success!
        Alert.alert(
          'Purchase Complete! 🎉',
          `You received ${pack.tokens} tokens!\n\nNew balance: ${data.newBalance} tokens`,
          [
            {
              text: 'OK',
              onPress: () => {
                loadWalletBalance();
                loadMonthlyLimits();
              },
            },
          ]
        );
      } else {
        throw new Error(data.error || 'Purchase failed');
      }
    } catch (error: any) {
      console.error('Purchase error:', error);
      
      Alert.alert(
        'Purchase Failed',
        error.message || 'Unable to complete purchase. Please try again.'
      );
    } finally {
      setPurchasing(null);
    }
  };

  /**
   * Render token package card
   */
  const renderPackageCard = (pack: TokenPackage) => {
    const discount = getDiscountPercentage(pack);
    const isPurchasing = purchasing === pack.id;

    return (
      <TouchableOpacity
        key={pack.id}
        style={[
          styles.packageCard,
          pack.popularBadge && styles.popularCard,
        ]}
        onPress={() => handlePurchase(pack)}
        disabled={isPurchasing || loading}
        activeOpacity={0.7}
      >
        {pack.popularBadge && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
          </View>
        )}

        <View style={styles.packageHeader}>
          <Text style={styles.packageName}>{pack.name}</Text>
          {discount > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{discount}%</Text>
            </View>
          )}
        </View>

        <View style={styles.tokensContainer}>
          <Text style={styles.tokensAmount}>{pack.tokens.toLocaleString()}</Text>
          <Text style={styles.tokensLabel}>tokens</Text>
        </View>

        <View style={styles.priceContainer}>
          <Text style={styles.price}>{formatPrice(pack.basePricePLN, 'PLN')}</Text>
          <Text style={styles.pricePerToken}>
            {formatPrice(pack.basePricePLN / pack.tokens, 'PLN')} / token
          </Text>
        </View>

        {pack.description && (
          <Text style={styles.description}>{pack.description}</Text>
        )}

        <View style={styles.purchaseButton}>
          {isPurchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.purchaseButtonText}>Purchase</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Token Store</Text>
        <Text style={styles.subtitle}>
          Purchase tokens to unlock premium features
        </Text>
      </View>

      {/* Current Balance */}
      {walletBalance && (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceAmount}>
            {walletBalance.balance.toLocaleString()} tokens
          </Text>
          <View style={styles.balanceStats}>
            <View style={styles.balanceStat}>
              <Text style={styles.balanceStatLabel}>Purchased</Text>
              <Text style={styles.balanceStatValue}>
                {walletBalance.lifetimePurchased.toLocaleString()}
              </Text>
            </View>
            <View style={styles.balanceStat}>
              <Text style={styles.balanceStatLabel}>Earned</Text>
              <Text style={styles.balanceStatValue}>
                {walletBalance.lifetimeEarned.toLocaleString()}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Monthly Limit Info */}
      {monthlyLimit && (
        <View style={styles.limitCard}>
          <Text style={styles.limitTitle}>Monthly Purchase Limit</Text>
          <View style={styles.limitBar}>
            <View
              style={[
                styles.limitBarFill,
                {
                  width: `${(monthlyLimit.totalSpent / monthlyLimit.limit) * 100}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.limitText}>
            {formatPrice(monthlyLimit.totalSpent, 'PLN')} / {formatPrice(monthlyLimit.limit, 'PLN')} used
          </Text>
        </View>
      )}

      {/* Token Packages */}
      <View style={styles.packagesSection}>
        <Text style={styles.sectionTitle}>Choose Your Package</Text>
        {TOKEN_PACKAGES.map(renderPackageCard)}
      </View>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>How It Works</Text>
        <View style={styles.infoItem}>
          <Text style={styles.infoIcon}>🛒</Text>
          <Text style={styles.infoText}>
            Select a package and complete the purchase through your app store
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoIcon}>⚡</Text>
          <Text style={styles.infoText}>
            Tokens are added to your wallet instantly after purchase
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoIcon}>🎯</Text>
          <Text style={styles.infoText}>
            Use tokens for chat, calls, events, and premium content
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoIcon}>💰</Text>
          <Text style={styles.infoText}>
            Creators earn 1 token = 0.20 PLN when withdrawing
          </Text>
        </View>
      </View>

      {/* Terms */}
      <View style={styles.termsSection}>
        <Text style={styles.termsText}>
          Tokens are non-refundable except in cases of technical errors or legal requirements.
          Must be 18+ to purchase. See Terms of Service for details.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  balanceCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  balanceStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 16,
  },
  balanceStat: {
    alignItems: 'center',
  },
  balanceStatLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  balanceStatValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  limitCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  limitTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  limitBar: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  limitBarFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  limitText: {
    fontSize: 12,
    color: '#666',
  },
  packagesSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  packageCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  popularCard: {
    borderWidth: 2,
    borderColor: '#FF6B35',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#FF6B35',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  packageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  packageName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
  },
  discountBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  discountText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tokensContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  tokensAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#007AFF',
    marginRight: 8,
  },
  tokensLabel: {
    fontSize: 18,
    color: '#666',
  },
  priceContainer: {
    marginBottom: 12,
  },
  price: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  pricePerToken: {
    fontSize: 14,
    color: '#666',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  purchaseButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  termsSection: {
    padding: 16,
    marginBottom: 24,
  },
  termsText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});
