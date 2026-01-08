/**
 * PACK 277 — Wallet & Token Store Types
 * Unified wallet system for mobile + web with token packs and payouts
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// WALLET DATA TYPES
// ============================================================================

export interface WalletData {
  userId: string;
  tokensBalance: number;
  lifetimePurchasedTokens: number;
  lifetimeSpentTokens: number;
  lifetimeEarnedTokens: number;
  lastUpdated: Timestamp;
  createdAt?: Timestamp;
}

export type TransactionType = 
  | 'PURCHASE'   // Token pack purchase
  | 'SPEND'      // Spent on chat/call/calendar/event/tip
  | 'EARN'       // Earned from chat/call/media/calendar/events
  | 'REFUND'     // Refunded tokens (unused words, cancellation)
  | 'PAYOUT';    // Cashed out to fiat

export type TransactionSource =
  | 'CHAT'       // Chat interactions
  | 'CALL'       // Voice/video calls
  | 'CALENDAR'   // Calendar bookings
  | 'EVENT'      // Event tickets
  | 'TIP'        // Direct tips
  | 'STORE'      // Token pack purchase
  | 'BONUS'      // Promotional bonus
  | 'MEDIA'      // Paid media content
  | 'DIGITAL_PRODUCT'; // Digital product sales

// ============================================================================
// PACK 321 — CONTEXT-BASED REVENUE SPLIT TYPES
// ============================================================================

/**
 * Wallet Revenue Context Type
 * Defines the specific context for revenue splitting
 */
export type WalletRevenueContextType =
  | 'CHAT_PAID'              // Paid chat (text, images, voice notes) - 65/35
  | 'CALL_VOICE'             // Voice calls - 65/35
  | 'CALL_VIDEO'             // Video calls - 65/35
  | 'AI_SESSION'             // AI companion sessions - 65/35
  | 'MEDIA_PURCHASE'         // Media/products, digital content - 65/35
  | 'TIP'                    // Direct tips - 90/10
  | 'CALENDAR_BOOKING'       // 1:1 meeting bookings - 80/20
  | 'EVENT_TICKET'           // Event tickets - 80/20
  | 'AVALO_ONLY_REVENUE'     // 100% Avalo / 0% earner (generic)
  | 'AVALO_ONLY_VIDEO';      // 100% Avalo / 0% earner (AI video specific)

/**
 * Revenue split configuration
 */
export interface WalletRevenueSplit {
  platformShare: number;  // Avalo's percentage (0-1)
  earnerShare: number;    // Creator/Earner's percentage (0-1)
}

export interface WalletTransaction {
  txId: string;
  userId: string;
  type: TransactionType;
  source: TransactionSource;
  amountTokens: number;
  beforeBalance: number;
  afterBalance: number;
  metadata: {
    relatedId?: string;      // bookingId/chatId/eventId/callId
    notes?: string;
    packId?: string;         // For purchases
    paymentIntentId?: string; // For purchases
    receiptData?: string;    // For mobile IAP
    creatorId?: string;      // For earnings
    split?: {                // Revenue split details
      creatorAmount: number;
      avaloAmount: number;
      splitPercent: number;
    };
  };
  timestamp: Timestamp;
}

// ============================================================================
// TOKEN PACK TYPES
// ============================================================================

export interface TokenPack {
  id: string;
  name: string;              // Mini, Basic, Standard, Premium, Pro, Elite, Royal
  tokens: number;
  pricePLN: number;
  priceUSD?: number;         // Optional USD price
  priceEUR?: number;         // Optional EUR price
  active: boolean;
  order: number;             // Display order
  popularBadge?: boolean;    // Show "Most Popular" badge
  bonusPercent?: number;     // Bonus tokens percentage (for promos)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// PURCHASE TYPES
// ============================================================================

export interface PurchaseRequest {
  userId: string;
  packId: string;
  platform: 'ios' | 'android' | 'web';
  paymentIntentId?: string;  // For web (Stripe)
  receiptData?: string;      // For mobile IAP
  deviceId?: string;
  ipHash?: string;
}

export interface PurchaseResponse {
  success: boolean;
  txId?: string;
  newBalance?: number;
  tokensAdded?: number;
  error?: string;
}

export interface VerifyReceiptRequest {
  platform: 'ios' | 'android';
  receiptData: string;
  productId: string;
  userId: string;
}

export interface VerifyReceiptResponse {
  valid: boolean;
  packId?: string;
  tokens?: number;
  transactionId?: string;
  error?: string;
}

// ============================================================================
// PAYOUT TYPES
// ============================================================================

export const PAYOUT_RATE = 0.20; // 1 token = 0.20 PLN
export const MIN_PAYOUT_TOKENS = 1000; // Minimum 200 PLN payout

export interface PayoutRequest {
  userId: string;
  amountTokens: number;
  payoutMethod: 'stripe_connect' | 'bank_transfer' | 'wise';
  payoutDetails: {
    accountId?: string;
    iban?: string;
    swift?: string;
    accountHolder?: string;
  };
  currency?: string; // Default PLN
}

export interface PayoutResponse {
  success: boolean;
  txId?: string;
  amountTokens?: number;
  amountPLN?: number;
  amountLocal?: number;
  localCurrency?: string;
  exchangeRate?: number;
  processingFee?: number;
  netAmount?: number;
  status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error?: string;
}

export interface PayoutRecord {
  id: string;
  userId: string;
  amountTokens: number;
  amountPLN: number;
  amountLocal?: number;
  localCurrency?: string;
  exchangeRate?: number;
  processingFee: number;
  netAmount: number;
  payoutMethod: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  kycVerified: boolean;
  requestedAt: Timestamp;
  processedAt?: Timestamp;
  completedAt?: Timestamp;
  failureReason?: string;
  adminNotes?: string;
}

// ============================================================================
// SPEND/EARN/REFUND SERVICE TYPES
// ============================================================================

export interface SpendTokensRequest {
  userId: string;
  amountTokens: number;
  source: TransactionSource;
  relatedId: string;
  creatorId?: string;       // If spending on creator content
  metadata?: Record<string, any>;
  // PACK 321: Context-based revenue split (optional for backward compatibility)
  contextType?: WalletRevenueContextType;
  contextRef?: string;      // e.g. "chat:<chatId>", "calendar:<bookingId>"
}

export interface SpendTokensResponse {
  success: boolean;
  txId?: string;
  newBalance?: number;
  creatorEarned?: number;
  avaloShare?: number;
  error?: string;
}

export interface EarnTokensRequest {
  userId: string;
  amountTokens: number;
  source: TransactionSource;
  relatedId: string;
  payerId?: string;         // Who paid for this earning
  metadata?: Record<string, any>;
}

export interface EarnTokensResponse {
  success: boolean;
  txId?: string;
  newBalance?: number;
  error?: string;
}

export interface RefundTokensRequest {
  userId: string;
  amountTokens: number;
  source: TransactionSource;
  relatedId: string;
  reason: string;
  metadata?: Record<string, any>;
  // PACK 321: Context-aware refunds
  contextType?: WalletRevenueContextType;
  refundPlatformShare?: boolean;  // True if platform should also refund commission
  originalTransactionId?: string;  // Reference to original spend transaction
  earnerUserId?: string | null;    // The earner from the original transaction
}

export interface RefundTokensResponse {
  success: boolean;
  txId?: string;
  newBalance?: number;
  error?: string;
}