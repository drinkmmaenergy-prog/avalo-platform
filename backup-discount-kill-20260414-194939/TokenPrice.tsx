import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useLocaleContext } from '../contexts/LocaleContext';
import { DiscountOffer } from '../../shared/types/discounts';
import { applyDiscountToPrice, isDiscountValid } from '../../shared/utils/discountEngine';

interface TokenPriceProps {
  baseUsdPrice: number;
  plnPrice?: number; // Optional PLN price from pricing table
  showApproximate?: boolean;
  showNotice?: boolean;
  style?: any;
  approximateStyle?: any;
  noticeStyle?: any;
  discount?: DiscountOffer | null; // Phase 31C: Discount support
  showDiscountBadge?: boolean; // Phase 31C: Show discount percentage
}

/**
 * Component for displaying token prices in local currency
 * UI-ONLY: Does not modify backend pricing, just displays prices
 * Phase 31B: Region-based display with PLN pricing table support
 * Phase 31C: Adaptive discount display support
 */
export const TokenPrice: React.FC<TokenPriceProps> = ({
  baseUsdPrice,
  plnPrice,
  showApproximate = true,
  showNotice = false,
  style,
  approximateStyle,
  noticeStyle,
  discount,
  showDiscountBadge = true,
}) => {
  const { getDisplayPrice, currency, region, locale } = useLocaleContext();
  
  // Apply discount if valid (UI-ONLY)
  const priceWithDiscount = applyDiscountToPrice(baseUsdPrice, discount);
  const hasValidDiscount = discount && isDiscountValid(discount) && priceWithDiscount.hasDiscount;
  
  // Use PLN pricing table if provided and region is PL
  const displayPrice = (plnPrice && region === 'PL')
    ? { formatted: `${plnPrice.toFixed(2)} PLN`, amount: plnPrice }
    : getDisplayPrice(hasValidDiscount ? priceWithDiscount.displayPrice : baseUsdPrice);

  // Localized notice text
  const noticeText = locale === 'pl'
    ? 'Globalne rozliczenie odbywa się w USD — bez dopłat i przewalutowań'
    : 'Global billing uses USD — no surcharge or conversion fees';

  return (
    <View style={styles.container}>
      {hasValidDiscount && (
        <View style={styles.discountRow}>
          {showDiscountBadge && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountBadgeText}>
                -{discount.discountPercent}%
              </Text>
            </View>
          )}
          <Text style={[styles.originalPrice, style]}>
            ${priceWithDiscount.originalPrice.toFixed(2)}
          </Text>
        </View>
      )}
      <Text style={[hasValidDiscount ? styles.discountedPrice : styles.price, style]}>
        {displayPrice.formatted}
      </Text>
      {showApproximate && currency !== 'USD' && !plnPrice && (
        <Text style={[styles.approximate, approximateStyle]}>
          ≈ ${baseUsdPrice.toFixed(2)} USD
        </Text>
      )}
      {showNotice && region === 'PL' && plnPrice && (
        <Text style={[styles.notice, noticeStyle]}>
          {noticeText}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  discountBadge: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  discountBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0F0F0F',
  },
  originalPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  discountedPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#D4AF37',
  },
  approximate: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  notice: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default TokenPrice;
