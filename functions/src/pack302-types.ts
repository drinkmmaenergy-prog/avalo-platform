/**
 * PACK 302 — Unified Token & Subscription Checkout
 * Types and Interfaces
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TOKEN PACKAGES
// ============================================================================

export type TokenPackageId = 
  | 'MINI'
  | 'BASIC'
  | 'STANDARD'
  | 'PREMIUM'
  | 'PRO'
  | 'ELITE'
  | 'ROYAL';

export interface TokenPackage {
  id: TokenPackageId;
  tokens: number;
  pricePLN: number;
}

/**
 * Final Token Packages (PACK 302)
 * These prices are fixed and must not be changed
 */
export const TOKEN_PACKAGES: Record<TokenPackageId, TokenPackage> = {
  MINI: { id: 'MINI', tokens: 100, pricePLN: 31.99 },
  BASIC: { id: 'BASIC', tokens: 300, pricePLN: 85.99 },
  STANDARD: { id: 'STANDARD', tokens: 500, pricePLN: 134.99 },
  PREMIUM: { id: 'PREMIUM', tokens: 1000, pricePLN: 244.99 },
  PRO: { id: 'PRO', tokens: 2000, pricePLN: 469.99 },
  ELITE: { id: 'ELITE', tokens: 5000, pricePLN: 1125.99 },
  ROYAL: { id: 'ROYAL', tokens: 10000, pricePLN: 2149.99 },
};

// ============================================================================
// WALLET STRUCTURE
// ============================================================================

export interface UserWallet {
  userId: string;
  tokensBalance: number;
  lifetimePurchasedTokens: number;
  lifetimeEarnedTokens: number;
  lifetimeWithdrawnTokens: number;
  updatedAt: Timestamp;
}

// ============================================================================
// WALLET TRANSACTIONS
// ============================================================================

export type WalletTransactionType =
  | 'TOKEN_PURCHASE'
  | 'CHAT_SPEND'
  | 'CALL_SPEND'
  | 'CALENDAR_BOOKING'
  | 'CALENDAR_REFUND'
  | 'EVENT_TICKET'
  | 'EVENT_REFUND'
  | 'PAYOUT'
  | 'ADJUSTMENT';

export type WalletTransactionDirection = 'IN' | 'OUT';

export type WalletTransactionProvider = 
  | 'STRIPE' 
  | 'GOOGLE' 
  | 'APPLE' 
  | 'SYSTEM' 
  | 'USER';

export interface WalletTransaction {
  txId: string;
  userId: string;
  type: WalletTransactionType;
  direction: WalletTransactionDirection;
  amountTokens: number;
  externalId: string | null; // Stripe or Store transaction id
  provider: WalletTransactionProvider;
  createdAt: Timestamp;
  meta: {
    packageId?: string | null;
    chatId?: string | null;
    bookingId?: string | null;
    eventId?: string | null;
    reason?: string | null;
  };
}

// ============================================================================
// SUBSCRIPTIONS
// ============================================================================

export type SubscriptionTier = 'VIP' | 'ROYAL';

export type SubscriptionProvider = 
  | 'STRIPE' 
  | 'GOOGLE' 
  | 'APPLE' 
  | 'NONE';

export interface UserSubscriptions {
  userId: string;
  
  vipActive: boolean;
  vipPlanId: string | null;
  vipProvider: SubscriptionProvider;
  vipCurrentPeriodEnd: string | null; // ISO_DATETIME
  
  royalActive: boolean;
  royalPlanId: string | null;
  royalProvider: SubscriptionProvider;
  royalCurrentPeriodEnd: string | null; // ISO_DATETIME
  
  updatedAt: Timestamp;
}

// ============================================================================
// USER BENEFITS
// ============================================================================

export interface UserBenefits {
  vipActive: boolean;
  royalActive: boolean;
  callDiscountFactor: number; // 1.0 = no discount, 0.7 = 30% off, 0.5 = 50% off
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

// Web Token Checkout
export interface CreateTokenCheckoutRequest {
  userId: string;
  packageId: TokenPackageId;
  locale: string;
  currencyOverride?: string | null;
}

export interface CreateTokenCheckoutResponse {
  checkoutUrl: string;
  sessionId: string;
}

// Mobile Token Verification
export type MobilePlatform = 'GOOGLE' | 'APPLE';

export interface VerifyMobilePurchaseRequest {
  userId: string;
  platform: MobilePlatform;
  packageId: TokenPackageId;
  receipt: string;
}

export interface VerifyMobilePurchaseResponse {
  success: boolean;
  tokensAdded: number;
  newBalance: number;
  transactionId: string;
}

// Web Subscription Checkout
export interface CreateSubscriptionCheckoutRequest {
  userId: string;
  tier: SubscriptionTier;
  locale: string;
}

export interface CreateSubscriptionCheckoutResponse {
  checkoutUrl: string;
  sessionId: string;
}

// Mobile Subscription Sync
export type SubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'EXPIRED';

export interface SyncMobileSubscriptionRequest {
  userId: string;
  platform: MobilePlatform;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string; // ISO_DATETIME
  originalTransactionId: string;
}

export interface SyncMobileSubscriptionResponse {
  success: boolean;
  subscriptionUpdated: boolean;
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export type BillingAuditAction =
  | 'TOKEN_PURCHASE'
  | 'SUBSCRIPTION_STARTED'
  | 'SUBSCRIPTION_UPDATED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'MOBILE_PURCHASE_VERIFIED'
  | 'MOBILE_SUBSCRIPTION_SYNCED';

export interface BillingAuditLog {
  action: BillingAuditAction;
  userId: string;
  provider: WalletTransactionProvider;
  amount?: number;
  packageId?: string;
  tier?: SubscriptionTier;
  externalId?: string;
  timestamp: Timestamp;
}

// ============================================================================
// CURRENCY MAPPING
// ============================================================================

export interface CurrencyConfig {
  code: string;
  symbol: string;
  conversionRate: number; // Relative to PLN
}

export const REGION_DEFAULT_CURRENCY: Record<string, string> = {
  'pl-PL': 'PLN',
  'en-GB': 'GBP',
  'en-US': 'USD',
  'de-DE': 'EUR',
  'fr-FR': 'EUR',
  'es-ES': 'EUR',
  'it-IT': 'EUR',
};

export const CURRENCY_CONFIGS: Record<string, CurrencyConfig> = {
  PLN: { code: 'PLN', symbol: 'zł', conversionRate: 1.0 },
  EUR: { code: 'EUR', symbol: '€', conversionRate: 0.23 }, // Approximate
  GBP: { code: 'GBP', symbol: '£', conversionRate: 0.19 }, // Approximate
  USD: { code: 'USD', symbol: '$', conversionRate: 0.25 }, // Approximate
};

// ============================================================================
// CONSTANTS
// ============================================================================

export const PAYOUT_RATE_PLN_PER_TOKEN = 0.20; // Fixed: 1 token = 0.20 PLN

// Call discount factors
export const CALL_DISCOUNT_NONE = 1.0;
export const CALL_DISCOUNT_VIP = 0.7; // 30% off
export const CALL_DISCOUNT_ROYAL = 0.5; // 50% off

// Base call rates (tokens per minute) - before discounts
export const VOICE_CALL_BASE_RATE = 10;
export const VIDEO_CALL_BASE_RATE = 20;