$ErrorActionPreference = "Stop"

$repo = "C:\a\avalo"
$src  = "$repo\functions\src"

Write-Host "=== monetization-autofix-3 ==="
Write-Host "[1/2] Fix PACK106 types (replace interface blocks)"

$pack106 = "$src\pack106-types.ts"
if (!(Test-Path $pack106)) { throw "Missing: $pack106" }

$txt = Get-Content $pack106 -Raw

function Replace-InterfaceBlock {
  param(
    [string]$content,
    [string]$interfaceName,
    [string]$replacementBlock
  )
  $pattern = "(?s)export\s+interface\s+$interfaceName\s*\{.*?\}\s*"
  if ($content -notmatch $pattern) {
    throw "Interface not found for replace: $interfaceName"
  }
  return [regex]::Replace($content, $pattern, $replacementBlock, 1)
}

# BaseTokenPriceConfig must match pack106-admin callsites:
# - referenceCurrency
# - updatedAt, updatedBy
# - approvals object exists
$baseTokenPriceBlock = @"
export interface BaseTokenPriceConfig {
  priceUSD: number;
  referenceCurrency?: 'USD';
  updatedAt?: FirebaseFirestore.Timestamp;
  updatedBy?: string;

  approvals?: {
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedBy?: string;
    requestedAt?: FirebaseFirestore.Timestamp;
    approvedBy?: string;
    approvedAt?: FirebaseFirestore.Timestamp;
    reason?: string;
  };
}
"@

$currencyStatsBlock = @"
export interface CurrencyDashboardStats {
  totalCurrencies: number;
  activeCurrencies?: number;

  staleRates?: number;
  lastRefresh?: FirebaseFirestore.Timestamp;

  topCurrencies?: Array<{
    code: string;
    transactions: number;
    volume: number;
  }>;
}
"@

$txt = Replace-InterfaceBlock -content $txt -interfaceName "BaseTokenPriceConfig" -replacementBlock $baseTokenPriceBlock
$txt = Replace-InterfaceBlock -content $txt -interfaceName "CurrencyDashboardStats" -replacementBlock $currencyStatsBlock

# Hard cleanup: remove duplicate stray merge blocks that introduced duplicate identifiers
# (they typically include "declare module" or repeated interface fragments)
$txt = $txt -replace "(?s)\/\*\s*AUTO-MERGE PACK106.*?\*\/\s*", ""
$txt = $txt -replace "(?s)\/\/\s*AUTO-MERGE PACK106.*?\r?\n", ""

Set-Content $pack106 $txt -NoNewline
Write-Host "[OK] PACK106 types patched: $pack106"

Write-Host "[2/2] Rewrite PACK302 types (USD canonical, match callsites)"

$pack302 = "$src\pack302-types.ts"

$pack302Content = @"
/**
 * PACK 302 — Unified Token & Subscription Checkout (USD Canonical)
 * Types and Interfaces
 *
 * NOTE:
 * - Canonical currency is USD (global).
 * - This file is a contract for callsites in:
 *   - pack302-helpers.ts
 *   - pack302-web-billing.ts
 *   - pack302-mobile-billing.ts
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TOKEN PACKAGES (IDs used by callsites)
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
  // Optional price metadata (kept optional to avoid breaking legacy callsites)
  priceUSD?: number;
}

export const TOKEN_PACKAGES: Record<TokenPackageId, TokenPackage> = {
  MINI: { id: 'MINI', tokens: 100 },
  BASIC: { id: 'BASIC', tokens: 300 },
  STANDARD: { id: 'STANDARD', tokens: 500 },
  PREMIUM: { id: 'PREMIUM', tokens: 1000 },
  PRO: { id: 'PRO', tokens: 2000 },
  ELITE: { id: 'ELITE', tokens: 5000 },
  ROYAL: { id: 'ROYAL', tokens: 10000 },
};

// ============================================================================
// WALLET STRUCTURE
// ============================================================================

export interface UserWallet {
  userId: string;

  // Callsites expect tokensBalance
  tokensBalance: number;

  lifetimePurchasedTokens: number;
  lifetimeEarnedTokens: number;
  lifetimeWithdrawnTokens: number;

  // createdAt was missing in callsites - make optional for compatibility
  createdAt?: Timestamp;

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

  // Callsites use amountTokens
  amountTokens: number;

  externalId: string | null;
  provider: WalletTransactionProvider;

  createdAt: Timestamp;

  meta?: {
    packageId?: TokenPackageId | string | null;
    chatId?: string | null;
    bookingId?: string | null;
    eventId?: string | null;
    reason?: string | null;
  };
}

// ============================================================================
// SUBSCRIPTIONS
// ============================================================================

export type SubscriptionTier = 'FREE' | 'VIP' | 'ROYAL';

export type SubscriptionProvider =
  | 'STRIPE'
  | 'GOOGLE'
  | 'APPLE'
  | 'NONE';

export interface UserSubscriptions {
  userId: string;

  // Some callsites want a single "tier" field - keep optional for backward compat
  tier?: SubscriptionTier;

  vipActive: boolean;
  vipPlanId: string | null;
  vipProvider: SubscriptionProvider;
  vipCurrentPeriodEnd: string | null; // ISO_DATETIME

  royalActive: boolean;
  royalPlanId: string | null;
  royalProvider: SubscriptionProvider;
  royalCurrentPeriodEnd: string | null; // ISO_DATETIME

  // createdAt missing in helper return - make optional
  createdAt?: Timestamp;

  updatedAt: Timestamp;
}

// ============================================================================
// USER BENEFITS
// ============================================================================

export interface UserBenefits {
  vipActive: boolean;
  royalActive: boolean;
  callDiscountFactor: number; // 1.0 = no discount
}

// Call discount factors
export const CALL_DISCOUNT_NONE = 1.0;
export const CALL_DISCOUNT_VIP = 0.9;
export const CALL_DISCOUNT_ROYAL = 0.8;

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

// Web Token Checkout
export interface CreateTokenCheckoutRequest {
  userId: string;
  packageId: TokenPackageId;
  locale: string;

  // pack302-web-billing destructures this
  currencyOverride?: string | null;
}

export interface CreateTokenCheckoutResponse {
  checkoutUrl: string;
  sessionId: string;

  // Optional metadata (kept optional so callsites can add later without breaking)
  packageId?: TokenPackageId;
  tokens?: number;
  priceUSD?: number;
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
  packageId?: TokenPackageId;
  tokensAdded: number;
  newBalance: number;
  transactionId: string;
}

// Web Subscription Checkout
export interface CreateSubscriptionCheckoutRequest {
  userId: string;
  tier: Exclude<SubscriptionTier, 'FREE'>;
  locale: string;
}

export interface CreateSubscriptionCheckoutResponse {
  checkoutUrl: string;
  sessionId: string;
  tier?: Exclude<SubscriptionTier, 'FREE'>;
}

// Mobile Subscription Sync
export type SubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'EXPIRED';

export interface SyncMobileSubscriptionRequest {
  userId: string;
  platform: MobilePlatform;
  tier: Exclude<SubscriptionTier, 'FREE'>;
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
  packageId?: TokenPackageId;
  tier?: Exclude<SubscriptionTier, 'FREE'>;
  externalId?: string;
  timestamp: Timestamp;
}

// ============================================================================
// USD CANONICAL CURRENCY CONFIG (minimal contract)
// ============================================================================

export const REGION_DEFAULT_CURRENCY: Record<string, string> = {
  'pl-PL': 'USD',
  'en-US': 'USD',
  'en-GB': 'USD',
  'de-DE': 'USD',
  'fr-FR': 'USD',
  'es-ES': 'USD',
  'it-IT': 'USD',
};

export const CURRENCY_CONFIGS: Record<string, { code: 'USD'; symbol: '$' }> = {
  USD: { code: 'USD', symbol: '$' },
};
"@

Set-Content $pack302 $pack302Content -NoNewline
Write-Host "[OK] Rewrote: $pack302"

Write-Host "[BUILD] Running: npm run build (functions)"
cd "$repo\functions"
npm run build