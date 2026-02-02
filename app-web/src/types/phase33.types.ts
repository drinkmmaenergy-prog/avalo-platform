/**
 * PHASE 3.3 — Web Core Integration Types
 * 
 * Types for Creator Panel, Payments, and Admin surfaces.
 * NO business logic — just TypeScript interfaces for backend contracts.
 */

// ============================================================================
// ROLE-BASED ACCESS CONTROL
// ============================================================================

export type UserRole = 'user' | 'creator' | 'admin';

export interface RoleGate {
  requiredRole: UserRole;
  redirect: string;
}

// ============================================================================
// CANONICAL TOKEN PACKS (READ-ONLY - from backend)
// ============================================================================

/**
 * Canonical token pack pricing.
 * Source: CANONICAL_TOKEN_PACKS in functions/src/payments/stripe/webhook.ts
 * NO discounts, NO coupons, NO overrides.
 */
export interface CanonicalTokenPack {
  packId: string;
  tokens: number;
  priceUSD: number;  // Price in USD cents
  priceEUR: number;  // Price in EUR cents
  pricePLN: number;  // Price in PLN groszy
  priceGBP: number;  // Price in GBP pence
}

/**
 * Canonical token packs - directly mapped from backend.
 * IMMUTABLE - any change requires explicit migration.
 */
export const CANONICAL_TOKEN_PACKS: Record<string, CanonicalTokenPack> = {
  MINI: { packId: 'MINI', tokens: 100, priceUSD: 549, priceEUR: 499, pricePLN: 2000, priceGBP: 449 },
  BASIC: { packId: 'BASIC', tokens: 300, priceUSD: 1599, priceEUR: 1499, pricePLN: 6000, priceGBP: 1299 },
  STANDARD: { packId: 'STANDARD', tokens: 500, priceUSD: 2699, priceEUR: 2499, pricePLN: 10000, priceGBP: 2199 },
  PREMIUM: { packId: 'PREMIUM', tokens: 1000, priceUSD: 5299, priceEUR: 4999, pricePLN: 20000, priceGBP: 4399 },
  PRO: { packId: 'PRO', tokens: 2000, priceUSD: 10499, priceEUR: 9999, pricePLN: 40000, priceGBP: 8799 },
  ELITE: { packId: 'ELITE', tokens: 5000, priceUSD: 25999, priceEUR: 24999, pricePLN: 100000, priceGBP: 21999 },
};

// ============================================================================
// CREATOR PANEL TYPES
// ============================================================================

export interface CreatorEarningsSummary {
  userId: string;
  totalTokensEarnedAllTime: number;
  totalTokensEarnedThisMonth: number;
  withdrawableTokens: number;
  pendingTokens: number;
  availableForPayout: number;
  lastUpdated: Date;
}

export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'REJECTED';

export interface PayoutHistoryEntry {
  payoutId: string;
  userId: string;
  requestedTokens: number;
  amountFiatNetToUser: number;
  currency: string;
  rail: 'STRIPE' | 'WISE' | 'BANK_TRANSFER';
  status: PayoutStatus;
  createdAt: Date;
  processedAt?: Date;
  failureReason?: string;
}

export type StripeConnectStatus = 
  | 'NOT_CONNECTED'
  | 'PENDING_ONBOARDING'
  | 'ONBOARDING_INCOMPLETE'
  | 'ACTIVE'
  | 'RESTRICTED'
  | 'DISABLED';

export interface CreatorStripeConnectInfo {
  status: StripeConnectStatus;
  stripeAccountId?: string;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  currentlyDue?: string[];
  eventuallyDue?: string[];
  lastChecked: Date;
}

export interface CreatorAnalyticsDashboard {
  userId: string;
  period: 'day' | 'week' | 'month';
  
  // Earnings breakdown
  earningsBySource: {
    chat: number;
    calls: number;
    contentUnlocks: number;
    events: number;
    subscriptions: number;
    tips: number;
  };
  
  // Engagement metrics
  totalViews: number;
  profileViews: number;
  totalInteractions: number;
  uniqueFans: number;
  
  // Conversion
  freeToPaidRate: number;
  repeatFanRate: number;
  avgSpendPerFan: number;
  
  // Time series
  dailyEarnings: Array<{ date: string; tokens: number }>;
  
  lastUpdated: Date;
}

// ============================================================================
// WEB TOKEN PURCHASE TYPES
// ============================================================================

export interface CheckoutSessionRequest {
  packageId: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutSessionResponse {
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
}

// ============================================================================
// ADMIN / OPS TYPES (READ-ONLY)
// ============================================================================

export interface FeatureFlagSummary {
  flagName: string;
  enabled: boolean;
  rolloutPercentage?: number;
  allowedRoles?: string[];
  expiresAt?: Date;
  lastUpdated: Date;
}

export interface TrustSignal {
  signalType: 'FRAUD_RISK' | 'AML_FLAG' | 'KYC_FAILED' | 'PAYOUT_HOLD' | 'ACCOUNT_RESTRICTION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  userId: string;
  description: string;
  createdAt: Date;
  resolvedAt?: Date;
}

export interface SystemHealthMetric {
  service: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  latencyMs: number;
  errorRate: number;
  lastChecked: Date;
}

export interface AdminOpsView {
  featureFlags: FeatureFlagSummary[];
  trustSignals: TrustSignal[];
  systemHealth: SystemHealthMetric[];
  snapshotTime: Date;
}
