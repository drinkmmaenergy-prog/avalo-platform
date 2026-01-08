import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * PACK 106 — Buy Tokens Screen
 * 
 * Localized token purchase interface
 * Shows prices in user's selected currency with tax information
 * 
 * Features:
 * - Localized pricing (FX parity, no discounts)
 * - Tax-inclusive display where required
 * - PSP routing information
 * - Clear token value preservation messaging
 */

interface TokenBundle {
  tokens: number;
  price: number;
  currency: string;
  priceWithTax?: number;
  taxAmount?: number;
  label: string;
  popularBadge?: boolean;
}

interface LocalizedStorefront {
  currency: string;
  symbol: string;
  bundles: TokenBundle[];
  taxIncluded: boolean;
  taxRate?: number;
  taxJurisdiction?: string;
  fxRate: number;
  baseTokenPrice: number;
  rateTimestamp: { seconds: number };
  preferredPSP: 'STRIPE' | 'WISE';
}

interface UserCurrencyPreference {
  currency: string;
}

export default function BuyTokensScreen() {
  const [storefront, setStorefront] = useState<LocalizedStorefront | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedBundle, setSelectedBundle] = useState<TokenBundle | null>(null);

  useEffect(() => {
    loadStorefront();
  }, []);

  const loadStorefront = async () => {
    try {
      const functions = getFunctions();
      
      // Get user's currency preference
      const getUserCurrencyPreference = httpsCallable<void, UserCurrencyPreference>(
        functions,
        'getUserCurrencyPreference'
      );
      const prefResult = await getUserCurrencyPreference();
      const userCurrency = prefResult.data.currency;

      // Get localized storefront
      const getLocalStorefront = httpsCallable<
        { currencyCode: string },
        LocalizedStorefront
      >(functions, 'getLocalStorefront');

      const storefrontResult = await getLocalStorefront({ currencyCode: userCurrency });
      setStorefront(storefrontResult.data);
    } catch (error: any) {
      console.error('Error loading storefront:', error);
      Alert.alert('Error', 'Failed to load token packages. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBundleSelect = (bundle: TokenBundle) => {
    setSelectedBundle(bundle);
    
    const displayPrice = storefront?.taxIncluded ? bundle.priceWithTax : bundle.price;
    const formattedPrice = formatPrice(displayPrice || bundle.price);

    Alert.alert(
      'Purchase Tokens',
      `Purchase ${bundle.tokens} tokens for ${formattedPrice}${storefront?.symbol}?\n\n${
        storefront?.taxIncluded ? 'Price includes tax' : 'Taxes may apply at checkout'
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => processPurchase(bundle),
        },
      ]
    );
  };

  const processPurchase = async (bundle: TokenBundle) => {
    setProcessing(true);

    try {
      // In production, this would integrate with Stripe/Wise
      // For now, show a placeholder
      Alert.alert(
        'Payment Processing',
        'This would redirect to payment gateway (Stripe/Wise) in production.',
        [
          {
            text: 'OK',
            onPress: () => {
              setProcessing(false);
              router.back();
            },
          },
        ]
      );

      // TODO: Implement actual payment flow with PSP
      // 1. Create payment intent via backend
      // 2. Redirect to Stripe/Wise checkout
      // 3. Handle webhook confirmation
      // 4. Credit tokens to user balance
    } catch (error: any) {
      console.error('Error processing purchase:', error);
      Alert.alert('Error', 'Payment processing failed. Please try again.');
      setProcessing(false);
    }
  };

  const formatPrice = (price: number): string => {
    if (!storefront) return price.toFixed(2);
    return price.toFixed(storefront.bundles[0]?.priceWithTax ? 2 : 0);
  };

  const renderBundle = ({ item }: { item: TokenBundle }) => {
    const displayPrice = storefront?.taxIncluded ? item.priceWithTax : item.price;
    const formattedPrice = formatPrice(displayPrice || item.price);
    const pricePerToken = (displayPrice || item.price) / item.tokens;
    
    return (
      <TouchableOpacity
        style={[
          styles.bundleCard,
          item.popularBadge && styles.popularBundle,
        ]}
        onPress={() => handleBundleSelect(item)}
        disabled={processing}
      >
        {item.popularBadge && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularBadgeText}>POPULAR</Text>
          </View>
        )}

        <Text style={styles.tokenAmount}>{item.tokens}</Text>
        <Text style={styles.tokenLabel}>Tokens</Text>

        <View style={styles.priceContainer}>
          <Text style={styles.priceSymbol}>{storefront?.symbol}</Text>
          <Text style={styles.priceAmount}>{formattedPrice}</Text>
        </View>

        <Text style={styles.pricePerToken}>
          {storefront?.symbol}{pricePerToken.toFixed(3)} per token
        </Text>

        {storefront?.taxIncluded && item.taxAmount && item.taxAmount > 0 && (
          <Text style={styles.taxInfo}>
            Includes {storefront.symbol}{formatPrice(item.taxAmount)} tax
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading packages...</Text>
        </View>
      </View>
    );
  }

  if (!storefront) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Unable to load token packages</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadStorefront}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buy Tokens</Text>
        <TouchableOpacity onPress={() => router.push('/profile/settings/currency' as any)}>
          <Text style={styles.currencyButton}>
            Currency: {storefront.currency} {storefront.symbol}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerText}>
          💰 All prices shown in {storefront.currency}
        </Text>
        <Text style={styles.infoBannerText}>
          🔄 Token value is the same in all currencies (FX parity)
        </Text>
        <Text style={styles.infoBannerText}>
          ✅ No discounts, bonuses, or promotional pricing
        </Text>
        {storefront.taxIncluded && (
          <Text style={styles.infoBannerText}>
            📋 {storefront.taxJurisdiction || 'Tax'} included in price
          </Text>
        )}
      </View>

      {/* Token Bundles */}
      <FlatList
        data={storefront.bundles}
        renderItem={renderBundle}
        keyExtractor={(item) => item.tokens.toString()}
        numColumns={2}
        contentContainerStyle={styles.bundleList}
        columnWrapperStyle={styles.bundleRow}
        showsVerticalScrollIndicator={false}
      />

      {/* Footer Info */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Payment processed via {storefront.preferredPSP === 'STRIPE' ? 'Stripe' : 'Wise'}
        </Text>
        <Text style={styles.footerText}>
          Base rate: 1 token = €{storefront.baseTokenPrice.toFixed(2)}
        </Text>
        <Text style={styles.footerText}>
          FX rate: 1 EUR = {storefront.fxRate.toFixed(4)} {storefront.currency}
        </Text>
        <Text style={styles.footerTextSmall}>
          Rates updated: {new Date(storefront.rateTimestamp.seconds * 1000).toLocaleString()}
        </Text>
      </View>

      {/* Processing Overlay */}
      {processing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingBox}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.processingText}>Processing payment...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  currencyButton: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  infoBanner: {
    backgroundColor: '#FFF9E6',
    padding: 15,
    margin: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  infoBannerText: {
    fontSize: 13,
    color: '#424242',
    lineHeight: 20,
    marginBottom: 4,
  },
  bundleList: {
    padding: 15,
    paddingBottom: 100,
  },
  bundleRow: {
    justifyContent: 'space-between',
  },
  bundleCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    marginHorizontal: 5,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    minHeight: 200,
  },
  popularBundle: {
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8E9',
  },
  popularBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  tokenAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 10,
  },
  tokenLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  priceSymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
    marginRight: 4,
  },
  priceAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  pricePerToken: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  taxInfo: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 3,
  },
  footerTextSmall: {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
    marginTop: 5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingBox: {
    backgroundColor: '#FFFFFF',
    padding: 30,
    borderRadius: 15,
    alignItems: 'center',
  },
  processingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#000',
  },
});
