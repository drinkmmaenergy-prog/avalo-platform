$ErrorActionPreference = "Stop"

$repo = "C:\a\avalo"
$src = "$repo\functions\src"

Write-Host "PATCH PACK106 TYPES"

$pack106 = "$src\pack106-types.ts"
$text = Get-Content $pack106 -Raw

$text = $text -replace "export interface BaseTokenPriceConfig {","export interface BaseTokenPriceConfig {
  updatedBy?: string;
  referenceCurrency?: 'USD';"

$text = $text -replace "export interface CurrencyDashboardStats {","export interface CurrencyDashboardStats {
  staleRates?: number;
  topCurrencies?: string[];
  lastRefresh?: FirebaseFirestore.Timestamp;"

Set-Content $pack106 $text

Write-Host "PATCH PACK302 TYPES"

$pack302 = "$src\pack302-types.ts"
$text = Get-Content $pack302 -Raw

if ($text -notmatch "REGION_DEFAULT_CURRENCY") {

$text += @"

export const REGION_DEFAULT_CURRENCY: Record<string,string> = {
  'pl-PL': 'USD',
  'en-US': 'USD',
  'en-GB': 'USD',
  'de-DE': 'USD'
};

export const CURRENCY_CONFIGS = {
  USD: {
    code: 'USD',
    symbol: '$'
  }
};

"@
}

$text = $text -replace "createdAt: Timestamp;","createdAt?: Timestamp;"

$text = $text -replace "packageId: TokenPackageId;","packageId?: TokenPackageId;"

$text = $text -replace "tokens: number;","tokens?: number;"

$text = $text -replace "priceUSD: number;","priceUSD?: number;"

$text = $text -replace "tier: Exclude<SubscriptionTier, 'FREE'>;","tier?: Exclude<SubscriptionTier, 'FREE'>;"

Set-Content $pack302 $text

Write-Host "RUN BUILD"

cd "$repo\functions"
npm run build