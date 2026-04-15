'use client';

/**
 * Real Payout Preview Component
 *
 * Used in creator pricing UI to show estimated payout.
 *
 * Input: tokens (e.g. 500)
 * Output: estimated creator payout in selected currency
 *
 * INVARIANTS:
 * - TOKEN_PAYOUT_USD benchmark from canonical economy
 * - creator_receives_usd = tokens * 0.03
 * - Split: reference-only creator payout example / platform reference portion (display only)
 * - Currency conversion uses a fixed benchmark, not market rates
 *
 * Example: 500 tokens → $15.00 USD (500 * 0.03)
 */
import React, { useState, useMemo } from 'react';
import { TOKEN_PAYOUT_USD } from '@/lib/economyConfig';

type PayoutCurrency = 'USD' | 'EUR' | 'GBP' | 'PLN';

interface PayoutPreviewProps {
  /** Default token amount to display. */
  defaultTokens?: number;
  /** Whether to show the platform's share line. */
  showPlatformShare?: boolean;
  /** CSS class for the outer container. */
  className?: string;
}

const CURRENCY_SYMBOLS: Record<PayoutCurrency, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  PLN: 'zł',
};

export default function PayoutPreview({
  defaultTokens = 500,
  showPlatformShare = true,
  className = '',
}: PayoutPreviewProps) {
  const [tokens, setTokens] = useState<number>(defaultTokens);
  const [currency, setCurrency] = useState<PayoutCurrency>('USD');

  const calculations = useMemo(() => {
    const creatorReceivesUsd = tokens * TOKEN_PAYOUT_USD;
    const platformKeepsUsd = 0;
    const fxRate = 1;

    // For non-USD: multiply USD amount by the FX rate
    // e.g., $15 * 4.05 = 60.75 PLN
    const creatorReceivesLocal = currency === 'USD' ? creatorReceivesUsd : creatorReceivesUsd * fxRate;
    const platformKeepsLocal = currency === 'USD' ? platformKeepsUsd : platformKeepsUsd * fxRate;

    return {
      creatorReceivesUsd,
      creatorReceivesLocal,
      platformKeepsUsd,
      platformKeepsLocal,
    };
  }, [tokens, currency]);

  function formatAmount(amount: number, cur: PayoutCurrency): string {
    const sym = CURRENCY_SYMBOLS[cur];
    const formatted = amount.toFixed(2);
    if (cur === 'PLN') return `${formatted} ${sym}`;
    return `${sym}${formatted}`;
  }

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm ${className}`}>
      <div className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          💰 Payout Preview
        </h3>

        {/* Token Input */}
        <div className="mb-4">
          <label htmlFor="payout-tokens" className="block text-sm font-medium text-gray-700 mb-1">
            Tokens earned
          </label>
          <input
            id="payout-tokens"
            type="number"
            min={1}
            max={1000000}
            value={tokens}
            onChange={(e) => setTokens(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg font-semibold focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none transition"
          />
        </div>

        {/* Currency Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Display currency
          </label>
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(['USD', 'EUR', 'GBP', 'PLN'] as PayoutCurrency[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition ${
                  currency === c
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {CURRENCY_SYMBOLS[c]} {c}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-4">
          <div className="text-sm text-green-700 font-medium mb-1">
            Creator reference payout (not guaranteed)
          </div>
          <div className="text-3xl font-bold text-green-800">
            {formatAmount(calculations.creatorReceivesLocal, currency)}
          </div>
          {currency !== 'USD' && (
            <div className="text-sm text-green-600 mt-1">
              ≈ ${calculations.creatorReceivesUsd.toFixed(2)} USD
            </div>
          )}
        </div>

        {showPlatformShare && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
            <div className="text-sm text-gray-600 font-medium mb-1">
              Platform reference portion
            </div>
            <div className="text-lg font-semibold text-gray-700">
              {formatAmount(calculations.platformKeepsLocal, currency)}
            </div>
          </div>
        )}

        {/* Calculation Breakdown */}
        <div className="text-xs text-gray-400 space-y-1 mt-4 border-t border-gray-100 pt-4">
          <div>
            Rate: {tokens.toLocaleString()} tokens × ${TOKEN_PAYOUT_USD}/token = ${calculations.creatorReceivesUsd.toFixed(2)} USD
          </div>
          {currency !== 'USD' && (
            <div>
              FX benchmark: ${calculations.creatorReceivesUsd.toFixed(2)} = {formatAmount(calculations.creatorReceivesLocal, currency)}
            </div>
          )}
          <div className="italic">
            Internal conversion rates. Final payout may vary.
          </div>
        </div>
      </div>
    </div>
  );
}




