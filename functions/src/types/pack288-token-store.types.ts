/**
 * PACK 288 — Token Store & Purchases Types
 * 
 * Complete type definitions for token store, purchases, and payouts
 * across mobile (Android/iOS) and web platforms.
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// PURCHASE DATA MODELS
// ============================================================================

/**
 * Token purchase record in Firestore
 * Collection: tokenPurchases/{purchaseId}
 */
export interface TokenPurchase {
  purchaseId: string;
  userId: string;
  packageId: 'mini' | 'basic' | 'standard' | 'premium' | 'pro' | 'elite' | 'royal';
  tokens: number;
  basePricePLN: number;
  paidCurrency: string; // 'PLN' | 'EUR' | 'USD' | etc.
  paidAmount: number;
  platform: 'android' | 'ios' | 'web';
  provider: 'google_play' | 'app_store' | 'stripe';
  providerOrderId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Optional metadata
  metadata?: {
    deviceId?: string;
    ipHash?: string;
    country?: string;
    exchangeRate?: number;
  };
}

/**
 * Mobile IAP receipt data (iOS)
 */
export interface AppleReceiptData {
  receiptData: string; // Base64 encoded receipt
  transactionId: string;
  productId: string;
  purchaseDate: string;
  quantity: number;
}

/**
 * Mobile IAP receipt data (Android)
 */
export interface GoogleReceiptData {
  receiptData: string; // Purchase token
  orderId: string;
  productId: string;
  purchaseTime: number;
  purchaseState: number;
  signature: string;
}

/**
 * Receipt verification request
 */
export interface VerifyReceiptRequest {
  platform: 'ios' | 'android';
  receiptData: string;
  productId: string;
  userId: string;
}

/**
 * Receipt verification response
 */
export interface VerifyReceiptResponse {
  valid: boolean;
  packId?: string;
  tokens?: number;
  transactionId?: string;
  paidAmount?: number;
  paidCurrency?: string;
  error?: string;
  errorCode?: 'INVALID_RECEIPT' | 'ALREADY_CONSUMED' | 'EXPIRED' | 'FRAUD_DETECTED';
}

// ============================================================================
// PURCHASE REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Mobile purchase request (from client)
 */
export interface MobilePurchaseRequest {
  platform: 'android' | 'ios';
  providerReceipt: string;
  packageId: string;
  productId: string;
}

/**
 * Mobile purchase response
 */
export interface MobilePurchaseResponse {
  success: boolean;
  purchaseId?: string;
  tokensAdded?: number;
  newBalance?: number;
  error?: string;
  errorCode?: string;
}

/**
 * Web purchase request (Stripe)
 */
export interface WebPurchaseRequest {
  packageId: string;
  successUrl?: string;
  cancelUrl?: string;
}

/**
 * Web purchase response (checkout session)
 */
export interface WebPurchaseResponse {
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
}

/**
 * Stripe webhook event data
 */
export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      amount_total: number;
      currency: string;
      customer: string;
      metadata: {
        userId: string;
        packageId: string;
      };
      payment_status: string;
    };
  };
}

// ============================================================================
// SAFETY & COMPLIANCE TYPES
// ============================================================================

/**
 * Purchase fraud check result
 */
export interface FraudCheckResult {
  passed: boolean;
  riskScore: number; // 0-100, higher = more risky
  flags: string[];
  reason?: string;
}

/**
 * Monthly purchase limit tracking
 */
export interface MonthlyPurchaseLimit {
  userId: string;
  month: string; // YYYY-MM
  totalPLN: number;
  purchaseCount: number;
  limitExceeded: boolean;
  lastPurchaseAt: Timestamp;
}

/**
 * Age verification status
 */
export interface AgeVerification {
  userId: string;
  verified: boolean;
  birthDate?: string;
  verifiedAt?: Timestamp;
  method?: 'document' | 'credit_card' | 'manual';
}

// ============================================================================
// PAYOUT TYPES (from PACK 277, extended for PACK 288)
// ============================================================================

export const PAYOUT_RATE_PLN = 0.20; // 1 token = 0.20 PLN

/**
 * Payout request
 */
export interface PayoutRequest {
  userId: string;
  amountTokens: number;
  payoutMethod: 'stripe_connect' | 'bank_transfer' | 'wise' | 'paypal';
  payoutDetails: {
    accountId?: string;
    iban?: string;
    swift?: string;
    accountHolder?: string;
    email?: string;
  };
  currency?: string;
}

/**
 * Payout response
 */
export interface PayoutResponse {
  success: boolean;
  payoutId?: string;
  amountTokens?: number;
  amountPLN?: number;
  amountLocal?: number;
  localCurrency?: string;
  exchangeRate?: number;
  processingFee?: number;
  netAmount?: number;
  status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  estimatedArrival?: string;
  error?: string;
}

// ============================================================================
// MULTI-CURRENCY TYPES
// ============================================================================

/**
 * Exchange rate for currency conversion
 */
export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: Timestamp;
  source: 'NBP' | 'ECB' | 'MANUAL';
}

/**
 * Currency configuration
 */
export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  supported: boolean;
  payoutSupported: boolean;
}

/**
 * Multi-currency price
 */
export interface MultiCurrencyPrice {
  PLN: number;
  USD?: number;
  EUR?: number;
  GBP?: number;
  [currency: string]: number | undefined;
}

// ============================================================================
// STORE CONFIGURATION TYPES
// ============================================================================

/**
 * Token package configuration
 */
export interface TokenPackageConfig {
  id: string;
  name: string;
  tokens: number;
  basePricePLN: number;
  prices: MultiCurrencyPrice;
  active: boolean;
  order: number;
  popularBadge?: boolean;
  bonusPercent?: number;
  description?: string;
  mobileProductIds: {
    ios: string;
    android: string;
  };
  stripePriceId?: string;
}

/**
 * Store configuration
 */
export interface StoreConfig {
  enabled: boolean;
  maintenanceMode: boolean;
  packages: TokenPackageConfig[];
  purchaseLimits: {
    maxMonthlyPLN: number;
    minAge: number;
    maxPurchasesPerDay: number;
    cooldownMs: number;
  };
  payoutConfig: {
    ratePLN: number;
    minTokens: number;
    processingFeePercent: number;
    supportedMethods: string[];
  };
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export type PurchaseErrorCode =
  | 'INSUFFICIENT_AGE'
  | 'MONTHLY_LIMIT_EXCEEDED'
  | 'INVALID_RECEIPT'
  | 'ALREADY_CONSUMED'
  | 'PAYMENT_FAILED'
  | 'FRAUD_DETECTED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'PACKAGE_NOT_FOUND'
  | 'PACKAGE_INACTIVE'
  | 'STORE_MAINTENANCE';

export interface PurchaseError {
  code: PurchaseErrorCode;
  message: string;
  details?: any;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

/**
 * Purchase analytics event
 */
export interface PurchaseAnalytics {
  purchaseId: string;
  userId: string;
  packageId: string;
  tokens: number;
  revenue: {
    pln: number;
    usd: number;
  };
  platform: string;
  country?: string;
  timestamp: Timestamp;
}

/**
 * Conversion funnel tracking
 */
export interface ConversionFunnel {
  userId: string;
  viewedStore: Timestamp;
  selectedPackage?: Timestamp;
  initiatedCheckout?: Timestamp;
  completedPurchase?: Timestamp;
  packageId?: string;
  dropoffStage?: 'view' | 'select' | 'checkout';
}

// ============================================================================
// HELPER TYPE GUARDS
// ============================================================================

export function isValidPlatform(platform: string): platform is 'ios' | 'android' | 'web' {
  return ['ios', 'android', 'web'].includes(platform);
}

export function isValidPackageId(id: string): id is TokenPackageConfig['id'] {
  const validIds = ['mini', 'basic', 'standard', 'premium', 'pro', 'elite', 'royal'];
  return validIds.includes(id);
}

export function isValidCurrency(currency: string): boolean {
  const validCurrencies = ['PLN', 'USD', 'EUR', 'GBP'];
  return validCurrencies.includes(currency);
}