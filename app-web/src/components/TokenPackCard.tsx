'use client';

/**
 * PHASE 5.1 — Token Pack Card Component
 * 
 * Display-only component for showing token pack options.
 * NO pricing logic — all prices come from CANONICAL_TOKEN_PACKS.
 * NO business logic — just presentation.
 * 
 * @version v1.0
 */
import React from 'react';
import type { CanonicalTokenPack } from '@/types/phase33.types';
import { formatPackPrice } from '@/lib/services/phase33';

type Currency = 'USD' | 'EUR' | 'PLN' | 'GBP';

interface TokenPackCardProps {
  pack: CanonicalTokenPack;
  currency: Currency;
  isSelected?: boolean;
  isPopular?: boolean;
  isLoading?: boolean;
  onSelect: (pack: CanonicalTokenPack) => void;
  disabled?: boolean;
  /** FIX 112: Show +20% first-purchase bonus badge */
  showFirstPurchaseBonus?: boolean;
}

export default function TokenPackCard({
  pack,
  currency,
  isSelected = false,
  isPopular = false,
  isLoading = false,
  onSelect,
  disabled = false,
  showFirstPurchaseBonus = false,
}: TokenPackCardProps) {
  const handleClick = () => {
    if (!disabled && !isLoading) {
      onSelect(pack);
    }
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`Select ${pack.packId} pack with ${pack.tokens} tokens`}
      aria-selected={isSelected}
      aria-disabled={disabled || isLoading}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`
        relative rounded-xl border-2 p-6 transition cursor-pointer
        ${isSelected
          ? 'border-pink-500 bg-pink-50'
          : 'border-gray-200 hover:border-pink-300'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2
      `}
    >
      {/* Popular Badge */}
      {isPopular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full">
          POPULAR
        </div>
      )}

      {/* FIX 112: First purchase +20% bonus badge */}
      {showFirstPurchaseBonus && (
        <span className="absolute -top-2 -right-2 bg-green-500 text-white text-[9px] px-2 py-0.5 rounded-full font-bold">
          +20%
        </span>
      )}

      {/* Card Content */}
      <div className="text-center">
        {/* Token Icon */}
        <div className="text-3xl mb-2" aria-hidden="true">
          💎
        </div>

        {/* Pack Name */}
        <div className="text-lg font-bold text-gray-900 mb-1">
          {pack.packId}
        </div>

        {/* Token Amount */}
        <div className="text-3xl font-bold text-pink-600 mb-2">
          {pack.tokens.toLocaleString()}
        </div>
        <div className="text-sm text-gray-500 mb-4">tokens</div>

        {/* Price */}
        <div className="text-xl font-bold text-gray-900">
          {formatPackPrice(pack, currency)}
        </div>

        {/* Action Button */}
        <button
          type="button"
          disabled={disabled || isLoading}
          className={`
            mt-4 w-full py-2 px-4 rounded-lg font-medium transition
            ${isLoading && isSelected
              ? 'bg-gray-300 cursor-wait text-gray-600'
              : 'bg-pink-600 hover:bg-pink-700 text-white'
            }
            ${disabled ? 'cursor-not-allowed' : ''}
          `}
        >
          {isLoading && isSelected ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Redirecting...
            </span>
          ) : (
            'Buy Now'
          )}
        </button>
      </div>
    </div>
  );
}


