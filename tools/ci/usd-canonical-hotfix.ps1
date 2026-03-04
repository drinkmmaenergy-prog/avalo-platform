param(
  [string]$RepoRoot = "C:\a\avalo"
)

$ErrorActionPreference = "Stop"

function Write-Info($m){ Write-Host "[INFO] $m" -ForegroundColor Cyan }
function Write-Warn($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Write-Ok($m){ Write-Host "[OK]   $m" -ForegroundColor Green }

function Ensure-Dir([string]$p){
  New-Item -ItemType Directory -Force -Path $p | Out-Null
}

function Write-FileUtf8NoBom([string]$path, [string]$content){
  $dir = Split-Path $path
  if ($dir) { Ensure-Dir $dir }
  [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

function Patch-TsconfigExcludeLegacy([string]$tsconfigPath){
  if (!(Test-Path $tsconfigPath)) { Write-Warn "Missing $tsconfigPath (skip)"; return }

  $raw = Get-Content $tsconfigPath -Raw

  # If exclude exists, append patterns if missing; else create exclude
  $patterns = @(
    "**/*.legacy.ts",
    "**/*.legacy.tsx",
    "**/*.legacy.d.ts",
    "**/*.legacy.js"
  )

  if ($raw -match '"exclude"\s*:\s*\[') {
    foreach($p in $patterns){
      if ($raw -notmatch [regex]::Escape($p)) {
        # Insert before closing bracket of exclude array
        $raw = [regex]::Replace($raw, '("exclude"\s*:\s*\[[^\]]*)\]', ('$1,' + "`n    ""$p""" + "`n  ]"), 1)
      }
    }
  } else {
    # Insert exclude before last closing brace
    $excludeBlock = "`n  ,""exclude"": [`n    ""**/*.legacy.ts"",`n    ""**/*.legacy.tsx"",`n    ""**/*.legacy.d.ts"",`n    ""**/*.legacy.js""`n  ]`n"
    $raw = [regex]::Replace($raw, '\n\}\s*$', $excludeBlock + "}`n")
  }

  Write-FileUtf8NoBom $tsconfigPath $raw
  Write-Ok "Patched tsconfig exclude legacy: $tsconfigPath"
}

function Ensure-Pack106Types([string]$functionsSrc){
  $path = Join-Path $functionsSrc "pack106-types.ts"
  $content = @"
/**
 * PACK 106 — Currency Types (USD-only Canonical)
 *
 * Avalo rule:
 * - Production logic is USD-only.
 * - Any FX/display conversion is UI-only and MUST NOT affect accounting.
 *
 * This file exists to satisfy imports from legacy currency modules while keeping USD-only truth.
 */

export type CurrencyCode = "USD";

export interface CurrencyProfile {
  currency: CurrencyCode;
  name: string;
  symbol: string;
  decimalPlaces: number;
  enabled: boolean;
  countries?: string[];
}

export interface StorefrontBundle {
  id: string;
  title: string;
  tokens: number;
  priceUSD: number;
  currency: CurrencyCode;
}

export interface LocalizedStorefront {
  currency: CurrencyCode;
  name: string;
  symbol: string;
  fxRate: number;       // always 1.0 for USD-only
  taxIncluded: boolean; // UI concern, keep false by default
  bundles: StorefrontBundle[];
  updatedAtISO: string;
}

export const USD_PROFILE: CurrencyProfile = {
  currency: "USD",
  name: "US Dollar",
  symbol: "$",
  decimalPlaces: 2,
  enabled: true,
  countries: ["US","PL","DE","FR","ES","IT","NL","BE","AT","PT","IE","FI","SE","DK","NO","GB","UK","CA","AU"]
};

export const SUPPORTED_CURRENCIES: CurrencyProfile[] = [USD_PROFILE];
"@
  Write-FileUtf8NoBom $path $content
  Write-Ok "Ensured: $path"
}

function Ensure-Pack302Types([string]$functionsSrc){
  $path = Join-Path $functionsSrc "pack302-types.ts"
  $content = @"
/**
 * PACK 302 — Billing Types (USD-only Canonical)
 *
 * This module previously described multi-currency billing helpers.
 * Avalo is USD-canonical: all settlement/accounting values are USD.
 * UI may display localized numbers, but business logic remains USD-only.
 */

export type BillingCurrency = "USD";

export interface Money {
  currency: BillingCurrency;
  amount: number; // USD
}

export interface BillingLineItem {
  name: string;
  quantity: number;
  unitPrice: Money;
  total: Money;
}

export interface BillingSummary {
  subtotal: Money;
  tax: Money;
  total: Money;
}

export const USD: BillingCurrency = "USD";

export function money(amount: number): Money {
  return { currency: "USD", amount };
}
"@
  Write-FileUtf8NoBom $path $content
  Write-Ok "Ensured: $path"
}

function Ensure-Pack425PricingMatrix([string]$functionsSrc){
  $path = Join-Path $functionsSrc "pack425-pricing-matrix.ts"
  $content = @"
/**
 * PACK 425 — Pricing Matrix (USD-only Canonical Adapter)
 *
 * Original module provided regional pricing profiles.
 * Avalo is USD-only in production logic.
 * This adapter satisfies imports and keeps signatures stable.
 */

export type PaymentCurrency = "USD";

export interface CountryPaymentProfile {
  countryCode: string;
  currency: PaymentCurrency;      // USD only
  purchasingPowerIndex: number;   // keep for analytics; default 1.0
  payoutEnabled: boolean;         // policy flag
  monetizationRestricted?: boolean;
}

export async function getCountryPaymentProfile(countryCode: string): Promise<CountryPaymentProfile> {
  return {
    countryCode: (countryCode || "US").toUpperCase(),
    currency: "USD",
    purchasingPowerIndex: 1.0,
    payoutEnabled: false,
    monetizationRestricted: false
  };
}

export async function createCountryPaymentProfile(
  countryCode: string,
  currency: PaymentCurrency,
  profile: Omit<CountryPaymentProfile, "countryCode" | "currency">
): Promise<CountryPaymentProfile> {
  return {
    countryCode: (countryCode || "US").toUpperCase(),
    currency: "USD",
    purchasingPowerIndex: profile.purchasingPowerIndex ?? 1.0,
    payoutEnabled: profile.payoutEnabled ?? false,
    monetizationRestricted: profile.monetizationRestricted ?? false
  };
}
"@
  Write-FileUtf8NoBom $path $content
  Write-Ok "Ensured: $path"
}

function Rewrite-PayoutsConfig([string]$functionsSrc){
  $path = Join-Path $functionsSrc "config\payouts.config.ts"
  $content = @"
/**
 * PAYOUTS CONFIG (USD-CANONICAL)
 *
 * Canonical rules:
 * - Accounting is USD-only.
 * - No PLN/EUR/GBP in production logic.
 * - Platform payout fee is charged to the payout flow (creator side), not subsidized by Avalo.
 */

import { db } from "../init";
import { TOKEN_PAYOUT_USD } from "./economyConfig";

export type PayoutMethodType =
  | "STRIPE"
  | "WISE"
  // Legacy identifiers still referenced in code paths:
  | "BANK_TRANSFER"
  | "STRIPE_CONNECT";

export type PayoutStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  // payoutRequests.ts compares with REJECTED:
  | "REJECTED";

export type PayoutCurrency = "USD";

export interface PayoutConfig {
  // Primary settings
  defaultRail: PayoutMethodType;
  payoutCurrency: PayoutCurrency;

  // Limits
  MIN_PAYOUT_TOKENS: number;
  MAX_PAYOUT_METHODS_PER_USER: number;

  // Fee model
  payoutFeePlatformPercent: number; // 0.05 => 5%

  // Canonical token->USD rate for payout calculations (display/requests validation)
  PAYOUT_TOKEN_TO_USD_RATE: number; // must equal TOKEN_PAYOUT_USD (0.03)

  // Compatibility arrays referenced in payoutRequests.ts
  SUPPORTED_PAYOUT_METHODS: readonly PayoutMethodType[];
  SUPPORTED_CURRENCIES: readonly PayoutCurrency[];

  // Status transitions referenced in payoutRequests.ts
  ALLOWED_STATUS_TRANSITIONS: Record<PayoutStatus, readonly PayoutStatus[]>;
}

export const PAYOUT_CONFIG: PayoutConfig = {
  defaultRail: "STRIPE",
  payoutCurrency: "USD",

  MIN_PAYOUT_TOKENS: 1000,
  MAX_PAYOUT_METHODS_PER_USER: 3,

  payoutFeePlatformPercent: 0.05,

  PAYOUT_TOKEN_TO_USD_RATE: TOKEN_PAYOUT_USD,

  SUPPORTED_PAYOUT_METHODS: ["STRIPE","WISE","BANK_TRANSFER","STRIPE_CONNECT"] as const,
  SUPPORTED_CURRENCIES: ["USD"] as const,

  ALLOWED_STATUS_TRANSITIONS: {
    PENDING: ["PROCESSING","REJECTED","FAILED"] as const,
    PROCESSING: ["COMPLETED","FAILED"] as const,
    COMPLETED: [] as const,
    FAILED: [] as const,
    REJECTED: [] as const
  }
};

/**
 * Firestore bootstrapper for payout_config/global.
 */
export async function ensurePayoutConfig(): Promise<PayoutConfig> {
  const ref = db.collection("payout_config").doc("global");
  const snap = await ref.get();

  if (snap.exists) {
    const data = snap.data() as Partial<PayoutConfig> | undefined;
    if (data?.payoutCurrency === "USD") {
      return { ...PAYOUT_CONFIG, ...data } as PayoutConfig;
    }
  }

  await ref.set(PAYOUT_CONFIG, { merge: false });
  return PAYOUT_CONFIG;
}
"@
  Write-FileUtf8NoBom $path $content
  Write-Ok "Rewrote: $path"
}

function Patch-ValidatePurchaseSignature([string]$functionsSrc){
  $path = Join-Path $functionsSrc "pack277-token-packs.ts"
  if (!(Test-Path $path)) { Write-Warn "Missing $path (skip)"; return }

  $raw = Get-Content $path -Raw

  # If validatePurchase exists with 2 args, expand to optional 3rd.
  # We do a conservative regex replace on function declaration line only.
  $raw2 = [regex]::Replace(
    $raw,
    'export\s+async\s+function\s+validatePurchase\s*\(\s*userId\s*:\s*string\s*,\s*packId\s*:\s*string\s*\)',
    'export async function validatePurchase(userId: string, packId: string, paymentIntentId?: string)'
  )

  if ($raw2 -ne $raw) {
    Write-FileUtf8NoBom $path $raw2
    Write-Ok "Patched validatePurchase signature (optional paymentIntentId) in: $path"
  } else {
    Write-Warn "validatePurchase signature not patched (pattern not found). You may need manual check: $path"
  }
}

function Run-Build([string]$functionsRoot){
  Push-Location $functionsRoot
  try {
    Write-Info "Running: npm run build"
    npm run build | Out-Host
  } finally {
    Pop-Location
  }
}

# -------------------------
# MAIN
# -------------------------
$functionsRoot = Join-Path $RepoRoot "functions"
$functionsSrc  = Join-Path $functionsRoot "src"
$tsconfigBuild = Join-Path $functionsRoot "tsconfig.build.json"

Write-Info "RepoRoot: $RepoRoot"
Write-Info "Patching tsconfig.build.json to exclude *.legacy.*"
Patch-TsconfigExcludeLegacy $tsconfigBuild

Write-Info "Ensuring adapter modules (USD-only)"
Ensure-Pack106Types $functionsSrc
Ensure-Pack302Types $functionsSrc
Ensure-Pack425PricingMatrix $functionsSrc

Write-Info "Rewriting payouts.config.ts to match callsites (payoutRequests/types)"
Rewrite-PayoutsConfig $functionsSrc

Write-Info "Patching pack277-token-packs validatePurchase signature"
Patch-ValidatePurchaseSignature $functionsSrc

Write-Info "Build"
Run-Build $functionsRoot

Write-Ok "USD Canonical Hotfix complete."
