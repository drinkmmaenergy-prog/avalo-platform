param()

$ErrorActionPreference = "Stop"

function Find-RepoRoot {
  $p = (Get-Location).Path
  while ($true) {
    if (Test-Path (Join-Path $p "pnpm-workspace.yaml") -PathType Leaf) { return $p }
    if (Test-Path (Join-Path $p ".git") -PathType Container) { return $p }
    $parent = Split-Path $p -Parent
    if ($parent -eq $p) { throw "Repo root not found. Run from inside repo." }
    $p = $parent
  }
}

$RepoRoot = Find-RepoRoot
Write-Host "[INFO] RepoRoot: $RepoRoot"

$FunctionsRoot = Join-Path $RepoRoot "functions"
$Src = Join-Path $FunctionsRoot "src"

if (!(Test-Path $FunctionsRoot)) { throw "Missing functions folder: $FunctionsRoot" }
if (!(Test-Path $Src)) { throw "Missing functions/src folder: $Src" }

# -----------------------------------------------------------------------------
# 1) Overwrite PACK302 types to match existing callsites (helpers/billing)
#    Key: keep tokensBalance + txId + vipCurrentPeriodEnd as string|null
# -----------------------------------------------------------------------------
$pack302Path = Join-Path $Src "pack302-types.ts"
Write-Host "[INFO] Writing: $pack302Path"

$pack302 = @"
/**
 * PACK 302 — Unified Token & Subscription Checkout (USD Canonical)
 * Types and Interfaces
 *
 * RULES (SoT):
 * - Canonical currency for ALL economics is USD.
 * - No PLN/EUR/GBP logic in production backend.
 * - Creator payout is defined ONLY in economyConfig.ts (TOKEN_PAYOUT_USD = 0.03).
 */

import { Timestamp } from 'firebase-admin/firestore';
import { TOKEN_PAYOUT_USD } from './config/economyConfig';

// ============================================================================
// TOKEN PACKAGES (USD)
// ============================================================================

export type TokenPackageId =
  | 'mini'
  | 'basic'
  | 'standard'
  | 'premium'
  | 'pro'
  | 'elite'
  | 'royal';

export interface TokenPackage {
  id: TokenPackageId;
  tokens: number;
  priceUSD: number;
  active: boolean;
  order: number;
  popularBadge?: boolean;
}

/**
 * Final Token Packages (Stripe / USD)
 */
export const TOKEN_PACKAGES: Record<TokenPackageId, TokenPackage> = {
  mini:     { id: 'mini',     tokens: 100,   priceUSD: 9.99,   active: true, order: 1 },
  basic:    { id: 'basic',    tokens: 300,   priceUSD: 26.99,  active: true, order: 2 },
  standard: { id: 'standard', tokens: 500,   priceUSD: 42.99,  active: true, order: 3, popularBadge: true },
  premium:  { id: 'premium',  tokens: 1000,  priceUSD: 76.99,  active: true, order: 4 },
  pro:      { id: 'pro',      tokens: 2000,  priceUSD: 147.99, active: true, order: 5 },
  elite:    { id: 'elite',    tokens: 5000,  priceUSD: 353.99, active: true, order: 6 },
  royal:    { id: 'royal',    tokens: 10000, priceUSD: 674.99, active: true, order: 7 },
};

// ============================================================================
// WALLET
// ============================================================================

export interface UserWallet {
  userId: string;

  // IMPORTANT: keep tokensBalance name because pack302-helpers uses it
  tokensBalance: number;

  lifetimePurchasedTokens: number;
  lifetimeEarnedTokens: number;
  lifetimeWithdrawnTokens: number;

  createdAt: Timestamp;
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

export interface WalletTransactionMeta {
  packageId?: TokenPackageId | null;
  chatId?: string | null;
  threadId?: string | null;
  bookingId?: string | null;
  eventId?: string | null;
  reason?: string | null;
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  receiptId?: string | null;
}

export interface WalletTransaction {
  // IMPORTANT: keep txId name because pack302-helpers uses it
  txId: string;
  userId: string;

  type: WalletTransactionType;
  direction: WalletTransactionDirection;

  amountTokens: number;
  externalId: string | null;
  provider: WalletTransactionProvider;

  createdAt: Timestamp;
  meta: WalletTransactionMeta;
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

export type SubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'EXPIRED';

export interface UserSubscriptions {
  userId: string;
  tier: SubscriptionTier;

  vipActive: boolean;
  vipPlanId: string | null;
  vipProvider: SubscriptionProvider;
  // IMPORTANT: keep string because pack302-helpers currently passes string
  vipCurrentPeriodEnd: string | null;

  royalActive: boolean;
  royalPlanId: string | null;
  royalProvider: SubscriptionProvider;
  // IMPORTANT: keep string because pack302-helpers currently passes string
  royalCurrentPeriodEnd: string | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// USER BENEFITS
// ============================================================================

export interface UserBenefits {
  vipActive: boolean;
  royalActive: boolean;
  callDiscountFactor: number;
}

// ============================================================================
// API TYPES (exports required by pack302-web-billing / pack302-mobile-billing)
// ============================================================================

export interface CreateTokenCheckoutRequest {
  userId: string;
  packageId: TokenPackageId;
  locale: string;
}

export interface CreateTokenCheckoutResponse {
  checkoutUrl: string;
  sessionId: string;
  packageId: TokenPackageId;
  tokens: number;
  priceUSD: number;
}

export type MobilePlatform = 'GOOGLE' | 'APPLE';

export interface VerifyMobilePurchaseRequest {
  userId: string;
  platform: MobilePlatform;
  packageId: TokenPackageId;
  receipt: string;
}

export interface VerifyMobilePurchaseResponse {
  success: boolean;
  packageId: TokenPackageId;
  tokensAdded: number;
  newBalance: number;
  transactionId: string;
}

export interface CreateSubscriptionCheckoutRequest {
  userId: string;
  tier: Exclude<SubscriptionTier, 'FREE'>;
  locale: string;
}

export interface CreateSubscriptionCheckoutResponse {
  checkoutUrl: string;
  sessionId: string;
  tier: Exclude<SubscriptionTier, 'FREE'>;
}

export interface SyncMobileSubscriptionRequest {
  userId: string;
  platform: MobilePlatform;
  tier: Exclude<SubscriptionTier, 'FREE'>;
  status: SubscriptionStatus;
  currentPeriodEnd: string; // keep ISO string to match callsites
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
  amountUSD?: number;
  tokens?: number;
  packageId?: TokenPackageId;
  tier?: SubscriptionTier;
  externalId?: string;
  timestamp: Timestamp;
}

// ============================================================================
// ECONOMY CONSTANTS (USD CANONICAL)
// ============================================================================

export const PAYOUT_PER_TOKEN_USD = TOKEN_PAYOUT_USD;

export const CALL_DISCOUNT_NONE = 1.0;
export const CALL_DISCOUNT_VIP = 0.9;
export const CALL_DISCOUNT_ROYAL = 0.8;

export const VOICE_CALL_BASE_RATE_TOKENS_PER_MIN = 10;
export const VIDEO_CALL_BASE_RATE_TOKENS_PER_MIN = 20;

export const CANONICAL_CURRENCY = 'USD' as const;
"@

Set-Content -Path $pack302Path -Value $pack302 -Encoding UTF8

# -----------------------------------------------------------------------------
# 2) PACK289: export TOKEN_PAYOUT_USD so withdrawals-admin can import it
# -----------------------------------------------------------------------------
$pack289Path = Join-Path $Src "pack289-withdrawals.ts"
if (Test-Path $pack289Path) {
  Write-Host "[INFO] Patching export TOKEN_PAYOUT_USD in: $pack289Path"
  $text = Get-Content $pack289Path -Raw -Encoding UTF8

  # If already exported, skip
  if ($text -match "export\s*\{\s*TOKEN_PAYOUT_USD\s*\}") {
    Write-Host "[OK]   TOKEN_PAYOUT_USD already exported."
  } else {
    # Ensure we add export after import line that contains TOKEN_PAYOUT_USD
    if ($text -match "import\s*\{\s*TOKEN_PAYOUT_USD\s*\}\s*from\s*'./config/economyConfig';") {
      $text = $text -replace "import\s*\{\s*TOKEN_PAYOUT_USD\s*\}\s*from\s*'./config/economyConfig';",
        "import { TOKEN_PAYOUT_USD } from './config/economyConfig';`n`nexport { TOKEN_PAYOUT_USD };"
      Set-Content -Path $pack289Path -Value $text -Encoding UTF8
      Write-Host "[OK]   Added: export { TOKEN_PAYOUT_USD };"
    } else {
      Write-Host "[WARN] Could not find TOKEN_PAYOUT_USD import in pack289-withdrawals.ts. Skipping."
    }
  }
} else {
  Write-Host "[WARN] Missing: $pack289Path (skipping)"
}

# -----------------------------------------------------------------------------
# 3) PACK106: add missing fields via interface merging (safe)
# -----------------------------------------------------------------------------
$pack106Types = Join-Path $Src "pack106-types.ts"
if (Test-Path $pack106Types) {
  Write-Host "[INFO] Ensuring PACK106 extra fields via merging: $pack106Types"
  $t = Get-Content $pack106Types -Raw -Encoding UTF8

  $mergeBlock = @"

//
// AUTO-MERGE HOTFIX (USD canonical build compatibility)
// Do not remove unless you also refactor pack106-admin callsites.
//

export interface BaseTokenPriceConfig {
  referenceCurrency?: 'USD';
}

export interface CurrencyDashboardStats {
  staleRates?: number;
  lastRefresh?: any;
  activeCurrencies?: number;
}
"@

  if ($t -notmatch "AUTO-MERGE HOTFIX \(USD canonical build compatibility\)") {
    $t = $t.TrimEnd() + "`n" + $mergeBlock + "`n"
    Set-Content -Path $pack106Types -Value $t -Encoding UTF8
    Write-Host "[OK]   Added merge block for BaseTokenPriceConfig/CurrencyDashboardStats."
  } else {
    Write-Host "[OK]   Merge block already present."
  }
} else {
  Write-Host "[WARN] Missing: $pack106Types (skipping)"
}

# -----------------------------------------------------------------------------
# 4) Build verification
# -----------------------------------------------------------------------------
Write-Host "[INFO] Running: npm run build (functions)"
Push-Location $FunctionsRoot
try {
  npm run build
} finally {
  Pop-Location
}

Write-Host "[OK] monetization-autofix complete."