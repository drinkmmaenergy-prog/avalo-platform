/**
 * Wallet Screen
 * Shows token balance, purchase options, and free token earning (ads)
 * Phase 31B: Region-based pricing display
 * Phase 31C: Adaptive Smart Discounts integration
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { useLocaleContext } from "@/contexts/LocaleContext";
import { getTokenBalance, subscribeToTokenBalance } from "@/services/tokenService";
import { watchRewardedAd, canWatchRewardedAd } from "@/services/adsService";
import { mockCompletePurchase } from "@/services/stripeService";
import { TOKEN_PACKS, getTotalTokensForPack, PLN_PRICING_TABLE } from "@/config/monetization";
import { ADS_AND_SPONSORSHIP_CONFIG } from "@/config/monetization";
import AnimatedTokenBalance from "@/components/AnimatedTokenBalance";
import BottomSheetPromo from "@/components/BottomSheetPromo";
import { DiscountOffer } from "@/shared/types/discounts";
import { retrieveActiveDiscount, applyDiscountToPrice } from "@/shared/utils/discountEngine";

export default function WalletScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { region, locale, formatPrice } = useLocaleContext();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [watchingAd, setWatchingAd] = useState(false);
  
  // Phase 31C: Discount states
  const [activeDiscount, setActiveDiscount] = useState<DiscountOffer | null>(null);
  const [showPromoModal, setShowPromoModal] = useState(false);

  useEffect(() => {
    if (user?.uid) {
      // Subscribe to real-time balance updates
      const unsubscribe = subscribeToTokenBalance(
        user.uid,
        (newBalance) => {
          setBalance(newBalance);
          setLoading(false);
        },
        (error) => {
          console.error('Balance subscription error:', error);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } else {
      setLoading(false);
    }

    // Phase 31C: Check for active discounts
    const discount = retrieveActiveDiscount();
    if (discount) {
      setActiveDiscount(discount);
    }
  }, [user?.uid]);

  const handlePurchaseTokens = async (packId: string) => {
    if (!user?.uid) {
      const errorMsg = locale === 'pl' ? 'Zaloguj się, aby kupić tokeny' : 'Sign in to purchase tokens';
      Alert.alert(locale === 'pl' ? 'Błąd' : 'Error', errorMsg);
      return;
    }

    const pack = TOKEN_PACKS.find(p => p.packId === packId);
    if (!pack) {
      Alert.alert('Error', 'Invalid token pack');
      return;
    }

    const totalTokens = getTotalTokensForPack(pack);
    
    // Get display price (PLN for PL region, USD otherwise)
    const plnPrice = region === 'PL' ? PLN_PRICING_TABLE[packId] : undefined;
    const displayPrice = plnPrice
      ? `${plnPrice.toFixed(2)} PLN`
      : formatPrice(pack.price);
    
    const priceNotice = (region === 'PL' && plnPrice)
      ? (locale === 'pl'
        ? '\n\n💡 Globalne rozliczenie odbywa się w USD — bez dopłat i przewalutowań'
        : '\n\n💡 Global billing uses USD — no surcharge or conversion fees')
      : '';

    const title = locale === 'pl' ? 'Zakup tokenów' : 'Purchase Tokens';
    const message = `${locale === 'pl' ? 'Kupić' : 'Purchase'} ${totalTokens} ${locale === 'pl' ? 'tokenów za' : 'tokens for'} ${displayPrice}?${pack.bonus ? `\n\n${locale === 'pl' ? 'Zawiera' : 'Includes'} ${pack.bonus} ${locale === 'pl' ? 'tokenów bonusowych!' : 'bonus tokens!'}` : ''}${priceNotice}`;

    Alert.alert(
      title,
      message,
      [
        { text: locale === 'pl' ? 'Anuluj' : 'Cancel', style: 'cancel' },
        {
          text: locale === 'pl' ? 'Kup teraz' : 'Buy Now',
          onPress: async () => {
            setLoading(true);
            try {
              // Use mock purchase in development
              const result = await mockCompletePurchase(user.uid, pack);
              
              if (result.success) {
                const successTitle = locale === 'pl' ? 'Zakup udany! 🎉' : 'Purchase Successful! 🎉';
                const successMsg = locale === 'pl'
                  ? `${totalTokens} tokenów zostało dodanych do portfela!`
                  : `${totalTokens} tokens have been added to your wallet!`;
                Alert.alert(successTitle, successMsg);
              } else {
                const failMsg = locale === 'pl' ? 'Spróbuj ponownie później.' : 'Please try again later.';
                Alert.alert(locale === 'pl' ? 'Zakup nie powiódł się' : 'Purchase Failed', failMsg);
              }
            } catch (error) {
              console.error('Error purchasing tokens:', error);
              const errorMsg = locale === 'pl'
                ? 'Nie udało się przetworzyć zakupu. Spróbuj ponownie.'
                : 'Failed to process purchase. Please try again.';
              Alert.alert(locale === 'pl' ? 'Błąd' : 'Error', errorMsg);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleWatchAd = async () => {
    if (!user?.uid) {
      Alert.alert('Error', 'Please sign in to watch ads');
      return;
    }

    if (!canWatchRewardedAd()) {
      Alert.alert('Daily Limit Reached', 'You\'ve watched the maximum number of ads today. Try again tomorrow!');
      return;
    }

    setWatchingAd(true);

    // Simulate ad watching (in production, show real ad)
    setTimeout(async () => {
      const result = await watchRewardedAd(user.uid);
      
      setWatchingAd(false);
      
      if (result.success) {
        Alert.alert(
          'Tokens Earned! 🎉',
          `You earned ${result.tokensEarned} tokens for watching an ad!`
        );
      } else {
        Alert.alert('Error', 'Failed to process ad reward. Please try again.');
      }
    }, 2000); // Simulate 2-second ad
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Please sign in to access your wallet</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Your Balance</Text>
          {loading ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <AnimatedTokenBalance balance={balance} fontSize={48} color="#fff" />
          )}
          <Text style={styles.balanceUnit}>tokens</Text>
        </View>

        {/* Free Tokens Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎁 Get Free Tokens</Text>
          <TouchableOpacity
            style={[styles.adButton, watchingAd && styles.adButtonDisabled]}
            onPress={handleWatchAd}
            disabled={watchingAd}
          >
            {watchingAd ? (
              <>
                <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.adButtonText}>Watching Ad...</Text>
              </>
            ) : (
              <>
                <Text style={styles.adButtonEmoji}>📺</Text>
                <View style={styles.adButtonContent}>
                  <Text style={styles.adButtonText}>Watch Ad</Text>
                  <Text style={styles.adButtonReward}>
                    Earn {ADS_AND_SPONSORSHIP_CONFIG.REWARDED_AD_TOKENS} tokens
                  </Text>
                </View>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.adNote}>
            Note: This is a placeholder. Real ad integration in Phase 5.
          </Text>
        </View>

        {/* Active Discount Banner */}
        {activeDiscount && (
          <TouchableOpacity
            style={styles.discountBanner}
            onPress={() => setShowPromoModal(true)}
          >
            <Text style={styles.discountBannerIcon}>🎉</Text>
            <View style={styles.discountBannerContent}>
              <Text style={styles.discountBannerTitle}>
                {activeDiscount.discountPercent}% OFF - Limited Time!
              </Text>
              <Text style={styles.discountBannerSubtitle}>
                Tap to view offer
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Token Packs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 {locale === 'pl' ? 'Kup tokeny' : 'Buy Tokens'}</Text>
          {TOKEN_PACKS.map((pack) => {
            const totalTokens = getTotalTokensForPack(pack);
            
            // Phase 31C: Apply discount to display price (UI-ONLY)
            const priceWithDiscount = applyDiscountToPrice(pack.price, activeDiscount);
            const hasDiscount = priceWithDiscount.hasDiscount;
            
            // Get PLN price if region is PL, otherwise use USD
            const plnPrice = region === 'PL' ? PLN_PRICING_TABLE[pack.packId] : undefined;
            const basePrice = hasDiscount ? priceWithDiscount.displayPrice : pack.price;
            const displayPrice = plnPrice
              ? `${plnPrice.toFixed(2)} PLN`
              : formatPrice(basePrice);
            
            const valuePerToken = plnPrice
              ? plnPrice / totalTokens
              : basePrice / totalTokens;
            const currency = plnPrice ? 'PLN' : 'USD';
            
            const savings = pack.bonus ? Math.floor((pack.bonus / pack.tokens) * 100) : 0;
            
            return (
              <TouchableOpacity
                key={pack.packId}
                style={[styles.packCard, pack.popular && styles.packCardPopular]}
                onPress={() => handlePurchaseTokens(pack.packId)}
              >
                {pack.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>⭐ {locale === 'pl' ? 'POPULARNE' : 'POPULAR'}</Text>
                  </View>
                )}
                {hasDiscount && (
                  <View style={styles.discountPackBadge}>
                    <Text style={styles.discountPackBadgeText}>
                      -{activeDiscount?.discountPercent}% OFF
                    </Text>
                  </View>
                )}
                <View style={styles.packInfo}>
                  <Text style={styles.packName}>
                    {pack.displayName}
                  </Text>
                  <Text style={styles.packTokens}>
                    {pack.tokens.toLocaleString()} {locale === 'pl' ? 'tokenów' : 'tokens'}
                  </Text>
                  {pack.bonus && pack.bonus > 0 && (
                    <View style={styles.bonusRow}>
                      <Text style={styles.packBonus}>+{pack.bonus} BONUS</Text>
                      <Text style={styles.savingsText}>({savings}% {locale === 'pl' ? 'więcej' : 'more'})</Text>
                    </View>
                  )}
                  <Text style={styles.valueText}>
                    {valuePerToken.toFixed(3)} {currency}/{locale === 'pl' ? 'token' : 'token'}
                  </Text>
                </View>
                <View style={styles.packPricing}>
                  {hasDiscount && (
                    <Text style={styles.originalPackPrice}>
                      ${priceWithDiscount.originalPrice.toFixed(2)}
                    </Text>
                  )}
                  <Text style={[styles.packPrice, hasDiscount && styles.discountedPackPrice]}>
                    {displayPrice}
                  </Text>
                  <View style={styles.totalBadge}>
                    <Text style={styles.totalText}>
                      = {totalTokens.toLocaleString()}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
          {region === 'PL' && (
            <Text style={styles.pricingNotice}>
              {locale === 'pl'
                ? '💡 Globalne rozliczenie odbywa się w USD — bez dopłat i przewalutowań'
                : '💡 Global billing uses USD — no surcharge or conversion fees'}
            </Text>
          )}
          <Text style={styles.purchaseNote}>
            💳 {__DEV__
              ? (locale === 'pl' ? 'Tryb deweloperski: Symulowane zakupy' : 'Development Mode: Mock purchases enabled')
              : (locale === 'pl' ? 'Bezpieczne płatności przez Stripe' : 'Secure payments via Stripe')}
          </Text>
        </View>
      </ScrollView>

      {/* Phase 31C: Promo Bottom Sheet */}
      <BottomSheetPromo
        visible={showPromoModal}
        offer={activeDiscount}
        onClose={() => setShowPromoModal(false)}
        onActivate={() => {
          setShowPromoModal(false);
          // User is already on wallet screen, so just close modal
        }}
        locale={locale}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    padding: 8,
  },
  backText: {
    color: '#FF6B6B',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  placeholder: {
    width: 50,
  },
  content: {
    padding: 16,
  },
  balanceCard: {
    backgroundColor: '#FF6B6B',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  balanceLabel: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
  },
  balanceUnit: {
    color: '#fff',
    fontSize: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  adButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  adButtonDisabled: {
    opacity: 0.6,
  },
  adButtonEmoji: {
    fontSize: 32,
    marginRight: 16,
  },
  adButtonContent: {
    flex: 1,
  },
  adButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  adButtonReward: {
    color: '#fff',
    fontSize: 12,
    marginTop: 2,
  },
  adNote: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  packCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    position: 'relative',
  },
  packCardPopular: {
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  popularBadge: {
    position: 'absolute',
    top: -8,
    right: 16,
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  packInfo: {
    flex: 1,
  },
  packName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 2,
  },
  packTokens: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  bonusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  packBonus: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#4CAF50',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  savingsText: {
    fontSize: 10,
    color: '#4CAF50',
    fontStyle: 'italic',
  },
  valueText: {
    fontSize: 11,
    color: '#999',
  },
  packPricing: {
    alignItems: 'flex-end',
  },
  packPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginBottom: 4,
  },
  totalBadge: {
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  totalText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  pricingNotice: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  purchaseNote: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  discountBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  discountBannerIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  discountBannerContent: {
    flex: 1,
  },
  discountBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  discountBannerSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D4AF37',
  },
  discountPackBadge: {
    position: 'absolute',
    top: -8,
    left: 16,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  discountPackBadgeText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
  },
  originalPackPrice: {
    fontSize: 16,
    color: '#999',
    textDecorationLine: 'line-through',
    marginBottom: 4,
  },
  discountedPackPrice: {
    color: '#D4AF37',
    fontSize: 28,
  },
});

