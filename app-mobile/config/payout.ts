/**
 * Payout Configuration
 * Single source of truth for all payout-related values in the Avalo app.
 * 
 * @description This file contains token conversion rates, withdrawal fees, 
 * and payout limits. Edit these values to update payout settings globally.
 */

// ============================================================================
// TOKEN TO CURRENCY CONVERSION
// ============================================================================

/**
 * Global token to EUR conversion rate
 * 1 token = X EUR
 */
export const TOKEN_TO_EUR_RATE = 0.05; // 1 token = €0.05

/**
 * Convert tokens to EUR
 */
export function tokensToEUR(tokens: number): number {
  return tokens * TOKEN_TO_EUR_RATE;
}

/**
 * Convert EUR to tokens
 */
export function eurToTokens(eur: number): number {
  return Math.floor(eur / TOKEN_TO_EUR_RATE);
}

// ============================================================================
// WITHDRAWAL METHODS
// ============================================================================

export type PayoutMethod = 'paypal' | 'bank' | 'revolut' | 'crypto';

export interface WithdrawalFee {
  /** Fee type: 'percent' for percentage-based, 'flat' for fixed amount */
  type: 'percent' | 'flat';
  
  /** Fee value (percentage as decimal or flat EUR amount) */
  value: number;
  
  /** Minimum fee amount in EUR (for percentage-based fees) */
  minFee?: number;
  
  /** Maximum fee amount in EUR (for percentage-based fees) */
  maxFee?: number;
}

export interface PayoutMethodConfig {
  /** Method identifier */
  method: PayoutMethod;
  
  /** Display name */
  displayName: string;
  
  /** Fee configuration */
  fee: WithdrawalFee;
  
  /** Minimum withdrawal amount in tokens */
  minWithdrawal: number;
  
  /** Maximum withdrawal amount in tokens */
  maxWithdrawal: number;
  
  /** Processing time in business days */
  processingDays: string;
  
  /** Whether this method is currently enabled */
  enabled: boolean;
}

// ============================================================================
// PAYOUT METHOD CONFIGURATIONS
// ============================================================================

export const PAYOUT_METHODS: Record<PayoutMethod, PayoutMethodConfig> = {
  paypal: {
    method: 'paypal',
    displayName: 'PayPal',
    fee: {
      type: 'percent',
      value: 0.07, // 7%
      minFee: 0.50, // Minimum €0.50
      maxFee: 50.00, // Maximum €50.00
    },
    minWithdrawal: 100, // 100 tokens = €5.00
    maxWithdrawal: 100000, // 100,000 tokens = €5,000
    processingDays: '1-3',
    enabled: true,
  },
  
  bank: {
    method: 'bank',
    displayName: 'Bank Transfer (SEPA)',
    fee: {
      type: 'flat',
      value: 4.00, // Fixed €4.00 fee
    },
    minWithdrawal: 200, // 200 tokens = €10.00
    maxWithdrawal: 200000, // 200,000 tokens = €10,000
    processingDays: '3-5',
    enabled: true,
  },
  
  revolut: {
    method: 'revolut',
    displayName: 'Revolut',
    fee: {
      type: 'percent',
      value: 0.05, // 5%
      minFee: 0.25, // Minimum €0.25
      maxFee: 25.00, // Maximum €25.00
    },
    minWithdrawal: 100, // 100 tokens = €5.00
    maxWithdrawal: 150000, // 150,000 tokens = €7,500
    processingDays: '1-2',
    enabled: true,
  },
  
  crypto: {
    method: 'crypto',
    displayName: 'Cryptocurrency (USDT/USDC)',
    fee: {
      type: 'percent',
      value: 0.02, // 2%
      minFee: 1.00, // Minimum €1.00 (network fees)
      maxFee: 100.00, // Maximum €100.00
    },
    minWithdrawal: 200, // 200 tokens = €10.00
    maxWithdrawal: 500000, // 500,000 tokens = €25,000
    processingDays: '1',
    enabled: true,
  },
};

// ============================================================================
// WITHDRAWAL LIMITS
// ============================================================================

export const WITHDRAWAL_LIMITS = {
  /** Minimum tokens required to request any withdrawal */
  GLOBAL_MIN_TOKENS: 100, // €5.00
  
  /** Maximum daily withdrawal in tokens */
  MAX_DAILY_TOKENS: 50000, // €2,500
  
  /** Maximum monthly withdrawal in tokens */
  MAX_MONTHLY_TOKENS: 400000, // €20,000
  
  /** Maximum number of pending withdrawal requests per user */
  MAX_PENDING_REQUESTS: 3,
  
  /** Cooldown period between withdrawals in hours */
  WITHDRAWAL_COOLDOWN_HOURS: 24,
} as const;

// ============================================================================
// WITHDRAWAL THRESHOLDS & VERIFICATION
// ============================================================================

export const VERIFICATION_REQUIREMENTS = {
  /** Withdrawal amount that requires basic verification (in tokens) */
  BASIC_VERIFICATION_THRESHOLD: 10000, // €500
  
  /** Withdrawal amount that requires enhanced verification (in tokens) */
  ENHANCED_VERIFICATION_THRESHOLD: 50000, // €2,500
  
  /** Total monthly volume that triggers additional checks (in tokens) */
  MONTHLY_VOLUME_REVIEW_THRESHOLD: 200000, // €10,000
} as const;

// ============================================================================
// FEE CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate withdrawal fee for a specific method and amount
 */
export function calculateWithdrawalFee(
  tokens: number,
  method: PayoutMethod
): { feeEUR: number; feeTokens: number } {
  const config = PAYOUT_METHODS[method];
  const amountEUR = tokensToEUR(tokens);
  
  let feeEUR: number;
  
  if (config.fee.type === 'percent') {
    // Calculate percentage-based fee
    feeEUR = amountEUR * config.fee.value;
    
    // Apply min/max limits
    if (config.fee.minFee && feeEUR < config.fee.minFee) {
      feeEUR = config.fee.minFee;
    }
    if (config.fee.maxFee && feeEUR > config.fee.maxFee) {
      feeEUR = config.fee.maxFee;
    }
  } else {
    // Flat fee
    feeEUR = config.fee.value;
  }
  
  // Convert fee back to tokens for display
  const feeTokens = eurToTokens(feeEUR);
  
  return {
    feeEUR: Math.round(feeEUR * 100) / 100, // Round to 2 decimals
    feeTokens,
  };
}

/**
 * Calculate net payout amount after fees
 */
export function calculateNetPayout(
  tokens: number,
  method: PayoutMethod
): {
  grossEUR: number;
  feeEUR: number;
  netEUR: number;
  feeTokens: number;
} {
  const grossEUR = tokensToEUR(tokens);
  const { feeEUR, feeTokens } = calculateWithdrawalFee(tokens, method);
  const netEUR = Math.max(0, grossEUR - feeEUR);
  
  return {
    grossEUR: Math.round(grossEUR * 100) / 100,
    feeEUR: Math.round(feeEUR * 100) / 100,
    netEUR: Math.round(netEUR * 100) / 100,
    feeTokens,
  };
}

/**
 * Validate withdrawal request
 */
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
  
  // Check if method is enabled
  if (!config.enabled) {
    return {
      valid: false,
      error: `${config.displayName} withdrawals are currently unavailable`,
      errorCode: 'METHOD_DISABLED',
    };
  }
  
  // Check minimum withdrawal
  if (tokens < config.minWithdrawal) {
    const minEUR = tokensToEUR(config.minWithdrawal);
    return {
      valid: false,
      error: `Minimum withdrawal for ${config.displayName} is ${config.minWithdrawal} tokens (€${minEUR.toFixed(2)})`,
      errorCode: 'BELOW_MINIMUM',
    };
  }
  
  // Check maximum withdrawal
  if (tokens > config.maxWithdrawal) {
    const maxEUR = tokensToEUR(config.maxWithdrawal);
    return {
      valid: false,
      error: `Maximum withdrawal for ${config.displayName} is ${config.maxWithdrawal} tokens (€${maxEUR.toFixed(2)})`,
      errorCode: 'ABOVE_MAXIMUM',
    };
  }
  
  // Check global minimum
  if (tokens < WITHDRAWAL_LIMITS.GLOBAL_MIN_TOKENS) {
    const minEUR = tokensToEUR(WITHDRAWAL_LIMITS.GLOBAL_MIN_TOKENS);
    return {
      valid: false,
      error: `Minimum withdrawal amount is ${WITHDRAWAL_LIMITS.GLOBAL_MIN_TOKENS} tokens (€${minEUR.toFixed(2)})`,
      errorCode: 'BELOW_GLOBAL_MINIMUM',
    };
  }
  
  // Check balance
  if (tokens > currentBalance) {
    return {
      valid: false,
      error: 'Insufficient token balance',
      errorCode: 'INSUFFICIENT_BALANCE',
    };
  }
  
  // Check daily limit
  if (tokens > WITHDRAWAL_LIMITS.MAX_DAILY_TOKENS) {
    const maxEUR = tokensToEUR(WITHDRAWAL_LIMITS.MAX_DAILY_TOKENS);
    return {
      valid: false,
      error: `Daily withdrawal limit is ${WITHDRAWAL_LIMITS.MAX_DAILY_TOKENS} tokens (€${maxEUR.toFixed(2)})`,
      errorCode: 'EXCEEDS_DAILY_LIMIT',
    };
  }
  
  return { valid: true };
}

/**
 * Get recommended payout method based on amount
 */
export function getRecommendedPayoutMethod(tokens: number): {
  method: PayoutMethod;
  reason: string;
} {
  const amountEUR = tokensToEUR(tokens);
  
  // For small amounts, recommend lowest fee
  if (amountEUR < 20) {
    return {
      method: 'crypto',
      reason: 'Lowest fees for small amounts',
    };
  }
  
  // For medium amounts, recommend Revolut
  if (amountEUR < 100) {
    return {
      method: 'revolut',
      reason: 'Fast processing with competitive fees',
    };
  }
  
  // For large amounts, recommend bank transfer
  if (amountEUR >= 100) {
    return {
      method: 'bank',
      reason: 'Fixed fee best for larger amounts',
    };
  }
  
  return {
    method: 'paypal',
    reason: 'Popular and widely accepted',
  };
}

// ============================================================================
// EXPORT ALL CONFIGS
// ============================================================================

export default {
  TOKEN_TO_EUR_RATE,
  PAYOUT_METHODS,
  WITHDRAWAL_LIMITS,
  VERIFICATION_REQUIREMENTS,
  // Helper functions
  tokensToEUR,
  eurToTokens,
  calculateWithdrawalFee,
  calculateNetPayout,
  validateWithdrawal,
  getRecommendedPayoutMethod,
};