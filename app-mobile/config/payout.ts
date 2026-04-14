/**
 * MOBILE PAYOUT CONFIG
 * Canonical payout rules for Avalo mobile.
 *
 * IMPORTANT:
 * - All payout values are reference values only.
 * - Final withdrawable amounts may be reduced by taxes, processor fees,
 *   payout fees, regulatory deductions, FX effects, refunds, chargebacks
 *   and other external costs.
 * - Canonical payout benchmark is derived conservatively from the cheapest
 *   token economics of the 10,000-token pack.
 * - Stripe payout fee of 5% is charged to the withdrawing user.
 */

import { CANONICAL_ECONOMY } from './canonicalEconomy';

export type PayoutMethod = 'stripe';

export interface WithdrawalFee {
  type: 'percent';
  value: number;
}

export interface PayoutMethodConfig {
  method: PayoutMethod;
  displayName: string;
  fee: WithdrawalFee;
  minWithdrawal: number;
  maxWithdrawal: number;
  processingDays: string;
  enabled: boolean;
  referenceOnly: boolean;
}

export const TOKEN_PAYOUT_RATE_USD = CANONICAL_ECONOMY.payout.tokenPayoutUsd;
export const PAYOUT_FEE_PERCENT = CANONICAL_ECONOMY.payout.payoutFeePlatformPercent;

export function tokensToUSD(tokens: number): number {
  return tokens * TOKEN_PAYOUT_RATE_USD;
}

export function usdToTokens(usd: number): number {
  if (TOKEN_PAYOUT_RATE_USD <= 0) return 0;
  return Math.floor(usd / TOKEN_PAYOUT_RATE_USD);
}

export const PAYOUT_METHODS: Record<PayoutMethod, PayoutMethodConfig> = {
  stripe: {
    method: 'stripe',
    displayName: 'Stripe Payout',
    fee: {
      type: 'percent',
      value: PAYOUT_FEE_PERCENT,
    },
    minWithdrawal: 100,
    maxWithdrawal: 250000,
    processingDays: '3-7',
    enabled: true,
    referenceOnly: true,
  },
};

export const WITHDRAWAL_LIMITS = {
  GLOBAL_MIN_TOKENS: 100,
  MAX_DAILY_TOKENS: 50000,
  MAX_MONTHLY_TOKENS: 400000,
  MAX_PENDING_REQUESTS: 3,
  WITHDRAWAL_COOLDOWN_HOURS: 24,
} as const;

export const VERIFICATION_REQUIREMENTS = {
  BASIC_VERIFICATION_THRESHOLD: 10000,
  ENHANCED_VERIFICATION_THRESHOLD: 50000,
  MONTHLY_VOLUME_REVIEW_THRESHOLD: 200000,
} as const;

export const PAYOUT_LEGAL_NOTICE_EN = `All payout values, token value references, split percentages, creator earnings previews and revenue estimates in Avalo are informational reference values only. Final withdrawable amounts may be reduced by VAT, payout processing fees, payment provider fees, taxes, statutory deductions, refunds, chargebacks, regulatory costs, compliance obligations, FX effects and other external costs.

The canonical payout benchmark is calculated conservatively using the cheapest token economics derived from the 10,000-token pack.

Stripe payout fee of 5% is deducted from the withdrawing user's payout.

Canonical payout benchmark: 0.04 USD/token.`;

export const PAYOUT_LEGAL_NOTICE_PL = `Wszystkie prezentowane w Avalo wartości payoutu, wartości tokena, splitów, szacowanych zarobków i prognoz przychodów mają charakter orientacyjny i referencyjny. Ostateczna kwota wypłaty może zostać pomniejszona o VAT, opłaty operatorów płatniczych, payout fee, podatki, obowiązkowe potrącenia prawne, refundy, chargebacki, koszty regulacyjne, obowiązki compliance, różnice kursowe i inne koszty zewnętrzne.

Referencyjna wartość tokena dla potrzeb payoutu i prezentacji szacunkowych zarobków jest liczona konserwatywnie na podstawie ekonomiki najtańszego tokena wynikającego z zakupu paczki 10 000 tokenów.

Opłata payout fee operatora płatniczego w wysokości 5% jest potrącana z wypłaty użytkownika.

Kanoniczny benchmark payoutu: 0.04 USD/token.`;

export function calculateWithdrawalFee(
  tokens: number,
  method: PayoutMethod = 'stripe'
): { feeUSD: number; feeTokens: number } {
  const config = PAYOUT_METHODS[method];
  const grossUSD = tokensToUSD(tokens);
  const feeUSD = grossUSD * config.fee.value;
  const feeTokens = usdToTokens(feeUSD);

  return {
    feeUSD: Math.round(feeUSD * 100) / 100,
    feeTokens,
  };
}

export function calculateNetPayout(
  tokens: number,
  method: PayoutMethod = 'stripe'
): {
  grossUSD: number;
  feeUSD: number;
  netUSD: number;
  feeTokens: number;
  referenceOnly: boolean;
} {
  const grossUSD = tokensToUSD(tokens);
  const { feeUSD, feeTokens } = calculateWithdrawalFee(tokens, method);
  const netUSD = Math.max(0, grossUSD - feeUSD);

  return {
    grossUSD: Math.round(grossUSD * 100) / 100,
    feeUSD: Math.round(feeUSD * 100) / 100,
    netUSD: Math.round(netUSD * 100) / 100,
    feeTokens,
    referenceOnly: true,
  };
}

export function validateWithdrawal(
  tokens: number,
  method: PayoutMethod,
  currentBalance: number
): {
  valid: boolean;
  error?: string;
  errorCode?: string;
} {
  const config = PAYOUT_METHODS[method];

  if (!config.enabled) {
    return {
      valid: false,
      error: `${config.displayName} payouts are currently unavailable`,
      errorCode: 'METHOD_DISABLED',
    };
  }

  if (tokens < config.minWithdrawal) {
    const minUSD = tokensToUSD(config.minWithdrawal);
    return {
      valid: false,
      error: `Minimum withdrawal for ${config.displayName} is ${config.minWithdrawal} tokens ($${minUSD.toFixed(2)} reference value)`,
      errorCode: 'BELOW_MINIMUM',
    };
  }

  if (tokens > config.maxWithdrawal) {
    const maxUSD = tokensToUSD(config.maxWithdrawal);
    return {
      valid: false,
      error: `Maximum withdrawal for ${config.displayName} is ${config.maxWithdrawal} tokens ($${maxUSD.toFixed(2)} reference value)`,
      errorCode: 'ABOVE_MAXIMUM',
    };
  }

  if (tokens < WITHDRAWAL_LIMITS.GLOBAL_MIN_TOKENS) {
    const minUSD = tokensToUSD(WITHDRAWAL_LIMITS.GLOBAL_MIN_TOKENS);
    return {
      valid: false,
      error: `Minimum withdrawal amount is ${WITHDRAWAL_LIMITS.GLOBAL_MIN_TOKENS} tokens ($${minUSD.toFixed(2)} reference value)`,
      errorCode: 'BELOW_GLOBAL_MINIMUM',
    };
  }

  if (tokens > currentBalance) {
    return {
      valid: false,
      error: 'Insufficient token balance',
      errorCode: 'INSUFFICIENT_BALANCE',
    };
  }

  if (tokens > WITHDRAWAL_LIMITS.MAX_DAILY_TOKENS) {
    const maxUSD = tokensToUSD(WITHDRAWAL_LIMITS.MAX_DAILY_TOKENS);
    return {
      valid: false,
      error: `Daily withdrawal limit is ${WITHDRAWAL_LIMITS.MAX_DAILY_TOKENS} tokens ($${maxUSD.toFixed(2)} reference value)`,
      errorCode: 'EXCEEDS_DAILY_LIMIT',
    };
  }

  return { valid: true };
}

export function getRecommendedPayoutMethod(tokens: number): {
  method: PayoutMethod;
  reason: string;
} {
  return {
    method: 'stripe',
    reason: 'Canonical payout rail for Avalo. Final payout is a reference value and may be reduced by fees, taxes and other deductions.',
  };
}

export default {
  TOKEN_PAYOUT_RATE_USD,
  PAYOUT_FEE_PERCENT,
  PAYOUT_METHODS,
  WITHDRAWAL_LIMITS,
  VERIFICATION_REQUIREMENTS,
  PAYOUT_LEGAL_NOTICE_EN,
  PAYOUT_LEGAL_NOTICE_PL,
  tokensToUSD,
  usdToTokens,
  calculateWithdrawalFee,
  calculateNetPayout,
  validateWithdrawal,
  getRecommendedPayoutMethod,
};
