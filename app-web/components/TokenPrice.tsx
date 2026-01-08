/**
 * TokenPrice Component (Web)
 * UI-only price display with discount support
 * Phase 31B: Region-based pricing
 * Phase 31C: Adaptive discount display
 */

'use client';

import React from 'react';
import { DiscountOffer } from '../../shared/types/discounts';
import { applyDiscountToPrice, isDiscountValid } from '../../shared/utils/discountEngine';

interface TokenPriceProps {
  baseUsdPrice: number;
  plnPrice?: number;
  showApproximate?: boolean;
  className?: string;
  discount?: DiscountOffer | null;
  showDiscountBadge?: boolean;
}

export const TokenPrice: React.FC<TokenPriceProps> = ({
  baseUsdPrice,
  plnPrice,
  showApproximate = false,
  className = '',
  discount,
  showDiscountBadge = true,
}) => {
  // Apply discount if valid (UI-ONLY)
  const priceWithDiscount = applyDiscountToPrice(baseUsdPrice, discount || null);
  const hasValidDiscount = discount && isDiscountValid(discount) && priceWithDiscount.hasDiscount;

  // Determine display price
  const displayPrice = plnPrice
    ? `${plnPrice.toFixed(2)} PLN`
    : `$${(hasValidDiscount ? priceWithDiscount.displayPrice : baseUsdPrice).toFixed(2)}`;

  return (
    <div className="flex flex-col items-center">
      {hasValidDiscount && (
        <div className="flex items-center gap-2 mb-1">
          {showDiscountBadge && (
            <span className="px-2 py-0.5 text-xs font-black bg-gold text-black rounded">
              -{discount.discountPercent}%
            </span>
          )}
          <span className="text-sm text-gray-400 line-through">
            ${priceWithDiscount.originalPrice.toFixed(2)}
          </span>
        </div>
      )}
      <span className={`font-semibold ${hasValidDiscount ? 'text-gold text-xl' : ''} ${className}`}>
        {displayPrice}
      </span>
      {showApproximate && displayPrice.includes('PLN') && (
        <span className="text-xs text-gray-500 mt-1">
          ≈ ${baseUsdPrice.toFixed(2)} USD
        </span>
      )}
    </div>
  );
};

export default TokenPrice;