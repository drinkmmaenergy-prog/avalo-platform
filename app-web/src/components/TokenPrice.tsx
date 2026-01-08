/**
 * TokenPrice Component (Web)
 * Phase 31B: Region-based token pricing display
 * UI-ONLY: Does not modify backend pricing
 */

import React from 'react';

interface TokenPriceProps {
  baseUsdPrice: number;
  plnPrice?: number; // Optional PLN price from pricing table
  showApproximate?: boolean;
  showNotice?: boolean;
  className?: string;
  approximateClassName?: string;
  noticeClassName?: string;
}

/**
 * Component for displaying token prices in local currency
 * Uses region detection from user's Firestore profile
 */
export const TokenPrice: React.FC<TokenPriceProps> = ({
  baseUsdPrice,
  plnPrice,
  showApproximate = true,
  showNotice = false,
  className = '',
  approximateClassName = '',
  noticeClassName = '',
}) => {
  // In web version, we'll use PLN if provided, otherwise USD
  // Region detection would come from user context in a full implementation
  const displayPrice = plnPrice 
    ? `${plnPrice.toFixed(2)} PLN`
    : `$${baseUsdPrice.toFixed(2)}`;

  const noticeText = 'Global billing uses USD — no surcharge or conversion fees';

  return (
    <div className="flex flex-col items-center">
      <span className={`text-base font-semibold text-gray-900 ${className}`}>
        {displayPrice}
      </span>
      {showApproximate && !plnPrice && (
        <span className={`text-xs text-gray-500 mt-1 ${approximateClassName}`}>
          ≈ ${baseUsdPrice.toFixed(2)} USD
        </span>
      )}
      {showNotice && plnPrice && (
        <span className={`text-xs text-gray-400 mt-2 italic text-center ${noticeClassName}`}>
          {noticeText}
        </span>
      )}
    </div>
  );
};

export default TokenPrice;