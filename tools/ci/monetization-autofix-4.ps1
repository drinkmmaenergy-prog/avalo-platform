$ErrorActionPreference = "Stop"

$repo = "C:\a\avalo"
$src  = "$repo\functions\src"

Write-Host "=== monetization-autofix-4 ==="

# ------------------------------------------------
# PATCH PACK106 TYPES
# ------------------------------------------------

$pack106 = "$src\pack106-types.ts"
$text = Get-Content $pack106 -Raw

$text = $text -replace "approvals\?: \{","approvals?: {
    admin1?: string;"

$text = $text -replace "export interface CurrencyDashboardStats \{","export interface CurrencyDashboardStats {
  fxVarianceWarnings?: number;"

Set-Content $pack106 $text

Write-Host "PACK106 patched"

# ------------------------------------------------
# PATCH PACK302 TYPES
# ------------------------------------------------

$pack302 = "$src\pack302-types.ts"
$text = Get-Content $pack302 -Raw

$text = $text -replace "symbol: '\$'","symbol: '$',
    conversionRate: 1"

Set-Content $pack302 $text

Write-Host "PACK302 patched"

# ------------------------------------------------
# BUILD
# ------------------------------------------------

cd "$repo\functions"

Write-Host "Running build..."
npm run build